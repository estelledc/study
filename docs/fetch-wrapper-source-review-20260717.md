# Fetch wrapper source review

> 用途：记录 ofetch、Wretch 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-07-17
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## ofetch

- canonical source：`https://github.com/unjs/ofetch`
- revision：`47fe80799e23406dd0fb1c504bb493b6a6d0a5af`
- package：`ofetch@1.5.0`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/node.ts`
  - `src/base.ts`
  - `src/fetch.ts`
  - `src/error.ts`
  - `src/types.ts`
  - `src/utils.ts`
  - `test/index.test.ts`
- observed：
  - conditional exports select browser/worker or Node entry points, with `node-fetch-native` as the Node fallback;
  - defaults and request options are merged before request hooks, URL handling and body normalization;
  - non-payload methods default to one retry, while POST/PUT/PATCH/DELETE default to zero; an explicit retry number overrides that split;
  - retry delay defaults to zero, and 1.5.0 installs its timeout controller only when no signal already exists;
  - response parsing precedes response hooks and HTTP error handling, with `destr` as the default JSON parser.
- provenance conflict：
  - npm reports `ofetch@1.5.1` as latest with `gitHead=cd3ed5ab1d50da02a5680645a5633e33d52b0333`;
  - that object is not reachable from the canonical GitHub remote;
  - GitHub tag `v1.5.1` instead points to `d61b2fcf7755ece3fa89b2eaa0415d1d1638216e`, whose `package.json` reports `2.0.0-alpha.3`;
  - this review therefore binds the internally consistent and reachable `v1.5.0` tag/package/revision.

## Wretch

- canonical source：`https://github.com/elbywan/wretch`
- revision：`32d5f68badf7e8f103b734febe680968c6e0f97f`
- package：`wretch@3.0.9`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/core.ts`
  - `src/resolver.ts`
  - `src/middleware.ts`
  - `src/types.ts`
  - `src/utils.ts`
  - `src/addons/abort.ts`
  - `src/middlewares/retry.ts`
  - `test/node/middlewares/retry.spec.ts`
  - `test/shared/wretch.spec.ts`
- observed：
  - the factory and configuration methods create fresh objects with object spread or copied maps;
  - HTTP verbs trigger the resolver, middleware wraps Fetch with `reduceRight`, and body parsers consume the response chain;
  - wrapper catchers and response-chain error handlers are separate APIs;
  - retry is an opt-in middleware with default delay 500 ms, linear ramp, ten retries, no network retry and no method allowlist;
  - timeout is supplied by the Abort addon rather than the core request path;
  - tag, package version and npm `gitHead` all identify the same 3.0.9 revision.
