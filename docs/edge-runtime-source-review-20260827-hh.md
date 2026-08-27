# Edge-runtime source review (writer HH)

> 用途：记录 edge-runtime、workerd 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HH
- evidence：GitHub release/tag metadata、npm package metadata、固定提交静态源码与上游文档阅读
- not executed：未安装两仓依赖，未运行上游 test、Bazel 构建、`workerd serve`、HTTP server、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（blob-filtered sparse checkout），不进入 Git
- excluded slugs：`wrangler`、`miniflare`（开放 PR 已占用，本轮明确跳过）；`marked`、`markdown-it`、`knex`、`ioredis`、`redis`、`BullMQ`

## edge-runtime

- canonical source：`https://github.com/vercel/edge-runtime`
- revision：`d1fbe4ee5937c4ad7ff60b57d6f3db9d1e6ab18a`
- package / tag：`edge-runtime@4.0.1`（annotated tag 剥皮提交；`packages/runtime/package.json` version 一致）
- inspected：
  - `package.json`（root `@edge-runtime/root@0.0.0`）
  - `LICENSE.md`
  - `README.md`
  - `packages/runtime/package.json`
  - `packages/runtime/README.md`
  - `packages/runtime/src/index.ts`
  - `packages/runtime/src/edge-runtime.ts`
  - `packages/runtime/src/cli/index.ts`
  - `packages/runtime/src/cli/help.ts`
  - `packages/runtime/src/server/create-handler.ts`
  - `packages/runtime/src/server/run-server.ts`
  - `packages/vm/package.json`
  - `packages/vm/src/vm.ts`
  - `packages/vm/src/edge-vm.ts`
  - `packages/primitives/package.json`
  - `packages/primitives/src/primitives/load.js`
  - `packages/primitives/src/primitives/fetch.js`
  - `packages/primitives/src/primitives/events.js`
  - `packages/primitives/src/primitives/timers.js`
  - `packages/ponyfill/package.json`
- observed：
  - `EdgeRuntime` 是 `@edge-runtime/vm` 的 `EdgeVM` 再导出；底层是 Node `vm.createContext`，默认 `codeGeneration.strings=false`、`wasm=true`；
  - primitives 由 `@edge-runtime/primitives@6.0.0` 注入；`fetch`/`Request` 包 undici `6.21.0`，默认补 `duplex: 'half'`；
  - `addEventListener('fetch')` 只允许一个 listener；`dispatchFetch` 无 listener / 非 Response 时回 500；
  - `FetchEvent.respondWith` 只赋值 `event.response`；`waitUntil` 收集 `event.awaiting`；
  - CLI 默认 host `127.0.0.1`、port `3000`；无 `--listen` 只 evaluate；`EADDRINUSE` 递增端口；
  - `LICENSE.md` 与各包 `license` 字段为 MIT；`packages/runtime/README.md` 仍写 MPLv2，以 LICENSE 为准；
  - `engines.node` 为 `>=18`；`globalThis.EdgeRuntime === 'edge-runtime'`。
- provenance：
  - GitHub latest release 名为 `edge-runtime@4.0.1`，annotated tag 剥皮到上述 commit；
  - 本轮 `npm view edge-runtime@4.0.1` 未返回 `gitHead`，因此只绑定可达 tag 剥皮提交，不伪造 npm 交叉验证。

## workerd

- canonical source：`https://github.com/cloudflare/workerd`
- revision：`fffb83fc1e7c0bdcec92ad9f83bc2d9bb523bc12`
- package / tag：`workerd@1.20260827.1` / lightweight tag `v1.20260827.1`
- inspected：
  - `README.md`
  - `LICENSE`
  - `RELEASE.md`
  - `package.json`（`@cloudflare/workerd-root`）
  - `npm/workerd/package.json`（打包模板，版本号陈旧）
  - `src/workerd/README.md`
  - `src/workerd/io/release-version.txt`（`2026-08-27`）
  - `src/workerd/server/workerd.c++`（`main`、CLI 子命令、serve 旗标）
  - `src/workerd/server/workerd.capnp`（Config / Socket / Worker / Binding / internet 默认）
  - `src/workerd/api/global-scope.c++`（`ExecutionContext::waitUntil`）
- observed：
  - CLI 在无嵌入配置时提供 `serve` / `compile` / `test` / `pyodide-lock` / `make-pyodide-baseline-snapshot`；
  - Worker 形态为 `modules`、`serviceWorkerScript` 或 `inherit`；`compatibilityDate` 对非 inherit Worker 必填；
  - 未定义 `internet` 服务时隐式补 `allow=["public"]` + `trustBrowserCas=true`，作为默认 `fetch()` outbound；
  - 资源默认 capability binding；模块语法走 `env`，service worker 语法走全局；
  - README 明确「not a hardened sandbox」；`--watch` 不建议生产；`--debug-port` 是特权本地接口；
  - nanoservice 同线程同进程调用；`inherit` 派生 Worker 共享 isolate；
  - 版本中间段即最大 compatibility date；npm `gitHead` 与 tag 一致。
- provenance：
  - GitHub latest release `v1.20260827.1` 的 tag commit、`release-version.txt` 与 npm `workerd@1.20260827.1` `gitHead` 三方一致；
  - 源码树 `npm/workerd/package.json` 仍写 `1.20220926.0`，那是打包模板，不是本轮绑定版本。
