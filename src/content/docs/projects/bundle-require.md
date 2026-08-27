---
title: bundle-require — 先用 esbuild 打包再加载用户配置
description: 把 TypeScript / ESM 配置打成临时文件，再 import 或 require 回当前进程
来源: https://github.com/egoist/bundle-require
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/egoist/bundle-require
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8ca47fef6353369bc3b49d7ef73fdad239355f0c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.1.0
---

## 是什么

bundle-require 是给 Node 用的**配置加载器**：先用 [[esbuild]] 把一份 `.ts` / `.mjs` / `.js` 打成临时文件，再 `import()` 或 `require` 回来。日常类比：它不像 `tsc` 先盖整栋楼，而像把用户递来的菜单复印成厨房能读的那一页——只打包这一份文件，`node_modules` 默认不打进去。

```js
import { bundleRequire } from "bundle-require"

const { mod, dependencies } = await bundleRequire({
  filepath: "./vite.config.ts",
})
```

固定 `5.1.0` 把 `esbuild >= 0.18` 写成 peer；运行时依赖只有 `load-tsconfig`。仓库 `package.json` 的 version 是 `0.0.0-semantic-release`，发布身份以 npm / tag 为准。

## 为什么重要

不理解这条“打包再加载”的合同，下面这些事会对不上：

- 为什么 Vite 一类工具能直接读 TS 配置，却不是原生 `import("./vite.config.ts")`
- 为什么配置里 `import "lodash"` 不会被打进临时文件，缺依赖会变成运行时 `ERR_MODULE_NOT_FOUND`
- 为什么 `__dirname` 指向源文件，而不是那个 `.bundled_*.mjs`
- 为什么 Jest 里它会改走 CJS `require`

## 核心要点

固定版本可以拆成五步：

1. **先验扩展名**：`filepath` 必须匹配 `/\.([mc]?[tj]s|[tj]sx)$/`，否则立刻抛错。
2. **猜输出格式**：`.ts` / `.mts` / `.mjs` 走 ESM；`.js` 看工作目录 `package.json` 的 `type`；其余 CJS。检测到全局 `jest` 时强制 CJS。
3. **esbuild 只打内存**：`platform: "node"`、`bundle: true`、`write: false`、`metafile: true`、inline sourcemap。`tsconfig` paths 转成正则后进入 `notExternal`，才会被打进产物。
4. **两个插件改语义**：`externalPlugin` 把 `node_modules` 和 bare specifier 标 external（入口本身已在 `node_modules` 时默认关掉这项）；`injectFileScopePlugin` 用 `define` 把 `__dirname` / `__filename` / `import.meta.url` 换成注入变量，再在 `onLoad` 写成源路径。
5. **写旁路文件再加载**：默认输出 `源文件.bundled_{randomId}.{mjs|cjs}`，ESM 用 `pathToFileURL` + `import()`，CJS 用 `require` / `createRequire`。成功后默认 `unlink`；`preserveTemporaryFile` 或环境变量 `BUNDLE_REQUIRE_PRESERVE` 会留下文件。`dependencies` 来自 `metafile.inputs`。

## 实践示例

### 案例 1：加载一份 TS 配置

```js
import { bundleRequire } from "bundle-require"

const { mod } = await bundleRequire({
  filepath: "./project/vite.config.ts",
})
```

调用方拿到的是整份 namespace，不会自动解包 `default`。这和 [[unrun]] 默认 `preset: "none"` 不同。

### 案例 2：保留临时产物方便对照

```js
await bundleRequire({
  filepath: "./config.ts",
  preserveTemporaryFile: true,
  getOutputFile: (filepath) => filepath.replace(/\.[cm]?[tj]sx?$/, ".bundled.mjs"),
})
```

测试夹具用固定文件名断言文件还在。默认实现会把扩展名换成带随机后缀的 `.mjs` / `.cjs`，避免模块缓存撞车。

### 案例 3：让 tsconfig paths 被打进去

```js
const { mod } = await bundleRequire({
  filepath: "./src/input.ts",
  cwd: "./fixture/resolve-tsconfig-paths",
})
```

`load-tsconfig` 读到 `compilerOptions.paths` 后，这些别名变成 `notExternal`。其余 bare import 仍然 external，运行时再解析。

## 踩过的坑

1. **没装 peer `esbuild`**：它不随包带引擎。漏装会在 `build()` 处失败，不是加载阶段。
2. **把 `node_modules` 当成会被打进去**：默认 external。测试夹具里 `import "foo"` 会以 `ERR_MODULE_NOT_FOUND` 失败。
3. **以为临时文件在 OS tmp**：默认写在源文件旁边。目录只读或被同步器扫到半成品时会出问题。
4. **在 Jest 里还按 ESM 想**：`usingDynamicImport` 在 `typeof jest !== "undefined"` 时为 false，格式和加载器都走 CJS。
5. **用 README 的下载量或“和 Vite 一样快”做选型**：本页没有复跑 benchmark，也没有审查 Vite 源码。

## 适用 vs 不适用场景

**适用**：

- 工具要在 Node 里读一份用户 TS / ESM 配置，接受 esbuild 做转译器
- 需要拿到被打进产物的本地依赖列表（`metafile.inputs`）
- 想用 `onRebuild` / esbuild `context().watch()` 在配置改动后重新加载

**不适用**：

- 没有 `esbuild` peer、或不想在用户机器上再装一个打包器
- 必须把配置依赖打进同一份产物，而不是运行时再解析
- 需要类型检查：它只转译，不做 `tsc --noEmit`
- 运行时不是 Node（`platform: "node"` 写死）

## 固定版本边界

- 本文绑定 `egoist/bundle-require@8ca47fef...`，lightweight tag `v5.1.0`，与 npm `bundle-require@5.1.0` 的 `gitHead` 一致。
- 双通道导出：`import` → `dist/index.js`，`default` → `dist/index.cjs`。
- Node `^12.20.0 || ^14.13.1 || >=16.0.0`。
- 未安装依赖、未跑 vitest 或打包，状态保持 `UNVERIFIED`。

## 学到什么

1. **配置加载器的合同是“打什么、留什么在外面”**，不是“能跑 TypeScript”一句话。
2. **源文件身份要靠注入保住**——临时产物的路径不能泄漏成 `__dirname`。
3. **peer bundler 把引擎成本推给调用方**，也把版本选择权留下。
4. **测试替身会改加载通道**——Jest 不是可忽略的环境细节。

## 应用型自测

1. `bundleRequire({ filepath: "./app.ts" })` 默认返回的是 `mod.default` 还是整个 namespace？
2. 入口文件已经位于 `node_modules` 时，`externalNodeModules` 的默认值是什么？
3. 检测到全局 `jest` 时，`.ts` 还会被猜成 ESM 吗？

检查点：

1. 整个 namespace。它不自动解包 `default`。
2. `false`。源码是 `options.externalNodeModules ?? !filepath.match(/node_modules/)`。
3. 不会。`usingDynamicImport` 为 false 时 `guessFormat` 直接返回 `"cjs"`。

## 延伸阅读

- 仓库 README：[egoist/bundle-require](https://github.com/egoist/bundle-require)
- 固定源码：[egoist/bundle-require](https://github.com/egoist/bundle-require) —— 本文绑定 `8ca47fef6353369bc3b49d7ef73fdad239355f0c`
- 审查记录：仓库内 `docs/ts-bundle-load-source-review-20260827-gf.md`
- [[unrun]] —— 用 Rolldown 做同类加载，并提供 `bundle-require` preset
- [[esbuild]] —— 本页钉住的打包引擎
- [[vite]] —— README 举的典型调用方，本页未审查其源码

## 关联

- [[unrun]] —— Rolldown 路线的运行时加载器，默认可兼容这份返回形态
- [[esbuild]] —— peer bundler 与转译器
- [[vite]] —— 历史用例：加载用户 `vite.config.ts`
- [[rolldown]] —— 另一条“先打包再执行”的引擎
- [[oxc]] —— Rolldown 下游解析/变换组件，不是本页引擎

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[unrun]] —— unrun — 用 Rolldown 在运行时加载任意 JS/TS
