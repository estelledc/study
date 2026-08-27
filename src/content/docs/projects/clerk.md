---
title: Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
description: 开源接线 SDK：在应用侧校验 session JWT，登录与用户表仍跑在 Clerk 云。
来源: https://github.com/clerk/javascript
日期: 2026-05-30
分类: 框架与 SDK
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/clerk/javascript
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2799f0ddb8590d88fcb15dbd6b7e06c453ecb9d2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: '@clerk/nextjs@7.8.2'
---

## 是什么

Clerk 是一套**把登录、用户、组织、邀请和 MFA 放在云端，只把接线 SDK 开源**的认证产品。日常类比：厨房在别的大楼，你店门口只放外卖窗口和验票器。

固定提交里，`@clerk/nextjs` 不实现密码哈希或 session 存储。它把 Next middleware / App Router 接到 `@clerk/backend` 的 `authenticateRequest`，再用 Web Crypto 验 JWT。用户表仍在 Clerk 云。

你写：

```tsx
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export default function Root({ children }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}

const { userId } = await auth();
```

`<SignIn />` 这类组件来自 `@clerk/react` / `@clerk/clerk-js`，渲染在你的域名下；签发与用户数据不在这个 monorepo。

## 为什么重要

不理解 Clerk 的 SDK / 云边界，下面这些事都没法解释：

- 为什么 5 行代码能出登录页，却迁不出 password hash
- 为什么 Edge middleware 能验 session，却不能用 Node `jsonwebtoken`
- 为什么 `createRouteMatcher` 在 7.8.2 被标成 deprecated
- 为什么 telemetry 默认不是“全量生产上报”

## 核心要点

固定 7.8.2 的主链可以拆成五步：

1. **接线 SDK**：`packages/` 下有 27 个目录。`@clerk/nextjs@7.8.2` 依赖 workspace 内 `@clerk/backend@3.16.12`、`@clerk/react@6.14.7`、`@clerk/shared@4.30.1`。

2. **`clerkMiddleware` → `authenticateRequest`**：middleware 先处理可选 Frontend API proxy，再调用 backend 验请求。默认接受 `session_token`；也可声明 `api_key` / `m2m_token` / `any`。

3. **JWT 验签**：`verifyJwt` 先 `subtle.verify`，再检查 `sub` / `aud` / `azp` / `exp` / `nbf` / `iat`。默认 clock skew 5s。远程 JWKS 按 instance 分缓存，避免跨实例 `kid` 串用。

4. **授权对象**：signed-in 的 `has()` 来自 `@clerk/shared` 的 `createCheckAuthorization`，读 session claims 里的 org role / permission / feature / plan。signed-out 的 `has()` 恒为 false。

5. **云端仍不可见**：BAPI 常量为 `https://api.clerk.com` / `v1`。密码、session 存储和欺诈策略不在开源 SDK。

## 实践示例

### 案例 1：在资源位保护，而不是只靠路径通配

```ts
// proxy.ts / middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname.startsWith("/dashboard")) {
    await auth.protect();
  }
});

// app/dashboard/page.tsx
import { auth } from "@clerk/nextjs/server";

export default async function Dashboard() {
  const { userId, has } = await auth();
  if (!userId) return null;
  return has({ role: "org:admin" }) ? <Admin /> : <Member />;
}
```

固定版本把 `createRouteMatcher` 标成 deprecated：路径匹配可能和 Next 真实路由分叉。`auth.protect()` 仍可在 middleware 里按 pathname 调用，但授权应以页面 / layout / route handler 为准。

### 案例 2：Edge 上验 JWT 用 Web Crypto

```ts
import { verifyJwt } from "@clerk/backend/jwt";

const { data, errors } = await verifyJwt(token, { key: jwk });
```

`hasValidSignature` 用 `runtime.crypto.subtle.verify`。这是 SDK 能跑在 Edge 的直接原因，不是“Clerk 比 jsonwebtoken 更快”的性能结论。

### 案例 3：过期 session 不会在任意 method 上静默续期

`authenticateRequest` 只在 token 过期、请求是 GET、且 cookie 里有 refresh token 时才走 BAPI refresh。POST 上传不能假设 middleware 会代为续期。

## 踩过的坑

1. **把 `createRouteMatcher` 当现行合同**：固定 `@clerk/nextjs@7.8.2` 已 deprecated，下一步应把检查移到资源位。
2. **以为 telemetry 100% 上报生产流量**：collector 默认 `disabled: false`，但 `isEnabled` 只对 development instance 为真；`CLERK_TELEMETRY_DISABLED` 或 `telemetry={false}` 可关。
3. **把 JWKS 缓存当成进程级全局 `kid` 表**：固定实现按 instance 分桶；跨实例复用缓存是旧风险。
4. **把 prebuilt UI 当布局引擎**：`appearance` 改样式；字段顺序和 OAuth 位置要走 headless hook。
5. **把 SaaS 用户表当成可导出 schema**：开源仓没有 password hash 或 passkey 私钥。

## 适用 vs 不适用场景

**适用**：

- 需要 hosted 登录 / 组织 / MFA，并接受用户数据在 Clerk 云
- Next.js 15.2.8+ / 16 的 App Router，要在 Edge 验 session JWT
- 需要 SDK 同时认 session、API key 或 M2M token

**不适用**：

- 用户表必须落在自己的数据库 → [[better-auth]] / [[lucia]] / [[auth-js]]
- 只要企业 SSO / Directory Sync，不想把整套用户托管出去 → [[workos]]
- 已经在 [[supabase]] 并用 RLS 绑同一用户身份
- 不能接受 `@clerk/nextjs` 对 Next 15.2.8+ / 16 的 peer 范围

## 固定版本边界

- 本文绑定 `clerk/javascript@2799f0dd...`。`@clerk/nextjs@7.8.2`、`@clerk/backend@3.16.12`、`@clerk/react@6.14.7`、`@clerk/shared@4.30.1`、`@clerk/clerk-js@6.30.1` 五个 tag 剥到同一提交。
- npm 未提供这些包的 `gitHead`；版本以 Git tag 与 `package.json` 互证。
- Next peer：`^15.2.8 || ^16`；Node `>=20.9.0`。
- 本文未安装依赖、调用 Clerk API、跑上游测试或测量包体，状态保持 `UNVERIFIED`。

## 学到什么

1. **开源 SDK ≠ 开源认证**：能读到的是验票与 UI 接线，不是用户库。
2. **路径中间件不是授权源**：deprecated 的 matcher 说明“像路由一样写 auth”会和框架路由分叉。
3. **跨实例缓存必须按租户分桶**：`kid` 不够当全局主键。
4. **默认续期有 method 门**：GET + refresh cookie 才能走 BAPI refresh。

## 应用型自测

1. 未声明 `acceptsToken` 时，`authenticateRequest` 默认接受哪类 token？
2. 固定 7.8.2 是否还把 `createRouteMatcher` 当作推荐 API？
3. production instance 上，未显式关闭 telemetry 时，collector 会不会发送事件？

检查点：

1. `session_token`。
2. 不会；源码标 deprecated，要求改到资源位检查。
3. 不会；`isEnabled` 在非 development instance 直接为 false。

## 延伸阅读

- 固定源码：[clerk/javascript](https://github.com/clerk/javascript) —— 本文绑定提交 `2799f0ddb8590d88fcb15dbd6b7e06c453ecb9d2`
- middleware：[clerkMiddleware.ts](https://github.com/clerk/javascript/blob/2799f0ddb8590d88fcb15dbd6b7e06c453ecb9d2/packages/nextjs/src/server/clerkMiddleware.ts)
- JWT：[verifyJwt.ts](https://github.com/clerk/javascript/blob/2799f0ddb8590d88fcb15dbd6b7e06c453ecb9d2/packages/backend/src/jwt/verifyJwt.ts)
- [[workos]] —— 同一赛道的企业 SSO / User Management SDK，session 由调用方封 cookie
- [[better-auth]] —— 自托管、插件拼功能的对照
- [[auth-js]] —— 自托管 OAuth/session 抽象

## 关联

- [[workos]] —— SaaS 认证对照：Clerk 托管用户+UI，WorkOS SDK 更薄、模块更多
- [[auth-js]] —— OSS Provider/Adapter 路线
- [[better-auth]] —— OSS plugin-first 自托管
- [[lucia]] —— 降级为学习资源的 utility 派
- [[next-js]] —— `@clerk/nextjs` 的宿主
- [[react]] —— `ClerkProvider` 与 prebuilt UI

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[supertokens]] —— SuperTokens — 自托管认证框架，把登录方式做成可拼装的 Recipe
- [[workos]] —— WorkOS — 企业 SSO 与用户管理共用一个 Node SDK 的认证 SaaS
