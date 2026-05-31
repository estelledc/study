---
title: markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
来源: 'https://github.com/markdown-it/markdown-it'
日期: 2026-05-30
分类: projects / 前端工具链
难度: 中级
---

## 是什么

markdown-it 是一个 **JavaScript 库**，它接收一段 Markdown 文本（你写博客那种带 `#` 和 `**` 的纯文本），输出一段 HTML 字符串。日常类比：像一台**专门的翻译机**——你把"中文"塞进去，"英文"从另一头吐出来，中间它会在自己肚子里先把句子拆成词条、再按顺序拼回去。

```js
import MarkdownIt from 'markdown-it'
const md = new MarkdownIt()
md.render('# Hello\n\n这是 **粗体**')
// → '<h1>Hello</h1>\n<p>这是 <strong>粗体</strong></p>\n'
```

它的特点：100% 遵守 CommonMark 规范、可选打开 GitHub Flavored Markdown 扩展（表格、删除线）、解析速度快（单线程每秒大约 5 万到 10 万篇短文）、规则可拔插（你能写一个小 plugin 就改它的行为）。VitePress、VuePress、Hexo、docsify 这些写文档站的工具，背后跑的就是它。

## 为什么重要

不理解它，下面这些事就没法解释：

- 为什么 VitePress / VuePress / Hexo 渲染速度差异很小——它们后端都是 markdown-it
- 为什么社区有 200+ 个 `markdown-it-xxx` plugin 而 marked 几乎没有——是架构差异
- 为什么文档站里 `# 标题` 旁边能自动出锚点 `#`——markdown-it-anchor plugin 替换了一条 renderer 规则
- 为什么 Markdown 里的 `<script>` 默认不会被执行——markdown-it 默认开了 escape，想让它直通必须显式 `html: true`

## 核心要点

把 Markdown 翻译成 HTML，markdown-it 做了**三件事**：

1. **两阶段**：先 parse（文本 → token 数组），再 render（token 数组 → HTML 字符串）。两阶段隔离，plugin 可以单独换一边。类比：先把整篇中文拆成一张张词卡，再按词卡拼英文。

2. **Token 流而非 AST 树**：嵌套结构用 `heading_open` / `inline` / `heading_close` 这种**配对的扁平数组**表示，不像 mdast 那种递归树。遍历就是 for 循环，没有 visitor 黑魔法。

3. **Ruler 调度**：每个解析阶段里有一组**有序的命名规则**。`md.use(plugin)` 实质就是在某条规则前后插入新规则，或替换 `renderer.rules.foo` 这条函数——几行代码就能改解析行为。

## 实践案例

### 案例 1：最小渲染一段 Markdown

```js
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,        // 不允许源里的 HTML 标签直通（防 XSS）
  linkify: true,      // 自动把 https://x.com 包成 <a>
  breaks: false       // 单换行不变 <br>，按 CommonMark 规范
})

const html = md.render('# Hello\n\n看 https://example.com')
// → '<h1>Hello</h1>\n<p>看 <a href="https://example.com">https://example.com</a></p>\n'
```

`html: false` 是默认值，重要的安全开关。如果你确定 Markdown 来源可信（比如自己写的博客），开 `html: true` 可以让源里写的 `<div>` 直通；如果是用户提交内容，**必须保持 false**，否则 XSS。

### 案例 2：写 plugin 给所有外链加 target=\_blank

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

这就是一个完整 plugin。原理：替换 `link_open` 这条 renderer 规则，先看 href，再决定加不加属性，最后走默认渲染。社区那 200+ 个 plugin 多数都是这个套路。

### 案例 3：拿 token 流抽 TOC

```js
const tokens = md.parse(markdownSrc, {})
const toc = []
for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].type === 'heading_open') {
    const level = parseInt(tokens[i].tag.slice(1))     // h1 → 1
    const text = tokens[i + 1].content                  // 下一个 inline token
    toc.push({ level, text })
  }
}
```

跳过 render，只用 parse 阶段的 token 流——这就是为什么 markdown-it 有用：你能在中间插一手，干静态分析的事。

## 踩过的坑

1. **`html: true` 是 XSS 直通车**：用户能塞 `<script>alert(1)</script>` 直接到 HTML。给用户内容渲染**永远保持 false**，再用 sanitize-html 做二次清洗。

2. **Token 配对忘了改一边**：`heading_open` 和 `heading_close` 配对，你只改 open 不改 close，HTML 结构就坏。改 token 数组前先想清楚自己改的是开标签、闭标签还是中间内容。

3. **`ruler.before` 插错位置**：你想在 `linkify` 前面跑自定义规则，但写成了 `ruler.after('linkify', ...)`，结果你的规则看不到 linkify 处理过的状态。规则顺序敏感，写之前先 `md.core.ruler.__rules__.map(r => r.name)` 看一遍。

4. **`env` 对象是共享可变状态**：多个 plugin 都往 `env` 上塞字段，命名冲突就互相覆盖。约定：自己 plugin 用 `env.myPlugin = {}` 命名空间。

## 适用 vs 不适用场景

**适用**：
- 文档站、博客、SSG（VitePress / VuePress / Hexo / docsify 已是事实标准）
- 需要写 plugin 扩展 Markdown 语法（自定义容器、数学公式、emoji 短代码）
- 服务端同步渲染 Markdown（Node API 返回 HTML）
- 笔记软件、富文本编辑器底层

**不适用**：
- 浏览器端极小 bundle 优先 → 用 marked（约 50KB vs markdown-it 约 80KB）
- 想要严格的 AST 树 + 异步 plugin pipeline → 用 unified / remark
- Markdown + JSX 混写（mdx）→ 用 mdx 体系

## 历史小故事（可跳过）

- **2014 年**：Puzrin 与 Kocharin 嫌当时的 remarkable 解析器架构不够清晰，把它整理重写发布了 markdown-it 1.0。
- **2015 年**：CommonMark 规范定稿，markdown-it 第一时间做到 100% 兼容，成为 JS 生态里 CommonMark 的事实参考实现。
- **2018-2020 年**：VuePress / VitePress / Hexo 陆续把 markdown-it 选为底层，社区 plugin 数突破 200。
- **2024 年**：稳定在 v14.x，CommonMark 0.31 兼容，npm 周下载量约 2500 万。

## 学到什么

1. **两阶段隔离**让扩展点变多——只改 parse 阶段、只改 render 阶段、改两边都行。这是 markdown-it 比 marked 更"可插拔"的根因。
2. **Token 流（扁平数组）vs AST 树（递归 node）** 是真实的设计权衡：前者遍历快、内存省；后者表达力强、操作直观。各有适用场景。
3. **Ruler 模式** 把"一组有序规则 + before/after/replace 操作"抽出来，是写可扩展系统的通用招式。
4. **默认安全比默认方便重要**：`html: false` 默认关掉，再让用户显式打开——XSS 防御从默认值开始。

## 延伸阅读

- 官方文档：[markdown-it.github.io](https://markdown-it.github.io/)（带 in-browser playground，能直接看 token 流）
- API 参考：[markdown-it API](https://markdown-it.github.io/markdown-it/)（Token / Ruler / Renderer 三大类）
- CommonMark 规范：[spec.commonmark.org](https://spec.commonmark.org/)（markdown-it 兼容的目标）
- Plugin 列表：[markdown-it/awesome](https://www.npmjs.com/search?q=keywords:markdown-it-plugin)
- [[marked]] —— 同生态对手，更轻量
- [[unified]] —— Markdown 处理的另一派（AST + 异步）

## 关联

- [[marked]] —— JS Markdown 解析器另一派，docsify 用它；体积更小但扩展点少
- [[unified]] —— remark / rehype 的统一框架，AST + plugin pipeline，与 markdown-it 走两条路
- [[vitepress]] —— Vue 文档站点框架，markdown-it 直接做底层
- [[astro]] —— SSG 框架，可选 markdown-it 或 remark/unified 作为 Markdown 引擎
- [[starlight]] —— Astro 文档主题，本笔记网站用的就是它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[marked]] —— marked — 用一堆正则把 markdown 变成 HTML 的轻量解析器
- [[micromark]] —— micromark — markdown 解析器里那台一个字一个字读的状态机
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[shiki]] —— shiki — 把 VS Code 那套染色搬到网页上
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器

