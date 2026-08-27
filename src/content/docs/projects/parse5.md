---
title: parse5 — 按 WHATWG 插入模式建树的 HTML 解析器
description: 介绍 parse5 8.0.1 如何用 Tokenizer、插入模式和 tree adapter 做出与浏览器同款的 HTML 文档树。
来源: https://github.com/inikulin/parse5
日期: 2026-08-27
分类: Markdown / 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/inikulin/parse5
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0d56627fc924d40f560fd260ade0e1a935e2369c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.1
---

## 是什么

parse5 是一套按 [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/) 做解析和序列化的工具。日常类比：不只认出零件名称，还按装配图纸把缺的外壳补上——输入半截 `<p>Hi`，出来仍是带 `html` / `head` / `body` 的文档。

你写：

```js
import { parse, parseFragment, serialize, serializeOuter } from 'parse5';

const document = parse('<p>Hi');
const fragment = parseFragment('<tr><td>cell</td></tr>');
serialize(document);           // 子节点，不含 #document 自身
serializeOuter(document.childNodes[0]); // 含该元素
```

固定 8.0.1 在 monorepo 的 `packages/parse5`。根仓 `package.json` 叫 `parse5-build-scripts`；npm 上的 `parse5@8.0.1` 才是这个包。

## 为什么重要

不读固定 8.0.1 源码，就解释不了下面几件事：

- 为什么 `parse('<p>Hi')` 的树里已经有 `html`、`head`、`body`
- 为什么 `serialize(div)` 常常得到内部 HTML，而不是带标签的外层
- 为什么默认树的属性是 `attrs` 数组，不是 `attribs` 对象
- 为什么同一提交里还有 `parse5-htmlparser2-tree-adapter`

## 核心要点

固定 8.0.1 的主链可以拆成五步：

1. **一次写完 Tokenizer**：`Parser.parse` 调用 `tokenizer.write(html, true)`。token 再按插入模式分发：`INITIAL` → `BEFORE_HTML` → `BEFORE_HEAD` → `IN_HEAD` → `AFTER_HEAD` → `IN_BODY` 等。
2. **缺的壳会按规范补**：没有 `<html>` 也会插入 HTML 根；fragment 若没给 context，就用 `<template>`，并用 `documentmock` 当假 document，避免改调用方文档。
3. **tree adapter 决定节点长什么样**：默认 adapter 产出 `{ nodeName, tagName, attrs, namespaceURI, childNodes, parentNode }`。`template` 另有 `content` 文档片段。
4. **序列化分内外**：`serialize` 只走子节点，void 元素返回空串；`serializeOuter` 才包含元素自身。HTML `template` 会改去序列化 `content`。
5. **默认当脚本已开启**：`scriptingEnabled` 默认 `true`，`noscript` 按文本吃。`onParseError` 一旦设置，会强制打开 `sourceCodeLocationInfo`。

## 实践示例

### 案例 1：残缺输入仍是完整文档

```js
const document = parse('<p>Hi');
document.nodeName; // '#document'
document.childNodes.map((n) => n.tagName || n.nodeName);
// 通常含 doctype 之后的 html，html 下再有 head / body
```

这不是“尽量保留原字符串”，而是树构建。要对照不补文档壳的回调解析，看 [[htmlparser2]]。

### 案例 2：`serialize` 与 `serializeOuter`

```js
const frag = parseFragment('<div>Hello <b>x</b></div>');
serialize(frag);                         // '<div>Hello <b>x</b></div>'
serialize(frag.childNodes[0]);           // 'Hello <b>x</b>'
serializeOuter(frag.childNodes[0]);      // '<div>Hello <b>x</b></div>'
```

对 void 元素调用 `serialize` 会得到 `''`，因为函数先判断 void 再决定只串孩子。

### 案例 3：把 WHATWG 树接到 htmlparser2 DOM

```js
import { parse } from 'parse5';
import { adapter } from 'parse5-htmlparser2-tree-adapter';

const dom = parse('<p class="x">Hi', { treeAdapter: adapter });
```

同 tag 的 `parse5-htmlparser2-tree-adapter@8.0.1` 依赖 `domhandler`。属性会变成 `attribs` 对象，而不是默认树的 `attrs` 数组。

## 踩过的坑

1. **把默认树当成浏览器 `Document`**：没有 live collection，也没有 `querySelector`。jsdom / Cheerio 是上游用户，不是这个包自带的 DOM。
2. **对元素调用 `serialize` 却期望带标签**：那是 `serializeOuter`。
3. **看见源码示例里的 `require('parse5')` 就当 CJS 包**：`packages/parse5/package.json` 写了 `type=module`。
4. **把 `Parser` / `Tokenizer` 当成稳定公开面**：`lib/index.ts` 标了 `@internal`；稳定入口是 `parse` / `parseFragment` / `serialize*`。
5. **用 README 的“最快规范实现”当成本轮数字**：未跑 html5lib，也未测吞吐。

## 适用 vs 不适用场景

**适用**：

- 需要与浏览器同一套补洞、foster parenting、adoption agency
- 要可替换 tree adapter，或只要纯对象 AST 再自己序列化
- HTML 文档或 fragment，而不是通用 XML 情报流

**不适用**：

- 只要标签事件、RSS/Atom、最小分配——[[htmlparser2]] 的 `Parser` / `parseFeed` 更贴
- 输入是 Markdown——[[marked]] / [[markdown-it]] / [[micromark]]
- 必须在本包内查询 CSS 或操作 live DOM

## 固定版本边界

- 本文绑定 `inikulin/parse5@0d56627fc924d40f560fd260ade0e1a935e2369c`，lightweight tag `v8.0.1` 与 npm `parse5@8.0.1` `gitHead` 一致。
- 核心包依赖只有 `entities`；同提交工作区还发布 sax-parser、parser-stream、rewriting-stream 与 htmlparser2 tree adapter，版本均为 `8.0.1`。
- adoption agency 外循环 8 次、内循环 3 次，写在 `parser/index.ts`。
- 本文未安装依赖、运行 html5lib 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **插入模式才是主链**——token 之后先问“现在在哪一章”，再决定补什么元素。
2. **`parse` 与 `parseFragment` 的壳不同**——完整文档会补 html/head/body；fragment 默认躲进 template context。
3. **序列化默认看孩子**——void 与 template `content` 都会改出口。
4. **树形状可换**——默认 AST 和 htmlparser2 DOM 是 adapter，不是两套解析器。

## 应用型自测

1. `parse('<p>Hi')` 结束后，文档里会不会只有一个 `p` 根，没有 `html`？
2. 对 `<br>` 元素调用 `serialize` 会得到 `'<br>'` 还是 `''`？
3. 不设 options 时，`scriptingEnabled` 默认是什么？`noscript` 里的标签还会当元素解析吗？

检查点：

1. 不会。插入模式会补 HTML 文档壳。
2. `''`。`serialize` 对 void 元素直接返回空串。
3. 默认 `true`；`noscript` 按文本处理，不当普通子元素。

## 延伸阅读

- 文档：[parse5.js.org](https://parse5.js.org/modules/parse5.html)
- 包清单：[list-of-packages](https://github.com/inikulin/parse5/blob/master/docs/list-of-packages.md)
- 固定源码：本文绑定提交 `0d56627fc924d40f560fd260ade0e1a935e2369c`
- [[htmlparser2]] —— 回调式、启发式补洞的对照

## 关联

- [[htmlparser2]] —— 流式回调与 `domhandler` 树
- [[unified]] —— rehype 一侧常接 parse5
- [[micromark]] —— Markdown 词法，不是 HTML 树构建
- [[marked]] —— 正则 Markdown，输出字符串而不是 WHATWG 文档

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
