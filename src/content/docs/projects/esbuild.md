---
title: "esbuild — 一个人写的工程美学"
description: 为什么比 webpack 快两个数量级？因为它认真对待"不做不必要的事"和"最大化并行"
sidebar:
  order: 19
  label: "evanw/esbuild"
---

> evanw/esbuild v0.28.0（2026-05），MIT。Go 写的。
>
> esbuild 是 Figma 工程师 Evan Wallace 一个人写的 JS bundler。
> 它把 webpack 数十秒的构建时间压到亚秒级——不是因为用了 Go，
> 是因为**对每一个微观选择都认真**。
>
> 文档作者亲笔写的 [docs/architecture.md](https://github.com/evanw/esbuild/blob/main/docs/architecture.md)
> 是 580 行的"工程师怎么思考"教科书。这一篇是 Season 3「下钻」的开篇。

## 一句话定位

**esbuild = 一个用 Go 写的、把所有可并行的事都并行的、把所有 AST passes 合并到极致的 JS bundler。**
不是"快"是结果，是"刻意追求性能"是输入。

## Why（为什么是它而不是 webpack / Rollup / Parcel）

JS 工具链长期被一个隐含假设统治：**每个工具是个独立单元，互相通过文件系统通信**。

```
源码 → babel（产 JS）→ 文件 → terser（minify）→ 文件 → webpack（bundle）→ 文件
```

**每个箭头都是一次完整的 IO + 重新 parse**。babel 输出 JS，webpack 再 parse 一遍。

esbuild 的判断：**这是浪费**。如果所有工具用同一份 AST，就不需要序列化-反序列化-再序列化。

判断 + 实现的累加：

| 优化点 | 节省 |
|---|---|
| **同一份 AST**（lex / parse / scope / 符号声明合并到一遍） | ~3x |
| **并行**（每个文件一个 goroutine） | ~CPU 核心数倍 |
| **Go 替代 JS**（runtime 没有 GC 压力 + 类型友好） | ~2-5x |
| **手写 parser**（不用 yacc，性能调优自由） | ~1.5-2x |
| **避免不必要的 syscall**（resolver 缓存） | 路径解析不再是瓶颈 |
| **flat symbol array**（按 index 而不是 name 引用） | 符号操作 O(1) |

最终：webpack 大型项目 30 秒，esbuild 0.5 秒。**这不是魔法，是把每一处该省的都省了**。

| 工具 | 语言 | 设计哲学 | dev / build |
|---|---|---|---|
| webpack | JS | 插件驱动，配置即代码 | 都慢 |
| Rollup | JS | 库打包标杆，scope hoisting | build 快，dev 没用 |
| Parcel | JS / Rust（v2 后） | 零配置 | 比 webpack 快 |
| **esbuild** | **Go** | **极致性能** | **都极快** |
| swc | Rust | esbuild 的继任者野心 | 类似 esbuild |

**为什么不是 Rollup**：Rollup 是库打包的金标准（scope hoisting 漂亮）。
但**它的 dev 体验弱**——没有 dev server 概念，每次都全量 build。
[vite](https://vitejs.dev) 的设计选择就是"dev 用 esbuild + native ESM、build 用 Rollup"，
吃两边好处。

**为什么不是 swc**：swc 是 Rust 写的同代竞品，性能接近 esbuild。
但 esbuild 的**架构文档质量**和**API 简单度**仍然是参考标杆。
swc 更像 Babel 替代（plugin 友好），esbuild 更像 Go 写的工具（单 binary、零依赖）。

**为什么不学 webpack**：webpack 的源码值得读吗？答案是——**用过即可**，
读源码学不到太多设计判断。webpack 是"积累出来的复杂"，esbuild 是"想清楚的简单"——
学习 ROI 后者高一个数量级。

## 仓库地形

```
esbuild/
├── cmd/esbuild/                      ← 命令行入口（薄封装）
├── pkg/                              ← Go module 公开 API
├── lib/                              ← npm 包封装（包括 wasm）
├── docs/
│   ├── architecture.md               ← ★★★ 580 行作者亲笔，必读
│   └── development.md
└── internal/                         ← ★ 主体代码
    ├── js_parser/                    ← 18788 行 js_parser.go ★★
    ├── js_lexer/                     ← 词法分析
    ├── js_ast/                       ← AST 定义
    ├── js_printer/                   ← 反向：AST → JS 文本
    ├── bundler/                      ← 3531 行 bundler.go ★★ 调度核心
    ├── linker/                       ← 7293 行 linker.go ★★★ 模块合并 + tree-shake + code-split
    ├── resolver/                     ← 路径解析 + 缓存
    ├── runtime/                      ← __commonJS / __decorate 等小 helper
    ├── graph/                        ← 依赖图
    ├── renamer/                      ← 符号缩写算法
    ├── sourcemap/                    ← VLQ 编码
    ├── css_lexer / css_parser / css_printer ← CSS 同样三件套
    └── xxhash/                       ← 自带 hash（不用 stdlib）
```

**心脏文件**：

1. `docs/architecture.md`——**先读这个**。代码再厉害，没作者讲解会迷路。
2. `internal/bundler/bundler.go`——`ScanBundle` 和 `Bundle.Compile` 两个调度器。
3. `internal/linker/linker.go`——tree-shaking、scope hoisting、code splitting 都在这里。

**读 18788 行的 js_parser.go 不是好选择**。它是巨型手写 parser，工程大但教学价值低。
要看"如何手写 parser"应该看 lexer 那部分（更小）。

## 核心机制 · Layer 3 精读

> 以下要点直接引用 [docs/architecture.md](https://github.com/evanw/esbuild/blob/main/docs/architecture.md)
> 的原文 + 行号。这是这篇笔记**最值得读的部分**——作者把每个判断写成了散文。

### 机制 1 · 设计原则（architecture.md:30-52）

作者明确写出 4 条原则：

1. **Maximize parallelism**（最大化并行）
2. **Avoid doing unnecessary work**（不做没必要的事）
3. **Transparently support both ES6 and CommonJS**（同时支持两种模块）
4. **Try to do as few full-AST passes as possible**（AST 遍历越少越好）

第 4 条特别值得品：

> Compilers usually have many more passes because separate passes makes code easier
> to understand and maintain. There are currently only three full-AST passes in esbuild
> because individual passes have been merged together as much as possible:
>
> 1. Lexing + parsing + scope setup + symbol declaration
> 2. Symbol binding + constant folding + syntax lowering + syntax mangling
> 3. Printing + source map generation

普通编译器有 10+ passes（lex / parse / type check / lower / optimize / emit）。
esbuild **强行合并到 3 passes**——可读性下降，但缓存局部性大幅上升。

→ 这是**判断力的体现**：作者明确知道"清晰的代码"和"快的代码"是两个目标，
然后**主动选了快**。

### 机制 2 · scan + compile 两阶段调度（architecture.md:54-66）

```
[entry points]
   ↓
ScanBundle (parallel worklist)
   ↓ each file → goroutine
   ↓ parse → AST
   ↓ collect dependencies → add to worklist
   ↓
[all ASTs in memory]
   ↓
Bundle.Compile (per entry point)
   ↓ link imports/exports
   ↓ generate output JS
   ↓ concatenate
   ↓
[final bundle]
```

**关键设计**：

- **scan 阶段**：goroutine pool，每个文件并行 parse。**不写文件**——所有 AST 在内存。
- **compile 阶段**：每个 entry point 生成一个 bundle，可以并行。

→ vs webpack：webpack 也并行，但**插件机制让很多 hook 是同步的**（不能跨 worker）。
esbuild 没插件机制（早期），所以可以"激进并行"。

**注意 architecture.md:80**：

> the overhead of syscalls in import path resolution appears to be very high.
> Caching syscall results in the resolver and the file system implementation is a very sizable speedup.

`require('./foo')` 要查 foo.ts、foo.tsx、foo.js、foo.jsx、foo/index.ts、foo/index.js……
每次都 stat 是上百次 syscall。esbuild 在 fs 层加缓存，**syscall 才不会成为瓶颈**。

### 机制 3 · 符号系统：flat array + Link 字段（architecture.md:82-90）

普通编译器：每个 scope 有自己的 symbol table，符号引用用名字字符串。

esbuild：

> Symbols for the whole file are stored in a flat top-level array. ... symbols are
> identified by their index into the top-level symbol array, we can just clone the array
> to clone the symbols and we don't need to worry about rewiring all of the symbol references.

**整个文件一个 flat 数组**。每个符号 = 64-bit index。

为什么这么做？

1. **遍历不依赖 AST**：要扫描所有符号，直接 for 循环数组
2. **clone 便宜**：克隆 AST 时，symbols 数组复制就够了
3. **跨文件合并**：所有文件的符号数组拼成 array-of-arrays，
   一个符号 ref 是 `(file_index, symbol_index)` 两个 int

linker 阶段做 scope hoisting 时（architecture.md:213）：

> Scope hoisting is implemented using symbol merging. Each imported symbol is merged
> with the corresponding exported symbol so that they become the same symbol in the output.
> ... each symbol has a `Link` field that, when used, forwards to another symbol.
> The implementation of `MergeSymbols()` essentially just links one symbol to the other one.
> Whenever the printer sees a symbol reference it must call `FollowSymbols()` to get to
> the symbol at the end of the link chain.

**这是 union-find 数据结构**——并查集。把 `import foo from './a'` 里的 foo 和
`./a.js` 里的 `export foo` 用 link 字段连起来，print 时一路 follow 到根。

→ 这是**算法 + 工程的优雅结合**。学过算法课但没在生产代码里见过的人，
读这段会发现"原来并查集真的能用"。

### 机制 4 · tree shaking 是图遍历（architecture.md:227-261）

作者把 tree shaking 解释得**比所有教程都清楚**：

> Tree shaking treats the input files as a graph. Each node in the graph is a top-level
> statement, which is called a "part" in the code. Tree shaking is a graph traversal
> that starts from the entry point and marks all traversed parts for inclusion.

**关键概念："part"**：

每个 top-level 声明是一个 part。比如：

```js
let foo = 123          // part A：声明 foo，无副作用
function bar() {...}   // part B：声明 bar，无副作用
console.log('init')    // part C：纯副作用
```

图遍历规则：

- **Part has side effects**：必须包含（即使没人引用）→ 实线边
- **Part references symbol**：跟随到 symbol 的 declaring part → 虚线边

从 entry point BFS / DFS，**没被遍历到的 part 全部丢弃**。

→ 这就是 tree shaking 的全部数学：**reach analysis on a part graph**。

esbuild 的实现非常优雅：linker 阶段把 part graph 建好，BFS 一遍，
unreached part 不进 bundle。

### 机制 5 · code splitting = 多次 tree shaking（architecture.md:263-279）

```
entry1.js
  ↓ tree-shake
  → reach set A
entry2.js
  ↓ tree-shake
  → reach set B

chunk for entry1 = A - B
chunk for entry2 = B - A
chunk shared      = A ∩ B
```

**用集合论描述就是这样**。esbuild 实现：每个 part 记录"哪些 entry 能到达我"，
最后按 entry set 分组生成 chunks。

但有个**陷阱**（architecture.md:347-428）：

> Code splitting must not be allowed to move an assignment to a module-local variable
> into a separate chunk from the declaration of that variable. ES6 imports are read-only
> and cannot be assigned to.

```js
// data.js
export let data
export function setData(value) { data = value }
```

如果 `data` 和 `setData` 被分到两个 chunk，`setData` 里的 `data = value` 会触发
"Assignment to constant variable"——因为 ES6 的 export 在 import 端是 readonly。

esbuild 的处理：**找出"互相赋值的 part"，强制分到同一个 chunk**。
做法是图的连通分量分析。

→ **这种边界情况是工程师的金矿**。读过这段你会发现"看起来简单的功能"背后有多少坑。

### 机制 6 · 符号缩写算法（architecture.md:484-579）

minify 时把 `useReducer` 改成 `b`、`reducer` 改成 `c`——基本知识。
但 esbuild 的算法比一般 minifier 多两层考虑：

**第一层：避免 Unicode**（architecture.md:519）：

> It may initially seem like we can easily rename all symbols to a single character by
> assigning a unicode character to each one. There are over 100,000 unicode characters
> that are valid JavaScript identifiers after all. However, the goal is actually to use
> as few bytes as possible, and most unicode characters use multiple bytes when encoded as UTF-8.

只用 ASCII：54 个单字符 + 3453 个双字符 + ... 按 UTF-8 字节算最划算。

**第二层：故意合并兄弟函数的参数名**（architecture.md:525-539）：

```js
// Before
function readFile(path, encoding, callback) { ... }
function writeFile(path, contents, mode, callback) { ... }

// After
function x(a, b, c) { ... }
function y(a, b, c, d) { ... }
```

为什么 `a, b, c` 在两个函数里要用同样的名字？

→ **gzip 压缩友好**。重复字符序列压缩率更高。
两个 `a, b, c` 让 gzip 找到模式，省下额外的字节。

> A trick esbuild borrows from Google Closure Compiler is to merge the symbols for
> arguments of sibling functions together.

**这是工程师的细节**。普通 minifier 不会想到 gzip 层；
但 minify + gzip 是真实部署链路，所以**联合优化**。

→ 这一段是判断"高水平 vs 普通水平工程师"的试金石。
**普通工程师在自己的层做对**，**高水平工程师同时考虑前后两层**。

## 横向对比

### vs webpack — 完全不同的物种

webpack 的 plugin 系统是它的伟大也是负担。每个 webpack-loader（babel-loader / ts-loader / css-loader）
是独立的进程，**串行处理**。esbuild 把这些都做成内置 + 同进程。

如果你需要用 50 个 webpack plugin 才能跑的项目——esbuild 也帮不了你（除非用 esbuild plugin API，
但那就接近 webpack 了）。

如果你只是要 transpile + bundle + minify——esbuild 快 100 倍。

### vs Rollup — 库 vs 应用

Rollup 是 ES module 标准的拥护者，做出来的 bundle 干净到可以发 npm。
esbuild 做应用 bundle 没问题，做库 bundle 时有些瑕疵（保留过多 helper）。

vite 的判断：**dev 用 esbuild（要快），build 用 Rollup（要干净）**——
这是工具组合的典范。

### vs swc — Rust 阵营的回应

swc 是 vercel 资助的 Rust 项目，野心是替代 babel + esbuild。性能相近。
**生态差异**：swc 在 Next.js / Turbopack 里被深度集成，是事实上的 Vercel 标准。
esbuild 是独立工具，不绑任何框架。

如果你重度用 Next，自然走 swc 路线。
如果你想要"一个工具走天下"，esbuild 仍然是首选。

### vs Babel — 完全不在一个层级

Babel 是 transpiler，esbuild 是 bundler。但 esbuild 内置了 transpile 能力（包括 TS / JSX），
**90% 场景下你不需要 babel**。

只有需要"自定义 plugin 操作 AST"时才需要 babel。esbuild 的 plugin API 较弱，
故意限制是为了保性能。

## Hands-on（5 分钟内能跑）

```bash
mkdir esbuild-demo && cd esbuild-demo
npm init -y
npm install esbuild
echo 'import _ from "lodash"; console.log(_.uniq([1,1,2,3]))' > app.js
npm install lodash
```

```bash
# 1. 不打包：转译单文件
npx esbuild app.js
# (输出原文)

# 2. 打包：依赖一并塞进
npx esbuild app.js --bundle
# (输出几百 KB 包含 lodash)

# 3. 打包 + minify
npx esbuild app.js --bundle --minify
# (压缩到 ~70KB)

# 4. 看耗时
npx esbuild app.js --bundle --minify --metafile=meta.json
cat meta.json | head
```

### 改一处的实验（必做）

下载一个有 100+ 模块的项目（比如 [vscode-extension-samples](https://github.com/microsoft/vscode-extension-samples) 的 helloworld）：

```bash
time npx esbuild ... --bundle  # 通常 < 100ms
time npx webpack ...           # 通常 5-15 秒
```

**亲手对比一次**，你会理解"100 倍快"是什么体感——不是数字，是"还没等回车就出结果"。

第二个实验：读 architecture.md 一遍。这是**今天最值钱的 30 分钟**——
580 行讲清楚 bundler 设计，比任何课程都好。

## 与你工作的连接

**能立刻迁移**：

- 任何 React / Vue / Svelte 项目的 dev 用 [vite](https://vitejs.dev)（背后就是 esbuild）
- 命令行工具的打包用 esbuild（10ms 出 binary 替代 ncc / pkg）
- 写 npm 包：用 esbuild + tsc 做 dual ESM/CJS

**下个月可能用到**：

- 给 LLM 工具链做 bundle（agent SDK、MCP server）——esbuild 是事实标准
- 构建在线 sandbox（playground.io 风格）——esbuild WASM 版可以在浏览器里跑

**不要用 esbuild 的部分**：

- **CSS 复杂处理**（Sass / PostCSS 高级特性）——esbuild CSS 支持基础
- **复杂 plugin 链**（特殊 loader 改 AST）——webpack / rollup 更合适
- **库打包到 npm**——Rollup 输出更干净

## 读完你能做之前做不了的事

- **判断**：看到一个项目用 webpack 4 + babel-loader，能立刻识别"dev 慢的根因"和"迁移成本"
- **设计**：要写一个新工具时，问自己"哪些 pass 可以合并""哪些工作可以并行"
- **解释**：被问"tree shaking 是什么"时能用 part graph 解释，不用模糊的"删除没用的代码"
- **下钻**：看懂 swc / turbopack 的设计文档——它们和 esbuild 同源思路
- **对照**：识别"我这个工具串行做的事能不能并行"——这是性能优化的第一道思维

## 自检 · 5 个问题

1. esbuild 把 lex/parse/scope/symbol 合到一个 pass。把 scope/symbol 单独抽出来重构成第 4 个 pass，
   会有什么好处和代价？（提示：可读性 vs 缓存局部性）
2. flat symbol array + Link 字段实现 scope hoisting——
   能不能用 hashmap `Map<string, Symbol>` 替代？为什么 flat array 在 esbuild 这个场景更合适？
3. tree shaking 把 file 拆成 parts。如果某个 part 既"声明 foo"又"调用 sideEffect()"，
   esbuild 怎么处理？（提示：part 粒度的取舍）
4. 符号缩写故意把兄弟函数参数命名成相同序列（`a,b,c`）以利 gzip。
   这种"跨层优化"还可以应用在哪些场景？
5. webpack 的 plugin 机制让"配置即代码"，esbuild 故意限制 plugin API。
   作为库作者怎么权衡"灵活性 vs 性能"？

## 延伸阅读

读完 `docs/architecture.md` 后下一步：

1. `internal/bundler/bundler.go:1-200`——看 `ScanBundle` 的 worklist 算法 + goroutine 池
2. `internal/linker/linker.go` 节选——找 `treeShakingAndCodeSplitting`，理解 part graph
3. `internal/js_lexer/`——比 18000 行的 parser 更值得读，手写 lexer 范例
4. **swc** 源码（[swc-project/swc](https://github.com/swc-project/swc)）——同代 Rust 实现，对比设计差异
5. [Evan Wallace 在 Figma 的工作](https://madebyevan.com/)——同一个人写了 Figma 的 multiplayer，
   都是"对性能极致认真"的代表作

---

**笔记完成**：2026-05-27（v0.28.0）
**研究方法**：本地克隆 + 精读 docs/architecture.md（580 行作者亲笔）
**心脏文件**：`docs/architecture.md` + `internal/bundler/bundler.go` + `internal/linker/linker.go`
