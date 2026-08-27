# Fetch implementation source review

> 用途：记录 undici、node-fetch 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BT
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试/文档阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- evidence state：`STATIC_REVIEW` / `UNVERIFIED`

## undici

- canonical source：`https://github.com/nodejs/undici`
- revision：`c8d80e6b2dcfab282557b08f51352937bc9e5692`
- package：`undici@8.10.0`
- engines：`node >=22.19.0`
- provenance：GitHub tag `v8.10.0`、npm `latest` 与 npm `gitHead` 均指向同一提交
- inspected：
  - `package.json`
  - `index.js`
  - `lib/global.js`
  - `lib/dispatcher/dispatcher.js`
  - `lib/dispatcher/agent.js`
  - `lib/dispatcher/pool.js`
  - `lib/dispatcher/client.js`
  - `lib/api/index.js`
  - `lib/api/api-request.js`
  - `lib/handler/retry-handler.js`
  - `lib/web/fetch/index.js`
  - `lib/web/fetch/request.js`
  - `lib/core/connect.js`
  - `types/client.d.ts`
- observed：
  - two public surfaces share one Dispatcher stack: WHATWG `fetch()` and `request` / `stream` / `pipeline` / `connect` / `upgrade`;
  - module load installs a default global `Agent` via `setGlobalDispatcher(new Agent())`;
  - `Agent` factory uses `Client` when `connections === 1`, otherwise `Pool`;
  - `makeDispatcher` defaults method to `PUT` when a body is present and method is omitted — this applies to `request()` family, not `fetch()`;
  - `fetch()` constructs a WHATWG `Request` (default method GET, redirect `follow`) and stops after 20 redirects;
  - Client defaults from source: `headersTimeout`/`bodyTimeout` 300s, `keepAliveTimeout` 4s, `pipelining` 1; connector `timeout` defaults to 10s;
  - retry is opt-in (`RetryHandler` / `RetryAgent` / `interceptors.retry`); defaults are `maxRetries=5`, `minTimeout=500`, `timeoutFactor=2`, `maxTimeout=30s`, methods exclude POST, status codes `500/502/503/504/429`;
  - `install()` copies fetch/Headers/Request/Response/FormData/WebSocket/EventSource onto `globalThis`.

## node-fetch

- canonical source：`https://github.com/node-fetch/node-fetch`
- revision：`8b3320d2a7c07bce4afc6b2bf6c3bbddda85b01f`
- package：`node-fetch@3.3.2`
- engines：`^12.20.0 || ^14.13.1 || >=16.0.0`
- provenance：
  - GitHub tag `v3.3.2` and npm `gitHead` both identify `8b3320d2...`;
  - the checked-in `package.json` still reports `version: 3.1.1`;
  - this review binds the reachable tag/package/`gitHead` triple and discloses the stale in-repo version field.
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/request.js`
  - `src/response.js`
  - `src/body.js`
  - `src/headers.js`
  - `src/utils/is-redirect.js`
  - `docs/v3-LIMITS.md`
  - `docs/ERROR-HANDLING.md`
- observed：
  - ESM-only userland Fetch on Node `http`/`https`, not on undici;
  - supported schemes are `data:`, `http:` and `https:`;
  - URLs with embedded credentials throw; GET/HEAD with a body throw;
  - redirect defaults to `follow` with `follow=20`; 301/302 POST and 303 become GET;
  - a Readable request body cannot be replayed on non-303 redirects;
  - authorization/cookie headers are dropped on cross-domain or cross-protocol redirects;
  - `compress` defaults true and sets `Accept-Encoding: gzip, deflate, br`; `size` 0 means unlimited;
  - default `User-Agent` is `node-fetch`; this revision removes a default `Connection: close`;
  - HTTP error status does not reject; network/abort/size errors use `FetchError` / `AbortError`;
  - no cookie store, no cache, and `res.body` is a Node Readable.
