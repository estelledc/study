---
title: Neo4j — 主流图数据库
来源: https://github.com/neo4j/neo4j
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Neo4j 是瑞典 Neo4j 公司 2010 年开源的**图数据库标杆产品**——它把"节点"和"关系"都当成一等公民来存，专门为"6 度好友"这种**深度查询**而生。

日常类比：[[postgresql]] 表里查"朋友的朋友的朋友 ... 6 层"，每一层都是 `JOIN`，6 个 JOIN 算下来慢到掉头发；Neo4j 的存储天然按关系组织，沿着关系链往前走 6 步是**接近常数**的复杂度。表不是为"穿越关系"设计的，图天生就是。

一句话：**关系数据库是表 + 行，图数据库是点 + 线**。要查的问题如果天然长得像"地铁线路图"，用图数据库会舒服很多。

## 为什么重要

- **图数据库领域占有率第一**——Gartner 连续 7 年评为图数据库领导者，几乎所有公开比较都把 Neo4j 放在第一象限
- **Cypher 查询语言**——Neo4j 自己设计的图查询语法，2024 年被 ISO 收为国际标准 GQL（ISO/IEC 39075）的核心基础。等于"图数据库的 SQL"
- **客户阵容大**——NASA 用它做太空知识图谱、福特做供应链、UBS 做反洗钱、阿里做风控
- **Knowledge Graph + GraphRAG 时代回归热点**——大模型需要"事实关系"作为外部知识，图数据库重新被工业界拉回视野

如果一个新人没听过 Neo4j，问"图数据库怎么选"，几乎所有人的第一推荐都是它。

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

后果：从 Alice 走 6 步到她朋友的朋友的朋友 ... 是**沿着指针走 6 跳**，复杂度跟"全图大小"无关，只跟"局部邻居数"有关。这是图数据库相对关系数据库最核心的性能优势。

## 实践案例

### 案例 1：5 分钟启动一个本地 Neo4j

```bash
docker run -d \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/test12345 \
  neo4j:5
```

- 端口 7474 是浏览器 UI（打开 `http://localhost:7474` 就能看到一个图编辑器）
- 端口 7687 是 Bolt 协议（程序连这个端口）

进了浏览器就能交互式画图，对零基础特别友好——比起命令行先建库建表，这里直接拿鼠标拖就行。

### 案例 2：建数据 + 查关系

往里塞两个人和一条朋友关系：

```cypher
CREATE (alice:Person {name: 'Alice', age: 30})
       -[:FRIEND {since: 2020}]->
       (bob:Person {name: 'Bob', age: 28})
```

查 Alice 的"朋友的朋友"（2 跳）：

```cypher
MATCH (a:Person {name: 'Alice'})-[:FRIEND*2]->(foaf)
RETURN foaf.name
```

`*2` 是 Cypher 的"走 2 步"语法，等价于关系数据库的两个 self-join——但写起来短了 5 倍。

### 案例 3：换个角度看推荐系统

电商推荐"买了 X 的人也买了 Y"，关系数据库要 join 三张大表（用户、订单、商品），慢到要预计算。

Cypher 写法：

```cypher
MATCH (u:User)-[:BOUGHT]->(:Product {name: 'iPhone'})
      <-[:BOUGHT]-(:User)-[:BOUGHT]->(rec:Product)
RETURN rec.name, count(*) AS score
ORDER BY score DESC LIMIT 10
```

3 行讲完一个推荐链路：从买过 iPhone 的人 → 找到他们 → 找到他们还买过的别的东西 → 按次数排。

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

- **2007 年**：瑞典的 Emil Eifrem 团队从一个 CMS 项目里抽出图存储引擎，成立 Neo Technology 公司
- **2010 年**：Neo4j v1.0 在 GitHub 开源，是市面上第一个被广泛使用的原生图数据库
- **2014 年**：v2.0 加入 Cypher 查询语言，从此"写图查询不再像写汇编"
- **2018 年**：v3.5 LTS，正式被金融、政府客户大规模采用
- **2024 年**：Cypher 进入 ISO/IEC 39075 GQL 国际标准——**图数据库终于有 SQL 那样的标准查询语言了**
- **2024 年**：v5.x 系列，重点放在云原生 Aura 和 GraphRAG 集成

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

