---
title: LSM-tree 与 RocksDB — 把所有写都变成顺序写
来源: 'O''Neil et al., "The Log-Structured Merge-Tree", Acta Informatica 1996; Dong et al., "Optimizing Space Amplification in RocksDB", CIDR 2017'
日期: 2026-05-30
子分类: 数据库
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

LSM-tree（**Log-Structured Merge-Tree**）是一种**让所有写入都变成"顺序追加"，再后台慢慢整理成有序文件**的存储结构。日常类比：像快递分拣站——快递员先把包裹随手丢进入口的大筐（写得快），再有人慢慢把筐里的包裹按目的地分类装车（后台整理）。

你写一个 KV：

```
db.put("user:42", "Alice")
```

LSM 不会立刻在硬盘上找"user:42 应该放哪里"，而是：

1. 把这条 KV 追加到内存里的 memtable（一个排好序的临时结构）
2. memtable 满了，整体 flush 成一个磁盘文件（叫 SST）
3. 后台慢慢把多个 SST 合并、按 key 排序——这一步叫 **compaction**

RocksDB 是 Facebook 2012 年从 Google LevelDB fork 出来的工业级 LSM 实现，是现在大半个数据库圈的"地基"。

## 为什么重要

不理解 LSM-tree，下面这些事都没法解释：

- 为什么 CockroachDB / TiKV / Cassandra / Kafka Streams 底下都是 RocksDB 这一个引擎
- 为什么"写吞吐"和"读延迟"在数据库里是两个互相冲突的指标，调一个就伤另一个
- 为什么 SSD 上跑数据库要担心"写放大"——你写 1GB 数据，硬盘上实际写了 10GB
- 为什么 OLTP 主流（MySQL InnoDB / PostgreSQL）还在用 B-tree，LSM 没"统一江湖"

## 核心要点

LSM-tree 的核心思想可以拆成 **三步**：

1. **顺序写代替随机写**：所有写入先到内存 memtable（用 skiplist 实现，并发友好），再顺序追加 WAL 日志保持久。HDD 顺序 IO 比随机快 100 倍，SSD 也快 5-10 倍——只要写都顺序，吞吐就上去了。

2. **分层存储 + 后台合并**：磁盘上分多层（L0/L1/L2/...），每层比上层大 10 倍。memtable 满了 flush 到 L0；某层满了，**compaction** 把它和下一层重叠的部分 merge 写到下一层。这一步是 LSM 的"代价"——同一条数据被反复重写。

3. **bloom filter + block cache 抵消读放大**：点查时最坏要扫 N 层。每个 SST 配一个 bloom filter（1% 假阳性率），让"不存在的 key"99% 直接跳过；热数据放 block cache 里，避免重复读盘。

整套设计本质是一个**三角权衡**：写放大 / 读放大 / 空间放大，三选二，永远有一个变差。

## 实践案例

### 案例 1：用 30 行 Python 模拟 LSM 写入路径

```python
class TinyLSM:
    def __init__(self):
        self.memtable = {}      # 内存表 (实际是 skiplist)
        self.sst_files = []     # 磁盘 SST 列表

    def put(self, key, value):
        self.memtable[key] = value
        if len(self.memtable) >= 4:    # 满了就 flush
            self._flush()

    def _flush(self):
        sorted_kv = sorted(self.memtable.items())
        self.sst_files.append(sorted_kv)  # 一个新 SST
        self.memtable.clear()

    def get(self, key):
        if key in self.memtable:
            return self.memtable[key]
        for sst in reversed(self.sst_files):  # 从新到旧扫
            for k, v in sst:
                if k == key:
                    return v
        return None
```

注意 `get` 要从最新 SST 往老扫——同一个 key 可能在多个 SST 里有不同版本，最新的胜。这就是为什么 LSM 读慢：要扫多个文件。

### 案例 2：用 db_bench 看真实 RocksDB 的 compaction 行为

```bash
db_bench --benchmarks=fillrandom --num=1000000 \
  --db=/tmp/rocks-test --statistics
tail -100 /tmp/rocks-test/LOG | grep "compaction"
```

LOG 里能看到 `compaction_started reason: LevelL0FilesNum`——说明 L0 文件太多触发了 compaction。`statistics` 输出里 `rocksdb.compact.write.bytes / user.write.bytes` 就是写放大，默认 leveled 配置下大约 8-10。

### 案例 3：切 compaction 策略对比三角

```python
# 三种策略一行配置切换
opts = rocksdb.Options()
opts.compaction_style = rocksdb.kCompactionStyleLevel    # 写多读少
# opts.compaction_style = rocksdb.kCompactionStyleUniversal # 写极多
# opts.compaction_style = rocksdb.kCompactionStyleFIFO   # 时序数据
```

实测：同样 10GB 数据，leveled 写放大 9x、空间放大 10%；universal 写放大 3x 但空间放大 90%（最大 SST 在 compact 前后两份并存）；FIFO 写放大 1x 但只能按时间删数据。

## 踩过的坑

1. **memtable 默认 64MB 不通用**：太小则 flush 频繁、L0 文件多、写 stall（前台 put 直接被卡住）；太大则单次 flush 卡顿、recovery 时间长。生产经验数 256MB-1GB，与默认差一个数量级。

2. **写放大对 SSD 寿命影响大**：leveled compaction 默认写放大 8-12x。写 1GB 用户数据，SSD 实际写 10GB，寿命缩短同等倍数。SSD 写寿命有限（TBW），高频写场景三年就报废。

3. **range delete 永远追不上**：`delete_range(a, z)` 不真删数据，而是写一条 tombstone 标记。tombstone 在 compaction 中持续往下传递，直到最底层才能真删。TTL 数据高频删除时，compaction 永远追不上写入，老 tombstone 越堆越多。

4. **compaction 抖动让 P99 飞**：后台 compaction 占 IO 带宽，与前台读写竞争。P50 延迟 1ms 时 P99 可能 50ms——不是代码慢，是这一刻 compaction 正在写盘。生产上要配 rate limiter 限 compaction 带宽。

## 适用 vs 不适用场景

**适用**：
- 写密集型 workload（消息队列、监控时序数据、用户行为日志）
- 分布式数据库存储层（CockroachDB / TiKV / YugabyteDB 都用 RocksDB 当底）
- 流计算的 state store（Flink / Kafka Streams 看中其增量 checkpoint 能力）
- 需要"按 workload 调三角"的场景——同一引擎服务多种负载

**不适用**：
- 点查极致低延迟（金融 OLTP）→ B-tree 一次磁盘 IO 仍快 30-50%，选 [[aries-1992]] 这条线的 InnoDB
- 内存远大于数据集 → 选 Redis / Memcached 直接全在内存
- 短 range scan（<100 行）→ B-tree 顺序读快 2-3x（少 merge iterator 开销）
- 不愿调 200+ 参数 → 默认配置下性能离最优常差 50%+，没 SRE 团队就别上

## 历史小故事（可跳过）

- **1991 年**：Rosenblum & Ousterhout 的 Log-Structured File System 提出"整个 FS 写都变成顺序日志"，但是文件系统层不带数据库语义。LSM 借走了"顺序写"思路。
- **1996 年**：Patrick O'Neil 在 UMass Boston 发表 LSM-tree 原始论文（Acta Informatica），只有两层 C0 和 C1，奠基理论。
- **2006 年**：Google Bigtable（OSDI）把 LSM 思想落到工业级——memtable + SSTable + compaction 三件套基本是 RocksDB 的祖宗。
- **2011 年**：Google 开源 LevelDB（Bigtable 存储层抽出来做单机嵌入式 KV）。
- **2012 年**：Facebook fork LevelDB 改成 RocksDB，加了多线程 compaction、column family、200+ 调优参数。
- **2017 年**：CIDR 论文公布 Dynamic Leveled Compaction，把空间放大从 90% 降到 10%——LSM 工程化的最后一个大优化。

## 学到什么

1. **顺序写 vs 随机写的两个数量级差距**是过去 30 年存储引擎设计的最重要约束之一
2. **三角权衡**（写放大 / 读放大 / 空间放大）没有银弹——任何"全方位优于 X"的宣传都要警惕
3. **理论 → 工业 → 生态**：1996 论文 → 2006 Bigtable → 2011 LevelDB → 2012 RocksDB → 50+ 上层数据库，20 年积累
4. **可调参数也是产品**：RocksDB 200+ 参数表面是"调优自由度"，实际是"把工程难题甩给用户"

## 延伸阅读

- 视频教程：[CMU 15-445 — LSM-Tree](https://www.youtube.com/watch?v=hkMkBZn5OOk)（Andy Pavlov 1 小时讲透）
- 实战指南：[RocksDB Tuning Guide](https://github.com/facebook/rocksdb/wiki/RocksDB-Tuning-Guide)（官方调优手册，必读）
- O'Neil 1996 PDF：[The Log-Structured Merge-Tree](https://www.cs.umb.edu/~poneil/lsmtree.pdf)（25 页奠基论文）
- [[bigtable-2006]] —— Google 第一次把 LSM 推到工业级
- [[cassandra-2010]] —— 用 LSM 做分布式 KV 的早期尝试
- [[skip-list-1990]] —— RocksDB memtable 的底层数据结构

## 关联

- [[bigtable-2006]] —— Bigtable 把 LSM 推到工业级，三件套是 RocksDB 的祖宗
- [[cassandra-2010]] —— size-tiered compaction 是 RocksDB universal 策略的祖型
- [[skip-list-1990]] —— memtable 用 skiplist 替代 B-tree，并发友好
- [[volcano-1994]] —— LSM 是存储层；Volcano 是查询层；二者垂直组合成完整 OLAP 引擎
- [[aries-1992]] —— B-tree 派的 WAL + 原地更新方案，与 LSM 形成 OLTP vs 写密集的对位
- [[spanner-2012]] —— Spanner 底层用 Bigtable 系存储，证明 LSM 可扩到全球分布式
- [[tigerbeetle]] —— 不用 LSM 的反例：金融 OLTP 选了静态 B-tree，因为 P99 比吞吐更重要

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[art-2013]] —— ART 自适应基数树 — 内存数据库为主索引重新选材
- [[b-tree-1972]] —— B-Tree 1972 — 磁盘友好的索引结构
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[cassandra-2010]] —— Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
- [[conduit]] —— Conduit — Rust 写的极简 Matrix homeserver，单二进制 + 嵌入式数据库
- [[lmdb-2011]] —— LMDB 2011 — 把数据库直接 mmap 进内存的嵌入式 KV 存储
- [[mariadb-server]] —— mariadb-server — MySQL 原作者带走的那一支
- [[paxos]] —— Paxos — 分布式共识算法
- [[persistent-memory-2014]] —— PMFS — 第一个为字节寻址持久内存设计的文件系统
- [[rocksdb-2017]] —— RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验
- [[silt-2011]] —— SILT — 0.7 字节内存索引一条记录的 flash 键值存储
- [[skip-list-1990]] —— Skip List — 用抛硬币代替平衡树
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[sqlite-2022]] —— SQLite — 嵌入式数据库 30 年怎么活下来的
- [[tidb-2020]] —— TiDB 2020 — 给 Raft 加一个"旁听生"，让一份数据同时跑事务和分析
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流

