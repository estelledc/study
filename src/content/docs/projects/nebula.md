---
title: NebulaGraph — 国产分布式图数据库
来源: https://github.com/vesoft-inc/nebula
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

NebulaGraph 是 Vesoft 公司 2018 年在杭州开源的**分布式图数据库**——专门为"万亿级点边、千节点集群"这种规模而生。创始人叶小萌之前在 Facebook 做过 TAO（Facebook 内部社交图存储），把那套经验带回国内做开源。

日常类比：[[neo4j]] 像一栋装修精致的别墅，单机就够住、住得舒服；NebulaGraph 像一片可以无限扩楼的小区——三种功能楼分开盖（计算楼、元数据楼、存储楼），需要更快查询就加计算楼，需要存更多数据就加存储楼，互不干扰。

一句话：**Neo4j 在十亿点边内最舒服；NebulaGraph 是为百亿到万亿规模设计的**。

## 为什么重要

- **国产开源图数据库的代表**——多家大型互联网公司在用，是中国互联网风控和推荐场景默认选项之一
- **存算分离架构**——计算层无状态，可单独扩缩，热点查询不会拖累存储；这是它能扛住万亿规模的核心
- **Apache 2.0 协议**——和 Neo4j 社区版"集群要付费"不同，NebulaGraph 的分布式集群本身就免费
- **nGQL 兼容 Cypher**——从 Neo4j 迁过来不用从零学，常见语法照搬即可

## 核心要点

### 1. 三服务分离架构

NebulaGraph 把传统数据库的"一个进程包打天下"拆成三个独立服务：

- **Graphd**（计算层）：解析 nGQL、做查询规划与执行。**无状态**，挂了重启就行，可任意水平扩展
- **Metad**（元数据层）：存 schema、space 配置、分片到机器的映射。Raft 多副本保证高可用
- **Storaged**（存储层）：底层是 RocksDB，每个分片一个 RocksDB 实例 + 一个 Raft group

类比餐厅分工：Graphd 是服务员（接单、理解需求），Metad 是经理台账（菜单和桌位表），Storaged 是后厨（真正存食材）。客人变多就加服务员，菜变多就加后厨，不用整体扩容。

### 2. 数据模型：LPG + 强类型 VID

跟 Neo4j 一样用 **属性图模型**（Label Property Graph）：

- 点（vertex）有 tag（类型标签），可挂属性
- 边（edge）有 type（类型），**也可挂属性**——比如 `friend` 边记录 `since` 时间

但有个关键差别：**VID（点 ID）必须用户给定**，类型在建库时就钉死（`FIXED_STRING(20)` 或 `INT64`）。Neo4j 是系统自动生成 ID，NebulaGraph 强迫你想清楚——好处是导入快、方便外部系统对齐；代价是建库前必须设计好。

### 3. nGQL：Cypher 风味的方言

```ngql
CREATE SPACE social(partition_num=10, replica_factor=3, vid_type=FIXED_STRING(20));
INSERT VERTEX person(name, age) VALUES "alice":("Alice", 30);
INSERT EDGE friend(since) VALUES "alice"->"bob":(2020);
MATCH (a:person)-[:friend*1..3]->(b) WHERE a.name == "Alice" RETURN b.name;
```

90% 的 Cypher 直接能跑。但 NebulaGraph 还有自己原生的 `GO` 语句，专门做多跳遍历：

```ngql
GO 3 STEPS FROM "alice" OVER friend YIELD friend.dst;
```

`GO` 是引擎原生执行，性能比 `MATCH` 快不少；`MATCH` 是为兼容 Cypher 写的翻译层。生产场景的深度遍历优先用 `GO`。

## 实践案例

### 案例 1：本地起一个 NebulaGraph 集群

官方推荐用 docker-compose 起 mini 版本（一台机器跑全套）：

```bash
git clone https://github.com/vesoft-inc/nebula-docker-compose
cd nebula-docker-compose && docker-compose up -d
```

起来后 9669 端口是 Graphd 入口，连进去就能用 nGQL。可视化用 NebulaGraph Studio（另起容器，浏览器打开就有图编辑器）。

### 案例 2：建一个微型社交图

```ngql
CREATE SPACE demo(partition_num=10, replica_factor=1, vid_type=FIXED_STRING(20));
USE demo;
CREATE TAG person(name string, age int);
CREATE EDGE friend(since int);
```

注意 `replica_factor=1` 是单副本，本地玩可以；生产至少 3。建完 schema 必须**等 10 秒**（heartbeat 间隔），让 Storaged 同步到，才能写数据——这是新人最常踩的坑之一。

### 案例 3：风控场景的多跳查询

风控里的常见问题："查找和这个可疑账号 3 跳之内有资金往来的所有账号"，关系数据库要 join 三次大表，慢到分钟级；NebulaGraph 一行 nGQL：

```ngql
GO 3 STEPS FROM "user_42" OVER transfer YIELD transfer.dst, transfer.amount;
```

存算分离架构下，这种查询能直接打到所有 Storaged 节点并行执行，毫秒级返回。这是大厂选它做风控图谱的核心理由。

## 踩过的坑

- **VID 类型钉死**：建 space 时定的 `FIXED_STRING(20)` 或 `INT64`，**后期不能改**。先想清楚业务 ID 长什么样，别拍脑袋设 `FIXED_STRING(8)` 后面发现不够
- **schema 改动有延迟**：`CREATE TAG` 后必须等 heartbeat 间隔（默认 10 秒）才能写入；脚本里建完立刻插入会报错。**手动 sleep 10s 或重试**
- **`replica_factor=1` 是定时炸弹**：单副本时单节点宕机直接丢分片，数据**找不回来**。生产环境永远 3 副本起步
- **深度遍历要加阈值**：`GO 6 STEPS` 在大图上可能扫到上亿节点，OOM 把整个 Storaged 搞挂。生产查询必须 `| LIMIT N` 或在业务层截断
- **`MATCH` 慢于 `GO`**：MATCH 是 Cypher 兼容层，多跳深度遍历首选 `GO`；但 `GO` 不支持复杂 WHERE，写起来更啰嗦——按场景选
- **客户端连接池**：官方 Python/Go/Java 客户端都要手动管理 session 池，Graphd 单连接吞吐有限；高并发场景必须连接池

## 适用 vs 不适用场景

**适用**：

- 数十亿到万亿级点边的超大图（Neo4j 在这个量级会很吃力）
- 高写入吞吐 + 高并发查询（风控、推荐、社交关系）
- 已经有大数据栈（Spark / Flink / HDFS），想接图数据库做 OLTP
- 多租户场景——space 概念天然隔离，一个集群跑多个业务

**不适用**：

- 小规模图（百万级点边）→ [[neo4j]] 单机更省心
- 需要 Cypher 100% 兼容、GQL ISO 标准 → [[neo4j]] 是 Cypher 的源头
- 团队没有运维分布式系统的经验 → 三种服务、Raft、RocksDB 调优都不简单
- 重 OLAP 图分析 → nebula-algorithm 能做，但商业 [[tigergraph]] 在这块更顺手

## 历史小故事（可跳过）

- **2018 年**：叶小萌在杭州创立 Vesoft，团队多来自 Facebook TAO 和阿里
- **2019.05**：v1.0 开源，主打 C++ 实现 + 存算分离
- **2021.03**：v2.0 GA，nGQL 大幅向 Cypher 靠拢，进入互联网公司视野
- **2022 年**：v3.0 进 Apache 基金会孵化器候选名单（最终未进，仍保持独立开源）
- **2024 年**：v3.x 稳定，引入 openCypher 子集兼容、Spark connector 重写
- **2026 年**：在国产图数据库赛道占有率第一，海外社区开始增长

## 学到什么

- **存算分离是规模的钥匙**：单机数据库到一定量级必撞墙，把"算"和"存"拆开各自扩，是从十亿到万亿的关键架构跳跃
- **强类型 VID 是双刃剑**：建库前多花 1 小时设计 ID，省后期 1 个月迁移；但不灵活
- **方言 vs 标准的取舍**：nGQL 的 `GO` 比 `MATCH` 快很多，但绑定了厂商；选不选要看你是否会换库
- **国产开源能打**：在分布式图数据库这个细分领域，NebulaGraph 在 GitHub star 和工业落地上都做到了世界第一梯队

## 延伸阅读

- 官方文档：[NebulaGraph Docs](https://docs.nebula-graph.io/) — 中英双语，部署、nGQL、性能调优都有
- 入门视频：[NebulaGraph 官方 B 站](https://space.bilibili.com/472621355) — 中文社区资料最全
- 性能对比：[LDBC SNB 公开测试](https://ldbcouncil.org/) — 万亿级图基准上的几家厂商横评

## 关联

- [[neo4j]] —— 图数据库标杆，单机生态成熟，与 NebulaGraph 形成"小图用 Neo4j、大图用 Nebula"的分工
- [[dgraph]] —— 同样定位分布式图数据库，但用 RDF 三元组 + GraphQL，路线不同
- [[postgresql]] —— 关系数据库代表，多跳深查询的反面参照
- [[clickhouse]] —— 列式 OLAP，跟图数据库在分析场景互补
- [[redis]] —— KV 缓存，跟图数据库定位完全不同
- [[rocksdb]] —— NebulaGraph 存储层底座，每个分片一个 RocksDB 实例
