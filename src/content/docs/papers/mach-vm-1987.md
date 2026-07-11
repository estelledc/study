---
title: Mach VM — 把虚拟内存抽象成"对象"，与硬件解耦
来源: 'Rashid et al., "Machine-Independent Virtual Memory Management for Paged Uniprocessor and Multiprocessor Architectures", IEEE TC, Aug 1988'
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

Mach VM 是 1987 年 CMU 那批人（Rashid、Tevanian、Young 等）在 Mach 内核里做的**虚拟内存子系统**。它干了一件当时少见的事：**把虚拟内存的逻辑层和硬件 MMU 层彻底拆开**，让同一份 VM 代码能跑在 VAX、Sun-3、IBM RT、i386、Multimax 多机器上。

日常类比：以前的 VM 像"针对某款打印机写的驱动"——换一台打印机就要重写一半。Mach 把它改造成"通用排版器 + 各打印机翻译片"——上层只跟"页面对象"打交道，下层 pmap 模块负责把抽象操作翻译成具体 MMU 指令。

这不是小重构。它把 Accent 里已有的虚存对象雏形，在 Mach 里**工程化成可移植的操作系统对象**：每个地址空间是一棵 VM 对象树，可以拷贝、共享、映射文件、跨机器复制。今天 macOS / iOS（XNU）和 FreeBSD VM 是直系遗产；Linux 的 mmap / 页缓存模型走的是并行演进，但同样落到「地址区间映射到可共享的内存对象」这一抽象上。

## 为什么重要

不理解 Mach VM，下面这些事都连不起来：

- 为什么 fork() 在现代 OS 上几乎不复制内存——**copy-on-write** 在 Mach VM 这里被工程化
- 为什么 mmap 一个文件可以让多个进程共享同一份物理页——**memory object** 抽象的直系遗产
- 为什么 macOS 能让用户态进程当"分页器"——**外部分页器**接口
- 为什么内核移植新 CPU 架构主要写 pmap 那一层——**机器无关 / 机器相关分层**起源

## 核心要点

Mach VM 的全部精髓压到 **5 个对象 + 1 个分层**：

1. **address map（地址映射）**：一个进程看到的虚拟地址空间，本质是"地址区间 → VM 对象"的有序列表。类比：一张地图，每块地标着"对应哪份内容"。
2. **VM object（VM 对象）**：一段连续虚拟内存的"内容来源"。可能是匿名页（堆），可能是文件，可能是另一个 VM 对象的副本。
3. **memory object（内存对象）**：VM 对象后面真正提供页面的实体，由**外部分页器**实现。访问缺页时，内核给它发消息要页。
4. **pmap（physical map，物理映射层）**：唯一与硬件 MMU 直接对话的部分。VAX、i386、MIPS 各有各的 pmap，上层一概不知。
5. **resident page（驻留页）**：一个物理页帧的元数据，记录它当前服务于哪个 VM 对象的哪一页。

**分层**：上层做"地址区间 / 对象 / 复制 / 共享"语义，下层 pmap 做"装载 PTE / 失效 TLB / 处理脏位"。两层之间只通过几个回调互相调用。

## 实践案例

### 案例 1：fork() 为什么变快

fork() 要把父进程整个地址空间复制给子进程。传统做法：逐页 memcpy。Mach VM 改成：

1. 给子进程做一份**新的 address map**
2. 每个 VM 对象**不复制内容**，而是创建一个 **shadow object**——只记录"以原对象为底，自己之后写哪些页"
3. 把所有 PTE 标成只读

子进程或父进程**写**某一页时，缺页处理把那一页拷到 shadow，再改回可写。**没动过的页，永远不复制**。

这就是 copy-on-write 的对象化实现。后来 Linux / FreeBSD 都借鉴了这套 shadow 链思路。

### 案例 2：mmap 一个文件为什么能在进程间共享

进程 A 调 mmap("/data/big.bin")：

1. 内核找到 big.bin 对应的 **memory object**（如果没有就让 vnode pager 创建一个）
2. 在 A 的 address map 里加一段："虚拟地址 0x10000-0x20000 → 这个 memory object 的 0-0x10000"
3. 进程 B 也 mmap 同一文件，**指向同一个 memory object**
4. 任何一方读，缺页时分页器供页；任何一方写（如果是 MAP_SHARED），写到同一个物理页

**memory object 是共享的天然枢纽**。这让"零拷贝文件 IO""跨进程共享内存""页面缓存与 mmap 统一"全部由同一抽象支撑。

### 案例 3：外部分页器到底能干什么

伪代码（用户态分页器）：

```c
// 用户态程序，注册成 memory object 的服务者
mach_msg_t req;
while (mach_msg_recv(&req)) {
    if (req.id == MEMORY_OBJECT_DATA_REQUEST) {
        // 内核问："请给我对象 X 的第 N 页"
        void *page = fetch_from_anywhere(req.offset);
        // 来源任意：本地盘、网络、压缩内存、另一台机器
        mach_msg_send_supply(req.object, req.offset, page);
    }
}
```

这就让**分布式共享内存**第一次有了干净的实现路径——分页器跑在任何一台机器上都行。

### 案例 4：移植 i386 时只改 pmap

CMU 把 Mach 从 VAX 移到 i386，**整个 VM 子系统 80% 代码不动**，只重写 pmap：

- VAX 的 pmap 操作多级页表
- i386 的 pmap 操作 4KB 页表 + PDE/PTE
- 上层 vm_map / vm_object / vm_page 完全复用

这种"机器无关上层 + 薄机器相关层"的分法，今天 Linux arch/ 目录、FreeBSD、XNU 全是同一思路。

## 踩过的坑

1. **shadow chain 越拉越长**：fork() 套 fork() 套 fork()，shadow object 串成长链，缺页时要逐层往上找原始页，开销飙升。后来加了 collapse/bypass 优化合并链节。

2. **外部分页器与内核的环形依赖**：分页器自己也用内存。如果分页器自己缺页又要等自己回页，瞬间死锁。要靠"wired pages（钉死页）"和优先级隔离避免。

3. **跨架构 PTE 语义不一致**：i386 有"accessed""dirty"硬件位，某些 RISC 没有，pmap 接口要找最大公约数，结果接口比预想丑。

4. **TLB shootdown 在多处理器上很贵**：换页或保护权限变化要通知所有 CPU 失效 TLB。Mach VM 把这一步抽象在 pmap 层，但实际开销一点没省，仍然是多核 OS 的痛点之一。

5. **page replacement 决策被外部分页器拖累**：分页器在用户态，看不见全局内存压力，内核又不知道页用途，置换策略两边都不灵。Mach 3.0 内存紧时表现拉胯，根因之一就在这。

## 适用 vs 不适用场景

**适用**：
- **跨架构内核**：移植成本主要在 pmap，上层零改动
- **需要灵活内存来源**：mmap 文件、共享内存、分布式 DSM、压缩内存全靠 memory object 接口
- **fork-heavy 工作负载**：copy-on-write 和 shadow object 把进程创建成本压低

**不适用**：
- **极致 VM 性能场景**：分层和 IPC 都有税，单体直写 PTE 的方案更快
- **小内存嵌入式**：vm_object / vm_page 元数据本身有开销
- **简单地址空间需求**：根本不 fork、不 mmap 的系统，这套抽象用不上

## 历史小故事（可跳过）

- **1981 年**：Rashid 在 CMU 的 Accent 内核已经有"capability + 虚存对象"雏形
- **1985 年**：Mach 项目启动，Tevanian 主导 VM 子系统设计，目标"机器无关 + 对象化"
- **1987 年**：ASPLOS 上发表 Mach VM 设计；次年 IEEE TC 全文版
- **1989 年**：NeXTSTEP 用 Mach 2.5，VM 子系统第一次商用
- **1993 年**：FreeBSD 借鉴 Mach VM 抽象，写出 FreeBSD VM（后被多家 BSD 采纳）
- **2001 年**：Mac OS X 发布，Mach VM 通过 XNU 进入消费级 Mac
- **2007 年**：iPhone 发布，同一套 VM 代码进 iOS

Tevanian 后来跟 Steve Jobs 到 NeXT、Apple，做到软件 SVP；他写过的这份 VM 代码至今还在十几亿台设备里跑。

## 学到什么

1. **抽象的回报在移植时兑现**：日常看不出 pmap 分层的好处，换架构那天才明白
2. **对象化让"内存来源"变成可插拔**：本地、网络、压缩、加密——都做成 memory object 就好
3. **copy-on-write 不是孤立技巧**：它需要 shadow object、引用计数、PTE 只读位三件事配合
4. **把决策权下放给用户态有代价**：外部分页器看不到全局，灵活性换来策略短视

## 延伸阅读

- 论文 PDF：[Machine-Independent Virtual Memory Management — IEEE TC 1988](https://www.cs.cmu.edu/afs/cs/project/mach/public/doc/published/vm.ps)
- 后续读：Young et al. 1987《The Duality of Memory and Communication in Mach》——VM 与 IPC 的统一视角
- 工业落地：FreeBSD VM 的源码注释（sys/vm/vm_object.c）几乎是这篇论文的代码版
- [[mach-1986]] —— 同一群人做的内核论文，task / port / message 在那里
- [[exokernel-1995]] —— 反 Mach 思路：内核更不抽象，把 VM 决策权全部交出

## 关联

- [[mach-1986]] —— 上一层：Mach 内核整体架构，VM 是其中之一
- [[exokernel-1995]] —— 反方案：抽象越少越好，把页表也暴露给用户
- [[xen-2003]] —— 把"机器无关 / 机器相关"分层思路推到虚拟化层
- [[l4-1995]] —— 后辈微内核，VM 抽象更激进地下放给用户态
- [[nvm]] —— 持久内存出现后，memory object 抽象需要扩展处理"有些页落盘语义"
- [[kvm-2007]] —— 硬件辅助虚拟化时代，pmap 分层思路被影子页表 / EPT 继承

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
