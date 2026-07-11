---
title: wretch — 把 fetch 写成一条链
来源: https://github.com/elbywan/wretch
日期: 2026-05-30
分类: 前端工具
难度: 入门
---

## 是什么

wretch 是一个**很小的 HTTP 客户端**，基于浏览器和 Node 都自带的 `fetch`，再套一层"链式调用"的写法。日常类比：原生 `fetch` 像让你自己拼一杯咖啡（先磨豆、再煮水、再倒、再加奶），wretch 像把吧台流程做成一条传送带——你只要把杯子放上去，按几个按钮就行。

你写：

```js
import wretch from "wretch"

const user = await wretch("/api/users/1")
  .auth("Bearer abc")
  .get()
  .json()
```

这一句做了四件事：拼 URL、加 Authorization 头、发 GET、把响应解析成 JSON。每个动作是链上一个方法。核心包约 **1.8 KB**（gzip），比 axios（约 17 KB）小一个数量级。

## 为什么重要

不理解 wretch 这种"一步一个方法、改配置不改原对象"的写法，就解释不了下面几件事：

- 为什么 React Query / TanStack Query 文档示例里经常写 `wretch(...)` 而不是手写一长串 `fetch`（它当"取数小助手"更省事）
- 为什么 ky / ofetch / wretch 三个看着差不多的库在前端圈各有死忠（薄核心、框架默认、链式 DSL 三条路）
- 为什么链式 API 在 RxJS / Knex / lodash 阵营里被推崇，到 fetch 这里反而有人觉得"过度设计"
- 为什么 axios 那种"传一个大 config 对象"和 wretch 的"一步一个方法"是两种不同的世界观

## 核心要点

wretch 的设计可以拆成 **三个关键决定**：

1. **Wrapper（包装器）**：`wretch(url)` 返回一个对象，上面挂了一堆方法。每次你调 `.headers(...)` / `.auth(...)` 这种"配置类"方法，wretch **不改原对象**，而是 new 一个新的 Wrapper 实例返回。这叫 **immutable（不可变）**——像复印一份菜单再改，原菜单不动，下游改配置不会污染上游。

2. **动词触发请求**：链上一直在攒配置，直到你调 `.get()` / `.post()` / `.put()` 才真正发请求。这些"动词方法"返回的不是 Promise，而是另一个对象 **ResponseChain（响应链）**——像快递已发出，你再选"怎么拆包裹"。上面再挂 `.json()` / `.text()` / `.blob()` 之类的解析方法。

3. **能力外置**：retry / dedupe 等走 `wretch/middlewares`；abort / progress / queryString 等走 `wretch/addons`。核心包都不塞满——你用什么装什么，bundle 只为实际用到的能力付费。

三件事合起来：核心薄、链式可读、按需扩展。

## 实践案例

### 案例 1：把原生 fetch 三行压成一行

原生 fetch：

```js
const res = await fetch("/api/users/1", { headers: { Authorization: "Bearer abc" } })
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const user = await res.json()
```

wretch 等价写法：

```js
const user = await wretch("/api/users/1").auth("Bearer abc").get().json()
```

**逐部分解释**：`.auth(...)` 加头；`.get()` 发请求；`.json()` 解析；非 2xx 时 wretch 会自动抛错，省掉手写 `res.ok` 判断。

### 案例 2：复用一个 base wrapper

```js
const api = wretch("https://api.example.com")
  .auth(`Bearer ${token}`)
  .headers({ "X-Trace-Id": traceId })

const me   = await api.url("/me").get().json()
const post = await api.url("/posts").post({ title: "hi" }).json()
const file = await api.url("/upload").body(blob).put().res()
```

**逐部分解释**：

1. `api` 先攒好 base URL + auth + 公共头（原对象不变）
2. 每次 `.url(...)` 返回**新**实例，三处调用互不污染
3. `.res()` 只要原始 Response，不做 JSON 解析——上传场景常用

### 案例 3：装一个 retry middleware

```js
import wretch from "wretch"
import { retry } from "wretch/middlewares"

const api = wretch().middlewares([
  retry({ delayTimer: 500, maxAttempts: 3, retryOnNetworkError: true })
])

const data = await api.url("/flaky").get().json()
```

**逐部分解释**：`delayTimer` 是重试间隔毫秒；`maxAttempts` 是最多试几次；`retryOnNetworkError: true` 让断网类错误也重试。只有用到 retry 的代码才会打进 bundle。

## 踩过的坑

1. **catcher 要在解析方法之前**：`.get().catcher(404, fn).json()` 合法（挂在 ResponseChain）；也可 `.catcher(...).get().json()`（挂在 Wrapper）。错的是写在 `.json()` **之后**——解析方法一调，链就结束成 Promise 了。

2. **immutable 要相信它**：写成 `api.auth(...)` 却丢掉返回值——你以为 `api` 被改了其实没有。必须 `const api2 = api.auth(...)` 接住新实例。

3. **`.json<T>()` 的 T 不是运行时校验**：TypeScript 里写 `.json<User>()` 只是让 IDE 把响应当成 `User`，运行时数据不对照样过。要真校验得配 zod / valibot。

4. **middleware 顺序像洋葱圈**：先注册的最外层、先看到请求也最后看到响应。retry + dedupe 一起用时，先画一遍洋葱图再调。

## 适用 vs 不适用场景

**适用**：

- 浏览器 / Node 18+（原生 fetch）/ Deno / Bun / CF Worker 跨 runtime 跑同一份代码
- 关心 bundle 体积（首屏 / SSR / Edge），且不需要 axios 那一整套 interceptor
- 喜欢 fluent / chain 风格（来自 RxJS / lodash / Knex 阵营）
- 跟 React Query / TanStack Query 搭配——wretch 当 fetcher，Query 管缓存

**不适用**：

- 项目已经在用 axios 且团队习惯 config object 风格——再换成本不划算
- 用 Nuxt / Nitro——`ofetch` 框架已经默认集成
- 需要 Node 16 及更老环境（无原生 fetch，得自己 polyfill）
- 想要"运行时强校验响应"——wretch 不做，得再加 zod / valibot

## 历史小故事（可跳过）

- **2017 年**：Julien Elbaz（GitHub @elbywan）发 v0.x。当时 `fetch` 刚铺开，作者觉得每次写 `if (!res.ok) throw ...` 太烦。
- **2018 年**：v1.0，API 基本定型。weekly downloads 从几百慢慢涨到几万。
- **2023 年**：v2.0 大重写——middleware 拆子包、TypeScript 类型重做、ESM 优先。
- **2025–2026 年**：进入 3.x（如 3.0.9）；addons / middlewares 边界更清晰。weekly downloads 约 25 万，stars 约 5k+。一个独立维护者把小工具做了近 9 年。

## 学到什么

1. **fluent immutable wrapper** 是把"链式 DSL"和"函数式不可变"结合的经典模式，可迁移到 query builder / 命令构造器 / 测试 mock
2. **核心薄 + middleware/addon 外置**比"一个大包带所有"更适合 tree-shake 时代——付出的 bundle 等于实际用到的能力
3. **跟着标准走**（fetch / AbortController / Streams）让一个库自动跨 runtime，不用为每个新平台重写适配
4. **小工具长期维护**靠的是边界感——wretch 多年没把"业务策略"塞进核心

## 延伸阅读

- 官方文档：[elbywan.github.io/wretch](https://elbywan.github.io/wretch)（API 全集 + middleware / addon 列表）
- 源码：[github.com/elbywan/wretch](https://github.com/elbywan/wretch)（核心不大，值得读一遍）
- 对比文章：搜 "wretch vs ky vs ofetch" 有大量横评
- [[axios]] —— 老牌 HTTP 客户端，和 wretch 的设计哲学正相反
- [[ky]] —— 同属轻量 fetch 包装，API 风格可对照着看

## 关联

- [[axios]] —— wretch 的"对照组"：config object vs fluent chain
- [[ky]] —— 另一款轻量 fetch wrapper，和 wretch 常被横评
- [[ofetch]] —— Nuxt / Nitro 默认 HTTP 客户端，框架内优先选它
- [[tanstack-query]] —— wretch 当 fetcher，Query 管缓存和重试状态
- [[msw]] —— wretch 测试用的 mock 网络层，跟 fetch 标准对齐
- [[zod]] —— 补 wretch 缺的"运行时响应校验"那一环

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[tanstack-query]] —— TanStack Query — 数据获取与缓存库
- [[zod]] —— Zod — TypeScript-first schema 验证
