---
title: WiscKey — 把 Key 和 Value 拆开，让 SSD 上的 LSM 树少干冤枉活
来源: 'Lu et al., "WiscKey: Separating Keys from Values in SSD-conscious Storage", FAST 2016 / ACM TOS 2017'
日期: 2026-06-13
子分类: 存储与查询
分类: 数据库
provenance: pipeline-v3
---

## 从日常类比开始：图书馆目录 vs 仓库货架

想象你在运营一座**超大图书馆**，每天要处理海量借还记录。

传统 LSM-tree（比如 LevelDB）的做法像：**把书名卡片和整本书绑在一起**，放进按书名排序的大柜子。每次整理柜子（**compaction**）时，工作人员必须把「卡片 + 整本书」一起搬出来、重新排序、再塞回去——书越厚，搬得越累，柜子也越挤。

WiscKey 换了个思路：

1. **目录柜里只放索引卡**：卡片上写着书名（key）和**仓库货架编号**（value 在 vLog 里的地址）。
2. **真正的书放在仓库**：按到达顺序往传送带上扔（**append-only value log，简称 vLog**），顺序写、不用当场排序。
3. **整理目录时只搬卡片**：compaction 只排序薄薄的 key，不把整本书搬来搬去——写放大骤降。
4. **借一整套书（范围扫描）**：先按目录顺序找到一串书名，再派多个人**并行**去仓库按编号取书——利用 SSD 内部并行读，抵消「随机取货」的劣势。

论文由威斯康星大学 **Lu、Pillai、Arpaci-Dusseau 夫妇** 发表于 **FAST 2016**（扩展版见 **ACM TOS 2017**）。WiscKey 在 LevelDB 基础上改造，API 不变（`Put` / `Get` / `Delete` / `Scan`），核心贡献是：**为 SSD 时代重新设计 KV 的物理布局**——键留在 LSM-tree，值搬到单独的 vLog。

---

## 是什么

**WiscKey** 是一种**持久化、单机**的 LSM-tree 键值存储引擎，通过 **key-value separation（键值分离）** 降低 I/O 放大（write/read amplification），并针对 SSD 的**顺序写带宽**与**并行随机读**特性做优化。

| 组件 | LevelDB（传统 LSM） | WiscKey |
|------|---------------------|---------|
| LSM-tree 里存什么 | key + value 完整对 | key + **value 指针**（vLog 偏移） |
| Value 放哪 | 和 key 一起写在 SSTable | 单独 **vLog**（value log）顺序追加 |
| Compaction 搬多少数据 | key + value 全搬 | **mostly keys**（体积小得多） |
| 点查路径 | 一次 LSM 查找 | LSM 找 key → vLog 读 value（两次 I/O） |
| 范围扫描 | SSTable 顺序读 KV | LSM 顺序读 key → **并行**随机读 vLog |

一句话：**排序只需要 key；value 用日志追加，compaction 变轻，SSD 寿命和吞吐都受益。**

---

## 为什么重要

如果你已经读过 LSM-tree / RocksDB 笔记，会知道 compaction 是「写放大」的主要来源：同一条数据在多层之间被反复读写。当 **value 比 key 大很多**（现代 workload 常见：16B key + 1KB value 并不夸张）时，问题更严重：

- **写放大**：compaction 把大 value 跟着 key 一起重写，有效写入量可能是用户数据的 10 倍以上。
- **读放大**：点查要读整页，大量带宽花在 value 上。
- **SSD 寿命**：无意义的重复写加速闪存磨损。

论文给出的直觉数字（16B key、1KB value、key 侧写放大 10、value 侧写放大 1）：

```
有效写放大 ≈ (10 × 16 + 1024) / (16 + 1024) ≈ 1.14
```

而传统 LSM 要把 1KB value 也乘进 compaction 的倍数里，差距可以是**数量级**。

微基准结果（论文原文，随 value 大小变化）：

- **Bulk load**：比 LevelDB 快 **2.5×–111×**，尾延迟显著更好。
- **随机点查**：快 **1.6×–14×**。
- **YCSB 六类 workload**：全面快于 LevelDB 和 RocksDB。

WiscKey 的思想后来影响了 **BadgerDB**（Go）、RocksDB 的 **BlobDB**、以及多种「分离大 value」的工程实践——理解它是理解「LSM 上怎么放胖 value」的起点。

---

## 核心概念

### 1. 键值分离（Key-Value Separation）

核心洞察来自一句看似简单的话：

> **Compaction 只需要对 key 排序；value 可以另管。**

WiscKey 的 LSM-tree（memtable + 多层 SSTable）里，每条记录形如：

```
(key, value_pointer)
```

`value_pointer` 指向 vLog 中的 `(file_id, offset, length)`。真正的 value 字节流 append 到 vLog 末尾——**顺序写、写放大 ≈ 1**。

### 2. Value Log（vLog）布局

vLog 中每条记录的结构（论文 §3.3.2）：

```
[key_size][value_size][key][value]
```

为什么 vLog 里还要冗余存一份 key？

- **垃圾回收**时要判断这条 value 是否还有效（key 是否仍在 LSM-tree 里）。
- **崩溃恢复**时若 LSM 元数据不完整，可扫描 vLog 重建。

vLog 维护 **head**（新写入位置）和 **tail**（GC 起点）。只有 `[tail, head)` 区间内的 value 是「存活区」，查找只在这个范围解析。

### 3. 点查（Get）的两步读

```
Get(key):
  1. 在 LSM-tree 中搜索 key（和 LevelDB 一样，可能多层 + bloom filter）
  2. 若命中，读出 value_pointer
  3. 对 vLog 做一次随机读，取出 value
```

多一次 I/O，但 LSM 结构更小、compaction 更轻；当 value 较大时，整体仍更快。

### 4. 并行范围查询（Parallel Range Query）

键值分离的代价：范围扫描时，key 在 SSTable 里有序，value 在 vLog 里**无序**——不能一次顺序读拿齐 KV。

WiscKey 的解法：

1. 用户 `Seek(start)` 后反复 `Next()`，接口与 LevelDB **完全兼容**。
2. 检测到**连续顺序访问**模式后，后台**预取**：从 LSM 批量读后续 key 及其 value_pointer。
3. 多个线程**并行**从 vLog 拉 value，放入队列；用户 `Value()` 时往往已命中内存。

这利用了 SSD 的特性：单线程随机读很慢，但**多队列并行随机读**可接近顺序带宽（论文 Figure 3/5 有测量）。

### 5. 垃圾回收（Garbage Collection）

`Delete(key)` 只从 LSM-tree 删掉 key；vLog 里对应 value 变成 **dangling（悬空）** 垃圾。

GC 流程（简化）：

1. 从 **tail** 读一大块 vLog 记录（数 MB）。
2. 对每条记录，用其中的 key 查询 LSM-tree——**仍有效**则保留。
3. 有效 value **重写**到 **head**（append）。
4. 释放 tail 到 head 之间的旧空间（实现可用 `fallocate` punch hole 等）。

目标：让存活 value 在 vLog 中尽量**紧凑连续**，同时 GC 开销可控。论文称 GC 运行时 WiscKey 仍可比 LevelDB 快 **70× 以上**（bulk load 场景）。

### 6. 崩溃一致性与 WAL 优化

WiscKey 利用 vLog 的 append 顺序 + key 冗余：

- 新 value 先写 vLog，再更新 LSM（或反之，有明确顺序保证）。
- 恢复时可扫描 vLog，结合 LSM 状态对齐 head/tail。
- 论文还讨论在特定条件下**省略传统 LSM WAL** 的优化（减少小写系统调用开销）——属于进阶实现细节，零基础先记住「vLog 本身像一种写日志」即可。

### 7. 与 LevelDB 的关系

WiscKey **fork 自 LevelDB**，对外 API 一致，可嵌入 MySQL、MongoDB 等作为存储引擎。思想不是换掉 LSM，而是**缩小 LSM 里搬动的数据量**。

---

## 代码示例

### 示例 1：用 Python 模拟「键值分离」的写入与写放大

下面这段代码不是 WiscKey 源码，但把**写路径**和**写放大直觉**具象化了：

```python
class SeparatedKVStore:
    """极简 WiscKey 思想演示：LSM 只存 key+指针，value 进 vLog。"""

    def __init__(self):
        self.lsm = {}              # key -> (vlog_offset, value_len)  假装已排序
        self.vlog = bytearray()    # append-only value log
        self.bytes_written_user = 0
        self.bytes_written_disk = 0

    def put(self, key: bytes, value: bytes):
        # 1) value 顺序追加到 vLog（写放大 ≈ 1）
        offset = len(self.vlog)
        record = len(key).to_bytes(4, "little")
        record += len(value).to_bytes(4, "little")
        record += key + value
        self.vlog += record
        self.bytes_written_disk += len(record)

        # 2) LSM 只更新小记录：key + 指针
        pointer = (offset, len(value))
        old = self.lsm.get(key)
        self.lsm[key] = pointer
        self.bytes_written_disk += len(key) + 12  # 指针开销

        self.bytes_written_user += len(key) + len(value)

    def get(self, key: bytes) -> bytes | None:
        ptr = self.lsm.get(key)
        if ptr is None:
            return None
        offset, length = ptr
        # 跳过 header，定位 value（真实系统要解析 key_size/value_size）
        pos = offset + 4 + 4 + len(key)
        return bytes(self.vlog[pos : pos + length])

    def compact_lsm_only(self, write_amplification: int = 10):
        """模拟 compaction：只重写 key+指针，不搬 vLog 里的胖 value。"""
        sorted_items = sorted(self.lsm.items())
        for _ in range(write_amplification - 1):
            for k, p in sorted_items:
                self.bytes_written_disk += len(k) + 12
        # 若 key+value 不分离，这里还要 × len(value) —— 差距来源

    @property
    def effective_write_amplification(self):
        if self.bytes_written_user == 0:
            return 0.0
        return self.bytes_written_disk / self.bytes_written_user


# 典型「小 key 大 value」
store = SeparatedKVStore()
for i in range(1000):
    store.put(f"user:{i:04d}".encode(), b"x" * 1024)  # 1KB value
store.compact_lsm_only(write_amplification=10)
print(f"有效写放大 ≈ {store.effective_write_amplification:.2f}")
# 分离后远低于「value 也参与 10× compaction」的传统 LSM
```

运行后你会看到：vLog 承担 1KB×1000 的顺序写；compaction 模拟只反复写几十字节的 key+指针——这就是论文里 **1.14× vs 10×+** 的玩具版解释。

### 示例 2：点查与范围扫描的「两步 I/O」流程

用伪代码表达 WiscKey 读路径，便于和 LevelDB 对照：

```python
def wiskey_get(lsm, vlog, key):
    """点查：LSM 一次 + vLog 一次。"""
    entry = lsm.search(key)          # bloom + 多层 SSTable，同 LevelDB
    if entry is None:
        return None
    file_id, offset, length = entry.value_pointer
    return vlog.read(file_id, offset, length)


class RangeIterator:
    """范围扫描：顺序走 LSM，并行预取 vLog。"""

    def __init__(self, lsm, vlog, prefetch_depth=64, num_workers=4):
        self.lsm_iter = lsm.iterator()
        self.vlog = vlog
        self.prefetch_queue = asyncio.Queue(maxsize=prefetch_depth)
        self.workers = num_workers

    def seek(self, start_key):
        self.lsm_iter.seek(start_key)
        self._schedule_prefetch()

    def next(self):
        if not self.lsm_iter.valid():
            return False
        self.lsm_iter.next()
        self._schedule_prefetch()
        return self.lsm_iter.valid()

    def value(self):
        # 优先从预取缓存取；未命中则同步读 vLog
        key = self.lsm_iter.key()
        ptr = self.lsm_iter.value_pointer()
        return self.prefetch_queue.get_cached(key) or self.vlog.read(*ptr)

    def _schedule_prefetch(self):
        # 检测连续 Next() 后，批量提交后续 N 个 pointer 给线程池
        batch = self.lsm_iter.peek_keys_and_pointers(n=64)
        for ptr in batch:
            self.vlog.read_async(ptr)  # SSD 并行随机读
```

LevelDB 的 `Iterator::Value()` 直接从 SSTable 块里切片；WiscKey 多了一步 vLog，但通过 **prefetch + 并行读** 把范围扫描的坑填回去。value 越大，LevelDB 在 scan 时打开 SSTable、读 index/bloom 的开销越恐怖；论文报告 value ≥ 4KB 时 WiscKey scan 可达设备顺序带宽，最高约 **8.4× LevelDB**。

### 示例 3：估算「该不该做键值分离」

工程上可用一个一行公式做 back-of-envelope（与论文 §3.2 一致）：

```python
def should_separate(key_bytes: int, value_bytes: int,
                    lsm_wa: float = 10.0, vlog_wa: float = 1.0,
                    threshold: float = 3.0) -> bool:
    """
    有效写放大 = (lsm_wa * key + vlog_wa * value) / (key + value)
    若低于传统 LSM（≈ lsm_wa），则分离划算。
    """
    separated = (lsm_wa * key_bytes + vlog_wa * value_bytes) / (key_bytes + value_bytes)
    traditional = lsm_wa
    return separated < traditional / threshold

print(should_separate(16, 64))    # False — value 太小，多一次随机读不划算
print(should_separate(16, 1024))   # True  — 胖 value，分离大赚
print(should_separate(16, 4096))   # True  — 更赚
```

经验法则：**value 明显大于 key（通常数百字节以上）** 时，WiscKey 类布局更值得考虑；纯小 KV 或 value 极小场景，传统 LSM 可能更简单。

---

## 数据结构一览（单 SSD 部署）

```
┌─────────────────────────────────────────────────────────────┐
│                        用户 API                              │
│              Put / Get / Delete / Scan(start,end)              │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
┌─────────────────────┐            ┌─────────────────────┐
│      LSM-tree       │            │   vLog (value log)   │
│  memtable + SSTable │            │   append-only 文件    │
│                     │            │                     │
│  key → vptr         │            │ [ksz][vsz][key][val]│
│  (排序、compaction)  │            │  head ───────► tail  │
│  只搬 key+指针      │            │  GC 清理悬空 value   │
└─────────────────────┘            └─────────────────────┘
         │                                   ▲
         │         value_pointer ────────────┘
         └───────────────────────────────────┘
```

---

## 优势与代价（诚实三角）

| 维度 | WiscKey 收益 | 仍需付出的代价 |
|------|-------------|----------------|
| 写吞吐 / 写放大 | compaction 只碰 key，胖 value 友好 | vLog append + 偶尔 GC 写 |
| 读延迟（点查） | LSM 更小，缓存命中更好 | **两次 I/O**（LSM + vLog） |
| 范围扫描 | 大 value 时并行预取很强 | 小 value 时可能不如 LevelDB（论文：64B KV scan 慢约 12×） |
| 空间 | LSM 占用小 | vLog 有 GC 前悬空垃圾，需 GC |
| 实现复杂度 | API 与 LevelDB 相同 | GC、崩溃恢复、预取线程池 |

**没有免费午餐**：键值分离把 compaction 的痛点换成了「vLog 随机读 + GC」。WiscKey 的 SSD-conscious 指的是：**在闪存并行读够强的前提下，这笔交易划算。**

---

## 与相关工作的关系

| 系统 / 论文 | 与 WiscKey 的关系 |
|-------------|-------------------|
| **LevelDB / RocksDB** | 基线；KV 不分离，compaction 搬全量 |
| **RocksDB BlobDB** | 工业界类似思路：大 value 放 blob 文件 |
| **BadgerDB** | Go 生态常见实现，明确受 WiscKey 启发 |
| **LSM-tree (1996)** | 逻辑结构不变，变的是物理布局 |
| **Nyberg et al. 1994** | 更早提出 key/value 分离排序的思想，WiscKey 在 SSD 上复活并系统化 |

---

## 落地启示（给零基础读者的 checklist）

1. **先量 value 大小分布**：若 P50 value 只有几十字节，别急着分离；若大量 >1KB，值得读 WiscKey / BlobDB。
2. **把 compaction 当成「搬书」成本**：优化 LSM 不是少 compact，而是**每次 compact 少搬字节**。
3. **SSD 不是磁盘**：并行随机读能力让「目录有序 + 仓库乱序」变得可行——这是 2016 年前后闪存论文的共同主题。
4. **API 稳定、布局可换**：WiscKey 证明存储引擎可以在保持 `Put/Get/Scan` 的前提下大幅改底层——对嵌入 MySQL/MongoDB 这类场景友好。
5. **GC 要有**：任何 append-only value 文件都需要失效 value 的回收策略，否则空间无限涨。

---

## 论文信息

| 项目 | 内容 |
|------|------|
| 标题 | WiscKey: Separating Keys from Values in SSD-conscious Storage |
| 作者 | Lanyue Lu, Thanumalayan Sankaranarayana Pillai, Andrea C. Arpaci-Dusseau, Remzi H. Arpaci-Dusseau |
| 机构 | University of Wisconsin—Madison |
| 会议 / 期刊 | FAST 2016（页 133–148）；扩展版 ACM TOS 13(1), 2017 |
| DOI | [10.1145/3033273](https://doi.org/10.1145/3033273) |
| PDF | [USENIX FAST'16](https://www.usenix.org/system/files/conference/fast16/fast16-papers-lu.pdf) |

---

## 小结

WiscKey 回答了一个朴素问题：**LSM 排序真的需要把胖 value 一起搬吗？** 答案是否定的。把 key 留在 LSM-tree、把 value 丢进顺序 vLog，compaction 从「搬书整理」降级为「整理卡片」；再用 SSD 并行读补上范围扫描的坑，用轻量 GC 清理删除后的悬空 value。

三条记忆足以带走全文：

1. **分离**：LSM 存 `(key → pointer)`，vLog 顺序存 value。
2. **放大**：胖 value workload 下，有效写放大可从 ~10× 降到 ~1.x×。
3. **SSD**：并行随机读 + 顺序写，让这套布局在 2016 年的闪存上成立。

如果你已读过本仓库的 [LSM-tree 与 RocksDB](rocksdb-lsm) 笔记，可以把 WiscKey 当成「在 LSM 三角权衡里，专门砍 write amplification 的一支箭」——没有替换 LSM，而是**让 LSM 更瘦、更懂 SSD**。
