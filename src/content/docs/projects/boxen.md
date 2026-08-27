---
title: boxen — 给终端文本套边框的纯拼接库
来源: https://github.com/sindresorhus/boxen
日期: 2026-08-27
分类: 工具库
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/boxen
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 52bbd6a57e92ea0dac762677d21ab5787a8abc39
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.1
---

## 是什么

boxen 是一个 Node.js 库：**把一段字符串包进终端边框后再返回**。日常类比：它像 Word 里的文本框——你给正文，它按列宽画矩形、加边距、对齐，但画框的是字符串拼接，不是 TTY 控件。

```js
import boxen from 'boxen';
console.log(boxen('unicorn', {padding: 1}));
```

固定 8.0.1 默认画出 `single` 边框：上下各加一行空白（`padding: 1` 的 top/bottom），左右空格是上下的 3 倍。函数返回字符串；要不要 `console.log` 由调用方决定。

## 为什么重要

不看固定入口，容易把“画个框”写成一个大而全的 CLI UI：

- 为什么左右 padding 是 3 倍，而不是和上下一样
- 为什么长文本换行要交给 [[wrap-ansi]]，不能按 `string.length` 切
- 为什么设了 `width` 之后，窄终端也不会自动收缩
- 为什么标题截断在 8.0.1 会按 JS 字符数而不是终端列宽切

一句话：boxen 的合同是 **测宽 → 换行 → 拼边框**，并且会读当前终端列数。

## 核心要点

固定 8.0.1 的主链可以拆成五步：

1. **标准化 options**：默认 `padding: 0`、`borderStyle: 'single'`、`textAlignment: 'left'`、`float: 'left'`。数字 padding/margin 经 `getObject` 变成 `{top, right: n*3, bottom, left: n*3}`。
2. **定宽**：`determineDimensions` 用 `stdout.columns` → `stderr.columns` → `COLUMNS` → `80` 当终端宽。测内容时调用 `wrapAnsi(..., {hard: true, trim: false})`。
3. **排正文**：`makeContentText` 先 `ansiAlign`，行太长再对每行 `wrapAnsi(line, max, {hard: true})`，然后补左右 padding，并按 `width` 右侧填空格。
4. **拼边框**：`boxContent` 从 `cli-boxes` 取 8 个字符（或自定义对象 / `'none'`），加上可选 `title`，再给边框上色。
5. **外边距与 float**：`margin.top/bottom` 是空行；`float: 'center'|'right'` 按终端列数算左边空格。

`fullscreen: true` 会用 `process.stdout.columns/rows` 填满未指定的宽高；也可以传入回调改尺寸。固定 `height` 会裁切多出来的行。

## 实践示例

### 案例 1：最简圆角框

```js
import boxen from 'boxen';
console.log(boxen('Hello', {padding: 1, borderStyle: 'round'}));
```

**逐部分解释**：`padding: 1` 实际是上下 1 行、左右 3 列。`round` 必须是 `cli-boxes` 里的名字，写错会 `TypeError: Invalid border style`。

### 案例 2：标题会撑开盒子

```js
import boxen from 'boxen';
console.log(boxen('foo bar', {title: 'example'}));
// ┌ example ┐
// │foo bar  │
// └─────────┘
```

有边框时标题会先被包成 ` example `。标题比正文更宽时，盒子跟标题走。固定 `width` 时，标题用 `String#slice` 截到 `width - 2`，**不是** `string-width`。

### 案例 3：固定宽度会关掉自动收缩

```js
import boxen from 'boxen';
console.log(boxen('foo bar', {width: 15}));
```

类型声明写明：指定 `width` 后不再做终端溢出处理，窄终端可能把框画坏。这和“不传 width、只靠 margin 收缩”不是同一条路。

## 踩过的坑

1. **把 boxen 写成不读全局状态的纯函数**：它会读 `process.stdout` / `stderr` / `COLUMNS`。测试里常见做法是固定 `COLUMNS`。
2. **以为 v8 自己实现了 `NO_COLOR`**：8.0.1 源码不读这个变量；颜色交给 `chalk`。
3. **标题按列宽截断**：8.0.1 用 JS `slice`。CJK / emoji 标题可能切少或切多。tag 之后的 #105 不在本页。
4. **把 boxen 输出再喂给另一个 boxen**：外层会把内层边框字符和 ANSI 当成“内容”重新测宽，对不齐。
5. **以为 8.0.1 已经用上 wrap-ansi 10**：依赖是 `wrap-ansi@^9.0.0`，不会自动升到 v10。

## 适用 vs 不适用场景

**适用**：

- CLI 启动 banner、update 提示、一次性错误框
- 单层框、文本短、能接受纯字符串返回值
- 愿意用 `cli-boxes` 的现成样式，或自己传 8 个边框字符

**不适用**：

- 嵌套布局或每帧重绘——那是 [[ink]] 的范围
- 交互输入——看 [[clack]] / [[enquirer]]
- 必须跑 CommonJS 且不能动态 `import()`——8.0.1 是 ESM-only
- 要把未测的下载量、star 或“比手写快”写成结论

## 固定版本边界

- 本文绑定 `sindresorhus/boxen@52bbd6a57e92ea0dac762677d21ab5787a8abc39`，npm `boxen@8.0.1`。
- `engines.node >= 18`；`type: module`。
- npm `gitHead` 与 annotated tag `v8.0.1` 同指此提交；`main` 上还有未发布的标题截断修复，未绑定。
- 本文未安装依赖、未跑测试、未在真实 TTY 渲染，状态保持 `UNVERIFIED`。

## 学到什么

1. **画框是测宽合同，不是 ASCII 艺术**——列宽来自 `string-width` / `widest-line`，不是 `text.length`
2. **换行策略是借来的**——boxen 自己不实现 ANSI 安全换行，硬换行交给 [[wrap-ansi]]
3. **数字 padding 带视觉比例**——左右默认 3 倍，对象写法才能逐边覆盖
4. **固定尺寸和自适应是两条路**——`width` 放弃溢出收缩，`height` 会裁切

## 应用型自测

1. `padding: 1` 时左右各补几列空格？
2. 内容比框更宽时，boxen 调用 wrap-ansi 的 `hard` 是 true 还是 false？
3. 8.0.1 截标题用的是 `string-width` 还是 `String#slice`？

检查点：

1. 3 列。`getObject(1)` 把 `right`/`left` 设成 `1 * 3`。
2. `true`。内容路径是 `wrapAnsi(line, max, {hard: true})`。
3. `String#slice`。按 JS 字符串长度截到 `width - 2`。

## 延伸阅读

- 仓库 README：[sindresorhus/boxen](https://github.com/sindresorhus/boxen)
- 固定源码：`index.js` / `index.d.ts` —— 本文绑定提交 `52bbd6a57e92ea0dac762677d21ab5787a8abc39`
- 对照换行：[[wrap-ansi]] —— boxen 用来做 ANSI 安全硬换行的依赖
- [[chalk]] —— 边框和背景色的上色入口
- [[ink]] —— 需要嵌套或高频重绘时的替代

## 关联

- [[wrap-ansi]] —— 可见列宽换行；boxen 8.0.1 声明 `^9.0.0`
- [[chalk]] —— `borderColor` / `backgroundColor` 走 chalk 具名色或 hex
- [[ora]] —— 同生态的 spinner，常和 banner 一起出现
- [[ink]] —— Yoga/flex 布局，不是单层字符串框
- [[clack]] —— 交互组件，不是静态边框

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[wrap-ansi]] —— wrap-ansi — 按可见列宽给带 ANSI 的字符串换行
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准
