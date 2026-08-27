---
title: lsd — 用 YAML 主题和可选 git 块重写 ls
description: 介绍 lsd 1.2.0 如何用 config.yaml 管行为、按需读取 colors/icons，并在 long 视图可选插入 git 列。
来源: https://github.com/lsd-rs/lsd
日期: 2026-08-27
分类: cli
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/lsd-rs/lsd
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d5a4e1cb80626d5ec94b237f6b77f7280d0f2fc9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.0
---

## 是什么

lsd（LSDeluxe）是用 Rust 重写的 `ls`：默认把目录画成带颜色、可选图标的列表，配置走 YAML，Git 状态是 long 视图里的可选列。日常类比：系统 `ls` 是一张不能改格式的清单；lsd 先读一份行为说明书，再决定要不要另拿调色本和图标本，最后才决定贴不贴 Git 便签。

```bash
lsd -l --git --icon always
```

固定 1.2.0 的入口是 `Cli::parse_from(wild::args_os())` → 读配置 → `Flags::configure_from` → `Core::run`。`wild` 先做 shell glob。没有 `--ignore-config` 时，它按 XDG / `%APPDATA%` 顺序找 `config.yaml` 或 `config.yml`。

## 为什么重要

不理解固定 1.2.0 的配置分层和 Git 开关，下面这些事会对不上：

- 为什么默认 `lsd -l` 没有 Git 列，必须再加 `--git`
- 为什么家里没有 `colors.yaml`，颜色却仍然在
- 为什么管道后的 `lsd | wc -l` 会变成一行一项，并打开 literal
- 为什么旧印象“lsd 不押 Git”对 1.2.0 已经不成立

它和 [[eza]] 都能量 Git，但 lsd 把 Git 当成 long blocks 里可插入的一列，并且用一份行为配置加两份可选主题文件。

## 核心要点

固定版本的主链可以拆成五步：

1. **先吃参数和配置**：`--ignore-config` 得到空配置；`--config-file` 读指定路径；否则在 `~/.config/lsd`、`$XDG_CONFIG_HOME/lsd`（Windows 则是 `%USERPROFILE%\.config\lsd` 与 `%APPDATA%\lsd`）里找 `config.yaml` / `config.yml`。
2. **拼 Flags，再进 Core**：`Flags::configure_from` 合并 CLI 与 YAML。`Core::new` 看 stdout 是不是 TTY：非 TTY 且布局不是 Tree 时，强制 `Layout::OneLine` 并把 `literal` 设为 true。
3. **fetch → sort → display**：`Core::run` 对每个路径建 `Meta`，按 layout / recursion 决定深度，排序后再走 `display::grid` 或 `display::tree`。
4. **Git 是可选 block，不是默认列**：默认 long blocks 是 permission / user / group / size / date / name。只有 `--git` 且 `--long` 且编译时没有 `no-git`，才会在 Name 前插入 `Block::GitStatus`。没有这个 block 就不会 `GitCache::new`。
5. **主题文件按需读取**：`config.yaml` 管行为。`color.theme = custom` 才读 `colors.yaml`；fancy 图标会尝试读 `icons.yaml`，没有文件就用内置 `IconTheme::default()`。`themes/` 目录已被标成 deprecated。

`GitCache` 用 `git2::Repository::discover` 加 `statuses(None)`。文件按路径精确匹配；目录对子路径的 index / workdir 状态取 `max`。默认符号是 `- . N ? D M R I T C`。

## 实践示例

### 案例 1：Git 列必须叠在 long 上

```bash
lsd --git
lsd -l --git
```

第一条即使编译了 `git2`，`configure_from` 也要求 `cli.git && cli.long` 才插入 `GitStatus`。第二条才会在 Name 左侧加 Git 列，并在 `fetch` 里建 `GitCache`。

### 案例 2：`theme: custom` 才读 colors.yaml

```yaml
# ~/.config/lsd/config.yaml
color:
  when: auto
  theme: custom
```

`ThemeOption::Custom` 会 `Theme::from_path("colors")`，也就是在同一组 config 目录里找 `colors.yaml` / `colors.yml`。只改一个不叫这个名字的文件、或把 `theme` 留成 `default`，都不会走到这条路径。

### 案例 3：管道会改布局，Tree 除外

```bash
lsd | wc -l
lsd --tree | less
```

非 TTY 时，非 Tree 布局被改成 OneLine，并打开 literal，减少把 ANSI 和图标喂给 `wc`。Tree 布局会保留，因为源码写明“不要覆盖 tree”。

## 踩过的坑

1. **继续写“lsd 没有 Git”**：1.2.0 的 default feature 含 `git2`，`--git` 在 long 视图可用。`no-git` 才是编译期关掉。
2. **以为三个 YAML 总会一起加载**：`config.yaml` 是行为入口；`colors.yaml` 要 `theme: custom`；`icons.yaml` 只在 fancy 图标下可选覆盖。
3. **`alias ls=lsd` 直接给脚本用**：管道会改 OneLine / literal，但 flag 和列集合仍不是 POSIX `ls`。
4. **只传 `--git` 不加 `-l`**：Git block 插不进去，`GitCache` 也不会建。
5. **把 `themes/` 当当前合同**：`CustomLegacy` 仍能读，但会打印 deprecated 警告，并指向 `colors.yaml`。

## 适用 vs 不适用场景

**适用**：

- 想用一份 `config.yaml` 固定 long 列顺序、图标策略和排序
- 需要可选 Git 列，但不希望默认网格每次都 discover 仓库
- 经常把输出接到管道，接受非 TTY 时改成 OneLine

**不适用**：

- 脚本要 POSIX `ls`——应保留系统 `ls`
- 想要 eza 那种 `--git-ignore` 过滤或 `--code` 行数摘要——看 [[eza]]
- 发行包用 `no-git` feature 构建，却还把 `--git` 写进 alias
- 需要本页未做的体积、耗时或跨平台渲染对比

## 固定版本边界

- 本文绑定 `lsd-rs/lsd@d5a4e1cb80626d5ec94b237f6b77f7280d0f2fc9`，lightweight tag `v1.2.0`；`Cargo.toml` 版本为 `1.2.0`，`rust-version` 为 `1.85`。
- crates.io 稳定版同为 `1.2.0`。default feature 含 `git2`；`no-git` 把 `GitCache` 编成空实现。
- license 为 `Apache-2.0`。README 标明当前最新 release 就是 `v1.2.0`。
- 本文未编译、未运行上游测试、未测体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **Git 在 lsd 里是 block，不是默认身份**——开关写在 `cli.git && cli.long`，不是“这个工具不碰 Git”。
2. **配置分层是按需读取，不是三份必载**——行为、颜色、图标各有入口条件。
3. **管道策略写在 Core，不写在主题里**——非 TTY 改 OneLine / literal，Tree 单独豁免。
4. **目录的 Git 状态是子路径聚合**——`inner_get` 对目录取 index/workdir 的最大值。

## 应用型自测

1. `lsd --git` 在默认网格下会不会建立 `GitCache`？
2. `color.theme` 仍是 `default` 时，放在旁边的 `colors.yaml` 会不会自动生效？
3. 管道里跑 `lsd --tree`，布局会不会被改成 OneLine？

检查点：

1. 不会。没有 `--long` 就不会插入 `Block::GitStatus`。
2. 不会。只有 `ThemeOption::Custom` 才按 `"colors"` 去找主题文件。
3. 不会。源码明确跳过对 Tree 的覆盖。

## 延伸阅读

- 官方 README：[github.com/lsd-rs/lsd](https://github.com/lsd-rs/lsd)
- 固定源码：[lsd-rs/lsd](https://github.com/lsd-rs/lsd) —— 本文绑定提交 `d5a4e1cb80626d5ec94b237f6b77f7280d0f2fc9`
- [[eza]] —— 同代 ls 替代；Git 列绑定长表，另有 `--git-ignore` 与 `--code`

## 关联

- [[eza]] —— Git 缓存与多视图主链的对照
- [[bat]] —— 把颜色和图标塞进文件查看
- [[fd]] —— 常和 lsd 一起出现在 dotfiles 的文件名搜索
- [[ripgrep]] —— 同套 Rust CLI 里的内容搜索
- [[fzf]] —— 可用 `lsd --tree` 做目录预览

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
