---
title: importx — 运行时 TS import 的统一门面
description: auto 按矩阵挑 native / tsx / jiti / bundle-require，失败默认回落 jiti
来源: https://github.com/antfu-collective/importx
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/antfu-collective/importx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 18c23bab2652d034e32c0f77b228d1b38a14b3d8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.5.2
---

## 是什么

importx 不是又写一个转译器，而是给“运行时 import TypeScript”提供**统一门面**。日常类比：你只点“一份热菜”，后厨按灶台和忌口决定是原盘上桌、用 tsx、用 [[jiti]]，还是先打包再 import。

```ts
const { import: importx } = await import("importx")
const mod = await importx("./config.ts", import.meta.url)
```

固定 `0.5.2` 只提供 ESM 导出。`importx` 与 `import` 是同一个函数。第二参可以是 `parentURL`（通常 `import.meta.url` 或 `__filename`），也可以是带选项的对象。

## 为什么重要

不理解 importx 的选择矩阵，下面这些事会对不上：

- 为什么同一句 `importx('./x.ts')` 在 Node 20、Deno、Bun 上可能不是同一个 loader
- 为什么 `cache: false` 会让 `auto` 放弃原生 `import()`
- 为什么要依赖列表时，jiti 不再是 `auto` 的第一选择
- 为什么 README 里的 Node 版本和 `src/detect.ts` 对不上

## 核心要点

固定版本的主链可以拆成四步：

1. **归一化入口**：Windows 盘符路径先收成 `file:` URL。相对 specifier 相对 `parentURL` 拼出 `fullPath`。`loader` 缺省读 `IMPORTX_LOADER`，再落到 `auto`。

2. **`auto` 是矩阵匹配，不是手写 if-else 树**：顺序是 `native` → `tsx` → `jiti` → `bundle-require`。每一行声明自己支持的 `cache`、`listDependencies`、`type`、`importTS`。第一行同时满足上下文的就赢。

3. **运行时探测两件事**：`process.features.typescript` 或能 import 仓内 `dummy.mts`，才认为原生 TS 可用。tsx 还要 Node `>=18.19` 或 `>=20.8`，并且 VS Code `microsoft-build` 不低于 `10629634`。

4. **失败默认再试 jiti**：`fallbackLoaders` 默认 `['jiti']`。主 loader 抛错后按集合继续；全失败才把最后一个 error 抛出。成功后把 `ImportxModuleInfo` 记进模块实例的 WeakMap。

## 实践示例

### 案例 1：只要一次 import，不关心缓存

```ts
import { importx } from "importx"

const mod = await importx("./eslint.config.ts", {
  parentURL: import.meta.url,
})
```

`cache` 默认 `null`，表示“无所谓”。`auto` 在能原生吃 TS 时优先 `native`；否则看 tsx 是否可用，再落到 jiti。

### 案例 2：热重载配置必须关掉 ESM 缓存

```ts
const mod = await importx("./vite.config.ts", {
  parentURL: import.meta.url,
  cache: false,
  listDependencies: true,
})
const info = getModuleInfo(mod)
```

`cache: false` 与 `native` 互斥，未设 `ignoreImportxWarning` 会直接抛错。`listDependencies: true` 时，jiti 行的 `listDependencies` 虽是 `[true, false]`，但矩阵里更靠前、又能列依赖的是 tsx；tsx 不可用才落到 jiti / bundle-require。

### 案例 3：显式 loader 与 fallback

```ts
const mod = await importx("./plugin.ts", {
  parentURL: import.meta.url,
  loader: "tsx",
  fallbackLoaders: ["jiti"],
  loaderOptions: { jiti: { interopDefault: false } },
})
```

tsx 适配器：`cache === true` 用带 namespace 的 `register`，否则一次性 `tsImport`。jiti 适配器调用 `createJiti` + `jiti.import`，并把 `cache: false` 映射到 jiti 旧选项名 `cache` / `requireCache`。

## 踩过的坑

1. **按 README 记 Node 下限**：文档写 tsx 需要 `^18.18.0` / `^20.6.0`。`isRuntimeSupportsTsx` 实际是 18.19+ 与 20.8+。以源码为准。

2. **`cache: true` 配 `bundle-require`**：会抛不兼容。固定源码报错字符串误写成 “native loader”。要绕过检查只能 `ignoreImportxWarning`。

3. **兼容表不是 0.5.2 的运行证据**：README 表头写 generated with `v0.4.4`。本页不把它当当前矩阵的实测结果。

4. **canonical 仓库搬家了**：npm / package.json 仍写 `github.com/antfu/importx`，GitHub 301 到 `antfu-collective/importx`。本页绑定后者。

5. **它不会替你装对运行时**：`tsx` 在 Deno / 过旧 Node 上会被矩阵剔除；`jiti` 在 importx 自己的依赖里，但是 CJS 求值语义，和原生 ESM 不是同一份模块实例。

## 适用 vs 不适用场景

**适用**：

- 工具要读 TS 配置，又想把 loader 差异收进一个 API
- 需要按 `cache` / 依赖列表在 native、tsx、jiti、bundle-require 之间自动换
- 已经接受“门面 + 回落”，而不是绑死某一个转译器

**不适用**：

- 必须同步 `require`：importx 只有 async 函数
- 不能接受额外依赖：它声明依赖 `jiti`、`tsx`、`esbuild`、`bundle-require`
- 要把 README 矩阵或未跑过的耗时差当成合同
- 需要本页未核验的浏览器 loader

## 固定版本边界

- 本文绑定 `antfu-collective/importx@18c23bab...`，annotated tag `v0.5.2`，与 npm `importx@0.5.2` 的 `gitHead` 一致。
- 包是 ESM-only：`exports` 只有 `import` / `types`，没有 `require`。
- 默认 `loader=auto`、`cache=null`、`fallbackLoaders=['jiti']`、`listDependencies=null`。
- 未安装依赖、未跑 vitest matrix、未测 loader 耗时，状态保持 `UNVERIFIED`。

## 学到什么

1. **统一 API 的真正产品是选择矩阵**——四个 loader 的能力表比口号重要。
2. **`cache: null` 和 `cache: false` 不是一回事**——前者允许 native，后者把它排除。
3. **文档版本口令要以探测函数为准**——tsx 的 Node 下限写在 `detect.ts`。
4. **回落是默认合同**——主 loader 失败后还会再试 jiti，除非你关掉 `fallbackLoaders`。

## 应用型自测

1. `cache` 默认值是 `false`、`true` 还是 `null`？默认值下 `auto` 还会考虑 `native` 吗？
2. 固定源码认为当前 Node 18.18 支持 tsx 吗？
3. `loader: 'bundle-require', cache: true` 且未开 `ignoreImportxWarning` 会怎样？

检查点：

1. `null`。默认不排除 native。
2. 不支持。`18` 且 minor `< 19` 直接返回 false。
3. 抛不兼容错误；报错文案里的 “native” 是源码笔误。

## 延伸阅读

- 仓库 README：[antfu-collective/importx](https://github.com/antfu-collective/importx)
- 固定源码：[antfu-collective/importx](https://github.com/antfu-collective/importx) —— 本文绑定 `18c23bab2652d034e32c0f77b228d1b38a14b3d8`
- 审查记录：仓库内 `docs/ts-loader-source-review-20260827-fv.md`
- [[jiti]] —— 默认 fallback，也是矩阵里的 CJS 求值器
- [[esbuild]] —— tsx 与 bundle-require 共用的转译/打包引擎

## 关联

- [[jiti]] —— importx 默认回落，以及 `auto` 在不需要原生 ESM 时的常见终点
- [[esbuild]] —— tsx / bundle-require 的底层转译
- [[vite]] —— 常见调用方：读 TS 配置
- [[bun]] —— 原生 TS import 往往让 `auto` 停在 `native`
- [[node-js]] —— `process.features.typescript` 与 loader hook 的宿主
- [[oxc]] —— 另一条 JS/TS 工具链，不是 importx 的 loader

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jiti]] —— jiti — 运行时把 TypeScript / ESM 接进 Node
