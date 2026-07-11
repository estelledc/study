---
title: Brewer CAP — 网络一断电，一致性和可用性只能留一个
来源: 'Eric Brewer, "Towards Robust Distributed Systems", PODC keynote 2000'
日期: 2026-05-30
分类: 分布式系统
难度: 初级
---

## 是什么

CAP 是一个**关于分布式系统取舍的工程口号**：当机器之间的网络突然断了，你只能在"所有人看到一样的数据"和"所有人都能继续访问"之间挑一个。日常类比：两家分店共用一本账本，平时通过电话同步；电话线断的那段时间，要么两家都暂停营业（保持账目一致），要么各自继续记账事后再合（保持营业不停）——你做不到既不停业又每秒账目一致。

Brewer 在 2000 年 PODC（一个分布式计算会议）的 keynote 上把这件事画成一个三角：**Consistency（一致）/ Availability（可用）/ Partition tolerance（容忍分区）**，三选二。两年后 MIT 的 Gilbert 和 Lynch 把它形式化成定理。

这场演讲不是论文，是 Brewer 在 Inktomi 搜索引擎团队多年踩坑后的总结，**直接催生了 Dynamo、Cassandra 这一代 NoSQL**。

为什么是"猜想"不是"定理"？2000 年时 Brewer 没给数学证明，只是把工程经验讲成了一个简洁口号。但口号好记到让所有做分布式存储的人都记住了，并据此选边站。

## 为什么重要

不理解 CAP，下面这些事都没法解释：

- 为什么银行转账偶尔"系统繁忙"，而朋友圈点赞从不报错——它们选了不同角
- 为什么 Cassandra / Dynamo / Riak 一开口就承认"我是最终一致的"——它们主动放弃了 C
- 为什么 Spanner 用 GPS + 原子钟那么复杂——它在拼命想同时拿 C 和 A
- 为什么"网络永远可靠"是分布式开发新人最常踩的假设

## 核心要点

CAP 三个字母拆开看：

1. **Consistency（一致性）**：任何时刻，每个节点读到的同一份数据都一样。类比：所有分店账本随时同页。Brewer 这里指的是**强一致**——不是"差不多"。

2. **Availability（可用性）**：每个还活着的节点都能在有限时间内回应每个请求。类比：分店只要门没锁，就一定开口说话，不能装死。

3. **Partition tolerance（分区容忍）**：节点之间消息可能丢、可能延迟到天荒地老，系统仍能运行。类比：电话线断了你这家分店还得继续做点什么。

注意 Brewer 在 keynote 里把 C 定义为**线性一致**（linearizability），不是 ACID 里那个偏事务隔离的 C——这俩名字一样含义不同，是后来很多争论的源头之一。

**真正的取舍**：跨网络的真分布式系统，**P 不是可选项**——网络迟早会出问题。所以工程上其实是 **CP（停服保一致）vs AP（继续服务，事后修）**，"CA"只存在于单机或假装无分区的设计里。

## 实践案例

### 案例 1：购物车选 AP

```
[节点 A: 用户加了"牙刷"]    网络断    [节点 B: 用户加了"毛巾"]
                              ↓
                          连上之后
                              ↓
                  购物车 = {牙刷, 毛巾}（合并）
```

亚马逊 Dynamo 论文里的经典选择：**宁可短时间内两个节点看到不同购物车，也不能让用户加不进东西**。

合并策略不是凭空：每个写入带 vector clock 标记因果顺序，分区恢复后能拼出"哪个写在前哪个写在后"；真冲突就让客户端选一个或保留全部。这是 AP 路线、BASE 哲学的代表——业务层做了"合并"这件以前数据库帮你做的事。

### 案例 2：转账选 CP

```
账户 A 余额 100，要给 B 转 30
分区发生：节点 1 和节点 2 不通
         ↓
节点 1 不敢扣 → 返回"系统繁忙"   节点 2 也不敢加 → 拒绝
         ↓
等分区恢复，达成共识，再操作
```

银行核心账务系统选这条：**宁可暂时拒绝服务，也不能让钱凭空多出来**。

底层往往跑 Paxos / Raft 之类的共识算法：写入需要多数派确认才算数，分区时多数派那边继续工作，少数派那边主动停机不响应。代价是分区期间一部分用户看到"系统繁忙"，换来全局账目永远不会矛盾。

### 案例 3：DNS 是天然 AP

```
权威服务器更新了 IP        递归服务器 TTL 还有 5 分钟
            ↓
  全球边缘节点继续返回旧 IP
            ↓
  TTL 过期后逐步同步成新值
```

DNS 不是某人故意选的 AP，而是规模决定的——全球查询要在毫秒级返回，强一致根本不可能。**TTL 内的旧记录就是"最终一致"的活样本**：你换 IP 后总有一段窗口，全球各地的客户端拿到的是新旧混合，TTL 倒计时归零之前业务也得照常跑。

## 踩过的坑

1. **把 CAP 当作"平时三选二"**：分区不发生时 C 和 A 可以同时给。CAP 只在分区那段时间内强制取舍。Brewer 自己 2012 年专门写文章纠正这点。

2. **把 P 当成"可以不选"**：跨网络系统必须容忍分区，问题不是要不要 P，而是分区发生时怎么办。所以"CA 系统"几乎都是单机伪装。

3. **把"最终一致"当作"迟早一致就行"**：BASE 不是放弃一致性，而是显式承诺收敛窗口、冲突解决策略（vector clock / CRDT / last-write-wins）。没有这套，"最终"等于"永远不"。

4. **把 CAP 当严格定理直接套**：Brewer 2000 是猜想，2002 年 Gilbert-Lynch 才形式化，前提条件不完全一样。工程上更细的权衡是 **PACELC**：分区时 C vs A，**平时 latency vs consistency**。

## 适用 vs 不适用场景

**适用（思考分布式数据系统时的第一把尺子）**：
- 跨机房 / 跨地域复制的存储系统
- 微服务间的数据一致性讨论
- 选型 NoSQL / NewSQL 时对照需求
- 设计 review 时和团队对齐"我们这块是 CP 还是 AP"

**不适用**：
- 单机系统——没有网络分区可言
- 严格实时系统——CAP 不讨论延迟，要看 PACELC
- 想用 CAP 证明"NoSQL 比 SQL 可用性更高"——这是常见误用
- 想用 CAP 替代具体的一致性模型（线性一致 / 顺序一致 / 因果一致）——CAP 太粗

## 历史小故事（可跳过）

- **1990 年代末**：Brewer 在 UC Berkeley 主导 Inktomi 搜索引擎，团队跨多机房运维巨型集群，反复碰到"要一致就只能停服"的取舍。
- **2000 年 7 月**：PODC 大会 keynote，他把多年经验总结成 CAP 三角。slides 一共 24 页，没有正式论文。
- **2002 年**：MIT 的 Seth Gilbert 和 Nancy Lynch 在 SIGACT News 发表证明，CAP 从猜想升级为定理。
- **2007–2010 年**：Dynamo、Cassandra、Riak、CouchDB 一波 NoSQL 浪潮，全部高举 AP 旗帜。
- **2012 年**：Brewer 在 IEEE Computer 写 "CAP Twelve Years Later"，澄清"三选二"是简化口号，真实世界是分区窗口期内做细粒度权衡。
- **2010 年**：Daniel Abadi 提出 PACELC——分区时 P（C 还是 A），平时（Else）latency 还是 consistency。这是对 CAP 最重要的扩展。

## 学到什么

1. **网络永远会断**——这是分布式系统所有取舍的起点，比任何具体技术都重要
2. **简洁口号能错也能赢**：CAP 三选二并不严谨，但好记到改变了一代工程师的设计直觉
3. **C 和 A 在分区时互斥**，但平时可以共存；做架构时要把"分区期行为"单独想清楚
4. **BASE 不是 ACID 的劣化版**，是规模带来的另一种设计哲学；不是所有业务都需要 ACID
5. **理论口号 → 工程实践 → 自我修正**，CAP 12 年后被作者本人重写，这才是健康的工程演化

## 延伸阅读

- 视频教程：[Martin Kleppmann — A Critique of the CAP Theorem](https://www.youtube.com/watch?v=K-LfdRC9m_Q)（30 分钟把 CAP 的模糊处讲透）
- 回顾文章：[CAP Twelve Years Later: How the "Rules" Have Changed](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/)（Brewer 2012 自我澄清）
- 形式化证明：[Gilbert & Lynch — Brewer's Conjecture and the Feasibility of CAP](https://users.ece.cmu.edu/~adrian/731-sp04/readings/GL-cap.pdf)（2002 PDF，把猜想变定理）
- 书：Designing Data-Intensive Applications 第 9 章（Kleppmann 写的，CAP 章节是网上能找到的最清晰解释之一）
- [[dynamo]] —— Amazon AP 路线的代表
- [[spanner-2012]] —— Google 想拼回 C+A 的尝试

## 关联

- [[dynamo]] —— AP 路线代表，vector clock 处理冲突
- [[cassandra-2010]] —— AP 路线，可调一致性级别（QUORUM / ONE）
- [[bigtable-2006]] —— CP 路线，单 Tablet 强一致
- [[spanner-2012]] —— 用 TrueTime 在 WAN 上拼回外部一致性
- [[paxos-1998]] —— CP 系统的共识引擎
- [[bernstein-1981-cc]] —— 单库 ACID 的并发控制基础，CAP 之前的世界
- [[stonebraker-2010-sqlnosql]] —— CAP 落地后 SQL vs NoSQL 之争的总结
- [[zab-2011]] —— ZooKeeper 用的原子广播，CP 路线代表
- [[smr-1990]] —— 状态机复制，CP 系统底层模式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[azure-storage-2011]] —— Windows Azure Storage 2011 — 云对象存储第一次在工业界做到强一致
- [[bayou-1995]] —— Bayou — 离线先改本地，再回来和别人合并
- [[cassandra-eventual-tradeoff]] —— Cassandra 最终一致性取舍 — 可用性、延迟和新鲜度不能都拿满
- [[ceph-2006]] —— Ceph — 让分布式文件系统不靠中心查表
- [[chain-replication-2004]] —— Chain Replication — 把多副本排成流水线，简单且强一致
- [[cockroachdb-2020]] —— CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
- [[consistent-hashing-1997]] —— Consistent Hashing — 加机器只搬一小部分数据的哈希环
- [[craq-2009]] —— CRAQ — 让链复制每个节点都能读，吞吐线性扩展
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[crdt-sss-2011]] —— CRDT 形式定义 — SSS 2011 八页浓缩版
- [[dynamo-2007]] —— Dynamo 2007 — 让购物车在机器故障时也能写入
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[flexible-paxos-2016]] —— Flexible Paxos — 两阶段不一定都要多数派
- [[gilbert-lynch-2002]] —— Gilbert-Lynch 2002 — 把 CAP 从口号写成数学定理
- [[helland-2007]] —— Life Beyond Distributed Transactions — 大规模系统下放弃跨机事务的宣言
- [[megastore-2011]] —— Megastore — 把数据切成"小数据库"换跨地域同步复制
- [[saga-1987]] —— Sagas — 长事务拆成一串能"反向走回去"的小事务
- [[scads-database-2008]] —— SCADS — 用户涨一万倍也不改应用的存储愿景
- [[tachyon-2014]] —— Tachyon — 把集群存储推到内存速度，丢了再算回来
