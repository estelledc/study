---
title: wretch — 把 fetch 写成一条链
来源: https://github.com/elbywan/wretch
日期: 2026-05-30
子分类: 前端工具
分类: 后端 API
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

这一句做了四件事：拼 URL、加 Authorization 头、发 GET、把响应解析成 JSON。每个动作是链上一个方法。包大小 ~5 KB（min+gzip），比 axios（~17 KB）小三倍多。

## 为什么重要

不理解 wretch 这种 "fluent + immutable wrapper" 风格，就解释不了下面几件事：

- 为什么 React Query / TanStack Query 文档示例里经常写 `wretch(...)` 而不是 `fetch(...)`
- 为什么 ky / ofetch / wretch 三个看着差不多的库在前端圈各有死忠
- 为什么链式 API 在 RxJS / Knex / lodash 阵营里被推崇，到 fetch 这里反而有人觉得"过度设计"
- 为什么 axios 那种"传一个大 config 对象"和 wretch 的"一步一个方法"是两种不同的世界观

## 核心要点

wretch 的设计可以拆成 **三个关键决定**：

1. **Wrapper（包装器）**：`wretch(url)` 返回一个对象，上面挂了一堆方法。每次你调 `.headers(...)` / `.auth(...)` / `.query(...)` 这种"配置类"方法，wretch **不改原对象**，而是 new 一个新的 Wrapper 实例返回。这叫 **immutable**——可以放心复用一个 base wrapper，下游修改不会污染上游。

2. **动词触发请求**：链上一直在攒配置，直到你调 `.get()` / `.post()` / `.put()` 才真正发请求。这些"动词方法"返回的不是 Promise，而是另一个对象 ResponseChain，上面再挂 `.json()` / `.text()` / `.blob()` 之类的"怎么解析响应"方法。

3. **Middleware 全部外置**：retry / dedupe / cache / abort / progress 等能力，**核心包都不带**——拆成 `wretch/middlewares/retry`、`wretch/middlewares/dedupe` 等独立子包。你用什么装什么，bundle 永远只为你用到的东西付费。

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

差别：wretch 内部已经替你判断 `res.ok`，非 2xx 自动抛错；`.json()` 已经替你 await 一次。代码量从 3 行到 1 行，可读性也更高。

### 案例 2：复用一个 base wrapper

```js
const api = wretch("https://api.example.com")
  .auth(`Bearer ${token}`)
  .headers({ "X-Trace-Id": traceId })

// 下面三处用法不会互相影响（immutable）
const me   = await api.url("/me").get().json()
const post = await api.url("/posts").post({ title: "hi" }).json()
const file = await api.url("/upload").body(blob).put().res()
```

`api` 是一个攒好了 base URL + auth 的 wrapper，下游每次 `.url(...)` 都返回新实例。**不会出现 axios 拦截器那种"全局打补丁污染所有请求"的隐患**。

### 案例 3：装一个 retry middleware

```js
import wretch from "wretch"
import { retry } from "wretch/middlewares"

const api = wretch().middlewares([
  retry({ delayTimer: 500, maxAttempts: 3, retryOnNetworkError: true })
])

const data = await api.url("/flaky").get().json()
```

只有用到 retry 的代码才会引入 retry 子包，bundle 不变胖。这是 wretch 跟 axios 最大的差别——axios 把所有 interceptor 能力都打包进核心。

## 踩过的坑

1. **链顺序不能乱**：catcher（`.catcher(404, fn)`）必须**写在动词之前**——`.catcher(...).get().json()` 对，`.get().catcher(...).json()` 错。原因：catcher 是注册到 Wrapper 上的，动词调完已经离开 Wrapper 进入 ResponseChain。

2. **immutable 要相信它**：第一次写很容易写成 `api.auth(...)` 然后丢掉返回值——你以为 `api` 被改了其实没有。必须 `const api2 = api.auth(...)` 接住新实例。

3. **`.json<T>()` 的 T 不是运行时校验**：TypeScript 里写 `.json<User>()` 只是让 IDE 把响应当成 `User`，运行时数据不对照样过。要真校验得配 zod / valibot 在解析后再过一道。

4. **middleware 顺序和洋葱圈一样**：先注册的最外层、先看到请求也最后看到响应。调试 retry + dedupe 一起用时，要画一遍洋葱图才不绕晕。

## 适用 vs 不适用场景

**适用**：

- 浏览器 / Node 18+ / Deno / Bun / CF Worker 跨 runtime 跑同一份代码
- 关心 bundle 体积（首屏 / SSR / Edge），且不需要 axios 那一整套 interceptor
- 喜欢 fluent / chain 风格（来自 RxJS / lodash / Knex 阵营）
- 跟 React Query / TanStack Query 搭配——wretch 当 fetcher，Query 管缓存

**不适用**：

- 项目已经在用 axios 且团队习惯 config object 风格——再换成本不划算
- 用 Nuxt / Nitro——`ofetch` 框架已经默认集成
- 需要 Node 14- 老环境（fetch 不原生，得 polyfill）
- 想要"运行时强校验响应"——wretch 不做，得再加 zod / valibot

## 历史小故事（可跳过）

- **2017 年**：Julien Poissonnier（GitHub @elbywan）发 v0.x。当时 `fetch` 才被现代浏览器全面铺开，作者觉得每次写 `if (!res.ok) throw ...` 太烦。
- **2018 年**：v1.0，API 基本定型。weekly downloads 从几百慢慢涨到几万。
- **2023 年**：v2.0 大重写——middleware 拆子包、TypeScript 类型重做、ESM 优先。这一刀让 bundle 又瘦了一圈。
- **2024 年至今**：2.x 稳定迭代，weekly downloads ~250k，stars ~4k。一个独立维护者把一个小工具做了 7 年，是开源社区的"长跑者"典范。

## 学到什么

1. **fluent immutable wrapper** 是把"链式 DSL"和"函数式不可变"结合的经典模式，可以迁移到任何"先攒配置再触发"的领域（query builder / 命令构造器 / 测试 mock）
2. **核心薄 + middleware 外置**比"一个大包带所有"更适合 tree-shake 时代——付出的 bundle 等于实际用到的能力
3. **跟着标准走**（fetch / AbortController / Streams）让一个库自动跨 runtime，不用为每个新平台重写适配
4. **小工具长期维护**靠的是边界感——wretch 7 年没大改 API，因为它从一开始就拒绝把"业务策略"塞进核心

## 延伸阅读

- 官方文档：[elbywan.github.io/wretch](https://elbywan.github.io/wretch)（API 全集 + middleware 列表）
- 源码：[github.com/elbywan/wretch](https://github.com/elbywan/wretch)（核心 src/core.ts 不到 500 行，值得读一遍）
- 对比文章：搜 "wretch vs ky vs ofetch" 有大量横评
- [[axios]] —— 老牌 HTTP 客户端，和 wretch 的设计哲学正相反
- [[tanstack-query]] —— 最常和 wretch 搭配的状态/缓存层

## 关联

- [[axios]] —— wretch 的"对照组"：config object vs fluent chain，bundle 大三倍
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

