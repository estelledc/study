---
title: Singularity — 用安全语言重想整条软件栈
来源: https://www.microsoft.com/en-us/research/wp-content/uploads/2007/04/osr2007_rethinkingsoftwarestack.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象一栋**老式公寓楼**的物业管理方式：

- **传统 OS**（Windows / Linux / macOS）像「每户独立防盗门 + 保安亭查证件」：硬件 MMU 给每个进程划房间，用户态/内核态切换像每次进出都要刷卡、换钥匙。安全靠墙，但墙本身很贵——创建进程要建页表、切上下文要刷 TLB、`ioctl` 这种万能洞又让规则说不清。
- **Singularity**（微软研究院，2003–2007 前后）问的是：如果今天从零盖楼，而且住户（程序）都承诺**不用锤子砸墙**（类型安全 + 内存安全），还要不要每户都砌实体墙？

论文 *Singularity: Rethinking the Software Stack*（Hunt & Larus，ACM SIGOPS Operating Systems Review，2007 年 4 月，第 41 卷第 2 期，pp. 37–49）给出的答案是：**用软件隔离进程（SIP）+ 契约化通道（contract-based channels）+ 清单式程序（manifest-based programs）**，把「可验证的可靠性」放在性能与旧程序兼容之前。

日常类比再推一步：

| 场景 | 传统 OS | Singularity |
|------|---------|-------------|
| 合租隔断 | 每间房实体墙（MMU 页表） | 室友签合约、物品独占转移（消息传所有权） |
| 插件/驱动 | `dlopen` 往进程里塞代码 | 扩展必须住进**新 SIP**，不能热插代码 |
| 对外通话 | 共享内存 + 锁，或含糊的 `ioctl` | 双端点通道 + **状态机契约**，编译期/安装期可验 |
| 入住登记 | 双击 `.exe` | 提交 **manifest**，系统先验安全属性再启动 |

这不是要替代 Linux 的产品路线，而是一间**可依赖性实验室**：故意放弃旧二进制兼容，换来自由探索「语言 + 工具 + OS 架构」三角联动。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 作者 | Galen C. Hunt、James R. Larus（Microsoft Research Redmond） |
| 场合 | ACM SIGOPS Operating Systems Review，Vol. 41, No. 2，April 2007 |
| DOI | [10.1145/1243418.1243424](https://doi.org/10.1145/1243418.1243424) |
| 项目起点 | 2003 年，核心问题：若**首要目标是可依赖性**而非性能/兼容，软件平台长什么样？ |
| 实现语言 | **Sing#**（C# 扩展），内核 >90% 为类型安全 Sing# |
| 中间表示 | MSIL（.NET CLI），安装时由 Bartok 编译为本地码 |

论文摘要里的三大架构特征：

1. **Software-Isolated Processes (SIPs)** — 用语言安全替代（或补充）硬件保护域
2. **Contract-Based Channels** — 带协议状态机的双向消息通道
3. **Manifest-Based Programs (MBPs)** — 声明式清单描述代码、资源与可验证行为

## 为什么值得零基础读

1. **Rust / WASM / 能力安全系统的思想祖先之一**：「进程 = 封闭对象空间」「通信 = 转移所有权」在 Singularity 里已经工程化，比后来社区讨论早十年。
2. **看清「不安全代码税」（unsafe code tax）**：论文用 WebFiles 基准量化——为 C/C++ 准备的 ring 3 + 独立地址空间，即使程序本身是安全的，也要付 **6%–38%** 量级开销；安全代码的运行时检查开销反而 <5%。
3. **微内核 vs 单地址空间的第三条路**：驱动、协议栈、文件系统都在 SIP 里，但默认可与内核**同 ring 0、同地址空间**——靠软件隔离省钱，需要时再叠硬件保护域（defense in depth）。
4. **契约式 IPC 的工程教训**：网络栈与 Web 服务器之间的 bug 潜伏近一年，契约验证器上线后**数秒内**定位——说明「协议即类型」不是学术装饰。

## 核心概念一：软件隔离进程（SIP）

SIP 像传统进程一样持有线程、内存、安全身份，但隔离机制不同：

- **封闭对象空间**：SIP 之间**不能共享可写内存**；要传数据只能把 exchange heap 里某块内存的**独占所有权**放进消息。
- **封闭代码空间（sealed）**：运行后不能再 `dlopen`、不能 JIT 生成代码进自身；插件/扩展 = **新 SIP**。
- **独立运行时**：每个 SIP 有自己的 GC 与运行时；内核 GC 与进程 GC 通过栈帧边界分隔，互不扫对方指针。
- **软件而非硬件隔离**：多个 SIP 可住在**同一内核态地址空间**；切换不必刷 TLB。

论文 Table 1（AMD Athlon 64 3000+）对比了基本开销（CPU cycles）：

| 操作 | Singularity | Linux | Windows |
|------|-------------|-------|---------|
| API 调用 | 80 | 437 | 627 |
| 线程让出 | 365 | 906 | 753 |
| 消息 ping/pong | 1,040 | 5,800 | 6,340 |
| 进程创建 | 388,000 | 719,000 | 5,380,000 |

SIP 便宜到可以「**一个开发团队 / 一个驱动 / 一个插件 = 一个 SIP**」，故障边界细粒度。

### 代码示例 1：启动子 SIP 并连接通道（概念性 Sing#）

下面不是完整可编译仓库代码，而是论文 ABI 思想的**零基础伪代码**：父 SIP 按 manifest 创建子进程，并把手上的通道端点交给它。

```csharp
// 父 SIP：创建子 SIP，并传入初始通道端点
void SpawnWebServer(NicDevice.Exp deviceEndpoint) {
    // manifest 描述子 SIP 允许运行的 MSIL、ABI 版本、依赖
    Manifest webManifest = Manifest.Load("WebServer.mbp");

    // 子 SIP 启动前就必须拿到通道——没有「事后偷偷连网」
    ChannelEndpoint[] initialChannels = new ChannelEndpoint[] {
        deviceEndpoint,                    // 已协商好的 NicDevice 导出端
        FileSystem.Imp.OpenReadOnly()      // 只读文件系统能力
    };

    Sip child = Kernel.CreateSip(webManifest, initialChannels);
    child.Start();
}
```

要点：

- 能做什么不取决于「进程 UID 够不够」，而取决于**启动时握有哪些 channel 端点**（能力模型）。
- 子 SIP 的代码全集必须在 manifest 里列出；没有 manifest 就不能跑——这是 MBP 思想的前置。

## 核心概念二：契约化通道（Contract-Based Channels）

通道 = **恰好两个端点**的双向、无损、有序消息队列。每个端点同一时刻只属于一个线程；发送把消息 enqueue 到对端。

**契约（contract）** 在 Sing# 里声明：

- 有哪些消息、参数类型、方向（`in`/`out` 或 `!`/`?`）
- **协议状态机**：当前状态下允许哪条消息、下态是什么
- 两端不对称：`C.Imp`（导入端）与 `C.Exp`（导出端）

论文用网卡驱动契约 `NicDevice` 举例：驱动从 `START` 发 `DeviceInfo!`，客户端在 `IO_CONFIGURE_BEGIN` 发 `RegisterForEvents?`，还可**在消息里再传一条** `NicEvents.Exp:READY` 端点——动态长出第二条事件通道，但仍受契约约束。

### 代码示例 2：网卡设备契约（摘自论文 Listing 1，略作格式化）

```csharp
contract NicDevice {
    out message DeviceInfo(...);
    in  message RegisterForEvents(NicEvents.Exp:READY c);
    in  message SetParameters(...);
    out message InvalidParameters(...);
    out message Success();
    in  message StartIO();
    in  message ConfigureIO();
    in  message PacketForReceive(byte[] in ExHeap p);
    out message BadPacketSize(byte[] in ExHeap p, int m);
    in  message GetReceivedPacket();
    out message ReceivedPacket(Packet * in ExHeap p);
    out message NoPacket();

    state START: one {
        DeviceInfo! → IO_CONFIGURE_BEGIN;
    }
    state IO_CONFIGURE_BEGIN: one {
        RegisterForEvents? → SetParameters? → IO_CONFIGURE_ACK;
    }
    state IO_CONFIGURE_ACK: one {
        InvalidParameters! → IO_CONFIGURE_BEGIN;
        Success!         → IO_CONFIGURED;
    }
    state IO_CONFIGURED: one {
        StartIO?    → IO_RUNNING;
        ConfigureIO? → IO_CONFIGURE_BEGIN;
    }
    state IO_RUNNING: one {
        PacketForReceive? → (Success! or BadPacketSize!) → IO_RUNNING;
        GetReceivedPacket? → (ReceivedPacket! or NoPacket!) → IO_RUNNING;
        // ...
    }
}
```

配套的事件契约更短：

```csharp
contract NicEvents {
    enum NicEventType { NoEvent, ReceiveEvent, TransmitEvent, LinkEvent }
    out message NicEvent(NicEventType e);
    in  message AckEvent();
    state READY: one {
        NicEvent! → AckEvent? → READY;
    }
}
```

工程收益（论文原话级别的经验）：

- Sing# 编译器可静态检查「在错误状态 send/receive」
- 独立契约验证器可扫 MSIL，确认程序只使用声明过的契约
- 运行时语义：**发送不失败**，错误只在 receive 侧暴露——简化发送方逻辑
- 与**线性类型 + exchange heap** 结合，大包（磁盘缓冲区、网络包）可 **零拷贝** 在多 SIP 协议栈间传递

## 核心概念三：清单式程序（Manifest-Based Program）

在 Singularity 里用户「运行」的是 **manifest**，不是裸 `.exe`：

- 列出全部可执行 MSIL、ABI 版本、依赖的其他 MBP
- 安装期验证：类型安全、无特权指令、契约一致性、不与已装驱动抢同一硬件资源
- 可内联脚本，也可引用仓库中的共享二进制
- 配合 **Compile-Time Reflection (CTR)**，从 manifest 字段**生成**启动代码，取代传统 `argc/argv` 字符串解析

论文 SB16 声卡驱动例子：`DriverTransform` 读取 manifest 里的 `[IoPortRange(...)]` 声明，生成访问 `IoConfig.DynamicRanges` 的构造函数——驱动变成「自描述工件」。

## 内核与内存：exchange heap

即使零基础，也建议记住一张 mental model（论文 Figure 3）：

```
┌──────── SIP P1 堆 ────────┐     ┌──────── SIP Pn 堆 ────────┐
│  可指向本堆 + exchange    │     │  可指向本堆 + exchange    │
└───────────┬───────────────┘     └───────────┬───────────────┘
            │         ┌── Exchange Heap ──┐   │
            └────────►│ 块同一时刻只有一个   │◄──┘
                      │ SIP 拥有；线性类型   │
                      │ 禁止悬垂指针访问     │
                      └─────────────────────┘
```

- **内存独立不变式**：指针只能指向本 SIP 或本 SIP 在 exchange heap 中**当前拥有**的块
- 通道端点也住在 exchange heap，因为端点会被**当作消息转发**
- 契约状态机每条环至少一次 send + 一次 receive → 队列大小可静态分配 → 零分配通信

ABI 设计刻意**拒绝** `ioctl` / `CreateFile` 式语义含糊的大入口；约 192 个 ABI 函数，但按 Channels、Threads、Exchange Heap 等分域，且**默认最小权限**——SIP 默认只能操纵自身状态与子 SIP。

## 安全模型速写

- **应用即安全主体（principal）**：用户是传统意义上的「应用所扮演的角色」
- 入站通道代表**单一主体**；文件系统 SIP 自行做访问控制
- 可选叠加 **Hardware Protection Domains**：多个 SIP 可塞进同一 MMU 域；也可每个 SIP 一个域（类似 MINIX 3），或内核域里塞驱动（像单体内核但驱动崩溃可隔离）

论文 Figure 5 的 **WebFiles** 结论：全微内核式 ring3 隔离带来 ~37.7%  slowdown，而「关掉安全数组边界检查」只 ~4.7%——**不安全代码税**由所有进程分摊，即使进程本身是 Sing# 写的。

## 与今天技术栈的对照

| Singularity (2007) | 后世回响 |
|--------------------|----------|
| SIP + 所有权消息 | Rust 进程模型讨论、Cap'n Proto、Fuchsia 组件 |
| Sealed process | iOS 禁止 JIT（除浏览器特例）、WASM 模块隔离 |
| Manifest + 安装期验证 | 移动应用签名、Snap/Flatpak manifest、Sigstore |
| MSIL + 验证器 | .NET、JVM，但 Singularity 把验证推到 OS 边界 |
| Contract channels | WSDL/会话类型；现代 RPC 的 schema-first 设计 |
| Typed Assembly Language | Verified compilation、Cranelift 验证研究线 |

Singularity **没有**成为桌面主流 OS——论文 Section 5.1 坦承刻意放弃极致性能与旧兼容。但它的价值在于证明：**当语言、验证器、内核架构一起重画时，进程隔离、IPC、扩展模型可以统一成一套可分析的设计**。

## 阅读路线建议

1. **先读本文 + 微软 Singularity 项目页**（短文，建立 SIP/Channel/Manifest 词汇）
2. **EuroSys 2006**：*Language Support for Fast and Reliable Message Based Communication* — 通道与 Sing# 语言细节
3. **EuroSys 2007**：*Sealing OS Processes*、*Authorizing Applications* — 封闭进程与授权
4. **MSR-TR-2005-135**：*An Overview of the Singularity Project* — 更长技术报告
5. **对比阅读**：L4 微内核（IPC 性能）、seL4（形式化验证）、Xen（隔离与性能权衡）

## 自测题

1. SIP 与硬件保护进程在**创建成本**和**隔离机制**上各有什么不同？
2. 为什么 exchange heap 需要**线性类型**（每块最多一个指针）？
3. `NicDevice` 契约里为什么在 `RegisterForEvents` 里再传 `NicEvents.Exp:READY`？
4. 「不安全代码税」测的是什么？对现代「全内存安全语言」操作系统设计有何启示？
5. Singularity 为何坚持 **sealed process**，宁可每个插件新建 SIP？

## 参考文献

- Hunt, G., & Larus, J. (2007). *Singularity: Rethinking the Software Stack*. ACM SIGOPS Operating Systems Review, 41(2), 37–49. [PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2007/04/osr2007_rethinkingsoftwarestack.pdf)
- Hunt, G., et al. (2005). *An Overview of the Singularity Project*. MSR-TR-2005-135.
- Aiken, M., et al. (2006). *Deconstructing Process Isolation*. MSPC 2006.
- Microsoft Research Singularity Project: https://www.microsoft.com/en-us/research/project/singularity/
