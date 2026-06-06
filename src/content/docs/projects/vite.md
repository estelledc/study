---
title: Vite — 浏览器自己加载源码的构建工具
来源: https://github.com/vitejs/vite
日期: 2026-05-29
子分类: 构建工具
分类: 编译器
难度: 中级
provenance: pipeline-v3
---

## 是什么

Vite 是一个**让浏览器在开发时直接加载源码、生产环境再打包**的前端构建工具。日常类比：像快递公司分两条路线——同城用户上门自取（dev = 浏览器原生 ESM 直连），跨省发货走集中配送（build = 把所有包裹合在一起打包发车）。同一个仓库，两条路线，各取所长。

你跑：

```bash
npm create vite@latest my-app
cd my-app && npm run dev
```

300 毫秒后 dev server 就启动了。浏览器打开 `localhost:5173`，请求 `/src/main.tsx`，Vite 现场把 TS 转成 JS 返回——**没有打包步骤**。改一个文件，只有那一个文件被重新 transform，浏览器只下载一个新模块。

## 为什么重要

不理解 Vite，下面这些事都没法解释：

- 为什么 [[webpack]] 启动一个中型项目要 30 秒，Vite 同样的项目 300 毫秒
- 为什么大型项目热更新（[[hmr]]）从「越大越慢」变成「和项目大小无关」
- 为什么 Rollup 这个 2018 年看似要被 webpack 拍死的工具，2024 年又重新成为主流——因为 Vite 把它接到生产管线里
- 为什么 Nuxt 3 / SvelteKit / Astro / Remix / SolidStart 几乎所有新框架底层都换成了 Vite

## 核心要点

Vite 的核心机制可以拆成 **三块**：

1. **浏览器原生 ESM 加载**：现代浏览器（Chrome 61+，2017 年起）原生支持 `import`/`export` 语法。Vite dev 时不打包，让浏览器自己解 import 图——浏览器请求一个文件，Vite 现场转译返回，仅此而已。类比：快递员上门，你要哪个包裹他现拿现给，不必先把整车货物在仓库分拣好。

2. **依赖预构建**（dep pre-bundle）：第三方包（lodash 内部 600 个小文件、React 几十个文件）如果让浏览器一个个 ESM 加载，HTTP 请求数会爆炸。Vite 用 [[esbuild]]（Go 写的打包器，比 webpack 快 10-100 倍）提前把 `node_modules` 里的包合成单个 ESM 文件，存到 `node_modules/.vite/deps/`，浏览器只发一次请求。

3. **HMR 单文件粒度**：webpack 的 HMR 是「找出哪个 chunk 包含这文件 → 重打整个 chunk → 推给浏览器」。Vite 的 HMR 不一样——文件改了，仅 invalidate 这一个模块；沿 import 链向上找到「接受 hot 的祖先」就停；给浏览器推一条 WebSocket 消息说「这个 url 改了，重 import 一下」。和项目大小无关，永远是 ms 级。

## 实践案例

### 案例 1：起项目，发现 index.html 是入口

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app && pnpm install && pnpm dev
```

打开生成的 `index.html`，你会看到：

```html
<script type="module" src="/src/main.tsx"></script>
```

`index.html` 自己就是入口——不是 webpack 那种「写个 entry.js，再用 HtmlPlugin 反向生成 html」。**Vite 把 html 当一等公民**，因为浏览器本来就是从 html 开始解析的，跟着 `<script type="module">` 一路加载下去就行。

### 案例 2：写个 plugin 把 .svg 转成 React 组件

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { transform } from '@svgr/core';

export default defineConfig({
  plugins: [
    {
      name: 'svg-to-component',
      async transform(code, id) {
        if (!id.endsWith('.svg')) return null;
        const jsCode = await transform(code, {}, { componentName: 'SvgIcon' });
        return { code: jsCode, map: null };
      },
    },
  ],
});
```

这套 hook（`transform` / `resolveId` / `load`）是从 Rollup 借来的——Vite 不发明新 API，直接复用 Rollup 几百个现成 plugin。

### 案例 3：vite.config.ts 配 alias

```ts
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
    },
  },
});
```

之后代码里写 `import Button from '@components/Button'` 就能解析到 `src/components/Button.tsx`。dev 和 build 都生效——同一份配置，两条路线都读它。

## 踩过的坑

1. **CommonJS 包加载报错**：Vite 默认假设 npm 包是 ESM 友好的。老的 CJS-only 包（很多 2018 年前的库）会报 `does not provide an export named 'default'`。修法：在 `optimizeDeps.include` 里显式列出，让 esbuild 先把它转成 ESM。

2. **dev 跑得好，build 报错**：dev 用 esbuild + 浏览器原生 ESM，build 用 Rollup——tree-shake、minify、code split 只在 build 时触发。dev 时引用了 lib 一个没导出的字段，浏览器懒加载不会立刻爆，build 时 Rollup 静态分析能扫出来直接 fail。这是 Vite 最大的工程妥协。

3. **SSR 模式两套 module 解析**：服务端用 Node 的 require/import，浏览器走 ESM。同一份代码两套加载策略，依赖里有「只在浏览器跑」的代码（如 `window.localStorage`）会在 SSR 时炸。Vite 提供 `ssr.noExternal` 让你显式控制哪些包要走 ESM 转译。

4. **HMR 在某些状态库失效**：zustand / jotai 这种把 state 存在模块顶层的库，模块替换时 state 会被重置——你点了 5 次按钮的 state 在 HMR 后没了。修法：用 `import.meta.hot.invalidate()` 强制全页刷新，或者搭配 `@vitejs/plugin-react` 的 Fast Refresh（它保留 React 组件 state，但模块顶层的 store 仍会重置）。

## 适用 vs 不适用场景

**适用**：
- 现代前端项目（React / Vue / Svelte / Solid）从零搭
- 中小型项目（<5000 文件）追求 dev 启动速度
- 库项目（lib mode）—— Vite 的 lib mode 直接调 Rollup，输出 ESM/CJS/UMD 一条龙
- 想用 Rollup 插件生态又不想自己搭 dev server / HMR 的场景

**不适用**：
- 超大型 monorepo（10k+ 文件）—— 浏览器原生 ESM 加载几千个模块会卡，[[turbopack]] 这种 incremental cache 模型更合适
- Module Federation 微前端 —— 远程动态加载模块，目前 webpack 5 的 Module Federation 仍是唯一成熟方案
- 必须严格 dev/prod 一致的场景 —— Vite 双引擎是已知妥协，dev 跑过不代表 prod 跑过
- 历史 webpack 项目已魔改过几年的 —— 切换成本远高于性能收益，不如等 webpack 自己升级

## 学到什么

1. **「dev 不打包」是反直觉的设计**——但浏览器原生 ESM 已经成熟，让浏览器自己解 import 图比 bundler 重打更快。这是「对 runtime 能力的诚实判断」
2. **dep pre-bundle 是关键妥协**：原生 ESM 在 npm 包上不可用（CommonJS 兼容 + 数百小文件 RTT 爆炸），所以仍要跑一次 esbuild 把 npm 包打成单 ESM
3. **plugin 生态可以「借」**：Vite 不发明轮子，直接兼容 Rollup plugin API，立刻获得几百个现成插件——站在巨人肩膀上的工程主义
4. **dev 和 build 用不同工具不是 bug 是 feature**——dev 求快，build 求干净，单一架构两边都妥协。Vite 接受复杂度换性能
5. **HMR 算法依赖 ESM module graph**：webpack 的 chunk-级 HMR 是「打包模型」的副产品，Vite 的 module-级 HMR 是「ESM 模型」的自然产物——粒度不同决定速度不同

## 延伸阅读

- 官方文档：[vitejs.dev](https://vitejs.dev)（中英双语，从「为什么 Vite」一节开始读）
- 视频教程：[Evan You — Vite from 0 to 1](https://www.youtube.com/watch?v=xXrhg26VCSc)（作者本人讲设计动机，约 1 小时）
- 源码入口：[packages/vite/src/node/server/index.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/index.ts)（dev server 编排，约 700 行，从 `createServer` 读起）
- Rollup 官方文档（rollupjs.org）—— Vite 生产 build 用的打包器，理解它的 plugin hook 等于理解 Vite 一半
- esbuild 官方文档（esbuild.github.io）—— Vite 依赖预构建用的工具，Go 写的极速 bundler，理解它的速度来源（goroutine 并发 + 单 binary 无启动开销）

## 关联

- [[webpack]] —— Vite 的对照组，对比看才知道 Vite 解了什么问题（启动慢 / HMR 慢 / 配置复杂）
- [[rollup]] —— Vite 生产 build 的底层打包器，plugin API 也是从它借的
- [[esbuild]] —— Vite dev 的依赖预构建引擎，Go 写的极速 bundler
- [[turbopack]] —— Vercel 推的 Rust 增量 bundler，思路与 Vite 完全不同（incremental vs unbundled），是 Vite 长期对手
- [[snowpack]] —— Vite 之前最早做「dev 不打包」的项目，开了路但没活到主流，理解它的失败有助于理解 Vite 为什么成功
- [[parcel]] —— 零配置打包器，与 Vite 同时代但生态差距已显
- [[hmr]] —— 热模块替换概念，Vite 把它做到了 ms 级单文件粒度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[duckdb-wasm]] —— duckdb-wasm — 把分析数据库塞进浏览器标签页
- [[electron]] —— Electron — Chromium + Node.js 跨平台桌面应用框架
- [[electron-builder]] —— electron-builder — 一条命令把 Electron 应用打包发布到全平台
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[ionic-framework]] —— Ionic Framework — 用 Web 技术打包原生移动 App
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[next-js]] —— Next.js — React 全栈框架
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[observable-framework]] —— Observable Framework — 编译期跑数据，浏览器只看结果
- [[phaser]] —— Phaser — 在浏览器里写 2D 游戏的完整工具箱
- [[preact]] —— Preact — 3KB React 替代
- [[quasar]] —— Quasar — 一套 Vue 代码，七种平台产物
- [[qwik]] —— Qwik — Resumable UI 框架
- [[react]] —— React UI 组件库
- [[react-native]] —— React Native — 用 React 写、编译成真正的原生 App
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[rollup]] —— Rollup — ESM 优先的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[solid]] —— SolidJS — 细粒度响应式 UI 框架
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[tailwind]] —— Tailwind CSS — 工具类优先样式框架
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[vitest]] —— Vitest — Vite 原生测试框架
- [[vue]] —— Vue.js — 渐进式 UI 框架
- [[vue-i18n]] —— vue-i18n — Vue 官方 i18n，切语言整页自己刷新
- [[wails]] —— Wails — 用 Go 写后端、Web 写 UI 的跨平台桌面框架
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
- [[webpack]] —— webpack 模块打包

