---
title: "tRPC — 协议消失：函数即 API"
description: 把 client.posts.byId.query(123) 看起来像本地函数调用——背后是一个递归 Proxy + 一份共享类型
sidebar:
  order: 18
  label: "trpc/trpc"
---

> @trpc/server v11.17.0（2026-05），MIT。
>
> tRPC 不是 GraphQL 的替代品，也不是 REST 的下一代——它是
> **"前后端用同一份代码"这个假设成立后，HTTP 协议这一层就该消失**
> 这个判断的产物。
>
> 你写 `client.posts.byId.query(123)`，看起来像调用本地函数——
> 实际上是个递归 Proxy 把 `posts.byId` 拼成 path、把 `123` 序列化、
> 通过 HTTP 发出去、由 server 上同名 procedure 处理、返回值类型从
> server 类型流过来。**全程没有一行手写的 fetch / 类型定义**。
>
> 这是 Season 2「类型当设计工具」收尾。

## 一句话定位

**tRPC = 一个 server 端的 router builder + 一个 client 端的递归 Proxy + 一根共享的 TS 类型管道。**
你 export 一个 router 实例的类型 `type AppRouter = typeof appRouter`，
client 通过 `createTRPCProxyClient<AppRouter>()` 拿到完全类型安全的客户端——
**完全不需要 OpenAPI / GraphQL / proto 文件**。

## Why（为什么是它而不是 GraphQL / REST / gRPC-web / Server Actions）

主流方案的痛点：

```typescript
// REST + 手写类型
type GetPostResponse = { id: number, title: string }
const post: GetPostResponse = await fetch(`/api/posts/${id}`).then(r => r.json())
// ↑ 类型是手写的，server 改返回值不会同步

// REST + OpenAPI codegen（swagger / openapi-typescript）
const { data } = await client.GET('/api/posts/{id}', { params: { path: { id } } })
// ↑ 类型对了，但要部署 OpenAPI spec + 跑 codegen + 改 server 后要重新生成

// GraphQL + codegen
const { data } = useQuery(GET_POST, { variables: { id } })
// ↑ 强大但学习曲线陡，server 端 schema、client 端 query、codegen 三件套

// Next.js Server Actions
'use server'
async function getPost(id: number) { return await db.post.findUnique(...) }
// ↑ 简单优雅，但只能在 Next App Router 里用，client 端不能用 useQuery 等通用 hook
```

**所有这些方案的共同问题**：在前后端之间**人为地插了一层协议层**——
JSON Schema、OpenAPI、GraphQL SDL、proto 文件——然后用 codegen 来桥接两边的类型。

tRPC 的回答：**当前后端都是 TS，协议层就是多余的**。
直接 `import type { AppRouter } from '../server'`——
TS 编译器就是协议解析器。

| 方案 | 协议层 | codegen | 类型同步 | 网络细节 | 学习曲线 |
|---|---|---|---|---|---|
| **REST + 手写** | URL + JSON | 无 | 手动 | 暴露 | 低 |
| **REST + OpenAPI** | OpenAPI spec | 必需 | 自动 | 暴露 | 中 |
| **GraphQL** | GraphQL SDL | 必需 | 自动 | 隐藏 | 高 |
| **gRPC-web** | proto | 必需 | 自动 | 暴露 | 中 |
| **Server Actions** | RSC 内部 | 无 | 自动 | 隐藏 | 低 |
| **tRPC** | **TS 类型** | **无** | **自动** | 隐藏 | 中 |

**为什么不是 REST**：REST 不是错的，但**它假设 client 和 server 是不同语言**。
当两边都是 TS，REST 的"语言中立"反而是负担。

**为什么不是 GraphQL**：GraphQL 解决的是"客户端想要什么字段"的问题（over-fetching）。
但大多数应用根本不需要这种灵活——前端要什么后端就给什么。
GraphQL 的 schema language + resolver + DataLoader 三件套是给真需要的人。
**绝大多数项目用不上**。

**为什么不是 Server Actions**：Server Actions 在 Next App Router 下确实简洁，
但它**绑死在 Next**——你的 server logic 不能在 Vue / Svelte / Express server 复用。
tRPC 是框架无关的。

**tRPC 的取舍代价**：
- 必须前后端都用 TS（其他语言客户端要走 REST adapter）
- 错误信息不是 HTTP 标准（要适应 `TRPCClientError`）
- TS 类型推导慢——大型 router 的 IDE 响应明显延迟

## 仓库地形

```
trpc/
└── packages/
    ├── server/                                  ← ★ 核心包
    │   └── src/
    │       └── unstable-core-do-not-import/     ← 不想被人直接 import 的内核
    │           ├── initTRPC.ts                  ← 222 行：t = initTRPC.create()
    │           ├── router.ts                    ← 565 行：★★ router 工厂
    │           ├── procedureBuilder.ts          ← 704 行：★★ procedure DSL
    │           ├── procedure.ts                 ← Procedure 类型定义
    │           ├── middleware.ts                ← 243 行
    │           ├── createProxy.ts               ← 101 行：★★★ 递归 Proxy
    │           ├── parser.ts                    ← Schema validator 适配（zod 等）
    │           ├── transformer.ts               ← 序列化（superjson）
    │           ├── http/                        ← HTTP fetch handler
    │           ├── stream/                      ← 流式响应
    │           ├── rpc/                         ← JSON-RPC 协议层
    │           └── error/                       ← TRPCError
    ├── client/                                  ← createTRPCProxyClient
    ├── react-query/                             ← @trpc/react-query 集成
    ├── next/                                    ← Next.js adapter
    ├── tanstack-react-query/                    ← TanStack Query v5+ 适配
    └── server/adapters/                         ← express / fastify / aws-lambda 等
```

**心脏文件**（按重要性）：

1. `unstable-core-do-not-import/createProxy.ts:79`（22 行）——`createRecursiveProxy`，整个 client 的灵魂
2. `unstable-core-do-not-import/initTRPC.ts:117`（45 行）——`TRPCBuilder.create()`，server 端入口
3. `unstable-core-do-not-import/router.ts:252`（~80 行）——`createRouterFactory`，把 procedures 组装成树
4. `unstable-core-do-not-import/procedureBuilder.ts:1-704`——`.input(...).query(fn)` 链式 DSL

**注意**：tRPC 团队故意把内核包名叫 `unstable-core-do-not-import`，
就是不想用户直接 import 内部 API——它们随时可能改。
但学习源码时这就是入口。

## 核心机制 · Layer 3 精读

### 机制 1 · 递归 Proxy — 客户端的全部魔法

`createProxy.ts:79-81`（`createRecursiveProxy` 的全部）：

```typescript
export const createRecursiveProxy = <TFaux = unknown>(
  callback: ProxyCallback,
): TFaux => createInnerProxy(callback, [], emptyObject()) as TFaux;
```

只有 3 行。但它通过 `createInnerProxy` 实现一个**无限深度的虚拟对象**：

`createProxy.ts:19-72`（`createInnerProxy`，简化）：

```typescript
function createInnerProxy(
  callback: ProxyCallback,
  path: readonly string[],
  memo: Record<string, unknown>,
) {
  const cacheKey = path.join('.');

  memo[cacheKey] ??= new Proxy(noop, {
    get(_obj, key) {
      if (typeof key !== 'string' || key === 'then') {
        return undefined;        // ← 防 Promise 检测
      }
      return createInnerProxy(callback, [...path, key], memo);  // ← 递归
    },
    apply(_1, _2, args) {
      // ... 处理 .call / .apply
      let opts = { args, path };
      return callback(opts);     // ← 调用就触发回调，传入 path 和 args
    },
  });

  return memo[cacheKey];
}
```

**这段代码的精妙之处**：

每次 `.foo.bar.baz` 访问，都返回一个新的 Proxy；
最后 `(...args)` 调用时，触发 `apply` 把 `path = ['foo', 'bar', 'baz']` 和 `args` 传给回调。

所以 client 端这样用：

```typescript
const client = createRecursiveProxy(({ path, args }) => {
  return fetch(`/api/${path.join('/')}`, {
    method: path[path.length - 1] === 'query' ? 'GET' : 'POST',
    body: JSON.stringify(args)
  })
})

await client.posts.byId.query(123)
// path = ['posts', 'byId', 'query'], args = [123]
// → fetch('/api/posts/byId/query?input=...')
```

→ **关键**：JS 端没有 `posts.byId` 对象。是 Proxy 在被访问时**凭空生成**的。
任何路径都"存在"——直到调用为止。

**类型层面怎么知道 `client.posts.byId` 是合法的**？

通过 `<TFaux>` 泛型把 server 端的 router 类型"假装"成 proxy 的类型：

```typescript
type AppRouter = typeof appRouter   // server 端导出
const client = createRecursiveProxy<AppRouter>(...)   // ← 用 AppRouter 当 proxy 的类型
client.posts.byId.query(123)
//      ↑ TS 会在 AppRouter 类型上检查这个路径是否存在
```

→ **运行期是 Proxy，编译期是类型推导**。两条腿走路。

### 机制 2 · server 端的 builder 模式

`initTRPC.ts:117-130`（TRPCBuilder 节选）：

```typescript
class TRPCBuilder<TContext extends object, TMeta extends object> {
  context<TNewContext extends object | ContextCallback>() {
    return new TRPCBuilder<
      TNewContext extends ContextCallback ? Unwrap<TNewContext> : TNewContext,
      TMeta
    >();
  }

  meta<TNewMeta extends object>() {
    return new TRPCBuilder<TContext, TNewMeta>();
  }

  create<TOptions extends RuntimeConfigOptions<TContext, TMeta>>(
    opts?: ValidateShape<TOptions, RuntimeConfigOptions<TContext, TMeta>>,
  ): TRPCRootObject<TContext, TMeta, TOptions> { /* ... */ }
}
```

用户写法：

```typescript
const t = initTRPC.context<{ user: User }>().create()
//                  ↑ 把 Context 类型注入到所有后续 procedure
```

**为什么用 builder 模式而不是直接传 generic**：

```typescript
// 替代写法（已被 trpc v11 抛弃）
const t = initTRPC<{ user: User }>().create()
```

builder 模式的好处是**类型可以分阶段累积**——先 `.context()` 再 `.meta()` 再 `.create()`，
每一步都返回带新类型的 builder 实例。这避免了"一个函数 5 个泛型参数"的难用。

→ 这是 [zod](/study/projects/zod/) 的 `.transform().refine().pipe()` 链式 API 同源思路：
**用类型变化驱动 API 设计**。

### 机制 3 · procedureBuilder — 输入校验 + 类型流

`procedureBuilder.ts` 共 704 行。核心是这种 DSL：

```typescript
const helloProcedure = t.procedure
  .input(z.object({ name: z.string() }))   // ← 类型 = { name: string }
  .query(({ input }) => {
    return `Hello ${input.name}`            // ← input.name 自动是 string
  })
```

`.input(parser)` 把 parser 的输出类型记到 procedure 的 `_def.$types.input`。
`.query(fn)` 时，fn 的参数类型从 input 类型流过来。

→ tRPC 直接复用了 [zod](/study/projects/zod/) 的 `infer` 机制——
你的 zod schema 的 output 类型就是 procedure 的 input 类型。

**这是把"类型当设计工具"的连锁反应**：zod 让你写一份 schema 同时是类型和验证；
tRPC 让你写一个 procedure 自动是 server handler 和 client 类型——
两个工具叠加，前后端类型同源。

### 机制 4 · router — 把 procedures 组装成树

`router.ts:252-260`（createRouterFactory 入口）：

```typescript
export function createRouterFactory<TRoot extends AnyRootTypes>(
  config: RootConfig<TRoot>,
) {
  function createRouterInner<TInput extends CreateRouterOptions>(
    input: TInput,
  ): BuiltRouter<TRoot, DecorateCreateRouterOptions<TInput>> {
    // ...
  }
}
```

用户写法：

```typescript
const appRouter = t.router({
  posts: t.router({
    byId: t.procedure.input(z.number()).query(({ input }) => db.post.find(input)),
    create: t.procedure.input(z.object({...})).mutation(...)
  }),
  users: t.router({
    me: t.procedure.query(({ ctx }) => ctx.user)
  })
})

export type AppRouter = typeof appRouter   // ← 这就是要导给 client 的类型
```

**注意**：`appRouter` 是个**普通对象**（runtime）+ **类型化的树结构**（compile time）。
它的类型大致是：

```typescript
type AppRouter = {
  posts: {
    byId: Procedure<'query', { input: number, output: Post }>
    create: Procedure<'mutation', { input: NewPost, output: Post }>
  }
  users: {
    me: Procedure<'query', { input: void, output: User }>
  }
}
```

**只导出 `type`，不导出值**——这是 tRPC 的精妙之处。
client 端 `import type { AppRouter }` **不会把 server 代码打到 bundle 里**——
type-only import 在 TS 编译后会被擦除。

→ **这是个重要发现**：很多人误以为"tRPC 让 client 能 import server 代码"。
不是。它让 client 能 **import server 的类型**。

### 机制 5 · lazy router — 性能优化

`router.ts:271-303`（lazy loader 节选）：

```typescript
function createLazyLoader(opts: { ref, path, key, aggregate }) {
  return {
    ref: opts.ref,
    load: once(async () => {
      const router = await opts.ref();
      // ...
      opts.aggregate[opts.key] = step(router._def.record, lazyPath);
    }),
  };
}
```

如果你的 router 有 100 个 procedures，server 启动时全部 import 会拖慢启动。
tRPC 支持 `t.router({ posts: lazy(() => import('./postsRouter')) })`——
首次被调用时才加载。

→ 这种"lazy 子树"对大型应用很关键。React Router 也有同款思路。

## 横向对比

### vs GraphQL — 灵活性 vs 简洁性

GraphQL 的 query 让 client 自由组合字段：

```graphql
query { post(id: 1) { title author { name } } }
```

tRPC 没有这种能力——server 定义返回什么就返回什么。

但**大多数应用根本不需要**。GraphQL 的复杂度（Schema、resolver、DataLoader、N+1 防御、
查询 cost analysis）是为大型多端应用设计的。tRPC 是"如果你只有一个 web client，
你不需要这些"的回答。

### vs Next.js Server Actions — 框架绑定 vs 框架无关

Server Actions：

```typescript
'use server'
export async function createPost(data: NewPost) { /* ... */ }
```

Next 自动把它包成可以从 client 调用的接口。

tRPC：

```typescript
const createPost = t.procedure.input(NewPostSchema).mutation(({ input }) => /* ... */)
```

差不多简洁，但 tRPC 可以挂在 Express / Fastify / Hono / AWS Lambda 任何 server。
**你不被 Next 锁定**。

如果你坚信用 Next，Server Actions 更简单；
否则 tRPC 是你想要的。

### vs OpenAPI codegen — 协议中立 vs 类型直通

OpenAPI 是"我们后端是 Java/Go/Python，前端是 TS"时的好选择——
通过 spec 文件做协议中立。

但当**两边都是 TS**，OpenAPI 多了两个步骤（写 spec + codegen），
而 tRPC 直接用 `import type`。

→ 这就是判断分水岭：**你的 client 是不是 TS 独占**。

## Hands-on（30 分钟内能跑）

```bash
mkdir trpc-demo && cd trpc-demo
npm init -y
npm install @trpc/server @trpc/client zod
npm install -D typescript tsx @types/node
```

写 `server.ts`：

```typescript
import { initTRPC } from '@trpc/server'
import { createHTTPServer } from '@trpc/server/adapters/standalone'
import { z } from 'zod'

const t = initTRPC.create()

const appRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello, ${input.name}!`),

  addItem: t.procedure
    .input(z.object({ name: z.string(), quantity: z.number().int().min(1) }))
    .mutation(({ input }) => {
      console.log('Got', input)
      return { id: Date.now(), ...input }
    }),
})

export type AppRouter = typeof appRouter

createHTTPServer({ router: appRouter }).listen(3000)
console.log('Server on :3000')
```

写 `client.ts`：

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from './server'   // ← 只 import type

const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000' })]
})

const greeting = await client.greeting.query({ name: 'Jason' })
//      ↑ 类型自动是 string（因为 server 的 query 返回了 string）
console.log(greeting)

const item = await client.addItem.mutate({ name: 'Apple', quantity: 5 })
console.log(item.id, item.name)
//          ↑ 类型自动是 number
```

```bash
npx tsx server.ts &     # 后台跑 server
npx tsx client.ts       # 跑 client
```

### 改一处的实验（必做）

把 server 的 `greeting` 改成返回对象：

```typescript
.query(({ input }) => ({ message: `Hello, ${input.name}!` }))
```

**不重启 server**，client 不变，跑一下 `client.ts`：

- TS 编译：在 client 端 `client.greeting.query(...)` 的返回类型立即变成 `{ message: string }`
- 你直接 `console.log(greeting)` 还能跑（运行时返回对象会被 stringify）
- 但 `greeting.toUpperCase()`（如果你之前这么用）会编译报错

→ 这就是"server 改类型，client 编译期立即知道"的体感。
**比任何 codegen 工作流都快**。

第二个实验：把 server 的 `addItem.input` schema 加一个 `tags: z.array(z.string())`，
client 不传 tags：

```typescript
client.addItem.mutate({ name: 'Apple', quantity: 5 })
//                    ↑ TS 编译期立即报错：缺 tags
```

## 与你工作的连接

**能立刻迁移**：

- 任何前后端都是 TS 的内部工具——**不要写 REST 了，直接 tRPC**
- 把 [zod 笔记](/study/projects/zod/) 的 schema 直接当 procedure input
- 配合 [TanStack Query](/study/projects/tanstack-query/) 用 `@trpc/react-query`：
  自动有缓存 / 重试 / focus revalidate

**下个月可能用到**：

- 给团队搭一个内部仪表盘——20 个 procedures + tRPC + react-query + tailwind 一周搞定
- 给 Claude Skill / MCP server 写客户端调用——把 MCP 协议封装成 tRPC procedure

**不要用 tRPC 的部分**：

- **公开 API**（给第三方调用）——用 REST + OpenAPI，对方不一定用 TS
- **不同语言的 client**——iOS（Swift）/ Android（Kotlin）调你的 server 时，
  REST 或 gRPC 更直接
- **GraphQL 真需要的场景**（N 端 client，每个要不同字段子集）——别强行用 tRPC

## 读完你能做之前做不了的事

- **判断**：看到一个 TS 项目还在手写 fetch + 手写类型，能立刻识别"这应该是 tRPC"
- **设计**：把"前后端协议"看作一个**类型而不是 spec 文件**
- **解释**：被问"Proxy 能干嘛"时，能用 tRPC 的 createRecursiveProxy 当例子
- **下钻**：看懂任何"链式 API + 类型累积"的设计——比如 zod、knex、prisma client、drizzle
- **对照**：识别"我这个 SDK 应该用 codegen 还是用 Proxy + 类型"

## 自检 · 5 个问题

1. `createProxy.ts:25-32` 里 `if (key === 'then') return undefined`——这条特判防的是什么？
   不写会怎样？（提示：Promise.resolve(proxy)）
2. tRPC client 端 `import type { AppRouter }`——把 `type` 关键字去掉会怎样？
   server 代码会进 client bundle 吗？
3. `initTRPC.ts:117` 的 builder 模式可以分阶段累积类型。
   能不能用单个 `initTRPC.create<{ context: ..., meta: ... }>()` 替代？尝试给出失败的具体例子。
4. tRPC v11 把内部 API 叫 `unstable-core-do-not-import` 而不是 `core` 或 `internal`。
   这种命名约定的好处和坏处分别是什么？
5. 当 router 增长到 200+ procedures，IDE 类型检查变慢——
   除了 lazy router，还有哪些缓解方法？（提示：把 router 切成 sub-router import）

## 延伸阅读

读完 `createProxy.ts` 后下一步：

1. `procedureBuilder.ts` 全部 704 行——理解 `.input().output().use().query()` 链式 builder
   的类型累积模式
2. `router.ts:252-565`——createRouterFactory 完整实现，包括 lazy loader、merge、reservation 检查
3. `packages/client/src/links/` 目录——links 是 tRPC 的 middleware 系统，
   自带 batch / split / dedupe 等
4. **drizzle ORM 源码**——同样是"链式 builder + 类型累积"的范例，
   读完会发现这是 TS 库的通用模式
5. **tanstack/react-query 集成包源码**——看 tRPC 如何把 procedure 类型变成 query options

---

**笔记完成**：2026-05-27（v11.17.0）
**研究方法**：本地克隆 + 自查 createProxy.ts / initTRPC.ts / router.ts 关键实现
**心脏文件**：`packages/server/src/unstable-core-do-not-import/createProxy.ts:79`（22 行）
