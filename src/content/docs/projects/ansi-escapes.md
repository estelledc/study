---
title: ansi-escapes — 把光标、擦除和 OSC 收成可拼接字符串
description: 对照 ansi-escapes 7.3.0 源码，看 0 基坐标如何变成 CSI/OSC，以及 README 的 cursorLeft 示例为什么对不上。
来源: https://github.com/sindresorhus/ansi-escapes
日期: 2026-08-27
分类: 终端
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/ansi-escapes
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 73e652efe7a353bdf25f456e592c858e4648db3d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.3.0
---

## 是什么

ansi-escapes 把终端控制序列收成普通字符串。日常类比：它是遥控器按键表——你不发像素，只拼“光标往哪、擦哪一块、要不要换备屏”的指令，再交给 `stdout.write` 或 xterm.js。

固定 `7.3.0` 是纯 ESM，`engines.node >=18`。`index.js` 把 `base.js` 同时做成 named export 和 `export * as default` 命名空间。依赖只有 `environment` 的 `isBrowser`。

```js
import ansiEscapes, {cursorTo, cursorLeft} from "ansi-escapes"

process.stdout.write(cursorTo(0, 0) + cursorLeft)
```

`cursorTo(0, 0)` 发出 `\u001B[1;1H`：API 是 0 基，CSI 是 1 基。

## 为什么重要

不读固定源码，很容易把这份表当成“README 里的转义字面量”：

- 为什么 `cursorTo(2, 2)` 是 `\u001B[3;3H`——函数自己做了 `+ 1`
- 为什么 README 写 `cursorLeft === '\u001B[1000D'`，源码却是 `\u001B[G`
- 为什么在 Apple Terminal 里 save/restore 跟别处不一样
- 为什么 [[log-update]] 能只重画变化行——它拼的就是这里的 `cursorUp` / `eraseLine`

## 核心要点

固定版本可以看成四层：

1. **CSI 与 OSC**：普通光标/擦除走 `\u001B[`；超链接、iTerm 图像、工作目录走 `\u001B]`，用 BEL 收尾。tmux（`TERM` 以 `screen`/`tmux` 开头，或存在 `TMUX`）会把 OSC 包进 DCS，并把内部 ESC 加倍。

2. **0 基坐标**：`cursorTo(x)` 无 `y` 时发 CHA（列 `x+1`）；有 `y` 时发 CUP。`cursorMove` 按符号选方向：负 `x` 是 `D`，正 `x` 是 `C`，负 `y` 是 `A`，正 `y` 是 `B`。

3. **擦除粒度**：`eraseLine` 是整行 `2K`；`eraseLines(n)` 循环 `eraseLine`，除最后一行外再 `cursorUp()`，最后 `cursorLeft`。`clearViewport` 是 `eraseScreen` + 回原点；`clearScreen` 是 RIS `\u001Bc`，类型注释警告它可能清 scrollback、复位模式。

4. **环境分叉**：Apple Terminal 的 save/restore 用 `\u001B7` / `\u001B8`；其它环境用 `ESC s` / `ESC u`。`clearTerminal` 在旧 Windows（major < 10，或 Windows 10 build < 10586）用 `ESC 0f`，否则再加 `ESC 3J`。浏览器里默认 `cwd` 会 throw。

## 实践示例

### 案例 1：0 基坐标变成 CSI

```js
import {cursorTo, cursorMove} from "ansi-escapes"

cursorTo(2)       // \u001B[3G
cursorTo(2, 2)    // \u001B[3;3H
cursorMove(-1, 1) // \u001B[1D\u001B[1B
```

没有 `y` 时只改列。`cursorMove` 不会发 `0` 方向的空指令。

### 案例 2：擦 N 行，不是 RIS 清屏

```js
import {eraseLines, clearViewport, clearScreen} from "ansi-escapes"

process.stdout.write(eraseLines(3))
process.stdout.write(clearViewport)
// clearScreen === "\u001Bc"
```

进度条、spinner 应走 `eraseLines` / `clearViewport`。`clearScreen` 是整机复位，不是“只擦可见区”。

### 案例 3：备屏、同步输出与超链接

```js
import {
  enterAlternativeScreen,
  exitAlternativeScreen,
  synchronizedOutput,
  link,
} from "ansi-escapes"

process.stdout.write(enterAlternativeScreen)
process.stdout.write(synchronizedOutput("frame"))
process.stdout.write(link("docs", "https://example.test"))
process.stdout.write(exitAlternativeScreen)
```

`synchronizedOutput` 只是 `?2026h` + 文本 + `?2026l`。`link` 走 OSC 8；在 tmux 里会被 `wrapOsc` 再包一层。

## 踩过的坑

1. **抄 README 的 `cursorLeft`**：固定源码是 `ESC G`，不是 `\u001B[1000D`。
2. **把 `clearScreen` 当安全清屏**：RIS 可能清 scrollback、改模式；可见区用 `clearViewport`。
3. **在浏览器里调用默认 `setCwd()`**：`process.cwd` 被换成会 throw 的函数。
4. **以为 `image()` 是跨运行时字节数组**：实现用 `Buffer.from(data)`，并强制写 `size=`。

## 适用 vs 不适用场景

**适用**：

- CLI 需要光标、擦行、备屏或同步输出，但不想手写 CSI
- 给 [[log-update]] / [[ora]] 这类重绘层提供原语
- 在支持 OSC 8 的终端里拼可点击链接

**不适用**：

- 要颜色 / 样式 → chalk 或 picocolors，本库不管 SGR 颜色
- 要把 README 示例或 star / 下载量写成已测事实
- 需要在旧 CommonJS + Node < 18 里 `require`

## 固定版本边界

- 本文绑定 `sindresorhus/ansi-escapes@73e652efe7a353bdf25f456e592c858e4648db3d`，annotated tag `v7.3.0` 解引用到此提交，与 npm `ansi-escapes@7.3.0` 的 `gitHead` 一致。
- `sideEffects: false`；生产依赖只有 `environment`。
- 未安装依赖、运行 ava / tsd，也未在真实终端核对，状态保持 `UNVERIFIED`。

## 学到什么

1. **API 坐标和 CSI 坐标差 1**——`cursorTo` 自己做转换。
2. **字符串表不是副作用**——库只返回序列，写不写、写到哪是调用方的事。
3. **清屏有三档**——擦行、清可见区、RIS / 含 scrollback，合同不同。
4. **README 字面量要以 `base.js` 为准**——`cursorLeft` 就是反例。

## 应用型自测

1. `cursorTo(0, 0)` 会发出 `\u001B[0;0H` 吗？
2. 固定版本的 `cursorLeft` 是 `\u001B[1000D` 吗？
3. 想只清可见区、尽量不动 scrollback，该用 `clearScreen` 还是 `clearViewport`？

检查点：

1. 不会。它发出 `\u001B[1;1H`。
2. 不是。源码是 `\u001B[G`。
3. 用 `clearViewport`。`clearScreen` 是 RIS。

## 延伸阅读

- 固定源码：[sindresorhus/ansi-escapes](https://github.com/sindresorhus/ansi-escapes) —— 本文绑定 `73e652efe7a353bdf25f456e592c858e4648db3d`
- 审查记录：仓库内 `docs/terminal-control-source-review-20260827-ex.md`
- [[log-update]] —— 用这些序列做行级 diff 重绘
- [[ora]] —— 单行 spinner，核心仍是擦行 + 回列

## 关联

- [[log-update]] —— 消费本库做覆盖式日志
- [[ora]] —— 单行动画对照
- [[ink]] —— 把布局结果再序列化成 ANSI

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
