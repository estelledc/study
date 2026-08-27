# Auth library source review (writer AF)

> 用途：记录 Auth.js / next-auth 与 Lucia 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL AF
- evidence：GitHub metadata、npm dist-tag、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、OAuth、登录、cookie 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Auth.js / next-auth

- canonical source：`https://github.com/nextauthjs/next-auth`
- revision：`e293b3746616660f0844347a68d09eac54b95c6f`
- package：`next-auth@5.0.0-beta.32`（workspace 内 `@auth/core@0.41.3`）
- inspected：
  - `packages/core/package.json`
  - `packages/next-auth/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/src/lib/index.ts`
  - `packages/core/src/lib/init.ts`
  - `packages/core/src/lib/actions/session.ts`
  - `packages/core/src/adapters.ts`
  - `packages/core/src/jwt.ts`
  - `packages/core/src/providers/credentials.ts`
  - `packages/core/src/providers/index.ts`
  - `packages/next-auth/src/index.ts`
  - `packages/next-auth/src/lib/index.ts`
- observed：
  - `@auth/core` 入口是 `Auth(request, config) => Promise<Response>`，先 `toInternalRequest` / `assertConfig`，再交给 `AuthInternal` 按 action 分发；
  - `next-auth` 薄封装返回 `{ handlers, auth, signIn, signOut, unstable_update }`，handlers 直接调用 `Auth`；
  - 无 adapter 时 session strategy 默认 `jwt`，有 adapter 时默认 `database`；`maxAge` 默认 30 天，`updateAge` 默认 1 天；
  - JWT 默认是 `dir` + `A256CBC-HS512` 的 JWE，不是明文签名 JWT；`callbacks.session` 默认只露出 name/email/image；
  - Adapter 方法全部可选；Credentials 明确限制为 JWT session，且不把用户写入 adapter；
  - POST 的 `signin` / `signout` / `session` 需要 CSRF；credentials 的 callback 也要求已验证 CSRF；
  - npm `next-auth@latest` 仍是 `4.24.15`；`@auth/core@0.41.3` tag `5af7357f...` 是本 revision 的祖先，中间只多一个 core package metadata chore。

## Lucia

- canonical source：`https://github.com/lucia-auth/lucia`
- revision：`e1ef2bc66a070f61813ed03d25c1ba8061c4d9f0`
- package：无 npm 发行物；README 写明 2025-03 弃用，本 revision 只提供单文件替换
- inspected：
  - `README`
  - `code/auth_session.ts`
  - `code/LICENSE`
  - `lucia-auth.com/index.html`
- observed：
  - 仓库不再是 v3 adapter 框架；`v3` 分支仍停在 `fc016ca8...`，但 `main` 已改成学习资源；
  - `code/auth_session.ts` 把会话做成 `id.secret` 不透明 token：32 字节随机 secret、SHA-256 入库、constant-time 比较；
  - 过期按 `tokenLastVerifiedAt` 起算 10 天；距上次验证满 1 小时才写回滑动续期；
  - cookie 建议 Path=/、HttpOnly、Secure、SameSite=Lax；若 token 放 cookie，调用方必须自己做 CSRF（示例检查 `Sec-Fetch-Site`）；
  - `addAuthSessionToDatabase` / `getAuthSessionFromDatabase` / `updateAuthSessionInDatabase` 只是占位，本文件不能当完整可运行模块；
  - 代码文件是 Zero-Clause BSD；仓库其余部分 MIT。本 revision 不含 OAuth、oslo 或 arctic。
