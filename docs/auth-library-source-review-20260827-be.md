# Auth library source review (writer BE)

> 用途：记录 better-auth 与 SuperTokens Core 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL BE
- target：passport + better-auth；仓库无 `passport` 项目页，且 `auth-js` / `lucia` 已被开放 PR #72 占用
- fallback：`better-auth` + `supertokens`（其余认证双子，排除 next-auth / Lucia）
- evidence：GitHub metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、OAuth、登录、cookie、Docker 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## better-auth

- canonical source：`https://github.com/better-auth/better-auth`
- revision：`ba12fcdfa774ca27d417079dbac0b1b5894ccaf2`
- package：`better-auth@1.7.2`（workspace 内 `@better-auth/core@1.7.2`、`@better-auth/passkey@1.7.2`）
- inspected：
  - `package.json`
  - `packages/better-auth/package.json`
  - `packages/core/package.json`
  - `packages/passkey/package.json`
  - `packages/better-auth/src/index.ts`
  - `packages/better-auth/src/auth/full.ts`
  - `packages/better-auth/src/auth/base.ts`
  - `packages/better-auth/src/api/index.ts`
  - `packages/better-auth/src/api/routes/sign-in.ts`
  - `packages/better-auth/src/api/routes/sign-up.ts`
  - `packages/better-auth/src/cookies/index.ts`
  - `packages/better-auth/src/integrations/next-js.ts`
  - `packages/better-auth/src/adapters/drizzle-adapter/index.ts`
  - `packages/better-auth/src/plugins/organization/organization.ts`
  - `packages/better-auth/src/plugins/organization/schema.ts`
  - `packages/core/src/types/plugin.ts`
  - `packages/core/src/types/context.ts`
  - `packages/core/src/types/init-options.ts`
  - `packages/core/src/db/adapter/index.ts`
  - `packages/drizzle-adapter/src/drizzle-adapter.ts`
- observed：
  - 默认入口 `betterAuth()` 走 `auth/full.ts`，内部 `createBetterAuth` + `init`；`handler` / `fetch` 都吃标准 `Request`；
  - `basePath` 默认 `/api/auth`；邮箱密码默认 `enabled: false`，路由仍注册，未开启时 `sign-in/email` 抛 `EMAIL_PASSWORD_DISABLED`；
  - plugin 用 `declare module "@better-auth/core"` 给 `BetterAuthPluginRegistry` 加 key；运行时 `getEndpoints` 把 `plugin.endpoints` reduce 进同一 router，后注册覆盖同名 key；
  - 路径冲突由 `checkEndpointConflicts` 打 error log，不在类型层硬失败；
  - `DBAdapter` 暴露 create / findOne / findMany / count / update / updateMany / delete / deleteMany / consumeOne 等，另有 `incrementOne` 与可选 transaction；
  - Drizzle 公开入口是 `better-auth/adapters/drizzle`，也再导出 `@better-auth/drizzle-adapter`；MySQL 无 `INSERT/UPDATE/DELETE ... RETURNING`，adapter 走 best-effort fallback；
  - session `expiresIn` 默认 7 天，`updateAge` 默认 1 天；cookie 默认 `httpOnly` + `sameSite: "lax"`；`cookieCache` 默认关，开启后 `maxAge` 默认 300 秒；
  - `nextCookies()` 是 after hook：把 `Set-Cookie` 抄进 `next/headers` 的 `cookies()`；RSC 且非 Server Action 时跳过 session refresh；
  - `organization` plugin 默认 schema 含 organization / member / invitation，并给 session 加 `activeOrganizationId`；team 表只在 `teams.enabled` 时出现。

## SuperTokens Core

- canonical source：`https://github.com/supertokens/supertokens-core`
- revision：`3547e8550580fcc78dceb6641dc735fbfae3ecf8`
- package：`supertokens-core@12.1.1`（Gradle `version = "12.1.1"`，Java toolchain 21）
- inspected：
  - `build.gradle`
  - `config.yaml`
  - `LICENSE.md`
  - `ee/LICENSE.md`
  - `README.md`
  - `src/main/java/io/supertokens/webserver/Webserver.java`
  - `src/main/java/io/supertokens/webserver/WebserverAPI.java`
  - `src/main/java/io/supertokens/webserver/api/core/HelloAPI.java`
  - `src/main/java/io/supertokens/webserver/api/emailpassword/SignInAPI.java`
  - `src/main/java/io/supertokens/webserver/api/emailpassword/GeneratePasswordResetTokenAPI.java`
  - `src/main/java/io/supertokens/emailpassword/EmailPassword.java`
  - `src/main/java/io/supertokens/session/Session.java`
  - `src/main/java/io/supertokens/session/accessToken/AccessToken.java`
  - `src/main/java/io/supertokens/session/refreshToken/RefreshToken.java`
  - `src/main/java/io/supertokens/webserver/api/session/RefreshSessionAPI.java`
- observed：
  - 本页只绑定 Core HTTP 服务，不绑定 Node / React SDK；README 把架构拆成 Frontend SDK、Backend SDK 与 Core；
  - 嵌入 Tomcat，默认 host `localhost`、port `3567`；access token 默认 3600 秒，refresh token 默认 144000 分钟，rotation grace 默认 30 秒；
  - `/hello` 不要求 API key 或 `cdi-version`；会探测 storage，限流时生产路径仍回 `Hello`；
  - 各 recipe API 在 `WebserverAPI` 构造时写入 `rid`，请求头是 `rId`；EmailPassword 登录路径是 `POST /recipe/signin`；
  - `EmailPassword.signUp` / `generatePasswordResetToken` 只哈希、入库、发 token，core 源码不见 SMTP / SMS 发送；
  - access token payload 带 `refreshTokenHash1` 与 `parentRefreshTokenHash1`；refresh 时当前 hash 命中则发子代，parent 命中则 promote，否则 `TokenTheftDetectedException`；
  - CDI >= 5.6 增加 reuse subtype（`RECENT_PREV` / `ORPHANED_BRANCH` / `STALE_LINEAGE`）；`recent_token_reuse_behaviour` 只改报告形态，注释写明 session 仍会撤销；
  - `ee/` 使用 SuperTokens Enterprise license，其余 Apache 2.0。
