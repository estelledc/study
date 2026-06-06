---
title: embedded-hal — 让同一份驱动代码跑在任意芯片上
来源: 'https://github.com/rust-embedded/embedded-hal'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

embedded-hal 是 Rust 嵌入式生态的**硬件抽象层（HAL）trait 标准**。它定义了 I2C、SPI、GPIO、PWM、Delay 等外设操作的通用接口，让驱动库和芯片实现彻底解耦。

日常类比：想象你买了一个蓝牙音箱，它用的是标准 3.5mm 音频接口——你手机、电脑、MP3 播放器全都能接，不用为每台设备单独买一根线。embedded-hal 就是嵌入式世界的那个"3.5mm 接口标准"：驱动作者面向这套标准写代码，芯片厂商负责把自家硬件插上去，双方各自独立，互不绑定。

没有这套标准之前，一个温度传感器驱动要为 STM32 写一份、为 nRF52 写一份、为 AVR 写一份——接口不同、寄存器地址不同、错误类型也不同，代码无法复用。embedded-hal 出现后，驱动作者只要面向 `embedded_hal::i2c::I2c` 泛型编写，一份代码就能跑在所有实现了这个 trait 的平台上。

```rust
// 驱动只依赖 trait，不依赖任何具体芯片
use embedded_hal::i2c::I2c;

pub struct Sht3x<I2C> {
    i2c: I2C,
    addr: u8,
}

impl<I2C: I2c> Sht3x<I2C> {
    pub fn read_temp(&mut self) -> Result<f32, I2C::Error> {
        let mut buf = [0u8; 6];
        self.i2c.write_read(self.addr, &[0x2C, 0x06], &mut buf)?;
        // 解析温湿度...
        Ok(175.0 * (buf[0] as f32) / 65535.0 - 45.0)
    }
}
```

这段驱动代码在 STM32F4、树莓派、ESP32-C3 上一行不改。

## 为什么重要

不理解 embedded-hal，下面这些现象就没法解释：

- 为什么 crates.io 上 400+ 个嵌入式驱动库能"随便插"到不同芯片——它们都面向同一套 trait 编程，不依赖具体寄存器
- 为什么 Rust 嵌入式社区能以远少于 C 生态的人力覆盖几十种芯片——HAL 实现复用了全部驱动，驱动不用重写
- 为什么 Embassy 异步运行时能"无缝"对接几乎所有主流 MCU——它实现了 embedded-hal-async trait，驱动层感知不到底层差异
- 为什么 embedded-hal v0.2 → v1.0 迁移会导致整个生态震动——核心 trait 签名改变等于"接口标准换版本"，所有上下游同时受影响

## 核心要点

1. **三层分离架构**：应用层（你的逻辑代码）→ 驱动层（面向 trait 的传感器/外设库）→ HAL 实现层（芯片厂商的寄存器操作）。中间层用 Rust 泛型和 trait 约束粘合，编译器在编译期确定具体类型，运行时零开销。类比：USB 标准（embedded-hal）+ 你的鼠标（驱动）+ 主板 USB 控制器（HAL 实现）——标准不变，硬件可以换。

2. **blocking / async / nb 三套执行模型**：embedded-hal 提供阻塞版 trait（同步完成再返回）；embedded-hal-async 提供 `async fn` 版（等待期间让出 CPU）；embedded-hal-nb 提供轮询版（每次调用要么完成要么返回 `WouldBlock`）。驱动作者按需选择，同一平台可同时实现三套，互不冲突。

3. **ErrorType 关联类型保证错误不丢失**：v1.0 中每个 trait 都要求实现 `ErrorType` 关联类型，让调用方能拿到具体芯片的错误信息（如 I2C ACK 失败、SPI 超时），而不是被迫忽略成 `()`。类比：打电话告诉你"出错了，原因是线路繁忙"，而不是"出错了"然后挂断——调试时能看到真正的原因。

## 实践案例

### 案例 1：为温湿度传感器写平台无关 I2C 驱动

```rust
use embedded_hal::i2c::{I2c, SevenBitAddress};

pub struct Shtc3<I2C> {
    i2c: I2C,
}

impl<I2C: I2c<SevenBitAddress>> Shtc3<I2C> {
    pub fn new(i2c: I2C) -> Self {
        Self { i2c }
    }

    pub fn measure(&mut self) -> Result<(f32, f32), I2C::Error> {
        // 发送"唤醒"命令
        self.i2c.write(0x70, &[0x35, 0x17])?;
        // 发送"测量"命令
        self.i2c.write(0x70, &[0x78, 0x66])?;
        // 读取 6 字节结果
        let mut data = [0u8; 6];
        self.i2c.read(0x70, &mut data)?;

        let temp_raw = u16::from_be_bytes([data[0], data[1]]);
        let hum_raw  = u16::from_be_bytes([data[3], data[4]]);

        let temp = 175.0 * temp_raw as f32 / 65535.0 - 45.0;
        let hum  = 100.0 * hum_raw  as f32 / 65535.0;
        Ok((temp, hum))
    }
}
```

**逐部分解释**：
- `I2C: I2c<SevenBitAddress>` 约束：只要平台实现了这个 trait，驱动就能用
- `I2C::Error` 关联类型：错误类型随平台变化，驱动代码不用改
- 在 STM32 上用 `stm32f4xx-hal` 提供的 I2C 实现；在 RP2040 上换 `rp-hal`；驱动代码一行不改

### 案例 2：用 embedded-hal-async 写异步 SPI Flash 读写

```rust
use embedded_hal_async::spi::SpiDevice;

pub struct W25Q64<SPI> {
    spi: SPI,
}

impl<SPI: SpiDevice> W25Q64<SPI> {
    // async fn 让 CPU 在等待传输完成期间可以做其他事
    pub async fn read_id(&mut self) -> Result<[u8; 3], SPI::Error> {
        let mut buf = [0x9F, 0, 0, 0];  // 0x9F 是 JEDEC ID 命令
        self.spi.transfer_in_place(&mut buf).await?;
        Ok([buf[1], buf[2], buf[3]])
    }

    pub async fn read_page(&mut self, addr: u32, out: &mut [u8]) -> Result<(), SPI::Error> {
        let cmd = [0x03, (addr >> 16) as u8, (addr >> 8) as u8, addr as u8];
        self.spi.write(&cmd).await?;
        self.spi.read(out).await
    }
}
```

**逐部分解释**：
- `SpiDevice` trait 内置 CS（片选）管理，不用手动拉低/拉高
- `.await` 让调用方（Embassy 运行时）趁等待时处理其他任务
- 同样的驱动在 Embassy + STM32 和 Embassy + nRF52840 上开箱即用

### 案例 3：用 embedded-hal-bus 在同一条 SPI 总线挂多个设备

```rust
use embedded_hal_bus::spi::{ExclusiveDevice, MutexDevice};
use std::sync::Mutex;

// 用 Mutex 包裹 SPI 总线，允许多个设备共享
let bus = Mutex::new(spi_peripheral);

// 屏幕设备：独占片选 PA4
let display_spi = MutexDevice::new(&bus, display_cs, delay);
// SD 卡设备：独占片选 PA5
let sdcard_spi  = MutexDevice::new(&bus, sdcard_cs, delay);

// 两个驱动各自持有自己的 SpiDevice，互不干扰
let mut display = St7789::new(display_spi, dc, rst);
let mut sdcard  = SdCard::new(sdcard_spi, delay);
```

**逐部分解释**：
- 没有 embedded-hal-bus 时，你只能把总线的 `&mut` 借用权在不同设备间手动传递，极易出错
- `MutexDevice` 把"加锁 → 操作 → 释放片选 → 解锁"封装成原子操作
- 屏幕驱动和 SD 卡驱动各自实现 `SpiDevice` trait 的标准接口，互不知晓对方存在

## 踩过的坑

1. **混用 v0.2 和 v1.0 crate**：v1.0 完全重写了 trait 签名，ErrorType 关联类型、Transaction API 全变了。如果你的 HAL 实现还在 v0.2，而驱动已经升 v1.0，编译器会报"trait 不满足"但错误信息很难看懂——先确认依赖树里所有 embedded-hal 版本一致。

2. **直接持有总线而不是设备**：SPI/I2C 总线常被多个芯片共享，应该持有 `SpiDevice`（封装了 CS 管理）而非裸 `SpiBus`。持有 `SpiBus` 会导致同时只有一个组件能用，且你需要手动管理片选时序，稍有不慎引起总线冲突。

3. **在 no_std 环境用了 std 类型**：embedded-hal 设计为 no_std 兼容，但 `Mutex` 等同步原语需要 OS 支持。裸机环境应用 `critical-section` crate 提供的 Mutex，或 Embassy 的 Mutex，不能直接用 `std::sync::Mutex`。

4. **忘记实现 ErrorType**：v1.0 要求所有 HAL trait 实现者先 `impl ErrorType for MyI2C { type Error = MyError; }`。遗漏这一步会导致整个 I2c/Spi trait bound 无法满足，报错信息绕弯但根因就是这里。

## 适用 vs 不适用场景

**适用**：
- 写可复用的平台无关嵌入式驱动（传感器、显示屏、无线模块等外设驱动库）
- 嵌入式产品需要跨芯片移植（先在廉价开发板上开发，量产时换不同 MCU）
- 用 Embassy + embedded-hal-async 构建低功耗异步嵌入式固件
- 嵌入式 Linux（如树莓派）需要和裸机 MCU 共用同一套驱动生态

**不适用**：
- 只有单一芯片且永不移植的一次性项目——直接用 HAL 实现层更直接，不必引入抽象层
- 需要高度平台特定功能（如芯片独有 DMA 双缓冲、特定定时器模式）——embedded-hal 不覆盖，必须直接操作 PAC/HAL 实现
- 实时性要求极端严格的中断服务例程——泛型抽象虽然零运行时开销，但有时让编译器难以内联，需仔细测量

## 历史小故事（可跳过）

- **2017 年**：Jorge Aparicio 在 Rust 嵌入式邮件列表提出"平台无关 HAL"的设想，认为 Rust 的 trait 系统天然适合做硬件抽象标准。
- **2018 年**：Rust 嵌入式工作组（Embedded WG）成立，embedded-hal 作为工作组旗舰项目，v0.2 逐渐成为社区事实标准，数十个 HAL 实现和驱动围绕它出现。
- **2019–2023 年**："生态碎片化"时期：async Rust 崛起，embedded-hal-async 作为实验性扩展出现；blocking/nb/async 三套接口并行导致社区对 v1.0 设计产生大量讨论，光是"如何设计 ErrorType"就争论了两年。
- **2024 年 1 月**：embedded-hal v1.0 正式发布，结束了五年的"pre-1.0 不稳定"状态。v1.0 稳定了 ErrorType 关联类型、废弃了 nb 全局污染接口，为 Embassy 等异步运行时的大规模落地铺平了道路。

## 学到什么

1. **接口标准比实现更有价值**：embedded-hal 本身代码极少，却撬动了整个生态——正确设计的 trait 接口能让数百个独立开发者的工作互相组合
2. **三层解耦是嵌入式工程的核心原则**：应用 → 驱动 → HAL 实现，每层只依赖上一层的 trait 接口，换芯片只换最底层，驱动和应用代码不受影响
3. **版本稳定性是生态系统的命脉**：v0.2 长期不稳定让整个生态付出了高昂的迁移成本；v1.0 发布后生态才能真正收敛——对于基础库来说，"稳定"比"完美"更重要
4. **Rust 零成本抽象让嵌入式 HAL 没有历史包袱**：C 语言的 HAL 通常要用函数指针，引入间接调用开销；Rust 的单态化泛型在编译期展开，驱动抽象和直接操作寄存器性能相同

## 延伸阅读

- 官方文档：[embedded-hal docs.rs](https://docs.rs/embedded-hal/latest/embedded_hal/)（含设计目标、trait 列表）
- v1.0 公告博客：[embedded-hal v1.0 announcement](https://blog.rust-embedded.org/embedded-hal-v1/)（解释 v1.0 和 v0.2 的区别）
- 驱动生态目录：[awesome-embedded-rust](https://github.com/rust-embedded/awesome-embedded-rust#driver-crates)（400+ 个基于 embedded-hal 的驱动）
- [[embassy]] —— 基于 embedded-hal-async 的异步嵌入式运行时，embedded-hal 最大的下游用户
- [[freertos]] —— C 语言嵌入式 RTOS，与 embedded-hal 的设计哲学形成对比

## 关联

- [[embassy]] —— Embassy 运行时实现了 embedded-hal-async，是当前 Rust 嵌入式异步生态的核心
- [[freertos]] —— 传统 C 嵌入式 RTOS，embedded-hal 的出现让 Rust 嵌入式也有了可比拟的生态复用能力
- [[matrix-rust-sdk]] —— 同为 Rust 生态基础库，展示了 trait 抽象如何在 Rust 项目中构建可组合架构
- [[spin]] —— 嵌入式裸机环境常用的自旋锁，与 embedded-hal 在 no_std 生态中共存
- [[chalk]] —— Rust trait 求解器，理解 embedded-hal 泛型约束如何被编译器解析的底层机制

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[embassy]] —— Embassy — 嵌入式 Rust 的 async/await 运行时
- [[freemodbus]] —— FreeModbus — 嵌入式 Modbus RTU/TCP 从机协议栈
- [[freertos]] —— FreeRTOS-Kernel — KB 级 RAM 跑得动的可抢占多任务内核
- [[matrix-rust-sdk]] —— matrix-rust-sdk — Matrix 客户端的"共享发动机"
- [[probe-rs]] —— probe-rs — Rust 写的嵌入式烧录与调试工具
- [[smoltcp]] —— smoltcp — 不依赖操作系统的 Rust TCP/IP 协议栈
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架

