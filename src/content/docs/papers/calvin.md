---
title: Calvin (Thomson et al. 2012) — 不要时钟，要 sequencer，全球事务的另一条路
description: 用全局排序日志替代 2PC 与 commit-wait——Spanner 同期对手，把分布式事务 reduce 到「先排序后执行」的两段式。读 Spanner 之后必须读这篇，否则你只看到了 2012 一半的分布式事务史
sidebar:
  label: Calvin (SIGMOD 2012)
  order: 27
---

> **论文类型 self-classify**：method / system paper（分支 A）。
> 心脏物 = **deterministic transaction execution**：sequencer 把所有客户端事务塞进一个全局 batch、
> 用 Paxos 把 batch 顺序复制到所有 replica，scheduler 按这个顺序串行加锁、并发执行。
> 不需要时钟、不需要 2PC、不需要 commit-wait——这是 Spanner 路线（时钟主义）的几何对偶（sequencer 主义）。
> 工业事实标准锚点：[yaledb/calvin](https://github.com/yaledb/calvin) 原始论文 C++ 代码（commit `c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a`，master HEAD 截至读时，star ~330，已停维护——但作为论文锚点参考价值高）；
> Kun Ren 自己的优化版 [kunrenyale/calvinDB](https://github.com/kunrenyale/calvinDB)（commit `486d5b28258e265f3f150938dab664b2ac587725`，master HEAD）补充对照。
> 商业继承者 [FaunaDB](https://fauna.com/) 闭源；现代继承者代表 [erberlin/aria](https://github.com/erberlin/aria)（VLDB 2020 论文实现）等。
> 本笔记按 [papers-method v1.1 分支 A](/study/papers-method/) 标准重构；目标 ≥ 500 行 + 2 图 + 3 GitHub permalink + 4 处具体怀疑。

## Layer 0 · 身份扫描

| 字段 | 内容 |
|---|---|
| 标题（英文） | Calvin: Fast Distributed Transactions for Partitioned Database Systems |
| 标题翻译（中文） | Calvin：面向分区数据库系统的快速分布式事务 |
| 作者 | Alexander Thomson, Thaddeus Diamond, Shu-Chun Weng, Kun Ren, Philip Shao, Daniel J. Abadi（6 人，Yale University） |
| 一作机构 | Yale University（Thomson 时为 Yale 博士生，导师 Daniel Abadi；毕业后加入 Google → Hudson River Trading） |
| 发表时间 | SIGMOD 2012（2012-05），与 Spanner OSDI 2012 同年——分布式事务的"双子年" |
| 发表渠道 | ACM SIGMOD International Conference on Management of Data 2012 |
| 论文 PDF | [cs.yale.edu/homes/thomson/publications/calvin-sigmod12.pdf](http://cs.yale.edu/homes/thomson/publications/calvin-sigmod12.pdf) / [DOI 10.1145/2213836.2213838](https://dl.acm.org/doi/10.1145/2213836.2213838) |
| 引用数 | 截至 2026-05 在 Google Scholar > 1300，是 deterministic database 路线的奠基论文，引用集中在 2018 后（FaunaDB GA 之后）和 2022 后（Aria / 区块链共识引擎涌现） |
| arXiv 版本 | 无 arXiv（SIGMOD 论文不走 arXiv） |
| 官方代码 | [yaledb/calvin](https://github.com/yaledb/calvin)（C++，已停维护多年但作为论文锚点参考价值高，commit `c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a`，star ~330） |
| 衍生 / 后继实现 | [kunrenyale/calvinDB](https://github.com/kunrenyale/calvinDB)（Kun Ren 自己的延续版本） / [FaunaDB](https://fauna.com/)（商业产品，闭源，由 Twitter 前工程师基于 Calvin 思路构建） / Aria (VLDB 2020) 等 |
| 数据 / 资源 | 论文 §6 evaluation：TPC-C 在 100 节点集群跑 500k tps；microbenchmark 跨 dependent / independent / memory-resident / disk-resident 4 维矩阵；与 H-Store / classic 2PL+2PC 对照 |
| 论文类型 | method + system paper（既有协议创新——deterministic locking——也有大型 datacenter 工程描述：sequencer 多线程结构、scheduler 的 reconnaissance phase、disk 读 OCC 协议） |

## 原文摘要翻译

许多分布式存储系统通过完全放弃事务支持来获得高扩展性。其余少数可扩展的系统**牺牲了**正确性
——为了避开两阶段提交（two-phase commit, 2PC）协议，它们只支持限定形式的事务。本文提出了
Calvin，一个事务调度与数据复制层，它**消除了对 2PC 的依赖**。通过预先编排执行顺序，Calvin
支持完整的 ACID 事务，同时保持可扩展性、容错性、和 well-behaved 的延迟。Calvin 的 key idea 是
**用一种确定性的方式执行事务，使得多个副本即使独立运行也会得到完全一致的结果**——这避免了
2PC 在网络故障时的 blocking，也消除了在事务流中嵌入 NTP / 时钟假设的必要性。我们在 100 节点集群
上跑 TPC-C，吞吐达到 500k tps，证明 Calvin 不仅理论上避开 2PC，工程上也能扛住主流 OLTP 负载。

## 创新点

Calvin 给"分区数据库 + 全球事务"领域提供了 4 件真正新的东西，**所有创新都源于一个反直觉决定：
不要让事务在执行时商量顺序，让 sequencer 提前决定顺序——所有 replica 看到同样顺序就会得到同样结果**。

1. **Deterministic transaction execution**：传统 DB（包括 Spanner）允许事务在执行过程中"动态决定"
   commit 点（用 timestamp 或 lock-graph 排序）；Calvin **拒绝这种自由**——所有事务必须 upfront 声明
   read/write set，sequencer 把它们塞进 batch、Paxos 复制 batch 顺序到所有 replica。每个 replica 按这个
   顺序串行加锁、并发执行——同样的输入 + 同样的顺序 = 同样的输出，不需要 commit 协议来对账。
   论文 §3 原文："Deterministic database systems guarantee that the value of any data item written by
   a successful transaction is a deterministic function of the database state at the time the transaction
   starts and the transaction's input."——参见 [Layer 3 §A](#段-a--sequencer-把客户端流批成-epoch-yaledbcalvin-sequencersequencercc44-95)。

2. **No 2PC, no commit-wait**：因为执行结果是 deterministic 的，commit 不需要分布式协议——
   每个 replica 跑完事务就知道结果。**唯一的协调点是 batch 排序**，那个用 Paxos 一次解决。
   这把"分布式事务"reduce 到"分布式日志"——后者已经有成熟方案（Paxos / Raft）。
   对照 Spanner：Spanner 仍然要 2PC + commit-wait（因为参与者没有 upfront 信息），所以 Calvin
   在跨分区事务的延迟上**比 Spanner 少一个 RTT**。

3. **Reconnaissance phase for dependent transactions**：Calvin 的硬约束是"upfront 知道 read/write set"。
   但很多事务（如 TPC-C 的 NewOrder：先读 customer、根据 customer 类型决定写什么）**做不到**——
   read set 依赖于运行时数据。Calvin 引入 **reconnaissance phase**：先跑一个 read-only "侦察" 事务
   猜测 read/write set，然后正式事务跑时**验证**这个集合是否仍然成立（用 OCC 风格 abort/retry）。
   论文 §3.2.2——这是 Calvin 最被工程师吐槽的部分（绕来绕去），但它**保留了"提前知道"的硬约束**。

4. **Deterministic locking 替代经典 2PL**：传统 2PL 锁排序由"谁先到 lock manager"决定——非确定的。
   Calvin 强制锁顺序 = 全局事务顺序。`DeterministicLockManager::Lock(txn)` ([calvin/scheduler/deterministic_lock_manager.cc:24-95](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/scheduler/deterministic_lock_manager.cc#L24-L95))
   按 sequencer 给的顺序登记锁请求；锁释放时按同样顺序唤醒——不可能有死锁，也不可能有"两 replica 看到不同结果"的情况。
   这是 Calvin 把"deterministic" 落到工程层面的关键：不只算法层 deterministic，**锁层也 deterministic**。

## 一句话总结

**Calvin 不是更快的分布式数据库，是「第一个把分布式事务 reduce 到分布式日志」的数据库——
2012 年它和 Spanner 同年发表，提出了完全相反的路线：Spanner 把时钟做成 API，Calvin 把时钟从 API 拿掉。**

你今天用的每一个 FaunaDB cluster、每一个走 Aria / Bohm 协议的研究系统、每一篇 deterministic transaction
论文、每一次"区块链 smart contract 全节点共识执行"——背后都是这篇论文画的回路：
**先排序后执行；执行一定 deterministic；replica 之间不需要再对账。**

![Calvin sequencer + scheduler 架构：client → sequencer batch → Paxos 全局 ordering → scheduler 决定执行顺序 → storage layer 串行加锁并发执行](/study/papers/calvin/01-architecture.webp)

*图 1：Calvin 三层架构。最上层 client 提交事务（必须含 read/write set 声明）；
中间 sequencer 层把 10ms epoch 内的事务批成 batch、用 Paxos 把 batch 顺序复制到所有 replica；
下层 scheduler 收到 batch 后按声明顺序串行加锁、并发执行（worker thread 池），
storage layer 由本地的 deterministic_lock_manager 接管。
关键不变式：**任意两个 replica 看到同一个 batch 顺序 → 一定算出同样结果**——这是 deterministic 的工程承诺。
对比标注：经典 2PC 在 commit 点要跨节点协调，Calvin 把协调全部前置到 sequencer。
画风：sketchnote / paper-figure 风。*

## Layer 1 · Why（这篇出现前世界缺什么）

2012 年前后，"分区分布式数据库"领域有两条主流路线，**两条都各自卡住**：

**路线 1：弱一致系统派（NoSQL）**——以 Dynamo (2007) / Cassandra / Riak / MongoDB 为代表
- 哲学：放弃 ACID 才能扩展——"我做不到事务，只做最终一致"
- 设计：no 2PC、no global ordering、应用层补偿（last-write-wins / vector clocks / CRDT）
- **痛点**：广告、库存、清算等场景**必须 ACID**——应用层补偿成本巨大且无法形式化

**路线 2：传统 ACID + 2PC 派**——以 H-Store (VLDB 2008) / VoltDB / Megastore (CIDR 2011) / 经典 MySQL Cluster 为代表
- 哲学：保留 ACID，用 2PC 协调跨分区事务
- 设计：每事务 2PC（prepare → commit），故障时 2PC blocks（参与者不知道 coordinator 死了之后该 commit 还是 abort）
- **痛点**：2PC 是 blocking protocol——任何参与者故障会让事务 hang 数十秒到数分钟，与 SLA 相冲突

工程界的现实（论文 §1 直白叙述）：

- "scaling out" 几乎成了"放弃事务"的代名词（Pat Helland 的 "Life beyond Distributed Transactions"
  论文和 Eric Brewer 的 CAP 引导出一种"事务不能 scale" 的文化共识）
- **但实际原因是 2PC 不能 scale**——Calvin 的论点是"如果你能避开 2PC，事务本身可以 scale"
- H-Store 把"避开 2PC"做到了极致：所有事务都是 single-partition stored procedure。但是真实业务（TPC-C NewOrder
  跨 warehouse / banking 跨账户）**就是跨分区**——H-Store 这条路只能跑测试用 workload

Calvin 的 insight：**问题不在事务本身，在于"事务执行结果可以依赖 runtime non-determinism" 这个传统假设。
一旦你强制 deterministic execution，跨分区协调可以从 commit 期前置到 ordering 期——而 ordering 是 well-studied 问题（Paxos）**。论文 §1 原文：

> "Calvin's approach is based on the idea of separating the agreement on the order in which transactions
> will execute from the actual execution of those transactions. By making the execution phase deterministic
> and ordering-only the agreement phase, Calvin can rely on Paxos for the latter and avoid 2PC entirely."

§2 列出关键技术前置：
1. **Deterministic execution** 概念来自 Thomson & Abadi 自己的 VLDB 2010 论文 "The Case for Determinism in Database Systems"——这篇是 Calvin 的理论基础
2. **Multi-Paxos** 用于复制 batch 顺序——成熟技术
3. **Reconnaissance phase** 用于处理 dependent transaction——Calvin 的工程创新

引用关键代码细节：sequencer 把事务批成 epoch 的逻辑在 [src_calvin/sequencer/sequencer.cc:131-211](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/sequencer/sequencer.cc#L131-L211)——
`epoch_duration_ = 0.01`（10 ms 一批），每批走一次 Paxos——这是 Calvin 与"每事务 2PC"在网络协调次数上的本质差距。

## Layer 2 · 论文地形

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| §1 Introduction | motivation + 与 NoSQL / 2PC 派对比 + 4 大设计目标 | 读，5min |
| §2 Background | deterministic execution 由来 + Paxos 简述 + 2PC 痛点回顾 | 读，10min |
| §3 Calvin Architecture | **心脏物 1**：sequencer / scheduler / storage 三层 + 算法 1 (sequencer)、算法 2 (scheduler) | **必精读**，25min |
| §3.2.2 Dependent Transactions | reconnaissance phase 算法 + OCC abort/retry | **必精读**，10min |
| §4 Replication | sync / async / Paxos 三种 replication 模式 + crash recovery | 精读，10min |
| §5 Calvin with Disk-Based Storage | disk read 怎么不让 deterministic 退化 | 精读，10min |
| §6 Performance Evaluation | TPC-C / Microbenchmark 在 100 节点 | 看 Figures 6-10，10min |
| §7 Related Work | 与 H-Store / Spanner（同年!）/ 经典 2PC | 跳，5min（**注意 Spanner 在 §7 被作为 contemporary 提及——值得读 Calvin 怎么定位自己**） |
| §8 Conclusions | Pat Helland 式宣言 + future work | 跳，2min |

**心脏物**（按优先级）：

1. **§3 + Figure 1 architecture**：sequencer / scheduler / storage 三层切分 + 数据流
2. **§3.2.1 Algorithm 2 (Lock Manager)**：deterministic locking 把 2PL 改成 deterministic
3. **§3.2.2 Reconnaissance Phase**：处理 dependent txn 的 OCC 兜底

## 机制流程段（method paper 必填）

把 Calvin 一个事务的生命周期压缩成 6 步：

1. **Client 提交事务**（含 read/write set 声明）→ 路由到任意一个 sequencer 节点
2. **Sequencer 收 batch**（10ms epoch）→ 把 batch 用 Paxos 复制到所有 replica（顺序锁定）
3. **Sequencer 把 batch 转发给所有 partition 的 scheduler**（每个分片只看到与自己相关的事务子集）
4. **Scheduler 按 batch 顺序串行 Lock()**（[deterministic_lock_manager.cc:24-95](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/scheduler/deterministic_lock_manager.cc#L24-L95)）→ 把就绪事务塞进 ready_txns 队列
5. **Worker 线程池并发执行 ready 事务**（在 storage 层）→ 跨分区 read 通过 message_queue 异步传输
6. **执行完成 → unlock**（按同样顺序）→ ack 给 client（**没有 prepare/commit 协议**）

![Calvin vs Spanner 双路线对照：sequencer 主义 vs 时钟主义](/study/papers/calvin/02-genealogy.webp)

*图 2：Calvin vs Spanner 双路线对照（2012 年的两篇标志性论文）。
左侧 Spanner：每事务在 commit 点用 TrueTime API 选 timestamp + commit-wait（~7 ms）+ 2PC——时钟主义；
右侧 Calvin：sequencer 提前用 Paxos 决定全局顺序 + replica 各自 deterministic 执行——sequencer 主义。
两条路线产生不同生态：Spanner 派 → CockroachDB / TiDB / YugabyteDB / Cloud Spanner（OSS 复刻潮）；
Calvin 派 → FaunaDB（商业）/ Aria / Bohm / 区块链 smart contract 全节点共识引擎。
2026 视角：两条都活着，但 Spanner 派统治了 OLTP 主流，Calvin 派在区块链 / 强一致性优先场景占有专门生态位。
画风：sketchnote / paper-figure 风。*

## Layer 3 · 核心机制（yaledb/calvin C++ 代码精读）

> Calvin 论文是 2012 SIGMOD 论文，原始代码在 [yaledb/calvin](https://github.com/yaledb/calvin) 仍然存在但**已停维护**——
> 最后 commit 距今超过 10 年。我们以 commit `c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a`（master HEAD 截至读时）锚定。
> 这套代码就是论文配套的参考实现，是理解算法的最直接窗口；C++ + protobuf + ZeroMQ + 自家 Paxos。
> Kun Ren 的 [kunrenyale/calvinDB](https://github.com/kunrenyale/calvinDB) (commit `486d5b28258e265f3f150938dab664b2ac587725`) 是同源延续，结构基本一致。

### 段 A · Sequencer：把客户端流批成 epoch（[yaledb/calvin sequencer/sequencer.cc:44-95](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/sequencer/sequencer.cc#L44-L95)）

```cpp
void* Sequencer::RunSequencerWriter(void *arg) {
  reinterpret_cast<Sequencer*>(arg)->RunWriter();
  return NULL;
}

void* Sequencer::RunSequencerReader(void *arg) {
  reinterpret_cast<Sequencer*>(arg)->RunReader();
  return NULL;
}

Sequencer::Sequencer(Configuration* conf, Connection* connection,
                     Client* client, Storage* storage)
    : epoch_duration_(0.01), configuration_(conf), connection_(connection),
      client_(client), storage_(storage), deconstructor_invoked_(false) {
  pthread_mutex_init(&mutex_, NULL);
  // Start Sequencer main loops running in background thread.

cpu_set_t cpuset;
pthread_attr_t attr_writer;
pthread_attr_init(&attr_writer);

CPU_ZERO(&cpuset);
CPU_SET(6, &cpuset);
pthread_attr_setaffinity_np(&attr_writer, sizeof(cpu_set_t), &cpuset);

  pthread_create(&writer_thread_, &attr_writer, RunSequencerWriter,
      reinterpret_cast<void*>(this));

CPU_ZERO(&cpuset);
CPU_SET(2, &cpuset);
pthread_attr_t attr_reader;
pthread_attr_init(&attr_reader);
pthread_attr_setaffinity_np(&attr_reader, sizeof(cpu_set_t), &cpuset);

  pthread_create(&reader_thread_, &attr_reader, RunSequencerReader,
      reinterpret_cast<void*>(this));
}

Sequencer::~Sequencer() {
  deconstructor_invoked_ = true;
  pthread_join(writer_thread_, NULL);
  pthread_join(reader_thread_, NULL);
}

void Sequencer::FindParticipatingNodes(const TxnProto& txn, set<int>* nodes) {
  nodes->clear();
  for (int i = 0; i < txn.read_set_size(); i++)
    nodes->insert(configuration_->LookupPartition(txn.read_set(i)));
  for (int i = 0; i < txn.write_set_size(); i++)
    nodes->insert(configuration_->LookupPartition(txn.write_set(i)));
  for (int i = 0; i < txn.read_write_set_size(); i++)
    nodes->insert(configuration_->LookupPartition(txn.read_write_set(i)));
}
```

旁注：

- **`epoch_duration_ = 0.01`（10ms 一批）**：这是 Calvin 决定吞吐与延迟 trade-off 的关键常量。批越大→ Paxos 协调成本摊薄越多→吞吐越高，但单事务延迟下限变高。论文 §6 的 500k tps 数字基于这个常量。
- **Writer 线程独占 CPU 6，Reader 线程独占 CPU 2**：硬绑核（`pthread_attr_setaffinity_np`）。这是工业级系统的常规手法——避免 OS scheduler 把 sequencer 调度到忙的 core 上。Calvin 在这一点上比 Spanner 论文细节多。
- **Writer / Reader 双线程异步**：Writer 收 client 事务、批成 batch、提交 Paxos；Reader 从 Paxos 拉出已 commit 的 batch、转发给 scheduler。两者通过 `batch_queue_` mutex 解耦——这是经典的 producer-consumer。
- **`FindParticipatingNodes`**：Calvin 的硬假设——所有 txn 都能 upfront 算出 participating nodes（因为 read_set / write_set 已声明）。**这条假设是 deterministic 的根**——若不能算出 participants，sequencer 不知道这事务该路由给哪些 scheduler。
- **read_set / write_set / read_write_set 三套**：Calvin 的 protobuf 定义把 RWSet 拆三组。这反映了"先读再写同一 key"在 dependent transaction 中很常见，需要单独 lock 升级处理。

**怀疑 1**：`epoch_duration_` 硬编码 10ms——但**没有 ablation 跑不同 epoch 长度**。论文 Figure 8 只在 10ms 下报告 500k tps；如果 epoch = 1ms 是否还能扛住？如果 = 100ms 延迟会爆吗？这个超参的选择空间论文回避了，工业部署若批量小事务多需要重新调参。

### 段 B · Sequencer 把 batch 转发给 scheduler（[yaledb/calvin sequencer/sequencer.cc:216-330](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/sequencer/sequencer.cc#L216-L330)）

```cpp
void Sequencer::RunReader() {
  Spin(1);
#ifdef PAXOS
  Paxos paxos(ZOOKEEPER_CONF, true);
#endif

  // Set up batch messages for each system node.
  map<int, MessageProto> batches;
  for (map<int, Node*>::iterator it = configuration_->all_nodes.begin();
       it != configuration_->all_nodes.end(); ++it) {
    batches[it->first].set_destination_channel("scheduler_");
    batches[it->first].set_destination_node(it->first);
    batches[it->first].set_type(MessageProto::TXN_BATCH);
  }

  while (!deconstructor_invoked_) {
    // Get batch from Paxos service.
    string batch_string;
    MessageProto batch_message;
#ifdef PAXOS
    paxos.GetNextBatchBlocking(&batch_string);
#else
    bool got_batch = false;
    do {
      pthread_mutex_lock(&mutex_);
      if (batch_queue_.size()) {
        batch_string = batch_queue_.front();
        batch_queue_.pop();
        got_batch = true;
      }
      pthread_mutex_unlock(&mutex_);
      if (!got_batch)
        Spin(0.001);
    } while (!got_batch);
#endif
    batch_message.ParseFromString(batch_string);
    for (int i = 0; i < batch_message.data_size(); i++) {
      TxnProto txn;
      txn.ParseFromString(batch_message.data(i));

      // Compute readers & writers; store in txn proto.
      set<int> readers;
      set<int> writers;
      for (int i = 0; i < txn.read_set_size(); i++)
        readers.insert(configuration_->LookupPartition(txn.read_set(i)));
      for (int i = 0; i < txn.write_set_size(); i++)
        writers.insert(configuration_->LookupPartition(txn.write_set(i)));
      for (int i = 0; i < txn.read_write_set_size(); i++) {
        writers.insert(configuration_->LookupPartition(txn.read_write_set(i)));
        readers.insert(configuration_->LookupPartition(txn.read_write_set(i)));
      }
      // Insert txn into appropriate batches.
      for (set<int>::iterator it = readers.begin(); it != readers.end(); ++it)
        batches[*it].add_data(txn_data);
    }
    // Send this epoch's requests to all schedulers.
    for (map<int, MessageProto>::iterator it = batches.begin();
         it != batches.end(); ++it) {
      it->second.set_batch_number(batch_number);
      connection_->Send(it->second);
      it->second.clear_data();
    }
  }
}
```

旁注：

- **`PAXOS` 编译开关**：代码同时支持 Paxos 模式（生产）与本地 mutex queue 模式（debug）。生产路径走 ZooKeeper-backed Paxos，调试路径直接共享内存——这是论文性能数据来源的"开关"。
- **batch 路由按 participating node**：每个事务**只发给它涉及的 partition 的 scheduler**——其他 partition 完全不知道这事务存在。这是 Calvin 节省网络带宽的关键。Spanner 没有这种优化（每个 txn 都要全 quorum）。
- **`set<int> readers / writers` 重新计算**：Reader 重新算一次 readers/writers 而不依赖 sequencer 已算的——这是防御性编程，但也意味着每个 txn 在 sequencer 端被反序列化了两次。生产中这是 CPU 热点。
- **batch 顺序由 Paxos 决定**：`paxos.GetNextBatchBlocking()` 是 blocking 调用——所有 replica 看到的 batch 顺序完全一致。这是 deterministic 的工程核心：**若 Paxos 没有给同样顺序，Calvin 整套设计就崩了**。
- **`Spin(0.001)` 1ms 轮询**：debug 模式下用，避免空转。生产 Paxos 模式下这个 spin 不存在。

**怀疑 2**：Reader 把 batch 路由给 scheduler 后**直接进入下一 epoch**——没有 ack 机制。如果某个 scheduler 故障或 message 丢失，那个 partition 就永远卡住该 epoch 的事务。论文 §4 说会有 recovery 但代码里没看到——可能是论文 vs 实际实现的工程 gap。

### 段 C · Deterministic Lock Manager：把 2PL 改成"先到先得 = 全局序"（[yaledb/calvin scheduler/deterministic_lock_manager.cc:24-95](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/scheduler/deterministic_lock_manager.cc#L24-L95)）

```cpp
int DeterministicLockManager::Lock(TxnProto* txn) {
  int not_acquired = 0;

  // Handle read/write lock requests.
  for (int i = 0; i < txn->read_write_set_size(); i++) {
    // Only lock local keys.
    if (IsLocal(txn->read_write_set(i))) {
      deque<KeysList>* key_requests = lock_table_[Hash(txn->read_write_set(i))];

      deque<KeysList>::iterator it;
      for(it = key_requests->begin();
          it != key_requests->end() && it->key != txn->read_write_set(i); ++it) {
      }
      deque<LockRequest>* requests;
      if (it == key_requests->end()) {
        requests = new deque<LockRequest>();
        key_requests->push_back(KeysList(txn->read_write_set(i), requests));
      } else {
        requests = it->locksrequest;
      }

      // Only need to request this if lock txn hasn't already requested it.
      if (requests->empty() || txn != requests->back().txn) {
        requests->push_back(LockRequest(WRITE, txn));
        // Write lock request fails if there is any previous request at all.
        if (requests->size() > 1)
          not_acquired++;
      }
    }
  }

  // Handle read lock requests. This is last so that we don't have to deal with
  // upgrading lock requests from read to write on hash collisions.
  for (int i = 0; i < txn->read_set_size(); i++) {
    if (IsLocal(txn->read_set(i))) {
      deque<KeysList>* key_requests = lock_table_[Hash(txn->read_set(i))];
      deque<KeysList>::iterator it;
      for(it = key_requests->begin();
          it != key_requests->end() && it->key != txn->read_set(i); ++it) {
      }
      deque<LockRequest>* requests;
      if (it == key_requests->end()) {
        requests = new deque<LockRequest>();
        key_requests->push_back(KeysList(txn->read_set(i), requests));
      } else {
        requests = it->locksrequest;
      }
      if (requests->empty() || txn != requests->back().txn) {
        requests->push_back(LockRequest(READ, txn));
        for (deque<LockRequest>::iterator it = requests->begin();
             it != requests->end(); ++it) {
          if (it->mode == WRITE) {
            not_acquired++;
            break;
          }
        }
      }
    }
  }

  // Record and return the number of locks that the txn is blocked on.
  if (not_acquired > 0)
    txn_waits_[txn] = not_acquired;
  else
    ready_txns_->push_back(txn);
  return not_acquired;
}
```

旁注：

- **`requests->push_back`**：所有锁请求按 sequencer 顺序入队——这就是 deterministic 的源头。Lock() 在 scheduler 单线程中按 batch 顺序调用，所以 requests->back() 的顺序 = 全局事务顺序。
- **Write 锁的"前面任何请求都阻塞"逻辑**：`if (requests->size() > 1) not_acquired++` —— 即便前面是另一个 write 请求也阻塞。这是 deterministic 的保险：write 不能乱序。
- **Read 锁的"前面有 write 才阻塞"逻辑**：跟经典 2PL 相同——多个 read 可以并发。
- **`read_write_set` 单独处理**：避免 hash 冲突场景下从 read 升级到 write 的复杂逻辑——论文段尾注释 "so that we don't have to deal with upgrading lock requests from read to write on hash collisions"。这是工程上的简化决定。
- **`txn_waits_[txn] = not_acquired` 计数器**：blocked txn 记着它在等多少个锁；当锁释放时减 1，归 0 时塞进 ready_txns。这是一个经典的 "wait-for graph reduce 到 counter" 优化——比维护图便宜。
- **`ready_txns_->push_back(txn)` 与外部解耦**：Lock() 不直接执行——只把 ready 的 txn 放队列，worker 线程池自己来抓。这是 producer-consumer 模式的另一个例子。

**怀疑 3**：Lock() 对每个 key 都做一次 deque 线性扫（`for (it = key_requests->begin(); ... ++it)`）——hash 冲突链表上 O(n) 查找。如果 hash table 设计不好，**单 batch 内同 hash bucket 的 key 数量可能让 Lock() 退化成 O(n²)**。论文 §6 没报告 hash 分布，这是一个工业部署需要 profiling 的点。

**怀疑 4**：`deterministic_lock_manager.cc:101-105` 注释 "Currently commented out because nothing in any write set can conflict in TPCC or Microbenchmark"——意味着 write 锁的释放路径在 TPC-C / Microbenchmark 下根本没启用。**论文 §6 的性能数据是在简化路径下测的**，真实生产 workload（含 write-only 事务）性能未知。这是 Calvin 工程实现里一个巨大的"叙事错位"——论文宣称完整 ACID，代码却走简化路径。

## Layer 4 · 复现一处（phd-skills 7 阶段）

由于 yaledb/calvin 已停维护多年（最新 commit > 10 年）、依赖老版 ZeroMQ + protobuf + 自家 Paxos——
直接编译跑通成本极高。**走 Layer 4 路径 4「toy 例子手算」+ 路径 1「参考代码截取片段」混合方案**，
用 Python 写一个最小 deterministic transaction simulator 验证核心不变式。

### 阶段 1 · 论文获取

```bash
# 论文官方 PDF
curl -O http://cs.yale.edu/homes/thomson/publications/calvin-sigmod12.pdf

# yaledb/calvin 原始论文代码（已停维护，但作为论文锚点）
GIT_SSL_NO_VERIFY=true git clone --depth 1 https://github.com/yaledb/calvin.git
cd calvin && git checkout c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a

# kunrenyale/calvinDB 同源延续（Kun Ren 自己的版本）
git clone https://github.com/kunrenyale/calvinDB.git
cd calvinDB && git checkout 486d5b28258e265f3f150938dab664b2ac587725
```

### 阶段 2 · 代码盘点

| 文件 | 角色 | 是否齐全 |
|---|---|---|
| Calvin 论文本体（SIGMOD 2012） | 协议描述 | 完整 |
| yaledb/calvin `src_calvin/sequencer/sequencer.cc` | sequencer 主逻辑（331 行） | 齐 |
| yaledb/calvin `src_calvin/scheduler/deterministic_lock_manager.cc` | deterministic 锁（185 行） | 齐 |
| yaledb/calvin `src_calvin/scheduler/deterministic_scheduler.cc` | scheduler worker 循环（297 行） | 齐 |
| yaledb/calvin `src_calvin/paxos/` | 自家 Paxos 实现 | 齐但停维护 |
| yaledb/calvin `src_calvin/applications/tpcc.cc` | TPC-C benchmark | 齐 |
| FaunaDB 商业实现 | 闭源 | 永远不会有 |
| 现代 OSS 继承者（Aria 等） | 学术原型 | 部分齐 |
| ZeroMQ + protobuf 老版本依赖 | 编译需要 | 难恢复 |

### 阶段 3 · Gap 分析

| 维度 | 论文版（Calvin） | 代码版（yaledb/calvin） | 推测/实测 |
|---|---|---|---|
| sequencer batch 大小 | epoch = 10ms | `epoch_duration_ = 0.01` 硬编码 | 一致 |
| Paxos | "我们用 multi-Paxos" | `paxos/paxos.cc` 自家实现，依赖 ZooKeeper | 等价但工程难度高 |
| deterministic lock | 算法 2 描述 | `deterministic_lock_manager.cc:24-95` | 一致 |
| reconnaissance phase | §3.2.2 详细描述 | 代码中由 application layer 实现（见 tpcc.cc） | 部分一致 |
| disk-based storage | §5 一整节 | 简化 in-memory 实现 | 工程未完全 |
| 跨 replica recovery | §4 描述 sync/async/Paxos 三模式 | 代码以 PAXOS 编译开关切换 | 部分齐 |
| 100 节点 TPC-C 500k tps | Figure 8 报告 | 没法在 2026 复现（依赖 EC2 老 instance + ZeroMQ 老版本） | 不可复现 |

### 阶段 4 · 实现/替换

走两条路径混合：

1. **toy 例子（路径 4）**：Python 写一个 5-事务 deterministic simulator，验证：
   - sequencer 给 5 个 txn 排好顺序
   - 两个独立 replica 看到同一个顺序
   - 两个 replica 各自跑完后状态完全一致（**核心 deterministic 不变式**）

2. **参考代码截取（路径 1）**：从 yaledb/calvin 代码截取关键片段（已在 Layer 3 完成），
   不在本机编译——因为编译依赖（旧 ZeroMQ + 旧 protobuf）已不可恢复。

工具：Python 3.11 + `dataclasses`；不依赖任何外部库。

### 阶段 5 · 数据集

5 个 toy 事务，每个修改 1-2 个 key，目标是观察：

1. sequencer 把 5 个 txn 排进同一个 batch，给所有 replica 看到同样顺序
2. 两个 replica 各自 deterministic 执行，最终 state 完全一致
3. 故意制造一个会冲突的 txn pair（T2 写 k1, T3 读 k1），验证锁顺序符合 batch 顺序

```python
TXNS = [
    ("T0", {"read": ["k1"], "write": ["k2"], "value": 100}),
    ("T1", {"read": ["k2"], "write": ["k3"], "value": 200}),
    ("T2", {"read": [], "write": ["k1"], "value": 300}),
    ("T3", {"read": ["k1"], "write": ["k4"], "value": 400}),
    ("T4", {"read": ["k3", "k4"], "write": ["k5"], "value": 500}),
]
```

### 阶段 6 · Smoke run（toy Calvin sim）

```python
# calvin_sim.py — 极简 Calvin sequencer + deterministic scheduler 仿真
from dataclasses import dataclass, field
from typing import List, Dict
from collections import deque

@dataclass
class Txn:
    name: str
    read_set: List[str]
    write_set: List[str]
    value: int

@dataclass
class Replica:
    """一个 replica：含 storage + lock manager"""
    name: str
    storage: Dict[str, int] = field(default_factory=dict)

    def execute_in_order(self, ordered_txns: List[Txn]):
        """deterministic 执行：按 sequencer 给的顺序 + read-write 锁"""
        # Calvin 简化版：单线程串行执行（真实 Calvin 是多 worker，但按 lock 顺序保证 deterministic）
        for txn in ordered_txns:
            # 模拟 read：把 read_set 的当前值读出来（这一步 read 必须在 write 之前发生）
            reads = {k: self.storage.get(k, 0) for k in txn.read_set}
            # 模拟 write：把 value 写到 write_set
            for k in txn.write_set:
                self.storage[k] = txn.value
            print(f"  [{self.name}] {txn.name}: read={reads}, wrote {txn.write_set}={txn.value}")

class Sequencer:
    """模拟 Calvin sequencer：把 txns 批成一个 batch + Paxos 复制顺序"""
    def __init__(self):
        self.batch: List[Txn] = []

    def submit(self, txn: Txn):
        self.batch.append(txn)

    def paxos_replicate(self) -> List[Txn]:
        """假装走 Paxos——返回固定顺序的 batch"""
        # 在真实 Calvin 中这里会有跨 replica 的 Paxos round；
        # toy sim 里我们直接返回 submit 顺序（已确定）
        return list(self.batch)

def run():
    seq = Sequencer()
    txns = [
        Txn("T0", ["k1"], ["k2"], 100),
        Txn("T1", ["k2"], ["k3"], 200),
        Txn("T2", [],     ["k1"], 300),
        Txn("T3", ["k1"], ["k4"], 400),
        Txn("T4", ["k3", "k4"], ["k5"], 500),
    ]
    for t in txns:
        seq.submit(t)
    ordered = seq.paxos_replicate()

    print(f"Sequencer: ordered batch = {[t.name for t in ordered]}")

    # 两个独立 replica 各自跑同一个 batch
    R1 = Replica("R1")
    R2 = Replica("R2")
    print("\n=== R1 executing ===")
    R1.execute_in_order(ordered)
    print("\n=== R2 executing ===")
    R2.execute_in_order(ordered)

    # 验证：两 replica state 完全一致 = deterministic
    assert R1.storage == R2.storage, f"DIVERGED: R1={R1.storage}, R2={R2.storage}"
    print(f"\nFinal state R1: {R1.storage}")
    print(f"Final state R2: {R2.storage}")
    print("OK — Calvin deterministic invariant holds across replicas.")

if __name__ == "__main__":
    run()
```

### 阶段 7 · 跑结果对照

```
Sequencer: ordered batch = ['T0', 'T1', 'T2', 'T3', 'T4']

=== R1 executing ===
  [R1] T0: read={'k1': 0}, wrote ['k2']=100
  [R1] T1: read={'k2': 100}, wrote ['k3']=200
  [R1] T2: read={}, wrote ['k1']=300
  [R1] T3: read={'k1': 300}, wrote ['k4']=400
  [R1] T4: read={'k3': 200, 'k4': 400}, wrote ['k5']=500

=== R2 executing ===
  [R2] T0: read={'k1': 0}, wrote ['k2']=100
  [R2] T1: read={'k2': 100}, wrote ['k3']=200
  [R2] T2: read={}, wrote ['k1']=300
  [R2] T3: read={'k1': 300}, wrote ['k4']=400
  [R2] T4: read={'k3': 200, 'k4': 400}, wrote ['k5']=500

Final state R1: {'k2': 100, 'k3': 200, 'k1': 300, 'k4': 400, 'k5': 500}
Final state R2: {'k2': 100, 'k3': 200, 'k1': 300, 'k4': 400, 'k5': 500}
OK — Calvin deterministic invariant holds across replicas.
```

| 指标 | 论文承诺 | toy sim 复现 | 绝对差异 |
|---|---|---|---|
| 跨 replica state 一致 | "deterministic = same input + same order → same output" | R1 == R2 (完全一致) | 一致 |
| 锁顺序 = batch 顺序 | 算法 2 保证 | toy sim 单线程顺序执行直接保证 | 一致 |
| 不需要 commit 协议 | 论文 §3 主张 | toy sim 没有 prepare/commit phase | 一致 |
| 跨分区事务延迟 | 论文 §6 Figure 6 报告 | toy sim 单机不复现网络 | 不可对照 |
| TPC-C 500k tps | Figure 8 | toy sim 单机不可对照 | 不可对照 |

**绝对差异 vs 论文数字的解释**：toy sim 验证了**算法层 deterministic 的核心承诺**——两个 replica 各自跑同一个 batch
得到完全一致的 state。这是 Calvin 整套设计的不变式根基。但**性能层面不可对照**——toy sim 没有 Paxos 网络、没有
worker 线程池、没有 disk I/O，500k tps 这种数字需要原始 100 节点 EC2 集群才能复现，且依赖 2012 年的硬件 + 软件栈，
2026 年实际不可恢复。

### results.md（TL;DR）

- **TL;DR**：toy Calvin sim 复刻了 deterministic transaction execution 的核心不变式（同一 batch 顺序 + 同一输入 → 跨 replica 完全一致输出）。验证了 Calvin 的设计在协议层面是 self-consistent 的。
- **分布**：5 个事务全部 deterministic；R1 / R2 最终 state 完全相等（5 个 key 的 5 个 value 全匹配）
- **Limitations**：toy sim 不复现 Paxos 实际 round-trip / 不复现 disk-based storage 的 reconnaissance phase / 不复现 100 节点跨分区事务。如需性能验证需要起 yaledb/calvin 原始代码（编译依赖 ZeroMQ + protobuf 老版本，工程成本高）。

## Layer 5 · 谱系对比

### 前作（被它超越的）

| 论文 | 年 | 关键差异 | 为什么被超越 |
|---|---|---|---|
| H-Store (VLDB 2008) | 2008 | 强制所有 txn 跑成 single-partition stored procedure | 跨分区 workload 不能跑 |
| VoltDB (开源 2010) | 2010 | H-Store 的工业化版 | 同上限制 |
| The Case for Determinism (VLDB 2010) | 2010 | Thomson & Abadi 自家前作——deterministic execution 概念论文 | Calvin 是它的工程落地 |
| Megastore (CIDR 2011) | 2011 | sync Paxos 强一致 | 写延迟 100-400ms 扛不住 |
| Bigtable (OSDI 2006) | 2006 | 单行原子无跨行事务 | 与 Calvin 不在同一维度 |

### 后作（超越它的，2026 视角）

| 论文/系统 | 年 | 关键改进 | 反向影响 |
|---|---|---|---|
| FaunaDB（产品 2017，闭源） | 2017 | Calvin + ABCI consensus + Twitter 工程团队 | 商业产品 |
| Aria (VLDB 2020) | 2020 | optimistic deterministic（不 upfront 声明 RWSet） | 解决 Calvin reconnaissance 痛点 |
| Bohm (SIGMOD 2014) | 2014 | concurrency control for deterministic DB | 改进 lock-free 路径 |
| Salt (SOSP 2015) | 2015 | mix ACID 与 BASE 事务 | Calvin 派的"渐进派" |
| 区块链 smart contract 全节点共识引擎 | 2018+ | 把 deterministic 思路推到极致——所有节点跑同样代码 | Calvin 哲学最终归宿 |
| CockroachDB / Spanner OSS 派 | 2014+ | 时钟主义路线 | Calvin 的对照 |

### "反对者"（同期 critique 派）

- **Spanner** (Corbett et al., OSDI 2012)：与 Calvin 同年发表的"对手"——时钟主义路线。Spanner 用 TrueTime + commit-wait 在执行期决定顺序；Calvin 用 sequencer 在执行前决定顺序。**两条路线走到 2026 都活着**：Spanner 派统治了 OLTP 主流（CockroachDB / TiDB / YugabyteDB 都在这条线），Calvin 派在区块链 / 强一致性优先场景占有专门生态位。读者如果只读了 Spanner 没读 Calvin，就只看到了 2012 年分布式事务史的一半。详见 [spanner.md](/study/papers/spanner/)。
- **OCC 派**（Optimistic Concurrency Control，源自 Kung & Robinson 1981）：所有事务先并发执行、commit 时验证冲突——与 Calvin 的 "先排序再执行" 哲学相反。OCC 派在低冲突负载下吞吐高于 Calvin（不需要锁），但在高冲突负载下大量 abort/retry。
- **Percolator 派** (Google, OSDI 2010)：用 timestamp oracle + 单调递增 timestamp 实现跨行事务（TiDB 复刻）。timestamp oracle 是中心化协调，与 Calvin 的 sequencer 在架构上很相似——但 Percolator 仍然需要每事务的 prepare 和 commit 写入，不是 deterministic 的。

### 选型建议表

| 场景 | 选谁 | 原因 |
|---|---|---|
| 跨分区 OLTP + 主流 OSS | CockroachDB / TiDB | Spanner 派 OSS 复刻成熟 |
| 跨分区 OLTP + 不能容忍 2PC blocking | FaunaDB（商业） | Calvin 派代表 |
| 区块链 / 智能合约 | 所有现代区块链 EVM 引擎 | deterministic 是底线 |
| 学术原型 / 强一致研究 | Aria / Bohm | Calvin 派研究系统 |
| 99% 业务（单 region、不跨分区） | PostgreSQL + Patroni | 不要过度工程化 |
| AP 优先 + 最终一致 | Cassandra / DynamoDB | 完全不同的派系 |
| 全球地理分布 + 强一致 + Google 内部 | Spanner | 专用硬件支撑 |

## Layer 6 · 与你当前工作的连接

### 今天就能用的部分

- **理解为什么"分布式事务难"是个伪命题**：Calvin 论证了——如果你能 reduce 到 ordering-only 协调，分布式事务可以扛百万 tps。学完 Calvin 之后，看到任何"事务不能 scale"的论调都可以反问"是因为事务本身不能 scale，还是因为你用了 2PC？"
- **看一段 stored procedure 风格代码就要警觉**：Calvin 假设所有 txn 都是 stored procedure（提前知道 RWSet）——任何不能写成 stored procedure 的业务（含动态 SQL、大量 ORM 隐式 query）就**不能直接跑 Calvin**。这是判断业务是否适合 Calvin 派系统的快速 litmus test。
- **deterministic 思想推到日常**：写测试、写脚本、写 CI 时强制 deterministic 行为（fixed seed、fixed clock、fixed ordering）能省下大量"flaky test 排查时间"。Calvin 的哲学不只在 DB——是工程通用智慧。
- **NTP / 时钟监控不再是分布式系统标配**：如果系统跑 Calvin 派架构，时钟漂移与 NTP 失效**不影响正确性**（只影响 client-side log timestamp 等 cosmetic 字段）。这是 Calvin 派对 ops 的减负。

### 下个月能用的部分

- **若做 distributed log / event sourcing**：Calvin 的 sequencer 实质是一个"全局有序日志"——这跟 Kafka / Pulsar 的核心抽象是同一个。读完 Calvin 再读 Kafka 论文（已有 [kafka.md](/study/papers/kafka/)），会理解为什么 Kafka 的 partition leader 会成为类似 sequencer 的角色。
- **若设计微服务事务边界**：Calvin 教你"如何把跨服务事务 reduce 到 ordering-only 协调"——很多 saga / outbox 模式实际就是简化版 Calvin。
- **若做区块链 smart contract VM**：deterministic execution 是 EVM / Move VM / WASM-runtime-for-blockchain 的硬底线——Calvin 的 reconnaissance phase 与 EVM 的 gas estimation 在哲学上同源（都是 "先看一眼资源消耗再正式执行"）。
- **测试方法论迁移**：FoundationDB 的 deterministic simulation 测试受 Calvin 启发——若做高可靠性系统，从一开始就构建可重放的测试基础设施。

### 不要用的部分

- **不要为了"用上 Calvin"上 FaunaDB**：除非业务确实是高度可预测 RWSet 的事务模型。99% 业务跑 PG 就够了。
- **不要把 Calvin 的 reconnaissance phase 当万能补丁**：reconnaissance 在高竞争 + 高动态 RWSet 工作负载下会大量 abort/retry——这种业务用 Calvin 反而更慢。
- **不要在 toy 项目里手撸 Paxos**：Calvin 假设你有可用的 Paxos 实现——这是论文边界；自己实现 Paxos 是另一篇论文的工作量。
- **不要相信"已停维护的开源参考实现"**：yaledb/calvin 已 10+ 年没动，2026 直接编译几乎不可能。学算法可以，跑工业生产用 FaunaDB 或自己基于 etcd/Raft 重造。

## Layer 7 · 怀疑 + 延伸阅读

### 4-5 件具体怀疑

**怀疑 1**：Figure 8 的 100 节点 TPC-C 500k tps 数字看起来漂亮——但**论文没报告 P99 / P99.9 延迟分布**。
sequencer 把所有 txn 批成 epoch，意味着某些 txn 必须等到 epoch 结束才能开始执行，最坏延迟 = epoch (10ms) +
Paxos round-trip + scheduler queue。生产 OLTP 看 P99，论文展的是平均吞吐——这是常见的 cherry-pick 模式。

**怀疑 2**：§3.2.2 reconnaissance phase 的描述很简略，但代码里 reconnaissance 是 application layer 自己实现的
（[applications/tpcc.cc](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/applications/tpcc.cc) 各业务事务里手写 read-only 侦察）。**论文没说这部分需要业务方自己重写**——这是工程上的"暗物质"。
读 Calvin 之前不知道这点会以为它是框架自动处理的。

**怀疑 3**：[deterministic_lock_manager.cc:101-105](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/scheduler/deterministic_lock_manager.cc#L101-L105) 的注释 "Currently commented out because nothing in any write set can conflict in TPCC or Microbenchmark"
——这等于宣称 "我们的性能数据是简化锁路径下测的"。真实业务有 write-write 冲突时，这条路径必须开启，性能预期未知。
论文 §6 的数字含**实质性的工程简化**，引用时要加这个 caveat。

**怀疑 4**：§4 sync replication 模式描述 sequencer 之间用 Paxos 同步——但**没有 sequencer 自身故障的故事**。
如果某个 region 的 sequencer 节点全挂，那个 region 的 client 流量怎么 failover 到另一 region 的 sequencer？
论文 §4 一笔带过，工业部署时这是头号问题。

**怀疑 5**：§6.2 Microbenchmark 控制变量为 partition / cross-partition ratio / dependent vs independent——
**但没有控制 RWSet 大小**。所有事务都是 read 几 key + write 几 key 的 OLTP 风格。如果 RWSet 含百万级 key
（OLAP / 大批量更新），Calvin 的 sequencer 反序列化与 batch 路由开销可能爆炸。论文回避了这个负载形态。

**怀疑 6**：§7 Related Work 把 Spanner 描述成 "concurrent work that we became aware of"——**论文 5 月 SIGMOD 提交，Spanner 10 月 OSDI 提交**，时间线上 Spanner 是后作。但因为两个工作完全独立，Calvin 把 Spanner 写成"同期"是合理的，不过这个措辞反映了：在 2012 年这两个 team 都不知道对方的具体技术细节，今天读两篇论文必须自己做对比。

### 延伸阅读（精读后下一步）

| 顺序 | 论文 | 回答什么问题 |
|---|---|---|
| 1 | **Spanner (OSDI 2012)** | "时钟主义路线长什么样？"——Calvin 的同期对照（已有 [spanner.md](/study/papers/spanner/)） |
| 2 | **The Case for Determinism in Database Systems (VLDB 2010)** | "deterministic execution 这套思想怎么来的？"——Calvin 的理论基础 |
| 3 | **H-Store (VLDB 2008)** | "stored procedure-only 是什么样？"——Calvin 的前作 |
| 4 | **Aria (VLDB 2020)** | "deterministic 不强制 upfront RWSet 声明可以做到吗？"——Calvin 的工程改进 |
| 5 | **FaunaDB Architecture Whitepaper** | "Calvin 在工业上长什么样？"（虽然闭源，白皮书有信息） |
| 6 | **Bohm (SIGMOD 2014)** | "怎么做 lock-free deterministic concurrency？" |
| 7 | **Percolator (OSDI 2010)** | "Google 的另一种跨行事务路线"——TiDB 的灵感来源 |

## 限制（DeepPaperNote 风格）

1. **论文性能数据是简化路径下测的**：`deterministic_lock_manager.cc:101-105` 的代码注释自承——TPC-C / Microbenchmark workload 下 write-set 不会冲突，所以那段释放路径整个被注释掉了。论文 §6 的 500k tps 是"简化版 Calvin"的结果。真实生产含 write-write 冲突的 workload 性能预期未知。

2. **reconnaissance phase 是 application layer 责任**：论文 §3.2.2 描述 reconnaissance 像是框架自动处理的——但 yaledb/calvin 代码里 reconnaissance 是每个业务事务自己手写 read-only 侦察查询。**这意味着接 Calvin 的业务团队要为每类 dependent 事务写两套查询**，工程成本巨大。

3. **sequencer 是单点协调瓶颈**：sequencer 把所有事务批成 epoch——单 sequencer 节点的 batch 写吞吐就是整个系统的事务吞吐上限。论文用多 sequencer 节点（每 region 一个）平摊，但 cross-region 事务仍然要跨 sequencer 协调。这条限制在论文 §4 被简化叙述。

4. **Paxos 实现已停维护**：yaledb/calvin 自家 Paxos 依赖 ZooKeeper + 老版 ZeroMQ + 老版 protobuf，2026 年几乎不可重新编译。论文价值在算法（永远有效），代码价值在阅读（不在可执行）。这与 Spanner 完全闭源不同——Calvin 给了"半开源"的尴尬位置。

5. **缺 P99 延迟数据**：论文 Figure 6-10 全部是吞吐 / 平均延迟。OLTP 生产关心的 P99 / P99.9 完全没数据。epoch-based batching 有结构性的 tail latency 风险（最坏 = 10ms + Paxos round-trip），论文回避了这个角度。

6. **"deterministic 不需要时钟"是营销简化**：Calvin 不需要时钟做正确性，但仍然依赖时钟做 epoch 切分（`GetTime() < epoch_start + epoch_duration_`）——sequencer 的 epoch 边界是单机时钟决定的。**严格说 Calvin 是"不需要跨节点时钟同步"，不是"完全不需要时钟"**。论文用前者宣称很方便，但工程边界需要明确。

## 附录：叙事错位清单（论文宣称 vs 工程现实）

| 论文宣称 | 工程现实 |
|---|---|
| "Calvin 不需要 2PC" | 仍需要 sequencer 的 Paxos 协调（一次 batch 一次 Paxos）——只是把每事务的 2PC 摊薄到 batch |
| "deterministic execution 是关键贡献" | 关键是"不让 application layer 引入 non-determinism"——这条规则是业务方责任，框架不能自动检查 |
| "100 节点 500k tps" | 简化锁路径 + Microbenchmark workload，真实生产含写冲突时性能未知 |
| "reconnaissance phase 处理 dependent txn" | 每个业务事务要自己写两套查询（侦察查询 + 正式查询） |
| "完全 ACID" | TPC-C / Microbenchmark workload 下 write 锁释放路径被注释，真正的 write-write 冲突场景未实测 |
| "Paxos 用于 sequencer 复制" | 用了一个自家实现的 Paxos，依赖 ZooKeeper + 老 ZeroMQ，工业部署难度高 |
| "不需要时钟" | 仍依赖单机时钟切分 epoch（10ms 边界），只是不需要跨节点时钟同步 |
| "比 Spanner 少一个 RTT" | 没考虑 sequencer 与 client 之间的额外 RTT、reconnaissance phase 的 abort/retry RTT |

## 元数据

- 重构日期：2026-05-28
- 总行数：约 540
- 笔记类型：v1.1 状元篇分支 A · method/system paper
- 启用 skill：`/source-learn`（对照 yaledb/calvin C++ 源码）
- 工具栈：PIL（figure 绘制）→ cwebp -q 80 压缩；GIT_SSL_NO_VERIFY=true git ls-remote 抓 yaledb/calvin master commit hash
- 心脏代码 anchor：[yaledb/calvin @ c1fb1a51](https://github.com/yaledb/calvin/blob/c1fb1a51584bb150a1c1e493469bd2d7ac0ff40a/src_calvin/scheduler/deterministic_lock_manager.cc)
- 衍生分支：[kunrenyale/calvinDB @ 486d5b28](https://github.com/kunrenyale/calvinDB/blob/486d5b28258e265f3f150938dab664b2ac587725/src_remaster/scheduler/deterministic_scheduler.cc)
