# Linter / formatter source review (writer C)

> 用途：记录 Biome、oxlint 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer C
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、bundle、type-aware 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改 `oxc`、`rolldown`，也未触及 zustand / jotai / tanstack-query / swr / react-hook-form / tanstack-form / mcp-ts-sdk / ollama / aichat / shell-gpt

## Biome

- canonical source：`https://github.com/biomejs/biome`
- revision：`05797b196eb4412bb373d0825c44b0dd856f4134`
- package：`@biomejs/biome@2.5.10`
- tag：`@biomejs/biome@2.5.10`
- provenance：GitHub tag、npm `gitHead` 与 `packages/@biomejs/biome/package.json` 版本一致
- inspected：
  - `packages/@biomejs/biome/package.json`
  - `crates/biome_cli/src/commands/mod.rs`
  - `crates/biome_cli/src/commands/check.rs`
  - `crates/biome_cli/src/commands/ci.rs`
  - `crates/biome_cli/src/commands/init.rs`
  - `crates/biome_cli/src/runner/impls/process_file/check.rs`
  - `crates/biome_service/src/workspace/server.rs`
  - `crates/biome_configuration/src/lib.rs`
  - `crates/biome_configuration/src/formatter.rs`
- observed：
  - `check` 与 `ci` 都走同一套 `CheckProcessFile` → workspace `process_file`，可同时请求 lint、assist 与 format；
  - `ci` 强制只读，`requires_write_access` 为 false；GitHub Actions 下改用 GitHub reporter；
  - `--write` / `--fix` 默认只应用 safe fixes；加上 `--unsafe` 才进入 `SafeAndUnsafeFixes`；
  - `init` 写出 `biome.json`（或 `--jsonc`），默认 formatter `indentStyle: tab`、linter 与 assist 开启，assist 默认打开 `organizeImports`；
  - formatter 默认 `lineWidth` 为 80；`format_with_errors` 默认关闭，语法错误时 `check` 可拒绝 format；
  - write 路径在 fix / format 后会重新 parse 再拉 diagnostics，不能把“一份 AST 只 parse 一次”写成无条件事实。

## oxlint

- canonical source：`https://github.com/oxc-project/oxc`
- revision：`97e99b85483776a72928d675cc05b1cfc1130ba0`
- package：`oxlint@1.80.0`
- tags：`oxlint_v1.80.0` 与 `apps_v1.80.0` 指向同一提交；同提交还发布 sibling `oxfmt v0.65.0`，本文只审查 linter
- provenance：GitHub apps release、`npm/oxlint/package.json` 版本一致；npm latest 未提供 `gitHead`，以 Git tag / 仓库 package 为准
- inspected：
  - `npm/oxlint/package.json`
  - `apps/oxlint/src/main.rs`
  - `apps/oxlint/src/lib.rs`
  - `apps/oxlint/src/command/lint.rs`
  - `apps/oxlint/src/lint.rs`
  - `apps/oxlint/src/run.rs`
  - `apps/oxlint/src/config_loader.rs`
  - `apps/oxlint/src/mode/init.rs`
  - `crates/oxc_linter/src/config/plugins.rs`
  - `crates/oxc_linter/src/table.rs`
  - `ARCHITECTURE.md`
- observed：
  - 独立二进制入口是同步 Rayon lint；`--lsp` 才创建 Tokio runtime；
  - 无 NAPI 的 `main` 以 `ExternalLinter = None` 运行，JS plugin 与 JS/TS config loader 只出现在 Node `lint()` 入口；
  - 默认搜索 `.oxlintrc.json` / `.oxlintrc.jsonc` / `oxlint.config.ts` / `oxlint.config.mts`；JS/TS config 标注 experimental 且需要 Node；
  - CLI 可从每个文件目录向上发现 nested config，除非 `--disable-nested-config`；
  - `--init` 写出 `$schema`、plugins `typescript`/`unicorn`/`oxc`、`categories.correctness=error`；
  - `LintPlugins::default()` 为 `UNICORN | TYPESCRIPT | OXC`；`RuleTable` 把默认开启定义为这些 plugin 中的 `correctness` 规则，并另计 `eslint` 插件名；
  - `--fix` 只开 `SafeFix`；`--fix-suggestions` 与 `--fix-dangerously` 是独立开关；
  - `--type-aware` / `--type-check` 是显式入口；`oxlint-tsgolint` 为 optional peer，本轮未执行。
