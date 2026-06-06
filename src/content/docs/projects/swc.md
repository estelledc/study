---
title: SWC — Rust 写的 TS/JS 编译器
来源: https://github.com/swc-project/swc
日期: 2026-05-29
子分类: 构建工具
分类: 编译器
难度: 中级
provenance: pipeline-v3
---

## 是什么

SWC（Speedy Web Compiler）是用 **Rust** 重写 Babel 核心能力的编译器——做 TypeScript / JSX 转译、minify 压缩、bundle 打包。日常类比：

> 同样一道菜，Babel 用电饭锅 30 分钟煮出来，SWC 用高压锅 1 分钟搞定。

锅形状（API）几乎不变，菜谱（要做的转换）也一样。换个材料的锅（JS → Rust），加压（编译期 trait dispatch + 真并行），同一份输入 10-20 倍出锅。

## 为什么重要

不理解 SWC 解释不了下面这些：

- 为什么 **Next.js 13+ 启动快了**——它默认编译器从 Babel 切到了 SWC
- 为什么 Vercel 的下一代 bundler **Turbopack** 跑得动——它底层把 SWC 当库链接进去
- 为什么ByteDance出的 webpack 替代品 **Rspack** 也能拉到几十倍速度——它把 SWC 选作 transformer
- 为什么 Node 能直接调 Rust 编译器不卡——是 **napi-rs** 这套桥把 Rust 编译产物包成 native binary 给 Node `require`

## 核心要点

SWC 的设计可以拆成 **三件事**：

1. **换语言（Rust > Go > JS）**：Babel 用 JS 写——单线程 + V8 GC 卡顿。[[esbuild]] 用 Go 写，能开多核 goroutine。SWC 用 Rust 写，比 Go 再快一截：编译期 trait dispatch（visitor 方法地址在编译时算好）vs Go interface（运行期查表），加 zero-cost abstraction，单核数据 SWC 比 esbuild 还快 10-20%

2. **Visitor 模式的 Rust 化**：Babel `traverse` 每访问一个 AST 节点都要查 `visitor[node.type]`（hashmap lookup）。SWC 用 Rust trait + `#[ast_node]` 宏自动派生 `VisitMut`——每个节点访问是「函数调用 + 内存偏移读」。这一处差异乘以「每个 AST 节点访问一次」就是数量级差距

3. **API 对齐 Babel**：`@swc/core` 的 `transform(code, opts)` 几乎是 Babel `transformSync` 的镜像。这降低了下游迁移成本——webpack / Next.js 把 Babel 替换成 SWC 时，调用代码改动极小。这是 SWC 在 2020-2022 年快速被采纳的关键

## 实践案例

### 案例 1：CLI 一行编译

最常见的用法——把整个 src 目录的 TS/JSX 编译到 dist：

```bash
swc src -d dist
```

逐部分解释：

- `src` 是源码目录
- `-d dist` 是输出目录
- 没指定 config 时 SWC 会自动找 `.swcrc`

跑完 dist 里就是纯 ES5/ES2015 的 JS 文件 + sourcemap。中型项目（500 文件）大约 1-2 秒。

### 案例 2：.swcrc 配 JSX + TS

```json
{
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "tsx": true,
      "decorators": true
    },
    "target": "es2020",
    "transform": {
      "react": {
        "runtime": "automatic"
      }
    }
  },
  "module": {
    "type": "es6"
  }
}
```

逐字段解释：

- `parser.syntax` 选 `"typescript"` 让 SWC 认 TS 类型语法（Babel 要装 `@babel/preset-typescript`，SWC 内置）
- `tsx: true` 同时打开 TSX 支持
- `target: 'es2020'` 控制语法降级目标——`async/await`、可选链都保留
- `transform.react.runtime: 'automatic'` 用 React 17+ 的新 JSX 运行时，省掉 `import React`

### 案例 3：写一个最小 SWC plugin（用 Rust + napi-rs）

SWC plugin 是 **Wasm 模块**，用 Rust 写。30 行内拦截所有 `console.log`：

```rust
use swc_core::{
    ecma::{ast::*, visit::VisitMut},
    plugin::plugin_transform,
};

struct ConsoleRemover;

impl VisitMut for ConsoleRemover {
    fn visit_mut_call_expr(&mut self, n: &mut CallExpr) {
        // 这里检查 n.callee 是不是 console.log，是的话清空参数
        // 实际逻辑略，重点是 visit_mut_xxx 方法的写法
        n.visit_mut_children_with(self);
    }
}

#[plugin_transform]
pub fn process(mut program: Program, _: ()) -> Program {
    program.visit_mut_with(&mut ConsoleRemover);
    program
}
```

`#[plugin_transform]` 是 SWC 的 proc macro，自动生成 Wasm 入口、与 host 的共享内存约定、序列化反序列化代码。`cargo build --target wasm32-wasi --release` 编译产物就是 `.wasm`，在 `.swcrc` 里写 `jsc.experimental.plugins: [['./my-plugin.wasm', {}]]` 即生效。

## 踩过的坑

1. **不做类型检查**：和 [[esbuild]] 一样，SWC 编译 TS 时只 **剥掉类型注解**——`const x: number = "hello"` 它照样编译过去。CI 必须配 `tsc --noEmit` 双跑，IDE 也要开 TS 检查。否则你以为类型对的代码运行时会爆炸

2. **Decorator 实现细节不一致**：SWC 同时支持 legacy decorator（TC39 stage 1，老版本）和 2022-03 decorator（TC39 新版本），两者语义有差别。Babel / tsc 的实现也不完全相同——同一份 NestJS 代码用 Babel 跑通，切到 SWC 可能某个装饰器顺序不对。配置选错会导致运行时差异

3. **Rust plugin ABI 不稳定**：每次升级 SWC 主版本，AST 节点结构可能微调，旧 plugin 需要重新编译对齐新版本。开发者发了一个 plugin，几个月后 SWC 升级 plugin 就跑不起来。这是 SWC 插件生态发展慢的根本阻力（10000+ Babel plugin vs 100+ SWC plugin）

4. **minify 输出比 terser 略大**：SWC 自带的 minifier 与 terser API 兼容，但在边角 case（特定的 dead code 消除、变量名 mangle 策略）上输出会大 1-3%。对极致追求 bundle size 的库作者来说仍倾向用 terser

## 适用 vs 不适用场景

**适用**：
- Next.js / Parcel 2 / Storybook 这类「需要把 transformer 当库链接」的工具——SWC 是 Rust crate，能内嵌进任何 Rust 项目
- 中大型 TS 项目的 transform 提速（500+ 文件）——速度收益显著
- 需要保留 Babel 风格 API 的项目迁移——`transform(code, opts)` 一对一替换

**不适用**：
- 重度依赖冷门 Babel plugin 的项目——要么 Wasm 重写要么放弃 SWC
- 需要类型检查的 TS 项目——必须额外配 tsc，SWC 永远不做这件事
- 库发包到 npm 追求最优 tree-shake 与 bundle size——用 [[rollup]] 仍是首选

## 历史小故事（可跳过）

- **2017 年**：DongYoon Kang（GitHub @kdy1，韩国开发者）作为个人项目开始写 SWC，命题是「用 Rust 重写 Babel」
- **2020 年**：v1.0 发布，README 直接对标 Babel 性能
- **2021 年**：Vercel 决定把 Next.js 12 的默认编译器从 Babel 切到 SWC，并直接资助 kdy1 全职维护——SWC 从「个人项目」升级为「Vercel 战略基础设施」
- **至今**：直接 + 间接调用每周 50M+，被 Next.js / Parcel 2 / Storybook 7+ / Deno 部分 / Vite 部分采纳；项目仍主要由 kdy1 一人主导

「Rust 重写 JS 工具链」浪潮里，SWC 是最完整的一份成果——既覆盖 transform/minify/bundle 三件套，又被 Next.js 全面采纳，事实上是「下一代 Babel」。

## 学到什么

1. **「换语言」+「数据结构内嵌」是性能终极武器**——Rust 的 trait dispatch + struct 偏移读，比 JS 的 hashmap lookup 快一个数量级。算法层能压的极限有限，runtime + 数据结构这两层才是天花板
2. **API 兼容是采纳的关键**——SWC API 对齐 Babel 是有意识的，没这一步 Vercel 也未必选它做 Next.js 默认编译器
3. **Wasm plugin 是赌注**——好处（跨语言 + 隔离 + 性能）短期看不出，坏处（生态启动慢 + ABI 不稳）立刻有。这是个长期才能赢的设计选择
4. **Rust 不是 Go 的替代品，是更下层的选项**——Rust 写出来的库能被任何 Rust 项目当 crate 链接（Turbopack / Rspack 都这么用），Go binary 只能外部调用。这是 SWC 战略价值的核心
5. **不做类型检查是性能选择**——tsc 类型检查占 80% 时间，删掉这部分才能跑到几毫秒。esbuild / SWC / Babel + preset-typescript 都做这个取舍

## 延伸阅读

- 官方文档：[swc.rs](https://swc.rs/)
- 配置参考：[swc.rs/docs/configuration/swcrc](https://swc.rs/docs/configuration/swcrc)
- 写 plugin 教程：[swc.rs/docs/plugin/ecmascript/getting-started](https://swc.rs/docs/plugin/ecmascript/getting-started)
- [[esbuild]] —— Go 写的同代竞争对手，速度接近，plugin 模型差异大
- [[turbopack]] —— Vercel 的下一代 bundler，把 SWC 当库链接

## 关联

- [[esbuild]] —— Go vs Rust 的同代之争；esbuild 速度接近但不能内嵌进 Rust 项目
- [[turbopack]] —— Vercel 的 Rust bundler，SWC 是它的 transformer 引擎
- [[rspack]] —— ByteDance的 Rust webpack 替代，也用 SWC 做 transform
- [[rollup]] —— 库发包场景的对照组，tree-shake 仍比 SWC 强

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[bun]] —— Bun — JS 全能运行时
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[rollup]] —— Rollup — ESM 优先的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[webpack]] —— webpack 模块打包

