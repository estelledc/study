---
title: Pandoc Templates — 给 Markdown 套上「出版级外壳」的模具
来源: 'John MacFarlane, "Pandoc User''s Guide", Templates chapter, https://pandoc.org/MANUAL.html; jgm/pandoc doc/customizing-pandoc.md'
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 是什么

Pandoc Templates（模板）是 Pandoc 在生成**独立文档**（standalone document）时用的「外壳模具」。日常类比：你写了一篇博客草稿（Markdown 正文），Pandoc 负责把字排好、转成 HTML/LaTeX/EPUB 等格式；模板则是**书皮 + 扉页 + 页眉页脚 + 目录槽位**——正文塞进 `$body$` 这个洞里，标题、作者、日期从元数据填进 `$title$`、`$author$` 等孔位。

没有模板时，Pandoc 默认输出往往只是片段（fragment），适合嵌进网页；加上 `-s` / `--standalone` 或 `--template` 后，才会生成能直接发 PDF、发邮件、上架电子书的完整文件。

官方文档把模板定位得很清楚：模板是**脚手架**，负责包裹正文和元数据展示；**不能**用模板直接改写正文里的某段措辞——那要靠 [Pandoc Filter](https://pandoc.org/filters.html) 在 AST 阶段动手。

## 为什么重要

不理解 Pandoc 模板，下面这些事容易踩坑：

- 为什么 `pandoc note.md -o note.html` 只有 `<h1>` 没有 `<html>` 外壳——缺 `-s` 或默认 standalone 行为
- 为什么改了 YAML 里的 `title` 但 PDF 封面没变——可能走的是 LaTeX 模板变量，不是 `--metadata` 和 `--variable` 混用
- 为什么自定义 HTML 后升级 Pandoc 样式全乱——官方建议跟踪 [pandoc-templates](https://github.com/jgm/pandoc-templates) 仓库，大版本要 diff 默认模板
- 为什么 DOCX 要 `--reference-doc` 而不是 `--template`——Office 格式用样式文档，不是纯文本模板（见下文「格式差异」）

学术写作、技术书籍、静态站点生成（Hugo、Quarto、Obsidian 导出）背后，大量「最后一步排版」都落在 Pandoc 模板或它衍生的默认模板上。

## 核心概念

### 1. 默认模板 vs 自定义模板

每种输出格式几乎都有内置默认模板。查看方式：

```bash
# 打印 HTML5 默认模板到终端
pandoc -D html5

# 保存为文件，再改
pandoc -D latex -o my-default.latex
```

使用自定义模板：

```bash
pandoc report.md -s --template=corporate.html -o report.html
```

Pandoc 会先在当前目录找 `corporate.html`，找不到再去用户数据目录的 `templates/` 子目录（Linux/macOS 常见为 `~/.local/share/pandoc/templates/` 或 `~/.pandoc/templates/`，以 `pandoc --version` 里 `User data directory` 为准）。

也可以**覆盖系统默认**：在用户数据目录放 `templates/default.html`，则 `-s -t html` 会自动用你的版本，无需每次 `--template`。

### 2. 关键占位变量

模板本质是带孔位的纯文本。最常用的孔：

| 变量 | 含义 |
|------|------|
| `$body$` | 转换后的正文（已渲染成目标格式） |
| `$title$` | 文档标题（YAML / `-M title=`） |
| `$author$` | 作者，可为列表 |
| `$date$` | 日期 |
| `$toc$` | 目录 HTML/LaTeX 等（需 `--toc`） |
| `$header-includes$` | `-H` 注入的头部内容 |
| `$for(header-includes)$` … | 多值循环（见语法） |

HTML 模板里常见还有 `$if(toc)$` 包裹目录块、`$if(abstract)$` 包裹摘要等条件段。完整变量表见 [Pandoc Variables](https://pandoc.org/demo/example33/6.2-variables.html)。

### 3. 模板语法（Template syntax）

Pandoc 使用自己的微型模板语言（受 Hakyll 启发），定界符为 `$...$` 或 `${...}`，可混用。

**插值**：`$title$`、`${foo.bar.baz}$`（点号访问嵌套字段）。

**条件**：

```text
$if(lang)$
<html lang="$lang$">
$else$
<html>
$endif$
```

注意：`-V foo=false` 得到的是**字符串** `"false"`，在条件里为真；布尔 false 要用 YAML 元数据或 `-M foo=false`。

**循环**：

```text
$for(author)$
  <meta name="author" content="$author$">
$sep$
$endfor$
```

**Partials（子模板）**：把重复片段拆到单独文件，例如 `styles.html`，主模板里写 `${ styles() }`。Partials 与主模板同目录；也可 `${ articles:bibentry() }` 对数组每项套用子模板，循环内用 `it` 指当前项。

**管道（Pipes）**：`$name/uppercase$`、`$for(employees/pairs)$` 等，用于大小写、对齐、枚举编号等变换。

**注释**：`$-- 这行不会出现在输出里`

### 4. 变量从哪来

| 来源 | 值类型 | 字符串处理 | Filter 可读 |
|------|--------|------------|-------------|
| `-V` / `--variable` | 字符串、布尔 | 原样插入模板 | 否 |
| `-M` / `--metadata` | 字符串、布尔 | 转义 | 是 |
| YAML 元数据块 | 还可对象、列表 | 按 Markdown 解释 | 是 |
| defaults.yaml 的 `variables:` | 结构化 | 视字段而定 | 部分 |

实践建议：**模板展示用 `-V`**（原样 HTML/CSS）；**文档语义元数据用 YAML**；需要 filter 读的结构化数据放 YAML。

### 5. 格式差异：template vs reference-doc

| 格式 | 定制方式 |
|------|----------|
| HTML, LaTeX, Typst, TEI, … | `--template` 文本模板 |
| DOCX, ODT | `--reference-doc` 样式参考文件；模板管元数据插值 |
| PPTX | 无传统模板，用 reference-doc |
| PDF | 通常 `-t latex` + `default.latex` 模板，再调 PDF 引擎 |

`--reference-doc` 改的是 Word 里「标题 1 / 正文」样式；`--template` 改的是封面、目录位置、页眉字段等**骨架**。

### 6. 与 include 选项的关系

很多时候不必 fork 整个默认模板：

```bash
pandoc doc.md -s -o out.html \
  -H analytics.html \
  -B disclaimer.md \
  -A license.md
```

分别对应模板变量 `header-includes`、`include-before`、`include-after`。只加一段 CSS 或免责声明时，比维护一整份 `default.html` 轻松得多。

## 实践案例

### 案例 1：最小自定义 HTML 模板

项目结构：

```text
templates/
  minimal.html
article.md
```

`templates/minimal.html`：

```html
<!DOCTYPE html>
<html lang="$if(lang)$$lang$$else$en$endif$">
<head>
  <meta charset="utf-8">
  <title>$if(title)$$title$$else$Untitled$endif$</title>
  $if(author)$
  <meta name="author" content="$for(author)$$author$$sep$, $endfor$">
  $endif$
  <style>
    body { max-width: 40em; margin: 2em auto; font-family: system-ui, sans-serif; }
    nav#TOC { background: #f6f8fa; padding: 1em; margin-bottom: 2em; }
  </style>
  $for(header-includes)$
  $header-includes$
  $endfor$
</head>
<body>
  <header>
    <h1 class="title">$title$</h1>
    $if(subtitle)$<p class="subtitle">$subtitle$</p>$endif$
    $if(date)$<p class="date">$date$</p>$endif$
  </header>
  $if(toc)$
  <nav id="TOC" role="doc-toc">
    $toc$
  </nav>
  $endif$
  <main>
    $body$
  </main>
  <footer><p>Generated with Pandoc $pandoc-version$</p></footer>
</body>
</html>
```

`article.md`：

```yaml
---
title: "季度复盘"
author: [Alice, Bob]
date: 2026-06-13
lang: zh-CN
---
```

```bash
pandoc article.md -s --toc \
  --template=templates/minimal.html \
  -o quarterly.html
```

要点：`-s` 启用 standalone；`--toc` 让 `$toc$` 有内容；`$for(header-includes)$` 保留以后用 `-H` 扩展的口子。

### 案例 2：LaTeX 模板片段 + 命令行变量

书籍常要改页边距、字体，而不必重写整个 `default.latex`。可以基于默认模板只改几行，或用 include：

```bash
pandoc book.md -s -t latex -o book.tex \
  --template=templates/book.latex \
  -V documentclass=book \
  -V geometry:margin=1in \
  -V mainfont="TeX Gyre Termes" \
  -V CJKmainfont="Source Han Serif SC" \
  --toc --number-sections
```

`templates/book.latex` 里在导言区保留 Pandoc 占位：

```latex
\documentclass[$if(fontsize)$$fontsize$$else$11pt$endif$]{$documentclass$}
\usepackage{geometry}
$if(geometry)$
\geometry{$for(geometry)$$geometry$$sep$,$endfor$}
$endif$
$for(header-includes)$
$header-includes$
$endfor$
\begin{document}
$if(title)$
\maketitle
$endif$
$if(toc)$
\tableofcontents
$endif$
$body$
\end{document}
```

再交给 `xelatex` 或 `pdflatex` 编译。PDF 路径：`pandoc book.md -o book.pdf --pdf-engine=xelatex` 同样适用此模板。

### 案例 3：Partials 拆分页眉品牌区

`templates/report.html`：

```html
<!DOCTYPE html>
<html>
<head>
  <title>$title$</title>
  ${ styles() }
</head>
<body>
  ${ branding() }
  $body$
</body>
</html>
```

`templates/branding.html`（partial，注意无最终换行）：

```html
<div class="brand">
  <img src="$it.logo$" alt="logo" width="120">
  <span>$it.company$</span>
</div>
```

主文档 YAML：

```yaml
---
title: "安全审计报告"
branding:
  logo: "/assets/logo.svg"
  company: "Example Corp"
---
```

模板中调用：`${ branding() }` 若 `branding` 是 map，partial 内用 `$it.logo$`。多个客户报告共用同一 `report.html`，只换 partial 或元数据。

### 案例 4：defaults.yaml 固化模板工作流

`pandoc-defaults.yaml`：

```yaml
from: markdown
to: html5
standalone: true
template: templates/minimal.html
toc: true
variables:
  lang: zh-CN
metadata:
  author: "Study Notes"
```

使用：

```bash
pandoc --defaults pandoc-defaults.yaml article.md -o out.html
```

团队里把模板路径、TOC、语言写进 defaults，比记一长串 CLI 标志可靠。

## 调试与维护

1. **对比默认模板**：升级 Pandoc 后执行 `pandoc -D html5 > /tmp/new-default.html`，与仓库里 fork 的模板 diff。
2. **打印 partial**：`pandoc --print-default-data-file=templates/styles.html` 查看官方 HTML 样式片段。
3. **看变量是否注入**：临时在模板里加 `<!-- meta-json: $meta-json$ -->`（HTML 注释）检查元数据 JSON。
4. **先 fragment 后排版**：正文问题用 `pandoc -t native` 或 filter；版式问题才动模板。

## 常见误区

| 误区 | 事实 |
|------|------|
| 模板能改任意段落措辞 | 不能；改 AST 用 filter |
| `-V` 和 `-M` 等价 | 转义与类型语义不同 |
| DOCX 用 `.html` 模板就行 | 需要 `reference.docx` 管样式 |
| 复制一次默认模板就永久省心 | 大版本需跟进 upstream |
| 不用 `-s` 也会套模板 | `--template` 隐含 standalone，但习惯显式写 `-s` |

## 与生态的关系

- **Quarto**、**R Markdown**：在 Pandoc 之上再包一层，底层仍是模板 + metadata。
- **[[ghostwriter]]** 等 Markdown 编辑器：导出 PDF 往往调用 Pandoc，模板决定最终版式。
- **[[docusaurus]]** / **[[starlight]]**：不走 Pandoc 模板，但「内容 + 主题外壳」分工类似。
- **LaTeX 发行版**：模板里的 `$body$` 已是 LaTeX 片段，错误常来自包冲突而非 Markdown 本身。

## 小结

Pandoc Templates 把「写作」（Markdown）和「出版」（HTML/LaTeX/EPUB 外壳）拆开：正文进 `$body$`，元数据填变量，条件/循环/partials 组织重复结构，`-V` / YAML / `-H` 注入样式与脚本。入门路径建议是 `pandoc -D html5` 读默认模板 → 复制改最小 diff → 用 `--template` 和 defaults 固化 → 大版本 diff upstream。需要改正文逻辑时再上 filter，需要 Word 样式时再上 reference-doc——三条线别混。

## 参考

- [Pandoc Manual: Templates](https://pandoc.org/MANUAL.html#templates)
- [Template syntax](https://pandoc.org/demo/example33/6.1-template-syntax.html)
- [Variables](https://pandoc.org/demo/example33/6.2-variables.html)
- [Customizing pandoc (official doc)](https://github.com/jgm/pandoc/blob/main/doc/customizing-pandoc.md)
- [jgm/pandoc-templates](https://github.com/jgm/pandoc-templates) — 各格式默认模板源码
