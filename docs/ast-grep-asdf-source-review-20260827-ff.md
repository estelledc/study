# ast-grep + asdf source review (writer FF)

> 用途：记录 `ast-grep` 与 `asdf` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ff` 标记 2026-08-27 平行 writer FF，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未编译 Rust / Go，未运行 `sg` / `asdf`，未执行 rewrite / plugin callback / 上游测试，未测启动时间、吞吐或 star
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered 单分支克隆，不进入 Git
- slugs：`ast-grep`、`asdf`；二者均已在 `origin/main` 存在且审计为 `needs-evidence`

## ast-grep

- canonical source：`https://github.com/ast-grep/ast-grep`
- tag：`0.45.2`（lightweight tag）
- revision：`c41e023a64060c9f263c23320aa5ff67be4bc474`
- npm：`@ast-grep/cli@0.45.2` `gitHead` 与 tag 一致
- license：MIT
- rust-version：`1.88.0`；workspace `version`：`0.45.2`；`tree-sitter`：`0.26.3`
- inspected：
  - `Cargo.toml`
  - `crates/cli/Cargo.toml`
  - `crates/cli/src/lib.rs`
  - `crates/cli/src/run.rs`
  - `crates/cli/src/scan.rs`
  - `crates/cli/src/utils/args.rs`
  - `crates/cli/src/utils/worker.rs`
  - `crates/core/src/meta_var.rs`
  - `crates/language/src/lib.rs`
  - `crates/config/src/rule_config.rs`
  - `crates/config/src/rule_core.rs`
  - `crates/config/src/rule/mod.rs`
- observed：
  - 双二进制 `ast-grep` / `sg`；`-p`/`-k` 在首位时可省略 `run`；
  - meta-variable 首字符仅 `A-Z`/`_`；`$abc` 不是变量；`$$$NAME` 为 multi-capture；同名要求精确相等；
  - `SupportLang` 28 个内置语言；`js`/`ts` 等别名大小写不敏感；
  - `run -r` 是 rewrite，`scan -r` 是 rule 文件；`-U` 需要 rewrite；
  - YAML `severity` 为 hint/info/warning/error/off；规则原子项含 pattern/kind/regex 与 inside/has 等关系；
  - 文件遍历为 `ignore::WalkParallel`。

## asdf

- canonical source：`https://github.com/asdf-vm/asdf`
- tag：`v0.20.0`（lightweight tag）
- revision：`150aaf051b3b88ac9ad73136d7e629bbdf332bd6`
- version source of truth：`cmd/asdf/main.go` `var version = "0.20.0"`；`version.txt` 仍为 `0.15.0`
- go：`1.26.3`；license：MIT（2014 Akash Manohar J）
- inspected：
  - `cmd/asdf/main.go`
  - `internal/cli/cli.go`
  - `internal/cli/set/set.go`
  - `internal/config/config.go`
  - `internal/plugins/plugins.go`
  - `internal/versions/versions.go`
  - `internal/resolve/resolve.go`
  - `internal/shims/shims.go`
  - `internal/git/git.go`
  - `internal/toolversions/toolversions.go`
  - `docs/guide/upgrading-to-v0-16.md`
  - `docs/plugins/create.md`
  - `docs/more/faq.md`
  - `CHANGELOG.md`
- observed：
  - 0.16 起为 Go 二进制；`asdf local`/`global`/`shell` 已删除，`asdf update` 仍在但只报移除；
  - `asdf set` 默认写当前目录 `.tool-versions`；`--home`/`-u` 写家目录；`--parent`/`-p` 写最近父文件；
  - 解析顺序：`ASDF_<TOOL>_VERSION`（连字符变下划线）→ 目录向上 `.tool-versions` → 家目录；
  - 插件短名走 `asdf-plugins` 索引；clone `--depth 1`；名正则 `[[:lower:][:digit:]_-]+`；
  - 安装：可选 `download` + 必须 `install`；`system`/`path` 不可装；随后 `GenerateAll` shim；
  - shim 仍是 bash：`exec asdf exec "name" "$@"`；
  - FAQ：WSL1 不官方支持；WSL2 需 Unix 盘工作目录。
