---
title: 项目候选 — 数据库 / 存储引擎
日期: 2026-05-29
---

# 数据库 / 存储引擎项目候选

候选 80 个，按子类分组（关系 10 / 文档 8 / KV 10 / OLAP 8 / 时序 8 / 图 6 / 搜索 8 / 向量 8 / 流队列 8 / 嵌入式 6）。

已过滤现有 ORM / 客户端 SDK：prisma / drizzle / kysely / typeorm / sequelize / mikro-orm / postgres-js / duckdb-wasm / chroma / minisearch / supabase。本表只收"数据库本体 + 存储 / 检索引擎 + 协议级中间件"。

Stars 量级为 2025-2026 区间近似值，仅作影响力参考。

## 关系型（10 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `postgresql` | PostgreSQL — 工业级关系数据库 | ~16k | SQL 标准最齐全的开源关系库，扩展系统是杀手锏 | https://github.com/postgres/postgres |
| `sqlite` | SQLite — 进程内嵌入式 SQL 引擎 | ~7k | 全球部署最广的数据库，单文件 + 零配置定义嵌入式标准 | https://github.com/sqlite/sqlite |
| `mysql-server` | MySQL Server — 主流开源关系库 | ~11k | LAMP 栈基石，InnoDB 引擎是 OLTP 教科书 | https://github.com/mysql/mysql-server |
| `mariadb-server` | MariaDB — MySQL 社区分叉 | ~6k | 由 MySQL 原作者主导，存储引擎可插拔（Aria / ColumnStore） | https://github.com/MariaDB/server |
| `cockroach` | CockroachDB — 全球分布式 SQL | ~30k | Postgres 协议兼容，跨地域强一致（Raft + MVCC） | https://github.com/cockroachdb/cockroach |
| `yugabyte-db` | YugabyteDB — 分布式 Postgres | ~9k | 复用 Postgres 查询层 + 自研分布式存储，云原生 OLTP | https://github.com/yugabyte/yugabyte-db |
| `tidb` | TiDB — HTAP 分布式数据库 | ~37k | MySQL 协议 + TiKV 行存 + TiFlash 列存，国产分布式标杆 | https://github.com/pingcap/tidb |
| `vitess` | Vitess — MySQL 分片中间件 | ~19k | YouTube 起家，CNCF 毕业，云原生 MySQL 分片标准 | https://github.com/vitessio/vitess |
| `edgedb` | EdgeDB / Gel — 对象关系数据库 | ~13k | Postgres 之上的图风查询语言 EdgeQL，类型系统替 ORM | https://github.com/edgedb/edgedb |
| `risingwave` | RisingWave — 流式 SQL 数据库 | ~7k | Postgres 兼容 + 流处理 + 物化视图，替代 Flink + KV 组合 | https://github.com/risingwavelabs/risingwave |

## NoSQL 文档（8 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `mongo` | MongoDB — 文档数据库代表 | ~26k | BSON 文档模型 + 副本集 + 分片，定义了 NoSQL 文档范式 | https://github.com/mongodb/mongo |
| `couchdb` | Apache CouchDB — Erlang 写的文档库 | ~6k | HTTP API + MVCC + 多主复制，离线优先架构灵感来源 | https://github.com/apache/couchdb |
| `arangodb` | ArangoDB — 多模型数据库 | ~13k | 文档 + 图 + KV 三合一，AQL 统一查询语言 | https://github.com/arangodb/arangodb |
| `surrealdb` | SurrealDB — 多模型 + 图 + 文档 | ~26k | Rust 实现，SurrealQL 把 SQL / 图 / 文档塞进一种语法 | https://github.com/surrealdb/surrealdb |
| `pouchdb` | PouchDB — 浏览器端文档库 | ~16k | CouchDB 协议 JS 实现，离线 web 应用同步样板 | https://github.com/pouchdb/pouchdb |
| `rethinkdb` | RethinkDB — 实时推送数据库 | ~26k | changefeed 让客户端订阅查询结果，实时应用先驱 | https://github.com/rethinkdb/rethinkdb |
| `ravendb` | RavenDB — .NET 文档数据库 | ~3.5k | ACID 文档库 + 全文索引，.NET 生态首选 | https://github.com/ravendb/ravendb |
| `ferretdb` | FerretDB — Postgres 上的 MongoDB | ~9k | 用 Postgres / SQLite 后端实现 MongoDB 协议，避开许可证 | https://github.com/FerretDB/FerretDB |

## 键值 / 缓存（10 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `redis` | Redis — 内存数据结构服务器 | ~65k | "数据结构当 API"做到极致，定义在线缓存范式 | https://github.com/redis/redis |
| `valkey` | Valkey — Redis 社区分叉 | ~18k | Redis 改许可证后 Linux 基金会接管的 BSD 分叉 | https://github.com/valkey-io/valkey |
| `dragonfly` | Dragonfly — 多线程 Redis 替代 | ~26k | Redis 协议兼容，多核架构号称单实例吞吐高 25 倍 | https://github.com/dragonflydb/dragonfly |
| `memcached` | Memcached — 经典内存缓存 | ~13k | 极简 KV 缓存协议，slab allocator 是教学范例 | https://github.com/memcached/memcached |
| `rocksdb` | RocksDB — 嵌入式 LSM 引擎 | ~28k | LevelDB 的 Facebook 加强版，TiKV / CockroachDB 等都基于它 | https://github.com/facebook/rocksdb |
| `leveldb` | LevelDB — Google LSM 库 | ~36k | LSM-tree 教科书实现，理解写放大 / compaction 必读 | https://github.com/google/leveldb |
| `lmdb` | LMDB — 内存映射 KV 库 | ~3k | B+ 树 + mmap + 单写多读，OpenLDAP 起家性能极致 | https://github.com/LMDB/lmdb |
| `etcd` | etcd — 分布式 KV 协调服务 | ~47k | Kubernetes 元数据库，Raft 实现的工业标杆 | https://github.com/etcd-io/etcd |
| `tikv` | TiKV — 分布式事务 KV | ~15k | TiDB 底层，CNCF 毕业，Raft + Multi-Region | https://github.com/tikv/tikv |
| `badger` | BadgerDB — Go 嵌入式 KV | ~14k | Dgraph 用的 Go LSM，键值分离设计 | https://github.com/hypermodeinc/badger |

## 列存 / OLAP（8 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `clickhouse` | ClickHouse — 列式 OLAP 王者 | ~37k | 单机亿级 QPS 聚合，向量化执行 + MergeTree 引擎 | https://github.com/ClickHouse/ClickHouse |
| `druid` | Apache Druid — 实时分析数据库 | ~13k | 流批一体的列存，Lambda 架构落地代表 | https://github.com/apache/druid |
| `pinot` | Apache Pinot — 实时 OLAP | ~5k | LinkedIn 起家，毫秒级聚合 + Kafka 实时摄入 | https://github.com/apache/pinot |
| `duckdb` | DuckDB — 进程内 OLAP 库 | ~22k | "SQLite for analytics"，单文件列存 + Parquet 一等公民 | https://github.com/duckdb/duckdb |
| `starrocks` | StarRocks — MPP 列存数据库 | ~9k | Doris 分叉，CBO + 向量化执行，国产 OLAP 主流 | https://github.com/StarRocks/starrocks |
| `doris` | Apache Doris — MPP OLAP | ~13k | 百度起家，CNCF 毕业，MySQL 协议 + 列存 | https://github.com/apache/doris |
| `greenplum-db` | Greenplum — Postgres 改的 MPP | ~6k | Postgres 多节点 MPP 改造，开源数仓老牌选手 | https://github.com/greenplum-db/gpdb |
| `databend` | Databend — Rust 写的云原生数仓 | ~7.7k | 存算分离 + 对象存储 + 列存，Snowflake 开源对标 | https://github.com/databendlabs/databend |

## 时序（8 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `influxdb` | InfluxDB — 时序数据库代表 | ~28k | TSI 索引 + Flux 查询语言，IoT / 监控场景默认选择 | https://github.com/influxdata/influxdb |
| `timescaledb` | TimescaleDB — Postgres 时序扩展 | ~18k | hypertable 自动分片，纯 SQL 时序，复用 Postgres 生态 | https://github.com/timescale/timescaledb |
| `questdb` | QuestDB — 高性能时序库 | ~14k | C++ 内核 + 内存映射列存，金融行情级吞吐 | https://github.com/questdb/questdb |
| `victoriametrics` | VictoriaMetrics — Prom 兼容 TSDB | ~12k | 远程存储 + 长期保存 + 集群版，Prom 生产级补全 | https://github.com/VictoriaMetrics/VictoriaMetrics |
| `prometheus` | Prometheus — 监控指标库 | ~55k | Pull 模型 + PromQL，云原生监控事实标准 | https://github.com/prometheus/prometheus |
| `opentsdb` | OpenTSDB — HBase 上的 TSDB | ~5k | 第一代分布式时序库，理解时序索引设计起点 | https://github.com/OpenTSDB/opentsdb |
| `m3` | M3 — Uber 的分布式 TSDB | ~4.7k | Prometheus 远端 + 自研倒排索引，超大规模监控 | https://github.com/m3db/m3 |
| `tdengine` | TDengine — IoT 时序库 | ~23k | "一个设备一张表"模型 + 列存，国产 IoT 时序代表 | https://github.com/taosdata/TDengine |

## 图（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `neo4j` | Neo4j — 图数据库标杆 | ~13k | Cypher 查询语言起源，原生图存储 + 索引自由化 | https://github.com/neo4j/neo4j |
| `dgraph` | Dgraph — 分布式图数据库 | ~20k | Go 实现，GraphQL+ 查询，分布式图典型架构 | https://github.com/hypermodeinc/dgraph |
| `nebula` | NebulaGraph — 国产分布式图 | ~10k | 存算分离 + nGQL，超大规模图（万亿级）首选 | https://github.com/vesoft-inc/nebula |
| `janusgraph` | JanusGraph — 可插拔图引擎 | ~5k | 后端可挂 Cassandra / HBase / BerkeleyDB，Gremlin 标准 | https://github.com/JanusGraph/janusgraph |
| `kuzu` | Kùzu — 嵌入式图数据库 | ~2k | "DuckDB of graphs"，单文件 + Cypher，OLAP 场景图分析 | https://github.com/kuzudb/kuzu |
| `memgraph` | Memgraph — 内存图数据库 | ~2.5k | Cypher 兼容 + C++ 内存引擎，实时图分析 | https://github.com/memgraph/memgraph |

## 搜索（8 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `elasticsearch` | Elasticsearch — 全文检索王者 | ~70k | Lucene 上的分布式封装，倒排 + 聚合 + 时序统统能扛 | https://github.com/elastic/elasticsearch |
| `opensearch` | OpenSearch — ES 社区分叉 | ~10k | AWS 主导的 Apache 2.0 分叉，ES 改许可证后的新选 | https://github.com/opensearch-project/OpenSearch |
| `meilisearch` | Meilisearch — 类型容错全文检索 | ~50k | Rust 实现，开箱即用 + typo-tolerant，前端搜索首选 | https://github.com/meilisearch/meilisearch |
| `typesense` | Typesense — 类 Algolia 开源版 | ~22k | C++ 实现，毫秒级前缀搜索 + 容错，云服务级体验 | https://github.com/typesense/typesense |
| `sonic` | Sonic — 极简前缀搜索引擎 | ~20k | Rust 写的"搜索后端"，几 MB 内存搞定文档前缀 | https://github.com/valeriansaliou/sonic |
| `tantivy` | Tantivy — Rust 版 Lucene | ~13k | 嵌入式全文索引库，Quickwit 等搜索系统底座 | https://github.com/quickwit-oss/tantivy |
| `zincsearch` | ZincSearch — 轻量 ES 替代 | ~17k | 单二进制 Go 实现，把 ES 的内存占用压到 < 100 MB 量级 | https://github.com/zincsearch/zincsearch |
| `manticoresearch` | Manticore — Sphinx 后裔 | ~9k | C++ 实现，MySQL 协议查搜索，OLAP + 全文混合 | https://github.com/manticoresoftware/manticoresearch |

## 向量（8 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `milvus` | Milvus — 云原生向量数据库 | ~32k | Faiss 之上的分布式封装，LF AI 毕业，AIGC 主流选 | https://github.com/milvus-io/milvus |
| `qdrant` | Qdrant — Rust 向量数据库 | ~24k | HNSW + 过滤 + payload 索引，单实例性能突出 | https://github.com/qdrant/qdrant |
| `weaviate` | Weaviate — 模块化向量库 | ~13k | Go 实现，自带 vectorizer 模块（OpenAI / Cohere / HF） | https://github.com/weaviate/weaviate |
| `lancedb` | LanceDB — 嵌入式向量库 | ~5.6k | 基于 Lance 列存，Python / Rust 进程内 + 对象存储 | https://github.com/lancedb/lancedb |
| `vespa` | Vespa — Yahoo 检索 + 排序引擎 | ~6k | 推荐系统起家，向量 + 倒排 + 排序模型一站式 | https://github.com/vespa-engine/vespa |
| `faiss` | Faiss — Meta 向量索引库 | ~33k | C++ / Python 库，IVF / PQ / HNSW 全家桶，向量检索基石 | https://github.com/facebookresearch/faiss |
| `annoy` | Annoy — Spotify 近似搜索 | ~14k | 随机森林索引，C++ / Python，磁盘友好（mmap） | https://github.com/spotify/annoy |
| `hnswlib` | hnswlib — HNSW 算法库 | ~4.7k | HNSW 论文作者实现，业界 HNSW 引擎都基于它 | https://github.com/nmslib/hnswlib |

## 流 / 队列（8 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `kafka` | Apache Kafka — 分布式日志队列 | ~29k | LinkedIn 起家，定义"日志即数据骨干"范式 | https://github.com/apache/kafka |
| `pulsar` | Apache Pulsar — 流 + 队列双模 | ~14k | 计算存储分离 + 多租户 + 地理复制，Kafka 强对手 | https://github.com/apache/pulsar |
| `nats-server` | NATS — 极简云原生消息 | ~16k | Go 实现，pub/sub + JetStream 持久化，CNCF 毕业 | https://github.com/nats-io/nats-server |
| `rabbitmq-server` | RabbitMQ — AMQP 经典队列 | ~13k | Erlang 实现的 AMQP / MQTT / STOMP 多协议消息总线 | https://github.com/rabbitmq/rabbitmq-server |
| `nsq` | NSQ — Go 写的去中心化队列 | ~25k | bitly 起家，无 ZK 设计 + 在线动态拓扑 | https://github.com/nsqio/nsq |
| `redpanda` | Redpanda — Kafka 兼容 C++ 实现 | ~10k | 无 JVM + 无 ZK，单二进制 Kafka 协议替代 | https://github.com/redpanda-data/redpanda |
| `zookeeper` | Apache ZooKeeper — 分布式协调 | ~12k | ZAB 协议代表实现，Kafka / HBase / Hadoop 元数据老依赖 | https://github.com/apache/zookeeper |
| `emqx` | EMQX — MQTT 物联网消息 | ~14k | Erlang 实现，单集群千万连接，IoT 消息总线代表 | https://github.com/emqx/emqx |

## 嵌入式 / 文件格式（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `lance` | Lance — AI 数据列存格式 | ~4.4k | "Parquet for AI"，向量 + 多模态友好的列存格式 | https://github.com/lancedb/lance |
| `arrow` | Apache Arrow — 内存列式标准 | ~14k | 零拷贝列式内存格式，DuckDB / Polars / Spark 共用语义层 | https://github.com/apache/arrow |
| `arrow-rs` | Arrow / Parquet Rust 实现 | ~3k | DataFusion / InfluxDB 3.0 / Lance 都基于它 | https://github.com/apache/arrow-rs |
| `bbolt` | bbolt — Go 嵌入式 B+ 树 | ~9k | etcd 的底层 KV，BoltDB 接力分叉，单文件 ACID | https://github.com/etcd-io/bbolt |
| `sled` | sled — Rust 嵌入式 KV | ~9k | "现代 BTree + LSM 混合"，Rust 生态嵌入式 KV 标杆 | https://github.com/spacejam/sled |
| `pebble` | Pebble — CockroachDB 自研 LSM | ~5k | RocksDB 的 Go 替代，CRDB 把 RocksDB 重写为 Go 原生版 | https://github.com/cockroachdb/pebble |

## 备选 / 后续可补

下列项目质量同样在线，但本轮配额已满，可作为替补：

- **关系**：firebird / percona-server / materialize / google-leveldb-on-rdbms
- **文档**：orientdb（已停滞）/ marklogic（闭源）
- **KV**：garnet（微软 Redis 兼容）/ kvrocks（Apache 上的 Redis on RocksDB）/ aerospike-server
- **OLAP**：apache-impala / apache-kylin / kdb+（闭源）
- **图**：tigergraph（部分闭源）/ orientdb / cayley
- **搜索**：bleve / vald / lunr-js
- **向量**：marqo / vald / usearch
- **流**：apache-rocketmq / apache-flink / fluvio
- **嵌入式**：libmdbx / sanakirja / persy / rqlite

## 选取与避坑说明

- **重复检查**：与 `src/content/docs/projects/*.md` 的 155 个现存 slug 做过一次性 diff，无重叠。
- **本体优先**：避免再收 ORM / driver / dialect 层（用户已覆盖）。
- **协议级中间件保留**：vitess（MySQL 分片）、ferretdb（MongoDB on Postgres）这类"协议代理"算半个数据库本体，保留。
- **闭源 / 准闭源排除**：MongoDB Atlas、Snowflake、TigerGraph、kdb+ 等不收源码不公开的不入选。
- **冷门控制**：所有候选都能搜到中文 / 英文一手文档 + RFC / paper / blog，可写 130-200 行入门词条。
