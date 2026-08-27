# Linter / formatter source review (writer AK)

> 用途：记录 ESLint、Prettier 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer AK
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、autofix、format 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改 `biome`、`oxlint`、`oxc`，也未触及 open PR #47-#85 已占用的 slug

## ESLint

- canonical source：`https://github.com/eslint/eslint`
- revision：`5c8c2417b9ff462f2dc4e54a062c59135b45b845`
- package：`eslint@10.9.1`
- tag：`v10.9.1`
- provenance：GitHub annotated tag 与 npm `gitHead` 均指向同一提交；`package.json` 版本为 `10.9.1`
- inspected：
  - `package.json`
  - `bin/eslint.js`
  - `lib/api.js`
  - `lib/cli.js`
  - `lib/options.js`
  - `lib/eslint/eslint.js`
  - `lib/eslint/eslint-helpers.js`
  - `lib/linter/linter.js`
  - `lib/config/default-config.js`
  - `lib/config/config-loader.js`
  - `lib/config/flat-config-schema.js`
  - `lib/services/warning-service.js`
- observed：
  - CLI 入口是 `bin/eslint.js` → `lib/cli.js` 的 `execute()`；`--init` 与 `--mcp` 分别 spawn `npm init @eslint/config@latest` 和 `npx @eslint/mcp@latest`，不在本仓实现；
  - 配置只认 `eslint.config.js` / `.mjs` / `.cjs` / `.ts` / `.mts` / `.cts`；找不到且未关查找时抛 `Could not find config file.`；
  - 默认 config 只提供 `@/js` language、规则 Proxy 懒加载、`**/*.js`/`**/*.mjs` glob、`**/*.cjs` 的 `sourceType: commonjs`，以及 `**/node_modules/` 与 `.git/` ignore；**不含 recommended 规则集**；
  - `.eslintignore` 只发 warning；flat config 里出现 eslintrc 键会按 schema 报错；
  - `ESLint.lintFiles()` 默认 `concurrency: "off"`；非 `off` 才走 worker thread；空 pattern 默认 lint `"."`；
  - `Linter.verifyAndFix()` 最多 10 轮，检测循环 fix；`--fix` 才调用 `ESLint.outputFixes()` 写盘；stdin 禁止 `--fix`，只能 `--fix-dry-run`；
  - 退出码：打印失败或未裁剪 suppressions 为 2；有 error 或超过 `--max-warnings` 为 1；否则 0。`engines.node` 为 `^20.19.0 || ^22.13.0 || >=24`。

## Prettier

- canonical source：`https://github.com/prettier/prettier`
- revision：`8f0c95057cc91d5836409466cd9d9af3bb901e84`
- package：`prettier@3.9.6`
- tag：`3.9.6`
- provenance：GitHub annotated tag `3.9.6` 剥开后指向 `8f0c95057...`，仓库 `package.json` 版本为 `3.9.6`。npm `prettier@3.9.6` 的 `gitHead` 为 `bd676aae6a3805672a21d02198e5d17c9cb1a97b`，在 canonical remote 不可达；本文以 GitHub tag 提交为准，不猜测 npm gitHead。
- inspected：
  - `package.json`
  - `bin/prettier.cjs`
  - `src/index.js`
  - `src/main/core.js`
  - `src/main/core-options.evaluate.js`
  - `src/cli/index.js`
  - `src/cli/format.js`
  - `src/config/resolve-config.js`
  - `src/config/prettier-config/config-searcher.js`
  - `src/document/printer/printer.js`
- observed：
  - 公开 `format()` 调用 `formatWithCursor()` 且把 `cursorOffset` 设为 `-1`；`check()` 是 `format(text) === text`；
  - `coreFormat()` 主链是 `parseText` → `printAstToDoc` → `printDocToString`；doc IR 含 group / fill / if-break / indent / line，printer 用 `MODE_FLAT` / `MODE_BREAK` 和 `fits()`；
  - `formatWithCursor()` 会剥 BOM、把 CRLF 归一成 LF，再按 `endOfLine` 还原；`requirePragma` 或 `checkIgnorePragma` 命中时原样返回；
  - 默认 `printWidth: 80`、`tabWidth: 2`、`useTabs: false`、`endOfLine: "lf"`；`engines.node` 为 `>=22`；
  - 配置搜索顺序从 `package.json` / `package.yaml` 的 prettier 字段开始，再到 `.prettierrc*` 与 `prettier.config.*`；editorconfig 需显式打开；
  - CLI `--write` 只在输出与输入不同时写盘，以免打坏 mtime cache；`--check` / `--list-different` 发现未格式化文件时 exit 1；解析失败 exit 2；`--check` 与 `--list-different`、`--write` 与 `--debug-check` 互斥。
