---
title: Showdown — 带 flavor 开关的正则 Markdown 转换器
description: 介绍 Showdown 怎样用 Converter、flavor 与 subParser 把 Markdown 变成 HTML，并说明默认 vanilla 并不打开表格
来源: https://github.com/showdownjs/showdown
日期: 2026-08-27
分类: markdown
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/showdownjs/showdown
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9958ba5cfaf01c93ea9e1a48650fb3074eff98ce
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.0
---

## 是什么

Showdown 是一个 JavaScript Markdown → HTML 转换器：你构造一个 `Converter`，再调用 `makeHtml`。日常类比：一台带几套预设菜谱的翻译机——默认走 `vanilla`，想更像 GitHub 要显式换成 `github` flavor，而不是假定出厂就带表格和删除线。

```js
var showdown = require('showdown')
var converter = new showdown.Converter()
var html = converter.makeHtml('# hello, markdown!')
// <h1 id="hellomarkdown">hello, markdown!</h1>
```

固定 2.1.0 的发布物是 `bin` + `dist`；运行时依赖只有 CLI 用的 `commander`。同一提交还有 `makeMarkdown` / `makeMd`，但 Node 里必须自己提供 WHATWG DOM。

## 为什么重要

不读固定 2.1.0 源码，下面这些合同很容易被“GFM 转换器”印象带偏：

- 为什么新建 `Converter()` 不会把 `| a | b |` 变成表格
- 为什么默认标题 id 是 `hellomarkdown` 而不是 GitHub 那种带连字符的形式
- 为什么源里的 `<script>` 会被 hash 后再原样吐回
- 为什么在 Node 里直接 `makeMarkdown` 会抛错

## 核心要点

固定版本的主链可以拆成五步：

1. **实例先拷全局选项**：构造时把 `globalOptions` 抄进本实例，再合并传入对象。默认 flavor 名是 `vanilla`，对应 `getDefaultOpts(true)`：`tables` / `strikethrough` / `tasklists` / `simplifiedAutoLink` / `simpleLineBreaks` 为 false；`ghCodeBlocks`、`encodeEmails`、`ellipsis` 为 true。

2. **`makeHtml` 是一条 subParser 管线**：先把 `¨` 和 `$` 换成占位并统一换行，再跑 lang extensions → metadata → hashPreCodeTags → githubCodeBlocks → hashHTMLBlocks → hashCodeTags → stripLinkDefinitions → `blockGamut` → unhashHTMLSpans → unescapeSpecialChars → completeHTMLDocument → output modifiers。

3. **`blockGamut` 再切一块**：blockQuotes → headers → horizontalRule → lists → codeBlocks → tables → 再 hash 一次 HTML → paragraphs。`tables()` 看到 `options.tables === false` 就原样返回。

4. **HTML 块是占位，不是转义**：`hashHTMLBlocks` 的名单包含 `script` / `iframe` / `style`。匹配到的整块推进 `gHtmlBlocks`，之后还原。带 `markdown` 属性的 HTML 才会再进一轮 `makeHtml`。

5. **扩展分三种**：`lang` 在主链前改文本，`output` 在主链后改 HTML，`listener` 挂 `_dispatch` 事件。`language`/`html` 会归一成 `lang`/`output`；每条扩展要有 `filter`，或 `regex` + `replace`。

## 实践示例

### 案例 1：默认 vanilla 与 github flavor 不是同一套开关

```js
var vanilla = new showdown.Converter()
vanilla.getOption('tables')          // false
vanilla.getOption('ghCodeBlocks')    // true

var github = new showdown.Converter()
github.setFlavor('github')
github.getOption('tables')           // true
github.getOption('simpleLineBreaks') // true
```

`showdown.setFlavor('github')` 会先 `resetOptions` 再覆盖全局默认；实例上的 `setFlavor` 只改这份 options。不要把“Showdown 支持 GFM”写成默认行为。

### 案例 2：标题 id 的默认规则

```js
var converter = new showdown.Converter()
converter.makeHtml('# hello, markdown!')
// id="hellomarkdown"
```

默认是 `title.replace(/[^\w]/g, '').toLowerCase()`。`github` flavor 才打开 `ghCompatibleHeaderId`，空格变 `-` 并删掉一批标点。`noHeaderId: true` 则不加 id。

### 案例 3：lang 扩展在主链之前跑

```js
var converter = new showdown.Converter({
  extensions: [{
    type: 'lang',
    regex: /:(smile):/g,
    replace: '🙂'
  }]
})
```

`runExtension` 有 `filter` 就调用 `ext.filter(text, converter, options)`，否则 `text.replace(regex, replace)`。想改已经生成的标签，应注册 `type: 'output'`。

## 踩过的坑

1. **把 Showdown 当消毒器**：`script` 在 hash 名单里，会按块原样回到输出。用户内容需要外置 sanitizer。
2. **以为默认就有表格和删除线**：这两项在 vanilla 里是 false；要 GFM 风格先 `setFlavor('github')` 或逐项 `setOption`。
3. **在 Node 里直接 `makeMarkdown`**：没有 `window.document` 时必须传入 JSDOM 一类 parser，否则抛 `HTMLParser is undefined`。
4. **把 3.0 RC 的行为写进 2.1.0**：同仓已有 `3.0.0-rc1` / `3.0.0-rc2`，本页不绑定。
5. **把 README 的浏览器清单或 Node 12/14/16/17 写成当前测试矩阵**：那是文档自述，本轮未跑测试。

## 适用 vs 不适用场景

**适用**：

- 需要 flavor / 选项开关，并且接受“先占位 HTML 块、再跑正则 subParser”
- 同时要 Markdown → HTML 和浏览器侧 HTML → Markdown
- 想用 `lang` / `output` / `listener` 插一段正则或 filter

**不适用**：

- 用户提交内容且没有 sanitizer
- 默认就要严格 CommonMark 或默认 GFM 表格
- 只要一个函数、不要 Converter / flavor 概念 → 看 [[snarkdown]]
- 还没量过体积，却把发行包大小写成选型结论

## 固定版本边界

- 本文绑定 `showdownjs/showdown@9958ba5cfaf01c93ea9e1a48650fb3074eff98ce`，tag / npm latest / `gitHead` 均为 `2.1.0`。
- 仓库另有 `3.0.0-rc1`、`3.0.0-rc2`；升级前需重新固定 revision。
- 运行时依赖是 `commander`；`package.json` 的 `files` 只有 `bin` 和 `dist`。
- SECURITY.md 写 2.0.x 仍收安全修复、1.x 因 yargs 不受支持；本轮未复现该漏洞。
- 本文未安装依赖、运行 grunt test 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **flavor 是选项包，不是另一套解析器**——`github` 只是把一批 boolean 打开。
2. **默认 vanilla 比“GFM 转换器”保守**——表格、删除线、任务列表要显式打开。
3. **hash 占位决定了 HTML 的命运**——进名单的块会被保护并原样还原。
4. **反向转换依赖 DOM**——`makeHtml` 是纯字符串；`makeMarkdown` 不是。

## 应用型自测

1. `new showdown.Converter().makeHtml('| a | b |\n| --- | --- |\n| 1 | 2 |')` 默认会生成 `<table>` 吗？
2. 源文里的 `<script>alert(1)</script>` 会被转义成文本吗？
3. 在没有 `window.document` 的 Node 里调用 `makeMarkdown('<p>x</p>')` 会怎样？

检查点：

1. 不会。`tables` 默认 false，`tables()` 直接返回原文。
2. 不会。`script` 属于 `hashHTMLBlocks` 名单，整块还原。
3. 抛 `HTMLParser is undefined`，除非传入 JSDOM 一类对象。

## 延伸阅读

- 文档与 demo：[showdownjs.com](http://showdownjs.com/) / [demo.showdownjs.com](http://demo.showdownjs.com/)
- 固定源码：[showdownjs/showdown](https://github.com/showdownjs/showdown) —— 本文绑定提交 `9958ba5cfaf01c93ea9e1a48650fb3074eff98ce`
- [[snarkdown]] —— 单函数、单正则的对照路线
- [[markdown-it]] —— 默认更保守的 HTML / 链接过滤
- [[marked]] —— 默认 GFM、无 `html: false` 开关的对照

## 关联

- [[snarkdown]] —— 同一“字符串进、HTML 出”，但没有 flavor / Converter
- [[marked]] —— 默认打开 GFM 的轻量对照
- [[markdown-it]] —— Ruler + 默认 `html: false`
- [[micromark]] —— 状态机，不走大正则替换
- [[unified]] —— AST + plugin，而不是 subParser 字符串管线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
