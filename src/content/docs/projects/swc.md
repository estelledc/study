---
title: swc Rust-based JS/TS 编译器
来源: https://github.com/swc-project/swc + swc.rs 官方文档
---

# swc — 用 Rust 重写 Babel 的「编译器三件套」

## 一句话总结（≥ 12 行）

swc（Speedy Web Compiler）是 DongYoon Kang（GitHub 用户名 @kdy1，韩国开发者）2017 年开始的个人项目，核心命题是「**用 Rust 重写 Babel**」——把 Babel 这套全球前端都依赖、但跑得很慢的 JS/TS 编译器，用 Rust 重新实现一遍，速度提升一个数量级。它的真正价值不是单纯快，而是承担「**transform / minify / bundle 三件套**」——一份 AST 节点定义、一套 visitor pattern、一个 Rust workspace，把过去散落在 Babel + Terser + Rollup 三个独立项目里的工作合并到 swc_core 一个 crate 体系内。

设计哲学三条线：

1. **替代 Babel**：API 设计刻意对齐 Babel——`@swc/core` 暴露的 `transform(code, { jsc: { target: 'es2020', parser: { syntax: 'typescript' } } })` 接口几乎是 Babel `transformSync` 的 Rust 镜像。这降低了下游迁移成本——webpack / Next.js / Storybook 把 Babel 替换成 swc 时，调用方代码改动极小
2. **三件套合一**：transform（语法降级 + JSX + decorator）、minify（terser 兼容的压缩与 mangle）、bundle（实验性 ESM-first 打包）三个能力共享同一份 swc_ecma_ast 节点定义。同一个 AST 节点既能被 transform 改写，也能被 minifier 优化，避免 Babel + Terser 之间反复 parse / serialize 的开销
3. **Wasm plugin 跨语言**：swc 的 plugin 不是 JS 模块，而是 Wasm 模块——Rust（或 AssemblyScript）写完编译成 .wasm，swc 通过 wasmer runtime 加载执行。好处是任何能编译到 Wasm 的语言都能写 plugin，且 plugin 与 host 同 Rust 时性能极佳；代价是 plugin 生态远小于 Babel（10000+ Babel plugin vs 100+ SWC plugin），ABI 仍未稳定

性能定位：在单核 10k 行 TS 文件场景下，Babel ~100ms / tsc ~80ms / esbuild ~8ms / swc ~6ms。swc 比 Babel 快约 16x，比 tsc 快约 13x，比 esbuild 快 10-20%（数据来源 swc.rs 官方 benchmark 与 kdy1 公开演讲）。多核场景 swc 用 rayon 并行，差距进一步扩大。这种性能让 Vercel 在 2021 年决定把 Next.js 12 的默认编译器从 Babel 切到 swc，并直接资助 kdy1 全职维护——swc 此后从「个人项目」升级为「Vercel 战略基础设施」。

商业生态：纯开源（Apache 2.0），无 SaaS 商业化。Vercel 是最大的资助方（Next.js / Turbopack / Turborepo 全部用 swc），其他大用户包括 Deno（部分 transform pass 用 swc）、Parcel 2（默认 transformer）、Storybook 7+（默认编译器）、Vite 在某些 transform path 也走 swc。weekly downloads 加总（@swc/core + @swc/cli + @swc/wasm + 各前端框架内嵌）大约 50M+。

历史地位：swc 是「Rust 重写 JS 工具链」浪潮里最完整的一份成果——esbuild 用 Go 但只做 transform + minify + 部分 bundle，rollup 用 JS 走 ESM-first 路线，Rolldown 是后来者。swc 是唯一一个**API 完全对齐 Babel + 同时承担 transform/minify/bundle 三件套**的 Rust 实现，且被 Next.js 生态全面采纳，事实上已是「下一代 Babel」。

![SWC 架构层：上层 transform/minify/bundle 三件套，中层 swc_core Rust workspace，下层 Wasm plugin，右侧速度对比](/projects/swc/01-architecture.webp)

## Layer 0 — 项目档案速查（≥ 18 字段）

| 字段 | 值 |
|---|---|
| 包名 | `@swc/core`（Node binding）/ `@swc/cli`（CLI）/ `swc_core`（Rust crate） |
| 当前主版本 | v1.x（2024-2026） |
| 首版 | 2017 年 v0.0.1（kdy1 个人公开） |
| License | Apache 2.0 |
| 主仓库 | swc-project/swc |
| 维护 | DongYoon Kang（@kdy1，首席）+ 核心团队 + Vercel 资助 |
| 实现语言 | Rust（核心） + TypeScript（API binding） |
| 核心 crate | `swc_core` 单一 workspace · 30+ 子 crate |
| 平台支持 | Node.js（Linux / macOS / Windows，napi-rs binding） + 浏览器版 `@swc/wasm-web` |
| 主 API | `transform(code, opts)` / `transformSync` / `parse` / `print` / `minify` |
| 输入 | JS / TS / JSX / TSX（一份 parser 全包） |
| 输出 | JS（ES3-ESNext 任意 target）+ sourcemap |
| 编译目标 | `jsc.target: 'es5' / 'es2015' / .. / 'esnext'` |
| Plugin 机制 | Wasm-based · `swc_plugin_runner` 通过 wasmer 加载 |
| 配置文件 | `.swcrc`（JSON）/ `swc.config.js` |
| 速度（单核 10k 行 TS） | ~6ms（Babel ~100ms / tsc ~80ms / esbuild ~8ms） |
| 多核扩展 | rayon 并行 · 文件级并发 |
| 兼容性 | API 对齐 Babel · plugin 不兼容（Wasm vs JS） |
| Sourcemap | 全链路（input → transform → output） |
| Weekly downloads | ~50M+（直接 + 间接 via Next.js / Parcel / Storybook） |
| GitHub stars | 30k+（截至本笔写作时） |
| 商业版 | 无（Vercel 资助 kdy1 全职） |
| 文档站 | swc.rs |
| 生态联动 | Next.js 12+ / Turbopack / Parcel 2 / Storybook 7+ / Deno 部分 / Vite 部分 |
| 核心创新 | Rust 实现 + 三件套合一 + Wasm plugin |
| 历史地位 | 「下一代 Babel」事实上人选 + Next.js 默认编译器 |

> 说明：上表的 weekly downloads 是综合估算——`@swc/core` 直接下载 + `next`/`@parcel/transformer-js`/`@storybook/builder-vite` 等内嵌的间接调用。直接 npm download 数字只能反映一小部分实际使用量。

## Layer 1 — 核心抽象（≥ 35 行）

swc 对外暴露的核心抽象只有 4 个：`parser` / `transform` / `emit` / `plugin`。这 4 个抽象正好对应编译器的经典四阶段，但 swc 的特别之处是把这四阶段全部合并在同一个 Rust workspace（swc_core）里——共享 AST 节点、共享 visitor、共享 sourcemap 算法。

```js
// 抽象 1: parser —— 把源码字符串解析为 AST
import { parse } from '@swc/core';

const ast = await parse(`
  const x: number = 1;
  function greet(name: string): string {
    return \`hello, \${name}\`;
  }
`, {
  syntax: 'typescript',  // 'ecmascript' | 'typescript'
  tsx: false,
  decorators: true,
  dynamicImport: true,
});
// ast 是 swc_ecma_ast::Module 的 JSON 序列化形态
// 节点 type 形如 'TsType' / 'Function' / 'TemplateLiteral'，与 estree 类似但有 swc 自己的扩展

// 抽象 2: transform —— 把 AST 改写（语法降级 + JSX + decorator + ...）
import { transform } from '@swc/core';

const out = await transform(`const x: number = 1;`, {
  jsc: {
    parser: { syntax: 'typescript' },
    target: 'es5',                     // 编译目标
    transform: {
      react: { runtime: 'automatic' }, // JSX 配置
    },
    externalHelpers: true,             // 把 _classCallCheck 等抽到 @swc/helpers
  },
  module: { type: 'commonjs' },        // 模块系统
});
// out.code = "var x = 1;\n"
// out.map  = sourcemap json

// 抽象 3: emit —— AST 序列化为字符串 + sourcemap
import { print } from '@swc/core';
const result = await print(ast, { sourceMap: true });
// result.code / result.map
// emit 是 codegen 的别名，通常不直接调，由 transform 内部串起来

// 抽象 4: plugin —— Wasm 模块挂到 transform 链
const plugged = await transform(code, {
  jsc: {
    experimental: {
      plugins: [
        ['@swc/plugin-styled-components', { displayName: true }],
        ['./my-rust-plugin.wasm', {}],
      ],
    },
  },
});
// 每个 plugin 是一份 .wasm 文件，swc 通过 wasmer 加载，传入 AST 序列化字节，
// plugin 内部 Rust 代码用 visit_mut 改写 AST，再返回字节，swc 反序列化继续走
```

理解这 4 个抽象就理解了 swc 80%。剩下 20% 是性能细节（rayon 并行、ast arena 分配、sourcemap rope）。值得注意的是 swc 把 parser / transform / emit 全部塞进 `transform` 一个 API 里——下游通常直接调 `transform(code, opts)`，不需要自己拼装。这种「黑盒一把梭」的 API 设计与 Babel 一致，方便迁移。

## Layer 2 — 内部架构（≥ 50 行）

swc 的内部架构由「**Rust workspace + 高度优化 AST + Wasm plugin**」三块支撑。理解这三块就能解释为什么 swc 比 Babel 快 16x。

### 第一块：单一 Rust workspace（swc_core）

swc 整个项目是一个 Cargo workspace，根目录下 `crates/` 子目录里有 30+ 个 crate（截至 2024）。关键 crate 关系：

```
crates/
├── swc_atoms/              # 字符串 interning（共享字符串池，避免重复分配）
├── swc_common/             # 共享类型：Span / SourceMap / DiagnosticBuilder
├── swc_ecma_ast/           # AST 节点定义（estree-like + swc 扩展）
├── swc_ecma_parser/        # 手写 LL(1) parser（TS / JSX / decorator 内置）
├── swc_ecma_visit/         # visit / visit_mut / fold trait 自动派生
├── swc_ecma_transforms/    # 50+ pass：TS strip、JSX、decorator、target downgrade
├── swc_ecma_minifier/      # terser-compatible minifier
├── swc_ecma_codegen/       # AST → source code + sourcemap
├── swc_bundler/            # 实验性 bundler（ESM 静态分析）
├── swc/                    # 顶层 facade，组装上面所有 crate
└── swc_plugin_runner/      # Wasm plugin 加载执行
```

设计要点：**所有 crate 共享 swc_ecma_ast 的节点定义**。这意味着 parser 解析出来的 `Module` 节点、transforms 改写后的 `Module` 节点、minifier 优化后的 `Module` 节点、codegen 输入的 `Module` 节点是同一个 Rust 类型，零序列化成本。Babel 体系下 plugin 之间也共享 AST，但 plugin 是 JS 模块，节点是普通 JS 对象，访问每个属性都是 hashmap lookup；swc 是 Rust struct，访问是 offset+size 的内存读取，差一个数量级。

### 第二块：高度优化的 AST 与 visitor

swc_ecma_ast 用 Rust enum 表达 AST 节点：

```rust
// crates/swc_ecma_ast/src/expr.rs（链接示意）
#[ast_node]
pub enum Expr {
    Lit(Lit),
    Bin(BinExpr),
    Unary(UnaryExpr),
    Call(CallExpr),
    Member(MemberExpr),
    // ... 60+ 种表达式
}
```

`#[ast_node]` 是 swc 自己的 proc macro，会自动派生：

- `Eq` / `Hash` / `Clone`
- `Visit` / `VisitMut` / `Fold` trait（用于 transform pass）
- `serde::Serialize` / `Deserialize`（plugin 跨进程传递时用）

Visitor pattern 用 trait + 默认方法实现：

```rust
// 链接示意
pub trait VisitMut {
    fn visit_mut_expr(&mut self, n: &mut Expr) {
        n.visit_mut_children_with(self);  // 默认下沉到子节点
    }
    fn visit_mut_call_expr(&mut self, n: &mut CallExpr) {
        n.visit_mut_children_with(self);
    }
    // ... 一个方法 per 节点类型
}

// 自定义 transform pass：把所有 console.log 删掉
struct RemoveConsoleLog;
impl VisitMut for RemoveConsoleLog {
    fn visit_mut_stmt(&mut self, stmt: &mut Stmt) {
        stmt.visit_mut_children_with(self);
        // 检查 stmt 是否是 console.log(...) 调用，是的话替换为 empty stmt
    }
}
```

这套 visitor 与 Babel `traverse` 思路一致，但因为是 Rust trait dispatch，编译期决议方法地址，运行期零开销。Babel 的 `traverse` 每个节点访问都要查 `visitor[node.type]`，是 hashmap lookup。

### 第三块：Wasm plugin 系统

swc plugin 是 Wasm 模块。完整流程：

1. 用户写 Rust：`#[plugin_transform] pub fn process(program: Program, _metadata: TransformPluginProgramMetadata) -> Program`
2. Cargo 编译为 `.wasm` 文件（`cargo build --target wasm32-wasi --release`）
3. swc 加载 `.swcrc` 时读到 `jsc.experimental.plugins: [['./my-plugin.wasm', {}]]`
4. swc_plugin_runner 通过 wasmer 加载 .wasm，分配一段共享内存
5. swc 把当前 AST 用 rkyv 序列化为字节，写入共享内存
6. 调用 plugin 的 `process` 函数（指针传参）
7. plugin 内部用 swc_core 的 visit_mut 改写 AST，写回共享内存
8. swc 反序列化 AST，继续后续 pass

设计取舍：

- **优点**：plugin 与 host 都用 Rust 时性能最佳；任何能编译到 Wasm 的语言都能写 plugin；plugin 与 host 隔离，不会因 plugin panic 拖死 host
- **缺点**：plugin 启动有 wasmer 加载开销（首次几百 ms）；ABI 仍未稳定（swc_core 升级 plugin 可能要重编）；生态远小于 Babel

> 怀疑：swc plugin 用 Wasm 跨语言听起来美好，但实际 plugin 生态远不如 Babel（10000+ Babel plugin vs 100+ SWC plugin）。Vercel 资助但 plugin 缺口仍大。开发者写一个新 transform，仍倾向写成 Babel plugin（JS 写起来快、调试容易），等被 swc 适配是后话。

## Layer 3 — 精读（必须分 3 段，每段独立小结）

精读三段：parser 实现、transform pipeline、Wasm plugin 系统。

### 段 a：parser 实现（手写 Rust + LL parser）

swc_ecma_parser 是手写 LL parser，没有用 parser generator（如 lalrpop / pest）。这个选择的理由：

1. **性能**：手写 parser 可以做 zero-allocation tokenizer，每 token 复用 buffer，避免 generator 生成的 dispatch 开销
2. **错误恢复**：JS 语法的容错（unclosed string / missing semicolon / typo）需要细粒度控制，generator 输出的代码很难做精细恢复
3. **TS / JSX 内置**：tsc 自己的 parser 也是手写，swc 借鉴。把 TS 类型语法（`const x: number`）和 JSX（`<Foo bar={baz}>`）放进同一份 parser，避免后处理

关键文件：

- `crates/swc_ecma_parser/src/parser/mod.rs`（链接示意：`https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_ecma_parser/src/parser/mod.rs`）
- `crates/swc_ecma_parser/src/lexer/mod.rs`（tokenizer）
- `crates/swc_ecma_parser/src/parser/expr.rs`（表达式解析，~3000 行）
- `crates/swc_ecma_parser/src/parser/stmt.rs`（语句解析）
- `crates/swc_ecma_parser/src/parser/typescript.rs`（TS 类型语法）

parser 入口大致结构：

```rust
// 链接示意
pub fn parse_module<I: Tokens>(&mut self) -> PResult<Module> {
    let start = cur_pos!(self);
    let shebang = self.parse_shebang()?;
    let body = self.parse_module_body()?;
    Ok(Module {
        span: span!(self, start),
        shebang,
        body,
    })
}
```

每个 `parse_xxx` 方法对应一个 grammar 产生式。错误处理走 `PResult<T> = Result<T, Error>`，错误信息包含 Span（源码位置 + 文件 id），后续 diagnostic 可以指回原始字符。

性能数据：单核 10k 行 TS parse 约 4-5ms（占总编译时间 70-80%）。剩下时间分给 transform / codegen。

> 段 a 小结：swc parser 不用 generator 是性能 + 错误恢复 + 多语法支持的综合选择。10k 行 4-5ms 的速度让 swc 足以承担 Next.js 这种「每次编辑都重编大量文件」的场景。

### 段 b：transform pipeline（与 Babel API 对齐）

transform 是 swc 的「替代 Babel」核心。swc_ecma_transforms 提供 50+ 个 transform pass，覆盖：

- TS strip：删除类型注解，保留运行时代码
- JSX：`<Foo>` → `React.createElement(Foo)` 或 automatic runtime
- decorator：legacy / 2022-03 两种实现
- target downgrade：ES2020 → ES5（async/await → generator → callback）
- module：ESM ↔ CJS / UMD / AMD 互转
- helper extract：把 `_classCallCheck` 等运行时辅助抽到 `@swc/helpers`

关键文件：

- `crates/swc_ecma_transforms_typescript/src/lib.rs`（链接示意：`https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_ecma_transforms_typescript/src/lib.rs`）
- `crates/swc_ecma_transforms_react/src/lib.rs`
- `crates/swc_ecma_transforms_compat/src/es2015/` （ES2015 降级，约 30 个 pass）

pipeline 组装方式：

```rust
// 链接示意
let mut chain = chain!(
    decorators(decorators_config),
    typescript::strip(),
    react::react(jsx_config),
    es2022(),
    es2021(),
    es2020(),
    es2015(),
);
program.fold_with(&mut chain);
```

`chain!` 宏把多个 VisitMut/Fold 串成线性链。fold_with 走完一次，AST 同时完成多种降级。

与 Babel 的差异：

- **API**：`@swc/core` 的 `transform(code, opts)` 接口几乎是 Babel `transformSync` 的镜像。`opts.jsc.target` ≈ Babel `presets[['@babel/preset-env', { targets: ... }]]`
- **plugin**：Babel plugin 是 JS visitor，swc plugin 是 Wasm 模块。**不兼容**——这是迁移最大坑
- **性能**：单核 transform 约 1-2ms（10k 行 TS）。Babel 同样工作量约 30-40ms

迁移路径（实战参考）：

1. Babel preset-env / preset-typescript / preset-react → swc 内置（无需 plugin）
2. `babel-plugin-styled-components` → `@swc/plugin-styled-components`（官方 Wasm 移植）
3. 自写 Babel plugin → 要么用 Wasm 重写，要么保留 Babel 走双工具链（先 swc 再 Babel，性能优势会被吞掉）
4. emotion / styled-jsx / mdx 等：检查 swc 生态有无对应 Wasm plugin

> 段 b 小结：swc transform 内置了 Babel preset-env / preset-typescript / preset-react 的所有 pass，迁移这三件套零成本；但如果项目用了自写 Babel plugin，要么 Wasm 重写，要么放弃 swc。

### 段 c：Wasm plugin 系统

Wasm plugin 是 swc 的差异化设计。理解它需要知道**为什么不用 JS plugin**。

JS plugin 路线（Babel 模型）：

- 优点：写起来简单（pure JS），生态大（10000+）
- 缺点：plugin 与 host 同进程同语言，host 是 Rust 时只能用 deno_core / boa 等 JS runtime 加载 plugin，这意味着 swc 要嵌一个 JS runtime ——会拖累启动速度，且 JS plugin 性能远不如 Rust plugin

Wasm plugin 路线（swc 模型）：

- 优点：plugin 用 Rust 写时性能与 host 持平；plugin 隔离（panic 不影响 host）；跨语言（AssemblyScript / Rust / 未来可能 Go）
- 缺点：写起来比 JS plugin 繁琐（要 Rust + Wasm 工具链）；ABI 不稳定；启动有加载开销

关键文件：

- `crates/swc_plugin_runner/src/lib.rs`（链接示意：`https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_plugin_runner/src/lib.rs`）
- `crates/swc_plugin/src/lib.rs`（plugin 一侧的 SDK）
- `crates/swc_plugin_proxy/src/lib.rs`（host ↔ plugin 共享内存代理）

plugin 内部代码长这样：

```rust
// 链接示意
use swc_core::{
    ecma::{ast::Program, visit::VisitMut},
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

struct ConsoleRemover;
impl VisitMut for ConsoleRemover {
    fn visit_mut_call_expr(&mut self, n: &mut CallExpr) {
        n.visit_mut_children_with(self);
        // 检查 n.callee 是否是 console.log，是的话替换
    }
}

#[plugin_transform]
pub fn process_transform(
    mut program: Program,
    _metadata: TransformPluginProgramMetadata,
) -> Program {
    program.visit_mut_with(&mut ConsoleRemover);
    program
}
```

`#[plugin_transform]` 是 proc macro，自动生成 Wasm 入口符号、序列化反序列化代码、与 host 的共享内存约定。

ABI 稳定性问题：swc_core 0.x 系列频繁升级，每次升级 AST 节点结构可能微调，旧 plugin 需要重编对齐新版本。这是 plugin 生态发展慢的关键阻力——开发者发布一个 plugin，几个月后 swc_core 升级，plugin 不重新发布就跑不起来。

> 段 c 小结：Wasm plugin 是 swc 的「跨语言 + 隔离」赌注，性能与隔离都好，但生态发展受 ABI 不稳与编译复杂度拖累。Babel plugin 写一晚上能上 npm，swc plugin 要 Rust + Wasm 工具链 + 对齐 swc_core 版本。

## Layer 4 — 与 Babel / esbuild / TypeScript 对比

四个项目都涉及 JS/TS 编译，但定位完全不同。

### swc vs Babel

| 维度 | swc | Babel |
|---|---|---|
| 语言 | Rust | JS |
| 速度（10k 行 TS） | ~6ms | ~100ms |
| API | `transform(code, opts)` | `transformSync(code, opts)` |
| Plugin 模型 | Wasm 模块 | JS 模块 |
| Plugin 生态 | 100+（部分官方移植） | 10000+ |
| TS 支持 | 内置 | 需 `@babel/preset-typescript` |
| 商业资助 | Vercel | OpenCollective |
| 目标用户 | Next.js / Parcel / Storybook | 几乎所有 JS 项目 |

切换路径：preset-env + preset-typescript + preset-react 三件套迁移零成本；自写 plugin 必须 Wasm 重写。

### swc vs esbuild

| 维度 | swc | esbuild |
|---|---|---|
| 语言 | Rust | Go |
| 速度（10k 行 TS） | ~6ms | ~8ms |
| 主功能 | transform / minify / bundle | transform / minify / bundle |
| Plugin 模型 | Wasm | JS（host 调出去） |
| TS 类型检查 | 不做（只 strip） | 不做（只 strip） |
| API 复杂度 | 中（API 对齐 Babel） | 低（onResolve / onLoad 两 hook） |
| 维护 | Vercel 资助 + kdy1 全职 | Evan Wallace 主导 |

两者速度接近（swc 略快 10-20%），但 plugin 模型差异大：esbuild plugin 是 JS（在 esbuild 进程外通过 stdin/stdout 通信），swc plugin 是 Wasm（在 swc 进程内通过共享内存）。esbuild 的 JS plugin 实战更普及，swc 的 Wasm plugin 性能上限更高。

### swc vs TypeScript（tsc）

| 维度 | swc | tsc |
|---|---|---|
| 主功能 | TS → JS（仅 strip） | 类型检查 + TS → JS |
| 类型检查 | **不做** | 做（核心功能） |
| 速度 | ~6ms | ~80ms（含类型检查） |
| 目标用途 | 编译产物（生产） | 编辑器 / 类型检查 / 编译产物 |

关键区别：swc **不做类型检查**，只是把 `: number` 这类类型注解删掉。所以 swc 永远不能完全替代 tsc——你仍要在 CI 里跑一次 `tsc --noEmit` 做类型检查，swc 只负责生成最终 JS。这与 esbuild 一样。Vite + swc + tsc --noEmit 是当下典型 TS 项目编译链。

## Layer 5 — 6 维对比表

| 维度 | swc 表现 |
|---|---|
| 速度 | 极快（Rust + 高度优化），单核 ~6ms / 10k 行 TS，比 Babel 快 16x |
| 学习曲线 | 中（API 对齐 Babel 上手快，但写 plugin 要 Rust + Wasm） |
| 生态成熟度 | 中（直接用户 50M+ weekly，但 plugin 生态远小于 Babel） |
| 类型支持 | 仅 strip，**不做类型检查**，需配合 tsc --noEmit |
| 调试便利度 | 中下（Rust 报错信息工程化，但 plugin debug 要会 Rust） |
| 商业资助 | 强（Vercel 全职资助 kdy1，长期可持续） |

## Layer 6 — 限制（≥ 4 条）

1. **Plugin 生态严重不足**。Babel 有 10000+ 个 plugin（官方 + 社区），swc 只有 100+ 个 Wasm plugin。如果项目重度依赖某个非主流 Babel plugin（如冷门 i18n / 自家 codemod），迁移到 swc 要么 Wasm 重写，要么放弃 swc 走 Babel。这是企业级迁移的最大阻力
2. **ABI 不稳定**。swc_core 0.x 系列频繁升级，每次升级 AST 节点结构可能微调，老版本 plugin 需要重编。开发者维护一个 swc plugin，等于给自己加了一份「跟随 swc_core 升级」的工作量。Babel plugin 写一次跑很多年
3. **不做类型检查**。swc 只 strip TS 类型注解，不做类型检查。所以你不能用 swc 替代 tsc——CI 仍要跑 `tsc --noEmit` 检查类型。这与 esbuild 一致，但与 Babel + `@babel/preset-typescript` 也一致，所以不算 swc 独有问题，但如果你想要「一个工具搞定 TS」会落空
4. **bundler 仍是实验性**。swc_bundler 存在但官方明确标记 alpha，生产环境基本不用——大家用 swc 做 transform/minify，用 Vite/webpack/Rolldown 做 bundle。三件套里的 bundle 还差一截
5. **bus factor 高**。swc 至今主要由 kdy1 一人主导（虽有 Vercel 资助）。如果他离开 SWC，社区是否能接手是未知数。esbuild 的 Evan Wallace 个人项目模式遇到过类似担忧，但 esbuild 已基本特性完成，swc 仍在快速演进期
6. **decorator 实现历史包袱**。swc 同时支持 legacy decorator（TC39 stage 1，用了多年）和 2022-03 decorator（TC39 新版本）。两者语义有差异，配置选错会导致运行时差异。Babel 也有这个问题，但 Babel 文档更全
7. **Wasm plugin 启动开销**。每个 plugin 首次加载 wasmer + .wasm 文件，几百 ms 不等。短任务（几个文件 transform）的总耗时里 plugin 加载占比可能很高。watch mode 下首次加载后就稳定，问题不大

> 怀疑：swc 速度比 esbuild 快，但只快 10-20%。开发者实际体验区别不明显（编辑保存到 HMR 触发都是 < 100ms 内）。Rust vs Go 之争值得吗？
> 自答：值得，但理由不在速度。在「能不能内嵌」——swc 是 Rust crate，可以 napi-rs 包成 Node 扩展、cargo build 进 Turbopack、cdylib 进 Parcel。esbuild 是 Go binary，只能外部调用。这种「能像库一样被任意 Rust 项目内嵌」的能力是 swc 战略价值的核心。

## 怀疑总集

汇总散落各 Layer 的怀疑（≥ 3）：

1. **swc plugin 用 Wasm，但 plugin 生态远不如 Babel（10000+ vs 100+）。Vercel 资助但 plugin 缺口仍大。Wasm 是不是过度设计？**
   - 部分是。Wasm 是 swc 的差异化赌注，性能与隔离都对，但生态发展受 ABI 不稳与编译复杂度拖累。短期看 JS plugin（如 esbuild 模型）更适合生态启动；长期看 Wasm 仍是正确方向

2. **swc 速度比 esbuild 快但只快 10-20%。开发者实际体验区别不明显。Rust vs Go 之争值得吗？**
   - 不在速度，在「能不能内嵌」。swc 是 Rust crate 可以被任意 Rust 项目（Turbopack / Parcel / Vite 部分）当库链接，esbuild 是 Go binary 只能外部调用。这种内嵌能力是 swc 战略价值

3. **DongYoon Kang 一人主导 + Vercel 资助，bus factor 高。如果他离开 SWC 怎么办？**
   - 现实风险存在。Vercel 投入巨大（Next.js 12+/Turbopack 都依赖 swc），即使 kdy1 离开，Vercel 也会派人接手维护——但能否保持现在的演进速度是问号。esbuild 的 Evan Wallace 也是一人项目，但 esbuild 已基本特性完成，swc 仍在快速演进期，依赖单点风险更高

4. **swc 不做类型检查，那它真的能算「TS 编译器」吗？**
   - 严格说不能。swc 是「JS 编译器 + TS 语法剥离器」，类型检查仍要 tsc。但市面上几乎所有「快速 TS 编译器」（esbuild / swc / Babel + preset-typescript）都不做类型检查——类型检查是 tsc 的护城河，无人能撼动

5. **swc 的「替代 Babel」叙事是否站得住？大量项目仍在用 Babel。**
   - 站得住但范围有限。Next.js 12+/Parcel 2/Storybook 7+ 默认 swc，这部分项目占 weekly 50M+ 调用量。但 webpack 默认 babel-loader、CRA 默认 Babel、大量企业自有工具链 Babel——这些迁移到 swc 的速度受 plugin 生态限制。预计 2026-2027 年 webpack 5+ 的 swc-loader 完全成熟时会有第二波迁移潮

6. **swc bundler 仍 alpha，三件套里 bundle 是不是永远做不到？**
   - 可能永远做不到 production。Vercel 自己做 Turbopack 而非完善 swc_bundler，意味着「swc 内部的 bundler」战略上被放弃。swc 的定位会收敛到 transform + minify 两件套，bundle 让给 Turbopack/Rolldown/webpack。

## GitHub 永久链接

```
链接示意：https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_ecma_parser/src/parser/mod.rs
链接示意：https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_ecma_transforms_typescript/src/lib.rs
链接示意：https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_ecma_minifier/src/lib.rs
链接示意：https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_plugin_runner/src/lib.rs
链接示意：https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_ecma_codegen/src/lib.rs
链接示意：https://github.com/swc-project/swc/blob/4a8e4d9c2f1b8e7a6d3c5b2a9f8e7d6c4b3a2918/crates/swc_ecma_visit/src/lib.rs
```

> 说明：commit hash 用 40-char hex 占位，实际查阅时去 swc-project/swc main 分支取最新 commit 替换。

## 实战对照（如何套用到自己的项目）

如果你想把现有 Babel + TypeScript 项目迁移到 swc，最小可用路径：

### 第一步：评估 plugin

跑 `cat babel.config.js .babelrc package.json | grep -i 'plugin\|preset'`，列出当前用的所有 Babel plugin / preset。把它们分类：

- preset-env / preset-typescript / preset-react / preset-flow → swc 内置，零成本
- @babel/plugin-transform-runtime → swc 内置（`jsc.externalHelpers: true`）
- 主流社区 plugin（styled-components / emotion / lodash 等）→ 查 swc plugin 列表（swc.rs/docs/plugin/plugins）有无对应 Wasm 移植
- 自写 / 冷门 plugin → 必须 Wasm 重写，工作量评估

### 第二步：替换 babel-loader

webpack 配置里：

```js
// 旧
module.exports = {
  module: {
    rules: [
      { test: /\.[jt]sx?$/, use: 'babel-loader' },
    ],
  },
};

// 新
module.exports = {
  module: {
    rules: [
      { test: /\.[jt]sx?$/, use: 'swc-loader' },
    ],
  },
};
```

`.swcrc` 配置：

```json
{
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "tsx": true,
      "decorators": true
    },
    "target": "es2020",
    "transform": {
      "react": {
        "runtime": "automatic"
      }
    },
    "externalHelpers": true
  },
  "module": {
    "type": "es6"
  },
  "minify": false
}
```

### 第三步：CI 加 tsc --noEmit

swc 不做类型检查，CI 必须保留：

```json
{
  "scripts": {
    "build": "webpack --mode production",
    "type-check": "tsc --noEmit",
    "ci": "npm run type-check && npm run build"
  }
}
```

### 第四步：观察构建时间

迁移完跑 `time npm run build` 对比迁移前。一般可以看到：

- 中型项目（500-1000 文件）：30s → 5s（6x）
- 大型项目（5000+ 文件）：5min → 40s（7-8x）

> 提示：如果用 Next.js 12+，**默认就是 swc**。除非你 `next.config.js` 里 `experimental.forceSwcTransforms = false` 强制切回 Babel，否则不需要做迁移。检查 `.babelrc` 是否存在——存在的话 Next.js 会自动切回 Babel（向后兼容），删掉 `.babelrc` 即可启用 swc。

## 我学到了什么（≥ 8 条）

1. swc 的核心价值不是「比 Babel 快」，而是「Rust 实现 + 三件套合一 + 能内嵌进 Rust 项目」。Vercel 选 swc 不是因为它快 16x，而是因为 Turbopack（Rust 写）需要把 transformer 当库链接进去——esbuild 是 Go binary 做不到这件事
2. swc plugin 用 Wasm 是有意识的赌注，赌的是「跨语言 + 性能 + 隔离」长期会赢过 Babel JS plugin 模型。但短期 plugin 生态发展慢是真实代价（10000+ vs 100+），ABI 不稳是次要问题
3. API 对齐 Babel 是 swc 在 2017-2020 年快速被采纳的关键。如果当年 swc 自创 API（像 esbuild 那样），下游迁移成本会高一个量级，Vercel 也未必选它做 Next.js 默认编译器
4. swc 不做类型检查是性能选择，不是技术做不到。tsc 类型检查占 80% 时间，删掉这部分才能跑到 6ms。所有「快速 TS 编译器」都做这个取舍
5. 单一 Rust workspace 是 swc 性能的关键——所有 crate 共享 swc_ecma_ast 节点定义，零序列化成本。这与 Babel 体系下「parser 一个包、transform 一个包、minifier 一个包，各自序列化」截然不同
6. swc 的 visitor 是 Rust trait dispatch（编译期决议），Babel 是 `visitor[node.type]`（运行期 hashmap lookup）。这一处差异乘以「每个 AST 节点一次访问」就是数量级速度差距
7. swc bundler 实验性了多年仍是 alpha，意味着「三件套合一」战略在 bundle 这一件上失败了。Vercel 自己做 Turbopack 而非完善 swc_bundler，等于战略上放弃 swc 内部的 bundler。swc 实际定位收敛到 transform + minify 两件套
8. Vercel 资助 kdy1 全职是 swc 与 esbuild（Evan Wallace 业余）的关键差异——swc 演进速度更快、文档更全、bug 修得更勤。但 bus factor 仍高，长期可持续要看 Vercel 是否持续投入
9. Wasm plugin 写起来比 Babel JS plugin 繁琐 10x（要 Rust + cargo + wasm32-wasi target + 对齐 swc_core 版本）。这是 plugin 生态启动慢的根本阻力，不是开发者懒
10. 学习编译器工具链的最佳路径：Babel 看 API 设计哲学（plugin 模型、preset 链）→ swc 看 Rust 工程化（单 workspace + visitor + Wasm plugin）→ esbuild 看极简（onResolve / onLoad 两 hook 模型）→ tsc 看类型系统（这是另一个完全不同的工程问题）

## 关联资源

- esbuild：与 swc 最直接对比，速度接近，plugin 模型差异大；理解 swc 设计取舍必看
- Babel：swc 的「替代目标」，理解 swc API 为什么这么设计必看
- TypeScript（tsc）：类型检查仍要 tsc，swc 只 strip；CI 双工具链是常态
- Next.js 12+：swc 最大用户，理解 swc 在生产环境表现必看
- Turbopack：Vercel 的下一代 bundler，把 swc 当库链接进去；swc 战略价值的最佳例证
- Parcel 2：另一个 swc 用户，默认 transformer 用 swc
- Rolldown：rollup 的 Rust 重写，与 swc 共享一些底层 crate（swc_atoms / swc_common）
- DongYoon Kang（@kdy1）的 Twitter / GitHub blog——swc 演进决策的一手资料
- swc.rs/blog——官方 release notes 与设计 RFC

## 学习路径建议

1. 先读 swc.rs 的「Getting Started」章节（30 分钟跑通一个 `transform(code, opts)` 调用）
2. 写一个最简的 `.swcrc` + `swc src --out-dir dist`，跑通 TS → JS 编译，看产物 + sourcemap
3. 读 `crates/swc_ecma_parser/src/parser/expr.rs` 的前 500 行——LL parser 的 Rust 实现范例，对比 Babel `@babel/parser` 的同等代码
4. 读 `crates/swc_ecma_transforms_typescript/src/lib.rs`——TS strip 这个 transform 的最简实例，理解 visit_mut 怎么写
5. 跟着 swc.rs/docs/plugin 写一个最简 Wasm plugin（比如「删除所有 console.log」），跑通 cargo build → wasm 加载 → 实际生效
6. 读 Next.js 源码 `packages/next/src/build/swc/`——看 Vercel 怎么把 swc 当库内嵌进 Next.js 编译流程
7. 关注 swc vs Turbopack 的关系演进——理解 swc 在 Vercel 战略里的真实定位（transformer，不是 bundler）
