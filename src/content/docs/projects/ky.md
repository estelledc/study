---
title: ky — 把浏览器自带的 fetch 包成顺手工具
来源: 'https://github.com/sindresorhus/ky'
日期: 2026-05-30
分类: projects
难度: 初级
---

## 是什么

ky 是一个**给浏览器原生 `fetch` 套了一层薄外壳的 HTTP 客户端**。日常类比：原厂方向盘开起来手感生硬，ky 给它包了一层皮——核心还是同一个方向盘，但握感顺手了。

`fetch` 是浏览器自带的网络函数，但用起来啰嗦：每次都要手动 `JSON.stringify` 请求体、手动判断状态码、出错不会自动重试、超时要自己写 setTimeout。ky 把这些"该有的默认"都补上，体积只有 4 KB。

```ts
// 原生 fetch：5 行
const res = await fetch("/api/users", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({name: "Alice"})
});
if (!res.ok) throw new Error(res.statusText);
const data = await res.json();

// ky：1 行
const data = await ky.post("/api/users", {json: {name: "Alice"}}).json();
```

## 为什么重要

不理解 ky 的设计取舍，下面这些事都没法解释：

- 为什么 axios（17 KB）周下载 5000 万、ky（4 KB）只有 300 万——"小"和"赢"是两件事
- 为什么 Node 18 让原生 fetch 正式可用之后 ky 反而更火，没被淘汰
- 为什么 ky 的 hooks 是数组，axios 的 interceptor 是 `.use()`——同一个需求两种 API 哲学
- 为什么 `ky.get(url)` 不立刻发请求，要 `.json()` 才发（lazy execution，下面会讲）

## 核心要点

ky 的设计可以拆成 **三件事**：

1. **薄包装**：80% 行为是原生 `fetch`，ky 只在外面套了"自动 JSON / 自动抛 4xx / retry / timeout"。类比：火锅店的 **酱料台**——肉还是那块肉，加一勺芝麻酱就吃得下去。

2. **链式 + 延迟执行**：`ky.get(url)` 返回的不是 Response，而是一个**还没发请求的 KyInstance**。等你调 `.json()` / `.text()` 才真正发。这种"先攒后发"的设计叫 **lazy execution**，让链式调用既能 `await` 又能在中途继续配置。

3. **hooks 切入 lifecycle**：4 个钩子卡在请求生命周期的关键点——`beforeRequest`（发出前）/ `beforeRetry`（重试前）/ `afterResponse`（拿到响应后）/ `beforeError`（报错前）。每个 hook 是数组，按顺序跑。

三件事加起来，让 ky 在 4 KB 内提供了 axios 17 KB 才有的核心体验。

## 实践案例

### 案例 1：ky 替你做的那些"该有的默认"

```ts
import ky from "ky";

// 自动 Content-Type / 自动 JSON.stringify / 4xx 自动抛
const user = await ky.post("/api/users", {json: {name: "Alice"}}).json<User>();
```

逐部分解释：

- `{json: ...}` —— ky 看到这个键就自动 stringify + 加 `Content-Type: application/json` 头
- `.json<User>()` —— 调它才真正发请求，回来后自动 `JSON.parse` 并标记类型
- 如果服务器返 500，**ky 主动抛 `HTTPError`**（原生 fetch 会让你以为 500 是"成功"）

### 案例 2：用 `ky.create` 做可复用的 API instance

```ts
const api = ky.create({
  prefixUrl: "https://api.example.com",
  timeout: 5000,
  retry: {limit: 3},
  hooks: {
    beforeRequest: [(req) => req.headers.set("Authorization", `Bearer ${getToken()}`)]
  }
});

const users = await api.get("users").json<User[]>();   // 拼成 https://api.example.com/users
const me = await api.get("users/me").json<User>();
```

`ky.create` 返回一个**带默认配置的小 ky**，所有调用都继承 prefixUrl / timeout / hooks。类比：连锁咖啡店的"今日推荐"已经替你选好豆子，你只用说要哪杯。

### 案例 3：401 自动刷新 token

```ts
const api = ky.create({
  hooks: {
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          const newToken = await refreshToken();
          request.headers.set("Authorization", `Bearer ${newToken}`);
          return ky(request);   // 重发整个请求
        }
        return response;        // ! 必须 return
      }
    ]
  }
});
```

`afterResponse` 拿到 401 后偷偷换新 token、用 `ky(request)` 重发，**业务代码完全感知不到**。这是 hooks 最常用的模式，axios 用 interceptor 做同样事情。

## 踩过的坑

1. **retry 默认只跑幂等方法**：默认只重试 GET / PUT / HEAD / DELETE，POST / PATCH 不重试（怕重复创建资源）。新手配 `retry: {limit: 3}` 时常以为对所有方法生效，结果 POST 失败一次就死。要全跑得显式 `retry: {limit: 3, methods: ["post", "get", ...]}`。

2. **`afterResponse` 必须 `return response`**：忘了 return 会让 ky 拿到 `undefined`，后续 `.json()` 报 "cannot read properties of undefined"。报错信息不直接，新人常排查半天。

3. **Node 16 及以下跑不了**：ky 1.x 依赖 Node 18+ 原生 fetch。老项目要么升 Node，要么用 `ky-universal`（带 polyfill 的兄弟包）。

4. **不支持上传进度**：原生 `fetch` 标准没有 `onUploadProgress`，ky 没法补。要做大文件上传进度条，axios（基于 XHR）反而更合适。

## 适用 vs 不适用场景

**适用**：

- 新项目、关心 bundle 大小、跑在 edge runtime（Cloudflare Worker / Vercel Edge）
- TypeScript 项目——ky 的泛型推断（`.json<T>()`）比 axios 干净
- 需要 retry / timeout / hooks 又不想引插件的中小项目
- 同一份代码要跑浏览器 + Node 18+ + Deno + Bun

**不适用**：

- 老项目已经用 axios interceptor 写了一堆 → 迁移成本大于收益，维持现状
- 上传进度条强需求 → 选 axios（XHR 才有 progress 事件）
- Node 16 / 14 / 12 老环境 → 用 [[got]] 或 axios，ky 跑不起来
- Vue / Nuxt 全家桶 → 用 ofetch（Nuxt 团队出品，集成更好）

## 历史小故事（可跳过）

- **2018-04**：Sindre Sorhus（最高产的 npm 作者，发了 1500+ 包）发布 ky v0.1，自我定位 "a tiny and elegant HTTP client based on the browser Fetch API"。当时浏览器 fetch 已普及，但 Node 还没有。
- **2019**：Node 18 fetch 还在实验阶段，ky 主要在浏览器跑。Sindre 维护了兄弟包 `ky-universal` 给 Node 加 polyfill。
- **2022-04**：Node 18 LTS 把 fetch 标记为 stable（底层用的是 [[undici]]）。ky 终于不用 polyfill 就能跨端跑。
- **2024-02**：ky 1.0 发布，API 锁定遵循 semver。生态进入稳定期。

## 学到什么

1. **薄包装能赢**：ky 没发明新概念，只是把 fetch 已有的标准 API（AbortController / Headers）包得更顺手。"不重新发明"反而让它体积小、好维护。
2. **lazy execution 是好链式 API 的钥匙**：不立刻执行让链式调用能继续接 `.json()` / `.text()` / 配置参数，又能被 `await` 当 Promise 用。
3. **0 运行时依赖是现代库的卖点**：ky 靠 fetch 标准做到了，安装 1 个包就完事，不用担心间接依赖污染。

## 延伸阅读

- 官方 README：[github.com/sindresorhus/ky](https://github.com/sindresorhus/ky)（API 列表 + 完整 hooks 文档）
- 对比文：[ky vs axios vs fetch](https://blog.logrocket.com/ky-vs-axios-vs-fetch/)（bundle 体积 + API 实测）
- 视频：[Theo - 为什么我从 axios 换到 ky](https://www.youtube.com/results?search_query=ky+http+client)（迁移踩坑实录）
- [[axios]] —— 直接对手，老牌 HTTP 客户端
- [[got]] —— Node-only 兄弟（同一个作者写的）

## 关联

- [[axios]] —— 17 KB 的对手，市场占有率 50M weekly，ky 要从这里抢用户
- [[got]] —— Sindre Sorhus 的另一个 HTTP 客户端，定位 Node 服务端
- [[fastify]] —— 后端框架，前端用 ky 调它的接口最自然
- [[express]] —— 老牌后端，配 ky 也行
- [[tanstack-router]] —— 路由层，配 ky 做 data loader
- [[react-hook-form]] —— 表单层，`onSubmit` 里跑 `ky.post` 是常见模式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[ofetch]] —— ofetch — Nuxt 默认的现代 fetch 包装
- [[wretch]] —— wretch — 把 fetch 写成一条链
