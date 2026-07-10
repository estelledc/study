---
title: Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
来源: 'Clarke & Emerson, "Design and Synthesis of Synchronization Skeletons Using Branching-Time Temporal Logic", Logic of Programs Workshop 1981'
日期: 2026-05-30
分类: 形式化方法
难度: 高级
---

## 是什么

**模型检测**（model checking）的开山论文。给一个并发程序的状态图 + 一条想要的性质（"任何时候都不会两个进程同时进临界区"），算法**自动跑一遍**告诉你"成立"还是"在第 17 步会违反"。日常类比：像一个穷举型审计员——它把程序所有可能的执行分支全走一遍，看有没有反例，不靠人脑写证明。

论文的具体贡献是两件：

1. 发明了一种叫 **CTL**（Computation Tree Logic，计算树逻辑）的语言，用来精确写出"最终一定到""一直保持""存在一条路径"这类时序需求。
2. 给出第一个能跑的算法——对 CTL 公式从内向外标注每个状态满不满足，多项式时间内出结果。

40 年后，SPIN / SMV / NuSMV / TLA+ 这些工业工具，根都长在这篇 12 页的会议论文上。Clarke、Emerson、Sifakis（同期独立做了类似工作的法国学者）三人因此共获 **2007 年图灵奖**。

## 为什么重要

不理解模型检测，下面这些事都没法解释：

- 为什么 Intel 在 Pentium FDIV bug 之后，每代 CPU 上市前都要花几个月用 model checker 扫一遍硬件协议
- 为什么 Amazon S3 / DynamoDB 的核心一致性算法发布前都用 TLA+ 写一遍——Lamport 的 TLA+ 是 model checking 路线的延续
- 为什么"测试只能证明 bug 存在，不能证明 bug 不存在"这句话在 model checking 出现后被部分推翻
- 为什么 Coq / Isabelle 这些定理证明器和 model checker 是两条不同路线——前者要人写证明，后者机器穷举

## 核心要点

模型检测的三块拼图：

1. **Kripke 结构**：把程序抽成有限状态图——节点是程序的"快照"，边是"一步执行能到哪些下个快照"，每个节点贴上"这里 p 成立""这里 q 成立"这种标签。类比：地铁线路图，每站贴上"这里有便利店"这种标签。

2. **CTL 公式**：在状态图上写需求。语法核心 6 个：**AX**（所有下一步）、**EX**（存在下一步）、**AF**（所有路径上最终）、**EF**（存在路径上最终）、**AG**（所有路径上一直）、**EG**（存在路径上一直）。例子：`AG ¬(cs1 ∧ cs2)` 读作"任何路径任何时刻，进程 1 和进程 2 不同时在临界区"。

3. **标号算法**：对 CTL 公式按结构归纳——原子命题直接看节点标签；`EX p` 标在"有后继是 p" 的节点；`EF p`、`EG p` 用**不动点迭代**反复扩张/收缩状态集合直到稳定。子公式从内向外标完，根公式在初始状态成立 ↔ 程序满足规约。

复杂度大约是 **O(|状态数| × |公式长度|)**——多项式，机器能跑。

## 实践案例

### 案例 1：互斥锁规约（CTL 怎么写最简单的需求）

两个进程 P1、P2 想共享一段临界区代码。需求是"永远不会两个同时在临界区"。

CTL 公式：

```
AG ¬(in_cs_1 ∧ in_cs_2)
```

**逐部分解释**：

- `AG f` —— 所有路径所有时刻，f 成立
- `¬(in_cs_1 ∧ in_cs_2)` —— 进程 1 和 2 不同时在临界区
- 模型检测器把状态图遍历一遍，要么报"成立"要么吐出一条"反例路径"：`s0 → s3 → s7 → 此处违反`

这就是 model checking 用起来的样子——你不写证明，你写需求，机器要么验证要么给反例。

### 案例 2：电梯活性（liveness 比安全性难）

需求："按了按钮，电梯一定会到这一层。"

CTL 公式：

```
AG (pressed → AF arrived)
```

**含义**：所有时刻，一旦 pressed 成立，就所有未来路径上最终 arrived 成立。

陷阱：如果不加 fairness（公平调度）约束，模型会承认"这部电梯永远只往别楼跑"这种坏路径，让 AF arrived 成立失败。所以工业 model checker 都支持 fairness 假设——"调度器最终会让每个进程跑"。

### 案例 3：标号算法走一遍（机器在干什么）

考虑 4 状态系统，初始 s0，转移 s0→s1, s0→s2, s1→s3, s2→s3, s3→s3。状态标签：s3 标 `done`，其余无。

验证 `EF done`（存在路径最终 done）：

```
T0: 标 done 的状态集 = {s3}
T1: 加上能一步到 {s3} 的状态 = {s1, s2, s3}
T2: 加上能一步到 T1 的 = {s0, s1, s2, s3}
T3: 同 T2，稳定
```

最终 `EF done` 成立的状态集 = {s0, s1, s2, s3}，s0 在里面 → 程序满足。这就是不动点迭代——反复扩张直到不变。

## 踩过的坑

1. **状态爆炸**：n 个布尔变量 → 2^n 状态，10 个进程的协议常飙到 10^9 状态以上，原始算法跑不动。1986 McMillan 用 BDD（二元决策图）把状态集合**符号化**压成位运算，才把可处理规模从 10^5 推到 10^20。

2. **CTL 表达力 ≠ LTL**：CTL 有路径量词（A/E），LTL 没有，但 LTL 能写"p 直到 q"组合得更自由。两者表达力**互不包含**——新人常以为 CTL 严格更强，会被反例打脸。CTL\* 是把两者合并的超集。

3. **fairness 不写就漏 bug**：不加"调度器最终让每个进程跑"，model checker 会承认"某进程永远饥饿"这种坏路径让 liveness 规约失败，跟现实不符。工业工具默认都得手动写 fairness 约束。

4. **抽象不当结果失真**：真实程序状态无限（任意整数变量），必须抽象成有限模型。抽象太粗漏 bug，太细爆炸。怎么选是 model checking 落地最难的事——Clarke 自己 2000 年代的 CEGAR（反例引导抽象细化）专门攻这个。

## 适用 vs 不适用场景

**适用**：
- 有限状态并发协议——cache coherence、互斥、leader election、网络协议
- 硬件验证——Intel / AMD 用了 30 年，每代 CPU 必扫
- 关键基础设施代码逻辑——AWS / Azure 用 TLA+ 写共识算法
- 反例驱动调试——比测试更彻底，找到 bug 还能给路径

**不适用**：
- 状态空间天然无限或巨大无法抽象（任意大整数运算、堆数据结构）→ 用 [[reynolds-separation-logic]] / [[hoare-logic]] 走证明路线
- 性能 / 时序属性（"100ms 内响应"）→ 需要扩展成 timed automata 或 statistical model checking
- 机器学习模型 / 概率程序 → 标准 CTL 不行，需要 PCTL（概率 CTL）扩展
- 一次性脚本 / 业务逻辑 → 写规约成本远超 bug 损失，不划算

## 历史小故事（可跳过）

- **1977 年**：Pnueli 把时态逻辑（哲学家做的"必然/可能"逻辑）引入程序验证，提出 LTL（线性时态逻辑），但只给了证明系统不是判定算法。
- **1981 年 5 月**：Clarke（Harvard 助理教授）和他的博士生 Emerson 在 Yorktown Heights 的 Logic of Programs Workshop 提出 CTL + 标号算法。同年法国的 Queille 和 Sifakis 在 ICPP 独立提出类似思路。
- **1986 年**：Clarke 的学生 McMillan 用 BDD 把状态集合符号化，做出 SMV，可处理状态数从 10^5 跳到 10^20，model checking 工业化。
- **1990s**：Holzmann 在贝尔实验室造 SPIN（用 LTL 路线），成为协议验证的事实标准。
- **2007 年**：Clarke、Emerson、Sifakis 共获图灵奖，颁奖词写"开创了一种自动验证硬件和软件的方法"。

## 学到什么

1. **正确性能机器化**——这件事 1981 年之前没人真敢说；之后定理证明 + 模型检测两条路并行
2. **状态爆炸是物理学常数**——所有降复杂度的招（BDD / 偏序约简 / abstraction）都在跟 2^n 抢空间
3. **规约语言决定能验证什么**——CTL / LTL / CTL\* / PCTL，每选一种就锁定一类性质
4. **工业落地靠抽象**——纯算法 1981 就有了，但真正能扫真实代码靠的是 30 年抽象技术积累

## 延伸阅读

- 论文 PDF（CMU 主页）：[Design and Synthesis of Synchronization Skeletons](https://www.cs.cmu.edu/~emc/) （12 页，密度高）
- 教材：Baier & Katoen, *Principles of Model Checking*（2008）—— 标准研究生教材，700 页把整条线讲透
- 视频：[Edmund Clarke Turing Lecture 2008](https://amturing.acm.org/vp/clarke_1167964.cfm) —— 1 小时回顾整条路线
- 工具：[NuSMV](https://nusmv.fbk.eu/) / [SPIN](https://spinroot.com/) —— 直接上手跑
- [[hoare-logic]] —— 另一条路线：人写证明而非机器穷举
- [[csp-hoare-1978]] —— 并发理论，CTL 模型常表达 CSP 程序

## 关联

- [[holzmann-spin-1997]] —— 用 LTL 路线的工业 model checker，与 CTL 路线互补
- [[hoare-logic]] —— 程序验证的"人写证明"路线，与 model checking 互补
- [[csp-hoare-1978]] —— 并发模型，CTL 常用来写 CSP 程序的需求
- [[fstar]] —— 把定理证明 + 类型 + SMT 揉一起，model checking 的精神后继之一
- [[cousot-abstract-interpretation]] —— 给 model checking 提供"如何抽象"的统一数学框架
- [[lamport-1978]] —— Happens-before 给并发程序模型奠基
- [[reynolds-separation-logic]] —— 处理 model checking 不擅长的堆数据结构

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[cimatti-nusmv-2002]] —— NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[csp-hoare-1978]] —— CSP — 进程之间只许喊话不许共用内存
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[mcmillan-smv-1993]] —— McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测
- [[pnueli-temporal-1977]] —— Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架

