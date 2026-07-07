---
title: Zettlr — 学者向 Markdown 编辑器
来源: 'https://github.com/Zettlr/Zettlr'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Zettlr 是一个面向学术写作、长文写作和知识整理的 Markdown 桌面编辑器。日常类比：它像一张给论文作者准备的书桌，把草稿纸、文献卡片、引用格式、导出模板和资料柜放在同一个地方。

最小例子不是安装命令，而是一段真正会在论文里出现的 Markdown：

```markdown
---
title: "My paper"
bibliography: ./assets/references.json
csl: ./styles/apa.csl
---

Zettlr lets me write with sources [see @Ermakoff2013, p. 45].
```

这段文件在普通编辑器里只是文本；在 Zettlr 里，它会触发引用补全、参考文献预览、导出时的 CSL 样式和 Pandoc 转换。它解决的不是“怎么把字打出来”，而是“怎么把一堆 Markdown 文件稳稳送到论文、报告或书稿的交付格式”。

## 为什么重要

不理解 Zettlr，下面这些事会很难解释：

- 为什么很多写作者明明喜欢 Markdown 的轻量，却最后又被 Word 的引用、目录和格式困住
- 为什么论文项目最好拆成多个小文件，而不是把所有章节塞进一个巨大的文档
- 为什么 `[@Author2024]` 这种看似奇怪的写法，导出后能变成期刊要求的引用格式
- 为什么“编辑器”有时不只是输入框，而是围绕写作流程组织文献、搜索、导出和项目结构

## 核心要点

1. **Markdown 是源稿**：像先写一份干净的菜谱，不急着摆盘。Zettlr 鼓励你把正文、标题、脚注、引用都写成可读文本，减少被排版按钮打断的次数。

2. **Pandoc 是出口**：像同一个稿件交给不同印刷店，PDF、DOCX、HTML、LaTeX 都是不同出口。Zettlr 的导出配置本质上是在帮 Pandoc 选读入格式、输出格式、模板和样式。

3. **项目文件夹是长文骨架**：像写书时一章一个文件，最后再按目录装订。Zettlr 的 Projects 功能把文件夹标记成项目，让你选择哪些文件参与导出、按什么顺序合并、导出到哪些格式。

## 实践案例

### 案例 1：用 Zotero / BibTeX 写论文引用

官方文档的核心流程是：先让参考文献管理器导出 Zettlr 能读的库文件，再在 Markdown 里写 Pandoc 引用语法。

```markdown
---
title: "Vote Defection"
bibliography: ./assets/references.json
csl: ./styles/american-political-science-review.csl
---

As @Ermakoff2013 argues, defection can be studied as a social process.
Other authors frame the same issue differently [see @Author2015, p. 123].

## References

::: {#refs}
:::
```

逐部分解释：

- `bibliography` 指向导出的 CSL JSON、BibTeX 或 BibLaTeX 文件，Zettlr 会读取它并提供 citekey 补全。
- `csl` 指向引用样式文件，导出时决定作者、年份、页码和参考文献列表长什么样。
- `@Ermakoff2013` 是叙述式引用；`[@Author2015, p. 123]` 是括号式引用。
- `::: {#refs}` 明确告诉 Pandoc：参考文献列表放在这里，而不是默认塞到文末。

### 案例 2：把长论文拆成 Project

Projects 文档给的真实思路是把一篇论文放进一个文件夹，每节一个 Markdown 文件，再让项目导出时按顺序合并。

```text
Vote Defection/
├── 01-introduction.md
├── 02-background.md
├── 03-data-and-methods.md
├── 04-results.md
├── 05-discussion.md
├── 06-conclusion.md
└── notes.md
```

逐部分解释：

- 文件夹本身就是项目容器；右键打开属性后，开启 Projects 功能。
- `notes.md` 可以留在同一文件夹里做草稿，但不一定加入最终导出列表。
- Project Settings 里的文件顺序会影响最终合并顺序，也会影响文件管理器里项目文件的显示顺序。
- 同一个项目可以选择多个导出 profile，例如一次导出 PDF 给导师、DOCX 给合作者、HTML 给网页预览。

### 案例 3：用 Snippets 固定论文或幻灯片模板

Snippets 文档展示了 TextMate 风格的变量。它适合把常用 YAML front matter、Beamer 幻灯片头部或评分表做成模板。

```markdown
---
title: $1
subtitle: $2
author: $3
date: ${4:\today}
theme: ${5:CambridgeUS}
aspectratio: ${6:1609}
---

# $1

$0
```

逐部分解释：

- `$1`、`$2`、`$3` 是按 Tab 依次跳转的填写位置。
- `${5:CambridgeUS}` 表示默认值是 `CambridgeUS`，需要时直接改掉。
- `$0` 是最终光标落点，填完变量后回到正文开始写。
- 对初学者来说，这等于把“每次都要记住的格式细节”从脑子里搬进模板。

## 踩过的坑

1. **把 Zettlr 当成纯 Word 替代品**：它的强项是纯文本源稿和导出流程，不是所见即所得地拖拽排版。

2. **引用库没有保持更新**：Zotero 新增文献后，如果导出文件没自动更新，Zettlr 的 citekey 补全就会找不到新条目。

3. **PDF 导出失败只怪 Zettlr**：很多 PDF 错误其实来自 LaTeX 环境缺包，例如 `.sty` 文件缺失，需要补装对应包。

4. **内部链接写了扩展名或文件没加载**：Zettlr 的 `[[link]]` 通常匹配文件名或 ID，目标文件必须被工作区读到。

## 适用 vs 不适用场景

**适用**：

- 写论文、报告、书稿、研究笔记，并且需要引用、脚注、目录和多格式导出
- 喜欢 Markdown 纯文本，希望文件留在本地、能被 Git 或普通文件夹管理
- 需要把 Zotero、BibTeX、Pandoc、LaTeX 模板接进同一套写作流程
- 长文需要分章节维护，最后再合并成一个交付文件

**不适用**：

- 只想做卡片式白板、数据库视图或重度拖拽排版
- 主要需求是多人实时协作编辑，同步评论和修订痕迹
- 完全不想接触 Markdown、YAML、引用 key 或导出 profile
- 移动端写作为主，因为 Zettlr 主要面向桌面系统

## 历史小故事（可跳过）

- **2017 年**：Hendrik Erz 在探索学术 Markdown 工作流时开始做 Zettlr，目标是给研究写作找一个比普通 Markdown 编辑器更贴合的工具。
- **2018 年**：Zettlr 1.0 发布，逐渐围绕 Markdown、Zettelkasten、引用和 Pandoc 导出形成定位。
- **2021 年**：2.0 时代强化了项目、界面和写作流程，社区也开始把它当成“publication workbench”来理解。
- **2025 年**：4.0 在八周年时发布，重点改进表格编辑、PDF / 图片查看和引用解析。
- **现在**：GitHub 上约 13k stars，核心人群仍是学术作者、记者、研究人员和偏长文的 Markdown 用户。

## 学到什么

- 好的写作工具不是把按钮做满，而是让“草稿 → 引用 → 模板 → 导出”这条链路少断几次。
- Markdown 的价值在于源文件长期可读；Zettlr 的价值在于把它接到学术写作的现实流程。
- Projects 功能提醒我：长文不是一个巨大文件，而是一组可排序、可排除、可合并的小文件。
- Snippets 和 front matter 的本质是把重复格式变成模板，让注意力回到内容本身。

## 延伸阅读

- 官方仓库：[Zettlr/Zettlr](https://github.com/Zettlr/Zettlr)
- 用户手册：[Zettlr User Manual](https://docs.zettlr.com/en/)
- 引用文档：[Citations](https://docs.zettlr.com/en/editor/citations/)
- 项目文档：[Projects](https://docs.zettlr.com/en/file-manager/projects/)
- 模板文档：[Snippets](https://docs.zettlr.com/en/editor/snippets/)
- [[marktext]] —— 同样是 Markdown 编辑器，但更偏日常所见即所得写作

## 关联

- [[markdown-it]] —— 解释 Markdown 文本如何被解析成可渲染结构
- [[codemirror]] —— Zettlr README 提到编辑器层使用 CodeMirror 6
- [[marktext]] —— 对比“轻量 Markdown 编辑器”和“学术出版工作台”的差异
- [[vscode]] —— 同样能写 Markdown，但需要插件拼出引用和导出流程
- [[prosemirror]] —— 代表另一类结构化富文本编辑思路，可和 CodeMirror 路线对照
- [[docusaurus]] —— 都把 Markdown 当源稿，只是 Docusaurus 面向文档站发布

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
