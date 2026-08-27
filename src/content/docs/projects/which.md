---
title: which — 在 PATH 里找第一个可执行文件的 Node 实现
description: 在 PATH 里找第一个可执行文件，语义接近 BSD which(1)。
来源: https://github.com/npm/node-which
日期: 2026-08-27
分类: 命令行
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/npm/node-which
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 297db11d58eebe01551ae0875a127a89ee63d2cb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.0
---

## 是什么

`which` 是 npm 维护的 Node 版 Unix `which(1)`。日常类比：你问前台“node 在哪一间”，它按走廊名单从左到右推门，直到摸到一扇能执行的门，把房间号还给你。名单默认是 `process.env.PATH`，可执行判断交给依赖 `isexe`，本页不把 `isexe` 绑进自己的 revision。

你写：

```js
const which = require('which')
const resolved = await which('node')
const orNull = which.sync('node', { nothrow: true })
```

固定 7.0.0 的默认导出是 async 函数；`.sync` 挂在同一个函数对象上。找不到时默认抛 `Error`，`code` 为 `ENOENT`，文案 `not found: ${cmd}`。`nothrow: true` 改成返回 `null`。

## 为什么重要

不理解这层查找，就解释不了这些边界：

- 为什么命令名里一旦出现 `/`（或当前平台分隔符）就不再扫 PATH
- 为什么 Windows 会先看当前工作目录，再看 PATH
- 为什么 CLI 叫 `node-which` 而不是 `which`——避免盖掉系统 `which(1)`
- 它和 [[lookpath]] 不是同一份合同：这边可抛错、有 sync、有 `all`

## 核心要点

固定 `lib/index.js` 的主链是五步：

1. **拆查找目录**：`getPathInfo()` 看到斜杠就只留 `['']`，只检查命令本身；否则把 `PATH`（可用 `opt.path` 覆盖）按 `delimiter` 切开。Windows 还会把 `process.cwd()` 插到最前面。

2. **准备扩展名**：非 Windows 的 `pathExt` 只有 `['']`。Windows 读 `PATHEXT`（可用 `opt.pathExt`），默认 `.EXE;.CMD;.BAT;.COM`，再复制一份小写；命令名自带 `.` 且首位扩展名不是空串时，会把 `''` 插到最前，让 `node.exe` 先按原名试。

3. **拼路径**：PATH 段若被双引号包住就剥掉。空目录加上 `./cmd` 这类相对命令时，会补回 `./` 前缀再 `join`。

4. **问 isexe**：对每个目录 × 每个扩展名调用 `isexe` / `isexeSync`，并传 `ignoreErrors: true`。第一个为真就返回；`all: true` 则收集成数组。

5. **失败形态**：`all` 且有结果返回数组；否则 `nothrow` 给 `null`，默认抛 `ENOENT`。结果不缓存，PATH 变了不用 `hash -r`。

## 实践示例

### 案例 1：默认抛错，nothrow 改成 null

```js
const which = require('which')

await which('node')
which.sync('definitely-missing', { nothrow: true }) // null
```

CLI `node-which` 走 sync，没有 nothrow。某个名字找不到时只设 `process.exitCode = 1`，已找到的名字仍会打印。

### 案例 2：覆盖 PATH，一次拿全部命中

```js
const resolved = await which('x.cmd', {
  path: '/tmp/a:/tmp/b',
  all: true,
})
```

测试里偶数段还会写成 `"/tmp/a"`；实现用 `/^".*"$/` 去掉引号。`all` 让返回值从字符串变成字符串数组。

### 案例 3：带斜杠的命令不进 PATH

```js
await which('/usr/local/bin/node')
await which('./scripts/run.sh')
```

`cmd.match(rSlash)` 为真时 `pathEnv` 只有空串，相当于直接检查这个路径。相对路径会按当前工作目录拼接，而不是从 PATH 里找同名文件。

## 踩过的坑

1. **把 CLI 当成系统 `which`**：可执行文件名是 `node-which`，用法 `node-which [-as] program ...`。`-s` 静默，`-a` 打印全部；非法短选项走 usage 并退出 1。
2. **以为 7.0.0 还能跑旧 Node**：`engines.node` 是 `^22.22.2 || ^24.15.0 || >=26.0.0`。仓库规范 Node 22.23.1 落在这个区间；22.21 及更早不在声明里。
3. **把 `nothrow` 的空值写成 `undefined`**：库返回 `null`。`undefined` 是 [[lookpath]] 的合同。
4. **在 Windows 上忘记 PATHEXT**：不带扩展名的 `foo` 要靠 `.EXE` 等后缀拼出真实文件。
5. **把 isexe 的平台规则算进本页**：可执行判断在依赖里；本 revision 只保证调用时带了 `pathExt` 和 `ignoreErrors`。

## 适用 vs 不适用场景

**适用**：

- 需要和 BSD `which(1)` 接近的“第一个可执行文件”语义
- 同时要 async / sync，以及 `all` / `nothrow`
- 调用方已经在 Node 22.22.2+ 或声明的更新主线

**不适用**：

- 只想 `undefined`、绝不抛错——看 [[lookpath]]
- 要在查找时 `include` / `exclude` 若干目录，而不重写整条 PATH
- 必须支持本页未声明的旧 Node
- 需要本轮未测量的查找耗时或缓存策略

## 固定版本边界

- 本文绑定 `npm/node-which@297db11d...`。轻量 tag `v7.0.0` 与 npm `which@7.0.0` 的 `gitHead` 指向同一提交。
- 许可 ISC；运行时依赖只有 `isexe@^4.0.0`。
- 未安装依赖、未跑 tap、未在 Windows 上复现 PATHEXT。状态保持 `UNVERIFIED`。

## 学到什么

1. **斜杠是查找模式开关**——绝对/相对路径不再遍历 PATH。
2. **Windows 的 cwd-first 和 PATHEXT 是写进 `getPathInfo` 的合同**，不是文档修辞。
3. **失败值要按 API 选**：默认异常、`nothrow` 为 `null`、CLI 用退出码。
4. **CLI 故意不叫 `which`**，避免和系统工具抢名。

## 应用型自测

1. `which('usr/bin/node')` 还会扫描 `process.env.PATH` 吗？
2. 找不到时，默认 async 调用和 `{ nothrow: true }` 分别得到什么？
3. Windows 上 PATH 扫描之前还会插入哪个目录？安装后的 CLI 命令名是什么？

检查点：

1. 不会。名字里有 `/` 或当前分隔符时，`pathEnv` 只有空串。
2. 默认抛 `ENOENT`；nothrow 返回 `null`。
3. `process.cwd()`。CLI 是 `node-which`。

## 延伸阅读

- 固定源码：[npm/node-which](https://github.com/npm/node-which) —— 本文绑定 `297db11d58eebe01551ae0875a127a89ee63d2cb`
- 对照入口：`lib/index.js`、`bin/which.js`
- [[lookpath]] —— 同主题的 Go 风格查找：只 async，找不到给 `undefined`
- [[volta]] —— shim 占 PATH 首位时，`which` 会先碰到 shim

## 关联

- [[lookpath]] —— 最小 PATH 扫描，失败不抛
- [[volta]] —— 用 shim 劫持 `which node` 的结果
- [[asdf]] —— 另一套 PATH 首位 shim
- [[zsh]] —— shell 自己的 `which` / `hash` 与本库无关
