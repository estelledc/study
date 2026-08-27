---
title: ts-jest — 把 TypeScript compiler API 接到 Jest
来源: 'https://github.com/kulshekhar/ts-jest'
日期: 2026-08-27
分类: 测试框架
难度: 中级
description: "介绍 ts-jest 29.4.12 如何在 isolatedModules 与 Language Service 两条路径上转译 TS，以及 ESM 诊断与 babel 第二段的边界。"
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/kulshekhar/ts-jest
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3f05625da10da954fdf0a10394385008275ddbb3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 29.4.12
---

## 是什么

ts-jest 是一个 **Jest transformer**：Jest 每拿到一份 `.ts` / `.tsx`（可选 JS），就把它交给 TypeScript compiler API，再把 JS 和 sourcemap 交回 Jest 去跑。日常类比：sucrase 是自己带涂改液的复印机；ts-jest 是把办公楼里那台正式的 `tsc` 主机接到考场门口——同一份试卷，可以选择「只复印」或「先批改再复印」。

```js
// jest.config.cjs
module.exports = {
  transform: {"^.+\\.tsx?$": ["ts-jest", {isolatedModules: true}]},
};
```

固定 29.4.12 的默认导出是 `createTransformer(options)` → `TsJestTransformer`。`TsJestCompiler` 的注释说以后可以换 compiler，**这一版只实例化 `TsCompiler`**。

## 为什么重要

不理解 ts-jest 的两条编译路径，下面这些事会对不上：

- 为什么有人说「ts-jest 比 babel-jest 慢但能报类型错」，有人又说「我开了 isolatedModules 就不再报跨文件错」
- 为什么 ESM 测试里同步 `process()` 不一定把诊断抛出来
- 为什么写了 `babelConfig` 之后，覆盖率插桩仍由 Jest 做，而不是 babel-jest
- 为什么 `globals["ts-jest"]` 还能用，却开始警告

它和 [[sucrase]] 对照的是同一件事：测试进程里 TS 怎么变成可执行 JS。

## 核心要点

固定源码里的主链可以拆成五步：

1. **按 Jest config 找或建 `ConfigSet`**：静态缓存。`globals["ts-jest"]` 会和 transformer 选项合并，后者优先，但会打 deprecation。

2. **决定走哪台主机**：`isolatedModules` 默认读解析后的 tsconfig；选项字段已 deprecated。`false` 建 Language Service（跨文件、能语义诊断）；`true` 走 `transpileModule` / 自研 `tsTranspileModule`（按文件，诊断少）。

3. **先 TS，后可选 Babel**：`processWithTs` 出 JS。有 `babelConfig` 才调用 `babel-jest`，并且 `instrument: false`——覆盖率仍是 Jest 的事。

4. **诊断是否抛，要看模式**：非 ESM 的 LS 路径会 `raiseDiagnostics`；`diagnostics` 默认开启，`throws` 默认 true。`useESM && supportsStaticESM` 时，LS 路径**跳过**这次 raise。`processAsync` 若结果上还挂着 `diagnostics` 会再抛；同步 `process()` 只取 `.code`。

5. **Jest hoist 是默认 AST transformer**：`resolvedTransformers.before` 先放 `hoist-jest`，再追加用户的 `astTransformers`。

`.d.ts` 输出空串。`stringifyContentPathRegex` 命中则变成 `module.exports=...` 字符串。`node_modules` 里的 JS 直接 `ts.transpileModule`，不进 Language Service。

## 实践示例

### 案例 1：默认 preset（只转 TS）

```js
const {createDefaultPreset} = require("ts-jest");

module.exports = {
  ...createDefaultPreset({tsconfig: "<rootDir>/tsconfig.json"}),
};
```

**逐部分**：preset 只给 `^.+\\.tsx?$` 挂 `ts-jest`。要连 `.js` 一起转，用 `createJsWithTsPreset`；JS 交给 babel、TS 留给 ts-jest，用 `createJsWithBabelPreset`。ESM 对应 `createDefaultEsmPreset`，会设 `extensionsToTreatAsEsm` 且 `useESM: true`。

### 案例 2：只要速度，不要跨文件检查

```js
module.exports = {
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      isolatedModules: true, // deprecated：更干净的是写进 tsconfig
      diagnostics: {pretty: true, warnOnly: false},
    }],
  },
};
```

**逐部分**：`isolatedModules: true` 会写进解析后的 compiler options 并警告。此后 `TsCompiler` 不建 Language Service，走 transpile。跨文件类型错误不会从 LS 出来；语法级诊断仍可能 `raiseDiagnostics`。

### 案例 3：TS 之后再跑 Babel

```js
module.exports = {
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {target: "es2020"},
      babelConfig: {presets: ["@babel/preset-env"]},
    }],
  },
};
```

**逐部分**：先 `getCompiledOutput`，再 `babelJest.process(..., {instrument: false})`。没有 `babelConfig` 时，`babelJestTransformer` 是 `undefined`，不会加载 babel-jest。

## 踩过的坑

1. **把「能报类型错」当成默认且永远发生**：没开 isolated 时才有 LS。ESM 模式在 `getCompiledOutput` 里跳过 `raiseDiagnostics`；同步 `process()` 不会因为返回对象上的 `diagnostics` 再抛一次。

2. **继续把配置写在 `globals["ts-jest"]`**：还能合并，但固定版本会警告。新配置应放在 `transform` 元组第二项。

3. **以为 `compiler` 已经能换成 swc/esbuild**：`TsJestCompiler` 写了「以后可以接」，29.4.12 只 `new TsCompiler`。`esbuild` 只是 optional peer，不是这条路径。

4. **拿 ts-jest 当通用 TS runner**：它实现的是 Jest `SyncTransformer`。脚本入口、REPL 不是它的合同；那是另一对工具。

## 适用 vs 不适用场景

**适用**：

- Jest 29/30 项目要跑 TS，并接受 `typescript >=4.3 <7` 作为 peer
- 需要可选的跨文件诊断（关掉 isolatedModules，走 LS）
- 需要 TS 输出之后再接 Babel preset
- Node `^14.15 || ^16.10 || ^18 || >=20`

**不适用**：

- 只要剥类型、不要 Jest、不要 `tsc`——用 [[sucrase]] 或其它转译器
- 把测试进程当完整 `tsc --build` / project references 的替代品
- 依赖「ESM + 同步 process 一定抛语义诊断」
- 想在本页得到相对 [[swc]] / babel-jest 的速度名次——未测量

## 固定版本边界

- 本文绑定 `kulshekhar/ts-jest@3f05625d...`，即 tag `v29.4.12`；npm `gitHead` 与 tag 一致，`package.json` 为 `29.4.12`。
- 包是 CommonJS。peer 里 Jest 29/30、TypeScript 4.3–6.x；Babel / esbuild 可选。
- Language Service 会按运行时模块种类改 `module` / `moduleResolution` / `customConditions`；用户 tsconfig 与 Jest CJS/ESM 模式不一致时，以 `fixupCompilerOptionsForModuleKind` 为准。
- 本文未安装依赖、未跑 Jest 或上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **Jest transformer ≠ 转译器**：ts-jest 是适配器，真正干活的是 TypeScript API
2. **isolatedModules 是主机开关，不是小优化**：它决定有没有 Language Service
3. **同步和异步入口对诊断的合同不同**：ESM + `process()` 不能按 `processAsync` 的抛错来想
4. **第二段 Babel 不负责覆盖率**：`instrument: false` 把插桩留回 Jest

## 应用型自测

1. tsconfig 没写 `isolatedModules`，transformer 选项也没写，会建 Language Service 吗？
2. `useESM: true` 且 Jest 传了 `supportsStaticESM` 时，LS 路径还会为这份文件 `raiseDiagnostics` 吗？
3. 配了 `babelConfig` 后，babel-jest 会按 Jest 的 `instrument: true` 插桩吗？

检查点：

1. 会。`isolatedModules` 默认是解析后 tsconfig 的值，缺省当 `false`，走 LS。
2. 不会走那次 raise。`getCompiledOutput` 在 `isEsmMode` 时跳过 `raiseDiagnostics`。
3. 不会。第二段强制 `instrument: false`。

## 延伸阅读

- 文档：[kulshekhar.github.io/ts-jest](https://kulshekhar.github.io/ts-jest)
- 固定源码：[kulshekhar/ts-jest](https://github.com/kulshekhar/ts-jest) —— 本文绑定提交 `3f05625da10da954fdf0a10394385008275ddbb3`
- [[sucrase]] —— 自己剥类型的 JS 转译器；可以当 Jest transform，但不是 compiler API
- [[jest]] —— ts-jest 实现的是它的 transformer 合同

## 关联

- [[sucrase]] —— 按文件 token 改写；没有 LS，也没有 Jest cache graph
- [[jest]] —— 调用 `process` / `getCacheKey` 的一方
- [[swc]] —— 另一条转译实现；本页固定版本并未接入
- [[esbuild]] —— 出现在 optional peer 与注释里，不是 29.4.12 的 compiler 实例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[sucrase]] —— sucrase — 用 token 改写把 TS/JSX 剥成现代 JS
