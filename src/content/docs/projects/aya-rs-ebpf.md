---
title: "Aya：Rust 编写的 eBPF 库 — 零基础入门"
来源: https://github.com/aya-rs/aya
日期: 2026-06-13
分类_原始: 内核与系统编程
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

# Aya：Rust 编写的 eBPF 库 — 零基础入门

## 一、什么是 eBPF？—— 从"交警"说起

想象你正在一条高速公路上。每一辆经过的汽车就是网络数据包。

传统的做法是：在收费站建一个检查站，让每辆车停下来，人工查验。这很慢，因为检查站成了瓶颈。

eBPF（extended Berkeley Packet Filter）的做法完全不同：它在高速公路的护栏上安装了许多"智能感应器"。这些感应器非常小巧，能在汽车呼啸而过的瞬间读取车牌、车型等信息，然后立即做出判断——放行、拦截、还是记录。关键是：这些感应器运行在内核空间里，速度极快，不需要让车停下来。

eBPF 程序不能随便运行。Linux 内核有一个"虚拟机"来运行它们，每次运行前都会用验证器检查程序是否安全（不会死循环、不会越界访问内存）。通过验证的程序才能进入内核执行。

## 二、Aya 是什么？

在 Linux 上写 eBPF 程序，传统上使用 C 语言，搭配 libbpf 或 BCC 等工具链。这意味着你需要：
- 安装 LLVM/Clang 编译器
- 处理复杂的构建流程
- 用 C 写内核侧代码，再用另一种语言写用户态的管理程序

Aya 的出现改变了这一切。**Aya 是一个完全用 Rust 编写的 eBPF 库**。它的核心设计理念是：

1. **纯 Rust**：不依赖 libbpf 或 BCC，只使用 libc 来执行系统调用
2. **CO-RE（Compile Once, Run Everywhere）**：利用 BTF（BPF Type Format），一份编译好的二进制文件可以在不同内核版本上运行，无需重新编译
3. **无 C 工具链依赖**：只需要 Rust 工具链和 bpf-linker
4. **异步支持**：内置 tokio 和 async-std 支持

简单类比：如果把传统 eBPF 开发比作"手工锻造一把剑"（需要熔炉、锤打、淬火），那 Aya 就像是"用 3D 打印机设计并打印一把剑"——你在 Rust 里写一切，Cargo 帮你搞定构建。

## 三、核心概念

### 1. eBPF 程序生命周期

在 Aya 中，每个 eBPF 程序经历三个阶段：

| 阶段 | 操作 | 说明 |
|------|------|------|
| Load | `Ebpf::load_file()` | 从 ELF 文件读取程序，创建所有 Map |
| Load into kernel | `program.load()` | 将程序载入内核，通过验证器检查 |
| Attach | `program.attach()` | 将程序挂载到具体钩子点（网卡、系统调用等） |
| Drop | 变量离开作用域 | 程序自动从内核卸载 |

### 2. Map —— 内核与用户态的桥梁

eBPF 程序运行在内核空间，无法使用标准库，也没有堆内存。Map 是 eBPF 程序中唯一的数据存储方式，用于在内核态和用户态之间共享数据。你可以把它理解为"共享笔记本"——内核侧写入数据，用户态侧读取数据。

### 3. 程序类型（Program Types）

Aya 支持多种 eBPF 程序类型：
- **XDP**（eXpress Data Path）：在网卡驱动层最早拦截数据包，性能最高
- **Cgroup Skb**：在 cgroup 层面过滤网络流量
- **Tracepoint**：追踪内核事件
- **Fentry/Fexit**：追踪函数入口和出口
- **Socket**：绑定到 socket 层

## 四、代码示例

### 示例 1：一个最简单的 XDP 程序（Hello XDP）

这是 Aya 官方教程中的经典例子。分为两个部分：内核侧 eBPF 程序和用户态管理程序。

**内核侧**（`ebpf/src/main.rs`）：

```rust
#![no_std]
#![no_main]

use aya_ebpf::programs::XdpContext;
use aya_ebpf::macros::xdp;
use aya_ebpf::util::from_kernel;
use aya_log_ebpf::info;

use aya_ebpf::helpers::{bpf_get_smp_processor_id};

#[xdp]
pub fn hello_xdp(ctx: XdpContext) -> u32 {
    match process_event(&ctx) {
        Ok(ret) => ret,
        Err(_) => XDP_ABORTED,
    }
}

fn process_event(ctx: &XdpContext) -> Result<u32, u64> {
    // 每收到一个数据包就记录一条日志
    info!(ctx, "received a packet");
    // 返回 XDP_PASS 表示放行数据包
    Ok(XDP_PASS)
}
```

要点：
- `#![no_std]` 和 `#![no_main]`：eBPF 程序不能用标准库，也没有 main 函数
- `#[xdp]` 宏标记了这是一个 XDP 程序的入口点
- 返回值 `XDP_PASS`（=2）表示放行，`XDP_DROP`（=1）表示丢弃，`XDP_ABORTED`（=0）表示异常

**用户态侧**（`src/main.rs`）：

```rust
use std::time::Duration;
use aya::Ebpf;
use aya::programs::{Xdp, XdpMode};
use aya::util::nr_cpus;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    // 1. 从编译好的 ELF 文件加载 eBPF 程序
    let mut ebpf = Ebpf::load_file("ebpf/target/bpfel-unknown-none/release/ebpf")?;

    // 2. 获取名为 "hello_xdp" 的程序
    let program: &mut Xdp = ebpf.program_mut("hello_xdp")?.try_into()?;

    // 3. 将程序载入内核
    program.load("hello_xdp", 0)?;

    // 4. 挂载到网卡接口 eth0
    let iface = std::env::args().nth(1).unwrap_or_else(|| "eth0".into());
    let num_cpus = nr_cpus()?;
    program.attach(&iface, 0)?;

    println!("Waiting for Ctrl-C...\n");
    println!("Loaded program!");
    // 5. 等待中断信号，程序会在退出时自动卸载
    tokio::signal::ctrl_c().await?;

    Ok(())
}
```

这段代码做了四件事：加载 ELF → 获取程序对象 → 载入内核 → 挂载到网卡。当用户按 Ctrl-C 时，程序退出，Aya 自动清理所有资源。

### 示例 2：带 Map 的数据包过滤器

这个例子展示如何使用 Map 在内核和用户态之间共享数据，实现一个简单的"黑名单"防火墙：

```rust
// 用户态侧：动态添加 IP 到黑名单
use aya::maps::HashMap;
use aya::Bpf;

fn main() -> Result<(), anyhow::Error> {
    let mut ebpf = Ebpf::load_file("ebpf.o")?;

    // 获取名为 "blocklist" 的 Map
    let blocklist: &mut HashMap<_, u32, ()> =
        ebpf.map_mut("blocklist")?.try_into()?;

    // 将一个 IP 地址加入黑名单
    let ip_address: u32 = ...; // 将 IP 转为 u32
    blocklist.insert(ip_address, (), 0)?;

    // 获取程序并挂载
    let program: &mut Xdp = ebpf.program_mut("filter")?.try_into()?;
    program.load("filter", 0)?;
    program.attach("eth0", 0)?;

    Ok(())
}
```

对应的内核侧代码：

```rust
use aya_ebpf::maps::HashMap as EbpfHashMap;
use aya_ebpf::programs::XdpContext;

#[derive(Copy, Clone)]
#[repr(C)]
struct Key {
    addr: u32,
}

#[xdp]
pub fn filter(ctx: XdpContext) -> u32 {
    match try_filter(&ctx) {
        Ok(ret) => ret,
        Err(_) => XDP_ABORTED,
    }
}

fn try_filter(ctx: &XdpContext) -> Result<u32, u64> {
    let blocklist: &EbpfHashMap<_, Key, ()> =
        ebpf_map!(ctx, BLOCKLIST, EbpfHashMap);

    let src_ip: u32 = ...; // 从数据包中提取源 IP
    let key = Key { addr: src_ip };

    // 查询黑名单
    if blocklist.contains(&key)? {
        info!(ctx, "blocked packet from {}", src_ip);
        Ok(XDP_DROP)  // 丢弃！
    } else {
        Ok(XDP_PASS)   // 放行
    }
}
```

这里展示了 Map 的核心用途：用户态程序可以动态更新黑名单，而内核态的 eBPF 程序实时查询这个表来做过滤决策。双方共享同一个数据结构，无需额外的 IPC 机制。

## 五、Aya 的项目结构

Aya 本身是一个"monorepo"，包含多个 crate：

| Crate | 职责 |
|-------|------|
| `aya` | 核心库：加载、管理 eBPF 程序的生命周期 |
| `aya-obj` | eBPF 对象的解析和操作 |
| `aya-log` | 用户态日志收集 |
| `aya-log-ebpf-macros` | 内核侧日志宏 |
| `aya-tool` | 命令行工具 |
| `ebpf` | 内核侧程序使用的运行时 |

## 六、为什么选择 Aya？

| 对比项 | 传统 C + libbpf | Aya (Rust) |
|--------|-----------------|------------|
| 语言 | C + 用户态语言 | 纯 Rust |
| 构建依赖 | LLVM, Clang, C 工具链 | Rust + bpf-linker |
| 跨内核兼容 | 需要重新编译 | CO-RE，一次编译到处运行 |
| 内存安全 | 需手动管理 | Rust 所有权系统保障 |
| 编译速度 | 较慢 | 快（秒级） |
| 异步支持 | 无 | 内置 tokio/async-std |

## 七、下一步

如果你想动手试试：
1. 安装 Rust stable 和 nightly：`rustup install stable && rustup toolchain install nightly --component rust-src`
2. 安装 bpf-linker 和 bpftool
3. 用 `cargo generate https://github.com/aya-rs/aya-template` 生成第一个项目
4. 阅读 Aya 官方文档：https://aya-rs.dev/book/

## 参考资料

- GitHub 仓库：https://github.com/aya-rs/aya
- 官方教程：https://aya-rs.dev/book/
- eBPF 官方介绍：https://ebpf.io/what-is-ebpf
- CO-RE 博客：https://facebookmicrosites.github.io/bpf/blog/2020/02/19/bpf-portability-and-co-re.html
