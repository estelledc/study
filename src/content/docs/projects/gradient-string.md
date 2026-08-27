---
title: gradient-string — 给终端字符串铺一条渐变
description: "介绍 gradient-string 如何用 tinygradient 取色、用 chalk.hex 逐字上色，以及 multiline 如何按列对齐。"
来源: https://github.com/bokub/gradient-string
日期: 2026-08-27
分类: 终端工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/bokub/gradient-string
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ca0c941216029e6a36d76a0cbebc0dca50355f54
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.0
---

## 是什么

gradient-string 是一个把颜色数组编成“逐字符 chalk 上色”函数的小库。日常类比：它不是喷枪整段喷一种色，而是沿尺子给每个可见格子发一块色卡；尺子怎么量，单行和多行并不相同。

```js
import gradient from "gradient-string"

console.log(gradient(["cyan", "pink"])("Hello world!"))
```

固定 `3.0.0` 是 ESM（`"type": "module"`），依赖 `chalk@^5.3.0` 和 `tinygradient@^1.1.5`。它自己不算色域，也不画像素：插值交给 tinygradient，ANSI 交给 chalk。

## 为什么重要

不理解两种上色尺子，下面这些事会对不上：

- 为什么把 [[figlet]] 的多行输出直接丢进 `gradient(...)(art)`，竖列颜色会对不齐
- 为什么 `rainbow` 的色标几乎是两个红，却能扫过一整圈色相
- 为什么 v3 README 坚持 `gradient(['red', 'blue'])`，旧的 `gradient('red', 'blue')` 却还能跑
- 为什么空格在默认函数里“不占颜色”，在 `multiline` 里又占

## 核心要点

固定版本可以拆成四步：

1. **造函数**：`gradient(colors[], options?)` 先 `tinygradient(...)`，再返回可调用对象。零参数抛 `Missing gradient colors`；单个非数组参数抛 `Expected an array of colors, received ...`；只有一个 stop 的数组会在 tinygradient 里变成 `Invalid number of stops (< 2)`。

2. **默认上色（`applyGradient`）**：颜色数量是 `max(去掉空白后的字符数, stops.length)`。遍历时空白原样留下、不 `shift` 色卡；每个非空白字符包一层 `chalk.hex`。

3. **`multiline`**：先按行切开，颜色数量是 `max(最长行的 length, stops.length)`——**空格计入 length**。每一行都 `colors.slice(0)` 从头刷，并且每个字符（含空格）都消耗一色。这样同一列会落到同一张色卡上，适合 ASCII 画。

4. **预设**：13 个 named export（`atlas`、`cristal`、`teen`、`mind`、`morning`、`vice`、`passion`、`fruit`、`instagram`、`retro`、`summer`、`rainbow`、`pastel`）。`rainbow` 是 `#ff0000` → `#ff0100` 加 `interpolation: 'hsv'`、`hsvSpin: 'long'`；`pastel` 同样走 HSV long。默认插值是 `rgb`，`hsvSpin` 默认 `short`。

## 实践示例

### 案例 1：v3 数组入口

```js
import gradient from "gradient-string"

const cool = gradient(["#FF0000", "#00FF00", "#0000FF"])
console.log(cool("This is a fancy string!"))
```

颜色字符串交给 TinyColor。也可以写 `{ color, pos }` 自定义 stop。options 第二参：`{ interpolation: 'hsv', hsvSpin: 'long' }`。

### 案例 2：给 figlet 画上色必须走 multiline

```js
import figlet from "figlet"
import { rainbow } from "gradient-string"

const art = await figlet.text("Hi")
console.log(rainbow.multiline(art))
```

默认函数会跳过空格，ASCII 画的空洞不占色，下一笔可见字符会提前用掉下一张色卡，竖线会“错位”。`multiline` 按列对齐。测试里 `rainbow.multiline('hi\nworld')` 明确不等于两行各自 `rainbow(...)` 再拼接。

### 案例 3：named import，不要再挂在 default 上

```js
import { cristal, pastel } from "gradient-string"

console.log(cristal("Hello world"))
console.log(pastel("soft"))
```

`cristal` 等于 `['#bdfff3', '#4ac29a']`。`pastel` 等于 `['#74ebd5', '#74ecd5']` 加 HSV long。`gradient.cristal` 仍然存在，但源码标了 deprecated。

## 踩过的坑

1. **用默认函数给多行 ASCII 上色**：空格跳色，列对不齐；banner 场景用 `multiline`。
2. **把 `rainbow` 想成一份手写彩虹表**：源码只有两个几乎相同的红，靠 HSV 长弧扫色相。
3. **继续教 v2 变参当唯一合同**：变参仍可用，但单字符串会抛“期望数组”；新代码应按数组写。
4. **在 CommonJS 里 `require('gradient-string')`**：包是 ESM，chalk 5 也是 ESM。
5. **把预览图或“好看”写成可复现指标**：本页未跑终端、未测 truecolor 降级。

## 适用 vs 不适用场景

**适用**：

- CLI 启动 banner、帮助头、短日志里的一次性渐变
- 已经有多行等宽文本（尤其是 figlet 输出），需要列对齐的水平渐变
- 能接受 ESM + chalk 5，并且输出目标是 ANSI 终端

**不适用**：

- 需要真正的图形渐变或 CSS——这是字符串着色，不是 canvas
- 高频重绘的 progress / spinner（[[ora]] / [[ink]]）
- 必须停在 CommonJS 且不能动态 `import()`
- 要把未实测的色准、对比度或下载量写成结论

## 固定版本边界

- 本文绑定 `bokub/gradient-string@ca0c9412...`，包版本 `3.0.0`；npm `gitHead`、tag `3.0.0` 与该提交一致。
- `node >= 14`；依赖 `chalk@^5.3.0`、`tinygradient@^1.1.5`。
- 默认插值 `rgb` / `hsvSpin: 'short'`；空输入或 `null` 会变成空字符串再上色。
- 本文未安装依赖、未跑 vitest、未在终端核对色值，状态保持 `UNVERIFIED`。

## 学到什么

1. **渐变函数有两把尺子**——默认按可见字符发色；`multiline` 按列发色。
2. **预设是短色标加插值，不是调色盘 PNG**——`rainbow` 尤其容易误读。
3. **v3 合同是数组**——变参是兼容层，单色调用会失败。
4. **它不画，只包 ANSI**——最终颜色仍取决于 chalk 的 level 和终端。

## 应用型自测

1. `gradient(['orange', 'purple'])('hello\nworld')` 和 `.multiline('hello\nworld')` 是否同一合同？
2. `rainbow` 的颜色数组里有几种色？它靠什么扫出彩虹？
3. `gradient('red')('abc')` 在 3.0.0 会怎样？

检查点：

1. 不同。默认函数跳过空白；`multiline` 每行重置色带且空格也占色。测试断言 `orange/purple` 的 multiline 等于两行各自上色再 `\n` 拼接，但 `rainbow.multiline('hi\nworld')` 不等于两行各自 `rainbow`。
2. 两种：`#ff0000` 与 `#ff0100`，加上 HSV long spin。
3. 抛 `Expected an array of colors, received "red"`。要写成 `gradient(['red', 'blue'])`。

## 延伸阅读

- 固定源码：[bokub/gradient-string](https://github.com/bokub/gradient-string) —— 本文绑定提交 `ca0c941216029e6a36d76a0cbebc0dca50355f54`
- 对照入口：`src/index.ts`（`applyGradient` / `multiline` / `aliases`）
- tinygradient：[mistic100/tinygradient](https://github.com/mistic100/tinygradient)
- [[figlet]] —— 多行 ASCII 源；和本库组 CLI banner 时走 `multiline`
- [[chalk]] —— 真正写出 `\x1b[38;2;...m` 的那一层

## 关联

- [[figlet]] —— 常见的 ASCII 大字来源
- [[chalk]] —— hex / rgb / 降级都在这里
- [[boxen]] —— 上色之后再套框
- [[ora]] —— 同行动画，不是渐变横幅
- [[ink]] —— 组件化终端 UI，不靠一次性字符串着色

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[figlet]] —— figlet — 把字符串编成 FIGfont ASCII 画
