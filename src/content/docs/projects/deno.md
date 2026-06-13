---
title: Deno — 安全优先的 JS/TS 运行时
来源: 'https://github.com/denoland/deno'
日期: 2026-06-06
分类: 编译器
子分类: ai-infra
难度: 中级
---

## 是什么

Deno 是一个 JavaScript、TypeScript 和 WebAssembly 运行时，由 Node.js 原作者 Ryan Dahl 于 2018 年重新设计，用 Rust 构建在 V8 引擎和 Tokio 异步库之上。

日常类比：Node.js 就像一把不带刀鞘的瑞士军刀——什么都能干，但任何代码一旦运行就可以随意访问你的文件系统和网络。Deno 则是带刀鞘的版本——刀还是那把刀（V8 引擎），但你得先明确说"我允许它碰网络"，它才能碰。

三个核心特征让 Deno 与 Node.js 根本不同：

- **默认沙箱**：程序启动时没有任何系统权限，访问文件、网络、环境变量都需要命令行显式授权
- **TypeScript 原生**：`deno run foo.ts` 直接跑，不需要 tsconfig.json、不需要 ts-node，底层内置类型检查
- **Web 标准 API**：服务端的 `fetch`、`Request`、`Response`、`WebSocket` 和浏览器里一模一样，一份代码可以浏览器和服务端复用

```ts
// 一行 TypeScript，零配置，直接运行
Deno.serve((_req: Request) => new Response("Hello, world!"));
// deno run --allow-net server.ts
```

## 为什么重要

不理解 Deno 的权限模型，下面这些事都没法解释：

- 为什么 npm 供应链攻击（恶意包写入 `~/.ssh`）在 Deno 里默认不可能发生——没有 `--allow-write` 就写不了文件
- 为什么你可以直接运行陌生人的 Deno 脚本但不害怕——权限提示会拦截任何超出授权的操作
- 为什么 Deno 项目里没有 `node_modules` 目录——依赖通过 URL 或 JSR 注册表按需下载缓存
- 为什么 Deno 代码的 HTTP 吞吐约是同配置 Node.js 的两倍——Rust + Tokio 的底层异步调度比 libuv（Node.js 的底层 I/O 库）更高效

## 核心要点

Deno 的设计可以拆成三个关键决策：

1. **进程级权限白名单**：每个能影响外部世界的操作都被分类——`--allow-net`（网络）、`--allow-read`（文件读）、`--allow-write`（文件写）、`--allow-env`（环境变量）、`--allow-run`（子进程）。可以精细到域名或路径，如 `--allow-net=api.github.com`。类比：就像 iOS 应用申请权限，系统会弹窗问"此应用要访问你的位置"，而不是默默悄悄地访问。

2. **TypeScript 作为一等公民**：Deno 内部集成了 TypeScript 编译器，运行 `.ts` 文件时自动做类型检查和转译，结果被缓存在 `~/.cache/deno`。不需要任何构建步骤。类比：就像 Python 解释器直接支持 `.py`——你不会说"先把 Python 编译成 C 再跑"。

3. **Web 标准优先**：Deno 不发明私有 API，而是实现浏览器规范——`fetch`、`URL`、`crypto`、`TextEncoder` 的行为和 Chrome 一致。这意味着同一段代码可以在浏览器和服务端复用，避免了 `require('node:crypto')` 和 `window.crypto` 的分裂。

## 实践案例

### 案例 1：零配置 TypeScript HTTP 服务器

不需要 `package.json`，不需要 `tsconfig.json`，不需要安装任何包：

```ts
// server.ts
interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  return `Hello, ${user.name}! You are ${user.age} years old.`;
}

Deno.serve({ port: 8080 }, (_req: Request) => {
  const user: User = { name: "Alice", age: 30 };
  return new Response(greet(user), {
    headers: { "content-type": "text/plain" },
  });
});
```

运行命令：

```sh
deno run --allow-net server.ts
# Listening on http://localhost:8080/
```

**逐部分解释**：
- TypeScript 接口 `User` 直接使用，不需要预编译步骤
- `Deno.serve` 是 Web 标准 `Request/Response` 模型
- `--allow-net` 是唯一需要的权限，不加会报 `PermissionDenied`

### 案例 2：精细权限沙箱执行不可信脚本

假设你要运行一个从网上找的数据处理脚本，但不信任它：

```sh
# 只允许读取 /data 目录，只允许连接 api.example.com，其他全部拒绝
deno run \
  --allow-read=/data \
  --allow-net=api.example.com \
  untrusted-script.ts
```

如果脚本尝试写文件或连接其他域名，Deno 会立即抛出异常并打印被拒绝的操作。就像给脚本划定了一块活动区域：区域内的操作自由执行，出了这个区域的任何动作都会被立即拦截——不需要 Linux 内核权限，纯粹靠运行时检查。

```ts
// 如果脚本里有这行，会被权限系统拦截：
await Deno.writeTextFile("/etc/hosts", "bad content");
// Error: Deno.writeTextFile is not allowed
// run again with --allow-write flag to add write access
```

### 案例 3：编译成单个可执行文件

把 Deno 脚本打包成无需安装运行时的独立二进制：

```ts
// cli.ts
const name = Deno.args[0] ?? "world";
console.log(`Hello, ${name}!`);
```

```sh
# 编译为当前平台的可执行文件（这个脚本只读 args，无需权限）
deno compile cli.ts
# 或交叉编译到 Windows（如果脚本需要读文件，则加 --allow-read）
deno compile --target x86_64-pc-windows-msvc --output cli.exe cli.ts

# 运行时不需要安装 Deno
./cli Alice
# Hello, Alice!
```

这特别适合分发命令行工具给不懂 Node/npm 的用户——他们只需要一个二进制文件。

## 踩过的坑

1. **权限标志写漏**：最常见错误是忘加 `--allow-net` 就跑 HTTP 服务器，报 `PermissionDenied`。Deno 会在报错信息里告诉你需要哪个标志，但新手容易一脸懵。解决方法：开发阶段用 `--allow-all`（等价于 `-A`），生产环境再收紧。

2. **npm 包里的 Node.js 专有 API**：`npm:some-package` 前缀可以导入大多数 npm 包，但部分包依赖 `__dirname`、`__filename`、`process.cwd()` 等 Node 全局变量。Deno 2.x 默认不注入这些全局变量，需要加 `--unstable-node-globals` 或用 `import { createRequire } from "node:module"` 做兼容。

3. **ES Modules 与 CommonJS 不兼容**：Deno 只支持 ESM，`require()` 不存在。迁移 CJS 老项目时，所有 `require('./foo')` 必须改为 `import foo from './foo.js'`（注意要加文件扩展名，ESM 规范要求）。

4. **Deno Deploy 的运行时限制**：本地 Deno 和 Deno Deploy（云函数平台）的 API 集合不完全相同——Deploy 不支持 `Deno.run()`（子进程）、不支持文件写入、不支持 `Deno.listen()` 的某些配置。本地跑通的代码部署后可能因为调用了受限 API 而静默失败，务必在 Deploy 文档里确认 API 可用性。

## 适用 vs 不适用场景

**适用**：
- 需要安全执行不可信或第三方脚本的场景（CI 脚本、用户提交的自动化脚本）
- 新项目的 TypeScript 后端服务——零配置启动比 Node + tsc + ts-node 轻量很多
- 边缘计算 / 无服务器函数（Deno Deploy、Cloudflare Workers 兼容接口）
- 需要分发给非技术用户的命令行工具（`deno compile` 输出单二进制）
- 重视供应链安全、需要细粒度控制第三方代码权限的企业场景

**不适用**：
- 重度依赖 Node.js 生态中不兼容 ESM 的老旧 CJS 包（迁移成本高）
- 需要 `Deno.run()` 子进程的代码部署到 Deno Deploy（平台不支持）
- 团队已有大量 Node.js 基础设施且短期无迁移意愿（收益不明显）
- 需要 libuv 特定行为（如 `cluster` 模块）的旧有 Node 多进程架构

## 历史小故事（可跳过）

- **2009 年**：Ryan Dahl 发布 Node.js，带来了事件驱动 I/O，JavaScript 服务端时代开始。
- **2018 年 5 月**：JSConf EU 大会上，Dahl 发表《10 Things I Regret About Node.js》，列出 node_modules 设计、`require` 无扩展名、无默认安全沙箱等十大遗憾，同场宣布 Deno 项目（最初用 Go 实现）。
- **2018 年底**：团队将 Deno 从 Go 重写为 Rust，性能大幅提升，架构更稳健。
- **2020 年 5 月**：Deno 1.0 正式发布，确立权限模型和 TypeScript 原生支持两大设计原则。
- **2023 年**：Deno 2.0 发布，完整兼容 npm 和 Node.js API，从"替代者"定位转型为"升级版"——可以直接运行大多数 Node 项目，同时获得安全沙箱和更好的工具链。

## 学到什么

1. **安全默认比安全选项更有价值**：Node.js 允许你关闭文件系统访问，但默认全开。Deno 反过来——默认全关，需要什么显式开什么。这个"默认安全"的设计原则比任何安全文档都有效。
2. **标准化减少分裂**：Deno 坚持 Web 标准 API（`fetch`、`Request`、`Response`）而不发明自己的 `deno.httpGet`，让代码在浏览器和服务端之间可以复用，也减少了学习新 API 的认知负担。
3. **工具链内置减少配置地狱**：Node 生态需要 eslint、prettier、jest、ts-node、webpack……每个都需要配置。Deno 内置 linter、formatter、test runner、bundler、compiler，`deno.json` 一个文件搞定一切。
4. **重新设计比修补更彻底**：Dahl 没有给 Node.js 打补丁，而是用十年的经验重新构建——这证明有时候最好的技术决策不是迭代，而是重来。

## 延伸阅读

- 演讲视频：[Ryan Dahl — 10 Things I Regret About Node.js (JSConf EU 2018)](https://www.youtube.com/watch?v=M3BM9TB-8yA)（18 分钟，Deno 诞生的第一手背景）
- 官方文档：[Deno 运行时手册](https://docs.deno.com/runtime/manual)（权限模型、TypeScript 配置、标准库全覆盖）
- 官方博客：[Deno 2.0 发布说明](https://deno.com/blog/v2)（完整的 Node.js 兼容性说明和迁移指南）
- 对比参考：[[node-js]] —— 理解 Deno 权限模型，最好先知道 Node.js 的设计思路
- 对比参考：[[bun]] —— 另一个 Node.js 替代者，走的是极致性能路线而非安全优先

## 关联

- [[node-js]] —— Node.js 是 Deno 直接反思的对象，理解两者差异才能理解 Deno 的设计选择
- [[bun]] —— 同为新一代 JS 运行时，Bun 主打速度，Deno 主打安全和标准兼容
- [[wasmtime]] —— 另一个基于 Rust 构建的安全运行时，运行 WebAssembly 而非 JS，权限沙箱设计与 Deno 异曲同工
- [[fastify]] —— Node.js 生态的高性能框架，在 Deno 中可通过 npm: 兼容层使用
- [[pnpm]] —— Node.js 生态的依赖管理工具，Deno 用 JSR/URL 导入替代了 pnpm 管理的 node_modules
- [[actix-web]] —— Rust 写的高性能 Web 框架，与 Deno 的底层 Tokio 运行时共享相同的异步生态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[actix-web]] —— Actix Web — Rust 上长期占据 TechEmpower 榜首的 web 框架
- [[bun]] —— Bun — JS 全能运行时
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[pnpm]] —— pnpm — 全机器只存一份的 Node 包管理器
- [[quickjs]] —— QuickJS — 装进口袋的 JavaScript 引擎
- [[wasmtime]] —— Wasmtime — Bytecode Alliance 标准 wasm runtime

