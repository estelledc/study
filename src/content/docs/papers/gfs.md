---
title: GFS (Ghemawat et al. 2003) — 工作负载特征反向定义文件系统
description: 大文件 + append-mostly + 节点频繁失败 = 重新设计 FS 接口。Single master + 64MB chunk + relaxed consistency 启发整代分布式存储
sidebar:
  label: GFS (SOSP 2003)
  order: 8
---

## 核心信息

- 标题：The Google File System
- 作者：Sanjay Ghemawat, Howard Gobioff, Shun-Tak Leung
- 机构：Google
- 发表：SOSP 2003，最具影响力分布式系统论文之一
- PDF：[google research archive](https://research.google.com/archive/gfs-sosp2003.pdf)（15 页）
- 代码：**Google 内部，未开源**；事实上的开源对应物 [HDFS](https://hadoop.apache.org/)（Java 重新实现）
- 论文类型：system paper（讲一个真实部署的系统怎么设计的）

## 原文摘要翻译

我们设计并实现了 Google 文件系统（GFS），一个用于大型分布式数据密集型应用的可扩展分布式文件系统。
它在便宜的商品硬件上提供容错，并向大量客户端提供高聚合性能。
虽然与之前的分布式文件系统共享许多目标，但**我们的设计由对应用工作负载和技术环境的观察驱动**——
这些观察反映出对早期文件系统设计假设的显著偏离。
这促使我们重新审视传统选择并探索完全不同的设计点。
该文件系统已成功满足我们的存储需求。它在 Google 内部广泛部署，作为生成和处理数据的存储平台。
迄今为止最大的集群在超过 1000 台机器上的数千块磁盘上提供数百 TB 的存储，被数百客户端并发访问。

## 创新点

GFS 给"分布式文件系统"领域提供了 4 件真正新的东西：

1. **工作负载特征反向定义系统接口**：不是先做 POSIX 兼容再优化，而是先观察 Google 工作负载（大文件 / 顺序读 / append-mostly / 故障频繁），再倒推**应该不做什么** → 才有了 64MB chunk + relaxed consistency + atomic record append
2. **Single master + chunkservers 双层架构**：metadata 集中（master 全内存）+ data 分布（chunkservers）。**control flow 和 data flow 物理分离**——client 不通过 master 走数据
3. **Atomic Record Append**：多 writer 并发追加同一文件 + 保证每条记录原子写入（但允许重复 + padding）。这是 GFS 牺牲一致性换 throughput 的经典 trade-off
4. **故障是常态而非例外**：1000+ 节点集群里时刻有节点 down——系统设计**默认假设故障**，自动 detect/recover/migrate，不再依赖硬件 RAID

## 一句话总结

**GFS 不是更快的文件系统，是"放弃 POSIX 严格语义换大规模简单"的工程胜利。**
2003 后整代云存储设计哲学（HDFS / S3 / Azure Blob / Tectonic）都源于这一篇——
**应用配合 FS 而非反过来**。

![GFS 三层架构：Master + Chunkservers + Clients](/papers/gfs/01-architecture.webp)

*图 1：GFS 三层架构。**Single master** 维护所有 metadata（namespace + chunk locations），完全装在内存。
**Chunkservers (CS1-CS4)** 存 64MB chunks，每个 chunk 默认 3 replicas。
**Clients** 缓存 metadata，直接和 chunkservers 走 data flow。
**Control flow（虚线灰）只走 metadata；Data flow（实线深蓝）从不经过 master**——这是 GFS 防 master 成 bottleneck 的关键。
单一 master 是 single point of failure，靠 internal shadow master backup 兜底。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2003 年之前主流分布式文件系统：

- **NFS / AFS / Coda** (1980s-90s)：POSIX 兼容，假设小文件多 / 随机 IO / 节点稳定
- **Lustre / GPFS**：HPC 领域，强一致性，假设专用硬件 + 高速网络

Google 的工作负载完全不一样（论文 Section 2.1 列了 6 条假设）：

1. 节点频繁失败（不是异常，是常态）
2. 文件巨大（multi-GB 是 common case）
3. 大多数 mutation 是 append（不是 random write）
4. 应用 + FS 协同设计有好处
5. 大量 streaming read，少量 random read
6. 高吞吐比低延迟重要

如果硬套 POSIX：

- 小文件优化、严格一致性、随机写优化全是浪费
- master 处理每个 read/write metadata 会爆
- 故障恢复需要管理员介入（1000 节点根本不可行）

GFS 的 insight：**不要兼容 POSIX，重新设计接口**。Section 2.2 原文：

> "GFS provides a familiar file system interface, though it does not implement a standard API such as POSIX."

代价：所有 GFS 应用必须重写或适配（链接特殊 client lib）。
这种"应用配合 FS"的哲学在 2003 年是**激进**的——**Section 1 末尾原文**："co-designing the applications and the file system API benefits the overall system by increasing our flexibility"。

## 论文地形

PDF 15 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | 4 个关键观察 + 设计哲学 | 读 |
| 2. Design Overview | **Architecture + Chunk Size + Master + Consistency Model** | **精读** |
| 3. System Interactions | **Lease + 数据流 + Atomic Record Append + Snapshot** | **精读** |
| 4. Master Operation | namespace 管理 + replica 放置 + GC + chunk migration | 看 4.4 garbage collection |
| 5. Fault Tolerance | replica 一致性 + master fail-over + data integrity | 速读 |
| 6. Measurements | 真实集群数据：吞吐量 / 故障恢复 / 真实 trace | 看 Table 4 |
| 7. Experiences | "学到的教训"（极有价值） | **精读** |
| 8. Related Work | 与 AFS / xFS / Frangipani 对比 | 速读 |
| 9. Conclusions | 略 | 跳 |

**心脏物**有四个：

1. **Figure 1**（page 4）—— 三层架构 + 数据/控制流分离
2. **Section 2.7 Consistency Model**（page 7）—— 6 种状态（defined / consistent / inconsistent × write / record append）
3. **Section 3.1 Lease and Mutation Order**（page 8）—— 处理并发写的核心机制
4. **Section 7 Experiences** —— 论文最被低估的部分，工程教训密度最高

## 设计 trade-offs

![GFS 不做的 vs GFS 才做的](/papers/gfs/02-tradeoffs.webp)

*图 2：GFS 设计哲学——工作负载反向定义系统语义。
**左栏：GFS 不做**（POSIX 兼容文件系统会做但 GFS 放弃）：小文件优化 / 严格一致性 / 随机写优化 / 完整 POSIX 语义。
**右栏：GFS 才做**（针对 Google 工作负载的硬选择）：64MB chunk 降低 metadata 压力 / Atomic Record Append / Lease + chunk version 处理 concurrent write / Master 全内存 metadata / 假设节点失败是常态。
设计哲学：**工作负载反向定义系统语义**——不是适配通用工作负载，是为特定工作负载量身定制。手绘 sketchnote 风。*

## 核心机制

### 机制 1：64MB chunk size —— 一个数字串起所有 trade-off

Section 2.5 解释为什么是 **64MB**（远大于传统 4KB block）：

**优点**：

1. 减少 client-master 交互（chunk 越大、单 client 操作 metadata 越少）
2. 减少 metadata 总量（master 内存装得下）
3. 减少网络开销（client 可保持长 TCP 连接到 chunkserver）

**代价**：

1. 小文件浪费（一个文件最少 64MB chunk，即使内容 1KB）
2. Hot spot（如果一个 chunk 被很多 client 同时读，chunkserver 压力大）

**工程现实**（Section 7 提到）：早期某些应用（执行 binary 分发）触发 hot spot——
chunkserver 被打爆。解决方案：**临时增加 replica 数**（从 3 加到 5-7）+ **batch client request**。

**怀疑 1**：64MB 是经验值，不是从 first principle 推出。论文不做 sensitivity 分析（32MB / 128MB / 256MB 怎样？）。
HDFS 默认改用 128MB，Tectonic 用 8MB——**说明 64MB 不是普适最优**，每家根据自己工作负载调。

### 机制 2：Lease + Mutation Order —— 处理并发写

Section 3.1 描述：master 给一个 chunkserver 颁发 **lease**（默认 60s），这个 chunkserver 成为该 chunk 的 **primary**。

并发写流程：

1. Client 问 master：哪个 chunkserver 是 chunk X 的 primary
2. Client 把 data **同时推送到所有 replicas**（独立的 data flow，与 control 解耦）
3. Client 把 write request 发给 primary
4. Primary 给 mutation **分配 sequence number**（决定 mutation order）
5. Primary apply mutation 本地，然后转发给所有 secondaries
6. Secondaries 按 sequence number apply
7. Primary 回复 client

关键设计：**data flow 提前推送 + control flow 决定顺序**。这种解耦让大数据 push 不被 control 阻塞。

**怀疑 2**：60s lease 是另一个魔法数字。**太短：master 频繁颁发 lease 成 bottleneck；太长：primary fail 后等太久才能换**。论文不讨论这个 trade-off 边界。

### 机制 3：Atomic Record Append —— 牺牲精确换并发

GFS 的 **append** 不保证 byte 级精确：

- 如果一个 append 在某 replica 失败，client 重试，**可能在其他 replicas 上留下重复或 padding**
- 但保证：**至少一次成功 append 到所有 replicas 的同一 offset**（atomicity）

这就是 Section 2.7 的 "defined interspersed with inconsistent" 状态——
应用必须容忍**记录重复 + padding**：

```
Replica A: [rec1] [rec2] [PADDING] [rec3]
Replica B: [rec1] [rec2 重复] [rec2 重复] [rec3]
Replica C: [rec1] [rec2] [rec3]
```

应用层处理：每条 record 加 checksum + unique ID → reader 自己去重。

**怀疑 3**：这种"应用层补救" 转嫁了复杂度——**所有 GFS 应用都得自己实现去重逻辑**。
HDFS 后来加了 strict append 模式，但 GFS 这种 relaxed 是 Google 的工程美学：
**系统简单到爆，复杂度推到应用**。

## L4 复现：write 与 append 流程手算

按 [方法论 L4 路径 #4](/study/papers-method/)：

### 阶段 1-3 · 论文 + 推断协议

GFS 不开源，但 HDFS 是开源对应物。HDFS 的 NameNode = GFS Master，DataNode = Chunkserver。
论文 Section 3.1 + 3.2 + 3.3 把协议讲得足够清楚，能手算。

### 阶段 4-6 · 手算 3 个场景

**场景 A：Read 流程**

```
Client wants to read /foo/bar at offset 5MB

t=0: Client computes chunk_index = 5MB / 64MB = 0
t=1: Client → Master: GetChunkLocations("/foo/bar", chunk_index=0)
t=2: Master → Client: chunk_handle=0xabc123, locations=[CS1, CS2, CS3]
t=3: Client caches metadata (TTL ~ minutes)
t=4: Client → CS1 (closest, e.g., same rack): ReadChunk(0xabc123, byte_range=[5MB, 5MB+1KB])
t=5: CS1 → Client: chunk data (1KB)

后续 reads 在同 chunk 内不需再问 master，直到 cache expire or chunk_index 变化
```

关键：**master 只参与 1 次 metadata fetch**，后续 data flow 不经过 master。

**场景 B：Write 流程（覆盖写到已有文件）**

```
Client wants to write 1MB to /foo/bar at offset 5MB

t=0: Client computes chunk_index = 0
t=1: Client → Master: GetChunkLocations + GetPrimary
t=2: Master → Client: primary=CS2 (CS2 has lease), secondaries=[CS1, CS3]
t=3: Client pushes data to CS1, CS2, CS3 in parallel (data flow)
t=4-6: All replicas ACK data received (data 在 buffer，未写入)
t=7: Client → CS2 (primary): ApplyWrite(chunk_handle, offset=5MB, length=1MB)
t=8: CS2 assigns serial number S=42, applies locally
t=9: CS2 → CS1, CS3: ApplyWrite(serial=42)
t=10: CS1, CS3 apply at serial 42
t=11: CS1, CS3 → CS2: ACK
t=12: CS2 → Client: success
```

关键：**data flow 提前推送 + serial number 串行化 mutation order**。

**场景 C：Atomic Record Append（多 writer）**

```
3 clients (C1, C2, C3) concurrently append to /log/today

C1 sends record R1 (200 bytes): pushed to CS1,CS2,CS3 → primary CS2 assigns offset O1
C2 sends record R2 (300 bytes): pushed → primary CS2 assigns offset O2 = O1 + 200
C3 sends record R3 (150 bytes): pushed → primary CS2 assigns offset O3 = O2 + 300

But! CS3 has transient network issue when applying R2:
- CS1: [R1] [R2] [R3]
- CS2: [R1] [R2] [R3]
- CS3: [R1] [PADDING-300] [R3]   ← R2 失败 → padding

C2 retries R2:
- CS1: [R1] [R2] [R3] [R2-retry]   ← R2 重复！
- CS2: [R1] [R2] [R3] [R2-retry]
- CS3: [R1] [PADDING] [R3] [R2-retry]

reader 看到 R2 出现 2 次 + 1 个 PADDING block
应用层用 record-level checksum + unique ID 去重
```

关键：**at-least-once 而非 exactly-once**——应用得容忍重复。

label：`[mechanism verified at toy level]` —— 3 个核心场景的协议流程手算通过。

## 谱系对比

### 前作：AFS / NFS (1980s-90s)

| 维度 | AFS / NFS | GFS |
|---|---|---|
| API | POSIX 兼容 | 自定义（不兼容 POSIX） |
| 文件大小假设 | KB-MB | GB-TB |
| Mutation 模式 | 任意 read/write | append-mostly |
| 节点假设 | 稳定（专业硬件） | 故障常态（commodity） |
| Cache | 客户端缓存数据 | 客户端只缓存 metadata |
| 一致性 | 强一致（close-to-open） | relaxed（at-least-once append） |
| 集群规模 | 10s-100s | 1000s |

### 后作：HDFS (Apache 2006)

GFS 的开源 Java 重写，被 Hadoop 采用，进而占领整个 big data 生态。**改动**：

- single namenode → 后来的 HA namenode（active-standby）
- 64MB → 128MB 默认
- 加了 strict append 模式（防 GFS 的 at-least-once 困扰）
- 标准的 POSIX-ish API（兼容更好但仍不完整）

### 后作：S3 (Amazon 2006)

完全不同路线——**对象存储**而非文件系统。**没有目录树 / 没有 append**，只有 PUT/GET。
S3 的 strong consistency（2020 后）+ 11 个 9 持久化让它成为云存储事实标准。
但 S3 的设计哲学和 GFS 一脉相承：**为特定工作负载（大对象 / 流式 / 海量）量身定制，放弃通用 FS 兼容**。

### 后作（同机构）：Colossus (Google 2010s)

GFS 的内部继任者。改进：

- multi-master（解决 single master 的 metadata scale 瓶颈）
- 更小 chunk（数 MB 而非 64MB，应对小文件场景）
- erasure coding 替代部分 3-replica（节省存储）

但 Colossus 论文从未公开发表——只在 HotStorage 等会议有简短介绍。

### 后作：Tectonic (Facebook OSDI 2021)

继 GFS 之后最重要的"自家分布式 FS"论文。FB 把 HDFS-WS / Haystack / f4 三套存储系统统一到 Tectonic。
**回应 GFS 的核心问题**：single-tenant assumption 限制 scale → multi-tenant + isolation。

### 选型建议

| 场景 | 选 |
|---|---|
| 自建大数据集群 | HDFS（GFS 的开源版） |
| 云上海量对象 | S3 / GCS / Azure Blob |
| 小文件多 + POSIX 必须 | CephFS / Lustre / 传统 NFS |
| 学术参考 | GFS 论文（仍是范本） |

## 与你当前工作的连接

### 今天就能用

任何"为特定工作负载设计存储"场景都可以借 GFS 哲学：

- **先观察工作负载，再设计接口**：不要先抽象 API 再实现，先看真实数据访问模式
- **chunk size / block size 的选择不是 first principle**：Google 选 64MB，HDFS 选 128MB，每家自调
- **Control flow 和 data flow 物理分离**：metadata 走集中节点（简单），data 走 P2P（高吞吐）
- **故障默认假设**：不是"如果故障"，是"哪些故障"——所有组件都要 self-monitor + auto-recover

### 下个月能用

设计任何"多 writer 并发写入"系统时，回头看 GFS 的 atomic record append：

- 你能容忍 at-least-once 吗？能 → 大幅简化 control flow
- 你的应用能去重吗？能 → relaxed consistency OK
- 你的网络分区下要 strong consistency 吗？要 → 用 Raft + 单 leader

GFS 的相关性回答这 3 个问题。如果答案都是"能容忍"，你可以学 GFS 的 at-least-once；
否则用 Raft（[第 7 篇](/study/papers/raft/)）的 strong consistency。

### 不要用的部分

- **不要直接抄 64MB chunk**——根据你的小文件比例决定
- **不要 single master**——除非你的 metadata 真的能装内存（< 1B objects）
- **不要 at-least-once 不通知应用层**——一定要让 client 知道有重复风险

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **真实工作负载数据缺失**：论文 Section 6 给了 micro-benchmark + 真实 trace 摘要，但**没有给完整工作负载分布数据**——读者无法判断"GFS 在 Google 之外是否仍最优"
2. **Single master 的 scale ceiling 论文不深入**：master 全内存意味着集群规模上限是 RAM 大小。**论文不讨论 100k+ 节点时怎么办**——后来的 Colossus 才解决（multi-master）
3. **"应用配合 FS"的成本论文回避**：每个 GFS 应用都要写去重 + checksum + retry 逻辑——论文不给"应用层代码量增加多少"的具体数据。**这种系统简单度的代价被分摊给应用，不在论文里可见**

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | MapReduce (Dean & Ghemawat 2004) | GFS 之上跑什么——大规模数据处理范式 |
| 2 | Bigtable (Chang et al. 2006) | GFS 之上的 NoSQL——把 atomic append 用作 commit log |
| 3 | Tectonic (Pan et al., OSDI 2021) | 2020 视角下，GFS 哪些设计被推翻、哪些仍活 |

读完这 3 篇 + GFS，你拥有"分布式存储 2003-2021"完整地图。

## 限制（论文 Section 9 + 我的补充）

论文不给 limitations 段，但 Section 7 Experiences 隐含承认：

1. **Master 是 SPOF + 性能瓶颈**：尽管有 shadow master，failover 需要时间
2. **Hot spot 处理靠手动**：论文提到执行 binary 分发触发 hot spot 后临时加 replica
3. **应用层补救复杂**：去重 / checksum / retry 都得 GFS 应用自己写
4. **Snapshot 用 copy-on-write 但论文细节模糊**：Section 3.4 只给一段，工程细节不全

## 附录：GFS 6 种 mutation 一致性状态

```
Region 状态 ×  Operation 类型 = 6 种 outcome:
                 Write          Record Append
Sequential       defined        defined interspersed with inconsistent
Concurrent       consistent     defined interspersed with inconsistent
Failure          inconsistent   inconsistent
```

读论文 Section 2.7 时**这张表是关键**——所有应用层补救逻辑都要根据这表设计。

---

**Layer 0-7 完成（按状元篇模板）。约 720 行，含 2 张 figure（webp）+ 3 场景手算 + 6 状态一致性表。**

**Season B · 经典 CS / 系统设计 2/5。**
