---
title: ripgrep — Rust 写的现代 grep
来源: https://github.com/BurntSushi/ripgrep
日期: 2026-05-29
分类: CLI
难度: 中级
---

## 是什么

ripgrep（命令叫 `rg`）是 Andrew Gallant（GitHub 名 BurntSushi）2016 年用 Rust 写的一个**项目级文本搜索工具**——目标是替代 grep。日常类比：

- **grep**：老牌通用搜索，像一个老实的图书管理员，"你让我翻所有书我就翻所有书"，包括地下室那些没人看的旧档案、二进制乱码、甚至 `node_modules` 里 50 万个文件。
- **ripgrep**：聪明的搜索员，"你让我搜代码？我自己知道 `.gitignore` 列的、二进制的、`node_modules` 这种几百万文件的目录，都跳过。"

最直观的对比：在一个有 `node_modules` 的项目里，`grep -r "foo" .` 可能跑 30 秒，`rg foo` 跑 0.3 秒——**100 倍差距**全靠"知道哪些文件不该看"。

```bash
rg "TODO"           # 当前目录递归搜，自动 skip 二进制 + ignore
rg -t py "import"   # 只看 Python 文件
rg -l "regex"       # 只列出匹配的文件名（不显示行）
```

## 为什么重要

ripgrep 在工程社区的影响**比它一开始想做的事大得多**：

- **VS Code / Cursor / Claude Code 等编辑器全部默认用 ripgrep 做项目搜索**——你按 Cmd+Shift+F 弹出的搜索面板，背后 fork 了一个 `rg` 进程
- **Rust 生态的杀手应用**：性能（比 C 实现快）+ 安全（无 segfault）+ UI（彩色高亮、自动跳过）三杀，被反复当作"为什么选 Rust"的论据
- **默认尊重 ignore 文件**让大型项目的搜索时间从分钟级降到秒级——这是新人最容易低估的功能
- **Unicode 友好**：grep 在 UTF-8 文件上时不时会出怪事（`\w` 不匹配中文、字节边界切到一半），ripgrep 默认 Unicode 正确

## 核心要点

ripgrep 的速度优势可以拆成 **三层**：

1. **少看文件**——默认尊重 `.gitignore` / `.ignore` / `.rgignore`，自动跳过二进制和 hidden 文件。这一层是最大的省时来源。

2. **并行搜索**——多线程读多个文件 + 内存映射（mmap）减少系统调用。Rust 的 `rayon` 库让并行几乎零成本。

3. **快 regex 引擎**——默认用 Rust `regex` crate（基于有限自动机，保证线性时间），不像 PCRE 会指数爆炸。需要 lookahead / backreference 时加 `-P` 切换到 PCRE2。

这三层叠加，加上 Rust 的零成本抽象，让 `rg` 在大多数场景比 GNU grep 快 5-10 倍。

## 实践案例

### 案例 1：日常代码搜索

```bash
# 找所有 TODO 注释
rg "TODO"

# 在 src/ 里找 React 组件
rg "function \w+\(" src/

# 大小写不敏感
rg -i "error"

# 显示前后 3 行上下文
rg -C 3 "throw new Error"
```

输出自带颜色高亮 + 文件名 + 行号——你不用配 `.bashrc`，开箱即用。

### 案例 2：编辑器搜索面板背后

VS Code 的"全局搜索"实际跑的是：

```bash
rg --json --crlf "your query" /path/to/workspace
```

`--json` 让 ripgrep 输出结构化结果（每行一个 JSON），编辑器解析后渲染到 UI。这个用法是 Andrew Gallant 专门为编辑器集成设计的——所以现在几乎所有"现代化"编辑器都默认接 ripgrep。

### 案例 3：搜被 ignore 的文件

有时候你**就是想**搜 `node_modules`：

```bash
rg -uu "specific_function"   # u=不尊重 ignore，uu=连 hidden+binary 也搜
rg --no-ignore "foo"         # 等价于 -u
```

新人最常踩的坑之一：以为 ripgrep "漏搜"了，其实是它默认尊重 ignore——加 `-uu` 就回到 grep 行为。

## 踩过的坑

1. **默认尊重 ignore 但有时想搜 ignored**——用 `-uu`（搜全部）、`-u`（搜 hidden 但不搜 ignore）、`--no-ignore`（不读 ignore 文件）。三档可调，新人记一档就够。

2. **glob 语法和 grep / find 不同**：`rg -g '*.ts' "foo"` 而不是 `--include='*.ts'`。`!*.test.ts` 是排除（注意感叹号转义）。

3. **PCRE2 不默认开启**：写 lookahead `(?=...)` 或 backreference `\1` 时，必须加 `-P`。不加报错信息有点隐晦：`"unrecognized escape sequence"`。

4. **多行匹配要显式开**：默认按行搜。要跨行匹配（比如找跨行的函数声明），用 `-U`（multiline mode）。

5. **和 silver searcher (`ag`) 命令略不同**：`ag` 用户切过来会搞混 `-G`（仅文件名 vs 仅 glob）。建议直接看 `rg --help`，不要靠肌肉记忆。

## 适用 vs 不适用场景

**适用**：
- 项目内代码搜索（最大用例，VS Code / Claude Code 都用它）
- 大型 monorepo 搜索——尊重 ignore 让时间从分钟到秒
- 日志文件 grep（速度优势明显）
- CI 里 lint 前的 pattern 检查

**不适用**：
- 流式管道处理——`grep` 在 `cat foo | grep bar` 这种场景仍是首选（`rg` 也支持但不是主战场）
- 需要 `sed`/`awk` 风格的修改——ripgrep 只搜不改，要改用 `sd`（同样 Rust 写的）或 `sed`
- POSIX 严格兼容场景——脚本要跨各种 Unix 跑，老老实实用 `grep`

## 历史小故事（可跳过）

- **2016 年 9 月**：Andrew Gallant 发布 ripgrep 0.1，配一篇博客 [ripgrep is faster than ...](https://blog.burntsushi.net/ripgrep/)——文章把 ripgrep 和 grep / ag / ack / ucg 全方位对比，benchmark 详尽到发指。这篇博客是"如何写一个工程基准测试"的教科书级案例。
- **2018 年**：v0.10 加 multiline 支持。同年 VS Code 1.27 默认改用 ripgrep 替代之前的搜索后端。
- **2021 年**：v13 加 PCRE2 支持。同年 ripgrep 进入 Homebrew 默认推荐 CLI 列表。
- **2024 年**：与 ast-grep 等 AST-based 搜索工具并存——后者按语法树搜（找"函数定义里包含 TODO"），ripgrep 按文本搜（找"任何包含 TODO 的行"）。两者互补不互斥。

## 学到什么

1. **"少做事"是最大的优化**——ripgrep 比 grep 快不是因为算法更好，而是它**知道哪些文件不该看**。这是工程优化的第一性原理。

2. **默认值就是设计**——ripgrep 默认尊重 ignore、默认彩色、默认递归，这些"默认"决定了用户体验。grep 的默认是 1970 年代的，ripgrep 的默认是 2016 年的。

3. **Rust 不是性能本身，是"敢这样写"的底气**——并行搜索 + mmap + zero-copy 字符串处理在 C 里都能写，但写完会有 N 个段错误。Rust 让作者敢写得更激进。

4. **一个工具能改变整个行业**——VS Code / Claude Code 全部默认接 ripgrep，意味着今天每天有上亿次搜索跑在它上面。一个好工具的复利极其惊人。

## 延伸阅读

- 入门：[ripgrep 官方 README](https://github.com/BurntSushi/ripgrep#readme)（读完就能熟练用）
- 性能博客：[ripgrep is faster than {grep, ag, git grep, ucg, pt, sift}](https://blog.burntsushi.net/ripgrep/)（基准测试教科书）
- 用户手册：`man rg` 或 `rg --help`（选项极多但分组清晰）
- 编辑器集成：[VS Code 的 ripgrep wrapper 源码](https://github.com/microsoft/vscode-ripgrep)

## 关联

- [[claude-code]] —— Claude Code / Cursor / VS Code 都默认用 ripgrep
- [[swc]] —— 同属 Rust 改写老工具的浪潮（swc 改写 babel）
- [[biome]] —— Rust 改写 lint/format 工具（替代 ESLint+Prettier）
- [[commander]] —— CLI 参数解析的另一个生态范本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[astronvim]] —— AstroNvim — 社区驱动的 Neovim 配置
- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[bat]] —— bat — 现代 cat 替代
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[commander]] —— commander.js — Node.js CLI 解析的声明式标准
- [[delta]] —— delta — git diff 的语法高亮分页器
- [[dua-cli]] —— dua-cli — Rust 写的并发 du 替代，按 i 进交互模式当场把大文件扔进废纸篓
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[eza]] —— eza — 现代 ls 替代（exa 的社区接管 fork）
- [[fd]] —— fd — Rust 写的现代 find
- [[fx]] —— fx — JSON 的交互式查看器（jq 的 TUI 表亲）
- [[fzf]] —— fzf — 命令行模糊查找
- [[gdu]] —— gdu — Go 写的并发 du 替代，单二进制扔到服务器扫满盘几秒钟出 TUI
- [[gitui]] —— gitui — Rust 写的 git TUI，libgit2 直连让启动比 lazygit 快一个量级
- [[gron]] —— gron — 把 JSON 拍平成 grep 能吃的赋值行
- [[htop]] —— htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
- [[jq]] —— jq — JSON 的 sed/awk
- [[lazyvim]] —— LazyVim — lazy.nvim 驱动的 Neovim 发行版
- [[lf]] —— lf — 终端里像 vim 一样翻文件
- [[lsd]] —— lsd — 现代 ls 替代（LSDeluxe，主题化 + 图标，不押 git）
- [[miller]] —— Miller (mlr) — 懂 CSV/JSON 表头的 awk
- [[ncdu]] —— ncdu — du 的交互式 TUI，扫一次就能在终端里上下键钻目录删大文件
- [[neovim]] —— Neovim — Lua 可扩展 vim 现代分叉
- [[nnn]] —— nnn — 50KB 内存就能跑的极简终端文件管理器
- [[nushell]] —— nushell — 让命令之间传 Excel 表而不是传纸条
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
- [[starship]] —— Starship — 一份配置点亮所有 shell 的 prompt
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[the-silver-searcher]] —— the_silver_searcher (ag) — 比 grep/ack 快一个数量级的代码搜索
- [[tig]] —— tig — 老牌 ncurses git 浏览器，把 log/blame/diff 玩到骨子里
- [[tmux]] —— tmux — 一个终端窗口里跑多个会话还能脱离重连
- [[universal-ctags]] —— Universal Ctags — 老牌符号索引器，编辑器跳转到定义的底层引擎
- [[vim]] —— Vim — 键盘上弹钢琴的编辑器
- [[xplr]] —— xplr — 用 Lua 当配置语言的可 hack 终端文件管理器
- [[yq]] —— yq — YAML 的 jq（也吃 XML/TOML/properties）
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd

