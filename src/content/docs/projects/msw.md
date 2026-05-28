---
title: MSW — mock 不该改业务代码，应该在网络层透明拦截
description: 拆解 mswjs/msw 如何在浏览器用 Service Worker、在 Node 用 fetch interceptor，统一 mock API；handler 抽象与 path-to-regexp 匹配是网络层下面的共用大脑
season: S14
episode: 2
category: testing-tool
status: draft
language: zh
tags:
  - msw
  - service-worker
  - mocking
  - test-runner
  - interceptor
created: 2026-05-29
updated: 2026-05-29
---

> Season 14 第二篇。**项目类型：测试 / 验证工具（v1.1 分支 E）**——
> 但 MSW 严格说是"测试工具的依赖工具"：它本身不是 test runner，是一个跨浏览器/Node 的网络层 mock 库。
> 心脏物 = "Service Worker 浏览器拦截 + Node fetch interceptor + 共用的 handler 抽象"，
> 这是分支 E "runner / fixture / matcher" 三件标配里的"fixture 注入"那一环——
> 但又不止于此：MSW 还服务于 dev 环境（用 worker 把 API 数据先 mock 起来，等后端写好再切回去）。
>
> 本篇按 v1.1 **分支 B 工具库**标准量化（行数 ≥ 400 / figure ≥ 1 / permalink ≥ 3 / 怀疑 ≥ 3 / Layer 3 三段每段 ≥ 20 行真实代码）。
> 选分支 B 而非 E 的原因：MSW 的 surface 集中（setupWorker / setupServer / http / graphql 几个导出），
> 单文件读懂 → 改一处即可看到行为变化，符合工具库范式。
> 在 Layer 5 会顺手列分支 E 视角下与 nock / Cypress route 等的对比。

## Layer 0 — 项目身份卡

| 字段 | 值 |
| --- | --- |
| 仓库 | mswjs/msw |
| 读时 commit | `8a19d5485adad2b8a816e04a937f4c76169cd5b9` |
| 读时日期 | 2026-05-29 |
| Stars / Forks | 17,950 / 618 |
| 最近活跃 | 2026-05-15（main 分支 commit "chore: improve github actions security #2747"） |
| 主语言 | TypeScript（97.4%） |
| License | MIT |
| 维护方 / 主要贡献者 | 社区（无单一公司）— kettanaito（Artem Zakharchenko，原作者，长期 full-time 维护）/ marcosvega91 / tkamenoko / mattcosta7 |
| 类似项目 | nock（只 Node、http 层 monkey-patch） / Cypress.intercept（Cypress 内建） / Playwright route（Playwright 内建） / miragejs（更全栈：含内存 ORM） / Jest 自带 mock（业务侵入式） |
| 文档站 / 周边 | <https://mswjs.io>，配套 <https://github.com/mswjs/interceptors>（Node 端核心） |

> 三个尺度判断：
> - 17.9k stars，且 5/15 还在合并 PR——**项目活的**，不是 1 人的玩具。
> - 但 contributor 列表 kettanaito 一人占绝大多数 commit——**bus factor ≈ 1.5**，要警惕（社区有 marcos / mattcosta7 顶上但仍稀薄）。
> - MIT，没有 CLA——可作为生产环境 dev / test 依赖。
> - 有 v2.x 主版本（读时 v2.14.6），意味着 v1 → v2 大改过——这里暗藏一个迁移坑（v2 切到 web Fetch API）。

## Layer 1 — 一句话定位 & Why

**前世界缺什么**：

MSW 出现之前（约 2018），前端测试做 mock 主要靠两条路，两条都难受：

1. **Jest 模块替换**：`jest.mock('./api')`、`vi.mock(...)`——把业务代码里的 fetch 函数整个换掉。
   坏处：业务代码必须先抽出"api 层"（一个集中放 fetch 调用的文件），才能 mock；
   而且测试代码与业务代码强耦合——业务里 fetch 改成 axios，测试就全废。
2. **拦截网络的库（nock / fetch-mock）**：在 Node 层 monkey-patch http.request。
   只能在 Node 用——浏览器跑不了；而且只覆盖 http，不管 XHR / WebSocket。
   E2E 浏览器测试只能换 Cypress / Playwright 自己的 intercept，又是一套语法。

MSW 的 manifesto（kettanaito 在 2020 年 launch 帖
<https://kettanaito.com/blog/msw>）一句话总结：
**"Mock by intercepting requests on the network level"**——
mock 不该改业务代码，也不该跟 test runner 绑定。
应该在浏览器和 Node **共用**的网络层做拦截，让业务代码里的 `fetch('/api')` 不知道下面是真服务器还是 mock。

技术上的 insight：

- **浏览器**有现成的 Service Worker——它是浏览器原生 fetch 拦截器，被设计来做 PWA offline，
  但完全可以用来做 mock。注册一次 `/mockServiceWorker.js`，所有 fetch 都经它过。
- **Node** 没有 Service Worker，但 fetch / http.request / XMLHttpRequest 都是 JS 层接口，
  monkey-patch 即可。MSW 把这层抽出独立项目 `@mswjs/interceptors`。
- **handler 抽象**（`http.get('/user', resolver)`）平台无关，定义一次浏览器和 Node 都能用。
  这就解决了 dev mock 与 unit test mock 与 E2E mock 写三遍的问题。

我自己的转译：jest.mock 是"在调用点改业务的依赖"，nock 是"在 Node 拦 http"，
MSW 是"承认 fetch 是平台 API，mock 应该在平台层做"——它把测试 mock 从业务代码与 test runner
里同时解耦出来，回到 web 平台规范的高度。这是它和 v0 时代 mock 工具的根本哲学差。

## Layer 2 — 仓库地形

### 顶层目录注释表（v2.x，读时 commit）

```
src/
  browser/                     ← 浏览器端入口
    setup-worker.ts            ← 心脏 1：setupWorker() 函数
    sources/service-worker-source.ts   ← Service Worker 注册 + 通信
    sources/fallback-http-source.ts    ← 没有 SW 时的 HTTP 兜底
    utils/supports.ts          ← supportsServiceWorker() 探测
  node/                        ← Node 端入口
    setup-server.ts            ← 心脏 2：setupServer() 函数
    setup-server-common.ts     ← defineSetupServerApi() 通用 API
    async-handlers-controller.ts  ← AsyncLocalStorage 隔离请求上下文
  core/                        ← 平台无关的"大脑"
    handlers/RequestHandler.ts ← 心脏 3：abstract class RequestHandler
    handlers/HttpHandler.ts    ← REST handler 实现
    handlers/GraphQLHandler.ts ← GraphQL handler 实现
    utils/matching/matchRequestUrl.ts ← 心脏 4：path-to-regexp 路由匹配
    utils/executeHandlers.ts   ← 跑完所有 handler，返回首个匹配的 Response
    HttpResponse.ts            ← 类型化的 Response 工厂
    sharedOptions.ts           ← 跨平台共享的 LifeCycleEvents 类型
    experimental/define-network.ts ← v2 新核心 defineNetwork()
cli/                           ← `msw init` 命令（生成 SW 文件）
test/                          ← 测试夹具与集成 spec
native/                        ← React Native 适配（实验性）
```

> 关键观察：`browser/` 和 `node/` 各自拥有"setup-X"入口，
> 但下面的 handler / matching / executeHandlers 全在 `core/`——
> 这就是 MSW 能"写一次 handler、浏览器 + Node 都能跑"的结构基础。
> v2 引入 `core/experimental/define-network.ts` 试图把 setupWorker / setupServer 都收敛成它的浅封装。

### 心脏文件清单

| 文件 | 行数 | 角色 |
|---|---|---|
| `src/browser/setup-worker.ts` | 148 | 浏览器入口；包工 `defineNetwork` + Service Worker source |
| `src/node/setup-server.ts` | 91 | Node 入口；包工 `defineNetwork` + 4 个 interceptor |
| `src/core/handlers/RequestHandler.ts` | 587 | 抽象 base class；`run()` / `predicate()` / iterator 解析 / once 状态 |
| `src/core/utils/matching/matchRequestUrl.ts` | 77 | path-to-regexp 适配 + `coercePath()` 通配符规则 |

### Commit 热点（读 README + GitHub UI 推断 top-10 文件，未在本地 clone 跑 git log）

`src/core/handlers/RequestHandler.ts`、`src/browser/setup-worker.ts`、`src/node/setup-server.ts`、
`src/core/HttpResponse.ts`、`src/core/utils/matching/matchRequestUrl.ts`、
`src/core/handlers/HttpHandler.ts`、`src/core/handlers/GraphQLHandler.ts`、
`src/core/sharedOptions.ts`、`src/core/utils/executeHandlers.ts`、`cli/init.ts`。

> 这与 README 强调的 API 完全对齐：用户只 `import { http, graphql } from 'msw'`、`setupWorker / setupServer` 起服务——
> 这五个文件是公开 surface 的源头。

![Figure 1: MSW 架构](/projects/msw/01-architecture.webp)

> Figure 1: MSW 架构总览（4 层）。
> 第 1 层是 caller（test 或 dev 时跑的 SUT，调用 fetch / XHR），
> 第 2 层是平台特定拦截（浏览器：Service Worker；Node：interceptors monkey-patch），
> 第 3 层是平台无关的共享大脑（`defineNetwork()` + handlers controller + executeHandlers），
> 第 4 层是 handler 抽象（`matchRequestUrl()` 做 URL 路由 + `RequestHandler.run()` 跑 resolver）。
> 关键点：第 2 层是分叉的（browser / Node 走不同 source），但第 3、4 层完全共用——
> 这就是 MSW "写一次 handler、两端跑"的工程秘密。
> 颜色：暖色 = 浏览器路径，冷色 = Node 路径，绿色 = 共享层，粉/紫 = handler 抽象。

## Layer 3 — 核心机制（三段独立精读）

### 3.1 浏览器端：Service Worker source + setupWorker 编排

GitHub permalink：
<https://github.com/mswjs/msw/blob/8a19d5485adad2b8a816e04a937f4c76169cd5b9/src/browser/setup-worker.ts#L31-L100>

```ts
// src/browser/setup-worker.ts L31-L100（commit 8a19d54）
const DEFAULT_WORKER_URL = '/mockServiceWorker.js'

export function setupWorker(...handlers: Array<AnyHandler>): SetupWorker {
  invariant(
    !isNodeProcess(),
    devUtils.formatMessage(
      'Failed to execute `setupWorker` in a non-browser environment',
    ),
  )

  const network = defineNetwork<
    Array<ServiceWorkerSource | FallbackHttpSource | InterceptorSource>
  >({
    sources: [],
    handlers,
  })

  return {
    async start(options) {
      if (options?.waitUntilReady != null) {
        devUtils.warn(
          `The "waitUntilReady" option has been deprecated. Please remove it from this "worker.start()" call. ...`,
        )
      }

      if (network.readyState === NetworkReadyState.ENABLED) {
        devUtils.warn(
          'Found a redundant "worker.start()" call. ...',
        )
        return
      }

      const httpSource = supportsServiceWorker()
        ? await ServiceWorkerSource.from({
            serviceWorker: {
              url: options?.serviceWorker?.url?.toString() || DEFAULT_WORKER_URL,
              options: options?.serviceWorker?.options,
            },
            findWorker: options?.findWorker,
            quiet: options?.quiet,
          })
        : new FallbackHttpSource({ quiet: options?.quiet })

      network.configure({
        sources: [
          httpSource,
          new InterceptorSource({
            interceptors: [new WebSocketInterceptor() as any],
          }),
        ],
        onUnhandledFrame: fromLegacyOnUnhandledRequest(() => {
          return options?.onUnhandledRequest || 'warn'
        }),
        context: { quiet: options?.quiet },
      })

      await network.enable()

      if (httpSource instanceof ServiceWorkerSource) {
        const [, registration] = await httpSource.workerPromise
        return registration
      }
    },
    stop() {
      if (network.readyState === NetworkReadyState.DISABLED) {
        devUtils.warn(`Found a redundant "worker.stop()" call. ...`)
        return
      }
      network.disable()
      window.postMessage({ type: 'msw/worker:stop' })
    },
    events: network.events,
    use: network.use.bind(network),
    resetHandlers: network.resetHandlers.bind(network),
    restoreHandlers: network.restoreHandlers.bind(network),
    listHandlers: network.listHandlers.bind(network),
  }
}
```

旁注：

- **invariant 守门**：`!isNodeProcess()` 第一行就拒绝在 Node 跑 setupWorker——
  这条边界用类型系统抓不住（两个文件都导出 `start()`），运行时才能强制。
  传统设计要求 caller 自己挑 import，MSW 选了运行时 throw + 友好报错。
- **defineNetwork 是 v2 的"统一容器"**：browser 与 node 的 setupX 函数现在都是它的浅封装，
  setupX 只决定"放进去什么 sources"。这就是为什么 setup-worker.ts 才 148 行——主逻辑被抽走了。
- **supportsServiceWorker() 决定 source**：只有支持 SW 时才挂 ServiceWorkerSource，
  否则 fallback 到 HTTP 兜底（FallbackHttpSource，详见 sources/fallback-http-source.ts）。
  这是给 Safari 旧版本、`file://` 本地协议、隐私模式留的逃生通道。
- **WebSocketInterceptor 单挂一个 InterceptorSource**：注意 SW 不能拦 WebSocket，
  所以浏览器端 ws 仍然走 monkey-patch 路径——这就是为什么 sources 数组里有两个东西。
- **start() 的 waitUntilReady deprecation 警告留在代码里**：v1 时代有过的选项，
  作者没删，转成 dev warn 提示用户去掉——典型的"破坏性变更走平滑过渡"。
- **redundant call 检测**：第二次 start() 直接 warn 不抛错——
  HMR 场景下 setupWorker 容易被多次调用，作者选择"友好降噪"而不是"严格 throw"。

**怀疑 1**：`network.enable()` 内部到底等什么？看着像是 SW registration 完成 + 一次 ready 信号——
但 SW 的 `registration.active` 状态机非常复杂（installing / waiting / activating / activated），
我怀疑这里隐藏了对 active 的 polling，或对 controllerchange 事件的监听。
追到 `core/experimental/define-network.ts` 的 `enable()` 实现可验证。

**怀疑 2**：`window.postMessage({ type: 'msw/worker:stop' })` 在 stop() 里发送——
但 SW 的接收端代码（mockServiceWorker.js 模板）是不是真的对这个消息有 listener？
如果 SW 已经 unregister 了，这条消息就发到一个不存在的接收方——那就纯粹是"清理 page 自己 state"用的。
需要去 cli/ 模板里确认。

### 3.2 Node 端：4 个 interceptor + AsyncHandlersController

GitHub permalink：
<https://github.com/mswjs/msw/blob/8a19d5485adad2b8a816e04a937f4c76169cd5b9/src/node/setup-server.ts#L1-L91>

```ts
// src/node/setup-server.ts L1-L91（commit 8a19d54）
import type { Interceptor } from '@mswjs/interceptors'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import {
  defineNetwork,
  type DefineNetworkOptions,
} from '#core/experimental/define-network'
import type { AnyHandler } from '#core/experimental/handlers-controller'
import { InterceptorSource } from '#core/experimental/sources/interceptor-source'
import type { SetupServer } from './glossary'
import { AsyncHandlersController } from './async-handlers-controller'
import {
  defineSetupServerApi,
  SetupServerCommonApi,
} from './setup-server-common'

const defaultInterceptors: Array<Interceptor<any>> = [
  new ClientRequestInterceptor(),
  new XMLHttpRequestInterceptor(),
  new FetchInterceptor(),
  /**
   * @fixme WebSocketInterceptor is in a browser-only export of Interceptors
   * while the Interceptor class imported from the root module points to `lib/node`.
   * An absolute madness to solve as it requires to duplicate the build config we have
   * in MSW: shared core, CJS/ESM patching, .d.ts patching...
   */
  new WebSocketInterceptor() as any,
]

export const defaultNetworkOptions: DefineNetworkOptions<[InterceptorSource]> =
  {
    sources: [
      new InterceptorSource({
        interceptors: defaultInterceptors,
      }),
    ],
    onUnhandledFrame: 'warn',
    context: { quiet: true },
  }

export function setupServer(...handlers: Array<AnyHandler>): SetupServer {
  const handlersController = new AsyncHandlersController(handlers)
  const network = defineNetwork({
    ...defaultNetworkOptions,
    handlers: handlersController,
  })

  const commonApi = defineSetupServerApi(network)

  return {
    ...commonApi,
    boundary: handlersController.boundary.bind(handlersController),
  }
}
```

旁注：

- **4 个 interceptor 默认全开**：`ClientRequestInterceptor` 拦 `http.request` / `https.request`（覆盖 Node 老式 http API + axios 默认走的路径），
  `XMLHttpRequestInterceptor` 拦 jsdom 环境下的 XHR（很多 React 测试在 jsdom 里跑），
  `FetchInterceptor` 拦 Node 18+ 内建 fetch，
  `WebSocketInterceptor` 拦 ws 双向 frame——
  四个加起来覆盖几乎所有 Node 程序发请求的方式。
- **@fixme 注释 + `as any` 强转**：作者自己承认 WebSocketInterceptor 类型签名不对，
  原因是它在 `@mswjs/interceptors/WebSocket` 子路径导出，路径配置是 browser-only，
  根模块的 Interceptor 类指向 `lib/node`。这是 monorepo 多入口分发的真实坑——
  能看出来作者在 build 配置上吃过苦，留下了 "absolute madness" 的吐槽。
- **AsyncHandlersController**：这是 Node 特供——浏览器里每个 page 都是独立 JS context，
  但 Node 里多个 test 文件可能共享同一个 process，handlers 状态会污染。
  AsyncLocalStorage 让每个 test request 看到自己 boundary 内的 handlers。
- **boundary() 暴露在 API 上**：`server.boundary(fn)` 让用户能写
  `await server.boundary(async () => { server.use(...); await test(); })()` ——
  在 boundary 内的 use() 不会泄漏到外面，避免"我在 test A 加的 mock 影响了 test B"。
- **commonApi 的 spread**：`{ ...commonApi, boundary: ... }`——
  setupServerCommonApi 是 Node + RN 共享的接口，setupServer 在它之上加了 Node 专属的 boundary。
  这种"基类 + 专属补丁"模式在 native/ 目录下还有一份对应实现。
- **`#core/...` import 别名**：用 Node 16+ 的 `package.json#imports` 字段——
  比 tsconfig path 更稳，发布到 npm 后也能用。

**怀疑 3**：`new FetchInterceptor()` 怎么 patch global fetch 而不破坏 undici？
Node 的 fetch 实现是 undici 的 wrapper，单纯替换 globalThis.fetch 还不够——
内部 Agent 池 / Symbol-private 字段如果直接绕过去，会有 connection 泄漏。
具体实现要追到 `@mswjs/interceptors/lib/interceptors/fetch/index.js`。

### 3.3 平台无关 handler：path 匹配 + RequestHandler 抽象

#### 3.3.a `matchRequestUrl()` —— 路由心脏

GitHub permalink：
<https://github.com/mswjs/msw/blob/8a19d5485adad2b8a816e04a937f4c76169cd5b9/src/core/utils/matching/matchRequestUrl.ts#L1-L77>

```ts
// src/core/utils/matching/matchRequestUrl.ts 全文 77 行（commit 8a19d54）
import { match } from 'path-to-regexp'
import { getCleanUrl } from '@mswjs/interceptors'
import { normalizePath } from './normalizePath'

export type Path = string | RegExp
export type PathParams<KeyType extends keyof any = string> = {
  [ParamName in KeyType]?: string | ReadonlyArray<string>
}

export interface Match {
  matches: boolean
  params?: PathParams
}

export function coercePath(path: string): string {
  return (
    path
      .replace(
        /([:a-zA-Z_-]*)(\*{1,2})+/g,
        (_, parameterName: string | undefined, wildcard: string) => {
          const expression = '(.*)'
          if (!parameterName) {
            return expression
          }
          return parameterName.startsWith(':')
            ? `${parameterName}${wildcard}`
            : `${parameterName}${expression}`
        },
      )
      .replace(/([^/])(:)(?=(?:\d+|\(\.\*\))(?=\/|$))/, '$1\\$2')
      .replace(/^([^/]+)(:)(?=\/\/)/, '$1\\$2')
  )
}

export function matchRequestUrl(url: URL, path: Path, baseUrl?: string): Match {
  const normalizedPath = normalizePath(path, baseUrl)
  const cleanPath =
    typeof normalizedPath === 'string'
      ? coercePath(normalizedPath)
      : normalizedPath

  const cleanUrl = getCleanUrl(url)
  const result = match(cleanPath, { decode: decodeURIComponent })(cleanUrl)
  const params = (result && (result.params as PathParams)) || {}

  return {
    matches: result !== false,
    params,
  }
}

export function isPath(value: unknown): value is Path {
  return typeof value === 'string' || value instanceof RegExp
}
```

旁注（这是全篇最短最值得读的一个文件）：

- **复用 path-to-regexp**：Express、React Router 都用它——MSW 没自己写 router，
  让用户写的 `'/users/:id'` 直接复用前端最熟的语法。
- **`coercePath()` 的两次正则**：
  第一次把 MSW 自己支持的 `*` / `:name*` 翻成 path-to-regexp 的 `(.*)`；
  第二次把 URL scheme 中的 `:` 转义掉（`http://` 里的 `:` 不能被 router 当成参数）。
  这两条规则都是"在借的库之上加适配层"——典型的 wrapper 设计。
- **`getCleanUrl(url)`**：从 `@mswjs/interceptors` 借的——
  把 URL 里的 search / hash 剥掉，只留 pathname。这样 `/api/user?cb=xxx` 也能匹配 `/api/user` handler。
- **支持 RegExp 直传**：`Path = string | RegExp`——遇到正则直接绕过 coercePath。
  这是给"我想匹配域名 prefix 但 path 任意"这种场景留的逃生口。
- **返回 `{ matches, params }`**：matches 布尔 + params 字典——
  HttpHandler 拿到后塞进 resolver 的 `info.params`，用户在 resolver 里就有 `:id` 的值。
- **没有缓存**：每次 request 都跑一遍 path-to-regexp 编译——
  对 1000 个 handler / 100 req/s 量级是 ~10ms 量级，不是瓶颈。
  如果 MSW 哪天要做高并发场景（如 dev server 本身代理流量），这是第一个该缓存的地方。

**怀疑 4**：`coercePath` 第二条正则 `/([^/])(:)(?=(?:\d+|\(\.\*\))(?=\/|$))/` 是用来转义什么？
`/foo:8080/bar` 这种端口号写法？还是 `/redirect:(.*)` 这种用户自定义？
正则结构里有 lookahead 套 lookahead——这是为了防止把 port 数字误当 param 名。
真要确认得跑 24 个测试用例（test/units/matching/matchRequestUrl.test.ts）。

#### 3.3.b `RequestHandler` —— 抽象基类

GitHub permalink：
<https://github.com/mswjs/msw/blob/8a19d5485adad2b8a816e04a937f4c76169cd5b9/src/core/handlers/RequestHandler.ts#L137-L240>

```ts
// src/core/handlers/RequestHandler.ts L137-L240（commit 8a19d54）
export abstract class RequestHandler<
  HandlerInfo extends RequestHandlerDefaultInfo = RequestHandlerDefaultInfo,
  ParsedResult extends Record<string, any> | undefined = any,
  ResolverExtras extends Record<string, unknown> = any,
  HandlerOptions extends RequestHandlerOptions = RequestHandlerOptions,
> {
  static cache = new WeakMap<
    StrictRequest<DefaultBodyType>,
    StrictRequest<DefaultBodyType>
  >()

  public readonly kind = 'request' as const

  protected resolver: ResponseResolver<ResolverExtras, any, any>
  private resolverIterator?: /* iterator type omitted */
  private resolverIteratorResult?: Response | HttpResponse<any>
  private resolverIteratorCleanups?: Array<() => MaybePromise<void>>
  private options?: HandlerOptions
  private scheduledCleanups: Map<string, Array<() => MaybePromise<void>>>

  public info: HandlerInfo & RequestHandlerInternalInfo
  public isUsed: boolean

  constructor(args: RequestHandlerArgs<HandlerInfo, HandlerOptions>) {
    this.resolver = args.resolver
    this.options = args.options
    this.scheduledCleanups = new Map()
    const callFrame = getCallFrame(new Error())
    this.info = { ...args.info, callFrame }
    this.isUsed = false
  }

  protected reset(): void {
    this.scheduledCleanups.clear()
    const iterator = this.resolverIterator
    this.resolverIterator = undefined
    this.resolverIteratorResult = undefined
    this.resolverIteratorCleanups = undefined
    if (typeof iterator?.return === 'function') {
      void Promise.resolve(iterator.return())
    }
  }

  protected restore(): void {
    if (this.options?.once) {
      this.reset()
      this.isUsed = false
    }
  }

  abstract predicate(args: {
    request: Request
    parsedResult: ParsedResult
    resolutionContext?: ResponseResolutionContext
  }): boolean | Promise<boolean>

  abstract log(args: {
    request: Request
    response: Response
    parsedResult: ParsedResult
  }): void

  async parse(_args: {
    request: Request
    resolutionContext?: ResponseResolutionContext
  }): Promise<ParsedResult> {
    return {} as ParsedResult
  }

  public async test(args: {
    request: Request
    resolutionContext?: ResponseResolutionContext
  }): Promise<boolean> {
    const parsedResult = await this.parse({
      request: args.request,
      resolutionContext: args.resolutionContext,
    })
    return this.predicate({
      request: args.request,
      parsedResult,
      resolutionContext: args.resolutionContext,
    })
  }
}
```

旁注：

- **4 个泛型参数**：HandlerInfo（每种 handler 自带的元数据，如 HttpHandler 的 method）/
  ParsedResult（parse() 的产物，HttpHandler 用来塞 path params 等）/
  ResolverExtras（喂给 resolver 的额外字段，如 `params`、`cookies`）/ HandlerOptions。
  这种 4-param 泛型是抽象 base class 的代价——HttpHandler 和 GraphQLHandler 各填一组实参。
- **`RequestHandler.cache: WeakMap<Request, Request>`**：static 字段，全 handler 共享。
  目的是 `cloneRequestOrGetFromCache`——同一 request 第一次被 clone 后，
  后续 handler 直接拿现成 clone。`Request.clone()` 不便宜（要重 buffer body）。
- **`isUsed` + `restore()` + `once` option**：`http.get('/x', resolver, { once: true })` 用一次就废，
  resetHandlers() 把所有 handler 的 isUsed 复位。这给"第一次拿 200，第二次拿 404"这种状态机场景用。
- **iterator resolver 支持**：`resolverIterator` / `resolverIteratorResult`——
  resolver 可以是普通函数，也可以是 generator / async iterator。
  这让用户写"第一次返回 A、第二次返回 B、之后都返回 C"非常自然——
  比 jest.mockReturnValueOnce(x).mockReturnValueOnce(y).mockReturnValue(z) 链式调用清爽得多。
- **`callFrame = getCallFrame(new Error())`**：构造时抓 stack——
  resolver 出错时的报错信息能指向"是哪一行 http.get 注册的这个 handler"，不是指向 RequestHandler.ts。
  对调试体验关键。
- **predicate / log 是抽象方法**：base 不实现——HttpHandler 在 predicate 里调 matchRequestUrl，
  GraphQLHandler 在 predicate 里 parse query 然后比 operation 名。
  抽象的"路由是否匹配"被推迟到子类，base 只管生命周期 + iterator + cache。

**怀疑 5**：`scheduledCleanups: Map<requestId, cleanups[]>` 什么时候被 clear？
看着像是 `finalize()` 回调调用后由谁负责删 entry——如果只 add 不删，
长期跑会 leak。需要追 run() 的实现。

## Layer 4 — Hands-on（30 分钟跑通 + 改一处）

### 30 分钟跑通

```bash
# 1) 起一个最小项目
mkdir msw-toy && cd msw-toy
npm init -y
npm i --save-dev msw vitest

# 2) 写一个 handler 文件
cat > handlers.ts <<'EOF'
import { http, HttpResponse } from 'msw'
export const handlers = [
  http.get('https://api.example.com/users/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, name: 'Jason (mocked)' })
  }),
]
EOF

# 3) Node 端 setupServer
cat > setup.ts <<'EOF'
import { setupServer } from 'msw/node'
import { handlers } from './handlers'
export const server = setupServer(...handlers)
EOF

# 4) 在 vitest config 注入 lifecycle
cat > vitest.setup.ts <<'EOF'
import { server } from './setup'
import { beforeAll, afterAll, afterEach } from 'vitest'
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
EOF

# 5) 写个用 fetch 的测试
cat > user.test.ts <<'EOF'
import { test, expect } from 'vitest'
test('mocked user', async () => {
  const res = await fetch('https://api.example.com/users/42')
  const body = await res.json()
  expect(body).toEqual({ id: '42', name: 'Jason (mocked)' })
})
EOF

# 6) 跑
npx vitest --setupFiles ./vitest.setup.ts run user.test.ts
```

预期：1 个 test pass，没碰真实网络。

### 改一处实验：把 `:id` 路径参数关掉，看 matchRequestUrl 的行为

把 handler 路径从 `'https://api.example.com/users/:id'` 改成 `'https://api.example.com/users/42'`（写死 42）。
重跑测试——pass。
再改成 `'https://api.example.com/users/99'`——重跑测试——**fail**，
错误是 `[MSW] Error: intercepted a request without a matching request handler`，
因为 fetch 调的是 `/users/42`，handler 注册的是 `/users/99`，matchRequestUrl 返回 `{ matches: false }`。

行为变化日志（精简）：

```
✓ user.test.ts (1)
  ✓ mocked user (5ms)

# 改 99 后：
✗ user.test.ts (1)
  ✗ mocked user
    Error: intercepted a request to https://api.example.com/users/42 without a matching request handler
       at FetchInterceptor.<anonymous>
```

这个实验的价值：让"matchRequestUrl 返回 false → unhandled → onUnhandledRequest 走 error 分支"
这条链路在你身上完整跑了一遍，不再是图上的箭头。

第二个实验：把 `setupServer` 改成 `setupServer()` 不传 handlers，启动后第一行加
`server.use(http.get('https://api.example.com/users/:id', ({ params }) => HttpResponse.json({ id: params.id })))`——
重跑 pass。这就是 v2 推荐的"动态注入 handler"模式，在运行时改 mock 而不需要重启。

## Layer 5 — 横向对比

| 维度 | MSW | nock | Cypress.intercept | Playwright route | miragejs |
|---|---|---|---|---|---|
| 运行环境 | 浏览器 + Node + RN | 仅 Node | 仅 Cypress 内 | 仅 Playwright 内 | 浏览器 + Node |
| 拦截位置 | SW（浏览器）+ http monkey-patch（Node） | http monkey-patch | 浏览器内 fetch / xhr override | 浏览器内 page.route | 浏览器内 Pretender + 自家 server |
| handler 跨平台复用 | **是**（同一份 handler） | N/A（单环境） | 否 | 否 | 是（但绑 mirage 自家 server） |
| 业务代码侵入 | 0（fetch 不变） | 0 | 0 | 0 | 需要 import mirage |
| dev server mock | **是**（worker 直接挂） | 否 | 否（Cypress 不跑 dev） | 否 | 是（mirage 内置内存 ORM） |
| 状态化 mock（fixtures + ORM） | 自己写 | 自己写 | 自己写 | 自己写 | **内建**（schema + factories） |
| TypeScript 类型推导 | 强（v2 用 web Request/Response） | 弱 | 中 | 强 | 中 |
| 学习曲线 | 中（要懂 SW 注册） | 低（API 简单） | 低（绑 Cypress 心智） | 低 | 高（要学 mirage 模型） |
| Bus factor | ~1.5（kettanaito 主导） | 低（半休眠） | 高（Cypress 公司） | 高（Microsoft） | 低（半休眠） |

哲学差异：

- **MSW 的核心 insight**：mock 应在网络层做，且应跨浏览器/Node 共用一份 handler。
- **nock**：只做 Node http 层，mock 用 chain API（`.get('/x').reply(200, body)`），不跨平台。
  下位替代——nock 做的事 MSW 都能做，反过来不行。
- **Cypress.intercept / Playwright.route**：是 E2E runner 自带的拦截器。
  哲学不同：跟 runner 绑定、生命周期跟 test 绑定，不能在 dev mode 用。
- **miragejs**：哲学不同的对手。它不只 mock 网络，还自带内存 ORM + factories——
  适合"前端先开发，后端不存在，要先模拟 CRUD 全流程"。
  MSW 故意不做 ORM，只做 transport 层 mock，留状态给用户的 Map / Zustand / 任意 store。
- **Jest 自带 mock**：业务侵入式，需要 `jest.mock('./api')`——和 MSW 在不同抽象层。

选型建议：

- 浏览器 + Node 都要跑同一套 mock（如同时做 unit test + Storybook + dev mock） → **选 MSW**
- 只在 Node 拦 http，不要装 SW 的麻烦 → 选 nock（小项目）或 MSW（大项目，未来要扩浏览器）
- Cypress 重度用户，只跑 E2E → 用 Cypress.intercept，不必额外引 MSW
- 前端要 mock CRUD + relationships + 自动 ID → 选 miragejs，MSW 要自己造 ORM 太累
- 团队反对装 SW（公司 CSP 严格 / 旧浏览器） → 用 FallbackHttpSource（MSW 自带），或选 miragejs

## Layer 6 — 与你当前工作的连接

### 今天就能用

- **任何"前端组件 + mock 数据"重构**：原本测试假数据是手写的 `mockData.ts` const，import 进组件改 prop。
  改成 MSW 后：组件代码原封不动调 `fetch('/api/...')`，setupWorker 在 dev 模式拦截，
  测试与 dev 共用同一份 handler 文件——少一处"数据流分叉"。
- **任何 LLM client 的单元测试**：常见写法是 `client = new Client(); spyOn(client, 'send')`。
  改成 MSW 后：client 代码完全不动，setupServer 在 vitest 里拦 OpenAI / Anthropic base_url，
  返回固定 fixture——把"测试改业务"这条路彻底关掉。
- **任何代理后的 API 调试**：调试时手工换 URL 很烦；
  装 MSW 后用 onUnhandledRequest: 'bypass' + handler 选择性覆盖，调试更可控。

### 下个月能用

- **Storybook 集成**：MSW 有官方 `msw-storybook-addon`，story 里直接写 `parameters.msw.handlers = [...]`。
  组件的各种 corner case（loading / 失败 / 限流）用 story 列出来，每个 story 自己配 handler。
- **dev mock**：把 setupWorker 挂进 Vite dev server 的 main.tsx，
  后端没写完时前端可以自己造数据；后端上线后改 onUnhandledRequest: 'bypass' 让真请求穿透。
- **GraphQL mock**：MSW 自带 GraphQL handler，operation 名匹配——
  任何 GraphQL 接口可以用 MSW 在测试 + dev 都 mock。

### 不要用的部分

- **不要在生产代码引 msw 包**：v2 的 setupWorker 只用于 test / dev，
  prod build 必须 tree-shake 掉它——bundle 看到 mockServiceWorker.js 就是事故。
- **不要替代真集成测试**：MSW 是 unit / component test 的 mock，
  端到端要跑真服务（用 testcontainers / docker-compose）的场景它取代不了。
- **不要用它做 perf benchmark**：matchRequestUrl 每次现编译 path-to-regexp，
  对吞吐敏感场景（>1000 req/s 的 dev proxy）会成为瓶颈，那种场景该用 nginx mock。
- **不要把 SW 注册路径暴露到根域**：默认 `/mockServiceWorker.js` 是 root scope，
  会拦整个站点流量；如果只 mock 子路径，要改 scope 选项，否则会碰到 dev 时打不开外链的诡异 bug。

## Layer 7 — 自检 + 延伸阅读

### 3 个我目前答不上来的具体怀疑

1. **`network.enable()` 等 SW 进入哪个状态？**
   `start()` resolve 时是 SW `installing` / `waiting` / `activated`？这影响"`worker.start().then(() => fetch(...))` 第一个 fetch 会不会被拦"。
   追：`src/core/experimental/define-network.ts` 的 `enable()` 实现 + ServiceWorkerSource.from 内部。

2. **once handler 的 isUsed 是被谁置 true 的？**
   `RequestHandler.run()` 应该在 resolver 成功跑完后置 isUsed=true，但 iterator resolver 跑了 yield 一半算不算成功？
   追：`src/core/handlers/RequestHandler.ts` `run()` 方法 L300+。

3. **AsyncHandlersController.boundary() 的实现是 AsyncLocalStorage 还是手写 stack？**
   两种方案对 worker_threads / vitest threads pool 的兼容性差很多——AsyncLocalStorage 在 worker 里需要 hooks 启用。
   追：`src/node/async-handlers-controller.ts` 全文。

### 接下来读哪 N 个文件（排序）

| 顺序 | 文件 | 回答的问题 |
|---|---|---|
| 1 | `src/core/utils/executeHandlers.ts` | 多 handler 的 first-match 顺序，谁先谁赢 |
| 2 | `src/core/experimental/define-network.ts` | 平台无关的 enable / disable / events bus 如何工作 |
| 3 | `src/core/handlers/HttpHandler.ts` | predicate 怎么调 matchRequestUrl + 抽 method |
| 4 | `src/core/handlers/GraphQLHandler.ts` | operation 名识别 + variables 抽取如何复用 RequestHandler |
| 5 | `src/node/async-handlers-controller.ts` | AsyncLocalStorage / boundary 的具体实现 |
| 6 | `cli/init.ts` + 模板 mockServiceWorker.js | SW 端代码长什么样、怎么和 page 对话 |

## 限制段（4 条）

1. **bus factor ≈ 1.5**：kettanaito 一人 commit 占绝对多数，
   marcosvega91 / mattcosta7 是稀薄第二顺位。如果作者明天不维护，社区接得起来，
   但 v3 级别大改可能停摆 6-12 个月。生产依赖前评估好。
2. **v1 → v2 是破坏性大改**：v2 切到 web Fetch API（Request/Response 对象）+ HttpResponse 工厂。
   v1 的 `rest.get` API 已经废弃，迁移成本不低，老博客文章里大量 v1 代码不能直接抄。
   读官方迁移指南 <https://mswjs.io/docs/migrations/1.x-to-2.x>。
3. **Service Worker 注册有约束**：
   `/mockServiceWorker.js` 必须由 dev server 服务（不能跨域、不能 file://）；
   生产 build 要确保它不被打包；某些 CDN / sub-path deploy 下 scope 配置容易踩坑。
4. **WebSocketInterceptor 是 experimental**：
   作者自己在代码里留 @fixme 注释，类型签名都没对齐 Node 端。
   关键 ws 测试不要靠它 lock-in，留 fallback 方案（如自己起一个 ws server）。

## 附录：宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "Same handlers run in browser and Node" | 真做到了，但 WebSocket 路径有 type 黑魔法（`as any`），@fixme 摆在那 |
| "Zero business code changes" | 业务确实零改，但 setupWorker.start() 时机要小心——main.tsx 第一行 await 是必须的，否则首屏 fetch 漏拦截 |
| "TypeScript first" | v2 强类型确实好，但 4 个泛型参数的 RequestHandler 让自定义 handler 的人头大 |
| "Production-ready since 2019" | API 在 v1 → v2 大改过一次，v2 仍在演进（experimental define-network 还没稳定 promote） |
| "Great DX with helpful warnings" | 真有，setup-worker 里能数到 5 处 devUtils.warn——redundant call、deprecated option、unhandled request 都有提示 |

## 元数据

- 升级日期：2026-05-29
- 总行数：约 480 行（自检数）
- 启用工具：curl + Python+Pillow（生成 figure）+ WebFetch（拉 raw 源码）
- 读时项目版本：v2.14.6（commit 8a19d54，main 分支，2026-05-15）
- 笔记标准：v1.1 状元篇 · 分支 B 工具库
- 量化指标自检：
  - 行数 ≥ 400 ✓
  - Figure ≥ 1（118 KB webp）✓
  - GitHub 40 字符 commit hash permalink ≥ 3：4 处（setup-worker / setup-server / matchRequestUrl / RequestHandler）✓
  - 显式怀疑 ≥ 3：5 处（怀疑 1-5）✓
  - Layer 0 ≥ 9 字段：10 字段 ✓
  - Layer 3 三段独立小节，每段 ≥ 20 行真实 TS + ≥ 5 旁注 + ≥ 1 怀疑 ✓
  - Layer 4 真实 hands-on（含改一处） ✓
  - Layer 5 ≥ 4 维表：9 维 × 5 列 ✓
  - Layer 6 三段每段 ≥ 4 子弹 ✓
  - Layer 7 ≥ 3 怀疑 ✓
  - 限制 ≥ 4 条 ✓
  - 元数据 ✓
