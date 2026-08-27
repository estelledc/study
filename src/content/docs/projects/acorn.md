---
title: acorn — 按 ecmaVersion 开关长出来的 ESTree 递归下降解析器
description: 只实现 stage 4，用 Parser.extend 接插件，commonjs 顶层按函数作用域处理
来源: https://github.com/acornjs/acorn
日期: 2026-08-27
分类: JavaScript 解析器
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/acornjs/acorn
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d788421b242ddccb28040f1431438ee5cf474208
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.18.0
---

## 是什么

acorn 是一个用 JavaScript 写成的 ECMAScript 解析器。日常类比：它不像编译器那样“先猜你想写哪种方言”，而像一台必须先拨年份旋钮的读稿机——旋钮是 `ecmaVersion`，稿纸上的字被拆成 token，再按递归下降拼成 [ESTree](https://github.com/estree/estree) 树。

```js
import { parse } from "acorn"

const ast = parse("const n = 1 + 1", { ecmaVersion: 2022, sourceType: "module" })
```

固定 `8.18.0` 的发布物是双入口：`dist/acorn.mjs` 与 `dist/acorn.js`。同一次提交里还有 `acorn-walk@8.3.5` 和 `acorn-loose@8.5.2`，版本号并不跟主包对齐。

## 为什么重要

不按固定源码读 acorn，下面这些印象会对不上：

- 为什么不传 `ecmaVersion` 现在还能跑，却会在控制台警告，并且文档说以后会停
- 为什么 `sourceType: "commonjs"` 允许顶层 `return`，AST 上的 `Program.sourceType` 却仍是 `"script"`
- 为什么“acorn 能直接吃 JSX / 装饰器”是错的——核心只做 stage 4，其余走 `Parser.extend`
- 为什么打包器和 lint 工具能把 tokenizer 单独抽出来用

## 核心要点

固定 8.18.0 的主链可以拆成五步：

1. **先归一选项**：`getOptions()` 把 `"latest"` 写成内部 `1e8`，把 `2015+` 年份减去 `2009`。`ecmaVersion` 为 `null` 时警告并落到 `11`（2020）。未显式传 `allowHashBang` 时，`ecmaVersion >= 14` 才默认开 `#!`。

2. **词法与句法是同一台机器**：`parse` 构造 `Parser`，`nextToken()` 后走 `parseTopLevel`。`tokenizer()` 只是把同一实例交出去，让调用方自己 `getToken()`。

3. **作用域用 flag 堆栈**：`commonjs` 顶层进 `SCOPE_FUNCTION`，所以 `return` / `new.target` 按函数体处理；`module` 开 `inModule` 并默认严格模式。`using` / `await using` 要 `ecmaVersion >= 17`，且不能直接出现在 `switch` 作用域。

4. **错误几乎都不可恢复**：`raise` 抛带 `pos` / `loc` / `raisedAt` 的 `SyntaxError`。`raiseRecoverable` 在 `location.js` 里就是 `raise` 的别名。过深递归被 `catchStackOverflow` 改写成 `Not enough stack space to parse input`。

5. **插件换的是类，不是全局开关**：`Parser.extend(...plugins)` 从左到右包装构造函数。JSX、TypeScript、未完成提案都不在本包。

## 实践示例

### 案例 1：必须先拨年份，再选稿纸类型

```js
import { parse } from "acorn"

parse("import.meta.url", { ecmaVersion: 2022, sourceType: "module" })
parse("return 1", { ecmaVersion: 2022, sourceType: "commonjs" })
```

第二条能过，是因为 commonjs 顶层被当成函数作用域，不是因为开了 `allowReturnOutsideFunction`。树顶上的 `sourceType` 字段仍是 `"script"`。`8.17.0` 新增的 `strict: true` 则是在 script 里强制严格模式，和 module 不是一回事。

### 案例 2：只解析一段表达式，并告诉它从哪一行开始

```js
import { parseExpressionAt } from "acorn"

const expr = parseExpressionAt("prefix + 1", 7, {
  ecmaVersion: 2022,
  locations: true,
  startLocation: { line: 10, column: 4 },
})
```

`startLocation` 是 8.18.0 加上的。它改的是起始行列记账，不是输入切片；`pos` 仍然是字符串下标。`locations` 关掉时，parser 甚至不会为了 `parseExpressionAt` 去数前面有几行。

### 案例 3：插件是换 Parser 类

```js
import { Parser } from "acorn"
// JSX 在 acorn-jsx，不在本包
const JSXParser = Parser.extend(jsxPlugin)
JSXParser.parse("<div />", { ecmaVersion: 2022 })
```

核心 README 写明：只有 finalized 的 stage 4 会进主包。把“能 parse JSX”写成 acorn 内建能力，是把插件生态误认成核心合同。

## 踩过的坑

1. **省略 `ecmaVersion`**：现在会警告并按 2020 解析；文档把它标成即将失效的兼容路径。
2. **看见 `raiseRecoverable` 以为错误会留下来继续 parse**：实现里它和 `raise` 是同一个函数。
3. **把 `Program.sourceType === "commonjs"` 当成会写进 AST 的值**：源码在收尾时把 commonjs 改回 `"script"`。
4. **在 `onToken` / `onComment` 回调里再调 parser**：注释写明会弄脏内部状态。
5. **用主包版本去对 walk / loose**：同一次 `8.18.0` 标签里，那两个包分别是 `8.3.5` 和 `8.5.2`。

## 适用 vs 不适用场景

**适用**：

- 只要一份 ESTree，并且能接受“先声明语言年份”
- 需要 `tokenizer` 或 `parseExpressionAt` 这种可嵌入接口
- 用 `Parser.extend` 接 JSX / TypeScript 等外部方言

**不适用**：

- 想在本包里直接打开 JSX、装饰器或 TypeScript：那些不是 8.18.0 核心
- 需要一份“坏了也能吐树”的容错解析：看同仓的 `acorn-loose`
- 把未绑定的速度排名写成事实：本文没有跑 benchmark

## 固定版本边界

- 本文绑定 `acornjs/acorn@d788421b242ddccb28040f1431438ee5cf474208`。annotated tag `8.18.0` 与 npm `acorn@8.18.0` 的 `gitHead` 同指此提交。
- 8.18.0 新增 `startLocation`；`using` 来自 8.15.0；`sourceType: "commonjs"` 与 Unicode 17 来自 8.16.0。
- Node 声明是 `>=0.4.0`。未安装依赖、未跑 `test/run.js` 或 test262，状态保持 `UNVERIFIED`。

## 学到什么

1. **年份旋钮是解析合同的一部分**——同一段源码在不同 `ecmaVersion` 下不是同一门语言。
2. **commonjs 改的是作用域，不是 AST 上的 sourceType 字符串**。
3. **插件换类，不改默认 Parser**——核心保持 stage 4。
4. **同仓不等于同版本号**——walk / loose 要各自钉。

## 应用型自测

1. `parse("1", {})` 在 8.18.0 会怎样？树按哪一年的语法长？
2. `sourceType: "commonjs"` 的 `Program.sourceType` 是什么字符串？
3. 不装插件，`parse("<x/>", { ecmaVersion: 2022 })` 会得到 JSX 节点吗？

检查点：

1. 会警告，并按内部 `11`（2020）解析。
2. `"script"`。commonjs 只改顶层作用域形态。
3. 不会。JSX 要 `Parser.extend`。

## 延伸阅读

- 固定源码：[acornjs/acorn](https://github.com/acornjs/acorn) —— 本文绑定 `d788421b242ddccb28040f1431438ee5cf474208`
- 审查记录：仓库内 `docs/js-parser-source-review-20260827-fw.md`
- [[meriyah]] —— 另一条自托管 ESTree 解析器，JSX 与部分提案在选项里
- [[oxc]] —— Rust 侧的另一份 JS/TS parser

## 关联

- [[meriyah]] —— 默认 script、内建 JSX、`next` 只开三项提案
- [[oxc]] —— arena AST，不是这份 JS 递归下降
- [[swc]] —— Rust 编译器，解析只是其中一段
- [[esbuild]] —— Go bundler，自带 parser，不走 ESTree 插件模型
- [[webpack]] —— 打包管线里常见的 ESTree 消费者之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
