# Observability source review (writer G)

> 用途：记录 sentry-javascript、pino 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer G
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、未向 Sentry ingest 发送事件、未写日志到真实收集器、未做 bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## sentry-javascript

- canonical source：`https://github.com/getsentry/sentry-javascript`
- revision：`9fcb0635f0152ad1eef35388abbbf276b1e23484`
- package：monorepo tag `10.71.0`；`@sentry/core`、`@sentry/browser`、`@sentry/node`、`@sentry/react` 均为 `10.71.0`
- engines：各公开包声明 Node `>=18`
- npm：`@sentry/browser@10.71.0` / `@sentry/node@10.71.0` / `@sentry/core@10.71.0` 均无 `gitHead`；身份以 GitHub release tag 为准
- inspected：
  - 根 `package.json`、`LICENSE`
  - `packages/core/package.json`
  - `packages/core/src/sdk.ts`
  - `packages/core/src/exports.ts`
  - `packages/core/src/currentScopes.ts`
  - `packages/core/src/scope.ts`
  - `packages/core/src/client.ts`
  - `packages/core/src/utils/scopeData.ts`
  - `packages/core/src/utils/dsn.ts`
  - `packages/core/src/types/options.ts`
  - `packages/browser/src/sdk.ts`
  - `packages/node/src/sdk/index.ts`
  - `packages/react/src/sdk.ts`
- observed：
  - 运行时不再以 Hub 为第一公民；`getCurrentScope` / `getIsolationScope` / `getGlobalScope` 经 async context strategy 取值；
  - `Sentry.setTag` / `setContext` / `addBreadcrumb` 写 isolation scope，`withScope` 只分叉 current scope；
  - `getCombinedScopeData` 按 global → isolation → current 合并，后者覆盖同名字段；
  - `captureException` 先分配 `event_id` 并立即返回，事件经 `_prepareEvent`、event processor、`beforeSend` 后，才对 error 事件做 `sampleRate` 抽样；
  - 浏览器默认 transport 是 `makeFetchTransport`，默认 integrations 含 inboundFilters、breadcrumbs、globalHandlers、dedupe、linkedErrors 等；嵌入式浏览器扩展检测可通过 `skipBrowserExtensionCheck` 跳过；
  - `@sentry/node` 在 `hasSpansEnabled` 时才追加 auto performance integrations，并默认调用 `initOpenTelemetry`，可用 `skipOpenTelemetrySetup` 关闭。

## pino

- canonical source：`https://github.com/pinojs/pino`
- revision：`6b344980eae3ebed904fc87caf4bba0ab9dbe946`
- package：`pino@10.3.1`；npm `gitHead` 与 tag 提交一致
- inspected：
  - `package.json`
  - `pino.js`
  - `lib/proto.js`
  - `lib/levels.js`
  - `lib/constants.js`
  - `lib/tools.js`
  - `lib/transport.js`
  - `browser.js`
  - `LICENSE`
- observed：
  - 默认 level `info`，level 值为 trace=10 / debug=20 / info=30 / warn=40 / error=50 / fatal=60；
  - `setLevel` 把低于阈值的 method 换成 `noop`，`fatal` 在写完后对 stream 调 `flushSync`；
  - `genLsCache` 预拼接每个 level 的 JSON 前缀；`asJson` 用字符串拼接而不是整段 `JSON.stringify` 热路径；
  - `child` 默认 `Object.create(this)` 并预拼 `chindings`；无 options 时复用父 logger 的 method 与 lsCache；
  - `opts.transport` 经 `thread-stream` 建 worker；`target` 与 `targets` 互斥；`pino/file` 映射到仓库 `file.js`；`prettyPrint` 选项会直接抛错；
  - 默认未配置 stream 时，未篡改的 `process.stdout` 走 `sonic-boom`；`browser.js` 是独立入口，落到 console 而不是 worker transport。
