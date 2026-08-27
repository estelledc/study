---
title: wrap-ansi — 按可见列宽给带 ANSI 的字符串换行
来源: https://github.com/chalk/wrap-ansi
日期: 2026-08-27
分类: 工具库
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/chalk/wrap-ansi
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c6b6259a58843e491e8703c5010a2a517b5f5738
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.0.1
---

## 是什么

wrap-ansi 是一个 Node.js 库：**按终端可见列宽给字符串换行，并且不把 ANSI 序列切坏**。日常类比：它像会躲格式标记的打字机——数的是屏幕上占的格子，不是 JS 字符串的 `.length`。

```js
import chalk from 'chalk';
import wrapAnsi from 'wrap-ansi';

const input = 'The quick brown ' + chalk.red('fox jumped over ')
  + 'the lazy ' + chalk.green('dog and then ran away with the unicorn.');
console.log(wrapAnsi(input, 20));
```

固定 10.0.1 默认是 **soft wrap**：空格处分行；单个超长词可以超出 `columns`。只有 `hard: true` 才保证可见宽度不超过上限。

## 为什么重要

不看固定实现，容易把换行写成 `text.match(/.{1,20}/g)`：

- 为什么 `\x1b[31m` 被从中间切开，后面整段都会红到失控
- 为什么中文、emoji 不能按 UTF-16 单元计数
- 为什么换行后下一行还要重新打开颜色和超链接
- 为什么 [[boxen]] 8.0.1 仍声明 `wrap-ansi@^9`，并不能直接当 10.0.1 用

一句话：wrap-ansi 的合同是 **先认完整序列，再按 grapheme 测宽，再在行界恢复样式**。

## 核心要点

固定 10.0.1 的主链可以拆成五步：

1. **归一化**：`String(string).normalize()`，把 CRLF 换成 LF，按行切开。每行先把 tab 扩成 8 列 tab stop。
2. **分词**：`splitWords` 只在序列外面的空格切开；序列本身跟它所在的词走。
3. **排版**：默认 soft。当前行加上这个词会超宽，就另起一行。`hard: true` 且词比 `columns` 还长时，才按 grapheme 硬切。
4. **测宽**：完整 ANSI 序列宽度为 0。可见文本用 `string-width`；ASCII 可打印按单字符快路径，其余走 `Intl.Segmenter`。
5. **行界恢复**：`restoreStylesAcrossRows` 在每个换行前关闭活动 SGR 和 OSC 8 超链接，下一行再打开，让每一行能单独显示。

注释写明支持边界：分号分隔的 SGR、冒号分隔的 RGB/256 色、OSC 8 超链接。它**不是**终端模拟器；DCS 等控制串、残缺序列、8-bit 控制串都不在合同里。

## 实践示例

### 案例 1：默认 soft wrap

```js
import wrapAnsi from 'wrap-ansi';
wrapAnsi('hello supermegalongword', 10);
```

空格处可以换行；`supermegalongword` 这个词比 10 列长，默认会原样伸出。这不是 bug，是 `hard` 的默认值 `false`。

### 案例 2：boxen 同款硬换行

```js
import wrapAnsi from 'wrap-ansi';
wrapAnsi('supermegalongword', 10, {hard: true});
```

`hard: true` 时，可见宽度不允许超过 `columns`。[[boxen]] 8.0.1 对溢出正文用的就是 `{hard: true}`；测外框宽度时再加 `{trim: false}`。

### 案例 3：不要 trim 时，前导空格也算列

```js
import wrapAnsi from 'wrap-ansi';
wrapAnsi('  hi', 4, {trim: false});
```

默认 `trim: true` 会去掉行首空白，并按可见空格做行尾修剪。`trim: false` 时这些空格占列，也可能单独把行撑满后再起一行。

## 踩过的坑

1. **用 `.length` 或朴素切片换行**：会切断 CSI / OSC，颜色和超链接失效。
2. **把默认模式当成 hard wrap**：默认 soft。CLI 布局要“绝不超过 N 列”必须显式 `{hard: true}`。
3. **以为 10.0.1 能被 boxen 8.0.1 直接装上**：boxen 写的是 `^9.0.0`；10.x 还把引擎抬到 `node >= 20`。
4. **把它写成完整 ANSI 仿真器**：残缺序列、未列出的 colon SGR、C0 塞进序列里，都不在支持边界。
5. **把截图或“比 slice-ansi 快”写成结论**：本轮没有跑 `test.js`，也没有测性能。

## 适用 vs 不适用场景

**适用**：

- CLI 要把 chalk 过的段落折到指定列宽
- 需要换行后每行仍自带开/关色和超链接
- 调用方能接受 ESM，以及 Node 20+

**不适用**：

- 还停在 wrap-ansi 9.x / Node 18 的依赖树，却按 10.0.1 推理
- 需要完整终端仿真或任意 CSI 语义
- 要按字节或 UTF-16 单元截断，而不是按可见列宽

## 固定版本边界

- 本文绑定 `chalk/wrap-ansi@c6b6259a58843e491e8703c5010a2a517b5f5738`，npm `wrap-ansi@10.0.1`。
- `engines.node >= 20`；`type: module`；依赖 `ansi-styles` 与 `string-width`。
- npm `gitHead` 与 annotated tag `v10.0.1` 同指此提交。
- `wrap-ansi@9.0.2` 的 `gitHead` 是 `cf1d1e65...`，本页不绑定那条线。
- 本文未安装依赖、未跑 `node --test`，状态保持 `UNVERIFIED`。

## 学到什么

1. **可见宽度和字符串长度不是一回事**——先剥完整序列，再数 grapheme
2. **soft / hard / wordWrap / trim 是四条独立开关**——默认组合不是“硬切满列”
3. **行必须能独立显示**——换行要关闭并重开 SGR 与 OSC 8
4. **版本要对着调用方读**——boxen 8.0.1 和 wrap-ansi 10.0.1 是同一家族，不是同一份 semver 合同

## 应用型自测

1. `wrapAnsi(longWord, 10)` 默认会不会把这个词硬切成两行？
2. 换行之后，下一行的红色和超链接还在吗？靠什么恢复？
3. boxen 8.0.1 的 `package.json` 会接受 wrap-ansi 10.0.1 吗？

检查点：

1. 不会。默认 `hard: false`，超长词可以超出 `columns`。
2. 在支持边界内会。`restoreStylesAcrossRows` 在行界关闭再打开活动 SGR 和 OSC 8。
3. 不会。它声明的是 `wrap-ansi@^9.0.0`。

## 延伸阅读

- 仓库 README：[chalk/wrap-ansi](https://github.com/chalk/wrap-ansi)
- 固定源码：`index.js` / `index.d.ts` —— 本文绑定提交 `c6b6259a58843e491e8703c5010a2a517b5f5738`
- [[boxen]] —— 调用方；8.0.1 仍钉在 9.x
- [[chalk]] —— 常见的 SGR 输入来源
- slice-ansi / cli-truncate —— README 列出的相邻字符串工具，本页未审查

## 关联

- [[boxen]] —— 用 wrap-ansi 做硬换行和测宽
- [[chalk]] —— 给输入加上 SGR
- [[ora]] —— 另一类终端字符串消费者
- [[ink]] —— 需要完整布局引擎时不要只靠换行

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套边框的纯拼接库
