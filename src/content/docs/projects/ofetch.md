---
title: ofetch — UnJS 现代 fetch 包装
来源: https://github.com/unjs/ofetch + UnJS 组织主页 unjs.io + Nuxt 3 文档 nuxt.com/docs/api/utils/dollarfetch
---

# ofetch — Nuxt 背后的那个 $fetch

## 一句话总结

ofetch 是 UnJS 团队（Pooya Parsa @pi0 主导，Nuxt 核心维护者）2022 年推出的现代化 fetch wrapper，到 2026 年稳定在 1.x 系列。它的姿态非常明确：不和 axios 抢"老项目兼容"的地盘，也不和 ky 拼"最薄"，而是定位"**Nuxt 3 / Nitro 默认 HTTP 客户端**"，顺便兼容浏览器、Node 18+、Deno、Bun、Cloudflare Worker 全栈。

设计哲学一句话：fetch 是 Web 标准，runtime 都已经原生支持，所以**ofetch 自己不再造网络层**，只在 fetch 上加四件事：

1. 自动 JSON（请求体 + 响应体）
2. 智能 retry（仅幂等方法 + 特定状态码 + 指数退避）
3. baseURL / params / headers / hooks 等"正常项目都得手写一遍"的胶水
4. SSR 友好（在 Node 端同样能透传 cookie / header，不假设 window）

ofetch 和 Nuxt 的关系是这门课最该理解清楚的一件事。Nuxt 3 项目里写的 `$fetch(...)` 不是新东西，它就是 ofetch.create 出来的实例 + 注入到 SSR 上下文。换句话说：你以为在用 Nuxt API，其实在用 ofetch。这种"框架 default = 独立库"的拆法在 UnJS 几乎是统一模式。

bundle ~7 KB（min+gzip）。在三家主流 fetch wrapper 里：ky 4 KB / ofetch 7 KB / axios 17 KB。多出来的 3 KB 主要是 destr（安全 JSON parse）+ ufo（URL utils）+ SSR hooks 这三块。

ofetch 的目标用户：

- 在写 Nuxt 3 / Nitro / 任何基于 h3 的 server，自然就用上了
- 跑在 edge runtime（Cloudflare Worker / Vercel Edge / Deno Deploy）需要原生 fetch + 标准 API
- 想要"axios 那种 DX"但又不想引入 axios 那么大的包

非目标用户：

- 维护老 axios 项目（迁移成本不划算）
- React / Next.js 项目（社区惯性更偏向 axios + react-query 或 SWR + native fetch）
- 写纯 Node 后端 + 大量流式下载（用 got 更合适）

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `ofetch` |
| 当前主版本 | 1.x（自 2023 起稳定） |
| 首版 | 2022-08（v0.x，最早叫 ohmyfetch） |
| 改名 | 2022-10 ohmyfetch → ofetch（统一 UnJS 命名） |
| License | MIT |
| 主仓库 | unjs/ofetch |
| 维护组织 | UnJS（Unified JS Tools） |
| 主要维护者 | Pooya Parsa（@pi0，Nuxt core team lead） |
| TypeScript | 100%，类型推断响应体（带 generic） |
| Bundle 大小 | ~7 KB min+gzip |
| Tree-shake | 友好（pure ESM，CJS 通过 unbuild 双发） |
| Runtime 依赖 | destr + ufo + node-fetch-native（仅 Node < 18 fallback） |
| 浏览器 | ✓ |
| Node | ≥ 14（≥ 18 用原生 fetch，否则 polyfill） |
| Deno / Bun / CF Worker | ✓（edge runtime 一等公民） |
| Weekly downloads | 4M+（2026） |
| GitHub stars | 4k+ |
| 商业版 | 无 |
| 文档站 | unjs.io/packages/ofetch |
| 主要文件 | src/fetch.ts / src/utils.ts / src/types.ts / src/error.ts |
| 与 Nuxt 关系 | Nuxt 3 的 `$fetch` 就是 ofetch 实例 |
| 与 Nitro 关系 | Nitro 内部用 ofetch 做 server-to-server 请求 |
| 测试 | vitest + happy-dom + node：listen |
| 发布频率 | 月度 minor / patch |
| Breaking changes | 1.0 后稳定，遵循 semver |

## Layer 1 — 核心抽象

ofetch 暴露一个函数 + 一个工厂 + 一个 raw 形式：

```ts
import { ofetch } from "ofetch";

// 1. 直接调用（最常见）
const user = await ofetch<User>("/api/users/1");
//          类型推断 ↑

// 2. POST 带 body（自动 JSON.stringify + Content-Type）
const created = await ofetch<User>("/api/users", {
  method: "POST",
  body: { name: "Alice" }   // ← object，不需要 JSON.stringify
});

// 3. 创建 instance（带 defaults）
const api = ofetch.create({
  baseURL: "https://api.example.com",
  retry: 3,
  timeout: 5000,
  headers: {
    Authorization: "Bearer ..."
  },
  onRequest({ request, options }) {
    options.headers = options.headers || {};
    options.headers["X-Trace-ID"] = crypto.randomUUID();
  },
  onResponseError({ response }) {
    if (response.status === 401) {
      // 401 处理
    }
  }
});

// 4. 用 instance
const data = await api<User[]>("/users");

// 5. raw 形式：拿到 Response + headers + status + _data
const res = await ofetch.raw<User>("/api/users/1");
console.log(res.status, res.headers.get("etag"), res._data);
```

在 Nuxt 3 里：

```ts
// pages/index.vue
const data = await $fetch<User[]>("/api/users");
//           ↑ 这就是 ofetch
```

`$fetch` 是 Nuxt 注入的全局别名，等价于一个预配置好 baseURL（指向自己 API） / 透传 SSR 上下文的 ofetch 实例。这是为什么 Nuxt 文档里几乎不再提 ofetch 这个名字——它被 framework 接管了。

四要素：

1. **统一入口** `ofetch(url, options)` 替代 axios.get / post / put / delete 等多方法
2. **method 通过 options.method** 默认 GET（不是链式 `.get()`）
3. **body object 自动转 JSON** + 自动 `Content-Type: application/json`
4. **响应体自动解析** 根据 Content-Type 决定 json / text / blob，并通过 destr 安全 parse

ofetch 和 ky 在抽象层最大的差别：

- ky：链式 `ky.get(url).json<T>()`，`.json()` 才真正发请求（lazy）
- ofetch：`ofetch<T>(url, opts)`，立即返回 Promise<T>（eager）

ky 偏向 "fluent builder"，ofetch 偏向 "single function call"。两种风格都有道理。ofetch 选 single function 是因为：在 SSR / 模板里用 await 时，没有任何额外的 `.json()` 步骤更顺手。

## Layer 2 — 内部架构

ofetch 内部分四块（参考 `src/fetch.ts`）：

```text
┌──────────────────────────────────────────────────┐
│  createFetch({ fetch, Headers })                 │
│  ↓                                               │
│  $fetchRaw(request, options)                     │
│    1. 解析 input：URL / Request / string         │
│    2. 合并 defaults + options                    │
│    3. 自动 body：object → JSON.stringify         │
│    4. 调用 onRequest hook                        │
│    5. fetch(req)  ← 真正发请求                   │
│    6. 调用 onResponse hook                       │
│    7. parseResponse 根据 content-type 解析体     │
│    8. 4xx/5xx → 抛 FetchError                    │
│    9. retry 包装层：retryStatusCodes 命中就重试  │
│  ↓                                               │
│  $fetch(request, options) → response._data       │
│  $fetch.raw(...) → 整个 FetchResponse            │
│  $fetch.create(defaults) → 新 fetch              │
└──────────────────────────────────────────────────┘
```

工程要点：

1. **薄封装**：80% 行为是原生 fetch，ofetch 只加 retry / hooks / parseBody
2. **Eager**：返回 Promise 直接 await（不像 ky 的 lazy）
3. **baseURL**：通过 ufo `joinURL()` 拼，不用手写 `/` 边界判断
4. **params**：通过 ufo `withQuery()` 序列化（自动跳过 undefined）
5. **body**：object 自动 JSON.stringify + Content-Type；FormData / URLSearchParams 直传
6. **destr**：响应体不直接 `JSON.parse(text)`，用 destr — 失败回退到原始 text 而不是抛异常
7. **FetchError**：自定义 error 含 `request / options / response / data / status / statusText`
8. **node-fetch-native**：Node < 18 自动 polyfill；Node ≥ 18 用原生
9. **createFetch**：导出工厂，让 Nuxt / Nitro 注入自己的 fetch 实现（serverFetch）

ofetch 的"创新"几乎都在 DX 层。和 ky 一样，它没在网络层加任何"魔法"——这是它能保持 ~7 KB 的关键。

> 怀疑：ofetch 把 destr 作为依赖（多 ~1.5 KB）值不值？destr 解决"响应不是合法 JSON 但 Content-Type 错标"的极端 case。普通 API 99% 不会触发。我猜 UnJS 选 destr 是因为同一团队产物，零成本接入；如果是独立项目就不一定愿意带这个依赖。ky 没带 destr，直接 JSON.parse，错了就抛 SyntaxError——更严格但也更脆。

## Layer 3 — 精读 3 段

### 段 a — parseResponse 智能（自动选解析方法）

ofetch 在拿到 fetch Response 后自动决定怎么解析，不需要用户再 `.json()` / `.text()`：

```ts
// 伪代码（参考 src/fetch.ts 的 parseResponse 逻辑）
async function parseResponse(response: Response, options: FetchOptions) {
  const contentType = response.headers.get("content-type") || "";

  if (options.parseResponse) {
    return options.parseResponse(await response.text());
  }

  // 1. JSON 类型：destr 安全 parse
  if (isJSONSerializable(contentType) || contentType.includes("json")) {
    const text = await response.text();
    return destr(text);  // destr 失败回退到原始 text
  }

  // 2. text 类型
  if (contentType.startsWith("text/")) {
    return await response.text();
  }

  // 3. 二进制：blob
  if (isBinaryContentType(contentType)) {
    return await response.blob();
  }

  // 4. 兜底：text + destr 试一次
  const text = await response.text();
  return destr(text);
}
```

旁注：

1. **isJSONSerializable** 不止判断 `application/json`，还包含 `application/vnd.api+json` / `application/ld+json` 等（参考 `src/utils.ts`）
2. **destr 行为**：合法 JSON 走 JSON.parse；不合法但能解析（如 `null` / `true` / `42`）也能 parse；完全不合法回退到原始 text，**不抛异常**
3. **二进制识别**：`image/*` / `audio/*` / `video/*` / `application/pdf` / `application/octet-stream` 走 blob 分支
4. **优先级**：用户传 `parseResponse: customFn` 时优先用户的（短路所有自动判断）
5. **流式响应**：ofetch 本身不暴露 stream API；要流读直接用 `ofetch.raw()` 拿 Response 对象再用 `.body.getReader()`
6. **响应是空体**（204 No Content / 205）：destr("") → undefined，不会报错

> 怀疑：destr 兜底"失败回退到 text"看起来友好，但会掩盖真实 bug。比如 server 误返了 HTML 错误页，content-type 是 text/html，按 step 2 走 text 分支拿到 HTML 字符串，业务代码拿到一个奇怪的 string 而不是错误。ky 选择更严格抛 SyntaxError 反而能更早发现问题。哪种更好？我猜：开发期 ky 风格好（早暴露），生产期 ofetch 风格好（不挂掉）。可以通过自定义 parseResponse 切换。

链接示意（提交哈希为占位 40 hex，非真实 commit）：
[github.com/unjs/ofetch/blob/3a7b4d9e2c1f8b6e5d4c3a2b1f0e9d8c7b6a5d4c/src/fetch.ts](https://github.com/unjs/ofetch/blob/3a7b4d9e2c1f8b6e5d4c3a2b1f0e9d8c7b6a5d4c/src/fetch.ts)

### 段 b — 与 Nuxt $fetch / useFetch / useAsyncData 集成

Nuxt 3 在 `$fetch` 之上又包了 useFetch / useAsyncData 两个 composable，这三层关系经常被搞混：

```ts
// 第 1 层：原始 ofetch
import { ofetch } from "ofetch";
const data = await ofetch("/api/users");

// 第 2 层：Nuxt 注入的 $fetch（= ofetch instance + baseURL 注入）
const data = await $fetch("/api/users");
// 等价于：ofetch("/api/users", { baseURL: useRuntimeConfig().public.apiBase })

// 第 3 层：useFetch（响应式封装）
const { data, pending, error, refresh } = await useFetch("/api/users");
// 它内部 = useAsyncData(key, () => $fetch(url, opts))
// 自动 dedupe / SSR payload 复用 / Vue 响应式包装

// 第 4 层：useAsyncData（更通用，不限于 HTTP）
const { data } = await useAsyncData("users", () => $fetch("/api/users"));
```

旁注：

1. **`$fetch` 是 ofetch 实例**：源码在 nuxt 仓库的 packages/nuxt/src/app/composables/fetch.ts，调用 `createFetch({ fetch: globalThis.fetch })`
2. **`useFetch` 是 composable**：在 SSR 阶段会把响应序列化到 payload，client hydrate 时直接复用，**避免重复请求**
3. **dedupe 机制**：useFetch 用 key 去重，同一 key 在同一次渲染中只发一次 fetch
4. **SSR payload**：Nuxt 通过 `useNuxtApp().payload.data[key]` 把 server 端的响应注入到 HTML，client 端 hydration 时跳过 fetch
5. **server-side 用 `$fetch`**：在 Nitro server route 里，`$fetch` 也存在但行为不同 — 它指向同一进程内的另一个 server route，**不发真实 HTTP**（直接函数调用）
6. **错误透传**：useFetch 的 error 是 ofetch 的 FetchError，可以拿 .response.status / .data 做精细处理

> 怀疑：Nuxt 把"composable 自动 SSR payload 复用"做得太自然，导致很多人不理解为什么 useFetch 在 SSR 时只发一次请求。问题是：如果业务逻辑需要 client 永远重新请求（比如时间敏感数据），用户该用 useFetch 加 `server: false` 还是直接用 `$fetch` ？答案：用 `$fetch` 在 onMounted 里调，绕过 useFetch 的 cache 层。但很多人继续硬写 useFetch + watch hack。这是 framework 抽象的"成本"。

### 段 c — SSR / hydration（cookie / header forwarding）

SSR 时 fetch 一个 API，需要把浏览器原本的 cookie / header 透传给 server-side fetch，否则 API 看到的是"裸 server fetch"——没有用户身份。这是所有 SSR 框架（Next.js / Nuxt / SvelteKit）都得解决的问题。

ofetch 不直接做 cookie 透传，但**给了 hooks**让 Nuxt 注入透传逻辑：

```ts
// Nuxt 内部（简化）：
const $fetch = ofetch.create({
  onRequest({ request, options }) {
    if (import.meta.server) {
      // server 端：把当前 SSR 请求的 cookie / headers 透给下游
      const event = useRequestEvent();
      const cookie = event.req.headers.cookie;
      options.headers = {
        ...options.headers,
        cookie,
        "x-forwarded-for": getRequestIP(event),
        "x-forwarded-host": event.req.headers.host
      };
    }
    // client 端：浏览器自动带 cookie，不需要做事
  }
});
```

旁注：

1. **why 透传**：SSR 阶段 Node 进程发的 fetch 是新连接，不带浏览器 cookie，所以需要从当前 SSR 请求的 event 里取出来手动塞
2. **why on Nuxt 端**：ofetch 不知道"当前 SSR 请求"是什么，所以这层逻辑必须放 framework 端
3. **import.meta.server**：Nuxt 编译时常量，server / client 都会执行同一份代码，运行期通过这个常量分支
4. **safety**：透传 cookie 要小心 — 不能透给跨域 API，否则用户 cookie 泄漏到第三方。Nuxt 通过 `baseURL` 域名校验做防护
5. **payload reuse**：除了 cookie 透传，Nuxt 还在 SSR 阶段把 fetch 结果序列化到 HTML payload，client hydration 时直接拿 — 不再发请求
6. **edge runtime 兼容**：Cloudflare Worker 没有 Node 内置 process / fs，但 ofetch 不依赖这些，所以 edge runtime 直接能跑

> 怀疑：SSR 透传 cookie 这种"框架特定的胶水"放在 ofetch 里还是 Nuxt 里？UnJS 选了"放 Nuxt 里" — ofetch 只暴露 hooks，Nuxt 实现具体策略。这种分层是 UnJS 的整体哲学：**底层包 0 框架假设，框架包做 glue**。好处：ofetch 在非 Nuxt 项目（比如 SvelteKit）也能用；坏处：每个 framework 都要重新实现一遍透传，代码重复。

链接示意：
[github.com/unjs/ofetch/blob/4f5e6d7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e/src/utils.ts](https://github.com/unjs/ofetch/blob/4f5e6d7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e/src/utils.ts)
[github.com/unjs/ofetch/blob/5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b/src/types.ts](https://github.com/unjs/ofetch/blob/5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b/src/types.ts)

![ofetch 与 UnJS 生态架构](/study/projects/ofetch/01-architecture.webp)

## Layer 4 — 与 axios / ky / fetch / wretch 对比

ofetch 在 fetch wrapper 这个赛道里不是最早也不是最薄，它的差异化定位是"**框架默认**"。下面四点对照：

**vs 原生 fetch**：

- 原生 fetch 是标准但 DX 难用：4xx/5xx 不抛异常 / 没 retry / 没 baseURL / body 必须手动 JSON.stringify
- ofetch 把上面四件事变默认行为
- 原生 fetch bundle 0；ofetch ~7 KB
- 真正全用原生 fetch 的项目几乎没有 — 业务代码会自己写 wrapper，最后写成"半个 ofetch"

**vs axios**：

- axios 在 Node 里走 http 模块，浏览器走 XHR。ofetch 全栈走 fetch
- axios bundle 17 KB；ofetch 7 KB
- axios 配置式 interceptors `.use()` 返回 id 可 eject；ofetch hooks 是数组配置式（不能动态拆）
- axios 不支持 Cloudflare Worker / Deno；ofetch 一等公民
- axios 生态成熟（mock-adapter / retry-axios / 拦截器中间件）；ofetch 生态浅
- 从 axios 迁 ofetch：interceptor → hooks 是结构性重写，不是简单 rename

**vs ky**：

- 都是 fetch wrapper，bundle 都很小（ky 4 / ofetch 7）
- ky 链式 `.json()` lazy；ofetch 直接 `await` eager
- ky 0 runtime 依赖；ofetch 依赖 destr + ufo + node-fetch-native polyfill
- ky 生态独立；ofetch 是 Nuxt 默认
- ky 错误抛 HTTPError；ofetch 抛 FetchError，字段差不多但名字不同
- 选谁：写 Nuxt 选 ofetch（自动接入），其他项目偏好"零依赖 + 链式" 选 ky

**vs wretch**：

- wretch 是 2017 年的 fetch wrapper，bundle 3 KB（最薄）
- 链式更夸张：`wretch().url("/").get().json()`
- 社区比 ky / ofetch 都小
- 没有 SSR / 框架集成
- 选谁：99% 情况选 ky 或 ofetch，wretch 适合追求极致薄

**vs got**：

- got 是 Node-only 的 HTTP 客户端（TJ Holowaychuk → Sindre 接手）
- bundle ~50 KB，但功能最全：stream / hooks / pagination / cookie jar
- 不能在浏览器跑
- 选谁：纯 Node 后端 + 大量爬虫 / 流式下载选 got；其他全栈选 ofetch

## Layer 5 — 6 维对比表（≥ 7 竞品）

| 维度 | ofetch | ky | axios | wretch | got | native fetch | superagent |
|---|---|---|---|---|---|---|---|
| 首版 | 2022 | 2018 | 2014 | 2017 | 2017 | 2015 (spec) | 2011 |
| Bundle (gzip) | ~7 KB | ~4 KB | ~17 KB | ~3 KB | ~50 KB | 0 | ~30 KB |
| Runtime 依赖数 | 3 | 0 | 多个 | 0 | 多个 | 0 | 多个 |
| 浏览器 | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| Node | ≥ 14 | ≥ 18 | 全 | ≥ 14 | ≥ 14 | ≥ 18 | 全 |
| Deno / Bun | ✓ | ✓ | 部分 | ✓ | ✗ | ✓ | ✗ |
| Cloudflare Worker | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ |
| API 风格 | 单函数 + options | 链式 | config object | 链式 builder | config object | 标准 | 链式 |
| 自动 JSON | 双向 | 双向 | 双向 | 双向 | 双向 | 无 | 双向 |
| Retry 内置 | ✓ | ✓ | 插件 | 插件 | ✓ | ✗ | 插件 |
| Hooks | 4 种 | 4 种 | interceptors | 中间件 | hooks | 无 | 无 |
| TypeScript | 一等 | 一等 | 一等 | 一等 | 一等 | 标准 | 类型差 |
| SSR 友好 | ✓（Nuxt） | 无特化 | 无 | 无 | N/A | 需手写 | 无 |
| 框架集成 | Nuxt / Nitro | 无 | 无 | 无 | 无 | 无 | 无 |
| Stream 支持 | raw + Response | 有限 | 是 | 是 | 强 | 标准 | 有 |
| Weekly downloads | 4M+ | 3M+ | 50M+ | 100K+ | 30M+ | N/A | 5M+ |
| GitHub stars | 4k+ | 13k+ | 105k+ | 4.5k+ | 14k+ | N/A | 16k+ |
| 生态 | UnJS 全家 | 独立 | 大 | 小 | 中 | 浏览器 / Node | 旧 |
| 主要痛点 | Vue 绑定 | 链式不直观 | bundle 大 | 文档少 | 仅 Node | DX 差 | 老 API |
| 推荐场景 | Nuxt / 全栈 edge | 现代项目 / TS | 老项目 | 极致薄 | Node 爬虫 | 极简 | 维护项目 |

观察：

1. ofetch 在"框架集成"这一栏唯一打钩。这是它的护城河也是天花板
2. ofetch + ky + wretch 都押注 fetch 路线，区别只是哲学和细节
3. axios 用户量是 ofetch 的 12 倍，stars 是 26 倍。但增速 ofetch 更快
4. got 在浏览器栏打叉，所以根本不在同一个赛道
5. native fetch + react-query 这种组合理论上够用，但实际项目里大多还是会写一个 wrapper，最后看起来就像 ofetch / ky

## Layer 6 — 限制与风险

**限制 1：框架绑定的双刃剑**

ofetch 是 Nuxt 默认。这意味着：

- 在 Nuxt 项目里几乎不需要选型，开箱即用
- 在 Vue（非 Nuxt） / React / Svelte 项目里，没有"自动配置 baseURL / SSR 透传"的好处
- 离开 Nuxt 生态后，ofetch 和 ky 的差距迅速缩小到只有 destr 和 hooks 命名差异

实际后果：React / Next.js 项目几乎不用 ofetch — 它们有 native fetch + react-query / SWR + axios。社区惯性是真实存在的。

> 怀疑：ofetch 是 Nuxt 默认，但 React / Next.js 项目几乎不用。能否突破 Vue 生态边界？我猜：很难。生态绑定既是优势又是天花板。一个反例是 zod / valibot — 它们是 framework-agnostic 但社区接受度极高，因为 schema 验证不需要框架配合。ofetch 的"SSR 透传"恰好是需要框架配合的，所以注定难跨生态。

**限制 2：UnJS 生态的认知负担**

UnJS 旗下 30+ 包：h3 / nitropack / unstorage / unimport / unbuild / ufo / destr / consola / ohash / radix3 / pkg-types ……每个都是"小而美"的独立包。ofetch 用 ufo + destr + node-fetch-native 三个内部依赖。

好处：单包小、零冗余、组合灵活
坏处：

- 学习曲线 = ofetch + ufo + destr + 整个 UnJS 风格
- 文档分散在每个包的 README，没有一个统一文档站讲"它们怎么协作"
- 升级一个包可能引发链式版本冲突

> 怀疑：UnJS 全家（h3 / nitropack / unjs/* 30+ 包）哲学是 "unified js"，但每个包学习曲线 + 文档负担相加。这种 monorepo 矩阵能维持吗？我猜：在 Nuxt 持续大火期间能维持（Nuxt 是 UnJS 的最大用户和最大贡献来源），一旦 Nuxt 增长放缓，UnJS 这种"为了 Nuxt 而拆"的体系会面临质疑：为什么不像 axios / ky 一样做单包？

**限制 3：无内置 mock / dev-tools**

axios 有 axios-mock-adapter，ky 有 msw 集成示例，ofetch 缺乏官方 mock 方案。Nuxt 用 nitro 的 dev server 路由做 mock，但脱离 Nuxt 后 ofetch 用户得自己接 msw。

这其实是 fetch wrapper 的共性问题 — fetch 标准没有 mock 概念，所以都要靠 service worker（msw）这种工业方案。但 axios 因为是 XHR / http 双层包装，可以更简单地从内部 swap，所以 axios-mock-adapter 那种"零配置 mock"在 fetch 时代就消失了。

**限制 4：流式下载支持弱**

ofetch 不暴露 stream 友好 API。要做 stream 必须用 `ofetch.raw()` 拿到 Response 再用 `.body.getReader()`。对比 got 的 `got.stream(url).pipe(fs.createWriteStream(...))`，ofetch 在 Node 大文件下载场景明显不如。这也呼应了"ofetch 是给应用层用的，不是给 Node 后端密集网络层用的"定位。

## 怀疑总集

1. destr 作为依赖（多 ~1.5 KB）值不值？普通 API 99% 不会触发回退路径
2. 自动 parseResponse 的"fallback 到 text"会掩盖真实 bug，开发期反而该用 ky 风格的严格抛错
3. Nuxt useFetch 的 SSR cache 自动复用很自然，但很多人搞不清 `$fetch` / `useFetch` / `useAsyncData` 三层关系
4. SSR cookie 透传放在 Nuxt 而非 ofetch，跨框架时每个框架都要重新写一遍
5. ofetch 是 Nuxt 默认，但能否突破 Vue 生态边界？我猜很难
6. UnJS 30+ 包的 monorepo 矩阵，在 Nuxt 增长放缓后能否维持？
7. 没有内置 mock 方案，开发期 DX 不如 axios + axios-mock-adapter

## 链接示意（permalinks）

注意：以下 commit hash 为 40 字符占位 hex，不是真实 commit。真实的请到 unjs/ofetch 仓库主分支查最新 sha 替换。

- [src/fetch.ts — createFetch / parseResponse / retry 主流程](https://github.com/unjs/ofetch/blob/3a7b4d9e2c1f8b6e5d4c3a2b1f0e9d8c7b6a5d4c/src/fetch.ts)
- [src/utils.ts — isJSONSerializable / isBinaryContentType / mergeFetchOptions](https://github.com/unjs/ofetch/blob/4f5e6d7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e/src/utils.ts)
- [src/types.ts — FetchOptions / FetchContext / FetchHook 类型定义](https://github.com/unjs/ofetch/blob/5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b/src/types.ts)
- [src/error.ts — FetchError class + createFetchError 工厂](https://github.com/unjs/ofetch/blob/6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d/src/error.ts)

读源码顺序建议：
1. 先 `src/types.ts` 看类型契约（FetchOptions / FetchContext / hooks 签名）
2. 再 `src/fetch.ts` 的 `createFetch` 看主流程
3. 然后 `src/utils.ts` 看 helper（especially mergeFetchOptions / isJSONSerializable）
4. 最后 `src/error.ts` 看错误对象怎么挂上 request / response / data

整个 src/ 目录加起来不到 600 行 TS，半天能读完。

## 实战：从 axios 迁移 ofetch

**Before（axios）**：
```ts
import axios from "axios";

const api = axios.create({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: { Authorization: "Bearer ..." }
});

api.interceptors.request.use((config) => {
  config.headers["X-Trace-ID"] = uuid();
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await refresh();
      return api.request(err.config);  // retry
    }
    throw err;
  }
);

const { data } = await api.get<User[]>("/users");
```

**After（ofetch）**：
```ts
import { ofetch } from "ofetch";

const api = ofetch.create({
  baseURL: "https://api.example.com",
  timeout: 5000,
  headers: { Authorization: "Bearer ..." },
  onRequest({ options }) {
    options.headers = options.headers || {};
    options.headers["X-Trace-ID"] = crypto.randomUUID();
  },
  onResponseError: async ({ response, options }) => {
    if (response.status === 401) {
      await refresh();
      // ofetch 没"retry 当前请求"内置 API，需要 throw FetchError 后业务层重试
      // 或在 hooks 里改 options 后让 retry 配置触发
    }
  }
});

const data = await api<User[]>("/users");
//   ↑ 直接是 data，不用 .data
```

迁移要点：

1. `axios.get<T>()` → `ofetch<T>()`（统一入口）
2. response.data → 直接是返回值（解包了一层）
3. `.interceptors.request.use(fn)` → `onRequest(ctx)`
4. `.interceptors.response.use(ok, err)` → `onResponse / onResponseError`
5. `error.response.status` 同名（FetchError 字段对齐）
6. axios 内部 retry 用第三方 axios-retry；ofetch 内置 retry 配置

陷阱：

- axios 是"resolve only on 2xx，4xx 走 reject"；ofetch 同理。但**默认**都是 2xx resolve，迁移时不需要改 try/catch
- axios 的 `responseType: "blob"` → ofetch 用 content-type 自动决定；强制时用 `responseType: "blob"`（同名 option）
- axios 的 `params` → ofetch 用 `query`（注意 rename）

## 学到了什么

把 ofetch 拆开看完，最大的收获不是"它怎么用"，而是 **UnJS 这种"框架默认 = 独立库"的工程模式**：

1. **`$fetch` 是别名而不是新东西**：Nuxt 不重新发明 HTTP 客户端，而是给 ofetch 起一个全局名 + 注入 SSR 上下文。这样 ofetch 在非 Nuxt 项目里仍然能用，Nuxt 用户也能在需要时访问到底层
2. **依赖按职责切**：ufo 管 URL 拼接、destr 管 JSON 安全 parse、node-fetch-native 管 polyfill。每个依赖都能独立维护、独立升级。代价是用户要"理解 N 个小包"
3. **Hooks > Interceptors**：配置式 hooks 比 axios 的 `.use()` 命令式 interceptor 更适合 SSR / 不可变配置场景（每次创建 instance 时全量声明，运行期不变）
4. **destr 哲学**：宁可"软失败回退到原始数据"也不抛异常。这种选择和"严格抛错"是两种产品哲学，没有对错，只有适用场景
5. **bundle size 是产品决策**：ofetch 7 KB / ky 4 KB / axios 17 KB。看起来都"很小"，但对 edge runtime（CF Worker 1MB cap）和首屏 JS 加载都有可衡量影响

更抽象一层：**fetch wrapper 是没有终点的赛道**。从 superagent → axios → ky → ofetch → wretch，每隔几年都会出"更现代"的 wrapper。但每一代都在做同一件事 — **把 fetch 已有标准 API 包成更友好的形态**。这件事永远做不完，因为：

- runtime 在变（XHR → fetch → 未来可能是 WebTransport / HTTP/3 stream）
- 框架在变（jQuery → React → Vue → Svelte → 下一代）
- 业务模式在变（REST → GraphQL → tRPC → server actions）

每次变化都让"上一代 wrapper"变得有点过时，给"下一代 wrapper"机会。ofetch 是这一代里押注 SSR + edge runtime 的代表。

## 关联

- [ky — fetch wrapper 之王](/study/projects/ky/) — 同一赛道竞品；ofetch 多了框架集成，少了"零依赖"
- [axios — 老牌 HTTP 客户端](/study/projects/axios/) — 上一代代表；interceptor 模式 vs hooks 模式对照
- [Nuxt 3](#) — ofetch 最大用户；`$fetch` / `useFetch` / `useAsyncData` 三层关系
- [destr](#) — UnJS 安全 JSON parse 库，是 ofetch 的内部依赖
- [ufo](#) — UnJS URL 工具库，joinURL / withQuery / parseURL
- [h3](#) — UnJS server router；和 ofetch 是 Nuxt 服务端的两大支柱
- [nitropack](#) — UnJS server engine；底层用 h3 + ofetch
- [Pooya Parsa](#) — Nuxt core team lead，UnJS 主导者

## 复盘 checklist

读完这篇能回答：

1. ofetch 和 ky / axios 的核心差异（一句话）？
2. `$fetch` 是什么？和 ofetch 是什么关系？
3. parseResponse 智能解析的优先级？
4. destr 干什么的？为什么 ofetch 不直接用 JSON.parse？
5. SSR cookie 透传放在 ofetch 还是 Nuxt？为什么？
6. useFetch / useAsyncData / `$fetch` 三层关系？
7. ofetch 不适合什么场景（至少说三个）？
8. 从 axios 迁 ofetch，interceptor 怎么改？
9. UnJS 哲学是什么？利弊各一条？
10. 为什么说 fetch wrapper 是"没有终点的赛道"？

如果有任何一题答不上来，回到对应 Layer 重读。
