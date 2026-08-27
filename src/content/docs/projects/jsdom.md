---
title: jsdom — 在 Node 里模拟 WHATWG DOM，而不是布局引擎
description: 在 Node 里模拟 WHATWG DOM 与 HTML，默认不跑脚本、不加载子资源。
来源: https://github.com/jsdom/jsdom
日期: 2026-08-27
分类: HTML 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jsdom/jsdom
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6584485f094d5b271553005b68804c93a455c002
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 30.0.1
---

## 是什么

jsdom 是一套在 Node 里实现的 WHATWG DOM / HTML 子集。日常类比：它像一间按图纸搭好的空房间——门牌、插座和开关都在，但默认不开灯，也不会按真实墙壁算面积。

你写：

```js
const { JSDOM } = require("jsdom");

const dom = new JSDOM("<!DOCTYPE html><p>Hello</p>");
dom.window.document.querySelector("p").textContent; // "Hello"
```

构造函数先规范化输入，再 `createWindow()`，然后把 markup 填进已有 Document。固定 30.0.1 的 `main` 是 CommonJS `lib/api.js`；HTML 走 parse5，XML 走 saxes。

## 为什么重要

不理解 jsdom 的默认关闭项，就解释不了下面几件事：

- 为什么页面里的 `<script>` 默认不跑，`window.eval` 也不等于“在这个 window 里 eval”
- 为什么 `resources: "usable"` 才会拉脚本/样式，且相对 URL 在默认 `about:blank` 上会失败
- 为什么 `fromURL()` 不允许再传 `url` / `contentType`
- 为什么它能跑 Testing Library，却仍然不是浏览器

## 核心要点

`new JSDOM(input, options)` 的主链是：

1. **读 MIME 与字节**：默认 `contentType` 为 `text/html`；非 HTML/XML 直接 `RangeError`。`Uint8Array` 会做编码嗅探再解码。

2. **建 Window**：`createWindow()` 安装 Web IDL 接口。只有 `runScripts` 为 `outside-only` 或 `dangerously` 时才 `vm.createContext`。

3. **再解析进现有 Document**：parse5 adapter 的 `createDocument()` 返回已经建好的 document，而不是新建一份。

4. **`document.close()`**：恢复资源队列，并按 HTML “the end” 派发 `DOMContentLoaded` / `load`。

5. **资源与脚本是分开的开关**：默认不加载子资源；XHR 仍可用。脚本执行必须显式打开。

## 实践示例

### 案例 1：默认不执行页面脚本

```js
const { JSDOM } = require("jsdom");

const dom = new JSDOM(`<div id="c"></div><script>
  document.getElementById("c").append(document.createElement("hr"));
</script>`);

dom.window.document.getElementById("c").children.length; // 0
```

要让 `<script>` 和 `onclick` 属性运行，必须 `runScripts: "dangerously"`。这会把 `parseOptions.scriptingEnabled` 设为 true。源码与 README 都把它标成对不受信内容危险。

### 案例 2：从外面 eval，但不跑页面脚本

```js
const dom = new JSDOM(`<div id="c"></div><script>
  document.getElementById("c").append(document.createElement("hr"));
</script>`, { runScripts: "outside-only" });

dom.window.eval(`document.getElementById("c").append(document.createElement("p"));`);
```

`outside-only` 给 window 装一份独立的 spec globals，包括有用的 `window.eval`。页面里的 `<script>` 仍不执行。不设 `runScripts` 时，`window.eval === eval`，指向外层 Node。

### 案例 3：`fromURL` 自己决定最终 URL

```js
const dom = await JSDOM.fromURL("https://example.com/");
```

`fromURL` 禁止调用方再传 `url` 或 `contentType`；响应不 ok 会抛错。初次抓取在 `resources` 未写时按 `"usable"` 处理，但后续子资源仍看 `options.resources`。相对子资源还需要非 `about:blank` 的文档 URL。

## 踩过的坑

1. **默认 URL 是 `about:blank`**：相对路径 `/app.js` 无法解析。需要脚本或 iframe 时先设 `url`。

2. **`resources: "usable"` 不等于会跑脚本**：外部 `<script src>` 还要 `runScripts: "dangerously"`。

3. **`includeNodeLocations` 不能配 XML**：`transformOptions()` 在 XML parsingMode 下直接抛 TypeError。

4. **CookieJar 默认 loose**：构造时 `looseMode: true`，和浏览器严格 cookie 不是同一套拒绝规则。

5. **canvas 是可选 peer**：`package.json` 声明 `canvas@^3.2.3` 且 `optional: true`；没装就没有完整 Canvas 实现。

## 适用 vs 不适用场景

**适用**：

- 满足当前 engines：`^22.22.2 || ^24.15.0 || >=26.0.0`
- Jest / Vitest 组件测试需要 `window` / `document`，但不需要像素布局
- 要在 Node 里跑 DOM API、事件、部分 HTML 交互

**不适用**：

- 只要选择器改 HTML 字符串——[[cheerio]] 更窄、默认不碰脚本
- 需要 layout、真实渲染或跨浏览器行为——[[playwright]]
- 想安全执行网上抓来的脚本——`runScripts: "dangerously"` 不是沙箱保证

## 固定版本边界

- 本文绑定 `jsdom/jsdom@6584485f...`，tag、package 与 npm `gitHead` 均为 `30.0.1`。
- 默认 `runScripts` 关闭，`resources` 关闭子资源加载，`storageQuota` 为 5_000_000。
- 抓取栈使用 undici；`canvas` 为可选 peer。
- 本文未安装依赖、运行 Mocha/WPT、发网络请求或测 layout，状态保持 `UNVERIFIED`。

## 学到什么

1. **Window 可以先于 markup 存在**——jsdom 先建空文档，再让 parse5 往里填。
2. **脚本、子资源和视觉能力是三条独立轴**——打开其中一条不会自动打开另外两条。
3. **默认值偏向安全与速度**——不跑脚本、不拉资源、不保存 node location。
4. **“像浏览器”不是“是浏览器”**——没有布局引擎，也不能把 Node 全局和 jsdom window 混成一套 eval。

## 应用型自测

1. 默认 `new JSDOM('<script>window.x=1</script>')` 之后，`window.x` 是 1 吗？
2. 只设 `resources: "usable"`，不设 `runScripts`，外部 `<script src>` 会执行吗？
3. `JSDOM.fromURL(url, { url: "https://other.test" })` 合法吗？

检查点：

1. 不是；默认不执行页面脚本。
2. 不会。外部脚本还要 `runScripts: "dangerously"`。
3. 不合法；`fromURL` 禁止再传 `url`。

## 延伸阅读

- 官方 README：[jsdom/jsdom](https://github.com/jsdom/jsdom)
- 固定源码：本文绑定提交 `6584485f094d5b271553005b68804c93a455c002`
- [[cheerio]] —— 只要静态查询时的更窄选择
- [[testing-library]] —— 常见的 jsdom 消费方
- [[vitest]] —— 用 `environment: "jsdom"` 挂这套 Window

## 关联

- [[cheerio]] —— 选择集 / 序列化，不提供 Window
- [[testing-library]] —— 在 jsdom 里按角色查询组件
- [[vitest]] —— 测试运行时把 jsdom 当 environment
- [[playwright]] —— 真浏览器，覆盖 jsdom 没有的 layout 与引擎差异
- [[unified]] —— 另一条文档树路线，不模拟浏览器全局

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
