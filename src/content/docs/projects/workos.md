---
title: WorkOS — 企业 SSO 与用户管理共用一个 Node SDK 的认证 SaaS
description: 官方 Node SDK，把 User Management、SSO、Directory Sync 等 WorkOS API 收成一个 Fetch 客户端。
来源: https://github.com/workos/workos-node
日期: 2026-08-27
分类: 认证
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/workos/workos-node
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 203f845fff6fcb904953ad55f799b43fb6e6663e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.11.0
---

## 是什么

WorkOS Node SDK 是一个**指向 `api.workos.com` 的官方 HTTP 客户端**。日常类比：前台只负责打电话和把回条锁进抽屉，真正的人事档案在另一栋楼。

固定 10.11.0 的 `WorkOS` 类按模块挂 API：User Management、SSO、Directory Sync、Admin Portal、Authorization、Vault、Radar、Webhooks 等。登录页、密码哈希和组织目录不在这个仓库。

你写：

```ts
import { WorkOS } from "@workos-inc/node";

const workos = new WorkOS(process.env.WORKOS_API_KEY, {
  clientId: process.env.WORKOS_CLIENT_ID,
});

const url = workos.userManagement.getAuthorizationUrl({
  provider: "authkit",
  redirectUri: "http://localhost:3000/callback",
});
```

`provider: "authkit"` 只是 authorize URL 上的一个 provider 值，不是本仓另一套运行时。

## 为什么重要

不理解这个 SDK 的门面边界，下面这些事都没法解释：

- 为什么同一条 `new WorkOS()` 既能做企业 SSO，又能做 AuthKit 用户登录
- 为什么可以不传 API key，只传 `clientId` 走 PKCE
- 为什么 `sealSession: true` 在公共客户端会失败
- 为什么 cookie 里的 access token 还要再用 JWKS 验一次

## 核心要点

固定 10.11.0 的主链可以拆成五步：

1. **构造门面**：字符串 API key 或 `{ apiKey, clientId }`。缺 key 时读 `WORKOS_API_KEY` / `WORKOS_CLIENT_ID`。两者都缺会抛错。有 `clientId` 无 key 时可作为 PKCE 公共客户端。

2. **Fetch HTTP**：`FetchHttpClient` 默认 timeout 60s、最多 3 次重试；重试状态码 408/429/500/502/503/504；退避 1.5 倍，睡眠 500ms–8s。401/404/409/422/429 被映射成类型化异常。

3. **User Management**：`getAuthorizationUrl` 要求 `provider` / `connectionId` / `organizationId` 三选一。`authenticateWithCode` 按是否带 `codeVerifier` 与 API key 选择 public、confidential 或两者叠加。

4. **可选封存 session**：`sealSession` 用 inlined `iron-webcrypto` 封 cookie（seal 版本后缀 `~2`，ttl 0），再用 inlined `jose` + 远程 JWKS 验 access token。封存要求 API key。

5. **SSO 仍是独立模块**：`sso.getAuthorizationUrl` 走企业连接，不是 User Management 的 `provider: "authkit"`。Directory Sync、Admin Portal、Authorization、Vault 同样只是 HTTP 封装。

## 实践示例

### 案例 1：AuthKit 授权码换 token

```ts
const url = workos.userManagement.getAuthorizationUrl({
  provider: "authkit",
  redirectUri: "http://localhost:3000/callback",
  screenHint: "sign-in",
});

const { user, accessToken, refreshToken } =
  await workos.userManagement.authenticateWithCode({
    code,
    session: {
      sealSession: true,
      cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
    },
  });
```

`screenHint` 只允许 `provider === "authkit"`。`sealSession` 需要 API key；公共客户端应改走 `codeVerifier`，不要封 cookie。

### 案例 2：读已封存的 session cookie

```ts
const session = workos.userManagement.loadSealedSession({
  sessionData: cookie,
  cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
});
const result = await session.authenticate();
```

`authenticate()` 先 `unsealData`，再 `jwtVerify`。jose 的 `ERR_JWT_*` / `ERR_JWS_*` 变成 `authenticated: false`；网络或加密基础设施错误会抛出，不能当成“用户没登录”。

### 案例 3：企业 SSO 连接

```ts
const ssoUrl = workos.sso.getAuthorizationUrl({
  connection: "conn_01...",
  clientId: process.env.WORKOS_CLIENT_ID,
  redirectUri: "http://localhost:3000/sso/callback",
});
```

这是 `/sso/authorize` 那条企业 SSO 线。固定源码把 `clientId` 从 options 写入 query，不会自动回落到构造函数上的 `clientId`。

## 踩过的坑

1. **把 AuthKit 当成这个仓库里的 UI 运行时**：本仓只有 authorize URL 的 `provider` 字段。
2. **公共客户端请求 `sealSession`**：测试写明封存需要 API key。
3. **空字符串 `codeVerifier`**：固定实现会抛 `TypeError`，不会悄悄退回 client_secret。
4. **把 refresh 失败一律当成登出**：`CookieSession.refresh` 区分不可重试的终端失败和可重试的瞬时失败。
5. **把 SDK 默认重试当成幂等保证**：POST `/user_management/authenticate` 也会按 429/5xx 重试，调用方要自己证明副作用可接受。

## 适用 vs 不适用场景

**适用**：

- 先接企业 SSO / Directory Sync，再按需加 User Management
- Node >= 22.11.0，或 `workerd` / `edge-light` 条件入口
- 需要自己持有封存 cookie，而不是把 session 完全交给托管 UI

**不适用**：

- 想要域名内 prebuilt `<SignIn />` 且接受用户表锁在厂商云 → [[clerk]]
- 用户表必须在自己的 Postgres → [[better-auth]] / [[lucia]] / [[auth-js]]
- 运行时低于 Node 22.11.0，又没有 worker 入口
- 需要从本仓读到密码哈希、SAML 解析或目录供应商协议细节

## 固定版本边界

- 本文绑定 `workos/workos-node@203f845f...`，tag 与 npm `@workos-inc/node@10.11.0` 的 `gitHead` 一致。
- `iron-webcrypto` 与 `jose` 被标为 `inlinedDependencies`，不出现在 runtime `dependencies`。
- HTTP 默认 3 次重试、60s timeout；cookie seal 的 ttl 为 0。
- 本文未安装依赖、调用 WorkOS API、跑上游测试或测量包体，状态保持 `UNVERIFIED`。

## 学到什么

1. **模块门面可以共用一个 HTTP 内核**：SSO 与 User Management 的产品边界在路径，不在第二套客户端。
2. **公共客户端和封存 cookie 互斥**：没有 API key 就能 PKCE，但不能 `sealSession`。
3. **密封 cookie ≠ 已验证身份**：还要 JWKS 验 access token；基础设施错误不能吞成未登录。
4. **默认重试是传输策略**：认证 POST 不会因为“这是登录”就关掉重试。

## 应用型自测

1. `new WorkOS({ clientId })` 不传 API key，能否调用 `getAuthorizationUrlWithPKCE`？
2. 同一调用再加 `session: { sealSession: true, cookiePassword }`，固定测试期望什么？
3. `getAuthorizationUrl({ screenHint: "sign-in", provider: "GoogleOAuth" })` 会怎样？

检查点：

1. 能。公共客户端只需要 `clientId`。
2. 抛错：封存要求 server-side API key。
3. 抛 `TypeError`：`screenHint` 只支持 `authkit`。

## 延伸阅读

- 固定源码：[workos/workos-node](https://github.com/workos/workos-node) —— 本文绑定提交 `203f845fff6fcb904953ad55f799b43fb6e6663e`
- 门面：[workos.ts](https://github.com/workos/workos-node/blob/203f845fff6fcb904953ad55f799b43fb6e6663e/src/workos.ts)
- session：[session.ts](https://github.com/workos/workos-node/blob/203f845fff6fcb904953ad55f799b43fb6e6663e/src/user-management/session.ts)
- [[clerk]] —— hosted 用户+UI 的对照
- [[auth-js]] —— 自托管 OAuth/session
- [[better-auth]] —— 自托管 plugin-first

## 关联

- [[clerk]] —— 同为认证 SaaS；Clerk SDK 更厚、UI 在包内
- [[auth-js]] —— OSS 对照
- [[better-auth]] —— 自托管对照
- [[lucia]] —— utility 派对照
- [[next-js]] —— AuthKit / SSO 回调的常见宿主
- [[supabase]] —— 另一条托管身份路线，和 RLS 绑得更紧

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
