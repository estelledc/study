---
title: Raft — 易理解的共识算法
来源: 'Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm", USENIX ATC 2014'
日期: 2026-05-29
分类: 分布式系统
难度: 中级
---

## 是什么

Raft 是一套**让多台机器对"下一步该做什么"达成一致**的算法。日常类比：像一个工厂车间——多个工人围着装配线决定下一步装哪个零件，谁也不能擅自决定。Raft 的解决办法是：**先投票选一个领班，领班说做啥就做啥；领班挂了大家再投票选下一个**。

为什么需要？想象一下：

- 你有 5 台数据库服务器，写一条数据要写到几台才算"写成功"？
- 如果其中两台同时宣称"我才是主"，写到不同台的数据冲突了怎么办？

[[paxos]] 几十年前就解决了这个问题，但论文太抽象，连博士生都看不懂。Raft 是 2014 年用通俗版**重新发明的同一个轮子**——同样的安全性，但每一步都画给你看。

## 为什么重要

不知道 Raft，下面这些事都没法解释：

- **K8s 为什么不会脑裂**：K8s 的元数据存在 etcd，etcd 用 Raft 保证多台机器对"集群状态"看法一致
- **Consul / TiKV / CockroachDB / RethinkDB** 这些"分布式数据库"凭什么敢说"主挂了能自动切"——底层全是 Raft
- **2014 年之前**，"分布式共识"是博士论文级话题；之后本科生上完一门课就能实现一个 Raft
- 论文标题本身就是它的核心价值——**Understandable**（易理解）。这是历史上第一篇把"可读性"当成研究贡献的系统论文

更关键的：ATC 短版约 **14 页**（扩展版含 safety 证明约 18 页）+ 算法伪代码约 50 行就讲完了。复现门槛低到工程师周末能写一个原型。

## 核心要点

Raft 把共识问题**拆成 3 个独立子问题**——这是它比 Paxos 易懂的根本原因：

### 选领班（Leader Election）

每台机器随机等 150-300 毫秒，谁先超时谁就喊"我要当领班"，向其他机器要票。**拿到过半票**就当选。随机化是关键——如果大家同时喊，永远选不出来。

### 领班发任务（Log Replication）

领班接到客户端请求，先写到自己的"任务清单"（log），然后并行发给所有副手。**集群过半节点（含领班自己）确认复制成功**，这条任务才算 commit（可执行）。注意：不是"过半副手"——5 节点只要再有 2 个 follower 确认即可（3 = majority）。

### 领班挂了不丢任务（Safety）

哪怕领班挂了、网络分裂了、机器重启了，**已经 commit 的任务永远不会消失**。新选出来的领班一定包含所有已 commit 的任务——这条强约束叫 Election Restriction，是 Raft 安全性的核心。

直观理解：投票时候选人必须证明"我的任务清单至少和你一样新"，否则拿不到票。这样新领班不可能比已 commit 的历史更短。

## 实践案例

### 案例 1：5 节点正常选举

```
初始：A B C D E 都是 follower，term=0
（term = 任期编号，每次选举自增，用来分辨"谁的权威更新"）

1. A 的 timer 先到，切 candidate，term=1，给自己投一票
2. A 向 B C D E 发 RequestVote
3. B C D 收到票请求，写盘后回复 yes（majority = 3 票，含 A 自己）
4. A 当选 leader，向所有人发心跳，宣告权威
```

### 案例 2：领班宕机后切换

```
1. A 当 leader 跑了一阵，复制了若干 log entry 到 B C D E
2. A 突然断电
3. B C D E 都收不到心跳，等 150-300 ms 各自超时
4. C 先超时，term=2，向其他人要票
5. D E 投给 C（Election Restriction：只投给 log 至少一样新的候选人）
6. C 当选后，用自己的 log 覆盖/补齐落后 follower——已 commit 的不会丢
```

### 案例 3：少数派分区静默

```
5 节点：A B C | D E（中间网络断了）

- 左侧 3 个仍能选出 leader（majority = 3 个）→ 继续服务
- 右侧 2 个永远选不出 leader（拿不到 3 票）→ 完全停摆
- 网络恢复后，右侧自动追上左侧的 log
```

这就是 Raft 在分区下的取舍：**少数派必须停服务**，绝不允许两边都写。

## 踩过的坑

1. **"多数派"是 ⌈(n+1)/2⌉ 不是 n/2**：n=5 是 3 个，n=4 也是 3 个。所以**偶数节点没好处**——4 节点和 3 节点一样只能容忍 1 台挂，但要多花一台机器的钱。生产里几乎不见 4 节点 Raft。

2. **少数派必须停服务**：网络分区时，被分到少数那侧的客户端会发现"我请求都超时"。这不是 bug，是 split-brain 的代价——宁可暂时不可用，也不能让两个 leader 各自写各自的。

3. **Log Compaction 论文留作 exercise**：log 一直涨重启会回放到天荒地老，必须做 snapshot。但论文只给了大致框架，工业实现要再写 1000 行（snapshot 怎么 fork、怎么传输、怎么和 application state 协同）。etcd 和 TiKV 各写各的。

4. **Joint Consensus 配置变更极易写错**：从 3 节点扩到 5 节点不能直接切，要走"双 majority"中间态。论文方案、Diego 博士论文方案、后来 Heidi Howard 找到的 corner case——三个版本各有 bug。工业实现互相不兼容。

5. **跨 term 直接 commit 旧 entry 是隐藏陷阱**：刚选上 leader 不能直接 commit 上一任 leader 留下的 entry，必须先在自己 term 内 commit 一条新 entry，旧 entry 才连带 commit。etcd 早期版本踩过这个坑。

## 适用 vs 不适用场景

**适用**：

- 3-5 节点的元数据/配置存储（K8s 的 etcd 经典场景）
- 跨数据中心 quorum < 100ms RTT 的同城多机房
- 状态机要求严格 linearizable read/write 的小规模数据库

**不适用**：

- 需要扛住几百 TB 写入的大集群——单 leader 是瓶颈，要拆 Multi-Raft
- 跨洲部署（RTT 200ms+）——每次 commit 至少一个 RTT，写延迟受不了
- 拜占庭容错（节点会撒谎）——Raft 假设节点要么正常要么宕机，不防作恶节点，得用 PBFT/HotStuff

## 历史小故事（可跳过）

- **1989 年**：Lamport 写出 Paxos 论文。学界看了 10 年没人懂，2001 年 Lamport 自己又写一篇 *Paxos Made Simple* 试图讲清楚，结果还是没人懂。
- **2006-2012 年**：Google Chubby、Spanner 在生产跑 Multi-Paxos，公开承认"论文到工业实现的鸿沟巨大"。
- **2013 年**：Stanford 博士生 Diego Ongaro 把 Raft 草稿拿给 OS 课学生当教材。CoreOS 同年开源 etcd，直接基于这版草稿。
- **2014 年**：Diego 博士答辩 + USENIX ATC 论文 + 最佳论文奖。论文里做了 **43 个学生对照实验**——一组学 Paxos、一组学 Raft，做同份 quiz，Raft 组平均高 23 分（满分 60）。第一篇用人因实验当 evaluation 的共识论文。
- **2015 年起**：Kubernetes 把 etcd 当 control plane → Raft 一夜成事实标准。HashiCorp/raft、TiKV、CockroachDB 陆续跟进。
- **2024 年**：Kafka 4.0 默认 KRaft，把 ZooKeeper（基于 2010 年的 Zab）替换掉。Raft 完成对工业共识层的全面接管。

## 学到什么

1. **"可理解"本身可以是研究贡献**——当一个领域已经有正确性证明完备的协议（Paxos）时，下一个突破点不是"更正确"，是"更可教学 + 更可抄写"

2. **强约束换可读性**：Raft 比 Paxos 多了显式 leader、单调 term、Election Restriction、log 一致性检查——每条都让协议自由度降低，但每条都让"实现一次写对"的概率提高

3. **学术引用 ≠ 工业普及**：Paxos 在 Google Scholar 引用比 Raft 高，但工业事实标准是 Raft。10 年时间证明：被引和被用是两件事

4. **拆问题是降低复杂度的根本武器**：Raft 把共识拆成 election + replication + safety 三个能独立讨论的子问题，Paxos 是一锅炖

## 延伸阅读

- 论文 18 页扩展版：[Ongaro 2014](https://raft.github.io/raft.pdf)（短版 14 页 + 扩展 safety 证明 4 页）
- 可视化教学站：[The Secret Lives of Data — Raft](http://thesecretlivesofdata.com/raft/)（鼠标点一下跑一步，肉眼看 election 怎么收敛）
- Diego 博士论文 200+ 页：[Consensus: Bridging Theory and Practice](https://github.com/ongardie/dissertation)（论文版省略的所有细节都在这里）
- 工业代码：etcd `raft/raft.go` 把 `stepLeader / stepFollower / stepCandidate` 三种状态拆成三个函数，对照论文 Figure 2 阅读，100% 还原
- 自测站：[Raft scope.io](https://observablehq.com/@stwind/raft-consensus-algorithm)（交互式动画，可手动制造分区与重连）

## 关联

- [[paxos]] —— Raft 的精神前辈；同样靠 quorum intersection 保安全，但隐式 leader 和对称 ballot 让工程实现极困难，Raft 是它的工程化版本
- [[paxos-simple-2001]] —— Lamport 试图讲清 Paxos 的平直版；对照读更能体会 Raft 为何强调 Understandable
- [[etcd]] —— 工业里最常见的 Raft 实现载体；对照 `raft.go` 读论文 Figure 2
- [[zab-2011]] —— ZooKeeper 的共识族谱；Kafka 从 Zab 迁到 KRaft 的对照样本
- [[pbft-1999]] —— 需要防作恶节点时，Raft 不够，得上拜占庭容错

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-2014]] —— Apollo — 让两万台机器自己决定谁跑哪个任务
- [[bayou-1995]] —— Bayou — 离线先改本地，再回来和别人合并
- [[bitcoin]] —— Bitcoin 白皮书
- [[borg]] —— Borg — Google 把一万台机器假装成一台
- [[borg-omega-kube-2016]] —— Borg / Omega / Kubernetes — Google 调度器三代同源
- [[byzantine-generals-1982]] —— 拜占庭将军问题 — 节点能撒谎时怎么达成一致
- [[calvin-2012]] —— Calvin 2012 — 先排好顺序再执行，让跨分区事务不再走 2PC
- [[chain-replication-2004]] —— Chain Replication — 把多副本排成流水线，简单且强一致
- [[chandy-lamport-1985]] —— Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福
- [[chord-2001]] —— Chord — 让上万台机器排成圈，查任何 key 都只走 log N 步
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[cockroachdb-2020]] —— CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
- [[craq-2009]] —— CRAQ — 让链复制每个节点都能读，吞吐线性扩展
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[crdt-json-2017]] —— CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[fast-paxos-2006]] —— Fast Paxos — 给 Paxos 加一条乐观快车道
- [[fidge-1988]] —— Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定
- [[flexible-paxos-2016]] —— Flexible Paxos — 两阶段不一定都要多数派
- [[flp-1985]] —— FLP 1985 — 一个坏节点就能让异步共识永不终止
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[ironfleet-2015]] —— IronFleet — 把分布式协议证到一行 bug 都没有
- [[janus-2016]] —— Janus 2016 — 把并发控制和共识捏成一个协议
- [[papers/kafka]] —— Kafka — 把消息系统降维成只追加的日志文件
- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[linearizability-1990]] —— Linearizability 1990 — 让并发对象看起来像一次只执行一个操作
- [[mattern-1989]] —— Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积
- [[mencius-2008]] —— Mencius — 让多台服务器轮流当 Paxos 的 leader
- [[moesi-cache-coherence-1986]] —— Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则
- [[omega-2013]] —— Omega 2013 — 让多个调度器同时改一份 cluster 状态
- [[paxos]] —— Paxos — 分布式共识算法
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[paxos-simple-2001]] —— Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
- [[pbft-1999]] —— PBFT — 让拜占庭容错从理论变成能跑的工程
- [[skeen-3pc-1981]] —— Skeen 1981 三阶段提交 — 给 2PC 的阻塞缺陷打补丁
- [[smr-1990]] —— SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[tendermint-2016]] —— Tendermint — 把拜占庭共识塞进开放区块链的工程模板
- [[tidb-2020]] —— TiDB 2020 — 给 Raft 加一个"旁听生"，让一份数据同时跑事务和分析
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库
- [[verdi-2015]] —— Verdi — 在 Coq 里完整证明 Raft 协议的分布式系统验证框架
- [[vr-1988]] —— VR 1988 — 用"主备 + 换届"做共识的另一脉
- [[vr-revisited-2012]] —— VR Revisited 2012 — VR 协议的"工程化重写版"
- [[zab-2011]] —— Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本
- [[arangodb]] —— ArangoDB — 文档+图+KV 三合一的多模型数据库
- [[besu]] —— Hyperledger Besu — 用 Java 写的以太坊客户端
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[capnproto]] —— Capn Proto — 数据布局即 wire format 的零拷贝序列化 + RPC
- [[cockroachdb]] —— CockroachDB — 分布式 SQL 数据库
- [[dragonfly]] —— Dragonfly — 多线程 Redis 替代
- [[etcd]] —— etcd — 分布式键值数据库
- [[filecoin]] —— Filecoin / Lotus — IPFS 之上的去中心化存储市场
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[nomad]] —— Nomad — HashiCorp 出的"轻量版 K8s"工作负载调度器
- [[orleans]] —— Orleans — 让分布式服务写起来像单机对象
- [[ravendb]] —— RavenDB — .NET 生态首选的 ACID 文档数据库
- [[rethinkdb]] —— RethinkDB — 让数据库自己把更新推给客户端的先驱
- [[solana]] —— Solana — Rust 写的高性能 PoH 链
- [[tidb]] —— TiDB — HTAP 分布式数据库
- [[vault]] —— Vault — HashiCorp 把"密码本"做成可编程基础设施
- [[zookeeper]] —— Apache ZooKeeper — 给一群机器装一个共同的小脑
