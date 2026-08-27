---
title: "@vercel/edge — 把中间件指令收成 next / rewrite 的兼容再导出层"
description: 介绍 @vercel/edge 1.3.1 如何再导出 @vercel/functions 的 geolocation、ipAddress、next 与 rewrite，并披露 npm 1.3.3 无匹配源码 tag。
来源: https://github.com/vercel/vercel
日期: 2026-08-27
分类: 基础设施
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vercel/vercel
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8a127cee8a0ae16f4cbe0c4b596cdffe089bdd84
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.3.1
---

## 是什么

`@vercel/edge` 是 Vercel monorepo 里给 Edge / Middleware 用的薄工具包。日常类比：前台不再自己开票，只把后厨（`@vercel/functions`）已经做好的单据再递一次。

你写：

```ts
import { geolocation, ipAddress, next, rewrite } from '@vercel/edge';

export default function middleware(request: Request) {
  const ip = ipAddress(request);
  const { city, country } = geolocation(request);
  if (new URL(request.url).pathname.startsWith('/legacy')) {
    return rewrite(new URL('/current', request.url));
  }
  return next({ headers: { 'x-edge-seen': ip ?? 'unknown' } });
}
```

固定 1.3.1 的 `packages/edge/src/index.ts` 自己只留下 `RequestContext` 类型，其余符号全部从 `@vercel/functions/headers` 和 `@vercel/functions/middleware` 再导出。README 写明本包已统一到 `@vercel/functions`。

## 为什么重要

不理解“本包是再导出层、真正读头和写中间件头的代码在隔壁包”，就解释不了下面几件事：

- 为什么安装 `@vercel/edge` 后，文档却叫你改用 `@vercel/functions`
- 为什么 `next()` 看起来像“放行”，实际是返回带 `x-middleware-next` 的 `Response`
- 为什么 `geolocation(request).region` 不是国家行政区，而是从 `x-vercel-id` 切出来的边缘节点
- 为什么 npm 上的 `1.3.3` 不能直接当成源码 tag

## 核心要点

固定 1.3.1 的主链可以拆成五步：

1. **入口只做再导出**：`src/index.ts` 从 `@vercel/functions/headers` 拿出 `ipAddress`、`geolocation` 和一组 `x-vercel-ip-*` 常量，从 `@vercel/functions/middleware` 拿出 `next` / `rewrite`。本包源码不再实现这些函数。

2. **IP 只认一个头**：同提交的 `ipAddress` 读 `x-real-ip`。传入对象有 `headers` 就用它，否则把入参当成 `Headers`。

3. **地理信息是读头，不是查库**：`geolocation` 组装 `city` / `country` / `flag` / `countryRegion` / `region` / `latitude` / `longitude` / `postalCode`。城市值会 `decodeURIComponent`；国旗由两位大写国家码加上 `127397` 拼 emoji。`region` 取 `x-vercel-id` 冒号前第一段，请求 ID 缺失时写死 `dev1`。

4. **next / rewrite 是指令 Response**：`rewrite(destination)` 设置 `x-middleware-rewrite`；`next()` 设置 `x-middleware-next` 为 `"1"`。两者都返回 `new Response(null, { ...init, headers })`，不是自己去 fetch 上游。

5. **改上游请求头要整份 `Headers`**：`init.request.headers` 必须是 `Headers` 实例，否则抛错。实现会写成 `x-middleware-request-<name>`，再用逗号拼进 `x-middleware-override-headers`。

本包另外导出的 `RequestContext` 只有 `waitUntil(promise)`。它不是 `@vercel/functions` 里那个独立函数 `waitUntil`。

## 实践示例

### 案例 1：按路径 rewrite，其余 next

```ts
import { next, rewrite } from '@vercel/edge';

export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === '/old') {
    return rewrite(new URL('/new', request.url));
  }
  return next();
}
```

固定测试期望：`rewrite` 的响应状态 200，头里有 `x-middleware-rewrite`；`next` 的头里有 `x-middleware-next: 1`。本轮只读了测试，没有跑。

### 案例 2：给下游请求补头

```ts
import { next } from '@vercel/edge';

export default function middleware(request: Request) {
  const headers = new Headers(request.headers);
  headers.set('x-from-middleware', '1');
  return next({
    headers: { 'x-visible-to-client': 'yes' },
    request: { headers },
  });
}
```

客户端看得到 `x-visible-to-client`；给源站的覆盖头走 `x-middleware-request-x-from-middleware` 和 `x-middleware-override-headers`。普通对象当 `request.headers` 会抛 `request.headers must be an instance of Headers`。

### 案例 3：读代理写好的地理头

```ts
import { geolocation, ipAddress, next } from '@vercel/edge';

export default function middleware(request: Request) {
  const ip = ipAddress(request);
  const geo = geolocation(request);
  return next({ headers: { 'x-city': geo.city ?? '', 'x-ip': ip ?? '' } });
}
```

`city` 可能是百分号编码后的多字节城市名。`geo.region` 是边缘节点（如 `iad1`），行政区在 `countryRegion`。

## 踩过的坑

1. **把本包当成仍在独立演进的实现**：1.2.0 起方法已迁到 `@vercel/functions`；1.2.2 changelog 写明不再为“Edge 专用包”找理由。新代码应直接看 `@vercel/functions`。

2. **把 `next()` 理解成调用下一层函数**：它只是一枚带约定头的 `Response`。平台看到 `x-middleware-next` 才继续。

3. **把 `geo.region` 当成州/省**：那是 `x-vercel-id` 的第一段；州/省在 `countryRegion`（`x-vercel-ip-country-region`）。

4. **把 npm `1.3.3` 当成源码 tag**：canonical remote 最新可达 tag 是 `@vercel/edge@1.3.1`。`1.3.2` / `1.3.3` 无 tag、无 `gitHead`，`main` 上 package 版本仍是 `1.3.1`。本页不猜测那两次发布。

5. **把 README 的“任意框架上 Edge”写成已测结论**：本轮未部署、未跑上游测试、未测 bundle。

## 适用 vs 不适用场景

**适用**：

- 已有 `@vercel/edge` import，需要对照 `next` / `rewrite` / 地理头的固定合同
- 要把旧中间件迁到 `@vercel/functions`，先确认再导出清单没少符号

**不适用**：

- 新项目直接写 Vercel 运行时能力——应看 `@vercel/functions`，不要新开这个兼容包
- 需要 Netlify 那种 `context.next()` / 返回 `URL` 的平台上下文——看 [[netlify-edge-functions]]
- 需要多运行时 Web 框架，而不是平台中间件头——看 [[hono]]
- 需要完整的 React 全栈约定——看 [[next-js]]

## 固定版本边界

- 本文绑定 `vercel/vercel@8a127cee8a0ae16f4cbe0c4b596cdffe089bdd84`，源码 tag `@vercel/edge@1.3.1`，`packages/edge/package.json` 版本为 `1.3.1`。
- npm latest `@vercel/edge@1.3.3` 无 `gitHead`，也没有对应 Git tag；本页不绑定它。
- `geolocation` / `ipAddress` / `next` / `rewrite` 的实现位于同提交 `packages/functions`；本包用 tsup 把它们打进自己的 CJS/ESM 产物。
- 本文未安装依赖、运行上游测试或部署 Edge Function，状态保持 `UNVERIFIED`。

## 学到什么

1. **兼容包可以只剩再导出**——读 `@vercel/edge` 要同时打开 `@vercel/functions`。
2. **中间件“放行/改写”是约定头，不是库内转发**——`x-middleware-next` 与 `x-middleware-rewrite` 才是合同。
3. **地理字段来自代理头**——缺 `x-vercel-id` 时 `region` 会变成开发占位 `dev1`。
4. **npm 最新版不等于可达源码 tag**——没有 tag / `gitHead` 就不能猜 revision。

## 应用型自测

1. `next()` 会不会自己去请求 origin？
2. `geolocation(request).region` 读的是哪个头？请求 ID 缺失时是什么？
3. 把普通对象传给 `next({ request: { headers: { a: '1' } } })` 会怎样？

检查点：

1. 不会。它返回带 `x-middleware-next: 1` 的空 body `Response`。
2. 读 `x-vercel-id` 的第一段；缺失时为 `dev1`。
3. 会抛错：`request.headers` 必须是 `Headers` 实例。

## 延伸阅读

- 文档：[Vercel Edge package](https://vercel.com/docs/concepts/functions/edge-functions/vercel-edge-package)
- 后继包：[@vercel/functions](https://www.npmjs.com/package/@vercel/functions)
- 固定源码：[vercel/vercel](https://github.com/vercel/vercel) —— 本文绑定提交 `8a127cee8a0ae16f4cbe0c4b596cdffe089bdd84`
- [[netlify-edge-functions]] —— 对照：类型合同 + 返回 `URL`，而不是中间件约定头
- [[next-js]] —— 常见宿主框架

## 关联

- [[netlify-edge-functions]] —— 另一家边缘函数的类型/上下文合同
- [[next-js]] —— Middleware 常见宿主
- [[hono]] —— 多运行时 `app.fetch`，不靠 Vercel 约定头
- [[vercel-ai]] —— 同一 vendor 的另一条 SDK 线
- [[sveltekit]] —— 用 adapter 对接部署目标，而不是这个兼容包

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
