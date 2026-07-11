---
title: TextMate — macOS 上定义 bundle 宏系统的编辑器
来源: 'https://github.com/textmate/textmate'
日期: 2026-06-24
分类: 编辑器
难度: 初级
---

## 是什么

TextMate 是一款 macOS 专属的图形化文本编辑器，2004 年由丹麦开发者 Allan Odgaard 发布，2012 年开源（GPLv3）。GitHub 星数约 15k。

日常类比：如果把编辑器比作一台缝纫机，TextMate 就是那种"允许你自己设计花样模板、一脚踩下去自动绣完整片图案"的机器。你把常用操作录制成一条"宏"，存进一个叫 Bundle 的文件夹，以后遇到同类工作，一个快捷键就能重播整套动作。

技术上，TextMate 把"文本编辑"和"自动化"分层处理：底层用 C++ / Objective-C++ 实现高性能渲染和文件 I/O；上层通过 Bundle 机制暴露 snippet、命令、语法定义、宏等扩展点，用户可以用任意脚本语言（Ruby、Python、Shell）编写 Bundle 内的命令。

TextMate 对后世编辑器影响极深——它定义的 TextMate Grammar（.tmLanguage / .tmTheme）至今仍是 VS Code、Sublime Text、Atom 等编辑器的语法高亮底层格式。

## 为什么重要

不理解 TextMate，下面这些事都没法解释：

- 为什么 VS Code 的语法高亮文件叫 `.tmLanguage` 或 `.tmGrammar.json`——因为这套格式就是 TextMate 发明的，后来被整个行业采纳

- 为什么 Sublime Text 的配色方案文件是 `.tmTheme`——因为它直接沿用了 TextMate 的主题格式

- 为什么 2000 年代后期 Ruby on Rails 社区几乎人手一个 TextMate——因为它的 Bundle 机制让 Rails 开发效率翻倍，DHH 在演示中大量使用 TextMate

- 为什么现代编辑器都有 snippet 展开（输入缩写按 Tab 展开为完整代码块）——TextMate 是第一个把 snippet 做成系统级特性的编辑器

- 为什么 Tree-sitter 诞生时对标的是"TextMate Grammar 的局限性"——正则匹配无法处理嵌套结构，Tree-sitter 用真正的增量解析来替代

- 为什么 macOS 开发者对"文本编辑器"和"IDE"的边界有独特理解——TextMate 证明了一个轻量编辑器加上好的自动化机制可以胜任 IDE 的工作

## 核心要点

TextMate 的设计哲学建立在三根柱子上：

**第一，Bundle 是一切扩展的容器。** 一个 Bundle 就是一个文件夹，里面可以包含 snippet（代码片段）、command（Shell/Ruby/Python 脚本）、macro（键盘操作录制回放）、language grammar（语法定义）、preference（缩进规则等）。编辑器的所有"智能行为"都住在 Bundle 里，用户可以像管理文件夹一样管理编辑器的能力。

想象一个工具箱：每个 Bundle 是一个抽屉，抽屉里放着螺丝刀（snippet）、电钻（command）、卷尺（grammar），你可以随时添加新抽屉或者把别人的抽屉整个搬过来用。

**第二，Scope 驱动的上下文感知。** TextMate 给文档中的每个字符赋予一个作用域名称（scope name），例如 `source.python meta.function.python entity.name.function.python`。所有 snippet、快捷键、命令都可以限定只在特定 scope 下生效。这意味着同一个 Tab 键，在 HTML 标签里展开的是标签补全 snippet，在 Python 函数体里展开的是 `def` 模板。

类比：就像手机的自动切换——你走进办公室 WiFi 自动连公司网络，回到家自动连家里网络。TextMate 根据你光标所在的"语法区域"自动切换行为模式。

**第三，Unix 哲学的脚本集成。** Bundle 里的命令本质上就是 Shell 脚本。TextMate 把当前选中的文本通过标准输入（stdin）传给脚本，脚本的标准输出（stdout）作为结果替换回编辑器。你可以用任何语言处理文本——awk、sed、ruby、python 都行。不需要学习私有 API，会写命令行工具就会写 TextMate 命令。

## 架构概览

TextMate 的源码结构分为三层：

最底层是 C++ 实现的文本存储引擎（基于 buffer/片段表），负责高效地插入、删除、撤销。中间层是 Objective-C++ 写的应用框架，处理窗口管理、文件监听、进程派生。最上层是 Bundle 运行时——解析 plist/JSON 格式的 Bundle 文件，根据当前 scope 匹配合适的 snippet/command/grammar 并执行。

命令的执行模型极其简洁：编辑器 fork 出一个子进程，设置环境变量（如 `TM_SELECTED_TEXT`、`TM_CURRENT_LINE`、`TM_FILEPATH`），把相关文本喂给 stdin，然后根据命令声明的输出类型（替换选中、插入为片段、显示为 HTML 面板、输出到工具提示等）处理 stdout。这意味着任何能在终端运行的工具都能成为 TextMate 的"插件"，无需学习 SDK。

## 实践案例

### 案例 1：Snippet 让重复代码归零

写 HTML 时，输入 `div.container` 然后按 Tab，TextMate 自动展开为：

```html
<div class="container">
  $0
</div>
```

光标停在 `$0` 位置，直接开始写内容。复杂的 snippet 还支持多个 Tab Stop（`$1`、`$2`……），按 Tab 在占位符之间跳转，支持正则变换和镜像——改一个地方，其他引用同步变。

这套 snippet 语法被 VS Code 和 Sublime Text 原样继承，至今格式完全兼容。

### 案例 2：一键排版 Markdown 表格

你选中了一段对齐混乱的 Markdown 表格文本。运行 Bundle 命令"Align Columns"，TextMate 把选中文本通过 stdin 传给一段 Ruby 脚本，脚本按 `|` 分列、计算最大宽度、补空格对齐，结果通过 stdout 替换回编辑器。整个过程不到一秒。

你不需要装任何插件——这就是 Bundle 自带的命令。如果你想改对齐逻辑，直接打开 Bundle Editor 编辑那段 Ruby 脚本即可。

### 案例 3：给新语言添加语法高亮

你在用一门小众语言，TextMate 没有现成的 Bundle。你可以新建一个 Language Grammar，用正则表达式定义关键字、字符串、注释等 pattern，指定对应的 scope name。保存后编辑器立即生效，该语言的文件自动高亮。

这份 `.tmLanguage` 文件（plist 或 JSON 格式）如果你发布出去，VS Code 用户也能直接使用——因为 VS Code 的语法引擎就是基于 TextMate Grammar 规范构建的。

## 踩过的坑

1. **TextMate Grammar 用正则匹配，嵌套结构力不从心**：当一段代码中出现"字符串里嵌表达式、表达式里再嵌字符串"的情况（如 JavaScript 模板字面量 `` `hello ${name + `!`}` ``），正则无法正确计数嵌套层级，高亮会出错。这正是 [[tree-sitter]] 诞生的直接原因——它用真正的解析器替代正则。

2. **macOS 独占导致社区萎缩**：TextMate 只能运行在 macOS 上，当 Linux 和 Windows 开发者比例逐年上升后，社区自然向跨平台编辑器（Sublime Text → VS Code）迁移。单一平台战略在开发者工具市场中是高风险选择。

3. **TextMate 2 开发周期过长**：2009 年宣布 TextMate 2，直到 2012 年才开源 alpha 版本，中间三年空窗期让大量用户投奔 Sublime Text。教训是：对于开发者工具，长时间不发布会直接导致用户流失，因为开发者对工具的忠诚度远低于对习惯的依赖。

4. **Bundle 管理缺乏依赖系统**：Bundle 之间没有版本号和依赖声明，如果两个 Bundle 定义了冲突的快捷键或 scope，用户只能手动排查。对比后来的 VS Code 扩展系统有完善的版本、依赖、冲突检测机制。

## 适用场景

**适用**：

- 想理解现代编辑器语法高亮底层原理的学习者——读 TextMate Grammar 规范是最直接的路径
- macOS 用户需要一个轻量、启动快、原生体验的编辑器——TextMate 启动几乎瞬间，内存占用极低
- 经常做文本批处理但不想离开编辑器的场景——Bundle 命令让你用 Shell/Ruby 直接处理当前文本
- 想学习 snippet 语法的开发者——TextMate 的 snippet 格式就是行业标准
- 想给自己的编程语言写语法高亮的语言设计者——从 .tmLanguage 入手最容易，且成果可被 VS Code 复用

**不适用**：

- 非 macOS 用户——TextMate 没有 Windows/Linux 版本，跨平台需求选 [[vscode]] 或 [[sublime-text]]
- 需要 LSP 级别的智能补全和重构——TextMate 没有内置 Language Server Protocol 支持
- 需要内置终端、调试器、Git GUI 的"全功能 IDE"体验——TextMate 专注文本编辑，不做 IDE
- 需要 AI 辅助编程（Copilot 等）的场景——TextMate 生态已不活跃，没有此类集成
- 需要处理超大文件（GB 级日志）的场景——TextMate 对大文件的支持不如 [[vim]] 或专用工具

## 历史小故事（可跳过）

**2004 年 — 横空出世**：Allan Odgaard 发布 TextMate 1.0，定价 $39。当时 macOS 上的选择要么是重量级的 BBEdit，要么是轻量但功能单薄的内置 TextEdit。TextMate 精准卡在中间位置——轻量但可编程。

**2005 年 — Rails 社区爆发**：DHH（Ruby on Rails 创始人）在著名的"15 分钟搭博客"演示视频中全程使用 TextMate，展示了 snippet 和 Bundle 如何让 Rails 开发飞起来。这段视频让 TextMate 成为 Rails 开发者的标配工具，sales 暴增。

**2006 年 — 获 Apple Design Award**：Apple 将该年的 Best Developer Tool 奖颁给 TextMate，这是对其设计哲学的官方认可。

**2009 年 — 宣布 TextMate 2**：Allan 宣布重写，社区翘首以盼。但随后是漫长的沉默。

**2012 年 — 开源 TextMate 2 alpha**：等不及的用户已经跑去 Sublime Text 了，但开源这步让 TextMate 获得了新生。社区可以自己修 bug、加功能。

**2019 年至今 — 低频维护**：TextMate 2 仍在更新，但节奏很慢，属于"成熟稳定不再大改"的状态。它的历史使命——定义编辑器的 Bundle/Grammar 范式——早已完成。

## 学到什么

1. 定义标准比做产品更有长期影响力——TextMate 作为产品的市场份额早已萎缩，但 .tmLanguage 和 .tmTheme 格式至今仍是行业事实标准，被几乎所有主流编辑器支持。标准比应用活得更久。

2. "Unix 哲学 + GUI 壳"是一种强大的设计模式——TextMate 的命令本质就是 stdin/stdout 的管道，但加上了图形界面的触发和展示。这种"底层用管道、上层用按钮"的分层思路在很多工具设计中都能借鉴。

3. 单平台策略是高风险的赌注——macOS 独占让 TextMate 在 Mac 开发者中极受欢迎，但也注定了它的天花板。当跨平台成为刚需后，用户迁移成本反而很低（因为 Bundle 格式是通用的）。

4. 开发者工具的竞争节奏极快——三年不发版本，用户就跑了。Sublime Text 靠"快"和"跨平台"在 TextMate 2 难产期精准截胡。对比 [[vim]] 和 [[emacs]] 能几十年保持用户，是因为它们从不试图垄断某个时代，而是活在自己的生态位里。

5. 好的抽象会被整个行业采纳——TextMate 的 scope name 体系（如 `keyword.control`、`string.quoted.double`）看似简单，但建立了一套"语法高亮的语义层"，让主题和语法解耦。这个设计选择的价值在十年后才被充分认识到。

## 延伸阅读

- TextMate 官网：[macromates.com](https://macromates.com/)
- TextMate Grammar 规范（VS Code 文档版）：[Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)
- 知乎介绍：[TextMate Grammars 简介](https://zhuanlan.zhihu.com/p/696103744)
- TextMate Bundle 开发文档：[Bundles Manual](https://macromates.com/manual/en/bundles)
- Allan Odgaard 博客：[blog.macromates.com](https://blog.macromates.com/)
- 源码仓库：[github.com/textmate/textmate](https://github.com/textmate/textmate)

## 关联

- [[atom]] —— Atom 最初使用 TextMate Grammar 做语法高亮，后来才发展出 Tree-sitter
- [[vscode]] —— VS Code 的语法引擎直接基于 TextMate Grammar 规范构建，格式完全兼容
- [[sublime-text]] —— 在 TextMate 2 难产期精准截胡的竞品，同样采用 .tmLanguage 和 .tmTheme 格式
- [[emacs]] —— 另一个"万物皆可扩展"的编辑器，但用 Emacs Lisp 而非 Shell 脚本作为扩展语言
- [[vim]] —— 终端原生的高效编辑器，与 TextMate 的 GUI + 脚本路线形成互补
- [[xi-editor]] —— 同样追求高性能文本编辑的实验性项目，用 Rust 重写核心
- [[tree-sitter]] —— 为了克服 TextMate Grammar 正则匹配的局限性而诞生的增量解析框架

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[doom-emacs]] —— Doom Emacs — 启动不到一秒的模块化 Emacs 配置
- [[geany]] —— Geany — 用 C 写的轻量级 GTK 编辑器
- [[spacemacs]] —— Spacemacs — 让 Vim 党和 Emacs 党握手的编辑器配置
- [[texstudio]] —— TeXstudio — LaTeX IDE
- [[void]] —— Void — 开源 Cursor 替代
