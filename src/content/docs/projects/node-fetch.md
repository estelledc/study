---
title: node-fetch — 把 WHATWG Fetch 接到 Node http
description: ESM userland Fetch：用 Node http/https 实现 WHATWG 外观，不自带 retry，也不走 undici
来源: https://github.com/node-fetch/node-fetch
日期: 2026-08-27
分类: HTTP 客户端
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/node-fetch/node-fetch
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8b3320d2a7c07bce4afc6b2bf6c3bbddda85b01f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.3.2
---

## 是什么

node-fetch 是一个把 WHATWG Fetch 接到 Node `http`/`https` 上的用户态实现。日常类比：浏览器已经有官方窗口，Node 早期没有，于是有人按同一张图纸在服务器上搭了一个；运输层仍是 Node 自己的 `http.request`，不是 [[undici]]。

你写：

```js
import fetch from "node-fetch";

const res = await fetch("https://example.com/api/users/1");
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const user = await res.json();
```

固定 tag `v3.3.2` 是 ESM-only（`type: module`），依赖 `data-uri-to-buffer`、`fetch-blob` 和 `formdata-polyfill`。engines 写 `^12.20.0 || ^14.13.1 || >=16.0.0`。npm 与 GitHub tag 都指向 `8b3320d2...`，但仓内 `package.json` 的 `version` 仍写着 `3.1.1`。

## 为什么重要

不理解 node-fetch 和运行时 fetch / undici 的边界，下面这些事都没法解释：

- 为什么 500 不会进 `catch`，必须看 `res.ok`
- 为什么带用户名密码的 URL 会直接 TypeError
- 为什么 Readable body 不能自动跟随非 303 重定向
- 为什么跨域重定向会丢掉 Authorization / Cookie

## 核心要点

node-fetch 的执行链可以拆成五步：

1. **构造 Request**：解析绝对 URL，拒绝嵌入凭证；GET/HEAD 禁止 body；默认 `redirect=follow`、`follow=20`、`compress=true`。

2. **翻译成 Node 选项**：补 `Accept: */*`、可选 `Content-Length`、默认 `User-Agent: node-fetch`；开启压缩时补 `Accept-Encoding: gzip, deflate, br`。

3. **用 `http`/`https`.request 发请求**：`data:` 走 `data-uri-to-buffer` 短路；`signal` 转成 `AbortError`。

4. **处理重定向**：301/302 的 POST 与 303 改 GET；跨域或跨协议会删 authorization/cookie；Readable body 不能在非 303 上重放。

5. **包装 Response**：`res.body` 是 Node Readable；gzip/deflate/br 默认解压；`size > 0` 时消费 body 会截断并抛 `max-size`。

## 实践示例

### 案例 1：HTTP 错误状态要自己判

```js
import fetch from "node-fetch";

const res = await fetch("https://example.com/missing");
console.log(res.ok, res.status); // false, 404 —— 这里还没有 throw

if (!res.ok) {
  throw new Error(`HTTP ${res.status}`);
}
```

和浏览器 fetch 一样：网络失败才 reject，4xx/5xx 仍是普通 Response。`FetchError` 用于系统错误、非法重定向、超限等，不是“状态码不等于 200”。

### 案例 2：重定向、凭证和流式 body

```js
import fetch from "node-fetch";
import { Readable } from "node:stream";

await fetch("https://example.com/login", {
  method: "POST",
  body: JSON.stringify({ user: "ada" }),
  headers: { "content-type": "application/json" },
  redirect: "follow" // 默认；最多 20 次
});

// 嵌入 user:pass 会立刻 TypeError
// await fetch("https://user:pass@example.com/secret");

await fetch("https://example.com/upload", {
  method: "POST",
  body: Readable.from(["chunk"]),
  redirect: "manual" // 流式 body 无法在 follow 时安全重放
});
```

跨到不同域或 `https → http` 时，实现会删除 `authorization`、`www-authenticate`、`cookie`、`cookie2`。

### 案例 3：压缩和体积上限

```js
import fetch from "node-fetch";

const res = await fetch("https://example.com/large.json", {
  compress: true, // 默认
  size: 1_000_000 // 0 表示不限制
});
const text = await res.text(); // 超过 size 会抛 FetchError type=max-size
```

`compress: false` 时不自动解 gzip/br。`highWaterMark` 默认 16384，克隆 Response 时两边 stream 都用这个值，和浏览器内部缓冲不是同一量级。

## 踩过的坑

1. **把 HTTP 错误当异常**：`await fetch()` 成功只说明传输完成。业务失败要看 `ok`/`status`。

2. **相对 URL**：`new URL(input)` 需要绝对地址；`/api/users` 会抛 TypeError。

3. **Readable 跟随重定向**：非 303 且 body 是 Node Readable 时，follow 会以 `unsupported-redirect` 失败。

4. **以为默认会关连接**：本固定修订去掉了默认 `Connection: close`。连接复用取决于 Node `http.Agent`，不是 node-fetch 自己的 Pool。

5. **把仓内 version 字段当 npm 版本**：tag/npm 是 3.3.2，但 git 里的 `package.json` 仍写 3.1.1；对照版本时以 tag 与 `gitHead` 为准。

## 适用 vs 不适用场景

**适用**：

- 仍要在 Node 16/18 或明确 ESM userland Fetch 的代码路径上跑
- 测试、脚本、或需要和旧 `node-fetch` API（`size` / `follow` / `agent`）对齐的库
- 希望依赖图停留在 `http`/`https`，不引入 undici Dispatcher

**不适用**：

- Node 22+ 新服务——优先运行时 fetch / [[undici]]
- 浏览器或 Edge——用原生 fetch 或 [[ky]] / [[wretch]]
- 需要内建 cookie jar、cache 或 retry budget
- 还在用 CommonJS `require("node-fetch")`——3.x 是 ESM；CJS 要回到 2.x 线并另做 provenance

## 固定版本边界

- 本文绑定 `node-fetch/node-fetch@8b3320d2...`。npm `node-fetch@3.3.2` 的 `gitHead` 与 GitHub tag `v3.3.2` 一致。
- 仓内 `package.json.version` 仍为 `3.1.1`；未猜测发布脚本如何改写该字段。
- 默认 `follow=20`、`compress=true`、`size=0`、`User-Agent=node-fetch`；只接受 `data:`/`http:`/`https:`。
- 本修订的可见行为变化之一是去掉默认 `Connection: close`。
- 本文未安装依赖、运行 mocha、发送请求或对比 Node 内置 fetch，状态保持 `UNVERIFIED`。

## 学到什么

1. **Fetch 外观不等于实现**——同样是 `fetch()`，node-fetch 走 `http.request`，undici 走 Dispatcher。
2. **默认不重试、不抛 HTTP 错误**——这是 spec 选择，不是库漏写。
3. **重定向是安全边界**——凭证头和 stream body 都会改变 follow 能否成立。
4. ** provenance 要对三元组**——tag、npm `gitHead` 和仓内 version 字段可能不一致。

## 应用型自测

1. `fetch(url)` 收到 500，Promise 会不会 reject？
2. 不改 `follow` 时，最多自动跟随几次重定向？
3. `fetch("https://user:token@example.com")` 会怎样？

检查点：

1. 不会。只有网络/中止/解析类错误才 reject。
2. 20 次；`request.counter >= request.follow` 后抛 `max-redirect`。
3. 构造 Request 时抛 TypeError：不允许 URL 内嵌凭证。

## 延伸阅读

- 固定源码：[node-fetch/node-fetch](https://github.com/node-fetch/node-fetch) —— 本文绑定提交 `8b3320d2a7c07bce4afc6b2bf6c3bbddda85b01f`
- 差异说明：仓库 `docs/v3-LIMITS.md`、`docs/ERROR-HANDLING.md`
- [[undici]] —— Node 官方客户端与内置 fetch 实现
- [[ky]] —— 现代运行时上的薄 Fetch 包装
- [[got]] —— 另一条不装成 Fetch 的 Node 客户端

## 关联

- [[undici]] —— 官方实现；新 Node 上应优先对它，而不是再垫一层 polyfill
- [[ky]] —— 同样暴露 Fetch 外观，但假设运行时已有 fetch
- [[ofetch]] —— Node 入口曾用 node-fetch-native 做缺省 polyfill
- [[wretch]] —— fluent Fetch wrapper，依赖运行时 fetch
- [[axios]] —— 非 Fetch 外观的跨端客户端
- [[express]] —— 常见被调服务；客户端错误处理仍要自己看 status

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
