---
title: SurrealDB — 一种语法吃下 SQL 图 文档 向量
来源: https://github.com/surrealdb/surrealdb
日期: 2026-05-31
分类: 数据库 / 多模型
难度: 中级
---

## 是什么

SurrealDB 是 2022 年开源的**多模型数据库**，用 [[rust-lang]] 写的，把**关系（SQL）/ 文档（JSON）/ 图（边）/ 键值 / 全文搜索 / 向量**塞进**一个进程、一种查询语言**里。

日常类比：常规思路是后端拼 [[postgresql]] + [[redis]] + 向量库 + WebSocket 服务，4 套组件 4 套运维。SurrealDB 走另一条路——同一个 DB 内核，写一条语句就能跨表 JOIN、跟着边遍历、按余弦距离搜向量。

一句话：**用一种语法把 backend 该干的活都干了**。

## 为什么重要

- **多模型潮流的 Rust 派代表**：与 [[arangodb]]（C++ 时代多模型）同属“一个库吃多种模型”阵营，但是**独立新项目**，不是把 ArangoDB 用 Rust 重写
- **AI 时代的 BaaS**：原生向量搜索 + 实时订阅 + 权限，写 RAG 应用不用再拼 Pinecone 和 Firebase
- **嵌入式模式**：Rust 应用可以 `cargo add surrealdb` 当库用，零网络开销，单机像 SQLite
- **WASM 编译**：浏览器里跑同一个 DB（IndexedDB 后端），离线优先 PWA 友好
- GitHub 30k+ star（2026），1.0 GA 在 **2023 年 9 月**，之后 2.x/3.x 仍在密集迭代

## 核心要点

### 1. SurrealQL 一眼看懂

SurrealQL 长得像 SQL，但加了关键扩展。先看建表插数据：

```sql
DEFINE TABLE person SCHEMAFULL;
DEFINE FIELD name ON person TYPE string;

CREATE person:tobie SET name = "Tobie";
CREATE person:jaime SET name = "Jaime";
```

注意 `person:tobie`——**记录 ID 直接由你指定**（不是自增整数也不是 UUID），`表名:键` 的形式。这个 ID 就是后面图遍历和直接 link 的把手。

### 2. 关系当 link 直接 fetch

```sql
CREATE article:1 SET title = "Hello", author = person:tobie;
SELECT *, author.name FROM article:1;
```

不用写 `JOIN ... ON`。这种"记录 ID 当外键 + `.字段` 直接展开"叫 **record link**，类比 GraphQL 的 resolver，只是写在查询语言里。

### 3. 图查询用箭头

```sql
RELATE person:tobie -> knows -> person:jaime SET since = time::now();
SELECT ->knows->person.name AS friends FROM person:tobie;
```

`RELATE` 把两个记录连起来，`knows` 是边表（边也是一等公民）。`->knows->person` 读作"沿着 knows 边走到 person"。

### 4. 向量搜索（HNSW）

现行文档主推 **HNSW**（3.1+ 还有 DISKANN）；早期 MTREE 路径已过时，别照抄旧教程：

```sql
DEFINE INDEX idx_emb ON article
  FIELDS embedding HNSW DIMENSION 1536 DIST COSINE;

SELECT id, vector::distance::knn() AS dist
FROM article
WHERE embedding <|10, 100|> $q
ORDER BY dist;
```

### 5. 实时订阅 LIVE SELECT

```sql
LIVE SELECT * FROM article WHERE author = person:tobie;
```

客户端走 WebSocket，Tobie 一发新文章服务器主动推——没有另开 Pub/Sub。

### 6. 可插拔存储（2026 现状）

- **内存 / SurrealMX**：测试与临时
- **RocksDB / SurrealKV**：单机持久化（生产单机优先 RocksDB）
- **SurrealDS / Cloud**：分布式与托管集群（早期 TiKV/FoundationDB 路线已让位，勿当现行默认）
- **IndexedDB**：浏览器 WASM 端

## 实践案例

### 案例 1：原型期 schemaless，上线 schemafull

```sql
CREATE post SET title = "x", tags = ["a", "b"];
DEFINE TABLE post SCHEMAFULL;
DEFINE FIELD title ON post TYPE string;
DEFINE FIELD tags ON post TYPE array<string>;
```

**逐部分解释**：

1. 先 `CREATE` 不写死字段——原型期字段还在变。
2. 上线前 `SCHEMAFULL` + `DEFINE FIELD` 收紧类型。
3. 同一份数据、同一个 DB，模式从松到紧切换。

### 案例 2：record-level 权限当 BaaS

```sql
DEFINE TABLE article PERMISSIONS
  FOR select WHERE published = true OR author = $auth.id
  FOR update WHERE author = $auth.id;
```

**逐部分解释**：

1. `PERMISSIONS` 写在表定义上，规则跟着数据走。
2. `$auth.id` 来自 JWT 会话，前端可直连 DB。
3. 后端少写一层“鉴权 → 查库 → 过滤”中间件。

### 案例 3：图遍历查一度好友

```sql
RELATE person:tobie -> knows -> person:jaime;
SELECT ->knows->person.name AS friends FROM person:tobie;
```

**逐部分解释**：

1. `RELATE ... -> knows -> ...` 建一条带方向的边。
2. `SELECT ->knows->person` 从 Tobie 沿边走到 person 节点。
3. `.name AS friends` 只取名字，结果像 `["Jaime"]`。

## 踩过的坑

1. **BSL 1.1 不是 OSI 开源**：若干年后才转 Apache 2.0，禁止做托管 DBaaS 卖；公司用前要法务看一下
2. **1.0 才 2023-09 发布**：和 [[postgresql]] 那种 20 年老炮比稳定性差距还在；早期版本有重大语法变更
3. **分布式别当“开箱 Postgres 主从”**：自建集群运维更重；中小规模先单机 RocksDB，再评估 Cloud/SurrealDS
4. **查询规划器还在打磨**：复杂多表查询有时不如 Postgres；慢查询用 `EXPLAIN`
5. **schemaless × 多模型容易失控**：原型期爽，半年后没人看得懂；上线前收紧 schemafull
6. **嵌入式 vs server 模式行为微差**：事务隔离 / 并发语义偶有不同
7. **LIVE 长连接成本**：每个订阅一条 WebSocket，1 万用户≈1 万连接，网关要扛得住

## 适用 vs 不适用

**适用**：

- 原型 / **单机 RocksDB、中小流量**（常见百～数千 QPS 量级）想要 BaaS：实时 + 权限 + 多模型
- Rust 全栈：嵌入式模式 backend 零网络
- AI 应用混合检索：关系数据 + embedding 同一个 DB
- PWA 离线优先：浏览器 WASM 端 + 服务端同一种 query 语言

**不适用**：

- 已有大规模 Postgres/MySQL 生产：没必要换
- OLAP / 分析负载：用 ClickHouse / DuckDB
- 需要 OSI 标准开源协议：BSL 不行
- **万级 LIVE 长连接**未单独规划网关/连接池时硬上
- 极致单模型性能：[[neo4j]] 图、Postgres 关系、专用向量库在各自专场仍更强

## 历史小故事（可跳过）

- **2022 年 8 月**：v1.0.0-alpha 开源（之前闭源原型做了几年）
- **2023 年 9 月**：v1.0.0 GA（约 9/13），种子轮融资
- **2024-2025**：补向量 / 全文 / 集群；2.0 引入 SurrealKV、改进规划器
- **2025-2026**：3.x 强化 HNSW，3.1 加 DISKANN；分布式重心转向 SurrealDS/Cloud
- 创始人 Tobie & Jaime Morgan Hitchcock 兄弟，公司在伦敦

## 学到什么

1. **多模型不必是 zero-sum**：一个 DB 能既是关系又是图又是向量——前提是从头设计而不是硬装扩展
2. **记录 ID 当 link** 是个被低估的语法选择：免去外键 + JOIN 样板代码
3. **嵌入式 + server + WASM 同一份代码**：可插拔存储抽象的实战意义
4. **BSL 不是开源也不是闭源**：商业可持续 vs OSI 纯净的中间地带（与 [[mongodb]] / Redis 源码许可收紧同属“源码可得但有商业限制”路线，细节各异）

## 延伸阅读

- 官方文档：[surrealdb.com/docs](https://surrealdb.com/docs)
- SurrealQL 速查：[surrealdb.com/docs/surrealql](https://surrealdb.com/docs/surrealql)
- 向量索引：[HNSW / DISKANN](https://surrealdb.com/docs/learn/data-models/vector-search/vector-indexes)
- Tobie Morgan Hitchcock：[Why we built SurrealDB](https://www.youtube.com/results?search_query=why+we+built+surrealdb)

## 关联

- [[arangodb]] —— 多模型同行（文档+图+KV，C++ 早一代）
- [[neo4j]] —— 图数据库专家（只擅长图）
- [[edgedb]] —— schema-first 多模型同行（重心在类型系统）
- [[postgresql]] —— 关系型老炮对照
- [[rocksdb]] —— SurrealDB 常用单机存储后端
- [[tikv]] —— 早期分布式后端选项（现行文档已弱化）
- [[redis]] —— KV / 实时对照
- [[rust-lang]] —— SurrealDB 实现语言

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kuzu]] —— Kùzu — 把图数据库做成 DuckDB
