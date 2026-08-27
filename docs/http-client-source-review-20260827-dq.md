# HTTP client source review

> 用途：记录 Ky、Superagent 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DQ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试/文档阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- evidence state：`STATIC_REVIEW` / `UNVERIFIED`

## Ky

- canonical source：`https://github.com/sindresorhus/ky`
- revision：`0a24c44fe4a15d0545c840facc56e473dd0b315b`
- package：`ky@2.0.2`
- engines：`node >=22`
- provenance：
  - GitHub annotated tag `v2.0.2` 是 `7e50fb813b3b1782c353f4e0b8578842f6b15c80`；
  - peeled commit `v2.0.2^{}` 与 npm `gitHead` 均为 `0a24c44fe4a15d0545c840facc56e473dd0b315b`；
  - 2026-07-17 页曾绑定后代提交 `3419113b48e034fdcf8fa6bd3be3da7b3d0d758f`，其 `package.json` 仍报 `2.0.2`，但不是 tag/npm 三元组；本轮改绑可达 peel。
- inspected：
  - `package.json`
  - `source/index.ts`
  - `source/core/Ky.ts`
  - `source/core/constants.ts`
  - `source/types/hooks.ts`
  - `source/types/retry.ts`
  - `source/types/options.ts`
  - `source/utils/normalize.ts`
  - `source/utils/timeout.ts`
  - `source/utils/body.ts`
  - `source/errors/*.ts`
  - `test/hooks.ts`
  - `test/retry.ts`
- observed：
  - creating a Ky call starts a `ResponsePromise` immediately; one microtask lets body shortcuts set `Accept`;
  - `prefixUrl` throws; string URLs use `prefix` join then optional `baseUrl` resolution;
  - retry defaults to limit 2, methods exclude POST/PATCH, `retryOnTimeout` is false, delay is `0.3 * 2^(n-1)` seconds;
  - 413 is in `statusCodes` but is not retried without `Retry-After`;
  - per-attempt timeout defaults to 10 seconds; `totalTimeout` defaults off and starts in the constructor;
  - `retry.limit > 0` clones the request so stream bodies may be teed;
  - hook APIs take a state object; `beforeRequest` runs once; `ky.retry()` raises `ForceRetryError`.

## Superagent

- canonical source：`https://github.com/ladjs/superagent`
- revision：`3ef367619fbb2a8d07082238892ae12dafe4b0b0`
- package：`superagent@10.3.0`
- engines：`node >=14.18.0`
- provenance：GitHub peeled tag `v10.3.0^{}`、npm `gitHead` 与当时 `master` HEAD 均指向同一提交；annotated tag 对象是 `1526a7167dea90b036dd16103efc7de9b75ffc61`
- inspected：
  - `package.json`
  - `src/request-base.js`
  - `src/response-base.js`
  - `src/agent-base.js`
  - `src/client.js`
  - `src/node/index.js`
  - `src/node/agent.js`
  - `src/node/http2wrapper.js`
  - `src/node/parsers/index.js`
  - `docs/index.md`
  - `test/retry.js`
- observed：
  - this is a callback/thenable client, not a Fetch wrapper: Node uses `http`/`https`/`http2`, browser uses `XMLHttpRequest`;
  - fluent builders mutate one request; `.then()` calls `.end()`;
  - timeout and retry are off until configured; `.retry()` with no args sets `_maxRetries = 1`;
  - the method allowlist for retry is commented out, so POST can be retried;
  - HTTP status outside 2xx rejects unless `.ok()` replaces the predicate;
  - Node redirects default to 5, HEAD defaults to 0; HTTP/2 is off unless `.http2()`;
  - Node `request.agent()` attaches a cookie jar; browser `.agent()` only stores defaults.
