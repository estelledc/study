# Lint / format source review (writer DK)

> 用途：记录 dprint、XO 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL DK
- evidence：固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundle、格式化或 lint
- worktrees：本机 `research-worktrees/`，不进入 Git
- pair：dprint 负责多语言格式化宿主；XO 负责 opinionated ESLint 包装。二者不是官方捆绑产品。XO 默认 `prettier` 关闭，因此可以和 dprint 并列，而不必再走 ESLint + Prettier 或 Biome / oxlint 一体化方案。

## dprint

- canonical source：`https://github.com/dprint/dprint`
- revision：`760591dedde9e7a3f2ee75c917a22413b39cc756`
- package / crate：`dprint@0.56.1`
- provenance：GitHub tag `0.56.1` 与 npm `gitHead` 均为该提交
- inspected：
  - `README.md`
  - `dprint.json`
  - `crates/dprint/Cargo.toml`
  - `crates/dprint/src/format.rs`
  - `crates/dprint/src/commands/formatting.rs`
  - `crates/dprint/src/incremental/incremental_file.rs`
  - `crates/dprint/src/plugins/plugin.rs`
  - `crates/dprint/src/plugins/implementations/mod.rs`
  - `crates/dprint/src/plugins/npm_resolution.rs`
  - `crates/dprint/src/configuration/get_init_config_file_text.rs`
- observed：
  - 宿主本身不内建语言语法树；语言能力来自 WASM 或 process plugin；
  - `fmt` / `check` 都先 resolve config 与 plugin scope，再按 plugin 分组并行处理文件；
  - incremental cache 用 `plugins_hash` + 文件内容 hash；plugin 集合变化会重建 cache；
  - `fmt` 可启用 `ensure_stable_format`，最多再跑 5 次直到输出稳定；`check` 关闭该稳定化；
  - 单文件可经过多个 plugin 串联，并可通过 host format callback 回叫宿主处理嵌套语言；
  - 本仓 `dprint.json` 使用 `npm:` plugin specifier，`exec` plugin 另外带 SHA-256；
  - `dprint init` 只预填 WASM plugin，扫描上限为 1000 个文件 / 1000 个目录。

## XO

- canonical source：`https://github.com/xojs/xo`
- revision：`2775f7fae9f1f7edd253f26298aa0e3f63e7deb6`
- package：`xo@4.0.0`
- provenance：GitHub tag `v4.0.0` 解析到该提交；npm `gitHead` 一致
- inspected：
  - `readme.md`
  - `package.json`
  - `index.ts`
  - `lib/xo.ts`
  - `lib/xo-to-eslint.ts`
  - `lib/resolve-config.ts`
  - `lib/constants.ts`
  - `lib/types.ts`
  - `lib/eslint-adapter.ts`
  - `lib/handle-ts-files.ts`
  - `test/xo/lint-files.test.ts`
  - `test/xo-to-eslint.test.ts`
- observed：
  - XO 是 ESLint 10 wrapper，不是独立 lint 引擎；`lintFiles` / `lintText` 最终调用 `ESLint`；
  - 配置经 cosmiconfig + jiti 读取 `package.json` / `xo.config.{js,mjs,ts,mts}`，再由 `xoToEslintConfig` 转成 ESLint flat config；
  - `space` / `semicolon` 映射到 `@stylistic/*` 规则；`prettier` 为 `true` | `false` | `'compat'`，默认关闭；
  - 未纳入现有 tsconfig 的 TS 文件会写入 `tsconfig.generated.<hash>.json` 才能走 type-aware 路径；
  - ESLint cache 使用 `cacheStrategy: 'content'`，目录名 `xo-linter`；
  - `xo/eslint-adapter` 在 import 时调用 `getProjectEslintConfig()`，之后新增文件要等 ESLint 重载配置；
  - `engines.node` 为 `>=22`；readme 要求项目为 ESM。
