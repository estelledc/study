---
title: bat — 现代 cat 替代
来源: https://github.com/sharkdp/bat
日期: 2026-05-29
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

bat 是 **David Peter（[[fd]] 同作者）2018 年用 Rust 写的 cat 替代**——在 cat 的"原样把文件吐到屏幕"之上，加了语法高亮、行号、Git 修改标记。

日常类比：

- **cat 是黑白打印机**——把内容打出来，没颜色、没行号、没排版
- **bat 是彩印机 + 行号 + 修改标记的高级版**——同一份文件，关键字着色、左侧带行号、被改过的行旁边有红绿条

你在终端 `cat foo.py` 看到一片黑白；换成 `bat foo.py`，瞬间变成 VS Code 风格的高亮视图——而且**不用退出终端**。

## 为什么重要

不只是"漂亮一点"，它改变了终端读代码的体验：

- **可读性差距巨大**——`cat` 看长 Python / TypeScript 文件，关键字、字符串、注释全是灰底白字一锅粥；bat 一眼能定位结构
- **天然集成 git diff**——文件被改过的行左侧有 `+`/`-`/`~` 标记，不用切到 `git diff` 单独看
- **自动分页**——小文件直接打印到 stdout，大文件自动喂给 `less`，不会刷屏几千行
- **启发了一整代终端工具**——[[ripgrep]] `--pretty`、delta（git diff viewer）、`gh` 命令的彩色输出，都借鉴了 bat 的高亮思路
- **很多人的 `cat` 默认 alias**——`alias cat=bat` 是 dotfiles 高频条目

## 核心要点

bat 的设计可以拆成 **3 件事**：

1. **语法高亮**：内置 200+ 语言，基于 Sublime Text 的 `.sublime-syntax` 规则——成熟、覆盖广。主题用 `.tmTheme`（TextMate 格式），默认 `Monokai Extended`，可换 `OneHalfDark` / `Dracula` / `GitHub` 等几十个。

2. **Git integration**：检测到文件在 git 仓库里，左侧 gutter 显示三种符号——`+` 新增行、`-` 删除行（占位）、`~` 修改行。不需要单独跑 `git diff`，编辑历史直接可视化。

3. **自动分页**：行为上是 cat 和 less 的混合体——
   - 输出**超过一屏**：自动管道给 `less`（可滚动、可搜索 `/keyword`）
   - 输出**少于一屏**：直接打印（不进 less，不需要按 q）
   - **管道场景**（`bat foo.py | grep ...`）：自动转 plain 模式，不输出装饰色码污染下游

## 实践案例

### 案例 1：日常读源码

```bash
bat src/main.rs
```

得到：左侧灰色行号、Rust 关键字蓝紫色、字符串绿色、注释暗灰；如果这个文件刚被 `git` 改过，行号右边有 `~` 标记。整体观感接近 VS Code 打开文件，但还在终端里。

### 案例 2：管道传给其他工具

```bash
bat -p server.log | grep ERROR
```

`-p` 是 plain 模式——不分页、不加行号、不加文件名头部，**只把语法高亮保留**（grep 仍能正常匹配文本）。日常处理日志、对接 awk / sed 都用这个。

### 案例 3：和 fzf 组合做交互式预览

```bash
fzf --preview 'bat --color=always --line-range=:200 {}'
```

打开 fzf 文件选择器，右侧实时预览高亮内容（截前 200 行避免大文件卡顿）。`--color=always` 强制输出色码（fzf 会接受）；不加的话 fzf 拿到的是无色文本，预览很丑。

## 踩过的坑

1. **`alias cat=bat` 后管道全炸**——把 cat 默认替换成 bat 装饰过的输出，下游脚本（`cat config | yq ...`）解析失败。**正确做法**：alias 用 `bat -p`，或者保留 cat、只在交互场景手敲 bat。

2. **大文件慢**——语法高亮是 O(n) 但常数很大，几十 MB 日志比 cat 慢一个量级。日志文件用 `bat --plain` 或干脆 `cat`；只在源码场景用完整 bat。

3. **默认主题不一定好看**——`Monokai Extended` 在浅色终端背景上糊成一团。先 `bat --list-themes` 看预览，挑一个和终端配色匹配的；写进 `~/.config/bat/config`：

   ```
   --theme="OneHalfDark"
   ```

4. **macOS / Linux 包名不一致**——`brew install bat` 装出来叫 `bat`；Debian / Ubuntu apt 装出来叫 `batcat`（避免和已有 `bat` 包冲突）。在跨平台脚本里要兼容两个名字，或用 `~/.local/bin/bat -> /usr/bin/batcat` 软链统一。

## 历史

- **2018**：David Peter 在 [[fd]] 做火之后顺手写了 bat——同一套设计哲学（Rust + 用户体验优先 + 单二进制零依赖）
- **2020 v0.16**：加入 Git integration（`+`/`-`/`~` 标记），从"漂亮 cat"升级成"带上下文的 cat"
- **2021–2023**：streamable input / 自定义 syntax / 自定义 theme 等渐进改进；社区 PR 主导
- **2024 v0.24**：配置体系（`bat config-dir` / `bat config-file`）和主题管理完善；正式进入"够稳定不需要每月更新"的成熟期

bat 不像 [[ripgrep]] 一样替代了一类核心命令（grep），它是**给 cat 加体验糖**——但因为门槛低（一条 brew 命令）、收益直观（终端读代码秒级提升），传播得反而快。

## 适用 vs 不适用场景

**适用**：

- 终端里读代码 / 配置文件 / Markdown——高亮 + 行号大幅提升可读性
- 配合 [[ripgrep]] / fzf / git diff 做交互式工具链——bat 提供"漂亮预览"的标准件
- 想看刚改过哪几行又懒得 `git diff`——直接 `bat file` 看 gutter 标记
- dotfiles 里给 `cat` 加默认增强——交互场景下基本无负面影响

**不适用**：

- 大文件（几百 MB 日志、压缩二进制）——语法高亮成本高，直接 `cat` 或 `less` 更快
- 写脚本里需要稳定无装饰的输出——保留 `cat`，不要 alias 替换
- 极简主义环境（Alpine 容器、嵌入式）——bat 二进制 ~5 MB，不如直接 cat
- 完全不在 git 仓库的文件——Git integration 用不到，价值减半

## 学到什么

1. **小工具也能影响生态**——bat 没解决新问题，只是"把 cat 做得更好"，但启发了一批 `--pretty` / `--color=always` 的同类工具
2. **零依赖单二进制是 Rust CLI 的护城河**——brew / cargo install 一行装好，比 Python 工具门槛低得多
3. **用户体验细节是壁垒**——自动分页、自动 plain 模式（管道场景）、自动检测 git 仓库——每一个都是"用户没要求但用了就回不去"
4. **dotfiles 友好度决定传播速度**——能写进一行 alias 的工具，比要配置文件的工具传播快 10 倍

## 延伸阅读

- 官方 README：[github.com/sharkdp/bat](https://github.com/sharkdp/bat)（含主题预览图、安装指南、配置示例）
- 配 fzf 的工作流：[junegunn/fzf wiki — Examples](https://github.com/junegunn/fzf/wiki/Examples)（搜 `bat` 看 preview 配置）
- 主题画廊：`bat --list-themes` 本地跑——每个主题用一段示例代码渲染给你看，比截图直观

## 关联

- [[fd]] —— David Peter 同作者，find 替代；和 bat 一起组成"现代 CLI 套件"基本盘
- [[ripgrep]] —— grep 替代；`rg --pretty` 的高亮思路与 bat 同源
- [[claude-code]] —— 终端 AI 编程助手；和 bat / [[ripgrep]] 是同一类"终端体验现代化"工具的不同层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[delta]] —— delta — git diff 的语法高亮分页器
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[eza]] —— eza — 现代 ls 替代（exa 的社区接管 fork）
- [[fzf]] —— fzf — 命令行模糊查找
- [[gitui]] —— gitui — Rust 写的 git TUI，libgit2 直连让启动比 lazygit 快一个量级
- [[htop]] —— htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
- [[lazydocker]] —— lazydocker — Go 写的 Docker TUI，五面板看容器 / 镜像 / 网络 / 卷
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[lsd]] —— lsd — 现代 ls 替代（LSDeluxe，主题化 + 图标，不押 git）
- [[miller]] —— Miller (mlr) — 懂 CSV/JSON 表头的 awk
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
- [[ranger]] —— ranger — Python 写的 vim 风格三栏文件管理器
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
- [[universal-ctags]] —— Universal Ctags — 老牌符号索引器，编辑器跳转到定义的底层引擎
- [[yazi]] —— yazi — Rust 写的异步 TUI 文件管理器，终端里直接看图
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd

