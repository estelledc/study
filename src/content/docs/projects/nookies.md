---
title: nookies — 面向 Pages Router 与 Express 的 cookie 助手
description: 介绍 nookies 2.5.2 如何用 cookie.parse / Set-Cookie 数组合并，在 Next.js ctx 与浏览器之间读写 cookie。
来源: https://github.com/maticzav/nookies
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/maticzav/nookies
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f3b87f876ea342fb287ccbb11f44631db4f91462
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.5.2
---

## 是什么

nookies 是一组给 Next.js Pages Router（以及自定义 Express）用的 cookie 助手。日常类比：旧旅馆的纸质房卡匣——你把前台的 `req`/`res` 递过去，它就在登记条上读写；没递匣子，就只碰客人自己口袋里的钥匙（`document.cookie`）。

你写：

```js
import nookies from 'nookies';

export async function getServerSideProps(ctx) {
  const cookies = nookies.get(ctx);
  nookies.set(ctx, 'fromGetServerSideProps', 'value', {
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  return { props: { cookies } };
}
```

固定 2.5.2 的公开函数是 `parseCookies` / `setCookie` / `destroyCookie`。默认导出把它们收成 `{ get, set, destroy }`。

## 为什么重要

不理解它“读请求头、写响应头、两边不自动对账”，就解释不了下面几件事：

- 为什么 `nookies.get(ctx)` 看不到你刚 `nookies.set` 进去的值
- 为什么浏览器里 `setCookie(null, 'sid', 'x', { httpOnly: true })` 会直接抛错
- 为什么 `res.finished` 之后再 set 只会打警告
- 为什么它和 [[cookies-next]] 不是同一代 Next 合同

## 核心要点

固定 2.5.2 的主链可以拆成五步：

1. **读只认 Cookie 头**：`parseCookies(ctx)` 先看 `ctx.req.headers.cookie`，用 `cookie.parse`；没有这根头且 `typeof window !== 'undefined'` 时改读 `document.cookie`；否则返回 `{}`。它不读 `req.cookies`。

2. **写认 `Set-Cookie` 数组**：服务端要求 `ctx.res.getHeader` 与 `ctx.res.setHeader` 都在。先取出已有 `Set-Cookie`，用 `set-cookie-parser`（`decodeValues: false`）拆开，去掉“等价”的旧条，再 `cookie.serialize` 追加新条。

3. **等价比较带 options**：`createCookie` 把 `sameSite: true` 收成 `strict`，`undefined`/`false` 收成 `lax`，并删掉 `encode`。`areCookiesEqual` 比较剩余字段；同名但 path/domain 不同的 cookie 会并存。

4. **浏览器是第二条独立路径**：`isBrowser()` 为 true 时再写 `document.cookie`。options 带 `httpOnly` 会抛 `Can not set a httpOnly cookie in the browser.`

5. **销毁就是改 maxAge**：`destroyCookie` 转发 `setCookie(ctx, name, '', { ...options, maxAge: -1 })`。函数始终 `return {}`。

## 实践示例

### 案例 1：`getServerSideProps` 里用默认导出

```js
import nookies from 'nookies';

export async function getServerSideProps(ctx) {
  const all = nookies.get(ctx);
  nookies.set(ctx, 'role', 'reader', { path: '/', maxAge: 60 * 60 });
  return { props: { hasRole: Boolean(all.role) } };
}
```

`all.role` 看的是**请求带来的** Cookie 头。这次刚 set 的 `role` 不会出现在同一个 `get()` 结果里，除非浏览器下一次再带着新头回来。

### 案例 2：客户端省略 ctx

```js
import { parseCookies, setCookie, destroyCookie } from 'nookies';

function handleClick() {
  setCookie(null, 'fromClient', 'value', { path: '/', maxAge: 60 });
  const cookies = parseCookies();
  destroyCookie(null, 'fromClient', { path: '/' });
  return cookies;
}
```

`ctx` 可以是 `null` / `undefined` / `{}`。没有 `res` 就跳过服务端分支；在浏览器里走 `document.cookie`。`destroyCookie` 也要带上当初写入的 `path`，否则浏览器可能删不掉。

### 案例 3：自定义 Express 把 `req`/`res` 拆开传

```js
const { parseCookies, setCookie } = require('nookies');

server.get('/page', (req, res) => {
  const parsed = parseCookies({ req });
  setCookie({ res }, 'fromServer', 'value', { path: '/page', maxAge: 60 });
  return handle(req, res);
});
```

读只要 `req`，写只要 `res`。这和 [[cookies-next]] 6.1.1 普通 HTTP 路径“必须 `req` 与 `res` 成对”正好相反。

## 踩过的坑

1. **set 完立刻 get，以为能读到新值**：`parseCookies` 不回看本次 `Set-Cookie`，也不维护内存表。同一次请求里要对账，得自己记刚才写入的值。

2. **响应已经 `finished` 还在 set**：源码先警告 `Response has finished` / `You should set cookie before res.send()`，然后 `return {}`。README 也强调服务端写完要自己 `res.send()`。

3. **浏览器里设 `httpOnly`**：直接抛错，不是静默忽略。HttpOnly 只能走服务端 `Set-Cookie`。

4. **把仓库 `package.json` 的 `0.0.0-semantic-release` 当成发布版本**：workspace 包名仍是占位；npm 发布物是 `nookies@2.5.2`。该版本无 `gitHead`，本页绑定源码 tag 提交。

5. **拿它去接 App Router `cookies()`**：本 revision 的类型和实现都围绕 Pages / API / Express 的 `req`/`res`。没有 `next/headers` 入口。

## 适用 vs 不适用场景

**适用**：

- Next.js Pages Router 的 `getServerSideProps` / `getInitialProps` / Pages API
- 自定义 Express 包着 Next，需要把 `{ req }` / `{ res }` 拆开传
- cookie 值本来就是字符串，不需要库帮忙 `JSON.stringify`

**不适用**：

- Next.js 15 App Router，要传 `cookies()` 或 `NextRequest.cookies`——看 [[cookies-next]]
- 需要在同一次请求里“写完立刻读到”
- 要在浏览器写入 HttpOnly
- 需要完整 cookie jar（按 domain/path 匹配、过期淘汰）

## 固定版本边界

- 本文绑定 `maticzav/nookies@f3b87f876ea342fb287ccbb11f44631db4f91462`。lightweight tag `v2.5.2` 直接指向此提交。
- npm `nookies@2.5.2` 无 `gitHead`；源码 `packages/nookies/package.json` 版本仍是 `0.0.0-semantic-release`，依赖 `cookie@^0.4.1` 与 `set-cookie-parser@^2.4.6`。
- 仓库根目录没有 LICENSE 文件；包字段声明 MIT。本 revision 不含 App Router 适配。
- 本文未安装依赖、运行上游测试、启动 Next/Express 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **读头和写头是两本账**——`parseCookies` 看请求，`setCookie` 看响应，库不帮你合并。
2. **Set-Cookie 去重按“等价 options”**——同名不够，path/domain/sameSite 不同就会留下多条。
3. **浏览器合同更窄**——能写 `document.cookie`，但不能冒充 HttpOnly。
4. **默认导出只是别名**——`nookies.get/set/destroy` 与具名函数是同一批实现。

## 应用型自测

1. 在 `getServerSideProps` 里先 `nookies.set(ctx, 'a', '1')`，紧接着 `nookies.get(ctx)`，结果里一定有 `a` 吗？
2. `setCookie(null, 'sid', 'x', { httpOnly: true })` 在浏览器里会怎样？
3. 只把 Express 的 `res` 传给 `setCookie({ res }, ...)`，不传 `req`，服务端能写头吗？

检查点：

1. 不一定。`get` 只 parse 请求头，不读刚写的 `Set-Cookie`。
2. 抛错。浏览器路径拒绝 `httpOnly`。
3. 能。服务端分支只检查 `res.getHeader` / `res.setHeader`。

## 延伸阅读

- 文档：[github.com/maticzav/nookies](https://github.com/maticzav/nookies)
- 固定源码：[maticzav/nookies](https://github.com/maticzav/nookies) —— 本文绑定提交 `f3b87f876ea342fb287ccbb11f44631db4f91462`
- [[cookies-next]] —— App Router / `cookies()` / 分入口的对照组
- [[next-js]] —— Pages Router 的 `ctx.req` / `ctx.res` 是本库的主宿主

## 关联

- [[cookies-next]] —— Next 15 分 client/server；普通 HTTP 写入反而要 `req`+`res`
- [[next-js]] —— Pages 与 App 两套 cookie 宿主
- [[express]] —— 自定义 server 示例把 `{ req }` / `{ res }` 拆开
- [[auth-js]] —— 会话 cookie 的框架层，不替代这组助手
- [[lucia]] —— 不透明 session token；怎么挂到 cookie 仍要自己选助手

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
