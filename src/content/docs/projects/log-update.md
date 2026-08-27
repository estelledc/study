---
title: log-update — 在原位覆盖上一帧终端输出
description: 对照 log-update 8.0.0 源码，看它如何 wrap、按高度裁剪，并在可 diff 时只重画变化行。
来源: https://github.com/sindresorhus/log-update
日期: 2026-08-27
分类: 终端
难度: 入门
difficulty: beginner
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

log-update 在同一块终端区域里覆盖上一帧文字。日常类比：它是可擦写的白板——进度条、spinner、多行状态可以反复改，不必每次往下堆一行新日志。

固定 `8.0.0` 是纯 ESM，`engines.node >=22`。默认导出是 `createLogUpdate(process.stdout)`；另有 `logUpdateStderr` 和自定义 stream。它依赖 [[ansi-escapes]] `^7.3.0` 来拼光标和擦除序列。

```js
import logUpdate from "log-update"

logUpdate("working…")
logUpdate("still working…")
logUpdate.done()
```

第二次调用会尽量只改变化的行，而不是把整块输出再打一遍。

## 为什么重要

不读固定 8.0.0，很容易仍按“每帧整页重打”来推理：

- 为什么只改最后一行时，测试只看到一次 `eraseLine`——前后缀相同就走 patch
- 为什么终端变窄后下一帧会整段 `eraseLines`——换宽后旧行切分作废
- 为什么 `persist` 能写出超过 `rows` 的内容，普通 `logUpdate` 却只留最后 N 行
- 为什么非 TTY 仍可能出现 CSI 乱码——`isTTY` 只开关同步输出，不关掉擦除序列

## 核心要点

固定版本可以看成五步：

1. **先收成一帧**：多个参数用空格拼接；若不以换行结尾就补一个。再 `wrapAnsi`（`hard: true`，`wordWrap: false`，`trim: false`）。

2. **再按高度裁**：可见行数是 `stream.rows ?? defaultHeight ?? 24`。超出就留最后 N 行；`rows === 0` 得到空帧，并擦掉上一帧。

3. **决定怎么写**：`stream.isTTY === true` 时，每次 `write` 外包 `CSI ?2026h/l`。非 TTY 仍写 [[ansi-escapes]] 序列，只是不加同步输出。

4. **能 diff 就 patch**：同宽、未裁剪、且公共前缀长度 > 0 时，对行做前后缀比较，用 `cursorUp` / `eraseLine` / `eraseEndLine` 只重画中间块。行数变了会把后缀一并重写，避免错位。

5. **不能 diff 就整擦**：首帧直接写；内容与宽度都没变则 no-op；宽度变化、发生裁剪、或前缀长度为 0，退回 `eraseLines(previousLineCount) + 整帧`。

## 实践示例

### 案例 1：默认 stdout 会话

```js
import logUpdate from "log-update"

const frames = ["-", "\\", "|", "/"]
let i = 0
const timer = setInterval(() => {
  logUpdate(`${frames[i++ % frames.length]} packing`)
}, 80)

setTimeout(() => {
  clearInterval(timer)
  logUpdate.persist("packed")
}, 400)
```

`persist` 先擦掉动画帧，再写一条**不裁高度**的永久行，并清空内部计数。后面再 `logUpdate` 是新会话，不会去擦这条。

### 案例 2：只改中间行

```js
import {createLogUpdate} from "log-update"

const log = createLogUpdate(process.stdout)
log("Top\nMiddle\nBottom")
log("Top\nChanged\nBottom")
```

固定测试期望第二次只发一次 `ESC[2K`。公共前缀 `Top` 和后缀 `Bottom` 留在原地。

### 案例 3：`done` 和 `clear` 不是一回事

```js
log("Happy families are all similar")
log.done()
log("every unhappy family is unhappy in its own way")
```

`done()` 不擦当前帧，只重置状态并按需恢复光标；下一帧写在下面。`clear()` 会 `eraseLines` 后再重置。`showCursor` 默认 `false`，渲染前会 `cliCursor.hide()`。

## 踩过的坑

1. **把 8.0.0 写成整页重绘**：可 diff 时只改变化块；只有换宽、裁剪或首行就变时才整擦。
2. **以为非 TTY 会自动变成普通 `console.log`**：`isTTY` 只控制 `?2026`。管道和 CI 仍可能吃到光标/擦除码。
3. **用 `logUpdate` 当永久日志**：普通路径按 `rows` 裁掉顶部。要进 scrollback 用 `persist`，或先 `done()`。
4. **`log('')` 当作“什么都不写”**：空串仍会被补成一个换行；真正的空帧来自 `rows === 0`。

## 适用 vs 不适用场景

**适用**：

- CLI 进度、多行状态、需要在原位刷新的短动画
- 希望同宽更新尽量少闪，并能在 TTY 上用同步输出
- 要在 stderr 画进度时用 `logUpdateStderr`

**不适用**：

- Node < 22 或 CommonJS `require`
- 需要完整交互 UI → [[ink]]
- 只要单行 spinner → [[ora]] 更窄
- 把未跑的测试或截图当成“一定不闪”

## 固定版本边界

- 本文绑定 `sindresorhus/log-update@4f7a1460893a7557aee8f7202956218c3e770a5a`，annotated tag `v8.0.0` 解引用到此提交，与 npm `log-update@8.0.0` 的 `gitHead` 一致。
- 生产依赖包含 `ansi-escapes@^7.3.0`。宽度默认 80，高度默认 24。
- 未安装依赖、运行 `node --test` / tsd，也未在真实 TTY 观察，状态保持 `UNVERIFIED`。

## 学到什么

1. **覆盖式日志先 wrap，再裁高度，最后才 diff**——顺序反了就会错位。
2. **`done` 留下、`clear` 擦掉、`persist` 写成永久行**——三条收尾合同不同。
3. **TTY 检测不等于“关闭 ANSI”**——它只包同步输出。
4. **依赖 [[ansi-escapes]] 是字符串拼接，不是自己实现 CSI**。

## 应用型自测

1. 在 3 行高的终端里 `logUpdate('L1\\nL2\\nL3\\nL4\\nL5')`，可见区更可能留下哪些行？
2. `createLogUpdate(nonTtyStream)` 还会写出 `CSI ?2026h` 吗？还会写 `eraseLine` 吗？
3. `logUpdate.done()` 会把当前帧擦掉吗？

检查点：

1. 最后几行（含补上的尾部空行），不是 `L1` 起头的整页。
2. 不会写 `?2026`；只要还在更新旧帧，仍可能写擦除/光标序列。
3. 不会。`done` 只结束会话，擦除是 `clear` 的工作。

## 延伸阅读

- 固定源码：[sindresorhus/log-update](https://github.com/sindresorhus/log-update) —— 本文绑定 `4f7a1460893a7557aee8f7202956218c3e770a5a`
- 审查记录：仓库内 `docs/terminal-control-source-review-20260827-ex.md`
- [[ansi-escapes]] —— 光标、擦行和同步输出原语
- [[ora]] —— 单行覆盖对照

## 关联

- [[ansi-escapes]] —— 本库重绘序列的来源
- [[ora]] —— 更窄的单行 spinner
- [[ink]] —— 组件树到终端的另一条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
