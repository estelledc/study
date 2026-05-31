---
title: MongoDB — 把 JSON 直接当数据库存
来源: 10gen 团队 2009 开源；MongoDB Inc. 持续维护；BSON 规范见 bsonspec.org
日期: 2026-05-31
分类: 数据库
难度: 入门
---

## 是什么

MongoDB 是一种**把数据按"文档"存的数据库**，文档长得就像 JSON。日常类比：传统关系数据库（MySQL/PostgreSQL）像 Excel，每张表先画好列、每行严格按列填；MongoDB 像一个**装满便利贴的盒子**——每张便利贴写什么字段、写多少字段，自己决定。

最小例子：

```js
db.users.insertOne({
  name: "Alice",
  age: 30,
  hobbies: ["读书", "爬山"],
  address: { city: "上海", zip: "200000" }
})
```

这一条记录里，`hobbies` 是数组、`address` 是嵌套对象。在 MySQL 里你得拆三张表（users / hobbies / addresses）再用外键拼回来，MongoDB 直接一条文档塞进去。

存储格式叫 **BSON**（Binary JSON）——和 JSON 字段一一对应，但是二进制，多了 `Date` `ObjectId` `Decimal128` 等类型。

## 为什么重要

不了解 MongoDB，下面这些事都不好理解：

- 为什么 2010 年前后冒出一堆"NoSQL"数据库（CouchDB / Cassandra / Redis），它们到底反对关系数据库的什么
- 为什么很多 Node.js / Python 创业项目早期不画 schema，直接 `db.collection.insert({...})` 就开干
- 为什么 2018 年 MongoDB 改成 SSPL 协议引发了云厂商和开源社区的大地震
- 为什么"文档模型"在 PostgreSQL 也有了对应物（JSONB 字段）——是 MongoDB 把这股需求逼出来的

它和 CouchDB 一起定义了**文档型 NoSQL 范式**：以文档为最小存取单元，schema 灵活，水平扩展是默认能力。

## 核心要点

MongoDB 由三件事支撑：

1. **文档模型**：collection 是文档的集合（≈ 表），document 是一个 BSON 对象（≈ 行）。字段可以嵌套数组和子对象。**没有 JOIN**——需要"关联"时优先把数据嵌进同一文档；真要跨集合，用 `$lookup` 拼。

2. **副本集（Replica Set）**：3 节点起步，1 个 primary 接写、其余 secondary 异步复制。primary 挂了会**自动选举**新的（3.2 引入的 PV1 选举协议，思路接近 Raft）。这是 MongoDB 高可用的基石——比手搓 MySQL 主从切换简单一个数量级。

3. **分片（Sharding）**：数据量超过单机时，按一个**分片键**（shard key）把文档切到多台机器，前面用 mongos 路由器接请求。balancer 后台自动把超大的 chunk 搬走。这是它"水平扩展"的卖点。

读写接口用 **MQL（MongoDB Query Language）**：`find` / `insertOne` / `updateOne` / `aggregate`。聚合用**管道**：

```js
db.orders.aggregate([
  { $match: { status: "paid" } },
  { $group: { _id: "$user_id", total: { $sum: "$amount" } } },
  { $sort: { total: -1 } }
])
```

像 Unix pipe，一段一段过。

## 实践案例

### 案例 1：嵌套文档代替 JOIN

电商订单，关系数据库做法：

```sql
-- 三张表 + 两次 JOIN
SELECT o.*, u.name, p.title
FROM orders o
JOIN users u ON u.id = o.user_id
JOIN products p ON p.id = o.product_id
```

MongoDB 做法——下单时把要展示的字段**嵌进订单文档**：

```js
{
  _id: ObjectId("..."),
  user: { id: 42, name: "Alice" },
  product: { id: 7, title: "登山鞋", price: 599 },
  status: "paid"
}
```

读的时候一次拿全。代价：用户改名/商品调价时，订单里的副本不会自动同步——你要决定哪些字段值得"冗余"。

### 案例 2：副本集自动切换

3 节点副本集 `[A, B, C]`，A 是 primary。A 挂了：

1. B、C 互相心跳超时（默认 10 秒）→ 触发选举
2. B 拿到多数票（2/3）→ B 变 primary
3. 客户端驱动**自动重连** B，应用层基本无感（短暂报 PrimaryStepDown）

整个过程通常 10-30 秒。前提：你部署了**3 个**节点（不是 2 个）——2 节点不能在分区时凑出多数票。

### 案例 3：分片键选错的代价

把日志按 `_id` 分片，看似均匀——但 MongoDB 默认 ObjectId 单调递增，**新数据全写最后一个分片**，前面的分片闲着。这叫**热点分片**。换成基于 `user_id` 的哈希分片，写入立刻均摊。

分片键一旦选定**几乎不可改**（4.4 之前完全不能改，之后能改但代价高）——这是 MongoDB 实践里最容易栽跟头的设计决策。

## 踩过的坑

1. **以为没 schema 就不用想 schema**：文档模型让你"前期不用画 ER 图"，但**字段含义、嵌套深度、是否冗余**这些决策只是**推迟**了，不是消失。后期改一个字段名要扫所有文档，比 SQL 加个列还痛。

2. **`$lookup` 不是 SQL 的 JOIN**：性能差一个数量级，且不能跨分片。频繁要 JOIN 的场景，文档模型就不合适——选 PostgreSQL 反而省事。

3. **写入语义按版本不同**：5.0 之前默认 `writeConcern: 1`，primary 内存收到就返回；5.0 起默认改成 `majority`，多数节点确认才返回。要强一致仍可显式写 `{ w: "majority", j: true }`（j 表示等磁盘落盘）。升级前后这条默认行为变化要核对版本。

4. **SSPL 不是开源**：2018 年 MongoDB 把协议从 AGPL 改成 SSPL（Server Side Public License），OSI 拒绝认证为开源协议。云厂商分支（Amazon DocumentDB、阿里云 MongoDB 兼容版）从此不能直接用上游代码——这是开源/云博弈的标志性事件之一。

## 适用 vs 不适用场景

**适用**：

- 文档结构差异大、字段不固定（用户配置、商品 attribute、CMS 内容）
- 读多写少、读取整个对象（订单详情、用户主页）
- 早期产品原型、schema 频繁变化
- 中等规模水平扩展（GB-TB 级，单分片可支撑大部分场景）

**不适用**：

- 强事务/多表 JOIN 密集（财务系统、订单中心的复杂结算）→ PostgreSQL
- 时序/分析型大宽表 → ClickHouse / Druid
- 极简键值缓存 → Redis
- 严格 schema + 数据治理 → 关系数据库 + 迁移工具

## 历史小故事（可跳过）

- **2007**：10gen 公司原本想做"自己用的 PaaS 平台"，发现底层需要一个适合 web 应用、JSON 友好的存储，于是从平台里把这块抠出来开源。
- **2009**：MongoDB 1.0 发布。和同年的 Cassandra（Facebook）、CouchDB 一起被贴上"NoSQL"标签。
- **2010-2014**：副本集（1.6）、聚合管道（2.2）、文档级锁（3.0 WiredTiger 引擎）逐步补齐生产可用性。
- **2018**：协议从 AGPL 改 SSPL；同一时期 Elastic、Redis 也走类似路线，引发"开源 vs 云厂商"的长期争议。
- **2020 之后**：和 PostgreSQL JSONB 同台竞争——文档模型已不再是 MongoDB 独占。

## 学到什么

1. **范式转移的标志，不在于新语法，而在于新假设**：MongoDB 假设"join 不该是默认操作、schema 不该提前固化"，整个 API 围绕这两个假设展开。
2. **嵌入 vs 引用是核心建模决策**：和 SQL 的"先画第三范式再去范式化"刚好相反——MongoDB 默认嵌入，需要时才拆开。
3. **副本集 + 分片是组合**：高可用（副本集）和扩展性（分片）是两件事，可以分别上。生产环境通常先副本集、流量大了再分片。
4. **协议、生态、商业模式**也是技术选型的一部分——SSPL 让"我们是不是应该自己运维 MongoDB"变成一个商业问题。

## 延伸阅读

- 入门书：Kyle Banker 等《MongoDB in Action》第 2 版（覆盖 3.x，原理仍适用）
- 官方文档：[MongoDB Manual](https://www.mongodb.com/docs/manual/)（schema 设计章节质量很高）
- 数据建模：[6 Rules of Thumb for MongoDB Schema Design](https://www.mongodb.com/blog/post/6-rules-of-thumb-for-mongodb-schema-design)（什么时候嵌入什么时候引用）
- 协议争议：[OSI 对 SSPL 的回应](https://opensource.org/blog/the-sspl-is-not-an-open-source-license)
- [[postgresql]] —— 关系数据库通过 JSONB 在文档场景反过来追赶
- [[redis]] —— 另一种 NoSQL 思路：极简键值 + 数据结构

## 关联

- [[postgresql]] —— 关系派代表，JSONB 字段是对文档模型的回应
- [[cassandra]] —— 同期 NoSQL，强调写入吞吐 + 跨数据中心，模型更接近宽列
- [[redis]] —— NoSQL 的另一极，内存 + 数据结构，定位完全不同
- [[google-spanner]] —— 后来"NewSQL"的代表，证明强一致 + 水平扩展可以共存

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

