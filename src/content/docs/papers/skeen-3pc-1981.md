---
title: Skeen 1981 三阶段提交 — 给 2PC 的阻塞缺陷打补丁
来源: 'Dale Skeen, "Nonblocking Commit Protocols", SIGMOD 1981'
日期: 2026-05-30
分类: distributed-systems
难度: 中级
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
- 为什么真实公网里几乎没人部署纯 3PC——它依赖"超时=崩溃"，分区时会脑裂；1985 年的 **FLP** 又从理论上说明异步网络下确定性协议无法同时保安全与进展

## 核心要点

3PC 可以拆成三块来记：

1. **多一个缓冲态（PRE-COMMIT）**：在 2PC 的 READY 和 COMMIT 中间塞一步。类比：约饭时群主先说"准备出发"，再正式说"走"——中间这句让大家知道彼此都同意了。

```
2PC:  INIT ──prepare──→ READY ──commit──→ COMMIT
3PC:  INIT ──prepare──→ READY ──pre-commit──→ PRE-COMMIT ──commit──→ COMMIT
```

2. **教学不变量：活着的人状态最多差一格**（对论文非阻塞性质的简化说法）：有人到了 PRE-COMMIT，就不会有人还在 INIT；有人到了 COMMIT，就不会有人还在 READY。类比：队伍只能一格一格往前挪，不会有人已经到终点、有人还在起点。

3. **选举 + 终止子协议**：coordinator（协调者）挂了，幸存者先选临时领头，再互相通报状态推进。类比：群主失联后，剩下的人推一个代班，按多数状态决定去还是散。规则：全员 READY → abort；有人 PRE-COMMIT 或 COMMIT → 一起 commit。

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

正常路径：

```
coordinator: 收齐 YES → 广播 PRE-COMMIT → 收齐 ACK → 广播 COMMIT
```

若 coordinator 在广播完 PRE-COMMIT 后挂了（A/B/C 都已是 PRE-COMMIT），终止协议逐步是：

```
1. elect:     幸存者选临时 coordinator（比如 A）
2. collect:   A 问 B、C 当前状态 → 全是 PRE-COMMIT
3. decide:    有人已 PRE-COMMIT → 广播 COMMIT
4. follow:    B、C 跟进 COMMIT（不必等原 coordinator 复活）
```

**逐部分解释**：选举只解决"谁说话"；收集状态才是关键；规则是"看见 PRE-COMMIT/COMMIT 就提交，全员还在 READY 才 abort"。多出来的 PRE-COMMIT，就是给这一步留证据。

### 案例 3：为什么 Spanner 还在用 2PC

Google Spanner 跨 shard 事务**仍然用 2PC**，但把 coordinator 日志用 Paxos 复制成多副本：

```
2PC + Paxos:  participant ──YES──→ coordinator-group (Paxos 多数派落盘)
              任一副本挂了，组内还能继续发 COMMIT/ABORT
纯 3PC:       靠 PRE-COMMIT + 选举/终止；分区时两侧可能各自推进 → 脑裂风险
```

**逐部分解释**：Spanner 不消灭 2PC 的阻塞窗口，而是让"写了决定的那台机器"变成一组机器。设计者的工程判断是：异步网络下纯 3PC 不安全，**2PC + 共识复制的 coordinator** 比再加一轮 PRE-COMMIT 更稳。

## 踩过的坑

1. **异步网络下 3PC 不安全**：它假设 timeout 等于崩溃；真实网络里超时常是慢或分区，两侧各自选 coordinator 会做出冲突决定（split-brain / 脑裂）——这是工程上弃用 3PC 的直接原因。
2. **多一轮 RTT，延迟更差**：相对 2PC 多一次往返；同城约 +1–2ms，跨数据中心常 +50–200ms，吞吐敏感场景很难接受。
3. **假设太强**：论文要"同步网络 + 故障可检测 + 无分区"；1981 年局域网勉强，今天的公网三条都不成立。
4. **别把 FLP 当成"专杀 3PC"的判决书**：FLP（1985）证明异步模型下确定性共识无法同时保 safety 与 liveness；它解释为何不能指望纯异步协议两全，但 3PC 落地失败更直接来自不可靠故障检测与分区脑裂。

## 适用 vs 不适用场景

**适用**：

- 教学：理解 2PC 阻塞根因、状态机推理入门
- 同步、封闭、可检测故障的小集群（极少见）

**不适用**：

- 跨数据中心 / 公网 → Paxos / Raft（接受多数派，不赌单一 coordinator）
- 高吞吐 OLTP → 2PC + Paxos 复制 coordinator（Spanner 路线；比 3PC 少赌分区）
- 微服务长事务 → Saga / TCC（用最终一致换可用性）

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

1. **不变量是协议的灵魂**：教学版"状态最多差一格"串起所有步骤；设计协议先写清不变量
2. **同步 vs 异步是分水岭**：在哪种网络模型下证明，决定真实世界能不能用
3. **纸上可达 ≠ 工程可用**：3PC 解了阻塞，却在分区与超时语义上翻车，是经典反例
4. **共识替代了提交协议**：Paxos / Raft 用多数派代替单一 coordinator——过去 40 年主流范式；3PC 成了被两端夹击的过渡方案

## 延伸阅读

- 论文 PDF：[Skeen 1981 — Nonblocking Commit Protocols](https://dl.acm.org/doi/10.1145/582318.582339)（SIGMOD 原文，约 10 页）
- 综述：[Bernstein 1987 — Concurrency Control and Recovery](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/05/ccontrol.pdf)（第 7 章谈 2PC/3PC）
- 视频：[MIT 6.824 — Two-Phase Commit](https://www.youtube.com/watch?v=tCK-WeVhE8U)
- FLP 论文：[Fischer-Lynch-Paterson 1985](https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf)
- [[paxos-1998]] — 替代 3PC 的工业主流
- [[raft]] — Paxos 的工程化重写

## 关联

- [[paxos-1998]] —— 多数派共识替代 coordinator，绕过 2PC/3PC 阻塞
- [[raft]] —— Paxos 简化版，etcd / TiKV 等系统的核心
- [[bernstein-1981-cc]] —— 同年并发控制综述，事务的读写/写写另一面
- [[fast-paxos-2006]] —— Paxos 变种，少一轮 RTT
- [[lamport-time-clocks-1978]] —— 分布式时序基础，理解"谁先谁后"再读提交协议
- [[flp-1985]] —— 异步共识不可能，对照 3PC 的模型假设

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[presumed-abort-1986]] —— Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识
