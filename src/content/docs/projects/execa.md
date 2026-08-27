---
title: execa — 把子进程收成 Promise 和模板字符串
description: 高层 Promise 进程库，自己处理 Windows PATHEXT 与 shebang，不再依赖 cross-spawn
来源: https://github.com/sindresorhus/execa
日期: 2026-08-27
分类: CLI / 命令行工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/execa
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8017b279e19347efaf2587711c2d57dbd4330740
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.0.1
---

## 是什么

execa 是一个给 Node.js 脚本用的子进程库。日常类比：`child_process.spawn` 像把钥匙和说明书分开交给你；execa 把“怎么起进程、怎么等结束、失败时抛什么”收成一次函数调用。

固定 10.0.1 的 npm 包名就是 `execa`，ESM，要求 Node `>=22`。常见入口：

```js
import {execa, execaSync, execaNode, $} from 'execa'

const {stdout} = await execa('echo', ['hello'])
```

也可以写成模板字符串：`` await execa`echo hello` ``。底层仍是 `node:child_process.spawn`，不是 shell，也不是 `cross-spawn`。

## 为什么重要

不看固定源码，容易把 execa 说成“带 Promise 的 spawn”或“还在用 cross-spawn 的高层封装”：

- 为什么 `execa()` 默认找不到本地 `node_modules/.bin`，而 `$` 可以
- 为什么失败默认 throw 的是结果对象，不是普通 `Error.message`
- 为什么 `execaNode()` 会强制关掉 shell、打开 IPC
- 为什么 Windows 上它自己做 PATHEXT / shebang / `cmd.exe` 包装

一句话：execa 10 的合同是 **参数归一化 + 自己的 Windows 解析 + thenable subprocess**。

## 核心要点

固定版本可以把主链拆成五步：

1. **选入口**：`createExeca` 生成 `execa` / `execaSync` / `execaNode` / `$`。传入普通对象会返回绑定了 options 的新函数。
2. **解析调用**：位置参数或模板字符串先拆成 `file + args + options`。`$` 的 deep option 带 `preferLocal: true`；没指定 `input` / `inputFile` / `stdio` 时再补 `stdin: 'inherit'`。
3. **归一化**：默认 `preferLocal=false`、`reject=true`、`cleanup=true`、`windowsHide=true`、`encoding=utf8`、`killSignal=SIGTERM`、`forceKillAfterDelay=true`。`signal` 已被拒绝，要改用 `cancelSignal`。
4. **真正 spawn**：异步走 `spawn`，同步走 `spawnSync`。`shell: true` 且仍有参数数组时，先拼成单字符串，避开 Node 24 的 deprecation。
5. **收结果**：等 exit / stdio / IPC。`reject: true` 且 `failed` 时直接 throw 这份结果（`ExecaError` / `ExecaSyncError`）。

Windows 且未开 shell 时，`parseCommandFile` 自己解析绝对路径和 shebang；只有 `.com` / `.exe` 能直接 spawn，其余改走 `cmd.exe /d /s /c`。命令或参数里出现 CR/LF 会立刻抛错，因为 `cmd.exe` 把换行当命令分隔符。

## 实践示例

### 案例 1：默认 execa 与脚本风 `$` 不是同一组默认值

```js
import {execa, $} from 'execa'

await execa('eslint', ['.'])          // 默认不改 PATH
await $({preferLocal: true})`eslint .` // $ 已经带 preferLocal
```

**逐部分解释**：

1. `execa` 的 `preferLocal` 默认 false，不会把本地 bin 目录塞进 `PATH`。
2. `$` 在 `createExeca` 里把 `preferLocal: true` 写成 deep option。
3. 模板字符串按空白切 token；插值如果是上一次结果，用的是它的 `stdout`。

### 案例 2：失败默认变成异常

```js
import {execa, ExecaError} from 'execa'

try {
  await execa('node', ['-e', 'process.exit(2)'])
} catch (error) {
  if (error instanceof ExecaError) {
    error.exitCode
  }
}
```

`handleResult` 在 `result.failed && reject` 时 throw 的就是这份 result。把 `reject: false` 关掉后，失败会当普通返回值。

### 案例 3：execaNode 不是“再包一层 node”

```js
import {execaNode} from 'execa'

await execaNode('./worker.js', ['--once'])
```

`{node: true}` 会把文件改写成 `process.execPath + 过滤后的 execArgv + 脚本`，并强制 `shell: false`、默认 `ipc: true`。`execArgv` 里以 `--inspect` 开头的旗标会被丢掉。第一个参数再写成 `'node'` 会直接抛错。

## 踩过的坑

1. **把 10.x 写成还依赖 cross-spawn**：固定 `package.json` 没有这个依赖，仓库里也搜不到这个名字。Windows 逻辑在 `lib/arguments/command-file.js`。
2. **以为 `execa('eslint')` 等于 `npx eslint`**：本地二进制要显式 `preferLocal: true`，或改用 `$`。
3. **继续传 `signal`**：固定源码把它改名为 `cancelSignal`，旧名字会抛 `TypeError`。
4. **在 Windows 上把用户输入连进无 shell 命令行且带换行**：`assertNoLineBreak` 会拒绝，这是注入防护，不是排版问题。
5. **把 `forceKillAfterDelay: true` 理解成立刻 SIGKILL**：true 表示默认再等 5 秒，然后补 `SIGKILL`。

## 适用 vs 不适用场景

**适用**：

- 脚本里要起进程、读 stdout、失败当异常
- 需要模板字符串、`.pipe()`、IPC 或 `execaNode`
- 能接受 Node `>=22` 和 ESM

**不适用**：

- 只想要 `spawn` / `spawnSync` 的最小跨平台补丁——那是 [[cross-spawn]]
- 必须跑在 Node 18 / CJS `require`
- 需要本轮未核验的吞吐、冷启动或 bundle 数字来做选型

## 固定版本边界

- 本文绑定 `sindresorhus/execa@8017b279...`，annotated tag `v10.0.1` 与 npm `gitHead` 同指此提交。
- 引擎声明 `node >= 22`；导出只有 ESM。
- 默认 `cleanup: true` 会在父进程退出时 `kill()`，`detached` 时不装这个钩子。
- `killDescendants`、`ipc`、`detached`、`cancelSignal` 不能和同步方法一起用。
- 本文未安装依赖、未 spawn 真进程、未在 Windows 上复现，状态保持 `UNVERIFIED`。

## 学到什么

1. **高层 API 和跨平台 spawn 补丁已经拆开**——execa 10 自己处理 Windows，不再复用 [[cross-spawn]]。
2. **默认值就是产品判断**：`preferLocal` 关、`reject` 开、`windowsHide` 开。
3. **`$` 不是语法糖别名**，它改了 stdin 和本地 PATH。
4. **模板字符串仍按 argv 数组执行**，不等于 `shell: true`。

## 应用型自测

1. 固定 10.0.1 的 `execa()` 默认会把 `node_modules/.bin` 加进 `PATH` 吗？哪个入口会？
2. Windows 且 `shell` 未开时，命令参数里的换行会被 `cmd.exe` 原样执行吗？
3. `execaNode('./app.js')` 还要不要自己把第一个参数写成 `'node'`？IPC 默认开吗？

检查点：

1. 不会。默认 `preferLocal=false`；`$` 的 deep option 才是 true。
2. 不会。`assertNoLineBreak` 会抛 `TypeError`。
3. 不要。`node: true` 会拒绝文件名是 `node`；默认 `ipc: true`。

## 延伸阅读

- 官方 README：[sindresorhus/execa](https://github.com/sindresorhus/execa)
- 固定源码：[sindresorhus/execa](https://github.com/sindresorhus/execa) —— 本文绑定提交 `8017b279e19347efaf2587711c2d57dbd4330740`
- 对照入口：`index.js`、`lib/methods/create.js`、`lib/arguments/command-file.js`、`lib/arguments/options.js`
- [[cross-spawn]] —— 更薄的 `spawn` 兼容层，仍被许多工具直接依赖
- [[commander]] —— 解析 argv；execa 负责把解析结果真正跑起来
- [[listr2]] —— 任务树里常见的进程执行搭档

## 关联

- [[cross-spawn]] —— Windows PATHEXT / shebang / `cmd.exe` 的薄封装
- [[commander]] —— CLI 参数树，不负责 spawn
- [[listr2]] —— 任务编排，示例里常调用 execa
- [[ora]] —— 终端 spinner，常和长进程一起出现
