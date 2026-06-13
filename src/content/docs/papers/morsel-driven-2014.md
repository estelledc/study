---
title: Morsel-Driven Parallelism — 面向 NUMA 的查询并行执行框架
来源: https://db.in.tum.de/~leis/papers/morsels.pdf
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：流水线不是开工前分好工位

想象一条**大型装配线**要组装三万个零件。老办法叫 **plan-driven（计划驱动）**：厂长在上班前就把 32 个工位固定分好——「你只做 A 段、他只做 B 段」，中间用传送带（Exchange 算子）把半成品运来运去。听起来很工业，但现实中经常出问题：

- 某个工位零件特别难加工（数据倾斜），其他工位空转等它；
- 新来一批急单，没法从长单里「临时抽人」；
- 零件仓库在厂区**不同楼栋**（NUMA 节点），工人跨楼取料比在本楼慢好几倍，计划里却没人管「就近取料」。

**Morsel-driven（一口驱动）** 换了一种调度哲学：把活切成固定大小的一口（**morsel**，论文里典型约 **10 万行**），中央调度员（**dispatcher**）在**运行时**把下一口分给空闲工人。工人一次跑完**整条算子流水线**（直到 **pipeline breaker**），吃完一口再要下一口。忙的人可以去「偷」别的 NUMA 节点上的活（**work-stealing**），但调度员会**优先**把本节点上的 morsel 分给本节点上的线程。

这篇 SIGMOD 2014 论文（Leis、Boncz、Kemper、Neumann，TUM + CWI）为 HyPer 主内存数据库设计了这套框架。TPC-H / SSB 上 32 核平均加速比 **30× 以上**，核心贡献不是某个 Join 算法，而是**并行调度架构**本身。

---

## 这篇论文在解决什么问题

### 1. Plan-driven 并行在 many-core 上不再扩展

传统 Volcano 式并行：优化器在**编译期**决定开多少线程，每个线程跑一份子计划，Exchange 算子负责路由。问题：

| 痛点 | 原因 |
|------|------|
| **负载不均** | 中间结果大小难预测；现代乱序 CPU 上「等量工作」也不等于「等时完成」 |
| **上下文切换** | 为调整并行度频繁建/杀线程成本高 |
| **Exchange 分区开销** | 为隐藏并行而做的 on-the-fly 分区不一定划算 |

### 2. NUMA：机器内部变成了「慢速网络」

内存控制器下沉到各 CPU socket 后，访问**远端节点** RAM 的延迟和带宽都差于本地。若线程在 socket 0 上跑、数据在 socket 3，再强的算力也被内存拖垮。Plan-driven 的 Exchange 分区能部分缓解，但论文认为：**调度层直接 NUMA-aware 更灵活**。

### 3. 主内存数据库让 CPU 成为真正瓶颈

表全在内存里，查询不再 I/O bound，many-core 的算力必须被**细粒度、弹性**地用起来——这正是 morsel 粒度调度的动机。

---

## 核心概念

### 1. Morsel（一口）

输入表或中间结果被切成约 **100,000 行**（可配置，论文实验显示 >10,000 即可摊销调度开销）的固定大小片段。Morsel 的目的**不是**像 Vectorwise 那样保证 L1 缓存命中，而是：

- 提供**抢占边界**（preemption at morsel boundaries）；
- 支持 **work-stealing** 与负载均衡；
- 让并行度在**单条查询执行过程中**可增可减（**elasticity**）。

### 2. Pipeline 与 Pipeline Breaker

查询被优化器拆成若干 **pipeline**（无中间物化的算子链）。例如三表 Join `R ⋈ S ⋈ T` 常见三条 pipeline：

1. Scan/filter **T** → build `HT(T)`
2. Scan/filter **S** → build `HT(S)`
3. Scan/filter **R** → probe `HT(S)`、`HT(T)` → 输出

**Pipeline breaker**：必须物化中间状态的地方（如 hash build 完成前不能 probe）。`QEPobject` 负责依赖：probe pipeline 要等两个 build 都结束才进入 dispatcher 待执行队列。

### 3. Dispatcher（调度员）

- 为每个**硬件线程**预创建并**绑定（pin）**一个 worker，不因查询增减线程；
- **任务** = `(pipeline_job, morsel)`：在某一口数据上跑整条 pipeline 代码；
- 实现为**无锁数据结构**，由**请求工作的 worker 自己执行**调度逻辑——没有单独的调度线程抢核；
- 三个目标：**NUMA-local 分配**、**全弹性并行度**、**负载均衡**（同 pipeline 的 worker 在「photo finish」意义上最多差一个 morsel 的时间）。

### 4. NUMA-local 物化

Build 阶段常拆两相：

1. **Phase 1**：各线程把过滤后的元组写入**本 socket 的 thread-local 存储区**（无锁）；
2. **Phase 2**：各线程扫描**本 socket 存储区**，用 CAS 插入**全局 hash 表**（表本身 interleave 到各节点，避免热点 socket）。

Probe 结果同样写入 NUMA-local 缓冲区，供后续算子继续本地扫描。

### 5. 与 Volcano / 其他并行模型的对比

| 维度 | Plan-driven Volcano | Morsel-driven |
|------|---------------------|---------------|
| 并行度决定时机 | 优化器编译期 | 运行时 dispatcher |
| 算子是否感知并行 | 通常不感知（Exchange 封装） | 算子需支持 morsel-wise 各阶段 |
| 共享状态 | 尽量避免，靠 Exchange 分区 | Hash 表等共享，靠 lock-free |
| 抢占 | 难 | Morsel 边界自然抢占 |
| 多查询资源分配 | 较僵硬 | 可在 morsel 边界把核让给高优先级查询 |

### 6. 表布局：NUMA-aware 分区

基表按 join key 的 hash **分散到各 NUMA 节点**（如 TPC-H 的 `orders` / `lineitem` 按 `orderkey`），使常见 join 的匹配元组倾向于同 socket。这是**性能提示**，不是硬隔离——work-stealing 仍可能跨 socket，但大多数扫描保持本地。

---

## 代码示例 1：极简 Morsel 调度循环（教学伪代码）

下面用 Python 风格伪代码展示 dispatcher + worker 的核心循环，省略 NUMA 颜色与多 pipeline 依赖：

```python
MORSEL_SIZE = 100_000

class Dispatcher:
    def __init__(self, num_workers):
        self.morsel_queues = {}  # socket_id -> deque of (job_id, morsel_range)
        self.pending_jobs = []   # 满足依赖的 pipeline jobs
        self.lock_free_steal = WorkStealingDeque()

    def request_task(self, worker):
        """Worker 在完成一口后调用；调度逻辑跑在 worker 核上。"""
        socket = worker.socket_id
        task = self._pop_local_morsel(socket)
        if task is None:
            task = self._steal_from_other_socket(worker)
        return task  # (pipeline_fn, start_row, end_row) or None

    def _pop_local_morsel(self, socket):
        q = self.morsel_queues.get(socket)
        if q and len(q) > 0:
            return q.popleft()
        return None

    def _steal_from_other_socket(self, worker):
        # 优先从拓扑上更近的 socket 偷活
        for remote in worker.nearest_sockets():
            if self.morsel_queues[remote]:
                job, (lo, hi) = self.morsel_queues[remote].popleft()
                return (job, lo, hi)
        return None


def worker_loop(worker, dispatcher, compiled_pipelines):
    while True:
        task = dispatcher.request_task(worker)
        if task is None:
            break  # 当前 query 的该 pipeline 已无 morsel
        job_id, (start, end) = task
        pipeline_fn = compiled_pipelines[job_id]
        # 一口内跑完整条 pipeline（JIT 生成的机器码）
        pipeline_fn(input_scan=start, input_end=end,
                    local_output=worker.numa_local_buffer)
        # morsel 边界：可在此检查 query 是否被取消、是否让出核给高优先级查询
```

要点：**并行度** = 同时有多少 worker 在各自 morsel 上跑同一 `pipeline_fn`，而不是计划里写死的 `DOP=16`。

---

## 代码示例 2：Lock-free Tagged Hash 插入（论文 Figure 7）

Hash join build 第二阶段，多线程 CAS 插入带 **tag** 的指针，probe 时可先比 tag 再遍历链，减少 cache miss：

```c
// 简化自论文 Figure 7：16 bit tag + 48 bit pointer 打包在一个槽位
typedef uint64_t HashSlot;

static inline uint64_t tag_from_hash(uint64_t hash) {
    return (hash >> 48) & 0xFFFF;  // 示意：取高位作 tag
}

void insert(HashSlot *hashTable, Entry *entry, int hashTableShift) {
    uint64_t slot = entry->hash >> hashTableShift;
    for (;;) {
        HashSlot old = hashTable[slot];
        entry->next = remove_tag(old);
        uint64_t new_tag = tag_from_hash(entry->hash) | (old & TAG_MASK);
        HashSlot new_val = pointer_to_slot(entry) | new_tag;
        if (CAS(&hashTable[slot], old, new_val))
            break;
        // CAS 失败则重试（另一线程同时插入同槽）
    }
}
```

这与 Bloom filter 式 early rejection 类似，但 tag **嵌在指针里**，一次 CAS 同时更新链头与 filter 位，且无额外内存访问。

---

## 代码示例 3：Hash Join Build 两阶段（C++ 风格骨架）

```cpp
// Phase 1: 无同步，写入 thread-local / NUMA-local 缓冲区
void build_phase1(Morsel m, LocalBuffer& buf, Predicate pred) {
    for (row_id r = m.begin; r < m.end; ++r) {
        if (pred(table[r]))
            buf.append(table[r]);  // 仅 touch 本地 RAM
    }
}

// Phase 2: 已知精确行数，一次分配完美大小 hash 表，再 CAS 插入
void build_phase2(LocalBuffer& buf, GlobalHashTable& ht) {
    ht.allocate_exact(buf.size());  // 无动态扩容
    for (Tuple& t : buf)
        ht.insert_lockfree(&t);
}
```

Probe pipeline 对每个 R 的 morsel 调用 `probe(ht_s, ht_t)`，结果写入该 worker 的 NUMA-local 输出区——与 Figure 3、Figure 4 一致。

---

## 弹性调度：多查询共享固定线程池

论文 Section 5.4 演示：长查询执行中插入短查询，dispatcher 可在 **morsel 边界**把大部分核重新分配给短查询；短查询结束后，长查询重新占满核。无需 OS 杀线程，也无需 plan 里预留 `DOP`。

当前 HyPer 实现中查询**同优先级**时均分线程；优先级调度在论文发表时仍在开发中，但架构已支持。

---

## 实验结论（论文 Section 5 摘要）

- **TPC-H** 全 22 条查询、**SSB**（星型模式基准）上绝对性能与扩展性均优；
- **32 核**平均加速比 **>30×**（相对单线程）；
- Morsel 大小在 10K–100K 区间对吞吐不敏感，主要影响调度频率与响应时间；
- 与 radix join 等专用算法相比，单表 hash join 在复杂查询（多小维表 + 大事实表 probe）中更「好组队」，TPC-H 中 **97.4%** join 元组在 probe 侧。

---

## 与后续系统的关系

| 系统 / 项目 | 关联 |
|-------------|------|
| **HyPer** / **Umbra** | 论文原始实现与商业延续 |
| **DuckDB** | 向量化 + pipeline 并行，思想谱系相近 |
| **Velox** | Meta 统一执行引擎，同样强调 pipeline 与并行算子 |
| **MonetDB/X100、Vectorwise** | 向量传递；morsel 侧重调度而非 cache 行宽 |

读 Velox 或 DuckDB 源码里的 `Task`、`Pipeline`、`PartitionedOutput` 时，可以对照本文的 **dispatcher / morsel / pipeline breaker** 三角关系。

---

## 零基础自检清单

读完后应能回答：

1. **Morsel 和 Vectorwise 的 vector 有何不同？** — Morsel 为调度与抢占服务，不强制 cache 对齐。
2. **为何 hash build 要两阶段？** — Phase 1 无锁本地物化；Phase 2 已知基数可完美定长 hash 表。
3. **Dispatcher 为何不是独立线程？** — 避免占核与锁竞争；worker 自取任务时执行无锁调度代码。
4. **Work-stealing 何时触发？** — 本 socket morsel 耗尽时，从其他 socket 偷；远端访问仅用于负载均衡，非常态。
5. **与 plan-driven 的本质区别？** — 并行度与任务划分在**运行时**决定，而非优化器写死在物理计划里。

---

## 执行模型一览

```
SQL → 优化器 → 物理计划
                    ↓
         按 Pipeline Breaker 切分 Pipeline
                    ↓
    每个 Pipeline 的输入表 → 划分为 Morsel（~10⁵ 行）
                    ↓
         Dispatcher 分配 (Pipeline, Morsel) 给 Worker
                    ↓
    Worker: 编译后的 pipeline 代码处理一口 → 直到 Breaker
                    ↓
         Breaker 完成 → 下一 Pipeline 进入待调度队列
```

---

## 论文信息

| 字段 | 内容 |
|------|------|
| 标题 | Morsel-Driven Parallelism: A NUMA-Aware Query Evaluation Framework for the Many-Core Age |
| 作者 | Viktor Leis, Peter Boncz, Alfons Kemper, Thomas Neumann |
| 会议 | SIGMOD 2014, Snowbird, UT |
| 页码 | 743–754 |
| DOI | [10.1145/2588555.2610507](https://doi.org/10.1145/2588555.2610507) |
| PDF | [https://db.in.tum.de/~leis/papers/morsels.pdf](https://db.in.tum.de/~leis/papers/morsels.pdf) |
| 系统 | HyPer（TUM 主内存 HTAP 数据库） |

---

## 延伸阅读

- 论文原文：[Morsel-Driven Parallelism (PDF)](https://db.in.tum.de/~leis/papers/morsels.pdf)
- HyPer 编译执行：[Efficiently Compiling Efficient Query Plans for Modern Hardware (VLDB 2011)](https://db.in.tum.de/~leis/papers/compilation.pdf)
- CMU 15-721 调度专题讲义中的同一 PDF 导读
- 对比阅读：Volcano/Graefe 模型、Exchange 算子、NUMA 架构基础（socket / local vs remote memory）

---

## 一句话总结

**Morsel-driven parallelism** 把查询并行从「计划里写死多少线程」改成「运行时按一口口数据弹性分配固定 worker 池」，并让调度、物化与 hash 等共享结构都 **NUMA-aware**——这是 many-core 主内存时代查询引擎从「能并行」走向「并行度可扩展、可抢占、可混部多查询」的关键架构 shift。
