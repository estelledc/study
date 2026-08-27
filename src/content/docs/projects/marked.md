---
title: marked — 用一堆正则把 markdown 变成 HTML 的轻量解析器
来源: 'https://github.com/markedjs/marked'
日期: 2026-05-30
分类: projects
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/markedjs/marked
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 53cb13f13fc13d433269248c5caa255ffa1361ee
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 18.0.11
---

## 是什么

marked 是一个零生产依赖的 JavaScript markdown 解析器：输入一段 markdown，输出一段 HTML 字符串。日常类比：像一台只带「短语手册」的翻译机——Lexer 用正则认出这一段是标题还是列表，Renderer 再把 token 拼成标签。中间有 token 数组，但没有 DOM，也没有可随意改写的 AST 树。

```js
import { marked } from 'marked'
const html = marked.parse('# Hello\n\nA [link](https://example.com).')
```

默认实例也可以直接当函数调用。要改 renderer / tokenizer / hooks，文档要求建独立 `Marked` 实例再 `use()`，不要每次 `parse` 都塞一整套扩展。

## 为什么重要

不读固定 18.0.11 源码，下面这些合同很容易被旧教程带偏：

- 为什么「regex 一扫到底、没有中间结构」并不准确——先有 block token，再有 inline token
- 为什么覆盖 `renderer.link` 不再是 `(href, title, text)` 三参数
- 为什么后注册的 renderer 不会把先注册的直接抹掉
- 为什么用户提交的 markdown 默认就能带上原始 HTML

## 核心要点

固定版本的主链可以拆成五步：

1. **默认选项**：`async: false`、`breaks: false`、`gfm: true`、`pedantic: false`、`silent: false`。没有 `html: false`。

2. **两遍 Lexer**：`lex()` 先 `blockTokens`，再把 `inlineQueue` 里的段落送进 `inlineTokens`。block 顺序是 space → indented code → fences → heading → hr → blockquote → list → html → def → table → lheading → paragraph。

3. **GFM 是默认规则集**：`gfm: true` 换上 table、task checkbox、删除线 `del` 和 GFM url tokenizer。`Renderer.html` 原样回写源文本。

4. **Renderer 吃 token 对象**：`link({ href, title, tokens })` 必须用 `this.parser.parseInline(tokens)` 拼可见文字。`cleanUrl()` 只做 `encodeURI`，失败才退化成纯文本。

5. **`use()` 是包装，不是覆盖**：后注册的 renderer / tokenizer / hook 先跑；返回 `false` 才回退到上一层。addon tokenizer 被 `unshift`，比内建规则更早匹配。`raw` 不前进会抛 `Infinite loop on byte: ...`。

## 实践示例

### 案例 1：看 Lexer 吐出的 token

```js
import { Lexer } from 'marked'
console.log(new Lexer().lex('# Hi'))
// [{ type: 'heading', depth: 1, text: 'Hi', tokens: [...] }]
```

`tokens.links` 挂在数组对象上，用来收 reference definition。这是调 marked 时最稳的调试入口。

### 案例 2：给外链加 target，但保留回退

```js
import { marked } from 'marked'

marked.use({
  renderer: {
    link({ href, title, tokens }) {
      if (!/^https?:\/\//.test(href)) return false
      const text = this.parser.parseInline(tokens)
      const t = title ? ` title="${title}"` : ''
      return `<a href="${href}"${t} target="_blank" rel="noopener">${text}</a>`
    },
  },
})
```

返回 `false` 会落到内建 `Renderer.link`，后者仍会走 `cleanUrl`。不要再假设旧版三参数签名。

### 案例 3：自定义 `:::warning` 块

```js
marked.use({
  extensions: [{
    name: 'callout',
    level: 'block',
    start(src) { return src.match(/:::/)?.index },
    tokenizer(src) {
      const m = /^:::(\w+)\n([\s\S]+?)\n:::/.exec(src)
      if (m) return { type: 'callout', raw: m[0], kind: m[1], text: m[2] }
    },
    renderer(token) {
      return `<div class="callout-${token.kind}">${token.text}</div>`
    },
  }],
})
```

`start` 用来在 paragraph 吞源之前裁切；`raw` 必须等于真正吃掉的长度。

## 踩过的坑

1. **把 marked 当成默认消毒器**：原始 HTML 会被 lex 成 `html` token 并直通。`cleanUrl` 也不拦截 `javascript:`。
2. **以为后 `use()` 的 renderer 会消灭先注册的**：v18 是包装链，只有返回 `false` 才回退。
3. **把 GFM 当成需要显式打开的扩展**：默认就有表格、删除线和任务列表；迁到 CommonMark 引擎会突然失配。
4. **token 没有 position**：没有 `{ start, end, line, column }`，做编辑器诊断应走带 position 的 mdast。

## 适用 vs 不适用场景

**适用**：

- 可信来源的博客 / README / 机器人回显，只要 HTML 字符串
- bundle 对生产依赖个数敏感的浏览器端渲染
- 想在一个下午读完 Lexer / Tokenizer / Renderer 的实现

**不适用**：

- 用户提交内容且没有外部 sanitizer → 先看 [[markdown-it]] 的默认 `html: false` + `validateLink`
- 需要严格 CommonMark 或插件生态 → [[markdown-it]] 或 [[micromark]]
- 需要 AST 变换 / MDX / source map → [[unified]] / [[remark]]
- 还没量过体积，却把「大约 30 KB」写成当前事实

## 固定版本边界

- 本文绑定 `markedjs/marked@53cb13f13fc13d433269248c5caa255ffa1361ee`，tag / npm latest / `gitHead` 均为 `18.0.11`。
- 无生产 `dependencies`；运行时要求 Node >= 20。
- 默认 `gfm: true`；HTML 块始终进入 tokenizer，没有 `html` 选项。
- 本文未安装依赖、运行 spec suite 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **「快」来自扁平 token，不是没有中间层**——Lexer 和 Renderer 之间仍有可调试的数组。
2. **扩展合并语义要读 `use()`**——包装 + `false` 回退，和「后写覆盖」不是一回事。
3. **默认 GFM 是静默合同**——迁移渲染器时先对表格和删除线做差分。
4. **安全边界不在 marked 里**——HTML 直通和协议过滤都要外置。

## 应用型自测

1. 默认 `marked.parse('<script>alert(1)</script>')` 会不会把标签转义成文本？
2. 两个 plugin 都覆盖 `renderer.link`，后注册的返回 `false`。会用哪一个实现？
3. `gfm` 保持默认时，`~~done~~` 会不会变成 `<del>`？

检查点：

1. 不会。`Tokenizer.html` + `Renderer.html` 原样输出。
2. 回退到先注册的包装层，最终仍可能落到内建 `Renderer.link`。
3. 会。默认 `gfm: true` 启用 `del` tokenizer。

## 延伸阅读

- 官方文档：[marked.js.org](https://marked.js.org/)
- 固定源码：[markedjs/marked](https://github.com/markedjs/marked) —— 本文绑定提交 `53cb13f13fc13d433269248c5caa255ffa1361ee`
- CommonMark spec：[spec.commonmark.org](https://spec.commonmark.org/)
- [[markdown-it]] —— rule chain + 默认协议过滤
- [[micromark]] —— 状态机 tokenizer
- [[remark]] [[rehype]] —— unified 的 markdown / HTML 处理器

## 关联

- [[markdown-it]] —— 同样面向 HTML 输出，但 Ruler 可开关、默认更保守
- [[micromark]] —— unified 用的底层 tokenizer
- [[remark]] —— 输出 mdast
- [[rehype]] —— HTML 树处理
- [[hexo]] —— 长期消费 marked
- [[ghost]] —— 早期用 marked
- [[starlight]] —— 本站走 unified 系

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[marktext]] —— MarkText — 实时预览 Markdown 编辑器
- [[micromark]] —— micromark — markdown 解析器里那台一个字一个字读的状态机
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线
