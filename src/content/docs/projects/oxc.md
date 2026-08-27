---
title: oxc — 用一份 arena AST 串起 JS/TS 编译器组件
来源: https://github.com/oxc-project/oxc
日期: 2026-05-30
分类: 编译器 / 工具链
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/oxc-project/oxc
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4e258430cdb290598d9f2aeb2d13be598ec9e8e9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.147.0
---

## 是什么

oxc（Oxidation Compiler）是一组用 Rust 写的 JavaScript / TypeScript 编译器组件。日常类比：不是再盖一座“全能工厂”，而是先把图纸、料架和尺码统一——parser 产出同一棵 AST，linter、transformer、minifier、codegen 都在这棵树上干活。

固定 `crates_v0.147.0` 里，`oxc` crate 是带 feature 的门面；真正的节点类型在 `oxc_ast`，分配在 `oxc_allocator`，源码位置在 `oxc_span`。Node 侧通过 NAPI 包使用，例如 `oxc-parser@0.147.0`。

```rust
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

let allocator = Allocator::default();
let ret = Parser::new(&allocator, "const x: number = 1;", SourceType::ts()).parse();
```

`ret.program` 是 AST，`ret.diagnostics` 是可恢复语法错误，`ret.panicked` 为真时 program 会被清空。

## 为什么重要

不理解 oxc，下面这些事都没法解释：

- 为什么 [[rolldown]] 能把 parse / transform / minify 都押在同一套 crate 上，却把模块解析放到另一个仓库
- 为什么“parse 成功”不等于“这棵树可以拿去变换”——语义分析和 scoping 是后一步
- 为什么同一仓库里同时出现 `0.147.0` 的编译器 crate 和 `1.x` 的 linter/apps 版本号
- 为什么旧印象里的“完全不做插件、resolver 也在本仓”对不上固定源码

## 核心要点

固定版本的主链可以拆成四层：

1. **地基独立成 crate**：`oxc_allocator` 是 bump arena；`oxc_span::Span` 用 `u32` 记起止，源文件超过约 4 GiB 会被拒绝；`oxc_ast` 把 estree 里含糊的 `Identifier` 拆成 `BindingIdentifier` / `IdentifierReference` / `IdentifierName`。

2. **parser 只做句法**：手写递归下降，支持稳定 ECMAScript、TypeScript、JSX/TSX。作用域、符号和更贵的语法检查交给 `oxc_semantic`。可恢复错误仍会留下结构完整的 AST；不可恢复则 `panicked`。

3. **`Compiler::compile` 是可选流水线**：parse → 可选 isolated declarations → semantic → 可选 transform → inject/define → compress/DCE → mangle → codegen。transform 之后 scoping 与 AST 不同步，inject/define/compress 会先重建 `Scoping`。

4. **发布流是两条**：本页绑定 `crates_v0.147.0` / `4e258430...`，编译器 crate 与 `oxc-parser` 均为 `0.147.0`。同提交里 `oxc_linter` 报 `1.79.0`；`apps_v1.80.0` 指向另一 SHA。`oxc_resolver` 不在本 workspace。

## 实践示例

### 案例 1：Rust 侧 parse，并区分 panicked 与 diagnostics

```rust
let allocator = Allocator::default();
let ret = Parser::new(&allocator, source, SourceType::from_path(path)?).parse();
if ret.panicked {
    // program 被换成 dummy，不要继续 semantic / transform
}
// diagnostics 非空时，AST 仍可能在；语义是否合法要再跑 SemanticBuilder
```

`SourceType` 同时编码语言、module/script/commonjs/unambiguous 和 JSX。`unambiguous` 只是 parser 输入：看到 `import` / `export` / `import.meta` 才落成 module。

### 案例 2：Node 侧用 `oxc-parser` 同步解析

```js
import { parseSync } from "oxc-parser";

const result = parseSync("app.ts", "export const n: number = 1;");
console.log(result.program, result.errors);
```

`parse()` 把 Rust parse 放到别的线程，但 AST 反序列化仍在当前线程，文档写明同步反序列化通常比异步 parse 更重。多文件并行应自己开 worker，而不是指望 `parse()` 自动摊开。

### 案例 3：同一棵树接着做 transform，而不是重新 parse

`Transformer::new(allocator, path, options).build_with_scoping(scoping, program)` 接收已经做过 semantic 的 `Scoping`。TypeScript 擦除、JSX、按 target 降级都在 `oxc_transformer`。下游 bundler 的收益是少一次 parse，也少一次 AST 互转。

## 踩过的坑

1. **把空 `diagnostics` 当成语义合法**：parser 文档要求再跑带 syntax-error checking 的 semantic analysis。
2. **transform 之后复用旧 scoping**：`compiler.rs` 明确 transformer 会把符号表弄脏；inject/define/compress 前必须重建。
3. **把 `oxc_resolver` 写进本仓**：Rolldown 的 `Cargo.toml` 也把它标成独立仓库依赖。
4. **把 apps 的 1.x 版本当成 crate 版本**：linter/CLI 与 parser/transformer 不是同一套 semver。
5. **以为 `parse()` 能把大部分工作并行化**：NAPI 注释写明反序列化占大头。

## 适用 vs 不适用场景

**适用**：

- 自己做 bundler、转译器或语言服务，需要一份可复用的 TS/JS AST
- 要在 Rust 或 Node 里做 parse → semantic → transform → codegen，且能接受 arena lifetime
- 阅读 [[rolldown]] 的 parse/transform/minify 底座

**不适用**：

- 把 oxc 当成 `tsc --noEmit`：固定 `Compiler` 不跑完整类型检查
- 需要本仓自带的 Node 风格 resolver：那是 `oxc-project/oxc-resolver`
- 只想评测 linter CLI 产品面：应另绑 `apps_*` / `oxlint_*` 标签，不是这篇 crate 页
- 源文件可能超过 4 GiB

## 固定版本边界

- 本文绑定 `oxc-project/oxc@4e258430...`，tag `crates_v0.147.0`，编译器 crate / `oxc-parser` 为 `0.147.0`。
- 同提交 `oxc_linter=1.79.0`；`apps_v1.80.0` 是另一可达提交，未并入本页。
- NAPI 包声明 Node `^20.19.0 || >=22.12.0`；workspace MSRV 为 `1.96.0`。
- 未安装依赖、运行上游测试或测量性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **共享 AST 比“再用 Rust 重写一遍工具”更关键**——下游能少做胶水层
2. **句法树和符号表是两份合同**——parse 通过只说明树还在
3. **monorepo 里可以有两套版本号**——crate 流和 apps 流不能互相替代
4. **性能数字必须绑到具体 revision 与测量**——架构文档里的倍数不是本页证据

## 应用型自测

1. `Parser::parse` 返回的 `diagnostics` 为空。这棵 AST 是否已通过语义检查？
2. 刚跑完 `Transformer::build_with_scoping`，能否把原来的 `Scoping` 直接交给 compress？
3. 在本仓库里能找到 `oxc_resolver` 这个 workspace member 吗？

检查点：

1. 不能。还要跑 semantic；parser 把更贵的检查推迟了。
2. 不能默认可以。transform 后 scoping 与 AST 不同步，需要重建。
3. 找不到。resolver 是独立仓库。

## 延伸阅读

- 官方文档：[oxc.rs](https://oxc.rs)
- 固定源码：[oxc-project/oxc](https://github.com/oxc-project/oxc) —— 本文绑定 `4e258430cdb290598d9f2aeb2d13be598ec9e8e9`
- 审查记录：仓库内 `docs/oxc-rolldown-source-review-20260827-o.md`
- [[rolldown]] —— 同提交族的 `oxc@0.147.0` 消费者
- [[swc]] —— 另一条 Rust JS 工具链，AST 与发布模型不同

## 关联

- [[rolldown]] —— 用 oxc 做 parse / transform / minify 的打包器
- [[vite]] —— npm `vite@8.2.2` 已依赖 rolldown，间接受益于 oxc
- [[swc]] —— 老一代 Rust JS 编译器对照
- [[esbuild]] —— Go bundler，parser 不对外复用
- [[biome]] —— 同代 Rust 工具链，产品切分不同
- [[lightningcss]] —— Rust CSS 一侧的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[depcheck]] —— depcheck — 对照 package.json 找未使用和缺失依赖
- [[knip]] —— Knip — 按工作区图找未使用依赖、导出和文件
- [[rolldown]] —— rolldown — 用 Rust 实现 Rollup 兼容协议的打包器
