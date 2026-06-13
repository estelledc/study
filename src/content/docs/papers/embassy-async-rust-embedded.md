---
title: Embassy — Modern Async Rust for Embedded Systems 零基础学习笔记
来源: https://embassy.dev/book/
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象一家**只有一位服务员、但菜单很满的小餐馆**：

- **单片机**就是这位服务员——同一时刻只能端一盘菜（单核 CPU）。
- 店里同时要：闪 LED、等按键、读传感器、通过 UART 发数据。每件事都像一桌客人，不能某桌「等酱油」时全店停业。
- 传统 **RTOS**（如 FreeRTOS）的做法是雇**多位厨师**：每个任务独占一摞盘子（独立栈），内核在 Tick 中断里**抢灶台**（抢占调度），还要调每人的盘子高度（栈大小）。
- **Embassy** 换了一种思路：还是**一位服务员**，但学会**协作式多任务**——等酱油时先去给别桌倒水（`.await` 让出执行权），酱油到了再回来继续。所有「等」都写在 Rust 的 `async/await` 里，编译器把每个异步函数变成**状态机**，**不占堆、不 malloc**，栈只有一份。

官方 [Embassy Book](https://embassy.dev/book/) 的定位很直白：让 **async/await 成为嵌入式开发的一等公民**。项目由 Embassy 社区维护（GitHub `embassy-rs/embassy`），提供执行器、时间库、以及 nRF / STM32 / RP2040 等 HAL，也可与第三方 HAL 混用。

和前面笔记里 FreeRTOS、Zephyr 的对照：

| 维度 | FreeRTOS / 经典 RTOS | Embassy |
|------|----------------------|---------|
| 任务模型 | 每任务独立栈 + 内核调度 | 协作式 async 任务，编译期状态机 |
| 内存 | 运行时分配栈，需调 `stack_size` | 静态分配，链接期检查 RAM |
| 阻塞写法 | `vTaskDelay`、信号量、队列 | `Timer::after_millis(n).await`、`pin.wait_for_low().await` |
| 省电 | Tickless 等需配置 | 无活可干时执行器让核心睡眠，中断唤醒 |
| 语言 | C | Rust（所有权 + 无数据竞争） |

Embassy 不是要「消灭 RTOS」，而是说明：在大量 I/O 等待型固件里，**async 协作 + 中断唤醒** 可以比传统内核更省 RAM、更省电，代码也更像顺序逻辑。

## 这篇文档在说什么

| 维度 | 内容 |
|------|------|
| 项目 | Embassy — 面向嵌入式的 Rust async 框架 |
| 官方书 | [Embassy Book](https://embassy.dev/book/)：从 blinky 到 executor、time、HAL |
| 核心 crate | `embassy-executor`、`embassy-time`、`embassy-*` HAL（nrf、stm32、rp 等） |
| 平台 | Cortex-M、RISC-V、ESP32（经 esp-rtos）、WASM、std（本地模拟） |
| 许可 | Apache-2.0 |

Book 结构大致分三块：

1. **入门**：用 `embassy-executor::main` 写第一个 async 固件，理解 `Spawner` 与 `#[task]`。
2. **运行时**：executor 如何 poll 任务、何时 `Poll::Pending`、timer 队列如何驱动 `.await`。
3. **硬件抽象**：各芯片 HAL 的 GPIO、UART、SPI、USB 等 **async API**，以及低功耗、多核、中断优先级执行器。

## 为什么值得学

| 场景 | Embassy 提供的价值 |
|------|---------------------|
| 多路 I/O（按键 + LED + 串口 + 传感器） | 每个外设一个 `async fn`，逻辑线性，无需状态机宏 |
| RAM 紧张的 MCU | 无 per-task 栈，链接器在编译期发现 RAM 不够 |
| 电池供电 | 无事可做时 WFI/WFE 睡眠，非忙等轮询 |
| 已有 Rust 嵌入式经验 | 与 `embedded-hal`、`defmt` 生态一致 |
| 对比学习 RTOS | 理解「协作式 vs 抢占式」的设计权衡 |

若你来自 **Arduino `loop()` + `millis()`** 或 **FreeRTOS 任务**，Embassy 的迁移心智是：把「标志位 + 非阻塞状态机」改写成 `async fn`，把 `delay` 改成 `.await`。

## 核心概念一：Future、Executor 与 Task

Rust 的 `async fn` 不会立刻执行函数体，而是返回一个 **Future**——一种「将来可能完成」的计算。Executor（执行器）负责反复 **poll** 这些 Future：

```
  创建任务 ──► poll 任务
                  │
                  ├─► 有进展 ──► 继续 poll 同一任务
                  │
                  └─► 遇到 .await 且未就绪 ──► 返回 Poll::Pending
                           │
                           ▼
                    任务入队尾，poll 下一个任务
                           │
                           ▼
                    全部 Pending ──► 平台睡眠（WFI/WFE）
                           │
                    中断/定时器到 ──► 唤醒，继续 poll
```

要点（来自 [Embassy Book — executor](https://embassy.dev/book/)）：

- **协作式**：同一 executor 上的任务不会在中途被强制打断；只有 `await` 点才让出。
- **静态任务数**：`#[embassy_executor::task]` 在编译期分配任务元数据；可用 `pool_size` 允许多实例。
- **`#[embassy_executor::main]`**：宏展开为创建 `Executor`、spawn `main` 为第一个任务、进入 `run` 循环。
- **`Spawner`**：在 `main` 里 `spawner.spawn(blink(...))` 启动后台任务；`main` 自己也是 async 任务。

其他语言里的 **coroutine / goroutine**，在 Rust 嵌入式里就是这套 **async + 专用 executor**。

### 与 RTOS 线程的对比

```
  RTOS 任务 A          RTOS 任务 B
  [栈 512B]            [栈 1024B]
       \                  /
        \   内核抢占    /
         ▼              ▼
              CPU

  Embassy 任务 A、B、C
  [共享一个栈，状态机在 .rodata/.bss]
         │
         ▼
    executor 轮询
```

代价是：**长时间不占 await 的 CPU 密集循环** 会饿死其他任务——需要主动 `yield` 或拆成小块。嵌入式固件多数是等外设，这通常可接受。

## 核心概念二：embassy-time 与异步等待

阻塞延时在 Embassy 里不是 `hal::delay::DelayMs::delay_ms()` 占死 CPU，而是：

```rust
use embassy_time::Timer;

Timer::after_millis(500).await;
```

`embassy-time` 依赖平台 **Time Driver**（nRF、STM32、RP2040 等 HAL 自带）。内部维护 **timer 队列**：任务在 `await` 时注册唤醒时间，到期由中断标记 Future 就绪，executor 再次 poll。

官方建议：**亚微秒级** 精确延时仍用**阻塞**硬件延时——上下文切换成本太高，async 定时器不适合做纳秒级忙等。

常见 API：

| API | 用途 |
|-----|------|
| `Timer::after_millis(n).await` | 相对延时 |
| `Timer::at(instant).await` | 绝对时间点 |
| `Ticker::every(interval)` | 周期定时（类似 RTOS 软件定时器） |

GPIO 的「等按键按下」同样做成 Future，例如 `Input::wait_for_low().await`，底层在 EXTI 中断里唤醒任务，等待期间 CPU 可睡眠。

## 核心概念三：HAL、可组合性与实时性

Embassy 不只是 executor：

- **HAL**（`embassy-nrf`、`embassy-stm32`、`embassy-rp`…）：安全封装寄存器，提供 async 与 blocking 两套 API。
- **Pick and choose**（官网强调）：可用 Embassy executor + 别家 HAL；或 Embassy HAL + 别的 runtime；时间驱动也可自实现。
- **多 executor**：`InterruptExecutor` 可在**中断上下文**驱动高优先级任务，与主线程 executor 形成软实时层次（类似「高优先级 ISR 里跑小 executor」）。
- **调度扩展**：feature `scheduler-priority`、`scheduler-deadline`（EDF）可选，用额外元数据排序就绪队列。

低功耗路径：当 run queue 空且没有即将到期的 timer，平台 `sleep()`；外设中断到来时 **pender** 唤醒 executor 继续 poll——没有「空转 while 轮询标志位」。

## 代码示例一：LED 闪烁 + 按键（最小 async 固件）

下列模式与 [embassy.dev](https://embassy.dev/) 官网示例一致，展示 `main`、`task`、`Spawner`、GPIO async：

```rust
use embassy_executor::Spawner;
use embassy_nrf::gpio::{AnyPin, Input, Level, Output, OutputDrive, Pull};
use embassy_nrf::Peri;
use embassy_time::Timer;

#[embassy_executor::task]
async fn blink(pin: Peri<'static, AnyPin>) {
    let mut led = Output::new(pin, Level::Low, OutputDrive::Standard);
    loop {
        led.set_high();
        Timer::after_millis(150).await;
        led.set_low();
        Timer::after_millis(150).await;
    }
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let p = embassy_nrf::init(Default::default());

    // 后台闪灯，与 main 逻辑并发（协作式）
    spawner.spawn(blink(p.P0_13.into())).unwrap();

    let mut button = Input::new(p.P0_11, Pull::Up);
    loop {
        button.wait_for_low().await;   // 按下：异步等 GPIO，不阻塞其他任务
        defmt::info!("Button pressed!");
        button.wait_for_high().await;
        defmt::info!("Button released!");
    }
}
```

读这段代码的「零基础 checklist」：

1. `#[embassy_executor::main]` 替代 `fn main()`，整个固件入口是 async 的。
2. `blink` 是独立 **Task**，由宏生成静态存储；`spawner.spawn` 只接受一次（除非 `pool_size > 1`）。
3. `Peri<'static, AnyPin>` 表达引脚在整个程序生命周期有效——Rust 所有权防止悬空引脚。
4. 两个 `loop` 里的 `.await` 是**唯一**让出 CPU 的点；闪灯与按键等待交替被 executor 推进。

`Cargo.toml` 片段（Cortex-M 常见配置，版本号以 Book 为准）：

```toml
[dependencies]
embassy-executor = { version = "0.10", features = [
    "arch-cortex-m",
    "executor-thread",
    "defmt",
] }
embassy-time = { version = "0.5", features = ["defmt"] }
embassy-nrf = { version = "0.8", features = ["nrf52840", "time-driver-rtc1", "defmt"] }
defmt = "1"
defmt-rtt = "1"
panic-probe = { version = "1", features = ["print-defmt"] }
```

## 代码示例二：UART 行协议与超时（组合多个 async 原语）

第二个例子展示 **UART async 读** 与 **超时** 组合——典型传感器/调试口场景。API 因芯片而异，此处以 `embassy-stm32` 风格示意（与 Book 中 async UART 章节思路一致）：

```rust
use embassy_executor::Spawner;
use embassy_stm32::usart::{Uart, Config};
use embassy_stm32::bind_interrupts;
use embassy_stm32::peripherals::USART1;
use embassy_time::{Duration, Timer, with_timeout};
use {defmt_rtt as _, panic_probe as _};

bind_interrupts!(struct Irqs {
    USART1 => embassy_stm32::usart::InterruptHandler<embassy_stm32::peripherals::USART1>;
});

#[embassy_executor::task]
async fn uart_line_reader(mut uart: Uart<'static, async>) {
    let mut buf = [0u8; 64];
    loop {
        // 带超时的 read_until：100ms 内没收到换行则返回 Err
        match with_timeout(Duration::from_millis(100), uart.read_until(b'\n', &mut buf)).await {
            Ok(Ok(n)) => {
                defmt::info!("line bytes: {}", n);
                // 解析 buf[..n] ...
            }
            Ok(Err(e)) => defmt::warn!("uart err: {:?}", e),
            Err(_) => {
                defmt::trace!("read timeout, retry");
            }
        }
        Timer::after_millis(10).await; // 简单节流
    }
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let p = embassy_stm32::init(Default::default());
    let cfg = Config::default();
    let uart = Uart::new(p.USART1, p.PA10, p.PA9, Irqs, p.DMA1_CH5, p.DMA1_CH4, cfg).unwrap();
    spawner.spawn(uart_line_reader(uart)).unwrap();

    loop {
        Timer::after_secs(1).await;
        defmt::info!("heartbeat");
    }
}
```

这段代码体现的 Embassy 模式：

- **中断 + DMA** 在 HAL 内完成，任务侧只见 `read_until().await`。
- `with_timeout` 把「无限等待」变成可恢复错误，避免协议卡死占满逻辑。
- `main` 只负责初始化和心跳，协议循环在子任务——类似 RTOS 里两个线程，但无第二块栈。

若平台无 async UART，也可用 `embassy-sync` 的 channel 把 ISR 收到的字节送给 async 任务，模式相同：**ISR 短、任务长**。

## 核心概念四：同步原语与跨任务通信

除 GPIO、UART 外，Embassy 生态常用：

| 组件 | 作用 |
|------|------|
| `embassy-sync` | 无堆 `Mutex`、`Channel`、`Signal`、`Watch` 等，供任务间传数据 |
| `embassy-futures` | `select`、`join`、`block_on` 辅助（嵌入式慎用 `block_on` 占死 executor） |
| `critical-section` | 短临界区，与 executor 配合 |

`Mutex` 在 async 里是 **async mutex**：锁被占用时 `.await` 等待，而不是自旋占 CPU。适合保护共享传感器缓冲区。

选择 **channel** 时，生产者 `send().await`、消费者 `receive().await`，天然背压——比裸全局变量 + 标志位更易推理。

## 执行器实现细节（进阶阅读）

Book 中 executor 章节的要点，适合第二次阅读：

1. **Run queue**：就绪任务 FIFO；也可选优先级 / deadline 调度。
2. **Waker**：Future 在 `Pending` 时注册 waker；中断里调用 `wake`，任务重新入队。
3. **多 Executor**：例如主循环 `executor-thread` + 高优先级 `InterruptExecutor` 绑 NVIC 优先级。
4. **自定义平台**：包装 `raw::Executor`，实现 `poll` 循环 + `pender`（唤醒睡眠线程），可嫁接到现有 RTOS 上。

`embassy-executor` crate 文档明确：**必须恰好提供一个 platform 实现**（`platform-cortex-m`、`platform-riscv32` 或 HAL 自带）。

## 与 FreeRTOS / Zephyr 选型简表

| 需求 | 更倾向 |
|------|--------|
| 团队只熟 C、供应商 BSP 是 FreeRTOS | FreeRTOS / Zephyr |
| 新项目、Rust、I/O 密集、要强内存安全 | Embassy |
| 硬实时 < 10µs 抖动、复杂优先级继承 | 抢占 RTOS 或 InterruptExecutor + 裸 ISR |
| 要完整蓝牙 Mesh / 全网络栈开箱 | Zephyr 往往更全；Embassy 需叠组件 |
| 本地单元测试 async 逻辑 | `executor` + `platform-std` 在 PC 上跑 |

Embassy 官方立场是：协作式 async **往往更快更小** than 传统 RTOS——前提是工作负载以等待外设为主，而非长时间 CPU 计算。

## 学习路径建议

1. **环境**：`rustup target add thumbv7em-none-eabihf`（视板子而定），用 `probe-rs` 或 `cargo-embed` 烧录。
2. **跑通 Book 的 Blinky async 版**：对比同一板子的 blocking 例程，观察 `Cargo.toml` feature 差异。
3. **改示例**：加一个 `Ticker` 每秒打印，理解 timer 队列。
4. **读 executor 章**：能画出 `Poll::Pending` → 入队 → 睡眠 → 中断唤醒。
5. **做一个综合小项目**：按键切换 BLE 广播间隔 + LED 状态机，全部用 async 函数拆分。

推荐资源：

- [Embassy Book](https://embassy.dev/book/) — 主教材
- [embassy.dev 首页](https://embassy.dev/) — 架构与 pick-and-choose 说明
- [docs.embassy.dev](https://docs.embassy.dev/) — crate API
- GitHub [embassy-rs/embassy](https://github.com/embassy-rs/embassy) — 示例与 issue

## 常见坑

| 现象 | 可能原因 |
|------|----------|
| 任务从不运行 | 忘记 `spawner.spawn`，或 `main` 里无 `.await` 占满 CPU |
| 链接报 RAM 不足 | 任务状态机过大；减少 `pool_size` 或简化 async 调用链 |
| 定时不准 | 用 async 做极短延时；改用 blocking 或硬件定时器 |
| `spawn` 失败 | 该 `task` 默认 `pool_size = 1`，重复 spawn 同类型任务需加大 pool |
| 死锁 | async `Mutex` 跨任务锁顺序不一致；用 `select!` 或拆分所有权 |

## 小结

Embassy 把嵌入式多任务从「多个栈 + 内核切换」翻译成「**单栈 + async 状态机 + 专用 executor**」。日常写固件时，你把每个外设或协议写成 `async fn`，用 `.await` 表达等待，用 `Spawner` 组装并发；RAM 与唤醒路径在编译期、硬件中断层收口。对于零基础读者，先建立「服务员协作上菜」的心智模型，再跑通 LED + 按键例程，最后读 Book 里 executor 与 time 两章，就能在 Rust 嵌入式里写出可维护的 async 固件，并与 FreeRTOS / Zephyr 路线做出清醒选型。
