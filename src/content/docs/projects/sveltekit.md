---
title: SvelteKit — Svelte 全栈框架
来源: https://github.com/sveltejs/kit
日期: 2026-05-29
分类: Meta 框架
难度: 中级
---

## 是什么

SvelteKit 是 [[svelte]] 的**官方全栈框架**——把"前端组件库"扩展成一个**能上线**的完整应用。日常类比：Svelte 是发动机，SvelteKit 是把发动机装进车架、配上方向盘、加上仪表盘的**整车**。

它管的事情：

- **路由**（Routing）：文件夹即 URL
- **服务端渲染**（SSR）：首屏不是空白 div，而是已经填好内容的 HTML
- **静态生成**（SSG）：把页面提前烤成纯 HTML 文件
- **API 端点**（API endpoint）：写后端接口不用单独起 Express
- **部署适配**（Adapter）：一份代码部署到 Vercel / Netlify / Cloudflare / Node / 静态服务器，**不改业务代码**

类比对照表（"X 之于 Y"）：

| 框架 | 底层 UI 库 | 关系 |
|------|-----------|------|
| [[next-js]] | [[react]] | Next.js 之于 React |
| [[nuxt]] | [[vue]] | Nuxt 之于 Vue |
| **SvelteKit** | **[[svelte]]** | **SvelteKit 之于 Svelte** |

## 为什么重要

SvelteKit 不只是"Svelte 加个路由"，它代表**几个行业级动作**：

- **Vercel 把 Svelte 团队挖去**——Rich Harris（Svelte 作者）2021 年加入 Vercel 全职做 SvelteKit。这意味着 Vercel 同时养着两个亲儿子：[[next-js]]（React 系）和 SvelteKit（非 React 系）。Vercel 在押"未来不一定只有 React"。
- **Adapter 系统真正解决"部署目标锁定"**——传统 Next.js 重度绑 Vercel，迁到 Cloudflare Workers 要改不少代码。SvelteKit 的 adapter 是**编译时插件**，换部署目标只换 `svelte.config.js` 一行配置。
- **包体积小**——继承自 Svelte 的"编译时优化"思路，运行时只剩必要代码，初次加载比 Next.js 小一半起步。
- **Form Actions 与 [[remix]] 同思路**——回归 Web 标准的 `<form>` + `POST`，而不是堆 `useState` + `fetch`。这是 2023 年起 meta 框架的共识方向。

## 核心要点

SvelteKit 的"3 + 2"心智模型：**3 种文件 + 2 个机制**。

**3 种文件**（同一个路由文件夹下可以共存）：

- `+page.svelte` — 用户能看到的页面，**两端都跑**（先服务端渲染，再客户端 hydrate）
- `+page.ts` — 通用 load 函数，**两端都跑**，适合从公开 API 取数据
- `+page.server.ts` — 服务端 load 函数，**只在服务端跑**，可以直接连数据库、读环境变量、用密钥

记忆口诀：**没后缀 = 两端 / 加 .server = 只服务端**。

**2 个机制**：

- **load 函数**：在页面渲染前自动跑，返回的数据自动注入 `+page.svelte` 的 `data` prop
- **adapter**：部署目标抽象层，`adapter-vercel` / `adapter-cloudflare` / `adapter-node` / `adapter-static` 任选

API 端点也是文件——`src/routes/api/foo/+server.ts` 里 `export GET` / `POST` 直接对外暴露 `/api/foo`。

## 实践案例

### 案例 1：最简首页（5 秒上手）

```
src/routes/+page.svelte
```

```svelte
<h1>Hi</h1>
```

`pnpm dev` 启动后，`http://localhost:5173/` 就是这个页面。**没有路由配置文件，没有注册步骤**。

### 案例 2：API 端点（不需要单独的后端）

```ts
// src/routes/api/hello/+server.ts
import { json } from '@sveltejs/kit'
export const GET = () => json({ msg: 'hi' })
```

访问 `/api/hello` 返回 `{"msg":"hi"}`。和 `+page.svelte` 共享同一个目录树，前后端**用同一个仓库、同一个路由表**。

### 案例 3：load 取数据 → 注入页面

```ts
// src/routes/posts/+page.server.ts
import { db } from '$lib/server/db'
export const load = async () => ({
  posts: await db.posts.findMany()
})
```

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  export let data
</script>

{#each data.posts as post}
  <article>{post.title}</article>
{/each}
```

`load` 在服务端跑——`db` 是 Prisma / Drizzle / 任何 ORM——返回的对象自动变成页面的 `data`。**没有 `useEffect`、没有 `useQuery`、没有 loading 状态自己管**。

## 踩过的坑

- **`+page.ts` vs `+page.server.ts` 区别**：前者**两端都跑**，所以**不能** import 含数据库连接 / 私钥的模块——一旦 import，整个文件会被打包到客户端 bundle，**密钥泄露**。后者**只服务端跑**，import 啥都安全。新人最常混淆的就是这一点。
- **Hydration 失败（"node mismatch" 警告）**：服务端渲染的 HTML 和客户端 hydrate 时生成的 DOM 不一致，常见根因是用了 `Date.now()` / `Math.random()` / `window.localStorage`，两端结果不同。修法：把这类调用挪到 `onMount` 里（只客户端跑）。
- **Adapter 选错部署不通**：`adapter-static` 默认导出纯 HTML，碰到 `+page.server.ts` 里有动态 load 函数会**编译失败**。要么改用 `adapter-vercel` / `adapter-node`，要么把动态接口改成构建期可计算（`prerender = true`）。
- **Svelte 5 + SvelteKit 升级**：Svelte 5 引入 runes 语法（`$state` / `$derived` / `$effect`），旧 Svelte 4 的 `let count = 0` 自动响应式**不再生效**。升级时所有响应式状态要改写，不是无脑跑 codemod 就能完事——逻辑稍复杂的组件要手动审。

## 适用 vs 不适用场景

**适用**：

- 中小型全栈应用——博客 / SaaS / 内部工具 / 营销站
- 需要 SSR + SSG 混合的内容站点
- 部署目标可能变（今天 Vercel，明天搬到自家 Node）
- 团队偏好"少模板代码、靠近 Web 标准"

**不适用**：

- React 生态深度依赖（Next.js 的 React 组件库 / Tailwind 模板复用不来）
- 团队完全不熟悉 Svelte 语法
- 需要超大规模 SSR 流式渲染（Next.js 14+ App Router 在这块更成熟）
- 客户端要求 SPA 路由（SvelteKit 默认 SSR 优先，纯 SPA 模式可用但不是主路径）

## 学到什么

- **Meta 框架的本质是"约定胜配置"**——文件夹结构就是路由表，文件名就是契约
- **服务端 / 客户端边界靠文件名后缀划清**，比导入路径检查更直觉
- **Adapter 把"部署目标"从代码里抽离**，是平台无关性的关键设计
- **Form Actions / load 函数**是回归 Web 标准的趋势，[[remix]] 和 SvelteKit 殊途同归

## 延伸阅读

- 官方教程：[learn.svelte.dev](https://learn.svelte.dev)（交互式，浏览器里直接练）
- SvelteKit 文档：[kit.svelte.dev/docs](https://kit.svelte.dev/docs)
- Rich Harris 演讲：["Rethinking Reactivity"](https://www.youtube.com/watch?v=AdNJ3fydeao)（理解 Svelte 编译时思路）
- [[svelte]] —— SvelteKit 的底座
- [[next-js]] —— React 阵营的对位框架
- [[nuxt]] —— Vue 阵营的对位框架

## 关联

- [[svelte]] —— SvelteKit 没有 Svelte 就是空壳；理解 SvelteKit 必先理解 Svelte 的编译时思想
- [[next-js]] —— 同为 Vercel 出品的全栈框架，针对 React 生态；和 SvelteKit 共享许多设计灵感
- [[nuxt]] —— Vue 阵营对位框架，路由约定、SSR / SSG 思路高度相似
- [[remix]] —— Form Actions / loader 概念的源头之一，与 SvelteKit 的 load + actions 同源
- [[react]] —— Next.js 的底座，对照理解"UI 库 + meta 框架"分层
- [[vue]] —— Nuxt 的底座，同样的对照位置

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

