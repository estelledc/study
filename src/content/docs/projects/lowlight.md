---
title: lowlight — 把 highlight.js 的染色结果收成 hast 树
description: 介绍固定版本 lowlight 如何用 highlightjs grammar 和自定义 HastEmitter 输出虚拟语法高亮 AST
来源: https://github.com/wooorm/lowlight
日期: 2026-08-27
分类: 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/wooorm/lowlight
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0f36148072cd096ca86753d6f1ff01589d30d78f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.3.0
---

## 是什么

lowlight 是一层包在 [highlight.js](https://github.com/highlightjs/highlight.js) 外面的虚拟语法高亮器。日常类比：highlight.js 默认交出来的是一段 HTML 字符串；lowlight 把同一套 grammar 的染色过程改写成 hast 树，好让 React / Preact / rehype 按节点 diff，而不是把整段 HTML 当字符串塞回去。

```js
import { common, createLowlight } from "lowlight"

const lowlight = createLowlight(common)
const tree = lowlight.highlight("js", '"use strict";')
```

`tree` 是 `{ type: 'root', children, data: { language, relevance } }`。固定 3.3.0 依赖 `highlight.js@~11.11.0`，包本身是 ESM-only，`exports` 只有 `./index.js`。

## 为什么重要

不看这层 emitter，很容易把 lowlight 和“又一个 highlight.js 封装”混在一起：

- 为什么 rehype 插件更愿意消费 AST，而不是 `innerHTML`
- 为什么空 `createLowlight()` 什么语言都染不了，必须先 `register` 或传入 `common` / `all`
- 为什么 `highlightAuto` 会把一段普通字符串认成奇怪的语言
- 为什么它和 [[shiki]] 都能“高亮”，却不是同一套 grammar / 主题合同

## 核心要点

固定 3.3.0 的主链很短：

1. **先建一台 highlight.js 实例**：`createLowlight(grammars)` 调用 `highlight.js/lib/core` 的 `newInstance()`。传入的 map 会立刻 `registerLanguage`。`common` 预置 37 个 grammar，`all` 预置 155 个；不传则 `listLanguages()` 是空数组。

2. **指定语言染色**：`highlight(language, value)` 先查 `getLanguage`。未注册就抛 `Unknown language: \`...\` is not registered`。命中后把 emitter 换成内部 `HastEmitter`，并固定 `ignoreIllegals: true`。

3. **输出是树，不是 HTML**：`HastEmitter` 往 stack 上推 `span`，文本节点按 scope 挂 class。第一段 class 加前缀（默认 `hljs-`），嵌套段加递增下划线后缀。根节点带 `data.language` 和 `data.relevance`。

4. **自动猜测是穷举打分**：`highlightAuto(value, { subset })` 对 subset（默认全部已注册名）逐个 `highlight`，留下 `relevance` 最高的那棵树。全都失败就返回空 `root`，`language` 为 `undefined`。

## 实践示例

### 案例 1：用 common 染一段 CSS

```js
import { common, createLowlight } from "lowlight"

const lowlight = createLowlight(common)
const tree = lowlight.highlight("css", "em { color: red }")
// tree.data.language === 'css'
```

**逐部分**：`common` 里已经有 `css`。`highlight` 的第一个参数是语言名，第二个才是代码。类名前缀默认 `hljs-`，可用 `{ prefix: '' }` 关掉。返回值还不是字符串；要 HTML 得自己再走 `hast-util-to-html`。

### 案例 2：空实例必须先注册

```js
import { createLowlight } from "lowlight"
import javascript from "highlight.js/lib/languages/javascript"

const lowlight = createLowlight()
lowlight.listLanguages() // []
lowlight.register({ javascript })
lowlight.registered("javascript") // true
lowlight.highlight("javascript", "const x = 1")
```

**逐部分**：不传 grammar 时内部只有一台空的 highlight.js 实例。`register` 既接受 `{ name: fn }` 对象，也接受 `(name, fn)` 两个参数。`registerAlias` 把别名交给 `registerAliases`；没登记的名字直接抛错，不会静默当纯文本。

### 案例 3：highlightAuto 取 relevance 最高者

```js
const tree = lowlight.highlightAuto('"hello, " + name + "!"', {
  subset: ["javascript", "xml"],
})
```

**逐部分**：`subset` 限制候选。实现是循环调用 `highlight`，比较 `data.relevance`，不是 highlight.js 自己的 `highlightAuto` 入口。候选里没有已注册语言时，得到空 children。

## 踩过的坑

1. **以为默认就带齐语言**：`createLowlight()` 是空的；`common` 也只有 37 个，不是 155 个的 `all`。
2. **把返回值当 HTML**：`toHTML()` 在 `HastEmitter` 里固定返回空字符串。真正的产物是 hast，要自己序列化或交给 rehype。
3. **把 `highlightAuto` 当成“稳准的语言识别”**：它只是对 subset 穷举打分。readme 自己的例子也会把普通拼接字符串认成 `arduino`。
4. **未注册语言不会退化成纯文本**：`highlight('ts', code)` 在只注册了 `typescript` 时会抛错，除非先 `registerAlias`。
5. **不要把 highlight.js 的 HTML 主题类名合同写成 shiki 主题 JSON**：lowlight 产出的是 `hljs-*` class，颜色来自你自己的 CSS。

## 适用 vs 不适用场景

**适用**：

- 已经走 unified / rehype / React 这类“要树不要字符串”的渲染
- 希望复用 highlight.js 的 grammar，并自己控制注册了哪些语言
- 需要 `highlightAuto` 这种穷举猜测，且能接受它会猜错

**不适用**：

- 要和 VS Code / TextMate 主题对齐——看 [[shiki]]
- 只要一段可以直接 `innerHTML` 的 HTML，并不在意 AST
- 不能接受 `highlight.js@~11.11.0` 这条依赖，或需要按 TextMate scope 上色
- 要把“识别准确率”或 class 体积写成未测结论

## 固定版本边界

- 本文绑定 `wooorm/lowlight@0f36148072cd096ca86753d6f1ff01589d30d78f`，lightweight tag `3.3.0`；npm `lowlight@3.3.0` 的 `gitHead` 同指此提交。
- 运行时依赖 `highlight.js@~11.11.0`。包未声明 `engines`；readme 写 Node 16+、ESM-only。
- `ignoreIllegals` 在 `highlight` 路径上被写死为 `true`。
- `common` 37 个 grammar、`all` 155 个，以固定提交的 `lib/common.js` / `lib/all.js` 为准。
- 本文未安装依赖、未跑上游测试、未序列化 HTML、未测识别准确率，状态保持 `UNVERIFIED`。

## 学到什么

1. **同一套 grammar 也可以换一种产物**：HTML 字符串和 hast 树服务的是不同渲染栈
2. **“自动猜语言”常常是穷举打分**——分数最高不等于语义正确
3. **空实例是显式合同**：不预注册，就没有任何语言
4. **class 前缀和嵌套后缀是 emitter 的细节**，不是主题 JSON

## 应用型自测

1. `createLowlight()` 之后直接 `highlight('js', '1+1')` 会怎样？
2. `HastEmitter.toHTML()` 会不会返回染色后的 HTML 字符串？
3. `highlightAuto` 是调用 highlight.js 的 `highlightAuto`，还是自己循环 `highlight`？

检查点：

1. 抛 `Unknown language: \`js\` is not registered`，因为空实例没有登记任何 grammar。
2. 不会。它固定返回 `''`；真正的树在 `root` 上。
3. 自己循环。它对 subset 逐个 `highlight`，比较 `relevance`。

## 延伸阅读

- 仓库说明：[wooorm/lowlight](https://github.com/wooorm/lowlight) —— 本文绑定提交 `0f36148072cd096ca86753d6f1ff01589d30d78f`
- highlight.js：[highlightjs.org](https://highlightjs.org/)
- [[shiki]] —— TextMate + 主题 JSON 的对照路线
- [[unified]] —— 常通过 rehype 消费这棵 hast

## 关联

- [[shiki]] —— VS Code TextMate 路线，默认产物是 HTML
- [[unified]] —— remark / rehype 流水线
- [[markdown-it]] —— 另一条 Markdown 渲染链，常接高亮插件
- [[vitepress]] —— 文档站默认走 shiki，可对照低亮 AST 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[shiki]] —— shiki — 用 VS Code 那套 TextMate 语法给网页代码上色
