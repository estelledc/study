---
title: OLTP Through the Looking Glass — 传统数据库的 20 倍开销从哪来
来源: 'Harizopoulos et al., "OLTP Through the Looking Glass, and What We Found There", SIGMOD 2008'
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：给超市收银台套四层「合规外套」

想象你在一家连锁超市当收银员。真正的工作只有三步：查价、改库存、打小票。按理说每单十几秒就能搞定。

但公司规定你必须穿四层外套：

1. **日志外套（Logging）**：每动一次货架，先在中央账本写一条「谁、何时、改了什么」，还要给货架贴序列号（LSN），确保账本和货架永远对得上。
2. **锁外套（Locking）**：改某个 SKU 前，向总部锁管理器申请「这条记录归我改」；改完再释放。申请、登记、释放都要走流程。
3. **闩锁外套（Latching）**：打开共享抽屉（B-tree 页、缓冲池）前，先拿闩锁；多人不能同时翻同一页。
4. **缓冲池外套（Buffer Management）**：数据明明全在内存里，读写仍要经过「页 ID → 缓冲帧 → 页内偏移」三层间接寻址，像明明东西在桌上，却必须先登记进仓库再取出来。

论文作者（Stavros Harizopoulos、Daniel Abadi、Samuel Madden、Michael Stonebraker）把开源数据库 **Shore** 当作这家「穿四层外套的超市」，在 **TPC-C** 子集上逐层剥外套，量每剥一层 CPU 指令数变化。结论惊人：**真正干活的指令只占约 1/60**；剥完四大组件后吞吐从约 **640 TPS 提到约 12,700 TPS（约 20×）**。这篇 SIGMOD 2008 论文直接催生了 **H-Store / VoltDB** 等「去传统包袱」的 OLTP 路线。

---

## 是什么

**OLTP Through the Looking Glass** 不是提出一个新存储引擎，而是一次 **解剖式性能实验**：

- **对象**：Shore Storage Manager（威斯康星大学 1990 年代的开源 OLTP 存储层，设计继承 Gray & Reuter 经典事务处理与 ARIES 恢复）。
- **负载**：TPC-C 的 **New Order** 与 **Payment** 两种事务（约 90% 生产流量形态），5 个 warehouse、约 500MB 数据 **全部预载内存**、**单线程**、无磁盘 I/O 争用。
- **方法**：每去掉或优化一个子系统，都保留 **可运行的完整系统**，用 PAPI 统计 **每条事务的 CPU 指令数**（比 wall-clock 更稳定、可复现）。
- **对照**：自建 **optimal kernel**——手写内存 B-tree、无事务/无恢复的最小内核，代表「有用功」下界。

核心主张：**当 OLTP 数据能放进内存、事务在微秒级完成时，1970 年代为「磁盘慢、内存小、多线程躲 I/O」设计的架构，反而成了主瓶颈。** 且 **没有单一「帐篷里最高那根杆」**——logging、locking、latching、buffer manager、B-tree 杂项各占约 10%–35%。

---

## 为什么 2008 年这件事重要

| 1970s 假设 | 2008 年现实 |
|------------|-------------|
| 数据库 ≫ 内存，必须磁盘驻留 | 廉价 GB 级内存，许多 OLTP 库可全内存 |
| 事务要等磁盘 I/O | 内存命中后，事务 ≈ 几百微秒 CPU |
| 多线程掩盖磁盘延迟 | 无磁盘等待时，多线程带来 latch/锁竞争 |
| WAL + 2PL 是标配 | 集群副本、分区、弱一致性场景下，日志/锁可能是纯开销 |

论文还列举三类 **可替代传统 OLTP 全功能栈** 的架构方向（后文 H-Store 等均属此类）：

- **无日志（Logless）**：靠副本复制状态而非 REDO log（Harbor、C-Store 等思路）。
- **单线程（Single-threaded）**：一核一线程跑事务，多核当多节点；去掉 latch 路径。
- **弱事务（Transaction-less / relaxed）**：最终一致性、快照隔离、或「先读后写、不 abort」的两阶段事务，可省 UNDO 等机制。

---

## 核心概念

### 1. 四大开销组件（按剥离顺序）

论文在 Shore 中大致按此顺序剥离（组件耦合，顺序受代码结构约束）：

| 组件 | 典型占比（New Order 指令） | 在做什么 |
|------|---------------------------|----------|
| **Logging** | ~12% | 组装 log record、维护 LSN、与 buffer 协调 WAL |
| **Locking** | ~16% | 2PL、锁管理器、层次锁（记录→页→库） |
| **Latching** | ~14% | B-tree 页、buffer pool、fix/pin 路径上的短临界区 |
| **Buffer manager** | ~35% | 页式间接访问；内存 resident 时仍走 fix/pin |
| **Hand-coded B-tree 等** | ~16% | 键比较、目录查找、页大小等可优化项 |
| **Useful work** | ~7% | 真正索引查找 + 更新 |

读一条记录在传统路径上典型步骤：**加锁 → fix 页进缓冲池 → 算页内偏移 → pin → 拷贝到用户空间改 → 写回**——每一步都可能触发 log/lock/latch。

### 2. Lock vs Latch（零基础必分清）

- **Lock（锁）**：事务隔离语义，由 **Lock Manager** 管理，有 deadlock 检测，参与 2PL 与日志。
- **Latch（闩锁）**：保护 **物理数据结构**（B-tree 节点、hash 桶），轻量、无 deadlock 检测，程序员保证无死锁。

内存 OLTP 里两者叠加：为改一行，可能既 latch 页又 lock 记录。

### 3. 「有用功」与 Shore 残核

- **Optimal kernel**：~22 μs/事务，~**46,500 TPS**（手写 B-tree，无 Shore 调用栈）。
- **剥光后的 Shore 残核**：~80 μs/事务，~**12,700 TPS**（仍比 optimal 慢约 3.6×，因调用栈深度和无法完全去掉的 transaction/buffer 壳层）。
- **开箱 Shore（内存库 + 日志写盘）**：~**640 TPS**。
- **内存库但不刷 log**：~**1,700 TPS**。

New Order 总指令约 **173 万条/事务**；有用功约 **1/60**。残核约为原始 Shore 的 **1/15 指令**，但仍是有用功的 **~4×**。

### 4. 实验控制变量

- 单机单核 Pentium 4 3.2GHz，1GB RAM，Linux 2.6，gcc -O2。
- 数据库预载内存，`iostat` 验证无磁盘流量。
- 跑 40,000 事务取平均；New Order 固定 10 个 item、仅本地 warehouse，减少随机性。
- Payment：固定按 customer ID 查找、本地 warehouse。

### 5. 与 H-Store / 现代内存 OLTP 的 lineage

论文 Section 2.6 明确：MIT **H-Store** 去掉上述特性可达 **两个数量级**加速。后续商业/开源脉络包括 VoltDB、SAP HANA 思路、SQL Server **Hekaton**（SIGMOD 2013）等——都共享「内存 resident + 减锁减 latch + 编译/专用路径」 DNA。

---

## 代码示例 1：四层「外套」如何包住一次简单更新

下面用 Python 伪代码模拟 Shore 式路径：业务只是 `balance -= amount`，但被 logging / locking / latching / buffer 层层包装。

```python
class LegacyOLTP:
    """类比 Shore：页式缓冲池 + WAL + 2PL + latch"""

    def __init__(self):
        self.buffer_pool = {}      # page_id -> bytes
        self.lock_table = set()
        self.latches = set()
        self.log = []

    def _latch(self, page_id):
        while page_id in self.latches:
            pass  # spin — 真实系统里 CPU 在这里空转
        self.latches.add(page_id)

    def _unlock_latch(self, page_id):
        self.latches.discard(page_id)

    def _lock_record(self, rid):
        if rid in self.lock_table:
            raise RuntimeError("deadlock or wait")
        self.lock_table.add(rid)

    def _unlock_record(self, rid):
        self.lock_table.discard(rid)

    def _fix_page(self, page_id):
        self._latch(page_id)
        if page_id not in self.buffer_pool:
            self.buffer_pool[page_id] = bytearray(8192)
        return self.buffer_pool[page_id]

    def _write_log(self, lsn, page_id, payload):
        self.log.append((lsn, page_id, payload))

    def update_balance(self, page_id, offset, delta, rid, lsn):
        self._lock_record(rid)
        page = self._fix_page(page_id)
        # WAL：先 log 再改页（简化版）
        self._write_log(lsn, page_id, f"delta={delta}")
        # 模拟 slotted page：拷贝到用户空间再写回
        old = int.from_bytes(page[offset:offset+8], "little")
        new_val = old + delta
        page[offset:offset+8] = new_val.to_bytes(8, "little")
        self._unlock_latch(page_id)
        self._unlock_record(rid)


class OptimalKernel:
    """论文中的 minimal kernel：指针直达，无 log/lock/latch/buffer"""

    def __init__(self):
        self.records = {}  # rid -> int

    def update_balance(self, rid, delta):
        self.records[rid] += delta
```

**读代码时的对照**：Legacy 路径里 `_fix_page` + `_write_log` + `_lock_record` 对应论文 Figure 1 中 buffer / logging / locking 大块；Optimal 只有一行算术。论文用真实 Shore + PAPI 证明：这种结构差异在 TPC-C 上会放大到 **20× 吞吐**，而非微优化能抹平。

---

## 代码示例 2：TPC-C Payment 事务的「调用栈深度」对比

论文 Figure 4 给出 Payment 对 Shore 的调用序列。下面用简化 Python 表达 **New Order / Payment 在完整栈 vs 残核** 的差异：

```python
# --- 完整 Shore 风格 Payment（每层都是函数调用 + 管理器交互）---

def payment_shore(tx, district_id, warehouse_id, customer_id, amount):
    tx.begin()                           # 事务管理器：session、监控
    d = tx.btree_lookup("district", district_id)
    tx.pin(d); tx.lock(d, mode="X")

    w = tx.btree_lookup("warehouse", warehouse_id)
    tx.pin(w); tx.lock(w, mode="X")

    c = tx.btree_lookup("customer", customer_id)
    tx.pin(c); tx.lock(c, mode="X")

    tx.update_record(c, field="balance", delta=-amount)   # log + buffer
    tx.update_record(d, field="ytd", delta=amount)
    tx.update_record(w, field="ytd", delta=amount)
    tx.create_record("history", {...})                    # 又一次 log/alloc

    tx.commit()                          # flush log、释放锁、写 prepare 记录


# --- 剥光后的「残核」风格：直接指针 + 无 recovery ---

def payment_stripped(store, district_id, warehouse_id, customer_id, amount):
    d = store.districts[district_id]
    w = store.warehouses[warehouse_id]
    c = store.customers[customer_id]

    c.balance -= amount
    d.ytd += amount
    w.ytd += amount
    store.history.append(HistoryRow(...))  # 单次 append，无 WAL
```

Payment 在论文中比 New Order 简单（3 次 lookup + 3 次 update + 1 insert），但 **locking 仍占约 25% 指令**——因为 pin/unpin、commit 都要碰锁管理器。这说明：**即使「业务逻辑轻」，传统栈的固定税仍然很重。**

---

## 剥离实验的关键数字（便于记忆）

```
开箱 Shore（内存 + 日志写盘）     ~640 TPS
去掉 log 刷盘（仍组装 log）       ~1,700 TPS
剥光四大组件后的 Shore 残核       ~12,700 TPS   ← 约 20×
Optimal 手写 B-tree 内核          ~46,500 TPS   ← 「有用功」上界
```

New Order 指令分解（Figure 1 近似）：

```
buffer manager      ████████████████████  34.6%
hand-coded B-tree   ████████              16.2%
locking             ████████              16.3%
latching            ███████               14.2%
logging             ██████                11.9%
useful work         ███                    6.8%
```

---

## 论文方法论：为什么「逐层剥」而不是只 profiling

只做 profiler 会告诉你「锁管理器很热」，但不会证明 **去掉它系统仍正确且快多少**。作者坚持：

1. 每步修改后系统 **仍能跑完 TPC-C 子集**；
2. 用 **CPU 指令数** 做可复现的横向对比；
3. 与 **optimal kernel** 对照，分离「架构税」与「实现税」。

这对今天做性能分析仍有启发：**先量化固定架构成本，再谈算法或索引优化。**

---

## 局限与 2026 年读这篇论文的视角

- **单线程基准**：多线程下 latch/锁开销通常 **更高**；论文有意避开线程争用， isolating 组件成本。
- **Shore 非商业引擎**：残核仍比 optimal 慢 3–4×，说明 **调用栈与模块边界** 本身有代价；商业库（Oracle、SQL Server）内部路径更复杂，但定性结论仍成立。
- **并非主张去掉 ACID**：论文讨论的是 **在可分区、可副本、可弱一致** 的场景下，全功能栈是否过度；银行核心账仍需要 log + 2PL。
- **后续工程**：Hekaton、Aurora 存储分离、TiKV/Rocks 等把 log 做成流水线；**开销从「有没有」变成「能不能摊薄、能不能 bypass」**，但 looking-glass 的 **分解框架** 仍适用。

---

## 与相邻论文/系统对照

| 系统/论文 | 与 looking-glass 的关系 |
|-----------|-------------------------|
| **H-Store / VoltDB** | 论文直接预言；分区 + 单线程执行 + 无传统 buffer/2PL |
| **Hekaton (2013)** | SQL Server 内嵌内存引擎；原生编译 + latch-free 索引 + O-MVCC |
| **WiscKey / LSM** | 不同问题（KV 分离键值）；同样质疑「通用页式栈」 |
| **Aurora** | Log 即数据库；把 WAL 从实例内 buffer 路径中剥离 |

---

## 零基础自检清单

读完后应能回答：

1. **OLTP 传统四件套**是什么？（B-tree/heap、2PL、WAL、buffer pool）
2. **Lock 和 Latch** 分别保护什么？
3. 为什么 **内存足够大** 时 buffer manager 仍是最大单项开销之一？
4. 论文 **640 → 12,700 TPS** 对比控制了什么变量？（预载内存、单线程、TPC-C 子集）
5. **有用功 1/60** 说明什么？（多数 CPU 花在「数据库机制」而非业务逻辑）
6. 这篇论文和 **H-Store** 的关系？

---

## 延伸阅读

- 原文 PDF：[CMU 15-721 课程副本](https://15721.courses.cs.cmu.edu/spring2020/papers/02-inmemory/hstore-lookingglass.pdf)
- ACM DOI：[10.1145/1376616.1376713](https://dl.acm.org/doi/10.1145/1376616.1376713)
- 后续系统：H-Store → VoltDB；同团队 Hekaton 论文（本库 `hekaton.md`）
- 基准：TPC-C 规范 — 理解 New Order / Payment 访问模式

---

## 一句话总结

**OLTP Through the Looking Glass** 用「给 Shore 逐层剥壳」证明：当数据已在内存里时，logging、locking、latching、buffer management 吞掉了绝大部分 CPU，真正业务逻辑只是冰山一角；这不是某个实现 bug，而是 **为磁盘时代设计的架构在内存时代的系统性过剩**——理解这一点，是读懂 H-Store、Hekaton 及现代内存 OLTP 的起点。
