---
title: MongoDB — 文档型 NoSQL 数据库
来源: https://github.com/mongodb/mongo
日期: 2026-05-29
分类: 数据库 / NoSQL
难度: 中级
---

## 是什么

MongoDB 是一个把数据存成"文档"的数据库。日常类比：[[postgresql]] 像 Excel 表（表头先定好，每列固定类型，每行格式一致）；MongoDB 像 Notion 数据库（每条记录形状可以不一样，可以嵌套子页面、加标签数组）。

你写：

```js
db.users.insertOne({
  name: 'Alice',
  tags: ['admin', 'beta'],
  address: { city: 'SF', zip: '94110' }
})
```

这一条记录是一个**文档**（document），结构像 JSON——可以嵌套对象、可以放数组、可以省略字段。一堆文档聚成一个**集合**（collection）。"集合 = 表，文档 = 行"，但行可以长得不一样。

## 为什么重要

不理解 MongoDB，下面这些事都会反直觉：

- 为什么早期初创公司爱用 MongoDB——model 改了直接存新字段，不用写 migration
- 为什么 BSON（二进制 JSON）查询比纯文本快——预解析过、字段类型已编码
- 为什么 MongoDB Atlas 让"几行 mongoose 代码就有生产级数据库"成为可能——云端自动管复制集和备份
- 为什么 2018 年改 SSPL 许可证后云厂商纷纷 fork（AWS DocumentDB、阿里云 MongoAPI）——SSPL 不再是 OSI 认可的开源

## 核心要点

MongoDB 的核心抽象可以拆成 **三层**：

1. **文档 + 集合**：文档是一条 JSON-like 记录，集合是一组文档。没有"表结构"的硬约束——同一个集合里，A 文档可以有 `email` 字段、B 文档可以没有。这叫**无 schema**（schemaless）。

2. **复制集（Replica Set）**：3+ 节点同步一份数据，主节点写、从节点读，主挂了自动选新主。类比：剧组里有主演和替补，主演病了替补立刻顶上，观众感觉不到。BSON 在 JSON 字段之外还多了 `Date` `ObjectId` `Decimal128` 等内置类型，省去自己 serialize 的麻烦。

3. **分片（Sharding）**：数据按某个 key（比如 `user_id`）分到不同机器。类比：图书馆按书名首字母分到不同楼层，找书时直接去对应楼层，不用全馆扫。

## 实践案例

### 案例 1：5 分钟跑起来

```bash
docker run -d -p 27017:27017 --name mongo mongo
mongosh
```

进了 `mongosh`（MongoDB 自带的命令行）：

```js
use myapp                                // 切到 myapp 数据库（没有就新建）
db.users.insertOne({ name: 'Alice' })    // 插一条
db.users.find()                          // 查全部
```

**没有 `CREATE TABLE`**——第一次插入时集合自动诞生。

### 案例 2：嵌套字段查询

```js
db.users.insertOne({
  name: 'Alice',
  tags: ['admin', 'beta'],
  address: { city: 'SF', zip: '94110' }
})

db.users.find({ 'address.city': 'SF', tags: 'admin' })
```

**逐部分解释**：

- `'address.city'` 用点号查嵌套字段，相当于 SQL 里 JOIN 出子表再 WHERE
- `tags: 'admin'` 在数组里查"含 admin 这个元素"——SQL 要写 `WHERE 'admin' = ANY(tags)`
- 这种查询在 SQL 里至少 3 行 JOIN，MongoDB 一行搞定

### 案例 3：Aggregation 流水线

```js
db.orders.aggregate([
  { $match: { status: 'paid' } },          // 1. 过滤已支付
  { $group: { _id: '$user_id',             // 2. 按用户聚合
              total: { $sum: '$amount' } } },
  { $sort: { total: -1 } },                // 3. 按总金额倒序
  { $limit: 10 }                           // 4. 取前 10
])
```

四个阶段（stage）串成流水线，每一步把前一步的结果当输入。等价于 SQL 的 `SELECT user_id, SUM(amount) FROM orders WHERE status='paid' GROUP BY user_id ORDER BY 2 DESC LIMIT 10`。

## 踩过的坑

1. **"无 schema" 滥用 → 数据脏**：同一个 `users` 集合里，A 文档的 `age` 是数字 25，B 文档的 `age` 是字符串 "25"，C 文档干脆没有 `age`。查询、聚合、报表全乱。MongoDB 6.0+ 提供了 schema validation，但要主动开。

2. **大文档限制 16MB**：单个文档超过 16MB 就插不进去。存图片 / 视频 / 大日志要用 GridFS（自动分块存）。

3. **Aggregation pipeline 学习曲线陡**：`$match / $group / $project / $lookup / $unwind` 这些 stage 名字跟 SQL 完全对不上，新人看一眼就劝退。

4. **写并发与一致性**：默认是 `majority` read/write concern，但**跨文档事务**需要显式 `startSession` + `withTransaction`，且只在复制集 / 分片集群上可用，单机不行。

5. **2018 改 SSPL 许可**：MongoDB 从 AGPL 改成 SSPL（Server Side Public License），不再是 OSI 认可的开源。云厂商不能直接转售 MongoDB 服务，AWS 因此搞了 DocumentDB（兼容协议但内核不同）。如果项目要严格"开源"合规，要看清楚版本。

## 适用 vs 不适用场景

**适用**：
- 内容管理（CMS、博客、文档站）——结构经常变
- 实时 feed / 时间线——文档结构灵活，写入吞吐高
- 物联网 / 日志 / 监控数据——schema 异构，量大
- 早期产品原型——不想为每次 model 改动写 migration

**不适用**：
- 强事务场景（银行转账、订单库存）——选 [[postgresql]] / MySQL
- 复杂多表 JOIN 报表——MongoDB 的 `$lookup` 性能远不如 SQL JOIN
- 需要严格关系完整性（外键约束）——MongoDB 不强制
- 极小数据量（< 100MB）——直接 [[sqlite]] 更省事

## 历史小故事（可跳过）

- **2007 年**：DoubleClick 出来的 Dwight Merriman、Eliot Horowitz、Kevin Ryan 创立 10gen，本来想做 PaaS（类似 Google App Engine），数据库是配套部件。
- **2009 年**：发现数据库部分比 PaaS 更受欢迎，独立开源出来，叫 MongoDB（取自 "humongous"，巨大的）。
- **2013 年**：10gen 公司改名 MongoDB Inc.；MongoDB 成为 NoSQL 浪潮里最知名的产品。
- **2017 年**：纳斯达克 IPO，估值约 12 亿美元。
- **2018 年**：从 AGPL 切到 SSPL，云厂商抗议，OSI 拒绝认证 SSPL 为开源协议。
- **2024 年**：MongoDB 8.0 发布，加了向量搜索、查询性能优化，对接 LLM RAG 场景。

## 学到什么

1. **schema 灵活 ≠ 没 schema**——生产级 MongoDB 项目都会用 mongoose / Zod 在应用层加 schema 校验
2. **文档模型适合"自然嵌套"的数据**——博客文章 + 评论、订单 + 商品行——比 SQL 的"主表 + 子表 JOIN"直观
3. **读写分离 + 分片** 是 NoSQL 标配——MongoDB、[[redis]]、[[clickhouse]] 都走这条路
4. **许可证决定生态**——AGPL → SSPL 让 MongoDB 失去了"纯开源"标签，但保住了云上商业模式

## 延伸阅读

- 官方教程：[MongoDB University](https://learn.mongodb.com/)（免费课程，从入门到 DBA）
- 视频：[MongoDB Crash Course 2024](https://www.youtube.com/watch?v=2QQGWYe7IDU)（1 小时上手）
- 书：《MongoDB: The Definitive Guide》（O'Reilly，第三版覆盖 4.x）
- [[postgresql]] —— 关系型对照组，JSONB 字段也能存文档
- [[redis]] —— KV 型 NoSQL，数据全内存，跟 MongoDB 是不同方向

## 关联

- [[postgresql]] —— 关系型 vs 文档型的经典对照；PG 的 JSONB 在两者之间架了桥
- [[redis]] —— 同属 NoSQL 但更激进（KV、内存优先），常和 MongoDB 配合做缓存层
- [[sqlite]] —— 嵌入式 SQL，跟 MongoDB 分别代表"单机极简"和"分布式灵活"
- [[clickhouse]] —— 列存分析型数据库，跟 MongoDB 分别擅长 OLAP 和 OLTP

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arangodb]] —— ArangoDB — 文档+图+KV 三合一的多模型数据库
- [[projects/couchdb]] —— Apache CouchDB — Erlang 写的文档数据库
- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[ferretdb]] —— FerretDB — 用 PostgreSQL 当后端的开源 MongoDB 协议代理
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[neo4j]] —— Neo4j — 主流图数据库
- [[projects/opensearch]] —— OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉
- [[overleaf]] —— Overleaf — 在线 LaTeX 协作
- [[ravendb]] —— RavenDB — .NET 生态首选的 ACID 文档数据库
- [[rocket-chat]] —— Rocket.Chat — 开源 Slack 替代，Meteor + MongoDB 全栈实时聊天
- [[surrealdb]] —— SurrealDB — 一种语法吃下 SQL 图 文档 向量
- [[typesense]] —— Typesense — 高性能搜索引擎
- [[unqlite]] —— UnQLite — C 写的嵌入式 NoSQL 双模数据库
- [[unstorage]] —— unstorage — 让 KV 存储不绑死运行时的统一抽象层
