---
title: Rust for Linux — 零基础学习笔记
来源: https://github.com/Rust-for-Linux/linux
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

# Rust for Linux — 零基础学习笔记

## 一、什么是 Rust for Linux？

Linux 内核诞生于 1991 年，从第一天起就几乎完全用 C 语言编写。C 语言虽然速度快、贴近硬件，但它不阻止你犯错误——指针可以乱指，缓冲区可以溢出，空引用可以直接崩溃整个系统。内核一旦崩溃（panic），整台机器就死掉了，这叫 "kernel panic"，比普通程序崩溃严重得多。

Rust 是一门由 Mozilla 开发的系统编程语言，它的核心特点是 **在编译阶段就阻止大量常见错误**（空指针、数据竞争、缓冲区溢出等）。"Rust for Linux" 就是一个项目，目标是让 Linux 内核的一部分代码可以用 Rust 来写。

打个比方：C 语言就像一把没有护套的菜刀——锋利但容易割手；Rust 就像一把带智能护刀器的大厨刀——同样锋利，但护刀器（编译器）会告诉你"这个动作不安全，停下来"。

2023 年 7 月，Rust 代码首次合入了 Linux 内核主线（v6.5 版本），这是一个里程碑事件。截至 v7.0，内核中已有数千行 Rust 代码，主要用于 **驱动程序（drivers）** 和 **文件系统**。

## 二、为什么内核要用 Rust？

内核开发面临几个核心痛点：

1. **内存安全**：C 语言允许你释放掉的内存继续访问（use-after-free），允许缓冲区溢出。Rust 的借用系统（borrow checker）在编译时就阻止了这些。
2. **线程安全**：内核是高度并发的，多个 CPU 核心同时运行代码。Rust 的类型系统保证 "如果代码能编译通过，就不会有数据竞争"。
3. **可维护性**：内核代码量已超过 3000 万行，随着代码库膨胀，用更安全的语言编写新模块可以显著降低引入 bug 的概率。

不过要注意：**Rust 不会替代 C**。内核中绝大部分代码仍然是 C，Rust 主要用于"叶子模块"（leaf modules）——也就是不需要被其他模块调用的顶层组件，比如新驱动程序。

## 三、核心概念

### 3.1 `no_std`：内核里没有标准库

Rust 程序通常使用 `std`（标准库），它提供了字符串、文件 IO、线程等高级功能。但 Linux 内核没有操作系统级别的运行时支持——没有堆分配器（至少不是标准那种）、没有标准 IO。所以内核中的 Rust 代码使用 `no_std`：

```rust
#![no_std]
```

这意味着只能使用 `core`  crate（Rust 的核心库，不含 OS 依赖的功能）。内核提供了自己的一套基础设施，比如自己的锁、自己的内存分配、自己的错误处理。

### 3.2 抽象层（Abstractions）vs 绑定（Bindings）

Linux 内核是一个 C 语言写的巨型工程。Rust 代码要使用内核的 C 功能，需要经过两层：

- **Bindings（绑定）**：通过 `bindgen` 工具自动从 C 头文件生成的 Rust 声明。这是不安全的桥梁，直接暴露 C 接口。
- **Abstractions（抽象层）**：位于 `rust/kernel/` 目录，用安全的 Rust 代码包装 bindings，把 C 的资源获取/释放模式变成 Rust 的构造/析构模式，把 C 的错误码变成 Rust 的 `Result` 类型。

设计原则是：**叶子模块不应该直接使用 bindings，只能通过抽象层**。这保证了安全性。

### 3.3 模块加载生命周期

和 C 语言的内核模块一样，Rust 模块也有两个核心阶段：

- **初始化（init）**：模块被加载时运行，做注册、分配资源等操作。
- **退出（exit）**：模块被卸载时运行，做清理、释放资源等操作。

Rust 的 RAII（Resource Acquisition Is Initialization，资源获取即初始化）特性在这里特别好使——对象在构造时获取资源，在析构时自动释放，不需要手动调用清理函数。

## 四、代码示例

### 示例 1：最简单的 Rust 内核模块

这是一个最基础的 "Hello World" 内核模块，对应 C 语言中的经典入门示例：

```rust
#![no_std]
#![warn(missing_docs)]

use kernel::{info, module_init, prelude::*};

module_init!(MyModule);

struct MyModule {}

impl kernel::Module for MyModule {
    fn init(_module: &'static ThisModule) -> Result<Self, En unsupported() {
        info!("Hello from Rust kernel module!");
        Ok(Self {})
    }
}

kernel::module!();
```

逐行解释：

- `#![no_std]`：告诉编译器这是一个无标准库的内核模块。
- `use kernel::`：引入内核提供的 Rust 基础设施。`prelude::*` 导入了最常用的类型和 trait，就像 C 的 `#include <linux/module.h>`。
- `module_init!(MyModule)`：这是一个宏，它告诉内核："当加载这个模块时，请调用 `MyModule::init`"。
- `impl kernel::Module for MyModule`：实现 `Module` trait，定义模块的行为。`init` 函数在模块加载时运行，返回 `Result<Self, Error>`，对应 C 中 `init` 函数返回 `int`（0 表示成功，负数表示错误）。
- `info!()`：内核日志宏，相当于 C 的 `pr_info()`，会在内核日志（`dmesg`）中输出 "Hello from Rust kernel module!"。
- `kernel::module!()`：生成模块的元数据（模块许可证、作者等），编译后的模块文件需要是 GPL 许可证才能加载。

加载这个模块后，运行 `dmesg | tail` 就能看到 "Hello from Rust kernel module!"。

### 示例 2：带清理的模块——RAII 的实际应用

Rust 最强大的特性之一是 RAII——资源在离开作用域时自动释放。下面这个示例展示了一个有初始化和清理的模块：

```rust
#![no_std]
#![warn(missing_docs)]

use kernel::{c_str, info, module_init, prelude::*};

module_init!(LedModule);

struct LedModule {
    _dev: DeviceHandle,
}

// DeviceHandle 在析构时自动关闭设备
struct DeviceHandle;

impl Drop for DeviceHandle {
    fn drop(&mut self) {
        // 自动执行设备关闭操作
        // 不需要手动调用 cleanup
    }
}

impl kernel::Module for LedModule {
    fn init(_module: &'static ThisModule) -> Result<Self, Error> {
        info!("Initializing LED device...");
        let dev = DeviceHandle;
        info!("LED device initialized successfully");
        Ok(LedModule { _dev: dev })
    }
    // 不需要显式定义 exit！Drop trait 会在模块卸载时自动调用
}

kernel::module!();
```

在 C 语言中，你需要写 `init` 函数和 `exit` 函数，并在 `exit` 中记得调用所有清理函数。如果 init 中途失败了，还需要在错误路径上做清理。而 Rust 的 `Drop` trait 保证：无论模块正常卸载还是加载失败，`DeviceHandle` 的析构函数都会被自动调用。这消除了大量 "忘了清理资源" 的 bug。

### 示例 3：使用内核的锁机制

内核中多线程/多 CPU 访问共享数据是常态。Rust 通过类型系统来保证锁的正确使用：

```rust
use kernel::{sync::Mutex, c_str, info, module_init, prelude::*};

module_init!(CounterModule);

struct CounterModule {
    counter: Mutex<u64>,
}

impl kernel::Module for CounterModule {
    fn init(_module: &'static ThisModule) -> Result<Self, Error> {
        info!("Counter module loaded");
        Ok(Self {
            counter: Mutex::new(0),
        })
    }
}

// 当模块被卸载时，Mutex<u64> 会自动安全地销毁
```

`Mutex<u64>` 是内核提供的 Rust 锁。关键点：
- 它包装的是 `u64`（64 位整数），而不是裸指针。
- 当你 `lock()` 获取锁时，返回的是一个智能的锁句柄，它在作用域结束时自动释放锁。
- Rust 的类型系统确保你不会在持有锁的同时做不该做的事。

## 五、编译和构建

内核中的 Rust 代码通过标准的 `make` 系统编译。基本流程：

1. 配置内核时启用 Rust 支持：`make menuconfig` → 确保 `CONFIG_RUST=y` 或 `CONFIG_RUST=m`。
2. 需要安装 `rustc`（Rust 编译器）、`rust-src`、`bindgen`、`clang`（LLVM 工具链）。
3. 用 `make LLVM=1` 编译，LLVM 工具链同时用于 C 和 Rust 部分的构建。
4. 可选：`make LLVM=1 CLIPPY=1` 启用 Clippy 静态分析，帮助发现代码质量问题。

Rust 内核模块最终编译为 `.ko`（kernel object）文件，和 C 模块一样用 `insmod` 或 `modprobe` 加载。

## 六、当前状态和未来

- Rust 在内核中是 **实验性但已合入主线** 的，从 v6.5 开始支持。
- 支持的平台正在扩展，目前已支持 x86_64、AArch64 等主流架构。
- 抽象层覆盖范围在持续增长，越来越多的内核子系统提供了 Rust 抽象。
- 社区非常活跃：Rust for Linux 由 Google、Ondřej Bořek 等核心开发者维护，得到了 Linux 内核维护者 Greg Kroah-Hartman 的直接支持。

## 七、学习资源

- 内核源码中的 Rust 文档：`Documentation/rust/` 目录
- 在线 rustdoc：https://rust.docs.kernel.org
- 项目主页：https://github.com/Rust-for-Linux/linux
- 前提知识：建议先了解 Rust 基础语法（类型系统、所有权、trait），再深入内核开发

## 八、关键概念回顾

| 概念 | 说明 | 类比 |
|------|------|------|
| `no_std` | 不使用标准库，只用 core | 不用全套工具箱，只用基础扳手 |
| Bindings | 从 C 头文件自动生成的 Rust 声明 | 翻译器，把英文原文逐字翻成中文 |
| Abstractions | 用安全 Rust 包装 bindings | 翻译器加编辑润色，让译文读起来自然 |
| RAII / Drop | 资源在析构时自动释放 | 自动还书——看完书放回书架，不需要专门跑一趟图书馆 |
| Module trait | 定义模块的 init/exit 行为 | 模块的"生命简历" |
