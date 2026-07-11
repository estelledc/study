---
title: rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
来源: 'https://github.com/web-infra-dev/rspack'
日期: 2026-05-30
分类: 构建工具
难度: 中级
---

## 是什么

rspack 是一个**用 Rust 写的 JavaScript 打包器**（bundler），它最特别的地方是：**几乎不改 config 就能替换 webpack**。日常类比：像把一辆老车的发动机换成电动马达，但方向盘、座椅、车门把手原样保留——你坐进去开，感觉一样，加速却快了 10 倍。

webpack 是过去 10 年前端构建的事实标准，它的 plugin / loader 生态有几千个包。新一代工具（esbuild / vite）选择重新设计 API、抛弃旧生态；rspack 选择**反过来**——内部全部用 Rust 重写编译流水线，但对外仍然暴露 webpack 的 plugin hook 接口。

最小迁移示例：

```js
// webpack.config.js → rspack.config.js
module.exports = {
  entry: './src/index.js',
  module: { rules: [{ test: /\.tsx?$/, loader: 'builtin:swc-loader' }] },
}
```

只把 `webpack` 换成 `rspack`、把 `babel-loader` 换成内置 SWC loader，跑起来就是。

## 为什么重要

不理解 rspack，下面这些事都没法解释：

- 为什么 2024 年起头部公司开始把主仓库从 webpack 切到 rspack，但**不需要重写 plugin**
- 为什么 vite 已经很快了还要再造一个 rspack——两者的赌注不同
- 为什么 SWC（Rust 写的 JS parser）的出现让 rspack 这种项目才变得可能
- 为什么"兼容性"在工程项目里有时比"性能"更值钱

## 核心要点

rspack 的设计决策可以拆成 **三个赌注**：

1. **plugin API 兼容**。rspack 通过 napi 把 Rust 内部状态暴露成和 webpack 一致的 `compilation.hooks.processAssets` 这类 hook。类比：新发动机假装自己有老发动机的所有接口接头，老配件插上去就能用。

2. **phase 全部 Rust**。编译流水线 resolve → loader → parse → ModuleGraph → ChunkGraph → emit 每一段都是 Rust 实现。parse 用 SWC，比 babel 快 20 倍以上。类比：一条工厂流水线从手工换成机械臂。

3. **napi 边界做必要妥协**。js loader 仍跑在 Node 子进程（兼容旧 loader），但官方鼓励换成 builtin SWC / postcss loader 跑在 Rust 内。类比：只在不得不见客户的工位放真人，其他工位都自动化。

三个赌注一起押，就是"在不丢生态的前提下换发动机"。

## 实践案例

### 案例 1：把 webpack 项目迁到 rspack

一个用了 5 年的 webpack 项目，`webpack.config.js` 几百行，cold start 90 秒。迁移过程：

```bash
pnpm add -D @rspack/cli @rspack/core
# 把脚本里的 webpack 换成 rspack
"build": "rspack build"
"dev": "rspack serve"
```

绝大多数 plugin 不用动。**逐部分解释**：

- HTML / CSS 抽取等常见能力有内置实现（如 `HtmlRspackPlugin`）；社区 `html-webpack-plugin` 也仍可直接用，只是内置版是性能向子集，不是「同名照搬」
- 自定义 plugin 用了 `compilation.hooks.processAssets`，rspack 通过 napi 暴露同名 hook，多数能直接跑
- 慢的根因 `babel-loader` 换成 `builtin:swc-loader`——这一步通常能砍掉大半编译时间

### 案例 2：用 Rsbuild 起一个 React 项目（rspack 上层）

直接用 rspack 写 config 还是要 100 行；Rsbuild 是 web-infra-dev 团队出的 rspack 上层封装，开箱即用：

```js
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact()],
})
```

3 行 config，就有 dev server / HMR / TS / JSX / CSS modules / 生产构建全套。**逐部分解释**：

- Rsbuild 把"常用 plugin 组合"做成预设，省掉 webpack 时代那种"先学 100 个 plugin"的负担
- 内核仍是 rspack，遇到极端定制需求时可以"逃生舱"——直接拿到 rspack config 改

### 案例 3：观察 rspack 的内部 phase

```ts
import rspack from '@rspack/core'
const compiler = rspack({ entry: './src/index.ts' })
compiler.hooks.compilation.tap('demo', (compilation) => {
  compilation.hooks.processAssets.tap(
    { name: 'demo', stage: rspack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE },
    (assets) => console.log('assets after optimize:', Object.keys(assets))
  )
})
```

这段 plugin 在 webpack 也能跑（**几乎一字不差**）。背后 rspack 通过 napi 把 Rust 侧的 `Compilation` 对象代理给 Node，hook 触发时回调 js 函数——这就是兼容层的核心。

## 踩过的坑

1. **不是 100% 兼容**。少数 plugin 直接读 `module.dependencies` 这种 webpack 内部字段，rspack 的内部数据结构不同会撞到；依赖这些私有字段的包往往需要适配或换官方替代。

2. **Node loader 跨边界开销**。babel-loader / ts-loader 仍跑在 Node 子进程，每个文件都要跨 Rust ↔ Node 序列化一次。文件多时收益打折，建议换成 builtin SWC loader。

3. **HMR 边界判定细节有差**。某些 framework 的热替换依赖 webpack 特定 `module.hot.accept` 行为，rspack 在边界场景表现略有不同，建议用 rsbuild 这一层规避。

4. **早期 API 仍在变**。v0.x 写的 plugin 在 v1.0 后部分 hook 名 / signature 调整过，升级时务必读 changelog；v1.x 之后 API 已稳定。

## 适用 vs 不适用场景

**适用**：
- 大型 webpack 项目（monorepo / 几千个 entry / 几万个 module）想换 Rust 但不想重写 plugin
- 需要细粒度 plugin hook（webpack 生态依赖最重的场景）
- 团队不想抛弃过去 5 年积累的 webpack 内部知识

**不适用**：
- 小项目从零开始 → vite 更轻、生态更完整
- 不需要 plugin 定制的库 / 工具 → tsup / unbuild / rolldown 更直接
- 极致冷启动需求且接受重写 → esbuild 仍是最快
- ESM 优先、不想编 chunk → vite dev 模式就够

## 历史小故事（可跳过）

- **2022 年**：web-infra-dev 团队立项，背景是大型仓库 webpack 编译时间已经无法接受，esbuild / vite 不兼容 webpack plugin 导致迁移成本过高。
- **2023 年 3 月**：rspack v0.1 公开发布，主打"webpack-compatible Rust bundler"；同年仍处 v0.x 快速迭代。
- **2023 年 11 月**：Rsbuild 0.1 发布，把常用配置收成开箱即用上层。
- **2024 年 8 月**：rspack 1.0 正式发布（API 稳定、生产可用）；同期 Rspress / Rslib / Rsdoctor 等配套继续补齐，后续还有 Rslint 等 Rstack 工具。
- **2025 年起**：被多家头部公司用在主仓库 ci / dev。

## 学到什么

1. **兼容性可以是杀手特性**。重写性能 10 倍的工具有很多，但敢说"老 plugin 直接能跑"的几乎没有——这就是市场缝隙。
2. **napi 让 Rust ↔ Node 桥接成熟**。没有 napi-rs 这个底层，rspack 的兼容层根本写不动。
3. **配套工具链才是终态**。光有 rspack 内核还不够，要 Rsbuild / Rspress / Rslib 一整套包出来，开发者才会上车。
4. **构建工具的下一代不是"换 API"，而是"留 API 换内核"**。

## 延伸阅读

- 官方文档：[rspack.dev](https://rspack.dev/)（中英双语，含从 webpack 迁移指南）
- 设计博客：[Rspack 1.0 release notes](https://rspack.dev/blog/announcing-1-0)（讲为什么选兼容路线）
- 视频：[Rspack: A Rust-based webpack-compatible bundler](https://www.youtube.com/results?search_query=rspack)（社区分享合集）
- [[webpack]] —— rspack 兼容的对象，理解 webpack 才能理解 rspack 的设计选择
- [[swc]] —— rspack 内部 parse phase 用的 Rust JS/TS 解析器
- [[rolldown]] —— vite 团队的 Rust bundler，对照看两条路线

## 关联

- [[webpack]] —— rspack 的兼容目标，plugin / loader 接口照搬
- [[swc]] —— rspack 内部 parse 用 SWC，砍掉 babel 时间
- [[turbopack]] —— vercel 的 Rust bundler，与 rspack 同代但选了 next 专属路线
- [[vite]] —— 另一条路线代表，dev 模式不打包，与 rspack 思路对立
- [[esbuild]] —— 早期 Rust/Go 路线开拓者，速度极快但 plugin 接口不兼容 webpack
- [[rolldown]] —— rollup 的 Rust 重写，思路与 rspack 类似但目标是 rollup 兼容
- [[biome]] —— 同样 Rust 重写工具链思路（lint / format），rspack 是 bundler 侧表达

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[webpack]] —— webpack 模块打包

