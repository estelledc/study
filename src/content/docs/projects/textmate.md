---
title: TextMate — macOS 经典编辑器，语法格式影响了所有人
来源: 'https://github.com/textmate/textmate'
日期: 2026-06-06
分类: CLI
子分类: 编辑器与 IDE
难度: 初级
---

## 是什么

TextMate 是 Allan Odgaard 在 2004 年为 macOS 独立开发的图形化文本编辑器。一句话定位：**它是那个"发明了代码高亮插件格式，然后把格式免费送给全世界"的编辑器**。

日常类比：想象一个乐高积木标准。TextMate 设计了一种叫 `.tmbundle` 的乐高标准——每种语言支持打包成一个 bundle，往编辑器里一拖就能用。后来 Sublime Text、Atom、VS Code 都说"我们也用这套标准"，于是你在 VS Code 里看到的 Python/TypeScript/Go 语法高亮，本质上还在沿用 TextMate 2004 年制定的积木规格。

两个关键创新：

1. **tmLanguage** — 用正则表达式写语法定义的 PList 格式，给每种 token（关键字、字符串、注释）打上形如 `keyword.control.python` 的 scope 标签，供主题 / 快捷键根据上下文激活。
2. **Tab trigger** — 输入 `def` 然后按 Tab，自动展开成函数骨架并把光标跳到参数位置；snippet 与上下文感知结合，让不同语言同一快捷键做不同事。

## 为什么重要

不理解 TextMate，下面这些现象没法解释：

- 为什么 VS Code 扩展里语法高亮文件叫 `*.tmLanguage` 或 `*.tmLanguage.json`——它们直接继承自 TextMate 1.x
- 为什么切换 One Dark/Dracula/Tokyo Night 主题后所有语言同时变色——主题按 scope 名匹配，grammar 写好 scope 名，主题就能通吃所有语言
- 为什么 Sublime Text 的 `.sublime-snippet` 和 `.sublime-syntax` 格式看起来像 TextMate 的"升级版"——因为它就是
- 为什么 Neovim 用 nvim-treesitter 替换 tmLanguage 时要专门写"兼容 TextMate scope 名"的适配层

## 核心要点

**1. tmLanguage 的三层结构**

一个语法文件从外到内：`scopeName`（语言根 scope，如 `source.python`）→ `patterns` 数组（规则列表）→ 每条规则的 `match`/`begin-end` 正则 + `name`（分配的 scope）。正则只能匹配单行，跨行结构（如多行字符串）必须用 `begin`/`end` 双段模式捕获。

**2. Scope 名是"通用语"**

`keyword.control`、`string.quoted.double`、`support.function` 这 11 个根类组成了所有语言共用的命名规范。一个主题只要针对这 11 类写 CSS 规则，就能支持任何遵循规范的语言——这就是一套 Dracula 主题能同时染色几十种语言的秘密。

**3. Bundle = 可插拔能力包**

一个 `.tmbundle` 目录包含：`Syntaxes/`（语法 grammar）、`Snippets/`（代码片段）、`Commands/`（Shell 命令，可把选中文本管道到外部工具再写回）、`Preferences/`（自动配对括号等偏好）。任何人打包一个目录双击安装，这个设计比当时的其他编辑器早了 5 年。

## 实践案例

### 案例 1：给小众语言写一个 VS Code 语法扩展

假设你要给 Nix 写语法高亮：

```json
// syntaxes/nix.tmLanguage.json 关键片段
{
  "scopeName": "source.nix",
  "fileTypes": ["nix"],
  "patterns": [
    {
      "name": "comment.line.number-sign.nix",
      "match": "#.*$"
    },
    {
      "name": "string.quoted.double.nix",
      "begin": "\"",
      "end": "\"",
      "patterns": [
        { "name": "constant.character.escape.nix", "match": "\\\\." }
      ]
    },
    {
      "name": "keyword.control.nix",
      "match": "\\b(if|then|else|let|in|inherit|with|rec)\\b"
    }
  ]
}
```

在 `package.json` 里声明 `contributes.grammars`，VS Code 直接加载——整个流程完全是 TextMate 体系。

### 案例 2：在 TextMate 2 里用 Shell Command Bundle 实现自定义构建

TextMate Bundle 里的 Command 类型可以把选中文本或整个文件管道给 Shell 脚本，结果写回文档：

```bash
#!/bin/bash
# Bundle Command: Format JSON (⌘⇧F)
# Input: Document, Output: Replace Document
python3 -m json.tool
```

按 `⌘⇧F`，TextMate 把整个文件内容送到 `python3 -m json.tool`，格式化结果替换回文档。同理可以调 `black`、`rustfmt`、`gofmt`——在 LSP 出现前，这套机制是 TextMate 用户的格式化方案。

### 案例 3：把旧 .tmbundle 迁移到 VS Code 扩展

1. 找到 `.tmbundle/Syntaxes/*.tmLanguage`（PList 格式），用 plist-to-json 转换成 JSON
2. 在新 VS Code 扩展的 `package.json` 里：

```json
"contributes": {
  "grammars": [{
    "language": "mylang",
    "scopeName": "source.mylang",
    "path": "./syntaxes/mylang.tmLanguage.json"
  }]
}
```

3. 把 `.tmbundle/Snippets/*.tmSnippet` 转换为 VS Code 的 snippet JSON 格式——字段名基本一一对应（`tabTrigger` → `prefix`，`content` → `body`）

迁移完成后，原来的 TextMate 社区 grammar 立刻在 VS Code 里生效。

## 踩过的坑

1. **正则不能跨行**：tmLanguage 的 `match` 每次只跑一行，写多行注释 `/* ... */` 必须用 `begin`/`end` 双段，否则 `end` 找不到，后半段文件全变注释色。
2. **scope 命名不规范导致主题瞎**：自定义 grammar 把所有 token 全堆在 `keyword.*` 下，切换 Dracula 等主题时大片代码变成同一颜色无法区分——语义丢失是命名不规范的直接后果。
3. **多 bundle 抢文件扩展名**：同一扩展名（如 `.ts`）被多个 bundle 认领，TextMate 静默取第一个匹配，造成 tab trigger 或高亮错乱；排查需要在状态栏手动切换语言确认。
4. **oniguruma 与其他引擎的差异**：TextMate 和 VS Code 均用 oniguruma 正则库，但某些 lookbehind 写法在 PCRE 或 RE2 里静默失效，把 grammar 移植到 Neovim 的 tree-sitter 时需要重新验证每条规则。

## 适用 vs 不适用场景

**适用**：
- 为任何语言写可复用的 syntax grammar（目标是 VS Code / Sublime / TextMate 三端共享）
- 需要轻量 macOS 编辑器且不想装插件管理器的场景
- 学习"scope 驱动的主题 / 快捷键"设计模式，再去理解 Neovim 的高亮系统

**不适用**：
- 需要 LSP 补全、调试器集成、Git diff 内联等 IDE 级功能——VS Code / Neovim 更合适
- 团队统一配置、远程开发——TextMate 无 Remote SSH 扩展
- Windows / Linux 用户——TextMate 是 macOS 专属

## 历史小故事（可跳过）

- **2004 年**：Allan Odgaard 发布 TextMate 1.0，Bundle 系统和 Tab trigger 让它成为 Rails 社区标配（DHH 在视频里用的就是它）
- **2008 年**：Sublime Text 2 上线，大量借鉴 `.tmbundle`，连文件格式都直接兼容，TM 用户零成本迁移
- **2011-2012 年**：TextMate 2 开发进度缓慢被社区催更；2012 年 Allan 在社区压力下以 GPL v3 开源了 TextMate 2 的代码
- **2015 年**：VS Code 发布，采用 `vscode-textmate` 库解析 `.tmLanguage`；TextMate grammar 生态（数千个仓库）瞬间被整个继承
- **2017 年起**：Neovim + tree-sitter 开始用结构化解析替代正则 grammar，但仍保留 TextMate scope 名作为高亮主题的接口层

## 学到什么

1. **格式就是护城河**：TextMate 的 grammar 格式因为被 Sublime Text 采用而扩散，因为被 VS Code 采用而成为标准——一个开放格式比闭源产品更长寿
2. **正则 + scope 命名规范**，这两件事组合在一起，让语言无关的"理解代码"成为可能
3. **Bundle 的可插拔设计**比当时大多数编辑器早了 5 年；Shell 管道作为扩展机制，让任何命令行工具都能接入编辑器
4. **开源时机很重要**：2012 年开源已经错过最佳窗口，但 grammar 格式早已"开源"到每一个兼容编辑器里

## 延伸阅读

- 官方 manual（tmLanguage 完整规范）：[macromates.com/manual/en/language_grammars](https://macromates.com/manual/en/language_grammars)
- vscode-textmate（VS Code 使用的 tmLanguage 解析器，TypeScript 实现）：[github.com/microsoft/vscode-textmate](https://github.com/microsoft/vscode-textmate)
- TextMate grammar 编写教程：[Flight Manual — Atom](https://flight-manual.atom.io/hacking-atom/sections/creating-a-grammar/)（Atom 已停更但教程仍有效）
- [[vscode]] —— 直接继承了 tmLanguage 体系
- [[neovim]] —— 用 tree-sitter 替换 tmLanguage，但 scope 接口层兼容

## 关联

- [[vscode]] —— 采用 vscode-textmate 库，完整兼容 .tmLanguage grammar 生态
- [[neovim]] —— tree-sitter 解析比正则快，但主题接口仍映射到 TextMate scope 名
- [[vim]] —— 同时代竞品，靠 Vimscript 语法文件而非 PList；两套体系互不兼容
- [[emacs]] —— 另一条路：用 Font-Lock + major-mode 而非 bundle 分发
- [[atom]] —— GitHub 2014 年发布，直接复用 TextMate grammar 格式，后被 VS Code 取代
- [[monaco-editor]] —— VS Code 背后的编辑器组件，通过 vscode-textmate 支持 tmLanguage
- [[xi-editor]] —— Google 工程师的后继尝试，最终放弃但留下了大量架构讨论

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atom]] —— Atom — 已归档的 Web 编辑器先驱
- [[emacs]] —— GNU Emacs — Lisp 自文档编辑器
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[vim]] —— Vim — 模态编辑器之父
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳
- [[xi-editor]] —— xi-editor — Rope + CRDT 驱动的实验性编辑器

