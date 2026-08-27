---
title: ts-node — 把 TypeScript 编译器接到 Node 的 require / ESM loader
description: 固定稳定版默认走 TypeScript 类型检查，SWC 与 --esm 是显式旁路
来源: https://github.com/TypeStrong/ts-node
日期: 2026-08-27
分类: 前端工程化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/TypeStrong/ts-node
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 057ac1beb118f9c42d21e876a17320ad73ea6be2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.9.2
---

## 是什么

ts-node 是给 Node.js 用的 TypeScript 执行环境和 REPL。日常类比：它把原厂 TypeScript 编译器请到教室里，默认边讲边批改作业；只有你明确说“先别批改”，才会换成只翻译不检查。

固定 10.9.2 的主入口是 `ts-node`，另外还有 `ts-node-transpile-only`、`ts-node-esm`、`ts-node-cwd`、`ts-node-script`。常见写法：

```bash
npx ts-node src/index.ts
npx ts-node --transpile-only src/index.ts
```

peer 依赖要求 `typescript >= 2.7`；`@swc/core` / `@swc/wasm` 是可选 peer。同仓另有 `v11.0.0-beta.1`，本文不绑定。

## 为什么重要

不看固定源码，容易把 ts-node 说成“旧版 tsx”：

- 为什么默认启动会先报 TypeScript diagnostic，而不是直接跑
- 为什么 `--swc` 不能和 `transpileOnly: false` 一起开
- 为什么 `--esm` 会先 `fork` 子进程再挂 loader
- 为什么没写 `target` 时输出按 ES5 + CommonJS 走

一句话：ts-node 的默认合同是**编译器服务**，transpile-only 和 SWC 都是显式旁路。

## 核心要点

固定版本可以把主链拆成五步：

1. **读配置并合并优先级**：环境变量 `TS_NODE_*`、`tsconfig.json` 的 `ts-node` 段、CLI 旗标依次覆盖。
2. **强制一组 compiler options**：`sourceMap=true`、`inlineSourceMap=false`、`inlineSources=true`、`declaration=false`、`noEmit=false`、`outDir=.ts-node`。未写 `target` 时默认 ES5，未写 `module` 时默认 CommonJS。
3. **决定要不要类型检查**：`transpileOnly` 或 `swc` 为真、且没有 `--type-check` 压过时，才关掉类型检查。`swc` 隐含 `transpileOnly`。
4. **按模块分类再 emit**：`compile()` 先走带检查的 `getOutput` 以便抛 diagnostic；再按 `moduleTypes` 或 Node 的 CJS/ESM 分类强制对应 emit。
5. **ESM 走独立 hook**：Node `>= 16.12.0` 导出 `resolve` + `load`；更旧版本走 `getFormat` + `transformSource`。CLI `--esm` 或配置 `esm` 会先进入子进程。

SWC 路径先解析 `@swc/core`，失败再试 `@swc/wasm`；`.tsx` / `.jsx` 用另一套 swc options。REPL 是一等入口，不是事后插件。

## 实践示例

### 案例 1：默认启动，带着类型检查

```bash
npx ts-node ./src/server.ts
```

**逐部分解释**：

1. `register()` 创建 Service，默认 `transpileOnly` 为假。
2. `require` 到 `.ts` 时走 `service.compile()`。
3. 类型错误会变成 `TSError`，文案以 `Unable to compile TypeScript` 开头。这和 tsx 的“变换成功即可运行”相反。

### 案例 2：SWC 旁路，不能再要求类型检查

```bash
npx ts-node --swc ./src/server.ts
```

`--swc` 把 transpiler 指到内置 `transpilers/swc.js`，并隐含 `transpileOnly`。源码里如果同时看到 `swc` 与 `transpileOnly: false`，直接抛错；要用类型检查必须关掉 `swc`，或显式 `--type-check` 压过配置里的 `transpileOnly`（不能压过“swc 必须 transpile-only”这条硬约束）。

### 案例 3：ESM 入口要换进程

```bash
npx ts-node --esm ./src/main.ts
```

CLI 在 phase2 / phase3 看到 `--esm` 或配置 `esm` 后，把 `shouldUseChildProcess` 设为 true，再 `callInChild`。子进程里才 `lateBindHooks(createEsmHooks(service))`。不要假设父进程已经挂好 ESM loader。

## 踩过的坑

1. **以为默认和 tsx 一样只做变换**：固定 10.9.2 默认走 TypeScript 编译器并检查类型。
2. **把 `--swc` 当成“更快但仍 type-check”**：SWC 路径是 transpile-only；和 `transpileOnly: false` 互斥。
3. **漏看强制 compiler options**：你在 `tsconfig` 写 `noEmit: true` 或 `declaration: true`，会被 `TS_NODE_COMPILER_OPTIONS` 覆盖。
4. **把 v11 beta 或下载量写成当前稳定合同**：latest stable tag 仍是 `v10.9.2`（2023-12-08）；本文未跟踪 beta 行为。

## 适用 vs 不适用场景

**适用**：

- 需要执行前看到 TypeScript diagnostic 的脚本和 REPL
- 已有 `tsconfig.json` 的 `ts-node` 段，并理解强制 options
- 明确打开 `--transpile-only` / `--swc` 来换吞吐，并接受不再类型检查

**不适用**：

- 只要“Node 直接吃 TS”、默认不要类型检查——更接近 [[tsx]] 的合同
- 要把 2023 年的稳定版写成 2026 年的现行主线，却不去核对 v11 beta
- 需要已测量的启动时间或 SWC 加速倍数

## 固定版本边界

- 本文绑定 `TypeStrong/ts-node@057ac1be...`，npm 包 `ts-node@10.9.2`。
- peer：`typescript >= 2.7`；SWC 是可选 peer，未安装时 `--swc` 会在解析 `@swc/core` / `@swc/wasm` 时失败。
- 仓库没有 `engines` 字段；Volta 只给开发环境钉了 Node 18.1.0，不是运行时保证。
- 本文只做源码静态审查，没有安装 TypeScript/SWC 或运行 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认路径决定教学口径**——ts-node 默认是编译器，tsx 默认是变换器
2. **旁路旗标会改整个证据边界**——`--swc` 不只是换后端，还取消类型检查
3. **强制 options 比用户 tsconfig 更硬**——`noEmit` / `declaration` 不能按字面理解
4. **ESM 支持在 10.9.2 仍是“子进程 + 双 API hook”**，不是无成本开关

## 应用型自测

1. 不带任何旗标运行 `ts-node app.ts`，类型错误会不会阻止执行？
2. `swc: true` 和 `transpileOnly: false` 能否同时生效？
3. `--esm` 是在当前进程挂 loader，还是先进入子进程？

检查点：

1. 会。默认 `transpileOnly` 为假，`compile()` 先走带检查的 `getOutput`。
2. 不能。固定源码对这个组合直接抛错。
3. 先进入子进程。`--esm` 或配置 `esm` 会设 `shouldUseChildProcess`。

## 延伸阅读

- 文档：[typestrong.org/ts-node](https://typestrong.org/ts-node)
- 固定源码：[TypeStrong/ts-node](https://github.com/TypeStrong/ts-node) —— 本文绑定提交 `057ac1beb118f9c42d21e876a17320ad73ea6be2`
- [[tsx]] —— 同赛道、默认只做 esbuild 变换
- [[swc]] —— ts-node 的可选 transpiler，不是默认编译器
- [[esbuild]] —— 出现在 tsx，不在本页默认路径

## 关联

- [[tsx]] —— 父进程 spawn + esbuild hook，默认不类型检查
- [[swc]] —— `--swc` 真正调用的变换器
- [[esbuild]] —— 对照另一条 runner 的后端
- [[bun]] —— 运行时内置 TS，不经过 ts-node Service
- [[vite]] —— 开发服务器 transform，不是 Node register hook

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
