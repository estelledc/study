---
title: Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
来源: 'Corbett et al., "Spanner: Google''s Globally-Distributed Database", OSDI 2012'
日期: 2026-05-30
分类: 分布式系统
难度: 高级
---

## 是什么

Spanner 是 **Google 把数据库摊到全球多个机房、还能跑强一致事务**的一套系统。日常类比：你和朋友分别在北京、纽约、伦敦记账本，三人都得同意"先收钱再发货"这个顺序——Spanner 让三个城市的账本看起来像一本，还知道哪笔记录在前哪笔在后。

最难的不是复制数据（Paxos 早就会了），而是**给全球分布的事务一个公认的时间戳**。北京的服务器钟和纽约的不可能完全对齐，毫秒级偏差就能让"先收钱"和"先发货"颠倒。

Spanner 的解法叫 **TrueTime**：每个数据中心装 GPS 接收器和原子钟，软件不再问"现在几点"，而是问"现在的真实时间一定落在 [earliest, latest] 这个区间里"。区间宽度 epsilon 通常 1-7ms。事务 commit 时**等满 epsilon** 再放锁，就能保证它的时间戳已经是绝对过去——后到的事务一定拿到更大的时间戳。

## 为什么重要

不理解 Spanner，下面这些事都没法解释：

- 为什么 CockroachDB / YugabyteDB / TiDB 这一波全球 SQL 数据库，架构上几乎都在学它（分片 + 共识复制 + 分布式事务）
- 为什么 Google AdWords（F1）能把扣费数据从 MySQL 拆到全球还不重复扣
- 为什么 "external consistency"（外部一致）在 2012 后火起来——它用物理时间戳保证：先提交的事务时间戳一定更小，效果≈事务级线性一致
- 为什么 "时钟"这个最不像计算机问题的东西，会成为分布式数据库的瓶颈

## 核心要点

Spanner 的设计可以拆成 **三件大事**：

1. **数据切成 tablet 放进 Paxos group**：每个 group 是一组副本，跨机房跑 Paxos（多数派投票写日志）选 leader。类比：每条街开一个分行，分行内部三个柜员投票决定账本写不写。

2. **跨 group 事务用 2PC**：一个事务可能动两条街的账本，需要两阶段提交（先问各分行能不能改，再统一落账）。Paxos 让 2PC 的协调者本身可容错——这是相对早期 2PC 的关键改进。

3. **TrueTime 给事务发时间戳 + commit wait**：写事务拿到 TT.now().latest 当时间戳 s，**等到 TT.after(s) 才放锁**。等待的本质：让墙上的真实时间确定大于 s，这样后续事务的时间戳一定比 s 大。这一步叫 **commit wait**。

读 read-only 事务挑一个 safe timestamp 直接快照读，**完全不用锁**——MVCC（多版本：读旧快照、写新版本互不挡）让它和写并发不冲突，全局时间戳让它能跨 group 取一致视图。

## 实践案例

### 案例 1：跨机房扣广告费的强一致

F1（AdWords 后端）把账户表分到全球。用户在欧洲点击广告，扣费写在欧洲机房，但月底结算要全球求和。

```sql
-- 写事务（commit timestamp = s）
BEGIN;
  UPDATE accounts SET balance = balance - 0.05 WHERE id = 'advertiser-42';
COMMIT;  -- Spanner 等 commit wait 后才返回成功
```

逐部分解释：

- BEGIN 拿到读 timestamp，UPDATE 走 Paxos 写一份多数派副本
- COMMIT 时 leader 选时间戳 s = TT.now().latest，等到 TT.after(s)（约 5ms）才告诉客户端成功
- 任何后到的事务（哪怕在亚洲发起）拿到的时间戳一定 > s，**永远不会出现 "我先扣的钱反而记成后到"** 这种灾难

### 案例 2：read-only 事务无锁快照

```sql
-- 报表查询，不需要锁
BEGIN READ ONLY;
  SELECT SUM(balance) FROM accounts;  -- 快照在 t = TT.now().earliest
COMMIT;
```

逐部分解释：

- 读事务挑 t = TT.now().earliest，意思是"绝对已经过去的某个时刻"
- Spanner 在每个副本本地读 t 时刻的 MVCC 版本——多副本读不需要协调
- 跨 group 求和时，每个 group 独立返回 t 时刻的快照，加起来就是一致总和
- 完全不阻塞写事务，写事务也不阻塞它

### 案例 3：commit wait 的时序图

```
T1: leader 选 s=100, TT.now()=[95,105]
T1: 写日志、Paxos 多数派 ack（耗时 3ms）
T1: commit wait —— 等到 TT.now().earliest > 100 (再等 ~2ms)
T1: 客户端收到 ACK，本次事务时间戳 = 100

T2: 此时 TT.now()=[101,107]，挑 s=107
    s=107 > 100，T2 严格在 T1 之后
```

commit wait 是 Spanner 把"全球时钟同步"压到 epsilon 量级换来的——延迟稍长，但全球时间戳完全可信。

## 踩过的坑

1. **以为 TrueTime 把时钟变准了**——它没有，它只是把不确定性显式建模成区间。所有写事务都要等满 epsilon，这是吞吐天花板：epsilon 越大、写延迟越高。

2. **跨 Paxos group 用 2PC 放大故障**——单 group 内事务延迟 ~10ms，跨 group 因为 2PC 协调多一轮 RTT，跨大洲事务可达 100ms。设计 schema 时尽量把热点行放同一 group。

3. **单数据中心部署反而吃亏**——commit wait 在低延迟环境没意义，纯属额外开销，本地业务直接用 PostgreSQL/MySQL 更划算。Spanner 是为跨地域设计的。

4. **依赖 GPS 信号和原子钟**——普通云机房没这种硬件，自建 Spanner-like 系统得用 NTP + Hybrid Logical Clock 替代，epsilon 从 ms 变成秒级，吞吐和延迟都会差一个数量级。

## 适用 vs 不适用场景

**适用**：

- 跨大洲多机房、要求强一致 ACID 事务的业务（广告扣费、支付、订单）
- 数据规模超过单机能撑（TB-PB），又不想牺牲事务的关系型场景
- 需要外部一致性（external consistency）的金融/审计——比线性一致更严

**不适用**：

- 单数据中心、毫秒延迟敏感的小型 OLTP → 用 [[aurora]] / PostgreSQL
- 写多读少的 KV 场景，不需要跨行事务 → 用 [[bigtable]] / [[dynamo]]
- 没法部署 GPS+原子钟的私有云 → 用 [[foundationdb]]（不依赖物理时钟）/ [[calvin]]（确定性事务）
- 分析型查询为主、强一致不重要 → 用 ClickHouse / BigQuery

## 历史小故事（可跳过）

- **2006 年**：[[bigtable]] 论文发表，证明 KV 大表能扩到 PB 级但**不支持跨行事务**
- **2008-2011 年**：Google 内部 Megastore 给 BigTable 加 Paxos 同步多副本+跨行事务但写延迟 100-400ms；F1 团队（AdWords）把 MySQL 后端迁到 Spanner，倒逼 Spanner 加 SQL 接口
- **2012-2013 年起**：OSDI 论文 Best Paper，Spanner 公开 TrueTime + 全球外部一致性；CockroachDB（2014）、YugabyteDB（2017）、TiDB（2016）相继开源，几乎都是 Spanner 的开源克隆

## 学到什么

1. **物理硬件可以参与软件设计**——把"时钟同步"这个看似纯软件的问题外包给 GPS + 原子钟，省下大量协议复杂度
2. **不确定性显式建模比假装精确更可靠**——TrueTime 不报"现在 X 点"而报区间，工程上反而更稳
3. **Paxos + 2PC 的组合 + NewSQL 的开端**：Paxos 单组复制 + 2PC 多组协调成为分布式数据库范式；证明"全球扩展" 和"强一致 SQL" 不是二选一，CAP 不等于必须放弃 C

## 延伸阅读

- 论文 PDF：[Spanner OSDI 2012](https://research.google.com/archive/spanner-osdi2012.pdf)（14 页，第 4 节 TrueTime 必读）
- 视频：[Designing Data-Intensive Applications — Spanner 章节](https://www.youtube.com/results?search_query=spanner+truetime)（Martin Kleppmann 讲解 TrueTime）
- 论文：F1 SIGMOD 2013（Spanner 的第一个真实业务，AdWords 后端）
- [[paxos-1998]] —— Spanner 单 group 内的复制协议
- [[bigtable]] —— Spanner 的前身，相同 sharding 思路但无事务
- [[chubby]] —— Spanner 内部用它做配置和锁服务

## 关联

- [[bigtable]] —— Spanner 的直接前身，把 KV 大表扩展到事务 + SQL
- [[paxos-1998]] —— Spanner 每个 tablet group 内部跑 Paxos 选 leader 复制日志
- [[lamport-1978]] —— 全局事件偏序的奠基论文，Spanner 用物理时钟把它换成全序
- [[chubby]] —— Spanner 用它存元数据和分布式锁
- [[gfs]] —— Google 文件系统，Spanner 的 tablet 数据存在它上面（后来换成 Colossus）
- [[aurora]] —— AWS 的对照系——单 region 优化、不做全球 TrueTime
- [[foundationdb]] —— 另一种 NewSQL 路线：不依赖物理时钟，用 deterministic transaction
- [[calvin]] —— 第三种思路：先排定全局事务顺序，再各副本本地执行

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amber-sigmod-2014]] —— Amber — 把用户数据从 Web 应用里拆出来
- [[azure-storage-2011]] —— Windows Azure Storage 2011 — 云对象存储第一次在工业界做到强一致
- [[berenson-1995-isolation]] —— ANSI SQL 隔离级别批判 — 教科书的隔离定义其实有漏洞
- [[bigtable]] —— Bigtable — 把巨大表格切到上千台机器上
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[calvin]] —— Calvin — 先排队再执行的分布式事务系统
- [[calvin-2012]] —— Calvin 2012 — 先排好顺序再执行，让跨分区事务不再走 2PC
- [[cap-12-years-later-2012]] —— CAP 十二年后 — Brewer 自己承认"三选二"是误读
- [[cockroachdb-2020]] —— CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
- [[cops-2011]] —— COPS — 大规模跨地域存储如何用得起的代价拿到因果一致
- [[craq-2009]] —— CRAQ — 让链复制每个节点都能读，吞吐线性扩展
- [[dapper-2010]] —— Dapper — Google 大规模分布式系统链路追踪基础设施
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[dremel-decade-2020]] —— Dremel 十年回顾 — BigQuery 背后的交互式云数仓路线
- [[epaxos-2013]] —— EPaxos — 没有 leader 的 Paxos，让每个副本平起平坐
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[farm-2015]] —— FaRM — 把一排机器的内存当成一个低延迟仓库
- [[flink-2015]] —— Apache Flink — 流批一体的单引擎
- [[flink-snapshots-2015]] —— Flink 异步快照 — 不停机给流处理拍一致照片
- [[foundationdb]] —— FoundationDB — 把事务、日志和存储拆开，再用仿真守住正确性
- [[foundationdb-2021]] —— FoundationDB 2021 — 把数据库拆成五个角色，再用一个 seed 烧十年 bug
- [[gfs]] —— GFS — 为工作负载反向定制的分布式文件系统
- [[gfs-2003]] —— GFS 2003 — 把廉价机器拼成大文件仓库
- [[gilbert-lynch-2002]] —— Gilbert-Lynch 2002 — 把 CAP 从口号写成数学定理
- [[helland-2007]] —— Life Beyond Distributed Transactions — 大规模系统下放弃跨机事务的宣言
- [[hlc-2014]] —— HLC 2014 — 把逻辑时钟和物理时钟合一，让普通服务器也能拍一致快照
- [[hnsw-2018]] —— HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)
- [[janus-2016]] —— Janus 2016 — 把并发控制和共识捏成一个协议
- [[lamport-time-clocks-1978]] —— Lamport 逻辑时钟 — 分布式系统里先后顺序怎么说清楚
- [[linearizability-1990]] —— Linearizability 1990 — 让并发对象看起来像一次只执行一个操作
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[megastore-2011]] —— Megastore — 把数据切成"小数据库"换跨地域同步复制
- [[millwheel-2013]] —— MillWheel 2013 — Google 给互联网级流处理装上不漏不重的发动机
- [[ntp-mills-1991]] —— NTP 1991 — 用四个时间戳和一组滤波器，让全网服务器的钟差几毫秒
- [[percolator-2010]] —— Percolator 2010 — 给 Bigtable 加分布式事务的客户端库
- [[pnuts-2008]] —— PNUTS — 介于强一致与最终一致之间的实用一致性
- [[presumed-abort-1986]] —— Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[scads-database-2008]] —— SCADS — 用户涨一万倍也不改应用的存储愿景
- [[sequential-consistency-1979]] —— Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准
- [[sinfonia-2007]] —— Sinfonia 2007 — 把分布式协议降级成数据结构操作
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[sqlite-2022]] —— SQLite — 嵌入式数据库 30 年怎么活下来的
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL
- [[system-design]] —— The Datacenter as a Computer — 把机房当成一台巨型计算机
- [[tao-2013]] —— TAO — Facebook 给十亿人好友列表造的专用图数据库
- [[tidb-2020]] —— TiDB 2020 — 给 Raft 加一个"旁听生"，让一份数据同时跑事务和分析
- [[tradeoff-analysis]] —— The Tail at Scale — 尾延迟会被规模放大
- [[vogels-eventual-2009]] —— Eventually Consistent 2009 — 给互联网规模存储一套'放弃强一致'的官方词汇
- [[vr-1988]] —— VR 1988 — 用"主备 + 换届"做共识的另一脉
- [[vr-revisited-2012]] —— VR Revisited 2012 — VR 协议的"工程化重写版"
- [[tikv]] —— TiKV — 分布式事务 KV
- [[vitess]] —— Vitess — 给 MySQL 装上水平分片的代理层
