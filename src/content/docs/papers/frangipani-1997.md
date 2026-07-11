---
title: Frangipani — 把分布式文件系统盖在共享虚拟磁盘上
来源: 'Thekkath, Mann, Lee, "Frangipani: A Scalable Distributed File System", SOSP 1997'
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

Frangipani 是一个**让多台机器同时挂载、像挂本地磁盘一样用的分布式文件系统**。日常类比：办公室的『共享白板』——每个人都能写、都能读，但需要一个『举手机制』保证两个人不同时擦同一行。

它的特别之处不在 FS 本身，而在**底座选了一个奇怪的抽象**：

- 下面有一层叫 **Petal**（同组人 1996 年做的）——把一堆机器的本地磁盘聚成『一块超大的虚拟硬盘』，地址 64 位，自带条带、镜像、快照
- Frangipani 假设这块虚拟硬盘**每台机器都能看到**，于是把 inode、目录、空闲块位图直接『写』到虚拟硬盘上
- 多机改同一处怎么办？加一个**分布式锁服务**：改之前先抢锁、改完释放

这个组合（**共享虚拟磁盘 + 分布式锁 + 各机本地日志**）就是 Frangipani 的全部架构。

## 为什么重要

不理解它，下面这些事都很难看清：

- 为什么 2003 年 GFS 论文要专门强调『我们没用共享磁盘抽象』——因为 Frangipani 这条路当时是默认假设
- 为什么 IBM GPFS、Oracle OCFS、VMware VMFS 这些**企业级共享磁盘 FS** 长得这么像——它们都是 Frangipani 范式的工业版
- 为什么『分布式锁服务』后来变成基础设施（Chubby、ZooKeeper、etcd）——SOSP 1997 这篇是早期把锁服务拆成独立组件的样板
- 为什么互联网公司最后没走这条路——共享磁盘抽象（Petal）在商业 SAN 之外没普及，单 master 的 GFS 路线赢了 Web 规模

## 核心要点

Frangipani 的设计可以拆成 **三层叠加**：

1. **底层：Petal 提供『共享虚拟磁盘』**。多台机器的本地盘对外伪装成一块 64-bit 寻址的硬盘，自己做条带和镜像。Frangipani 不关心数据存在哪台物理机上。

2. **中层：分布式锁服务**。每段磁盘区间（一组 inode、一段 bitmap）有一把锁。机器要改之前先去锁服务申请，改完释放。锁服务集群用 **Paxos**（多台机器先投票达成一致再改共享名单）只复制少量全局状态——谁负责哪批锁、哪些客户端还活着——不是每次抢锁都跑一轮投票。

3. **上层：每台 Frangipani 服务器**。各自有内存 cache、各自有一份 redo log（log 也写在共享磁盘里）。崩溃时**别的机器可以读它的 log 帮它恢复**——这是关键技巧。

加起来的效果：**机器是无状态的**，加一台只要挂磁盘 + 注册到锁服务，不需要 reshard 数据。

## 实践案例

### 案例 1：两台机器同时改一个目录

机器 A 想在 `/home` 下建文件 `a.txt`，机器 B 想建 `b.txt`：

1. A 向锁服务申请 `/home` 目录块的写锁 → 拿到
2. B 申请同一把锁 → 排队等
3. A 改 inode、写自己的 redo log、释放锁
4. 锁服务回收锁前，**强制 A 把 dirty cache 写回共享磁盘**
5. B 拿到锁，从共享磁盘读到 A 的最新结果，再改

整个过程**没有中央 metadata server**——元数据就在共享磁盘上，谁拿锁谁改。

### 案例 2：机器崩溃后怎么不丢数据

机器 A 写到一半挂了：

1. A 之前每次改元数据都先写 redo log 到共享磁盘
2. 锁服务发现 A 心跳断了，把 A 持有的锁标记为『需要恢复』
3. 任意其他机器（比如 C）拿到这把锁前，先**读 A 的 redo log**，把未完成的修改重做一遍
4. 重做完，C 才真正拿到锁继续工作

这个『**别人帮你恢复 log**』的设计就是因为 log 也在共享磁盘——所有机器都能读到。本地 FS 的 redo log 没这个 buff。

### 案例 3：和 GFS 比一比

| 维度 | Frangipani 1997 | GFS 2003 |
|---|---|---|
| 底座 | Petal 共享虚拟磁盘 | 一堆 Linux 机器各自的本地盘 |
| 元数据 | 写在共享磁盘里，多机抢锁 | 单 master 内存里 |
| 数据块大小 | FS block（KB 级） | 64 MB |
| 一致性 | 锁保证强一致 | 弱一致 + 应用层兜底 |
| 目标负载 | 类 NFS 通用 FS | 大文件顺序读写 |
| 失败处理 | 邻居读 log 帮你 redo | master 维护 chunk 副本 |
| 部署假设 | 内网 SAN、网络可靠 | 廉价 PC、机器随时挂 |

GFS 看了 Frangipani 之后**主动放弃**了对称设计，因为 Web 规模下『单 master 简单』比『对称优雅』重要。

### 案例 4：锁服务长什么样

锁服务本身是个独立小集群（论文实验里 3 台），跑 Paxos 风格的复制协议保证不丢锁记录：

- 客户端（Frangipani 服务器）和锁服务用心跳保活
- 锁有租约（lease），租约到期前必须续；超时就被收回
- 锁服务记录『谁持有什么锁』+『被收回的锁需要 redo log 恢复』

这套『独立锁服务 + 租约』接口，和 6 年后 Google Chubby（2006）同属一脉。Chubby 论文主要对照的是 Boxwood 等系统，但公开讨论里常把 Frangipani 的锁层当作『把锁服务拆出来』的早期样板——下面是教学示意，不是可粘贴运行的客户端代码。

## 踩过的坑

1. **共享虚拟磁盘是甜蜜陷阱**：Petal 假设网络 + 底层存储非常可靠。一旦底下的虚拟磁盘自己出 bug，整个 Frangipani 集群一起翻车。GFS 用 chunkserver + 副本明确管理失败，反而更稳。

2. **锁服务是扩展瓶颈**：所有元数据修改都要走锁。机器从 4 台加到 100 台，锁服务的 RPC 量线性涨，最终撑不住。Frangipani 论文实测做到几十台，没人在生产里跑过几千台。

3. **写日志在共享磁盘很贵**：每次改元数据都要写共享磁盘上的 log，跨网络。GFS 用本地 log + 单 master 路线规避了这个 RTT。

4. **锁粒度难调**：粒度细则锁服务压力大，粒度粗则两个不相关请求互相等。Frangipani 选的是『一段 inode 区间』这个中间值，对一般负载够用，但热点目录会撞锁。

5. **cache 一致性靠锁回收**：客户端 cache 是 invalidate-on-revoke 模型。如果机器持锁后失联但底层网络其实还活着，可能在锁被强制收回的窗口里写出陈旧版本。论文用 lease 超时严格小于回收时间这个不变量回避，但调参错了就会出现『分裂大脑』。

## 适用 vs 不适用场景

**适用**：
- 企业内网、机器数中等（10-100）、网络可靠（SAN）→ 共享磁盘范式刚好
- 类 NFS 通用工作负载，需要 POSIX 语义 → 锁保强一致很合身
- 想让机器无状态、加减机器不 reshard → Frangipani 的核心卖点

**不适用**：
- Web 规模（几千台 + WAN） → 锁服务撑不住，选 GFS / HDFS 路线
- 写主要是大文件追加 → 不需要共享磁盘的细粒度锁，GFS 的 chunk 模型更省事
- 没有底层共享磁盘抽象（廉价 PC + 直连本地盘） → Petal 这层缺位，Frangipani 整个架构站不住

## 历史小故事（可跳过）

- **1996 年**：DEC SRC 的 Lee + Thekkath 发表 Petal（SOSP 1996），把一组机器的本地盘伪装成一块大磁盘
- **1997 年**：同组加 Mann 发表 Frangipani（SOSP 1997），把 FS 盖在 Petal 上 —— 两篇是配套
- **1998 年**：DEC 被 Compaq 收购，Petal/Frangipani 商业化没继续。但论文里的『共享磁盘 + 分布式锁』被 IBM GPFS、Oracle OCFS、VMware VMFS 一起用
- **2003 年**：GFS 论文发表，特意在 related work 提了 Frangipani，说明自己『为什么不走那条路』
- **之后**：分布式锁服务这个组件独立出来，演化成 Chubby（2006）、ZooKeeper（2008）、etcd（2013）

## 学到什么

1. **抽象的选择决定了上层能做什么**：Frangipani 选共享磁盘抽象，整个 FS 设计就被锁定在这个假设里；GFS 不选，于是有了完全不同的形态
2. **对称设计很美，但 Web 规模不一定吃得消**：Frangipani 没有中央 master，理论上每台机器对等；GFS 反其道而行，单 master 反而活下来
3. **把 log 放在共享存储能做出『邻居替你恢复』的妙招**——但代价是写 log 慢
4. **基础设施会沿着论文的范式分化**：锁服务这一层后来独立成 Chubby/ZK/etcd，单独做分布式系统的协调
5. **同一篇论文的『成功』可以在两个不同维度衡量**：商业部署上 Frangipani 没出圈，但分布式锁、共享磁盘 FS、redo log 协同恢复这三个想法全都被后人吸收，比很多『卖得好的』论文影响更深

## 延伸阅读

- 原论文 SOSP 1997（24 页 PDF）：[Thekkath, Mann, Lee — Frangipani](https://www.cs.princeton.edu/courses/archive/fall15/cos518/papers/frangipani.pdf)
- 配套的底座 Petal SOSP 1996：[Lee, Thekkath — Petal: Distributed Virtual Disks](https://dl.acm.org/doi/10.1145/237090.237157)
- MIT 6.824 Frangipani 课节：[6.824 Frangipani lecture](https://pdos.csail.mit.edu/6.824/papers/thekkath-frangipani.pdf)（带讨论笔记）
- 对照阅读 GFS 2003：[Ghemawat — The Google File System](https://research.google/pubs/the-google-file-system/)（看它怎么解释自己『为什么不走 Frangipani 路』）
- [[gfs]] —— 走相反路线赢了 Web 规模的对照组
- [[afs-1988]] —— 早 10 年的分布式 FS，思路完全不同（客户端缓存 + 回调）

## 关联

- [[gfs]] —— 同一问题的另一种答案：单 master + 大块 + 弱一致
- [[afs-1988]] —— 上一代分布式 FS，强调客户端缓存
- [[lfs-1991]] —— Frangipani 每台机器的 redo log 思路与 LFS 同源
- [[lamport-tla-1994]] —— 锁服务的复制协议（Paxos）的同时代理论工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
