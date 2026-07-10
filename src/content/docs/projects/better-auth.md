---
title: better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
来源: 'https://github.com/better-auth/better-auth'
日期: 2026-05-30
分类: 框架与 SDK
难度: 中级
---

## 是什么

better-auth 是一个**让你写一行 `betterAuth({ plugins: [...] })`，就同时拥有邮箱密码登录、GitHub/Google OAuth、二步验证、Passkey、组织管理**的 TypeScript 认证库。日常类比：像装电饭煲——你买的不是只会煮米饭的机器，而是一个空容器加几张菜单卡片，想煮什么就插对应卡片，机器面板上自动多几个按钮。

你写：

```ts
import { betterAuth } from "better-auth";
import { passkey } from "@better-auth/passkey";

export const auth = betterAuth({
  database: db,
  emailAndPassword: { enabled: true },
  plugins: [passkey()],
});
```

这一段后，服务端立刻有 `/api/auth/sign-in/email`、`/api/auth/sign-up/email`、`/api/auth/passkey/register` 等十几个 endpoint；前端再接上 `passkeyClient()` 后，`authClient.passkey.signIn()` 这种方法会出现在 IDE 自动补全里——你没写任何类型定义。这就是 better-auth 主打的"plugin 一装，类型自己长出来"。

## 为什么重要

不理解 better-auth 的 plugin 注册表 + adapter 抽象，下面几件事都没法解释：

- 为什么不少 TS 项目会拿它和 Auth.js / Clerk 对比——Auth.js 偏 Provider/Adapter，Clerk 偏托管 SaaS，better-auth 则把自托管、插件和类型推导放在同一个包里
- 为什么 better-auth 能同时跑在 Next.js / SvelteKit / Hono / Bun / Cloudflare Workers 上——它的 `handler(request)` 接收标准 `Request`，谁都能转给它
- 为什么"装一个 plugin 就多一组方法"在 TS 里能做到——靠的是 declaration merging（声明合并）这种少见但工业级的语言机制
- 为什么相同代码切换 ORM（Drizzle ↔ Prisma ↔ Kysely）只需改一行——adapter 把 CRUD 抽成统一接口

## 核心要点

better-auth 的设计可以拆成 **三层**：

1. **Plugin 注册表（让类型穿透）**：每个 plugin 用 TypeScript 的 `declare module` 给中央 registry 加一个 key，主包通过 `keyof BetterAuthPluginRegistry` 反查所有已装 plugin，把方法挂到 `auth.api.*` 和 `authClient.*`。类比：每个插件自报家门贴一张便签，主包扫便签自动开窗口。

2. **Adapter 抽象（让数据库可插拔）**：所有数据库操作走统一接口 `DBAdapter`（create/findOne/findMany/update/delete/transaction）。drizzle / prisma / kysely / mongo / memory 各自实现一份。类比：电源插头——墙上插座一种规格，电器都按规格做插头。

3. **Endpoint pipeline（让 plugin 互相挂钩）**：每个 endpoint 都被包成统一签名 `(ctx) => Response`，并跑过 `before` / `after` hook 链。类比：流水线传送带，plugin 可以在传送带前后两端各加一个工人贴标签。

三层加起来：plugin 之间互相不知道对方存在，但用户感受是"功能像内置一样齐全"。

## 实践案例

### 案例 1：5 行配出邮箱密码登录

```ts
// server.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
});
```

**逐部分解释**：

- `database: drizzleAdapter(...)` 告诉 better-auth 用 Drizzle 操作 PostgreSQL
- `emailAndPassword: { enabled: true }` 这一开关就让主包内置的 `/sign-in/email`、`/sign-up/email`、`/forget-password` 全部 endpoint 上线
- 不需要再写 controller，handler 已经是 `auth.handler(request)`，框架那边只 `app.all("/api/auth/*", auth.handler)` 一行即可

### 案例 2：加 GitHub OAuth + Passkey

```ts
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { passkey } from "@better-auth/passkey";
import { passkeyClient } from "@better-auth/passkey/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  plugins: [passkey()],
});

export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});
```

**逐部分解释**：

- `socialProviders.github` 自动产生 `/sign-in/social?provider=github` 与回调；PKCE / state / nonce 都不需要你管
- 服务端 `plugins: [passkey()]` 负责 Passkey 注册/登录 endpoint；客户端 `passkeyClient()` 负责把 `authClient.passkey.register()` 与 `authClient.passkey.signIn()` 挂到类型里
- 因为 passkey 在独立子包 `@better-auth/passkey`，不用 Passkey 的项目体积不增加

### 案例 3：多租户组织

```ts
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});

// 客户端
await authClient.organization.create({ name: "Acme" });
await authClient.organization.inviteMember({ email: "a@b.com", role: "admin" });
```

`organization()` plugin 在数据库里自动建 `organization` / `member` / `invitation` 三张表，并把 `auth.api.createOrganization`、`acceptInvitation` 等十几个方法挂出来——你没写任何路由代码。

## 踩过的坑

1. **`baseURL` / `trustedOrigins` 配错——cookie 不写入或被浏览器拒绝**：开发环境 `localhost` 正常但生产环境 `*.example.com` 死活登不上，根因常是 `baseURL` 没改或 `trustedOrigins` 没加子域名。

2. **不同适配器事务支持差异**：MySQL 没有 `INSERT ... RETURNING`，drizzle adapter 内部走 5 级降级；切 ORM 后老 plugin 的 schema 迁移命令要重跑（`npx better-auth migrate`）。

3. **两个 plugin 注册同一个 registry key**：TypeScript declaration merging 不会报错，但运行时后注册的覆盖前注册的。如果你 fork 某 plugin 自己改名，记得 `id` 字段也改。

4. **SSR / Edge Runtime 写 cookie 行为不同**：Next.js Server Action 与 Route Handler 写 cookie 的 API 不一样；用错容器框架专属的 helper（如 `nextCookies()`）会得到"登录成功但下一次请求又是匿名"的诡异表现。

## 适用 vs 不适用场景

**适用**：

- TypeScript 后端，需要邮箱密码 + 几种 OAuth + 可能未来加 Passkey/2FA
- 自托管开源、不想被 Clerk/Auth0 价格锁定
- 多框架项目（同一份认证逻辑跑 Next.js + Hono + Bun）
- 需要组织/SSO/API key 等企业向能力但预算紧

**不适用**：

- 团队完全不写 TS（better-auth 类型推导是核心卖点，纯 JS 用得别扭）
- 只是个 hackathon demo——直接 `next-auth` 或干脆用 Clerk 免费档更快
- 极端轻量场景只要"一个 session"——Lucia 残骸或手写 50 行更轻
- 重度依赖 SAML 老企业 IDP——better-auth SSO plugin 还在演进，老牌 WorkOS / Auth0 更稳

## 历史小故事（可跳过）

- **2024 年初**：Bekacru（Bereket Engida，埃塞俄比亚开发者）受不了 Auth.js v5 难扩展、Clerk 涨价、Lucia 作者宣布"自己写 session"的处境，开始造 better-auth
- **2024 年中**：在 X（Twitter）发 demo 视频——5 行加 Passkey、装 plugin 类型自动出现，走红开发者圈
- **2025 年**：进入 Y Combinator 加速器，发布 1.0 稳定版，覆盖 Next.js / SvelteKit / Hono / Bun / Cloudflare 等几乎所有主流 JS 运行时
- **2026 年**：stars 28k+，社区贡献的 plugin（Stripe / SIWE / Magic Link）超过 30 个，成为 TS 后端默认开源认证选择之一

## 学到什么

1. **"plugin 是一等公民" + "类型穿透" 是 TS-first 框架的核心模式**——declaration merging 这种语言机制看着冷门，但用对了能让"装 plugin 就多方法"无侵入实现
2. **Adapter 抽象的边界要划得狠**——数据库五花八门，但 better-auth 只暴露 6 个 CRUD 方法，复杂的方言细节锁在 adapter 内部
3. **跨框架靠"标准化输入"**——`handler(request: Request)` 接受标准 Web API 的 `Request`，谁能转换出 Request 谁就能用
4. **开源认证想活下去，要功能完整 + 自托管开源 + 跨框架——三条缺一不可**

## 延伸阅读

- 文档：[better-auth 官方文档](https://www.better-auth.com/docs)（plugin 列表 + 框架接入指引）
- 视频：[Theo - better-auth review](https://www.youtube.com/results?search_query=theo+better-auth)（看一线 TS 开发者如何评价）
- 源码：[better-auth GitHub](https://github.com/better-auth/better-auth)（pnpm workspace 21 子包）
- [[auth-js]] —— 前辈 + 灵感源；better-auth 的 plugin 模型直接受其 Provider/Adapter 抽象启发
- [[drizzle]] —— 默认推荐 ORM，drizzle adapter 是最完整的实现

## 关联

- [[auth-js]] —— Auth.js v5 把 Provider/Adapter 双抽象做到工业级；better-auth 把"插件"这一层从 callback 升级成一等公民
- [[drizzle]] —— Drizzle 的"用 TS 类型描述 schema"哲学和 better-auth 的"plugin 注册类型"思路同根
- [[prisma]] —— Prisma adapter 让 better-auth 也能跑在 Prisma 项目；adapter 抽象把 ORM 选择留给用户
- [[hono]] —— Hono 在 Bun / Cloudflare Workers 等 edge 运行时的覆盖，让 better-auth 的"标准 Request 输入"思路有了真实价值
- [[next-js]] —— Next.js Server Actions / Route Handler 的 cookie 行为差异是 better-auth 特意做的兼容点
- [[trpc]] —— 同样是"让 TS 类型穿透前后端"的思路，better-auth 借鉴了它的类型推导经验
- [[zod]] —— better-auth 的 endpoint 输入校验默认用 zod，与生态主流对齐

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[drizzle]] —— Drizzle ORM — 轻量 SQL-like ORM
- [[hono]] —— Hono — 多运行时 Web 框架
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[next-js]] —— Next.js — React 全栈框架
- [[prisma]] —— Prisma — 类型安全 ORM
- [[supabase]] —— Supabase — Firebase 的开源替代
- [[supertokens]] —— SuperTokens — 自托管认证框架，把登录方式做成可拼装的 Recipe
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[zod]] —— Zod — TypeScript-first schema 验证

