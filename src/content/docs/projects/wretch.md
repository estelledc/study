---
title: wretch — fluent FP fetch wrapper
来源: https://github.com/elbywan/wretch + 作者主页 elbywan.github.io + npm wretch 主包及 wretch/* 中间件家族
---

# wretch — 把 fetch 写成链子

## 一句话总结

wretch 是 Julien Poissonnier（GitHub @elbywan）从 2017 年起一手维护的小型 fetch wrapper，到 2024 年迭代到 v2.x。它和这门课里其他几个 fetch 包装最大的差别就两点：**fluent FP 风格**（`wretch(url).auth(...).query(...).get().json<T>()`，链式而不是 config object）+ **immutable wrapper**（链上每一步都返回一个全新的 wrapper 实例，不在原对象上 mutate）。bundle 体积压到 ~5 KB min+gzip，比 ofetch（~7 KB）和 axios（~17 KB）都小，和 ky（~4 KB）几乎一个量级。

设计哲学一句话：**把 fetch 当编译目标，把链式调用当 DSL**。每个方法不是"修改请求"，而是"声明一段意图"，所有意图收齐后由最末端的动词（`.get()` / `.post()` / `.put()`）实际触发网络调用。这种风格在 functional 阵营里很常见——RxJS 的 `pipe`、lodash 的 `chain`、Knex 的 query builder——但放在 fetch 这种"已经够简单"的领域里就显得有点反直觉，所以是不是过度设计是后面要专门追问的事。

bundle ~5 KB 这件事不是免费的：wretch 把 retry / dedupe / cache / abort / progress / perfs 这些**全部拆成独立的 middleware 包**（`wretch/middlewares/retry`、`wretch/middlewares/dedupe`、…），核心包不带任何"业务策略"。开发者只为自己用到的 middleware 付出 bundle。这个"核心薄 + 中间件按需"的拆法和 axios（一个大包带所有 interceptor）正好相反，和 koa 的 middleware 模型反而更像。

wretch 的目标用户：

- 写 vanilla JS / 小型项目，不想引入 axios 但又嫌 native fetch 啰嗦
- 喜欢 functional / chain API（来自 ramda / RxJS / lodash 阵营）
- 浏览器和 Node 都要跑，且关心冷启动 / 首屏 bundle

非目标用户：

- 已经在用 React Query / SWR / TanStack Query 的项目（fetch 层已经被 React 状态层包了一层，wretch 的 status-specific handler 反而冗余）
- Nuxt / Nitro 项目（直接用 ofetch，框架已经默认集成）
- 只想要"axios DX"但不想要包大小（用 ofetch，DX 接近且 bundle 减半）

> 怀疑：wretch 这种 fluent FP 设计在 TypeScript 时代是不是过度设计？方法链长起来之后，IDE 提示反而不如 axios 的 config object（一个大对象一目了然，IDE hover 一次看全所有可填字段）清晰。后面 Layer 4 会专门对照。

![wretch fluent chain](/projects/wretch/01-fluent-chain.webp)

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `wretch` |
| 当前主版本 | 2.x（自 2023 起稳定） |
| 首版 | 2017-08（v0.x） |
| 1.0 | 2018 年中 |
| 2.0 | 2023 年（modular middleware + 类型重构） |
| License | MIT |
| 主仓库 | elbywan/wretch |
| 作者 | Julien Poissonnier（@elbywan，独立维护者） |
| 维护风格 | 个人项目，PR 接得相对慢但稳定 |
| TypeScript | 100%，第三方 generic 推断响应 |
| Bundle 大小 | ~5 KB min+gzip（核心） |
| Tree-shake | 友好（pure ESM，CJS 双发） |
| Runtime 依赖 | 0（核心包） |
| Middleware 依赖 | 各自独立子包 `wretch/middlewares/*` |
| 浏览器 | ✓ |
| Node | ≥ 14（≥ 18 用原生 fetch） |
| Deno / Bun / CF Worker | ✓（基于 fetch 标准） |
| Weekly downloads | ~250k（2026） |
| GitHub stars | ~4k |
| 商业版 | 无 |
| 文档站 | elbywan.github.io/wretch |
| 主要文件 | src/core.ts / src/middleware.ts / src/resolver.ts / src/utils.ts / src/types.ts |
| 与 axios 关系 | API 哲学相反（fluent vs config object） |
| 与 ky 关系 | 体积接近，但 wretch 多 status-specific handler |
| 与 ofetch 关系 | ofetch 是函数式 + Nuxt 集成，wretch 是 fluent + 中立 |
| 测试 | jest + msw（mock service worker） |
| 发布频率 | 季度 minor / 月度 patch |
| Breaking changes | 1.x → 2.x 重写过 middleware 接口；2.x 内 semver |

到这一层我至少能回答三个问题：是谁在维护、用什么思路、bundle 多大。下一层往下钻"思路"。

## Layer 1 — 核心抽象：fluent chain + middleware

wretch 的核心抽象就两个：**Wrapper** 和 **Middleware**。

### 1. Wrapper（fluent immutable wrapper）

`wretch(url, opts?)` 返回一个 Wrapper 对象。Wrapper 上挂了一堆方法，分成三组：

- **配置组**（返回新 Wrapper）：`.url()` `.options()` `.headers()` `.auth()` `.content()` `.accept()` `.body()` `.formData()` `.json()` `.query()` `.middlewares()` `.errorType()`
- **动词组**（触发请求，返回 ResponseChain）：`.get()` `.post()` `.put()` `.patch()` `.delete()` `.head()` `.opts()` `.fetch()`
- **catcher 组**（在动词之前注册，错误时回调）：`.catcher(status, fn)` `.catcherFallback(fn)`

每次调用配置组方法，wretch **不修改 this**，而是 new 一个新的 Wrapper 实例（拷贝旧的 `_url` / `_options` / `_config` / `_middlewares` / `_addons`，再叠加这次的改动）。这就是"immutable wrapper"的含义。

为什么要 immutable？三个理由：

1. **共享基础配置**——`const api = wretch("/api").auth(token);` 之后，`api.get("/users")` 和 `api.post("/posts", body)` 互不影响。如果 mutate，第一次 `.url("/users")` 就把基础 wrapper 改坏了，第二次得 `wretch(...)` 重来。
2. **链式可读**——`.auth().query().headers()` 三步如果是 mutate，IDE 看到的还是同一个对象，类型不会随调用改变；immutable 配合 generic，每一步类型都能精确演化（比如调用 `.json<User>()` 之后类型变成 `Promise<User>`）。
3. **测试友好**——同一个根 wrapper 可以在多个测试用例里复用，不用担心上一个用例污染状态。

> 怀疑：immutable 的代价是每次链式调用都 new 一个对象。一个典型请求 6 步链 = 6 个 wrapper 对象，5 个用完就被 GC。在 hot loop（比如批量发 1000 个请求）里，这个分配压力是不是值得？看代码里有没有对象池 / 复用的优化痕迹是 Layer 3 段 a 要查的事。

### 2. Middleware（resolver pipeline）

wretch 的 middleware 不是"在请求前后插钩子"那种简化版，而是一个真正的 **resolver pipeline**：

```ts
type Middleware = (next: FetchLike) => FetchLike;
type FetchLike  = (url: string, opts: WretchOptions) => Promise<WretchResponse>;
```

每个 middleware 接收"下一段 fetch 函数"，返回"加了自己逻辑的新 fetch 函数"。这个签名就是 koa / Express middleware 的精神，但比它们更纯——没有 `ctx` 这个共享状态，也没有 `next()` 调用语义陷阱（必须 await，否则错乱），全靠函数返回值。

社区维护的 middleware：

| Middleware | 作用 | bundle |
|---|---|---|
| `retry` | 失败重试，可配指数退避 / 状态码白名单 | ~0.6 KB |
| `dedupe` | 同 url + method + body 的并发请求合并成一个 | ~0.4 KB |
| `throttlingCache` | 同 url 在 N ms 内复用响应 | ~0.5 KB |
| `abort` | AbortController 注入，可批量取消 | ~0.4 KB |
| `progress` | 上传 / 下载进度回调 | ~0.5 KB |
| `delay` | 调试用故意延迟 | ~0.1 KB |
| `perfs` | 接 PerformanceObserver，拿到 timing | ~0.3 KB |

注意每一个都是单独的 import path（如 `import { retry } from "wretch/middlewares/retry"`），开发者只为自己用到的部分付 bundle。这是 wretch ~5 KB 核心保持瘦的关键工程决策。

> 怀疑：middleware 拆成独立子包好处明显，但代价是用户得自己拼装。新人第一次想"加个 retry"得知道：(1) 装哪个子模块？(2) middleware 顺序是什么？(3) 和 catcher 配合谁先谁后？这种"小学时间"的认知成本在 axios（一个 interceptor API 包打全部）那里就不存在。

### 3. Catcher（错误分发）

wretch 的错误处理走 **status-specific handler**：

```ts
wretch("/api/user/1")
  .get()
  .notFound(() => null)         // 404 → null
  .unauthorized(() => login())  // 401 → 走登录
  .forbidden(() => logout())    // 403 → 强制登出
  .error(500, () => retry())    // 自定义状态
  .json<User>();
```

`.notFound` / `.unauthorized` / `.forbidden` / `.badRequest` / `.timeout` / `.internalError` 都是预定义的 helper，本质上是 `.error(status, fn)` 的语法糖。这种"按 status 分发"的姿态很 80 年代——把 HTTP status 当成业务异常处理的第一公民。

> 怀疑：在现代 React 项目里，错误码已经被 React Query / SWR 抽到了 query.error 上统一处理，组件层基本不直接关心 status。wretch 这种 status-specific handler 是不是冗余？特别是 401 这种"全局拦截 + 跳登录"的需求，放 fetch wrapper 层做反而和路由 / 状态管理耦合。这个问题 Layer 3 段 c 会拿真实代码追。

## Layer 2 — 内部架构：immutable wrapper + middleware 链

把 Layer 1 的两个抽象拼起来，得到 wretch 内部的骨架：

```
Wrapper (immutable)
  ├─ _url:        string                  ← base URL + path
  ├─ _options:    RequestInit             ← method / headers / body / signal
  ├─ _config:     WretchConfig            ← errorType / catchers / polyfills
  ├─ _addons:     WretchAddon[]           ← 类似 plugin，扩展方法
  ├─ _middlewares: Middleware[]           ← resolver pipeline
  └─ _deferred:   ((w: Wrapper) => Wrapper)[]  ← 延迟绑定（registerCatcher 等）

Verb call (.get / .post / ...)
  └─ resolver(url, options)
        ├─ apply middlewares: [m1, m2, ...mn]
        │     wrap from outside in:
        │     m1(m2(m3(... mn(fetch) ...))).call(url, options)
        └─ return ResponseChain
              ├─ chained handlers: .json() / .text() / .blob() / .arrayBuffer() / .formData()
              ├─ status helpers: .notFound() / .unauthorized() / ...
              └─ error fallback: .error() / .res()
```

整个数据流：

```
[user]                                                    [server]
  │                                                          ▲
  │ wretch(url)                                              │
  ▼                                                          │
[Wrapper#0]                                                  │
  │ .auth(token)                                             │
  ▼                                                          │
[Wrapper#1]  ──→  .query({page: 1})                          │
  │                                                          │
  ▼                                                          │
[Wrapper#2]  ──→  .headers({"X-A": "v"})                     │
  │                                                          │
  ▼                                                          │
[Wrapper#3]  ──→  .get()                                     │
  │                                                          │
  ▼                                                          │
[resolver]                                                   │
  │ middlewares.reduceRight((next, mw) => mw(next), fetch)   │
  ▼                                                          │
[ retry → dedupe → cache → fetch ] ───────────────────────── ↑
  │
  ▼
[ResponseChain]
  │
  │ .json<User>()
  ▼
[Promise<User>]
```

这张图里有几个值得注意的点：

1. **Wrapper#0..#3 是 4 个不同对象**，#0..#2 在 await 之前就已经 GC eligible（被链式覆盖），#3 是真正发起请求的那个。
2. **resolver 的 reduceRight 顺序**——middleware 数组 `[A, B, C]` 实际执行顺序是 `A → B → C → fetch → C → B → A`（洋葱模型，和 koa 一样）。这意味着用户配置 `[retry, cache]` 和 `[cache, retry]` 行为完全不同——前者是"先尝试缓存，未命中时再交给重试逻辑去打 fetch"，后者是"先重试 fetch，每次重试都查缓存"。这种顺序敏感性是 middleware 系统通病。
3. **ResponseChain 是另一个对象**，不是 Promise——它返回 thenable，但本身有 `.json()` `.text()` `.notFound()` 等同步方法。这就是为什么可以写 `.get().notFound(...).json<User>()`：在最终 `.json()` 触发 await 之前，整个链子都是同步配置 ResponseChain 的过程。

> 怀疑：ResponseChain 表面像 Promise（可以 await），实际是个 thenable 包装。在 TypeScript 严格模式 + ES2022 await 语法下，这种"假 Promise"会不会和真 Promise 在异常传播 / unhandledrejection 上有微妙差异？这个问题不查源码不敢下结论。

## Layer 3 — 精读 3 段

> 下面的 GitHub 链接都标"链接示意"，hash 是 wretch 主仓库历史 commit 的样子，目的是说明指向哪一段；具体行号以读者点开链接时的最新 main 为准。

### 段 a：fluent immutable chain（每一步 new Wrapper）

**链接示意**：[`https://github.com/elbywan/wretch/blob/3a7c1e2bd4f9a8b6c5d2e1f0a9b8c7d6e5f4a3b2/src/core.ts`](https://github.com/elbywan/wretch/blob/3a7c1e2bd4f9a8b6c5d2e1f0a9b8c7d6e5f4a3b2/src/core.ts)

`core.ts` 里 Wrapper 的核心方法长这样（结构示意，非逐字）：

```ts
function factory(_url: string, _options: WretchOptions, _config: WretchConfig): Wrapper {
  return {
    _url, _options, _config,

    url(path: string, replace = false): Wrapper {
      const next = replace ? path : (this._url + path);
      return factory(next, this._options, this._config);   // ← new Wrapper
    },

    headers(h: Record<string, string>): Wrapper {
      return factory(
        this._url,
        { ...this._options, headers: { ...this._options.headers, ...h } },  // ← 浅拷贝
        this._config
      );
    },

    auth(value: string): Wrapper {
      return this.headers({ Authorization: value });   // ← 复用 headers
    },

    get(url = ""): ResponseChain {
      const w = url ? this.url(url) : this;
      return resolver(w, "GET");                        // ← 触发 resolver
    },

    // ... 其他动词同理
  };
}
```

**旁注 1（factory 工厂模式）**：每个配置方法返回 `factory(...)` 的新返回值，而不是 `new Wrapper(...)`。class 改成 factory 函数有两个好处：(1) 不暴露 prototype，攻击面小；(2) tree-shake 时未用到的方法可以更精确删除（class 方法都挂在 prototype 上很难按需 drop）。

**旁注 2（浅拷贝层级）**：注意 `headers` 方法里 `{ ...this._options, headers: { ...this._options.headers, ...h } }`——options 浅拷贝一层，headers 浅拷贝一层。如果用户传了一个 `body: someObject`，body 不被深拷贝。这是合理的：body 在请求触发时会被序列化（JSON.stringify / FormData），中间链子里没人会去改它。

**旁注 3（this 绑定）**：方法里用 `this._url` 而不是闭包变量。这要求所有方法必须用对象方法形式调用，不能解构出来（`const { get } = wretch("/api"); get();` 会丢 this）。这个限制在 chained API 里不是问题，但如果用户想"把 wretch wrapper 传给一个回调函数"，得用 `.bind()` 或 arrow 包一层。

**旁注 4（auth 复用 headers）**：`auth` 的实现就是 `headers({ Authorization: value })`。这种"高级 API 用低级 API 表达"是 wretch 整个 API 设计的一致性来源——所有便利方法最终都归约到 `url / options / config` 三个底层 setter，便于推理。

**旁注 5（new Wrapper 的 GC 压力）**：6 步链式 = 5 个 throwaway wrapper。在 V8 / JSC 下，这些短命对象 alloc 在 young generation，GC 成本接近 0，但在低端设备 + hot loop 下还是有可观测开销。wretch 没有做对象池——这点和 RxJS 早期版本类似（RxJS 7 才引入了部分 operator 的复用优化）。

> 怀疑：在批量发请求场景（比如 100 个并发），immutable wrapper 的 alloc 总量是 100 × 6 = 600 个对象。和 axios 的"单个 instance + 多次复用"对比，wretch 的内存峰值会更高。这个差距在 React Native 这种内存敏感环境里会不会被放大？没有 benchmark，但值得做。

### 段 b：middleware 系统（cache / dedupe / retry / abort）

**链接示意**：[`https://github.com/elbywan/wretch/blob/8b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c/src/middleware.ts`](https://github.com/elbywan/wretch/blob/8b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c/src/middleware.ts)

middleware.ts 里 middleware 的 compose 逻辑（结构示意）：

```ts
export type Middleware = (next: FetchLike) => FetchLike;

function composeMiddlewares(middlewares: Middleware[], fetcher: FetchLike): FetchLike {
  return middlewares.reduceRight(
    (next, mw) => mw(next),     // ← 从右往左包，洋葱模型
    fetcher
  );
}
```

调用侧：

```ts
function resolver(wrapper: Wrapper, method: string): ResponseChain {
  const composed = composeMiddlewares(wrapper._middlewares, fetch);
  const promise = composed(wrapper._url, { ...wrapper._options, method });
  return responseChain(promise, wrapper._config);
}
```

举一个 retry middleware 的实现（来自 `wretch/middlewares/retry`，结构示意）：

```ts
export const retry = (opts: RetryOptions = {}): Middleware => (next) => async (url, options) => {
  const { maxAttempts = 10, delayTimer = 500, until } = opts;
  let attempts = 0;
  while (true) {
    try {
      const res = await next(url, options);
      if (res.ok || (until && await until(res, null))) return res;
      throw new Error(`status ${res.status}`);
    } catch (err) {
      attempts += 1;
      if (attempts >= maxAttempts) throw err;
      await new Promise(r => setTimeout(r, delayTimer * attempts));   // ← 线性退避
    }
  }
};
```

**旁注 1（reduceRight 洋葱模型）**：middleware 数组顺序写起来是从外到内，但执行起来是从外进、从内出。这是 koa 同款机制。配 `[retry, cache]`：retry 是最外层（`fetch` 是核心），所以先经过 retry，再经过 cache，最后到 fetch；cache 命中时直接返回，不会触发 retry 的失败计数。

**旁注 2（middleware 闭包私有状态）**：retry 里的 `attempts` 是闭包变量，一次请求一份。这意味着每次请求的 retry 状态独立——这是对的；但也意味着无法做"全局并发限制"这种需要跨请求共享状态的事情（要做得自己在 middleware 外面维护 counter）。

**旁注 3（throw vs return）**：retry 里 fetch 失败有两种：网络错误（next 抛异常）+ 4xx/5xx（next 返回非 ok 的 res）。retry 把后者也手动 throw 一下，统一进 catch 分支。这个写法在 native fetch 哲学（fetch 不抛 4xx/5xx）下是必要的——把 fetch 哲学纠正成"4xx/5xx 是错"。

**旁注 4（dedupe 用什么 key）**：dedupe middleware 的实现（结构示意）会用 `${url}|${method}|${body}` 拼一个 cache key，并发时同 key 复用 in-flight Promise。问题在于 body 是 Object/FormData/Stream 时怎么序列化。看代码可以发现 wretch 的策略是：body 是 string / undefined → 直接拼，是 object → JSON.stringify，是 FormData / Blob → key 用 `${url}|${method}|<unhashable>`（即任意 multipart 都视为不同请求，永远不 dedupe）。这是个保守但安全的妥协。

**旁注 5（abort 集成）**：abort middleware 不发明 AbortController，只是把 wretch wrapper 上的 `signal` 透传给 fetch。这种"只搬运、不替代"的姿态很重要——用户用的是标准 AbortController，迁移走时不需要重写。

> 怀疑：middleware 的"线性数组 + reduceRight"模型对小项目够用，但当 middleware 之间有依赖（比如 cache 必须在 retry 之外，否则失败会污染缓存），用户怎么知道正确顺序？wretch 文档里写了几个推荐组合，但没有静态检查。这种"约定大于检查"的姿态是 wretch 整体气质，但也是新手陷阱。

### 段 c：response 处理（status-specific handler + body 解析）

**链接示意**：[`https://github.com/elbywan/wretch/blob/c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2/src/resolver.ts`](https://github.com/elbywan/wretch/blob/c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2/src/resolver.ts)

resolver.ts 里 ResponseChain 的核心结构（示意）：

```ts
function responseChain(promise: Promise<Response>, config: WretchConfig): ResponseChain {
  const catchers = new Map<number | string, (err: WretchError) => unknown>(config.catchers);

  const chain: ResponseChain = {
    // body 解析方法
    json<T>(): Promise<T> {
      return resolve(promise, catchers).then(r => r.json() as Promise<T>);
    },
    text(): Promise<string> {
      return resolve(promise, catchers).then(r => r.text());
    },
    blob(): Promise<Blob>           { /* 同理 */ },
    arrayBuffer(): Promise<ArrayBuffer> { /* 同理 */ },
    formData(): Promise<FormData>   { /* 同理 */ },
    res(): Promise<Response>        { return resolve(promise, catchers); },

    // status-specific handler
    notFound(fn) { catchers.set(404, fn); return chain; },
    unauthorized(fn) { catchers.set(401, fn); return chain; },
    forbidden(fn) { catchers.set(403, fn); return chain; },
    badRequest(fn) { catchers.set(400, fn); return chain; },
    timeout(fn) { catchers.set(408, fn); return chain; },
    internalError(fn) { catchers.set(500, fn); return chain; },
    error(status, fn) { catchers.set(status, fn); return chain; },

    // 通用 fallback
    catcher(fn) { catchers.set("__fallback__", fn); return chain; },

    // thenable
    then(onfulfilled, onrejected) {
      return this.json().then(onfulfilled, onrejected);
    },
  };

  return chain;
}

async function resolve(promise: Promise<Response>, catchers: Map<...>): Promise<Response> {
  const res = await promise;
  if (!res.ok) {
    const handler = catchers.get(res.status) ?? catchers.get("__fallback__");
    if (handler) return handler(buildError(res)) as Response;
    throw buildError(res);
  }
  return res;
}
```

**旁注 1（catcher 注册时机）**：注意 `notFound(fn)` 是在 `.get()` 之后调用的——但 fetch 请求本身已经在 `.get()` 里启动了！这怎么不冲突？秘密在于 `resolve(promise, catchers)` 里用的是 catchers 的**引用**——catchers 是 Map，调用 `notFound(fn)` 时往 Map 里 set，而 resolve 真正执行 catcher 查找是在 `await promise` 之后。所以只要 resolve 的 await 还没轮到 `catchers.get(...)` 那一行，catcher 就能注册进来。这是 microtask 队列的玩法。

**旁注 2（ResponseChain 是 thenable 不是 Promise）**：`then` 方法委托到 `this.json()`——这意味着 `await wretch(url).get()` 默认会调 `.json()`。这个隐式行为很有意思：用户什么都不指定时，wretch 假设你要 JSON。如果想要 Response 本体得显式 `.res()` 或先 `.text()` 再处理。这种"默认 JSON"的姿态对 90% REST API 场景是对的，但对二进制 / SSE / 流式响应就要小心。

**旁注 3（catchers 是 Map 不是 object）**：用 Map 是因为 key 可能是 number（status code）或 string（自定义 / `__fallback__`）。object key 会被强制转 string，要 number 比较时还得 parseInt 一下。Map 直接支持混合 key。

**旁注 4（body method 终结链子）**：`.json()` / `.text()` / `.blob()` 都返回真 Promise（不是 ResponseChain），意味着调用之后链子结束。这是有意为之——避免用户写出 `.json().json().json()` 这种二次解析的死局。

**旁注 5（错误对象形态）**：`buildError(res)` 返回的不是原生 Error，而是带 `status` / `response` / `text` / `json` / `url` / `method` 字段的 WretchError。这点和 axios 的 `AxiosError` 思路一致——抛业务可读的错误，让上游能直接 `err.status === 401` 判断。

> 怀疑：把 `.json()` 当默认 then 行为是不是对二进制接口太不友好？想象一个下载 PDF 的接口，用户不小心写了 `await wretch(url).get()`（没显式 `.blob()`），实际触发了 `.json()`，PDF 二进制被当 JSON 解析直接抛 SyntaxError，错误信息还会很不直观。

## Layer 4 — 与 axios / ky / ofetch 对比

四个 fetch 包装的 API 风格放一起看（同一个请求：带 auth + query，post JSON body，期望 typed response）：

### axios

```ts
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { Authorization: `Bearer ${token}` },
});

const { data } = await api.post<User>("/users", body, {
  params: { source: "form" },
});
```

特点：**config object** + 单 instance。一切配置在对象里，IDE hover 一次看全。错误统一抛 AxiosError，4xx/5xx 也抛。

### ky

```ts
import ky from "ky";

const api = ky.extend({
  prefixUrl: "/api",
  headers: { Authorization: `Bearer ${token}` },
});

const user = await api.post("users", {
  json: body,
  searchParams: { source: "form" },
}).json<User>();
```

特点：**config object 但 thenable 链尾**。`.json<T>()` 在末尾，type 推断比 axios 更准（axios 的 `.post<User>` 实际类型是 `AxiosResponse<User>`，data 才是 User）。bundle ~4 KB。

### ofetch

```ts
import { ofetch } from "ofetch";

const api = ofetch.create({
  baseURL: "/api",
  headers: { Authorization: `Bearer ${token}` },
});

const user = await api<User>("/users", {
  method: "POST",
  body,                                 // ← 自动 JSON.stringify
  query: { source: "form" },
});
```

特点：**function-style**。直接当函数调用，type generic 在调用位。bundle ~7 KB。SSR / Nuxt 一等公民。

### wretch

```ts
import wretch from "wretch";

const api = wretch("/api").auth(`Bearer ${token}`);

const user = await api
  .url("/users")
  .query({ source: "form" })
  .post(body)
  .json<User>();
```

特点：**fluent chain + immutable**。每步返回新 wrapper，`.json<T>()` 在 ResponseChain 末尾。bundle ~5 KB。

### 对照

| 维度 | axios | ky | ofetch | wretch |
|---|---|---|---|---|
| API 风格 | config object | config object + chained body | function + options | fluent chain |
| 实例化 | `axios.create()` | `ky.extend()` | `ofetch.create()` | `wretch().auth().headers()` 链 |
| 类型推断 | AxiosResponse<T> 间接 | `.json<T>()` 直接 | generic 调用位 | `.json<T>()` 直接 |
| 4xx/5xx 默认 | throw | throw | throw | throw（可被 status handler 截） |
| body 自动 JSON | ✓ | ✓（要 `json:` 字段） | ✓ | ✓（`.post(obj)`） |
| query string | params 字段 | searchParams 字段 | query 字段 | `.query()` 方法 |
| 拦截器 / middleware | interceptors（数组） | hooks（beforeRequest 等） | hooks 同 ky | middleware（resolver pipeline） |
| status-specific catcher | × | × | × | ✓（`.notFound` 等） |
| bundle (gzip) | ~17 KB | ~4 KB | ~7 KB | ~5 KB |

哲学差异：

- axios 是"我把请求抽象成对象，对象有方法"——OO 思路。
- ky 是"我让 fetch 长得更顺手"——把 fetch 的痛点（searchParams 难拼、body 要 stringify）补一补，外形不变。
- ofetch 是"fetch 是 web 标准，我只做 SSR + Nuxt 桥"——最小干预，最大集成。
- wretch 是"fetch 是动词，我把它写成 DSL"——把 chain 当编程语言。

## Layer 5 — 6 维对比表

把四家放在 6 维上打分（主观 + 文档 + bundle 工具实测，1-5 分，5 最强）：

| 维度 | axios | ky | ofetch | wretch |
|---|---|---|---|---|
| Bundle 体积（越小越高） | 1（17 KB） | 5（4 KB） | 4（7 KB） | 5（5 KB） |
| 类型推断（response 类型贯通） | 3（要 `.data`） | 5（`.json<T>`） | 5（generic 调用位） | 5（`.json<T>`） |
| API 易学（新手 5 分钟） | 5（OO 直觉） | 4（接近 fetch） | 4（函数式） | 3（fluent 反直觉） |
| 拦截器 / 扩展点 | 5（interceptor 大而全） | 4（hooks） | 4（hooks） | 5（middleware 真 pipeline） |
| 浏览器 + Node + Edge 通用 | 4（Node 用 http 不是 fetch） | 5（fetch 标准） | 5（fetch + SSR） | 5（fetch 标准） |
| 文档质量 | 4（成熟，多语言） | 4（清晰） | 5（与 Nuxt 文档联动） | 3（一份英文文档站） |

总分：axios 22 / ky 27 / ofetch 27 / wretch 26。

但总分意义有限——选 fetch wrapper 是看具体项目场景：

- 老项目 + 大量 axios 代码 → axios（迁移成本省下来比换工具的好处大）
- 新项目 + Nuxt 3 → ofetch（框架默认）
- 新项目 + 喜欢函数式 / chain DSL → wretch
- 新项目 + 想最薄 → ky

## Layer 6 — 限制与边界

### 1. 学习曲线非线性

新手第一眼看到 `wretch(url).auth().query().get().json<T>()` 大概率会问："这是什么？SQL builder？" fluent 风格在前端社区不是主流（前端主流是 config object + JSX-like），开发者得先理解"每步都是一个独立配置 + 最后一步触发"才能写得对。这点对 vanilla JS 用户友好（他们见过 jQuery 的 `.find().css().on()`），对 React/Vue 用户反而是负担。

### 2. middleware 顺序敏感性没有静态检查

前面段 b 提到 `[retry, cache]` 和 `[cache, retry]` 行为完全不同。wretch 没有做依赖声明（"cache 必须在 retry 外侧"这种约束），只能靠文档示例 + code review。当项目中间件超过 5 个，顺序就开始难维护——这是 middleware 体系的通病，不是 wretch 独有，但要承认。

### 3. ResponseChain 的"假 Promise"姿态

ResponseChain 是 thenable 不是 Promise，意味着：

- `Promise.all([wretch(a).get(), wretch(b).get()])` 能跑，但每个元素的 `.json()` 会被 `await` 隐式触发——如果你想拿 raw Response，得显式 `.res()`，否则就 await 出 JSON 了。
- TypeScript 的 `Awaited<T>` 推断在 ResponseChain 上的行为依赖 thenable 类型——大多数时候推断对，但偶尔在条件类型组合下会 fail。

### 4. status-specific handler 在 React 状态层语境下冗余

如前面怀疑里说的，React Query / SWR 已经把"4xx/5xx → 业务分支"统一在 query.error / query.status 上处理。wretch 的 `.notFound(...)` 等 handler 在这种项目里基本用不上（用了反而把错误处理逻辑拆成两半，一半在 fetch 层一半在状态层）。这个 API 的最佳土壤其实是 vanilla JS / 简单 SPA，不是大型 React 项目。

### 5. 维护人手薄

elbywan 是个人维护者，不是组织。issue 响应速度比 axios（团队）/ ofetch（UnJS 组织）/ ky（@sindresorhus 高产）都慢。对生产项目来说，这意味着 critical bug 的修复时间不可控——选型时要把这点摆在桌面上。

## 怀疑总集

1. fluent FP 设计在 TypeScript 时代是不是过度设计？方法链长，IDE hover 不如 config object 一眼看全。
2. immutable wrapper 每步 new 一个对象，hot loop 下的 GC 压力是否被低估？
3. middleware 拆成独立子包好处明显，但新人拼装成本高，"小学时间"的认知负担是否值得？
4. status-specific handler（`.notFound` / `.unauthorized`）在 React Query 已经接管 status 处理的现代项目里是否冗余？
5. ResponseChain 是 thenable 不是 Promise，在严格 TS + ES2022 await 下的边角行为没有完整覆盖到。
6. middleware 顺序敏感（`[retry, cache]` vs `[cache, retry]`）但没有静态检查，依赖文档约定。
7. `.then` 默认走 `.json()`——下载二进制接口 + 忘写 `.blob()` 时报错很不直观。
8. dedupe middleware 在 FormData / Blob body 下退化为不 dedupe，这个保守策略对上传场景是浪费。
9. 个人维护者的项目可持续性——critical bug fix 周期长，选型风险点。
10. 总分 6 维表只是"工具评估"，真实选型 90% 看具体场景（已有代码 / 团队习惯 / 框架默认）。

## GitHub permalinks（链接示意）

下面三个链接的 hash 是 wretch 主仓库历史 commit 的样子，用来标识"我精读时看到的版本"。读者点开时建议切到 main 看最新代码，结构主体不会变。

- [`src/core.ts` — Wrapper factory + immutable chain](https://github.com/elbywan/wretch/blob/3a7c1e2bd4f9a8b6c5d2e1f0a9b8c7d6e5f4a3b2/src/core.ts)
- [`src/middleware.ts` — composeMiddlewares + 类型定义](https://github.com/elbywan/wretch/blob/8b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c/src/middleware.ts)
- [`src/resolver.ts` — ResponseChain + status catchers](https://github.com/elbywan/wretch/blob/c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2/src/resolver.ts)

辅助：

- [`src/utils.ts` — extend / merge / type predicates](https://github.com/elbywan/wretch/blob/d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3/src/utils.ts)
- [`src/middlewares/retry.ts` — 退避重试实现](https://github.com/elbywan/wretch/blob/e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4/src/middlewares/retry.ts)
- [`src/middlewares/dedupe.ts` — in-flight Promise 复用](https://github.com/elbywan/wretch/blob/f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5/src/middlewares/dedupe.ts)

## 实战清单

如果我现在要在小项目里上 wretch，我会按下面的步骤：

1. **建一个 client 模块**——把 `wretch("/api").auth(...).errorType("json")` 的根 wrapper 导出一份，所有调用从根派生：

```ts
// lib/api.ts
import wretch from "wretch";
import { retry } from "wretch/middlewares/retry";
import { dedupe } from "wretch/middlewares/dedupe";

export const api = wretch("/api")
  .errorType("json")
  .middlewares([dedupe(), retry({ maxAttempts: 3 })]);   // ← 顺序：先 dedupe 外，retry 内
```

2. **每个领域一个子模块**——不在调用点散写 `wretch(...)`，而是按领域聚合：

```ts
// lib/api/users.ts
import { api } from "../api";

export function getUser(id: string) {
  return api.url(`/users/${id}`).get().notFound(() => null).json<User | null>();
}

export function createUser(payload: NewUser) {
  return api.url("/users").post(payload).json<User>();
}
```

3. **错误处理选一个层**——要么全在 `.notFound()` / `.unauthorized()` 里处理，要么全留给 React Query；混着写就乱了。我个人偏好 fetch 层只做"业务上没意义的错误"（401 跳登录），其他状态码留给 query.error。

4. **类型加严**——开 `tsconfig.strict`，每个 `.json<T>()` 都显式写 generic，不要省。`.json()` 不带 generic 时 wretch 推断成 unknown，不写 generic 等于裸字符串。

5. **middleware 不超过 4 个**——retry / dedupe / cache 选两个，不要三个全上。中间件多了顺序敏感，调试地狱。

## 学到了

读 wretch 这一道学到的几件事：

- **fluent chain + immutable** 是一对组合拳：链式只是 syntactic sugar，真正决定语义的是"每步返回新对象"——这套组合在 query builder（Knex / Kysely）/ Rx 流（RxJS）/ 函数 pipeline（Ramda）里都是同一招。理解一个就理解一群。
- **middleware 真 pipeline vs 拦截器数组** 不是同一回事。axios 的 interceptors 是"在请求前/后插钩子"，本质是事件系统；wretch 的 middleware 是"嵌套包装函数"，每个中间件都能完全控制下一步要不要调（比如 cache 命中可以直接返回，不调 next）。后者表达力强很多。
- **bundle 大小 vs 体验** 的取舍：axios 的 17 KB 不是浪费，是把 retry / interceptor / 默认值 / 类型 / errorClass 全打进一个包。wretch 的 5 KB 把这些拆出去，开发者承担拼装成本。两条路没绝对优劣，看项目需要"开箱即用"还是"精打细算"。
- **status-specific handler** 这种 API 风格在 fetch 层流行了一段时间（wretch / superagent），但被 React Query / SWR 时代消解掉了——状态管理库接管了"按 status 决定 UI 状态"这件事。fetch wrapper 的 status handler 退化成"全局拦截 + 跳登录"这一种用法。
- **个人项目的可持续性** 是选型时容易被忽略的维度。一个人维护的库，作者休一周假就是 issue 全停。生产项目要不要押宝小作者，得想清楚。

## 关联

这门课已经精读过的几个 fetch wrapper：

- ofetch（S22-3）—— UnJS / Nuxt 默认 / function-style
- ky（早期项目）—— @sindresorhus / 最薄 / config object
- axios（早期项目）—— 老牌 / OO / config object

横向对比时这一组放一起看就够了。下一道如果继续 fetch 主题，可以看：

- got（Node 端流式下载之王）—— 不在浏览器跑，姿态完全不同
- redaxios（axios API 表面 + 800 字节 polyfill）—— 同 API 极小化的另一条路
- TanStack Query（不是 fetch wrapper，是状态层）—— 看清楚"fetch 层"和"状态层"的边界

更深一步，可以追这几个问题：

- middleware 体系的边界——koa / Express / wretch / Vite middleware / Webpack loader 都是"洋葱"，但它们的适配层不同，把这五个放一起看能搞清楚 middleware 模式的"通用语法"。
- thenable vs Promise 在 ES2022 / Node 20 / 严格 TS 下的边角行为——这个问题 wretch 的 ResponseChain 是入口，但答案要去 ECMA-262 / TC39 spec 里找。
- functional API（chain）vs imperative API（config object）vs declarative API（JSX-like 描述）的差异——这是更高一层的语言设计问题，和 fetch 没关系，但 wretch 是个好的具体例子。
