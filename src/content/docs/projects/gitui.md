---
title: gitui — 用 git2 与 gix 直连仓库的 Rust Git TUI
description: 介绍 gitui 如何用 ratatui、asyncgit 和 RON 配置组织终端 Git 工作流。
来源: https://github.com/gitui-org/gitui
日期: 2026-08-27
分类: cli
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/gitui-org/gitui
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e24fb45df1584ee8d8ebdc4258531b4a91ca975d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.28.1
---

## 是什么

gitui 是 Stephan Dilly（`extrawurst`）用 Rust 写的 Git 终端界面。它和 [[lazygit]] 都把日常 Git 动作收进一屏，但厨房不在外面：仓库读写走进程内的 `asyncgit`。日常类比：lazygit 是会跑腿的点单员，gitui 是把货架搬进自己店里。

```text
main → setup_terminal → run_app()
         ├─ ratatui + CrosstermBackend
         └─ asyncgit：repo() → git2，gix_repo() → gix
```

固定 tag `v0.28.1` 的 `Cargo.toml` 写明 `homepage` / `repository` 为 `https://github.com/gitui-org/gitui`。`extrawurst/gitui` 只读解析到同一仓库。版本字符串来自 `build.rs` 的 `GITUI_BUILD_NAME`。

## 为什么重要

不读固定 0.28.1 源码，旧教程会把三件事说错：

- 底层只有 libgit2 / `git2-rs`，并且「从不启动子进程」（status / log 还走 `gix`；钩子、GPG、编辑器会 spawn）
- 默认有 Branches 面板（分支是 popup，不是第六个 tab）
- 仓库仍在 `extrawurst/gitui`（规范地址已是 `gitui-org/gitui`）

它和 [[lazygit]] 并存，是因为一个跟 git 主仓，一个把对象库读进进程。

## 核心要点

固定 0.28.1 的主链可以拆成五步：

1. **ratatui 0.29 + crossterm 0.28**：`src/main.rs` 打开 raw mode 和 alternate screen，`run_app()` 里 `terminal.draw`。没有 tokio / async-std。
2. **主线程画 UI，后台用 rayon**：全局 4 线程池 + `crossbeam-channel`。`AsyncStatus` / `AsyncLog` 做完再通知主循环。
3. **两套仓库句柄**：`repo()` 用 `git2::Repository::open_ext`；`gix_repo()` 用 `gix::ThreadSafeRepository`。`asyncgit` 同时依赖 `git2 = "0.20"` 与 `gix = "0.78.0"`。status 和 log walk 走 gix，commit / diff / rebase / fetch 多走 git2。
4. **五个顶层 tab，分支不是 tab**：`AppTabs` 只有 `Status` / `Log` / `Files` / `Stashing` / `Stashlist`。建分支、选分支是 `BranchListPopup` 一类弹层。
5. **RON 配置，没有 customCommands**：`theme.ron`、`key_bindings.ron`、每仓 `.git/gitui`。主题不是 YAML。

## 实践案例

### 案例 1：同一份路径，两套打开方式

```rust
// asyncgit/src/sync/repository.rs
pub fn repo(repo_path: &RepoPath) -> Result<Repository> { /* git2 */ }
pub fn gix_repo(repo_path: &RepoPath) -> Result<gix::Repository> { /* gitoxide */ }
```

旧说法「完全不 fork、只用 libgit2」漏了 gix。也漏了钩子和 GPG：`git2-hooks` 与 `sign.rs` 会 `Command::new`。

### 案例 2：行级 stage 改的是 index，不是 `git add`

```text
Files tab → diff 组件
  hunk：stage_hunk() → git2 apply 到 ApplyLocation::Index
  行：stage_lines() → 重写 blob → index.add() → index.write()
```

操作手感接近 [[lazygit]]，落点不同：lazygit 把选区交给 `git apply`，gitui 自己写 index。

### 案例 3：主题和键位都在 RON 里

```text
# 默认位置（XDG / ~/.config/gitui）
theme.ron
key_bindings.ron
# 每仓 UI 状态
.git/gitui
```

`-t` / `-k` 可以改路径。不要把 `theme.ron` 写成 YAML 或 TOML。

## 踩过的坑

1. **把 README 的 Linux 仓库对照表当成这轮实测**：文档写过 24s / 57s / 10MB 这类数字。本轮未跑仓库、未称二进制。
2. **HTTPS 凭据不一定跟 shell 里的 git 一样**：README 要求显式配置 `credential.helper`；代码走 libgit2 `CredentialHelper`，不是 `git credential` 子进程。
3. **LFS / sparse-checkout**：README 写明无 git-lfs、无 sparse repo。这是路线选择，不是漏写的功能列表。
4. **交互 rebase 仍在 1.0 路线图**：这个 tag 能看到 rebase 进行中的状态并 continue / abort，没有 lazygit 那种 todo 编辑器。
5. **不能当唯一 Git 客户端**：README 原文是 “does not fully substitute the git shell”。

## 适用 vs 不适用场景

**适用**：

- 日常 status / stage / commit / log，并且能接受进程内读仓库
- 已经在用 [[ripgrep]] / [[bat]] / [[delta]] 这类 Rust 单二进制工具
- 不需要用户自定义命令表，只改主题和键位

**不适用**：

- 仓库依赖 git-lfs 或 sparse-checkout
- 团队主路径是复杂 interactive rebase——对照 [[lazygit]]
- 需要 `customCommands` 一类插件面
- 要把 README 性能表写成当前环境的测量结论

## 固定版本边界

- 本文绑定 `gitui-org/gitui@e24fb45df1584ee8d8ebdc4258531b4a91ca975d`，tag `v0.28.1` 直接指向该提交。
- `Cargo.toml` 版本 `0.28.1`，`rust-version = "1.88"`，许可 MIT。
- `asyncgit` 同版本；作者字段仍是 `extrawurst <mail@rusticorn.com>`。
- 本文未编译、未启动 TUI、未复测 README benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **「不调 git CLI」不等于「没有任何子进程」**——对象库在进程内，钩子和签名仍可能出去。
2. **性能路径可以换引擎而不换 UI**——同一 crate 里 git2 和 gix 分工。
3. **面板清单要以枚举为准**——`AppTabs` 没有 Branch；分支是弹层。
4. **规范仓库地址会迁组织**——绑定 `gitui-org/gitui`，不要停在旧登录名。

## 应用型自测

1. `get_status()` 在这个 tag 是只走 `git2`，还是也会走 `gix`？
2. 默认顶层 tab 里有没有独立的 Branches 页？
3. `theme.ron` 是 YAML 配置吗？

检查点：

1. 也会走 `gix`。`gix_repo()` 给 status / log walk 用。
2. 没有。五个 tab 是 Status / Log / Files / Stashing / Stashlist。
3. 不是。主题、键位和每仓状态都是 RON。

## 延伸阅读

- 固定源码：[gitui-org/gitui](https://github.com/gitui-org/gitui) —— 本文绑定提交 `e24fb45df1584ee8d8ebdc4258531b4a91ca975d`
- 限制与路线图：该 tag 的 `README.md` §Limitations / §Roadmap
- 键位与主题：`KEY_CONFIG.md`、`THEMES.md`
- [[lazygit]] —— 同品类、git 子进程路线
- [[ratatui]] —— 这个 tag 的 TUI 框架

## 关联

- [[lazygit]] —— porcelain 包装 vs 进程内 git2/gix
- [[tig]] —— 更老的浏览优先 TUI
- [[ratatui]] —— 画面板的 Rust 框架
- [[ripgrep]] —— 同类「绕开外部 CLI、自己读数据」的工程选择
- [[delta]] —— diff 渲染，常和 Git TUI 一起用
- [[fzf]] —— 模糊查找思路的来源之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aider]] —— Aider — 终端 AI 结对编程 CLI
- [[lazydocker]] —— lazydocker — Go 写的 Docker TUI，五面板看容器 / 镜像 / 网络 / 卷
- [[lazygit]] —— lazygit — 以 git 子进程驱动的全功能 Git TUI
- [[projects/nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
- [[tig]] —— tig — 老牌 ncurses git 浏览器，把 log/blame/diff 玩到骨子里
