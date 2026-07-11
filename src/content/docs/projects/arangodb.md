---
title: ArangoDB — 文档+图+KV 三合一的多模型数据库
来源: https://github.com/arangodb/arangodb
日期: 2026-05-31
分类: 数据库 / 多模型
难度: 中级
---

## 是什么

ArangoDB 是 2011 年德国 ArangoDB GmbH 开源的**多模型数据库**——一个进程同时支持**文档**（像 [[mongodb]]）、**图**（像 [[neo4j]]）、**键值**（像 [[redis]]）三种数据形态，并用同一种叫 **AQL** 的查询语言把它们串起来。

日常类比：常规思路是文档存一个库、图存一个库、缓存再开一个，三套数据库三套运维三套备份。Arango 把它们塞进同一个进程里，让你写一条查询就跨三种模型。

一句话：**用一套引擎、一种语言搞定文档+图+KV**。

## 为什么重要

- **多模型是 NoSQL 后期的一条主线**：Polyglot Persistence（多语言持久化）听上去美，运维起来累；Arango 走相反方向——一个库吃下三种模型
- **AQL 比 Cypher 更接近 SQL**：从关系型转过来的工程师，认知负担比 Neo4j 的 Cypher 低
- **GraphRAG 复兴时代被翻出来**：知识图谱给大模型当外脑，Arango 是 Neo4j 之外最常被提的开源选项
- **GitHub 13k+ star**，社区版 Apache 2.0，企业版加 SmartGraph / 热备份等

## 核心要点

### 1. 多模型是怎么"原生"的

很多数据库自称多模型，其实是后加的扩展（比如 Postgres 装 `pg_graph`）。Arango 的"原生"指：

- **文档**就是 JSON，存在 collection 里，每条记录有 `_key` / `_id` / `_rev`
- **图**也存在 collection 里，但是**边集合**（edge collection），每条边的 `_from` 和 `_to` 字段直接被索引
- **KV** 是文档的退化形式——一个集合只用 `_key` 取值就当 KV 用

所有模型共用同一个 RocksDB 存储层，同一套事务、同一套权限、同一套备份。

### 2. AQL 一眼看懂

AQL 长得像 SQL 倒过来——把 `SELECT` 放最后变 `RETURN`：

```aql
// 文档查询：找年龄大于 25 的用户
FOR doc IN users
  FILTER doc.age > 25
  RETURN doc

// 图遍历：从 users/123 出发，1 到 3 跳的朋友
FOR v, e, p IN 1..3 OUTBOUND "users/123" friends
  RETURN { vertex: v, path: p }

// 跨集合 join：用户 + 订单
FOR u IN users
  FOR o IN orders
    FILTER o.userId == u._key
    RETURN { user: u, order: o }
```

注意第二个查询的 `1..3 OUTBOUND` 一句话，在关系数据库里要写 3 次自连接；在 [[neo4j]] 的 Cypher 里要写 `(a)-[:FRIEND*1..3]->(b)`。AQL 这种 `1..3 OUTBOUND` 可读性介于两者之间，更像普通编程语言的循环。

### 3. 集群三角色

跑生产时 Arango 集群分三种节点：

- **Coordinator**：接客户端请求，解析 AQL，把子查询分发到 DBServer
- **DBServer**：真正存数据的 shard 节点，处理本地数据
- **Agency**：用 [[raft]] 共识协议维护集群元信息（谁是主、shard 在哪）

读写流程类比：Coordinator 是接待员，DBServer 是仓库管理员，Agency 是值班经理负责"现在哪个仓库归谁管"。

### 4. SmartGraph：让分布式图不跨机器遍历

图查询最大敌人是网络。如果"用户 A 的好友"分散在 10 台机器上，遍历 6 跳要跨网络几十次。SmartGraph 让你按业务键（比如 `tenantId`）把节点和边强制放在同一 shard，遍历就**不出本机**。

代价：得提前知道用什么键 sharding，跨 tenant 的查询会慢。

### 5. ArangoSearch + 向量搜索

3.12（2024）版加入了向量搜索字段，配合自带的 ArangoSearch 全文索引，可以在同一引擎里做"图遍历 + BM25 全文 + 向量近似最近邻"。这正好是 GraphRAG 想要的组合——以前要装 Elasticsearch + Neo4j + Faiss 三个，现在一个 Arango 顶上。

### 6. Foxx：在数据库里跑 JS 微服务

Foxx 让你把 JS 业务逻辑直接放在 DBServer 进程里跑，省掉应用层到数据库的网络往返。类比 [[postgresql]] 的存储过程，但用 JS 而不是 PL/pgSQL。

适合场景：数据校验、跨集合的小型事务封装、对外暴露 REST API。

## 实践案例

### 案例 1：推荐系统的"图 + 文档"组合

电商场景：用户-商品是图（购买关系），商品本身是文档（标题/价格/库存）。AQL 一条查询：

```aql
FOR friend IN 1..2 OUTBOUND @userId friendOf
  FOR product IN 1..1 OUTBOUND friend bought
    FILTER product.price < 500
    RETURN DISTINCT product
```

读法：从我出发跳 2 跳找朋友的朋友，再跳 1 跳看他们买过什么，价格 < 500 的去重返回。Mongo 做不到（没图遍历），Neo4j 能做但商品属性筛选不如 AQL 顺手。

### 案例 2：反欺诈中的账户关系网

银行场景：账户之间转账是边，账户档案是文档。要查"过去 30 天，给某个标记为可疑的账户转过钱的人，再往外两跳"——AQL 能在同一查询里同时做时间过滤、金额过滤、跳数限制。

```aql
FOR acct IN accounts
  FILTER acct.flag == "suspect"
  FOR v, e, p IN 1..2 INBOUND acct transfers
    FILTER e.createdAt >= DATE_SUBTRACT(DATE_NOW(), 30, "day")
    RETURN DISTINCT { account: v._key, amount: e.amount }
```

读法：先找可疑账户，再沿转账边反向追 2 跳，最后只保留近 30 天的边。

如果用 Neo4j，账户档案得另存；用 Mongo，关系遍历得在应用层手拼。

### 案例 3：GraphRAG 的"向量 + 图"组合

文档向量存在 `docs.embedding`，相似段落先按向量分数排序，再扩一跳关系补上下文：

```aql
FOR doc IN docs
  LET score = APPROX_NEAR_COSINE(doc.embedding, @queryVector)
  SORT score DESC
  LIMIT 5
  FOR neighbor IN 1..1 OUTBOUND doc relatedTo
    RETURN { doc: doc.title, neighbor: neighbor.title, score }
```

读法：向量搜索负责"像不像"，图遍历负责"和谁有关"，两段在同一条 AQL 里完成。

## 踩过的坑

1. **AQL 不是 SQL**：写惯 `SELECT * FROM users WHERE age > 25` 的人，第一次看到 `FOR doc IN users FILTER ... RETURN` 会愣 5 秒。把它当成"列表推导式 + 过滤"理解会快一些
2. **深图遍历比 Neo4j 慢**：1..6 OUTBOUND 这种深遍历，专用图库 [[neo4j]] 用免索引邻接更快；Arango 是用 RocksDB 的边索引扫，胜在通用，输在极端深度
3. **RocksDB 写放大**：LSM-tree 高写入 + 大库会造成磁盘 IO 压力，比 BTree 类引擎更吃 SSD 寿命
4. **社区版被阉割**：SmartGraph、热备份、审计、加密这些企业特性社区版没有，玩具项目够用，正经分布式得买授权

## 适用 vs 不适用场景

**适用**：

- 同时需要文档 + 图 + 全文搜索的中小项目，避免三套数据库的运维成本
- GraphRAG / 知识图谱后端，配合向量搜索一站式
- 推荐系统、反欺诈这种"实体属性 + 关系网"双重需求

**不适用**：

- 极致写入吞吐 → [[mongodb]] / [[cassandra]] 更合适
- 极致深度图遍历 → [[neo4j]] 专用图库更快
- 强一致 OLTP 事务 + 复杂 join → [[postgresql]]
- 纯 KV 缓存 → [[redis]] 更轻

## 历史小故事（可跳过）

- **2011 年**：在德国科隆成立，原名 **AvocadoDB**（牛油果数据库），主打"绿色像牛油果一样新鲜"
- **2012 年**：改名 ArangoDB，Arango 来自希腊语"彩色奶牛"，logo 也换成奶牛
- **v3.0（2016）**：引入集群模式，从单机走向分布式
- **v3.7（2020）**：抛弃自研的 MMFiles 引擎，全面切到 RocksDB
- **v3.12（2024）**：加入向量搜索字段，主动拥抱 GraphRAG 浪潮

## 学到什么

1. **多模型不是后加的扩展，要从存储层开始统一**——这是 Arango 和"Postgres + 扩展"路线的根本差别
2. **AQL 用 FOR/FILTER/RETURN 替代 SELECT/WHERE/SELECT** 是个有意思的语言设计——把"循环+过滤+映射"变成查询语言的核心动词，更接近函数式
3. **GraphRAG 时代图数据库价值回归**：大模型需要"事实关系"做外脑，图库这种十年没变热的方向重新被推到台前
4. **SmartGraph 解决"图分布式遍历"** 用的还是 sharding 老办法——把"必然一起访问"的数据放到一台机器上，避免网络跳跃

## 延伸阅读

- 官方文档：[ArangoDB Documentation](https://docs.arangodb.com/)（AQL 教程一上手就有图+文档示例）
- AQL 入门：[AQL Tutorial](https://docs.arangodb.com/stable/aql/tutorial/)（把语法和真实数据一起讲）
- 论文方向：Arango 没有发顶会论文，多模型理论可看 Lu & Holubova 的 *Multi-model Databases: A New Journey to Handle the Variety of Data*（ACM Computing Surveys 2019）
- [[neo4j]] —— 纯图数据库标杆，对比看 Cypher vs AQL
- [[mongodb]] —— 纯文档数据库，对比看为什么 Arango 加了图
- [[redis]] —— 纯 KV，理解 KV 模型在 Arango 里只是文档的退化形式

## 关联

- [[neo4j]] —— 同领域专用图库，Arango 的最大对手
- [[mongodb]] —— 文档模型的标准答案，Arango 文档部分对标它
- [[redis]] —— KV 模型的标准答案
- [[postgresql]] —— 关系派代表，Arango 用 AQL 部分模仿了 SQL 的声明式风格
- [[raft]] —— Arango 的 Agency 集群协调用的就是 Raft

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[memgraph]] —— Memgraph — 内存图数据库
- [[mongodb]] —— MongoDB — 文档型 NoSQL 数据库
- [[neo4j]] —— Neo4j — 主流图数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[raft]] —— Raft — 易理解的共识算法
- [[redis]] —— Redis — 内存键值数据库
- [[surrealdb]] —— SurrealDB — 一种语法吃下 SQL 图 文档 向量

