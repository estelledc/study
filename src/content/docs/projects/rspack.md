---
title: rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
来源: 'https://github.com/web-infra-dev/rspack'
日期: 2026-05-30
分类: 构建工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/web-infra-dev/rspack
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e4d321c088d4f1396ae9d332a947a4c2e060420c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.2.0
---

## 是什么

Rspack 是一个用 Rust 写的 JavaScript 打包器，对外尽量保持 webpack 形状的 Compiler / Compilation / hook。日常类比：换发动机，但方向盘和挡位还按老车来。

固定 `v2.2.0` 里，JS 入口 `rspack(options)` 先规范化配置、挂 plugin，再把真正的图构建和 seal 交给 Rust `Compiler::build`。`@rspack/core` 还把 `version` 设成 `5.75.0`，专门骗那些靠 webpack 版本号做检测的 plugin。

```js
import rspack from "@rspack/core";

const compiler = rspack({
  entry: "./src/index.js",
  module: { rules: [{ test: /\.tsx?$/, loader: "builtin:swc-loader" }] }
});
```

它不是“把 webpack 配置原封不动保证能跑”的承诺，而是一条兼容路线：hook 名字和 stage 尽量对齐，内部数据结构可以不同。

## 为什么重要

不理解 Rspack，下面这些事都没法解释：

- 为什么有人从 webpack 迁走，却还在写 `compilation.hooks.processAssets`
- 为什么 `rspack.version` 看起来像 webpack 5.75，而包版本其实是 2.2.0
- 为什么 JS loader 和 `builtin:` loader 走两条执行路径
- 为什么 Rsbuild / Rslib 是另一组仓库，不能当成本仓的内置预设

## 核心要点

固定版本的主链可以拆成四层：

1. **JS 只做 webpack 门面**。`createCompiler()` 建 `Compiler`，跑 `plugins[].apply`，再 `RspackOptionsApply.process`。`rspack()` 也可走 callback：`run` 完再 `close`。

2. **Rust `compile` 是一串 pass**。`this_compilation` / `compilation` hook 之后，`run_passes` 按固定顺序走：build module graph → finish modules → seal → 优化依赖/chunk/module → 分配 id → code generation → process assets → after seal。

3. **兼容是 hook 级，不是内部字段级**。`Compilation.PROCESS_ASSETS_STAGE_*` 的数字与 webpack 对齐。读 `module.dependencies` 这类私有结构仍可能失败。`HtmlRspackPlugin` 是 builtin（`version = 5`），不是社区 `html-webpack-plugin` 的别名。

4. **loader 分界在 `builtin:`**。Rust 侧有自己的 loader runner；JS loader 经 `JsLoaderRspackPlugin` 进 `loader-runner` worker。官方鼓励 TS/JS 用 `builtin:swc-loader`，避免每个文件都跨语言搬源码。

## 实践示例

### 案例 1：用 `@rspack/core` 直接 build

```js
import rspack from "@rspack/core";

const compiler = rspack({
  context: process.cwd(),
  entry: "./src/index.ts",
  module: {
    rules: [{ test: /\.tsx?$/, loader: "builtin:swc-loader" }]
  },
  plugins: [new rspack.HtmlRspackPlugin({ template: "./index.html" })]
});

compiler.run((err, stats) => {
  compiler.close(() => {
    if (err) throw err;
    console.log(stats.toString({ colors: true }));
  });
});
```

`HtmlRspackPlugin` 和 `builtin:swc-loader` 都在本仓。CLI（`rspack build` / `rspack serve`）在 `@rspack/cli`，不在这份 `@rspack/core` 源码里。

### 案例 2：webpack 风格的 processAssets hook

```js
compiler.hooks.compilation.tap("demo", (compilation) => {
  compilation.hooks.processAssets.tap(
    {
      name: "demo",
      stage: rspack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE
    },
    (assets) => {
      console.log(Object.keys(assets));
    }
  );
});
```

stage 常量从 `-2000`（ADDITIONAL）到 `5000`（REPORT）。能 tap 不等于能读 webpack 内部对象。

### 案例 3：看清 version 双轨

```js
import rspack from "@rspack/core";

console.log(rspack.rspackVersion); // 包版本，固定源码为 2.2.0
console.log(rspack.version);       // webpack 兼容号，固定为 5.75.0
```

`package.json` 的 `webpackVersion` 在构建时打进 `WEBPACK_VERSION`。用版本号分支行为的 plugin 会以为自己在 webpack 5.75。

## 踩过的坑

1. **不是 100% webpack**。依赖 compiler 私有字段、未文档化 hook 或特定 loader 上下文的包仍要适配。`webpackVersion` 只解决“查版本号”这一层。

2. **JS loader 仍跨边界**。`babel-loader` / `ts-loader` 跑在 loader-runner worker 里，每个文件都要和 Rust 交换。文件多时收益取决于你有没有换成 `builtin:` loader。

3. **Node 版本被硬检查**。`checkNodeVersion.ts` 要求 Node 20.19+ 或 22.12+；更老的 20.x / 22.x 会在入口打印 unsupported。

4. **Rsbuild 不是本页对象**。开箱 React/TS 预设在 `web-infra-dev/rsbuild`。本仓只保证 bundler 内核与 builtin plugin。

## 适用 vs 不适用场景

**适用**：

- 已有 webpack 配置和 hook 插件，想换 Rust 内核
- 需要 `processAssets` 这类细粒度资产 hook
- 可以逐步把慢 loader 换成 `builtin:swc-loader`

**不适用**：

- 只要库打包、不想要 webpack runtime / chunk 模型 → 看 [[rollup]]
- 从零开始、更想要 Vite 的 ESM dev 模型
- 必须 100% 复用 webpack 私有内部结构

## 固定版本边界

- 本文绑定 `web-infra-dev/rspack@e4d321c0...` / annotated tag `v2.2.0`；`@rspack/core@2.2.0` 无 npm `gitHead`。
- Node engines：`^20.19.0 || >=22.12.0`。`webpackVersion` 为 `5.75.0`。
- 官网在本修订中为 `https://rspack.rs`。
- 本文未安装依赖、运行测试、HMR 或性能 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **兼容可以是版本号 + hook，而不是内部对象**——`version = 5.75.0` 是显式策略。
2. **编译是一条 Rust pass 链**——make / seal / processAssets 对得上 webpack 阶段名。
3. **builtin loader 和 JS loader 成本不同**——前缀 `builtin:` 才留在 Rust 里。
4. **上层工具链在别的仓库**——Rspack 内核不等于 Rsbuild 体验。

## 应用型自测

1. `console.log(rspack.version)` 在固定 2.2.0 会打印 `2.2.0` 吗？
2. 一个只读 `module.dependencies` 的 webpack plugin，能否仅凭 `processAssets` stage 数字相同就保证能跑？
3. 把 `ts-loader` 换成 `builtin:swc-loader`，JS loader worker 还会处理这些 `.ts` 文件吗？

检查点：

1. 不会。`version` 是 webpack 兼容号 `5.75.0`；包版本在 `rspackVersion`。
2. 不能。stage 对齐不等于内部字段对齐。
3. 不会按 JS loader 路径跑；`builtin:` 走 Rust loader runner。

## 延伸阅读

- 固定源码：[web-infra-dev/rspack](https://github.com/web-infra-dev/rspack) —— 本文绑定提交 `e4d321c088d4f1396ae9d332a947a4c2e060420c`
- pass 链：[run_passes.rs](https://github.com/web-infra-dev/rspack/blob/e4d321c088d4f1396ae9d332a947a4c2e060420c/crates/rspack_core/src/compilation/run_passes.rs)
- 文档：[rspack.rs](https://rspack.rs/)
- [[webpack]] —— 兼容目标
- [[rollup]] —— 本批对照：ESM 库打包合同
- [[swc]] —— `builtin:swc-loader` 背后的编译器

## 关联

- [[webpack]] —— plugin / loader 接口的兼容目标
- [[rollup]] —— ESM-first 库打包的对照
- [[swc]] —— builtin JS/TS loader 使用的编译器
- [[turbopack]] —— 同代 Rust bundler，Next 专属路线
- [[vite]] —— ESM dev、生产另绑打包器的路线
- [[rolldown]] —— Rollup 兼容路线的 Rust 重写

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[webpack]] —— webpack 模块打包
