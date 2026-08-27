---
title: indent-string — 按行前置缩进，默认跳过空白行
description: 固定 5.0.0 用一条 replace 给非空行重复前置 indent
来源: https://github.com/sindresorhus/indent-string
日期: 2026-08-27
分类: CLI / 字符串
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/indent-string
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 475241abcb055eb5223d51d26fec37df35a36a8b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.0
---

## 是什么

indent-string 是一个**只负责给每行前面加缩进**的小函数。日常类比：它不像排版软件那样量列宽，更像复印机的“整页左移”——你告诉它移几次、用什么字符，它按行贴上去。

固定 5.0.0 的唯一入口是 default export：

```js
import indentString from "indent-string";

indentString("Unicorns\nRainbows", 4);
// "    Unicorns\n    Rainbows"
```

`count` 默认 `1`，`options.indent` 默认是单空格 `' '`，不是 tab。它不探测现有缩进，也不删多余空白；要先对齐公共前缀再另缩，看 [[strip-indent]]。

## 为什么重要

不看这条 replace 合同，下面这些事很容易写错：

- 为什么空行默认不会被加上空格，模板字符串里却常常“多出一行空白缩进”
- 为什么 `{indent: '\t'}` 的 `count` 是“重复几次 tab”，不是“变成几个空格”
- 为什么 `count === 0` 连正则都不会跑
- 为什么它和 [[strip-indent]] 不是严格互逆

一句话：indent-string 的合同是 **类型检查 + 空行策略 + `indent.repeat(count)`**。

## 核心要点

固定 5.0.0 的主链可以拆成五步：

1. **拆参数**：`indentString(string, count = 1, options = {})`，再取出 `indent` 与 `includeEmptyLines`。
2. **拦类型**：`string` / `count` / `indent` 类型不对就抛 `TypeError`；`count < 0` 抛 `RangeError`。
3. **零次短路**：`count === 0` 直接返回原字符串，不看空行开关。
4. **选锚点**：`includeEmptyLines` 为真用 `/^/gm`（每行行首，含空行）；默认用 `/^(?!\s*$)/gm`，整行只有空白就跳过。
5. **贴前缀**：`string.replace(regex, indent.repeat(count))`。已有前导空格会累加，不会先 trim。

`package.json` 写明纯 ESM：`type` 为 `module`，`exports` 指向 `./index.js`，`engines.node` 为 `>=12`，运行时零依赖。

## 实践示例

### 案例 1：默认空格，跳过空行

```js
import indentString from "indent-string";

indentString("foo\n\nbar", 2);
// "  foo\n\n  bar"
```

中间空行匹配不上 `^(?!\s*$)`，所以不会变成 `"  foo\n  \n  bar"`。

### 案例 2：自定义 indent 字符

```js
indentString("foo\nbar", 4, {indent: "♥"});
// "♥♥♥♥foo\n♥♥♥♥bar"
```

`count` 是 **indent 串的重复次数**。把 `count` 理解成“空格列数”，只在默认 `indent: ' '` 时碰巧成立。

### 案例 3：连空行一起缩

```js
indentString("foo\n\nbar\n\t", 1, {includeEmptyLines: true});
// " foo\n \n bar\n \t"
```

`/^/gm` 会命中空行和“只有 tab 的行”。后者会变成“空格 + tab”，视觉上不一定对齐。

## 踩过的坑

1. **默认 indent 不是 tab**：不传 options 时每层是一个空格。
2. **空白行定义用 `\s`**：tab、空格、其它 JS 空白都算“空行”；这和 [[strip-indent]] 只认 `[ \t]` 当缩进字符不是同一套尺子。
3. **`includeEmptyLines: null` 走默认**：测试把它当成假值，不会打开空行缩进。
4. **不是 pretty-printer**：不处理 East Asian width，也不把 tab 展开成 2/4/8 列。
5. **主线后还有两笔未发布提交**：readme 加 related 链接、测试标题把旧名 `blank` 改成 `includeEmptyLines`；`index.js` 没变，本文仍绑 5.0.0。

## 适用 vs 不适用场景

**适用**：

- 生成代码、帮助文本、嵌套日志时，已知要在每行前面重复同一段前缀
- 想明确区分“空行保持空”还是“空行也垫前缀”
- 已经用 [[strip-indent]] 对齐过公共前缀，再决定新的左缘

**不适用**：

- 需要按视觉列宽对齐 CJK / emoji / ANSI 色码 → 看 [[boxen]] 那条 wrap / string-width 链
- 需要先去掉公共缩进 → 那是 [[strip-indent]]，或上游 README 提到的 `redent`（本轮未建页）
- 还在 CJS `require()` 路径里 → 固定包是纯 ESM

## 固定版本边界

- 本文绑定 `sindresorhus/indent-string@475241ab...`，npm `indent-string@5.0.0` 的 `gitHead` 与 annotated tag `v5.0.0` 解引用一致。
- 许可 MIT。入口只有 default export，没有 named export。
- 本轮未运行 `xo` / `ava` / `tsd`，状态保持 `UNVERIFIED`。

## 学到什么

1. **缩进增量是“重复 indent 串”**，不是抽象的列数
2. **空行策略是正则，不是事后 trim**
3. **`count === 0` 是恒等**，负值才是错误
4. **加缩进和剥缩进要分开读**——配对页是 [[strip-indent]]

## 应用型自测

1. `indentString('foo\n\nbar')` 中间那行空行前面会有空格吗？
2. `indentString('foo', 2, {indent: '\t'})` 得到的是两个 tab，还是八个空格？
3. `indentString('foo\nbar', 0, {includeEmptyLines: true})` 会改写字符串吗？

检查点：

1. 不会。默认 `/^(?!\s*$)/gm` 跳过空白行。
2. 两个 tab。`count` 只重复 `options.indent`。
3. 不会。`count === 0` 直接返回原文。

## 延伸阅读

- 仓库 README：[sindresorhus/indent-string](https://github.com/sindresorhus/indent-string)
- 固定源码：[sindresorhus/indent-string](https://github.com/sindresorhus/indent-string) —— 本文绑定提交 `475241abcb055eb5223d51d26fec37df35a36a8b`
- 配对页：[[strip-indent]] —— 按公共前缀往回剥
- 组合库：[sindresorhus/redent](https://github.com/sindresorhus/redent)（依赖本包 + strip-indent，本轮未审查）
- [[boxen]] —— 终端盒子会先 wrap 再垫 padding，问题比“前置重复串”更大

## 关联

- [[strip-indent]] —— 同一作者的剥缩进配对
- [[boxen]] —— 终端文本框，依赖宽度计算而不是简单 prepend
- [[chalk]] —— 常和这类小函数一起出现在 CLI 输出链
- [[ink]] —— React 终端 UI；缩进只是文本层的一步

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[strip-indent]] —— strip-indent — 按最短前导空白剥缩进
