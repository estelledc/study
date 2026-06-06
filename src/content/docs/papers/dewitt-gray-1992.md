---
title: DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
来源: 'David DeWitt & Jim Gray, "Parallel Database Systems: The Future of High Performance Database Systems", CACM 1992'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

DeWitt 与 Gray 1992 年的综述，**论证未来高性能数据库不靠专用硬件，靠把通用机器拼成"无共享"集群**。日常类比：与其造一台天价超级计算机，不如把 100 台普通 PC 用网线连起来，每台管自己那块磁盘——这就是 shared-nothing。

文章把并行数据库系统分成三种：**shared-memory**（多 CPU 共用一池内存和磁盘）、**shared-disk**（CPU 各有内存但共享磁盘）、**shared-nothing**（每台机器有自己的 CPU、内存、磁盘，只通过网络通信）。结论是 shared-nothing 才能扩到上千节点。

之后 30 年验证了这个判断：Snowflake / BigQuery / Redshift / Greenplum / Vertica 全是它的徒孙。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 1980 年代花大钱造的"数据库机器"（database machine）全失败了
- 为什么今天所有云数仓都自称 "MPP"——Massively Parallel Processing 就是这篇定义的 shared-nothing
- 为什么 Hadoop / Spark / MapReduce 看着像新东西，本质和 1992 年的 Gamma 是同一个架构
- 为什么数据库面试老问"你怎么 partition 这张表"——这是从这篇起被钉死的设计抓手

## 核心要点

并行数据库可以拆成 **四个抓手**：

1. **三种架构**：shared-memory 受总线带宽限制，几十 CPU 就到顶；shared-disk 要解决缓存一致性，扩到上百已吃力；**shared-nothing 只跨网络通信**，理论可扩到上千。类比：同住一屋抢冰箱 vs 各自在自己家有独立冰箱。

2. **两种并行**：**pipelined** 是上游算子边出，下游算子边吃，像流水线；**partitioned** 是把数据切成 N 份，同一算子在 N 个分片并发跑。两者叠加才有线性加速。

3. **数据分区三招**：**hash**（按 key 散列，等值查询友好）、**range**（按区间，范围查询友好）、**round-robin**（均匀打散，负载均衡但点查就糟）。选错就并行度归零。

4. **两个度量**：**speedup**——同样工作 N 倍硬件多快（理想 N 倍）；**scaleup**——N 倍工作 N 倍硬件能不能保持时间不变（理想 1.0）。这两个数字至今是评估 MPP 的金标准。

## 实践案例

### 案例 1：partitioned parallelism——4 分片求 count

orders 表按 user_id hash 切到 4 个节点：

```sql
SELECT count(*) FROM orders WHERE created_at > '2026-01-01';
```

执行时每个节点独立扫自己那 1/4 数据，本地 count 出一个数，最后协调节点把 4 个数 sum 起来。理想情况下 4 倍快——但前提是数据均匀。

如果其中一个分片放了双倍数据（数据倾斜），它就成了瓶颈，4 倍变 2 倍。这就是 partitioned parallelism 的最简单形态，也是它最常见的失效模式。

### 案例 2：pipelined parallelism——hash join 不等数据全到位就开干

```sql
SELECT * FROM users u JOIN orders o ON u.id = o.user_id;
```

hash join 流水线：

1. **build 阶段**：边扫 users 边把记录 hash 进内存表
2. **probe 阶段**：build 还在跑，probe 已经开始读 orders，每读一条立刻去查内存表

build 和 probe **不串行等待**，是流水线推进。如果再叠加 partitioned（4 分片各自跑一份 build+probe），就是这篇说的"两种并行叠加"。

这种"边吃边出"的好处：内存占用低（不必把中间结果全实例化），延迟低（首条结果尽快出来）。代价是上游一旦慢，下游也得等——不像 partitioned 那样彼此独立。

### 案例 3：分区键灾难——并行度归零的反例

orders 按 `user_id` hash 分区，但报表常按时间查：

```sql
SELECT date_trunc('day', created_at), sum(amount)
FROM orders
WHERE created_at BETWEEN '2026-05-01' AND '2026-05-31'
GROUP BY 1;
```

任何 user_id 都可能在 5 月有订单，所以 **每个分片都得全扫**。N 节点变 1 节点速度，并行度归零。

修法两条路：要么换分区键（按 created_at 做 range 分区，5 月数据集中在几个分片）；要么保留 hash 分区但加局部时间索引，让大部分 IO 提前剪掉。两种修法都不便宜——选分区键这一步必须在表设计阶段就拍板。

## 踩过的坑

1. **把 shared-nothing 当万灵药**：跨节点 join 需要 reshuffle，数据倾斜（hot key）会让 99% 数据落到 1 个节点上，其他节点空转——并行度被最慢分片拖死。

2. **分区键选错很难改**：分区键写死在物理布局里，改键意味着全表 reshuffle，TB 级表要停服几小时。新表设计阶段就得拍板。

3. **混淆 speedup 和 scaleup**：speedup 衰减常因 startup / interference / skew；scaleup 衰减还多了"协调开销随 N 增长"。报告时分清楚才能找到瓶颈。

4. **以为线性扩到无穷**：两阶段提交、全局排序、数据 rebalance 都是 O(N) 或更高的协调开销。Amdahl 定律在数百节点后开始显现，超过 1000 节点工程上需要分层（多机房 + 局部聚合）。

文章里作者反复强调：架构的胜负取决于 **通信开销随 N 怎么涨**——这是评估任何并行系统都该先问的第一个问题。

## 适用 vs 不适用场景

**适用**：

- 大规模分析查询（OLAP / 数仓）—— 全表扫描类工作分片就近线性
- 数据可自然按某个 key 分区（用户 ID、租户 ID、时间）的业务
- 需要扩到 PB 级、几十到上千节点的数据平台

**不适用**：

- 强一致 + 跨分区事务密集（OLTP 多分片转账）—— 两阶段提交开销吃掉并行收益，需要 [[spanner-2012]] 这类 truetime 体系
- 数据小到单机能放下（< 100GB）—— shared-nothing 协调开销反而不划算
- 查询模式天然不能分区（图遍历、深度递归）—— shuffle 比计算还贵
- 需要全局二级索引并实时一致 —— 索引维护跨节点成本高

## 历史小故事（可跳过）

- **1970s-1980s**：IBM ICL CAFS、CASSM 等专用 database machine 浪潮，硬件直接做 SELECT/JOIN，通用 CPU 跟不上。
- **1983**：DeWitt 在 Wisconsin 启动 Gamma 项目，用 VAX 通用机 + 以太网做 shared-nothing 原型。
- **1984**：Teradata DBC/1012 商用机型出货，1024 节点 shared-nothing，专做大型零售数仓。
- **1992**：DeWitt 与 Gray 把这十年经验写成 CACM 综述——专用机时代结束的盖棺之论。
- **2000s**：MPP 数据仓库（Greenplum、Vertica、Aster Data）商业开花，全部 shared-nothing。
- **2007**：Jim Gray 驾船独自出海失踪。这篇是他与 DeWitt 合作的代表作之一，至今每篇 MPP 数据库论文几乎都引。
- **2010s**：Hadoop / Spark / Snowflake / BigQuery 把同一架构推到云端，shared-nothing 成为大数据的默认前提。

## 学到什么

1. **并行性的来源是数据切分**，不是 CPU 多——切不动的工作（全局排序、跨分区一致）加 CPU 也没用
2. **shared-nothing 赢在通信路径单一**：只走网络，不走总线、不走共享磁盘，每加一台机器都是独立资源
3. **speedup 和 scaleup 两把尺子**——前者衡量加机器变快，后者衡量加机器扛更多，一篇综述定义了沿用至今的术语
4. **理论 → 工业 → 综述定调**：1983 Gamma、1984 Teradata 已经在跑，1992 综述把它写成共识——之后云数仓全部继承
5. **分区键是物理布局抓手**——选对了一切顺，选错了再快的机器也救不回来

## 延伸阅读

- 论文 PDF：[CACM 1992 全文](https://dl.acm.org/doi/10.1145/129888.129894)（14 页，结论先行很好读）
- 视频讲解：[CMU 15-445 Parallel Execution 讲座](https://www.youtube.com/watch?v=lxOR0qMfvNY)（Andy Pavlo 把这篇精神讲透）
- 后续奠基：[[volcano-1994]] —— Goetz Graefe 给并行查询加了"exchange 算子"统一抽象
- 现代云仓回响：[[snowflake]] —— shared-nothing + 计算存储分离的当代版本
- 历史回顾：[Margo Seltzer 访谈 Jim Gray](https://www.microsoft.com/en-us/research/people/gray/) （Gray 自述并行数据库与事务的几十年）
- [[cassandra-2010]] —— shared-nothing 思想在 NoSQL 的延伸

## 关联

- [[codd-1970]] —— 关系模型给了"水平分区"语义基础：行级独立才能切
- [[system-r-1976]] —— 第一个能用的关系数据库，没并行；这篇接着回答"怎么并行起来"
- [[volcano-1994]] —— 并行算子接口标准化，把这篇的思想做成可工程框架
- [[cascades-1995]] —— 并行查询优化器，给本篇的 partitioned/pipelined 选择最优计划
- [[bigtable-2006]] —— 把 shared-nothing 从 SQL 推到 NoSQL，分区键变成 row key
- [[spanner-2012]] —— shared-nothing + 全球一致事务，解决本篇没解决的 OLTP 跨分区
- [[cassandra-2010]] —— shared-nothing + Dynamo 风格一致性哈希分区
- [[neumann-2015-large-joins]] —— 现代并行 join 算法，本篇的具体落地

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[cascades-1995]] —— Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
- [[cassandra-2010]] —— Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[gray-1978-notes]] —— Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[neumann-2015-large-joins]] —— Adaptive Optimization of Very Large Join Queries — 100 张表也敢精确求解
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流

