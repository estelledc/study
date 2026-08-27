---
title: Auth.js — 把 OAuth 登录和会话存储拆成两层抽象
来源: https://github.com/nextauthjs/next-auth
日期: 2026-08-27
分类: 框架与 SDK
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/nextauthjs/next-auth
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e293b3746616660f0844347a68d09eac54b95c6f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.0-beta.32
---

## 是什么

Auth.js 是一套**把“用哪家 IdP 登录”和“会话存哪里”拆开的认证库**。日常类比：多用插座——一头插 GitHub / Google / 邮件，另一头插 JWT cookie 或数据库 session；中间只吃 Web 标准 `Request` / `Response`。

你写：

```ts
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
})
```

框架包 `next-auth` 只做 Next.js 适配，返回 `handlers` / `auth` / `signIn` / `signOut`。真正的状态机在 `@auth/core`：`Auth(request, config)` 解析 action，再分发到 signin、callback、session、signout。

本文绑定 `next-auth@5.0.0-beta.32`（workspace 内 `@auth/core@0.41.3`）。npm `next-auth@latest` 仍是 v4 `4.24.15`，不能把网上 v4 教程当成这个 revision。

## 为什么重要

不理解 Auth.js，下面这些事会对不上：

- 为什么同一套 `providers: [GitHub]` 能接 Next.js App Router，也能被其他框架薄封装调用
- 为什么加 adapter 后默认改走 database session，显式写 `session.strategy: "jwt"` 才能继续无状态
- 为什么 `callbacks.jwt` 和 `callbacks.session` 要成对写——cookie 里的是加密 JWE，前端默认只看到 name/email/image
- 为什么 Credentials 不能当“邮箱密码全家桶”——固定源码故意限制它，且只允许 JWT session

## 核心要点

固定 5.0.0-beta.32 可以拆成四层：

1. **核心吃 Web 标准**：`Auth` 先 `toInternalRequest` / `assertConfig`，再进入 `AuthInternal`。GET 渲染内置页或读 session；POST 的 `signin` / `signout` / `session` 要过 CSRF。

2. **Provider 是配置工厂**：每个 provider 返回带 `id` / `type` / 端点字段的对象，不是 class。OAuth/OIDC 走 `oauth4webapi`；Credentials 的 `authorize` 默认返回 `null`，输入也不做校验。

3. **Session 策略由 adapter 决定默认值**：无 adapter → `jwt`；有 adapter → `database`。`maxAge` 默认 30 天，`updateAge` 默认 1 天。JWT 实际是 `dir` + `A256CBC-HS512` 的 JWE，用 `secret` / `AUTH_SECRET` 派生密钥。

4. **Adapter 方法全部可选**：`createUser` / `createSession` / `createVerificationToken` 等都带 `?`。纯 JWT 不必实现 session 表；Credentials 用户也不会写入 adapter。

## 实践示例

### 案例 1：Next.js 最小 GitHub 登录

```ts
// auth.ts
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

export const { handlers, auth } = NextAuth({
  providers: [GitHub],
})

// app/api/auth/[...nextauth]/route.ts
export { handlers as GET, handlers as POST } from "../../../../auth"
```

`handlers.GET/POST` 直接把 `NextRequest` 交给 `Auth`。环境变量按 `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` / `AUTH_SECRET` 推断；生产缺 `AUTH_SECRET` 会在配置断言阶段失败。

### 案例 2：有无 adapter 会改变默认 session

```ts
NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  // 有 adapter 时默认 strategy: "database"
  session: { strategy: "jwt" }, // 想继续无状态必须显式写
})
```

database 模式下 cookie 只留 `sessionToken`，每次查库。JWT 模式下 cookie 是加密 token；删 cookie 不能作废用户手里的副本。

### 案例 3：自定义字段必须经过两道 callback

```ts
callbacks: {
  jwt({ token, user }) {
    if (user) token.role = user.role
    return token
  },
  session({ session, token }) {
    session.user.role = token.role
    return session
  },
}
```

默认 `session` callback 只返回 name/email/image。服务端 `auth()` 会再包一层，把 `user` 与 session 合并，但客户端 `/session` 仍只看到你显式放回去的字段。

## 踩过的坑

1. **把 npm latest 当成 Auth.js v5**：`latest=4.24.15`，v5 在 `next-auth@beta`。`getServerSession` 是 v4 API。
2. **以为 JWT 只是签名**：固定实现默认加密 JWE；`jwt` 模块源码还标了“将会重构，不要当稳定公共合同”。
3. **Credentials 当生产密码登录**：源码写明故意限制，且用户不落库；hash、限流、防爆破都要自己做。
4. **Edge 上带着 Node-only adapter**：adapter 可能依赖 Node API。核心本身吃 Web 标准，不保证 Prisma 一类客户端能进 middleware。
5. **POST session 失败却去找 redirect**：CSRF 失败时 `Auth` 对 POST `/session` 直接 `400` JSON，不跳错误页。

## 适用 vs 不适用场景

**适用**：

- 需要自托管、多 IdP，并且接受 Web 标准 Request/Response 的 JS 运行时
- Next.js 14/15/16 + React 18/19（本包 peer 范围）
- 想用官方 adapter 做 database session，或显式 JWT 做无状态

**不适用**：

- 要稳定 semver 的生产依赖——本页绑定的是 beta，`@auth/core` 入口也标了 Experimental
- 要开箱 UI / 组织 / MFA 全家桶——这不是本库合同
- 想抄 200 行自己管 cookie——看 [[lucia]] 的单文件样本，不要装这个框架
- 只能用 v4 文档和 `NEXTAUTH_*` 旧心智，又不想迁 env / API

## 固定版本边界

- 本文绑定 `nextauthjs/next-auth@e293b374...`，tag `next-auth@5.0.0-beta.32`，其中 `@auth/core` 版本文件为 `0.41.3`。
- `@auth/core@0.41.3` 单独 tag 是祖先提交 `5af7357f...`；两者源码差一个 package metadata chore，已记录在共享审查文档。
- 未安装依赖、未跑上游测试、未走真实 OAuth。状态保持 `UNVERIFIED`。

## 学到什么

1. **框架无关核心靠 IO 标准，不靠“少写代码”**——适配层只转换协议，状态机仍在 `@auth/core`。
2. **默认值会随 adapter 翻转**——同一份配置加一行 adapter，session 就从 JWE 变成查库。
3. **暴露给客户端的 session 是过滤后的视图**——token 里有的东西，默认不会自动出现在 `useSession`。
4. **限制 Credentials 是产品决策**——不是文档疏忽；密码风险被故意留给调用方。

## 应用型自测

1. 不写 `session.strategy`、也不给 adapter，固定版本默认用哪种 session？
2. 给了 adapter 却想继续无状态 cookie，要改哪一个字段？
3. Credentials 登录成功的用户，会被写入 adapter 的 User 表吗？

检查点：

1. `jwt`。无 adapter 时 `init` 强制 JSON Web Token（实际是 JWE）。
2. 显式 `session: { strategy: "jwt" }`。有 adapter 时默认改成 `database`。
3. 不会。源码写明 Credentials 用户不持久化到数据库，也因此只能配 JWT session。

## 延伸阅读

- 文档：[authjs.dev](https://authjs.dev)（v5 主站；安装示例写 `next-auth@beta`）
- 固定源码：[nextauthjs/next-auth](https://github.com/nextauthjs/next-auth) —— 本文绑定 `e293b3746616660f0844347a68d09eac54b95c6f`
- [[lucia]] —— 对照：弃用后的单文件 session 样本，不再提供 framework
- [[better-auth]] —— 插件式自托管对照，不在本页绑定范围
- [[prisma]] —— 常见 adapter 实现之一，Edge 兼容性要单独核对该客户端

## 关联

- [[next-js]] —— `next-auth` 的宿主；handlers 走 App Router Route Handler
- [[lucia]] —— utility / 抄代码对照
- [[better-auth]] —— 同期自托管认证框架
- [[prisma]] —— 官方 adapter 生态中最常见的 ORM
- [[zod]] —— Credentials 文档建议用来补输入校验，库本身不做

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[supabase]] —— Supabase — Firebase 的开源替代
- [[supertokens]] —— SuperTokens — 自托管认证框架，把登录方式做成可拼装的 Recipe
