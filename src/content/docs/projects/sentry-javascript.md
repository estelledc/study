---
title: Sentry JavaScript SDK — 把异常变成可发送的 event
description: 把浏览器和 Node 异常收成 event，再按三层 scope 合并后交给 transport。
来源: 'https://github.com/getsentry/sentry-javascript'
日期: 2026-08-27
分类: observability
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/getsentry/sentry-javascript
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9fcb0635f0152ad1eef35388abbbf276b1e23484
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.71.0
---

## 是什么

Sentry JavaScript SDK 是一套把运行时异常、消息和性能跨度收成 **event**、再交给 transport 发出去的官方 SDK 家族。日常类比：像给应用配了一名现场记录员——出事时先撕一张编号工单（`event_id`），再把堆栈、面包屑和当前上下文装进信封，最后由邮差（transport）寄到 DSN 指向的项目。

你写：

```js
import * as Sentry from "@sentry/browser";

Sentry.init({ dsn: "https://public@o0.ingest.sentry.io/1" });
Sentry.captureException(new Error("boom"));
```

固定 10.71.0 里，浏览器入口走 `@sentry/browser` 的 `init` → `initAndBind(BrowserClient)`；Node 入口走 `@sentry/node` 的 `init`，再默认接 OpenTelemetry。平台仓 [[sentry]] 是接收端；本页只绑定 JavaScript SDK 这一侧。

## 为什么重要

不理解这套 SDK，下面这些事都没法解释：

- 为什么 `captureException` 立刻返回一个 id，但事件可能稍后才发送，甚至被丢掉
- 为什么 `Sentry.setTag` 写的是 isolation scope，而 `withScope` 分叉的是 current scope
- 为什么浏览器和 Node 都叫 `Sentry.init`，默认 integrations 和 transport 却不是同一套
- 为什么 `@sentry/node` 在没开 tracing 时不会自动装 Express 等 performance integration

## 核心要点

固定源码把一次上报拆成五步：

1. **init 绑定 Client**：`initAndBind` 用当前 scope 的 `initialScope` 更新后 `new Client(options)`，再 `setCurrentClient` + `client.init()`。没有 DSN 时 SDK 仍可初始化，但不会往 Sentry 发事件。

2. **三层 scope**：`getGlobalScope` 作用于全部事件；`getIsolationScope` 跟执行上下文走（浏览器默认不分叉）；`getCurrentScope` 是最里层。`getCombinedScopeData` 按 global → isolation → current 合并，后者覆盖同名字段。

3. **capture 先发号再处理**：`Scope.captureException` / `Client.captureException` 先用 `uuid4()` 生成 `event_id` 并立即返回。同一 exception 对象若已被标记抓过，后续调用仍返回 id，但不再进处理管线。

4. **处理管线**：`eventFromException` → `_prepareEvent`（合并 scope、跑 event processor）→ `beforeSend` / `beforeSendTransaction` → 仅对 **error** 事件按 `sampleRate` 抽样 → `sendEvent`。processor 或 `beforeSend` 返回 `null` 都会丢弃。

5. **平台默认值不同**：浏览器默认 transport 是 `makeFetchTransport`，默认 integrations 含 inboundFilters、breadcrumbs、globalHandlers、linkedErrors、dedupe 等。Node 在 `hasSpansEnabled` 时才追加 auto performance integrations，并默认 `initOpenTelemetry`，可用 `skipOpenTelemetrySetup` 关掉。

## 实践示例

### 案例 1：浏览器最小接入

```js
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "https://public@o0.ingest.sentry.io/1",
  tracesSampleRate: 0.1
});

Sentry.captureException(new Error("checkout failed"));
```

`init` 未传 `transport` 时用 Fetch transport；`tracesSampleRate` 只管 tracing 是否启用 performance integrations，不等于 error 的 `sampleRate`。DSN 决定信封寄到哪个项目。

### 案例 2：withScope 只隔离 current scope

```js
Sentry.setTag("service", "checkout");

Sentry.withScope((scope) => {
  scope.setTag("step", "pay");
  Sentry.captureException(err);
});
```

`Sentry.setTag` 写 isolation scope，请求或页面里后续事件都会带 `service`。`withScope` 分叉 current scope，`step` 只活在回调里。浏览器默认 ACS 不分叉 isolation scope，不能指望 `withScope` 清掉 `Sentry.setTag`。

### 案例 3：Node 初始化与 OTel 边界

```js
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  skipOpenTelemetrySetup: false
});
```

固定 `@sentry/node` 会先 `init` node-core，再在 client 存在且未跳过时调用 `initOpenTelemetry`。没有打开 spans 时，Express 等 auto performance integration 不会进默认列表；HTTP 请求隔离仍可由 `httpIntegration` 提供，但不会自动写 `transactionName`。

## 踩过的坑

1. **把返回的 event_id 当成“已经寄出”**：id 在进 transport 之前就生成；processor、`beforeSend`、`sampleRate` 或 `enabled !== false && transport` 检查都可以让它不再发送。

2. **把 Hub 当现行主链**：固定 10.71.0 的公共路径是 scope + client。用旧 Hub API 心智去猜 `setTag` 作用域会错。

3. **混淆 error `sampleRate` 与 traces sampling**：error 抽样发生在 `beforeSend` **之后**；未设置时按“不是 number 就不丢”。tracing 另有自己的开关，决定 Node 是否装 performance integrations。

4. **以为 `@sentry/react` 换了一套 Client**：它调用浏览器 `init`，再 `setContext('react', { version })` 并替换 synthetic event 的 normalize。React 错误边界仍要自己接到 `captureException`。

5. **嵌入式浏览器扩展会禁用 SDK**：未设 `skipBrowserExtensionCheck` 时，检测到 embedded extension 会把 `enabled` 设为 false。

## 适用 vs 不适用场景

**适用**：

- 浏览器或 Node >=18 的应用需要官方错误上报，并接受 Fetch / OTel 默认运输与装配
- 需要 breadcrumb、用户上下文、请求隔离这些 isolation scope 上的横切状态
- React 应用要在浏览器 SDK 之上补 React version context 和 SyntheticEvent 归一化
- 已有 [[sentry]] 项目，DSN 指向同一组织 / 项目

**不适用**：

- 只想在本地打结构化日志、不发送到 Sentry——用 [[pino]] 即可
- 不能接受 `@sentry/node` 默认拉起 OpenTelemetry，又没有评估 `skipOpenTelemetrySetup` 的后果
- 需要自建 grouping / fingerprint 服务端逻辑——那是平台仓，不在本 SDK 页
- 运行时低于各包声明的 Node >=18

## 固定版本边界

- 本文绑定 `getsentry/sentry-javascript@9fcb0635...`，即 release tag `10.71.0`。
- npm 上 `@sentry/core` / `@sentry/browser` / `@sentry/node` / `@sentry/react` 均为 `10.71.0`，均无 `gitHead`；身份以 GitHub tag 为准。
- 各公开包 `engines.node` 为 `>=18`。许可为 MIT（Functional Software, Inc. dba Sentry）。
- `enabled` 文档默认 true；发送条件是 `enabled !== false` 且已有 transport。
- 本文未安装依赖、未运行上游测试、未向 ingest 发送事件、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **先发号再投递**——同步返回 id 是 API 合同，不是投递回执。
2. **scope 分层决定“谁看得到这份上下文”**——global / isolation / current 合并顺序比“有没有 Hub”更重要。
3. **平台包是装配器**——`@sentry/browser` 和 `@sentry/node` 共用 core 管线，默认 integrations 与 transport 不同。
4. **抽样和过滤都在发送前**——processor、`beforeSend`、`sampleRate` 都会让“已经拿到的 id”变成空信封。

## 应用型自测

1. `Sentry.captureException(err)` 的返回值，是 transport 成功之后才生成的吗？
2. 先 `Sentry.setTag("svc", "api")`，再 `Sentry.withScope(scope => { scope.setTag("step", "pay"); ... })`。回调结束后，下一件事件还会带 `svc` 吗？还会带 `step` 吗？
3. 只配置 `sampleRate: 0`、不配 `beforeSend`。error 事件会在进入 `beforeSend` 之前被丢掉吗？

检查点：

1. 不是。`event_id` 在 `captureException` 入口用 `uuid4()` 分配，处理与发送是后续异步管线。
2. `svc` 还在，因为它写在 isolation scope；`step` 不在，它只活在被分叉的 current scope。
3. 不会因此跳过 `beforeSend`。固定实现先跑 processor 与 `beforeSend`，再对 error 事件做 `sampleRate` 抽样。

## 延伸阅读

- 官方文档：[docs.sentry.io/platforms/javascript](https://docs.sentry.io/platforms/javascript/)
- 固定源码：[getsentry/sentry-javascript](https://github.com/getsentry/sentry-javascript) —— 本文绑定提交 `9fcb0635f0152ad1eef35388abbbf276b1e23484`
- [[sentry]] —— 接收、分组和查询 event 的平台，不是本 SDK
- [[opentelemetry]] —— `@sentry/node` 默认接上的追踪底座

## 关联

- [[sentry]] —— 服务端分组与 Issue 视图；本页只覆盖 JS SDK 如何造 event
- [[opentelemetry]] —— Node SDK 默认 OpenTelemetry setup 的上游模型
- [[react]] —— `@sentry/react` 在浏览器 Client 上补 React context
- [[pino]] —— 本地结构化日志，不负责往 Sentry ingest 发信封
- [[express]] —— Node performance integration 只在 spans 开启时进入默认列表
- [[fastify]] —— 同上，属于 auto performance 装配，不是 core 管线本身

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
