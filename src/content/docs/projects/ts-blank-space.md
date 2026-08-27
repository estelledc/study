---
title: ts-blank-space — 用空白覆盖类型、不重写 JavaScript
description: 介绍 ts-blank-space 0.9.0 如何用官方 TypeScript parser 把类型涂成空白，并处理 ASI 与不可擦语法。
来源: https://github.com/bloomberg/ts-blank-space
日期: 2026-08-27
分类: 编译器 / 工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/bloomberg/ts-blank-space
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 74579cee118bb5f257fab7372f869cc107032316
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.9.0
---

## 是什么

ts-blank-space 是一个纯 JavaScript 的 TypeScript 类型擦除器。日常类比：它不像复印后再排版，而像用涂改液把类型涂掉——纸上剩下的字还在原来的行、列和字节偏移。

你写：

```js
import tsBlankSpace from "ts-blank-space";

tsBlankSpace("let x: string;");
// "let x        ;"
```

默认入口自己调用官方 TypeScript `createSourceFile`，按 `ScriptKind.TS` 解析，再把类型区间换成空白。已经有 `SourceFile` 时走 `blankSourceFile`。固定 0.9.0 不降级语法，也不生成 SourceMap。

## 为什么重要

不理解“涂空白”和“重打印 AST”，就解释不了下面几件事：

- 为什么抹掉类型后，调试栈和编辑器列号还能对上原文
- 为什么有的 `as` / `satisfies` 不能涂，涂了会改运算符结合
- 为什么 `enum`、参数属性这种带运行时语义的语法会报错并原样留下
- 为什么 Node loader 假定 `.ts` / `.mts` 都是 ESM

## 核心要点

固定 0.9.0 的主链可以拆成五步：

1. **官方 parser，不是自研文法**：`tsBlankSpace(input)` 用 `ScriptTarget.ESNext` + `ModuleKind.ESNext` 建 AST。TypeScript >= 5.3 时关掉 JSDoc 解析。

2. **只改区间，不重写 JS**：`BlankString` 记下要涂的 `[start, end)`，最后把原文切片拼回去；空白里保留 `\n` / `\r`，其余写成空格。

3. **少数地方必须插入符号**：上一句没分号时，整句类型声明开头补 `;`；箭头函数的泛型或返回类型跨行时，可能把 `(` / `)` 挪到空白区里，避免 ASI 把下一行当成调用。

4. **不可擦的语法走 `onError`**：`enum`（除非 `declare`）、有值的 `namespace`、`import =` / `export =`、构造器参数属性、前缀 `<T>x`，以及会改 `+` / `*` / `**` 结合的 `as` / `satisfies`。回调之后原文留下，不假装成功。

5. **Node loader 只做预处理**：`node --import ts-blank-space/register` 注册 `loader/hooks.js`。`.ts` / `.mts` 先涂空白，再补 `//# sourceURL=`；失败的 `.js` / `.mjs` 解析会改成 `.ts` / `.mts` 再试。

## 实践示例

### 案例 1：类型区间变成等长空白

```js
import tsBlankSpace from "ts-blank-space";

tsBlankSpace("class C<T> extends Array<T> implements I {}");
// "class C    extends Array                 {}"
```

泛型和 `implements` 被涂掉，`class` / `extends` 还在原位。这不是 codegen，所以不需要再做 SourceMap。

### 案例 2：自带 AST，并处理 TSX

```js
import ts from "typescript";
import { blankSourceFile } from "ts-blank-space";

const ast = ts.createSourceFile(
  "input.tsx",
  source,
  ts.ScriptTarget.ESNext,
  false,
  ts.ScriptKind.TSX,
);
const jsx = blankSourceFile(ast, onError);
```

默认入口按 `.ts` 解析。文件里有 JSX 时必须自己建 `ScriptKind.TSX` 的 `SourceFile`，否则官方 parser 会把标签当成比较运算。

### 案例 3：loader 把失败的 `.js` 再试成 `.ts`

```sh
node --import ts-blank-space/register ./app.ts
```

`resolve` 先走默认解析；失败且 URL 以 `.js` / `.mjs` 结尾时，改成 `.ts` / `.mts` 再 `nextResolve`。`load` 只处理 `.ts` / `.mts`，并强制 `format = "module"`。

## 踩过的坑

1. **把“能擦类型”当成“能编译 TypeScript”**：`enum Direction { North }` 会触发 `onError` 并留在输出里。要兼容擦除器，应改成 `as const` 对象 + 类型别名。

2. **前缀断言 `<const>value` 不会被涂**：2015 年后的 `value as const` 可以；前缀形式在 `return` / `=>` 后面会改语义，源码选择不支持。

3. **`declare enum` / `declare namespace` 会被涂掉**：`declare` 是作者断言运行时已有这个值。涂掉声明后，`N.x` 仍可能在运行时报错。

4. **所有 import 都是 `import type` 时，输出不会自动加 `export {}`**：文件可能从 ESM 掉成 script。需要 ESM 标记时得自己补。

5. **README 的速度比较不是本轮测量**：文档写过“比 native 慢约 4 倍”、以及和非 native 工具的对比；本轮未跑 `perf/`。

## 适用 vs 不适用场景

**适用**：

- 源码已经是现代 JS，只缺一层类型擦除，并希望行列与原文重合
- 能接受 `erasableSyntaxOnly` / `verbatimModuleSyntax` / `target: esnext`
- 已经有 TypeScript `SourceFile`，想复用 AST 而不是再解析一次

**不适用**：

- 需要把 `enum`、命名空间、参数属性或旧前缀断言编译成可运行 JS——应看 [[oxc-transform]]
- 需要 JSX 变换、按 browserslist 降级、inject/define 或同时出 `.d.ts`
- 不能接受 Node `>= 18` 且依赖 `typescript@5.1.6 - 6.0.x`
- 把 `.ts` 当 CommonJS 加载——loader 一律按 ESM 处理

## 固定版本边界

- 本文绑定 `bloomberg/ts-blank-space@74579cee118bb5f257fab7372f869cc107032316`，tag `v0.9.0` 与 npm `gitHead` 是同一提交。
- `package.json` 声明 `type: module`，`main` / `exports["."]` 指向 `./out/index.js`，`exports["./register"]` 指向 `./loader/register.js`。
- 未安装依赖、运行 upstream 测试或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **空白覆盖是一种合同，不是“更快的 tsc”**——它保住位置，也放弃了运行时语法重写。
2. **ASI 和运算符优先级会逼出例外**——少数输出里会出现 `;` 或移动过的括号。
3. **`onError` 是失败通道，不是日志**——不可擦语法必须改源码或换会重写 AST 的工具。
4. **loader 的扩展名回退不能推广成打包器语义**——它只服务 Node customization hooks。

## 应用型自测

1. 上一句没有分号，下一句是 `type Foo = true`，再下一句是 `("call")`。擦除后会不会把 `"call"` 当成上一句的调用？
2. `enum Direction { North }` 会被涂成空白吗？
3. `node --import ts-blank-space/register app.ts` 把 `app.ts` 当成 CommonJS 还是 ESM？

检查点：

1. 不会。类型语句在需要时会以 `;` 开头，切断 ASI。
2. 不会。普通 `enum` 走 `onError`，原文留下。
3. ESM。`load` 固定 `format = "module"`。

## 延伸阅读

- 文档：[bloomberg.github.io/ts-blank-space](https://bloomberg.github.io/ts-blank-space)
- 固定源码：[bloomberg/ts-blank-space](https://github.com/bloomberg/ts-blank-space) —— 本文绑定提交 `74579cee118bb5f257fab7372f869cc107032316`
- 审查记录：仓库内 `docs/ts-strip-source-review-20260827-hd.md`
- [[oxc-transform]] —— 会重写 AST 的对照：enum / JSX / target / `.d.ts`

## 关联

- [[oxc-transform]] —— 删除注解后重新打印，不保留行列
- [[oxc]] —— `oxc-transform` 所在 monorepo 的 compiler facade
- [[swc]] —— 另一条会重写 AST 的 Rust 转译链
- [[esbuild]] —— Go bundler，类型擦除只是打包的一步
- [[rolldown]] —— 消费 oxc transform 的打包器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[oxc-transform]] —— oxc-transform — Node 侧把 TS/JSX 重新打印成目标语法
