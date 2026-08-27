---
title: SvelteKit — Svelte 全栈框架
来源: https://github.com/sveltejs/kit
日期: 2026-05-29
分类: Meta 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/sveltejs/kit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 39e8e1fbd4feba7f22dd46bfdf7335362c38de16
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.70.3
---

## 是什么

SvelteKit 是 [[svelte]] 的官方全栈框架。固定 `@sveltejs/kit@2.70.3` 用路由文件夹和带 `+` 的文件名，把页面、通用 load、只服务端 load、表单 action 和 HTTP endpoint 分成不同模块。

日常类比：Svelte 是发动机，SvelteKit 是车架。文件夹是路牌，文件名是合同：谁能进浏览器、谁只能留在服务器，靠后缀而不是靠约定俗成的 import 路径。

对照表：

| 框架 | 底层 UI 库 | 关系 |
|------|-----------|------|
| [[next-js]] | [[react]] | Next.js 之于 React |
| [[nuxt]] | [[vue]] | Nuxt 之于 Vue |
| **SvelteKit** | **[[svelte]]** | **SvelteKit 之于 Svelte** |

## 为什么重要

不理解固定 2.70.3 的导出和请求入口，就解释不了：

- 为什么 `actions` 写在 `+page.ts` 会直接校验失败
- 为什么 `throw fail()` 是错的，必须 `return fail()`
- 为什么带 form content-type 的跨站 POST 会被 403
- 为什么换 Vercel / Node / 静态站通常只换 adapter 对象，而 adapter 实现不在 `@sveltejs/kit` 本体里

## 核心架构与流程

固定运行时可以看成一条请求链：

1. **`respond()` 分流**：先看是不是 `__data.json`、路由解析或 remote 调用；再按 CSRF 规则检查跨站表单。页面方法集合是 `GET` / `HEAD` / `POST`。

2. **文件名即导出合同**：`+page.js/ts` 允许 `load`、`prerender`、`csr`、`ssr`、`trailingSlash`、`config`、`entries`。`actions` 只属于 `+page.server`。`+server` 才导出 `GET` / `POST` 等 HTTP 方法。

3. **两类 load**：`load_server_data` 只跑 `+page.server` 的 `load`，并跟踪 `url` / `params` / `depends` / `parent`。`load_data` 再跑 universal `load`，并把 server data 作为 `data` 传入。

4. **Form actions 只接受 POST + 表单编码**：`call_action` 从 `?/` 搜索参数取命名 action；`default` 与命名 action 不能共存。非 form content-type 返回 415。`fail()` 必须返回，不能抛。

5. **Adapter 是插件**：`adapt()` 取出 `config.kit.adapter` 的 `name` 和 `adapt(builder)`。具体 `adapter-node` / `adapter-vercel` / `adapter-static` 是另一些包，本轮未打开。

## 实践案例

### 案例 1：文件夹即路由

`src/routes/about/+page.svelte` 对应 `/about`。没有单独的 `routes.ts`。同目录还可以放 `+page.ts`（两端 load）和 `+page.server.ts`（只服务端 load / actions）。记忆口诀：**没 `.server` = 可能进客户端；有 `.server` = 只服务端。**

### 案例 2：server load 的数据会交给页面，也会交给 universal load

```ts
// src/routes/posts/+page.server.ts
export const load = async () => ({ posts: [{ title: "Hi" }] })
```

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">export let data</script>
{#each data.posts as post}<article>{post.title}</article>{/each}
```

服务端 `load` 的返回进入 `load_server_data`。若同目录还有 `+page.ts` 的 `load`，它收到的参数里带 `data: server_data_node?.data`。密钥和数据库客户端只能放进 `.server` 模块；universal load 会进客户端打包合同。

### 案例 3：Form Action 必须返回 fail，且只要 POST

```ts
// src/routes/todos/+page.server.ts
import { fail } from '@sveltejs/kit'
export const actions = {
  default: async ({ request }) => {
    const title = (await request.formData()).get('title')
    if (!title) return fail(400, { error: '标题必填' })
    return { ok: true }
  }
}
```

```svelte
<form method="POST">
  <input name="title" /><button>添加</button>
</form>
```

固定实现把 action 请求限定为 POST。JSON accept 的 POST 走 `handle_action_json_request`；没有 actions 时是 405，Allow: GET。`return redirect()` / `return error()` 在 DEV 会报错，应直接 `redirect(...)` / `error(...)`。

## 踩过的坑

1. **在 `+page.ts` 写 `actions`**：导出校验会提示它只属于 `+page.server.ts`。
2. **`throw fail()`**：`check_incorrect_fail_use` 会改写成 “Cannot throw fail(). Use return fail()”。
3. **default 和命名 action 混用**：`actions.default` 存在且还有其他 key 会直接抛错。
4. **跨站带 form content-type 的 POST**：`csrf_check_origin` 默认比较 `Origin` 与站点 origin，不匹配且不在 `csrf_trusted_origins` 里则 403。
5. **把 adapter 能力写成 kit 本体保证**：`@sveltejs/kit` 只调用 `adapter.adapt(builder)`。`adapter-static` 碰到动态 server load 会不会失败，要读那个 adapter 包，本轮未打开。

## 适用 vs 不适用场景

**适用**：

- 已选 Svelte，需要 SSR、表单 POST 和按文件划分的服务端边界
- 希望部署目标通过 adapter 插件替换，而不是改路由代码
- 能接受 Node `>=18.13`，以及 Svelte `^4 || ^5` 的 peer 范围

**不适用**：

- 团队已深度绑定 React 组件库 → 迁移成本通常高于重写业务
- 需要本轮未核验的远程函数 / Kit 3 预发布行为（仓库 `version-3` 分支与 `@sveltejs/kit@3.0.0-next.*` 不在本固定提交）
- 强制纯 SPA、几乎不要服务端（可用 SPA 配置，但不是 `respond()` 的主路径）
- 把未测量的包体积或吞吐写成选型依据

## 固定版本边界

- 本文绑定 `sveltejs/kit@39e8e1fb...`，剥开 annotated tag `@sveltejs/kit@2.70.3` 后的提交；`packages/kit/package.json` version 为 `2.70.3`。
- npm `@sveltejs/kit@2.70.3` 未提供 `gitHead`；revision 以 GitHub tag object 为准。
- engines：`node >=18.13`。peer：`svelte@^4 || ^5`，`vite@^5 || ^6 || ^7-beta || ^8`。
- 固定源码已有 remote function 运行时，但本轮只确认入口存在，未展开其序列化/缓存合同。
- 本文未安装依赖、未跑上游测试、未启动 dev server，状态保持 `UNVERIFIED`。

## 学到什么

1. **后缀比目录更硬**——`.server` 决定打包边界；`actions` 不能靠“反正在 routes 里”混进 universal 模块。
2. **表单合同是 Web 标准加框架校验**——POST、form-encoded、Origin 检查、`return fail()` 都是源码分支，不是文档修辞。
3. **load 分两层**——server load 跟踪依赖；universal load 看到的是已经跑完的 server `data`。
4. **kit 本体到 adapter 为止**——平台差异在 adapter 包，不在 `respond()`。

## 应用型自测

1. 把 `export const actions` 写进 `src/routes/foo/+page.ts`，固定 2.70.3 会接受吗？
2. action 里 `throw fail(400, { error: "x" })` 和 `return fail(...)` 哪个符合源码合同？
3. 带 `application/x-www-form-urlencoded` 的跨站 POST，Origin 与站点不同且不在 trusted list，默认会怎样？

检查点：

1. 不会。校验提示 `actions` 只属于 `+page.server.ts`。
2. 必须 `return fail(...)`。
3. 403，文案是 Cross-site POST form submissions are forbidden。

## 延伸阅读

- 官方教程：[learn.svelte.dev](https://learn.svelte.dev)
- 文档：[svelte.dev/docs/kit](https://svelte.dev/docs/kit)
- 固定源码：[sveltejs/kit](https://github.com/sveltejs/kit) —— 本文绑定提交 `39e8e1fbd4feba7f22dd46bfdf7335362c38de16`
- [[svelte]] —— 编译时 UI 底座
- [[nuxt]] —— Vue 阵营对位框架
- [[remix]] —— loader / action 同源对照

## 关联

- [[svelte]] —— 没有 Svelte 编译器，Kit 的 `+page.svelte` 只是空壳
- [[next-js]] —— 同属全栈 meta 框架，文件约定和表单模型不同
- [[nuxt]] —— 用目录约定 + Nitro，而不是 `+page.server` 后缀
- [[remix]] —— 标准 `<form>` + server action 的近亲
- [[auth-js]] —— 常见的 `@auth/sveltekit` 宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[evidence]] —— Evidence — 把 Markdown + SQL 编译成静态报告站
- [[remix]] —— Remix — 拥抱 Web 标准的 React 全栈框架
