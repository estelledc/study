---
title: Bun — JS 全能运行时
来源: https://github.com/oven-sh/bun
日期: 2026-05-29
子分类: 语言运行时
分类: 编译器
难度: 中级
provenance: pipeline-v3
---

## 是什么

Bun 是一个**用 Zig 写的 JavaScript 全能运行时**——把 Node.js + npm + bundler + transpiler + test runner 打包成一个二进制。

日常类比：以前出门要带相机 + 手电筒 + 笔记本三件设备，现在一台手机搞定。

你装一个 `bun`，就同时拥有：

```bash
bun run app.ts        # 跑代码（替代 node + ts-node）
bun install lodash    # 装包（替代 npm / pnpm）
bun build app.ts      # 打包（替代 webpack / esbuild）
bun test              # 跑测试（替代 jest / vitest）
```

不用装 `typescript`、`ts-node`、`jest`、`webpack` 这些工具——Bun 把它们全部收进一个二进制里。

## 为什么重要

不理解 Bun，下面这些事都没法解释：

- 为什么 2024 年突然有一堆人说"我把 Node 换成 Bun，启动快了好几倍"
- 为什么 `bun install` 装 100 个包**比 pnpm 还快 30 倍**——明明 pnpm 已经够快了
- 为什么 Bun 文件里没看到 `import 'http'` 也能 `Bun.serve` 起一个 HTTP server
- 为什么有人说"Bun 是给前端工程师写后端的最低门槛"

Bun 的核心价值有四点：

1. **启动快 4 倍**：Node 启动 ~80ms，Bun ~30ms。原因是 Zig 写的 JIT + JavaScriptCore 引擎（不是 Node 用的 V8）
2. **`bun install` 快 30 倍**：用全局二进制 cache + hardlink + 并行下载——和 pnpm 思路像但更激进
3. **内置一切**：TypeScript / JSX / SQLite / 测试框架原生支持，不用配 `tsconfig` + `babel` + `jest`
4. **Web 标准 API 是一等公民**：`fetch` / `WebSocket` / `FormData` 直接用，Node 要等到 v18 才慢慢补齐

## 核心要点

Bun 之所以能"全能 + 快"，靠 **三个底层选择**：

1. **用 Zig 写**（不是 Rust 或 Go）

   - [[swc]] 用 Rust，[[esbuild]] 用 Go，Bun 选 Zig
   - Zig 没有垃圾回收（GC），与 C ABI 直接互操作——SIMD / 指针运算 / 内存对齐都比 Rust 顺手
   - 代价：Zig 1.0 还没发布，**语言本身在变**，社区比 Rust 小一个数量级

2. **用 JavaScriptCore 引擎**（不是 V8）

   - JSC 是 Apple Safari 的引擎；V8 是 Chrome / Node 的引擎
   - JSC 启动快、解释器优先、嵌入 API 小——Bun 选它就是为了**冷启动速度**
   - 代价：V8 的 JIT 优化峰值更高，长跑服务计算密集场景略慢

3. **包管理用全局 cache + hardlink**

   - 第一次装 `lodash` 下载到全局 `~/.bun/install/cache/`
   - 第二次别的项目装 `lodash` 不重新下载，hardlink 一份到 `node_modules/`——磁盘 0 拷贝
   - 这思路 [[pnpm]] 也用，但 Bun 走得更极端：连 metadata 都尽量并行处理

## 实践案例

### 案例 1：30 秒起一个 React 项目

```bash
bun create react-app my-app
cd my-app
bun dev
```

`bun dev` 启动 dev server 从命令敲下到浏览器能访问 ~200ms。同样的 `npm run dev` ~2-3s 起步。

### 案例 2：跑 Jest 兼容的测试

`math.test.ts`：

```typescript
import { test, expect } from "bun:test";

test("加法", () => {
  expect(1 + 1).toBe(2);
});
```

```bash
bun test    # 不用装 jest，不用配 babel，不用 ts-jest
```

API 和 Jest 几乎一样（`describe` / `it` / `expect` / `mock`）——直接搬现有 Jest 测试基本能跑。

### 案例 3：用 Bun 写 HTTP server

```typescript
Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("Hi");
  },
});
```

**逐部分解释**：

- `Bun.serve` 是 Bun 内置 API，不用 `import 'http'`
- `fetch(req)` 接收一个标准 Web `Request` 对象，返回标准 `Response` 对象——这就是"Web 标准 API 一等公民"
- 同样的代码逻辑在 Node 里要 `http.createServer((req, res) => res.end(...))`，写法和浏览器 API 完全不一样
- 用 Bun 写完这段，**直接搬到 Cloudflare Workers / Deno Deploy 几乎不用改**——因为它们都用 Web 标准 API

## 踩过的坑

1. **Node 内置模块不全兼容**：`fs` / `path` / `http` 这些常用的 OK；`v8` / `vm` / `inspector` 这些低层模块模拟得不全。依赖 V8 inspector 协议的工具（Chrome DevTools profiling）跑不动。

2. **JSC 与 V8 边角行为不一致**：

   - `RegExp` 部分高级特性（lookbehind 长度限制）有差异
   - 大数运算（`BigInt`）在某些 corner case 下精度处理不同
   - `WeakRef` / `FinalizationRegistry` 的 GC 时机由 JSC 决定，跨引擎写"靠 GC 触发"的代码不可靠

3. **Bundler 输出不如 esbuild 干净**：默认开 bundle + treeshake，但生成的代码会带额外的 polyfill 和 runtime helper。**做 library 发布**用 esbuild / rollup 仍然更干净。

4. **生产环境还少**（截至 2024 年逐步成熟）：

   - 长跑服务 + 99.99% SLA 场景，Node 的运维生态多 10 年
   - 某些 native 模块（如 `sharp` 的特定 patch）跑不动
   - 大型团队技术栈迁移要观望——通常黑客松 / 小工具 / CLI 这些场景先用

## 适用 vs 不适用场景

**适用**：

- 新项目 startup / 黑客松 / 内部工具——启动快 + 配置零摩擦
- 替代 Jest 跑现有测试——`bun test` 兼容度够高
- 写 CLI 工具 / agent backend / 小型 HTTP API——单二进制部署超方便
- 学 bundler / parser 内部原理——Bun 源码是 Zig 写的，hot path 注释丰富

**不适用**：

- 生产环境长跑服务 + 高 SLA——Node 仍是更稳的选择
- 依赖某个特定 Node native 模块（如 `sharp` 某些 patch）——直接跑不动
- 强依赖 Chrome DevTools 协议——JSC 的 inspector 协议跟 V8 不同
- 团队完全没人用过 Zig——出问题排查源码门槛高

## 历史小故事（可跳过）

- **2021 年**：Jarred Sumner 一个人在 Twitter 上说"我要写一个比 Node 快 4 倍的 JS 运行时"——大家以为他疯了
- **2022 年 7 月**：Bun 0.1 发布，benchmarks 显示真的比 Node 快——风向开始变
- **2023 年 9 月**：Bun 1.0 发布，背后团队 Oven 拿到红杉投资
- **2024-2025**：陆续支持 Windows / Workspaces / SQLite 内置 / `bun:test` mock API——逐步进入"敢上生产"区间

不像 [[node-runtime]] 是 Ryan Dahl 把 V8 包进 C++ 让前端能写后端的产物，Bun 是"既然要重做一遍，干脆把工具链全打包"的回答。

## 学到什么

1. **一个二进制 = 一条 pipeline**：Node 是 4 个独立工具（runtime / npm / bundler / test runner）用 stdio 串起来；Bun 是 4 个 phase 共享同一个内存里的 AST。**省掉序列化 / IPC / 4 次启动**才是快的真正来源。

2. **选语言 = 选 trade-off**：Zig 没 GC + C ABI 互操作好；Rust borrow checker 严格但 hot path 写起来不直观；Go 简单但性能上限低。Bun 选 Zig 是赌"hot path 优化空间 > 语言成熟度"。

3. **选引擎也是 trade-off**：JSC 启动快但峰值优化弱；V8 启动慢但长跑性能强。**短任务（CLI / 启动）选 JSC，长任务（数据处理）选 V8**。

4. **Web 标准 API 是新世代后端的最大公约数**：Cloudflare Workers / Deno / Bun 都用 `fetch` / `Response`——你写一份代码能在三个 runtime 上跑。这是 Node 的 `http.createServer` 永远做不到的事。

## 延伸阅读

- 官方 docs：[bun.sh/docs](https://bun.com/docs)——产品功能完整清单
- 源码：[github.com/oven-sh/bun](https://github.com/oven-sh/bun)——Zig 写的 lex / parse / bundle / test runner pipeline
- Jarred Sumner 的早期访谈：[ChangeLog Podcast — Bun](https://changelog.com/podcast/512)——讲为什么选 Zig 和 JSC
- [[zig]] —— Bun 的实现语言
- [[esbuild]] —— Bun lexer 的祖先（Go 实现，更易读）

## 关联

- [[zig]] —— Bun 的实现语言；选 Zig 是为 hot path 优化空间
- [[esbuild]] —— Bun 的 lexer fork 自 esbuild，注释都是从 Go 翻成 Zig 的
- [[swc]] —— Rust 阵营的 JS toolchain，与 Bun 是直接竞品
- [[pnpm]] —— `bun install` 的 hardlink 思路与 pnpm 一脉相承，但更激进
- [[node-runtime]] —— Bun 想取代的对象；保持兼容是 Bun 的核心策略

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[deno]] —— Deno — 安全优先的 JS/TS 运行时
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[hono]] —— Hono — 多运行时 Web 框架
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[pnpm]] —— pnpm — 全机器只存一份的 Node 包管理器
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[quickjs]] —— QuickJS — 装进口袋的 JavaScript 引擎
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[vitest]] —— Vitest — Vite 原生测试框架

