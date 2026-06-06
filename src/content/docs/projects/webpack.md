---
title: webpack 模块打包
来源: https://github.com/webpack/webpack
日期: 2026-05-29
子分类: 构建工具
分类: 编译器
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
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

浏览器**根本不懂** `import './style.css'` 或者 `import logo from './logo.png'`——它只会下载 `<script>` 标签里写明的 JS 文件。webpack 读完所有这些 import，把 JS / CSS / 图片**合并并改写**成浏览器能直接吃的形态：一两个 `.js` 文件、一个 `.css` 文件、几张优化后的图片。

## 为什么重要

不理解 webpack，下面这些事都没法解释：

- 为什么 2014 年之前前端要在 HTML 里手写 `<script src="jquery.js">` `<script src="utils.js">` ... 30 行，而 2014 年之后大家都用 `import`
- 为什么 React / Vue / Angular 的脚手架（`create-react-app` / `vue-cli` / `angular-cli`）里都藏着一个 webpack 配置
- 为什么 TypeScript / Sass / SVG 这些**浏览器不认识**的东西能 `import` 进来——靠 webpack 的 loader 翻译
- 为什么"打包后 bundle 很大"是前端日常话题——因为 webpack 默认把所有依赖都拼进去，得手动配 tree-shaking 才砍

## 核心要点

webpack 的世界由 **三个抽象** 撑起来：

1. **entry → output 模型**：告诉 webpack "从这个文件开始读" + "结果输出到这里"。中间它会顺着 `import` 递归读完所有依赖，构成一张"依赖图"。

2. **loader（处理非 JS 资源）**：每种文件类型挂一个翻译器。`.css` 用 `css-loader` 翻成 JS 字符串、`.png` 用 `asset/resource` 翻成"复制到 dist 并返回 URL"。loader 让"万物皆 module"成立。

3. **plugin（生命周期钩子）**：在 webpack 编译的不同阶段插自定义逻辑——生成 HTML、压缩、注入环境变量、打包分析。plugin 比 loader 强大但写起来更复杂，因为它能改变整个编译过程而不只是一个文件。

三件套加起来就是 webpack 配置文件的 80%。

## 实践案例

### 案例 1：最小 webpack.config.js

```js
// webpack.config.js
const path = require('path')

module.exports = {
  mode: 'production',                          // 决定一组默认值
  entry: './src/index.js',                     // 入口文件
  output: {
    path: path.resolve(__dirname, 'dist'),     // 输出目录（绝对路径）
    filename: 'bundle.js',                     // 输出文件名
  },
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },  // 链式 loader
      { test: /\.png$/, type: 'asset/resource' },               // 内置 asset 模块
    ],
  },
}
```

跑 `npx webpack` 之后，`src/index.js` + 它 import 的 CSS / PNG，全部被合并成 `dist/bundle.js`。

### 案例 2：写一个把 SVG 转成 React 组件的 loader

```js
// svg-to-react-loader.js
module.exports = function (svgSource) {
  // loader 是一个纯函数：输入字符串，输出字符串
  const componentCode = `
    import React from 'react'
    export default function Icon(props) {
      return ${svgSource.replace('<svg', '<svg {...props}')}
    }
  `
  return componentCode
}
```

挂到 webpack：

```js
{ test: /\.svg$/, use: path.resolve('./svg-to-react-loader.js') }
```

之后任意 `import Logo from './logo.svg'` 都自动变成 React 组件——这就是 loader 的力量。

### 案例 3：HMR（热模块替换）怎么工作

HMR 的核心：**改了代码不刷新整个页面，只换那个改动的模块**。流程：

```bash
# 一行命令启动 HMR
npx webpack serve --hot
```

背后发生的事：

1. webpack-dev-server 起一个 WebSocket 服务，浏览器端打开页面时建立连接
2. 你改了 `Button.jsx` → webpack 检测到文件变化，**只重新编译这一个模块**
3. dev-server 通过 WebSocket 发"模块 X 更新了"消息给浏览器
4. 浏览器端的 HMR runtime 收到消息，**用新模块替换内存里的旧模块**，重新渲染对应的 React 组件
5. 整个页面的 state（输入框内容、滚动位置）保留下来——这就是 HMR 比 `location.reload()` 体验好太多的原因

## 踩过的坑

1. **配置爆炸**：实务中 production-ready 的 `webpack.config.js` 经常 200-500 行——HtmlWebpackPlugin / MiniCssExtractPlugin / DefinePlugin / TerserPlugin / BundleAnalyzerPlugin 几乎都得配。这就是 create-react-app / vue-cli 必须存在的原因——把配置封装在脚手架里，用户碰不到。

2. **冷启动慢**：webpack 用 JS 写、Node.js 单线程，10k 模块项目首次启动 30-60 秒。语言天花板摆在那里——这也是 [[esbuild]]（Go）/ [[rspack]]（Rust）集体起跑的根本原因。

3. **tree-shaking 不生效**：以为开了 `mode: 'production'` 就能砍 dead code？得满足 5 个条件：① 必须 ESM 输入（CJS 全保留）② 配 minifier（webpack 只标记不删除）③ `package.json` 的 `sideEffects` 字段写对 ④ 模块没有顶层副作用 ⑤ 用了 ES module 语法。任一漏掉就部分失效。

4. **source map 选错调试性能差 100 倍**：`devtool` 有 25+ 种取值（`eval` / `cheap-source-map` / `source-map` / `inline-source-map` ...）。dev 用 `eval-cheap-module-source-map` 重建 0.3s，用 `source-map` 要 5s+。production 反过来——生产用 `source-map`（外部文件，不影响 bundle 大小），开发用 `eval` 系列（最快）。

5. **loader 链顺序反直觉**：`use: ['style-loader', 'css-loader', 'sass-loader']` 实际执行顺序是 sass → css → style（**右往左**）。这是函数式 compose 的语义但完全不符合"数组从前往后"的直觉，每个新人翻车一次。

## 适用 vs 不适用场景

**适用**：

- 大型 SPA（10k+ 模块）——webpack 的依赖图能力 + 持久缓存仍是最稳的
- 企业内部老项目——迁移到 Vite / Rspack 的成本远大于忍受慢启动
- 需要 micro-frontend——webpack 的 Module Federation 是该领域成熟度最高的方案
- 强依赖 webpack 生态 plugin 的项目（如某些遗留 babel 链）

**不适用**：

- 全新中小型项目——优先 [[vite]]，dev 启动 1-2s 远好于 webpack 的 30s
- 写 npm 库（library）——webpack 输出带 runtime 包裹太重，用 [[rollup]] 输出扁平 ESM
- 单文件转换 / 极简工具——直接用 esbuild，省去全套配置
- Next.js 项目——直接用其内置的 Turbopack，无需自己配 webpack

## 历史小故事（可跳过）

- **2012 年**：Tobias Koppers（@sokra）在德国读博士时为了写一个游戏 demo，被"如何在浏览器里组织 100 个 JS 文件"困扰，造了 webpack 0.1。
- **2014-2017 年**：webpack 1 → 2 → 3，搭上 React 崛起的快车。create-react-app 默认用 webpack，让百万开发者一夜之间都用上了它。
- **2020 年**：webpack 5 发布，引入持久缓存（冷启动 30s → 3s）和 Module Federation（micro-frontend 标准方案）。
- **2021-2023 年**：Tobias 加入 Vercel 转去做 [[turbopack]]（Rust 重写 webpack 的精神继承者）。webpack 项目本身进入维护模式。
- **2024+**：Vite 成为新项目默认选择，Rspack 成为存量 webpack 项目最现实的迁移路径（API 兼容，速度快 10x）。

webpack 没"死"——npm 周下载量截至 2026 初仍 30M+，超过所有替代品总和。但它从"前端默认选项"退到了"老项目维护选项"。

## 学到什么

1. **"万物皆 module" 是革命性世界观**——在那之前前端构建是"拼接 JS + 手写 script 标签"，webpack 第一次把所有资源（JS / CSS / 图 / 字体）抽象成同一种东西
2. **依赖图（ModuleGraph）是所有现代 bundler 的核心**——tree-shake / code splitting / persistent cache 都建立在这张图上
3. **loader 和 plugin 边界**：loader 是单文件转换器（纯函数），plugin 是编译生命周期钩子（能改变整个流程）
4. **速度问题不是"不努力"是"语言天花板"**——webpack 团队 10 年优化的极限就到这，esbuild / Rspack 用 Go / Rust 是必然
5. **配置复杂度是时代代价**：webpack 设计于 2012 年（浏览器不懂 ESM），必须自己实现 runtime；Vite 设计于 2020 年（浏览器已支持 native ESM），自然 zero-config
6. **学一个工具看时代假设**：理解 webpack 的"为什么这么复杂"比记住每个配置项重要 10 倍

## 延伸阅读

- 官方 Concepts 章节：[webpack.js.org/concepts](https://webpack.js.org/concepts/)（30 分钟读完，是入门最快路径）
- 写一个最简 plugin：[Writing a Plugin](https://webpack.js.org/contribute/writing-a-plugin/)（理解 Tapable hook 系统）
- bundle 分析利器：`webpack-bundle-analyzer`（看产物结构——chunk / vendor / runtime 各是什么）
- 对比阅读：[Vite Why](https://vitejs.dev/guide/why.html)（Vite 作者解释为什么不再用 webpack 的设计）
- 进阶：Rspack docs（rspack.dev）——理解 webpack-API-compatible 在现实中如何实现

## 关联

- [[vite]] —— 2021+ 现代 dev 体验的代表，dev 用 esbuild、build 用 rollup，绕过 webpack 的速度天花板
- [[rollup]] —— webpack 的"另一极"，ESM-first + library 倾向，输出扁平不带 runtime
- [[esbuild]] —— Go 写的速度革命者，被 Vite / SWC 用作底层 transformer
- [[rspack]] —— ByteDance 主导的 Rust 重写 webpack，API 兼容 80% 的 webpack plugin
- [[turbopack]] —— Tobias 离开 webpack 后做的精神继承者，服务 Next.js
- [[swc]] —— Rust 写的 babel 替代品，可作为 webpack 的 loader 大幅提速
- [[create-react-app]] —— 把 webpack 配置封装到脚手架的代表作

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cordova]] —— Apache Cordova — 用网页技术写手机 App 的 WebView 桥
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

