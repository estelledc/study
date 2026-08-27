---
title: normalize-path — 折叠斜杠并改写 Windows namespace
description: 固定 3.0.0：split 折叠分隔符，默认剥尾，\\?\ 收成 //?/
来源: https://github.com/jonschlinkert/normalize-path
日期: 2026-08-27
分类: 基础设施
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jonschlinkert/normalize-path
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ea100bbecf851e2cc89e54e295e91af7b835fe63
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.0
---

## 是什么

normalize-path 是一个 **把路径分隔符收成 POSIX 正斜杠，并顺便折叠重复段、默认去掉尾巴** 的 CJS 单函数库。日常类比：它不只换标点，还会把双开的门并成一扇，除非你喊停，否则门厅尽头那道空门也拆掉。

```js
const normalize = require('normalize-path')

normalize('foo\\bar\\baz\\')
// foo/bar/baz
normalize('E://foo//bar//baz//', false)
// E:/foo/bar/baz/
```

固定 `3.0.0` 先处理 win32 namespace，再按 `/` 或 `\` 切开重组。它**不**解析 `.` / `..`。

## 为什么重要

不看 `index.js`，容易把它和 [[slash]] 当成同一个“换斜杠”：

- 为什么 `foo\\\\bar/` 在这里会变成 `foo/bar`，在 slash 里却变成 `foo//bar/`
- 为什么 `\\?\C:\user\docs\Letter.txt` 会变成 `//?/C:/user/docs/Letter.txt`
- 为什么第二参数要显式 `false` 才能留住尾巴
- 为什么 v3 不再依赖 `remove-trailing-separator`

一句话：它是 **分隔符规范化 + namespace 改写**，不是 `path.normalize`。

## 核心要点

固定 3.0.0 的主链可以拆成五步：

1. **类型门**：输入不是字符串就抛 `TypeError('expected path to be a string')`。
2. **单分隔符短路**：`path === '\\' || path === '/'` 时返回 `'/'`；`length <= 1` 原样返回，所以 `''` 和 `'.'` 能活下来。
3. **win32 namespace**：当长度大于 4、第 4 个字符是 `\`、前两字是 `\\`、第三字是 `?` 或 `.` 时，剥掉开头的两个反斜杠，并记住前缀 `//`。注释写明是为了让之后的 `path.parse` 仍看到两个前导斜杠。
4. **切开再拼**：`path.split(/[/\\]+/)` 把一串 `/` 或 `\` 当成一个分隔符，所以重复段被折叠。
5. **默认剥尾**：`stripTrailing !== false` 且最后一段是空字符串时 `pop()`。只有传入 `false` 才保留 `foo/bar/`。

相对 `2.1.1`，v3 把 `remove-trailing-separator` 内联进同一函数，并补上 namespace 前缀。运行时依赖为零；引擎仍写 `node >= 0.10.0`。

## 实践示例

### 案例 1：Windows 与重复斜杠收成一段

```js
const normalize = require('normalize-path')

normalize('C:\\user\\docs\\Letter.txt')
// C:/user/docs/Letter.txt
normalize('E://foo//bar//baz//////')
// E:/foo/bar/baz
```

`test.js` 里还有 `..\\..\\foo/bar` → `../../foo/bar`：相对段还在，只是分隔符被收齐。

### 案例 2：默认剥尾，显式留下

```js
const normalize = require('normalize-path')

normalize('foo\\bar\\baz\\')
// foo/bar/baz
normalize('foo/bar/baz/', false)
// foo/bar/baz/
normalize('/', false)
// /   ← 单独的根仍是 /
```

第二参数的默认值是“剥”，不是“留”。要尾巴必须传 `false`。

### 案例 3：`\\?\` / `\\.\` 会被改写，不是原样返回

```js
const normalize = require('normalize-path')

normalize('\\\\?\\C:\\user\\docs\\Letter.txt')
// //?/C:/user/docs/Letter.txt
normalize('\\\\.\\CdRomX')
// //./CdRomX
```

这和 [[slash]] 相反：slash 看见 `\\?\` 就停手。这里要先剥 `\\` 再加 `//`，好让 win32 `path.parse` 继续把它们当 namespace。

## 踩过的坑

1. **默认会丢掉末尾 `/`**：目录语义如果靠尾巴区分，必须传 `false`。
2. **`\\?\` 不会保持反斜杠**：不要用它当“extended-length 保护罩”。
3. **它不解析 `..`**：`normalize('../../foo/bar')` 仍是 `../../foo/bar`。要叠目录得走 `path.normalize`。
4. **把 npm `gitHead` 当成 3.0.0 源码身份**：registry 记的是父提交 `0979eb80...`，那份 `package.json` 仍写 `2.1.1`；真正自报 `3.0.0` 的是 tag 提交，两边 `index.js` 相同。
5. **把 README 里的吞吐数字当本轮证据**：仓内有 `benchmark/`，本文未跑。

## 适用 vs 不适用场景

**适用**：

- glob / watcher / 跨平台配置需要把 `\` 和重复 `/` 收成稳定键
- 要让 `\\?\` / `\\.\` 变成 `path.parse` 还能认的 `//?/` / `//./`
- 调用方能接受 CJS `require`，或自己做一层 ESM 包装

**不适用**：

- 只想换分隔符、连尾巴和重复斜杠都要留——那是 [[slash]]
- 必须保留 `\\?\` 原串
- 需要解析 `.` / `..`、盘符相对路径或 symlink——那是 Node `path`

## 固定版本边界

- 本文绑定 `jonschlinkert/normalize-path@ea100bbe...`，即 lightweight tag `3.0.0`。
- npm `normalize-path@3.0.0` 的 `gitHead` 是它的直接祖先，tree diff 只有 `version` 字段；源码函数体相同。
- `origin/master` 在审查日还有后续 merge，但 `index.js` 与本 tag 相同；未绑定 master。
- 本文未安装 mocha，未跑测试或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **规范化可以只碰分隔符**——折叠和剥尾不等于解析 `..`
2. **Windows namespace 是第三条路**——既不是“原样留下”，也不是“当成普通盘符”
3. **默认参数改语义**——`stripTrailing !== false` 让“忘记传参”等于剥尾
4. **发布身份要对齐自报版本**——gitHead 和 tag 可能差一个 version bump

## 应用型自测

1. `normalize('foo\\\\bar/')` 的结果是什么？若要留下尾巴该怎么写？
2. `normalize('\\\\?\\C:\\user\\docs\\Letter.txt')` 和 [[slash]] 对同一输入的处理差在哪？
3. `normalize(1)` 会怎样？

检查点：

1. `foo/bar`。留下尾巴要 `normalize('foo\\\\bar/', false)` → `foo/bar/`。
2. 这里变成 `//?/C:/user/docs/Letter.txt`；slash 原样返回，反斜杠还在。
3. 抛 `TypeError('expected path to be a string')`。

## 延伸阅读

- 固定源码：[jonschlinkert/normalize-path](https://github.com/jonschlinkert/normalize-path) —— 本文绑定提交 `ea100bbecf851e2cc89e54e295e91af7b835fe63`
- 对照入口：`index.js`、`test.js`、tag `2.1.1` 的旧实现
- [[slash]] —— 只做 `\\` → `/`，并放过 `\\?\`
- [[node-js]] —— `path.win32.parse` 为何在意两个前导斜杠

## 关联

- [[slash]] —— 更薄的分隔符翻译，默认不折叠、不剥尾
- [[node-js]] —— namespace 与 `path.parse` 的运行时背景
- [[vite]] —— 构建链路里常见的 POSIX 路径键
- [[webpack]] —— 另一处依赖稳定路径字符串的打包器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[slash]] —— slash — 只换分隔符的 Windows 路径翻译
