---
title: Kùzu — 把图数据库做成 DuckDB
来源: https://github.com/kuzudb/kuzu
日期: 2026-06-01
分类: 数据库
难度: 中级
---

## 是什么

Kùzu 是一个**嵌入式图数据库**——它不像 Neo4j 那样要起一个常驻服务进程，而是**作为库被你的程序直接引用**，数据存在一个本地目录里，你的代码读它就像读一个本地文件。

日常类比：

- 关系表领域里有个 SQLite——不用装服务器，导一个库就能查 SQL
- 关系表 OLAP 领域里有个 DuckDB——不用装服务器，导一个库就能跑分析查询
- 图领域以前**没有**这种东西。要么 Neo4j（要起服务）、要么 NetworkX（纯内存、单机、不持久化）
- Kùzu 来填这个空——**图领域的 DuckDB**

它用 **Cypher** 作查询语言（和 Neo4j 同一套语法）。你写 `MATCH (a)-[:KNOWS]->(b) RETURN b.name`，它从你本地目录里读图数据返还结果。

## 为什么重要

不理解 Kùzu 这种"嵌入式 OLAP 图库"，下面这些事看不清楚：

- 为什么 GraphRAG（用知识图谱做 RAG）这两年突然能在 Python 笔记本里跑——以前要么没图库、要么装 Neo4j 起服务太重
- 为什么 LangChain / LlamaIndex 把 Kùzu 列为默认图后端之一——它够轻、够快、零部署
- 数据库领域的"嵌入式 + 列式 + 向量化"这三件套是怎么从关系表蔓延到图、文档、向量等其他数据模型的
- 学术界（滑铁卢大学）的 factorized query / worst-case optimal join 这些理论怎么落到工程上
- 为什么图数据库赛道在沉寂多年后又被 LLM 时代重新点燃——知识图谱回到了 RAG 主舞台

## 核心要点

Kùzu 的三个工程要点：

1. **嵌入式**：不是 client/server，进程内直接用。Python 里 `import kuzu; db = kuzu.Database('./mydb')` 就开搞。数据落在本地目录，可以拷走、可以版本控制、可以和 Parquet 混用。也就是说，没有运维负担。

2. **列式 + 向量化**：节点/边按列存（不是 Neo4j 的指针链表），查询走向量化执行（一次处理一批数据，不是一行一行）。这是 OLAP 数据库的标配——DuckDB 也这样。换来的是：跑大批 `MATCH ... RETURN COUNT(*)` 这种聚合分析快。

3. **factorized 处理 + 最坏情形最优连接**：图查询里多对多关系常炸——10 万节点 × 每节点 100 条边 = 1000 万行中间结果。Kùzu 用学术界的两个技巧（factorized query / worst-case optimal join）把这个中间结果**保持嵌套形式不展开**，结果大小有数学上的紧界。

类比：传统行式数据库每次只能拿一根筷子戳一颗豆子；列式 + 向量化数据库一次抓一把豆子统一处理。图查询的难点是"豆子之间还有线连着"，factorized 让连线信息也一起被压缩处理。

## 实践案例

### 案例 1：30 秒上手

```python
import kuzu
db = kuzu.Database('./mydb')
conn = kuzu.Connection(db)

conn.execute("CREATE NODE TABLE Person(name STRING, age INT64, PRIMARY KEY(name))")
conn.execute("CREATE REL TABLE Knows(FROM Person TO Person, since INT64)")
conn.execute("CREATE (:Person {name: 'Alice', age: 30})")
conn.execute("CREATE (:Person {name: 'Bob', age: 25})")
conn.execute("MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) "
             "CREATE (a)-[:Knows {since: 2020}]->(b)")

result = conn.execute("MATCH (a)-[:Knows]->(b) RETURN a.name, b.name")
print(result.get_as_df())
```

整个过程**没起任何服务**。所有动作在你的 Python 进程里完成，数据在 `./mydb/` 目录。这就是嵌入式的力量。

### 案例 2：和 Pandas / Arrow 混着用

```python
import pandas as pd
df = pd.read_csv('persons.csv')
conn.execute("COPY Person FROM df")  # 直接喂 DataFrame，零拷贝
result_df = conn.execute("MATCH (p:Person) RETURN p.name, p.age").get_as_df()
```

Kùzu 用 Apache Arrow 作中间格式，所以和 Pandas / Polars / DuckDB 之间传数据**不需要序列化**。这点对 ML 工程师特别友好。

实际工程里这是 GraphRAG / 知识图谱机器学习管道最常用的入口。Pandas 做特征工程、Kùzu 做图遍历、PyTorch 做模型训练，三者通过 Arrow 串成无拷贝的流水线。

### 案例 3：图 + 向量混合检索（GraphRAG）

```python
conn.execute("CREATE NODE TABLE Doc(id STRING, embedding FLOAT[768], PRIMARY KEY(id))")
conn.execute("CALL CREATE_VECTOR_INDEX('Doc', 'doc_idx', 'embedding')")
conn.execute("""
  CALL QUERY_VECTOR_INDEX('Doc', 'doc_idx', $query_vec, 5)
  YIELD node, distance
  MATCH (node)-[:CITES]->(other)
  RETURN node.id, other.id, distance
""", {"query_vec": [0.1, 0.2, ...]})
```

这一段做了三件事：向量近邻搜索 → 拿到相关文档 → 沿着引用边再走一跳。**纯 SQL 数据库做不到第三步**，纯向量库（Pinecone / Milvus）做不到；Kùzu 把两者合一。

这种"先按相似度找候选 → 再沿关系图扩展上下文"的两段式检索，被认为是 GraphRAG 比纯向量 RAG 多出来的关键能力——纯向量只能找"相似的"，加上图遍历能找"虽然不直接相似但通过引用/共现关联的"。

## 踩过的坑

1. **Kùzu 是 OLAP 不是 OLTP**：高并发短事务（每秒几千次小写）不是它的目标。需要这种就用 Neo4j / Postgres。
2. **schema 必须先建**：Cypher 在 Neo4j 是 schemaless（边可以随时加新属性），但 Kùzu 要求 `CREATE NODE TABLE` / `CREATE REL TABLE` 预先声明列。这是列式存储的代价。
3. **嵌入式 = 单进程**：两个 Python 进程同时写同一个 Kùzu 目录会冲突（有文件锁）。多人协作要走外面的 server 包装层。
4. **Cypher 子集**：Kùzu 实现的是 Cypher 的一个子集 + 自己扩展，不是 Neo4j 完全兼容。某些复杂语法（如 `CALL { ... }` 子查询的高级用法）支持有限。
5. **写入慢于读取**：列式存储擅长批量读，逐条 `CREATE` 比 Neo4j 的 OLTP 路径要慢。批量导入用 `COPY FROM` 才能发挥列存优势。
6. **磁盘空间敏感**：列式 + 多种索引（含向量索引）会让磁盘占用比朴素的邻接表大几倍。10GB 原始数据可能膨胀到 30GB 落盘。

## 适用 vs 不适用场景

**适用**：

- Python 笔记本里做图数据分析（社交网络、知识图谱、依赖关系）
- GraphRAG / 知识图谱增强 RAG（向量检索 + 图遍历一站搞定）
- 学术研究的图算法实验（PageRank、社区发现、shortest path）
- 数据管道里"读 Parquet → 图分析 → 写回 Parquet"这种 batch 场景
- 想把图查询能力嵌进现有 Python / Rust 应用，又不想多维护一个数据库服务

**不适用**：

- 高并发 OLTP（订单系统、社交动态写入）→ 用 Neo4j / Postgres
- 全文搜索 + 图（需要 Elasticsearch 那种倒排）→ Kùzu 的全文支持有限
- 分布式集群（Kùzu 目前是单机库）→ 图领域的"分布式 OLAP"基本还是空白
- 千亿规模超大图（百亿节点 + 万亿边）→ 仍需 TigerGraph / 大厂自研

## 学到什么

1. **嵌入式不是简陋的代名词**——SQLite / DuckDB / Kùzu 都证明了"进程内库 + 完整查询语言 + 工程级实现"是个真实赛道
2. **OLAP 化的关键三件套**：列式存储 + 向量化执行 + 学术界最新算法（factorized / WCOJ）；这套组合从关系表（DuckDB）蔓延到图（Kùzu）、向量（LanceDB）、时序（QuestDB）
3. **图 + 向量正在合流**——以前是两个产品；现在 Kùzu / Neo4j（带向量索引插件）/ Postgres+pgvector 都在卷"图 + 向量混合"
4. **大学实验室直接做工业产品**这条路在数据库领域很活——DuckDB 来自 CWI、Kùzu 来自 Waterloo、TimescaleDB 早期来自 Princeton
5. **数据模型的选择是工程决定**：图、表、文档、向量、时序，每种都对应一类查询模式。不要因为"图听起来高级"就上图库；先问"我的查询里有没有跨多跳的连接"。如果有，图库省事；如果没有，关系表更稳。

## 一句话记忆

> Kùzu = DuckDB 的设计模板 + 图数据模型 + Cypher 查询语言 + 嵌入式部署。
> 选它的理由不是"它是图库"，而是"零运维 + 列式快 + 和 ML 工具链零拷贝"。

## 延伸阅读

- 官方文档：[Kùzu Docs](https://docs.kuzudb.com/)
- factorized query 论文：[Olteanu - Factorised Representations](https://www.cs.ox.ac.uk/dan.olteanu/papers/oz-tods15.pdf)
- worst-case optimal join 入门：[Ngo et al. 2018](https://arxiv.org/abs/1310.3314)
- [[duckdb]] —— 关系表领域的同位素，Kùzu 的设计原型
- [[neo4j]] —— 图领域的传统选手（server 模式 OLTP）

## 关联

- [[duckdb]] —— 嵌入式 OLAP 数据库的范式定义者，Kùzu 几乎是它的图版
- [[neo4j]] —— 同样用 Cypher，但定位 server + OLTP，正好和 Kùzu 互补
- [[janusgraph]] —— 分布式图数据库，定位 OLTP 大集群，与 Kùzu 完全不同档位
- [[dgraph]] —— 用 GraphQL 接口的分布式图数据库，与 Kùzu 在嵌入 vs 集群两条路上分叉
- [[surrealdb]] —— 多模数据库（文档+图+KV），追求 all-in-one；Kùzu 选了"只做图但做到极致"
- [[duckdb-wasm]] —— DuckDB 的浏览器版，Kùzu 也在尝试 WASM 移植走类似路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[memgraph]] —— Memgraph — 内存图数据库
