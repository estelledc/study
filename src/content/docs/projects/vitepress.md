---
title: VitePress — Vue 团队用 Vite 写的静态文档站点生成器
来源: 'https://github.com/vuejs/vitepress'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

VitePress 是把 **markdown 直接变成静态 HTML 站点**的工具，专门给"写文档"这件事设计，由 Vue 团队维护。日常类比：像一个会自己排版的印刷机——你写文字稿（markdown），它帮你印成一本电子书（带导航、搜索、代码高亮的网站）。

你写：

```md
# 我的文档
这里是一段说明，下面有代码：
```js
console.log('hello')
```
```

跑一行 `npx vitepress build`，VitePress 把这份 .md 转成 .html，附上侧边栏、深色模式、代码高亮、自动生成的目录——一个标准文档站就出来了。

Vue 自己的官网、Pinia、Vitest、VueUse 的文档全部用 VitePress 写——**它就是 Vue 生态脚下的那块地板**。

## 为什么重要

不理解 VitePress 长啥样，下面这些事都会困惑：

- 为什么 docs 站点首屏那么轻——它把"大半是静态 HTML"做到字节级别，浏览器几乎不用先跑一大坨框架
- 为什么写文档可以**直接在 markdown 里塞 Vue 组件**——不用 MDX 那种 JSX 风味语法
- 为什么 Vue 团队会做 Astro / Docusaurus / Nextra 之外的第四种选择——心智不同：markdown 转成 Vue 单文件组件
- 为什么改一行文档几乎瞬时回显——底下是 Vite：浏览器原生加载模块（ESM），改哪块只热替换哪块（HMR）

## 核心要点

VitePress 把"docs 站点"拆成 **三个心脏**：

1. **markdown 转换器**：底下用社区成熟的 markdown-it，上面挂十几个插件按顺序拼出"VitePress 风味"——`:::tip`、文件引用、代码高亮这些都是插件做的。类比：一条流水线，原料从一头进去，每个工位贴一层加工。

2. **双产物静态生成（SSG）**：SSG 就是"先在构建机把页面印成静态 HTML"。它跑两次 Vite build——一次给浏览器（JS/CSS），一次给服务器渲染函数（SSR：在 Node 里先画出 HTML）。同一份源码变两套产物，引擎外包给 Vite。

3. **lean + full 双客户端包**：第一次进页只下 `.lean.js`（hydration：给静态 HTML 接上最小可点交互），站内再跳转才下 `.full.js`（完整组件逻辑）。类比：进门只发名片，要谈合作再拿合同——首屏 JS 常能少三到五成。

主仓核心逻辑大约几千行 TypeScript（不含默认主题），是"框架做减法"的代表作。

## 实践案例

### 案例 1：60 秒起一个 docs 站

```bash
mkdir my-docs && cd my-docs
npm init -y
npm install -D vitepress
npx vitepress init   # 选 ./docs、标题、Default theme
npm run docs:dev     # http://localhost:5173
npm run docs:build   # 输出到 docs/.vitepress/dist
ls docs/.vitepress/dist/assets/chunks/
# 常见会看到 *.<hash>.js 与 *.<hash>.lean.js（文件名含 hash，以实际 dist 为准）
```

**逐部分解释**：`init` 生成配置与首页；`dev` 用 Vite 热更新；`build` 印出静态站。`hashmap.json` 把每页映射到内容 hash，用户停在旧页、你刚发新版时能兜底重拉。

### 案例 2：在 markdown 里直接用 Vue 组件

三步：

1. 在 `.vitepress/theme/index.ts` 用 `enhanceApp` 注册全局组件：

```ts
import DefaultTheme from 'vitepress/theme'
import Counter from './Counter.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Counter', Counter)
  }
}
```

2. 任意 `.md` 里写 `<Counter :start="3" />`——markdown 会被转成 Vue 单文件组件再渲染。
3. **为什么必须走 `enhanceApp`**：直接在 `.md` 里 `import` 浏览器专用代码，构建时服务器渲染会报 `window is not defined`；注册后 VitePress 才知道怎么在两端安全挂载。

### 案例 3：最小 markdown-it 插件——把 `[[OK]]` 换成加粗

`.vitepress/config.ts`：

```ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  markdown: {
    config(md) {
      md.core.ruler.push('ok-marker', (state) => {
        for (const t of state.tokens) {
          if (t.type === 'inline' && t.content.includes('[[OK]]')) {
            t.content = t.content.replaceAll('[[OK]]', '**OK**')
          }
        }
      })
    }
  }
})
```

**逐部分解释**：`config(md)` 在内置插件**之后**跑（你最后说话）；`ruler.push` 往解析流水线加一站；写 `你好 [[OK]]` 构建后会变成加粗的 OK。少见场景可用 `preConfig(md)` 抢在内置插件之前。

## 踩过的坑

1. **lean / full 双 bundle 的切换由 `isInitialPageLoad` 驱动**：这个标志在 `client/app/index.ts` 模块级，只在 `inBrowser` 时重置——SSR 自定义 runner 复用 `createApp` 时不会清零，后续路由会一直拿 lean 失败

2. **`createMarkdownRenderer` 是单例**：`if (md) return md` 让同一 node 进程只创一个实例。monorepo nx 缓存复用 node worker 时，shiki 主题切换可能不生效——只在 dev server 重启时调 `disposeMdItInstance()`

3. **内置 markdown-it 插件的注册顺序就是语义**：识别 Vue 组件的插件必须最先（否则组件标签会被转成普通 `<p>`），代码片段插件必须在代码块外壳插件之前——颠倒会让外壳包错

4. **`enhanceApp` 钩子很容易漏写**：把全局组件直接 import 进 `.md`，服务器渲染常报 `window is not defined`——应在 `enhanceApp` 里 `app.component()` 注册；仅浏览器侧的块再用 `<ClientOnly>` 包住

## 适用 vs 不适用场景

**适用**：
- Vue 生态的产品 / 库文档（与 Vue 组件天然衔接）
- markdown 占 80% 内容、需要少量交互的技术博客
- 想要极致首屏性能的 docs 站（lean bundle 拍平了 SPA framework 的开销）
- 对 dev 体验敏感的写作场景（HMR 毫秒级回显）

**不适用**：
- React / Solid / Svelte 生态项目 → 用 Docusaurus / Nextra / Starlight
- 内容动态化重的站点（需要 CMS / SSR fetch）→ 用 Nuxt / Next
- 不写 markdown 的纯 SPA → 直接用 Vite + Vue
- 需要 MDX 那种 JSX-in-markdown 的项目 → VitePress 用的是 SFC 风格不是 JSX

## 历史小故事（可跳过）

- **2018 年**：尤雨溪写 VuePress（webpack 底，Vue 2），Vue 官网在它身上痛苦了几年——启动慢、热更新重、依赖一长串自家插件
- **2020 年**：尤雨溪做 Vite（"另起炉灶比改 webpack 容易"），同年 11 月 Vite 1.0 发布
- **2021 年**：顺手起了 VitePress——用 Vite 重写 VuePress 的实验，本意是给 Vue 3 文档用
- **2024-03**：VitePress 1.0 正式发布，成为 Vue 生态官方推荐的文档站方案
- **2025–2026 年**：进入 2.x alpha；社区维护者（如 brc-dd）承担日常主维护，尤雨溪退居次席

## 学到什么

1. **框架的最高境界是做减法**——主仓核心不大，因为 markdown 转换、构建、服务器渲染都外包给成熟工具
2. **"双包"是 docs 站点的关键优化**——lean 给首屏，full 给交互，分流后首屏字节能掉一个量级
3. **markdown 转 Vue 单文件组件，而不是发明新语法**——这是与 MDX 的根本分歧：容器用户已经会，不必再学 JSX-in-markdown
4. **插件顺序即语义**：内置 markdown-it 插件谁先谁后，直接决定语法怎么被解析；顺序是 API 的一部分

## 延伸阅读

- 官方文档：[vitepress.dev](https://vitepress.dev)（用 VitePress 自己写的，吃自己狗粮）
- 设计哲学博客：[What is VitePress?](https://vitepress.dev/guide/what-is-vitepress)
- v1.0 发布说明：[Releases v1.0.0](https://github.com/vuejs/vitepress/releases/tag/v1.0.0)
- 视频教程：[Anthony Fu — VitePress in 100 Seconds](https://www.youtube.com/results?search_query=vitepress+anthony+fu)
- [[vite]] —— VitePress 跑的两次 build 都依赖 Vite 这台引擎
- [[vue]] —— 浏览器 runtime 的 SFC 编译与 hydration

## 关联

- [[vite]] —— Vite 提供 dev server / 双 build / Vite plugin 接口，VitePress 是 Vite 的"应用层用户"
- [[vue]] —— VitePress 用 Vue 做 client runtime，markdown 转出来的就是 Vue SFC
- [[markdown-it]] —— VitePress 的 markdown 内核，17 个插件全挂在它上面
- [[shiki]] —— 代码高亮引擎，VitePress 用 shiki 双主题（light / dark）做语法着色
- [[starlight]] —— Astro 生态的对应物，思路相似（markdown + 组件 + SSG）但底层引擎不同
- [[docusaurus]] —— React 生态的对应物，Meta 维护，更重但功能更全
- [[nextra]] —— Next.js 生态的对应物，MDX-first，VitePress 选了相反的 SFC-first 路线
- [[rolldown]] —— Rust 写的 Rollup 替代品，VitePress 已支持 rolldown-vite

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[shiki]] —— shiki — 把 VS Code 那套染色搬到网页上
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vue]] —— Vue.js — 渐进式 UI 框架
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上

