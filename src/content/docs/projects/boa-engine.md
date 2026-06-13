---
title: boa-engine — 用 Rust 写出的可嵌入 JavaScript 引擎
来源: 'https://github.com/boa-dev/boa'
日期: '2026-06-13'
子分类: 语言运行时
分类: 编译器
难度: '高级'
provenance: 'pipeline-v3'
---

## 日常类比：把「翻译官 + 小法庭」塞进你的 Rust 程序

想象你正在开发一款 Rust 写的桌面工具，希望用户能用 JavaScript 写插件——比如自定义数据处理脚本、自动化宏、主题逻辑。你不能要求每个用户都装 Node.js，也不想在 C++ 里和 V8 的构建系统搏斗。

这时你需要的是**一位住在程序内部的翻译官**：

- 用户写 JavaScript（外语）
- 引擎先**词法分析 + 语法分析**，把源码变成结构化的语法树（AST）
- 再**编译成字节码**，交给内部虚拟机逐条执行
- 执行过程中创建的对象由**垃圾回收器（GC）** 自动清理

**Boa**（🦀，名字来自一种无毒蛇）就是这样一位「Rust 国籍的 JS 翻译官」。它把 ECMAScript 规范里定义的 JavaScript 语义，用 Rust 实现成可嵌入的引擎 crate——`boa_engine`。项目地址：[boa-dev/boa](https://github.com/boa-dev/boa)，MIT 开源，GitHub 约 7k+ Stars（2026 年中），最新稳定版 v0.21.x，Test262 一致性约 **94%**。

和 Chrome 里的 V8 不同，Boa 不追求「跑全世界网页最快」，而追求：**在 Rust 生态里安全、可控地嵌入 JS**，并能编译到 WebAssembly 在浏览器里跑 demo。

---

## 解决什么问题

### 痛点 1：Rust 项目需要脚本层，但不想绑 Node 或 C++ 引擎

游戏引擎、CLI 工具、区块链节点、配置 DSL……很多 Rust 程序需要「让用户写点逻辑」，却不想：

- 拉起整个 Node.js 进程（体积、启动、部署）
- 链接 V8 / SpiderMonkey（C++ 工具链、FFI 边界、内存安全顾虑）

Boa 是纯 Rust crate，`Cargo.toml` 加一行依赖即可嵌入，类型系统和所有权模型与宿主程序一致。

### 痛点 2：学习 / 研究 ECMAScript 引擎的实现路径

Boa 把 lexer、parser、AST、bytecompiler、VM、GC 拆成独立 crate（`boa_parser`、`boa_ast`、`boa_gc` 等），代码相对 V8 百万行 C++ 更易读。适合：

- 理解「JS 引擎到底在干什么」
- 做语言实验、教学、Conformance 测试（Test262）
- 为 Rust 生态贡献 Temporal、Intl 等新标准实现

### 痛点 3：WASM 场景下的轻量 JS 运行时

Boa 可以编译为 WebAssembly，在网页里跑 [live playground](https://boajs.dev/)——证明「Rust 写的引擎也能在浏览器里解释 JS」，适合 sandbox、在线 REPL、教育工具。

### Boa 明确不擅长什么

| 场景 | 说明 |
| --- | --- |
| 替代 Chrome / Node 的生产 JS 运行时 | V8 + JIT 在峰值性能上仍领先数个数量级 |
| 完整浏览器环境 | DOM、网络栈需配合 `boa_runtime` 或自建，不是开箱即用 |
| 100% ES 特性首日覆盖 | 仍在追赶 Temporal、部分 Intl 等；但 v0.21 已与主流浏览器 conformance 对齐 |

---

## 核心概念

### 1. ECMAScript 规范：引擎的「法律条文」

JavaScript 在标准组织 TC39 下以 **ECMAScript** 规范形式发布（ES2015、ES2020……）。引擎不是「实现 JS 作者觉得对的语义」，而是**尽量通过 Test262 测试套件**，证明行为与规范一致。

Boa 团队持续跑 Test262，v0.21 从约 89.9% 提升到 **94.12%**，并实现了 **Temporal**（新日期时间 API）等重大特性。选 Boa 时，应查 [官方 conformance 页面](https://boajs.dev/) 确认你需要的语法/API 是否已覆盖。

### 2. AST（抽象语法树）：源码的结构化表示

JS 源码是文本；引擎不能直接「执行字符串」。流程是：

```
源码 → Lexer（词法）→ Token 流 → Parser（语法）→ AST → Bytecompiler → 字节码 → VM 执行
```

`boa_ast` crate 定义符合 ECMAScript 语法的 AST 节点（表达式、语句、函数声明等）。AST 可被优化、序列化（feature `serde`），也是工具链（格式化、静态分析）的入口。

日常类比：AST 像**法律条文的目录树**——「第 3 章第 2 节是一个 if 语句，条件下挂两个分支」，而不是一整段无法索引的散文。

### 3. GC（垃圾回收）：自动管理 JS 堆对象

JavaScript 程序员很少手动 `free()`；引擎必须在堆上分配对象、数组、闭包，并在「没人再引用」时回收。Boa 的 `boa_gc` 实现带 **Trace / Finalize** trait 的追踪式 GC：

- 引擎内对象必须实现 `Trace`，让 GC 知道「还有谁指着这块内存」
- Rust 侧注册给 JS 的 native 状态若被闭包捕获，也要参与 trace，否则可能泄漏或悬垂

这与 Rust 的所有权**在边界处交汇**：宿主 Rust 数据结构通过 `GcRefCell` 等包装后，才能安全地与 JS 对象共存。

### 4. Context：一次 JS「会话」的宇宙

`Context` 是执行 JS 的核心结构，持有：

- 全局对象、Realm（类似规范中的 Realm Record）
- 内置对象（`Object`、`Array`、`Promise`……）
- 模块加载、Job 队列（微任务 / 宏任务）

每次 `context.eval(...)` 都在这个宇宙里解析并运行代码。

### 5. Crate 分工（模块化架构）

| Crate | 职责 |
| --- | --- |
| `boa_parser` | 词法 + 语法分析 |
| `boa_ast` | AST 定义 |
| `boa_engine` | 内置对象、Context、字节码编译器、VM |
| `boa_gc` | 垃圾回收 |
| `boa_interner` / `boa_string` | 字符串驻留与 ECMAScript 字符串 |
| `boa_runtime` | Console、Timer 等 Web API 子集 |
| `boa_cli` | REPL 与命令行 |

---

## 代码示例

### 示例 1：最小 embed —— 在 Rust 里 eval 一段 JS

来自官方 README / docs.rs 的经典例子：演示 `Context` + `Source` + 动态类型拼接。

```rust
use boa_engine::{Context, JsResult, Source};

fn main() -> JsResult<()> {
    let js_code = r#"
        let two = 1 + 1;
        let definitely_not_four = two + "2";

        definitely_not_four
    "#;

    let mut context = Context::default();
    let result = context.eval(Source::from_bytes(js_code))?;

    // JS 里 2 + "2" 触发 ToString，结果是 "22"
    println!("{}", result.display());

    Ok(())
}
```

要点：

- `Source::from_bytes` 包装待执行源码（也支持文件名等元数据，便于 stack trace）
- `eval` 返回 `JsResult<JsValue>`——JS 异常会映射为 Rust 的 `Err`
- `JsValue` 是 JS 值的 Rust 侧表示（number、string、object……）

### 示例 2：注册 Rust 原生函数给 JS 调用

嵌入引擎的常见需求：让 JS 调用宿主能力（读文件、调 GPU、访问数据库）。Boa 通过 `NativeFunction` 暴露 Rust 函数。

```rust
use boa_engine::{
    Context, JsResult, JsValue, js_string,
    native_function::NativeFunction,
};

fn main() -> JsResult<()> {
    let mut context = Context::default();

    // 把 Rust 闭包注册为全局函数 double(x)
    context.register_global_callable(
        js_string!("double"),
        1, // arity：形参个数
        NativeFunction::from_fn_ptr(|_this, args, ctx| {
            let n = args.get_or_undefined(0).to_number(ctx)?;
            Ok(JsValue::from(n * 2.0))
        }),
    )?;

    let result = context.eval(
        boa_engine::Source::from_bytes("double(21)"),
    )?;

    assert_eq!(result.to_number(&mut context)?, 42.0);
    Ok(())
}
```

要点：

- `register_global_callable` 在全局对象上创建可调用的 JS 函数
- 回调签名 `(&JsValue, &[JsValue], &mut Context) -> JsResult<JsValue>` 对应 JS 的 `this`、参数列表、引擎上下文
- 还有 `from_copy_closure`、`from_async_fn` 等变体，支持捕获 Rust 状态与 async/Promise 互操作

### 示例 3（可选）：REPL 与 CLI

安装 `boa_cli` 后可直接体验引擎，无需写 Rust 宿主：

```bash
cargo install boa_cli
boa
# 进入交互式 REPL，输入 JS 表达式即时求值
```

---

## 与 V8 / SpiderMonkey 的对比

三者都能执行 JavaScript，但**设计目标、实现语言、性能曲线**完全不同。

### 一句话定位

| 引擎 | 语言 | 主要宿主 | 典型目标 |
| --- | --- | --- | --- |
| **V8** | C++ | Chrome、Node.js、Deno（部分） | 生产级峰值性能 + JIT + 完整 ES |
| **SpiderMonkey** | C++ / Rust（组件化迁移中） | Firefox | 浏览器标准实现 + 长期演进 |
| **Boa** | Rust | 嵌入式工具、WASM、研究 | 安全嵌入 + 规范学习 + 中等 conformance |

### 多维度对比

| 维度 | V8 | SpiderMonkey | Boa |
| --- | --- | --- | --- |
| **性能** | 顶级：JIT（Ignition + TurboFan）、内联缓存、优化编译 | 强：IonMonkey 等，Firefox 级优化 | 解释器 + 字节码为主，**无生产级 JIT**，峰值远慢于 V8 |
| **嵌入难度（Rust 项目）** | 高：需 C++ 构建、复杂 ABI | 高：C API，Rust 需 FFI 层 | **低**：原生 crate，类型安全互操作 |
| **内存安全** | C++ 手动管理 + 引擎内 GC | 同左 | **Rust 保证 + boa_gc**，减少整类内存 bug |
| **体积** | 大（数十 MB 级运行时） | 大 | 相对小，适合 WASM / 工具内嵌 |
| **Test262 / ES 覆盖** | 标杆，驱动 Web 互操作 | 标杆 | ~94%（v0.21），接近浏览器但仍有缺口 |
| **生态** | Node/npm 全生态 | 主要服务 Firefox | Rust + 实验性 WebAPI（`boa_runtime`） |
| **适用场景** | 服务器、浏览器、桌面 Electron | 浏览器 | Rust 插件系统、教学、Conformance 实验、WASM demo |

### 和 [[quickjs]] 的横向关系

若你已读过 QuickJS 笔记：QuickJS 用 **C** 实现、体积极小、适合 IoT；Boa 用 **Rust** 实现、强调类型安全与模块化 crate，Conformance 更高、架构更「现代引擎」。选型上：

- **C 项目 + 极小体积** → QuickJS
- **Rust 项目 + 不想 FFI** → Boa
- **生产性能 / Node 兼容** → V8（通过 Deno、Node 或 `rusty_v8` 等绑定）

---

## 执行流水线（从源码到结果）

```text
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  JS Source  │ -> │ boa_parser  │ -> │   boa_ast    │ -> │ bytecompiler│
│  (字符串)   │    │ Lex + Parse │    │  语法树      │    │  字节码     │
└─────────────┘    └─────────────┘    └──────────────┘    └──────┬──────┘
                                                                 │
                                                                 v
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  JsValue    │ <- │  builtins   │ <- │  boa_engine  │ <- │     VM      │
│  返回宿主   │    │ Object/...  │    │   Context    │    │  逐条执行   │
└─────────────┘    └─────────────┘    └──────────────┘    └─────────────┘
                                           │
                                           v
                                    ┌──────────────┐
                                    │   boa_gc     │
                                    │  回收堆对象  │
                                    └──────────────┘
```

理解这条链，就理解了「为什么改 parser 不会直接改 VM」——层与层之间通过 AST 和字节码解耦。

---

## 特性开关（Cargo Features）

在 `Cargo.toml` 中可按需启用：

```toml
[dependencies]
boa_engine = { version = "0.21", features = ["intl"] }
```

| Feature | 作用 |
| --- | --- |
| `intl` | ECMA-402 `Intl` 国际化 API（依赖 ICU 数据） |
| `serde` | AST 序列化 / 反序列化 |
| `profiler` | 内置性能分析（偏内部开发） |

---

## 何时选用 Boa

**适合：**

- Rust 应用需要 JS 插件或配置脚本，且团队以 Rust 为主
- 学习 ECMAScript 引擎分层实现（parser / VM / GC）
- 需要 WASM 可移植的 JS 解释器 demo
- 参与开源：Temporal、Test262、Rust 互操作等方向

**不适合：**

- 替代 Node.js 跑高 QPS 服务端 JS
- 需要最新 stage-3 提案即刻可用且无人维护 fork
- 对延迟极度敏感的热路径（应直接写 Rust 或绑 V8）

---

## 进一步阅读

- 官网与 playground：[https://boajs.dev/](https://boajs.dev/)
- API 文档：[docs.rs/boa_engine](https://docs.rs/boa_engine/latest/boa_engine/)
- v0.21 发布说明（Temporal、94% Test262）：[Boa release v0.21](https://boajs.dev/blog/2025/10/22/boa-release-21)
- 示例 crate：[boa-dev/boa/examples](https://github.com/boa-dev/boa/tree/main/examples)
- 相关笔记：[[quickjs]]（C 轻量引擎）、[[swc]]（Rust 生态的 JS 编译器前端，不执行 JS）

---

## 小结

**boa-engine** 是用 Rust 从零搭建的 ECMAScript 引擎：通过 **规范驱动** 的开发（Test262）、**AST + 字节码 VM** 的经典架构、以及 **boa_gc** 管理的堆对象，让 Rust 程序能安全嵌入 JavaScript。它不会取代 V8 或 SpiderMonkey 在浏览器与 Node 中的地位，但在「Rust 宿主 + 脚本层 + 可Teaching 的引擎源码」这一 niche 里，是目前生态中最直接、最干净的选择之一。
