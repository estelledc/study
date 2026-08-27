---
title: strip-indent — 按最短前导空白剥缩进
description: 固定 4.1.1 内联最小缩进，并提供会剪首尾空行的 dedent
来源: https://github.com/sindresorhus/strip-indent
日期: 2026-08-27
分类: CLI / 字符串
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/strip-indent
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 102b553f9efaec1c2451cd9ac2385269768f1fed
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.1.1
---

## 是什么

strip-indent 用来**去掉一段多行文本里多出来的公共缩进**。日常类比：把贴在墙上的便签纸齐左缘揭下来——先看哪一行凸得最少（忽略空行），再按这个量把每一行往左撕同样多。

固定 4.1.1 有两个出口：

```js
import stripIndent, {dedent} from "strip-indent";

stripIndent("\tunicorn\n\t\tcake");
// "unicorn\n\tcake"

dedent(`
	unicorn
		cake
`);
// "unicorn\n\tcake"
```

`stripIndent` 只剥公共前缀，首尾空行会留着。`dedent` 先剪掉首尾空白行，再调用同一个剥皮函数。它不负责再缩回去；要前置新缩进，看 [[indent-string]]。

## 为什么重要

不看最小前缀怎么算，模板字符串和 HTML 片段会踩这些坑：

- 为什么源码里多出来的那一层 tab 能被拿掉，相对缩进却还在
- 为什么空行不决定“撕多少”，但剥完以后空行上的空白可能还在
- 为什么混用 tab 和空格时，最小值按**字符个数**而不是显示列
- 为什么 `dedent` 适合 `` `...` ``，而 `stripIndent('\nunicorn\n')` 仍带着换行

一句话：strip-indent 的合同是 **有内容行的最短 `[ \t]` 前缀**。

## 核心要点

固定 4.1.1 把以前的 `min-indent` 依赖内联进 `index.js`，主链是：

1. **找候选**：`string.match(/^[ \t]*(?=\S)/gm)` 只收集“前面是空格/tab、后面还有非空白”的行。
2. **没有候选就原样返回**：整段都是空行，或没有任何前导空白可剥。
3. **取最短长度**：对每个匹配做 `indent.length`，用 `Math.min`；长度为 0 也原样返回。
4. **按这个长度剥所有行**：`replace(new RegExp('^[ \\t]{' + minIndent + '}', 'gm'), '')`。
5. **`dedent` 先清边**：`/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g` 去掉开头和结尾的空白行（含 CRLF），再走第 1–4 步。

空白行不进入第 3 步。若某空白行的 `[ \t]` **少於** min，第 4 步匹配不上，该行会留下原来的空白——测试 `'ignore whitespace only lines'` 就是这个边界。

函数本身没有 `typeof` 检查。入口是纯 ESM，`engines.node >=12`，运行时零依赖。

## 实践示例

### 案例 1：保留相对缩进

```js
import stripIndent from "strip-indent";

stripIndent("\t\t<html>\n\t\t\t<body>\n\t\t</html>");
// "<html>\n\tbody>\n</html>"
```

三行的前导 tab 分别是 2、3、2，最小是 2。子层那一个 tab 留下来，所以结构还在。

### 案例 2：空行不投票，但可能剥不干净

```js
stripIndent("\n\t\n\t\tunicorn\n\t\t\tunicorn");
// "\n\t\nunicorn\n\tunicorn"
```

有内容的两行最短前缀是 2 个 tab；中间那个单独 `\t` 不够 2，替换失败，空行上的 tab 还在。

### 案例 3：模板字符串用 `dedent`

```js
import {dedent} from "strip-indent";

dedent(`
	THIS IS FINE.
	I'M OK.
`);
// "THIS IS FINE.\nI'M OK."
```

首尾由换行构成的空白行会被剪掉，再按最短前缀剥一层。内部空行和行尾空格会保留。

## 踩过的坑

1. **尺子是字符数，不是列宽**：`'\tfoo'` 的前缀长度是 1，`'  foo'` 是 2。混用 tab / 空格时，最小值没有视觉意义。
2. **只认空格和 tab**：其它 Unicode 空白不会被算进前导缩进。
3. **和 [[indent-string]] 的“空行”不是同一谓词**：那边用 `\s` 判断是否空行；这边用 `[ \t]*(?=\S)` 判断是否参与最小值。
4. **`stripIndent` 不是 `dedent`**：`'\n  unicorn\n'` 剥完仍是 `'\nunicorn\n'`。
5. **不要从 README 推出互逆**：先 strip 再 indent，只有在默认空格、空行策略一致、没有混合空白时才像可逆。

## 适用 vs 不适用场景

**适用**：

- 把源码里缩进过的多行字符串、HTML 片段、错误说明恢复到“最左有内容的那一行”
- 模板字面量想去掉围在两边的空行时用 `dedent`
- 需要一个零依赖、纯函数的公共前缀剥离

**不适用**：

- 要按显示宽度对齐，或要处理 ANSI / CJK → 不是这个包
- 要在剥完以后再垫一层新缩进 → 接 [[indent-string]]，或看未建页的 `redent`
- 还在 CJS `require()` 路径里 → 固定包是纯 ESM
- 需要运行期类型守卫 → 源码直接 `.match`，不会先抛自己的 TypeError

## 固定版本边界

- 本文绑定 `sindresorhus/strip-indent@102b553f...`，npm `strip-indent@4.1.1` 的 `gitHead` 与 annotated tag `v4.1.1` 解引用一致；`origin/main` 也停在该提交。
- 4.1.0 增加 named `dedent` 并去掉 `min-indent` 依赖；4.1.1 去掉重复 default export。本页按 4.1.1 阅读。
- 许可 MIT。本轮未运行 `xo` / `ava`，状态保持 `UNVERIFIED`。

## 学到什么

1. **公共缩进由“有内容的行”投票**，空行没有表决权
2. **剥的是字符个数**，不是编辑器里看到的列
3. **`dedent` = 剪边 + `stripIndent`**，不是另一种最小值算法
4. **配对页 [[indent-string]] 负责往上加，不负责先对齐**

## 应用型自测

1. `stripIndent('\nunicorn\n')` 会去掉首尾换行吗？
2. 一行是两个 tab、一行是三个 tab、中间夹一个只有单 tab 的空行，剥完空行上的 tab 还在吗？
3. `dedent` 会改写字符串内部的空行吗？

检查点：

1. 不会。那是 `dedent` 的剪边步骤。
2. 还在。空行不参与 min，且长度不够，替换匹配不上。
3. 不会。它只去掉开头和结尾的空白行。

## 延伸阅读

- 仓库 README：[sindresorhus/strip-indent](https://github.com/sindresorhus/strip-indent)
- 固定源码：[sindresorhus/strip-indent](https://github.com/sindresorhus/strip-indent) —— 本文绑定提交 `102b553f9efaec1c2451cd9ac2385269768f1fed`
- 配对页：[[indent-string]] —— 按行前置重复 indent
- 组合库：[sindresorhus/redent](https://github.com/sindresorhus/redent)（先 strip 再 indent，本轮未审查）
- [[boxen]] —— 终端盒子要算可见宽度，不能只用公共前缀

## 关联

- [[indent-string]] —— 同一作者的加缩进配对
- [[boxen]] —— padding / wrap 是另一条文本几何
- [[chalk]] —— CLI 输出链上的颜色层
- [[ink]] —— 终端 UI 里文本只是叶子节点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[indent-string]] —— indent-string — 按行前置缩进，默认跳过空白行
