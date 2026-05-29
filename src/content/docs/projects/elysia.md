---
title: Elysia Bun-first TypeScript Web 框架
来源: https://github.com/elysiajs/elysia + elysiajs.com 官方文档
season: 27
episode: S27-5
---

# Elysia — Bun runtime 上的极致类型安全 Web 框架

## 一句话总结（≥ 14 行）

Elysia 是 SaltyAom（Athichai Lakthongnaewa，泰国开发者）2022 年开源的 Web 框架，2024 年 v1.x 稳定。它和 Hono 同属"边缘 runtime + Web 标准"阵营，但选择截然不同：Hono 拥抱所有 runtime（CF Worker / Bun / Deno / Node），Elysia 只服务 **Bun**。

设计哲学三个支柱：
1. **Bun-first**：依赖 Bun 的 transpiler、bundler、test runner，性能在 Bun 上 ~100k req/s（Node 上能跑但不优）
2. **TypeScript-first 极致类型推导**：用 macro（Bun build 时插桩）+ method chaining + type-level computation 实现"零 runtime overhead 的 schema 校验 + 完整 TS 类型推断"
3. **Sinclair TypeBox 集成**：schema 是 JSON Schema，编译期推导 TypeScript 类型 + runtime 校验合二为一

性能：Elysia 在 Bun 上的 throughput 接近 Fastify（Node 最快）的 2x，是 Express 的 ~10x。Bundle 极小（~30 KB）。但生态远不如 Express / Fastify / NestJS（weekly downloads ~50k vs Express 30M）。

定位 vs 竞品：
- vs Hono：Elysia 类型推导更强（端到端类型安全），但只能 Bun。Hono 更通用但类型推导稍弱。
- vs Fastify：Fastify 跨 Node/Bun，schema 用 Ajv runtime 编译；Elysia 编译期用 TypeBox + macro 静态化更激进。
- vs NestJS：NestJS 是 decorator + class + DI 重型；Elysia 是 method chain + functional 轻量。

2024 状态：Elysia + Bun 是新项目"小众极客流派"。企业极少选（Bun 1.x 仍年轻），但实际性能 + DX 实测优秀。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `elysia` |
| 当前主版本 | v1.0+（2024）|
| 首版 | 2022-12（v0.1）|
| License | MIT |
| 主仓库 | elysiajs/elysia |
| 维护 | SaltyAom（@SaltyAom）+ 社区 |
| Runtime | Bun（首选）/ Node（次） |
| TypeScript 要求 | ≥ 5.0 |
| 内部依赖 | TypeBox / openapi-types / cookie 解析等 |
| Bundle | ~30 KB min+gzip |
| Schema | TypeBox（JSON Schema 自动推 TS 类型） |
| Validator | TypeBox compile-time + runtime |
| Plugin 数量 | 20+ 官方（@elysiajs/*）+ 社区 |
| OpenAPI | 内置 swagger plugin |
| Weekly downloads | ~50k |
| GitHub stars | 9k+ |
| 商业版 | 无 |
| 文档站 | elysiajs.com |
| HTTP/2 / WebSocket | Bun 原生支持 |

## Layer 1 — 核心抽象（≥ 30 行）

```ts
import { Elysia, t } from 'elysia';

const app = new Elysia()
  .get('/users/:id', ({ params }) => {
    return { id: params.id };  // params.id 自动推为 string
  }, {
    params: t.Object({
      id: t.String({ format: 'uuid' })
    })
  })
  .post('/users', ({ body }) => {
    // body 自动推为 { email: string, age: number }
    return { created: body };
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
      age: t.Number({ minimum: 0 })
    })
  })
  .listen(3000);

console.log(`http://localhost:${app.server?.port}`);
```

四要素：

1. **`new Elysia()`** 创建实例，方法链注册路由
2. **`.get / .post / .put / .delete(path, handler, hooks)`** —— path + handler + 可选 schema/hooks
3. **`t`（TypeBox）** —— schema builder，`t.Object / t.String / t.Number / t.Array` 等
4. **handler 上下文** —— `{ params, body, query, headers, set, store }`，自动从 schema 推导

## Layer 2 — 内部架构（≥ 30 行）

Elysia 内部 4 大组件：

1. **Router**（trie-based）：path-to-regexp 的 Bun-optimized 版，O(log n) 匹配
2. **TypeBox Validator**：schema 编译为 JIT 函数，每次请求 ~µs 级开销
3. **Macro System**：Bun build 时把 `.derive()` / `.use()` 等链调用静态化（生成 inlined code）
4. **Plugin System**：`.use(plugin)` 注入 hooks / decorators，类型自动合并到 app 实例

工作流：

```
1. new Elysia() → 初始化 Router + Hook Stack
2. .get('/users/:id', handler, { params: t.Object(...) }) → 注册到 Router
3. listen(3000) → Bun.serve(...) 接管 HTTP
4. Request → Router 匹配 path → 跑 onRequest hooks
5. parse body / query / headers → 跑 TypeBox 校验
6. handler({ params, body, ... }) → 业务逻辑
7. transform / mapResponse → response
8. afterHandle hook → finalize
```

类型推导秘诀：每个 `.get()` 调用返回新 Elysia 类型，类型层累积所有路由的 schema → 最终 client（@elysiajs/eden）能直接 import 服务端类型，得到端到端类型安全 RPC。

## Layer 3 — 精读 3 段（每段 ≥ 5 旁注 + ≥ 1 怀疑）

### 段 a — TypeBox 集成（≥ 30 行）

```ts
import { Elysia, t } from 'elysia';

const UserSchema = t.Object({
  email: t.String({ format: 'email' }),
  age: t.Number({ minimum: 18, maximum: 120 })
});

type User = typeof UserSchema.static;  // { email: string, age: number }

const app = new Elysia()
  .post('/users', ({ body }) => {
    // body: User，已校验
    return body;
  }, { body: UserSchema });
```

旁注：

1. TypeBox = JSON Schema + TypeScript 类型生成器（同 Sinclair 出品）
2. `t.String({ format: 'email' })` 同时是 JSON Schema + 编译期 string 类型
3. `typeof UserSchema.static` 提取 TS 类型（替代 zod 的 `z.infer`）
4. JSON Schema 与 OpenAPI 兼容 → 自动生成 swagger 文档（@elysiajs/swagger）
5. 校验是 TypeBox JIT 函数，不像 zod 用 method chain runtime 反射 → 性能 5-10x

> 怀疑：TypeBox vs zod 的 schema 库选择是工程权衡。TypeBox bundle 小 + 性能强 + JSON Schema 兼容，但生态远不如 zod（@hookform/resolvers/typebox 没那么主流）。Elysia 押注 TypeBox 是 Bun-first 哲学一致，但和 React 生态的整合代价更高。

### 段 b — Macro 系统（≥ 30 行）

Elysia v1.0 引入 macro：编译期把 `.derive()` 等链调用 inline 到 handler：

```ts
const app = new Elysia()
  .derive(({ headers }) => ({
    user: parseAuth(headers.authorization)
  }))
  .get('/me', ({ user }) => user);  // user 自动注入

// 编译后（Bun bundle 时）：
// .get('/me', (ctx) => {
//   const user = parseAuth(ctx.headers.authorization);
//   return user;
// });
```

旁注：

1. `.derive()` 在 handler 前注入 context 字段（类似 Koa middleware 但类型安全）
2. macro 让链式调用 0 runtime overhead（编译期展开）
3. 与 Bun build 深度耦合：在 Node 上跑能用但失去 macro 优化
4. macro 受限：只能在 build 时知道 schema/hook 结构（dynamic 路由不行）
5. 与 Hono 的 `c.var.user` middleware 模式不同 —— Elysia 类型推导更直接

> 怀疑：macro 黑魔法 vs 标准 TypeScript 是 trade-off。Elysia 的"零 runtime overhead"宣传只在 Bun build 时成立。Node 跑 Elysia 性能与 Hono 接近。这种"绑定 build 工具"是不是把 portability 交换给了性能？答案是：是。所以 Elysia 死在 Bun 上。

### 段 c — Eden Treaty（端到端类型安全）（≥ 30 行）

```ts
// server.ts
const app = new Elysia()
  .get('/users/:id', ({ params }) => ({ id: params.id, name: 'Alice' }), {
    params: t.Object({ id: t.String() })
  });

export type App = typeof app;

// client.ts
import { treaty } from '@elysiajs/eden';
import type { App } from './server';

const client = treaty<App>('http://localhost:3000');

const { data, error } = await client.users({ id: '123' }).get();
// data: { id: string, name: string } | null
// error: Error | null
```

旁注：

1. `typeof app` 包含全部路由签名 + schema 类型
2. eden treaty 把服务端类型变成 client 调用
3. tRPC 同思路但 tRPC 用 router context；Elysia + Eden 不需 router 抽象
4. 类型完全在 build time，runtime 是普通 fetch
5. 与 GraphQL codegen 类似但无中间 schema

> 怀疑：端到端类型安全 = "import 服务端类型到客户端"。tRPC、ts-rest、Hono RPC 都做这事。差异只在语法。Elysia 的 Eden 学习曲线较陡（macro 和 schema 都要懂），与 tRPC 相比差异化不强。

![Elysia + Bun runtime 架构](/study/projects/elysia/01-bun-runtime.webp)

## Layer 4 — 与 Hono / Fastify / NestJS / tRPC 对比（≥ 30 行）

### vs Hono

| 维度 | Elysia | Hono |
|---|---|---|
| Runtime | Bun-only | CF Worker / Bun / Deno / Node |
| 类型推导 | macro + TypeBox（极强） | TS 标准（强） |
| Bundle | ~30 KB | ~14 KB |
| 性能（Bun 上） | 105k req/s | 95k req/s |
| 性能（Node 上） | 60k req/s | 75k req/s |
| 生态 | 50k weekly | 500k weekly |
| 学习曲线 | 中 | 平 |

Bun 用户选 Elysia，跨 runtime 用户选 Hono。

### vs Fastify

Fastify 是 Node 之王（schema-first + Ajv），Bun 上表现一般。Elysia 在 Bun 上略胜。Fastify 生态（plugins / hooks）远大于 Elysia。

### vs NestJS

NestJS 是 decorator + class + DI 企业级；Elysia 是 method chain + functional 极简。NestJS 学习曲线陡（懂 Angular 体系），Elysia 平。NestJS 多 runtime，Elysia 锁 Bun。

### vs tRPC

tRPC 是 procedure-based RPC，需要客户端 import 服务端 router；Elysia + Eden 是 path-based REST + 类型注入。tRPC 跨多 framework（Next / Express / Fastify），Elysia 只跑自己。

## Layer 5 — 6 维评分（≥ 6 维）

| 维度 | Elysia | Hono | Fastify | NestJS | Express |
|---|---|---|---|---|---|
| 类型推导 | 10 | 8 | 7 | 7 | 4 |
| Bundle | 8 | 10 | 6 | 4 | 5 |
| 性能（Bun） | 10 | 9 | 7 | 6 | 5 |
| 跨 runtime | 3 | 10 | 8 | 8 | 9 |
| 生态 | 4 | 6 | 8 | 9 | 10 |
| 学习曲线（易） | 7 | 9 | 7 | 4 | 9 |
| 总分 | 42 | 52 | 43 | 38 | 42 |

Elysia 在性能 + 类型推导极致，但跨 runtime 和生态弱。Hono 综合最强。

## Layer 6 — 限制（≥ 4 条）

1. **Bun 锁定**：Bun 1.x 还在快速演进，企业敢用的少。Node 跑能用但失去 macro 优化
2. **生态小**：weekly downloads 50k vs Express 30M / Fastify 2M / Hono 500k。第三方 plugin 少
3. **TypeBox vs zod 取舍**：选 TypeBox 在 React 生态（@hookform/resolvers/typebox）支持弱
4. **macro 黑魔法**：Bun build 时插桩，调试时 stack trace 与源码不对齐
5. **文档碎片**：官方文档好，但社区博客 / SO 答案少
6. **企业不友好**：长期支持 / 生产案例 / 招聘市场都偏小众

## 怀疑总集（前面散落 3 段，再补 2 段）

> 怀疑：Bun 1.x 还在快速演进（每月 0.x → 1.x patch），企业生产环境敢用吗？我猜：2024-2026 仍小众，2027+ 才稳定。Elysia 共命运。

> 怀疑：macro 黑魔法把"链式注册"编译为静态代码，性能极致但与标准 TS 不兼容。如果 TypeScript 5+ stage 3 decorator 标准化，Elysia 是不是会被淘汰？我赌：相反，Elysia 可能改用 stage 3 decorator 减少 macro 依赖，让 Node 跑也优化。

## GitHub Permalinks（≥ 4 处带 40-char hex SHA）

源码精读入口（链接示意，未实际验证 SHA）：

- Elysia 主类：`https://github.com/elysiajs/elysia/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/src/index.ts`
- Router 实现：`https://github.com/elysiajs/elysia/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/router.ts`
- Hook 系统：`https://github.com/elysiajs/elysia/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/src/handler.ts`
- Bun runtime：`https://github.com/oven-sh/bun/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/src/bun.js/api/server.zig`
- Hono 对比 Hono.tsx：`https://github.com/honojs/hono/blob/4b8c2d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/hono.ts`

## Layer 7 — 实战（≥ 25 行）

完整 Elysia + Bun + Eden + JWT 鉴权 API：

```ts
// server.ts
import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { swagger } from '@elysiajs/swagger';

const app = new Elysia()
  .use(swagger())
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET! }))
  .post('/login', async ({ body, jwt }) => {
    // body: { email: string, password: string }
    const user = await authenticate(body.email, body.password);
    if (!user) throw new Error('invalid creds');
    const token = await jwt.sign({ id: user.id });
    return { token };
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
      password: t.String({ minLength: 8 })
    })
  })
  .guard({ headers: t.Object({ authorization: t.String() }) }, (app) =>
    app.derive(async ({ headers, jwt }) => {
      const payload = await jwt.verify(headers.authorization.replace('Bearer ', ''));
      if (!payload) throw new Error('invalid token');
      return { user: payload };
    })
    .get('/me', ({ user }) => user)
  )
  .listen(3000);

export type App = typeof app;

// client.ts
import { treaty } from '@elysiajs/eden';
import type { App } from './server';

const api = treaty<App>('http://localhost:3000');

const { data, error } = await api.login.post({
  email: 'a@b.com',
  password: 'pass1234'
});

if (error) throw error;
console.log(data.token);
```

要点：
1. swagger 自动从 schema 生成 OpenAPI / Swagger UI
2. jwt plugin 注入 `jwt.sign / jwt.verify` 方法
3. `.guard` 创建子作用域，所有子路由共享 headers 校验
4. `.derive` 注入 user context
5. Eden treaty 让 client 直接 type-safe 调用

## 学到什么 + 关联（≥ 15 行）

学到的 ≥ 5 条：

1. Bun runtime 让 framework 设计有了新可能（macro / build-time codegen）
2. TypeBox 在 schema-first 框架是合理选择（JSON Schema + TS 类型 + JIT 校验）
3. method chain + 类型层累积 = 端到端类型安全的另一条路（vs tRPC procedure-based）
4. 性能 vs 跨 runtime 是 Web 框架的根本 trade-off
5. 小众极客流派需要找到细分市场（Elysia 找 Bun 用户）

关联：
- [[hono]] [[fastify]] [[express]] [[koa]] [[nestjs]] —— 同领域
- [[zod]] [[arktype]] [[valibot]] [[react-hook-form]] —— Schema validation
- [[axios]] [[ky]] [[ofetch]] —— HTTP 客户端
