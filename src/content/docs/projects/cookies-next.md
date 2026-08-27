---
title: cookies-next — 按 options 形状分发的 Next.js cookie 助手
description: 介绍 cookies-next 6.1.1 如何用 client/server 分入口、cookie@1 序列化，以及 Next cookies() 与普通 HTTP 两条写入路径。
来源: https://github.com/andreizanik/cookies-next
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/andreizanik/cookies-next
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c390d3599e29494753a7457f0414595872fe18f1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.1.1
---

## 是什么

cookies-next 是给 Next.js 用的 cookie 读写库。日常类比：酒店前台同一套话术，你没递登记单就去开房间门上的锁（`document.cookie`）；递了 `req` / `res` 或 `cookies()` 才改前台那本登记簿。

你写：

```js
import { getCookie, setCookie } from 'cookies-next/server';
import { cookies } from 'next/headers';

await setCookie('theme', 'dark', { cookies });
const theme = await getCookie('theme', { cookies });
```

固定 6.1.1 把入口拆成 `cookies-next/client`、`cookies-next/server` 和根入口。运行时只依赖 `cookie@^1.0.1`，peer 要求 `next >= 15`。

## 为什么重要

不理解它“按 options 形状分发，而不是按 `window` 分发”，就解释不了下面几件事：

- 为什么 Server Component 里从根入口裸调 `getCookie('x')` 会被当成客户端
- 为什么 App Router 要传 `{ cookies }` 或带 `.cookies.getAll/set` 的 `req`/`res`
- 为什么 `setCookie('user', { id: 1 })` 读回来是字符串，不是对象
- 为什么普通 Node HTTP 路径只传 `res`、不传 `req` 时可能什么都不写

## 核心要点

固定 6.1.1 的主链可以拆成五步：

1. **三个入口**：`exports` 暴露 `.`、`./client`、`./server`。根入口用 `isClientSide(options)` 分发：没有 `req`、`res`，也没有 `cookies` 函数，就走客户端实现。

2. **客户端写 `document.cookie`**：`cookie.serialize` 默认补 `path: '/'`。`getRenderPhase()` 看 `typeof window`；服务端渲染阶段的客户端函数直接返回，避免 hydration 对不上。

3. **服务端认两套柜子**：若 `req.cookies` / `res.cookies` 同时有 `getAll` 与 `set`，或 options 上有 `cookies()`，就当 Next App Router；否则读 `req.cookies` 或 `req.headers.cookie`（`cookie.parse`）。

4. **普通 HTTP 写入要成对**：非 Next 路径里，`setCookie` 只有同时拿到 `req` 和 `res` 才会 `Set-Cookie` 并回写本次请求的 `req.cookies` / `Cookie` 头。只传其中一个会静默不写。

5. **值合同不对称**：`stringify` 对非字符串做 `JSON.stringify`；`getCookie` 只做 percent-decode，不 `JSON.parse`。`deleteCookie` 是空值加 `maxAge: -1`。

## 实践示例

### 案例 1：App Router 必须把 `cookies` 递进去

```js
import { getCookie, setCookie } from 'cookies-next/server';
import { cookies } from 'next/headers';

export async function saveTheme() {
  await setCookie('theme', 'dark', { cookies });
}

export async function readTheme() {
  return await getCookie('theme', { cookies });
}
```

`isContextFromNext` 认的是 `typeof options.cookies === 'function'`。Server Action 里可以写；README 写明 Server Component 里 `cookies().set` 这条路走不通，那是 Next 的限制，不是本库另做了一套写入。

### 案例 2：客户端静态 hook 先交白卷

```js
'use client';
import { useGetCookie, useSetCookie } from 'cookies-next/client';

export function ThemeToggle() {
  const getCookie = useGetCookie();
  const setCookie = useSetCookie();
  return (
    <button onClick={() => setCookie('theme', 'dark')}>
      {String(getCookie('theme'))}
    </button>
  );
}
```

`useWrappedCookieFn` 在 `useEffect` 把 `isMounted` 翻成 true 之前，返回空函数。首屏渲染不会读 `document.cookie`，这是为了躲 hydration mismatch，不是“hook 自己会订阅 cookie 变化”。

### 案例 3：对象值写进去，读出来仍是 JSON 文本

```js
setCookie('user', { id: 1, name: 'Ada' });
const raw = getCookie('user');
// raw === '{"id":1,"name":"Ada"}'
JSON.parse(raw);
```

仓库自带的 client 测试也是先判断 `typeof retrievedValue === 'string'` 再 `JSON.parse`。不要把 `stringify` 理解成往返编解码。

## 踩过的坑

1. **根入口在服务端裸调用**：没传 `req`/`res`/`cookies` 时 `isClientSide` 为 true，服务端实现根本不会跑。请显式 `cookies-next/server` 并传入上下文。

2. **把 `setCookie` 的对象值当成往返 JSON**：写入会 `JSON.stringify`，读取不会 parse。调用方要自己还原。

3. **普通 HTTP 只给 `res`**：Next duck-type 可以只改 `res.cookies`；Express 风格的 `ServerResponse` 走 `if (res && req)`，缺 `req` 就既不写头，也不改内存里的 cookie 表。

4. **把静态 hook 当成响应式**：`useGetCookie` 只是包了一层 mount 开关。要跟外部写入同步，得用 `CookiesNextProvider` 和 reactive hooks；轮询默认 `enabled: false`，间隔默认 1000ms。

5. **把 README 的 4.3.0 线当成本页合同**：文档写 Next 12.2–14 应装 `cookies-next@4.3.0`。本页只绑定 6.1.1 / Next 15 peer，未阅读 4.x 源码。

## 适用 vs 不适用场景

**适用**：

- Next.js 15 App Router，需要同一套 `get/set/delete/has` 覆盖 Client Component、Server Action、Route Handler 和 middleware
- 能接受“对象值只在写入时序列化”，读取仍是字符串
- 想用静态 hook 避开首屏读 cookie，或显式加 Provider 做客户端状态镜像

**不适用**：

- 还在 Pages Router / 自定义 Express，只想传 `ctx`——应对 [[nookies]]
- 需要 cookie jar、RFC 口径的过期与 domain 匹配——这不是 jar
- 不能升到 Next 15，却想用 6.1.1 的 `/server` 与 `cookies()` 合同
- 要把 `getCookie` 的返回值直接当对象用

## 固定版本边界

- 本文绑定 `andreizanik/cookies-next@c390d3599e29494753a7457f0414595872fe18f1`。annotated tag `v6.1.1` 剥皮到此提交，npm `cookies-next@6.1.1` 的 `gitHead` 一致。
- `package.json` 依赖 `cookie@^1.0.1`；peer 为 `next>=15.0.0`、`react>=16.8.0`。LICENSE 为 MIT。
- 服务端函数全部 `async`；客户端函数同步，但 SSR 阶段 `getRenderPhase() === 'server'` 时读/写直接返回。
- 本文未安装依赖、运行上游测试、启动 Next 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **分发键是 options 形状**——有没有 `cookies` 函数，比“这段代码在服务端还是浏览器”更先被判断。
2. **Next cookie store 和 Node 头写入是两条路**——duck-type 走 `getAll`/`set`；普通 HTTP 要 `req`+`res` 成对。
3. **序列化不是往返**——`stringify` 与 `decode` 不对偶，对象值要调用方 parse。
4. **React 封装分两档**——静态 hook 只管 hydration；reactive 才有自己的 state 和可选轮询。

## 应用型自测

1. 在 Server Component 里 `import { getCookie } from 'cookies-next'` 后调用 `getCookie('theme')`，不传 options，会走 server 实现吗？
2. `setCookie('user', { id: 1 })` 之后 `getCookie('user')` 的类型和值是什么？
3. 给 Express 风格的 `res` 单独调用 `setCookie('a', 'b', { res })`，不传 `req`，会写 `Set-Cookie` 吗？

检查点：

1. 不会。`isClientSide` 在缺少 `req`/`res`/`cookies` 时为 true，根入口会去客户端实现。
2. 是字符串 `'{"id":1}'`（再经 percent-decode），不是对象。
3. 不会。非 Next 路径要求 `res && req` 同时存在。

## 延伸阅读

- 文档：[github.com/andreizanik/cookies-next](https://github.com/andreizanik/cookies-next)
- 固定源码：[andreizanik/cookies-next](https://github.com/andreizanik/cookies-next) —— 本文绑定提交 `c390d3599e29494753a7457f0414595872fe18f1`
- [[nookies]] —— Pages Router / Express `ctx` 合同的对照组
- [[next-js]] —— `cookies()`、Server Action 与 middleware 的宿主边界

## 关联

- [[nookies]] —— 不认 `next/headers`，认 `req.headers.cookie` 与 `res.setHeader`
- [[next-js]] —— App Router cookie API 是本库 duck-type 的目标
- [[auth-js]] —— 认证框架自己管会话 cookie，不靠这层助手
- [[lucia]] —— 会话 token 配方；发 cookie 仍是调用方的事
- [[express]] —— 普通 HTTP 路径要同时给 `req` 和 `res`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
