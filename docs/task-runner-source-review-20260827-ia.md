# Task-runner source review (writer IA)

> 用途：记录 just、Mage 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IA
- evidence：GitHub metadata、固定提交静态源码阅读
- not executed：未安装 Rust / Go 工具链，未编译上游，未运行 `just` / `mage` 或上游测试
- worktrees：本机 `research-worktrees/`，不进入 Git

## just

- canonical source：`https://github.com/casey/just`
- revision：`7f4ef81bd6a93faa2b28430912c8e9ab0e3dd29a`
- package：源码 tag `1.58.0`（`Cargo.toml` `version = "1.58.0"`，`VERSION` 取 `CARGO_PKG_VERSION`）
- inspected：
  - `Cargo.toml`
  - `src/main.rs`
  - `src/run.rs`
  - `src/lib.rs`
  - `src/justfile.rs`
  - `src/invocation_parser.rs`
  - `src/recipe.rs`
  - `src/executor.rs`
  - `src/settings.rs`
  - `src/interpreter.rs`
  - `src/analyzer.rs`
  - `src/attribute.rs`
  - `src/cache.rs`
  - `src/subcommand.rs`
  - `src/unstable_feature.rs`
- observed：
  - tag `1.58.0` peeled commit matches `Release 1.58.0 (#3686)`；
  - `rust-version = "1.89.0"`, license `CC0-1.0`；
  - default line shell is `sh` with `["-cu"]`；Windows uses `windows_shell` or `windows_powershell` (`powershell.exe -NoLogo -Command`) only when set；
  - default script interpreter is `sh` with `["-eu"]`；
  - empty invocation uses `Justfile.default`：`[default]` attribute, else lowest line-number root recipe；
  - priors run before the recipe, subsequents after；`[parallel]` parallelizes prior deps；
  - `[cache]` writes `.justcache` with blake3 keys and is gated as unstable `CachedRecipes`；
  - interpolation fragments are evaluated before the shell sees the line.

## Mage

- canonical source：`https://github.com/magefile/mage`
- revision：`0953947c1673fd745a51c032aadeb3c63f9f3368`
- package：tag `v1.17.2`
- inspected：
  - `go.mod`
  - `main.go`
  - `mage/main.go`
  - `parse/parse.go`
  - `mg/deps.go`
  - `mg/runtime.go`
  - `sh/cmd.go`
  - `target/target.go`
- observed：
  - annotated tag `v1.17.2` peels to this commit (`make -h no long require compiling (#552)`)；
  - module `github.com/magefile/mage`, `go 1.18`；binary version comes from `debug.ReadBuildInfo()`；
  - `magefiles/` is preferred when present；root files plus `magefiles/` currently warn and keep the root；
  - current-directory scan keeps only files with the `mage` build tag；`magefiles/` uses ordinary Go tag rules；
  - `mage -l` and `mage -h <target>` return after parse, before `GenerateMainfile` / `Compile`；
  - default target is package-level `var Default`；CLI names are lowercased；namespaces become `recv:name`；
  - supported arg types in generated exec code include string / int / float64 / bool / time.Duration；
  - `mg.Deps` runs goroutines and de-dupes via `sync.Once` on `Name+ID`；
  - cache dir is `MAGEFILE_CACHE` or `~/.magefile`（Windows `HOMEDRIVE+HOMEPATH/magefile`）；
  - `target.Path` compares the named paths only and does not walk directories.
