---
title: workerd — Cloudflare Workers 同源的 JS/Wasm 服务器运行时
description: 介绍 workerd 1.20260827.1 如何用 Capn Proto 配置、compatibility date 与 V8 isolate 跑 Workers。
来源: https://github.com/cloudflare/workerd
日期: 2026-08-27
分类: 基础设施
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/cloudflare/workerd
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fffb83fc1e7c0bdcec92ad9f83bc2d9bb523bc12
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.20260827.1
---

## 是什么

`workerd`（读作 worker-dee）是 **Cloudflare Workers 同套代码** 开源出来的 JavaScript / Wasm 服务器运行时。日常类比：它是车间里那台真正压零件的冲床；本机开发工具只是把它包了一层按钮。

固定 tag `v1.20260827.1` 的进程入口是 `src/workerd/server/workerd.c++` 的 `main` → `kj::runMainAndExit`。未嵌入配置时，CLI 子命令是 `serve`、`compile`、`test`，以及两条 Pyodide 辅助命令。版本号就是它能模拟的最大 [compatibility date](https://developers.cloudflare.com/workers/platform/compatibility-dates/)：`src/workerd/io/release-version.txt` 写着 `2026-08-27`。

最小自托管不是「写一个 `listen()`」，而是一份 Cap'n Proto 配置加上一段 worker 脚本：

```capnp
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [(name = "main", worker = .mainWorker)],
  sockets = [(name = "http", address = "*:8080", http = (), service = "main")],
);

const mainWorker :Workerd.Worker = (
  serviceWorkerScript = embed "hello.js",
  compatibilityDate = "2023-02-28",
);
```

```js
addEventListener("fetch", event => {
  event.respondWith(new Response("Hello World"));
});
```

```sh
npx workerd serve config.capnp
```

## 为什么重要

不读固定 1.20260827.1，会把四层叠成一层：

- 生产 Cloudflare 边缘上的多层沙箱
- 这个开源二进制本身
- 生成本地 config 的上层工具
- [[edge-runtime]] 那种「Node `vm` 里灌 Web API」的测试包

README 写得很直：`workerd` **不是加固沙箱**。它按配置限制 Worker 能碰到的资源，但挡不住实现漏洞；跑不可信代码必须再套虚拟机。Cloudflare 线上另有多层防御。

## 架构与流程

从配置到一次 `fetch`，固定源码可以拆成五步：

1. **解析配置**：`workerd serve <file> [const-name]` 读 Cap'n Proto 文本，或 `--binary` 读上层工具生成的二进制消息。`compile` 则把配置和源码嵌进一个自包含二进制。

2. **声明服务与套接字**：`Config.services` 是内部名字；必须再经 `sockets` 才对外暴露。没定义名为 `internet` 的服务时，运行时隐式补一个：`allow = ["public"]`，`trustBrowserCas = true`。它默认托住 Worker 全局 `fetch()`。

3. **装 Worker**：`Worker` 三选一——`modules`（ESM 列表，第一项是主模块）、`serviceWorkerScript`（全局 `addEventListener`）、或 `inherit` 另一个服务。`compatibilityDate` 必填（inherit 时反而必须为空）。

4. **按 capability 接线**：默认没有特权资源。KV / R2 / Queue / Durable Object / 其他 Worker 都要写成 `bindings`。模块语法走 `env`；service worker 语法变成全局变量。`globalOutbound` 可把 `fetch()` 改接到别的服务，包括完全关掉公网。

5. **同进程 nanoservice**：一个 nanoservice 调另一个时，在**同一线程、同一进程**里跑，延迟按本地函数调用算，不是另起 HTTP hop。派生 Worker（`inherit`）与基座共享 isolate，只换 `env`。

## 实践示例

### 案例 1：模块语法的默认入口

```js
export default {
  async fetch(request, env, ctx) {
    ctx.waitUntil(Promise.resolve())
    return new Response(request.url)
  },
}
```

`ServiceDesignator.entrypoint` 可以改指向 `export let foo = { ... }`；不写就用 `export default`。`ExecutionContext::waitUntil` 把 promise 交给当前 `IoContext`。

### 案例 2：把公网 `fetch` 收掉

```capnp
const locked :Workerd.Worker = (
  modules = [(name = "main", esModule = embed "locked.js")],
  compatibilityDate = "2026-08-27",
  globalOutbound = "loopback-only",
);
```

不给 `internet`、也不把 `globalOutbound` 指到能出网的服务，Worker 就没有「按 URL 随便打外网」的能力。这是 capability 模型，不是 Node 式全局 `http`。

### 案例 3：生产用 systemd 交文件描述符

```sh
workerd serve /etc/workerd/config.capnp --socket-fd http=3 --socket-fd https=4
```

`--socket-addr` 改监听地址；`--socket-fd` 接收父进程（常见是 systemd）已经绑好的特权端口。`--watch` 监视配置和二进制并重载，源码注明适合开发、**不建议生产**。`--debug-port` 暴露能碰到进程内全部服务的特权接口，注释写明给本地开发用。

## 踩过的坑

1. **把开源 `workerd` 当成 Cloudflare 线上沙箱**：README 要求不可信代码外再套 VM。发现逃逸应走 bug bounty，不要假设单进程隔离足够。

2. **以为版本号是 semver 功能代际**：`1.20260827.1` 的中间段是 compatibility date。升级二进制不会自动改旧 Worker 的 API 形状；行为跟配置里的日期走。

3. **把 npm 包源码树里的 `1.20220926.0` 当当前版本**：`npm/workerd/package.json` 是打包模板。本轮 npm `workerd@1.20260827.1` 的 `gitHead` 与 tag `v1.20260827.1` 同为 `fffb83fc1e7c0bdcec92ad9f83bc2d9bb523bc12`。

4. **默认 `fetch` 就能打内网**：隐式 `internet` 只允许 `public`。打私有地址、Unix socket 或别的 Worker，要显式 network / service binding。

5. **用 [[edge-runtime]] 的心智模型来猜 isolate**：那个包是 Node `vm`；`workerd` 是 C++ 服务器 + 真 V8 isolate + Cap'n Proto 配置。

## 适用 vs 不适用场景

**适用**：

- 自托管为 Workers 写的 `fetch` handler
- 需要 capability binding、compatibility date 和同进程 nanoservice
- 用 `npx workerd` 跑预编译二进制（Linux glibc ≥ 2.35，macOS ≥ 13.5；x86_64 需 SSE4.2+CLMUL，或 arm64 CRC）

**不适用**：

- 只想在 Node 测试里 `dispatchFetch` 一次——[[edge-runtime]] 更窄
- 要通用 CLI / 包管理运行时——[[bun]] / [[deno]] / [[node-js]]
- 不能接受「配置是 Cap'n Proto，不是 `package.json` scripts」
- 把不可信多租户代码直接丢进单进程 `workerd`，不再套 VM

## 固定版本边界

- 本文绑定 `cloudflare/workerd@fffb83fc1e7c0bdcec92ad9f83bc2d9bb523bc12`，lightweight tag `v1.20260827.1`，与 npm `workerd@1.20260827.1` 的 `gitHead` 一致。
- 许可是 Apache-2.0。根 `package.json` 是 private `@cloudflare/workerd-root`；分发物是 npm `workerd` 加按平台 optional 的 `@cloudflare/workerd-*` 二进制。
- `src/workerd/` 分层：`jsg`（C++/V8 FFI）、`io`（生命周期与事件）、`api`（JS 可见 API）、`server`（进程与配置）。
- 本文未编译 Bazel 目标、未跑 `workerd serve`、未测 isolate / HTTP 性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **Workers 的合同在配置，不在全局对象**——服务、套接字、binding、compatibility date 先于 JS。
2. **版本号是能模拟到哪一天**——不是「1.x 大改行为」。
3. **开源运行时 ≠ 托管平台的防御深度**——isolate 限制资源，沙箱要另做。
4. **同进程调用是产品特性**——nanoservice 不是微服务网格。

## 应用型自测

1. 单独跑 `workerd`、不加虚拟机，能不能当多租户不可信代码的加固沙箱？
2. `1.20260827.1` 中间那段数字表示什么？
3. 配置里不写 `internet` 服务时，Worker 里的全局 `fetch()` 默认打向哪里？

检查点：

1. 不能。README 写明它不是 hardened sandbox。
2. 该发行能支持的最大 compatibility date：`2026-08-27`。
3. 隐式 `internet` 服务，且只允许 `public` 地址。

## 延伸阅读

- 固定源码：[cloudflare/workerd](https://github.com/cloudflare/workerd) —— 本文绑定 `fffb83fc1e7c0bdcec92ad9f83bc2d9bb523bc12`
- 配置注释：[workerd.capnp](https://github.com/cloudflare/workerd/blob/fffb83fc1e7c0bdcec92ad9f83bc2d9bb523bc12/src/workerd/server/workerd.capnp)
- Compatibility dates：[developers.cloudflare.com/workers/platform/compatibility-dates](https://developers.cloudflare.com/workers/platform/compatibility-dates/)
- [[edge-runtime]] —— Node vm 上的 Edge Function 对照
- [[hono]] —— `export default app` 可直接交给 Workers `fetch`

## 关联

- [[edge-runtime]] —— 同写 `Request`/`Response`，但是 Node `vm` 而不是独立 isolate
- [[hono]] —— 多运行时框架，Workers 适配器走 `app.fetch`
- [[postgres-js]] —— 条件导出有 `workerd` 分支
- [[deno]] —— 另一条带权限模型的 JS 运行时
- [[bun]] —— 单二进制应用运行时对照
- [[node-js]] —— workerd 不试图做 Node 发行版

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[edge-runtime]] —— edge-runtime — 用 Node vm 模拟 Edge Web API 的本地运行时
