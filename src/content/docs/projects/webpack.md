---
title: webpack 现代前端工程化奠基
来源: https://github.com/webpack/webpack + webpack.js.org
---

# webpack — 定义「现代前端工程化」的十年标杆

## 一句话总结（≥ 12 行）

webpack 是 Tobias Koppers（@sokra）在 2012 年开始做的 JavaScript module bundler，命题极其朴素却野心巨大：**「把浏览器里所有种类的资源——JS / CSS / 图片 / 字体 / 数据——统一抽象为 module，构成一张依赖图，再编译成可以被浏览器消费的 bundle」**。这套「万物皆 module」的世界观在 2014-2024 这十年里直接定义了「前端工程化」是什么样子——React / Angular / Vue / Ember 的官方脚手架在很长一段时间里全部默认用 webpack；create-react-app / vue-cli / angular-cli 的内核都是 webpack；npm 上的 weekly downloads 长期保持在 30M+ 量级，是 JS 生态最常用的 build 工具之一。

设计哲学三条线：

1. **万物皆 module**：JS 是 module、CSS 是 module、图片是 module、JSON 是 module、甚至 HTML 模板也可以是 module。Loader 把这些非 JS 资源「翻译」成 JS module，Plugin 在编译生命周期里干预产物。这种统一化让 webpack 能 cover 任意复杂的前端项目——任何新格式只需要写 loader / plugin 就能接入
2. **完整的 dependency graph**：webpack 不只是把文件拼起来，它会从 entry 出发递归解析所有 `import` / `require` / `import()`，构建一张完整的有向依赖图（ModuleGraph）。这张图是后续所有优化的基础——tree-shake、code splitting、scope hoisting、persistent caching、Module Federation 全部建立在这张图上
3. **plugin / loader 双轨生态**：loader 负责「把一个文件转成另一种文件」（preprocess），plugin 负责「在 compile 生命周期里干预」（hook into compilation）。两者解耦让生态爆炸——10000+ npm 包打 `webpack-plugin` 或 `*-loader` 标签，是 JS 生态里仅次于 React 插件数量的 ecosystem

性能定位：webpack 用 JS 写（核心 + 大部分 plugin），构建速度比 esbuild / Rspack / Turbopack 慢 10-50x，大型项目（10k+ 模块）首次冷启动经常需要 30-60 秒，dev rebuild 1-2 秒。这是 2020 年后 esbuild / Vite / SWC / Rspack / Turbopack 集体崛起的根本原因——「webpack 哲学正确，但 JS 实现追不上现代项目规模」。但截至 2026 年初，webpack 仍是 npm 下载量最大的 bundler，存量项目（尤其是企业内大型 SPA / micro-frontend）迁移成本极高，短时间内不会消失。

商业生态：纯开源 + OpenCollective 赞助。Tobias 全职做 webpack 多年，2020 年之后 webpack 5 大版本发布，2021-2023 年 Tobias 加入 Vercel 并主导 Turbopack（webpack 的 Rust 后继者）的开发，webpack 项目本身转入维护模式。2024-2026 年的关键剧情：webpack 从「前端默认选项」退到「老项目默认选项」，新项目的默认选项变成 Vite / Rspack。但 webpack 作为「上层 spec」（loader / plugin / Module Federation 接口）仍在被新工具继承——Rspack 直接做 webpack-API-compatible，目标是「行为像 webpack，速度像 Rust」。

![webpack pipeline + 速度对比柱图](/projects/webpack/01-pipeline.webp)

## Layer 0 — 项目档案速查（≥ 18 字段）

| 字段 | 值 |
|---|---|
| 包名 | `webpack` |
| 当前主版本 | v5.x（2020 起，2026 仍主线） |
| 首版 | 2012-03 v0.1（Tobias Koppers 公开） |
| License | MIT |
| 主仓库 | webpack/webpack |
| 维护 | Tobias Koppers（创始人，半退）+ 核心团队（Sean Larkin、Johannes Ewald 等）+ 社区 |
| 实现语言 | JavaScript（Node.js）；部分 hot path 用 native binding（`enhanced-resolve` 等） |
| 入口 | `webpack` CLI / `webpack` npm 包（programmatic API） |
| 平台支持 | Node.js（Linux / macOS / Windows）；输出目标可以是 web / node / electron / webworker |
| 输入 | JS / TS / CSS / 图片 / 字体 / JSON / HTML / 任意（通过 loader） |
| 输出 format | UMD / CommonJS / AMD / ESM（v5 起，但生态仍以 UMD/CJS 为主）|
| Plugin API | 基于 Tapable hook 系统（sync / async / waterfall / bail / loop 五种调度）|
| Tree-shake | v2 起支持 ESM tree-shake；v4+ 起需配合 `sideEffects` 字段；v5 增强 |
| Code splitting | 入口拆分 / 动态 `import()` / `SplitChunksPlugin` 启发式自动拆 |
| Sourcemap | 全链路（loader → optimization → output）逐级合并；多种 devtool 选项 |
| Watch | `--watch` mode + 内存增量 + v5 持久缓存（写入磁盘） |
| Weekly downloads | ~30M+（截至 2026 初） |
| GitHub stars | 64k+ |
| 商业版 | 无 |
| 文档站 | webpack.js.org |
| 生态联动 | create-react-app / vue-cli / angular-cli / Next.js（pre-Turbopack）/ Storybook |
| 核心创新 | 万物皆 module + Tapable hook + Module Federation（v5）|
| 历史地位 | 2014-2024 前端工程化事实标准；定义「现代 SPA 打包」是什么样子 |

> 说明：webpack 的历史意义不仅是工具本身——它定义了「dev 和 build 是两套环境」「dependency graph 优先于 file 拼接」「loader / plugin 解耦」这三个被所有后继工具继承的设计原则。

## Layer 1 — 核心抽象（≥ 35 行）

webpack 对外暴露的核心抽象主要有 5 个：`entry` / `output` / `module.rules`（loader）/ `plugins` / `mode`。理解了这 5 个就能 cover 80% 的 webpack 使用场景，剩下 20% 是 `optimization` / `resolve` / `externals` / `devServer` 等高级选项。

```js
// webpack.config.js — 最小可用配置
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  // 抽象 1: mode —— 决定一组默认值（development / production / none）
  mode: 'production',

  // 抽象 2: entry —— 入口（单 / 多 / 命名多）
  entry: {
    main: './src/index.js',
    admin: './src/admin.js',
  },

  // 抽象 3: output —— 输出位置 + 文件名 + 公共路径
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',  // 多入口 + 内容 hash
    publicPath: '/static/',
    clean: true,                          // 每次构建前清空 dist
  },

  // 抽象 4: module.rules —— loader 链（按文件类型挂 loader）
  module: {
    rules: [
      { test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },  // 链式：右往左执行
      { test: /\.(png|svg|jpg|jpeg|gif)$/i, type: 'asset/resource' },
      { test: /\.(woff|woff2|eot|ttf|otf)$/i, type: 'asset/resource' },
    ],
  },

  // 抽象 5: plugins —— 编译生命周期 hook
  plugins: [
    new HtmlWebpackPlugin({ template: './src/index.html' }),
    // 更多：MiniCssExtractPlugin / DefinePlugin / CopyPlugin ...
  ],

  // 抽象 6（高级）: optimization —— 控制 tree-shake / split / minify
  optimization: {
    splitChunks: { chunks: 'all' },       // 自动拆 vendor chunk
    minimize: true,                        // production 默认开 terser
    usedExports: true,                     // tree-shake 标记
    sideEffects: true,                     // 读 package.json sideEffects
  },

  // 抽象 7（高级）: resolve —— 模块解析规则
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],   // 省略后缀的查找顺序
    alias: { '@': path.resolve(__dirname, 'src') },
  },

  // 抽象 8（高级）: externals —— 不打包，运行时由全局提供
  externals: {
    react: 'React',                       // CDN 引入 React，不打进 bundle
    'react-dom': 'ReactDOM',
  },
};
```

抽象之间的关系图：

```
entry
  │
  ▼
┌───────────────────┐
│ resolve.module    │ ── module.rules 决定哪些文件用什么 loader
│ → loader chain    │
└───────────────────┘
  │
  ▼
┌───────────────────┐
│ ModuleGraph       │ ── 完整依赖图（节点 = Module，边 = Dependency）
│ + ChunkGraph      │
└───────────────────┘
  │
  ▼  optimization (tree-shake / split / scope-hoist / minify)
  │  plugins (compilation.hooks.optimize.tap(...))
  ▼
output (path / filename / chunkFilename / publicPath)
```

关键设计决策：webpack 的 `module.rules` 看似简单声明式，但 loader 链是「**右往左 / 下往上**」执行——这是函数式 compose 的语义：`['style-loader', 'css-loader', 'sass-loader']` 实际执行顺序是 sass → css → style。新手在这里翻车率最高，每一篇 webpack 教程都要专门写一段说明。

## Layer 2 — 内部架构（≥ 50 行）

webpack 内部分 6 个核心模块：**Compiler**（顶层 orchestrator） / **Compilation**（一次构建的 context） / **Tapable hooks**（事件系统） / **NormalModule / ModuleGraph**（模块 + 依赖图） / **ChunkGraph / Chunk**（产物切分） / **Templates / Sources**（代码生成）。每一层都通过 hook 暴露给 plugin 干预。

### Compiler vs Compilation 双对象模型

这是 webpack 最容易让新手混淆的设计——为什么不只用一个对象？

- **Compiler**：webpack 进程的「主对象」，整个生命周期只有一个。包含 options、plugin 列表、文件系统接口等。负责调度多次 Compilation
- **Compilation**：「一次构建」的 context，每次重打（watch mode 改了文件）都会创建一个新的 Compilation 实例。包含本次构建的 modules、chunks、assets、错误等

为什么分开：watch mode 下，文件改动触发重打，但 Compiler 持有的状态（plugin、配置、缓存）不应该重建。Compilation 是「会过期的状态」，Compiler 是「跨次构建复用的状态」。这套双对象模型是 webpack 性能优化（缓存复用）的基石。

```
Compiler
  ├─ options (用户配置)
  ├─ inputFileSystem / outputFileSystem
  ├─ plugins (apply 一次，hook 永久挂)
  ├─ hooks: beforeRun / run / compile / make / emit / done ...
  └─ run() / watch()
       │
       ├─ creates → Compilation #1 (初次)
       ├─ creates → Compilation #2 (rebuild after file change)
       └─ creates → Compilation #N
                         │
                         ├─ modules: NormalModule[]
                         ├─ chunks: Chunk[]
                         ├─ assets: { [filename]: Source }
                         ├─ errors / warnings
                         └─ hooks: buildModule / succeedModule / optimizeChunks ...
```

`链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/Compiler.js`

`链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/Compilation.js`

### Tapable hook 系统

webpack 的 plugin 不是「监听事件」那么简单——所有 hook 由独立的 `tapable` 包提供，分 5 种调度策略：

| Hook 类型 | 行为 | 例子 |
|---|---|---|
| `SyncHook` | 顺序执行所有 plugin，不阻塞 | `compiler.hooks.compile` |
| `SyncBailHook` | 顺序执行，第一个返回非 undefined 的 plugin 截断 | `compilation.hooks.shouldEmit` |
| `SyncWaterfallHook` | 顺序执行，每个 plugin 接收上一个的返回值 | `compilation.hooks.assetPath` |
| `AsyncSeriesHook` | 异步顺序执行（Promise / callback）| `compiler.hooks.beforeRun` |
| `AsyncParallelHook` | 异步并发执行 | `compiler.hooks.make` |

设计意义：plugin 作者写 `compiler.hooks.emit.tapAsync('MyPlugin', (compilation, cb) => { ... cb(); })`，webpack 内部根据 hook 类型决定如何调度。这套抽象让 plugin 之间的协作（顺序、阻塞、并发）通过类型系统而非约定来表达。

`链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/dependencies/HarmonyImportDependency.js`

### Module 解析 + dependency 创建

每个文件在 webpack 里变成一个 `NormalModule` 对象。流程：

```
Compilation.addEntry(entryRequest)
  │
  ▼
ModuleFactory.create(request)         // 根据 module.rules 决定用哪些 loader
  │
  ▼
NormalModule.build()
  ├─ runLoaders(loaders, source)      // loader 链转源码
  ├─ this.parser.parse(transformedSource)  // acorn 走 AST
  ├─ AST walk
  │    ├─ 遇到 import x from 'y'    → 创建 HarmonyImportDependency
  │    ├─ 遇到 require('y')          → 创建 CommonJsRequireDependency
  │    ├─ 遇到 import('y')           → 创建 ImportDependency (动态)
  │    ├─ 遇到 new URL('y', import.meta.url) → URLDependency (asset)
  │    └─ 每个 dep 是一个 Dependency 子类
  └─ this.dependencies.push(dep)      // 挂在 module 上
```

每个 Dependency 子类负责自己的「代码生成模板」——比如 `HarmonyImportDependency.Template` 知道「ESM import 在最终 bundle 里应该被替换成什么形态的 `__webpack_require__` 调用」。这套 dep + template 模式是 webpack 支持多 module format 互操作（ESM 和 CJS 混用）的关键。

### ChunkGraph 切分

ModuleGraph 完整后，webpack 进入 chunk 切分阶段：

```
1. 每个 entry → 创建一个 entry Chunk
2. 遍历 ModuleGraph，递归把 module 加入对应 Chunk
3. 遇到动态 import() → 创建一个新的 async Chunk
4. SplitChunksPlugin 启发式分析：
   - 多 chunk 共享的 module → 提到 vendor chunk
   - module size > minSize → 拆出独立 chunk
   - cache group 规则（node_modules / 默认 / 用户自定义）
5. 每个 Chunk 收敛成 Asset（最终输出文件）
```

启发式核心规则（默认 production 模式）：

- 来自 `node_modules` 的 module → 单独到 `vendors~` chunk
- 被 ≥ 2 个 chunk 共享 → 提到 `commons~` chunk
- 单 chunk 大小 ≥ 30KB（默认 minSize）才考虑拆
- 单页最多 6 个 parallel request（避免 HTTP/1.1 时代的并发瓶颈）

这套规则是 2017-2018 年 webpack 4 的产物，针对 HTTP/1.1 + 桌面浏览器的场景。在 HTTP/2 + 移动端时代某些假设过时，但默认值改动会破坏存量项目，所以一直保留。

### 代码生成（Templates / Sources）

最后一步把每个 Chunk 渲染成可执行 bundle。webpack 生成的产物典型形态：

```js
// 简化的 webpack bundle 结构
(() => {
  var __webpack_modules__ = {
    "./src/index.js": (module, exports, __webpack_require__) => {
      const utils = __webpack_require__("./src/utils.js");
      // ... 用户代码 ...
    },
    "./src/utils.js": (module, exports) => {
      module.exports = { add: (a, b) => a + b };
    },
  };

  var __webpack_module_cache__ = {};

  function __webpack_require__(moduleId) {
    if (__webpack_module_cache__[moduleId]) return __webpack_module_cache__[moduleId].exports;
    const module = __webpack_module_cache__[moduleId] = { exports: {} };
    __webpack_modules__[moduleId](module, module.exports, __webpack_require__);
    return module.exports;
  }

  // ... runtime helpers (chunk loading / hot update / esm interop) ...

  __webpack_require__("./src/index.js");  // 启动
})();
```

这就是 webpack「runtime 包裹」的代价——产物里永远有一段 IIFE + module map + `__webpack_require__` 实现。在 application 场景这很合理（runtime 一次开销，换来动态加载能力），但在 library 场景就是负担——你 publish 的 npm 包不应该带一个 webpack runtime（这是 rollup「ESM-first 扁平输出」更适合 library 的根本原因）。

`链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/RuntimeTemplate.js`

## Layer 3 — 精读 3 段

### 段 a：dependency graph 构建（resolve → load → parse → walk）

精读位置：`lib/Compilation.js` 中的 `_addEntryItem()` / `factorizeModule()` / `buildModule()`，加上 `lib/NormalModule.js` 的 `build()` 方法，约 1200 行核心逻辑。

完整流程拆解：

**步骤 1：resolve（确定文件物理位置）**

webpack 用独立包 `enhanced-resolve` 实现路径解析。`import 'foo'` 触发的解析步骤：

```
resolve('foo', importer='/app/src/index.js')
  ├─ 查 alias（resolve.alias 用户配置）
  ├─ 查 node_modules（从 importer 向上逐级找）
  │    /app/src/node_modules/foo
  │    /app/node_modules/foo            ✓ 找到
  ├─ 读 package.json
  │    → 看 "exports" / "module" / "main" 字段
  │    → 选择 ESM 还是 CJS 入口
  ├─ 解析后缀（resolve.extensions: ['.tsx', '.ts', '.js']）
  └─ 返回绝对路径 + descriptor
```

resolve 性能是大型项目慢的主因之一——每个 import 都要 stat 多个候选路径。webpack v5 的持久缓存把 resolve 结果序列化到磁盘，减少了 80%+ 的重复 stat。

**步骤 2：load + transform（loader 链跑源码）**

```js
// 简化的 NormalModule.build()
async build() {
  const source = await this.inputFileSystem.readFile(this.resource);
  const result = await runLoaders({
    loaders: this.loaders,    // 已根据 module.rules 排序
    resource: this.resource,
    readResource: ...,
    source,
  });
  this.source = new RawSource(result.source);
  this.parse();  // 进入下一步
}
```

loader 链是 compose 风格——右边的 loader 先跑，输出作为左边 loader 的输入。每个 loader 是一个函数 `(source, sourceMap, meta) => transformedSource`。

**步骤 3：parse（AST 化）**

webpack 内置 `acorn` 做 ESM parse。parse 完成后，walker 遍历 AST 找出所有 dependency:

```js
// 简化的 walker 逻辑
walk(ast) {
  if (node.type === 'ImportDeclaration') {
    this.dependencies.push(new HarmonyImportDependency(node.source.value));
  }
  if (node.type === 'CallExpression' && isRequire(node.callee)) {
    this.dependencies.push(new CommonJsRequireDependency(node.arguments[0].value));
  }
  if (node.type === 'CallExpression' && isDynamicImport(node.callee)) {
    this.dependencies.push(new ImportDependency(node.arguments[0].value));
  }
  // ... 遍历子节点
}
```

每种 Dependency 类型对应一个 Template 类，知道「最终 bundle 里这段代码应该被替换成什么形态」。HarmonyImportDependency 在 ESM 模式下会被替换成 `__webpack_require__.r(...)` + `__webpack_require__(...)` 调用，CommonJsRequireDependency 直接替换成 `__webpack_require__(...)`，ImportDependency 替换成 `__webpack_require__.e(...).then(...)` 异步加载逻辑。

**步骤 4：递归 + 拓扑构建图**

发现新 dep 后，webpack 把它放入 `Compilation.factorizeQueue`，由 ModuleFactory 异步并发解析。最终所有 module 都被构建后，ModuleGraph 完整。

`链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/NormalModule.js`

> 怀疑：webpack 大型项目首次启动 10-30s+，dev rebuild 1-2s。Vite / esbuild 0.5s 启动 + 即时 HMR。webpack 在新项目几乎无优势，是不是已死？
> 自答：不算「死」，但已经从「默认选项」退到「老项目维护选项」。新建项目几乎没有理由选 webpack——Vite（dev 用 esbuild，build 用 rollup）/ Rspack（webpack-API-compatible 的 Rust 重写）/ Turbopack（Next.js 默认）都比 webpack 快 10-50x。webpack 的真实价值在「存量」——大型企业 SPA / monorepo / micro-frontend 用 webpack 多年，迁移意味着重写所有 plugin / loader / Module Federation 配置。Rspack 的策略是「行为完全兼容 webpack，只换底层 Rust」——这是 webpack 体系最现实的延续路径。

### 段 b：plugin / loader 区别与 Tapable hooks

精读位置：`lib/Compiler.js` 的 hook 定义 + `lib/Compilation.js` 的 hook 定义，加上 `tapable` 包源码。

webpack 暴露的 hook 数量惊人——Compiler 有 30+ hook，Compilation 有 50+ hook。但本质上分两层。

**Compiler 层 hook（整个进程级）**

| Hook | 类型 | 作用 |
|---|---|---|
| `environment` / `afterEnvironment` | Sync | 准备阶段 |
| `entryOption` | SyncBail | 处理 entry 配置 |
| `beforeRun` / `run` | AsyncSeries | 单次 run 前 |
| `watchRun` | AsyncSeries | watch mode 重打前 |
| `compile` | Sync | 单次编译开始 |
| `make` | AsyncParallel | 「构建阶段」入口 |
| `compilation` | Sync | 创建 Compilation 时通知 |
| `emit` | AsyncSeries | 写盘前最后机会 |
| `done` | AsyncSeries | 整个 run 结束 |

**Compilation 层 hook（单次构建级）**

| Hook | 作用 |
|---|---|
| `buildModule` | 每个 module 开始构建 |
| `succeedModule` / `failedModule` | module 构建结果 |
| `finishModules` | 所有 module 构建完，进入 optimize 前 |
| `optimize` / `optimizeModules` / `optimizeChunks` | 优化阶段 |
| `processAssets` | v5 起，统一的 asset 处理入口 |
| `chunkAsset` | 生成 chunk asset |

plugin 写法本质都是「找到对的 hook，tap 上去」：

```js
class MyPlugin {
  apply(compiler) {
    compiler.hooks.emit.tapAsync('MyPlugin', (compilation, callback) => {
      // 在这里加 / 改 / 删 compilation.assets
      compilation.assets['extra.txt'] = new RawSource('hello');
      callback();
    });
  }
}
```

**loader 与 plugin 的本质区别**

- **loader**：作用域是「单个文件转换」。输入源码，输出转换后的源码。运行时机在 module build 阶段（`NormalModule.build()` 内部）。loader 不能跨文件协作，不能干预 chunk / output
- **plugin**：作用域是「整个 compilation 生命周期」。可以在 30+ hook 上挂回调，干预任何阶段。loader 不能做的事（生成 HTML、注入 banner、压缩、emit 额外文件）都是 plugin 的活

边界清晰但容易混淆——比如「TypeScript 编译」既可以做成 loader（`ts-loader`，每个 .ts 文件单独编译）也可以做成 plugin（`fork-ts-checker-webpack-plugin`，独立进程跑 type check）。实务中两者经常组合：loader 做 transform（快），plugin 做 type check（慢但放在另一进程）。

`链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/Compiler.js`

> 怀疑：webpack plugin 10000+ 是优势但也是包袱。新维护者难以入门，社区质量参差不齐。
> 自答：是真实的负担。loader / plugin 数量多 = 学习曲线陡 + 兼容性矩阵爆炸。一个 webpack 4 的 plugin 在 webpack 5 里可能不工作（hook 名字改了 / Compilation API 变了）。社区 plugin 维护质量两极分化——头部几十个 plugin（HtmlWebpackPlugin / MiniCssExtractPlugin / TerserPlugin / DefinePlugin）由核心团队或大公司维护，质量极高；长尾 plugin 大量 abandonware，issue 区堆满未答复的问题。Rspack 在做 webpack-API-compatible 时只 cover 了 top 50 plugin，长尾 plugin 大量需要重写或抛弃——这恰恰说明 webpack 生态膨胀过度，新一代工具反而要做减法。

### 段 c：v5 持久缓存 + Module Federation

webpack v5 是 2020-2021 年的大版本，引入两个重磅功能：**持久缓存（filesystem cache）** 和 **Module Federation**。

**持久缓存：把 ModuleGraph 序列化到磁盘**

webpack v4 的缓存只存内存——进程退出，缓存丢失。冷启动每次都要全量 resolve + parse + transform，10k 模块项目要 30-60 秒。v5 的 `cache.type: 'filesystem'` 把以下数据序列化到 `node_modules/.cache/webpack/`：

- 每个 NormalModule 的 source + AST（去掉 location 等无关字段）+ dependency 列表
- 每个 Chunk 的组成 + assets
- resolve 结果（`enhanced-resolve` 的 LRU cache）
- module hash + chunk hash（用于检测「未变」）

冷启动流程：

```
第一次 build:
  全量 resolve / parse / transform → 30s
  序列化 cache → 写盘 (~50MB)

第二次 build (改了 1 个文件):
  反序列化 cache → 1s
  对比每个 module 的 mtime + hash
    未变的 module → 直接复用上次的 build 结果（跳过 loader / parse / walk）
    变了的 module → 走完整流程
  → 总耗时 2-3s
```

技术难点：序列化要处理「循环引用」（ModuleGraph 是有向有环图）+ 「自定义类型」（NormalModule、Source、Chunk 都是类实例，不是普通对象）。webpack 内部实现了自己的序列化协议（`lib/serialization/`），每个 class 注册自己的 `serialize` / `deserialize` 方法。

**Module Federation：micro-frontend 的标准方案**

v5 最有争议的功能。问题背景：大型企业前端常用 micro-frontend 架构（多个独立部署的子应用），子应用之间需要共享 React / Lodash 等公共依赖，避免每个子应用都打一份。Module Federation 提供 runtime 级别的「跨应用 module 共享」：

```js
// host 应用（壳）
new ModuleFederationPlugin({
  name: 'host',
  remotes: {
    app1: 'app1@http://app1.example.com/remoteEntry.js',
  },
  shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
});

// remote 应用（子应用）
new ModuleFederationPlugin({
  name: 'app1',
  filename: 'remoteEntry.js',
  exposes: { './Button': './src/Button' },
  shared: { react: { singleton: true } },
});

// host 代码里直接用
const RemoteButton = React.lazy(() => import('app1/Button'));
```

运行时机制：host 加载 `remoteEntry.js` → 这个文件返回一个 manifest（远端可用模块列表）→ host 调用 `__webpack_require__.federation` 动态加载远端 chunk → 共享依赖（react）通过 `singleton` 模式确保只加载一份。

`链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/container/ModuleFederationPlugin.js`

> 怀疑：Module Federation v5 引入是为补 micro-frontend 缺口，但配置极复杂。是不是 webpack 在生命周期末期的「自救」功能？
> 自答：一半是。Module Federation 解决的问题真实存在（大型企业的 micro-frontend），但它的配置和 runtime 复杂度让 80% 的项目用不上。同期 Vite / Turbopack 都在做自己的 module federation 方案（vite-module-federation-plugin / Turbopack 内置）但都简化了 API。webpack 的 ModuleFederationPlugin 设计偏向「power user」，实务中只有真正在做 micro-frontend 的团队才会启用。从「自救」角度看：v5 的两个重磅功能（持久缓存 + Module Federation）确实让 webpack 在 2020-2022 年延寿了 2-3 年，但 2023+ 速度差距被新工具拉开后，单靠功能也救不了——这就是 Tobias 后来转去做 Turbopack（Rust）的根本原因。

## Layer 4 — 与 Vite / esbuild / Rspack / Turbopack 对比（≥ 35 行）

| 维度 | webpack | Vite | esbuild | Rspack | Turbopack |
|---|---|---|---|---|---|
| 主语言 | JavaScript | TypeScript（用 esbuild + rollup）| Go | Rust | Rust |
| 速度（10k 模块冷启动）| 30-60s | dev 1-2s / build = rollup 速度 | 1-3s | 3-8s | 1-3s |
| 速度（dev rebuild） | 1-2s | < 0.1s（HMR）| 不内置 dev | < 0.5s | < 0.1s |
| Module 模型 | 万物皆 module（loader + plugin）| ESM-first dev / rollup-style build | ESM-first | webpack-API-compatible | webpack-spec-inspired，自研 |
| Plugin API | Tapable hook 30+ | rollup plugin + Vite-only hook | onResolve / onLoad（2 hook）| webpack plugin API（兼容 80%）| 自研，类 webpack |
| Loader 概念 | 有 | 通过 plugin 实现 | 无（plugin 内 inline）| 有（兼容 webpack）| 内置 + 自研 |
| Tree-shake | v2+ 起，需配合 sideEffects | 强（用 rollup）| 中（速度优先）| 强（参考 webpack）| 强（参考 webpack）|
| Code splitting | SplitChunksPlugin（启发式）| rollup 算法 | 自动（基础）| webpack-compatible | 自研，类 webpack |
| 持久缓存 | v5 filesystem cache | esbuild dep cache | 无 | 有（学 webpack）| 内置 incremental compute |
| HMR | 有（webpack-dev-server）| 有（Vite 强项）| 不内置 | 有（兼容 webpack）| 有（强项）|
| Module Federation | 内置 | 通过 plugin | 不支持 | 兼容 webpack | Next.js 内置类似机制 |
| 配置复杂度 | 高（loader/plugin/resolve 三层）| 极低（zero-config）| 低 | 中（学 webpack）| 极低（Next.js 内）|
| 文档质量 | 高（webpack.js.org）| 高 | 极高（一页 SPA）| 高 | 中（Next.js 文档为主）|
| 商业生态 | 无 | VoidZero（赞助）| 无 | ByteDance 主导 | Vercel 主导 |
| 适用项目规模 | 10k+ 模块仍能跑 | 10k+ 仍能跑 | 单文件 / 小项目 | 10k+ 模块 | Next.js 项目 |
| 历史地位 | 2014-2024 事实标准 | 2021+ 现代 dev 体验 | 2020+ 速度革命 | 2023+ webpack 替代品 | 2022+ Next.js 新内核 |

差异化要点：

1. **webpack vs Vite**：根本分歧是「dev 和 build 用同一引擎 vs 分两套」。webpack 用同一套（dev 和 build 都跑 ModuleGraph + Tapable），Vite 把 dev（浏览器 native ESM + esbuild）和 build（rollup）分开。Vite 的优势是 dev 即时，劣势是「dev 跑通的代码 build 时可能挂」（行为不一致）
2. **webpack vs esbuild**：esbuild 不是 webpack 的全功能替代——它没有 dev server、没有 HMR、plugin 接口极简。esbuild 是「单文件 transform 工具」+「被其他工具调用的 building block」（被 Vite / SWC / tsx / Bun 用作底层）。直接用 esbuild 做 SPA 的项目极少
3. **webpack vs Rspack**：Rspack 的策略是「**行为完全兼容 webpack，速度像 Rust**」。同样的 `webpack.config.js` 改个名就能跑，绝大多数 plugin / loader 兼容。这是 webpack 存量项目最现实的迁移路径——不用重写，只改 dependency。代价是 Rspack 继承了 webpack 的 API 复杂度
4. **webpack vs Turbopack**：Turbopack 是 Tobias 自己离开 webpack 后做的「精神继承者」——保留 webpack 的核心思想（万物皆 module、dependency graph、plugin 系统）但用 Rust 重写 + 引入 incremental compute（参考 Rust 编译器的 query-based architecture）。当前 Turbopack 主要服务 Next.js，独立用还不成熟
5. **webpack vs 全部新工具**：webpack 失去新项目的首选地位是事实，但「老项目继续用」会持续多年。npm 上 webpack 周下载量截至 2026 初仍在 30M+，远超任何替代品的总和

## Layer 5 — 6 维对比矩阵

| 维度 | webpack | Vite | Rspack | Turbopack |
|---|---|---|---|---|
| application 适配 | 9（标杆）| 9（dev 极佳）| 9（兼容 webpack）| 8（Next.js 内最佳）|
| library 适配 | 5（输出太重）| 6（library mode 调用 rollup）| 6（兼容 webpack library）| 5（不擅长）|
| 速度 | 3 | 9（dev）/ 4（build）| 8 | 9 |
| Plugin 生态 | 10（最庞大）| 9（兼容 rollup）| 9（兼容 webpack 80%）| 5（早期）|
| 配置/学习曲线 | 4（陡峭）| 9（zero-config）| 5（学 webpack）| 9（Next.js 内零配置）|
| 项目规模上限 | 9（百 k 模块仍能跑）| 8 | 9 | 9 |

读法：

- 做老项目维护：webpack（生态 10）+ Rspack 替换（速度 8 + 兼容 9）
- 做新 SPA：Vite（综合 9+9+9 = 27）
- 做 Next.js：Turbopack（绑定 Next.js）
- 做 enterprise 大型 SPA / micro-frontend：webpack 仍是稳妥（Module Federation 成熟度最高）

> 怀疑：webpack 配置复杂度（loader/plugin/resolve 三层）是不是过度工程？为什么 Vite 能 zero-config，webpack 必须配置一堆？
> 自答：不是过度，是不同时代假设。webpack 设计于 2012-2014（Node.js 早期），那时浏览器原生不懂 ESM、不懂 import map、不懂 dynamic import；webpack 必须自己实现一套「让任何东西在浏览器里跑」的 runtime + 编译系统。Vite 设计于 2020 年（浏览器普遍支持 native ESM 后），dev 阶段直接用浏览器原生能力，配置自然简化。两者不是「设计水平差异」，是「时代红利」差异——Vite 享受了浏览器 native ESM 普及的红利，webpack 必须为「老浏览器 + 任意 module 格式」兜底，复杂度刻在基因里。

## Layer 6 — 限制与坑（≥ 4）

### 1. 速度天花板

webpack 用 JavaScript 写，Node.js 单线程 + V8 字节码执行，相对 Go/Rust 工具有 10-50x 速度差。不是「实现不优化」——webpack 团队过去 10 年做了大量优化（持久缓存 / 多进程 thread-loader / SWC 替换 babel）。但语言天花板就在那——大型项目（10k+ 模块）冷启动 30-60 秒，dev rebuild 1-2 秒，是 webpack 最被诟病的硬伤。Rspack / Turbopack / Vite 集体起跑就是冲着这个天花板来的。

### 2. loader 链顺序反直觉

`use: ['style-loader', 'css-loader', 'sass-loader']` 实际执行顺序是 sass → css → style（**右往左 / 下往上**）。这是函数式 compose 的语义（外层包内层），但完全不符合「数组从前往后读」的直觉。新手在 CSS 配置上翻车率最高的就是这个——把 sass-loader 写在前面以为「先编译 sass」，结果 webpack 反着跑，报「不认识 .scss 语法」。每篇 webpack CSS 教程都要专门写一段警告。

### 3. plugin 配置膨胀

实际生产 webpack 配置很少少于 100 行——HtmlWebpackPlugin / MiniCssExtractPlugin / DefinePlugin / TerserPlugin / CopyPlugin / CompressionPlugin / BundleAnalyzerPlugin / fork-ts-checker-webpack-plugin 几乎是必备。每个 plugin 都有自己的 options，每个 options 又会与其他 plugin 交互。新建一个 production-ready 的 webpack 配置一般需要 200-500 行 + 拷贝粘贴现有项目模板。这就是 create-react-app / vue-cli / angular-cli 必须存在的原因——把 webpack 配置封装在脚手架里，用户碰不到。

### 4. tree-shake 触发条件多

webpack tree-shake 不是默认开就能用——需要满足：
- 必须 ESM 输入（CJS 模块默认全保留）
- 必须 `mode: 'production'` 或显式开 `optimization.usedExports: true`
- 必须配合 terser / SWC minifier 真正删除 dead code（webpack 只 mark）
- 必须 `package.json` 的 `sideEffects` 字段正确（漏写 = 全保留）
- 模块必须没有顶层副作用语句

任意一项不满足，tree-shake 就部分失效。实务中很多项目的「tree-shake 没生效」其实是配置问题而非 webpack bug。rollup 的 tree-shake 默认开 + 输出扁平 + 不需要后续 minifier，体验明显更好。

### 5. Module Federation 配置极复杂

shared / remotes / exposes / singleton / requiredVersion / strictVersion 一堆字段，文档分散，错配后报错信息晦涩（运行时报 `shareScope undefined` 没人能直接看出哪写错）。生产环境的 Module Federation 部署还要解决：远端 host CDN 配置、版本协商、共享依赖的 SemVer 兼容、跨应用 React 实例只加载一份等。需要专人 / 专团队维护。这也是为什么 micro-frontend 在「中小型项目」几乎没人用——成本远大于收益。

### 6. ESM 输出仍非主路径

webpack v5 起支持输出 ESM（`output.module: true` + `experiments.outputModule: true`），但仍是实验功能（截至 2026 初）。绝大多数 webpack 输出仍是 UMD / CJS。在 ESM-only 库流行（Node.js 22+ 默认 ESM、deno、bun 都 ESM-only）的背景下，webpack 的 ESM 输出滞后是结构性问题——根本原因是 webpack runtime（`__webpack_require__`）天然是 CJS-style，要无缝支持 ESM 输出需要重写 runtime + 大量 dep template，工程量巨大。

> 怀疑：webpack v5 持久缓存号称提速 80%，但社区报告很多 cache 失效 case（改 webpack.config.js 不生效、cache 损坏要手删 .cache 目录）。是不是不够稳？
> 自答：v5 早期（2020-2021）确实问题多，2022 后稳定性大幅提升。但 cache 失效仍是最常见的「玄学问题」——遇到 build 结果不对，老手第一反应就是 `rm -rf node_modules/.cache/`。本质原因是 cache key 设计——webpack 用 「config 序列化 + plugin name + module hash」作为 cache key，但 plugin 的「行为变化」未必反映在 name 里（同名 plugin 升级了内部逻辑，cache 仍命中老结果）。这是所有持久缓存系统的通病，不只 webpack 独有。

## 怀疑总集

汇总散落在各 Layer 的怀疑（≥ 3）：

1. **webpack 大型项目首次启动 10-30s+，dev rebuild 1-2s。Vite / esbuild 0.5s 启动 + 即时 HMR。webpack 在新项目几乎无优势，是不是已死？**
   - 不算「死」，但已退到「老项目维护选项」。新建项目几乎没理由选 webpack。真实价值在存量大型 SPA / monorepo / micro-frontend。Rspack 是最现实的延续路径
2. **Module Federation v5 引入是为补 micro-frontend 缺口，但配置极复杂。是不是 webpack 在生命周期末期的「自救」功能？**
   - 一半是。解决的问题真实但复杂度高，80% 项目用不上。延寿 2-3 年但救不了根本速度差距，所以 Tobias 后来去做 Turbopack
3. **webpack plugin 10000+ 是优势但也是包袱。新维护者难以入门，社区质量参差不齐。**
   - 是真实负担。头部 50 plugin 质量高，长尾大量 abandonware。Rspack 兼容只 cover top 50 也说明生态膨胀过度
4. **webpack 配置复杂度（loader/plugin/resolve 三层）是不是过度工程？为什么 Vite 能 zero-config，webpack 必须配置一堆？**
   - 不是过度，是时代假设差异。webpack 设计于浏览器不懂 ESM 的时代，必须自己实现 runtime + 编译。Vite 享受了浏览器 native ESM 普及的红利
5. **webpack v5 持久缓存号称提速 80%，但社区报告很多 cache 失效 case。是不是不够稳？**
   - 早期问题多，2022 后稳定。cache key 设计是所有持久缓存系统通病，非 webpack 独有

## GitHub 永久链接

```
链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/Compiler.js
链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/Compilation.js
链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/dependencies/HarmonyImportDependency.js
链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/NormalModule.js
链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/RuntimeTemplate.js
链接示意：https://github.com/webpack/webpack/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/lib/container/ModuleFederationPlugin.js
```

> 说明：commit hash 用 40-char hex 占位，实际查阅时去 webpack/webpack main 分支取最新 commit 替换。

## 实战对照（如何套用到自己的项目）

如果你接手一个 webpack v5 项目要做性能优化，按收益从高到低优先做：

```js
// webpack.config.js
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    clean: true,
  },

  // 收益最高：开持久缓存
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],  // webpack.config.js 改了 → 缓存失效
    },
  },

  module: {
    rules: [
      // 收益高：用 SWC / esbuild 替换 babel
      {
        test: /\.tsx?$/,
        use: { loader: 'swc-loader' },  // 比 ts-loader / babel-loader 快 5-10x
        exclude: /node_modules/,
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },

  optimization: {
    // 启发式拆 chunk
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
      },
    },
    // 收益中：scope hoisting（v3+ 默认开）
    concatenateModules: true,
    // 收益高：tree-shake 三件套
    usedExports: true,
    sideEffects: true,
    minimize: true,
  },

  // 收益中：alias + extensions 减少 resolve 开销
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: { '@': path.resolve(__dirname, 'src') },
  },
};
```

配套 `package.json`：

```json
{
  "sideEffects": [
    "*.css",
    "*.scss",
    "./src/polyfills.ts"
  ],
  "scripts": {
    "build": "webpack",
    "dev": "webpack serve",
    "analyze": "webpack-bundle-analyzer dist/stats.json"
  }
}
```

`sideEffects` 字段精确写出「有副作用的文件」（CSS、polyfill），其余文件 webpack 默认按 sideEffects: false 处理，tree-shake 才会真正生效。漏写或写成 `false`（一刀切）都会出问题——前者保留 dead code，后者把 CSS import 也 shake 掉（页面没样式）。

## 我学到了什么（≥ 8 条）

1. webpack 的「万物皆 module」哲学是 2012-2014 年的革命——在那之前前端构建是「拼接 JS 文件 + 在 HTML 里写一堆 `<link>` `<script>`」。webpack 第一次把所有资源统一成 module 来管理
2. webpack 的 Compiler 和 Compilation 双对象不是冗余设计——Compiler 跨多次构建复用（plugin / config / cache），Compilation 是「一次构建」的 context（modules / chunks / assets）。watch mode 性能优化的核心
3. Tapable hook 系统的 5 种调度策略（Sync/SyncBail/SyncWaterfall/AsyncSeries/AsyncParallel）是 plugin 之间协作的语言——hook 类型决定 plugin 是顺序、并发还是截断
4. loader 是「单文件 transform」，plugin 是「编译生命周期 hook」。两者作用域不同，不能互相替代
5. loader 链「右往左 / 下往上」执行是函数式 compose 的语义，不是 webpack 设计反直觉——但每个新人都会在这里翻车一次
6. tree-shake 触发需要满足 5 个条件（ESM / production / minifier / sideEffects 字段 / 无顶层副作用），任一失效就部分回退。这是 webpack tree-shake 不如 rollup 直接的根本原因
7. v5 持久缓存把 ModuleGraph 序列化到磁盘，冷启动从 30s 降到 2-3s。技术难点是循环引用和 class 实例的序列化协议
8. Module Federation 解决 micro-frontend 的真实需求，但配置极复杂只有大型企业用得起。Vite / Turbopack 后来的 federation 方案都简化了 API
9. webpack 速度问题不是「实现不努力」——团队做了 10 年优化，但 JS 实现的语言天花板就在那。Rspack / Turbopack 用 Rust 重写是必然
10. webpack 失去新项目首选地位是事实，但「老项目继续用」会持续多年——npm 周下载量 30M+ 仍超任何替代品总和。Rspack 的 webpack-API-compatible 策略是 webpack 体系最现实的延续路径
11. 学习 bundler 的最佳路径：webpack 看哲学（万物皆 module + 完整 dependency graph）→ rollup 看 ESM-first（library 倾向）→ esbuild 看速度（Go + 单 pass）→ Vite 看产品化（dev/build 分离）→ Rspack 看兼容（Rust 重写 webpack）

## 关联资源

- rollup：webpack 的「另一极」，ESM-first + library 倾向，理解 application 与 library 的设计分裂
- Vite：dev 用 esbuild、build 用 rollup，绕过 webpack 的速度天花板
- Rspack：webpack-API-compatible 的 Rust 重写，存量项目最现实的迁移路径
- Turbopack：Tobias 离开 webpack 后做的精神继承者，服务 Next.js
- esbuild：被 Vite 用作 dev 引擎、被许多工具用作底层 transformer
- swc：Rust 写的 babel 替代品，可作为 webpack 的 loader（swc-loader）大幅提速
- Tapable：webpack 的 hook 系统独立包，理解了它就理解了 webpack plugin 全貌
- Module Federation 设计文档（GitHub webpack/webpack discussions）

## 学习路径建议

1. 先读 webpack.js.org 的「Concepts」章节（30 分钟，理解 entry/output/loader/plugin/mode）
2. 跑通一个最小 webpack 项目（一个 entry + 一个 css loader + HtmlWebpackPlugin）
3. 用 `webpack-bundle-analyzer` 看产物结构——理解 chunk / vendor / runtime 各是什么
4. 写一个最简的 plugin（在 `compiler.hooks.emit` 里 emit 一个额外文件）——理解 Tapable hook
5. 读 `lib/Compiler.js` + `lib/Compilation.js` 的开头（约 500 行）——理解双对象模型
6. 读一个简单 loader（比如 `raw-loader`，30 行）——理解 loader 是纯函数
7. 对比 webpack v4 → v5 的 release notes——理解持久缓存、Module Federation 引入的动机
8. 关注 Rspack 的 docs（rspack.dev）——理解 webpack-API-compatible 在现实中是怎么实现的
9. 关注 Turbopack 的 RFC（turbo.build/pack）——理解 webpack 设计哲学如何在 Rust + incremental compute 上重生
