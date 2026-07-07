---
title: embedded-hal — Rust 嵌入式硬件抽象的统一接口
来源: 'https://github.com/rust-embedded/embedded-hal'
日期: 2026-06-24
分类: 嵌入式
难度: 中级
---

## 是什么

想象你买了一盒乐高积木和一盒拼酷积木。虽然两个牌子的零件看上去差不多，但插口形状不一样——乐高的圆钉插不进拼酷的方孔。每换一个牌子，你已经拼好的作品就得拆掉重来。embedded-hal 做的事情就是制定一套"通用插口标准"：不管积木是哪家出的，只要插口符合标准，都能拼在一起。

具体来说，embedded-hal 是 Rust 嵌入式工作组（rust-embedded WG）维护的一组 **trait 定义**，覆盖了嵌入式开发最常用的外设接口：GPIO（引脚高低电平）、SPI（高速同步串行）、I2C（两线总线）、UART/串口、PWM（脉宽调制）、ADC（模数转换）、延时（Delay）等。它本身**不包含任何硬件驱动代码**——只有接口声明，没有实现。

这套 trait 把"写驱动的人"和"用驱动的人"解耦了。芯片厂商（或社区）针对自家芯片实现这些 trait，传感器/屏幕/电机的驱动库则只依赖 trait 而不依赖具体芯片。结果是：一个 BME280 温湿度传感器的驱动，不改一行代码就能跑在 STM32、nRF52、ESP32、RP2040 上——只要底层 HAL 实现了 `embedded_hal::i2c::I2c` trait。

项目托管在 GitHub rust-embedded 组织下，采用 MIT/Apache-2.0 双许可证，是 Rust 嵌入式生态的基石 crate，累计被超过 1500 个 crate 直接依赖。

## 为什么重要

嵌入式开发最头疼的问题之一是**硬件碎片化**。市面上有成百上千款微控制器，每款的寄存器布局都不同，连"拉高一个引脚"这么简单的操作，在 STM32 和 ESP32 上的代码完全不一样。传统 C 生态的应对方式是每个厂商各自提供 HAL 库（ST 有 STM32 HAL，Nordic 有 nrfx，乐鑫有 ESP-IDF），驱动开发者被迫为每款芯片写一套适配代码。

embedded-hal 用 Rust 的 trait 系统从根本上解决了这个问题。它定义了一层薄薄的抽象，驱动只面向 trait 编程，芯片 HAL 只需实现 trait。这种"面向接口而非实现"的设计，让 Rust 嵌入式生态实现了一个 C 生态至今没有做到的事：**驱动与芯片真正解耦**。

从数字上看，crates.io 上有超过 500 个设备驱动 crate 基于 embedded-hal trait 编写——覆盖温湿度传感器、加速度计、显示屏、GPS 模块、LoRa 射频模块等。换芯片时，只换底层 HAL crate，上层所有驱动和业务逻辑原封不动。这对产品迭代、芯片缺货换料、跨平台复用来说是巨大的工程价值。

另外，embedded-hal 的 trait 设计还让代码**在主机上可测试**。你可以用 `embedded-hal-mock` crate 在 PC 上跑单元测试，不需要真实硬件，这在嵌入式开发中是相当奢侈的能力。

## 核心要点

embedded-hal 的设计思路可以拆成四层来理解。

第一层是 **trait 分类**。整个 crate 把外设接口分成几大模块：`digital`（GPIO 高低电平读写）、`spi`（SPI 主机通信）、`i2c`（I2C 主机通信）、`serial`（UART 串口，在 1.0 版中移至 `embedded-io`）、`pwm`（脉宽调制输出）、`delay`（阻塞延时）。每个模块定义若干 trait，比如 `digital::OutputPin` 只有两个方法：`set_high()` 和 `set_low()`——简单到不能再简单。

第二层是 **阻塞 vs 异步**。embedded-hal 1.0 拆成了两个 crate：`embedded-hal`（阻塞 trait）和 `embedded-hal-async`（异步 trait）。阻塞版的 `spi::SpiDevice::transfer()` 会阻塞当前线程直到传输完成；异步版的同名方法返回一个 Future，可以配合 Embassy 这样的异步执行器使用。两套 trait 的方法签名几乎一样，只差一个 `async` 关键字和返回类型。

第三层是 **错误处理**。每个 trait 都关联了一个 `Error` 类型（通过关联类型 `type Error`），让不同芯片的 HAL 可以返回各自特定的错误信息。比如 I2C 操作可能返回 NACK（设备无应答）、总线忙、仲裁丢失等错误。embedded-hal 定义了 `ErrorKind` 枚举来标准化这些错误类别，驱动代码可以用 `ErrorType::Error: Into<ErrorKind>` 做通用错误处理。

第四层是 **SpiDevice vs SpiBus 的分层**。这是 1.0 版最重要的设计改进之一。`SpiBus` 代表底层 SPI 总线本身（管时钟和数据线），`SpiDevice` 代表总线上的一个具体设备（管片选信号 CS）。一条 SPI 总线可以挂多个设备，每个设备有独立的 CS。这个分层解决了 0.x 版中多设备共享 SPI 总线时的所有权冲突问题——以前需要 `shared-bus` crate 做丑陋的包装，现在 trait 层面直接支持。

## 实践案例

最典型的使用场景是写一个跨平台传感器驱动。假设你要为 BMP280 气压传感器写驱动，这颗芯片通过 I2C 通信：

```rust
use embedded_hal::i2c::I2c;

pub struct Bmp280<I2C> {
    i2c: I2C,
    addr: u8,
}

impl<I2C: I2c> Bmp280<I2C> {
    pub fn new(i2c: I2C, addr: u8) -> Self {
        Self { i2c, addr }
    }

    pub fn read_pressure(&mut self) -> Result<f32, I2C::Error> {
        let mut buf = [0u8; 3];
        self.i2c.write_read(self.addr, &[0xF7], &mut buf)?;
        // 把原始字节转换成帕斯卡值（简化示意）
        let raw = ((buf[0] as u32) << 12) | ((buf[1] as u32) << 4) | ((buf[2] as u32) >> 4);
        Ok(raw as f32 / 100.0)
    }
}
```

注意 `Bmp280` 结构体的泛型参数 `I2C: I2c`——它不关心你用的是 STM32 还是 RP2040，只要传进来的东西实现了 `I2c` trait 就行。在 STM32 上实例化时传 `embassy_stm32::i2c::I2c`，在 RP2040 上传 `embassy_rp::i2c::I2c`，驱动代码**一个字都不用改**。

另一个场景是 GPIO 控制。embedded-hal 的 `digital::OutputPin` trait 只有 `set_high` 和 `set_low` 两个方法，但足以写出跨芯片的 LED 驱动、继电器控制、步进电机方向控制等所有数字输出逻辑。

## 踩过的坑

1. **0.2 到 1.0 的迁移不兼容**。embedded-hal 在 0.2.x 时代被广泛使用，但 1.0 重新设计了大量 trait（SPI 分层、错误类型标准化、移除 serial trait）。很多社区驱动还停留在 0.2 版，如果你的芯片 HAL 已经升级到 1.0，就会出现 trait 不匹配。解决方法是用 `embedded-hal-compat` crate 做版本桥接，或者检查驱动是否有 1.0 兼容分支。

2. **trait 太多容易选错**。新手看到 `SpiDevice` 和 `SpiBus` 两个 trait 会困惑"我到底该实现/使用哪个"。简单记忆：写传感器驱动用 `SpiDevice`（因为驱动只关心"和这颗芯片通信"），写芯片 HAL 底层用 `SpiBus`（因为 HAL 管的是物理总线）。

3. **embedded-hal 不含串口 trait 了**。1.0 版把 UART/串口的 read/write 移到了 `embedded-io` crate，因为串口更像流式 I/O 而非"一次事务"式通信。新手经常在 embedded-hal 1.0 里找不到串口 trait，以为缺了——其实是换了地方。

4. **mock 测试需要额外 crate**。embedded-hal 本身不提供 mock 实现。想在 PC 上写单元测试，需要引入 `embedded-hal-mock` 或 `embedded-hal-nb`（非阻塞适配器），这些都是独立 crate，刚入门时容易漏装。

## 适用 vs 不适用

适用场景：

- 写跨芯片的设备驱动库——只依赖 embedded-hal trait，一份代码支持所有实现了 trait 的芯片
- 希望驱动代码可在主机上做单元测试——配合 mock 实现，不需要真硬件
- 团队需要在多个芯片平台间共享外设驱动——换芯片只换底层 HAL crate，上层不动
- 参与 Rust 嵌入式生态贡献——社区约定所有可复用驱动都基于 embedded-hal trait

不适用场景：

- 需要芯片特有的高级外设功能（如 STM32 的 DMA 链式传输、ESP32 的 ULP 协处理器）——这些超出 embedded-hal 的抽象范围，必须直接用芯片 HAL 的专有 API
- 极度追求零开销的裸机代码——trait 的动态分发（dyn trait）有一点点运行时开销，虽然泛型（静态分发）版本是零开销的，但新手可能不小心引入 dyn
- 用 C/C++ 开发嵌入式——embedded-hal 是纯 Rust 生态，C 项目无法直接使用
- 只做一款芯片、不打算换——如果永远不换芯片，直接用芯片 HAL 的具体 API 反而更简单，不需要 trait 抽象这层间接

## 生态全景

理解 embedded-hal 不能只看它自己，要看围绕它形成的整个分层生态。

最底层是 **PAC（Peripheral Access Crate）**，由 `svd2rust` 工具从芯片厂商提供的 SVD 文件自动生成，提供寄存器级别的读写 API。PAC 是类型安全的，但用起来和直接操作寄存器差不多——你得知道每个位域的含义。

中间层是 **芯片 HAL crate**，比如 `stm32f4xx-hal`、`nrf-hal`、`esp-hal`、`rp-hal`。它们在 PAC 之上封装出人类可读的 API（`uart.write(&data)` 而不是 `USART1.DR.write(byte)`），并且实现 embedded-hal 的 trait。

最上层是 **设备驱动 crate**，比如 `bme280`、`ssd1306`（OLED 屏幕驱动）、`sx127x`（LoRa 射频模块）。它们只依赖 embedded-hal trait，不依赖任何具体芯片。

这三层构成了一个"沙漏模型"：下面是多种芯片 HAL，上面是多种设备驱动，中间最窄的地方就是 embedded-hal trait——它是整个生态的连接点。理解了这个模型，就理解了为什么 embedded-hal 的 trait 设计如此重要：接口定多了，驱动开发者负担重；定少了，无法覆盖常见场景。当前的 trait 集合是社区多年权衡的结果。

## 历史小故事（可跳过）

embedded-hal 的故事要从 2017 年说起。当时 Rust 嵌入式社区刚刚起步，Jorge Aparicio（japaric）发表了一篇博文"Brave New I/O"，提出用 Rust trait 来统一嵌入式外设接口。核心洞见是：Rust 的 trait 和泛型在编译期做静态分发，不像 C++ 虚函数表有运行时开销，天然适合资源受限的嵌入式场景。

最初的 embedded-hal 0.1.0 只有 GPIO 和 SPI 两个 trait，连 I2C 都没有。社区在使用中不断发现痛点——SPI 多设备共享总线时的所有权问题、串口到底算"事务型"还是"流式"接口、错误类型要不要标准化——每一个问题都触发了长时间的 RFC 讨论。

0.2.x 版本稳定后被大规模采用，但设计缺陷也暴露了出来。最典型的是 SPI：0.2 把片选（CS）的管理丢给了驱动开发者，导致多设备共享总线时需要额外的 `shared-bus` crate 来手动加锁。这违反了"让正确的事情容易做、错误的事情难做"的设计原则。

从 0.2 到 1.0 的演进花了将近四年（2020-2024），期间经历了多轮 alpha/beta。1.0 版最大的改进就是 SpiDevice/SpiBus 分层和标准化的 ErrorKind。2024 年初 embedded-hal 1.0.0 正式发布，标志着 Rust 嵌入式生态的接口标准进入稳定期。

## 学到什么

第一，"接口标准"的价值往往大于"最佳实现"。embedded-hal 本身没有一行驱动代码，但它通过定义 trait 让整个生态的 1500+ 个 crate 能互相组合。这就像 USB 标准本身不是设备，但因为有了标准，键盘鼠标充电线才能通用。

第二，trait 是 Rust 在嵌入式领域碾压 C 的关键武器。C 的函数指针也能做"接口抽象"，但没有编译期类型检查，也没有零开销的静态分发。Rust 的 trait + 泛型让你写出"看起来像面向对象多态、跑起来像内联函数"的代码。

第三，好的抽象需要时间打磨。embedded-hal 从 0.1 到 1.0 用了七年，SPI 的 Device/Bus 分层是在实际使用中踩了无数坑后才想明白的。急着发布一个不成熟的抽象，不如先让社区在真实项目中验证。

第四，"阻塞"和"异步"是两种正交的能力维度。embedded-hal 把它们拆成两个 crate 是正确的——有些场景（bootloader、初始化代码）阻塞更简单，有些场景（多任务 IoT）异步更高效。不要强迫一种范式覆盖所有场景。

## 延伸阅读

- embedded-hal 官方文档：https://docs.rs/embedded-hal/latest/embedded_hal/ ——trait 定义和使用说明
- Rust Embedded Book（官方嵌入式入门）：https://docs.rust-embedded.org/book/ ——从零开始的 Rust 嵌入式教程
- Awesome Embedded Rust 驱动列表：https://github.com/rust-embedded/awesome-embedded-rust ——基于 embedded-hal 的驱动和 HAL 实现汇总
- embedded-hal 设计哲学博文：https://blog.rust-embedded.org/embedded-hal-v1/ ——1.0 版设计决策的官方解释
- Embassy 项目（异步嵌入式框架）：https://embassy.dev/ ——embedded-hal-async trait 的主要消费者
- embedded-hal-mock 测试框架：https://crates.io/crates/embedded-hal-mock ——在 PC 上测试嵌入式驱动

## 关联

- [[embassy]] —— Rust 异步嵌入式框架，实现了 embedded-hal 和 embedded-hal-async trait，是 trait 标准的最大消费者
- [[arduino-cli]] —— Arduino 生态的 CLI 工具链，和 embedded-hal 代表了嵌入式的两种哲学：Arduino 追求"开箱即用"，embedded-hal 追求"可组合可替换"
- [[micropython]] —— 用 Python 做嵌入式开发，和 Rust embedded-hal 生态是完全不同的技术路线：解释执行 vs 编译到裸机
- [[circuitpython]] —— MicroPython 的 Adafruit 分支，强调教育友好，和 embedded-hal 的"零开销抽象"目标形成互补
- [[nuttx]] —— POSIX 兼容的嵌入式 RTOS，用 C 实现；embedded-hal 用 Rust trait 实现了类似的跨芯片抽象但更轻量
- [[platformio-core]] —— 跨平台嵌入式构建工具，支持 Arduino/ESP-IDF 等框架，Rust embedded-hal 生态目前用 cargo 而非 PlatformIO
- [[actix-web]] —— Rust 异步 Web 框架，和 embedded-hal 共享 Rust trait 生态但面向服务端，对比两者能看出 trait 在不同领域的抽象策略差异

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[probe-rs]] —— probe-rs — Rust 写的嵌入式调试烧录工具
- [[smoltcp]] —— smoltcp — 在没有操作系统的芯片上跑 TCP/IP

