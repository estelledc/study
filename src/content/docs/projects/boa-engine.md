---
title: Boa — Rust 写的 ECMAScript 解释器
来源: 'https://github.com/boa-dev/boa'
日期: 2026-08-27
分类: runtimes
难度: 高级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/boa-dev/boa
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: bc36c3fac0969ea21ea0570b62e7846f97389b73
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.21.1
---

## 是什么

Boa 是用 Rust 写的实验性 ECMAScript 引擎：源码经 `boa_parser` 解析，`ByteCompiler` 编成内部指令，再在 `boa_engine` 的 VM 里执行。日常类比：V8 像一座高速印刷厂；Boa 更像能拆开看齿轮的教学机床，适合把一小段 JavaScript 嵌进 Rust 进程。

可嵌入入口是 crate `boa_engine`。固定 workspace 版本 `0.21.1`，`rust-version = "1.88.0"`，许可是 `Unlicense OR MIT`。`Context::default()` 只给语言运行时，不自动挂 `console` 或 `fetch`——那些在独立 crate `boa_runtime`。

```rust
use boa_engine::{Context, Source};

let mut context = Context::default();
let value = context.eval(Source::from_bytes("1 + 2 * 3"))?;
println!("{}", value.to_string(&mut context)?.to_std_string_escaped());
```

`eval` 的文档写明：**不会**跑已经排期的 promise jobs；要接着调用 `Context::run_jobs`。

## 为什么重要

不理解这条“解析 → 字节码 → VM”的链，下面几件事会对不上：

- 为什么 `eval` 成功返回一个 Promise，副作用却还没发生
- 为什么默认死循环不会被引擎拦住
- 为什么 `console.log` 在裸 `Context` 里直接引用错误
- 为什么 [[quickjs]]、[[rhai]]、[[deno]] 都能跑脚本，宿主边界却完全不同

## 核心要点

固定 `v0.21.1` 可以拆成四层：

1. **`Context` 是执行房间**：里面有 interner、realm、VM、job executor。同线程的 Context 可以共享对象（内部用 `Rc` 和 thread-local）；缺 lock-free `AtomicUsize` 的目标会 `compile_error`。

2. **`eval` = parse + evaluate**：`Script::parse` 用 `Parser` 产出 AST，可选 optimizer；`evaluate` 编译 `CodeBlock`，`push_frame` 后 `context.run()`。异步路径是 `evaluate_async`，默认 budget `256` 个内部时钟周期就让出线程。

3. **宿主函数要显式登记**：`register_global_property` 挂值；`register_global_callable` 生成可 `new` 的函数；`register_global_builtin_callable` 不可构造，当构造器用会 `TypeError`。函数体是 `NativeFunction::from_fn_ptr(|this, args, ctx| -> JsResult<JsValue>)`。

4. **默认限额几乎不管循环**：`RuntimeLimits` 默认 `loop_iteration = u64::MAX`（无上限）、递归 512、栈 `1024 * 10`、异常 backtrace 50。想卡死循环必须自己 `runtime_limits_mut().set_loop_iteration_limit(...)`。CPU 时间、内存、进程隔离仍要宿主做。

## 实践示例

### 案例 1：执行一段表达式

```rust
use boa_engine::{Context, JsResult, Source};

fn main() -> JsResult<()> {
    let mut context = Context::default();
    let value = context.eval(Source::from_bytes("1 + 2 * 3"))?;
    assert_eq!(value.as_number(), Some(7.0));
    Ok(())
}
```

语法错误或运行时错误都变成 `Err(JsError)`，不会把 Rust 进程直接崩掉。

### 案例 2：只开放白名单宿主函数

```rust
use boa_engine::{Context, NativeFunction, Source, js_string};

let mut context = Context::default();
context.register_global_builtin_callable(
    js_string!("hostAdd"),
    2,
    NativeFunction::from_fn_ptr(|_this, args, _ctx| {
        let a = args.first().and_then(boa_engine::JsValue::as_number).unwrap_or(0.0);
        let b = args.get(1).and_then(boa_engine::JsValue::as_number).unwrap_or(0.0);
        Ok((a + b).into())
    }),
)?;
let value = context.eval(Source::from_bytes("hostAdd(2, 3)"))?;
```

这里没有文件系统、网络或 `console`。需要 Web API 时，按 `boa_runtime` 文档调用 `Console::register_with_logger` 或 `boa_runtime::register(...)`，那是另一条合同。

### 案例 3：Promise 必须自己泵队列

```rust
let value = context.eval(Source::from_bytes("Promise.resolve(1).then(x => x + 1)"))?;
context.run_jobs()?;
```

只 `eval` 时 then 回调还停在 job queue。线上如果还要防死循环，先把 `loop_iteration` 从默认的“无上限”改掉。

## 踩过的坑

1. **把 `eval` 当成沙箱**：语言运行时不是 CPU / 内存 / 线程隔离。默认循环限额还是关掉的。
2. **以为 `Context::default()` 自带浏览器对象**：`console` / `fetch` 在 `boa_runtime`，要另注册。
3. **漏掉 `run_jobs`**：Promise 链看起来“成功了”，副作用没跑。
4. **用 `register_global_callable` 当普通函数**：它可以 `new`。只要函数、不要构造器，用 `register_global_builtin_callable`。
5. **按 README 的 `0.21.0` 推断本页**：README 示例字符串仍是 `0.21.0`；本文绑定 workspace / crates.io 的 `0.21.1`。

## 适用 vs 不适用场景

**适用**：

- Rust 应用里嵌入几十到几百行受控脚本
- 插件只需要白名单函数：读输入、算结果、回 `JsValue`
- 想看解析 / 字节码 / VM / 错误传播，而不是只追极限吞吐

**不适用**：

- 浏览器级 Web API 全家桶或完整 Node / npm —— 应看 [[deno]] 或宿主自建
- 安全隔离要求极高、却没有进程级沙箱的多租户
- 要把 README 的 Test262 仪表盘或“90%+”兼容表述写成我们测过的数字
- 把未绑定的吞吐、启动延迟或 WASM playground 成绩当选型依据

## 固定版本边界

- 本文绑定 `boa-dev/boa@bc36c3fac0969ea21ea0570b62e7846f97389b73`，tag `v0.21.1`，与 crates.io `boa_engine@0.21.1` 同号。
- `boa_runtime`、CLI、WASM playground 只作对照，未展开执行。
- 未安装 Rust 工具链、未跑 `cargo test` / Test262，状态保持 `UNVERIFIED`。

## 学到什么

1. **嵌入式 JS 的第一目标是宿主边界**，不是性能榜。
2. **`eval` 只走完当前脚本**——Promise 还要 `run_jobs`。
3. **默认 runtime limit 不管循环**——限额是选项，不是礼物。
4. **语言 crate 和 Web API crate 要分开读**——`boa_engine` ≠ 浏览器。

## 应用型自测

1. `Context::eval("Promise.resolve(1).then(...)")` 之后，then 一定已经执行了吗？
2. 固定版本下，空 Context 里调用 `console.log` 会怎样？
3. 默认 `RuntimeLimits` 会在第 N 次循环抛错吗？

检查点：

1. 不一定。文档要求再 `run_jobs` 才处理 job queue。
2. 会按普通 JS 引用错误失败。`console` 要由 `boa_runtime` 注册。
3. 不会按次数自动停。默认 `loop_iteration` 是 `u64::MAX`。

## 延伸阅读

- 固定源码：[boa-dev/boa](https://github.com/boa-dev/boa) —— 本文绑定提交 `bc36c3fac0969ea21ea0570b62e7846f97389b73`
- crate 文档：[docs.rs/boa_engine](https://docs.rs/boa_engine/0.21.1/boa_engine/)
- ECMA-262：[tc39.es/ecma262](https://tc39.es/ecma262/)
- [[quickjs]] —— 小型 C 引擎，嵌入路线对照
- [[deno]] —— Rust + V8 的另一条运行时
- [[rhai]] —— 不追 ECMAScript 的 Rust 脚本

## 关联

- [[javascript-engine]] —— 解析、执行、优化主线
- [[quickjs]] —— 同样强调可嵌入
- [[deno]] —— 用成熟 V8，而不是纯 Rust 重写
- [[rhai]] —— 放弃 JS 兼容换更简单宿主模型
- [[wasmtime]] —— 另一类嵌入式运行时，边界来自 WebAssembly

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[engine262]] —— engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
