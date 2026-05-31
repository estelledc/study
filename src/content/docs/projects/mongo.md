---
title: MongoDB — 文档数据库代表
来源: https://github.com/mongodb/mongo
日期: 2026-05-31
分类: 数据库 / NoSQL
难度: 中级
---

## 是什么

MongoDB 是把数据存成"文档"的数据库。日常类比：传统关系库像 Excel 表（表头先定好、每列固定类型、每行格式一致）；MongoDB 像 Notion 数据库（每条记录形状可以不一样、可以嵌套子对象、可以塞数组）。

你写：

```js
db.users.insertOne({
  name: 'Alice',
  tags: ['admin', 'beta'],
  address: { city: 'SF', zip: '94110' }
})
```

这一条是一个**文档**（document），结构像 JSON——能嵌套、能放数组、能省字段。文档聚成**集合**（collection），集合归到**数据库**（database）。"集合 = 表，文档 = 行"，但行可以长得不一样。

## 为什么重要

不理解 MongoDB，下面这些事都会反直觉：

- 为什么 2010 年代初创公司爱用——model 改了直接存新字段，不用写迁移脚本
- 为什么二进制 JSON（BSON）查询比文本 JSON 快——预解析过、字段长度和类型都编码好了
- 为什么 NoSQL 这个词在 2009 年突然爆火——MongoDB 是它的旗手之一
- 为什么 26k stars 的 C++ 项目能撑起 200+ 亿美元市值的上市公司

## 核心要点

MongoDB 的设计可以拆成 **四件事**：

1. **BSON 文档**：JSON 的二进制超集。多了类型（int32 / int64 / Date / ObjectId / Decimal128 / Binary），字段长度预编码——遍历不用解析整个文档。

2. **副本集（Replica Set）**：1 主多从。主节点把每次写入记到 oplog（操作日志），从节点异步拉取重放。主挂了从节点投票选新主，秒级切换。

3. **分片（Sharding）**：按 shard key 把一个集合切片到多台机器。组件三件套：`mongos` 路由 + config server（元数据）+ 一组 shard 节点。范围分片或 hash 分片。

4. **JSON 风格查询**：不是 SQL，是 `db.coll.find({age: {$gt: 18}})`。复杂查询走聚合管道（aggregation pipeline）：`$match → $group → $lookup` 拼接成流。

## 实践案例

### 案例 0：同一份数据两种存法

关系库（PostgreSQL）：

```sql
-- 三张表，靠外键拼回去
INSERT INTO users (id, name) VALUES (1, 'Alice');
INSERT INTO addresses (user_id, city, zip) VALUES (1, 'SF', '94110');
INSERT INTO user_tags (user_id, tag) VALUES (1, 'admin'), (1, 'beta');
```

MongoDB：

```js
db.users.insertOne({
  _id: 1, name: 'Alice',
  address: { city: 'SF', zip: '94110' },
  tags: ['admin', 'beta']
})
```

关系库：每张表 schema 严格、读取时 join 拼回；MongoDB：天然嵌套、读取时一个文档全拿到、写入时不用跨表事务。

### 案例 1：默认主键 ObjectId 长什么样

每个文档都有 `_id`，默认是 12 字节的 ObjectId：

```
4 字节 时间戳 | 5 字节 随机数 | 3 字节 自增计数器
```

- 时间戳放前面 → 近似单调递增，B-tree 插入友好
- 5 字节随机 → 不同机器不会撞
- 3 字节计数 → 同一秒同一机器不会撞

不需要中心发号器、不需要数据库自增 ID 全局加锁。

### 案例 2：副本集故障切换

```
[主 mongod] ←→ [从 1] ←→ [从 2]
   ↓ 写
   oplog
   ↓ 异步复制
   从 1 / 从 2 重放
```

主挂了：从 1 和从 2 互相握手 → 选 oplog 最新的当新主 → 客户端 driver 自动重连。这套机制叫 **automatic failover**，是 MongoDB 高可用的核心。

### 案例 3：分片选错 shard key 的代价

错误示范：用时间戳做 shard key。

```
2026-05-31 09:00 后所有写入 → 全部落到最后一个 shard
其他 shard 闲着 → 单点热点
```

正确做法：用 hash 后的字段、或选自然分散的业务键（如用户 ID）。这是 MongoDB 用户最常踩的坑。

## 踩过的坑

1. **shard key 不可改**：3.4 之前选定永久不能改；4.4 起支持改但代价大。设计期就要想清楚。

2. **文档 16MB 上限**：单个文档不能超过 16MB。日志、附件这种增长字段千万别塞进文档，要外挂 GridFS 或对象存储。

3. **$lookup 不是 SQL join**：mongo 的 $lookup 是嵌套循环，没 hash join / merge join 优化。跨集合关联性能差，能反范式化（把数据冗余到一个文档里）就反范式化。

4. **默认 writeConcern w:1**：默认主节点写完就返回，没等复制到从节点。主突然崩可能丢未复制的那批写。要强一致写入显式指定 `w: 'majority'`。

5. **聚合管道很灵活但容易越界**：`$lookup + $unwind + $group` 写得开心，性能能掉 100 倍。复杂分析放下游数仓（[[duckdb]] / ClickHouse），别让 mongo 当 OLAP 引擎。

## 适用 vs 不适用场景

**适用**：

- schema 频繁变化的早期产品（用户配置、活动数据、CMS 内容）
- 嵌套结构天然的领域（商品规格、订单详情、设备遥测）
- 横向扩展需求大、查询模式相对简单
- 地理空间查询（2dsphere 索引原生支持）

**不适用**：

- 强事务、复杂多表 join 的场景（金融账本、ERP）→ 用 PostgreSQL
- 内存级 KV 缓存 → 用 Redis
- 写入吞吐极高、查询模式固定的宽列场景 → 用 Cassandra / ScyllaDB
- 数据量小、关系清晰的小项目——SQLite 一个文件就够

## 历史小故事（可跳过）

- **2007**：10gen 公司成立，本想做 PaaS 平台，发现没好用的水平扩展存储，把内部组件剥离做产品
- **2009**：MongoDB v1.0 开源，赶上 NoSQL 浪潮
- **2015**：3.0 引入 WiredTiger 存储引擎，3.2 起设为默认（B-tree + 行级锁 + 压缩），替代早期 MMAPv1（库级锁性能差）
- **2018**：4.0 支持副本集多文档事务；同年改许可为 SSPL，引发开源社区争议（云厂商 fork 受限）
- **2018**：MongoDB Inc. 上市，市值现 200+ 亿美元

## 学到什么

1. **schema-less 的真相**：不是没 schema，是把 schema 放到应用层维护。设计依然要做，只是延后了。
2. **副本集 + 分片是两套独立机制**：副本集解决高可用，分片解决横向扩展，可以单独用、也可以叠加。
3. **数据模型决定查询效率**：mongo 的胜负点在文档怎么组织——把常一起读的数据塞进一个文档，比 join 快得多。
4. **文档库 ≠ 关系库的替代**：是补充。两类系统各自最擅长不同形状的数据。

## 延伸阅读

- 官方文档：[MongoDB Manual](https://www.mongodb.com/docs/manual/)（英文，结构清晰）
- 入门书：Kyle Banker《MongoDB in Action》第 2 版（理论 + 实战，2016）
- 论文：[The MongoDB Architecture Guide](https://www.mongodb.com/resources/products/fundamentals/mongodb-architecture-guide)（白皮书，30 页）
- [[postgresql]] —— 关系库代表，与 MongoDB 形成"行 vs 文档"的两条路线
- [[redis]] —— 内存 KV，常和 MongoDB 一起用做缓存层

## 关联

- [[postgresql]] —— 关系数据库代表，事务和 join 强、schema 严格
- [[redis]] —— 内存 KV，常做 mongo 前的缓存层
- [[cassandra]] —— 宽列 NoSQL，写入吞吐更高但查询弱
- [[etcd]] —— 用 Raft 的强一致 KV，与 mongo 副本集的异步复制对照
