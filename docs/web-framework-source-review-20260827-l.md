# Web framework source review L

> 用途：记录 Hono、Elysia 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel L
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Hono

- canonical source：`https://github.com/honojs/hono`
- revision：`06880c4a2b04de9dd74217f26dd831209b9c01f1`
- package：`hono@4.13.5`
- inspected：
  - `package.json`
  - `src/hono.ts`
  - `src/hono-base.ts`
  - `src/compose.ts`
  - `src/context.ts`
  - `src/request.ts`
  - `src/router/smart-router/router.ts`
  - `src/router/linear-router/router.ts`
  - `src/preset/tiny.ts`
  - `src/preset/quick.ts`
  - `src/validator/validator.ts`
  - `src/middleware/cors/index.ts`
  - `src/client/index.ts`
  - `src/adapter/`
- observed：
  - default `Hono` installs `SmartRouter` with `RegExpRouter` then `TrieRouter`; the first router that can ingest all routes owns later `match()`;
  - `hono/quick` uses `SmartRouter` of `LinearRouter` then `TrieRouter`; `hono/tiny` uses `PatternRouter`;
  - `fetch` is the app entry; `HEAD` is dispatched as `GET` and then wrapped in an empty-body `Response`;
  - a single matched handler skips `compose`; multiple handlers use koa-style `compose`, and calling `next()` twice throws;
  - core `src/adapter` covers Bun, Deno, Cloudflare, AWS Lambda, Lambda@Edge, Vercel, Netlify and service-worker; Node is not in that tree;
  - CORS `OPTIONS` returns 204 without calling `next()`;
  - `c.req.param()` types required path keys as `string` and unknown/optional keys as `string | undefined`;
  - tag `v4.13.5`, package `4.13.5` and npm `gitHead` all identify the same revision.

## Elysia

- canonical source：`https://github.com/elysiajs/elysia`
- revision：`e037eca710e7ad193be09cc6615ab0dbe54af914`
- package：`elysia@1.4.30`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/compose.ts`
  - `src/context.ts`
  - `src/schema.ts`
  - `src/sucrose.ts`
  - `src/error.ts`
  - `src/type-system/index.ts`
  - `src/adapter/index.ts`
  - `src/adapter/types.ts`
  - `src/adapter/bun/index.ts`
  - `src/adapter/web-standard/index.ts`
  - `src/adapter/cloudflare-worker/index.ts`
- observed：
  - default adapter is `BunAdapter` when `Bun` is defined, otherwise `WebStandardAdapter`;
  - `WebStandardAdapter.listen` throws and tells the caller to export `Elysia.fetch`;
  - `aot` defaults to true unless `ELYSIA_AOT` is the string `false`; AOT uses `composeGeneralHandler`, otherwise `createDynamicHandler`;
  - `t` starts from TypeBox `Type` plus Elysia extensions; validators also accept Standard Schema-like objects;
  - `ValidationError.status` is 422;
  - `sucrose` inspects handler source to infer used context fields; it is not a Bun bundler macro;
  - `.use()` merges another Elysia instance, plugin function, promise, or default export;
  - `.derive()` registers a transform hook, defaulting to local scope;
  - tag `1.4.30`, package `1.4.30` and npm `gitHead` all identify the same revision.
