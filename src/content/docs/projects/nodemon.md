---
title: nodemon — 文件一变就重启子进程的开发监视器
description: 介绍 nodemon 3.1.14 如何用 chokidar 3 监听文件、过滤扩展名，并 fork/spawn 重启子进程。
来源: https://github.com/remy/nodemon
日期: 2026-08-27
分类: 开发工具
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/remy/nodemon
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cfebe2feb2054a13fa6b9c493c1cd826ffccf167
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.14
---

## 是什么

nodemon 是一个开发期进程监视器。日常类比：不是给正在跑的程序换零件，而是听到文件响动后把整台机器关掉再重新点火。

你写：

```bash
npx nodemon ./server.js
```

固定 3.1.14 会解析 CLI / `nodemon.json`，用 `chokidar@^3.5.2` 盯住目录，匹配到扩展名后再 `fork` 或 `spawn` 子进程。它替换的是命令行上的 `node`，不是运行时热替换。本轮只读源码，未实际重启进程，状态保持 `UNVERIFIED`。

## 为什么重要

不理解 nodemon，下面这些事都没法解释：

- 为什么改 TypeScript 或模板后，浏览器刷新了，但 Node 进程里的旧模块还在
- 为什么它绑定的是 chokidar 3，不能把本页和 [[chokidar]] 5 的 glob / ESM 合同混为一谈
- 为什么默认信号是 `SIGUSR2`，而不是你在 shell 里习惯的 `SIGTERM`
- 为什么 `nodemon --inspect app.js` 会走 spawn，而 `nodemon app.js` 可能走 fork

## 核心要点

固定 3.1.14 可以拆成五步：

1. **读配置**：先读家目录 `nodemon.json`，再读 cwd `nodemon.json`，最后叠 CLI。`merge(source, target)` 保留 source 已有键，只补缺失值，所以命令行覆盖文件。

2. **决定脚本与扩展名**：没写脚本时读 `package.json` 的 `main` 或 `scripts.start`。脚本是 `js` / `mjs` / `cjs` 或没有扩展名时，默认监视 `js,mjs,cjs,json`。

3. **架 watcher**：`chokidar.watch(dirs)`。`change` / `unlink` 立刻进入过滤；`add` 只在 `ready` 之后才重启。Windows 设 `disableGlobbing`，IBM i 强制 `usePolling`。

4. **过滤后再重启**：`minimatch` 按 watch / ignore 规则筛路径，再按扩展名过滤。`delay` 会 debounce。通过后 `bus.emit('restart')`。

5. **拉起或杀掉子进程**：`executable === 'node'` 且没有 `spawn`、`inspect`、node flag、`.bin` 包装时走 `child_process.fork`；否则 `sh -c`，Windows 是 `cmd /d /s /c`。默认杀进程树用 `SIGUSR2`。

默认 `restartable` 是字符串 `rs`：stdin 读到这一行会手动重启。退出码 0 会停在“等待变更”；`exitCrash` 才会在 crash 时退出 monitor。

## 实践示例

### 案例 1：最小重启

```bash
npx nodemon ./server.js localhost 8080
```

`bin/nodemon.js` 把 `process.argv` 交给 `cli.parse`，再调用可编程入口。子进程参数会原样传下去。这是重启，不是给 `server.js` 做 HMR。

### 案例 2：可编程 API 与延迟

```js
const nodemon = require('nodemon');

nodemon({
  script: 'server.js',
  ext: 'js,json',
  delay: 1000,
  ignore: ['dist/'],
}).on('restart', (files) => {
  console.log('restart', files);
});
```

`delay` 在 `filterAndRestart` 里做成 debounce。`nodemon.on` 只是把监听器挂到内部 `bus`。`restart` 事件带上匹配到的文件列表。

### 案例 3：手动重启与信号

```bash
# 运行中的终端输入 rs 再回车
# 或向 nodemon 进程发 SIGUSR2（当默认 signal 仍是 SIGUSR2 时，外部重启信号会改成 SIGHUP）
```

`stdin` 与 `restartable` 都打开时，输入 `rs` 会 `bus.emit('restart')`。未以模块方式 require 时，进程还会监听一条对偶信号来调用 `nodemon.restart`。

## 踩过的坑

1. **把 nodemon 说成热更新**：固定实现杀掉子进程再拉起。模块级状态、TCP 端口和未处理连接都按进程生命周期重置。

2. **把本页的 chokidar 5 合同套到 nodemon**：`package.json` 写的是 `chokidar@^3.5.2`。v3 仍接受 glob；v5 已去掉 glob，且要求 Node `>= 20.19.0`。

3. **以为默认杀的是 SIGTERM**：默认 `signal` 是 `SIGUSR2`。Windows 上 `SIGKILL` / `SIGUSR1` / `SIGUSR2` 会走 `taskkill /T /F`。

4. **启动立刻退出码 2**：若发生在 `lastStarted + 500ms` 内，monitor 会当成语法/保留码错误并停止。需要继续盯文件时，源码提示把命令写成 `... || exit 1`。

5. **`NODE_OPTIONS` 带 `--import` / `--loader` 时还想靠默认 `ts-node`**：此时默认 `execMap.ts` 会被删掉，不会自动改用 `ts-node`。

## 适用 vs 不适用场景

**适用**：

- 本地开发 Node 服务，接受“整进程重启”
- 需要 stdin `rs`、事件 hook 或 `nodemon.json` 分层配置
- 目标运行时仍是 Node `>=10`，并能接受 chokidar 3 的监听语义

**不适用**：

- 需要保存模块状态或只换一个文件的热替换
- 生产进程管理、零停机升级或集群编排
- 想直接复用 [[chokidar]] 5 的 ESM / 无 glob 合同
- 把文件事件当业务总线，而不是开发期重启信号

## 固定版本边界

- 本文绑定 `remy/nodemon@cfebe2fe...`，npm / GitHub tag 均为 `3.1.14`。
- 仓库内 `package.json#version` 是 `0.0.0-development`；对外版本以 npm 与 `v3.1.14` 为准。
- 监听依赖是 `chokidar@^3.5.2`，不是本轮的 `chokidar@5.0.0`。
- 本文未安装依赖、未跑 mocha、未真正 fork 子进程，状态保持 `UNVERIFIED`。

## 学到什么

1. **监视器和热替换不是同一件事**——nodemon 的合同是杀进程，不是替换模块。
2. **默认信号也是 API**——`SIGUSR2`、stdin `rs` 和 `delay` 都会改变重启时机。
3. **依赖版本必须分开读**——宿主 3.1.14 仍停在 chokidar 3，不能用 5 的 README 反推。
4. **fork 与 spawn 有明确开关**——`inspect`、node flag 和 `.bin` 包装都会迫使它走 shell。

## 应用型自测

1. `nodemon --inspect server.js` 在固定 3.1.14 里会走 `fork` 吗？
2. 子进程以退出码 0 结束，nodemon 会立刻再拉起一次吗？
3. 把本页的 `chokidar.watch('**/*.js')` 例子直接当成 nodemon 内置监听器的行为，对吗？

检查点：

1. 不会。`firstArg === 'inspect'` 时 `shouldFork` 为假，走 spawn。
2. 不会。干净退出会等待下一次文件变更。
3. 不对。nodemon 3.1.14 用的是 chokidar 3；chokidar 5 已不再把 glob 当 watch 路径。

## 延伸阅读

- 文档：[nodemon.io](https://nodemon.io)
- 固定源码：[remy/nodemon](https://github.com/remy/nodemon) —— 本文绑定提交 `cfebe2feb2054a13fa6b9c493c1cd826ffccf167`
- [[chokidar]] —— 文件事件库；本轮审查的是 5.0.0，与 nodemon 依赖的 3.x 不同
- [[node-js]] —— `fork` / `spawn` / `fs.watch` 的运行时底座

## 关联

- [[chokidar]] —— nodemon 3.1.14 的监听依赖仍是 3.x
- [[node-js]] —— 子进程与文件系统监视都建立在 Node 上
- [[unstorage]] —— fs driver 也提到过 chokidar，但是另一条业务 watch 路径
