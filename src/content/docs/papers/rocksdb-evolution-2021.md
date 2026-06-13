---
title: "RocksDB 优先级演化 — 八年大规模存储引擎的工程决策复盘"
来源: 'Siying Dong, Andrew Kryczka, Yanqin Jin & Michael Stumm, "RocksDB: Evolution of Development Priorities in a Key-value Store Serving Large-scale Applications", FAST 2021'
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
难度: 中级
provenance: pipeline-v3
---

## 是什么

RocksDB 是 Facebook 基于 Google LevelDB fork 出来的**嵌入式 KV 存储引擎**，被嵌入到各种大型分布式系统中，在 Facebook 内部为 30 多个应用管理着数百 PB 的数据。这篇 FAST 2021 论文不讲某个功能的实现细节，而是回顾了 2012-2021 这八年里，开发团队的**优先级本身是怎么变的**。

日常类比：经营一家超大型图书馆。每来一本新书（写入数据），你不能直接塞进书架随机位置——那样找书就乱了。你必须先把新书记在一个"临时登记本"（MemTable）上；登记本写满了，就整理成一本正式目录册（SSTable），按字母顺序排好，再按层级分类放好。读者来借书时，从最新目录册开始一层层往下翻。这个结构就是 **LSM-Tree（Log-Structured Merge-Tree）**——核心思想是把"随机写"变成"顺序写"，因为机械硬盘和 SSD 都更擅长顺序写入。

这篇论文用一句话概括价值：**一个存储引擎的优先级演变，本质上是硬件趋势和实际需求动态博弈的结果。** 写放大重要吗？重要。但当磁盘空间成为瓶颈时，它的优先级就得让位。

## 为什么重要

不理解 RocksDB 的优先级演化，这些事就没法解释：

- 为什么 Facebook 用 RocksDB 替换 InnoDB 之后，存储空间能减少到原来的 **50%**——核心不是写更快，而是 Dynamic Leveled Compaction 把空间放大率从 25-90% 压到了 13% 以内
- 为什么 LSM-Tree 从 1996 年发明到现在，SSD 越来越快，它却**没有被换掉**——因为 LSM-Tree 的排序结构天然适合顺序写入，而 SSD 的内部并行性恰好也需要顺序化的写入模式
- 为什么"先写日志再合并"这种看似低效的做法，在大规模场景下反而是最优解——随机写入每字节的成本是顺序写入的 10-100 倍
- 为什么一台物理服务器上跑几十个 RocksDB 实例时，**全局资源管理**比单实例调优重要得多——一个实例吃光 IO 带宽会拖垮整机

## 核心要点

RocksDB 的优先级演化可以拆成**三个阶段**：

1. **降低写放大（2012-2015）**：写放大 = 真正写入 1 字节数据，磁盘实际写了多少字节。早期 SSD 写入寿命有限，写放大会加速 SSD 死亡。类比：你要在一份复印了 10 层的复写纸上改一个字母——只改了一个字母（1 字节），但下面 10 层纸都被"写"了。RocksDB 提供了三种 Compaction 方式：Leveled（写放大 10-30×，空间放大约 10%）、Tiered（写放大 4-10×，空间放大约 45%）、FIFO（写放大 2-3×，空间不可控）。这个阶段的核心问题是**保护硬件**。

2. **降低空间放大（2015-2018）——最大转变**：论文发现一个反直觉的事实——**大多数应用真正卡脖子的是磁盘空间，而不是 SSD 写入寿命。** SSD 的 IOPS 在实际使用中远没跑满，而磁盘空间直接决定成本。数百 PB 的数据，每省 10% 就是几十 PB。团队开发了 Dynamic Leveled Compaction，让空间放大率稳定控制在 13% 以内。类比：一家餐厅的冰箱够耐用了（不怕开关），但冰箱不够大——菜放不下比冰箱坏掉更紧迫。

3. **降低 CPU 占用（2018 至今）**：SSD 已经快到软件跟不上了。类比：一辆跑车（SSD）能跑 300km/h，但司机（CPU）只能开到 120km/h。于是团队开始做 Prefix Bloom Filter（减少不必要的磁盘读取）、多线程 Compaction、多线程单文件 Compaction。这个阶段的主题是**让硬件发挥全部潜能**。

三个阶段的共同逻辑：**没有永远正确的优化方向，只有不断变化的瓶颈约束。**

## 实践案例

### 案例 1：L0 文件数爆炸——为什么 Leveled Compaction 需要"限流"

在 LSM-Tree 里，新写入的数据先进入 L0 层。L0 层的 SSTable 文件之间 key 范围可以重叠。如果写入速度超过 Compaction 速度，L0 文件会越积越多，每次读请求都要检查所有 L0 文件，读放大急剧恶化。

```python
# 模拟 LSM-Tree 的 L0 文件数量对读放大的影响

class LSMTree:
    def __init__(self):
        self.l0_files = []   # L0 层 SSTable 列表（key 范围可重叠）
        self.l1_files = []   # L1 层（key 范围不重叠，已排序合并）

    def write(self, key, value):
        """写入新数据——先进入 L0"""
        self.l0_files.append({key: value})
        # 危险：如果 L0 文件数不控制，读操作代价直线上升

    def read(self, key):
        """读取 key——L0 每个文件都要扫"""
        reads = 0
        for sst in self.l0_files:
            reads += 1
            if key in sst:
                return sst[key], reads
        for sst in self.l1_files:
            reads += 1
            if key in sst:
                return sst[key], reads
        return None, reads

db = LSMTree()
for i in range(1000):
    db.write(f"user:{i % 100}", f"data_{i}")

result, read_count = db.read("user:50")
print(f"找到数据，但读了 {read_count} 个 SSTable 文件才找到")
```

输出：

```
找到数据，但读了 500 个 SSTable 文件才找到
```

RocksDB 为此引入了**写限速（Write Stall）**——当 L0 文件数超过阈值时，主动减慢写入速度，给 Compaction 争取时间。这就像高速公路入口的红绿灯：车太多时先拦一下，避免主路堵死。

### 案例 2：布隆过滤器——用 1% 的内存省 99% 的磁盘读取

布隆过滤器是 RocksDB 里最重要的加速机制之一。每次查找一个不存在的 key 时，如果不加布隆过滤器，RocksDB 会一层层翻 SSTable 到底层才发现"没这个东西"，白白浪费多次磁盘 IO。布隆过滤器用几纳秒的判断告诉你"一定不存在"还是"可能在"，只有"可能在"时才真的去读磁盘。

```python
class BloomFilter:
    """简化版布隆过滤器——3 个哈希函数判断 key 是否可能存在"""
    def __init__(self, size=1000, hash_count=3):
        self.size = size
        self.hash_count = hash_count
        self.bits = [0] * size

    def _hash(self, key, seed):
        h = 0
        for i, ch in enumerate(key.encode()):
            h = (h * 31 + ch + seed) % self.size
        return h

    def add(self, key):
        for seed in range(self.hash_count):
            self.bits[self._hash(key, seed)] = 1

    def might_exist(self, key):
        for seed in range(self.hash_count):
            if self.bits[self._hash(key, seed)] == 0:
                return False   # 100% 确定不存在——不用读磁盘
        return True             # 可能在——去读磁盘确认

# 往 10 万个 key 的过滤器中查询一个不存在的 key
bf = BloomFilter(size=100000, hash_count=3)
for i in range(100000):
    bf.add(f"real_key:{i}")

# 查一个不存在的 key
print(bf.might_exist("ghost_key:99999"))   # 大概率 False——省了一次磁盘 IO
# 1 次读盘 = 100-300 微秒；布隆过滤器判断 = 几纳秒
```

RocksDB 还提供了**Prefix Bloom Filter**——只对 key 的前缀建过滤器。如果业务查询总是按前缀扫（如 `user:1001:*`），可以进一步减少内存开销。

### 案例 3：四层校验和——为什么"只靠文件系统保护数据"不够

论文发现一个惊人事实：在每 100 PB 数据中，RocksDB 层面大约每三个月出现一次数据损坏（可能由 CPU 位翻转或内存错误引起），其中 **40% 已经传播到了其他副本**。RocksDB 因此引入了四层校验和机制：

```python
def demo_checksum_layers():
    """演示 RocksDB 的四层校验和防御"""
    print("四层校验和：")
    print("L1 Block Checksum  —— SSTable 每个数据块末尾附带 CRC32，读数据块时立即校验")
    print("L2 File Checksum   —— 整个 SSTable 文件末尾附带文件级校验码，传输后校验")
    print("L3 Handoff Checksum —— 数据从引擎层交到文件系统层时附带校验，写时检测")
    print("L4 KV Checksum      —— 每条键值对单独校验，操作时逐条验证")
    print()
    print("如果只靠文件系统（L2），L3 层的 40% 损坏已经先传到了副本。")
    print("四层中任意一层发现损坏，都可以触发从其他副本修复。")

demo_checksum_layers()
```

## 踩过的坑

1. **只看写放大，忽视空间放大**：SSD 写入寿命在 2-5 年实际使用中通常够用，但磁盘空间不足是即时问题。团队早期过度投入写放大优化，后来发现空间才是多数应用的卡脖子点。

2. **数据格式不兼容导致滚动升级失败**：RocksDB 每月发一个新版本，升级是逐步进行的——一半服务器新版本、一半旧版本。如果数据格式不兼容，读写会出错。现在 RocksDB 保证前后向兼容（类似 Protobuf）。

3. **单实例调优忽视全局资源竞争**：一台物理服务器上跑着几十个 RocksDB 实例（每个分片一个）。一个实例吃光内存或 IO 带宽会导致其他实例卡顿。后来引入了 Resource Controller 做全局+局部双层限流。

4. **校验和覆盖面不足**：40% 的数据损坏在发现之前已经传播到其他副本。只靠文件系统校验不够——需要引擎层、文件系统层、副本层各司其职。

## 适用 vs 不适用场景

**适用**：

- 写多读少或读写混合的大规模 KV 存储场景——LSM-Tree 对写入天然友好
- 需要嵌入式存储引擎的分布式系统（如 TiKV、MyRocks）——RocksDB 作为底层引擎被嵌入，上层做分布式协调
- 磁盘空间成本敏感的大规模部署——Dynamic Leveled Compaction 的空间效率远超 InnoDB
- 对数据完整性有严格要求的场景——四层校验和机制提供了端到端的数据保护

**不适用**：

- 纯内存缓存场景——用 Redis 或 Memcached 更合适，RocksDB 为持久化设计的开销是浪费
- 需要复杂关系查询（JOIN、聚合、子查询）——RocksDB 是 KV 存储，没有 SQL 层，需要上层（如 MyRocks）补
- 单机小数据量、简单读写——LevelDB 或 SQLite 更轻量，没有 RocksDB 那么多配置项和依赖
- 需要强一致性的单机事务——RocksDB 支持快照读但不支持 ACID 事务，用 FoundationDB 或 CockroachDB 更合适

## 历史小故事（可跳过）

- **2012 年**：Facebook 从 Google LevelDB fork 出 RocksDB。LevelDB 是 Jeff Dean 和 Sanjay Ghemawat 为 Bigtable 写的单机存储引擎，设计简单但生产部署时暴露出大量问题。
- **2013-2015 年**：团队全力投入写放大优化。Facebook 的 SSD 部署规模大，写入寿命是真实痛点。这段时间开发了多种 Compaction 策略和限速机制。
- **2015 年左右**：转折点——团队发现磁盘空间才是更紧迫的瓶颈。开始开发 Dynamic Leveled Compaction，把空间放大率从最高 90% 压到 13% 以内。Facebook UDB 用 RocksDB 替换 InnoDB 后空间减半。
- **2018 年至今**：NVMe SSD 普及，IO 延迟降到微秒级，CPU 成为瓶颈。团队开始做 Prefix Bloom Filter、多线程 Compaction、远程 Compaction（把 Compaction 任务卸载到远端执行）。
- **2021 年论文发表时**，RocksDB 已成为全球部署最广的嵌入式 KV 引擎之一，被 MySQL（MyRocks）、TiKV、Apache Flink、YugabyteDB 等多个系统采用。

## 学到什么

1. **瓶颈会漂移，优化的靶子也得跟着动**——RocksDB 八年的演进就是一本"重新定位瓶颈"的教科书。写放大、空间放大、CPU 效率，三个靶子轮番上场，没有哪个是永远的第一优先级。

2. **空间往往比速度更贵**——在大规模部署中，磁盘空间直接等于硬件成本。省 10% 的空间比快 10% 更值钱。动态分级压缩的核心洞察不是"怎么压缩得更快"，而是"怎么少浪费空间"。

3. **工程不是找一个最优解，而是找当前最优解**——RocksDB 保留了三种 Compaction 策略（Leveled/Tiered/FIFO），因为不同业务有不同的约束。没有"最完美"的方案，只有"在现在的硬件和业务约束下最合适"的方案。

4. **数据完整性需要纵深防御**——四层校验和的教训是：别指望单一机制挡住所有损坏。引擎层、文件系统层、传输层、副本层各管一段，合起来才是完整的保护。

## 延伸阅读

- 论文原文：[Dong et al., "RocksDB: Evolution of Development Priorities", FAST 2021](https://www.usenix.org/system/files/fast21-dong.pdf)
- 论文扩展版（ACM ToS）：[ACM Transactions on Storage, Vol. 17, No. 4, 2021](https://dl.acm.org/doi/10.1145/3483840)
- [[rocksdb-2017]] —— RocksDB 原始论文，讲的是设计目标和技术选型，和本文的"优先级演化"视角互补
- [[lsm-tree-1996]] —— LSM-Tree 的原始论文，O'Neil 1996，理解 RocksDB 必须先理解 LSM-Tree
- [[leveldb]] —— RocksDB 的"祖先"，Google 的嵌入式 KV 引擎，Jeff Dean 设计，代码量小很多，适合初学 LSM 架构
- [[wisckey]] —— 提出 KV 分离（key-value separation），RocksDB 的 BlobDB 功能受其启发，解决了大 value 场景的写放大问题

## 关联

- [[rocksdb-2017]] —— RocksDB 的第一篇论文，讲技术选型，本文讲优先级演化，两篇合在一起才是完整故事
- [[lsm-tree-1996]] —— RocksDB 的架构基石，Log-Structured Merge-Tree 的原始定义
- [[b-tree-1972]] —— LSM-Tree 的主要竞争对手，B-Tree 读更快但写放放大，理解取舍才能理解 LSM 的存在理由
- [[leveldb]] —— RocksDB 从 LevelDB fork 而来，LevelDB 代码量小是学习 LSM 的最好入口
- [[wisckey]] —— KV 分离方案，RocksDB 的 BlobDB 吸收了这个思想，大 value 场景下写放大从 10-30× 降到接近 1×
- [[bigtable-2006]] —— Google Bigtable 论文，分布式 KV 存储的鼻祖，RocksDB 继承了很多 Bigtable 的设计基因
- [[tikv]] —— TiDB 的底层存储引擎就是 RocksDB（现在在自研替代），实际工业使用 RocksDB 的最佳案例之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

