# CLI-search source review (writer HW)

> 用途：记录 fd、fzf 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-hw` 标记 2026-08-27 平行 writer HW。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HW
- evidence：GitHub metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未编译上游 binary，未运行上游 test、walk benchmark 或交互 TUI
- worktrees：本机 `research-worktrees/`，不进入 Git

## fd

- canonical source：`https://github.com/sharkdp/fd`
- revision：`4f81778774463bf414a184cbe6d5219ad2229646`
- package：crate `fd-find@10.5.0`（源码 tag `v10.5.0`，轻量 tag 直接指向该提交）
- inspected：
  - `Cargo.toml`
  - `README.md`
  - `src/main.rs`
  - `src/cli.rs`
  - `src/config.rs`
  - `src/walk.rs`
  - `src/regex_helper.rs`
  - `src/filetypes.rs`
  - `src/exec/mod.rs`
  - `src/filter/time.rs`
- observed：
  - crate name is `fd-find`, bin name `fd`, `rust-version = 1.90.0`, edition 2024;
  - default pattern is unanchored regex against the filename; `--glob` uses `globset`, `--fixed-strings` escapes, `--exact` anchors `^{escaped}$`;
  - smart case reads the regex HIR for a literal uppercase character;
  - walk uses `ignore::WalkBuilder` / `WalkParallel`, not rayon; default threads are `available_parallelism().min(64)`;
  - ignore stack is hidden + `.gitignore` / `.ignore` / `.fdignore` / global `fd/ignore`, with `require_git` on by default;
  - `--exclude` becomes an `ignore` Override with a `!` prefix; `-x` is one-by-one parallel exec, `-X` is batch;
  - Debian packaging note in README: `apt install fd-find` installs `fdfind`.

## fzf

- canonical source：`https://github.com/junegunn/fzf`
- revision：`15f64c492a08f0840b81540c7d1de35737448086`
- package：tag `v0.74.3`（annotated tag object `47c40063c5353814088296ef78b05aa004d0e1f3` 剥皮到该提交）
- inspected：
  - `go.mod`
  - `main.go`
  - `README.md`
  - `src/core.go`
  - `src/reader.go`
  - `src/options.go`
  - `src/pattern.go`
  - `src/algo/algo.go`
  - `src/matcher.go`
- observed：
  - `go 1.23.0`; `main.go` embeds `version = "0.74"` and `revision = "devel"`;
  - Reader: piped stdin if not a TTY; else `$FZF_DEFAULT_COMMAND`; else built-in `fastwalk` walker (`file,follow,hidden`, skip `.git`/`node_modules`);
  - default algorithm is FuzzyMatchV2; pattern characters cannot be omitted or mismatched, and order is preserved;
  - extended-search is on by default: spaces AND term-sets, `|` ORs inside a set;
  - `--filter` prints matches without the TUI; `--preview` starts an external process;
  - `--bash` / `--zsh` / `--fish` / `--nushell` print embedded integration scripts.
