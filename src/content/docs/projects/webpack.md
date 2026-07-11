---
title: webpack 模块打包
来源: https://github.com/webpack/webpack
日期: 2026-05-29
分类: 构建工具
难度: 中级
---

## 是什么

webpack 是一个**把一堆散落的前端文件合并成几个浏览器能直接加载的文件**的工具。日常类比：像一家快递打包公司——你工厂里有 100 个小箱子（每个装一个零件），客户家收件不能一次签 100 个，所以打包公司把它们重新分装成 3 个大箱子统一发出。

你写：

```js
// src/index.js
import { add } from './math.js'
import './style.css'
import logo from './logo.png'

console.log(add(1, 2))
```

浏览器**根本不懂** `import './style.css'` 或 `import logo from './logo.png'`——它只会下载 `<script>` 里的 JS。webpack 顺着 import 把 JS / CSS / 图片**合并并改写**成浏览器能直接吃的形态：一两个 `.js`、一个 `.css`、几张优化后的图片。

## 为什么重要

不理解 webpack，下面这些事都没法解释：

- 为什么 2014 年之前前端要在 HTML 里手写几十行 `<script src="...">`，而之后大家改用 `import`
- 为什么 React / Vue / Angular 脚手架（`create-react-app` / `vue-cli` / `angular-cli`）里都藏着一份 webpack 配置
- 为什么 TypeScript / Sass / SVG 这些**浏览器不认识**的东西能 `import` 进来——靠 loader 翻译
- 为什么"打包后 bundle 很大"是日常话题——默认把依赖都拼进去，得配 tree-shaking（砍掉没用到的导出）才瘦身

## 核心要点

webpack 的世界由 **三个抽象** 撑起来：

1. **entry → output 模型**：告诉它"从这个文件开始读" + "结果输出到这里"。中间顺着 `import` 递归读完依赖，构成一张"依赖图"。

2. **loader（处理非 JS 资源）**：每种文件类型挂一个翻译器。`.css` 用 `css-loader` 翻成 JS 模块、`.png` 用 `asset/resource` 复制到 dist 并返回 URL。loader 让"万物皆 module"成立。

3. **plugin（生命周期钩子）**：在编译不同阶段插自定义逻辑——生成 HTML、压缩、注入环境变量。它比 loader 更能改整次编译，而不只是单个文件。

三件套加起来就是配置文件的 80%。

## 实践案例

### 案例 1：最小 webpack.config.js

```js
// webpack.config.js（需安装 webpack、style-loader、css-loader）
const path = require('path')

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.png$/, type: 'asset/resource' },
    ],
  },
}
```

跑 `npx webpack` 后，入口及其 import 的 CSS / PNG 合并进 `dist/bundle.js`。`style-loader` 会在运行时把 CSS 塞进页面的 `<style>`，所以样式看得见。

### 案例 2：把 SVG 转成 React 组件的 loader

loader 是**纯函数**：输入文件字符串，输出一段 JS 字符串。教学示意（生产用 `@svgr/webpack`）：

```js
// svg-to-react-loader.js
module.exports = function (svgSource) {
  return `
    import React from 'react'
    export default function Icon(props) {
      return ${svgSource.replace('<svg', '<svg {...props}')}
    }
  `
}
```

三步理解：① webpack 读到 `.svg` 把文件内容当字符串交给 loader；② loader 包成 `export default function Icon`；③ 配置 `{ test: /\.svg$/, use: path.resolve('./svg-to-react-loader.js') }` 后，`import Logo from './logo.svg'` 得到的就是 React 组件。

### 案例 3：HMR（热模块替换）怎么工作

HMR：**改了代码不整页刷新，只换改动的模块**。`npx webpack serve --hot` 背后：

1. webpack-dev-server 起 WebSocket，浏览器打开页面时连上
2. 你改 `Button.jsx` → 只重新编译这一模块
3. 经 WebSocket 通知浏览器"模块 X 更新了"
4. 浏览器端 HMR runtime 用新模块替换旧模块并重渲染
5. 输入框内容、滚动位置等 state 得以保留——这比 `location.reload()` 体验好得多

## 踩过的坑

1. **配置爆炸**：生产级 `webpack.config.js` 常 200-500 行（HtmlWebpackPlugin / MiniCssExtractPlugin / TerserPlugin…），所以脚手架要把配置藏起来。
2. **冷启动慢**：JS 写、Node 单线程，10k 模块项目首次常 30-60 秒——这也是 [[esbuild]]（Go）/ [[rspack]]（Rust）起跑的原因。
3. **tree-shaking 不生效**：`mode: 'production'` 不够，还要 ESM 输入、minifier、`sideEffects` 写对、无顶层副作用；任一漏掉就部分失效。
4. **loader 链顺序反直觉**：`use: ['style-loader', 'css-loader', 'sass-loader']` 实际是 sass → css → style（**右往左**），新人几乎必翻车一次。

## 适用 vs 不适用场景

**适用**：

- 大型 SPA（10k+ 模块）——依赖图 + 持久缓存仍稳
- 企业内部老项目——迁到 Vite / Rspack 的成本常大于忍受慢启动
- 需要 micro-frontend（把大应用拆成可独立部署的小前端）——webpack 的 Module Federation（运行时共享模块的方案）成熟度最高
- 强依赖既有 webpack plugin 生态的项目

**不适用**：

- 全新中小型项目——优先 [[vite]]，dev 启动常 1-2s
- 写 npm 库——webpack 输出带 runtime 偏重，用 [[rollup]] 出扁平 ESM
- 单文件转换 / 极简工具——直接 esbuild
- Next.js 项目——框架已管构建；dev 优先用内置 Turbopack，不必自管 webpack 配置

## 历史小故事（可跳过）

- **2012**：Tobias Koppers（@sokra）读博时为游戏 demo 组织上百个 JS 文件，写出 webpack 0.1
- **2014-2017**：webpack 1→3 搭上 React 快车；create-react-app 默认 webpack，让百万开发者用上它
- **2020**：webpack 5 引入持久缓存与 Module Federation
- **2021+**：Tobias 加入 Vercel 做 [[turbopack]]；webpack 以兼容与维护为主，功能迭代放缓。Vite 成新项目默认，Rspack 成存量迁移现实路径（API 兼容、约 10x 速）

webpack 没"死"——npm 周下载量截至 2026 初仍约 30M+。但它从"默认选项"退到了"老项目维护选项"。

## 学到什么

1. **"万物皆 module"**——webpack 第一次把 JS / CSS / 图 / 字体抽象成同一种依赖节点
2. **依赖图是现代 bundler 的核心**——tree-shake / code splitting / 持久缓存都建在这张图上
3. **loader vs plugin**：loader 是单文件纯函数转换；plugin 是编译生命周期钩子
4. **学工具先看时代假设**：webpack 生于浏览器不懂 ESM 的 2012；Vite 生于浏览器已支持 native ESM 的 2020，复杂度差在假设，不在"谁更努力"

## 延伸阅读

- 官方 Concepts：[webpack.js.org/concepts](https://webpack.js.org/concepts/)（约 30 分钟入门）
- 写最简 plugin：[Writing a Plugin](https://webpack.js.org/contribute/writing-a-plugin/)（理解 hook 系统）
- `webpack-bundle-analyzer`：看 chunk / vendor / runtime 各占什么
- 对比：[Vite Why](https://vitejs.dev/guide/why.html)
- 进阶：Rspack docs（rspack.dev）——webpack-API-compatible 如何落地

## 关联

- [[vite]] —— 现代 dev 体验代表，dev 用 esbuild、build 用 rollup
- [[rollup]] —— ESM-first、偏 library，输出扁平不带 runtime
- [[esbuild]] —— Go 写的速度革命者，常作底层 transformer
- [[rspack]] —— Rust 重写 webpack 内核，兼容大部分 plugin
- [[turbopack]] —— Tobias 的精神继承者，服务 Next.js
- [[swc]] —— Rust 写的 babel 替代，可作 webpack loader 提速
- [[create-react-app]] —— 把 webpack 配置封装进脚手架的代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[listr2]] —— listr2 — 把 CLI 任务跑成一棵会自己画进度的树
- [[next-js]] —— Next.js — React 全栈框架
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[preact]] —— Preact — 3KB React 替代
- [[rollup]] —— Rollup — ESM 优先的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vitest]] —— Vitest — Vite 原生测试框架
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
