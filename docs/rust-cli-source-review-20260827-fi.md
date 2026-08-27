# bat + bottom source review (writer FI)

> 用途：记录 `bat` 与 `bottom` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fi` 标记 2026-08-27 平行 writer FI，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未编译或运行 `bat` / `btm`，未跑上游测试，未测高亮吞吐、刷新 CPU、bundle 或 star 数
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered + sparse + depth 1，不进入 Git
- slugs：仓库笔记 slug 仍为 `bat` 与 `bottom`

## bat

- canonical source：`https://github.com/sharkdp/bat`
- tag：`v0.26.1`（lightweight tag，直接指向 commit）
- revision：`979ba22628bc9d8171f2cffca2bd5c90c9fc0a9e`
- package：`bat@0.26.1`（MIT OR Apache-2.0）
- rust-version：`1.87`
- default features：`application` + `git`
- inspected：
  - `Cargo.toml`
  - `README.md`
  - `src/lib.rs`
  - `src/bin/bat/main.rs`
  - `src/bin/bat/app.rs`
  - `src/bin/bat/clap_app.rs`
  - `src/bin/bat/config.rs`
  - `src/controller.rs`
  - `src/diff.rs`
  - `src/decorations.rs`
  - `src/paging.rs`
  - `src/output.rs`
  - `src/style.rs`
  - `src/theme.rs`
  - `src/printer.rs`
- observed：
  - 入口是 `App` 解析 clap / 配置文件 / 环境变量后构造 `Config`，再交给 `Controller::run`；高亮资产来自 cache 或内嵌 binary；
  - 语法高亮走 `syntect 5.3.0`（`parsing` feature）；主题默认按配色方案选 `Monokai Extended`（Dark）或 `Monokai Extended Light`（Light）；
  - 交互终端默认 style 是 `Default`：`changes` + `grid` + `header-filename` + `numbers` + `snip`；管道且 `--style=auto` 时落到 `Plain`（无装饰）；
  - Git gutter 来自 `git2` 的 `diff_index_to_workdir`（工作区相对 index，`context_lines(0)`）。符号是 `+` / `‾` / `_` / `~`，对应 Added / RemovedAbove / RemovedBelow / Modified，不是单一的 `-`；
  - 分页枚举默认值是 `Never`，但 CLI 在交互 stdout 上把 auto 设成 `QuitIfOneScreen`；管道时 `Never`。stdin 只有「stdout 是 TTY 且 stdin 不是 TTY」才分页。`-p` 是 `--style=plain`，`-pp` 在 auto 下再关分页。less 常见参数含 `-R` / `-F` / `-K`；
  - 配置文件是「每行一条命令行选项」，路径为 `BAT_CONFIG_PATH` 或 `config_dir/config`，另有 `/etc/bat/config` 系统文件；
  - README 写明 Debian/Ubuntu 包可能把可执行文件装成 `batcat`。
- provenance note：
  - GitHub latest release `v0.26.1`（2025-12-02）的 tag object 类型是 commit，SHA 与 `git rev-parse HEAD` / `git describe --tags --exact-match` 一致。

## bottom

- canonical source：`https://github.com/ClementTsang/bottom`
- tag：`0.14.9`（lightweight tag，直接指向 commit）
- revision：`e22236a928eeb876b2ccaad2f3d1ce5f6450281a`
- package：`bottom@0.14.9`（MIT），`default-run = "btm"`
- rust-version：`1.95.0`（源码注明不是官方 MSRV）
- default features：`deploy` = `battery` + `nvidia` + `zfs`
- inspected：
  - `Cargo.toml`
  - `src/lib.rs`
  - `src/bin/main.rs`
  - `src/constants.rs`
  - `src/event.rs`
  - `src/app.rs`
  - `src/options.rs`
  - `src/options/args.rs`
  - `src/options/config/layout.rs`
  - `src/collection.rs`
  - `src/collection/nvidia.rs`
  - `src/app/data/time_series.rs`
  - `src/utils/process_killer.rs`
- observed：
  - 主循环是采集线程 `Update(Box<Data>)` + crossterm 输入 + ratatui `Painter`；采集层混用 `sysinfo =0.39.6` 与平台专用路径（Linux `/proc` / cgroup、macOS sysctl/IOKit、Windows PDH、`nvml-wrapper`）；
  - 默认 feature 打开 NVIDIA GPU（Linux 另有 AMD 模块）和电池；旧页「不支持 GPU widget」与固定版本不符；
  - 时间序列是 `timeless::data::ChunkedData` 的 SoA，时间按相对现在的反向偏移存储，不是简单定长环形缓冲；默认刷新 1000ms（下限 250ms），默认保留窗口 10 分钟（下限 1 分钟）；
  - 默认布局三行：`cpu` 30、`mem`+`temp`/`disk` 40、`net`+`proc` 30，进程格 `default=true`。自定义 `[[row]]` / `row.child` / `type` / `ratio`；未写 ratio 时按 1；
  - 配置路径优先已存在的 `$HOME/.config/bottom/bottom.toml`，否则 `dirs::config_dir()/bottom/bottom.toml`；macOS 另看 `$XDG_CONFIG_HOME`；
  - 进程键：`/` 或 `Ctrl-f` 搜索（带 pid/cpu/mem/gpu% 等查询），`t`/`F5` 树视图，`dd`/`F9`/`Delete` 打开杀进程对话框。Unix 可用多信号，除非 `--disable-advanced-kill`（此时只发 SIGTERM=15）；Windows 走 `TerminateProcess`。
- provenance note：
  - GitHub latest release `0.14.9`（2026-08-27）的 tag object 类型是 commit，SHA 与本地 sparse clone 一致。
