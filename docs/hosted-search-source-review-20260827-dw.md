# Hosted search source review

> 用途：记录 Algolia JavaScript 客户端、InstantSearch.js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DW
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、未向 Algolia 发送网络请求、未测 bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- hosted engine：Algolia 服务端检索引擎本身不在本审查范围内；可复查对象是官方客户端与 UI 库

## Algolia

- canonical source：`https://github.com/algolia/algoliasearch-client-javascript`
- revision：`899993f9ed19c90495979e4fb5440506752c9581`
- git tag：`5.57.0`
- package：`algoliasearch@5.57.0`（npm `gitHead` 与 tag 同指此提交）
- inspected：
  - `package.json`
  - `README.md`
  - `packages/algoliasearch/package.json`
  - `packages/algoliasearch/builds/browser.ts`
  - `packages/algoliasearch/builds/node.ts`
  - `packages/algoliasearch/lite/src/liteClient.ts`
  - `packages/client-search/src/searchClient.ts`
  - `packages/client-search/builds/browser.ts`
  - `packages/client-search/builds/node.ts`
  - `packages/client-common/src/createAuth.ts`
  - `packages/client-common/src/transporter/createTransporter.ts`
  - `packages/client-common/src/transporter/createStatefulHost.ts`
  - `packages/client-common/src/transporter/responses.ts`
- observed：
  - `algoliasearch()` is a facade over `searchClient` plus lazy `init*` product clients;
  - `liteClient` only exposes search / recommendations helpers, not admin index writes;
  - default hosts are `{appId}-dsn.algolia.net` (read), `{appId}.algolia.net` (write), and shuffled `{appId}-{1,2,3}.algolianet.com` (readWrite);
  - `search()` is POST `/1/indexes/*/queries` with `useReadTransporter` and `cacheable`;
  - retry covers timeout, status `0`, and non-2xx/non-4xx; 4xx is not retryable;
  - a host marked down stays down for two minutes in this client;
  - browser build uses XHR, `WithinQueryParameters` auth, 1s/2s/30s timeouts, and localStorage+memory host cache;
  - Node build uses HTTP requester, header auth by default, 2s/5s/30s timeouts, null request/response caches, and optional gzip;
  - browser entry strips the `compression` option;
  - `requestWithHttpInfo` always hits the network and bypasses both caches.
- provenance：
  - Git tag `5.57.0` and npm `algoliasearch@5.57.0` `gitHead` identify the same reachable revision;
  - package sources are marked OpenAPI-generated; this review binds the generated client, not the hosted engine.

## InstantSearch

- canonical source：`https://github.com/algolia/instantsearch`
- revision：`ec13aefaca895b91160f6309f355801c8bf909b3`
- git tag：`instantsearch.js@4.113.0`（annotated tag object `5048b240...` points to this commit）
- package：`instantsearch.js@4.113.0`（npm `gitHead` 同指此提交）
- same commit also tagged：`react-instantsearch-core@7.46.0`、`vue-instantsearch@4.29.5`、`instantsearch-ui-components@0.37.0`
- inspected：
  - `package.json`
  - `README.md`
  - `packages/instantsearch.js/package.json`
  - `packages/instantsearch.js/src/index.ts`
  - `packages/instantsearch.js/src/lib/InstantSearch.ts`
  - `packages/instantsearch.js/src/lib/utils/defer.ts`
  - `packages/instantsearch.js/src/lib/version.ts`
  - `packages/instantsearch.js/src/widgets/index/index.ts`
  - `packages/react-instantsearch-core/package.json`
- observed：
  - factory `instantsearch(options)` constructs `InstantSearch`; `searchClient.search` is required;
  - peer dependency is `algoliasearch >= 3.1 < 6`; helper is `algoliasearch-helper@3.29.3`;
  - `start()` may run once; it wraps `algoliasearchHelper` and routes to derived-helper search or composition search;
  - `scheduleSearch` coalesces onto a microtask via `defer`;
  - `stalledSearchDelay` defaults to 200ms;
  - `_initialResults` skips the first network search on `start`;
  - no widgets before `start` means no automatic first search;
  - `compositionID` uses the composition API and does not support multi-index search;
  - `insights` default is unset; automatic insights may attach after a result with `_automaticInsights`;
  - `searchFunction` is deprecated in favor of `onStateChange`;
  - `dispose()` sets `started` back to false so a later `start()` is allowed.
- provenance：
  - Git tag `instantsearch.js@4.113.0` and npm `instantsearch.js@4.113.0` identify the same reachable revision;
  - React / Vue packages on this commit are recorded for identity only; this note reviews InstantSearch.js.
