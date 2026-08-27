# Modal editor source review (writer IC)

> 用途：记录 Helix、Kakoune 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。Writer slug：`ic`。未占用 A–AH 或其他开放 PR 的项目 slug。

## 范围与边界

- review date：2026-08-27
- writer：IC
- evidence：GitHub metadata、固定提交静态源码与官方 book / design 文档阅读
- not executed：未编译两仓、未安装 Tree-sitter grammar、未启动 LSP / DAP、未跑上游 test 或交互教程
- worktrees：本机 `research-worktrees/`，不进入 Git

## Helix

- canonical source：`https://github.com/helix-editor/helix`
- revision：`a05c151bb6e8e9c65ec390b0ae2afe7a5efd619b`
- release：GitHub latest `25.07.1`（2025-07-18）
- inspected：
  - `Cargo.toml`（workspace members、`version = "25.7.1"`、`rust-version = "1.82"`）
  - `rust-toolchain.toml`（`channel = "1.82.0"`）
  - `README.md`
  - `docs/vision.md`
  - `helix-term/Cargo.toml`（`default-run = "hx"`、依赖 `helix-lsp` / `helix-dap`）
  - `helix-term/src/main.rs`
  - `helix-term/src/application.rs`
  - `helix-term/src/keymap/default.rs`
  - `helix-core/src/selection.rs`
  - `helix-lsp/src/client.rs`（`Client::start`）
  - `helix-loader/src/lib.rs`（`config_dir` / `runtime_file`）
  - `helix-loader/src/grammar.rs`（`fetch_grammars`）
  - `languages.toml`（`[language-server.rust-analyzer]`、`[[language]] name = "rust"`）
  - `book/src/usage.md`
  - `book/src/from-vim.md`
  - `book/src/languages.md`
  - `book/src/keymap.md`
- observed：
  - annotated tag `25.07.1` peel 后指向本提交；workspace 包版本写的是 `25.7.1`，与日历 tag 少一个前导零；
  - `hx` 入口先解析参数、可选改 cwd、再加载 `Config` 与 `user_lang_loader`，然后 `Application::new` + `app.run(EventStream)`；
  - `Range` 用 gap indexing：`anchor` / `head` 指向字符之间的缝，用户可见区间左闭右开；光标被定义成单宽选区；
  - 默认 keymap 是 selection → action：`w` 先扩到下一词，`d`/`c` 再删/改；`s` 是 `select_regex`，`S` 是 `split_selection`；`,` 是 `keep_primary_selection`，合并选区是 `A-minus` / `A-_`；
  - `v` 进入 select/extend mode，并不是“没有选区模式”；
  - LSP 客户端 `start` 用 `helix_stdx::env::which(cmd)` 找二进制再 `Command::new` spawn，不安装 server；Rust 默认 `language-servers = ["rust-analyzer"]`，`command = "rust-analyzer"`；
  - grammar 用 `hx --grammar fetch|build`，`fetch_grammars` 要求本机有 `git`；
  - `space` 前缀挂 file / buffer / symbol picker、`code_action`、`global_search`；`space G` 标成 Debug (experimental)，对应 `helix-dap`；
  - 本树没有 Steel / Scheme 插件运行时 crate；`docs/vision.md` 把 extensible 写成目标，不是 25.07.1 已落地的插件 ABI。
- provenance note：
  - 本文绑定 tag peel 后的 commit，不绑定 master HEAD 或未发布的 nightly；
  - 未核验 crates.io 发行物，因为编辑器以 GitHub release / 源码 tag 为准。

## Kakoune

- canonical source：`https://github.com/mawww/kakoune`
- revision：`36ad52ebf983c1b23182caccd4f792517235b06d`
- release：GitHub latest `v2026.05.21`（2026-05-21），lightweight tag 直接指向该 commit
- inspected：
  - `README.asciidoc`
  - `CHANGELOG`
  - `Makefile`（`CXXFLAGS-default = -std=c++2b`、version 来自 `.version` / `git describe`）
  - `doc/design.asciidoc`
  - `src/main.cc`（`version_notes`、`-c`/`-C`/`-s`/`-d`/`-p`）
  - `src/remote.hh`
  - `src/selection.hh`
  - `src/normal.cc`（`select_regex` / `split_regex` / `copy_selections_on_next_lines`）
- observed：
  - `version_notes[0].version = 20260521`，与 tag 日期一致；
  - README 要求 C++20 编译器（GCC >= 10.3 或 clang >= 11）；Makefile 默认实际是 `-std=c++2b`；
  - 进程模型是 `Server` 单例 + 多个 client；`-c` 连接已有 session，`-C` 是 2026.04.12 起的 connect-or-create，`-d` 必须配 `-s`，`-p` 把 stdin 当命令发给 session；
  - `Selection` 是面向的 inclusive 区间：`anchor` + `cursor`，`min()`/`max()` 按坐标排序；`SelectionList` 另记 `m_main`；
  - 只有 normal / insertion 两个编辑模式；command prompt 用 `:`，不是第三套改 buffer 的通道（design 文档的 orthogonality）；
  - `s` 在当前选区里保留正则匹配，`S` 按正则切开选区；旧笔记把这两键写反了；
  - `C` / `<a-C>` 把选区复制到后续 / 前面的行；`%` 选整个 buffer；`,` 只留 main；`<a-,>` 去掉 main；
  - `|` 把每个选区交给外部 filter；design 文档明确排序等应走 Unix 工具，而不是编辑器内建；
  - README 写明不计划原生 Windows 版；UI 可选 Terminal 或 JSON UI。
- provenance note：
  - lightweight tag 与 peeled commit 一致，没有 annotated tag 分叉；
  - 未统计源码行数，不沿用旧页“约 3 万行”的估计。
