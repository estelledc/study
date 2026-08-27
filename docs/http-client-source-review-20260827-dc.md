# HTTP client source review DC

> 用途：记录 Got、Wretch 项目页 2026-08-27 复审所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DC
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- forbidden overlap：未修改 axios、ofetch、undici、ky、node-fetch 正文，也未改开放 PR 已占用 slug

## Got

- canonical source：`https://github.com/sindresorhus/got`
- revision：`b855688f0e520c82aff7a1dd913f9f95a4a05337`
- git tag：annotated `v15.1.0` → tag object `301aab5d10da595bcc6009861c79bcea262d8484` → commit `b855688f...`
- package：`got@15.1.0`
- inspected：
  - `package.json`
  - `source/index.ts`
  - `source/create.ts`
  - `source/core/index.ts`
  - `source/core/options.ts`
  - `source/core/calculate-retry-delay.ts`
  - `source/as-promise/index.ts`
  - `source/core/errors.ts`
  - `documentation/3-streams.md`
  - `documentation/7-retry.md`
  - `documentation/9-hooks.md`
- observed：
  - package is ESM-only, engines Node `>=22`; default export is `create()` around a Duplex `Request`;
  - Promise API is `asPromise()` layered on that Request; `got.stream()` returns the Request itself;
  - timeout defaults are all `undefined` (`lookup` / `connect` / `secureConnect` / `socket` / `send` / `response` / `read` / `request`);
  - retry defaults: `limit=2`, `enforceRetryRules=true`, methods `GET PUT HEAD DELETE OPTIONS TRACE`（不含 `POST`，也不含 `QUERY`）;
  - status codes include `408 413 429 500 502 503 504 521 522 524`; `413` without `Retry-After` returns delay `0`;
  - Promise retry creates another Request and rejects `Cannot retry with consumed body stream` when the same stream body is reused;
  - Stream retry only enters `_beforeError` retry branch when a `retry` listener is attached;
  - hook docs say Stream API ignores `beforeRetry` / `afterResponse`; `afterResponse` lives only in `as-promise`; `beforeRetry` is still invoked from `Request._beforeError` after a retry is scheduled.
- provenance：
  - GitHub tag `v15.1.0` and npm `got@15.1.0` `gitHead` both identify `b855688f0e520c82aff7a1dd913f9f95a4a05337`;
  - the 2026-07-17 page bound `e3924aa1e53a6ca3eb93a43618ce532442a89b40`, which is four later commits (`cacheable-lookup` rewrite, HTTP/2 rewrite, tweaks, then `QUERY` method #2466);
  - that later SHA is reachable on `main` but is not the 15.1.0 release; this review rebinds the tag/npm-consistent commit and removes `QUERY` from the default method allowlist.

## Wretch

- canonical source：`https://github.com/elbywan/wretch`
- revision：`32d5f68badf7e8f103b734febe680968c6e0f97f`
- git tag / package：`3.0.9` / `wretch@3.0.9`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/core.ts`
  - `src/resolver.ts`
  - `src/middleware.ts`
  - `src/types.ts`
  - `src/utils.ts`
  - `src/addons/index.ts`
  - `src/addons/abort.ts`
  - `src/middlewares/retry.ts`
  - `test/node/middlewares/retry.spec.ts`
  - `test/shared/wretch.spec.ts`
- observed：
  - factory is `{...core, _url, _options}`; configuration methods return object-spread or copied-Map clones;
  - verbs call `fetch()` then `resolver()`; object bodies are JSON-stringified on a likely JSON MIME boundary;
  - middleware wraps Fetch with `reduceRight`; first registered middleware is outermost;
  - wrapper `.catcher()` accepts one id or an array; ResponseChain uses `.error()` / `.notFound()` and has no `.catcher()`;
  - retry is opt-in middleware: `delayTimer=500`, linear `delay * nbOfAttempts`, `maxAttempts=10` (`0` means infinite), stop on ok or 4xx, no network retry, no method allowlist;
  - timeout is Abort addon `setTimeout()` on the response chain, not a core default;
  - package exports both import and require, engines Node `>=22`.
- provenance：
  - Git tag `3.0.9`, npm `wretch@3.0.9` `gitHead`, and the checked-out commit are the same `32d5f68badf7e8f103b734febe680968c6e0f97f`.
