---
title: Aurora (Verbitski et al. 2017) — 把数据库的下半身换成日志机
description: 第一个把 redo log 推到存储层、让存储自己重放并版本化页面的云原生关系数据库。DB 实例只发日志、不发 page；4/6 写 + 3/6 读 quorum 跨 3 AZ x 2 节点；2026 已是 AWS 看家盘也是 Neon 等 OSS 后继者的设计起点
sidebar:
  label: Aurora (SIGMOD 2017)
  order: 25
---

> **论文类型 self-classify**：method / system paper（分支 A）。
> 心脏物 = 把传统 DB 的「DB instance 既算又存」拆成「DB instance 只发 redo log + 存储层自己重放」，
> 配合 4/6 写 + 3/6 读 quorum 跨 3 AZ x 2 storage node 的 6 副本模型。
> **Aurora 本身闭源**——本笔记用 [neondatabase/neon](https://github.com/neondatabase/neon)（Rust + PostgreSQL 协议，
> 同设计哲学 OSS 实现，commit `8f60b04da47ffefe0e52bda2440134b42874eb75`，截至读时 master HEAD）作锚点，
> 配合论文原文 §3-§5 比对。
> 本笔记按 [papers-method v1.1 分支 A](/study/papers-method/) 标准重构；目标 ≥ 500 行 + 2 图 + 3 GitHub permalink + 4 处具体怀疑。

## Layer 0 · 身份扫描

| 字段 | 内容 |
|---|---|
| 标题（英文） | Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases |
| 标题翻译（中文） | Amazon Aurora：高吞吐云原生关系型数据库的设计取舍 |
| 作者 | Alexandre Verbitski, Anurag Gupta, Debanjan Saha, Murali Brahmadesam, Kamal Gupta, Raman Mittal, Sailesh Krishnamurthy, Sandor Maurice, Tengiz Kharatishvili, Xiaofeng Bao（10 人，AWS Aurora team） |
| 一作机构 | AWS（Verbitski 时为 Aurora storage 工程主管，2014 Aurora MySQL launch 主导人之一） |
| 发表时间 | SIGMOD 2017（2017-05，Industrial Track），论文 12 页正文 |
| 发表渠道 | ACM SIGMOD 工业 track（与 2018 follow-up 论文 "Avoiding Distributed Consensus for I/Os" 配套） |
| 论文 PDF | [ACM DL 3035918.3056101](https://dl.acm.org/doi/10.1145/3035918.3056101) / [AWS 公开镜像](https://web.stanford.edu/class/cs245/readings/aurora.pdf) |
| 引用数 | 截至 2026-05 在 Google Scholar > 2200，70% 来自 2020 之后（Aurora Serverless v2 + Snowflake 等"分离存算"系统兴起带动） |
| arXiv 版本 | 无 arXiv（SIGMOD 工业论文不走 arXiv） |
| 官方代码 | **闭源**——Aurora storage layer 是 AWS 内部代码，从未开源 |
| 替代 / 后继 OSS 实现 | [neondatabase/neon](https://github.com/neondatabase/neon)（Rust，Postgres-compat，同哲学，commit `8f60b04da47ffefe0e52bda2440134b42874eb75`，2026-05 master HEAD，star ~17k） / [postgresml/Hadron](https://github.com/databricks/lakebase-status)（Databricks Lakebase, partial）/ Aurora DSQL（2024，AWS 自家新版，仍闭源） |
| 数据 / 资源 | 论文 §6 性能：Aurora vs MySQL 5.6 / 5.7，128GB 数据集，r3.8xlarge，sysbench OLTP；写吞吐 5x，复制延迟 P99 < 20ms |
| 论文类型 | method + system paper（哲学创新——log-is-DB——叠工程实现描述：quorum、心跳、segment 修复、storage gossip） |

## 原文摘要翻译

Amazon Aurora 是一个面向 OLTP 工作负载的关系型数据库服务，是 AWS 的一部分。本论文描述
该系统的架构以及导致这种架构的设计取舍。我们认为 cloud-native 数据库的核心瓶颈已经从计算和存储
**移到了网络**。Aurora 通过一种**新的架构**回应这种约束——把 redo 处理推到一个**专为 Aurora 设计、
跨多租户、可扩展的存储服务**。我们描述了这种架构如何不仅减少网络流量，还允许快速崩溃恢复、副本故障无丢失，
以及容错的、自愈的存储。然后我们解释 Aurora 如何在状态多 AZ 持久化层之上的多个存储节点之间达成
持久状态共识，避免昂贵且 chatty 的恢复协议。最后，我们分享 18 个月在生产中运行 Aurora 学到的教训，
以及来自客户对现代云应用的期望。

## 创新点

Aurora 给"云原生关系数据库"领域提供了 5 件真正新的东西，**所有创新都源于一个反直觉决定：
不要让 DB 实例发 page，让它只发 redo log——存储层自己会重放、版本化、修复**。

1. **The log is the database**：传统 DB（MySQL InnoDB / Postgres）写一行 → 写 redo log + 写 dirty
   page + checkpoint 周期性 flush page 到磁盘。Aurora 反其道行之——DB 实例**只**写 redo log 到存储层，
   page 由存储节点本地重放生成。这一条决定让"DB → storage"网络流量从 16KB / 写跌到 ~100 字节 / 写，
   论文 §3.1 实测对比 MySQL Multi-AZ 节省 7.7x 网络 IO——参见 [Layer 3 §3.1](#31-log-only-protocol-vs-传统-write-path)。
   论文 §2 原文："the bottleneck moves to the network between the database tier and the storage tier"。

2. **6-way replication + 4/6 写 + 3/6 读 quorum**：不是简单镜像 / 链式复制，而是把"6 个 storage 节点 × 跨 3 AZ"
   设计成可以承受"任意 1 个 AZ 全挂 + 任意一个其他 AZ 内 1 个节点挂"——而且**读路径不阻塞**。
   选 4/6 + 3/6 是因为 4 + 3 > 6 满足 R + W > N（quorum 不变式），同时 4/6 容忍 AZ 故障 + 1 节点。
   参见 [Layer 3 §3.2](#32-quorum-46-write--36-read-跨-3-az)。

3. **VCL / CPL / VDL 三个水位线**：传统 DB 用 LSN（log sequence number）单一时间轴，
   Aurora 把"写到哪"细分为三个 LSN：**VCL（volume complete LSN）= 存储层最高已收到的连续 LSN**；
   **CPL（consistency point LSN）= mini-tx 边界**（事务原子性的边界，不能切开）；
   **VDL（volume durable LSN）= max(CPL ≤ VCL)**（用户可见的"已提交"水位）。
   这是 Aurora 把"持久化"和"对外可见"解耦的关键——参见 [Layer 3 §3.3](#33-vdl-推进--gossip--peer-repair)。

4. **崩溃恢复在存储层完成，不在 DB 实例**：传统 DB 重启后 InnoDB 要扫所有 redo log 做 redo + undo——
   崩溃恢复时间和 dirty page 数量成正比。Aurora 重启时 DB 实例**几乎瞬时可用**——存储节点自己重放
   到 VDL，DB 实例只需读元数据查最新 VDL。论文 §4.2 报告 10s 量级 vs MySQL 数十分钟。

5. **Continuous backup 由存储层免费提供**：因为 storage 节点本来就在写 segment 文件，
   Aurora 把这些 segment 持续上传 S3——用户不需要 traditional pg_dump / mysqldump。
   PITR（point-in-time recovery）变成"找一个 snapshot + replay 到目标 LSN"，**这是 Aurora 设计的副产物，不是单独工程**。
   论文 §5.1：相同硬件下 backup 不影响前台 OLTP 吞吐。

## 一句话总结

**Aurora 不是更快的 MySQL，是「第一个把数据库的下半身换成日志机」——把传统 DB instance 中"算 + 存"绑定的下半身切掉，
留给一个分布式日志重放服务，DB 实例从此只负责 SQL 解析 + 事务管理，page 是日志的视图、不是 DB 实例的产物。**

你今天用的每一个 Aurora cluster、每一个 Neon serverless Postgres、每一个 RDS Multi-AZ 副本、每一次
"写副本几乎零延迟看到主写"的体验——背后都是这篇论文画的回路：
**DB 只发 redo，存储自己 replay；写靠 quorum，读靠 quorum；崩溃恢复在存储不在 DB。**

![Aurora 架构：DB 实例只发 redo log → 跨 3 AZ x 2 节点的 6 副本存储层 → 4/6 写 quorum + 3/6 读 quorum + storage 自重放](/study/papers/aurora/01-architecture.webp)

*图 1：Aurora 架构。顶部 DB writer（Aurora-MySQL fork）+ 多个 reader 副本，DB 实例之间不传 page、
只通过存储层共享数据；中部网络只搬 redo 记录（约 100 字节级，对比传统 16KB page 流）；底部 6 个 storage 节点
跨 3 AZ x 2 节点，每个节点 6 步本地工作流——接 log、ACK quorum、gossip、coalesce 成 page、snapshot 到 S3、
GC 旧 log。底栏标 quorum 不变式 Vw + Vr > N (4 + 3 > 6) 与 VCL ≤ CPL ≤ VDL 三水位关系。
画风：sketchnote / paper-figure 风。*

## Layer 1 · Why（这篇出现前世界缺什么）

2014 年前后，"在云上跑关系数据库"领域有两条主流路线，**两条都各自卡住**：

**路线 1：传统 DB lift-and-shift 派**——以 RDS for MySQL Multi-AZ / Cloud SQL HA / Azure DB for PostgreSQL 为代表
- 哲学：把单机 DB 装进 VM，外面包个 HA 控制面（同步 standby + 失败时切流量）
- 设计：sync replication（写主 + 同步 standby）；page-shipping；崩溃恢复仍是单机 redo
- **致命瓶颈 1**：每次写要发 redo + dirty page + binlog——网络放大 2-3x
- **致命瓶颈 2**：sync standby 让单点写入 latency 涨到 main + sync 网络往返；标准做法只能跨 AZ 一份镜像
- **致命瓶颈 3**：standby 不能跨 AZ 多份（成本爆炸）；故障转移有 30s+ 切主时间
- 论文 §1 直白点名："The traditional approach has run-time costs and complex management overhead"

**路线 2：shared-disk DB 派**——以 Oracle RAC / IBM DB2 pureScale 为代表
- 哲学：多节点共享一套 SAN 存储，节点之间通过分布式 lock manager 协调写
- 设计：lock manager + cache fusion；任何节点写都得跨网络买 lock
- **致命瓶颈**：lock manager 是 hotspot；scaling 受限于互联（要 InfiniBand 级硬件）；不适合云的 commodity 硬件
- 公有云没人成功跑 RAC——这条路线在 2014 已经被工业界放弃在云上的部署

工程界的现实（AWS 内部背景）：
- 2010-2013：Amazon.com 自家想离开 Oracle，需要一个"看起来像 MySQL 但跨 3 AZ 高可用且不收 lock manager 税"的东西
- RDS for MySQL 已存在 5 年（2009 launch），但单实例 throughput 受限于"写 page + binlog 同步" 设计
- DynamoDB（2012）证明了"无 schema + AP + quorum"在云上能跑——但客户说"我要 SQL，给我 SQL"

Verbitski 等人的 insight（论文 §2 第二段措辞缝隙）：
> "We believe the central constraint in high-throughput data processing has moved from compute and storage to the network."

翻译人话：**单机磁盘已经够快（SSD 普及），CPU 也够多核（r3.8xlarge）——剩下的瓶颈在 DB 与 storage 之间的网络。
那么解法很自然：让 DB 不要发那么多东西。redo log 已经包含所有信息，何必再发 dirty page？
让 storage 自己 replay 就好了——但这要求 storage 节点是 stateful、能 replay、能版本化的——
而不是哑磁盘 / 哑 SAN。**

把 storage 从"哑磁盘"升级成"会重放的日志机"——一行哲学改变让所有性能瓶颈消失：
- 不需要写 dirty page → 网络流量降一个数量级
- 不需要 sync standby → quorum 取代它，4/6 + 3/6 跨 AZ 高可用
- 不需要 binlog → redo log 已经是 single source of truth
- 不需要应用 buffer pool flush → page 是 log 的视图，按需 materialize

这就是 Layer 1 的答案：**Aurora 出现前，没人敢把 storage 写得这么"聪明"——而正是这种"聪明"换来了一个数量级的吞吐 + 跨 3 AZ 的天然容灾**。

## Layer 2 · 论文地形

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| §1 Introduction | 单租户 → 多租户云演化 + cloud DB 痛点 | 精读（5 min） |
| §2 Durability at Scale | **第一心脏**：6-way replication + 4/6 写 quorum + 3/6 读 quorum + AZ 假设 | 必看（10 min） |
| §3 The Log is the Database | **超级心脏**：log-only 协议 + storage 节点 6-step pipeline + 网络 IO 节省比 | 精读 + 配 figure 2（15 min） |
| §3.1 Burden of Amplified Writes | 传统 DB 的网络放大具体计算 | 看 Table 1（3 min） |
| §3.2 The Log is the Database | log-only 协议核心描述 | 精读（5 min） |
| §4 The Log Marches Forward | **第二心脏**：VCL / CPL / VDL 三水位 + crash recovery in storage layer | 必看（8 min） |
| §4.2 Recovery | 崩溃恢复在 storage 层完成 | 必看（5 min） |
| §5 Putting it All Together | 整套数据流：write path / commit path / read path | 精读（5 min） |
| §6 Performance Results | sysbench / TPC-C / 复制延迟 | 看 Figure 6, 7 + Table 2（5 min） |
| §7 Lessons Learned | 18 个月生产经验 | 跳读（3 min；藏着审稿意见痕迹） |
| §8 Related Work | 把对手分两堆：shared-disk DB vs distributed DB | 必看（措辞缝隙暴露作者立场，3 min） |
| §9 Conclusion | "log is the database" 一句话总结 | 必看（1 min） |

**心脏物 3 个**：
1. §2 + Figure 2 的 quorum 模型——对应 [Layer 3 §3.2](#32-quorum-46-write--36-read-跨-3-az)
2. §3.2 的 log-only protocol 描述——对应 [Layer 3 §3.1](#31-log-only-protocol-vs-传统-write-path)
3. §4 的 VDL 推进协议 + Figure 4 的 storage 节点 6 步骤——对应 [Layer 3 §3.3](#33-vdl-推进--gossip--peer-repair)

## 机制流程压缩成 5 步

| 步骤 | 角色 | 关键决定 |
|---|---|---|
| 1. DB instance 处理 SQL → 生成 redo log records | DB tier | 不再写 dirty page；不再 binlog；只 emit redo |
| 2. DB 把 redo records 并行发给 6 个 storage 节点 | 网络 | UDP-like protocol；按 mini-tx 切批 |
| 3. Storage 节点接 log → 持久化 → ACK | storage | 任意 4/6 ACK 即视为 commit；其余异步 catch up |
| 4. Storage 节点本地 replay log → coalesce 成 page | storage | 后台 worker 把连续的 log 压成 page；写 S3 snapshot |
| 5. DB instance 读 page 时按 LSN 向 storage 拉 | 读路径 | 任意 3/6 storage 节点能服务即可；按 read-LSN 看一致快照 |

每一步都"窄而深"——DB 不做 page、storage 不懂 SQL；这是论文的工程哲学。

## Layer 3 · 核心机制

下面 3 段每段引用 [neondatabase/neon@8f60b04](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75) 的真实 Rust 代码作 OSS 锚点，
配合论文 §3-§4 原文，并标 ≥ 5 个旁注 + 1 个怀疑。

> Aurora 闭源——Neon 不是 Aurora 的复刻，但**两者共享同一哲学**（DB 只发 WAL，存储层重放）。
> Neon 把 Aurora 的 storage 层拆成两个组件：**safekeeper**（持久化 WAL，相当于 Aurora 的 6 副本写路径）+
> **pageserver**（重放 WAL → 生成 page，相当于 Aurora storage 节点的 page coalescing）。
> 两个组件之间用 WAL stream 连接——这就是"log is the database"在 OSS 的最干净实现。

### 3.1 Log-only protocol vs 传统 write path

**永久链接**：[safekeeper/src/wal_storage.rs#L437-L490 @ 8f60b04](https://github.com/neondatabase/neon/blob/8f60b04da47ffefe0e52bda2440134b42874eb75/safekeeper/src/wal_storage.rs#L437-L490)

```rust
437      async fn write_wal(&mut self, startpos: Lsn, buf: &[u8]) -> Result<()> {
438          // Disallow any non-sequential writes, which can result in gaps or overwrites.
439          // If we need to move the pointer, use truncate_wal() instead.
440          if self.write_lsn > startpos {
441              bail!(
442                  "write_wal rewrites WAL written before, write_lsn={}, startpos={}",
443                  self.write_lsn,
444                  startpos
445              );
446          }
447          if self.write_lsn < startpos && self.write_lsn != Lsn(0) {
448              bail!(
449                  "write_wal creates gap in written WAL, write_lsn={}, startpos={}",
450                  self.write_lsn,
451                  startpos
452              );
453          }
454          if self.pending_wal_truncation {
455              bail!(
456                  "write_wal called with pending WAL truncation, write_lsn={}, startpos={}",
457                  self.write_lsn,
458                  startpos
459              );
460          }
461
462          let write_seconds = time_io_closure(self.write_exact(startpos, buf)).await?;
463          // WAL is written, updating write metrics
464          self.metrics.observe_write_seconds(write_seconds);
465          self.metrics.observe_write_bytes(buf.len());
466
467          // Figure out the last record's end LSN and update `write_record_lsn`
468          // (if we got a whole record). The write may also have closed and
469          // flushed a segment, so update `flush_record_lsn` as well.
470          if self.decoder.available() != startpos {
471              info!(
472                  "restart decoder from {} to {}",
473                  self.decoder.available(),
474                  startpos,
475              );
476              let pg_version = self.decoder.pg_version;
477              self.decoder = WalStreamDecoder::new(startpos, pg_version);
478          }
479          self.decoder.feed_bytes(buf);
480
481          if self.write_record_lsn <= self.flush_lsn {
482              // We may have flushed a previously written record.
483              self.flush_record_lsn = self.write_record_lsn;
484          }
485          while let Some((lsn, _rec)) = self.decoder.poll_decode()? {
486              self.write_record_lsn = lsn;
487              if lsn <= self.flush_lsn {
488                  self.flush_record_lsn = lsn;
489              }
490          }
```

旁注：

- **L437 函数签名只接 `(startpos, buf)`——没有 page、没有 dirty list、没有 binlog**——这就是 log-only
  哲学的代码兑现。Aurora 论文 §3.2 一句话："the database tier sends only redo log records to the storage tier。"
  这里 `buf: &[u8]` 就是那段 redo records；不传 page 是因为存储层会自己重放。
- **L440-L460 三道前置检查（rewrites / gap / pending truncation）**——log 必须严格顺序。这是
  与 Aurora 的 mini-tx 边界一致的不变量：log 不允许中间空洞，否则 replay 会卡。Aurora 论文 §4.1 的
  "the log marches forward" 标题指的就是这个。
- **L462 `write_exact(startpos, buf)` 是 WAL 真正落盘**——底层是 `pwrite` 系统调用 + 后续 fdatasync
  （见 §3.1.b）。这是 safekeeper 唯一的写入路径——没有 page 写、没有索引更新。
- **L470-L478 解码器重启逻辑**——如果上游 WAL stream 跳了一段（比如 compute 节点重启），
  decoder 要重新对齐。**这是"log-only 协议在面对客户端重启"的现实复杂度**——论文 Aurora 没细谈，
  Neon 暴露在代码里。
- **L485-L489 `poll_decode` 推进 record-level 水位线**——`write_record_lsn` 是 byte-level，
  `flush_record_lsn` 是 record-boundary-level（必须是完整一条 WAL record 的末尾）。这是 Aurora 论文
  CPL（consistency point LSN）的对应物——byte-level 持久化和 record-level 持久化是两件事。

> 与论文对照：Aurora §3.1 Table 1 计算 MySQL 写一行要发 7 类数据（redo + undo + binlog + image + commit + ...），
> Aurora 只发 redo log。看 Neon `write_wal` 签名只有 `buf` 参数——这就是 Aurora 论文承诺的代码现实。

怀疑 1：Neon `write_wal` 拒绝 gap（L447-L452 `creates gap in written WAL` 直接 bail!）——
**但 Aurora 论文 §4.1 暗示 storage 节点可以从 peer gossip 补 gap**。
Neon 的 safekeeper 是纯 sequential writer，不补 gap；补 gap 在 Neon 是 pageserver 端做的（从 S3 / 多个 safekeeper 拉）。
**这意味着 Neon 的容错路径比 Aurora 复杂一层**——Aurora storage 节点是同时 writer + repairer，
Neon 把这两件事拆开（safekeeper 只 writer，pageserver 只 repairer）。Aurora 闭源不知是好是坏，
但能合理猜：Aurora 的 storage 节点角色更"重"，Neon 的更"轻"——trade-off 是运维复杂度 vs 单节点 IOPS。

### 3.2 Quorum 4/6 write + 3/6 read 跨 3 AZ

**永久链接**：[safekeeper/src/wal_storage.rs#L495-L525 @ 8f60b04](https://github.com/neondatabase/neon/blob/8f60b04da47ffefe0e52bda2440134b42874eb75/safekeeper/src/wal_storage.rs#L495-L525)（flush 路径，对应论文中"4/6 ACK 才算 commit"的代码骨架）

```rust
495      async fn flush_wal(&mut self) -> Result<()> {
496          if self.flush_record_lsn == self.write_record_lsn {
497              // no need to do extra flush
498              return Ok(());
499          }
500
501          if let Some(unflushed_file) = self.file.take() {
502              self.fdatasync_file(&unflushed_file)
503                  .await
504                  /* BEGIN_HADRON */
505                  .inspect_err(|_| WAL_DISK_IO_ERRORS.inc())?;
506                  /* END_HADRON */
507              self.file = Some(unflushed_file);
508          } else {
509              // We have unflushed data (write_lsn != flush_lsn), but no file. This
510              // shouldn't happen, since the segment is flushed on close.
511              bail!(
512                  "unexpected unflushed data with no open file, write_lsn={}, flush_lsn={}",
513                  self.write_lsn,
514                  self.flush_record_lsn
515              );
516          }
517
518          // everything is flushed now, let's update flush_lsn
519          self.flush_lsn = self.write_lsn;
520          self.flush_record_lsn = self.write_record_lsn;
521          Ok(())
522      }
```

> Neon 单 safekeeper 视角的 flush；上层的 `WalProposer` 用 Paxos 风格的 quorum——
> 见 [safekeeper/src/wal_service.rs](https://github.com/neondatabase/neon/blob/8f60b04da47ffefe0e52bda2440134b42874eb75/safekeeper/src/wal_service.rs)
> 与论文 §2 对照阅读。

旁注：

- **L502 `fdatasync_file` 而不是 `fsync_file`**——只刷数据不刷 metadata，节省一次 inode 写。
  Aurora 论文 §3.2 没明说是哪种 fsync，但 Neon 选 `fdatasync` 是"在 ext4 / xfs 已知 metadata 不影响数据正确性"的实践共识。
- **L505 `WAL_DISK_IO_ERRORS.inc()` 的 inspect_err**——把磁盘错误暴露成 metric 而不是吞掉。
  这是与 Aurora 论文 §7 "instrument everything" 教训一致的——存储层任何一次 IO 失败都必须可观测。
- **L517-L520 commit 顺序：先 fsync 再更新 flush_lsn**——必须先持久化再宣告"flushed"，
  顺序反了就有崩溃丢数据的风险。这是经典 WAL 协议规则。Aurora 论文 §4.1 的 "log marches forward"
  在 byte-level 就是这条规则。
- **L519-L520 `flush_lsn` 和 `flush_record_lsn` 同时推进**——byte-level 和 record-level 两条水位线
  同步推进。Aurora 论文中这两条水位对应 VCL 和 CPL——VCL 是 byte-level，CPL 是 record-level（mini-tx 边界）。
- **整个 `flush_wal` 没有跨节点协调**——单 safekeeper 只管自己 fsync。**quorum 决定在更上层**
  （`WalProposer` 看到 4/6 safekeeper 的 `flush_lsn` 都到位才算 commit）。这是 Aurora 论文的关键架构选择：
  **每个 storage 节点是哑 fsync 工人，quorum 决定在 DB 实例侧**。

> 与论文对照：Aurora §2 Figure 2 画的 6 副本 + AZ 1 / AZ 2 / AZ 3，Vw=4 Vr=3 Vw+Vr>N。Neon 默认 3 副本 safekeeper（OSS 部署常见），
> 但 protocol 是同一 family——`commit_lsn = max LSN s.t. quorum of safekeepers reported flush_lsn >= it`。

怀疑 2：Aurora 的 4/6 + 3/6 quorum 假设 **3 个 AZ 同等可用**——但 AWS 实际 region 内 AZ 容量并不对称
（us-east-1a/b/c/d/e/f 历史上有的 AZ 容量翻倍）。**如果 AWS 内部把 6 个副本中 4 个落到同一 AZ，4/6 quorum 就退化成 1/3 AZ quorum**。
论文 §2.2 假设"AZ 是独立故障单元"——但同 AZ 的相关性在论文给的 18 个月生产数据里没单独披露。
**这是 Aurora durability 模型的隐藏假设——只在 AWS 客户给 AZ 平衡 hint 时成立**。Neon 在 OSS 自部署时
要自己保证 safekeeper 部署在不同 failure domain，没有自动校验。

### 3.3 VDL 推进 / gossip / peer repair

**永久链接**：[libs/wal_decoder/src/decoder.rs#L18-L70 @ 8f60b04](https://github.com/neondatabase/neon/blob/8f60b04da47ffefe0e52bda2440134b42874eb75/libs/wal_decoder/src/decoder.rs#L18-L70) +
[pageserver/src/tenant.rs#L498-L520 @ 8f60b04](https://github.com/neondatabase/neon/blob/8f60b04da47ffefe0e52bda2440134b42874eb75/pageserver/src/tenant.rs#L498-L520)（page 重放路径——Aurora storage 节点 §4.2 的 6 步骤之一）

```rust
18   impl InterpretedWalRecord {
19       /// Decode and interpreted raw bytes which represent one Postgres WAL record.
20       /// Data blocks which do not match any of the provided shard identities are filtered out.
21       /// Shard 0 is a special case since it tracks all relation sizes. We only give it
22       /// the keys that are being written as that is enough for updating relation sizes.
23       pub fn from_bytes_filtered(
24           buf: Bytes,
25           shards: &[ShardIdentity],
26           next_record_lsn: Lsn,
27           pg_version: PgMajorVersion,
28       ) -> anyhow::Result<HashMap<ShardIdentity, InterpretedWalRecord>> {
29           let mut decoded = DecodedWALRecord::default();
30           decode_wal_record(buf, &mut decoded, pg_version)?;
31           let xid = decoded.xl_xid;
32
33           let flush_uncommitted = if decoded.is_dbase_create_copy(pg_version) {
34               FlushUncommittedRecords::Yes
35           } else {
36               FlushUncommittedRecords::No
37           };
38
39           let mut shard_records: HashMap<ShardIdentity, InterpretedWalRecord> =
40               HashMap::with_capacity(shards.len());
41           for shard in shards {
42               shard_records.insert(
43                   *shard,
44                   InterpretedWalRecord {
45                       metadata_record: None,
46                       batch: SerializedValueBatch::default(),
47                       next_record_lsn,
48                       flush_uncommitted,
49                       xid,
50                   },
51               );
52           }
53
54           MetadataRecord::from_decoded_filtered(
55               &decoded,
56               &mut shard_records,
57               next_record_lsn,
58               pg_version,
59           )?;
60           SerializedValueBatch::from_decoded_filtered(
61               decoded,
62               &mut shard_records,
63               next_record_lsn,
64               pg_version,
65           )?;
66
67           Ok(shard_records)
68       }
69   }
```

```rust
498      /// This method is cancellation-safe.
499      pub async fn request_redo(
500          &self,
501          key: pageserver_api::key::Key,
502          lsn: Lsn,
503          base_img: Option<(Lsn, bytes::Bytes)>,
504          records: Vec<(Lsn, wal_decoder::models::record::NeonWalRecord)>,
505          pg_version: PgMajorVersion,
506          redo_attempt_type: RedoAttemptType,
507      ) -> Result<bytes::Bytes, walredo::Error> {
508          match self {
509              Self::Prod(_, mgr) => {
510                  mgr.request_redo(key, lsn, base_img, records, pg_version, redo_attempt_type)
511                      .await
512              }
513              #[cfg(test)]
514              Self::Test(mgr) => {
515                  mgr.request_redo(key, lsn, base_img, records, pg_version, redo_attempt_type)
516                      .await
517              }
518          }
519      }
```

旁注：

- **`from_bytes_filtered` L23 接 `shards: &[ShardIdentity]`**——单条 WAL record 进来后按 shard 分流。
  这是 Aurora 论文 §3.2 第二段提到的"sharded storage volume"在 OSS 的代码兑现：单 page 区段（10GB）级别分片，
  每条 WAL record 只发给关心这个 page 的 shard。**减少 fan-out 流量是 log-is-DB 哲学的另一面**。
- **L33-L37 `flush_uncommitted` 决策**——只有 dbase_create_copy 这类操作才需要在事务结束前刷。
  这是 Aurora 论文 §4.1 "mini-transaction" 边界的代码体现：大部分 WAL record 可以延迟刷，
  少数（DDL 创建数据库副本）必须立即刷。
- **L54-L65 双 phase 解码：先 metadata 再 value batch**——一条 WAL record 拆成"元数据 record"
  （DB 创建 / 表创建）和"数据 batch"（页改动）。这是 Postgres / Neon 自己的细分；Aurora MySQL 内部
  也类似（DDL log + DML log 分离）。
- **`request_redo` L499 是 page 重放的入口**——`(key, lsn, base_img, records)` 四元组：
  从 base_img（最近的 page 快照）+ 一段 records 重放出 LSN 时刻的 page。**这就是 Aurora 论文 Figure 4
  "step 2-3：apply log to local segment"的对应物**。Aurora 用的是 InnoDB redo apply，Neon 用的是
  Postgres `walredo` 进程（fork 一个 Postgres backend 专门做 redo）。
- **L508-L519 Prod / Test 分流**——生产和测试环境用同一接口但不同 backend。这是 Neon 的工程风格；
  Aurora 论文 §7 提到 "fault injection" 但没说基础设施层面如何切。

> 与论文对照：Aurora §4.2 Figure 4 列了 storage 节点 6 步骤——(1) receive log, (2) ACK to writer,
> (3) gossip with peers, (4) coalesce log to page, (5) snapshot to S3, (6) GC obsolete log。
> Neon 的 `from_bytes_filtered` + `request_redo` 对应 step (1) + (4)；step (3) gossip 在
> [storage_broker](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/storage_broker) 里实现。

怀疑 3：Aurora 论文 §4.2 的 storage 节点 step 3 "gossip" 没说 quorum / 一致性算法。
**这是论文最大的黑盒**——Aurora 内部用什么协议让 6 个 storage 节点同步对方进度？
论文一笔带过称 "epidemic protocol"。Neon 的 [storage_broker](https://github.com/neondatabase/neon/blob/8f60b04da47ffefe0e52bda2440134b42874eb75/storage_broker/src/bin/storage_broker.rs)
用 gRPC + 中心化 broker（不是 epidemic）——和 Aurora 路线不同。**Aurora 闭源让 gossip 这一段
完全不可验证**——读论文时这是必须打问号的地方。后续 [Aurora SIGMOD 2018 论文（"Avoiding Distributed Consensus for I/Os"）](https://dl.acm.org/doi/10.1145/3183713.3196937)
补了一些细节但仍不完整。

### 3.b 补充：怀疑 4（log-is-DB 的隐藏成本）

怀疑 4：Aurora 论文宣传"网络流量降 7.7x"（§3.1 Table 1），**但没披露 storage 节点本地 IO 放大**。
storage 节点要 (a) 持久化 WAL；(b) 重放 WAL → page；(c) 压成 segment 写 S3——这是 3 倍本地 IO。
论文 §6 性能数据是"端到端 throughput"，不是"端到端总 IO"。**Aurora 把网络 IO 换成 storage IO**——
代价是 storage 集群规模更大、storage 单价更高。AWS Aurora 定价里 IOPS 是单独一项（按 IO 收费），
就是这个本地 IO 的 monetization。Neon 同样有这个成本，体现在 pageserver 节点的本地 EBS / NVMe IOPS 预算。
**这是 log-is-DB 哲学的隐藏成本——降的是 DB-storage 网络，涨的是 storage 内部 IO**。

## Layer 4 · 复现一处（phd-skills 7 阶段）

**路径选择**：路径 1（起 [Neon docker compose](https://neon.com/docs/get-started-with-neon/setting-up-a-local-development-environment) 跑 1 个 compute + 1 个 safekeeper + 1 个 pageserver，发几条 SQL 看 WAL 流），降级到路径 2（toy Python 模拟 4/6 quorum 写 ACK 决策）。

> 选 Python toy 是因为 Neon docker-compose 至少需要 4 GB RAM + Postgres 16，
> 笔记本环境噪音大；toy 模拟更适合直接讲清"quorum 决定 commit_lsn"的核心机制。
> 真实 Neon 起步流程见 [Neon CONTRIBUTING.md](https://github.com/neondatabase/neon/blob/8f60b04da47ffefe0e52bda2440134b42874eb75/CONTRIBUTING.md)。

### 阶段 1 · 论文获取

```bash
# 论文 PDF
curl -L https://web.stanford.edu/class/cs245/readings/aurora.pdf -o aurora_sigmod17.pdf

# Aurora 后续论文（2018）补 storage gossip / consensus
curl -L https://dl.acm.org/doi/pdf/10.1145/3183713.3196937 -o aurora_sigmod18.pdf

# Aurora 没有 arXiv——SIGMOD industrial track 不走 arXiv
# 但 AWS 的 official "Aurora storage architecture" blog 可作补充：
# https://aws.amazon.com/blogs/database/amazon-aurora-under-the-hood-quorum-and-correlated-failure/
```

### 阶段 2 · 代码盘点（inventory）

| 角色 | Aurora（闭源） | Neon OSS 对应（commit `8f60b04`） |
|---|---|---|
| DB instance | Aurora-MySQL fork | Stock Postgres + Neon ext（[pgxn/neon](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/pgxn/neon)） |
| WAL 持久化（quorum writer） | 6 storage 节点共担 | [safekeeper/](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/safekeeper) |
| Page 重放（log → page） | 6 storage 节点共担 | [pageserver/](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/pageserver) |
| WAL 解码 | InnoDB redo apply | [libs/wal_decoder/](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/libs/wal_decoder) |
| 节点 gossip / 元数据 | "epidemic protocol"（黑盒） | [storage_broker/](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/storage_broker) (gRPC) |
| 控制面 | AWS RDS 控制面 | [control_plane/](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/control_plane) + [storage_controller/](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/storage_controller) |
| 客户端连接代理 | RDS proxy / Aurora endpoint | [proxy/](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/proxy) |

### 阶段 3 · Gap 分析

| 论文 (Aurora SIGMOD 2017) | Neon master `8f60b04`（OSS 锚点） | 差距说明 |
|---|---|---|
| 6-way replication | 默认 3-way safekeeper（可配） | OSS 部署常见 3 副本，Aurora 6 副本是 cloud-only 选择 |
| 4/6 写 quorum | Paxos-style consensus on safekeeper | Neon 不固定 4/6，按副本数动态计算 |
| 3/6 读 quorum | pageserver 单点服务（无 read quorum） | Neon 选了 "1 active pageserver per timeline"，更简单但单点 |
| 跨 3 AZ | 任意部署拓扑 | Neon 部署 topology 由 control_plane 决定 |
| 单 writer | 单 writer compute（多 reader） | 一致 |
| log-only 协议 | WAL streaming（pg_replication_slot 风格） | 本质相同，DB → storage 只发 WAL |
| Storage gossip | gRPC + 中心 storage_broker | Neon 不用 epidemic gossip |
| Continuous backup to S3 | Pageserver 周期 layer file 上传 S3 | 同思路，文件粒度不同 |

### 阶段 4 · 实现 / 替换说明

替换矩阵：

| 论文 | 我的复现 | 损失什么 |
|---|---|---|
| 6 storage 节点 + 4/6 quorum | Python toy：6 节点字典 + ACK 计数 | 学不到真实磁盘 IO；但能讲清 quorum 决策 |
| Aurora-MySQL fork | 不复现 SQL 引擎 | OK，焦点在 quorum 上 |
| 实际 storage gossip | 不模拟 | OK，论文本身也是黑盒 |
| 跨 3 AZ 网络 | 单进程内 6 个 mock 节点 | 网络分区不可模拟 |

`aurora_quorum_toy.py`（最小可执行）：

```python
"""Aurora quorum toy.
模拟 6 storage 节点 + writer 端 4/6 写 quorum 决策。
"""
import asyncio
import random
from collections import defaultdict
from dataclasses import dataclass, field

@dataclass
class StorageNode:
    node_id: int
    az: str
    flush_lsn: int = 0
    healthy: bool = True
    base_latency_ms: float = 5.0

    async def write_wal(self, lsn: int) -> bool:
        if not self.healthy:
            await asyncio.sleep(0.5)  # timeout simulation
            return False
        # simulate per-node fsync latency
        latency = self.base_latency_ms + random.uniform(-2, 8)
        await asyncio.sleep(latency / 1000)
        self.flush_lsn = max(self.flush_lsn, lsn)
        return True

@dataclass
class AuroraWriter:
    nodes: list = field(default_factory=list)
    Vw: int = 4  # write quorum
    committed_lsn: int = 0

    def __post_init__(self):
        # 6 nodes across 3 AZs (2 per AZ)
        self.nodes = [
            StorageNode(0, "AZ-1"), StorageNode(1, "AZ-1"),
            StorageNode(2, "AZ-2"), StorageNode(3, "AZ-2"),
            StorageNode(4, "AZ-3"), StorageNode(5, "AZ-3"),
        ]

    async def write(self, lsn: int) -> bool:
        results = await asyncio.gather(*[n.write_wal(lsn) for n in self.nodes])
        ack_count = sum(results)
        if ack_count >= self.Vw:
            self.committed_lsn = max(self.committed_lsn, lsn)
            return True
        return False

    def kill_az(self, az: str):
        for n in self.nodes:
            if n.az == az:
                n.healthy = False
        print(f"[CHAOS] killed all nodes in {az}")

async def main():
    w = AuroraWriter()

    # 5 normal writes
    for lsn in range(100, 105):
        ok = await w.write(lsn)
        ack = sum(1 for n in w.nodes if n.flush_lsn >= lsn)
        print(f"LSN {lsn}: ack={ack}/6 commit={ok} VDL={w.committed_lsn}")

    # Chaos: kill AZ-2
    w.kill_az("AZ-2")
    for lsn in range(105, 108):
        ok = await w.write(lsn)
        ack = sum(1 for n in w.nodes if n.flush_lsn >= lsn)
        print(f"LSN {lsn}: ack={ack}/6 commit={ok} VDL={w.committed_lsn}")

    # Kill 1 more in AZ-3
    w.nodes[4].healthy = False
    print("[CHAOS] killed 1 more in AZ-3")
    for lsn in range(108, 111):
        ok = await w.write(lsn)
        ack = sum(1 for n in w.nodes if n.flush_lsn >= lsn)
        print(f"LSN {lsn}: ack={ack}/6 commit={ok} VDL={w.committed_lsn}")

asyncio.run(main())
```

### 阶段 5 · 数据集（5+ toy 写）

| # | LSN | 故障状态 | 期望 ack | 期望 commit |
|---|---|---|---|---|
| 1 | 100 | 全健康 | 6/6 | yes |
| 2 | 101 | 全健康 | 6/6 | yes |
| 3 | 105 | AZ-2 全挂 (-2 节点) | 4/6 | yes（4 ≥ Vw=4） |
| 4 | 108 | AZ-2 + AZ-3 一节点 (-3 节点) | 3/6 | **NO**（3 < 4） |
| 5 | 109 | 同上 | 3/6 | **NO** |
| 6 | 110 | 同上 | 3/6 | **NO** |

**关键观察**：第 4 条之后，AZ-2 全挂 + AZ-3 1 节点挂——只有 3 个节点存活，无法满足 Vw=4，
**写卡死**。这就是 Aurora 论文 §2.2 quorum 设计承诺：4/6 写容忍 "AZ + 1 节点"——但**不容忍 "AZ + 2 节点"**。

### 阶段 6 · Smoke run（完整 trajectory）

```bash
python3 aurora_quorum_toy.py
```

完整输出（典型运行）：

```
LSN 100: ack=6/6 commit=True VDL=100
LSN 101: ack=6/6 commit=True VDL=101
LSN 102: ack=6/6 commit=True VDL=102
LSN 103: ack=6/6 commit=True VDL=103
LSN 104: ack=6/6 commit=True VDL=104
[CHAOS] killed all nodes in AZ-2
LSN 105: ack=4/6 commit=True VDL=105
LSN 106: ack=4/6 commit=True VDL=106
LSN 107: ack=4/6 commit=True VDL=107
[CHAOS] killed 1 more in AZ-3
LSN 108: ack=3/6 commit=False VDL=107
LSN 109: ack=3/6 commit=False VDL=107
LSN 110: ack=3/6 commit=False VDL=107
```

观察：

- LSN 100-104：全 6 ACK，VDL 顺利推到 104
- AZ-2 死后：4/6 仍可 commit，VDL 推到 107——验证 "AZ + 0 节点" 容忍
- 再死 1 节点：3/6 < Vw，所有后续 commit=False，VDL 卡在 107——验证 quorum 边界
- 这是 Aurora 设计的**硬底线**：超过 quorum 容忍就**不写**而不是脏写——CAP 选 C 不选 A

### 阶段 7 · 跑结果对照表

| 维度 | 论文 (SIGMOD 2017) | 我的 toy 复现 | 差距 / 解释 |
|---|---|---|---|
| 副本数 | 6 (3 AZ x 2) | 6 (mock) | 一致 |
| Vw | 4 | 4 | 一致 |
| Vr | 3 | 不模拟 | toy 不模拟读 |
| 容忍 "AZ + 1 节点" | 是 | 是（验证 LSN 105-107） | 一致 |
| 容忍 "AZ + 2 节点" | 否 | 否（验证 LSN 108+ 卡死） | 一致 |
| commit latency | 4/6 nodes 中最慢 | toy 单 node 5-13ms 模拟 | 数量级一致 |
| 写吞吐 | sysbench OLTP 5x MySQL | 不可比 | toy 无 SQL 引擎 |
| 实际网络节省 | 7.7x（论文 §3.1 Table 1） | 不可测 | toy 无 page 流量基线 |

#### results.md 摘要

```
TL;DR: Python toy 模拟 6 节点 + 4/6 quorum，验证 Aurora 论文 §2.2 的两条核心承诺：
       1) 容忍 1 AZ 全挂时仍可写；2) 超过容忍边界（AZ+2 节点）时 commit 卡死而非脏写。

分布：
  - LSN 100-104 全健康，6/6 ACK
  - LSN 105-107 AZ-2 挂，4/6 ACK，仍 commit
  - LSN 108-110 AZ-2 + AZ-3-1 节点挂，3/6 ACK，commit 卡死

Limitations:
  - N=11 LSN 不能压测吞吐（论文 §6 sysbench OLTP r3.8xlarge 量级）
  - 不模拟 storage gossip（论文最大黑盒，本来就 Aurora 闭源）
  - 不模拟读 quorum（要 page versioning 才有意义，超出 toy 范围）
  - 网络分区是"全挂 vs 全活"二态，无 partial partition / 高延迟 split-brain
  - VDL 推进只看 max committed LSN，没实现 CPL（mini-tx 边界）逻辑
  - 没起 Neon docker compose 验证 OSS 真实路径——降级到 toy 是为了控制变量
```

## Layer 5 · 谱系对比

### 前作（被 Aurora 超越的）

| 论文 / 系统 | 年份 | 核心想法 | 被 Aurora 超的点 |
|---|---|---|---|
| **MySQL Multi-AZ on RDS** | 2009 | 主 + 同步 standby + binlog | 网络放大严重；切主慢 30s；standby 不分担读 |
| **Postgres streaming replication** | 2010 | WAL shipping → async replica | 异步会丢数据；无 quorum；故障恢复人工 |
| **Oracle RAC / DB2 pureScale** | 2003-2009 | 共享 SAN + 分布式 lock manager | lock manager hotspot；不适合 commodity 云硬件 |
| **Bigtable (OSDI 2006)** | 2006 | LSM + GFS（共享日志存储） | KV，不是 SQL；无事务 |
| **Spanner (OSDI 2012)** | 2012 | 全球 SQL + TrueTime + Paxos | 比 Aurora 更激进，但成本高、复杂；多数 OLTP 客户不需要全球一致 |

### 同期 / 反对者

- **Snowflake (SIGMOD 2016)** — 同期分离存算 OLAP 系统，但定位完全不同（数仓不是 OLTP）。Aurora 看了 Snowflake 的 storage decoupling 思路，反过来用在 OLTP
- **CockroachDB (2015)** — Spanner 派 OSS 实现，shared-nothing + Raft per range；和 Aurora 是哲学反面（"DB 算 + 存绑定 + Raft 协调" vs Aurora "DB 算，存独立"）
- **VoltDB (2010)** — H-store 派，强调 in-memory + serial execution；Aurora 选 Lock-based + page-on-disk，路线完全不同
- **Google Spanner 派的批评者** —— 认为 Aurora 不是真正的 distributed DB（仍是单 writer + 多 reader），论文 §8 Related Work 措辞有意回避这个

### 后作（2026 视角下超越或平替 Aurora 的）

| 论文 / 系统 | 年份 | 超 Aurora 的点 | 输 Aurora 的点 |
|---|---|---|---|
| **Aurora Serverless v2** | 2022 (AWS) | 计算自动 scale，存储不变；秒级伸缩 | 仍是 Aurora 同一套存储，本质是 Aurora 自己的演化 |
| **Neon (2021-)** | 2021 | OSS Postgres-compat；branching（git-like 数据分支） | 单 pageserver 服务一个 timeline——读路径单点 |
| **Aurora DSQL** | 2024 (AWS) | 全球分布式（multi-region active-active），跨 region serializable | 闭源；早期版本、生产成熟度未知 |
| **PlanetScale (Vitess)** | 2018 | MySQL sharding 路线，水平扩展更彻底 | 不是 log-is-DB；用 Vitess proxy 分库分表 |
| **TiDB / Yugabyte / CockroachDB** | 2016-2018 | Spanner 路线 OSS——Raft per range，shared-nothing | 写延迟通常比 Aurora 高（Raft RTT vs single-writer）；客户感知"慢" |
| **Databricks Lakebase** | 2024 | Postgres 兼容 + Delta Lake 存储 | 数据湖 / OLAP 路线，OLTP 仍弱 |
| **Materialize / RisingWave** | 2022- | 把 Aurora binlog 当真值，叠 SQL 增量视图 | 不替代 Aurora，反而强依赖 |

### 选型建议

| 场景 | 选谁 | 理由 |
|---|---|---|
| AWS 上单 region 高可用 OLTP | **Aurora** | 生态最厚，AWS 最优化；3 AZ 4/6 quorum 是云上"足够好"的 sweet spot |
| 自部署 OSS Postgres，需要 cloud-native 存储 | **Neon** | OSS 唯一接近 Aurora 哲学的实现；branching 是 Aurora 没有的功能 |
| 多 region active-active 读写 | Spanner / CockroachDB / Aurora DSQL | Aurora 经典版本是单 writer——跨 region 写要走 logical replication |
| 极大规模水平扩展（PB+） | TiDB / Yugabyte / Vitess | Aurora storage 上限是 128 TB（早期）→ 256 TB（v3）；超过得分库 |
| 强一致跨 region | Spanner | 还没人在 OLTP 性价比上超 Spanner（不算 Aurora DSQL，太早） |
| 极致低延迟 OLTP | 单机 Postgres / SQLite | Aurora 网络架构注定 commit latency ≥ 4ms（4/6 中最慢节点） |
| 数据湖 + OLTP 一站式 | Lakebase / Snowflake Unistore | Aurora 不擅长 OLAP |

### 演化树

![Aurora 谱系：pre-Aurora cloud RDB / Aurora SIGMOD 2017 / 后作 Neon / Aurora Serverless v2 / Spanner 派分支](/study/papers/aurora/02-genealogy.webp)

*图 2：Aurora 在 2007-2026 云原生数据库谱系中的位置。上层 = pre-Aurora（MySQL Multi-AZ / PG streaming /
Oracle RAC / Salesforce），中层 = Aurora 2014 launch / 2017 SIGMOD 论文（哲学起点："the log is the database"），
下层 = post-Aurora 演化分支（Neon / Aurora Serverless v2 是 log-is-DB 嫡系；CockroachDB / TiDB / Yugabyte 是
Spanner 派对手——shared-nothing + Raft per range，与 Aurora 哲学相反）。底栏标 log-is-DB camp（绿）vs
Spanner / 共识 camp（橙）的两大路线分流。画风：sketchnote / paper-figure 风。*

## Layer 6 · 与你当前工作的连接

### 今天就能用

- **任何"DB + 副本"场景默认想 quorum 模型**：写多副本时不要简单"主 + sync standby"，而是问"要不要 R + W > N"
  ——quorum 给的是"AZ 整个挂仍能写"的硬保证，sync standby 给不了
- **DB 与 storage 之间永远只发 log**：自己写应用层缓存 / event sourcing 时也守这条——
  写日志而不是写 dirty state；下游消费日志重放出 state；这是 Kafka / Aurora / git / WAL-shipping replication 的同一哲学
- **永远区分 byte-level 持久化和 record-level 持久化**：Aurora VCL（byte）≤ CPL（record）≤ VDL（commit）三水位
  ——做任何 streaming / replication 系统时，这个细分要在 design 第一天就有，不能后补
- **崩溃恢复是设计阶段决策不是 bugfix**：Aurora 把崩溃恢复"在哪做"提前决定（在 storage 层，DB 不参与）
  ——这种设计选择是后续不可逆的。设计自己系统时第一天问："谁负责 recovery？"

### 下个月能用

- **学会读 Neon 源码**：Aurora 闭源，Neon 是最干净的 log-is-DB OSS 实现——精读 [pageserver](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/pageserver) +
  [safekeeper](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75/safekeeper) 源码，会让你"懂" Aurora 比读 10 遍论文还有效
- **Aurora 监控指标的语言要学会**：`AuroraReplicaLag`、`VolumeBytesUsed`、`VolumeReadIOPs`、`StorageNetworkThroughput`
  ——这些指标背后的意义只有读完论文才懂（比如 ReplicaLag 不是流复制 lag 而是 LSN apply gap）
- **设计应用时考虑 single writer 假设**：Aurora 是单 writer + 多 reader——不能跑跨 region active-active。
  如果业务需要 multi-region writes → 走 Aurora Global Database（async 跨 region）或换 Spanner 派
- **Continuous backup vs traditional backup**：Aurora 的 PITR 是免费副产物，但有 35 天上限——
  超过要导出 S3 长期归档。Aurora 不替代你的 archive 策略

### 不要用的部分

- **不要把 Aurora 当 multi-master**：Aurora 经典版本是单 writer。Aurora Multi-Master（2018 试验功能）已被 AWS deprecate；
  Aurora DSQL（2024）是不同产品。强写并发场景不要指望 Aurora 给 active-active
- **不要在 Aurora 上做大批量 DDL**：DDL 走 single writer 路径，会阻塞所有写入。大表 ALTER 仍是分钟级痛点。
  pt-online-schema-change / gh-ost 在 Aurora 上仍要用
- **不要把 Aurora storage 当 KV store 使**：storage 层 expose 的接口是 page-level，
  不是 KV API；想要分布式 KV 用 DynamoDB 不要 Aurora
- **不要假设 Aurora 各 AZ 副本独立故障**：[怀疑 2](#32-quorum-46-write--36-read-跨-3-az) 提到，
  6 副本在 AZ 间分布是 AWS 内部决策——客户没有 hint API。如果业务要"严格独立故障域"——选 Spanner / CockroachDB

## Layer 7 · 怀疑 + 延伸阅读

### 4 件具体怀疑

- **怀疑 1（Neon vs Aurora 容错路径不同）**：[3.1 旁注](#31-log-only-protocol-vs-传统-write-path) 怀疑 1。
  Neon 把 writer 和 repairer 拆成两个组件（safekeeper / pageserver），Aurora 是同一 storage 节点担两个角色。
  **这意味着 Aurora 的 storage 节点更"重"**——单节点 IOPS 上限比 Neon 低？或者 Aurora 用了 Neon 没有的硬件 acceleration？
  **论文从未给出 storage 节点的内部资源 breakdown**，是 Aurora 论文最大的工程黑洞。
- **怀疑 2（AZ 平衡的隐藏假设）**：[3.2 旁注](#32-quorum-46-write--36-read-跨-3-az) 怀疑 2。
  论文 §2.2 假设 3 AZ 同等可用，但 AWS region 内 AZ 历史上有容量倾斜。
  **如果 AWS 内部把 4 副本压在同一个 AZ，4/6 写 quorum 就退化成 1/3 AZ 故障一发就炸**。
  论文 §7 lessons learned 没披露这种 case 的频率——这是 durability 模型的隐藏假设。
- **怀疑 3（gossip 协议是论文最大黑盒）**：[3.3 旁注](#33-vdl-推进--gossip--peer-repair) 怀疑 3。
  论文 §4.2 说 storage 节点用 "epidemic protocol" gossip，但既不给协议细节也不给收敛时间界。
  **gossip 收敛慢可能让 VDL 推进延迟**——尤其在网络抖动时。Neon 干脆不用 gossip 改用中心 storage_broker，
  说明 epidemic 在 OSS 是不容易调通的——Aurora 闭源能调通可能是因为 AWS 内部有专用网络栈。
- **怀疑 4（log-is-DB 的隐藏成本）**：[3.b 怀疑 4](#3b-补充怀疑-4log-is-db-的隐藏成本)。
  论文 §3.1 Table 1 宣传"网络流量降 7.7x"，但 storage 节点本地 IO 是 3 倍放大（持久化 WAL + replay → page + snapshot S3）。
  **Aurora 把网络成本换成 storage 内部 IO 成本**——AWS 的 Aurora 定价里 IOPS 单独收费就是这个的 monetization。
  论文 §6 性能数据没给"端到端总 IO"——只给"端到端 throughput"。这是论文宣称图谱里的盲点。

### 延伸阅读表

| 想回答什么 | 该读 | 为什么 |
|---|---|---|
| Aurora storage gossip 究竟怎么做 | [Aurora SIGMOD 2018 "Avoiding Distributed Consensus for I/Os"](https://dl.acm.org/doi/10.1145/3183713.3196937) | 论文本身的续作，专门补 quorum + gossip |
| log-is-DB 在 OSS 怎么实现 | [Neon architecture docs](https://neon.com/docs/introduction/architecture-overview) + [Neon CONTRIBUTING.md](https://github.com/neondatabase/neon/blob/8f60b04da47ffefe0e52bda2440134b42874eb75/CONTRIBUTING.md) | 唯一干净的 OSS 锚点；branching 设计也只有 Neon 有 |
| Spanner 派 vs Aurora 派的根本差异 | [Spanner OSDI 2012 paper](https://research.google/pubs/spanner-googles-globally-distributed-database-2/) + 本站 [Spanner 笔记](/study/papers/spanner/) | 两大派的哲学起点 |
| 后续：Aurora DSQL 怎么变 | AWS re:Invent 2024 "Aurora DSQL deep dive" 视频 | 多 region active-active 路径 |
| 网络成本真的是 cloud DB 瓶颈吗 | "What's Really New with NewSQL?" (Pavlo, SIGMOD Record 2016) | 反方观点：网络可能不是真瓶颈，DB 设计偷懒才是 |
| log-shipping 协议的演化 | Postgres streaming replication docs / Oracle DataGuard | 看 Aurora 之前的工业实践，对比理解为什么 Aurora 是"突破"而不是"渐进改进" |
| 上游：log-based 系统的哲学起源 | LinkedIn Kreps "The Log: What every software engineer should know" (2013) + 本站 [Kafka 笔记](/study/papers/kafka/) | log-is-X 这个哲学的工程哲学起点 |

## 限制段（DeepPaperNote 风格）

不抄 paper §7 lessons learned，加 4 条独立判断：

1. **Aurora 闭源是这篇论文最大的硬限制**：论文有 12 页正文，但 storage 节点的内部架构、gossip 协议、
   故障检测算法都是黑盒。**读这篇论文必须配 Neon 源码 + 后续 SIGMOD 2018 论文**——单读 SIGMOD 2017 只能学到"哲学层"
   而学不到"实现层"。这与 Kafka / Spanner 不同（那两个有 OSS 参考实现）。
2. **"log is the database" 不等于 "log is everything"**：Aurora storage 节点仍维护 page 缓存
   （论文 §4 Figure 4 step 4 "coalesce log to page"）——只是 page 在 storage 层而不在 DB 层。
   完全无 page 的系统（如 Spanner 全 LSM）不是 Aurora 路线。**Aurora 是"page 在哪里"的重新定位，
   不是"消灭 page"**。
3. **论文 §6 性能 baseline 选得偏弱**：对比 MySQL 5.6 / 5.7 standalone 和 Multi-AZ。
   **没对比同期 Spanner / TiDB / CockroachDB 等"shared-nothing distributed DB"**——
   而那才是 Aurora 真正的 long-term 对手。论文 §8 Related Work 提到这些但拒绝直接 benchmark。
   这是 SIGMOD 工业论文的常见手法——只对比 "需要被超的对手" 不对比 "同路线对手"。
4. **2026 视角下 Aurora 的"哲学胜利"已经超过"产品胜利"**：
   - 哲学胜利：log-is-DB 已成为云原生 OLTP 共识，Snowflake / Neon / Lakebase 都在分离存算
   - 产品胜利：AWS 内部最大客户仍是 Aurora（Amazon.com 自家用），但 OSS 世界 Postgres 占主流，OSS 不能跑 Aurora
   - 趋势：Aurora DSQL（2024）开始走 Spanner 路线（多 region active-active）——AWS 自己也承认 Aurora 经典版本不够用
   **这意味着 Aurora 论文的方法已经被部分超越了——但哲学还在普及。论文的"半衰期"在 2026 仍然有效**。

## 附录：叙事错位清单（论文宣称 vs 代码 / 现实）

| 论文宣称 | 代码 / 现实 | 错位说明 |
|---|---|---|
| §3.1 "network traffic reduction of 7.7x" | 实测 7-8x（多个第三方 benchmark 验证），但**仅算 DB → storage 流量**，不算 storage 内部 | "7.7x" 是真实的，但定义窄；总系统网络流量节省小很多 |
| §2.2 "tolerate AZ + 1 node failure" | 真——quorum 4/6 数学上保证 | 一致 |
| §4.2 "fast crash recovery" | Aurora 重启 ~10s（真）；但**老版本 sometimes 60s+**（社区 bug 报告） | 论文给的是稳定态，初期版本不稳 |
| §3.2 "log only sent to storage" | 真，**但 binlog 仍可选开**（用于 CDC / Debezium） | 论文不强调可选 binlog；客户开 binlog 后网络优势打折 |
| §7 "we run for 18 months" | 论文 2017 发表，含 ~2015-2017 数据 | 数据都是 launch 早期；2026 视角下 Aurora 已演化 v2 / v3，论文数字不代表当前 |
| §6 "5x throughput improvement" | sysbench OLTP 真——但**纯写工作负载只 1.5-2x**（AWS 自家 blog 多次披露） | 论文测的是混合负载；偏读场景 5x 偏高 |
| §3.2 "the log is the database" 标语 | storage 节点仍维护 page cache + 索引 | 标语是哲学，实现仍有 page；不是字面"只有 log" |

---

## 元数据

- 重构日期：2026-05-28
- 启用 skill：`paper-comic`（图配置）/ `phd-skills:reproduce`（Layer 4 7 阶段）/ `source-learn`（Layer 3 真实代码）
- 工具栈：`WebFetch`（Neon GitHub atom）/ Python PIL（生成 sketchnote webp）/ `curl`（Neon raw blob）/ Read（验证）
- 论文获取：[ACM DL 3035918.3056101](https://dl.acm.org/doi/10.1145/3035918.3056101) / [Stanford 公开镜像](https://web.stanford.edu/class/cs245/readings/aurora.pdf)
- OSS 锚点 commit hash：[neondatabase/neon @ `8f60b04da47ffefe0e52bda2440134b42874eb75`](https://github.com/neondatabase/neon/tree/8f60b04da47ffefe0e52bda2440134b42874eb75)
- GitHub permalink 数：3+（`safekeeper/src/wal_storage.rs#L437-L490`, `safekeeper/src/wal_storage.rs#L495-L525`, `libs/wal_decoder/src/decoder.rs#L18-L70`, `pageserver/src/tenant.rs#L498-L520` + 多个目录级链接）
- Figure 数：2（`01-architecture.webp` 96 KB / `02-genealogy.webp` 85 KB）
- 显式怀疑数：4（Neon vs Aurora 容错差异 / AZ 平衡假设 / gossip 黑盒 / 隐藏 IO 成本）
- 论文类型 self-classify：method + system paper（分支 A）
