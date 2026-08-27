---
title: Vite — 默认按原生 ESM 加载、用 Rolldown 打包的构建工具
来源: https://github.com/vitejs/vite
日期: 2026-08-27
分类: 构建工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/vitejs/vite
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: de1111ab0be00879b404e7ed3b2a80e264edddc1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.2.2
---

## 是什么

Vite 是一个默认让浏览器按原生 ESM 逐模块请求源码、再在需要时用 Rolldown 做依赖预构建与生产打包的前端构建工具。日常类比：像一家同时开了“柜台现做”和“中央厨房预打包”的店——默认柜台按点单现做（dev transform），热销原料先在后厨合成一份可复用的 ESM（optimizeDeps），出货时再整单装箱（build）。

你跑：

```bash
npm create vite@latest my-app
cd my-app && npm run dev
```

固定 8.2.2 的 `createServer` 会按 `serve` 解析配置，为 `client` / `ssr` 各建一个 `DevEnvironment`，再用 Connect 挂 middleware。默认并不先打整包。

## 为什么重要

不理解 Vite 8.2.2 的源码合同，下面这些事都会按旧印象写错：

- 为什么旧教程把依赖预构建和生产构建分别写成 esbuild 与 Rollup
- 为什么现在 `optimizeDeps.esbuildOptions` / `build.rollupOptions` 还会“看起来能配”
- 为什么打开 `experimental.bundledDev` 后，HMR 不再走原来的模块图传播
- 为什么 `index.html` 仍是默认生产入口，而不是一份隐藏的 `entry.js`

## 核心要点

固定版本的主链可以拆成五步：

1. **解析 `serve` 配置并禁用可回放缓存**：dev server 的网络响应和 HMR 不能从缓存重放。

2. **按 environment 初始化**：`client` 与 `ssr` 各自持有 module graph、plugin container 和可选的 deps optimizer。

3. **默认走 transform 中间件**：浏览器请求某个模块 URL 后，`pluginContainer.load` → `pluginContainer.transform` 现场转译，再按 ESM 返回。

4. **依赖预构建用 Rolldown**：`runOptimizeDeps` 直接调用 `rolldown()`，把 `node_modules` 合成缓存目录里的 ESM；`esbuildOptions` 已标记 deprecated。

5. **生产构建也走 Rolldown**：`build()` 创建 builder，经 `resolveRolldownOptions` 打包；未指定 lib/ssr/input 时默认入口是 `index.html`。

## 实践案例

### 案例 1：index.html 仍是默认入口

```html
<script type="module" src="/src/main.ts"></script>
```

`type="module"` 让浏览器按 ESM 解析。固定 `build()` 在没有 `build.lib.entry`、`ssr` 字符串或 `rolldownOptions.input` 时，会 `resolve('index.html')`。这不是“用 HtmlPlugin 反推 html”，而是 html 自己当输入。

### 案例 2：transform hook 仍按插件容器执行

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "svg-as-text",
      transform(code, id) {
        if (!id.endsWith(".svg")) return null;
        return { code: `export default ${JSON.stringify(code)}`, map: null };
      },
    },
  ],
});
```

默认 dev 路径里，`return null` 表示本插件不处理；返回 `{ code }` 则替换模块。这套 `resolveId` / `load` / `transform` 表面仍兼容旧 Rollup 插件，但底层类型和打包器已是 Rolldown。

### 案例 3：rollupOptions 只是兼容代理

```ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: { input: "src/main.ts" },
    // 若同时写 rollupOptions，固定实现会忽略它并打 deprecation
  },
});
```

`utils.ts` 把 `rollupOptions` 代理到 `rolldownOptions`。两边都出现时，以 `rolldownOptions` 为准。新配置应直接写后者。

## 踩过的坑

1. **仍按“dev=esbuild、build=Rollup”读 8.2.2**：发布态依赖是 `rolldown ~1.2.4`；`esbuild` 只是 optional peer。源码里残留的 esbuild 注释不能当成当前引擎。

2. **把 `experimental.bundledDev` 当成默认**：`config.ts` 默认 `bundledDev: false`。打开后走 `rolldown/experimental` 的 `DevEngine`，且 `handleHMRUpdate` 在该模式直接返回。

3. **同时设 `signal` 式思维去猜 timeout**：这里没有 ofetch 那种 timeout 合同。HMR 失效边界是“配置/env 变更会重启 server”，不是整页永远只热替换。

4. **把未测量的启动时间写成事实**：本文没有跑 dev server 或 benchmark，不能比较 [[webpack]] 启动耗时。

## 适用 vs 不适用场景

**适用**：

- 需要浏览器原生 ESM 开发循环、并以 html 为一等入口的现代前端应用
- 愿意按 Rolldown 选项（而不是旧 Rollup/esbuild 选项）维护配置
- Node `^20.19.0 || >=22.12.0`

**不适用**：

- 必须让 dev 与 prod 走完全同一套打包图——默认 transform 与生产 Rolldown 仍是两条路径
- 已经打开 `experimental.bundledDev` 并依赖旧 `handleHotUpdate` 传播——固定源码里该模式的 HMR 钩子仍是 TODO
- 不能接受 Rolldown 作为发布依赖，或必须停留在旧 Node 20.18 及以下
- 需要把启动耗时或 HMR 延迟写成保证——本文没有运行证据

## 固定版本边界

- 本文绑定 `vitejs/vite@de1111ab0be00879b404e7ed3b2a80e264edddc1`，tag 与 package 均为 `8.2.2`。
- npm `vite@8.2.2` 有 SLSA provenance，但不暴露 `gitHead`；身份以 GitHub tag 与 `packages/vite/package.json` 互证。
- 发布依赖是 `rolldown`、`lightningcss`、`postcss`、`picomatch`、`tinyglobby`。
- 本文未安装依赖、启动 dev server、跑上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认不打包 ≠ 没有打包器**——浏览器解 import 图，Rolldown 负责预构建和生产输出。
2. **兼容字段会活过真实引擎**——`rollupOptions` / `esbuildOptions` 还在，但 8.2.2 的执行路径已经换了。
3. **environment 是一等对象**——client 与 ssr 不再共享一份旧的全局 plugin container 语义。
4. **实验开关会切断旧主链**——`bundledDev` 不是更快的同一条路，而是另一套 DevEngine。

## 应用型自测

1. 固定 8.2.2 里，`optimizeDeps.esbuildOptions` 还会驱动默认预构建吗？
2. 未设置 `experimental.bundledDev` 时，改 `src/App.ts` 会进入 `BundledDev` 的 `DevEngine` 吗？
3. 同时写 `build.rollupOptions.input` 与 `build.rolldownOptions.input`，固定实现采用哪一个？

检查点：

1. 不会。预构建调用 `rolldown()`；`esbuildOptions` 已 deprecated。
2. 不会。默认 `bundledDev` 为 false，走 `transformMiddleware`。
3. `rolldownOptions`。`rollupOptions` 只是兼容代理，冲突时被忽略。

## 延伸阅读

- 文档：[vite.dev](https://vite.dev)
- 固定源码：[vitejs/vite](https://github.com/vitejs/vite) —— 本文绑定提交 `de1111ab0be00879b404e7ed3b2a80e264edddc1`
- [createServer](https://github.com/vitejs/vite/blob/de1111ab0be00879b404e7ed3b2a80e264edddc1/packages/vite/src/node/server/index.ts)
- [[webpack]] —— 对照组：先建模块图再输出 chunk
- [[rolldown]] —— 8.2.2 的发布态打包引擎

## 关联

- [[webpack]] —— 先打包再加载；Vite 默认先加载再按需打包
- [[rolldown]] —— 预构建与 production build 的实际引擎
- [[rollup]] —— 旧生产引擎；8.2.2 里只剩兼容选项名
- [[esbuild]] —— 旧预构建引擎；现为 optional peer
- [[vitest]] —— 共享 Vite 转换管线的测试运行器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[capacitor]] —— Capacitor — 把 Web 应用装进原生 App 的运行时
- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[cordova]] —— Cordova — 用 Web 技术打包移动 App 的老牌桥梁
- [[duckdb-wasm]] —— duckdb-wasm — 把分析数据库塞进浏览器标签页
- [[electron]] —— Electron — 用网页技术做跨平台桌面应用
- [[electron-builder]] —— electron-builder — Electron 打包发布事实标准
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[matter-js]] —— Matter.js — 2D 刚体世界里最轻的“物理白板”
- [[melonjs]] —— melonJS — 轻量 JS 2D 游戏引擎
- [[neutralinojs]] —— neutralinojs — 系统 WebView 上的极简桌面壳
- [[next-js]] —— Next.js — React 全栈框架
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[observable-framework]] —— Observable Framework — 编译期跑数据，浏览器只看结果
- [[phaser]] —— Phaser — HTML5 2D 游戏框架
- [[playcanvas]] —— PlayCanvas — Web 3D 引擎与可视化应用
- [[preact]] —— Preact — 3KB React 替代
- [[quasar]] —— Quasar Framework — 一套代码跑 Vue 全端的应用框架
- [[qwik]] —— Qwik — Resumable UI 框架
- [[projects/react]] —— React — 用组件描述界面的 JavaScript 库
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[rollup]] —— Rollup — ESM 优先的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[shader-park]] —— Shader Park — 程序化 SDF 着色器 DSL
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[tailwind]] —— Tailwind CSS — 工具类优先样式框架
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[tauri]] —— Tauri — 用系统浏览器内核 + Rust 做轻量桌面应用
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[vitest]] —— Vitest — Vite 原生测试框架
- [[vue]] —— Vue.js — 渐进式 UI 框架
- [[vue-i18n]] —— vue-i18n — Vue 官网推荐的 i18n，切语言整页自己刷新
- [[wails]] —— Wails — 用 Go + 网页技术打成单个桌面应用
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
- [[webpack]] —— webpack 模块打包
