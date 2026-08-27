---
title: Nx — 用 project graph 和 native hasher 决定哪些任务要跑
description: 固定版本先构图再按 per-task env 算 hash，默认走数据库本地缓存
来源: https://github.com/nrwl/nx
日期: 2026-08-27
分类: 前端工程化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/nrwl/nx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 82723c9cf1a8d46a3b774d0b977001f2c6c19561
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 23.1.2
---

## 是什么

Nx 是一个 monorepo 构建系统：先画出项目依赖图，再把目标展开成任务图，用 hash 决定复用缓存还是 fork 子进程。日常类比：调度台先看“谁依赖谁”，再只给受影响的工位派活。

固定 23.1.2 的 npm 包是 `nx`，二进制 `nx` / `nx-cloud`。常见入口：

```bash
npx nx build my-app
npx nx affected --target=test --base=main
```

`affected` 根据改动文件找出 touched projects，再沿反向 project graph 扩展；`build` 则直接对指定项目构图并跑目标。

## 为什么重要

不看固定源码，容易把 Nx 说成“带缓存的脚本跑手”：

- 为什么 project graph 协议版本写死为 `6.0`，旧缓存会因版本或根配置变化整图重算
- 为什么 `hashTasks` 必须按任务提供 env，共享一份 `process.env` 可能算错 key
- 为什么默认本地缓存是数据库实现，WASM 路径没有 sqlite
- 为什么 `NX_REJECT_UNKNOWN_LOCAL_CACHE=0` 不再恢复旧的拒绝逻辑

一句话：Nx 的核心合同是 **project graph → task graph → native hash → orchestrator**，不是营销文案里的分布式执行。

## 核心要点

固定版本可以把主链拆成四步：

1. **画 project graph**：插件收集项目配置和文件 map。协议版本 `6.0`。`packageJsonDeps`、`nx.json`、root tsconfig 或 external nodes hash 变化会触发整图重算。
2. **展开 task graph**：`ProcessTasks` 把 project × target 变成任务节点，并沿 `dependsOn` 补依赖。`excludeTaskDependencies` 会丢掉后补的依赖任务。
3. **算 hash**：默认 `NativeTaskHasherImpl` 把图交给 Rust hasher。`hashTasks` 现在要求 `perTaskEnvs[task.id]`；依赖其他任务 outputs 或带 custom hasher 的任务会延后单算。
4. **编排与缓存**：`defaultTasksRunner` 把工作交给 `TaskOrchestrator`。非 WASM 默认 `DbCache`：先查本地 `NxCache`，未命中再 remote retrieve，并按 `task.outputs` 拷回文件。

`affected` 的 locator 包括 workspace 项目、implicit touch、project glob 和 JS touched projects；收集后再反向遍历依赖。

## 实践示例

### 案例 1：只跑受影响项目的目标

```bash
npx nx affected --target=test --base=main
```

**逐部分解释**：

1. `parseFiles` 得到相对 base 的改动文件。
2. 多个 locator 把文件映射成 touched projects。
3. `filterAffected` 沿反向图把下游项目加进来，再只保留拥有 `test` target 的节点。

这是 **git diff + 反向图**，不是 Turborepo 那种“上游 hash 变了下游自动失效”的同一条公式。

### 案例 2：hash 必须带 per-task env

```ts
await hasher.hashTasks(tasks, taskGraph, perTaskEnvs)
```

固定接口把“所有任务共用一份 env”标成遗留签名。各任务若有自己的 `.env` 或 custom hasher 读环境变量，共享 env 会算出错误 cache key。调用方应构造 `{ [task.id]: env }`。

### 案例 3：默认本地缓存是数据库

```ts
getCache(options) // 非 WASM 返回 DbCache
```

`DbCache.get` 先 `cache.get(task.hash)`。本地没有且存在 remote cache 时，才 `retrieve` 并 `applyRemoteCacheResults`。WASM 没有 sqlite，走旧 `Cache`。`NX_REJECT_UNKNOWN_LOCAL_CACHE=0` 只会警告，不会切换回旧拒绝语义。

## 踩过的坑

1. **把源码 `packages/nx/package.json` 的 `0.0.1` 当成发布版本**：那是工作区占位；本页绑定的是 tag / npm `23.1.2`。
2. **以为默认 hasher 还是纯 JS 文件扫描**：固定默认实现是 native hasher。
3. **把 Nx Cloud DTE 写成核心开箱能力**：本轮只审查了 `packages/nx` 的构图、hasher 和 runner，没有读 DTE 实现或计费。
4. **把整图重算说成“改一行 tsconfig 一定 30 秒”**：源码只规定失效条件，没有绑定耗时。

## 适用 vs 不适用场景

**适用**：

- 需要 project graph、affected、generator/executor 和统一 target 合同的中大型 JS/TS monorepo
- 能接受 native 二进制与（非 WASM 下）sqlite 本地缓存
- 愿意按任务准备 env 和 outputs，而不是假设全局 env 一定安全

**不适用**：

- 只要一份 `turbo.json` 调度 npm scripts，不需要 plugin/generator 平台 → 看 [[turborepo]]
- 必须在 WASM 里使用数据库缓存
- 需要把未审查的分布式执行或性能数字写成已验证事实

## 固定版本边界

- 本文绑定 `nrwl/nx@82723c9c...`，npm 包 `nx@23.1.2`。
- npm registry 未提供 `gitHead`；工作区 package version 仍是 `0.0.1`，不以它覆盖 tag。
- 核心包带 `@nx/nx-*` optional native 绑定；WASM 路径缺少 sqlite / `TaskDetails`。
- 本文只做源码静态审查，没有安装依赖、连接 Nx Cloud 或跑 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **affected 是反向图扩展**，和 hash 链式失效是两条不同的“少跑活”公式
2. **cache key 含环境**：共享 env 在 per-project `.env` 场景会错
3. **默认本地缓存已经换实现**：旧的 `NX_REJECT_UNKNOWN_LOCAL_CACHE` 语义不能想当然
4. **图协议版本是显式失效开关**：`6.0` 让旧 graph cache 直接作废

## 应用型自测

1. `hashTasks(tasks, graph, process.env)` 在每个任务都有自己的 `.env` 时，cache key 一定对吗？
2. `NX_REJECT_UNKNOWN_LOCAL_CACHE=0` 能让默认 `DbCache` 拒绝未知本地缓存吗？
3. `nx affected` 只看改动文件本身，还是会沿依赖图扩展？

检查点：

1. 不一定。共享 env 是遗留签名，应按 `task.id` 提供 per-task env。
2. 不能。该变量与数据库缓存不兼容，只打警告。
3. 会扩展。locator 找到 touched projects 后，沿反向 project graph 加入下游。

## 延伸阅读

- 官方文档：[nx.dev](https://nx.dev)
- 固定源码：[nrwl/nx](https://github.com/nrwl/nx) —— 本文绑定提交 `82723c9cf1a8d46a3b774d0b977001f2c6c19561`
- [[turborepo]] —— 更薄的任务图 + 双层缓存，没有本页的 plugin 平台
- [[pnpm]] —— Nx 常用的安装层，不管调度
- [[lerna]] —— 更早的多包发布工具，现已被 Nx 生态收编叙述

## 关联

- [[turborepo]] —— 同赛道、配置更薄的任务编排器
- [[pnpm]] —— workspace 依赖来源
- [[lerna]] —— 发布循环前辈
- [[vite]] —— `@nx/vite` 一类 plugin 会把它包成 executor
- [[jest]] —— 常见 test executor 后端
- [[webpack]] —— 早期默认 bundler 之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[lerna]] —— lerna — 一个仓库发几十个 npm 包的祖宗工具
- [[listr2]] —— listr2 — 把 CLI 任务跑成一棵会自己画进度的树
- [[turborepo]] —— Turborepo — 用任务图和缓存决定哪些活不用再干
