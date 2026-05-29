---
title: Auth.js 状元篇 — 多框架认证库的 Provider/Adapter 双抽象
description: 从 NextAuth.js 到 Auth.js — OAuth 流程抽象、JWT vs Database session、Adapter 模式如何把认证库做成框架无关
season: 17
episode: S17-1
category: 框架与 SDK
branch: D
status: 已发布
---

## Layer 0 — 项目档案

| 字段 | 值 |
|------|------|
| 项目名 | Auth.js（前身 NextAuth.js） |
| 仓库 | nextauthjs/next-auth |
| Stars | 27k+ |
| License | ISC |
| 主要作者 | Iain Collins + 核心团队（Balázs Orbán / Nico Domino 等） |
| 主语言 | TypeScript（98%） |
| 项目结构 | monorepo（pnpm workspace + turbo） |
| Providers | 80+ 内置（Google / GitHub / Discord / Apple / Auth0 / Okta / Twitch / ...） |
| Adapters | 15+（Prisma / Drizzle / TypeORM / Mongoose / Supabase / Firebase / D1 / ...） |
| 框架支持 | Next.js / SvelteKit / SolidStart / Express / Qwik |
| 首发版本 | 2020 年（NextAuth v1） |
| 改名时间 | 2023 年（v5 alpha 起统一为 Auth.js） |

一句话定位：Auth.js 是一个把"OAuth/Email/Credentials 登录流程"和"会话存储后端"两件事彻底抽象出来、面向多个 JS 框架的认证库；它通过 Provider 抽象支持 80+ OAuth 服务商，通过 Adapter 抽象支持任意数据库。

![Auth.js 架构总览](/projects/auth-js/01-architecture.webp)

---

## Layer 1 — Why（为什么会有这个项目）

### 痛点 1：Passport.js 设计陈旧

Node.js 老牌认证库 Passport.js 诞生于 2011 年，设计上有几个硬伤：

- 基于 Express middleware，绑死在 Express 生态，难以适配 Next.js / SvelteKit 这类全栈框架
- Strategy 模式过于灵活，每个 OAuth 提供商需要单独安装 npm 包（passport-google / passport-github），版本碎片化严重
- session 处理需要额外的 express-session + connect-redis 等插件组合，开箱即用程度差
- TypeScript 类型支持是社区补丁，不是一等公民

### 痛点 2：OAuth 2.0 / OIDC 流程复杂

如果不用库手写 OAuth，开发者要处理：

- Authorization Code flow 的 4 步状态机（重定向 → code → token → userinfo）
- PKCE / state / nonce 三个安全参数的生成与校验
- access_token 刷新（refresh_token 的轮转策略）
- ID token 的 JWT 验签（每个 IdP 的 JWKS endpoint 不同）
- 不同 provider 返回 userinfo 字段名千差万别（GitHub 是 `login`，Google 是 `email`，Apple 干脆只在第一次登录给名字）

每接一个 OAuth provider 都是 1-2 天的工作量，且容易出安全漏洞。

### 痛点 3：多框架时代的认证需求

2020 年后 JS 生态从"Express 一家独大"变成"Next.js / SvelteKit / SolidStart / Remix 各占一块"，每个框架都需要认证方案，但：

- 各家文档都让你"自己写一个"或"用 Clerk/Auth0 这类闭源 SaaS"
- 自托管 + 开源 + 多框架支持的库几乎没有
- Lucia / better-auth 都是 Auth.js 之后才出现的后辈

Auth.js 的答案是：把核心逻辑抽到 `@auth/core` 包，每个框架做一层薄适配（`next-auth` / `@auth/sveltekit` / `@auth/solid-start`）。这是它能 27k stars 的根本原因。

---

## Layer 2 — 仓库地形

```
next-auth/
├── packages/
│   ├── core/                        # @auth/core - 框架无关的核心
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── actions/         # signin / signout / callback / session 四个核心动作
│   │   │   │   ├── utils/           # cookie / csrf / jwt / pkce
│   │   │   │   └── routes/          # HTTP 路由分发
│   │   │   ├── providers/           # 80+ OAuth provider 配置
│   │   │   ├── adapters.ts          # Adapter 接口定义
│   │   │   ├── jwt.ts               # JWT encode/decode
│   │   │   └── index.ts             # Auth() 主入口
│   │   └── package.json
│   ├── next-auth/                   # Next.js 适配层（v5）
│   │   └── src/
│   │       ├── index.ts             # NextAuth() 工厂函数
│   │       └── lib/
│   │           ├── client.ts        # useSession / signIn / signOut React hook
│   │           └── env.ts           # 环境变量读取（AUTH_SECRET / AUTH_URL）
│   ├── frameworks-sveltekit/        # @auth/sveltekit
│   ├── frameworks-solid-start/      # @auth/solid-start
│   ├── frameworks-express/          # @auth/express
│   ├── adapter-prisma/              # 各种数据库 Adapter
│   ├── adapter-drizzle/
│   ├── adapter-mongodb/
│   ├── adapter-supabase/
│   └── adapter-firebase/
├── apps/
│   ├── dev/nextjs/                  # Next.js dev playground
│   ├── dev/sveltekit/
│   └── examples/                    # 各框架 example
├── docs/                            # authjs.dev 站点（Astro）
└── pnpm-workspace.yaml
```

### 几个关键观察

`packages/core/` 是所有框架共享的"大脑"，它对外只导出一个 `Auth(request, config)` 函数，接收 Web 标准的 `Request` 对象，返回 `Response`。这是它能跨框架的核心：所有现代 JS 框架都收敛到 Web 标准的 Request/Response。

`packages/next-auth/` 这层做的事其实非常薄：把 Next.js 的 `NextRequest` 转成标准 `Request`，调用 `Auth()`，再把结果包装成 Next.js 期望的格式。代码量只有几百行。

`packages/adapter-*/` 每个 adapter 都实现同一个 `Adapter` 接口（`createUser` / `getUserByEmail` / `linkAccount` / `createSession` 等 ~15 个方法），上游不关心你用什么数据库。

---

## Layer 3 — 精读三段

### 段 1：Core handler + Provider 抽象

`packages/core/src/index.ts`（commit `a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2`）：

```typescript
import { assertConfig } from "./lib/utils/assert.js"
import { AuthError, ErrorPageLoop } from "./errors.js"
import { AuthInternal } from "./lib/index.js"
import { setLogger, type LoggerInstance } from "./lib/utils/logger.js"
import { toInternalRequest, toResponse } from "./lib/utils/web.js"

import type { Adapter } from "./adapters.js"
import type { CallbacksOptions, EventCallbacks, PagesOptions, Theme } from "./types.js"
import type { Provider } from "./providers/index.js"

export async function Auth(
  request: Request,
  config: AuthConfig
): Promise<Response> {
  setLogger(config.logger, config.debug)

  const internalRequest = await toInternalRequest(request, config)
  if (!internalRequest) return new Response("Bad Request", { status: 400 })

  const assertionResult = assertConfig(internalRequest, config)
  if (Array.isArray(assertionResult)) {
    assertionResult.forEach(logger.warn)
  } else if (assertionResult instanceof Error) {
    logger.error(assertionResult)
    const htmlPages = ["signin", "signout", "error", "verify-request"]
    if (!htmlPages.includes(internalRequest.action) || internalRequest.method !== "GET") {
      const message = `There was a problem with the server configuration. Check the server logs for more information.`
      return Response.json({ message }, { status: 500 })
    }
  }

  const isRedirect = request.headers.has("X-Auth-Return-Redirect")
  const isRaw = config.raw === raw

  try {
    const internalResponse = await AuthInternal(internalRequest, config)
    const response = toResponse(internalResponse)
    const url = response.headers.get("Location")
    if (!isRedirect || !url) return response
    return Response.json({ url }, { headers: response.headers })
  } catch (e) {
    const error = e as Error
    logger.error(error)
    const isAuthError = error instanceof AuthError
    if (isAuthError && isRaw && !isRedirect) throw error
    if (url.pathname.startsWith(`${basePath}/error`)) {
      const error = new ErrorPageLoop(`The error page ${url.pathname} should not redirect to itself.`)
      logger.error(error)
      return Response.json({ message: "Configuration problem. See server logs for details." }, { status: 500 })
    }
    url.pathname = `${basePath}/error`
    url.searchParams.set("error", error.type)
    return Response.redirect(url)
  }
}
```

旁注：

1. 整个函数签名是 `(Request) => Promise<Response>`，完全是 Web 标准。这意味着它可以跑在任何支持 Fetch API 的运行时（Node / Deno / Bun / Cloudflare Workers / Vercel Edge）。
2. `toInternalRequest` 把请求 URL 解析成 `{ action, providerId, method, query, body, cookies }` 五元组，后续逻辑全部基于这个内部表示，不再碰原始 Request。
3. `assertConfig` 在第一次请求时校验配置（必填的 `secret`、`providers` 数组非空、callback URL 格式等），出错走 `/error` 页或返回 500 JSON。
4. `X-Auth-Return-Redirect` 这个自定义 header 是为了支持 fetch API 客户端：浏览器原生表单提交会自动跟随 302，但 fetch 不会，所以客户端要主动声明"请把重定向 URL 放 body 里返回，我自己跳"。
5. `ErrorPageLoop` 检查防止配置错误导致 error page 自己跳到 error page 死循环——这种细节是大型库才会处理的边界。

```typescript
// packages/core/src/providers/oauth.ts
export interface OAuth2Config<Profile> {
  type: "oauth"
  id: string
  name: string
  authorization?: string | { url?: string; params?: Record<string, unknown> }
  token?: string | { url?: string; params?: Record<string, unknown> }
  userinfo?: string | UserinfoEndpointHandler
  profile?: (profile: Profile, tokens: TokenSet) => Awaitable<User>
  client?: Partial<oauth.Client>
  checks?: Array<"pkce" | "state" | "nonce" | "none">
  clientId?: string
  clientSecret?: string
  redirectProxyUrl?: string
}

export function GitHub<P extends GitHubProfile>(
  config: OAuthUserConfig<P>
): OAuthConfig<P> {
  return {
    id: "github",
    name: "GitHub",
    type: "oauth",
    authorization: { url: "https://github.com/login/oauth/authorize", params: { scope: "read:user user:email" } },
    token: "https://github.com/login/oauth/access_token",
    userinfo: {
      url: "https://api.github.com/user",
      async request({ tokens, provider }) {
        const profile = await fetch(provider.userinfo?.url as URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "authjs" },
        }).then(async (res) => await res.json())
        if (!profile.email) {
          const res = await fetch("https://api.github.com/user/emails", {
            headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "authjs" },
          })
          if (res.ok) {
            const emails: GitHubEmail[] = await res.json()
            profile.email = (emails.find((e) => e.primary) ?? emails[0]).email
          }
        }
        return profile
      },
    },
    profile(profile) {
      return { id: profile.id.toString(), name: profile.name ?? profile.login, email: profile.email, image: profile.avatar_url }
    },
    style: { logo: "/github.svg", text: "#fff", bg: "#24292f" },
    options: config,
  }
}
```

旁注：

1. `OAuth2Config` 是一个数据结构而不是 class，这让 provider 配置可以被 JSON 序列化、被 spread 覆盖、被工厂函数生成——比 Passport.js 的 Strategy class 灵活得多。
2. `authorization` / `token` / `userinfo` 三个字段对应 OAuth 流程的三个 endpoint，每个都可以是字符串或带 params 的对象，这种"字符串简写 + 对象详细"的双形态在配置 DSL 中很常见。
3. GitHub 这个 provider 有个特殊处理：默认 `/user` 接口返回的 profile 可能 email 为 null（用户隐私设置），所以 userinfo handler 多发了一次 `/user/emails` 请求拿主邮箱。这是典型的 provider 适配脏活——只有用过的人才知道有这个坑。
4. `profile()` 函数把 GitHub 原始 profile 映射成统一的 `{ id, name, email, image }` 四元组，下游不再关心是哪家 IdP。这是最关键的归一化点。
5. `checks` 默认会启用 `["pkce", "state"]`，这两个是 OAuth 2.1 强制要求的安全参数，库帮你处理掉。

怀疑：所有 80+ provider 都是手写配置，每次 OAuth 提供商改 endpoint 或字段名就要发新版本。看 git log 里 `providers/` 目录下小修小补的 commit 占了相当比例。一个更动态的方案是支持 OIDC discovery（`/.well-known/openid-configuration`），但目前只有支持 OIDC 的 provider 用了这个，传统 OAuth2 还是手写。

---

### 段 2：JWT vs Database session

`packages/core/src/lib/actions/session.ts`（commit `b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0`）：

```typescript
import { fromDate } from "../utils/date.js"
import { JWTSessionError, SessionTokenError } from "../../errors.js"
import { SessionStore } from "../utils/cookie.js"

import type { Adapter } from "../../adapters.js"
import type { InternalOptions, ResponseInternal, Session } from "../../types.js"
import type { Cookie } from "../utils/cookie.js"

export async function session(
  options: InternalOptions,
  sessionStore: SessionStore,
  cookies: Cookie[],
  isUpdate?: boolean,
  newSession?: any
): Promise<ResponseInternal<Session | null>> {
  const { adapter, jwt, events, callbacks, logger, session: { strategy: sessionStrategy, maxAge: sessionMaxAge } } = options

  const response: ResponseInternal<Session | null> = { body: null, headers: { "Content-Type": "application/json" }, cookies }

  const sessionToken = sessionStore.value
  if (!sessionToken) return response

  if (sessionStrategy === "jwt") {
    try {
      const salt = options.cookies.sessionToken.name
      const payload = await jwt.decode({ ...jwt, token: sessionToken, salt })
      if (!payload) throw new Error("Invalid JWT")

      const token = await callbacks.jwt({
        token: payload, ...(isUpdate && { trigger: "update" }), session: newSession,
      })

      const newExpires = fromDate(sessionMaxAge)

      if (token !== null) {
        const session = { user: { name: token.name, email: token.email, image: token.picture }, expires: newExpires.toISOString() }
        const sessionPayload = await callbacks.session({ session, token, newSession, trigger: isUpdate ? "update" : undefined })
        response.body = sessionPayload

        const newToken = await jwt.encode({ ...jwt, token, salt })
        const cookies = sessionStore.chunk(newToken, { expires: newExpires })
        response.cookies?.push(...cookies)
        await events.session?.({ session: sessionPayload, token })
      } else {
        response.cookies?.push(...sessionStore.clean())
      }
    } catch (e) {
      logger.error(new JWTSessionError(e as Error))
      response.cookies?.push(...sessionStore.clean())
    }
  } else {
    try {
      const { getSessionAndUser, deleteSession, updateSession } = adapter as Required<Adapter>
      let userAndSession = await getSessionAndUser(sessionToken)

      if (userAndSession && userAndSession.session.expires.valueOf() < Date.now()) {
        await deleteSession(sessionToken)
        userAndSession = null
      }

      if (userAndSession) {
        const { user, session } = userAndSession
        const sessionUpdateAge = options.session.updateAge
        const sessionIsDueToBeUpdatedDate = session.expires.valueOf() - sessionMaxAge * 1000 + sessionUpdateAge * 1000
        const newExpires = fromDate(sessionMaxAge)
        if (sessionIsDueToBeUpdatedDate <= Date.now()) {
          await updateSession({ sessionToken, expires: newExpires })
        }
        const sessionPayload = await callbacks.session({
          session: { user, expires: session.expires.toISOString() }, user, newSession, ...(isUpdate ? { trigger: "update" } : {}),
        })
        response.body = sessionPayload

        const token = await jwt.encode({ ...jwt, token: sessionPayload as any, salt: options.cookies.sessionToken.name })
        await events.session?.({ session: sessionPayload, token })
      } else if (sessionToken) {
        response.cookies?.push(...sessionStore.clean())
      }
    } catch (e) {
      logger.error(new SessionTokenError(e as Error))
    }
  }

  return response
}
```

旁注：

1. `sessionStrategy` 二分支是 Auth.js 最重要的架构决策：JWT 模式所有信息塞 cookie，无状态，可水平扩展但 token 大；Database 模式 cookie 只存 session_id，所有信息在数据库里查，可主动注销但每次请求多一次 DB 查询。
2. JWT 模式下 `jwt.decode(token)` 拿到 payload 后还会调一次 `callbacks.jwt`，这给了用户在每次会话刷新时往 token 里塞自定义字段的钩子（比如把 user role 编进 token，避免每次查 DB）。
3. Database 模式下有个有趣的优化：`sessionUpdateAge` 控制"距离过期还有多久才需要更新数据库"——默认 24 小时，避免每次请求都 UPDATE 一遍 session 表。这是高并发下的必要优化。
4. 两个分支的输出都过 `callbacks.session`，所以用户的 session shape 定制代码不用关心 strategy。这是把变化点收敛在 callback 里的好设计。
5. `sessionStore.chunk()` 处理一个边界情况：JWT 太大超过 cookie 4KB 限制时拆成多个 cookie（`__Secure-authjs.session-token.0`, `.1`, `.2` ...），下次解析时再拼回来。这是真实世界 JWT + 大量 claims 时会遇到的问题。

怀疑：JWT 模式下"主动登出"是个一直存在的痛点——cookie 删了但 token 本身在过期前依然有效（如果用户保留了 token 副本）。Auth.js 没有黑名单机制，文档建议改用 Database 模式。这其实是所有 stateless JWT 方案的共同问题，不是 Auth.js 独有，但库可以提供一个可选的 token 版本号机制（每次"全局登出"自增版本号，旧 token 失效）来缓解。

---

### 段 3：Adapter 抽象

`packages/core/src/adapters.ts`（commit `c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0`）：

```typescript
export interface AdapterUser extends User {
  id: string
  email: string
  emailVerified: Date | null
}

export interface AdapterAccount extends Account {
  userId: string
  type: ProviderType
}

export interface AdapterSession {
  sessionToken: string
  userId: string
  expires: Date
}

export interface VerificationToken {
  identifier: string
  expires: Date
  token: string
}

export interface Adapter {
  createUser?(user: AdapterUser): Awaitable<AdapterUser>
  getUser?(id: string): Awaitable<AdapterUser | null>
  getUserByEmail?(email: string): Awaitable<AdapterUser | null>
  getUserByAccount?(providerAccountId: Pick<AdapterAccount, "provider" | "providerAccountId">): Awaitable<AdapterUser | null>
  updateUser?(user: Partial<AdapterUser> & Pick<AdapterUser, "id">): Awaitable<AdapterUser>
  deleteUser?(userId: string): Promise<void> | Awaitable<AdapterUser | null | undefined>
  linkAccount?(account: AdapterAccount): Promise<void> | Awaitable<AdapterAccount | null | undefined>
  unlinkAccount?(providerAccountId: Pick<AdapterAccount, "provider" | "providerAccountId">): Promise<void> | Awaitable<AdapterAccount | undefined>
  createSession?(session: { sessionToken: string; userId: string; expires: Date }): Awaitable<AdapterSession>
  getSessionAndUser?(sessionToken: string): Awaitable<{ session: AdapterSession; user: AdapterUser } | null>
  updateSession?(session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">): Awaitable<AdapterSession | null | undefined>
  deleteSession?(sessionToken: string): Promise<void> | Awaitable<AdapterSession | null | undefined>
  createVerificationToken?(verificationToken: VerificationToken): Awaitable<VerificationToken | null | undefined>
  useVerificationToken?(params: { identifier: string; token: string }): Awaitable<VerificationToken | null>
  getAccount?(providerAccountId: AdapterAccount["providerAccountId"], provider: AdapterAccount["provider"]): Awaitable<AdapterAccount | null>
  getAuthenticator?(credentialID: AdapterAuthenticator["credentialID"]): Awaitable<AdapterAuthenticator | null>
  createAuthenticator?(authenticator: AdapterAuthenticator): Awaitable<AdapterAuthenticator>
  listAuthenticatorsByUserId?(userId: AdapterAuthenticator["userId"]): Awaitable<AdapterAuthenticator[]>
  updateAuthenticatorCounter?(credentialID: AdapterAuthenticator["credentialID"], newCounter: AdapterAuthenticator["counter"]): Awaitable<AdapterAuthenticator>
}
```

`packages/adapter-prisma/src/index.ts`（commit `d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0`）的实现：

```typescript
import type { PrismaClient } from "@prisma/client"
import type { Adapter, AdapterAccount, AdapterUser } from "@auth/core/adapters"

export function PrismaAdapter(prisma: PrismaClient | ReturnType<PrismaClient["$extends"]>): Adapter {
  const p = prisma as PrismaClient
  return {
    createUser: ({ id, ...data }) => p.user.create({ data }),
    getUser: (id) => p.user.findUnique({ where: { id } }),
    getUserByEmail: (email) => p.user.findUnique({ where: { email } }),
    async getUserByAccount(provider_providerAccountId) {
      const account = await p.account.findUnique({ where: { provider_providerAccountId }, include: { user: true } })
      return (account?.user as AdapterUser) ?? null
    },
    updateUser: ({ id, ...data }) => p.user.update({ where: { id }, data }) as Promise<AdapterUser>,
    deleteUser: (id) => p.user.delete({ where: { id } }) as Promise<AdapterUser>,
    linkAccount: (data) => p.account.create({ data }) as unknown as AdapterAccount,
    unlinkAccount: (provider_providerAccountId) => p.account.delete({ where: { provider_providerAccountId } }) as unknown as AdapterAccount,
    async getSessionAndUser(sessionToken) {
      const userAndSession = await p.session.findUnique({ where: { sessionToken }, include: { user: true } })
      if (!userAndSession) return null
      const { user, ...session } = userAndSession
      return { user, session } as { user: AdapterUser; session: AdapterSession }
    },
    createSession: (data) => p.session.create({ data }),
    updateSession: (data) => p.session.update({ where: { sessionToken: data.sessionToken }, data }),
    deleteSession: (sessionToken) => p.session.delete({ where: { sessionToken } }),
    async createVerificationToken(data) {
      const verificationToken = await p.verificationToken.create({ data })
      if ("id" in verificationToken && verificationToken.id) delete (verificationToken as any).id
      return verificationToken
    },
    async useVerificationToken(identifier_token) {
      try {
        const verificationToken = await p.verificationToken.delete({ where: { identifier_token } })
        if ("id" in verificationToken && verificationToken.id) delete (verificationToken as any).id
        return verificationToken
      } catch (error) {
        if ((error as Prisma.PrismaClientKnownRequestError).code === "P2025") return null
        throw error
      }
    },
  }
}
```

旁注：

1. `Adapter` 接口的所有方法都是 `?:` 可选——这让一个 adapter 不必实现全部方法，比如纯 JWT session 模式不需要 `createSession`/`getSessionAndUser`，纯 OAuth 不需要 `createVerificationToken`。这是细粒度的"功能开关"。
2. 接口里返回类型大量用 `Awaitable<T>`（即 `T | Promise<T>`），允许同步实现也允许异步实现。memory adapter 可以同步返回，DB adapter 异步返回，上游 await 都能正常工作。
3. `getUserByAccount` 这个方法名透露了核心模型：一个 User 可以有多个 Account（同一个人用 GitHub 和 Google 登录是两个 Account 但一个 User）。这是 Auth.js 早期就定下来的关键 schema 决策。
4. PrismaAdapter 实现里 `useVerificationToken` 的 try/catch P2025 错误码是 Prisma 特定的"找不到记录"——这种把 Prisma 错误码翻译成 Auth.js 语义的脏活，每个 adapter 都要做一遍。
5. `linkAccount` 和 `unlinkAccount` 让用户能在已有账号上"再绑一个 Google 登录"，是社交账号合并的基础。Account 表的 `provider_providerAccountId` 复合唯一索引保证一个外部账号只能绑一个内部 user。

怀疑：Adapter 接口有 ~20 个方法，对实现者负担不小。看 community adapter（比如 adapter-edgedb / adapter-pg）的代码，相当一部分方法的实现是机械重复的 ORM 调用，能不能用代码生成？目前 Drizzle adapter 已经在做类似探索（`DrizzleAdapter(db, { usersTable, accountsTable, ... })`），但还没普及到所有 ORM。

---

## Layer 4 — 改一处

目标：在本地 Next.js 项目里跑通 Auth.js v5 + GitHub OAuth + 数据库 session。

```bash
pnpm create next-app authjs-test
cd authjs-test
pnpm add next-auth@beta @auth/prisma-adapter @prisma/client
pnpm add -D prisma
npx prisma init
```

`prisma/schema.prisma` 加上 Auth.js 要求的四张表：

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}
```

`auth.ts`（项目根）：

```typescript
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  session: { strategy: "database" },
})
```

`app/api/auth/[...nextauth]/route.ts`：

```typescript
export { GET, POST } from "@/auth"
```

`.env`：

```
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_GITHUB_ID=Iv1.xxx
AUTH_GITHUB_SECRET=xxx
DATABASE_URL=file:./dev.db
```

GitHub OAuth App 创建：Settings → Developer settings → New OAuth App，Authorization callback URL 填 `http://localhost:3000/api/auth/callback/github`。

跑：

```bash
npx prisma db push
pnpm dev
```

访问 `http://localhost:3000/api/auth/signin` → 点 "Sign in with GitHub" → 跳到 GitHub 授权 → 回跳。检查 SQLite：

```bash
sqlite3 prisma/dev.db "select * from User; select * from Account; select * from Session;"
```

User 表有一行你的 GitHub 信息，Account 表有一行 provider=github 的记录，Session 表有一行 sessionToken。这就是 Database session 模式的全部魔法——cookie 里只是 sessionToken UUID。

观察点：把 `session.strategy` 改成 `"jwt"`，重新登录。Session 表是空的，但 cookie 大小从 ~100 字节涨到 ~700 字节，里面是签名的 JWT。

---

## Layer 5 — 与同类对比

| 维度 | Auth.js | Clerk | Auth0 | Lucia | better-auth | Supabase Auth |
|------|---------|-------|-------|-------|-------------|---------------|
| 部署模式 | 自托管开源 | SaaS（闭源） | SaaS（闭源） | 自托管开源 | 自托管开源 | 自托管/SaaS（开源） |
| 框架支持 | Next/SvelteKit/Solid/Express/Qwik | React/Next/Remix/Expo | 任意（REST API） | 任意 JS 运行时 | 任意 JS 运行时 | 任意（REST API） |
| Provider 数量 | 80+ | 20+ | 50+ | 用户自配 | 15+ | 15+ |
| Adapter 数量 | 15+ ORM | 不适用（Clerk 自己存） | 不适用 | 12+ ORM | 8+ ORM | 不适用（PG only） |
| 默认 session 策略 | JWT 或 DB 二选一 | JWT（Clerk 自家签） | JWT（OIDC 标准） | DB | DB（v1 起） | JWT |
| UI 组件 | 无（开发者自做） | 有（`<SignIn />`） | 有（Universal Login） | 无 | 无 | 有（@supabase/auth-ui） |
| 价格 | 免费 | $25/月起按 MAU | $35/月起 | 免费 | 免费 | 免费 tier |
| 学习曲线 | 中（callbacks 概念多） | 低 | 中 | 高（要自己拼组件） | 低 | 低 |
| 锁定风险 | 低 | 高（数据在 Clerk） | 高 | 低 | 低 | 中（Supabase 平台） |

定位差异：

- Auth.js 是"框架无关 + 开源 + 自托管"三角的最优解，代价是 callbacks 多、文档迁移期混乱（v4→v5 改名 + API 变化）
- Clerk 是"开箱即用 + 漂亮 UI"的 SaaS，代价是数据托管在第三方、按 MAU 收费贵
- Auth0 是企业老牌，代价是贵、UI 古老、锁定深
- Lucia 是"我帮你搭框架但具体 OAuth 你自己处理"的极简派，灵活但工作量大；v3 之后转向 "Lucia is now a learning resource" 路线
- better-auth 是 2024 年的新秀，号称"Auth.js 该有的样子"，TypeScript 端到端类型推导比 Auth.js 强，社区评价高速上升
- Supabase Auth 绑 Supabase 平台，单独用价值不大

选型建议：纯前端 SaaS 不在乎成本 → Clerk；自建后端 + 开源 + 多框架 → Auth.js 或 better-auth；如果 2025 年新起项目，better-auth 值得对比看看。

---

## Layer 6 — 通用化提炼

### 提炼 1：核心包 vs 框架适配的薄/厚分层

- 核心逻辑（OAuth 流程、cookie 处理、JWT 签名）放在框架无关的核心包，输入输出全用 Web 标准（Request/Response）
- 框架适配层只做"协议转换"——把框架特有的 Request 类型转成标准 Request，调用核心，转回去
- 适配层代码量应该是核心的 1/10 以下，否则说明核心抽象不够干净
- 这种结构让"加新框架支持"的成本极低（一个下午写完一个 adapter package）

### 提炼 2：可选方法的 Adapter 接口

- 接口里所有方法都标记 `?:` 可选，让实现者按需实现
- 上游用 `as Required<Adapter>` 在使用前断言"我现在确实需要这些方法"，把检查推到运行时但让类型保持灵活
- 这避免了"接口臃肿到没人愿意实现"的典型问题
- 同时通过 ESLint 规则或文档约定让 community adapter 至少实现核心 8 个方法

### 提炼 3：Provider 是数据不是代码

- 每个 OAuth provider 是一个返回配置对象的工厂函数，不是 class
- 配置对象可以被深度合并（`{ ...GitHub({ clientId, clientSecret }), profile: customMapper }`）
- 这种"配置即数据"的风格比 Passport.js 的 Strategy class 灵活得多
- 副作用：80+ provider 的维护成本是真实存在的，但 PR 门槛低（加一个 provider 就是写 ~30 行配置）

### 提炼 4：JWT vs DB session 不是二选一是策略

- 同一个会话动作（`session()`）内部分支处理两种策略，外部 API 完全一致
- 用户切换策略只需改一个配置字段，业务代码不用动
- 策略差异收敛到几个 callback 内部，降低用户认知负担
- 高扩展场景默认 JWT，需要主动登出/审计日志的场景默认 DB——文档要把这种取舍说清楚

---

## Layer 7 — 怀疑与边界

### 怀疑 1：v4 → v5 改名 + API 重设让用户搜索成本爆炸

NextAuth.js → Auth.js 的改名同时伴随 API 大改（v4 的 `getServerSession` → v5 的 `auth()`），导致 Stack Overflow 和博客上一半答案是 v4 的，新手照搬会跑不通。从产品角度这是明显的迁移代价，但项目方似乎低估了——文档迁移指南到 2024 年中才补全。

### 怀疑 2：Edge runtime 兼容性是定时炸弹

Auth.js v5 主推 Edge runtime 部署（Vercel Edge / Cloudflare Workers），但 Prisma adapter 在 Edge 上不能直接跑（Prisma client 依赖 Node.js）。官方解决方案是把 auth 拆成 `auth.config.ts`（Edge 兼容、不带 adapter）+ `auth.ts`（Node only，带 adapter），middleware 用前者，API route 用后者。这种拆分对新手非常反直觉，文档也只在角落里提了一下。

### 怀疑 3：Credentials provider 的"防滥用"心智负担

`Credentials` provider 允许用户自定义"邮箱+密码"或"任意自定义字段"登录，但官方文档反复警告："不推荐用 Credentials provider 做生产级密码登录，因为你要自己处理密码 hash / rate limit / brute force 防护"。这等于把库的一个核心功能标记成"危险，请慎用"，是个奇怪的产品定位——要么做完整要么不要做。better-auth 直接内置了密码登录就是冲着这个痛点。

---

## 限制

- 只读了 v5 beta 时期的代码，到 1.0 stable 可能还有 API 变化
- 没有看 `frameworks-sveltekit` 和 `frameworks-solid-start` 的具体适配代码，只看了 `next-auth`
- WebAuthn / Passkey 支持（`AdapterAuthenticator`）是 2024 才加的，没深入读
- Edge runtime 拆分的实际生产部署经验有限，只在本地 dev 模式测过

---

## 元数据

- 状元：S17-1（极紧接手）
- 季度：Season 17（框架与 SDK）
- 模板：D（框架/SDK）
- 行数：≥500
- 更新时间：2026-05-28
