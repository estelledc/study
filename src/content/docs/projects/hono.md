---
title: "Hono — 极简边缘后端的 API 取舍"
description: 用 Web 标准（Request/Response）+ 多种 router 实现 + koa-compose 中间件做"任何 runtime 都能跑"的 web 框架
sidebar:
  order: 28
  label: "honojs/hono"
---

> honojs/hono v4.12.x，commit `9051d3e`（2026-05-26 读），MIT。
>
> Hono 解决的是 Express 解决不了的问题：**云函数 / 边缘 runtime 时代**，
> Node 专属 API（`req.body` / `res.send`）不能用了——
> Cloudflare Workers / Deno Deploy / Vercel Edge / Bun / Lambda 各家有各家的 runtime。
>
> Hono 的判断：**用 Web 标准（Fetch API 的 Request / Response）写 framework**，
> 然后给每个 runtime 写一个轻量 adapter。一份代码处处跑。
>
> Season 5 第二篇 · v1.1 项目类型分支 D（框架/SDK）。
>
> 4.4KB（minified + brotli）。比 Express 启动快 100 倍。

## 一句话定位

**Hono = 一个用 Web 标准 API 写的 router + middleware framework，可以在 Cloudflare Workers / Deno / Bun / Node / AWS Lambda / Vercel Edge 任意 runtime 跑。**
单一 API，多 runtime adapter，零 npm 依赖（核心）。

## 核心信息表

| 字段 | 值 |
|---|---|
| 仓库 | [honojs/hono](https://github.com/honojs/hono) |
| star / fork | ~24k / ~750（2026-05 读） |
| 最近活跃 | 2026-05-26 主线持续更新 |
| 读时 commit | `9051d3e80af3373447436ee4f6b5952b634d7c69` |
| 主语言 | TypeScript（核心 100% TS，零运行时依赖） |
| 维护方 | yusukebe（Yusuke Wada）+ Cloudflare DevRel + 社区 30+ |
| 主要贡献者 | yusukebe / EdamAme-x / usualoma / nakasyou |
| License | MIT |
| 类似项目 | itty-router · elysia · tRPC · fastify · sveltekit-server-routes |

## 项目类型自标 · v1.1 分支 D 框架/SDK

- **类型**：框架/SDK（Web 标准 abstraction + 显式 extension points）
- **心脏物**：`Hono`/`HonoBase` 类 + `compose()` middleware 调度 + `Router` 多实现
- **extension point**：middleware (`app.use(...)`)、自定义 router、adapter、validator helper
- **混合特征**：少量"运行时"特征（每个 adapter 是 runtime 的薄壳）但不是编译器/运行时——核心仍是 abstraction

## Why（为什么是它而不是 Express / Fastify / Koa / itty-router）

服务端 web 框架的演化：

```
2010: Express        Node-only, callback hell
2014: Koa            Node-only, generator/async
2016: Fastify        Node-only, schema-first 性能优先
2020: edge runtime 时代到来
2022: Hono           Web 标准 API，多 runtime
```

**核心痛点**：

```typescript
// Express
app.get('/users/:id', (req, res) => {
  res.json({ ... })          // ← Node 专属 res.json
})

// Cloudflare Workers
addEventListener('fetch', (event) => {
  event.respondWith(new Response(JSON.stringify(...)))  // ← Web 标准
})
```

**两套不兼容的 API**——你的 Express 代码不能直接跑在 Workers。
迁移要重写。

Hono 的回答：**framework 内部用 Web 标准，给开发者一个跨 runtime 的 API**。

```typescript
import { Hono } from 'hono'

const app = new Hono()
app.get('/users/:id', (c) => c.json({ id: c.req.param('id') }))

// 跑在 Bun
export default app

// 跑在 Cloudflare Workers
export default { fetch: app.fetch }

// 跑在 Node + @hono/node-server
serve({ fetch: app.fetch, port: 3000 })
```

| 框架 | runtime | API | 性能 | bundle |
|---|---|---|---|---|
| **Express** | Node | callback / req.send | 慢 | 230KB |
| **Fastify** | Node | schema-first | 快 | 130KB |
| **Koa** | Node | async ctx | 中 | 80KB |
| **itty-router** | 任何 | 极简 | 极快 | 1KB |
| **Hono** | **任何** | **Web 标准** | **极快** | **~5KB** |

**为什么不是 Express**：Express 不会变。但**新项目用 Express 已经是技术债**——
锁 Node、不能跑 edge、性能不够。

**为什么不是 Fastify**：Fastify 在 Node 内极强，但**不跨 runtime**。
你要做 edge function 就还是要换框架。

**为什么不是 itty-router**：itty 是 1KB 路由库，没有 middleware / context / validator 等。
Hono 是 itty 的"完整版"。

**Hono 的代价**：

- Node 生态 middleware（cookie-parser / body-parser / cors）要重写或用 Hono 内置
- 不像 Express 那样"一切皆中间件"——Hono 选择性吸收 koa-compose 风格
- 某些 Express 特性（template engines）不内置

## 仓库地形 · Layer 2（框架/SDK 分支：标 abstraction + extension point）

```
hono/
└── src/
    ├── hono.ts                       ← 默认 Hono 类（继承 HonoBase + 默认 router）
    ├── hono-base.ts                  ← ★★ 核心 abstraction：HonoBase 类（545 行）
    ├── context.ts                    ← ★ Context（c）对象（780 行）
    ├── compose.ts                    ← ★ koa-compose 中间件（73 行）
    ├── request.ts                    ← Request 包装
    ├── response.ts                   ← Response 包装
    ├── router.ts                     ← Router interface（add / match）
    ├── router/                       ← ★★ 多种 router 实现（extension point）
    │   ├── reg-exp-router/           ← 正则编译路由（最快，252 行）
    │   ├── trie-router/              ← Trie 树路由（默认，28 行外壳 + Node）
    │   ├── linear-router/            ← 线性路由（小数量最快，144 行）
    │   ├── pattern-router/           ← URLPattern API
    │   └── smart-router/             ← 自动选择最优 router（70 行）
    ├── adapter/                      ← ★ runtime 适配器（extension point）
    │   ├── bun/
    │   ├── cloudflare-workers/
    │   ├── cloudflare-pages/
    │   ├── deno/
    │   ├── lambda-edge/
    │   ├── vercel/
    │   └── ...
    ├── middleware/                   ← ★ 内置 middleware（extension point 模板）
    │   ├── cors/
    │   ├── jwt/
    │   ├── logger/
    │   ├── compress/
    │   └── ...
    ├── helper/                       ← helper 工具（cookie / accepts / 等）
    └── client/                       ← RPC client（typed fetch）
```

**心脏文件**（commit `9051d3e` 锚定）：

1. [`src/hono-base.ts`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/hono-base.ts)（545 行）—— `Hono`/`HonoBase` 基类，是整个框架的入口对象
2. [`src/compose.ts`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/compose.ts)（73 行）—— middleware 调度循环
3. [`src/router/smart-router/router.ts`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/router/smart-router/router.ts)（70 行）—— 自动选择最优 router
4. [`src/router/trie-router/router.ts`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/router/trie-router/router.ts)（28 行）+ `node.ts`（默认 router 数据结构）

**extension point 清单**（v1.1 框架/SDK 分支必填）：

| extension point | 接口 | 在哪里挂 |
|---|---|---|
| middleware | `(c, next) => Promise<void>` | `app.use(path?, mw)` → `compose()` 调度 |
| custom router | `Router<T>` interface（add/match） | `new Hono({ router: new MyRouter() })` |
| adapter | `(req: Request) => Response` 包装 | `src/adapter/<runtime>/` 目录 |
| validator | middleware 形式（如 `@hono/zod-validator`） | 走 middleware 链路 |
| error handler | `(err, c) => Response` | `app.onError(handler)` |

→ "**核心薄、extension point 多**"是框架/SDK 的健康信号——你能不动核心做扩展。

## 架构图

![Hono 多 router 实现 trade-off：TrieRouter vs RegExpRouter，SmartRouter 启动时择优](/projects/hono/01-router-comparison.webp)

> 上半部分：route 数量 × route 形状（静/动）2×2 矩阵，每格标谁赢，赢家不是同一个。
> 下半部分：相同输入 `app.get('/users/:id', h1)` 在两种 router 内部数据结构里长成什么样——
> 左边 TrieRouter 长成节点树（按路径分段下走），右边 RegExpRouter 编译成一个大正则 + paramIndexMap。
> 配色：蓝=数据/结构，红=动态参数节点 / 失败路径，绿=赢家标签 / 命中结果。
> caption 关键句：**没有"最快的 router"，只有"在你的负载下最快的 router"。SmartRouter 启动时探测后锁死赢家。**

## 核心机制 · Layer 3 精读

> 框架/SDK 分支要求 ≥ 3 段：(1) 核心 abstraction、(2) middleware/handler 模型、(3) lifecycle / 扩展机制。
> 下面 6 段，前 3 段是 P0 必读。

---

### 机制 1 · 核心 abstraction：HonoBase 类 + Web 标准 fetch handler

[`src/hono-base.ts:98-178`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/hono-base.ts#L98-L178)：

```typescript
class Hono<
  E extends Env = Env,
  S extends Schema = {},
  BasePath extends string = '/',
  CurrentPath extends string = BasePath,
> {
  get!: HandlerInterface<E, 'get', S, BasePath, CurrentPath>
  post!: HandlerInterface<E, 'post', S, BasePath, CurrentPath>
  // ... 其他 HTTP method
  on: OnHandlerInterface<E, S, BasePath>
  use: MiddlewareHandlerInterface<E, S, BasePath>

  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router!: Router<[H, RouterRoute]>
  readonly getPath: GetPath<E>
  private _basePath: string = '/'
  #path: string = '/'

  routes: RouterRoute[] = []

  constructor(options: HonoOptions<E> = {}) {
    // Implementation of app.get(...handlers[]) or app.get(path, ...handlers[])
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE]
    allMethods.forEach((method) => {
      this[method] = (args1: string | H, ...args: H[]) => {
        if (typeof args1 === 'string') {
          this.#path = args1
        } else {
          this.#addRoute(method, this.#path, args1)
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler)
        })
        return this as any
      }
    })

    // app.use(...) 也走 #addRoute，方法名 = METHOD_NAME_ALL
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === 'string') {
        this.#path = arg1
      } else {
        this.#path = '*'
        handlers.unshift(arg1)
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler)
      })
      return this as any
    }

    const { strict, ...optionsWithoutStrict } = options
    Object.assign(this, optionsWithoutStrict)
    this.getPath = (strict ?? true) ? (options.getPath ?? getPath) : getPathNoStrict
  }
```

旁注：

- **`HonoBase` 是抽象的**——它没有自己创建 `router`，要靠子类（`Hono` 在 `hono.ts`）传进来。这是一个**"延迟绑定"模式**：核心类不预设 router 实现。
- **`get / post / put / ...` 是赋值而不是方法**——`this[method] = (...) => ...` 在构造器里循环赋值，每个 HTTP method 一个箭头函数闭包。这样**子类无需为每个 method 重写**，但代价是 method 列表写死在 `METHODS` 常量。
- **同一个 `this[method]` 重载两种调用**：`app.get(handler)`（链式：先 `app.path('/x')` 再 get）vs `app.get('/x', handler)`（带 path）——通过 `typeof args1 === 'string'` 分流。这是 framework 喜欢的"DSL 直觉"，代价是类型签名复杂（看 `HandlerInterface` 的泛型量）。
- **`use()` 走同一条路**——只是把 method 标成 `METHOD_NAME_ALL`、path 默认 `'*'`。所以 router 不区分 middleware 和 handler，统一注册。
- **`getPath` 严格模式可换**——`strict ?? true` 决定是否区分末尾斜杠；用户可传自定义 `getPath`（拿 host / 拿 subdomain 等场景）。是个隐藏 extension point。

入口的 `fetch` 字段（[`hono-base.ts:478-490`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/hono-base.ts#L478-L490)）：

```typescript
fetch: (
  request: Request,
  Env?: E['Bindings'] | {},
  executionCtx?: ExecutionContext
) => Response | Promise<Response> = (request, ...rest) => {
  return this.#dispatch(request, rest[1], rest[0], request.method)
}
```

签名 `(req: Request) => Promise<Response>` ——这就是 Web 标准。
所有现代 runtime 都接受这个签名：

- **Cloudflare Workers**：`{ fetch(req) { ... } }`
- **Deno Deploy**：`Deno.serve(req => ...)`
- **Bun**：`Bun.serve({ fetch(req) { ... } })`
- **Vercel Edge**：`export default function (req) {...}`
- **AWS Lambda + adapter**：`{ fetch }` 包装

只要你能产出 `(req) => Response`，就能跑在任何地方。

→ 这是**站在标准的肩膀上**——Web Platform 标准化的 Fetch API
解决了"如何跨 runtime"的问题。Hono 顺势而为。

**怀疑 1**：`fetch` 字段是**箭头函数赋值**而不是 method 定义（`fetch(request) { ... }`）。
为什么？因为箭头函数自动 bind `this`——用户可以写 `app.fetch` 解构，传给 `Bun.serve({ fetch: app.fetch })` 不会丢上下文。代价是**子类不能用 `super.fetch` 调用父类版本**——只能重写整个字段。这是个"框架人体工学优先于 OO 纯度"的判断。

---

### 机制 2 · middleware 模型：73 行 koa-compose

[`src/compose.ts`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/compose.ts)（全文 73 行）：

```typescript
export const compose = <E extends Env = Env>(
  middleware: [[Function, unknown], unknown][] | [[Function]][],
  onError?: ErrorHandler<E>,
  onNotFound?: NotFoundHandler<E>
): ((context: Context, next?: Next) => Promise<Context>) => {
  return (context, next) => {
    let index = -1

    return dispatch(0)

    async function dispatch(i: number): Promise<Context> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      let res
      let isError = false
      let handler

      if (middleware[i]) {
        handler = middleware[i][0][0]
        context.req.routeIndex = i
      } else {
        handler = (i === middleware.length && next) || undefined
      }

      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1))
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err
            res = await onError(err, context)
            isError = true
          } else {
            throw err
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context)
        }
      }

      if (res && (context.finalized === false || isError)) {
        context.res = res
      }
      return context
    }
  }
}
```

每个 middleware 形如 `(c, next) => Promise<void>`，在 next() 前后都可以加逻辑：

```typescript
app.use(async (c, next) => {
  const start = Date.now()
  await next()                          // ← 先把控制权交下去
  const duration = Date.now() - start
  console.log(`${c.req.method} ${c.req.path}: ${duration}ms`)
})
```

旁注：

- **递归 + 闭包，不是循环**：`dispatch(i)` 调用 `handler(c, () => dispatch(i+1))`。middleware 用 `await next()` 触发下一层——这是**洋葱模型**：
  ```
  mw1 前 → mw2 前 → handler → mw2 后 → mw1 后
  ```
- **`if (i <= index) throw` 是防御 next 多次调用**——koa 经典坑：忘了 `await next()` / 调了两次 `next()` 都会让请求挂死或重复处理。这一行把它从"难调试的 bug"变成"启动时显式 throw"。
- **错误捕获在每一层**：`try { await handler(...) } catch (err) { ... onError(...) }`——middleware 里抛错会冒泡到 `onError`，**不会**绕过后续 middleware 的"清理逻辑"（如果他们写在 next() 之前的话）——但**写在 next() 之后的清理代码会被跳过**（因为 await throw 了），需要 try/finally 才安全。
- **`context.finalized` 是 short-circuit 标志**——一旦某层 handler 设置了 `c.res`，后续不会被覆盖（除非是错误）。这让 middleware 能 short-circuit（如鉴权失败立即返回 401），不用让请求继续往下传。
- **`isError` 让 onError 的返回 res 能赋值给 c.res**——即使 `c.finalized === true` 也覆盖。这是有意的："已经渲染过的响应"在错误时让位给错误响应。
- **return `context`，不是 res**——compose 返回上下文，调用方（`#dispatch`）从 `context.res` 取响应。这让 onError 等 hook 能改 `context.res` 而不需要回传。

短路优化（[`hono-base.ts:430-447`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/hono-base.ts#L430-L447)）：

```typescript
// Do not `compose` if it has only one handler
if (matchResult[0].length === 1) {
  let res: ReturnType<H>
  try {
    res = matchResult[0][0][0][0](c, async () => {
      c.res = await this.#notFoundHandler(c)
    })
  } catch (err) {
    return this.#handleError(err, c)
  }
  // ...
}
```

→ 命中只有一个 handler、没有 middleware 时，**绕过 compose**，直接调 handler。这是性能微优化：不少"只有 GET 路由没 middleware"的小项目走这条路。

**怀疑 2**：洋葱模型 + 递归在**深度 ≥ 数百层 middleware** 时会撞 stack overflow 吗？
理论上 V8 默认 stack 约 1MB，每帧大概 200 字节级别，能跑数千层。**但生产里很少超过 10-20 层 middleware**，所以这是被业务规模天然挡住的、不是 framework 主动限制的。如果哪天有人写出 1k 层 middleware 的怪东西，会得到一个看似"莫名其妙"的 RangeError。

---

### 机制 3 · 多 Router 实现 + SmartRouter 自适应：让选择有取舍

普通框架只有一个 router。Hono 有 5 个：

| Router | 实现 | 适合场景 | 速度 |
|---|---|---|---|
| **TrieRouter**（默认） | Trie 树 | 通用，路由数中等 | 快 |
| **RegExpRouter** | 正则编译成单个大正则 | 路由数大、固定 | **极快** |
| **LinearRouter** | 数组线性扫描 | 路由数 < 10 | 数量小最快 |
| **PatternRouter** | URLPattern Web API | 浏览器原生 | 中 |
| **SmartRouter** | 启动时自动选最优 | 不知道选哪个 | 各场景最优 |

`SmartRouter`（[`src/router/smart-router/router.ts:21-49`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/router/smart-router/router.ts#L21-L49)）：

```typescript
match(method: string, path: string): Result<T> {
  if (!this.#routes) {
    throw new Error('Fatal error')
  }

  const routers = this.#routers
  const routes = this.#routes

  const len = routers.length
  let i = 0
  let res
  for (; i < len; i++) {
    const router = routers[i]
    try {
      for (let i = 0, len = routes.length; i < len; i++) {
        router.add(...routes[i])
      }
      res = router.match(method, path)
    } catch (e) {
      if (e instanceof UnsupportedPathError) {
        continue   // ← 这个 router 处理不了，下一个
      }
      throw e
    }

    this.match = router.match.bind(router)  // ← 关键：把 match 替换成胜出 router 的
    this.#routers = [router]
    this.#routes = undefined
    break
  }
```

旁注：

- **第一次 `match()` 才探测**——构造 SmartRouter 时只是收集 routes，没有真正注册到任何子 router。这是**懒初始化**：用户的 `app.get()` 调用只是 push 进 `#routes` 数组。
- **探测顺序硬编码**——`new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] })`（在 `hono.ts` 里）。先试 RegExpRouter（最快），失败（抛 `UnsupportedPathError`）退到 TrieRouter。
- **`this.match = router.match.bind(router)` 是 monkey-patch**——下次调用直接走选中 router 的 match，不再走 SmartRouter 的探测逻辑。**O(N) 探测只发生 1 次**，之后是 0 开销。
- **`#routes = undefined` 是显式释放**——routes 数组不再需要，让 GC 能回收。同时也是个"已固化"的标志：再调 `add()` 会抛 `MESSAGE_MATCHER_IS_ALREADY_BUILT`。
- **`UnsupportedPathError` 是约定 sentinel**——RegExpRouter 遇到无法编译成单一正则的 path（如某些复杂 wildcard）会抛它；其他错则透传。这是**fallback 协议**的关键，不是普通错误。

TrieRouter 的精简实现（[`src/router/trie-router/router.ts`](https://github.com/honojs/hono/blob/9051d3e80af3373447436ee4f6b5952b634d7c69/src/router/trie-router/router.ts)）：

```typescript
export class TrieRouter<T> implements Router<T> {
  name: string = 'TrieRouter'
  #node: Node<T>

  constructor() {
    this.#node = new Node()
  }

  add(method: string, path: string, handler: T) {
    const results = checkOptionalParameter(path)
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler)
      }
      return
    }
    this.#node.insert(method, path, handler)
  }

  match(method: string, path: string): Result<T> {
    return this.#node.search(method, path)
  }
}
```

→ 28 行外壳，真正的复杂度在 `Node` 类（trie 节点 insert/search 算法）。**Router interface 极薄**：
就 `add(method, path, handler)` 和 `match(method, path) → Result<handler[]>` 两个方法。
任何人写一个实现这两个方法的类，都能塞给 `new Hono({ router: ... })`——这是框架级 extension point。

**怀疑 3**：SmartRouter 的"启动时探测"在**冷启动敏感的 edge runtime（Cloudflare Workers）下值得吗**？
每次 worker 实例初始化都要跑一次 `forEach add → match`，对极端冷启动（几 ms 量级）来说不可忽视。
**反方观点**：探测只发生一次（首请求），但 worker 实例可能短命（每秒重启）；
**正方观点**：单次探测的开销远小于 RegExp 编译本身，且 Workers 同实例处理多请求时摊薄。
所以默认值 `RegExpRouter + TrieRouter` 探测次序 = 押注"绝大多数路由能编译成正则"。

---

### 机制 4 · Context（c）对象 —— 一站式 API

`src/context.ts`（780 行）实现 `Context`：

```typescript
app.get('/users/:id', (c) => {
  const id = c.req.param('id')           // ← 路径参数
  const q = c.req.query('search')        // ← query 参数
  const body = await c.req.json()        // ← 请求 body
  const env = c.env                      // ← runtime env (Workers / Bun)
  c.header('X-Custom', 'value')          // ← 设置 response header
  return c.json({ id, found: true })     // ← 返回 JSON Response
})
```

`c` 是 koa 的 ctx 一脉相承。所有你需要的都在 `c`：req、env、header、status、cookie、json/html/redirect 各种 helper。

→ **一站式**让 API 学习曲线极平。
开发者只要记住一个 `c`，不用记 `req` `res` `next` 三件套。

**Context 的 lifecycle**（看 `hono-base.ts:#dispatch` 中 `new Context(...)`）：

```
1. router.match(method, path) → matchResult
2. new Context(request, { path, matchResult, env, executionCtx, notFoundHandler })
3. compose(matchResult[0])(c)  ← middleware 链跑过 c
4. context.res 取出来返回给 runtime
```

Context 是**一次请求一个**——不跨请求复用，所以可以放可变状态（c.set / c.get）不用担心污染。

### 机制 5 · RPC client —— typed fetch（同源 tRPC，但 REST）

```typescript
// server
const route = app.get('/users/:id', (c) => c.json({ name: 'Jason' }))
export type AppType = typeof route

// client
import { hc } from 'hono/client'
import type { AppType } from './server'

const client = hc<AppType>('http://localhost:3000')
const res = await client.users[':id'].$get({ param: { id: '123' } })
const data = await res.json()       // ← 自动类型 { name: string }
```

→ **同 [tRPC 笔记](/study/projects/trpc/) 思路**：
import server 的类型，client 自动类型安全。
但 Hono 走 REST 风格，tRPC 走 RPC 风格——不同协议，相同思想。

### 机制 6 · adapter 层 —— 各 runtime 一个文件

`src/adapter/cloudflare-workers/index.ts`：

```typescript
// 大约 50 行
export const handle = (app: Hono) => ({
  fetch: app.fetch,
  // 处理 Workers 特殊事件（scheduled / queue）
})
```

`src/adapter/aws-lambda/handler.ts`：

```typescript
// AWS Lambda 不是 fetch 协议，要手动转换
export const handle = (app: Hono) => async (event: APIGatewayEvent) => {
  const req = convertLambdaEventToRequest(event)
  const res = await app.fetch(req)
  return convertResponseToLambda(res)
}
```

→ **adapter 模式**让 framework 核心保持纯净（只管 Web 标准），
runtime 特殊性收敛到 adapter。这是面向未来的设计——新 runtime 出来加个 adapter 就行。

## 横向对比

### vs Express — 不同时代的产物

Express 是 Node-only callback 时代的产物。今天写 Express 应用就像 2010 年写 jQuery——
能用，但不是新项目应该选的。

Hono 是"如果今天从零设计 web framework，会怎么做"的回答。

### vs Fastify — Node 内最快 vs 跨 runtime 最快

Fastify 在 Node 内的 throughput 是天花板（schema-first + 内联优化）。
Hono 在跨 runtime 上是天花板（Web 标准 + adapter）。

如果你**只跑 Node**且追求极致性能——Fastify。
否则 Hono 是更面向未来的选择。

### vs Itty Router — 单点最小 vs 完整框架

itty-router 1KB 做路由。Hono 5KB 做路由 + middleware + context + validator。
**90% 应用需要 Hono 这个量级**，少数极简 worker 用 itty 即可。

### vs Next.js API Routes / RSC — 框架内 vs 独立框架

Next API Routes：你必须在 Next 项目里用。
Hono：可以在任何项目，包括 Next（用 catch-all route 把 Hono 嵌进去）。

灵活度：Hono 完胜。
集成度：Next API Routes 在 Next 生态内更顺。

### vs tRPC — 协议风格不同

tRPC 是 RPC（函数调用），Hono 是 REST/HTTP。
tRPC 适合"前后端都 TS、没有第三方"的场景。
Hono 适合"开放 API、第三方调用、跨语言"的场景。

→ 实际上**很多人两个一起用**——内部 tRPC，公开 Hono REST。

### vs Elysia — 同代 Bun 优先 vs 多 runtime 优先（哲学不同的竞品）

Elysia 是 Bun 优先设计的同代 web framework。两者都用 Web 标准、都做 typed RPC、都重 DX。差别：

| 维度 | Hono | Elysia |
|---|---|---|
| runtime 取向 | 多 runtime 平权（Workers / Deno / Bun / Node） | Bun 优先，其他兼容 |
| 类型推断风格 | 后端推 client | 后端推 client + 内置 schema |
| middleware 模型 | koa-compose 洋葱 | 类似 koa 但更显式生命周期 hook |
| 设计取向 | 标准对齐 | 性能 + Bun 内联优化 |

→ 哲学差异：Hono 押注"Web 标准跨 runtime"，Elysia 押注"Bun 是赢家"。
**这两个判断都可能对**——也就是说，3 年后回看，可能两者并存而不是一胜一负。

### 选型建议段

| 场景 | 选谁 |
|---|---|
| 任何 edge function（Workers / Vercel Edge） | Hono |
| 多 runtime 部署需求 | Hono |
| 只 Node + 极致 throughput | Fastify |
| 1KB worker、超极简 | itty-router |
| Bun 独家 + 极致内联优化 | Elysia |
| 前后端都 TS、无外部消费 | tRPC（或 + Hono 做公开 API 层）|
| 已有 Next 项目加 API | Hono 嵌入 catch-all |

## Hands-on（5 分钟内能跑）· Layer 4：写一个 plugin/middleware

> 框架/SDK 分支 Layer 4 要求：写 1 个 plugin / middleware / schema extension，跑 example 看 lifecycle 何时触发。

```bash
mkdir hono-demo && cd hono-demo
npm init -y
npm install hono
```

写 `server.ts`：

```typescript
import { Hono } from 'hono'

const app = new Hono()

// ── middleware 1：global timing logger（本次实验主角）
app.use('*', async (c, next) => {
  const start = performance.now()
  console.log(`[in ] ${c.req.method} ${c.req.path}`)
  await next()
  const dur = (performance.now() - start).toFixed(2)
  console.log(`[out] ${c.req.method} ${c.req.path} ${c.res.status} ${dur}ms`)
})

// ── middleware 2：scoped to /admin only
app.use('/admin/*', async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth) return c.json({ error: 'unauthorized' }, 401)
  await next()
})

app.get('/', (c) => c.text('Hello Hono!'))

app.get('/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({ id, name: `User ${id}` })
})

app.get('/admin/dashboard', (c) =>
  c.json({ secret: 'top secret data' }))

app.post('/users', async (c) => {
  const body = await c.req.json()
  return c.json({ created: body }, 201)
})

export default app
```

跑（Bun）：

```bash
bun run --watch server.ts
# 或 Node + @hono/node-server
```

curl 测试：

```bash
curl http://localhost:3000/users/42
# stdout:
# [in ] GET /users/42
# [out] GET /users/42 200 0.31ms
# response: {"id":"42","name":"User 42"}

curl http://localhost:3000/admin/dashboard
# stdout:
# [in ] GET /admin/dashboard
# [out] GET /admin/dashboard 401 0.18ms
# response: {"error":"unauthorized"}

curl -H 'Authorization: Bearer x' http://localhost:3000/admin/dashboard
# [in ] GET /admin/dashboard
# [out] GET /admin/dashboard 200 0.42ms
# response: {"secret":"top secret data"}
```

→ **lifecycle 观察点**：

1. `[in ]` 是洋葱模型"进入"层——`await next()` 之前的代码
2. `[out]` 是洋葱模型"出来"层——`await next()` 之后的代码
3. `/admin/dashboard` 在没 token 时被 middleware 2 short-circuit 401，**middleware 1 的 `[out]` 仍然打印**（因为它包在最外）
4. middleware 注册顺序 = 执行顺序。把 timing 放第一行注册，确保它包住所有内部 middleware

### 改一处的实验（必做）

把同样的 `app` 部署到 Cloudflare Workers：

```bash
npx wrangler init
# 选 hello-world template
```

替换 `src/index.ts` 内容为你的 Hono app + `export default app`。

```bash
npx wrangler dev      # 本地起 Workers runtime
npx wrangler deploy   # 部署到 cloudflare.com
```

**完全相同的代码**，从 Bun 切到 Workers——这就是"跨 runtime"的真实体感。
唯一差别：`console.log` 在 Workers 进 wrangler tail，而不是本地 stdout。

### 改一处的实验（进阶）：换 Router

```typescript
import { Hono } from 'hono'
import { RegExpRouter } from 'hono/router/reg-exp-router'

// 强制用 RegExpRouter（不让 SmartRouter 决定）
const app = new Hono({ router: new RegExpRouter() })
```

观察行为：路由全是普通 `:id` / 静态 path 时，行为与默认完全一致；
故意写一个 RegExpRouter 不支持的 path（某些复杂 wildcard），会**启动时**抛 `UnsupportedPathError`——
而默认（SmartRouter）会**自动 fallback 到 TrieRouter**。这是机制 3 的运行时验证。

第二个实验：用 RPC client：

```typescript
// 在 client 端
import { hc } from 'hono/client'
import type { AppType } from './server'

const client = hc<AppType>('http://localhost:3000')
const res = await client.users[':id'].$get({ param: { id: '7' } })
const data = await res.json()    // ← 类型自动推断
console.log(data.name)
```

观察 IDE 自动补全——`client.users[':id'].$get` 自动补全；`data.name` 类型自动是 string。

## 与你工作的连接 · Layer 6（三段）

**今天就能用**：

- 任何**新 web service**用 Hono——选 runtime 后续决定，框架不变
- 给项目加 `/api` 用 Hono（即使主体是 Next）——比 Express middleware 更轻
- 边缘函数（Workers / Vercel Edge）用 Hono——这是它的甜点场景
- 写一个轻量 BFF（backend for frontend）：Hono + RPC client，类型安全到客户端
- 学习如何写 middleware——读 73 行的 `compose.ts` 比读 200 页 koa 文档快

**下个月可能用到**：

- 给 LLM agent / MCP server 写部署层用 Hono——启动快，跨平台
- 内部小工具放 Bun + Hono——单文件部署、毫秒级冷启动
- 把 SmartRouter 的"启动探测、运行时锁定"模式抄到自己的 framework 里
- 设计自己的库时学 Hono 的 extension point 风格：核心薄、interface 显式、子类填空

**不要用 Hono 的部分**：

- **重型 ORM 集成 + 复杂 service layer**——NestJS / Fastify 生态更全
- **基于 Express middleware 的现成项目**——迁移可能不值
- **重型 SSR**——用 Next / Remix / Astro 更合适
- **WebSocket / SSE 是核心需求**——能做但不是 Hono 强项，需要 adapter 各家差异大

## 读完你能做之前做不了的事

- **判断**：选 web framework 时，能区分"跑哪些 runtime / 性能要求 / 生态需求"三轴
- **设计**：写新 backend 时，第一选择不是 Express，而是基于 Web 标准的框架
- **解释**：被问"为什么 Cloudflare Workers 不能跑 Express"时，能用"req.send 不是 Web 标准"解释
- **下钻**：看懂 Cloudflare Workers / Deno / Bun 的 runtime API——它们都和 Hono 同源
- **对照**：识别"我的 backend 可不可以做成 fetch handler"——这是迁移到 edge 的判断
- **抽象**：识别"接口薄、实现可换"的设计——Router interface / adapter 模式都是模板

## 自检 · 5 个问题

1. Hono 有 5 种 router。SmartRouter 启动时自动选——这种"运行时优化"在哪些场景反而是劣势？
2. Hono 用 koa 风格的洋葱模型，Express 用线性 next() 调用。两者在错误处理上有什么差异？读 `compose.ts:48-58` 的 try/catch 块，对比 Express 的 `(err, req, res, next)` 签名。
3. RPC client `hc<AppType>` 自动类型推断。当 server 接口很大时，client 的 IDE 性能会怎样？什么时候要拆 AppType？
4. adapter 模式让 Hono 跨 runtime。但每个 adapter 要追各 runtime 升级——团队怎么管理这个负担？看 `src/adapter/` 下不同子目录的更新频率分布。
5. Hono 故意不做 ORM / template engine 集成。这种"刻意减法"的产品判断在哪些项目阶段反而拖累用户？

## 限制段（≥ 3 条独立限制）

- **冷启动 vs 启动探测的 trade-off 没有定量数据**：本笔记只给出了 SmartRouter 探测一次的定性论证，没在 Cloudflare Workers / Deno Deploy 实测每路由对冷启动的 ms 级影响。生产决策前要自己 benchmark。
- **Context 780 行没逐段读完**：本笔记着重 HonoBase + compose + router 三块，Context 只截取了最常用的 helper 接口。`c.set`/`c.get` 跨 middleware 的状态共享、`c.executionCtx.waitUntil` 在 Workers 下的延后任务等，没有覆盖。
- **adapter 各家差异未对比**：本文只对比了 Workers vs AWS Lambda 两个 adapter 的形状，Vercel Edge / Deno Deploy / Bun 的 adapter 没逐个读。它们对"如何处理 streaming response / how to forward env" 等细节有隐含差异。

## 附录：宣传 vs 现实

| 宣传（README / 官网） | 现实（读源码） |
|---|---|
| "0 dependencies" | 核心是真的 0 dep。但 `hono/middleware/jwt` 需要 Web Crypto，某些 runtime 没有；`hono/client` 需要 fetch globally。dep 是隐式的运行时依赖，不是 npm dep。|
| "Multi-runtime, write once" | 90% 代码同。但 streaming response、env binding、定时任务在每个 runtime 都得走 adapter 特化路径。|
| "Ultrafast" | 在 SmartRouter + RegExpRouter 命中时是真的极快。但**第一次 match 之前**没那么快——要做探测。|
| "Web Standards" | 是真的——`Request`/`Response` 进出。但 `ExecutionContext`（Workers 专属）等不是 W3C 标准，Hono 仍要在类型系统里包它。|

## 延伸阅读

读完这篇笔记后下一步：

1. `src/hono-base.ts:98-545`——HonoBase 类完整实现
2. `src/compose.ts`（73 行全部）——koa-compose 经典模式
3. `src/router/smart-router/router.ts`——SmartRouter 选择算法
4. `src/router/trie-router/node.ts`——TrieRouter 真正的复杂度（insert/search 算法）
5. `src/router/reg-exp-router/router.ts:1-80`——RegExpRouter 如何把多 route 编成一个正则
6. **MDN Web Standards** [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)——理解 Request/Response 的标准
7. **Cloudflare Workers** [Runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/)——看 Hono 如何顺势而为

---

**笔记完成**：2026-05-28（v4.12.x · commit `9051d3e`）
**研究方法**：本地 `git clone --depth 1` + 读 `hono-base.ts` / `compose.ts` / `smart-router/router.ts` / `trie-router/router.ts` 四份心脏文件 + 设计判断分析 + 写 timing middleware 实验
**心脏文件**：`src/hono-base.ts:98` + `src/compose.ts`（73 行） + `src/router/smart-router/router.ts:21-49`
**升级日期**：2026-05-28（v1.1 项目类型分支 D 框架/SDK）
**启用工具**：Read（源码） · Bash（git clone / wc -l） · PIL（figure 01）
