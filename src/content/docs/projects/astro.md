---
title: Astro — 内容站点优先的 Web 框架
来源: https://github.com/withastro/astro
日期: 2026-08-27
分类: UI 框架 / 静态站点
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/withastro/astro
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7cadf1055a61c85d0b05f3c7d8c709f7faa5cf0d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.2.8
---

## 是什么

Astro 是一个默认把页面编成 HTML 的站点框架。日常类比：厨房先把整桌菜摆好端出去；只有点了鸡尾酒的座位，才单独派一个服务员（客户端岛）。

你写一个 `src/pages/index.astro`：

```astro
---
const greeting = "hi"
---
<h1>{greeting}</h1>
```

固定 7.2.8 里，`.astro` 经 `@astrojs/compiler-rs` 编成 Vite 可加载模块，再由服务端渲染器吐出 HTML。没有 `client:*`、没有 `<ClientRouter />`、也没有额外 hoisted script 时，浏览器拿不到框架 runtime。

本 study 站本身是 Astro + [[starlight]]。本文只绑定 `packages/astro` 与同 pin 的 `@astrojs/solid-js@7.0.2`，不把整个 monorepo 或本站配置写成上游合同。

## 为什么重要

不按固定 7.2.8 读源码，下面这些旧印象会对不上：

- 为什么 `src/content/config.ts` + `type: "content"` 不再是默认写法
- 为什么教程里的 `<ViewTransitions />` 在这棵树里找不到
- 为什么 `output: "hybrid"` 会被配置 schema 直接拒绝
- 为什么 [[solid]] 组件只有加了 `client:*` 才会变成 `<astro-island>`

Astro 在这一版的价值仍是「内容默认静态、交互按岛启用」，但入口、内容层和导航组件已经换名。

## 核心要点

固定版本可以拆成四条链：

1. **编译 → 渲染 → 岛**。Vite 插件拦截 `.astro`，`compile()` 调用 compiler-rs；页面带内部 `server:root`。框架组件若没有 `client:*`，只输出 SSR HTML；有指令才生成 `<astro-island>`，由自定义元素按 `client` 属性调用对应指令函数。

2. **五条内置 client 指令**。`getDefaultClientDirectives()` 只注册 `load` / `idle` / `visible` / `media` / `only`。`idle` 优先 `requestIdleCallback`；没有该 API 时 `setTimeout(..., timeout || 200)`。`media` 必须带查询串。`client:only` 服务端只渲染 fallback，客户端走 renderer 的 `render()` 而不是 `hydrate()`。

3. **Content Layer**。`defineCollection` 见到 `loader` 就把内部 `type` 写成 `content_layer`。现代入口是 `src/content.config.ts`，loader 从 `astro/loaders` 来（`glob` / `file`）。无 loader 时默认 `type: 'content'`，属于 legacy；旧路径 `src/content/config.ts` 要开 `legacy.collectionsBackwardsCompat`。Live collection 必须写在 `src/live.config.ts`，用 `defineLiveCollection`。

4. **导航与输出模式**。视图过渡组件是 `ClientRouter`（`astro:transitions`），默认 `fallback: 'animate'`，会注入 meta 并拦截同域 `<a>` / `<form>`。`output: "hybrid"` 已从 schema 删除；默认 `static` 允许单路由 `export const prerender = false`。`server:defer` 是 server island，需要 adapter，占位后请求 `/_server-islands/{id}`。

## 实践示例

### 案例 1：Content Layer 用 loader，不再写 `type: "content"`

`src/content.config.ts`：

```ts
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
  }),
});

export const collections = { blog };
```

固定 7.2.8 看到 `loader` 后把集合标成 Content Layer。`z` 从 `astro/zod` 进（底层 Zod v4）；`astro:content` 里再导出 `z` 仍可用，但类型声明标了 deprecated。读条目用 `getCollection` / `getEntry`，渲染用 `render(entry)`，不要再调用会抛错的 `getEntryBySlug()`。

### 案例 2：只有需要交互的 Solid 组件才加水合

```astro
---
import Counter from "../components/Counter.tsx";
import Toc from "../components/Toc.tsx";
---
<Counter client:load />
<Toc client:visible />
```

`Counter` 立刻成为岛；`Toc` 等子节点进入视口再水合。两个组件都没有 `client:*` 时，[[solid]] 服务端 renderer 仍会产出 HTML，但不会挂 `<astro-island>`，浏览器也不加载 `solid-js`。多框架并存时，`client:only="solid-js"`（别名 `"solid"`）跳过 SSR。

### 案例 3：页面切换用 ClientRouter，不是已删除的 ViewTransitions 组件

```astro
---
import { ClientRouter } from "astro:transitions";
---
<html>
  <head><ClientRouter /></head>
  <body><slot /></body>
</html>
```

固定树里没有 `ViewTransitions.astro`。`ClientRouter` 会写入 `astro-view-transitions-enabled` meta，并加载客户端 `navigate()`。这不是 React Router 那种长期存活的 SPA：每次仍是新文档，只是浏览器用 View Transitions API（或 fallback）交换内容。加上它就不再是「整页 0 JS」。

## 踩过的坑

1. **把 Astro 5 的 `type: "content"` 当 7.2.8 默认**：无 loader 的集合会被 Content Layer 跳过，除非打开 backwards-compat。配置文件也要从 `src/content/config.ts` 迁到 `src/content.config.ts`。

2. **在 `.astro` 里写客户端状态**：frontmatter 只在构建/SSR 跑一次。`onClick` / `useState` 必须放到 React / Vue / Solid 等岛组件。

3. **Markdown 里写组件却用 `.md`**：默认 `.md` 不会把 JSX 当成组件。要嵌岛必须 `.mdx` 并启用 MDX integration。

4. **没有 adapter 就写 `server:defer`**：server island 依赖适配器提供的 `/_server-islands/` 端点；静态输出不能假装它会本地算完。

5. **以为 `output: "hybrid"` 还在**：配置 schema 会拒绝该字面量，并指向默认 `static`。

## 适用 vs 不适用场景

**适用**：

- 文档站 / 博客 / 营销页——多数路由可以预渲染
- 用 Content Layer 从本地文件或自定义 loader 收内容，并用 Zod v4 校验 frontmatter
- 把 [[solid]] 或其他框架当成少量岛，而不是整站 SPA
- 需要在同一站点里临时混用多个 UI runtime（每个岛一份 renderer）

**不适用**：

- 以客户端状态机为主的 dashboard / 编辑器——岛会把框架 runtime 一块块加回来
- 必须每个请求动态渲染、又没有 adapter
- 教程仍写 `ViewTransitions`、`getEntryBySlug` 或 `output: "hybrid"`，却声称已经对齐 7.2.8
- 运行时低于 Node 22.12——`package.json` engines 直接卡住

## 固定版本边界

- 本文绑定 `withastro/astro@7cadf1055...`，annotated tag `astro@7.2.8` 剥皮到该提交；`packages/astro/package.json` 为 `7.2.8`。
- npm `astro@7.2.8` 未暴露 `gitHead`；以 tag^{} 与包版本双锚点为准。
- 同 pin 审查了 `@astrojs/solid-js@7.0.2`，peer 为 `solid-js ^1.9.13`。
- 依赖包含 Vite `^8.0.13` 与 Zod `^4.3.6`；最终 bundle 仍取决于 import 与配置。
- 本文未安装依赖、未跑 `astro build` / 上游测试，也未测 Lighthouse 或 JS 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认静态是合同，不是口号**——没有 `client:*` 就没有岛脚本；一旦加 `ClientRouter` 或岛，零 JS 不再成立。
2. **内容 API 跟大版本走**——Content Layer 的 loader 才是 7.2.8 的主路径，文件夹约定不能从 Astro 4/5 教程抄。
3. **组件名比营销名准**——视图过渡的可导入对象是 `ClientRouter`，不是已经不存在的 `ViewTransitions`。
4. **岛的框架选择是集成合同**——`@astrojs/solid-js` 决定 hydrate/render 入口，不是 `.astro` 语法本身提供 Solid。

## 应用型自测

1. `defineCollection({ type: "content", schema })` 且没有 `loader`，在未开 backwards-compat 时会被 Content Layer 当成当前集合吗？
2. 一个 Solid 组件写在 `.astro` 里但没有 `client:*`。固定 7.2.8 会生成 `<astro-island>` 并下载 `solid-js` 吗？
3. 布局里写 `<ViewTransitions />`。这个 pin 的 `astro:transitions` 还导出该组件吗？

检查点：

1. 不会。无 loader 时内部默认 legacy `content`，Content Layer 会跳过；现代写法要带 `loader`。
2. 不会。无指令只产出 SSR HTML，不挂岛、不加载客户端 renderer。
3. 不会。固定树提供的是 `ClientRouter`，没有 `ViewTransitions.astro`。

## 延伸阅读

- 官方 docs：[docs.astro.build](https://docs.astro.build)
- 固定源码：[withastro/astro](https://github.com/withastro/astro) —— 本文绑定提交 `7cadf1055a61c85d0b05f3c7d8c709f7faa5cf0d`
- [[solid]] —— 同 pin 审查的岛 UI；`@astrojs/solid-js` peer 为 `^1.9.13`
- [[starlight]] —— Astro 文档主题；本站在用，但不在本次 pin 范围内
- [[next-js]] —— 常被对比的 web app 优先框架；本文不绑定其源码

## 关联

- [[solid]] —— 通过 `@astrojs/solid-js` 做成岛；hydrate 与 `client:only` 走不同入口
- [[starlight]] —— Astro 出品的文档主题
- [[next-js]] —— 内容站 vs 应用框架的对照面
- [[vite]] —— 固定 7.2.8 的构建底座是 Vite 8
- [[zod]] —— Content Layer schema 经 `astro/zod` 进入
- [[markdown-it]] —— 旧印象中的 Markdown 栈；本 pin 未重新核对默认 parser

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[i18next]] —— i18next — 让一份 JS 代码同时讲几十种语言
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[micromark]] —— micromark — markdown 解析器里那台一个字一个字读的状态机
- [[minisearch]] —— minisearch — 浏览器里的小型全文搜索引擎
- [[motion-one]] —— Motion One — 把动画交给浏览器自己跑
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[nuxt]] —— Nuxt — Vue 全栈框架
- [[observable-framework]] —— Observable Framework — 编译期跑数据，浏览器只看结果
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[remix]] —— Remix — 拥抱 Web 标准的 React 全栈框架
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线
- [[valibot]] —— Valibot — 拆成乐高的 TypeScript 校验库
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
- [[web-vitals]] —— web-vitals — 让你在自己页面测的数和 Google 排名用的数对得上
