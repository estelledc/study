---
title: unfetch — 用 XHR 冒充一份最小 Fetch
description: 用 XMLHttpRequest 提供 Fetch 子集；默认 ponyfill，polyfill 只在缺失时安装。
来源: https://github.com/developit/unfetch
日期: 2026-08-27
分类: HTTP 客户端
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/developit/unfetch
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e8f8baa5c1aaf4f70afcfcc6bfa8b592fae6c861
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.0
---

## 是什么

unfetch 是一个大约几百字节的 Fetch **子集**，底层是 `XMLHttpRequest`，不是对 `window.fetch` 的包装。日常类比：窗口上挂着 Fetch 的招牌，后厨仍是老式 XHR 传菜口。

你写：

```js
import fetch from "unfetch"

const res = await fetch("/api/users/1")
const user = await res.json()
```

固定 `5.0.0` 的默认入口是 ponyfill：导入永远得到这份 XHR 实现，即使页面已经有原生 Fetch。想当 polyfill 要走 `unfetch/polyfill`，它只在 `self.fetch` 缺失时安装。

## 为什么重要

不读固定源码，下面这些“fetch polyfill”印象会对不上：

- 为什么它不是 redaxios / ofetch 那种 Fetch wrapper
- 为什么 404 不会进 `catch`，只有网络错误才 reject
- 为什么 `credentials: "same-origin"` 不会带 cookie
- 为什么 TypeScript 把 `arrayBuffer`、`body`、`signal` 标成 `never`
- 为什么同仓还有 `isomorphic-unfetch@4.0.0`，却不能当成 `unfetch@5.0.0` 的 Node 官方入口

## 核心要点

固定版本可以拆成四层：

1. **XHR 发出去**：`request.open(method || "get", url, true)`，再 `send(body || null)`。请求头来自普通对象，不是 `Headers`。

2. **响应是手造对象**：`ok` 用 `((status / 100) | 0) == 2`。提供 `text` / `json` / `blob` / `clone`。`json()` 是 `JSON.parse(responseText)`。没有 stream body。

3. **headers 只是查询表**：从 `getAllResponseHeaders()` 用 `^(.+?):` 收集名字，取值再 `getResponseHeader`。有 `keys` / `entries` / `get` / `has`，没有 `append` / `set`。

4. **安装方式决定全局污染**：ponyfill 不改全局；polyfill 是 `if (!self.fetch) self.fetch = unfetch`。`credentials == "include"` 才设 `xhr.withCredentials`。

## 实践示例

### 案例 1：当作 ponyfill

```js
import fetch from "unfetch"

const res = await fetch("/bear", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hungry: true })
})
```

这一句不会调用原生 Fetch。body 要自己 stringify。HTTP 200–299 时 `res.ok` 为真，但 404 仍然 resolve。

### 案例 2：只在缺 Fetch 时安装

```js
import "unfetch/polyfill"

await fetch("/foo.json").then((r) => r.json())
```

`polyfill/polyfill.mjs` 只在 `self.fetch` 为空时赋值。现代浏览器里这行往往是空操作。

### 案例 3：cookie 不会默认走

```js
await fetch("/me", { credentials: "include" })
```

只有字符串恰好等于 `"include"` 才打开 `withCredentials`。`"same-origin"` 在这份实现里等于没写。站点若靠 cookie 会话，漏这一行就是未登录请求。

## 踩过的坑

1. **把它写成 Fetch wrapper**：源码是 `new XMLHttpRequest()`，没有委托 `window.fetch`。
2. **按 Axios / ofetch 去 `catch` 4xx**：固定实现跟 Fetch 规范一样，状态码错误仍 resolve。
3. **以为 `clone()` 复制了一份独立 body**：`clone` 是同一个工厂再跑一遍，读的还是那次 XHR。
4. **把 `isomorphic-unfetch` 当成 5.0.0 的一部分**：同提交工作区包版本是 `4.0.0`，依赖 `unfetch@^4.2.0` + `node-fetch@^3.2.0`，并且可能写 `global.fetch`。
5. **把 500b gzip 写进结论**：本轮未测体积。

## 适用 vs 不适用场景

**适用**：

- 需要一份极小的浏览器 Fetch 子集，只要 GET/POST、JSON/text、少量响应头
- 以 ponyfill 方式避免改全局，或在确认没有原生 Fetch 时用 polyfill

**不适用**：

- 需要 abort / `signal`、stream、`arrayBuffer`、完整 `Headers` / `Response`
- 需要 `"same-origin"` cookie 语义，或把 HTTP 错误自动变成 rejected Promise
- Node 服务端——核心文件依赖 XHR；跨端应单独审查 `isomorphic-unfetch` 或原生 Fetch

## 固定版本边界

- 本文绑定 `developit/unfetch@e8f8baa5...`，tag 与 package 均为 `5.0.0`。
- npm `gitHead` 与 lightweight tag 同指此提交。
- 同提交 `packages/isomorphic-unfetch` 未绑定；其 README 要求 Node `>= 12.20.0`（因为 `node-fetch` 3）。
- 本文未安装依赖、运行 jest / tsc、发送请求或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **polyfill 和 wrapper 不是一类东西**——unfetch 冒充 Fetch，redaxios 假定 Fetch 已在。
2. **安装入口决定是否改全局**——默认导入是 ponyfill，`/polyfill` 才可能赋值 `self.fetch`。
3. **子集要按类型定义读**——`signal` 被标成 `never`，不是“暂时没写文档”。
4. **workspace 里的同伴包可以有自己的版本号**——不能把 5.0.0 的合同套到 `isomorphic-unfetch@4.0.0`。

## 应用型自测

1. 页面已有原生 `fetch` 时，`import fetch from "unfetch"` 还会走 XHR 吗？
2. `fetch("/x")` 收到 500，Promise 会 reject 吗？
3. `{ credentials: "same-origin" }` 会打开 `xhr.withCredentials` 吗？

检查点：

1. 会。ponyfill 不检测、不委托原生 Fetch。
2. 不会。只有 `request.onerror` 才 reject。
3. 不会。源码只认 `"include"`。

## 延伸阅读

- 固定源码：[developit/unfetch](https://github.com/developit/unfetch) —— 本文绑定提交 `e8f8baa5c1aaf4f70afcfcc6bfa8b592fae6c861`
- 对照入口：`src/index.mjs`、`polyfill/polyfill.mjs`、`src/index.d.ts`
- [[redaxios]] —— 同作者的 Axios-on-Fetch 外壳，方向正好相反
- [[ofetch]] —— 真正建立在 Fetch 上的客户端
- [[ky]] —— 完整 Fetch wrapper，含 timeout / retry

## 关联

- [[redaxios]] —— 假定已有 Fetch；unfetch 则在没有 Fetch 时用 XHR 冒充
- [[ofetch]] —— 运行时 Fetch + hook，不是 XHR
- [[axios]] —— 完整客户端；不要把 unfetch 的响应对象当成 Axios `data`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[redaxios]] —— redaxios — 把 Axios API 收成一层 Fetch 外壳
