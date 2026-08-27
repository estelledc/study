---
title: Superagent — 先填运单再交给 http 或 XHR
description: 经典 callback/thenable HTTP 客户端：Node 走 http/https，浏览器走 XHR，不是 Fetch 包装
来源: 'https://github.com/ladjs/superagent'
日期: 2026-08-27
分类: HTTP 客户端
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ladjs/superagent
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3ef367619fbb2a8d07082238892ae12dafe4b0b0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.3.0
---

## 是什么

Superagent 是一个 fluent HTTP 客户端。日常类比：先在同一张运单上改 method、query、header 和 body，调用 `.end()` 或 `.then()` 后，才交给 Node 的 `http`/`https`，或浏览器的 `XMLHttpRequest`。

它不是 Fetch 包装。固定 10.3.0 的浏览器入口是 XHR；Node 入口是内置 HTTP 模块，HTTP/2 要显式打开。

```js
const request = require("superagent");

const res = await request
  .post("https://api.example.com/users")
  .send({name: "Alice"})
  .set("Accept", "application/json");
```

`.send({...})` 在没写 type 时会把对象当成 JSON。`.then()` 内部仍调用 `.end()`。

## 为什么重要

不理解这张运单，下面这些事都没法解释：

- 为什么默认 404 会进 Promise reject，而 `.ok(res => res.status < 500)` 又能把 404 当成功
- 为什么不写 `.timeout()` 就没有总开关，不写 `.retry()` 就不会重试
- 为什么 `.retry()` 默认连 POST 也可能再发一遍
- 为什么 Node 上要 `request.agent()` 才有 cookie jar，浏览器里 `.agent()` 只记默认选项

## 核心要点

固定 10.3.0 的主链可以拆成五步：

1. **造一张可变 Request**：`request.get/post(...)` 返回同一个对象；`.query()` / `.send()` / `.set()` / `.auth()` 都改它。

2. **`.end()` 才真正发出**：`.then()` 只是包一层 Promise。Node 走 `http`/`https`/`http2`；浏览器走 XHR。

3. **默认几乎不帮你管时间**：timeout 和 retry 都是关上的。单独调用 `.retry()` 会把 `_maxRetries` 设成 1。

4. **2xx 以外默认失败**：内部 `_isResponseOK` 只认 200–299。`.ok(fn)` 会整段替换这个判断。

5. **平台能力不对称**：Node 有 redirect（默认 5 次，HEAD 默认 0）、decompress、cookie agent；浏览器 redirect API 是空操作，cookie 交给浏览器。

## 实践示例

### 案例 1：thenable 仍然是 `.end()`

```js
const request = require("superagent");

const user = await request
  .get("https://api.example.com/users/1")
  .accept("json");
```

这行看起来像 Fetch，底层仍是 callback 客户端。不要同时调用 `.end()` 和 `.then()`：Node 对第二次 `.end()` 会抛错。

### 案例 2：把 4xx 当成业务成功

```js
const res = await request
  .get("https://api.example.com/missing")
  .ok((response) => response.status < 500);
```

默认 404 会生成带 `status` / `response` 的 Error。上面这行把成功定义改成“不是 5xx”，所以 404 会 resolve。这和 Ky 的 `throwHttpErrors` 不是同一套开关。

### 案例 3：Node 上复用 cookie

```js
const request = require("superagent");

const agent = request.agent();
await agent.post("https://api.example.com/login").send({user: "ada", password: "secret"});
const me = await agent.get("https://api.example.com/me");
```

`request.agent()` 会建 CookieJar，在 `response` / `redirect` 时收 `Set-Cookie`，下次请求再贴回去。浏览器侧没有这套 jar；`.withCredentials()` 才影响跨域 cookie。

## 踩过的坑

1. **`.retry()` 没有 method 白名单**：源码里的 METHODS 检查被注释掉了。POST 失败后也可能再发，先确认接口幂等，或自己传 retry callback。

2. **timeout 默认不存在**：`.timeout(ms)` 才是 deadline；`.timeout({response: ms})` 管首字节。`0` / `false` 会关掉。不要把 Ky 的 10 秒默认套过来。

3. **HEAD 默认不跟随跳转**：普通方法默认最多 5 次；HEAD 默认 0，需要显式 `.redirects(n)`。

4. **`.send()` 和 `.field()` / `.attach()` 互斥**：混用会抛错。上传文件走 multipart，不要再 `.send(json)`。

5. **浏览器没有 Node 那种 Agent**：`.agent(http.Agent)` 只会警告。上传 timeout 也只在 XHR 路径实现。

## 适用 vs 不适用场景

**适用**：

- 已经有 Superagent 插件、测试辅助或旧 Node 客户端代码
- 需要 Node cookie jar、手动 multipart 或显式 HTTP/2
- 想用 `.ok()` 把部分 4xx 留在成功路径里

**不适用**：

- 新项目要共用浏览器 / Worker / Deno 的 Fetch 合同 → 看 [[ky]] 或 [[ofetch]]
- 需要 Node 官方 dispatcher / WHATWG fetch → 看 undici
- 只要一个不可变配置链 → 看 [[wretch]]

## 固定版本边界

- 本文绑定 `ladjs/superagent@3ef36761...`。GitHub tag `v10.3.0` 剥开后、npm `gitHead` 与当时 `master` 都指向它。
- package 要求 Node `>=14.18.0`。发布入口是编译后的 `lib/`，本轮读的是同提交 `src/`。
- 默认：无 timeout、无 retry、非 HEAD redirect=5、HTTP/2 关闭、最大缓冲响应 200_000_000 字节。
- 未安装依赖、未发请求、未跑上游测试或测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **fluent 不等于 Fetch**：同一套 `.get().send().then()` 可以底下完全不是 `globalThis.fetch`。
2. **默认关闭也是合同**：Superagent 把 timeout/retry 留给调用方；Ky 则带了 10 秒和 2 次重试。
3. **平台分流写在 `browser` 字段**：bundler 把 Node 入口换成 `client.js` 后，redirect、cookie jar 和 stream 都会消失。

## 应用型自测

1. `await request.get(url)` 没有写 `.ok()`。404 会进 then 还是 reject？
2. 只调用 `.retry()`、不传数字。POST 收到 500 时，实现会不会再发一次？
3. 浏览器代码里写 `request.agent()`，能否得到和 Node 一样的 cookie jar？

检查点：

1. reject。默认只把 2xx 当成功。
2. 会。`.retry()` 无参时 `_maxRetries = 1`，而且 method 白名单是注释掉的。
3. 不能。浏览器 Agent 只存默认选项，cookie 由浏览器管理。

## 延伸阅读

- 官方文档：[github.com/ladjs/superagent](https://github.com/ladjs/superagent)
- 固定源码：[ladjs/superagent](https://github.com/ladjs/superagent) —— 本文绑定提交 `3ef367619fbb2a8d07082238892ae12dafe4b0b0`
- [[ky]] —— Fetch 包装，默认带 timeout/retry
- [[axios]] —— interceptor / adapter 路线
- [[got]] —— Node Duplex 客户端

## 关联

- [[ky]] —— 现代 Fetch 包装，默认策略相反
- [[axios]] —— 同样覆盖浏览器和 Node，但走 adapter
- [[got]] —— Node 服务端流式客户端
- [[ofetch]] —— Nuxt 默认 Fetch 包装
- [[wretch]] —— 不可变 Fetch 配置链
- [[express]] —— 常见后端配对

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
