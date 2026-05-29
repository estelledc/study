---
title: 论文候选 — 分布式系统深化
description: 60 篇候选，由 research subagent 整理，待主 CC 排期写入正式 papers/
日期: 2026-05-29
---

# 分布式系统深化主题候选

候选 60 篇，按 14 个子主题分组。覆盖 1978-2022，避开当前 study 站已有的 paxos / raft / spanner / chubby / lamport-1978，以及数据库候选池中的 zab / smr / cockroach / calvin / tidb / foundationdb / bigtable / cassandra / kafka / millwheel / dataflow-model / flink / dstreams / brewer-cap / megastore（已挪入本表的 megastore 与数据库版定位不同）/ ceph / hdfs / haystack / azure-storage / tachyon，OS 候选池中的 mesos / kubernetes / omega / twine / borg。

## 共识进化（8 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `vr-1988` | Viewstamped Replication: A General Primary Copy | 1988 | Paxos 之外另一脉共识；与 Paxos 同期，工程上更直白；理解 primary-backup 与共识的等价性 | https://www.pmg.csail.mit.edu/papers/vr.pdf |
| `vr-revisited-2012` | Viewstamped Replication Revisited | 2012 | Liskov 24 年后的简化版；Raft 论文承认大量借鉴此文，对照看共识协议的"最小可读形式" | https://pmg.csail.mit.edu/papers/vr-revisited.pdf |
| `fast-paxos-2006` | Fast Paxos | 2006 | Lamport 给 Paxos 加上"乐观快路径"；理解 quorum 大小与延迟取舍的边界 | https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2005-112.pdf |
| `mencius-2008` | Mencius: Building Efficient Replicated State Machines for WANs | 2008 | 把 Paxos 的"领导者瓶颈"转成轮转主；跨数据中心场景下的吞吐救星 | https://www.usenix.org/legacy/events/osdi08/tech/full_papers/mao/mao.pdf |
| `epaxos-2013` | There Is More Consensus in Egalitarian Parliaments | 2013 | EPaxos 去 leader 化设计；非冲突指令并行 commit；CockroachDB/Accord 都在抄 | https://www.cs.cmu.edu/~dga/papers/epaxos-sosp2013.pdf |
| `flexible-paxos-2016` | Flexible Paxos: Quorum Intersection Revisited | 2016 | 重新审视"多数派"是否必要；read/write quorum 解耦的理论根基 | https://arxiv.org/abs/1608.06696 |
| `chain-replication-2004` | Chain Replication for Supporting High Throughput and Availability | 2004 | 链式复制范式；Azure Storage / FAWN / HyperDex 都用它；线性化语义最易工程化的方式 | https://www.cs.cornell.edu/home/rvr/papers/OSDI04.pdf |
| `craq-2009` | Object Storage on CRAQ: High-Throughput Chain Replication for Read-Mostly Workloads | 2009 | 给 chain replication 加"读任意节点"；理解强一致下读优化的工程边界 | https://www.usenix.org/legacy/event/usenix09/tech/full_papers/terrace/terrace.pdf |

## 原子提交与 Saga（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `gray-1978-notes` | Notes on Data Base Operating Systems | 1978 | 2PC 的原始出处；Jim Gray 用 130 页奠定事务管理语言体系，今天的 ACID/隔离级别都引自这里 | https://jimgray.azurewebsites.net/papers/dbos.pdf |
| `skeen-3pc-1981` | Nonblocking Commit Protocols | 1981 | 3PC 起源；解释为何 2PC 阻塞、3PC 在异步网络下仍不安全 | https://dl.acm.org/doi/10.1145/582318.582339 |
| `presumed-abort-1986` | Transaction Management in the R* Distributed Database System | 1986 | Mohan/Lindsay 的 presumed abort/commit 优化；今日所有 2PC 实现仍在用 | https://dl.acm.org/doi/10.1145/7239.7265 |
| `saga-1987` | Sagas | 1987 | 长事务 = 一串补偿事务；微服务时代 saga 模式的祖宗，理解最终一致补偿语义 | https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf |

## CRDT 与协同编辑（6 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `crdt-shapiro-2011` | A Comprehensive Study of Convergent and Commutative Replicated Data Types | 2011 | Shapiro 等人的 INRIA 长报告；CRDT 概念的奠基与分类（CvRDT/CmRDT），论文 + 代码全在这一篇 | https://hal.inria.fr/inria-00555588/document |
| `crdt-sss-2011` | Conflict-free Replicated Data Types | 2011 | 同作者的 SSS 短版；理解最小可用的 CRDT 形式化定义 | https://pages.lip6.fr/Marc.Shapiro/papers/RR-7687.pdf |
| `ot-1989` | Concurrency Control in Groupware Systems | 1989 | Ellis & Gibbs 的 Operational Transform 原始论文；Google Docs/Etherpad 共有的协同编辑算法源头 | https://dl.acm.org/doi/10.1145/67544.66963 |
| `jupiter-1995` | High-Latency, Low-Bandwidth Windowing in the Jupiter Collaboration System | 1995 | Xerox Jupiter 系统；用 OT 解决高延迟环境下的并发输入；Google Wave 直接受其启发 | https://dl.acm.org/doi/10.1145/215585.215706 |
| `logoot-2010` | Logoot: A Scalable Optimistic Replication Algorithm for Collaborative Editing | 2010 | 基于唯一 ID 的 sequence CRDT；Yjs 的 YArray 与 Automerge text 类型的近亲 | https://hal.inria.fr/inria-00432368/document |
| `crdt-json-2017` | A Conflict-Free Replicated JSON Datatype | 2017 | Kleppmann 的 JSON CRDT；Automerge 的核心；解释嵌套结构如何无冲突合并 | https://arxiv.org/abs/1608.03960 |

## 分布式快照与时间（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `chandy-lamport-1985` | Distributed Snapshots: Determining Global States of Distributed Systems | 1985 | 分布式全局快照算法的奠基；Flink checkpoint / Spark stage 完成检测都源自此文 | https://lamport.azurewebsites.net/pubs/chandy.pdf |
| `fidge-1988` | Timestamps in Message-Passing Systems That Preserve the Partial Ordering | 1988 | Vector Clock 的提出；Lamport 1978 之后定义因果关系最重要的一步 | http://zoo.cs.yale.edu/classes/cs426/2012/lab/bib/fidge88timestamps.pdf |
| `mattern-1989` | Virtual Time and Global States of Distributed Systems | 1989 | 与 Fidge 同期独立提出 Vector Clock；解释"全局状态 = 多个本地时钟的笛卡尔积" | http://courses.csail.mit.edu/6.852/08/papers/Mattern.pdf |
| `hlc-2014` | Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases | 2014 | HLC 算法；CockroachDB/YugabyteDB 用它替代 Spanner TrueTime；不靠原子钟也能做一致快照 | https://cse.buffalo.edu/tech-reports/2014-04.pdf |
| `ntp-mills-1991` | Internet Time Synchronization: The Network Time Protocol | 1991 | NTP 的协议设计；理解 millisecond 级时钟同步的边界与误差模型，是所有"软件时钟"的天花板 | https://www.eecis.udel.edu/~mills/database/papers/trans.pdf |

## 分布式事务（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `percolator-2010` | Large-scale Incremental Processing Using Distributed Transactions and Notifications | 2010 | Google 给 Bigtable 加分布式事务的方式；TiKV/HBase Phoenix 的 SI 实现就是 Percolator 模型 | https://research.google.com/pubs/archive/36726.pdf |
| `sinfonia-2007` | Sinfonia: A New Paradigm for Building Scalable Distributed Systems | 2007 | minitransaction 概念；把分布式事务拆成"有限步骤的原子操作"，比通用 2PC 性能好一个量级 | https://www.cs.cmu.edu/~dga/15-849/S08/papers/aguilera_sinfonia_ATC07.pdf |
| `janus-2016` | Consolidating Concurrency Control and Consensus for Commits under Conflicts | 2016 | 把并发控制与共识合二为一；解释为何"先共识再 2PC"是浪费 round-trip | https://www.usenix.org/system/files/conference/osdi16/osdi16-mu.pdf |
| `megastore-2011` | Megastore: Providing Scalable, Highly Available Storage for Interactive Services | 2011 | Spanner 之前 Google 的全球事务方案；Paxos per entity group + 跨组弱事务，工程取舍范例 | https://research.google.com/pubs/archive/36971.pdf |

## 一致性模型（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `linearizability-1990` | Linearizability: A Correctness Condition for Concurrent Objects | 1990 | Herlihy & Wing 的线性一致定义；今天讨论"强一致"的所有论文都引这一篇 | https://cs.brown.edu/~mph/HerlihyW90/p463-herlihy.pdf |
| `sequential-consistency-1979` | How to Make a Multiprocessor Computer That Correctly Executes Multiprocess Programs | 1979 | Lamport 的顺序一致性原始定义；CPU 缓存一致性 / 分布式 KV 都基于这套语言 | https://lamport.azurewebsites.net/pubs/multi.pdf |
| `vogels-eventual-2009` | Eventually Consistent | 2009 | Werner Vogels 给 Amazon Dynamo 时代的一致性谱系做总结；BASE/最终一致性术语的官方定义 | https://www.allthingsdistributed.com/files/cacm-eventually-consistent.pdf |
| `cops-2011` | Don't Settle for Eventual: Scalable Causal Consistency for Wide-Area Storage with COPS | 2011 | 因果一致性的工程实现；解释"为何最终一致不够、强一致太贵"的中间方案 | https://www.cs.cmu.edu/~dga/papers/cops-sosp2011.pdf |
| `bayou-1995` | Managing Update Conflicts in Bayou, a Weakly Connected Replicated Storage System | 1995 | 离线优先 + 后写入冲突解决的开山之作；现代离线 app（Notion/Linear）的精神祖先 | https://courses.cs.washington.edu/courses/cse550/14au/papers/CSE550.bayou.pdf |

## 影响力理论与 CAP（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `flp-1985` | Impossibility of Distributed Consensus with One Faulty Process | 1985 | FLP 不可能性结果；告诉你"完全异步 + 容错 = 不可能确定终止"，所有共识协议都在和这条线博弈 | https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf |
| `gilbert-lynch-2002` | Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services | 2002 | CAP 的形式化证明；把 Brewer 的演讲变成数学，讨论"P 必选"的真正含义 | https://users.ece.cmu.edu/~adrian/731-sp04/readings/GL-cap.pdf |
| `helland-2007` | Life Beyond Distributed Transactions: An Apostate's Opinion | 2007 | Pat Helland 宣告"分布式事务在大规模系统下不可行"；微服务/事件驱动架构的思想根基 | https://www.ics.uci.edu/~cs223/papers/cidr07p15.pdf |
| `cap-12-years-later-2012` | CAP Twelve Years Later: How the "Rules" Have Changed | 2012 | Brewer 自己回顾 CAP；澄清"二选一是误读"，引入 PACELC 思想 | https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/ |

## 拜占庭容错（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `byzantine-generals-1982` | The Byzantine Generals Problem | 1982 | 拜占庭容错问题的原始定义；3f+1 节点边界证明的源头 | https://lamport.azurewebsites.net/pubs/byz.pdf |
| `pbft-1999` | Practical Byzantine Fault Tolerance | 1999 | Castro & Liskov 把 BFT 从理论搬到工程；区块链共识协议的鼻祖 | http://pmg.csail.mit.edu/papers/osdi99.pdf |
| `tendermint-2016` | Tendermint: Byzantine Fault Tolerance in the Age of Blockchains | 2016 | Buchman 博士论文；现代 PoS 链共识的工业模板（Cosmos/Binance Chain 都用） | https://atrium.lib.uoguelph.ca/items/5459099e-67aa-4a23-83ae-d3471d8fa738 |
| `hotstuff-2019` | HotStuff: BFT Consensus with Linearity and Responsiveness | 2019 | Facebook Libra/Aptos/Sui 的共识基础；3-chain rule 让 BFT 复杂度从 O(n²) 降到 O(n) | https://arxiv.org/abs/1803.05069 |
| `narwhal-tusk-2022` | Narwhal and Tusk: A DAG-based Mempool and Efficient BFT Consensus | 2022 | DAG-BFT 范式；Aptos/Sui 现役共识；理解为何"分离 mempool 与共识"能突破吞吐天花板 | https://arxiv.org/abs/2105.11827 |

## 大规模存储案例（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `f4-2014` | f4: Facebook's Warm BLOB Storage System | 2014 | Haystack 之后的"冷温热分层"；Reed-Solomon 编码替代 3 副本，存储成本砍 60% | https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-muralidhar.pdf |
| `tao-2013` | TAO: Facebook's Distributed Data Store for the Social Graph | 2013 | 社交图谱专用存储；解释"为何关系型 DB 撑不住 10 亿用户的好友列表"，read-after-write 的实战工程 | https://www.usenix.org/system/files/conference/atc13/atc13-bronson.pdf |
| `pnuts-2008` | PNUTS: Yahoo!'s Hosted Data Serving Platform | 2008 | 第一个工业级"per-record timeline consistency"；介于强一致与最终一致之间的实用一致性模型 | http://www.vldb.org/pvldb/vol1/1454167.pdf |

## 流处理与状态快照（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `naiad-2013` | Naiad: A Timely Dataflow System | 2013 | Microsoft 的 timely dataflow 模型；增量计算 + iterative computation 一体化，Materialize / Differential Dataflow 的前身 | https://www.microsoft.com/en-us/research/wp-content/uploads/2013/11/naiad_sosp2013.pdf |
| `flink-snapshots-2015` | Lightweight Asynchronous Snapshots for Distributed Dataflows | 2015 | Flink 的 Chandy-Lamport 变种实现；exactly-once 流处理的基石算法 | https://arxiv.org/abs/1506.08603 |
| `drizzle-2017` | Drizzle: Fast and Adaptable Stream Processing at Scale | 2017 | 桥接 micro-batch 与 record-at-a-time 的中间路线；group scheduling 让 Spark Streaming 延迟降一个量级 | https://shivaram.org/publications/drizzle-sosp17.pdf |

## 缓存、CDN 与一致性哈希（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `consistent-hashing-1997` | Consistent Hashing and Random Trees | 1997 | Karger 等人的原始论文；Akamai 的诞生算法，DynamoDB/Cassandra/Memcached ring 都源于这里 | https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf |
| `akamai-2002` | Globally Distributed Content Delivery | 2002 | Akamai 早期论文；CDN 的请求路由 / 一致性哈希 / 边缘缓存设计原型 | https://www.akamai.com/site/en/documents/research-paper/globally-distributed-content-delivery-technical-publication.pdf |
| `memcached-fb-2013` | Scaling Memcache at Facebook | 2013 | 万台规模 memcached 集群的实战；解释 lease / cold cluster warmup / regional pools 等绕开 thundering herd 的工程招式 | https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf |

## 集群调度（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `borg-omega-kube-2016` | Borg, Omega, and Kubernetes | 2016 | Google 调度器三代演化的对比短文；理解 Kubernetes 设计为何这样从前两代经验中来 | https://research.google/pubs/pub44843/ |
| `sparrow-2013` | Sparrow: Distributed, Low Latency Scheduling | 2013 | 去中心化调度；power-of-two-choices 让毫秒级任务调度成为可能 | https://people.eecs.berkeley.edu/~istoica/papers/2013/sosp13-final17.pdf |
| `apollo-2014` | Apollo: Scalable and Coordinated Scheduling for Cloud-Scale Computing | 2014 | Microsoft Bing 实战；混合中心化估算 + 分布式决策的两层调度范式 | https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-boutin.pdf |
| `quincy-2009` | Quincy: Fair Scheduling for Distributed Computing Clusters | 2009 | 把调度公平性建模成最小费用流；YARN Capacity Scheduler 的理论祖先 | https://www.sigops.org/s/conferences/sosp/2009/papers/isard-sosp09.pdf |

## 监控与分布式追踪（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `dapper-2010` | Dapper, a Large-Scale Distributed Systems Tracing Infrastructure | 2010 | Google 的链路追踪开山之作；Jaeger/Zipkin/OpenTelemetry 的术语体系（trace/span/sampling）都源于这一篇 | https://research.google/pubs/pub36356/ |
| `xtrace-2007` | X-Trace: A Pervasive Network Tracing Framework | 2007 | 比 Dapper 早 3 年；定义了"跨层 / 跨协议 / 跨服务"追踪的元数据模型 | https://www.usenix.org/legacy/event/nsdi07/tech/full_papers/fonseca/fonseca.pdf |
| `pivot-tracing-2015` | Pivot Tracing: Dynamic Causal Monitoring for Distributed Systems | 2015 | 动态注入埋点 + 因果关联；让 production 排查无需提前规划 metric | https://www.cs.cornell.edu/~jmace/papers/mace15pivot.pdf |

## 分布式机器学习训练（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `ps-li-2014` | Scaling Distributed Machine Learning with the Parameter Server | 2014 | Mu Li 的 Parameter Server 架构；MXNet/PyTorch DDP 之前的工业标准范式 | https://www.cs.cmu.edu/~muli/file/parameter_server_osdi14.pdf |
| `tensorflow-osdi-2016` | TensorFlow: A System for Large-Scale Machine Learning | 2016 | Google 公开 TF 设计文档；dataflow graph + parameter server 的混合范式，理解现代 ML 系统起点 | https://www.usenix.org/system/files/conference/osdi16/osdi16-abadi.pdf |
| `zero-2020` | ZeRO: Memory Optimizations Toward Training Trillion Parameter Models | 2020 | DeepSpeed 的核心技术；把 optimizer state / gradient / parameter 在 GPU 间分片，让万亿参数训练成为可能 | https://arxiv.org/abs/1910.02054 |

---

## 备注

- 全部 60 篇均有公开 PDF 或 DOI 编号
- 时间跨度 1978-2022，涵盖 14 个子主题
- 已避开 study 站现有的 paxos / raft / spanner / chubby / lamport-1978 / gfs / mapreduce / dynamo
- 已避开 papers-databases.md 的 60 篇（含 zab / smr / cockroach / calvin / tidb / foundationdb / bigtable / cassandra / kafka / millwheel / dataflow-model / flink / dstreams / brewer-cap / haystack / hdfs / azure-storage / tachyon 等）
- 已避开 papers-operating-systems.md 的 60 篇（含 mesos / kubernetes / omega / twine 等调度类）
- Helland 2007 与 Brewer 2012 属于"立场宣言型"短文，不是严格论文，但工业讨论度极高，保留
- `vr-1988` 与 `vr-revisited-2012` 同一协议但代际间隔 24 年，独立精读价值
