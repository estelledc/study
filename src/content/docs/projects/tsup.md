---
title: tsup — 用 esbuild 默认打 CJS 的零配置库打包器
description: 用 esbuild 默认打出 CJS，可选 Rollup treeshake 与 dts Worker
来源: https://github.com/egoist/tsup
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/egoist/tsup
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1ecb6a5783fc91c73a7426adaa9a5abf3f978f07
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.5.1
---

## 是什么

tsup 是 EGOIST 做的 TypeScript 库打包器。日常类比：它像一台**默认出塑料袋（CJS）的自动包装机**——你把 `src/index.ts` 丢进去，[[esbuild]] 负责切料，可选再让 [[rollup]] 补一刀 treeshake 或打 `.d.ts`。

固定 `v8.5.1` 的口号仍是 “Bundle your TypeScript library with no config, powered by esbuild”。同一份 README 也写明：**项目不再积极维护**，迁移目标指向 Rolldown 系的 tsdown。本页只读这个 tag，不审查 tsdown。

```bash
npm i -D tsup
npx tsup src/index.ts
```

Node 引擎声明为 `>=18`。两个 bin：`tsup` 与 `tsup-node`（后者只是 `skipNodeModulesBundle: true`）。

## 为什么重要

不理解 tsup，下面这些事都没法解释：

- 为什么“零配置”打出来的往往是 CJS，而不是你以为的 ESM
- 为什么帮助文本写 `--target es2017`，真实默认却可能是 `node16`
- 为什么 `tsup-node` 不是另一套打包器
- 为什么开 `--dts` 时 `clean` 会故意留下 `.d.ts`

## 核心要点

1. **默认合同是 CJS + `dist` + Node**：`normalizeOptions` 把 `format` 收成数组，缺省 `['cjs']`，`outDir` 为 `dist`，`platform` 为 `node`，`bundle` 默认为 `true`。`target` 先看 tsconfig 的 `compilerOptions.target`，再落到 `node16`。CLI 开了 `ignoreOptionDefaultValue`，帮助里的 `es2017` 不会自动写进选项。

2. **主链是 plugin 容器 → esbuild → 手工落盘**：每个 format 各跑一遍。插件顺序是 shebang → 用户 plugin → Rollup treeshake → CJS splitting → `cjsInterop` → SWC target → size reporter → terser，然后 `runEsbuild`。esbuild 设 `write: false`，文件由 plugin 容器收尾写出。`dtsTask` 与 JS 构建并行；常规 `--dts` 丢进 Worker 跑 `rollup.js`，不能和 `experimentalDts` 同时开。

3. **依赖默认外置，协议默认剥 `node:`**：`dependencies` / `peerDependencies` 编成 external 正则。`removeNodeProtocol` 默认 `true`，源码注释说下一主版本会翻成 `false`。`tsup-node` 只多开 `skipNodeModulesBundle`。

4. **扩展名看 `package.json` 的 `type`**：`type: module` 时 CJS 走 `.cjs` / `.d.cts`；非 module 时 ESM 走 `.mjs` / `.d.mts`；IIFE 走 `.global.js`。

## 实践示例

### 案例 1：只丢入口，拿到默认 CJS

```bash
npx tsup src/index.ts
```

没有 `--format` 时产物是 CJS。配置文件按 `tsup.config.ts` / `.cts` / `.mts` / `.js` / `.cjs` / `.mjs` / `.json` 或 `package.json#tsup` 解析，TS 配置经 `bundle-require` 加载。

### 案例 2：双格式 + 声明，注意 clean 边界

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
});
```

`dts` 与 `experimentalDts` 同时为真会直接抛错。`clean` 在声明任务开启时会排除 `**/*.d.{ts,cts,mts}`，因为声明在另一个进程里，可能比 JS 更早开工。

### 案例 3：`tsup-node` 只改 external 策略

```bash
npx tsup-node src/cli.ts --format esm
```

它调用同一个 `main()`，只是带上 `skipNodeModulesBundle: true`。不是另一条编译器。

## 踩过的坑

1. **把帮助文本的 `--target es2017` 当成真实默认**：没传 flag 时走 tsconfig 或 `node16`。
2. **以为默认已经是 ESM**：`format` 缺省是 `['cjs']`。
3. **把 `--treeshake` 当成“这才开始摇树”**：esbuild 本身会 treeshake；该开关是对每个 chunk 再跑一遍 Rollup。开了它（或 CJS 还开 splitting）时，esbuild 会先按 ESM 出码。
4. **给多导出模块开 `cjsInterop`**：只有 CJS 入口 chunk、且 `exports` 恰好是 `['default']` 时，才会补 `module.exports = exports.default`。
5. **把 README 的“不再积极维护”读成“8.5.1 不能用”**：本页绑定的是仍可安装的 latest tag，不是迁移指南。

## 适用 vs 不适用场景

**适用**：

- 想用 esbuild 快速打库，接受默认 CJS / Node / `>=18`
- 需要 `esm` + `cjs` + Worker 里的 `.d.ts`，但不想自己拼 Rollup 配置
- 对照 [[unbuild]]：一边是“入口文件进 esbuild”，一边是“从 package.json 推断多 builder”

**不适用**：

- 需要本页保证的持续维护或性能排名——README 已指向 tsdown，本页没有跑 benchmark
- 必须和 Rollup / [[rolldown]] 逐钩子一致，或要把应用级 webpack 配置搬过来
- 同时依赖 `dts` 与 `experimentalDts`
- 默认 watch 下指望改了未导入文件也会重建——`watch === true` 只盯 buildDependencies（`package.json` 会比依赖哈希）

## 固定版本边界

- 本文绑定 `egoist/tsup@1ecb6a57...`，annotated tag `v8.5.1` 剥到该提交；npm `tsup@8.5.1` 无 `gitHead`。
- 依赖钉住 `esbuild ^0.27.0`、`rollup ^4.34.8`；可选 peer 含 TypeScript / SWC / PostCSS / api-extractor。
- 未安装依赖、运行 vitest / 真实打包或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **“零配置”写的是缺省值，不是“没有合同”**——CJS、`node16`、剥 `node:` 都是合同
2. **帮助文本默认值在 `ignoreOptionDefaultValue` 下不一定生效**
3. **声明和 JS 并行时，clean 必须给另一边留文件**
4. **维护声明要以固定 README 为准**，不能把 still-latest tag 写成已死项目

## 应用型自测

1. 只运行 `npx tsup src/index.ts`、不传 `--format`，默认 format 是什么？
2. `tsup-node` 和 `tsup` 的实现差在哪一个选项？
3. 同时设置 `dts: true` 与 `experimentalDts: true` 会怎样？

检查点：

1. `['cjs']`。`normalizeOptions` 在未给 format 时写成这个数组。
2. 只多了 `skipNodeModulesBundle: true`，仍走同一条 `main()`。
3. 抛错。源码禁止两者同时开启。

## 延伸阅读

- 文档站：[tsup.egoist.dev](https://tsup.egoist.dev)
- 固定源码：[egoist/tsup](https://github.com/egoist/tsup) —— 本文绑定 `1ecb6a5783fc91c73a7426adaa9a5abf3f978f07`
- 审查记录：仓库内 `docs/lib-bundler-source-review-20260827-fy.md`
- [[unbuild]] —— 同主题的 package.json 推断 / 多 builder 对照
- [[esbuild]] —— JS 主链引擎
- [[rollup]] —— 额外 treeshake 与 dts Worker

## 关联

- [[unbuild]] —— 另一条库打包默认合同
- [[esbuild]] —— `runEsbuild` 的实际引擎
- [[rollup]] —— `--treeshake` 与 `--dts` 的后处理
- [[vite]] —— 应用侧常见的另一层封装
- [[rolldown]] —— README 迁移目标 tsdown 所在生态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
