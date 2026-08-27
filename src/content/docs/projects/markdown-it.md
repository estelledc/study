---
title: markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
来源: 'https://github.com/markdown-it/markdown-it'
日期: 2026-05-30
分类: projects / 前端工具链
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/markdown-it/markdown-it
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 157b33bc13649aebecf9ab9b3b8c85ae645abb5a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 15.0.0
---

## 是什么

markdown-it 是一个可插拔的 JavaScript Markdown 解析器：输入 Markdown 文本，输出 HTML 字符串。日常类比：像一条有名字的传送带——core / block / inline 三条 Ruler 按顺序处理，最后 Renderer 把扁平 token 流拼成标签。

```js
import MarkdownIt from 'markdown-it'
const md = new MarkdownIt()
md.render('# Hello\n\n这是 **粗体**')
```

根导出仍包一层无 `new` 的 callable，方便旧代码；v15 文档写明新代码应写成 `new MarkdownIt()`，兼容包装未来可能删除。

## 为什么重要

不读固定 15.0.0 源码，下面这些合同很容易被旧教程带偏：

- 为什么「默认 100% CommonMark、GFM 要另开」并不准确
- 为什么 `new MarkdownIt('commonmark')` 反而打开了 `html: true`
- 为什么 v15 不再把 `example.com` 自动变成链接
- 为什么 VitePress 能用几行 plugin 改锚点和外链，而不换引擎

## 核心要点

固定版本的主链可以拆成五步：

1. **三条链**：`parse()` 建 `StateCore`，core 顺序是 normalize → block → strip_references → inline → linkify → replacements → smartquotes → text_join。`render()` 再把 token 交给 Renderer。

2. **默认 preset 不是 CommonMark-only**：`new MarkdownIt()` 设 `html: false`、`linkify: false`、`breaks: false`、`typographer: false`、`maxNesting: 100`，但 default 不 `enableOnly`，因此 table 与 strikethrough 规则保持开启。`linkify` 规则在选项为假时直接返回。

3. **`commonmark` / `zero` 才裁规则**：`commonmark` 关掉 table / strikethrough / linkify / replacements / smartquotes，同时把 `html` 设为 `true`、`xhtmlOut` 为 `true`、`maxNesting` 为 `20`。`zero` 几乎只留 paragraph + text。

4. **默认链接过滤**：`validateLink` 拒绝 `javascript:` / `vbscript:` / `file:` / 多数 `data:`，只放行 gif/png/jpeg/webp 的 data image。这和 [[marked]] 只做 `encodeURI` 不同。

5. **v15 包合同**：类型随包发布；`markdown-it/lib/...` 不再导出，`Token` / `Ruler` / `Renderer` 挂在类静态属性上；`linkify-it` 默认关闭 fuzzy link。生产依赖是 `argparse`、`entities`、`linkify-it`、`mdurl`、`punycode.js`、`uc.micro`。

## 实践示例

### 案例 1：默认实例与显式 CommonMark

```js
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
})
md.linkify.set({ fuzzyLink: true }) // v15 要显式打开 example.com

const strict = new MarkdownIt('commonmark')
// html: true, 无 table / strikethrough
```

用户内容应保持 `html: false`。要严格 CommonMark，用 preset 名，不要只关几个选项。

### 案例 2：改 `link_open` 而不是手写整段 `<a>`

```js
const defaultRender = md.renderer.rules.link_open
  || ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts))

md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
  const href = tokens[idx].attrGet('href')
  if (href && href.startsWith('http')) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener')
  }
  return defaultRender(tokens, idx, opts, env, self)
}
```

社区 plugin 多半是「保存默认 → 改 token 属性 → 回默认」。`md.use(plugin, ...params)` 只是 `plugin(md, ...params)`。

### 案例 3：只 parse、抽 TOC

```js
const tokens = md.parse(src, {})
const toc = []
for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].type === 'heading_open') {
    const level = Number.parseInt(tokens[i].tag.slice(1), 10)
    const inline = tokens[i + 1]
    toc.push({ level, text: inline?.content ?? '' })
  }
}
```

顶层是配对的 block token；真正的行内细节在紧随其后的 `inline` token 的 `children` 里。`env` 是可变共享沙箱，plugin 应写到自己的命名空间。

## 踩过的坑

1. **把 default 当成 CommonMark 参考实现**：表格和 `~~del~~` 默认就会出。要规范锚点用 `'commonmark'`，并接受它打开 HTML。
2. **`html: true` 是 XSS 直通车**：安全文档的策略是默认关 HTML，或开 HTML 后接外部 sanitizer。
3. **v15 仍写 `md.utils.assign` 或 `import 'markdown-it/lib/token.mjs'`**：三个 legacy helper 已删，内部路径不再导出。
4. **plugin 用用户输入当元素 `id`/`name`**：安全文档点名 DOM clobbering，锚点类 plugin 必须加前缀。

## 适用 vs 不适用场景

**适用**：

- 文档站默认栈（VitePress / VuePress）；需要 named rule 插入或替换
- 要在 parse 与 render 之间抽 TOC、改外链、加容器
- 用户内容渲染，且愿意保持 `html: false` 并理解 `validateLink` 的范围

**不适用**：

- 生产依赖个数必须为零 → [[marked]]
- 要 AST + 异步 pipeline / MDX → [[unified]]
- 还没跑过 spec 或 sanitizer，却把「默认 100% CommonMark 且安全」写成无条件事实

## 固定版本边界

- 本文绑定 `markdown-it/markdown-it@157b33bc13649aebecf9ab9b3b8c85ae645abb5a`，tag / npm latest / `gitHead` 均为 `15.0.0`。
- 公共 parser API 与 v14 兼容；v15 变更集中在 fuzzy link、类型打包和内部导出。
- 默认 preset 含 table / strikethrough；`commonmark` preset 含 `html: true`。
- 本文未安装依赖、运行 cmspec 或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **preset 比单个选项更能说明合同**——default 和 commonmark 同时改规则表和 `html`。
2. **扁平 token + 命名 Ruler** 让扩展落在「某一条规则前后」，而不是换引擎。
3. **默认安全是策略，不是证明**——`validateLink` 和 `html: false` 仍覆盖不了任意 plugin。
4. **内部路径不是公共 API**——v15 把 Token/Ruler 收到类上，就是在收这条口子。

## 应用型自测

1. `new MarkdownIt().render('| a | b |\n| --- | --- |\n| 1 | 2 |')` 会不会出 `<table>`？
2. `new MarkdownIt('commonmark').render('<em>x</em>')` 会不会把标签转义掉？
3. `new MarkdownIt({ linkify: true }).render('see example.com')` 在 v15 会不会自动加 `<a>`？

检查点：

1. 会。default 未裁掉 table 规则。
2. 不会转义。commonmark preset 的 `html` 为 `true`。
3. 默认不会。fuzzy link 要 `md.linkify.set({ fuzzyLink: true })`。

## 延伸阅读

- 官方文档：[markdown-it.github.io](https://markdown-it.github.io/)
- 固定源码：[markdown-it/markdown-it](https://github.com/markdown-it/markdown-it) —— 本文绑定提交 `157b33bc13649aebecf9ab9b3b8c85ae645abb5a`
- v15 迁移：[docs/migration/migration_v15.md](https://github.com/markdown-it/markdown-it/blob/15.0.0/docs/migration/migration_v15.md)
- CommonMark spec：[spec.commonmark.org](https://spec.commonmark.org/)
- [[marked]] —— 更少依赖、默认 GFM、无 HTML 开关
- [[unified]] —— AST + plugin pipeline

## 关联

- [[marked]] —— JS Markdown 另一派，默认更「放开」
- [[unified]] —— remark / rehype 路线
- [[vitepress]] —— 默认底层之一
- [[astro]] —— 可选 markdown-it 或 remark
- [[starlight]] —— 本笔记站点用 unified 系

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[bookstack]] —— BookStack — 文档型 Wiki
- [[foam]] —— Foam — 把 VS Code 变成 Markdown 双链知识库
- [[hedgedoc]] —— HedgeDoc — 协作 Markdown 编辑
- [[logseq]] —— Logseq — 块结构离线知识库
- [[marked]] —— marked — 用一堆正则把 markdown 变成 HTML 的轻量解析器
- [[marktext]] —— MarkText — 实时预览 Markdown 编辑器
- [[micromark]] —— micromark — markdown 解析器里那台一个字一个字读的状态机
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[shiki]] —— shiki — 把 VS Code 那套染色搬到网页上
- [[silverbullet]] —— SilverBullet — 自托管笔记 web 应用
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[zettlr]] —— Zettlr — 学者向 Markdown 编辑器
