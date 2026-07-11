---
title: Badger — Go 写的键值分离 LSM
来源: https://github.com/dgraph-io/badger
日期: 2026-05-31
分类: 数据库 / 存储引擎
难度: 中级
---

## 是什么

Badger 是一个**嵌入到 Go 进程里的键值存储库**——和 [[rocksdb]] 一样不起服务、不监听端口，你 import 它，调 API 就能存取。底层用 LSM 树，但做了一个关键改动：**把键和值分开存**。键留在小小的 LSM 里，值丢到一个叫 **Value Log（vlog）** 的追加文件里，LSM 只存一个指针。

日常类比：图书馆借书系统。**老 LSM**（[[rocksdb]] / [[leveldb]]）是把整本书都搬到目录卡片旁边，搬一次累一次；**Badger（WiscKey 思路）** 是卡片上只写"3 号仓库 17 排"，书本身留在仓库——查目录飞快，要书时再去仓库拿一次。

它由 [[dgraph-io]] 公司在 2017 年开源，作者 Manish R Jain。动机很直接：[[dgraph-io]] 是 Go 写的图数据库，需要嵌入式 KV 但不想引入 cgo（C++ 那一套交叉编译麻烦、调试痛苦）。更准确地说，Badger 是当时少数面向生产负载、纯 Go、主打 LSM 的嵌入式 KV 引擎。

## 为什么重要

不理解 Badger，下面这些事都解释不通：

- 为什么 Go 生态里写需要持久化的服务时，老手会先看 Badger 而不是 cgo 包装 [[rocksdb]]——交叉编译省心
- 为什么 [[dgraph-io]]、IPFS 一些组件、Authelia、OutlineVPN 都选了它——KV 库的语言生态壁垒比想象中高
- 为什么"键值分离"这个 2016 年 [[wisckey-2016]] 论文里的想法值得专门写一遍——它质疑了 LSM 二十年的一个隐含假设
- 为什么 SSD 的普及反过来又改变了 LSM 的最优形态——硬件变了，软件设计的最佳点跟着挪

## 核心要点

Badger 的工作流程拆成 **四步**，和 [[rocksdb]] 最大的差别在第 3 步：

1. **WAL + MemTable**——写入先 append 到日志，同时进内存 skiplist。和 [[rocksdb]] 一样兜底崩溃。

2. **Flush 到 LSM**——MemTable 满了刷到磁盘的 SST。但只刷**键 + 一个指针**，不刷值。值早在第 1 步就 append 到 vlog 了。

3. **Value Log（vlog）**——这是 Badger 的核心。所有值顺序追加到 vlog 文件，每个值在文件里有一个 `(fid, offset, len)` 三元组，LSM 里存的就是这个三元组。

4. **读路径**——先查 LSM 拿到指针（这一步几乎全在内存，因为 LSM 很小），再去 vlog 随机读一次拿到值。两次磁盘访问，但第一次几乎不算。

整套设计的核心权衡：**LSM 变小** → compaction 更便宜、bloom filter 装得下、范围扫描索引部分飞快；代价是**范围扫描值** 变成 vlog 上的随机读。

举个数字感：键 16B、值 1KB、1 亿条。原始数据约 100GB。

- 纯 LSM（[[rocksdb]]）：所有 100GB 进 LSM，每次 compaction 搬大半遍
- Badger：LSM 只装 16B 键 + 16B 指针 = 约 3GB，剩下 100GB 全在 vlog 顺序追加。compaction 只搬 3GB 那部分

## 相比 RocksDB 改了什么

[[rocksdb]] 把键和值一起放进 SST，每次 compaction 把值也搬一遍——在键大小 16B、值大小 1KB 的负载下，compaction 99% 的 IO 都花在搬值。Badger 改的就是这一点：

- **键值分离**：值不进 LSM，compaction 只搬键。写放大从 10–30 倍降到接近 1–3 倍
- **vlog GC**：值不在 LSM 就不会随 compaction 自动清。Badger 起后台线程扫 vlog，对每个值反查 LSM——还活着就重写到新 vlog 末尾，死了就让旧 vlog 段被截掉
- **MVCC + SSI 事务**：所有键加单调时间戳后缀，事务用 Serializable Snapshot Isolation
- **纯 Go**：没 cgo，`go build` 一发交叉编译。监控、pprof、race 检测都用得上
- **代价**：相同数据集，内存占用比 [[leveldb]] 高（bloom + table cache + vlog cache 三块）；范围扫描值时是 vlog 随机读，HDD 上拉胯

## 实践案例

### 案例 1：[[dgraph-io]] 把它当主存储

```text
key   = edge:<user>:<friend>
value = 一段属性列表 / posting list
写入  = append 到 vlog，LSM 只记录 key → value 指针
```

逐部分解释：图数据库里每条边、每个属性都能落成 KV；值大小差异极大，小到 8 字节计数器，大到 KB 级列表。键值分离让 compaction 只搬 key 和指针，否则光搬属性值就会吃光磁盘带宽。

### 案例 2：IPFS 用它存 blockstore

```go
err := db.Update(func(txn *badger.Txn) error {
    cidKey := []byte("block:<cid>")
    block := []byte("...几十 KB 到几 MB 的内容块...")
    return txn.Set(cidKey, block)
})
```

逐部分解释：`cidKey` 是内容地址，`block` 是真正的大值；Badger 把大值放进 vlog，LSM 只保留索引。IPFS 这类 blockstore 对写放大敏感，加上 Go 生态原生，所以部分实现会选择 Badger。

### 案例 3：Go 服务本地队列 / 持久缓存

```go
err := db.Update(func(txn *badger.Txn) error {
    key := []byte(fmt.Sprintf("queue:%020d", nextID))
    return txn.Set(key, payload)
})
```

逐部分解释：`queue:` 前缀把队列数据聚到同一段 key 空间；补零的 `nextID` 让字典序等于时间顺序；事务保证"写入任务"和"推进游标"可以一起成功。比起拉一个 Redis 或写文件锁，单二进制部署简单一档。

## 踩过的坑

1. **vlog GC 跟不上写入**：写多删多的负载，旧值在 vlog 里堆成"垃圾"，GC 是按"丢弃比例"触发的。如果 GC 触发慢，磁盘会涨到 2–3 倍实际数据量。`DiscardRatio` 调小一点能更激进 GC，代价是后台 IO

2. **范围扫描在 HDD 上慢**：迭代器先在 LSM 顺序读出指针流，但每个指针指向 vlog 的随机位置——HDD 寻道一次就毁了。SSD 上没事

3. **不能两个进程同时打开**：Badger 用文件锁防止多开。第二个进程通常会打开失败或拿不到锁；生产里见过启动脚本误开两份的事故

4. **内存预算容易超**：默认配置下，table cache + bloom + index 加起来很容易上 GB。`Options.MemTableSize` / `BlockCacheSize` / `IndexCacheSize` 三个调一下

5. **大 value 的尴尬**：值非常大（>1MB）时，vlog GC 重写一次成本高、IO 突刺明显。Badger 给了 `ValueThreshold`——小于阈值的值还是塞 LSM 里

6. **版本和 API 演进**：v1 → v2 → v3 → v4 几次破坏性 API 变更。生产升级要看 changelog，不是无脑 `go get -u`

7. **`Txn.Commit` 不等于持久化**：默认是异步刷盘，对 WAL 也只是写到 OS 缓冲。要严格的崩溃一致用 `SyncWrites=true` 或事务后显式 `db.Sync()`。这点和 [[rocksdb]] 的 `WriteOptions.sync` 思路一致，新人常默认值就上线

## 适用 vs 不适用场景

**适用**：

- Go 服务里需要嵌入式持久化 KV，不想引入 cgo 依赖
- 写多读少 + 值偏大（数百字节到 MB）——键值分离收益最大
- SSD 为主，对单二进制部署有要求（容器、边缘节点、桌面应用）
- 需要 SSI 事务但又不想起一个数据库

**不适用**：

- 跨机器分布——和 [[rocksdb]] 一样，KV 库不管复制，得在上面叠 raft / paxos
- 极小值（< 100 字节）的密集写——分离收益不抵指针开销，纯 LSM 反而好
- HDD 为主存储——vlog 随机读吃寻道
- 需要 SQL、二级索引、复杂查询——这是上层的事

## 三种放大：Badger 的曲线

LSM 调优永远在三个放大之间挪动，Badger 把曲线移到了和 [[rocksdb]] 不一样的地方：

- **写放大**：Badger 显著低（典型 1–3 倍），因为 compaction 不搬值。但 vlog GC 又把一部分写放大补回来——总账要看 GC 频率
- **读放大**：点查类似——LSM 几层 + 一次 vlog 随机读。范围扫描时变差，因为读完键还要逐个回 vlog 拿值
- **空间放大**：vlog GC 滞后时空间放大可达 2–3 倍，远比 [[rocksdb]] 的 level compaction 难控制。要靠 `DiscardRatio` 和 GC 频率压住

简单说：**写放大换空间放大**。如果磁盘便宜、写入是瓶颈，Badger 赢；如果磁盘紧、写入不极端，[[rocksdb]] 反而稳。

## 历史小故事（可跳过）

- **2016 年**：威斯康星大学 Lu 等人发表 [[wisckey-2016]] 论文，提出键值分离能把 SSD 上的写放大砍一个数量级
- **2017 年**：[[dgraph-io]] 把这套思路用 Go 实现并开源，命名 Badger（獾——挖洞动物，键值"挖出来分开放"的隐喻）
- **2019 年**：v2 大改 vlog 设计，引入更激进的 GC
- **2021 年**：v3 加 stream 写、改默认值，并发性能提升
- **2023 年**：v4 拆分模块、清理 API
- 与此同时，[[cockroachdb]] 选了另一条路——Go 重写 [[rocksdb]] 叫 Pebble，**没用**键值分离，理由是他们的负载值都不大

## 学到什么

1. **键值分离** 是 LSM 的二阶优化——一阶（[[leveldb]] / [[rocksdb]]）已经赢过 B+ 树，二阶针对"小键大值 + SSD"再赢一次
2. **GC 是隐藏成本**——分离把 compaction 减负的代价是多了一种后台清理
3. **语言生态壁垒真实存在**——Go 项目用 [[rocksdb]] 要 cgo，跨平台编译会哭。Badger 的存在本身就是答案
4. **硬件变化驱动软件重构**——LSM 因 SSD 兴起；键值分离又因 SSD 顺序写优势而合理。下一代 ZNS / 持久内存还会再改设计点
5. **[[wisckey-2016]] 论文 → 工业落地** 一年内完成——比 LSM 当年从论文到工业用了十年快得多。开源生态成熟了

## 延伸阅读

- 论文：[[wisckey-2016]]（FAST 2016，12 页，可读性高）
- Dgraph 博客：*Introducing Badger*、*Badger 2.0*、*Badger 4.0*
- [[rocksdb]] —— 直接对照组，没做键值分离的 LSM
- [[leveldb]] —— LSM 的工业起点
- [[lsm-tree-1996]] —— LSM 思想的源头论文

## 关联

- [[rocksdb]] —— 同样是嵌入式 LSM 引擎，没做键值分离
- [[leveldb]] —— Badger LSM 部分的设计参考
- [[wisckey-2016]] —— Badger 实现的论文蓝本
- [[dgraph-io]] —— Badger 的诞生宿主
- [[lsm-tree-1996]] —— LSM 思想的祖宗

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bbolt]] —— bbolt — Go 嵌入式 B+ 树 KV
- [[pebble]] —— Pebble — CockroachDB 自研 LSM
- [[sled]] —— sled — Rust 现代 BTree + LSM 混合嵌入式 KV
- [[unqlite]] —— UnQLite — C 写的嵌入式 NoSQL 双模数据库
