---
title: htmlparser2 — 用回调与启发式补洞的流式 HTML/XML 解析器
description: 介绍 htmlparser2 12.0.0 如何用 Tokenizer、Parser 回调和 openImpliesClose 组织流式解析，并区分 DOM helper 与 WHATWG 树构建。
来源: https://github.com/fb55/htmlparser2
日期: 2026-08-27
分类: Markdown / 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/fb55/htmlparser2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c73fec0c0586647cd1269d2598e2ba4203d0207f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 12.0.0
---

## 是什么

htmlparser2 是一个面向 HTML 和 XML 的流式解析器。日常类比：传送带边检员——标签一到就喊名字、属性和开关门，不等整份文件装成树。需要整棵树时，再另请 `DomHandler` 把喊声记成节点。

你写：

```js
import { Parser, parseDocument } from 'htmlparser2';

const parser = new Parser({
  onopentag(name, attribs) { /* name + attribs */ },
  ontext(text) { /* 可能多次 */ },
  onclosetag(name, isImplied) { /* 显式或补上的关标签 */ },
});
parser.write('<p>Hi<br>');
parser.end();

const dom = parseDocument('<ul><li>a');
```

`Parser` 吃字符串块；`parseDocument` 只是新建 `DomHandler` 再 `end(data)`。固定 12.0.0 是 ESM，`engines.node >= 20.19.0`。

## 为什么重要

不读固定 12.0.0 源码，就容易把三件事说成“浏览器同款解析”：

- 为什么 `<p>a<p>b` 会先关前一个 `p`，但整份文档不会自动补 `html`/`head`/`body`
- 为什么 `Parser` 不能直接 `pipe`，要走 `htmlparser2/WritableStream`
- 为什么 README 自己把严格 HTML 规范交给 [[parse5]]

## 核心要点

固定 12.0.0 的主链可以拆成五步：

1. **Tokenizer 扫字节**：`src/Tokenizer.ts` 用状态机切文本、标签、注释、CDATA。HTML 模式里 `script` / `style` / `title` / `textarea` / `iframe` 等走 raw-text 或 RCDATA，不会把里面的 `<` 当新标签。
2. **Parser 维持标签栈**：`onopentagname` 后先查 `openImpliesClose`；void 元素不入栈，并立刻 `onclosetag(name, true)`。
3. **可选 Handler 收事件**：自己实现回调，或让 `DomHandler` 拼 `domhandler` 树。重复属性只留第一次。
4. **流式入口是子路径**：Node 用 `WritableStream`（`StringDecoder`），Web 用 `WebWritableStream`（`TextDecoder`）。两者内部仍是同一个 `Parser`。
5. **XML / feed 另开开关**：`xmlMode: true` 时默认小写关闭、识别自闭合和 CDATA。`parseFeed` 若你不传 options，会自带 `{ xmlMode: true }`。

## 实践示例

### 案例 1：HTML 模式会补关，但不会补文档壳

```js
const seen = [];
const parser = new Parser({
  onopentag(name, _attribs, isImplied) { seen.push(['open', name, isImplied]); },
  onclosetag(name, isImplied) { seen.push(['close', name, isImplied]); },
});
parser.end('<p>one<p>two</br>');
```

第二个 `<p>` 会先隐式关掉前一个；`</br>` 会补一对 open/close。栈空时结束，不会长出 `html` 根。

### 案例 2：`parseDocument` 与回调是同一条 Parser

```js
import { parseDocument, DomUtils } from 'htmlparser2';

const dom = parseDocument('<div id="x">Hi</div>');
DomUtils.getElementById('x', dom); // domhandler 节点
```

`parseDocument` 不换算法，只是把 Handler 换成 `DomHandler`。CSS 选择器要另接 `css-select`；jQuery 风格 API 在 cheerio，不在本包。

### 案例 3：第二个 `<form>` 在 HTML 模式被丢掉

```js
parser.write('<form id="a"><form id="b"></form></form>');
```

`emitOpenTag` 发现栈里已有 `form` 就把 `tagname` 置空，后续属性与闭合都对不上这个第二份表单。

## 踩过的坑

1. **把 `Parser` 当成 Node `Writable`**：接口像流，但 `write` 只收字符串。要 `pipe` 文件或 `fetch` body，用子路径导出。
2. **把启发式补洞当成 WHATWG**：`openImpliesClose` 是一张 Map，没有 adoption agency，也不会按插入模式造 `html`/`head`/`body`。要浏览器同款树，看 [[parse5]]。
3. **给 `parseFeed` 传了 options 却忘了 `xmlMode`**：默认对象只有在你不传第二参时生效。
4. **把 README 的毫秒数当成本轮测量**：那些数字来自外部 benchmark，本轮未跑。
5. **以为重复属性后面的会覆盖**：`onattribend` 用 `Object.hasOwn`，先到的留下。

## 适用 vs 不适用场景

**适用**：

- 要边读边处理标签，或只要 `domhandler` 树再交给 DomUtils / css-select
- HTML 与 XML/RSS 共用一套 Tokenizer，靠 `xmlMode` 切换
- 运行时已是 Node >= 20.19，并能接受 ESM

**不适用**：

- 必须按 WHATWG 补全文档、处理 foster parenting / adoption agency——应看 [[parse5]]
- 只做 Markdown 到 HTML——[[marked]] / [[markdown-it]] 更贴
- 不能接受“快但不完整实现规范”的合同

## 固定版本边界

- 本文绑定 `fb55/htmlparser2@c73fec0c0586647cd1269d2598e2ba4203d0207f`，源码 tag `v12.0.0` 剥皮提交与 npm `gitHead` 一致；annotated tag 对象是 `d210690686ead3f3004b521998e7b42be46e808f`。
- `package.json` 声明 `type=module`、`sideEffects=false`、`engines.node >= 20.19.0`。
- HTML 非 foreign 上下文会把 `image` 调成 `img`；SVG 标签走 `svgTagNameAdjustments`。
- 本文未安装依赖、运行上游测试或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **回调是一等合同**——DOM 只是一种 Handler，不是解析器本体。
2. **HTML 模式会补洞，但补得不完整**——implied close / void / `form` / `</p>` / `</br>` 都写在 Parser 里，不是浏览器树构建。
3. **流要走子路径**——`Parser` 与 `Writable` / Web Streams 是两层包装。
4. **feed 默认 XML**——自己传 options 时要把 `xmlMode` 一并带上。

## 应用型自测

1. `new Parser()` 不设 options 时，`lowerCaseTags` 默认是 true 还是 false？
2. `parseDocument('<br>')` 会不会在 Handler 里看到一次 implied `onclosetag('br')`？
3. `parse5.parse` 和 `htmlparser2.parseDocument` 对输入 `<p>hi` 会不会都补出 `<html><head></head><body>`？

检查点：

1. true。默认 `htmlMode`，`lowerCaseTags` 回落为 `!xmlMode`。
2. 会。void 元素在 `endOpenTag` 里立刻 `onclosetag(name, true)`。
3. 不会。只有 [[parse5]] 按插入模式补文档壳；htmlparser2 停在 `p`。

## 延伸阅读

- README：[fb55/htmlparser2](https://github.com/fb55/htmlparser2)
- 固定源码：本文绑定提交 `c73fec0c0586647cd1269d2598e2ba4203d0207f`
- [[parse5]] —— 同一主题下的 WHATWG 对照
- [[unified]] / [[micromark]] —— 词法与语法树在 Markdown 侧的另一种拆法

## 关联

- [[parse5]] —— 规范树构建与 serializer 对照组
- [[marked]] —— Markdown 正则 Lexer，不是 HTML 树
- [[markdown-it]] —— 可插拔 Markdown 规则链
- [[unified]] —— 语法树工具带，parse5 常出现在 HTML 端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
