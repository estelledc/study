---
title: Cheerio — 用 jQuery 选择器操作 parse5 / htmlparser2 树
description: 用 jQuery 选择器操作 parse5 / htmlparser2 树，不执行页面脚本。
来源: https://github.com/cheeriojs/cheerio
日期: 2026-08-27
分类: HTML 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/cheeriojs/cheerio
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e3c7aaf9ed64fe3cb9a181e58a41c0fdd6dbfbfc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.0
---

## 是什么

Cheerio 是一个面向 Node 的 HTML/XML 查询与改写库。日常类比：它像把 jQuery 的 `$()` 接到一份已经拆好的纸质目录上——能按选择器找节点、改属性、再序列化回去，但目录本身不会“跑起来”。

你写：

```js
import * as cheerio from "cheerio";

const $ = cheerio.load("<ul><li class=\"apple\">Apple</li></ul>");
$(".apple").text(); // "Apple"
```

`load()` 默认把字符串交给 parse5，再用 htmlparser2 树适配器生成 `domhandler` 节点。固定 1.2.0 同时导出 `cheerio`、`cheerio/slim` 与 `cheerio/utils`；实际入口由 browser / import / require 条件决定。

## 为什么重要

不理解 Cheerio 的加载与解析边界，就解释不了下面几件事：

- 为什么默认 HTML 走 parse5，而 `xml: true` 会切到 htmlparser2
- 为什么 `load(html)` 可能补出 `<html>` / `<head>` / `<body>`，而第三个参数 `false` 进入 fragment
- 为什么 `scriptingEnabled` 默认 true 并不表示会执行 `<script>`
- 为什么 `fromURL()` 会拒绝非 2xx 和非 HTML/XML Content-Type

## 核心要点

Cheerio 的主链可以拆成五步：

1. **选解析器**：`flattenOptions()` 只在 `xml` / `xmlMode` 为真时把 `_useHtmlParser2` 设为 true；默认仍是 parse5。

2. **装成文档或片段**：`getParse()` 把字符串交给选定 parser；`isDocument` 默认 true，parse5 走 `parseDocument`，否则走 `parseFragment`。

3. **绑定 `$`**：`getLoad()` 为这次文档生成 `LoadedCheerio`，并把 static 方法挂到 `$` 上。`$('selector')` 最终调用 context 的 `.find()`。

4. **操作 ArrayLike 选择集**：实例混入 attributes / traversing / manipulation / css / forms / extract，下标和 `length` 像数组。

5. **再序列化**：HTML 默认用 parse5 `serializeOuter`；htmlparser2 路径用 `dom-serializer`。

## 实践示例

### 案例 1：默认文档模式会补齐 html 骨架

```js
import * as cheerio from "cheerio";

const $ = cheerio.load("<h1>Hi</h1>");
$.html();
// 通常包含 <html><head></head><body><h1>Hi</h1></body></html>
```

第三个参数默认是 `true`。只要骨架，改成 `cheerio.load("<h1>Hi</h1>", null, false)`。

### 案例 2：XML 与 slim 都走 htmlparser2

```js
const $xml = cheerio.load("<item id=\"1\"/>", { xml: true });
import { load as loadSlim } from "cheerio/slim";
const $slim = loadSlim("<div class=\"x\">ok</div>");
```

`xml: true` 会设 `_useHtmlParser2` 与 `xmlMode`。`cheerio/slim` 的 `load` 直接绑 `htmlparser2.parseDocument`，不加载 parse5。

### 案例 3：`fromURL` 只接受 HTML/XML 成功响应

```js
const $ = await cheerio.fromURL("https://example.com/page");
```

固定实现用 undici `Client`，默认最多 5 次 redirect，状态码不在 200-299 会抛 `ResponseError`；Content-Type 既不是 HTML 也不是 XML 会抛 `RangeError`。HTML 默认编码嗅探底是 `windows-1252`，XML 是 `utf8`。

## 踩过的坑

1. **把 `scriptingEnabled` 当成会跑脚本**：parse5 默认 `scriptingEnabled: true` 只影响 `<noscript>` 等解析，Cheerio 不会执行 JavaScript。

2. **`$.text()` 含 script/style**：静态 `text()` 走 `textContent`。要避开这两类节点，源码建议用 `.prop('innerText')`。

3. **`parseHTML` 默认丢掉 script**：`keepScripts` 默认 false，会 `parsed('script').remove()`。

4. **`$(null)` 与空文档不是一回事**：`load(null)` 直接抛 `cheerio.load() expects a string`；`$()` 才是空选择集。

5. **选择器字符串里的 `<` 会被当成 HTML**：`isHtml()` 只要看到 `<` 后跟字母或 `!`，再出现 `>`，就走 parse 而不是 CSS 选择器。

## 适用 vs 不适用场景

**适用**：

- Node >=20.18.1，只要查询/改写静态 HTML 或 XML
- 需要 jQuery 风格链式 API，但不需要 Window、事件或布局
- 想按入口控制体积：完整包带 parse5 + `fromURL`，slim 只留 htmlparser2

**不适用**：

- 需要执行页面脚本、XHR、Cookie 或 DOM 事件——那是 [[jsdom]] 的合同
- 需要真实 layout / 浏览器 API——用 [[playwright]]
- 把 Cheerio 当安全沙箱——它只是解析和改树，不隔离脚本

## 固定版本边界

- 本文绑定 `cheeriojs/cheerio@e3c7aaf9...`，tag、package 与 npm `gitHead` 均为 `1.2.0`。
- 默认 HTML parser 是 parse5；XML / slim 使用 htmlparser2。
- 完整入口依赖 undici 做 `fromURL`；package 声明 Node >=20.18.1。
- 本文未安装依赖、请求远程页面、运行 Vitest 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **查询 API 不等于浏览器**——`$()` 操作的是 `domhandler` 树，不是 Window。
2. **解析器是选项，不是口号**——HTML 默认 parse5，XML 与 slim 才是 htmlparser2。
3. **文档模式会改输入**——默认 `isDocument=true` 可能补骨架。
4. **便利加载自带拒绝规则**——`fromURL` 先看状态码和 MIME，再决定是否解析。

## 应用型自测

1. `cheerio.load("<p>x</p>")` 默认用 parse5 还是 htmlparser2？
2. `load(html, { xml: true })` 会不会继续走 parse5？
3. 默认 `scriptingEnabled` 为 true，页面里的 `<script>alert(1)</script>` 会执行吗？

检查点：

1. parse5；`_useHtmlParser2` 默认 false。
2. 不会。`xml: true` 会切到 htmlparser2。
3. 不会。该标志只影响解析，不执行脚本。

## 延伸阅读

- 官方文档：[cheerio.js.org](https://cheerio.js.org/)
- 固定源码：[cheeriojs/cheerio](https://github.com/cheeriojs/cheerio) —— 本文绑定提交 `e3c7aaf9ed64fe3cb9a181e58a41c0fdd6dbfbfc`
- [[jsdom]] —— 需要 Window / 脚本时的对照实现
- [[unified]] —— 另一条 AST + plugin 文档管线

## 关联

- [[jsdom]] —— 完整 WHATWG DOM；Cheerio 只提供选择集
- [[unified]] —— remark/rehype 处理树，而不是 jQuery API
- [[marked]] —— Markdown → HTML，常作为 Cheerio 的上游输入
- [[testing-library]] —— 组件测试里更常见的是 jsdom，不是 Cheerio
- [[playwright]] —— 需要真实浏览器时不要用 Cheerio 冒充

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
