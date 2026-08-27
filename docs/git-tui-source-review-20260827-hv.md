# Git-TUI source review (writer HV)

> 用途：记录 lazygit、gitui 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HV
- evidence：GitHub metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未编译上游二进制，未运行上游 test、TUI 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## lazygit

- canonical source：`https://github.com/jesseduffield/lazygit`
- revision：`fbe2379fa5831b1ce1a8a836a604652ffc14844f`
- package / tag：`v0.64.1`（annotated tag 剥皮提交；源码树无独立 `VERSION` 常量，运行时版本靠 LDFLAGS / `debug.ReadBuildInfo()`）
- inspected：
  - `go.mod`
  - `main.go`
  - `pkg/app/entry_point.go`
  - `pkg/app/app.go`
  - `pkg/gui/gui.go`
  - `pkg/gocui/gui.go`
  - `pkg/gocui/README.md`
  - `pkg/config/user_config.go`
  - `pkg/config/app_config.go`
  - `pkg/gui/side_panels.go`
  - `pkg/commands/git.go`
  - `pkg/commands/oscommands/cmd_obj.go`
  - `pkg/commands/git_commands/git_command_builder.go`
  - `pkg/commands/git_commands/file_loader.go`
  - `pkg/commands/git_commands/rebase.go`
  - `pkg/commands/git_commands/patch.go`
  - `pkg/app/daemon/daemon.go`
  - `pkg/commands/git_commands/github.go`
- observed：
  - module `github.com/jesseduffield/lazygit`，`go 1.25.0`；依赖含 `tcell/v3`，不含 go-git / libgit2；
  - TUI 入口是 `gui.initGocui()` → 仓内 `pkg/gocui`（community gocui fork）+ tcell v3，不是独立的 `jesseduffield/gocui` 模块；
  - 默认 `gui.sidePanels` 为 5 个窗口：`status` / `files+worktrees+submodules` / `branches+remotes+tags` / `commits+reflog` / `stash`；
  - Git 语义经 `GitCommandBuilder` + `oscommands.CmdObj` 调 `git` 子进程；rebase todo / 仓库状态会直接读写 `.git`；
  - 交互 rebase 设 `GIT_SEQUENCE_EDITOR` 指向 lazygit 自身，再跑 `git rebase --interactive`；
  - 行/hunk stage 走 `PatchCommands.ApplyPatch` → 临时 patch → `git apply --index`；
  - 配置为 YAML：`config.yml`、`customCommands`、`keybinding`；delta 不是默认 `diffRenderers`；
  - GitHub PR 集成会调 `gh auth token` 子进程，而不是只信 in-process go-gh 缓存。
- provenance：tag `v0.64.1^{}` 即上述提交；本轮未编译，因此不把 LDFLAGS 版本字符串当成源码常量。

## gitui

- canonical source：`https://github.com/gitui-org/gitui`
- revision：`e24fb45df1584ee8d8ebdc4258531b4a91ca975d`
- package / tag：`v0.28.1`（lightweight tag；`Cargo.toml` / `asyncgit` 版本均为 `0.28.1`）
- inspected：
  - `Cargo.toml`
  - `asyncgit/Cargo.toml`
  - `build.rs`
  - `src/main.rs`
  - `src/app.rs`
  - `src/args.rs`
  - `src/queue.rs`
  - `src/tabs/mod.rs`
  - `src/keys/key_config.rs`
  - `asyncgit/src/lib.rs`
  - `asyncgit/src/sync/repository.rs`
  - `asyncgit/src/sync/status.rs`
  - `asyncgit/src/sync/hunks.rs`
  - `asyncgit/src/sync/staging/stage_tracked.rs`
  - `asyncgit/src/asyncjob/mod.rs`
  - `asyncgit/src/sync/sign.rs`
  - `git2-hooks/src/hookspath.rs`
  - `README.md`
- observed：
  - `homepage` / `repository` 均为 `gitui-org/gitui`；`extrawurst/gitui` 只读解析到同一仓库；作者字段仍是 `extrawurst`；
  - TUI 栈是 `ratatui 0.29` + `crossterm 0.28`；主循环在 `run_app()`，不是 tokio / async-std；
  - 后台用 rayon（4 线程池）和 `std::thread`，通知走 `crossbeam-channel`；
  - `asyncgit` 同时依赖 `git2 = "0.20"` 与 `gix = "0.78.0"`：`repo()` 开 libgit2，`gix_repo()` 开 gitoxide；status / log walk 走 gix；
  - 顶层 tab 只有 Status / Log / Files / Stashing / Stashlist；分支是 popup，不是第六个 tab；
  - hunk stage 用 git2 `apply` 到 index；行级 stage 重写 blob 后 `index.add()` / `index.write()`；
  - 钩子、GPG、外部编辑器和剪贴板会 spawn 进程；核心仓库读写不走 `git` porcelain；
  - 主题 / 键位 / 每仓状态都是 RON：`theme.ron`、`key_bindings.ron`、`.git/gitui`；
  - README 写明无 git-lfs、无 sparse-checkout，且“does not fully substitute the git shell”；交互 rebase 仍列在 1.0 路线图。
- provenance：tag `v0.28.1` 直接指向上述提交；README 的 Linux 仓库对照表只当文档主张，本轮未复测。
