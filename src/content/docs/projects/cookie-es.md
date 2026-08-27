---
title: cookie-es — ESM Cookie / Set-Cookie 解析与序列化
description: 固定版本同时解析 Cookie 头、序列化 Set-Cookie，并按 RFC 6265bis 校验 Secure 与前缀
来源: https://github.com/unjs/cookie-es
日期: 2026-08-27
分类: HTTP 客户端
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/cookie-es
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 487c49d4908c0910fc9d36b6751d15af872c1893
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.1
---

## 是什么

cookie-es 是一份无运行时依赖的 ESM 库，同时处理 HTTP `Cookie` 请求头和 `Set-Cookie` 响应头。日常类比：它给你两把尺子——一把量浏览器带回来的 `Cookie` 字符串，一把按 RFC 6265bis 把属性写回 `Set-Cookie`。

```ts
import { parseCookie, serializeCookie, stringifyCookie, parseSetCookie } from "cookie-es"

parseCookie("sid=abc; theme=dark")
// { sid: "abc", theme: "dark" }

serializeCookie("sid", "abc", { httpOnly: true, secure: true, path: "/" })
// "sid=abc; Path=/; HttpOnly; Secure"
```

固定 `3.1.1` 只有一个导出入口 `./dist/index.mjs`，`sideEffects: false`。Cookie 解析同步自 jshttp/cookie v1.1.1；Set-Cookie 解析同步自 [[set-cookie-parser]] v3.1.0，再叠一层 6265bis 限制。

## 为什么重要

不理解 cookie-es 的双向合同，下面这些事会对不上：

- 为什么读 `Cookie` 头默认“先到先得”，写 `Set-Cookie` 却会因缺 `Secure` 直接抛错
- 为什么 `parseSetCookie` 只吃单条字符串，合并头必须先走 `splitSetCookieString`
- 为什么 `Domain=.Example.COM` 解析后变成 `example.com`
- 为什么 `__Host-` 前缀不是命名习惯，而是硬校验

## 核心要点

固定版本可以拆成四条链：

1. **读 `Cookie`**：`parse` / `parseCookie` 按 `;` 分段、按第一个 `=` 取键值，默认 `decodeURIComponent`（没有 `%` 就跳过）。结果是 prototype-less 对象。重复名默认保留第一次；`allowMultiple: true` 才收成数组。`filter(key)` 可跳过指定键。

2. **写 `Cookie` 请求头**：`stringifyCookie({ sid: "abc", theme: "dark" })` 编成 `sid=abc; theme=dark`。`undefined` 值被跳过；非法 name/value 抛 `TypeError`。

3. **写 `Set-Cookie`**：`serialize` / `serializeCookie` 接受 `serialize(name, value, options)` 或 `serialize({ name, value, ...attrs })`。非字符串 value 默认 `JSON.stringify`；`null` / `undefined` 写成空值。`Max-Age` 必须是整数：负数钳到 0，超过 `34560000`（400 天）被帽掉。`Partitioned`、`SameSite=None`、`__Secure-` / `__Host-` 都要求 `Secure`；`__Host-` 还要求 `Path=/` 且没有 `Domain`。

4. **读单条 `Set-Cookie`**：`parseSetCookie(str)` 返回对象或 `undefined`。禁止名（`name in Object.prototype`）、空 name+value、name+value 超过 4096 字节都拒绝。属性值超过 1024 忽略。Domain 去掉前导点并小写；未知 `SameSite` 落成 `lax`。

## 实践示例

### 案例 1：解析重复 Cookie

```ts
import { parseCookie } from "cookie-es"

parseCookie("foo=a; bar=b; foo=c")
// { foo: "a", bar: "b" }

parseCookie("foo=a; bar=b; foo=c", { allowMultiple: true })
// { foo: ["a", "c"], bar: "b" }
```

**逐部分解释**：默认 first-wins，不是 last-wins。空串或长度小于 2 的输入直接返回空对象。

### 案例 2：带前缀的 Set-Cookie

```ts
import { serializeCookie } from "cookie-es"

serializeCookie("__Host-sid", "abc", { secure: true, path: "/" })
// "__Host-sid=abc; Path=/; Secure"

serializeCookie("id", "1", { sameSite: "none" })
// TypeError: SameSite=None cookies must have the Secure attribute
```

`__Host-` 缺 `Path=/` 或带 `Domain` 同样抛错。这些检查发生在拼字符串之前。

### 案例 3：拆合并头再解析

```ts
import { splitSetCookieString, parseSetCookie } from "cookie-es"

const parts = splitSetCookieString(
  "foo=bar; Expires=Thu, 01 Jan 2026 00:00:00 GMT, baz=qux",
)
// ["foo=bar; Expires=Thu, 01 Jan 2026 00:00:00 GMT", "baz=qux"]

parts.map((part) => parseSetCookie(part))
```

`Expires` 里的逗号不会被当成下一条 cookie 的分隔符。`parseSetCookie` 本身不会替你拆数组或 Response。

## 踩过的坑

1. **把 `parseSetCookie` 当成 set-cookie-parser 的同名函数**：这边只收单字符串，返回对象或 `undefined`；那边收 Response / 数组，默认返回数组。
2. **以为重复 Cookie 后写覆盖**：`parseCookie` 默认保留第一次。
3. **`SameSite=None` 只写属性、不写 `Secure`**：序列化会抛错；解析侧则照单全收。
4. **把 README 的 bundle / install size 徽章当成你的产物保证**：本文未测体积。
5. **把 `HEAD` 上的 deps chore 当成 3.1.1**：绑定提交是 tag `v3.1.1` / `487c49d4...`。

## 适用 vs 不适用场景

**适用**：

- 需要同一份 ESM API 同时读 `Cookie`、写 `Set-Cookie`
- 希望序列化阶段就挡住缺 `Secure` 的 CHIPS / `__Host-` / `SameSite=None`
- 能接受“先 `splitSetCookieString` 再逐条 parse”的两步合同

**不适用**：

- 要从 Node `IncomingMessage` 或 `fetch` Response 直接抽 `Set-Cookie` 数组——用 [[set-cookie-parser]]
- 需要 CJS `require`——固定版本只导出 ESM
- 要把未实测的体积或吞吐写成选型结论

## 固定版本边界

- 本文绑定 `unjs/cookie-es@487c49d4908c0910fc9d36b6751d15af872c1893`，包版本 `3.1.1`；npm latest 同号，`gitHead` 一致。
- 仓内 `HEAD` 已前移到后续 deps chore，本文不绑定。
- 解析侧的 `Expires` 上限按“现在起 400 天”裁剪，结果依赖阅读时刻的 `Date.now()`。
- 本文未安装依赖、未跑 vitest、未发请求、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **读和写不是对称的**——解析尽量吞下奇怪输入；序列化按 6265bis 拒绝。
2. **first-wins 是显式合同**——要数组必须开 `allowMultiple`。
3. **Set-Cookie 合并头是独立问题**——拆分函数和解析函数分开导出。
4. **前缀 cookie 是校验，不是命名风格**——`__Host-` 绑死 Path 和 Domain。

## 应用型自测

1. `parseCookie("a=1; a=2")` 的 `a` 是 `"1"`、`"2"` 还是 `["1","2"]`？
2. `serializeCookie("id", "1", { sameSite: "none" })` 会得到带 `SameSite=None` 的字符串吗？
3. `parseSetCookie` 能直接吃 `response.headers.getSetCookie()` 返回的数组吗？

检查点：

1. `"1"`。默认 first-wins；要数组需 `allowMultiple: true`。
2. 不会，缺 `Secure` 会抛 `TypeError`。
3. 不能。它只吃单字符串；数组要自己映射，或改用 [[set-cookie-parser]]。

## 延伸阅读

- 文档：[unjs.io 包页](https://github.com/unjs/cookie-es) 与仓内 README
- 固定源码：[unjs/cookie-es](https://github.com/unjs/cookie-es) —— 本文绑定提交 `487c49d4908c0910fc9d36b6751d15af872c1893`
- RFC：[6265bis draft](https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html)
- [[set-cookie-parser]] —— 同源 Set-Cookie 解析器，输入面更宽、校验更少
- [[ofetch]] —— 同属 unjs，负责请求，不负责 cookie 合同
- [[hono]] —— 多运行时框架，cookie 仍要自己选解析器

## 关联

- [[set-cookie-parser]] —— 只解析 Set-Cookie，接受 Response / 数组
- [[ofetch]] —— 跨运行时 HTTP 客户端
- [[express]] —— 传统栈常搭配 cookie-parser，不是本包
- [[hono]] —— Web 标准 Request / Response 入口

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[set-cookie-parser]] —— set-cookie-parser — 把 Set-Cookie 头拆成对象
