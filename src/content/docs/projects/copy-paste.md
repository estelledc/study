---
title: copy-paste — 用 spawn/execSync 把系统剪贴板做成 callback
description: CommonJS 系统剪贴板封装，用 spawn/execSync 调用 pbcopy、xclip、wl-copy 或 clip。
来源: https://github.com/xavi-/node-copy-paste
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/xavi-/node-copy-paste
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 393ca5c012c7a2aa6b2534b70eff10d95644d200
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.1
---

## 是什么

`copy-paste`（仓库 `xavi-/node-copy-paste`）是一个 **CommonJS 的系统剪贴板封装**：复制走 `spawn`，无回调的粘贴走 `execSync`。日常类比：它不发明剪贴板协议，只按操作系统点名外部命令，再把 stdin/stdout 接上。

```js
const { copy, paste } = require("copy-paste")

copy("some text", (err) => {
  const text = paste()
})
```

`copy` 立刻返回入参；真正写入在子进程 `exit` 之后。Promise 入口是另外的 `require("copy-paste/promises")`。

## 为什么重要

不读这层 spawn 合同，你会把 2013 年的 callback 库当成 [[clipboardy]]：

- 为什么 `copy({a:1})` 也能“成功”——对象被 `util.inspect` 成字符串，不是 JSON
- 为什么 Windows 粘贴要绕 VBS + Base64——`clip.exe` 只负责写入
- 为什么 Wayland 检测只看 `WAYLAND_DISPLAY`——没有 `is-wayland` 包
- 为什么不能把 npm latest `2.2.0` 直接钉到 GitHub——那个 `gitHead` 在 canonical remote 不可达

## 核心要点

加载时按 `process.platform` 选一份 `platform/*.js` 配置（command / args / encode / decode）：

1. **darwin**：`pbcopy` / `pbpaste`，复制环境带 `LANG=en_US.UTF-8`。
2. **linux / freebsd / openbsd**：默认 `xclip -selection clipboard`。`WSL_DISTRO_NAME` 存在时改 `clip.exe` + `powershell.exe Get-Clipboard`，decode 时丢掉最后两个字符。
3. **linux + `WAYLAND_DISPLAY`**：改 `wl-copy` / `wl-paste`；WSL 下复制仍用 `clip.exe`。
4. **win32**：`clip` 写入（`iconv-lite` 编成 UTF-16LE）；粘贴跑 `cscript` 执行 `paste.vbs`，stdout 当 cp437 文本再 Base64 解码并去掉 BOM。
5. **android**：`termux-clipboard-set/get`，没有 Termux 存在性检查。

`copy.json` 是 `JSON.stringify(obj, null, "\t")` 再交给 `copy`。`global()` 会把 `copy` / `paste` 挂到 `global`。

## 实践示例

### 案例 1：callback 复制，同步粘贴

```js
const { copy, paste } = require("copy-paste")

copy("hello", (err) => {
  if (err) throw err
  console.log(paste())
})
```

无回调时，`paste` 用 `execSync(command + args)`，`maxBuffer` 为 10 MiB。有回调则 `spawn`，在 stdout `end` 时 `decode`。

### 案例 2：Promise 子模块

```js
const { copy, paste } = require("copy-paste/promises")

await copy.json({ name: "John", age: 30 })
const text = await paste()
// {\n\t"name": "John",\n\t"age": 30\n}
```

`promises.js` 只是给主模块的 callback 包一层 Promise。测试里 JSON 用例断言的就是这串带 Tab 缩进的文本。

### 案例 3：非字符串复制

```js
copy({ hello: "world" })
copy(["a", "b"])
copy(null)
```

`Object.prototype.toString` 分流：string 原样；object / array 走 `util.inspect(..., {depth: null})`；`null` / `undefined` 变成 `"null"` / `"undefined"`；其余 `toString()`。可读流则 `pipe` 到子进程 stdin。

## 踩过的坑

1. **把 npm `2.2.0` 当成可复查源码**：registry 的 `gitHead=5fd81dfd...` 在 `xavi-/node-copy-paste` 不存在。GitHub `master` 头是 `5283d50...`，`package.json` 仍写 `2.1.1`。本页只钉可达的 `393ca5c0...` / `2.1.1`。
2. **当 `copy(obj)` 等于 `copy.json(obj)`**：前者是 inspect 文本，后者才是 JSON。
3. **Linux 上以为有捆绑 `xsel`**：本 revision 依赖系统 `xclip` 或 `wl-copy`，没有 fallback 二进制。
4. **在 Windows 上当粘贴是 `clip.exe`**：`clip` 只用于复制；粘贴是 `htmlfile.ClipboardData` + Base64。
5. **调用 `global()` 当无害 helper**：它写 `global.copy` / `global.paste`。

## 适用 vs 不适用场景

**适用**：

- 已有 CJS 脚本，接受 callback 或再包一层 Promise
- 需要 `copy.json`、stream pipe，或把对象 inspect 进剪贴板
- 平台命令已经装好：`xclip` / `wl-clipboard` / Termux / `clip`

**不适用**：

- 新 ESM 项目想要默认 Promise 和捆绑 fallback——看 [[clipboardy]]
- 必须钉 npm latest 且要求 GitHub 上存在同一 `gitHead`
- 无显示服务器的 CI
- 不能接受 Windows 粘贴走 VBScript / `htmlfile`

## 固定版本边界

- 本文绑定 `xavi-/node-copy-paste@393ca5c012c7a2aa6b2534b70eff10d95644d200`（提交说明 `v2.1.1`）。
- npm `copy-paste@2.1.1` 的 `gitHead` 与该提交一致。
- npm latest `2.2.0` 的 `gitHead` 在 canonical remote 不可达；未猜测或伪造 2.2.0 revision。
- `HEAD` `5283d50...` 只多了 README 的 TypeScript 说明，`package.json` 仍是 2.1.1。
- 未安装 `iconv-lite`、未跑 `node --test`、未触系统剪贴板。状态 `UNVERIFIED`。

## 学到什么

1. **callback 库的“返回值”常常是入参**，完成信号在 callback / Promise 里。
2. **平台表比抽象类更常见**——一份 command/args/encode 就能覆盖五六个 OS。
3. **Windows 剪贴板的读写可以不对称**：写入用控制台 `clip`，读出用脚本宿主。
4. **latest 标签不是 provenance**——registry 和 GitHub 对不上时，停在能同时核验的版本。

## 应用型自测

1. 不传 callback 时，`paste()` 走 `spawn` 还是 `execSync`？
2. `copy({a:1})` 写进剪贴板的是 JSON 还是 `util.inspect` 文本？
3. npm `copy-paste@2.2.0` 的 `gitHead` 能否在本页绑定的 GitHub 仓库检出？

检查点：

1. `execSync`。同步路径在无 callback 时直接跑拼接后的命令字符串。
2. `util.inspect`。要 JSON 必须走 `copy.json`。
3. 不能。`5fd81dfd...` 在 canonical remote 不存在，所以本页钉 2.1.1。

## 延伸阅读

- 固定源码：[xavi-/node-copy-paste](https://github.com/xavi-/node-copy-paste) —— `393ca5c012c7a2aa6b2534b70eff10d95644d200`
- Promise 入口：同仓库 `promises.js`
- [[clipboardy]] —— ESM / execa / 捆绑 fallback 的对照
- [[tmux]] —— 终端内部 copy-mode，不是这层 npm 封装

## 关联

- [[clipboardy]] —— 同主题对照：Promise、xsel、PowerShell 优先
- [[tmux]] —— 系统剪贴板之外的终端缓冲区
- [[xplr]] —— 自己拼 `pbcopy` / `xclip` 的终端工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
