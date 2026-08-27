---
title: meriyah — 选项里打开 JSX 与三项提案的自托管 ESTree 解析器
description: 默认 script，next 只开装饰器与两种 import phase，正则对错取决于宿主引擎
来源: https://github.com/meriyah/meriyah
日期: 2026-08-27
分类: JavaScript 解析器
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/meriyah/meriyah
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3e586e4c957a438bf872a9d09aab334a3cea3f8d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.3.2
---

## 是什么

meriyah 是一个自托管的 JavaScript 解析器：词法和句法都用 TypeScript 写成，输出 ESTree。日常类比：它不像 [[acorn]] 那样先让你拨一个年份旋钮，而像一台出厂就按当前标准校准的读稿机；要试还没定稿的旋钮，得单独打开 `next`，要读 JSX，得单独打开 `jsx`。

```js
import { parse } from "meriyah"

const ast = parse("export const n = 1", { sourceType: "module", ranges: true })
```

固定 `7.3.2` 的发布入口是 `dist/meriyah.mjs` / `dist/meriyah.cjs`。`engines.node` 声明 `>=20.0.0`。文档写明不解析 TypeScript 或 Flow。

## 为什么重要

不看固定源码，容易把 meriyah 说成“更快的 acorn 升级版”：

- 为什么 `parseScript` / `parseModule` 还在导出，源码却标了 `@deprecated`
- 为什么 `next: true` 不会把所有 stage 3 一键打开，只打开装饰器、`import defer` 和 `import source`
- 为什么同一段非法正则在 Node 22 和 Node 24 上可能一个过、一个抛
- 为什么 `sourceType: "commonjs"` 允许顶层 `return`，AST 上仍写 `sourceType: "script"`

## 核心要点

固定 7.3.2 的主链可以拆成五步：

1. **入口先摊平选项**：`parse` 调用 `parseSource` → `normalizeOptions`。`module: true` 且没写 `sourceType` 时升成 `'module'`；`globalReturn: true` 且当前是 script 时升成 `'commonjs'`。这两项本身已废弃。

2. **上下文是位掩码，不是年份表**：`module` 加上 `Context.Module | Context.Strict`；`commonjs` 加上 `InReturnContext | AllowNewTarget`。收树时只有 module 会把 `Program.sourceType` 写成 `'module'`，其余都是 `'script'`。

3. **词法一次向前看**：README 强调 no backtracking。`#!` 在 `parseSource` 开头无条件 `skipHashBang`，没有对应 option。JSX 另走 `lexer/jsx.ts`。

4. **`next` 是三比特，不是“未来语法大礼包”**：`Features.Decorators | ImportDefer | ImportSource`。7.2.0 起的 `using` / `await using` 不靠这个开关。

5. **正则对错外包给宿主**：`validateRegex` 默认 `true`，用运行时 `RegExp` 验字面量。ESTree 不要求拆开正则内部结构；Node 版本一变，同一段 `/.../` 可能从“能 parse”变成 `ParseError`。

## 实践示例

### 案例 1：用一个函数覆盖 script / module / commonjs

```js
import { parse, parseModule } from "meriyah"

parse("let x = 1") // 默认 script
parse("export default 1", { sourceType: "module" })
parse("return 1", { sourceType: "commonjs" })
// parseModule(src) 仍能用，但源码标成 deprecated
```

commonjs 让顶层 `return` 合法，是因为上下文带了 `InReturnContext`，不是因为树顶会写成 `"commonjs"`。7.3.1 还修过 commonjs 顶层 `using`。

### 案例 2：JSX 和三项提案都是选项，不是默认值

```js
import { parse } from "meriyah"

parse("<Box />", { jsx: true })
parse("@dec class C {}", { next: true })
```

`jsx: true` 才进 JSX lexer；7.3.2 修的就是 JSX 上下文标识符，以及 `>` 后面紧跟 `=` 的分词。`next: true` 只打开装饰器与两种 import phase。TypeScript 注解在这里仍然是非法 token。

### 案例 3：错误类型可以品牌检查，范围字段可以拆开要

```js
import { parse, isParseError } from "meriyah"

try {
  parse("const =")
} catch (error) {
  if (isParseError(error)) {
    // error.description 不含坐标；message 才带 [line:col-line:col]
  }
}

parse("1 + 2", { ranges: { start: true, end: true } }) // 不要 range 数组
```

`ParseError` 继承 `SyntaxError`，并带 `start` / `end` / `range` / `loc`。`isParseError` 就是 `instanceof ParseError`。`ranges: true` 会同时写 `start`、`end` 和 `range`；对象形式可以少写其中一项。

## 踩过的坑

1. **把 README 的 `parseScript` 当首选 API**：`meriyah.ts` 已经改口，推荐 `parse({ sourceType })`。
2. **以为 `next` 等于“打开全部提案”**：源码里的 `nextFeatures` 只有三项。
3. **在 CI 矩阵里默认 `validateRegex: true` 却换 Node 主版本**：正则对错会跟着宿主走。
4. **按 `Program.sourceType` 判断是不是 commonjs**：树顶仍是 `'script'`。
5. **把 meriyah 的 `acorn` 依赖看成运行时**：`package.json` 里它是 devDependency，用来对照测试。

## 适用 vs 不适用场景

**适用**：

- 要一份 ESTree，并且希望 JSX / 部分提案用选项打开，而不是再接一套插件类
- Node >= 20 的工具链，能接受正则校验依赖宿主
- 阅读和 [[acorn]] 同一份 AST 合同、但入口形状不同的实现

**不适用**：

- 要 TypeScript 或 Flow：固定 README 明确拒绝
- 要在本包里打开任意 stage 3：只有 `next` 那三项
- 把 playground 上的速度图写成“已经在你的仓库测过”——本文没有跑 benchmark

## 固定版本边界

- 本文绑定 `meriyah/meriyah@3e586e4c957a438bf872a9d09aab334a3cea3f8d`。annotated tag `v7.3.2` 与 npm `meriyah@7.3.2` 的 `gitHead` 同指此提交。
- 7.3.2 本身是 JSX 分词与重复绑定报错位置的修补；`import defer` / `import source` 来自 7.3.0，`using` 来自 7.2.0。
- 未安装依赖、未跑 vitest / test262 / production-test，状态保持 `UNVERIFIED`。

## 学到什么

1. **“自托管”不等于“没有外部合同”**——正则对错仍可能外包给引擎。
2. **废弃别名还在导出，不等于还是主入口**。
3. **提案开关要读 bitset，不能读营销句**。
4. **commonjs 是解析上下文，不是 AST 枚举值**。

## 应用型自测

1. `parseModule` 在 7.3.2 还是不是推荐入口？
2. `next: true` 会不会打开任意一个未列出的 stage 3 提案？
3. `sourceType: "commonjs"` 的 `Program.sourceType` 是什么？

检查点：

1. 不是。函数还在，但标了 deprecated，应改用 `parse(..., { sourceType: "module" })`。
2. 不会。只有装饰器、`import defer` 和 `import source`。
3. `"script"`。commonjs 只改上下文掩码。

## 延伸阅读

- 固定源码：[meriyah/meriyah](https://github.com/meriyah/meriyah) —— 本文绑定 `3e586e4c957a438bf872a9d09aab334a3cea3f8d`
- 审查记录：仓库内 `docs/js-parser-source-review-20260827-fw.md`
- [[acorn]] —— 同年份对照：年份旋钮、插件类、无内建 JSX
- [[oxc]] —— Rust 侧 parser，不走这份 TS 词法

## 关联

- [[acorn]] —— 同一份 ESTree，入口和提案边界不同
- [[oxc]] —— 另一条 JS/TS 解析栈
- [[swc]] —— 编译器里的 parser，不是独立 ESTree 库
- [[vite]] —— 下游打包器，不在本页审查范围

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
