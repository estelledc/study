---
title: PostgreSQL — 工业级关系数据库
来源: https://github.com/postgres/postgres
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

PostgreSQL 是 1986 年 UC Berkeley 启动的关系型数据库，30+ 年持续迭代，号称"开源世界最先进的 SQL 库"。日常类比：「Oracle 是商业全套保险，PostgreSQL 是开源版的瑞士军刀——同等专业但免费」。

你可以用它来：

```sql
-- 普通关系表
CREATE TABLE users (id serial primary key, name text, age int);

-- 但它远不止这些
SELECT data->'name' FROM events WHERE data->>'kind' = 'click';  -- JSON 原生查询
SELECT * FROM articles WHERE to_tsvector('chinese', body) @@ 'PostgreSQL';  -- 全文检索
SELECT id, embedding <-> '[0.1, 0.2, ...]' AS dist FROM items ORDER BY dist;  -- 向量检索
```

一份引擎，关系 / JSON / 全文 / 向量 / 地理 / 时序——全都能干。

## 为什么重要

不理解 PostgreSQL，下面这些事都没法解释：

- 为什么 Apple / Instagram / Reddit / Discord 这些超大流量公司都选 PostgreSQL 而不是 MySQL
- 为什么 AI 时代 pgvector 一夜爆红，向量数据库公司都在被它"挤占"
- 为什么 SaaS 公司常说"先用 PG，等真撑不住再考虑别的"——它的扩展性远比想象的强
- 为什么 SQL 标准里 80% 的高级特性（窗口函数 / CTE / JSON / 物化视图）PostgreSQL 都最早完整实现

## 核心要点

PostgreSQL 的"工业级"不是营销词，背后有 **三个硬核设计**：

1. **进程模型**：每个连接 fork 一个独立进程（不是线程）。优点是隔离强、一个连接崩了不影响别人；缺点是内存开销大，连接数飙到几百就吃力——这就是为什么生产必上 PgBouncer。

2. **MVCC（多版本并发控制）**：写入新数据时不覆盖老数据，而是写新版本 + 标记旧版本。读不阻塞写、写不阻塞读，长事务也不卡读请求。代价是要定期 VACUUM 清理旧版本。

3. **扩展系统**：`CREATE EXTENSION xxx;` 一句话，加新数据类型 / 新索引 / 新函数语言。pgvector / pg_cron / TimescaleDB / PostGIS 都是这套机制下的产物——它把数据库当成"可插拔平台"。

## 实践案例

### 案例 1：装上就能用

```bash
brew install postgresql@16 && brew services start postgresql@16
# 或 docker
docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:16
psql -U postgres
```

进 `psql` 后 `\l` 列所有库、`\dt` 列表、`\q` 退出——三个命令初学者就能活下来。

### 案例 2：JSONB 把半结构化数据装进 SQL 表

```sql
CREATE TABLE events (id serial, data jsonb);
INSERT INTO events (data) VALUES ('{"kind":"click","user":{"name":"Alice"}}');
SELECT data->'user'->>'name' FROM events WHERE data->>'kind' = 'click';
CREATE INDEX ON events USING gin (data);
```

MongoDB 的核心卖点，PG 做成"普通字段"——不需要换数据库，加一列就有了。

### 案例 3：pgvector 让向量检索变成一句 SQL

```sql
CREATE EXTENSION vector;
CREATE TABLE items (id int primary key, content text, embedding vector(1536));
SELECT id, content FROM items ORDER BY embedding <-> '[0.15, ...]' LIMIT 5;
```

2023 年之前需要 Pinecone / Weaviate；现在一张普通表 + 一行 CREATE EXTENSION 就够。

## 踩过的坑

1. **连接数限制**：默认 `max_connections=100`，每个连接是独立进程开销大；serverless / Lambda 函数实例多易爆——必须前面挡 PgBouncer 把上千客户端复用到几十个底层连接。
2. **VACUUM 老化**：MVCC 写新版本 + 标记旧版本（dead tuples），autovacuum 默认保守，写密集表会膨胀（50GB 实际 5GB）→ 跑 `VACUUM FULL` 或调 autovacuum 阈值。
3. **DDL 锁表**：`ALTER TABLE ... ADD COLUMN ... DEFAULT 18` 在百万行大表会重写每行并持 ACCESS EXCLUSIVE 锁；分两步（先加无默认列、再 UPDATE）或用 `pg_repack` / `CONCURRENTLY`。
4. **复制延迟**：异步流复制（默认）主库挂时未复制完数据会丢；要绝对不丢用同步复制（`synchronous_commit=on`），延迟换一致——CAP 取舍不是 bug。

## 适用 vs 不适用场景

**适用**：

- 中重度业务系统（电商 / SaaS / 金融）——事务 / 一致性 / 复杂查询都强
- AI / RAG 应用——pgvector 一栈搞定向量
- 地理信息（PostGIS 是行业事实标准）
- 需要 JSON + SQL 混合的应用——避免"一半 Mongo 一半 MySQL"的双写

**不适用**：

- 极致写吞吐（每秒百万写入） → Cassandra / ScyllaDB 更合适
- 简单 KV 缓存 → Redis 比 PG 快几十倍
- 嵌入式 / 移动端单文件存储 → SQLite 更合适
- 时序数据极致压缩 → TimescaleDB（其实也是 PG 扩展）/ ClickHouse

## 历史小故事（可跳过）

- **1986 年**：Berkeley 教授 Michael Stonebraker 启动 Postgres 项目，目标是改进 1970s 的 INGRES。早期版本用 QUEL 查询语言。
- **1995 年**：Postgres95 加了 SQL 支持，从此世界都说 SQL。
- **1996 年**：改名 PostgreSQL，社区接管，开源协议（PostgreSQL License，类 BSD）。
- **2010 年代**：9.x 版本系列引入 JSON / 物化视图 / streaming replication，从"传统关系库"跨进"现代多模数据库"。
- **2024 年**：PG16/17 引入逻辑复制改进、JSON Path、并行查询能力大幅增强，pgvector 走红让 PG 成为 AI 基础设施。

40 年后，PostgreSQL 仍然是开源数据库领域功能最全、生态最活跃的一个。

## 学到什么

1. **MVCC 是"读不阻塞写、写不阻塞读"的工程根基**——没有它，长事务跑分析查询会让前台业务全卡住。
2. **扩展系统是 PostgreSQL 的护城河**——一个能装 pgvector / TimescaleDB / PostGIS 的引擎，比"什么都内置"灵活得多。
3. **进程模型 vs 线程模型**：MySQL 选了线程（轻量但隔离弱），PG 选了进程（重但稳）——架构选择没有对错，只有取舍。
4. **生产数据库选型默认 PostgreSQL**——除非你有非常具体的反对理由，否则它几乎总是对的。

## 延伸阅读

- 官方教程：[PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html)（从 0 学，10 章）
- 进阶必读：[Use The Index, Luke!](https://use-the-index-luke.com/)（讲 SQL 索引的圣经，PG 友好）
- pgvector 教程：[supabase/blog/openai-embeddings](https://supabase.com/blog/openai-embeddings-postgres-vector)（一篇文章把向量检索讲透）
- [[sql]] —— PostgreSQL 实现的查询语言
- [[mysql]] —— 它的"商业死敌"，对比着学最好

## 关联

- [[sql]] —— 关系数据库通用查询语言；PG 是它最完整的开源实现
- [[mysql]] —— 另一主流开源关系库；线程模型 vs PG 进程模型
- [[redis]] —— 当 PG 不够快时的缓存层
- [[sqlite]] —— 嵌入式场景的对应选择

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arangodb]] —— ArangoDB — 文档+图+KV 三合一的多模型数据库
- [[berenson-1995-isolation]] —— Berenson 1995 — ANSI SQL 隔离级别的漏洞与快照隔离
- [[cassandra]] —— Apache Cassandra — 分布式宽列数据库
- [[chatwoot]] —— chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[cockroach]] —— CockroachDB — 全球分布式 SQL
- [[cockroachdb]] —— CockroachDB — 分布式 SQL 数据库
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[couchdb]] —— Apache CouchDB — Erlang 写的文档数据库
- [[cvat]] —— CVAT — 视频帧标注与半自动追踪的开源王者
- [[dendrite]] —— Dendrite — Go 写的第二代 Matrix homeserver，组件可拆可合
- [[dgraph]] —— Dgraph — 分布式图数据库
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[docker]] —— Docker — 容器化平台
- [[drizzle]] —— Drizzle ORM — 轻量 SQL-like ORM
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
- [[duckdb-wasm]] —— duckdb-wasm — 把分析数据库塞进浏览器标签页
- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[ferretdb]] —— FerretDB — 用 PostgreSQL 当后端的开源 MongoDB 协议代理
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[grafana]] —— Grafana — 监控可视化看板
- [[gray-1978-notes]] —— Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[greenplum-db]] —— Greenplum — Postgres 改的 MPP 数仓
- [[influxdb]] —— InfluxDB — 专用时序数据库
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[inngest]] —— Inngest — 让 async 函数自动从断点恢复的工作流引擎
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[kysely]] —— Kysely — TypeScript SQL 查询构建器
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[langchain]] —— LangChain — LLM 应用开发框架
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[mariadb-server]] —— mariadb-server — MySQL 原作者带走的那一支
- [[memgraph]] —— Memgraph — 内存图数据库
- [[metabase]] —— Metabase — 让非技术人查数
- [[milvus]] —— Milvus — 开源向量数据库
- [[mongo]] —— MongoDB — 文档数据库服务端开源实现
- [[mongodb]] —— MongoDB — 文档型 NoSQL 数据库
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[mysql-server]] —— mysql-server — 一个仓库装下整套 OLTP 引擎
- [[nebula]] —— NebulaGraph — 国产分布式图数据库
- [[neo4j]] —— Neo4j — 主流图数据库
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
- [[pgvector]] —— pgvector — PostgreSQL 向量扩展
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[questdb]] —— QuestDB — 高性能时序库
- [[rails]] —— Ruby on Rails — 约定大于配置的全栈 Web 框架教科书
- [[ravendb]] —— RavenDB — .NET 生态首选的 ACID 文档数据库
- [[redis]] —— Redis — 内存键值数据库
- [[selinger-1979]] —— Selinger 1979 — 基于代价的查询优化
- [[sentry]] —— Sentry — 把崩溃和报错自动收集 + 分组 + 可查询的错误监控平台
- [[sequel-1974]] —— SEQUEL 1974 — 让数据库"听懂"近似英语的查询
- [[sequelize]] —— Sequelize — 老牌 Node ORM
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库
- [[supabase]] —— Supabase — Firebase 的开源替代
- [[superset]] —— Apache Superset — 开源 BI 平台
- [[surrealdb]] —— SurrealDB — 一种语法吃下 SQL 图 文档 向量
- [[synapse]] —— Synapse — Matrix 协议的参考 homeserver，让聊天像电邮一样能跨服务器互通
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tdengine]] —— TDengine — 一个设备一张表的国产 IoT 时序库
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展
- [[typesense]] —— Typesense — 高性能搜索引擎
- [[unstorage]] —— unstorage — 让 KV 存储不绑死运行时的统一抽象层
- [[weaviate]] —— Weaviate — 模块化向量数据库
- [[yugabyte-db]] —— YugabyteDB — 复用 Postgres 源码的分布式 SQL
- [[zulip]] —— Zulip — 强制 topic 的开源团队聊天（Django + Tornado 长轮询）

