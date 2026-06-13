---
title: wasm-pack — 把 Rust 编译成浏览器能跑的代码
来源: https://github.com/rustwasm/wasm-pack
日期: 2026-06-13
分类: 编译器
子分类: wasm-toolchain
难度: 入门
provenance: pipeline-v3
---

## 是什么

**wasm-pack** 是 Rust 生态里专门用来把 Rust 代码打包成 WebAssembly（Wasm）并分发给 JavaScript 项目的工具。它由 Rust WASM 团队维护，GitHub 上有 7.2k star，目前是 Rust → Wasm 领域的事实标准打包工具。

日常类比：

- 你写了一段 Rust 代码，就像用中文写了一封情书
- WebAssembly 就像**把信翻译成世界语**——浏览器和 Node.js 都能读懂
- 但光翻译不够，你还需要**装信封、贴邮票、写收件人地址、打包寄出**——wasm-pack 做的就是这件事：它自动处理翻译后的 Wasm 文件、生成 JavaScript 胶水代码、打包成 npm 包，一步到位寄到别人的项目里

## 为什么重要

没有 wasm-pack，Rust 代码想跑到浏览器里，你需要手动做一堆事：

1. 用 `rustup` 装 wasm32-unknown-unknown 目标
2. 用 `wasm-bindgen` 手动生成 JS 胶水文件
3. 手动处理 .wasm 和 .js 的文件路径
4. 自己写 webpack/vite 配置来加载 .wasm
5. 手动处理 npm package.json 里的文件引用

这就像**每寄一封信都要自己熔铸邮票、手写信封、跑到邮局排队**——不是不能做，但太折磨了。wasm-pack 把这些流程全部自动化，一条命令完成。

它的核心价值场景：

- **性能敏感的计算放浏览器端跑**——比如图像滤镜、视频编解码、密码学运算，用 Rust 写完编译成 Wasm 给前端用，比纯 JS 快 10-100 倍
- **复用 Rust 库**——你已经在 Rust 生态写了大量算法库，不想在 JS 重写一遍，用 wasm-pack 直接"装盒"给 JS 项目用
- **Web 组件 / 微前端**——把核心逻辑编译成 Wasm 模块，多个前端框架都能调用

## 核心概念

### 概念 1：wasm-bindgen —— Rust 和 JS 的翻译官

Rust 和 JavaScript 是两种完全不同的语言，类型系统、内存模型、执行方式都不一样。wasm-pack 的底层依赖 **wasm-bindgen** 负责在两者之间搭桥：

- 你在 Rust 代码里用 `#[wasm_bindgen]` 标记哪些函数/结构体要暴露给 JS
- wasm-bindgen 自动生成对应的 JavaScript 胶水代码（比如 `export function hello_world()`），让 JS 能直接调用 Rust 函数

### 概念 2：target 模式 —— 你的代码要去哪里

wasm-pack 最核心的命令是 `build`，它有一个关键参数 `--target`，决定打包产物长什么样：

| `--target` 值 | 适合场景 | 产出物 |
|---|---|---|
| `web`（默认） | 直接用 `<script>` 标签引入，不经过 npm | `.js` + `.wasm` 文件对 |
| `bundler` | 配合 webpack / vite / rollup 等打包器 | `.js` + `.wasm` + `package.json` |
| `nodejs` | 在 Node.js 环境中运行 | `.js` + `.wasm`，CommonJS 格式 |
| `nodejs-when` | Node.js 22+ 的 import() 加载 | 同上，但用 ESM 格式 |
| `deno` | Deno 运行时 | `.js` + `.wasm`，适配 Deno 加载方式 |

### 概念 3：crate-type —— Rust 的 "输出格式开关"

wasm-pack 不需要你手动配置 Cargo.toml，它**自动把 crate-type 设置为 `cdylib`**（C 动态链接库格式），这是编译成 Wasm 必须的。你只管写 Rust 代码，wasm-pack 帮你切输出格式。

## 实践案例

### 案例 1：从零构建一个 npm 可发布的 Wasm 包

第一步，创建一个 Rust 库项目（用 cargo 新建）：

```bash
cargo new --lib hello-wasm
cd hello-wasm
```

在 `Cargo.toml` 里加上 wasm-bindgen 依赖：

```toml
[package]
name = "hello-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
```

在 `src/lib.rs` 里写一个暴露给 JS 的 Rust 函数：

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! 🦀", name)
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

现在用 wasm-pack 打包。默认输出到 `pkg/` 目录，产物是 npm 包格式：

```bash
wasm-pack build
```

输出长这样：

```
[INFO]: Checking for the Wasm target...
[INFO]: Compiling to Wasm...
   Compiling hello-wasm v0.1.0
[INFO]: Installing wasm-bindgen...
[INFO]: :-) Done in 5.23s
[INFO]: :-) Your wasm pkg is ready to publish at /Users/you/hello-wasm/pkg
```

`pkg/` 目录里已经躺好了：

```
pkg/
├── hello_wasm.js          ← JS 胶水代码，调用 .wasm
├── hello_wasm.d.ts        ← TypeScript 类型声明
├── hello_wasm_bg.wasm     ← 编译好的 Wasm 二进制
├── hello_wasm_bg.wasm.d.ts← Wasm 模块的类型声明
└── package.json           ← 标准的 npm 包描述文件
```

在 JS 项目里直接用：

```bash
npm install ./hello-wasm/pkg   # 本地安装
```

```javascript
import { greet, add } from 'hello-wasm';

console.log(greet('World'));  // Hello, World! 🦀
console.log(add(42, 58));     // 100
```

### 案例 2：用 `--target web` 打包成纯网页引用

不经过 npm，直接给普通网页用（比如内嵌到 WordPress、博客或静态站）：

```bash
wasm-pack build --target web
```

产物在 `pkg/` 里，但 package.json 不见了，只剩 `.js` + `.wasm` 两个文件。在 HTML 里引入：

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Hello Wasm</title></head>
<body>
  <h1>来自 Rust 的问候</h1>
  <script type="module">
    import init, { greet, add } from './pkg/hello_wasm.js';

    async function main() {
      await init();
      document.body.innerHTML += `<p>${greet('浏览器')}</p>`;
      document.body.innerHTML += `<p>42 + 58 = ${add(42, 58)}</p>`;
    }

    main();
  </script>
</body>
</html>
```

注意 `await init()` —— Wasm 模块加载后需要调用 `init()` 完成初始化，然后才能用你暴露的函数。

### 案例 3：发布到 npm 仓库

打包好之后一键发布：

```bash
wasm-pack publish
```

这会自动执行两步：
1. `wasm-pack pack` —— 把产物打包成 `.tgz` 压缩文件
2. `npm publish` —— 推送到 npm registry

你也可以指定私有仓库：

```bash
wasm-pack publish --registry https://npm.your-company.com
```

## 踩过的坑

1. **Cargo.toml 里不要手动写 `crate-type = ["cdylib"]`**——wasm-pack 会自动帮你设置。手动写了反而可能和内部逻辑冲突，导致打包失败或产物不对。

2. **`--target web` 和 `--target bundler` 别混用**——`web` 产物里 JS 用 `import.meta.url` 加载 `.wasm`，直接 `<script type="module">` 能用；`bundler` 产物里 `.wasm` 路径依赖打包器解析。两个产物不能互换。

3. **大模块的 Wasm 文件会影响首屏加载**——编译出来的 `.wasm` 文件可能几 MB，如果直接发给浏览器，用户要等很久。解决方案：用 `wasm-pack` 的 `--dev` 模式做开发时不压缩；生产环境开 `--release` 压缩 + 配合 CDN 分发。

4. **`wasm-pack test` 用的是 Headless Chrome**——它会自动起一个浏览器跑测试，需要系统里装了 Chrome/Chromium。如果没有，测试命令会失败。装一个就行：`brew install --cask google-chrome`。

5. **Rust 版本过老会报错**——wasm-pack 依赖 Rust 工具链。如果 `rustc --version` 低于 1.30，`rustup target add wasm32-unknown-unknown` 会失败。用 `rustup update` 更新到最新稳定版。

## 适用 vs 不适用场景

**适用**：
- 需要把 Rust 库暴露给 JavaScript 项目用
- 想要发布 Wasm 模块到 npm registry
- 前端性能瓶颈需要 Rust 来加速关键计算路径
- 想在浏览器里跑密码学、图像处理、科学计算等密集型任务

**不适用**：
- **只是写纯前端 JS/TS 项目**——不需要 Wasm，别硬加
- **用 Python/Go/Rust 写后端 API**——这场景选 FastAPI / Go HTTP / Actix-web，Wasm 在浏览器端才有价值
- **需要完整 Rust 全栈**——那选 Leptos / Yew 等 Rust Web 框架，不是 wasm-pack

## 跟它相邻的工具谁选谁

| 工具 | 定位 | 跟 wasm-pack 的关系 |
|---|---|---|
| `wasm-bindgen` | Rust → JS 的类型/函数胶水层 | wasm-pack 的内核之一，负责翻译 |
| `cargo-generate` | 用模板快速生成 Rust 项目 | 配合用：`cargo generate rustwasm/wasm-pack-template` |
| `webpack / vite` | JavaScript 打包器 | 配合用：wasm-pack 输出产物后交给它们继续打包 |
| `wasmtime` | 独立的 Wasm 运行时（服务端） | 不同方向：wasm-pack 做前端分发，wasmtime 做服务端执行 |
| `wasm-bindgen-cli` | 单独的胶水代码生成 CLI | wasm-pack 内置了这个功能，不需要单独装 |

## 历史小故事（可跳过）

- **2018**：wasm-pack 首次发布，作者是 Ashley Williams，目标是简化 Rust → Wasm 的打包流程
- **2019-2021**：配合 WebAssembly 生态爆发（Leptos、Yew、WebGPU 提案），wasm-pack 成为 Rust WASM 团队官方推荐工具
- **2026**：wasm-pack v0.15 发布，支持 Node.js 22+ 的新模块加载方式，持续跟进 Web 平台演进

## 学到什么

1. **"自动处理 boring 部分"是工具最大的价值**——编译 Wasm 本身不难，难的是后续的胶水代码、文件打包、npm 兼容、类型声明这些琐碎事。wasm-pack 把 80% 的琐碎事做了，你只写 20% 的核心逻辑。

2. **wasm-bindgen 不是编译器的功能，是后处理**——Rust 编译器本身不知道 Wasm 是什么，wasm-bindgen 是在 `.wasm` 生成之后再做一层"翻译包装"。理解这一点就明白为什么 Rust 代码不需要改编译器就能跑 Wasm。

3. **`target` 模式本质上是"目标环境契约"**——不同环境对模块加载、文件路径、格式的要求不同。一个 `--target` 参数背后是整套构建规则的切换，选对了才能正确运行。

4. **Wasm 不是万能的——它是"性能放大器"**——JS 写得好的场景不需要 Wasm；只有在计算密集、需要复用现有 Rust 库、或需要 SIMD/并行优势时，Wasm 才有明显价值。

## 延伸阅读

- 官方文档：[wasm-bindgen.github.io/wasm-pack/book](https://wasm-bindgen.github.io/wasm-pack/book/)（完整的命令参考和教程）
- Quickstart：[官方快速入门](https://wasm-bindgen.github.io/wasm-pack/book/quickstart.html)（从零到 npm 发布）
- 源码入口：[github.com/rustwasm/wasm-pack](https://github.com/rustwasm/wasm-pack)，从 `src/` 目录看 Rust 实现的 CLI 架构
- 配套工具：[wasm-bindgen 文档](https://rustwasm.github.io/wasm-bindgen/)（理解胶水代码怎么生成）

## 关联

- [[wasm-bindgen]] —— Rust 和 JS 之间的翻译层，wasm-pack 的核心依赖
- [[wasmtime]] —— 服务端的 Wasm 运行时，跟 wasm-pack 的浏览器方向互补
- [[tinygo]] —— Go 编译成 Wasm 的工具，跟 wasm-pack 是平行生态
- [[wazero]] —— Go 的纯 Wasm 运行时，不依赖系统组件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
