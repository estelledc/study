---
title: cargo-component — Rust WASM Component 构建
来源: https://github.com/bytecodealliance/cargo-component
日期: 2026-06-13
分类: 其他
子分类: wasm-toolchain
provenance: pipeline-v3
---

# cargo-component — Rust WASM Component 构建

## 日常类比：乐高积木的标准化接口

想象一下乐高积木。每一块积木都有标准的小圆孔，所以不同厂家、不同年代生产的积木块可以互相拼接。

传统 WebAssembly（WASM）就像没有标准接口的塑料块——你能把它放进浏览器里运行，但两个模块之间想交换数据时，得自己想办法对接地址、内存、指针，非常麻烦。

WebAssembly Component Model 就是给这些塑料块加上标准接口。而 `cargo component` 就是帮你用 Rust 语言来制造这些"标准积木块"的工具。

## 核心概念

### 什么是 Component Model？

传统 WASM 模块只能传递数字和浮点数这些原始类型。如果你想传一个字符串、一个列表、或者一个复杂对象，就得手动管理内存。

Component Model 引入了高级类型——字符串、列表、变体（variant）、记录（record）等，让不同语言的模块之间可以直接通信，不需要担心内存地址的问题。

### cargo-component 做什么？

它是一个 Cargo 子命令，让你像用普通 Rust crate 一样使用 WASM Component：

- 在 `Cargo.toml` 中声明组件依赖
- 用 `cargo component build` 构建出组件
- 自动生成类型绑定（bindings），让你直接调用

## 安装

```bash
cargo install cargo-component --locked
```

需要 Rust 稳定版、OpenSSL 和一个 C 编译器（`cc` 命令可用）。

## 第一个例子：创建一个简单的组件

运行以下命令创建一个库类型的组件：

```bash
cargo component new --lib hello-component
cd hello-component
```

这会自动生成一个 `wit/world.wit` 文件，描述你的组件对外提供什么功能：

```wit
package my-org:my-component;

/// 组件要面向的世界
world example {
    export hello-world: func() -> string;
}
```

这里的 `export` 表示"我对外提供这个函数"。`hello-world` 函数接收无参数，返回一个字符串。

对应的 Rust 实现在 `src/lib.rs` 中：

```rust
#[allow(warnings)]
mod bindings;

use bindings::Guest;

struct Component;

impl Guest for Component {
    /// 打招呼！
    fn hello_world() -> String {
        "Hello, World!".to_string()
    }
}

bindings::export!(Component with_types_in bindings);
```

关键理解：

- `bindings` 模块是 `cargo component` 自动生成的，对应 `world.wit` 里的接口定义
- `Guest` trait 要求你实现 `world.wit` 中声明的所有导出函数
- `bindings::export!` 宏把实现注册到组件系统中
- 最后构建出的产物是一个符合 Component Model 规范的 `.wasm` 文件

## 第二个例子：带参数的组件

创建一个更实用的例子——一个计算服务组件：

```bash
cargo component new --lib calc-service
```

修改 `wit/world.wit`，定义更丰富的接口：

```wit
package my-org:calc;

/// 计算服务的世界定义
world calculator {
    // 导出：加法
    export add: func(a: s32, b: s32) -> s32;

    // 导出：字符串拼接
    export concat: func(a: string, b: string) -> string;

    // 导出：返回列表长度
    export list-length: func(items: list<string>) -> u32;
}
```

这里用了三种 Component Model 的高级类型：

| 类型 | 对应 Rust 类型 | 说明 |
|------|---------------|------|
| `s32` | `i32` | 32位有符号整数 |
| `string` | `String` | UTF-8 字符串 |
| `list<string>` | `Vec<String>` | 字符串列表 |

对应的 Rust 实现：

```rust
#[allow(warnings)]
mod bindings;

use bindings::Guest;

struct CalcComponent;

impl Guest for CalcComponent {
    fn add(a: i32, b: i32) -> i32 {
        a + b
    }

    fn concat(a: String, b: String) -> String {
        format!("{}{}", a, b)
    }

    fn list_length(items: Vec<String>) -> u32 {
        items.len() as u32
    }
}

bindings::export!(CalcComponent with_types_in bindings);
```

构建：

```bash
cargo component build --release
```

产物在 `target/wasm32-wasip1/release/` 目录下。

## 依赖另一个组件

`cargo component` 最强大的地方在于组件之间的依赖管理。就像 Rust crate 之间可以互相依赖一样：

```toml
[package.metadata.component.dependencies]
my-org:utils = { path = "../utils-component" }
```

然后在代码中直接使用：

```rust
use bindings::my_org::utils::exports::default::helper_function;

// 像调用普通 Rust 函数一样调用另一个组件的导出
let result = helper_function("hello");
```

`cargo component` 会自动解析依赖、生成绑定代码到 `src/bindings.rs`，你只需要 `cargo component build` 就能完成一切。

## WASI 支持

`cargo component` 使用 `wasm32-wasip1` 目标编译核心 WASM 模块，然后自动适配为 WASI Preview 2 格式的组件。这个适配过程内置了，不需要额外配置。

如果你需要自定义适配器，可以在 `Cargo.toml` 中指定：

```toml
[package.metadata.component]
adapter = "path/to/adapter.wasm"
```

## 与其他方案的对比

| 方案 | 适用场景 |
|------|---------|
| `cargo component` | 需要自定义 WIT 接口、非 WASI 接口、组件间依赖管理 |
| `wasm32-wasip2` 目标（Rust 1.82+） | 只需要标准 WASI 接口，追求简单 |
| `wasm-pack` + `wasm-bindgen` | 面向浏览器的 WASM 模块 |

如果你只需要标准 WASI 接口，Rust 1.82 自带的 `wasm32-wasip2` 目标可能更简单。但如果你的组件需要自定义接口、或者要引用第三方 WIT 接口，`cargo component` 是目前最好的选择。

## 总结

`cargo-component` 让 Rust 开发者可以用最自然的方式（Cargo 生态）构建符合 Component Model 规范的 WASM 组件。它屏蔽了底层内存管理、类型转换、接口适配的复杂性，让你专注于业务逻辑本身。

随着 Component Model 标准的成熟，未来它可能会成为 WASM 开发的主流方式之一。对于学习 WASM 的人来说，`cargo component` 是一个很好的起点——你不需要理解地址空间、线性内存这些底层概念，就能写出可复用的 WASM 组件。

## 参考资料

- 项目仓库: https://github.com/bytecodealliance/cargo-component
- Component Model 提案: https://github.com/WebAssembly/component-model/
- wit-bindgen: https://github.com/bytecodealliance/wit-bindgen
- Bytecode Alliance: https://bytecodealliance.org/
