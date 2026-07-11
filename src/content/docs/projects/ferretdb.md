---
title: FerretDB — 用 PostgreSQL 当后端的开源 MongoDB 协议代理
来源: https://github.com/FerretDB/FerretDB
日期: 2026-05-31
分类: 数据库 / NoSQL
难度: 中级
---

## 是什么

FerretDB 是一个**翻译层**：客户端以为自己在跟 [[mongodb]] 说话，FerretDB 把指令翻译成 SQL，再交给 [[postgresql]] 真正存数据。日常类比：你点一份西班牙菜，前台用西语接单（MongoDB 协议），后厨只听中文（PostgreSQL）——FerretDB 是中间那位翻译。

你启动 FerretDB 后：

```bash
# 后端连一个 PostgreSQL，FerretDB 自己监听 27017 端口
ferretdb --postgresql-url=postgres://user:pass@localhost:5432/ferretdb
```

然后用 MongoDB 官方 driver 连过来：

```js
const client = new MongoClient('mongodb://localhost:27017')
await client.db('app').collection('users').insertOne({ name: 'Alice' })
```

driver 不知道自己其实在写 PostgreSQL。这就是 FerretDB 的核心承诺：**MongoDB API 兼容、PostgreSQL 存储、Apache-2.0 协议真开源**。

## 为什么重要

不理解 FerretDB，下面这些事都会反直觉：

- 为什么 2021 年突然冒出来——MongoDB 2018 改 SSPL 许可证后，"想用 MongoDB API 又必须用真开源"的人没处去
- 为什么不直接 fork MongoDB——SSPL 让你 fork 也躲不掉条款，得另起炉灶
- 为什么选 PostgreSQL 当后端——成熟、JSONB 能存半结构化文档、运维生态完整
- 为什么对 AWS DocumentDB / 阿里云 MongoAPI 是补充——后两者是闭源云服务，FerretDB 可自托管、可审计

## 核心要点

FerretDB 的工作可以拆成 **三段**：

1. **wire protocol 解析**：MongoDB 客户端发的是二进制 BSON 包（BSON ≈ 带类型信息的二进制 JSON），FerretDB 用 Go 实现一份 wire protocol 解码器，把 `insert` / `find` / `aggregate` 这些命令还原成数据结构。

2. **SQL 翻译**：解析出来的命令再翻成 SQL。早期把文档存在 PostgreSQL 的 JSONB 列里；新版基于 Microsoft 开源的 `pg_documentdb` 扩展，BSON 直存到 PG，索引和查询计划都更高效。

3. **结果回译**：PostgreSQL 返回行集，FerretDB 把它包回 BSON，按 wire protocol 格式发给客户端。整条链路客户端无感。

三段加起来让你**不改一行业务代码**，把 MongoDB 换成 PostgreSQL。

## 实践案例

### 案例 1：5 分钟跑起来

```bash
# 同一 Docker 网络里起 PostgreSQL + FerretDB（Linux 也适用）
docker network create ferret-net
docker run -d --name pg --network ferret-net \
  -e POSTGRES_PASSWORD=pw postgres:16
docker run -d --name ferret --network ferret-net -p 27017:27017 \
  -e FERRETDB_POSTGRESQL_URL=postgres://postgres:pw@pg:5432/postgres \
  ghcr.io/ferretdb/ferretdb
mongosh mongodb://localhost:27017/test
```

**逐部分解释**：

- `ferret-net` 让两个容器用服务名互相访问，避免 `host.docker.internal` 在 Linux 上失效。
- FerretDB 监听 `27017`，对外仍是标准 MongoDB 端口。
- 进 `mongosh` 后写普通 MongoDB 命令，背后落到 PostgreSQL：

```js
db.users.insertOne({ name: 'Alice', tags: ['admin'] })
db.users.find({ tags: 'admin' })
```

### 案例 2：看 PostgreSQL 那一侧发生了什么

```bash
docker exec -it pg psql -U postgres -d postgres
\dt+
```

**逐部分解释**：

- FerretDB 会自动建表，例如 metadata 表和 `users_xxxxx` 这类集合表。
- 每条 MongoDB 文档对应一行；内容在 JSONB 或 documentdb 扩展列里。
- 可以直接用 SQL 核对：

```sql
SELECT _jsonb FROM users_xxxxx LIMIT 1;
```

### 案例 3：从 MongoDB 迁过来

driver 端只换连接字符串：

```diff
- mongodb+srv://<user>:<password>@cluster0.mongodb.net/app
+ mongodb://<user>:<password>@ferretdb.internal:27017/app
```

**逐部分解释**：

- 业务代码和官方 driver 不用改，只改 URI。
- 数据用 `mongorestore` 把 BSON 备份灌进 FerretDB，由它再翻成 SQL 入库。
- 上线前先对照兼容性矩阵，确认用到的 operator 都在支持列表里。

## 踩过的坑

1. **不是 100% 兼容**：常见 CRUD、索引、aggregation 主流 stage 都支持；但部分罕用 operator（如某些地理 / 全文 / `$where` JS 求值）缺失或行为不同。生产上线前用 [[mongodb]] 官方 compatibility test 跑一遍。

2. **事务语义有差异**：MongoDB 多文档事务依赖 replica set；FerretDB 把事务下推给 PostgreSQL，单实例下能跑，但跨集合一致性边界跟 MongoDB 文档说的不完全一致。

3. **Docker 网络别写死 host.docker.internal**：那是 Docker Desktop 习惯写法，默认 Linux 常解析失败；用自定义 network + 服务名，或显式 `--add-host=host.docker.internal:host-gateway`。

4. **Sharding 不是原生**：MongoDB 的 sharding 拓扑（mongos + config server）FerretDB 不复刻——要水平扩展走 PostgreSQL 自己的方案（Citus / 读写分离 + 分库）。

5. **性能不是卖点，版本也要锁**：相同硬件下原生 MongoDB 通常更快；v1 JSONB 与 v2 documentdb 行为不同，别只追 latest。

## 适用 vs 不适用场景

**适用**：
- 内部 / 政府 / 离线环境，必须用 OSI 认可的真开源数据库，但应用代码用 MongoDB driver
- 团队已有 PostgreSQL 运维经验、备份、监控，不想再养一套 MongoDB
- 从 MongoDB Atlas 迁出，预算或合规要求自托管，又不想重写 driver
- 在 [[postgresql]] 实例上加一份"文档数据库"用法，避免维护两套系统

**不适用**：
- 真要榨 MongoDB 性能上限——选原生 [[mongodb]]，FerretDB 多一层翻译
- 重度依赖 MongoDB 高级特性（Atlas Search、Charts、Realm、Time Series 优化）
- 已经在 MongoDB sharding 集群跑大体量——FerretDB 没复刻这套拓扑
- 不需要 MongoDB API 的新项目——直接用 [[postgresql]] JSONB 更简单

## 历史小故事（可跳过）

- **2018 年**：MongoDB 从 AGPL 改成 SSPL，OSI 拒绝认证 SSPL 为开源协议，云厂商和合规敏感的用户开始找替代。
- **2021 年**：Peter Farkas 等人创立 FerretDB（曾名 MangoDB），把"MongoDB 协议 + PostgreSQL 后端"这条路开起来。
- **2023 年**：v1.0 GA，宣布 production ready，专注 MongoDB 6.0 兼容子集。
- **2024 年**：与 Microsoft 合作，基于其开源的 `pg_documentdb` PostgreSQL 扩展重构存储层，BSON 原生支持。
- **2025 年**：v2 系列发布，性能和兼容范围大幅提升，加入更多 aggregation operator。

## 学到什么

1. **协议兼容是一条独立的护城河**——driver、ORM、运维脚本一旦绑定某个 wire protocol，迁移成本极高，FerretDB 抓的就是这个点
2. **"真开源"在 2020 年代变成商业差异点**——SSPL / BSL / Elastic License 之后，Apache-2.0 / MIT 反而稀缺
3. **底层复用比另起炉灶更聪明**——PostgreSQL 几十年的 WAL、复制、备份、监控生态全部白送
4. **翻译层永远比原生慢**——这是工程取舍而非技术失败，你换的是合规和生态

## 延伸阅读

- 官方文档：[FerretDB Docs](https://docs.ferretdb.io/)（覆盖安装、兼容性矩阵、迁移指南）
- 兼容性矩阵：[Supported Commands](https://docs.ferretdb.io/reference/supported-commands/)（哪些 MongoDB 命令支持 / 部分支持 / 不支持）
- 博客文章：[Why we built FerretDB](https://blog.ferretdb.io/)（创始团队讲 SSPL 后的开源数据库版图）
- documentdb 扩展：[microsoft/documentdb](https://github.com/microsoft/documentdb)（FerretDB v2 的存储底座）
- [[mongodb]] —— 协议来源、参考实现
- [[postgresql]] —— 真正的存储后端

## 关联

- [[mongodb]] —— FerretDB 兼容的协议来源；想理解 BSON / wire protocol / aggregation 都得回这里
- [[postgresql]] —— FerretDB 的存储后端，PG 的 JSONB 和扩展机制让这条路成立
- [[cassandra]] —— 同样是 NoSQL，但选了"宽列 + 最终一致"，跟 FerretDB 的"文档 + 关系底座"是不同流派
- [[redis]] —— 内存 KV 型 NoSQL，跟 FerretDB 形成"协议代理"vs"原生快"的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
