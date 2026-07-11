---
title: smoltcp — 在没有操作系统的芯片上跑 TCP/IP
来源: 'https://github.com/smoltcp-rs/smoltcp'
日期: 2026-06-24
分类: 嵌入式
难度: 中级
---

## 是什么

想象你搬进了一间完全没有通电、没有自来水的毛坯房。正常住户等物业装好水电就行了——操作系统就是那个物业，帮你把网络协议栈（水电管线）全配好了。但嵌入式设备是"住在野外帐篷里的人"，没有物业，没有操作系统。如果你想在帐篷里也能打电话（联网），就得自己建一套微型基站。smoltcp 就是这套微型基站：一个完全用 Rust 写的、不依赖操作系统的 TCP/IP 协议栈。

具体来说，smoltcp 是一个独立的、事件驱动的 TCP/IP 协议栈实现，专门为裸机（bare-metal）和实时系统设计。它不需要操作系统、不做堆内存分配（zero heap allocation）、所有缓冲区大小在编译时确定。从以太网帧解析、ARP 地址解析、IPv4/IPv6 路由，到 TCP 可靠传输、UDP 数据报、ICMP ping、DHCP 自动配网、DNS 域名解析——一个 crate 全包了。

项目名字 smol 就是"small"的俚语写法，强调**小而完整**的设计哲学。在与 Linux TCP 协议栈的环回测试中，smoltcp 能跑到约 Gbps 量级吞吐量，证明"小"不意味着"慢"。它在稳定版 Rust 上编译（上游 MSRV 会随版本抬升），采用 0-clause BSD（0BSD）许可证，目前是 Embassy 网络层（embassy-net）的底层引擎，GitHub 约 4.5k star，是 Rust 嵌入式生态中最广泛使用的网络协议栈。

设计上 smoltcp 明确拒绝复杂的编译期技巧（比如重度的宏魔法或类型体操），宁可牺牲一点极致性能也要保持代码的可读性和可审计性。这对安全关键的嵌入式场景来说是正确的取舍——你需要能看懂协议栈在做什么。

## 为什么重要

传统嵌入式设备想联网，选项很有限。要么跑一个完整的 RTOS（如 [[nuttx]]、FreeRTOS）再用它自带的 lwIP 协议栈——但这意味着你得接受 C 语言的内存安全隐患和 RTOS 的资源开销。要么用厂商提供的闭源网络库——但换芯片就得从头来。要么自己从 RFC 开始手撸协议——这条路没人走得通。

smoltcp 填补了一个独特的生态位：**Rust 原生、no_std、零堆分配、开源、跨芯片**。具体好处有三个方面。

内存安全方面，TCP/IP 协议栈处理的都是来自网络的不可信数据——畸形数据包、超长字段、非法校验和。用 C 写的 lwIP 曾多次爆出缓冲区溢出漏洞。Rust 的所有权系统和边界检查在编译期就堵住了这类问题；公开 CVE 记录里 smoltcp 也极少见同类内存破坏通告（仍要以实际审计为准）。

资源可控方面，smoltcp 不使用堆分配，所有 socket 缓冲区、ARP 缓存、路由表大小都是用户在编译时指定的。你能精确计算整个协议栈的 RAM 占用——对只有 64KB RAM 的 MCU 来说，这种确定性是刚需。

生态整合方面，smoltcp 实现了 [[embedded-hal]] 生态中的网络 trait，与 Embassy 异步框架无缝配合。你用 `embassy-net` 写的网络应用，底层就是 smoltcp 在处理 TCP 状态机和分片重组。想用 [[micropython]] 在芯片上跑 Python 网络脚本？它也可以把 smoltcp 当底层传输层。

## 核心要点

smoltcp 的架构分四层，从下往上分别是：物理层抽象、协议解析层、接口层、Socket 层。

**物理层抽象**（Device trait）定义了"怎么收发原始以太网帧"。你只需实现两个方法：`receive()` 返回一帧数据，`transmit()` 发出一帧数据。不同硬件（STM32 的 ETH MAC、ESP32 的 WiFi、Linux 的 TAP 设备、甚至 USB RNDIS）各自实现这个 trait，上层完全不感知差异。

**协议解析层**（wire 模块）负责把原始字节解析成结构化的协议头。设计上它采用"零拷贝视图"——不把字节复制到新的结构体里，而是直接在原始 buffer 上提供带边界检查的访问方法。比如 `Ipv4Packet::new_checked(&bytes)` 会校验长度和校验和，通过后你可以用 `.src_addr()`、`.dst_addr()` 直接读取字段。这种设计既省内存又保证安全。

**接口层**（Interface）是协议栈的大脑。它维护 ARP/NDP 缓存、路由表、IP 地址列表，驱动整个收发循环。每次你调用 `iface.poll()`，它会从 Device 收帧、解析协议头、分发给对应 socket、收集待发数据、封装协议头、交给 Device 发出。这个 poll 模型是事件驱动的——没数据时什么都不做，不浪费 CPU。

**Socket 层**提供了应用程序的编程接口。smoltcp 支持 TCP socket（可靠流式传输）、UDP socket（无连接数据报）、Raw socket（直接收发 IP 包）、ICMP socket（ping/traceroute）和 DHCP socket（自动获取 IP）。每个 socket 有独立的收发缓冲区，你指定缓冲区大小就确定了它的 RAM 占用。

协议覆盖面上，链路层支持以太网 II 帧（含 VLAN 802.1Q tag）和 IEEE 802.15.4（6LoWPAN 短距离无线，常见于 Zigbee 和 Thread 场景）。网络层支持 IPv4（含分片重组、可配置的重组缓冲区超时）和 IPv6（含邻居发现 NDP、无状态地址自动配置 SLAAC），IPv4 和 IPv6 可以同时启用双栈，也可以只启用其中一种来节省资源。传输层支持 TCP（Nagle、窗口缩放、可选拥塞控制、延迟 ACK）和 UDP；**选择性确认 SACK 上游明确未实现**。应用层辅助协议支持 DHCP 客户端、DNS 客户端（A/AAAA）和 IGMP。

尚未实现的功能包括：TCP SACK、TCP 时间戳选项、路径 MTU 发现、IPv6 流标签、IPsec、PPP/PPPoE、mDNS、SNMP。这些大多是"还没人去写"而不是"设计上不支持"——模块化设计让新协议添加相对独立。

内存模型上 smoltcp 零堆分配：ARP 缓存用固定大小数组（满了按 LRU 淘汰最旧条目）、Socket 缓冲区是用户传入的 `&mut [u8]` 切片——你给多大它就用多大、路由表是固定长度数组（通常只需 1-2 条默认路由）。好处是编译时精确算出 RAM 占用，不会有运行时内存不足的意外；代价是动态创建 socket 需要预分配所有缓冲区空间，但对几十 KB RAM 的 MCU 来说这通常不是问题。

事件驱动方面，`poll` 还会返回 `Option<Instant>`，告诉你"下一次有意义的时间点是什么时候"（比如"10ms 后 TCP 重传定时器到期"或"60s 后 ARP 缓存过期"）。你可以据此设定硬件定时器，在此之前让 CPU 进入低功耗睡眠——这种"告诉我什么时候再来"的设计天然适合低功耗嵌入式场景。

通过 Cargo feature flag 控制编译内容：`medium-ethernet` / `medium-ieee802154` / `medium-ip` 选择链路层类型，`proto-ipv4` / `proto-ipv6` 选择网络层，`socket-tcp` / `socket-udp` / `socket-dhcpv4` / `socket-dns` 选择 socket 类型，`log` / `defmt` 选择日志后端（defmt 是嵌入式专用的高效日志格式，比 log 省带宽一个数量级）。最小配置（TCP over IPv4 over Ethernet）约 30-40 KB Flash；加上 IPv6、DNS、DHCP 大约 60-80 KB。

## 实践案例

最常见场景：STM32 + Embassy 上跑 TCP 服务器。`embassy-net` 是 smoltcp 的异步包装：后台 task 调 `iface.poll()`、socket 变成 `.await`、embassy-time 提供单调时钟。下面按四步跟（类型名是教学简化，真实工程以 embassy-net 文档为准）：

```rust
use embassy_net::{Stack, tcp::TcpSocket};

#[embassy_executor::task]
async fn net_task(stack: &'static Stack<Device>) -> ! {
    stack.run().await // 内部调用 smoltcp 的 iface.poll()
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    // 1. 初始化：硬件 MAC + 创建 Stack，并 spawn net_task 持续 poll
    // 2. 开 socket：预分配收发缓冲，RAM 占用编译期就定死
    let mut rx_buf = [0u8; 4096];
    let mut tx_buf = [0u8; 4096];
    let mut socket = TcpSocket::new(stack, &mut rx_buf, &mut tx_buf);

    // 3. accept：等客户端连上（底层 ARP/IP/TCP 握手由 smoltcp 做）
    socket.accept(80).await.unwrap();
    // 4. 读写后 close：写响应，再优雅关闭
    socket.write_all(b"Hello from MCU!\n").await.unwrap();
    socket.close();
}
```

为什么这样拆：步骤 1 保证协议栈有人驱动；步骤 2 用固定缓冲换确定性内存；步骤 3/4 才是业务。缓冲各 4KB 够一般 HTTP；OTA 可提到 8KB。不用 Embassy 时，仓库 TAP 上的 HTTP 示例约 100 行，可先在开发机验证再烧到 MCU（[[probe-rs]] + defmt-rtt）。

注意：embassy-net 通常不能运行时改 IP/路由，切换 DHCP↔静态往往要重建 Stack（借用检查限制）。开发开 `log`/`defmt` 看收发与 TCP 状态；发布关掉可省 Flash。

## 踩过的坑

**poll 频率不够**：smoltcp 的 TCP 重传定时器默认 1 秒超时，但如果你的主循环每 2 秒才 poll 一次，超时检测会延迟，对端可能已经放弃连接。解决办法是根据 `poll` 返回的下一次唤醒时间设定定时器，或者在有网络事件（中断）时立即 poll。

**socket 缓冲区设太小**：TCP 的吞吐量受限于 `min(发送窗口, 接收窗口) / RTT`。如果你给 TCP socket 只分配了 512 字节的收发缓冲区，即使链路是 100 Mbps，有效吞吐量也会被压到极低。一般建议：对延迟敏感的小包场景 1-2 KB 够用；对吞吐量有要求的批量传输（如 OTA 固件下载）至少 4-8 KB。

**没处理 ARP 超时**：smoltcp 的 ARP 请求限速为每秒最多 1 次，缓存条目 60 秒后过期。如果目标 IP 的 ARP 解析失败（比如对端还没启动），你发的 TCP SYN 会被静默丢弃直到 ARP 解析成功。应用层看到的现象是"连接一直没建立"——要检查对端是否在同一子网且已响应 ARP。

**时间戳精度不够**：`iface.poll(timestamp)` 需要一个单调递增的时间戳。如果你传入的时间戳精度只有秒级（比如用 RTC），TCP 的重传和超时计算会非常粗糙。建议用至少毫秒级精度的硬件定时器（SysTick 或通用 TIM），Embassy 的 embassy-time 默认就是微秒级。

**IPv6 启用后内存激增**：IPv6 的 NDP、SLAAC 等功能会额外占用不少 RAM。如果你的产品只需要 IPv4 局域网通信，关掉 `proto-ipv6` feature 可以省下可观的 Flash 和 RAM。只有确实需要 IPv6（比如 Thread/Matter 协议要求）时才启用。

## 适用 vs 不适用场景

**适合**：资源受限的 MCU 联网（STM32 + Ethernet PHY、ESP32、nRF52 + WiFi 模组）；需要确定性内存占用的安全关键场景（医疗设备、工业控制）；已在使用 Rust + Embassy 生态的项目；需要在无 OS 环境下实现 TCP 可靠传输的任何场景；IoT 设备需要通过 MQTT over TCP 上报数据的场景（MQTT 库可以建立在 smoltcp 的 TCP socket 之上）。

**不太适合**：需要完整网络功能的 Linux 级设备（用 Linux 自带的 TCP/IP 栈更合适，见 [[openwrt]]）；需要 PPP/PPPoE 拨号上网的场景（smoltcp 不支持）；需要 IPsec/TLS 加密传输（smoltcp 只到传输层，TLS 需要额外的 crate 如 `embedded-tls` 或 `rustls` 的 no_std 版本）；需要同时维持数百个并发连接的高并发服务器（受限于预分配缓冲区模型）。

与 lwIP 对比：lwIP 支持多线程模型（有内核线程版 tcpip_thread），smoltcp 纯单线程事件驱动。lwIP 需要 `pbuf` 内存池管理（本质是简易堆），smoltcp 零堆分配。lwIP 功能更全（PPP、SNMP、mDNS 等）；smoltcp 核心协议完整，但 **SACK 等高级 TCP 选项仍缺**，选型时要核对上游 README。性能两者接近，通常不是决定因素。

如果项目已在 [[nuttx]]/FreeRTOS 上跑 C，切到 smoltcp 收益不大——迁移成本高于收益。但 Rust 嵌入式新项目几乎是唯一合理选择。

不确定选什么的话，可以用 [[arduino-cli]] 的 WiFi 库快速验证硬件连通性，再切到 Rust + smoltcp 做正式开发。

## 历史小故事（可跳过）

smoltcp 由 whitequark（网名）于 2016 年底发起，2017 年首次发布。whitequark 当时的目标是为 Rust 嵌入式生态提供一个不依赖任何 C 绑定的纯 Rust 网络协议栈。项目早期只支持 IPv4 + TCP + UDP，后来社区逐步添加了 IPv6、DHCP、DNS、6LoWPAN 等支持。

2022 年 Embassy 项目选择 smoltcp 作为网络层引擎后，它的使用量和贡献者数量明显增长。名字里的"smol"（small 的网络俚语）精准概括了它的定位——不是要替代 Linux 协议栈，而是为最小的芯片提供刚好够用的网络能力。

一个有趣的对比：lwIP 诞生于 2001 年，由瑞典计算机科学研究所的 Adam Dunkels 作为博士论文的一部分发布，至今已有 20+ 年历史。smoltcp 则是互联网时代的产物，whitequark 在 GitHub 上公开开发、社区协作演进。两者的发展路径代表了嵌入式网络协议栈从学术研究到开源社区的范式转变。

smoltcp 的开发节奏很有特点：每个 PR 必须通过完整的协议一致性测试套件，包括与 Linux 内核协议栈的互操作性测试。这个严格的 CI 流程确保了每个版本的协议实现都是可靠的。

## 学到什么

smoltcp 让我理解了三件事。第一，网络协议栈不是必须依赖操作系统的——事件驱动 + 零堆分配就能在裸机上跑完整的 TCP/IP，关键是用 poll 模型替代线程模型。

第二，Rust 的类型系统和零拷贝视图设计让协议解析既安全又高效——wire 模块用 `new_checked()` 做边界校验、用方法访问字段，比 C 的防御性 memcpy + 手动边界检查简洁得多。

第三，嵌入式场景下"可预测性"比"极致性能"更重要——编译时确定所有内存占用、拒绝堆分配、拒绝宏魔法，这些设计决策贯穿了 smoltcp 的每一层，保证你在 64KB RAM 的芯片上也能放心用它。

额外的收获是理解了「抽象层不是免费的，但好的抽象层值得付出代价」。embassy-net 在 smoltcp 上加了一层异步包装，看起来增加了复杂度，但它让应用层代码从手动管理 poll 循环中解放出来，让开发者专注于业务逻辑而非协议栈驱动细节。排障时要穿透这层抽象，但日常开发中它极大提升了生产力。

## 延伸阅读

- [smoltcp GitHub 仓库](https://github.com/smoltcp-rs/smoltcp) — 源码 + examples/ 目录有完整示例
- [Embassy 网络教程](https://embassy.dev/book/#_networking) — embassy-net 使用指南，底层就是 smoltcp
- [RFC 793 (TCP)](https://datatracker.ietf.org/doc/html/rfc793) — smoltcp TCP 实现遵循的核心规范
- [smoltcp API 文档](https://docs.rs/smoltcp/latest/smoltcp/) — 架构概述和配置指南
- [lwIP 项目主页](https://savannah.nongnu.org/projects/lwip/) — 传统 C 语言嵌入式协议栈，对比学习的好对象
- [Rust 嵌入式之书](https://docs.rust-embedded.org/book/) — Rust 嵌入式开发入门，理解 no_std 环境的基础

## 关联

- [[embedded-hal]] — smoltcp 的 Device trait 理念与 embedded-hal 的"trait 抽象硬件"一脉相承，驱动只面向 trait 编程
- [[micropython]] — 可以在 MicroPython 的 C 扩展里用 smoltcp 做底层网络传输
- [[nuttx]] — NuttX 自带 lwIP 协议栈，是传统 RTOS 路线下 smoltcp 的替代方案
- [[openwrt]] — OpenWrt 面向路由器级设备，用 Linux 完整协议栈；smoltcp 面向更小的 MCU
- [[probe-rs]] — 调试 Rust 嵌入式程序（含 smoltcp 网络栈）的标准工具链
- [[arduino-cli]] — Arduino 生态用 lwIP；Rust 嵌入式生态用 smoltcp，两条技术路线的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arduino-cli]] —— Arduino CLI — 用命令行管理 Arduino 开发全流程
- [[embedded-hal]] —— embedded-hal — Rust 嵌入式硬件抽象的统一接口
- [[lwip]] —— lwIP — 嵌入式系统的轻量级 TCP/IP 协议栈
- [[mbedtls]] —— Mbed TLS — 嵌入式设备的轻量级 TLS 加密库
- [[micropython]] —— MicroPython — 在巴掌大的芯片上跑 Python
- [[nuttx]] —— Apache NuttX — 把 POSIX 塞进单片机的实时操作系统
- [[openwrt]] —— OpenWrt — 把家用路由器变成 Linux 服务器
- [[probe-rs]] —— probe-rs — Rust 写的嵌入式调试烧录工具

