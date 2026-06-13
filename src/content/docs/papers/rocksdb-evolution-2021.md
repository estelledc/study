---
title: "RocksDB 开发优先级的演变 — 从零开始理解一个存储引擎的八年进化"
来源: "https://www.usenix.org/system/files/fast21-dong.pdf"
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: "pipeline-v3"
---

# 1. 这篇论文在说什么

这篇论文来自 USENIX FAST 2021，作者来自 Facebook（Meta）和多伦多大学。

它讲了一个非常简单、但非常深刻的问题：**一个开源存储引擎 RocksDB，在过去八年里，开发团队到底把"最重要的事"放在哪里？**

不是讲某个具体功能的实现细节，而是讲"优先级"本身是怎么变的。

这就像问一个创业者：你的第一要务是获客、是留存、还是赚钱？答案会随着时间变化。RocksDB 也一样。

# 2. 先搞懂 RocksDB 是什么

## 2.1 一个日常类比

想象你在经营一个大型图书馆。

- 每来一本书（写入数据），你不能直接把它塞进书架的随机位置 — 那样找书就乱了。
- 你必须把新书记在一个"临时登记本"上。
- 当登记本写满了，你把它整理好、按字母顺序排好，变成一本"正式目录册"（这叫 SSTable）。
- 然后你把这些目录册按层级分类放好。
- 如果有人来借书，你从最新的目录册开始找，一层层往下去。

这个过程里最关键的结构叫做 **LSM-Tree（Log-Structured Merge-Tree）**。

LSM-Tree 的核心思想是：**把"随机写"变成"顺序写"**。

机械硬盘最怕随机读写，但顺序写入非常快。SSD（固态硬盘）虽然比机械硬盘快得多，但它有写入寿命限制 — 每个存储单元只能被擦写有限次数。所以"少写"仍然是大事。

RocksDB 就是基于 LSM-Tree 的，它被嵌入到各种大型分布式系统中，在 Facebook 内部被 30 多个应用使用，存储了数百 PB 的数据。

# 3. 三种 SSTable 的写入方式（代码示例 1）

在 LSM-Tree 里，数据写入经历三个阶段。我们用 Python 模拟这个过程：

```python
# 模拟 RocksDB 的 LSM-Tree 写入流程

class MemTable:
    """内存中的有序写缓冲区 — 用跳表实现"""
    def __init__(self, max_size_mb=16):
        self.max_size = max_size_mb * 1024 * 1024  # 16MB
        self.data = {}  # 简化的键值存储

    def put(self, key, value):
        """写入数据到内存表"""
        self.data[key] = value
        return len(str(value).encode())

    def flush_to_sst(self):
        """当 MemTable 满了，把它刷写到磁盘变成 SSTable"""
        # 1. 将内存中的数据排序后写入磁盘文件（SSTable）
        sstable = SSTable(sorted(self.data.items()))
        # 2. 旧的 MemTable 变成只读，丢弃
        self.data = {}
        return sstable


class SSTable:
    """磁盘上的有序字符串表 — 数据已排序"""
    def __init__(self, sorted_items):
        self.items = sorted_items  # 按 key 排序的 (key, value) 对
        self.level = 0  # 初始放入 Level-0

    def __repr__(self):
        return f"SSTable(level={self.level}, entries={len(self.items)})"


# 模拟一次写入
mem = MemTable(max_size_mb=1)
mem.put("user:1001", '{"name": "Alice", "age": 30}')
mem.put("user:1002", '{"name": "Bob", "age": 25}')

print(f"MemTable 中有 {len(mem.data)} 条记录")

# MemTable 满了，刷写到磁盘
sst = mem.flush_to_sst()
print(f"刷写结果: {sst}")
```

输出：

```
MemTable 中有 2 条记录
刷写结果: SSTable(level=0, entries=2)
```

这里的关键是：**写入先发生在内存（MemTable），满了才变成磁盘上的有序文件（SSTable）**。这避免了在磁盘上做随机写。

# 4. 优先级的三次演变

论文的核心发现是：RocksDB 的开发优先级经历了**三个阶段的迁移**。

## 第一阶段：降低"写放大"（Write Amplification）

**写放大** = 真正写入 1 字节数据，磁盘实际写了多少字节。

类比：你要在一份复印了 10 层的复写纸上改一个字母。你只改了一个字母（1 字节），但下面 10 层纸都被"写"了。这就是写放大。

SSD 的写入寿命有限，写放大越高，SSD 死得越快。所以最初团队把大量精力放在减少写放大上。

RocksDB 提供了三种压缩（Compaction）方式：

| 压缩方式 | 写放大 | 空间放大 | 读取速度 |
|---|---|---|---|
| Leveled（分级压缩） | 10–30 | 约 10% | 快 |
| Tiered（层级压缩） | 4–10 | 约 45% | 中等 |
| FIFO（先进先出） | 2–3 | 不可控 | 慢 |

## 第二阶段：降低"空间放大"（Space Amplification）→ 这是最大的转变

**空间放大** = 数据库实际占用的磁盘空间，比"有效数据"多多少。

论文发现一个反直觉的事实：**大多数应用真正卡脖子的是磁盘空间，而不是写入寿命。**

原因有三：
1. SSD 的 IOPS 在实际使用中远没有跑满
2. 磁盘空间直接决定了成本 — 数百 PB 的数据，每省 10% 就是几十 PB
3. SSD 寿命虽然有限，但通常足够用 2-5 年，而空间不足是即时问题

所以团队开发了 **Dynamic Leveled Compaction（动态分级压缩）**：

```python
# 传统 Leveled Compaction vs 动态 Leveled Compaction 的空间效率对比

import matplotlib.pyplot as plt

# 数据来自论文 Table 4
key_counts = [200, 400, 600, 800, 1000]  # 百万键

# 传统 Leveled 压缩 — 空间放大率随数据量增加而恶化
traditional_overhead = [12.4, 12.2, 12.2, 12.7, 12.4]  # % 稳定在 ~12%

# 传统 Leveled 在最坏情况下可达 90% 空间放大
# 动态 Leveled 则稳定控制在 13% 以内

print("传统 Leveled 压缩：最大空间放大率可达 25-90%")
print("动态 Leveled 压缩：最大空间放大率稳定在 13% 以内")
print("")
print("在 Facebook 的 UDB 数据库中，用 RocksDB 替换 InnoDB 后，")
print("存储空间减少到了原来的 50%！")
```

## 第三阶段：降低"CPU 占用"（CPU Utilization）

随着空间效率的优化逐渐到位，瓶颈开始向 CPU 转移。

论文用一个生动的比喻说明：**SSD 太快了，快到软件跟不上硬件的速度。**

就像一辆跑车，发动机（SSD）已经能跑 300km/h，但司机（CPU）只能开到 120km/h。

团队开始关注：
- **Prefix Bloom Filter（前缀布隆过滤器）** — 减少不必要的磁盘读取
- **多线程压缩** — 利用多核 CPU 并行处理
- **多线程单文件压缩** — 一个文件的压缩也能并行

# 5. 布隆过滤器 — 如何避免不必要的磁盘读取（代码示例 2）

布隆过滤器（Bloom Filter）是 RocksDB 里非常重要的加速机制。

类比：你有一百万本书，但不想为每本书都做一本索引卡片。于是你用一个"比特数组"来快速判断：这本书**很可能不在**，或者**可能在**。

```python
# 模拟布隆过滤器 — 用 3 个哈希函数来判断 key 是否存在

class BloomFilter:
    """简化版布隆过滤器"""
    def __init__(self, size=1000, hash_count=3):
        self.size = size
        self.hash_count = hash_count
        self.bits = [0] * size  # 比特数组

    def _hash(self, key, seed):
        """用不同 seed 做哈希，产生多个不同的哈希值"""
        h = 0
        for i, ch in enumerate(key.encode()):
            h = (h * 31 + ch + seed) % self.size
        return h

    def add(self, key):
        """把一个 key 加入过滤器"""
        for seed in range(self.hash_count):
            pos = self._hash(key, seed)
            self.bits[pos] = 1

    def might_exist(self, key):
        """判断 key 可能存在 — 返回 True 表示"可能在"，False 表示"一定不在""""
        for seed in range(self.hash_count):
            pos = self._hash(key, seed)
            if self.bits[pos] == 0:
                return False  # 一定不存在
        return True  # 可能存在（可能有误判，但不会漏判）


# 演示
bf = BloomFilter(size=1000, hash_count=3)

# 往过滤器里加入一些 key
for i in range(100):
    bf.add(f"user:{i}")

# 现在查询
print(f"user:50 是否存在？可能在: {bf.might_exist('user:50')}")   # True（正确）
print(f"user:999 是否存在？可能在: {bf.might_exist('user:999')}") # True 或 False（可能误判）
print(f"user:xxx 是否存在？可能在: {bf.might_exist('user:xxx')}")  # False（一定不存在）
```

布隆过滤器的价值在于：**当它说"不存在"时，RocksDB 就不需要去磁盘读数据了** — 一次磁盘读取可能耗时 100-300 微秒，而布隆过滤器的判断只需要几纳秒。这就是从 CPU 换 I/O 的经典优化。

# 6. 运行大规模系统的三条经验教训

## 6.1 资源需要"全局+局部"双层管理

一台物理服务器上可能运行着几十个 RocksDB 实例（每个分片一个实例）。它们共享 CPU、内存、磁盘 I/O 带宽。

如果没有全局资源管理，一个实例可能吃光所有资源，导致其他实例卡顿。

RocksDB 支持 **Resource Controller** — 类似"流量控制器"，可以在全局和局部两个层级限制资源使用。

## 6.2 数据格式必须前向+后向兼容

RocksDB 每月发布一次新版本。升级是逐步进行的 — 可能一半服务器是新版本，一半还是旧版本。

如果新旧版本的数据格式不兼容，升级过程中就会出问题。

所以 RocksDB 承诺：**旧版本读新版本的数据没问题，新版本读旧版本的数据也没问题。** 这类似于 Protocol Buffer 或 Thrift 的做法。

## 6.3 错误需要分层检测

论文发现了一个惊人的事实：在每 100 PB 数据中，RocksDB 层面大约每三个月会出现一次数据损坏（可能由 CPU 位翻转或内存错误引起），其中 40% 已经传播到了其他副本。

类比：家里安装了烟雾报警器（L3 层）。但火是从厨房开始的 — 如果你只在客厅装报警器，等火警响起时厨房可能已经烧穿了。

RocksDB 因此引入了**四层校验和机制**：

| 层级 | 校验对象 | 何时验证 | 防什么 |
|---|---|---|---|
| Block Checksum | SSTable 中的每个数据块 | 每次读取 | 存储层损坏 |
| File Checksum | 整个 SSTable 文件 | 文件传输时 | 传输损坏 |
| Handoff Checksum | 写入时传给文件系统的数据 | 写入时 | 写时损坏 |
| Key-Value Checksum | 每条键值对 | 每次操作 | 内存/CPU 损坏 |

# 7. 为什么 LSM-Tree 仍然合适？

论文反复回答了一个问题：**SSD 越来越快，我们是不是该换掉 LSM-Tree？**

答案是：**不会。** 原因如下：

1. **SSD 的成本还没低到可以忽略空间浪费** — 空间放大仍然是大多数应用的瓶颈
2. **LSM-Tree 的写放大已经足够低** — 虽然用户希望更低，但在大 value 场景下，可以通过分离 key 和 value（BlobDB）来解决
3. **SSD + LSM-Tree 的组合是"足够好"的方案** — 没有哪个单一替代方案能同时解决空间、写放大、成本三个问题

# 8. 未来的方向

论文列出了几个开放问题：

1. 如何用 SSD + HDD 混合存储提高效率？
2. 如何处理连续删除标记对读取的影响？
3. 如何改进写入限速算法？
4. 如何高效比较两个副本确保数据一致？
5. 如何最好地利用存储类内存（SCM）？
6. 能否有一个通用的完整性 API 来处理 RocksDB 和文件系统之间的数据交接？

另外，**远程存储（Disaggregated Storage）** 正在成为新的优先级 — 当 CPU 和 SSD 可以独立扩展时，优化 RocksDB 与远程存储的交互变得非常重要。

# 9. 总结

| 时期 | 优化目标 | 类比 |
|---|---|---|
| 2012-2015 | 降低写放大 | 保护 SSD 的"寿命" |
| 2015-2018 | 降低空间放大 | 省磁盘，省成本 |
| 2018-至今 | 降低 CPU 占用 | 让硬件发挥全部潜能 |

这篇论文给我们的最大启发是：**没有永远正确的优化方向，只有不断变化的约束条件。**

一个存储引擎的优先级演变，本质上反映的是硬件趋势和实际应用需求的动态变化。写放大重要吗？重要。但当空间成为瓶颈时，它的优先级就得让位。

这就是工程实践中的"权衡"（Trade-off）— 不是找最优解，而是找"当前最优"的解。
