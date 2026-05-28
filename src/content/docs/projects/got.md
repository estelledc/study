---
title: got Node 端 HTTP 客户端的瑞士军刀
来源: https://github.com/sindresorhus/got + got 官方文档
---

# got — Node 端 HTTP 客户端的瑞士军刀

## 一句话总结

got 是 Sindre Sorhus（@sindresorhus）2014 年起一手孵化、后来交给社区共同维护的 Node-only HTTP 客户端，到 2024 年迭代到 v14.x。它和这门课里 fetch 系（ofetch / wretch / ky）最大的差别就一句话：**got 不是 fetch wrapper，它是基于 `node:http` / `node:https` / `node:http2` 自己写一套完整状态机**。所以它能做 fetch wrapper 做不到的事——retry 6 类 status code、流式上传/下载、自动 next-link 翻页、unix socket、HTTP/2、RFC 7234 标准 cache、cookie jar。bundle 压不下来（~200 KB），但跑在 Node 端，bundle 大不大不是核心矛盾。

设计哲学一句话：**Node 端 HTTP 已经够复杂，干脆把"复杂"做完整，而不是包薄一层把复杂留给用户**。这和 ky / wretch 的"薄壳 + 标准 fetch"路线是反方向。两条路没绝对优劣，看场景：边缘运行时（Cloudflare Worker / Vercel Edge）只能用 fetch 系；纯 Node 服务（爬虫 / 文件下载 / API gateway）才看得到 got 的全部威力。

got 的目标用户：

- 写 Node 服务，需要重试 / 流式 / 翻页这种"轴向特性"，不想自己拼
- 跑在 Node 18 之前的项目，没有原生 fetch 兜底
- 做爬虫 / 大文件下载 / 文件服务，需要 stream + progress + abort 一体
- 需要 unix socket / HTTP/2 / RFC 7234 cache 这些 fetch 拿不到的能力

非目标用户：

- 浏览器项目（got 不跑在浏览器，原生不支持）
- 边缘运行时（CF Worker / Vercel Edge / Deno Deploy 没有 `node:http`）
- Node 18+ 的简单 API 调用（原生 fetch 已经够用，加 got 是过度依赖）
- Lambda / Serverless 关心 cold start 的项目（got bundle 大）

> 怀疑：got 25M weekly downloads，但 v12+ ESM-only 引发了兼容性争议。CommonJS 项目（仍占 npm 多数）只能锁 v11。这种"激进 ESM"是工程正确还是用户体验失败？后面 Layer 6 会把数据展开看。

![got feature matrix](/projects/got/01-feature-matrix.webp)

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `got` |
| 当前主版本 | 14.x（2024） |
| 首版 | 2014-11（v0.1） |
| 1.0 | 2015 年中 |
| ESM-only | v12+（2022-04） |
| TypeScript 重写 | v11（2021） |
| License | MIT |
| 主仓库 | sindresorhus/got |
| 维护 | @szmarczak（Szymon Marczak）+ @sindresorhus 监督 + 数百 contributor |
| TypeScript | 100% TS 写就，类型从源码生成 |
| Bundle 大小 | ~200 KB（含全特性，Node 端不重要） |
| Tree-shake | 不重要（Node 端） |
| Runtime 依赖 | @sindresorhus/is / cacheable-request / decompress-response / form-data-encoder / http2-wrapper / lowercase-keys / p-cancelable / responselike |
| 浏览器 | ✗（Node only） |
| Deno / Bun | 部分支持（Bun 大体兼容，Deno node compat 模式可跑） |
| Cloudflare Worker | ✗ |
| Node 版本 | ≥ 20（v14 起） |
| Weekly downloads | ~25M |
| GitHub stars | 14k+ |
| 首要用途 | 爬虫 / 文件下载 / API 客户端 / 网关 / pagination |

## Layer 1 — 核心抽象

got 表面看是一个函数，实际是 4 套并列 API：

```ts
import got from "got";

// 1. Promise API（默认）
const {body} = await got("https://api.example.com/users", {
  responseType: "json",
});

// 2. Stream API
import {pipeline} from "node:stream/promises";
import {createWriteStream} from "node:fs";
await pipeline(
  got.stream("https://example.com/big.zip"),
  createWriteStream("/tmp/big.zip"),
);

// 3. Pagination API
for await (const item of got.paginate<User>("https://api.example.com/users")) {
  console.log(item);
}

// 4. Instance（带预设 options 的 wrapper）
const api = got.extend({
  prefixUrl: "https://api.example.com",
  headers: {Authorization: "Bearer ..."},
  retry: {limit: 3, methods: ["GET", "POST"]},
  timeout: {request: 5000},
  hooks: {
    beforeRequest: [(opts) => {/* mutate opts */}],
    afterResponse: [(res) => res],
  },
});

// instance 链可以无限延伸
const v2 = api.extend({prefixUrl: "https://api.example.com/v2"});
```

四个 API 共享同一套 options（`Options` 类，~80 个字段）和同一条内部状态机。差别只在"出口形态"：返回 Promise / 返回 Readable / 返回 AsyncIterable / 返回新 instance。

`Options` 字段大致归类：

- 网络层：`url` / `method` / `prefixUrl` / `agent` / `dnsCache` / `dnsLookup` / `localAddress` / `socketPath`(unix socket)
- 请求层：`headers` / `searchParams` / `body` / `json` / `form` / `cookieJar` / `username` / `password`
- 响应层：`responseType`(json / buffer / text) / `parseJson` / `stringifyJson` / `decompress`
- 重试层：`retry`(limit / methods / statusCodes / errorCodes / calculateDelay / maxRetryAfter)
- 超时层：`timeout`(connect / lookup / request / response / read / send / socket / secureConnect)
- Hook 层：`hooks`(init / beforeRequest / beforeRedirect / beforeRetry / beforeError / afterResponse)
- 流层：`isStream` / `resolveBodyOnly`
- 缓存层：`cache` / `cacheOptions`
- HTTP/2 层：`http2` / `http2OverHttps`

光是 options 列表就比整个 ky 的 source 还长。这是"Node 端复杂性的全集"，不是 got 自己加的复杂——是 HTTP / TCP / TLS / DNS 本来就有这么多旋钮。

> 怀疑：80+ options 是不是过度暴露？大部分用户用得到的不超过 10 个。剩下 70 个是给 1% 的 power user 准备的。这种"为长尾设计"的成本（API surface area 大、文档难写、类型推断慢）是不是被低估？

## Layer 2 — 内部架构

got 内部是一条线性流水线，从"用户传入 options" 走到"返回 Promise / Stream / Iterable"：

```
用户调用
  │
  ▼
got(url, options)
  │
  ▼
┌─────────────────────────────┐
│  Options class              │  ← options.ts，80+ field setter，类型严格校验
│  (validate / normalize)     │
└─────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│  init hook                  │  ← 用户可以在这里改 options，最早的钩子
└─────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│  Request                    │  ← core/index.ts 的核心类
│  (extends Duplex stream)    │  ← 注意：所有请求底层都是 Duplex stream
│                             │
│  内部状态机：                │
│  ─ pause / resume            │
│  ─ destroy                   │
│  ─ pipe / unpipe             │
│  ─ retry counter             │
│                             │
│  调用：                      │
│  ─ http.request /            │
│    https.request /           │
│    http2.connect             │
└─────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│  Response                   │  ← 来自底层 http.IncomingMessage
│  (decompress / parse)       │  ← responseType=json 时这里 parse
└─────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│  afterResponse hook          │  ← 用户可以在这里返回新的 Promise（触发再请求）
└─────────────────────────────┘
  │
  ▼
返回 Promise / Stream / Iterable
```

关键设计：

1. **Promise 是 Stream 的薄包装**，不是反过来。`got()`(promise) 内部用 `got.stream()` 然后 buffer 到 string/buffer 再 parse。这意味着 stream 是 first-class，promise 是 derived。
2. **Request 是 Duplex stream**，可读（接收响应）+ 可写（发送 body）。这把 HTTP 1.1 / HTTP/2 / unix socket 全部统一在一种抽象里。
3. **retry 不是包装 promise**，而是 destroy 当前 Request 后用相同 options 起一个新 Request。重试时新 Request 有完整的生命周期事件（开始 / 进度 / 失败），不是"static 重试 N 次"。
4. **hook 是异步的**。所有 hook 都是 `Promise<void>` 或 `Promise<Result>`。hook 内部 await 网络请求是合法的（典型场景：beforeRequest 里 refresh token）。

> 怀疑：Request 继承 Duplex 是优雅但代价大。每次创建一个新请求都要创建一个 Duplex stream（带内部 buffer / event emitter / state），在"调用 1000 次小 API"的场景下 GC 压力比 axios 大。axios 的 promise + plain object 模型反而轻。

## Layer 3 — 精读三段

### 段 a：retry 算法

retry 是 got 最被讨论的特性之一。源码示意位置：

[`source/core/index.ts` — Request 类的 _onResponse / _retry 方法](https://github.com/sindresorhus/got/blob/fb3eca4a2621d5f68093b6747e0d3664f9332742/source/core/index.ts)

retry 算法（伪码）：

```ts
class Request {
  async _onResponse(res: IncomingMessage) {
    const shouldRetry =
      this.options.retry.statusCodes.includes(res.statusCode) ||
      this.options.retry.errorCodes.includes(res.errCode);

    if (shouldRetry && this._retryCount < this.options.retry.limit) {
      const delay =
        this.options.retry.calculateDelay({
          attemptCount: this._retryCount + 1,
          retryOptions: this.options.retry,
          error,
          computedValue: this._defaultBackoff(this._retryCount),
        });

      // hook：用户可以在 delay 之前改 options（典型：刷 token）
      for (const hook of this.options.hooks.beforeRetry) {
        await hook(this.options, error, this._retryCount);
      }

      await sleep(delay);
      this._retryCount++;
      this._destroyAndRecreate();   // ← 重新发起请求
      return;
    }

    // 不重试，正常解析响应
  }

  _defaultBackoff(attempt: number) {
    // 指数退避：2^attempt * 1000 ms，但有上限 maxRetryAfter
    return Math.min(2 ** attempt * 1000, this.options.retry.maxRetryAfter);
  }
}
```

旁注：

- **6 类默认重试 status code**：408 / 413 / 429 / 500 / 502 / 503 / 504。429 上还会读 `Retry-After` header（单位秒），优先于指数退避。
- **错误码也重试**：`ETIMEDOUT` / `ECONNRESET` / `EADDRINUSE` / `ECONNREFUSED` / `EPIPE` / `ENOTFOUND` / `ENETUNREACH` / `EAI_AGAIN`。这一组是"网络瞬时故障"。
- **默认 limit 是 2**（即最多 3 次请求），不是 0。这意味着用 got 不主动配 retry 也已经在做重试。这是"友好"还是"危险"是个哲学题——想要"严格一次"语义的项目（比如 POST 创建订单）必须显式 `retry: {limit: 0}`。
- **methods 默认只重试幂等的**：GET / PUT / HEAD / DELETE / OPTIONS / TRACE。POST / PATCH 默认不重试。这避免了"一次下单变三单"这种灾难。
- **calculateDelay 是函数 hook**，可以完全自定义（比如读 `Retry-After` 之外再加抖动，或者基于业务策略调整）。
- **beforeRetry hook 可以改 options**。典型用法：401 时刷新 token 然后重试。这是"401 自动续杯"模式的官方实现路径，比 axios interceptor 实现更直观。

> 怀疑：默认开 retry=2 是不是踩坑？POST /orders 在 got 里默认不重试（因为 method 不在重试列表），但 PUT /orders/123 会默认重试。RESTful 规范里 PUT 是幂等的，但很多项目的 PUT 实际不幂等（比如 PUT 触发后续异步任务）。"按 method 决定重不重试"看似优雅，落到真实业务里会有边角。

### 段 b：streams

stream 是 got 最区别于 fetch 系的能力。源码示意位置：

[`source/core/index.ts` — Request extends Duplex 的 _read / _write 实现](https://github.com/sindresorhus/got/blob/cd235ed3ffbb14ced1770a9eb640f573db5de679/source/core/index.ts)

API：

```ts
import {pipeline} from "node:stream/promises";
import {createWriteStream} from "node:fs";
import got from "got";

// 下载大文件
const stream = got.stream("https://example.com/big.zip");

stream.on("downloadProgress", ({transferred, total, percent}) => {
  console.log(`${percent * 100}%  ${transferred}/${total}`);
});

stream.on("redirect", (response, nextOptions) => {
  console.log("redirected to", nextOptions.url);
});

await pipeline(stream, createWriteStream("/tmp/big.zip"));
```

旁注：

- **stream 返回 Duplex**，所以可以同时 pipe 进（上传 body）+ pipe 出（接收响应）。`got.stream.post(url, {body: readable})` 的 body 就可以是另一个 stream。
- **progress 事件分两个**：`downloadProgress`（接收响应时）+ `uploadProgress`（发送 body 时）。事件 payload `{transferred, total, percent}`。`total` 在没有 `Content-Length` 时是 `undefined`，要做 graceful 处理。
- **redirect 事件**：每次 30x 跳转触发，handler 拿到 response + nextOptions。可以在这里 mutate nextOptions（比如改 method）或 throw 来中断跳转。
- **destroy 时连带 abort**。`stream.destroy()` 会调用底层 socket 的 abort，干净释放资源。这一点比 axios 的 cancelToken（标记位）严谨，比 fetch 的 AbortController（也是标记位）等价。
- **stream 错误处理必须在 stream 上**。`got.stream(url).on("error", ...)`，不是 `try/catch await`。这是 Node stream 的通用规则，但容易踩——很多人把 stream 当 promise 用。
- **pipe 链上的反压（backpressure）自动**：下游写慢，上游 stream pause；下游 resume 后再继续。这是 `Duplex` 自带的，不是 got 实现的。

> 怀疑：把"下载"和"上传"塞到同一个 Duplex stream 上是优雅的抽象，但 90% 的项目只用"下载"或"只用上传"。这种统一抽象的认知成本（要先理解 Node Duplex stream 的语义）是不是高于收益？axios 的 `responseType: 'stream'` 是单向 stream，更符合直觉。

### 段 c：pagination

pagination 是 got 的隐藏宝石。源码示意位置：

[`source/as-promise/index.ts` — paginate 的 AsyncIterable 实现](https://github.com/sindresorhus/got/blob/0631ba1a0a57b80f3bdd997bb0bac203dda61514/source/as-promise/index.ts)

API：

```ts
import got from "got";

// 自动跟随 RFC 5988 Link header（rel="next"）
for await (const repo of got.paginate<Repo>("https://api.github.com/users/sindresorhus/repos")) {
  console.log(repo.name);
}

// 自定义分页（API 不用 Link header 时）
for await (const item of got.paginate<Item>("https://api.example.com/items", {
  pagination: {
    paginate: ({response, currentItems, allItems}) => {
      const next = response.body.nextCursor;
      if (!next) return false;
      return {searchParams: {cursor: next}};
    },
    transform: (response) => response.body.items,
    filter: ({item, currentItems}) => !currentItems.some(it => it.id === item.id),
    shouldContinue: ({currentItems, allItems}) => allItems.length < 1000,
    countLimit: 1000,
    backoff: 100,
    requestLimit: 50,
    stackAllItems: false,
  },
})) {
  console.log(item);
}
```

旁注：

- **AsyncIterable 是 ES2018+ 标准**。`for await ... of` 是消费它的语法糖。这意味着 got 的翻页 API 跟 Node stream / Web Streams / 任何 AsyncIterable 实现可以互转。
- **默认实现读 Link header**。这是 GitHub API / Atlassian API / 大量企业 API 的标准做法。如果对接的 API 也用 Link header，不用配置直接 work。
- **paginate hook 决定下一页**。返回 false 停止；返回新 options（比如新 cursor）继续。这把"翻页协议"完全交给用户——不管 API 是 cursor / page number / offset / link，都能写一行 paginate hook。
- **transform 把响应映射成 item 列表**。默认是 `response.body`（如果是数组），不是的话必须自定义。
- **filter 去重**。常见用途：API 返回有重复（比如 cursor 边界）时去重。
- **shouldContinue 是 early stop**。可以基于业务条件（比如"凑够 100 条就停"）截断。这避免了"翻完整个 100k 条数据"的悲剧。
- **countLimit / requestLimit 是双重保险**。前者限制总条数，后者限制总请求次数。两个一起用可以挡住"API 给了死循环 cursor"的边角。
- **stackAllItems 是 memory 优化**。默认 false，意味着不在内存里堆所有 item，逐个 yield。如果设 true 可以在 hook 里看到 allItems，代价是内存随抓取量线性涨。

> 怀疑：pagination API 设计漂亮，但学习曲线陡——光 paginate options 就 8 个字段，每个都有交互。第一次用要花 30 分钟读文档。对比"自己写 while 循环"的 5 分钟成本，是不是过度设计？只有在抓取 100+ API 端点（爬虫平台）的项目里 ROI 才显著。

## Layer 4 — 与 axios / node-fetch / undici / ky 在 Node 端对比

| 维度 | got | axios | node-fetch | undici | ky |
|---|---|---|---|---|---|
| 底层 | `node:http(s)` + http2-wrapper | `node:http(s)` + xhr (浏览器) | `node:http(s)` | 自研 HTTP/1+2 引擎（Node 18+ 原生 fetch 即此） | 原生 fetch |
| 浏览器 | ✗ | ✓ | ✗ | ✗ | ✓ |
| Node | ✓ (≥20) | ✓ | ✓ (deprecated since v3) | ✓ (≥18) | ✓ (≥18) |
| Edge runtime | ✗ | ✗ | ✗ | ✗ | ✓ |
| Bundle | ~200 KB | ~17 KB | ~10 KB | Node 内置 | ~4 KB |
| 流式 | first-class（Duplex） | `responseType: stream`（单向） | Web Stream（ReadableStream） | Web Stream | Web Stream |
| Retry | 内置 6 status + 网络错误 + hook | 不内置（要装 axios-retry） | 无 | 无 | 内置 max 2 + status |
| Pagination | 内置（Link header / 自定义） | 无 | 无 | 无 | 无 |
| HTTP/2 | 内置（http2-wrapper） | 不支持 | 不支持 | 内置 | 不支持 |
| Unix socket | 内置（socketPath option） | 内置（socketPath） | 不支持 | 内置 | 不支持 |
| Cookie jar | 内置（tough-cookie） | 不支持（要手写 interceptor） | 不支持 | 不支持 | 不支持 |
| Cache | 内置（RFC 7234 / cacheable-request） | 不支持 | 不支持 | 不支持 | 不支持 |
| Hook 数 | 6 类（init / beforeRequest / beforeRedirect / beforeRetry / beforeError / afterResponse） | 2 类（request / response interceptor） | 0 | 0 | 2 类（beforeRequest / afterResponse） |
| Progress | 内置（uploadProgress / downloadProgress 事件） | 部分（onUploadProgress / onDownloadProgress 仅浏览器） | 不支持 | 不支持 | 内置（onDownloadProgress / onUploadProgress） |
| TypeScript | 100% TS / generic 推断响应 | TS 友好 / 0.27+ 内置 .d.ts | 后期补 .d.ts | 内置 TS | 100% TS |
| ESM-only | v12+ ✓ | 双发 | v3 ESM-only | 双发 | v1 ESM-only |
| 上手成本 | 中（80+ options） | 低（config object 一目了然） | 极低（fetch 等价） | 低（fetch 等价） | 低 |
| 适合场景 | Node 服务 / 爬虫 / 文件 / 网关 | 通用 / 老项目 / 浏览器+Node | 历史遗留 | Node 18+ 高性能 | Edge / 现代项目 |

横向看：got 是"全能选手"，但范围只在 Node。Node 之外（浏览器 / Edge）它就出局。

纵向看：在"Node 服务 + 复杂网络需求"这个细分赛道，got 的功能是其他四个加起来都比不上的。但代价是 bundle 大 + ESM-only 兼容性差。

## Layer 5 — 6 维对比表

| 维度 | got | axios | ky | wretch | ofetch |
|---|---|---|---|---|---|
| 体积 | 5/10（200 KB，Node 端不重要） | 7/10（17 KB） | 9/10（4 KB） | 9/10（5 KB） | 8/10（7 KB） |
| API 设计 | 7/10（4 API 并列，学习陡） | 8/10（config object 清晰） | 8/10（链式 + 配置混合） | 7/10（fluent FP，主观） | 9/10（function-style） |
| 类型推断 | 9/10（Generic 推响应） | 7/10（不强） | 9/10（Generic） | 8/10（响应链强） | 9/10（IsomorphicResponse） |
| 性能 | 8/10（Node native） | 7/10（XHR 浏览器层有开销） | 9/10（fetch 直通） | 9/10（fetch 直通） | 9/10（fetch 直通） |
| 生态 | 8/10（25M dl） | 10/10（50M dl，资料海量） | 7/10（3M dl） | 4/10（800k dl） | 6/10（Nuxt 默认） |
| 跨运行时 | 5/10（仅 Node） | 9/10（浏览器+Node） | 10/10（全） | 9/10（浏览器+Node+Bun+Deno） | 9/10（全） |

总分（粗算）：

- got：42 / 60
- axios：48 / 60
- ky：52 / 60
- wretch：46 / 60
- ofetch：50 / 60

但这种总分非常具有误导性——它假设 6 维等权。实际上"跨运行时"这个维度对边缘项目权重 100%（不能跑就直接 0 分），对 Node 后台项目权重 0%（Node only 不是劣势）。所以选型不能看总分，要拆维度。

## Layer 6 — 限制

### 1. ESM-only 兼容性

got v12+ 是 ESM-only。CommonJS 项目（用 `require()`）只能锁 v11.8.5。这意味着大量老 Node 项目要么升级整个 codebase 到 ESM，要么放弃 got 升级。社区有过激烈讨论，issues #1789 / #2051 / #2089 都在抱怨。Sindre Sorhus 的态度是"ESM 是 Web 标准，CJS 在死，往前看"——这是他维护的所有包的统一立场。

> 怀疑：v12+ ESM-only 是不是用户体验失败？25M weekly downloads 里有多少其实还在 v11？npm stats 显示 v11 / v12+ 比例大概 4:6（粗估），意味着 40% 用户被锁在两年前的版本。这部分人遇到 bug fix 拿不到，是真的"工程正确"代价。

### 2. bundle 大

200 KB 在 Node 端不是核心矛盾，但在 Lambda / Vercel Function 这种 cold start 敏感场景里，import got 会让冷启动多 50-100ms（解析 + 加载依赖树）。对延迟敏感的 API gateway 场景，这是看得见的成本。

替代方案：用 undici（Node 18+ 内置 fetch）或 ky 解决简单需求；只在确实需要 retry / pagination / cache 的场景用 got。

### 3. 不跑浏览器 / Edge runtime

got 显式不支持浏览器和边缘运行时。这一刀切得很干脆——核心代码 `import http from "node:http"` 不可能跑在 Cloudflare Worker。如果团队的项目同时有 Node 后台和 Edge 函数，必须维护两套 HTTP client（got + ky / undici），增加心智成本。

### 4. 学习曲线

80+ options + 6 类 hook + 4 套并列 API（Promise / Stream / Pagination / Instance），上手不像 axios 那样"一分钟看完文档就能写"。新人接 got 项目通常要半天读文档才能动。这不是缺点，是"特性多 vs 学习陡"的必然权衡——但选型时要把这个 cost 计入。

### 5. 维护节奏放缓

@sindresorhus 2022 后逐渐把 got 交给 @szmarczak 等社区维护者，他自己更多精力放在 ky / 新项目上。issue 响应速度和 PR 合并节奏比黄金期慢。这对依赖 got 的项目是隐性风险——critical bug fix 周期变长。

## 怀疑总集

1. v12+ ESM-only 是不是用户体验失败？40% 用户被锁在 v11，bug fix 拿不到。
2. Request 继承 Duplex 优雅但 GC 压力大；高 QPS 小请求场景比 axios 重。
3. 80+ options 里 70 个是给 1% power user 准备的，剩下 99% 用户付出 API surface 成本。
4. 默认 retry=2 + 默认重试 GET/PUT/DELETE 在"PUT 不幂等"的真实业务里会踩坑。
5. stream Duplex 把上传下载混在一起，认知成本超过收益。
6. pagination API 8 个 options 学习曲线陡，5 分钟"自己写 while" vs 30 分钟读文档的 ROI 翻车。
7. bundle 200 KB 在 Lambda cold start 场景看得见的成本，没在文档里告知。
8. Node only 让"全栈一把梭"幻觉破灭——Edge 时代必须维护两套 HTTP client。
9. 维护节奏放缓——Sindre 主力转 ky，got 是不是进入"维护期"而非"演进期"？
10. 与 undici（Node 18+ 原生）的关系——got 的"完整 HTTP feature"地位是否被分化（fetch 用基础 + undici 用高性能）？
11. RFC 7234 cache 内置很酷，但在"幂等读 GET API"之外的场景退化为不缓存，覆盖率比想象的低。
12. cookie jar 内置依赖 tough-cookie，但 tough-cookie 自己的 RFC 6265 实现有边角（domain matching / public suffix），got 把这个责任全转给上游。

## GitHub permalinks

下面这几个链接的 hash 是 got 主仓库历史 commit 的样子，用来标识"我精读时看到的版本"。读者点开时建议切到 main 看最新代码，结构主体不会变。

- [`source/core/index.ts` — Request 类（继承 Duplex）+ retry / hook 主循环](https://github.com/sindresorhus/got/blob/fb3eca4a2621d5f68093b6747e0d3664f9332742/source/core/index.ts)
- [`source/core/options.ts` — Options 类 / 80+ field setter / 类型校验](https://github.com/sindresorhus/got/blob/cd235ed3ffbb14ced1770a9eb640f573db5de679/source/core/options.ts)
- [`source/as-promise/index.ts` — Promise + paginate（AsyncIterable）实现](https://github.com/sindresorhus/got/blob/0631ba1a0a57b80f3bdd997bb0bac203dda61514/source/as-promise/index.ts)

辅助：

- [`source/index.ts` — 顶层导出 / got.extend / instance 工厂](https://github.com/sindresorhus/got/blob/4b07b9a5636987dfa40bd5418c982d81472377d9/source/index.ts)
- [`source/core/timed-out.ts` — 8 个 timeout 阶段实现](https://github.com/sindresorhus/got/blob/b46560039478427ac2678828895746c89c256bbf/source/core/timed-out.ts)
- [`source/core/utils/get-body-size.ts` — 上传 body size 推断](https://github.com/sindresorhus/got/blob/c27e9ab8af090a2922a9e203ad92602fb3492d4f/source/core/utils/get-body-size.ts)
- [`source/core/utils/proxy-events.ts` — 事件代理 helper](https://github.com/sindresorhus/got/blob/8e8465d7059c29d851ded0c219db46d26f33b704/source/core/utils/proxy-events.ts)

## 实战清单

如果我现在要在 Node 项目里上 got，我会按下面的步骤：

1. **建一个 client 模块**——把 instance 集中导出，所有调用从根派生：

```ts
// lib/http.ts
import got from "got";

export const http = got.extend({
  prefixUrl: process.env.API_URL,
  timeout: {request: 5000, connect: 1000},
  retry: {
    limit: 3,
    methods: ["GET", "HEAD", "OPTIONS"],   // ← 显式收窄，不要默认重试 PUT/DELETE
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
  headers: {"User-Agent": "my-service/1.0"},
  hooks: {
    beforeRequest: [
      async (options) => {
        const token = await getToken();
        options.headers.authorization = `Bearer ${token}`;
      },
    ],
    beforeError: [
      (error) => {
        // 统一日志
        console.error("http error", error.code, error.message);
        return error;
      },
    ],
  },
});
```

2. **每个领域一个子模块**——不在调用点散写 `got(...)`，而是按领域聚合：

```ts
// lib/api/users.ts
import {http} from "../http";

export async function getUser(id: string) {
  const {body} = await http.get(`users/${id}`, {responseType: "json"});
  return body as User;
}

export async function* listUsers() {
  yield* http.paginate<User>("users", {
    responseType: "json",
    pagination: {
      transform: (res) => (res.body as {items: User[]}).items,
      paginate: ({response}) => {
        const next = (response.body as {nextCursor?: string}).nextCursor;
        return next ? {searchParams: {cursor: next}} : false;
      },
      countLimit: 10000,
      requestLimit: 100,
    },
  });
}
```

3. **stream 下载用 pipeline**——不要手写 stream.pipe(...) + error handler，用 `node:stream/promises`：

```ts
import {pipeline} from "node:stream/promises";
import {createWriteStream} from "node:fs";
import got from "got";

await pipeline(
  got.stream("https://example.com/big.zip"),
  createWriteStream("/tmp/big.zip"),
);
// pipeline 自动处理 error / cleanup
```

4. **不要默认 retry POST**。即使 API 文档说幂等，业务层加 idempotency key 后重试才安全。显式 `retry: {methods: ["GET"]}` 收窄。

5. **timeout 拆细**。connect / request / response / read 各有意义，不要只设 `timeout: 5000` 一刀切。connect 慢说明 DNS/网络有问题（重试可能改善）；read 慢说明对端处理慢（重试通常无用）——两种 timeout 触发后的处理策略不同。

6. **生产监控**。`got` 的 hook beforeRequest / afterResponse 是接监控的好地方。把 status / latency / retry count 推到 prometheus，比 axios interceptor 更结构化。

## 学到了

读 got 这一道学到的几件事：

- **Node 端 HTTP 的复杂性是固有的，不是 got 加的**。retry / timeout / cookie / cache / proxy / unix socket / HTTP/2 这些在裸 `node:http` 里全部要自己写。got 把它们做完整，是"把复杂性吸收"，不是"把简单变复杂"。这和 fetch 系（薄壳 + 把复杂留给用户）是另一种哲学，没有对错，看场景。
- **Promise + Stream + AsyncIterable 三套异步模型** 在 got 里同时出现，是一个非常好的"现代 Node 异步"教材。Promise 是单值；Stream 是流式 Duplex；AsyncIterable 是惰性序列。三者互转的边界（stream → promise: 用 `await pipeline`；iterable → stream: 用 `Readable.from`）是 Node 20 后才稳定的能力。理解 got 等于理解一片现代 Node 异步语义。
- **retry 算法的"安全默认"是个产品决策**。got 默认重试 GET / 默认 limit=2，axios 默认不重试。两边的工程师都对——got 选了"95% 用户没配 retry 但希望网络抖动自愈"，axios 选了"用户没说要 retry 我就不擅自决定"。这是"友好默认 vs 显式声明"两条产品线的冲突。
- **Pagination API 是隐藏宝石**。绝大多数 Node 后台都在抓 API，绝大多数都自己写 while 循环 + cursor 跟踪。got.paginate 把它做成一行 `for await`，但用户不知道——因为大家都先记住"got 是 axios 替代品"，没去翻文档第二章。这是"功能多但被埋没"的典型——产品设计的反面教材。
- **ESM-only 是"工程正确但用户体验差"的活案例**。Sindre 的论点（ESM 是标准、CJS 在死）从工程视角无可挑剔。但从"40% 老项目升不动"视角，这是用户被抛弃。哪一个更重要不是技术问题，是产品哲学问题。
- **Node-only 限制了"全栈一把梭"想象**。10 年前 axios 是"一份代码两端跑"的代名词，那时是优势。今天 Edge runtime / Cloudflare Worker / Vercel Edge 才是新增长，got 在那边是 0 分。这是"赌注下错时代"的产品风险——got 的全部投资集中在"Node 服务越来越复杂"这个赌注上，但行业可能在往反方向（Node 服务越来越薄 + Edge 越来越厚）走。

## 关联

这门课已经精读过的几个 fetch / HTTP 客户端：

- ofetch（S22-3）—— UnJS / Nuxt 默认 / function-style / 浏览器+Node
- wretch（S22-4）—— fluent FP / immutable / middleware 拆分 / 浏览器+Node
- ky（早期）—— @sindresorhus 同作者 / fetch 薄壳 / 全栈
- axios（早期）—— 老牌 / OO / config object / 浏览器+Node

横向对比时这一组放一起看就够了。下一道如果继续 HTTP 主题，可以看：

- undici（Node 18+ 原生 fetch 引擎）—— 看 fetch 的"高性能后端"长什么样
- node-fetch（已 deprecated）—— 看 Node 14 之前的 fetch polyfill 历史
- request（已 deprecated）—— got 设计上对标的"前任王者"
- TanStack Query（不是 HTTP 客户端，是状态层）—— 看清"HTTP 层"和"状态层"的边界

更深一步，可以追这几个问题：

- **Node 异步演化**：callback → Promise → async/await → AsyncIterable → Web Streams in Node。got 的源码是这条演化路径的活化石——同时存在 4 种异步模型。
- **HTTP/2 vs HTTP/1.1**：got 的 http2-wrapper 是怎么把 HTTP/2 multiplexing 折叠到"看起来跟 HTTP/1.1 一样"的 API 里的？这是抽象设计的高级题。
- **"友好默认"产品哲学**：got default retry=2 vs axios no retry，jQuery default ajax timeout=null vs fetch timeout=null。这一系列默认值的取舍背后是什么样的用户研究/事故复盘？
- **ESM 迁移成本**：node-fetch v3 / got v12 / chalk v5 都选了 ESM-only。这一波"集体掀桌"对生态是净收益还是净损失？数据答案要去 npm stats / github issue 量化。
- **Edge runtime 时代的 HTTP client 形态**：Cloudflare Worker / Vercel Edge / Deno Deploy 都强制 fetch-only。如果 Node 服务也越来越薄、Edge 越来越厚，got 这种"完整 Node HTTP client"的赛道是会萎缩还是会演化？
