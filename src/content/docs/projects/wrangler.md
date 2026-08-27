---
title: Wrangler — Cloudflare Workers 的 CLI，不是运行时
description: 固定 4.116.0：yargs 命令表把 dev 接到 Miniflare，把 deploy 接到上传链
来源: https://github.com/cloudflare/workers-sdk
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/cloudflare/workers-sdk
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 96fd16f0e06e82eb99001c70e4935e992e69cb87
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.116.0
---

## 是什么

Wrangler 是 Cloudflare Workers 的命令行入口。日常类比：它是登机柜台和地勤，不是飞机本身——柜台帮你办票、改航线、把行李送上传送带，真正飞的是 `workerd`。

固定 `4.116.0` 住在 `cloudflare/workers-sdk` 的 `packages/wrangler`。`bin/wrangler.js` 先用 `semiver` 拒绝 Node `< 22.0.0`，再 spawn `wrangler-dist/cli.js`。`wrangler`、`wrangler2`、`cf-wrangler` 三个二进制名指向同一份脚本。

```bash
npx wrangler@4.116.0 init my-worker -y
npx wrangler@4.116.0 dev
npx wrangler@4.116.0 deploy
```

本轮只读固定源码，没有执行这些命令。

## 为什么重要

不看固定入口，旧教程容易把三件事说错：

- Wrangler 自己就是 Workers 运行时（运行时是 `workerd`，本地由 [[miniflare]] 拉起）
- `wrangler publish` 还是顶层命令（固定 `src/index.ts` 注册的是 `deploy`；只有 `wrangler pages publish` 仍在，且标成 deprecated）
- 当前 npm `latest` 的 Wrangler 一定搭配稳定 Miniflare 4（`4.117.0` 起改依赖 `miniflare@5.*-alpha`，本页不绑定那条线）

它和 [[miniflare]] 的关系也不是“两个独立产品随便拼”：同一提交里 `wrangler` 的 workspace 依赖就是这份 `miniflare@4.20260730.0`。

## 核心要点

固定版本可以把主链拆成四步：

1. **命令表是 yargs + `CommandRegistry`**：`main(argv)` 做完 Sentry / macOS 检查后调用 `createCLIParser`。`init`、`dev`、`deploy`、`preview`、`types`、`build` 都是 `registry.define` 再 `registerAll`。
2. **`dev` 默认是本地控制器图**：`startDev` 构造 `DevEnv`。默认 runtime 工厂是 `LocalRuntimeController` 加 `RemoteRuntimeController`，前面还有 `ConfigController`、`BundlerController` 和 `ProxyController`。
3. **用户 Worker 的本地进程是 Miniflare**：`LocalRuntimeController` 用 `buildMiniflareOptions` 拼选项，首次 `new Miniflare(options)`，之后热更新走 `setOptions`。`ProxyController` 会再起一份 proxy 用的 Miniflare；源码注释写明容器镜像未就绪时，你可能先看到 proxy 的 “Ready on...”。
4. **`deploy` 是打包再上传**：`runDeployCommandHandler` 先可选 autoconfig（CLI 默认 `true`），再 `mergeDeployConfigArgs` → `buildWorker` → `@cloudflare/deploy-helpers` 的 `deploy()`。

配置文件按 README 是 `wrangler.jsonc`（推荐）、`wrangler.json` 或 `wrangler.toml`。未指定 `--persist-to` 时，本地状态落在配置文件目录（没有配置文件则 cwd）下的 `.wrangler/state`。

## 实践示例

### 案例 1：本地开发走的是控制器图，不是“直接跑脚本”

```ts
// packages/wrangler/src/api/startDevWorker/DevEnv.ts 的默认工厂
runtimeFactories = [
  (devEnv) => new LocalRuntimeController(devEnv),
  (devEnv) => new RemoteRuntimeController(devEnv),
]
```

`wrangler dev` 的 handler 只负责把 CLI 参数收成 `StartDevOptions`，再交给 `startDev`。想解释“为什么改 binding 会 reload”，要看 `LocalRuntimeController` 对 `#mf.setOptions` 的那条路径，而不是猜 CLI 自己嵌了 V8。

### 案例 2：兼容日期的 `--latest` 不是版本号开关

```bash
npx wrangler@4.116.0 dev --latest
```

固定 `dev.ts` 里 `--latest` 默认 `true`，描述是 “Use the latest version of the Workers runtime”。它管的是 **workerd 兼容日期**，不是“自动升级 wrangler 包”。

### 案例 3：部署前先 build，再交给 deploy-helpers

```ts
const buildResult = await buildWorker(buildProps, config)
await deploy(props, config, buildResult, { /* sites / containers / analyseBundle */ })
```

固定 `deploy/index.ts` 把脚本打包和账号上传拆开。本轮没有打开 `@cloudflare/deploy-helpers` 仓，所以不能把上传协议或 API 字段写成已核验事实。

## 踩过的坑

1. **把 Wrangler 当成运行时**：用户代码跑在 `workerd` 里。Wrangler 负责配置、打包、代理和上传。
2. **继续教 `wrangler publish`**：固定命令表没有顶层 `publish`。Pages 的 `wrangler pages publish` 仍在，但源码写明下一个大版本会删，应改 `pages deploy`。
3. **把 `--remote` 当成当前推荐**：`start-dev.ts` 仍接受该旗标，但会打印改用 resource 级 remote bindings 的说明。
4. **以为 npm `wrangler@latest` 仍钉在 Miniflare 4**：本页绑定的是内部一致的 `4.116.0` / `4.20260730.0`。`4.117.0` 之后改依赖 5.x alpha，那是另一条未审查线。
5. **忽略 Node 22**：`bin/wrangler.js` 的 `MIN_NODE_VERSION` 是 `22.0.0`，低于此直接 `exitCode = 1`。

## 适用 vs 不适用场景

**适用**：

- 需要同一套配置走本地 `dev` 和远端 `deploy`
- 能接受 Node `>=22`，以及本地状态默认写进 `.wrangler/state`
- 想理解 CLI 如何接到 Miniflare，而不是只背命令清单

**不适用**：

- 要把 Wrangler 当成可嵌入的 Workers runtime 库（那是 [[miniflare]] / `workerd`）
- 必须绑定 2026-08 的 npm `latest`（当时已是 `4.127.0` + Miniflare 5 alpha）
- 需要本轮未核验的冷启动、包体积或上传耗时数字

## 固定版本边界

- 本文绑定 `cloudflare/workers-sdk@96fd16f0...`，annotated tag `wrangler@4.116.0`，与 `miniflare@4.20260730.0` 同提交。
- npm 该版本无 `gitHead`；身份以 Git tag 与仓库 `package.json` 为准。
- 直接依赖声明 `miniflare`、`workerd`、`esbuild`、`unenv`；license 为 MIT OR Apache-2.0。
- 本文只做源码静态审查，没有安装依赖或运行 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **CLI 和运行时要拆开看**——柜台办票，飞机是 `workerd`
2. **`dev` 是多控制器图**——本地 Miniflare、远程 runtime、proxy 不是同一个对象
3. **`deploy` 先 build 再 upload**——打包失败时不要先怪账号 API
4. **版本要对成对**——Wrangler 4.116 配 Miniflare 4；更新的 4.117+ 已离开这条稳定线

## 应用型自测

1. `bin/wrangler.js` 在 Node 20 上会怎样？真正执行用户 Worker 的是 Wrangler 进程还是 `workerd`？
2. `LocalRuntimeController` 第一次和热更新分别怎么对待 `Miniflare` 实例？
3. 固定命令表里顶层部署命令叫什么？`wrangler pages publish` 还算稳定入口吗？

检查点：

1. 低于 `22.0.0` 会拒绝启动。用户 Worker 跑在 `workerd`，由 Miniflare 拉起。
2. 第一次 `new Miniflare(options)`，之后 `setOptions`。
3. 顶层是 `deploy`。`pages publish` 仍注册，但源码标 deprecated。

## 延伸阅读

- 官方文档：[developers.cloudflare.com/workers/wrangler](https://developers.cloudflare.com/workers/wrangler/)
- 固定源码：[cloudflare/workers-sdk](https://github.com/cloudflare/workers-sdk) —— 本文绑定提交 `96fd16f0e06e82eb99001c70e4935e992e69cb87`
- 对照入口：`packages/wrangler/src/index.ts`、`packages/wrangler/src/dev/start-dev.ts`、`packages/wrangler/src/api/startDevWorker/LocalRuntimeController.ts`
- [[miniflare]] —— 同提交的本地模拟器库；`wrangler dev` 的用户 Worker 进程
- [[hono]] —— 常见的 Workers `fetch` 框架，不是 CLI

## 关联

- [[miniflare]] —— 本地 workerd 装配与 `dispatchFetch`
- [[hono]] —— Workers 上常见的应用框架
- [[partykit]] —— 建在 Durable Objects 上的协作框架，仍要经 Workers 工具链
- [[bun]] —— 另一条 JS 运行时，不是 Cloudflare 边缘 isolate

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[miniflare]] —— Miniflare — 用 workerd 子进程模拟 Workers 的库
