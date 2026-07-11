---
title: Disel — 把分布式协议拆成可独立证明、可拼装的 Coq 模块
来源: 'Sergey, Wilcox, Tatlock, "Programming and Proving with Distributed Protocols", POPL 2018'
日期: 2026-05-31
分类: 形式化方法
难度: 高级
---

## 是什么

Disel（Distributed Separation Logic）是一套**让你像搭乐高一样拼出分布式系统、并且每块乐高都自带数学证明**的 Coq 框架。日常类比：传统证明分布式协议像"盖一座一体浇筑的混凝土楼"——一处要改，整栋重浇；Disel 改成"预制板拼装"——每块板（一个协议）单独在工厂里测过承重，运到工地直接拼，拼起来的整楼承重不用重算。

作者 Ilya Sergey（UCL）+ James Wilcox（华盛顿，Verdi 一作）+ Zachary Tatlock（华盛顿，Verdi 团队），把 2015 年 Verdi 一次性证整套 Raft 的"巨石做法"拆开，提出**协议组合**作为一等公民。

论文里他们用 Disel 实现并证明了：**两阶段提交（2PC）、Paxos、一个并发计算器**——而且这些组件互相调用时**不需要重新证**。

## 为什么重要

不理解 Disel，下面这些事都没法解释：

- 为什么 Verdi（2015）证完 Raft 之后，再去证 2PC 几乎要从头来——它的"网络转换器"管故障搬运，但**不管协议之间互相调用**
- 为什么"分布式系统是协议的合成"这个工程直觉，**直到 2018 年才有数学工具支持**
- 为什么 IronFleet（2015）能证到工程级，但**两个独立证好的协议跑在同一个网络里**，组合的安全性还要重证一次
- 为什么后续 Velisarios（Byzantine）/ Adore / Aneris（2020）都引这篇——它把"协议作为可组合单元"的接口定下来了

## 核心要点

Disel 的设计可以拆成 **三个核心抽象**：

1. **协议（Protocol）**：一个协议 = 状态空间 + 状态转换关系 + **诚实节点的归纳不变量** + **允许发送的消息谓词**。例如 2PC 协议规定"协调者只能在收到所有 prepare 之后发 commit"。

2. **世界（World）**：一个世界 = 一组互不干涉的协议 + 节点上各协议的局部状态。两个协议在世界里**共存于同一网络**，但各自的状态、消息标签互不可见。

3. **Hoare 三元组 over 世界**：你写的程序 `{P} c {Q}` 解释为"在世界 W 下，从满足 P 的状态出发执行 c，结束时满足 Q，且执行过程**没违反任一协议的不变量**"。

三个抽象支撑两个组合规则：

- **协议并行组合**：两个协议各自的不变量在拼起来的世界里**自动成立**——因为消息标签隔离，你证 A 时不需要看 B
- **协议精化（hooking）**：让一个协议**调用**另一个的发送 / 接收原语，把上层协议的安全性归约到下层的不变量

底层数学骨架是 **FCSL**（Fine-grained Concurrent Separation Logic）的分布式版——把"线程间共享内存"换成"节点间消息缓冲"。

## 实践案例

### 案例 1：把 2PC 当成"先证完就能用"的模块

```coq
(* 协议 P_2PC：状态机 + 不变量 *)
Definition P_2PC : protocol := {|
  state := coordinator_state * list participant_state;
  send_perm  := (* 协调者只在收齐 prepare 后才能发 commit *);
  inv  := (* 一致性：决定值在所有诚实节点上一致 *)
|}.

(* 一次性证完：2PC 在自己的世界里满足 inv *)
Theorem P_2PC_correct : forall W, P_2PC \in W -> sound W.
```

之后任何用到 2PC 的上层程序，**直接拿 inv 用**，不再重证。这就是"模块化"的字面意思。

### 案例 2：两个协议在同一网络里互不干扰

Disel 让你这样写"一个节点上同时跑 2PC 和一个心跳协议"：

```coq
Definition W := P_2PC \+ P_heartbeat.

(* 心跳消息丢了不影响 2PC 一致性 —— 自动成立 *)
Lemma _2PC_safety_in_W : forall n, sees_inv W n P_2PC.
```

关键：**两个协议的消息标签不同**，发包时分发到对应缓冲，证 2PC 时把心跳的所有消息当噪声丢掉就行。Verdi 在 2015 做不到这件事——它的网络是单一全局对象。

### 案例 3：上层协议调用下层协议（hooking）

写一个**用 2PC 实现的银行转账**：

```coq
(* 转账逻辑用 2PC 的 prepare/commit 原语 *)
Definition transfer (from to : node) (amt : nat) : DT W unit :=
  send_prepare (from, to, amt) ;;
  match recv with
  | all_yes => send_commit
  | _       => send_abort
  end.

(* 转账安全性：归约到 2PC 的不变量 *)
Theorem transfer_atomicity :
  {{ balance from = a /\ balance to = b }}
    transfer from to amt
  {{ result = ok -> balance from = a - amt /\ balance to = b + amt }}.
```

证明里**不再需要打开 2PC 的状态机**——直接引用 `P_2PC.inv`，这就是论文 Sec 4 说的 "verified components, used as black boxes"。

## 踩过的坑

1. **网络模型仍然是消息丢失，不是拜占庭**：Disel 假设节点诚实，恶意节点不在范围。要拜占庭得用后续 Velisarios（2019）。

2. **协议组合不是免费午餐**：两个协议**完全独立**才能直接拼。如果它们要共享状态（比如都修改同一个账户余额），还得手写"组合不变量"——论文 Sec 5 给了一条胶水规则但写起来不轻。

3. **提取的代码慢**：Disel 把 Coq 程序提取到 OCaml 跑，论文里 Paxos 实现的吞吐比手写 Erlang 慢 3-5 倍。Verdi 也有同样问题。

4. **学习曲线陡**：你要同时懂 Coq + 分离逻辑 + 分布式协议三件事。论文配套 90 页技术报告，前 30 页都在建数学骨架。

## 适用 vs 不适用场景

**适用**：
- 想证多个协议**组合后整体仍正确**——Disel 的核心卖点
- 已经有 Coq 习惯，想从 Verdi 升级到模块化做法
- 协议之间是**层级调用**关系（如 KV 用 Paxos、应用用 2PC）

**不适用**：
- 拜占庭容错（用 Velisarios / Adore）
- 性能敏感的工业部署（用 IronFleet 的 Dafny → C# 路线）
- 不想写 Coq 想用 SMT 自动化（用 Ivy / Verus）

## 历史小故事（可跳过）

- **2015 年**：Verdi（Wilcox/Woos/Tatlock 等）一次性把 Raft 证下来，5 万行 Coq，"网络转换器"成名作。但 Wilcox 自己说："再证第二个协议，工作量没省下来。"
- **2017 年**：Sergey 在 UCL 把 FCSL（并发分离逻辑）想往分布式搬，找到 Tatlock 团队合作。
- **2018 年 1 月**：POPL 论文录用，Disel 开源。同年 Sergey 转去 Yale-NUS，Disel 成为"分布式 + 分离逻辑"这一支的起点。
- **2020 年**：Krogh-Jespersen 等做 Aneris（Iris-based 分布式分离逻辑），把 Disel 的并行组合升级到节点动态加入；这条线一直延续到今天。

## 学到什么

1. **"拆成可独立证明的组件"是工程进步的标志**——从 Verdi 的"一锅炖"到 Disel 的"模块化"，是分布式形式化方法走向工程化的关键一步
2. **分离逻辑的精神可以跨域复用**：把"指针不重叠 → 自动并行推理"的 idea 翻译成"消息标签不重叠 → 自动协议并行"
3. **不变量是"接口"**：每个协议把自己的安全性写成一条不变量公开，上层只看不变量不看实现——和软件工程里的 API 一模一样
4. **理论和工程之间的桥**：Disel 用 Coq 里的 `\+` 算子把"协议组合"做成一行代码，背后却是几百页定理——好工具就是把难度藏在底层

## 延伸阅读

- 论文：[Sergey-Wilcox-Tatlock POPL 2018](https://ilyasergey.net/papers/disel-popl18.pdf)（25 页正文 + 90 页技术报告）
- 仓库：[DistributedComponents/disel](https://github.com/DistributedComponents/disel)（Coq 8.7，含 2PC / Paxos / 计算器）
- 视频：[Sergey POPL 2018 talk](https://www.youtube.com/results?search_query=disel+sergey+popl+2018)（30 分钟讲清动机和组合规则）
- [[verdi-2015]] —— Disel 的直接前身，对比"一锅炖"vs"模块化"
- [[ironfleet-2015]] —— 同期工业级路线，Dafny + 精化金字塔
- [[fcsl]] —— Disel 的数学骨架（如果有这条笔记）

## 关联

- [[verdi-2015]] —— 同一团队 3 年前的"一锅炖"做法，Disel 是它的模块化升级
- [[ironfleet-2015]] —— 同期另一条路：Dafny + 精化金字塔，工程更落地但组合性弱
- [[paxos-1998]] —— Disel 用来当 demo 的协议之一
- [[separation-logic]] —— Disel 把"指针不重叠"换成"消息标签不重叠"
- [[tla-yu-tlc-1999]] —— TLA+ 也强调状态机精化，但靠模型检查不靠定理证明

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
