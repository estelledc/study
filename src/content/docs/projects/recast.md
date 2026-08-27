---
title: Recast — 尽量复用原文的 JS AST 打印机
description: 默认 Esprima 解析；print 只改动过的子树，其余贴回原文
来源: https://github.com/benjamn/recast
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/benjamn/recast
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 93325e37b544b1f3d69d46efbee23cf2f5b86efd
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.24.0
---

## 是什么

Recast 是一个 **JavaScript 语法树改写器 + 非破坏 pretty-printer**。日常类比：它不像排版机把整页重排，更像校对员只改圈出来的句子，其余原句、空格和注释尽量贴回去。

固定 0.24.0 的 npm 包名是 `recast`，入口是 `main.ts` 导出的 `parse` / `print` / `prettyPrint` / `visit` / `run`。`visit` 直接再导出 `ast-types`。常见入口：

```js
const recast = require("recast");
const ast = recast.parse(source);
recast.visit(ast, {
  visitIdentifier(path) {
    if (path.node.name === "foo") path.node.name = "bar";
    this.traverse(path);
  },
});
const { code } = recast.print(ast);
```

`print()` 返回 `{ code, map? }`，不要再把它当字符串用；`toString()` 只会警告一次并返回 `.code`。

## 为什么重要

不看固定入口，容易把 Recast 说成「随便换 parser 的 Prettier」：

- 为什么默认 parser 仍是 `recast/parsers/esprima`，不是 Babel
- 为什么 `print` 和 `prettyPrint` 不是同一条路
- 为什么改名后周围空格还能留下来
- 为什么 TypeScript / Flow 源码必须显式换 parser

一句话：0.24.0 的合同是 **Esprima 默认 + `original` 副本 + Patcher 局部替换**，不是全树 codegen。

## 核心要点

固定版本可以把主链拆成五步：

1. **规范化选项**：`lib/options.ts` 默认 `parser = recast/parsers/esprima`、`tabWidth: 4`、`reuseWhitespace: true`、`wrapColumn: 74`、`tokens: true`、`tolerant: true`。旧键 `esprima` 仍可覆盖 `parser`。
2. **解析并复制**：`parse()` 先把 tab 展开成空格再交给 parser；`Program` 根会包成 `File`。`TreeCopier` 给每个节点挂不可枚举的 `original`，并把 token 范围写进 `loc.start.token` / `loc.end.token`。
3. **改树**：`visit` 来自 `ast-types`。替换节点时留下 `original`，打印机才知道哪一段还能复用原文。
4. **局部重印**：`Printer.print()` 对仍能对上 `original.loc.lines` 的节点走 `getReprinter()` → `Patcher.replace()`；对不上就 `printGenerically()`。
5. **可选 source map**：只有当初 `parse` 传了 `sourceFileName`、`print` 再传 `sourceMapName`，结果才会带 `.map`。`prettyPrint()` 故意不走复用。

预置 parser 在 `parsers/`：`esprima`（默认）、`babel`、`babel-ts`、`typescript`、`flow`、`acorn`、`babylon`。`parsers/babel.ts` 会 `require("@babel/parser")`，失败再试 `babylon`，两者都没有就抛「Install @babel/parser…」。这些 parser **不是** `recast` 的 runtime 依赖；依赖里只有 `ast-types`、`esprima`、`source-map`。

`engines.node` 为 `>= 22`。

## 实践示例

### 案例 1：最小改写并保留原文

```js
const recast = require("recast");
const ast = recast.parse("exports.foo({ bar: this });");
recast.visit(ast, {
  visitThisExpression() {
    return recast.types.builders.identifier("self");
  },
});
console.log(recast.print(ast).code);
// exports.foo({ bar: self });
```

**逐部分解释**：

1. 默认 Esprima 足够解析这段 CommonJS
2. `visitThisExpression` 返回新节点，等于替换 `this`
3. `print` 只重印被换掉的表达式，对象字面量和空格走原文

### 案例 2：TypeScript 必须换 parser

```js
const recast = require("recast");
const parser = require("recast/parsers/typescript");
const ast = recast.parse("const x: number = 1;", { parser });
```

默认 Esprima 不认类型注解。`parsers/typescript` 走 `@babel/parser` / babylon 回退，需要调用方自己装。

### 案例 3：`prettyPrint` 丢掉原文风格

```js
const recast = require("recast");
const ast = recast.parse("const  x=1");
recast.prettyPrint(ast).code; // 按 tabWidth / wrapColumn 重新排
```

身份测试 `test/identity.ts` 断言的是 `print(parse(source)).code === source`，不是 `prettyPrint`。

## 踩过的坑

1. **把 `print` 结果当字符串**：0.24.0 返回对象；当字符串用会触发 deprecation warning。
2. **默认 parser 吃不下 TS/JSX**：JSX 要在 parser 选项里打开，或改用 `parsers/babel`；TS 用 `parsers/typescript` / `babel-ts`。
3. **自己 `JSON.parse(JSON.stringify(ast))` 再打印**：丢掉 `original` 后只能走 generic printer，原空白不会回来。
4. **以为 Babel parser 已内置**：`@babel/parser` 只在 devDependencies，生产要用 Babel 解析必须另装。

## 适用 vs 不适用场景

**适用**：
- jscodeshift / codemod：改 API 但尽量不动周围格式
- 需要自动 source map 的二次打印
- 已经能用 Esprima 或显式 Babel/TS parser 的源码

**不适用**：
- 想统一全仓库风格 → 那是 formatter 的活，应看 [[biome]] / Prettier
- 要做整套编译降级 → 应看 [[babel]] / [[swc]]
- 目标运行时低于 Node 22 → 固定包 `engines.node` 已是 `>= 22`

## 固定版本边界

- 本文绑定 `benjamn/recast@93325e37...`。GitHub annotated tag `v0.24.0` 剥开后与 npm `recast@0.24.0` 的 `gitHead` 指向同一提交。
- 包版本为 `0.24.0`；`main` 指向编译后的 `main.js`。
- 本文只做源码/测试静态审查，没有安装依赖、运行 mocha 或测量打印速度，状态保持 `UNVERIFIED`。

## 学到什么

1. **「改 AST」和「重排全文」是两条路**：Recast 用 `original` + Patcher 把未改动文本贴回去
2. **默认 parser 决定能吃什么语法**：Esprima 不是 Babel，缺插件就要换模块
3. **打印 API 的返回值形状会变**：0.24.0 的 `print` 已经是对象合同
4. **codemod 工具的价值在最小 diff**：复用原文是为了让 review 只看到语义改动

## 应用型自测

1. `recast.print(ast)` 在 0.24.0 直接得到字符串吗？
2. 不传 `parser` 时，`const x: number = 1` 会走哪条解析器？
3. 把 AST `structuredClone` 之后再 `print`，周围空格还会保持吗？

检查点：

1. 不会。返回 `{ code, map? }`；当字符串用只会 `toString()` 出 `.code` 并警告。
2. 默认 `recast/parsers/esprima`，不认类型注解。
3. 不会。副本没有 `original`，只能 generic print。

## 延伸阅读

- 仓库：[github.com/benjamn/recast](https://github.com/benjamn/recast)
- 固定源码：[benjamn/recast](https://github.com/benjamn/recast) —— 本文绑定提交 `93325e37b544b1f3d69d46efbee23cf2f5b86efd`
- [[babel]] —— 需要 Babel AST 时用 `recast/parsers/babel`
- [[ast-grep]] —— 按结构搜索/改写，但不做原文贴回
- [[swc]] —— 另一条「整文件变换」路线，不走 Recast Patcher

## 关联

- [[babel]] —— Recast 的可选 parser 后端
- [[ast-grep]] —— 结构搜索，不保留原文空白
- [[swc]] —— Rust 编译器，整树变换
- [[esbuild]] —— 另一条高速整文件变换
- [[webpack]] —— 打包器；codemod 常发生在它上游
