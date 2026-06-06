---
title: QuestDB — 高性能时序库
来源: https://github.com/questdb/questdb
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

QuestDB 是一套**专门为时序数据优化、敢于跟 C++ 数据库比性能的开源时序库**，2014 年起步，公司是 QuestDB Inc.（YC W20）。它的核心卖点：单表每秒百万级写入，毫秒级 SQL 查询，金融行情交易撮合都敢用。

日常类比：

- [[postgresql]] 像**综合医院**——什么病都看，结构化数据/JSON/全文检索都能扛
- [[influxdb]] 像**健康监测中心**——专做"按时间打点的指标"
- QuestDB 像**急救中心**——同样做时序，但每一毫秒都被压榨过：列存按时间分柜、SQL 过滤器现场编译成 SIMD 机器码

它跟 [[influxdb]]、[[timescaledb]]、[[clickhouse]] 同生态位，但定位是**金融行情/超低延迟**这一头。

## 为什么重要

不了解 QuestDB，下面这些事都没法解释：

- 为什么纳秒级股票行情、加密货币撮合所需的写入吞吐能在一台普通服务器上扛住——靠的是堆外 mmap 列存 + zero-GC 热路径
- 为什么 SQL 过滤器（`WHERE price > 100`）能比 C 写的 for 循环还快——JIT 把它编成 AVX2/AVX-512 指令
- 为什么"晚到一秒的行情数据"不会让数据库崩——O3 算法专治乱序到达
- 为什么一个数据库要同时讲两套协议（ILP 写、PG 读）——分别为吞吐和查询便利度量身定做

## 核心要点

QuestDB 做到"快"的关键可以拆成 **四个机制**：

1. **堆外列存 + mmap**：每一列是磁盘上一个独立文件，进程启动时 `mmap` 进地址空间，CPU 直接读内存就是读磁盘。Java 主体写业务逻辑，但**热路径全部走堆外**，绕开 JVM 垃圾回收（zero-GC）。

2. **designated timestamp + 时间分区**：表必须指定一个 `TIMESTAMP` 列做"指定时间戳"，数据按 HOUR/DAY/MONTH/YEAR 切分区。查询"近 1 小时"时只读对应分区文件，老数据连碰都不碰（partition pruning）。

3. **SQL filter JIT**：`WHERE` 子句执行时**现场编译成机器码**，针对当前 CPU 用 AVX2/AVX-512 SIMD 指令一次处理多行。C++ 实现，配置开关 `cairo.sql.jit.mode`（on/off/scalar）。

4. **O3 乱序写入**：v6.0 起，新数据先进"commit lag"内存暂存区，按时间戳排序后再合并入分区文件。免去入库前预排序——金融行情常有微秒级乱序，这条路保命。

底层架构图直观点说：

```text
ILP 写入  →  WAL/O3 暂存  →  按 ts 排序  →  追加到列文件分区
                                                   ↓
PG 协议查询  ←  JIT 编译 WHERE  ←  分区裁剪  ←  mmap 列文件
```

写入和查询是两条独立路径，共享的是底层 mmap 列文件——这种"读写分离但共享存储"的模式让两端各自优化到极致。

## 实践案例

### 案例 1：建表时为什么强制要 timestamp 列

```sql
CREATE TABLE trades (
  ts TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  size LONG
) TIMESTAMP(ts) PARTITION BY DAY;
```

`TIMESTAMP(ts)` 把 `ts` 列声明为 designated timestamp，`PARTITION BY DAY` 让数据按天切文件。没这两条，`SAMPLE BY 1m`、`LATEST ON ts PARTITION BY symbol`、`ASOF JOIN` 全都用不了——它们都依赖时间序列假设。

### 案例 2：时序专用 SQL

```sql
-- 每分钟最新成交价（SAMPLE BY = 时间桶聚合）
SELECT ts, symbol, last(price)
FROM trades
SAMPLE BY 1m;

-- 取每个标的最新一条（LATEST ON）
SELECT * FROM trades LATEST ON ts PARTITION BY symbol;

-- 把行情和报价按"最近一笔"对齐（ASOF JOIN）
SELECT t.ts, t.price, q.bid
FROM trades t ASOF JOIN quotes q ON symbol;
```

这三条 SQL 在 [[postgresql]] 里要么写不出，要么写出来慢 100 倍。它们是 QuestDB 的**身份证**。

### 案例 3：写入两条路、查询一条路

```text
高吞吐写入  →  ILP（InfluxDB Line Protocol，TCP/HTTP）  →  QuestDB
查询/BI    →  PostgreSQL wire 协议  →  Grafana / DBeaver / psql
```

ILP 是面向"边采集边推"的流式协议（schema-on-write，自动建表加列）；PG 协议复用整个 SQL 客户端生态。一个数据库讲两套协议，让上下游各取所需。

## 踩过的坑

1. **没声明 designated timestamp 等于自废武功**：建表时漏了 `TIMESTAMP(...)` 子句，所有时序 SQL 全部失效，分区也没了。新人最常见错。

2. **O3 commit lag 调大写延迟、调小写吞吐**：`cairo.commit.lag` 是允许"晚到多久"的窗口。值越大乱序容忍越好但查询能见到新数据越晚；值越小越实时但乱序数据可能被拒。金融场景一般 30s-60s。

3. **JIT 不是所有过滤器都加速**：JIT 只对**数值/时间列**的简单比较有效；字符串 `LIKE` 走解释器。看 `EXPLAIN` 结果里有没有 "JIT" 字样判断走了哪条路。

4. **WAL 表 vs 非 WAL 表写入语义不同**：v7+ 默认 WAL 表支持多客户端并发写，旧 O3 路径单写入器。混用时事务可见性会出意料外的事。

5. **SYMBOL 类型不是 VARCHAR**：QuestDB 有专门的 `SYMBOL` 类型，内部做字典编码（重复字符串映射为 int），存"标的代码""主机名"这种低基数字符串极省空间。但**高基数字段**（用户 ID、订单 ID）用 SYMBOL 反而拖累——字典越长查表越慢。

6. **数据补写要用 ALTER TABLE 而非 INSERT**：批量改历史数据如果直接 INSERT，会触发 O3 重排序，分区合并代价高。正确姿势是 detach 老分区、改完文件、再 attach 回来。

## 适用 vs 不适用场景

**适用**：
- 金融行情/交易撮合（百万级写、毫秒级查）
- IoT/工业传感器历史归档（按时间分区天然合身）
- 应用监控指标（替代 [[influxdb]]，但要 SQL 不要 InfluxQL/Flux）
- 任何"按时间打点 + SQL 分析"的场景

**不适用**：
- 强事务/外键/复杂关联（用 [[postgresql]]）
- 通用 OLAP 多表 join（用 [[clickhouse]]/[[starrocks]]）
- 文档型/键值型数据（用 MongoDB/Redis）
- 不带时间维度的纯业务表（QuestDB 的优化全围绕 timestamp 转，没时间戳就没意义）

## 学到什么

1. **JVM 也能做极致性能**——只要把热路径全部赶出 JVM 堆，C++ 写 SIMD/JIT，Java 只做调度。这条思路跟 [[clickhouse]] 全 C++、[[doris]] C++ 内核都不同，证明了"语言不重要、内存模型重要"
2. **时序数据库的"专"在哪里**——不是单纯加索引，而是从存储布局（按 ts 分区）到 SQL 方言（SAMPLE BY/LATEST ON/ASOF JOIN）整条链路重新设计。专用领域数据库的护城河就在"通用 SQL 写不出"的那几条特殊语句上
3. **JIT 不只是 V8/JVM 的专利**——SQL 引擎也在走"运行时编译成机器码"的路（[[clickhouse]] 同样在做）。固定 SQL 模板编一次跑亿次，运行时编译几毫秒摊薄到几乎为零
4. **协议分工**——ILP 重吞吐、PG 重生态。一个数据库讲两套协议是值得学的设计选择，避免"既要又要"撕裂代码
5. **mmap 是数据库的隐藏共识**——QuestDB、[[clickhouse]]、LMDB、SQLite 全都重度依赖 mmap。让 OS 替你管页缓存，比自己写 buffer pool 通常更稳

## 延伸阅读

- 官网与文档：[QuestDB Docs](https://questdb.io/docs/)（架构、SQL 扩展、配置参数全在这）
- 性能博客：[How we achieved 1.4M rows/s with O3](https://questdb.io/blog/)（O3 算法落地的工程报告）
- 基准对照：[Time Series Benchmark Suite](https://github.com/timescale/tsbs)（QuestDB/InfluxDB/TimescaleDB 同台 PK）
- [[influxdb]] —— 时序鼻祖，专用查询语言
- [[timescaledb]] —— [[postgresql]] 时序扩展，SQL 兼容更完整
- [[clickhouse]] —— OLAP 列存代表，向量化执行思路相通

## 关联

- [[influxdb]] —— 同生态位前辈，QuestDB 用 ILP 协议直接复用其客户端
- [[clickhouse]] —— 列存 + 向量化思路相通，但 QuestDB 专攻时序、CH 专攻 OLAP
- [[postgresql]] —— QuestDB 借 PG wire 协议复用其客户端生态
- [[grafana]] —— QuestDB 主流可视化前端，走 PG datasource
- [[timescaledb]] —— [[postgresql]] 时序扩展，跟 QuestDB 是直接对手；TS 强在 SQL 兼容、QDB 强在写吞吐

## 一句话总结

时序数据库赛道里**敢用 Java 主体写、却把性能挤进 C++ 热路径**的特例。把"列存 + 时间分区 + SIMD JIT + 乱序写入"这四张牌打齐，就能在金融行情这种最严苛场景里站住脚。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[doris]] —— Apache Doris — MySQL 协议 MPP OLAP 数据库
- [[grafana]] —— Grafana — 监控可视化看板
- [[influxdb]] —— InfluxDB — 专用时序数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[starrocks]] —— StarRocks — MPP 列存数据库
- [[tdengine]] —— TDengine — 一个设备一张表的国产 IoT 时序库
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展

