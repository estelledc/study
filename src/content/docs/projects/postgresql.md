---
title: PostgreSQL — 工业级关系数据库
来源: https://github.com/postgres/postgres
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

PostgreSQL 是 1986 年 UC Berkeley 启动的关系型数据库，30+ 年持续迭代，号称"开源世界最先进的 SQL 库"。日常类比：「Oracle 是商业全套保险，PostgreSQL 是开源版的瑞士军刀——同等专业但免费」。

你可以用它来：

```sql
-- 普通关系表
CREATE TABLE users (id serial primary key, name text, age int);

-- 但它远不止这些
SELECT data->'name' FROM events WHERE data->>'kind' = 'click';  -- JSON 原生查询
SELECT * FROM articles WHERE to_tsvector('english', body) @@ 'PostgreSQL';  -- 全文检索（中文需 zhparser 等扩展）
SELECT id, embedding <-> '[0.1, 0.2, ...]' AS dist FROM items ORDER BY dist;  -- 向量检索
```

一份引擎，关系 / JSON / 全文 / 向量 / 地理 / 时序——全都能干。不必为每种数据再开一套库，先问"PG 能不能"往往更省事。

## 为什么重要

不理解 PostgreSQL，下面这些事都没法解释：

- 为什么 Apple / Instagram / Reddit / Discord 这些超大流量公司都选 PostgreSQL 而不是 MySQL
- 为什么 AI 时代 pgvector 一夜爆红，向量数据库公司都在被它"挤占"
- 为什么 SaaS 公司常说"先用 PG，等真撑不住再考虑别的"——它的扩展性远比想象的强
- 为什么窗口函数 / CTE / JSONB / 物化视图等多项高级特性，PostgreSQL 往往落地早且实现完整

一句话：它把"正经事务库"和"可插拔平台"叠在一起，所以能从创业第一天用到很大规模。

## 核心要点

PostgreSQL 的"工业级"不是营销词，背后有 **三个硬核设计**：

1. **进程模型**：每个连接 fork 一个独立进程（不是线程）。优点是隔离强、一个连接崩了不影响别人；缺点是内存开销大，连接数飙到几百就吃力——这就是为什么生产必上 PgBouncer。

2. **MVCC（多版本并发控制）**：写入不覆盖老数据，而是另放新版本、旧版打标记——像书架留着旧版书、新书另放一格。读不阻塞写、写不阻塞读；代价是要定期 VACUUM 清理旧版本。

3. **扩展系统**：`CREATE EXTENSION xxx;` 一句话，加新数据类型 / 新索引 / 新函数语言。pgvector / pg_cron / TimescaleDB / PostGIS 都是这套机制下的产物——它把数据库当成"可插拔平台"。

记住取舍：进程换隔离、版本换并发、扩展换生态——每一项都有运维账单。

## 实践案例

### 案例 1：装上就能用

```bash
brew install postgresql@16 && brew services start postgresql@16
# 或 docker
docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:16
psql -U postgres
```

三步：装服务 → 起实例 → 进 `psql`。进壳后 `\l` 列库、`\dt` 列表、`\q` 退出——初学者靠这三个元命令就能活下来。

### 案例 2：JSONB 把半结构化数据装进 SQL 表

```sql
CREATE TABLE events (id serial, data jsonb);
INSERT INTO events (data) VALUES ('{"kind":"click","user":{"name":"Alice"}}');
SELECT data->'user'->>'name' FROM events WHERE data->>'kind' = 'click';
CREATE INDEX ON events USING gin (data);
```

逐步读：建表放 `jsonb` 列 → 插入 JSON 文档 → `->` / `->>` 取字段过滤 → GIN 索引让 `data->>'kind'` 这类条件不扫全表。MongoDB 的核心卖点，PG 做成"普通字段"。

### 案例 3：pgvector 让向量检索变成一句 SQL

```sql
CREATE EXTENSION vector;
CREATE TABLE items (id int primary key, content text, embedding vector(1536));
SELECT id, content FROM items ORDER BY embedding <-> '[0.15, ...]' LIMIT 5;
```

`CREATE EXTENSION` 装类型 → 表里加 `vector(1536)` 列 → `<->` 按距离排序取 Top-K。2023 年前常要 Pinecone / Weaviate；现在一张普通表就够起步。

## 踩过的坑

1. **连接数限制**：默认 `max_connections=100`，每个连接是独立进程开销大；serverless / Lambda 实例多易爆——前面挡 PgBouncer，把上千客户端复用到几十个底层连接。
2. **VACUUM 老化**：MVCC 留下 dead tuples，autovacuum 默认保守，写密集表会膨胀（磁盘 50GB、有效 5GB）→ 调阈值或谨慎用 `VACUUM FULL`。
3. **DDL 锁表**：`ALTER TABLE ... ADD COLUMN ... DEFAULT 18` 在百万行表会重写并持 ACCESS EXCLUSIVE；宜分两步（先加可空列、再回填）或 `pg_repack` / `CONCURRENTLY`。
4. **复制延迟**：默认异步流复制，主库挂时未复制完会丢；要绝对不丢用同步复制（`synchronous_commit=on`），用延迟换一致。

## 适用 vs 不适用场景

**适用**：

- 中重度业务（电商 / SaaS / 金融）——事务、一致性、复杂查询都强；单机常见舒适区大约到数 TB、千级 QPS（再往上靠读写分离 / 分片）
- AI / RAG——pgvector 一栈搞定向量，原型到中小流量够用
- 地理信息（PostGIS 是行业事实标准）
- JSON + SQL 混合——避免"一半 Mongo 一半 MySQL"双写

**不适用**：

- 极致写吞吐（每秒百万写入）→ Cassandra / ScyllaDB
- 简单 KV 缓存 → Redis 通常快一个数量级以上
- 嵌入式 / 移动端单文件 → SQLite
- 时序极致压缩 → TimescaleDB（PG 扩展）或 ClickHouse

## 历史小故事（可跳过）

- **1986 年**：Michael Stonebraker 在 Berkeley 启动 Postgres，目标改进 1970s 的 INGRES；早期用 QUEL。
- **1995–1996 年**：Postgres95 加 SQL；改名 PostgreSQL，社区接管，PostgreSQL License（类 BSD）。
- **2010 年代**：9.x 引入 JSON / 物化视图 / streaming replication，跨进"多模"。
- **2023–2024 年**：pgvector 走红；PG16/17 加强逻辑复制、并行查询，PG 成为常见 AI 基础设施底座。

40 年后它仍是开源库里功能面最宽、生态最活的一支——不是因为它从不落后，而是因为它总能把新需求接成扩展。

## 学到什么

1. **MVCC** 是"读不阻塞写、写不阻塞读"的工程根基——没有它，长分析查询会卡住前台写入。
2. **扩展系统**是护城河——能装 pgvector / TimescaleDB / PostGIS，比"什么都内置"灵活。
3. **进程 vs 线程**：MySQL 偏线程（轻、隔离弱），PG 偏进程（重、稳）——没有绝对对错。
4. **选型默认值**：没有非常具体的反对理由时，业务库先选 PostgreSQL 通常是稳妥起点。

生产上再记一条：**先 PgBouncer + 盯 autovacuum**，比一上来分库分表更能解决 80% 的痛。

## 延伸阅读

- 官方教程：[PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html)
- 索引必读：[Use The Index, Luke!](https://use-the-index-luke.com/)
- pgvector：[supabase/blog/openai-embeddings](https://supabase.com/blog/openai-embeddings-postgres-vector)
- 运维手册：[PostgreSQL Wiki — Tuning](https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server)
- [[sql]] —— PG 实现的查询语言
- [[mysql]] —— 对照着学进程/线程与生态差异
- [[pgvector]] —— 向量扩展本身

## 关联

- [[sql]] —— 关系数据库通用查询语言；PG 是完整的开源实现之一
- [[mysql]] —— 另一主流开源关系库；线程模型 vs PG 进程模型
- [[redis]] —— 当 PG 不够快时的缓存层
- [[sqlite]] —— 嵌入式场景的对应选择
- [[pgvector]] —— 把向量检索塞进 PG 的扩展
- [[timescaledb]] —— 在 PG 上做时序的扩展路线
- [[cockroachdb]] —— 要全球分布式 SQL 时的对照
- [[supabase]] —— 把 PG 包装成 BaaS 的常见入口
- [[ferretdb]] —— 用 PG 当存储、对外说 Mongo 协议的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
