---
title: ClickHouse — 把列存 OLAP 推到硬件极限
来源: 'Schulze, Schreiber, Yatsishin, Dahimene, Milovidov. "ClickHouse - Lightning Fast Analytics for Everyone". VLDB 2024'
日期: 2026-05-30
分类: databases
难度: 中级
---

## 是什么

ClickHouse 是一个**专门跑分析查询的列式数据库**。日常类比:像超市的"按品类摆货"——传统 OLTP 数据库按一行一行存(像把整车购物筐挨着放),ClickHouse 把同一列的所有值连成一条长货架(可乐放可乐区,薯片放薯片区),你要"统计今年所有可乐销量"就只走可乐货架,完全不碰薯片。

你写:

```sql
SELECT count(*), avg(price) FROM hits WHERE event_date = '2026-05-29'
```

PostgreSQL 要把每行所有列从磁盘读出来,再丢掉用不到的列;ClickHouse 只读 `event_date` 和 `price` 两个文件,加上 SIMD 一次处理 65536 行,单核每秒能扫几亿行。

这个"列存 + 向量化 + 后台合并"的组合,把 2024 年开源 OLAP 的天花板钉死了。

## 为什么重要

不理解 ClickHouse,下面这些事都没法解释:

- 为什么同一份 100 亿行点击流数据,PostgreSQL 跑一个 GROUP BY 要 12 秒,ClickHouse 只要 0.04 秒
- 为什么 Cloudflare / Uber / ByteDance / Alibaba 的实时数仓都从 Druid 迁到 ClickHouse
- 为什么 DuckDB / StarRocks / Databend 这些新引擎设计风格"长得像 ClickHouse"
- 为什么 OLAP 圈现在不再讨论"用不用列存",而是讨论"列存怎么调到硬件上限"

## 核心要点

ClickHouse 把性能堆到极致靠**三件事叠在一起**:

1. **列存 + 向量化批处理**:数据按列连续存,每个算子(filter / aggregate)接收 65536 行的列块、整批处理。类比:工厂流水线一次加工一筐零件,不是一颗一颗拿。SIMD 指令一拍 16 个 uint8,L2 cache 命中率拉满。

2. **MergeTree 引擎 + 稀疏索引**:每次 INSERT 写一个不可变的 part(列存目录),后台慢慢合并成大 part。主键索引每 8192 行才一个 entry(叫 mark),1 亿行表索引只占几 MB,全部缓存在内存里。类比:图书馆不给每本书做卡片,只给每排书架一张卡。

3. **Skip Index + 物化视图**:在 mark 颗粒上挂 min/max、bloom filter、ngram 索引,过滤整段不命中的 mark。物化视图作为增量预聚合,INSERT 一来就更新,查询时走聚合后的小表。

## 实践案例

### 案例 1:点击流分析的最小骨架

```sql
CREATE TABLE hits (
    event_date Date,
    user_id UInt64,
    url String,
    INDEX url_bf url TYPE bloom_filter GRANULARITY 4
) ENGINE = MergeTree
ORDER BY (event_date, user_id);

SELECT user_id, count(*) FROM hits
WHERE event_date = '2026-05-29' AND url LIKE '%product%'
GROUP BY user_id ORDER BY count(*) DESC LIMIT 10;
```

**逐部分解释**:

- `ORDER BY (event_date, user_id)` 决定主键索引的排序方向,过滤 `event_date` 时直接二分到 mark 范围
- `bloom_filter` 索引在 mark 颗粒上判断"这段是否可能含 product 子串",不命中整段跳过
- 16 核机器上 100 亿行表跑这条查询,1 秒内返回

### 案例 2:Kafka 直接喂数据进来

```sql
CREATE TABLE kafka_in (raw String) ENGINE = Kafka
SETTINGS kafka_broker_list='kafka:9092', kafka_topic_list='events';

CREATE MATERIALIZED VIEW mv_to_hits TO hits AS
SELECT JSONExtractString(raw,'url') AS url, ...
FROM kafka_in;
```

物化视图当成 INSERT 触发器:Kafka 每来一条消息,自动写进 hits 表,秒级可见。比 Spark Streaming 链路简单一个数量级,GB/s 的吞吐撑住。

### 案例 3:用 quantilesTDigest 做 P99 监控

```sql
SELECT toStartOfMinute(ts) AS minute,
       quantilesTDigest(0.5, 0.99)(latency_ms) AS p
FROM api_log WHERE ts > now() - INTERVAL 1 HOUR
GROUP BY minute;
```

t-digest 是分布式聚合友好的近似分位结构,每个 shard 算自己的 t-digest,合并时几乎无损。1 亿点抽 P99 在 30 ms 内,内存占用是精确算法的 1/100。这也是 ClickHouse 内置 100+ 聚合函数的体现。

## 踩过的坑

1. **当 OLTP 用**:UPDATE 走 mutation 重写整个 part,改一行能触发 GB 级重写、延迟到分钟级。生产里要么用 ReplacingMergeTree 的"逻辑删",要么干脆别改。

2. **无脑改列类型**:`ALTER TABLE MODIFY COLUMN` 在大表上是整表重写,1 TB 表能跑几小时,期间不可见。schema 演进必须先小流量验证。

3. **跨 shard JOIN 不写 GLOBAL**:Distributed 表的 JOIN 默认 broadcast,几亿行右表会把网络打爆,实测 100 GB 右表在 10 节点集群广播要 10 分钟。要么 GLOBAL JOIN 在协调者预聚合右表,要么按相同 sharding key 做 colocated JOIN。

4. **用 ClickBench 跑分定生产容量**:基准跑分都是单表全扫描,生产里 5 表 JOIN + 子查询很常见,开源版无 CBO 经常选错 plan,实际容量要按真实负载压测。

## 适用 vs 不适用场景

**适用**:

- 读多写少的事件分析:点击流、日志检索、监控指标、A/B 实验
- 实时数仓:Kafka → ClickHouse 直写,秒级可见,GB/s 摄入
- 高基数 GROUP BY 任意维度切片:替代 Druid / Pinot 的预聚合 cube
- 单机硬件极限榨取:NVMe + 大内存 + 多核,不需要存算分离

**不适用**:

- OLTP / 高频 UPDATE / DELETE:走 mutation 重写,延迟分钟级
- 单行点查为主的工作负载:65536 行 batch 在 LIMIT 1 场景反而吃亏
- 跨表事务一致性要求强:只有 atomic INSERT,没有跨表 ACID
- 需要丰富 schema 类型(地理 / JSONB 索引 / 触发器 / 存储过程):类型生态比 PostgreSQL 弱

## 历史小故事(可跳过)

- **2005 年**:MonetDB X100 论文证明"向量化执行能比火山模型快 10-100 倍",但是研究 prototype,没产品化。同年 Stonebraker 的 C-Store 提出列存 + read/write 双引擎。

- **2010 年**:Yandex 内部的 Metrica 流量分析有 10 PB 级日志,要求亚秒级响应,市面上没东西能用,自研 ClickHouse。

- **2016 年**:Yandex 把 ClickHouse 开源,Apache 2.0 协议,GitHub 起飞。

- **2021 年**:自研 ClickHouse Keeper(C++ 写的 Raft)替换 Java ZooKeeper,解决高 part 创建率下 ZK GC 抖动问题。

- **2023 年**:ClickHouse Cloud GA,引入对象存储 + 计算节点池的存算分离架构,正面回应 Snowflake。

- **2024 年**:Schulze 等人在 VLDB 工业 track 发表正式论文,把十年工程经验写成 12 页系统总结。

## 学到什么

1. **专用工具做专用事**:把 OLTP 包袱完全丢掉(没有跨表事务、UPDATE 慢),换来 OLAP 极致速度——这个 tradeoff 在 2026 年仍然成立
2. **稀疏索引是 OLAP 的杠杆**:每 8192 行一个 mark,索引内存占用降三个数量级,扫描量降两个数量级
3. **向量化 + 列存是组合拳**:任何一个单独做都不够,必须列存提供 SIMD 友好的内存布局,向量化让 SIMD 能跑满
4. **理论 → 工程极致**也是创新:列存和向量化的论文 2005 就有了,ClickHouse 的贡献是把它做到工业级开源

## 延伸阅读

- 视频教程:[Robert Schulze — ClickHouse Architecture (CMU DB Talks 2023)](https://www.youtube.com/watch?v=tVDbKyu0p6w)(一作亲讲架构,90 分钟)
- 官方文档:[ClickHouse — MergeTree Engine](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree)(MergeTree 系列引擎全解)
- 论文 PDF:[VLDB 2024 — ClickHouse Lightning Fast Analytics](https://www.vldb.org/pvldb/vol17/p3731-schulze.pdf)
- ClickBench 项目:[ClickBench — 跨引擎 OLAP 基准](https://benchmark.clickhouse.com/)(对比 50+ 引擎)
- [[volcano-1994]] —— ClickHouse 的执行模型故意背离的对手
- [[duckdb]] —— 单机嵌入式版的同门师兄

## 关联

- [[volcano-1994]] —— 火山模型是被 ClickHouse 向量化批处理替代的旧范式
- [[cascades-1995]] —— 查询优化器框架,ClickHouse 24.x 才开始引入对应思想的 CBO
- [[duckdb]] —— 同源思路推到嵌入式单机场景,跟 ClickHouse 互补
- [[kafka]] —— 实时数仓里最常见的上游,Kafka 引擎表是 ClickHouse 直连消费的快捷方式
- [[snowflake]] —— 云数仓存算分离路线,跟 ClickHouse 的裸机极限路线哲学相左
- [[leis-2015-optimizers]] —— JOIN 顺序选择研究,正面解决 ClickHouse 长期短板
- [[neumann-2015-large-joins]] —— 大表 JOIN 的算法基础,ClickHouse 24.x grace hash join 的来源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[columnar-storage-formats-2023]] —— Columnar Storage Formats 2023 — Parquet/ORC 的体检报告
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[lfs-1991]] —— LFS 1991 — 把整个磁盘当日志写
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[snowflake]] —— Snowflake — 云数仓把存储和计算拆开
- [[papers/starrocks]] —— StarRocks — Doris 分叉出来的向量化 CBO 国产 OLAP
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析
