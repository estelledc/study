---
title: shiki — 用 VS Code 那套 TextMate 语法给网页代码上色
description: 介绍固定版本 shiki 如何用 TextMate grammar、可选 Oniguruma 或 JS 引擎和 transformer 把代码变成带主题的 HTML
来源: https://github.com/shikijs/shiki
日期: 2026-08-27
分类: 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/shikijs/shiki
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 48cd2cc695ed2e3357c3f9c370578ea843d6d9a3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.4.3
---

## 是什么

shiki 是一套把源代码切成 token、再按 VS Code 主题上色的 JavaScript 库。日常类比：它不自己写 200 多种语言的词典，而是把 VS Code 用的 TextMate grammar 和主题 JSON 搬到 Node / 浏览器里，输出已经带颜色的 HTML 或 HAST。

默认入口是全量 bundle：

```ts
import { codeToHtml } from "shiki"

const html = await codeToHtml('console.log("hi")', {
  lang: "javascript",
  theme: "github-dark",
})
```

`codeToHtml` 是异步 shorthand：内部维护一个进程级单例 highlighter，按这次调用的语言和主题再 `loadLanguage` / `loadTheme`。固定 4.4.3 的 `shiki` 包声明 `type: module`、`engines.node >= 20`。

## 为什么重要

不看固定 4.4.3 的分层，下面这些说法会对不上：

- 为什么文档站代码块能和 VS Code 用同一套颜色，而 highlight.js 路线对不齐
- 为什么 `import { codeToHtml } from 'shiki'` 看起来只引一个函数，却带着全量语言 / 主题注册表
- 为什么现在可以不加载 Oniguruma WASM，改走 JavaScript 正则引擎
- 为什么双主题不再只是“每个 span 写两套 inline color”

## 核心要点

固定版本可以拆成五层：

1. **默认全量 bundle**：`createHighlighter` / `codeToHtml` 来自 `bundle-full`。它登记 242 个 language id、65 个 theme id，默认 engine 是 `createOnigurumaEngine(import('shiki/wasm'))`。另有 `shiki/bundle/web`（57 个 web 语言）和细粒度的 `createHighlighterCore`。

2. **先切词，再上色**：core 先把代码编成 token，再编成 HAST，最后 `hast-util-to-html` 出字符串。默认结构是 `pre.shiki > code > span.line`，`tabindex` 默认 `"0"`，空白 token 默认合并。

3. **两种正则引擎**：Oniguruma WASM 是默认；`createJavaScriptRegexEngine` 用 `oniguruma-to-es` 把 TextMate 模式编译成 JS `RegExp`。JS 引擎默认 `target: 'auto'`、`recursionLimit: 5`，遇不到的 Oniguruma 特性会抛错，除非打开 `forgiving`。

4. **特殊语言不走 grammar 表**：`plaintext` / `txt` / `text` / `plain` 被硬编码成纯文本；`ansi` 和它们同属 special lang，不会去全量 bundle 里找同名 grammar。

5. **transformer 是钩子链**：preprocess → tokens → span / line / code / pre → HTML `postprocess`。`@shikijs/transformers` 的 `transformerNotationHighlight` 识别 `[!code highlight]` / `[!code hl]`，默认给行加 `highlighted`。

## 实践示例

### 案例 1：异步 shorthand 与同步实例

```ts
import { codeToHtml, createHighlighter } from "shiki"

const once = await codeToHtml("const n = 1", {
  lang: "ts",
  theme: "nord",
})

const highlighter = await createHighlighter({
  langs: ["typescript", "javascript"],
  themes: ["nord", "github-dark"],
})
const again = highlighter.codeToHtml("const n = 1", {
  lang: "ts",
  theme: "nord",
})
```

**逐部分**：`codeToHtml` 会拿单例、按需加载后染色，所以必须 `await`。`createHighlighter` 预加载列出的语言和主题后，实例方法是同步的。两者都走同一份全量注册表；没列出的 bundled id 仍可通过后续 `loadLanguage` / `loadTheme` 补。

### 案例 2：双主题写成 CSS 变量

```ts
const html = await codeToHtml(code, {
  lang: "js",
  themes: {
    light: "github-light",
    dark: "github-dark",
  },
})
```

**逐部分**：传入 `themes` 而不是 `theme` 时，默认 `defaultColor` 是 `"light"`，前缀是 `--shiki-`，`colorsRendering` 是 `css-vars`。默认主题的前景/背景仍可写进 style，其余主题变成 `--shiki-dark` 这类变量。没有 `theme` 也没有 `themes` 会抛错。

### 案例 3：用 notation transformer 标行

```ts
import { codeToHtml } from "shiki"
import { transformerNotationHighlight } from "@shikijs/transformers"

const html = await codeToHtml(
  `const a = 1
// [!code highlight]
const b = 2`,
  {
    lang: "js",
    theme: "nord",
    transformers: [transformerNotationHighlight()],
  },
)
```

**逐部分**：默认 `matchAlgorithm` 是 `v3`——单独成行的注释作用在**下一行**，所以 `const b = 2` 会加上 `highlighted`，`pre` 加上 `has-highlighted`。别名是 `highlight` 与 `hl`。同包还有 diff / focus / error-level 等 notation。

## 踩过的坑

1. **把默认 import 当成“只带一个函数”**：`from 'shiki'` 的 factory 带着全量 langs/themes 映射（按 id 动态 import）。要自己列语言，用 `createHighlighterCore` 并显式传入 engine。
2. **把实例 `codeToHtml` 和顶层 `codeToHtml` 当成同一个签名**：顶层 shorthand 是 async；实例方法在已 load 后同步。
3. **把双主题理解成“HTML 体积必然翻倍”**：4.4.3 默认走 CSS 变量，不是每个 token 写两套 inline `color`。最终体积仍取决于 bundler 和主题数，本轮未测。
4. **把 JS 引擎当成 Oniguruma 的完全替身**：`oniguruma-to-es` 编不出的模式会抛错；`forgiving: true` 是跳过，不是补齐语义。
5. **把 `lang: 'text'` 当成要去 bundle 里找 grammar**：`text` / `plain` / `txt` / `plaintext` 直接按纯文本处理。

## 适用 vs 不适用场景

**适用**：

- 静态文档站 / SSG 在 build 期染色，希望颜色贴近 VS Code
- 需要 4.4.3 全量 bundle 里那 242 种语言或 65 个主题
- 能接受 Node >= 20，以及默认 Oniguruma WASM 或显式换成 JS 引擎

**不适用**：

- 只要一份 virtual AST、还要自动猜语言——看 [[lowlight]]
- 在线可编辑代码，而不是只读代码块——看 [[monaco-editor]] / [[codemirror]]
- 不能加载 WASM，又不能接受 JS 引擎的 grammar 缺口
- 要把未测的 bundle / 冷启动毫秒数写成选型结论

## 固定版本边界

- 本文绑定 `shikijs/shiki@48cd2cc695ed2e3357c3f9c370578ea843d6d9a3`，即 annotated tag `v4.4.3` 的剥皮提交；`shiki` / `@shikijs/core` / `@shikijs/transformers` 均为 `4.4.3`。
- npm `shiki@4.4.3` 未暴露 `gitHead`；本文绑定 GitHub tag 剥皮提交。
- 包声明 Node >= 20、ESM-only。
- 默认 engine 是 Oniguruma WASM；JS 引擎是可选替换，不是默认。
- 本文未安装依赖、未跑上游测试、未测 WASM / bundle / 渲染耗时，状态保持 `UNVERIFIED`。

## 学到什么

1. **复用编辑器生态，是在复用 grammar 和主题，不是复用整个 IDE**
2. **“一个函数”的默认入口可以带着整张注册表**——控制体积要换 core 入口
3. **引擎是可替换的正则后端**——WASM Oniguruma 与 JS 编译器合同不同
4. **双主题和 transformer 都是渲染层合同**——先有 token，再决定 style / class 怎么贴

## 应用型自测

1. 顶层 `codeToHtml(...)` 是同步还是异步？
2. `lang: 'text'` 会去 242 个 bundled grammar 里找一份 `text` 定义吗？
3. 默认的 `transformerNotationHighlight` 里，单独一行 `// [!code highlight]` 标的是这一行还是下一行？

检查点：

1. 异步。它是单例 shorthand，内部要 `await` 加载语言和主题。
2. 不会。`text` / `plain` / `txt` / `plaintext` 是硬编码纯文本。
3. 下一行。默认 `matchAlgorithm` 是 `v3`，纯行注释作用在下一行。

## 延伸阅读

- 官方文档：[shiki.style](https://shiki.style/)
- 固定源码：[shikijs/shiki](https://github.com/shikijs/shiki) —— 本文绑定提交 `48cd2cc695ed2e3357c3f9c370578ea843d6d9a3`
- [[lowlight]] —— highlight.js grammar + hast AST 的对照路线
- [[vitepress]] —— 默认用 shiki 染色的文档框架

## 关联

- [[lowlight]] —— 另一条语法高亮合同：虚拟 AST，而不是 TextMate HTML
- [[vitepress]] —— Vue 文档站，默认代码渲染器
- [[starlight]] —— Astro 文档主题，上层常包 shiki
- [[monaco-editor]] —— 浏览器里的可编辑 VS Code 引擎
- [[markdown-it]] —— 常和 shiki 插件一起渲染围栏代码块
- [[unified]] —— remark / rehype 流水线，也有 shiki 插件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳

- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[lowlight]] —— lowlight — 把 highlight.js 的染色结果收成 hast 树
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳
