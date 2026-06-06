---
title: unified — 把文档处理拆成 AST + plugin 流水线
来源: 'https://github.com/unifiedjs/unified'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

unified 是一个**通用文档处理框架**：把任意文本（Markdown / HTML / 自然语言）先解析成树结构（AST），再用一串小函数（plugin）轮流改这棵树，最后输出新文本。日常类比：像一条**自助餐流水线**——食材（原文）从一头进，每个工位（plugin）只负责把"加酱""撒葱花"这一步做完，最后从另一头出成品。

你写：

```js
unified()
  .use(remarkParse)        // Markdown 字符串 → 树
  .use(remarkRehype)       // 切到 HTML 树
  .use(rehypeStringify)    // 树 → HTML 字符串
  .process('# Hello *world*')
// → '<h1>Hello <em>world</em></h1>'
```

三步之间没有"端到端解析器"在偷偷做事，每一步都是**纯函数**。这种"AST + plugin"思路撑起了 Astro / MDX / Gatsby / Next.js / Storybook 的 markdown 管线，月下载 100M+。

## 为什么重要

不理解 unified，下面这些事都没法解释：

- 为什么 Astro / MDX 能在你写 `.md` 时同时跑 frontmatter / 语法高亮 / 自动锚点 / sanitize 五件事，还彼此不打架
- 为什么写一个"给所有外部链接加 `target="_blank"`"的功能只要 10 行，而 marked / markdown-it 要重写整个 renderer
- 为什么 unified 自己的核心代码只有 ~600 行，却能撑起 700+ 的 plugin 社区
- 为什么有时一篇 markdown 渲染出问题，调试要跨 6-7 层 trough 调用栈才能定位

## 核心要点

unified 把文档处理拆成 **三段**：

1. **parser**：把字符串变成 AST（树）。类比：把一段中文翻译成可以拆分的语法结构图。`remark-parse` 是 Markdown 的 parser，`rehype-parse` 是 HTML 的。

2. **transformer**：纯函数 `(tree, file) => tree`，一棵树进一棵树出。类比：流水线工位，每个 plugin 只动自己关心的节点。多个 transformer 串成一条链。

3. **compiler**：把 AST 变回字符串。`rehype-stringify` 把 HTML 树序列化成 HTML 文本。

三段之间用**规范化 AST** 串起来：mdast（Markdown 语义树）/ hast（HTML DOM 树）/ nlcst（自然语言树），都是 unist 的子集。规范统一后，任何人写的 plugin 只要遵循"输入 mdast → 输出 mdast"，就能和别人组合。这就是 Unix pipe 哲学搬到 AST 层。

## 实践案例

### 案例 1：3 行配置跑通最小管线

```js
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

const file = await unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeStringify)
  .process('# Hello *world*')

console.log(String(file)) // '<h1>Hello <em>world</em></h1>'
```

`.use()` 链式注册 plugin，`.process()` 触发执行。`file` 是 vfile 对象，承载输出文本 + lint 消息 + 路径元信息。

### 案例 2：完整管线（GFM + frontmatter + 高亮 + 锚点 + sanitize）

```js
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)                              // 表格 / 任务列表 / 删除线
  .use(remarkFrontmatter, ['yaml'])            // YAML frontmatter 不当 markdown 渲
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)                              // 重新解析 markdown 内嵌的 HTML
  .use(rehypeSlug)                             // h1-h6 加 id
  .use(rehypeAutolinkHeadings)                 // heading 包 anchor
  .use(rehypeHighlight)                        // 代码块高亮
  .use(rehypeSanitize)                         // XSS 防护（必须最后）
  .use(rehypeStringify)
```

注意 plugin 顺序：`rehype-slug` 必须在 `rehype-autolink-headings` 之前（后者依赖前者写好的 id）；`rehype-sanitize` 必须最后（否则前面注入的属性可能被清掉）。

### 案例 3：自己写一个 plugin（外链加 `target="_blank"`）

```js
import { visit } from 'unist-util-visit'

function rehypeExternalLinks() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'a' && /^https?:\/\//.test(node.properties.href)) {
        node.properties.target = '_blank'
        node.properties.rel = 'noopener'
      }
    })
  }
}

unified().use(remarkParse).use(remarkRehype).use(rehypeExternalLinks).use(rehypeStringify)
```

10 行就完事。不需要继承 / 注册到 renderer，不需要懂 micromark token。这就是"plugin 是纯函数"的好处。

## 踩过的坑

1. **性能弱**：每个 plugin 一次完整树遍历，10 个 plugin 就遍历 10 次。构建上千 markdown 文件时累积秒级延迟，CPU 密集场景慎用。

2. **mdast → hast 是单向有损切换**：mdast 里的 `inlineCode` 切成 hast 的 `<code>` 时丢了"这是 markdown 内联代码"的语义。某些处理只能在 mdast 阶段做，错过 `remark-rehype` 就再也拿不回来。

3. **plugin 顺序敏感**：`remark-gfm` 和 `remark-frontmatter` 谁先 `.use()` 影响最终行为，因为它们都往 `this.data('micromarkExtensions')` 里 push 扩展，顺序决定 micromark 的状态机分支。这种隐式耦合调试时很坑。

4. **plugin 生态长尾不健康**：700+ plugin 里大量是 4-5 年前的死包，依赖旧 unified（v9）但你用 v11，运行时炸 `this.parser is not a function`。建议只用 unifiedjs 官方组织维护的 plugin，社区 plugin 必须 fork 自审。

## 适用 vs 不适用场景

**适用**：
- 静态站点 / 文档站（Astro / Gatsby / Next.js MDX）—— 灵活性需求 > 性能需求
- 自定义 markdown 转换（mermaid 块 / 自定义 directive / 双链 wikilink）
- 需要 lint / source map（vfile.messages 自带）
- 想从 markdown 同时输出 HTML / 纯文本 / RSS 多种格式

**不适用**：
- 浏览器实时渲染上千字符 → 选 markdown-it（快 2-3x）或 wasm 解析器（pulldown-cmark / comrak / @swc/markdown）
- 只需要"markdown → HTML 一锤子买卖"，不要任何转换 → 直接用 micromark 零开销
- 严格性能预算的 CLI 工具 → mdBook / Hugo / Zola 这类 Rust/Go 工具链更合适
- 不想理解 mdast / hast / vfile 三层概念的初学者 → marked 5 行配置即可上手

## 历史小故事（可跳过）

- **2014 年**：Titus Wormer（@wooorm，荷兰开发者）开始写 mdast 规范——一份"Markdown 应该长成什么 AST"的协议。纯文档，没代码。
- **2015 年 4 月**：unified v0.1 从 mdast 仓分裂出来，第一次把 parser / transformer / compiler 三段抽象写成代码。
- **2017-2018**：rehype（HTML）和 retext（自然语言）相继切到 unified 协议下，三个生态共用一套 plugin 接口。
- **2018 年 9 月**：MDX 1.0 把 JSX-in-Markdown 接到 unified pipeline，让 React 组件能直接嵌进 markdown，从此进入"组件化文档"时代。
- **2024 年**：unified v11 主流，Astro / Next.js / VuePress / Storybook 的 markdown 管线全线基于它，月下载 100M+。

## 学到什么

1. **AST + plugin pipeline 是文档处理的优秀抽象**——把"端到端解析器"拆成三段，组合性远胜 renderer 重写
2. **接口规范化能撑起庞大生态**——核心代码 600 行，因为 mdast / hast / vfile 接口规范，社区写出 700+ plugin
3. **lazy freeze + immutable derivation**：`.use()` 链式 + 第一次 process 才冻结，是处理"配置 vs 执行"的经典模式
4. **vfile 这种"贯穿全程载体"在 build 工具链里很有价值**——webpack chunk、vite module、unified vfile 都是同一思想

## 延伸阅读

- 官方文档：[unifiedjs.com](https://unifiedjs.com/)（含 learn / explore 两个互动入口）
- 视频入门：[The unified collective by Titus Wormer](https://www.youtube.com/watch?v=4iN9b-eBYgI)（作者本人 30 分钟讲完核心思想）
- 写第一个 plugin：[unifiedjs.com/learn/guide/create-a-plugin/](https://unifiedjs.com/learn/guide/create-a-plugin/)
- syntax-tree 规范族：[github.com/syntax-tree](https://github.com/syntax-tree)（mdast / hast / unist 全部规范文档）
- [[micromark]] —— unified 底层的 token 化器
- [[markdown-it]] —— 老一代端到端解析器，对照看抽象差距

## 关联

- [[micromark]] —— unified 底层的 CommonMark token 化器，零 regex 状态机
- [[markdown-it]] —— 端到端解析器代表，性能强但 plugin 是 rule registration 不是纯函数
- [[marked]] —— 最老的 markdown 解析器，AST 不暴露，新项目应避免
- [[astro]] —— 静态站框架，markdown / MDX 渲染就是一个 unified processor
- [[starlight]] —— Astro 文档站主题，全靠 unified 管线支撑双链与代码高亮
- [[shiki]] —— 语法高亮引擎，常以 `rehype-shiki` 形式接入 unified
- [[wadler-prettier]] —— 同样是"AST → 输出"思路，但 prettier 偏 layout 而非 transform

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[marked]] —— marked — 用一堆正则把 markdown 变成 HTML 的轻量解析器
- [[micromark]] —— micromark — markdown 解析器里那台一个字一个字读的状态机
- [[shiki]] —— shiki — 把 VS Code 那套染色搬到网页上
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[wadler-prettier]] —— Wadler Prettier — 函数式优雅打印器

