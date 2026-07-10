---
title: NebulaGraph — 国产分布式图数据库
来源: https://github.com/vesoft-inc/nebula
日期: 2026-06-01
分类: 数据库 / 图
难度: 中级
---

## 是什么

NebulaGraph 是 Vesoft 2018 年开源的**分布式图数据库**——面向"百亿到万亿级点边、可水平扩展集群"这类规模。创始团队有人在 Facebook 做过 TAO（社交图存储），把大规模图服务的经验带到开源产品里。

日常类比：[[neo4j]] 像一栋装修精致的别墅，单机就够住、住得舒服；NebulaGraph 像一片可以扩楼的小区——计算楼、元数据楼、存储楼分开盖，要更快查询就加计算，要存更多就加存储，互不干扰。

一句话：**小到中等图用 Neo4j 往往更省心；超大图、要存算分离扩容时，NebulaGraph 是常见选项之一**。

## 为什么重要

- **国产开源分布式图库代表**——国内互联网风控、推荐等场景里常见
- **存算分离**——计算层无状态可单独扩缩，热点查询不必和存储绑死
- **Apache 2.0**——分布式集群能力在开源发行里可用，和"社区版单机、集群另授权"的产品对比时这点常被提到
- **nGQL 含 openCypher 兼容子集**——会写 Cypher 的 `MATCH` 能较快上手，但不是 100% Cypher

## 核心要点

### 1. 三服务分离架构

- **Graphd**（计算层）：解析 nGQL、做规划与执行。**无状态**，可水平扩展
- **Metad**（元数据层）：schema、space、分片映射；Raft 多副本
- **Storaged**（存储层）：RocksDB；每个分片一个实例 + Raft group

类比餐厅：Graphd 是服务员，Metad 是经理台账，Storaged 是后厨。客人多加服务员，菜多加后厨。

### 2. 数据模型：LPG + 强类型 VID

跟 Neo4j 一样用 **属性图**（Label Property Graph）：点有 tag + 属性，边有 type + 属性。

关键差别：**VID（点 ID）必须用户给定**，建 space 时钉死类型（如 `FIXED_STRING(20)` 或 `INT64`）。好处是导入快、易和外部系统对齐；代价是建库前要想清楚，后期不能改类型。

### 3. nGQL：原生 GO + openCypher 子集

```ngql
CREATE SPACE social(partition_num=10, replica_factor=3, vid_type=FIXED_STRING(20));
INSERT VERTEX person(name, age) VALUES "alice":("Alice", 30);
INSERT EDGE friend(since) VALUES "alice"->"bob":(2020);
MATCH (a:person)-[:friend*1..3]->(b) WHERE a.name == "Alice" RETURN b.name;
```

`MATCH` 等是 **openCypher 兼容的查询子集**（主要是 DQL）；DDL/DML 仍是 Nebula 自己的写法，**不是**"90% Cypher 原样粘贴就能跑"。深度遍历常用原生 `GO`：

```ngql
GO 3 STEPS FROM "alice" OVER friend YIELD friend.dst;
```

生产里多跳遍历常优先 `GO`；复杂模式匹配再用 `MATCH`。

## 实践案例

### 案例 1：本地起 mini 集群

```bash
git clone https://github.com/vesoft-inc/nebula-docker-compose
cd nebula-docker-compose && docker compose up -d
```

**逐部分解释**：

- 官方 compose 在一台机器拉起 Graphd / Metad / Storaged
- Graphd 默认 **9669** 端口接 nGQL 客户端
- 可视化可另起 NebulaGraph Studio 容器，用浏览器画图

### 案例 2：建微型社交图

```ngql
CREATE SPACE demo(partition_num=10, replica_factor=1, vid_type=FIXED_STRING(20));
USE demo;
CREATE TAG person(name string, age int);
CREATE EDGE friend(since int);
# 等 heartbeat（默认约 10s）后再 INSERT
```

**逐部分解释**：

- `replica_factor=1` 只适合本地玩；生产至少 3
- 建完 TAG/EDGE 必须等元数据同步，立刻写会报错——脚本里 `sleep 10` 或重试
- VID 用字符串时长度不能超过建库时的 `FIXED_STRING(n)`

### 案例 3：风控多跳

```ngql
GO 3 STEPS FROM "user_42" OVER transfer YIELD transfer.dst, transfer.amount;
```

**逐部分解释**：

- 问的是"3 跳内资金往来"，关系库要多次大表 join
- `GO` 把遍历下推到存储层并行
- 大图必须加 `| LIMIT N` 或业务截断，防止扫爆

## 踩过的坑

1. **VID 类型钉死**：`FIXED_STRING(20)` / `INT64` 后期不能改，先按真实业务 ID 设计
2. **schema 有延迟**：`CREATE TAG` 后默认约 10 秒才能写；建完立刻插会失败
3. **`replica_factor=1` 是定时炸弹**：单副本宕机可能丢分片，生产从 3 起步
4. **深度遍历要限流**：`GO 6 STEPS` 在大图上可能扫到海量节点，务必 `LIMIT` / 截断
5. **`MATCH` 与 `GO` 分工**：兼容层不等于更快；深度遍历优先 `GO`

## 适用 vs 不适用场景

**适用**：

- 数十亿到万亿级点边、需要水平扩展
- 高写入 + 高并发多跳（风控、推荐、社交）
- 已有 Spark / Flink / HDFS，要接图做 OLTP 风格查询
- 多 space 隔离的多租户

**不适用**：

- 百万级小图 → [[neo4j]] 单机更省心
- 要完整 Cypher / GQL 生态与工具链 → [[neo4j]] 更合适
- 团队没有分布式运维经验（三服务 + Raft + RocksDB）
- 重 OLAP 图分析 → 可看 nebula-algorithm，或对比 [[tigergraph]] 等

## 历史小故事（可跳过）

- **2018**：Vesoft 创立，团队背景含 Facebook TAO / 国内大厂
- **2019**：v1.0 开源，C++ + 存算分离
- **2020–2021**：v2.0 起 nGQL 加强对 openCypher 的兼容，进入更多互联网公司视野
- **2022–2024**：v3.x 稳定迭代；企业版路线另有 GQL 等能力宣传
- **近年**：在国内超大图场景里出镜率高，海外社区也在增长

## 学到什么

- **存算分离**是从十亿走向更大规模的常见架构跳跃
- **强类型 VID**换来导入与对齐效率，牺牲的是后期灵活性
- **方言 vs 标准**：`GO` 快但绑定厂商；`MATCH` 更眼熟但不是完整 Cypher
- 选图库先看**数据规模与运维能力**，再看语法像不像 Cypher

## 延伸阅读

- 官方文档：[NebulaGraph Docs](https://docs.nebula-graph.io/) — 部署、nGQL、调优
- nGQL 与 openCypher：[兼容说明](https://docs.nebula-graph.io/master/3.ngql-guide/1.nGQL-overview/1.overview/)
- 入门视频：[NebulaGraph 官方 B 站](https://space.bilibili.com/472621355)
- 图基准：[LDBC SNB](https://ldbcouncil.org/)

## 关联

- [[neo4j]] —— 单机生态成熟；小图常用 Neo4j，大图扩容常看 Nebula
- [[dgraph]] —— 分布式图另一路线（GraphQL / RDF 味道不同）
- [[postgresql]] —— 多跳深查的反面参照
- [[clickhouse]] —— 列式 OLAP，和图库在分析场景互补
- [[rocksdb]] —— Storaged 底层引擎
- [[tigergraph]] —— 商业图分析对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
