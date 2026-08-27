# Wrangler + Miniflare source review (writer GK)

> 用途：记录 `wrangler` 与 `miniflare` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gk` 标记 2026-08-27 平行 writer GK，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GK
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装 workers-sdk 依赖，未运行 wrangler / miniflare / workerd，未部署 Worker，未测 bundle / 冷启动 / 吞吐
- worktrees：本机 `research-worktrees/workers-sdk`（gitignored），不进入 Git
- slugs：新建 `wrangler` 与 `miniflare` 两页；未改 `partykit`、`hono`、`bun`、`deno`
- excluded：未绑定 `wrangler@4.117.0` 及之后依赖的 `miniflare@5.*-alpha`

## 共同 provenance

- canonical source：`https://github.com/cloudflare/workers-sdk`
- revision：`96fd16f0e06e82eb99001c70e4935e992e69cb87`
- 该提交同时对应 annotated tag `wrangler@4.116.0` 与 `miniflare@4.20260730.0`（peel 后同一 commit）
- npm：`wrangler@4.116.0` 声明依赖 `miniflare@4.20260730.0`；两包均无 `gitHead`，以 Git tag + 仓库 `package.json` 为准
- 也观察到：`wrangler@4.127.0`（2026-08-27 latest）依赖 `miniflare@5.20260826.0-alpha`；`miniflare` npm `latest` 也是 5.x alpha。本轮不绑定预发布线
- Node：两包 `engines.node` 均为 `>=22.0.0`；`bin/wrangler.js` 用 `semiver` 在启动前拦截更低版本
- workerd：npm `miniflare@4.20260730.0` 依赖 `workerd@1.20260730.1`；本轮未打开 workerd 仓

## Wrangler

- package：`wrangler@4.116.0`
- license：MIT OR Apache-2.0
- bin：`wrangler` / `wrangler2` / `cf-wrangler` → `bin/wrangler.js` → `wrangler-dist/cli.js`
- inspected：
  - `packages/wrangler/package.json`
  - `packages/wrangler/README.md`
  - `packages/wrangler/bin/wrangler.js`
  - `packages/wrangler/src/index.ts`
  - `packages/wrangler/src/dev.ts`
  - `packages/wrangler/src/dev/start-dev.ts`
  - `packages/wrangler/src/dev/miniflare/index.ts`
  - `packages/wrangler/src/dev/get-local-persistence-path.ts`
  - `packages/wrangler/src/api/startDevWorker/DevEnv.ts`
  - `packages/wrangler/src/api/startDevWorker/LocalRuntimeController.ts`
  - `packages/wrangler/src/deploy/index.ts`
- observed：
  - `main(argv)` 先 `setupSentry` / `checkMacOSVersion({ shouldThrow: false })`，再 `createCLIParser`（yargs + `CommandRegistry`）后 `parse`；
  - 顶层稳定命令含 `init` / `dev` / `deploy` / `preview` / `types` / `build`；`wrangler pages publish` 仍注册但源码标 deprecated；未发现顶层 `wrangler publish`；
  - `wrangler dev` 默认走 `DevEnv`：`ConfigController` → `BundlerController` → `LocalRuntimeController` + `RemoteRuntimeController` → `ProxyController`；
  - 本地用户 Worker 由 `LocalRuntimeController` `new Miniflare(options)` 或 `setOptions`；`ProxyController` 另起一份 proxy 用 Miniflare；
  - `--latest` 默认 `true`（兼容日期跟最新 workerd，不是“永远装最新 wrangler”）；
  - `--remote` 仍在，但 handler 提示改用 `wrangler dev` + resource 级 `remote` bindings；
  - 默认持久化目录是配置文件旁 `.wrangler/state`，`--persist-to false` 才关掉；
  - `wrangler deploy`：可选 autoconfig（默认 true）→ `buildWorker` → `@cloudflare/deploy-helpers` 的 `deploy()`；
  - README 推荐配置文件为 `wrangler.jsonc` / `wrangler.json` / `wrangler.toml`。

## Miniflare

- package：`miniflare@4.20260730.0`
- license：MIT
- bin：`miniflare` → `bootstrap.js`（不再提供 CLI）
- inspected：
  - `packages/miniflare/package.json`
  - `packages/miniflare/README.md`
  - `packages/miniflare/bootstrap.js`
  - `packages/miniflare/src/index.ts`
  - `packages/miniflare/src/plugins/index.ts`
  - `packages/miniflare/src/plugins/shared/index.ts`
  - `packages/miniflare/src/runtime/index.ts`
- observed：
  - 定位是给工具作者用的库；README 写日常本地开发应走 Wrangler 或 Vite plugin；
  - `bootstrap.js` 打印错误并指向 `npx wrangler dev`，说明自 miniflare@3 起不再带 CLI；
  - `Miniflare` 构造：校验 options → 起 loopback / inspector / DevRegistry → `new Runtime()` 拉起 workerd 子进程；
  - workerd 命令为 `MINIFLARE_WORKERD_PATH ?? workerdPath`，参数含 `serve --binary --experimental`，配置走 stdin 的 capnp，控制消息走 fd 3；
  - 对外合同：`ready` 得到 URL、`dispatchFetch`（会改写到 runtime origin，host 可忽略）、`setOptions`（持 `#runtimeMutex`）、`dispose`；
  - `PLUGINS` 固定登记 33 项，含 core / cache / D1 / Durable Objects / KV / Queues / R2 等；
  - `persist === false` 仍写 `tmpPath/pluginName`，因为 reload 会重启 workerd，真正内存态撑不过 reload；`dispose()` 再删临时目录；
  - WebSocket upgrade 关闭自动 `Sec-WebSocket-Protocol` 处理；`HEAD` 响应体被 workerd 丢掉时 `dispatchFetch` 有回退注释。
