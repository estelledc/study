# Monorepo orchestrator source review (writer AR)

> 用途：记录 Turborepo、Nx 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer AR
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、远程 cache、DTE、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改 `lerna`、`pnpm`、`turbopack`，也未触及开放 PR 已占用的 slug

## Turborepo

- canonical source：`https://github.com/vercel/turborepo`
- revision：`53752d452049bdda47698354b16a83d7ce92ced0`
- package：`turbo@2.10.12`
- tag：`v2.10.12`
- provenance：GitHub tag 与 `packages/turbo/package.json` 版本一致；npm `turbo@2.10.12` 可解析，但 registry metadata 未提供 `gitHead`，以 Git tag / 仓库 package 为准
- inspected：
  - `packages/turbo/package.json`
  - `crates/turborepo-lib/src/run/mod.rs`
  - `crates/turborepo-lib/src/run/builder.rs`
  - `crates/turborepo-lib/src/turbo_json/mod.rs`
  - `crates/turborepo-lib/src/task_hash.rs`
  - `crates/turborepo-lib/src/task_graph/visitor/mod.rs`
  - `crates/turborepo-lib/src/task_graph/visitor/exec.rs`
  - `crates/turborepo-lib/src/opts.rs`
  - `crates/turborepo-engine/src/builder.rs`
  - `crates/turborepo-engine/src/execute.rs`
  - `crates/turborepo-engine/src/lib.rs`
  - `crates/turborepo-cache/src/lib.rs`
  - `crates/turborepo-cache/src/multiplexer.rs`
  - `crates/turborepo-cache/src/cache_archive/restore_regular.rs`
- observed：
  - npm 包名是 `turbo`，二进制 `bin/turbo`，按平台分发 optional native 包；源码实现在 Rust crate，不在 JS 包内；
  - `EngineBuilder` 从 `turbo.json` 与 package graph 构图；package graph 允许环，task graph 的环（含 `^` 穿过 package cycle）会在执行前拒绝；
  - `dependsOn` 的 `^task` 匹配**其他包**的同名任务，`pkg#task` 是精确任务，无前缀则只看当前包；
  - `Engine::execute` 用 Walker 按就绪节点调度；默认用 semaphore 限制并发，`parallel=true` 才放开；
  - 缓存是 `CacheMultiplexer`：本地 FS + 远程 HTTP，产物是 gzipped tarball；`fetch` 先读本地，`put` 可分别开关 local/remote write；两边都关只警告，不因此失败；
  - 默认 cache 目录解析落到 `.turbo/cache`；restore 拒绝经 symlink 写回、Windows 不安全文件名和越出目录的 link；
  - 任务 hash 委托 `turborepo-task-hash`；`Run` 会收集 global file hash、external deps hash 与 internal deps hash；
  - `outputs` 的 inclusions/exclusions 决定打进 tarball 和 restore 的文件；空 inclusions 不会还原产物文件；
  - visitor 会检测 package script 再次调用 `turbo` 形成递归；`futureFlags.globalConfiguration` 把 global deps 前置进每个任务 inputs，而不是只进 global hash。

## Nx

- canonical source：`https://github.com/nrwl/nx`
- revision：`82723c9cf1a8d46a3b774d0b977001f2c6c19561`
- package：`nx@23.1.2`
- tag：`23.1.2`
- provenance：GitHub tag 与 npm `nx@23.1.2` 可解析；registry metadata 未提供 `gitHead`；工作区 `packages/nx/package.json` 仍写 `0.0.1`，发布版本以 tag / npm 为准，不以源码占位 version 为准
- inspected：
  - `packages/nx/package.json`
  - `packages/nx/src/project-graph/project-graph.ts`
  - `packages/nx/src/project-graph/build-project-graph.ts`
  - `packages/nx/src/project-graph/affected/affected-project-graph.ts`
  - `packages/nx/src/command-line/affected/affected.ts`
  - `packages/nx/src/tasks-runner/create-task-graph.ts`
  - `packages/nx/src/tasks-runner/task-orchestrator.ts`
  - `packages/nx/src/tasks-runner/default-tasks-runner.ts`
  - `packages/nx/src/tasks-runner/cache.ts`
  - `packages/nx/src/hasher/task-hasher.ts`
  - `packages/nx/src/hasher/hash-task.ts`
  - `packages/nx/src/hasher/native-task-hasher-impl.ts`
- observed：
  - 核心包同时导出 `nx` 与 `nx-cloud` bin，并带 generator/executor 清单和按平台 optional native 包；
  - project graph 协议版本写死为 `6.0`；`packageJsonDeps`、`nxJson`、root tsconfig 或 external nodes hash 变化会触发整图重算；
  - `affected` 先用若干 locator 收集 touched projects，再沿**反向** project graph 扩展受影响节点，然后把带目标的项目交给 `runCommand`；
  - `ProcessTasks` 把 project × target 展开成 task graph，并沿 `dependsOn` 递归补依赖；`excludeTaskDependencies` 会丢掉后补的依赖任务；
  - 默认 hasher 是 `NativeTaskHasherImpl`（Rust native）；`hashTasks` 现在要求按 `task.id` 提供 per-task env，共享一份 env 是遗留签名，在各任务 `.env` 不同时会算错 cache key；
  - 非 WASM 默认走 `DbCache`：先查本地 `NxCache`，未命中再 `remoteCache.retrieve`，并把结果 `applyRemoteCacheResults`；WASM 没有 sqlite / db cache；
  - `NX_REJECT_UNKNOWN_LOCAL_CACHE=0` 与新数据库缓存不兼容，只打警告，不会恢复旧拒绝逻辑；
  - `TaskOrchestrator` 用 `TasksSchedule` 发离散/批量任务，cache miss hash 本轮只查一次；`nx:noop` 发起任务会展开到真实连续任务，避免子进程被立刻杀掉；
  - 缓存 restore 按 `task.outputs` 拷回文件；空 outputs 意味着没有可还原产物；
  - 本轮只读了 `packages/nx` 的构图 / hasher / runner / cache，没有审查 Nx Cloud DTE 实现或计费。
