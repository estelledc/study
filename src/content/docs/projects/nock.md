---
title: nock — 用 Scope 和一次用完的 interceptor 假扮 Node HTTP
description: "介绍 nock 如何用 Scope 表拦截 Node 的 ClientRequest 和 Fetch。"
来源: https://github.com/nock/nock
日期: 2026-08-27
分类: projects / 测试工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/nock/nock
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1ee467c68d601ddc22629d7a657061e6c27097c2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 14.0.17
---

## 是什么

nock 是 **Node.js 专用**的 HTTP mock 与期望库。日常类比：它不是换掉你的 HTTP 客户端，而是在邮局窗口前挂一块“今日只收这些信封”的牌子。

你写：

```js
const nock = require("nock");

nock("https://api.example.com")
  .get("/users/42")
  .reply(200, { id: 42, name: "Ada" });
```

`nock(basePath)` 新建一个 `Scope`；`.get()` 返回还没登记的 `Interceptor`，直到 `.reply()` / `.replyWithError()` 才进入全局表。固定 14.0.17 在 import 时就会激活（除非 `NOCK_OFF=true`）。

## 为什么重要

不读这条 Scope 链，下面几件事会讲错：

- 为什么默认每个 interceptor 只能用一次
- 为什么 `disableNetConnect()` 之后，漏 mock 会变成 `ENETUNREACH`
- 为什么 v14 已经能拦 Fetch，却仍然重写 `http.ClientRequest`
- 为什么 `nock.back` 默认不是“全锁死外网”

## 核心要点

固定版本的控制流可以拆成五步：

1. **建 Scope**：`normalizeUrl()` 要求 `http:` / `https:`。hostname + 默认端口（80/443）组成内部 `basePath`。
2. **登记 interceptor**：`reply()` 缺省状态码是 200；普通对象会被 `json-stringify-safe` 成 JSON。路径字符串必须以 `/` 开头，除非是通配符或启用了 `filteringScope`。
3. **激活拦截**：`activate()` 同时做两件事——替换 `http.ClientRequest`，以及用 `@mswjs/interceptors` 的 Node preset 拦 Fetch。
4. **匹配**：`interceptorsFor()` 先看 `filteringScope`，再按 `proto://host` 找表。`counter` 默认是 1；用完就从 Scope 里摘掉，除非 `persist()`。
5. **真网络开关**：`enableNetConnect(matcher)` 接受字符串（编成 RegExp）、RegExp 或函数。未启用时，未匹配请求抛 `NetConnectNotAllowedError`。

## 实践示例

### 案例 1：一次用完的 GET

```js
const nock = require("nock");
const assert = require("node:assert/strict");

const scope = nock("https://api.example.com")
  .get("/users/42")
  .reply(200, { id: 42 });

const res = await fetch("https://api.example.com/users/42");
assert.equal(res.status, 200);
scope.done();
```

第二次再打同一 URL，这条 interceptor 已经不在表里。需要重复命中时写 `.times(5)` 或 `.persist()`。

### 案例 2：关掉外网，让漏 mock 立刻失败

```js
nock.disableNetConnect();

try {
  await fetch("https://example.com/unmocked");
} catch (error) {
  // NetConnectNotAllowedError, code === "ENETUNREACH"
}

nock.enableNetConnect("127.0.0.1");
```

`disableNetConnect()` 把 `allowNetConnect` 置空。字符串 matcher 不是 glob，而是 `new RegExp(matcher)`。测本地服务时要显式放行。

### 案例 3：nock.back 的默认 dryrun

```js
const nock = require("nock");

nock.back.fixtures = "/tmp/nock-fixtures";
const { nockDone } = await nock.back("users.json");
// dryrun：回放已有 fixture，允许其他真实 HTTP，不写新记录
await nockDone();
```

import 时若未设置 `NOCK_BACK_MODE`，固定实现调用 `back.setMode('dryrun')`。`lockdown` 才会禁用未录制请求；`record` / `update` 才会写 fixture。`Back.fixtures` 为空时直接抛错。

## 踩过的坑

1. **以为 interceptor 会一直有效**：默认 `counter = 1`。测试里第二次请求打到真网络或 `ENETUNREACH`，常常是这条。
2. **路径写成 `users/42`**：非通配字符串必须以 `/` 开头，否则构造期就抛错。
3. **把 dryrun 当成 lockdown**：默认允许未匹配的真实 HTTP。CI 要锁网需 `disableNetConnect()` 或 `nock.back` 的 `lockdown`。
4. **在浏览器里用 nock**：这是 Node 库。浏览器 / 跨端 handler 应看 [[msw]]。
5. **用 in-tree `package.json` 的版本号当发布号**：源码写的是 `0.0.0-development`；发布号以 npm / Git tag `14.0.17` 为准。

## 适用 vs 不适用场景

**适用**：

- Node 单测、集成测要拦 `http` / `https` / Fetch
- 需要“用过即删”的期望，而不是常驻 handler 表
- 用 `nock.back` 录/放真实流量 fixture

**不适用**：

- 浏览器、Storybook、Service Worker 场景 → [[msw]]
- 要一份 handler 同时喂给前端 dev server 和 Node 测试
- 需要按 Web 标准 `Request` resolver 写 GraphQL
- 运行时低于 `>=18.20.0 <20 || >=20.12.1`

## 固定版本边界

- 本文绑定 `nock/nock@1ee467c6...`，Git tag 与 npm `gitHead` 均为 `v14.0.17` / `nock@14.0.17`。
- 仓内 `package.json` 版本是 `0.0.0-development`（semantic-release），不是发布号。
- 依赖 `@mswjs/interceptors ^0.41.0`、`json-stringify-safe`、`propagate`。
- 本文未安装依赖、运行 Mocha/Jest、发送网络请求或测量性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **Scope 是主机键，Interceptor 是一次期望**——匹配键是 `METHOD basePath path`，不是“整个 API 面”。
2. **v14 的 Fetch 能力来自共享 interceptor 包**——和 [[msw]] 同源，但公共 API 仍是 Scope。
3. **默认激活是全局副作用**——import 就 override；测试结束要 `cleanAll()` / `restore`。
4. **锁网是显式政策**——dryrun 方便写新测试，却不能当安全网。

## 应用型自测

1. `nock('https://api.example.com').get('/x').reply(200)` 被命中一次后，第二次 GET `/x` 还会用这条吗？
2. 只 `require('nock')`、不改 `NOCK_BACK_MODE` 时，back 模式是什么？
3. `disableNetConnect()` 之后打一个未 mock 的主机，错误码是什么？

检查点：

1. 不会。默认 `counter` 为 1，用完即移除。
2. `dryrun`。
3. `ENETUNREACH`（`NetConnectNotAllowedError`）。

## 延伸阅读

- 固定源码：[nock/nock](https://github.com/nock/nock) —— 本文绑定提交 `1ee467c68d601ddc22629d7a657061e6c27097c2`
- 类型入口：仓内 `types/index.d.ts`
- [[msw]] —— 跨端 handler 表；nock v14 的 Fetch 拦截与它共享 interceptor 包
- [[got]] —— nock 测试里常见的 Node HTTP 客户端
- [[jest]] —— 可用 nock 做网络层隔离

## 关联

- [[msw]] —— 浏览器 + Node 的对照方案
- [[got]] —— 常被 nock 拦截的 Node 客户端
- [[axios]] —— 另一类会被 Node interceptor 拦住的客户端
- [[jest]] —— 常见宿主测试 runner
- [[vitest]] —— 同样可在 setup 里 `disableNetConnect()`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[msw]] —— MSW — 在网络层用同一套 handler 拦截请求
