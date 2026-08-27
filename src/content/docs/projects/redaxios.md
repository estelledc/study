---
title: redaxios — 把 Axios API 收成一层 Fetch 外壳
description: 用 Axios 形状的 get/post/data 调用运行时 Fetch，默认先 text 再 JSON.parse。
来源: https://github.com/developit/redaxios
日期: 2026-08-27
分类: HTTP 客户端
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/developit/redaxios
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ad40de9175109bbe144fd2ab81a001132f437184
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.5.1
---

## 是什么

redaxios 是一个 Axios 风格的 HTTP 客户端，内部只调用运行时 `fetch`。日常类比：柜台上还是那张 Axios 运单（`get` / `post` / `data` / `params`），仓库里干活的却是原厂 Fetch 叉车。

你写：

```js
import axios from "redaxios"

const user = await axios.get("/api/users/1")
console.log(user.status, user.data)
```

固定 `0.5.1` 的默认导出是 `create()` 的结果。它返回带 `status` / `headers` / `data` 的普通对象，不是原生 `Response`。库本身零运行时依赖；实际请求走 `options.fetch || fetch`。

## 为什么重要

不读固定源码，下面这些“Axios 印象”会对不上：

- 为什么 README 说“用 Axios 那套 API”，源码里却没有 interceptor、timeout、adapter
- 为什么 JSDoc 写默认 `responseType: "json"`、成功码 200–399，实现却先 `text()` 再 `JSON.parse`，成功判定是 `res.ok`
- 为什么 `auth: "Bearer x"` 能用，而 `auth: { username, password }` 不会变成 Basic
- 为什么 `CancelToken` 看起来像 `AbortController`，请求却没把 `signal` 传给 fetch

## 核心要点

固定版本可以拆成五步：

1. **工厂挂方法**：`create(defaults)` 把 `get` / `delete` / `head` / `options` / `post` / `put` / `patch` 接到同一函数；`all` 是 `Promise.all`，`spread` 是 `fn.apply.bind(fn, fn)`。

2. **合并配置**：`deepMerge(defaults, config)`。`headers` 合并时键名转小写，后写覆盖先写。

3. **整理 body 与 URL**：`transformRequest` 先跑。普通对象（没有 `append` / `text`）会被 `JSON.stringify`，并补 `content-type: application/json`。`baseURL` 只改“看起来不像带 `//` 协议”的地址；`params` 默认 `URLSearchParams`。

4. **交给 Fetch**：方法名转大写。`withCredentials` 为真才设 `credentials: "include"`，否则不传该字段。XSRF 从 `document.cookie` 读，Node 里 try/catch 直接跳过。

5. **解码后再猜 JSON**：`stream` 把 `res.body` 放进 `data`。其它类型先 `res[responseType || "text"]()`，再无条件 `JSON.parse`；失败就留下上一层结果。默认成功看 `res.ok`；失败 `reject` 的是这个响应对象本身。

## 实践示例

### 案例 1：POST 一份 JSON

```js
const created = await axios.post("/api/users", { name: "Ada" })
```

`post(url, data, config)` 把第二参当作 body。普通对象会被 stringify，并自动带 JSON Content-Type。`FormData` 因有 `append` 会原样直传。

### 案例 2：带 baseURL 和 params 的实例

```js
const api = axios.create({
  baseURL: "https://api.example.com",
  headers: { "X-App": "study" }
})
const res = await api.get("/users", { params: { page: 1 } })
```

相对路径 `/users` 会变成 `https://api.example.com/users`；已有 `?` 时 params 用 `&` 拼接。自定义 `fetch` 实现可以换进 `options.fetch`。

### 案例 3：4xx 不会得到 AxiosError

```js
try {
  await axios("/missing")
} catch (err) {
  console.log(err.status, err.data)
}
```

默认 `validateStatus` 就是 `res.ok`。404 的拒绝值仍是那个带 `status` / `data` 的对象，没有 `isAxiosError`，也没有独立 error 类。

## 踩过的坑

1. **把 JSDoc 当实现**：注释写默认 JSON、成功码到 399。源码默认走 `text` + `JSON.parse`，成功码跟 Fetch 的 `ok`。
2. **以为 `responseType: "text"` 会停在字符串**：JSON 文本仍会被 `JSON.parse` 成对象。测试里把这称为 “just how axios works”。
3. **把 `auth` 当成 Axios credentials 对象**：这里是直接写入 `authorization` 的字符串。
4. **指望 `CancelToken` 取消请求**：它只导出构造器，`fetch()` 调用没有 `signal`。
5. **把 800 bytes 或 gzip 数字写进结论**：本轮未测 bundle。

## 适用 vs 不适用场景

**适用**：

- 已经熟悉 Axios 调用形状，但环境已有 Fetch，只想要 `data` / `params` / `create`
- 浏览器或带全局 `fetch` 的运行时；可用 `options.fetch` 注入实现

**不适用**：

- 需要 interceptor、timeout、重试、上传进度或 Node http adapter
- 需要 Axios 的 Basic `auth` 对象或真正接入的 Cancel token
- 需要阶段 timeout、Duplex stream 或严格 schema 校验——这些都不在本库

## 固定版本边界

- 本文绑定 `developit/redaxios@ad40de91...`，tag 与 package 均为 `0.5.1`。
- npm `gitHead` 与 lightweight tag 同指此提交。
- 源码版权头写 Google Inc.；包作者是 Jason Miller，许可证 Apache-2.0。
- 本文未安装依赖、运行 karmatic、发送请求或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **API 像 Axios ≠ 实现是 Axios**——方法名可以复用，interceptor / adapter / error 类不能外推。
2. **注释会过期**——默认解析和成功码必须以 `src/index.js` 为准。
3. **JSON 被解两次**——先按 `responseType` 解码，再无条件 `JSON.parse`。
4. **取消能力要看有没有传给运输层**——导出 `AbortController` 不等于请求可取消。

## 应用型自测

1. 未设 `responseType` 时，响应体 `{"a":1}` 和 `not-json` 分别会变成什么？
2. `auth: { username: "a", password: "b" }` 会不会自动变成 `Basic ...`？
3. `new axios.CancelToken()` 之后，这次 GET 会不会带 `signal`？

检查点：

1. 对象 `{a:1}`；非 JSON 字符串保持原样。默认先 `text()` 再 `JSON.parse`。
2. 不会。`auth` 被当成 `authorization` 头的原始值。
3. 不会。`CancelToken` 只是别名，fetch 调用没有 `signal`。

## 延伸阅读

- 固定源码：[developit/redaxios](https://github.com/developit/redaxios) —— 本文绑定提交 `ad40de9175109bbe144fd2ab81a001132f437184`
- 对照入口：`src/index.js`、`test/index.test.js`
- [[axios]] —— 被模仿的 API；interceptor 与 adapter 在那边
- [[ofetch]] —— 同是 Fetch 外壳，但是 hook / retry / `destr`
- [[unfetch]] —— 同作者的 XHR fetch ponyfill，不是 Axios API

## 关联

- [[axios]] —— API 来源；不要把 redaxios 当成可替换实现
- [[ofetch]] —— Fetch 上的 defaults / hook 客户端
- [[ky]] —— 另一套 Fetch wrapper，timeout / retry 合同不同
- [[unfetch]] —— 提供“像 fetch 的 XHR”，redaxios 则假定 fetch 已经存在

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[unfetch]] —— unfetch — 用 XHR 冒充一份最小 Fetch
