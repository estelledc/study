---
title: concurrently — 给并行命令加前缀、成功条件和杀进程规则
description: 用 RxJS 命令流并行跑任意 shell 命令，并按退出时间决定成功、重启与互杀
来源: https://github.com/open-cli-tools/concurrently
日期: 2026-08-27
分类: CLI / 命令行工具
难度: 入门
difficulty: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/open-cli-tools/concurrently
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1b8cbeba87497e0c2a29097c828276919935a217
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.0.5
---

## 是什么

concurrently 是一个把多条 shell 命令**同时拉起来**，再给每条输出加前缀、按规则决定整组成败的 Node 工具。日常类比：你不是自己在三个终端窗口里敲 `npm run watch`、`npm run server`、`npm run proxy`，而是请一个调度员同时按铃，并在其中一个人离开时决定要不要把其他人叫走。

固定 10.0.5 是 ESM-only，要求 Node `>=22`。命令行入口是 `concurrently` / `conc`，程序入口从 `dist/lib/index.js` 导出。你写：

```bash
npx concurrently "npm run watch" "npm run serve"
```

或用快捷写法把 `npm:` 展开成 `npm run`：

```bash
npx concurrently "npm:watch" "npm:serve"
```

两条命令各自 spawn，stdout/stderr 被收集后加上颜色前缀；默认必须**全部**以退出码 0 结束，整组才算成功。

## 为什么重要

不读固定版本的成功条件与 flow controller，下面这些事都没法解释：

- 为什么 `--success first` 看的是**最先退出**的那条，不是写在最前面的那条
- 为什么 `--kill-others` 和 `--kill-others-on-fail` 杀的时机不一样
- 为什么 `npm:watch-*` 能展开成多条脚本，而 `make *` 不会
- 为什么默认重启次数是 0，写成负数却变成一直重启

## 核心要点

固定版本的执行链可以拆成五步：

1. **规范化命令**：CLI 先剥掉成对引号，再走 `ExpandShortcut`（`npm:` / `pnpm:` / `yarn:` / `bun:` / `node:` / `deno:`）和 `ExpandWildcard`。通配只对 `npm|yarn|pnpm|bun run`、`node --run`、`deno task` 生效，读取当前目录 `package.json` 或 Deno task 文件。

2. **包成 Command**：每条命令有自己的 RxJS `close` / `stdout` / `stderr`。spawn 的 shell 顺序是显式 `--shell` → 环境变量 `npm_config_script_shell` → Windows 的 `cmd.exe` / 其他平台的 `/bin/sh`。

3. **套 flow controller**：公开 API 固定挂上日志、输入转发、信号、`RestartProcess`、`KillOthers`、输出错误、计时和 `Teardown`。它们按顺序 `handle()`，后挂的控制器能用 Proxy 改写 `close` 流。

4. **限流启动**：`maxProcesses` 未设或为 0 时一次拉起全部；写成 `50%` 时按 CPU 数取整。某条退出后再从队列补下一条。

5. **按成功条件收口**：`CompletionListener` 等所有已 spawn 命令离开 `started`，把 close 事件按 `endDate` 排序，再评估 `all` / `first` / `last` / `command-*` / `!command-*`。全部被 abort 且没有任何 close 事件时，固定实现视为成功。

## 实践示例

### 案例 1：开发时并行 watch + serve

```json
{
  "scripts": {
    "watch": "node scripts/watch.mjs",
    "serve": "node scripts/serve.mjs",
    "dev": "concurrently --names watch,serve --prefix-colors auto \"npm:watch\" \"npm:serve\""
  }
}
```

`--names` 给前缀，`--prefix-colors auto` 是默认值。`npm:watch` 会被展开成 `npm run watch`，命令名默认取脚本名。

### 案例 2：一条失败就杀掉其余

```bash
npx concurrently --kill-others-on-fail \
  "npm run lint" \
  "npm run typecheck"
```

`--kill-others-on-fail` 只在某条以非 0 退出时向其余进程发信号（默认 `SIGTERM`，可用 `--kill-timeout` 再补 `SIGKILL`）。`--kill-others` 则在**成功或失败**第一次退出时都杀。杀进程走 `tree-kill`，不是只杀直接子进程。

### 案例 3：只关心最后退出的那条

```bash
npx concurrently --success last \
  "sleep 1 && exit 1" \
  "sleep 2 && exit 0"
```

固定文档和源码都按**退出时间**排序。这里后睡的那条最后退出且码为 0，整组成功；不要把它理解成“命令行里写在后面的那条”。

## 踩过的坑

1. **把 `first` / `last` 当成声明顺序**：close 事件先按 `endDate` 排序。谁先结束谁就是 `first`。

2. **以为任意命令都能 `*` 展开**：通配解析器只认包管理器 / `node --run` / `deno task`。`echo *` 仍是一条 shell 命令。

3. **默认会自动重启**：`restartTries` 默认 0。要无限重启必须把 `--restart-tries` 写成负数，此时内部变成 `Infinity`。

4. **teardown 会影响退出码**：`teardown` 在收口后执行，不带前缀，也不改 concurrently 自己的 0/1。

5. **npm latest 没有 `gitHead`**：10.0.5 的 GitHub tag 与 `package.json` 版本一致，但 npm 元数据没给 `gitHead`；升级前要重新核 tag。

## 适用 vs 不适用场景

**适用**：

- 本地同时跑 watch、dev server、mock、代理这类任意 shell 命令
- 需要彩色前缀、分组输出、重启或“一人走全员撤”的开发脚本
- 已经在用 npm / pnpm / yarn / bun / `node --run` / `deno task`，想用 `npm:foo-*` 展开一组脚本

**不适用**：

- 只想按 `package.json` 的脚本名做 glob，并且要串行 + 并行混排 → [[npm-run-all]]
- 需要跨包缓存和任务图 → [[turborepo]] / [[nx]]
- 运行时低于 Node 22，或必须 CommonJS `require("concurrently")`
- 要把静态阅读写成真实并行压测或 Windows 信号语义——本轮未跑上游测试

## 固定版本边界

- 本文绑定 `open-cli-tools/concurrently@1b8cbeba...`，GitHub tag 与 package 均为 `10.0.5`。
- npm 把 10.0.5 标为 latest，但未提供 `gitHead`；本轮以可达 tag 提交为准。
- 生产依赖包含 `rxjs@7.8.2`、`yargs@18.0.0`、`tree-kill@1.2.2`、`chalk@5.6.2`。
- 本文未安装依赖、未 spawn 真实子进程、未跑 Vitest，状态保持 `UNVERIFIED`。

## 学到什么

1. **并行工具的合同在收口，不在启动**——谁先退出、算不算成功、要不要互杀，比“一起 spawn”更决定脚本能不能进 CI。
2. **成功条件按时间排序**——`first` / `last` 是 close 事件的时间顺序，不是 argv 顺序。
3. **通配是包管理器语法，不是 glob 文件系统**——只有识别出的 run/task 前缀才会读 `package.json`。
4. **控制器链可以改写观测**——`RestartProcess` 用 Proxy 替换 `close`，让后面的成功判断看不到中间失败。

## 应用型自测

1. `concurrently --success first "sleep 2 && exit 0" "exit 1"` 整组会成功吗？
2. 未写 `--restart-tries` 时，子进程以码 1 退出会自动再拉起吗？
3. `concurrently "echo *"` 会不会按当前目录文件展开成多条命令？

检查点：

1. 不会。`exit 1` 先结束，`first` 看这条的退出码。
2. 不会。默认 `restartTries` 为 0。
3. 不会。通配只处理 `npm run` / `node --run` / `deno task` 这类前缀。

## 延伸阅读

- 固定源码：[open-cli-tools/concurrently](https://github.com/open-cli-tools/concurrently) —— 本文绑定提交 `1b8cbeba87497e0c2a29097c828276919935a217`
- 成功条件说明：仓库 `docs/cli/success.md`
- [[npm-run-all]] —— 同一赛道的 npm-scripts 感知调度器，默认串行
- [[just]] —— 文件里写 recipe，不负责给并行输出加前缀

## 关联

- [[npm-run-all]] —— 对照：脚本名 glob + 串行/并行组，对任意 shell 命令无感
- [[just]] —— 对照：跨语言 recipe，不做增量，也不做彩色前缀
- [[task]] —— YAML taskfile，另一条“项目命令清单”路线
- [[turborepo]] —— monorepo 任务图和缓存，不是单包并行 spawn

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
