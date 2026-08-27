---
title: esbuild — 用 Go 写的 JS/TS 打包与转译器
来源: https://github.com/evanw/esbuild
日期: 2026-05-29
分类: 构建工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/evanw/esbuild
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 609683d892977362a0f99026cb74b96263d728a9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.28.2
---

## 是什么

esbuild 是一个用 Go 写的 JavaScript / TypeScript 打包器与转译器。日常类比：它像一条把原料一次送进厨房的生产线——读文件、解析、降级、打包、压缩可以接在同一条链上，但**不负责检查菜谱对不对**（不做类型检查）。

你写：

```bash
esbuild app.tsx --bundle --outfile=out.js
```

或在 JS API 里调用 `build()` / `transform()`。固定 `0.28.2` 同时提供 CLI、`pkg/api` Go API 与 npm `esbuild` 包（后者再拉起原生二进制）。

## 为什么重要

不理解固定版本的合同，下面这些事会说错：

- 为什么 `const x: number = "hello"` 能被编译通过
- 为什么 Vite 一类上层工具能把它当快速 transform / 预打包引擎，却仍要另配类型检查
- 为什么 plugin 能改路径和文件内容，却写不出 Babel 那样的逐节点 visitor
- 为什么 `build` 和 `transform` 不是同一套能力

## 核心要点

固定 `0.28.2` 的主链可以拆成四层：

1. **每个 JS 模块至少两遍**：`js_parser` 先建 AST 与作用域，再 bind、常量折叠，并按 `target` lower。打包还要经过 `ScanBundle` → `linker.Link` → print。这不是“只扫一次 token”的单遍编译器。

2. **TypeScript 只剥类型**：parser 把类型表达式当空白跳过，不生成类型 AST。源码明确建议另跑 TypeScript checker。

3. **`build` ≠ `transform`**：`build` 走真实文件系统、模块图和 plugin；`transform` 走 mock FS + stdin，**不支持 plugin**。需要 watch / serve / 多次 rebuild 时用 `context()`。

4. **plugin 只拦解析与加载**：钩子是 `onStart`、`onResolve`、`onLoad`、`onEnd`、`onDispose`，另有 `resolve()`。没有通用 AST transform hook。CSS 只有内置 parser / CSS modules，没有 PostCSS 或 Sass 管线。

## 实践示例

### 案例 1：CLI 打包一份 TSX

```bash
esbuild src/main.tsx --bundle --format=esm --target=es2017 --outfile=dist/bundle.js
```

`--bundle` 才会顺着 import 建模块图。未设 `--bundle` 时，默认只转译单个入口。`platform` 未写时默认 `browser`；若打包且未写 `--format`，browser 会落到 `iife`。

### 案例 2：JS API 的 build 与 transform

```js
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  format: "esm",
  platform: "browser",
  outdir: "dist",
  sourcemap: true,
});

const { code } = await esbuild.transform("export const n: number = 1", {
  loader: "ts",
  target: "es2015",
});
```

`transform` 适合单文件剥类型 / 降级。要插件、外部包策略或拆 chunk，必须走 `build`。`minify: true` 会同时打开 syntax、whitespace、identifiers 三项。

### 案例 3：用 onResolve / onLoad 拦截 SVG

```js
const svgInline = {
  name: "svg-inline",
  setup(build) {
    build.onResolve({ filter: /\.svg$/ }, (args) => ({
      path: args.path,
      namespace: "svg",
    }));
    build.onLoad({ filter: /.*/, namespace: "svg" }, async (args) => ({
      contents: `export default ${JSON.stringify(args.path)}`,
      loader: "js",
    }));
  },
};
```

真实读文件时要把相对路径拼上 `args.resolveDir`。`onStart` / `onEnd` / `onDispose` 存在，但改不了 AST 节点；要改语法只能在 `onLoad` 里自己产出 JS。

## 踩过的坑

1. **以为 esbuild 会做类型检查**：`const x: number = "hello"` 会原样剥类型后输出。生产项目仍要 `tsc --noEmit` 或 IDE 检查。

2. **把 plugin 当成 Babel plugin**：这里没有 visitor。`transform()` 甚至完全不跑 plugin。

3. **Node 打包默认 mainFields 不利于 tree-shaking**：`platform: "node"` 默认先看 `"main"` 再看 `"module"`。要摇 ESM 树需要显式改 `mainFields`。`treeShaking` 只在 `bundle: true` 或 `format: "iife"` 时默认打开。

4. **把 CSS / Vue SFC 当成内置能力**：固定源码能解析标准 CSS、嵌套和 `.module.css`，没有 Sass/Less/PostCSS plugin 宿主，也没有 `.vue` loader。

## 适用 vs 不适用场景

**适用**：

- 单文件 TS / JSX transform，或中小型项目的 production bundle
- 需要 `onResolve` / `onLoad` 就能完成的资源拦截
- 上层工具把原生二进制当库拉起，而不是再包一层 JS bundler

**不适用**：

- 需要类型检查、完整 Babel plugin 生态，或 Vue SFC / MDX 一类多段编译
- 需要 PostCSS / Sass 作为一等 CSS 管线
- 把 minify 体积或“比 webpack 快 N 倍”当成固定合同——本文未测量

## 固定版本边界

- 本文绑定 `evanw/esbuild@609683d8...`，tag / npm `gitHead` / `version.txt` 均为 `0.28.2`。
- 仍是 0.x；这只说明当前版本号，不是“永不发 1.0”的承诺。
- 未安装依赖、未跑上游测试、未测吞吐或包体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **快路径常常以“不做类型检查”换来**——剥类型和验证类型是两件事
2. **打包 API 和单文件 transform 能力不对等**——plugin、外部包、拆 chunk 只活在 `build`
3. **plugin 的克制是性能合同的一部分**——只开 resolve/load，就把 AST 变换推给调用方
4. **默认值按 platform / format 分叉**——不读源码会把 browser IIFE 或 node mainFields 抄错

## 应用型自测

1. `esbuild.transform(ts, { loader: "ts" })` 遇到类型错误，会像 `tsc` 一样失败吗？
2. 只调用 `transform()` 并传入 `plugins: [svgInline]`，`onLoad` 会运行吗？
3. `platform: "node"` 且不改 `mainFields` 时，默认先解析 `package.json` 的哪个字段？

检查点：

1. 不会。类型被跳过，非法 TS 只要能 parse 就会输出 JS。
2. 不会。`transform` 不支持 plugin。
3. 先 `"main"`，再 `"module"`。

## 延伸阅读

- 官方文档：[esbuild.github.io](https://esbuild.github.io/)
- 固定源码：[evanw/esbuild](https://github.com/evanw/esbuild) —— 本文绑定提交 `609683d892977362a0f99026cb74b96263d728a9`
- [[swc]] —— Rust 侧的 transform / minify 对照；插件模型是 Wasm，不是 onResolve/onLoad
- [[vite]] —— 常见的上层消费方之一，具体默认引擎以 Vite 当前版本为准
- [[rollup]] —— 库发包与更细 tree-shake 的对照组

## 关联

- [[swc]] —— 同赛道的 Rust 编译器；API 与插件模型不同
- [[vite]] —— 上层构建工具，常把原生 transform 嵌进 dev / 预打包路径
- [[rollup]] —— ESM 库打包对照
- [[rspack]] —— 另一条“换语言重写 JS 工具”路线
- [[turbopack]] —— 增量 bundler 对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[bun]] —— Bun — JS 全能运行时
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[rollup]] —— Rollup — ESM 优先的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vitest]] —— Vitest — Vite 原生测试框架
- [[webpack]] —— webpack 模块打包
