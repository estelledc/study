# HTTP client source review (writer AL)

> 用途：记录 PARALLEL writer AL 在 2026-08-27 对 `axios`、`ofetch` 两页做 STATIC_REVIEW 所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- writer：AL
- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与仓内文档阅读
- review_mode：`STATIC_REVIEW`
- verification_status：`UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- 未改 open PR slugs：未触碰 A–AG 及其他开放 PR 已占用的项目页

## Axios

- canonical source：`https://github.com/axios/axios`
- published identity：GitHub release / tag `v1.20.0`；npm `axios@1.20.0` 的 `gitHead` 同为该提交
- revision：`84a9f3b9a4f3244b8c8e818f557d64c7b964fb25`
- package：`axios@1.20.0`
- accessed_at：2026-08-27
- inspected：
  - `package.json`
  - `lib/core/Axios.js`
  - `lib/core/dispatchRequest.js`
  - `lib/core/settle.js`
  - `lib/core/InterceptorManager.js`
  - `lib/core/mergeConfig.js`
  - `lib/core/methodList.js`
  - `lib/defaults/index.js`
  - `lib/defaults/transitional.js`
  - `lib/adapters/adapters.js`
  - `lib/adapters/fetch.js`
  - `lib/helpers/composeSignals.js`
- observed：
  - 默认 adapter 候选仍是 `xhr`、`http`、`fetch`；条件 exports 按 bun / react-native / browser / default 选构建；
  - `_request()` 先 `mergeConfig`，再规范化 method、拍平 common/method headers，然后走 request interceptor；
  - `transitional.legacyInterceptorReqResOrdering` 默认 `true`，request interceptor 用 `unshift`（后注册先执行）；设为 `false` 才 `push` 成先注册先执行；
  - `dispatchRequest()` 用 `toSafeFlatObject()` 压平 interceptor 可能换掉的 config，再 transform request、选 adapter；
  - `validateStatus` 默认接受 200-299；缺 status 或缺 `validateStatus` 时 `settle()` 仍 resolve；`validateStatusUndefinedResolves` 默认 `true`；
  - 默认 `timeout` 为 0，没有内建 retry policy；`CancelToken` 仍导出；
  - Fetch adapter 经 `composeSignals([signal, cancelToken.signal], timeout)` 合成 abort；已有 signal 时 timeout 仍可生效；
  - `methodList` 含 `query`；`Axios.prototype.query` 是带 data 的幂等读方法，不生成 `queryForm`。
- provenance note：上一轮页面绑定 `1.18.1` / `a092bae5...`。访问当日 GitHub `v1.18.1` tag 已指向另一提交 `a209bfb1...`，而 `v1.20.0` 的 tag、npm `gitHead` 与 `package.json` version 三者一致。本文改绑 1.20.0，不猜测未发布提交。

## ofetch

- canonical source：`https://github.com/unjs/ofetch`
- published identity：GitHub tag / package `v1.5.0`
- revision：`47fe80799e23406dd0fb1c504bb493b6a6d0a5af`
- package：`ofetch@1.5.0`
- accessed_at：2026-08-27
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
  - 条件 exports 为 browser/worker 与 Node 选择入口；Node 在缺少全局 Fetch 时使用 `node-fetch-native`；
  - defaults 与本次 options 合并后再跑 `onRequest`、拼 URL、规范化 payload body；
  - payload method（POST/PUT/PATCH/DELETE）默认 `retry=0`，其余默认 `1`；显式数字覆盖该分组；
  - 默认 `retryStatusCodes` 为 408/409/425/429/500/502/503/504；`retryDelay` 默认 0；
  - 仅在没有既有 `signal` 时用 `AbortController` 实现 `timeout`；
  - 先按 Content-Type / `responseType` 解析 body（JSON 默认 `destr`），再跑 `onResponse`，4xx/5xx 才进 `onResponseError` 与 retry。
- provenance conflict（2026-08-27 复验仍在）：
  - npm latest 仍是 `ofetch@1.5.1`，`gitHead=cd3ed5ab1d50da02a5680645a5633e33d52b0333`；
  - 该对象在 canonical GitHub remote 不可达；
  - GitHub tag `v1.5.1` 指向 `d61b2fcf7755ece3fa89b2eaa0415d1d1638216e`，其 `package.json` 自报 `2.0.0-alpha.3`；
  - 因此本轮继续绑定内部一致且可达的 `v1.5.0`，不猜测 1.5.1 或 2.0 alpha。
