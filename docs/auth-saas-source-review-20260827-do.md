# Auth SaaS source review (DO)

> 用途：记录 Clerk、WorkOS 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL DO
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、登录流、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- 云端认证服务本身不可见；正文只绑定开源 SDK 合同

## Clerk

- canonical source：`https://github.com/clerk/javascript`
- revision：`2799f0ddb8590d88fcb15dbd6b7e06c453ecb9d2`
- packages at this commit：
  - `@clerk/nextjs@7.8.2`
  - `@clerk/backend@3.16.12`
  - `@clerk/react@6.14.7`
  - `@clerk/shared@4.30.1`
  - `@clerk/clerk-js@6.30.1`
- provenance：以上五个 annotated tag 均剥到同一提交；npm 未提供 `gitHead`
- monorepo packages/：27 个目录
- inspected：
  - `packages/nextjs/package.json`
  - `packages/backend/package.json`
  - `packages/nextjs/src/server/clerkMiddleware.ts`
  - `packages/nextjs/src/server/protect.ts`
  - `packages/nextjs/src/server/routeMatcher.ts`
  - `packages/nextjs/src/app-router/server/auth.ts`
  - `packages/nextjs/src/app-router/client/ClerkProvider.tsx`
  - `packages/backend/src/tokens/request.ts`
  - `packages/backend/src/tokens/keys.ts`
  - `packages/backend/src/tokens/authObjects.ts`
  - `packages/backend/src/jwt/verifyJwt.ts`
  - `packages/backend/src/constants.ts`
  - `packages/shared/src/telemetry/collector.ts`
  - `packages/nextjs/src/server/__tests__/clerkMiddleware.test.ts`
- observed：
  - `@clerk/nextjs` 是薄适配层，把 Next middleware / App Router `auth()` 接到 `@clerk/backend` 的 `authenticateRequest`；
  - JWT 验签走 Web Crypto `subtle.verify`，默认 clock skew 5s，先验签名再验 claims；
  - 远程 JWKS 缓存按 instance 分桶，避免跨实例 `kid` 串用；
  - `createRouteMatcher` 在固定版本已标 deprecated，引导改为资源位 `auth.protect()`；
  - telemetry 默认 opt-out 开关为关，但 `isEnabled` 只对 development instance 为真；
  - 过期 session 仅在 GET 且存在 refresh cookie 时才尝试 BAPI refresh；
  - Next peer 为 `^15.2.8 || ^16`，Node `>=20.9.0`；BAPI 常量 `https://api.clerk.com` / `v1`。

## WorkOS

- canonical source：`https://github.com/workos/workos-node`
- revision：`203f845fff6fcb904953ad55f799b43fb6e6663e`
- package：`@workos-inc/node@10.11.0`
- provenance：GitHub tag `v10.11.0` 与 npm `gitHead` 一致
- inspected：
  - `package.json`
  - `src/workos.ts`
  - `src/user-management/user-management.ts`
  - `src/user-management/session.ts`
  - `src/sso/sso.ts`
  - `src/webhooks/webhooks.ts`
  - `src/common/net/http-client.ts`
  - `src/common/net/fetch-client.ts`
  - `src/common/crypto/seal.ts`
  - `src/user-management/user-management.spec.ts`
  - `src/user-management/session.spec.ts`
- observed：
  - `WorkOS` 是指向 `api.workos.com` 的 Fetch HTTP 门面，模块包括 User Management、SSO、Directory Sync、Admin Portal、Authorization、Vault 等；
  - 无 API key 但有 `clientId` 时可作为 PKCE 公共客户端；`authenticateWithCode` 按 `codeVerifier` / API key 选择 public 或 confidential；
  - `provider: 'authkit'` 只是 User Management authorize URL 的一个 provider，不是本仓另一套运行时；
  - 可选 `sealSession` 用 inlined `iron-webcrypto` 封 cookie，再用 inlined `jose` + 远程 JWKS 验 access token；封存要求 API key；
  - HTTP 默认最多 3 次重试、60s timeout，状态码 408/429/500/502/503/504，退避 1.5 倍、500ms–8s；
  - 条件 exports 为 Node 与 `workerd` / `edge-light` 选不同入口；`engines.node` 为 `>=22.11.0`。
