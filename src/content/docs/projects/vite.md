---
title: Vite — 浏览器自己加载源码的构建工具
来源: https://github.com/vitejs/vite
日期: 2026-05-29
分类: 构建工具
难度: 中级
---

## 是什么

Vite 是一个**让浏览器在开发时直接加载源码、生产环境再打包**的前端构建工具。日常类比：像快递公司分两条路线——同城用户上门自取（dev = 浏览器原生 ESM 直连），跨省发货走集中配送（build = 把所有包裹合在一起打包发车）。同一个仓库，两条路线，各取所长。

你跑：

```bash
npm create vite@latest my-app
cd my-app && npm run dev
```

约 300 毫秒后 dev server 启动。浏览器打开 `localhost:5173`，请求 `/src/main.tsx`，Vite 现场把 TS 转成 JS 返回——**没有打包步骤**。改一个文件，只有那一个文件被重新 transform，浏览器只下载一个新模块。

## 为什么重要

不理解 Vite，下面这些事都没法解释：

- 为什么 [[webpack]] 启动一个中型项目要几十秒，Vite 同样的项目往往亚秒级
- 为什么大型项目热更新（[[hmr]]）从「越大越慢」变成「和项目大小无关」
- 为什么 Rollup 在 2020 年代又回到主流——因为 Vite 把它接到生产管线里
- 为什么 Nuxt 3 / SvelteKit / Astro / Remix / SolidStart 等多数主流元框架底层都换成了 Vite

## 核心要点

Vite 的核心机制可以拆成 **三块**：

1. **浏览器原生 ESM 加载**：现代浏览器（Chrome 61+，2017 年起）原生支持 `import`/`export`。Vite dev 时不打包，让浏览器自己解 import 图——请求一个文件，Vite 现场转译返回。类比：快递员上门，你要哪个包裹他现拿现给。

2. **依赖预构建**（dep pre-bundle）：第三方包（lodash 内部几百个小文件）若让浏览器逐个 ESM 加载，HTTP 请求会爆炸。Vite 用 [[esbuild]] 提前把 `node_modules` 合成单个 ESM，存到 `.vite/deps/`，浏览器只发一次请求。

3. **HMR 单文件粒度**：webpack 的 HMR 常要重打整个 chunk；Vite 只 invalidate 改动的模块，沿 import 链找到接受 hot 的祖先就停，经 WebSocket 通知浏览器重 import。和项目大小无关，通常是 ms 级。

## 实践案例

### 案例 1：起项目，发现 index.html 是入口

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app && pnpm install && pnpm dev
```

打开生成的 `index.html`：

```html
<script type="module" src="/src/main.tsx"></script>
```

**逐部分解释**：`type="module"` 告诉浏览器按 ESM 加载；`src` 指向源码入口。`index.html` 自己就是入口——不是 webpack 那种「写 entry.js，再用 HtmlPlugin 反向生成 html」。**Vite 把 html 当一等公民**，因为浏览器本来就从 html 开始解析。

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

**逐部分解释**：

1. Vite 默认把 `.svg` 当静态资源（返回 URL）；自定义 `transform` 抢在默认处理前，把 SVG 源码变成 JS 组件
2. `return null` = 不处理，交给后面的插件；返回 `{ code }` = 用你的 JS 替换原模块
3. 这套 hook（`transform` / `resolveId` / `load`）借自 Rollup——Vite 复用现成 plugin 生态，不另发明 API

### 案例 3：vite.config.ts 配 alias

```ts
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
      '@components': path.resolve(root, './src/components'),
    },
  },
});
```

**逐部分解释**：`alias` 把短名映射到真实路径；ESM 配置里用 `import.meta.url` 代替 `__dirname`；dev 与 build 读同一份配置，所以两条路线都生效。之后可写 `import Button from '@components/Button'`。

## 踩过的坑

1. **CommonJS 包加载报错**：老 CJS-only 包会报 `does not provide an export named 'default'`。修法：在 `optimizeDeps.include` 里列出，让 esbuild 先转成 ESM。
2. **dev 跑得好，build 报错**：dev 用 esbuild + 原生 ESM，build 用 Rollup；未导出字段可能只在 build 静态分析时 fail。这是双引擎的已知妥协。
3. **SSR 两套 module 解析**：服务端走 Node，浏览器走 ESM；碰 `window` 会炸。用 `ssr.noExternal` 控制哪些包要转译。
4. **HMR 重置模块顶层 state**：zustand / jotai 等把 state 放模块顶层时，HMR 会丢状态。可用 `import.meta.hot.invalidate()` 或依赖框架 Fast Refresh（组件 state 可留，store 仍可能重置）。

## 适用 vs 不适用场景

**适用**：
- 现代前端（React / Vue / Svelte / Solid）从零搭
- 中小型项目（<5000 文件）追求 dev 启动速度
- 库项目（lib mode）——直接调 Rollup，输出 ESM/CJS/UMD
- 想用 Rollup 插件生态又不想自搭 dev server / HMR

**不适用**：
- 超大型 monorepo（10k+ 文件）——原生 ESM 加载几千模块会卡，[[turbopack]] 这类增量缓存更合适
- Module Federation 微前端 —— 生产级成熟度仍以 webpack 5 为主（Vite 侧多为实验/社区方案）
- 必须严格 dev/prod 一致 —— 双引擎是已知妥协，dev 过不代表 prod 过
- 已深度魔改多年的 webpack 项目 —— 切换成本常高于收益

## 历史小故事（可跳过）

- 2019：[[snowpack]] 等先试「dev 不打包」，证明浏览器原生 ESM 可行，但生态与生产管线未成气候
- 2020：Evan You（Vue 作者）发布 Vite 1.x，把「原生 ESM dev」和「Rollup 生产构建」绑成一条产品线
- 2021–2022：Vite 2/3 稳住插件兼容与框架适配，Vue 之外的元框架开始迁入
- 2024 前后：多数新元框架默认 Vite；团队同时推进 [[rolldown]]（Rust）想把 dev/build 引擎统一

## 学到什么

1. **「dev 不打包」反直觉但成立**——浏览器原生 ESM 已成熟，让浏览器解 import 图往往比 bundler 重打更快
2. **dep pre-bundle 是关键妥协**：npm 包仍有 CJS 与海量小文件问题，所以要用 esbuild 预打成单 ESM
3. **plugin 生态可以「借」**：兼容 Rollup plugin API，立刻获得大量现成插件
4. **dev/build 双引擎不是 bug**——dev 求快、build 求干净；接受复杂度换性能。HMR 粒度也跟着 ESM module graph 变细

## 延伸阅读

- 官方文档：[vitejs.dev](https://vitejs.dev)（从「为什么 Vite」一节读起）
- 视频：[Evan You — Vite from 0 to 1](https://www.youtube.com/watch?v=xXrhg26VCSc)（设计动机，约 1 小时）
- 源码入口：[packages/vite/src/node/server/index.ts](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/index.ts)（从 `createServer` 读起）
- [[rollup]] / [[esbuild]] 文档 —— 分别对应生产打包与依赖预构建
- [[webpack]] —— 对照阅读，才知道 Vite 解了启动慢 / HMR 慢 / 配置复杂

## 关联

- [[webpack]] —— 对照组：启动慢 / HMR 慢 / 配置复杂
- [[rollup]] —— 生产 build 底层打包器，plugin API 来源
- [[esbuild]] —— dev 依赖预构建引擎
- [[turbopack]] —— 增量 bundler，思路与 Vite（unbundled）不同
- [[snowpack]] —— 更早的「dev 不打包」尝试，有助于理解 Vite 为何胜出
- [[hmr]] —— 热模块替换；Vite 做到 ms 级单文件粒度
- [[rolldown]] —— 用 Rust 统一 Vite 引擎的方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
