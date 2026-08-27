---
title: SWC — Rust 写的 TS/JS 编译器
来源: https://github.com/swc-project/swc
日期: 2026-05-29
分类: 构建工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
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

SWC（Speedy Web Compiler）是用 Rust 写的 TypeScript / JavaScript 编译器。日常类比：它像一座用原生机器运转的翻译厂——进门是 TS/JSX，出门是按配置降级、剥类型、可选压缩后的 JS；**质检（类型检查）不在厂内**。

固定 `1.16.1` 的 npm 包是 `@swc/core`。你写：

```ts
import { transformSync } from "@swc/core";
const { code } = transformSync(src, { jsc: { parser: { syntax: "typescript" } } });
```

同一包还导出 `parse` / `print` / `minify` / `bundle` 与 `Compiler`。`bundle` 是独立的 Spack 路径，不是 transform 的默认后缀。

## 为什么重要

不理解固定版本的合同，下面这些事会说错：

- 为什么切到 SWC 后类型错误消失了——它本来就不检查
- 为什么 React 17+ 的自动 JSX 没生效——默认 runtime 是 `classic`
- 为什么旧 Wasm plugin 升级后立刻报错——host 与 plugin 的 `swc_core` / AST schema 必须对齐
- 为什么 `transform` 和 `minify` 是两条入口，不能把 SWC 只理解成“更快的 Babel.transformSync”

## 核心要点

固定 `@swc/core@1.16.1`（`swc_core` `v77.0.2`）的主链是：

1. **parse → 变换 → 打印**：`Compiler` 先按 `.swcrc` / `Options` 解析，再跑 resolver、可选 decorator、TypeScript strip、Wasm plugin、React/JSX、optimizer、compat/`env`、module，最后可选 minify 与 codegen。

2. **剥类型，不做类型检查**：`swc_ecma_transforms_typescript` 去掉类型语法并处理 enum / namespace 等。parser 把部分 TS 语义错误留给 type checker。

3. **默认值会咬人**：`jsc.transform.react.runtime` 默认 `Classic`（源码注明 v2 可能改）。decorator 未写 `decoratorVersion` 时走 legacy/`2021-12` 路径；解析 TypeScript 时还会强制 `legacyDecorator: true`。`env` 与 `jsc.target` 不能同时开。

4. **插件是 Wasm，不是稳定 Babel visitor**：生产配置是 `jsc.experimental.plugins`。`swc_plugin_runner` 校验 AST schema；对不上就失败。`@swc/wasm` 回退会跳过 plugin，也没有 `bundle` / `parseFile`。JS 侧旧 `plugin` / `plugins()` 已标记 deprecated。

## 实践示例

### 案例 1：transformSync 剥 TS 并开自动 JSX

```ts
import { transformSync } from "@swc/core";

const { code } = transformSync(src, {
  filename: "app.tsx",
  jsc: {
    parser: { syntax: "typescript", tsx: true },
    transform: { react: { runtime: "automatic" } },
    target: "es2020",
  },
  module: { type: "es6" },
});
```

不写 `runtime: "automatic"` 时走 classic JSX，仍可能生成 `React.createElement`。`filename` 影响是否查找 `.swcrc`；省略时文档按 `swcrc: false` 处理。

### 案例 2：.swcrc 只描述解析与模块

```json
{
  "jsc": {
    "parser": { "syntax": "typescript", "tsx": true, "decorators": true },
    "target": "es2020",
    "transform": {
      "react": { "runtime": "automatic" },
      "decoratorVersion": "2022-03"
    }
  },
  "module": { "type": "es6" }
}
```

需要 stage-3 decorator 时必须显式选 `2022-03` 或 `2023-11`。只开 `decorators: true` 不够，默认仍可能走 legacy。本轮未展开 CLI 实现，验收以 `@swc/core` 读这份配置为准。

### 案例 3：独立 minify，而不是指望 transform 顺便压

```ts
import { minifySync } from "@swc/core";

const { code } = minifySync(js, {
  compress: true,
  mangle: true,
});
```

`minify` / `minifySync` 走 `swc_ecma_minifier::optimize`。transform 里设 `minify: true` 也会进同一套 pass，但默认是关的。这是 Terser 风格移植，不保证体积或字节与 Terser 一致。

## 踩过的坑

1. **不做类型检查**：和 [[esbuild]] 一样，类型错误只要能 parse 就会变成 JS。CI 仍要 `tsc --noEmit`。

2. **Decorator 默认不是 2022/2023 语义**：未设 `decoratorVersion` 走 legacy 路径；TS 还会强制 `legacyDecorator`。NestJS 一类代码从 Babel / tsc 切过来时，要先对版本。

3. **Wasm plugin 必须跟 host 的 swc_core 对齐**：schema 校验失败会直接 bail。`@swc/wasm` 下 plugin 被跳过。

4. **JSX 默认 classic**：React 17+ 项目不写 `runtime: "automatic"`，输出会回到旧工厂函数。

## 适用 vs 不适用场景

**适用**：

- 需要把 TS/JSX transform 或 minify 嵌进 Node / Rust 宿主
- 配置面接近 Babel（`transform(code, opts)`），但能接受剥类型、默认 classic JSX 和实验性 Wasm plugin
- 只要独立 minify API，不把打包当成主路径

**不适用**：

- 把类型检查、稳定 Babel plugin 生态或与 Terser 字节一致当成合同
- 依赖 `@swc/wasm` 还想跑 Wasm 插件或 `bundle`
- 需要本文未核验的 CLI 旗标语义——请回到 `swc_cli_impl` 或当前文档，不要从本页外推

## 固定版本边界

- 本文绑定 `swc-project/swc@490c7d88...`，`@swc/core` 与发布说明均为 `1.16.1`；npm 未暴露 `gitHead`。
- 许可为 Apache-2.0。Native 绑定来自 `binding_core_node`；失败时 postinstall 可回退 `@swc/wasm`。
- 未安装依赖、未跑上游测试、未声明下游框架默认编译器，状态保持 `UNVERIFIED`。

## 学到什么

1. **“更快的 Babel”不是 API 等价**——多了 parse/print/minify/bundle，默认值也不一样
2. **默认 runtime / decorator 比宣传口径更重要**——classic JSX 和 legacy decorator 都是源码里的 Default
3. **Wasm plugin 用版本门换隔离**——换来的是 ABI 耦合，不是无限稳定
4. **minify 和 transform 是两条合同**——打开 `minify: true` 才共享 minifier pass

## 应用型自测

1. `transformSync("const x: number = 'a'", { jsc: { parser: { syntax: "typescript" } } })` 会因为类型错误抛出吗？
2. 不写 `jsc.transform.react.runtime` 时，默认是 automatic 还是 classic？
3. 加载的是 `@swc/wasm` 回退绑定时，`jsc.experimental.plugins` 还会执行吗？

检查点：

1. 不会。它只剥类型，不跑 type checker。
2. classic。自动 JSX 必须显式写 `automatic`。
3. 不会。wasm 回退会跳过 plugin。

## 延伸阅读

- 官方文档：[swc.rs](https://swc.rs/)
- 固定源码：[swc-project/swc](https://github.com/swc-project/swc) —— 本文绑定提交 `490c7d88ad15cf84ee410c69e19eef86f445d45b`
- [[esbuild]] —— Go 侧对照：plugin 是 onResolve/onLoad，不是 Wasm
- [[turbopack]] —— 常见的 Rust 宿主对照，是否链接本版本需另核
- [[rspack]] —— 另一条嵌入式 transform 路线

## 关联

- [[esbuild]] —— Go vs Rust 的同代对照；能力边界不同
- [[turbopack]] —— Rust bundler 对照
- [[rspack]] —— 同样把原生 transform 嵌进打包器
- [[rollup]] —— 库发包与 tree-shake 对照组

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[bun]] —— Bun — JS 全能运行时
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[engine262]] —— engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[webpack]] —— webpack 模块打包
