---
title: MongoDB — 文档数据库代表
来源: https://github.com/mongodb/mongo
日期: 2026-07-09
分类: databases
难度: 中级
---

## 是什么

MongoDB 是一个**把数据存成 BSON 文档的数据库**。日常类比：关系数据库像表格，每一行都要按固定列填写；MongoDB 像一份份档案袋，每个档案袋里可以放姓名、地址、购买记录、嵌套清单这些结构化材料。

它的基本单位不是"行"，而是**文档**。文档看起来很像 JSON，但实际存储格式是 BSON：二进制、更适合机器读写，也能表达日期、ObjectId、长整数等 JSON 原本没有的类型。

项目仓库里最重要的两个可执行组件是 `mongod` 和 `mongos`：前者是真正存数据的数据库服务器，后者是分片集群里的查询路由器。这个拆分说明 MongoDB 从一开始就不只想做"单机 JSON 存储"，而是想把文档模型扩到高可用和水平扩展。

## 为什么重要

不理解 MongoDB，下面这些事很难解释：

- 为什么很多 Web 应用喜欢把用户资料、订单明细、评论列表放进一个文档，而不是拆成十几张表再 JOIN 回来
- 为什么 `_id` 会自动生成、默认唯一，并且几乎所有 MongoDB 文档都围着它组织
- 为什么副本集是生产部署的基本单位：单节点能跑，但挂了就没主库；副本集才能选新主
- 为什么分片不是"把文件夹分几份"这么简单，而是要选分片键、走 `mongos` 路由、让后台均衡器迁移数据段

## 核心要点

MongoDB 的核心可以抓 **三个关键词**：

1. **BSON 文档模型**：一条记录可以有嵌套对象和数组。类比：一份简历可以直接写教育经历、项目经历、联系方式，而不是把每一段拆到不同表格再编号关联。好处是读取一个业务对象很顺；代价是模型设计要提前想清楚哪些字段会一起读、哪些会无限增长。

2. **副本集**：多个 `mongod` 保存同一份数据，只有 primary 接收写入，secondary 从 primary 的 oplog 异步追数据。类比：一个班有班长和备份记录员，班长请假时大家投票选新班长。好处是自动故障转移；代价是短暂选举期间可能没有可写主节点。

3. **分片集群**：数据按分片键切成范围或哈希段，分布到多个 shard；客户端连接 `mongos`，由它决定请求去哪里。类比：仓库按订单号把包裹分到多个分拣中心，前台只负责收单和查路由。好处是横向扩容；代价是分片键选错会让所有请求挤到一个 shard。

## 实践案例

### 案例 1：商品详情直接存成一份文档

```js
db.products.insertOne({
  sku: "book-001",
  title: "MongoDB Guide",
  price: 59,
  tags: ["database", "nosql"],
  stock: { warehouseA: 12, warehouseB: 4 }
})

db.products.find({ "stock.warehouseA": { $gte: 10 } })
```

**逐部分解释**：

- `tags` 是数组，`stock` 是嵌套文档，一条商品记录就能装下常一起读取的信息
- `"stock.warehouseA"` 是点符号，用来查嵌套字段
- 这个模型适合商品详情页：页面打开时通常需要标题、价格、标签和库存一起回来

### 案例 2：三节点副本集保住可用性

```js
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo0.example.net:27017" },
    { _id: 1, host: "mongo1.example.net:27017" },
    { _id: 2, host: "mongo2.example.net:27017" }
  ]
})

rs.status()
```

**逐部分解释**：

- `rs0` 是副本集名字，同一组成员必须认同这个名字
- 三个 member 都保存数据；奇数节点更容易在故障时形成多数派
- `rs.status()` 用来确认谁是 primary、谁是 secondary，以及是否正在选举

### 案例 3：订单集合按用户哈希分片

```js
sh.addShard("ordersA/a1.example.net:27018,a2.example.net:27018,a3.example.net:27018")
sh.addShard("ordersB/b1.example.net:27018,b2.example.net:27018,b3.example.net:27018")

sh.shardCollection("shop.orders", { userId: "hashed" })
db.orders.find({ userId: "u123" })
```

**逐部分解释**：

- `sh.addShard()` 把两个 shard replica set 加入集群
- `{ userId: "hashed" }` 让用户 ID 被哈希后分布，避免递增 ID 把写入压到同一台机器
- 查询带上 `userId` 时，`mongos` 更容易把请求路由到目标 shard，而不是广播给所有 shard

## 踩过的坑

1. **把 MongoDB 当"随便塞 JSON"**：字段可以灵活，不代表模型可以乱；嵌套数组无限增长会让单文档越来越难更新。

2. **忘记 16 MB 文档上限**：BSON 单文档有大小限制，大附件和超长历史记录应该拆出去或用专门存储。

3. **只用 `w:1` 就以为安全**：primary 确认不等于多数副本确认，故障切换时未复制到多数派的写入可能回滚。

4. **分片键凭直觉选**：低基数字段、单调递增字段、查询很少携带的字段，都可能造成热点或广播查询。

## 适用 vs 不适用场景

**适用**：

- 用户资料、商品详情、内容管理等"一个业务对象天然是一份文档"的场景
- schema 会演进、字段差异较大的 Web / 移动应用后端
- 需要副本集高可用、读扩展、变更流或地理位置查询的业务系统
- 数据量和写入量会横向增长，且能设计出合理分片键的集合

**不适用**：

- 强依赖复杂 JOIN、固定报表和严谨关系约束的系统，优先考虑 [[postgresql]] / [[mysql]]
- 金融账本这类要求强事务语义极清晰的核心链路，不能只靠"文档灵活"做设计
- 小数据量单机足够的项目，分片集群的运维复杂度不值得
- 分片键无法稳定预测的业务，强行分片会把问题从单机性能变成集群治理

## 历史小故事（可跳过）

- **2007 年前后**：10gen 团队开始做面向云应用的平台，后来把其中的数据库部分独立出来。
- **2009 年**：MongoDB 早期版本开源，名字来自 "humongous"，强调能处理很大的数据集。
- **2010s**：文档数据库和 NoSQL 浪潮一起流行，MongoDB 成为很多 Web 团队学习 NoSQL 的入口。
- **2018 年**：MongoDB Server 改用 SSPL 许可，引发开源社区对"开源数据库商业化"的长期讨论。
- **2020s**：Atlas 托管服务、变更流、事务、向量搜索等能力补齐，MongoDB 从"灵活文档库"变成完整数据平台。

## 学到什么

1. **文档模型不是偷懒版 SQL**：它把常一起读取的数据放近，换取更少 JOIN 和更直观的对象表达。
2. **高可用靠副本集，不靠单机祈祷**：primary、secondary、oplog、选举是理解 MongoDB 生产部署的底座。
3. **水平扩展靠分片键质量**：`mongos`、config server、shard 都只是工具，真正决定效果的是数据怎么切。
4. **灵活 schema 也需要纪律**：越灵活，越要用命名、索引、文档大小和生命周期规则约束增长。

## 延伸阅读

- 官方源码仓库：[mongodb/mongo](https://github.com/mongodb/mongo)
- 官方手册：[MongoDB Manual](https://www.mongodb.com/docs/manual/)
- 文档模型：[Documents](https://www.mongodb.com/docs/manual/core/document/)
- 复制概览：[Replication](https://www.mongodb.com/docs/manual/replication/)
- 分片概览：[Sharding](https://www.mongodb.com/docs/manual/sharding/)
- [[couchdb]] —— 另一个经典文档数据库，设计重点更偏离线复制和 HTTP 接口

## 关联

- [[postgresql]] —— 关系模型代表；和 MongoDB 的文档模型形成最常见对比
- [[redis]] —— 常与 MongoDB 搭配做缓存、会话和排行榜
- [[couchdb]] —— 同属文档数据库，但复制模型和 API 风格不同
- [[arangodb]] —— 多模型数据库，能把文档、图和 KV 放在同一套系统里
- [[ferretdb]] —— 用 PostgreSQL 模拟 MongoDB 协议的兼容层
- [[cockroachdb]] —— 走分布式 SQL 路线，和 MongoDB 的 NoSQL 路线形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
