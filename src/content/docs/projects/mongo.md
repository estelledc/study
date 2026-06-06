---
title: MongoDB — 文档数据库服务端开源实现
description: mongod 单节点与 mongos 分片路由；BSON 文档模型、副本集与分片定义 NoSQL 文档范式
来源: 'https://github.com/mongodb/mongo'
日期: 2026-06-05
分类: 数据库
子分类: 存储与查询
难度: 中级
provenance: manual-read
---

## 是什么

**MongoDB**（本仓库 `mongo`）是 MongoDB Inc. 开源的**文档型数据库服务端**：核心进程 `mongod` 负责存储与查询，`mongos` 在分片集群中充当路由层。数据以 **BSON**（类 JSON 二进制）文档形式存放在 collection 里，schema 灵活，水平扩展靠 replica set + sharding。

日常类比：如果 [[postgresql]] 像 Excel 表格（行列固定），MongoDB 像**一抽屉 JSON 文件**——每个文档字段可以不同，加字段不用 ALTER TABLE，但你要自己设计索引和一致性边界。

组件一览：

| 进程 | 角色 |
|------|------|
| mongod | 数据库服务器（单机或副本集成员） |
| mongos | 分片集群查询路由器 |
| mongosh | 官方 shell 客户端（独立仓库） |

## 为什么重要

不懂 MongoDB 服务端，很难解释现代 NoSQL 文档栈的默认假设：

- **定义了「文档库」范式**：Driver → mongod → WiredTiger 存储引擎，影响 [[redis]] 之外的另一类持久化选型
- **副本集是 HA 默认形态**：三节点 rs0 是生产最小共识，failover 机制与 [[postgresql]] 流复制不同
- **分片键决定命运**：选错 shard key 后期几乎无法无痛改——架构决策前置
- **许可证变迁**：2018-10-16 后 SSPL，云厂商托管策略与 AGPL 时代不同

## 核心要点

1. **BSON + 灵活 schema**：嵌套文档、数组原生支持；但无 JOIN 语义（$lookup 有限），关联建模要反范式或应用层拼。

2. **索引与查询 planner**：compound index 前缀规则、multikey index 对数组字段；`explain("executionStats")` 是性能调优第一工具。

3. **写关注 read concern**：`w: majority` + `readConcern: majority` 组合决定你能读到什么、宕机丢什么——CAP 在 API 层显式化。

## 实践案例

### 案例 1：本地单节点开发

```bash
sudo mkdir -p /data/db
./mongod --dbpath /data/db --bind_ip 127.0.0.1

# 另一终端
./mongosh
test> db.users.insertOne({ name: "alice", tags: ["dev", "mongo"] })
test> db.users.find({ tags: "dev" })
```

生产勿裸跑单节点；开发机这样最快验证 driver 与 schema。

### 案例 2：副本集最小三节点（概念）

```javascript
// 初始化 rs（仅示意，实际需三台 mongod 不同端口）
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017" },
    { _id: 1, host: "mongo2:27017" },
    { _id: 2, host: "mongo3:27017" },
  ]
})
```

Driver 连接串写 `mongodb://mongo1,mongo2,mongo3/?replicaSet=rs0`；primary 选举由副本集自治。

### 案例 3：Docker 快速拉起

```bash
docker pull mongodb/mongodb-community-server
docker run -d -p 27017:27017 -v mongo_data:/data/db --name mongo mongodb/mongodb-community-server
```

与 [[docker]] 编排结合是 CI 集成测试常见做法；持久化卷别忘挂。

## 踩过的坑

1. **默认无 auth 的开发习惯带进生产**：`--bind_ip 0.0.0.0` 且无用户是勒索软件温床——启用 SCRAM + 网络隔离。

2. **大文档 16MB 限制**：单 document 上限 16MB，GridFS 才能存大文件；视频 blob 别直接塞 collection。

3. **shard key 单调递增**：如 `_id` ObjectId 默认导致单 shard 热点——用 hashed shard key 或复合键打散。

4. **majority 写延迟**：跨地域副本集 `w: majority` 延迟高——读可用 `readPreference: secondaryPreferred` 但要接受 staleness。

5. **索引 build 锁表感**：大 collection 后台建索引仍可能影响写延迟——用 `createIndex({...}, {background: true})` 并监控 `currentOp`。

## 适用 vs 不适用场景

**适用：**

- 半结构化业务数据、快速迭代 schema 的产品后端
- 需要水平分片的海量日志/事件（配合合适 shard key）
- 地理副本与自动 failover 的文档 workload

**不适用：**

- 强关系多表 JOIN 报表（选 [[postgresql]]）
- 强 ACID 跨行事务为主的核心账本（除非 4.0+ 多文档事务且 carefully 设计）
- 纯缓存层（[[redis]] 更合适）
- 需要复杂 GIS/全文在同一 SQL 引擎里 join 的报表——文档模型会痛苦

## 历史小故事（可跳过）

- **2007**：10gen（后改名 MongoDB Inc.）发布 MongoDB
- **2018.10**：社区版 license 从 AGPL 转为 SSPL，引发托管争议
- **2020s**：WiredTiger 成为默认存储引擎；Time Series / Atlas Search 扩展文档库边界
- **今**：与 [[postgresql]] JSONB 形成「灵活 vs 关系」经典对照；Atlas Vector Search 把向量检索拉回同一产品栈

## 学到什么

- 文档库的力量在迭代速度，代价是 schema 纪律要工程化（索引、validator、迁移脚本）
- 副本集/分片不是「装上就有 HA」，运维面板和 backup 策略才是生产门槛
- 读 server 源码（`mongo` 仓库）有助于理解 driver 报错背后的 replication 状态机
- Change Stream 是 Mongo 进实时 ETL 的隐藏王牌，别只会 CRUD

## 延伸阅读

- 官方手册：https://docs.mongodb.com/manual/
- MongoDB University 免费课
- Building MongoDB：`docs/building.md`
- [[postgresql]] —— 关系型对照
- [[redis]] —— 缓存/结构存储对照

## 关联

- [[postgresql]] —— SQL 关系型对照
- [[redis]] —— 内存结构存储
- [[docker]] —— 容器化部署
- [[rethinkdb]] —— 另一文档/Reactive 路线
- [[sled]] —— 嵌入式 KV 对照
- [[debezium]] —— CDC 同步出 Mongo 变更
- [[clickhouse]] —— 分析型列存对照（OLAP vs 文档 OLTP）
- [[milvus]] —— 向量检索常与 Mongo 元数据并存
- [[prometheus]] —— mongodb_exporter 监控副本集健康
- [[timescaledb]] —— 时序数据另一选型对照
- [[postgresql]] —— 迁移来源常见对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[milvus]] —— Milvus — 开源向量数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[prometheus]] —— Prometheus — 时序监控系统
- [[redis]] —— Redis — 内存键值数据库
- [[rethinkdb]] —— RethinkDB — 让数据库自己把更新推给客户端的先驱
- [[sled]] —— sled — Rust 现代 BTree + LSM 混合嵌入式 KV
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展

