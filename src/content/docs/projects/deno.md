---
title: Deno — 默认拒绝权限的 TypeScript/JavaScript 运行时
来源: https://github.com/denoland/deno
日期: 2026-07-08
分类: 运行时
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/denoland/deno
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 17fadf33a8df3af9488b9f42efd1f2290d6dc7a3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.9.5
---

## 是什么

Deno 2.9.5 是一个默认把危险能力收起来的 JS/TS/Wasm 运行时。日常类比：厨房刀具默认锁在抽屉里，你要写明「这把刀只能切这根胡萝卜」。

固定 tag `v2.9.5` 的进程入口是 `cli/main.rs` → `deno::main()`。默认引擎 feature 是 **V8**（`deno_v8` facade）；Cargo 里另有 `quickjs` feature，但不是默认构建。工具链钉在 `rust-toolchain.toml` 的 `1.95.0`。

最小 HTTP 服务不再走 `https://deno.land/std@0.224.0/http/server.ts`。固定源码的一等入口是内置 `Deno.serve`：

```ts
Deno.serve((_req: Request) => {
  return new Response("Hello, world!");
});
```

未写选项时，`ext/http/00_serve.ts` 把 `hostname` 设成 `"0.0.0.0"`、`port` 设成 `8000`。

## 为什么重要

不读固定 2.9.5，旧笔记会漏掉三道已经写进 CLI 的边界：

- 权限不只是 `--allow-net` / `--allow-read`，还有 `--allow-import`、`--allow-sys`、`--allow-ffi` 和一整组 `--deny-*`
- `deno serve` 会**暗示** `--allow-net=host:port`，和 `deno run` 的默认拒绝不是同一条路
- Deno 2 认真做 npm / JSR / `node_modules`，不能再把「只靠 URL 导入」当成唯一模块合同

它和 [[bun]] 的对照正好相反：Bun 默认让脚本能做事；Deno 默认先问。

## 架构与权限流程

从命令行到用户 handler，固定源码可以拆成五步：

1. **解析旗标**：`cli/args/flags.rs` 得到 `Flags` + `DenoSubcommand`。`run`、`serve`、`task`、`install`、`add`、`test`、`lint`、`fmt`、`compile` 都在 `cli/lib.rs` 的 `run_subcommand` 里分发。

2. **构造权限**：`Permissions` 有八个 unary 域——`read` / `write` / `net` / `env` / `sys` / `run` / `ffi` / `import`。`PermissionState` 默认是 **`Prompt`**（不是 Granted）。`--allow-all`/`-A` 一次放开；`--no-prompt`（或 `DENO_NO_PROMPT`）把未授权变成直接抛错。

3. **启动 worker**：`runtime/worker.rs` 用 `PermissionsContainer` + `JsRuntime` 装扩展。`runtime/lib.rs` 再导出 `deno_fetch`、`deno_http`、`deno_kv`、`deno_node`、`deno_ffi` 等。

4. **接请求**：`Deno.serve` 或 `deno serve` 进入 `ext/http`。`DENO_SERVE_ADDRESS` 可以改成 TCP / unix / vsock / tunnel；自动压缩只在 `DENO_SERVE_AUTOMATIC_COMPRESSION` 为真时打开，缺省关闭。

5. **解析依赖**：URL、`jsr:`、`npm:`、以及 workspace 的 `NodeModulesDirMode`。`deno add express` 无前缀时会补 `npm:`。lockfile 由 `deno_resolver::lockfile` 管理。

## 实践示例

### 案例 1：内置 `Deno.serve`，不要再粘旧 std URL

```ts
Deno.serve({ hostname: "127.0.0.1", port: 8080 }, (req) => {
  const url = new URL(req.url);
  return new Response(`path=${url.pathname}`);
});
```

```sh
deno run --allow-net=127.0.0.1:8080 server.ts
```

handler 可以是第一参数，也可以放进 `options.handler`。只写函数、不写 options 时，监听 `0.0.0.0:8000`。若设置了 `DENO_SERVE_ADDRESS`，第一次 `Deno.serve` 会吃掉这次覆盖。

### 案例 2：文件权限按路径收，不要 `-A`

```ts
const text = await Deno.readTextFile("./data.csv");
console.log(text.slice(0, 120));
```

```sh
deno run --allow-read=./data.csv script.ts
```

读是 `--allow-read`/`-R`，写是 `--allow-write`/`-W`，可以带路径列表。本地调试用 `-A` 等于关掉默认拒绝；生产要把能力写进命令或 `deno.json` 的 `--permission-set`/`-P`。

### 案例 3：`deno serve` 与 `deno run` 的权限差

```sh
deno serve --port=8000 server.ts
deno task start
```

`serve_parse` 默认 `port=8000`、`host=0.0.0.0`，并注释「implies `--allow-net=host:port`」。另有 `--parallel`、`--open`、`--tunnel`。不要假设 `deno serve` 还要你手写一遍同样的 `--allow-net`，也不要把这个暗示套到普通 `deno run` 上。

`--allow-import`/`-I` 管**远程模块下载**，帮助文本给出的默认主机是 `deno.land:443`、`jsr.io:443`、`esm.sh:443`、`raw.esm.sh:443`、`cdn.jsdelivr.net:443`、`raw.githubusercontent.com:443`、`gist.githubusercontent.com:443`。访问其他 registry 要显式加名单。

## 踩过的坑

1. **继续 `import { serve } from "https://deno.land/std@0.224.0/http/server.ts"`**：2.9.5 的一等 API 是 `Deno.serve`。旧 std 路径会把读者锁在过期模块图上。

2. **把 `-A` 带进生产**：默认状态是 Prompt。`-A` 与 `--allow-all` 一次授予全部八域，包括 `ffi` 和 `run`。

3. **以为 `deno serve` 和 `deno run` 权限相同**：`serve` 会按 host:port 暗示网络许可；`run` 不会。

4. **忽略 `--allow-import`**：能读本地文件不等于能拉远程模块。默认 import 允许名单不含任意 GitHub raw 以外的私有源。

5. **把 `deno bundle` 当稳定产品**：`run_subcommand` 对 `Bundle` 打印 experimental 警告。打包合同随时会变。

## 适用 vs 不适用场景

**适用**：

- 脚本、内部服务、边缘函数：需要把读文件、出网、起子进程写进命令行
- TypeScript 直接跑、同时要 lockfile / JSR / npm 的新项目
- 想用 Web 标准 `Request`/`Response`，并接受 Deno 的权限提示

**不适用**：

- 深度绑定 Node native addon、或必须完全按 Node 默认「什么都能做」
- 团队不允许改导入策略、只能走内网 npm registry，又不愿维护 `--allow-import`
- 需要实验性 `deno bundle` 当唯一生产打包器
- 把招聘市场和现有 Node 运维生态当作硬约束时，[[node-js]] 仍是更低风险的默认

## 固定版本边界

- 本文绑定 `denoland/deno@17fadf33a8df3af9488b9f42efd1f2290d6dc7a3`，tag 与 `cli/Cargo.toml` 均为 `2.9.5`。
- 默认构建是 V8；`quickjs` 只是 Cargo feature，不能当成发行版引擎。
- `deno bundle` 在该 revision 标为 experimental。
- 本文未安装 Deno、未跑权限提示、未启动 HTTP、未测冷启动，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认拒绝是状态机，不是口号**——八个 unary 权限，默认 `Prompt`，deny 与 allow 成对出现。
2. **`Deno.serve` 和 `deno serve` 是两层**——JS API 默认 `0.0.0.0:8000`；CLI 还会暗示 `--allow-net`。
3. **远程导入是单独许可**——`--allow-import` 的默认主机名单比「能上网」窄得多。
4. **Deno 2 的模块故事是 JSR + npm + lockfile**——不能再只用 2020 年的 URL 导入解释它。

## 应用型自测

1. 不传 options 时，`Deno.serve(handler)` 默认监听哪个地址和端口？
2. `PermissionState` 的默认值是 Granted 还是 Prompt？
3. `deno serve --port=8000 server.ts` 是否还要再写一遍 `--allow-net=0.0.0.0:8000` 才能监听？

检查点：

1. `0.0.0.0:8000`（可被 `DENO_SERVE_ADDRESS` 覆盖）。
2. `Prompt`。未授权时先问；`--no-prompt` 则直接拒绝。
3. 不必按 `run` 那样手写。`serve_parse` 暗示 `--allow-net=host:port`。普通 `deno run` 没有这条暗示。

## 延伸阅读

- 文档：[docs.deno.com](https://docs.deno.com/runtime/manual)
- 固定源码：[denoland/deno](https://github.com/denoland/deno) —— 本文绑定 `17fadf33a8df3af9488b9f42efd1f2290d6dc7a3`
- 权限说明：[docs.deno.com/go/permissions](https://docs.deno.com/go/permissions)
- [[bun]] —— 单二进制、默认放开能力的对照
- [[node-js]] —— 权限模型与模块解析的历史基线

## 关联

- [[bun]] —— 同赛道运行时；默认能力与引擎选择相反
- [[node-js]] —— npm / `node:` 兼容要对照的平台
- [[hono]] —— 可在 Deno 上跑的多运行时框架
- [[javascript]] —— 运行时语义仍来自 JS 标准
- [[typescript]] —— 类型检查与「能跑 `.ts`」不是同一件事

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boa-engine]] —— Boa — Rust 写的 ECMAScript 解释器
- [[engine262]] —— engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
- [[tauri]] —— Tauri — 用系统浏览器内核 + Rust 做轻量桌面应用
- [[wasmer]] —— Wasmer — 把 wasm 当成轻量容器到处跑
