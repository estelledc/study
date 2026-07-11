---
title: NVMe — 为 SSD 重写的存储协议
来源: 'NVM Express, Inc. "NVM Express Base Specification" (1.0 2011; 2.0 2021); 工程背景见 Xu et al., SYSTOR 2015'
日期: 2026-05-31
分类: 系统
难度: 中级
---

## 是什么

NVMe（Non-Volatile Memory Express）是**专门为闪存盘从零设计的存储协议**。日常类比：以前的 SATA/SAS 协议像"邮局窗口"——只有一个柜台、一次只能办一单业务，因为机械硬盘磁头本来就只能一次走一条路；NVMe 像"机场自助值机"——开 6 万多个柜台同时受理，每个柜台还能堆 6 万多人排队。

操作系统让设备做一次 I/O，要走一段叫做"块层 + 设备驱动 + 控制器队列"的流水线。SATA/AHCI 时代这条流水线**只有一条道、一个深度 32 的队列、一个共享中断**，CPU 每发一次 I/O 还要花 6 µs 自己开销。NVMe 把它改成 **64K 条队列 × 每条 64K 深度 + 每队列独立中断**，CPU 每 I/O 开销压到 1 µs 以下。

## 为什么重要

不理解 NVMe，下面这些事都没法解释：

- 为什么云盘从 SATA SSD 时代的 100K IOPS 跳到 NVMe 时代的 1M+ IOPS——不是闪存变了 10 倍，是协议不再是瓶颈
- 为什么 Linux 5.1 引入的 io_uring 强调"多核无共享锁"——它就是顺着 NVMe 的多队列设计往上接的应用层接口
- 为什么 SPDK 这样的用户态存储框架要"绕过内核轮询设备"——把 NVMe 的低延迟优势在软件栈里也保住
- 为什么现代数据库（RocksDB / MySQL 8 / PostgreSQL 16）默认参数假设 IOPS 充足而 SATA 时代假设 IOPS 稀缺

## 核心要点

NVMe 相对 AHCI/SATA 的设计差异可以拆成 **三个维度**：

1. **队列深度**：AHCI 一条队列深度 32；SAS 一条深度 254；NVMe **6 万多条队列、每条 6 万多深度**。SSD 内部有 16~32 个 NAND 通道天然并行，老协议根本喂不饱。

2. **命令集**：AHCI/SCSI 背着磁带、光盘的历史命令几百条；早期 NVMe 1.x **必需 I/O/Admin 命令大约十来条量级**——读、写、flush、admin 几条。少即是快。

3. **中断与门铃**：发命令只写一个 32-bit 寄存器（**doorbell**），告诉设备"我刚把命令塞进队列尾，自己取吧"；中断走 MSI-X，**每队列一个独立向量**，多核之间不共享一把中断锁。

## 实践案例

### 案例 1：CPU 一次 I/O 到底花多少时间

```
                AHCI/SATA           NVMe
单 IO CPU 开销   ~6 µs              < 1 µs
最大 IOPS        ~100K              1M+
最大队列深度     32                 64K × 64K
中断模型         单 MSI 共享        每队列独立 MSI-X
```

这张表是协议层面的对比，不是闪存芯片本身的差距。换句话说：**就算把同一颗 SSD 接在 SATA 上和 PCIe 上，软件栈开销差了一个数量级**。

### 案例 2：为什么单线程 fio 测不出 NVMe 全速

新人常犯的错：

```bash
fio --rw=randread --bs=4k --numjobs=1 --iodepth=32 --filename=/dev/nvme0n1
```

跑出来 200K IOPS，以为 NVMe 也就这样。换成：

```bash
fio --rw=randread --bs=4k --numjobs=16 --iodepth=64 --filename=/dev/nvme0n1
```

跑到 1M+。**原因**：NVMe 的并行度是设计给多核多队列的，单线程 CPU 自己就先到瓶颈了——队列再深也没用。

### 案例 3：io_uring 与 NVMe 是同一种思路

Linux 老接口 `read()`/`pread()` 是同步的，每次 I/O 都进内核、回中断、唤醒线程。`io_uring` 改成两个**无锁环形队列**（提交环 SQ + 完成环 CQ），用户态写入、内核态消费，**跟 NVMe 的硬件队列模型一一对应**。这不是巧合——io_uring 就是为了不让软件栈成为 NVMe 的新瓶颈。

### 案例 4：门铃机制到底省了什么

老协议下发命令的过程：用户态 → 系统调用进内核 → 加锁更新共享队列 → 触发设备 MMIO → 等中断 → 解锁回收。

NVMe 的门铃版本：把命令直接写进 SQ 的内存区域，**写一个 32-bit 寄存器（doorbell）**告诉控制器"队列尾巴动了"，结束。控制器自己 DMA 拉命令、做完之后写 CQ、按 MSI-X 向量打中断到对应 CPU 核。

差别不在某一步省了多少 ns，而在**整个链路上的串行点变少了**——多核之间不抢同一把锁、中断不广播到所有核。

### 案例 5：云盘后端为什么全换 NVMe

2015 年以前，公有云的"高性能云盘"后端常见架构是 **SATA SSD + 软件 RAID + iSCSI 网络协议**。三个瓶颈叠加：

- SATA 协议每盘最多 ~100K IOPS
- iSCSI 走 TCP，每 IO 多一次内核态拷贝
- 软件 RAID 把请求拆成多份同步写

换成 **NVMe + NVMe-oF over RDMA** 之后：单盘 1M+ IOPS、网络协议绕过 TCP 软件栈、RDMA 让远端读写延迟接近本地。这就是 AWS io2 Block Express、GCP PD-Extreme、Azure Premium SSD v2 那一代云盘把 IOPS 直接做到百万级的底层原因。

## 踩过的坑

1. **队列数 ≠ 性能**：单线程 benchmark 跑出来的数字会让你以为 NVMe 没那么快。必须靠多线程、足够大的 iodepth 才能把硬件压满。

2. **顺序大块读写时优势变小**：NVMe 的协议优势主要体现在"高 IOPS、小 IO"场景。顺序大块读写主要看 PCIe 带宽——SATA 6 Gbps 也能撑 ~500 MB/s 顺序，差距没有 IOPS 那么离谱。

3. **APST 电源管理曾经坑过 Linux 早期版本**：自动进低功耗状态后某些固件唤不回来，盘"消失"。Linux 4.10 之后默认禁掉问题型号，但老内核 + 老固件组合仍然踩。

4. **Consumer NVMe 的 SLC cache 假象**：消费级盘前 10~50 GB 写入很快（SLC 缓冲），写满之后掉到 100~200 MB/s，和 SATA SSD 持平。企业级 / 数据中心盘没这个问题。

5. **队列数多 ≠ 中断数无限**：一颗 CPU 的 MSI-X 向量数有限（一般 ~2K），机器上插 8 块 NVMe，每块开 32 条队列，向量很快用完——驱动会自动降级到共享中断模式，性能下来。

6. **混合读写 P99 比纯读差很多**：闪存内部"垃圾回收"、"擦除"是后台批量动作，写入触发 GC 时读延迟会翻几倍。监控只看平均 IOPS 看不出来，必须看 P99/P999。

## 适用 vs 不适用场景

**适用**：

- 高 IOPS / 小 IO 工作负载（OLTP 数据库、KV 存储、metadata 服务）
- 多核高并发场景（Web server 持久化日志、缓存层）
- 用户态存储栈（SPDK / DPDK）追求 P99 < 10 µs 的延迟敏感场景
- 网络存储后端（NVMe-oF over RDMA/TCP，让远端云盘体感接近本地盘）

**不适用**：

- 纯顺序大文件流式 I/O（HPC checkpoint / 视频归档）——SATA 也够，NVMe 优势不明显
- 极低成本归档存储——成本仍是 HDD 的 10 倍以上
- 老系统升级——很多 RAID 卡、硬件加密卡只支持 SATA/SAS 协议

## 历史小故事（可跳过）

- **2007 年**：Intel 主导成立 NVMHCI 工作组，目标是给 PCIe 闪存做一个**不像 SCSI 那样背包袱**的协议。当时业界还在争"PCIe SSD 是不是只是过渡产品"，Intel 押的是"协议层重做才能释放介质能力"。
- **2011 年**：NVMe 1.0 规范发布，13 家公司联合推动，第一批支持产品上市。规范第一版只有不到 100 页（对比 SCSI 上千页）。
- **2014 年**：NVMe 1.2 加入命名空间管理、SMART 扩展，成为企业盘标配；同年 Linux 主线内核完成 blk-mq 多队列块层重构，专门为对接 NVMe。
- **2016 年**：NVMe over Fabrics 1.0 把协议推到网络（RDMA / FC），云厂商开始大量用作云盘后端。AWS、Azure、GCP 几乎同时上线 NVMe 后端云盘。
- **2021 年**：NVMe 2.0 把 NVMe-oF 合并进主规范，并加入 ZNS（Zoned Namespace）与 KV 命令集——前者把闪存的"块"暴露给文件系统精细控制，后者把简单 KV 操作下放到设备。

之后这十几年所有"快盘"——本地 SSD、云盘、分布式存储后端、AI 训练 checkpoint 盘——基本都跑在 NVMe 上。一个有趣的副作用：**机械硬盘没有消失，反而专心做"冷数据归档"**，市场上一度出现 20TB+ 的氦气 HDD，每 GB 成本继续下探。

## 学到什么

1. **协议跟着介质换**——磁带/磁盘时代的 SCSI 假设单磁头串行，闪存时代必须重写，**软件栈不能假装介质没变**
2. **门铃 + 多队列 + 简化命令集** 是把延迟从 6 µs 压到 1 µs 的关键三招，背后核心是"少经手 = 少开销"
3. **协议改完只是开始**：io_uring / SPDK 是为了把 NVMe 的低延迟在应用层也保住，否则瓶颈从硬件移到了内核
4. **基准测试要配得上协议**：单线程跑 NVMe 等于在跑 SATA，多核场景下设计差异才看得出来
5. **横向看，"接近介质重新做协议"是反复出现的模式**——RDMA 之于 TCP、Optane 之于 NVMe、CXL 之于 PCIe，都是同一个剧本

## 延伸阅读

- 规范原文：[NVM Express Specifications](https://nvmexpress.org/specifications/)（1.0→2.0，含 NVMe-oF / ZNS）
- 数据库侧实测：[Xu et al., Performance Analysis of NVMe SSDs, SYSTOR 2015](https://dl.acm.org/doi/10.1145/2757667.2757684)
- 工程综述：[SPDK 文档 — Why Userspace?](https://spdk.io/doc/)
- [[io-uring]] —— Linux 5.1 异步 I/O 接口，与 NVMe 多队列同源思想
- [[rocksdb]] —— LSM-Tree 实现，现代版本调参假设 NVMe 级别 IOPS

## 关联

- [[azure-storage-2011]] —— 云存储系统设计，后端从 HDD 演化到 NVMe
- [[io-uring]] —— 内核异步 I/O 接口，匹配 NVMe 多队列硬件模型
- [[rocksdb]] —— 嵌入式 KV，现代部署假设 NVMe IOPS 充足
- [[ssa]] —— 编译优化中"协议跟介质换"的语言版本——程序表示形式跟着分析需求换

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[persistent-memory-2014]] —— PMFS — 第一个为字节寻址持久内存设计的文件系统
