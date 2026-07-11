---
title: probe-rs — Rust 写的嵌入式调试烧录工具
来源: 'https://github.com/probe-rs/probe-rs'
日期: 2026-06-24
分类: 嵌入式
难度: 中级
---

## 是什么

想象你买了一台新打印机，但它不像 USB 鼠标那样即插即用——你得装驱动、选端口、对协议，步步不差才能打出第一页纸。嵌入式开发的"调试和烧录"就是类似的过程：你的电脑要通过一根小小的调试器（probe），把编译好的程序"灌"进芯片的 Flash 里，还要能暂停芯片、检查变量、单步执行——这就是调试。传统工具链里，OpenOCD 扮演"万能翻译官"的角色，但它用 C 写成、配置复杂、报错信息像天书。

probe-rs 就是用 Rust 重写的"翻译官"。它直接和调试器硬件对话（J-Link、ST-Link、CMSIS-DAP、FTDI、ESP USB-JTAG、WCH-Link 等），把芯片的内存读写、程序烧录、断点调试、实时日志全部统一成一套干净的 API 和命令行工具。目标是让你在 VS Code 里点一下"运行"，代码就自动编译、烧到芯片里、启动调试——跟写桌面程序一样顺滑。

## 为什么重要

嵌入式调试工具链长期处于"能用但难用"的状态。OpenOCD 需要手写 `.cfg` 配置文件指定芯片型号和调试器类型；Segger 的 J-Link 软件好用但闭源、商用要付费；ST-Link Utility 只认自家芯片。开发者经常花半天时间在"让调试器连上芯片"这件事上，还没开始写业务代码就已经精疲力竭。

probe-rs 解决了三个核心痛点。第一，统一接口：不管你用哪家调试器、哪家芯片，命令和 API 都是同一套。第二，零配置：probe-rs 内置了上千种芯片的 target 定义（从 CMSIS-Pack 自动生成），插上调试器就能自动识别。第三，现代开发体验：原生支持 VS Code 的 Debug Adapter Protocol，RTT 实时日志不需要串口线，cargo 子命令让"编译+烧录+调试"一条命令搞定。

从生态角度看，probe-rs 已成为 Rust 嵌入式生态的事实标准调试工具。Embassy、RTIC 等框架文档都推荐用 probe-rs。GitHub 星标 2.7k，覆盖 ARM Cortex-M/A、RISC-V、Xtensa 三大架构。

## 核心要点

probe-rs 的架构可以分四层来理解。

最底层是调试器驱动层。probe-rs 定义了一个 `DebugProbe` trait，每种硬件调试器（J-Link、ST-Link、CMSIS-DAP v1/v2、FTDI、ESP USB-JTAG、WCH-Link、Blackmagic）都是这个 trait 的一种实现。就像一个万能遥控器——不管电视是什么牌子，遥控器的按钮布局是一样的。

第二层是目标描述层（Target）。每颗芯片的内存布局、Flash 区域大小、烧录算法都不同。probe-rs 用 `target-gen` 工具从 ARM 的 CMSIS-Pack 文件里自动提取这些信息，生成 YAML 格式的 target 定义。目前内置了上千种芯片型号的支持，用户不需要手写任何配置。

第三层是 Session/Core 抽象。`Session` 代表一次和目标芯片的连接会话；`Core` 代表芯片上的一个 CPU 核心。通过 Core 你可以暂停执行（halt）、单步（step）、读写寄存器和内存、设置硬件断点。多核芯片的每个核心都可以独立控制。

第四层是用户工具。probe-rs 提供了 CLI（`probe-rs` 命令）、cargo 子命令（`cargo-flash`、`cargo-embed`）、DAP 服务器（VS Code 调试）、GDB 服务器（兼容传统工具链）。这些工具都是基于底下三层 API 构建的，你也可以直接把 probe-rs 当 Rust 库引入自己的项目。

## 实践案例

最常见的使用场景是"编译并烧录一个 Rust 嵌入式项目"。假设你有一块 STM32F4 开发板和一个 ST-Link 调试器：

```bash
# 安装 probe-rs CLI
cargo install probe-rs-tools

# 编译并烧录（自动检测芯片型号）
cargo flash --chip STM32F411CEUx --release

# 编译、烧录、并打开 RTT 日志窗口
cargo embed --chip STM32F411CEUx
```

`cargo-embed` 读取项目根目录的 `Embed.toml` 配置文件，可以设置 RTT 通道数量、GDB 端口、默认芯片型号等。一个最小配置：

```toml
[default.general]
chip = "STM32F411CEUx"

[default.rtt]
enabled = true

[default.gdb]
enabled = false
```

在 VS Code 里调试更简单。安装 probe-rs 的 VS Code 扩展后，在 `.vscode/launch.json` 里加一段配置，点 F5 就能编译、烧录、命中断点、查看变量——和调试普通桌面程序的体验几乎一样。

probe-rs 还支持作为 Rust 库直接调用。比如你在做自动化测试，需要程序化地烧录固件、读取芯片内存来验证结果：

```rust
use probe_rs::Permissions;

let session = probe_rs::Session::auto_attach("STM32F411CEUx", Permissions::default())?;
let mut core = session.core(0)?;
core.halt(std::time::Duration::from_millis(100))?;
let pc: u32 = core.read_core_reg(core.program_counter())?;
println!("Program counter: {:#010x}", pc);
```

## 踩过的坑

1. **USB 权限问题（Linux）**：在 Linux 上第一次插调试器，probe-rs 会报"permission denied"。这是因为默认情况下普通用户没有 USB 设备的读写权限。解决方法是按 probe-rs 文档添加 udev 规则文件，把调试器的 USB vendor ID 加入允许列表，然后重新拔插设备。macOS 和 Windows 通常不需要额外配置。

2. **芯片型号写错导致"连不上"**：`--chip` 参数必须精确匹配 probe-rs 内置的型号名。比如 `STM32F411CEUx` 和 `STM32F411CE` 是不同的——后者可能找不到。运行 `probe-rs chip list | grep F411` 可以查看所有匹配的型号名。

3. **Flash 算法超时**：某些芯片（特别是大容量 Flash 的型号）在第一次全片擦除时会花很长时间。如果 probe-rs 报 timeout 错误，可以在命令后加 `--speed` 降低通信速率，或在 `Embed.toml` 里增大超时时间。

4. **RTT 和 defmt 版本不匹配**：probe-rs 的 RTT 功能需要固件侧也正确初始化 RTT 缓冲区。如果你用 defmt 做日志，确保 `defmt`、`defmt-rtt`、`probe-rs` 三者版本兼容。版本不匹配时不会报错，只是看不到任何输出——这很容易让人以为代码没跑起来。

## 适用 vs 不适用

适用场景：

- Rust 嵌入式开发的全流程工具链——从烧录到调试到日志查看，probe-rs 一站搞定
- 需要在 CI/CD 中自动化烧录和测试固件——probe-rs 提供库级 API 和 CLI，方便脚本集成
- 使用 ARM Cortex-M/A、RISC-V 或 Xtensa（ESP32）芯片的项目
- 希望在 VS Code 中获得和桌面开发一样的断点调试体验
- 需要 RTT 实时日志但不想接串口线

不适用场景：

- 芯片完全不在 probe-rs 支持列表中（一些极冷门的 8 位单片机、某些国产芯片）——此时只能用厂商专用工具
- 需要高级 JTAG 边界扫描或生产线批量烧录——这类工业级需求通常需要 Segger 的商业工具或专用编程器
- 项目是纯 C/C++ 且团队已熟练使用 OpenOCD+GDB 工作流——probe-rs 也支持 GDB 但切换工具链有学习成本
- 需要在目标芯片上跑操作系统级调试（如 Linux 内核调试）——probe-rs 面向裸机和 RTOS 场景

## 支持的硬件与 OpenOCD 对比

调试器方面：J-Link、ST-Link v2/v3、CMSIS-DAP v1/v2、FTDI、ESP USB-JTAG（ESP32-C3/S3 内置）、WCH-Link、Blackmagic Probe。芯片架构方面：ARM Cortex-M 全系列（覆盖 STM32、nRF、RP2040、LPC、SAM 等）、ARM Cortex-A（部分）、RISC-V（ESP32-C3、GD32V）、Xtensa（ESP32 系列）。传输协议：SWD（2 线，ARM 默认）和 JTAG（4/5 线）。

与 OpenOCD 对比：OpenOCD 是 GDB 服务器，所有功能都通过 GDB 协议暴露；probe-rs 直接提供 Rust API 和原生 CLI，GDB 只是可选兼容层。配置方面，OpenOCD 需手写 `.cfg`；probe-rs 自动检测——"插上就能用"。报错方面，OpenOCD 输出底层协议转储，probe-rs 会说"芯片没响应，可能线没接好"。烧录速度两者持平或 probe-rs 更快。

## 工具生态

probe-rs 不只是一个库，它是一整套工具链：

`probe-rs` CLI 是统一入口，子命令包括 `run`（编译+烧录+运行）、`attach`（连接正在运行的目标）、`download`（烧录固件）、`erase`（擦除 Flash）、`chip`（查询芯片信息）、`dap-server`（启动 DAP 调试服务器）。

`cargo-flash` 是专门用于烧录的 cargo 子命令，适合只想快速烧录不需要调试的场景。`cargo-embed` 功能更全：烧录 + RTT 日志 + 可选 GDB 服务器，通过 `Embed.toml` 配置，适合日常开发迭代。

VS Code 扩展（probe-rs debugger）实现了 Debug Adapter Protocol，支持断点、变量查看、调用栈、外设寄存器查看（通过 SVD 文件）。这是目前 Rust 嵌入式开发者用得最多的调试方式。

`target-gen` 是维护者用的内部工具，从 CMSIS-Pack 文件生成 probe-rs 的芯片描述 YAML。普通用户不需要直接使用，但如果你的芯片还没被支持，可以用它生成描述然后提交 PR。

## RTT 实时日志

RTT（Real-Time Transfer）是 probe-rs 的杀手级功能之一。传统嵌入式日志需要占用一个 UART 串口——你得接线、配波特率、开串口终端。RTT 不需要额外硬件：它利用调试器已有的连接，在芯片 RAM 里开辟一小块环形缓冲区，调试器定期读取这块内存来获取日志。

优点是零额外硬件、不占用 GPIO 引脚、速度远超 UART（可达数 MB/s）。配合 defmt（Rust 嵌入式的高效日志框架），你可以在固件里用 `defmt::info!("温度: {}", temp)` 打日志，probe-rs 会实时解码并显示在终端或 VS Code 面板里。RTT 还支持多通道（一个打日志、另一个传数据）以及双向通信（主机发命令给芯片）。

## 安装与快速开始

安装 probe-rs 最简单的方式是官方安装脚本（Linux 上会自动配 udev 规则）：

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/probe-rs/probe-rs/releases/latest/download/probe-rs-tools-installer.sh | sh
# 或者 cargo install probe-rs-tools
```

验证安装后，在 `.cargo/config.toml` 里设置 runner 就能让 `cargo run` 直接烧录运行：

```toml
[target.thumbv7em-none-eabihf]
runner = "probe-rs run --chip STM32F411CEUx"
```

之后每次 `cargo run --release` 就会自动编译、烧录、启动目标程序并显示 RTT 日志——和开发桌面程序的体验完全一样。

## 学到什么

第一，好的开发者工具应该让"默认路径最简单"。probe-rs 的自动检测、内置 target 定义、零配置 RTT 都体现了这一点——把复杂性留给有特殊需求的用户，让 80% 的场景开箱即用。

第二，"绕过 GDB"是一个勇敢但正确的决定。GDB 协议是 30 年前设计的，承载了太多历史包袱。probe-rs 直接提供原生 API，需要 GDB 兼容时再包一层——这比在 GDB 协议之上叠加功能要灵活得多。

第三，从行业标准（CMSIS-Pack）自动生成代码是对抗碎片化的有效策略。嵌入式世界有上万种芯片型号，手工维护每一种的支持是不现实的。probe-rs 的 `target-gen` 工具让一个人的维护覆盖整个 ARM 生态。

第四，调试工具的报错质量直接决定开发者效率。probe-rs 比 OpenOCD 好很多，但仍有提升空间——好的报错应该告诉用户"下一步该做什么"而不仅仅是"出了什么错"。

## 延伸阅读

- probe-rs 官方文档：https://probe.rs/docs/getting-started/installation/
- VS Code 扩展配置指南：https://probe.rs/docs/tools/debugger/
- The Embedded Rust Book（官方嵌入式入门）：https://docs.rust-embedded.org/book/
- Knurling Tools（defmt + probe-run 日志生态）：https://knurling.ferrous-systems.com/
- CMSIS-Pack 规范：https://arm-software.github.io/CMSIS_5/Pack/html/index.html

## 关联

- [[embedded-hal]] —— Rust 嵌入式硬件抽象标准 trait，probe-rs 调试的固件通常基于 embedded-hal 编写
- [[arduino-cli]] —— Arduino 的命令行工具链，面向 C/C++ 生态，probe-rs 是 Rust 嵌入式的对应角色
- [[micropython]] —— 在单片机上跑 Python，和 probe-rs 面向同一类硬件但完全不同的开发范式
- [[nuttx]] —— POSIX 兼容嵌入式 RTOS，probe-rs 可以用来调试跑 NuttX 的固件
- [[platformio-core]] —— 跨平台嵌入式构建系统，内部调试功能也基于 OpenOCD/J-Link，probe-rs 是更现代的替代
- [[circuitpython]] —— Adafruit 的教育向嵌入式 Python，和 probe-rs 面向不同用户群但同属嵌入式工具链

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[smoltcp]] —— smoltcp — 在没有操作系统的芯片上跑 TCP/IP
