---
title: clipboardy — 按平台选命令，再把系统剪贴板包成 Promise
description: Node 20+ 与浏览器的跨平台剪贴板库，加载时选定 pbcopy、PowerShell、xsel 或 wl-copy。
来源: https://github.com/sindresorhus/clipboardy
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/clipboardy
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 84e8d07ceacba32d95e9072efcb7d486578ac9d2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.3.2
---

## 是什么

clipboardy 是一个**按运行时选入口、按操作系统选外部命令**的剪贴板小库。日常类比：前台只收“写入 / 读出”两句话，后台再决定是叫 `pbcopy`、PowerShell，还是 `wl-copy`。

固定 5.3.2 是 ESM，`engines.node` 为 `>=20`。条件 exports：Node 走 `index.js`，其他环境走 `browser.js`。

```js
import clipboard from "clipboardy"

await clipboard.write("你好🦄")
const text = await clipboard.read()
```

`write` / `read` 是 Promise；`writeSync` / `readSync` 只在 Node。浏览器里同步方法直接 throw。

## 为什么重要

不读平台分发，你会把“跨平台剪贴板”理解成一套 Win32 API：

- 为什么无显示器的 CI / Docker 会失败——Linux 路径要 X11 或 Wayland
- 为什么浏览器和 Node 不能共用同步 API——`browser.js` 只包 `navigator.clipboard`
- 为什么 Wayland 上 `wl-copy` 会“挂住”——它 fork 后台进程接着提供剪贴板内容
- 为什么它和 [[copy-paste]] 不是同一代合同——这边默认 Promise + 捆绑 fallback，那边是 CJS callback

## 核心要点

模块加载时用 IIFE 选定**一份**平台实现，之后每次调用不再重判：

1. **darwin** → `pbcopy` / `pbpaste`，环境变量 `LC_CTYPE=UTF-8`。
2. **win32** → 先走 PowerShell `Set-Clipboard` / `Get-Clipboard -Raw`；失败再试捆绑的 `clipboard_{arch}.exe`。
3. **android** → 没有 `TERMUX_VERSION` 立刻 throw；有则 `termux-clipboard-set/get`。
4. **其余（含 linux）** → `is-wsl` 为真走 WSL：`clip.exe` 复制，粘贴复用 Windows 实现；否则 `is-wayland()` 为真走 `wl-copy` / `wl-paste`，失败再回 X11 的 `xsel`。

文本 API 只接受 string。`read` / `readSync` 把 `stripFinalNewline: false` 传给 execa，避免吃掉剪贴板末尾换行。图片三项转交给依赖 `clipboard-image`；类型声明写明只在 macOS 有意义。

## 实践示例

### 案例 1：Node 里异步读写

```js
import clipboard from "clipboardy"

await clipboard.write("line one\nline two\n")
const text = await clipboard.read()
```

`write` 在类型检查后调用 `platformLib.copy({input: text})`。末尾换行会保留，因为 paste 显式关掉了 execa 的 strip。

### 案例 2：浏览器入口没有同步路径

```js
import clipboard from "clipboardy"

await clipboard.write("secure-context-only")
clipboard.writeSync("no") // throw: `.writeSync()` is not supported in browsers!
```

打包器走 `exports.default` 得到 `browser.js`。它只调用 `navigator.clipboard.writeText` / `readText`，并要求安全上下文。`writeImages` 只检查参数是不是数组，然后空操作。

### 案例 3：Wayland 复制不能把 stderr 接到管道

`lib/wayland.js` 给 `wl-copy` 的 stdout 设 `ignore`，stderr 写到临时文件描述符。`wl-copy` 取得所有权后会 fork 常驻；如果 stdio 是管道，父进程会一直等到别人覆盖剪贴板。这是 issue #111 的合同，不是文档修辞。

## 踩过的坑

1. **在无桌面的 Linux 上当它“总能用”**：`xsel` 打不开 display 时，错误信息写明需要 X11/Wayland。headless CI 不在合同内。
2. **把 v4 CommonJS 教程抄到 5.3.2**：本 revision 是 `"type": "module"`，没有 CJS 入口。
3. **在浏览器里调用 `readSync`**：`browser.js` 固定 throw，不是“降级成异步”。
4. **以为图片 API 跨平台**：声明和 `clipboard-image` 都把能力限制在 macOS；其他平台读图为空数组，`hasImages` 为 false。
5. **把 WSL 检测写成 `WSL_DISTRO_NAME`**：clipboardy 用 `is-wsl`。那是 [[copy-paste]] 的字段。

## 适用 vs 不适用场景

**适用**：

- Node 20+ CLI / 脚本，需要 Promise 和同步两套 API
- 同时要照顾 macOS、Windows、WSL、X11、Wayland、Termux
- 浏览器打包能接受 Clipboard API + HTTPS

**不适用**：

- 没有显示服务器的 CI / 容器——源码明确拒绝
- 还在 CommonJS 且不能改 import
- 需要 Windows / Linux 上可靠的图片剪贴板
- 想要 callback / `util.inspect` 自动序列化——看 [[copy-paste]]

## 固定版本边界

- 本文绑定 `sindresorhus/clipboardy@84e8d07ceacba32d95e9072efcb7d486578ac9d2`。
- annotated tag `v5.3.2` 解引用到同一提交；npm `clipboardy@5.3.2` 的 `gitHead` 一致。
- 依赖 `execa`、`is-wsl`、`is-wayland`、`is64bit`、`powershell-utils`、`clipboard-image`。
- 未安装依赖、未跑 ava、未调用系统剪贴板。状态 `UNVERIFIED`。

## 学到什么

1. **跨平台经常是“选对外部命令”**，不是自己实现剪贴板协议。
2. **加载期绑定平台**让后续调用便宜，也让测试必须按 OS 分支看。
3. **后台常驻进程会反噬 stdio 假设**——Wayland 的临时文件描述符是为了不把管道借给 fork 出去的孩子。
4. **条件 exports 把 Node 与浏览器切成两份合同**，同步 API 不是“暂时没写”，是浏览器里不存在。

## 应用型自测

1. 在无 `TERMUX_VERSION` 的 Android 上 `import` 会怎样？
2. `write(123)` 是转换成 `"123"` 还是 TypeError？
3. Wayland 上 `wl-copy` 成功后，父进程要等到剪贴板被别人接管才返回吗？

检查点：

1. 加载 `index.js` 时立刻 throw，提示安装 Termux。
2. TypeError：`Expected a string, got number`。
3. 不会。stderr 走文件描述符，成功路径不等待后台进程退出。

## 延伸阅读

- 固定源码：[sindresorhus/clipboardy](https://github.com/sindresorhus/clipboardy) —— `84e8d07ceacba32d95e9072efcb7d486578ac9d2`
- 类型声明：`index.d.ts`（同步方法标明浏览器不可用）
- [[copy-paste]] —— CJS callback / 无捆绑 fallback 的对照
- [[tmux]] —— 终端复用器自己的 copy-mode 与系统剪贴板是另一层问题

## 关联

- [[copy-paste]] —— 同主题对照：callback、xclip、Windows VBS
- [[tmux]] —— OSC 52 / 内部缓冲区，不是 npm 剪贴板库
- [[xplr]] —— 终端文件管理器里常见的 `pbcopy` / `xclip` 自己拼命令

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
