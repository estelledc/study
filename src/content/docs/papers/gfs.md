---
title: GFS — 编译器决定不做哪些事
来源: 'Ghemawat, Gobioff, Leung. "The Google File System". SOSP 2003'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

GFS（**Google File System**）是 Google 2003 年自己造的分布式文件系统，**为自家工作负载量身定做、不兼容 POSIX**。日常类比：像超市自营品牌——别家的标准货（POSIX）不合需要，那就自己开模生产，只服务自己门店。

它的设计起点不是"给所有人造一个文件系统"，而是反着来：**先观察我们到底怎么用文件**，再决定哪些 POSIX 功能可以砍。Google 的真实使用场景是 multi-GB 的爬虫日志、append-mostly 的索引中间结果、上千台便宜机器随时坏。这跟 NFS 假设的"小文件 + 稳定硬件"差太远。

于是 GFS 砍掉了 random write 优化、强一致语义、复杂 ACL，只保留**大文件 + 流式读 + 追加写 + 自动容错**。论文 15 页，被引 9300+，HDFS / S3 / Colossus / Tectonic 全是它的徒孙。

## 为什么重要

不理解 GFS，下面这些事都没法解释：

- 为什么 HDFS / S3 / Azure Blob 这些"现代云存储"全都不兼容 POSIX——是 GFS 2003 年带的头
- 为什么 single master + chunkserver 这种"明显有 SPOF"的架构能跑十几年——工程兜底比理论纯粹更重要
- 为什么 Kafka / Pulsar 的 broker 只支持 append、不支持原地改——append-only 是 GFS 留下的设计基因
- 为什么写分布式系统的人喜欢说"故障是常态而不是异常"——这话出自 GFS Section 5

## 核心要点

GFS 能成立靠 **三个反直觉决定**：

1. **工作负载反向定义接口**：不先抽象 API 再实现，而是先观察 Google 自家应用怎么读写文件，再砍掉用不到的功能。类比：装修房子不照样板间，而是先看一家人怎么生活——孩子多就少做储物柜多做地垫。

2. **Single master + 数据流绕开 master**：metadata 集中放一台机器内存里（简单），但 client 拿到 chunk 位置后**直接连 chunkserver 取数据**，master 不参与传数据。类比：导航 App 给你路线（master）后，开车走路（数据流）就跟它无关了——它不会陪你跑全程。

3. **放弃 exactly-once，换 at-least-once + 应用层去重**：多 writer 并发追加时，GFS 只保证"至少写一次"，重试可能留下重复或 padding，**应用自己加 unique ID 和 checksum 去重**。类比：邮局保证邮件至少送一次但可能送两次，你自己看信封编号去重。

三件事合起来叫**应用配合 FS 而非反过来**——这是 GFS 全篇最重要的哲学。

## 实践案例

### 案例 1：HDFS 怎么读一个文件（GFS 协议在开源代码里的样子）

GFS 没开源，但 Apache HDFS 是它的 Java 重写，协议几乎一模一样。读一个 200MB 文件第 100MB 处的 1KB：

```python
# client 侧伪代码（对应 HDFS DFSClient.java）
def read(path, byte_offset, length):
    chunk_index = byte_offset // CHUNK_SIZE  # 64MB
    cached = local_cache.get(path, chunk_index)
    if not cached:
        # 第 1 步：问 master 要 chunk 位置（一次 RPC）
        handle, replicas = master.GetChunkLocations(path, chunk_index)
        local_cache.put(path, chunk_index, handle, replicas)
    # 第 2 步：直连最近的 chunkserver 取数据（master 不参与）
    cs = pick_closest(replicas)
    return cs.ReadChunk(handle, offset_in_chunk, length)
```

关键点：master 只在第 1 步出现，之后 N 次读都不再问它——**这就是 single master 能撑住的原因**。

### 案例 2：理解 atomic record append 的 at-least-once 行为

3 个 client 同时往同一个日志文件 append。GFS 给一个 chunkserver 颁发 60 秒 lease 当 primary，由它分配序号：

```
Client A append "log1"  → primary 分配 offset=1000，3 replicas 全写成功
Client B append "log2"  → primary 分配 offset=1010，secondary 之一失败
                          → client B 重试，primary 分配 offset=1020，全成功
                          → 结果：失败的 replica 在 offset=1010 留 padding
```

application 层读这个 log 时，必须**跳过 padding + 用 unique ID 去重**——否则会看到 log2 出现两次。

### 案例 3：自己写一个 mini object store

借 GFS 思路用 200 行 Python 实现一个对象存储：

```python
# master 进程：内存维护 key → [chunkserver_addrs]
class Master:
    def __init__(self):
        self.location = {}  # key -> ['cs1:9001', 'cs2:9001', 'cs3:9001']
    def get(self, key): return self.location.get(key)
    def put(self, key, addrs): self.location[key] = addrs

# client 写入：先问 master，再直接 PUT 到 3 个 chunkserver
def upload(key, data):
    addrs = master.allocate(key, replica=3)
    for addr in addrs:
        http.put(f"http://{addr}/blob/{key}", data)  # data flow 绕开 master
```

跑通后你会发现：**master 单点性能上限决定整个集群规模上限**——这就是后来 Colossus 必须改 multi-master 的根本原因。

## 踩过的坑

1. **把 GFS 当通用 FS 用**：拿 GFS 跑随机小文件 / 强一致 OLTP / 多租户场景必翻车——GFS 6 条 assumption（大文件 / append-mostly / 故障常态等）是它能成立的前提，跨场景照搬就崩。
2. **以为 record append 是 exactly-once**：实际是 at-least-once，重试会留 padding 或 duplicate。应用必须自己加 record checksum + unique ID 去重，否则统计结果会偏。
3. **抄 single master 但 metadata 装不下内存**：1B+ files 单机内存放不下时就该切 multi-master（Colossus / Tectonic 都做了），不是普适设计。
4. **抄 64MB chunk 但工作负载是小文件**：HDFS 用 128MB，Tectonic 用 8MB，SeaweedFS 用 needle 模型——chunk size 高度工作负载相关，盲抄 Google 的数会埋 hot spot 性能坑。

## 适用 vs 不适用场景

**适用**：
- 大文件（multi-MB 起步）+ append-mostly 工作负载（爬虫 / 日志 / 索引）
- 集群规模 < 1B files / < 几 PB（single master 内存上限内）
- 单一可信组织内部使用，无多租户隔离需求
- 你能让应用配合 FS（自己加 checksum / dedup / retry 逻辑）

**不适用**：
- 小文件多（用 SeaweedFS / Haystack 思路）
- 需要 POSIX 严格语义（用 CephFS / Lustre / 传统 NFS）
- OLTP / random write 密集场景（用 Spanner / FoundationDB）
- 多租户云服务（用 Tectonic / S3 类对象存储）

## 历史小故事（可跳过）

- **2001-2002 年**：Google 内部已经在跑爬虫 + 索引 pipeline，发现 NFS / AFS 在 1000 节点集群上扛不住。
- **2003 年 10 月**：Sanjay Ghemawat / Howard Gobioff / Shun-Tak Leung 在 SOSP 发表 GFS 论文，公开他们的设计。15 页正文。
- **2006 年**：Doug Cutting 把 GFS + MapReduce 用 Java 重写成 Hadoop（HDFS + MapReduce），开源给所有公司用。
- **2010s**：Google 内部已经把 GFS 升级成 Colossus（multi-master + 更小 chunk + erasure coding），但 Colossus 论文从未公开发表。
- **2021 年**：Facebook 在 OSDI 发 Tectonic，公开承认 GFS 的 single-tenant 假设到 multi-tenant 时代要重新设计。

## 学到什么

1. **工作负载先于 API**——别先抽象接口，先看真实数据访问模式（大小 / 频率 / 模式），再砍 API 上不需要的能力。
2. **集中协调 + 分布式数据** 是个长寿模式——metadata 集中（简单）+ data flow 绕开（高吞吐），后来 Kafka / Pulsar 都用这套。
3. **at-least-once + 应用去重** 比 exactly-once 协议简单 10 倍——能容忍重复就别强求一次性。
4. **故障默认假设**——所有组件 self-monitor + auto-recover，这是 SRE 文化的源头之一。

## 延伸阅读

- 论文 PDF：[GFS SOSP 2003](https://research.google.com/archive/gfs-sosp2003.pdf)（15 页，必读）
- 视频：[MIT 6.824 GFS Lecture](https://www.youtube.com/watch?v=EpIgvowZr00)（Robert Morris 讲，1 小时）
- 源码对照：[apache/hadoop HDFS](https://github.com/apache/hadoop)（GFS 的开源 Java 重写）
- [[bigtable-2006]] —— 直接构建在 GFS 之上的 NoSQL，把 atomic append 当 commit log 用
- [[mapreduce]] —— 把 GFS 的复杂度封装在 framework 里，让应用层程序员看不到 dedup 逻辑
- [[spanner-2012]] —— GFS 不能解决全球强一致问题时，Google 的下一代回答

## 关联

- [[bigtable-2006]] —— GFS 之上的 structured data 层，依赖 GFS atomic append 当 redo log
- [[chubby]] —— GFS master 选举依赖的 lock service，Paxos 实现
- [[paxos-1998]] —— Chubby 的理论基础，GFS 通过 Chubby 间接用 Paxos
- [[mapreduce]] —— GFS 的头号用户，把 dedup 复杂度封装给应用程序员
- [[spanner-2012]] —— GFS 之上的全球数据库，证明 GFS 不是终点是基础设施
- [[tigerbeetle]] —— 现代 OLTP 数据库，反向证明 GFS 的 relaxed consistency 不适合金融
- [[zab-2011]] —— Paxos 的工业变种，与 GFS 一样把 lease + leader 思路用到 ZK

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[borg]] —— Borg — Google 把一万台机器假装成一台
- [[chord-2001]] —— Chord — 让上万台机器排成圈，查任何 key 都只走 log N 步
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[dapper-2010]] —— Dapper — Google 大规模分布式系统链路追踪基础设施
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[f4-2014]] —— f4 — Facebook 把 90 天前的旧图片搬到一个省 40% 存储的仓库
- [[filecoin]] —— Filecoin / Lotus — IPFS 之上的去中心化存储市场
- [[frangipani-1997]] —— Frangipani — 把分布式文件系统盖在共享虚拟磁盘上
- [[hdfs-2010]] —— HDFS — 把 GFS 用 Java 重写一遍并撑到 25 PB
- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[pagerank-1998]] —— PageRank — 用随机游走给整个网络的页面打分
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[soft-updates-1999]] —— Soft Updates — 不写 journal 也能保证文件系统元数据一致
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[tachyon-2014]] —— Tachyon — 把集群存储推到内存速度，丢了再算回来
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库
- [[zab-2011]] —— Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本
- [[zfs-2003]] —— ZFS — 把磁盘当成水池，每滴水都贴标签

