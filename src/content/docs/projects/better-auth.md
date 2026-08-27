---
title: better-auth — 用 plugin 注册表把登录能力接到同一条 Request 上
来源: https://github.com/better-auth/better-auth
日期: 2026-08-27
分类: 框架与 SDK
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/better-auth/better-auth
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ba12fcdfa774ca27d417079dbac0b1b5894ccaf2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.7.2
---

## 是什么

better-auth 是一套**框架无关的 TypeScript 认证库**：你给它数据库和一组 option，它吐出吃标准 `Request` 的 `handler`，再按 plugin 往同一条路由上挂能力。日常类比：总机接线台——邮箱密码、GitHub、Passkey 都是分机，总机只认一种插头。

你写：

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
});
```

默认入口走 `auth/full.ts`，返回 `{ handler, fetch, api, $context }`。`handler` 与 `fetch` 是同一个函数。`basePath` 默认 `/api/auth`。本文绑定 `better-auth@1.7.2`（workspace 内 `@better-auth/core@1.7.2`）。

## 为什么重要

不理解固定 1.7.2，下面这些事会对不上：

- 为什么同一份 `auth.handler(request)` 能接到 Next.js、Hono 或裸 Node——它只吃 Web 标准 `Request`
- 为什么写了 `sign-in/email` 路由，不把 `emailAndPassword.enabled` 打开仍会失败
- 为什么装 plugin 后 `auth.api.*` 会多方法——靠 `BetterAuthPluginRegistry` 的 declaration merging，不是运行时“扫便签”
- 为什么换 Drizzle / Prisma / Kysely 只需换 adapter——`DBAdapter` 把 CRUD 收成统一接口

## 核心要点

固定 1.7.2 可以拆成四层：

1. **入口与 per-request clone**：`createBetterAuth` 先 `init`，再把 `handler` 包一层。动态 `baseURL` 或缺省 `baseURL` 时，会 clone context，避免并发请求把 `trustedOrigins` / host 写进共享状态。

2. **Endpoint 合并**：`getEndpoints` 先放内置的 `signInEmail` / `signUpEmail` / `signInSocial` / session 等，再 `reduce` plugin `endpoints`。后注册的同名 key 覆盖前者。路径+方法冲突只由 `checkEndpointConflicts` 打 error log。

3. **Adapter**：`DBAdapter` 提供 `create` / `findOne` / `findMany` / `count` / `update` / `updateMany` / `delete` / `deleteMany`，以及 `consumeOne`、`incrementOne` 和可选 transaction。公开 Drizzle 入口是 `better-auth/adapters/drizzle`。

4. **Plugin 类型**：每个 plugin `declare module "@better-auth/core"` 给 `BetterAuthPluginRegistry` 加一个 id。这是编译期合并，不是运行时注册表扫描。

Router 用 `better-call` 的 `createRouter`，全局挂 `originCheckMiddleware`，默认只接受 `application/json`。

## 实践示例

### 案例 1：打开邮箱密码

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
});

// 框架侧
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
```

`emailAndPassword.enabled` 默认 `false`。路由始终注册，但 `POST /sign-in/email` 未开启时抛 `EMAIL_PASSWORD_DISABLED`。密码存在 `providerId === "credential"` 的 account 上。session `expiresIn` 默认 7 天，`updateAge` 默认 1 天。

### 案例 2：GitHub + Passkey

```ts
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { passkey } from "@better-auth/passkey";
import { passkeyClient } from "@better-auth/passkey/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
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

社交登录走 `POST /sign-in/social`。Passkey 在独立包 `@better-auth/passkey@1.7.2`，带 `./client` 导出。类型能补全，是因为 plugin 的 declaration merging，不是运行时生成 `.d.ts`。

### 案例 3：组织表与 session 字段

```ts
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
```

默认 schema 含 `organization` / `member` / `invitation`，并给 session 加 `activeOrganizationId`。`team` / `teamMember` 只在 `teams: { enabled: true }` 时出现。邀请、成员、权限是 plugin endpoints，不是主包内置路由。

## 踩过的坑

1. **把 `enabled: true` 当成“多注册几个路由”**：路由本来就在。开关管的是运行时拒绝，不是路由表。

2. **漏 `nextCookies()` 或没放最后**：`better-auth/next-js` 的 `nextCookies()` 在 after hook 把 `Set-Cookie` 抄进 `cookies()`。RSC 且没有 `next-action` 时会跳过 session refresh，避免只读渲染写 cookie。

3. **`baseURL` / `trustedOrigins` 配错**：cookie 默认 `httpOnly` + `SameSite=Lax`。生产 host 与 trusted origin 不一致时，浏览器会拒收 cookie；动态 `baseURL` 必须按请求 clone，不能写进共享 context。

4. **MySQL + `generateId: false`**：Drizzle adapter 写明 MySQL 没有 `INSERT/UPDATE/DELETE ... RETURNING`，会走 best-effort fallback。切 provider 后要重看 schema 与迁移，不能假设 Postgres 语义。

5. **两个 plugin 抢同一 path**：后注册覆盖同名 endpoint key；路径冲突只打日志。fork plugin 时连 `id` 一起改。

## 适用 vs 不适用场景

**适用**：

- TypeScript 后端，要把邮箱密码、OAuth、Passkey 或组织放进同一 `handler`
- 自托管、数据留在自己的 ORM / 数据库
- 多框架共用一份认证逻辑（标准 `Request` 输入）

**不适用**：

- 只要托管 UI 和云端用户表——那是 [[clerk]] 的合同
- 要独立 Java 核心服务 + 多语言 SDK——看 [[supertokens]]
- 团队不写 TypeScript，或只想抄 30 行 session——plugin / 类型合并没有收益
- 需要把静态阅读写成“已跑通 OAuth / Passkey”——本文没有运行证据

## 固定版本边界

- 本文绑定 `better-auth/better-auth@ba12fcdf...`，包版本 `1.7.2`。
- 默认入口是 full mode（带 Kysely）；`better-auth/minimal` 是另一条初始化链。
- Passkey 不在主包 exports 里，而在 `@better-auth/passkey`。
- 本文未安装依赖、未跑上游测试、未走真实登录或 cookie，状态保持 `UNVERIFIED`。

## 学到什么

1. **“装上就多方法”来自类型合并，不是魔法运行时**——`BetterAuthPluginRegistry` 是 declaration merging。
2. **开关和路由表是两件事**——邮箱密码路由默认在，`enabled` 只决定能不能用。
3. **跨框架靠标准 Request，跨 ORM 靠 adapter**——`handler(request)` 与 `DBAdapter` 把两边封死。
4. **Next.js cookie 必须当独立 plugin 读**——RSC / Route Handler / Server Action 的写 cookie 合同不同。

## 应用型自测

1. 不写 `emailAndPassword.enabled`，直接 `POST /api/auth/sign-in/email`，固定 1.7.2 会怎样？
2. 两个 plugin 注册同一 endpoint key，TypeScript 会不会编译失败？
3. 只在 RSC 里调 `auth.api.getSession`，且装了 `nextCookies()`，session 一定会滑动续期吗？

检查点：

1. 路由还在，但会得到 `EMAIL_PASSWORD_DISABLED`。
2. 不会。后注册覆盖前者；路径冲突只打日志。
3. 不一定。RSC 且非 Server Action 时，`nextCookies` 会跳过 refresh。

## 延伸阅读

- 文档：[better-auth.com/docs](https://www.better-auth.com/docs)
- 固定源码：[better-auth/better-auth](https://github.com/better-auth/better-auth) —— 本文绑定提交 `ba12fcdfa774ca27d417079dbac0b1b5894ccaf2`
- [[supertokens]] —— 独立 Core 服务，对比嵌入式 library
- [[auth-js]] —— Provider / Adapter 前辈；session 默认值合同不同
- [[clerk]] —— 托管 SaaS，用户表不在你这边

## 关联

- [[supertokens]] —— 自托管产品：Core HTTP 服务 + 多语言 SDK
- [[auth-js]] —— 同一赛道的 library；JWT/JWE 与 Credentials 边界不同
- [[lucia]] —— 已降级为学习资源，不再是可安装框架
- [[clerk]] —— 云端用户表 + 开箱 UI
- [[drizzle]] —— 固定版本推荐的 adapter 之一
- [[hono]] —— 把 `Request` 转给 `auth.handler` 的常见宿主
- [[next-js]] —— `nextCookies()` 专门补的 cookie / RSC 边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[supabase]] —— Supabase — Firebase 的开源替代
- [[supertokens]] —— SuperTokens — 自托管认证核心：用 HTTP recipe 拆开登录与会话
