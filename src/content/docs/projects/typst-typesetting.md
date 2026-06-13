---
title: Typst 排版系统入门
来源: https://github.com/typst/typst
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

# Typst 排版系统入门

## 一、Typst 是什么

想象一下：你要写一份报告，里面既有文字、表格，又有复杂的数学公式。你有三个选择：

1. 用 Word —— 拖拽排版，公式编辑器像在玩俄罗斯方块
2. 用 LaTeX —— 功能强大但学起来像学一门新语言，出错信息天书一样
3. 用 Typst —— 用简单的标记语言写，但功能不输 LaTeX，出错信息像朋友在帮你

Typst 是一个现代化的、基于标记语言的排版系统。它的设计目标是：**拥有 LaTeX 的能力，同时让新手也能快速上手。**

它由 Typst GmbH 公司开发，用 Rust 语言编写，目前 GitHub 已有超过 5 万颗星。

> 发音提示：/taɪpst/，"Ty" 像 Typesetting，"pst" 像 Hipster。

## 二、核心概念

Typst 的核心由四大部分组成：

### 1. 标记语法（Markup）

和 Markdown 类似，但更丰富。例如：

- 用 `=` 开头的一行创建标题
- 用 `**粗体**` 和 `*斜体*` 标记文字
- 用 `[]()` 插入链接
- 用 `![]()` 插入图片

### 2. 设置规则（Set Rules）

这是 Typst 最优雅的设计之一。你想改变标题编号的样式、页面大小、字体？只需一行设置：

```typst
#set page(width: A4, height: auto)
#set heading(numbering: "1.")
```

这行代码的意思就像："告诉文档，页面用 A4 大小，标题编号用 1、2、3 的样式。"

### 3. 脚本系统（Scripting）

Typst 内嵌了一个完整的脚本语言。用 `#` 开头就可以写代码，变量、函数、循环全部支持。这让文档变成可编程的 —— 你可以让 Typst 自动生成表格、计算斐波那契数列、循环生成列表。

### 4. 数学排版（Math）

用 `$` 包裹数学公式。和 LaTeX 不同，Typst 不需要反斜杠：

```typst
$ E = mc^2 $
$ sum_(i=1)^n i = n(n+1)/2 $
```

多字母函数名（如 `sin`, `cos`, `log`）不需要加引号，Typst 会自动识别。

## 三、第一个 Typst 文档

让我们从头写一个完整的文档，逐步理解每个部分。

### 示例 1：一个完整的学术报告模板

```typst
// 设置页面和全局样式
#set page(
  width: A4,
  height: auto,
  margin: (top: 2.5cm, bottom: 2cm, left: 2.5cm, right: 2.5cm)
)
#set text(font: "Source Han Serif SC", size: 11pt)
#set heading(
  numbering: "1.",
  label: "section",
  style: strong => strong(color: rgb("#1a5276"))
)

// 文档标题和作者信息
#title[基于 Typst 的自动化报告生成]
#author[张三]
#date(auto)

// 摘要
#v(2em)
#embed[abstract.typ]

// 正文开始
= 引言

排版系统的发展经历了几个阶段：早期的打字机，后来的 WYSIWYG 编辑器（如 Word），再到专业的 LaTeX。每一种工具都在解决特定问题，但也都存在自己的短板。

**Typst** 的出现，试图在易用性和功能之间找到更好的平衡。

= 核心特性

Typst 有四个关键特性，让它区别于传统排版工具：

- **增量编译**：修改文档后，Typst 只重新编译变动的部分。大文档的编译速度从几秒缩短到几十毫秒。
- **内嵌脚本**：可以在文档中直接写代码，实现数据驱动的报告。
- **原生数学**：用 `$` 包裹公式，语法比 LaTeX 更简洁直观。
- **扩展生态**：通过 [Typst Universe](https://typst.app/universe/) 社区分享模板和包。

= 数学公式示例

下面展示 Typst 的数学排版能力。单行公式：

$ E = mc^2 $

独立块的复杂公式：

$ f(x) = int_-oo^oo hat f(xi) e^(2 pi i xi x) d xi $

= 结论

Typst 是一个值得关注的现代排版工具，特别适合：

1. 需要频繁更新的数据报告
2. 包含大量数学公式的学术论文
3. 需要统一风格的多文档项目

#v(3em)
// 参考资料
#ref(bib, "Smith2024") 展示了类似的设计思路 [^1]

[^1]: 更多关于 Typst 的资料请参考其 [官方文档](https://typst.app/docs/)。

```

**逐行解释：**

- `#set page(...)`：设置页面为 A4，高度自动适应内容，设置四边距
- `#set text(...)`：全局设置字体和字号
- `#set heading(...)`：设置标题编号为 "1." 格式，标题加粗时显示深蓝色
- `#title[...]`：定义文档主标题
- `#author[...]`：定义作者
- `#date(auto)`：自动生成当前日期
- `#v(2em)`：插入垂直间距
- `= 引言`：一级标题（一个 `=` 是一级，两个 `==` 是二级，以此类推）
- `**粗体**`：加粗文字
- `$ E = mc^2 $`：行内数学公式
- `[^1]: ...`：脚注

### 示例 2：用脚本自动生成表格

Typst 最强大的特性之一是内嵌脚本。下面这个例子展示了如何用代码生成斐波那契数列表格：

```typst
#set page(width: 10cm, height: auto)

= Fibonacci 数列

Fibonacci 数列的递推关系为：

$ F_n = F_(n-1) + F_(n-2) $

它的闭式解为：

$ F_n = round(1 / sqrt(5) phi.alt^n), quad
  phi.alt = (1 + sqrt(5)) / 2 $

// 用脚本定义变量和函数
#let count = 8
#let nums = range(1, count + 1)
#let fib(n) = (
  if n <= 2 { 1 }
  else { fib(n - 1) + fib(n - 2) }
)

上面的前 #count 项为：

// 用 spread 操作符将数组展开为表格参数
#align(center, table(
  columns: count,
  ..nums.map(n => $F_#n$),
  ..nums.map(n => str(fib(n))),
))
```

**关键概念解析：**

| 代码片段 | 含义 |
|---|---|
| `#let count = 8` | 定义一个变量 count，值为 8 |
| `#range(1, count + 1)` | 生成数组 [1, 2, 3, ..., 8] |
| `#let fib(n) = (...)` | 定义一个递归函数，计算斐波那契数列第 n 项 |
| `..nums.map(n => $F_#n$)` | 展开数组，每个元素变成 $F_1, $F_2, ... 这样的数学表达式 |
| `#align(center, table(...))` | 将表格居中对齐 |

这个例子展示了 Typst 的核心理念：**通过可组合的系统实现强大功能**，而不是提供一堆散乱的按钮。你只需要几个基本的"旋钮"（变量、函数、数组、表格），就可以组合出无数种文档结构。

## 四、Typst vs LaTeX vs Markdown

| 特性 | Markdown | LaTeX | Typst |
|---|---|---|---|
| 学习曲线 | 简单 | 陡峭 | 简单 |
| 数学排版 | 弱 | 强 | 强（更简洁的语法） |
| 编译速度 | 不需要 | 慢（大文档） | 极快（增量编译） |
| 脚本能力 | 无 | TeX 宏（难学） | 内置脚本语言 |
| 出错信息 | - | 难懂 | 友好，会标注出错位置 |
| 输出格式 | HTML | PDF | PDF, HTML, PNG, SVG |
| 安装包大小 | - | 几 GB | 单文件，几十 MB |
| 跨平台 | 任意 | 任意 | 任意 |

## 五、快速上手步骤

### 安装

```bash
# macOS（Homebrew）
brew install typst

# 或者用 cargo 安装最新版
cargo install --locked typst-cli

# 或者用包管理器
winget install --id Typst.Typst  # Windows
```

### 编译文档

```bash
# 编译为 PDF
typst compile hello.typ

# 监听文件变化，自动编译（开发时推荐）
typst watch hello.typ
```

### 在线编辑器

Typst 官方提供免费在线编辑器：https://typst.app/，带有自动补全、实时预览和语法高亮。

## 六、学习资源

- [官方教程](https://typst.app/docs/tutorial/)：四章循序渐进的实践指南
- [完整参考文档](https://typst.app/docs/reference/)：覆盖所有语法和函数
- [Typst Universe](https://typst.app/universe/)：社区模板和包
- [GitHub 仓库](https://github.com/typst/typst)：源代码和 Issue
- [Discord 社区](https://discord.gg/2uDybryKPe)：快速提问
- [论坛](https://forum.typst.app)：深入讨论和分享作品

## 七、总结

Typst 的核心设计哲学可以概括为三句话：

1. **一致性带来简洁**：学会一种方法，就能举一反三
2. **可组合性带来强大**：少量基本构件，组合出无限可能
3. **增量编译带来性能**：只重新编译变动的部分

对于一个零基础的学习者来说，Typst 是最友好的专业排版工具 —— 它不需要你掌握 TeX 这种"元语言"，也不需要折腾几 GB 的 LaTeX 发行版。写一个 `.typ` 文件，运行一行命令，就能得到精美的 PDF。
