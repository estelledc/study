---
title: log-update — 在终端里覆盖上一帧，而不是再打一行
来源: https://github.com/sindresorhus/log-update
日期: 2026-08-27
分类: 终端工具
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/log-update
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4f7a1460893a7557aee8f7202956218c3e770a5a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.0
---

## 是什么

log-update 是一个 **把“当前这一屏进度”写回同一块区域** 的 Node 库。日常类比：教室黑板——下一帧不是在底下再接一张纸，而是先擦掉要改的那几行，再写新字。进度条、spinner、任务树都靠这个把戏。

你写：

```js
import logUpdate from 'log-update'

logUpdate('下载 10%')
logUpdate('下载 40%')
logUpdate.persist('下载完成')
```

默认导出是 `createLogUpdate(process.stdout)`。每次调用先按终端宽度硬换行，再尽量只给变化的行打补丁。固定 8.0.0 不再是“每次整段清屏再重打”这一条路。

## 为什么重要

不读 `index.js`，终端动画很容易被讲成“\\r 回行首”：

- 为什么多行进度条能只改中间一行——公共前缀/后缀被跳过，只擦变化块
- 为什么窗口一缩，补丁策略立刻放弃——宽变了或内容被裁高，diff 不再合法
- 为什么管道里有时仍能看到完整帧——`isTTY !== true` 时不包 synchronized output，但仍按默认 80×24 算框
- 为什么 `done()` 不会把当前画面再印一遍——它只 reset 内部计数并恢复光标

## 核心要点

固定 8.0.0 的一帧可以看成四步：

1. **先变成具体几何**：文本末尾保证有 `\n`，`wrapAnsi` 用 `hard: true` 按 `columns ?? defaultWidth ?? 80` 折行，再按 `rows ?? defaultHeight ?? 24` 从顶部丢掉超出的行。

2. **能偷懒就偷懒**：折完的字符串和上次完全一样、宽度也没变，直接 return。

3. **能打补丁就打补丁**：从两端找公共行，用 `cursorUp` / `cursorDown` / `eraseLine` 只重写中间。行数变了会把后缀一并重写；公共前缀长度为 0 则整段 `eraseLines`。

4. **TTY 才套同步输出**：`stream.isTTY === true` 时，写入被包在 CSI `?2026` 里，减少撕裂。非 TTY 只是普通 `stream.write`。

`persist()` 走另一条路：擦掉上一帧，写下**不裁高度**的文本，然后 `reset()`，让它留在 scrollback。`clear()` 只擦；`done()` 不擦当前内容，只结束这一轮会话。

## 实践示例

### 案例 1：同一块区域更新进度

```js
import logUpdate from 'log-update'

for (const n of [1, 2, 3]) {
  logUpdate(`step ${n}/3`)
}
logUpdate.done()
```

第一次 `previousLineCount === 0`，直接写。之后若宽度没变，只给变化行打补丁。`done()` 恢复光标，并清掉内部的“上一帧”，下一次 `logUpdate()` 会当成新的第一帧往下写。

### 案例 2：把结果留在历史上

```js
import logUpdate from 'log-update'

logUpdate('测试进行中…')
logUpdate.persist('✓ 12 passed')
logUpdate('下一组…')
```

`persist` 先 `eraseLines` 掉动画帧，再写不会被下一帧覆盖的文本。这和 `console.log` 接近，但会先把仍停在屏幕上的临时帧清掉。

### 案例 3：自己选流和框

```js
import { createLogUpdate, logUpdateStderr } from 'log-update'

const log = createLogUpdate(process.stdout, {
  showCursor: true,
  defaultWidth: 120,
  defaultHeight: 40,
})

log('progress on stdout')
logUpdateStderr('progress on stderr')
```

管道或测试里常常没有 `columns` / `rows`。不传默认值时，源码用 80 和 24。`showCursor: true` 不会调用 `cliCursor.hide()`。

## 踩过的坑

1. **把 v8 理解成“每帧整屏重绘”**：宽不变且有公共前缀时走 patch。只有宽变、被裁高、或第一行就不同，才整段擦写。
2. **以为 `done()` 等于 `persist(当前内容)`**：`done()` 不重写当前帧，只 reset + 显示光标。
3. **忽略高度裁剪**：内容高于 `rows` 时从**顶部**丢掉行。长任务树可能看不见最早的几项。
4. **用 `\r` 模型解释多行**：单行 spinner 可以只回车；log-update 按行数组做 cursor 算术。
5. **在 Node 21 上当默认引擎**：`engines.node` 是 `>=22`。本轮未跑兼容矩阵。

## 适用 vs 不适用场景

**适用**：

- 进度条、spinner、任务树这类“同一块区域反复刷新”
- 需要把阶段性结果 `persist` 进 scrollback，然后继续动画
- 已经有完整帧字符串，只缺一层终端补丁

**不适用**：

- 只要往日志里追加一行——直接 `console.log`
- 需要交互式控件树——[[ink]] 更合适
- 需要任务图、rollback、renderer 降级——那是 [[listr2]] 的工作，它把 log-update 当画笔

## 固定版本边界

- 本文绑定 `sindresorhus/log-update@4f7a1460...`。annotated tag `v8.0.0` 的 peel 与 npm `gitHead` 一致。
- 包是纯 ESM；导出 `default`、`logUpdateStderr`、`createLogUpdate`。
- 运行时依赖：`ansi-escapes`、`cli-cursor`、`slice-ansi`、`string-width`、`strip-ansi`、`wrap-ansi`。
- 本文未跑 `node --test` / `xo` / `tsd`，也未在真实 TTY 上对拍补丁序列，状态保持 `UNVERIFIED`。

## 学到什么

1. **覆盖写 = 几何 + 补丁，不是一个 `\r`**——先折行裁高，再决定擦哪一段。
2. **diff 有失效条件**——宽度和裁剪会让补丁变得错误，源码选择整段重来。
3. **持久化和原地更新是两个 API**——`persist` 进历史，`logUpdate` 占当前块。
4. **TTY 检测只决定同步输出包装**——非 TTY 仍会写文本，只是少了 `?2026`。

## 应用型自测

1. 默认导出写到哪个流？想写 stderr 该用哪个导出？
2. 终端突然变窄时，下一帧更可能走补丁还是 `eraseLines` 整段重写？
3. `logUpdate.done()` 会不会把当前这一帧再打印一次到 scrollback？

检查点：

1. `process.stdout`。stderr 用 `logUpdateStderr` 或 `createLogUpdate(process.stderr)`。
2. 整段重写。宽度变化会让 diff 失效。
3. 不会。`done()` 只 reset 并按需显示光标。

## 延伸阅读

- 固定源码：[sindresorhus/log-update](https://github.com/sindresorhus/log-update) —— 本文绑定提交 `4f7a1460893a7557aee8f7202956218c3e770a5a`
- 对照入口：`index.js` 的 `computeFrame` / `diffFrames` / `buildPatch`
- [[listr2]] —— 任务树；11.0.1 依赖 `log-update ^8.0.0`
- [[ora]] —— 单行 spinner，问题更小，不一定要多行 diff

## 关联

- [[listr2]] —— 用 log-update 把整棵任务树贴到 TTY
- [[ora]] —— 单行擦写；和多行补丁对照
- [[ink]] —— 组件树 diff，不是直接喂一整帧字符串
- [[chalk]] —— 只负责颜色；log-update 不依赖它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
