---
title: Bun — 单二进制 JS/TS 运行时与工具链
来源: https://github.com/oven-sh/bun
日期: 2026-05-29
分类: 运行时 / 构建工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/oven-sh/bun
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 34cbb9a40b4bd1bd767d134a7065e66c2432a676
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.4.0
---

## 是什么

Bun 1.4.0 是一个**单文件可执行程序**，把运行 `.js`/`.ts`/`.tsx`、装 npm 包、打包和跑测试收进同一个 `bun` 入口。日常类比：以前出门要带相机、手电筒、笔记本，现在一台手机搞定——但手机里面已经不是 2022 年那套 Zig 机芯。

固定 tag `bun-v1.4.0` 的 `src/` 是 Cargo workspace：`bun_bin` 编成 `libbun_rust.a`，进程 `main` 做完 crash handler、mimalloc、argv 后进入 `cli::Cli::start()`。JS 引擎仍是 **JavaScriptCore**。该树里 **0 个 `.zig` 文件**。

```bash
bun run app.ts        # 运行时 + 即时转译
bun install lodash    # 包管理（bun i）
bun build app.ts      # 打包
bun test              # bun:test
```

`bun <file>` 与 `bun run <file>` 在 CLI 分发里走同一条 Auto/Run 热路径。`package.json` 脚本要用显式 `bun run <script>`，否则同名内置命令优先。

## 为什么重要

不读固定 1.4.0 源码，旧教程会把三件事说错：

- 实现语言还是 Zig（2026-08 的 1.4.0 已是 Rust + C++/JSC 绑定）
- `Bun.serve` 只能写一个 `fetch`（1.2.3 之后 `routes` 才是一等入口，`fetch` 是未匹配回退）
- `bun install` 永远扁平 hardlink（同时存在 hoisted / isolated 两套安装器，lockfile 带 `configVersion`）

它和 [[node-js]] 的关系也不是「更快所以替代」：Bun 刻意兼容 Node 模块与 npm 生态，但 inspector、部分 native addon、V8 专用 API 仍要按版本验证。

## 架构与流程

从敲下 `bun` 到跑用户代码，固定源码的主链可以拆成五步：

1. **进程入口**：`bun_bin::main` 初始化输出与栈检查，再 `Cli::start()`。冷启动路径刻意避开 `install` / `test` / `build` 等 `#[cold]` 子命令。

2. **命令分发**：`RootCommandMatcher` 识别 `run`、`test`、`install`/`i`、`build`、`x`、`repl`、`exec`、`add`、`remove`、`pm` 等。裸文件名走 Run；`bun run` 的解析顺序是脚本 → 源文件 → 本地 bin →（仅 `bun run`）系统命令。

3. **转译再进 JSC**：`bun run` 对 TS/JSX 做原生转译，再交给 `bun_jsc` 的 `VirtualMachine`。这是**运行**，不是 `tsc --noEmit`。类型检查仍要编辑器或 `tsc`。

4. **HTTP 服务**：`Bun.serve` 的 `ServerConfig::from_js` 组装地址、`routes`、`fetch`、WebSocket 与 `idle_timeout`。底层监听走 uWebSockets 绑定。

5. **装包**：`bun_install` 解析 registry / lockfile，用 `clonefile`（macOS）或 `hardlink`（Linux/Windows）落到 cache，失败再拷贝；然后走 hoisted 或 isolated 布局。

## 实践示例

### 案例 1：`routes` 优先的 HTTP 服务

```ts
const server = Bun.serve({
  routes: {
    "/health": new Response("ok"),
    "/users/:id": (req) => new Response(`user ${req.params.id}`),
    "/api/posts": {
      GET: () => Response.json({ posts: [] }),
      POST: async (req) => Response.json(await req.json()),
    },
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(server.url);
```

未写 `port` 时，`from_js` 先放 `3000`，再被 `BUN_PORT` → `PORT` → `NODE_PORT` → CLI `--port` 覆盖。`port: 0` 才是系统选端口。`idle_timeout` 默认 10 秒（`u8`，最大 255，`0` 关闭）；长 SSE 要用 `server.timeout(req, 0)`，不能假定默认一直挂着。

### 案例 2：`bun:test` 不必先装 Jest

```ts
import { test, expect } from "bun:test";

test("加法", () => {
  expect(1 + 1).toBe(2);
});
```

```bash
bun test
bun test foo bar
bun test --test-name-pattern baz
```

固定源码把 runner 标成 Jest-compatible：`describe` / `it` / `expect` / mock / snapshot / fake timers 都在 `test_runner`。重度 Jest 插件或自定义环境仍要逐项验证。

### 案例 3：安装布局不是单一故事

```bash
bun install
bun install --linker hoisted
bun install --linker isolated
bun install --backend hardlink
```

`ConfigVersion::CURRENT` 是 `V1`。文档与安装器同时描述：新 workspace 倾向 isolated（`node_modules/.bun/` + symlink，挡幽灵依赖），新单包倾向 hoisted；旧 lockfile（pre-1.3.2 / `configVersion=0`）保持 hoisted。cache 在 `~/.bun/install/cache/${name}@${version}`。不要把「永远 hardlink 扁平树」写成 1.4.0 合同。

## 踩过的坑

1. **把实现语言停在 Zig**：1.4.0 的 `src/` 已是 Rust workspace + JSC C++ 绑定。排障时去翻 `.zig` 会落空。

2. **只写 `fetch`、不知道 `routes`**：未匹配才进 `fetch`。静态路径、`:id`、按 method 的对象、`/api/*` 通配都在 `routes`。

3. **把 `idleTimeout` 当成「请求处理时限」**：默认关的是**连接空闲**。handler 还在算、但没往 socket 写字节，也会被 10 秒掐断。

4. **`bun dev` 当内置命令**：CLI 表里没有独立 `dev`。它通常是 `package.json` 脚本；与内置命令重名时必须 `bun run dev`。

5. **README 里的启动毫秒当 SLA**：仓库 README 仍引用旧 Hello World 对照。本文未复跑，不能把「快 4 倍」写成当前事实。

## 适用 vs 不适用场景

**适用**：

- 新项目、内部工具、CLI：一个二进制覆盖 run / install / test / build
- 已用 [[hono]] / [[elysia]] 这类 Web 标准 `Request`/`Response` 的服务
- 想少配 Jest/ts-node 的单元测试

**不适用**：

- 必须绑 V8 inspector / Chrome DevTools 协议的剖析流程
- 依赖特定 Node native addon 或未覆盖的 `vm`/`v8` 边角
- 发布给别人用的 library bundle——固定源码的 bundler 会带 runtime helper，库作者常另选打包器
- 不能接受 JSC 与 V8 在 `RegExp` / GC 时机上的差异

## 固定版本边界

- 本文绑定 `oven-sh/bun@34cbb9a40b4bd1bd767d134a7065e66c2432a676`，tag / `package.json` 均为 `1.4.0`。
- 许可分层：Bun MIT；静态链接的 JavaScriptCore / WebKit 为 LGPL-2，重链需按 `LICENSE.md` 提供对象文件。
- 平台声明覆盖 Linux / macOS / Windows 的 x64 与 arm64；Linux 文档建议内核 ≥ 5.6。
- 本文未安装 `bun`、未跑上游测试、未测 install/bundler/HTTP 性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **「一个二进制」是产品合同，不是实现语言合同**——入口没变，1.4.0 的机芯已经是 Rust workspace。
2. **HTTP API 要按版本读 `ServerConfig`**——port 环境变量链、`routes`、`idle_timeout` 都不能靠 2023 年博客外推。
3. **装包布局是策略，不是信仰**——hoisted 与 isolated 共存，lockfile `configVersion` 决定默认。
4. **转译 ≠ 类型检查**——`bun run app.ts` 能跑，并不证明 `tsc` 会通过。

## 应用型自测

1. 固定 1.4.0 的 `src/` 里，实现语言还是 Zig 吗？
2. 不写 `port`、环境变量也没设时，`Bun.serve` 的 TCP 端口先写成多少？之后还会看哪些环境变量？
3. `bun install` 是否保证永远使用扁平 `node_modules` + hardlink？

检查点：

1. 不是。该 tag 是 Rust Cargo workspace，树内 0 个 `.zig`。
2. 先写 3000，再按 `BUN_PORT` → `PORT` → `NODE_PORT`（以及 CLI `--port`）覆盖。
3. 不保证。存在 hoisted / isolated 两套安装器，后端还有 clonefile / hardlink / 拷贝回退。

## 延伸阅读

- 文档：[bun.com/docs](https://bun.com/docs)
- 固定源码：[oven-sh/bun](https://github.com/oven-sh/bun) —— 本文绑定 `34cbb9a40b4bd1bd767d134a7065e66c2432a676`
- [[deno]] —— 同赛道、权限默认相反的运行时
- [[node-js]] —— Bun 声称 drop-in 的对照对象
- [[elysia]] —— 长在 Bun 上的 Web 框架

## 关联

- [[deno]] —— V8 + 默认拒绝权限，和 Bun 的「默认能做」对照
- [[node-js]] —— 模块与 npm 兼容的目标平台
- [[elysia]] —— Bun.serve 上的类型安全框架
- [[hono]] —— 多运行时 Web 标准框架
- [[esbuild]] —— 独立 bundler，适合对照 Bun 的打包边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[deno]] —— Deno — 安全优先的 TypeScript/JavaScript 运行时
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[engine262]] —— engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[hono]] —— Hono — 多运行时 Web 框架
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[vitest]] —— Vitest — Vite 原生测试框架
- [[wasmer]] —— Wasmer — 把 wasm 当成轻量容器到处跑
