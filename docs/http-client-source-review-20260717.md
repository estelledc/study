# HTTP client source review

> 用途：记录 Axios、Ky、Got 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-07-17
- evidence：GitHub metadata、固定提交静态源码与测试阅读
- not executed：未安装三仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Axios

- canonical source：`https://github.com/axios/axios`
- revision：`a092bae50d1884782151b2fcea12974d6da6e376`
- package：`axios@1.18.1`
- inspected：
  - `package.json`
  - `lib/core/Axios.js`
  - `lib/core/dispatchRequest.js`
  - `lib/core/settle.js`
  - `lib/core/InterceptorManager.js`
  - `lib/adapters/adapters.js`
  - `lib/defaults/index.js`
- observed：
  - request config is merged and passed through request interceptors before dispatch;
  - dispatch transforms request data, chooses XHR/HTTP/Fetch adapter, then transforms response data;
  - `validateStatus` controls whether `settle` resolves or rejects HTTP responses;
  - timeout defaults to zero and is implemented by the selected adapter;
  - retry is not a built-in default policy.

## Ky

- canonical source：`https://github.com/sindresorhus/ky`
- revision：`3419113b48e034fdcf8fa6bd3be3da7b3d0d758f`
- package：`ky@2.0.2`
- inspected：
  - `package.json`
  - `source/core/Ky.ts`
  - `source/types/hooks.ts`
  - `source/types/retry.ts`
  - `source/utils/normalize.ts`
  - `source/utils/timeout.ts`
  - `test/hooks.ts`
- observed：
  - creating a Ky call starts an async response promise; body shortcuts decorate that promise;
  - init, beforeRequest, retry, afterResponse and beforeError have distinct state contracts;
  - retry defaults to two for an allowlist of methods/status codes; timeout retry is off by default;
  - per-attempt timeout defaults to 10 seconds, while total timeout is disabled unless configured;
  - streaming request bodies may be fully buffered when retries are enabled.

## Got

- canonical source：`https://github.com/sindresorhus/got`
- revision：`e3924aa1e53a6ca3eb93a43618ce532442a89b40`
- package：`got@15.1.0`
- inspected：
  - `package.json`
  - `source/core/index.ts`
  - `source/core/options.ts`
  - `source/core/calculate-retry-delay.ts`
  - `source/as-promise/index.ts`
  - `source/core/errors.ts`
  - `documentation/3-streams.md`
  - `documentation/7-retry.md`
  - `documentation/9-hooks.md`
- observed：
  - the core Request is a Node Duplex stream; Promise behavior is layered around it;
  - timeout is phase-specific and disabled by default;
  - retry defaults to limit two and checks methods, status codes, error codes and Retry-After;
  - Promise retry creates another Request and cannot reuse an already consumed stream body;
  - `beforeRetry` and `afterResponse` are ignored by the Stream API, and `beforeRetry` currently receives `(error, retryCount)`.
