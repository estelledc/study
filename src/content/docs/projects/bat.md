---
title: bat — 现代 cat 替代
来源: https://github.com/sharkdp/bat
日期: 2026-05-29
分类: CLI
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/sharkdp/bat
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 979ba22628bc9d8171f2cffca2bd5c90c9fc0a9e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.26.1
---

## 是什么

bat 是 David Peter 用 Rust 写的 **cat 替代**：把文件打到终端时，顺带做语法高亮、行号和相对 git index 的修改标记。日常类比：cat 是黑白打印机；bat 是带行号和改稿记号的彩印机——还在终端里，不必打开编辑器。

```bash
bat src/main.rs
```

固定 `0.26.1` 的 crate 声明 `MIT OR Apache-2.0`，默认 feature 打开 `application` 与 `git`。它同时也是库：`PrettyPrinter` 是稳定入口，内部 `Controller` 更可能改。

## 为什么重要

不理解 bat 的分层，下面这些事会对不上：

- 为什么管道给 `grep` 时装饰列消失，而 `fzf --preview` 又必须 `--color=always`
- 为什么 `alias cat=bat` 会把脚本的下游解析打坏，但 `alias cat='bat -pp'` 往往能保住 cat 体感
- 为什么左侧 gutter 的删除记号不是单一的 `-`
- 为什么 Debian/Ubuntu 装完可执行文件可能叫 `batcat`

## 核心要点

固定版本可以拆成四层：

1. **syntect 高亮**：`Controller` 用 cache 或内嵌资产取出 `SyntaxSet` / 主题，再交给 `InteractivePrinter`。依赖是 `syntect 5.3.0`（`parsing`）。默认主题按配色方案选 `Monokai Extended`（Dark）或 `Monokai Extended Light`（Light），不是写死某一个。

2. **默认装饰只在交互终端**：`StyleComponent::Default` 打开 `changes`、`grid`、`header-filename`、`numbers`、`snip`。`--style=auto` 在非 TTY 落到 `Plain`（空组件集），所以管道默认不带行号和边框。

3. **Git 比的是工作区对 index**：`get_git_diff` 调 `git2` 的 `diff_index_to_workdir`，`context_lines(0)`。gutter 符号是 `+`（Added）、`‾`（RemovedAbove）、`_`（RemovedBelow）、`~`（Modified）。旧印象里的 `-` 占位并不存在。

4. **分页是 CLI 策略，不是枚举默认值**：`PagingMode` 的 Rust 默认是 `Never`；交互 stdout 上 auto 变成 `QuitIfOneScreen`（常见是 less `-R -F -K`）。管道时 `Never`。从 stdin 读时，只有 stdout 是 TTY 且 stdin 不是 TTY 才分页。`-p` 等于 `--style=plain`；`-pp` 在 auto 下再关掉分页。

## 实践示例

### 案例 1：交互读源码

```bash
bat src/main.rs
```

**逐部分解释**：后缀走 syntect 语法；左侧是四位行号；若文件在 git 工作区且相对 index 有 hunk，行号旁会出现 `+` / `‾` / `_` / `~`。输出超过一屏时，auto 分页会把内容交给 pager。

### 案例 2：管道只要文本

```bash
bat -p server.log | grep ERROR
```

`-p` 去掉 header、grid、行号和 git 标记。若还要完全关掉分页，用 `-pp`。脚本若连 ANSI 都不想要，再加 `--color=never`。

### 案例 3：给 fzf 强制上色

```bash
fzf --preview 'bat --color=always --style=numbers --line-range=:200 {}'
```

预览窗不是交互 TTY，`--color=auto` 会关掉高亮。`--color=always`（或 `--force-colorization`）强制着色；`--line-range=:200` 只取前 200 行，避免大文件把预览卡住。

## 踩过的坑

1. **`alias cat=bat` 把装饰带进管道**：下游 `yq` / `awk` 会看到行号或色码。更接近 cat 的 alias 是 `bat -pp`，或只在交互场景手敲 `bat`。
2. **把 gutter 的删除写成 `-`**：固定版本删除行用 `‾` 或 `_`，取决于 hunk 落在现有行的上方还是下方。
3. **主题按终端配色切换**：浅色终端默认是 `Monokai Extended Light`。可写进配置文件 `--theme="TwoDark"`；配置是「每行一条 CLI 选项」，路径为 `BAT_CONFIG_PATH` 或 `config_dir/config`。
4. **Debian/Ubuntu 包名冲突**：官方 README 写明 apt 可能装出 `batcat`，需要 `ln -s /usr/bin/batcat ~/.local/bin/bat` 或 `alias bat=batcat`。
5. **把大文件变慢写成固定倍数**：高亮与装饰都有成本，但本页没有运行吞吐测量，不能写成「比 cat 慢一个量级」。

## 适用 vs 不适用场景

**适用**：

- 终端里读源码、配置、Markdown，需要行号和高亮
- 和 [[fzf]] / [[ripgrep]] 组预览链，显式 `--color=always`
- 想看相对 **index** 改了哪几行，又懒得单独开 `git diff`

**不适用**：

- 脚本里要稳定、无装饰的字节流——保留 `cat`，或强制 `-pp --color=never`
- 需要「相对 HEAD」而不是「相对 index」的标记——这不是 `diff_index_to_workdir` 的合同
- 要把未测的体积、速度或 star 数写成选型结论

## 固定版本边界

- 本文绑定 `sharkdp/bat@979ba226...`，即 tag `v0.26.1`，`Cargo.toml` 版本一致。
- 默认 feature：`application` + `git`；高亮引擎 `syntect 5.3.0`。
- Git 比较对象是 index↔workdir；分页策略见上，不把 `PagingMode::Never` 误读成「从不分页」。
- 本文未编译运行 bat、未数内置语言、未测大文件吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **管道合同要单独设计**——`auto` style / color / paging 都看 `stdout().is_terminal()`，所以同一条命令在 TTY 和管道里不是同一个产品。
2. **装饰和内容要能拆开**——`-p` / `-pp` 把「好看」从「可组合」里剥出去。
3. **gutter 符号是枚举，不是 git diff 字母的直译**——删除分上下两种占位。
4. **配置文件可以只是默认 argv**——bat 的 config 没有自己的 TOML schema。

## 应用型自测

1. 固定版本里，被删掉的行在 gutter 上显示 `-` 吗？
2. `bat file | grep x` 默认还会带行号和边框吗？
3. `-p` 和 `-pp` 差在哪一层？

检查点：

1. 不会。删除是 `‾`（上方）或 `_`（下方）；`-` 不是这个 revision 的符号。
2. 不会。非 TTY 上 `--style=auto` 落到 `Plain`，`paging` auto 也是 `Never`。
3. `-p` 只把 style 收成 plain；`-pp` 在 paging=auto 时再把 pager 关掉。

## 延伸阅读

- 官方 README：[github.com/sharkdp/bat](https://github.com/sharkdp/bat) —— 本文绑定提交 `979ba22628bc9d8171f2cffca2bd5c90c9fc0a9e`
- 审查记录：仓库内 `docs/rust-cli-source-review-20260827-fi.md`
- [[delta]] —— 专门给 git diff 做高亮分页
- [[fd]] —— 同一作者的 find 替代
- [[ripgrep]] —— 常和 bat 组预览链的搜索器

## 关联

- [[fd]] —— 同作者的现代 find
- [[ripgrep]] —— 搜索侧对照
- [[delta]] —— diff 高亮分页器
- [[fzf]] —— 交互预览宿主
- [[bottom]] —— 同属 Rust 终端工具，监控而不是阅读

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
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
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
- [[universal-ctags]] —— Universal Ctags — 老牌符号索引器，编辑器跳转到定义的底层引擎
- [[yazi]] —— yazi — Rust 写的异步 TUI 文件管理器，终端里直接看图
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd
