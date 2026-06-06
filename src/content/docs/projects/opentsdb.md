---
title: OpenTSDB — HBase 上的第一代分布式 TSDB
来源: https://github.com/OpenTSDB/opentsdb
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

OpenTSDB 是 2010 年 Benoit Sigoure 在 StumbleUpon 写的"骑在 HBase 上的时序数据库"，是历史上第一代真正能横向扩展到百亿数据点的开源 TSDB。日常类比：「自己从零造一栋大楼，地基打到承重柱都得操心；OpenTSDB 不造楼，它直接把房间盖在已有的 HBase 大楼里——HBase 已经解决了分布式存储、副本、扩容，TSDB 只负责装修成"专门放时间戳数据"的样式」。

数据写进去长这样：

```text
sys.cpu.user 1672531200 99.5 host=server01 region=cn-east
sys.cpu.user 1672531260 98.2 host=server01 region=cn-east
sys.cpu.user 1672531320 97.1 host=server01 region=cn-east
```

读法：metric 名 + 时间戳（秒）+ 数值 + 一组标签（key=value）。这种 **metric + tags** 数据模型是 OpenTSDB 首创，后来被 [[prometheus]]、[[influxdb]]、[[victoriametrics]] 全部继承。

## 为什么重要

不了解 OpenTSDB，下面这些事都没法解释：

- **时序索引设计的起点**：metric+tags 模型、UID 编码、按小时聚合行——这些今天 TSDB 的基本套路，第一次组合在一起就在 OpenTSDB
- **借力 vs 自造**：站在 HBase 肩膀上拿到分布式能力，是 2010 年代典型的"组合大于发明"工程范式
- **痛点教材**：tag 高基数会爆、查询语言贫弱、部署门槛高——后来 [[prometheus]] / [[influxdb]] 的设计选择都在反向回答 OpenTSDB 的这些痛
- **行业奠基**：Yahoo、雅虎日本、阿里早期监控都跑过 OpenTSDB，撑过百亿数据点，证明"分布式 TSDB"这条路走得通

## 核心要点

### 1. 数据模型与 UID 编码

OpenTSDB 不直接存字符串。每个 metric 名（`sys.cpu.user`）、tag key（`host`）、tag value（`server01`）都先去 `tsdb-uid` 表查一次，换成 **3 字节的 UID**。原因：HBase 的 row key 越短查得越快，3 字节足够覆盖 1600 万个不同字符串。

代价：UID 表本身得维护，第一次见到的 metric 要先注册，跨集群同步 UID 是痛点之一。

### 2. Row Key 设计：一小时一行

Row key 的拼法（按字节顺序）：

```text
[metric_uid 3B][timestamp_base 4B][tagk_uid 3B][tagv_uid 3B]...
```

关键点：`timestamp_base` 是**小时对齐**的——同一小时内所有数据点共享一个 row key，每个数据点变成这一行里的一**列**，列名是"小时内的秒偏移"（0-3599）。

好处：HBase 单行可以放 3600 列，一小时数据顺序读，磁盘 seek 极少。
代价：插入要做"列追加"，写完还得做 compaction 把零散列合并成大列，否则查询时要扫一堆小列。

### 3. 两张表 + JVM 进程

整个 OpenTSDB 只有两张 HBase 表（`tsdb` 数据表 + `tsdb-uid` 映射表），加上一个无状态的 JVM 进程（叫 **TSD**）负责接 HTTP 写入/查询。

这个架构非常"薄"——HBase 是肌肉，TSD 是皮肤。也正因这么薄，部署 OpenTSDB 等于部署完整 Hadoop 栈：HDFS + ZooKeeper + HBase + JVM，没几十台机器跑不起来。

## 实践案例

### 案例 1：写入数据（HTTP API）

```bash
curl -X POST http://localhost:4242/api/put \
  -H "Content-Type: application/json" \
  -d '{
    "metric": "sys.cpu.user",
    "timestamp": 1672531200,
    "value": 99.5,
    "tags": {"host": "server01", "region": "cn-east"}
  }'
```

或者 telnet 风格 line protocol（监控 agent 大都支持）：

```text
put sys.cpu.user 1672531200 99.5 host=server01 region=cn-east
```

### 案例 2：查询过去一小时 CPU

```bash
curl "http://localhost:4242/api/query?start=1h-ago&m=avg:sys.cpu.user{host=server01}"
```

读法：从 1 小时前开始，对 `sys.cpu.user{host=server01}` 做平均聚合。这就是 OpenTSDB 的"查询语言"——一段拼在 URL 里的字符串，没有 SQL，没有管道，也没有 PromQL 的灵活算子。

### 案例 3：UID 注册

第一次写入新 metric 前，要么开 `tsd.core.auto_create_metrics=true` 让 TSD 自动注册，要么手动：

```bash
curl -X POST http://localhost:4242/api/uid/assign \
  -d '{"metric": ["sys.cpu.user"]}'
```

生产环境通常关掉自动注册，否则程序员一打错字就生一个新 metric，UID 表越长越脏。

## 踩过的坑

1. **Tag 高基数直接拖垮 HBase scan**：把 `user_id` 或 `trace_id` 塞进 tags，row key 维度爆炸，查询要扫海量 region。后来所有时序库的"高基数雷区"在 OpenTSDB 这里第一次被发现，[[influxdb]] 和 [[prometheus]] 的设计都在直面这个问题。

2. **查询表达力弱**：URL 字符串拼出来的查询，没有 join、没有子查询、没有窗口函数。复杂分析得拉到 Hadoop 上跑 MapReduce，体感与 [[prometheus]] 的 PromQL 差一个时代。

3. **部署门槛极高**：HBase + HDFS + ZooKeeper + JVM，监控小团队望而生畏。这是后来 [[prometheus]]（单二进制）和 [[influxdb]]（单二进制）能快速上位的原因之一。

4. **Compaction 与读写竞争**：行末 compaction 把 3600 列合一时会与新写入抢 region，配置不当会出现写入毛刺。社区文档里"调 compaction 间隔"是高频话题。

## 适用 vs 不适用场景

**适用**：

- 已有 Hadoop / HBase 集群想复用，不想再独立维护一套存储
- 百亿级数据点的长期保留场景，原始精度不丢
- 写多读少的纯监控指标存储

**不适用**：

- 短期高频拉取告警 → [[prometheus]] 单二进制更轻
- 复杂分析 / SQL → [[clickhouse]] 或 [[timescaledb]]
- 中小团队没有 HBase 运维能力 → [[victoriametrics]] / [[influxdb]]
- 高基数标签（trace_id 等）→ 任何 TSDB 都不合适，应走 trace 系统

## 历史小故事（可跳过）

- **2008**：Google 发布 Bigtable 论文，启发 HBase 在 Hadoop 之上长出来
- **2010**：Sigoure 在 StumbleUpon 用 Java 写下 OpenTSDB 1.0，把"时序"加进 HBase 的应用清单
- **2013**：[[influxdb]] 出现，明确"专用单二进制 TSDB"路线，反 OpenTSDB 的部署复杂度
- **2015**：Prometheus 1.0，借鉴 metric+tags 模型但走拉模式 + PromQL，成为云原生监控事实标准
- **2018+**：Yahoo / 雅虎日本 / 阿里早期监控大量跑 OpenTSDB，证明分布式 TSDB 工程上可行
- **2020s**：OpenTSDB 仍在维护，但新项目几乎不再选它——后辈在易用性、查询力、单机性能上全面胜出

15 年时间，OpenTSDB 完成了"开拓者"的历史使命：证明路径可行、定下数据模型、暴露所有痛点供后来者优化。

## 学到什么

1. **组合优于发明**：把已有强基建（HBase）当承重柱，自己只做"装修"，工程量小一个量级
2. **数据模型可以传承几十年**：metric + tags 这一刀，至今所有主流 TSDB 都没改
3. **第一代产品最大价值是暴露问题**：高基数、查询贫弱、部署沉重——OpenTSDB 的痛点单子就是后辈的产品需求清单
4. **薄即是脆**：架构越薄越依赖底座，HBase 一抖整个 TSDB 抖；后来的单二进制思路是对这个脆弱性的反向回答

## 延伸阅读

- 官方文档：[OpenTSDB Documentation](http://opentsdb.net/docs/build/html/index.html)
- 设计论文（Sigoure 在 OSCON 2012 的 talk）：[Scalable Time Series Database](http://opentsdb.net/misc/opentsdb-eu-osmc.pdf)
- HBase row key 拆解教程：[OpenTSDB Schema](http://opentsdb.net/docs/build/html/user_guide/backends/hbase.html)
- [[hbase]] —— OpenTSDB 的承重柱
- [[prometheus]] —— 后辈竞品，metric+tags 模型继承自 OpenTSDB

## 关联

- [[hbase]] —— 没有 HBase 就没有 OpenTSDB
- [[influxdb]] —— 反思 OpenTSDB 部署复杂度的下一代
- [[prometheus]] —— 借鉴数据模型，走拉模式 + PromQL 路线
- [[victoriametrics]] —— 兼容 Prometheus 协议，强调单机性能
- [[timescaledb]] —— PostgreSQL 路线的时序扩展，与 OpenTSDB 思路相反

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[influxdb]] —— InfluxDB — 专用时序数据库
- [[m3]] —— M3 — Uber 的分布式 TSDB
- [[prometheus]] —— Prometheus — 时序监控系统
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展
- [[victoriametrics]] —— VictoriaMetrics — 高性能 Prometheus 替代

