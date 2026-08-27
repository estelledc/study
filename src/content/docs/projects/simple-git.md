---
title: simple-git — 把系统 git 收成可链式 Promise
description: Node 对系统 git 的 Promise 包装：链式排队、并发调度，并默认拦截危险参数。
来源: https://github.com/steveukx/git-js
日期: 2026-08-27
分类: Git 库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/steveukx/git-js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 01bb7ceae698831e9abd9310f7d61484970ab53c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.36.0
---

## 是什么

simple-git 是 Node 里对系统 `git` 二进制的 Promise 包装：工厂返回一个可链式对象，每个方法最终 `spawn` 一条命令，再把 stdout/stderr 交给任务 parser。日常类比：它不是自己实现仓库格式，而是给你一个会排队、会限流、会挡危险参数的遥控器。

```js
import { simpleGit } from "simple-git"

const git = simpleGit()
await git.add(".")
await git.commit("pin the review")
```

固定 `simple-git@3.36.0` 在 monorepo `steveukx/git-js` 的 tag `simple-git@3.36.0` / `01bb7ceae6...`，与 npm `gitHead` 一致。包目录是 `simple-git/`。发布出口：`import` → `dist/esm/index.js`，`require` → `dist/cjs/index.js`。运行时依赖包括 `debug`、`@kwsites/file-exists`、workspace 包 `@simple-git/argv-parser` 与 `@simple-git/args-pathspec`。

## 为什么重要

不理解「链式 thenable + 子进程插件」这条合同，下面这些事会对不上：

- 为什么 `simpleGit('/missing')` 在第一次命令之前就抛 `GitConstructError`
- 为什么 README 示例写 `maxConcurrentProcesses: 6`，源码默认却是 `5`
- 为什么 `git.addRemote(...)` 里塞 `--upload-pack` 会被默认拦截
- 为什么 `.commit().push()` 共用一条 chain，而两次独立 `git.commit()` 只受调度器并发上限约束

## 核心要点

主链可以拆成五步：

1. **工厂先验目录**：`gitInstanceFactory` 用 `createInstanceConfig` 合并选项，默认 `binary: 'git'`、`maxConcurrentProcesses: 5`、`config: []`、`trimmed: false`、`baseDir: process.cwd()`。`baseDir` 不存在就抛 `GitConstructError`。
2. **方法返回 thenable 代理**：`_runTask` 向 `executor.chain()` 推任务，再 `Object.create(this, { then, catch, _executor: chain })`。`.add().commit()` 共享同一条 `GitExecutorChain`；单独 `await git.status()` 走默认 chain。
3. **真正执行是 spawn**：`GitExecutorChain` 先 `scheduler.next()` 拿到并发名额，再让插件改 `spawn.binary` / `spawn.args` / `spawn.options`，最后 `child_process.spawn`。默认 `windowsHide: true`。
4. **完成检测不是单事件**：`completionDetectionPlugin` 默认 `onClose=true`、`onExit=50`——`close` 立刻收束，`exit` 再等 50ms；两者赛跑。注释写明 v3 计划改成只信 `close`，固定 3.36.0 还没改。
5. **危险参数默认拒绝**：`blockUnsafeOperationsPlugin` 调用 `@simple-git/argv-parser` 的 `vulnerabilityCheck`。`allowUnsafePack`、`allowUnsafeSshCommand`、`allowUnsafeHooksPath` 等必须显式打开。`commit` 任务自己会先插 `-c core.abbrev=40`。

## 实践示例

### 案例 1：工厂与选项

```ts
import { simpleGit, SimpleGitOptions } from "simple-git"

const options: Partial<SimpleGitOptions> = {
  baseDir: process.cwd(),
  binary: "git",
  maxConcurrentProcesses: 5,
  trimmed: false,
}
const git = simpleGit(options)
```

第一个参数可以是路径字符串或选项对象。`binary` 也可以是 `['wsl', 'git']` 这种二元组：第一段当可执行文件，第二段当前缀参数。字符集被限制为路径安全字符，除非 `unsafe.allowUnsafeCustomBinary`。

### 案例 2：链式提交与并发

```js
const git = simpleGit()
await git.add("README.md").commit("document the pin")
await Promise.all([git.status(), git.log()])
```

`add().commit()` 共用一条 chain，严格串行。两次独立调用走同一个 `Scheduler`：默认最多 5 个并发子进程。某一任务 fatal 时，该 chain 被重置为 `Promise.resolve()`，队列标 fatal，后续同链任务不会接着脏状态跑。

### 案例 3：超时与中止

```js
const ac = new AbortController()
const git = simpleGit({
  abort: ac.signal,
  timeout: { block: 10_000 },
})
ac.abort()
```

`timeout` 是空闲超时：stdio 有数据会重置计时，默认同时看 stdout/stderr。`abort` 在 `spawn.before` 检查已触发信号，在 `spawn.after` 监听 `abort` 并 `SIGINT` 子进程。二者抛出的都是 `GitPluginError`。

## 踩过的坑

1. **把 README 的 `maxConcurrentProcesses: 6` 当默认**：`simple-git-options.ts` 写死 `5`。6 只是文档示例。
2. **目录还不存在就 `simpleGit(path)`**：构造期检查 `folderExists`，不会替你 `mkdir`。
3. **`git.silent(true)` 还能关日志**：该方法只入队一条 deprecation 警告，日志改走 `debug` / `DEBUG`。
4. **用户输入直接进 `raw` / `addRemote`**：`--upload-pack`、`ext::`、自定义 `core.sshCommand` / `core.hooksPath` 默认会被挡住；要放行必须对应 `unsafe.*`。
5. **当成纯 JS git**：没有系统 `git` 就没有实现。浏览器或不想安装 git 的环境看 [[isomorphic-git]]。

## 适用 vs 不适用场景

**适用**：

- Node 服务、脚本、CI，本机或镜像里已经有 git
- 需要完整 porcelain：submodule、rebase、credential helper、hook
- 希望 API 既能 `await` 也能 `.add().commit()` 链式排队

**不适用**：

- 浏览器 / Workers，或不能安装 git 二进制
- 要把 git 对象层嵌进自己的 VFS——那是 [[isomorphic-git]]
- 未审查用户字符串当 git 参数，又不肯读 `unsafe` 开关
- 把未实测吞吐或「轻量」广告当合同

## 固定版本边界

- 本文绑定 `steveukx/git-js@01bb7ceae698831e9abd9310f7d61484970ab53c`，tag `simple-git@3.36.0`，npm `simple-git@3.36.0` 的 `gitHead` 一致。
- 同提交里 `simple-git/package.json` 报 `3.36.0`；workspace `@simple-git/argv-parser` 仍是 `1.1.0`。仓上后来有 `@simple-git/argv-parser@1.1.1`，未绑定。
- 许可 MIT。需要能在 `PATH`（或 `binary`）里调到 `git`。
- 本文未安装依赖、未 spawn 真实 git、未跑上游 Jest，状态保持 `UNVERIFIED`。

## 学到什么

1. **包装器的正确性依赖宿主 git**——API 稳定不等于协议实现稳定。
2. **链式与并发是两套队列**——thenable 代理管串行，Scheduler 管跨调用上限。
3. **默认安全策略在 argv 层**——危险的是参数和 `-c`，不是 Promise 语法。
4. **文档数字要回源码**——并发默认 5，完成检测仍是 close+exit(50ms)。

## 应用型自测

1. `simpleGit({ maxConcurrentProcesses: undefined })` 实际并发上限是 6 吗？
2. `simpleGit('/not-there')` 会在第一次 `status()` 时才失败吗？
3. `.add().commit()` 和两次独立 `await git.status()` 是否共用同一条 executor chain？

检查点：

1. 不是。默认是 `5`；6 只出现在 README 示例。
2. 不会。工厂在目录不存在时立刻 `GitConstructError`。
3. 只有链式调用共用 `chain()`；两次独立调用只共享 Scheduler。

## 延伸阅读

- 仓库 README：[steveukx/git-js](https://github.com/steveukx/git-js)
- 固定源码：[steveukx/git-js](https://github.com/steveukx/git-js) —— 本文绑定提交 `01bb7ceae698831e9abd9310f7d61484970ab53c`
- [[isomorphic-git]] —— 对照：纯 JS 对象层，不 spawn git
- [[lazygit]] —— 同样复用系统 git，但是 TUI

## 关联

- [[isomorphic-git]] —— 嵌入式实现 vs CLI 包装
- [[lazygit]] —— porcelain 子进程路线的终端界面
- [[gitui]] —— libgit2，不 fork git
- [[node-js]] —— `child_process.spawn` 与 Promise 链的宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[isomorphic-git]] —— isomorphic-git — 纯 JS 读写 .git 的跨端实现
