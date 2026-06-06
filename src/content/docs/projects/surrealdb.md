---
title: SurrealDB — 一种语法吃下 SQL 图 文档 向量
来源: https://github.com/surrealdb/surrealdb
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

SurrealDB 是 2022 年开源的**多模型数据库**，用 [[rust-lang]] 写的，把**关系（SQL）/ 文档（JSON）/ 图（边）/ 键值 / 全文搜索 / 向量**塞进**一个进程、一种查询语言**里。

日常类比：常规思路是后端拼 [[postgresql]] + [[redis]] + 向量库 + WebSocket 服务，4 套组件 4 套运维。SurrealDB 走另一条路——同一个 DB 内核，写一条语句就能跨表 JOIN、跟着边遍历、按余弦距离搜向量。

一句话：**用一种语法把 backend 该干的活都干了**。

## 为什么重要

- **多模型潮流的 Rust 派代表**：[[arangodb]] 是 C++ 时代的多模型；SurrealDB 拿 Rust 重写一遍，内存/性能档位更高
- **AI 时代的 BaaS**：原生向量搜索 + 实时订阅 + 权限，写 RAG 应用不用再拼 Pinecone 和 Firebase
- **嵌入式模式**：Rust 应用可以 `cargo add surrealdb` 当库用，零网络开销，单机像 SQLite，集群像分布式 DB
- **WASM 编译**：浏览器里跑同一个 DB（IndexedDB 后端），离线优先 PWA 友好
- GitHub 26k+ star（2026），1.0 GA 在 2023 年 8 月，1.x/2.x 还在密集迭代

## 核心要点

### 1. SurrealQL 一眼看懂

SurrealQL 长得像 SQL，但加了三个关键扩展。先看建表插数据：

```sql
DEFINE TABLE person SCHEMAFULL;
DEFINE FIELD name ON person TYPE string;

CREATE person:tobie SET name = "Tobie";
CREATE person:jaime SET name = "Jaime";
```

注意 `person:tobie`——**记录 ID 直接由你指定**（不是自增整数也不是 UUID），`表名:键` 的形式。这个 ID 就是后面图遍历和直接 link 的把手。

### 2. 关系当 link 直接 fetch

写一条文章表，作者字段直接放 `person:tobie`：

```sql
CREATE article:1 SET title = "Hello", author = person:tobie;

-- 一行 JOIN：取文章的同时把作者也展开
SELECT *, author.name FROM article:1;
```

不用写 `JOIN ... ON`。这种"记录 ID 当外键 + `.字段` 直接展开"在 SurrealDB 里叫 **record link**，类比 GraphQL 的 resolver，只是写在查询语言里而不是 schema 里。

### 3. 图查询用箭头

Tobie 和 Jaime 是朋友，建一条边：

```sql
RELATE person:tobie -> knows -> person:jaime SET since = time::now();
```

`RELATE` 把两个记录连起来，`knows` 是边的表名（边也是一等公民，能存字段）。然后查 Tobie 认识谁：

```sql
SELECT ->knows->person.name AS friends FROM person:tobie;
```

`->knows->person` 读作"沿着 knows 边走到 person"。比 [[neo4j]] Cypher 的 `(a)-[:KNOWS]->(b)` 短，也比 SQL 三表 JOIN 直观。

### 4. 向量搜索原生

定义 MTREE 索引 + 用余弦距离运算符：

```sql
DEFINE INDEX idx_emb ON article
  FIELDS embedding MTREE DIMENSION 1536;

SELECT *, vector::distance::cosine(embedding, $q) AS score
FROM article ORDER BY score LIMIT 10;
```

不用单开 Pinecone / Milvus。RAG 流水线里"既要查关系又要查向量"的混合检索，一条语句搞定。

### 5. 实时订阅 LIVE SELECT

```sql
LIVE SELECT * FROM article WHERE author = person:tobie;
```

客户端走 WebSocket，**Tobie 一旦发新文章，服务器主动推**——没有 Pub/Sub、没有轮询。类似 Firebase 实时监听，但 DB 自带。

### 6. 可插拔存储

同一个 SurrealDB 二进制能挂不同后端：

- **内存**：测试 / 嵌入式临时
- **SurrealKV / [[rocksdb]]**：单机持久化
- **[[tikv]] / FoundationDB**：分布式
- **IndexedDB**：浏览器 WASM 端

代码不变，运行模式靠启动参数切。

## 实践案例

### 案例 1：原型期 schemaless，上线 schemafull

刚做小红书帖一样的原型，字段还在变：

```sql
-- schemaless：写啥存啥
CREATE post SET title = "x", tags = ["a", "b"];
```

上线收紧：

```sql
DEFINE TABLE post SCHEMAFULL;
DEFINE FIELD title ON post TYPE string;
DEFINE FIELD tags ON post TYPE array<string>;
```

同一个 DB、同一份数据，模式从松到紧切换。

### 案例 2：record-level 权限当 BaaS

```sql
DEFINE TABLE article PERMISSIONS
  FOR select WHERE published = true OR author = $auth.id
  FOR update WHERE author = $auth.id;
```

前端直接连 DB（带 JWT），后端不用再写"鉴权 → 查库 → 过滤"三层中间件。

## 踩过的坑

1. **BSL 1.1 不是 OSI 开源**：4 年后才转 Apache 2.0，禁止做托管 DBaaS 卖；公司用前要法务看一下
2. **1.0 才 2023 年发布**：和 [[postgresql]] 那种 20 年老炮比稳定性差距还在；早期版本（< 1.5）有重大语法变更，升级要看 changelog
3. **分布式靠 [[tikv]]**：部署运维比 Postgres 主从复杂得多；中小规模建议先单机 RocksDB
4. **查询规划器还在打磨**：复杂多表查询有时不如 Postgres 优化器；遇到慢查询用 `EXPLAIN` 看
5. **schemaless × 多模型容易失控**：原型期爽，半年后没人看得懂；上线前一定收紧 schemafull
6. **嵌入式 vs server 模式行为微差**：事务隔离 / 并发语义偶有不同，别假设两边一致
7. **LIVE 长连接成本**：每个订阅一条 WebSocket，1 万用户就是 1 万连接，网关要扛得住

## 适用 vs 不适用

**适用**：

- 原型 / 中小型应用想 BaaS 体验：实时 + 权限 + 多模型一把梭
- Rust 全栈：嵌入式模式 backend 零网络
- AI 应用混合检索：关系数据 + embedding 同一个 DB
- PWA 离线优先：浏览器 WASM 端 + 服务端同一种 query 语言

**不适用**：

- 已有大规模 Postgres/MySQL 生产：没必要换
- OLAP / 分析负载：用 ClickHouse / DuckDB
- 需要 OSI 标准开源协议：BSL 不行
- 极致单模型性能：[[neo4j]] 图、Postgres 关系、Pinecone 向量在各自专场仍更强
- 团队不愿学新语法：社区资料还薄

## 历史

- **2022 年 8 月**：v1.0.0-alpha 开源（之前是闭源原型，做了几年）
- **2023 年 8 月**：v1.0 GA，拿到 600 万美元种子轮
- **2024-2025**：密集补向量 / 全文 / Cluster；2.0 改进查询规划器
- 创始人 Tobie & Jaime Morgan Hitchcock 兄弟，公司在伦敦

## 学到什么

1. **多模型不必是 zero-sum**：一个 DB 能既是关系又是图又是向量，且语法不撕裂——前提是从头设计而不是装扩展
2. **记录 ID 当 link** 是个被低估的语法选择：免去外键 + JOIN 的样板代码
3. **嵌入式 + server + WASM 同一份代码**：可插拔存储抽象的实战意义
4. **BSL 不是开源也不是闭源**：商业可持续 vs OSI 纯净的中间地带，越来越多基础设施在用（[[mongodb]] / Redis 7 类似路线）

## 延伸阅读

- 官方文档：[surrealdb.com/docs](https://surrealdb.com/docs)（学习曲线最平的入口）
- SurrealQL 速查：[surrealdb.com/docs/surrealql](https://surrealdb.com/docs/surrealql)
- Tobie Morgan Hitchcock 的设计哲学讲座：[Why we built SurrealDB](https://www.youtube.com/results?search_query=why+we+built+surrealdb)

## 关联

- [[arangodb]] —— 多模型同行（文档+图+KV，C++ 早一代）
- [[neo4j]] —— 图数据库专家（只擅长图）
- [[edgedb]] —— schema-first 多模型同行（重心在类型系统）
- [[postgresql]] —— 关系型老炮对照
- [[rocksdb]] —— SurrealDB 默认单机存储后端
- [[tikv]] —— SurrealDB 分布式后端
- [[redis]] —— KV 对照
- [[rust-lang]] —— SurrealDB 实现语言
