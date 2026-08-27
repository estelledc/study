---
title: oxc-transform — Node 侧把 TS/JSX 重新打印成目标语法
description: 介绍 oxc-transform 0.147.0 如何按 parse → 声明 → transform → inject/define → codegen 重写 TypeScript。
来源: https://github.com/oxc-project/oxc
日期: 2026-08-27
分类: 编译器 / 工具链
难度: 中级
difficulty: intermediate
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

`oxc-transform` 是 [[oxc]] 仓库里面向 Node 的转译包。日常类比：不是在原稿上涂改，而是把句子拆成语法树、改完再重新排版打印。打印出来的字可能不在原来的列上，所以需要的话得另要 SourceMap。

你写：

```js
import { transformSync } from "oxc-transform";

const { code, declaration, errors } = transformSync(
  "test.ts",
  "class A<T> {}",
  { typescript: { declaration: true } },
);
// code === "class A {}\n"
// declaration === "declare class A<T> {}\n"
```

固定 0.147.0 的 npm 包名是 `oxc-transform`，源码在 `napi/transform`。它和 [[oxc]] 页共享 `crates_v0.147.0`，但用户合同是 Node API，不是 Rust `Compiler` facade，也不是 [[oxlint]]。

## 为什么重要

不理解这条重打印管线，就解释不了下面几件事：

- 为什么 `const x: number = 0` 会变成 `const x = 0`，而不是留下等长空格
- 为什么不传 `jsx` 时，默认并不是“原样保留 JSX”
- 为什么 `enum` 和 `constructor(public name)` 在这里能变成运行时代码，在 [[ts-blank-space]] 里却必须改写源码
- 为什么 `transform()` 不一定比 `transformSync()` 快

## 核心要点

固定版本的主链按文档顺序走：

1. **按文件名和选项决定语言**：`lang` 可选 `js` / `jsx` / `ts` / `tsx` / `dts`；`sourceType` 可选 script / module / commonjs / unambiguous。解析失败时 `code` 是空字符串。

2. **可选 isolated declarations 先跑**：`typescript.declaration` 为真时，在变换之前按 isolated declarations 规则出 `.d.ts`。也可以单独调用 `isolatedDeclarationSync`。

3. **变换按插件顺序执行**：TypeScript 注解删除 / enum / namespace → decorator → 第三方 plugin → JSX → `target` 降级。缺省 `target` 是 `esnext`，不做降级。

4. **inject / define 在变换之后**：inject 先插入全局绑定，define 再替换标识符；最后 codegen。`sourcemap` 默认 false。

5. **原生绑定优先**：`index.js` 按平台加载 `@oxc-transform/binding-*`，失败才走 WASI。`transform` / `isolatedDeclaration` 会另开线程，注释写明这可能比 Sync 更慢。

## 实践示例

### 案例 1：默认同步擦 TypeScript，并可选出 d.ts

```js
import { transformSync } from "oxc-transform";

const { code, declaration, errors } = transformSync("app.ts", source, {
  typescript: { declaration: true },
});
```

TypeScript preset 的例子是 `const x: number = 0` → `const x = 0`。注解从 AST 上摘掉，再重新打印。`errors` 非空时，`code` 仍可能有内容，因为 parser 对常见语法错误可恢复。

### 案例 2：只要声明、不要整份变换

```js
import { isolatedDeclarationSync } from "oxc-transform";

const { code, errors } = isolatedDeclarationSync("app.ts", "export class A {}");
```

这条路径自己 parse → `IsolatedDeclarations::build` → codegen，并默认打开 JSDoc 注释。它不跑 JSX / target / inject。源文件必须满足 isolated declarations 的显式类型要求。

### 案例 3：默认 JSX 不是 preserve

```js
import { transformSync } from "oxc-transform";

transformSync("app.tsx", source);                 // jsx 默认 enable，automatic runtime
transformSync("app.tsx", source, { jsx: "preserve" });
```

NAPI 把缺省 `jsx` 转成 `JsxOptions::enable()`。只有显式 `'preserve'` 才禁用变换。`target: "es2015"` 才会走降级；最低目标是 `es2015`。

## 踩过的坑

1. **把 `oxc-transform` 写成 [[oxc]] 页的别名**：本页绑定的是 Node 包和 `napi/transform`。Rust `Compiler::compile`、linter CLI 分别在 [[oxc]] / [[oxlint]]。

2. **以为默认只擦类型、不碰 JSX**：省略 `jsx` 会启用 automatic runtime，可能插入 React JSX import。

3. **把 `transform()` 当更快的并行入口**：文档写明异步版本要付线程开销，常常慢于 Sync。

4. **把可恢复 diagnostics 当成失败**：`errors` 有值时 `code` 不一定空。真正编译器配置失败才会直接返回空 `code`。

5. **`moduleRunnerTransform` 不是通用 API**：类型声明标了 `@deprecated Only works for Vite`。本页不把它当稳定合同。

## 适用 vs 不适用场景

**适用**：

- 要在 Node 里做 TS 擦除，并且还能处理 enum、命名空间、参数属性
- 同一调用里要 JSX、target 降级、inject/define，或顺带 isolated `.d.ts`
- 能接受输出行列变化，并在需要时打开 `sourcemap`

**不适用**：

- 必须保住原文行列、不要 SourceMap——应看 [[ts-blank-space]]
- 把本包当成 `tsc --noEmit`：它不跑类型检查
- Node 低于 `^20.19.0 || >=22.12.0`，或不能加载原生 / WASI 绑定
- 只想评测 linter 或整个 compiler facade：应读 [[oxlint]] / [[oxc]]

## 固定版本边界

- 本文绑定 `oxc-project/oxc@4e258430cdb290598d9f2aeb2d13be598ec9e8e9`，tag `crates_v0.147.0`，npm `oxc-transform@0.147.0`。
- npm 未发布 `gitHead`；版本对齐依据 Git tag 与 `napi/transform/package.json`。
- 引擎声明为 `node ^20.19.0 || >=22.12.0`。同提交的 [[oxc]] 页覆盖 parser / `Compiler`，不重复展开。
- 未安装依赖、加载原生绑定或运行 upstream 测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **重打印和涂空白是两种擦除合同**——一个改树再 codegen，一个只覆盖区间。
2. **缺省选项也是合同**——默认 JSX automatic、默认 `esnext`、默认不出 SourceMap。
3. **声明发射和变换可以拆开**——`isolatedDeclarationSync` 不经过整条 transform。
4. **monorepo 里同一 SHA 可以有多张卡片**——crate facade、Node transform、linter CLI 不能互相替代。

## 应用型自测

1. 调用 `transformSync("a.ts", source)` 且不传 `jsx`。默认会 preserve JSX 吗？
2. parser 恢复出一棵带 diagnostics 的树时，`code` 一定是 `""` 吗？
3. `constructor(public name: string) {}` 会像 [[ts-blank-space]] 那样原样留下吗？

检查点：

1. 不会。缺省 `jsx` 走 `JsxOptions::enable()`。
2. 不一定。可恢复错误仍可能打印代码。
3. 不会。TypeScript class 变换会补 `this.name = name`。

## 延伸阅读

- 官方文档：[oxc.rs transformer](https://oxc.rs/docs/guide/usage/transformer)
- 固定源码：[oxc-project/oxc](https://github.com/oxc-project/oxc) —— 本文绑定 `4e258430cdb290598d9f2aeb2d13be598ec9e8e9`
- 审查记录：仓库内 `docs/ts-strip-source-review-20260827-hd.md`
- [[ts-blank-space]] —— 保位置的对照
- [[oxc]] —— 同一 tag 的 compiler facade

## 关联

- [[ts-blank-space]] —— 官方 TS parser + 空白覆盖
- [[oxc]] —— 共享 AST / parser / Compiler 的 crate 页
- [[oxlint]] —— 同一仓库的 linter 产品页，版本线不同
- [[rolldown]] —— 消费 oxc transform 的打包器
- [[swc]] —— 另一条 Rust 转译链
- [[esbuild]] —— Go bundler 的类型擦除对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ts-blank-space]] —— ts-blank-space — 用空白覆盖类型、不重写 JavaScript
