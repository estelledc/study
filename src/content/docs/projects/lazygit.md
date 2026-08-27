---
title: lazygit — 以 git 子进程驱动的全功能 Git TUI
description: 介绍 lazygit 如何用仓内 gocui、git 子进程和序列编辑器组织日常 Git 工作流。
来源: https://github.com/jesseduffield/lazygit
日期: 2026-08-27
分类: cli
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/jesseduffield/lazygit
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fbe2379fa5831b1ce1a8a836a604652ffc14844f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.64.1
---

## 是什么

lazygit 是 Jesse Duffield 用 Go 写的 Git 终端界面：把 status、暂存、分支、提交和 stash 放进同一屏，用单键代替一长串 porcelain。日常类比：git CLI 是手写订单，lazygit 是点单屏——菜单在眼前，真正下单时仍把单子递给厨房里的 `git`。

```text
main → app.Start → gui.Run → pkg/gocui MainLoop
                              ↓
                     GitCommand + oscommands.CmdObj
                              ↓
                           git(1) 子进程
```

固定 tag `v0.64.1` 的模块是 `github.com/jesseduffield/lazygit`，`go 1.25.0`。源码树没有独立 `VERSION` 常量；发行版字符串靠编译 LDFLAGS 或 `debug.ReadBuildInfo()`。

## 为什么重要

不读固定 0.64.1 源码，旧教程会把三件事说错：

- 默认侧栏仍是「Status / Files / Branches / Commits / Stash」五个独立面板（实际是 5 个窗口，files / branches / commits 各自带 tab）
- TUI 框架是作者从零写的 gocui（仓内 `pkg/gocui` 是 community gocui 的 fork，后端是 tcell v3）
- 行级 stage 直接改 index（实际先拼 patch，再 `git apply --index`）

它和 [[gitui]] 的分界也在这里：lazygit 跟 git 主仓功能，gitui 把仓库读进进程。

## 核心要点

固定 0.64.1 的主链可以拆成五步：

1. **仓内 gocui + tcell**：`gui.initGocui()` 进入 `pkg/gocui`。`go.mod` 没有独立的 `jesseduffield/gocui` 模块；窗口几何另用 `lazycore/boxlayout`。
2. **五窗口、十个侧栏上下文**：默认 `gui.sidePanels` 是 `status`、`files/worktrees/submodules`、`branches/remotes/tags`、`commits/reflog`、`stash`。`files` / `branches` / `commits` 不能隐藏。
3. **git 子进程是主路径**：`GitCommandBuilder` 拼 argv，`oscommands.CmdObj` 包 `os/exec`。status 走 `git status --porcelain`，commit / push / add 同样 fork `git`。仓内没有 go-git 或 libgit2。
4. **交互 rebase 仍把编辑器交给自己**：`PrepareInteractiveRebaseCommand` 跑 `git rebase --interactive`，并把 `GIT_SEQUENCE_EDITOR` 设成 lazygit 二进制；短命 daemon 按指令改 `.git/rebase-merge/git-rebase-todo`。
5. **YAML 配置 + customCommands**：全局 `config.yml`，每仓还可叠加 `.git/lazygit.yml`。`customCommands` 把任意 shell 绑到键；`git.diffRenderers` 默认为空，delta 要自己配。

## 实践案例

### 案例 1：默认侧栏不是五个孤立面板

```yaml
# pkg/config/user_config.go 默认值
gui:
  sidePanels:
    - [status]
    - [files, worktrees, submodules]
    - [branches, remotes, tags]
    - [commits, reflog]
    - [stash]
```

看起来仍是五栏，但第二栏用 tab 在 files / worktrees / submodules 之间切。旧笔记把「五面板」写成五个上下文，会漏掉 worktree 与 reflog。

### 案例 2：同一文件只暂存一部分

```bash
lazygit
# Files 窗口选中文件后进入 staging view
# 默认 gui.useHunkModeInStagingView: true
# 选中 hunk 或行后，控制器调用 Git().Patch.ApplyPatch
```

`PatchCommands.ApplyPatch` 先把选区写成临时 `.patch`，再执行 `git apply --index`（可加 `--cached` / `--reverse` / `--3way`）。它没有自己实现 index writer。

### 案例 3：把安全 force-push 绑到自定义键

```yaml
# ~/.config/lazygit/config.yml
customCommands:
  - key: 'P'
    command: 'git push --force-with-lease'
    context: 'global'
    description: 'Safe force push'
```

`UserConfig.CustomCommands` 就是这样的 YAML 列表。这是扩展面；gitui 固定 0.28.1 没有对等的用户命令表。

## 踩过的坑

1. **把「fork git」理解成每次刷新都只跑 `git status`**：rebase todo、bare/merge 状态会直接读 `.git`。`NewGitCommand` 在这个 tag 对 bare repo 直接报错。
2. **把 gocui 写成作者原创框架**：`pkg/gocui/README.md` 写明它是 awesome-gocui / jroimartin 的社区 fork。
3. **以为 delta 开箱即用**：`DiffRendererConfig` 支持 `stdinFilter`，默认列表是空的。
4. **把源码树里的 `version` 变量当成 `0.64.1` 常量**：未带 LDFLAGS 构建时会落到 `unversioned` 或短 hash。
5. **把 Windows cmd 渲染崩溃写成这个 tag 的既定事实**：`os_windows.go` 有 cmd.exe 命令行处理；本轮未在 cmd.exe 上复现渲染。

## 适用 vs 不适用场景

**适用**：

- 日常 commit / branch / stash，以及可视化 interactive rebase
- 需要 `customCommands`、每仓 `lazygit.yml` 或 `gh` PR 集成
- 仓库用 LFS、sparse-checkout 等 git 主仓功能，希望 TUI 跟着 `git` 走

**不适用**：

- 脚本或 CI——没有 batch 模式，应直接调 git / [[gh]]
- 只要只读 log / blame——[[tig]] 更窄
- 不能接受「每个动作再起一个 git 进程」的模型——对照 [[gitui]]
- 需要本轮未做的启动耗时或大仓 benchmark 结论

## 固定版本边界

- 本文绑定 `jesseduffield/lazygit@fbe2379fa5831b1ce1a8a836a604652ffc14844f`，annotated tag `v0.64.1` 的剥皮提交。
- 许可为 MIT。`go.mod` 要求 Go 1.25.0。
- GitHub 集成在这个 tag 会再跑 `gh auth token`，避免只信进程内 go-gh 缓存。
- 本文未编译、未启动 TUI、未测大仓刷新，状态保持 `UNVERIFIED`。

## 学到什么

1. **TUI 可以只翻译 git，不重新实现仓库**——兼容性来自 `git` 子进程，成本也来自它。
2. **窗口和上下文不是一回事**——五个 side window 里藏着 worktree、reflog、remote 等 tab。
3. **可视化 rebase 仍是 git rebase**——编辑器变量指向自己，todo 文件还是 git 的格式。
4. **发行版号不一定写在源码常量里**——读 tag 和读 `VERSION` 文件不是同一件事。

## 应用型自测

1. 行级 stage 会不会直接改 `.git/index`，而不经过 `git apply`？
2. 默认侧栏是五个互不相关的面板，还是五个窗口、部分窗口带 tab？
3. 交互 rebase 是 lazygit 自己走 commit graph，还是设置 `GIT_SEQUENCE_EDITOR` 后再调 `git rebase --interactive`？

检查点：

1. 不会。选区先写成临时 patch，再 `git apply --index`。
2. 五个窗口；files / branches / commits 默认与 worktrees、remotes、reflog 等共享 tab。
3. 后者。`PrepareInteractiveRebaseCommand` 把 `GIT_SEQUENCE_EDITOR` 指回 lazygit。

## 延伸阅读

- 固定源码：[jesseduffield/lazygit](https://github.com/jesseduffield/lazygit) —— 本文绑定提交 `fbe2379fa5831b1ce1a8a836a604652ffc14844f`
- 配置说明：仓库内 `docs/Config.md` 与 `pkg/config/user_config.go`
- 代码地图：`docs/dev/Codebase_Guide.md`（注意文档里旧的 `vendor/gocui` 路径，0.64.1 实际是 `pkg/gocui`）
- [[gitui]] —— 同品类、进程内读仓库的对照
- [[tig]] —— 浏览优先、不走全功能写工作流

## 关联

- [[gitui]] —— git 子进程 vs git2/gix 直连
- [[tig]] —— 更老的 ncurses 浏览路线
- [[delta]] —— 可选 diff renderer，不是默认配置
- [[gh]] —— PR 集成会再问它要 token
- [[btop]] —— 同样多窗格 TUI，但看的是主机资源
- [[fzf]] —— 模糊筛选思路相近，常一起进 dotfiles

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aider]] —— Aider — 终端 AI 结对编程 CLI
- [[delta]] —— delta — git diff 的语法高亮分页器
- [[gitui]] —— gitui — 用 git2 与 gix 直连仓库的 Rust Git TUI
- [[lazydocker]] —— lazydocker — Go 写的 Docker TUI，五面板看容器 / 镜像 / 网络 / 卷
- [[lazyvim]] —— LazyVim — lazy.nvim 驱动的 Neovim 发行版
- [[neovim]] —— Neovim — Lua 可扩展 vim 现代分叉
- [[nvchad]] —— NvChad — 极致美观的 Neovim 配置
- [[ranger]] —— ranger — Python 写的 vim 风格三栏文件管理器
- [[tig]] —— tig — 老牌 ncurses git 浏览器，把 log/blame/diff 玩到骨子里
- [[xplr]] —— xplr — 用 Lua 当配置语言的可 hack 终端文件管理器
