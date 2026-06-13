---
title: Kakoune — 面向对象的模态编辑器：先圈地，再动刀
来源: https://kakoune.org/why-kakoune/why-kakoune.html
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 是什么

**Kakoune**（作者 Maxime Coste / mawww）是一类特殊的**模态代码编辑器**：它继承 Vi 的「按键即编辑语言」传统，却把核心抽象从「光标」升级成**选区（selection）**，并把语法从 Vim 的 **动词-名词（verb-object）** 翻转为 **名词-动词（object-verb）**。官网文章 [*Why Kakoune — The quest for a better code editor*](https://kakoune.org/why-kakoune/why-kakoune.html) 系统阐述了这套哲学；配套 [design.asciidoc](https://github.com/mawww/kakoune/blob/master/doc/design.asciidoc) 则把它落实为七条工程原则。

日常类比一：**改合同**。Vim 像律师先喊「删除！」再指条款——`dw` 是 delete + word，指错了一整段就没了，只能 `u` 撤销重来。Kakoune 像用荧光笔**先圈出要改的段落**，确认高亮范围对了，再按 `d` 删除；圈错了一个词，用 `BH` 把多圈的部分从选区里减掉，不必推倒重来。

日常类比二：**批处理 Excel**。你想把表里所有 `foo` 改成 `bar`：传统编辑器有专门的「全局替换」对话框；Kakoune 没有这条捷径，而是 `%` 选中全文 → `sfoo` 在每个匹配处生成一个选区 → `cbar` 同时替换——像先给每个单元格打上标记，再一次性填值。**多选区不是附加功能，而是交互的中心原语**。

Helix、部分 Neovim 插件思路都直接或间接继承了 Kakoune 的「选区优先 + 多光标」模型，因此读这篇 2020 年的宣言，有助于理解下一代终端编辑器为何长得不像经典 Vim。

## 为什么值得学

程序员职业生涯以十年计，花几周掌握编辑/nav 工具的投资回报率很高——原文第一个论点。更具体地说，不理解 Kakoune 哲学会导致：

- 把 Helix 的 `wd` 误当成 Vim 键位打错——顺序颠倒背后是**先预览、后执行**的安全模型
- 在 Kakoune 里找 `:s/foo/bar/g` 全局替换——设计上故意用选区组合替代专用命令
- 低估「移动 = 选中」统一语义带来的可组合性——`w` 不是跳光标，是扩展选区到下一词

## Vim 与 Kakoune：两套编辑语法

### 模态编辑作为语言

Vi 家族把编辑建成**可组合语言**：`d`（delete）+ `w`（word）= 删一个词；`y` + `i` + `b` = 复制括号内文本。动词少、名词（文本对象）丰富，组合表达结构级意图，而不是重复点鼠标。

| 维度 | Vim / Vi | Kakoune |
|------|----------|---------|
| 基本语序 | 动词 → 对象（`dw`） | 对象 → 动词（`wd`） |
| 移动语义 | 移动光标与选中分离 | **移动即选中** |
| 反馈时机 | 整句命令结束后才看到结果 | **每一步**高亮当前选区 |
| 多光标 | 插件或后期补丁 | **一等公民**，无单独「全局替换」 |
| 改 buffer | normal / insert / ex / 脚本多条路径 | **仅 normal + insert** 改文本 |

### 交互性：在暗处编辑 vs 开着灯编辑

Vim 的 `5dw`：按完才知道删了五个词还是六个。Kakoune 的 `5W`：立刻看到五个词被高亮；若多选一个，`<a-B>` 或 `BH` 收缩选区，再 `d`。原文称之为修复 Vi **lack of interactivity** 的核心手段——配合 **object-then-verb**，让「看清再改」成为默认路径。

### 可预测性：正交积木

设计文档强调 **orthogonality（正交）** 与 **simplicity**：

- `d` **只做一件事**：删除当前选中的内容，没有隐藏的 `x` 变体
- `%` **只做一件事**：选中整个 buffer
- `s` **只做一件事**：对当前选区内的正则匹配再建子选区

复杂操作 = 简单命令链，而非新增专用子命令。因此 `d` 在 Kakoune 里**就是**「删除选中文本」这条命令本身，不是绑定到某个抽象 editing API 的快捷键——normal mode **就是**编辑语言，不是另一层 DSL 的皮。

## 核心概念

### 1. Selection（选区）：真正的「编辑对象」

选区是有向、** inclusive ** 的字符区间，两端为 **anchor（锚点）** 与 **cursor（光标端）**。扩展选区时锚点固定、光标移动；普通移动则两端一起动。缓冲区里**始终至少有一个选区**，且至少覆盖一个字符（锚点与光标可重合为单点）。

这就是「面向对象」的含义：你操作的不是抽象「文件」，而是**当前选中的文本对象集合**；动词（`d`/`y`/`c`/`|`）永远作用于选区。

### 2. 移动 = 选中

- `w`：从当前位置选中到下一词首（不是 invisible 跳过去）
- `W`（大写）：**扩展**选区至下一词，保留已选部分
- `(`：选中配对括号内内容（text object）

大写命令普遍表示「在现有选区上扩展」，小写则常替换/重定义选区——习惯记住后，预览路径与最终操作一致。

### 3. Multiple Selections（多选区）

获得多选区的典型路径：

1. `s<regex>`：在当前每个选区内，为每个匹配创建子选区
2. `S<regex>`：按正则**拆分**选区
3. `Alt+s`：对当前选区按行拆分
4. `|` / `$`：管道或 shell 过滤后保留/丢弃选区

之后 `c`、`d`、`i`、`|sort` 等**同时**作用于所有选区。没有 `:substitute` 全局替换——`%sfoo cbar` 是 `%` + `sfoo` + `cbar` 的组合，而非专用 Ex 命令。

### 4. 模式分工（正交）

| 模式 | 职责 |
|------|------|
| Normal | 操纵选区与选区内容（编辑语言本体） |
| Insert | 向 buffer 插入字符 |
| Prompt (`:`) | 打开文件、设选项、执行非编辑命令 |

修改 buffer 文本不走命令模式脚本——与 Vim 的 `:s`、`normal @q` 等多通道形成对比。扩展靠 `%sh{...}`、Unix 管道和 socket，而非内嵌脚本 VM。

### 5. Unix 公民与 Client-Server

- `|`：把选区内容 pipe 给 shell 命令，输出写回选区
- `$`：对选区跑 shell，保留退出码为 0 的选区
- `kak -p`：从外部向 session 喂命令
- 多 client 连同一 server：窗口管理交给 tmux / 窗口管理器，编辑器只管文本

设计文档明确：**不做线程、不做二进制插件、不做内嵌脚本语言**——异步任务用 fifo buffer + 后台 shell（如 `make`、`grep`）完成。

## 代码示例

### 示例 1：全局把 `foo` 换成 `bar`（无 `:substitute`）

假设 buffer 为：

```text
foo = 1
bar = foo + 1
# foo comment
```

在 Kakoune normal mode 中的键序（空格仅为可读性，实际无空格）：

```text
%sfoo cbar <Esc>
```

分步理解：

| 键 | 效果 |
|----|------|
| `%` | 选中整个 buffer（一个选区覆盖全文） |
| `sfoo` | 在全文选区内，每个 `foo` 子串各成一个选区（此处 3 个） |
| `cbar` | 对所有选区执行 change，统一替换为 `bar` |
| `<Esc>` | 回到 normal mode |

等价于「先标记所有目标，再一次改写」——与对话框式全局替换不同，**中间任意步都能看见高亮**，可在 `d` 之前用 `,`（缩小选区）或 `&`（对齐）等原语微调。

若只想替换字符串字面量中的 `foo`，可先 `s"` 选中引号内，再 `sfoo`，避免误伤注释——组合粒度由你控制，不靠正则开关标志位。

### 示例 2：`snake_case` ↔ `camelCase`（多选区 + 子选区）

原文示例：选中标识符 `my_long_name`，再：

```text
w s_ d ~ 
```

| 键 | 效果 |
|----|------|
| `w` | 选中当前词 `my_long_name` |
| `s_` | 在词内每个 `_` 处建子选区 |
| `d` | 删除所有 `_` 选区 |
| `~` | 对剩余选区（下划线后首字母）切换大小写 → `myLongName` |

反向（camelCase → snake_case）原文键序：

```text
w s[A-Z] ` i_ 
```

- `s[A-Z]`：子选区匹配大写字母
- `` ` ``：转小写
- `i_`：在选区前插入下划线

整段可录宏复用到任意标识符——**结构相同、文本不同**的重复编辑，正是编辑语言要解决的场景。

### 示例 3：交换函数参数 `func(arg2, arg1)`

```text
( S,  
```

| 键 | 效果 |
|----|------|
| `(` | 选中括号内 `arg2, arg1` |
| `S,` | 按逗号拆成两个选区 |
| `<space>`（rotate） | 交换各选区内容顺序 |

无需结构化 AST——纯文本原语完成重排。与 AST 工具（如 ast-grep）可互补：简单重排用选区，语义级改写用外部管道。

### 示例 4：与外部命令组合（Unix 管道）

选中若干行后排序去重：

```text
|sort -u
```

Kakoune 把选区文本作为 **stdin** 传给 `sort -u`，stdout 写回选区。设计哲学：**编辑器不做排序**，把排序交给四十年历史的 Unix 工具；正交性要求功能不重叠。

## 可发现性与学习曲线

键盘驱动工具常因「没有菜单」而难上手。Kakoune 用两套机制补偿：

1. **Prompt 补全**：输入 `:` 即列出命令；参数位自动提示 buffer 名、文件名、固定枚举
2. **Auto-information**：按 `g` 等待第二键时，信息框列出所有 `goto` 子命令；可配置为每次 normal 按键后显示刚执行命令的说明

另全面采用 **fuzzy completion**（子序列匹配，非仅前缀），insert 与 prompt 均可用——降低背键表成本，但**学习曲线仍陡**，原文亦坦诚需数周投入。

## 与 Vim 的效率对比

[mawww/golf](https://github.com/mawww/golf) 收录 Kakoune 与 Vim 在 [vimgolf](http://www.vimgolf.com/) 题目上的击键对比：多数题目 Kakoune 用更**地道（idiomatic）** 的选区组合胜出，而非靠冷门快捷键。例如换行拆分常用 `` ` `` 等价于 `S^`，因太常见而独占一键。

设计目标原文表述为：**interactive, predictable, and fast at the same time**——三者通常被认为不可兼得，Kakoune 押注多选区 + 反转语法可以同时满足。

## 设计文档中的工程约束

摘自 `doc/design.asciidoc`，与哲学一致：

- **Limited scope**：不做窗口管理、不做「聪明」到替用户决策的魔法；提供 dumb 版本让用户组合
- **No threading**：交互路径必须「对用户即时」；异步交给外部进程 + fifo
- **No binary plugins / no embedded scripting**：避免第二套 API 面；`%sh{}` + 环境变量足够表达 completer、linter、formatter
- **Normal mode is the language**：脚本与交互共用同一套 normal 键序，保证交互语言足够表达缩进 hook 等复杂场景

## 影响与定位

- **2013+**：Kakoune 公开；设计文档成为编辑器设计讨论常引文献
- **Helix**：公开声明借鉴 noun-verb 顺序、多选区、选区优先交互
- **Neovim 生态**：部分插件模拟 Kakoune 选区模型，但非内核一等公民

Kakoune 用户量远小于 Vim/Neovim，但**概念影响力**大于市场份额——类似 Smalltalk 对 OOP 语言的影响路径。

## 何时适合 / 不适合

**适合**：

- 愿意把编辑当成可组合语言，享受「结构级一次操作」
- 重度终端 + tmux 工作流，需要 client-server 多窗口同 session
- 偏好 Unix 管道组合，而非 IDE 内置所有功能

**不适合**：

- 需要开箱即用 GUI、文件树、调试器一体化
- 依赖 Vimscript 插件生态且不愿重写为外部工具
- 期望 `:substitute`、Vim 宏语法零成本迁移

## 与相关笔记

- [[kakoune]] —— 项目向笔记：安装、client-server、`kak-lsp` 配置
- [[helix]] —— Rust 实现，内置 Tree-sitter + LSP，继承本哲学
- [[vim]] —— 经典 verb-object 模态编辑对照
- [[language-server-protocol-spec]] —— Kakoune 通过 `kak-lsp` 外接 LSP，本身不内置
- [[monaco-editor]] —— GUI 嵌入式路线，设计假设截然不同

## 参考资料

- 宣言原文：[Why Kakoune](https://kakoune.org/why-kakoune/why-kakoune.html)（Maxime Coste, 2020）
- 设计原则：[doc/design.asciidoc](https://github.com/mawww/kakoune/blob/master/doc/design.asciidoc)
- 击键对比：[mawww/golf](https://github.com/mawww/golf)
- 官方站：[kakoune.org](https://kakoune.org)
