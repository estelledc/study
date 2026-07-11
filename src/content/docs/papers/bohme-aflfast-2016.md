---
title: AFLFast — 把 fuzzing 的力气花在更少人走的路径上
来源: 'Marcel Böhme, Van-Thuan Pham, Abhik Roychoudhury, "Coverage-based Greybox Fuzzing as Markov Chain", CCS 2016'
日期: 2026-05-29
分类: security-privacy
难度: 中级
---

## 是什么

AFLFast 是一篇把 **coverage-guided greybox fuzzing** 看成马尔可夫链的论文：它问的不是"怎么变异输入"，而是"队列里这么多种子，下一轮该给谁多少尝试次数"。

日常类比：你在一个陌生城市找隐藏小店。普通做法是每条街都逛差不多久；AFLFast 说，游客最多的主街已经被逛烂了，真正值得多花时间的是人少、分叉多、可能通向新街区的小巷。

在 fuzzing 里，"街区"就是程序路径，"游客数量"就是已有测试用例反复命中的次数。AFLFast 用一个 power schedule 把更多能量给低频路径，把少一点能量给高频路径，于是同样时间内更容易走到新路径和新崩溃。

这篇的好处是把一个很工程的经验判断说清楚：不是每个 seed 都同样值得继续喂时间，调度本身就是算法。

## 为什么重要

不理解 AFLFast，下面这些事都很难解释：

- 为什么 AFL 这种不做重型程序分析的工具，仍然能在真实软件里持续挖出漏洞。
- 为什么 fuzzing 性能不只取决于 mutation 算子，还取决于"先 fuzz 谁、fuzz 多久"。
- 为什么低频路径通常比高频错误处理路径更值钱，因为那里更可能藏着没测过的行为。
- 为什么后来的 AFL++、libFuzzer、honggfuzz 都把调度器当成核心部件，而不只是附属参数。

这也解释了安全测试里的一个常见矛盾：工具很快，但时间仍然不够用。AFLFast 的贡献就是把"快"进一步变成"快得更有方向"。

## 核心要点

1. **把种子队列看成一群随机行走者**。类比：每个测试输入都是一个拿着地图的人，从当前街区随机拐弯。论文把"从路径 i 的输入变异到路径 j"建模成转移概率 `p_ij`。

2. **能量就是给一个种子多少次机会**。类比：给某条街安排多少巡逻员。AFLFast 不改变异规则，只改 `assignEnergy`：低频路径多给机会，高频路径少给机会。

3. **指数 schedule 是经验上最有效的折中**。类比：第一次只是轻轻试探，确认这里确实冷门后再加大投入。公式里 `s(i)` 让能量随选择次数增长，`f(i)` 让已经被大量命中的路径自动降权。

## 实践案例

### 案例 1：为什么同一个 seed 不该永远给同样预算

```python
def afl_energy(seed):
    return 80000  # 简化版：每次都给固定尝试次数

def aflfast_energy(seed):
    return min((2 ** seed.times_chosen) / seed.path_hits, seed.max_energy)
```

逐部分解释：

- `times_chosen` 越大，说明这个种子已经被多次抽到；如果还没榨干，就逐步加预算。
- `path_hits` 越大，说明它所在路径已经被很多测试打过；继续砸预算的边际收益低。
- `max_energy` 是刹车，避免指数增长把全部时间吃掉。

### 案例 2：高频路径为什么会浪费时间

```python
def parse_png(data):
    if not data.startswith(b"\x89PNG"):
        return "reject_fast"
    return parse_chunks(data)
```

逐部分解释：

- 随机变异图片时，大量输入连 magic bytes 都过不了，只会走 `reject_fast`。
- 如果 fuzzer 继续围着这些无效输入打转，它看到的是"覆盖率没变、崩溃也没来"。
- AFLFast 的直觉是：快速拒绝路径已经很拥挤，要把预算挪给能进入 `parse_chunks` 的输入。

### 案例 3：只改调度，不改变异器

```python
while time_left():
    seed = choose_next(queue)      # AFLFast 改这里：优先低频、少选过的 seed
    energy = assign_energy(seed)   # AFLFast 改这里：决定 fuzz 多少轮
    for _ in range(energy):
        test = mutate(seed.bytes)  # mutation 仍然沿用 AFL
        run_and_keep_if_interesting(test)
```

逐部分解释：

- `mutate` 没变，所以 AFLFast 的新发现不是来自"更聪明地改字节"。
- `choose_next` 让队列顺序更偏向低频路径，减少在热路径排队。
- `assign_energy` 决定每个 seed 的预算，这正是论文所谓 power schedule。

## 踩过的坑

1. **把 AFLFast 理解成新 mutation 算法**：它主要改 seed 调度和能量分配，mutation 算子仍沿用 AFL，所以贡献点在"资源怎么花"。

2. **以为低频路径一定更危险**：低频只是更少被探索，不等于一定有漏洞；它是更好的搜索启发式，不是安全证明。

3. **忽略 `f(i)` 的近似性质**：真实转移概率 `p_ij` 不可知，论文用路径命中次数近似 stationary distribution，工程上有效但会受哈希碰撞和路径粒度影响。

4. **只看 unique crash 数量**：unique crash 仍需人工去重和复现；论文也把 CVE 暴露时间、路径覆盖和独立评估一起看，避免单指标误导。

## 适用 vs 不适用场景

**适用**：

- 目标程序输入格式复杂，随机变异经常卡在错误处理路径。
- 已经有 coverage-guided fuzzer，想在不引入 SMT / taint 分析的情况下提速。
- 安全回归、CI fuzzing、长期 fuzz farm，需要单位时间内发现更多路径和崩溃。

**不适用**：

- 关键分支需要满足精确校验和或魔数，随机变异几乎永远过不去；这时要配合字典、taint 或符号执行。
- 目标程序覆盖反馈质量很差，例如 instrumentation 不稳定、路径哈希冲突过多。
- 你要的是漏洞可利用性证明；AFLFast 只负责更快找到可疑输入，不负责证明攻击链。

## 历史小故事（可跳过）

- **1990 年**：Miller 团队用随机输入测试 UNIX 工具，fuzzing 这个名字开始进入软件可靠性研究。
- **2013 年前后**：AFL 把轻量级覆盖反馈、种子队列和变异策略工程化，成为安全研究常用工具。
- **2016 年**：Böhme、Pham、Roychoudhury 在 CCS 提出 AFLFast，用马尔可夫链解释为什么调度 seed 能显著提速。
- **2017 年以后**：同一研究线继续发展出 directed greybox fuzzing，让 fuzzer 不只追新路径，还能朝指定代码位置前进。
- **今天**：AFL++、libFuzzer、honggfuzz 的调度策略都能看到这篇的影子：fuzzing 不只是乱撞，而是预算分配问题。

## 学到什么

1. **fuzzing 的核心资源是时间**：mutation 每秒能跑很多次，但跑在错误 seed 上就会被高频路径吞掉。
2. **覆盖率反馈可以变成调度信号**：路径命中次数不只是统计数字，还能指导下一轮搜索。
3. **轻量模型也能改变工程结果**：马尔可夫链模型不需要精确知道所有概率，只要指出"高频路径过热"这个结构性问题。
4. **效率和有效性要分开看**：AFLFast 理论上找的是同一类漏洞，但能更早暴露它们，这对有限时间的安全测试非常关键。

一句话记忆：AFLFast 没给 fuzzer 新眼睛，而是给它一个更会分配体力的节奏表。

## 延伸阅读

- 论文 PDF：[Coverage-based Greybox Fuzzing as Markov Chain](https://mboehme.github.io/paper/CCS16.pdf) —— 原始 CCS 2016 版本，12 页，直接看 abstract 和 evaluation 就能抓住主线。
- 元数据：[ACM DOI 10.1145/2976749.2978428](https://dl.acm.org/doi/10.1145/2976749.2978428) —— 会议版本，页码 1032-1043。
- [[cadar-klee-2008]] —— KLEE 代表符号执行路线，和 AFLFast 的轻量 greybox 路线形成对照。
- [[driller-2016]] —— 把 fuzzing 和选择性符号执行结合，专门处理 AFL 卡住的深分支。
- [[aflgo-2017]] —— Directed Greybox Fuzzing，把"多走新路径"进一步改成"朝目标位置走"。
- [[fairfuzz-2018]] —— 后续代表作之一，继续围绕稀有分支分配 mutation 力气。

## 关联

- [[cadar-klee-2008]] —— 符号执行能系统求输入，AFLFast 则用低成本反馈提升随机搜索效率。
- [[z3-2008]] —— KLEE / Driller 背后依赖 SMT 求解器，AFLFast 刻意避开这类重分析。
- [[minisat-2003]] —— SAT / SMT 是白盒测试的底层算力来源，用来对比 greybox fuzzing 的速度取舍。
- [[nelson-oppen-1979]] —— 理论上支撑 SMT 多 theory 组合，解释为什么符号执行强但贵。
- [[saltzer-schroeder-1975]] —— 安全工程里"机制越简单越可靠"的思想，和 AFLFast 的轻量改动气质相近。
- [[foundry]] —— 智能合约 fuzzing 场景同样关心随机输入如何覆盖更多有意义状态。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aflgo-2017]] —— AFLGo — 让灰盒 fuzzing 朝目标代码前进
- [[driller-2016]] —— Driller 2016 — 用符号执行给 fuzzing 打穿深分支
- [[fairfuzz-2018]] —— FairFuzz 2018 — 保护关键字节，让 fuzzing 往深处走
