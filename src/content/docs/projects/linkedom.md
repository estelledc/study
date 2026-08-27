---
title: linkedom — 用三链表而不是子数组实现 DOM
description: 用固定源码理解 linkedom 的 PREV/NEXT/END、htmlparser2 入口和 cached 导出。
来源: https://github.com/WebReflection/linkedom
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/WebReflection/linkedom
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fcd88e02b6dd3e616f5de512b15713b663d16ab7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.18.13
---

## 是什么

linkedom 是一份面向无 DOM 环境的 DOM-like 实现。日常类比：它不先把每个父节点做成“孩子名单”，而是把整份文档排成一条可以向前、向后走的链，每个元素再用哨兵节点标出自己的终点。

固定 `v0.18.13` 的主入口是 `parseHTML` / `DOMParser`。它们返回的 `window` 和 `document` 是这次解析的结果，不是 Node 进程全局。

```js
import { parseHTML } from "linkedom";

const { window, document } = parseHTML("<!doctype html><p>hi</p>");
console.log(document.querySelector("p").textContent);
console.log(document.toString());
```

`exports` 还提供 `linkedom/cached` 和 `linkedom/worker`。`canvas` 是 optional peer，本轮未安装。

## 为什么重要

不理解三链表，就解释不了下面几件事：

- 为什么读 `childNodes` 每次都像在“数一遍”，而不是拿出事先存好的数组
- 为什么 `parseHTML` 不会自动污染 `globalThis.document`
- 为什么同一套选择器在默认导出和 `/cached` 导出里成本模型不同
- 为什么它适合 SSR 序列化，却不是 [[happy-dom]] 那种 Browser 会话

## 核心要点

固定版本的主链可以拆成四步：

1. **解析入口**：`parseHTML(html, globals)` 等于 `new DOMParser().parseFromString(html, 'text/html', globals).defaultView`。MIME 为 `text/html` 时建 `HTMLDocument`，`image/svg+xml` 建 `SVGDocument`，其余走 `XMLDocument`。

2. **htmlparser2 线性建树**：`parseFromString` 打开 `htmlparser2.Parser`，在 `onopentag` / `ontext` / `onclosetag` 里把节点链进当前父节点的 `END` 之前。HTML 模式 `xmlMode: false`，属性名默认不强制小写。

3. **PREV / NEXT / END**：`ParentNode` 构造时创建一个 `NODE_END` 哨兵。`firstChild` 从 `NEXT` 跳过 attribute 节点，走到 `END` 为止。`appendChild(node)` 就是 `insertBefore(node, this[END])`。`childNodes` 现算 `NodeList`。

4. **选择器沿链扫描**：`querySelector` 用 `css-select` 做成匹配函数，再从 `NEXT` 走到 `END`；遇到 `<template>` 会跳到它的 `END`，不进入模板内容。`/cached` 用 WeakMap 记住同选择器结果，并在插入或改属性时 `reset`。

## 实践示例

### 案例 1：SSR 解析后再序列化

```js
import { parseHTML } from "linkedom";

const { document, customElements, HTMLElement } = parseHTML(`
  <!doctype html>
  <html><body><main></main></body></html>
`);

customElements.define("x-hi", class extends HTMLElement {
  connectedCallback() {
    this.textContent = "ok";
  }
});
document.querySelector("main").appendChild(document.createElement("x-hi"));
const html = document.toString();
```

`connectedCallback` 在解析期若 registry 已激活会走；这里是解析后再 `define` + `appendChild`。返回值里的 `document` 仍不是全局。

### 案例 2：需要反复 query 时改用 cached

```js
import { parseHTML } from "linkedom/cached";

const { document } = parseHTML("<ul><li>a</li><li>b</li></ul>");
document.querySelectorAll("li");
document.querySelectorAll("li");
```

第二次同选择器走 WeakMap。插入或 `setAttribute` 会 `reset` 父节点缓存；把 cached 文档当可变热路径时，不能假设列表永远新鲜。

### 案例 3：JSDON 往返，不是 JSON.parse

```js
import { parseHTML, toJSON, parseJSON } from "linkedom";

const { document } = parseHTML("<p>x</p>");
const packed = toJSON(document);
const again = parseJSON(packed);
```

这是仓库自己的 JSDON 数组格式。`JSON.parse(document.toString())` 不是这条路径。

## 踩过的坑

1. **以为 `parseHTML` 登记了全局 `document`**：它只解构返回值。要全局登记是另一件事，本库不提供 happy-dom 那种 registrator。
2. **把 `childNodes` 当稳定数组引用**：每次 getter 都新建 `NodeList`。
3. **用默认导出却按 cached 的成本模型做优化**：缓存只在 `linkedom/cached`。
4. **把 README 的速度数字写成事实**：本轮未跑 benchmark。
5. **HTML 传入 `'...'`**：`DOMParser` 会把它替换成一份空的 html/head/body 骨架。

## 适用 vs 不适用场景

**适用**：

- Node `>=16` 的 SSR：解析 HTML、改节点、`document.toString()` 出字符串
- 只要 DOM-like 树和 CSS 选择器，不要 Browser / Fetch / 定时器会话
- 需要 `parseJSON` / `toJSON` 在 worker 之间搬树

**不适用**：

- 组件单测要 `window.fetch`、页面脚本、多 page context——用 [[happy-dom]] 或 [[vitest]] 的环境
- 要真实 layout、字体、截图——用 [[playwright]]
- 把 jsdom 的兼容表当成这份实现的保证：两者 parser 与节点存储都不同，且 jsdom 不在本页范围

## 固定版本边界

- 本文绑定 `WebReflection/linkedom@fcd88e02...`，annotated tag `v0.18.13` 与 npm `gitHead` 一致。
- 依赖含 `htmlparser2@^10.1.0`、`css-select@^7.0.0`、`cssom`、`html-escaper`、`uhyphen`。
- `canvas` 为 optional peer；`./worker` 导出不捆绑 canvas，并从 `globalThis` 取 `performance`。
- 未安装依赖、运行 `c8` 测试或任何 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **DOM 树可以用链表示**——父节点不必持有孩子数组
2. **解析结果不是进程全局**——调用方必须接住返回值
3. **缓存是显式导出，不是默认行为**
4. **序列化有两条线**：`toString()` 出 HTML，`toJSON()` 出 JSDON

## 应用型自测

1. `parseHTML('<p>1</p>')` 之后，不解构赋值，`globalThis.document` 会变成这份文档吗？
2. 连续读两次 `element.childNodes`，这两个 `NodeList` 是同一个对象吗？
3. 默认 `linkedom` 导出里，第二次 `querySelectorAll('div')` 会命中 WeakMap 吗？

检查点：

1. 不会。返回值里的 document 不是全局。
2. 不是；getter 每次新建。
3. 不会。WeakMap 缓存在 `linkedom/cached`。

## 延伸阅读

- 固定源码：[WebReflection/linkedom](https://github.com/WebReflection/linkedom) —— 本文绑定 `fcd88e02b6dd3e616f5de512b15713b663d16ab7`
- 数据结构说明：仓库内 `deep-dive.md`
- 审查记录：仓库内 `docs/dom-impl-source-review-20260827-di.md`
- [[happy-dom]] —— Browser / Window 会话型对照
- [[vitest]] —— 测试宿主；linkedom 通常不当默认 environment

## 关联

- [[happy-dom]] —— 无 GUI 浏览器，默认关 JS 求值
- [[vitest]] —— 常见测试运行器
- [[testing-library]] —— 查询层，不实现 DOM
- [[playwright]] —— 真浏览器自动化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[happy-dom]] —— happy-dom — 用 Browser/Window 分层模拟无 GUI 浏览器
