---
title: Ky — 把 Fetch 包成可治理的请求流程
来源: 'https://github.com/sindresorhus/ky'
日期: 2026-05-30
分类: projects
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/ky
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: 3419113b48e034fdcf8fa6bd3be3da7b3d0d758f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 2.0.2
---

## 是什么

Ky 是一个建立在标准 Fetch API 上的 HTTP 客户端，面向现代浏览器、Node、Bun 和 Deno。日常类比：原厂方向盘仍是 Fetch，Ky 加上了 timeout、retry、hook、错误和响应解析仪表。

Fetch 对非 2xx 不会自动 reject，也不内建 Ky 这套 retry/hook/JSON shortcut。Ky 补上这些策略，但最终 bundle 与运行时行为仍取决于版本、平台和配置。

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

- 为什么 Ky 的 HTTPError、NetworkError、TimeoutError 和 SchemaValidationError 不能混成一种错误
- 为什么 timeout 默认是每次尝试 10 秒，而 totalTimeout 默认关闭
- 为什么 `beforeRequest` 只跑一次，retry 前应使用 `beforeRetry`
- 为什么开启 retry 后，streaming request body 可能被完整缓冲

## 核心要点

Ky 的执行可以拆成五步：

1. **规范化 Request 与 options**：method、headers、prefix/baseUrl、retry、timeout 和 hook 被整理为内部合同。

2. **立即创建 ResponsePromise**：调用 `ky.get()` 会启动异步流程；实现只延迟一个 microtask，让 `.json()` / `.text()` shortcut 有机会先设置 `Accept`。这不是“等 shortcut 才发”的惰性 KyInstance。

3. **beforeRequest + fetch/retry**：`beforeRequest` 只跑初始请求一次；之后 retry policy 根据 method、错误/状态、次数和 timing header 决定是否重试，`beforeRetry` 可修改已确认的 retry。

4. **afterResponse + HTTP error**：响应可被 hook 替换，`ky.retry()` 可触发受限的强制 retry；非成功状态默认形成带 request/response/data 的 `HTTPError`。

5. **body shortcut 与 schema**：`.json()` 等方法消费 response body；`.json(schema)` 还能调用 Standard Schema validator，失败时抛 `SchemaValidationError`。

## 实践示例

### 案例 1：ky 替你做的那些"该有的默认"

```ts
import ky from "ky";

// 自动 Content-Type / 自动 JSON.stringify / 4xx 自动抛
const user = await ky.post("/api/users", {json: {name: "Alice"}}).json<User>();
```

逐部分解释：

- `{json: ...}` —— ky 看到这个键就自动 stringify + 加 `Content-Type: application/json` 头
- `.json<User>()` —— 给结果加静态类型并消费 body；它不会验证 JSON 真的是 User
- 如果服务器返 500，**ky 主动抛 `HTTPError`**（原生 fetch 会让你以为 500 是"成功"）

### 案例 2：用 `ky.create` 做可复用的 API instance

```ts
const api = ky.create({
  prefixUrl: "https://api.example.com",
  timeout: 5000,
  retry: {limit: 2},
  hooks: {
    beforeRequest: [
      ({request}) => request.headers.set("Authorization", `Bearer ${getToken()}`)
    ]
  }
});

const users = await api.get("users").json<User[]>();   // 拼成 https://api.example.com/users
const me = await api.get("users/me").json<User>();
```

`ky.create` 返回带默认配置的实例。固定 2.x 源码已经把旧 `prefixUrl` 改为 `prefix`，并增加标准 URL 解析的 `baseUrl`；复制 1.x 示例前必须核对版本。

### 案例 3：401 自动刷新 token

```ts
const api = ky.create({
  retry: {statusCodes: [401], limit: 1},
  hooks: {
    afterResponse: [
      async ({request, response, retryCount}) => {
        if (response.status === 401 && retryCount === 0) {
          const newToken = await refreshToken();
          request.headers.set("Authorization", `Bearer ${newToken}`);
          return ky.retry({request});
        }
      }
    ]
  }
});
```

`afterResponse` 通过 `ky.retry()` 进入统一 retry 预算，`retryCount` 防止无限刷新。生产实现仍需 single-flight refresh 和可重放 body 设计。

## 踩过的坑

1. **retry 默认不覆盖所有方法**：默认 limit 为 2，method allowlist 不含 POST/PATCH；扩大范围前先证明服务端幂等。

2. **混淆 per-attempt 与 total timeout**：`timeout` 默认 10 秒且每次尝试重新计算；`totalTimeout` 默认关闭。多次 retry 的总墙钟可能远大于 10 秒。

3. **按旧 hook 签名写代码**：2.x hook 接收 state object；旧的 `(request, options, response)` 示例会读错参数。

4. **大 stream body 开着 retry**：Ky 为可重放请求使用 stream tee，可能把完整 body 缓存在内存；不需要重试时应将 limit 设为 0。

## 适用 vs 不适用场景

**适用**：

- 新项目、关心 bundle 大小、跑在 edge runtime（Cloudflare Worker / Vercel Edge）
- TypeScript 项目——ky 的泛型推断（`.json<T>()`）比 axios 干净
- 需要 retry / timeout / hooks 又不想引插件的中小项目
- 同一份代码要跑现代浏览器 + Node 22+ + Deno + Bun

**不适用**：

- 老项目已经用 axios interceptor 写了一堆 → 迁移成本大于收益，维持现状
- 上传进度条强需求 → 选 axios（XHR 才有 progress 事件）
- Node 版本低于当前 package engines，且不能升级
- Vue / Nuxt 全家桶 → 用 ofetch（Nuxt 团队出品，集成更好）

## 固定版本边界

- 本文绑定 `sindresorhus/ky@3419113b...`，package 版本为 `2.0.2`，要求 Node >=22。
- 固定 README 明确标注它描述“next version”，因此正文优先以 package 与源码合同为准。
- 默认 retry limit 为 2，默认 per-attempt timeout 为 10 秒，total timeout 与 timeout retry 默认关闭。
- 本文未安装依赖、运行请求、测试 stream 或 bundle 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **薄包装能赢**：ky 没发明新概念，只是把 fetch 已有的标准 API（AbortController / Headers）包得更顺手。"不重新发明"反而让它体积小、好维护。
2. **ResponsePromise 是可装饰 Promise**：请求异步执行，body shortcut 追加消费行为和 Accept header，不是惰性 builder。
3. **0 运行时依赖是现代库的卖点**：ky 靠 fetch 标准做到了，安装 1 个包就完事，不用担心间接依赖污染。

## 应用型自测

1. `ky.get(url)` 已调用但没有接 `.json()` 或 `await`。能否假设网络请求尚未开始？
2. 配置 `timeout: 10_000, retry: {limit: 2}`，能否据此断言总耗时最多 10 秒？
3. 上传大 ReadableStream 时保留默认 retry，主要资源风险是什么？

检查点：

1. 不能。ResponsePromise 的异步流程已经启动，shortcut 不是启动开关。
2. 不能。timeout 是每次尝试预算；还要配置 totalTimeout 才能限制整体操作。
3. 为了 retry 可重放，stream 可能被 tee 并完整缓冲，应评估内存或禁用 retry。

## 延伸阅读

- 官方 README：[github.com/sindresorhus/ky](https://github.com/sindresorhus/ky)（API 列表 + 完整 hooks 文档）
- 固定源码：[sindresorhus/ky](https://github.com/sindresorhus/ky) —— 本文绑定提交 `3419113b48e034fdcf8fa6bd3be3da7b3d0d758f`
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
