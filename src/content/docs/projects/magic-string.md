---
title: magic-string — 按原文下标改字符串并生成 sourcemap
description: 按原文下标改字符串并生成 sourcemap
来源: https://github.com/Rich-Harris/magic-string
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Rich-Harris/magic-string
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5473bfb5138e7b7c2fc91d964c0425f57f1470ce
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.3
---

## 是什么

magic-string 是一个专门改“已经写好的源文字符串”的小库。日常类比：它不把文章拆成语法树再重写，而是在原稿纸上贴便利贴——下标永远指向原稿的第几个字，最后再把便利贴和原稿一起誊成新稿，并画出“新稿哪一列对应旧稿哪一列”的 sourcemap。

```js
import MagicString from "magic-string"

const s = new MagicString("problems = 99")
s.update(0, 8, "answer")
s.update(11, 13, "42")
s.prepend("var ").append(";")
s.toString() // "var answer = 42;"
```

固定 `1.2.3` 是 ESM-only：发布入口是 `dist/index.mjs`，运行时只依赖 `@jridgewell/sourcemap-codec`。包没有声明 `engines`。

## 为什么重要

不按原文下标读 magic-string，下面这些事会对不上：

- 为什么第二次 `update` 仍写 `11, 13`，而不是改完第一次之后的新下标
- 为什么 `s.prepend("var ")` 之后 `s.length()` 还是正文长度，不等于 `s.toString().length`
- 为什么 `replace` 对零宽匹配不能走 `overwrite`
- 为什么 bundler 能用它做轻量改写，而不必先 parse 成 AST

## 核心要点

固定 1.2.3 的主链可以拆成五步：

1. **整段原文先是一块砖**：构造函数建一个 `Chunk(0, original.length, original)`，再用 `byStart` / `byEnd` 两张 Map 记住每块的起止。

2. **下标先加 offset，再看原稿**：`update` / `overwrite` / `remove` / `move` / `appendLeft` / `prependRight` 都先做 `index + this.offset`。改的是原稿坐标，不是当前生成串坐标。

3. **改写时才切开**：`_split(index)` 在下标处把 chunk 一分为二。已经 `edit` 过且还有内容的 chunk 不能再切，否则 sourcemap 对不齐。

4. **intro / outro 在正文外面**：实例级 `prepend` / `append` 写 `intro` / `outro`。`length()` 只累加各 chunk 的 intro+content+outro，不计实例级两端。

5. **最后串起来并可选出图**：`toString()` 走 `intro + 每个 chunk + outro`。`generateMap()` 把解码 mappings 交给 `@jridgewell/sourcemap-codec` 编成 v3 sourcemap。

## 实践示例

### 案例 1：同一段原文上连续改两处

```js
const s = new MagicString("problems = 99")
s.update(0, 8, "answer")
s.update(11, 13, "42")
```

第一次把 `problems` 换成更长或更短的词，第二次仍按原稿里 `99` 的位置写。`update` 默认不清掉该区间上已经 `appendLeft` / `prependRight` 的内容；若要连同这些插入一起盖掉，用 `overwrite`，或给 `update` 传 `{ overwrite: true }`。

### 案例 2：零宽替换必须插入，不能 overwrite

```js
const s = new MagicString("ab")
s.replace(/(?=b)/, "-")
s.toString() // "a-b"
```

`replace` / `replaceAll` 始终在 `original` 上找。匹配长度为 0 时源码走 `appendRight`，因为 `update` 对零长度 range 会抛 `cannot overwrite a zero-length range`。`replaceAll` 若传入不带 `g` 的正则，会直接抛 `MagicStringError`。

### 案例 3：把几段源码收成 Bundle

```js
import MagicString, { Bundle } from "magic-string"

const bundle = new Bundle({ separator: "\n" })
bundle.addSource(new MagicString("var answer = 42;", { filename: "a.js" }))
bundle.addSource(new MagicString("console.log(answer);", { filename: "b.js" }))
bundle.toString()
```

`toString`、`length`、`isEmpty` 和 `generateDecodedMap` 都按同一规则：第一个源前面不加 separator。同名 `filename` 若原文不同会抛错。

## 踩过的坑

1. **按生成串的新下标做第二次改写**：所有 API 的数字都相对原稿（再加 `offset`）。
2. **用 `s.length()` 当输出长度**：实例级 `prepend` / `append` 不计进去。
3. **对已经 edit 过的区间再 `update` 一半**：`_splitChunk` 会拒绝切开已编辑且非空的 chunk。
4. **连续 `move` 之后再搬被拆开的区间**：`hasMovedChunks` 为真时会检查 `[start, end]` 是否仍连在一起，否则抛错，避免链表成环。
5. **把负下标想成 Python 式反复回绕**：非空串上用 `Math.max(0, index + length)` 夹一次。

## 适用 vs 不适用场景

**适用**：

- 已经有字符下标（例如 AST 的 `start` / `end`），只想改几处并保留其余原文
- 需要顺手生成 v3 sourcemap，且能接受 `hires` / `"boundary"` / `addSourcemapLocation` 三种粒度
- 阅读 [[rollup]] / [[vite]] 一类“拿着原文改一改再发出去”的管线

**不适用**：

- 要从语法结构上保证改完仍是合法 JS/TS：应看 [[magicast]] 或完整 compiler
- 需要类型检查或作用域重命名：这不是 parser
- 把 README 或未绑定 benchmark 写成“已经在你的 bundler 里测过”——本文没有这样做

## 固定版本边界

- 本文绑定 `Rich-Harris/magic-string@5473bfb5138e7b7c2fc91d964c0425f57f1470ce`。annotated tag `v1.2.3` 解引用到该提交；`package.json` 为 `1.2.3`。npm 未暴露 `gitHead`。
- 发布物是 ESM；`insert` / `insertLeft` / `insertRight` 已废弃，`insert()` 直接 throw。
- 错误类型为 `MagicStringError`，消息带 `[MagicString]` 前缀。`SourceMap.toUrl()` 需要 `btoa` 或 `Buffer`。
- 未安装依赖、未跑 vitest / tsdown，状态保持 `UNVERIFIED`。

## 学到什么

1. **下标合同比“字符串 API”更关键**——数字始终锚在原稿上。
2. **chunk 链表是为了少复制原文**——只在改写点切开，而不是每次 `slice` 一份新串。
3. **插入位置分“跟着左边走 / 跟着右边走 / 挂在整份外面”**——`appendLeft` 与实例级 `append` 不是一回事。
4. **sourcemap 是后处理**——先改 chunk，再按 intro/edit/unedited/outro 往 mappings 里填。

## 应用型自测

1. `new MagicString("ab")` 后 `update(0, 1, "AA")`，再 `update(1, 2, "B")`，第二次的 `1` 指的是生成串还是原稿？
2. `prepend(">>")` 之后，`length()` 会不会把 `>>` 算进去？
3. `replaceAll(/x/, "y")`（没有 `g`）会怎样？

检查点：

1. 原稿。第二次仍改原来的 `'b'`。
2. 不会。实例级 `intro` 不计入 `length()`。
3. 抛 `MagicStringError`：`replaceAll()` 要求全局正则。

## 延伸阅读

- 固定源码：[Rich-Harris/magic-string](https://github.com/Rich-Harris/magic-string) —— 本文绑定 `5473bfb5138e7b7c2fc91d964c0425f57f1470ce`
- 审查记录：仓库内 `docs/source-transform-source-review-20260827-fh.md`
- [[magicast]] —— 同主题的 AST Proxy 改写法
- [[rollup]] —— 典型的 magic-string 消费者之一

## 关联

- [[magicast]] —— 先 parse 再当对象改，不是按下标改
- [[rollup]] —— ESM 打包器，插件里常见 MagicString
- [[vite]] —— 开发时改写源码的一层
- [[oxc]] —— 另一条“parse 成 AST 再 transform”的路
- [[swc]] —— Rust 编译器对照，不是字符串补丁库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
