---
title: eBPF — 用户写小程序，内核证明安全后再跑
来源: 'McCanne & Jacobson, "The BSD Packet Filter: A New Architecture for User-level Packet Capture", USENIX Winter 1993; Starovoitov 2014 起在 Linux 主线扩成 eBPF'
日期: 2026-05-30
分类: 操作系统
难度: 中级
---

## 是什么

eBPF（extended Berkeley Packet Filter）是**让你写一段小程序，扔进 Linux 内核，由内核先证明它安全再跑**的通用机制。日常类比：像安检——你想带液体上飞机，安检不会问"你是谁"，而是用机器扫一遍，证明无害才放行。

你写：

```c
SEC("tracepoint/syscalls/sys_enter_openat")
int trace(struct trace_event_raw_sys_enter *ctx) {
    bpf_printk("pid=%d opened file\n", bpf_get_current_pid_tgid() >> 32);
    return 0;
}
```

`clang` 把它编成 BPF 字节码 → `bpf()` syscall 加载 → 内核 verifier 静态扫一遍证明"不会越界、不会死循环、不会读写不该碰的内存" → JIT 成 x86 原生码 → 挂在 `openat` 入口。每次有进程打开文件，这段代码就跑一次，**不会让内核崩**。

这就是 eBPF：**一种用机器证明替代代码 review 的内核扩展通路**。

## 为什么重要

不理解 eBPF，下面这些事都没法解释：

- 为什么 Cilium 一个项目就能替代 iptables、kube-proxy、Calico 网络层——单核 24M 包/秒是怎么做到的
- 为什么现代 Linux 监控（bpftrace / bcc / Falco / Tetragon）几乎都长成 "一行命令拿到内核细节" 的样子
- 为什么 Linus Torvalds 死活不让 DTrace 进 Linux，但放行了概念几乎一样的 eBPF
- 为什么 30 年前一个给 tcpdump 用的 11 页论文，今天会变成"Linux 唯一可信第三方内核扩展机制"

## 核心要点

eBPF 的工作流程可以拆成 **三步**：

1. **加载 + verifier 证明**：用户态发 `bpf()` syscall 提交字节码。verifier 把程序当一张**控制流图**走一遍，跟踪每个寄存器的类型 / 值范围 / 指针边界，禁止 unbounded loop。证明不了就拒绝加载。类比：把代码送进"数学检察官"，过不了就回家改。

2. **JIT + 挂 hook**：通过 verifier 的字节码翻成 x86/arm64 原生指令，挂到指定的 hook 点（XDP / tc / kprobe / tracepoint / cgroup / LSM 等）。从此每次 hook 触发都跑你的程序，性能接近原生 C。

3. **map 是唯一动态内存**：BPF 程序栈只有 512 字节、不能 `malloc`。所有跨调用的状态、所有 user↔kernel 通信都走 map（hash / array / lru / ringbuf 等 30+ 种）。这是 verifier 能保证 "不会内存泄漏" 的关键约束。

三步合起来，eBPF 把 "用户能不能给内核加东西" 这个 30 年悬案改成了 "可以加，前提是过证明"。

## 实践案例

### 案例 1：一行 bpftrace 取代 strace

想看某个进程在打开什么文件，传统方式 `strace -f -e openat`：开销大、要 attach 进程。bpftrace：

```bash
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_openat
  { printf("%s -> %s\n", comm, str(args->filename)); }'
```

一行字符串被 bpftrace 编成 BPF 字节码、挂到 `sys_enter_openat` tracepoint。内核每次有进程调 `openat`，这段代码就跑、把 `(进程名, 文件名)` 推到 ringbuf。**全机器观察、零侵入、几乎没开销**。

### 案例 2：最小 kprobe + ringbuf 程序

挂 `sys_enter_execve`，把每个新进程的 pid + 命令推到用户态：

```c
struct {
  __uint(type, BPF_MAP_TYPE_RINGBUF);
  __uint(max_entries, 256 * 1024);
} events SEC(".maps");

SEC("tracepoint/syscalls/sys_enter_execve")
int trace_exec(void *ctx) {
  struct event { u32 pid; char comm[16]; };
  struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
  if (!e) return 0;             // ringbuf 满了就丢
  e->pid = bpf_get_current_pid_tgid() >> 32;
  bpf_get_current_comm(&e->comm, sizeof(e->comm));
  bpf_ringbuf_submit(e, 0);
  return 0;
}
```

用户态开 `ring_buffer__poll()` 循环读，得到一台机器上**所有 exec 调用**的实时流。这就是 `execsnoop` 工具的核心。

### 案例 3：Cilium 用 XDP 替代 iptables

k8s service 想做负载均衡，传统路径：包 → netfilter → conntrack → iptables 长链表 → DNAT → 转发。链路长、单核 ~1M pps 上限。

Cilium 的做法：在网卡驱动 RX 最早的位置（`xdp_buff` 还没分配 skb）挂一段 XDP 程序，查 lpm_trie / sockmap 找 backend、改写 dst IP/MAC、`XDP_TX` 直接送出去。**完全绕开 conntrack 和 iptables，单核 ~24Mpps**。这就是 Cilium 能替代 kube-proxy 的根本原因。

## 踩过的坑

1. **verifier 复杂度上限 1M insns 听着多，实际频频撞墙**：写中等规模 BPF 程序时，verifier 报 `BPF program is too complex` 是家常便饭。"安全"是用"表达力受限"换的——Cilium 早期反复因此拆程序成多个 sub-prog 用 tail call 串起来。

2. **栈只有 512 字节、不能 malloc**：想存 1KB buffer？不行。所有跨调用的、超 stack 的、需要共享的数据都得走 map。新人写第一个 BPF 程序经常因为局部变量超 512B 被 verifier 直接拒绝。

3. **跨 map 没有事务**：单 map 单 op 是 lock-free 安全的，但两个 map 之间的更新没有原子性。Cilium 这种用 ~50 个 map 的项目要靠 generation number + retry 自己模拟事务，文档不会告诉你这个隐性负担。

4. **verifier 自己有 bug**：CVE-2021-3490 / CVE-2022-23222 是 verifier 算错了导致用户能加载本不该通过的程序，反过来攻击内核。"verifier 保证安全"不是绝对保险——verifier 复杂度爆炸自己成了新的攻击面。

## 适用 vs 不适用场景

**适用**：

- observability / tracing：bpftrace / bcc / pixie，"内核里看一切" 的标准方案
- 容器网络数据面：Cilium 替代 iptables / kube-proxy / 部分 Calico 用法
- 高性能 L4 LB：Katran / Cilium LB 扛大流量入口
- runtime security：Falco / Tetragon 用 LSM hook 做策略执行
- 内核 / 应用调试：临时挂 kprobe 看一段代码到底怎么走的

**不适用**：

- 应用业务逻辑：能在用户态跑就别下沉，eBPF 是为"必须在内核态拿信息 / 必须在内核态做决定"准备的
- HTTP 解析 / TLS 终止 / 复杂 L7 协议：BPF 程序受限太多，做这些得回到用户态
- 老内核（4.x 之前 / 没 BTF）：CO-RE 用不了，每个 kernel 版本都要重编译，运维负担大
- 不能信任的 BPF 程序：verifier 仍有 CVE 历史，跑别人的 BPF 程序仍要走 trust review

## 历史小故事（可跳过）

- **1993 年**：Steven McCanne 和 Van Jacobson 在 USENIX Winter 发 11 页论文，造了一个 32-bit accumulator 的小虚拟机给 tcpdump 用，把抓包从 60μs/包降到 4μs。verifier 一眼能看完——单趟扫指令流确认 jump 都向前、mem 访问都在 scratch 范围。
- **2003 年**：Sun 在 Solaris 加 DTrace，思路完全一致，但因 CDDL license 被 Linus 拒进 Linux。
- **2014 年**：Alexei Starovoitov 一次 commit `bd4cf0e` 把 cBPF 升 64-bit ISA、加 call 指令、扩复杂 verifier、把 hook 从 socket filter 扩到所有子系统，eBPF 诞生。
- **2017 年**：Cilium 1.0 发布，eBPF 第一次走进生产容器网络。
- **2019-2020 年**：Brendan Gregg 出书《BPF Performance Tools》，ringbuf 和 CO-RE 进主线，eBPF 走完最后一公里。

之后 5 年，Linux 第三方内核扩展的现实路径就是 eBPF——LKM 没人敢装、SystemTap 边缘化、DTrace 没合并。

## 学到什么

1. **用机器证明替代代码 review** 是 2020s 安全计算的主旋律——eBPF / WASM sandbox / Cloudflare Workers 都是这套思路
2. **静态分析的工业落地** 长这样：抽象解释 + 状态剪枝 + 硬复杂度上限，理论保险 + 工程兜底
3. **"安全" 永远要付代价**：eBPF 用 "表达力受限" 换 "内核安全"，写起来比 LKM 难，但不会写崩整机
4. **30 年持续演化** 比 "一次性革命" 更可能成功——1993→2014→2024 三代人接力，每代解决一类问题

## 延伸阅读

- 视频：[Brendan Gregg — eBPF Superpowers](https://www.youtube.com/watch?v=wprm8eNfkLE)（45 分钟把 observability 用法过一遍）
- 入门书：[Brendan Gregg《BPF Performance Tools》(2019)](https://www.brendangregg.com/bpf-performance-tools-book.html)（Ch1-Ch3 是最好的中文世界外的入门材料）
- 原始论文：[McCanne-Jacobson 1993 USENIX](https://www.tcpdump.org/papers/bpf-usenix93.pdf)（11 页，看 Figure 4 的小 VM 和 Figure 6 的 verifier）
- 现代起点：[ebpf.io/what-is-ebpf](https://ebpf.io/what-is-ebpf/)（架构总览 + 各子系统索引）
- 自己写：[libbpf/libbpf-bootstrap minimal example](https://github.com/libbpf/libbpf-bootstrap)（~100 行写一个能跑的 BPF 程序）

## 关联

- [[tcp]] —— Van Jacobson 同时是 TCP 拥塞控制三人组之一；30 年后 eBPF 又能用 struct_ops 实现自定义 TCP CC 算法
- [[tls-1.3]] —— Cilium 想做 L7 加密观测时撞上的边界：TLS 终止仍要回用户态
- [[chubby]] —— 同样是"少数人决定大量人靠不靠谱"的基础设施，但 chubby 靠 Paxos，eBPF 靠 verifier
- [[llvm]] —— BPF 程序的 frontend：clang 把 C 编成 BPF 字节码靠的就是 LLVM 的 BPF backend
- [[lambda-calculus]] —— verifier 做的事本质是"小语言的可判定类型推断"，与 HM / λ-演算同一谱系

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[andromeda-2018]] —— Andromeda — Google Cloud 网络虚拟化的高速通道
- [[capsicum-2010]] —— Capsicum — 给 UNIX 进程发"通行证"而不是"万能钥匙"
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[freertos]] —— FreeRTOS-Kernel — KB 级 RAM 跑得动的可抢占多任务内核
- [[ghost-2021]] —— ghOSt — 把 Linux 调度策略搬到用户态去写
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[llvm]] —— LLVM — 模块化编译器框架
- [[pivot-tracing-2015]] —— Pivot Tracing — 让运维事后想测什么就测什么
- [[shenango-2019]] —— Shenango — 每 5 微秒重新分一次核的中央调度器
- [[solana]] —— Solana — Rust 写的高性能 PoH 链
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[wireguard-2017]] —— WireGuard — 4000 行代码重写 VPN 的极简主义

