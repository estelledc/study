---
title: oxc-parser — 把 JS/TS 源码收成一份 ESTree
description: 介绍 oxc-parser 0.147.0 如何用 NAPI 同步解析、JSON 反序列化和可选 semantic 错误产出 ESTree。
来源: https://github.com/oxc-project/oxc
日期: 2026-08-27
分类: 编译器 / 工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
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

oxc-parser 是 oxc 仓库里给 Node 用的 **JavaScript / TypeScript 解析器包**。日常类比：它不做炒菜（transform / minify），只负责把菜单原文读成一份别人能接着改的标准点菜单（ESTree）。

固定 0.147.0 的 npm 包名就是 `oxc-parser`，入口在 monorepo 的 `napi/parser`。常见写法：

```js
import { parseSync } from "oxc-parser";

const result = parseSync("app.ts", "export const n: number = 1;");
console.log(result.program.type, result.errors, result.module.hasModuleSyntax);
```

文件名用来猜方言；返回值用 getter 给出 `program`、`module`、`comments` 和 `errors`。

## 为什么重要

不看 Node 包合同，容易把它和整套 [[oxc]] 编译器、甚至未在本轮绑定的 `oxc-transform` 说成同一件事：

- 为什么 `parse()` 看起来异步，却经常比 `parseSync` 更亏
- 为什么默认“解析成功”不等于“重复声明之类的语义错误已经报完”
- 为什么拿到的是 ESTree JSON，而不是 Rust arena 里的那棵树
- 为什么同一份 `crates_v0.147.0` 已经有 [[oxc]] 页，还要单独看这个 npm 包

## 核心要点

固定 0.147.0 的主链可以拆成五步：

1. **按文件名或 `lang` 选方言**：`ParserOptions.lang` 可以是 `js` / `jsx` / `ts` / `tsx` / `dts`。不传就看扩展名。`sourceType` 可以是 `script` / `module` / `commonjs` / `unambiguous`。

2. **默认走同步 NAPI**：`parseSync` 在当前线程调用 Rust `Parser`，再把 AST 编成 ESTree JSON。`showSemanticErrors` 默认关；打开才再跑 `SemanticBuilder`。

3. **JS 侧先 `wrap` 再读**：NAPI 的 `ParseResult` getter 会 `mem::take` 走字段。`wrap.js` 第一次读 `program` 时才 `JSON.parse`，并用 Rust 给的 `fixes` 路径补 `BigInt` / `RegExp`。

4. **异步并不等于能摊开**：`parse()` 把 Rust parse 放到别的线程，但反序列化仍在当前线程。源码注释写明这笔同步工作通常比 parse 重 3 到 20 倍，多文件应自己开 worker。

5. **顺手带回 ESM 清单**：`result.module` 给出静态 import/export、`import.meta` 和动态 import 位置，避免为了改导入再走一遍树。`Visitor` / `visitorKeys` 用来走 ESTree。

## 实践示例

### 案例 1：用文件名决定 TS，并读 ESM 清单

```js
import { parseSync } from "oxc-parser";

const result = parseSync(
  "route.ts",
  "import n from './n.ts';\nexport const x: number = n;"
);
result.module.hasModuleSyntax;          // true
result.module.staticImports[0].moduleRequest.value;
result.errors;                          // 句法错误；默认不含重复声明
```

`filename` 不是装饰。扩展名会参与 `get_source_type`。只要清单，不必自己写 walker。

### 案例 2：默认快路径看不到语义重复

```js
const silent = parseSync("dup.js", "let foo; let foo;");
silent.errors.length;                   // 默认 0

const loud = parseSync("dup.js", "let foo; let foo;", {
  showSemanticErrors: true
});
loud.errors.length;                     // 语义 pass 之后才有
```

README 把默认叫做 fast mode：适合后面还有别的检查器的 bundler 插件。

### 案例 3：Visitor 按 enter / exit 走 ESTree

```js
import { parseSync, Visitor } from "oxc-parser";

const { program } = parseSync("demo.ts", "const url = import.meta.url;");
const seen = [];
new Visitor({
  Identifier(ident) { seen.push(ident.name); },
  "VariableDeclaration:exit"(decl) { seen.push(`exit ${decl.kind}`); }
}).visit(program);
```

`Visitor` 第一次构造才加载 generated walker。`experimentalRawTransfer` / `experimentalLazy` 只在 64 位小端平台编译进去。

## 踩过的坑

1. **把 `parse()` 当成自动并行**：反序列化仍在调用线程。源码明确建议多文件用 worker + `parseSync`。
2. **把空 `errors` 当成语义合法**：默认不做符号表。`let foo; let foo;` 在 fast mode 是静音的。
3. **以为拿到的是 Rust AST**：Node 包交出的是 ESTree / TS-ESTree JSON。Rust 侧那棵 arena 树在 [[oxc]]。
4. **把本页当成 transform 包**：`oxc-parser` 不擦类型、不降 JSX。那是 `oxc-transform` / `oxc_transformer`，本轮不绑。
5. **忽略 Node 引擎**：固定包装 `^20.19.0 || >=22.12.0`。

## 适用 vs 不适用场景

**适用**：

- 要在 Node 里拿一份和 Acorn / TS-ESLint 对齐的 ESTree，并接受 JSON 反序列化
- 写 parser plugin，需要静态 import/export 清单，但不想再 walk 一遍
- 已经另有类型检查或 lint，只把 oxc-parser 当快路径句法层

**不适用**：

- 要从 Rust 接着做 semantic → transform → codegen——应看 [[oxc]] 的 `Compiler`
- 只想评测 linter CLI——应看 [[oxlint]] 的 `apps_*` 标签
- 需要本包顺便转译 TS/JSX——应另绑 transform 包，不是这篇
- 目标平台不是 64 位小端，却指望 `experimentalRawTransfer`

## 固定版本边界

- 本文绑定 `oxc-project/oxc@4e258430cdb290598d9f2aeb2d13be598ec9e8e9`，tag `crates_v0.147.0`，`oxc-parser@0.147.0`。
- npm 未发布 `gitHead`；身份靠 tag + 包版本 + 提交。同一 SHA 已被 [[oxc]] 页绑定，本页只审 `napi/parser`。
- JS 的 AST 默认：JS/JSX 走 ESTree，TS/TSX 走 TS-ESTree；可用 `astType: 'ts'` 统一带 TS 字段。
- `preserveParens` 默认 true；`range` 默认 false。JS 文件的 hashbang 会被塞进 `comments`，TS 对齐 TS-ESLint 选择忽略。
- 本文未安装依赖、运行上游测试或测量 parse 耗时，状态保持 `UNVERIFIED`。

## 学到什么

1. **Node 包和 Rust crate 不是同一份合同**——一边交出 ESTree JSON，一边把树留在 arena。
2. **异步 API 不能自动省掉反序列化**——线程只帮了 parse 那一段。
3. **空错误列表默认只覆盖句法**——语义要另开一趟，或交给下游。
4. **ESM 清单是一等返回值**——改导入不一定要先变成可写 AST。

## 应用型自测

1. `await parse("a.ts", src)` 会不会把 JSON 反序列化也挪到后台线程？
2. 默认选项下，`let foo; let foo;` 会不会出现在 `result.errors`？
3. 本页绑定的 npm 包会不会把 TypeScript 类型注解擦掉？

检查点：

1. 不会。Rust parse 可以在别的线程，反序列化仍在当前线程。
2. 不会。默认 `showSemanticErrors` 为 false。
3. 不会。它只解析；擦类型是 transform 包的事。

## 延伸阅读

- 使用说明：[oxc.rs/docs/guide/usage/parser](https://oxc.rs/docs/guide/usage/parser)
- 固定源码：[oxc-project/oxc](https://github.com/oxc-project/oxc) —— 本文绑定提交 `4e258430cdb290598d9f2aeb2d13be598ec9e8e9`
- 审查记录：仓库内 `docs/js-transform-source-review-20260827-ip.md`
- [[oxc]] —— 同一提交上的 Rust 编译器门面与 `Compiler` 流水线
- [[swc]] —— 另一条 Rust JS 工具链，Node 包同时提供 parse / transform / minify

## 关联

- [[oxc]] —— 同仓 crate 门面；本页不重写它的 Compiler 合同
- [[oxlint]] —— 同仓 apps 流的 linter，版本号与 crate 流分开
- [[swc]] —— Node 侧把 parse 和 transform 放在同一个 `@swc/core`
- [[rolldown]] —— 下游打包器，parse 走 oxc crate 而不是这个 npm 包
- [[biome]] —— 同代 Rust 工具链，产品切分不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[swc]] —— SWC — 用 Rust crate 和 @swc/core 做 TS/JS 转译
