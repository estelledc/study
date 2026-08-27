---
title: cross-spawn — 给 spawn 补上 Windows 会漏掉的那几步
description: spawn 与 spawnSync 的跨平台替身，shell 模式会关掉全部增强
来源: https://github.com/moxystudio/node-cross-spawn
日期: 2026-08-27
分类: CLI / 命令行工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/moxystudio/node-cross-spawn
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 77cd97f3ca7b62c904a63a698fc4a79bf41977d0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.6
---

## 是什么

cross-spawn 是 `child_process.spawn` / `spawnSync` 的跨平台替身。日常类比：Unix 上 spawn 像会认路的门卫；Windows 上同一扇门不认 `PATHEXT`、不认 shebang、也不帮你逃参数。这个库只补门卫，不把进程收成 Promise。

固定 7.0.6 的包名是 `cross-spawn`，CJS，引擎 `node >= 8`。调用方式和 Node 一样：

```js
const spawn = require('cross-spawn')

const child = spawn('npm', ['list', '-g', '-depth', '0'], {stdio: 'inherit'})
const result = spawn.sync('npm', ['-v'])
```

它返回的仍是 Node 的 `ChildProcess` / `spawnSync` 结果，没有 `stdout` Promise。

## 为什么重要

不看固定解析链，容易把它和 [[execa]] 说成“同一个库的新旧名字”，或以为 `shell: true` 也能拿到它的 Windows 修复：

- 为什么 Node 自带 `shell` 不能替代它
- 为什么 `options.shell` 一旦打开，shebang 和转义全部停掉
- 为什么 Windows 上“命令不存在”可能先以退出码 1 出现
- 为什么 `.cmd` shim 的参数要逃两次

一句话：cross-spawn 的合同是 **先 parse，再原样交给 Node spawn**。

## 核心要点

固定 7.0.6 的主链只有三步：

1. **parse**：把 `(command, args, options)` 收成可改副本。`args` 不是数组时按 Node 习惯当成 options。
2. **按 shell 分叉**：`options.shell` 为真就停止增强，命令原样交给 Node。否则只在 Windows 上继续。
3. **spawn + ENOENT**：`cp.spawn` / `spawnSync` 之后，Windows 若没解析到文件且退出码为 1，把这次 `exit` 改写成 `ENOENT`。

Windows 非 shell 路径里还会：

- 用 `which` 按 `PATH` / `PATHEXT` 解析命令；自定义 `cwd` 时临时 `chdir`，因为 `which` 不吃 cwd
- 读文件头 150 字节，支持 `#!/usr/bin/env <program>` 这种无额外参数的 shebang
- 不是 `.com` / `.exe` 就改走 `cmd.exe /d /s /c "..."`，并设 `windowsVerbatimArguments`
- `node_modules/.bin/*.cmd` 会对元字符做第二次 `^` 转义

Unix 上 `parseNonShell` 直接返回，等于薄封装。

## 实践示例

### 案例 1：当 drop-in，不要改调用习惯

```js
const spawn = require('cross-spawn')

const child = spawn('npm', ['run', 'build'], {stdio: 'inherit'})
child.on('error', (error) => {
  error.code // Windows 上命令不存在时，库会尽量补成 ENOENT
})
```

异步路径用 `enoent.hookChildProcess` 包一层 `emit`。同步路径则在返回值上补 `result.error`。

### 案例 2：`shell: true` 不是“更强的 cross-spawn”

```js
const spawn = require('cross-spawn')

spawn('echo hello', {shell: true})
```

`parse()` 见到 `options.shell` 就返回，不再解析 shebang、不再改写 argv、也不做 `cmd.exe` 包装。README 写明这是故意模仿 Node：你既然指定了 shell，就按目标平台自己负责。

### 案例 3：转义按 cmd 规则，而且要防回溯

```js
// 库内部会对参数做 qntm.org/cmd 那套反斜杠/引号处理
spawn('tool.cmd', ['value with spaces'], {cwd: '.'})
```

`escape.argument` 先处理 `\` 与 `"`，再整段加引号，再给元字符加 `^`。7.0.4 把这段正则改成非回溯；7.0.5 修回那次改动带出的转义回归。本文没有复现攻击输入。

## 踩过的坑

1. **以为 execa 10 还在用它**：固定 execa 已经自己实现 Windows 解析。两者是分层关系，不是当前依赖对。
2. **靠 `shell: true` 换跨平台**：增强全部关闭，参数也不会自动转义。
3. **把 Windows 退出码 1 都当成业务失败**：命令没解析到时，库会改写成 `ENOENT`。
4. **自定义 `cwd` 跑在没有 `chdir` 的 worker thread**：`resolveCommand` 会跳过切目录，`which` 仍按原 cwd 搜索。
5. **期待完整 shebang**：只认 `#!/usr/bin/env <program>`，且 `<program>` 不能带参数。

## 适用 vs 不适用场景

**适用**：

- 现有代码已经按 `spawn(file, args, options)` 写，只想补 Windows
- 必须支持 Node 8+ 或 CommonJS
- 调用方自己处理 stdio、exit 和错误

**不适用**：

- 想要 Promise、模板字符串、`.pipe()`、IPC——那是 [[execa]]
- 打算靠 `shell: true` 同时获得转义、shebang 和 PATHEXT
- 需要本轮未核验的性能或安全扫描结论

## 固定版本边界

- 本文绑定 `moxystudio/node-cross-spawn@77cd97f3...`，tag `v7.0.6` 与 npm `gitHead` 同指此提交。
- 7.0.6 相对 7.0.5 只更新 lockfile 里的自引用版本；转义相关修复落在 7.0.4 / 7.0.5。
- 引擎声明 `node >= 8`；入口是 CJS `index.js`。
- shebang 支持有限，README 要求始终在 Windows 上测。
- 本文未安装依赖、未跑 Jest、未在 Windows 上 spawn，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨平台 spawn 的难点在解析，不在 Promise**——这个库刻意停在 ChildProcess。
2. **`shell: true` 是退出通道**，不是增强开关。
3. **ENOENT 在 Windows 上不是免费的**：要靠解析失败 + 退出码 1 才能补出来。
4. **转义回归说明“修 ReDoS”也会改语义**——7.0.4 和 7.0.5 必须一起看。

## 应用型自测

1. `spawn('foo', {shell: true})` 还会解析 shebang 并改写 `cmd.exe` 命令行吗？
2. Windows 上命令没找到时，异步 API 通常先看到 `exit` 还是 `error`？
3. `node_modules/.bin/eslint.cmd` 的参数为什么可能被 `^` 转义两次？

检查点：

1. 不会。`options.shell` 直接跳过 `parseNonShell`。
2. 库会在 `exit` 且状态为 1、且没解析到文件时改 emit `error`（`ENOENT`）。
3. cmd-shim 会再解释一遍 `%*`，所以元字符要逃两轮。

## 延伸阅读

- 官方 README：[moxystudio/node-cross-spawn](https://github.com/moxystudio/node-cross-spawn)
- 固定源码：[moxystudio/node-cross-spawn](https://github.com/moxystudio/node-cross-spawn) —— 本文绑定提交 `77cd97f3ca7b62c904a63a698fc4a79bf41977d0`
- 对照入口：`index.js`、`lib/parse.js`、`lib/util/escape.js`、`lib/enoent.js`
- [[execa]] —— 更高层的进程 API；10.0.1 已不再依赖本库
- [[commander]] —— 解析用户 argv；真正启动进程仍要 spawn 层

## 关联

- [[execa]] —— Promise / 模板 / IPC 层，Windows 逻辑已内嵌
- [[commander]] —— CLI 解析，不负责跨平台 spawn
- [[listr2]] —— 任务树，底层常再选一层进程库
