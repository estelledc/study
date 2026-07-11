---
title: Disco — 让没改过的商用 OS 在 64 核大机器上一起跑
来源: 'Bugnion, Devine, Govil, Rosenblum, "Disco: Running Commodity Operating Systems on Scalable Multiprocessors", SOSP 1997'
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

Disco 是 Stanford 1997 年做出来的一层**虚拟机监视器**（VMM, Virtual Machine Monitor），它干的事一句话讲清楚：

> 在硬件和操作系统之间插一层薄壳，让多份**没动过一行代码**的 IRIX，同时跑在一台 64 核的大机器上。

日常类比：盖一栋 64 层的大楼，本来要让每户人家自己设计水电——工程量爆炸。开发商的做法是在地基和公寓之间塞一层"物业"，物业把整栋楼的水电切好分到每户，每户拎包入住，户型完全不用改。Disco 就是那层物业。

它的硬件背景是 Stanford 自己造的 FLASH——MIPS R10000，64 个 CPU，ccNUMA 架构。当时的商用 OS（IRIX、Solaris）都是为 8 核共享内存设计的，扩展到 64 核就卡死。要改 IRIX 内核能改一年还不一定改对。

## 为什么重要

不知道 Disco，下面这些事你都没法解释来源：

- 现在每台 AWS EC2 / 阿里云 ECS 背后跑的 hypervisor，**直接祖先就是 Disco**
- VMware 1998 年成立，五个创始人里两个（Bugnion + Rosenblum）就是 Disco 论文作者
- Xen（2003 SOSP）、KVM（2007）、Hyper-V 这些主流虚拟化技术，思路都从 Disco 长出来
- 1960s 的大型机 VMM（IBM CP-67、VM/370）在 RISC/Unix 时代被遗忘 20 年——是 Disco 把它**重新激活**
- 理解 VMM 才能搞懂云计算计费：你买的是切片不是整机

## 核心要点

Disco 的整个论点拆成两层。

**第一层是"为什么要做"**：64 核 ccNUMA 硬件已经造出来了，但商用 OS 跟不上。两条路——要么改 OS（工作量恐怖且每出新版要重做），要么在下面塞一层把硬件**切片**。Disco 选第二条。

**第二层是"怎么做不亏"**：纯切片每个 VM 各占一份资源，加起来比单一 OS 还浪费。要让 VMM 能赢，必须做**资源共享**。Disco 给出三招：

1. **透明页面共享**（Transparent Page Sharing）：两个 VM 都加载了同一份 IRIX 内核 + 同一份 libc，物理页内容必然大量重复。VMM 检测到后让多个 VM 共享同一份物理页，标记只读 COW（写时复制）。某个 VM 想改就给它一份私有副本。内存占用从 N 倍降到接近 1 倍。

2. **动态内存平衡**：VMM 监控每个 VM 的内存压力，在线调整每个 VM 拿多少物理页，NUMA 感知地把页面放在用它最多的 CPU 的本地节点。

3. **虚拟子网**（Virtual Subnet）：VM 之间通信走模拟的以太网协议，但**物理层走共享内存**——发包不真的过网卡，对方 VM 直接 mmap 读到。延迟接近本地，零拷贝。

整套加起来，性能开销约 **16%**，但相比单份 IRIX 在 64 核上的可扩展性灾难，Disco 整体跑得更快、更稳。

## 实践案例

### 案例 1：为什么不直接改 IRIX

1997 年 SGI 的 IRIX 已有几百万行 C 代码，锁、调度器、内存分配器都是为中等核数设计的。要把它改成 64 核可扩展：

- 重写每个全局锁（数百个）
- 重做调度器让它感知 NUMA 拓扑
- 改内存分配器，加 per-CPU 缓存

Stanford 估算工作量：**几十人·年**。而且 SGI 每发一版 IRIX，这套修改都要重做（rebase 地狱）。

Disco 用 VMM **绕开**这个问题。改的是 VMM（薄薄一层，几万行代码），IRIX 一行没动。

### 案例 2：透明页面共享怎么省内存

8 个 VM 同时跑 IRIX，每份 IRIX 内核镜像 8MB → 朴素切片要 64MB。

Disco 做法：

1. VMM 维护一张 hash 表，记录每个物理页的内容指纹
2. 检测到 8 份 IRIX 内核页内容完全一样 → 只保留 1 份物理页，8 个 VM 的页表都指过去，标记只读
3. 某个 VM 写这个页 → 触发 page fault → VMM 复制一份给它，更新页表

效果：8 份内核的内存从 64MB → 8MB。这个机制现代 Linux 叫 **KSM**（Kernel Same-page Merging），思路一模一样，2009 年才进 Linux 主线。

### 案例 3：虚拟子网怎么不烧带宽

两个 VM 跑 NFS，VM-A 是客户端，VM-B 是服务端。朴素做法：VM-A 发包 → VMM 模拟网卡 → 复制到 VM-B 的接收缓冲区。每包至少 2 次拷贝。

Disco 做法：VM-A 和 VM-B 共享一段物理内存当"网线"，发包就是把指针写入共享队列，VM-B 直接读。零拷贝、零中断。NFS 性能逼近本地文件系统。

### 案例 4：VMM 怎么伪装成硬件

guest OS 以为自己独占整机，实际看到的所有"硬件"都是 VMM 演的：

- guest 想读 CPU 寄存器 → VMM 截下来返回模拟值
- guest 装中断处理函数 → VMM 截下来登记到自己表里，真中断来时再转发
- guest 操作页表 → VMM 维护一份"影子页表"，真正用的是影子表

这套机制叫 **trap-and-emulate**。前提是硬件特权指令在用户态执行会 trap 进 VMM。MIPS 满足，早期 x86 不满足，所以 VMware 1999 才需要二进制翻译补丁。

## 踩过的坑

1. **VMM ≠ container**：VMM 切硬件，每个 VM 自带完整内核；容器切 namespace，共享一个内核。所以 VM 启动慢但隔离强，容器启动快但内核漏洞影响所有人。Disco 的"薄壳物业"是 VMM 路线。

2. **Disco 跑 RISC，trap 廉价**：MIPS 的特权指令陷入开销小。x86 早期虚拟化做不到——某些指令在用户态默默失败而不 trap，VMware 1999 在 x86 上做 VMM 用了**二进制翻译**这个黑魔法补丁，直到 2006 年 Intel VT-x / AMD-V 硬件支持才彻底解决。

3. **页面共享靠被动检测，不是主动协商**：Disco 没有让 VM 告诉 VMM "我和别人共享了这页"，而是 VMM 自己扫描 hash。优点是 guest OS 不用改，缺点是检测开销高。现代 hypervisor 会结合两种思路。

4. **16% 开销在 1997 是甜点，今天不是**：当时 CPU 工程师时间贵，VMM 省下的人月远超 CPU 周期损失。今天云厂商按毫秒计费，所以现代 hypervisor 卷到 < 3% 开销。

## 适用 vs 不适用场景

**适用**：

- 想在一台大机器上隔离地跑多个 OS / 多个租户（云的本质）
- guest OS 不能改（商业闭源 OS）或不愿改（兼容旧版）
- 需要**强隔离**：一个 VM 崩溃不能影响别人

**不适用**：

- 同 OS 多进程隔离 → 容器就够了，VM 太重
- 极致性能（HPC、网络转发） → bare-metal 或 SR-IOV 直通
- 嵌入式 / 实时系统 → VMM 引入的延迟抖动不可控

## 历史小故事（可跳过）

- **1960s**：IBM CP-67 / VM/370 已有完整 VMM 思想，让一台大型机当 N 台用
- **1980s-1990s**：Unix + RISC 兴起，VMM 被遗忘——大家觉得 OS 直接管硬件就够了
- **1997 SOSP**：Disco 论文发表，把 VMM 在商用 RISC + ccNUMA 上重新激活
- **1998**：Bugnion + Rosenblum + Devine + Wang + Greenberg 在 Palo Alto 创办 VMware
- **1999**：VMware Workstation 1.0 发布，把 Disco 思路移植到 x86（用二进制翻译绕开 x86 虚拟化短板）
- **2001**：VMware ESX 1.0，bare-metal hypervisor
- **2003 SOSP**：Cambridge 的 Xen 论文，提出 paravirtualization——让 guest 知道自己被虚拟化以换性能
- **2006**：Intel VT-x / AMD-V 硬件虚拟化扩展上市
- **2007**：KVM 进入 Linux 主线，VMM 成为内核模块
- **2010s-**：AWS EC2、阿里云、Google Compute Engine——所有公有云都站在 Disco 这条线上

## 学到什么

1. **加一层抽象往往比改原系统便宜**：当源码改不动或改不起，VMM 这种"薄壳"是工程上的银弹
2. **老思想会复活**：VMM 不是新发明，1960s 大型机就有。当硬件趋势变（RISC → ccNUMA → 多核 → 云），老抽象会重新值钱
3. **隔离 + 共享是矛盾对**：纯切片浪费，纯共享冲突。Disco 三招（页共享、内存平衡、虚拟子网）都是在调和这对矛盾
4. **作者紧接着创业**：学术论文 + 一年内成立 VMware，是 Stanford 系统圈"研究即产品"文化的典型样本
5. **看似性能损失，整体大赢**：16% 开销不便宜，但相比 OS 改造的几十人·年，账很好算
6. **学术 → 工业有时只隔一年**：Disco 1997 SOSP，VMware 1998 成立。证明学术想法走对路时，落地速度可以非常快
7. **薄壳哲学的回声**：今天看 unikernel、microVM（Firecracker）、WASM runtime，都是"用一层薄壳承担最少的事"——Disco 的精神还在

## 延伸阅读

- 论文 PDF：[Disco SOSP 1997](https://web.stanford.edu/class/cs240/old/sp2014/readings/disco.pdf)（24 页，写得清楚，零基础也能读完）
- Mendel Rosenblum 回顾文：[The Reincarnation of Virtual Machines](https://queue.acm.org/detail.cfm?id=1017000)（ACM Queue 2004，作者本人讲为什么 VMM 复活）
- VMware ESX OSDI 2002 论文（Disco 思路工业化版本）
- [Xen and the Art of Virtualization](https://www.cl.cam.ac.uk/research/srg/netos/papers/2003-xensosp.pdf) SOSP 2003

## 关联

- [[hyperkernel-2017]] —— 用形式化验证证明 hypervisor 安全，是 Disco 的"严谨化"后裔
- [[barrelfish-2009]] —— 同样面对多核扩展，但走 multikernel 路线而非 VMM
- [[lfs-1991]] —— Mendel Rosenblum 同时期的 OS 论文（日志结构文件系统）
- [[afs-1988]] —— 同属系统经典，处理跨机器资源共享的另一条思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[xen-2003]] —— Xen 2003 — 让操作系统配合虚拟化，性能直接接近原生
