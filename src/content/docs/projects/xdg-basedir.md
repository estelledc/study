---
title: xdg-basedir — 只给出 Linux 用户的 XDG 基目录
description: 在 import 时读 XDG 环境变量，不拼应用名，缺 home 时可为 undefined
来源: https://github.com/sindresorhus/xdg-basedir
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/xdg-basedir
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8cceade858e4da18cb971bf1844f086e9e213563
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.1.0
---

## 是什么

xdg-basedir 是一个只实现 [XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html) **基目录**的 ESM 包。日常类比：它像大楼门牌，告诉你资料室、配置室、仓库在哪一层；**不管你的应用叫什么，也不帮你在门牌后面再建一间房**。

你写：

```js
import {xdgData, xdgConfig, xdgDataDirectories} from "xdg-basedir"

xdgData
// 常见：~/.local/share
xdgDataDirectories
// 常见：['~/.local/share', '/usr/local/share/', '/usr/share/']
```

固定 5.1.0 面向 Linux。README 写明 macOS / Windows 不要套 XDG，应改用 [[env-paths]]。

## 为什么重要

不看固定入口，容易把它当成“Linux 版 env-paths”：

- 为什么没有 `xdgData("MyApp")` 这种函数
- 为什么单条路径的类型是 `string | undefined`
- 为什么 `xdgRuntime` 没有 `~/.runtime` 之类的回退
- 为什么搜索列表前面会被 unshift 进用户目录

一句话：xdg-basedir 的合同是 **import 时读环境，给出基目录或 undefined**。

## 核心要点

固定 5.1.0 的主链可以拆成五步：

1. **加载即求值**：`os.homedir()` 和 `process.env` 在模块顶层读一次。之后改环境变量不会更新已导入的常量。
2. **四条可回退路径**：`xdgData` / `xdgConfig` / `xdgState` / `xdgCache` 优先读 `XDG_*_HOME`，否则用 home 拼 `.local/share`、`.config`、`.local/state`、`.cache`。
3. **runtime 没有 home 回退**：`xdgRuntime = env.XDG_RUNTIME_DIR || undefined`。
4. **搜索列表带默认值**：`XDG_DATA_DIRS` 默认 `/usr/local/share/:/usr/share/`，`XDG_CONFIG_DIRS` 默认 `/etc/xdg`，按 `:` 切开。
5. **用户目录插到最前**：若 `xdgData` / `xdgConfig` 有值，就 `unshift` 进对应数组。类型是 `readonly string[]`。

home 和环境变量都缺时，四条 `xdg*` 是 `undefined`。README 要求调用方自己处理，常见做法是再退到临时目录。

## 实践示例

### 案例 1：基目录不含应用名

```js
import {xdgConfig} from "xdg-basedir"

// 这是 ~/.config，不是 ~/.config/MyApp
const configFile = `${xdgConfig}/MyApp/config.json`
```

应用子路径要自己拼。env-paths 才会在 Linux 上直接给出 `~/.config/MyApp-nodejs`。

### 案例 2：必须处理 undefined

```js
import {xdgCache, xdgRuntime} from "xdg-basedir"
import os from "node:os"

const cache = xdgCache ?? os.tmpdir()
if (!xdgRuntime) {
  throw new Error("XDG_RUNTIME_DIR is unset")
}
```

`index.d.ts` 对单路径使用 `expectError<string>(...)`，不允许把它们当成一定存在的 `string`。

### 案例 3：搜索顺序是“用户目录 + 系统目录”

```js
import {xdgDataDirectories} from "xdg-basedir"

// 未设置 XDG_DATA_DIRS 时：
// [xdgData, '/usr/local/share/', '/usr/share/']
```

默认字符串带尾斜杠；`xdgData` 由 `path.join` 生成，通常不带。本轮没有跑运行时去核对拼接后的查找行为。

## 踩过的坑

1. **在 macOS / Windows 上当跨平台方案**：作者明确反对。那边应走 [[env-paths]]。
2. **当成函数反复调用**：导出是常量。改 `process.env` 后再读同一个绑定，值不会变。
3. **忘记 `xdgRuntime` 可以是 undefined**：它是唯一没有 home 回退的项。
4. **把注释掉的测试当现行合同**：`test.js` 因 ESM 下 `import-fresh` 不可用，只留 `t.pass()`。
5. **假设默认列表元素格式统一**：默认系统路径带 `/`，用户目录通常不带。

## 适用 vs 不适用场景

**适用**：

- 目标环境是 Linux / 其他按 XDG 行事的 Unix
- 只要基目录或系统搜索列表，应用名自己拼
- 能处理 `undefined`，尤其是 runtime 目录

**不适用**：

- 需要 macOS Library 或 Windows AppData 约定
- 需要默认 `-nodejs` 应用隔离目录——那是 [[env-paths]]
- 需要本轮未执行的测试、目录创建或权限检查

## 固定版本边界

- 本文绑定 `sindresorhus/xdg-basedir@8cceade8...`，annotated tag `v5.1.0`、package 与 npm `gitHead` 均为同一提交。
- `engines.node >= 12`；实现用 `os` / `path` 的非 `node:` 说明符，并直接读全局 `process`。
- 本文只做源码静态审查，没有执行上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **XDG 基目录和应用目录是两层**——本包只做第一层。
2. **import 时快照环境**——它不是每次调用都重读 `process.env`。
3. **undefined 是公开合同**，runtime 尤其如此。
4. **搜索列表把用户目录插到最前**，默认系统路径仍按冒号切开。

## 应用型自测

1. `import {xdgData} from "xdg-basedir"` 得到的是 `~/.local/share` 还是 `~/.local/share/MyApp`？
2. 未设置 `XDG_RUNTIME_DIR` 时，`xdgRuntime` 会不会回退到 home？
3. 改完 `process.env.XDG_CONFIG_HOME` 后，已经 import 的 `xdgConfig` 会更新吗？

检查点：

1. 只有基目录，不含应用名。
2. 不会。它只读 `XDG_RUNTIME_DIR`。
3. 不会。常量在模块加载时已经算完。

## 延伸阅读

- 规范：[XDG Base Directory](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html)
- 固定源码：[sindresorhus/xdg-basedir](https://github.com/sindresorhus/xdg-basedir) —— 本文绑定提交 `8cceade858e4da18cb971bf1844f086e9e213563`
- [[env-paths]] —— 跨平台、按应用名拼五条路径

## 关联

- [[env-paths]] —— 同一作者给的跨平台应用目录；Linux 分支读同一组 XDG 变量
- [[unstorage]] —— 存取抽象；本页只回答 Linux 基目录在哪

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
