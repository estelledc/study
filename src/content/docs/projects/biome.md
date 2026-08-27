---
title: Biome — 把 lint、format 和 assist 收进同一个 CLI
description: 固定版本把 lint、format 和 assist 收进同一条 process_file
来源: https://github.com/biomejs/biome
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/biomejs/biome
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 05797b196eb4412bb373d0825c44b0dd856f4134
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.5.10
---

## 是什么

Biome 是一个用 Rust 写的 Web 工具链 CLI。日常类比：以前 lint、format、整理 import 像三台各带说明书的电器；Biome 把它们收进同一个开关面板，共用一份工作区文档。

固定 2.5.10 的 npm 包是 `@biomejs/biome`，二进制名 `biome`，可选依赖按平台分发 CLI。常见入口：

```bash
npx @biomejs/biome check --write
npx @biomejs/biome ci
```

`check` 可以同时做 lint、assist 和 format；`ci` 走同一条处理链，但只读、不写盘。

## 为什么重要

不看固定源码，容易把 Biome 说成“更快的 ESLint + Prettier”：

- 为什么一个 `biome.json` 能同时关掉 formatter、linter 或 assist，而不必拆成四套 ignore 文件
- 为什么 `--write` 默认不会应用 unsafe fix，GritQL 插件重写通常还要再加 `--unsafe`
- 为什么 `ci` 在 GitHub Actions 里会换 reporter，却仍然拒绝写回
- 为什么“一份 AST 只 parse 一次”在 write 路径上并不总成立

一句话：Biome 的产品判断是**同一工作区、同一 `process_file`**，不是单点工具的重命名。

## 核心要点

固定版本可以把主链拆成四步：

1. **命令选择功能集**：`check` / `ci` 请求 lint + assist + format；单独的 `lint` / `format` 只开其中一部分。
2. **配置合并**：磁盘上的 `biome.json` / `biome.jsonc` 与 CLI 覆盖合并。CLI 覆盖不会重写配置文件里已经关掉的 rules / assist actions。
3. **同一 `process_file`**：CLI 的 `CheckProcessFile` 调用 workspace `process_file`，按文件已支持的 feature 决定是否 lint、assist、format。
4. **写回是显式模式**：没有 `--write` / `--fix` 时只报告 diagnostics 和 format diff；`ci` 的 `requires_write_access` 恒为 false。

`init` 生成的默认配置会打开 formatter（`indentStyle: tab`）、linter 和 assist，并把 `organizeImports` 设为 on。formatter 默认 `lineWidth` 为 80；`formatWithErrors` 默认 false。

## 实践示例

### 案例 1：init 之后一次 check

```bash
npm install --save-dev --save-exact @biomejs/biome
npx @biomejs/biome init
npx @biomejs/biome check --write ./src
```

**逐部分解释**：

1. `init` 在发现 `.gitignore` 时会写入 VCS ignore 集成；发现 `dist/` 时会加 `!!**/dist` 排除。
2. 默认文件名是 `biome.json`；`--jsonc` 才写 `biome.jsonc`。
3. `--write` 只应用 safe lint fix 和 safe assist；要 unsafe 必须再加 `--unsafe`。

### 案例 2：CI 只读，不写盘

```bash
npx @biomejs/biome ci .
```

`ci` 复用 `CheckProcessFile`，但 `FixFileMode` 为空、`requires_write_access=false`。GitHub Actions 下会改用 GitHub reporter。三个功能都被 CLI 关掉时，命令直接报配置不兼容。

### 案例 3：语法错误时 format 可能被拒绝

```bash
npx @biomejs/biome check ./broken.js
```

workspace `process_file` 在文件已有 parse error、且未打开 `formatWithErrors` 时，会把 `format_with_errors_disabled` 置位并跳过 format。这不是“format 更宽松”，而是默认保护。

## 踩过的坑

1. **把 write 路径说成永远只 parse 一次**：fix 或 format 写回后，固定实现会 `parse_process_file_state` 再拉 diagnostics。
2. **以为 `--write` 等于应用全部 fix**：默认 `SafeFixes`；`--unsafe` 才是 `SafeAndUnsafeFixes`。GritQL 插件 rewrite 默认按 unsafe 处理。
3. **`--watch` 和 `--write` / `--fix` 不能组合**：watch 模式明确拒绝落盘修复。
4. **把 README 的 Prettier 兼容率或规则数当成本轮测量**：本文没有跑 compatibility suite 或规则清单统计。

## 适用 vs 不适用场景

**适用**：

- 希望一个 CLI、一份配置同时管 lint / format / import 整理
- 能接受默认 tab + 80 列，或愿意在 `biome.json` 里显式改掉
- CI 需要只读检查，本地再用 `--write` 落盘

**不适用**：

- 必须 100% 复现 Prettier 输出，又没有做目标仓库对比
- 依赖任意 JS ESLint plugin 运行时，而不是 GritQL / 上游内置规则
- 需要把静态阅读写成已验证的性能或兼容性结论

## 固定版本边界

- 本文绑定 `biomejs/biome@05797b19...`，npm 包 `@biomejs/biome@2.5.10`。
- 引擎声明为 `node >=14.21.3`；实际 CLI 是按平台分发的原生二进制。
- 插件扩展在固定源码里走 GritQL，不是任意 Rust/JS plugin ABI。
- 本文只做源码静态审查，没有安装依赖或运行 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **一体化的杠杆是工作区合同**，不是“Rust 一定更快”
2. **safe / unsafe 是写回边界**，不是诊断是否出现的边界
3. **CI 命令的核心保证是只读**，不是另一套规则引擎
4. **默认配置也是产品判断**：tab、80 列、assist 开 `organizeImports`

## 应用型自测

1. `biome ci` 加上 `--write` 会按 `check --write` 那样改文件吗？
2. 只写 `biome check --write`，GritQL 插件的 rewrite 默认会应用吗？
3. 文件有语法错误且未开 `formatWithErrors` 时，`check` 还会格式化吗？

检查点：

1. 不会。`ci` 在固定源码里禁止写盘。
2. 默认不会。插件 rewrite 按 unsafe，需要 `--unsafe`。
3. 默认不会；`format_with_errors_disabled` 会挡住 format。

## 延伸阅读

- 官方文档：[biomejs.dev](https://biomejs.dev)
- 固定源码：[biomejs/biome](https://github.com/biomejs/biome) —— 本文绑定提交 `05797b196eb4412bb373d0825c44b0dd856f4134`
- [[oxlint]] —— 同代 lint-only CLI，配置与插件合同不同
- [[oxc]] —— oxlint 所在的工具链仓库，不是 Biome 的运行时
- [[wadler-prettier]] —— 打印代数的理论来源，不代替本页的 formatter 默认值

## 关联

- [[oxlint]] —— lint-only、ESLint 兼容配置与 JS plugin 边界
- [[oxc]] —— 另一套 Rust JS 工具链；本文不改它的页面
- [[ast-grep]] —— 按 AST 做搜索/改写，和 GritQL 插件相邻
- [[esbuild]] —— 编译器/bundler 路线，不是 linter
- [[vite]] —— 常见的上层构建入口
- [[wadler-prettier]] —— pretty printer 论文

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[depcheck]] —— depcheck — 对照 package.json 找未使用和缺失依赖
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[gh]] —— gh — GitHub 官方命令行
- [[glab]] —— glab — GitLab 官方命令行
- [[just]] —— just — 把 make 拆成两半，只留 ‘命令编排’ 那一半
- [[knip]] —— Knip — 按工作区图找未使用依赖、导出和文件
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[nanostores]] —— nanostores — 不到 1 KB 的"框架无关"状态库
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
- [[shfmt]] —— shfmt — Shell 脚本的 gofmt（用 Go 写的统一格式化器）
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[task]] —— Task — 用 YAML 写一份跨平台的 ‘项目命令清单’
- [[volta]] —— Volta — cd 进项目就自动换 Node 版本的工具链管理器
- [[vscodium]] —— VSCodium — 去微软遥测的 VS Code 干净构建
- [[xh]] —— xh — HTTPie 的 Rust 重写版
