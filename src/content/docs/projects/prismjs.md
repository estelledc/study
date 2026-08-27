---
title: PrismJS — 按 language-xxx 类名把代码切成 token 再写成 HTML
description: 正则语法表驱动的代码高亮；默认 bundle 含 markup/css/js，不会自动猜语言。
来源: https://github.com/PrismJS/prism
日期: 2026-08-27
分类: 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/PrismJS/prism
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 76dde18a575831c91491895193f56081ac08b0c5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.30.0
---

## 是什么

PrismJS 是一个按语言语法表切词、再输出带 class 的 HTML 的代码高亮库。日常类比：它像一本手写词典——你告诉它“这段是 JavaScript”，它按词典把关键词、字符串、注释贴上标签，再包成 `<span class="token keyword">`。

你写：

```js
const html = Prism.highlight(
  'const n = 1;',
  Prism.languages.javascript,
  'javascript'
);
```

`highlight()` 先 `tokenize()`，再用 `util.encode` 转义后交给 `Token.stringify`。固定 `prism.js` 还拼进 markup / css / clike / javascript 四份语法，以及 file-highlight 插件。

## 为什么重要

不理解 Prism 的类名、语法表和自动扫描边界，就解释不了下面几件事：

- 为什么页面上要写 `language-javascript`，而不是把源码丢进去让它猜
- 为什么没加载对应 grammar 时，`highlight()` 会抛错，而 `highlightElement()` 只会转义纯文本
- 为什么默认脚本会在页面加载后自己扫一遍 `code[class*="language-"]`
- 为什么默认 bundle 能染 JS，却染不了 Rust，除非再引入 `components/prism-rust.js`

## 核心要点

Prism 主链可以拆成五步：

1. **找语言**：`util.getLanguage()` 沿元素及其祖先读 `language-xxxx` / `lang-xxxx`；找不到就当 `none`。

2. **取 grammar**：`Prism.languages[language]`。`extend()` 深拷贝后再覆盖 token；`insertBefore()` 为了保住对象键顺序，会换一份新 grammar 对象。

3. **切成 token 流**：`tokenize()` 用链表跑 `matchGrammar()`。嵌套 `inside` 会递归；`rest` 会被摊回当前 grammar。

4. **编码再序列化**：`util.encode` 只替换 `&`、`<` 和 `\u00a0`。`Token.stringify` 给每个 token 包 `span.token.{type}`，并跑 `wrap` hook。

5. **写回 DOM 或返回字符串**：`highlightElement()` 读 `textContent`，再设 `innerHTML`。`async === true` 且存在 `Worker` 时，才把 `{language, code}` 丢给自建 worker。

## 实践示例

### 案例 1：字符串 API 必须自带 grammar

```js
Prism.highlight('var foo = true;', Prism.languages.javascript, 'javascript');
```

第三个参数只进 hook 环境和 class；真正切词看第二个参数。`grammar` 为空会抛 `The language "…" has no grammar.`

### 案例 2：页面扫描看 class，不看文件扩展名

```html
<pre><code class="language-css">body { color: red; }</code></pre>
<script src="prism.js"></script>
```

默认 `manual` 为 false。文档还在 `loading`，或 script 带 `defer` 且处于 `interactive` 时，会等到 `DOMContentLoaded` 再 `highlightAll()`。选择器是 `code[class*="language-"]`、`[class*="language-"] code` 以及 `lang-` 变体。

### 案例 3：`data-src` 会发 XHR

默认 bundle 含 file-highlight。`pre[data-src]` 会用 `XMLHttpRequest` 拉文件，可选 `data-range` 裁行，再对内部 `<code>` 调用 `highlightElement()`。语言可从扩展名映射（`js` → `javascript`）；没映射就直接用扩展名当 language id。

## 踩过的坑

1. **把 Prism 当成会自动猜语言**：核心没有 `highlightAuto`。class 或 grammar 必须你给。要猜语言看 [[highlight-js]]。

2. **`highlight()` 和 `highlightElement()` 对缺语法的处理不同**：前者抛错；后者把 `textContent` 交给 `util.encode` 后照样插入。

3. **默认会自动扫页**：要自己控制时机，得在加载前设 `Prism.manual = true`，或给 script 加 `data-manual`。

4. **`util.encode` 不是完整 HTML escape**：它不处理 `>`、引号。输出安全仍取决于 grammar 会不会把原始 `<` 留在未编码片段里，以及后续 hook 写了什么。

5. **file-highlight 会按 URL 拉代码**：`data-src` 指向谁，浏览器就请求谁。这不是沙箱，也不是静态编译期染色。

## 适用 vs 不适用场景

**适用**：

- 已经知道语言、只要轻量 class 高亮的博客或文档页
- 需要自己拼语言包，而不是一次载入上百种 grammar
- 想用 hooks / plugins 改 wrap、行号、工具条，但仍走正则语法表

**不适用**：

- 用户乱贴代码、语言未知——那是 [[highlight-js]] 的 `highlightAuto`
- 要和 VS Code 同一套 TextMate 配色——看 [[shiki]]
- 要边输入边染色的编辑器——看 [[monaco-editor]]
- 把 Prism 当 XSS 过滤器或 ReDoS 防火墙。`SECURITY.md` 把部分二次复杂度 regex 当成 bug 而不是 CVE

## 固定版本边界

- 本文绑定 `PrismJS/prism@76dde18a...` / tag `v1.30.0` / 包版本 `1.30.0`。
- npm `1.30.0` 的 `gitHead` 是父提交 `93cca40b...`（`npm pkg fix`），与 tag 不是同一 SHA；未把两者写成一致。
- 默认 `prism.js` 含 markup、css、clike、javascript 与 file-highlight；其他语言在 `components/`。
- `engines` 声明 Node `>=6`。本文未安装依赖、跑 mocha、测 worker 或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **语法表是显式输入**——Prism 不猜语言，class / grammar 是合同的一部分。
2. **扫描 DOM 和纯函数不是同一条 API**——`highlightAll` 会改页面；`highlight` 只返回字符串。
3. **默认 bundle ≠ 全语言**——JS/CSS/HTML 能用，不代表 Rust 已经注册。
4. **插件可以引入网络**——file-highlight 的 `data-src` 是 XHR，不是本地 tokenize。

## 应用型自测

1. 页面只有 `<code>const x = 1;</code>`、没有 `language-*` class，默认脚本会按 JavaScript 染色吗？
2. `Prism.highlight(code, undefined, 'rust')` 会返回转义纯文本还是抛错？
3. 默认 `manual` 是 true 还是 false？

检查点：

1. 不会。选择器要求 `language-` / `lang-` class，且核心没有自动检测。
2. 抛错。缺 grammar 时 `highlight()` 直接 throw。
3. false。除非事先设置或加上 `data-manual`。

## 延伸阅读

- 官网：[prismjs.com](https://prismjs.com/)
- 固定源码：[PrismJS/prism](https://github.com/PrismJS/prism) —— 本文绑定提交 `76dde18a575831c91491895193f56081ac08b0c5`
- [[highlight-js]] —— 带自动检测的另一条正则高亮路线
- [[shiki]] —— 复用 VS Code TextMate grammar / theme

## 关联

- [[highlight-js]] —— 自动检测 + `hljs-` class；Prism 要你指定语言
- [[shiki]] —— 编译期、编辑器同款配色；Prism 是运行时正则表
- [[monaco-editor]] —— 可编辑；Prism 只输出静态 HTML
- [[markdown-it]] —— 常把 fence 语言转成 `language-xxx` 再交给 Prism

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
