---
title: SWC — 用 Rust crate 和 @swc/core 做 TS/JS 转译
description: 介绍 @swc/core 1.16.1 如何用 NAPI 做 transform/parse/minify，以及 .swcrc 与 Wasm plugin 边界。
来源: https://github.com/swc-project/swc
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/swc-project/swc
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 490c7d88ad15cf84ee410c69e19eef86f445d45b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.16.1
---

## 是什么

SWC（Speedy Web Compiler）是一套用 **Rust** 写的 TypeScript / JavaScript 编译器组件。日常类比：厨房还是那几道工序——读菜单、改写法、装盘——但灶台换成可以嵌进别的餐厅（Next.js / Rspack / Turbopack）的不锈钢柜。

固定 1.16.1 的 Node 包是 `@swc/core`。常见入口：

```js
import { transformSync } from "@swc/core";

const { code } = transformSync("export const n: number = 1;", {
  jsc: { parser: { syntax: "typescript" }, target: "es2022" },
  module: { type: "es6" }
});
```

同一包还导出 `parse` / `parseSync`、`minify` / `minifySync`、`print` 和 `bundle`。它们都挂在一个默认 `Compiler` 实例上。

## 为什么重要

不看固定 1.16.1 源码，旧印象容易把 SWC 写成“永远比 Babel 快 10 倍的高压锅”：

- 为什么下游能把 SWC **当 Rust crate 链接**，而不只是再开一个 Node 进程
- 为什么 JS 侧的 `plugins()` 已经标 deprecated，文档却还在讲 Wasm plugin
- 为什么 `.swcrc` 能直接让某个文件被 ignore
- 为什么 `@swc/core` 报 `1.16.1`，同提交的 `swc_core` crate 却报 `77.0.2`

## 核心要点

固定 1.16.1 的主链可以拆成五步：

1. **先找原生绑定**：`packages/core/src/index.ts` 先 `require("./binding.js")`，可用 `SWC_BINARY_PATH` 改路径。失败则记下 `@swc/wasm` 兜底。`finally` 返回这次拿到的 native binding，失败时为 `undefined`，后续方法再走 fallback。

2. **JS API 把选项打成 JSON Buffer**：`transform` / `parse` / `minify` 都先 `JSON.stringify` 再过 NAPI。`transform` 既接受源字符串，也接受已经 parse 好的 `Program`。

3. **遗留 JS plugin 会先 parse 再折返**：若仍传 `options.plugin` 函数，实现会 `parse`/`parseSync`，调用 `plugin(m)`，再把带 source context 的 `Program` 送回 `transform`。`plugins()` 辅助函数本身已 deprecated，注释要求改用 Wasm plugin。

4. **Rust 侧按 pass 折叠 AST**：`Compiler::transform` 对 `Program` 做 `fold_with`。`process_js_with_custom_pass` 在自定义 before pass 之前会处理 decorator（若开启）、跑 `resolver`、剥 TypeScript 节点；若 `.swcrc` ignore 了该文件，直接 bail。

5. **配置文件是带注释的 JSON**：`parse_swcrc` 允许注释、尾逗号和文件头 BOM。同一 tag 上 npm 包是 `1.16.1`，`swc_core` crate 是 `77.0.2`。

## 实践示例

### 案例 1：同步转译 TS，并显式关掉 .swcrc

```js
import { transformSync } from "@swc/core";

const out = transformSync(src, {
  filename: "app.ts",
  swcrc: false,
  jsc: {
    parser: { syntax: "typescript", tsx: true },
    target: "es2022",
    transform: { react: { runtime: "automatic" } }
  },
  module: { type: "es6" }
});
```

JS API 不会因为你“碰巧有一份 `.swcrc`”就自动合并；要不要读配置取决于调用方传入的 `swcrc` 与 Rust 配置加载。CLI / `process_js_file` 才更常走文件查找。

### 案例 2：parse 出 Program，再 print 回去

```js
import { parseSync, printSync } from "@swc/core";

const program = parseSync("const n: number = 1;", {
  syntax: "typescript"
});
const { code } = printSync(program);
```

`parse` / `parseSync` 在 d.ts 上标了 deprecated，注释写 “Use Rust instead”。它们仍可用：原生路径返回 JSON，再 `parseProgramJson`；若 JSON 带 `program` + `sourceContext`，会把上下文挂到不可枚举的 symbol 上，供后续 `print`/`transform` 还原。

### 案例 3：minify 与 transform 是两条入口

```js
import { minifySync } from "@swc/core";

const { code } = minifySync("function hello(name) { return name; }", {
  compress: true,
  mangle: true
});
```

`minify` 走 `Compiler::minify` + `JsMinifyOptions`，不是再包一层 `transform`。本轮未对比输出体积。

## 踩过的坑

1. **SWC 不做类型检查**：`const x: number = "hello"` 仍会转译。类型错误要另跑 `tsc --noEmit`。
2. **把 JS `plugins()` 当成当前推荐面**：该辅助函数已 deprecated。遗留 `options.plugin` 仍会走 parse → 函数 → transform；Wasm fallback 会警告并忽略它。
3. **把 `@swc/core@1.16.1` 和 `swc_core@77.0.2` 当成同一套 semver**：它们出现在同一提交，但版本号不是一条线。
4. **以为 `.swcrc` 只是“默认选项”**：Rust 路径上被 ignore 的文件会直接 `cannot process file because it's ignored by .swcrc`。
5. **把旧页的 10–20 倍、1–2 秒、周调用量当成本轮证据**：那些数字未在本 revision 测量。

## 适用 vs 不适用场景

**适用**：

- 需要把 TS/JSX 转成可运行 JS，并接受“不类型检查”
- 下游是 Rust bundler / 框架，要把 SWC 当 crate 链接
- 想用和 Babel 相近的 `transform(code, opts)` 迁调用点，而不是迁整个 plugin 生态

**不适用**：

- 依赖大量 Babel plugin、又没有 Wasm 替代——生态不是一对一
- 需要类型检查当编译期门禁——必须外挂 `tsc`
- 只要一份 ESTree 给 JS 工具接着走——[[oxc-parser]] 的合同更窄
- 不能接受 `engines.node >= 10` 与 native / Wasm 双绑定并存

## 固定版本边界

- 本文绑定 `swc-project/swc@490c7d88ad15cf84ee410c69e19eef86f445d45b`。`v1.16.1` 是 annotated tag（对象 `234b572d...`），剥皮后即此提交。
- npm `@swc/core@1.16.1` 无 `gitHead`；`package.json` 的 `version` 为 `1.16.1`。同提交 `swc_core` 为 `77.0.2`。
- Node `engines` 为 `>=10`。`@swc/helpers` 是 optional peer（`>=0.5.17`）。
- `DEFAULT_EXTENSIONS` 冻成 `.js/.jsx/.es6/.es/.mjs/.ts/.tsx/.cts/.mts`。
- 本文未安装依赖、运行上游测试、加载 Wasm plugin 或测量速度，状态保持 `UNVERIFIED`。

## 学到什么

1. **“当库链接”才是 SWC 对 bundler 的合同**——不只是多一个更快的 CLI。
2. **JS plugin 和 Wasm plugin 不是同一代 API**——源码已经把 JS 辅助面标成遗留。
3. **npm 版本和 crate 版本可以分家**——读 tag 时要同时看 `@swc/core` 与 `swc_core`。
4. **忽略规则是硬失败，不是悄悄跳过输出**——`.swcrc` ignore 会 bail。

## 应用型自测

1. `@swc/core` 的 `transformSync` 会不会做 `tsc` 那种类型检查？
2. 固定 1.16.1 里，JS `plugins()` 还是不是推荐入口？
3. tag `v1.16.1` 上的 `swc_core` crate 版本是不是也叫 `1.16.1`？

检查点：

1. 不会。它剥类型、转语法，不跑类型检查。
2. 不是。该函数标了 deprecated，注释要求改用 Wasm plugin。
3. 不是。同提交里 `swc_core` 报 `77.0.2`。

## 延伸阅读

- 官方文档：[swc.rs](https://swc.rs/)
- 配置参考：[swc.rs/docs/configuration/swcrc](https://swc.rs/docs/configuration/swcrc)
- 固定源码：[swc-project/swc](https://github.com/swc-project/swc) —— 本文绑定提交 `490c7d88ad15cf84ee410c69e19eef86f445d45b`
- 审查记录：仓库内 `docs/js-transform-source-review-20260827-ip.md`
- [[oxc-parser]] —— 只解析、交出 ESTree 的 Node 对照
- [[esbuild]] —— Go 写的同代 bundler / transformer，插件模型不同

## 关联

- [[oxc-parser]] —— 同代 Rust 句法层，但不在这个包里做 transform
- [[oxc]] —— 另一条 Rust JS 工具链，AST 与发布模型不同
- [[esbuild]] —— Go vs Rust；esbuild 更常被当成完整 bundler
- [[turbopack]] —— Vercel bundler，把 SWC 当库链接
- [[rspack]] —— 用 SWC 做 transform 的 webpack 替代
- [[rolldown]] —— 走 oxc 而不是 SWC 的打包器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[engine262]] —— engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[oxc]] —— oxc — 用一份 arena AST 串起 JS/TS 编译器组件
- [[oxc-parser]] —— oxc-parser — 把 JS/TS 源码收成一份 ESTree
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[rolldown]] —— rolldown — 用 Rust 实现 Rollup 兼容协议的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[webpack]] —— webpack 模块打包
