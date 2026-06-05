---
title: shiki — 把 VS Code 那套染色搬到网页上
来源: 'https://github.com/shikijs/shiki'
日期: 2026-05-30
子分类: 前端工具
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

shiki 是一个让网页里的代码块染色的 JavaScript 库，染出来的颜色和你在 VS Code 里看到的**一模一样**。日常类比：像把 VS Code 编辑器的"打扮"打包成贴纸，贴到任何网页代码块上。

它和老牌 Prism / highlight.js 走的是不同路线。Prism 把每个语言的语法规则用 JS 正则手写一遍，结果常和 VS Code 不一致；shiki 直接复用 VS Code 用的同一套语法定义文件（叫 TextMate grammar），所以颜色、字体粗细、斜体等等天然对齐。

最常见的用法只有一行：

```ts
import { codeToHtml } from 'shiki';

const html = await codeToHtml('console.log("hi")', {
  lang: 'javascript',
  theme: 'github-dark',
});
```

输出已经是带颜色的 HTML，直接 `innerHTML` 就行。Astro Starlight、VitePress、Nuxt Content、Slidev 这些文档/幻灯片框架都默认用它。

## 为什么重要

不理解 shiki，下面这些事都没法解释：

- 为什么 VitePress、Astro 文档站的代码块和 VS Code 一模一样，而老博客的代码块总是"差点意思"
- 为什么有的代码高亮库 bundle 才 10 KB，shiki 要 200 KB——它把 VS Code 的整套引擎都搬了过来
- 为什么 shiki 推荐"在编译时染色"而不是"在浏览器染色"——和 SSR / 静态生成的趋势绑死
- 为什么 2024 年它要重写一次（v1.x），生态里还能听到"升级痛苦"的声音

## 核心要点

shiki 干的事可以拆成 **三步**：

1. **加载语法书**：把目标语言的 TextMate grammar JSON 读进来。类比：拿出一本"JavaScript 怎么断词"的字典。这本字典是 VS Code 团队维护的，shiki 直接复用。

2. **切词 + 贴标签**：用一个叫 oniguruma 的正则引擎（VS Code 同款，编译成 WASM 跑在浏览器里）把代码切成一段段 token，每段贴上 scope 标签，比如 `keyword.control` 或 `string.quoted`。

3. **照主题上色**：拿一份 VS Code theme JSON（github-dark、nord、dracula 都行），按 scope 标签查颜色，然后输出 `<span style="color:#xxx">` 包好的 HTML。

三步合起来就是"读字典→断词贴标签→按主题上色"。VS Code 也是这么干的，只不过它在你电脑上跑，shiki 在 build 服务器或浏览器里跑。

## 实践案例

### 案例 1：一行 API 染色

最简单的用法，把字符串变成 HTML：

```ts
import { codeToHtml } from 'shiki';

const code = `function hi() { return 1 }`;
const html = await codeToHtml(code, {
  lang: 'javascript',
  theme: 'github-dark',
});

document.querySelector('#out').innerHTML = html;
```

**逐部分解释**：

- `codeToHtml` 是一站式 API，内部会加载 grammar 和 theme，染色后返回 HTML
- `lang` 告诉它按哪本"字典"切词
- `theme` 决定颜色，`github-dark` 是 shiki 自带的几十个主题之一

### 案例 2：预加载 highlighter 复用实例

每次调 `codeToHtml` 都会重新加载 grammar，文档站有几百个代码块时太慢。这时用 `createHighlighter` 一次加载、多次复用：

```ts
import { createHighlighter } from 'shiki';

const highlighter = await createHighlighter({
  themes: ['nord', 'github-dark'],
  langs: ['javascript', 'typescript', 'rust'],
});

const html = highlighter.codeToHtml(code, { lang: 'ts', theme: 'nord' });
```

SSR 场景下，这个 `highlighter` 只在 build 启动时建一次，后面所有页面共享。

### 案例 3：用 transformer 给某几行加高亮

shiki 1.x 的 transformer 让你不用改 markdown 源码就能"标记某行"：

```ts
import { transformerNotationHighlight } from '@shikijs/transformers';

const html = await codeToHtml(code, {
  lang: 'js',
  theme: 'nord',
  transformers: [transformerNotationHighlight()],
});
```

然后在代码里写注释 `// [!code highlight]`，那一行就会被加底色。还有 `[!code ++]`（diff 加）、`[!code --]`（diff 减）、focus 等等。

## 踩过的坑

1. **默认全量 import 会让 bundle 飙到 500 KB+**：`import { codeToHtml } from 'shiki'` 看似只引一个函数，但默认会拉所有 grammar 和 theme。生产必须用 `createHighlighter` 显式列出实际用到的几个。

2. **浏览器侧 runtime 高亮要等 WASM 加载**：oniguruma 是 WASM，冷启动 200 ms+，首屏会"先白后染"。正确姿势是在 build 阶段就染好色，HTML 直接发到浏览器，零运行时。

3. **dual theme 让 HTML 体积翻倍**：用 `themes: { light, dark }` 输出双主题时，每个 `<span>` 的 style 都塞了两套颜色变量。小文档站没事，超大 SSG 站要权衡。

4. **v1.x 是 ESM-only，老项目升级痛**：2024-03 的重写抛掉了 CommonJS 兼容，`require('shiki')` 直接报错；0.x 时代写的 plugin 也都不兼容，只能改写成 transformer。

## 适用 vs 不适用场景

**适用**：
- 静态文档站（Astro Starlight / VitePress / Nextra）—— build 期染色，浏览器零开销
- 博客 / 教程网站需要"和编辑器同款颜色"的场景
- React Server Component 文档（用 Bright 这种封装）
- 想要数百种 VS Code 主题随便切

**不适用**：
- 极小 bundle 需求（10 KB 极致博客）—— 选 Prism + 一两个语言
- 在线代码编辑器（要边输入边染色，还要可改）—— 选 [[monaco-editor]] 或 CodeMirror
- 需要自动猜语言（用户粘贴代码不告诉你是什么）—— 选 highlight.js
- CF Worker 这种有 1 MB binary 限制的 edge runtime —— 要细心挑 grammar，可能直接放弃

## 历史小故事（可跳过）

- **2018-09**：Pine Wu 开源 shiki v0.1，名字来自日语「式」（仪式），最初只是个小工具
- **2022 年起**：Anthony Fu（Vue / Nuxt 生态核心开发者）接手维护，把 shiki 推到 VitePress / Nuxt Content / Slidev / Astro 的默认渲染器
- **2024-03**：v1.x 重写发布，改成 ESM-only + 分包架构（`@shikijs/core` / `@shikijs/transformers` / `@shikijs/twoslash`），引入 transformer 模式
- **后续**：社区开始讨论是否用 [[tree-sitter]] 替换 TextMate grammar，但目前 shiki 仍是 TextMate 路线

## 学到什么

1. **复用现成生态比重新造一遍聪明**：shiki 不写 130 个语言定义，直接用 VS Code 的，省下数百人年工程量
2. **WASM 让"原本跑在桌面 C 库的东西"能在浏览器跑**——oniguruma 是典型例子
3. **build 期渲染 vs runtime 渲染** 是性能的根本权衡，文档站走 build 期最优
4. **bundle 大不一定是问题**：build 期跑的代码，用户根本下载不到，"重"在开发机上而不是用户那

## 延伸阅读

- 官方文档：[shiki.style](https://shiki.style/)
- Anthony Fu 的介绍博文：[Shiki Twoslash and the New Era of Code Blocks](https://antfu.me/posts/shiki-twoslash)
- VS Code TextMate grammar 规范：[VS Code Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)
- 主仓库源码：[github.com/shikijs/shiki](https://github.com/shikijs/shiki)
- [[vitepress]] —— 默认用 shiki 染色的 Vue 文档框架
- [[starlight]] —— Astro 文档主题，也用 shiki

## 关联

- [[vitepress]] —— Vue 文档站，shiki 是默认代码渲染器
- [[starlight]] —— Astro 文档主题，内部用 expressive-code（shiki 上层封装）
- [[monaco-editor]] —— 浏览器里的 VS Code 编辑器，同样基于 TextMate / oniguruma
- [[tree-sitter]] —— 增量式 parser，未来可能替换 TextMate 路线
- [[markdown-it]] —— Markdown 解析器，常和 shiki 配合做代码块渲染
- [[unified]] —— remark / rehype 体系，也常通过 shiki 插件染色

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[markdown-it]] —— markdown-it — 把 Markdown 文本变成 HTML 的工业级解析器
- [[marked]] —— marked — 用一堆正则把 markdown 变成 HTML 的轻量解析器
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[nextra]] —— Nextra — 在 Next.js 上盖一层文档站脚手架
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳

