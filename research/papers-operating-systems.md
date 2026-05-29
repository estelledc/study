---
title: 论文候选 — 操作系统 / 系统设计
description: 60 篇候选，由 research subagent 整理，待主 CC 排期写入正式 papers/
日期: 2026-05-29
---

# 操作系统 / 系统设计主题候选

候选 60 篇，按 12 个子主题分组。覆盖 1965-2021，避开当前 study 站已有的 gfs / mapreduce / ebpf / io-uring / borg；同时不与数据库候选池中的 ceph / hdfs / haystack / azure-storage / tachyon 重复。

## 奠基经典（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `multics-1965` | Introduction and Overview of the MULTICS System | 1965 | UNIX 的直接祖先；分时系统、动态链接、分段虚拟内存、ring 保护等概念都源自这里 | https://www.multicians.org/fjcc1.html |
| `the-os-1968` | The Structure of the 'THE'-Multiprogramming System | 1968 | Dijkstra 用信号量 + 分层架构组织 OS 的范式；今天教科书的"5 层模型"就是从这里来的 | https://www.cs.utexas.edu/users/EWD/ewd01xx/EWD196.PDF |
| `unix-1974` | The UNIX Time-Sharing System | 1974 | Ritchie & Thompson 的原始论文；fork/exec、everything-is-a-file、shell pipe 的设计哲学源头 | https://dsf.berkeley.edu/cs262/unix.pdf |
| `hydra-1974` | HYDRA: The Kernel of a Multiprocessor Operating System | 1974 | Capability-based 保护机制的开山之作；现代 OS 安全模型 (seL4、Capsicum) 的理论祖宗 | https://dl.acm.org/doi/10.1145/355616.364017 |
| `mach-1986` | Mach: A New Kernel Foundation For UNIX Development | 1986 | 微内核 + 消息传递 + 端口的标杆；macOS/iOS 内核 (XNU) 至今仍直接继承 Mach 的核心抽象 | https://www.cse.unsw.edu.au/~cs9242/19/papers/Accetta_BGGRTY_86.pdf |

## 微内核与 Exokernel（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `l4-1995` | On µ-Kernel Construction | 1995 | Liedtke 反驳"微内核太慢"的著名论文；IPC 优化到 100 cycle 量级，奠定 L4 系微内核家族 | https://os.inf.tu-dresden.de/pubs/sosp95/ |
| `sel4-2009` | seL4: Formal Verification of an OS Kernel | 2009 | 第一个机器证明了功能正确性的 OS 内核；安全关键系统（航空、汽车）的事实标准 | https://www.sigops.org/s/conferences/sosp/2009/papers/klein-sosp09.pdf |
| `eros-1999` | EROS: A Fast Capability System | 1999 | 把 capability 系统的性能做到与 monolithic 内核可比；持久化对象 + 单层存储的有趣实验 | https://www.cs.jhu.edu/~seclab/pubs/eros-sosp99.pdf |
| `exokernel-1995` | Exokernel: An Operating System Architecture for Application-Level Resource Management | 1995 | "把抽象推到用户态"的极致设计；今天 unikernel / 库 OS / DPDK 都能看到它的影子 | https://pdos.csail.mit.edu/6.828/2008/readings/engler95exokernel.pdf |
| `barrelfish-2009` | The Multikernel: A new OS architecture for scalable multicore systems | 2009 | 把多核当成分布式系统设计；ETH Zurich 对"shared memory 不再是默认"的激进回应 | https://www.sigops.org/s/conferences/sosp/2009/papers/baumann-sosp09.pdf |

## 单机文件系统（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `ffs-1984` | A Fast File System for UNIX | 1984 | McKusick 的 FFS；柱面组、块组、块大小可调——今天 ext4/XFS 仍在用这套布局思路 | https://dsf.berkeley.edu/cs262/FFS.pdf |
| `lfs-1991` | The Design and Implementation of a Log-Structured File System | 1991 | Rosenblum & Ousterhout；"把整个磁盘当 log 写"的颠覆性设计，启发了 LSM-Tree 和现代 SSD FS | https://people.eecs.berkeley.edu/~brewer/cs262/LFS.pdf |
| `soft-updates-1999` | Soft Updates: A Solution to the Metadata Update Problem in File Systems | 1999 | Ganger 等给出"不用 journal 也能保证元数据一致"的方案；FreeBSD UFS2 默认实现 | https://www.mckusick.com/publications/softupdates.pdf |
| `zfs-2003` | The Zettabyte File System | 2003 | Sun 的 ZFS 白皮书；端到端校验、快照、池化存储成为后续所有现代 FS 的标准要求 | https://users.soe.ucsc.edu/~scott/courses/Fall04/221/zfs_overview.pdf |
| `btrfs-2013` | BTRFS: The Linux B-tree Filesystem | 2013 | Linux 上的 ZFS 替代品；Copy-on-Write B-tree 的工业实现，理解快照、子卷的实现细节 | https://dl.acm.org/doi/10.1145/2501620.2501623 |

## 分布式文件系统（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `nfs-1985` | Design and Implementation of the Sun Network Filesystem | 1985 | Sandberg 的 NFS 论文；"无状态服务器 + RPC"成为分布式文件系统的开山范式 | https://www.cs.princeton.edu/courses/archive/fall03/cs518/papers/nfs.pdf |
| `afs-1988` | Scale and Performance in a Distributed File System | 1988 | CMU 的 AFS；客户端 cache + callback 失效协议，让分布式文件系统真正能扩展到上千机器 | https://www.cs.cmu.edu/~satya/docdir/scale-tocs88.pdf |
| `coda-1990` | Coda: A Highly Available File System for a Distributed Workstation Environment | 1990 | AFS 的下一代；离线断连工作 + 冲突合并的开创性工作，移动计算的先驱 | http://www.coda.cs.cmu.edu/ljpaper/lj.pdf |
| `frangipani-1997` | Frangipani: A Scalable Distributed File System | 1997 | Petal 之上的分布式 FS；分布式锁服务 + 共享虚拟磁盘的范式，影响了 GFS 与 GPFS | https://www.cs.princeton.edu/courses/archive/fall15/cos518/papers/frangipani.pdf |
| `farsite-2002` | FARSITE: Federated, Available, and Reliable Storage for an Incompletely Trusted Environment | 2002 | "由不可信桌面组成可信存储"的逆向思路；拜占庭容错 + 加密分片的早期实验 | https://www.usenix.org/legacy/event/osdi02/tech/full_papers/adya/adya.pdf |

## 调度（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `lottery-1994` | Lottery Scheduling: Flexible Proportional-Share Resource Management | 1994 | Waldspurger 的彩票调度；用概率代替优先级，今天 cgroups CPU share 仍能见其思路 | https://www.usenix.org/legacy/publications/library/proceedings/osdi/full_papers/waldspurger.pdf |
| `bvt-1999` | Borrowed-Virtual-Time (BVT) Scheduling: Supporting Latency-sensitive Threads in a General-Purpose Scheduler | 1999 | 引入"虚拟时间"概念调和延迟敏感与吞吐型任务；CFS 的精神前身 | https://dl.acm.org/doi/10.1145/319151.319169 |
| `flexsc-2010` | FlexSC: Flexible System Call Scheduling with Exception-Less System Calls | 2010 | 把系统调用从同步陷入改为异步队列；后续 io_uring / 批量 syscall 的灵感来源 | https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Soares.pdf |
| `shenango-2019` | Shenango: Achieving High CPU Efficiency for Latency-sensitive Datacenter Workloads | 2019 | 5 微秒级核迁移；用户态线程库 + 中央调度器，重新定义"什么是足够快的调度" | https://www.usenix.org/system/files/nsdi19-ousterhout.pdf |
| `ghost-2021` | ghOSt: Fast & Flexible User-Space Delegation of Linux Scheduling | 2021 | Google 把 Linux 调度策略放到用户态做；机器学习驱动的调度政策实验场 | https://dl.acm.org/doi/10.1145/3477132.3483542 |

## 虚拟化（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `disco-1997` | Disco: Running Commodity Operating Systems on Scalable Multiprocessors | 1997 | Bugnion 等让 IRIX 跑在虚拟机里；现代 hypervisor (VMware/Xen) 的直接前身 | https://web.stanford.edu/class/cs240/old/sp2014/readings/disco.pdf |
| `denali-2002` | Scale and Performance in the Denali Isolation Kernel | 2002 | "上千个轻量 VM 同时跑"的早期实验；为后来 Firecracker / unikernel 探了路 | https://www.usenix.org/legacy/event/osdi02/tech/full_papers/whitaker/whitaker.pdf |
| `xen-2003` | Xen and the Art of Virtualization | 2003 | 半虚拟化（paravirtualization）的标杆；AWS EC2 早期完全靠 Xen，至今仍是 hypervisor 教科书 | https://www.cl.cam.ac.uk/research/srg/netos/papers/2003-xensosp.pdf |
| `kvm-2007` | kvm: The Linux Virtual Machine Monitor | 2007 | 把 hypervisor 做成内核模块的取舍；今天 OpenStack/oVirt/Proxmox 都基于 KVM | https://www.kernel.org/doc/ols/2007/ols2007v1-pages-225-230.pdf |
| `firecracker-2020` | Firecracker: Lightweight Virtualization for Serverless Applications | 2020 | AWS Lambda/Fargate 背后的 microVM；125ms 启动 + 5MB 内存的极致取舍 | https://www.usenix.org/system/files/nsdi20-paper-agache.pdf |

## 容器与集群编排（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `soltesz-2007` | Container-based Operating System Virtualization: A Scalable, High-Performance Alternative to Hypervisors | 2007 | Linux-VServer 论文版；定义了"namespace + cgroup-like 隔离"的容器范式，比 Docker 早 6 年 | https://www.cs.princeton.edu/~mef/research/vserver/paper.pdf |
| `mesos-2011` | Mesos: A Platform for Fine-Grained Resource Sharing in the Data Center | 2011 | 双层调度的奠基；Twitter/Apple 早期都在用，理解为什么 K8s 最后选了单层 | https://people.csail.mit.edu/matei/papers/2011/nsdi_mesos.pdf |
| `omega-2013` | Omega: flexible, scalable schedulers for large compute clusters | 2013 | Borg 之后的 Google 实验作；共享状态 + 乐观并发的调度器，K8s 调度框架直接抄它 | https://research.google/pubs/omega-flexible-scalable-schedulers-for-large-compute-clusters/ |
| `kubernetes-2016` | Borg, Omega, and Kubernetes | 2016 | Burns 等从 Google 三代调度器中提炼经验；解释 K8s 为何选 declarative + reconciliation | https://research.google/pubs/borg-omega-and-kubernetes/ |
| `twine-2020` | Twine: A Unified Cluster Management System for Shared Infrastructure | 2020 | Facebook 把数据中心当成一台机器调度；与 Borg/K8s 对比理解超大规模容器编排的另一种解法 | https://www.usenix.org/system/files/osdi20-tang.pdf |

## 同步与并发（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `dijkstra-1965` | Solution of a Problem in Concurrent Programming Control | 1965 | Dijkstra 提出信号量与互斥；所有锁、信号量、并发原语的理论祖宗 | https://dl.acm.org/doi/10.1145/365559.365617 |
| `monitors-1974` | Monitors: An Operating System Structuring Concept | 1974 | Hoare 的 monitor 抽象；Java synchronized / C# lock / Go channel 等高层同步原语都源自这里 | https://www.cs.cmu.edu/~crary/819-f09/Hoare74.pdf |
| `mcs-locks-1991` | Algorithms for Scalable Synchronization on Shared-Memory Multiprocessors | 1991 | Mellor-Crummey & Scott 的 MCS 锁；Linux qspinlock、Java AQS 都基于此设计 | https://www.cs.rochester.edu/u/scott/papers/1991_TOCS_synch.pdf |
| `rcu-2001` | Read-Copy Update | 2001 | McKenney 的 RCU；Linux 内核 dcache/网络/路由表大量使用，"零开销读侧"的极致 | https://www.kernel.org/doc/ols/2001/read-copy.pdf |
| `hazard-pointers-2004` | Hazard Pointers: Safe Memory Reclamation for Lock-Free Objects | 2004 | Maged Michael 解决 lock-free 数据结构的内存回收；C++ std::hazard_ptr 入选 C++26 | https://www.research.ibm.com/people/m/michael/ieeetpds-2004.pdf |

## 内存管理（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `belady-1966` | A Study of Replacement Algorithms for a Virtual-Storage Computer | 1966 | Belady 的 OPT 算法和"FIFO 异常"；所有页面置换算法的理论起点 | https://courses.cs.washington.edu/courses/cse451/16wi/readings/belady_optimal.pdf |
| `mach-vm-1987` | Machine-Independent Virtual Memory Management for Paged Uniprocessor and Multiprocessor Architectures | 1987 | Rashid 等把 VM 抽象成与硬件解耦的"对象"；macOS/iOS VM 子系统、Linux mmap 模型都受其影响 | https://dl.acm.org/doi/10.1145/36206.36181 |
| `slab-1994` | The Slab Allocator: An Object-Caching Kernel Memory Allocator | 1994 | Bonwick 在 Solaris 上发明 slab；Linux 的 SLUB / SLAB / SLOB 全是它的变体 | https://people.eecs.berkeley.edu/~kubitron/courses/cs194-24-S14/hand-outs/bonwick_slab.pdf |
| `esx-memory-2002` | Memory Resource Management in VMware ESX Server | 2002 | Waldspurger 的 memory ballooning + page sharing；云时代内存超分的工程范式 | https://www.cs.princeton.edu/courses/archive/fall12/cos518/papers/esx.pdf |
| `jemalloc-2006` | A Scalable Concurrent malloc(3) Implementation for FreeBSD | 2006 | Evans 的 jemalloc；Firefox/Redis/Rust 默认 allocator，arena + size class 的工业标准 | https://people.freebsd.org/~jasone/jemalloc/bsdcan2006/jemalloc.pdf |

## 分布式 OS（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `locus-1980` | LOCUS: A Network-Transparent, High-Reliability Distributed System | 1981 | UCLA 的 LOCUS；"网络透明"概念的早期实践，今天 NFS/分布式 OS 的精神祖辈 | https://dl.acm.org/doi/10.1145/800216.806587 |
| `v-system-1988` | The V Distributed System | 1988 | Cheriton 的 V 系统；轻量进程 + 极快 IPC 的范式，启发了 L4 与 QNX | https://dl.acm.org/doi/10.1145/42392.42400 |
| `sprite-1988` | The Sprite Network Operating System | 1988 | Ousterhout 的 Sprite；进程迁移 + 单一系统映像，分布式工作站时代的代表 | https://www2.eecs.berkeley.edu/Pubs/TechRpts/1987/CSD-87-393.pdf |
| `amoeba-1990` | The Amoeba Distributed Operating System—A Status Report | 1990 | Tanenbaum 的 Amoeba；处理器池 + 能力机制，"分布式 OS 该长什么样"的答卷 | https://www.cs.vu.nl/~ast/Publications/Papers/cscw-1990.pdf |
| `plan9-1995` | Plan 9 from Bell Labs | 1995 | Bell Labs 的下一代 UNIX；"everything is a file" 推到极致，9P 协议影响了 v9fs / WSL | http://doc.cat-v.org/plan_9/4th_edition/papers/9 |

## 安全与可验证（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `saltzer-schroeder-1975` | The Protection of Information in Computer Systems | 1975 | 8 条安全设计原则（least privilege/fail-safe defaults 等）至今仍是教科书条目 | https://www.cs.virginia.edu/~evans/cs551/saltzer/ |
| `selinux-2001` | Integrating Flexible Support for Security Policies into the Linux Operating System | 2001 | NSA 的 SELinux；把强制访问控制 (MAC) 嵌入 Linux 的 LSM 框架，Android 默认启用 | https://www.cs.unc.edu/~jeffay/courses/nidsS05/papers/selinux.pdf |
| `capsicum-2010` | Capsicum: Practical Capabilities for UNIX | 2010 | 把能力机制装回 UNIX；FreeBSD/Chromium sandbox 都基于 Capsicum，理解沙箱设计的现代答卷 | https://www.cl.cam.ac.uk/research/security/capsicum/papers/2010usenix-security-capsicum-website.pdf |
| `sgx-2013` | Innovative Instructions and Software Model for Isolated Execution | 2013 | Intel SGX 的原始白皮书；机密计算、TEE 的硬件基础，理解 enclave 设计取舍 | https://software.intel.com/content/dam/develop/external/us/en/documents/hasp-2013-innovative-instructions-and-software-model-for-isolated-execution.pdf |
| `haven-2014` | Shielding Applications from an Untrusted Cloud with Haven | 2014 | Baumann 把 LibOS 装进 SGX enclave；机密计算的早期完整系统设计 | https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-baumann.pdf |

## 现代内核 / 数据中心 OS（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `mirage-2013` | Unikernels: Library Operating Systems for the Cloud | 2013 | Madhavapeddy 的 MirageOS；OCaml 写的 unikernel，"应用 + 内核 = 一个 ELF"的极简化 | https://anil.recoil.org/papers/2013-asplos-mirage.pdf |
| `arrakis-2014` | Arrakis: The Operating System is the Control Plane | 2014 | Peter 等让 OS 退出数据路径；NIC/SSD 直通用户态，启发了 SPDK/DPDK 设计 | https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-peter_simon.pdf |
| `ix-2014` | IX: A Protected Dataplane Operating System for High Throughput and Low Latency | 2014 | Belay 等用 dune + DPDK 做数据面 OS；与 Arrakis 并列的高性能网络 OS 代表 | https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-belay.pdf |
| `snap-2019` | Snap: A Microkernel Approach to Host Networking | 2019 | Google 把网络栈搬到用户态微内核；Andromeda/gVNIC 的基础，理解为何"内核网络栈不够用" | https://research.google/pubs/snap-a-microkernel-approach-to-host-networking/ |
| `demikernel-2021` | The Demikernel Datapath OS Architecture for Microsecond-scale Datacenter Systems | 2021 | Microsoft Research 的 LibOS；微秒级 RPC 时代的 OS 抽象，统一 RDMA/DPDK/io_uring | https://dl.acm.org/doi/10.1145/3477132.3483569 |

---

## 备注

- 全部 60 篇均有公开 PDF 或 ACM/USENIX DOI 编号
- 时间跨度 1965-2021，涵盖 12 个子主题
- 已避开 study 站现有的 gfs / mapreduce / ebpf / io-uring / borg
- 已避开数据库候选池中的 ceph / hdfs / haystack / azure-storage / tachyon（属分布式存储交叉领域）
- 每篇 slug 命名遵循 kebab-case；与现有 papers/ 笔记命名风格一致
