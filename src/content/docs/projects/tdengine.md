---
title: TDengine — 一个设备一张表的国产 IoT 时序库
来源: https://github.com/taosdata/TDengine
日期: 2026-05-31
分类: 数据库 / 时序
难度: 中级
---

## 是什么

TDengine 是北京涛思数据 2017 年用 C 语言写、2019 年开源的时序数据库，专门给工业 IoT、车联网、智能电表这类「百万设备、每秒打点」的场景。日常类比：「[[influxdb]] 是大型公共仓库，所有设备的数据放一个大房间，靠贴标签（tag）找；TDengine 是公寓楼，**每台设备分一间小屋（一张表）**，找谁直接进对应那间屋，不用先扫整栋楼」。

它最显眼的卖点是 **「一个设备一张表」**：每个传感器/设备独占一张子表，schema 来自一个叫**超级表（STable）**的模板。这一刀切下去，写入吞吐、压缩比、查询定位都直接拉满。

## 为什么重要

不了解 TDengine，下面这些事不太好解释：

- 国产数据库代表作之一，信创/运营商/电网/车厂场景里替换 InfluxDB / OpenTSDB 的常见选项
- 一体化设计：把"时序库 + 消息队列 + 缓存 + 流计算"塞进一个二进制，运维组件少
- 数据建模哲学和 [[influxdb]] 正好相反——一个走"宽表打 tag"，一个走"千万张窄表"
- 3.0（2022）整套重写为分布式云原生，是观察"开源数据库怎样从单机演化到云"的活案例

## 核心要点

### 1. 一个设备一张表 + 超级表

假设有 100 万个温度传感器：

- 普通做法（InfluxDB）：一张 `temperature` 表，靠 `device_id` tag 区分
- TDengine 做法：建一个 STable `temperature`——**普通列**是测量值（ts、temp、humidity），**TAGS** 是设备维度（device_id、location）；每个设备一张子表 `t_001 / ... / t_1000000`，schema 从模板继承

为什么这样切：同一设备的连续数据点，时间戳单调、数值高度相关，独占一张表后**列存压缩**和**顺序扫描**都吃满。跨设备查询走 STable 这一层做并行下推；按 location 过滤时走的是标签索引，不是把 location 当成普通列扫。

### 2. 列存 + 时序专用压缩

底层是自研 TSDB 引擎，存储列式：

- 时间戳列：delta-of-delta（相邻时间戳差再求差，常常压成几比特）
- 整型列：simple-8b、RLE
- 浮点列：Gorilla（Facebook 时序压缩算法）

官方声称典型场景压缩比 10x 以上。这不是魔法——「一台设备每秒一条」本来就有大量冗余。

### 3. 集群四种节点（3.0 之后）

- **mnode**：管元数据（库、表、用户、权限），少而稳
- **vnode**：切分数据，一组设备一个 vnode，扩容靠加 vnode
- **qnode**：算查询（聚合、JOIN、窗口），与存储分离
- **snode**：跑流式计算

存算分离 + 元数据集中，是 2022 年云原生改造的主轴。

### 4. SQL + 时间窗口

查询语言是类 SQL（TAOS SQL），多了一组**时间窗口算子**：

- `INTERVAL(1m)` 滚动窗口
- `SLIDING(30s)` 滑动窗口
- `SESSION(ts, 5m)` 会话窗口（间隔超 5 分钟切一段）
- `STATE_WINDOW(status)` 状态窗口（status 变了就切）

时序场景里 80% 的查询都是「按时间分桶聚合」，这些算子直接对应业务话术。

## 实践案例

### 案例 1：本地起一个

```bash
docker run -d --name tdengine -p 6030-6049:6030-6049 \
  -p 6041:6041 tdengine/tdengine:3.3.0.0
docker exec -it tdengine taos
```

`taos` 是命令行客户端，连上后就能写 SQL。

### 案例 2：建库 + 超级表 + 子表 + 写入

```sql
CREATE DATABASE iot;
USE iot;

CREATE STABLE temperature (
  ts TIMESTAMP, temp FLOAT, humidity FLOAT
) TAGS (device_id BINARY(32), location BINARY(64));

CREATE TABLE t_001 USING temperature TAGS ('dev-001', 'beijing');
INSERT INTO t_001 VALUES (NOW, 23.5, 60.2);
```

读法：先建模板 STable（**列**是测量值，**TAGS** 是标签维度），再用 `USING` 从模板派生子表，写入直接插子表。

### 案例 3：跨设备时间窗口查询

```sql
SELECT AVG(temp), location
FROM temperature
WHERE ts > NOW - 1h
INTERVAL(5m)
GROUP BY location;
```

读法：从超级表 `temperature` 取最近 1 小时数据，每 5 分钟一桶，按 `location` 标签分组求温度均值。**STable 这一层会自动并行下推到所有相关子表**。

## 踩过的坑

1. **STable schema 改起来痛**：列加减受限，标签可改但开销大。建模前要把"哪些是测量列、哪些是设备标签"想清楚——一旦投产，改一次要全库重整。

2. **子表数量不是越多越好**：百万级子表正常，但元数据放在 mnode，**亿级子表**就要重新规划 vnode 切分策略，否则元数据查询本身就成瓶颈。

3. **跨 STable 全局聚合慢**：单 STable 内部并行下推快，但「把 5 个不同 STable 的数据 JOIN 起来」要走 qnode 上层，性能不如同 STable。建模时尽量收拢到一个 STable。

4. **AGPL + 企业版边界**：开源版功能很完整，但跨数据中心复制、热备、运维台等放在企业版/Cloud。自部署前先确认上下游需要哪些高可用特性，别等上线了才发现要付费。

## 适用 vs 不适用场景

**适用**：

- 工业 IoT / 车联网 / 智能电表：百万级设备、写多读少、时间窗口分析
- 国产化替换 [[influxdb]] / OpenTSDB 的信创场景
- 想用一个二进制覆盖"时序存储 + 简单流计算 + 设备最新值缓存"的中型团队

**不适用**：

- 强事务、外键、复杂 JOIN → 用 [[postgresql]]
- 短期高频监控（< 1 周）→ 用 [[prometheus]] 更轻
- 通用 OLAP 多维分析 → [[clickhouse]] / [[starrocks]] / [[doris]]
- 全文搜索 / 文档存储 → Elasticsearch

## 历史小故事（可跳过）

- **2017**：陶建辉创办涛思数据。陶建辉之前做过 Motorola 工程师、和信通信 CTO，跨行做 TSDB
- **2019.07**：1.0 开源（GPLv3），对外口号「比 InfluxDB 快 10 倍」（营销口径，非普适基准）掀起一波讨论
- **2020**：GitHub star 破万，进入 CNCF 时序库讨论圈
- **2022.08**：3.0 发布，整套重写为分布式云原生（mnode/vnode/qnode/snode），同时启动 TDengine Cloud
- **2024**：开源版功能持续补齐，企业版主推跨 IDC 与高可用

7 年从「单机比 InfluxDB 快」走到「云上托管 + 企业级高可用」，节奏与 [[influxdb]] v1→v3 的演化几乎同频。

## 学到什么

1. **建模选型决定一切**：「一个设备一张表」是把『时序数据按设备天然分区』这一领域知识硬编码进引擎，换来数倍性能——专用系统的胜利总是来自牺牲通用性
2. **列存 + 领域压缩**：delta-of-delta、Gorilla 这些算法本身不新，但只有当数据形状（连续、低熵）匹配时才打得出 10x 压缩
3. **一体化 vs 组件化的取舍**：把队列、缓存、流计算塞进一个二进制，运维省心但调优空间小；中型团队偏前者，超大规模偏后者
4. **存算分离是云原生数据库的共同终点**：3.0 切出 qnode 与 snode，与 [[clickhouse]]、[[doris]] 近年的演化完全同向

## 延伸阅读

- 官方文档：[TDengine Docs](https://docs.taosdata.com/)
- 设计论文风介绍：[TDengine 3.0 架构](https://docs.taosdata.com/tdinternal/arch/)
- [[influxdb]] —— 时序赛道头号开源对手，建模哲学正相反
- [[timescaledb]] —— PG 扩展派代表

## 关联

- [[influxdb]] —— 一个走「宽表打 tag」，一个走「一设备一表」，对照理解最快
- [[timescaledb]] —— PG 上做时序分块，定位介于通用与专用之间
- [[questdb]] —— 同类专用 TSDB，主打 SIMD + SQL
- [[prometheus]] —— 拉模式短期监控，与 TDengine 长期存储互补
- [[clickhouse]] —— 通用列存 OLAP，可跑时序但缺时间窗口算子

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
