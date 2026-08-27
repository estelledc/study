---
title: "@netlify/edge-functions — 只提供类型合同的边缘函数入口包"
description: 介绍 @netlify/edge-functions 4.0.0 如何用类型再导出 EdgeFunction、Config 与 Context，以及返回 URL 与 context.next() 的边界。
来源: https://github.com/netlify/primitives
日期: 2026-08-27
分类: 基础设施
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/netlify/primitives
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 11913fe6c0613267be193ae7b17a24cf14acd50e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.0
---

## 是什么

`@netlify/edge-functions` 是 Netlify primitives monorepo 里给 Edge Function 用的 TypeScript 入口包。日常类比：它发的是工牌和岗位说明书，不发扳手——运行时值要从平台注入的 `context` 和全局 `Netlify` 来。

你写：

```ts
import type { Config, Context, EdgeFunction } from '@netlify/edge-functions';

export default (async (request, context) => {
  if (new URL(request.url).pathname === '/legacy') {
    return new URL('/current', request.url);
  }
  return context.next();
}) satisfies EdgeFunction;

export const config: Config = {
  path: '/*',
  excludedPath: '/assets/*',
};
```

固定 4.0.0 的 `packages/edge-functions/prod/src/main.ts` 只再导出类型，并声明全局 `var Netlify: NetlifyGlobal`。同目录测试断言 `Object.keys(main)` 为空：这个包没有可运行的函数可 import。

## 为什么重要

不理解“这是类型合同，不是运行时 SDK”，就解释不了下面几件事：

- 为什么 `import { something } from '@netlify/edge-functions'` 在运行时拿不到值
- 为什么改写路径要 `return new URL(...)`，而 `context.rewrite` 标了弃用
- 为什么 `context.next()` 是 `Promise<Response>`，和 [[vercel-edge]] 的同步 `next()` 不是一回事
- 为什么 4.0.0 把 Node 下限抬到 `>=22.12.0`

## 核心要点

固定 4.0.0 的主链可以拆成五步：

1. **生产包只出类型**：`main.ts` 导出 `Context` / `Cookie`（来自 `@netlify/types@3.0.0`）、`Config` / `Manifest` 家族，以及 `EdgeFunction`。全局补上 `Netlify.context` 与 `Netlify.env`。

2. **处理函数签名很宽**：`EdgeFunction` 是 `(request: Request, context: Context) => Response | URL | Promise<...> | undefined | Promise<void>`。可以回响应、回 URL、什么都不回。

3. **内联 `Config` 决定何时跑**：`path` / `pattern`、`excludedPath` / `excludedPattern`、`method`、`cache: 'off' | 'manual'`、`onError: 'fail' | 'bypass' | Path`、`header`、`rateLimit`。框架集成再扩 `IntegrationsConfig.name` / `generator`，以及 `manifest.json` 的 `version: 1`。

4. **`Context` 本体在 `@netlify/types`**：同提交能看到 `geo`、`ip`、`cookies`、`params`、`url`、`requestId`、`account`、`deploy`、`site`、`server`、`json()`、`log`、`waitUntil`，以及两个 `next` 重载（可传入新的 `Request`）。`rewrite(url)` 标了 `@deprecated`，文档指向返回 `URL`。

5. **地理结构不是扁平字符串**：`Geo.country` / `subdivision` 是 `{ code, name }`；`latitude` / `longitude` 是 `number`。这和 `@vercel/edge` 读出来的字符串头不同。

4.0.0 changelog 的 breaking change 只有一条：要求 Node.js 22.12 或更新，并把 `@netlify/types` 从 2.8.0 升到 3.0.0。

## 实践示例

### 案例 1：返回 URL 做改写

```ts
import type { EdgeFunction } from '@netlify/edge-functions';

export default (async (request, _context) => {
  const url = new URL(request.url);
  if (url.pathname === '/old') {
    return new URL('/new', url);
  }
  return new Response('ok');
}) satisfies EdgeFunction;
```

签名允许直接返回 `URL`。`context.rewrite` 在类型里仍在，但注释要求改用 `URL` 对象。

### 案例 2：放行到下游，并可换 Request

```ts
import type { Context } from '@netlify/edge-functions';

export default async function handler(request: Request, context: Context) {
  const headers = new Headers(request.headers);
  headers.set('x-from-edge', '1');
  return context.next(new Request(request, { headers }));
}
```

`next()` 返回 `Promise<Response>`，可选 `sendConditionalRequest`。这不是写 `x-middleware-next` 的同步 helper。

### 案例 3：用 Config 收窄触发面

```ts
import type { Config } from '@netlify/edge-functions';

export const config: Config = {
  path: ['/app/*', '/account/*'],
  excludedPath: '/app/static/*',
  method: ['GET', 'HEAD'],
  cache: 'manual',
  onError: 'bypass',
  rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: 'ip' },
};
```

`Path` 类型是 `` `/${string}` ``，必须以 `/` 开头。`onError` 也可以写成另一条路径。`rateLimit` 的 `action` 是 `'rate_limit' | 'rewrite'`。

## 踩过的坑

1. **把这个包当成带 `geolocation()` 函数的 SDK**：生产入口没有运行时导出。地理和 IP 在 `context.geo` / `context.ip`，类型定义在 `@netlify/types`。

2. **照抄 Vercel 的 `next()` / `rewrite()`**：这里 `next` 挂在 `context` 上且异步；改写优先 `return new URL(...)`。

3. **忽略 Node 22.12 下限**：4.0.0 就是为了这条引擎要求升主版本。类型依赖也锁在 `@netlify/types@3.0.0`。

4. **把 `cookies.get` 当成 `string | undefined`**：类型写成 `(key: string) => string`。本轮未观察到缺失键的运行时值，不能写成“一定是空字符串”或“一定会抛”。

5. **把未打开的 `packages/edge-functions/dev` 写成已审实现**：那是另一份开发辅助包，不在本页绑定范围内。

## 适用 vs 不适用场景

**适用**：

- 给 Netlify Edge Function 写 `export default` + `export const config`，需要固定类型
- 对照 Vercel 中间件头模型，看“返回 URL / 调用 context.next”的另一套合同

**不适用**：

- 需要可 import 的 `geolocation` / `ipAddress` 函数——那是 [[vercel-edge]] / `@vercel/functions` 的形状
- 需要一个能在 Workers / Bun / Deno 上直接 `app.fetch` 的框架——看 [[hono]]
- 需要完整站点框架与 adapter——看 [[sveltekit]] 或 [[next-js]]
- 不能接受 Node `>=22.12.0` 的类型包引擎声明

## 固定版本边界

- 本文绑定 `netlify/primitives@11913fe6c0613267be193ae7b17a24cf14acd50e`，tag `edge-functions-v4.0.0`，与 npm `@netlify/edge-functions@4.0.0` 的 `gitHead` 一致。
- 生产目录是 `packages/edge-functions/prod`；`engines.node` 为 `>=22.12.0`。
- `Context` / `Cookie` / `NetlifyGlobal` 的字段定义在同提交 `@netlify/types@3.0.0`。
- 本文未安装依赖、运行上游测试或部署 Edge Function，状态保持 `UNVERIFIED`。

## 学到什么

1. **入口包可以故意不导出运行时值**——类型测试把空 `Object.keys` 写成合同。
2. **改写可以是返回值，不必是 helper**——`URL` 是一等返回类型。
3. **`next` 的归属决定同步还是异步**——这里它属于 `context`。
4. **地理对象的形状跟代理头 helper 不是同一套**——数字经纬度 + `{ code, name }` 国家字段。

## 应用型自测

1. `import { geolocation } from '@netlify/edge-functions'` 在这个版本里有没有运行时函数？
2. 要把 `/old` 改到 `/new`，更符合当前类型注释的写法是 `context.rewrite` 还是 `return new URL(...)`？
3. `context.next()` 的返回类型是 `Response` 还是 `Promise<Response>`？

检查点：

1. 没有。`main.ts` 只导出类型，测试断言模块键为空。
2. 返回 `URL`。`context.rewrite` 已弃用。
3. `Promise<Response>`。

## 延伸阅读

- 文档：[Declare Edge Functions inline](https://docs.netlify.com/edge-functions/declarations/#declare-edge-functions-inline)
- 固定源码：[netlify/primitives](https://github.com/netlify/primitives) —— 本文绑定提交 `11913fe6c0613267be193ae7b17a24cf14acd50e`
- [[vercel-edge]] —— 对照：再导出函数 + 中间件约定头
- [[hono]] —— 对照：多运行时 `fetch` 入口
- [[sveltekit]] —— adapter 部署到 Netlify 的框架层

## 关联

- [[vercel-edge]] —— Vercel 一侧的中间件 helper / 再导出层
- [[hono]] —— 自己管路由，不依赖 Netlify `Config`
- [[sveltekit]] —— 可用 adapter 接到 Netlify
- [[next-js]] —— 另一侧常见全栈宿主
- [[unstorage]] —— 运行时 KV 抽象，不是边缘函数类型包

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
