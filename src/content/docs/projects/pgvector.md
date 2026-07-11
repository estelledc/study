---
title: pgvector — PostgreSQL 向量扩展
来源: https://github.com/pgvector/pgvector
日期: 2026-05-29
分类: 数据库 / 向量
难度: 中级
---

## 是什么

pgvector 是 Andrew Kane 在 2021 年开源的 [[postgresql]] 扩展，让 PG 这个老牌关系型数据库**长出向量类型 + 相似度搜索的能力**。日常类比：你家厨房本来只能切菜炒饭，现在装了一个"调料模块"，立刻还能做烘焙——不用再买一台烤箱（专门的向量数据库）。

具体来说：

- 之前要做"找语义相近的文档"，得另起一台 [[milvus]] / [[qdrant]] / [[chroma]]，应用要跨两个数据库
- 装了 pgvector 之后，**已有 PG 数据库直接 `CREATE EXTENSION vector;` 就能存向量**
- 同一条 SQL 既查"用户 ID = 123"，也查"和这段话最像的 5 条评论"

## 为什么重要

不理解 pgvector 的位置，就理解不了 RAG 时代为什么"专门向量数据库"反而被打回防守位置：

- **零成本加 RAG**：已有 PG 应用（多数 SaaS、Supabase、Rails / Django 项目）不用换库就能上 LLM 检索
- **云厂商默认支持**：Supabase / Neon / AWS RDS / Google CloudSQL / Azure 都开箱带 pgvector，运维不用学新东西
- **索引不输专门库**：HNSW + IVFFlat 两种主流索引都有，召回率和延迟和专门向量库**不相上下**
- **单库哲学**：中小型应用（< 10M 向量）用一个 PG 就够，省了维护、备份、迁移、ACID 跨库一致性这些麻烦事

## 核心要点

pgvector 的 API 表面**故意做得很小**，三个核心概念：

1. **VECTOR 类型**：以数组形式存浮点向量，建表时声明维度——`embedding vector(1536)` 表示 1536 维。维度必须一致，混存会报错。

2. **三种距离运算符**：
   - `<->` L2 距离（欧氏距离）
   - `<#>` 内积（注意：取负，越小越相似）
   - `<=>` 余弦距离（1 减余弦相似度）

   选哪个看 embedding 模型推荐——OpenAI 推余弦，sentence-transformers 多用 L2。

3. **两种索引（选一个）**：
   - **IVFFlat**（聚类）：把向量聚成 N 个簇，查询时只搜最近的几个簇。建索引前要有数据（要 train）。
   - **HNSW**（图）：分层小世界图，查询时从顶层往下跳。**速度比 IVFFlat 快 10×**，但建索引更慢、内存更高。

## 实践案例

### 案例 1：从零到能查向量，三条 SQL

```sql
-- 1. 装扩展（一次性）
CREATE EXTENSION vector;

-- 2. 建表
CREATE TABLE items (
  id bigserial PRIMARY KEY,
  content text,
  embedding vector(1536)
);

-- 3. 插入（embedding 由应用层调 OpenAI 生成）
INSERT INTO items (content, embedding) VALUES
  ('cat', '[0.1, 0.2, ...]'),
  ('dog', '[0.15, 0.18, ...]');
```

到这步**还没建索引**——数据少时全表扫描就够。

### 案例 2：建 HNSW 索引 + 相似度查询

```sql
-- 建索引（选 L2 距离）
CREATE INDEX ON items USING hnsw (embedding vector_l2_ops);

-- 查询：找和给定向量最近的 5 条
SELECT content, embedding <-> '[0.1, 0.2, ...]' AS distance
FROM items
ORDER BY embedding <-> '[0.1, 0.2, ...]'
LIMIT 5;
```

**关键**：`ORDER BY` 必须用**和索引同样的距离运算符**，否则索引不会被用上，PG 会全表扫。

### 案例 3：和普通 SQL 混着用

```sql
-- 找"用户 ID = 42 写的评论"里和这段话最像的 3 条
SELECT id, content
FROM comments
WHERE user_id = 42
ORDER BY embedding <=> $1
LIMIT 3;
```

这就是 pgvector 相对专门向量库**最爽的地方**——`WHERE` 过滤和向量搜索一条 SQL 搞定，专门库要么不支持、要么要后过滤（先取 100 条再筛 3 条，召回率掉）。

## 踩过的坑

1. **大维度向量写入慢**：1536 维的向量逐条 INSERT 会非常慢，用 `COPY` 或批量 INSERT（一次 1000 条），快 10-50×。

2. **IVFFlat 必须先有数据再建索引**：IVFFlat 要 K-means 聚类，空表建索引等于聚类没意义。流程应该是：先批量灌数据 → 再 `CREATE INDEX`。

3. **和 [[milvus]] 的边界**：pgvector 不支持 sharding，单机 PG 撑不到 100M 向量。如果数据量奔着亿级去，老老实实用专门库。pgvector 的甜区是 **10 万到 1000 万向量**。

4. **PgBouncer transaction 模式破坏 prepared statement**：很多 PG 应用前面挂 PgBouncer 做连接池，**transaction 模式**下 prepared statement 不能跨连接复用，pgvector 大查询会重复 parse，性能掉一半。要么换 session 模式，要么应用层关掉 prepared statement。

5. **HNSW 建索引要内存**：千万级向量建 HNSW 可能要 10G+ 内存，云数据库实例小了会 OOM。先在本地试，再上生产。

## 适用 vs 不适用场景

**适用**：

- 已有 PG 应用想加 RAG / 语义搜索 / 推荐——零迁移成本
- 中小型规模（10 万 - 1000 万向量）—— pgvector 性能不输专门库
- 需要 `WHERE` 过滤 + 向量搜索的复合查询——一条 SQL 搞定
- 多租户 SaaS（向量按 tenant_id 分）—— PG 的 row-level security 直接套用

**不适用**：

- 亿级向量 + 高并发——pgvector 单机撑不住，用 [[milvus]] / [[qdrant]] 的分布式方案
- 需要"模糊集合检索"或专门图算法（图嵌入近邻）——专门库支持更全
- 全公司只用 NoSQL（MongoDB / DynamoDB）—— pgvector 强绑 PG，没 PG 就引入新依赖
- 极低延迟（< 1ms p99）+ 极大 QPS—— HNSW 在 PG 进程里跑，比专门库的纯内存方案慢一个量级

## 历史小故事（可跳过）

- **2021 年**：Andrew Kane（也写了 pghero / pgsync 等知名 PG 工具）开源 pgvector v0.1，只有 IVFFlat。当时 RAG 还不是主流，关注度有限。
- **2022 年 v0.4**：IVFFlat 优化、`<=>` 余弦距离运算符稳定。
- **2023 年 v0.5**：加 HNSW 索引——这是分水岭。HNSW 比 IVFFlat 快 10×，pgvector 第一次能和专门向量库**正面比性能**。同年 ChatGPT 火了，RAG 成主流，Supabase 把 pgvector 列为旗舰能力，Neon / RDS 跟进。
- **2024 年 v0.7**：加 binary quantization（向量压成 1-bit），内存掉 32×，召回掉一点点——单机能装的向量数大幅提升。

## 学到什么

1. **"扩展"是 PG 最大的护城河**：PostGIS 让 PG 做地理信息、TimescaleDB 让它做时序、pgvector 让它做向量——一个数据库吃下三个细分市场，全靠扩展生态。
2. **零迁移成本 > 性能极致**：对中小应用，"装个扩展立刻就能用"比"性能再快 30%"重要得多。pgvector 用这个定位打回了专门向量库。
3. **API 表面要小**：三个运算符、两种索引——pgvector 的 API 故意做得小，学习曲线低，文档一页能讲完。
4. **挑选索引看场景**：IVFFlat 建得快、内存省，适合数据频繁变；HNSW 查得快，适合数据稳定。没有"最好"，只有"对路"。

## 延伸阅读

- 官方 README（一页全讲完）：[github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)
- Supabase 教程：[Supabase Vector — pgvector](https://supabase.com/docs/guides/ai)（带 OpenAI embedding 完整 RAG 例子）
- Andrew Kane 自述设计哲学：[Building pgvector](https://www.youtube.com/watch?v=Sv0LZP9MtgY)
- HNSW 论文：[Malkov & Yashunin 2016](https://arxiv.org/abs/1603.09320)
- [[postgresql]] —— pgvector 的宿主，先理解 PG 的扩展机制
- [[milvus]] —— 专门向量库的代表，规模大时的另一个选择

## 关联

- [[postgresql]] —— pgvector 的宿主，扩展机制是它能存在的前提
- [[milvus]] —— 专门向量数据库，规模大时的替代
- [[qdrant]] —— Rust 写的向量库，pgvector 的另一个对手
- [[chroma]] —— 轻量向量库，定位偏开发期原型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ann-benchmarks]] —— ANN-Benchmarks — 近似最近邻算法的统一擂台
- [[faiss]] —— FAISS — 向量检索的标准件库
- [[immich]] —— Immich — 把家庭照片从别人的云里救回自己机器
- [[lance]] —— Lance — AI 数据列存格式
- [[lancedb]] —— LanceDB — 嵌入式向量库（进程内 + 对象存储）
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[qdrant]] —— Qdrant — Rust 向量数据库
- [[yugabyte-db]] —— YugabyteDB — 复用 Postgres 源码的分布式 SQL
