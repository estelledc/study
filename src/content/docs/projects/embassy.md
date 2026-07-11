---
title: Embassy — 让单片机也能用 async/await
来源: 'https://github.com/embassy-rs/embassy'
日期: 2026-06-24
分类: 嵌入式
难度: 中级
---

## 是什么

想象你在一间只有一个厨师的小餐厅。传统做法是：厨师煮面的时候站在锅旁干等，面好了才能去切菜——这就是阻塞式 RTOS 的工作方式，每个任务独占一段时间。Embassy 的做法不同：厨师把面丢进锅里，设好计时器，立刻转身去切菜，计时器响了再回来捞面——这就是 async/await 的协作式多任务。

Embassy 是一个用 Rust 语言编写的嵌入式异步框架，让你在 STM32、nRF52、RP2040 这些资源极其有限的单片机上，也能像写服务端代码一样用 `async/await` 处理并发。它不需要操作系统、不做动态内存分配、所有任务共享一个栈，编译时就把每个异步函数变成状态机。与传统 RTOS 相比，Embassy 更省内存、更省电、启动更快。

Embassy 项目由几个可独立使用的 crate 组成：embassy-executor（异步执行器）、embassy-stm32/embassy-nrf/embassy-rp（硬件抽象层）、embassy-net（TCP/UDP 网络栈）、embassy-usb（USB 设备栈）和 embassy-boot（OTA 引导加载器）。

## 为什么重要

嵌入式开发长期被两个痛点困扰：一是用 C 写并发代码容易出内存安全 bug（悬垂指针、缓冲区溢出、数据竞争），二是 RTOS 的线程模型在低功耗场景下浪费电——线程切换需要保存/恢复上下文，空闲时还得轮询。Embassy 同时解决了这两个问题。

从性能角度看，有评测显示 Embassy 的异步任务切换比 FreeRTOS 的内核上下文切换快数倍，同时占用更少的 RAM——因为所有任务共享一个栈，不需要为每个线程预留独立的栈空间。

Rust 的所有权系统在编译期就阻止了数据竞争和悬垂指针，Embassy 又把 async/await 带进了 `no_std` 世界。在嵌入式领域这是开创性的：之前 Rust 的异步运行时（如 tokio）依赖标准库和堆分配，根本跑不了单片机。Embassy 证明了零分配异步执行器是可行的，直接影响了整个 Rust 嵌入式生态的方向。

从工程角度看，Embassy 对 STM32 全系列 700+ 芯片型号的 HAL 支持是通过代码生成实现的——从 ST 官方 SVD 文件自动生成寄存器绑定，覆盖面远超手写方案。

另外，Embassy 还提供了 embassy-boot 引导加载器，支持 OTA 固件升级，具备断电保护和回滚能力。这对 IoT 产品来说是刚需——设备部署到现场后必须能远程更新固件，而更新过程中断电不能让设备变砖。

## 核心要点

Embassy 的设计可以拆成三层理解：

第一层是执行器（executor）。embassy-executor 在编译时静态分配所有任务的 Future，不用堆、不用 alloc。当没有任务需要运行时，执行器通过 ARM 的 WFE（Wait For Event）指令让 CPU 进入睡眠，直到中断唤醒。这意味着设备在空闲时的功耗可以降到微安级别。

执行器还内置了公平调度：一个任务被唤醒后，在它第二次被 poll 之前，其他所有就绪任务都能先跑一轮。你也可以创建多个不同优先级的执行器，让高优先级任务抢占低优先级任务，从而在协作式调度的基础上实现一定程度的实时性。

第二层是硬件抽象层（HAL）。Embassy 为每个芯片系列维护一个 HAL crate，把寄存器操作封装成类型安全的 Rust API。比如你想用 UART 发数据，不用写 `USART1->DR = byte` 这种原始寄存器操作，只需要 `uart.write(&data).await`。HAL 同时实现了阻塞和异步两套 trait（来自 embedded-hal 标准），所以你可以按需选择。

DMA 传输天然适合异步——启动传输后 CPU 去做别的事，DMA 完成时通过中断唤醒对应的 Future。这是 Embassy 让 DMA 从「专家才用的高级功能」变成「默认选择」的关键设计。

第三层是协议栈。embassy-net 基于 smoltcp 实现了 TCP/UDP/DHCP/DNS，embassy-usb 实现了 CDC ACM（串口）和 HID（键盘鼠标）等 USB 设备类。所有网络和 USB 操作都是异步的，超时、重试、多连接管理用 `select` 和 `join` 组合就行，不需要手写状态机。

除此之外，embassy-time 提供了全局可用的 Instant、Duration 和 Timer 类型。你不用关心底层是哪个硬件定时器，也不用担心计时器溢出——这些全被抽象掉了，只要写 `Timer::after_secs(1).await` 就行。

## 实践案例

最直观的例子是 LED 闪烁加按键检测。在传统 RTOS 里你需要两个线程、两个栈（每个栈至少 256 字节），还得担心共享数据的互斥。Embassy 里只要两个 async 任务共享一个栈，编译器保证不会有数据竞争：

```rust
#[embassy_executor::task]
async fn blink(pin: Peri<'static, AnyPin>) {
    let mut led = Output::new(pin, Level::Low, OutputDrive::Standard);
    loop {
        led.set_high();
        Timer::after_millis(150).await;  // 不阻塞，CPU 可以去做别的
        led.set_low();
        Timer::after_millis(150).await;
    }
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let p = embassy_nrf::init(Default::default());
    spawner.spawn(blink(p.P0_13.into())).unwrap();

    let mut button = Input::new(p.P0_11, Pull::Up);
    loop {
        button.wait_for_low().await;   // 等按下，CPU 睡眠
        button.wait_for_high().await;  // 等释放
    }
}
```

另一个典型场景是网络通信。embassy-net 让你在 STM32 上用几十行代码就能起一个 TCP echo server，处理多个并发连接，而整个程序跑在不到 64KB RAM 里。这在 C 语言生态中通常需要 lwIP + RTOS + 大量胶水代码才能做到。

还有一个实用场景是 USB 设备开发。embassy-usb 的 builder API 让你用声明式的方式组装 USB 描述符，不需要像 C 里那样手填字节数组。比如你要做一个 USB 键盘（HID 设备），Embassy 的示例代码不到 80 行就能跑起来，而用 STM32 的官方 C HAL 通常要 300 行以上加上大量的回调函数注册。

Embassy 的 examples 目录按芯片系列组织（nrf52840、stm32f4、rp2040 等），每个目录都有十几到几十个可直接编译运行的示例。这是最好的学习入口——选一个和你手上开发板匹配的示例，改几行就能跑出自己的效果。

## 踩过的坑

1. **stable 可用，nightly 是可选项**：Embassy 现已保证在最新 stable Rust 上可编译；默认路径用 arena 分配任务 Future。若开启 `nightly` feature，才用 `type_alias_impl_trait` 做完全静态的任务分配（每个任务一个精确大小的 `static`）。团队若要锁工具链，用 `rust-toolchain.toml` 钉住 stable 或已知可用的 nightly，避免上游变动导致偶发编译失败。

2. **任务函数签名受限**：用 `#[embassy_executor::task]` 标记的函数不能有生命周期参数（除了 `'static`），也不能是泛型的。这是因为任务的 Future 需要在编译时确定大小并静态分配。新手经常试图传引用进去，结果编译报错却看不懂。解决办法是用 `Peri<'static, T>` 转移所有权，或者用 `static` 全局变量配 `Mutex` 共享。

3. **调试信息不够直观**：嵌入式环境没有 stdout，Embassy 推荐用 `defmt` 框架做格式化日志，通过 RTT 传回主机。但 defmt 的错误信息有时只显示一个 panic 地址，需要配合 `probe-run` 或 `probe-rs` 才能看到源码位置。第一次搭环境时，光把 defmt + probe-rs + 芯片特定的 memory.x 配对就可能花掉半天。

4. **芯片支持程度不均匀**：STM32 和 nRF 系列支持最完整，RP2040 次之。如果你用 ESP32（Xtensa 架构）或更冷门的芯片，可能发现某些外设驱动缺失或不稳定。选开发板前一定先查 Embassy 的 examples 目录里有没有你需要的外设示例。

## 适用 vs 不适用

适用场景：

- 低功耗 IoT 设备需要长期电池供电，比如传感器节点、可穿戴设备——Embassy 的自动睡眠机制在这里优势最大
- 需要同时处理多个 I/O 的嵌入式系统，比如同时读传感器、发网络包、刷屏幕——async 让并发逻辑清晰可读
- 团队已经熟悉 Rust 并希望在嵌入式项目中获得内存安全保证
- 需要网络功能（TCP/UDP/DHCP）的 MCU 项目——embassy-net 比从头集成 lwIP 省力得多

不适用场景：

- 硬实时（hard real-time）要求微秒级确定性响应的场合——Embassy 的协作式调度无法保证一个任务在精确时间被执行，需要配合中断优先级或专用 RTOS
- 芯片 Flash 小于 64KB 的极端资源受限设备——Rust 的单态化 + async 状态机会让二进制体积比等价 C 代码大 30-50%
- 团队完全没有 Rust 经验且项目时间紧迫——Rust 的学习曲线加上嵌入式的调试难度是双重挑战
- 需要用到的外设在 Embassy HAL 中尚未实现——此时要么退回到 PAC 层手写寄存器操作，要么选一个 C 生态更成熟的方案

## 历史小故事（可跳过）

Embassy 的主要作者是 Dario Nieuwenhuis（GitHub 用户名 Dirbaio），一位荷兰开发者。2019 年前后，Rust 的 async/await 语法刚稳定进入语言，社区兴奋地造出了 tokio、async-std 等运行时，但这些全都依赖标准库和堆分配，嵌入式开发者只能看着眼馋。

Dario 当时在做 nRF52 的项目，受够了 C 语言里手写中断状态机的痛苦，决定试试能不能在 `no_std` 环境下跑 async。他从一个极简的执行器原型开始，发现 Rust 的 Future 天然是编译期状态机，根本不需要堆——这个洞见成了 Embassy 的基石。

项目最初叫 `nrf-softdevice`（只做蓝牙），后来 HAL 和执行器独立出来才有了 Embassy 这个名字。"Embassy" 取自 "EMBedded ASYnc" 的缩写。

到 2024 年，Embassy 已经成为 Rust 嵌入式生态中最活跃的框架，GitHub 星标超过 6000，贡献者超过 300 人。

## 学到什么

第一，异步不等于"要操作系统"。Embassy 证明了在裸机上也能跑 async/await，关键是把 Future 静态分配、用中断驱动唤醒代替轮询。这个思路打破了"异步 = tokio = 标准库"的思维定式。

第二，代码生成是对抗硬件碎片化的武器。Embassy 用 stm32-data 项目从 SVD 文件自动生成 700+ 芯片型号的 HAL，一个人维护的代码覆盖了整个 STM32 产品线。手写是不可能完成的。

第三，类型系统可以替代运行时检查。Embassy 的 HAL 用 Rust 的类型状态模式（typestate pattern）保证你不会在编译期之后才发现"把一个输入引脚当输出用"这种错误。这比 C 的运行时 assert 更早、更彻底。

第四，生态选择比技术选择更重要。Embassy 成功的一个关键因素是它实现了 embedded-hal 标准 trait，使得社区里的传感器驱动可以直接复用——选一个和生态兼容的框架，比自己造轮子高效得多。

第五，「模块化」不是口号。Embassy 的每个 crate（执行器、HAL、网络栈、USB 栈、引导加载器）都可以独立使用。你可以只用 embassy-stm32 的阻塞 API 而完全不碰异步，也可以用其他 HAL 配合 embassy-executor。这种「用多少拿多少」的设计降低了采用门槛。

## 延伸阅读

- Embassy 官方文档和教程：https://embassy.dev/book/
- Embassy 中文文档（社区翻译）：https://decaday.github.io/embassy-docs-zh/zh/index.html
- Async Rust vs RTOS 性能对比：https://tweedegolf.nl/en/blog/65/async-rust-vs-rtos-showdown
- Embedded Rust 入门系列教程：https://dev.to/apollolabsbin/series/20707
- The Embedded Rust Book（官方嵌入式指南）：https://docs.rust-embedded.org/book/
- Embassy Matrix 聊天室（社区讨论和问题求助）：https://matrix.to/#/#embassy-rs:matrix.org
- embedded-hal trait 规范（Embassy 实现的标准接口）：https://github.com/rust-embedded/embedded-hal

## 关联

- [[freertos]] —— 传统 RTOS 代表，Embassy 用异步模型替代了它的线程+内核切换范式
- [[rt-thread]] —— 国产嵌入式 RTOS，和 Embassy 面向同类场景但用 C 实现
- [[zephyr]] —— Linux 基金会的嵌入式 OS，支持更多芯片但没有 Rust 的内存安全
- [[nuttx]] —— POSIX 兼容的嵌入式 RTOS，比 Embassy 更重但接口更接近 Linux
- [[actix-web]] —— Rust 异步 Web 框架，和 Embassy 共享 Rust async 生态但面向服务端
- [[libsignal]] —— 用 Rust 写的加密库，展示了 Rust 在安全关键领域的另一种应用
- [[candle]] —— Rust 的 ML 推理框架，和 Embassy 同属"用 Rust 替代 C/C++ 领地"的趋势

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bevy]] —— Bevy — 用 Rust 写游戏的现代 ECS 引擎
- [[embedded-hal]] —— embedded-hal — Rust 嵌入式硬件抽象的统一接口
- [[lwip]] —— lwIP — 嵌入式系统的轻量级 TCP/IP 协议栈
