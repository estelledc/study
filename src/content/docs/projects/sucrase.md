---
title: sucrase — 用 token 改写把 TS/JSX 剥成现代 JS
来源: 'https://github.com/alangpierce/sucrase'
日期: 2026-08-27
分类: 构建工具
难度: 中级
description: "介绍 sucrase 3.35.1 如何用 parser token 而不是 AST visitor 剥 TypeScript/JSX，以及 register/CLI 的 CJS 默认。"
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/alangpierce/sucrase
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 280ee202e73b18e396069782bd41e1eaaccbf620
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.35.1
---

## 是什么

sucrase 是一个用 JavaScript 写的 **TS / JSX / Flow 转译器**。日常类比：它不像 Babel 那样把整棵语法树拆开再装回去，而像在复印稿上用涂改液干掉类型注解、再把 `import` 改成 `require`——只改必须改的记号，现代 JS 语法尽量原样留下。

你写：

```js
const {transform} = require("sucrase");

const {code} = transform("const x: number = 1;", {
  transforms: ["typescript"],
});
```

固定 3.35.1 的主链是 `validateOptions` → `parse` → `TokenProcessor` → `RootTransformer`。它不做类型检查，每个文件独立处理。

## 为什么重要

不理解 sucrase 的 token 管线，下面这些事会对不上：

- 为什么 Jest / 老 React 脚手架能用它当「快的 babel-jest」，却仍要另开 `tsc --noEmit`
- 为什么 `node -r sucrase/register` 跑 `.ts` 时，输出默认是 CommonJS
- 为什么 README 写 JSX 变成 `React.createClass`，源码实际默认却是 `React.createElement`
- 为什么 `const enum` 在 sucrase 里不会像 `tsc` 那样跨文件内联

它和 [[ts-jest]] 构成一对对照：sucrase 自己剥类型；ts-jest 把 TypeScript compiler API 接到 Jest。

## 核心要点

固定源码里的执行可以拆成四步：

1. **选项是一份必须列全的 transform 名单**：`transforms` 只能是 `jsx` / `typescript` / `flow` / `imports` / `react-hot-loader` / `jest`。`ts-interface-checker` 做 `strictCheck`，多字段或缺名单会直接抛。

2. **parser 给 token 打 `isType`，transformer 按 token 改写**：`RootTransformer.processPossibleTypeRange()` 连续删类型 token；`public` / `readonly` / 非空断言也是删。不是「走完整 AST visitor」。

3. **模块形态由有没有 `imports` 决定**：有 `imports` 就走 `CJSImportTransformer`（并在文件头加 `"use strict";`）；没有也仍挂 `ESMImportTransformer`，只为了裁 type-only import。`keepUnusedImports` 关掉自动 elision。

4. **ES 语法降级是默认值，不是可选项的反面**：optional chaining、`??`、数字分隔符、optional catch 默认会做；要留给现代运行时，必须显式 `disableESTransforms: true`。

`enum` / `const enum` 都在**当前文件**改成 IIFE。跨文件 const enum 内联不存在，所以 README 才建议 TS 开 `isolatedModules`。

## 实践示例

### 案例 1：只剥类型，保留 ESM

```js
const {transform} = require("sucrase");

const {code} = transform(
  'import type {User} from "./user";\nexport const n: number = 1;',
  {transforms: ["typescript"], filePath: "src/n.ts"},
);
```

**逐部分**：没有 `imports`，不会变成 `require`。type-only import 默认被 elide；值 import 若只出现在类型位置，也会被裁掉，除非 `keepUnusedImports: true`。

### 案例 2：require hook 跑 TS

```bash
node -r sucrase/register src/main.ts
# 或
npx sucrase-node src/main.ts
```

**逐部分**：`registerTS` 固定 `transforms: ["imports", "typescript"]`。`sucrase-node` 只 `require("../register")` 再 `Module.runMain()`，不转发 `--inspect` 这类 Node 参数。要用自己的选项，走 `SUCRASE_OPTIONS`（必须是 JSON 对象）或编程调用 `addHook`。

### 案例 3：CLI 按目录或按 tsconfig

```bash
npx sucrase src -d dist -t typescript,imports
npx sucrase --project .
```

**逐部分**：第一种必须同时给 out dir、transforms、源目录。`--project` 禁止再传这三项；它 `JSON.parse` 读 `tsconfig.json`（**不能有注释**），只看 `files` / `include`，源码写了 `TODO: read exclude`。`compilerOptions.module === "commonjs"` 才自动加 `imports`。

## 踩过的坑

1. **把 README 的 JSX 默认写成 `React.createClass`**：`getJSXPragmaInfo` 默认是 `React.createElement` / `React.Fragment`；`jsxRuntime` 未设即 classic。automatic 要显式写。

2. **以为 register 会输出 ESM**：`.ts` / `.tsx` hook 都带 `imports`，默认打成 CJS。要 ESM 得自己 `addHook` 并拿掉 `imports`。

3. **`--project` 当完整 `tsc`**：不解析 `extends`、不吃 JSONC、不读 `exclude`。`esModuleInterop !== true` 时还会打开 legacy TS interop。

4. **把 sucrase 当类型检查器**：`const x: number = "nope"` 会原样变成赋值。CI 仍要 `tsc --noEmit`。`const enum` 也不会跨文件折叠。

## 适用 vs 不适用场景

**适用**：

- 开发期、Jest、脚本：目标运行时已经是现代 Node / 现代浏览器
- 只要剥 TS/JSX/Flow，不要 Babel plugin 生态
- 需要 `jest` transform 把顶层 `jest.mock` / `unmock` / `enableAutomock` / `disableAutomock` 提升
- 满足 `node >=16 || 14 >=14.17`（3.35.x 起 CLI 不再承诺更老的 Node）

**不适用**：

- 要类型检查、项目引用、跨文件 const enum——那是 `tsc` / [[ts-jest]] 的 Language Service 路径
- 要降到 IE 或任意 Babel plugin
- 要把 tsconfig 当完整工程图（注释、`extends`、`exclude`）
- 要测「比 [[swc]] / [[esbuild]] 快多少」——README 有 2022 单线程数字，本文未复测

## 固定版本边界

- 本文绑定 `alangpierce/sucrase@280ee202...`，`package.json` / `getVersion()` 均为 `3.35.1`。
- npm `sucrase@3.35.1` 的 `gitHead` 是父提交 `fa5b7abf...`，该提交仍自报 `3.35.0`（tinyglobby 替换）；仓库没有 `v3.35.1` tag。绑定自报版本一致的 bump 提交，并披露这层错位。
- 运行时依赖含 `tinyglobby`、`pirates`、`commander@4`、`ts-interface-checker`。
- 本文未安装依赖、未跑 CLI/hook/测试或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **「快」可以来自少做**：不建完整 AST、不检查类型、不降老 JS，速度来自范围而不是魔法
2. **transform 名单就是模块合同**：有没有 `imports` 决定 CJS 还是 ESM，不能靠文件扩展名猜
3. **文档默认值要以源码为准**：README 的 `createClass` 与 `getJSXPragmaInfo` 不一致
4. **CLI 读 tsconfig 往往只借名单**：`JSON.parse` + `files`/`include` 不是 `tsc` 工程

## 应用型自测

1. `transform("export const x: number = 1", {transforms: ["typescript"]})` 会把文件变成 `require`/`exports` 吗？
2. `node -r sucrase/register app.ts` 默认会保留 `import` 语句吗？
3. `sucrase --project .` 时，`tsconfig.json` 里的 `// 注释` 和 `exclude` 会被遵守吗？

检查点：

1. 不会。没有 `imports` 时只剥类型，模块语法留下。
2. 不会保留。`registerTS` 固定带 `imports`，默认打成 CJS。
3. 都不会。`JSON.parse` 遇注释即失败；`exclude` 在固定源码里仍是 TODO。

## 延伸阅读

- 官方 README：[github.com/alangpierce/sucrase](https://github.com/alangpierce/sucrase)
- 固定源码：[alangpierce/sucrase](https://github.com/alangpierce/sucrase) —— 本文绑定提交 `280ee202e73b18e396069782bd41e1eaaccbf620`
- [[ts-jest]] —— Jest 里用 TypeScript compiler API；可类型检查，路径完全不同
- [[swc]] / [[esbuild]] —— 另一条原生转译线，不在本页复测

## 关联

- [[ts-jest]] —— Jest transformer；sucrase 是转译器，ts-jest 是 compiler 适配器
- [[jest]] —— sucrase 的 `jest` transform 只覆盖 hoist 的一小段合同
- [[swc]] —— Rust 转译器；本页不绑定其 wasm 包
- [[esbuild]] —— Go bundler/transpiler，范围比 sucrase 大

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ts-jest]] —— ts-jest — 把 TypeScript compiler API 接到 Jest
