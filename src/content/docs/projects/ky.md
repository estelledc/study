---
title: Ky — 把 Fetch 包成可治理的请求流程
description: 建立在标准 Fetch 上的薄客户端：调用即发、默认 retry/timeout，hook 用 state object
来源: 'https://github.com/sindresorhus/ky'
日期: 2026-05-30
分类: HTTP 客户端
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/ky
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0a24c44fe4a15d0545c840facc56e473dd0b315b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.2
---

## 是什么

Ky 是建立在标准 Fetch 上的 HTTP 客户端，面向现代浏览器、Node 22+、Bun 和 Deno。日常类比：方向盘仍是 Fetch，Ky 只加 timeout、retry、hook 和错误仪表，并不另开一条运输系统。

原生 Fetch 对非 2xx 不会 reject，也没有 Ky 这套默认策略。Ky 补上它们，但最终行为仍取决于版本、平台和配置。

```ts
const res = await fetch("/api/users", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({name: "Alice"})
});
if (!res.ok) throw new Error(res.statusText);
const data = await res.json();

const same = await ky.post("/api/users", {json: {name: "Alice"}}).json();
```

## 为什么重要

不理解 Ky 的合同，下面这些事都没法解释：

- 为什么 `ky.get(url)` 已经调用、还没 `.json()`，请求也可能已经发出
- 为什么 `timeout: 10_000` 不能推出“整次操作最多 10 秒”
- 为什么 2.x 里写 `prefixUrl` 会直接抛错
- 为什么默认 retry 不含 POST，开启后又可能把 stream body 整段缓冲

## 核心要点

固定 2.0.2 的执行可以拆成五步：

1. **规范化 options**：method、headers、`prefix` / `baseUrl`、retry、timeout 和 hook 被整理成内部合同。`prefixUrl` 已被删除。

2. **立即创建 ResponsePromise**：`ky.get()` 启动异步流程，只延迟一个 microtask，好让 `.json()` 先改 `Accept`。这不是惰性 builder。

3. **beforeRequest + fetch/retry**：`beforeRequest` 只跑初始请求一次。默认 retry limit 为 2，method 不含 POST/PATCH，超时默认不重试。

4. **afterResponse + HTTPError**：hook 可以替换 response，`ky.retry()` 走统一预算；非成功状态默认变成带 request/response/data 的 `HTTPError`。

5. **body shortcut 与 schema**：`.json()` 消费 body；`.json(schema)` 才会跑 Standard Schema，失败抛 `SchemaValidationError`。

## 实践示例

### 案例 1：Ky 替你做的那些默认

```ts
import ky from "ky";

const user = await ky.post("/api/users", {json: {name: "Alice"}}).json<User>();
```

`{json: ...}` 会 stringify 并加 `Content-Type`。`.json<User>()` 只加类型，不验证 JSON 真是 User。服务器返 500 时 Ky 抛 `HTTPError`，原生 Fetch 会把 500 当“成功响应”。

### 案例 2：用 `ky.create` 做可复用实例

```ts
const api = ky.create({
  prefix: "https://api.example.com",
  timeout: 5000,
  retry: {limit: 2},
  hooks: {
    beforeRequest: [
      ({request}) => request.headers.set("Authorization", `Bearer ${getToken()}`)
    ]
  }
});

const users = await api.get("users").json<User[]>();
```

2.x 把旧 `prefixUrl` 改成字符串拼接的 `prefix`，并增加标准 URL 解析的 `baseUrl`。复制 1.x 示例前必须先改字段名。

### 案例 3：401 后走统一 retry

```ts
const api = ky.create({
  retry: {statusCodes: [401], limit: 1},
  hooks: {
    afterResponse: [
      async ({request, response, retryCount}) => {
        if (response.status === 401 && retryCount === 0) {
          request.headers.set("Authorization", `Bearer ${await refreshToken()}`);
          return ky.retry({request});
        }
      }
    ]
  }
});
```

`ky.retry()` 进入统一预算，`retryCount` 防止无限刷新。生产实现仍需 single-flight 和可重放 body。

## 踩过的坑

1. **retry 默认不含 POST/PATCH**：limit 为 2，method allowlist 也不含它们。扩大范围前先证明服务端幂等。

2. **混淆 per-attempt 与 total timeout**：`timeout` 默认 10 秒且每次尝试重算；`totalTimeout` 默认关闭，并从实例创建时开始计时。

3. **按旧 hook 签名写代码**：2.x hook 接收 state object。旧的 `(request, options, response)` 会读错参数。

4. **413 不一定会重试**：413 在默认 `statusCodes` 里，但没有 `Retry-After` 时实现会停掉。

5. **大 stream 开着 retry**：`retry.limit > 0` 会 `request.clone()`，ReadableStream 可能被 tee 进内存。不需要重试时把 limit 设为 0。

## 适用 vs 不适用场景

**适用**：

- 新项目、要跑现代浏览器 + Node 22+ + Deno + Bun
- 需要 timeout / retry / hook，又不想再挂插件
- TypeScript 项目里用 `.json<T>()` 做静态标注

**不适用**：

- 已经用 axios interceptor 堆了一层，迁移成本大于收益
- 需要浏览器 XHR 上传进度的旧路径；Ky 有 `onUploadProgress`，但依赖 Request stream，不是 XHR progress 事件
- Node 低于当前 package engines
- 要的是 callback / Agent / cookie jar，而不是 Fetch 包装 → 看 [[superagent]]

## 固定版本边界

- 本文绑定 `sindresorhus/ky@0a24c44f...`。GitHub tag `v2.0.2` 剥开后与 npm `gitHead` 都是这个提交；annotated tag 对象是 `7e50fb81...`。
- 2026-07-17 页曾绑定后代提交 `3419113b...`，其 package 仍报 `2.0.2`，但不是 tag/npm 三元组，本轮改绑可达 peel。
- 默认 retry limit 2，per-attempt timeout 10 秒，`totalTimeout` 与 timeout retry 默认关闭。
- 未安装依赖、未发请求、未跑上游测试或测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **薄包装能赢**：Ky 没有另造传输层，只是把 Fetch、AbortController 和 Headers 收成可配置合同。
2. **ResponsePromise 不是惰性 builder**：请求异步已启动，shortcut 只追加消费行为和 Accept。
3. **默认策略也是合同**：retry method、413、timeout 分层都写在源码默认值里，不能靠“HTTP 客户端常识”脑补。

## 应用型自测

1. `ky.get(url)` 已调用但没有接 `.json()` 或 `await`。能否假设网络请求尚未开始？
2. 配置 `timeout: 10_000, retry: {limit: 2}`，能否断言总耗时最多 10 秒？
3. 上传大 ReadableStream 时保留默认 retry，主要资源风险是什么？

检查点：

1. 不能。ResponsePromise 的异步流程已经启动，shortcut 不是启动开关。
2. 不能。timeout 是每次尝试预算；还要配置 `totalTimeout` 才能限制整体操作。
3. 为了 retry 可重放，stream 可能被 tee 并完整缓冲，应评估内存或把 limit 设为 0。

## 延伸阅读

- 官方 README：[github.com/sindresorhus/ky](https://github.com/sindresorhus/ky)
- 固定源码：[sindresorhus/ky](https://github.com/sindresorhus/ky) —— 本文绑定提交 `0a24c44fe4a15d0545c840facc56e473dd0b315b`
- [[axios]] —— interceptor / adapter 路线
- [[got]] —— 同一作者的 Node Duplex 客户端
- [[superagent]] —— callback / XHR 路线，不是 Fetch 包装

## 关联

- [[axios]] —— 浏览器和 Node 都能用的 adapter 客户端
- [[got]] —— Node 端以 Stream 为底座
- [[ofetch]] —— Nuxt 默认的 Fetch 包装
- [[wretch]] —— 不可变配置链
- [[superagent]] —— 更老的 fluent thenable 客户端
- [[express]] —— 常见后端配对

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
