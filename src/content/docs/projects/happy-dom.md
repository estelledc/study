---
title: happy-dom — 用 Browser/Window 分层模拟无 GUI 浏览器
description: 用固定源码理解 happy-dom 的 Detached Window、Browser context 和默认关闭的 JS 求值。
来源: https://github.com/capricorn86/happy-dom
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/capricorn86/happy-dom
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 00fcf21b00da1ba1ed89f1b940592c32de21708d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 20.11.8
---

## 是什么

happy-dom 是一套用 JavaScript 实现的无 GUI 浏览器。日常类比：它给测试和 SSR 准备了一间能开关灯、能装页面、但不负责真正画屏幕的排练厅——DOM、Fetch、定时器都在，布局和像素不在。

固定 `v20.11.8` 里有两条入口。`new Window()` 自己搭一个 `DetachedBrowser`；`new Browser()` 则显式管理 context 和 page。工作区源码把包版本写成 `0.0.0`，发布身份以 npm `happy-dom@20.11.8` 和 tag 为准。

```js
import { Window } from "happy-dom";

const window = new Window({ url: "https://example.test/" });
window.document.body.innerHTML = "<p id='n'>ok</p>";
console.log(window.document.querySelector("#n").textContent);
await window.happyDOM.close();
```

`window.happyDOM` 是 `DetachedWindowAPI`：能读 settings、`waitUntilComplete()`、`abort()`、`close()`。

## 为什么重要

不理解这条分层，就解释不了下面几件事：

- 为什么测试里 `document` 能用，但默认 `<script>` 不一定会跑
- 为什么 `new Window()` 和 `browser.newPage()` 不是同一条所有权链
- 为什么要把 Window 属性登记到 `globalThis` 做成单独的 `@happy-dom/global-registrator`
- 为什么它能当 [[vitest]] environment，却不能替代 [[playwright]] 的真浏览器

## 核心要点

固定版本的主链可以拆成四步：

1. **先有 Browser，再有 Window**：`Window` 构造器创建 `DetachedBrowser`，取出 default context 的第一页 `mainFrame`，再调用 `BrowserWindow` 超类。`Browser` 自己持有 `contexts[]`，`newPage()` 只打 default context，`newIncognitoContext()` 另开一间。

2. **Page 把导航委托给 Frame**：`BrowserPage.content` / `url` / `goto()` / `evaluate()` / `waitUntilComplete()` 都转到 `mainFrame`。`goto(url)` 返回 `Promise<Response | null>`。

3. **JS 求值默认关**：`DefaultBrowserSettings.enableJavaScriptEvaluation` 为 `false`。旧字段 `disableJavaScriptEvaluation` 仍在接口上，但注释写明“现在默认就不求值”。打开求值等于启用 VM 字符串代码生成，源码自己标了 RCE 风险。

4. **HTML 是手写扫描器**：`HTMLParser` 用 `MARKUP_REGEXP` 分段读标签，不是 htmlparser2。`evaluateScripts` 默认 false；脚本元素还要再看 settings 才会 `#evaluateScript` / `#evaluateModule`。

## 实践示例

### 案例 1：Window 只改文档，不启动完整 Browser API

```js
import { Window } from "happy-dom";

const window = new Window({
  url: "https://app.test/",
  width: 800,
  height: 600
});
window.document.write("<!doctype html><p>hello</p>");
console.log(window.document.body.textContent);
await window.happyDOM.close();
```

`width` / `height` 写进 detached page 的 viewport；`innerWidth` / `innerHeight` 在类型里已 deprecated。

### 案例 2：用 Browser 管多页

```js
import { Browser } from "happy-dom";

const browser = new Browser();
const page = browser.newPage();
page.url = "https://app.test/";
page.content = "<main><button>Go</button></main>";
const button = page.mainFrame.window.document.querySelector("button");
await browser.close();
```

`browser.close()` 之后 `contexts` 被清空；再 `newPage()` 会抛 `No default context`。

### 案例 3：显式打开脚本求值

```js
const browser = new Browser({
  settings: { enableJavaScriptEvaluation: true }
});
```

固定默认值是关。测试组件通常只操作已经渲染好的 DOM；需要执行页面内 `<script>` 或 `page.evaluate()` 编译路径时，必须自己打开，并接受 VM 隔离不是安全沙箱。

## 踩过的坑

1. **以为默认会跑页面脚本**：`enableJavaScriptEvaluation` 默认 `false`；只设 `disableJavaScriptEvaluation: false` 不会打开求值。
2. **把 `new Window()` 当成可复用 Browser**：它每次自建 `DetachedBrowser`；多页、incognito、共享 cookie 要走 `Browser`。
3. **重复 `GlobalRegistrator.register()`**：第二次会 throw。卸载要走 `unregister()`。
4. **把 layout 数字当真实几何**：`getBoundingClientRect()` 一类 API 存在，但不等于排过版。
5. **把工作区 `0.0.0` 写成适用版本**：发布身份是 tag / npm `20.11.8`。

## 适用 vs 不适用场景

**适用**：

- [[vitest]] / Jest 组件单测，需要 `document`、事件和 Custom Elements
- 想显式管理 page / context，而不是只挂一个全局 Window
- Node `>=20`，并能接受无 GUI、无真实 layout

**不适用**：

- 需要像素、字体、滚动和跨浏览器视觉——用 [[playwright]]
- 要把页面内脚本默认当浏览器一样执行，却不愿处理 VM / RCE 边界
- 只要一份轻量 HTML 树做 SSR 序列化，不需要 Browser 会话——看 [[linkedom]]
- 源码级对照 jsdom 的实现细节：jsdom 不在本页绑定范围

## 固定版本边界

- 本文绑定 `capricorn86/happy-dom@00fcf21b...`，lightweight tag 与 npm `gitHead` 均为 `20.11.8`。
- 同仓还有 `@happy-dom/jest-environment`、`global-registrator`、`server-renderer`、`node-canvas-adapter`；工作区版本是 `0.0.0`，本文不把子包 latest 外推。
- Node engines：`>=20.0.0`。默认 viewport `1024×768`，`errorCapture` 为 `tryAndCatch`。
- 未安装依赖、运行上游 Vitest/Jest、启动 server-renderer 或测量性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **无 GUI 浏览器也有会话模型**——Window 只是 frame 上的文档视图
2. **默认安全开关会改测试语义**——脚本不跑不是解析失败
3. **测试环境包是登记器，不是第二份 DOM**
4. **parser 实现不能按“都是 htmlparser2”外推**

## 应用型自测

1. 固定默认 settings 下，把带 `<script>window.__x=1</script>` 的 HTML 赋给 `page.content`。`window.__x` 一定是 `1` 吗？
2. `new Window()` 内部创建的是 `Browser` 还是 `DetachedBrowser`？
3. `await browser.close()` 之后再 `browser.newPage()` 会怎样？

检查点：

1. 不一定。默认 `enableJavaScriptEvaluation` 为 false。
2. `DetachedBrowser`。
3. 抛 `No default context. The browser has been closed.`

## 延伸阅读

- 文档：[Happy DOM Wiki](https://github.com/capricorn86/happy-dom/wiki/)
- 固定源码：[capricorn86/happy-dom](https://github.com/capricorn86/happy-dom) —— 本文绑定 `00fcf21b00da1ba1ed89f1b940592c32de21708d`
- 审查记录：仓库内 `docs/dom-impl-source-review-20260827-di.md`
- [[linkedom]] —— 同一主题的三链表 DOM，入口是 parser 而不是 Browser
- [[vitest]] —— 常见宿主；默认 environment 仍是 `node`

## 关联

- [[linkedom]] —— 轻量 DOM 树 / SSR 序列化对照
- [[vitest]] —— `environment: 'happy-dom'` 的常见调用方
- [[testing-library]] —— 组件查询层，不提供 DOM 实现
- [[playwright]] —— 真浏览器，覆盖 layout 与视觉

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[linkedom]] —— linkedom — 用三链表而不是子数组实现 DOM
