---
title: Paxos 1998 — 古希腊议会寓言里藏的共识协议
来源: 'Leslie Lamport, "The Part-Time Parliament", ACM TOCS 1998（DEC SRC 草稿 1989）'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

Paxos 1998 是 Leslie Lamport 1989 年在 DEC SRC 写完、1998 年才发表的共识算法论文。日常类比：5 个议员在不靠谱的会议厅里要决定一项法案——有人迟到、有人退会、消息靠纸条传可能丢失——但只要 **任意 3 人活着且记住的版本相同**，整体就视为通过且不会出现"我以为通过的是 A，你以为通过的是 B"。

论文不直接讲分布式系统，而是讲虚构的古希腊 Paxos 岛上一个"part-time parliament"，议员都是商人随时离开会议厅，决议靠旁注壁画完成。剥掉寓言外衣，本质是：n 个 acceptor 中有任意多数派达成一致，就能让一个值被永久 chosen。

为什么标题这么古怪：因为审稿人 1990 年看不懂，论文被压了 8 年。这本身就是分布式系统教学历史上最著名的一个槽点。直到 2001 年 Lamport 写《Paxos Made Simple》，业界才有一份能读完的版本。

## 为什么重要

不理解 Paxos 1998，下面这些事都没法解释：

- 为什么 Google Chubby / etcd（Paxos 系）和 ZooKeeper（Zab）都靠**多数派交集**保安全——同属一族，不是同一份代码
- 为什么 [[spanner]] 能跨大洲做强一致事务
- 为什么 [[raft]] 自称"易理解版 Paxos"，业界等了 30 年才有这个版本
- 为什么 1985 年 FLP 之后，Paxos 能与 1988 年的 Viewstamped Replication **同期**成为后来影响最大的实用共识之一（不是"唯一第一个"）
- 为什么 1989 年的草稿 30 多年后还在影响每天写的代码

只要系统里有"多副本 + 不能脑裂"的需求，背后大概率就是 Paxos 或其徒孙（Raft / Zab）。Cassandra 主路径是 Dynamo 最终一致，只有 LWT 才局部用到 Paxos——别把整库算进"Paxos 家族"。

## 核心要点

Paxos 把节点分成 **三种角色**（一个物理机可以同时扮演多种）：

1. **Proposer（提议者）**：发起"我想让大家把值定为 X"
2. **Acceptor（接受者）**：投票决定要不要接受这个提议，并持久化承诺
3. **Learner（学习者）**：从 acceptor 那里学到最终决定，不参与投票

整个协议只有 **两阶段**：

- **Phase 1（Prepare）**：proposer 拿编号 n 去问 acceptor："能不能让我用 n 跑一轮？"acceptor 答应后承诺不再接受比 n 小的请求，并把"我之前接受过什么值"一并回报。
- **Phase 2（Accept）**：proposer 拿 n 和具体值 v 去问："请接受 (n, v)。"多数派同意，v 就被 **chosen**。

**多数派**（quorum）是命脉——5 个 acceptor 里至少 3 个同意才算数。**任意两个多数派必有交集**（鸽笼原理：3+3=6 > 5，必至少 1 个重叠）。这一条决定了"两个 proposer 同时跑也不会选出冲突值"——交集里那个 acceptor 会记住"我刚答应了 A，不能再答应跟 A 矛盾的 B"。

把 4 类消息（prepare / promise / accept / accepted）和这一条几何性质对在一起，就是 Paxos 全部的安全骨架；其他东西都是它的衍生。

## 实践案例

下面三个案例对应论文里"single decree → contention → multi-paxos"的递进。每个案例直接给消息序列，不绕开通信细节。

### 案例 1：5 节点平静地选一个值

```
Proposer A 想提议 v = "apple"

Phase 1: A 发 prepare(n=1) 给 5 个 acceptor
         3 个 acceptor 回 promise → quorum 达成
Phase 2: A 发 accept(n=1, v="apple")
         3 个 acceptor 回 accepted → v="apple" 被 chosen
```

整个交互 2 个 RTT，4 类消息：prepare / promise / accept / accepted。论文的全部协议骨架就是这 4 行。

### 案例 2：两个 proposer 互抢

```
A 跑到 Phase 2 之前，B 用 n=2 抢
        3 个 acceptor 收到 prepare(n=2)，答应 B
        A 的 accept(n=1) 被拒（acceptor 已经承诺只接受 ≥ 2）
B 跑 Phase 2: accept(n=2, v="banana") → chosen
```

**关键**：如果 A 的 accept(n=1, v="apple") 已经在某个 acceptor 上落地，B 在 Phase 1 收到的 promise 会带上"我之前接受过 apple"——B 必须用 apple 替换掉自己原本的 banana。**这条"提议者必须沿用历史值"的规则是 Paxos 一致性的灵魂**——一旦有值被 chosen，后续所有成功的 proposer 都会再次提议同一个值。

### 案例 3：Multi-Paxos with leader

实际系统要决定 **一长串日志**（slot 1、2、3…），不是只选一个值。逐步对照：

1. 选稳定 leader 独占 proposer
2. leader **只跑一次** Phase 1，把后续 slot 的编号区间"占住"
3. 每个新值只跑 Phase 2（Accept）= 单 RTT 写入

Chubby / Spanner / etcd 是 Multi-Paxos + leader；ZooKeeper 用 Zab，思想同族。**1998 论文对"重复跑实例"一带而过，工业系统在 leader 选举、log compaction、成员变更上各自打补丁**。

## 踩过的坑

1. **论文标题完全看不懂**——"Part-Time Parliament" 用古希腊岛屿议会比喻，1990 年投稿被拒（评价是"不严肃"），8 年后 1998 才发表。Lamport 2001 又写 *Paxos Made Simple* 试图救场，标题就是认错。

2. **Single-decree vs Multi-Paxos 论文里没分清**——论文重点是单值共识，但工业系统全用 Multi-Paxos。leader 选举、log compaction、成员变更论文留作 exercise，各家自己填坑各填各的。

3. **liveness 不保证**——FLP 定理决定。两个 proposer 互抢 ballot 可以无限循环（dueling proposers），永不 chose。生产环境必须用 leader + lease + 随机退避把活锁概率压低。

4. **acceptor 必须 fsync**——promise 和 accept 必须落盘才能回复，否则节点重启丢承诺记录，safety 立刻破。fsync 几毫秒级开销，对吞吐冲击显著。

5. **拜占庭故障不在保护范围**——Paxos 假设节点要么正确响应、要么宕机/失联，不处理"节点撒谎"。要抗撒谎得用 Byzantine Paxos / PBFT，节点数从 2f+1 涨到 3f+1。

额外要点：每条 promise / accepted 都会带上 ballot 编号 n 和值 v；proposer 的 Phase 2 输入并非自由选择，而是"sees-then-replays"——这是 safety 证明的关键不变量。

## 适用 vs 不适用场景

**适用**：

- 多副本一致性（数据库主从、分布式锁、leader 选举）
- 5-7 节点同 IDC 或跨 IDC 复制
- 需要严格 safety 的写路径（金融、订单、metadata）
- 元数据服务（Chubby / ZooKeeper / etcd 的典型场景）

**不适用**：

- 节点数 > 几十的大集群——quorum 投票延迟爆炸
- 需要拜占庭容错——用 PBFT / Tendermint
- 高吞吐流式数据——fsync + 多 RTT 限制吞吐，应该用 Kafka 类协议
- 跨大洲低延迟——光速决定的物理 RTT（美东到美西 70ms）是不可绕过的下限

小结：Paxos 的"工业版"几乎都是 Multi-Paxos + 强 leader + 持久化日志这套组合，单 decree Paxos 主要是教学用。

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

5. **比喻是把双刃剑**——Lamport 用古希腊议会包装是为了让协议更直观，结果反而变成传播障碍。这提醒：技术写作的比喻必须能 zoom in 到机器层，不要让读者在寓言世界里转圈。

## 延伸阅读

- [Paxos Made Simple（Lamport 2001 PDF）](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf) — 14 页简化重述，比 1998 原论文易懂得多
- [Paxos Made Live（Chandra-Griesemer-Redstone 2007 PDF）](https://www.cs.utexas.edu/users/lorenzo/corsi/cs380d/papers/paper2-1.pdf) — Google Chubby 团队踩坑总结，工业实现必读
- [Raft 论文（Ongaro-Ousterhout 2014）](https://raft.github.io/raft.pdf) — 易懂版共识，对照读更能理解 Paxos 的设计动机
- [[raft]] —— Paxos 的"工程精炼版"，把诸多自由度锁死换来可读性
- [[spanner]] —— 跨大洲 Multi-Paxos + TrueTime 的全球数据库

## 关联

- [[raft]] —— 把 Multi-Paxos 的诸多自由度锁死（leader 必须有最新 log、ballot 严格递增），换来工程可读性
- [[spanner]] —— Multi-Paxos 的最大规模工业部署，加 TrueTime 实现外部一致性
- [[chubby]] —— Google 第一个公开的 Paxos 工业实现，给凡人用的分布式锁
- [[lamport-1978]] —— Lamport 自己 11 年前写的逻辑时钟，奠定异步消息推理范式
- [[bernstein-1981-cc]] —— 单机并发控制的并行经典；Paxos 是它的多副本对照
- [[bigtable]] —— Chubby 之上构建的列式存储，证明 Paxos 抽象足以承载 PB 级业务
- [[tigerbeetle]] —— 现代记账数据库，把 Multi-Paxos 派生协议做成产品级共识
- [[gray-1981-transaction]] —— 事务抽象的源头；Paxos 是把它扩到多副本的桥梁
- [[aries-1992]] —— 单机崩溃恢复的工业骨架；和 Paxos 拼起来才是完整的复制日志体系

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

