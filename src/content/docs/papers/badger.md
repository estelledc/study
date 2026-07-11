---
title: BadgerDB — 把键和值分开存的 Go 原生 KV 库
来源: 'Lu et al., "WiscKey: Separating Keys from Values in SSD-Conscious Storage", FAST 2016 / Dgraph Labs Badger 实现'
日期: 2026-05-31
分类: 存储系统
难度: 中级
---

## 是什么

Badger（BadgerDB）是一个**纯 Go 写的嵌入式键值存储库**。日常类比：像图书馆的"卡片目录 + 书库"两段式系统——卡片只写"这本书在书库第几号位"，书本身堆在仓库。查目录飞快，需要书才走一趟仓库。

它的核心设计来自 2016 年 FAST 论文 **WiscKey**：把传统 LSM 树里"键和值放一起"的做法拆成两半——

- **键 + 元信息** 留在 LSM 树里（树会很小，常驻内存或几乎全在内存）
- **值** 单独写到一个**追加日志文件**（Value Log，简称 vlog），LSM 里只存它的偏移量

Badger 是 Dgraph（图数据库）作者们在 2017 年开源的，因为他们想要一个**没有 cgo、纯 Go 编译、能直接 `go build` 的 KV**——LevelDB / RocksDB 都是 C++，集成进 Go 项目要走 cgo，编译和分发都麻烦。

## 为什么重要

如果不理解 Badger / WiscKey 的思路，下面这些事讲不清：

- 为什么 RocksDB / LevelDB 在大 value 写入下**写放大**能到 10–50 倍——每次 compaction 都要把值重写一遍
- 为什么 SSD 时代再去优化"顺序读 vs 随机读"的差距没那么大——SSD 随机读已经够快
- 为什么 Dgraph、IPFS、Authelia 这类 Go 项目能干净地嵌一个本地存储——不是它们运气好，是 Badger 把这条路打通了
- 为什么"键值分离"听起来简单，实际上要解决"垃圾回收谁的"这个新问题

## 核心要点

Badger 的核心其实就 **三件事**：

1. **小 LSM 树**：键、版本号、值在 vlog 里的偏移量都进 LSM。值本身**不进**。所以这棵树非常小，compaction 廉价。

2. **Value Log（vlog）**：所有值按写入顺序追加到一个文件里。写永远是**顺序写**，对 SSD 友好。每条记录形如 `[key, value, meta, crc]`。

3. **vlog GC**：键被覆盖或删除后，vlog 里那条旧记录就是"垃圾"。Badger 周期性扫描 vlog 头部，把还活着的值（去 LSM 查一下还在不在）重写到尾部，然后丢掉旧块。这一步本质就是堆的 mark-and-sweep，只不过对象换成了磁盘上的字节段。

加一些工程料：

- **Memtable** 是一个 skiplist（Arena-backed，分配走自管的大块内存避免 GC 压力），写满后落盘成 SSTable
- **MVCC** 用单调递增的时间戳，事务走 SSI（Serializable Snapshot Isolation）
- 单进程独占目录——**两个进程同开一个 dir 会损坏数据**
- **Bloom filter** 每个 SSTable 一个，避免读时穿透扫描全部 level

## 实践案例

### 案例 1：最小可用代码

```go
import "github.com/dgraph-io/badger/v4"

db, _ := badger.Open(badger.DefaultOptions("/tmp/badger"))
defer db.Close()

// 写
db.Update(func(txn *badger.Txn) error {
    return txn.Set([]byte("hello"), []byte("world"))
})

// 读
db.View(func(txn *badger.Txn) error {
    item, _ := txn.Get([]byte("hello"))
    return item.Value(func(val []byte) error {
        fmt.Println(string(val)) // world
        return nil
    })
})
```

注意 `item.Value(...)` 这个回调——这就是"值在 vlog 里"的副作用：要拿值得**额外去 vlog 取一次**，所以 API 强制你用回调，免得你写出"先 close txn 再 deref value"的悬空指针。

### 案例 2：和 RocksDB 写放大对比

写 1KB 的 value，写 100 万次，再各覆盖一遍：

| 系统 | LSM 实际写入 | 写放大 |
|------|-------------|--------|
| RocksDB（默认 leveled） | ~10 GB | ~10x |
| Badger（KV 分离） | ~200 MB（LSM）+ 2 GB（vlog 顺序追加） | ~2x |

关键：**LSM 不再随值的大小膨胀**。Badger 论文给的实测里 value 越大，优势越夸张。

### 案例 3：什么时候**不要**用 Badger

- value 都很小（<100 字节）：vlog 间接寻址的开销吃掉了好处，用 LevelDB 风格更划算
- 跑在传统 HDD 上：随机读慢，vlog 那次额外寻道会要命
- 需要多进程共享同一份数据：Badger 单进程，得自己在外面包一层服务器（Dgraph 就是这么做的）

## 踩过的坑

1. **vlog GC 不是免费的**：写入压力大、GC 跑不过来时**磁盘会涨**。生产里要监控 `BadgerDB.vlog.discard` 指标，并按需手动 `db.RunValueLogGC(0.5)`。

2. **range scan 不再纯顺序磁盘**：传统 LSM 范围扫描就是把 SSTable 顺着读；Badger 扫到的是键 + 偏移，每个 value 还要再去 vlog 一次，**变成随机读**。SSD 上勉强能接受，HDD 上别试。

3. **同一目录开两次 = 数据损坏**：Badger 用文件锁防误开，但容器场景下经常翻车（Pod 重启没释放锁、bind mount 共享）。常见症状是开库直接报 `Cannot acquire directory lock`。

4. **大事务会 OOM**：所有写在 commit 前都缓在内存里。批量导入要用 `WriteBatch` 或自己分小事务，不能直接一个 `Update` 塞 100 万条。

5. **option 不可变 = 升级痛**：开库时传的 `Options` 写进了 manifest，新版本 Badger 加新选项后，老库需要按文档迁移，不能直接换 binary 跑——这是嵌入式 KV 的通病，但新人最容易忽视。

## 适用 vs 不适用场景

**适用**：

- 嵌入到 Go 应用里、不想引 cgo 的本地 KV
- value 中等到偏大（≥1 KB），写放大敏感
- SSD / NVMe 部署
- 需要 ACID 事务、MVCC 快照的单机场景

**不适用**：

- 多进程并发访问同一份数据（要套服务器层）
- 大量小 value（<100 字节）写入
- 需要丰富查询语言（SQL / 索引 / join）—— Badger 只是 KV
- HDD / 网络盘（vlog 随机读会拖死性能）

## 历史小故事（可跳过）

- **2016**：威斯康星大学 Lu Lanyue 等人发表 WiscKey 论文，证明在 SSD 上"键值分离"能把写放大降一个数量级。论文用的是 LevelDB 修改版，没开源完整工程版。
- **2017**：Dgraph 团队（Manish Jain 等人）需要一个 Go 原生 KV 给图数据库做底座，干脆按 WiscKey 思路自己写了一个，命名 **Badger**（獾——Dgraph 之 D 的另一种解读）。
- **2019 → 2024**：Badger 经历 v2（事务重写）、v3（big values 优化）、v4（接口稳定 + 兼容层）。Dgraph 内部一直在迭代，外部用户也在加码（IPFS 部分、Authelia、各种边缘存储）。

整段历史可以总结成：**论文给思路 → 工程做出来 → 围绕一个真实需求（Dgraph）打磨**。这是开源 KV 存储的典型路径。

## 学到什么

1. **写放大不是命数**：传统 LSM 的写放大不是因为 LSM 错，是因为**键和值绑在一起**。把它们拆开就能省一个数量级。
2. **SSD 改变了存储设计的成本函数**：HDD 时代"随机读极慢"逼着所有人把数据排好；SSD 时代可以接受局部随机读，反而能优化别的（写放大、compaction CPU）。
3. **GC 是从内存语言学来的工具**：vlog GC 本质就是堆的 mark-and-sweep——活的搬走，死的丢掉。存储和语言运行时在底层共享思路。
4. **嵌入式 KV 是基础设施的"无名英雄"**：你看不到它，但 Dgraph、IPFS、消息队列、状态存储底下到处是它。

## 延伸阅读

- 论文：[WiscKey FAST 2016 PDF](https://www.usenix.org/system/files/conference/fast16/fast16-papers-lu.pdf)（12 页，非常好读）
- Dgraph 官方博客：[Introducing Badger](https://dgraph.io/blog/post/badger/)（设计动机最清楚的一篇）
- 仓库：[github.com/dgraph-io/badger](https://github.com/dgraph-io/badger)
- [[rocksdb-lsm]] —— LSM 树工程化的另一条主线
- [[lsm-tree-1996]] —— LSM 的原始论文

## 关联

- [[lsm-tree-1996]] —— Badger 的 LSM 部分依然是 1996 年这套思路
- [[rocksdb-lsm]] —— "键值放一起"的对照组，写放大代价的来源
- [[rocksdb-2017]] —— LevelDB / RocksDB 工程演进，Badger 设计上的对手
- [[ssa]] —— 同样体现"换一种数据组织方式，问题就简单了"的思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
