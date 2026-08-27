---
title: fast-glob — 先拆任务再走路的 Node glob
description: 固定版本把 pattern 收成 base 任务，动态走 walk、静态走 stat
来源: https://github.com/mrmlnc/fast-glob
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mrmlnc/fast-glob
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 48687898dd26d4e935a0e5ecf6720e7c5aeac15d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.3.3
---

## 是什么

fast-glob 是一份 Node 文件匹配库。日常类比：它不是拿着一张通配符地图满山找，而是先把 pattern 拆成“从哪条小路出发”，再决定这条路该走目录遍历还是直接 stat。

固定 `3.3.3` 的默认导出是异步函数；同一对象上还挂着 `sync`、`stream` 和任务辅助函数。包是 CommonJS，引擎声明 `node >=8.6.0`。

```js
const fg = require("fast-glob")

const files = await fg(["src/**/*.ts", "!src/**/*.test.ts"])
```

匹配规则走 `micromatch`；动态遍历走 `@nodelib/fs.walk`。README 写明结果顺序任意。

## 为什么重要

不看固定源码，容易把 fast-glob 说成“更快的 minimatch”：

- 为什么 `src/*.ts` 和 `../pkg/*.ts` 不会共用一次目录遍历
- 为什么默认只回文件、不回目录
- 为什么 `!(a|b)` 不是 ignore，而 `!a` 才是
- 为什么空字符串会立刻抛错，而不是静默跳过

一句话：它的合同是 **pattern → task → reader → micromatch 过滤**，不是一次正则扫完整棵树。

## 核心要点

固定版本的主链可以拆成四步：

1. **校验输入**：`assertPatternsInput` 要求非空字符串或这类数组。空串、数字、对象都会抛 `TypeError`。
2. **收成 Settings**：默认 `onlyFiles=true`、`unique=true`、`followSymbolicLinks=true`、`braceExpansion=true`、`extglob=true`、`globstar=true`、`caseSensitiveMatch=true`、`dot=false`、`deep=Infinity`。`onlyDirectories` 会关掉 `onlyFiles`；`stats` 会打开 `objectMode`。并发默认 `max(os.cpus().length, 1)`。
3. **生成 Task**：brace 先被 `micromatch.braces` 展开。`glob-parent` 给出 base。当前目录里只要有一条 pattern 的 base 是 `.`，就合并成一条全局任务，少扫几遍盘。
4. **按任务读盘**：动态 pattern 走 `fs.walk`；静态 pattern 走 stream reader 再收集。EntryFilter 用 `micromatch.makeRe`；DeepFilter 决定要不要继续下钻。默认只吞 `ENOENT`。

否定 pattern 的判定是 `startsWith('!') && pattern[1] !== '('`。所以 `!(src|lib)` 仍是 extglob。

## 实践示例

### 案例 1：异步默认入口

```js
const fg = require("fast-glob")

const files = await fg("src/**/*.js", { cwd: process.cwd(), dot: false })
```

`fg(...)` 就是 `FastGlob.async`。没开 `objectMode` / `stats` 时，返回值是字符串路径。`dot` 默认 false，`.env` 不会进结果。

### 案例 2：同步与只看目录

```js
const dirs = fg.sync("packages/*", { onlyDirectories: true })
```

`onlyDirectories` 在 Settings 构造期把 `onlyFiles` 置 false。否则默认过滤器会丢掉所有目录。

### 案例 3：先看任务，再决定要不要自己跑

```js
const tasks = fg.generateTasks(["src/*.ts", "!src/*.test.ts", "../shared/*.ts"])
```

每条 Task 带 `base`、`dynamic`、`positive`、`negative`。`../shared/*.ts` 会单独成组，因为遍历不能从 `cwd` 往下走到父目录。

## 踩过的坑

1. **把 `!(a|b)` 当成 ignore**：固定实现里这是 extglob。要排除应写 `!a` 或把 pattern 放进 `ignore`。
2. **以为默认包含目录**：`onlyFiles` 默认 true。需要目录时显式 `onlyDirectories` 或 `onlyFiles: false`。
3. **拿 Windows `path.join` 拼 pattern**：库内部用正斜杠。反斜杠不会按你想的展开。
4. **把 README 的“probably the fastest”写进选型结论**：本文没有跑 product / regression bench。
5. **空字符串当“跳过”**：输入校验直接抛错。

## 适用 vs 不适用场景

**适用**：

- 构建脚本、测试发现、codegen 需要在 Node 里按 glob 找文件
- 能接受默认“只要文件、顺序任意、不读 gitignore”
- 需要 sync / Promise / stream 三套入口，且能自己处理绝对路径与 objectMode

**不适用**：

- 需要默认尊重 `.gitignore`：那是 [[globby]] 的附加层
- 要把未实测的吞吐或“比 node-glob 快多少”写成证据
- 运行时低于声明的 Node 8.6，或必须 ESM 默认导出

## 固定版本边界

- 本文绑定 `mrmlnc/fast-glob@48687898...`，tag / npm `fast-glob@3.3.3` 的 `gitHead` 一致。
- 运行时依赖是 `@nodelib/fs.stat`、`@nodelib/fs.walk`、`glob-parent`、`merge2`、`micromatch`。
- stream 无论任务数都 `merge2` 多路复用；源码注释写的 +25% 不是本页测量。
- 未安装依赖、未跑 test / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **glob 的成本在任务切分**，不在“会不会写 `**`”
2. **静态路径和动态通配不是一条 reader**
3. **`!` 的两种语法必须分开读**：否定与 extglob
4. **默认值就是产品判断**：只要文件、跟随 symlink、不看点文件

## 应用型自测

1. `fg.sync('packages/*')` 默认会返回 `packages/foo` 这个目录吗？
2. pattern `!(src|test)` 会不会被当成 ignore？
3. `fg('')` 会返回空数组还是抛错？

检查点：

1. 不会。默认 `onlyFiles=true`，目录被过滤器丢掉。
2. 不会。`!(` 走 extglob，不是否定。
3. 抛 `TypeError`。空字符串非法。

## 延伸阅读

- 固定源码：[mrmlnc/fast-glob](https://github.com/mrmlnc/fast-glob) —— 本文绑定提交 `48687898dd26d4e935a0e5ecf6720e7c5aeac15d`
- 审查记录：仓库内 `docs/glob-source-review-20260827-ek.md`
- [[globby]] —— 在这份 walker 上加目录展开和 gitignore
- [[vite]] —— 常见的上层构建入口，消费 glob 而不是实现它
- [[webpack]] —— 另一条会大量使用文件匹配的打包器

## 关联

- [[globby]] —— user-friendly 包装：gitignore、目录展开、否定-only
- [[vite]] —— 开发服务器 / bundler 侧的 glob 消费者
- [[webpack]] —— 老一代打包器，同样依赖文件图
- [[vitest]] —— 测试发现常用 glob
- [[rollup]] —— 更小的打包器对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
