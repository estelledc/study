---
title: oxlint — 编译进二进制的 JS/TS linter
description: lint-only CLI：JSON 配置可移植，JS plugin 只走 Node NAPI 入口
来源: https://github.com/oxc-project/oxc
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/oxc-project/oxc
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 97e99b85483776a72928d675cc05b1cfc1130ba0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.80.0
---

## 是什么

oxlint 是 oxc 仓库里的 **JavaScript / TypeScript linter 应用**。日常类比：它不像 Biome 那样同时管排版；它只做体检，把规则编译进一个 CLI，再按目录向上找配置。

固定 1.80.0 的 npm 包名是 `oxlint`，二进制名同样是 `oxlint`。它住在 `oxc-project/oxc` 的 `apps/oxlint`，不是单独的 GitHub 仓库。同一次 apps release 还发布了 sibling `oxfmt`；本文只审查 linter。

```bash
pnpm add -D oxlint
pnpm oxlint
```

## 为什么重要

不看固定入口，容易把 oxlint 和整个 oxc 工具链、甚至 Rolldown 捆成一句话：

- 为什么独立二进制默认跑不了 JS plugin
- 为什么 `.oxlintrc.json` 到处都能用，而 `oxlint.config.ts` 写着 experimental
- 为什么 `--fix` 不会自动带上 suggestion / dangerous fix
- 为什么 `--type-aware` 是开关，而不是“装了 TypeScript 就自动有类型规则”

一句话：oxlint 的合同是 **lint runner + 配置发现 + 显式能力开关**。

## 核心要点

固定 1.80.0 的主链可以拆成五步：

1. **选入口**：`apps/oxlint` 的 `main` 解析 CLI；`--lsp` 才启动 Tokio，普通 lint 保持同步 Rayon。
2. **找配置**：未传 `--config` 时按 `.oxlintrc.json`、`.oxlintrc.jsonc`、`oxlint.config.ts`、`oxlint.config.mts` 搜索；还可从每个文件目录向上走 nested config。
3. **装规则**：默认 plugin 位是 `unicorn | typescript | oxc`。`--init` 再写上 `categories.correctness = error`。
4. **跑文件**：`Walk` 收集路径，`Linter` / `LintRunner` 出 diagnostics；输出格式包括 default、unix、github、sarif 等。
5. **可选扩展**：JS plugin、JS/TS config loader 走 Node NAPI `lint()`；`--type-aware` / `--type-check` 是另外的显式旗标。

独立二进制的 `main` 以 `ExternalLinter = None` 调用 `CliRunner`。没有 Node 回调时，不要假设 JS plugin 已经在跑。

## 实践示例

### 案例 1：生成默认配置再 lint

```bash
pnpm oxlint --init
pnpm oxlint src
```

**逐部分解释**：

1. `--init` 写 `.oxlintrc.json`，带本地 schema、plugins `typescript` / `unicorn` / `oxc`、以及 `correctness: error`。
2. 不传路径时，walker 从当前工作目录收集文件。
3. 这只启用默认 correctness 合同，不会自动打开 `pedantic` / `nursery`。

### 案例 2：按类别拒绝，再单独放行一条

```bash
pnpm oxlint -D correctness -A no-debugger src
```

CLI 把 `-A` / `-W` / `-D` 从左到右累加。`all` 表示除 `nursery` 外的类别，而且**不会自动开启 plugin**。

### 案例 3：修复开关是三层，不是一个 `--fix`

```bash
pnpm oxlint --fix src
pnpm oxlint --fix --fix-suggestions src
pnpm oxlint --fix-dangerously src
```

`--fix` 只打开 `SafeFix`。suggestion 与 dangerous 必须显式加旗标。把 `--fix` 理解成 ESLint `--fix` 的全集，会漏掉后两层。

## 踩过的坑

1. **以为原生二进制也能加载 JS plugin**：`main.rs` 不传 `ExternalLinter`；plugin 回调定义在 NAPI `lint()`。
2. **把 JS/TS 配置文件当成稳定默认**：源码标注 experimental，且需要经 Node 跑。
3. **`--tsconfig` 不能代替 type-aware**：注释写明 type-aware 仍会自己发现合适的 `tsconfig.json`。
4. **把 sibling `oxfmt` 或 [[oxc]] 页面当成 oxlint 自己的 formatter / parser 课**：本页不覆盖那些合同。
5. **把规则总数或“比 ESLint 快 N 倍”写进结论**：本轮没有统计 `RULES`，也没有跑 benchmark。

## 适用 vs 不适用场景

**适用**：

- 只要 lint、不要 formatter，并愿意用 oxlint 自己的类别 / plugin 开关
- CI 里用 JSON / JSONC 配置，避免 experimental JS config
- 需要 GitHub / Sarif / JUnit 这类机器可读输出

**不适用**：

- 必须在无 Node 的纯二进制里跑 JS plugin
- 需要类型感知规则，但还没装 optional peer `oxlint-tsgolint`、也没验证 `--type-aware`
- 想用同一条命令同时 format；那是 sibling `oxfmt` 或 [[biome]] 的范围

## 固定版本边界

- 本文绑定 `oxc-project/oxc@97e99b85...`，npm 包 `oxlint@1.80.0`。
- 引擎声明为 `node ^20.19.0 || >=22.12.0`；`oxlint-tsgolint` 与 `vite-plus` 是 optional peer。
- npm latest 未带 `gitHead`；版本对齐依据 Git tag 与仓库内 `npm/oxlint/package.json`。
- 本文只做源码静态审查，没有执行 lint、type-aware 或 JS plugin，状态保持 `UNVERIFIED`。

## 学到什么

1. **产品入口和 monorepo 不是同一张卡片**——oxlint 从 oxc 仓库发布，但用户合同是 linter CLI
2. **默认可移植配置是 JSON/JSONC**；JS config 与 JS plugin 绑在 Node 运行时
3. **修复、类型信息和 LSP 都是显式旗标**，不能从“装了 TypeScript”推导出来
4. **默认规则面很窄**：默认 plugin + `correctness`，不是全类别全开

## 应用型自测

1. 直接运行官方二进制 `oxlint`，不经 Node，能加载 JS plugin 吗？
2. `oxlint --fix` 会应用 suggestion 和 dangerous fix 吗？
3. 不传 `--config` 时，子目录里的 `.oxlintrc.json` 默认会被看到吗？

检查点：

1. 不能。无 NAPI 的 `main` 不安装 `ExternalLinter`。
2. 不会。`--fix` 只开 `SafeFix`。
3. 会，除非加了 `--disable-nested-config`。

## 延伸阅读

- 使用指南：[oxc.rs/docs/guide/usage/linter](https://oxc.rs/docs/guide/usage/linter)
- 固定源码：[oxc-project/oxc](https://github.com/oxc-project/oxc) —— 本文绑定提交 `97e99b85483776a72928d675cc05b1cfc1130ba0`
- [[biome]] —— 同一赛道里同时做 lint + format 的对照
- [[oxc]] —— parser / AST / 工具链地基；本页不改写它

## 关联

- [[biome]] —— 一体化 lint/format/assist，对照 oxlint 的 lint-only
- [[oxc]] —— oxlint 所在 monorepo 与 AST 底座
- [[vite]] —— 固定包把 `vite-plus` 列为 optional peer，未在本轮验证
- [[ast-grep]] —— 另一条 AST 搜索/改写路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — 把 lint、format 和 assist 收进同一个 CLI
- [[knip]] —— Knip — 按工作区图找未使用依赖、导出和文件
