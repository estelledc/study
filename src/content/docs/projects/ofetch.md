---
title: ofetch — Nuxt 默认的现代 fetch 包装
来源: https://github.com/unjs/ofetch
日期: 2026-05-30
分类: 前端工程化
难度: 中级
---

## 是什么

ofetch 是一个**给原生 fetch 套一层"自动收拾东西"的外壳**。日常类比：像外卖打包袋——网络层还是原生 fetch，外面那层帮你把饭盒摞好、忘记给筷子（Content-Type）时自动塞一双、送到一半摔了（5xx）再送一次。

你写：

```ts
import { ofetch } from "ofetch";
const user = await ofetch<User>("/api/users/1");
```

没 `.json()`、没手动 `JSON.stringify(body)`、没 try/catch 4xx——全是默认行为。它跨 Node 18+、浏览器、Deno、Bun、Cloudflare Worker 跑同一份代码。Nuxt 3 项目里那个全局 `$fetch`，就是 ofetch 的实例。

## 为什么重要

不理解 ofetch，下面这些事都没法解释：

- 为什么 Nuxt 文档几乎不再提 ofetch 这个名字——它被 framework 起了个别名 `$fetch` 接管了
- 为什么大家不直接用原生 fetch——4xx 不抛错、没 retry、body 要手 stringify，业务代码最后都会自己写一个"半成品 ofetch"
- 为什么经典 axios 在 Cloudflare Worker 上常要额外适配——默认偏 Node `http` 栈；ofetch 原生走标准 fetch，edge 上少一层胶水
- 为什么 [[axios]] / [[ky]] / ofetch 三家在同一赛道却长得不像——选了不同的姿势包同一件事

## 核心要点

ofetch 干的事可以拆成 **三件**：

1. **薄包装**：网络层 100% 交给原生 fetch，自己只加胶水。bundle 大约 7 KB（min+gzip），相比 axios 的 17 KB。类比：不重造发动机，只装个方向盘套。

2. **智能解析**：拿到响应后看 Content-Type 自动 json / text / blob，JSON 用 [[destr]] 安全 parse——遇到不合法 JSON 不抛异常，回退到原始 text。类比：拆快递时先看箱子上的标签决定怎么开。

3. **Hooks 而非 Interceptors**：在 `ofetch.create({ onRequest, onResponse, onRequestError, onResponseError })` 时声明四个钩子，运行期不变。类比：开店前贴好"进门必须洗手""离店必须刷卡"的牌子，比每个客人来了再口头交代更稳。

三件事加起来叫 **ofetch 内核**，剩下的 retry、baseURL、params、SSR cookie 透传都是这三件事的派生。

## 实践案例

### 案例 1：POST 一份 JSON 不需要手动 stringify

```ts
const created = await ofetch<User>("/api/users", {
  method: "POST",
  body: { name: "Alice" }   // ← 直接传 object
});
```

ofetch 看到 body 是 plain object，自动 `JSON.stringify` + 自动加 `Content-Type: application/json`。要传 FormData / URLSearchParams 时，不动它原样直传。这就省掉了原生 fetch 那两句样板代码。

### 案例 2：建一个带 baseURL 和 retry 的实例

```ts
const api = ofetch.create({
  baseURL: "https://api.example.com",
  retry: 3,
  retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
  onRequest({ options }) {
    options.headers = { ...options.headers, "X-Trace-ID": crypto.randomUUID() };
  }
});

const data = await api<User[]>("/users");  // 实际请求 https://api.example.com/users
```

retry 默认只对幂等方法（GET/HEAD/PUT/DELETE）+ 上面那串状态码生效，POST 失败默认不重试——避免重复扣款这种事故。重试间隔走指数退避：第 1 次失败立刻重试，第 2 次等 1s，第 3 次等 2s，避免短时间打爆 server。

### 案例 2.5：拿原始 Response 看 status / headers

```ts
const res = await ofetch.raw<User>("/api/users/1");
console.log(res.status, res.headers.get("etag"), res._data);
```

普通 `ofetch(url)` 直接解包成数据；`ofetch.raw(url)` 返回完整 FetchResponse，多了 `status / statusText / headers / _data` 字段。需要做 ETag 缓存、读 Set-Cookie、看 304 状态码时用这个。

### 案例 3：在 Nuxt 里用 $fetch

```vue
<script setup>
const data = await $fetch<User[]>("/api/users");
</script>
```

`$fetch` 不是 Nuxt 自造的新 API，它就是 ofetch 实例 + 自动 baseURL（指向当前站自己的 server route） + SSR 阶段透传 cookie。Nuxt 的 `useFetch` / `useAsyncData` 又在 `$fetch` 之上包了响应式 + payload 复用——三层是同一条链。

## 踩过的坑

1. **destr 的 fallback 会掩盖 bug**：server 误返了 HTML 错误页（Content-Type: text/html），ofetch 按 text 分支拿到一个"看起来是字符串但其实是错误页"的东西，业务代码毫不知情。开发期想严格抛错，需要自己传 `parseResponse: JSON.parse`。

2. **`$fetch` / `useFetch` / `useAsyncData` 三层容易搞混**：`$fetch` 立即发请求，`useFetch` 在 SSR 阶段把结果塞进 payload、client hydrate 时跳过重发。新人常以为 `useFetch` 每次 client 渲染都会重发，结果时间敏感数据不更新。

3. **SSR cookie 透传不在 ofetch 里**：ofetch 只暴露 `onRequest` hook，cookie / x-forwarded-for 这些"当前 SSR 请求上下文"的拼装放在 Nuxt。换 SvelteKit / Astro 时这套胶水得自己重写一遍。

4. **没有官方 mock 方案**：axios 有 axios-mock-adapter（拦 XHR 内部），ofetch 走原生 fetch 没法这么做，只能上 [[playwright]] 或 msw 走 service worker 拦截。

5. **timeout 不是默认的**：原生 fetch 没有 timeout 概念（要用 AbortController），ofetch 加了 `timeout` option 但默认不开。生产环境忘记设 timeout，下游 API 卡死会拖垮 SSR 进程——和"以为有默认 timeout"踩坑的人不少。

## 适用 vs 不适用场景

**适用**：

- Nuxt 3 / Nitro / 任何基于 [[h3]] 的 server——开箱即用，零配置
- edge runtime（Cloudflare Worker / Vercel Edge / Deno Deploy）——只用标准 fetch，不依赖 Node 内建模块
- 想要 axios 那种 DX 但不想引入 17 KB bundle

**不适用**：

- 维护中的老 axios 项目——interceptor → hooks 是结构性重写，不是 rename
- React / Next.js 项目——社区惯性是 native fetch + react-query 或 axios + react-query
- Node 后端密集流式下载——用 got，它的 `got.stream(url).pipe(...)` 这条路 ofetch 没暴露

## 历史小故事（可跳过）

- **2022-08**：UnJS 的 Pooya Parsa（@pi0，Nuxt core team lead）发布 v0.x，最早叫 ohmyfetch
- **2022-10**：改名 ofetch，统一 UnJS 命名（h3 / ufo / destr / ohash 都是这种短名）
- **2023**：1.x 稳定，跟着 Nuxt 3 正式版被默认推
- **2026**：npm 周下载约数百万、GitHub stars 约数千量级——比起 axios 仍差一个数量级，但跟着 Nuxt 生态增速快

## 学到什么

1. **框架默认 = 独立库**——Nuxt 不重造 HTTP 客户端，只给 ofetch 起别名 `$fetch` + 注入 SSR 上下文。这种拆法让 ofetch 在非 Nuxt 项目里也能用，Nuxt 用户也能在需要时摸到底层
2. **依赖按职责切**——ufo 管 URL 拼接、destr 管 JSON 安全 parse、node-fetch-native 管 polyfill。代价是用户要"理解 N 个小包"
3. **Hooks > Interceptors**——配置式 hooks 比 axios 的 `.use()` 命令式更适合 SSR / 不可变配置
4. **bundle size 是产品决策**——7 KB / 4 KB / 17 KB 看起来都"很小"，但对 edge runtime（CF Worker 1MB cap）和首屏加载都有可衡量影响
5. **fetch wrapper 是没有终点的赛道**——superagent → axios → ky → ofetch，每隔几年都会出"更现代"的，因为 runtime 在变（XHR → fetch → 未来 WebTransport）、框架在变、业务模式在变

## 延伸阅读

- 文档：[unjs.io/packages/ofetch](https://unjs.io/packages/ofetch)（API 速查 + 例子）
- 源码：[github.com/unjs/ofetch](https://github.com/unjs/ofetch)（src/ 加起来不到 600 行 TS，半天能读完）
- [[ky]] —— 同赛道竞品，零依赖 + 链式 lazy
- [[axios]] —— 上一代代表，interceptor 模式 vs hooks 模式对照
- [[destr]] —— ofetch 内部依赖，安全 JSON parse

## 关联

- [[ky]] —— 同赛道竞品；ofetch 多了框架集成，少了"零依赖"
- [[axios]] —— 老牌 HTTP 客户端；interceptor 模式 vs hooks 模式
- [[destr]] —— ofetch 用它做安全 JSON parse
- [[h3]] —— Nuxt 服务端 router；和 ofetch 是 Nitro 的两大支柱
- [[playwright]] —— 缺 mock 时的兜底方案之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[wretch]] —— wretch — 把 fetch 写成一条链
