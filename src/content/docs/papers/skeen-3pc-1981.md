---
title: Skeen 1981 三阶段提交 — 给 2PC 的阻塞缺陷打补丁
来源: 'Dale Skeen, "Nonblocking Commit Protocols", SIGMOD 1981'
日期: 2026-05-30
子分类: 共识与复制
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Skeen 1981 这篇论文提出了 **3PC（three-phase commit，三阶段提交）**，目的是修补 2PC（two-phase commit，两阶段提交）一个臭名昭著的缺陷——**阻塞**。

日常类比：三个朋友约饭。

- **2PC 版本**：群主问"去吗？"（PREPARE）→ 大家点头 → 群主说"走"（COMMIT）。
- **失败场景**：群主在收到大家点头之后、还没说"走"之前，手机没电了。剩下三人不敢动也不敢散——群主可能已经决定走了，自己不去就放鸽子；也可能没决定，自己去就白等。
- **3PC 修复**：群主收到全员同意后，**先广播一句"准备出发"（PRE-COMMIT）**，让大家互相知道彼此都同意了。万一群主这一步之后失联，剩下三人选一个临时领头，按多数状态推进——大家都已经"准备出发"，那就一起去；还有人没收到，那就一起取消。

3PC 把 2PC 的两步拆成三步：**CAN-COMMIT → PRE-COMMIT → COMMIT**，中间多出来的 PRE-COMMIT 阶段，是为了让幸存者在 coordinator（协调者）挂了之后，**自己也能推进决定**，不用干等。

## 为什么重要

不理解 3PC，下面这些事都没法解释：

- 为什么 MySQL XA 和 Postgres 的 prepared transaction 用了 40 多年还在阻塞——它们就是 2PC，没人愿意换 3PC
- 为什么 Spanner / CockroachDB / etcd 这些现代分布式系统**全部跳过 3PC**，直接用 Paxos / Raft
- 为什么"分布式事务"在工业界是个让人头疼的词——根因就在 1981 这篇论文揭示的阻塞 vs 安全权衡里
- 为什么 1985 年的 **FLP 不可能性定理**对工程界是个重磅炸弹——它直接判了 3PC 在真实网络下的死刑

## 核心要点

3PC 的关键是在 2PC 的中间塞进一个**缓冲态**：

```
2PC:  INIT  ──prepare──→  READY  ──commit──→  COMMIT
3PC:  INIT  ──prepare──→  READY  ──pre-commit──→  PRE-COMMIT  ──commit──→  COMMIT
```

为什么多这一步能解阻塞？关键在一个**不变量**：

> 任意时刻，活着的 participant 之间状态**最多差一格**。

也就是说，如果有人到了 PRE-COMMIT，那不会有人还在 INIT；如果有人到了 COMMIT，那不会有人还在 READY。

这个不变量保证了一件事：**coordinator 挂了之后，幸存者只要互相通报状态，就能按多数态推进**。

- 全员都在 READY → 一致 abort
- 有人在 PRE-COMMIT → 推进到 COMMIT
- 有人在 COMMIT → 其他人跟进

3PC 还附带两个子协议：

1. **选举协议**：coordinator 挂了，幸存者选一个新的临时 coordinator
2. **终止协议**：新 coordinator 收集大家状态，按上面规则推进

## 实践案例

### 案例 1：2PC 在哪里卡死

群主（coordinator）已经收到全员"我同意"（YES vote），自己也在日志里写了"决定 COMMIT"，但**还没来得及广播**就崩了。

```
participant A: READY (点头了，等指令)
participant B: READY
participant C: READY
coordinator:    宕机（日志里写了 COMMIT，但没人知道）
```

A/B/C 现在干瞪眼——它们不能擅自 commit（万一 coordinator 决定的是 abort？），也不能 abort（万一 coordinator 决定的是 commit？）。**只能等 coordinator 重启**。这就是 2PC 阻塞。

### 案例 2：3PC 怎么破局

```
coordinator: 收齐 YES → 广播 PRE-COMMIT → 收齐 ACK → 广播 COMMIT
```

如果 coordinator 在广播完 PRE-COMMIT 之后挂了：

```
A: PRE-COMMIT
B: PRE-COMMIT
C: PRE-COMMIT
```

A/B/C 选一个新 coordinator，跑终止协议——发现"大家都在 PRE-COMMIT"，**一致推进到 COMMIT**。系统继续往前走，不需要原 coordinator 复活。

### 案例 3：为什么 Spanner 还在用 2PC

Google Spanner 跨 shard 事务**仍然用 2PC**，但它把 coordinator 的日志用 Paxos 复制到多副本——等于把"单点 coordinator"变成"高可用 coordinator"。Spanner 的设计者承认：3PC 在异步网络下不安全，2PC + Paxos 比 3PC 更工程化。

## 踩过的坑

1. **异步网络下 3PC 不安全**：3PC 假设故障可检测（timeout 等于崩溃）。但真实网络里，timeout 可能是网络慢、不是对方挂了。**网络分区**会让两侧各自选 coordinator，做出冲突决定——著名的 split-brain（脑裂）。

2. **多一轮 RTT，性能更差**：3PC 比 2PC 多一次往返。在跨数据中心的场景下，每多一次 RTT 就是几十到几百毫秒。

3. **假设太强**：论文要求"同步网络 + 故障可检测 + 无网络分区"。这三条在 1981 年的局域网里勉强成立，在今天的互联网上**全部不成立**。

4. **FLP 1985 的判决**：Fischer-Lynch-Paterson 证明，纯异步网络下没有任何确定性协议能同时保证 safety（不出错）和 liveness（一定有结果）。3PC 想两个都要，但只能在同步假设下成立——真实网络做不到。

5. **工业界几乎不用**：教科书必讲，生产几乎不见。原因就是上面四条加起来——3PC 的代价（性能 + 复杂度）大于收益（在工程上不安全）。

## 适用 vs 不适用场景

**适用**：

- 教学：理解 2PC 阻塞的根因、状态机推理的入门
- 同步网络且需要原子提交的封闭系统（极少见）

**不适用**：

- 跨数据中心、跨公网的分布式系统 → 用 Paxos / Raft
- 高吞吐 OLTP → 2PC + Paxos 复制的 coordinator 日志（Spanner 路线）
- 微服务事务 → Saga / TCC（牺牲严格一致性，换可用性）

## 历史小故事（可跳过）

- **1978**：Lampson 和 Sturgis 在 Xerox PARC 的备忘录里第一次写下 2PC 雏形（没正式发表）
- **1979**：Jim Gray 在《Notes on Database Operating Systems》里把 2PC 系统化，奠定数据库教科书地位
- **1981**：Dale Skeen 在 SIGMOD 提出 3PC，证明同步模型下非阻塞——这就是本篇论文
- **1983**：Skeen 和 Stonebraker 联手发表提交协议综述
- **1985**：FLP 不可能性定理发表，间接判了 3PC 在异步网络下的死刑
- **1989**：Lamport 写下 Paxos 论文，用**多数派 + 时间戳**替换 coordinator——从此工业界主流路线
- **2014**：Diego Ongaro 的 Raft 让 Paxos 容易理解，etcd / TiKV / CockroachDB 全线采纳

3PC 的命运很像"过渡产品"——它解决了 2PC 阻塞，但解的代价比新方案（Paxos）还高，所以被跳过了。

## 学到什么

1. **不变量是分布式协议的灵魂**：3PC 的"任意时刻状态最多差一格"是核心，所有协议步骤都为这个不变量服务
2. **同步 vs 异步模型的分水岭**：协议在哪种网络模型下证明的，决定它在真实世界能不能用
3. **可达性 vs 实用性**：纸上漂亮的协议，真实网络可能完全不能用——3PC 是经典反例
4. **为什么共识算法替代了提交协议**：Paxos / Raft 把"提交"变成"达成共识"，依赖多数派而非单一 coordinator——这是分布式系统过去 40 年最重要的范式转变之一
5. **过渡技术的命运**：3PC 解决了 2PC 的阻塞，但代价大于直接换共识算法，最终被工业界跳过——这是技术演化里"中间方案被两端夹击"的典型

## 延伸阅读

- 论文 PDF：[Skeen 1981 — Nonblocking Commit Protocols](https://dl.acm.org/doi/10.1145/582318.582339)（SIGMOD 原文，约 10 页）
- 综述：[Bernstein 1987 — Concurrency Control and Recovery in Database Systems](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/05/ccontrol.pdf)（第 7 章详谈 2PC/3PC）
- 视频：[MIT 6.824 — Two-Phase Commit](https://www.youtube.com/watch?v=tCK-WeVhE8U)（看完再读 3PC 体会更深）
- FLP 论文：[Fischer-Lynch-Paterson 1985 — Impossibility of Distributed Consensus](https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf)
- [[paxos-1998]] — 替代 3PC 的工业主流路线
- [[raft]] — Paxos 的工程化重写

## 关联

- [[paxos-1998]] —— 用多数派共识替代 coordinator，绕过 2PC/3PC 阻塞
- [[raft]] —— Paxos 的简化版，etcd / TiKV 等系统的核心
- [[bernstein-1981-cc]] —— 同年的并发控制综述，事务的另一面（读写同步 vs 写写同步）
- [[fast-paxos-2006]] —— Paxos 变种，少一轮 RTT
