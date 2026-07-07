---
title: Paxos — 分布式共识算法
来源: 'Leslie Lamport, "The Part-Time Parliament", TOCS 1998（1989 草稿）'
日期: 2026-05-29
分类: 分布式系统
难度: 中级
---

## 是什么

Paxos 是 1989 年 Leslie Lamport 发明的 **让多台机器对一个值达成一致** 的算法。日常类比：一群议员在不可靠会议上投票决定一项法案——有人迟到、有人退会、有人重复说话——但最后法案要么没通过，要么 **所有人记住的版本完全一样**。

5 台服务器要决定"今天主库是谁"或者"用户余额是 100 还是 80"。网络可能丢包、节点可能宕机、消息可能乱序延迟到达。Paxos 给出的答案是：只要 **多数派活着**（5 台里至少 3 台），就能选出唯一的值，不会出现"A 节点以为是 100、B 节点以为是 80"的分裂。

## 为什么重要

不理解 Paxos，下面这些事都没法解释：

- 为什么 Google Chubby / ZooKeeper / etcd / Cassandra 的底层都是同一个东西
- 为什么 [[spanner]] 能跨大洲做强一致事务
- 为什么 [[raft]] 自称"易理解版 Paxos"，业界等了 30 年才有这个易懂版
- 为什么 1985 年 FLP 不可能定理之后，Paxos 是第一个**正确且实用**的共识协议
- 为什么 1989 年的论文 30 多年后还在影响每天写的代码

只要系统里有"多副本 + 不能脑裂"的需求，背后大概率就是 Paxos 或它的徒孙。

## 核心要点

Paxos 把节点分成 **三种角色**（一个物理机可以同时扮演多种）：

1. **Proposer（提议者）**：发起"我想让大家把值定为 X"
2. **Acceptor（接受者）**：投票决定要不要接受这个提议
3. **Learner（学习者）**：从 acceptor 那里学到最终决定

整个协议只有 **两阶段**：

- **Phase 1（Prepare）**：proposer 拿着编号 n 去问 acceptor："能不能让我用 n 跑一轮？" acceptor 答应后承诺不再接受比 n 小的请求。
- **Phase 2（Accept）**：proposer 拿着 n 和具体值 v 去问："请接受 (n, v)。" 多数派同意，v 就被**决定**（chosen）。

**多数派**（quorum）是 Paxos 的命脉——5 个 acceptor 里至少 3 个同意才算数。**任意两个多数派必有交集**（鸽笼原理：3+3=6 > 5，必至少 1 个重叠）。这一条决定了"两个 proposer 同时跑也不会选出冲突值"——交集里那个节点会记住"我刚答应了 A，不能再答应跟 A 矛盾的 B"。

## 实践案例

### 案例 1：5 节点平静地选一个值

```
Proposer A 想提议 v = "apple"

Phase 1: A 发 prepare(n=1) 给 5 个 acceptor
         3 个 acceptor 回 promise → quorum 达成
Phase 2: A 发 accept(n=1, v="apple")
         3 个 acceptor 回 accepted → v="apple" 被 chosen
```

### 案例 2：两个 proposer 互抢

```
A 跑到 Phase 2 之前，B 用 n=2 抢
        3 个 acceptor 收到 prepare(n=2)，答应 B
        A 的 accept(n=1) 被拒（acceptor 已经承诺只接受 ≥ 2）
B 跑 Phase 2: accept(n=2, v="banana") → chosen
```

**关键**：如果 A 的 accept(n=1, v="apple") 已经在某个 acceptor 上落地，B 在 Phase 1 收到的 promise 会带上"我之前接受过 apple"——B 必须用 apple 替换掉自己原本的 banana。**这条"提议者必须沿用历史值"的规则是 Paxos 一致性的灵魂**——一旦有值被 chosen，后续所有成功的 proposer 都会再次提议同一个值。

### 案例 3：Multi-Paxos 优化

实际系统不是只决定一个值，而是决定 **一长串日志**。如果每个 slot 都跑两阶段，开销爆炸。优化：

1. 选一个稳定的 leader（独占 proposer）
2. leader 跑一次 Phase 1，把后续所有 slot 都"占住"
3. 每个新值只跑 Phase 2 = 单 RTT 写入

Chubby / ZooKeeper / Spanner / etcd 全部是这种 Multi-Paxos with leader 形态。**论文里"重复运行 Paxos 实例即可"一句话带过，工业系统 100% 在这上面打补丁**。

## 踩过的坑

1. **论文标题完全看不懂**——"Part-Time Parliament" 用古希腊岛屿议会比喻，1990 年投稿被审稿人拒绝（评价是"不严肃"），8 年后 1998 才发表。Lamport 2001 又写 *Paxos Made Simple* 试图救场，标题就是认错。

2. **Single-decree vs Multi-Paxos 论文里没讲清**——论文重点讲单值共识，但工业系统都用 Multi-Paxos。leader 选举、log compaction、membership change 论文全部留作 exercise，各家实现一个一个填坑。

3. **liveness 不保证**——FLP 定理决定。两个 proposer 互相抢 ballot 可以无限循环（dueling proposers），永不 chose。生产环境必须用 leader + lease + 随机退避把活锁概率压低。

4. **acceptor 必须 fsync**——promise 和 accept 必须落盘才能回复，否则节点重启后丢了承诺记录，safety 立刻破。fsync 是几毫秒级开销，对吞吐冲击很大。

5. **拜占庭故障不在保护范围**——Paxos 假设节点要么正确响应、要么宕机/失联，不处理"节点撒谎"。要抗撒谎得用 Byzantine Paxos / PBFT，节点数从 2f+1 涨到 3f+1。

6. **学了 5 年才"觉得自己懂"**，再 5 年发现还不够。这是行业共识，不是个人能力问题。

## 适用 vs 不适用场景

**适用**：

- 多副本一致性（数据库主从、分布式锁、leader 选举）
- 5-7 节点同 IDC 或跨 IDC 复制
- 需要严格 safety 的写路径（金融、订单、metadata）
- 元数据服务（Chubby / ZooKeeper / etcd 的典型场景）

**不适用**：

- 节点数 > 几十的大集群——quorum 投票延迟爆炸
- 需要拜占庭容错——用 PBFT / Tendermint
- 高吞吐流式数据——fsync + 多 RTT 限制吞吐，应该用 Kafka / Pulsar 类协议
- 跨大洲低延迟——光速决定的物理 RTT（美东到美西 70ms）是不可绕过的下限

## 历史小故事（可跳过）

- **1985 年**：Fischer-Lynch-Paterson 证明"异步 + 可故障 + 共识"三选二不可能（FLP 定理）。学界很多人觉得共识无解。
- **1988 年**：MIT 的 Oki 和 Liskov 提出 Viewstamped Replication，第一个真正的异步共识协议，但被绝大多数人忽略。
- **1989 年**：Lamport 在 DEC SRC 写 Paxos 草稿，用古希腊议会寓言包装。SRC 内部 reviewer 集体看不懂。
- **1990 年**：投稿被拒，Lamport 把论文塞进抽屉。
- **1998 年**：终于在 ACM TOCS 发表，但学术圈仍然觉得难懂。
- **2001 年**：Lamport 写 *Paxos Made Simple*，14 页简化重述。
- **2006 年**：Google Burrows 发表 *The Chubby Lock Service*，第一个公开的工业部署。
- **2014 年**：Stanford 的 Ongaro-Ousterhout 写 [[raft]]，标题《In Search of an Understandable Consensus Algorithm》——直接把"Paxos 不易懂"当成竞品攻击点。

## 学到什么

1. **多数派交集是分布式安全性的母定理**——只要"任意两次成功操作经过两个相交的 quorum"，且交集中节点持久化记忆，就能保证 safety。Paxos / [[raft]] / Zab / VR 全部依赖这条。

2. **safety 和 liveness 是两个不同维度**——FLP 定理告诉你"异步 + 故障 + 共识"三选二。Paxos 选 safety + 故障容错，丢 liveness 强保证。所有"我有更快共识"的宣称都要先看最坏情况下还能不能保 safety。

3. **论文易读性是工程 ROI**——Paxos 1989 草稿被拒 8 年的最大教训：写得人看不懂的论文，影响力被腰斩。[[raft]] 2014 的"易懂"宣言不是噱头，真把工业界从 Paxos 阵营拉走一半。

4. **抽象到极简 + 工业自由打补丁**——论文只讲 4 种消息、2 个阶段，实现里 leader 选举 / log compaction / membership change 全是工程师补的。这种"理论极简、工业加约束"的关系在系统论文里是常态。

## 延伸阅读

- [Paxos Made Simple（Lamport 2001 PDF）](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf) — 14 页简化重述，比 1998 原论文易懂得多
- [Paxos Made Live（Chandra-Griesemer-Redstone 2007 PDF）](https://www.cs.utexas.edu/users/lorenzo/corsi/cs380d/papers/paper2-1.pdf) — Google Chubby 团队踩坑总结，工业实现必读
- [Raft 论文（Ongaro-Ousterhout 2014）](https://raft.github.io/raft.pdf) — 易懂版共识，对照读更能理解 Paxos 的设计动机
- [[raft]] —— Paxos 的"工程精炼版"，把诸多自由度锁死换来可读性
- [[spanner]] —— 跨大洲 Multi-Paxos + TrueTime 的全球数据库

## 关联

- [[raft]] —— 把 Multi-Paxos 的诸多自由度锁死（leader 必须有最新 log、ballot 严格递增），换来工程可读性
- [[spanner]] —— Multi-Paxos 的最大规模工业部署，加上 TrueTime 实现外部一致性
- [[rocksdb-lsm]] —— 单机存储引擎；TiKV 在它上面叠 Raft = 工业 KV 标准组合
- [[volcano]] —— 单机查询执行模型；分布式 SQL 引擎把它和 Paxos-replicated 存储拼在一起

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[besu]] —— Hyperledger Besu — 用 Java 写的以太坊客户端
- [[bitcoin]] —— Bitcoin 白皮书
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[borg]] —— Borg — Google 把一万台机器假装成一台
- [[borg-omega-kube-2016]] —— Borg / Omega / Kubernetes — Google 调度器三代同源
- [[cassandra]] —— Apache Cassandra — 分布式宽列数据库
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[consistent-hashing-1997]] —— Consistent Hashing — 加机器只搬一小部分数据的哈希环
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[fast-paxos-2006]] —— Fast Paxos — 给 Paxos 加一条乐观快车道
- [[fidge-1988]] —— Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定
- [[filecoin]] —— Filecoin / Lotus — IPFS 之上的去中心化存储市场
- [[flink-snapshots-2015]] —— Flink 异步快照 — 不停机给流处理拍一致照片
- [[flp-1985]] —— FLP 1985 — 一个坏节点就能让异步共识永不终止
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[mattern-1989]] —— Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积
- [[mockapetris-1988-dns]] —— Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样
- [[nethermind]] —— Nethermind — .NET 写的高性能以太坊客户端
- [[omega-2013]] —— Omega 2013 — 让多个调度器同时改一份 cluster 状态
- [[pbft-1999]] —— PBFT — 让拜占庭容错从理论变成能跑的工程
- [[ps-li-2014]] —— Parameter Server — 多机训练前 AllReduce 时代的工业标准
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[raft]] —— Raft — 易理解的共识算法
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[saga-1987]] —— Sagas — 长事务拆成一串能"反向走回去"的小事务
- [[solana]] —— Solana — Rust 写的高性能 PoH 链
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库
- [[tls-1.3]] —— TLS 1.3 — 把 HTTPS 握手砍到一个来回
- [[volcano]] —— Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式
- [[zookeeper]] —— Apache ZooKeeper — 给一群机器装一个共同的小脑

