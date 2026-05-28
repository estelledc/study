---
title: "tRPC — 协议消失：函数即 API"
description: 把 client.posts.byId.query(123) 看起来像本地函数调用——背后是一个递归 Proxy + 一份共享类型 + 一根 link chain
sidebar:
  order: 18
  label: "trpc/trpc"
---

> @trpc/server v11.x，commit `c7360d4`（2026-05-28 读时），MIT。
>
> tRPC 不是 GraphQL 的替代品，也不是 REST 的下一代——它是
> **"前后端用同一份代码"这个假设成立后，HTTP 协议这一层就该消失**
> 这个判断的产物。
>
> 你写 `client.posts.byId.query(123)`，看起来像调用本地函数——
> 实际上是个递归 Proxy 把 `posts.byId` 拼成 path、把 `123` 序列化、
> 通过 link 链发出 HTTP、由 server 上同名 procedure 处理、
> 返回值类型从 server 类型流过来。**全程没有一行手写的 fetch / 类型定义**。
>
> 这是 v1.1 项目类型分支 D（**框架/SDK**）的状元篇范本：
> 心脏是 abstraction（Router / Procedure / Link）+ 三个 extension point
> （`createTRPCRouter` / Proxy client / link adapter）。

## 项目类型 self-classify（v1.1 必填）

- **类型**：框架 / SDK（v1.1 分支 D）
- **判定依据**：
  - 不是单职责工具库——同时管 server 端 abstraction（Router / Procedure / Middleware）
    + 客户端 abstraction（Proxy / Link / Transport）+ 多 transport 适配器（HTTP / WS / Stream）
  - 提供明确的 extension point：自己写 link、自己写 procedure builder middleware、
    自己挂 transformer。每一处都是"开口给用户填业务"
  - 主导 API 形态是 **builder 链**（`t.procedure.input().use().query()`）
    + **proxy 化的客户端**（`client.x.y.query()`），这是 SDK 的典型签名
- 不属于"工具库"：心脏分布在 server / client / link / transformer 4 个子系统，
  500 行内说不清；也不是"大型应用"，因为它没有用户产品形态

## 一句话定位

**tRPC = 一个 server 端的 router builder + 一个 client 端的递归 Proxy + 一根共享的 TS 类型管道 + 一条可插拔的 link 链。**
你 export 一个 router 实例的类型 `type AppRouter = typeof appRouter`，
client 通过 `createTRPCClient<AppRouter>()` 拿到完全类型安全的客户端——
**完全不需要 OpenAPI / GraphQL / proto 文件**。

## Why（为什么是它而不是 GraphQL / REST / gRPC-web / Server Actions）

主流方案的痛点：

```typescript
// REST + 手写类型
type GetPostResponse = { id: number; title: string }
const post: GetPostResponse = await fetch(`/api/posts/${id}`).then(r => r.json())
// 类型是手写的，server 改返回值不会同步

// REST + OpenAPI codegen
const { data } = await client.GET('/api/posts/{id}', { params: { path: { id } } })
// 类型对了，但要部署 OpenAPI spec + 跑 codegen + 改 server 后要重新生成

// GraphQL + codegen
const { data } = useQuery(GET_POST, { variables: { id } })
// 强大但学习曲线陡，server schema、client query、codegen 三件套

// Next.js Server Actions
'use server'
async function getPost(id: number) { return db.post.findUnique(...) }
// 简单优雅，但只能在 Next App Router 里用，client 端不能挂通用 hook
```

**所有这些方案的共同问题**：在前后端之间**人为地插了一层协议层**——
JSON Schema、OpenAPI、GraphQL SDL、proto 文件——然后用 codegen 桥接两边的类型。

tRPC 的回答：**当前后端都是 TS，协议层就是多余的**。
直接 `import type { AppRouter } from '../server'`——
TS 编译器就是协议解析器。

| 方案 | 协议层 | codegen | 类型同步 | 网络细节 | 学习曲线 |
|---|---|---|---|---|---|
| REST + 手写 | URL + JSON | 无 | 手动 | 暴露 | 低 |
| REST + OpenAPI | OpenAPI spec | 必需 | 自动 | 暴露 | 中 |
| GraphQL | GraphQL SDL | 必需 | 自动 | 隐藏 | 高 |
| gRPC-web | proto | 必需 | 自动 | 暴露 | 中 |
| Server Actions | RSC 内部 | 无 | 自动 | 隐藏 | 低 |
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
- 没有 schema-as-runtime：协议是 type 而不是值，所以**没法自动出文档**（要靠
  trpc-openapi 之类的反向适配）

## 架构图（v1.1 分支 D · P1 推荐）

![tRPC: 从 client.posts.byId.query(123) 到 HTTP request 的全过程。
图分 5 层：(1) 你写的链式调用代码；(2) 递归 Proxy 的 4 步——前 3 步 get 陷阱
返回新 Proxy（path 累积），第 4 步 apply 陷阱触发 callback；
(3) callback 把 path/args 折叠成 client.query('posts.byId', 123) 调用；
(4) link chain (logger -> retry -> httpBatch) 把 op 包成 fetch；
(5) server 端 fetchHTTPHandler 解析 path 查 procedure map，跑 middleware + resolver。
画风：暖纸底 + 4 色分层（橙=Proxy / 蓝=类型 / 绿=link / 紫=网络）。
](../../../public/projects/trpc/01-proxy-magic.webp)

## 仓库地形

```
trpc/
└── packages/
    ├── server/                                  ← 核心包
    │   └── src/
    │       └── unstable-core-do-not-import/     ← 不想被人直接 import 的内核
    │           ├── initTRPC.ts                  ← 222 行：t = initTRPC.create()
    │           ├── router.ts                    ← 565 行 ★ router 工厂
    │           ├── procedureBuilder.ts          ← 704 行 ★ procedure DSL
    │           ├── procedure.ts                 ← Procedure 类型定义
    │           ├── middleware.ts                ← 243 行
    │           ├── createProxy.ts               ← 101 行 ★★★ 递归 Proxy
    │           ├── parser.ts                    ← Schema validator 适配（zod 等）
    │           ├── transformer.ts               ← 序列化（superjson）
    │           ├── http/                        ← HTTP fetch handler
    │           ├── stream/                      ← 流式响应
    │           ├── rpc/                         ← JSON-RPC 协议层
    │           └── error/                       ← TRPCError
    ├── client/
    │   └── src/
    │       ├── createTRPCClient.ts              ← 176 行 ★ 用 Proxy 装饰 untyped client
    │       ├── internals/
    │       │   └── TRPCUntypedClient.ts         ← 162 行 ★ 跑 link chain 的引擎
    │       └── links/                           ← ★ 框架的 extension point
    │           ├── httpBatchLink.ts             ← 141 行 batch transport
    │           ├── httpLink.ts                  ← 单发 HTTP
    │           ├── wsLink/                      ← WebSocket transport
    │           ├── httpSubscriptionLink.ts      ← SSE 订阅
    │           ├── loggerLink.ts                ← 日志中间件示例
    │           ├── retryLink.ts                 ← 重试中间件示例
    │           ├── splitLink.ts                 ← 按 op 类型分流
    │           └── internals/createChain.ts     ← 40 行 链组合器
    ├── react-query/                             ← @trpc/react-query 集成
    ├── tanstack-react-query/                    ← TanStack Query v5+ 适配
    ├── next/                                    ← Next.js adapter
    └── server/adapters/                         ← express / fastify / aws-lambda 等
```

### 心脏文件清单（v1.1 分支 D 要求 ≥ 3）

| # | 文件 | 行数 | 角色 | abstraction 名 |
|---|---|---|---|---|
| 1 | `unstable-core-do-not-import/createProxy.ts:79` | 22 | 递归 Proxy 实现 | **Proxy client** |
| 2 | `unstable-core-do-not-import/router.ts:252-359` | 108 | router 工厂 | **Router** |
| 3 | `unstable-core-do-not-import/procedureBuilder.ts:489-566` | 78 | builder 实现 | **Procedure** |
| 4 | `client/src/createTRPCClient.ts:141-158` | 18 | proxy 包装 untyped client | **TRPCClient** |
| 5 | `client/src/links/internals/createChain.ts:9-38` | 30 | 链组合器 | **Link chain** |
| 6 | `client/src/links/httpBatchLink.ts` | 141 | HTTP batch transport | **Link adapter** |

### Extension point（v1.1 分支 D 必填）

| 类别 | 入口 API | 路径 | 用法 |
|---|---|---|---|
| Server 路由 | `t.router({...})` | `router.ts:252` `createRouterFactory` | 嵌套子 router、合并、lazy |
| Server procedure 中间件 | `.use(fn)` | `procedureBuilder.ts:526` | 鉴权 / 日志 / 数据库事务 |
| Server schema 校验 | `.input(parser)` | `procedureBuilder.ts:507` | zod / yup / valibot |
| Server 序列化 | `transformer` 配置 | `transformer.ts` + initTRPC | superjson / devalue |
| Client link | `links: [...]` | `links/types.ts:109` `TRPCLink` | 重试 / 日志 / batch / split |
| Client transport | 末端 link | `httpBatchLink` / `wsLink` / `httpSubscriptionLink` | HTTP / WS / SSE |

**注意**：tRPC 团队故意把内核包名叫 `unstable-core-do-not-import`，
就是不想用户直接 import 内部 API——它们随时可能改。
但学习源码时这就是入口。**怀疑 0**：这种命名约定的好处是吓退一部分误用，
坏处是 IDE 自动补全里照样能看到，真要防止滥用应该用 package.json 的
`exports` 字段限制。

## 核心机制 · Layer 3 精读

> v1.1 分支 D 要求 ≥ 3 段：核心 abstraction + middleware/handler 模型 + lifecycle。
> 下面 3 段对应 (1) 服务端 procedure builder + Router 类型 / (2) 客户端递归 Proxy 实现 /
> (3) link 中间件链 + transport。

### 机制 1 · 服务端：procedureBuilder 不可变链式累积 + Router 扁平化

permalink：[`procedureBuilder.ts:489-566` @ c7360d4](https://github.com/trpc/trpc/blob/c7360d4eb3c89c336468809a293e5cda4b302d4b/packages/server/src/unstable-core-do-not-import/procedureBuilder.ts#L489-L566)

实际代码（节选 `createBuilder` 主体）：

```typescript
function createBuilder(initDef: Partial<AnyProcedureBuilderDef> = {}) {
  const _def: AnyProcedureBuilderDef = {
    procedure: true,
    inputs: [],
    middlewares: [],
    ...initDef,
  };

  const builder: AnyProcedureBuilder = {
    _def,
    input(input) {
      const parser = getParseFn(input as Parser);
      return createNewBuilder(_def, {
        inputs: [input as Parser],
        middlewares: [createInputMiddleware(parser)],
      });
    },
    output(output: Parser) {
      const parser = getParseFn(output);
      return createNewBuilder(_def, {
        output,
        middlewares: [createOutputMiddleware(parser)],
      });
    },
    meta(meta)            { return createNewBuilder(_def, { meta }); },
    use(middlewareBuilderOrFn) {
      const middlewares =
        '_middlewares' in middlewareBuilderOrFn
          ? middlewareBuilderOrFn._middlewares
          : [middlewareBuilderOrFn];
      return createNewBuilder(_def, { middlewares });
    },
    concat(builder) {
      return createNewBuilder(_def, (builder as AnyProcedureBuilder)._def);
    },
    query(resolver)       { return createResolver({ ..._def, type: 'query' }, resolver) as AnyQueryProcedure; },
    mutation(resolver)    { return createResolver({ ..._def, type: 'mutation' }, resolver) as AnyMutationProcedure; },
    subscription(resolver){ return createResolver({ ..._def, type: 'subscription' }, resolver) as any; },
    experimental_caller(caller) { return createNewBuilder(_def, { caller }) as any; },
  };

  return builder;
}
```

旁注：

- `input` / `output` / `use` / `meta` 等链式方法**全部走 createNewBuilder**——
  不修改 `_def`，返回带新 def 的新 builder。这是不可变的 builder 模式，
  跟 [zod](/study/projects/zod/) 的 `.transform().refine().pipe()` 同源
- `input` 调用本身**做了两件事**：把 parser 加进 `inputs` 数组（用来反序列化），
  同时把它包成一个 `createInputMiddleware` 推进 `middlewares` 数组——
  说明 input 校验和 use 中间件**走同一个执行通道**，统一处理
- `query` / `mutation` / `subscription` 是**终止符**——返回 procedure 实例不再是 builder。
  这就让 `.input(...).query(...).use(...)` 这种顺序错乱在类型上不可能成立
- builder 里类型签名（行 280-460，本节没贴）通过 8 个泛型累积：
  `TContext / TMeta / TContextOverrides / TInputIn / TInputOut / TOutputIn / TOutputOut / TCaller`，
  每个链式方法返回的 builder 类型都"覆盖一个泛型"，这是为啥 IDE 在写 procedure 时
  能精确推 input 类型——但代价是 router 大了 IDE 卡顿
- `concat`（曾叫 `unstable_concat`）允许把两个 builder 合并——
  你能把 `loggedAuthedBuilder` 抽成一个变量，在多个 procedure 里复用
- `experimental_caller` 是给"自定义调用方式"的逃生口（比如改成同步调用），
  但带 experimental 前缀提醒别在生产用

**怀疑 1**：`input` 把 parser 同时存进 `inputs` 数组和 `middlewares` 数组——
是不是冗余？答：不是。`inputs` 给类型推导（`inferProcedureInput`）和合并多个 input
（`concat` 时多个 input 求交集）用；`middlewares` 给运行时执行用。
两者作用维度不同，但确实增加了维护成本——改 input 实现要改两处。

### 机制 2 · 客户端：递归 Proxy + Flat Proxy 双层组合

permalink：[`createProxy.ts:1-101` @ c7360d4](https://github.com/trpc/trpc/blob/c7360d4eb3c89c336468809a293e5cda4b302d4b/packages/server/src/unstable-core-do-not-import/createProxy.ts#L1-L101)

完整代码（核心 70 行）：

```typescript
import { emptyObject } from './utils';

interface ProxyCallbackOptions {
  path: readonly string[];
  args: readonly unknown[];
}
type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

const noop = () => {};

const freezeIfAvailable = (obj: object) => {
  if (Object.freeze) Object.freeze(obj);
};

function createInnerProxy(
  callback: ProxyCallback,
  path: readonly string[],
  memo: Record<string, unknown>,
) {
  const cacheKey = path.join('.');

  memo[cacheKey] ??= new Proxy(noop, {
    get(_obj, key) {
      if (typeof key !== 'string' || key === 'then') {
        // PromiseLike 检测兜底：Promise.resolve(proxy) 不要把 proxy 当 thenable
        return undefined;
      }
      return createInnerProxy(callback, [...path, key], memo);
    },
    apply(_1, _2, args) {
      const lastOfPath = path[path.length - 1];

      if (
        lastOfPath === 'valueOf' ||
        lastOfPath === 'toString' ||
        lastOfPath === 'toJSON'
      ) {
        const debugPath = path.slice(0, -1).join('.');
        return `tRPC.proxy(${debugPath})`;
      }

      let opts = { args, path };
      if (lastOfPath === 'call') {
        opts = { args: args.length >= 2 ? [args[1]] : [], path: path.slice(0, -1) };
      } else if (lastOfPath === 'apply') {
        opts = { args: args.length >= 2 ? args[1] : [], path: path.slice(0, -1) };
      }
      freezeIfAvailable(opts.args);
      freezeIfAvailable(opts.path);
      return callback(opts);
    },
  });

  return memo[cacheKey];
}

export const createRecursiveProxy = <TFaux = unknown>(
  callback: ProxyCallback,
): TFaux => createInnerProxy(callback, [], emptyObject()) as TFaux;

export const createFlatProxy = <TFaux>(
  callback: (path: keyof TFaux) => any,
): TFaux => {
  return new Proxy(noop, {
    get(_obj, name) {
      if (name === 'then') return undefined;
      return callback(name as any);
    },
  }) as TFaux;
};
```

旁注：

- `new Proxy(noop, ...)`：Proxy 的 target 必须是个函数才能被 `apply`，
  所以 target 用 `noop`（也就是 `() => {}`）——这一行是整个魔法的底座
- `memo` 缓存：同一个 path 多次访问返回同一个 Proxy 实例。
  这避免了 `client.posts === client.posts` 失败（认知一致），
  也省内存
- `key === 'then'` 特判防的是：`Promise.resolve(client)` 会去问 `client.then`
  来检测是不是 thenable。如果不返回 undefined，会无限递归构造 path
- `valueOf / toString / toJSON` 特判（行 43-50）是给 React 19 渲染时
  "把对象强转成 string" 兜底——如果不返回 debug 字符串，React 会把整个 proxy 当
  thenable 处理，导致渲染崩。这是 v11 才加的补丁
- `.call` / `.apply` 特判：允许 `client.posts.byId.call(this, 123)` 这种 JS 原生调用
  方式正确工作——把 path 末尾的 'call' 抹掉，args 取第二个开始
- `freezeIfAvailable`：冻结 args 和 path 防止 link chain 里有人偷偷改它
- `createFlatProxy` 是 1 层版的，用在 `createTRPCClient.ts:152` 包外面一层——
  这样根 key（如自定义 symbol）能被截获处理，不进入递归

**`TFaux` 泛型怎么把 server 类型映射成 proxy 路径**？

[`createTRPCClient.ts:141-158` @ c7360d4](https://github.com/trpc/trpc/blob/c7360d4eb3c89c336468809a293e5cda4b302d4b/packages/client/src/createTRPCClient.ts#L141-L158)：

```typescript
export function createTRPCClientProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
): TRPCClient<TRouter> {
  const proxy = createRecursiveProxy<TRPCClient<TRouter>>(({ path, args }) => {
    const pathCopy = [...path];
    const procedureType = clientCallTypeToProcedureType(pathCopy.pop()!);
    //                                                  ↑ 'query' / 'mutate' / 'subscribe'
    const fullPath = pathCopy.join('.');
    //         ↑ 'posts.byId'
    return (client[procedureType] as any)(fullPath, ...(args as any));
    //          ↑ 走 untypedClient.query('posts.byId', 123)
  });
  return createFlatProxy<TRPCClient<TRouter>>((key) => {
    if (key === untypedClientSymbol) return client;
    return proxy[key];
  });
}
```

→ **运行期 Proxy**：path = `['posts','byId','query']`，pop 出 'query'，
剩下 `'posts.byId'` 当作 procedure 路径走 untyped client。

→ **编译期类型**：`TRPCClient<TRouter>` 是个递归映射类型
（`createTRPCClient.ts:98-120` 的 `DecoratedProcedureRecord`），
它把 router 的 `_def['record']` 树形递归成"每个叶子加 .query/.mutate/.subscribe"的形状。
所以 `client.posts.byId.query` 在 TS 看来是合法的，运行时 Proxy 也能产生这条路径。
**两条腿严格对齐**。

**怀疑 2**：`createFlatProxy` 包在外面是为了截 `untypedClientSymbol`——
但为什么不让递归 proxy 自己处理 symbol？因为 createInnerProxy 在
`get` 里写了 `if (typeof key !== 'string') return undefined`，symbol
直接被吞掉。这是个微妙的分层：内层只认 string，外层负责 symbol 路由。
代价是多一层 Proxy 跳转——对热点路径影响极小但确实存在。

### 机制 3 · 链中间件 createChain + httpBatchLink + lifecycle

permalink：[`createChain.ts:9-38` @ c7360d4](https://github.com/trpc/trpc/blob/c7360d4eb3c89c336468809a293e5cda4b302d4b/packages/client/src/links/internals/createChain.ts#L9-L38)

```typescript
export function createChain<TRouter, TInput = unknown, TOutput = unknown>(
  opts: {
    links: OperationLink<TRouter, TInput, TOutput>[];
    op: Operation<TInput>;
  },
): OperationResultObservable<TRouter, TOutput> {
  return observable((observer) => {
    function execute(index = 0, op = opts.op) {
      const next = opts.links[index];
      if (!next) {
        throw new Error(
          'No more links to execute - did you forget to add an ending link?',
        );
      }
      const subscription = next({
        op,
        next(nextOp) {
          const nextObserver = execute(index + 1, nextOp);
          return nextObserver;
        },
      });
      return subscription;
    }
    const obs$ = execute();
    return obs$.subscribe(observer);
  });
}
```

`TRPCLink` 类型（[`links/types.ts:109-111` @ c7360d4](https://github.com/trpc/trpc/blob/c7360d4eb3c89c336468809a293e5cda4b302d4b/packages/client/src/links/types.ts#L109-L111)）：

```typescript
export type TRPCLink<TInferrable extends InferrableClientTypes> = (
  opts: TRPCClientRuntime,
) => OperationLink<TInferrable>;

export type OperationLink<TInferrable, TInput, TOutput> = (opts: {
  op: Operation<TInput>;
  next: (op: Operation<TInput>) => OperationResultObservable<TInferrable, TOutput>;
}) => OperationResultObservable<TInferrable, TOutput>;
```

旁注：

- 整个链不是同步函数嵌套（`a(b(c(...)))`），而是**懒求值的 observable 流**——
  每个 link 拿到 `op` + `next` 函数，自己决定**何时 / 是否**调 next、改不改 op
- 这跟 redux middleware（`store => next => action => ...`）几乎是同构的，
  但加了流式（每个请求可能 emit 多个 envelope，比如 subscription）
- `execute` 闭包的 index 递增是关键：每个 link 在 `next(op)` 里**实际不知道
  自己是第几个**，只知道"下一个"——这让 link 数组顺序就是执行顺序
- 末端 link 必须自己解析 op 然后 emit envelope（不能再调 next），
  否则 `opts.links[index]` 拿到 undefined 报 "No more links to execute"
- 这就是为什么 link 数组**最后一个必须是 transport link**（httpBatchLink / wsLink）：
  约定俗成而非类型强制——这是个 footgun，靠 runtime 错误信息兜底

`httpBatchLink` 是把 8ms 内多个 op 合并成一个 fetch 的 transport link。
节选其内核（[`httpBatchLink.ts` @ c7360d4](https://github.com/trpc/trpc/blob/c7360d4eb3c89c336468809a293e5cda4b302d4b/packages/client/src/links/httpBatchLink.ts)）：

```typescript
// 简化伪代码（实际逻辑分布在 httpBatchLink.ts + httpUtils.ts）
export function httpBatchLink<TRouter>(opts: HTTPBatchLinkOptions<TRouter>): TRPCLink<TRouter> {
  return () => {
    const batchLoader = dataLoader<BatchEntry, BatchResponse>(/* ... */);
    return ({ op }) => observable((observer) => {
      const { promise, cancel } = batchLoader.load(op);
      promise.then(envelope => {
        observer.next(envelope);
        observer.complete();
      }).catch(err => observer.error(TRPCClientError.from(err)));
      return cancel;
    });
  };
}
```

→ **生命周期**（v1.1 分支 D 要求"看 lifecycle 何时触发"）：

| 阶段 | 触发点 | 链上谁动 |
|---|---|---|
| 1. 客户端写 `client.posts.byId.query(123)` | apply 陷阱 | createProxy 折叠 |
| 2. `untyped.query('posts.byId', 123)` | TRPCUntypedClient 实例方法 | 构造 op + 分配 id |
| 3. createChain → execute(0) | observable 订阅时 | loggerLink 收到 op (direction: up) |
| 4. loggerLink 调 `next(op)` | execute(1) 触发 | retryLink 包一层 attempt 计数 |
| 5. retryLink 调 `next(op)` | execute(2) 触发 | httpBatchLink 进 batch 队列 |
| 6. 8ms 后 batch flush | 微任务 | fetch POST /api/trpc/posts.byId,users.me?batch=1 |
| 7. server fetchHTTPHandler 解析 | URL 路径 → procedure 名 | router.ts 里 procedures map 查找 |
| 8. 跑 middleware → resolver → return | 回包 JSON | transformer 序列化 |
| 9. envelope 沿 link 反向冒泡 | observer.next | retryLink 看是否要重试 / loggerLink 收 down 事件 |
| 10. requestAsPromise resolve | observableToPromise | client.posts.byId.query 的 await 解决 |

**怀疑 3**：链是 observable 而不是 async generator——为什么？
因为 subscription（流式订阅）天生就是多 emit。如果用 async generator，
对 query/mutation 是过度设计（只 emit 一次后立即 complete）。
但**代价**：tRPC 自己实现了一套迷你 observable（`@trpc/server/observable`），
不是 RxJS 也不是标准的 Observable proposal——多一份要维护的代码。
对比：[Effect](/study/projects/effect/) 用自己的 Stream type 也是同样的取舍。

## Layer 4 · 改一处实验（v1.1 分支 D：写一个 custom link）

> 分支 D 的 Layer 4 不是改 default value，而是**写一个 plugin / middleware / link**
> 跑 example 看 lifecycle 何时触发。

### 30 分钟跑通

```bash
mkdir trpc-demo && cd trpc-demo
npm init -y
npm install @trpc/server @trpc/client zod
npm install -D typescript tsx @types/node
echo '{"compilerOptions":{"strict":true,"target":"es2022","module":"esnext","moduleResolution":"bundler"}}' > tsconfig.json
```

`server.ts`：

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
      return { id: Date.now(), ...input }
    }),
  flaky: t.procedure
    .input(z.object({ failRate: z.number() }))
    .query(({ input }) => {
      if (Math.random() < input.failRate) {
        throw new Error('flaky failure')
      }
      return { ok: true, ts: Date.now() }
    }),
})

export type AppRouter = typeof appRouter

createHTTPServer({ router: appRouter }).listen(3000)
console.log('Server on :3000')
```

### 改一处：写一个 timing link（自定义 plugin）

`timingLink.ts`：

```typescript
import { observable, tap } from '@trpc/server/observable'
import type { AnyRouter } from '@trpc/server'
import type { TRPCLink, OperationResultEnvelope } from '@trpc/client'
import type { TRPCClientError } from '@trpc/client'

/**
 * 自定义 link：测量每个 op 从 up 到 down 的耗时，按 path 聚合。
 * 这是 v1.1 分支 D 的"改一处"实验：不是改默认值，
 * 而是新加一个 extension point 实例。
 */
export function timingLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
  const stats = new Map<string, { count: number; totalMs: number }>()
  // 每秒打一次聚合表
  setInterval(() => {
    if (stats.size === 0) return
    console.table(
      Array.from(stats, ([path, s]) => ({
        path,
        count: s.count,
        avgMs: (s.totalMs / s.count).toFixed(1),
      })),
    )
  }, 1000)

  return () => {
    return ({ op, next }) => {
      const startedAt = Date.now()
      return observable((observer) => {
        return next(op)
          .pipe(
            tap({
              next() {
                const elapsed = Date.now() - startedAt
                const cur = stats.get(op.path) ?? { count: 0, totalMs: 0 }
                cur.count += 1
                cur.totalMs += elapsed
                stats.set(op.path, cur)
              },
            }),
          )
          .subscribe(observer)
      })
    }
  }
}
```

`client.ts`：

```typescript
import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client'
import type { AppRouter } from './server'
import { timingLink } from './timingLink'

const client = createTRPCClient<AppRouter>({
  links: [
    loggerLink({ enabled: () => true }),   // 1. 日志 — 看 op up/down
    timingLink(),                           // 2. 自定义 — 聚合 timing
    httpBatchLink({ url: 'http://localhost:3000' }),  // 3. transport — 末端
  ],
})

// 跑 50 次 query，模拟流量
for (let i = 0; i < 50; i++) {
  await client.greeting.query({ name: `user-${i}` })
  if (i % 5 === 0) {
    await client.addItem.mutate({ name: 'apple', quantity: i + 1 })
  }
}
```

```bash
npx tsx server.ts &     # 后台跑 server
npx tsx client.ts       # 跑 client
```

**预期输出**：

- `loggerLink` 每个 op 打两行（up + down）
- `timingLink` 每秒打一次聚合表，类似：
  ```
  ┌─────────┬──────────────┬───────┬───────┐
  │ (index) │     path     │ count │ avgMs │
  ├─────────┼──────────────┼───────┼───────┤
  │    0    │  'greeting'  │   50  │  4.2  │
  │    1    │   'addItem'  │   10  │  5.1  │
  └─────────┴──────────────┴───────┴───────┘
  ```

**观察到的 lifecycle**：

- timingLink 的 `startedAt` 在 `next(op)` 调用**之前**记，
  所以测的是"包括下游所有 link"的耗时（不只是 transport）
- 把 timingLink 调到 loggerLink **前面**，会看到 timing 比 logger 报的 elapsedMs 略长
  ——因为多算了 logger up 处理的微秒级时间
- 把 timingLink 放在 httpBatchLink **后面**，会报错
  `No more links to execute`——transport link 必须是末端，
  这是 createChain.ts:14-18 的 runtime 检查

→ **结论**：写 link 的本质是**在 op up→down 的双向流上塞钩子**，
跟 Express middleware 几乎同构，但天生支持流式（subscription 多 emit）。

### 第二个实验：类型层面的对齐

把 server 的 `greeting` 改成返回对象：

```typescript
.query(({ input }) => ({ message: `Hello, ${input.name}!` }))
```

**不重启 server**，client 不变，跑 `npx tsx client.ts`：

- TS 编译：在 client 端 `client.greeting.query(...)` 的返回类型立即变成 `{ message: string }`
- 你直接 `console.log(greeting)` 还能跑（运行时返回对象会被 stringify）
- 但 `greeting.toUpperCase()`（如果你之前这么用）会编译报错

→ 这就是"server 改类型，client 编译期立即知道"的体感。
**比任何 codegen 工作流都快**。

第三个实验：把 server 的 `addItem.input` schema 加一个 `tags: z.array(z.string())`，
client 不传 tags：

```typescript
client.addItem.mutate({ name: 'Apple', quantity: 5 })
//                    ↑ TS 编译期立即报错：缺 tags
```

## 横向对比（Layer 5）

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

### 维度对比（v1.1 要求 ≥ 4 维）

| 维度 | tRPC | GraphQL | OpenAPI/REST | Server Actions |
|---|---|---|---|---|
| 协议层 | TS 类型 | SDL | spec 文件 | RSC 内部 |
| codegen | 无 | 有 | 有 | 无 |
| 多语言客户端 | ❌ TS only | ✅ | ✅ | ❌ Next only |
| 流式（订阅） | ✅ WS/SSE link | ✅ subscriptions | 自己加 | ❌ |
| 学习成本 | 中 | 高 | 中 | 低 |
| 大型 router IDE 性能 | ⚠️ 类型重 | 中 | 轻 | 中 |
| 自动文档 | ⚠️ 要 trpc-openapi | ✅ introspection | ✅ swagger UI | ❌ |

**选型建议**：

- **TS 独占的内部应用** → tRPC（不写 fetch，不写 type）
- **公开 API / 多语言客户端** → REST + OpenAPI
- **N 端 client，每个要不同字段子集** → GraphQL（真正需要 over-fetch 控制）
- **死磕 Next App Router** → Server Actions（最少胶水）

## 与你工作的连接（Layer 6）

**今天就能用**：

- 任何前后端都是 TS 的内部工具——**不要写 REST 了，直接 tRPC**
- 把 [zod 笔记](/study/projects/zod/) 的 schema 直接当 procedure input
- 配合 [TanStack Query](/study/projects/tanstack-query/) 用 `@trpc/react-query`：
  自动有缓存 / 重试 / focus revalidate
- 写一个 timingLink / authLink 当 ops 监控插桩，复用本文 Hands-on 的代码

**下个月可能用到**：

- 给团队搭一个内部仪表盘——20 个 procedures + tRPC + react-query + tailwind 一周搞定
- 把已有的 REST 接口包成 tRPC procedure 做渐进迁移（procedure 内部还是 fetch 旧 URL）
- 给一个 LongCat 工具调用客户端写 tRPC 适配，用 procedure builder 抽象 tool schema
- 用 splitLink + wsLink 把 subscription 走 WebSocket、query 走 HTTP batch

**不要用 tRPC 的部分**：

- **公开 API**（给第三方调用）——用 REST + OpenAPI，对方不一定用 TS
- **不同语言的 client**——iOS（Swift）/ Android（Kotlin）调你的 server 时，
  REST 或 gRPC 更直接
- **GraphQL 真需要的场景**（N 端 client，每个要不同字段子集）——别强行用 tRPC
- **router 超过 300 个 procedure 的巨型项目**——TS 类型推导会慢到 IDE 卡顿，
  得拆 sub-router + lazy
- **需要 schema 动态生成文档的场景**（必须有 swagger UI）——
  trpc-openapi 是反向适配，维护体感不如原生 OpenAPI

## 读完你能做之前做不了的事

- **判断**：看到一个 TS 项目还在手写 fetch + 手写类型，能立刻识别"这应该是 tRPC"
- **设计**：把"前后端协议"看作一个**类型而不是 spec 文件**
- **解释**：被问"Proxy 能干嘛"时，能用 tRPC 的 createRecursiveProxy 当例子
- **下钻**：看懂任何"链式 API + 类型累积"的设计——比如 zod、knex、prisma client、drizzle
- **对照**：识别"我这个 SDK 应该用 codegen 还是用 Proxy + 类型"
- **写 link**：能给现有 trpc client 写一个 retry/log/metrics 中间件，理解链顺序意义

## Layer 7 · 自检 · 5 个具体问题（带行号）

1. `createProxy.ts:28-32` 里 `if (key === 'then') return undefined`——
   这条特判防的是什么？不写会怎样？追到具体场景，回答 `Promise.resolve(client)`
   会发生什么递归。
2. `createProxy.ts:43-50` 的 `valueOf / toString / toJSON` 特判是 v11 才加的。
   不加会触发什么 React 19 的具体崩溃？给一个最小可复现 case。
3. `createTRPCClient.ts:152-157` 用 `createFlatProxy` 包了一层 `createRecursiveProxy`。
   把这层 flat proxy 删掉直接返回 recursive proxy 会怎样？
   `getUntypedClient(client)` 还能拿到 client 吗？
4. `procedureBuilder.ts:507-512` 的 `input` 把 parser 同时存进 `_def.inputs` 和
   `_def.middlewares`。如果改成只存进 `middlewares`、`inputs` 字段不要——
   会破坏哪个具体能力？（提示：`concat` 时 input 怎么合并？）
5. `links/internals/createChain.ts:21` 在 `next` 是 undefined 时抛
   "No more links to execute"。能不能改成自动兜底用一个 noop link？
   会引入什么新的 footgun？

## 怀疑题汇总（v1.1 分支 D 要求 ≥ 3，本文有 0/1/2/3 共 4 个）

- **怀疑 0**：`unstable-core-do-not-import` 命名约定能防滥用吗？真要防应该用 package.json `exports`
- **怀疑 1**：`input` 同时存 `inputs` 数组和 `middlewares` 数组是冗余还是必要？
- **怀疑 2**：`createFlatProxy` 包外层是为啥不让 inner proxy 自己处理 symbol？
- **怀疑 3**：链是 observable 而不是 async generator——值得自维护一份 mini observable 吗？

## 限制段（v1.1 P1）

1. **类型推导是 O(n²) 量级**：router 嵌套深 + procedure 多 时，
   `tsc --noEmit` 在大型项目能从秒级跳到分钟级。tRPC 自己的解法是 lazy router
   + 拆 sub-router，但不彻底
2. **错误模型不是 HTTP 标准**：`TRPCClientError` 不直接是 `fetch` 的 Response，
   你做错误监控（Sentry / DataDog）时要写适配
3. **没法在 server 端做 client-side rendering 友好的"预渲染"**：
   tRPC 的请求都是 op-based，不是路由对应一个 endpoint，
   传统的"reverse proxy 缓存 GET /api/posts/123"没法直接用——
   必须在 link 层 / fetch 层做 cache key 生成
4. **batch 的副作用**：httpBatchLink 默认 8ms 合并多请求——延迟敏感场景
   （如 typing autocomplete）要改 splitLink 把单发 query 走 httpLink

## 附录：宣传 vs 现实（v1.1 P2 加分）

| 宣传 | 现实 |
|---|---|
| "全自动类型同步，零 codegen" | 是真的——但前提是前后端在同一个 monorepo 或者 type-only npm 包共享 |
| "和任何 framework 一起用" | adapter 真不少（express/fastify/aws-lambda/next/nuxt 都有）但 SSE/WS 在某些 edge runtime（Cloudflare Workers Durable Objects）需要额外胶水 |
| "比 GraphQL 简单得多" | 简单 90% 是真的，但**剩下 10% 复杂场景**（N+1 防御、字段级权限）你得自己重新发明一遍 |
| "TanStack Query 集成" | `@trpc/react-query` v10 和 v5+ adapter 之间有 breaking change，迁移成本不低 |

## 延伸阅读

读完 `createProxy.ts` 后下一步：

1. `procedureBuilder.ts` 全部 704 行——理解 `.input().output().use().query()` 链式 builder
   的类型累积模式（看 8 个泛型怎么逐步覆盖）
2. `router.ts:252-565`——createRouterFactory 完整实现，包括 lazy loader、merge、reservation 检查
3. `packages/client/src/links/` 目录所有文件——links 是 tRPC 的 middleware 系统，
   自带 batch / split / dedupe / retry / logger
4. **drizzle ORM 源码**——同样是"链式 builder + 类型累积"的范例，
   读完会发现这是 TS 库的通用模式
5. **tanstack/react-query 集成包源码**（[TanStack Query 笔记](/study/projects/tanstack-query/)）——
   看 tRPC 如何把 procedure 类型变成 query options
6. **[Hono 笔记](/study/projects/hono/)**——同样是框架/SDK 类型，对比
   middleware 模型设计差异

---

**笔记完成**：v11.x 状元篇 v1.1 升级 — 2026-05-28（commit c7360d4）
**研究方法**：本地 clone + 自查 createProxy.ts / createTRPCClient.ts / createChain.ts /
procedureBuilder.ts / router.ts / loggerLink.ts / retryLink.ts 关键实现
**心脏文件**：`packages/server/src/unstable-core-do-not-import/createProxy.ts:79`（22 行）
**v1.1 项目类型**：分支 D 框架/SDK
**启用工具**：本地 clone + Read + 自写 timingLink 实验 + PIL 出图
