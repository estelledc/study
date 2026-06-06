---
title: Elasticsearch — 分布式搜索引擎
来源: https://github.com/elastic/elasticsearch
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Elasticsearch 是一个**基于 [[lucene]] 构建的"分布式 + RESTful API + JSON"搜索引擎**。

日常类比：

- [[postgresql]] 像图书馆按编号查书——你必须知道这本书在哪个架、哪一行
- Elasticsearch 像 Google 搜索引擎——你输入关键词，它返回所有相关书籍，并按"相关程度"打分排序

它不是要替代关系型数据库，而是补全它的弱项：**全文搜索、模糊匹配、海量日志聚合、多维度过滤**。Postgres 也能做 LIKE 查询，但一旦数据量上千万行、查询带模糊匹配 + 排序 + 聚合，Postgres 就吃力，而 Elasticsearch 的倒排索引天生为这种场景设计。

## 为什么重要

下面这些场景，Elasticsearch 几乎是默认选择：

- **大型应用日志搜索**：GitHub / Stack Overflow / Wikipedia 站内搜索都用它
- **全文检索 + 评分排序**：电商搜索"iPhone 13 256G 黑"要按相关度排，关系库做不到
- **可观测性（运维监控）**：ELK Stack（Elasticsearch + Logstash + Kibana）是开源运维监控标配——日志收集、聚合、可视化一条龙
- **8.x 后内置向量搜索**：可以存 embedding 向量做语义搜索，与 Pinecone / Milvus 这类专门向量库正面竞争
- **2021 SSPL 许可争议**：Elastic 公司把开源许可从 Apache 2.0 改成 SSPL（带反云厂商条款），AWS 直接 fork 出 OpenSearch——这件事影响了之后整个开源数据库圈对许可证的选择

## 核心要点

理解 Elasticsearch 抓三个概念就够：

### 倒排索引（Inverted Index）

普通索引：从"文档 ID"找"内容"。倒排索引：从"词"找"哪些文档包含这个词"。

类比：书末尾的"索引页"，告诉你"分布式"这个词出现在哪些章节。Elasticsearch 把这种结构做到极致——任何字段建索引后都能毫秒级查"包含某词的全部文档"。

### 分片 + 副本（Shard + Replica）

每个 index（类似数据库里的表）默认切成多个 shard，自动分布到集群的多台机器上。每个 shard 还可以有副本（replica）做容灾。

- shard 决定**水平扩展能力**：数据多了加机器就行
- replica 决定**可用性**：主 shard 挂了，副本顶上

### DSL 查询语言

用嵌套 JSON 表达复杂查询条件 + 聚合，叫 Query DSL。比 SQL 更适合"模糊 + 多条件 + 聚合"组合，但学习曲线比 SQL 陡。

## 实践案例

### 案例 一：本地启一个单节点集群

```bash
docker run -p 9200:9200 -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  elasticsearch:8.11.0
```

`discovery.type=single-node` 告诉它"不要去找其他节点"，否则它会一直等集群成员。`xpack.security.enabled=false` 关掉认证（仅本地玩具用）。

### 案例 二：索引一个文档

```http
PUT /products/_doc/1
Content-Type: application/json

{
  "name": "iPhone 13",
  "price": 999,
  "tags": ["phone", "apple"]
}
```

`/products` 是索引名（相当于表）；`/_doc/1` 是文档 ID。Elasticsearch 自动推断字段类型（name → text，price → long，tags → keyword 数组），这叫**动态 mapping**。

### 案例 三：搜索 + 评分

```http
POST /products/_search
Content-Type: application/json

{
  "query": {
    "match": { "name": "iPhone" }
  }
}
```

返回结果里每个文档都有一个 `_score`——这就是"相关度评分"，由 BM25 算法算出（默认）。`match` 会对查询词做分词，所以搜 "iphone 13 black" 能匹配到 "iPhone 13" 文档。

## 踩过的坑

### Mapping 一旦定义不能改字段类型

字段一旦确定是 `text` 或 `long`，**改不了**。要改只能：

1. 新建一个空 index，用对的 mapping
2. 用 `_reindex` API 把旧数据全量复制过去
3. 切换别名指向新 index

新人最容易踩——动态 mapping 把字段推断错了，几个月后才发现，数据已经几亿条。

### 分片数 fix 后不能改

`number_of_shards` 在 index 创建时定，**之后改不了**。设小了没法水平扩展，设大了每个 shard 太小浪费资源。生产经验：单 shard 控制在 **10-50GB**，按预期数据量算 shard 数。

### 内存（heap）默认 1G 太小

JVM heap 默认 1G，生产环境至少 16-32G。但**不要超过 32G**——超过后 JVM 失去 compressed oops 优化反而更慢。机器物理内存的另一半留给 Lucene 的文件系统缓存（Lucene 大量使用 mmap）。

### 慢日志和热索引混在一起影响性能

把"慢的写入密集型 index"（比如日志）和"快的查询密集型 index"（比如商品搜索）放同一个集群，互相影响。最佳实践：**分集群** —— logging 集群和 search 集群独立。

## 历史小故事

- **2010 年**：Shay Banon 给妻子做菜谱搜索时，对 Lucene 做了分布式封装，开源命名为 Elasticsearch
- **2012 年**：Elastic 公司成立，商业化
- **2015 年**：上市 IPO
- **2021 年**：许可证从 Apache 2.0 改成 SSPL（限制云厂商免费托管），不再算"开源"
- **2021-04**：AWS fork 出 OpenSearch（保留 Apache 2.0 许可），社区分裂
- **2024 年**：Elasticsearch 8.x 主推向量搜索 + 内置 ML 模型（ELSER）做语义搜索

## 学到什么

1. **关系库 + 搜索引擎是互补关系**：写入和事务靠关系库（Postgres），查询和聚合靠搜索引擎（Elasticsearch）。常见架构是 Postgres 写主存储 → CDC（变更数据捕获）同步到 Elasticsearch
2. **倒排索引是搜索引擎的命根子**：理解它就理解 80% 的搜索引擎设计
3. **shard / replica 是分布式系统的通用语言**：[[mongodb]] / [[cassandra]] / Kafka 的设计哲学一样
4. **开源许可证是商业战略**：SSPL 之争之后，Redis / MongoDB / Confluent 都跟进改许可，云厂商也都做了 fork，整个生态都被影响

## 关联

- [[lucene]] —— Elasticsearch 的底层搜索引擎库；倒排索引、分词、评分都在 Lucene 里
- [[postgresql]] —— 主存储常用关系库；和 Elasticsearch 是互补不是替代
- [[redis]] —— 同样常和 Postgres 搭配，但 Redis 解决的是"快读取"而不是"全文搜索"
- [[kafka]] —— ELK 之外，日志管道里 Kafka 常作为 Logstash 的上游缓冲

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[druid]] —— Apache Druid — 流批一体的实时分析数据库
- [[grafana]] —— Grafana — 监控可视化看板
- [[jaeger]] —— Jaeger — 分布式追踪系统
- [[loki]] —— Loki — 给日志做 Prometheus，只索引标签不索引内容
- [[manticoresearch]] —— Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[minisearch]] —— minisearch — 浏览器里的小型全文搜索引擎
- [[mongodb]] —— MongoDB — 文档型 NoSQL 数据库
- [[neo4j]] —— Neo4j — 主流图数据库
- [[opensearch]] —— OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉
- [[pino]] —— pino — 日志不该阻塞热路径
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[prometheus]] —— Prometheus — 时序监控系统
- [[ravendb]] —— RavenDB — .NET 生态首选的 ACID 文档数据库
- [[redis]] —— Redis — 内存键值数据库
- [[sonic]] —— Sonic — 极简前缀搜索引擎
- [[tantivy]] —— Tantivy — Rust 版 Lucene
- [[typesense]] —— Typesense — 高性能搜索引擎
- [[vector]] —— Vector — Rust 写的统一可观测性数据管道
- [[vespa]] —— Vespa — Yahoo 检索 + 排序引擎
- [[zincsearch]] —— ZincSearch — 单二进制 Go 写的 ES 替代

