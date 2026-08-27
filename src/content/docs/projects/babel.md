---
title: Babel — 插件走过 AST 的 JS 编译器
description: 8.0 起 transform/parse 必须回调或改用 *Sync；默认扩展名不含 .ts
来源: https://github.com/babel/babel
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/babel/babel
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8ed5db1bc5bed6c0b640cc06bae447acf6395c02
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.4
---

## 是什么

Babel 是一个用插件访问者改写 JavaScript AST 的**编译器**。日常类比：它不像 Recast 那样把原文贴回去，更像流水线——先按配置找插件，再让访问者走完整棵树，最后重新生成代码。

固定 monorepo tag 是 `v8.0.4`。该提交上 `@babel/core` 为 `8.0.1`，`@babel/parser` 与 `@babel/cli` 为 `8.0.4`，`@babel/preset-env` 为 `8.0.2`。常见入口：

```js
import { transformSync } from "@babel/core";
const { code } = transformSync("const x = 1;", {
  presets: ["@babel/preset-env"],
});
```

```bash
npx babel src --out-dir lib
```

CLI 二进制在 `@babel/cli` 的 `bin/babel.js`。有 `--out-dir` 走目录命令，否则走文件/stdin 命令。

## 为什么重要

不看固定 8.x 入口，容易继续用 Babel 7 的口播：

- 为什么 `transform(code)` 不再同步返回结果
- 为什么默认编译扩展名没有 `.ts`
- 为什么 `babel.config.ts` 能当根配置，`.babelrc.ts` 却不在相对查找名单里
- 为什么 GitHub 的 `latest` release 指针仍可能停在 7.x

一句话：`v8.0.4` 的合同是 **loadConfig → 多 pass visitor → generate**，并且回调式 `transform` / `parse` 不再是可选糖。

## 核心要点

固定版本可以把主链拆成五步：

1. **加载配置**：`transform*` 先 `loadConfig(opts)`。根文件名是 `babel.config.js` / `.cjs` / `.mjs` / `.json` / `.cts` / `.ts` / `.mts`。相对文件是 `.babelrc`、`.babelrc.js` / `.cjs` / `.mjs` / `.json` / `.cts`，外加 `.babelignore`。`--env-name` 默认 `BABEL_ENV` → `NODE_ENV` → `"development"`。
2. **规范化文件**：`run()` 调用 `normalizeFile` + `normalizeOptions`，得到带 `ast` / `opts` / `scope` 的 `File`。
3. **按 pass 跑插件**：每个 pass 先跑 `plugin.pre`，再 `traverse.visitors.merge` 成一次遍历，最后 `plugin.post`。每个 pass 还会挂上内部 `block-hoist` 插件。同步调用里出现 async plugin 会报错。
4. **生成代码**：`opts.code !== false` 才调用 `@babel/generator`。默认 `opts.ast` 不是 `true` 时返回的 `ast` 为 `null`。
5. **CLI 出口**：`parseArgv` 失败则 `exitCode = 2`；命令失败 `exitCode = 1`。目录默认扩展名来自 `DEFAULT_EXTENSIONS`：`.js` `.jsx` `.es6` `.es` `.mjs` `.cjs`。要编 `.ts` 必须 `-x` 显式加。

Babel 8 的函数形状变了：`transform` / `parse` / `transformFromAst` 没有 callback 就抛 `Starting from Babel 8.0.0, the 'transform' function expects a callback.` 同步请用 `transformSync` / `parseSync`。

`@babel/parser` 的 `sourceType: "unambiguous"` 会先当 module 解析；若既能当 script 又能当 module 且 AST 不同（例如顶层 `await` 换行），再试 script。

`engines.node` 为 `^22.18.0 || >=24.11.0`。

## 实践示例

### 案例 1：同步变换

```js
import { transformSync } from "@babel/core";
const result = transformSync("n => n + 1", {
  presets: ["@babel/preset-env"],
  filename: "in.mjs",
});
console.log(result.code);
```

**逐部分解释**：

1. `transformSync` 走 gensync 的同步入口，不会要求 callback
2. `filename` 影响配置匹配和报错前缀
3. 没有插件/preset 时，输出仍是重新生成的代码，不是原文贴回

### 案例 2：只解析

```js
import { parseSync } from "@babel/core";
const ast = parseSync("import x from 'y'", { sourceType: "module" });
```

`parse*` 同样先 `loadConfig`，再把 passes 交给 parser。它不会跑 transform visitor。

### 案例 3：CLI 目录输出

```bash
npx babel src --out-dir lib --extensions '.js,.ts' --source-maps
```

不加 `-x` 时目录模式会跳过 `.ts`。`--out-dir` 与 `--out-file` 是两条命令，不是同一函数的两个开关。

## 踩过的坑

1. **继续写 `babel.transform(code)` 当同步 API**：8.0 没有 callback 就抛；要同步用 `transformSync`。
2. **以为 `.ts` 默认会被编译**：`DEFAULT_EXTENSIONS` 不含 `.ts` / `.tsx`。
3. **把 `.babelrc.ts` 当成和 `babel.config.ts` 对等**：相对查找名单没有 `.babelrc.ts` / `.babelrc.mts`。
4. **用 GitHub `latest` release 当 Babel 8 pin**：`latest` 指针在 2026-08-07 仍指向较晚发布的 `v7.29.8`；npm `@babel/*` 的 8.x 包也没有 `gitHead`。本文以可达 tag `v8.0.4` 为准，不把 7.x latest 说成 8.x。

## 适用 vs 不适用场景

**适用**：
- 需要插件生态做语法降级、JSX、proposal 变换
- 已能提供 `babel.config.*` 或显式 `presets` / `plugins`
- Node `^22.18.0 || >=24.11.0`

**不适用**：
- 只要改几个节点并保留原文 → 看 [[recast]]
- 只要最快整文件变换、可接受更小插件面 → 看 [[swc]] / [[esbuild]]
- 没核过目标浏览器清单就引用「preset-env 一定最小」→ 本文未跑 compat-data，不能给体积结论

## 固定版本边界

- 本文绑定 `babel/babel@8ed5db1bc...`，GitHub annotated tag `v8.0.4` 剥开后指向该提交。
- 该树上 `@babel/core@8.0.1`、`@babel/parser@8.0.4`、`@babel/cli@8.0.4`、`@babel/preset-env@8.0.2`。npm latest 的 `@babel/core` 也是 `8.0.1`，但这些 8.x tarball 都没有 `gitHead`，未猜测 npm 打包提交。
- GitHub 的 `latest` release 名在取数时仍是 `v7.29.8`（提交 `5de11ca9...`）。7.x 与 8.x 双轨并存；本文不把 7.x 指针当成 8.x 源码。
- 本文只做源码/测试静态审查，没有安装依赖、运行上游测试或测量变换速度，状态保持 `UNVERIFIED`。

## 学到什么

1. **编译器主链是配置，不是一句 `babel src`**：找不到 config 或扩展名不匹配，行为会静默跳过或直接失败
2. **8.0 把回调/同步拆开**：旧的「不传 callback 就同步」合同已经删掉
3. **parser 和 transformer 是不同包**：`parseSync` 不跑 plugin visitor
4. **monorepo tag 与单包版本不必相同**：pin 的是 git 提交，再如实报各包 `package.json`

## 应用型自测

1. `babel.transform("1+1")` 在 8.0 会同步拿到 `{ code }` 吗？
2. `npx babel src -d lib` 默认会编译 `src/app.ts` 吗？
3. 相对配置文件名里有 `.babelrc.ts` 吗？

检查点：

1. 不会。没有 callback 会抛，应改 `transformSync` 或传入 callback。
2. 不会。默认扩展名没有 `.ts`，需要 `--extensions`。
3. 没有。根配置有 `babel.config.ts`；相对名单停在 `.babelrc.cts`。

## 延伸阅读

- 官方文档：[babel.dev](https://babel.dev)
- 仓库：[github.com/babel/babel](https://github.com/babel/babel)
- 固定源码：[babel/babel](https://github.com/babel/babel) —— 本文绑定提交 `8ed5db1bc5bed6c0b640cc06bae447acf6395c02`
- [[recast]] —— 需要保留原文时不要走 Babel generate
- [[swc]] —— Next/Rspack 常见的 Rust 替代
- [[oxc]] —— 另一套共享 AST 的 Rust 工具链

## 关联

- [[recast]] —— 可选地用 `@babel/parser`，但打印合同相反
- [[swc]] —— 以速度替换 Babel transform 的常见选择
- [[oxc]] —— parser/linter/transformer 共用一份 AST
- [[esbuild]] —— bundler 内置变换，插件模型不同
- [[webpack]] —— 常见宿主；babel-loader 仍跑在 Node
