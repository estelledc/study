---
title: Embassy — 嵌入式 Rust 的 async/await 运行时
来源: 'https://github.com/embassy-rs/embassy'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

Embassy 是一套让你在**没有操作系统**的微控制器上，用 Rust 的 `async/await` 写并发程序的框架。日常类比：传统嵌入式编程像一个人同时打多份电话——一份接通才能挂断接下一份；Embassy 让你变成一个客服中心，所有电话都能"挂起等待"，哪个有消息就先回哪个，中间的等待时间 CPU 可以去睡觉。

Rust 的 `async` 关键字在**编译期**把异步函数变成状态机（Future）。Embassy 提供的 executor（调度器）轮询这些状态机：谁准备好了就运行谁，没有人准备好时让 CPU 进入低功耗睡眠，直到外部中断（按键、定时器、DMA 完成）唤醒对应的任务。整个过程**零动态内存分配**——任务在启动时静态分配，不依赖堆。

Embassy 名字的含义是 **EMB**edded **ASY**nc，同时也暗示它像"大使馆"一样，在嵌入式这片资源匮乏的领土上代表 Rust 现代并发理念。

## 为什么重要

不理解 Embassy 的设计，下面这些事都没法解释：

- 为什么传统 RTOS（如 FreeRTOS）需要为每个任务分配独立的栈内存，而 Embassy 多任务却不需要
- 为什么嵌入式设备能一边用 BLE 发数据，一边用 SPI 读传感器，同时在没有任务运行时自动降低功耗
- 为什么 Rust 编译器能在**编译期**拒绝你在两个任务里同时访问同一个外设寄存器
- 为什么 DMA（直接内存访问）配合 async 能让微控制器在搬运大块数据时无需 CPU 逐字节轮询

## 核心要点

Embassy 的运行模型可以拆成三个层：

1. **Future 状态机**：每个 `async fn` 被 Rust 编译器展开成一个结构体，字段是当前暂停点之间需要记住的局部变量。类比：暂停中的冒险游戏存档——你不用保留整个运行时，只存"角色站在哪、背包里有什么"。executor 调用 `poll()` 就像继续游戏，`Poll::Pending` 表示"还没好，等中断"，`Poll::Ready` 表示"完事了"。

2. **协作式 executor + 中断唤醒**：Embassy 的 executor 不靠计时器强制抢占任务，而是靠任务主动 `.await`。每当任务等待 I/O 时，它注册一个 **waker**（相当于回调指针），然后把 CPU 让出。外设完成操作后触发中断，中断服务函数（ISR）调用 waker 把任务重新入队。这条路径没有任何动态分配，成本极低。

3. **多优先级 executor 支持抢占**：同一个 executor 内任务是协作的；但你可以启动多个运行在不同中断优先级的 executor，高优先级 executor 可以中断低优先级 executor 正在运行的任务，实现"软实时"调度。这让 Embassy 兼顾低延迟响应和后台低优先级处理。

## 实践案例

### 案例 1：最小 blinky——单任务 async 循环

```rust
use embassy_executor::Spawner;
use embassy_time::{Duration, Timer};
use embassy_nrf::gpio::{Level, Output, OutputDrive};
use embassy_nrf::Peripherals;

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    let p = embassy_nrf::init(Default::default());
    let mut led = Output::new(p.P0_13, Level::Low, OutputDrive::Standard);

    loop {
        led.set_high();
        Timer::after(Duration::from_millis(300)).await;  // 让出 CPU，等 300ms
        led.set_low();
        Timer::after(Duration::from_millis(300)).await;
    }
}
```

**逐部分解释**：

- `embassy_nrf::init` 初始化所有外设，返回 `Peripherals`——每个外设只能 move 给一个所有者，编译期防止重复使用
- `Timer::after(...).await` 不是 `delay_ms` 死等——它把当前 Future 挂起，CPU 进入低功耗，300ms 后定时器中断唤醒它
- 整个程序没有动态分配，没有栈大小调参

### 案例 2：多任务——按键与 LED 分离

```rust
use embassy_executor::Spawner;
use embassy_nrf::gpio::{AnyPin, Input, Level, Output, OutputDrive, Pin, Pull};
use embassy_nrf::{Peri, Peripherals};
use embassy_time::{Duration, Timer};

#[embassy_executor::task]
async fn blink(pin: Peri<'static, AnyPin>) {
    let mut led = Output::new(pin, Level::Low, OutputDrive::Standard);
    loop {
        led.set_high();
        Timer::after(Duration::from_millis(200)).await;
        led.set_low();
        Timer::after(Duration::from_millis(200)).await;
    }
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let p = embassy_nrf::init(Default::default());

    spawner.spawn(blink(p.P0_13.into())).unwrap();

    let mut btn = Input::new(p.P0_11, Pull::Up);
    loop {
        btn.wait_for_low().await;   // 异步等待按键按下
        // 按下后可做其他事
        btn.wait_for_high().await;  // 异步等待松开
    }
}
```

**关键点**：`blink` 和 `main` 两个任务并发运行——`blink` 等 200ms 期间 executor 去跑 `main`；`main` 等按键时 executor 去跑 `blink`。两者的切换完全由 `.await` 驱动，没有时间片。

### 案例 3：DMA 加速 SPI 传输

```rust
use embassy_stm32::spi::{Config, Spi};
use embassy_stm32::time::Hertz;
use embassy_stm32::Peripherals;

#[embassy_executor::main]
async fn main(_spawner: embassy_executor::Spawner) {
    let p = embassy_stm32::init(Default::default());

    let mut spi = Spi::new(
        p.SPI1, p.PA5, p.PA7, p.PA6, p.DMA1_CH3, p.DMA1_CH2,
        Hertz(1_000_000),
        Config::default(),
    );

    let tx_buf = [0x9Fu8, 0x00, 0x00]; // 读 WHO_AM_I 寄存器
    let mut rx_buf = [0u8; 3];

    // 发起 DMA 传输，await 期间 CPU 可以做别的事
    spi.transfer(&mut rx_buf, &tx_buf).await.unwrap();
    // rx_buf 现在有传感器返回的数据
}
```

**与轮询对比**：传统做法是 `while !spi.is_tx_empty() {}`，CPU 一直在忙等。Embassy 的 `spi.transfer().await` 启动 DMA 后立即 yield，传输完成时 DMA 中断激活 waker，CPU 才回来读结果。3 字节可能省不了多少，但 256 字节的 flash 读取差距就很明显。

## 踩过的坑

1. **ISR 里不能 `.await`**：中断服务函数必须是同步的。要从 ISR 向任务传数据，用 `embassy_sync::channel::Channel` 或 `Signal`，从 ISR 里 `send_from_isr()`，任务侧 `recv().await`。

2. **一个任务长时间不 yield 会饿死其他任务**：Embassy executor 是协作式的，一个 loop 里忘写 `.await` 或 `yield_now().await`，其他同优先级任务就永远跑不到。症状是 LED 不闪烁但程序没崩溃。

3. **Peri<'static, T> 所有权严格**：每个外设只能被 move 一次。想在两个任务间共享外设，要用 `Mutex<NoopRawMutex, RefCell<Peripheral>>` 包装，不能直接传引用——生命周期不满足 `'static` 要求。

4. **feature flags 是按芯片区分的，Cargo.toml 必须指定 chip**：`embassy-stm32` 有几百个 feature，漏写 `stm32g474re` 会得到"找不到寄存器地址"的神秘 link error。务必参考 examples 目录对应板子的 `Cargo.toml`。

## 适用 vs 不适用场景

**适用**：

- 资源受限 MCU（Cortex-M0+ 到 M33、nRF52、RP2040）需要并发 I/O 而不想引入完整 RTOS
- 低功耗 IoT 设备——async executor 自动 sleep，无任务时进入 WFI/WFE
- 需要 Rust 编译期安全保证的嵌入式项目（外设所有权、内存安全）
- 同时需要网络（embassy-net TCP/UDP）、USB（embassy-usb）、Bluetooth（trouble）的复杂固件

**不适用**：

- 需要硬实时（< 1μs 抖动）的任务——Embassy 的软实时机制不能保证确定性延迟，需要裸 ISR + 优先级 NVIC
- 项目已深度绑定 C RTOS（FreeRTOS、Zephyr）生态，迁移成本高于收益
- 极度 flash 受限设备（< 32 KB）——Embassy 的 async 状态机会有一定代码体积膨胀
- 团队完全没有 Rust 经验，且项目周期极短——借用检查器学习曲线在嵌入式调试中会放大

## 历史小故事（可跳过）

- **2019 年前后**：Dario Nieuwenhuis（网名 dirbaio）在 nRF52 上实验 Rust async，写出第一版 embassy-executor，只有几百行。当时 Rust async 生态几乎空白，没有适合 `no_std` 的 executor。
- **2021 年**：Embassy 支持 STM32 全系列，并引入 embassy-net（基于 smoltcp 的异步网络栈）。社区开始形成，贡献者涌入。
- **2022 年**：RP2040（树莓派 Pico）支持加入，让 Embassy 在创客社区爆炸式传播。embassy-usb、embassy-boot 相继发布，框架初具电池全配面貌。
- **2023-2024 年**：与 Espressif 合作，ESP32 系列通过 esp-hal 接入 Embassy 生态；Bluetooth LE 支持通过 trouble crate 独立出来，支持多平台。GitHub 星标突破 9000。
- 名字 Embassy = **EMB**edded **ASY**nc，也可以理解为"驻扎在嵌入式领土上的 Rust 异步大使馆"。

## 学到什么

1. **async/await 不只是服务端技术**——把协作式多任务从云端"下沉"到没有 OS 的 MCU，根本上改变了嵌入式并发的写法
2. **编译期状态机 = 零运行时开销**——Rust 的 async 变换消除了传统 RTOS 任务切换的 per-task 栈分配，是语言设计让系统设计省力的典型案例
3. **所有权即隔离**——外设 move 语义让"两个任务同时写同一个寄存器"在编译时变成不可能，这是硬件安全领域 type-driven 设计的最好示范之一
4. **生态即框架**——embassy-net、embassy-usb、embassy-boot 各自独立又无缝组合，显示了好的 crate 设计如何让框架比单体 RTOS 更灵活

## 延伸阅读

- 官方文档书：[The Embassy Book](https://embassy.dev/book/index.html)（最权威的入门指南，含 executor 工作原理详解）
- Tweedegolf 基准测试：[Async Rust vs RTOS Showdown](https://tweedegolf.nl/en/blog/65/async-rust-vs-rtos-showdown)（Embassy 与 FreeRTOS 任务切换性能对比数据）
- 视频：[Embassy Workshop at RustNL 2024](https://www.youtube.com/watch?v=H7NtzyP9q8E)（2 小时实战，从零搭 nRF52840 项目）
- Rust Embedded Book：[The Embedded Rust Book](https://docs.rust-embedded.org/book/)（Embassy 的语言基础，理解 `no_std` 环境）
- [[freertos]] —— 对比：Embassy 取代的经典 RTOS，理解差异需要先知道 FreeRTOS 怎么做任务切换

## 关联

- [[freertos]] —— Embassy 的主要对比对象，传统 RTOS 靠内核抢占 + per-task 栈，Embassy 靠编译期状态机
- [[zephyr]] —— 另一嵌入式 OS，C 写成，支持更多硬件但无 Rust 编译期安全保证
- [[warp]] —— 同为 Rust 生态，展示 async 在网络服务端的另一面；Embassy 把相同范式带到了嵌入式
- [[linux-kernel]] —— Linux 走向嵌入式（PREEMPT_RT）的方向之一；Embassy 代表"绕开 Linux 内核，用语言本身解决问题"的另一路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[freertos]] —— FreeRTOS-Kernel — KB 级 RAM 跑得动的可抢占多任务内核
- [[warp]] —— warp — Rust 里把请求处理拼成 Filter 积木的 web 框架
- [[zephyr]] —— Zephyr — 一份代码树跑遍所有嵌入式芯片的开源 RTOS

