---
title: Neo4j — 主流图数据库
来源: https://github.com/neo4j/neo4j
日期: 2026-05-29
分类: 数据库 / 图
难度: 中级
---

## 是什么

Neo4j 是瑞典 Neo4j 公司 2010 年开源的**图数据库标杆产品**——它把"节点"和"关系"都当成一等公民来存，专门为"6 度好友"这种**深度查询**而生。

日常类比：[[postgresql]] 表里查"朋友的朋友的朋友 ... 6 层"，每一层都是 `JOIN`，6 个 JOIN 算下来慢到掉头发；Neo4j 的存储天然按关系组织，沿着关系链往前走 6 步时，成本主要跟**沿途碰到的邻居数**有关，而**不必跟全图总点数成正比**。表不是为"穿越关系"设计的，图天生就是。

一句话：**关系数据库是表 + 行，图数据库是点 + 线**。要查的问题如果天然长得像"地铁线路图"，用图数据库会舒服很多。

## 为什么重要

- **图数据库里最常被当作默认参照**——公开评测与厂商对比里出现频率极高
- **Cypher 查询语言**——Neo4j 设计的图查询语法；2024 年 ISO/IEC 39075（GQL）吸收了其大量思想，常被称作"图数据库的 SQL"
- **客户与案例多**——公开材料里常见航天知识图谱、供应链、反洗钱、风控等落地故事
- **Knowledge Graph + GraphRAG 回潮**——大模型需要可遍历的事实关系，图库又被拉回视野

新人问"图数据库怎么入门"，业界第一句推荐经常还是 Neo4j。

## 核心要点

### 1. Property Graph 模型

Neo4j 用的是 **属性图**（Property Graph）模型：

- **节点（Node）**：圆点，代表一个东西。可以打 **标签**（Label，如 `Person`、`Movie`），还可以挂 **属性**（如 `name: "Alice"`、`age: 30`）
- **关系（Relationship）**：箭头，从一个节点指向另一个节点。也有 **类型**（如 `:FRIEND`、`:ACTED_IN`），也能挂属性（如 `since: 2020`）

类比：朋友圈是节点，"谁认识谁"的连线是关系。每条连线还能写"什么时候认识的"——那就是关系上的属性。

### 2. Cypher 查询（ASCII art 风格）

Cypher 的语法特别像在白板上画图：

```cypher
(a:Person)-[:FRIEND]->(b:Person)
```

读法：「圆括号里是节点 `a`，方括号里是关系 `:FRIEND`，箭头指向节点 `b`」。圆括号画的就是节点的圆，箭头画的就是关系的线——**所见即所写**。

跟 SQL 比：SQL 写"朋友的朋友"要 self-join 两次还得起别名；Cypher 直接写 `(a)-[:FRIEND]->()-[:FRIEND]->(foaf)`，一眼看懂。

### 3. Index-free Adjacency（免索引邻接）

Neo4j 最关键的存储设计：**每个节点直接持有自己邻居的指针**，不用查索引。

类比：传统数据库像图书馆——找一本书要先翻目录卡。图数据库像朋友圈——你站在 Alice 的位置，她的好友列表就在她身上挂着，伸手就摸到，不用查目录。

后果：从 Alice 走 6 跳，是**沿着指针走局部邻接**——复杂度主要由路径上的度数与跳数决定，而不是先扫完全图再 join。邻居极多时仍然会爆炸，所以生产查询要 `LIMIT` 和限制 hop。这是相对关系数据库做深关系遍历时的核心优势。

## 实践案例

### 案例 1：5 分钟启动一个本地 Neo4j

```bash
docker run -d \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/test12345 \
  neo4j:5
```

**逐部分解释**：

- `7474`：浏览器 UI（`http://localhost:7474`）
- `7687`：Bolt，程序连接用
- `NEO4J_AUTH`：首次登录密码（示例用，生产勿照抄）

### 案例 2：建数据 + 查关系

```cypher
CREATE (alice:Person {name: 'Alice', age: 30})
       -[:FRIEND {since: 2020}]->
       (bob:Person {name: 'Bob', age: 28})

MATCH (a:Person {name: 'Alice'})-[:FRIEND*2]->(foaf)
RETURN foaf.name
```

**逐部分解释**：

- `CREATE` 一次写出两个节点和一条带属性的关系
- `*2` 表示沿 `:FRIEND` 走 2 跳（朋友的朋友）
- 方向写反会查空；不确定时可先用无箭头 `-[:FRIEND]-` 试双向

### 案例 3：推荐链路

```cypher
MATCH (u:User)-[:BOUGHT]->(:Product {name: 'iPhone'})
      <-[:BOUGHT]-(:User)-[:BOUGHT]->(rec:Product)
RETURN rec.name, count(*) AS score
ORDER BY score DESC LIMIT 10
```

**逐部分解释**：买过 iPhone 的人 → 他们还买过的商品 → 计数排序；`LIMIT 10` 防止大图上聚合失控。

## 踩过的坑

- **单节点 vs 集群**：社区版只支持单节点。要做高可用 / 横向扩展（**Causal Cluster**），必须企业版（要钱）。前期实验用社区版没问题，上线前看清楚授权
- **内存吃货**：Neo4j 的查询性能严重依赖 **page cache**——把图尽量塞进内存。给小了就掉到磁盘 IO，深度查询直接卡死。生产环境通常给一半物理内存
- **大查询深度爆栈**：6 度社交网络，从一个 KOL 出发可能扫到几亿节点。生产查询一定要 `LIMIT` + 限制 hop 数，不然一条 Cypher 把数据库搞挂
- **备份恢复**：用 `cypher-shell` 一行行导入慢得离谱。**`neo4j-admin`** 工具的 dump/load 才是正解——一个命令离线导出整个图，恢复也快
- **关系方向的坑**：Cypher 的 `-->` 是有向的。新人经常写好查不到结果，回头才发现关系方向反了。`MATCH (a)-[:KNOWS]-(b)` 不带箭头才是双向

## 适用 vs 不适用场景

**适用**：
- 社交网络、推荐系统、风控反欺诈（关系密集）
- 知识图谱、GraphRAG 的事实存储层
- 供应链、合规、依赖追踪（多跳路径)
- 主数据管理（实体之间关系复杂）

**不适用**：
- 大量纯表格数据 + 简单 join → [[postgresql]] / [[mysql]] 更合适
- 海量时序日志 → 用 [[clickhouse]] / [[elasticsearch]]
- KV 缓存 → [[redis]]
- 嵌入向量召回 → [[chroma]] / 专用向量库

判断口诀：**问题里"关系深度 > 2 跳"且查得频繁 → 考虑图数据库**；否则关系库的 join 仍然是最稳的选择。

## 历史小故事（可跳过）

- **2007 年**：Emil Eifrem 团队抽出图存储引擎，成立 Neo Technology（后更名 Neo4j, Inc.）
- **2010 年**：Neo4j v1.0 开源；早期主要靠 Java 遍历 API
- **2011 年前后**：Cypher 引入，声明式图查询开始普及
- **2013 年**：v2.0 强化 Label / Schema，Browser 等让上手更顺
- **2018 年**：v3.5 LTS，金融与政府客户采用增多
- **2024 年**：ISO/IEC 39075 GQL 发布；Neo4j 5.x / Aura 继续推云原生与 GraphRAG

## 学到什么

- **数据模型决定查询效率**：把"关系"当一等公民存，6 跳查询从分钟级变毫秒级。模型选对，性能不用调
- **Cypher 是图数据库的 SQL**：被 ISO 标准化之后，未来切换图数据库厂商不用重写所有查询
- **图数据库不是关系数据库的替代**：是"特定问题域"的专用工具。别把所有数据都搬过来，那是杀鸡用牛刀

## 延伸阅读

- 官方文档：[Neo4j Docs](https://neo4j.com/docs/) — 入门、Cypher 教程、运维都全
- 免费教程：[Neo4j GraphAcademy](https://graphacademy.neo4j.com/) — 互动式课程，零基础友好
- GraphRAG 实战：[Neo4j + LangChain GraphRAG](https://neo4j.com/labs/genai-ecosystem/) — 大模型时代图数据库的回归案例

## 关联

- [[postgresql]] —— 关系数据库代表，与图数据库对比的主参照系
- [[mysql]] —— 经典 OLTP，简单 join 场景的首选
- [[redis]] —— KV / 缓存，跟图数据库定位互补
- [[mongodb]] —— 文档数据库，半结构化数据的备选
- [[elasticsearch]] —— 搜索引擎，全文检索 + 简单聚合
- [[chroma]] —— 向量数据库，语义召回场景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arangodb]] —— ArangoDB — 文档+图+KV 三合一的多模型数据库
- [[chroma]] —— Chroma — Python 优先的向量数据库
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[janusgraph]] —— JanusGraph — 可插拔后端的分布式图数据库
- [[kuzu]] —— Kùzu — 把图数据库做成 DuckDB
- [[memgraph]] —— Memgraph — 内存图数据库
- [[mongodb]] —— MongoDB — 文档型 NoSQL 数据库
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[nebula]] —— NebulaGraph — 国产分布式图数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[ravendb]] —— RavenDB — .NET 生态首选的 ACID 文档数据库
- [[redis]] —— Redis — 内存键值数据库
- [[surrealdb]] —— SurrealDB — 一种语法吃下 SQL 图 文档 向量

