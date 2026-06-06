---
title: probe-rs — Rust 写的嵌入式烧录与调试工具
来源: 'https://github.com/probe-rs/probe-rs'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

probe-rs 是一套用 **Rust** 写的嵌入式调试工具：它能通过 USB 调试探针（CMSIS-DAP、ST-Link、J-Link 等）连接微控制器，完成**烧录固件、设断点、读内存、单步执行**等操作。

日常类比：给 MCU 写程序像给一台没屏幕的迷你电脑装系统——你需要一根"维修数据线"插到芯片的调试口上。OpenOCD 是老牌万能维修箱，工具多但说明书厚、零件要自己配；probe-rs 像出厂预装好的 Rust 工具箱，插上探针、选对芯片型号，一条命令就能开工。

它既是**库**（别的 Rust 程序可以调用 API 控制探针），也是**工具集**：`cargo-flash` 负责烧录，`cargo-embed` 负责带 RTT/GDB 的调试，`probe-rs` CLI 可以列出探针、查看芯片信息。VS Code 通过 Microsoft Debug Adapter Protocol（DAP）也能直接对接。

```bash
# 列出当前电脑接上的调试探针
probe-rs list

# 用 cargo 扩展一键烧录（编译 + 下载）
cargo flash --release --chip nRF52840_xxAA
```

## 为什么重要

不理解 probe-rs，下面这些事就没法解释：

- 为什么 Rust 嵌入式项目可以用 `cargo flash` 一条命令烧录，而不必手写 OpenOCD 配置文件
- 为什么 VS Code 里能直接给 nRF52 / STM32 设断点——背后往往是 probe-rs 实现的 DAP 调试适配器
- 为什么同一套 Rust 代码既能读 ARM Cortex-M 的 RAM，也能连 RISC-V 内核——probe-rs 在探针协议之上做了统一抽象
- 为什么 Linux 开发板有时不用买 ST-Link，用 GPIO 引脚 bit-bang SWD 也能调试——probe-rs-linux 插件支持这种用法

## 核心要点

probe-rs 的工作可以拆成 **三步**：

1. **发现探针 → 打开 Session**：先用 `Lister` 枚举 USB 上的调试器，选中一个 `open()`，再 `attach("芯片型号")` 建立会话。类比：先找到正确的 USB 转接头，再把它插进目标板的 SWD 四针口——型号对不上，后面全白搭。

2. **通过 SWD/JTAG 控制内核**：Session 里选一个 core，就能 `halt()` 暂停、`run()` 继续、`step()` 单步，还能设硬件断点。底层走 Serial Wire Debug（两线）或 JTAG（多线）协议，probe-rs 屏蔽了各厂商探针的差异。

3. **烧录与 IDE 集成**：下载固件时用 CMSIS-Pack 里的标准 flash algorithm，支持 ELF/BIN/IHEX；上层提供 cargo 子命令、GDB server、DAP 适配器，让命令行和 VS Code 共用同一套引擎。

## 实践案例

### 案例 1：cargo-flash 一键烧录 Rust 固件

写完 `no_std` 程序后，传统流程是：编译出 `.elf` → 写 OpenOCD 脚本 → 手动调用 `openocd` + `arm-none-eabi-gdb`。用 probe-rs 可以合并成一步：

```bash
# 在项目根目录，Cargo.toml 里配好 [package.metadata.probe-rs] 或直接传 --chip
cargo flash --release --chip STM32F401RETx
```

**逐部分解释**：

- `cargo flash` 是 probe-rs 提供的 cargo 子命令，编译完成后自动调用 probe-rs 库下载
- `--release` 表示烧录优化后的固件（体积更小、运行更快）
- `--chip` 必须和 `probe-rs/targets` 里的芯片字符串完全一致，大小写、后缀都不能错
- 探针会被自动检测；多块板子时可用 `--probe` 指定序列号

### 案例 2：用库 API 读取芯片 RAM

自动化测试或产线校验时，你可能需要在主机程序里读 MCU 内存：

```rust,no_run
use probe_rs::{MemoryInterface, Session, SessionConfig};
use probe_rs::probe::WireProtocol;

fn main() -> Result<(), probe_rs::Error> {
    let config = SessionConfig {
        speed: Some(5500),           // SWD 时钟 kHz
        protocol: Some(WireProtocol::Swd),
        ..Default::default()
    };
    let mut session = Session::auto_attach("nRF52840_xxAA", config)?;
    let mut core = session.core(0)?;

    let mut buf = [0u32; 50];
    core.read_32(0x2000_0000, &mut buf)?;  // 从 SRAM 起始地址读 50 个字

    Ok(())
}
```

**逐部分解释**：

- `Session::auto_attach` 自动选第一个可用探针并附着指定芯片
- `speed` 和 `protocol` 控制 SWD 通信速率与协议；速度太高可能不稳定，可从 4000 kHz 试起
- `core(0)` 选第 0 号 CPU 核（多核芯片会有 core 1、2…）
- `read_32` 按 32 位字读内存；写内存用对称的 `write_32` / `write_8`

### 案例 3：VS Code 图形化断点调试

probe-rs 实现了 Microsoft DAP，VS Code 安装对应扩展后，`.vscode/launch.json` 里配置 `"type": "probe-rs-debug"`，即可在编辑器里：

- 点击行号设断点
- 查看局部变量和寄存器
- 单步跳过 / 步入函数

这比纯 GDB 命令行友好得多，且与 `cargo-embed` 共用同一套 probe-rs 后端——烧录和调试不需要换工具链。

## 踩过的坑

1. **Linux udev 权限**：探针能被 `lsusb` 看到但 `probe-rs list` 为空，或 `open()` 报 Permission denied——通常是 udev 规则没装。按官方文档添加规则后重新插拔 USB。

2. **芯片名字符串必须精确**：`attach("nRF52840_xxAA")` 少一个字母或用了 CubeMX 里的别名都会失败。用 `probe-rs chip list` 查官方支持的完整名称。

3. **STM32 内存区域数据曾不可靠**：CMSIS-Pack 自带的 flash/RAM 边界多次出错，导致烧录写到错误地址。probe-rs 现在依赖 [[embassy]] 生态的 stm32-data 校正；STM32 项目升级 probe-rs 后若仍异常，先确认 target 文件版本。

4. **冷门芯片没有 CMSIS-Pack**：没有现成 flash algorithm 时，probe-rs 无法直接烧录。需要用官方 flash-algorithm-template 手写算法并注册自定义 target——这是进阶路径，不是开箱即用。

## 适用 vs 不适用场景

**适用**：

- Rust 嵌入式（`no_std` + Embassy / [[embedded-hal]]）需要简单可靠的烧录与调试
- 已有 CMSIS-DAP / ST-Link / J-Link 探针，想摆脱复杂的 OpenOCD 配置
- 需要在 CI 或自动化脚本里用 Rust API 批量读写 MCU 内存
- VS Code 用户希望图形化断点调试 ARM / RISC-V 目标

**不适用**：

- 只有 OpenOCD 专属脚本且团队不愿迁移——OpenOCD 仍支持更多冷门探针和复杂 JTAG 链
- 芯片完全没有 CMSIS-Pack 且没人愿意写 flash algorithm
- 需要深度 JTAG 链调试（多 TAP、复杂拓扑）——OpenOCD 在这方面历史更久
- 纯 Python 生态且已深度绑定 pyOCD 的工作流——迁移成本可能高于收益

## 历史小故事（可跳过）

- **早期**：Rust 嵌入式社区需要统一的探针接口；probe-rs 起步时参考 pyOCD 源码理解 ARM 烧录流程（README 里公开致谢）。
- **target 生成**：芯片描述来自 ARM CMSIS-Pack 搜索库，由 `target-gen` 工具批量生成放进 `probe-rs/targets`。
- **STM32 转折**：官方 pack 的内存映射多次被证明不可靠，项目转向 stm32-data 作为更可信的数据源。
- **工具扩展**：从纯库演进为 cargo-flash、cargo-embed、VS Code DAP、GDB server，形成完整工具链。
- **现状**：GitHub 约 2.7k star，Apache-2.0 / MIT 双许可，社区在 Matrix 频道活跃维护。

## 学到什么

1. **调试探针 + 统一库** 可以比"万能但难配的脚本工具"更适合现代语言生态——Rust 嵌入式需要 Rust 原生的烧录路径
2. **CMSIS-Pack 是事实标准**：flash algorithm 和芯片描述都围绕它，probe-rs 的成功依赖标准而非重复造轮子
3. **三层分工清晰**：底层探针协议 → 中间 Session/Core API → 上层 cargo/IDE 集成，每层可以独立替换
4. **硬件数据也会错**：STM32 内存映射教训说明，即使官方 pack 也要交叉验证，工具链需要可更新的 target 数据库

## 延伸阅读

- 官方文档：[probe.rs 文档站](https://probe.rs/docs/)（安装、cargo-flash、cargo-embed、排错指南）
- 排错专题：[Troubleshooting](https://probe.rs/docs/knowledge-base/troubleshooting)（权限、探针识别、常见 attach 失败）
- API 参考：[docs.rs/probe-rs](https://docs.rs/probe-rs)（库层 Session、MemoryInterface 完整接口）
- [[embedded-hal]] —— Rust 嵌入式驱动抽象标准，与 probe-rs 互补（一个管运行时外设，一个管烧录调试）
- [[embassy]] —— 常用 async 嵌入式框架，Embassy 项目与 probe-rs 同属 Rust embedded 生态

## 关联

- [[embedded-hal]] —— 驱动层 trait 标准；probe-rs 管"怎么把程序送进芯片"
- [[embassy]] —— async 嵌入式运行时；烧录后 Embassy 程序常通过 probe-rs 下载
- [[freertos]] —— 传统 RTOS 方案；若固件是 FreeRTOS + C，仍可用 probe-rs 烧录，只是调试体验取决于 ELF 符号
- [[zephyr]] —— 另一种 RTOS；Zephyr 有自己的 west flash，但 probe-rs 可作为通用 SWD 后端
- [[platformio-core]] —— 多框架嵌入式 IDE；PlatformIO 也集成多种 upload 协议，与 probe-rs 解决同类问题
- [[arduino-cli]] —— 上层烧录工具；Arduino 生态偏 AVR/ESP，probe-rs 更专注 ARM/RISC-V 专业调试
- [[buildroot]] —— 嵌入式 Linux 构建；产线烧录 Linux 镜像通常用别的工具，但 bring-up 阶段调试 MCU 仍可能需要 probe-rs

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

