---
title: set-cookie-parser — 把 Set-Cookie 头拆成对象
description: 固定版本从字符串、数组或 Response 解析 Set-Cookie，默认宽松且不序列化
来源: https://github.com/nfriedly/set-cookie-parser
日期: 2026-08-27
分类: HTTP 客户端
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/nfriedly/set-cookie-parser
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 60b9d7f2b2a029238676bb0c34cd1a324198c766
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.2
---

## 是什么

set-cookie-parser 是一份只做解析、不做序列化的 `Set-Cookie` 库。日常类比：快递到了，它负责把面单上可能粘在一起的多张标签撕开，写成一张张卡片；它不帮你再打印新面单。

```js
import { parseSetCookie } from "set-cookie-parser"

parseSetCookie("sid=abc; Path=/; HttpOnly")
// [{ name: "sid", value: "abc", path: "/", httpOnly: true }]

parseSetCookie(response) // Node IncomingMessage 或 fetch Response
```

固定 `3.1.2` 同时提供 ESM `lib/set-cookie.js` 和构建出的 CJS `dist/set-cookie.cjs`。文档主入口是 named export `parseSetCookie`；`parse`、`parseString`、`splitCookiesString` 和 default export 仍在，只是标成兼容别名。

## 为什么重要

不理解它的输入适配和默认值，下面这些事会对不上：

- 为什么对字符串会自动按逗号拆条，对 Node 已经拆好的数组却默认不拆
- 为什么拿 request 的 `Cookie` 头调用会在控制台报警
- 为什么 `Domain=.example.com` 解析后仍带着点，和 [[cookie-es]] 不一样
- 为什么 `SameSite=Invalid` 会原样留下，而不是改成 `lax`

## 核心要点

固定实现可以拆成五步：

1. **认输入**：字符串、字符串数组，或带 `headers` 的类响应对象。优先 `headers.getSetCookie()`（fetch）；其次 Node 的 `headers["set-cookie"]`；再否则大小写不敏感地找 `set-cookie`。若只有 `cookie` 没有 `set-cookie`，默认 `console.warn`，`silent: true` 可关。

2. **决定是否拆合并头**：默认 `split: "auto"`——字符串拆、数组不拆。`true` 总拆，`false` 不拆。拆分算法与 cookie-es 的 `splitSetCookieString` 同源：逗号后面先碰到 `=` 才算下一条。

3. **逐条 `parseString`**：按 `;` 分段，第一段用第一个 `=` 切开 name/value。禁止名（`key in {}`，例如 `__proto__`）返回 `null` 并被滤掉。`decodeValues` 默认调用 `decodeURIComponent`，失败则 `console.error` 并保留原值。

4. **属性**：`Expires` 直接 `new Date(value)`，不检查是否为有效日期；`Max-Age` 用 `parseInt`，NaN 丢弃，没有 400 天帽。`Secure` / `HttpOnly` / `Partitioned` 设为 `true`。`sameSite` 原样拷贝。未知属性（含 `priority`、`path`、`domain`）挂到对象上。

5. **输出形状**：默认返回数组。`map: true` 返回 prototype-less 对象，同名后写覆盖。空 / falsy 输入在数组模式下是 `[]`。v3.1.2 起，只有 `;` 这种空 name-value 不再抛错。

## 实践示例

### 案例 1：字符串与数组的 split 默认不同

```js
import { parseSetCookie } from "set-cookie-parser"

parseSetCookie("a=1, b=2")
// 默认 split:"auto" → 两条

parseSetCookie(["a=1, b=2"])
// 数组默认不拆 → 一条，name 为 "a"，value 含逗号
```

Node 的 `IncomingMessage.headers["set-cookie"]` 已经是数组，所以默认不会再拆。React Native 一类会把多条 `Set-Cookie` 收成一个字符串的环境，才需要拆。

### 案例 2：fetch Response

```js
const cookies = parseSetCookie(await fetch(url))
```

只要 `headers.getSetCookie` 是函数，就会走这条快路径，而不是去读已经被合并的 `Headers` 迭代器。这是 v2.6.0 起就有的合同，3.1.2 仍保留。

### 案例 3：map 与原型污染

```js
parseSetCookie(["sid=1", "sid=2"], { map: true })
// { sid: { name: "sid", value: "2" } }

parseSetCookie("__proto__=evil")
// []
```

`map: true` 后写覆盖。禁止名在 `parseString` 阶段返回 `null`，进不了结果。

## 踩过的坑

1. **把它当成 cookie-es 的 `parseSetCookie`**：这边默认返回数组，并接受 Response；那边返回单个对象或 `undefined`，且会做 6265bis 裁剪。
2. **对已经是数组的 Node 头再假设自动拆逗号**：`split: "auto"` 对数组是关闭的。
3. **把 request 当 response 喂进去**：会警告，并解析不到 cookie。
4. **依赖 `expires` 一定是有效 `Date`**：源码不校验，`Expires=not-a-date` 会留下 Invalid Date。
5. **以为 v3 删掉了 default export**：兼容导出还在，只是文档不再主推。

## 适用 vs 不适用场景

**适用**：

- 要从 Node 响应或 fetch Response 收集 0 到多条 `Set-Cookie`
- 需要 ESM 和 CJS 同一套 API
- 希望解析宽松，把校验留给后面的 `cookie.serialize`

**不适用**：

- 要写回 `Set-Cookie` 字符串——本包不序列化
- 要在解析阶段强制 `Secure` / `__Host-` / 400 天上限——看 [[cookie-es]]
- 要把未跑过的测试或体积数字写成结论

## 固定版本边界

- 本文绑定 `nfriedly/set-cookie-parser@60b9d7f2b2a029238676bb0c34cd1a324198c766`，包版本 `3.1.2`；npm latest 同号，`gitHead` 一致。
- 仓内 `HEAD` 已有后续 js-yaml dependabot 提交，本文不绑定。
- v3.0.0 起默认按输入类型拆合并头；v3.1.2 修空 name-value 抛错。
- 本文未安装依赖、未跑 mocha / tsd、未发请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **解析器的价值常在输入适配**——字符串、数组、Node、fetch 四条入口比属性枚举更关键。
2. **`split: "auto"` 是历史兼容**——Node 已拆数组，再拆会把合法逗号切坏。
3. **宽松解析把风险留给调用方**——SameSite、Expires、Max-Age 都不按 6265bis 改写。
4. **禁止名用 `key in {}` 挡原型污染**——和 cookie-es 的 `name in Object.prototype` 同类，但失败时返回 `null` / `[]` 而不是 `undefined`。

## 应用型自测

1. `parseSetCookie("a=1, b=2")` 和 `parseSetCookie(["a=1, b=2"])` 条数一样吗？
2. `parseSetCookie("x=1; SameSite=Invalid")` 的 `sameSite` 会变成 `"lax"` 吗？
3. 把只有 `headers.cookie` 的 request 传进去，默认会怎样？

检查点：

1. 不一样。字符串默认拆成两条，数组默认保持一条。
2. 不会。本包原样拷贝，不做 RFC 回退。
3. 会 `console.warn`，并得到空数组（找不到 `set-cookie`）。

## 延伸阅读

- 文档：仓内 README 与 [npm 页](https://www.npmjs.com/package/set-cookie-parser)
- 固定源码：[nfriedly/set-cookie-parser](https://github.com/nfriedly/set-cookie-parser) —— 本文绑定提交 `60b9d7f2b2a029238676bb0c34cd1a324198c766`
- RFC：[RFC 6265](https://tools.ietf.org/html/rfc6265) / [6265bis draft](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html)
- [[cookie-es]] —— 同主题的解析+序列化 ESM 实现，校验更严
- [[express]] —— `res.cookie()` 的 `maxAge` 以毫秒计，README 特意提醒要乘 1000
- [[ofetch]] —— 发请求；cookie 头仍要另选解析器

## 关联

- [[cookie-es]] —— 读 Cookie + 写 Set-Cookie，带 6265bis 硬校验
- [[express]] —— Node 响应头已是数组，默认不必再 split
- [[ofetch]] —— Fetch 包装，不解析 Set-Cookie
- [[hono]] —— 标准 Response，可用 `getSetCookie()` 路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cookie-es]] —— cookie-es — ESM Cookie / Set-Cookie 解析与序列化
