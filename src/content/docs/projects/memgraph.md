---
title: Memgraph — 内存图数据库
来源: https://github.com/memgraph/memgraph
日期: 2026-06-01
分类: 数据库 / 图
难度: 中级
---

## 是什么

Memgraph 是 2016 年克罗地亚萨格勒布团队（Dominik Tomicevic 等）做的**内存优先图数据库**，用 C++17/20 重写，主打**实时图分析**——把图数据全部装进 RAM，配合 [[neo4j]] 的查询语言 Cypher，让"实时反欺诈、实时推荐、实时监控"这种**毫秒级图查询**变得可能。

日常类比：[[neo4j]] 像图书馆——书放架子上，要查就翻架子（混合内存+磁盘）；Memgraph 像把整座图书馆搬进会议桌——所有书都摊在你面前，伸手就拿（纯内存）。代价是会议桌就这么大，装不下整座图书馆。

一句话：**Cypher 长得跟 Neo4j 一样，存储引擎完全不同——纯内存 + C++**。

## 为什么重要

- **Cypher 兼容**：openCypher + Bolt，多数 Neo4j 官方驱动能直接连——基础查询迁移成本低（方言/过程库仍可能有差异）
- **单机吞吐常显著领先**：内存图 + C++；厂商 Benchgraph 等公开对比里常报数倍于 Neo4j 单机的写入/深度查询优势（视数据与查询而定）
- **流接入原生支持**：内置 Kafka / Pulsar / Redpanda consumer，`CREATE KAFKA STREAM` 就能把 topic 实时灌进图——金融反欺诈、电信监控里很吃香
- **MAGE 算法库**：PageRank / 社区检测 / Node2Vec / 最短路径都内置，还能用 Python 或 C++ 写自定义过程

如果场景是"数据规模能装进单机内存（通常按几百 GB 量级规划）"且"必须毫秒响应"，Memgraph 是 [[neo4j]] 之外的强力候选。

## 核心要点

### 1. 全内存 + Snapshot/WAL 持久化

Memgraph 的存储设计跟传统数据库**完全反过来**：

- **节点和边都是 C++ 对象**，常驻 RAM
- 索引用 **跳表**（skip list），写入不阻塞读
- **MVCC** 多版本并发控制，事务之间不互相锁
- 持久化只做两件事：周期性 **snapshot**（全量序列化到磁盘） + **WAL**（增量日志）

类比：游戏存档机制——游戏运行时全在内存，定期写一次存档（snapshot），中间每个操作记日志（WAL）。重启时先读最近的 snapshot，再回放 WAL。

后果：**RAM 即上限**——内存装不下就跑不动。一台 256 GB 内存的机器大概能装下几亿节点 + 几十亿边。

### 2. Cypher + Bolt：与 Neo4j 协议层兼容

```cypher
MATCH (a:Person {name: 'Alice'})-[:FRIEND*1..3]->(foaf)
RETURN foaf.name, count(*) AS hops
```

这条查询在 Neo4j 和 Memgraph 上**完全一样能跑**。Bolt 协议是 Neo4j 设计的二进制传输协议，Memgraph 也实现了——所以 Neo4j 的 Python / Java / JS 客户端连过来无感。

实际意义：**团队不用学新语言**。Cypher 学过一次，两边都通用。

### 3. 流式接入：CREATE STREAM

这是 Memgraph 区别于 [[neo4j]] 的核心特性：

```cypher
CREATE KAFKA STREAM my_stream
TOPICS transactions
TRANSFORM transactions.txn_to_graph
BOOTSTRAP_SERVERS 'kafka:9092';

START STREAM my_stream;
```

后台 Kafka consumer 不停拉消息，每条走 `TRANSFORM` 过程变成图写入。**没有单独 ETL 进程**——事件直接落成节点/边。

类比 [[kafka]] 给传统库的 connector：那是另一个进程批量同步；这里是把 consumer 内嵌进数据库，按事件同步。

### 4. MAGE：可扩展算法库

MAGE = Memgraph Advanced Graph Extensions，Apache 2.0 开源。

- **内置过程**：`pagerank.get()` / `community_detection.get()` / `node2vec.get()` / `betweenness_centrality.get()`
- **自定义过程**：用 Python（`mgp.read_proc`）或 C++ 写——Python 简单但慢，C++ 快但要会编译

例子：跑 PageRank 找网络中的影响力节点：

```cypher
CALL pagerank.get() YIELD node, rank
RETURN node.name, rank ORDER BY rank DESC LIMIT 10
```

跟 Neo4j 的 GDS（Graph Data Science）库定位一样，但 GDS 企业版要钱，MAGE 全开源。

## 实践案例

### 案例 1：用 Docker 起本地 Memgraph

```bash
docker run -p 7687:7687 -p 7444:7444 -p 3000:3000 \
  --name memgraph memgraph/memgraph-platform
```

**逐部分解释**：

- `7687` = Bolt（应用/驱动连这里）
- `7444` = WebSocket（日志推送）
- `3000` = Memgraph Lab（浏览器里画图，类似 Neo4j Browser）
- 打开 `http://localhost:3000` 就能拖鼠标建图，适合先摸手感

### 案例 2：实时反欺诈场景

Kafka 灌入交易流水 → Memgraph 实时建图 → 查"环形转账"：

```cypher
MATCH path = (a:Account)-[:TXN*3..6]->(a)
WHERE all(r IN relationships(path) WHERE r.amount > 10000)
RETURN path
```

**逐部分解释**：

- `(a)-[:TXN*3..6]->(a)`：从账户 a 走 3–6 步又回到 a（回环）
- `r.amount > 10000`：只看大额边，过滤噪声
- 内存里跑这类变长路径，延迟常可压到交易窗口内的几十毫秒量级（视图规模而定）

### 案例 3：跟 Neo4j 客户端对接

```python
from neo4j import GraphDatabase
driver = GraphDatabase.driver("bolt://localhost:7687")
with driver.session() as s:
    result = s.run("MATCH (n) RETURN count(n)")
    print(result.single()[0])
```

**逐部分解释**：

- `neo4j` 包是 **Neo4j 官方驱动**，不是 Memgraph 专用 SDK
- `bolt://localhost:7687` 连的是 Memgraph 的 Bolt 端口
- 基础 `MATCH`/`RETURN` 通常可直接跑；复杂过程/方言特性仍要对照文档

## 踩过的坑

- **RAM 即上限**：估算容量要算节点对象 + 边对象 + 索引 + MVCC 多版本——通常按"原始数据 × 3-5 倍"预留。装不下就 OOM 进程挂掉，不会优雅降级
- **Snapshot 期间内存翻倍**：序列化时要复制一份给后台写盘线程。大库要预留 2× 内存，否则 snapshot 触发时 OOM
- **BSL 协议商业化限制**：Business Source License 1.1，4 年后才转 Apache 2.0。SaaS 形式对外卖 Memgraph 服务受限——商用部署前要看清条款
- **MAGE 自定义过程门槛**：Python 写慢但简单；C++ 快但要懂 CMake + Memgraph 的 ABI——比 [[nebula]] 内置的 nGQL GO 语句门槛高
- **中文资料少**：[[neo4j]] / [[nebula]] 中文社区都很活跃，Memgraph 几乎只有英文文档。出问题主要靠 Discord 和 GitHub Issues

## 适用 vs 不适用场景

**适用**：
- 数据能装进单机内存（通常按几百 GB 量级预留，含索引与 MVCC）的实时图分析
- 金融反欺诈、电信网络拓扑、Cybersecurity 行为图、推荐召回（Bolt + Cypher 可复用）
- Kafka 事件流 + 图模型的实时管线（`CREATE KAFKA STREAM` 杀手锏）
- 已有 Neo4j 项目想换更快引擎、且查询以标准 Cypher 为主

**不适用**：
- 万亿级超大图 → [[nebula]] / [[janusgraph]] 的分布式存算分离才扛得住
- 离线批量图计算 → Spark GraphX / GraphFrames 的成本更低
- 简单关系查询（深度 ≤ 2 跳）→ [[postgresql]] / [[mysql]] 加索引足够
- 图嵌入向量召回 → 专用向量库（[[chroma]] / faiss）配 [[neo4j]] 更合适

判断口诀：**单机能装下 + 必须毫秒响应 + Cypher 生态友好 → Memgraph**；超大规模或预算紧张选别的。

## 历史小故事（可跳过）

- **2016 年**：Dominik Tomicevic 等人在萨格勒布创立 Memgraph，目标是做 Neo4j 的内存替代品
- **2020 年**：Memgraph Cloud 上线，开始有付费客户
- **2022 年**：开源核心引擎到 GitHub（BSL 协议），社区版可免费用
- **2023 年**：MAGE 算法库 Apache 2.0 开源，PageRank / 社区检测 / Node2Vec 等都内置
- **2024 年**：v2.x 系列加强 Cypher 兼容度 + Kafka 流接入稳定性
- **2025 年**：在金融、电信、安全行业的实时图分析场景持续渗透

## 学到什么

- **内存优先 ≠ 简单缓存**：Memgraph 把 MVCC + 跳表索引 + WAL 都做在内存里，是完整的存储引擎，不是给 Neo4j 加一层 cache
- **协议兼容是迁移利器**：实现 Bolt + openCypher，等于免费继承了 [[neo4j]] 的客户端生态——这种"协议抄底"是后发产品最常用的策略
- **流接入内嵌价值大**：CREATE STREAM 把 Kafka consumer 拉进数据库，省了一层 ETL，对实时场景效率提升一个量级
- **场景决定形态**：不是所有图都要分布式。能装进单机的就别上集群——单机内存图的延迟和吞吐都比分布式好

## 延伸阅读

- 官方文档：[Memgraph Docs](https://memgraph.com/docs) — 入门、Cypher 教程、运维都全
- MAGE 算法库：[GitHub memgraph/mage](https://github.com/memgraph/mage)
- 流接入指南：[Memgraph Streams](https://memgraph.com/docs/data-streams)
- 跟 Neo4j 对比：[Memgraph vs Neo4j Benchmark](https://memgraph.com/benchgraph)

## 关联

- [[neo4j]] —— Cypher 查询语言的发源地，Memgraph 协议层兼容它
- [[nebula]] —— 国产分布式图数据库，规模上限远高于 Memgraph
- [[janusgraph]] —— 可插拔后端的分布式图，定位更接近 Nebula
- [[arangodb]] —— 多模型（文档+图+KV）数据库，灵活但单点性能弱
- [[kuzu]] —— 把图数据库做成 DuckDB，单文件嵌入式
- [[kafka]] —— Memgraph 流接入的主要消息源
- [[redis]] —— 同样内存优先，但不是图模型；RedisGraph 约 2023 年宣布停维
- [[postgresql]] —— 关系数据库代表，简单 join 仍是它的主场

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/cytoscape-js]] —— Cytoscape.js — 浏览器里画网络图、跑图算法的 JS 库
- [[graphology]] —— Graphology — 浏览器里的图数据结构与算法库
