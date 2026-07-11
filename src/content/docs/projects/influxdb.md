---
title: InfluxDB — 专用时序数据库
来源: https://github.com/influxdata/influxdb
日期: 2026-05-29
分类: 数据库 / 时序
难度: 中级
---

## 是什么

InfluxDB 是 InfluxData 公司 2013 年用 Go 语言写的"专门为时序数据优化"的数据库，单机每秒能写入百万级数据点。日常类比：「[[postgresql]] 是大百货公司——什么数据都收，结构化、文档、JSON 都能塞；InfluxDB 是专门卖钟表的店——只做一件事：按时间打点存指标，做到极致」。

典型数据长这样：

```text
cpu,host=server01 usage_idle=99.5 1672531200000000000
cpu,host=server01 usage_idle=98.2 1672531260000000000
cpu,host=server01 usage_idle=97.1 1672531320000000000
```

每行一条数据点：标签（host=server01）+ 数值（usage_idle）+ 纳秒时间戳。这种"一连串带时间戳的测量值"就是时序数据，也是传感器、服务器监控、股票行情、运维指标的共通形态。

## 为什么重要

不了解 InfluxDB，下面这些事都没法解释：

- 工业 IoT / 运维监控里的常见选择之一（厂商案例里常能见到戴尔、IBM、思科等），不是唯一标准答案
- 自带 InfluxQL（类 SQL）+ Flux（函数式）双查询语言，初学和重度分析两不误
- 配套全家桶：Telegraf（采集 agent）+ Chronograf（看板）+ Kapacitor（告警）+ InfluxDB（存储），合称 TICK 栈
- 与 [[grafana]]、[[prometheus]] 常被一起比较：Prometheus 偏拉模式短期监控，InfluxDB 偏长期存储 + 业务指标，Grafana 是大家共用的看板皮

## 核心要点

### 1. 数据模型：四件套

每条数据点必有四样东西：

- **measurement**：测量主题（类似表名），例如 `cpu`、`temperature`
- **tags**：被索引的标签（字符串），例如 `host=server01`、`region=cn-east`
- **fields**：不被索引的数值字段，例如 `usage_idle=99.5`、`temp=23.5`
- **timestamp**：纳秒级时间戳

关键差异：tags 索引化（适合做过滤维度，但不适合放高基数值）；fields 不索引（适合放真正的测量值）。

### 2. TSM 引擎

底层存储叫 TSM（Time-Structured Merge Tree），为时序场景定制的 LSM 变体。LSM 像"先写小本子、定期合并大账本"的策略；TSM 在此之上多做了"按时间分块 + 列式压缩"，让"近 1 小时数据"和"3 个月前数据"分开放，查近期数据极快、压老数据极小。

### 3. Continuous Query

老数据自动降采样：原始数据每秒一条留 7 天，超过 7 天自动压成"每分钟平均值"再留 30 天，再老压成"每小时平均值"。靠的是 Continuous Query（v1）/ Tasks（v2）。这是时序库与传统 OLTP 库最大的体感差别——时间维度本身就是降维线索。

## 实践案例

### 案例 1：本地起一个

```bash
docker run -p 8086:8086 \
  -v $PWD/influx-data:/var/lib/influxdb2 \
  influxdb:2
```

浏览器开 `http://localhost:8086`，按引导建好 org / bucket / token，3 分钟搞定。

### 案例 2：写入数据（line protocol）

InfluxDB 用一种叫 line protocol 的纯文本格式：

```text
cpu,host=server01,region=cn-east usage_idle=99.5,usage_user=0.3 1672531200000000000
```

读法：`measurement,tag1=v1,tag2=v2 field1=v1,field2=v2 timestamp`。逗号空格分隔，错一格写不进。

通过 HTTP 写入：

```bash
curl -XPOST "http://localhost:8086/api/v2/write?org=myorg&bucket=metrics" \
  -H "Authorization: Token $TOKEN" \
  -d "cpu,host=server01 usage_idle=99.5"
```

### 案例 3：Flux 查询

```flux
from(bucket: "metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cpu")
  |> filter(fn: (r) => r.host == "server01")
  |> mean()
```

读法：从 metrics 桶取数 → 取最近 1 小时 → 筛 cpu measurement → 筛 host=server01 → 求均值。每一步用 `|>` 连起来，像 Unix 管道。

## 踩过的坑

1. **v1 / v2 / v3 不兼容**：v1 是 InfluxQL + 单一二进制；v2 改 Flux + 多组件；v3 完全重写为 IOx 引擎（Rust + Arrow + Parquet 存储），SQL 也回来了。三代之间数据迁移很痛，选版本前先看上下游兼容性。

2. **Tag 高基数性能崩**：和 [[prometheus]] 一样的雷——把 user_id / trace_id 这种千万级唯一值塞进 tags，索引爆炸内存爆炸。tag 应该是有限维度（host / region / status），fields 才是真正的测量值。

3. **Retention 默认无限留**：v1 的 Retention Policy、v2 的 bucket retention 默认常是永不过期，磁盘几个月就爆。建库后第一件事改保留期，例如 30 天。

4. **Flux 学习曲线**：函数式语法 + 管道操作 + 自创函数库，对只会 SQL 的人陌生。v3 把 SQL 加回来部分缓解。

## 适用 vs 不适用场景

**适用**：

- 服务器 / 容器 / IoT 设备的监控指标存储
- 业务时序指标（订单数、QPS、活跃用户）的中长期保留
- 需要按时间窗口做聚合、降采样、对比的分析

**不适用**：

- 需要事务、外键、复杂 JOIN → 用 [[postgresql]]
- 短期高频拉取监控（< 1 周）→ 用 [[prometheus]] 更轻
- 全文搜索 / 文档存储 → 用 Elasticsearch / MongoDB
- 极高基数的 trace 数据（每个请求一条）→ 用 ClickHouse / 专用 trace 系统

## 历史小故事（可跳过）

- **2013**：Paul Dix 创立 InfluxData，用 Go 写第一版 InfluxDB 并开源早期版本
- **2016**：InfluxDB 1.0 GA（约 9 月），TSM 引擎与 InfluxQL 成为主线
- **2020**：v2.0 GA（约 11 月）——模块化与 Flux 函数式查询落地；2018–2019 多为设计/预览期
- **2023**：InfluxDB 3.0 公布——底层用 Rust 重写为 IOx，存储改 Apache Parquet + DataFusion 查询，对接 Iceberg 表格式
- **2024**：IOx 同步推 Cloud 与 OSS 版，部分商业化（无限 cardinality 等高级特性留给云版）

13 年间从"Go 单体 + 自家协议"演化到"Rust + 列存 + 标准生态"，时序赛道的工程压力可见一斑。

## 学到什么

1. **专用 vs 通用的取舍**：通用关系库可以放时序数据，但写入吞吐与压缩比相差 10-100 倍。专用引擎用领域假设换性能
2. **数据模型决定一切**：tags 索引、fields 不索引——这一刀切下去，性能与正确用法都被定死
3. **降采样是时序库的灵魂**：原始细节有保质期，老数据合并是常态而非例外
4. **重写是大型项目的常态**：v1 → v2 → v3 三次大重构，每次都换语言换引擎换协议，代价巨大但活得更久

## 延伸阅读

- 官方文档：[InfluxDB Docs](https://docs.influxdata.com/)
- 厂商对比文：[InfluxDB vs Prometheus](https://www.influxdata.com/comparison/influxdb-vs-prometheus/)（看技术维度，立场自带偏向）
- [[grafana]] —— 时序数据看板的事实标准
- [[prometheus]] —— 同赛道竞品，拉模式短期监控

## 关联

- [[postgresql]] —— 通用关系库，时序场景下要扩 TimescaleDB
- [[grafana]] —— InfluxDB 的看板皮，前后端经常一起出现
- [[prometheus]] —— 监控生态的另一极，与 InfluxDB 互为参考系

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[grafana]] —— Grafana — 监控可视化看板
- [[opentsdb]] —— OpenTSDB — HBase 上的第一代分布式 TSDB
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[prometheus]] —— Prometheus — 时序监控系统
- [[questdb]] —— QuestDB — 高性能时序库
- [[tdengine]] —— TDengine — 一个设备一张表的国产 IoT 时序库
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展

