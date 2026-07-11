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

- **Vercel 把 Svelte 团队挖去**——Rich Harris（Svelte 作者）2021 年加入 Vercel 全职做 Svelte / SvelteKit。这意味着 Vercel 同时养着 [[next-js]]（React 系）和 SvelteKit（非 React 系），在押"未来不一定只有 React"。
- **Adapter 把部署目标从业务代码里抽离**——换 Vercel / Cloudflare / Node / 静态站，通常只改 `svelte.config.js` 的 adapter，不必重写路由与 load。相对地，Next.js 也能部署到别处，但边缘运行时与平台 API 差异仍常要改适配层。
- **包体积常更小**——继承 Svelte 的编译时优化，运行时只剩必要代码；简单页面首包往往明显小于同功能的 React meta 框架，具体差多少视组件与依赖而定。
- **Form Actions 与 [[remix]] 同思路**——回归 Web 标准的 `<form>` + `POST`，而不是堆客户端 `fetch`。这是 2023 年起 meta 框架的共识方向。

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

### 案例 1：文件夹即路由

1. 建 `src/routes/about/+page.svelte`，写 `<h1>About</h1>`
2. `pnpm create svelte@latest` 后 `pnpm dev`，打开 `http://localhost:5173/about`
3. **没有** `routes.ts`、没有手动注册——路径 = 文件夹名

### 案例 2：load 取数 → 注入页面（逐步）

1. 在 `src/routes/posts/+page.server.ts` 写只跑在服务端的 load（可安全连库）：

```ts
import { db } from '$lib/server/db'
export const load = async () => ({ posts: await db.posts.findMany() })
```

2. 同目录 `+page.svelte` 接收自动注入的 `data`：

```svelte
<script lang="ts">export let data</script>
{#each data.posts as post}<article>{post.title}</article>{/each}
```

3. 打开 `/posts`：服务端先跑 load，再把 HTML 发给浏览器——**没有** `useEffect` / 自己管 loading。

### 案例 3：Form Action（标准表单提交）

```ts
// src/routes/todos/+page.server.ts
import { fail } from '@sveltejs/kit'
export const actions = {
  default: async ({ request }) => {
    const title = (await request.formData()).get('title')
    if (!title) return fail(400, { error: '标题必填' })
    // await db.todos.create({ data: { title: String(title) } })
    return { ok: true }
  }
}
```

```svelte
<!-- src/routes/todos/+page.svelte -->
<form method="POST">
  <input name="title" /><button>添加</button>
</form>
```

浏览器原生 `POST` 到当前路由；服务端 `actions.default` 处理。可再加 `use:enhance` 做无刷新增强，但**不依赖**也能用。

## 踩过的坑

1. **`+page.ts` vs `+page.server.ts`**：前者两端都跑，**不能** import 数据库 / 私钥——会打进客户端 bundle 导致密钥泄露；后者只服务端跑才安全。
2. **Hydration「node mismatch」**：`Date.now()` / `Math.random()` / `localStorage` 两端结果不同；把这类调用挪到 `onMount`（只客户端）。
3. **Adapter 选错**：`adapter-static` 碰到动态 `+page.server.ts` load 会编译失败——改用 `adapter-node` / `adapter-vercel`，或设 `prerender = true`。
4. **Svelte 5 runes 升级**：旧 `let count = 0` 自动响应式失效，要改成 `$state` / `$derived`；复杂组件不能只靠 codemod。

## 适用 vs 不适用场景

**适用**：

- 1–15 人团队的中小型全栈（博客 / SaaS / 内部工具），首包目标常在约 50–150KB gzip 量级（视依赖）
- 需要 SSR + SSG 混合、日 PV 约十万级以内的内容站
- 部署目标可能变（Vercel ↔ 自建 Node ↔ Cloudflare），希望改配置多于改业务代码
- 团队偏好少模板代码、靠近 Web 标准表单

**不适用**：

- 已深度绑定 React 组件库 / 设计系统（迁移成本通常 > 重写业务）
- 团队零 Svelte 经验且上线窗口 < 2 周
- 需要超大规模 SSR 流式与生态插件（Next.js App Router 更成熟）
- 强制纯 SPA、几乎不要服务端（可用 SPA 模式，但不是主路径）

## 历史小故事（可跳过）

- **2019–2020**：前身是 Sapper；团队决定用 Vite 重做，项目改名 SvelteKit
- **2021-03**：SvelteKit 进入 public beta；同年 11 月 Rich Harris 加入 Vercel 全职做 Svelte
- **2022-12**：SvelteKit 1.0 正式发布，成为官方推荐的 Svelte 应用脚手架
- **2024+**：配合 Svelte 5 runes，Form Actions / remote functions 继续把「服务端能力」收进约定文件名

## 学到什么

- **Meta 框架的本质是约定胜配置**——文件夹即路由，文件名即契约
- **服务端 / 客户端边界靠 `.server` 后缀划清**，比靠导入路径检查更直觉
- **Adapter 把部署目标从代码里抽离**，是平台无关性的关键设计
- **Form Actions / load** 回归 Web 标准，与 [[remix]] 殊途同归

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

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[evidence]] —— Evidence — 把 Markdown + SQL 编译成静态报告站
- [[next-js]] —— Next.js — React 全栈框架
- [[nuxt]] —— Nuxt — Vue 全栈框架
- [[react]] —— React UI 组件库
- [[remix]] —— Remix — 拥抱 Web 标准的 React 全栈框架
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[vue]] —— Vue.js — 渐进式 UI 框架

