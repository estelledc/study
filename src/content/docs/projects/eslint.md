---
title: ESLint — 可插拔的 JS/TS 静态检查器
description: 固定版本只认 flat config；CLI 把 --fix 与 worker 线程拆开
来源: https://github.com/eslint/eslint
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/eslint/eslint
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5c8c2417b9ff462f2dc4e54a062c59135b45b845
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.9.1
---

## 是什么

ESLint 是一个按文件跑规则的 JavaScript / TypeScript **静态检查器**。日常类比：它不像排版机那样重排空格，更像质检员拿着规则清单走过每份源码，发现问题可以标出来，部分问题也能改回去。

固定 10.9.1 的 npm 包名是 `eslint`，二进制同样是 `eslint`。公开 API 从 `lib/api.js` 导出 `ESLint`、`Linter`、`RuleTester` 和 `SourceCode`。常见入口：

```bash
npx eslint .
npx eslint --fix src/app.js
```

`eslint .` 走 CLI 的 `execute()`，对文件调用 `ESLint.lintFiles()`；`--fix` 才会把 `result.output` 写回磁盘。

## 为什么重要

不看固定入口，容易把 ESLint 9/10 仍说成 `.eslintrc` 时代的工具：

- 为什么仓库里没有 `eslint.config.*` 时会直接报 `Could not find config file.`
- 为什么默认并不会打开 recommended 规则，只是先认出 `*.js` / `*.mjs`
- 为什么 `--fix` 对 stdin 不可用，必须改成 `--fix-dry-run`
- 为什么 `--init` 和 `--mcp` 已经不在本仓实现

一句话：10.9.1 的合同是 **flat config + `ESLint` 类 + 可选写回**，不是旧的 `CLIEngine` + `.eslintrc.js`。

## 核心要点

固定版本可以把主链拆成五步：

1. **CLI 选择模式**：`bin/eslint.js` 遇到 `--init` / `--mcp` 会 spawn 外部包；其余参数交给 `lib/cli.js` 的 `execute()`。
2. **构造 `ESLint` 实例**：默认 `concurrency` 是 `"off"`。只有显式打开并发时才用 `fromOptionsModule()` 把选项编码成 data URL，再起 worker。
3. **加载 flat config**：从当前目录向上找 `eslint.config.js` / `.mjs` / `.cjs` / `.ts` / `.mts` / `.cts`。找不到且未关查找就失败。
4. **按文件 lint**：`lintFiles()` 先 glob，再对每个文件取 `getConfig()`。真正跑规则的是 `Linter.verify()`；`--fix` 走 `verifyAndFix()`。
5. **决定退出码**：打印失败、未裁剪的 suppressions 或 `--exit-on-fatal-error` 返回 2；有 error 或超过 `--max-warnings` 返回 1；否则 0。

默认 config **不含 recommended 规则**。它只挂上 `@/js` language、用 Proxy 懒加载 `lib/rules`、匹配 `**/*.js` / `**/*.mjs`，并把 `**/*.cjs` 标成 `sourceType: "commonjs"`。默认 ignore 只有 `**/node_modules/` 和 `.git/`。

`verifyAndFix()` 最多 10 轮。某一轮不再产生 fix 就停；若文本在两轮之间来回跳，会发出 circular-fix warning。

## 实践示例

### 案例 1：最小 flat config

```js
// eslint.config.js
import js from "@eslint/js";

export default [
  js.configs.recommended,
  { files: ["**/*.js"], rules: { eqeqeq: "error" } },
];
```

```bash
npx eslint src/app.js
```

**逐部分解释**：

1. 没有这份文件时，CLI 不会“用空规则默默通过”，而是找不到 config。
2. `js.configs.recommended` 来自独立的 `@eslint/js`，不是 `eslint` 默认数组里的内置项。
3. `files` 决定这条规则覆盖哪些路径；默认 glob 只覆盖 JS/MJS/CJS。

### 案例 2：`--fix` 写盘，stdin 只能预览

```bash
npx eslint --fix src/app.js
echo 'var x = 1' | npx eslint --stdin --fix-dry-run --stdin-filename stdin.js
```

**逐部分解释**：

1. `--fix` 在 `lintFiles()` 之后调用 `ESLint.outputFixes()`，只写 `output` 为字符串且路径绝对的结果。
2. stdin 路径上 `--fix` 被 CLI 直接拒绝，必须改 `--fix-dry-run`。
3. 修复本身在 `Linter.verifyAndFix()` 里循环，最多 10 次，不是“规则各改一次就结束”。

### 案例 3：默认单线程，显式才开 worker

```bash
npx eslint --concurrency auto src
npx eslint --concurrency off src
```

`processOptions()` 和 CLI optionator 都把默认 concurrency 写成 `"off"`。`auto` 才按 `availableParallelism() >> 1` 估 worker 数；选项必须能被 structured clone，否则要改走 options module。

## 踩过的坑

1. **把 `.eslintrc` / `.eslintignore` 当还有效**：flat config schema 会把旧键标成 eslintrc-incompat；`.eslintignore` 只剩 warning，ignore 要写进 config 的 `ignores`。
2. **以为“装了 eslint 就有 recommended”**：默认数组只提供 language 与文件匹配，规则要自己从 `@eslint/js` 或 plugin 打开。
3. **stdin 上用 `--fix`**：CLI 直接返回 2，并提示改 `--fix-dry-run`。
4. **把 TypeScript 配置文件当成永远能加载**：`eslint.config.ts` 在文件名列表里，但原生 TS 加载还受 `unstable_native_nodejs_ts_config` 一类 flag 约束，本轮未执行。

## 适用 vs 不适用场景

**适用**：

- 需要按规则、plugin 和 disable 指令做静态检查的 JS/TS 仓库
- 要把 lint 结果当 API 用：`new ESLint()` + `lintFiles()` / `lintText()`
- CI 里用退出码区分“有问题”(1) 和“跑崩了”(2)

**不适用**：

- 只想统一空格、引号和换行 → 看 [[prettier]] 或 [[biome]]，ESLint 默认不再靠 stylistic 规则撑场面
- 必须保留 `.eslintrc` 级联语义 → 10.9.1 的 schema 会拒绝这套键
- 还没量过 worker 收益就打开 `--concurrency auto` → 文件少时反而可能触发 poor-concurrency warning

## 固定版本边界

- 本文绑定 `eslint/eslint@5c8c2417...`，包版本 `10.9.1`。GitHub `v10.9.1` 与 npm `gitHead` 指向同一提交。
- `engines.node` 为 `^20.19.0 || ^22.13.0 || >=24`。
- 默认 concurrency 为 `off`；autofix 上限 10 轮；默认 ignore 不含 `dist/`。
- 本文未安装依赖、运行 CLI、执行 autofix 或性能对比，状态保持 `UNVERIFIED`。

## 学到什么

1. **flat config 是查找合同，不是风格偏好**——找不到 `eslint.config.*` 就失败。
2. **默认配置很瘦**——language 和 glob 在，recommended 不在。
3. **写回是显式副作用**——`verifyAndFix()` 算文本，`outputFixes()` 才落盘。
4. **退出码把“有 lint 问题”和“执行失败”分开**——CI 不该把 2 当成普通 warning。

## 应用型自测

1. 仓库只有 `.eslintrc.json`，没有 `eslint.config.js`，`npx eslint .` 会怎样？
2. `echo 'x==1' | npx eslint --stdin --fix` 会写回修复后的文本吗？
3. 不打开任何 plugin、也不 import `@eslint/js` 时，`eqeqeq` 会默认报错吗？

检查点：

1. 会因找不到 flat config 失败，不会回退读 `.eslintrc`。
2. 不会。stdin 路径禁止 `--fix`。
3. 不会。默认 config 没有打开 recommended 规则。

## 延伸阅读

- 官方文档：[eslint.org](https://eslint.org/) —— flat config 与 migrate 指南
- 固定源码：[eslint/eslint](https://github.com/eslint/eslint) —— 本文绑定 `5c8c2417b9ff462f2dc4e54a062c59135b45b845`
- 默认入口：`lib/cli.js`、`lib/eslint/eslint.js`、`lib/linter/linter.js`
- [[prettier]] —— 同生态的 opinionated formatter，职责与 lint 分开
- [[biome]] —— 把 lint 和 format 收进同一个 CLI 的对照

## 关联

- [[prettier]] —— format 与 lint 分成两个进程时的常见搭档
- [[biome]] —— 一份 AST 同时做 lint/format 的替代路线
- [[oxc]] —— 同代 Rust 工具链，linter 在 `apps/oxlint`
- [[wadler-prettier]] —— formatter IR 的理论根，不是 ESLint 的主链
