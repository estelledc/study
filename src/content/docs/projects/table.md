---
title: table — 把二维数组画成等宽文本表
description: 纯函数入口：矩形数据先校验再 stringify，默认 honeywell 边框，stream 才写 stdout
来源: https://github.com/gajus/table
日期: 2026-08-27
分类: 命令行工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/gajus/table
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8b85bc8f7e5202c2fcea295bd59d4e7d25519c7a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.9.0
---

## 是什么

`table` 是一个把二维数组格式化成等宽文本表的 JavaScript 库。日常类比：像把 Excel 选区复印成纯文本——格子已经在数组里排好，它只负责对齐、折行、画框，再交回一个字符串。

```js
import { table } from "table";
table([
  ["0A", "0B"],
  ["1A", "1B"],
]);
```

固定 6.9.0 的公开入口只有三个：`table`、`createStream`、`getBorderCharacters`。`table(...)` 返回字符串，不碰终端。

## 为什么重要

不看固定主链，下面这些事会对不上：

- 为什么空数组、缺一格、或单元格里有 Tab 会直接 throw
- 为什么默认边框是双线 `╔═╗`，而不是大家更眼熟的 `┌─┐`
- 为什么 `createStream` 看起来像同一套 API，却把结果写进 `process.stdout`
- 为什么 `header` 和 `spanningCells` 会互相挤行号

一句话：它的合同是 **矩形数据 + 配置校验 + 一次性画出字符串**。和 [[cli-table3]] 那种“先 `push` 再 `toString`”的可变表不是同一条路。

## 核心要点

固定 6.9.0 的主链可以拆成六步：

1. **验收矩形**：`validateTableData` 要求外层是数组、至少一行一列、每行列数一致。单元格先 `String` 再规范化；`\u0001-\u0006`、Backspace、Tab、以及 `\u000B-\u001A` 这类控制符会被拒绝。
2. **收成字符串**：`stringifyTableData` 把每个格子 `String(cell)`，并把 `\r\n` 收成 `\n`。
3. **可选表头注入**：`header.content` 会在数据前插一行，并把已有 `spanningCells` 的 `row` 全部 +1，再放一个跨整行的 spanning cell。类型注释把它标成 deprecated。
4. **补齐配置**：`makeTableConfig` 用 AJV 校验用户配置。列默认左对齐、上对齐、左右各 1 格 padding、`truncate=Infinity`、`wrapWord=false`。没给 `border` 就合并 honeywell 模板。
5. **截断再铺行高**：按列 `truncate` 用 `lodash.truncate` 加省略号 `…`，再算行高、对齐、padding。
6. **画框**：`drawTable` 按行高分组画内容；`singleLine=true` 时去掉中间横线，顶底边仍受 `drawHorizontalLine` 控制。

`getBorderCharacters` 只认四个名字：`honeywell`、`norc`、`ramac`、`void`。拼错名字会 throw。

## 实践示例

### 案例 1：一次性函数，不是可变对象

```js
import { table } from "table";
const text = table([
  ["name", "role"],
  ["Ada", "writer"],
]);
```

`table` 吃完整二维数组，返回一张表的字符串。没有 `push`，也没有实例字段。要改一行，得改数组再画一次。

### 案例 2：stream 必须先锁列宽，而且写 stdout

```js
import { createStream } from "table";
const stream = createStream({
  columnCount: 2,
  columnDefault: { width: 8 },
});
stream.write(["name", "role"]);
stream.write(["Ada", "writer"]);
```

`makeStreamConfig` 要求 `columnDefault.width`。`write` 直接 `process.stdout.write`；第二行起先用 `\r\u001B[K` 擦掉底边，再画 join 线和新年。它不是“返回增量字符串”的 API。

### 案例 3：表头是插行，不是单独的 caption 层

```js
table(
  [
    ["Ada", "writer"],
    ["Grace", "reviewer"],
  ],
  { header: { content: "staff" } },
);
```

`injectHeaderConfig` 把 `"staff"` 放到第 0 行，并给它 `colSpan=列数`。原来写在 `spanningCells` 里的 `row` 会整体下移一行。把它理解成“悬浮标题、不占数据行”，行号会对不上。

## 踩过的坑

1. **空表或锯齿表**：`[]`、`[[]]`、第二行少一格，都会 throw。这和 [[cli-table3]] 缺格自动补空白相反。
2. **Tab / 部分控制符进格子**：规范化后只要命中那组控制字符范围就拒绝；想对齐列，得自己先把空白收干净。
3. **`wrapWord` 默认是关的**：长词按字符切。要按空格或 `\|/_.,;-` 这些边界折，得显式 `wrapWord: true`。
4. **`createStream` 不是纯函数**：它写 `process.stdout`。在测试或不想污染 stdout 的地方调用，会直接打到终端。
5. **源码 `package.json` 的 version 仍是 `1.0.0`**：这是 semantic-release 占位。本页绑定的是 tag / npm `6.9.0`，不要按源码字段猜版本。

## 适用 vs 不适用场景

**适用**：

- 已经有矩形数组，只要一次格式化成字符串
- 需要 honeywell / norc / ramac / void 这套边框模板，或自己覆写 `border`
- 能接受“先准备齐数据，再画”，而不是边 push 边改

**不适用**：

- 想先 `push` 行、再让缺格自动补齐 → 看 [[cli-table3]]
- 需要内建红头灰框着色；本库只感知 ANSI 宽度，不负责上色
- 还没装依赖、也没跑过 stream / spanning 就想下吞吐或体积结论

## 固定版本边界

- 本文绑定 `gajus/table@8b85bc8f7e5202c2fcea295bd59d4e7d25519c7a`。GitHub tag `v6.9.0` 与 npm `table@6.9.0` 的 `gitHead` 指向同一提交。
- 运行时依赖含 `ajv`、`lodash.truncate`、`slice-ansi`、`string-width`、`strip-ansi`。
- 发布产物走 `dist/src/`；源码是 TypeScript。`sideEffects: false`。
- 未安装依赖、未跑 Mocha / nyc、未测 `dist` 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **纯函数表和可变表不是同一张卡**——返回字符串，还是继承 Array 再 `toString`，决定调用方怎么测、怎么拼
2. **先校验矩形，再谈美化**——列数不一致在这里是错误，不是“帮你补空”
3. **默认双线边框是模板，不是终端能力**——换 `norc` 才是单线 `┌─┐`
4. **stream 把副作用藏在同名家族里**——`table` 纯、`createStream` 写 stdout

## 应用型自测

1. `table([])` 会返回空字符串吗？
2. `createStream({ columnCount: 2 })` 少写 `columnDefault.width`，能建出 stream 吗？
3. 不传 `border` 时，默认模板是 `norc` 还是 `honeywell`？

检查点：

1. 不会。`validateTableData` 要求至少一行。
2. 不能。`makeStreamConfig` 缺 width 会 throw。
3. `honeywell`。`makeBorderConfig` 以它为底再合并用户字符。

## 延伸阅读

- 固定源码：[gajus/table](https://github.com/gajus/table) —— 本文绑定 `8b85bc8f7e5202c2fcea295bd59d4e7d25519c7a`
- npm 包：[table@6.9.0](https://www.npmjs.com/package/table)
- [[cli-table3]] —— 同主题的 Array + `toString` 路线，默认单线框、可缺格
- [[boxen]] —— 只围一段文字，不负责多列对齐
- [[chalk]] —— 上色；本库只按 ANSI 宽度切片，不画颜色

## 关联

- [[cli-table3]] —— 可变表 + 对象行 + optional 着色
- [[boxen]] —— 单块边框，不是二维表
- [[chalk]] —— ANSI 样式；`table` 只避免把转义码算进宽度
- [[ora]] —— 同行重绘；对照 `createStream` 的 `\r\u001B[K`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cli-table3]] —— cli-table3 — 继承 Array 的 Unicode CLI 表格
