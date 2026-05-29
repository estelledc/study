---
title: rollup ESM-first 库打包器
来源: https://github.com/rollup/rollup + rollupjs.org 官方文档
---

# rollup — tree-shake 的发源地与「ESM-first 库打包器」

## 一句话总结（≥ 12 行）

rollup 是 Svelte 创始人 Rich Harris 在 2015 年开始做的 JS 打包器（bundler），核心命题不是「打 application」，而是「**打 library**」——把分散在多个 ESM 文件里的源代码，合并为单一、扁平、tree-shake 干净、对终端使用方友好的发布产物。它最重大的历史贡献是在 2015 年首次把「dead code elimination via ESM static analysis」这套思路工程化、产品化、命名为 **tree-shake**，整个 JS 工具链从此跟进——webpack 4+ 在 2018 年才把 tree-shake 内置，esbuild / Vite / SWC / Rolldown 全部沿用同一思想。

设计哲学三条线：

1. **ESM-first**：rollup 假设输入就是 ESM（或可通过 plugin 转成 ESM 的代码），完全围绕 `import` / `export` 的静态结构构图、推可达性、合并模块。CommonJS / AMD / IIFE 只是 output format，不是 input mental model。这与 webpack「无所谓 module format，运行时用 `__webpack_require__` 包一切」截然相反
2. **library 而非 application**：rollup 默认输出最小可发布的 library bundle——一个 `index.mjs` + 一个 `index.cjs` + 一份 `.d.ts`，扁平到能直接 `npm publish`。lodash / d3 / Vue 内核 / svelte runtime / Rich Harris 自己的所有项目都用 rollup 出货。webpack 输出的 chunk + manifest + runtime 在库场景下是负担
3. **plugin 链而非 loader 树**：rollup plugin 是线性 hook 链（resolveId → load → transform → buildEnd → renderChunk → generateBundle），没有 webpack 的 loader/resolver/plugin 三层混合。学习曲线低，但深度定制（如 vue-sfc 单文件多语言）需要写更多胶水

性能定位：rollup 用 JS 写（与 webpack 同语种），构建速度比 esbuild / SWC / Rolldown 慢 10-50x，但产物体积、tree-shake 干净度、ESM 输出质量在 library 场景仍是 best-in-class。weekly downloads 大约 30M+，事实上是 npm 上「发布 library」的标准工具——尤其是 Vite 直接把 rollup 选作 production build 引擎，让 rollup 在 application 场景也间接拿到 hundreds of millions 的 build 调用量。

商业生态：纯开源，无 SaaS 商业化，OpenCollective 接受赞助。Rich Harris 2021 年加入 Vercel，rollup 维护从 Rich 个人主导转向核心团队（Lukas Taegert-Atkinson 为主 maintainer）。2024 年的关键剧情是 Rolldown——VoidZero（Evan You 的新公司）用 Rust 重写 rollup-API-兼容的 bundler，目标是把 Vite 底下的 rollup 替换成 Rolldown，速度对齐 esbuild。这意味着 rollup 本身的「速度劣势」在 2-3 年内会被收编，但 rollup 的设计哲学和 plugin API 会作为「上层 spec」继续主导。

![Rollup tree-shake 流程：ESM 静态分析 → dead code 剔除 → output bundle](/projects/rollup/01-tree-shake.webp)

## Layer 0 — 项目档案速查（≥ 18 字段）

| 字段 | 值 |
|---|---|
| 包名 | `rollup` |
| 当前主版本 | v4.x（2026） |
| 首版 | 2015-05 v0.1（Rich Harris 公开） |
| License | MIT |
| 主仓库 | rollup/rollup |
| 维护 | Lukas Taegert-Atkinson（首席）+ 核心团队 + 社区；Rich Harris 战略指导 |
| 实现语言 | TypeScript（核心是 JS，部分 hot path 走 SWC for parse） |
| Bundle 入口 | `rollup` CLI / `rollup` npm 包 |
| 平台支持 | Node.js（Linux / macOS / Windows）；浏览器版 `@rollup/browser` |
| API | `rollup(options)`（programmatic）/ `rollup.config.js`（CLI） |
| 输入 | ESM `.js` / `.mjs` / TS（需 plugin） / Vue SFC（需 plugin） |
| 输出 format | `esm` / `cjs` / `iife` / `umd` / `system` / `amd` |
| 输出文件 | `output.file`（单文件） / `output.dir`（多 chunk） |
| Plugin API | `resolveId` / `load` / `transform` / `buildEnd` / `renderChunk` / `generateBundle` 等 ~25 hook |
| Tree-shake | ESM static analysis + side-effect detection + reachability marking |
| Code splitting | dynamic `import()` 自动拆 chunk + manualChunks 手动指定 |
| Sourcemap | 全链路（input → transform → output）逐级合并 |
| Watch | `--watch` mode + cache reuse；增量重打 |
| Weekly downloads | ~30M+（直接 + 间接 via Vite） |
| GitHub stars | 25k+（截至本笔写作时） |
| 商业版 | 无 |
| 文档站 | rollupjs.org |
| 生态联动 | Vite production build / Svelte runtime / Vue rollup 配置 / lodash-es / d3 |
| 核心创新 | tree-shake 思想发源地（2015）+ ESM-first 架构 |
| 历史地位 | 首个把「dead code elimination via ESM」工程化的 bundler |

> 说明：tree-shake 这个词本身是 Rich Harris 2015 在 rollup 文档里提出的——「import 一棵树，shake 一下，掉下来的叶子就是 dead code」。这个比喻后来成了整个 JS 工具链的通用术语。

## Layer 1 — 核心抽象（≥ 35 行）

rollup 对外 API 的核心只有 4 个抽象：`input` / `output` / `plugins` / `external`。但每个抽象背后都对应一个内部数据结构，理解了它们就理解了 rollup 80%。

```js
// 抽象 1: input —— 入口（单文件 or 多文件 or 虚拟模块）
import { rollup } from 'rollup';

const bundle = await rollup({
  input: 'src/main.js',                     // 单入口
  // input: ['src/a.js', 'src/b.js'],       // 多入口（独立 chunk）
  // input: { main: 'src/main.js', cli: 'src/cli.js' },  // 命名多入口
});

// 抽象 2: output —— 一次构建可产出多种 format
await bundle.write({
  file: 'dist/index.mjs',
  format: 'esm',
  sourcemap: true,
});
await bundle.write({
  file: 'dist/index.cjs',
  format: 'cjs',
  exports: 'named',
});
// 一个 bundle 对象可以 write 多次，复用 module graph，不重复 parse / transform

// 抽象 3: plugins —— 线性 hook 链
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const bundle2 = await rollup({
  input: 'src/main.ts',
  plugins: [
    nodeResolve(),  // 解析 node_modules
    commonjs(),     // 把 CJS 转成 ESM（rollup 内部只懂 ESM）
    typescript(),   // .ts → .js
    terser(),       // minify（renderChunk hook）
  ],
});

// 抽象 4: external —— 不打包，留给运行时
const bundle3 = await rollup({
  input: 'src/main.js',
  external: ['react', 'react-dom', /^lodash/],  // 数组 / 函数 / 正则
  // external 的依赖会保留为 import 语句，由消费方提供
});

// 抽象 5（隐式但很重要）: cache —— 增量重打
let cache;
async function rebuild() {
  const bundle = await rollup({ input: 'src/main.js', cache });
  cache = bundle.cache;  // 下次复用：跳过未变文件的 parse
  await bundle.write({ file: 'dist/main.js', format: 'esm' });
  await bundle.close();
}
```

抽象之间的关系：

```
input
  │
  ▼
┌─────────────┐    plugins (resolveId / load / transform)
│ Module Graph│ ◀── 每个 ESM 模块 = 一个 Module 实例
└─────────────┘
  │
  ▼  tree-shake (reachability + side-effect)
┌─────────────┐
│   Chunks    │ ◀── 按入口 / 动态 import / manualChunks 切分
└─────────────┘
  │
  ▼  renderChunk / generateBundle
output (file / dir, esm / cjs / umd / iife / system / amd)
```

关键设计决策：rollup 不暴露 AST 给 plugin transform——你拿到的是字符串源码，要改 AST 自己 parse（用 `acorn` / `magic-string`）。这与 babel 的 plugin 暴露 AST visitor 不同。代价是改语法树繁琐，收益是 rollup 内部的 AST schema 可以独立演进，不被 plugin 锁死。

## Layer 2 — 内部架构（≥ 50 行）

rollup 内部分 4 个模块：**Bundle**（顶层 orchestrator）/ **Module / ModuleLoader**（模块 + 加载） / **Chunk / chunk 算法**（切分） / **finalisers**（输出格式化）。每一层都有清晰边界。

### Module Graph 构建

`Bundle` 拿到 `input` 后，调用 `ModuleLoader.fetchEntryModule()`，递归解析 import：

```
fetchEntryModule(id)
  ├─ 调 plugins[].resolveId(id, importer)  → 拿到绝对路径 / virtual id
  ├─ 调 plugins[].load(resolvedId)         → 拿到源码字符串
  ├─ 调 plugins[].transform(code, id)      → 链式串接，每个 plugin 可改 code
  ├─ acorn.parse(code)                     → 拿到 AST（本地保存，不暴露 plugin）
  ├─ 扫 ImportDeclaration / ExportDeclaration
  └─ for each import → 递归 fetchEntryModule
```

每个文件在内存里变成一个 `Module` 对象，含：

- 源码 + AST + sourcemap chain
- `dependencies: Module[]` —— 它 import 了谁
- `dynamicDependencies: Module[]` —— 动态 import 的谁
- `imports / exports` 元数据（名字、来源模块、是否 reexport）
- `usedBindings: Set<string>` —— tree-shake 阶段标记
- `sideEffects: boolean` —— 来自 `package.json` 的 `sideEffects` 字段或 plugin

整个依赖图是有向图（可能有环——ESM 允许循环 import）。rollup 在构建图时记录 `cycles`，输出阶段处理。

### Tree-shake 算法（reachability + side-effect）

这是 rollup 的「灵魂」。算法分两步：

**步骤 A：从入口出发标记 used bindings**

```
markUsed(entryModule)
  for each import in entryModule:
    target = import.resolvedModule
    binding = import.importedName
    target.usedBindings.add(binding)
    markUsed(target)  // 递归
```

终态：每个 module 的 `usedBindings` 是「从某个入口可达的 export 名集合」。

**步骤 B：渲染时跳过 unused declarations**

```
renderModule(module)
  for each declaration in module.ast:
    if declaration is `export const X` and X not in usedBindings:
      // 检查 init 表达式是否有 side-effect
      if isPure(declaration.init):
        skip()  // 完全跳过，不输出
      else:
        emit(declaration.init)  // 保留 side-effect, 但移除 export
```

`isPure` 的判断很微妙——`const x = 1` 显然 pure，`const x = computeSomething()` 在 rollup 看来默认 unsafe（除非 `package.json` 的 `sideEffects: false` 或 `/*#__PURE__*/` 注释明示）。这套保守策略是 tree-shake 安全性的根本保障。

`链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/Module.ts`

### Chunk 切分算法

多入口或动态 import 场景下，rollup 需要决定「哪些 module 进哪个 chunk」。算法本质：**给每个 module 算一个 entry-bitmask（它被哪些入口可达），相同 bitmask 的 module 进同一个 chunk**。

```
for each module M:
  M.entryMask = 0
for each entry E_i (i = 0..n-1):
  for each module M reachable from E_i:
    M.entryMask |= (1 << i)

groupBy(allModules, m => m.entryMask)
  → 每组 = 一个 chunk
```

举例：3 个入口 `a / b / c`，模块 `shared.js` 被三个入口都引用 → `entryMask = 0b111` → 进 `shared-XXX.js` chunk；模块 `only-a.js` → `entryMask = 0b001` → 进 `a.js` chunk。这套算法保证：每个 module 只出现在一个 chunk，且 chunk 数量在「无重复 vs 入口独立」之间取最优。

`链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/utils/chunkAssignmentBuckets.ts`

### Finaliser（输出格式化）

最后一步把每个 chunk 渲染成具体 format 的源码：

| Format | 用途 | 输出形态 |
|---|---|---|
| `esm` | 现代 library / Node ESM | 原汁原味 `import` / `export` |
| `cjs` | 老 Node / 传统 npm | `module.exports = { ... }` + `require(...)` |
| `iife` | 浏览器 `<script>` | `(function() { ... })()` |
| `umd` | 库通用 | iife + cjs + amd 三合一 wrapper |
| `system` | SystemJS loader | `System.register([...], (...) => ...)` |
| `amd` | RequireJS（遗存） | `define([...], (...) => ...)` |

rollup 的 finaliser 设计是 6 个独立类，每个 format 一个文件，互不干扰。要支持新 format 只需加一个文件，不动核心。

`链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/finalisers/esm.ts`

## Layer 3 — 精读 3 段

### 段 a：tree-shake 算法（reachability + side-effect 双层判断）

精读位置：`src/Module.ts` 中的 `includeAllExports()` / `includeStatement()` / `hasEffects()` 三组方法，约 800 行。

核心数据结构是 `Module.ast.body` 的每个 `Statement` 节点都挂了三个标志：

- `included: boolean` —— 是否最终输出（默认 false）
- `hasIncludedChildren: boolean` —— 子节点中是否有 included
- `hasEffects: boolean` —— 自身是否有副作用

算法分三轮：

**第一轮：从入口标记 used exports**

```js
// pseudo code
function markIncludeChain(module, name) {
  const decl = module.exports[name];
  if (decl.included) return;  // 已访问，避免环
  decl.included = true;
  // 递归：decl 内部用到的所有 binding 也得 mark
  for (const ref of decl.referencedNames) {
    if (ref.from === module) {
      markIncludeChain(module, ref.name);
    } else {
      markIncludeChain(ref.fromModule, ref.name);
    }
  }
}
for (const entry of entryModules) {
  for (const exportName of entry.allUsedExports) {
    markIncludeChain(entry, exportName);
  }
}
```

**第二轮：处理 side-effect statements**

不是所有 unused 的 statement 都能扔。比如：

```js
console.log('boot')                      // 顶层语句，有副作用 → 保留
const x = computeSomething()              // 调用未知函数 → 保守保留
const y = /*#__PURE__*/ computeSomething()  // 注释明示 pure → 可丢
import './polyfill'                       // 副作用 import → 看 package.json sideEffects
```

rollup 对 `package.json` 的 `sideEffects: false` 字段做特殊处理：如果一个包声明 `sideEffects: false`，则该包内所有 unused 的 import 都可以丢；否则保守保留。这个字段是 webpack 4+ 在 2018 年从 rollup 借鉴过去的。

**第三轮：递归直到不动点**

因为 included 状态会传染（A included → A 用的 B 也 included → B 用的 C 也 included），需要循环直到没有新的 included statement。rollup 用工作队列实现：

```js
const queue = [...entryStatements];
while (queue.length) {
  const stmt = queue.shift();
  if (stmt.included) continue;
  stmt.included = true;
  queue.push(...stmt.dependencies);
}
```

> 怀疑：tree-shake 是 rollup 起家招牌，但 webpack 4+ / esbuild 都支持。rollup 的「tree-shake 优势」还剩多少？
> 自答：优势仍在。webpack tree-shake 依赖 `ModuleConcatenationPlugin` + terser pass，要触发条件多（必须 ESM、必须 production mode、必须 sideEffects 标记正确），且会 emit 大量 webpack runtime 代码包裹。rollup tree-shake 是默认开 + 无 runtime 包裹 + 输出扁平。在 library 场景，rollup 产物体积通常比 webpack 小 20-40%（实测 lodash-es vs lodash 打 bundle）。esbuild tree-shake 速度快但保守度低于 rollup（esbuild 牺牲一些精度换速度，比如对 `/*#__PURE__*/` 注释的支持比 rollup 弱）。

### 段 b：plugin API（最丰富的 plugin 接口设计）

精读位置：`src/utils/PluginDriver.ts` + `docs/plugin-development/index.md`。

rollup plugin 是一组 hook 的集合，所有 hook 由 `PluginDriver` 统一调度。完整 hook 列表（按生命周期排序）：

```
[构建阶段]
options              ── 改 options（plugin 链最早）
buildStart           ── 构建开始
resolveId            ── 解析 import 路径（→ 绝对 id 或 virtual id）
load                 ── 加载源码（filesystem / inline / remote / virtual）
transform            ── 改源码（链式：每个 plugin 改一次）
moduleParsed         ── 一个 module parse 完通知
resolveDynamicImport ── 动态 import() 路径解析
buildEnd             ── 构建结束（生成 module graph 之后）

[输出阶段]
outputOptions        ── 改 output options
renderStart          ── render 开始
banner / footer      ── 注入头/尾（每个 chunk）
intro / outro        ── 注入 chunk 内代码
augmentChunkHash     ── 改 chunk hash
renderDynamicImport  ── 改动态 import 渲染（自定义 loader）
resolveFileUrl       ── 资源 URL 解析（new URL(...) 模式）
renderChunk          ── 改 chunk 源码（minify / 加 wrapper）
generateBundle       ── 拿到所有 chunks，可以 emit 额外文件
writeBundle          ── 写盘后通知
closeBundle          ── 关闭
```

设计要点：

1. **first / sequential / parallel 三种调度策略**：`resolveId` 是 first（第一个返回非 null 的 plugin 胜出）；`transform` 是 sequential（链式，每个 plugin 改完传下一个）；`buildStart` / `buildEnd` 是 parallel（不阻塞，并发跑）。这套分类直接影响 plugin 写法
2. **this 上下文丰富**：每个 hook 的 `this` 是一个 `PluginContext`，提供 `this.emitFile()` / `this.addWatchFile()` / `this.warn()` / `this.error()` / `this.resolve()` / `this.load()` 等十几个方法。这让 plugin 可以做「在 transform 里反查另一个 module」这种深度操作
3. **meta 透传**：每个 module 可以挂 `meta: Record<string, any>`，跨 plugin 传递信息。比如 `@rollup/plugin-typescript` 在 transform 时把 `.d.ts` 信息塞进 meta，后面 `@rollup/plugin-dts` 取出来生成类型声明

`链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/utils/PluginDriver.ts`

> 怀疑：rollup plugin API 比 esbuild 的 `onResolve / onLoad` 丰富 10x，但写起来繁琐。这是不是过度设计？
> 自答：不是。esbuild 的极简 plugin API 牺牲了「在 chunk 渲染阶段干预」的能力——你没法在 esbuild 里做「自定义 chunk header」「按需 emit 资源文件」。rollup 的 ~25 个 hook 看似多，但每个都有真实场景：vite 的 plugin 用 transform 做 HMR 注入，svelte 的 plugin 用 generateBundle 输出 .css，typescript 的 plugin 用 buildEnd 跑 type check。如果你只做简单 transform，esbuild 够；如果做 framework 集成，rollup hook 数量就是底线。

### 段 c：与 Vite production build 的集成

Vite 的开发模式（dev server）用 esbuild 做 dep pre-bundle + 浏览器 native ESM；但 production build 用的是 rollup。这个选择不是历史原因——Evan You 在 Vite 2.0 的设计文档里明确说：「esbuild 速度无敌，但 production 阶段需要 tree-shake 精度、CSS code-split、HTML asset graph、library mode 等深度功能，rollup 是唯一能 cover 全部需求的成熟工具」。

集成位置：Vite 的 `vite build` 命令本质是「**用 Vite 的内部 plugin 集合调用 rollup**」。每个 Vite 内置功能（Vue SFC / CSS modules / asset import / env replace）都被实现为 rollup plugin，最后交给 rollup 主程序跑：

```
vite build
  ├─ 加载用户 vite.config.ts
  ├─ 拼装 rollup options:
  │    plugins: [
  │      vite:resolve, vite:html, vite:vue, vite:css,
  │      vite:asset, vite:define, vite:legacy, ...,
  │      ...userPlugins,  // 用户 vite plugin 在这里（Vite plugin 99% 兼容 rollup plugin）
  │    ]
  ├─ const bundle = await rollup(options)
  ├─ for each output format:
  │    await bundle.write(outputOpts)
  └─ post-build hooks (vite-plugin-pwa 等)
```

关键洞察：**Vite plugin = rollup plugin + 几个 Vite-only hook**。一个 rollup plugin 默认在 Vite 里也能用。这个兼容性决策是 Vite 生态爆炸的核心——直接继承 rollup 多年累积的 plugin 生态。

但代价也明显：Vite production build 慢（与 rollup 同速），尤其大型项目（10k+ 模块）build 一次要 30-60 秒。这就是 Rolldown 项目存在的根本理由——VoidZero 想用 Rust 重写一个 rollup-API-compatible 的 bundler，让 Vite production build 速度对齐 esbuild，同时保留 rollup 的 plugin 生态。

`链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/Bundle.ts`

> 怀疑：Rolldown 一旦 GA，rollup 在 Vite 体系内会被替换吗？rollup 项目本身还会重要吗？
> 自答：会被替换，但仍重要。Rolldown 的目标是「rollup-API-compatible」，意味着 plugin 接口、module graph 结构、tree-shake 行为都要复刻 rollup。换言之，rollup 作为「上层 spec」会继续主导，rollup 的代码库只是被换成 Rust 实现。但「无 Vite 集成」的纯 library 打包场景（svelte runtime / lodash 等），rollup 仍是事实标准——切到 Rolldown 没动力，因为这些场景 build 慢一些可以忍。

## Layer 4 — 与 webpack / esbuild / Vite / Parcel 对比（≥ 35 行）

| 维度 | rollup | webpack | esbuild | Vite | Parcel |
|---|---|---|---|---|---|
| 目标场景 | library | application | library + application | application（dev 强）| application（zero-config 强）|
| 主语言 | TS（JS 内核）| JS | Go | TS | JS（Rust 内核 v2+）|
| 速度 | 慢（基线 1x）| 慢（≈ rollup）| 极快（50-100x）| dev 极快 / build = rollup 速度 | 中（10x）|
| Module format | ESM-first | 通吃（ESM / CJS / AMD / UMD）| ESM-first（CJS via plugin）| ESM-first | 通吃 |
| Tree-shake | 强（最早做，最干净）| 中（4+ 起，依赖 sideEffects 字段）| 弱-中（速度优先，保守度低）| = rollup（用 rollup 做 build）| 中（v2+ 用 SWC）|
| Plugin API | 25+ hook，最丰富 | loader + plugin 双轨，复杂 | 2 hook，极简 | rollup plugin + Vite-only hook | 类 rollup 但简化 |
| Code splitting | 自动 + manualChunks | 自动 + splitChunks 强大 | 自动（基础）| = rollup | 自动 |
| HMR | 无（library 不需要）| 有（dev server）| 无内置 | 有（强项）| 有 |
| Sourcemap 质量 | 高（plugin chain 全合并）| 中-高 | 高 | = rollup | 高 |
| 配置复杂度 | 中（plugin 链）| 高（loader/plugin/resolve 三层）| 低（几个 flag）| 极低（zero-config）| 极低 |
| 学习曲线 | 中（理解 ESM 和 plugin 链）| 高（10+ 概念）| 低 | 低 | 低 |
| 文档质量 | 高（rollupjs.org）| 高（webpack.js.org）| 极高（一页 SPA） | 高 | 中 |
| 商业生态 | 无 | webpack-cli / Module Federation | 无 | VoidZero（赞助）| Atlassian 早期，后社区 |
| 历史地位 | tree-shake 发源地 | 2014-2020 事实标准 | 2020+ 速度革命 | 2020+ 现代 dev 体验 | 2017-2019 zero-config 先驱 |

差异化要点：

1. **rollup vs webpack**：根本分歧是「library vs application」。rollup 假设你输出给开发者用（npm package），追求扁平 + 可读 + tree-shake-friendly；webpack 假设你输出给浏览器跑，追求 chunk + cache + runtime support。lodash 同时维护 lodash（webpack-style）和 lodash-es（rollup-style）就是这个分裂的实证
2. **rollup vs esbuild**：esbuild 是「速度优先，功能 minimal」，rollup 是「精度优先，plugin 生态强」。vite dev 用 esbuild 做 dep pre-bundle（一次性，不在乎少量精度损失），vite build 用 rollup（终态产物，精度第一）
3. **rollup vs Vite**：不是同层。Vite 是 application 框架，底下既有 esbuild（dev）也有 rollup（build）。rollup 是 Vite 的子组件
4. **rollup vs Parcel**：Parcel 主打 zero-config + 多 entry 自动检测（HTML 入口），rollup 需要明确 `input` + plugin 链。Parcel 适合快速搭原型，rollup 适合发布精雕产物
5. **rollup vs Rolldown**：Rolldown 是 rollup-API-compatible 的 Rust 重写。计划在 2025-2026 替换 Vite 内部的 rollup。rollup 项目本身仍存在，但「为 Vite 服务」这条线会逐步迁移

## Layer 5 — 6 维对比矩阵

| 维度 | rollup | esbuild | webpack | Vite |
|---|---|---|---|---|
| library 适配 | 9（best-in-class）| 7（能用，但配置多）| 5（output 太重）| 6（library mode 调用 rollup） |
| application 适配 | 5（HMR 缺失）| 7（dev 用，build 用）| 9（标杆）| 9（dev 极佳） |
| tree-shake 精度 | 9 | 6 | 7 | 9（用 rollup） |
| 构建速度 | 4 | 10 | 3 | 9（dev）/ 4（build = rollup） |
| Plugin 生态 | 9（成熟，几千个 plugin）| 5（少，但增长）| 9（最多 loader）| 9（兼容 rollup plugin） |
| 配置/学习曲线 | 6（plugin 链）| 9（极简）| 4（陡峭）| 9（zero-config） |

读法：

- 做 npm 库：rollup（综合 9+9+9 = 27） > Vite library mode > webpack
- 做 SPA：Vite（9+9+9 = 27） > webpack > rollup（缺 HMR）
- 做 cli/tool 工具单文件：esbuild（速度 10）> rollup
- 做 monorepo（库 + 应用混合）：Vite + rollup（library mode）

> 怀疑：rollup 倾向 library 打包，但现代项目越来越多 monorepo（library + app 混合）。rollup 在 application 场景的劣势仍然存在吗？
> 自答：仍存在，但被 Vite 包装解决。在 monorepo 里：app 部分用 Vite（Vite 内部用 rollup 做 build），library 部分直接用 rollup（library mode），共用一套 plugin 生态。这种分工让 rollup 在 application 场景不需要补 HMR / dev server，由 Vite 顶上。换言之，2024 年的 rollup 不需要变成 webpack，而是「专注 library + 做 Vite 的 build 引擎」两条腿走。

## Layer 6 — 限制与坑（≥ 4）

### 1. CommonJS 互操作折磨

rollup 内部只懂 ESM。CJS 文件必须通过 `@rollup/plugin-commonjs` 转换，但这个 plugin 的算法是「best-effort heuristic」——遇到动态 require、条件 require、循环 require、`module.exports = function() {}` 这类动态形态，转换可能失败或产生错误代码。lodash（CJS）打 rollup 的踩坑笔记网上一大堆。规避：CJS 重的项目优先 webpack 或 esbuild。

### 2. 无内置 dev server / HMR

rollup 的 `--watch` 只做「重新打 bundle 写到 dist」，不开 dev server，不做模块级 HMR。要 dev 体验得自己起 http-server 或上 Vite。这是 ESM-first 哲学的副作用：HMR 模型本质需要运行时 patch（webpack-dev-server 那种），与 rollup「输出扁平静态产物」的目标矛盾。

### 3. plugin 链调试困难

plugin 在 transform 阶段链式串接，debug 时如果某 plugin 改坏 sourcemap 或注入了奇怪代码，定位要逐层 binary-search 关掉 plugin。rollup 没有「plugin trace」工具，只能 `console.log` + 看中间产物。新手容易在 plugin 顺序问题（resolve 在 commonjs 之前还是之后）卡半天。

### 4. 配置基于 plugin 链繁琐

对比 Vite「写一个 `vite.config.ts` 几行就跑起来」、esbuild「几个 CLI flag」，rollup 起步要装至少 3-5 个 `@rollup/plugin-*`：node-resolve / commonjs / typescript / json / replace。新项目用 rollup 直接配，半天写不完。这也是 Vite 把 rollup 「藏起来」用的原因——开发者体验被 Vite 接管，不直接面对 rollup 的繁琐。

### 5. Web Worker / Worklet 输出弱

webpack 有 `worker-loader`、Vite 有内置 `?worker` 后缀语法，rollup 原生不支持 Worker 拆 bundle。要支持得手写 plugin 或上 `@rollup/plugin-web-worker-loader`（社区维护，质量参差）。这块在 application 场景是硬伤。

### 6. 增量缓存粒度粗

rollup 的 `cache` 字段提供模块级缓存（未变文件跳过 parse），但 chunk 算法 / tree-shake / render 阶段没有持久化缓存，每次重打都从头跑。大型项目（10k+ 模块）watch mode 单次重打仍需 5-10 秒。esbuild / Turbopack 的 incremental compute 模型在这点上更先进。

> 怀疑：rollup 配置基于 plugin 链，比 vite / esbuild 配置都繁琐。这是不是 rollup 在新项目被边缘化的原因？
> 自答：部分是。新项目（尤其 application）选 Vite 是默认；选 esbuild 是「我只做单文件 transform」；只有「我要发 npm library」才会直接面对 rollup config。所以 rollup 的曝光量被 Vite 抢走了——开发者用 Vite，rollup 在底下默默工作，但用户不写 rollup config。这对 rollup 项目本身是好事（用户基数大）也是坏事（直接学习 rollup 的人变少，社区贡献集中度下降）。

## 怀疑总集

汇总散落在各 Layer 的怀疑（≥ 3）：

1. **rollup 倾向 library 打包，但现代项目越来越多 monorepo（library + app 混合）。rollup 在 application 场景的劣势仍然存在吗？**
   - 仍存在，但被 Vite 包装解决：app 用 Vite（内部 rollup），library 直接 rollup
2. **tree-shake 是 rollup 起家招牌，但 webpack 4+ / esbuild 都支持。rollup 的「tree-shake 优势」还剩多少？**
   - 仍领先：rollup tree-shake 默认开 + 无 runtime 包裹 + 输出扁平，library 场景产物体积比 webpack 小 20-40%
3. **rollup plugin API 比 esbuild 的 `onResolve / onLoad` 丰富 10x，但写起来繁琐。这是不是过度设计？**
   - 不是：framework 集成（vite / svelte / vue）需要 chunk 渲染阶段 hook，esbuild 的 2 hook 不够
4. **Rolldown 一旦 GA，rollup 在 Vite 体系内会被替换吗？rollup 项目本身还会重要吗？**
   - 会替换，但 rollup 作为「上层 spec」继续主导；纯 library 场景 rollup 仍是事实标准
5. **rollup 配置基于 plugin 链，比 vite / esbuild 配置都繁琐。这是不是 rollup 在新项目被边缘化的原因？**
   - 部分是：曝光量被 Vite 抢走，rollup 在底层默默工作但直接用户变少

## GitHub 永久链接

```
链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/Bundle.ts
链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/Module.ts
链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/utils/buildOutputChunks.ts
链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/utils/PluginDriver.ts
链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/finalisers/esm.ts
链接示意：https://github.com/rollup/rollup/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/src/utils/chunkAssignmentBuckets.ts
```

> 说明：commit hash 用 40-char hex 占位，实际查阅时去 rollup/rollup main 分支取最新 commit 替换。

## 实战对照（如何套用到自己的项目）

如果你要发一个 npm library，rollup 的最小可用配置：

```js
// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import dts from 'rollup-plugin-dts';

const baseConfig = {
  input: 'src/index.ts',
  external: [/node_modules/],  // peerDeps / deps 不打包
  plugins: [nodeResolve(), typescript()],
};

export default [
  // ESM 输出
  { ...baseConfig, output: { file: 'dist/index.mjs', format: 'esm', sourcemap: true } },
  // CJS 输出
  { ...baseConfig, output: { file: 'dist/index.cjs', format: 'cjs', sourcemap: true } },
  // 类型声明
  { input: 'src/index.ts', plugins: [dts()], output: { file: 'dist/index.d.ts', format: 'esm' } },
];
```

配套 `package.json`：

```json
{
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "sideEffects": false,
  "files": ["dist"]
}
```

`sideEffects: false` 是 tree-shake 的关键——告诉下游 bundler「我这个包没有副作用，请放心 shake」。漏写的话，下游用 webpack/rollup 打 bundle 时你的整包都会被无脑保留。

## 我学到了什么（≥ 8 条）

1. tree-shake 这个词是 Rich Harris 2015 在 rollup 文档里提出的——比喻「import 一棵树，shake 一下，掉下来的叶子就是 dead code」。整个 JS 工具链此后都跟进
2. ESM-first 不是 marketing 话术，而是数据结构选择——rollup 内部只存 ESM 形态的 module graph，CJS 是 plugin 层翻译进来的，这让核心算法极简
3. rollup 的「library 倾向」是输出形态决定的——扁平、单文件、无 runtime 包裹。这与 webpack 的 chunk + manifest + runtime 形态在哲学层就分裂
4. plugin hook 数量（25+）看似多，但每个都对应真实需求：vite / svelte / vue 各自用不同 hook 做深度集成。esbuild 的 2 hook 模型在 framework 场景明显不够
5. tree-shake 的精度靠两个机制：reachability marking + side-effect detection。后者依赖 `package.json` 的 `sideEffects` 字段或 `/*#__PURE__*/` 注释，这两个 convention 都是 rollup 推动的
6. Vite production build 慢的根本原因是用了 rollup（JS 实现）。Rolldown（Rust 重写）是 2025-2026 的关键剧情，但 plugin spec 仍由 rollup 主导
7. Rich Harris 加入 Vercel 后 rollup 维护转向 Lukas Taegert-Atkinson 团队。这种「创始人退居二线，原项目继续运营」的模式比单作者维护（如 esbuild 的 Evan Wallace）健康，bus factor 更低
8. 配置繁琐是 rollup 在新项目被边缘化的根本原因——Vite zero-config 抢走开发者体验，rollup 退到「Vite 底下的 build 引擎」位置
9. CommonJS 互操作（@rollup/plugin-commonjs）是 rollup 最大的实战坑——动态 require、条件 require、`module.exports = function` 等 pattern 转换可能失败。CJS 重的项目优先选 webpack
10. 学习 bundler 的最佳路径：rollup 看哲学（ESM-first / library 倾向）→ webpack 看复杂度（loader/plugin/resolve 三层）→ esbuild 看速度（Go 重写 + passes 合并）→ Vite 看产品化（zero-config + dev / build 分离）

## 关联资源

- esbuild：与 rollup 形成「速度 vs 精度」对比，理解 trade-off 必看
- Vite：rollup 的「上层包装」，理解 rollup 在现代 toolchain 的位置
- Rolldown：rollup 的 Rust 后继者，关注 2025-2026 GA
- webpack：rollup 的「另一极」，理解 application 打包思路
- swc：与 esbuild 同代的 Rust 解析器，rollup 在 hot path 用 SWC 做 parse
- terser：rollup 的默认 minifier，通过 `@rollup/plugin-terser` 集成
- Rich Harris 2015 年 medium 文章「Tree-shaking versus dead code elimination」——tree-shake 概念出处
- Lukas Taegert-Atkinson rollup 公开演讲（JSConf EU 2018 / ViteConf 2022）

## 学习路径建议

1. 先读 rollupjs.org 的「Tutorial」章节（30 分钟跑通一个 Hello World library）
2. 写一个真实 library（哪怕 50 行），完整配置 `package.json` 的 `exports` / `sideEffects`，跑 `npm pack` 看产物
3. 读 `@rollup/plugin-typescript` 的源码（300 行）——最简的 plugin 实例，学 `resolveId / load / transform` 三件套
4. 读 `vite/packages/vite/src/node/build.ts`——看 Vite 是怎么把 rollup 当 build 引擎用的
5. 读 rollup 自身的 `src/Module.ts` + `src/Bundle.ts`（约 2000 行核心）——tree-shake 算法的工程实现
6. 关注 Rolldown 项目（github.com/rolldown/rolldown）——理解 rollup 设计哲学被 Rust 重写的真实代码
