---
title: Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式
来源: 'Goetz Graefe, Volcano 系统系列工作 1989-1994（博士论文 + IEEE TKDE 1994 期刊版）'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

Volcano 不是一个单独的算法，是一套**把 SQL 执行器拆成两个正交问题**的思想框架。日常类比：像**乐高积木 + 一种特殊的传送带**——每块积木（算子）只管自己干活，传送带（Exchange）单独负责'让多份积木同时干、再把结果汇起来'。两件事互不知道彼此存在。

它的两条主轴：

1. **算子可组合**：任何算子都实现 `Open / Next / Close` 三函数。Filter 不知道下面是 Scan 还是 Join，Join 也不知道上面是 Sort 还是 Project——所有算子像同型号的乐高接口。
2. **并行可分离**：把'多线程 / 数据切分 / 进程间通信'全部塞进**一个**叫 Exchange 的特殊算子。其他算子完全不知道自己在并行执行；并行性是 Exchange 单独承担的关心。

正因为这两件事被掰开了，Volcano 之后 36 年里，PostgreSQL / Oracle / Spark / DuckDB 加新算子或换并行策略时，**几乎不用改其他算子**——这是范式级别的回报。

## 为什么重要

不理解 Volcano 框架，下面这些事都没法解释：

- 为什么 PostgreSQL 加并行查询（v9.6）只新增了 `Gather` 一个算子，几百个其他算子完全没动
- 为什么 Spark 的 shuffle 写在 RDD 边界、不写在 map / filter 算子里——这是 Exchange 思想的 RDD 翻译
- 为什么教材把'优化器'和'执行器'分开讲——Volcano 把执行器侧的可扩展接口与并行封装讲清楚（优化器分离可追溯到 System R）
- 为什么 DuckDB 这种'反 Volcano'引擎的论文，每篇都从 Volcano 讲起——它是讨论起点

## 核心要点

Volcano 框架可以拆成 **三块支柱**：

1. **三函数迭代器协议**：`Open()` 准备资源，`Next()` 吐一行（或返回 EOF），`Close()` 收尾。算子之间只能假设对方实现了这三个函数，不能假设对方是哪种算子。

2. **Exchange 算子封装并行**：Exchange 自己 fork N 个 worker 跑下游子树、收 tuple 进队列、按需吐给上游。上下游算子都被'欺骗'——上游以为下游是单线程在产数据，下游以为自己单线程在跑。

3. **机制 vs 策略分离**：执行器内核只负责'怎么跑'（机制），优化器负责'跑哪条 plan'（策略）。同一个执行器内核可以驱动关系代数、对象代数、流式代数——只要把算子库换一套。

三块加起来的关键性质：**正交**。改一块不动其他块。

## 实践案例

### 案例 1：PostgreSQL 加并行只动一个算子

PostgreSQL 9.6（2016）首次支持并行查询。设计选型记录在 [`postgres/postgres@e2b3573/src/backend/executor/nodeGather.c`](https://github.com/postgres/postgres/blob/e2b35735b00181ba098d102d6504978a61fab983/src/backend/executor/nodeGather.c)：新增 `Gather` 算子（= Volcano Exchange 的 N→1 模式），`HashJoin` / `NestLoop` / `Sort` 全部**一行没改**。

```c
// 简化伪代码：Gather 算子的 Next()
TupleTableSlot *ExecGather(GatherState *node) {
    if (!node->initialized) {
        LaunchParallelWorkers(...);   // 第一次调 Next 时才 fork
        node->initialized = true;
    }
    return gather_getnext(node);     // 从 worker 队列拉一条
}
```

**Volcano 教训直接落地**：并行性是 Exchange/Gather 单独承担的关心。

### 案例 2：写一个 Python 片段见证'并行透明'

```python
from queue import Queue
import threading

class Scan:  # 最小 child：吐完 rows 就 EOF
    def __init__(self, rows): self.rows, self.i = list(rows), 0
    def open(self): pass
    def get_next(self):
        if self.i >= len(self.rows): return None
        t = self.rows[self.i]; self.i += 1; return t
    def close(self): pass

class Exchange:
    """N 个 worker 各跑一份 child，主线程从队列拉。"""
    def __init__(self, child_factory, n=2):
        self.child_factory, self.n = child_factory, n
        self.q, self.done = Queue(maxsize=64), 0
        self.lock = threading.Lock()
    def _worker(self):
        op = self.child_factory(); op.open()
        while (t := op.get_next()) is not None: self.q.put(t)
        op.close()
        with self.lock:
            self.done += 1
            if self.done == self.n: self.q.put(None)
    def open(self):
        self.threads = [threading.Thread(target=self._worker) for _ in range(self.n)]
        for th in self.threads: th.start()
    def get_next(self): return self.q.get()
    def close(self):
        for th in self.threads: th.join()

# 用法：ex = Exchange(lambda: Scan([1,2,3])); ex.open(); ...
```

**逐部分解释**：

- `Scan`：最小三函数算子，吐完列表返回 `None`（EOF）
- `child_factory`：工厂函数，每个 worker `()` 出自己的子树，避免多线程共用一个算子
- `open` / `_worker` / `get_next`：开 N 线程产数据入队；上游只拉队列，看不出并行

### 案例 3：流处理框架其实是分布式 Volcano

把 Flink 流水线写成伪代码，对照 Volcano：

```text
source → map → [network shuffle] → reduce → sink
   ↑       ↑            ↑              ↑
 算子    算子     ≈ Exchange(TCP)     算子
```

**逐步对照**：

1. 先认整条算子链 = Volcano 算子树（每段仍是 Open/Next/Close）
2. 再圈出 `[network shuffle]` = Exchange 的跨机器版（TCP 队列代替内存队列）
3. watermark（事件时间水位线）/ checkpoint（定期存档）= Volcano 没解、工程必须补的容错维度

## 踩过的坑

1. **以为 Exchange 在分布式自动适用**：Volcano 假设单机共享内存队列。把它套到跨机器场景，TCP 延迟从 ns 跳到 ms、worker 崩溃要全 plan 重跑——Spark RDD 重新发明 DAG scheduler 的根本原因，就是 Exchange 模型在分布式下水土不服。

2. **以为'三函数迭代器'是协议要求**：很多人把'一次返回一行'当成硬规定。其实接口可不变、粒度换成 chunk（一批行），就能吃到 SIMD（一次算多条数据）收益——DuckDB 走的路。

3. **在算子里偷偷写并行控制**：'HashJoin 自己开两个线程'违反 Exchange 不变式——新并行算子要重写、调度散落、debug 噩梦。核心教训是抗拒这个诱惑。

4. **拿 Volcano cost model 评估向量化引擎**：粒度差约 2048 倍，cost 公式不可比；迁移时常见'看起来变慢了'误判。

## 适用 vs 不适用场景

**适用**：
- 任何'算子链 + 数据流'结构的系统：SQL 执行器 / 流处理 / ETL / dataflow 工具
- 单机或共享内存并行：算子树 + Exchange 直接落地，工程量极小
- 需要算子库可扩展：加新算子 = 写一个 struct + 三函数，不动其他算子
- 教学场景：50 行 Python 就能复现核心思想，门槛极低

**不适用**：
- 跨机器分布式 + 高可用：没回答容错，需补 DAG scheduler / lineage（按血缘重算）
- 极致 OLAP：1 行粒度吃不满 SIMD，要切向量化或编译执行
- 点查 / OLTP 硬上 push-based（数据主动往上推，不是上游来拉）：source 一推就是 chunk，撤不回来——拉式 Volcano 更优
- 流处理 watermark / 状态：Volcano 不假设 input 有时间维度

## 历史小故事（可跳过）

- **1989**：Goetz Graefe 在科罗拉多大学博尔德分校博士在读，研究方向是'查询执行器的可扩展性'。
- **1990**：Graefe 完成博士论文《Volcano: An Extensible and Parallel Dataflow Query Processing System》，第一次把'算子可组合 + 并行可分离'两件事拼到一起。
- **1994**：IEEE TKDE 期刊版发表，30 页双栏；截至近年 Google Scholar 引用约 2700+，属执行器领域高引论文。
- **1995**：Graefe 在微软研究院发表 Cascades 论文，把 Volcano 优化器部分进一步形式化。微软 SQL Server / Calcite / Greenplum ORCA 用的都是 Cascades + Volcano 执行器。
- **2005**：Boncz 等人发表 MonetDB X100，第一次系统挑战 Volcano 的 1-tuple 粒度——但保留接口、只换粒度。

## 学到什么

1. **'掰开两个正交问题'是范式级杠杆**：Volcano 的全部价值不是某个具体算法，是把'算子组合'与'并行调度'分开这一刀。设计任何复杂系统时都该先问'有没有两件事正在被搅在一起'。
2. **接口稳定 36 年的代价是粒度过时**：1 tuple 在 1990 是合理选择，2005 后变成显著开销。**接口对 ≠ 粒度对**——这是面对长寿设计要警惕的细分维度。
3. **正交分离让生态可演化**：Volcano 之后所有改进都只动一块（Cascades 改优化器 / X100 改粒度 / HyPer 改控制流），不动其他块就能落地——这是范式被验证'抗腐烂'的标志。
4. **可读性 = 长期影响力的乘数**：Volcano 论文 30 页、Python 50 行可复现核心思想——读得懂的论文才会被持续引用、被持续改进。

## 延伸阅读

- 视频教程：[Andy Pavlo CMU 15-721 Lecture 12 — Vectorization vs Compilation](https://15721.courses.cs.cmu.edu/spring2024/)（一节课讲清 Volcano 派、向量化派、编译派的分歧）
- 论文 PDF：[Volcano IEEE TKDE 1994 期刊版](https://paperhub.s3.amazonaws.com/dace52a42c07f7f8348b08dc2b186061.pdf)（30 页，Section 3 算子参考 + Section 4 Exchange 必读）
- 配套代码：[`postgres/postgres/src/backend/executor`](https://github.com/postgres/postgres/tree/master/src/backend/executor)（C 实现 Volcano 模型 36 年实战版）
- 对照阅读：[MonetDB X100 CIDR 2005](https://www.cidrdb.org/cidr2005/papers/P19.pdf)（向量化派宣言）+ [HyPer VLDB 2011](https://15721.courses.cs.cmu.edu/spring2016/papers/p539-neumann.pdf)（编译派宣言）
- [[volcano-1994]] —— 同一系列里聚焦 1994 期刊版与三函数协议的姊妹笔记
- [[selinger-1979]] —— Volcano 优化器的直接前作，定义 cost-based 范式

## 关联

- [[volcano-1994]] —— 1994 TKDE 期刊版的细读：三函数迭代器协议本身
- [[selinger-1979]] —— System R 优化器，Volcano Section 6 的直接前作
- [[cascades-1995]] —— Graefe 自己的优化器后续：top-down memo + branch-and-bound
- [[bigtable]] —— 大规模分布式存储，与 Volcano 的'算子正交'思想一脉相承
- [[bernstein-1981-cc]] —— 并发控制经典，与 Volcano 的执行模型形成数据库内核两条主线
- [[aries-1992]] —— 恢复算法经典，Volcano 没解的容错维度的工业答卷

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[efficient-compile-2011]] —— Efficient Compile 2011 — 把 SQL 查询编译成贴近 CPU 的机器码
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[leis-2015-optimizers]] —— Leis 2015 — 用真实数据打脸所有数据库的查询优化器
- [[morsel-driven-2014]] —— Morsel-Driven Parallelism — 把 SQL 查询切成小口分给多核
- [[paxos]] —— Paxos — 分布式共识算法
- [[selinger-1979]] —— Selinger 1979 — 基于代价的查询优化
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[velox-meta-2022]] —— Velox — Meta 统一执行引擎
- [[polars]] —— Polars — Rust 写的列存 DataFrame
