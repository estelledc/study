---
title: universal-cookie — 浏览器与服务器共用的 Cookie 字符串层
description: 介绍 universal-cookie 8.1.2 如何用内存 map 加 cookie.parse/serialize 做同构读写，并说明它不是 RFC CookieJar。
来源: https://github.com/ItsBenCodes/cookies
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ItsBenCodes/cookies
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 54f246ee61c487792331d42f40f2a34960ba2a5b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.1.2
---

## 是什么

universal-cookie 是一套同构 Cookie API：浏览器里读写 `document.cookie`，服务器上读写你传入的 `Cookie` 头。日常类比：同一本通讯录封面，桌上有纸就抄纸，没有纸就只改手里的复印件。

你写：

```js
import Cookies from 'universal-cookie';

const cookies = new Cookies(null, { path: '/' });
cookies.set('myCat', 'Pacman');
cookies.get('myCat'); // Pacman
```

构造函数第一参可以是 cookie 头字符串或对象；省略时，浏览器会读 `document.cookie`。固定 8.1.2 自己不实现 RFC 匹配，解析和序列化交给依赖 `cookie`。

## 为什么重要

不理解它“只做字符串层”，就解释不了下面几件事：

- 为什么服务器上 `set()` 不会自动出现在下一个 Node HTTP 请求里
- 为什么 `get()` 有时把值变成对象，有时保持字符串
- 为什么 `remove` 必须带上当初 `set` 时的 `path` / `domain`
- 为什么它不能替代 [[tough-cookie]] 那种按 URL 过滤的 jar

## 核心要点

固定 8.1.2 的主链可以拆成五步：

1. **建一本内存通讯录**：`parseCookies` 见到字符串就 `cookie.parse`，见到对象就原样采用，否则 `{}`。浏览器里若没传入参，就用 `document.cookie`。

2. **判断能不能碰 DOM**：`hasDocumentCookie()` 要求 `document` 是对象且 `document.cookie` 是字符串。测试可用 `globalThis.TEST_HAS_DOCUMENT_COOKIE` 覆盖。

3. **读的时候先同步再反序列化**：`get` / `getAll` 默认调用 `update()` 从 `document.cookie` 拉回最新值。`readCookie` 会去掉 Express 的 `j:` 前缀，再尝试 `JSON.parse`；失败就退回原值。

4. **写的时候先改内存，再有条件写回 DOM**：非字符串值先 `JSON.stringify`。只有 `HAS_DOCUMENT_COOKIE` 为真时才 `document.cookie = cookie.serialize(...)`。选项与构造时的 `defaultSetOptions` 合并。

5. **用监听器发现外部改动**：第一个 `addChangeListener` 会挂 `window.cookieStore` 的 `change` 事件；没有这个 API 就每 300ms 轮询一次 `update()`。监听器清空后停止。

## 实践示例

### 案例 1：浏览器写回 DOM，服务器只改内存

```js
const browser = new Cookies(null, { path: '/' });
browser.set('theme', 'dark');

const server = new Cookies(req.headers.cookie, { path: '/' });
server.set('theme', 'light');
```

第一段在浏览器里会调用 `cookie.serialize` 写 `document.cookie`。第二段没有 DOM，只改 `this.cookies`；要把变更送回客户端，需要 Express / Koa 适配器或自己写 `Set-Cookie`。

### 案例 2：对象值靠 JSON，读的时候默认再 parse

```js
cookies.set('prefs', { lang: 'zh' });
cookies.get('prefs');                 // { lang: 'zh' }
cookies.get('prefs', { doNotParse: true }); // '{"lang":"zh"}'
```

`set` 对非字符串走 `JSON.stringify`。`get` 默认 `JSON.parse`；纯文本 `Pacman` 解析失败后仍返回原字符串。

### 案例 3：删除必须复用当初的作用域选项

```js
cookies.set('sid', 'abc', { path: '/', domain: 'example.com' });
cookies.remove('sid', { path: '/', domain: 'example.com' });
```

`remove` 把 `expires` 设成 `new Date(1970, 1, 1, 0, 0, 1)`（本地时间 1970-02-01 00:00:01），并设 `maxAge: 0`，再 `serialize` 空值。path / domain 对不上，浏览器会留下另一颗同名 cookie。

## 踩过的坑

1. **把它当成 RFC CookieJar**：没有 public suffix、host-only、按 URL 的 path 过滤。Node 客户端跨请求复用登录态应看 [[tough-cookie]]。

2. **SSR `set` 后以为响应头已经写好**：核心库只改内存。同仓 `universal-cookie-express` 用 `addChangeListener` 调 `res.cookie`，并且把秒级 `maxAge` 乘 1000 交给 Express。

3. **`get` 误解析看起来像 JSON 的字符串**：默认会 `JSON.parse`。只要原始字符串，传 `{ doNotParse: true }`。

4. **删除时漏掉 path**：浏览器按 name+domain+path 识别 cookie。只 `remove('sid')` 常常删不掉当初带 `path: '/'` 写下的值。

5. **README 的 UMD 示例仍写 `universal-cookie@7`**：本页绑定的是 npm `8.1.2` / tag `v8.1.2`。未核验 unpkg 上的 UMD 文件是否同步。

## 适用 vs 不适用场景

**适用**：

- React / [[next-js]] SSR 需要同一套 `get` / `set` 读写 cookie 字符串
- 浏览器里给 `document.cookie` 包一层对象值和变更监听
- 已经自己处理 `Set-Cookie`，只缺解析和序列化

**不适用**：

- 要按 RFC 决定“这个 URL 能带哪些 cookie”——用 [[tough-cookie]]
- 要完整会话、CSRF 和 cookie 前缀执法——看 [[better-auth]] / [[lucia]]
- 不能在浏览器读 `HttpOnly` cookie：类型里虽有 `httpOnly` 选项，浏览器脚本仍然看不到这些值
- 本轮未安装依赖、未跑测试，也未测 `size-limit`

## 固定版本边界

- 本文绑定 `ItsBenCodes/cookies@54f246ee61c487792331d42f40f2a34960ba2a5b`，monorepo tag `v8.1.2`，`packages/universal-cookie` 的 `version` 与 npm `gitHead` 同为此提交。
- GitHub 仓库已从 `reactivestack/cookies` 转到 `ItsBenCodes/cookies`；npm `repository` 指向当前 owner。
- 包依赖 `cookie@^1.1.1`；`exports` 分 ESM / CJS，`sideEffects` 为 false。
- 根仓 `engines.node >= 22.14.0` 约束的是 monorepo 开发工具链，发布包自身没有 `engines` 字段。
- 同 tag 还包含 `react-cookie`、`universal-cookie-express`、`universal-cookie-koa`；本页只审查 `universal-cookie` 核心与 Express 中间件如何接 `set` / `remove`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **同构不等于自动回写 HTTP**——浏览器写 DOM，服务器只改内存，除非再接适配器。
2. **默认 `get` 会尝试 JSON**——对象往返方便，纯文本要关 `doNotParse`。
3. **删除是“写一颗过期 cookie”**——作用域选项必须和当初写入一致。
4. **监听靠 cookieStore 或 300ms 轮询**——不是操作系统级的 cookie jar 事件。

## 应用型自测

1. 在 Node 里 `new Cookies(req.headers.cookie)` 后调用 `set('a', '1')`，会不会自动给当前 HTTP 响应加上 `Set-Cookie`？
2. `cookies.get('x')` 遇到值 `{"n":1}` 时，默认返回对象还是字符串？
3. `remove('sid')` 用的过期时间是 `new Date(0)` 吗？

检查点：

1. 不会。没有 `document.cookie` 时只改内存；Express 要靠独立中间件。
2. 对象。默认会 `JSON.parse`。
3. 不是。源码写的是 `new Date(1970, 1, 1, 0, 0, 1)`，再加 `maxAge: 0`。

## 延伸阅读

- 固定源码：[ItsBenCodes/cookies](https://github.com/ItsBenCodes/cookies) —— 本文绑定提交 `54f246ee61c487792331d42f40f2a34960ba2a5b`
- 包说明：`packages/universal-cookie/README.md`
- 依赖的 parse/serialize：[jshttp/cookie](https://github.com/jshttp/cookie)
- [[tough-cookie]] —— Node 上按 URL 匹配的 RFC jar
- [[react]] —— 同仓 `react-cookie` 把这层 API 接到 hooks

## 关联

- [[tough-cookie]] —— RFC CookieJar 对照
- [[react]] / [[next-js]] —— 常见的同构 cookie 使用面
- [[express]] —— `universal-cookie-express` 把变更听进 `res.cookie`
- [[better-auth]] / [[lucia]] —— 会话与 cookie 安全策略，不只是字符串读写
- [[axios]] —— 浏览器客户端若要自动带 cookie，通常靠浏览器本身，而不是这个库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
