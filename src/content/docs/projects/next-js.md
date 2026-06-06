---
title: Next.js — React 全栈框架
来源: https://github.com/vercel/next.js
日期: 2026-05-29
子分类: UI 框架 / 全栈
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Next.js 是在 [[react]] 上面加一层 **"约定即代码"** 的全栈框架——你不用配路由、不用搭服务器、不用想"这页面该怎么渲染"，**文件结构自动变成路由 / 服务端渲染 / API endpoint**。

日常类比：

- **React 是给你菜**（组件、状态、hooks）——你拿到一堆食材，要自己开餐厅
- **Next.js 是给你整个餐厅**（路由 / 后厨 / 上菜流程）——你只需要往菜单（文件夹）里放菜单项，门口的接待、点单、上菜都帮你弄好了

所以 Next.js 不是"另一个 React"，而是 **"React + 一整套约定 + 一整套运行时"**。

## 为什么重要

不理解 Next.js，下面这些事都没法解释：

- 为什么 **App Router**（13+ 引入）一夜之间让 React Server Components 成为主流——以前 RSC 是个标准草稿，是 Next.js 把它落地到能跑的产品里
- 为什么 **Vercel 出品 + 部署一体化**——你 `git push` 到 main，30 秒后线上就更新了，不用配 CI / CD / 服务器
- 为什么 **90% 现代 React SaaS** 都用 Next.js——ChatGPT、Claude、Linear、Notion 的内嵌页都跑在 Next.js 上
- 为什么 **React Server Components 标准** 是 Next.js 推动定型的——Meta 提了概念，Vercel 把它做成了产品

一句话：**学 React 是学组件，学 Next.js 是学怎么把组件变成产品。**

## 核心要点

Next.js 的全部能力都可以拆成 **三个支柱**：

1. **文件即路由**：`pages/` 或 `app/` 目录的文件结构 **就是** URL 结构。`app/blog/page.tsx` 就是 `/blog`，`app/blog/[slug]/page.tsx` 就是 `/blog/anything`。不用写 `<Route path="...">`。

2. **渲染策略**：每个页面可以是 SSR（每次请求渲染）/ SSG（构建时渲染一次）/ ISR（构建时渲染 + 定时刷新）/ RSC（在服务器上渲染并把 HTML 流给客户端）。**框架根据你写的代码自动选**——你 `await fetch` 了就走 SSR，没有就走 SSG。

3. **数据获取**：旧版 `getServerSideProps` / `getStaticProps`（Pages Router），新版直接在组件里 `await fetch(...)` + 缓存控制（App Router）。fetch 本身被 Next.js 包了一层缓存语义。

理解这三条，Next.js 80% 的文档就能看懂了。

## 实践案例

### 案例 1：最简的页面

```tsx
// app/page.tsx
export default function Page() {
  return <h1>Hi</h1>
}
```

这一个文件 + 一行代码，就是一个跑在 `/` 的页面。**没有路由配置、没有 server.js、没有 webpack 配置**——保存即生效。

### 案例 2：动态路由

```tsx
// app/blog/[slug]/page.tsx
export default function BlogPost({ params }: { params: { slug: string } }) {
  return <h1>Reading: {params.slug}</h1>
}
```

文件名里的 `[slug]` 表示**这一段是动态的**。访问 `/blog/hello` → params.slug 就是 `'hello'`。访问 `/blog/anything` → params.slug 就是 `'anything'`。

这个约定来自老的 Pages Router，App Router 沿用并强化了。

### 案例 3：Server Component 直接 await fetch

```tsx
// app/products/page.tsx
async function Page() {
  const data = await fetch('https://api.example.com/products').then(r => r.json())
  return <ul>{data.map(p => <li key={p.id}>{p.name}</li>)}</ul>
}
export default Page
```

**这个组件在服务器上跑**——`await` 直接写在组件里，浏览器收到的是已经渲染好的 HTML，没有 "loading..." 闪烁。

这就是 React Server Components。在 Next.js 之前，没有任何主流框架能让你这样写。

## 踩过的坑

1. **`"use client"` 与 `"use server"` 边界绕**：App Router 默认是 Server Component，加 `"use client"` 才变 Client Component。**错误标记 = 全栈污染**——你在一个 client 组件里 import 了带敏感逻辑的 server-only 模块，敏感逻辑就会被打包进浏览器 bundle。新人最容易栽这里。

2. **Server Component 不能用 hooks**：`useState` / `useEffect` / `useRef` 全部会报错——因为这些组件**没有客户端运行时**，hooks 没地方挂。需要交互的部分必须拆成单独的 client component（顶部加 `"use client"`）。

3. **Edge Runtime 与 Node Runtime 不同 API**：Next.js 提供两个运行时——Edge（轻量、全球分布、冷启动快）/ Node（完整 Node API、能跑任何 npm 包）。**不是所有 npm 包都能跑在 Edge 上**——比如 `fs` / `crypto` 的某些 API、原生 binding 的包。配错运行时部署就 500。

4. **缓存层多到能缓存到旧数据**：fetch cache（fetch 调用结果缓存）+ Router cache（客户端路由缓存）+ Full Route cache（构建时整页缓存）+ Data cache（数据获取层缓存）。**四层缓存重叠**，新人改了数据但页面就是不更新——经常是某一层没失效。

## 适用 vs 不适用场景

**适用**：

- 内容驱动 + SEO 重要的网站（博客、文档、营销页）→ SSG / ISR 一套
- React SaaS 产品（仪表盘、后台）→ App Router + RSC
- 需要服务端渲染 + 良好开发体验 → Next.js 是事实标准
- 部署到 Vercel / Cloudflare Pages → 一行命令上线

**不适用**：

- 纯 SPA、不需要 SSR → 直接 [[vite]] + React，更轻
- 需要复杂自定义服务器逻辑（WebSocket / 长连接 / 自定义中间件）→ Next.js 能做但绕，不如 Express / [[hono]] / [[fastify]] 直白
- 全静态站点（无交互）→ Astro / [[nextra]] 更合适
- 团队不熟 React → 学习曲线陡，[[svelte]] (SvelteKit) 或 Vue (Nuxt) 更平缓

## 历史小故事（可跳过）

- **2016**：Vercel（当时叫 ZEIT）的 Guillermo Rauch 发布 Next.js 1.0——核心理念 "零配置、约定优先"，对标当时的 Create React App + 手动 SSR 的痛苦。
- **2019**：Next.js 9 引入文件系统路由 + API Routes，全栈框架雏形成型。
- **2020**：Next.js 10 加入 Image / i18n / 增量静态再生（ISR）——"既要 SSG 的快，又要 SSR 的新鲜"。
- **2022**：Next.js 13 引入 App Router + React Server Components——这是 React 自身十年来最大的范式变化，Next.js 成了载体。
- **2024+**：[[turbopack]]（Vercel 自研 Rust bundler）逐步替代 webpack，目标 10x 启动速度。

## 学到什么

1. **"约定优先"是降低复杂度的最大杠杆**——文件结构 = 路由，比写 1000 行 router config 都直观
2. **渲染策略不是非此即彼**——SSR / SSG / ISR / RSC 可以混用，**每个页面挑最合适的**
3. **服务器和客户端的边界正在重新被定义**——RSC 让"在哪渲染"成为一个可调参数，而不是架构决策
4. **框架的力量来自生态 + 部署**——Next.js 强不只在代码本身，更在 Vercel 把 push to main = 上线做到了 30 秒

## 延伸阅读

- 官方教程：[Next.js Learn](https://nextjs.org/learn)（互动式，从零搭一个仪表盘）
- 概念深入：[Next.js Docs — App Router](https://nextjs.org/docs/app)（先看 "Routing Fundamentals" 三页）
- RSC 解释：[Dan Abramov — React Server Components](https://www.youtube.com/watch?v=TQQPAU21ZUw)（90 分钟把范式讲透）
- [[react]] —— Next.js 的地基，先懂 React 再学 Next.js
- [[turbopack]] —— Next.js 新一代 bundler，逐步替换 webpack

## 关联

- [[react]] —— Next.js = React + 约定 + 运行时
- [[turbopack]] —— Next.js 自研 bundler，替代 [[webpack]]
- [[next-intl]] —— Next.js 的国际化方案，App Router 时代标配
- [[shadcn-ui]] —— Next.js 项目最常用的组件库（不是 npm 包，是粘贴式组件）
- [[trpc]] —— Next.js 项目里端到端类型安全 API 的常见选择
- [[prisma]] —— Next.js Server Component 里直接调 DB 的常见 ORM
- [[tailwind]] —— Next.js 默认推荐的样式方案
- [[vite]] —— 不需要 SSR 时的轻量替代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[cal-com]] —— cal.com — 自己能托管的开源 Calendly
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[framer-motion]] —— Framer Motion — React 声明式动画
- [[hono]] —— Hono — 多运行时 Web 框架
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[nuxt]] —— Nuxt — Vue 全栈框架
- [[prisma]] —— Prisma — 类型安全 ORM
- [[react]] —— React UI 组件库
- [[remix]] —— Remix — 拥抱 Web 标准的 React 全栈框架
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[sveltekit]] —— SvelteKit — Svelte 全栈框架
- [[tailwind]] —— Tailwind CSS — 工具类优先样式框架
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[webpack]] —— webpack 模块打包
- [[zod]] —— Zod — TypeScript-first schema 验证

