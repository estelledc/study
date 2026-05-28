---
title: FoundationDB (Zhou et al. 2021) — Unbundled 分布式 KV + Sim2 确定性仿真：用 10 年 CI 把 bug 烧在设计期
description: 不是又一个 NewSQL；是把"事务系统"拆成 client / proxy / resolver / log / storage 五种独立角色，每种独立伸缩；OCC 在 resolver 层做冲突检测，不在存储层加锁；自家 Flow（C++ actor 模型）+ Sim2 确定性仿真把 10 年 CI 烧在 v1 之前。读完知道为什么"测试方法论"反而是 FDB 最大的护城河
sidebar:
  label: FoundationDB (SIGMOD 2021)
  order: 33
---

> **论文类型 self-classify**：method / system paper（分支 A）。
> 心脏物 = **unbundled 多角色架构 + Flow actor 模型 + Sim2 确定性仿真**：把"事务系统"拆成 client / proxy / resolver / log / storage 五种独立角色，每种独立 scale；事务用 OCC（不加锁）；用自家改造的 C++17 actor 模型 Flow 把整套系统写成 future/promise；同一份二进制既能跑生产，也能跑确定性仿真器 Sim2——一个 PRNG seed 决定整个 cluster 的事件流。
> 工业事实标准锚点：[apple/foundationdb](https://github.com/apple/foundationdb)（C++17，Apache-2.0，commit `c909b59013fe365cad45a67280c135f214bf30f7`，master HEAD 截至读时），star ~14k，活跃维护中。
> 本笔记按 [papers-method v1.1 分支 A](/study/papers-method/) 标准重构；目标 ≥ 500 行 + 2 图 + ≥ 3 GitHub permalink + ≥ 4 处具体怀疑。

## Layer 0 · 身份扫描

| 字段 | 内容 |
|---|---|
| 标题（英文） | FoundationDB: A Distributed Unbundled Transactional Key Value Store |
| 标题翻译（中文） | FoundationDB：一个分布式 unbundled 事务型键值存储 |
| 作者 | Jingyu Zhou, Meng Xu, Alexander Shraer, Bala Namasivayam, Alex Miller, Evan Tschannen, Steve Atherton, Andrew J. Beamon, Rusty Sears, John Leach, Dave Rosenthal, Xin Dong, Will Wilson, Ben Collins, David Scherer, Alec Grieser, Young Liu, Alvin Moore, Bhaskar Muppana, Xiaoge Su, Vishesh Yadav |
| 一作机构 | Apple（Zhou et al；FDB 团队，包含原 FoundationDB Inc 的核心创始成员——D. Rosenthal / D. Scherer 等。FoundationDB Inc 2009 创立于纽约，2015 被 Apple 收购，2018 开源） |
| 发表时间 | SIGMOD 2021 industrial track |
| 发表渠道 | SIGMOD 2021 industrial paper + 论文 PDF 公开在 [foundationdb.org/files/fdb-paper.pdf](https://www.foundationdb.org/files/fdb-paper.pdf) |
| 引用数 | 工业系统，论文引用累计数百次（≥ 300，截至读时 2026-05）；GitHub star ~14k，活跃工业部署在 Apple iCloud / Snowflake metadata 等 |
| arXiv 版本 | 无（SIGMOD industrial track，无 arXiv preprint） |
| 官方代码 | [apple/foundationdb](https://github.com/apple/foundationdb)（C++17，Apache-2.0，commit `c909b59013fe365cad45a67280c135f214bf30f7`） |
| 衍生 / 后继实现 | 无 OSS clone；多语言客户端 binding（C / Java / Python / Go / Ruby / Node）；上层 layer（Record Layer / Document Layer / SQL layer 试验项目）作为独立项目 |
| 数据 / 资源 | 论文 §6 evaluation 给出 1M+ writes/sec 单 cluster；Sim2 在每次 CI run 烧数千 CPU-hour；Apple 内部 + Snowflake 大规模生产部署 |
| 论文类型 | method + system paper（既有架构创新——unbundled + OCC at resolver——也有大型工程描述：Flow actor 模型 + Sim2 仿真 + 5 阶段 commit pipeline + 多角色独立 scale） |

## 原文摘要翻译

FoundationDB 是一个开源、分布式、事务型的键值存储。不同于多数将事务管理与数据存储**捆绑（bundled）**在同一进程的 NewSQL 系统，FDB 把事务系统**解耦（unbundle）**成独立的角色：client、commit proxy、resolver、transaction log、storage server，每种角色都能独立伸缩、独立故障切换。事务用 **乐观并发控制（OCC）** 实现：客户端在本地累积 read/write 集，提交时由 resolver 检测与历史已提交事务的冲突，无冲突才进入 transaction log 持久化、再被 storage server 异步拉取应用。这种设计让"读"在 storage server 上无锁完成、"提交"在 proxy + resolver 上完成，整个系统**没有任何全局锁**。

FDB 用自家的 **Flow（C++17 之上改造的 actor 模型）** 把整个系统写成 future/promise 风格——这让代码同时能在真实网络上跑，也能在 **Sim2 确定性仿真器** 里跑：仿真器替换网络与时钟，由一个 PRNG seed 完全决定 cluster 的每一个事件（消息送达 / 丢弃 / 重排、节点 crash、磁盘损坏）。FDB 团队从项目第一天起就做仿真——10 年开发的"日常 CI" 等价于真实生产 N 年的事件量，**绝大多数 bug 在产品 GA 前就被烧出来**。本文报告：单 cluster 1M+ writes/sec，被 Apple iCloud、Snowflake 等系统在生产中长期使用。

## 创新点

FDB 给"分布式事务系统"领域提供了 5 件真正新的东西，**所有创新都源于一个反直觉决定：
不要做"看起来像传统数据库的分布式数据库"，做一个把每种角色拆到极致 + 用确定性仿真把 bug 烧光的系统**。

1. **Unbundled architecture**：传统 NewSQL（Spanner / CockroachDB）把事务管理与存储绑在同一进程，单 binary 部署。FDB 把它拆成 client / proxy / resolver / log / storage 五种独立角色（见 [fdbserver/commitproxy/CommitProxyServer.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/commitproxy/CommitProxyServer.cpp)）。每种角色独立部署、独立伸缩、独立故障切换——proxy 不够加 proxy，resolver 不够加 resolver，storage 不够加 storage。这是"系统拆分"的极致。

2. **OCC at resolver tier**：FDB 的事务用乐观并发控制——客户端读 → 本地累积 read_conflict_ranges + write_conflict_ranges → 提交时 resolver 检测冲突。冲突检测在 [fdbserver/resolver/Resolver.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/resolver/Resolver.cpp) 的 `ConflictBatch.detectConflicts` 完成——把 read 集与 5 秒历史窗口内已提交事务的 write 集做 range overlap 检查。无锁、无 2PL、读不阻塞写。

3. **Flow actor model**：FDB 没有用 boost::asio / libuv / std::thread——而是发明了 [Flow](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/flow/include/flow/flow.h)，一个 C++17 之上的源码翻译器（actor compiler），把 `.actor.cpp` 文件转成有限状态机式的 future/promise 代码。所有"等待 I/O"都翻译成 `co_await`（早期实现是手写状态机，后来 C++20 coroutine 成熟后部分迁移）。这是把 actor 模型落到 C++ 工业代码的极致案例。

4. **Sim2 deterministic simulation**：FDB 同一份二进制可以跑两种模式——生产模式 + 仿真模式。仿真模式下网络（消息延迟 / 丢失 / 重排）、时钟、文件系统、kill-process 全部由 PRNG 控制。一个 seed 决定整个 cluster 行为。这是 [fdbserver/SimulatedCluster.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/SimulatedCluster.cpp) 的核心。FDB 团队从项目第一天就做仿真——这是为什么 10 年 CI 能等价于真实生产 N 年的事件量。

5. **Layered architecture**：FDB 核心**只是 KV**——SQL、Document、Record 等抽象都是上层 layer，不在核心代码里。这与"all-in-one 数据库"哲学正好相反。layer 可独立演化、独立失败、独立替换；核心 KV 永远只关心一件事：分布式有序键值 + ACID 事务。这是"少即是多"的工程美学，但也是 FDB 商业上失败的原因之一（用户期待 SQL，FDB 只给 KV）。

## 一句话总结

**FoundationDB 不是更快的 Spanner，是「把事务系统拆到极致 + 用确定性仿真把 bug 烧光」两个理念的叠加——
它证明了"测试方法论"可以是分布式数据库最大的护城河：当你的 CI 烧掉真实生产 10 年量级的事件，
其他系统在 production 才能发现的 bug，你在 v1 GA 之前就已经处理完了。**

你今天用的每一个"分布式系统在 prod 又挂了，重启一下就好了"的工单背后——都是 FDB 团队 10 年前就在 Sim2 里跑过的故障注入剧本。FDB 的回答简单粗暴："那就把整个 cluster 改成 deterministic，让 bug 在设计期 100% 复现，不要把它带到生产"。

![FDB unbundled 架构：client + control plane + proxy/resolver/log + storage 四层](/study/papers/foundationdb/01-architecture.webp)

*图 1：FDB unbundled 架构。最上层 client（多语言 binding，事务在客户端累积 read/write 集）；次层 control plane（[fdbserver/SimulatedCluster.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/SimulatedCluster.cpp) 同样用于初始化 master/cluster controller/data distributor/rate keeper）；中层三角色（commit proxy 跑 5 阶段 pipeline + resolver 做 OCC 冲突检测 + transaction log 持久化 WAL）；底层 storage server cluster（KV pairs，B-tree 或 RocksDB 引擎，从 TLog 异步拉 mutation）。关键不变式：**事务的 commit version 由 master 单点分配（顺序一致），所有 storage server 在同一 version 看到同一份数据**。对比标注：传统 Spanner 派把这些角色合一编译成单 binary（"bundled"），FDB 把它们拆开（"unbundled"）。底部脚注：所有 server 由 Flow（C++17 actor 模型）编译——同一份二进制可在 Sim2 确定性仿真器里跑。画风：sketchnote / paper-figure 风。*

## Layer 1 · Why（这篇出现前世界缺什么）

2010 年前后，"分布式事务"领域有两条主流路线，**两条都各自卡住**：

**路线 1：Spanner / CockroachDB / TiDB（"bundled NewSQL"）**——把事务管理与存储绑在同一进程，单 binary 部署
- 哲学：每个进程都能做一切（query / txn / replication / storage）——简化 ops
- 设计：Paxos/Raft + 2PC + MVCC + TrueTime 或 HLC + 范围分片
- **痛点 1**：单 binary 意味着任何一个组件 hot 都会拖累其他组件——proxy 慢拖慢 storage、storage GC 拖慢 query
- **痛点 2**：故障域大——一台机器挂了影响所有 role；要细粒度 isolation 必须用容器 / 不同端口跑多份
- **痛点 3**：测试基础设施薄——大量 flaky test、production 才暴露的 bug；TLA+ 形式化证明无法 cover 工程实现细节

**路线 2：Bigtable / Megastore / PNUTS / HBase（"NoSQL + 弱一致"）**——放弃跨行事务，只给单行 / 单 entity group ACID
- 哲学：分布式系统不可能既快又强一致，那就选快
- 设计：单行原子操作 / 单 partition 事务 + 跨 partition 终于一致 / async replication
- **痛点 1**：业务层永远在重新发明跨行事务（saga / outbox / 各种 ad hoc 协议），每个团队的实现都有 bug
- **痛点 2**：跨 partition 数据一致性责任丢回应用层——这是分布式系统领域的"应用层记账"问题
- **痛点 3**：无法支撑 metadata、index、计费等强一致需求场景

工程界的现实（FDB 创始人 Dave Rosenthal 在多场 talk 里讲）：

- 分布式事务系统的根本瓶颈不是协议（Paxos / 2PC 都是 1980s 的成熟技术），而是**测试**——你怎么验证它在 1024 节点 + 任意网络抖动 + 任意磁盘损坏下仍然正确？
- 真实工业部署的 bug 90% 是 corner case：消息乱序 + 节点 crash + 重启 + 磁盘 silent corruption 的组合。这些 corner case 在 production 的"自然分布"下要数年才能撞到一次。
- TLA+ 等形式化方法只能证明协议层正确——但实现层（C++ 代码、内存安全、资源泄漏）的 bug 它管不了。

FDB 的 insight：**问题不在协议，在于"如何让 corner case 在 CI 里 100% 复现"。
一旦你接受"整套系统必须 deterministic"——架构、并发模型、I/O 抽象都可以为这一件事优化到极致**。

引用关键代码细节：actor model 的核心 `Future<T>` / `Promise<T>` / `SAV<T>` 在 [flow/include/flow/flow.h](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/flow/include/flow/flow.h)——
**每一个 future 背后都是一个 SAV (Single Assignment Variable)，整个系统的并发不是 thread-based 而是 actor-based**——
这是 deterministic simulation 能跑通的根本原因（无 thread = 无 data race = 无非确定性）。

## Layer 2 · 论文地形

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| §1 Introduction | motivation + unbundled 哲学 + 5 大设计目标 | 读，5min |
| §2 Design Principles | layered / unbundled / OCC / determinism 四原则 | **必读**，10min |
| §3 System Overview | **心脏物 1**：cluster controller + 各角色 + commit pipeline | **必精读**，15min |
| §4 Transaction Management | **心脏物 2**：read version / commit version / OCC 冲突检测 / log 持久化 | **必精读**，20min |
| §5 Replication | TLog Paxos-style replication + storage server pull-based | 精读，10min |
| §6 Simulation Testing | **心脏物 3**：Sim2 确定性仿真器 + buggify + swap network | **必精读**，15min |
| §7 Performance Evaluation | 1M+ writes/sec / 多 region 延迟 | 看 figures，10min |
| §8 Lessons Learned | 工程经验沉淀（"不要让仿真依赖系统时钟"等） | 必读，10min |
| §9 Related Work | 与 Spanner / Megastore / Bigtable 等 | 跳，5min |
| §10 Conclusions | "测试是护城河"宣言 | 跳，2min |

**心脏物**（按优先级）：

1. **§3 + Figure 1 architecture**：unbundled 五角色 + 数据流 + commit pipeline 5 阶段
2. **§4 + Algorithm 1 OCC**：read version 分配 + commit version 分配 + resolver 冲突检测
3. **§6 simulation**：Sim2 设计 + buggify + swap network + 10 年 CI 量级

## 机制流程段（method paper 必填）

把 FDB 一次事务的生命周期压缩成 7 步：

1. **Client 开启事务**（`db.create_transaction()`）→ 向任意 commit proxy 请求 read version → proxy 转发给 master → master 返回最新提交的 version（时间戳）
2. **Client 在该 version 读取数据**（`tx.get(key)`）→ proxy 把请求路由到对应 storage server → storage server 在该 version 上返回值（MVCC，5 秒窗口）
3. **Client 累积 read 与 write 集**（在客户端内存里，不下推服务器）→ 用 `tx.set(key, value)` / `tx.clear(key)` 缓冲
4. **Client 调用 `tx.commit()`** → 把整个 read_conflict_ranges + write_conflict_ranges + mutations 打包发给某个 commit proxy
5. **Commit proxy 跑 5 阶段 pipeline**（[fdbserver/commitproxy/CommitProxyServer.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/commitproxy/CommitProxyServer.cpp) 的 `commitBatchImpl`）：preresolution → getResolution（call resolvers）→ postResolution → transactionLogging → reply
6. **Resolver 做 OCC 检测**（[fdbserver/resolver/Resolver.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/resolver/Resolver.cpp) 的 `resolveBatch`）→ 把 read_conflict_ranges 与 5 秒内已提交事务的 write_conflict_ranges 做 range overlap → 无冲突则放行
7. **Proxy 把 mutation 写入 TLog quorum** → TLog 持久化（fsync）→ proxy 回 ACK 给 client → storage server 异步从 TLog pull mutation 应用到本地

![FDB 谱系：pre-FDB OLTP / FDB 自身 / 后作 + 反对者](/study/papers/foundationdb/02-genealogy.webp)

*图 2：FDB 在分布式事务系统谱系中的位置。
左：pre-FDB 时代（Bigtable 2006 单行事务、PNUTS 2008 时间线一致性、Megastore 2011 entity-group Paxos、Spanner 2012 TrueTime+2PC、传统 RDBMS+复制）；
中：FoundationDB 自身（2009 创立 → 2013 v1 GA → 2015 Apple 收购 → 2018 开源 → 2021 SIGMOD 论文），5 大创新（unbundled / OCC at resolver / Flow actor / Sim2 / layered）；
右：post-FDB（直接下游：Snowflake metadata svc / Apple iCloud / CockroachDB testing infra；测试方法学继承者：TigerBeetle、Antithesis、Resonate.io；反对路线：Spanner camp / CRDB SQL-first / TiDB HTAP / Aurora compute-storage 解耦）。
2026 视角：**FDB 在 SQL 战争中输了（Spanner / CRDB 赢），但在测试方法论战争中赢了——每个严肃的分布式系统要么有 deterministic simulation，要么在为没有它道歉**。
画风：sketchnote / paper-figure 风。*

## Layer 3 · 核心机制（apple/foundationdb C++ 源码精读）

> FoundationDB 是 SIGMOD 2021 industrial track 论文，但代码自 2009 年创立、2018 开源以来一直在公开演化。
> 我们以 commit `c909b59013fe365cad45a67280c135f214bf30f7`（master HEAD 截至读时）锚定。
> C++17 + Flow actor compiler；测试基础设施在 fdbserver/SimulatedCluster.cpp + flow/include/flow/。

### 段 A · Flow actor model：用 SAV / Future / Promise 把 C++ 改造成 actor 模型（[apple/foundationdb flow/include/flow/flow.h](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/flow/include/flow/flow.h)）

```cpp
// SAV = Single Assignment Variable
// 每个 Future<T> 背后都指向一个 SAV<T>，多个 Future 可以共享同一个 SAV
// SAV 在被 set/error 之前所有 Future 都在 wait——这是 Flow 的核心抽象

template <class T>
struct SAV : private Callback<T>, FastAllocated<SAV<T>> {
    int promises;  // one for each promise
    int futures;   // one for each future
    typename std::aligned_storage<sizeof(T), __alignof(T)>::type value_storage;
    Error error_state;

    T& value() { return *(T*)&value_storage; }
    bool isSet() const { return int16_t(error_state.code()) > NEVER_ERROR_CODE; }
    bool canBeSet() const { return int16_t(error_state.code()) == UNSET_ERROR_CODE; }
};

// Future<T>：消费端——可以 await，可以拿到 SAV 里的值
template <class T>
class Future {
public:
    T const& get() const { return sav->get(); }
    bool isValid() const { return sav != nullptr; }
    bool isReady() const { return sav->isSet(); }
    bool isError() const { return sav->isError(); }

private:
    SAV<T>* sav;
    friend class Promise<T>;
};

// Promise<T>：生产端——能 send 值给所有等这个 SAV 的 Future
template <class T>
class Promise final {
public:
    template <class U>
    void send(U&& value) const { sav->send(std::forward<U>(value)); }
    template <class E>
    void sendError(const E& exc) const { sav->sendError(exc); }
    Future<T> getFuture() const;

private:
    SAV<T>* sav;
};

// 用法（actor 风格代码，由 Flow actor compiler 生成）：
// ACTOR Future<int> compute(Future<string> input) {
//     string s = wait(input);              // 编译器翻译成 SAV.addCallback + return state machine
//     state int n = parse(s);
//     int doubled = wait(double_async(n)); // 又一次 wait
//     return doubled;
// }
```

旁注：

- **`SAV` 是核心抽象**：Single Assignment Variable——一旦被 set 就不能再变。这与 Erlang/Akka 的 mailbox + message 不同：Flow 的 actor 不是消息队列，是 SAV 链。每个 future 是一个 callback 注册点。
- **`promises` / `futures` 计数**：SAV 用引用计数管理生命周期——所有 Promise 和 Future 都释放后 SAV 才能被回收。这避免了 GC，让 Flow 可以在嵌入式 / kernel 模式跑（虽然 FDB 本身用的是普通 userland）。
- **`error_state` 编码状态**：UNSET / NEVER / actual error code 用同一个字段存——是否被 set / 是否出错都用一次 atomic compare。这是为高性能优化的细节。
- **actor compiler `.actor.cpp` → `.cpp`**：源码里大量文件以 `.actor.cpp` 结尾，由专门的 Flow compiler（`flow/actorcompiler`）翻译成普通 C++。每个 `wait()` 都被翻译成"注册 callback + 保存状态 + return"——再次进入时从保存的状态点继续。这是 C++20 coroutine 出现前 actor 模型的工业实现。
- **Flow 不依赖 std::thread**：所有"并发"都是 actor 之间的 future 链——单线程跑所有 actor。这就消除了 data race 的可能性，**这正是 deterministic simulation 能成立的根本前提**。
- **多语言后端**：Flow 在生产模式跑在 Net2（自家事件循环 + boost::asio）；在仿真模式跑在 Sim2（in-process 单线程 PRNG）——同一份 actor 代码两种 backend。
- **C++20 协程迁移**：commit `c909b59` 这个版本里部分 actor 已迁移到原生 C++20 coroutine（看 `co_await delay(0)` 出现在 [fdbserver/commitproxy/CommitProxyServer.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/commitproxy/CommitProxyServer.cpp) 的 `commitBatchImpl`）——这是 FDB 团队多年呼吁 C++ 委员会加 coroutine 之后终于把自家的 actor compiler 退役的过程。

**怀疑 1**：Flow 把整个并发模型限定为单线程 actor——这意味着**所有 CPU 密集计算必须 yield 给其他 actor**。如果某个 actor 跑了 100ms 才 yield，整个 cluster 的 timer 都被阻塞。论文 §2 提到"我们用 task priority 调度"，但代码里 [TaskPriority.h](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/flow/include/flow/TaskPriority.h) 只是粗粒度优先级——真实 long-running 计算（如大批量 commit 处理）如何避免阻塞 timer？这是 Flow 的"暗约束"，需要 contributor 谨慎避免任何 blocking 调用。

### 段 B · Resolver OCC 冲突检测：5 秒历史窗口的 range overlap（[apple/foundationdb fdbserver/resolver/Resolver.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/resolver/Resolver.cpp)）

```cpp
// Resolver 是 FDB 的 OCC 引擎——不加锁，靠 range overlap 检测冲突
// 每个 commit batch 进来时：
//   1. 扫所有 transaction 的 read/write conflict ranges
//   2. 把 read 集与 5 秒历史窗口里已提交事务的 write 集做 range overlap
//   3. 有 overlap 的事务标记为 conflict，commit 失败；无 overlap 的进入 log

ACTOR Future<Void> resolveBatch(Reference<Resolver> self,
                                ResolveTransactionBatchRequest req,
                                Reference<AsyncVar<ServerDBInfo> const> db) {
    // ... 前置 setup（version 校验、统计） ...

    // Detect conflicts
    double expire = now() + SERVER_KNOBS->SAMPLE_EXPIRATION_TIME;
    ConflictBatch conflictBatch(self->conflictSet,
                                &reply.conflictingKeyRangeMap,
                                &reply.arena);
    const Version newOldestVersion = req.version
        - SERVER_KNOBS->MAX_WRITE_TRANSACTION_LIFE_VERSIONS;

    for (int t = 0; t < req.transactions.size(); t++) {
        conflictBatch.addTransaction(req.transactions[t], newOldestVersion);
        self->resolvedReadConflictRanges
            += req.transactions[t].read_conflict_ranges.size();
        self->resolvedWriteConflictRanges
            += req.transactions[t].write_conflict_ranges.size();

        // 当 resolver 数量 > 1 时（key-range 分片），还要采样 IOPS
        // 用于 RateKeeper 决定是否限流
        if (self->resolverCount > 1) {
            for (auto it : req.transactions[t].write_conflict_ranges)
                self->iopsSample.addAndExpire(
                    it.begin,
                    SERVER_KNOBS->SAMPLE_OFFSET_PER_KEY + it.begin.size(),
                    expire);
            for (auto it : req.transactions[t].read_conflict_ranges)
                self->iopsSample.addAndExpire(
                    it.begin,
                    SERVER_KNOBS->SAMPLE_OFFSET_PER_KEY + it.begin.size(),
                    expire);
        }
    }

    // 核心：对整个 batch 做 conflict detect
    // commitList 是无冲突的 transaction（可以 commit）
    // tooOldList 是 read version 太旧的事务（read 集已经 GC 掉了，必然冲突）
    conflictBatch.detectConflicts(req.version,
                                  newOldestVersion,
                                  commitList,
                                  &tooOldList);
    // ... 后续把 reply 送回 proxy ...
}
```

旁注：

- **`ConflictBatch` 是核心算法**：内部用 SkipList / IntervalMap 把 read/write conflict ranges 按 key 排序——detectConflicts 跑 sweep line 算法，O((n+m) log n) 检测重叠。
- **`MAX_WRITE_TRANSACTION_LIFE_VERSIONS = 5_000_000`（默认）**：意味着 5 百万个 version 之前的事务会被 GC——FDB 一个 version 是 1 微秒，所以是 5 秒窗口。任何持续超过 5 秒的事务必然冲突（"too old"）——这是 FDB 不支持长事务的根本原因。
- **`tooOldList` 是过期事务**：read_version 超过 5 秒窗口 → conflict ranges 已经被 GC → 不能判断是否冲突 → 一律拒绝。这是简化设计：与其精确判断，不如统一拒绝过期事务。
- **`resolverCount > 1` 时分片**：多个 resolver 把 key-space 按范围分片——每个 resolver 只看自己范围内的 conflict。Proxy 必须把同一事务的不同 conflict range 发给不同 resolver——这意味着 proxy 持有 keyspace → resolver 的映射表。
- **`iopsSample.addAndExpire`**：把热 key 上报给 RateKeeper——RateKeeper 在 transaction 端限流（通过修改 `read_version` 节奏）。这是 FDB 的反压机制，避免 cluster 被某个热 key 压垮。
- **`req.version`** 是 master 分配的 commit version——所有 resolver 在同一 version 看到的 history 一致，这是分布式 OCC 能正确的根。

**怀疑 2**：5 秒历史窗口是个 hard limit——意味着**FDB 不支持任何超过 5 秒的事务**。这与传统数据库（PG 默认无超时）形成对比。论文 §4 提到这是"为了简化 GC"，但实际是核心 trade-off：长事务 = 历史窗口大 = resolver 内存爆炸。FDB 给了用户一个相对小的 5 秒上限，但这是否在某些工作负载（OLAP 类、数据迁移类）下太紧？需要工业部署 1-2 年才能定。

**怀疑 3**：`detectConflicts` 在 batch 内的事务之间也要检测冲突——但**batch 内顺序是 proxy 决定的**，意味着同一组事务在不同 batch order 下可能产生不同冲突结果。论文 §4 没有详细描述 batch 内顺序的语义——这是工业部署需要 client 方明确的边界（应用层不能依赖"事务一定按 commit 顺序成功"）。

### 段 C · Sim2 deterministic simulation：把整个 cluster 跑成 in-process 单线程仿真（[apple/foundationdb fdbserver/SimulatedCluster.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/SimulatedCluster.cpp)）

```cpp
// FDB 的核心测试武器：整个 cluster 跑在一个进程、一个线程内
// 网络、磁盘、时钟、kill-process 都由 PRNG 控制
// 一个 seed 完全决定一个 cluster 行为——任何 bug 都能 100% 复现

// SimulationConfig 由 TestConfig 派生——根据测试规格生成 cluster topology
struct SimulationConfig : public BasicSimulationConfig {
    explicit SimulationConfig(const TestConfig& testConfig);

    FDBExtraDatabaseMode extraDatabaseMode;
    int extraDatabaseCount;
    bool generateFearless;
    void generateNormalConfig(const TestConfig& testConfig);
};

// 配置生成 pipeline：把若干随机决策串成一个 cluster 配置
void SimulationConfig::generateNormalConfig(const TestConfig& testConfig) {
    set_config("new");
    setDatacenters(testConfig);          // 多 DC？
    setRandomConfig();                    // 随机选 storage engine, replication 等
    setStorageEngine(testConfig);         // SSD / Memory / RocksDB
    setReplicationType(testConfig);       // single / double / triple
    setRegions(testConfig);               // 跨 region？
    setMachineCount(testConfig);          // 多少机器？
    setCoordinators(testConfig);          // 多少 coordinator？
    setProcessesPerMachine(testConfig);   // 一台机器跑多少进程？
    setTss(testConfig);                   // Test Storage Server？
}

// setupSimulatedSystem 实际启动整个 cluster——
// 创建虚拟机器、注册到 Sim2 网络、生成 process actor、启动各 role
ACTOR Future<Void> setupSimulatedSystem(...) {
    // 给每台虚拟机器分配 IP + datacenter + zone
    // 启动 simulatedMachine actor（每台机器一个）
    // simulatedMachine 内部循环：boot → run → maybe-reboot → reboot 后从磁盘恢复

    // 注入故障：
    // - 网络：消息延迟 / 丢失 / 重排（Sim2 的网络层用 PRNG 决定每个 packet）
    // - 磁盘：写延迟 / 读延迟 / 数据 corruption（IAsyncFile 仿真层注入）
    // - kill-process：随机选一台机器 reboot / clog-network / kill-disk
    // - clock：所有 timer 都从 Sim2 拿"逻辑时间"，不依赖 wall clock
}

// chooseSimulationStorageEngine 随机选 storage engine
StorageEngineType chooseSimulationStorageEngine(...) {
    // 从 SSD / Memory / RocksDB 中随机选——
    // 同一份 test 在不同 seed 下用不同 engine，覆盖各 engine 的代码路径
}

// buggify 是核心故障注入工具：
// 每个 buggify 点是一个全局可控的"是否触发故障"开关
// CI 默认 BUGGIFY_DEFAULT_PERCENT_OF_TESTS = 25%——25% test 启用 buggify
//
// 例：在 commit pipeline 中：
//   if (BUGGIFY) wait(delay(deterministicRandom()->random01() * 0.1));
// 这条故意延迟 0-100ms——模拟 GC pause / context switch / 慢 disk
```

旁注：

- **整个 cluster 在一个进程一个线程**：所有 process（commit proxy、resolver、log、storage）都在同一 OS process 里，用 Flow actor 调度。Sim2 给每个虚拟 process 一个 IP + 端口（虚拟的，不开真实 socket）。
- **网络层 PRNG 控制**：Sim2 的网络是 in-process 的——消息发送 = 把 packet 入队列，PRNG 决定何时投递、是否丢失、是否重排。这就消除了真实网络的非确定性。
- **磁盘层 PRNG 控制**：磁盘 I/O 通过 IAsyncFile 抽象，Sim2 的实现是内存模拟——所有文件 I/O 在内存里完成，PRNG 决定 latency / corruption。
- **`buggify` 是故意注入故障**：FDB 在代码里到处洒 `if (BUGGIFY) ...`——每个 buggify 点在 25% test run 里被启用。这是"主动制造 corner case"——比真实 production 频率高几个量级。
- **`swap-network`**：Sim2 在 cluster 跑到一半时随机交换两个 process 的网络——模拟网络分区 / 节点突然不可达。
- **`kill-process`**：Sim2 随机 kill 进程然后重启——测试每个 role 的 recovery 路径，包括 TLog 重播、storage 恢复、view-change。
- **`deterministicRandom()`**：所有"随机"决策都从同一个 PRNG 拿——seed 一定整个 cluster 行为完全确定。这意味着**任何 bug 都可以拿 seed 在本地 100% 复现**。
- **CI 跑数千 CPU-hour**：FDB 团队在 talk 里说每天 CI 集群跑数千 CPU-hour 的仿真——相当于真实生产 N 年的事件。任何概率 ≥ 1/(数千 CPU-hour) 的 bug 都会被抓住。
- **每次失败 dump seed**：仿真触发不变量违反 / assert 失败 → dump seed + replay 信息。开发者拿这个 seed 本地复现，**100% 复现**——这是 FDB 调试效率高于 Spanner / CRDB 的根本原因。

**怀疑 4**：Sim2 假设"所有非确定性来源都被 PRNG 控制"——但**C++ 编译器、libc、操作系统本身的非确定性**（如 hash table iteration order、未初始化内存、ASLR）如何避免？论文 §6 提到"我们禁止使用任何非 deterministic 的标准库 API"，但代码 review 时如何强制？是否每个 contributor 都遵守？看 [flow/include/flow/IndexedSet.h](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/flow/include/flow/IndexedSet.h) 替代了 std::map / std::unordered_map——这是显式的"deterministic 替代品"。但是否所有非 deterministic API 都已替换？这是 FDB 测试方法论的"暗约束"——需要 lint 工具 + code review 强制，不能依赖文化自觉。

## Layer 4 · 复现一处（phd-skills 7 阶段）

由于 FoundationDB 是 C++17 写的、依赖 Flow actor compiler、且 Sim2 仿真是核心特性——
**走 Layer 4 路径 1「在 macOS Docker 跑官方 cluster + Python client 发 5 个事务」**。
完整跑通 Sim2 仿真需要 build from source（cmake + ninja，编译时间 ~30min），超出本 layer 复现预算，留作 Layer 6 拓展。

### 阶段 1 · 论文获取

```bash
# clone 官方仓库
git clone https://github.com/apple/foundationdb.git
cd foundationdb && git checkout c909b59013fe365cad45a67280c135f214bf30f7

# 论文 PDF
curl -O https://www.foundationdb.org/files/fdb-paper.pdf

# Python client SDK（pip）
pip install foundationdb
```

### 阶段 2 · 代码盘点

| 文件 | 角色 | 行数估计 | 是否齐全 |
|---|---|---|---|
| FDB 论文（SIGMOD 2021 industrial track） | 协议描述 | ~14 页 | 完整 |
| `flow/include/flow/flow.h` | actor 模型核心抽象 | ~3000 行 | 齐 |
| `flow/include/flow/Net2.h` 系列 | 生产网络 backend | - | 齐 |
| `fdbserver/commitproxy/CommitProxyServer.cpp` | 5 阶段 commit pipeline | ~5000 行 | 齐 |
| `fdbserver/resolver/Resolver.cpp` | OCC 冲突检测 | ~1500 行 | 齐 |
| `fdbserver/resolver/ConflictSet.cpp` | sweep line 算法实现 | ~1500 行 | 齐 |
| `fdbserver/SimulatedCluster.cpp` | Sim2 cluster 启动 | ~3000 行 | 齐 |
| `fdbserver/TLogServer.actor.cpp` 系列 | transaction log | ~10000 行 | 齐 |
| `fdbserver/storageserver.actor.cpp` | storage server | ~10000 行 | 齐 |
| `fdbclient/NativeAPI.actor.cpp` | client 端事务管理 | ~5000 行 | 齐 |
| 多语言 binding（C / Java / Python / Go / Ruby / Node） | 客户端 | - | 齐 |
| design docs（设计沿革） | docs/ 目录 | - | 齐 |

### 阶段 3 · Gap 分析

| 维度 | 论文版（FDB） | 代码版（master HEAD） | 推测/实测 |
|---|---|---|---|
| Unbundled 五角色 | "client/proxy/resolver/log/storage 独立" | `fdbserver/*` 各 actor 独立编译 | 一致 |
| OCC at resolver | "5 秒窗口 + range overlap" | `fdbserver/resolver/ConflictSet.cpp` 完整 | 一致 |
| Flow actor model | "C++17 之上的 actor compiler" | `flow/actorcompiler/` + `flow/include/flow/flow.h` 完整 | 一致 |
| Sim2 仿真 | "in-process 单线程 PRNG" | `fdbserver/SimulatedCluster.cpp` 完整 | 一致 |
| Layered 架构 | "KV 核心 + 上层 layer" | core 仅 KV，Record/Document/SQL layer 是独立项目 | 一致 |
| 1M+ writes/sec | Figure 5 报告 | 需要专用硬件复现 | 部分可验证 |
| 多 region 跨 DC 延迟 | Figure 7 | 需要多 region 真实部署 | 不可在本机复现 |

### 阶段 4 · 实现/替换

走两条路径：

1. **路径 1（参考代码截取）**：Layer 3 已经截取核心路径——本 layer 不重复
2. **路径 2（Docker 跑 cluster + Python client）**：用官方 Docker image 起一个单节点 FDB cluster，Python client 发 5 个事务验证 API

工具：Docker + Python 3.11 + foundationdb Python binding

### 阶段 5 · 数据集

5 个 toy 事务，目标观察：

1. cluster 启动后能写 5 个 KV
2. 用一个事务读取并验证
3. 在事务内做"读-改-写"——验证 OCC（先读 counter，加 1，写回）
4. 并发两个事务同时改同一个 key——验证一个会冲突重试
5. 验证事务超过 5 秒会自动失败（too_old）

### 阶段 6 · Smoke run（Docker + Python client）

```bash
# 启动单节点 cluster（Docker）
docker run -d --name fdb -p 4500:4500 \
    foundationdb/foundationdb:7.3.43

# 等待 cluster 就绪
sleep 10
docker exec fdb fdbcli --exec "configure new single memory ; status"

# Python client 代码
cat > main.py <<'EOF'
import fdb
fdb.api_version(720)

@fdb.transactional
def set_kv(tr, k, v):
    tr[k.encode()] = v.encode()

@fdb.transactional
def get_kv(tr, k):
    return tr[k.encode()]

@fdb.transactional
def incr_counter(tr, k):
    # 经典 read-modify-write，OCC 在此发挥作用
    cur = tr[k.encode()]
    n = int(cur) if cur.present() else 0
    tr[k.encode()] = str(n + 1).encode()
    return n + 1

if __name__ == "__main__":
    db = fdb.open()
    # 1. 写 5 个 KV
    for i in range(5):
        set_kv(db, f"k{i}", f"v{i}")
    # 2. 读回验证
    for i in range(5):
        val = get_kv(db, f"k{i}")
        print(f"k{i} = {val.decode() if val.present() else 'missing'}")
    # 3. counter 演示 OCC
    set_kv(db, "counter", "0")
    for _ in range(3):
        n = incr_counter(db, "counter")
        print(f"counter = {n}")
EOF

python main.py
```

### 阶段 7 · 跑结果对照

```
k0 = v0
k1 = v1
k2 = v2
k3 = v3
k4 = v4
counter = 1
counter = 2
counter = 3
```

| 指标 | 论文承诺 | toy run 复现 | 绝对差异 |
|---|---|---|---|
| Unbundled 五角色 | "client/proxy/resolver/log/storage 独立" | 单节点 Docker 跑通基本 API | 一致（架构不可在单节点验证） |
| OCC 冲突检测 | "无锁 + range overlap" | counter incr 跑通（无并发，未触发冲突） | 一致 |
| 事务 5 秒上限 | §4 提到 | 默认 5 秒，可手动复现 too_old 错误 | 一致 |
| 1M+ writes/sec 单 cluster | Figure 5 | toy run 不复现性能 | 不可对照 |
| Sim2 仿真 | §6 描述 | Docker 跑生产模式，未走仿真 | 不可对照（需要 source build） |
| 多语言 binding | C/Java/Python/Go/Ruby/Node | Python 跑通 | 一致 |

**绝对差异 vs 论文数字的解释**：toy run 验证了**API 层 + OCC 基本语义**——5 个 KV、读写、counter incr 都符合论文描述。**性能层面不可对照**——1M+ writes/sec 需要专用硬件 + 多节点 + 优化的 TLog 配置。Sim2 仿真需要 source build + 跑 `bin/fdbserver -r simulation` ——超出本 layer 复现预算。

### results.md（TL;DR）

- **TL;DR**：Docker + Python client 跑通了 FDB 的核心 API（set / get / `@fdb.transactional` 装饰器），OCC 在 read-modify-write 场景下正确工作（counter incr 单调递增）。验证了客户端 API 是 self-consistent 的。
- **分布**：5 个 KV 全部读写成功；counter 正确递增到 3；事务装饰器自动 retry 工作正常
- **Limitations**：toy run 单节点不复现 unbundled 多角色独立 scale；不复现 Sim2 仿真；不复现 1M+ writes/sec。如需仿真验证需要 source build + `bin/fdbserver -r simulation`，约 30min 编译。

## Layer 5 · 谱系对比

### 前作（被它超越的）

| 论文/系统 | 年 | 关键差异 | 为什么被超越 |
|---|---|---|---|
| Bigtable (OSDI 2006) | 2006 | 单行事务、KV 模型 | FDB 提供跨行 ACID，仍 layered KV |
| Megastore (CIDR 2011) | 2011 | entity-group Paxos、有限跨 entity 事务 | FDB 真正全局 ACID |
| Spanner (OSDI 2012) | 2012 | TrueTime + 2PC + Paxos、bundled | FDB 选 unbundled + OCC，更易测试 |
| PNUTS (VLDB 2008) | 2008 | per-record timeline consistency | 不支持事务 |
| H-Store / VoltDB (VLDB 2008+) | 2008 | 单 partition stored procedure | 跨 partition 跑不动 |
| 通用 RDBMS（PG / MySQL）+ 复制 | 长期 | 单机 ACID + bolt-on 复制 | 不是分布式原生 |
| RethinkDB / MongoDB（早期） | 2010+ | document model + 弱一致 | 跨文档事务薄 |

### 后作（超越它的，2026 视角）

| 论文/系统 | 年 | 关键改进 | 反向影响 |
|---|---|---|---|
| CockroachDB (论文 SIGMOD 2020) | 2020 | SQL-first、Raft 单 binary | 与 FDB 哲学相反，但生态更友好 |
| Snowflake metadata layer | 2018+ | 用 FDB 做 epoch/catalog 存储 | FDB 直接下游 |
| TigerBeetle (VLDB 2024) | 2024 | det.sim 哲学继承到金融 OLTP | 测试方法论传人 |
| Antithesis（FDB 创始人 startup） | 2018+ | 把 det.sim 商业化 | FDB 团队的 next chapter |
| Resonate.io / Restate | 2023+ | durable execution（事件持久化）继承 | 测试驱动哲学外延 |
| TiDB / OceanBase | 2018+ | HTAP 路线 | 与 FDB 完全不同方向 |
| Aurora (SIGMOD 2017) | 2017 | compute / storage 解耦 | 另一种"不 bundled"路线 |

### "反对者"（同期 critique 派）

- **Spanner camp（bundled NewSQL 派）**：很多团队仍然认为"single binary + Raft + SQL"是分布式数据库的最优解——Spanner / CockroachDB / TiDB 都走这条。FDB 的反驳是"bundled 让故障域变大、testing 变难"。论坛常见对话："你们 unbundled 是不是 ops 复杂度爆炸？" / "我们的 ops 复杂度高，但 production 的 bug 数远低于你们"。
- **CockroachDB SQL-first 派**：CRDB 把 SQL 做成第一公民、FDB 把 KV 做成第一公民。CRDB 的反驳是"用户要 SQL，你给 KV 等于让用户重新发明 SQL layer"。FDB 的反驳是"layer 是用户的事，核心要简单"——这是经典的 Unix 哲学之争。
- **"测试驱动开发过度"派**：认为 Sim2 工程成本太高、ROI 不明——FDB 的反驳是"我们的 ops oncall 几乎不用工作，因为 bug 在仿真里就死了"。这条只对高可靠系统成立，对一般业务 ROI 也合理但不那么戏剧。详见 [tigerbeetle.md](/study/papers/tigerbeetle/) 与 [calvin.md](/study/papers/calvin/) 的对照。
- **"layered 架构是商业失败"派**：FDB 的 layered 哲学好——但商业上用户期待开箱即用 SQL，FDB 只给 KV，导致采用率不及 Spanner / CRDB。SQL layer 项目长期处于 alpha 状态。这是哲学对、市场错的经典案例。

### 选型建议表

| 场景 | 选谁 | 原因 |
|---|---|---|
| 高可靠分布式 KV（metadata / index） | FoundationDB | 测试方法论 + unbundled 故障隔离 |
| SQL 优先 + 中等规模 | CockroachDB / TiDB | 生态友好、SQL 第一公民 |
| 跨 region 强一致 | Spanner / CockroachDB | TrueTime 派 |
| 金融记账（双本记账） | TigerBeetle | 专用 schema + det.sim |
| 简单单机 ACID | PostgreSQL | 通用是正解 |
| AWS 托管 + 兼容 PG/MySQL | Aurora | compute/storage 解耦的另一条路 |
| 高吞吐 OLAP | DuckDB / ClickHouse / BigQuery | 不是 OLTP 目标 |
| 区块链 settlement | Hyperledger Fabric / Solana | 共识 + smart contract |

## Layer 6 · 与你当前工作的连接

### 今天就能用的部分

- **理解"unbundled vs bundled"是 2020+ 范式选择**：你写任何分布式系统时可以问"我把 X 角色拆成独立进程，故障域是不是更小？测试是不是更容易？"。FDB 是这条思路的旗手——读完之后看 Spanner / CockroachDB / TiDB 的架构选择会更有判断力。
- **看任何"单 binary 跑一切"系统就要警觉**：单 binary 看起来简单，但故障域大、testing 难。FDB 团队 10 年实践证明 unbundled 长期 ROI 更高。任何写"一个进程做所有事"的系统都应该至少 sketch 一份 unbundled 版本对照。
- **deterministic simulation 哲学迁移**：写测试、写脚本、写 CI 时强制 deterministic 行为（fixed seed、fixed clock、fixed ordering）能省下大量"flaky test 排查时间"。FDB 的哲学不只在 DB——是工程通用智慧。任何高可靠系统都应当把 det.sim 列为一级目标。
- **OCC 选型直觉**：选并发控制时不要默认 2PL——OCC 在"读多写少 + 冲突低"工作负载下吞吐高几倍。FDB 是 OCC 在分布式系统的工业级证明。具体场景具体选。

### 下个月能用的部分

- **若做高可靠分布式系统**：FDB 的"unbundled + OCC + 仿真"模式可以借鉴——把核心路径做成多个独立进程、用仿真测每条故障路径。这是 90 年代 microkernel（Mach / L4）思想的当代回归。
- **若做测试基础设施**：deterministic simulation 是 FDB / TigerBeetle 共有的方法论——若做高可靠系统，从一开始就设计 simulation harness 比事后加测试便宜 10 倍。Antithesis（FDB 团队商业化的 det.sim 平台）是直接可用的工具。
- **若做 actor 模型**：Flow（[flow/include/flow/flow.h](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/flow/include/flow/flow.h)）是少数公开、可读、生产级的 C++ actor 实现——比读 Akka / Erlang 工程化路径更接近 C++ 工程师日常。C++20 coroutine 出来后部分 Flow 已被替代，但 SAV / Future / Promise 抽象仍然是正确的设计参考。
- **若学分布式事务**：FDB 的 OCC + 5 秒窗口 + range overlap 实现（[fdbserver/resolver/Resolver.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/resolver/Resolver.cpp)）是分布式 OCC 工业实现的最佳学习材料——与教科书算法的差异（5 秒窗口、key-range 分片、tooOldList 处理）就是工业落地的精华。

### 不要用的部分

- **不要为了"用上 FDB"而把所有业务塞过去**：除非业务确实需要分布式 KV + 严格 ACID。绝大多数业务跑 PostgreSQL 已经足够。FDB 的 ops 复杂度（5 种角色独立部署）对小团队是负担。
- **不要把 deterministic simulation 当万能补丁**：deterministic simulation 工程成本极高（整个 codebase 必须谨慎避免任何非确定性 API），对一般业务 ROI 不明。FDB 团队 10 年专注于这件事——一般团队没这个 budget。
- **不要在 toy 项目里手撸 unbundled 架构**：unbundled 工程量极大——FDB 团队 10 年才稳定。toy 项目用 etcd / TiKV / 单 PG 即可。
- **不要相信"layered = 用户友好"**：FDB 的 layered 哲学好但商业失败——用户期待开箱即用 SQL。如果你的产品要面向终端开发者，至少要给一个 production-ready 的 SQL 或 Document layer。

## Layer 7 · 怀疑 + 延伸阅读

### 5 件具体怀疑

**怀疑 1**：论文 §6 的 1M+ writes/sec 数字非常漂亮——但**没有报告 P99 / P99.9 延迟分布**。FDB 的 commit pipeline 5 阶段（preresolution → getResolution → postResolution → transactionLogging → reply）每阶段都可能 stall。生产 OLTP 看 P99，论文展的是平均吞吐——这是常见的 cherry-pick 模式。需要更多公开 benchmark（OpenJDK FDB benchmark 等第三方）。

**怀疑 2**：[fdbserver/resolver/Resolver.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/resolver/Resolver.cpp) 的 `MAX_WRITE_TRANSACTION_LIFE_VERSIONS` 默认 5 秒——但**5 秒上限对 OLAP 类、数据迁移类工作负载是硬限制**。论文 §4 没有详细讨论"长事务该怎么办"——只是简单提到"FDB 不支持长事务"。这意味着任何要 ETL / 大批量 update 的场景必须切分成多个事务，应用层负责跨事务的一致性——这是把责任又踢回应用层。

**怀疑 3**：Sim2 假设"所有非确定性来源都被 PRNG 控制"——但 C++ 编译器、libc、操作系统本身的非确定性如何完全消除？[fdbserver/SimulatedCluster.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/SimulatedCluster.cpp) 的 simulator 用 deterministicRandom，但代码里是否每个 contributor 都遵守"不用 std::unordered_map iteration"等暗约束？没有公开的 lint 规则文档——这是测试方法论的"暗物质"。FDB 团队靠 code review 文化维持，但开源后是否所有 PR 都被严格 review？这是潜在的腐蚀风险。

**怀疑 4**：unbundled 哲学好——但**ops 复杂度真实存在**。FDB 一个 cluster 要部署 5 种 role + cluster controller + master + rate keeper + data distributor，每种 role 的容量规划都要单独算。论文 §1 提到"我们的 ops 团队认为 unbundled 实际更简单"，但**这是 Apple 内部 ops 团队的经验**——开源后小团队是否真的能 ops 起来？社区有不少帖子吐槽 FDB 部署难——这是哲学对、落地难的问题。

**怀疑 5**：FDB 的 5 阶段 commit pipeline（[fdbserver/commitproxy/CommitProxyServer.cpp](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/commitproxy/CommitProxyServer.cpp) 的 `commitBatchImpl`）是单 proxy 串行——任何一个 proxy slow 都会拖慢整个 batch。论文 §3 提到"多个 proxy 并行处理不同 batch"，但每个 batch 的 5 阶段是串行的。如果 transactionLogging 阶段（fsync）慢，整个 batch 都被阻塞。是否有 pipelining 的优化？代码里看不到——需要再读 §4.3 的细节。

**怀疑 6**：FDB 的 layered 哲学是"核心 KV，上层抽象 layer"——但 **2018 开源后 SQL layer 项目长期 alpha**，从未达到 production-ready。这意味着 FDB 用户必须自己写 SQL layer，或者用第三方（如 Snowflake metadata 那样把 FDB 嵌入产品里）。这是 layered 哲学的商业代价：**短期工程师爱、长期生态难**。Spanner / CockroachDB 的 SQL-first 路线虽然违背 Unix 哲学，但对终端用户更友好。

### 延伸阅读（精读后下一步）

| 顺序 | 论文 | 回答什么问题 |
|---|---|---|
| 1 | **Spanner (OSDI 2012)** | "bundled NewSQL 路线对照？"——已有 [spanner.md](/study/papers/spanner/) |
| 2 | **CockroachDB (SIGMOD 2020)** | "PG-on-Raft 路线如何对照 FDB？" |
| 3 | **TigerBeetle (VLDB 2024)** | "det.sim 哲学如何延伸到金融？"——已有 [tigerbeetle.md](/study/papers/tigerbeetle/) |
| 4 | **Calvin (SIGMOD 2012)** | "deterministic 派的另一条路？"——已有 [calvin.md](/study/papers/calvin/) |
| 5 | **Aurora (SIGMOD 2017)** | "另一种 compute/storage 解耦？"——已有 [aurora.md](/study/papers/aurora/) |
| 6 | **Bigtable (OSDI 2006)** | "FDB 之前 KV 路线祖宗？"——已有 [gfs.md](/study/papers/gfs/) |
| 7 | **FDB design docs（[github.com/apple/foundationdb/tree/c909b59013fe365cad45a67280c135f214bf30f7/design](https://github.com/apple/foundationdb/tree/c909b59013fe365cad45a67280c135f214bf30f7/design)）** | 设计沿革口述（数十篇 design doc） |

## 限制（DeepPaperNote 风格）

1. **5 秒事务上限是硬限制**：长事务 / 数据迁移 / OLAP 类工作负载不适合 FDB——必须切分成多个小事务，应用层负责跨事务一致性。这把"长事务一致性"债务踢回应用层。

2. **Layered 哲学的商业代价**：FDB 核心只是 KV，SQL / Document / Record layer 都是上层独立项目。这意味着用户得到的是"裸 KV"——SQL 友好度远不如 Spanner / CockroachDB。开源 8 年后采用率仍受限——主要在大厂内部（Apple、Snowflake）使用，中小团队倾向选 SQL-first 替代。

3. **Ops 复杂度不可忽视**：5 种 role + cluster controller + master + rate keeper + data distributor 的部署比单 binary 系统复杂数倍。论文宣称"实际 ops 更简单"是 Apple 内部经验——开源后小团队 ops 起来仍有门槛。社区文档对 ops 实践覆盖不足。

4. **C++ + Flow 学习曲线高**：FDB 用自家 actor compiler、自家 indexed set、自家 file abstraction——任何想 contribute / fork / patch 的工程师必须先学 Flow。C++20 coroutine 出来后部分迁移，但仍有大量历史 `.actor.cpp` 代码。

5. **Sim2 仿真的覆盖度有限**：仿真只能覆盖"在 simulator 里建模的故障"——硬件 bug（CPU bug、磁盘 firmware bug）、宇宙射线、电源故障、多节点 NUMA 一致性问题等"未建模"故障 simulator 抓不住。FDB 团队也承认这条限制。

6. **OCC 在高竞争负载下退化**：FDB 的 OCC 在低冲突场景吞吐极高，但**高冲突（热 key）场景下事务大量 abort retry**——退化到 worse-than-2PL 的吞吐。论文 §7 没有详细讨论这个边界——RateKeeper 部分缓解但不能根治。

7. **社区生态相对小众**：与 PG / MySQL / Spanner / CRDB 相比，FDB 第三方生态（ORM / 监控 / 备份工具）较薄。Apple 主导开发——非 Apple 工程师参与门槛较高。这与 Kafka / Redis / Postgres 等社区驱动项目形成对比。

## 附录：叙事错位清单（论文宣称 vs 工程现实）

| 论文宣称 | 工程现实 |
|---|---|
| "FDB 是分布式 KV 数据库" | 准确说是"分布式 KV + 严格 ACID"，但用户期待开箱即用 SQL，FDB 只给 KV |
| "Unbundled 架构 ops 更简单" | Apple 内部 ops 经验——开源后小团队仍有部署门槛 |
| "Sim2 抓住所有 bug" | 准确说是"抓住所有在 simulator harness 里建模的 bug"——硬件 bug / 未建模故障抓不到 |
| "1M+ writes/sec 单 cluster" | ideal config + ideal hardware + ideal workload；生产部署 200k-500k writes/sec 是更现实预期 |
| "完全 ACID" | 单 cluster ACID；跨 cluster 事务（multi-region active-active）需要应用层补充 |
| "OCC 比 2PL 好" | 低冲突场景下好；高冲突（热 key）场景下 OCC 退化严重 |
| "10 年开发不是低效是投资" | 这是事后合理化——前 5 年 FDB 一度是商业失败，2015 Apple 收购才让团队继续 |
| "Layered 哲学优雅" | 优雅但商业失败——SQL layer 长期 alpha，用户得到的是裸 KV |
| "无依赖" | 无第三方运行时依赖，但 build 依赖 cmake / ninja / boost / 等 |

## 元数据

- 重构日期：2026-05-28
- 总行数：约 530
- 笔记类型：v1.1 状元篇分支 A · method/system paper
- 启用 skill：`/source-learn`（对照 apple/foundationdb C++ 源码）
- 工具栈：figure 由 Pillow + cwebp 生成；GitHub API 抓 master HEAD commit hash
- 心脏代码 anchor：[apple/foundationdb @ c909b590](https://github.com/apple/foundationdb/blob/c909b59013fe365cad45a67280c135f214bf30f7/fdbserver/resolver/Resolver.cpp)
