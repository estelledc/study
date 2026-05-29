---
title: 论文候选 — 数据库 / 存储系统
description: 60 篇候选，由 research subagent 整理，待主 CC 排期写入正式 papers/
日期: 2026-05-29
---

# 数据库 / 存储系统主题候选

候选 60 篇，按 12 个子主题分组。覆盖 1970-2022，避开当前 study 站已有的 raft / gfs / mapreduce / lamport-1978 / dynamo。

## 关系型奠基（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `codd-1970` | A Relational Model of Data for Large Shared Data Banks | 1970 | 现代所有关系型数据库的祖宗，把数据从层次/网状解放出来；理解为何"表+SQL"统治世界 50 年的唯一入口 | https://www.seas.upenn.edu/~zives/03f/cis550/codd.pdf |
| `system-r-1976` | System R: Relational Approach to Database Management | 1976 | IBM 第一个关系型 DBMS 实现，奠定 SQL/查询优化器/事务/恢复模板，今天 PostgreSQL/MySQL 仍能看到它的骨架 | https://dl.acm.org/doi/10.1145/320455.320457 |
| `ingres-1976` | The Design and Implementation of INGRES | 1976 | Berkeley 平行实现，开源派源头；Postgres/Sybase/SQL Server 都流自 INGRES 血脉，看懂学术派与工业派分叉 | https://dl.acm.org/doi/10.1145/320473.320476 |
| `sequel-1974` | SEQUEL: A Structured English Query Language | 1974 | SQL 的最初提案；理解"为什么查询语言长这样"必须回到这篇 | https://dl.acm.org/doi/10.1145/800296.811515 |
| `codd-1979-extending` | Extending the Database Relational Model to Capture More Meaning | 1979 | Codd 自己对模型的反思与外延，回答"关系模型为何不够、要怎么补" | https://dl.acm.org/doi/10.1145/320107.320109 |

## 事务理论（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `eswaran-1976` | The Notions of Consistency and Predicate Locks in a Database System | 1976 | 串行化定义的源头，所有事务隔离级别讨论都从这里出发 | https://dl.acm.org/doi/10.1145/360363.360369 |
| `gray-1981-transaction` | The Transaction Concept: Virtues and Limitations | 1981 | Jim Gray 把"事务"提升为通用抽象；ACID 概念的奠基性论述 | https://jimgray.azurewebsites.net/papers/thetransactionconcept.pdf |
| `berenson-1995-isolation` | A Critique of ANSI SQL Isolation Levels | 1995 | 揭示 ANSI 隔离级别定义的漏洞，引入 Snapshot Isolation；今天讨论 PG/Oracle/MySQL 隔离级别绕不开 | https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-95-51.pdf |
| `bernstein-1981-cc` | Concurrency Control in Distributed Database Systems | 1981 | 分布式并发控制的教科书级综述，2PL/TimeStamp/MVCC 全在内 | https://dl.acm.org/doi/10.1145/356842.356846 |
| `aries-1992` | ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging | 1992 | WAL + Repeating History 范式；几乎所有现代 RDBMS 的恢复算法都从 ARIES 派生 | https://www.csd.uoc.gr/~hy460/pdf/p94-mohan.pdf |

## 索引（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `b-tree-1972` | Organization and Maintenance of Large Ordered Indexes | 1972 | B-Tree 原始论文；50 年后仍是磁盘索引默认选择，懂这篇等于懂半部 DBMS | https://doi.org/10.1007/BF00288683 |
| `comer-1979-btree` | The Ubiquitous B-Tree | 1979 | B-Tree 家族变体的权威综述（B+/B*）；课本级清晰度 | https://carlosproal.com/ir/papers/p121-comer.pdf |
| `lsm-tree-1996` | The Log-Structured Merge-Tree (LSM-Tree) | 1996 | RocksDB/LevelDB/Cassandra/HBase/TiKV 全用它；写密集场景必读 | https://www.cs.umb.edu/~poneil/lsmtree.pdf |
| `skip-list-1990` | Skip Lists: A Probabilistic Alternative to Balanced Trees | 1990 | Redis 有序集合 / LevelDB MemTable 都用它；用概率换平衡树代码复杂度的经典权衡 | https://homepage.cs.uiowa.edu/~ghosh/skip.pdf |
| `art-2013` | The Adaptive Radix Tree: ARTful Indexing for Main-Memory Databases | 2013 | 内存数据库时代的索引代表；DuckDB/HyPer 都在用，解释为何 cache-aware 设计能击败 B-Tree | https://db.in.tum.de/~leis/papers/ART.pdf |

## 查询优化（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `selinger-1979` | Access Path Selection in a Relational Database Management System | 1979 | Cost-Based Optimizer 的开山之作；动态规划选 join order 的范式直接活到今天 | https://courses.cs.duke.edu/compsci516/cps216/spring03/papers/selinger-etal-1979.pdf |
| `volcano-1994` | Volcano—An Extensible and Parallel Query Evaluation System | 1994 | Iterator/pull-based 执行模型；几乎所有现代查询引擎的骨架 | https://dl.acm.org/doi/10.1109/69.273032 |
| `cascades-1995` | The Cascades Framework for Query Optimization | 1995 | SQL Server / Greenplum / Apache Calcite 优化器框架的祖先；规则驱动转换的范式 | https://www.cse.iitb.ac.in/infolab/Data/Courses/CS632/Papers/Cascades-graefe.pdf |
| `neumann-2015-large-joins` | Adaptive Optimization of Very Large Join Queries | 2015 | 当 join 数 >10 时 Selinger DP 爆炸怎么办；现代 OLAP 必读 | https://db.in.tum.de/~radke/papers/hugejoins.pdf |
| `leis-2015-optimizers` | How Good Are Query Optimizers, Really? | 2015 | 实证打脸所有现代优化器；让你重新审视"统计估算 + cost model"的可靠性 | http://www.vldb.org/pvldb/vol9/p204-leis.pdf |

## 复制与共识（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `paxos-1998` | The Part-Time Parliament | 1998 | Paxos 原始论文；理解共识协议必经之路（虽然故事化叙述劝退过几代研究生） | https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf |
| `paxos-simple-2001` | Paxos Made Simple | 2001 | Lamport 自己重写的版本；2026 年想懂 Paxos 仍应从这篇入手 | https://lamport.azurewebsites.net/pubs/paxos-simple.pdf |
| `zab-2011` | Zab: High-performance Broadcast for Primary-backup Systems | 2011 | ZooKeeper 的共识协议；与 Paxos/Raft 对比能看清主备复制的设计取舍 | https://marcoserafini.github.io/papers/zab.pdf |
| `spanner-2012` | Spanner: Google's Globally-Distributed Database | 2012 | TrueTime + 全球串行化事务；NewSQL 时代的开端，CockroachDB/YugabyteDB 都在抄它 | https://research.google.com/archive/spanner-osdi2012.pdf |
| `smr-1990` | Implementing Fault-Tolerant Services Using the State Machine Approach | 1990 | 状态机复制的理论框架；所有共识系统的抽象基础 | https://www.cs.cornell.edu/fbs/publications/SMSurvey.pdf |

## NoSQL（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `bigtable-2006` | Bigtable: A Distributed Storage System for Structured Data | 2006 | HBase/Cassandra/HBase 的爹；"宽列+SSTable+Tablet"模式由此定型 | https://research.google.com/archive/bigtable-osdi06.pdf |
| `cassandra-2010` | Cassandra: A Decentralized Structured Storage System | 2010 | Dynamo + Bigtable 的混血；看 P2P 一致性哈希怎么和宽列数据模型结合 | https://www.cs.cornell.edu/projects/ladis2009/papers/lakshman-ladis2009.pdf |
| `dewitt-gray-1992` | Parallel Database Systems: The Future of High Performance Database Systems | 1992 | 并行数据库（shared-nothing）的奠基性综述；今天所有 MPP/分布式数据库的源头 | https://dl.acm.org/doi/10.1145/129888.129894 |
| `stonebraker-2010-sqlnosql` | SQL Databases v. NoSQL Databases | 2010 | Stonebraker 反 NoSQL 的檄文；十几年后回看，谁对谁错读者自判 | https://cacm.acm.org/magazines/2010/4/81481-sql-databases-v-nosql-databases/fulltext |
| `brewer-cap-2000` | Towards Robust Distributed Systems (CAP Theorem) | 2000 | CAP 三选二的原始演讲稿；理解一致性 vs 可用性权衡的起点 | https://sites.cs.ucsb.edu/~rich/class/cs293-cloud/papers/Brewer_podc_keynote_2000.pdf |

## NewSQL（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `f1-2013` | F1: A Distributed SQL Database That Scales | 2013 | Google AdWords 用 Spanner 做 SQL 层的实战；回答"全球一致 SQL 能不能扛 OLTP" | https://research.google/pubs/pub41344/ |
| `cockroachdb-2020` | CockroachDB: The Resilient Geo-Distributed SQL Database | 2020 | 开源版 Spanner；不依赖 TrueTime 怎么做全球串行化事务 | https://dl.acm.org/doi/10.1145/3318464.3386134 |
| `calvin-2012` | Calvin: Fast Distributed Transactions for Partitioned Database Systems | 2012 | 反 OCC/2PL 派的代表：先排序再执行；FaunaDB 实战，理论清晰 | http://cs.yale.edu/homes/thomson/publications/calvin-sigmod12.pdf |
| `tidb-2020` | TiDB: A Raft-based HTAP Database | 2020 | 国产 NewSQL 代表；OLTP+OLAP 混合负载的工程取舍 | http://www.vldb.org/pvldb/vol13/p3072-huang.pdf |
| `foundationdb-2021` | FoundationDB: A Distributed Unbundled Transactional Key Value Store | 2021 | Apple 收购的极简 KV 事务引擎；"先 KV 再 SQL 层"的分层范式 | https://www.foundationdb.org/files/fdb-paper.pdf |

## OLAP / 列存（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `cstore-2005` | C-Store: A Column-oriented DBMS | 2005 | 列存数据库的开山；Vertica/Snowflake/ClickHouse 的源头 | http://db.csail.mit.edu/projects/cstore/vldb.pdf |
| `monetdb-x100-2005` | MonetDB/X100: Hyper-Pipelining Query Execution | 2005 | 向量化执行的奠基；DuckDB/ClickHouse/Velox 都在抄这套 | https://www.cidrdb.org/cidr2005/papers/P19.pdf |
| `vertica-2012` | The Vertica Analytic Database: C-Store 7 Years Later | 2012 | C-Store 工业化经验复盘；理论到产品的差距很有教育意义 | http://vldb.org/pvldb/vol5/p1790_andrewlamb_vldb2012.pdf |
| `snowflake-2016` | The Snowflake Elastic Data Warehouse | 2016 | 存算分离 + 多租户；云数据仓库的事实标准范式 | https://event.cwi.nl/lsde/papers/p215-dageville-snowflake.pdf |
| `duckdb-2019` | DuckDB: an Embeddable Analytical Database | 2019 | "OLAP 版 SQLite"；进程内分析数据库的新范式，data engineering 圈火爆 | https://duckdb.org/pdf/SIGMOD2019-demo-duckdb.pdf |

## 流处理（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `flink-2015` | Apache Flink: Stream and Batch Processing in a Single Engine | 2015 | 流批一体的工业标杆；exactly-once + event time 工程实现 | http://sites.computer.org/debull/A15dec/p28.pdf |
| `dataflow-model-2015` | The Dataflow Model: A Practical Approach to Balancing Correctness, Latency, and Cost | 2015 | Google 流处理理论框架；watermark/window/trigger 概念的源头 | https://research.google.com/pubs/archive/43864.pdf |
| `millwheel-2013` | MillWheel: Fault-Tolerant Stream Processing at Internet Scale | 2013 | Google 内部流引擎；Dataflow Model 的工程基础 | http://www.vldb.org/pvldb/vol6/p1033-akidau.pdf |
| `dstreams-2013` | Discretized Streams: Fault-Tolerant Streaming Computation at Scale | 2013 | Spark Streaming 的核心理论（micro-batch）；与 Flink 对比能看清两条流派 | https://people.csail.mit.edu/matei/papers/2013/sosp_spark_streaming.pdf |
| `trill-2014` | Trill: A High-Performance Incremental Query Processor | 2014 | Microsoft 高性能流引擎；punctuated stream + columnar 的独特组合 | https://www.microsoft.com/en-us/research/wp-content/uploads/2014/06/trill-vldb2015.pdf |

## 向量数据库（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `hnsw-2018` | Efficient and Robust Approximate Nearest Neighbor Search using Hierarchical Navigable Small World Graphs | 2018 | HNSW 索引的标准论文；Pinecone/Milvus/Weaviate/Qdrant 默认实现 | https://arxiv.org/abs/1603.09320 |
| `product-quantization-2011` | Product Quantization for Nearest Neighbor Search | 2011 | 把向量压缩成 codebook 的奠基；FAISS IVF-PQ 索引核心 | https://hal.inria.fr/inria-00514462v2/document |
| `diskann-2019` | DiskANN: Fast Accurate Billion-point Nearest Neighbor Search on a Single Node | 2019 | 单机十亿向量的 SSD 索引；Microsoft Bing 实战 | https://suhasjs.github.io/files/diskann_neurips19.pdf |
| `faiss-2017` | Billion-scale Similarity Search with GPUs | 2017 | Facebook FAISS 库的论文版；GPU 加速 ANN 的工程范式 | https://arxiv.org/abs/1702.08734 |
| `milvus-2021` | Milvus: A Purpose-Built Vector Data Management System | 2021 | 国产向量数据库代表；存算分离 + 多索引混合的系统设计 | https://www.cs.purdue.edu/homes/csjgwang/pubs/SIGMOD21_Milvus.pdf |

## 嵌入式 / 单机存储（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `sqlite-2022` | SQLite: Past, Present, and Future | 2022 | 全球最广部署的数据库（>10 亿设备）的演化史；嵌入式数据库设计教科书 | https://www.vldb.org/pvldb/vol15/p3535-gaffney.pdf |
| `rocksdb-2017` | Optimizing Space Amplification in RocksDB | 2017 | LSM-Tree 工业实现的调参指南；Facebook 实战经验 | http://cidrdb.org/cidr2017/papers/p82-dong-cidr17.pdf |
| `lmdb-2011` | MDB: A Memory-Mapped Database and Backend for OpenLDAP | 2011 | mmap + Copy-on-Write B+ Tree；OpenLDAP/etcd v2 用过，理解 mmap 流派 | http://www.lmdb.tech/media/20120829-LinuxCon-MDB-txt.pdf |
| `kafka-2011` | Kafka: A Distributed Messaging System for Log Processing | 2011 | "把 log 当成一等公民"的范式；现代消息队列 + 事件流处理的源头 | http://notes.stephenholiday.com/Kafka.pdf |
| `silt-2011` | SILT: A Memory-Efficient, High-Performance Key-Value Store | 2011 | 内存 0.7 字节/条记录的极致优化；理解三层 KV 流水线设计 | https://www.cs.cmu.edu/~dga/papers/silt-sosp2011.pdf |

## 分布式存储 / 文件系统（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `ceph-2006` | Ceph: A Scalable, High-Performance Distributed File System | 2006 | CRUSH 算法去除中心元数据节点；OpenStack/K8s 存储后端代表 | https://www.ssrc.ucsc.edu/Papers/weil-osdi06.pdf |
| `azure-storage-2011` | Windows Azure Storage: A Highly Available Cloud Storage Service with Strong Consistency | 2011 | 云对象存储的工业实现；Stream Layer + Partition Layer 分层设计 | https://sigops.org/s/conferences/sosp/2011/current/2011-Cascais/printable/11-calder.pdf |
| `haystack-2010` | Finding a Needle in Haystack: Facebook's Photo Storage | 2010 | 小文件存储优化经典；理解为何"通用文件系统不够用" | https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Beaver.pdf |
| `hdfs-2010` | The Hadoop Distributed File System | 2010 | HDFS 论文版；Hadoop 生态的存储基础 | https://storageconference.us/2010/Papers/MSST/Shvachko.pdf |
| `tachyon-2014` | Tachyon: Reliable, Memory Speed Storage for Cluster Computing Frameworks | 2014 | 后改名 Alluxio；分布式内存文件系统范式 | https://people.eecs.berkeley.edu/~alig/papers/tachyon.pdf |

---

## 备注

- 全部 60 篇均有公开 PDF 或 DOI 编号
- 时间跨度 1970-2022，涵盖 12 个子主题
- 已验证未与 study 站现有 143 篇重复（避开 raft / gfs / mapreduce / lamport-1978 / dynamo）
- Lamport 1978 ≠ Lamport 1998：前者是 "Time, Clocks"（已存在），后者是 Paxos（本清单 #21）
