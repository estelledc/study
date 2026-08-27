---
title: webpack — 用 Compiler 与 Compilation 钩子把模块图打成浏览器产物
来源: https://github.com/webpack/webpack
日期: 2026-08-27
分类: 构建工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/webpack/webpack
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6a24bd65b72c43207c36ce61b54e1f5833486906
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.109.2
---

## 是什么

webpack 是一个先把入口及其依赖收成模块图、再按 loader 与 plugin 钩子生成浏览器可加载资源的打包器。日常类比：像一座有安检传送带的分拣中心——每个包裹（模块）先过关卡翻译（loader），整趟班次再由调度员在固定站点插队（plugin hook），最后按目的地装车（chunk / asset）。

你写：

```js
const webpack = require("webpack");

const compiler = webpack({
  mode: "production",
  entry: "./src/index.js",
  output: { filename: "bundle.js" },
});
```

固定 5.109.2 的 `webpack()` 会先做 schema 校验，再 `createCompiler`。未传 `entry` 时，normalization 把它收成 `{ main: {} }`，而不是默默写成 `./src/index.js`。

## 为什么重要

不理解 webpack 5.109.2 的源码合同，下面这些事都会按脚手架印象写错：

- 为什么用户 plugin 会在部分 defaults 之前 `apply`
- 为什么 `use: ['style-loader', 'css-loader']` 的执行顺序“看起来反了”
- 为什么 Module Federation 不是一个单独 runtime，而是一组容器/共享插件
- 为什么 `webpack()` 本身不会打开 HMR

## 核心要点

一次编译可以拆成六步：

1. **规范化与默认值**：`getNormalizedWebpackOptions` → 基础 defaults → interception → 创建 `Compiler`。

2. **用户 plugin 先挂上**：数组里的函数或 `{ apply }` 在剩余 defaults 之前执行，因此 plugin 能改后续默认值。

3. **应用选项并 initialize**：`environment` / `afterEnvironment` 之后由 `WebpackOptionsApply.process` 装入内部 plugin，再 `initialize`。

4. **make 建图**：`beforeCompile` → `compile` → `make` 从 entry 递归收依赖，`finishMake` 后 `finish`。

5. **seal 定图**：分 chunk、做优化（含 `sideEffects` / used exports）、生成代码。

6. **emit 出盘**：`shouldEmit` 通过后写资产，再 `afterEmit` / `done`。

## 实践案例

### 案例 1：最小配置仍要显式 entry

```js
// webpack.config.js
const path = require("node:path");

module.exports = {
  mode: "production",
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  module: {
    rules: [
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      { test: /\.png$/, type: "asset/resource" },
    ],
  },
};
```

`asset/resource` 是 webpack 5 内置模块类型，不必再配 file-loader。`use` 数组的 **normal 阶段从右往左**：先 `css-loader`，再 `style-loader`。

### 案例 2：loader 是单资源函数，plugin 是生命周期钩子

```js
// svg-to-js-loader.js
module.exports = function (source) {
  return `export default ${JSON.stringify(source)}`;
};
```

`NormalModule` 通过 `LoaderRunner` 跑这条链：pitch 阶段 `loaderIndex` 递增，normal 阶段递减。plugin 则 `compiler.hooks.*` / `compilation.hooks.*` 上 `tap`，改的是整次编译，不是单个文件字符串。

### 案例 3：Module Federation 是组合插件

```js
const { ModuleFederationPlugin } = require("webpack").container;

new ModuleFederationPlugin({
  name: "host",
  remotes: { app: "app@http://localhost:3001/remoteEntry.js" },
  shared: ["react"],
});
```

固定实现并不在一个类里写完联邦协议。`exposes` 走 `ContainerPlugin`，`remotes` 走 `ContainerReferencePlugin`，`shared` 走 `SharePlugin`，最后再挂 `HoistContainerReferences`。

## 踩过的坑

1. **以为 `webpack()` 默认开 HMR**：`HotModuleReplacementPlugin` 是 opt-in。dev server 热更新来自额外集成，不是 `createCompiler` 的默认值。

2. **只开 `mode: 'production'` 就断言 tree-shaking 完成**：`SideEffectsFlagPlugin` 还要读 `package.json` 的 `sideEffects` 和 rule 级 `sideEffects`；漏标副作用会留下模块。

3. **把 loader 顺序当成左到右一条直线**：pitch 从左到右，normal 从右到左。只记“数组顺序”会配反 CSS 链。

4. **用下载量或启动秒数比较 [[vite]]**：本文没有跑编译或 benchmark，不能写固定耗时。

## 适用 vs 不适用场景

**适用**：

- 需要 loader/plugin 生命周期、持久化模块图和成熟 Module Federation 组合的应用
- 已有大量 webpack plugin，迁移成本高于继续维护这条主链
- Node `>=10.13.0` 的构建环境

**不适用**：

- 希望默认走浏览器原生 ESM、以 html 为入口——那是 [[vite]] 8.2.2 的默认 `serve` 路径
- 只打包一个库的扁平 ESM——webpack 会带自己的 runtime 合同
- 把 HMR、dev server 或微前端运行时当成 `webpack()` 核心保证
- 需要本文未测量的冷启动或增量数字

## 固定版本边界

- 本文绑定 `webpack/webpack@6a24bd65b72c43207c36ce61b54e1f5833486906`，tag 与 npm `gitHead` 均为 `5.109.2`。
- 运行时依赖包含 `tapable`、`enhanced-resolve`、`webpack-sources`、`acorn`、`browserslist`。
- `webpack-dev-server` 与多数 loader 不在本包内。
- 本文未安装依赖、执行 `webpack` CLI、跑上游测试或测量产物，状态保持 `UNVERIFIED`。

## 学到什么

1. **模块图是后续优化的底板**——code splitting、sideEffects、used exports 都发生在 seal，而不是第一次读文件时。
2. **loader 与 plugin 不在同一层**——一个改资源文本，一个改编译生命周期。
3. **用户 plugin 时机提前**——先 `apply` 再补完 defaults，所以“默认值”对 plugin 作者不是只读快照。
4. **联邦是插件组合**——`exposes` / `remotes` / `shared` 各自落到不同内部 plugin。

## 应用型自测

1. `use: ['style-loader', 'css-loader']` 的 normal 阶段，哪一个先处理文件内容？
2. `webpack()` 没传 `entry` 时，normalization 会不会自动填 `./src/index.js`？
3. 只配 `remotes` 的 `ModuleFederationPlugin`，会不会创建 `ContainerPlugin`？

检查点：

1. `css-loader` 先。normal 阶段 `loaderIndex` 递减，数组右侧先跑。
2. 不会。未定义 entry 会被收成 `{ main: {} }`，不是隐式文件路径。
3. 不会。没有 `exposes` 时只走 `ContainerReferencePlugin`（以及可能的 `SharePlugin`）和 `HoistContainerReferences`。

## 延伸阅读

- Concepts：[webpack.js.org/concepts](https://webpack.js.org/concepts/)
- 固定源码：[webpack/webpack](https://github.com/webpack/webpack) —— 本文绑定提交 `6a24bd65b72c43207c36ce61b54e1f5833486906`
- [createCompiler](https://github.com/webpack/webpack/blob/6a24bd65b72c43207c36ce61b54e1f5833486906/lib/webpack.js)
- [[vite]] —— 默认先让浏览器加载模块
- [[rspack]] —— 兼容 webpack 插件面的另一条实现

## 关联

- [[vite]] —— 默认 unbundled serve；webpack 默认先建图再输出
- [[rollup]] —— ESM-first、偏库打包
- [[rspack]] —— webpack API 兼容的 Rust 实现
- [[esbuild]] —— 另一条更快的转换/打包路径，合同不同
- [[create-react-app]] —— 把 webpack 配置藏进脚手架的历史代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[glslify]] —— glslify — 给 GLSL 用的 npm 模块系统
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[listr2]] —— listr2 — 把 CLI 任务跑成一棵会自己画进度的树
- [[next-js]] —— Next.js — React 全栈框架
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[preact]] —— Preact — 3KB React 替代
- [[rollup]] —— Rollup — ESM 优先的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vitest]] —— Vitest — Vite 原生测试框架
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
