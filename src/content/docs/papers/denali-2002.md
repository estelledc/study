---
title: Denali — 在一台机器上同时跑上千个轻量 VM 的早期实验
来源: 'Whitaker, Shaw, Gribble, "Scale and Performance in the Denali Isolation Kernel", OSDI 2002'
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

Denali 是 2002 年华盛顿大学做的一个**虚拟机监控器**（VMM）。它要回答的问题很直接：能不能在**一台普通服务器上同时跑几千个虚拟机**，每个虚拟机里跑一个**不可信的网络服务**？

日常类比：把数据中心比作一栋写字楼。传统 VMware 的做法像"每位租户单独一套豪华办公室"——隔音好、家具齐，但一栋楼最多容 50 户。Denali 的做法是"上千个胶囊单间"——只够放一张桌子一台电脑，但同一栋楼能塞 5000 户。

它做出来的样子：

- 每个 VM 内存仅 **200KB~2MB**（VMware 同时期至少 32MB 起）
- 单台 1.7GHz Pentium 4 / 1GB RAM 上同时跑 **~10000 个 VM**
- 启动一个新 VM **几十毫秒**完成

核心做法叫 **isolation kernel**（隔离内核）—— 砍掉传统 VMM 里"假装是真硬件"的兼容层，只留隔离所需的最少机制。

## 为什么重要

不读 Denali，下面这些事都没法解释源头：

- **Xen** 2003 年那篇 SOSP 论文为什么敢提 paravirtualization？因为 Denali 已经把数据跑出来了
- **Firecracker** 2018 年给 AWS Lambda 造的 microVM 概念几乎是 Denali 的工程化版——把 VM 做小、做快、做多
- **unikernel**（MirageOS / IncludeOS）"一个 VM 只跑一个应用"的思路 Denali 是先驱
- **AWS Lambda / Cloudflare Workers** 商业模式——成千上万隔离实例同跑——Denali 2002 年就预言了

简单说：今天 serverless 之所以能成立，是因为 20 多年前有人验证了"VM 可以做到这么轻、这么多"。

## 核心要点

Denali 的突破可以拆成 **三招**：

1. **paravirtualization（半虚拟化）**：传统 VMware 假装给 guest OS 一台真 x86 机器（兼容未改 Windows）。Denali 反过来——**改硬件 ISA**，让它对虚拟化友好，guest OS 必须为这个新 ISA 重新编译。换来什么？省掉了模拟 x86 那些"不友好指令"（POPF、CLI 等）的巨大开销。

2. **single-app-per-VM**：每个 VM 里只跑一个定制的小 OS（Denali OS），单进程、单地址空间，没有用户/内核态切换，没有多任务调度。一个 VM 服务一个 web 请求，跑完就丢。

3. **批量优化**：传统 VMM 假设几十个 VM 长期常驻；Denali 假设几千个 VM 短期来去。整个调度器、内存管理、I/O 路径都按"高频创建销毁"重写。

三招合起来：内存占用降 100 倍，并发量升 100 倍。

## 实践案例

### 案例 1：内存差距哪来的

VMware Workstation 跑一个 Linux VM，最少需要：

- guest Linux 内核 ~8MB
- glibc + 基础库 ~20MB
- VMware 自己的 shadow page table、设备模拟 ~10MB
- 加起来 **40MB** 起步

Denali 跑一个 VM：

- Denali OS 内核 ~100KB（砍到只剩 TCP/IP + 调度）
- 应用代码 ~50KB
- VMM 元数据 ~50KB
- 加起来 **200KB** 起步

200 倍差距，主要来自"砍兼容性"而非"压代码"。

### 案例 2：paravirt 的"改 ISA"具体指什么

x86 有几条指令在 ring 3（用户态）执行时会**静默失败**而不是 trap，VMware 不得不二进制翻译扫码替换。Denali 的做法：

```
原 x86 指令      Denali 虚拟 ISA
CLI（关中断）   → idt_off    （明确的 hypercall）
POPF（恢复标志） → vmm_popf   （走 VMM 处理）
IN/OUT（端口）  → vmm_io     （明确的 I/O 调用）
```

每条"麻烦指令"换成 hypercall。guest OS 必须重新编译——但只要愿意改，性能跟裸机几乎一样。

### 案例 3：千 VM 同跑的场景

论文设想的目标用例：**Internet 服务托管**。一个用户上传一段不信任的 CGI 脚本，平台给它分配一个 VM 跑。Denali 的承诺是 "**跑完就杀，下一秒再起一个新的，单机能扛 1000 个并发**"。

20 年后这个设想兑现了 —— 那叫 **AWS Lambda**。

## 踩过的坑

1. **改 ISA = 不能跑未改 OS**。 Denali 的 paravirt 路线最后输给 Xen（也是 paravirt 但保留更多 x86 兼容），又输给 KVM（硬件辅助虚拟化，根本不用改 guest）。**追求极致轻量，代价是生态壁垒。**

2. **ABI 不稳定**。Denali 每升级一次 VMM，虚拟 ISA 就可能微调，guest OS 必须重编译。商业上没人愿意接这种维护负担。

3. **x86 段寄存器限制**。Denali 把 VMM 放高位地址保护起来，guest 可用空间被压缩到 ~3GB。32 位时代将就，64 位时代这问题被硬件辅助绕过。

4. **I/O 延迟**。所有 I/O 走虚拟设备 → VMM → 真硬件，延迟比裸机差几十微秒。对网络服务（吞吐敏感、延迟不敏感）够用，对数据库（延迟敏感）不行。

5. **安全边界没经过严格验证**。论文用规模和性能说话，对"VM 之间到底能不能彻底互不影响"只给了机制描述。后来侧信道攻击（Spectre/Meltdown）证明仅靠"虚拟化 + 小内核"远远不够，需要硬件 + 微码 + 编译器三方配合。

6. **调度器假设过简**。Denali 的调度器假设所有 VM 短命且对等，没考虑优先级、QoS、长寿 VM。云厂商真要落地，调度器必须重写。

## 适用 vs 不适用场景

**适用**：

- 大量短命、隔离的小服务（FaaS / serverless / 不可信代码沙箱）
- 内存预算紧、并发数高的多租户场景
- 控制 guest OS 来源（自家平台，可以强制 guest 重编）

**不适用**：

- 跑商用闭源 OS（Windows / 未改 Linux）—— 必须用 KVM / Hyper-V
- 长生命周期、单 VM 高资源占用的工作负载（数据库主机、CI 构建机）
- 对 I/O 延迟敏感的实时系统

## 历史小故事（可跳过）

- **1999 年**：Stanford 的 Disco / Cellular Disco —— 用 VM 在大 NUMA 机器上跑多个 IRIX。思路是"用 VM 拆大机器"。
- **2002 年**：Denali 反过来 —— "用 VM 拆小服务"。一台机器装上千个 VM，这是第一次。
- **2003 年**：剑桥团队搞出 **Xen**，paravirtualization 被工业化，思路与 Denali 几乎一致但保留更多 x86 兼容。
- **2006 年**：Intel VT-x / AMD-V 出来，**硬件辅助虚拟化**让 paravirt 不再必需，KVM 跟着进 Linux 主线。
- **2013 年**：剑桥再出 **MirageOS** —— "一个 VM 只跑一个应用"被推到极致，叫 unikernel。
- **2018 年**：AWS 公布 **Firecracker** —— 给 Lambda 造的 microVM 监控器，每个 VM ~5MB、125ms 启动。**这就是 Denali 工程化兑现版**。
- **2020 年**：Cloudflare Workers 走另一条路 —— 不用 VM 用 V8 isolate，但隔离粒度更细。这是 Denali 思路的 JS 化变体。

## 学到什么

1. **轻量 vs 兼容是永恒权衡** —— Denali 选了极致轻量，输了主流市场，但思路赢了 20 年后的 serverless
2. **学术系统的价值常在 10 年后体现** —— 2002 年没人觉得需要"千 VM 同跑"，2018 年这成了云计算基石
3. **paravirt → 硬件辅助 → microVM** 是一条完整演化链，理解任一环都得回头读 Denali
4. **隔离最小化原则**：去掉一切非必要的"假装"层，只留隔离本身

## 延伸阅读

- 论文 PDF：[Denali OSDI 2002](https://www.usenix.org/legacy/event/osdi02/tech/full_papers/whitaker/whitaker.pdf)（14 页，扎实）
- [[xen-2003]] —— Xen — Denali 思路的工业化继承者
- [[firecracker-2020]] —— Firecracker — Denali 设想的工程兑现
- [[mirageos]] —— MirageOS — unikernel 路线的代表
- 综述：Bugnion et al. "Bringing Virtualization to the x86 Architecture with the Original VMware Workstation"（ACM TOCS 2012）

## 关联

- [[exokernel-1995]] —— Exokernel 把抽象推给应用层，与 Denali 砍兼容层思路同源
- [[xen-2003]] —— Xen paravirt 是 Denali 思路的直接发扬
- [[firecracker-2020]] —— microVM 是 Denali 千-VM 设想的工程兑现
- [[mirageos]] —— unikernel 是 single-app-per-VM 思路的极端形态
- [[sel4-2009]] —— seL4 同样追求最小内核，但走形式化验证而非虚拟化路线
- [[the-os-1968]] —— Dijkstra THE 系统的分层思想被 isolation kernel 反向应用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[on-demand-container-loading]] —— On-demand Container Loading — Lambda 把大镜像按需搬上车
