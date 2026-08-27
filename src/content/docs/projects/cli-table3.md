---
title: cli-table3 — 继承 Array 的 Unicode CLI 表格
description: Table 就是数组：push 行后 toString 才布局，缺格补空，着色依赖 optional colors
来源: https://github.com/cli-table/cli-table3
日期: 2026-08-27
分类: 命令行工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/cli-table/cli-table3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9577efd51114e61fb035b7cc493adf0c0dc7921b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.6.5
---

## 是什么

cli-table3 是一个给命令行画 Unicode 表格的 Node 库，从最早的 `cli-table` 这条线长出来。日常类比：它不是“给我一张已经排好的表”，更像一张可以往里扔纸条的纸盒——你 `push` 行，最后 `toString()` 才量格子、补缺口、描边。

```js
const Table = require("cli-table3");
const t = new Table({ head: ["name", "role"] });
t.push(["Ada", "writer"]);
t.toString();
```

固定 0.6.5 里，`Table` **继承 `Array`**。`index.js` 只是把 `src/table` 再导出一次。CJS 默认入口；类型在 `index.d.ts`。

## 为什么重要

不看固定布局链，下面这些事会对不上：

- 为什么 `JSON.stringify(table)` 看起来像普通数组
- 为什么没写 `head` 时，默认的红色表头突然消失
- 为什么缺一个格子不会 explode，日志里却冒出 `Missing cell`
- 为什么没装 `@colors/colors` 时表还能画，只是不再上色

和 [[table]] 对照：那边先验收矩形再返回字符串；这边先当数组用，画的时候再补布局。

## 核心要点

固定 0.6.5 的主链可以拆成五步：

1. **构造时只合并选项**：`utils.mergeOptions` 默认 chars 是 `┌─┐` 这套 norc 风格；`style.head` 默认 `['red']`，`style.border` 默认 `['grey']`，左右 padding 各 1，截断符是 `…`。
2. **`toString` 才开始画**：若 `options.head` 有内容，就把它插到数组前面。没有 head 时，把 `style.head` 清成空数组，避免把第一行数据误涂成表头色。
3. **对象行会改形状**：`generateCells` 遇到非数组行，取第一个 key。值是数组就 `unshift(key)` 做成更宽的横行；否则变成 `[key, value]` 竖表。
4. **布局补洞**：`layoutTable` 按 `rowSpan` / `colSpan` 占位；`fillInTable` 给空洞补空白 cell 并 `warn`；再插入 `RowSpanCell` / `ColSpanCell` 占位符。随后按 `desiredWidth` / `desiredHeight` 回填 `colWidths` 与 `rowHeights`。
5. **逐行描边**：每个 cell `init` 后按 `top` / 行号 / `bottom` 调用 `draw`。`style.compact` 为 true 时，中间行不再画顶部分隔，表头后那一条仍保留。

单元格 `content` 只接受 boolean / number / bigint / string。对象当 content 会 throw。`href` 会包成 OSC 8 超链接；截断后若闭合序列被切掉，会补回 `\x1B]8;;\x07`。

## 实践示例

### 案例 1：它首先是数组

```js
const Table = require("cli-table3");
const t = new Table({ style: { head: [], border: [] } });
t.push(["Ada", "writer"]);
t.length; // 1
t[0];     // ["Ada", "writer"]
```

因为 `class Table extends Array`，`push` / `length` / 下标都是数组语义。`toString` 被换成画表；其它数组方法仍按 Array 走。

### 案例 2：对象行不是“对齐的 dict 列表”

```js
const t = new Table({ style: { head: [], border: [] } });
t.push({ name: "Ada" }, { role: ["writer", "editor"] });
```

第一个对象变成 `["name", "Ada"]`。第二个对象的值是数组，于是变成 `["role", "writer", "editor"]`。列数可以不同；缺的格子由 `fillInTable` 补上，不是 [[table]] 那种“列数必须一致”。

### 案例 3：着色是 optional，失败就降级

```js
const t = new Table({
  head: ["hello", "goodbye"],
  style: { head: ["red"], border: ["grey"] },
});
t.toString();
```

`wrapWithStyleColors` 动态 `require('@colors/colors/safe')`。包在 `optionalDependencies`。require 抛错时原样返回未着色字符串。`y === 0` 的内容才套 head 色；边框字符走 `border` 样式。

## 踩过的坑

1. **把第一行数据当成表头色**：只有显式 `head` 时第一行才按 head 着色；不设 `head`，实现会清空 `style.head`。
2. **以为缺格会像 `table` 一样 throw**：这里补空白并 warn。想 fail-fast 得自己先把矩形收齐。
3. **content 塞对象**：`{ content: { a: 1 } }` 会 throw；数字、bigint、布尔可以。
4. **`wordWrap` 不设列宽几乎不生效**：`computeLines` 只在 `fixedWidth && wordWrap` 时才折行。`textWrap` 是 `wordWrap` 的别名，不是另一套算法。
5. **颜色不是硬依赖**：CI 里没装 optional 包，表还能出，只是没有红头灰框。不要把“默认红色表头”写成安装合同。

## 适用 vs 不适用场景

**适用**：

- 行是陆陆续续 `push` 出来的，列数不一定事先对齐
- 需要 cell 级 `colSpan` / `rowSpan` / `href`
- 想要默认单线框，并且能接受 optional 着色

**不适用**：

- 已经有严格矩形数组，只要纯函数返回字符串 → 看 [[table]]
- 必须在无 `@colors/colors` 时仍断言具体 ANSI 颜色
- 需要 `createStream` 那种边写边擦底边的增量输出

## 固定版本边界

- 本文绑定 `cli-table/cli-table3@9577efd51114e61fb035b7cc493adf0c0dc7921b`。annotated tag `v0.6.5` 的 tag 对象是 `2c80c8b2...`，剥开后与 npm `cli-table3@0.6.5` 的 `gitHead` 同指此提交。
- 运行时依赖只有 `string-width@^4.2.0`；`@colors/colors@1.5.0` 是 optional。
- `engines` 写 `10.* || >= 12.*`。源码 `package.json` version 就是 `0.6.5`。
- 未安装依赖、未跑 Jest、未执行 `toString`，状态保持 `UNVERIFIED`。

## 学到什么

1. **继承 Array 是公开合同，不是实现细节**——实例的 JSON / 遍历跟数组走，画表是 `toString` 的替换
2. **布局发生在渲染时**——缺格、span、列宽都在 `toString` 里算，构造期几乎只存选项
3. **“默认红色”依赖 optional 包**——没装就降级，不是画不出来
4. **对象行会改维度**——第一个 key 变成一列，值是数组还会继续变宽

## 应用型自测

1. `new Table()` 之后立刻 `JSON.stringify`，得到的是选项对象还是数组？
2. 不设 `head` 时，默认 `style.head=['red']` 还会给第一行数据上色吗？
3. `push([{ content: { a: 1 } }])` 再 `toString()`，固定源码会怎么处理？

检查点：

1. 数组。`Table` 继承 `Array`，选项挂在不可枚举（默认）的 `options` 上。
2. 不会。没有 head 时 `toString` 把 `style.head` 清成 `[]`。
3. throw。`content` 必须是 primitive。

## 延伸阅读

- 固定源码：[cli-table/cli-table3](https://github.com/cli-table/cli-table3) —— 本文绑定 `9577efd51114e61fb035b7cc493adf0c0dc7921b`
- npm 包：[cli-table3@0.6.5](https://www.npmjs.com/package/cli-table3)
- [[table]] —— 同主题的纯函数 + 矩形校验路线
- [[boxen]] —— 单段文本边框，不处理多列 span
- [[chalk]] —— 手动上色；本库默认走 optional `@colors/colors`

## 关联

- [[table]] —— 矩形数组进、字符串出，缺格即错误
- [[boxen]] —— 只包一块文字
- [[chalk]] —— 调用方自己上色，不依赖 optional colors
- [[ink]] —— 用组件树画终端，不是字符串表格

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[table]] —— table — 把二维数组画成等宽文本表
