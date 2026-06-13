---
title: Mach 1986 — 给 UNIX 换一块能跨机器生长的内核地基
来源: https://www.cs.cmu.edu/afs/cs/project/mach/public/www/doc/publications/usenix86.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象你住在一栋**老式百货大楼**里：4.3BSD UNIX 内核就像这栋楼的物业——收银、仓库、物流、客服、安保、装修队全挤在一层，每加一个新功能就要改整栋楼的管线和消防通道。1980 年代 Berkeley 内核越长越大，改一个驱动可能牵动全局，研究者和厂商都越来越难动它。

**Mach**（卡内基梅隆大学，1986 年 USENIX）提出的办法是：只保留一个精简的**物业中心**——负责调度 CPU、管理虚拟内存、在进程之间传消息、在多处理器上同步；而把 UNIX 的文件系统、进程管理、网络栈 gradually 迁到楼外的**独立商铺**（用户态 server）。商铺之间不靠共享全局变量说话，而是走**统一的消息邮箱（port）**。

这篇论文的全名是 *Mach: A New Kernel Foundation for UNIX Development*，作者包括 Mike Accetta、Robert Baron、William Bolosky、David Golub、Richard Rashid、Avadis Tevanian、Michael Young。它要回答的不是「再做一个更好的 UNIX」，而是：**能不能换一块更小、更统一、可扩展的内核地基，同时仍跑 4.3BSD 二进制程序？**

## 这篇论文在说什么

Mach 是一个**多处理器操作系统内核**，目标环境从单核工作站到上百 CPU 的大型共享内存多机，再到局域网里的一群机器（论文 Figure 1）。相对 4.3BSD，它新增的能力包括：

- **Task / Thread 分离**：一个「进程」拆成资源容器（task）和 CPU 执行单位（thread），多核上可在一个 task 里并行多个 thread
- **大稀疏虚存 + 写时复制（COW）**：fork、大消息传递、内存映射文件共用同一套 COW 机制
- **基于 port 的 IPC**：带类型、带 capability 的消息；理论上可透明延伸到网络
- **用户态 pager**：缺页时可以问用户态「分页 server」要数据，而不必写死在内核里

论文写于 **1986 年 4 月**。当时除 **thread 机制尚在完善**外，Mach 的 trap 处理、调度、多处理器同步、虚存、IPC 已在 CMU 内部**生产使用**——不是幻灯片架构，而是能在 VAX 上跑的研究平台。

## 为什么值得读（即使你不用 Mach）

不读这篇 1986 论文，后面很多设计会显得「凭空出现」：

| 现象 | 与 Mach 的关系 |
|------|----------------|
| macOS / iOS 内核叫 **XNU**，仍有 `mach_msg` | NeXT 1989 选 Mach 2.5，Apple 收购 NeXT 后一路继承 |
| **fork()** 几乎不复制物理内存 | Mach 把 COW 与 IPC 绑在一起工程化 |
| **GNU Hurd** 把文件系统做成用户态 server | 直接受「内核只留最小抽象」路线启发 |
| Tanenbaum vs Linus 的微内核之争 | Tanenbaum 拿 Mach 路线批评 monolithic Linux |
| **L4 / seL4 / Fuchsia Zircon** | 专治 Mach 3.0 时代 IPC 太慢的问题，但保留 message + capability 思想 |

Mach 的历史地位：**第一次系统地把「微内核思路 + UNIX 兼容 + 多处理器 + 网络透明」捆成可运行平台**。它后来在服务器上「输给」Linux，却在 **NeXT → Apple** 路径上活到了今天你的 iPhone 里。

## 核心概念（五个抽象 + 一条迁移路线）

Mach 内核只承诺 **四个基本抽象**（论文 §2）；工程上常把 **memory object（VM object）** 算作第五个，因为分页策略是整套设计的关键。

### 1. Task —— 资源容器

Task 是**资源分配的基本单位**，包含：

- 一个分页虚拟地址空间
- 对处理器、port 能力、虚拟内存等系统资源的受保护访问

日常类比：task 像**一整间带门锁的办公室**——里面的 thread 共享文件柜、白板和配额；换 task 等于换办公室，默认互不相通。

UNIX 里一个传统 **process** 在 Mach 里大致是 **一个 task + 一个 thread**（1986 时 thread 仍在完善）。

### 2. Thread —— CPU 上的执行流

Thread 是 **CPU 调度的基本单位**，有自己的程序计数器和寄存器，但**共享**所属 task 的地址空间和 port 权利。

为什么 UNIX 的 process 不够用了？论文 §3 指出：服务器用 `fork` 为每个客户端建进程开销巨大；多处理器上要用满 N 个核，至少需要 N 个可调度实体——用户态 coroutine 包内核看不见，**Mach 用 thread 把并行交给内核调度**。

### 3. Port —— 受保护的消息队列

Port 是 Mach 的**引用对象**，逻辑上是内核保护的**有限长度消息队列**：

- 可有**多个发送者**，通常只有**一个接收者**
- 访问靠 **capability**：send right、receive right 等
- 创建 task / thread / 窗口对象时，内核返回代表该对象的 port

和面向对象类比：**port = 对象引用，发消息 = 跨地址空间的方法调用**。论文用 Flamingo 窗口系统举例：每个窗口是一个 port，客户端向 port 发消息请求重绘。

### 4. Message —— 带类型的 IPC 包

Message = 固定头 + 可变体，可携带：

- 普通数据
- 指向用户空间的指针（配合虚存）
- **嵌套的 port capability**（把「钥匙」转交给别人）

除 message 本身外，**几乎所有内核操作都建模成「向某个 port 发消息」**。内核自己也像 server：在 task/thread port 上收消息并执行 suspend、resume 等操作。

### 5. Memory Object / VM Object —— 分页边界外置

虚拟内存区域可绑定 **pager**（分页 server）。缺页时内核不直接读磁盘，而是向 pager 的 port 要页。这样**文件系统、匿名内存、网络分页**有机会跑在用户态——内核维护 cache 和映射关系。

论文 §4–§5 的数据结构：**address map**（每 task 一份）、**share map**（共享区 indirection）、**VM object**（后备存储单元）、**shadow object**（COW  fault 后的影子页）。

### 6. 写时复制：IPC 与虚存是一件事

Mach 继承 Accent 的核心经验：**大消息不必 memcpy 整个地址空间**。

论文 Figure 5 描述的过程（简化）：

1. Task A 向 port 发送一条「很大」的消息（例如 24MB）
2. 发送时，A 地址空间里对应页面标为 **copy-on-write**
3. 数据暂放在内核临时映射里，直到 Task B receive
4. B 收到后，内核决定把页面映射进 B 的地址空间
5. A 或 B **第一次写**某一页时，才复制那一页

**fork** 同理：子 task 继承父 task 的 map，默认 **inherit copy-on-write**；也可 per-page 设为 share、copy 或 none（§4 的 allocate/protect/inherit 例子）。

Accent 上的评测表明：集成 VM 与 IPC 后，IPC 性能可接近传统 UNIX（论文引用 [3] Fitzgerald & Rashid, TOCS 1986）。

### 7. 与 4.3BSD 的关系（1986 实际状态 vs 目标）

1986 年的落地是**渐进替换**（论文 §8、Figure 6）：

| 层次 | 1986 年 Mach 做什么 |
|------|---------------------|
| 陷阱、调度、多处理器同步、虚存、IPC | **Mach 内核**直接提供 |
| 4.3BSD 语义（文件、信号、大部分 syscall） | 跑在 **kernel-state threads**，由 Mach 调度 |
| 长期目标 | 把非 Mach 的 UNIX 功能迁出内核，变成 **user-state tasks** |

论文原话：Berkeley 内核体积膨胀已经威胁 UNIX 作为研究平台的**简单与可修改性**；目标是 **「kernelize」UNIX**——更小、更易改、更适配新硬件和网络。

**重要**：Figure 6 里标注，截至 1986 年 4 月，「UNIX compatibility」盒子**仍在 kernel state**，通过共享通信队列与 Mach 层对话——不是一夜变成纯微内核。

## 代码示例

下面例子帮助零基础读者把抽象落到「长什么样」。API 名称随 Mach 版本演进（NeXT / XNU 略有差异），但**语义与 1986 论文一致**。

### 示例 1：通过 port 发一条 RPC 式请求

典型模式：**客户端向服务 port 发消息，服务端 `receive` 后处理**。文件系统、窗口管理器都可以是普通 user task，只要持有 receive right。

```c
#include <mach/mach.h>
#include <string.h>

#define MSG_OPEN_FILE  1001

typedef struct {
    mach_msg_header_t  head;
    char               path[256];
} open_request_t;

kern_return_t request_open(mach_port_t fs_port, const char *path)
{
    open_request_t req = {0};

    req.head.msgh_bits        = MACH_MSGH_BITS(MACH_MSG_TYPE_COPY_SEND, 0);
    req.head.msgh_size        = sizeof(req);
    req.head.msgh_remote_port = fs_port;
    req.head.msgh_local_port  = MACH_PORT_NULL;
    req.head.msgh_id          = MSG_OPEN_FILE;

    strncpy(req.path, path, sizeof(req.path) - 1);

    return mach_msg(&req.head,
                    MACH_SEND_MSG,
                    req.head.msgh_size,
                    0,
                    MACH_PORT_NULL,
                    MACH_MSG_TIMEOUT_NONE,
                    MACH_PORT_NULL);
}
```

服务端循环 `mach_msg(..., MACH_RCV_MSG, ...)`，按 `msgh_id` 分派。这和今天 gRPC 的「stub + 传输层」同构——只是传输层是内核的 port 队列。

### 示例 2：task 创建与 COW 继承（fork 的 Mach 版）

UNIX `fork()` 在 Mach 里更接近 **`task_create` + 虚存继承策略**。论文 §4：默认新分配内存 **inherit copy-on-write**；也可对某段设为 share / copy / none。

```c
#include <mach/mach.h>

kern_return_t fork_like_child(task_t parent, task_t *child_out)
{
    kern_return_t kr;
    task_t child = MACH_PORT_NULL;

    /* 创建子 task，继承 parent 的地址空间布局 */
    kr = task_create(parent, /* inherit_memory */ TRUE, &child);
    if (kr != KERN_SUCCESS)
        return kr;

    /* 对一段区域显式标记 COW 继承（读共享，写时分裂单页） */
    kr = vm_inherit(parent,
                    (vm_address_t)0x100000,
                    (vm_size_t)0x4000,
                    VM_INHERIT_COPY);
    if (kr != KERN_SUCCESS) {
        task_terminate(child);
        return kr;
    }

    /* 1986 论文时 thread 仍在完善；现代系统会 thread_create(child, ...) */
    *child_out = child;
    return KERN_SUCCESS;
}
```

论文称：在 MicroVAX II 上，带新虚存支持的 **fork 明显快于 4.3BSD**；新分配内存 touch 成本约 **0.7 ms/KB** vs BSD 约 **1.2 ms/KB**（§9，早期未充分调优的数据）。

### 示例 3：用户态 pager 处理缺页（概念伪代码）

```c
/* 用户态 anonymous pager：memory object 由 server 提供 */
memory_object_t memobj = pager_create_anonymous();

vm_address_t addr = 0;
vm_map(current_task(), &addr, 0x10000, /* offset */ 0,
       /* copy */ FALSE, memobj, /* unused */ 0, FALSE);

/* 首次写入触发缺页 -> 内核向 memobj port 发 pager_request */
*(volatile int *)addr = 42;
```

这对应论文 §4：**pagein/pageout 可由非内核 task 完成**——文件映射把 pager 设为文件系统 server 即可。

## 1986 年 4 月的工程事实

读论文时要区分**愿景**和**当时已跑通的部分**：

| 项目 | 状态 |
|------|------|
| trap、调度、MP 同步、虚存、IPC | 已运行，CMU 多个项目在用（Agora 语音识别、并行生产系统等） |
| Thread 抽象 | **尚未完成**，预计 1986 夏 |
| UNIX 兼容层 | 仍在 **kernel state**（Figure 6 注释） |
| 硬件 | VAX 11/750–8600、MicroVAX I/II、四路 VAX 11/784、IBM RT/PC；同一 VAX 二进制内核映像可跑单机和多机 |
| 移植中 | Sun 3、Encore MultiMax、VAX 8300 |
| 性能 | 整体「看起来与 4.3BSD 同量级」，尚未做系统 benchmark |

## 论文还提到的配套设施

- **Matchmaker**（§6.1）：IDL，把接口编译成 C / Pascal / Lisp 的 RPC stub，底层走 Mach message
- **Network server**（§6.2）：内核不直接做网络 IPC，由用户态 server 扩展 port 语义，支持 VAX / RT/PC / PERQ 间类型转换
- **kdb**（§7.1）：内核内置 adb 式调试器，带增强栈追踪、call/return trace
- **透明远程文件系统**（§7.2）：从 CMU 4.1 演进，用特殊链接类型而非 mount 表膨胀

## 事后看：踩过的坑

1. **IPC 不是免费的**：Mach 3.0 时代纯微内核 IPC 开销显著；L4（1993）用极简内核 + 寄存器传递把 IPC 压到 Mach 的约 **1/10** 时间。1986 论文尚乐观，性能税在 1990 年代成为主批评点。

2. **「内核里的 BSD」是过渡态**：Apple 最终走 **Mach + BSD 混合（XNU）**，不是论文 Figure 6 的纯 user-state UNIX。

3. **网络透明很难**：port 跨节点需要 network server、加密、失败语义——论文提出框架，工程花了十年以上。

4. **Capability 调试成本**：「谁持有哪个 send right」比 Unix fd 更绕，Hurd 长期受此影响。

5. **多处理器演进**：1986 的 VAX MP 与今天 NUMA 差别巨大；锁与 cache 行为在大规模 SMP 上暴露新问题。

## 适用 vs 不适用

**适用**：

- 理解 **macOS/iOS** 底层为何仍有 Mach 接口
- 设计**强隔离**、用户态文件系统、能力安全模型
- 研究 OS 史上 **微内核 vs 宏内核** 争论的原始文献
- 学习 **IPC 与 VM 一体化** 的设计模式（COW 消息、fork）

**不适用**：

- 追求极致单机 syscall 延迟（数据库、HFT）——monolithic Linux 通常更赢
- 小团队从零做通用 OS——Mach 路线工程复杂度极高
- 误以为「微内核 = 更小更快」——论文强调的是**可修改性、可扩展性、统一抽象**

## 与 Accent / UNIX 的谱系

| 系统 | 关系 |
|------|------|
| **Accent**（CMU, ~1981） | Mach 精神父辈：port + message + COW VM |
| **4.3BSD** | 二进制兼容目标；被 Mach 逐步替换底层 |
| **NeXTSTEP / XNU** | 商业直系 |
| **GNU Hurd** | GNU 服务 + Mach user server |
| **L4 / seL4** | 反 Mach IPC 性能问题；保留 message 思想 |

Rashid 后创立 Microsoft Research；Tevanian 经 NeXT 到 Apple——影响路径是 **学术 → 工作站 → 消费电子设备**，而非「赢了数据中心 Linux」。

## 学到什么（零基础 checklist）

1. **换地基，不是堆功能**：BSD 变大后，Mach 用五个抽象划清「该改哪里」。
2. **IPC 和 VM 一起设计**：大消息、fork、共享映射共用 COW，分开设计会付双倍成本。
3. **兼容性是迁移策略**：1986 年就强调 4.3BSD 二进制兼容——研究 OS 没人用等于零。
4. **读 Figure 6 的注释**：目标架构 ≠ 1986 实际架构；thread 未完成、BSD 仍在 kernel。
5. **活下来 ≠ 赢得辩论**：iPhone 里仍有这篇论文的基因；服务器上是 Linux 的天下。

## 延伸阅读

- 论文 PDF：[Mach: A New Kernel Foundation for UNIX Development (USENIX 1986)](https://www.cs.cmu.edu/afs/cs/project/mach/public/www/doc/publications/usenix86.pdf)
- Accent 前身：Rashid & Robertson, *Accent: A Communication Oriented Network Operating System Kernel* (1981)
- VM 与 IPC 集成：Fitzgerald & Rashid, *The Integration of Virtual Memory Management and Interprocess Communication in Accent* (TOCS 1986)
- 性能反思：Liedtke, *On μ-Kernel Construction* (1995) — L4 如何把 IPC 做到 Mach 的十分之一
- 现代混合内核：[[xnu-kernel]] — Apple XNU 如何把 Mach 与 BSD 焊在一起

## 关联

- [[mach-vm-1987]] — 虚存实现细节（address map、VM object、pmap）
- [[xen-2003]] — 另一套「重订 OS 与硬件契约」的思路，走虚拟化而非微内核
- [[kvm-2007]] — Linux 把 hypervisor 收回内核，与 Mach「缩小内核」形成对照
- [[l4-1995]] — 第二代微内核，专治 Mach IPC 性能

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

