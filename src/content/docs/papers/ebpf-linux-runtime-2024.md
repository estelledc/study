---
title: The eBPF Runtime in the Linux Kernel — Linux 内核可编程运行时零基础导读
来源: https://arxiv.org/abs/2410.00026
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

## 先想成什么事

想象 Linux 内核是一座**戒备森严的政府大楼**：

- 普通应用只能在大厅（用户态）办事，**不能随便改大楼内部的线路和规则**。
- 传统做法是写**内核模块**——相当于雇施工队砸墙改管线：能力强，但改错一根线整栋楼停电（内核 panic），而且每次升级大楼都要重新审批施工方案。
- 另一派做法是**绕过内核**（DPDK、用户态网络栈）：在大楼外面搭临时工棚，性能极高，但失去了大楼原有的安保、水电分摊和统一管理。

**eBPF** 的做法是：在大楼里装一套**带安检的临时工位系统**——

1. 你在用户态写好一份「微型脚本」（eBPF 程序）；
2. 加载时必须经过**安检仪**（verifier）静态分析，证明你不会越权、不会死循环、不会乱碰内存；
3. 通过后由 **JIT** 翻译成原生机器码，挂到内核预设的**事件挂钩**（hook）上；
4. 事件发生时（收包、系统调用、函数入口……）你的脚本在**内核态**以接近原生的速度跑一小段逻辑，然后交还给原有内核流程。

论文作者（Gbadamosi、Leonardi、Pulls、Høiland-Jørgensen 等，基于 **Linux 6.7**，2024 年 9 月 arXiv）称：这是**第一篇**系统描述 Linux 内核 eBPF 运行时设计与实现的综述，覆盖从加载、验证、JIT 到典型用例与开放挑战。

> 论文澄清了一个常见误解：**eBPF 的设计并非直接继承 Classic BPF**，名字只是为了熟悉感；它是一套面向通用内核可编程的寄存器虚拟机。

## 为什么需要 eBPF

### 直接改内核的痛点

| 问题 | 具体表现 |
|------|----------|
| 开发与调试难 | 内核代码库庞大，改一行要懂子系统全局 |
| 部署成本高 | 换内核要重启机器，冷启动、回归测试，车队 rollout 以周/月计 |
| 稳定性风险 | bug 直接导致整机崩溃，生产直接等于宕机 |
| API 不稳定 | 未上游化的补丁每次内核升级都要 forward-port |

### 绕过内核的代价

Kernel bypass（如专用 poll 模式网卡驱动）和 library OS 能把性能榨到极致，但通常需要**独占硬件**、**重写应用**，且多工作负载**难以共享**同一台机器——对跑在 Linux 上的大规模生产 fleet 并不总是可接受。

### eBPF 的定位

论文概括为三条设计原则：

1. **安全、动态的内核定制** —— 在虚拟机沙箱里改行为，不破坏内核完整性；
2. **快速部署与迭代** —— `bpf()` 加载/卸载，无需 reboot；
3. **与内核协同** —— 可以 fallback 到原有内核逻辑，不必整段重写网络栈或调度器。

eBPF 自 **Linux 3.18（2014）** 合入主线，到 6.7 已支撑网络、追踪、安全、调度等整条产品线。

## 核心概念

### 1. eBPF 虚拟机与字节码

eBPF 是一套**抽象虚拟机** + **64 位指令集**（算术、跳转、load/store、原子操作、函数调用）：

- **11 个 64 位寄存器** `r0`–`r10`，其中 `r10` 只读、指向栈顶；
- 固定大小栈；
- 程序由若干 **subprog**（类似函数）组成，从 main subprog 开始执行。

指令集刻意**贴近真实硬件 ISA**，方便 JIT 做接近 1:1 的翻译，也让 LLVM 后端能生成高效字节码。

### 2. 运行时组件（论文 Figure 1）

```text
用户态                内核态
─────────            ─────────────────────────────────
C/Rust 源码  ──clang──► .o (BPF ELF)
     │                      │
libbpf/bpftool ──bpf()──►  Verifier ──► JIT/解释器
     │                      │              │
     │                      ▼              ▼
     └── map fd ◄──────  Maps ◄──────  Hook 触发执行
```

| 组件 | 作用 |
|------|------|
| **用户态 Loader**（libbpf、BCC、bpftool） | 编译、解析 ELF、调用 `bpf(BPF_PROG_LOAD)` |
| **Verifier** | 加载前静态分析，拒绝不安全程序 |
| **JIT / 解释器** | 验证通过后翻译为机器码（无 JIT 时解释执行） |
| **Hooks** | 挂载点：XDP、tracepoint、kprobe、LSM、cgroup…… |
| **Program Type** | 决定可用 helper、上下文结构、合法挂载点 |
| **Helpers** | 内核提供的「系统调用」，如打日志、改包、查 map |
| **Maps** | 内核与用户态、程序与程序之间的共享数据结构 |
| **Links** | 把程序挂载与 fd 生命周期绑定，进程退出后 probe 仍可存活 |
| **BTF** | 紧凑类型信息，供 verifier 做类型检查 + CO-RE 重定位 |

### 3. 对象生命周期

每个 eBPF 对象（program、map、link）在内核有对应表示，通过 **fd** 暴露给用户态：

- 最后一个 fd 关闭 → 内核释放对象；
- 可 **pin** 到 `bpffs` 伪文件系统 → 跨进程持久化。

### 4. BTF 与 CO-RE

**BPF Type Format (BTF)** 是专为 eBPF 设计的调试/类型格式，比 DWARF 紧凑一个数量级，因此可以**随内核和程序一起发布**。

**CO-RE（Compile Once – Run Everywhere）** 利用 BTF 在加载时解析结构体字段偏移、内核配置项，使**同一份编译产物**能在不同内核版本上运行——无需为每个目标内核重新编译。

### 5. Verifier：四道关卡

论文将验证分为四个 major pass：

| Pass | 内容 |
|------|------|
| 1. CFG 校验 | DFS 遍历控制流图，禁止无法证明终止的循环、不可达指令 |
| 2. 符号执行 | 逐路径追踪寄存器/栈的类型与边界，强制内存/资源/类型安全 |
| 3. 优化与改写 | 死代码消除、helper 内联（如 map 访问特化） |
| 4. JIT | 生成只读可执行镜像，可选 constant blinding 防 JIT spraying |

**State pruning**（借鉴 RWSet 思想）在分支爆炸时剪枝等价状态，否则稍大的程序就会撞上「指令复杂度上限」。

### 6. 安全属性（论文 §5）

Verifier 力求保证：

- **内存安全** —— 无越界、无任意指针解引用、无 UAF；
- **类型安全** —— 借助 BTF 校验内核结构体访问；
- **资源安全** —— 退出前释放内存、锁、引用计数；
- **信息泄漏安全** —— 内核指针不能泄露到用户可见区域；
- **无数据竞争**（对内核状态）—— 通过 helper 同步；
- **可终止** —— 复杂度上限 + 有界循环展开；
- **无死锁** —— 同一时刻最多持有一把 bpf spinlock；
- **执行上下文不变量** —— 不破坏 hook 所在内核代码的假设。

### 7. 典型工作流（论文 Figure 3）

1. **S1** 用 C 写程序（带 `SEC("xdp")` 等段属性）；
2. **S2** `clang -target bpf` 编译成 BPF ELF；
3. **S3–S4** libbpf/bpftool 经 `BPF_PROG_LOAD` 提交，verifier + JIT；
4. **S5** `BPF_LINK_CREATE` 挂到网卡 XDP 等 hook；
5. 事件触发执行；**S6–S7** 关闭 link/program fd 卸载。

## 代码示例一：XDP 丢弃 UDP（论文 Listing 1）

下面这段与论文中的 XDP 示例同构——在网卡驱动层收到包时，丢弃所有 **IPv4 UDP** 流量，其余 `XDP_PASS`：

```c
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/udp.h>

SEC("xdp")
int bpf_program(struct xdp_md *ctx)
{
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    struct ethhdr *eth = data;
    /* verifier 要求：每次指针运算前比较边界 */
    if (eth + 1 > data_end)
        return XDP_PASS;

    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return XDP_PASS;

    struct iphdr *iph = (void *)(eth + 1);
    if (iph + 1 > data_end)
        return XDP_PASS;

    if (iph->protocol == IPPROTO_UDP)
        return XDP_DROP;

    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
```

**零基础要盯住的点：**

- `data` / `data_end` 界定包缓冲区；`if (ptr + 1 > data_end)` 是 **verifier 能证明安全** 的标准写法；
- `SEC("xdp")` 告诉 loader 这是 XDP 程序类型；
- 返回值 `XDP_DROP` / `XDP_PASS` 决定包命运。

加载与挂载（现代 libbpf 风格，概念示意）：

```bash
clang -O2 -g -target bpf -c xdp_drop_udp.c -o xdp_drop_udp.o
bpftool prog load xdp_drop_udp.o /sys/fs/bpf/xdp_drop_udp
bpftool net attach xdp id <PROG_ID> dev eth0
```

## 代码示例二：tracepoint + map 统计 syscall

第二个例子展示 **tracing** 与 **map** 协作——统计 `execve` 次数，用户态定期读取：

```c
/* trace_execve.bpf.c */
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, __u64);
} exec_count SEC(".maps");

SEC("tracepoint/syscalls/sys_enter_execve")
int trace_execve(void *ctx)
{
    __u32 key = 0;
    __u64 *val = bpf_map_lookup_elem(&exec_count, &key);
    if (val)
        __sync_fetch_and_add(val, 1);
    return 0;
}

char _license[] SEC("license") = "GPL";
```

用户态读取（libbpf skeleton 或 bpftool）：

```c
/* 简化示意：map fd 由 loader 打开 */
int map_fd = bpf_obj_get("/sys/fs/bpf/exec_count");
__u32 key = 0;
__u64 count = 0;
bpf_map_lookup_elem(map_fd, &key, &count);
printf("execve count: %llu\n", count);
```

这里体现了论文强调的 **Maps 作为用户态/内核态数据交换通道**，以及 **tracepoint hook** 的低开销观测能力。

## 主要应用场景（论文 §10）

| 领域 | 代表能力 |
|------|----------|
| **网络** | XDP/TC 高性能包处理、sk_lookup、reuseport 选型、cgroup 策略、自定义拥塞控制 |
| **Profiling** | perf 事件 + 栈采样，Cilium/Pixie 等连续剖析 |
| **Tracing** | kprobe/tracepoint 访问函数参数，bcc/bpftrace 生态 |
| **安全** | LSM BPF 可编程强制访问控制、审计 |
| **新兴** | HID-BPF 驱动片段、SCHED_EXT/ghOSt 可编程调度、XRP 存储加速 |

Cloudflare、Cilium、Meta、Google 等已将 eBPF 用于 DDoS 清洗、Kubernetes 网络策略、生产级可观测和安全基线。

## 与「改内核 / 绕过内核」的对比

```text
                安全性    部署速度    性能      与内核集成
内核模块          低        慢        高          深
Kernel bypass     中        中        极高        弱
eBPF              高        快        高          深（可 fallback）
```

eBPF 不是要取代内核子系统，而是让你在**不重启、不 fork 内核源码**的前提下，把策略和观测逻辑「插」在关键路径上。

## 挑战与未来方向（论文 §11）

1. **易用性** —— hook 选型门槛高，文档与工具链仍在快速演进；
2. **Verifier 可扩展性** —— 循环体带分支时路径爆炸，复杂程序常被拒；
3. **Verifier 正确性** —— 实现庞大、变更频繁，逻辑 bug 可能放过恶意程序；
4. **形式化验证** —— 数值域、JIT 正确性已有部分工作，全 verifier 形式化仍是开放问题；
5. **安全模型** —— 非特权 eBPF 默认关闭；`CAP_BPF` 细化了权限，但许多程序类型仍需 `CAP_NET_ADMIN` 等；
6. **代码复用** —— 有 CO-RE，但跨文件静态/动态库支持仍弱。

## 学习路径建议

1. **先跑起来**：`bpftrace -e 'tracepoint:syscalls:sys_enter_execve { @[comm] = count(); }'` 感受零编译观测；
2. **读内核文档**：[BPF 文档](https://docs.kernel.org/bpf/index.html)、[bpf-helpers(7)](https://man7.org/linux/man-pages/man7/bpf-helpers.7.html)；
3. **用 libbpf + CO-RE**：`clang -target bpf -g` 生成带 BTF 的 `.o`，`bpftool btf dump` 查看类型；
4. **对照论文 Figure 1–5** 理解 verifier → JIT 流水线；
5. **选一个垂直深入**：网络从 XDP 开始，观测从 tracepoint 开始，安全从 LSM BPF 开始。

## 关键术语速查

| 术语 | 一句话 |
|------|--------|
| eBPF | 内核内的安全可编程虚拟机运行时 |
| Verifier | 加载前静态分析器，安全守门人 |
| JIT | 把字节码编译为原生指令 |
| Hook | 程序被事件触发执行的挂载点 |
| Map | 内核与用户态共享的 KV/数组等结构 |
| BTF | 紧凑类型/debug 信息格式 |
| CO-RE | 一次编译、多内核版本加载 |
| XDP | 网卡驱动层最早的可编程包处理点 |
| libbpf | 官方推荐的用户态加载库 |

## 总结

这篇论文的价值在于：把散落在内核源码、邮件列表和各类 slide 里的 eBPF 知识，**第一次**整理成从虚拟机模型、对象生命周期、verifier 四 pass、JIT hardening 到生产用例的完整地图。对零基础读者，抓住三条线就够了：

1. **编程模型** —— C/Rust → BPF 字节码 → verifier → JIT → hook；
2. **安全模型** —— 不是「信任开发者」，而是「证明器必须接受才运行」；
3. **工程模型** —— 与内核共生、热加载、CO-RE 跨版本，而不是另起炉灶。

eBPF 让 Linux 从「只能调旋钮的内核」变成「带安检的可编程内核」——理解这套运行时，是读懂现代云原生网络、可观测性和内核安全产品的钥匙。

## 参考

- 论文：[arXiv:2410.00026](https://arxiv.org/abs/2410.00026)（v2，2024-10）
- DOI：[10.48550/arXiv.2410.00026](https://doi.org/10.48550/arXiv.2410.00026)
- 内核文档：[eBPF 子系统](https://docs.kernel.org/bpf/index.html)
- 指令集规范：[eBPF ISA](https://docs.kernel.org/bpf/standardization/isa.html)
