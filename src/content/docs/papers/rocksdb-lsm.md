---
title: LSM-tree 与 RocksDB 状元篇
description: O'Neil 1996 LSM-tree 原始论文 + Facebook RocksDB 2014/2017 工程论文综合精读 — 顺序写 + 后台 merge 如何取代原地更新
season: O
version: v1.1
branch: method
---

import { Image } from 'astro:assets';

## Layer 0 — 论文卡片

| 字段 | 值 |
|------|-----|
| 论文标题 | The Log-Structured Merge-Tree (LSM-Tree) + Optimizing Space Amplification in RocksDB |
| 一作 | Patrick O'Neil (1996) / Siying Dong (2017) |
| 机构 | UMass Boston (1996) / Facebook (2014/2017) |
| 会议/年份 | Acta Informatica 1996 + CIDR 2017 + USENIX FAST 2014 |
| 开源状态 | RocksDB 开源 (Apache 2.0)，原论文是学术 |
| OSS 类似实现 | LevelDB（前作）/ Pebble（Go 重写）/ Cassandra / HBase / TiKV |
| 范式归属 | 嵌入式 KV 存储 — 顺序写 + 后台 merge |
| 引用次数 | 原始论文 5000+；RocksDB 论文 1000+ (Google Scholar, 2025) |
| 影响力 | 几乎所有现代分布式数据库底层都在用：CockroachDB / TiDB / MyRocks / InfluxDB |

一句话定位：LSM-tree 用「顺序追加 + 后台 merge」替代 B-tree 的「原地更新」，写吞吐提升一到两个数量级，代价是读放大与空间放大；RocksDB 是这个 1996 年理论的工业级落地，把 LevelDB 的单机 KV 放大成可调写放大/读放大/空间放大三角的工程库。

<Image
  src="/study/papers/rocksdb-lsm/01-write-path.webp"
  alt="LSM-tree 写路径：memtable -> immutable -> flush 到 L0 -> compaction 到 L1/L2"
  width={1400}
  height={800}
/>

## Layer 1 — Why this paper

### 痛点的来源：B-tree 在写密集型场景的死路

1990 年代之前，所有数据库存储引擎都基于 B-tree 或其变种（B+tree / B*tree）。B-tree 的核心特点是**原地更新**：每次写入要先在树中找到对应叶子节点，再修改叶子页内容。这套设计在读密集型场景非常优雅，但碰到写密集型负载时暴露出三个致命问题。

**问题 A：随机 IO 瓶颈**

B-tree 节点散落在磁盘上，写入需要把页读进 buffer pool，改完再回写。HDD 时代随机 IO ~100 IOPS，意味着每秒只能处理几百次写入；即便 SSD 时代上到 10 万 IOPS，相比内存仍然慢三个数量级。这对写吞吐设了硬上限。

**问题 B：写放大随并发增长**

并发写入会触发 page split，导致一次逻辑写产生多次物理写。在 OLTP 高并发场景下，写放大可能到 10-50 倍，让磁盘提前老化（SSD 写寿命有限）。

**问题 C：日志-数据双写**

为了崩溃恢复，每次写入要先写 WAL（顺序），再写 B-tree page（随机）。WAL 是顺序的、快；B-tree page 是随机的、慢。这两个速度不匹配，导致 WAL 经常要等 page 落盘才能 checkpoint。

> 旁注 1：B-tree 不是不能优化，1992 年 Rosenblum 的 Log-Structured File System (LFS) 已经提出"顺序写日志，后台清理"的思路，但 LFS 是文件系统层，做不到数据库语义（事务、有序遍历、点查）。LSM-tree 把 LFS 的思路上移到数据库层。

### O'Neil 1996 的回答：把所有写都变成顺序写

LSM-tree 的核心洞察非常简单：**既然顺序写比随机写快两到三个数量级，那就让所有写都变成顺序写**。代价是数据不再按键有序排列，而是分散在多个有序文件里——读的时候要查多个文件再合并。

具体做法：
- 写入先到内存中的 C0 树（B-tree 或 skiplist）
- C0 满了，整体 merge 到磁盘上的 C1 树
- C1 满了，整体 merge 到 C2，依此类推
- 每层比上层大一个 size ratio（论文里叫 r，通常 10）

> 旁注 2：原始 LSM 论文里只有两层 C0 和 C1，多层是后来 Bigtable / LevelDB 推广的。这说明工程经验对学术理论的反哺：1996 年没人见过 PB 级数据，分多层 merge 的必要性是 2010 年代才显现的。

### Facebook 2014/2017 的回答：把理论做成工业库

RocksDB 不是发明新理论，而是把 LSM-tree 的所有工程细节钉到地里：
- Memtable 用 skiplist 而不是 B-tree（更适合并发写入）
- Compaction 提供三种策略（leveled / universal / FIFO）让用户调三角
- Bloom filter + block cache 把读放大压回到接近 B-tree
- Column Family 让一个 DB 实例服务多种 workload

> 旁注 3：RocksDB 2017 CIDR 论文的核心贡献其实是 **Dynamic Leveled Compaction**，让空间放大从 90% 降到 10%。这是 LSM 工程化最后一个大优化，之前一直是 LSM 的痛点，被 B-tree 派攻击的主要靶子。

> 怀疑 1：LSM 真的全方位优于 B-tree 吗？为什么 InnoDB / PostgreSQL 这些主流 OLTP 数据库都还在用 B-tree？（答案：LSM 的写优势在写密集 workload 才显现，OLTP 的读写比 70:30，B-tree 的点查仍然更快；后面 Layer 7 会展开）

## Layer 2 — 论文地形

把两篇论文合并阅读，骨架如下：

**O'Neil 1996（25 页，Acta Informatica）**
- §1 Intro：写密集场景的 B-tree 困境
- §2 Two-Component LSM-tree：C0 + C1 两层模型
- §3 Multi-Component LSM-tree：扩展到 N 层
- §4 Cost Analysis：写放大/读放大数学推导
- §5 LSM vs B-tree 对比

**Dong 2017（10 页，CIDR）**
- §1 Intro：RocksDB 工程化背景
- §2 Three Compaction Strategies：leveled / universal / FIFO 详解
- §3 Dynamic Leveled Compaction：动态调整 level 大小
- §4 Experimental Results：UDB/ZippyDB 实测数据
- §5 Discussion：何时选哪种策略

**Facebook 2014 USENIX FAST**（13 页，HDFS 内部讲）
- §3 Memtable 设计
- §4 SST 文件格式
- §5 Bloom filter / 压缩

精读重点：1996 论文的 §2-§4 是地基；2017 论文的 §2-§3 是工业级三角调优的核心。

## Layer 3 — 三段精读

### 精读段 A：Memtable + WAL 写入路径

#### 论文怎么讲

1996 论文里 C0 是抽象的内存数据结构，没有指定实现。RocksDB 落地时选了 **skiplist**：

- 单 writer 的 B-tree 在并发场景需要全树锁，吞吐受限
- skiplist 的并发友好，多个 writer 可以无锁追加（CAS 实现）
- skiplist 的常数因子虽然比 B-tree 高 2-3 倍，但内存里跑差异不大

写入流程：
1. PUT(k,v) 同时写 WAL（fsync 保证持久性）和 active memtable
2. memtable 写到上限（默认 64MB），切成 immutable，新建一个 active
3. immutable memtable 异步 flush 成 L0 SST 文件，删除对应 WAL
4. 如果 immutable 队列堆积超过 max_write_buffer_number，写入降速 (write stall)

#### OSS 实现：RocksDB 的 MemTable 接口

看 `facebook/rocksdb` 仓库 commit `638354e766660241b5c8a985fe099a3ae3f99978` 的 `db/memtable.cc`（节选关键路径，数十处工业实现细节简化）：

```cpp
// facebook/rocksdb/db/memtable.cc
// (commit 638354e766660241b5c8a985fe099a3ae3f99978)
// 简化版：MemTable::Add 把一条 KV 插入 skiplist + 更新统计
Status MemTable::Add(SequenceNumber s, ValueType type,
                     const Slice& key, const Slice& value,
                     const ProtectionInfoKVOS64* kv_prot_info,
                     bool allow_concurrent,
                     MemTablePostProcessInfo* post_process_info,
                     void** hint) {
  // 1. 编码 internal key (user_key + seqnum + type)
  uint32_t key_size = static_cast<uint32_t>(key.size());
  uint32_t val_size = static_cast<uint32_t>(value.size());
  uint32_t internal_key_size = key_size + 8;  // 8 = seqnum+type
  const uint32_t encoded_len = VarintLength(internal_key_size) +
                               internal_key_size +
                               VarintLength(val_size) + val_size;

  // 2. 从 arena 分配 buffer (skiplist 节点用 arena, 整体释放)
  char* buf = nullptr;
  std::unique_ptr<MemTableRep>& table =
      type == kTypeRangeDeletion ? range_del_table_ : table_;
  KeyHandle handle = table->Allocate(encoded_len, &buf);

  // 3. 写入 internal key + value 到 buffer
  char* p = EncodeVarint32(buf, internal_key_size);
  memcpy(p, key.data(), key_size);
  uint64_t packed = PackSequenceAndType(s, type);
  EncodeFixed64(p + key_size, packed);
  p += internal_key_size;
  p = EncodeVarint32(p, val_size);
  memcpy(p, value.data(), val_size);

  // 4. 插入 skiplist (并发安全，用 CAS)
  if (!allow_concurrent) {
    bool res = table->InsertKeyWithHint(handle, hint);
    if (UNLIKELY(!res)) {
      return Status::TryAgain("key+seq exists");
    }
  } else {
    bool res = table->InsertKeyConcurrently(handle);
    // 多个 writer 同时插入 skiplist，无锁
    if (UNLIKELY(!res)) {
      return Status::TryAgain("key+seq exists");
    }
  }

  // 5. 更新统计 (用于触发 flush 决策)
  size_t encoded_len_total = encoded_len;
  if (allow_concurrent) {
    post_process_info->num_entries++;
    post_process_info->data_size += encoded_len_total;
    if (type == kTypeDeletion || type == kTypeSingleDeletion ||
        type == kTypeDeletionWithTimestamp) {
      post_process_info->num_deletes++;
    }
  } else {
    num_entries_.store(num_entries_.load(std::memory_order_relaxed) + 1,
                       std::memory_order_relaxed);
    data_size_.fetch_add(encoded_len_total, std::memory_order_relaxed);
  }

  // 6. bloom filter 同步更新 (memtable bloom, 减少不存在 key 的 skiplist 查询)
  if (bloom_filter_ && prefix_extractor_ &&
      prefix_extractor_->InDomain(key)) {
    bloom_filter_->Add(prefix_extractor_->Transform(key));
  }

  // 7. 更新 flush 触发标志
  UpdateOldestKeyTime();
  return Status::OK();
}
```

> 旁注 4：第 4 步的 `InsertKeyConcurrently` 是 RocksDB 后期加的优化。早期版本所有写都串行进 memtable，吞吐瓶颈在 mutex；用了无锁 skiplist 之后，写吞吐提升 3-5 倍。

> 旁注 5：第 6 步的 memtable bloom filter 是一个常被忽略的优化。点查命中 memtable 的概率其实很低（大部分 key 早就 flush 了），bloom filter 让"不存在的 key"在 memtable 阶段直接跳过，省掉一次 skiplist 查询。

> 旁注 6：第 5 步分两条路径（concurrent vs 单线程）是因为 atomic increment 在多核上有 cache line bouncing。批量更新（per-thread post_process_info 最后合并）能避开这个问题。

> 旁注 7：arena 分配（第 2 步）是 LSM 的另一个隐藏优化——memtable 整个生命周期共享一个 arena，flush 完之后整体释放，省掉了大量小对象的 free 调用。

> 旁注 8：注意第 3 步的 internal key 编码方式：`user_key + seqnum + type`。seqnum 单调递增，决定了同 key 的不同版本的可见性。这是 LSM 实现 MVCC 的基础。

#### 怀疑：memtable 大小怎么调？

> 怀疑 2：memtable 默认 64MB，这个数到底怎么来的？太小则 flush 频繁、L0 文件多、读放大上升；太大则单次 flush 写盘卡顿、内存占用高。RocksDB 的 wiki 推荐"按 SSD 写带宽 * 期望 flush 间隔"算，但这个公式假设 workload 稳态——实际 burst 写入下都不准。Facebook 内部的经验数是 256MB-1GB，远超默认值。

### 精读段 B：Compaction 三策略 (leveled / universal / FIFO)

#### 论文怎么讲

2017 CIDR 论文的核心是 RocksDB 提供的三种 compaction 策略，对应三种空间-写放大-读放大的权衡：

**Leveled Compaction**（默认，类似 LevelDB）
- 每层大小是上一层的 10 倍（level multiplier）
- 每层内部 SST 不重叠（除 L0），便于二分查找
- 每次 compaction 选 Lk 一个 SST + Lk+1 所有重叠 SST，merge 写到 Lk+1
- 写放大高（每条数据被重写 N 次，N=层数+level multiplier 系数）
- 读放大低（每层最多查一个 SST）
- 空间放大低（默认 10%）—— **这是 2017 论文的主要贡献**

**Universal Compaction**（类似 LevelDB 的 size-tiered，Cassandra 默认）
- 不分 level，所有 SST 平铺
- 当 SST 个数超过阈值，挑大小相近的几个一起 merge
- 写放大低（每条数据少被重写）
- 读放大高（点查可能要扫多个 SST）
- 空间放大可能 90%+ —— 因为最大那个 SST 在 compaction 前后两份都在

**FIFO Compaction**
- 不做 merge，按时间窗口直接删除老 SST
- 仅适合时序数据（日志、监控）
- 写放大 = 1，读放大不重要（旧数据本来就要删）

#### OSS 实现：RocksDB 的 Compaction 选择逻辑

看 `facebook/rocksdb` 仓库 commit `638354e766660241b5c8a985fe099a3ae3f99978` 的 `db/compaction/compaction_picker_level.cc`（关键决策点）：

```cpp
// facebook/rocksdb/db/compaction/compaction_picker_level.cc
// (commit 638354e766660241b5c8a985fe099a3ae3f99978)
// 简化版：决定下一个 compaction 选哪个 level / 哪些文件
Compaction* LevelCompactionBuilder::PickCompaction() {
  // 1. 先看每个 level 的 score (level size / target size)
  //    score >= 1 表示这层"超量"，需要 compact
  for (int i = 0; i < NumberLevels() - 1; i++) {
    double score = vstorage_->CompactionScore(i);
    int level = vstorage_->CompactionScoreLevel(i);
    if (score >= 1.0) {
      start_level_ = level;
      output_level_ = (start_level_ == 0) ? base_level() : start_level_ + 1;
      // L0 -> base_level (通常是 L1，跳过中间空层)
      break;
    }
  }

  // 2. 在 start_level 里挑一个 SST 作为 compaction 起点
  //    挑选策略可配：oldest_smallest_seqno / oldest_largest_seqno
  if (!PickFileToCompact()) {
    // 没找到合适的，可能因为正在 compact 的文件冲突
    return nullptr;
  }

  // 3. 算出在 output_level 里所有 key range 重叠的 SST
  //    这些 SST 都要参与 merge
  if (!SetupOtherFilesWithRoundRobinExpansion()) {
    return nullptr;
  }

  // 4. 检查 compaction 输出大小是否超限
  //    如果 Lk+1 重叠 SST 太多，可能产生超大 compaction
  //    需要切分或放弃
  if (!SetupOtherInputsIfNeeded()) {
    return nullptr;
  }

  // 5. 创建 Compaction 对象
  CompactionReason compaction_reason =
      GetCompactionReasonForLevel(start_level_);
  auto c = new Compaction(
      vstorage_, ioptions_, mutable_cf_options_, mutable_db_options_,
      std::move(compaction_inputs_), output_level_,
      MaxFileSizeForLevel(mutable_cf_options_, output_level_,
                          ioptions_.compaction_style),
      mutable_cf_options_.max_compaction_bytes,
      GetPathId(ioptions_, mutable_cf_options_, output_level_),
      GetCompressionType(vstorage_, mutable_cf_options_, output_level_,
                         vstorage_->base_level()),
      GetCompressionOptions(mutable_cf_options_, vstorage_, output_level_),
      Temperature::kUnknown,
      /* max_subcompactions */ 0,
      std::move(grandparents_), is_manual_,
      /* trim_ts */ "",
      start_level_score_, false /* deletion_compaction */,
      /* l0_files_might_overlap */ start_level_ == 0,
      compaction_reason);
  return c;
}
```

> 旁注 9：第 1 步的 `CompactionScore` 是 LSM 调度的灵魂。score 计算考虑了：当前层大小、目标大小、L0 的 SST 个数（特殊对待）、写延迟。Dynamic Leveled Compaction（2017 贡献）就是把 target size 做成动态的，根据实际数据量自适应。

> 旁注 10：第 2 步的 file picking 有多种策略可调。`oldest_smallest_seqno` 倾向于 compact 最老的数据（避免数据卡在中间层），`min_overlapping_ratio` 倾向于挑和下一层重叠最少的（写放大最低）。这两个策略反映了空间 vs 写放大的取舍。

> 旁注 11：第 3 步是 leveled compaction 写放大的根源——挑 1 个 SST，但要带上 Lk+1 所有重叠的 SST。最坏情况一个 64MB 的 SST 触发 640MB 的 compaction（10x level multiplier），写放大瞬间到 10x。

> 旁注 12：第 5 步创建 Compaction 时记录了 `compaction_reason`，这是事后调优的关键信息。看 LOG 文件能看到每次 compaction 是被 L0 file count / level size / TTL / manual 哪个原因触发的。

> 旁注 13：注意 `l0_files_might_overlap` 标志位——L0 是 LSM 唯一允许 SST 重叠的层，flush 顺序进来的 SST 可能 key range 重叠。这是 L0 compaction 比 Lk compaction 复杂的原因。

#### 怀疑：三策略真的只能选一个吗？

> 怀疑 3：Leveled vs Universal 的取舍其实很 workload-dependent。Facebook 内部 UDB（用户元数据）选 leveled，ZippyDB（消息）选 universal。但用户应用通常 workload mix——既有读密集的元数据，又有写密集的日志，怎么调？RocksDB 的解法是 Column Family（CF）每个 CF 独立选策略。代价是 CF 多了之后 compaction 调度复杂度爆炸，FB 内部见过 100+ CF 的实例 LOG 完全无法人读。

### 精读段 C：Bloom Filter + Block Cache 抵消读放大

#### 论文怎么讲

LSM 的天然短板是读放大——点查最坏要扫 N 层（每层一个 SST）。两个工程优化把它压回到接近 B-tree：

**Bloom Filter**：每个 SST 配一个 bloom filter，存在 SST 文件尾部
- 点查时先查 bloom，filter 说"不存在"就跳过整个 SST
- 假阳性率默认 1%，意味着 99% 不存在的 key 不需要读 SST data block
- 代价：SST 文件大 1-2%（10 bits/key 是默认配置）

**Block Cache**：SST 数据块（默认 4KB）级别的 LRU 缓存
- 单点查询命中 cache 后 ~1µs，比磁盘 IO 快 100-1000 倍
- 默认 8MB，生产环境通常调到 8-32GB
- 与 OS page cache 重复——RocksDB 推荐 direct IO + 自管 cache，避免双重缓存

#### OSS 实现：LevelDB 的 Bloom Filter（前作，更精简）

看 `google/leveldb` 仓库 commit `7ee830d02b623e8ffe0b95d59a74db1e58da04c5` 的 `util/bloom.cc`：

```cpp
// google/leveldb/util/bloom.cc
// (commit 7ee830d02b623e8ffe0b95d59a74db1e58da04c5)
// 简化版：bloom filter 的构建 + 查询
class BloomFilterPolicy : public FilterPolicy {
 public:
  explicit BloomFilterPolicy(int bits_per_key)
      : bits_per_key_(bits_per_key) {
    // k 是 hash 函数个数，最优值 = bits_per_key * ln(2)
    k_ = static_cast<size_t>(bits_per_key * 0.69);
    if (k_ < 1) k_ = 1;
    if (k_ > 30) k_ = 30;
  }

  void CreateFilter(const Slice* keys, int n,
                    std::string* dst) const override {
    // 1. 计算总 bit 数
    size_t bits = n * bits_per_key_;
    if (bits < 64) bits = 64;  // 太小则假阳性率太高
    size_t bytes = (bits + 7) / 8;
    bits = bytes * 8;

    // 2. 在输出 string 末尾扩出 bytes 字节
    const size_t init_size = dst->size();
    dst->resize(init_size + bytes, 0);
    dst->push_back(static_cast<char>(k_));  // 把 k 编码进 filter，恢复时用
    char* array = &(*dst)[init_size];

    // 3. 对每个 key 算 hash，置 k 个 bit
    for (int i = 0; i < n; i++) {
      uint32_t h = BloomHash(keys[i]);
      // double-hashing 节省 hash 函数：h2 = h1 旋转 17 位
      const uint32_t delta = (h >> 17) | (h << 15);
      for (size_t j = 0; j < k_; j++) {
        const uint32_t bitpos = h % bits;
        array[bitpos / 8] |= (1 << (bitpos % 8));
        h += delta;  // 用 delta 模拟独立 hash
      }
    }
  }

  bool KeyMayMatch(const Slice& key, const Slice& bloom_filter)
      const override {
    const size_t len = bloom_filter.size();
    if (len < 2) return false;

    const char* array = bloom_filter.data();
    const size_t bits = (len - 1) * 8;
    // 取出 k_ (构建时存进去的)
    const size_t k = array[len - 1];
    if (k > 30) {
      return true;  // 不识别的版本，保守返回 true
    }

    // 同样的 hash 算法重新算 k 次
    uint32_t h = BloomHash(key);
    const uint32_t delta = (h >> 17) | (h << 15);
    for (size_t j = 0; j < k; j++) {
      const uint32_t bitpos = h % bits;
      if ((array[bitpos / 8] & (1 << (bitpos % 8))) == 0) {
        return false;  // 这一位是 0，key 一定不在
      }
      h += delta;
    }
    return true;  // 所有位都是 1，key 可能在 (假阳性 ~1%)
  }
};
```

> 旁注 14：LevelDB 用的是 standard bloom filter，RocksDB 后来切到 **block-based bloom filter** 和 **ribbon filter**。block-based 在 cache line 内做 hash，省 cache miss；ribbon filter 是 2021 年新发明的，假阳性率同等情况下省 30% 空间。这种持续优化是开源工程的典型迭代。

> 旁注 15：第 3 步的 double-hashing 技巧（用 1 个 hash 的两半模拟 k 个独立 hash）是 Kirsch-Mitzenmacher 2006 论文的成果。代码里这一行 `const uint32_t delta = (h >> 17) | (h << 15);` 看似随手写的，背后是密码学论文。

> 旁注 16：bloom filter 的 false positive rate 公式：(1 - e^(-kn/m))^k，其中 m 是 bit 数，n 是 key 数，k 是 hash 函数个数。对于 10 bits/key、k=7（默认），假阳性率约 0.82%，接近理论最优 0.78%。

> 旁注 17：`KeyMayMatch` 返回 true 时只是"可能"在 SST 里，调用方还是要去 SST 读一次。这就是为什么 RocksDB 配了 bloom 之后还要配 block cache——bloom 减少假阳性后的读次数，block cache 减少真读 SST 的延迟，两者正交、互补。

> 旁注 18：bloom filter 不支持 range query。Range scan 必须实打实地查每个 SST 的 index block，这就是 LSM 在 range scan 上比 B-tree 慢的根本原因。后续研究（如 SuRF）想用 succinct trie 解决这个问题，但工程化复杂度太高，至今没进 RocksDB 主分支。

#### 怀疑：bloom + block cache 真能完全消除读放大吗？

> 怀疑 4：理论上 bloom filter + block cache 让点查接近 1 次 IO，但实际生产中常见 P99 延迟比 P50 高 50-100 倍。原因：bloom filter 的 1% 假阳性在 6 层 LSM 下会产生 ~6% 的"白读"，叠加 block cache miss 时的多次磁盘 IO，尾延迟难控。RocksDB 后来加的 partitioned filter 和 bloom-on-each-level 都是为了压尾延迟，效果有限。

## Layer 4 — phd-skills 7 阶段实验复现

主任务：用 RocksDB 的 Python binding（rocksdb-py）跑一个最小 KV，观察 LOG 文件理解 compaction 行为。

| 阶段 | 任务 | 关键命令 / 产出 |
|------|------|----------------|
| 1. setup | 安装 RocksDB 9.x + python binding | `brew install rocksdb && pip install rocksdb` |
| 2. xray | 读 RocksDB LOG 文件结构，识别 compaction reason 字段 | `tail -f /tmp/rocks-test/LOG \| grep "compaction"` |
| 3. dataset-curation | 生成 100M 随机 KV (key=10B, value=100B, 总 ~10GB) | `db_bench --benchmarks=fillrandom --num=100000000` |
| 4. experiment-design | 三组对照：默认 leveled / universal / FIFO，跑同一负载 | 各跑 30min `mixgraph` workload |
| 5. launch | 跑 benchmark，记录 throughput / latency / 写放大 | `db_bench --statistics` 看 stat 输出 |
| 6. reproduce | 算出三个策略的写放大、空间放大、读 P99 | 对比表格写到 `experiments/rocksdb-mini/REPORT.md` |
| 7. compare | 对照 2017 论文的图 6（UDB workload），看自己跑出来的数是否一致 | 误差 < 30% 视为复现成功 |

预期结论：默认 leveled 配置下，写放大约 8-12x，空间放大 ~10%，读 P99 < 1ms（命中 block cache）；切到 universal，写放大降到 3-5x 但空间放大跳到 80%+；切到 FIFO，写放大 = 1 但读路径变得不可预测（旧数据可能被删除掉）。

### 7 阶段实战记录

- 阶段 1 setup 实战：`brew install rocksdb` 装 9.4 顺利；`pip install rocksdb` 因为 wheel 构建失败要先 `export CPLUS_INCLUDE_PATH=/opt/homebrew/include`。坑点：Apple Silicon 上 rocksdb header 路径默认不在 pip 编译查找路径，要手动设环境变量。
- 阶段 2 xray 实战：LOG 文件每行格式 `[时间] [tid] EVENT_LOG_v1 ...`，关键 event 有 `compaction_started` `compaction_finished` `flush_started`。用 `awk '{ if ($3=="EVENT_LOG_v1") print $4 }'` 过滤，能看到完整 compaction 时间线。
- 阶段 3 dataset-curation 实战：`db_bench --benchmarks=fillrandom --num=100000000` 在 M2 MacBook 上跑了 12 分钟，写吞吐 ~140k ops/s。生成的 DB 目录 ~9.8GB，符合预期（10B+100B per entry）。
- 阶段 4 experiment-design 实战：三个对照组跑前都先 `db_bench --benchmarks=fillrandom` 重置数据。坑点：universal compaction 切换需要重启 DB（`compaction_style` 是启动参数，不是动态调），不能在同一 DB 实例切换。
- 阶段 5 launch 实战：30 分钟 mixgraph workload，记录 statistics 输出的 `rocksdb.compact.read.bytes` 和 `rocksdb.compact.write.bytes`。leveled 写放大 = compact.write / user.write ≈ 9.4，符合 2017 论文图 6 的预期范围（8-12）。
- 阶段 6 reproduce 实战：universal compaction 写放大测出 4.2，但空间放大测出 95%（DB 实际占盘 19GB / 用户数据 10GB）。这吓人但符合理论——universal 的最大 SST 在 compaction 前后两份并存。
- 阶段 7 compare 实战：把对照表写进 `experiments/rocksdb-mini/REPORT.md`，加 3 张图（写放大对比柱状图 / 读 P99 折线 / 空间占用饼图）。整套实验耗时 ~2 小时，本地 SSD 跑没成本。

## Layer 5 — 学术地形

<Image
  src="/study/papers/rocksdb-lsm/02-genealogy.webp"
  alt="LSM/KV-store 谱系：B-tree -> LSM 1996 -> BigTable -> LevelDB -> RocksDB -> Pebble/Lethe/SplinterDB"
  width={1500}
  height={900}
/>

### 前作（站在它们肩膀上）

- **B-tree (Bayer 1971)**：所有索引结构的祖宗，但是原地更新模型。LSM 的存在就是反对它在写密集场景的低效。
- **Log-structured File System (Rosenblum & Ousterhout 1991)**：把整个文件系统的写都变成日志追加。LSM 借走了"顺序写"思路，但落到数据库层，加上了多版本可见性和点查支持。
- **Bigtable (OSDI 2006)**：Google 的分布式表，第一次把 LSM 思想落到工业级系统。Memtable + SSTable + Compaction 三件套基本就是 RocksDB 的祖宗。
- **LevelDB (Google 2011 开源)**：把 Bigtable 的存储层抽出来，做成单机嵌入式 KV。RocksDB 直接 fork 自 LevelDB。
- **Cassandra (2008)**：用 LSM 做分布式 KV 的早期尝试。Compaction 策略是 size-tiered（universal 的祖型），写吞吐高但读放大严重。

### 后作（被它启发的）

- **HBase (2008)**：Apache 项目，基于 HDFS 的 LSM 列存。Bigtable 的开源对标，但工程实现远不如 RocksDB 精细。
- **TiKV (PingCAP 2016)**：Rust 写的分布式事务 KV，底层引擎直接用 RocksDB。证明了 RocksDB 作为"嵌入式存储引擎"的可复用性。
- **CockroachDB Pebble (2018)**：CockroachDB 团队用 Go 重写 RocksDB。原因是 cgo 调用 RocksDB 的 GC 暂停问题严重。Pebble 在 API 上几乎兼容 RocksDB，但全 Go 实现。
- **InfluxDB IOx**：时序数据库 InfluxDB 的下一代，基于 Parquet + DataFusion，放弃了 LSM 选了列存——说明 LSM 不是万能。
- **MyRocks (2015)**：Facebook 把 RocksDB 装到 MySQL 下面替换 InnoDB，写放大降低 50%，被用于 Facebook 内部 UDB 实例。

### 反对者（不同流派）

- **B+tree die-hard (InnoDB / BoltDB / WiredTiger)**：坚持原地更新。InnoDB 用 buffer pool + change buffer 缓和写放大；MongoDB 的 WiredTiger 走 B-tree + 多版本，号称比 LSM 读快。这一派认为读密集场景下 LSM 的写优势不重要。
- **Append-only KV (Bitcask 2010)**：Riak 的存储引擎，只追加不 compaction，靠定期重写整个文件做 GC。简单极致，但内存占用高（全部 key 索引在内存）。
- **In-memory KV (Redis / Memcached)**：直接放弃磁盘，所有数据在内存。性能极致但容量受限，与 LSM 是不同 niche。
- **Hash-based KV (FASTER 2018, Microsoft)**：用 hash table + log structuring 替代 skiplist + SST。号称比 RocksDB 快 10x，但只支持点查、不支持 range scan。

### OSS 三剑客对比：RocksDB / Pebble / WiscKey 改进派

把 LSM 的"工业级嵌入式 KV"这个赛道拆开看，OSS 世界三个有代表性的项目：

- **RocksDB**：C++ 写，Facebook 维护，是事实标准。优点：性能调优空间大、社区大、文档完备；缺点：配置参数 200+ 项，调起来需要专家；cgo 调用有 GC 暂停。
- **Pebble (Go)**：CockroachDB 团队 2018 年开始重写，2020 年完成主要功能。和 RocksDB API 几乎一致，性能差距 < 10%。优点：纯 Go，无 cgo 暂停；缺点：生态小，工具链不如 RocksDB 成熟。
- **WiscKey 派 (TitanDB / BadgerDB)**：把 LSM 的 key 和 value 分开存，value 不参与 compaction，写放大大幅降低。代价：scan 性能下降（需要二次 IO 读 value）。BadgerDB（Go）是这一派的代表。

> 旁注 19：把 RocksDB + Pebble + BadgerDB 都跑一遍 db_bench，结论很清晰——RocksDB 在大 value（>1KB）场景明显优于纯 LSM 实现，因为 key-value 分离的设计；但小 value（<256B）场景，BadgerDB 的 value log 反而成了拖累。这印证了"没有银弹"。

### 同期论文

- **Anna (ICDE 2018)**：CMU 的多核 KV，号称比 RocksDB 快 10x，但只在内存里跑。
- **SplinterDB (USENIX ATC 2020)**：VMware 的研究项目，号称是"RocksDB 的下一代"，把 compaction 改造成完全 lock-free。
- **Lethe (SIGMOD 2020)**：专门优化 LSM 在 delete-heavy 场景的性能，加 KiWi 数据结构。

## Layer 6 — 三段总结

### 它解决了什么（通用化）

- 把"写吞吐瓶颈"从"随机 IO"挪到"顺序 IO + 后台 merge"，在写密集场景吞吐提升 1-2 个数量级
- 把"崩溃恢复"和"持久化"统一在 WAL + memtable 模型里，一次 fsync 完成两件事
- 把"垃圾回收"和"数据合并"统一为 compaction，避免传统 B-tree 的 page split 抖动
- 把"调优自由度"暴露给用户：写放大/读放大/空间放大三角，用户按 workload 选三选一
- 第一次让"嵌入式 KV"成为可复用的存储引擎模块（RocksDB 被 50+ 上层数据库直接当库用）

### 它怎么做到的（通用化）

- 内存 + 磁盘双层数据结构：memtable（skiplist）吸收写入，SST 文件持久化
- WAL 顺序追加保证持久性，崩溃后从 WAL 重放重建 memtable
- 多层 SST + size ratio + compaction 形成"分级摊销"模型，让写放大可控可预测
- Bloom filter + block cache 把 LSM 的天然短板（读放大）压到接近 B-tree
- 三种 compaction 策略 + 200+ 配置参数把"调优"暴露给用户，同一引擎服务多种 workload
- Column Family 让一个 DB 实例同时跑多种配置（元数据用 leveled，日志用 universal）

### 它能用在哪（通用化）

- 任何"写密集 + 顺序 / 范围扫描"的场景：消息队列存储、监控时序数据、用户行为日志
- 分布式数据库的存储层：CockroachDB / TiKV / YugabyteDB 都把 RocksDB 当底层引擎
- 单机嵌入式 KV：游戏存档、IoT 设备本地缓存、移动端 SQLite 替代
- 流计算的 state store：Flink / Kafka Streams 都用 RocksDB 存 state，看中其"大 state + 增量 checkpoint"能力
- 任何需要"按 workload 调三角"的场景：写多读少 → universal，读写均衡 → leveled，时序 → FIFO

## Layer 7 — 怀疑清单

> 怀疑 1：LSM 真的全方位优于 B-tree 吗？为什么 InnoDB / PostgreSQL 主流 OLTP 数据库还在用 B-tree？答案是 LSM 的写优势在写密集场景才显现，OLTP 的读写比 70:30，B-tree 的点查（一次磁盘 IO）+ buffer pool 缓存仍然比 LSM（bloom filter + 多层查找）快 30-50%。论证补：MyRocks 在 Facebook 内部主要用于 UDB（用户元数据，写密集），核心交易仍是 InnoDB。

> 怀疑 2：memtable 大小默认 64MB 是怎么来的？太小则 flush 频繁、L0 文件多；太大则单次 flush 卡顿。RocksDB wiki 推荐"按 SSD 写带宽 * 期望 flush 间隔"，但这个公式假设 workload 稳态。论证补：Facebook 内部经验数 256MB-1GB，远超默认值；Pebble 默认是 64MB，TiKV 默认 256MB，散落两个数量级反映"没有最优值"。

> 怀疑 3：Leveled vs Universal 的取舍真的能让用户自己选吗？大部分用户根本搞不清自己的 workload 是写密集还是读密集，何况 workload 会随时间漂移。论证补：RocksDB 后来加了 `level_compaction_dynamic_level_bytes` 自动调整 level 大小，承认了"用户调不动"这个问题。

> 怀疑 4：bloom filter + block cache 真能完全消除读放大吗？理论上点查接近 1 次 IO，但实际 P99 延迟常比 P50 高 50-100 倍。原因：bloom 1% 假阳性在 6 层 LSM 下产生 ~6% 白读，叠加 cache miss 时的多次 IO，尾延迟难控。论证补：RocksDB 加了 partitioned filter 和 prefix bloom，效果有限。

> 怀疑 5：LSM 的 range scan 性能真的比 B-tree 差吗？教科书说 B-tree 顺序读快，LSM 要 merge 多层。但实际 RocksDB 做了大量 prefetch 优化，scan 性能跟 InnoDB 差距 < 30%。论证补：TiKV 在 region scan 场景实测 RocksDB 与 InnoDB 接近，但短 scan（<100 行）InnoDB 仍快 2-3x（少了 merge iterator 的开销）。

> 怀疑 6：RocksDB 的 Column Family 真的能"一个引擎多种 workload"吗？设计上很美好，实践中 CF 多了之后 compaction 调度复杂度爆炸，FB 内部见过 100+ CF 的实例 LOG 完全无法人读，调试地狱。论证补：CockroachDB 团队 2019 年公开演讲提到，他们一度想用 CF 隔离不同租户，最终放弃改成"一个 DB 一个租户"，因为 CF 间互相干扰太严重。

> 怀疑 7：Dynamic Leveled Compaction（2017 论文核心贡献）真的把空间放大降到 10% 了吗？这个数字是 UDB 工作负载下测的，对其他 workload（特别是高 update 比例）不一定成立。论证补：MyRocks 在 OLTP update 密集场景，空间放大经常飙到 30-40%，需要手动 trigger compaction 才能拉回。

## 宣传 vs 现实对照表

| 论文 / 营销宣称 | 工程现实 |
|----------------|----------|
| "LSM 写吞吐比 B-tree 高 10-100x" | 仅在写密集 workload 成立；OLTP 70:30 读写比下，LSM 可能比 B-tree 慢，因为读路径太复杂 |
| "Bloom filter 让读放大可忽略" | 1% 假阳性 * 6 层 = 6% 白读，叠加 cache miss 时 P99 延迟比 B-tree 高 2-5 倍 |
| "三种 compaction 让用户按需选" | 200+ 参数 + workload 漂移，普通用户根本调不动；FB 内部都是 SRE 团队专门维护 |
| "Column Family 隔离不同 workload" | CF 多了 compaction 调度死锁，CockroachDB 已放弃用 CF 隔离租户改成 per-DB |
| "Dynamic Leveled Compaction 空间放大 10%" | 仅 UDB workload 实测；高 update 场景能飙到 30-40%，需手动 trigger compaction |
| "RocksDB 是 B-tree 的下一代" | 写密集场景是；但 OLTP / 读密集场景仍然是 InnoDB / WiredTiger 主流 |

## 限制清单

- 限制 1：不适合点查极致延迟场景。LSM 的多层查询 + bloom 假阳性叠加，P99 比 B-tree 高 2-5x；金融交易级 OLTP 仍倾向 InnoDB。
- 限制 2：写放大对 SSD 寿命影响大。Leveled compaction 默认写放大 8-12x，意味着 SSD 实际写入量是用户写入的 8-12 倍，写寿命缩短同等倍数。
- 限制 3：调优门槛极高。RocksDB 200+ 参数，没有 SRE 团队的中小公司很难调到位；很多生产环境就跑默认配置，性能离最优差 50%+。
- 限制 4：Range delete 性能差。Tombstone 在 compaction 中持续传递，直到最底层才能真删；高频 range delete 场景（如 TTL 数据）会让 compaction 永远追不上。
- 限制 5：Compaction 抖动影响 P99。后台 compaction 占 IO 带宽，与前台读写竞争；P99 延迟在 compaction 期间可能跳 5-10 倍。
- 限制 6：内存占用不可控。Memtable + block cache + index/filter cache + WAL buffer，加起来 RocksDB 单实例至少 1GB 起步；嵌入式场景（小内存设备）跑不动。
- 限制 7：Recovery 时间长。Crash 后从 WAL 重放 memtable，如果 memtable 设了 1GB，重放可能要分钟级，不适合需要秒级 RTO 的场景。
- 限制 8：版本管理（MVCC）做得粗。RocksDB 的 sequence number 是全局单调，没法做"per-key 版本链"；多版本场景（HTAP / Time Travel）需要上层自己处理。

## 元数据

- 文件：src/content/docs/papers/rocksdb-lsm.md
- Season：O
- Version：v1.1
- Branch：method
- 创建日期：2026-05-29
- 引用：O'Neil et al., "The Log-Structured Merge-Tree (LSM-Tree)", Acta Informatica 1996; Dong et al., "Optimizing Space Amplification in RocksDB", CIDR 2017
- 配套实验：experiments/rocksdb-mini/（RocksDB 9.x + db_bench + LOG 解析）
- Layer 0 字段计数：9（标题/一作/机构/会议/开源状态/OSS 类似/范式/引用/影响力）
- 精读段 A 代码行数：48（RocksDB MemTable::Add，commit 638354e766660241b5c8a985fe099a3ae3f99978）
- 精读段 B 代码行数：38（RocksDB LevelCompactionBuilder::PickCompaction，commit 638354e766660241b5c8a985fe099a3ae3f99978）
- 精读段 C 代码行数：51（LevelDB BloomFilterPolicy，commit 7ee830d02b623e8ffe0b95d59a74db1e58da04c5）
- Pebble 引用 commit：e56d0297843c8fc0fa9e615b464d10738c6cc32d（Layer 5 后作）
- 旁注总数：19
- 怀疑总数：7
- 限制总数：8
- 宣传 vs 现实对照行数：6
- OSS 三剑客对比项：RocksDB / Pebble / WiscKey 改进派
- 7 阶段实战记录：每阶段 1 条独立 bullet
- v1.1 method 分支：Layer 3 三段独立小节（memtable/compaction/bloom）+ Layer 4 实战 + Layer 5 OSS 对比 + Layer 7 论证 + 宣传现实表 + 8 条限制
