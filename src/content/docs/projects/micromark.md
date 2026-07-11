---
title: micromark — markdown 解析器里那台一个字一个字读的状态机
来源: Titus Wormer, micromark, 2020 起；https://github.com/micromark/micromark
日期: 2026-05-30
分类: 前端工程
难度: 中级
---

## 是什么

micromark 是一个**专门把 markdown 文本读成结构化事件**的小工具。日常类比：像超市收银员读条形码——一个字符一个字符扫过去，每扫到一个有意义的边界就"叮"一声告诉后端发生了什么（"标题开始"、"段落结束"）。

你写一段 markdown：

```js
import { micromark } from 'micromark'
const html = micromark('# Hello *world*')
// '<h1>Hello <em>world</em></h1>'
```

它的特别之处：**不用大正则、不切 token，靠一个状态机一个字符一个字符地往前推**。每读一个字符，根据现在所处的"状态"（比如"刚见到 #"或"在段落里"）决定下一步走哪条路。

micromark 不是给最终用户直接调的，而是 **unified / remark / MDX / Astro** 这一整条 markdown 工具链的底层引擎。

## 为什么重要

不理解 micromark，下面这些事都解释不通：

- 为什么 marked / markdown-it 能把 95% 的 markdown 解对，但总有一两个 case 跟 GitHub 渲染不一样——它们没做到 100% CommonMark 合规
- 为什么 Astro / Next.js / VitePress 的 markdown 渲染都依赖一条叫 unified 的链，链的最深处就是 micromark
- 为什么写 markdown 扩展（自定义 :::note::: 语法）很难——不是写正则，而是要写新的状态机片段
- 为什么"流式渲染一个 GB 级 markdown 文件"成立——只要状态机不囤积上下文，输入流过去就行
- 为什么 unified 生态的扩展（remark-gfm、remark-math）能拔插即用——它们最终都把构造塞给 micromark 的状态机，再没碰 AST 一根头发

## 核心要点

micromark 的工作分 **三步**，看似简单但每步都有讲究：

1. **状态机扫字符**：维护一个 state（比如 `inParagraph`、`afterHash`），每读一个字符按 state 决定动作。类比：迷宫里的小人，根据脚下哪块地砖决定往哪走。

2. **发事件，不建树**：识别出"标题开始"就发一个 `enter('atxHeading')` 事件，识别完发 `exit('atxHeading')`。它**不直接构建 AST**，把建树的活留给上层（unified 链里的 mdast-util-from-markdown）。

3. **可挂扩展**：每个状态机片段（叫 construct）能被替换或扩充。GFM、MDX、math、frontmatter 都是这样挂上去的——核心代码不动，往状态机里塞新分支。

最后一步的好处：核心包 30 KB，加了 GFM 也才 60 KB，不用全家桶。

## 实践案例

### 案例 1：直接用 micromark 渲染 markdown

```js
import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

const html = micromark('# 标题\n\n- [x] 任务一\n- [ ] 任务二', {
  extensions: [gfm()],
  htmlExtensions: [gfmHtml()],
})
```

**逐步解释**：

- `micromark(value, options)` 是一站式 API，吃 markdown 字符串吐 HTML
- `extensions` 加进状态机的 syntax 分支（识别 GFM 语法）
- `htmlExtensions` 加进 HTML 渲染分支（决定 `<input type="checkbox">` 怎么写）

### 案例 2：从事件流自己造结构

```js
// 内部 API，仅演示「先发事件、再建树」；业务代码请走 unified/remark
import { parse, postprocess, preprocess } from 'micromark/lib/parse'

const events = postprocess(parse().document().write(preprocess()('# Hi')))
for (const [kind, token] of events) {
  console.log(kind, token.type) // 'enter' 'atxHeading' …
}
```

**逐步解释**：

1. `preprocess` 把字符串收成状态机可吞的码点流
2. `parse().document().write(...)` 跑状态机，边读边攒原始事件
3. `postprocess` 整理成稳定的 `[enter|exit, token]` 列表
4. **unified / mdast-util-from-markdown** 再把事件翻成树——micromark 自己不建 AST

### 案例 3：用 stream 接 fs

```js
import { stream } from 'micromark/stream'
import { createReadStream } from 'node:fs'

createReadStream('huge.md', { encoding: 'utf8' })
  .pipe(stream())
  .pipe(process.stdout) // 输出 HTML
```

输入 stream 流过来，状态机边读边吐 HTML。文件 1 GB 也只占常数内存。这一招让"切下来直接 pipe 到 stdout"成为常态——你不必等整篇 markdown 读完才能看到第一个 `<h1>` 出来。

## 踩过的坑

1. **直接用 micromark 写法繁琐**：除非做底层基础设施，普通业务应该用 `unified().use(remarkParse).use(remarkRehype)`，让生态替你拼；直接撸 micromark 等于在汽车工厂里装螺丝，能装但不该这么干。

2. **状态机 debug 难**：报错只看到 state 编号（比如 `code 35` 表示遇到 `#`），不会指 markdown 第几行第几列。要靠 token positional info 自己反查，新人通常会被劝退。

3. **写 extension 门槛高**：不是写正则，是写 construct——一个 construct 含 tokenize（识别字符走法）、resolve（决定哪些事件保留）、continuation（多行块怎么续上）三段。要先读 micromark-extension-gfm-table 看人家怎么搭。

4. **stream 不处理编码**：BOM、UTF-16 都得自己 decode 成 UTF-8 字符串再喂进去，不然状态机直接乱。Node 里推荐先 `createReadStream('x.md', { encoding: 'utf8' })` 而不是 raw Buffer。

5. **版本切换破坏性**：v3 → v4 把 token 类型重命名了几处（`atxHeadingText` → `atxHeadingContent`），下游 mdast-util-* 必须同步升，半路升级会炸。

## 适用 vs 不适用场景

**适用**：

- 写 markdown 工具链底层（unified / remark / MDX / Astro / Docusaurus 内核都用它）
- 必须 100% CommonMark 合规（GitHub README 渲染对齐）
- 需要流式 / 低内存解析（CMS 后台批量处理 GB 级 markdown）
- 要做语法扩展（自定义 :::callout:::、math 公式块）

**不适用**：

- 业务代码直接渲染一篇 markdown → 用 marked 或 markdown-it 更省事
- 只需要把 markdown 转 HTML 一次 → 用 unified + remark-html，不要直接调 micromark
- 不在意 100% 合规、追求极致小体积 → marked 更小（~10 KB）

## 历史小故事（可跳过）

- **2014 年**：Titus Wormer 开始做 unified / remark 生态——"把 markdown 处理拆成可组合的小块"。
- **2018 年前后**：他发现 remark-parse 在 CommonMark spec 0.28+ 上挂掉好几处（list 嵌套、setext heading 在 block quote 里），原因是底层基于 token-stream 的解析模型遇到上下文敏感语法吃不消。
- **2020 年 8 月**：发布 micromark v0.1，**完全重写底层**，改成 char-by-char 状态机。同年 remark 12 切到 micromark 内核。
- **2024 年**：v4.x 稳定，CommonMark 0.30 spec 742/742 全过，下游链路（unified / MDX / Astro）一起升级。

之后整条 JS markdown 处理链——只要走 unified 的——背后跑的都是这台状态机。

## 学到什么

1. **上下文敏感语法用状态机比 lexer 更稳**：markdown / Python 缩进这种"一行的意义取决于前后行"的格式，正则切 token 必然出 bug；状态机让"现在在什么位置"变成显式变量。
2. **解析和建树拆开**：micromark 只发事件，建 AST 让上层做。这一拆使核心稳定不动，扩展成本极低——MDX、math、frontmatter 都没改一行核心代码。
3. **库的最佳形态可能是底层**：micromark 自己只有 ~1.5k stars，但每周下载 ~30M，因为它跑在你装的每个用 markdown 的工具里。"用户感知不到"反而是好基础设施的标志。
4. **重写一次比修补五年快**：Wormer 没去补 remark-parse 的旧引擎，直接重写 micromark，三年内整条生态切完——这种"敢推倒重来"在开源里很少见，因为下游迁移成本通常吓退作者。

## 延伸阅读

- 仓库 README：[micromark/micromark](https://github.com/micromark/micromark)（含架构图，先看 architecture 章节）
- CommonMark spec：[spec.commonmark.org](https://spec.commonmark.org/0.30/)（吃透这份文档才敢 debug 边界 case）
- 写扩展的范例：micromark-extension-gfm-table 源码（约 300 行，是入门写 construct 的最短路径）
- [[unified]] —— micromark 的上层调度框架
- [[markdown-it]] —— 同领域对手，正则 + token-stream 老派做法

## 关联

- [[unified]] —— remark / rehype / retext 生态总入口；它把 micromark 的事件翻译成 mdast
- [[markdown-it]] —— 速度接近、合规率 97%、API 更直接，适合直接调
- [[marked]] —— bundle 最小（~10 KB），合规率 95%，适合体积敏感场景
- [[astro]] —— 内置 markdown 渲染走 unified → micromark 链路
