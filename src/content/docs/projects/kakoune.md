---
title: Kakoune — 多光标优先模态编辑器
来源: 'https://github.com/mawww/kakoune'
日期: 2026-06-06
分类: CLI
子分类: 编辑器与 IDE
难度: 初级
---

## 是什么

Kakoune（简称 `kak`）是一款**把"多选区"当作一等公民**的模态代码编辑器。日常类比：Vim 像一位外科医生——你先告诉他"用刀（动词）"，再指向"哪里（名词）"；Kakoune 则像圈地建房——你**先圈出地盘（选区）**，再决定在上面盖什么（操作），每一步圈地都实时在屏幕上高亮。

作者 Maxime Coiffard（GitHub: mawww）2011 年前后把它当成"对更好编辑器的个人实验"开源，至今累计 10,900+ stars。核心理念一句话：**noun-verb，先选后改**，与 Vim 的 verb-noun（先动词后名词）反过来。

Kakoune 在终端下运行，无 GUI，采用 Client-Server 架构：一个后台 server 管理 session，多个 client（终端窗口）连接同一 session 共享寄存器和撤销历史。

## 为什么重要

不理解 Kakoune 的设计，下面这些事难以解释：

- 为什么"先选中、再操作"能让每一步都**有实时视觉反馈**，而 Vim 的 `d3w` 要等按完才知道删了什么
- 为什么 Helix 等下一代编辑器直接把多选区和 noun-verb 顺序照搬——Kakoune 是概念原型
- 为什么一个"不支持二进制插件"的编辑器能在 vimgolf 竞赛里常常以更少击键数胜出
- 为什么 Unix 管道思想可以深度融进编辑器操作——Kakoune 的 `|` 命令把选区内容直接管道给外部程序

## 核心要点

Kakoune 设计的三根支柱：

1. **选区优先（noun-verb）**：任何操作都从"先确定选区"开始。比如想删三个词——先按 `3w` 选中三个词（屏幕立刻高亮），再按 `d` 删除。这与 Vim 的 `d3w`（先说删、再说三个词）反过来。类比：先框好要剪的报纸，再拿剪刀；不是拿起剪刀后再盲猜剪哪里。

2. **多选区作为核心原语**：Kakoune 里"一次操作多处"不是插件，是内置原语。`s` 在当前选区内选中所有正则匹配，得到多个选区；`S` 按正则拆分选区；`%s` 选中全文所有匹配。之后的 `c`（替换）/ `i`（插入）/ `d`（删除）同时作用于所有选区。类比：一次用橡皮擦擦掉多处铅笔痕，而不是一次次找一次次擦。

3. **Unix 组合与正交设计**：Kakoune 刻意不内置排序、格式化、代码补全等功能，而是通过 `|` 把选区管道给外部命令（`sort`、`jq`、`clang-format` …），再把输出写回选区。每个功能模块彼此独立（正交），组合即强大。

## 实践案例

### 案例 1：多选区批量重命名变量

场景：把一段代码里所有 `count` 替换成 `total`。

```
# 进入 Kakoune，打开文件后在 normal mode：
%           # 选中整个 buffer
s           # 输入正则 count<Enter>
            # 所有 count 被高亮为独立选区
c           # 同时进入 insert 模式，替换所有选区
total<Esc>  # 输入新词，退出 insert 模式
```

**逐步解释**：
- `%` 选中全文，得到一个覆盖全文的大选区
- `s count<Enter>` 在大选区内搜索 `count`，把所有匹配变成独立选区
- `c` 删除所有选区内容并同时进入 insert 模式
- 输入 `total` 后 `<Esc>` 退出，所有位置同步写入

整个流程无需宏、无需确认对话框，视觉反馈全程实时。

### 案例 2：Unix 管道整合——对选区排序去重

场景：buffer 里有若干行乱序的 import 语句，要排序并去掉重复。

```
x           # 展开选区到完整行
%           # 或手动用 x 多次，选中目标行范围
| sort -u   # 管道给 sort -u，结果直接写回选区
```

**逐步解释**：
- `x` 把选区扩展到包含完整行（含换行符）
- `|` 后接 shell 命令：Kakoune 把选区文本作为 stdin 传给 `sort -u`
- `sort -u` 排序 + 去重，stdout 写回原选区位置
- 整个过程不需要离开编辑器、不需要临时文件

### 案例 3：Client-Server 多窗口工作流

Kakoune 用 Client-Server 架构支持多终端窗口协作同一 session：

```bash
# 终端 1：启动 server 并打开文件
kak myfile.py
# 此时自动创建一个名为随机字符串的 session

# 终端 2：连接同一 session（查 session 名）
kak -l               # 列出所有 session
kak -c <session>     # 以新 client 连接

# 在 tmux 中更常见的做法：
tmux new-window "kak -c $(kak -l | head -1)"
```

两个 client 共享同一 buffer、同一撤销历史、同一寄存器（yank 内容）。可以在一个窗口编辑、另一个窗口实时查看同文件的不同位置——没有文件锁，没有冲突。

## 踩过的坑

1. **选区方向陷阱**：选区有「锚点」和「游标」之分，方向影响某些操作的结果。用 `<a-;>`（Alt + 分号）可翻转选区方向；用 `<a-:>` 确保选区方向向前，调试操作前先确认方向。

2. **user autoload 遮蔽 runtime**：一旦创建 `$HOME/.config/kak/autoload/` 目录，系统 `runtime/autoload/` 即全部失效（包括内置语法高亮、filetype 检测）。修复：在 user autoload 里加一条软链接指回系统 autoload。

3. **插件生态与 Vim 不兼容**：Kakoune 刻意不支持 Vimscript 和二进制插件，所有扩展通过 `%sh{...}` 或 socket 接口实现。迁移 Vim 插件需要重写逻辑，大部分没有现成移植版。

4. **LSP 依赖外部守护进程**：语言服务器协议支持需安装 `kak-lsp`（Rust 编写的独立进程），配置路径与 Neovim 的 `nvim-lspconfig` 完全不同，调试时需同时查 kak-lsp 日志和 Kakoune 的 `*debug*` buffer。

## 适用 vs 不适用场景

**适用**：
- 需要频繁做"同时改多处相同模式"的编辑任务（批量重命名、批量格式调整）
- 熟悉终端、愿意用 tmux/zellij 管理多窗口的开发者
- 喜欢 Unix 哲学：编辑器只做编辑，其余组合外部工具
- 已经用过 Vim 但觉得"verb-noun"操作反直觉、想要即时视觉反馈的人

**不适用**：
- 需要完整 IDE 功能（内置调试器、项目管理器、文件树）——这些 Kakoune 刻意不做
- 重度依赖 Vim 插件生态（NERDTree、fugitive、coc.nvim 等）——无直接移植
- Windows 原生环境——官方不支持 Windows（仅 Linux / macOS / Cygwin）
- 习惯 GUI 编辑器的初学者——纯终端学习曲线陡

## 历史小故事（可跳过）

- **2011 年前后**：mawww（Maxime Coiffard）在使用 Vim 时不满意 verb-noun 没有即时反馈，开始用 C++ 写"实验性代码编辑器"，GitHub 仓库描述至今还是 "mawww's experiment for a better code editor"。
- **2013 年**：Kakoune 公开发布，设计文档（`doc/design.asciidoc`）同步发布，明确写下正交性、有限范围、可组合性等七条原则，这份文档成为此后讨论编辑器设计时的常引文献。
- **2019-2020 年**：Helix 编辑器项目启动，公开表示直接借鉴了 Kakoune 的 noun-verb 顺序和多选区设计，并加入了 Tree-sitter 语法解析和内置 LSP 支持——相当于把 Kakoune 的哲学和现代工具链做了整合。
- **至今**：Kakoune 维持"小而精"路线，核心开发者仍是 mawww，社区以插件脚本（`.kak` 文件）和外部工具为主，不引入大型依赖，C++ 代码库仍可用单条 `make` 编译。

## 学到什么

1. **操作顺序改变体验**：noun-verb vs verb-noun 只是顺序不同，但 noun-verb 每一步都有可见反馈，认知负荷显著降低——这提示 API / 工作流设计时"让用户先看到对象再触发动作"往往更直觉。
2. **"不做什么"是设计决策**：Kakoune 刻意拒绝二进制插件、内置脚本引擎、LSP——有限范围（limited scope）使得核心保持可审计、可维护，通用性靠 Unix 组合实现。
3. **选区作为抽象层**：把光标从"一个点"升维成"一段范围"，操作对象从点变成集合，就能天然支持多光标、管道输入输出——这是 Kakoune 最核心的模型创新。
4. **影响力不等于市场份额**：Kakoune 用户远少于 Vim/Neovim，但它的设计思想被 Helix 等项目广泛采用，说明小项目也能通过清晰的设计原则产生跨代影响。

## 延伸阅读

- 官方设计文档：[Kakoune design.asciidoc](https://github.com/mawww/kakoune/blob/master/doc/design.asciidoc)（七条原则逐一解释，必读）
- 官网教程：[kakoune.org](https://kakoune.org)（包含交互式 tutor，启动后运行 `:tutor`）
- vimgolf 对比：[mawww/golf](https://github.com/mawww/golf)（Kakoune 解法 vs Vim 最优解，直观感受击键差距）
- [[helix]] —— 借鉴 Kakoune noun-verb + 内置 LSP 和 Tree-sitter 的下一代终端编辑器
- [[neovim]] —— Vim 的现代分支，verb-noun 路线，生态最大
- [[monaco-editor]] —— VS Code 的浏览器编辑器内核，GUI 路线，与 Kakoune 设计哲学对比鲜明

## 关联

- [[helix]] —— 直接借鉴 Kakoune 多选区与 noun-verb 设计，加入内置 LSP
- [[neovim]] —— 同为终端模态编辑器，verb-noun 路线，插件生态更丰富
- [[monaco-editor]] —— GUI 嵌入式编辑器，代表与 Kakoune 截然不同的设计路线
- [[nix]] —— 同样坚持"单一职责 + Unix 组合"哲学的工具，与 kak 搭配做声明式开发环境
- [[ast-grep]] —— 基于语法树的代码搜索改写工具，可作为 Kakoune `|` 管道的外部命令之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[micro]] —— micro — 终端里像 VS Code 一样顺手的纯 Go 编辑器
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[notepad-plus-plus]] —— Notepad++ — Windows 国民文本编辑器

