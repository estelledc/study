---
title: microbundle — 用 package.json 字段驱动的零配置库打包器
description: 介绍 microbundle 0.15.1 如何按 source/main/module/exports 调 Rollup，并区分 modern 与降级 ESM/CJS/UMD。
来源: https://github.com/developit/microbundle
日期: 2026-08-27
分类: 构建工具
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/developit/microbundle
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c76c41f8317611f7592d8e44c569e8083076f25f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.15.1
---

## 是什么

microbundle 是 Jason Miller 的**零配置库打包器**，底层是 Rollup。日常类比：快递柜按标签分格——你在 `package.json` 写好“从哪取、送到哪一格”，它就按格打出 modern / ESM / CJS / UMD，不必先写一份 rollup.config。

```json
{
  "source": "src/foo.js",
  "main": "./dist/foo.cjs",
  "module": "./dist/foo.module.js",
  "exports": {
    "require": "./dist/foo.cjs",
    "default": "./dist/foo.modern.js"
  },
  "scripts": {
    "build": "microbundle",
    "dev": "microbundle watch"
  }
}
```

`microbundle` 默认等于 `build`。CLI 由 `sade` 提供；默认 format 是 `modern,esm,cjs,umd`。

## 为什么重要

不理解“字段即配置”和 modern 与 esm 的分叉，就解释不了下面几件事：

- 为什么只改 `source` / `main` / `module` / `unpkg`，输出文件名会跟着变
- 为什么 `modern` 还能留下 `async/await`，普通 `esm` 却常被收成 Promise
- 为什么依赖写在 `dependencies` 里不会进包，写在 `devDependencies` 里会
- 为什么它和 [[tshy]] 都能出双格式，却一个收模块图，一个只跑两次 tsc

## 核心要点

固定 0.15.1 的主链可以拆成五步：

1. **找入口**：CLI 参数 → `package.source` → `src/index.{ts,tsx,js}` → 根目录 `index.*` → `package.module`。
2. **拆 format**：`esm` 会被归一成 `es`；若列表里有 `cjs`，它会排到最前面先编。可用 `MICROBUNDLE_MODERN=false` 去掉 modern。
3. **决定外部模块**：默认把 `dependencies` 与 `peerDependencies` 当 external。`devDependencies` 会被打进去。`--external none` 则全收。
4. **按目标改 Babel / 压缩**：`--target` 默认 `web`，此时默认压缩；`node` 默认不压缩，Babel target 写死 `{ node: '12' }`。JSX pragma 默认是 `h`。
5. **modern 走另一条降级**：Rollup 仍输出 `es`，但 Babel 用 `{ esmodules: true }` + `bugfixes`，关掉 `async-to-promises`；Terser 用 `ecma: 2017`。modern 步骤关闭 Rollup cache，避免吃到降级后的缓存模块。

## 实践示例

### 案例 1：用字段对齐四种输出

```json
{
  "name": "tiny-kit",
  "source": "src/index.js",
  "main": "dist/tiny-kit.cjs",
  "module": "dist/tiny-kit.module.js",
  "unpkg": "dist/tiny-kit.umd.js",
  "exports": {
    "require": "./dist/tiny-kit.cjs",
    "default": "./dist/tiny-kit.modern.js"
  }
}
```

`getMain()` 按 format 去读 `module` / `exports` / `cjs:main` / `unpkg`。没有这些字段时，它会用 `x.esm.mjs`、`x.modern.mjs` 这类占位名再替换成实际 stem。

### 案例 2：Node CLI 不要默认压缩

```bash
microbundle --target node --format cjs,esm
```

`prog.js` 在未显式传 `--compress` 时：`target !== 'node'` 才默认压缩。Node 目标还会把 `node:*` 和 Node builtin 标成 external。

### 案例 3：依赖进不进包，看写在哪

```json
{
  "dependencies": { "kleur": "^4.0.0" },
  "devDependencies": { "tiny-glob": "^0.2.8" }
}
```

默认 `external` 包含 `kleur`，不包含 `tiny-glob`。UNRESOLVED_IMPORT 的提示也写了同一条：要内联就装到 `devDependencies`，要运行时依赖就装到 `dependencies`。

## 踩过的坑

1. **把 JSX 默认当成 React**：`--jsx` 默认是 `h`，`--jsxFragment` 默认是 `Fragment`。React 项目要显式改 pragma，或设 `--jsxImportSource`。
2. **以为 `modern` 只是文件名**：它换了 Babel target、关掉 async 降级，并且禁用该步骤的 Rollup cache。普通 `esm` 在 web 目标上仍会跑 `babel-plugin-transform-async-to-promises`。
3. **把 HEAD 当成 0.15.1**：npm / 剥皮 tag 是 `c76c41f8...`；之后的 `9f56e06...` 只是仓库格式化，不在本页范围内。
4. **把 README 示例体积当成测量结果**：文档里的 117b / 194b 是上游示例，本轮未跑 Rollup，也未测 gzip。
5. **以为 `--workers` 默认开启**：CLI 默认 `false`。就算打开，OMT 插件也只挂在 `es` 与 `modern` 上。

## 适用 vs 不适用场景

**适用**：

- 小型 JS/TS 库，想靠 `package.json` 字段一次打出浏览器与 Node 都能用的多格式
- 需要 UMD / unpkg，或想保留 modern 给 `<script type="module">`
- 接受默认把生产依赖当 external、开发依赖打进包

**不适用**：

- 只要 TypeScript 检查过的目录树和 `exports` 映射、不要收图——应看 [[tshy]]
- 应用级 dev server / 代码分割——应看 [[vite]]，不是库打包器
- 必须精确控制 Rollup plugin 顺序，且零配置默认（JSX=`h`、Node 12、web 压缩）不可接受
- 需要本轮未做的体积或浏览器覆盖率数字

## 固定版本边界

- 本文绑定 `developit/microbundle@c76c41f8317611f7592d8e44c569e8083076f25f`，源码 tag `v0.15.1`，npm `microbundle@0.15.1` 的 `gitHead` 同此提交。
- 默认 format 为 `modern,esm,cjs,umd`；`--target` 默认 `web`；JSX pragma 默认 `h`。
- Node 目标的 Babel `targets` 在源码里写死 `{ node: '12' }`。
- 本文未安装依赖、未跑 Rollup/Jest、未测产物体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **库打包器可以把 package 字段当成配置文件**——入口和四种输出都从同一张表读。
2. **modern 与 esm 不是两个文件名**——一条保 ES2017，一条按 web 目标继续降 async。
3. **dependencies 与 devDependencies 在这里是打包边界**——external 默认只认前者和 peer。
4. **零配置仍有 implicit 默认**——`h`、Node 12、web 压缩都写在 CLI / Babel 工厂里。

## 应用型自测

1. 不传 `--compress`、`--target web` 时，会不会走 Terser？
2. 默认配置下，写在 `dependencies` 里的包会不会被打进 bundle？
3. `modern` 步骤会不会复用上一轮 `esm` 的 Rollup cache？

检查点：

1. 会。web 目标默认 `compress === true`，`createConfig` 在 `compress !== false` 时挂 Terser。
2. 不会。默认 `external` 包含 `Object.keys(pkg.dependencies)`。
3. 不会。`format === 'modern'` 时 `cache = false`。

## 延伸阅读

- 文档：[developit/microbundle README](https://github.com/developit/microbundle)
- 固定源码：[developit/microbundle](https://github.com/developit/microbundle) —— 本文绑定提交 `c76c41f8317611f7592d8e44c569e8083076f25f`
- 外部依赖规则：[How Microbundle decides which dependencies to bundle](https://github.com/developit/microbundle/wiki/How-Microbundle-decides-which-dependencies-to-bundle)
- [[tshy]] —— 对照：两次 tsc 发双方言，不收模块图

## 关联

- [[tshy]] —— TypeScript 杂交器；要保留文件边界时用它
- [[rollup]] —— 0.15.1 直接依赖 `rollup@^2.35.1`
- [[preact]] —— 默认 JSX pragma `h` 来自同一作者的习惯
- [[esbuild]] —— 更快的应用/工具打包，不是这套 package.json 约定
- [[vite]] —— 应用构建；库场景才和 microbundle 重叠

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
