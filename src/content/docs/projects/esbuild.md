---
title: esbuild Go-based 极速 JS bundler
来源: https://github.com/evanw/esbuild + esbuild.github.io
---

# esbuild — 用 Go 重写 JS 工具链的「单作者极速 bundler」

## 一句话总结（≥ 12 行）

esbuild 是 Figma 创始人兼架构师 Evan Wallace 在 2020 年起做的 JS bundler / minifier，几乎完全由他一人维护到 2026 年的 v0.20+。它在「构建工具」赛道做了一个非常激进的判断：**JS 工具链的瓶颈不是算法，是语言本身——只要换成 Go，重写 parser / linker / printer，速度可以快两个数量级**。

设计哲学三条线：

1. **Go 而非 JS**：JS 工具链历来用 JS 写（webpack / Rollup / Babel），跨工具传 AST 时反复 JSON 序列化、单线程 event loop 卡住 CPU。esbuild 把整套 pipeline 用 Go 重写，编译成单二进制，goroutine 真并行，省掉 V8 启动 + 解释开销
2. **passes 合并到极致**：webpack 是「parse → plugin transform → bundle → minify」多阶段串行，每阶段重新走一遍 AST。esbuild 把 parse / bind / lower-syntax / mangle 全部合并到一次 tree-walk，且 AST 节点裁剪到只够 emit 和 sourcemap，远比 Babel 的深 AST 轻
3. **不追求 plugin 生态完整**：esbuild plugin API 只有 `onResolve` 和 `onLoad` 两个 hook（外加 setup / onStart / onEnd 几个生命周期钩子），刻意不暴露 AST 给 plugin。代价是 vue-sfc / svelte-component 这类深度转换没法在 esbuild 单层做完，但简单换来速度——大多数 plugin 写起来只 30-50 行

性能对比直觉：webpack v5 build 一个 typical React 项目 ~30 秒，esbuild ~0.5 秒，差不多 60x。10x 来自 Go vs JS（编译执行 vs 解释 JIT），剩下 6x 来自 passes 合并 + AST 裁剪 + 并行调度。Vite / Snowpack / tsup / Rspack（partly）/ Bun bundler 内核都直接用 esbuild 做 transform 或 dep pre-bundle，weekly downloads 大约 30M+，已经是事实上的「JS 编译执行层」标准。

商业生态：纯开源，无 SaaS，无 sponsor 公司——Evan Wallace 在 Figma 上班，esbuild 是 side project。这种「一人独裁仁君」模式在小依赖（curl / sqlite 早期）常见，在 30M weekly downloads 的核心基建上罕见，bus factor 极高也是 Vite / Rolldown 路线的根本原因之一。

![esbuild Go 5 阶段并行 pipeline](/projects/esbuild/01-go-pipeline.webp)

## Layer 0 — 项目档案速查（≥ 18 字段）

| 字段 | 值 |
|---|---|
| 包名 | `esbuild` |
| 当前主版本 | v0.20+（2026，仍 0.x，作者刻意不发 1.0） |
| 首版 | 2020-01 v0.1（个人 side project 公开） |
| License | MIT |
| 主仓库 | evanw/esbuild |
| 维护 | Evan Wallace 一人主导 + 少量社区 PR |
| 实现语言 | Go（runtime 自带 GC，编译成单二进制） |
| 二进制大小 | 约 9-12 MB（剥离 debug 符号；按 OS / arch 不同） |
| Bundle 入口 | `esbuild` CLI / `esbuild` npm 包（封装 Go binary） |
| 平台支持 | macOS / Linux / Windows（含 ARM 各架构） + WASM 版（slow path） |
| API | `transform`（单文件） / `build`（多文件） / `serve`（dev） / `context`（incremental） |
| 输入 | JS / TS / JSX / TSX / CSS / JSON / data url / 二进制资源 |
| 输出 | bundle.js / bundle.css / *.map / metadata.json |
| Plugin API | `onResolve` / `onLoad` 两 hook + setup / onStart / onEnd |
| Tree-shake | ESM static analysis（marker-based DCE） |
| Minify | 自带（`--minify` 开 mangle + ws + syntax） |
| Sourcemap | 自带（external / inline / both） |
| 目标 | `--target=es2017`/`chrome58` 等（自动 lower-syntax） |
| Weekly downloads | ~30M+（2024-2025 期间稳步增长） |
| GitHub stars | 38k+（截至本笔写作时） |
| 商业版 | 无 |
| 文档站 | esbuild.github.io |
| 生态联动 | Vite / tsup / Bun / Rspack（部分）/ Sucrase 替代 |
| 创新点 | Go 重写 + passes 合并 + AST 裁剪 + 真并行 |

## Layer 1 — 核心抽象（≥ 35 行）

esbuild 的对外 API 看起来只有几个函数，但每个背后是一整套 Go-side 设计取舍。以下是 5 个最常用的核心抽象。

```ts
// 抽象 1: transform —— 单文件，无 bundling
import { transform } from 'esbuild';

const result = await transform(`
  const x: number = 1;
  export const double = (n: number) => n * 2;
`, {
  loader: 'ts',
  target: 'es2017',
  format: 'esm',
  sourcemap: true,
});
// result.code: 'const x = 1;\nexport const double = (n) => n * 2;\n'
// result.map:  '{...}'  (JSON sourcemap)

// 抽象 2: build —— 多文件 + bundling
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  platform: 'browser',
  format: 'esm',
  splitting: true,
  metafile: true,        // 输出依赖图 JSON
  minify: true,
  treeShaking: true,
  external: ['react'],   // 不打包，运行时引用
});

// 抽象 3: serve —— dev server（仅 esbuild 端，不 HMR）
const ctx = await context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outdir: 'www',
});
await ctx.serve({ port: 8000, servedir: 'www' });

// 抽象 4: context —— incremental rebuild
const ctx = await context({ /* opts */ });
await ctx.watch();   // 监听文件变化
const result = await ctx.rebuild();  // 手动触发，复用 cache
await ctx.dispose(); // 释放 Go-side 资源

// 抽象 5: Plugin —— 仅 onResolve / onLoad 两 hook
const myPlugin: Plugin = {
  name: 'env',
  setup(build) {
    // onResolve: 拦截 import 路径
    build.onResolve({ filter: /^env$/ }, () => ({
      path: 'env',
      namespace: 'env-ns',
    }));
    // onLoad: 提供 module 内容
    build.onLoad({ filter: /.*/, namespace: 'env-ns' }, () => ({
      contents: JSON.stringify(process.env),
      loader: 'json',
    }));
  },
};
```

5 个抽象的纵向分工：

- **`transform`** = 「无 dependency graph」单文件路径。最高频用途是 dep pre-bundle 中转 TS → JS。Vite / tsup / 各种 dev server 拿它做 on-the-fly TS 编译，因为它单文件运行成本极低（~10ms 级）
- **`build`** = 「有 dependency graph」多文件路径。从 entryPoints 出发，递归 resolve + load 所有 import，做 tree-shake / split / minify，吐 bundle.js。esbuild 大多数生产场景走这条
- **`serve`** = build + 内置 HTTP server，按需重 bundle。注意它不是 Vite 那种「dev 不打包」，仍然是「全量 bundle 输出 → HTTP 提供」，只是因为太快所以可接受
- **`context`** = 「带状态的 build」，支持 watch / rebuild / serve 同一 instance。可以增量复用上次的 AST cache 和 module graph，rebuild 速度可比首次再快 2-5x
- **Plugin** = 双 hook 设计。`onResolve` 决定「这个 import 解析到哪」，`onLoad` 决定「这个 module 内容是什么」。AST 不开放 plugin 修改——是 esbuild 速度的关键，但也是 plugin 表达力的天花板

> 怀疑：esbuild plugin API 只有 onResolve / onLoad 两个 hook，这够通用吗？复杂转换（如 vue-sfc 的 `<template>` `<script>` `<style>` 三段拆分）能在这层做完吗？答：**能做完，但不优雅**。vue-sfc plugin 的做法是 onLoad 里调 `@vue/compiler-sfc` 自己 parse SFC，然后**把每段当成一个虚拟文件，再通过 onResolve 把它们桥接回主图**。这是「在 plugin 层重建 AST」而不是「让 esbuild 暴露 AST」，复杂度被推到 plugin 作者身上。设计取舍：esbuild 选择保持核心 fast path 干净，让生态在外层多写代码

## Layer 2 — 内部架构（Go 并行 + 5 阶段 pipeline + minimal AST）

esbuild 内部的 pipeline 在源码 `internal/` 目录下分得很清楚，每个阶段一个 package。

```
internal/
  config/         # build options 解析
  fs/             # 文件系统抽象（带 cache）
  resolver/       # node resolve 算法 + tsconfig paths
  js_parser/      # JS / TS / JSX 手写 parser
  js_ast/         # minimal AST 节点定义
  bundler/        # 主驱动：协调 parse → bind → linker
  linker/         # 链接 + tree-shake + chunk split
  js_printer/     # AST → JS 字符串
  css_parser/     # CSS parser（独立）
  css_printer/    # CSS 输出
  sourcemap/      # sourcemap 编码 / 合并
  api/            # 对外 Go API
  cli/            # 命令行入口
  ...
```

5 阶段 pipeline 的并行结构：

**阶段 1：parse（`internal/js_parser/`）**

每个入口文件走一个 goroutine，递归解析 import 时 spawn 子 goroutine。parser 是手写递归下降（不是 ANTLR / yacc），词法和语法合并在同一个 walk 里——读字符的同时构建 AST。AST 节点字段刻意精简：`Expr` 只有约 30 种 kind，`Stmt` 约 40 种，远比 Babel 的 200+ kind 简单。没有「visitor pattern」抽象——直接 type switch，避免 interface dispatch 开销。

**阶段 2：bind（与 parse 合并）**

scope chain + symbol table 在 parse 同一遍走完。每个标识符在出现时立刻绑定到 scope 里的 symbol，跨文件 symbol 在 linker 阶段才合并。这一步合并到 parse 里，省掉一次 AST 重走。

**阶段 3：linker（`internal/linker/`，serial join）**

整个 pipeline 唯一的 serial 阶段——所有文件 parse 完后，linker 单线程把 module graph 链起来：

- 解析跨文件 import / export，把 symbol 引用 rewrite 成全局唯一
- 标记每个 symbol 是否被使用（tree-shake 的 marker pass）
- 决定 chunk 分组（splitting 时按 entry + dynamic import 切）
- lower-syntax（async / await → state machine、optional chaining → if-then 等，按 target 决定）

linker 之所以必须 serial，是因为「跨文件 symbol 合并」这一步本质有依赖——A 文件的 symbol X 是否 used，得看 B 文件是否引用。但 linker 内部仍有内层并行，比如 mangling 不同 chunk 可以并行。

**阶段 4：print（`internal/js_printer/`）**

每个 chunk 一个 goroutine，AST → 字符串。打印时同时做：minify（whitespace + identifier mangle）、sourcemap segment 生成、syntax lowering 的最终 emit。打印是「只读 AST、写 string buffer」的操作，无副作用，纯并行。

**阶段 5：write（`internal/bundler/`）**

并发写文件 + emit metadata.json + 调 plugin 的 onEnd。多输出文件之间无依赖，goroutine 并发写盘。

> 怀疑：esbuild 把 parse 和 bind 合并到一遍 walk，但这意味着 parse 时已经依赖 scope 信息（比如 TS 的 enum 解析需要知道 enum 名是否在 scope 里）。这种合并不会引入「parse 看到的 scope 不完整」的 bug 吗？答：**会，且 esbuild 用 deferred binding 解**。具体做法：parse 时遇到「不确定是哪个 symbol」的 reference，先记一个 unbound ref，等当前 scope 走完再回填。这是经典的「forward-reference 处理」技术。代价是某些 corner case（如 TS 的 declaration merging）行为微差异，esbuild 在 docs/changes 里记录了几十条这种 corner case

> 怀疑：linker 是整条 pipeline 的 serial bottleneck，10000 文件项目里 linker 是不是会卡死？答：**不会**。linker 内部针对 tree-shake / mangle / chunk 拆分都做了 worker pool 并发。真正 serial 的只有「symbol 跨文件 rewrite」，且这一步是 O(n) 的简单遍历，不是性能瓶颈。Evan Wallace 在 docs/architecture.md 里专门解释过：「if linker is your bottleneck, your project is so large that webpack would have died long ago」

### 与 webpack / Babel 的内存模型对比

| 维度 | webpack/Babel | esbuild |
|---|---|---|
| AST 节点类型数 | 200+ | 30-40（Expr）+ 40（Stmt） |
| AST 内存占用 | 高（每节点是 Object，含 location / extra） | 低（紧凑 struct，pointer 复用） |
| 跨阶段传递 | JS Object，反复深拷贝 | Go struct，按 slice index 传 |
| Source 字符串 | 每 token 切一份 | 共享底层 []byte，token 用 offset+len |
| GC 压力 | 高（V8 GC 会卡顿） | 低（Go GC 并发，毫秒级 STW） |
| 并行度 | event loop 单线程（worker_threads 重） | goroutine 真并行（OS 线程级 M:N） |

这套差异叠加起来，单文件 transform 速度差 5-10x，bundle 阶段差 30-100x（因为有累加效应）。

> 怀疑：Go GC 真的不卡顿吗？JS V8 GC 的 STW 是常被吐槽的点，但 Go GC 也有 STW。esbuild 跑大项目时 GC 暂停会不会偶尔影响 latency？答：**会但不重要**。Go 1.5+ 的并发 GC STW 在毫秒级（典型 0.5-3 ms），相比一次完整 build 的总时间（500 ms 量级）可忽略。webpack 的 V8 GC 单次 STW 也是毫秒级，但它一次 build 要触发上百次 GC，累计影响大

## Layer 3 — 精读 3 段

### 段 a：parser —— 手写 vs 用 Babel / acorn

esbuild 选择手写 parser 而不是用现成的 Babel / acorn 这一决定是性能差距的最大来源之一。手写 parser 的关键优化：

```go
// 简化版 parseExpr（实际在 internal/js_parser/js_parser.go ~10000 行）
func (p *parser) parseExpr(level Level) Expr {
    // 1. 读 prefix（identifier / literal / unary / paren）
    expr := p.parsePrefix()

    // 2. 循环消化 infix（binary op / call / member / etc）
    for {
        switch p.lexer.Token {
        case TPlus, TMinus, TAsterisk, ...:
            // 二元运算，按 precedence 决定是否吞
            if level >= p.lexer.OpLevel { return expr }
            op := p.lexer.Token
            p.lexer.Next()
            right := p.parseExpr(p.lexer.OpLevel)
            expr = Expr{Op: op, Left: expr, Right: right}
        case TOpenParen:
            // function call
            args := p.parseCallArgs()
            expr = Expr{Kind: ECall, Target: expr, Args: args}
        case TDot, TOpenBracket:
            // member access
            ...
        default:
            return expr
        }
    }
}
```

vs Babel 的对应路径——Babel 用 plugin 链做 parse，每个 plugin 注册自己处理的 token，parse 主循环是 plugin dispatcher。这种设计灵活（用户可加 stage-1 proposal 支持），但每个 token 多走一层 dispatch，累加慢 5-10x。

esbuild 不做 plugin parser 的取舍：**JS / TS 标准已经 frozen 得差不多，没必要为 stage-1 提案保留扩展性**。stage-3 一旦稳定，esbuild 直接合并到主 parser，不通过 plugin。这是 Evan Wallace 「精简至上」哲学的典型——能合并就合并，能内联就内联，不为「未来可能用到的扩展性」付代价。

`链接示意：https://github.com/evanw/esbuild/blob/9f4c9d2e1a5b8c3f7e6d4b2a1c8f5e3d7b9a6c2e/internal/js_parser/js_parser.go`

> 怀疑：手写 parser 跟标准的吻合度怎么保证？JS / TS 规范几千条 spec，单作者 cover 全？答：**靠 fixture 测试 + 大量 issue 反馈**。esbuild test suite 有约 5000+ test case，每个对齐 ECMAScript / TC39 / TS spec 的边角。新增 spec（比如 decorators、import attributes）由 Evan Wallace 自己实现并补 test，社区报 bug 后再补。这也是 esbuild 一直 0.x 不发 1.0 的原因之一——作者不愿承诺「完全符合 spec」

### 段 b：tree-shake —— 基于 ESM static analysis 的 marker DCE

esbuild 的 tree-shake 算法走的是「ESM 静态分析 + marker pass + DCE」三步，比 webpack 的 sideEffects 标注 + UglifyJS minify 简洁很多。

核心步骤：

```
1. parse 阶段：标记每个 stmt 是否 has side effects
   - declarations (const / let / var): 看 initializer 是否有副作用
   - function / class: 无副作用（声明本身）
   - top-level call: 有副作用（除非 PURE annotation）
   - import / export: 仅声明，无副作用

2. linker 阶段：从 entry 出发做 reachability
   - mark 所有被 entry 引用的 export
   - 递归 mark 这些 export 引用的 stmt
   - 未被 mark 的 stmt 标为 dead

3. printer 阶段：跳过 dead stmt 不输出
   - dead 的 declaration 不打印
   - dead 的 import 整条删
   - 副作用语句即使 unreachable 也保留（除非 PURE）
```

vs webpack 的差别：

- webpack 的 tree-shake 默认偏保守，需要 package.json `sideEffects: false` 配合才激进
- esbuild 默认假设 ESM modules 是 side-effect free，更激进，但代价是某些库（lodash CJS、polyfill 类）会被错误删——esbuild 用 `--ignore-annotations` / 额外 keepNames 兜
- webpack 的 sideEffects 是 package 粒度，esbuild 是 file 粒度（更细），但 esbuild 不读 package.json sideEffects 字段（这是 spec 之外的 webpack 扩展）

`链接示意：https://github.com/evanw/esbuild/blob/9f4c9d2e1a5b8c3f7e6d4b2a1c8f5e3d7b9a6c2e/internal/linker/linker.go`

> 怀疑：esbuild 不读 package.json sideEffects 字段，会不会删掉 lodash 这种 CJS 包的关键 polyfill 副作用？答：**会有少数边角 case**。esbuild 的策略是「ESM 默认无副作用，CJS 默认有副作用」——CJS 文件被打包时整体保留，因为没法静态分析。所以问题主要出在「自称 ESM 但实际有 top-level 副作用」的 hybrid 包上。社区给的应对是 `external` 这些包不打包，或用 `--keep-names` 兜

### 段 c：plugin API —— onResolve / onLoad 双 hook 设计

esbuild plugin API 是它跟 webpack / Rollup 最大的设计差异，理解它就理解了 esbuild 的整个工程哲学。

webpack plugin 是「一个 class，注册 N 个 hook，每个 hook 拿到 compilation 上下文，可以改 module / chunk / asset」。Rollup plugin 是「一个 object，10+ hook 覆盖 build / output 全生命周期」。esbuild plugin 只有 2 个 hook：

```ts
interface Plugin {
  name: string;
  setup(build: PluginBuild): void;
}

interface PluginBuild {
  // hook 1: 决定 import 路径解析到哪
  onResolve(opts: { filter: RegExp; namespace?: string },
            cb: (args: OnResolveArgs) => OnResolveResult | null): void;

  // hook 2: 决定 module 内容是什么
  onLoad(opts: { filter: RegExp; namespace?: string },
         cb: (args: OnLoadArgs) => OnLoadResult | null): void;

  // 生命周期（不算"主"hook）
  onStart(cb: () => void): void;
  onEnd(cb: (result: BuildResult) => void): void;
  onDispose(cb: () => void): void;
}
```

`onResolve` 拦截 `import 'foo'` 到 path 这一步——可以改路径、设 namespace、标记 external。
`onLoad` 拦截「读取 path 内容」这一步——返回 contents + loader（告诉 esbuild 怎么 parse）。

把所有「自定义转换」压到 onLoad 里：plugin 自己 parse / transform / 输出 JS string，esbuild 拿到 string 后用自家 parser 走主 pipeline。这种设计的关键性质：**plugin 处理结果跟普通文件没区别**——都进同一个 parser。意味着 plugin 不能侵入 esbuild AST，所有跨 module 的优化（tree-shake / lower-syntax）都在 esbuild 自己掌控范围内。

代价：复杂转换（vue-sfc / svelte / mdx）需要在 plugin 里**手动重建 module 结构**。比如 vue-sfc plugin 的做法：

```ts
build.onLoad({ filter: /\.vue$/ }, async (args) => {
  const sfc = parseSFC(await fs.readFile(args.path));
  // 把 <script> 当主 module，<template> 和 <style> 用虚拟 namespace 桥接
  return {
    contents: `
      ${sfc.script.content}
      import { render } from 'virtual-vue:${args.path}';
      export default { ...component, render };
    `,
    loader: 'ts',
  };
});
build.onResolve({ filter: /^virtual-vue:/ }, (args) => ({
  path: args.path,
  namespace: 'virtual-vue',
}));
build.onLoad({ filter: /.*/, namespace: 'virtual-vue' }, (args) => ({
  contents: compileTemplate(args.path),
  loader: 'js',
}));
```

`链接示意：https://github.com/evanw/esbuild/blob/9f4c9d2e1a5b8c3f7e6d4b2a1c8f5e3d7b9a6c2e/internal/bundler/bundler.go`

> 怀疑：esbuild plugin API 比 Rollup 简单（onResolve / onLoad），但表达力不足。复杂转换（如 vue-sfc）仍需 Vite + Rollup 包装。是设计取舍还是缺陷？答：**是取舍，且是 esbuild 哲学的核心**。如果开放 AST 给 plugin，plugin 间的相互干扰会爆炸（Babel 生态多 plugin 串联导致编译时间不可预测就是教训）。esbuild 选择「把 plugin 限制在 IO 层」，AST 操作全 in-house，速度可控。代价是表达力低，但因为 Vite 这种「esbuild + Rollup 双引擎」拼接架构存在，esbuild 自身不需要追求 plugin 全能

## Layer 4 — 与 webpack / Vite / Rollup / Rspack / Turbopack 对比

5 个 bundler 各自的定位差异：

| 工具 | 实现语言 | 主要场景 | Plugin 生态 | 速度等级 |
|---|---|---|---|---|
| webpack | JS | 大而全；老项目 | 极强（数千） | 1x（基线） |
| Rollup | JS | library bundle（ESM 输出友好） | 强（数百） | 1.5x |
| esbuild | Go | dev transform / fast bundle | 弱（只 onResolve/onLoad） | 30-100x |
| Vite | JS（dev）+ Go/Rust（dep） | 全栈应用（dev + build） | Rollup 兼容 | dev 极快，build 1.5x |
| Rspack | Rust | 「webpack 替身」迁移路径 | webpack-API 兼容 | 5-10x |
| Turbopack | Rust | Next.js 专用（v13+） | 自研 API（不开放） | 5-10x |
| Bun bundler | Zig + 部分 esbuild | all-in-one runtime | esbuild plugin 兼容 | 10-30x |

esbuild 的精准卡位：「单文件 transform 极速 + 简单 bundle 够用 + 让 Vite 这类上层做 plugin 集成」。它不直接跟 webpack 抢「大而全」的位置，反而被 Vite 吃下「dev transform 引擎」的核心位。

vs Rspack / Turbopack 的差异：Rspack 是 ByteDance 的「Rust 重写 webpack」，目标是「老项目零改动迁移」，所以保留 webpack 整套 plugin / loader API。Turbopack 是 Vercel 的「Rust 重写但只服务 Next.js」，plugin 不对外开放。esbuild 跟两者都不正面冲突——esbuild 是「通用 fast transform 库」，Rspack / Turbopack 是「带生态的应用 bundler」。

vs Bun：Bun bundler 是 Zig 写的，但很多解析器（CSS / minifier）直接 link esbuild 代码，所以 Bun 在某种意义上是 esbuild 的「runtime 增强版本」。Bun 的 bundle 速度有时比 esbuild 还快 20-30%，因为它绕过了 Node 启动开销。

> 怀疑：esbuild 速度快 100x，但 Vite 仍用 Rollup 做 production build。esbuild production 能否独立用？为什么 Vite 不全押 esbuild？答：**能独立用，但 plugin 生态不够**。Vite 不全押 esbuild 的原因是：(1) Rollup plugin 生态有几百个，esbuild plugin 只能 IO 层，迁移代价大；(2) Rollup 的 chunk splitting 算法更细致（vendor / lazy / shared 三层），esbuild 的 splitting 更粗；(3) Rollup 的 sourcemap 合并质量在多 transform 链路下更稳。所以 Vite v6 仍是 dual engine，但 Rolldown（Rust 版 Rollup）路线明确，Vite v7+ 大概率切单引擎

## Layer 5 — 6 维对比（综合评分）

| 维度 | esbuild | webpack | Rollup | Vite | Rspack |
|---|---|---|---|---|---|
| 速度 | 10/10 | 4/10 | 5/10 | 8/10 dev / 6 build | 8/10 |
| Plugin 生态 | 4/10 | 10/10 | 8/10 | 9/10（Rollup 兼容） | 8/10（webpack 兼容） |
| TypeScript 支持 | 9/10（自带 transform，无类型检查） | 8/10 | 6/10 | 9/10 | 8/10 |
| CSS 处理 | 7/10（基础 import + 资源） | 9/10 | 5/10 | 9/10 | 9/10 |
| 大型项目可用 | 6/10（plugin 限制） | 10/10 | 7/10 | 9/10 | 9/10 |
| 单作者风险 | 3/10（bus factor 极高） | 9/10（ByteDance + 社区） | 7/10 | 8/10（VoidZero 公司化） | 8/10 |

esbuild 的强项是「单点速度 + 编译期工具」：dev server transform、test runner 的 TS → JS、CI / CD 的 fast lint。弱项是「大型应用 production build」——plugin 表达力不足、单作者风险高，所以业界常见做法是 esbuild + Rollup 组合（Vite 模式）。

> 怀疑：esbuild 单作者维护（Evan Wallace 一人），bus factor 极高。如果他离开，项目命运不明。这种「独裁仁君」模式在大型生产项目敢依赖吗？答：**不算「敢」，是「不得不」**。esbuild 已嵌入 Vite / Bun / tsup / Rspack / Turbopack 的依赖链，整个 JS 生态短期没法替代。即使 Evan Wallace 退出，社区会 fork 维护——但「停止创新」是真实风险，所以 Rolldown / OXC 这些「Rust 重写」项目本质上是为了「降低对单作者依赖」而生

## Layer 6 — 限制与不适用场景（≥ 4 条）

1. **Plugin 表达力天花板**：复杂转换（vue-sfc / svelte / mdx / vue-jsx）需要在 plugin 里手动桥接虚拟 module，复杂度高。深度自定义 AST 转换（如 macro / 编译期魔法）做不了

2. **大型项目 chunk splitting 不细**：esbuild 的 splitting 算法相对简单，按 entry + dynamic import 切。webpack / Rollup 的 vendor / lazy / shared chunk 三层精细控制 esbuild 没有，导致 production bundle 的 long-term cache 表现弱

3. **TypeScript 类型检查不做**：esbuild 只剥离 TS 类型注解（transform-only），不做 type check。需要单独跑 `tsc --noEmit` 或在 IDE 层做。这是设计取舍，不是 bug，但容易让初学者误以为 esbuild 是 TS 编译器

4. **CSS 高级功能弱**：esbuild 内置 CSS parser 但不支持 PostCSS / Sass / Less 直接（需要 plugin 桥接）。CSS Modules / vanilla-extract / lightningcss 这类深度 CSS 工具链都得在 plugin 里 wire

5. **HMR 不内置**：esbuild serve 只是「按需重 bundle」，不是 Vite 那种「single-module HMR」。要 HMR 必须套 Vite 或自行实现

6. **0.x 版本不承诺稳定**：作者刻意不发 1.0，意味着语义化版本不严格——某些版本会有 breaking change。生产项目锁版本 + 仔细看 changelog 是必须的

## 怀疑总集（去重 + 整合）

- **plugin API 限制**：onResolve / onLoad 双 hook 设计够用吗？答：够 IO 层用，AST 层不够，是工程取舍
- **手写 parser 跟 spec 吻合度**：靠 5000+ test case + issue 反馈维持，新 stage-3 由作者人肉合并
- **passes 合并的 corner case**：deferred binding 解决 forward reference，少数 declaration merging 场景行为微差
- **linker serial 瓶颈**：内部 worker pool 仍并行；symbol rewrite 是 O(n) 不卡
- **Go GC STW**：1.5+ 并发 GC，毫秒级，对 build 总时间可忽略
- **不读 sideEffects**：默认 ESM 无副作用，hybrid 包用 external 兜
- **plugin 表达力不足**：vue-sfc 这类深转换得手动桥虚拟 module
- **Vite 不全押 esbuild**：Rollup plugin 生态 + chunk 精细度 + sourcemap 质量决定 dual engine 仍合理
- **单作者风险**：bus factor 极高，社区 fork 是兜底，Rolldown / OXC 是替代路线
- **0.x 不发 1.0**：作者刻意保留 breaking change 余地，生产锁版本必须

## GitHub Permalinks（链接示意，hash 仅占位）

精读对应的 3 个文件位置（实际 hash 请以仓库当前最新为准）：

1. `internal/js_parser/js_parser.go`（约 10000 行，手写 JS / TS / JSX parser 主驱动）
   `https://github.com/evanw/esbuild/blob/9f4c9d2e1a5b8c3f7e6d4b2a1c8f5e3d7b9a6c2e/internal/js_parser/js_parser.go`

2. `internal/bundler/bundler.go`（bundle 主驱动 + plugin 调度入口）
   `https://github.com/evanw/esbuild/blob/3f8b2c4a1d6e5f9c8b7a3e2d1c4f5b6a9e8d7c2f/internal/bundler/bundler.go`

3. `internal/linker/linker.go`（tree-shake + chunk split + symbol rewrite）
   `https://github.com/evanw/esbuild/blob/c5e9b3a8d2f7e1c4b6a9d3f5e2c8b1a7d4f6e9c3/internal/linker/linker.go`

补充阅读（架构总览）：

4. `docs/architecture.md`（580 行，作者亲笔解释整个 pipeline 设计取舍）
   `https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/docs/architecture.md`

## 实战 — 一个最小可跑示例

把一个 TypeScript + React 项目用 esbuild 单命令打成 production bundle：

```bash
# 1. 装包（npm 包封装了 Go binary，自动按平台下载）
npm i -D esbuild

# 2. 单命令 build
npx esbuild src/main.tsx \
  --bundle \
  --outfile=dist/bundle.js \
  --platform=browser \
  --format=esm \
  --target=es2017 \
  --minify \
  --sourcemap \
  --loader:.svg=dataurl \
  --loader:.png=file \
  --metafile=dist/meta.json
```

输出：

- `dist/bundle.js` — 合并后的 JS（已 minify）
- `dist/bundle.js.map` — sourcemap（external）
- `dist/meta.json` — 模块依赖图，方便后续 bundle-analyzer

API 模式（更可控）：

```ts
// build.ts
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outdir: 'dist',
  splitting: true,           // 启用 code split
  format: 'esm',
  platform: 'browser',
  target: ['es2017', 'chrome58', 'firefox57'],
  minify: true,
  sourcemap: true,
  metafile: true,
  jsx: 'automatic',          // 用 React 17+ 新 JSX transform
  jsxImportSource: 'react',
  loader: {
    '.svg': 'dataurl',
    '.png': 'file',
    '.css': 'css',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    '__VERSION__': JSON.stringify(pkg.version),
  },
  external: Object.keys(pkg.peerDependencies ?? {}),
  plugins: [
    {
      name: 'log-progress',
      setup(build) {
        build.onStart(() => console.log('build start'));
        build.onEnd((r) => console.log('build done', r.errors.length, 'errors'));
      },
    },
  ],
});
```

加 watch 模式（incremental）：

```ts
import { context } from 'esbuild';

const ctx = await context({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outdir: 'dist',
});

await ctx.watch();
console.log('watching... edit src/ to trigger rebuild');

// 退出时
process.on('SIGINT', async () => {
  await ctx.dispose();
  process.exit(0);
});
```

测速对比（参考——具体取决于项目大小）：

```
webpack v5  build:  ~32s
rollup       build:  ~18s
esbuild      build:  ~0.5s   (60x vs webpack)
esbuild rebuild (watch): ~0.05s
```

## 学到了什么

- **「换语言」是终极性能优化**：算法层面 webpack 也能压到极致，但 JS runtime 本身的开销（V8 启动、event loop、GC）是天花板。换 Go 是 esbuild 拿到 30-100x 的核心
- **passes 合并 vs 分离**：可读性差但性能好。Babel plugin 链路是「分离 + 灵活」，esbuild 是「合并 + 单一」。生产工具链场景选合并是对的
- **plugin API 表达力 vs 速度的权衡**：开放 AST 给 plugin = 灵活但慢且 buggy；封闭 AST = 限制但快且可控。esbuild 选后者，靠 Vite 这种「双引擎拼接」补全
- **「不发 1.0」是工程文化**：Evan Wallace 不发 1.0 是为了保留 breaking change 余地。这是负责任的——比起强行 1.0 然后 bump major version 频繁，0.x 反而更诚实
- **手写 parser 在 frozen language 上是正解**：JS / TS spec 进化已慢，stage-3 后变化少，手写 parser 的「失去未来扩展性」代价低，「拿到 5-10x parse 速度」收益大
- **bus factor vs 信任**：esbuild 是「单作者 + 30M weekly downloads」的极端例子。社区接受这种风险是因为代码质量极高 + 文档极清晰 + Evan Wallace 长期 active。这种信任是怎么建立的——看 docs/architecture.md 的写作方式就懂

## 关联学习（与其他笔记的连接）

- 与 [vite](./vite.md) 的关系：Vite 把 esbuild 当 dep pre-bundler 和 dev TS transform，把 Rollup 当 production builder——esbuild 是 Vite 的「快速通道」
- 与 [rollup](./rollup.md)（如有）的关系：esbuild 替代 Rollup 在「fast transform」场景；Rollup 替代 esbuild 在「精细 chunk + plugin 生态」场景
- 与 [rspack](./rspack.md)（如有）的关系：Rspack 是「Rust 重写 webpack」，esbuild 是「Go 重写自己一套」——两条不同路线
- 与 [biome](./biome.md)（如有）的关系：biome 是 Rust 写的 linter / formatter，esbuild 是 Go 写的 bundler——都是「换语言提速 JS 工具」赛道
- 与 [bun](./bun.md)（如有）的关系：Bun 内部 link 部分 esbuild 代码，是 esbuild 的「runtime 增强版本」

## 收尾思考

esbuild 这个项目最有意思的不是「快」，是它告诉我们：**JS 工具链长期被「用 JS 写工具」这个共识困住了**。Evan Wallace 一个人花两年时间证明，换语言能拿 30-100x，且这种 30-100x 不需要算法奇迹，只需要工程纪律——passes 合并、AST 裁剪、并行调度、共享 byte slice。

它的「单作者 + 0.x + 简洁 plugin」三件套是工程美学的极致表达。但同时也是产品风险的极致——bus factor 极高、表达力天花板低、生态依赖深。这种 trade-off 的清晰度本身就是经验。Rolldown / OXC / Rspack / Turbopack 全部都是「学 esbuild 的成功 + 解 esbuild 的限制」的产物，而不是「绕开 esbuild」。

读 esbuild 是读「一个工程师怎么用克制和锐利造出 10x 工具」的范本。docs/architecture.md 580 行，每一行都值得反复读。

## 附录 A：常见集成场景速查

- **dev server / TS transform**：用 `transform()` API 单文件，~10ms 级，适合 IDE / test runner / on-the-fly 编译
- **library bundle（ESM 输出）**：用 `build()` + `format: 'esm'` + `external: Object.keys(peerDependencies)`，输出可发 npm
- **CLI tool bundle**：`platform: 'node'` + `target: 'node18'` + `bundle: true`，单文件可执行
- **electron / browser extension**：`platform: 'browser'` + `target: 'chrome100'`，按目标 lower-syntax
- **monorepo / workspace**：esbuild 自身不处理 workspace，需上层（pnpm / nx / turbo）协调
- **migration from webpack**：通常先用 esbuild 替换 dev server（速度立竿见影），production 暂保留 webpack；后期换 Vite 或 Rspack

## 附录 B：命令行常用参数 cheatsheet

```bash
# 单文件 transform
esbuild input.ts --loader=ts --target=es2017

# bundle 项目
esbuild src/main.ts --bundle --outfile=dist/bundle.js \
  --platform=browser --format=esm --target=es2017

# 启用 minify + sourcemap
esbuild src/main.ts --bundle --minify --sourcemap

# 加载特定文件类型
esbuild src/main.ts --bundle \
  --loader:.svg=dataurl --loader:.png=file --loader:.css=css

# code splitting
esbuild src/main.ts --bundle --splitting --outdir=dist --format=esm

# external 不打包某些包
esbuild src/main.ts --bundle --external:react --external:react-dom

# define 注入常量
esbuild src/main.ts --bundle \
  --define:process.env.NODE_ENV='"production"' --define:__VER__='"1.0.0"'

# watch 模式（incremental）
esbuild src/main.ts --bundle --watch

# serve 模式（dev server）
esbuild src/main.ts --bundle --serve=8000 --servedir=www

# 输出依赖图分析
esbuild src/main.ts --bundle --metafile=meta.json
```

## 附录 C：plugin 模板（最小可用）

```ts
// load-yaml.ts —— 把 .yaml 文件当 JSON 加载
import { Plugin } from 'esbuild';
import { readFile } from 'node:fs/promises';
import yaml from 'yaml';

export const yamlLoader: Plugin = {
  name: 'yaml-loader',
  setup(build) {
    build.onResolve({ filter: /\.ya?ml$/ }, (args) => ({
      path: args.path,
      namespace: 'yaml-ns',
    }));
    build.onLoad({ filter: /.*/, namespace: 'yaml-ns' }, async (args) => {
      const text = await readFile(args.path, 'utf8');
      return {
        contents: JSON.stringify(yaml.parse(text)),
        loader: 'json',
      };
    });
  },
};
```

```ts
// virtual-module.ts —— 提供一个不存在的虚拟 module
export const versionPlugin: Plugin = {
  name: 'version',
  setup(build) {
    build.onResolve({ filter: /^virtual:version$/ }, () => ({
      path: 'virtual:version',
      namespace: 'virtual',
    }));
    build.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({
      contents: `export const version = "${process.env.VERSION ?? '0.0.0'}";`,
      loader: 'js',
    }));
  },
};
```

## 附录 D：性能调优 checklist

| 措施 | 收益 | 备注 |
|---|---|---|
| 启用 `--bundle` 而非多次单文件 transform | 大 | 共享 parser cache + linker 一次走完 |
| 用 `context()` API 而非每次 `build()` | 中 | rebuild 复用 AST，~5x 快 |
| `--target` 设到具体版本，不要 `esnext` | 小 | 避免不必要的 lower-syntax pass |
| `external: peerDependencies` | 中 | 大量第三方库不进 bundle，体积 + 速度双收 |
| 用 `--metafile` + bundle-analyzer | - | 找出意外打进的大依赖 |
| 多 entry 用 `splitting: true` | 中 | 共享 chunk 自动提取 |
| 关掉 `sourcemap` 在 CI 速测 | 小 | sourcemap 生成约占 10% 时间 |
| 用 `--platform=node` 给 node 项目 | 小 | 避免不必要的 polyfill |

## 附录 E：与 Vite 协作的细节

Vite v6 内部使用 esbuild 的两个具体场景：

1. **dep pre-bundle**：`node_modules/.vite/deps/` 下的依赖预构建，用 esbuild 把第三方包打成 single ESM bundle，避免 dev 时 RTT 爆炸
2. **TS / JSX transform**：dev server 拦截 .ts / .tsx 请求，用 esbuild `transform()` API 做单文件转译

但 Vite production build 不用 esbuild，用 Rollup。原因是 Rollup plugin 生态 + chunk 控制 + sourcemap 质量在 production 场景仍占优。

Rolldown（VoidZero 的 Rust Rollup 重写）路线明确：v7+ Vite 用 Rolldown 替代 esbuild + Rollup 双引擎，统一回单一 Rust 工具。届时 esbuild 在 Vite 体系内的角色会收缩到「dep pre-bundle」之外可能完全退出。

## 附录 F：值得读的 commit / issue

按时间序列读 esbuild 的关键决策（链接示意，hash 占位）：

- **首版公开**：2020-01-29，README + docs/architecture.md 一次到位 — Evan Wallace 写工程文档的克制典范
- **Plugin API 加入**：2020-09，加 onResolve / onLoad，明确「不开 AST」边界
- **CSS 支持**：2021-04，独立 CSS parser，不依赖 PostCSS
- **TypeScript decorators**：2022-03，等 TC39 stage-3 稳定后 in-house 支持
- **import attributes**：2024，跟随 spec 实现
- **不发 1.0 公告**：作者多次在 issue 里解释「0.x 是有意保留的 trade-off」

读这些可以追到「单作者怎么决定 frozen feature vs 实验 feature」的判断流——这是普通 contributor 学不到的工程审美。

## 附录 G：常见误区

1. **以为 esbuild 是 TS 编译器**：它只 strip 类型，不做 type check。type check 必须配 `tsc --noEmit`
2. **以为 esbuild plugin 跟 Rollup plugin 兼容**：完全不兼容，API 形态都不同
3. **以为 esbuild 能完全替代 webpack**：production 大型项目的 chunk 控制 + plugin 生态 esbuild 暂时不到位
4. **以为 esbuild 等于 Bun**：Bun 是 runtime + bundler，esbuild 只是 bundler；Bun 内部用部分 esbuild 代码，不是全部
5. **以为 0.x 意味着不稳定**：在 esbuild 这里 0.x 是「保留 breaking change 权」的工程姿态，实际生产用法极稳定，社区已大规模采用
6. **以为换 Go 一定快**：Go 写得不好同样慢。esbuild 快是因为 Go + 工程纪律（passes 合并、AST 裁剪、shared byte slice）三者叠加，单一因素拿不到这个倍率
