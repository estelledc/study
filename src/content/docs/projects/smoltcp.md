---
title: smoltcp — 不依赖操作系统的 Rust TCP/IP 协议栈
来源: 'https://github.com/smoltcp-rs/smoltcp'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

smoltcp 是一个**完全不依赖标准库（no_std / no-alloc）的事件驱动 TCP/IP 协议栈**，专为裸机（bare-metal）和实时嵌入式环境设计。

日常类比：把 smoltcp 想成一个精心设计的积木盒。普通网络栈（Linux 内核协议栈）是已经搭好的城堡——功能强大但不能拆。smoltcp 把每块砖头（协议、缓冲区、Socket）都交给你自己组装，装好多少、分配多少内存，全由你决定，装完了才能用。

smoltcp 支持以下协议：ARP、IPv4、IPv6、ICMP、TCP（含拥塞控制、乱序重组）、UDP、DHCP、DNS。所有缓冲区都由用户在编译期/启动时静态分配，协议栈本身不做任何堆分配（`alloc`）。运行时只需周期性调用 `iface.poll()` 驱动整个协议栈的状态机。

在 Linux loopback 模式下，smoltcp 实测吞吐量可达 3–8 Gbps；在 Cortex-M 单片机上也能跑通，是 Embassy（Rust 嵌入式异步框架）的官方网络后端。

## 为什么重要

不理解 smoltcp，下面这些事没法解释：

- 为什么嵌入式 Rust 代码可以发出真正的 TCP 连接，即使芯片上根本没有操作系统
- 为什么 Embassy 异步嵌入式框架能做到 DHCP + TCP 同时运行，却不需要 RTOS 调度器
- 为什么在 Linux 用户态就能模拟完整网络协议栈行为，完全不修改内核
- 为什么 Rust 生态能在没有 `std` 的情况下做到网络通信——smoltcp 是这条路的基石

## 核心要点

smoltcp 运行的核心可以拆成三步：

1. **静态分配所有资源**：你在代码里写死"我要几个 TCP Socket、发送缓冲区多大、接收缓冲区多大"。类比：旅行前把行李箱大小固定好，装不下的东西不带。这一步在编译期或初始化期完成，之后不再动态分配。

2. **事件驱动轮询（poll 模型）**：smoltcp 没有内部线程，没有中断处理——你每次调用 `iface.poll(timestamp)` 时，协议栈就处理所有挂起的收包/发包和"状态机"转换，然后返回。这里**状态机**的意思是：TCP 连接内部有一套像红绿灯一样的固定状态序列（等待握手 → 握手中 → 数据传输 → 关闭中 → 已关闭），smoltcp 每次 poll 都把所有 socket 的状态往前推进一步。类比：餐厅服务员不会主动送餐，你按一下桌上的按钮，他来处理所有待办事项然后离开。

3. **时间戳由用户提供**：smoltcp 不读系统时钟，你必须自己传入"现在是什么时间"（一个 `Instant`）。TCP 的超时、重传、保活计时全依赖这个时间戳。类比：厨房的计时器需要你手动按下开始——它不会自己启动。

## 实践案例

### 案例 1：STM32 单片机上的 TCP Echo Server

在没有 OS 的 Cortex-M 芯片（ARM 架构的低功耗单片机）上，通过以太网 PHY（负责将数字信号转换为网线上电信号的芯片）接收 TCP 连接并把数据原样回传。

```rust
use smoltcp::iface::{Config, Interface, SocketSet};
use smoltcp::socket::tcp::{Socket as TcpSocket, SocketBuffer};
use smoltcp::time::Instant;
use smoltcp::wire::{EthernetAddress, IpAddress, IpCidr, Ipv4Address};

// 静态分配缓冲区（编译期确定大小）
let mut rx_buf = [0u8; 2048];
let mut tx_buf = [0u8; 2048];
let tcp_socket = TcpSocket::new(
    SocketBuffer::new(&mut rx_buf[..]),
    SocketBuffer::new(&mut tx_buf[..]),
);

let mut sockets = SocketSet::new([]);
let tcp_handle = sockets.add(tcp_socket);

loop {
    // 从以太网 PHY 收包，交给协议栈
    let timestamp = Instant::from_millis(get_system_ms() as i64);
    iface.poll(timestamp, &mut device, &mut sockets);

    // 处理业务逻辑
    let socket = sockets.get_mut::<TcpSocket>(tcp_handle);
    if socket.is_active() && socket.may_recv() {
        let mut echo_buf = [0u8; 256];
        let n = socket.recv(|buf| {
            let len = buf.len().min(echo_buf.len());
            echo_buf[..len].copy_from_slice(&buf[..len]);
            (len, len)
        }).unwrap();
        socket.send_slice(&echo_buf[..n]).ok(); // echo back
    }
}
```

**逐部分解释**：

- `SocketBuffer::new(&mut rx_buf[..])` — 缓冲区由栈上数组提供，零堆分配
- `get_system_ms()` — 用户负责提供时间戳，可以是硬件定时器读数
- `iface.poll(timestamp, ...)` — 一次 poll 处理所有挂起事件，包括 ARP/TCP 握手/重传
- `socket.recv(...)` — 从接收缓冲区读数据，闭包里处理后返回消费字节数

### 案例 2：Linux 用户空间 TUN/TAP 调试协议栈

无需 root 权限修改内核，用 TUN/TAP 接口在用户空间跑 smoltcp，测试自定义协议行为。

```rust
use smoltcp::phy::{TunTapInterface, Medium};

// 创建 TUN 接口（Linux 用户态虚拟网卡）
let mut device = TunTapInterface::new("tap0", Medium::Ethernet).unwrap();

// 配置 IP 地址
let config = Config::new(EthernetAddress([0x02, 0x00, 0x00, 0x00, 0x00, 0x01]).into());
let mut iface = Interface::new(config, &mut device, Instant::now());
iface.update_ip_addrs(|ip_addrs| {
    ip_addrs.push(IpCidr::new(IpAddress::v4(192, 168, 69, 2), 24)).unwrap();
});

// 正常的 poll 循环即可
loop {
    let timestamp = Instant::now();
    iface.poll(timestamp, &mut device, &mut sockets);
    // ... 处理 socket 事件
}
```

**逐部分解释**：

- `TunTapInterface::new("tap0", ...)` — 连接到操作系统的虚拟网卡 tap0，无需内核模块
- 用这种方式可以在开发机上完整验证协议栈逻辑，之后再烧录到单片机
- smoltcp 的 `phy` 层是可替换的，同一套协议逻辑可接不同底层驱动

### 案例 3：DHCP 客户端自动获取 IP

嵌入式设备上线时自动从路由器获取 IP 地址，再发起 DNS 解析和 HTTP 请求。

```rust
use smoltcp::socket::dhcpv4::{Socket as DhcpSocket, Config as DhcpConfig};

let dhcp_socket = DhcpSocket::new();
let dhcp_handle = sockets.add(dhcp_socket);

loop {
    iface.poll(Instant::now(), &mut device, &mut sockets);

    let dhcp_socket = sockets.get_mut::<DhcpSocket>(dhcp_handle);
    if let Some(config) = dhcp_socket.poll() {
        // DHCP 分配成功，更新 IP 和路由
        iface.update_ip_addrs(|addrs| {
            addrs.clear();
            addrs.push(IpCidr::new(config.address.into(), config.address.prefix_len)).unwrap();
        });
        if let Some(router) = config.router {
            iface.routes_mut().add_default_ipv4_route(router).unwrap();
        }
        println!("Got IP: {}", config.address);
    }
}
```

**逐部分解释**：

- `DhcpSocket::new()` — DHCP 客户端 socket，自动处理 DISCOVER/OFFER/REQUEST/ACK 状态机
- `dhcp_socket.poll()` — 返回 `Option<Config>`，有值说明获取到了 IP
- 整套流程不阻塞，DHCP 成功前继续 poll，成功后立即配置到 iface

## 踩过的坑

1. **忘记更新时间戳**：smoltcp 的 TCP 超时和重传全依赖用户传入的 `Instant`，如果你的 `get_system_ms()` 返回常量或者忘了更新，TCP 连接会卡死——对端等超时，本端永不超时，陷入死锁。

2. **Socket 缓冲区分配太小**：TCP 有一个"窗口"机制——接收方告诉发送方"你最多一次给我发多少字节"。smoltcp 的接收缓冲区直接决定这个窗口大小：如果缓冲区只有 256 字节，窗口就只有 256 字节，对端发完后必须等你读完才能继续发，吞吐量直接归零，但连接不会断——最难查的 bug 之一。

3. **ARP 冷启动必然丢一个包**：ARP（地址解析协议）负责把 IP 地址翻译成网卡的硬件地址（MAC 地址）——类似问路"192.168.1.1 是哪家？"。首次向一个新 IP 发送数据时，smoltcp 先发出 ARP 请求，原始数据包被丢弃。等 ARP 应答回来，协议栈才能重发。上层如果没有重试逻辑，第一个包就永远丢了。

4. **no-alloc 模式下 Socket 数量是编译期常量**：所有 socket 占用静态内存，SocketSet 容量在初始化时确定。如果你用光了 RAM/Flash 预算，需要仔细计算每个 socket 的缓冲区开销，不能运行时动态扩容。

## 适用 vs 不适用场景

**适用**：

- 裸机 / RTOS 环境下的网络通信（Cortex-M、RISC-V 单片机）
- 用户空间网络协议栈开发和调试（TUN/TAP 模式）
- Embassy、WASM 等无 std 运行时的网络支持
- 对延迟和内存占用有极端要求的嵌入式产品
- 需要完整 TCP 特性（拥塞控制、保活、乱序重组）但又不能用内核协议栈的场景

**不适用**：

- 服务端高并发场景（smoltcp 单线程，不是性能优化的首选）
- 已有完整操作系统的场景（直接用 OS 网络栈更省事）
- 需要 TLS/DTLS 直接集成（需要外部库如 `embedded-tls`）
- 不熟悉网络协议细节的快速原型——错误排查需要理解 ARP/TCP 状态机

## 历史小故事（可跳过）

- **2016 年前后**：whitequark（Catherine）创建 smoltcp，初衷是为 Rust 嵌入式生态提供一个设计目标是"简洁优先"而非"功能齐全"的网络栈，以 0BSD 许可开放。
- **2018–2020 年**：Rust 嵌入式工作组（embedded WG）将 smoltcp 纳入官方推荐生态，`embedded-hal` 标准化后大量 HAL 实现开始对接 smoltcp 驱动接口。
- **2021–2022 年**：Embassy 项目（Rust 嵌入式异步框架）选择 smoltcp 作为官方网络后端，smoltcp 的 `async` 适配随之快速成熟。
- **2024 年**：smoltcp 达到 4.3k stars，支持协议范围涵盖 DHCPv4/v6、DNS、ICMPv6 邻居发现，已有数十个商业嵌入式产品在生产中使用。

## 学到什么

1. **"不依赖 OS"不等于功能弱**：smoltcp 实现了完整的 TCP 拥塞控制和 DHCP，证明协议栈功能和 OS 依赖是正交的——关键是把资源分配的控制权交还给用户
2. **静态分配是约束也是优势**：没有动态内存意味着没有碎片、没有分配失败的运行时崩溃，嵌入式系统的可预测性来自这种约束
3. **poll 模型比中断模型更容易推理**：smoltcp 的事件驱动 poll 比异步中断更容易在 Rust 类型系统里建模，也更容易和 Embassy 的 async executor 集成
4. **时间戳注入是一种接口设计哲学**：smoltcp 不假设任何时钟源，把时间的获取责任留给调用者——这让它可以在任何芯片上运行，也是"no_std 设计"的精髓

## 延伸阅读

- 官方文档与示例：[smoltcp GitHub README](https://github.com/smoltcp-rs/smoltcp)（含 TUN/TAP 运行示例和协议支持清单）
- Embassy 网络后端：[embassy-net](https://embassy.dev/book/dev/net.html)（基于 smoltcp 的 async 封装，适合 Cortex-M 异步开发）
- 协议栈设计文章：[Let's write a TCP stack in Rust](https://miro.hashnode.dev/writing-a-tcp-stack-in-rust)（从零理解为什么需要 smoltcp 这样的设计）
- [[embassy]] —— Rust 嵌入式异步框架，smoltcp 的上层集成
- [[embedded-hal]] —— Rust 嵌入式 HAL 抽象，smoltcp 驱动接口的底层规范
- [[tcp]] —— TCP 协议本身，smoltcp 实现的核心协议
- [[warp]] —— 对比：有 OS 时的 Rust 网络层如何设计
- [[freertos]] —— 对比：RTOS 方式下的嵌入式网络

## 关联

- [[tcp]] —— smoltcp 的核心实现对象，TCP 状态机逐字节实现
- [[embassy]] —— smoltcp 的主要用户，Embassy 的 `embassy-net` 直接包装 smoltcp
- [[embedded-hal]] —— 嵌入式 HAL 标准，smoltcp 的物理层驱动遵循这套接口
- [[freertos]] —— 对比：FreeRTOS 用 lwIP 作为协议栈，smoltcp 提供 Rust 原生替代
- [[warp]] —— 对比：有 OS 托底时，Rust 网络服务直接用 tokio/warp；smoltcp 是裸机替代
- [[mqtt-s-2008]] —— MQTT-SN 常部署在和 smoltcp 相同的低功耗嵌入式场景
- [[mptcp-2012]] —— 与 smoltcp 的单路 TCP 对比，MPTCP 扩展了多路径能力

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

