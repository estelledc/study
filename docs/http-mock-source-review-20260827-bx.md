# HTTP mock source review BX

> 用途：记录 MSW、nock 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer BX
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与类型阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target vs fallback：首选 `msw` + `nock`。`nock` 不在开放 PR slug 中，但仓库原先没有该项目页。新建时必须同时给出英文 `difficulty` / `description` 并保持 classified，否则会抬高 atlas unknown-difficulty / empty-description / unclassified 预算。因此本轮新建完整 `study-v2` 页，而不是改走其他主题。
- forbidden overlap：未修改 jest、vitest、playwright、storybook、testing-library、axios、ofetch 或其他开放 PR slug。

## MSW

- canonical source：`https://github.com/mswjs/msw`
- revision：`49d9d47f613b072f8d20e1a025feaee7c5382b2b`
- release tag / package：`v2.15.0` / `msw@2.15.0`
- inspected：
  - `package.json`
  - `src/core/http.ts`
  - `src/core/HttpResponse.ts`
  - `src/core/utils/handleRequest.ts`
  - `src/core/utils/executeHandlers.ts`
  - `src/core/utils/matching/matchRequestUrl.ts`
  - `src/core/utils/request/onUnhandledRequest.ts`
  - `src/node/setup-server.ts`
  - `src/node/setup-server-common.ts`
  - `src/browser/setup-worker.ts`
- observed：
  - package exports split `.` / `./browser` / `./node` / `./native`; `./browser` is `node: null`, `./node` is `browser: null`;
  - Node `setupServer` installs `@mswjs/interceptors` ClientRequest, XMLHttpRequest, Fetch and WebSocket interceptors through `defineNetwork` + `InterceptorSource`;
  - browser `setupWorker` refuses Node via `isNodeProcess()`, then chooses `ServiceWorkerSource` or `FallbackHttpSource` and still adds a WebSocket interceptor;
  - `handleRequest` skips `accept: msw/passthrough`, runs `executeHandlers`, then applies `onUnhandledRequest` (default `'warn'`) or cookie jar + mocked response;
  - `executeHandlers` walks handlers in order and stops at the first result that includes a `response`; a match without response can fall through;
  - URL matching uses `path-to-regexp` after `coercePath` / `normalizePath`;
  - `HttpResponse` extends interceptor `FetchResponse`; `http.get/post/...` construct `HttpHandler`;
  - `listen()` / `start()` default unhandled strategy is `'warn'`; `waitUntilReady` is deprecated;
  - engines field is `node >= 18`; runtime interceptors come from `@mswjs/interceptors ^0.41.3`.
- provenance：
  - GitHub tag `v2.15.0` identifies `49d9d47f613b072f8d20e1a025feaee7c5382b2b`;
  - in-tree `package.json` reports `2.15.0`;
  - npm `msw@2.15.0` has no `gitHead`; this review binds the reachable GitHub tag/commit, not an unpublished npm object.

## nock

- canonical source：`https://github.com/nock/nock`
- revision：`1ee467c68d601ddc22629d7a657061e6c27097c2`
- release tag / package：`v14.0.17` / `nock@14.0.17`
- inspected：
  - `package.json`
  - `index.js`
  - `lib/scope.js`
  - `lib/interceptor.js`
  - `lib/intercept.js`
  - `lib/back.js`
  - `lib/create_response.js`
  - `types/index.d.ts`
- observed：
  - `nock(basePath)` constructs a `Scope`; HTTP verbs return an `Interceptor` that must call `reply` / `replyWithError` before it is registered;
  - import activates nock when `NOCK_OFF !== 'true'`, and `nock.back` default mode is `dryrun`;
  - activation both overrides `http.ClientRequest` and applies `@mswjs/interceptors` `BatchInterceptor` with the Node preset, so `http.request` and Fetch share the Scope table;
  - interceptor `counter` defaults to `1`; `times(n)` / `once` / `twice` / `thrice` change it; `persist()` keeps used interceptors;
  - `reply()` treats a missing status as `200` and JSON-stringifies plain objects; path strings must start with `/` unless wildcard or `filteringScope`;
  - `disableNetConnect()` leaves `allowNetConnect` undefined; unmatched traffic then throws `NetConnectNotAllowedError` with `code = 'ENETUNREACH'`;
  - `enableNetConnect` accepts string (compiled to `RegExp`), `RegExp`, or function;
  - `nock.back` modes are `wild`, `dryrun`, `record`, `update`, `lockdown`; `Back.fixtures` must be set before use;
  - in-tree `package.json` version is `0.0.0-development` (semantic-release); engines are `>=18.20.0 <20 || >=20.12.1`.
- provenance：
  - GitHub tag `v14.0.17` and npm `gitHead` both identify `1ee467c68d601ddc22629d7a657061e6c27097c2`;
  - published npm version is `14.0.17`; the in-tree version field is not the published number.
