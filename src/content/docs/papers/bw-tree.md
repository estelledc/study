---
title: Bw-Tree — 面向新硬件的无锁 B 树索引
来源: 'Levandoski, Lomet & Sengupta, "The Bw-Tree: A B-tree for New Hardware Platforms", ICDE 2013'
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：图书馆目录卡 + 便利贴，而不是当场改书

想象你在管理一座**超大图书馆**的目录系统。传统 B-tree 像**带锁的卡片柜**：

- 要找一本书，先拿柜门钥匙（latch），打开某一格抽屉（页），在里面翻卡片。
- 有人要改目录，必须把整张卡片抽出来重写（**原地更新**），其他人只能排队等。
- 卡片柜固定每格 100 张（固定页大小），一满就必须立刻拆成两格（split），哪怕当时很忙。

Bw-Tree（Microsoft 内部戏称 **Buzz Word Tree**）换了一套规则：

1. **目录柜没有锁**：任何人随时可读；写的人只在**自己的便利贴**上改，最后用原子操作把「当前版本指针」拨到新位置。
2. **不改旧卡片，只贴便利贴**：每次 insert/delete 不是改原页，而是在页顶** prepend 一条 delta（增量记录）**，像「Δ: 插入《数据库系统》第 3 版」。
3. **柜子上只有编号，不绑死物理位置**：每个逻辑页有一个 **mapping table 槽位**，里面存的是「当前物理地址指针」；换页、换 delta 链，只改这一个指针。
4. **后台再整理**：便利贴太多时，工作人员把 delta 全部合并成一张** consolidated page（ consolidated 页）**，搜索变快、内存变省。
5. **落盘像写日志**：Flash 擅长顺序写、讨厌随机写；Bw-Tree 的 **LSS（Log-Structured Store）** 把页变更顺序追加到日志，而不是随机改旧块。

论文发表于 **ICDE 2013**（Justin Levandoski、David Lomet、Sudipta Sengupta，Microsoft Research）。它是 SQL Server **Hekaton** 内存 OLTP 引擎的有序索引（范围扫描），也是 LLAMA 存储栈的核心组件。设计目标直指 2010 年代两大硬件趋势：**多核大内存**（消除 latch 竞争、提高 cache 命中）和 **Flash/SSD**（顺序写、降低写放大）。

---

## 是什么

**Bw-Tree** 是一种 **latch-free（无闩锁）的 B-tree 变体**，在逻辑上仍是 B-tree（键有序、支持 range scan），但在实现上做了三层 radical redesign：

| 层次 | 传统 B-tree | Bw-Tree |
|------|-------------|---------|
| 并发 | 页 latch / 闩锁 | 无 latch；CAS 安装 delta |
| 更新 | 原地改页内记录 | **Delta record** 链式追加 |
| 寻址 | 指针直接指向页 | **Mapping table** 间接寻址 |
| 页大小 | 固定（如 8KB） | **Elastic**（可弹性增长，方便时再 split） |
| 持久化 | 随机写页 | **Log-structured** 顺序追加 |

一句话：**逻辑页 ID 不变，物理内容通过 delta 链演化；用 mapping table + CAS 让并发写「只碰一个槽位」，读路径无锁前进。**

---

## 为什么重要

如果你只学过 textbook B-tree + InnoDB 页锁，Bw-Tree 解释了 Hekaton / 现代内存数据库里一个反直觉事实：

> **多核加到 16、32 核之后，索引吞吐有时不升反降——瓶颈从「算力」变成「抢同一把页锁」。**

论文与后续 SIGMOD 2014 演示表明，在 Xbox Live Primetime、企业去重等真实 workload 下，Bw-Tree 作为独立 KV 存储可比 BerkeleyDB 快约 **19×**，比 latch-free skiplist 快约 **3×**（具体倍数随 workload 变化）。它把三件事绑在一起：

1. **无阻塞并发**：worker 线程不因 latch 睡眠，减少上下文切换。
2. **Cache 友好**：不原地改大页，减少 cache line 失效（false sharing）。
3. **Flash 友好**：LSS 顺序写，规避 SSD 随机写性能悬崖。

后续 OpenBw-Tree（CMU SIGMOD 2018）指出：Microsoft 原始论文**省略不少实现细节**，正确实现 CAS + epoch GC + split 并不 trivial——但 Bw-Tree 仍是理解「无锁索引 + log-structured 存储」的 canonical 设计。

---

## 核心概念

### 1. Mapping Table（映射表）

每个**逻辑页**有一个固定下标 `page_id`，mapping table\[page_id\] 存当前 **physical pointer**（指向 delta 链头或 consolidated 页）。

- 搜索从根开始：读 mapping table → 拿到物理地址 → 沿 B-tree 孩子指针（也是 logical id）向下。
- 更新某页时，**只 CAS 这一格的指针**，不影响其他页——这是 latch-free 的结构性前提。

### 2. Delta Updating（增量更新）

页状态变更步骤：

1. 分配 delta 记录，描述操作（Insert / Delete / Update / Split / Merge 等）。
2. Delta 的 `next` 指向旧状态（旧 delta 或 consolidated base）。
3. **CAS(mapping_table[page_id], old_ptr, new_delta_ptr)**；成功则新 delta 成为页首。
4. 失败说明并发冲突，重读指针并重试（典型 lock-free 模式）。

读路径：从链头沿 `next` 向下走，合并语义（或先 consolidate 再读）。

### 3. Consolidation（合并整理）

Delta 链过长时：

- 分配新 consolidated 页，把链上所有 delta **apply** 到 base 页。
- CAS 安装新 consolidated 指针。
- 旧结构进入 **pending list**，等 **epoch-based reclamation** 安全后再 free。

这样既控制内存，又恢复 O(log n) 页内搜索而非 O(链长)。

### 4. Elastic Pages（弹性页）

页没有硬编码 8KB 上限；split 可以在「方便时」做，减少高负载下的 split 风暴。配合 delta，页的有效大小是 base + 未 consolidate 的 delta 体积。

### 5. Log-Structured Store（LSS）

内存页 evict 到 Flash 时：

- 不是原地覆盖旧块，而是把页（或 delta）**顺序 append** 到 log。
- Mapping table 槽位更新为 LSS 中的 offset。
- GC 扫描不可达 log 条目，批量 relocate 以减少随机读。

论文 ICDE 2013 版侧重 **内存侧**；LSS 与 recovery（checkpoint mapping table + 重放 log）在同期/后续技术报告里展开。

### 6. 与 Hekaton 的关系

Hekaton 表用 **hash 索引做点查、Bw-Tree 做范围扫描**。Bw-Tree 的无 latch 设计与 Hekaton 的 **乐观 MVCC** 同哲学：性能路径上避免内核级阻塞，把冲突留到 commit 时检测。

---

## 架构一图流

```text
                    ┌─────────────────┐
  读/写线程 ───────►│  B-tree 逻辑层   │  键比较、导航、split 决策
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Mapping Table   │  page_id → physical ptr (CAS 更新)
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         Δ Insert       Consolidated      (evicted)
         Δ Delete         Page P          → LSS offset
              │              │
              └────── next ──┘
```

---

## 代码示例 1：用 Python 模拟 Mapping Table + CAS 安装 Delta

下面是最小化教学模型（非生产代码）：展示「无锁安装 delta」的核心循环。

```python
import threading
from dataclasses import dataclass
from typing import Any, Optional

@dataclass
class Delta:
    op: str          # "insert" | "delete"
    key: int
    value: Any = None
    next: Optional["PageState"] = None

@dataclass
class ConsolidatedPage:
    records: dict    # key -> value

PageState = ConsolidatedPage | Delta

class MappingTable:
    def __init__(self, n_pages: int):
        # 每个槽位：当前物理指针；用 list 模拟 atomic pointer
        self.slots: list[PageState | None] = [None] * n_pages
        self._lock = threading.Lock()  # 仅用于模拟 CAS；真实 Bw-Tree 用 hardware CAS

    def cas(self, page_id: int, expected: PageState | None, new: PageState) -> bool:
        with self._lock:
            if self.slots[page_id] is not expected:
                return False
            self.slots[page_id] = new
            return True

def install_delta(table: MappingTable, page_id: int, delta: Delta) -> None:
    """Latch-free 安装 delta：失败则重读 old_ptr 并重链 delta.next"""
    while True:
        old = table.slots[page_id]
        delta.next = old
        if table.cas(page_id, old, delta):
            return
        # CAS 失败：别的线程已 prepend 新 delta，重试

# 用法
mt = MappingTable(n_pages=1)
mt.slots[0] = ConsolidatedPage(records={10: "ten", 20: "twenty"})

install_delta(mt, 0, Delta(op="insert", key=15, value="fifteen"))
install_delta(mt, 0, Delta(op="delete", key=10))

# 此时 page 0 物理结构：Delete(10) -> Insert(15) -> ConsolidatedPage(...)
```

要点：

- **读者**只需读 `slots[page_id]` 当前指针，沿链解析，无需加锁。
- **写者**只 CAS 单个槽位；冲突时重试，不阻塞其他页。

---

## 代码示例 2：Delta 链搜索 + Consolidation

读路径要「看见」链上所有变更；consolidate 把链压平成一张快照页。

```python
def search_page(state: PageState | None, key: int) -> Any | None:
    """从链头向下：delta 覆盖 consolidated base 的语义"""
    if state is None:
        return None
    if isinstance(state, ConsolidatedPage):
        return state.records.get(key)

    assert isinstance(state, Delta)
    if state.op == "insert":
        if key == state.key:
            return state.value
    elif state.op == "delete":
        if key == state.key:
            return None  # 删除覆盖更老的值
    # 继续向 base 查找
    return search_page(state.next, key)


def consolidate(state: PageState | None) -> ConsolidatedPage:
    """把 delta 链 apply 到 consolidated 页（论文中的 consolidate 操作）"""
    base = ConsolidatedPage(records={})
    chain: list[Delta] = []
    cur = state
    while isinstance(cur, Delta):
        chain.append(cur)
        cur = cur.next
    if isinstance(cur, ConsolidatedPage):
        base.records = dict(cur.records)

    for d in reversed(chain):  # 从 oldest delta 到 newest
        if d.op == "insert":
            base.records[d.key] = d.value
        elif d.op == "delete":
            base.records.pop(d.key, None)
    return base


# 接上例 mt.slots[0]
head = mt.slots[0]
assert search_page(head, 15) == "fifteen"
assert search_page(head, 10) is None
assert search_page(head, 20) == "twenty"

flat = consolidate(head)
assert flat.records == {15: "fifteen", 20: "twenty"}
# 生产环境会用 CAS 把 mapping_table[0] 从 head 换成 flat，旧链 epoch GC
```

Consolidation 触发条件通常是：**delta 链长度 / 页内搜索成本** 超过阈值，或后台 maintenance 线程空闲时批量处理。

---

## 代码示例 3：B-tree 导航伪代码（逻辑层）

Delta 与 mapping table 解决「页内并发」；B-tree 层仍负责**键序与 split**。简化导航：

```python
def bwtree_lookup(root_id: int, key: int, table: MappingTable, inner: dict) -> Any | None:
    """
    inner[(page_id, key)] -> child_page_id  # 内节点路由；值节点在 consolidated/delta 里
    """
    page_id = root_id
    while True:
        state = table.slots[page_id]
        # 在内节点 consolidated 页上找 child（真实实现还有 delta 上的 split delta）
        child = route_inner(consolidate(state) if needs_flat(state) else state, key, inner)
        if child is None:
            return search_page(state, key)  # 叶页
        page_id = child
```

Split 在 Bw-Tree 里同样产生 **management delta**（或新页 + 父节点 delta），通过 CAS 分批安装，避免「整棵树 latch 化」。

---

## 与传统 B-tree / LSM 的对比

| 维度 | B-tree (InnoDB) | LSM (RocksDB) | Bw-Tree |
|------|-----------------|---------------|---------|
| 读放大 | 低（树高 + 缓存） | 高（多层 SST） | 低–中（树 + delta 链） |
| 写放大 | 中（随机页写） | 高（compaction） | 中（delta + LSS 顺序写） |
| 并发 | 页 latch | 通常较友好 | **无 latch** |
| 范围扫描 | 天然支持 | 需 merge iterator | 天然支持 |
| 实现复杂度 | 中 | 高 | **很高**（CAS/GC/split） |

Bw-Tree **不是** LSM 的简单混合：它保持 B-tree 的**有序索引语义**，只在**页存储与并发**上借 log-structured 思想（delta 链 + append-only LSS）。

---

## 实验结论（论文摘要级）

ICDE 2013 实验聚焦内存 Bw-Tree 层，显示 latch-free + delta 在多核上显著优于 latch-based B-tree。后续工作（SIGMOD 2014 «Indexing on Modern Hardware: Hekaton and Beyond»）补充：

- 嵌入 Hekaton 的端到端 OLTP 路径；
- 独立 KV 存储 vs BerkeleyDB、latch-free skiplist 的对比。

阅读这些数字时应注意：**workload、硬件代际、实现完整度**（OpenBw-Tree 指出原版缺少细节）都会大幅影响结论。Bw-Tree 的教学价值在于**设计权衡**，而非「在所有场景碾压 skiplist」。

---

## 实现难点（读论文时该盯什么）

1. **Split / merge 的无锁协议**：结构变更比单条 insert 复杂，需保证没有线程看到「半分裂」的不一致树。
2. **Safe memory reclamation**：CAS 换指针后，旧 delta 链仍可能被慢读者持有 → **epoch / hazard pointer**。
3. **Consolidation 与更新的竞态**：consolidate 期间新 delta 仍可能 prepend，需二次检查或 version 机制。
4. **LSS GC 与 checkpoint**：mapping table checkpoint + log tail replay 决定恢复时间。
5. **OpenBw-Tree 的教训**：即使按论文实现，调优后仍可能不如**精心实现的 latch-based B-tree**——无锁不是免费午餐。

---

## 零基础自检清单

读完后，你应该能口头回答：

- [ ] 为什么 mapping table 是 latch-free 的关键？
- [ ] Delta 与「copy-on-write 页」有什么相似和不同？
- [ ] Consolidation 解决什么问题？不 consolidate 会怎样？
- [ ] 为什么 Flash 场景要用 LSS 而不是原地更新页？
- [ ] Bw-Tree 与 Hekaton hash 索引的分工是什么？

---

## 延伸阅读

| 资料 | 说明 |
|------|------|
| Levandoski et al., ICDE 2013 | 本文主论文，内存 Bw-Tree 架构与算法 |
| Lomet et al., SIGMOD 2014 | Hekaton 中的 Bw-Tree 与性能对比 |
| Wang et al., «Building a Bw-Tree Takes More Than Just Buzz Words», SIGMOD 2018 | OpenBw-Tree，实现细节与 benchmark |
| 本库 [Hekaton 笔记](./hekaton.md) | OLTP 引擎如何把 Bw-Tree 放进事务系统 |
| 本库 [LSM-tree / RocksDB 笔记](./rocksdb-lsm.md) | 对比 log-structured 在 KV 引擎里的另一种形态 |

---

## 小结

Bw-Tree 回答的问题是：**当 CPU 核数和大内存容量上去、存储介质变成 Flash 之后，B-tree 这一「老结构」还有没有好实现？**

它的答案是：**逻辑上还是 B-tree，物理上改成「mapping table + delta 链 +  occasional consolidate + log-structured 持久化」**，用 CAS 换掉 latch，用 append 换掉随机写。理解 Bw-Tree，等于理解 2010 年代 Microsoft 如何把索引层改写成「多核与 SSD 原生」——这也是后来诸多内存数据库与 research prototype 的参考模板。
