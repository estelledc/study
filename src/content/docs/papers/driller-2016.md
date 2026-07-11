---
title: Driller 2016 — 用符号执行给 fuzzing 打穿深分支
来源: 'Nick Stephens, John Grosen, Christopher Salls, Andrew Dutcher, Ruoyu Wang, Jacopo Corbetta, Yan Shoshitaishvili, Christopher Kruegel, Giovanni Vigna, "Driller: Augmenting Fuzzing Through Selective Symbolic Execution", NDSS 2016'
日期: 2026-07-09
分类: security-privacy
难度: 中级
---

## 是什么

Driller 是一个自动挖二进制漏洞的系统：平时让 AFL 这类 fuzzer 高速乱试，等 fuzzer 卡在精确输入检查前，再用选择性符号执行算出能过关的新输入。

日常类比：你在玩一栋大楼的密室逃脱。大部分房间可以靠乱翻抽屉快速找线索，这就是 fuzzing；但有些门必须输入 32 位密码，乱猜几乎不可能，这时 Driller 才请“数学开锁师”来算密码。

这篇论文的核心不是“符号执行比 fuzzing 强”，而是两者各做擅长的事：fuzzer 负责便宜地探索一个区域，符号执行只负责把它送进下一个区域。

作者把这些区域叫 **compartment**。输入检查、魔数、命令名、哈希等精确条件会把程序切成多个 compartment，深层漏洞常常藏在后面的 compartment 里。

## 为什么重要

不理解 Driller，下面这些事会很难解释：

- 为什么 AFL 很快，却会被 `if (x == 0x0123ABCD)` 这种简单分支挡住，因为随机变异命中特定 32 位值的概率太低。
- 为什么纯符号执行能解精确条件，却会在解析器、循环和状态机里路径爆炸，因为每个符号分支都可能复制一份状态。
- 为什么现代漏洞挖掘常走 hybrid fuzzing 路线，因为“快探索”和“会解题”本来就是两种互补能力。
- 为什么 DARPA Cyber Grand Challenge 这类二进制评测适合 Driller，因为题目有复杂协议、深层状态和可复现崩溃。

## 核心要点

Driller 可以拆成三件事：

1. **用 AFL 先扫能扫的地方**。类比：先让一群人把不用钥匙的房间全翻一遍。AFL 按覆盖率保存有趣输入，循环 bucket 和状态转移反馈让它在一个 compartment 内跑得很快。

2. **卡住时才启动符号执行**。类比：只有走廊尽头出现密码锁，才请开锁师。Driller 判断 fuzzer 一段时间找不到新 state transition 后，拿 AFL 已保存的 interesting inputs 去做 concolic execution。

3. **算出的输入再交回 fuzzer**。类比：开锁师只负责打开下一扇门，不负责搜完整层楼。符号执行生成能穿过复杂检查的输入，AFL 接着在新 compartment 里高速变异，直到再次卡住。

这个循环把昂贵分析限制在“跨 compartment 的门”上，避免把符号执行浪费在 fuzzer 已经能便宜探索的普通路径里。

## 实践案例

### 案例 1：fuzzer 为什么过不了魔数检查

```c
uint32_t mode;
read(0, &mode, 4);
if (mode == 0x0123abcd) {
  vulnerable();
}
```

**逐部分解释**：

- `mode` 来自用户输入，随机变异每次只能试一个具体值。
- `0x0123abcd` 是精确 32 位常量，随便猜中大约是 `1 / 2^32`。
- AFL 能知道“这里有个分支”，但如果没有逐字节比较反馈，它仍然很难生成正确值。
- Driller 的做法是让符号执行把条件翻成约束 `mode == 0x0123abcd`，直接求出对应 4 个字节。

### 案例 2：Driller 只把已知路径附近变成符号问题

```python
for seed in afl_interesting_inputs:
    state = trace_binary(seed)
    for edge in unseen_edges(state):
        new_input = solve_constraints_to(edge)
        afl_queue.add(new_input)
```

**逐部分解释**：

- `afl_interesting_inputs` 是 AFL 认为触发过新转移或新循环 bucket 的输入。
- `trace_binary(seed)` 不是从程序入口盲目展开所有路径，而是沿着真实输入走过的路径收集约束。
- `solve_constraints_to(edge)` 只针对 AFL 没走到的状态转移求解。
- 这样符号执行像外科手术：只切开挡路的检查，不把整个程序都拿来枚举。

### 案例 3：回到 fuzzer 后继续找深层崩溃

```python
while time_left:
    seed = afl.pick()
    if afl.is_stuck(seed):
        bridge_inputs = concolic_solve(seed)
        afl.enqueue_all(bridge_inputs)
    else:
        afl.mutate_and_run(seed)
```

**逐部分解释**：

- `afl.pick()` 负责日常搜索，成本低，能跑很多次。
- `afl.is_stuck(seed)` 表示新覆盖增长停住，随机变异的边际收益变低。
- `concolic_solve(seed)` 生成的不是最终 exploit，而是“能进入下一片代码”的新种子。
- 真正触发崩溃往往还要靠后续 fuzzing 在新 compartment 里继续打磨输入。

## 踩过的坑

1. **把 Driller 当成“符号执行替代 AFL”**：它的贡献恰好相反，符号执行只在 AFL 走不动时补一脚，主力仍是 fuzzing。

2. **以为 complex check 都很复杂**：论文里的 complex 指“fuzzer 太难随机满足”，哪怕只是比较一个魔数，对随机变异也足够难。

3. **忽略 compartment 这个抽象**：如果看不出程序被精确输入检查分成多个房间，就会误以为 Driller 只是普通 concolic testing 串行版。

4. **把发现 crash 当成证明安全边界完整**：Driller 只说明它找到了更多可触发崩溃，不证明没有被探索到的路径就安全。

## 适用 vs 不适用场景

**适用**：

- 二进制程序没有源码，仍想自动找可复现崩溃。
- 输入格式有魔数、命令名、校验条件或精确状态切换，普通 AFL 容易卡住。
- fuzzer 已经能在一个区域内快速涨覆盖，但经常被少数深分支挡住。
- 安全评测、长期 fuzz farm、漏洞研究里需要把随机搜索和求解器组合起来。

**不适用**：

- 程序主要瓶颈是环境交互、网络时序或多进程通信，论文实验也排除了多二进制服务。
- 分支条件涉及不可逆加密、外部服务或求解器难处理的复杂语义。
- 输入一旦经过约束修正就不能再随便变异，比如哈希和命令串互相绑定，AFL 可能很快又失效。
- 目标是证明程序完全正确；Driller 是测试和漏洞挖掘工具，不是形式化验证系统。

## 历史小故事（可跳过）

- **1990 年代起**：fuzzing 被用来测试 Unix 工具和网络服务，优点是快，缺点是容易停在浅层路径。
- **2005-2008 年**：EXE、KLEE、SAGE 等系统把符号执行重新带火，证明“输入可以由约束求解器算出来”。
- **2013-2015 年**：AFL 让 coverage-guided greybox fuzzing 变成安全研究的日常工具，速度和工程可用性大幅提升。
- **2016 年**：Driller 在 NDSS 发表，把 AFL 式 fuzzing 和选择性 concolic execution 组合成一个闭环系统。
- **之后**：hybrid fuzzing 成为一条主线，很多后续系统继续研究何时切换、求解哪些分支、怎样把约束反馈给 fuzzer。

## 学到什么

- **混合系统的关键是分工**：AFL 负责便宜覆盖，符号执行负责昂贵但精准的跨门动作。
- **路径爆炸可以靠“少用”缓解**：Driller 不是解决了符号执行的根本复杂度，而是只在收益高的位置调用它。
- **漏洞往往藏在输入协议后面**：魔数、命令 ID、状态机切换看起来无聊，却决定 fuzzer 能不能到达真正危险代码。
- **评估要看增量价值**：论文比较 AFL、纯符号执行和 Driller，重点证明混合后多找到 9 个崩溃，并在 126 个 CGC 单二进制应用上达到 77 个崩溃。

## 延伸阅读

- 论文 PDF：[Driller: Augmenting Fuzzing Through Selective Symbolic Execution](https://www.cs.ucsb.edu/~vigna/publications/2016_NDSS_Driller.pdf)
- 元数据：[NDSS DOI 10.14722/ndss.2016.23368](https://doi.org/10.14722/ndss.2016.23368) —— 作者、会议和引用信息。
- [[bohme-aflfast-2016]] —— 同年另一条 AFL 研究线：不引入求解器，只优化 seed 调度。
- [[cadar-klee-2008]] —— 符号执行工程化代表，理解 Driller 的 concolic 部分前最好先读。
- [[flayer-exposing-application-internals-2007]] —— 早期通过人工跳过复杂检查来帮助 fuzzing，适合作为 Driller 的对照。
- [[under-constrained-symbolic-execution-correctness-checking-real-2015]] —— 另一种限制符号执行范围的思路，和 Driller 的 selective 使用相互呼应。

## 关联

- [[bohme-aflfast-2016]] —— AFLFast 优化“fuzzer 在哪里花力气”，Driller 解决“fuzzer 根本过不了门”的问题。
- [[cadar-klee-2008]] —— KLEE 展示符号执行能自动生成测试，Driller 把这项能力嵌进 fuzzing 循环。
- [[newsome-taintcheck-2005]] —— 两者都研究二进制安全动态分析，只是 TaintCheck 追踪不可信数据，Driller 主动生成新输入。
- [[z3-2008]] —— 约束求解器是 concolic execution 的底层算力，决定很多分支能不能被解开。
- [[saltzer-schroeder-1975]] —— 深层漏洞常来自输入边界没有被充分检查，和安全设计原则形成互补视角。
- [[aflgo-2017]] —— 合理预测会存在的后续笔记：把 fuzzing 从“多覆盖”进一步改成“朝目标位置走”。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bohme-aflfast-2016]] —— AFLFast — 把 fuzzing 的力气花在更少人走的路径上
- [[fairfuzz-2018]] —— FairFuzz 2018 — 保护关键字节，让 fuzzing 往深处走
