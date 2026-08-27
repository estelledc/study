---
title: commonmark.js — 先建 AST、再决定怎么渲染的 CommonMark 参考实现
description: 介绍 CommonMark 的 JavaScript 参考实现如何按行建块、再解析行内，以及 HtmlRenderer 的 safe 选项才拦截原始 HTML
来源: https://github.com/commonmark/commonmark.js
日期: 2026-08-27
分类: markdown / 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/commonmark/commonmark.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cb2c2303d3550ec6ef28ceb2841f148e8761eebf
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.31.2
---

## 是什么

commonmark.js 是 CommonMark 的 JavaScript 参考实现。日常类比：先把文章拆成一棵可改的目录树，再请人按树抄成网页；中间那棵树可以自己剪枝，渲染器只负责输出。

你写：

```js
import { Parser, HtmlRenderer } from 'commonmark';

const reader = new Parser();
const writer = new HtmlRenderer();
const ast = reader.parse('Hello *world*');
writer.render(ast);
```

`Parser.parse` 返回一棵 `Node`；`HtmlRenderer.render` 再走树。固定 0.31.2 的 ESM 入口是 `lib/index.js`，CJS 走打包后的 `dist/commonmark.js`。

## 为什么重要

不理解“先 AST、后渲染”和默认不安全，就解释不了下面几件事：

- 为什么改强调、抽标题不必重写解析器
- 为什么 `<em>x</em>` 默认会原样进 HTML
- 为什么 `javascript:` 链接默认不会被丢掉
- 为什么表格和 `~~del~~` 不会出现在这棵树里

## 核心要点

固定 0.31.2 的主链可以拆成五步：

1. **按行建块**：`parse()` 先按 `\r\n|\n|\r` 切行，再 `incorporateLine`。块类型写在 `blocks` 表里，用 `canContain` / `acceptsLines` / `finalize` 决定谁能嵌谁。

2. **再解析行内**：块全部 `finalize` 之后，`processInlines` 用 `Node.walker()` 只给 `paragraph` 和 `heading` 跑 `InlineParser.parse`。引用定义先收进 `refmap`。

3. **树是可改的**：`Node` 暴露 `appendChild` / `unlink` / `insertBefore` / `walker`。`type`、`firstChild`、`sourcepos` 只读；`literal`、`destination`、`title`、`info`、`level` 可写。

4. **渲染默认放行 HTML**：`html_inline` / `html_block` 默认 `lit(node.literal)`。只有 `new HtmlRenderer({ safe: true })` 才改成 `<!-- raw HTML omitted -->`，并拦 `javascript:` / `vbscript:` / `file:` / 多数 `data:`，只放行 `data:image/(png|gif|jpeg|webp)`。

5. **没有 GFM 插件口**：节点类型名单不含 table 或 strikethrough。`Parser` 文档里的选项主要是 `smart`（弯引号、en/em dash、省略号）和调试用 `time`。

## 实践示例

### 案例 1：parse 与 render 分开

```js
const ast = new Parser().parse('# Hi\n\nA [link](/x).');
new HtmlRenderer().render(ast);
```

中间可以改 `ast`，不必再喂一遍原文。CJS 写法是 `new commonmark.Parser()`。

### 案例 2：walker 改树上的文本

```js
const parsed = new Parser().parse('Hello *world*');
const walker = parsed.walker();
let event;
while ((event = walker.next())) {
  if (event.entering && event.node.type === 'text') {
    event.node.literal = event.node.literal.toUpperCase();
  }
}
```

`next()` 带回 `{ entering, node }`；容器会进一次、出一次。破坏树结构时用 `resumeAt`。

### 案例 3：`safe` 才是过滤开关

```js
const ast = new Parser().parse('<em>x</em>\n\n[x](javascript:alert(1))');
new HtmlRenderer().render(ast);              // 原始 HTML 与 javascript: 都在
new HtmlRenderer({ safe: true }).render(ast); // HTML 变注释，href 被拿掉
```

`softbreak` 默认是 `"\n"`，可改成 `"<br />"` 或空格。`sourcepos: true` 会给块级标签加 `data-sourcepos`。

## 踩过的坑

1. **把参考实现当成“默认消毒”**：CommonMark 本身包含原始 HTML。过滤是渲染选项，不是解析器默认值。
2. **在 Parser 上找 `html: false`**：没有这个开关。不想要 HTML，解析后删 `html_*` 节点，或开 `safe`。
3. **以为会出 `<table>`**：GFM 表不是 CommonMark 节点。要表或删除线，看 [[remarkable]] 默认规则，或 [[markdown-it]] / [[marked]]。
4. **把 npm 包和源码 tag 拆开猜**：`commonmark@0.31.2` 的 `gitHead` 与 tag `0.31.2` 都指向 `cb2c2303...`。
5. **把 README 的 bench 数字当成本轮测量**：源码带 `bench/`，本轮未跑、未对比。

## 适用 vs 不适用场景

**适用**：

- 需要一棵可改的 CommonMark AST，再决定 HTML / XML / 自定输出
- 想对齐 spec 的块/行内分层，而不是“一段正则出 HTML”
- 能接受默认放行 HTML，并在渲染层显式开 `safe`

**不适用**：

- 默认就要 table / `~~del~~` / 脚注——看 [[remarkable]] 的 default preset
- 要 named Ruler 插规则，而不是改树——[[markdown-it]] 更贴
- 要 AST + remark 插件链——[[unified]] / [[micromark]]
- 不能接受 `engines.node: "*"` 与生产依赖 `entities` / `mdurl` / `minimist`

## 固定版本边界

- 本文绑定 `commonmark/commonmark.js@cb2c2303d3550ec6ef28ceb2841f148e8761eebf`，tag `0.31.2` 与 npm `commonmark@0.31.2` 的 `gitHead` 同指此提交。
- `exports` 区分 `require` → `./dist/commonmark.js` 与默认 `./lib/index.js`；许可为 BSD-2-Clause。
- `Parser` 是返回对象的工厂；`new Parser()` 与直接调用都能拿到带 `parse` 的对象。
- 本文未安装依赖、未跑 `test/spec.txt`、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **参考实现把“认语法”和“出 HTML”拆开**——树可以改，渲染器只走访问。
2. **安全是渲染合同**——`safe` 默认关；不要把“官方实现”读成“默认无 XSS”。
3. **行内只挂在段落和标题上**——list / block_quote 自己不跑 inline parser。
4. **没有 GFM 节点就不要假装有表**——要扩展语法，换带规则表的引擎。

## 应用型自测

1. `new HtmlRenderer().render(new Parser().parse('<em>x</em>'))` 会不会把标签转义掉？
2. 不传 `safe` 时，`[x](javascript:alert(1))` 的 `href` 还会不会写出来？
3. `new Parser().parse('| a | b |\n| --- | --- |\n| 1 | 2 |')` 会不会长出 `table` 节点？

检查点：

1. 不会转义。默认 `html_inline` / `html_block` 原样输出。
2. 会。只有 `safe: true` 才把不安全协议的 `href` 拿掉。
3. 不会。节点类型名单里没有 table。

## 延伸阅读

- 文档与 dingus：[commonmark.org](https://commonmark.org) / [try.commonmark.org](https://try.commonmark.org/)
- 固定源码：[commonmark/commonmark.js](https://github.com/commonmark/commonmark.js) —— 本文绑定提交 `cb2c2303d3550ec6ef28ceb2841f148e8761eebf`
- CommonMark spec：[spec.commonmark.org](https://spec.commonmark.org/)
- [[remarkable]] —— 默认带表和删除线，用 preset 才贴近 CommonMark
- [[markdown-it]] —— 同样有 `commonmark` preset，但默认规则表不同

## 关联

- [[remarkable]] —— token + Ruler 路线的对照
- [[markdown-it]] —— 工业级 named rule / plugin
- [[marked]] —— Lexer / Renderer，默认 GFM
- [[micromark]] —— 事件流状态机，不直接给业务调
- [[unified]] —— 把解析事件再收成 mdast

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
