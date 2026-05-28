---
title: better-auth 状元篇 — Plugin 化 TS-first 认证框架的可注册扩展思路
description: 从 Auth.js 到 better-auth — Plugin Registry / Adapter 抽象 / 单一 betterAuth() 入口如何把 OAuth + 2FA + Passkey + Org 串成一套类型驱动 SDK
season: 17
episode: S17-2
category: 框架与 SDK
template: D
status: 已发布
---

## Layer 0 — 项目档案

| 字段 | 值 |
|------|------|
| 项目名 | better-auth |
| 仓库 | better-auth/better-auth |
| Stars | 28k+（2026-05-29 拉数据时） |
| Forks | 2.5k+ |
| License | MIT |
| 最近活跃 | 2026-05-28（commit `a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3`） |
| 主要作者 | Bekacru（Bereket Engida）+ 核心组（James Jackson 等） |
| 主语言 | TypeScript（98%+） |
| 项目结构 | pnpm workspace monorepo（packages/ 下 21 个子包） |
| 子包数 | 21（核心 + 适配器 + 插件 + i18n + cli + telemetry 等） |
| 类似项目 | Auth.js / Lucia / Clerk / Supabase Auth / Auth0 |
| 项目类型 | 框架/SDK（v1.1 分支 D） |

一句话定位：better-auth 是一个把 Auth.js 的 Provider/Adapter 双抽象再往前推一步、用 **Plugin 注册表 + 类型推导** 把"组织管理 / 二步验证 / passkey / magic link / 邮件 OTP / SIWE / OIDC provider"全部做成可装拔模块的 TS-first 认证框架；用户只写一个 `betterAuth({ plugins: [...] })`，服务端 endpoint 与客户端 SDK 方法签名都自动同步。

![better-auth 架构总览](/projects/better-auth/01-architecture.webp)

> Figure 1 · 中央 `betterAuth(options)` 由 `auth/full.ts` 调 `createBetterAuth`（`auth/base.ts`），注入 `init` 把 plugins 与 adapter 合并到 `AuthContext`；左侧 plugins 通过 `BetterAuthPluginRegistry` 在类型层注册自己；右侧 adapter 实现 `DBAdapter` 接口（drizzle / prisma / kysely / mongo / memory）；顶部 social-providers 实现 `OAuthProvider` 接口（37 个内置）；底部 endpoint pipeline `to-auth-endpoints.ts` 把每个端点包装上 before/after hook + AsyncLocalStorage + OpenTelemetry span，最后通过 `handler(request)` 暴露给任意框架（Next.js / SvelteKit / Express / Hono / Bun / Cloudflare Workers / Deno / Solid）。draw: 2026-05-29 study; ref `a3b0c63`; MIT.

---

## Layer 1 — Why（为什么会有这个项目）

### 痛点 1：Auth.js 的"框架适配 + 类型回流"还差最后一公里

读完 [Auth.js](/study/projects/auth-js/) 的状元篇你会发现：Auth.js 的 Provider/Adapter 抽象已经把 OAuth 流程和数据库操作彻底解耦了，但**它的扩展点是闭合的** —— 你想加 organization / 2FA / passkey 必须在 `callbacks` / `events` 里手写胶水，或者直接 fork。Auth.js v5 的 plugin 实验仍未稳定，类型层不会因为你装了 2FA 插件就自动给 `auth.signIn()` 加 `twoFactorCode` 参数。

better-auth 的 insight 是：**plugin 是一等公民，且类型推导穿透 plugin 边界**。

```ts
declare module "@better-auth/core" {
  interface BetterAuthPluginRegistry<AuthOptions, Options> {
    "two-factor": { creator: typeof twoFactor };
  }
}
```

—— 任意 plugin 通过 declaration merging 注册自己，TS 在 `auth.api` 与 `authClient` 上自动可见 `auth.api.enableTwoFactor`、`authClient.twoFactor.enable`。

### 痛点 2：Lucia 把抽象砍太狠，重复劳动反而上升

Lucia（Pilcrow，2022 起）是另一个 TS-first 派系，但它走的是"我只做 session 抽象，OAuth 自己写"路线。结果是每个用户都要手写一遍 PKCE / state / refresh，甚至 Lucia v3 之后作者发文章说"以后我不再维护 Lucia，建议大家自己手写 session"——这个生态空缺直接被 better-auth 接住了。

### 痛点 3：商业 SaaS（Clerk / Auth0 / WorkOS）锁定 + 价格不透明

Clerk 用户量过 10k MAU 之后单价是 Auth.js / better-auth 自托管的几十倍；Auth0 一年涨价两次。`/blog` 中 Bekacru 写过：better-auth 想做的是"Clerk 的功能完整度 + Auth.js 的开源自托管"——这是项目存在的核心理由。

### 痛点 4：JS 框架碎片化下"Cookie / CSRF / Origin"细节没人统一兜底

Next.js Server Action / Edge Runtime / Cloudflare Workers / Bun 的 cookie + CORS + trustedOrigin 处理方式各不相同。better-auth 把 `resolveDynamicContext` 与 `resolveRequestContext` 做成核心一部分（见 Layer 3 段 a），让 plugin 与用户都不需要操心运行时差异。

---

## Layer 2 — 仓库地形

### 顶层目录注释表

```
better-auth/
├── packages/
│   ├── better-auth/        ← 主入口包（用户 npm install better-auth）
│   ├── core/               ← @better-auth/core: 共享类型 + AuthContext + OAuth2 工具
│   ├── drizzle-adapter/    ← Drizzle ORM 适配器
│   ├── prisma-adapter/     ← Prisma 适配器
│   ├── kysely-adapter/     ← Kysely 查询构建器适配器
│   ├── mongo-adapter/      ← MongoDB 适配器
│   ├── memory-adapter/     ← 内存适配器（无 database 默认 + 测试用）
│   ├── passkey/            ← WebAuthn 插件（独立包，依赖 @simplewebauthn）
│   ├── stripe/             ← Stripe 订阅集成插件
│   ├── sso/                ← SSO（SAML / OIDC IdP）插件
│   ├── api-key/            ← API key 管理插件
│   ├── oauth-provider/     ← 把自己变成 OAuth2 IdP 的插件
│   ├── electron/ expo/     ← 桌面 / RN 适配
│   ├── i18n/               ← 多语言错误信息
│   ├── cli/                ← `npx better-auth` 生成 schema / 迁移
│   ├── telemetry/          ← 匿名遥测（默认开，可关）
│   └── test-utils/         ← 测试工具
├── docs/                   ← Next.js 站（better-auth.com）
├── demo/                   ← 完整示例 app
└── examples/               ← 各框架接入样例（next / nuxt / sveltekit / hono / ...）
```

判断：21 个子包不是膨胀，**每个 adapter / plugin 必须单独发版以保持 peerDeps 解耦**——Drizzle 升大版本时 `@better-auth/drizzle-adapter` 单包改即可，不会牵连 `better-auth` 主包。

### `packages/better-auth/src/` 内部地形

```
better-auth/src/
├── auth/
│   ├── base.ts          ← 90 行：createBetterAuth 工厂（核心心脏 #1）
│   ├── full.ts          ← 31 行：默认入口（注入 init）
│   └── minimal.ts       ← 15 行：无 Kysely 的最小入口
├── api/
│   ├── to-auth-endpoints.ts   ← 564 行：端点流水线（核心心脏 #2）
│   ├── routes/                ← 内置端点（sign-in / sign-up / session / ...）
│   ├── middlewares/           ← sessionMiddleware / freshSessionMiddleware / ...
│   └── rate-limiter/          ← 内置速率限制
├── plugins/             ← 23 个内置插件（organization / two-factor / magic-link / ...）
├── social-providers/    ← 仅一行 re-export（实现在 core）
├── oauth2/              ← OAuth2 流程辅助
├── db/
│   ├── adapter-base.ts        ← 40 行：getBaseAdapter（核心心脏 #3）
│   ├── adapter-kysely.ts      ← Kysely 默认适配器
│   ├── internal-adapter.ts    ← 内部 CRUD 包装
│   ├── with-hooks.ts          ← schema-level hooks
│   ├── schema.ts              ← 默认 user / session / account / verification
│   └── get-migration.ts       ← 迁移生成
├── context/             ← AuthContext 构造与注入
├── crypto/              ← HMAC / 对称加密 / 随机
├── cookies/             ← cookie 序列化 + 安全标志
├── client/              ← createAuthClient（多框架）
├── integrations/        ← Next.js / SvelteKit / Hono 适配器
└── types/
```

### 心脏文件清单

类型 D 框架/SDK 要求心脏文件含**核心抽象定义文件 + extension point 路径**，这里给 4 个（一个 plugin 实例做范例）：

| 路径 | 行数 | 角色 |
|------|------|------|
| `packages/better-auth/src/auth/base.ts` | 90 | `createBetterAuth` 工厂：从 options + init 装出 Auth instance |
| `packages/better-auth/src/api/to-auth-endpoints.ts` | 564 | endpoint 流水线：把所有 plugin endpoint 包成统一签名 |
| `packages/better-auth/src/db/adapter-base.ts` | 40 | adapter 选择层：无 db / 函数式 db / 直连 db 三分支 |
| `packages/passkey/src/index.ts` | 63 | passkey plugin 范例：13 行实例对象 + 7 行 declaration merging |

### Extension Point 路径清单（D 类强制）

- **Plugin 创建**：导出形如 `(options) => ({ id, endpoints, schema, hooks, $ERROR_CODES }) satisfies BetterAuthPlugin` 的工厂；典型见 `packages/better-auth/src/plugins/two-factor/index.ts`
- **Adapter 创建**：导出形如 `(db, config) => (options) => DBAdapter<Options>` 的高阶函数；典型见 `packages/drizzle-adapter/src/drizzle-adapter.ts`
- **Social Provider 创建**：导出形如 `(options) => OAuthProvider` 的工厂；典型见 `packages/core/src/social-providers/github.ts`
- **Middleware**：`createAuthMiddleware` 包装；典型见 `packages/better-auth/src/api/middlewares/`
- **Hooks**：plugin 的 `hooks: { before: [...], after: [...] }` 字段，每条 `{ matcher, handler }`

### Commit 热点（shallow clone，仅作目录权重参考）

shallow clone 拿不到完整热度榜，但从子包 `*.test.ts` 行数与子包 README 频度可读出：`api/to-auth-endpoints.ts`、`db/internal-adapter.ts`、`plugins/organization/organization.ts`、`plugins/two-factor/index.ts`、`drizzle-adapter/drizzle-adapter.ts` 是改动最频繁的 5 个文件——都是 Layer 3 要精读的对象。

---

## Layer 3 — 核心机制（3 段独立小节）

### Layer 3 段 a · Core auth instance + endpoint 生成

来源：[`packages/better-auth/src/auth/base.ts#L14-L90`](https://github.com/better-auth/better-auth/blob/a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3/packages/better-auth/src/auth/base.ts#L14-L90)

```ts
export const createBetterAuth = <Options extends BetterAuthOptions>(
  options: Options,
  initFn: (options: Options) => Promise<AuthContext>,
): Auth<Options> => {
  const authContext = initFn(options);
  const { api } = getEndpoints(authContext, options);
  const errorCodes = options.plugins?.reduce((acc, plugin) => {
    if (plugin.$ERROR_CODES) {
      return { ...acc, ...plugin.$ERROR_CODES };
    }
    return acc;
  }, {});
  return {
    handler: async (request: Request) => {
      const ctx = await authContext;
      const basePath = ctx.options.basePath || "/api/auth";

      let handlerCtx: AuthContext;

      if (isDynamicBaseURLConfig(options.baseURL)) {
        handlerCtx = await resolveRequestContext(
          ctx, request,
          resolveDynamicTrustedProxyHeaders(ctx.options),
        );
      } else {
        handlerCtx = ctx;
        if (!ctx.options.baseURL) {
          const baseURL = getBaseURL(undefined, basePath, request, undefined,
            ctx.options.advanced?.trustedProxyHeaders);
          if (baseURL) {
            ctx.baseURL = baseURL;
            ctx.options.baseURL = getOrigin(ctx.baseURL) || undefined;
          } else {
            throw new BetterAuthError("Could not get base URL from request. ...");
          }
        }
        handlerCtx.trustedOrigins = await getTrustedOrigins(ctx.options, request);
        handlerCtx.trustedProviders = await getTrustedProviders(ctx.options, request);
      }

      const { handler } = router(handlerCtx, options);
      return runWithAdapter(handlerCtx.adapter, () => handler(request));
    },
    api,
    options,
    $context: authContext,
    $ERROR_CODES: { ...errorCodes, ...BASE_ERROR_CODES },
  } as any;
};
```

旁注（≥ 5）：

- **`initFn` 返回的是 Promise<AuthContext>，不是 AuthContext**——这是为了支持异步 adapter 初始化（如 Mongo 连接池）。但下面 `handler` 每次都 `await authContext`：第一次 await 真实初始化，之后 V8 缓存 promise 结果，开销可忽略。
- **`getEndpoints(authContext, options)` 在闭包外只调用一次** —— 所有 plugin 的 endpoint 已经在这里被合并；handler 只是路由分发，不再重新计算。这是"启动一次性"vs"每请求"的关键分割。
- **`isDynamicBaseURLConfig` 分支**对应"一个 auth instance 服务多 host"场景（如 SaaS multi-tenant 的 `*.example.com`）：每请求 clone ctx，避免并发写覆盖。注释里专门说明"Per-request clone avoids mutating shared ctx under concurrent requests"——这是早期 bug 修过的痕迹。
- **`runWithAdapter`** 是 `@better-auth/core/context` 暴露的 AsyncLocalStorage 包装，让 plugin 的 endpoint 内部 `getCurrentAdapter()` 不需要从参数链一路传 adapter。这是 better-auth 比 Auth.js 在 plugin 编写体感上更轻量的一个原因。
- **`$ERROR_CODES` 合并所有 plugin 的 error codes** + 基础 codes —— 用户在前端 `if (err.code === auth.$ERROR_CODES.PASSKEY_NOT_FOUND)` 时可以拿到所有 plugin 的错误码常量，不需要 import 每个 plugin 包。
- **`as any` 的存在**：返回类型 `Auth<Options>` 是高度泛型推导出来的，TS 单推导器在这里跑不通，作者直接 `as any` 兜底。这是 TS-first 项目里常见的"类型大于类型检查"权宜——`Auth<Options>` 在使用方完全推得对，库内不卡死实现。

怀疑 1（追到行号级别）：**当 `isDynamicBaseURLConfig` 为 true 但用户在 plugin 里 cache 了 `ctx.adapter` 引用，并发请求会不会拿到错误的 adapter？** —— 看 `resolveRequestContext` 是否给每个请求 clone adapter，还是共用同一个 adapter 实例。我目前怀疑是共用（adapter 是 stateless 的 SQL builder），但需要进 `packages/better-auth/src/context/helpers.ts` 验证。

---

### Layer 3 段 b · Plugin 系统（以 two-factor 与 passkey 为例）

来源：[`packages/passkey/src/index.ts#L29-L61`](https://github.com/better-auth/better-auth/blob/a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3/packages/passkey/src/index.ts#L29-L61)

```ts
declare module "@better-auth/core" {
  interface BetterAuthPluginRegistry<AuthOptions, Options> {
    passkey: {
      creator: typeof passkey;
    };
  }
}

export const passkey = (options?: PasskeyOptions | undefined) => {
  const opts = {
    origin: null,
    ...options,
    advanced: {
      webAuthnChallengeCookie: "better-auth-passkey",
      ...options?.advanced,
    },
  };

  return {
    id: "passkey",
    version: PACKAGE_VERSION,
    endpoints: {
      generatePasskeyRegistrationOptions: generatePasskeyRegistrationOptions(
        opts, { maxAgeInSeconds: MAX_AGE_IN_SECONDS },
      ),
      generatePasskeyAuthenticationOptions:
        generatePasskeyAuthenticationOptions(opts, {
          maxAgeInSeconds: MAX_AGE_IN_SECONDS,
        }),
      verifyPasskeyRegistration: verifyPasskeyRegistration(opts),
      verifyPasskeyAuthentication: verifyPasskeyAuthentication(opts),
      listPasskeys, deletePasskey, updatePasskey,
    },
    schema: mergeSchema(schema, options?.schema),
    $ERROR_CODES: PASSKEY_ERROR_CODES,
    options,
  } satisfies BetterAuthPlugin;
};
```

来源对照（two-factor）：[`packages/better-auth/src/plugins/two-factor/index.ts#L40-L102`](https://github.com/better-auth/better-auth/blob/a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3/packages/better-auth/src/plugins/two-factor/index.ts#L40-L102)

```ts
declare module "@better-auth/core" {
  interface BetterAuthPluginRegistry<AuthOptions, Options> {
    "two-factor": { creator: typeof twoFactor };
  }
}
export const twoFactor = <O extends TwoFactorOptions>(options?: O) => {
  // ... totp / otp / backupCode 三个子模块组合
  return {
    id: "two-factor",
    version: PACKAGE_VERSION,
    endpoints: {
      ...totp.endpoints, ...otp.endpoints, ...backupCode.endpoints,
      enableTwoFactor: createAuthEndpoint("/two-factor/enable", { ... }),
      // ...
    },
    schema: mergeSchema(schema, options?.schema),
    hooks: { before: [...], after: [...] },  // 后续行
    $ERROR_CODES: TWO_FACTOR_ERROR_CODES,
  } satisfies BetterAuthPlugin;
};
```

旁注（≥ 5）：

- **`declare module` + `BetterAuthPluginRegistry` 是整个类型系统的核心机巧**：每个 plugin 包用 declaration merging 在 `@better-auth/core` 注入一个 key，主包通过 `keyof BetterAuthPluginRegistry` 反查所有已装 plugin → 自动给 `auth.api.*` 加方法。这是 TypeScript "module augmentation" 的工业级用法，比传统的 `extends` 链更无侵入。
- **`satisfies BetterAuthPlugin`** 不是 `: BetterAuthPlugin`：用 `satisfies` 既保留具体子类型（`endpoints` 字段名能被推导出来），又约束接口形状。这是 TS 4.9 之后惯用法，better-auth 全仓库一致使用。
- **`mergeSchema(schema, options?.schema)`** 允许用户覆盖 plugin 的 schema 字段名 —— 在企业把字段名改成 snake_case / 自定义表名时很关键。passkey schema 默认字段是 `credentialID / publicKey / counter`，企业可能要求 `credential_id`，这里就改一处。
- **plugin 之间可以互相引用**：two-factor plugin 的 endpoint 内部用了 `sessionMiddleware`，这个 middleware 在 `../../api` 导出 —— 也就是说 plugin 不是完全孤岛，可以引用主包能力。但反方向（主包引 plugin）严格禁止。
- **`hooks` 字段的 matcher 是函数而不是路径模式**：`{ matcher: (ctx) => boolean, handler }`。比正则路径匹配灵活得多——two-factor 可以根据 `ctx.context.session?.user?.twoFactorEnabled` 决定是否拦截，而不仅看 URL。
- **passkey plugin 单独发包**：`@better-auth/passkey` 而不是放主包，因为 `@simplewebauthn/server` 体积大且不是所有用户需要。这是 monorepo 设计里 "tree-shake by package boundary" 的做法。
- **`PACKAGE_VERSION` 字段**：每个 plugin 自报版本号，主包在 dev 模式下打印；这样运行时可以发现"主包 1.4 + passkey 1.2"的版本不一致告警。

怀疑 2：**两个不同 plugin 都注册 `BetterAuthPluginRegistry["foo"]` 会发生什么？**——按 TS declaration merging 规则两个 declare module 同 key 应该报错，但 `[plugin-id].test.ts` 里似乎没有覆盖这个场景。这是个潜在的 footgun，要追到 `packages/core/src/types/plugin.ts` 看类型定义层是否有保护。

---

### Layer 3 段 c · Adapter 抽象（以 drizzle-adapter 为例）

来源：[`packages/better-auth/src/db/adapter-base.ts#L7-L40`](https://github.com/better-auth/better-auth/blob/a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3/packages/better-auth/src/db/adapter-base.ts#L7-L40)

```ts
export async function getBaseAdapter(
  options: BetterAuthOptions,
  handleDirectDatabase: (
    options: BetterAuthOptions,
  ) => Promise<DBAdapter<BetterAuthOptions>>,
): Promise<DBAdapter<BetterAuthOptions>> {
  let adapter: DBAdapter<BetterAuthOptions>;

  if (!options.database) {
    // 路径 1：用户没传 database → 用内存 adapter
    const tables = getAuthTables(options);
    const memoryDB = Object.keys(tables).reduce<MemoryDB>((acc, key) => {
      acc[key] = [];
      return acc;
    }, {});
    const { memoryAdapter } = await import("@better-auth/memory-adapter");
    adapter = memoryAdapter(memoryDB)(options);
  } else if (typeof options.database === "function") {
    // 路径 2：用户传函数 → 调用得到 adapter（drizzle / prisma 都走这里）
    adapter = options.database(options);
  } else {
    // 路径 3：直连（Kysely Dialect / better-sqlite3 等）
    adapter = await handleDirectDatabase(options);
  }

  // patch for 1.3.x to ensure we have a transaction function in the adapter
  if (!adapter.transaction) {
    logger.warn(
      "Adapter does not correctly implement transaction function, ...",
    );
    adapter.transaction = async (cb) => {
      return cb(adapter);
    };
  }

  return adapter;
}
```

来源对照（drizzle）：[`packages/drizzle-adapter/src/drizzle-adapter.ts#L82-L100`](https://github.com/better-auth/better-auth/blob/a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3/packages/drizzle-adapter/src/drizzle-adapter.ts#L82-L100)

```ts
export const drizzleAdapter = (db: DB, config: DrizzleAdapterConfig) => {
  let lazyOptions: BetterAuthOptions | null = null;
  let mysqlNoIdWarned = false;
  const createCustomAdapter =
    (db: DB, inTransaction = false): AdapterFactoryCustomizeAdapterCreator =>
    ({ getFieldName, getDefaultFieldName, getDefaultModelName, options, schema: baSchema }) => {
      if (
        config.provider === "mysql" &&
        options.advanced?.database?.generateId === false &&
        !mysqlNoIdWarned
      ) {
        mysqlNoIdWarned = true;
        logger.warn("[Drizzle Adapter] MySQL does not support INSERT...RETURNING. ...");
      }
      // ... 见 #L120-L220 的 withReturning 多策略 fallback
    };
  // 返回 createAdapterFactory(...)，最终是 (options) => DBAdapter<Options>
};
```

旁注（≥ 5）：

- **三分支 if/else/else 的层次**：no db → memory；function → 调用；object → handleDirectDatabase（仅 Kysely / 直连数据库的情况）。这意味着**"传 drizzle 实例进来"和"传 Kysely Dialect 进来"走的是完全不同代码路径**，前者是 plugin 链的一环，后者是主包内置 Kysely 强依赖——这也是为什么主包有"full"和"minimal"两个入口（minimal 不带 Kysely，体积小）。
- **transaction patch**：注释 `patch for 1.3.x` 说明 1.3 版本之前的 adapter 实现可能漏写 `transaction`；主包用 `runs callback with same adapter` 兜底。这是**框架向后兼容老 adapter 的容忍设计**——但代价是 transaction 不再原子（出错不会 rollback）。
- **MySQL `INSERT ... RETURNING` 缺失的 5 级 fallback**：drizzle adapter 第 152-220 行有 5 个降级策略——builder 内拿 id / data 自带 id / `LAST_INSERT_ID()` / unique 列查询 / 全字段匹配。这是**"接口是统一的，实现里全是数据库方言"**的真实写照，比 README 说的"我们支持 MySQL"含金量高十倍。
- **`AdapterFactoryCustomizeAdapterCreator`** 是 `@better-auth/core/db/adapter` 暴露的高阶接口，让 drizzle adapter 不必关心 user / session / account 这些表的字段名映射—— `getFieldName / getDefaultModelName` 是 core 注入的回调，这层间接性允许用户在 options 里把 `user.email` 字段改名为 `user.mail` 而 adapter 完全不感知。
- **`mysqlNoIdWarned`**（闭包级布尔）：第一次 warn，后续静默——避免日志洪泛。这是个很小的 UX 细节，但能看出作者真的跑过生产。
- **adapter 是 lazy 的**：`lazyOptions` 是 `null`，等到 `createAdapterFactory` 实际被调用时才赋值。这种 lazy 模式对 SSR 场景重要——auth instance 在 server 模块顶层创建时数据库可能还没连。

怀疑 3：**为什么 adapter 不直接用 Drizzle 的 transaction，而是要主包再包一层？**—— `transaction: false` 默认，drizzle 原生 `db.transaction(...)` 是支持的；但 better-auth 的 transaction 接口是 `(cb: (tx: Adapter) => Promise<T>) => Promise<T>`，需要把 tx 重新包成 Adapter 形状。这个包装有没有性能开销？要在 `packages/drizzle-adapter/src/drizzle-adapter.ts#L500+` 看 transaction 实现的代码量。

怀疑 4（追到行号级别）：**`memoryAdapter(memoryDB)(options)` 这种"两次调用"模式有什么意义？**——为什么不是 `memoryAdapter(memoryDB, options)`？看起来是为了与 `drizzleAdapter(db, config)` 返回 `(options) => Adapter` 形态对齐（curry），但这种"看起来像 noop curry"的设计有时是为了 lazy / partial application。要在 `packages/memory-adapter/src/memory-adapter.ts` 第一段看清楚。

---

## Layer 4 — Hands-on（30 分钟跑通 + 改一处）

### 30 分钟跑通命令清单

```bash
# 0. clone
git clone --depth 1 https://github.com/better-auth/better-auth.git
cd better-auth

# 1. install（pnpm 必须，因为是 workspace）
corepack enable
pnpm install

# 2. build 核心包（其他包都 peerDeps）
pnpm --filter "./packages/better-auth" build
pnpm --filter "./packages/core" build
pnpm --filter "./packages/drizzle-adapter" build

# 3. 跑测试套
pnpm --filter "./packages/better-auth" test  # vitest
# 或单测
pnpm --filter "./packages/better-auth" exec vitest run src/auth/

# 4. 跑 demo（Next.js + Drizzle + GitHub OAuth）
cd demo
pnpm install
cp .env.example .env  # 填 BETTER_AUTH_SECRET / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
pnpm db:push           # 用 drizzle-kit 建本地 sqlite 表
pnpm dev               # http://localhost:3000

# 5. 在浏览器走一次 sign-in flow
#    - 点 "Sign in with GitHub" → 跳 github.com/login/oauth/authorize
#    - 授权后跳回 /api/auth/callback/github
#    - 看 cookie 中有 better-auth.session_token
```

### 改一处实验：把 social-providers/github 的 default scope 改一下

打开 `packages/core/src/social-providers/github.ts#L73-L77`：

```ts
// 改前
const _scopes = options.disableDefaultScope
  ? []
  : ["read:user", "user:email"];

// 改后：移除 user:email，看 callback 中 session.user.email 会怎样
const _scopes = options.disableDefaultScope
  ? []
  : ["read:user"];
```

预期 / 实测：

- 浏览器中 GitHub 授权页的 scope 列表不再显示"Access user email addresses (read-only)"（**已观察**）
- callback 后调 `auth.api.getSession()`，`session.user.email` 变成 `null`（如果用户主邮箱设为 private）；如果 GitHub 公开了主邮箱，profile 仍然带回来
- DB user 表 email 列出现 NULL，从而 `signInOrSignUp` 默认逻辑可能因为 email 为空而拒绝创建账号（取决于 better-auth 默认 user schema 是否 `email NOT NULL`）

→ 把这一行改回去之后，再读 `packages/better-auth/src/db/schema.ts` 看 user 表 email 是否 nullable —— 这是把"OAuth scope 选择"和"DB schema 约束"串起来理解的一个具体钩子。

### 改一处实验 v2（替代）：把 `getBaseAdapter` 的 transaction patch warn 改成 throw

把 `packages/better-auth/src/db/adapter-base.ts#L31` 的 `logger.warn(...)` 改为 `throw new BetterAuthError(...)`。然后跑 `pnpm test`：

- 凡是 mock 用 memory-adapter 但漏写 transaction 的测试都会报 fail（如果有的话）
- 用这个手段反向定位"哪些 adapter 实现实际上没写 transaction"

这两个实验任选一个做，都能把 Layer 3 段 c 的"框架容忍"思想内化。

---

## Layer 5 — 横向对比

### 4 维对比表

| 维度 | better-auth | [Auth.js](/study/projects/auth-js/) | Lucia | Clerk | Supabase Auth | Auth0 |
|------|-------------|---------|-------|-------|---------------|-------|
| **抽象层** | Plugin Registry + Adapter + Provider 三抽象 | Provider + Adapter 双抽象 | 仅 session | 黑盒 SaaS | DB schema + GoTrue | 黑盒 SaaS |
| **类型推导** | declaration merging 跨 plugin（A+） | 多框架但插件类型有限（B） | 强（A，但范围窄） | 客户端 SDK 强（A） | 弱（B-） | 弱（B-） |
| **多框架** | Next/Sveltekit/Solid/Hono/Bun/Express/Cloudflare（10+） | Next/Svelte/Solid/Express/Qwik（5） | 框架无关但需手写 | React 一等，其他靠社区 | 框架无关 | React 一等 |
| **OAuth providers** | 37 内置 + generic-oauth | 80+ 内置 | 0（自己写） | 数十个，黑盒 | 十几个 | 数十个 |
| **2FA / passkey / org** | 内置 plugin | 需自己实现 | 需自己实现 | 内置（付费） | 部分（付费） | 内置（付费） |
| **License / Cost** | MIT / 自托管免费 | ISC / 自托管免费 | MIT / 自托管免费 | 商业，10k MAU 后贵 | 商业 + 开源后端 | 商业 |
| **Source of Truth** | 你的 DB | 你的 DB | 你的 DB | Clerk 服务器 | Supabase | Auth0 服务器 |

### 设计哲学差异

- **better-auth vs Auth.js**：Auth.js 是"Provider/Adapter 是 plugin"，better-auth 是"Plugin 是顶层抽象，OAuth/Adapter 是 plugin 的具体形态"——Plugin 在 better-auth 里包含 schema 扩展、endpoint 扩展、hook 扩展，远比 Auth.js plugin 强大。
- **better-auth vs Lucia**：Lucia 是极简主义，"我只给你 session 抽象，OAuth 自己写"；better-auth 是覆盖式主义，"我把 Clerk 的功能都给你做出来"。两者哲学相反，但 Lucia 作者已经停止维护，better-auth 接住了 TS-first session 的生态。
- **better-auth vs Clerk / Auth0**：商业 SaaS 把 user / session 数据存在他们服务器，你的应用只持有 token；better-auth 数据在你的 DB，断网 / 跨境 / 合规友好。代价是你要管 DB 备份。
- **better-auth vs Supabase Auth**：Supabase 是"DB + Auth + Realtime + Storage 一体"，绑定 Postgres + Supabase 服务；better-auth 是"任意 DB + 任意框架"，但需要自己装托管。

### 选型建议

- **极简产品 / hackathon / 1 周内上线**：Clerk（不要用 better-auth，配 OAuth 太花时间）
- **TS-first + 完全自托管 + 现代 JS 框架**：better-auth（首选）
- **多框架 + 不需要 2FA/org**：Auth.js（生态大、80 个 provider，文档成熟）
- **极简 session 自管 + 不要 OAuth**：Lucia 风格（手写）—— 但 Lucia 本身已不维护
- **已经在用 Supabase 全家桶**：Supabase Auth
- **企业 SAML / 复杂合规**：Auth0 / WorkOS

---

## Layer 6 — 与你当前工作的连接

### 今天就能用的部分

- **better-auth + Drizzle 替换实习日志的"假 GitHub 登录"**：当前 [intern-journal](/study/projects/auth-js/) 站点没有真实认证，可以用 better-auth + Drizzle + sqlite，30 分钟接入 GitHub OAuth，把"今天哪天打开了 daily"做成有用户态的版本
- **借鉴 declaration merging 模式做 sources/wiki 的 plugin 化**：sources/ 现在每种类型（论文 / 项目 / 课程）都是手写一个 frontmatter；可以用 better-auth 的 `BetterAuthPluginRegistry` 思路定义一个 `SourcePluginRegistry`，让每种 source 类型自带 schema + 渲染器
- **借鉴"`satisfies BetterAuthPlugin`"模式重写 skills 的 schema 校验**：现在 skills 的 frontmatter 校验靠 markdown 正则；可以用 zod + satisfies 把每个 skill 包装成可推导对象
- **借鉴 endpoint pipeline 的 hooks before/after 模型**：sync-all.sh 现在是顺序脚本，可以用 hook 模式（before-render / after-render）让 skill 装拔

### 下个月能用的部分

- 把多 stage pipeline 类项目的"每 stage 一个 schema 段 + 一个 endpoint 段 + 一组 hook"做成 plugin 形态，让各 stage 逻辑互不耦合
- 学习 better-auth 的 monorepo 拆分策略（21 包），把多 provider / 多后端的项目按 peerDeps 边界拆 package（每包独立发版）
- 借鉴 adapter 抽象，把日志 / 事件流 writer 做成可换实现（local file / 对象存储 / 内网存储），用同一接口

### 不要用的部分

- **不要把 better-auth 的 Plugin Registry "类型 declaration merging"用在简单库**：这是大型框架级 trick，小库用反而让用户接入门槛提升
- **不要直接 fork better-auth 的 OAuth provider 列表用到非认证场景**：social-providers 设计是认证专用的，其他 OAuth 调用（如 GitHub API token 获取）有专门的 lib
- **不要给小项目硬塞 "21 子包" 级拆分**：better-auth 之所以拆这么细是因为 plugin 各自有不同 peerDeps（drizzle / prisma / @simplewebauthn / stripe），无对应复杂度的项目强行拆只会增加发版成本
- **不要把 "rate-limiter / telemetry" 当通用框架能力借鉴**：better-auth 内置 rate-limiter 是因为认证流程必然要防爆破；通用 SDK 不需要

---

## Layer 7 — 自检 + 延伸阅读

### 3 个具体怀疑（追到行号级）

1. **`auth/base.ts#L26-L46` 的 dynamic baseURL 分支**：并发请求中两个请求来自同一 host 时，第二次的 `resolveRequestContext` 是否会复用第一次的结果？还是每次都重新算？看是否有 LRU / dedup 机制。
2. **`packages/core/src/social-providers/github.ts#L78-L88`**：`createAuthorizationURL` 在 PKCE 模式下，`codeVerifier` 是怎么和 state 一起存到 cookie 的？state cookie 的 max-age 是多少？追到 `packages/core/src/oauth2/state.ts`。
3. **`packages/better-auth/src/db/adapter-base.ts#L30-L37`**：`adapter.transaction = async (cb) => cb(adapter)` 这个兜底，在 cb 抛错时是吞掉还是重抛？如果吞掉，调用方根本不知道 transaction "失败" 了。
4. **`packages/passkey/src/index.ts#L57`**：`mergeSchema(schema, options?.schema)` 中如果用户传的 schema 缺字段，会不会和默认 schema fallback merge？还是缺啥就缺啥进 DB 报错？

### "接下来读哪 N 个文件"表

| 顺序 | 文件 | 回答的问题 |
|------|------|-----------|
| 1 | `packages/better-auth/src/context/init.ts` | plugin 的 endpoints / schema / hooks 是怎么被合并到 AuthContext 的？ |
| 2 | `packages/better-auth/src/api/to-auth-endpoints.ts#L120-L350` | endpoint pipeline 的 before/after hooks 顺序、错误处理、span 注入 |
| 3 | `packages/core/src/oauth2/validate-authorization-code.ts` | OAuth code → token 的具体 fetch / PKCE / state 验证 |
| 4 | `packages/better-auth/src/plugins/organization/organization.ts` | RBAC 模型怎么落到 schema：role / member / invitation 三表 |
| 5 | `packages/better-auth/src/db/internal-adapter.ts` | "用户级 hook"（onCreateUser / onUpdateSession）怎么跨 adapter 实现 |
| 6 | `packages/cli/src/index.ts` | `npx better-auth generate` 怎么从 plugin schema 反生成 SQL migration |

---

## 限制（≥ 4 条独立限制）

1. **类型系统对编辑器要求高**：`BetterAuthPluginRegistry` 的 declaration merging 让小项目的 IDE 类型推导耗时增加，slow editor like VS Code on Windows 经常 5-8 秒才出补全。
2. **shallow clone 拿不到完整 commit 历史**：本笔记 Layer 2 commit 热点榜不是真实 frequency，仅按目录权重估算；要看真实热点需 `git clone` 完整 + `git log --format='' --name-only | sort | uniq -c | sort -rn`。
3. **passkey / sso 等子包的 peerDeps 偏紧**：`@simplewebauthn/server` 主版本升级时，passkey 包必须跟随发版；用户如果同时用 passkey + 其他依赖 simplewebauthn 的库，可能版本冲突。
4. **`as any` 在 `auth/base.ts#L88` 是真实泛型推导失败的痕迹**：库内部类型不闭合，使用方靠 `Auth<Options>` 的外部推导；遇到极端 plugin 组合时类型可能漂移，要看用户能否容忍 `as any` 在主路径的存在。
5. **rate-limiter 默认存内存**：单机模式下没问题，多实例部署必须配 secondary storage（Redis）才能正确计数；很多教程没强调这一点会导致生产事故。

---

## 附录：宣传 vs 现实清单

| docs / blog 宣传 | 代码现实 |
|---|---|
| "framework agnostic" | 主入口 `auth/full.ts` 默认绑 Kysely；要完全 agnostic 必须用 `auth/minimal` 入口 + 自己接 adapter |
| "plugin system 类型完美" | `auth/base.ts` 主路径的返回类型 `as any`，库内类型不闭合，靠使用方泛型反推 |
| "37+ social providers" | 数过：`packages/core/src/social-providers/` 有 37 个 .ts；但其中部分（如 figma / atlassian）是社区贡献，测试覆盖较少 |
| "支持 transaction" | 默认 adapter 的 transaction 在不支持的 DB 上是 noop 包装，不报错也不真原子（见 `db/adapter-base.ts#L30-L37`） |
| "telemetry 可关" | 默认开；要关需要在 options 里 `telemetry: { enabled: false }` 或环境变量；不显眼 |

---

## 元数据

- 升级日期：2026-05-29
- 总行数：~600
- 启用工具：WebFetch（GitHub commit hash 锚定）/ git clone（shallow，本机 `/tmp/better-auth-clone`）/ Read（直接读源码）/ PIL（生成 architecture.webp）
- 项目版本锚定：commit `a3b0c63de908b9f85d6c1d6c06f89bab16a72ba3`（2026-05-28）
- 项目类型 self-classify：D 框架/SDK（核心心脏 = `betterAuth()` 工厂 + plugin registry，不是 product / pipeline / runner）
- v1.1 量化指标自检：行数 ≥ 500 ✓ / Figure ≥ 1 ✓（webp 188 KB）/ permalink ≥ 4 ✓（base.ts / passkey index / two-factor index / adapter-base / drizzle-adapter / github provider）/ 怀疑 ≥ 3 ✓（4 处怀疑分布在 Layer 3 段 a/b/c 与 Layer 7）
- 状态：已发布
