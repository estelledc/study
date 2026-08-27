# Edge-platform source review (writer IS)

> 用途：记录 `@vercel/edge`、`@netlify/edge-functions` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer IS
- evidence：GitHub tag/commit metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、edge 部署或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git；`vercel/vercel` 与 `netlify/primitives` 均用 blob-filter + sparse checkout
- excluded slugs：intern 车道 HM–ID；开放 PR 中的 `edge-runtime`、`workerd`、`wrangler`、`miniflare`；本轮不使用 `marked`、`markdown-it`、`knex`、`ioredis`、`redis`、`BullMQ`

## @vercel/edge

- canonical source：`https://github.com/vercel/vercel`
- package directory：`packages/edge`
- revision：`8a127cee8a0ae16f4cbe0c4b596cdffe089bdd84`
- package：源码仓 `@vercel/edge@1.3.1`（tag `@vercel/edge@1.3.1`）
- inspected：
  - `packages/edge/package.json`
  - `packages/edge/README.md`
  - `packages/edge/CHANGELOG.md`
  - `packages/edge/src/index.ts`
  - `packages/edge/src/request.ts`
  - `packages/edge/src/published-types.d.ts`
  - `packages/edge/test/middleware-helpers.test.ts`
  - `packages/edge/test/imports.test.ts`
  - 同提交 `packages/functions/src/headers.ts`
  - 同提交 `packages/functions/src/middleware.ts`
- observed：
  - 本包源码只保留 `RequestContext.waitUntil` 类型，以及从 `@vercel/functions/headers` / `@vercel/functions/middleware` 再导出的符号；
  - README 写明已统一到 `@vercel/functions`；
  - `tsup` 打 CJS + ESM，`dts.resolve` 把再导出类型打进本包；
  - ESM/CJS 导出清单为 header 常量、`geolocation`、`ipAddress`、`next`、`rewrite`；
  - 同提交的 `ipAddress` 读 `x-real-ip`；`geolocation` 读 `x-vercel-ip-*`，城市值 `decodeURIComponent`，`region` 取 `x-vercel-id` 的第一段，缺省为 `dev1`；
  - `rewrite` 写 `x-middleware-rewrite`；`next` 写 `x-middleware-next=1`；`request.headers` 必须是 `Headers`，并展开为 `x-middleware-request-*` + `x-middleware-override-headers`。
- provenance split：
  - npm latest `@vercel/edge@1.3.3`（2026-08-11）无 `gitHead`，canonical remote 也没有 `@vercel/edge@1.3.2` / `@vercel/edge@1.3.3` tag；
  - `main` 上 `packages/edge/package.json` 仍是 `1.3.1`；
  - 本审查绑定内部一致且可达的源码 tag `@vercel/edge@1.3.1`，不猜测 1.3.3 发布树。

## @netlify/edge-functions

- canonical source：`https://github.com/netlify/primitives`
- package directory：`packages/edge-functions/prod`
- revision：`11913fe6c0613267be193ae7b17a24cf14acd50e`
- package：`@netlify/edge-functions@4.0.0`
- tag：`edge-functions-v4.0.0`（与 npm `gitHead` 同一提交）
- inspected：
  - `packages/edge-functions/prod/package.json`
  - `packages/edge-functions/prod/src/main.ts`
  - `packages/edge-functions/prod/src/main.test.ts`
  - `packages/edge-functions/prod/src/lib/config.ts`
  - `packages/edge-functions/prod/src/lib/edge-function.ts`
  - `packages/edge-functions/prod/CHANGELOG.md`
  - 同提交依赖 `@netlify/types@3.0.0`：`packages/types/src/main.ts`、`lib/context/context.ts`、`lib/context/geo.ts`、`lib/context/cookies.ts`、`lib/globals.ts`
- observed：
  - 生产包 `type: module`，`engines.node >= 22.12.0`，依赖 `@netlify/types@3.0.0`；
  - `main.ts` 只做类型再导出，并声明全局 `var Netlify: NetlifyGlobal`；
  - 单元测试断言 `Object.keys(main)` 为空——没有运行时值可 import；
  - `EdgeFunction` 签名是 `(request, context) => Response | URL | Promise<...> | undefined | Promise<void>`；
  - `Config` 覆盖 `path` / `pattern` / `excludedPath` / `method` / `cache` / `onError` / `rateLimit` / `header`；
  - `Context` 本体在 `@netlify/types`：`geo`、`ip`、`cookies`、`next()`、已弃用的 `rewrite()`、`waitUntil`、`json()`；
  - `Geo.latitude` / `longitude` 类型是 `number`，国家是 `{ code, name }`，与 Vercel header helper 的字符串字段不同。
- provenance：
  - tag `edge-functions-v4.0.0`、package `4.0.0` 与 npm `gitHead` 同为 `11913fe6...`；
  - 4.0.0 的 breaking change 是 Node `>=22.12.0`，并把 `@netlify/types` 从 2.8.0 升到 3.0.0；
  - 未打开 `packages/edge-functions/dev` 运行时实现，也未部署 Netlify Edge Function。
