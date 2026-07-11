---
title: Boa — Rust 写的 ECMAScript 解释器
来源: 'https://github.com/boa-dev/boa'
日期: 2026-07-08
分类: runtimes
难度: 高级
---

## 是什么

Boa 是一个用 Rust 实现的 ECMAScript 引擎：它能把一段 JavaScript 源码解析、编译成内部指令，再在 Rust 进程里执行。日常类比：V8 像一整台高速印刷厂，机器大、速度快、配套复杂；Boa 更像一套透明教学机床，齿轮露在外面，适合你把 JavaScript 当成可嵌入零件装进 Rust 程序。

它的目标不是在浏览器里打败 V8 / SpiderMonkey，而是给 Rust 生态提供一个可嵌入、可审计、可改造的 JS 运行时。你可以把它放进规则引擎、插件系统、教学解释器，或者安全边界很窄的脚本执行器里。

换句话说，Boa 回答的问题是：如果我有一个 Rust 产品，只想让用户写几行 JavaScript 配规则，能不能不把整个浏览器引擎搬进来？

## 为什么重要

不理解 Boa，下面几件事都没法解释：

- 为什么有些 Rust 应用想要 JavaScript 扩展能力，却不愿直接嵌入 Node.js 或 V8
- 为什么“可嵌入脚本”最难的不是语法，而是宿主对象、内存和权限边界
- 为什么 ECMAScript 兼容性需要长期追 Test262，而不是“能算 1 + 2”就算 JS 引擎
- 为什么 [[quickjs]]、[[rhai]]、[[deno]] 看起来都能跑脚本，但适用边界完全不同

## 核心要点

Boa 的设计可以拆成 **三个核心要点**：

1. **Context 是执行房间**：`Context` 像一间临时厨房，里面放着全局对象、标准库、变量和执行状态。你把 JS 代码送进去，Boa 在这间房里解析、求值、返回结果；不同房间互不共享脏盘子。

2. **Rust 宿主掌握门禁**：JavaScript 默认不该碰文件、网络、数据库。Boa 让 Rust 程序决定暴露哪些函数和对象，像给访客发门禁卡：只开“读配置”这扇门，就不要顺手开“删文件”那扇门。

3. **兼容性和可控性要一起看**：Boa 追 ECMAScript 标准，但它更适合“受控脚本”而不是“全量浏览器运行时”。日常类比：它像一辆可拆开的教学赛车，能学清楚传动结构；真要跑 F1 正赛，还得看 V8 这类成熟大车队。

这三点合起来，Boa 的价值不是“最快 JS”，而是“Rust 程序里一块可检查、可限制、可替换的 JS 执行层”。

## 实践案例

### 案例 1：在 Rust 里执行一段配置脚本

```rust
use boa_engine::{Context, Source};

fn main() -> boa_engine::JsResult<()> {
    let mut context = Context::default();
    let value = context.eval(Source::from_bytes("1 + 2 * 3"))?;
    println!("{}", value.display());
    Ok(())
}
```

逐部分解释：

1. `Context::default()` 建一间新的 JS 执行房间。
2. `Source::from_bytes(...)` 把字符串包装成 Boa 能读取的源码。
3. `context.eval(...)` 解析并执行代码，返回 `JsValue`。
4. `?` 把 JS 语法错误、运行时错误转成 Rust 可处理的 `Result`。

这个例子适合配置校验、表达式计算、规则打分这类“小脚本”场景。

### 案例 2：做插件沙箱时只暴露白名单能力

```rust
use boa_engine::{Context, Source};

fn run_plugin(script: &str) -> boa_engine::JsResult<String> {
    let mut context = Context::default();
    let wrapped = format!(
        "const input = {{ count: 3 }}; JSON.stringify((() => {{ {} }})())",
        script
    );
    let value = context.eval(Source::from_bytes(&wrapped))?;
    Ok(value.to_string(&mut context)?.to_std_string_escaped())
}
```

逐部分解释：

1. 插件只拿到 `input` 这个对象，拿不到文件系统、网络和数据库。
2. 返回值被 `JSON.stringify` 收敛成字符串，方便 Rust 侧做类型检查。
3. 每次执行新建 `Context`，插件之间不会共享全局变量。
4. 真正上线时还要把脚本放到单独线程或进程里，加超时和内存上限。

这里的重点不是这段包装代码多完美，而是安全原则：默认什么都不给，需要什么才显式开放什么。

### 案例 3：用 Boa 讲清楚 JS 运行时错误

```rust
use boa_engine::{Context, Source};

fn main() {
    let mut context = Context::default();
    let result = context.eval(Source::from_bytes("missingFunction(42)"));

    match result {
        Ok(value) => println!("ok: {}", value.display()),
        Err(err) => eprintln!("js error: {}", err.display()),
    }
}
```

逐部分解释：

1. `missingFunction(42)` 在 JS 里会触发引用错误。
2. Boa 不会让 Rust 进程直接崩掉，而是返回 `Err`。
3. 宿主程序可以把错误写日志、展示给用户，或拒绝保存这段插件。
4. 教学时可以把解析错误、引用错误、类型错误拆开演示，比黑盒浏览器控制台更容易解释。

## 踩过的坑

1. **别把“能 eval”当成“安全沙箱”**：Boa 控制的是 JS 语言执行，真正的 CPU 时间、内存、线程隔离还要 Rust 宿主自己做。

2. **别默认兼容性等于 V8**：ECMAScript 标准很大，Boa 的覆盖率会随版本变化；生产前要用自己的脚本集合和 Test262 相关用例跑一遍。

3. **宿主对象要白名单，不要黑名单**：先开放所有能力再拦危险调用，很容易漏；更稳的是只注册业务必须的函数。

4. **错误类型要翻译成人话**：直接把 JS 异常原样抛给最终用户，通常没人看得懂；至少要带脚本名、行列号和业务含义。

5. **长脚本要有执行边界**：死循环、巨大数组、递归爆栈都可能拖垮宿主；线上场景最好用独立线程 / 进程配合超时杀掉。

## 适用 vs 不适用场景

**适用**：

- Rust 应用里嵌入几十行到几百行的受控业务脚本
- 插件系统只需要有限 API：读输入、算结果、返回 JSON
- 教学或调试 JS 引擎内部流程：解析、执行、错误传播
- 需要可审计实现路径，而不是只追极限吞吐

**不适用**：

- 浏览器级高吞吐 JS 执行：复杂前端应用、JIT 性能、Web API 全家桶
- 需要完整 Node.js 生态：npm 包、文件系统模块、事件循环和 native addon
- 安全隔离要求极高但又没有进程级沙箱的多租户平台
- 对 ECMAScript 新特性追赶速度极敏感的产品

## 历史小故事（可跳过）

- **1995 年**：JavaScript 诞生，最初是浏览器脚本语言。
- **2009 年后**：Node.js 把 V8 带到服务端，JS 引擎从“浏览器组件”变成“可嵌入运行时”。
- **2010s**：Rust 生态成熟后，大家开始希望脚本层也能符合 Rust 的可维护和内存安全风格。
- **Boa 项目启动后**：社区用 Rust 逐步实现 lexer、parser、运行时对象、GC 和标准库，目标是追上 ECMAScript 行为。
- **现在**：Boa 更像 Rust 生态的 JS 引擎实验室，适合嵌入、学习和定制，而不是直接替换浏览器核心引擎。

## 学到什么

1. 嵌入式 JS 的第一目标不是性能榜第一，而是宿主边界清楚。
2. `Context` 可以理解成一间独立执行房间，隔离粒度先从这里开始。
3. 标准兼容是长期工程，要用具体脚本和测试集验证，不能靠印象判断。
4. 安全沙箱不是一个 crate 自动送的礼物，而是语言运行时、线程、进程、权限共同拼出来的系统。
5. Rust 与 JavaScript 的接口设计，本质是在“灵活脚本”和“可控工程”之间找平衡。

## 延伸阅读

- 官方仓库：[boa-dev/boa](https://github.com/boa-dev/boa)（看 README、examples 和当前兼容状态）
- ECMAScript 标准：[ECMA-262](https://tc39.es/ecma262/)（所有 JS 引擎最终都要对齐它）
- Test262：[ECMAScript conformance tests](https://github.com/tc39/test262)（理解“兼容性”到底怎么测）
- [[quickjs]] —— 小型 C 语言 JS 引擎，嵌入路线可对照
- [[deno]] —— Rust + V8 的另一条运行时路线
- [[rhai]] —— Rust 原生脚本语言，放弃 JS 兼容换取更简单宿主模型

## 关联

- [[javascript-engine]] —— JS 引擎的解析、执行、优化主线
- [[quickjs]] —— 同样强调可嵌入，但实现语言和兼容策略不同
- [[deno]] —— 用 Rust 包装 V8，选择成熟引擎而不是纯 Rust 重写
- [[rhai]] —— 不追 ECMAScript，专注 Rust 应用脚本扩展
- [[wasmtime]] —— 另一种嵌入式运行时选择，边界来自 WebAssembly

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[javascript-engine]] —— 引擎生态对照。
- [[quickjs]] —— 轻量 JS 执行线。
- [[deno]] —— 高级生态整合。
- [[rhai]] —— Rust 脚本语言对照。
- [[vm-integration]] —— 虚拟机集成模式。
