---
title: env-paths — 按操作系统拼出应用自己的用户目录
description: 只生成 data/config/cache/log/temp 字符串，并默认加上 nodejs 后缀
来源: https://github.com/sindresorhus/env-paths
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/env-paths
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c3c0dd464c268a99a28feeaec54c54d0a12c4291
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.0
---

## 是什么

env-paths 是一个给 Node 应用拼用户目录的小函数。日常类比：它像酒店前台按房号发的钥匙卡——你报应用名，它按当前操作系统写出 data、config、cache、log、temp 五条路径；**不帮你开门，也不建房间**。

你写：

```js
import envPaths from "env-paths"

const paths = envPaths("MyApp")
paths.data
// Linux 默认类似 ~/.local/share/MyApp-nodejs
```

固定 4.0.0 是 ESM，`engines.node >= 20`。默认 suffix 是 `nodejs`，避免和同名原生应用抢目录。

## 为什么重要

不看固定入口，容易把“XDG 规范”和“跨平台应用目录”混成一件事：

- 为什么默认路径末尾是 `MyApp-nodejs` 而不是 `MyApp`
- 为什么 Windows 的 Data / Config / Cache / Log 不是系统规定
- 为什么 Linux 的 log 走 `XDG_STATE_HOME`，不是 `XDG_DATA_HOME`
- 为什么空字符串或带 `/` 的名字会直接抛错

一句话：env-paths 的合同是 **按平台拼五条字符串，并先检查文件名安全**。

## 核心要点

固定 4.0.0 的主链可以拆成五步：

1. **断言名字**：`assertSafeFilename(name)` 拒绝空串、路径分隔和 `..` 一类不安全文件名。
2. **加后缀**：默认 `name += '-nodejs'`；`suffix: ''` 才关掉。拼完再断言一次，所以危险 suffix 也会被拒。
3. **选平台**：`darwin` 走 `~/Library/...`；`win32` 走 `APPDATA` / `LOCALAPPDATA`；其余平台走 XDG 回退。
4. **只返回对象**：`{data, config, cache, log, temp}` 全是 `string`。类型文件也写成必有字符串，没有 `undefined`。
5. **不建目录**：文档和实现都只生成路径。调用方自己 `fs.mkdir(..., {recursive: true})`。

`os.homedir()` 和 `os.tmpdir()` 在模块加载时就读好了。本轮没有改环境后再热加载验证。

## 实践示例

### 案例 1：默认 suffix 是防冲突，不是装饰

```js
import envPaths from "env-paths"

envPaths("MyApp").config
// Linux：~/.config/MyApp-nodejs
envPaths("MyApp", {suffix: ""}).config
// Linux：~/.config/MyApp
```

测试断言默认五条路径都以 `${name}-nodejs` 结尾。作者把 suffix 标成 “Don't use this option unless you really have to”。

### 案例 2：Linux log 是 state，不是 data

```js
process.env.XDG_STATE_HOME = "/tmp/XDG_STATE_HOME"
const {log} = envPaths("unicorn")
// 以 /tmp/XDG_STATE_HOME 开头，以 unicorn-nodejs 结尾
```

Linux 测试改的是 `XDG_DATA_HOME` / `XDG_CONFIG_HOME` / `XDG_CACHE_HOME` / `XDG_STATE_HOME`。把 log 写进 `~/.local/share` 就和 4.0.0 不符。

### 案例 3：Windows 子目录是作者补的

```js
// win32 且未设置环境变量时：
// data  -> %USERPROFILE%\AppData\Local\<name>\Data
// config -> %USERPROFILE%\AppData\Roaming\<name>\Config
```

源码注释写：`Data/config/cache/log are invented by me as Windows isn't opinionated about this`。不要把这些子目录名当成 Microsoft 官方布局。

## 踩过的坑

1. **以为它会创建目录**：实现只 `path.join`。第一次写入前要自己 mkdir。
2. **关掉 suffix 去抢原生应用目录**：默认加 `-nodejs` 就是为了这个。
3. **把非 Windows / 非 macOS 都当成“真 Linux”**：`else` 分支包含 FreeBSD 等，统一套 XDG 回退。
4. **Linux temp 不是 `/tmp/MyApp`**：它是 `tmpdir / basename(homedir) / name`。
5. **把下载量、跨平台实测或 Windows 实机路径写进结论**：本轮只读源码，没有跑测试。

## 适用 vs 不适用场景

**适用**：

- 需要一份跨平台、按应用名隔离的 data/config/cache/log/temp
- 能接受默认 `-nodejs` 后缀，或明确传入安全 suffix
- 调用方自己负责建目录和权限

**不适用**：

- 只要 Linux XDG **基目录**、不要应用名后缀——那是 [[xdg-basedir]]
- 必须兼容 Node 18；固定包声明 `>=20`
- 需要本轮未核验的 Windows / macOS 实机路径或性能数字

## 固定版本边界

- 本文绑定 `sindresorhus/env-paths@c3c0dd46...`，annotated tag `v4.0.0`、package 与 npm `gitHead` 均为同一提交。
- 运行时依赖 `is-safe-filename`，本轮未打开那个包。
- 本文只做源码静态审查，没有执行 `xo` / `ava` / `tsd`，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨平台用户目录是函数结果，不是套 XDG 环境变量**——macOS 和 Windows 走各自约定。
2. **默认 suffix 是隔离合同**——空 suffix 才会跟原生应用同名。
3. **文件名要检查两次**：原始 name 和 name+suffix 都可能不安全。
4. **返回值不是存在的目录**——只是五条字符串。

## 应用型自测

1. `envPaths("MyApp")` 在 Linux 上默认 config 目录名是 `MyApp` 还是 `MyApp-nodejs`？
2. Linux 的 `paths.log` 读哪个 XDG 变量？
3. `envPaths("../x")` 会返回一条相对路径吗？

检查点：

1. `MyApp-nodejs`。默认 suffix 是 `nodejs`。
2. `XDG_STATE_HOME`，回退 `~/.local/state`。
3. 不会。`assertSafeFilename` 会抛 `Unsafe filename`。

## 延伸阅读

- 固定源码：[sindresorhus/env-paths](https://github.com/sindresorhus/env-paths) —— 本文绑定提交 `c3c0dd464c268a99a28feeaec54c54d0a12c4291`
- 对照入口：`index.js` 的 `macos` / `windows` / `linux`
- [[xdg-basedir]] —— 只要 XDG 基目录、不拼应用名

## 关联

- [[xdg-basedir]] —— Linux 基目录常量，env-paths 的 Linux 分支与它对齐但不互相替代
- [[unstorage]] —— 存什么；本页只回答存到哪

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
