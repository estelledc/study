---
title: tough-cookie — 按 RFC6265 存取的 Node CookieJar
description: 介绍 tough-cookie 6.0.2 如何用 CookieJar、host-only 与 path/domain 匹配实现 RFC6265 存取，并划清 SameSite 默认不强制的边界。
来源: https://github.com/salesforce/tough-cookie
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/salesforce/tough-cookie
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 40708dd809cfb1dd658270dc85597bf9f68a6ccc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.0.2
---

## 是什么

tough-cookie 是 Node 上的 RFC6265 Cookie 实现：既能解析 `Set-Cookie`，也能按请求 URL 决定哪些 cookie 该带出去。日常类比：仓库管理员不只抄标签，还按货架分区（domain / path）和进出规则（Secure / HttpOnly / 前缀）决定能不能入库、出库。

你写：

```js
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
await jar.setCookie(
  'sid=abc; Domain=example.com; Path=/; Secure; HttpOnly',
  'https://example.com/login'
);
const header = await jar.getCookieString('https://example.com/account');
```

`setCookie` 把一条 cookie 按当前 URL 存进 jar；`getCookieString` 再按同一套匹配规则拼出 `Cookie` 头。固定 6.0.2 默认用内存 `MemoryCookieStore`，也可用自定义 `Store`。

## 为什么重要

不理解 jar 的匹配合同，就解释不了下面几件事：

- 为什么没写 `Domain` 的 cookie 只对当前主机有效
- 为什么 `https://example.com` 存下的 `Secure` cookie，不会在 `http://example.com` 被取走
- 为什么不传 `sameSiteContext` 时，`SameSite=Strict` 仍可能被读出
- 为什么 `Cookie.parse('a=1; b=2')` 不会得到两颗 cookie

## 核心要点

固定 6.0.2 的主链可以拆成五步：

1. **解析成 `Cookie`**：`Cookie.parse` 先取第一个 `;` 前的 name=value，再循环后面的属性。后写覆盖先写。`Max-Age` 必须是可选负号加纯数字；`SameSite` 只接受 `strict` / `lax` / `none`。

2. **按 RFC 5.3 入库**：`CookieJar.setCookie` 会拒绝公共后缀（默认开）、检查 `domainMatch`、没有 `Domain` 就把 `hostOnly` 设为 true 并把 domain 写成当前主机、路径不以 `/` 开头则改用 `defaultPath`。

3. **再套一层本地策略**：默认 `http: true`。非 HTTP API 不能写或覆盖 `HttpOnly`。`__Secure-` 必须带 `Secure`；`__Host-` 还必须 `hostOnly` 且 `Path=/`。前缀违约在默认 `prefixSecurity: 'silent'` 下会被丢掉，不抛错。

4. **按 URL 取出**：`getCookies` 过滤 host-only 精确匹配或 suffix `domainMatch`、`pathMatch`、潜在可信源上的 `Secure`、HTTP API 上的 `HttpOnly`，以及可选 SameSite 等级。过期项默认删掉。

5. **排序后变成请求头**：更长 path 在前，同样长度看更早 `creation`，再看 `creationIndex`。`getCookieString` 用 `key=value` 以 `'; '` 连接。

## 实践示例

### 案例 1：没有 Domain 就是 host-only

```js
const jar = new CookieJar();
await jar.setCookie('id=1; Path=/', 'https://app.example.com/');
await jar.getCookieString('https://app.example.com/'); // id=1
await jar.getCookieString('https://other.example.com/'); // 空
```

源码在缺少 `Domain` 时写 `cookie.hostOnly = true` 且 `cookie.domain =` 规范化后的当前主机。之后只接受主机完全相同，不再做后缀匹配。

### 案例 2：Secure 看的是“潜在可信源”，不是字符串等于 https

```js
const jar = new CookieJar(); // allowSecureOnLocal 默认 true
await jar.setCookie('sid=x; Secure', 'http://localhost/');
await jar.getCookieString('http://localhost/'); // sid=x
```

`isPotentiallyTrustworthy` 把 `https` / `wss`、回环地址和 `localhost` / `*.localhost` 当成可信。把 `allowSecureOnLocal` 设为 false 后，未加密的 localhost 不再存取 `Secure` cookie。

### 案例 3：SameSite 默认不执法

```js
await jar.setCookie('csrf=1; SameSite=Strict', 'https://example.com/');
await jar.getCookies('https://evil.test/', { sameSiteContext: 'none' });
```

只有调用方传入 `sameSiteContext` 时，jar 才按 `none < lax < strict` 过滤。不传这个选项，注释写明 SameSite **不会**被强制。

## 踩过的坑

1. **把 jar 当成浏览器默认行为**：`sameSiteContext` 默认 `undefined`，跨站请求仍可能拿到 `SameSite=Strict` 的 cookie。要防 CSRF，必须自己传入上下文。

2. **直接 `Cookie.parse` 一整条 Cookie 请求头**：`a=1; b=2` 会被当成一颗名为 `a`、带 extension `b=2` 的 cookie。请求头要先按 `;` 拆开。

3. **以为 `silent` 前缀检查会报错**：默认只是丢掉不合格的 `__Secure-` / `__Host-` cookie。要失败可见，需改 `prefixSecurity: 'strict'`。

4. **把 `http://127.0.0.1` 和普通 http 站点混为一谈**：默认 `allowSecureOnLocal: true` 让回环与 localhost 能存 `Secure` cookie；公网 `http://` 不行。

5. **同步 API 用在异步 Store 上**：`setCookieSync` / `getCookiesSync` 要求 `store.synchronous`。默认内存店可以，自定义异步店必须走 Promise / callback。

## 适用 vs 不适用场景

**适用**：

- Node HTTP 客户端要在多次请求间复用登录态，例如给 [[axios]] / [[got]] / [[ky]] 配 jar
- 需要公共后缀拒绝、host-only、路径匹配和 cookie 前缀这些 RFC 规则
- 想把 jar 序列化到文件或自己的 `Store`

**不适用**：

- 浏览器或 SSR 里只想读写 `document.cookie` / `Cookie` 头字符串——看 [[universal-cookie]]
- 需要框架自己签发会话 cookie——看 [[better-auth]] / [[lucia]]，不要只靠 jar 冒充会话层
- 不能接受“SameSite 默认不强制”或 `engines.node >= 16`
- 本轮未安装依赖、未跑上游测试，也未测体积

## 固定版本边界

- 本文绑定 `salesforce/tough-cookie@40708dd809cfb1dd658270dc85597bf9f68a6ccc`，tag `v6.0.2`，`lib/version.ts` 与 npm `gitHead` 同为此提交。
- 发布物由 `tsup lib/cookie/index.ts` 打出 ESM / CJS；运行时依赖是 `tldts`。
- 默认选项：`rejectPublicSuffixes=true`、`looseMode=false`、`allowSpecialUseDomain=true`、`allowSecureOnLocal=true`、`prefixSecurity='silent'`。
- `Cookie.TTL` / `expiryTime` 在同时存在时让 `Max-Age` 优先于 `Expires`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **jar 的单位是“对某个 URL 可发送的集合”**——不是一张全局 name→value 表。
2. **缺 Domain 比写错 Domain 更“窄”**——host-only 只认当前主机。
3. **安全属性要调用方配合**——Secure 看可信源，SameSite 看你传的 context，前缀默认只静默丢弃。
4. **解析 Cookie 头和 Set-Cookie 头不是同一条路**——前者要先拆分。

## 应用型自测

1. `new CookieJar()` 之后不传 `sameSiteContext` 去 `getCookies`，会不会自动丢掉 `SameSite=Strict` 的 cookie？
2. `setCookie('a=1', 'https://app.example.com/')` 之后，`https://other.example.com/` 能否读到 `a`？
3. 默认配置下，`setCookie('__Secure-x=1', 'https://example.com/')`（没有 `Secure`）会抛错还是静默失败？

检查点：

1. 不会。`sameSiteContext` 默认不执法。
2. 不能。没有 `Domain` 时 `hostOnly` 为 true，只匹配当前主机。
3. 静默失败。默认 `prefixSecurity` 是 `silent`。

## 延伸阅读

- 固定源码：[salesforce/tough-cookie](https://github.com/salesforce/tough-cookie) —— 本文绑定提交 `40708dd809cfb1dd658270dc85597bf9f68a6ccc`
- RFC 6265：[HTTP State Management Mechanism](https://www.rfc-editor.org/rfc/rfc6265.html)
- 仓库 API 文档：`api/docs/tough-cookie.md`
- [[universal-cookie]] —— 同主题但只做字符串读写，不做 jar 匹配
- [[got]] —— Node HTTP 客户端里常见的 jar 消费方

## 关联

- [[universal-cookie]] —— 浏览器 / SSR 字符串层对照
- [[axios]] / [[got]] / [[ky]] —— 需要 cookie jar 才能跨请求保持登录态
- [[ofetch]] —— 另一类 Fetch 包装，本身不内建 jar
- [[express]] —— 服务端更常直接写 `Set-Cookie`，不经过 Node jar
- [[better-auth]] —— 会话层，不是 cookie 存储算法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
