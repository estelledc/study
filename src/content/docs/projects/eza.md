---
title: eza — 用 Git 缓存和多视图渲染重做 ls 的社区 fork
description: 介绍 eza 0.23.5 如何先解析布局再按需扫描 Git，并用 Grid / Details / Code 等模式渲染目录。
来源: https://github.com/eza-community/eza
日期: 2026-08-27
分类: cli
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/eza-community/eza
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 98442ab17c2c3738701b62a7e060b1431ae2d6ea
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.23.5
---

## 是什么

eza 是 exa 停止维护后，社区 fork 出来的现代 `ls` 替代。日常类比：系统 `ls` 像一张只写文件名的清单；eza 先决定要看网格、长表、树还是行数摘要，再按需把 Git 状态贴到同一张表上。

```bash
eza -l --git --icons
```

固定 0.23.5 的入口是 clap 解析 → `Options::deduce` → `Exa::run`。TTY 且没指定布局时默认 `Mode::Grid`；输出不是终端时默认 `Mode::Lines`。`--git` 不会在网格视图凭空加一列，它只在长表相关模式里打开 Git 列。

## 为什么重要

不理解固定 0.23.5 的“先选视图、再决定要不要扫 Git”，下面这些事会对不上：

- 为什么 `eza --git` 在默认网格里看不到 Git 列，必须加 `-l`
- 为什么 `--git-ignore` 即使不加 `--git` 也会去发现仓库
- 为什么管道后面的 `eza | wc -l` 不再走彩色网格
- 为什么 `--code` 根本不列文件，却还是同一个二进制

它和 [[lsd]] 的分歧不再是“有没有 Git”，而是 Git 何时进入主链、主题文件怎么分层。

## 核心要点

固定版本的主链可以拆成五步：

1. **解析选项，而不是先扫盘**：`get_command().get_matches()` 得到 clap 结果，`Options::deduce` 填好 `dir_action` / `filter` / `view` / `theme` / `stdin`。没有路径时默认 `"."`，也可按 stdin 分隔符读文件名。
2. **按需组装 Git 缓存**：`should_scan_for_git` 在 `--git-ignore`，或长表 `Columns.git` 为 true 时成立。`Columns.git` 还要求没传 `--no-git`、没设 `EZA_OVERRIDE_GIT` / `EXA_OVERRIDE_GIT`。命中后，`GitCache` 用向量记下已发现仓库，第一次查询才向 `git2` 取 statuses。
3. **先分流路径，再选渲染器**：`Exa::run` 把参数分成文件和目录。`--code` 在这一步就走语言行数摘要，不再进入文件列表。
4. **视图决定输出形状**：TTY 默认 Grid；`-l` 走 Details；`-l` 加 `--grid` 走 GridDetails；`-T` 走带 recurse 的 Details。无终端宽度时，GridDetails 会降成 Details。
5. **主题是一份 YAML**：默认读 `dirs::config_dir()/eza/theme.yml`。`UseColours::Automatic` 且非 TTY 时改用 plain UI，避免把 ANSI 喂给管道。

Git 列渲染两格（staged + unstaged），符号是 `- N M D R T I U`。这不是旧文案里的 `-N` / `II` / `--`。

## 实践示例

### 案例 1：长表才看得到 Git 列

```bash
eza --git
eza -l --git
```

第一条走默认 Grid，`Columns.git` 不会被画出来。第二条进入 Details，`table.columns.git` 为 true，这才值得去 `GitCache` 里查仓库。

### 案例 2：`--git-ignore` 会触发扫描，即使你不要 Git 列

```bash
eza --git-ignore
```

`GitIgnore::CheckAndIgnore` 单独就能让 `should_scan_for_git` 返回 true。它过滤的是被 ignore 的条目，不是给网格加一列状态。

### 案例 3：`--code` 抢在文件列表前面

```bash
eza --code src
```

`Mode::deduce` 见到 `--code` 直接返回 `Mode::Code`。`Exa::run` 只对存在的根路径做语言行数摘要；路径不存在会写 stderr 并让退出码变成 2。

## 踩过的坑

1. **把 `--git` 当成默认列**：长表也不会自动开 Git。必须显式 `--git`，且能被 `--no-git` 或 `EZA_OVERRIDE_GIT` / `EXA_OVERRIDE_GIT` 关掉。
2. **`alias ls=eza` 喂给脚本**：非 TTY 会改走 Lines，颜色在 Automatic 下也会关掉；但 flag 语义仍不是 POSIX `ls`。交互式 alias 更稳。
3. **把 Git 符号记成旧文案**：固定源码画的是两格 `N`/`M`/`D`/`R`/`T`/`I`/`U`/`-`，不是 `-N`、`II`、`--`。
4. **无 `git` feature 的构建还传 `--git`**：源码会报 `git` feature 被关掉，不能当普通 unknown flag 忽略。
5. **把 tag 消息里的 v0.23.4 当成绑定版本**：annotated tag `v0.23.5` 的消息写着 justfile 生成 v0.23.4，但剥皮提交和 crates.io 都是 `0.23.5`。

## 适用 vs 不适用场景

**适用**：

- 日常看仓库目录，需要长表 Git 列或 `--git-ignore` 过滤
- 同一套二进制里还想要树视图或 `--code` 行数摘要
- 接受一份 `theme.yml` 覆盖颜色和图标，而不是拆成多份主题文件

**不适用**：

- 脚本要 POSIX `ls` 输出——应保留系统 `ls`
- 发行包关掉了 `git` feature，却还把 `--git` 写进 dotfiles
- 想靠“三个 YAML 文件”分层改图标和颜色——那是 [[lsd]] 的配置合同
- 需要本页未做的体积、耗时或 monorepo 性能结论

## 固定版本边界

- 本文绑定 `eza-community/eza@98442ab17c2c3738701b62a7e060b1431ae2d6ea`，annotated tag `v0.23.5` 剥皮提交；`Cargo.toml` 版本为 `0.23.5`，`rust-version` 为 `1.90`。
- tag 对象 `f7a9e054fb545f8f8bd36cf5c5d47fb36e5645d5` 的消息写的是 v0.23.4；crates.io 稳定版与源码版本字段均为 `0.23.5`。
- default feature 含 `git`；license 为 `EUPL-1.2`。源文件仍保留 exa 时期的 MIT SPDX 注释。
- 本文未编译、未运行上游测试、未测体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **视图先于 Git 扫描**——值不值得打开 `GitCache`，由布局和 `--git-ignore` 决定，不是每次 `eza` 都查仓库。
2. **Git 列是两格状态，不是一列装饰**——staged / unstaged 各一个字符，符号表写在 `output/render/git.rs`。
3. **`--code` 是另一条工具**——它走语言计数，不复用文件列表渲染器。
4. **fork 的 provenance 仍要核对 tag 消息**——tag 名、剥皮提交和 crate 版本可能比 tag 正文更可信。

## 应用型自测

1. 只跑 `eza --git`（TTY、默认网格），会不会画出 Git 列？
2. 不传 `--git`，只传 `--git-ignore`，还会不会组装 `GitCache`？
3. `eza --code .` 会不会先列出当前目录的文件，再统计行数？

检查点：

1. 不会。默认 `Mode::Grid` 不读 `table.columns.git`。
2. 会。`GitIgnore::CheckAndIgnore` 单独就能让 `should_scan_for_git` 为 true。
3. 不会。`--code` 在 `Exa::run` 开头就返回语言摘要。

## 延伸阅读

- 官方 README：[github.com/eza-community/eza](https://github.com/eza-community/eza)
- 固定源码：[eza-community/eza](https://github.com/eza-community/eza) —— 本文绑定提交 `98442ab17c2c3738701b62a7e060b1431ae2d6ea`
- [[lsd]] —— 同代 ls 替代；Git 列是 long 视图的可选 block，主题拆成 config / colors / icons

## 关联

- [[lsd]] —— 配置分层与可选 Git block 的对照
- [[bat]] —— 把 Git gutter 融进文件查看
- [[fd]] —— 默认读 gitignore 的文件名搜索
- [[ripgrep]] —— 默认读 gitignore 的内容搜索
- [[fzf]] —— 常用 `eza -T --color=always` 做目录预览

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[lsd]] —— lsd — 用 YAML 主题和可选 git 块重写 ls
- [[miller]] —— Miller (mlr) — 懂 CSV/JSON 表头的 awk
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd
