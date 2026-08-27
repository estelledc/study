---
title: tshy — 用两次 tsc 发出 ESM 与 CommonJS 的 TypeScript 杂交器
description: 介绍 tshy 4.1.3 如何用两次 NodeNext tsc、临时 package.json 和 exports 映射做双方言发布，而不是打成单文件 bundle。
来源: https://github.com/isaacs/tshy
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/isaacs/tshy
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b695e201caa7232767ade0cfb5e75f244fd8e41c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.1.3
---

## 是什么

tshy 是 Isaac Schlueter 的 **TypeScript HYbridizer**：给 Node 包同时发出 ESM 和 CommonJS，并改写 `package.json` 的 `exports`。日常类比：同一份菜谱用两套餐具各做一遍——西餐盘（ESM）和家用碗（CJS）里是同一道菜，但不是把两套餐具焊成一只盘子。

```json
{
  "files": ["dist"],
  "scripts": {
    "prepare": "tshy"
  }
}
```

源码必须放在 `./src`。默认会得到 `dist/esm` 与 `dist/commonjs`，再把 `"."` 的 `import` / `require` 指过去。它调用的是 `tsc` 或 `tsgo`，不是把模块图打成单文件。

## 为什么重要

不理解“两次编译 + 两套宇宙”，就解释不了下面几件事：

- 为什么 `import { Foo } from 'pkg'` 和 `require('pkg')` 拿到的 `Foo` 可以不是同一个构造函数
- 为什么 `src/foo-cjs.cts` 只会进 CommonJS 构建
- 为什么开着 `verbatimModuleSyntax` 的双方言项目会直接退出
- 为什么它和 [[microbundle]] 都能发布“双格式库”，却一个不打包、一个靠 Rollup 收图

## 核心要点

固定 4.1.3 的主链可以拆成五步：

1. **读 `package.tshy`**：默认 `dialects` 是 `esm` 与 `commonjs`。没有写 `exports` 时，若存在 `src/index.ts`，就把它当成 `"."`。`compiler` 只允许 `tsc`（默认）或 `tsgo`。

2. **按方言改文件夹身份**：构建前往 `src/package.json` 写入 `type: "module"` 或 `"commonjs"`，让 TypeScript 的 NodeNext 决议把这次编译当成单一模块系统。

3. **各跑一遍检查器**：`spawnSync(process.execPath, [tsc|tsgo, '-p', '.tshy/esm.json'])` 与 `.tshy/commonjs.json`。产物先落在 `.tshy-build/`，再同步到 `dist/`。

4. **改写 exports**：`./src/foo.ts` 变成 `dist/esm/foo.js` + `dist/commonjs/foo.js`，并补对应 `.d.ts`。`.mts` 不会出现在 `require`，`.cts` 不会出现在 `import`。

5. **可选捷径**：`liveDev: true` 且当前 `npm_command` 不是 `publish` / `pack` 时，改成硬链源文件，不再调用 tsc。`selfLink` 默认把包目录链进 `src/node_modules/<name>`。

## 实践示例

### 案例 1：最小双方言包

```json
{
  "name": "demo-hybrid",
  "type": "module",
  "files": ["dist"],
  "scripts": { "prepare": "tshy" },
  "tshy": {
    "exports": { ".": "./src/index.ts", "./package.json": "./package.json" }
  }
}
```

`exports.ts` 会给 `"."` 同时写 `import`（types + `dist/esm/index.js`）和 `require`（types + `dist/commonjs/index.js`），并按默认补 `main` / `module`。

### 案例 2：用 `-cjs.cts` 把共享状态放进 CJS

```ts
// src/state-cjs.cts
export const state: Record<string, unknown> = {}

// src/state.ts
// @ts-ignore
import cjsState from '../commonjs/state.js'
export const { state } = cjsState
```

`polyfills.ts` 把 `state-cjs.cts` 登记成 `state.ts` 的 CommonJS 覆盖。ESM 构建去加载已经编好的 CJS 状态模块，两边看到同一份对象。

### 案例 3：只发 ESM，或改用 tsgo

```json
{
  "tshy": {
    "compiler": "tsgo",
    "dialects": ["esm"]
  }
}
```

`which-tsc.ts` 会去解析 `@typescript/native-preview/bin/tsgo.js`。tshy 自己的 4.1.3 源码仓就是 `compiler: "tsgo"` 且只编 ESM。多 dialect 时若 `tsconfig` 打开 `verbatimModuleSyntax`，`prevent-verbatim-module-syntax.ts` 会立刻失败。

## 踩过的坑

1. **把 tshy 当成打包器**：它不合并依赖、不 minify。需要单文件浏览器包应看 [[microbundle]]，而不是给 tshy 加 `bundle: true`——源码里没有这个开关。
2. **默认导出两边语义不同**：CJS 编译的 `export default` 是 `{ default: ... }`，不是 `module.exports =`。公开 API 优先用命名导出；必须默认导出时用 `index-cjs.cts` 写 `export =`。
3. **以为 `liveDev` 会进 npm 包**：`build.ts` 在 `npm_command` 为 `publish` 或 `pack` 时强制走真正的 tsc。
4. **把 npm `gitHead` 和 annotated tag 对象当成同一 SHA**：`v4.1.3` 的 tag 对象是 `1cb204af...`，剥皮提交与 npm `gitHead` 才是 `b695e201...`。
5. **把 README 的 TypeScript 6 默认当成已经替你改好了 tsconfig**：v4 只会在 `tsconfig.json` 缺失时新建；旧文件不满足 NodeNext 时要自己删掉重跑。

## 适用 vs 不适用场景

**适用**：

- 源码在 `./src` 的 TypeScript Node 库，要同时给 `import` 和 `require`，并接受两套编译产物
- 需要按文件保留模块边界，而不是打成一条 bundle
- 运行时是 Node 20 或 >=22，调用方尊重 `exports`

**不适用**：

- 要把依赖收进单文件、压体积、出 UMD / modern ESM——那是 [[microbundle]] 的合同
- 目标还是不读 `exports` 的 Node 10 一类解析器；README 写明永不支持
- 必须 `verbatimModuleSyntax` 且同时发两种方言
- 不能接受 dual-package hazard：`instanceof` 跨 `import`/`require` 可能为 false

## 固定版本边界

- 本文绑定 `isaacs/tshy@b695e201caa7232767ade0cfb5e75f244fd8e41c`，源码 tag `v4.1.3`，npm `tshy@4.1.3` 的 `gitHead` 同此提交。
- `engines.node` 为 `20 || >=22`。CLI 只有 `--help` 与 `--watch`。
- 默认编译器是 `tsc`；`tsgo` 解析 `@typescript/native-preview`。README 写明 v4 默认 TypeScript 6。
- 本文未安装依赖、未跑 tsc/tsgo/上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **双格式不等于双打包**——两次 `tsc` 加 `exports` 映射，就能同时服务 ESM 与 CJS。
2. **文件夹里的 `package.json` 就是方言开关**——临时 `type` 字段决定 NodeNext 怎么看这次编译。
3. **两套产物是两个模块身份**——需要跨方言共享状态时，要显式 polyfill，不能靠 `instanceof`。
4. **发布路径会关掉开发捷径**——`liveDev` 只服务本地，不进 pack/publish。

## 应用型自测

1. 默认配置会不会把 `src/foo.mts` 写进 `exports["./foo"].require`？
2. `tshy.liveDev = true` 时执行 `npm publish`，还会不会只做硬链、跳过 tsc？
3. 同时开 `dialects: ["esm","commonjs"]` 和 `verbatimModuleSyntax: true`，构建会怎样？

检查点：

1. 不会。`getTargetForDialectCondition` 在 commonjs 目标上直接丢掉 `.mts`。
2. 不会。`npm_command` 为 `publish` 时走 `buildESM` / `buildCommonJS`。
3. 失败退出。`prevent-verbatim-module-syntax.ts` 拒绝多方言加该选项。

## 延伸阅读

- 文档：[isaacs/tshy README](https://github.com/isaacs/tshy)
- 固定源码：[isaacs/tshy](https://github.com/isaacs/tshy) —— 本文绑定提交 `b695e201caa7232767ade0cfb5e75f244fd8e41c`
- Node 文档：[Dual package hazard](https://nodejs.org/api/packages.html#dual-package-hazard)
- [[microbundle]] —— 对照：零配置把库打成 modern/ESM/CJS/UMD

## 关联

- [[microbundle]] —— 真打包的对照组：Rollup 收图，而不是两次 tsc
- [[rollup]] —— microbundle 的底层；tshy 不经过它
- [[esbuild]] —— 应用侧快速打包，不是 Node 双方言杂交器
- [[vite]] —— 应用 dev/build；库作者若只要 `exports` 双入口，tshy 更窄
- [[bun]] —— 运行时自带打包；tshy 只负责发出两种 TypeScript 检查过的目录

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
