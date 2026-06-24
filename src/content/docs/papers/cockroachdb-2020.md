---
title: CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
来源: 'Taft 等. "CockroachDB: The Resilient Geo-Distributed SQL Database". SIGMOD 2020'
日期: 2026-05-30
分类: 数据库
难度: 高级
---

## 是什么

CockroachDB（**CRDB**）是一个**跨数据中心、强一致、SQL 兼容**的分布式数据库。日常类比：像一群分布在不同城市的银行柜台，每个柜台能独立办业务，但所有人对账时数字总能对得上——而且不需要给柜员配同一只原子钟。

它要解决的问题是：**Google Spanner 用 TrueTime 原子钟做到了全球强一致，但普通公司没有这种硬件，怎么办？**

CRDB 的答案：用一种叫 **Hybrid Logical Clock（HLC）** 的软件时钟代替原子钟，再配合 **Raft 复制 + 两阶段提交**，在普通服务器上做到类似 Spanner 的事务保证。代价是延迟有点尾巴（最多多等几百毫秒等"不确定性窗口"），但收益是可以跑在任何云厂商的标准虚拟机上。

```sql
-- 看起来就是普通 PostgreSQL，但底下是分布式
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- 在东京机房
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- 在伦敦机房
COMMIT;  -- 两边都成功才算成功，可串行化
```

## 为什么重要

不理解 CRDB 这套思路，下面这些事都没法解释：

- 为什么 2015 年之后突然冒出一批"分布式 SQL 数据库"（CRDB / TiDB / YugabyteDB），它们集体在卷什么
- 为什么"NewSQL"这个词能代表一类不同于 NoSQL 的方向——既要扩展性，又要 SQL 和事务
- 为什么 Spanner 的论文 2012 年就发了，但开源世界等到 2020 年才有真正能用的对标
- 为什么"地理分布事务"这个事在 5G/边缘计算/出海业务里越来越重要

## 核心要点

CRDB 把数据库拆成**四层**，每层只解决一件事：

1. **SQL 层**：把 SQL 翻译成 KV 操作。类比：餐厅前台把客人点的"宫保鸡丁"翻译成后厨能做的"切鸡块、爆花生"动作清单。

2. **事务层**：用 HLC 给事务排序，跨多个范围用 2PC 提交。HLC = 物理时钟 + 逻辑计数器。类比：每张支票上写两个时间——壁挂钟时间 + 一个序号，序号保证就算两张钟差了几秒，顺序也不会乱。

3. **复制层**：每个数据范围（range，默认 64MB）有 3-5 个副本，用 [[raft]] 协议保持一致。类比：每份合同抄三份分别保存，签字时多数派同意才算生效。

4. **存储层**：底层用 RocksDB（LSM 树），把 KV 落到磁盘。类比：图书馆的最底层书库，只管收书发书，不管谁来借。

四层叠起来，**SQL 看起来还是 SQL，但底下数据可以散在十几台机器上**。

## 实践案例

### 案例 1：跨区域转账，serializable 怎么保证

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 'alice';  -- 假设 100
UPDATE accounts SET balance = balance - 50 WHERE id = 'alice';
UPDATE accounts SET balance = balance + 50 WHERE id = 'bob';
COMMIT;
```

CRDB 内部做的事：

1. 事务开始时拿一个 HLC 时间戳 T
2. 读 alice 时记录"在 T 时刻读到 100"
3. 写 alice/bob 时给两个 KV 都打上时间戳 T
4. 提交时走 2PC：先写 intent（意向），再确认提交
5. 如果别的事务也在改 alice，发生冲突就 abort 重试，直到拿到一个无冲突的 T

**关键**：T 不是机器墙钟，是 HLC——保证就算两台机器时钟差 100ms，事务顺序仍然全局一致。

### 案例 2：自动故障恢复

3 副本部署，一台机器挂了：

- Raft 选出新 leader（200ms 内）
- 新 leader 接管这个 range 的读写
- 后台启动 rebalance：把丢的副本在另一台健康机器上重建
- **应用层完全无感**——只是某些请求多重试了一次

对比传统主从 MySQL：主挂了要人工切换或外挂中间件，CRDB 是协议级自动。

### 案例 3：从 PostgreSQL 迁移

CRDB 兼容 PostgreSQL wire protocol：

```python
# 应用代码完全不用改
import psycopg2
conn = psycopg2.connect("postgresql://crdb-cluster:26257/mydb")
```

**踩坑**：

- 没有 stored procedure（用 SQL function 替代）
- AUTO INCREMENT 主键在分布式下是热点，应该用 UUID 或 sharding hash
- 部分 PG 扩展（pg_trgm 等）不支持

## 踩过的坑

1. **HLC 不是 TrueTime**：本地时钟漂移大时，CRDB 会让事务**等一个不确定性窗口**（默认 250ms）才能确认顺序。Spanner 等 7ms，CRDB 等 250ms，长尾延迟差 30 倍。

2. **跨 range 写放大严重**：一个事务跨多个 range 必须走 2PC，写要落 intent + commit 两次。高 contention 工作负载下，abort/retry 比例飙升，吞吐反不如单机。

3. **跨地域多数派陷阱**：3 副本 1 region 各放一个，看起来高可用——但任何一个 region 挂掉，剩下 2 个副本都在远端，写延迟从 ms 级跳到几百 ms。生产部署要么 5 副本，要么用 follower read 卸压。

4. **热点 key 短期单机化**：range 是按 key 范围分的，连续插入（如时间戳主键）全打到最后一个 range 上。需要 hash sharding 或手动预分裂——这个坑和 [[bigtable-2006]] 一模一样。

## 适用 vs 不适用场景

**适用**：

- 全球或多区域部署的 OLTP 应用（电商、金融、SaaS）
- 需要强一致 + SQL 的中等规模业务（GB 到 TB 级）
- 对自动故障恢复、零停机扩缩容有强需求
- 想从 PostgreSQL 迁移但单机扛不住的团队

**不适用**：

- 单机/单数据中心 + 已有 PostgreSQL 用得好——加分布式只增加复杂度
- 极高写入吞吐（百万 QPS 量级）的场景——LSM + Raft + 2PC 开销太大，考虑 [[cassandra-2010]] 或专用 KV
- 重 OLAP 分析——CRDB 的 SQL 引擎是面向 OLTP 的，复杂 join 不如专门的列存
- 长事务（持有锁几十秒）——会和并发事务大量冲突

## 历史小故事（可跳过）

- **2012 年**：Google 发表 [[spanner-2012]] 论文，证明了 TrueTime + 2PC + Paxos 能做全球强一致事务。但 TrueTime 需要 GPS + 原子钟硬件，外人复现不了。
- **2015 年**：Spencer Kimball 和 Peter Mattis（前 Google 工程师，搞过 Gmail 和 Colossus）创立 Cockroach Labs，目标"开源版 Spanner"，命名取自蟑螂——打不死。
- **2017 年**：CRDB 1.0 发布，第一次跑通跨地域强一致事务。
- **2020 年**：SIGMOD 论文发表，5 年架构总结，介绍 HLC 替代 TrueTime 的关键工程取舍。
- **2021 年至今**：v22.x 加 multi-region SQL 抽象（REGIONAL BY ROW），把"哪行数据放哪个 region"变成 DDL 语法。

## 学到什么

1. **硬件优势可以用软件 + 多等一会儿换回来**——Spanner 的 7ms 不确定性窗口靠 GPS，CRDB 的 250ms 靠 HLC，业务对延迟不敏感时这是合理 tradeoff
2. **分层是分布式数据库的胜负手**——SQL/事务/复制/存储四层各管一件事，每层独立演进
3. **强一致和水平扩展不是非此即彼**——[[brewer-cap-2000]] 的 CAP 定理说"不能全要"，但实践里可以分维度妥协（CRDB 选 CP，分区时牺牲可用性）
4. **开源 + 商用支持**是基础软件的可持续路径——Cockroach Labs 用 BSL 协议（限制云厂商二次售卖）保证商业模式

## 延伸阅读

- 论文 PDF：[CockroachDB SIGMOD 2020](https://www.cockroachlabs.com/guides/the-cockroachdb-resilient-geo-distributed-sql-database/)（22 页，主要看第 3-5 节事务协议）
- 视频：[Spencer Kimball 在 InfoQ 讲 CRDB 设计](https://www.infoq.com/presentations/cockroachdb/)（45 分钟，创始人亲讲）
- 官方文档：[CockroachDB Architecture Overview](https://www.cockroachlabs.com/docs/stable/architecture/overview.html)（分层最清楚的入门）
- [[spanner-2012]] —— CRDB 的祖师爷，对照看 TrueTime vs HLC 的取舍
- [[raft]] —— CRDB 复制层的协议基础

## 关联

- [[spanner-2012]] —— CRDB 的设计原型，但 CRDB 用 HLC 替代 TrueTime
- [[raft]] —— 每个 range 用 Raft 做副本一致性
- [[paxos-1998]] —— 共识协议的祖宗，Raft 是它的简化版
- [[f1-2013]] —— Google 内部建在 Spanner 上的 SQL 层，对应 CRDB 的 SQL 层
- [[aurora]] —— AWS 的另一种 cloud-native SQL，但是单 region 共享存储路线
- [[calvin]] —— 另一种"先排序再执行"的分布式事务方案，CRDB 没走这条路
- [[bernstein-1981-cc]] —— 并发控制理论祖文，2PC + 时间戳排序的源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[berenson-1995-isolation]] —— ANSI SQL 隔离级别批判 — 教科书的隔离定义其实有漏洞
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[calvin-2012]] —— Calvin 2012 — 先排好顺序再执行，让跨分区事务不再走 2PC
- [[cassandra-2010]] —— Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
- [[hlc-2014]] —— HLC 2014 — 把逻辑时钟和物理时钟合一，让普通服务器也能拍一致快照
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[presumed-abort-1986]] —— Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识
- [[raft]] —— Raft — 易理解的共识算法
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[tidb-2020]] —— TiDB 2020 — 给 Raft 加一个"旁听生"，让一份数据同时跑事务和分析
- [[vitess]] —— Vitess — 给 MySQL 装上水平分片的代理层

