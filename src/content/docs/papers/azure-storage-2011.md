---
title: Windows Azure Storage 2011 — 云对象存储第一次在工业界做到强一致
来源: 'Calder et al., "Windows Azure Storage: A Highly Available Cloud Storage Service with Strong Consistency", SOSP 2011'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Windows Azure Storage（**WAS**）是微软 2010 年商用的云对象存储系统，2011 年在 SOSP 上把内部架构公开。日常类比：像一个**有几万格保险箱的银行**——你存进任何一份文件，它必须**马上**告诉你"存好了，别人现在去取一定能拿到刚才那一份"，而不是过几秒才同步。

它一份产品同时提供三种接口：

- **Blob**（大对象，类似 S3 的 bucket）
- **Table**（结构化 key-value 表）
- **Queue**（消息队列）

底下共用同一套存储引擎。这就是它和 Amazon S3 / Dynamo 的最大差别——**S3 当时只承诺最终一致**（写完之后过几秒别人才读得到），WAS 上线第一天就承诺**强一致**：写返回成功，下一次读必然看到这一份。

## 为什么重要

不理解 WAS，下面这些事都没法解释：

- 为什么 2011 年之后云存储行业的强一致 SLA 越来越普遍——WAS 证明了"强一致 + 大规模"可以同时做到
- 为什么后来 Spanner（2012）/ Aurora（2017）的分层都很像——日志层下沉、计算层无状态，是 WAS 已经走通的路
- 为什么对象存储要分 stamp / region / geo 三层——WAS 第一次把这套术语标准化
- 为什么 GFS（2003）虽然早 8 年，但工业界做强一致还是绕不开 Paxos——WAS 给 Stream Manager 用了 Paxos，GFS 没有

## 核心要点

WAS 的整个架构可以拆成 **三层 + 一个集群单元**：

1. **Storage Stamp**（集群单元）：一组机架，约 10~20 机架、30PB 容量。一个数据中心里跑多个 stamp。Stamp 写到 70% 满就停止接新数据，开始迁移（避免热点）。

2. **Stream Layer**（最底，分布式追加日志）：所有数据最终落到这里。append-only，单位是 **extent**（约 1GB 一段），extent 内部分 **block**。**3 副本同步写**——客户端 ACK 仅当 3 份都落盘。Stream Manager 用 **Paxos** 管元数据。

3. **Partition Layer**（中间，范围分片 key-value）：把 blob / table / queue 都映射成同一种 **Object Table**。每张表按 key 范围切成 partition，每个 partition 由一个 **Partition Server** 负责。partition 太热就 split，太冷就 merge。

4. **Front-End Layer**（最上，无状态路由）：HTTP 入口，负责鉴权、限流、把请求路由到正确的 Partition Server。

关键决策：**Intra-stamp 同步三副本，Inter-stamp 异步复制**——同一个 stamp 内部强一致，跨 stamp（异地灾备）只能最终一致。

## 实践案例

### 案例 1：一次 Blob 写入走过的路

你 PUT 一个 100MB 的文件到 `https://acct.blob.core.windows.net/container/file`：

1. **DNS** → 路由到对应 region 的某个 stamp 的 Front-End
2. **Front-End** 鉴权 + 查 PartitionMap → 找到负责这个 key 的 Partition Server
3. **Partition Server** 把请求转成"往某个 stream 的尾部 append"
4. **Stream Layer** 选一个 extent 的 primary EN（Extent Node），primary 把数据并行发给 2 个 secondary
5. **3 个 EN 全部落盘**之后，primary 才回 ACK
6. ACK 一路返回到客户端

这就是为什么 WAS 写延迟比 S3 当时高一些——它**等 3 副本**，不是"写主副本就返回"。

### 案例 2：Stream Layer 像什么

类比一个**追加式日志本**：

- 你只能往最后写一行，不能改中间
- 写满一本（extent，约 1GB）就开新一本
- 每行（block）有 checksum，错了能发现
- 一本日志同时有 3 个抄写员各抄一份，他们都写完才算落账

这种"只追加 + 多副本同写"是 GFS 的思路，但 WAS 把元数据用 Paxos 做了强一致，Stream Manager 不会因为单点挂掉而读到旧元数据。

### 案例 3：Partition Layer 怎么做 schema

WAS 内部所有数据都活在一张概念上的 **Object Table**：

```
RowKey         | Properties
---------------+---------------------------
acct/cont/file | { size, etag, blocks=[...] }
```

按 RowKey 范围切 partition；每个 Partition Server 自己维护**内存索引**，写先入 commit log（落到 Stream Layer），再更新内存——和 LSM-tree 思路一致。partition 迁移只搬指针（Stream 层 extent 不动）——所以 split / merge 是**秒级**的。

### 案例 4：故障恢复怎么走

某台 Extent Node 挂了。Stream Manager 检测到副本数从 3 掉到 2，**立刻**安排在另一台健康节点上**重建第 3 份**——拷贝源数据从其余 2 个副本读，写到新节点。这个过程对客户端透明，没人会读到坏数据。如果整个机架都掉了，跨机架的副本布局保证至少还有 1 份能读，写入暂时阻塞或退化到 2 副本同步（需要运维介入）。

## 踩过的坑

1. **以为 GFS 单 master 设计够用**：GFS 的 master 是单点+主从切换，元数据有短暂不一致窗口。WAS 一开始也想这么干，最后改成 Paxos——任何 metadata 操作都要 quorum，写延迟变高，但不会丢。

2. **以为副本越多越快**：3 副本是 WAS 的延迟下界。论文里 P50 写延迟约 10-30ms，P99 飙到 100ms+，主要是等最慢那个副本。后来 Aurora 把副本数提到 6 还能更快，靠的是 quorum write（4/6 即可），不是同步全写。

3. **以为跨地域也是强一致**：Inter-stamp（geo-replication）是**异步**的。如果一个 stamp 整体毁了，恢复时**会丢几秒到几分钟数据**。这是当年 WAS 的明确取舍——强一致只在 stamp 内部保证。

4. **partition 热点不会自动消失**：某个 partition key 突然爆热，单台 Partition Server 扛不住。WAS 提供 split，但 split 触发的判定逻辑当时还是手动+半自动的——这是论文里坦白的待改进点。

5. **stamp 70% 利用率上限不是浪费**：留 30% 空间是给"故障重建副本"和"迁移热数据"留的。看上去亏，实际上没这缓冲就会因为某次大故障导致整个 stamp 写入阻塞——空间就是 SLA。

## 适用 vs 不适用场景

**适用**：

- 通用云对象存储（blob / table / queue 一站式）
- 需要**强一致 + 高可用**的工业级存储后端（订单、账本、日志归档）
- 跨地域备份要求"通常一致、灾难时容忍秒级丢失"——典型企业级 SLA

**不适用**：

- 超低延迟（亚毫秒）场景——三副本同步写延迟下限就在几毫秒
- 极小规模——一个 stamp 起步就是 10+ 机架，几台机器跑不起来
- 需要 ACID 事务跨多 partition——WAS 只在单 partition 内保证事务（后来 Spanner 才跨 partition）

## 历史小故事（可跳过）

- **2003**：Google 发 GFS 论文，开启分布式文件系统时代，但 metadata 弱一致
- **2006**：Bigtable 在 GFS 上做范围分片表，影响了所有后续 KV 系统
- **2007**：Amazon Dynamo 选**最终一致**路线，可用性优先
- **2008**：微软启动 Azure Storage 项目，Brad Calder 带队，目标是"做 Dynamo 没做的强一致"
- **2010**：Azure Storage 商用 GA
- **2011**：SOSP 论文公开架构，是工业界第一份"强一致 + 海量规模"的对象存储白皮书
- **2012**：Google Spanner 论文出来，把"强一致 + 全球规模"再推一步（加 TrueTime）
- **2017**：Aurora 把"日志下沉到存储"做成商用，本质是 WAS 思路的继承

## 学到什么

1. **强一致 vs 可用性不是非此即彼**——WAS 在 stamp 内部强一致，跨 stamp 最终一致，是工业上常见的折中，比 CAP 教科书更实用
2. **分层是控制复杂度的关键**：Stream Layer 只管"无脑 append"，Partition Layer 只管"按 key 切片"，Front-End 只管"路由鉴权"——每一层职责单一，bug 才好定位
3. **Paxos 不是为了快，是为了不丢**：metadata 用 Paxos，数据走简单 3 副本写，是性能与正确性的工程平衡
4. **Append-only 是分布式存储的基石**：WAS / GFS / Aurora / Kafka 全都建立在"只追加" 之上，因为追加才能多副本同步而不冲突

## 延伸阅读

- 论文 PDF：[Calder et al. SOSP 2011](https://sigops.org/s/conferences/sosp/2011/current/2011-Cascais/printable/11-calder.pdf)（24 页，结构清晰）
- 视频：[Brad Calder SOSP 2011 talk](https://www.youtube.com/results?search_query=brad+calder+azure+storage+sosp+2011)（论文配套报告）
- 配套读：[GFS 2003](https://research.google/pubs/the-google-file-system/)、[Spanner 2012](https://research.google/pubs/spanner-googles-globally-distributed-database-2/)
- [[gfs-2003]] —— WAS 的 Stream Layer 思路源头
- [[bigtable-2006]] —— Partition Layer 的范围分片来自这里

## 关联

- [[gfs-2003]] —— Stream Layer 类比 GFS 的 chunk server，但 metadata 用 Paxos 强一致
- [[bigtable-2006]] —— Partition Layer 像 Bigtable 但加了更强 schema 与事务
- [[spanner-2012]] —— 同样追求强一致+大规模，再加 TrueTime 做跨地域事务
- [[aurora]] —— Aurora 把"日志下沉到存储"做成商用，思路与 WAS 同源
- [[brewer-cap-2000]] —— CAP 定理是 WAS 取舍的理论背景
- [[paxos-made-simple]] —— Stream Manager 元数据用 Paxos
- [[dynamo]] —— Dynamo 选最终一致，与 WAS 形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[chain-replication-2004]] —— Chain Replication — 把多副本排成流水线，简单且强一致
- [[craq-2009]] —— CRAQ — 让链复制每个节点都能读，吞吐线性扩展
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[f4-2014]] —— f4 — Facebook 把 90 天前的旧图片搬到一个省 40% 存储的仓库
- [[hdfs-2010]] —— HDFS — 把 GFS 用 Java 重写一遍并撑到 25 PB
- [[memcached-fb-2013]] —— Scaling Memcache at Facebook — 万台缓存怎么不被踩塌
- [[nvme-protocol-2017]] —— NVMe — 为 SSD 重写的存储协议
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳

