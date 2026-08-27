---
title: cookies — 给 Node 请求响应配可签名的 Cookie / Set-Cookie 罐子
description: 介绍 pillarjs/cookies 0.9.1 如何用 Keygrip 签名、毫秒 maxAge 和默认 HttpOnly 读写 HTTP cookie。
来源: https://github.com/pillarjs/cookies
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pillarjs/cookies
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b58c7207bb80a900f8db527bc847b4e0a8d49009
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.9.1
---

## 是什么

`cookies`（npm 包名也是 `cookies`）是一个面向 Node `IncomingMessage` / `ServerResponse` 的 cookie 助手。日常类比：每个请求领一只罐子，从请求头的 `Cookie` 纸条里按名字摸糖，往响应头的 `Set-Cookie` 再贴一条；需要防篡改时，旁边再贴一张 `.sig` 签名条。

你写：

```js
var http = require('http')
var Cookies = require('cookies')

http.createServer(function (req, res) {
  var cookies = new Cookies(req, res, { keys: ['keyboard cat'] })
  var last = cookies.get('LastVisit', { signed: true })
  cookies.set('LastVisit', new Date().toISOString(), { signed: true })
  res.end(last ? 'welcome back' : 'first visit')
}).listen(3000)
```

固定 0.9.1 只有一份 `index.js`。依赖 `depd` 与 `keygrip`。`engines.node` 写的是 `>= 0.8`。

## 为什么重要

不理解“惰性解析 + 签名 cookie 是另一条同名 `.sig`”，就解释不了下面几件事：

- 为什么构造函数几乎不读请求头，第一次 `get` 才正则匹配
- 为什么签名失败不是抛错，而是返回 `undefined` 并过期那张 `.sig`
- 为什么 `maxAge: 86400` 不是“一天”，而是 86.4 秒
- 为什么在明文 HTTP 上 `set(..., { secure: true })` 会直接扔 Error

## 核心要点

固定 0.9.1 的主链可以拆成五步：

1. **先挂 request / response**：`new Cookies(req, res, options)` 只保存引用。`options.keys` 可以是字符串数组（内部 `new Keygrip`）或现成 Keygrip。第三参直接传数组或 Keygrip 已被 `depd` 标成弃用。

2. **`get` 按名字编译正则**：`getPattern` 把名字里的正则元字符转义，缓存成 `(?:^|;) *name=([^;]*)`。命中后若值被引号包住就剥掉。未要求签名则立刻返回字符串。

3. **签名走旁边那张 `.sig`**：`opts.signed` 默认等于 `!!this.keys`。签名内容是 `name=value`，不是单独的 value。`keys.index(data, remote)`：`0` 表示当前钥匙，直接返回；大于 `0` 表示旧钥匙，会重签并写回；小于 `0` 表示对不上，过期 `.sig` 且不返回值。

4. **`set` 追加 `Set-Cookie`**：新建 `Cookie`，`pushCookie` 推进已有头数组。`secure` 默认看 `this.secure`，否则看 `req.protocol === 'https'` 或 `req.socket.encrypted`。显式 `secure: true` 遇上未加密连接会抛错。值为空则 `expires = new Date(0)`，用来删除。

5. **属性默认偏服务端**：`path=/`、`httpOnly=true`、`partitioned=false`、`sameSite=false`。`maxAge` 是毫秒，`toHeader` 里写成 `expires = new Date(Date.now() + this.maxAge)`。`sameSite === true` 映射成 `strict`。`overwrite: true` 会先丢掉本次响应里同名的旧行。

## 实践示例

### 案例 1：签名 cookie 是两条头，不是一条加密值

```js
var cookies = new Cookies(req, res, { keys: ['new-key', 'old-key'] })
cookies.set('uid', '42', { signed: true })
```

响应里会出现 `uid=42` 和 `uid.sig=...`。下次 `get('uid', { signed: true })` 先读值，再读 `.sig`。旧钥匙仍能通过时，实现会用第一把钥匙重签，完成轮换。

### 案例 2：毫秒 maxAge，空值即删除

```js
cookies.set('flash', 'ok', { maxAge: 60 * 1000 })
cookies.set('flash')
```

`60 * 1000` 是一分钟。第二次不传 value，`Cookie` 构造器把 `expires` 设成 `new Date(0)`，并清空 `maxAge`。这和浏览器库 [[js-cookie]] 用 `expires: -1` 天是同一意图、不同单位。

### 案例 3：Connect / Express 中间件只是挂同一只罐子

```js
app.use(Cookies.express(['keyboard cat']))
app.use(function (req, res) {
  req.cookies.set('seen', '1')
  res.end(String(res.cookies.get('seen')))
})
```

`Cookies.express` / `Cookies.connect` 把 `req.cookies` 和 `res.cookies` 指到同一个 `Cookies` 实例。它不解析 body，也不代替 cookie-parser 那种 `req.cookies.foo` 对象。

## 踩过的坑

1. **把 `maxAge` 当成秒或天**：源码直接加到 `Date.now()`。写 `86400` 只会活大约一分半。一天应写 `86400000`。

2. **在 HTTP 明文上强行 `secure: true`**：未加密时会抛 `Cannot send secure cookie over unencrypted connection`。反向代理后面要自己设 `options.secure`，或让框架把 `req.protocol` 纠成 `https`。

3. **以为签名失败会抛错**：对不上钥匙时 `get` 返回 `undefined`，并写一条过期 `.sig`。调用方必须把“没有 cookie”和“被改过”当成同一分支，除非自己再查头。

4. **名字或值里带 `;` / `=`**：`Cookie` 构造器会扔 `TypeError`。0.9.1 的 HISTORY 写明：0.9.0 曾误伤值里的 `=`，0.9.1 修好了。值仍不能含 `;`。

5. **把 Keygrip 算法细节算进本库**：本文件只调用 `keys.sign` / `keys.index`。具体 HMAC 与时间安全比较在 `keygrip`，本轮未打开那个依赖的源码。

## 适用 vs 不适用场景

**适用**：

- Node HTTP / Connect / Express 上按请求读写 cookie，并接受默认 HttpOnly
- 需要用 Keygrip 轮换钥匙做签名，而不是把值本身加密
- 能接受惰性解析、正则缓存、以及 `overwrite` 只作用于本次响应头

**不适用**：

- 浏览器里读 `document.cookie`——看 [[js-cookie]]
- 完整登录会话、CSRF、OAuth——看 [[lucia]] / [[better-auth]]
- 不能接受 `engines.node >= 0.8` 与默认 `httpOnly: true` 的服务端偏见

## 固定版本边界

- 本文绑定 `pillarjs/cookies@b58c7207bb80a900f8db527bc847b4e0a8d49009`，tag `0.9.1` 与 npm `cookies@0.9.1` 的 `gitHead` 指向同一提交。
- `package.json` 依赖 `depd@~2.0.0`、`keygrip@~1.1.0`；发布文件只有 `index.js` 与文档。
- `isRequestEncrypted` 优先读 `req.socket.encrypted`，没有 socket 再回退 `req.connection.encrypted`。
- 本文未安装依赖、运行上游测试或发送 HTTP 请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **HTTP cookie 在服务端是两套头**——读 `Cookie`，写 `Set-Cookie`；库把它们收进一只按请求生存的罐子。
2. **签名是旁路 cookie，不是密文**——`.sig` 让别的库仍能读原文。
3. **过期单位必须对着源码看**——这里的 `maxAge` 是毫秒；浏览器库常用“天”。
4. **安全默认值会挡人**——HttpOnly 默认开，明文通道上的 Secure 会硬失败。

## 应用型自测

1. `cookies.set('x', '1', { maxAge: 86400 })` 大约多久过期？
2. 签名校验 `index` 返回 `-1` 时，`get` 会不会抛错？
3. `sameSite: true` 写进头时是 `lax`、`none` 还是 `strict`？

检查点：

1. 约 86.4 秒后过期，因为 `maxAge` 按毫秒加到 `Date.now()`。
2. 不会抛错；返回 `undefined`，并过期 `x.sig`。
3. `true` 映射成 `strict`。

## 延伸阅读

- 文档：[pillarjs/cookies README](https://github.com/pillarjs/cookies#readme)
- 固定源码：[pillarjs/cookies](https://github.com/pillarjs/cookies) —— 本文绑定提交 `b58c7207bb80a900f8db527bc847b4e0a8d49009`
- [[js-cookie]] —— 浏览器 `document.cookie` 对照，数字 expires 按天
- Keygrip：[npm keygrip](https://www.npmjs.com/package/keygrip) —— 本页未绑定其 revision

## 关联

- [[js-cookie]] —— 同一对 cookie helper 的浏览器对照
- [[express]] —— `Cookies.express` 把罐子挂到 `req` / `res`
- [[koa]] —— README 用 `app.proxy` 解释反向代理后的 `secure`
- [[lucia]] —— 自己规定 cookie 属性，不依赖本库
- [[better-auth]] —— 框架级写 cookie，边界不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
