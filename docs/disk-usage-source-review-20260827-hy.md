# Disk-usage source review (writer HY)

> 用途：记录 dua-cli、dust 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HY
- evidence：GitHub metadata、固定提交静态源码阅读
- not executed：未安装两仓 Rust 依赖，未运行上游 test、CLI 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## dua-cli

- canonical source：`https://github.com/Byron/dua-cli`
- revision：`7baa9266a593fd6b7f7568c741798d76660eb3ab`
- package：`dua-cli@2.43.0`（源码 tag `v2.43.0`，与 `dua-core-v3.2.0` 同指此提交）
- inspected：
  - `Cargo.toml`
  - `crates/dua-lib/Cargo.toml`
  - `crates/dua-lib/src/lib.rs`
  - `src/main.rs`
  - `src/options.rs`
  - `src/common.rs`
  - `src/traverse.rs`
  - `src/inodefilter.rs`
  - `src/aggregate.rs`
  - `src/interactive/app/eventloop.rs`
  - `src/interactive/app/handlers.rs`
  - `src/interactive/widgets/help.rs`
  - `src/interactive/widgets/mark.rs`
  - `README.md`
- observed：
  - binary name is `dua`; default features enable `tui-crossplatform` and `trash-move`;
  - walk lives in `dua-core` 3.2.0 (`crates/dua-lib`) with a crossbeam Injector / LIFO worker pool, not jwalk or rayon;
  - `--format` / `-f` selects byte units; there is no `--format=json-lines`;
  - `aggregate --stack` emits folded stacks; `-d` prints an indented tree;
  - Linux default `--ignore-dirs` is `/proc` `/dev` `/sys` `/run`; macOS default threads is 8, elsewhere `0` expands to `num_cpus`;
  - main-pane `d` toggles a mark; `Ctrl+d` pages down; mark-pane `Ctrl+t` trash and `Ctrl+r` permanent delete;
  - hard links are deduplicated via `InodeFilter` unless `--count-hard-links`; `-A` uses apparent size;
  - workspace package version remains `2.42.0` while `dua-cli` is `2.43.0`.

## dust

- canonical source：`https://github.com/bootandy/dust`
- revision：`8a846f6689f2db6be6ef595239a21ec784d62b57`
- package：`du-dust@1.2.5`（源码 tag `v1.2.5`）
- inspected：
  - `Cargo.toml`
  - `src/main.rs`
  - `src/cli.rs`
  - `src/dir_walker.rs`
  - `src/filter.rs`
  - `src/display.rs`
  - `src/node.rs`
  - `src/config.rs`
  - `README.md`
- observed：
  - crate name is `du-dust`, binary name is `dust`;
  - `walk` uses recursive `read_dir` plus rayon `par_bridge`; default 64-bit stack may grow to 1 GiB;
  - `clean_inodes` drops duplicate `(inode, device)` unless apparent size is on;
  - default line cap is terminal height minus 10, else 30; `-d` or `-j` lifts the cap to `usize::MAX`;
  - `get_biggest` pops a `BinaryHeap` until `number_of_lines` is filled;
  - `-b` disables percent bars; `-s` is apparent size; `-F` keeps files only; `-P` disables the progress bar; `-c` disables color;
  - `-j` serializes the display tree to stdout with `println!`, it does not write a file in the current directory.
