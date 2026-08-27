---
title: Knip — 按工作区图找未使用依赖、导出和文件
description: 固定版本把配置、模块图和 DependencyDeputy 收成一条 CLI 分析链
来源: https://github.com/webpro-nl/knip
日期: 2026-08-27
分类: 依赖分析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/webpro-nl/knip
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fc2733dc18c2e3d300183b9e2fe67d3fa54334fa
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.32.3
---

## 是什么

Knip 是一份 TypeScript 写的仓库卫生 CLI。日常类比：它不只问“`package.json` 里有没有多余的名字”，还会顺着入口把文件、导出、二进制和 catalog 连成一张图，再标出没人摸到的节点。

固定 `6.32.3` 的 npm 包名是 `knip`，二进制还有 `knip-bun`。源码住在 `webpro-nl/knip` 的 `packages/knip`。

```bash
pnpm add -D knip
pnpm knip
```

`cli.ts` 先 `createOptions`，再 `run`，最后按 reporter 打印；`--fix` 在打印前调用 `IssueFixer`。

## 为什么重要

不看固定入口，容易把 Knip 说成“更快的 depcheck”：

- 为什么默认会报 unused files / exports，而不只是 dependencies
- 为什么 `--strict` 同时收窄生产面和依赖查找范围
- 为什么独立 `knip.json` 会盖掉 `package.json#knip`
- 为什么 `--fix` 默认不敢删文件

一句话：Knip 的合同是 **workspace 配置 → 模块图 → 按 issue type 结算**。

## 核心要点

固定版本可以把主链拆成五步：

1. **读配置**：按 `knip.json` / `knip.jsonc` / `.knip.json(c)` / `knip.ts` / `knip.js` / `knip.config.ts` / `knip.config.js` 搜索；再和 `package.json#knip` 合并，文件配置覆盖字段。
2. **认工作区**：`pnpm-workspace.yaml` 的 `packages` 或 `package.json#workspaces`；每个 workspace 一份 manifest。
3. **建图**：`build` 用 `WorkspaceWorker` 启用 plugin、收集 entry，再用 `oxc-parser` / `oxc-resolver` 解析导入。
4. **结算**：`analyze` 看未引用文件与导出；`DependencyDeputy.settleDependencyIssues` 对比 referenced 集合。
5. **报告或修复**：默认 reporter 是 `symbols`；issue 超过阈值且未 `--no-exit-code` 时 `exitCode = 1`，异常是 `2`。

`--strict` 会把 `isProduction` 设为 true。production 默认不再报 `devDependencies`、`catalog`、`catalogReferences`。strict 还让 deputy 只看当前 workspace 的 `dependencies` + 必填 peer，不向祖先 hoist。

## 实践示例

### 案例 1：默认扫描，不先写配置

```bash
pnpm knip
```

**逐部分解释**：

1. 没有独立配置文件时，可以用 `package.json#knip`；两者都没有就走 schema 默认值。
2. 默认不包含 `nsExports` / `nsTypes` / `cycles`。
3. 这不会自动进入 production 模式。

### 案例 2：`--strict` 不是“更严的同一套规则”

```bash
pnpm knip --strict
pnpm knip --production
```

`--strict` 蕴含 production，并且依赖查找不再看祖先 workspace。只加 `--production` 不会自动打开这份 hoist 限制。

### 案例 3：`--fix` 和删文件是两道闸

```bash
pnpm knip --fix
pnpm knip --fix --allow-remove-files
```

`IssueFixer` 可以去掉 unused export、dependency、catalog。`removeUnusedFiles` 只有 `isFixFiles` 为真才会 `rm`；它要求 `--allow-remove-files`。

## 踩过的坑

1. **把 182 个生成 plugin 当成每次全开**：`determineEnabledPlugins` 看配置、祖先和 `plugin.isEnabled`。
2. **以为 unused `knip` / `typescript` 一定会被报**：`IGNORED_DEPENDENCIES` 会吃掉这两项，除非它是与 production 同名的 devDependency。
3. **把本页的 oxc 依赖写成 [[oxc]] 页的 0.147.0**：固定包声明 `oxc-parser ^0.143.0`。
4. **`--fix` 等于清理未使用文件**：没有 `--allow-remove-files` 时不会删文件。
5. **把 README 的速度或准确率当成本轮测量**：本文没有跑 CLI。

## 适用 vs 不适用场景

**适用**：

- TypeScript / JavaScript monorepo，需要同时看依赖、导出和未引用文件
- 能接受 Node `^20.19.0 || >=22.12.0`，并且 `engineStrict` 会拒绝更旧的运行时
- 想用 `--production` / `--strict` 分开“生产面”和“开发面”

**不适用**：

- 只要一份 `package.json` 的 unused / missing 名单，不要模块图；那是 [[depcheck]] 的范围
- 必须在无 Node 的环境跑分析
- 需要把静态阅读写成已验证的误报率或耗时

## 固定版本边界

- 本文绑定 `webpro-nl/knip@fc2733dc...`，tag `knip@6.32.3`，npm 包 `knip@6.32.3`。
- npm latest 未带 `gitHead`；版本对齐依据 annotated tag 与仓库 `packages/knip/package.json`。
- 许可为 ISC。`knip-bun` 二进制在同一包内，本页未单独审查 Bun 运行时。
- 本文只做源码静态审查，没有安装依赖或运行 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **unused 依赖只是 issue type 之一**——文件、导出、二进制和 catalog 走同一条图
2. **`--strict` 改的是查找范围，不只是阈值**
3. **配置文件覆盖 `package.json#knip`**，不是两者并集后再投票
4. **修复文件是显式危险操作**，和修 export / dependency 分开

## 应用型自测

1. 只写 `knip --fix`，未使用的源文件会被删除吗？
2. `knip --strict` 还会按默认规则报告 unused `devDependencies` 吗？
3. 同时存在 `knip.json` 和 `package.json#knip` 时，谁覆盖谁？

检查点：

1. 不会。删文件还要 `--allow-remove-files`。
2. 不会。strict 蕴含 production，production 排除 `devDependencies`。
3. `knip.json` 的字段覆盖 `package.json#knip`。

## 延伸阅读

- 官方文档：[knip.dev](https://knip.dev)
- 固定源码：[webpro-nl/knip](https://github.com/webpro-nl/knip) —— 本文绑定提交 `fc2733dc18c2e3d300183b9e2fe67d3fa54334fa`
- 审查记录：仓库内 `docs/unused-dep-source-review-20260827-fx.md`
- [[depcheck]] —— 同赛道里只结算 package.json 依赖的对照
- [[oxc]] —— Knip 使用的 parser / resolver 族，版本不同

## 关联

- [[depcheck]] —— 单包 unused / missing 依赖，不建导出图
- [[oxc]] —— `oxc-parser` / `oxc-resolver` 的上游族；本页不改它
- [[oxlint]] —— 同生态的 lint CLI，不管 unused 依赖
- [[biome]] —— 一体化 lint/format，不是依赖图工具
- [[vite]] —— 常见的上层构建入口，可能被 plugin 识别

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[depcheck]] —— depcheck — 对照 package.json 找未使用和缺失依赖
