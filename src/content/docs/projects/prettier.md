---
title: Prettier — 把源码打成一份 doc IR 再打印
description: 固定版本的 format 主链是 parse → printAstToDoc → printDocToString
来源: https://github.com/prettier/prettier
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/prettier/prettier
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8f0c95057cc91d5836409466cd9d9af3bb901e84
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.9.6
---

## 是什么

Prettier 是一个 **opinionated 代码格式化器**：输入源码，输出按固定规则排好的文本。日常类比：它不是质检员挑逻辑问题，而是排版车间——先把稿子解析成树，再画一份可折行的版面说明书，最后按页宽印出来。

固定 3.9.6 的 npm 包名是 `prettier`，CLI 入口是 `bin/prettier.cjs`。公开 `format()` 定义在 `src/index.js`：

```js
const formatted = await prettier.format("foo ( );", { parser: "babel" });
```

`format()` 只是 `formatWithCursor()` 的薄包装，并把 `cursorOffset` 设成 `-1`。`check()` 则比较 `format(text) === text`。

## 为什么重要

不看固定主链，容易把 Prettier 说成“把空格对齐的正则脚本”：

- 为什么改 `printWidth` 会整组换行，而不是逐 token 挤到下一行
- 为什么 `--check` 发现未格式化文件时 exit 1，解析失败却是 2
- 为什么 `--write` 在内容没变时故意不写盘
- 为什么 npm 上的 `gitHead` 不能直接当 GitHub 提交用

一句话：3.9.6 的核心是 **AST → doc IR → 字符串**，CLI 只是给这条链加文件枚举和退出码。

## 核心要点

固定版本可以把主链拆成四步：

1. **规范化输入**：`formatWithCursor()` 先剥 BOM、把 CRLF 收成 LF，并校正 `rangeStart` / `rangeEnd` / `cursorOffset`。
2. **决定是否真的 format**：`requirePragma` 找不到 `@prettier` / `@format`，或 `checkIgnorePragma` 命中 ignore pragma 时，原样返回输入。
3. **`coreFormat()`**：`parseText()` 出 AST，`printAstToDoc()` 建成 doc，`printDocToString()` 按 `printWidth` 打印。
4. **还原换行**：内部一律按 LF 排版，最后再按 `endOfLine` 选项替换。

doc IR 不是“已经排好的字符串”。`src/document/builders` 提供 `group`、`fill`、`if-break`、`indent`、`line`。printer 用 `MODE_FLAT` / `MODE_BREAK`：`fits()` 判断一组能否在剩余宽度里放下，放不下就整组换行。

默认选项来自 `core-options.evaluate.js`：`printWidth` 80、`tabWidth` 2、`useTabs` false、`endOfLine` `"lf"`。`engines.node` 是 `>=22`。

配置搜索顺序写在 `config-searcher.js`：先看 `package.json` / `package.yaml` 里是否真有 prettier 字段，再找 `.prettierrc*` 和 `prettier.config.*`。editorconfig 不会默认合并，必须显式打开。

## 实践示例

### 案例 1：API 只 format 一段文本

```js
import prettier from "prettier";

const input = "const obj={foo:1,bar:2};";
const output = await prettier.format(input, { parser: "babel" });
const already = await prettier.check(output, { parser: "babel" });
```

**逐部分解释**：

1. `format()` 返回字符串，不写文件。
2. `check()` 不是另做一遍廉价扫描，而是再 format 一次后做恒等比较。
3. 没给 `filepath` 时必须显式传 `parser`，否则会走 `UndefinedParserError`。

### 案例 2：CLI 检查与写回是两条退出语义

```bash
npx prettier --check src
npx prettier --write src
```

**逐部分解释**：

1. `--check` 发现 `formatted !== input` 时把该文件列入“未格式化”，最后在未搭配 `--write` 时把 `exitCode` 设为 1。
2. `--write` 只有内容真的变了才调用 `writeFormattedFile()`，避免无谓改 mtime、打坏缓存。
3. 解析失败走 `handleError()`，通常把 `exitCode` 设为 2；`--check` 与 `--list-different` 不能一起用。

### 案例 3：配置是向上搜索，不是只看仓库根

```js
import { resolveConfig } from "prettier";

const config = await resolveConfig("packages/app/index.js");
const formatted = await prettier.format(source, {
  ...config,
  filepath: "packages/app/index.js",
});
```

`resolveConfig()` 从文件目录向上搜。`package.json` 只有存在 `prettier` 字段才算命中。没有配置文件时返回 `null`，然后回落到上面那组默认值。

## 踩过的坑

1. **把 npm `gitHead` 当成 GitHub SHA**：`prettier@3.9.6` 的 npm `gitHead` 在 canonical remote 不可达；固定源码用 GitHub tag `3.9.6` 剥开后的 `8f0c95057...`。
2. **以为 `--check` 失败都是 1**：风格不一致是 1，解析失败或读文件失败是 2。
3. **把 `printWidth` 理解成硬截断**：它是 `fits()` 的预算。一组放得下就保持一行，放不下才整组 break。
4. **打开 `--write --debug-check`**：CLI 在 `src/cli/index.js` 里直接拒绝这个组合。

## 适用 vs 不适用场景

**适用**：

- 需要一台机器、一份配置、少争论的 JS/TS/JSON/Markdown 排版
- 编辑器要保留光标：走 `formatWithCursor()`，不要自己猜偏移
- CI 用 `--check` 挡未格式化文件，用退出码 2 区分解析事故

**不适用**：

- 需要按规则报告逻辑错误 → 那是 [[eslint]] 的职责
- 必须 100% 兼容某个旧 Prettier 大版本的注释贴附细节 → 要针对固定 revision 回归，不能只看 README
- Node 低于 22 → 3.9.6 的 `engines.node` 写的是 `>=22`

## 固定版本边界

- 本文绑定 `prettier/prettier@8f0c95057...`，包版本 `3.9.6`，来自 GitHub tag `3.9.6`。
- npm `gitHead` `bd676aae6a3805672a21d02198e5d17c9cb1a97b` 在 GitHub 不可达，未当作 immutable revision。
- 默认 `printWidth` 80、`tabWidth` 2、`endOfLine` `lf`；`format()` 与 `check()` 都是 async。
- 本文未安装依赖、运行 CLI、打印真实仓库或做性能对比，状态保持 `UNVERIFIED`。

## 学到什么

1. **Prettier 的稳定性来自 doc IR，不是“先打印再微调”**——`fits()` 决定整组是否换行。
2. **`check` 是再 format 一次**——它没有独立的廉价检查器。
3. **写盘是有意保守的**——内容不变就不碰文件。
4. **版本钉死要以可达 Git 提交为准**——npm `gitHead` 可能对不上。

## 应用型自测

1. `prettier.check(src)` 在实现上会不会避免完整 format？
2. `--check` 遇到语法错误的 `.js`，退出码更可能是 1 还是 2？
3. `--write` 对已经符合风格的文件会更新 mtime 吗？

检查点：

1. 不会。`check()` 调用 `format()` 再做 `===`。
2. 更可能是 2。解析错误走 `handleError()`，不是“未格式化”计数。
3. 不会。内容相同就跳过 `writeFormattedFile()`。

## 延伸阅读

- 官方文档：[prettier.io](https://prettier.io/) —— option 与配置文件顺序
- 固定源码：[prettier/prettier](https://github.com/prettier/prettier) —— 本文绑定 `8f0c95057cc91d5836409466cd9d9af3bb901e84`
- 主链：`src/index.js`、`src/main/core.js`、`src/document/printer/printer.js`
- [[wadler-prettier]] —— prettier printer 的论文源头
- [[eslint]] —— 同生态的 linter，默认不再负责排版

## 关联

- [[eslint]] —— lint 与 format 拆开时的另一半
- [[biome]] —— 用一份工具同时做 lint/format 的对照
- [[wadler-prettier]] —— group / break 决策的理论根
- [[shfmt]] —— 另一条“统一打印、少争论”的语言专用路线
