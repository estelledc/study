---
title: SPIN — 让计算机帮你穷举并发程序的所有可能执行
来源: Gerard J. Holzmann, "The Model Checker SPIN", IEEE Transactions on Software Engineering, 1997
日期: 2026-05-30
分类: 形式化方法
难度: 中级
---

## 是什么

SPIN 是一套**让计算机自动检查并发程序会不会出错**的工具。日常类比：你写了一份"两个人轮流走棋"的规则，SPIN 就把所有走法**一步不漏**地走一遍，看有没有哪条路会卡死、撞车、或违反你定的规矩。

你用一种叫 **Promela** 的小语言（像 C，但内置"进程""通道""非确定选择"）写一个模型，再用 **LTL（线性时序逻辑）** 写出你想要的性质，比如：

- "按下电梯按钮，最终一定会有电梯来"
- "两个进程不会同时进入临界区"

SPIN 把所有可能的执行交错都搜一遍。如果性质成立，它告诉你 OK；如果不成立，它把**反例那一条路径**直接打印给你看——精确到每一步谁动了什么。

## 为什么重要

1990 年之前，并发协议（电话交换、网络协议、火箭飞控）出 bug 全靠人工评审 + 跑测试碰运气。问题是**并发 bug 藏在罕见交错里**——10 万次跑一次才出现，测试根本撞不上。

SPIN 是第一个把"模型检测"这个学术想法**做到能给工程师用**的工具：

- **NASA** 用它验证 Mars Pathfinder（火星探路者）、Deep Space 1、Deep Impact 的飞控协议——这些任务一旦死锁，飞船报废
- **Lucent / Bell Labs** 用它验证电话交换协议，找出过去 20 年人工评审漏掉的竞态
- **2001 年** 获 ACM Software System Award，与 Unix、TeX、TCP/IP 同级别

不理解 SPIN 的核心思路，下面这些事都没法解释：

- 为什么"分布式系统的形式化验证"这门课每年开
- 为什么 TLA+（Lamport 的对手工具）在 AWS 内部强制使用
- 为什么 Paxos、Raft 这类共识算法在论文里都附带模型检测的结果

## 核心要点

SPIN 的工作方式可以拆成 **三步**：

1. **建模（Promela）**：把每个并发实体写成一个 `proctype`（进程）。进程之间用 `chan`（通道）通信，像 Go 的 channel。`if :: ... :: ...` 表示**非确定选择**——不指定走哪条，让 SPIN 都试。

2. **写性质（LTL）**：用时序逻辑写"什么必须成立"。比如 `[](req -> <>resp)` 读作"任何时刻只要有 `req`，未来一定有 `resp`"。`[]` = always，`<>` = eventually。

3. **穷举搜索（on-the-fly）**：SPIN 把所有进程的所有交错状态都展开成一棵巨大的树，深度优先地走，边走边查 LTL 性质。一旦发现反例就停，把那条路径打印出来。这叫 **explicit-state model checking**——每个状态都真实存进内存。

最大的敌人是 **状态爆炸**：N 个进程并发，状态数是指数级。SPIN 的两个杀手锏：

- **Partial-order reduction**：很多交错其实"无关紧要"（A 和 B 操作不同变量，谁先谁后结果一样），只搜一种代表
- **Bitstate hashing**：状态太多内存装不下，用哈希压缩——可能漏报，但能把 1 亿状态压到几 GB

SPIN 还有一个独特工程技巧：它不解释执行 Promela，而是把模型**编译成 C 代码**（生成 `pan.c`），再编译成原生可执行文件。所以验证速度接近"硬件原速"——这是它能压住状态爆炸的关键之一。

## 实践案例

### 案例 1：两个线程抢锁，会不会死锁

Promela 大致写成：

```promela
bool lock = false;
proctype Thread() {
  do
  :: atomic { !lock -> lock = true }; /* 临界区 */ lock = false
  od
}
init { run Thread(); run Thread() }
```

标准验证三步：`spin -a lock.pml` 生成 `pan.c` → `gcc -o pan pan.c` → `./pan`。几秒内告诉你：没有死锁、互斥成立。如果你**忘了 `atomic`**（让"判 lock + 改 lock"变成两步），`./pan` 立刻打印出一条交错：两个线程同时读到 `lock=false`，同时进入临界区；再用 `spin -t -p lock.pml` 回放反例。

### 案例 2：Mars Pathfinder 的优先级反转

1997 年 Pathfinder 在火星上不停重启。事后调查是**优先级反转**——低优先级任务持有锁，被中优先级抢占，高优先级一直拿不到锁。这种 bug 在地面测试 18 个月没复现，SPIN 这类工具能在几分钟内通过穷举所有调度顺序找到。

### 案例 3：电梯调度

3 部电梯 + 5 楼层 + 按钮请求，用 Promela 建模。性质："任何按下的按钮，最终都被响应"。SPIN 跑出来发现一个反例：如果两部电梯同时去同一楼层，第三部永远不动——调度算法漏了"避免重复派单"。

### 案例 4：消息通道溢出

Promela 的 `chan c = [3] of {byte}` 声明一个容量 3 的有界通道。如果两个生产者同时往里塞、消费者来不及取，SPIN 会立刻报告 "channel full" 反例——这种 bug 在真实代码里靠压力测试要跑几小时才能复现。

## 踩过的坑

1. **状态爆炸是真的**：5 个进程、每进程 10 个状态、3 个共享变量——很容易爆到 10^9 状态。要么拆模型、要么抽象、要么开 bitstate（接受漏报）。

2. **Promela 不是 C**：建的是**模型**不是真程序。真实 C 代码里的 buffer overflow、整数溢出、指针错误——模型里**不会出现**。SPIN 验通过 ≠ 程序没 bug，只是**这一层抽象**没 bug。

3. **LTL 写反了等于白验**：`[]<>p` 是"无限次发生 p"，`<>[]p` 是"最终永远 p"——两者完全不同。写错性质，工具说 pass 你以为安全，其实啥都没验。建议每条性质都先**故意造反例**测一下。

4. **公平性假设易误判**：默认所有交错都可能。如果你的真实系统有"操作系统调度公平"的保证，但模型里没声明，SPIN 会跑出"线程 A 永远不被调度"这种现实里不会发生的反例。用 `weak fairness` 显式声明。

## 适用 vs 不适用场景

**适用**：
- 并发协议、分布式算法（Paxos、Raft、缓存一致性、TCP 握手）
- 嵌入式 / 实时控制（航天、汽车、医疗设备）
- 状态有限或能抽象到有限的系统
- 关心"会不会死锁 / 违反 invariant / 卡在某状态"这类时序性质

**不适用**：
- 纯算法正确性证明 → 用 Coq / Isabelle / Lean
- 连续状态（数值计算、PID 控制） → 用混合系统工具（UPPAAL）
- 直接验证大规模 C/C++ 代码 → 要先手工抽象成 Promela 模型，工作量大；现代替代品 CBMC、Klee 直接对源码做有界检测
- 性质极复杂、需要量化 → SPIN 的 LTL 不够强，TLA+ 更适合

## 历史小故事（可跳过）

- **1980 年**：Holzmann 在贝尔实验室写第一版工具，叫 **pan**（protocol analyzer），验内部电话交换协议
- **1989 年**：改名 **SPIN**（Simple Promela Interpreter）
- **1997 年**：这篇 IEEE TSE 论文综述工具内部结构 + 工业案例，是 SPIN 的"对外名片"
- **2001 年**：ACM Software System Award，与 Unix、TeX、TCP/IP 同级别
- **至今**：spinroot.com 仍在更新，被引超 1 万次

有一个常被讲的逸事：Holzmann 让贝尔实验室一位资深协议工程师用 SPIN 复查一个"已经验证过"的电话协议，几小时后工具返回反例——那位工程师盯着输出看了 10 分钟，说"这个 bug 我们 1985 年怀疑过，找不出复现条件就归档了"。SPIN 一次性把它复活并精确指出。

## 学到什么

1. **并发 bug 不能靠测试**——必须靠**穷举**。这是过去 30 年并发软件最重要的一个洞见。
2. **建模 + 性质 + 工具** 是验证三件套。建模是把现实压缩成有限状态，性质是把意图翻成时序逻辑，工具替你穷举。
3. **状态爆炸是基本面**，永远存在。partial-order reduction、bitstate hashing 都是缓解，不是消灭。
4. **理论 → 工具 → 工业** 中间隔的不是聪明，是**工程**——SPIN 比同期的学术模型检测器多活了 30 年，靠的是"易用 + 文档 + 例子"。
5. **抽象的代价是责任**：模型不是程序，模型 pass 不等于代码 pass。要清楚自己抽象了什么，留心被抽象掉的那部分会不会出问题。

## 一句话总结

SPIN = "把并发程序写成 Promela 模型 + 把性质写成 LTL + 让工具替你**穷举所有交错**"——把并发 bug 从"测试碰运气"变成"数学穷举"。

## 延伸阅读

- 工具主页：[spinroot.com](https://spinroot.com)（含 Promela 教程、例子库、视频讲座）
- Holzmann 的书：*The SPIN Model Checker: Primer and Reference Manual*（2003，500 页，但前 100 页足够上手）
- 论文 PDF：[The Model Checker SPIN](https://spinroot.com/spin/Doc/ieee97.pdf)（19 页，工程语言为主，不难读）
- 入门教程：Mordechai Ben-Ari, *Principles of the Spin Model Checker*（薄册子，从死锁、互斥、读写锁一路讲到 LTL）
- [[biere-bmc-1999]] —— BMC 用 SAT 求解器代替显式枚举，是 SPIN 的"符号化"对手
- [[milner-pi-calculus]] —— π-演算给并发提供了另一种数学基础
- [[clarke-cegar-2003]] —— CEGAR 是另一种缓解状态爆炸的策略：先粗后细

## 关联

- [[biere-bmc-1999]] —— 模型检测的另一支：用 SAT/SMT 而非显式状态
- [[milner-pi-calculus]] —— 并发的数学语言，与 Promela 风格不同但目标相近
- [[hoare-logic]] —— 顺序程序的正确性证明，SPIN 处理的是它处理不了的并发
- [[lamport-time-clocks]] —— 分布式时序的开山论文，SPIN 验证的协议常引
- [[clarke-cegar-2003]] —— 反例引导的抽象细化，是 SPIN 之后的下一代抽象策略
- [[csp-hoare-1978]] —— Hoare CSP 给"通信进程"提供了代数语言，Promela 的灵感来源之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cimatti-nusmv-2002]] —— NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具
- [[clarke-emerson-1981]] —— Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
- [[mcmillan-smv-1993]] —— McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测
