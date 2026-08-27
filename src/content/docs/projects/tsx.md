---
title: tsx — 给 Node 挂上 esbuild 就能跑 TypeScript
description: 固定版本用父进程 spawn Node，再靠 CJS/ESM hook 把 TypeScript 交给 esbuild
来源: https://github.com/privatenumber/tsx
日期: 2026-08-27
分类: 前端工程化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/privatenumber/tsx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ed9d33046a135de13a35fdfce12368b79d1b1518
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.23.12
---

## 是什么

tsx 是一个给 Node.js 加 TypeScript / ESM 装载能力的 CLI。日常类比：Node 还是原厂发动机，tsx 只在旁边加一台 esbuild 同声传译，并不把 TypeScript 编译器请上车。

固定 4.23.12 的入口是 `tsx`，npm 包名同名。常见写法：

```bash
npx tsx src/server.ts
npx tsx watch src/server.ts
```

仓库根 `package.json` 仍写 `0.0.0-semantic-release`；适用版本以 Git tag / npm `tsx@4.23.12` 为准。运行时只依赖 `esbuild ~0.28.0`，引擎声明 `node >= 18`。

## 为什么重要

不看固定源码，容易把 tsx 说成“更快的 ts-node”：

- 为什么 `tsx app.ts` 不会先跑 `tsc --noEmit`
- 为什么父进程自己不执行用户脚本，而是 `spawn(process.execPath)`
- 为什么 CJS 文件里写 `import.meta.url` 有时能跑，有时又变成空 shim
- 为什么 `--no-cache` 只关磁盘缓存，并不换编译器

一句话：tsx 的产品判断是**装载期变换**，不是类型检查服务。

## 核心要点

固定版本可以把主链拆成四步：

1. **父进程只负责旗标与拉起 Node**：`cleye` 吃掉 `--no-cache` / `--tsconfig` / `watch`，其余参数原样交给子进程。
2. **子进程先挂预载再挂 loader**：固定 `--require ./preflight.cjs`；纯 REPL 再加 `--require ./patch-repl.cjs`。当前 Node 支持 `module.register` 时用 `--import loader.mjs`，否则回退 `--loader`。
3. **同一份 loader 同时补 CJS 与 ESM**：CJS 侧改 `Module._resolveFilename` 和 `Module._extensions`；ESM 侧导出 `initialize` / `resolve` / `load`。
4. **变换只走 esbuild**：CJS 默认 `format: 'cjs'` 并包一层 IIFE；ESM 默认 `format: 'esm'`。缓存键含源码、选项、esbuild 版本。

`TSX_TSCONFIG_PATH` 或 `--tsconfig` 决定读哪份配置；路径别名只对非 `node_modules` 的父模块生效。磁盘缓存默认写到 `os.tmpdir()/tsx-${uid}`，`TSX_DISABLE_CACHE=1` 改成内存 `Map`。

## 实践示例

### 案例 1：直接跑一份 TypeScript

```bash
npx tsx ./src/index.ts --port 3000
```

**逐部分解释**：

1. 父进程丢掉 tsx 自己的旗标，把 `--port 3000` 留给用户脚本。
2. 子 Node 先加载 preflight，再挂 loader。
3. `.ts` 在 CJS 扩展表或 ESM `load` hook 里被 esbuild 转成可执行 JS。类型错误不会在这一步拦住启动。

### 案例 2：关掉磁盘缓存，指定 tsconfig

```bash
npx tsx --no-cache --tsconfig ./tsconfig.runtime.json ./src/job.ts
```

`--no-cache` 只设置 `TSX_DISABLE_CACHE=1`；`--tsconfig` 写成 `TSX_TSCONFIG_PATH`。两者都不等于“换 TypeScript 编译器”。

### 案例 3：`--eval` 也先经过 esbuild

```bash
npx tsx --eval "const x: number = 1; console.log(x)"
```

父进程对这段字符串调用 `esbuild.transformSync`，`sourcefile` 固定为 `/eval.ts`，再把变换后的 JS 交给 Node 的 `--eval`。`--print` 走同一条路。

## 踩过的坑

1. **把 tsx 当成带类型检查的 runner**：固定实现没有调用 `tsc` 或 TypeScript `createProgram`。
2. **以为 CJS 的 `import.meta` 永远按源码字面量替换**：先做 `code.includes('import')`，再用 `es-module-lexer` 找 `import.meta`（`d === -2`）。固定提交补的是注释或换行把 `import` 和 `.meta` 拆开时的漏检。
3. **把磁盘缓存当成跨机器可复现产物**：缓存目录按 uid 分桶，过期策略依赖操作系统清理临时目录；Windows 不会自动清。
4. **把 README 的启动速度写成测量结论**：本文没有跑 CLI、watch 或 benchmark。

## 适用 vs 不适用场景

**适用**：

- 本地脚本、一次性 job、测试入口，需要 Node 直接吃 `.ts` / `.mts` / `.cts`
- 能接受“变换成功即可运行”，类型检查另交给 `tsc` 或 CI
- 需要 `watch` 子命令盯文件变化再拉起同一套 loader

**不适用**：

- 必须在执行前得到 TypeScript diagnostics
- 要把静态阅读写成已验证的冷启动或缓存命中率
- 目标 Node 低于 18

## 固定版本边界

- 本文绑定 `privatenumber/tsx@ed9d3304...`，npm 包 `tsx@4.23.12`。
- 引擎声明 `node >= 18.0.0`；运行时依赖只有 `esbuild ~0.28.0`。
- 源码仓版本字段是 semantic-release 占位，不以它当适用版本。
- 本文只做源码静态审查，没有安装依赖或运行 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **“能跑 TS”不等于“在做类型检查”**——装载 hook 和编译器是两条合同
2. **父进程 / 子进程分工**决定旗标、信号和 REPL 补丁落在哪一层
3. **CJS 的 `import.meta` 是 shim**，检测漏了就会留下空对象
4. **缓存键必须包含变换器版本**，否则 esbuild 小版本升级会复用旧字节

## 应用型自测

1. `tsx app.ts` 遇到类型错误会不会拒绝启动？
2. `--no-cache` 会不会改用 TypeScript compiler API？
3. CJS 文件把 `import.meta` 写成 `import /* comment */.meta` 时，固定 4.23.12 还会不会做 shim？

检查点：

1. 不会。固定路径只有 esbuild transform。
2. 不会。它只禁用 `FileCache`，变换器仍是 esbuild。
3. 会。固定提交用 lexer 补上注释/换行拆开的 `import.meta`。

## 延伸阅读

- 文档：[tsx.hirok.io](https://tsx.hirok.io)
- 固定源码：[privatenumber/tsx](https://github.com/privatenumber/tsx) —— 本文绑定提交 `ed9d33046a135de13a35fdfce12368b79d1b1518`
- [[ts-node]] —— 同赛道、默认走 TypeScript 编译器并做类型检查
- [[esbuild]] —— tsx 的运行时变换器，不是本页审查对象
- [[bun]] —— 运行时内置 TS 装载，合同完全不同

## 关联

- [[ts-node]] —— 默认 type-check 的 TypeScript runner
- [[esbuild]] —— 变换后端
- [[swc]] —— 另一条 transpile 路线，出现在 ts-node 的可选路径
- [[bun]] —— 把 runner 收进运行时
- [[vite]] —— 开发服务器会自己做 TS transform，不是 Node CLI runner

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
