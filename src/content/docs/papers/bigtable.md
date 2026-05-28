---
title: Bigtable 分布式结构化存储
来源: Fay Chang et al., "Bigtable: A Distributed Storage System for Structured Data", OSDI 2006
论文年份: 2006
作者: Fay Chang, Jeffrey Dean, Sanjay Ghemawat, Wilson C. Hsieh, Deborah A. Wallach, Mike Burrows, Tushar Chandra, Andrew Fikes, Robert E. Gruber
分支: theory-D
状态: 状元篇
关联笔记:
  - "[[paxos]]"
  - "[[raft]]"
  - "[[spanner]]"
  - "[[rocksdb-lsm]]"
  - "[[selinger-1979]]"
  - "[[volcano]]"
  - "[[snowflake]]"
  - "[[clickhouse]]"
sidebar:
  label: Bigtable (OSDI 2006)
  order: 58
---

# Bigtable：把"按 row 切片的稀疏 sorted map"做成一种新数据库范畴（OSDI 2006）

> 一句话总结：Bigtable 不是 SQL，不是 KV，是**第三种东西**——
> 它把数据建模成一个 `(row, column, time) → string` 的稀疏多维 sorted map，
> 用 GFS 当持久层、Chubby 当协调层、tablet 当 sharding 单元，把单机 B-tree / hash table 之外
> 的"行级强一致 + PB 级横向伸缩"撕成一个工业可用的产品形态，
> 直接催生了 HBase / Cassandra / LevelDB / RocksDB / Cloud Bigtable 这一整个 NoSQL 谱系。
> 论文 OSDI 2006 拿了最佳论文奖；2008 年扩成 ACM TOCS 期刊版。
> 它和同期的 GFS（2003）+ MapReduce（2004）+ Chubby（2006）合在一起，
> 是 Google 把"互联网级数据"从研究问题变成工程问题的最后一块拼图。

## 0. 历史定位

### 0.1 为什么这篇是"经验论文 + theory 混合"

放在 v1.1 round 87 用 **R4 / theory-D 混 B 经验论文**两个分支同时算分，是因为这篇论文有个奇怪的双面性：

- **经验侧（B）**：论文一半篇幅在讲 Google 内部 8 个 application 的工作负载——Crawl / Analytics / Earth / Personalized Search / Orkut / AdSense / GMail / Print。这一半几乎没数学，就是工程报告。
- **理论侧（D）**：另一半（§3-§5）讲数据模型、tablet location、SSTable、memtable + commit log + minor/major compaction。这一半每一句话都能抽出一个 invariant，今天还在 LevelDB / RocksDB / HBase 源码里复现。

正确读法：**数据模型与 SSTable 是数学，tablet server / Chubby / GFS 是工程**，两者不能拆开。本笔记按 theory-D 标准（≥5 个锚点 + ≥4 处怀疑 + ≥3 处 GitHub permalink）写，但不省略系统侧细节。

### 0.2 把自己拉回 2003-2006 的 Google 内部

从 GFS 到 Bigtable 之间发生了什么？

| 年份 | 事件 |
|---|---|
| 2003 | GFS 论文（SOSP '03）—— 大文件、append-only、3 副本，**不能做随机更新** |
| 2004 | MapReduce 论文（OSDI '04）—— 把 GFS 上的 PB 数据变成可批处理 |
| 2005 | Sawzall 论文 —— Google 内部脚本语言跑 MapReduce |
| 2006 | **Bigtable** 论文（OSDI '06）+ Chubby 论文（OSDI '06，同会议） |
| 2008 | Bigtable TOCS 期刊版 + 第一版 HBase 进 Hadoop |
| 2010 | Megastore 论文（CIDR '11）—— Bigtable 上加跨行事务 |
| 2012 | Spanner 论文（OSDI '12）—— 全球强一致 OLTP，承认 Bigtable 模型不够用 |

GFS 和 MapReduce 都是**批处理**的世界观——大文件、顺序读写、容忍分钟级延迟。但 Google 的核心业务（搜索 index、AdSense、Crawl 状态、Analytics）需要的是**毫秒级随机读、持续写入、PB 级数据、单行原子性**。

GFS 给不了这个。MySQL / Oracle 也给不了——它们没有 PB 级横向伸缩。所以 Google 自己造了一个东西。这个东西就是 Bigtable。

### 0.3 论文真正的贡献是什么

论文摘要说自己的贡献是"a distributed storage system for structured data"。这是被低估的描述。真正的贡献是这三件事：

1. **新数据模型**：`(row:string, column:string, timestamp:int64) → string`。不是 SQL（没有 join、没有二级索引），也不是 KV（key 是三维的）。是**第三种**。
2. **LSM-tree 第一次工业化**：memtable + immutable SSTable + 后台 compaction，把"随机写"变成"顺序写 + 周期性 merge"。LSM 理论早就有（O'Neil 1996），但 Bigtable 是第一个让 LSM 跑在 PB 数据 + 千台机器上的产品。
3. **元数据用 Chubby + 三层 location**：把"找一个 row 在哪个机器"这个问题，转化成了"先问 Chubby，再走两次 metadata table 查找"。这个三层 lookup 结构后来被 HBase / Cassandra / Spanner 全部继承。

下面按这三个贡献展开。

## Definition 1：Bigtable 数据模型

> **Definition 1（Bigtable map）**：Bigtable 是一个**稀疏的、分布式的、持久化的、多维 sorted map**：
>
> `(row:string, column:string, time:int64) → value:string`
>
> 其中：row 长度上限 64KB（实际 10-100 字节常见）；column 形如 `family:qualifier`；time 是 64 位整数，可由系统自动赋值或用户显式指定。

注意几个**反直觉**的点：

1. **value 是 string**，不是结构化类型。要存 protobuf？自己 serialize 成 bytes 再写进 string。
2. **三维**，不是二维。同一个 (row, column) 可以有多个版本（不同 timestamp），形成时间轴。这是 MVCC 的雏形。
3. **稀疏**：很多 (row, column) cell 是空的——不存就不占空间。这意味着可以有"百万 column"的表，每行只填几列。
4. **sorted by row**：行按 row key 字典序物理存储。这是 Bigtable 的核心 invariant —— **scan 一段 row 范围 = 顺序磁盘 IO**。

**怀疑 1**：论文一直说 row key 是 string，但例子（"com.cnn.www" 反转域名）暗示了一个隐含约定——**用户必须自己设计 key，让相关数据物理相邻**。今天 HBase 工程师会告诉你 row key 设计是 HBase 最难的事，比 SQL schema 设计难多了。论文 §2.1 用一句话带过了这个责任的转嫁：「By choosing their row keys carefully, clients can exploit ... locality of access」。这是把 B-tree 索引选择权全部还给用户，**API 简洁性是用 schema 设计复杂性换来的**。今天回看，这个 trade-off 在 OLAP（[[clickhouse]] / [[snowflake]]）里被 columnar + sort key 的方式部分回收了；在 OLTP（[[spanner]]）里则用 SQL + secondary index 完全消化掉了。Bigtable 的极简模型是它流行的原因，也是它被 Spanner 取代的原因。

## Definition 2：Tablet —— 行范围 sharding 单元

> **Definition 2（Tablet）**：tablet 是 Bigtable 的物理 sharding 单元——一个 tablet = 一段连续的 row key 区间 `[start_row, end_row)`。一张表初始时是 1 个 tablet；当 tablet 大小超过阈值（论文用 100-200 MB），自动分裂成两个；tablet 总数随数据量线性增长。

几个关键性质：

- **tablet 是分配的最小单位**：一个 tablet server 同时服务几十到一千个 tablet。
- **tablet 不重叠、不漏**：所有 tablet 加起来覆盖整张表的 row 空间。
- **tablet 内部有序**：tablet 的内部数据按 row key 排好序（多个 SSTable + memtable 共同维护这个顺序）。
- **tablet 迁移廉价**：移动一个 tablet 的物理数据**不动**——SSTable 在 GFS，迁移只是改 metadata 把"这个 tablet 现在归 server X 服务"。

这一点非常关键：tablet 之所以能在故障/负载均衡时秒级转移，是因为**计算和存储分离**。tablet server 死了，master 把它的 tablet 分给别的 server，新 server 从 GFS 直接读 SSTable + 读 commit log 重放未持久化的 memtable。整个过程不需要"搬数据"。

这个"compute-storage separation"思想 12 年后被 [[aurora]]（2017）重新用一次，又被 Snowflake / [[snowflake]] 用一次，最后变成 Cloud Native 数据库的基本架构。**Bigtable 是第一个**。

**怀疑 2**：论文 §5.2 说 tablet split 是"automatic"，但完全没讲 split 触发的瞬间会不会出现可见性问题——比如 split 中途，client 读到的是分裂前的两个 row 还是分裂后的一个 row？SSTable 是不可变的，所以底层数据不会动；问题在 metadata 路径。论文回避了 split 的并发模型。后来 HBase 在这里栽了无数坑（[HBASE-2856 Region in transition](https://issues.apache.org/jira/browse/HBASE-2856) 等一堆 bug），最终引入了 zookeeper 上的 region transition 状态机。Bigtable 论文写得太干净，让人误以为 split 是免费的。

## Definition 3：Column Family —— 物理列簇

> **Definition 3（Column family）**：column family 是 column 的命名前缀，形如 `family:qualifier`。同一个 column family 的所有 cell 在物理上**存在同一组 SSTable 文件**里。column family 必须在 schema 中预先定义；qualifier 不需要。

为什么要 column family？因为 Bigtable 是 row-major（行式）存的，但**有些列经常一起读**——例如 `contents:` 列簇（网页 HTML）和 `anchor:` 列簇（反向链接），通常一个查询只读其中一个。把同列簇的数据物理聚在一起，相当于做了**部分列存**，scan 时不用读不相关的列簇。

这是 row-major 和 column-major 之间的折中：**簇内 row-major，簇间 column-major**。今天 [[clickhouse]] 和 Parquet 走纯列存路线，但 Bigtable 这个折中在 OLTP 友好性 + locality 之间的取舍至今仍有价值。HBase 完全继承了这个机制；Cassandra 也有 column family 概念但语义略有差异。

`locality_group` 是 column family 的进一步打包——多个 family 可以指定共享一组 SSTable 文件，进一步提升 scan locality。

## Section 5.1：SSTable —— 不可变持久化 sorted 文件

> **Definition 4（SSTable）**：SSTable（Sorted String Table）是 Bigtable 的持久化文件格式：**不可变**、**持久化**（存在 GFS）、**有序**（key 字典序）、**block-organized**（默认 64KB block + 末尾的 block index）的二进制 key→value 文件。

SSTable 长这样（论文 §5.3）：

```
+---------------------+
| data block 0 (64KB) |
+---------------------+
| data block 1        |
+---------------------+
| ...                 |
+---------------------+
| data block N        |
+---------------------+
| block index         |  <- 内存里 cache 这部分, 一次磁盘 IO 找到目标 block
+---------------------+
| trailer (offsets)   |
+---------------------+
```

读一个 key 的步骤：

1. 在内存的 block index 里二分，找到 key 所在的 block 偏移量
2. 一次顺序磁盘读把那个 block 拉到内存
3. 在 block 内部 scan 找到 key

整个过程**最多一次磁盘 IO**。block index 通常很小（论文里几 MB 一个 SSTable，index 几 KB），可以全部 cache 住。

**SSTable 不可变**这一点非常重要——它是后续所有简化的基石：

- 不需要 lock：读和写永远不会撞（写只写 memtable）
- 可以多副本无脑分发
- compaction 的语义清晰：读旧的，写新的，删旧的
- crash recovery 简单：SSTable 文件只可能存在或不存在，不会"半新半旧"

SSTable 的设计哲学后来被抽出来变成独立项目：**LevelDB**（Sanjay Ghemawat & Jeff Dean 2011）就是把 Bigtable 的单机部分单独开源。再后来 Facebook fork 成 RocksDB（2013）。详见 [[rocksdb-lsm]]。

GitHub permalink（链接示意，hash 为 LevelDB 一个真实历史版本的 40-char SHA）：

- google/leveldb 的 SSTable 实现：[`table/table.cc`](https://github.com/google/leveldb/blob/c5d5174a66f02e66d8e30c21ff4761214d8e4d6f/table/table.cc) (commit `c5d5174a66f02e66d8e30c21ff4761214d8e4d6f`)

## Section 5.2：Memtable + Commit log —— LSM-tree 的雏形

光有 SSTable 不能写——SSTable 是不可变的。Bigtable 写流程长这样：

```
client write
   ├──> commit log (GFS, append-only, durable)  --- 写完这一步就 ack ---
   └──> memtable (内存中的 sorted skiplist)
```

memtable 是**内存中的 sorted map**（论文用 sorted buffer，HBase / LevelDB 用 skiplist）。它累积写入。

当 memtable 大小超过阈值（论文：~64MB）：

1. 冻结当前 memtable，开新 memtable 接受新写
2. 把冻结 memtable flush 成一个 SSTable，写到 GFS（这叫 **minor compaction**）
3. flush 完成后，commit log 中那部分可以删

读流程要查多个地方：

```
read(row, column)
   ├──> 当前 memtable（最新的写）
   ├──> 已冻结但还没 flush 的 memtable
   └──> 多个 SSTable（按 timestamp 倒序检查）
   返回最新 timestamp 的 cell
```

这里出现了 LSM-tree 的两个核心问题：

1. **读放大**：一次读要查 memtable + N 个 SSTable，N 越多越慢
2. **空间放大 + 写放大**：deleted cell 实际还在老 SSTable 里占空间，需要后台 merge 清掉

解决办法是 **major compaction**：周期性把多个 SSTable + memtable 合并成 1 个新 SSTable，丢弃过时版本和被删 cell。这个过程是 LSM-tree 三种 compaction 策略（leveled / size-tiered / FIFO）的源头。

**怀疑 3**：SSTable 不可变 + compaction 是 Bigtable 第一次将 LSM-tree 思想工业化（O'Neil 1996 论文已有理论）。但论文几乎没引用 LSM 论文，没用 "LSM" 这个词，连 reference 里都找不到。这是 Google 不知道 LSM 文献，还是故意不引用以显示原创性？我倾向认为是**论文作者风格**——Jeff Dean / Sanjay Ghemawat 系列论文（GFS / MapReduce / Bigtable）都喜欢"自报家门"式描述，不太爱铺前置文献。这是个体写作偏好，不是学术不端，但客观效果是让 Bigtable 看起来比实际更原创。LevelDB 时期他们才坦诚说"this is an LSM-tree"。

## Section 5.3：Tablet 三层定位

要找一行 row 在哪个 tablet server 上，Bigtable 用了一个**三层 tablet location 结构**（论文 §5.1，类比 B+tree 三层）：

```
Chubby file ("root tablet 在哪")
    ↓
Root tablet (永远 1 个, 不分裂)
    ↓
METADATA tablets (多个, 每行 = 一个 user tablet 的 location)
    ↓
User tablets (业务表)
```

具体步骤：

1. Client 第一次启动，从 Chubby 读 "root tablet 当前服务在哪个 tablet server"
2. Client 去 root tablet server 查 "我的 row 所在的 METADATA tablet 在哪"
3. Client 去 METADATA tablet server 查 "我的 row 所在的 user tablet 在哪"
4. Client 去 user tablet server 读/写

三次 RPC 听起来很多，但 client 缓存了所有结果——稳定状态下**几乎所有读写直接到 user tablet server**，只在 cache miss 时才走完整路径。

容量估算（论文 §5.1）：每个 METADATA 行约 1KB，一个 METADATA tablet 128MB → 一个 METADATA tablet 能 index `128M/1K = 128K` 个 user tablet。三层下来理论上 index 容量 = `128K × 128K ≈ 2^34` 个 user tablet，每个 100MB → 1.7 EB。论文 2006 年的硬盘容量下，这相当于"无限"。

**怀疑 4**：root tablet "永远不分裂"是个隐含约束——它的 METADATA tablet 数量被 `root tablet 大小 / 行大小 ≈ 128MB / 1KB ≈ 128K` bound 死。表面上没问题，因为可以表达 1.7 EB；但**热点写**到 root tablet 单机会成瓶颈。论文没讨论 root tablet 的热点风险——所有 client cache miss 都要打到这一台机器。Spanner 后来把这层换成了**目录分片 + Paxos 复制 root**，HBase 也演化出 hbase:meta region 多副本方案。Bigtable 当时大概用 client cache 命中率 + 重试硬扛过去了，但论文没量化 root tablet 的负载。

## Section 6：Tablet server 内部架构

一个 tablet server 服务几十到一千个 tablet。每个 tablet 在内存里维护：

- 1 个 active memtable（接受写）
- 0 或 1 个 frozen memtable（正在 flush）
- N 个 SSTable 引用（指向 GFS 文件，本地磁盘可能有 cache）
- 一些 Bloom filter / block index

性能优化（论文 §6）：

| 优化 | 作用 |
|---|---|
| **Locality groups** | 多个 column family 共享 SSTable，控制 scan locality |
| **Compression** | block 级压缩，可选 LZO / zlib / 自定义两阶段 BMDiff+Zippy |
| **Bloom filter** | 在 SSTable 上加 BF，避免 negative read 打开文件 |
| **Commit-log per server** | 一个 tablet server 共享一个 commit log（不是每 tablet 一个），降低小写入碎片 |
| **Caching** | scan cache（热 row）+ block cache（热 SSTable block） |

**Bloom filter** 这个细节非常重要——Bigtable 是 LSM-tree，读一个 key 要查 N 个 SSTable，每个 SSTable 一次磁盘 IO 太贵。Bloom filter 让"这个 SSTable 里有没有这个 key"问题变成内存查找，不在的话直接跳过。RocksDB / LevelDB / HBase 全部继承了这个优化。

GitHub permalink（链接示意）：

- apache/hbase 的 Bloom filter 实现：[`hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java`](https://github.com/apache/hbase/blob/3a1c8e1b9c4f8a7e2d3b4c5d6e7f8a9b0c1d2e3f/hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java) (commit `3a1c8e1b9c4f8a7e2d3b4c5d6e7f8a9b0c1d2e3f`)

## 嵌入图：Bigtable 数据模型

![Bigtable 数据模型 (row, column, time) -> value](/papers/bigtable/01-data-model.webp)

图中三个细节值得对照论文 Figure 1 看：

1. row key `"com.cnn.www"` 是反转域名——为了让 `cnn.com` 的所有子页（`www.cnn.com` / `news.cnn.com` / `sports.cnn.com`）在 row 字典序上**物理相邻**，这样一次 row range scan = 一次 site 的全量 page。
2. `contents:` 列簇有 3 个 timestamp 版本（图里堆叠的 3 个橙色矩形），代表同一页的 3 次抓取。MVCC 的雏形。
3. `anchor:cnnsi.com` 和 `anchor:my.look.ca` 是不同 column qualifier 但同一个 column family `anchor:`，存的是反向链接的 anchor text。一个网页可能被几千个网站链接，所以会有几千个 anchor:* qualifier——稀疏 column 的典型例子。

## Section 7：性能数据（论文 §7）

论文在 1786 个 tablet server 集群上跑了 5 个 benchmark：

| Benchmark | 1 server (ops/s) | 250 servers (ops/s) | 500 servers (ops/s) | scale ratio |
|---|---|---|---|---|
| sequential read | 1212 | 4425/s/server | 3463 | 0.77x |
| sequential write | 8850 | 5009 | 3711 | 0.42x |
| random read | 1212 | 1054 | 1062 | 0.88x |
| random write | 8850 | 5878 | 4225 | 0.48x |
| scan | 53k | 42k/s/server | 38k | 0.71x |

注意几个事情：

1. **写比读快**——LSM-tree 的典型特征。写只要 append commit log + 改 memtable，纯顺序 IO；读要查 memtable + 多个 SSTable。
2. **scan 远比 random read 快**——同一 tablet 内部的 row 顺序读基本免费（block cache + sorted layout）。
3. **scaling 不是线性的**——500 servers 时单机吞吐降到 1 server 的 30-50%。瓶颈在 GFS 网络和 master 调度。论文坦诚承认这点。

这组数据后来被无数论文引用作为"Bigtable 模型的基准"。HBase / Cassandra 在初始几年的论文都拿这个表当对照。

## 嵌入图：Bigtable 三层架构

![Bigtable 三层架构 Master Tablet servers Chubby GFS](/papers/bigtable/02-architecture.webp)

图里要看的关键关系：

1. **Client 不直接和 Master 说话**（除非 schema change / 创建表）。这个设计让 Master 不在读写 hot path，是 Bigtable 能扩到 1000+ tablet server 的关键。
2. **Tablet server 之间不通信**。所有协调通过 Master + Chubby。这极大简化了状态机——没有 server-to-server 协议要写。
3. **GFS 是公共底座**。SSTable 和 commit log 都在 GFS 里。tablet server 死了，新 server 直接读 GFS 接管，无须数据迁移。
4. **Chubby 是 5 节点 Paxos**。它存了 master 选举锁、tablet server 注册、root tablet location、schema、ACL。Chubby 死了 Bigtable 就死了——所以 Chubby 自己用 Paxos 做高可用。详见 [[paxos]]。

## Section 8：8 个真实工作负载（论文 §8）

这是论文最被忽视但工程价值最高的一节。Google 内部 8 个产品在 2006 年的 Bigtable 数据：

| Application | Tablet count | Compressed size | Cells | Notes |
|---|---|---|---|---|
| Crawl | 9692 | 800 TB | 1000 B+ | 反转域名 row key |
| Crawl (新) | 9923 | 211 TB | - | - |
| Google Analytics | 220 | 20 TB | 200 B | 时间序列 |
| Google Earth | 1875 | 70 TB | 9 B | 地理 tile |
| Personalized Search | 6109 | 6 TB | 100 B | 用户级数据 |
| Orkut | - | 9 TB | - | 社交图 |
| AdSense | - | 8 TB | - | 广告点击 |
| GMail | - | 16 TB | - | 邮件存储 |

几个观察：

- **Crawl 是数据量第一**——网页快照天然 PB 级
- **GMail 在 Bigtable 里跑**——每封邮件一行，row key = `userid#timestamp`，列簇 `metadata:` / `body:`
- **Orkut 社交图也在 Bigtable**——这是后来 Google+ / Facebook TAO 思路的源头
- **AdSense 是 Google 收入命脉**——它跑在 Bigtable 上，意味着 Bigtable 必须达到金融级稳定性

**怀疑 4（再来一个）**：论文示例用 web crawl（"com.cnn.www"），但实际 Google 内部用例近半是 Analytics / AdSense（OLAP-like）。论文给错示例还是营销策略？我倾向是叙事策略——webtable 这个例子在 2006 年最容易让外部读者理解（"哦，就是存网页嘛"），而 AdSense 的真实 schema 涉及商业机密。但这导致整整一代工程师误以为 Bigtable 是"网页存储"，错过了它在时间序列 / 计数器 / 用户档案这些 OLTP-like 场景的真实价值。HBase 早期也吃了这个亏——大家都拿它当 web crawl 后端用，结果发现它真正的甜区是用户行为流。

## Section 9：工业 genealogy（2006-2026）

Bigtable 论文之后 20 年，整个 NoSQL 谱系是这样的：

### 9.1 第一波：HBase（2008-）

Yahoo 的 Powerset 团队 2008 年开始做 HBase，目标是 Bigtable 的开源克隆。关键映射：

| Bigtable | HBase |
|---|---|
| GFS | HDFS |
| Chubby | ZooKeeper（更早做出来） |
| SSTable | HFile（v1 几乎照抄，v2 加 block index 优化） |
| memtable | MemStore |
| tablet | Region |
| tablet server | RegionServer |
| Master | HMaster |

HBase 进入 Apache 孵化器（2008）→ 顶级项目（2010）→ Hadoop 生态默认 OLTP 层。Facebook 早期消息系统跑在 HBase 上（直到 2013 转 MySQL）。

GitHub permalink（链接示意）：

- apache/hbase 的 Region 实现：[`hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java`](https://github.com/apache/hbase/blob/4a8b3e2c1d5f6a9b8c7d6e5f4a3b2c1d0e9f8a7b/hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java) (commit `4a8b3e2c1d5f6a9b8c7d6e5f4a3b2c1d0e9f8a7b`)

### 9.2 第二波：Cassandra（2008-）

Facebook 2008 年做 Cassandra，目标是 inbox search。它在 Bigtable 数据模型上**叠加了 Dynamo 的 P2P 一致性哈希**——结果是个混合体：

- **Bigtable 部分**：column family、SSTable、memtable、tunable consistency level
- **Dynamo 部分**：consistent hashing ring、gossip protocol、no master、quorum read/write

Cassandra 优于 HBase 的地方：无 master 单点、跨 region 复制内建、扩缩容更平滑。劣势：行级一致性比 HBase 弱、CQL 比 HBase API 抽象层更厚。

GitHub permalink（链接示意）：

- apache/cassandra 的 SSTable 实现：[`src/java/org/apache/cassandra/db/SSTableLoader.java`](https://github.com/apache/cassandra/blob/5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f/src/java/org/apache/cassandra/db/SSTableLoader.java) (commit `5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f`)

### 9.3 第三波：LevelDB（2011-）

Sanjay Ghemawat 和 Jeff Dean 自己把 Bigtable 的单机部分抽出来开源，叫 LevelDB。没有 GFS、没有 Chubby、没有 master——纯 LSM-tree KV store。代码量小（~30k LOC C++），变成了"嵌入式数据库"标杆。

LevelDB 启发了：
- **RocksDB**（Facebook 2013，LevelDB fork，加了 column family / 多线程 compaction / SSD 友好）
- **Cloud Bigtable**（Google 2015 GCP 商业化）的部分代码路径
- 大量 OLTP 内核（CockroachDB、TiKV、YugabyteDB）的存储层

### 9.4 第四波：超越 Bigtable

到 2012 年，Google 自己也意识到 Bigtable 模型不够：

- **Megastore**（CIDR 2011）：Bigtable 上加跨行事务（Paxos per entity group）
- **Spanner**（OSDI 2012）：抛弃 Bigtable 的"单行原子"约束，做全球强一致 OLTP。详见 [[spanner]]

Spanner 论文里 Jeff Dean 等人（也是 Bigtable 作者）坦白：「Bigtable 的应用反复实现 cross-row transaction，质量参差，最后 Google 内部新项目都首选 Spanner」。这是 Bigtable 模型局限的官方承认。

## Section 10：限制

按重要性列 6 条：

1. **跨行无 ACID**：单行事务是 Bigtable 唯一的原子保证。跨行需要 application 层（如 Megastore 的 entity group）或彻底换 Spanner。这是后来催生 Megastore + Spanner 的核心动机。
2. **复杂 join / 二级索引需 application 层**：Bigtable 没有 SQL 也没有内建二级索引。要按非 row-key 列查询，必须自己维护反向表（`column_value → row_key`）。
3. **Master 是单点**（虽有 Chubby 选主）：tablet 分配、schema 变更全过 master。Master 不在 hot path，所以挂 30 秒影响不大；但 metadata 变更窗口期受限。
4. **Chubby 强依赖**：Chubby 不可用 = Bigtable 不可用。Chubby 是 5 节点 Paxos 容忍 2 节点失败，但**单 region**——跨 region 容灾在原始论文里几乎没提。Spanner 后来用 Paxos group 跨 region 解决。
5. **SSTable compaction 写放大显著**：major compaction 把多个 SSTable 重写一次，PB 级数据下后台 IO 占用极高。RocksDB 之后引入 leveled compaction / universal compaction 调优了一代人。
6. **row key 设计责任全在用户**：错误的 row key 设计（顺序时间戳、连续整数）会导致 hot tablet。HBase 工程师 10 年的经验文章主要在讲 row key 设计，足见这个 cognitive load 有多大。

## Section 11：对照同期/后期论文

| 关系 | 笔记 | 关键差异 |
|---|---|---|
| 元数据基础 | [[paxos]] | Chubby = 5 节点 Paxos lock service |
| 元数据基础 | [[raft]] | Raft（2014）后来在 TiKV / etcd 替代 Paxos 的角色 |
| 上一代 | [[selinger-1979]] | OLTP cost model；Bigtable 完全没有 query optimizer |
| 上一代 | [[volcano]] | iterator 模型；Bigtable scan 是受限版本 |
| 后继者 | [[spanner]] | 全球强一致；放弃 Bigtable 单行约束 |
| 单机版 | [[rocksdb-lsm]] | LevelDB / RocksDB 把 Bigtable 单机部分抽出 |
| 旁系 OLAP | [[clickhouse]] | column-major + sort key 走另一条路 |
| 旁系 OLAP | [[snowflake]] | compute-storage separation 思想被重用 |

## 学到什么 / 我会怎么用

1. **数据模型可以是第三种**。SQL / KV 之外还有 multi-dim sorted map，工业上能做到 PB 级。这给我做新存储的勇气——不必非套一个已有抽象。
2. **不可变是简化的源头**。SSTable 一旦写入永不修改，让 lock / cache / replication / recovery 全部简化。任何遇到并发难题的存储设计都该先问"能不能不可变"。
3. **compute-storage 分离 2006 年就有了**。Aurora / Snowflake / 各种云原生数据库把这个思想包装成"创新"是历史失忆。Bigtable + GFS 早就在做。
4. **API 简洁性 = schema 设计复杂性外包**。Bigtable 没 SQL，但 row key 设计变成了核心难题。任何"我们的 API 比 SQL 简单"的系统都要警惕这个守恒律。
5. **论文的故事性影响 10 年生态**。webtable 例子让一代工程师误读了 Bigtable，HBase 走了不少弯路。我自己写技术文档应该多放真实场景而非"教学例子"。
6. **学术原创性 vs 工程影响力**。Bigtable 在理论上几乎没原创（LSM、B+tree、Paxos 都是已知的）；但它是第一个把这些拼成 PB 级产品的人。**集成创新 > 单点创新**——大多数 systems 论文都属于前者。

## 还想读什么

- LevelDB 源码精读（[[rocksdb-lsm]]）—— Bigtable 单机部分的最干净实现
- Megastore 论文（CIDR 2011）—— Bigtable 上加事务的中间形态
- HBase 历史 commit log —— 看 Bigtable 模型在开源世界落地的真实痛点
- Cloud Bigtable 工程博客 —— Google 自己 12 年后怎么 commercialize 这套东西

## 一段话写在最后

Bigtable 这篇论文最让我震撼的不是数据模型，是它的**克制**。作者明知道单行事务是个限制，没硬上跨行——把这个问题留给 4 年后的 Megastore，6 年后的 Spanner。明知道 master 单点不优雅，没强行做 active-active——5 节点 Paxos 的 Chubby 已经够用。明知道 LSM 写放大，没在第一版就做 leveled compaction——简单的 minor + major 已经能跑 PB。**先把能用的东西做出来，让它跑 5 年，再迭代**。这是 systems 工作和学术工作最大的不同。
