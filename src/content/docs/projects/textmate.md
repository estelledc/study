---
title: TextMate — macOS 经典编辑器与语法定义的缔造者
来源: 'https://github.com/textmate/textmate'
日期: 2026-06-06
分类: CLI
子分类: 编辑器与 IDE
难度: 中级
---

## 是什么

**TextMate** 是 Allan Odgaard 于 2004 年为 macOS 开发的图形文本编辑器，以其 **Bundle 插件系统**和 `.tmLanguage` 语法定义格式著称。

日常类比：想象一个乐高积木套装——TextMate 的 Bundle 就是"功能积木块"，每块独立、可拔插，你可以给 Ruby 装一块、给 Markdown 装一块，互不干扰；而 `.tmLanguage` 就是乐高说明书里描述"哪种颜色对应哪种零件"的语言——你用正则表达式告诉编辑器"关键字是蓝色、字符串是绿色"。

这套格式后来被 Sublime Text（2008）、Atom（2014）、VS Code（2015）直接采用，成为代码语法高亮的**事实标准**，影响了全球数亿开发者。TextMate 本身的 star 数约 1.5 万，但它衍生出的语法定义生态（tmLanguage 仓库）已是数以千计。

核心组成：

- **Bundle**：包含语言支持、命令、宏、代码片段（snippet）的目录包，可即插即用
- **Scope 命名体系**：层级化的 `source.ruby`、`keyword.control` 等标识符，让语法高亮与主题解耦
- **Tab trigger**：输入短缩写按 Tab 展开为代码模板，配合 `${1:placeholder}` 多光标占位

## 为什么重要

不理解 TextMate 的设计，以下这些现象都没法解释：

- 为什么 VS Code 有几千个语言扩展都用同一套"`.tmLanguage`"格式——这是 TextMate 遗产
- 为什么在 VS Code 里换主题（Dracula / One Dark）所有语言同时生效——Scope 命名系统让主题与语法解耦
- 为什么 Sublime Text、Atom 能在短时间内支持几十种语言——直接复用了 TextMate 的 Bundle
- 为什么代码片段（snippet）要用 `${1:name}`、`${2:type}` 这种奇特语法——这是 TextMate 发明并被后来者沿用的占位符约定

## 核心要点

1. **`.tmLanguage`：基于正则的层次化语法定义**

   TextMate 用 PList（属性列表）格式描述语法规则：每个规则有 `match`（单行匹配）或 `begin`/`end`（跨行匹配）正则，加一个 `name` 字段指定 scope（如 `keyword.control.ruby`）。规则可以通过 `repository` 互相引用，形成递归结构——类比一本字典，定义词 A 时可以引用词 B，词 B 又可以引用词 A，层层展开。

   最小示例——定义 Python 的 `pass` 关键字：

   ```json
   {
     "match": "\\bpass\\b",
     "name": "keyword.control.python"
   }
   ```

   Scope 名字采用"从粗到细"的点分层级：`keyword` → `keyword.control` → `keyword.control.python`，主题只要能匹配前缀就能着色。

2. **Scope 命名体系：主题与语法解耦**

   TextMate 最聪明的设计决策是把**语法分析**和**视觉呈现**彻底分开。语法定义只管"这个 token 是什么类型"，主题文件只管"这个类型应该什么颜色"。只要两边都遵守同一套 scope 命名规范（`keyword.*`、`string.*`、`comment.*`），一个主题就能给任何语言着色，一段语法也能配任何主题。

   这是软件工程里"协议优于实现"的经典例子——textmate 制定的 scope 规范，20 年后仍在约束所有编辑器的主题作者。

3. **Bundle：可插拔的语言支持单元**

   一个 Bundle 是一个目录，内含：`Syntaxes/`（语法文件）、`Snippets/`（代码片段）、`Commands/`（Shell 命令）、`Macros/`（录制的键盘操作）、`Templates/`（项目模板）。每个 Bundle 完全独立，安装即启用，删除即禁用。

   TextMate 2 的 Bundle 系统还支持 **Tab trigger** 上下文感知：同一个缩写 `for` 在 Python 文件和 JavaScript 文件里展开为不同模板，因为触发器绑定了 scope 选择器（如 `source.python`）。

## 实践案例

### 案例 1：为小众语言从零编写 tmLanguage，发布为 VS Code 扩展

假设你要为 Zig 语言写语法高亮。步骤如下：

```json
{
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "Zig",
  "scopeName": "source.zig",
  "patterns": [
    { "include": "#keywords" },
    { "include": "#strings" },
    { "include": "#comments" }
  ],
  "repository": {
    "keywords": {
      "patterns": [{
        "name": "keyword.control.zig",
        "match": "\\b(const|var|fn|if|else|while|for|return|pub|usingnamespace)\\b"
      }]
    },
    "strings": {
      "name": "string.quoted.double.zig",
      "begin": "\"",
      "end": "\""
    },
    "comments": {
      "name": "comment.line.zig",
      "match": "//.*$"
    }
  }
}
```

在 VS Code 的 `package.json` 里注册：

```json
"contributes": {
  "grammars": [{
    "language": "zig",
    "scopeName": "source.zig",
    "path": "./syntaxes/zig.tmLanguage.json"
  }]
}
```

**关键洞察**：VS Code 扩展里 `contributes.grammars` 就是直接包装了一个 tmLanguage 文件，TextMate 的格式一行没改，只是外面套了 npm 包装。

### 案例 2：在 TextMate 2 里用 Shell 命令 Bundle 实现自定义构建

TextMate 的 Command Bundle 可以把 Shell 脚本绑定到快捷键，并把输出解析为"可点击错误行跳转"。

在 `bundle.tmCommand` 里配置：

```xml
<key>command</key>
<string>
#!/bin/bash
cd "$TM_PROJECT_DIRECTORY"
ninja 2>&1 | sed 's|^\(.*\):\([0-9]*\):\([0-9]*\): error: \(.*\)|$TM_PROJECT_DIRECTORY/\1\t\2\t\3\t\4|'
</string>
<key>input</key>
<string>none</string>
<key>output</key>
<string>showAsTooltip</string>
<key>keyEquivalent</key>
<string>@b</string>
```

按下 `⌘B`，TextMate 执行 ninja，把错误行转成 `文件\t行\t列\t消息` 格式，TextMate 自动把它渲染成可点击的跳转链接。整个构建系统不需要任何插件市场，一个 Shell 脚本搞定。

### 案例 3：把遗留 .tmbundle 迁移到 VS Code 扩展

老项目有一个 `MyLang.tmbundle` 目录结构：

```
MyLang.tmbundle/
  Syntaxes/
    MyLang.tmLanguage      ← 旧格式 PList XML
  Snippets/
    for-loop.tmSnippet
```

迁移步骤：

```bash
# 1. 把 PList XML 转为 JSON（VS Code 更喜欢 JSON）
npx plist-to-json MyLang.tmbundle/Syntaxes/MyLang.tmLanguage \
  > my-ext/syntaxes/mylang.tmLanguage.json

# 2. 读取 tmSnippet 内容，转为 VS Code snippets JSON
# tmSnippet 里 content 字段就是 snippet 模板，${1:placeholder} 语法完全兼容
```

几乎不需要修改规则本身——TextMate 的 scope 名字、占位符语法、begin/end 模式在 VS Code 里全部直接可用。**迁移成本主要来自格式转换（XML → JSON），不来自语义差异**。

## 踩过的坑

1. **tmLanguage 正则只能逐行匹配**——不能跨行捕获，多行字符串或注释必须用 `begin`/`end` 双段模式处理，否则第二行开始高亮断裂。初学者最常犯的错是用 `match` 写了一个含 `\n` 的正则，发现完全不生效。

2. **scope 命名不规范导致主题失效**——自定义 grammar 把所有 token 挂在 `keyword.*` 下，切换 Dracula、One Dark 等主题时大片文字变成同色无差异。正确做法是严格区分 `keyword.control`（控制流）、`keyword.operator`（运算符）、`entity.name.function`（函数名）等子类。

3. **Bundle 冲突难排查**——同一文件扩展名被多个 bundle 认领时，TextMate 静默取第一个匹配，造成 tab trigger 或语法高亮错乱。排查时需手动在状态栏切换语言，或检查 `~/Library/Application Support/TextMate/Bundles/` 里的优先级顺序。

4. **在 VS Code 迁移时低估 oniguruma 与其他引擎的差异**——TextMate 和 VS Code 都用 oniguruma 正则库，但某些反向预查（lookbehind）在 oniguruma 里合法，把 grammar 移植到基于其他引擎的工具时会静默失效。迁移前先用 oniguruma 测试套件验证所有正则。

## 适用 vs 不适用场景

**适用：**

- 为新语言编写 VS Code / Sublime Text / Neovim 语法高亮（tmLanguage 是通用格式）
- macOS 原生开发工作流，需要深度 Bundle 集成（Shell 命令、宏录制）
- 快速把 `.tmbundle` 迁移到 VS Code 扩展，理解 `contributes.grammars` 结构
- 学习"正则状态机"如何描述编程语言结构，为写 LSP 服务器或解析器打基础

**不适用：**

- 需要跨平台（Windows / Linux）的团队——TextMate 只有 macOS 版
- 大型 IDE 功能（重构、调试器、Git 图形界面）需求——TextMate 刻意保持轻量，不如 JetBrains 系全功能 IDE
- 需要 Tree-sitter 或 LSP 驱动的语义级高亮——tmLanguage 是正则级，Tree-sitter 能做到 AST 级别着色，两者定位不同

## 历史小故事（可跳过）

- **2004**：Allan Odgaard 独立发布 TextMate 1.0，凭借 Bundle 系统和 snippet 功能迅速成为 macOS Ruby on Rails 社区的标配编辑器
- **2006**：`Snippets` + Tab trigger 的设计被 Sublime Text 和 Espresso 等编辑器竞相借鉴，"Tab 展开代码片段"成为桌面编辑器的标准功能
- **2008**：Sublime Text 发布，直接兼容 TextMate 的 Bundle 格式，宣告 tmLanguage 成为跨编辑器通用语言
- **2012**：在社区长达数年的压力下，TextMate 2 以 GPL v3 开源，仓库在 GitHub 获得大量关注
- **2014/2015**：Atom 和 VS Code 相继发布，两者均内置 TextMate grammar 支持；VS Code 今日有数千个语言扩展，绝大多数基于 TextMate 语法格式
- **现在**：TextMate 本身的活跃用户已远少于 VS Code，但 textmate grammar 格式作为"代码高亮协议"的生命力反而更强，几乎所有主流编辑器都在维护它

## 学到什么

- **协议的生命力超过实现**：TextMate 编辑器本身的市场份额早已被超越，但它制定的 scope 命名规范和 Bundle 格式成为了整个行业的标准——好的抽象设计能活过具体产品
- **正则状态机足以描述大多数语法**：tmLanguage 用正则 + begin/end 嵌套就覆盖了几百种语言的高亮需求；语言工具不一定需要完整 parser，"够用的精度"才是实用工程的目标
- **解耦是可维护性的根本**：把"语法是什么"（grammar）与"显示成什么颜色"（theme）分开，让两个维度独立演化，这是 TextMate 最有价值的架构决策
- **开源时机影响生态**：TextMate 2012 年才开源，此时 Sublime Text 已崛起；若 2006 年开源，今天的格局可能截然不同

## 延伸阅读

- [TextMate 官方 Bundle 编写指南](https://macromates.com/manual/en/language_grammars)
- [TextMate Language Grammars — Scope 命名规范](https://macromates.com/manual/en/scope_selectors)
- [VS Code Syntax Highlight Guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)（说明如何在 VS Code 中使用 tmLanguage）
- [Oniguruma 正则库文档](https://github.com/kkos/oniguruma/blob/master/doc/RE)（TextMate、Ruby 使用的正则引擎）
- [[vscode]] — VS Code 直接继承了 tmLanguage 语法格式
- [[neovim]] — Neovim 通过 nvim-treesitter 和 vim-textmate-colorscheme 与 TextMate 生态交互

## 关联

- [[vscode]] —— VS Code 内置 tmLanguage 支持，数千个语言扩展直接使用 TextMate grammar 格式
- [[neovim]] —— Neovim 可加载 tmLanguage 文件，两者在语法高亮层面共享同一套格式
- [[vim]] —— Vim 生态有多个插件实现 TextMate Bundle 兼容，Tab trigger 灵感来自 TextMate
- [[emacs]] —— Emacs 通过 tree-sitter 和第三方包支持 tmLanguage 格式导入
- [[atom]] —— Atom 由 GitHub 开发，内置 TextMate grammar 兼容，后并入 VS Code 生态
- [[monaco-editor]] —— Monaco（VS Code 浏览器版内核）使用 vscode-textmate 解析 tmLanguage 格式
- [[xi-editor]] —— Xi Editor 在设计阶段参考了 TextMate 的语法定义机制

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

