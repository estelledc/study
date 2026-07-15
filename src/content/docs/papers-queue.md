---
title: 论文队列
description: 按 topic 分组的 pillar 推荐 —— 站内 1079 篇论文笔记里，每条主线挑 3-5 篇代表作做切入点
sidebar:
  order: 4
---

> 站内累计 1079 篇论文笔记，跨 14 个主题。这页不是"待读清单"，是
> **入门指引** —— 每个 topic 给 3-5 篇 pillar 论文 + 一行说明它
> 为什么是该 topic 的支点。看完一条主线的 pillar，你就拿到了
> 该 topic 整张反向链接图的入口。

## 怎么用这页

- 不知道某个 topic 从哪读 → 来这里挑该主题 3-5 篇 pillar
- 想看完整 1079 篇分布与主题地图 → [papers-atlas](/study/papers-atlas/)
- 想要"如何精读一篇论文"的方法 → [papers-method](/study/papers-method/)
- 想看跨论文 + 项目的混合阅读节奏 → [queue](/study/queue/)

每条已收录 pillar 都给了双向链接，点进去就是该论文的笔记主页。
backlinks 数字是"站内有多少篇笔记反向引用过它"，是"该论文在这个图里有多核心"
的最直接指标。

---

## 全站 pillar TOP 10（先看这十篇，跨 topic 都受用）

不挑 topic，按"反向链接最多 + 跨主题枢纽"排：

1. [[hindley-milner]] — PL 类型推断祖宗（126 backlinks）。TS / Rust / Swift /
   Haskell 类型系统笔记最终都汇到这。读完它，"为什么 `let x = 1` 不用写
   `: number`" 这个问题就闭合了。
2. [[attention]] — Transformer 起点（103 backlinks）。所有 LLM / NLP / agents
   笔记的根。零基础友好版已写，从"键值匹配"类比讲起。
3. [[paxos-1998]] — 分布式共识地基（67 backlinks）。Raft / Spanner / Chubby /
   etcd 全部反向引。读起来痛，但后面所有分布式论文都假设你懂它。
4. [[lambda-calculus]] — PL 理论起点（64 backlinks）。Hindley-Milner / Hoare
   逻辑 / 类型系统 / 求值策略全部依赖。
5. [[raft]] — 可工程化共识（63 backlinks）。Paxos 的"教学版"，etcd / TiKV /
   CockroachDB 反向引。零基础最常被问的就是这篇。
6. [[hoare-logic]] — 形式化方法门面（63 backlinks）。跨 PL + 验证两条线，
   程序正确性证明的基础语法。
7. [[lamport-1978]] — 分布式时序奠基（56 backlinks）。逻辑时钟、happens-before、
   因果序的祖宗，2025 年 CRDT / 向量时钟还在引。
8. [[llvm]] — 编译器 / IR 范式（50 backlinks）。Rust / Swift / Julia / Clang
   全部基于它的 IR + Pass 设计。
9. [[spanner-2012]] — 全球分布数据库（48 backlinks）。TrueTime + 外部一致性
   写进了所有现代分布式 DB 的设计文档。
10. [[bigtable-2006]] — 列式存储起点（46 backlinks）。HBase / Cassandra /
    DynamoDB / 各类 wide-column store 的源头设计。

读完这 10 篇，你就拿到了站内 80% 反向链接图的根节点。

---

## 按 topic 分组的 pillar 推荐

### 分布式系统（76 篇）

四大支柱，缺一篇就讲不清后面的论文：

1. [[paxos-1998]] —— 共识协议的"难懂祖宗"。所有"我们用 Paxos / Raft" 的
   工程文档都默认你读过它。
2. [[raft]] —— Paxos 的"可读版"，把"可教学性"列为研究贡献本身。
3. [[lamport-1978]] —— 没有物理时钟的分布式系统怎么定义"先后"。
4. [[dynamo]] —— NoSQL / 最终一致性的源头，把 CAP 里 AP 路线推到生产边界。
5. [[gfs]] —— 大文件 + 顺序读 + 节点频繁失败的工程现实如何反向定义文件系统。

衍生阅读路径：Paxos → Raft → Multi-Paxos → Spanner → CockroachDB / TiKV
是分布式数据库共识的经典 5 站。

---

### 编程语言（76 篇）

PL 是站内反向链接密度最高的 topic，pillar 都是"奠基级"：

1. [[lambda-calculus]] —— PL 的"算术"。后面所有论文都假设你能读 λ 表达式。
2. [[hindley-milner]] —— 类型推断的祖宗。OCaml / TS / Rust / Swift 都在变体。
3. [[hoare-logic]] —— 程序正确性证明的基础语法，跨 PL + 形式化方法两线。
4. [[wadler-prettier]] —— Prettier / esbuild / biome 的格式化 IR 思路源头。
5. [[trees-that-grow]] —— TypeScript / Babel / SWC 的 AST 设计典范。

零基础读这条线建议顺序：lambda-calculus → hindley-milner → hoare-logic
（前两篇先粗读，hoare 是分水岭）。

---

### 数据库（47 篇）

经典 4 篇 + 现代 2 篇，覆盖 OLTP / OLAP / 全球分布：

1. [[spanner-2012]] —— TrueTime + 外部一致性，定义了现代全球分布 DB 的语言。
2. [[bigtable-2006]] —— 列式 / wide-column 设计起点。
3. [[aries-1992]] —— 数据库恢复算法（WAL + redo/undo）的工程标准。
4. [[dynamo]] —— AP 路线的 NoSQL 源头（也算分布式 pillar）。
5. [[calvin-2012]] —— 确定性事务调度的另类路线，TiDB / FaunaDB 的影子。

读完这 5 篇，你能解释为什么 Postgres / MySQL / Spanner / Cassandra 的事务模型
长得不一样。

---

### 操作系统（46 篇）

经典系统论文的"必读三件套"：

1. [[unix-1974]] —— UNIX 哲学的源头文档（管道 / 一切皆文件 / 小工具组合）。
2. lions-commentary —— V6 内核逐行讲解，OS 教学的开山之作。
3. [[exokernel-1995]] —— 反"抽象"的极端思路，影响了 Unikernel / 现代容器
   的设计哲学。
4. [[mach-1986]] —— 微内核 + 消息传递，macOS / iOS 内核的祖先。
5. [[xen-2003]] —— paravirtualization，云计算 hypervisor 时代的开端。

---

### 机器学习 / Transformer（44 篇）

LLM 时代的"根 5 篇"：

1. [[attention]] —— Transformer 起点，2017 之后所有 LLM 论文的祖宗。
2. [[bert]] —— 预训练 + 双向 encoder 的范式典型。
3. [[gpt-3]] —— "scale 是不是答案" 这个问题被推到极致的论文。
4. [[chinchilla]] —— scaling law 的"修正版"，训练算力分配的标准引用。
5. [[lora]] —— 大模型微调的工程标杆，几乎所有 PEFT 笔记都反向引。

---

### Agents / AI Agent（24 篇）

2022-2026 年最快迭代的子领域，pillar 都是近 4 年的：

1. [ReAct](/study/papers/react/)（论文，不是前端框架）—— "think-act-observe" 循环的祖宗，对应
   今天 Claude Code / Cursor agent loop。
2. [[cot]] —— Chain-of-Thought，reasoning trace 为什么有用，ReAct 的根。
3. [[reflexion]] —— ReAct 没 retry 的硬伤怎么补：加自我反思层。
4. [[toolformer]] —— 工具调用从 prompt 路线到 self-supervised 微调路线的分叉。
5. [[swe-bench]] —— 把 agent 思路从 demo 推到真工程任务的基准。

读完这 5 篇你就能看懂当前所有 agent 框架（LangGraph / AutoGen /
crewAI / OpenHands）在抢什么空间。

---

### 形式化方法（27 篇）

跨 PL + 验证两线，pillar 全部是"理论分水岭"：

1. [[hoare-logic]] —— 前条件 / 后条件 / 不变量这套语法的源头。
2. separation-logic —— 处理指针 + 堆的扩展，Rust borrow checker 的
   远房亲戚。
3. curry-howard —— 命题 = 类型，证明 = 程序的对应关系。
4. tla-plus —— Lamport 的工程化形式化方法，AWS / MongoDB 实战引用最多。

---

### 编译器（11 篇）

数量不多但全是支柱：

1. [[llvm]] —— 现代编译器 IR + Pass 框架的事实标准。
2. ssa-form —— 静态单赋值，几乎所有现代编译器优化的 IR 基础。
3. lattice-dataflow —— 数据流分析的格论基础。
4. graph-coloring-regalloc —— 寄存器分配的经典图染色路线。

---

### 图形学（36 篇）

近 2 年 3D / 渲染领域被 NeRF 与 Gaussian Splatting 重新洗了一遍：

1. [[3d-gaussian-splatting]] —— 2023-2024 实时 3D 渲染的"新祖宗"。
2. nerf —— Neural Radiance Field，3D 重建被神经网络重写的起点。
3. ray-tracing-1980 —— Whitted ray tracing，路径追踪的奠基。
4. [[reyes-1987]] —— Pixar 的 Reyes 架构，offline 渲染的经典思路。

---

### 网络协议（37 篇）

Internet 协议栈的 pillar 通常 1980s-1990s，QUIC 是新一代：

1. tcp-1981 —— RFC 793，TCP 的源头规格。
2. bgp-rfc1771 —— Internet 路由的脊梁。
3. end-to-end-1984 —— "End-to-End Arguments in System Design"，
   网络分层哲学的政治宣言。
4. quic-2017 —— TCP/TLS 替代路线的工程总结，HTTP/3 的基础。

---

### 信息检索（25 篇）

从经典 IR 到向量检索：

1. [[bm25]] —— TF-IDF 的工程标准变体，2025 年依然是"baseline 的 baseline"。
2. pagerank —— Google 起家算法，图算法 + IR 的交叉点。
3. hnsw —— 向量检索的现代支柱，Faiss / Milvus / pgvector 都基于它。
4. colbert —— late-interaction retrieval，RAG 时代的 reranker 路线。

---

### Blockchain（44 篇）

数量大但 pillar 集中：

1. bitcoin-2008 —— 中本聪白皮书，PoW + UTXO 模型的奠基。
2. ethereum-yellowpaper —— 智能合约 + EVM 的形式化规范。
3. [[pbft-1999]] —— 拜占庭容错的工程化版本，联盟链 / Tendermint 的根。
4. zk-snarks —— 零知识证明在区块链落地的关键。

---

## 候选偏见（这页不收什么）

- **不收无 repo / 无可复现实验的论文** —— 笔记里 L4 跑不了等于半成品
- **不收纯 survey** —— survey 是别人嚼过的二手知识，培养判断力价值低
- **不收 venue 影响力存疑的 short paper** —— workshop 论文除非作者本人值得追
- **优先收反向链接 ≥ 30 的** —— pillar 的定义就是被反复引用
- **优先收"前后作清晰、能跨 topic 串联的"** —— 单点论文写不出 Layer 5

---

## 各 topic 完整地图入口

| Topic | 篇数 | atlas 入口 |
|------|-----|-----------|
| 分布式系统 | 76 | [papers-atlas#分布式系统](/study/papers-atlas/) |
| 编程语言 | 76 | [papers-atlas#编程语言](/study/papers-atlas/) |
| 数据库 | 47 | [papers-atlas#数据库](/study/papers-atlas/) |
| 操作系统 | 46 | [papers-atlas#操作系统](/study/papers-atlas/) |
| 机器学习 | 44 | [papers-atlas#机器学习](/study/papers-atlas/) |
| Blockchain | 44 | [papers-atlas#blockchain](/study/papers-atlas/) |
| 网络协议 | 37 | [papers-atlas#网络协议](/study/papers-atlas/) |
| 图形学 | 36 | [papers-atlas#图形学](/study/papers-atlas/) |
| 形式化方法 | 27 | [papers-atlas#形式化方法](/study/papers-atlas/) |
| 通信 | 27 | [papers-atlas#通信](/study/papers-atlas/) |
| 信息检索 | 25 | [papers-atlas#信息检索](/study/papers-atlas/) |
| Agents / AI Agent | 24 | [papers-atlas#agents](/study/papers-atlas/) |
| 编译器 | 11 | [papers-atlas#编译器](/study/papers-atlas/) |
| NLP | 11 | [papers-atlas#NLP](/study/papers-atlas/) |

总计 1014 篇笔记。这页只是"切入点"，真要展开请走对应 topic 的 atlas
分支。

---

## 反例改判

如果你觉得某篇 pillar 该换 / 某 topic 漏了支柱，提"X 应该进，因为 Y"。
反例能改我的判断 —— pillar 列表本身也是被反向链接和阅读频次动态调的。
