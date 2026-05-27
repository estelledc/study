---
title: "Bun — 全栈运行时的另一条路"
description: 一个二进制 = runtime + bundler + test runner + package manager，性能优先 vs Node 兼容优先的判断分水岭
sidebar:
  order: 21
  label: "oven-sh/bun"
---

> oven-sh/bun v1.4.0（2026-05），MIT。
> Zig + JavaScriptCore（不是 V8）。
>
> Bun 不是"更快的 Node"——它是**对"JS 工具应该长什么样"的另一种回答**。
> Node 是 2009 年生的，运行时和工具链分离（npm、jest、webpack 各管一摊）。
> 这是一个时代正确的设计——但今天每多一个工具就多一份配置 + 兼容成本。
>
> Bun 的判断：**整体大于部分之和**。
> 一个二进制 = runtime + bundler + test runner + package manager + script runner。
> Season 3 第三篇。

## 一句话定位

**Bun = 一个用 Zig 写的、嵌入 JavaScriptCore（Safari 的 JS 引擎）的、内置全套工具链的 JS runtime。**
`bun run` / `bun install` / `bun test` / `bun build` 一个二进制全包。
对标 Node + npm + jest + webpack（4 件套）。

## Why（为什么是它而不是 Node / Deno）

Node + 工具链的现实问题：

```
node --version     20.x
npm --version      10.x       ← 独立项目
jest --version     29.x       ← 独立项目（依赖 babel + ts-jest）
webpack            5.x        ← 独立项目（依赖 babel + ts-loader）
```

启动一个项目要装 100+ 个 npm 包，**绝大部分是工具链自身的依赖**——
不是你的业务代码。

每个工具的启动开销叠加：
- `npm install`：30 秒到 5 分钟
- `jest`：每次跑要 babel 转译 → 5 秒起步
- `node` / `tsx` 跑 TS：要 ts-node 或 swc → 又要装包

Bun 的回答：**工具链是运行时的内置功能**。

```
bun --version           1.4.0
bun install npm-pkg     ← 内置 package manager
bun test                ← 内置 test runner（Jest 兼容）
bun build app.tsx       ← 内置 bundler
bun run app.ts          ← 直接跑 TS，没中间环节
```

| 工具 | 入口 | 装多少包 | 启动 | TS 支持 |
|---|---|---|---|---|
| **Node + 全家桶** | `node` + 4-5 个 CLI | 几百个 | 各自慢 | 要装 |
| **Deno** | `deno` 单二进制 | 0 | 快 | 内置 |
| **Bun** | `bun` 单二进制 | 0 | 极快 | 内置 |

**为什么不是 Node**：Node 不会消失。但**新项目用 Node 已经不是默认选择**——
如果不是为了"必须兼容老服务器"，Bun / Deno 是更合理的起点。

**为什么不是 Deno**：Deno 是 Node 作者 Ryan Dahl 的回答（2018），
设计上更"理想化"——默认不能访问文件系统、ESM-only、TS 内置。
但 Deno 早期反 Node 太彻底，导致**生态分裂**——npm 包不能直接用。
Deno 2 才妥协回 npm 兼容。

Bun 反过来：**最大化 Node 兼容**（CommonJS、`require`、process.env、所有 npm 包），
然后在底层换引擎 + 加性能。**先兼容、再创新**。

**Bun 的判断分水岭**：
- 走"性能优先"——用 JavaScriptCore（性能更好的某些场景）+ Zig（无 GC 压力）
- 走"all-in-one"——一个 binary 替代 5 个工具
- 走"Node 兼容"——给迁移成本一个解
- 不走"理论纯净"（如 Deno）——务实超过纯净

**Bun 的代价**：
- JSC 不是 V8——某些极端情况兼容性差异
- Zig 写的——社区贡献门槛高
- 仍在追兼容——少数 Node native 包跑不动

## 仓库地形

```
bun/
├── src/                              ← Zig 源码
│   ├── bun.zig                       ← 入口
│   ├── api/                          ← Bun.* JS API
│   ├── ast/                          ← JS/TS parser（移植自 esbuild）
│   ├── bundler/                      ← bundler 实现
│   ├── bundler_jsc/                  ← JSC 集成
│   ├── boringssl/                    ← TLS（用 BoringSSL，不用 OpenSSL）
│   ├── brotli/                       ← 压缩
│   ├── http/                         ← HTTP 实现
│   ├── runtime/                      ← runtime 内置模块（fs、path 等）
│   ├── install/                      ← npm install 实现
│   └── test/                         ← test runner
├── docs/
│   └── runtime / bundler / pm / test ← 模块化文档
├── bench/                            ← 基准测试
├── completions/                      ← shell 补全
└── packages/                         ← npm 上的 wrapper
```

**心脏文件**——这次没有"3 个文件读完核心"的体验。Bun 是巨型项目（14000+ 文件），
Zig 又不是大多数读者熟悉的语言。**这一篇笔记的重点是设计判断而不是源码精读**。

## 核心机制 · Layer 3 精读

### 机制 1 · JavaScriptCore vs V8 — 引擎选择的判断

Node / Deno 都用 V8。Bun 选了 **JavaScriptCore**（JSC，Safari 的引擎）。

**为什么**：

1. **启动更快**：JSC 的解释器 + JIT 设计偏向"快速启动 + 渐进优化"，V8 偏向"先慢后快"
2. **API 更适合嵌入**：JSC 的 C++ embedder API 比 V8 的更稳定、更小
3. **内存占用更低**：JSC 在长尾场景的内存峰值更低（虽然 V8 在峰值算力上仍领先）

**代价**：
- V8 生态成熟得多（DevTools 协议、profiler 工具）
- JSC 在某些热点代码上 JIT 不如 V8
- npm 上的某些 native binding 是为 V8 写的，要适配

→ 这是工程师做"基础选择"时的判断范例：**清楚的成本和收益，主动选符合产品定位的那个**。

### 机制 2 · Zig 替代 C++ —— 工具链编程语言的取舍

Bun 是 **Zig 写的**（不是 C++ 也不是 Rust）。

Zig 是一门偏底层的语言（2016 出现），定位介于 C 和 Rust：

- 比 C 安全（comptime 检查、optional 类型）
- 比 Rust 简单（不强制 borrow checker，runtime 错误而不是编译错误）
- 比 C++ 现代（无遗产负担）

**为什么不用 Rust**：
- Rust 的 borrow checker 让 hot path 写起来不直观
- Bun 团队规模有限，Rust 学习曲线让人难招
- Zig 在 SIMD、内存对齐等"性能极限"操作上更顺手

**代价**：
- Zig 1.0 还没发布（2026 年还在 0.x），语言本身在变
- 社区比 Rust 小一个数量级，库少
- 对潜在贡献者门槛更高

→ Bun 团队的技术选择判断：**重要的是产品体验，不是社区流行度**。
swc 选 Rust，esbuild 选 Go，bun 选 Zig——三个项目都对，因为各自优化目标不同。

### 机制 3 · 单二进制 + 零依赖 —— 安装即用

Node 安装：`brew install node` → 装一个引擎。要工具链还得`npm install -g jest webpack` 等等。

Bun 安装：`curl -fsSL https://bun.sh/install | bash` → 一个 80MB 的二进制，**全部功能**。

```bash
bun --version    # runtime
bun install x    # package manager
bun test         # test runner
bun build app.ts # bundler
bun run app.ts   # script runner
bun init         # scaffold
bun create app   # template runner
```

→ 这是**面向用户体验的根本判断**：用户不应该被工具碎片化困扰。

类比：iPhone 是"手机 + iPod + 浏览器" 三合一。Bun 是"runtime + tools" 多合一。
**整合的产品体验复利**会击败"各自最强但需要拼装"的组合。

### 机制 4 · `Bun.serve()` —— 不是 Express，是更原生的 HTTP

Node 标准 HTTP API 很底层。社区用 Express / Fastify / Koa 包装。

Bun 提供 `Bun.serve()`：

```typescript
Bun.serve({
  port: 3000,
  fetch(req) {
    if (req.url.endsWith('/api/users')) {
      return Response.json({ users: [...] })
    }
    return new Response('Hello!')
  }
})
```

**注意**：参数对象**直接接 fetch handler**——和 Cloudflare Workers / Deno Deploy 同 API。
这是"标准 web platform" 思路：runtime 应该和浏览器、edge、Service Worker
**用同一份 API**。

→ 这是**生态对齐**的判断。Express 风格的 API 是 Node 时代的产物；
今天写 server 的工程师可能也写 Worker、Vercel Edge——
**同 API 跨环境**降低认知负担。

### 机制 5 · `bun install` 比 npm 快 30x 的来源

测试 React 全家桶 install：
- `npm install`：~25s
- `pnpm install`：~10s
- `bun install`：~1s（缓存命中）/ ~3s（首次）

为什么这么快：

1. **全局 cache**：npm 也有 cache，但每次都要 verify。Bun 用 hardlink + 文件系统 trust
2. **并行下载**：Bun 的 fetch 是 Zig 实现的并发模型，比 Node 的事件循环效率高
3. **跳过 node_modules 的 trust 检查**：npm 每次 install 都要重建 dependency tree。Bun 用 lockfile 直接 layout
4. **二进制 lockfile**：`bun.lockb` 是二进制格式，比 `package-lock.json` 解析快
5. **不跑 lifecycle scripts**（默认）：npm 默认跑 `postinstall`，Bun 默认不跑（安全 + 速度）

→ 这些**单独看每条都不爆炸**。但**叠加起来就是 30x**。
和 esbuild 一样，性能不是单点优化，是**每个微观决策的累积**。

### 机制 6 · `bun test` —— Jest 兼容但没有 babel 链

```typescript
import { test, expect } from 'bun:test'

test('addition', () => {
  expect(1 + 1).toBe(2)
})
```

API 完全 Jest 兼容（`describe` / `it` / `beforeAll` / `mock.fn()` 都支持）。
但跑得起来不需要：
- babel
- ts-jest
- jest 配置
- node-environment / jsdom 选择

**Bun 内置全部**。`bun test` 就是 `bun.exe` 的一个子命令。

→ 这就是"all-in-one" 的力量：**用户写的测试不变，启动开销 / 配置成本归零**。

### 机制 7 · `Bun.file()` 和 `Bun.write()` —— 重新定义 fs

Node 的 `fs.readFile` 是 Node 1.0 时代的 API：callback / Promise / sync 三个版本，
没有 lazy 概念。

```typescript
// Node
const data = await fs.promises.readFile('foo.txt', 'utf-8')

// Bun
const text = await Bun.file('foo.txt').text()       // ← lazy reference
const json = await Bun.file('foo.txt').json()       // ← 一行 JSON parse
const buf  = await Bun.file('foo.txt').arrayBuffer()
```

`Bun.file()` 返回的不是文件内容，是**一个 lazy 引用**——你调 `.text()` 才真读。
和浏览器 `Blob` API 同源——又是"web platform alignment"的体现。

## 横向对比

### vs Node — "完全兼容 + 性能加速"

兼容点：
- `package.json` 直接用
- `node_modules` 直接用
- `process.env` / `__dirname` / `require` 都能用
- npm 上 95% 包能直接 import

差异点：
- Bun 内置 web API（`fetch` / `WebSocket` / `URL`）—— Node 这些是后加的
- Bun 默认 TypeScript / JSX —— Node 要 ts-node
- Bun 内置 SQLite （`bun:sqlite`）—— Node 要装 better-sqlite3
- Bun 启动快很多（small script 30ms vs Node 80ms）

如果你做新项目 + 现代浏览器 + 想要 web API → Bun。
如果你做长期维护的服务 + 已有大量 Node native 模块 → Node 仍然是默认。

### vs Deno — 哲学差异

Deno 是 Ryan Dahl 对"Node 设计错了什么"的回答：
- 默认沙箱（要权限才能访问 fs / network）
- 强制 ESM
- TS 内置
- 不用 npm（用 URL import）—— 后来妥协

Bun 的回答：**Node 没设计错，只是过时了**。最大化兼容、补强短板、加速性能。
**务实派**。

如果你信仰"安全 + 标准"——Deno 更合心意。
如果你要"今天就能用 + 不重新学一套生态"——Bun 更合心意。

### vs tsx / ts-node — 都是"直接跑 TS"

`tsx` 是 esbuild 包装，让 Node 直接跑 TS。
Bun 内置 TS，**不需要 tsx**。

但 tsx 是 Node 时代的解决方案。如果你切到 Bun，就不需要 tsx 了。
**Bun 是更上游的解**。

## Hands-on（5 分钟内能跑）

```bash
curl -fsSL https://bun.sh/install | bash
# 或：brew install oven-sh/bun/bun

bun --version
bun init                      # 创建项目
bun install                   # 装依赖
bun add zod                   # 加包
bun run --watch index.ts      # 跑（watch 模式）
bun test                      # 跑 Jest 兼容测试
bun build index.ts --outdir ./dist  # 打 bundle
```

写一个 `server.ts`：

```typescript
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/health') {
      return Response.json({ ok: true, ts: Date.now() })
    }
    return new Response('Hello from Bun!')
  }
})
console.log(`Listening on :${server.port}`)
```

```bash
bun run server.ts
# 在另一个终端
curl http://localhost:3000/health
```

### 改一处的实验（必做）

启动 Bun + Node 各一个 server，用 `wrk` benchmark：

```bash
# Bun
bun run server.ts &
wrk -t8 -c100 -d10s http://localhost:3000/health

# Node 同样代码（用 http.createServer）
node server.js &
wrk -t8 -c100 -d10s http://localhost:3000/health
```

通常 Bun 会快 3-5 倍。**亲手跑一次**，从此对"runtime 选择"有具体感受。

第二个实验：跑一个有 100+ npm 依赖的项目，用 npm install 和 bun install 各跑一遍，
体感差距比数字更直接。

## 与你工作的连接

**能立刻迁移**：

- 任何**新项目**用 Bun 起步（速度 + 单二进制 + 现代 API）
- 给 LLM agent / MCP server 用 Bun 部署：启动快对短任务很关键
- 内部工具的 CLI 用 Bun 写（启动 30ms vs Node 80ms 用户感知有差）

**下个月可能用到**：

- 给 Claude Code skill 写 backend——Bun + Hono 是事实标准
- 数据库脚本：Bun + bun:sqlite 不需要 better-sqlite3 的 native 安装

**不要用 Bun 的部分**：

- **生产环境长跑服务 + 99.99 SLA**——Node 仍是更稳的选择，社区运维经验多 5 年
- **依赖某个特定 Node native 模块**（如 sharp 的某些 patch）——可能跑不动
- **公司有强 Node-only 标准**——别为了快推翻审计

## 读完你能做之前做不了的事

- **判断**：选新项目运行时时，能用"兼容 / 性能 / 生态 / 团队熟悉度"四维评估
- **设计**：考虑工具链整合时，能想到"all-in-one vs best-of-breed" 的取舍
- **解释**：被问"V8 和 JSC 有什么区别"时能说出几条具体差异
- **下钻**：看懂 runtime 设计——Bun / Deno / Cloudflare Workers / Edge runtimes 的共性
- **对照**：识别"我这个 Node 项目能不能切 Bun"——以及切了的真实代价

## 自检 · 5 个问题

1. Bun 选 Zig 而不是 Rust 写。从工程团队角度看，这个决定的潜在风险是什么？
2. JavaScriptCore 在某些热点代码 JIT 不如 V8——你怎么 benchmark 你自己的项目对比 Node 跑 Bun 的实际差距？
3. `Bun.serve` 的 `fetch(req) => Response` API 和 Cloudflare Workers / Deno Deploy 一致。
   这种"web platform alignment"对开发者经验的复利效应是什么？
4. `bun install` 用二进制 lockfile（`bun.lockb`）。这有什么好处？又有什么 git workflow 上的代价？
5. 如果你的团队 Node 用了 5 年，运维成熟，要不要切 Bun？
   写一个"什么场景切 / 什么场景不切"的判断框架。

## 延伸阅读

读完这篇笔记后下一步：

1. [Bun 官方 docs](https://bun.com/docs)——产品功能完整清单
2. [Bun blog](https://bun.com/blog)——团队对设计决策的解释（"why we chose JSC" 等）
3. **Deno vs Bun** 对比文章——理解两个项目的哲学差异
4. **JavaScriptCore vs V8** 对比（WebKit 团队 / V8 团队各自博客）
5. **Zig 语言**官方文档——理解 Bun 的实现栈

---

**笔记完成**：2026-05-27（v1.4.0）
**研究方法**：本地克隆 + 阅读 docs/index.mdx + 设计判断分析（不精读 Zig 源码）
**心脏文件**：`docs/index.mdx` + `src/api/`（Bun.* JS API 接口设计）
