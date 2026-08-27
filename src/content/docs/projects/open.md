---
title: open — 跨平台用 spawn 打开 URL、文件和可执行程序
description: Node 库：按平台选择 open / PowerShell Start / xdg-open，而不是 exec 拼命令。
来源: https://github.com/sindresorhus/open
日期: 2026-08-27
分类: 命令行工具
难度: 入门
difficulty: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/open
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f38acc807a8760968310759a203cf14ca4d54727
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.0.1
---

## 是什么

`open` 是一个给命令行工具和脚本用的 Node 库：你给它一个 URL、文件路径或可执行程序，它按当前平台挑启动器打开。日常类比：它不是自己当浏览器，而是帮你按对门铃——macOS 按 `open`，Windows 按 PowerShell `Start`，Linux 按 `xdg-open`。

```js
import open, {openApp, apps} from "open"

await open("https://sindresorhus.com")
await open("unicorn.png", {wait: true})
await open("https://example.com", {app: {name: apps.chrome, arguments: ["--incognito"]}})
await openApp(apps.firefox)
```

固定 `11.0.1` 是纯 ESM，`engines.node >= 20`。README 写明面向 CLI / 脚本，不面向浏览器；Electron 应改用 `shell.openPath()`。它**不提供安全保证**：不可信输入要调用方自己消毒。

## 为什么重要

不看固定源码，下面这些印象会对不上：

- 为什么 README 写 Windows 用 `start`，实现却是 PowerShell `Start` 加 Base64 编码命令
- 为什么 macOS 上 `--incognito` 必须出现在 `--args` 之后、URL 也必须跟在 `--args` 后面
- 为什么 WSL 有时走 Windows 浏览器，有时又退回 Linux `xdg-open`
- 为什么 `apps.browserPrivate` 在默认浏览器是 Safari 时直接抛错
- 为什么测试里还有 `{url: true}`，类型定义里却没有这个选项

## 核心要点

固定版本的主链可以拆成五层：

1. **入口分两条**：`open(target, options)` 要求 `target` 是 string，否则 `TypeError`。`openApp(name, options)` 只带 app，不带 target。默认选项是 `wait` / `background` / `newInstance` / `allowNonzeroExitCode` 全为 `false`。

2. **启动器按平台选，而且用 `spawn`**：darwin 调系统 `open`，可加 `--wait-apps`、`--background`、`--new`、`-a app`。win32，以及「能访问 PowerShell、不在容器、不在 SSH、未指定 app」的 WSL，走 `powershell-utils` 的 `Start`；目标若是 WSL 路径会先转成 Windows 路径。其余平台：指定了 app 就直接 spawn 它；否则优先包内可执行的 `xdg-open`，Electron / Android / 被打包成 `__dirname === '/'` 或本地脚本不可执行时改用系统 `xdg-open`。

3. **macOS 参数顺序是合同**：有 `appArguments` 时先推 `--args`，**然后**才推 `target`。注释写明这是为了让 Chrome 同时吃到 `--incognito` 和 URL。

4. **`apps` 是懒解析的平台二进制**：`chrome` / `brave` / `firefox` / `edge` 用 `define-lazy-prop` 按 `process.platform` / `arch` 选名字或路径；Linux Chrome 会依次试 `google-chrome`、`google-chrome-stable`、`chromium`、`chromium-browser`。`safari` 只定义了 darwin。`browser` / `browserPrivate` 不是路径，而是先问 `default-browser`（WSL 走 `wslDefaultBrowser`），再映射到上述浏览器；Safari 没有命令行隐私模式，`browserPrivate` 会抛错。

5. **成功与失败不是同一条等待链**：普通打开在 `spawn` 事件后 `unref` 并 resolve，不等应用退出。`wait: true` 等 `close`，非零退出码默认 reject。`app` 或 `name` 是数组时，`tryEachApp` 串行尝试；fallback 会等 launcher 很快退出并检查退出码，全失败抛 `AggregateError`。

## 实践示例

### 案例 1：默认打开与等待退出

```js
import open from "open"

const child = await open("index.js")
// 到这里 subprocess 已经 spawn，通常已 unref

await open("unicorn.png", {wait: true})
// 等的是应用进程退出，不是窗口关掉
```

Windows 上若要 `wait` 生效，类型注释要求显式指定 app。浏览器已在跑时，新 URL 常被交给旧进程，`wait` 会立刻结束。

### 案例 2：指定浏览器，并准备好失败回退

```js
import open, {apps} from "open"

await open("https://example.com", {
  app: {name: [apps.chrome, apps.firefox, "xdg-open"]},
})
```

名字数组会一个个试。某个 launcher 以非零码退出时，fallback 路径会当成失败并试下一个，而不是立刻当成功。

### 案例 3：默认浏览器的隐私模式不是万能开关

```js
import open, {apps} from "open"

await open("https://example.com", {app: {name: apps.browserPrivate}})
```

实现先解析默认浏览器 ID，再塞 `--incognito` / `--private-window` / `--inPrivate`。默认是 Safari 时直接抛 `Safari doesn't support opening in private mode via command line`。

## 踩过的坑

1. **把 README 的 “start on Windows” 当成 cmd `start`**：固定源码是 PowerShell `Start`，命令经 Base64 编码；非 `wait` 时 `stdio` 被设成 `ignore`，否则 PowerShell 会拖住父进程。

2. **在可复用模块里写死 `google chrome`**：macOS / Linux / Windows / WSL 的二进制名不同；应使用 `apps.chrome` 这类懒属性。

3. **以为 `{url: true}` 还会编码 URL**：`test.js` 留着这个选项，`index.js` 与 `index.d.ts` 都没有读取它。

4. **WSL 里指定 app 后仍期望走 Windows 集成**：指定 app 会关掉 `shouldUseWindowsInWsl`。沙箱或 SSH 里 PowerShell 不可用时，也会退回 Linux 路径。

5. **`wait` 浏览器标签**：单实例浏览器会立刻退出 launcher。macOS 可用 `newInstance` 逼出新实例；其他平台不要拿 `wait` 当“页面关了再继续”。

## 适用 vs 不适用场景

**适用**：

- CLI / 构建脚本要打开预览 URL、报告文件或编辑器
- 需要跨平台 `spawn`，并且能接受「打开了启动器 ≠ 打开了目标窗口」
- 想按平台解析 Chrome / Firefox / Edge / Brave，而不是自己维护路径表

**不适用**：

- 浏览器前端或不可信输入未消毒的服务
- Electron 应用（官方改推荐 `shell.openPath()`）
- 需要 CommonJS `require("open")`（本版本只导出 ESM）
- 要把静态阅读写成「已在本机打开成功」的运行证据

## 固定版本边界

- 本文绑定 `sindresorhus/open@f38acc807a8760968310759a203cf14ca4d54727`，tag `v11.0.1` 与 npm `open@11.0.1` `gitHead` 一致。
- `package.json` 发布 `index.js`、`index.d.ts` 和 vendored `xdg-open`。
- 运行时依赖 `default-browser`、`wsl-utils`、`powershell-utils`、`is-inside-container`、`is-in-ssh`、`define-lazy-prop`；本轮未打开这些包的源码。
- 未安装依赖、未跑 `xo` / `tsd` / `ava`，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨平台打开是选启动器，不是自己实现协议。**
2. **`spawn` 解决的是命令注入面，不是「用户给的 URL 一定安全」。**
3. **成功分三档：spawn 成功、launcher 退出码 0、目标应用真的退出。** 默认只保证第一档。
4. **WSL 的 Windows 集成是有条件的探测，不是「在 WSL 就等于 Windows」。**

## 应用型自测

1. 固定 11.0.1 在 Windows 上实际 spawn 的是 `start` 还是 PowerShell？命令为什么要 Base64？
2. macOS 上 `open -a "chrome" --args --incognito https://site.com` 里，URL 为什么必须在 `--args` 后面？
3. WSL 在什么条件下会改走 Linux `xdg-open`，而不是 PowerShell？

检查点：

1. PowerShell `Start`。特殊字符经 `executePowerShell.encodeCommand` 编码，避免命令行被拆坏。
2. `--args` 之后的全部参数都交给被打开的应用；URL 放前面就进不了 Chrome 的 argv。
3. 指定了 `app`、在容器里、在 SSH 里，或 `canAccessPowerShell()` 为假时，不会启用 Windows 集成。

## 延伸阅读

- 固定源码：[sindresorhus/open](https://github.com/sindresorhus/open) —— 本文绑定 `f38acc807a8760968310759a203cf14ca4d54727`
- 对照入口：`index.js`、`index.d.ts`、`xdg-open`
- 审查记录：仓库内 `docs/open-url-source-review-20260827-eq.md`
- [[open-cli]] —— 同一作者给这个库做的命令行包装

## 关联

- [[open-cli]] —— `bin` 入口把 stdin / 位置参数交给 `open`
- [[ora]] —— 同作者的终端库，解决的是「同一行重绘」而不是打开外部应用
- [[commander]] —— 自己写 CLI 时常用的参数解析，和 `open` 正交

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
