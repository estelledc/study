---
title: highlight.js — 先给语言或让 relevance 投票，再把 token 树渲染成 HTML
description: 带自动检测的代码高亮；highlightAuto 用 relevance 投票，缺语言时仍能输出转义文本。
来源: https://github.com/highlightjs/highlight.js
日期: 2026-08-27
分类: 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/highlightjs/highlight.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f7f7d3803bd898e37c017ffb881317f0cde04a70
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.12.0
---

## 是什么

highlight.js 是一个可注册多种语言、也能在语言未知时做启发式检测的代码高亮库。日常类比：它像阅卷老师——你指定科目就按该科规则批；你不指定，它就让已注册语言打分，分高的赢，并列时还要看谁是谁的超集。

新 API 是：

```js
import hljs from "highlight.js";

const { value, language, relevance } = hljs.highlight(
  'const n = 1;',
  { language: "javascript" }
);
```

`highlight()` 会先跑 `before:highlight` 插件。`ignoreIllegals` 未传入时固定实现默认 `true`。旧的 `highlight(lang, code)` 位置参数从 10.7.0 起被标 deprecated。

## 为什么重要

不理解检测、安全模式和 DOM 扫描合同，就解释不了下面几件事：

- 为什么粘贴未知代码仍能出带颜色的 HTML，而 [[prismjs]] 必须先给 grammar
- 为什么 `highlightAuto` 内部把 `ignoreIllegals` 设成 `false`，指定语言时默认却是 `true`
- 为什么代码块里如果已经有子元素，控制台会警告 unescaped HTML
- 为什么 `import "highlight.js"` 的语言集合取决于构建入口，而不是源码树里那 190+ 个 `src/languages/*`

## 核心要点

主链可以拆成五步：

1. **注册语言**：`registerLanguage(name, fn)`。定义函数抛错且处于默认 `SAFE_MODE` 时，该语言会被换成 plaintext 占位，避免一块坏语法拖垮整个库。

2. **指定或检测**：`highlight(code, {language})` 走已编译 mode；`highlightAuto(code)` 在 subset（或全部已注册语言）上跑 `_highlight(..., false)`，再按 relevance 排序。plaintext 始终是候选。

3. **编译 mode 并切词**：`compileLanguage()` 把关键字、begin/end、contains 编成可执行 mode。非法匹配在 `ignoreIllegals=false` 时以 illegal 结果返回。

4. **渲染 HTML**：默认 `__emitter` 是 `TokenTreeEmitter`，再由 `HTMLRenderer` 走 `escapeHTML`（`& < > " '`）输出 `<span class="hljs-…">`。`classPrefix` 默认 `hljs-`。

5. **扫 DOM**：`highlightAll()` 默认 `pre code`。文档仍在 `loading` 时只挂一次 `DOMContentLoaded`。`highlightElement()` 用 `textContent`，写回 `innerHTML`，并设 `dataset.highlighted="yes"`。

## 实践示例

### 案例 1：指定语言时 illegal 默认被忽略

```js
hljs.highlight("not really javascript ???", {
  language: "javascript"
});
```

未传 `ignoreIllegals` 时值为 `true`。检测路径相反：`highlightAuto` 内部调用 `_highlight(name, code, false)`，非法匹配会让该语言丢掉这次竞选。

### 案例 2：自动检测带 secondBest

```js
const result = hljs.highlightAuto("SELECT 1;", ["sql", "javascript"]);
result.language;
result.secondBest?.language;
```

subset 先过滤“已注册且允许 autodetection”的名字。relevance 相同则照顾 `supersetOf`：C++ 和 Arduino 打平会偏向 C++。并列且无超集关系时，保持原顺序。

### 案例 3：DOM 块里的未转义 HTML

```js
hljs.configure({ throwUnescapedHTML: true });
hljs.highlightElement(document.querySelector("pre code"));
```

若该节点已有 element children，默认 `ignoreUnescapedHTML: false` 会 `console.warn`；`throwUnescapedHTML: true` 再抛 `HTMLInjectionError`。已经标过 `dataset.highlighted` 的节点会直接 return。

## 踩过的坑

1. **以为 `import "highlight.js"` 就带齐全部语言**：发布包的语言集合由 `tools/build_node.js` 生成。`./lib/core` 是空核，`./lib/common` 只注册标记为 common 的语言，`./lib/languages/*` 要按需再注册。

2. **把 SAFE_MODE 当成“高亮一定成功”**：默认 `true`。解析炸了会退回 `escape(code)`，`illegal` 为 false，并带 `errorRaised`。`debugMode()` 才会把异常抛出去。

3. **检测分不是语言身份证明**：relevance 是启发式。短片段、配置文件、模板语言很容易误判；需要稳定结果就显式传 `language`。

4. **旧 API 还在**：`highlightBlock`、`initHighlighting`、`initHighlightingOnLoad` 都标了 10.x 弃用，计划在 v12 拿掉。

5. **子节点警告来得可能太晚**：注释写明，若生产环境已经把未转义 HTML 塞进代码块，警告出现时伤害可能已经发生。

## 适用 vs 不适用场景

**适用**：

- 用户粘贴代码、语言经常未知，需要 `highlightAuto`
- Node `>=12` 的服务端或构建期染色，只要注册了目标语言
- 需要 `newInstance()` 隔离语言表（例如给 lowlight 这类包装用）

**不适用**：

- 已经知道语言、只想要最小正则表——[[prismjs]] 的按需 `components/` 更直
- 要 VS Code 同款 TextMate 着色——[[shiki]]
- 可编辑、增量着色——[[monaco-editor]]
- 把自动检测分数写成生产环境的语言鉴定器

## 固定版本边界

- 本文绑定 `highlightjs/highlight.js@f7f7d380...`，tag `11.12.0` 与 npm `gitHead` 一致，包版本 `11.12.0`。
- 源码 `package.json` 无 `exports`；Node/ESM 条件导出由构建脚本写入发布包。
- 默认 `SAFE_MODE=true`，`cssSelector='pre code'`，`ignoreIllegals` 在新 API 上默认 true。
- `engines` 声明 Node `>=12.0.0`。本文未跑 mocha、未执行构建脚本、未测 CDN bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **自动检测是另一条 API**——它用 `ignoreIllegals=false` 和 relevance，不是 `highlight()` 的默认路径。
2. **安全模式先保页面**——坏语言定义会被换成 plaintext，而不是让整页高亮崩溃。
3. **DOM 扫描默认更窄**——`pre code`，不像 Prism 那样扫所有 `language-*`。
4. **发布入口 ≠ 源码树**——语言是否在默认 import 里，要看 build 的 common/core 切分。

## 应用型自测

1. `hljs.highlight(code, { language: "javascript" })` 未传 `ignoreIllegals` 时，默认是 true 还是 false？
2. `highlightAuto` 内部调用 `_highlight` 时，`ignoreIllegals` 是什么？
3. 代码块已有子元素且 `throwUnescapedHTML` 仍为 false，高亮会不会中止？

检查点：

1. true。`undefined` 会被改成 `true`。
2. false。检测要让非法匹配淘汰候选语言。
3. 不会中止。默认只 warn；要抛错必须打开 `throwUnescapedHTML`。

## 延伸阅读

- 官网：[highlightjs.org](https://highlightjs.org/)
- 固定源码：[highlightjs/highlight.js](https://github.com/highlightjs/highlight.js) —— 本文绑定提交 `f7f7d3803bd898e37c017ffb881317f0cde04a70`
- [[prismjs]] —— 指定语言的正则表路线
- [[shiki]] —— TextMate + theme，不是 highlight.js mode

## 关联

- [[prismjs]] —— 无自动检测；Prism 用 `language-xxx` class 驱动扫描
- [[shiki]] —— 文档站更常在构建期用它，而不是 highlight.js
- [[monaco-editor]] —— 编辑器运行时；highlight.js 输出静态 HTML
- [[markdown-it]] —— fence 信息可以喂给 `highlight(code, {language})`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
