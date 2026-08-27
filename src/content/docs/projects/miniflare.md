---
title: Miniflare — 用 workerd 子进程模拟 Workers 的库
description: 固定 4.20260730.0：装配 capnp 配置、拉起 workerd，不再提供自己的 CLI
来源: https://github.com/cloudflare/workers-sdk
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/cloudflare/workers-sdk
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 96fd16f0e06e82eb99001c70e4935e992e69cb87
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.20260730.0
---

## 是什么

Miniflare 是给工具作者用的 **Cloudflare Workers 本地模拟器库**。日常类比：它不是又写了一台假飞机，而是按清单把真飞机（`workerd`）拖到停机坪、接好管线，再让你从廊桥送进一架请求。

固定 `4.20260730.0` 住在 `cloudflare/workers-sdk` 的 `packages/miniflare`，与 [[wrangler]] `4.116.0` 钉在同一提交。README 写明日常开发应走 Wrangler 或 Cloudflare Vite plugin；自己嵌库才直接 `import { Miniflare }`。

```js
import { Miniflare } from "miniflare"

const mf = new Miniflare({
  script: `export default { fetch() { return new Response("ok") } }`,
  modules: true,
})
const res = await mf.dispatchFetch("http://localhost:8787/")
await mf.dispose()
```

`bin` 仍叫 `miniflare`，但 `bootstrap.js` 只会报错并让你改用 `npx wrangler dev`。

## 为什么重要

不看固定源码，旧印象会卡住：

- Miniflare 3/4 还带自己的 CLI（`bootstrap.js` 明确删掉了）
- `persist: false` 等于纯内存、reload 后数据还在（reload 会重启 workerd，关闭持久化时改写临时目录）
- Miniflare 自己解释 Worker 字节码（真正执行的是 `workerd` 子进程）

它和 [[wrangler]] 的分工也要说清：Wrangler 是人用的柜台；Miniflare 是装配车间。

## 核心要点

固定版本可以把实例寿命拆成五步：

1. **校验并拆 options**：构造函数调用 `validateOptions`，得到 shared / per-worker 两套插件选项，并 `checkMacOSVersion({ shouldThrow: true })`。
2. **先起辅助面**：loopback HTTP、live-reload / WebSocket 服务器、可选 inspector proxy、`DevRegistry`。临时目录路径先算好，不立刻 `mkdtemp`。
3. **装配 workerd 配置**：`#assembleConfig` 把插件服务编成 capnp；`serializeConfig` 后交给 `Runtime.updateConfig`。
4. **拉起子进程**：`getRuntimeCommand()` 用 `MINIFLARE_WORKERD_PATH` 或 npm `workerd` 路径；参数是 `serve --binary --experimental`，配置从 stdin 读，控制消息走 `--control-fd=3`。端口齐了才算 `ready`。
5. **对外合同**：`ready` 得到入口 URL；`dispatchFetch` 把请求改写到 runtime origin（注释写 host 可忽略）；`setOptions` 持 `#runtimeMutex` 后重装配置；`dispose` 杀掉 runtime 并尽量删临时目录。

`src/plugins/index.ts` 的 `PLUGINS` 固定登记 **33** 项，包括 core、cache、D1、Durable Objects、KV、Queues、R2、Hyperdrive、assets 等。未在选项里打开的插件不会凭空变成生产绑定。

## 实践示例

### 案例 1：库入口，不是命令行

```js
import { Miniflare } from "miniflare"

const mf = new Miniflare({ script: `addEventListener("fetch", (e) => e.respondWith(new Response("hi")))` })
console.log(await (await mf.dispatchFetch("http://example.test/")).text())
await mf.dispose()
```

README 的 host 可以乱写，因为 `dispatchFetch` 会改到 `#runtimeEntryURL`。`npx miniflare` 在这一版只会走到 `bootstrap.js` 的错误信息。

### 案例 2：关掉 persist 仍会落盘

```js
const mf = new Miniflare({
  script: "...",
  kvPersist: false,
})
```

`getPersistPath` 在 `persist === false` 时返回 `tmpPath/pluginName`。注释写明：Miniflare 2 的内存存储能熬过 options reload，但现在每次 reload 重启 `workerd`，所以用临时目录冒充“内存”，`dispose()` 再删。

### 案例 3：热更新要排队

```js
await mf.setOptions({ script: "export default { fetch() { return new Response('v2') } }", modules: true })
```

`setOptions` 先 `poisonProxies`，再在 `#runtimeMutex` 里跑 `#setOptions` → `#assembleAndUpdateConfig`。Wrangler 的 `LocalRuntimeController` 热 reload 走的就是这条锁，而不是另起互不相干的进程各跑各的。

## 踩过的坑

1. **继续教 `miniflare` CLI**：固定 `bootstrap.js` 只报错。人用入口是 `wrangler dev`。
2. **把 Miniflare 当成 JS 里的 Workers 解释器**：它装配配置并 spawn `workerd`。覆盖二进制用 `MINIFLARE_WORKERD_PATH`。
3. **以为 `persist: false` 等于不碰磁盘**：false 仍写临时路径，只是实例销毁时清掉。
4. **WebSocket 协议头指望库自动处理**：`WebSocketServer` 的 `handleProtocols` 被设成 `() => false`，注释指向 Workers 要求用户自己带 `Sec-WebSocket-Protocol`。
5. **把 5.x alpha 当成本页合同**：npm `latest` 在审查日是 `5.20260826.0-alpha`。本页只绑定 4.20260730.0。

## 适用 vs 不适用场景

**适用**：

- 写测试或工具，需要可编程地起一份本地 Workers
- 已经理解 `ready` / `dispatchFetch` / `setOptions` / `dispose` 四件套
- 能接受 Node `>=22`，以及 workerd 原生二进制

**不适用**：

- 只想敲一条命令做本地开发（用 [[wrangler]]）
- 要把静态阅读写成“和线上 Workers 行为逐字节一致”
- 需要本轮未打开的 workerd 仓或 5.x alpha 源码结论

## 固定版本边界

- 本文绑定 `cloudflare/workers-sdk@96fd16f0...`，annotated tag `miniflare@4.20260730.0`。
- npm 该版本依赖 `workerd@1.20260730.1`，无 `gitHead`；身份以 Git tag 与仓库 `package.json` 为准。
- license 为 MIT；`engines.node` 为 `>=22.0.0`。
- 本文只做源码静态审查，没有启动 workerd 或跑测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **模拟器的核心是装配 + 子进程**，不是再实现一套 isolate
2. **CLI 已从库里拿走**——人用入口在 Wrangler
3. **persist 的 false 是“用临时目录假装内存”**，服务的是 reload 语义
4. **和 Wrangler 4.116 必须成对理解**——更新的 CLI 已经改去 5.x alpha

## 应用型自测

1. `npx miniflare` 在 4.20260730.0 会启动本地服务器吗？
2. `dispatchFetch("http://example.test/")` 为什么 host 可以乱写？
3. `kvPersist: false` 时数据写在哪里？reload `setOptions` 之后还在吗？

检查点：

1. 不会。`bootstrap.js` 报错并指向 `wrangler dev`。
2. 实现会把 URL 改写到 `#runtimeEntryURL` 的 origin。
3. 写在实例 `tmpPath` 下的插件子目录；reload 仍能看到，因为临时目录还在。`dispose()` 后才清。

## 延伸阅读

- 包内 README：`packages/miniflare/README.md`
- 固定源码：[cloudflare/workers-sdk](https://github.com/cloudflare/workers-sdk) —— 本文绑定提交 `96fd16f0e06e82eb99001c70e4935e992e69cb87`
- 对照入口：`packages/miniflare/src/index.ts`、`packages/miniflare/src/runtime/index.ts`、`packages/miniflare/src/plugins/index.ts`
- [[wrangler]] —— 同提交的人用 CLI；`dev` 默认 `new Miniflare`
- [[hono]] —— 跑在 Workers `fetch` 合同上的应用框架

## 关联

- [[wrangler]] —— 命令行与本地控制器图
- [[hono]] —— 常见 Worker handler 框架
- [[partykit]] —— Durable Objects 协作框架，本地仍可能落到这份模拟器
- workerd —— 真正的运行时二进制，本页只作为 Miniflare 依赖出现，未单独建页

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[wrangler]] —— Wrangler — Cloudflare Workers 的 CLI，不是运行时
