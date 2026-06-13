---
title: marked — 用一堆正则把 markdown 变成 HTML 的轻量解析器
来源: 'https://github.com/markedjs/marked + https://marked.js.org 官方文档'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

marked 是一个 **JavaScript 写的 markdown 解析器**：你给它一段 markdown 文本，它给你一段 HTML。日常类比：像一台**老式翻译机**——里面装了一本"短语手册"（正则表达式），看到 `# Hello` 就翻成 `<h1>Hello</h1>`，看到 `**粗**` 就翻成 `<strong>粗</strong>`。

它是 Christopher Jeffrey 2011 年开始写的，是 Node.js 生态**最早能被认真用的 markdown 库**之一。核心特点：

- **小**：minified 30 KB / gzipped 10 KB，无依赖
- **快**：regex 一扫到底，没有 AST 中间层
- **稳**：renderer 接口 13 年没变，老代码升级不会坏

```js
import { marked } from 'marked'
const html = marked.parse('# Hello\n\nA [link](https://x.com).')
// → '<h1>Hello</h1>\n<p>A <a href="https://x.com">link</a>.</p>'
```

## 为什么重要

不理解 marked，下面这些事就讲不清楚：

- 为什么 Discord、Hexo、Ghost 这些项目早期都选它——上手 30 分钟，源码 2 小时读完
- 为什么 GitHub 后来从 marked 切到 cmark-gfm——"接口稳"敌不过"跨语言 spec 锚点"
- 为什么 markdown-it / micromark / unified 都比 marked 复杂得多——它们想解决 marked 解决不了的问题
- 为什么"用 regex 解析语言"在编译教材里被骂，却在工具库里活了 14 年

## 核心要点

marked 的工作流可以拆成 **三步**：

1. **Lexer 扫两遍**：第一遍看"这一段是 heading 还是 paragraph 还是 list"（block pass），第二遍看"段里哪些字是粗体、哪些是链接"（inline pass）。类比：先把书切成章节，再去每章里标重点。

2. **Tokenizer 是 regex 工厂**：每条 markdown 文法（heading / fences / list / table）对应一个方法，里面是一条正则 + 一段后处理 JS。**顺序就是优先级**——space 在 code 前，paragraph 永远倒数第二兜底。

3. **Renderer 拼字符串**：Parser 遍历 token 数组，对每个 token 调 `renderer.heading()` / `renderer.code()` 之类的函数，返回 HTML 字符串拼起来。**全程没 DOM、没虚拟树、没中间结构**——这是它快的根本原因。

扩展靠 `marked.use({ renderer, extensions, hooks })` 一个入口三件套：覆盖 renderer 改输出、加 extensions 加新语法、用 hooks 在前后插入处理。

## 实践案例

### 案例 1：一行变 HTML

```js
import { marked } from 'marked'
console.log(marked.parse('# Hi\n\n**bold**'))
// '<h1>Hi</h1>\n<p><strong>bold</strong></p>'
```

如果想看中间 token 数组，用 Lexer：

```js
import { Lexer } from 'marked'
console.log(new Lexer().lex('# Hi'))
// [{ type: 'heading', depth: 1, text: 'Hi', tokens: [...] }]
```

token 数组是调 marked 时**最好用的调试入口**——看一眼就知道你写的 markdown 被理解成了什么。

### 案例 2：给所有外链加 target="_blank"

最常见的扩展：覆盖 `renderer.link`：

```js
marked.use({
  renderer: {
    link(href, title, text) {
      const ext = /^https?:\/\//.test(href)
      const attrs = ext ? ' target="_blank" rel="noopener"' : ''
      return `<a href="${href}"${attrs}>${text}</a>`
    },
  },
})
```

`marked.use()` 是叠加的——多次调用会把新 renderer 合并进去，但**同一个 key 后注册的会覆盖前面的**（first-match-wins）。

### 案例 3：自定义 `:::warning` 块

`extensions` 数组能添加全新语法：

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

`raw` 字段告诉 Lexer "我吃掉了多长一段 src"，循环就靠它推进。漏写 `raw` 会导致**死循环**，marked 会抛 `Infinite loop on byte: ...` 自爆。

## 踩过的坑

1. **CommonMark 兼容性约 80%**：嵌套引用、紧贴的 fence、复杂 list 这类边界 case，marked 输出和 spec 不一致。原因是 regex 写不出某些 spec 要求的回溯条件。要严格 CommonMark 选 markdown-it。

2. **GFM 默认开启 → 静默偏差**：表格、删除线、任务列表、autolink 这些 GFM 扩展默认就有。输出和"标准 CommonMark"不一致但用户不一定知道，迁移到别的渲染器会突然失配。

3. **first-match-wins 让 plugin 难协作**：两个 plugin 都覆盖 `renderer.heading`，后注册的赢，前面那个直接消失。所以社区写完一个 plugin 就停了，没人去写"和别的 plugin 串起来用"的组合。

4. **token 不带 position 信息**：marked token 没有 `{ start, end, line, column }`，所以做"markdown 错误定位 / 编辑器高亮错误"很难。unified 的 mdast 节点都带 position。

## 适用 vs 不适用场景

**适用**：

- 个人博客 / Discord bot / 简单 README 渲染——上手最快
- bundle 体积敏感的浏览器端渲染（30 KB vs unified 100 KB+）
- 只要 HTML 输出、不需要 AST 操作的场景
- 想快速读源码学 markdown 解析器内部实现

**不适用**：

- 需要严格 CommonMark spec 兼容 → 选 markdown-it 或 micromark
- 需要 700+ plugin 生态 / 复杂 markdown 转换 / MDX → 选 unified
- 需要 source map 做错误定位、IDE 高亮 → 选带 position 的 mdast 路线
- build-time 大批量渲染（10w+ 文档）→ 选 Rust 写的 pulldown-cmark / comrak

## 历史小故事（可跳过）

- **2011 年**：Christopher Jeffrey（@chjj）个人项目起步，单文件 500 行，因为当时 Node 没靠谱的 markdown 解析器
- **2014 年前后**：被 GitHub 短期用作 README 渲染入口之一，后来切到 cmark-gfm（C 写、跨语言绑定容易）
- **2018 年**：chjj 淡出，markedjs 组织接手，加 GFM 扩展，第一次系统跑 CommonMark test suite
- **2020-2022 年**：v3 / v4 完善异步 + 扩展系统，walkTokens / async / extensions API 稳定
- **2023 年**：v13 完全 TypeScript 重写，token 类型用 union types 导出
- **当前**：v15.x，月下载约 40M，主消费方变成 discord.js / Ghost / 各种博客静态站

## 学到什么

1. **接口稳定 > 功能完整**：marked 的 renderer 接口 13 年不变，让 13 年前的 plugin 今天大部分还能跑。这种向后兼容比性能优化重要 10 倍，但是个隐性资产，新人接手项目容易忽视。
2. **regex-based 是"快速 80% 方案"**：一周写出可用版本，但剩下 20% 的 spec 兼容会耗 80% 的精力，最终可能永远做不到 100%。这是工具库选型的关键 trade-off。
3. **first-match-wins vs plugin chain**：扩展模型决定生态天花板。简单的赢在上手，链式的赢在规模化。设计自己的工具库 plugin 系统时要明确选哪条。
4. **两遍扫描是 markdown 这种"语义分两层"语言的合理选择**——先识别段落级，再识别行内级。复杂度可控，但天花板就锁死在两层了。

## 延伸阅读

- 官方文档：[marked.js.org](https://marked.js.org/)（含 demo / API / 扩展指南）
- 主仓库：[github.com/markedjs/marked](https://github.com/markedjs/marked)（src/Lexer.ts / Tokenizer.ts / Parser.ts 加起来约 2000 行，2 小时读完）
- CommonMark spec：[spec.commonmark.org](https://spec.commonmark.org/)（看 marked 哪些 case 不通过）
- [[markdown-it]] —— rule chain + 严格 spec 路线，marked 的工程化升级版
- [[micromark]] —— state-machine tokenizer，CommonMark 100% 但代码可读性极低
- [[remark]] [[rehype]] —— unified 生态的 markdown / HTML 处理器

## 关联

- [[markdown-it]] —— 同样 regex-based，但把 rule 显式化、CommonMark spec 严格通过
- [[micromark]] —— unified 用的底层 tokenizer，零 regex 状态机扫描
- [[remark]] —— unified 生态里的 markdown 解析器，输出 mdast AST
- [[rehype]] —— unified 生态里的 HTML 处理器，配 remark 做 markdown → HTML
- [[hexo]] —— 静态博客生成器，长期消费 marked 做内容渲染
- [[ghost]] —— Node.js 博客平台，早期用 marked
- [[starlight]] —— Astro 文档主题，用 unified 系而非 marked

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[micromark]] —— micromark — markdown 解析器里那台一个字一个字读的状态机
- [[shiki]] —— shiki — 把 VS Code 那套染色搬到网页上
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线

