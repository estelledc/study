---
title: pkgroll — 按 package.json 出货单回找 src 的零配置库打包器
description: 把 dist 路径映射回 src，用当前 Node 当默认 target 打出 ESM / CJS / d.ts
来源: https://github.com/privatenumber/pkgroll
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/privatenumber/pkgroll
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 959847d0328d4683a3f259b7e1b4a494c98be120
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.27.1
---

## 是什么

pkgroll 是 Hiroki Osame 做的 Node 库打包器。日常类比：它像按**出货单回仓库找货**的工人——`package.json` 里写的 `./dist/index.mjs` 是出货单，它把 `dist` 换成 `src`，再按扩展名表找回 `src/index.ts`。

固定 `v2.27.1` 的口号是 “automatically builds your package from entry-points defined in `package.json`”。仓内 `package.json#version` 仍是 `0.0.0-semantic-release`；npm 发布号 `2.27.1` 才是对外身份。

```bash
npm i -D pkgroll
npx pkgroll
```

Node 引擎声明为 `>=18`。默认源码目录 `./src`、产物目录 `./dist`。也认 pnpm 的 `package.yaml`。

## 为什么重要

不理解 pkgroll 的“输出路径倒推入口”，就解释不了下面几件事：

- 为什么几乎不用写配置文件，却必须先把 `main` / `exports` / `bin` 写成最终 dist 路径
- 为什么默认 target 会跟着**当前运行 pkgroll 的 Node 版本**走
- 为什么 ESM 里的 top-level await 不会把另一条 CJS 构建一起弄垮
- 为什么 `devDependencies` 会被打进包，而 `dependencies` 不会

## 核心要点

1. **入口是 package.json，不是 `src/**/*.ts` 扫描**：`getPkgEntryPoints` 读 `main`、`module`、`types`、`bin`、`exports`、`imports`。`module` 一律当 ESM；`types` 条件一律当声明。缺省 `type` 按 CommonJS。`publishConfig` 会覆盖这五个字段。`--input` 才是“我没法写 package.json 入口”的逃逸口。

2. **dist → src 映射有固定扩展名表**：`./dist/index.mjs` 会在 `src/index` 上依次试 `.mjs` / `.js` / `.cjs` / `.mts` / `.cts` / `.ts` / `.tsx`。产物必须落在某个 `--srcdist` 对的 dist 里，否则警告 “Ignoring file outside of dist directories”。没有合法入口就直接退出。

3. **每种 format-extension 各开一份 Rollup**：`getRollupConfigs` 按 `esm-.mjs`、`commonjs-.cjs` 拆构建，再单独挂 dts。注释写明：否则一个带 top-level await 的 ESM 入口会在过滤无用输出之前，把同图的 CJS 渲染一起弄失败。`--target` 默认 `node${process.versions.node}`，再追加 tsconfig 的 `target`。

4. **依赖按 package.json 分三类**：`dependencies` / `peerDependencies` / `optionalDependencies` 外置（`@types/foo` 也会让 `foo` 外置）。只写在 `devDependencies` 里的包，能解析就打进去，解析失败就抛错。未列入的依赖警告后打包。`--clean-dist` 默认关，因为多构建互不知道对方写了什么。

## 实践示例

### 案例 1：先写出口，再让它回找入口

```json
{
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "exports": {
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  },
  "scripts": { "build": "pkgroll" }
}
```

`src/index.ts` 会被两份 JS 构建分别吃掉。`module` 字段即使扩展名含糊，格式也是 ESM。没写 `exports` 只写 `main: ./dist/index.js` 时，格式跟着 `type`，缺省 CommonJS。

### 案例 2：bin 的 hashbang 只认入口文件

```ts
#!/usr/bin/env bun
console.log("cli")
```

`package.json#bin` 指向 `./dist/cli.js` 时，`patch-binary` 会读**入口源文件**第一行 shebang，再 `chmod 0755`。被 import 的模块里的 `#!` 会被剥掉。源文件没写 shebang 时回落到 `#!/usr/bin/env node`。

### 案例 3：watch 必须重启才能看见新入口

```bash
npx pkgroll --watch --clean-dist
```

Rollup 自带 watcher 不会重算入口。固定实现用 `fs.watch(package.json)`，100ms 后关掉旧 watcher 再 `generateRollupConfigs()`。`--clean-dist` 在打包前 `rm -rf` 整个 dist，默认是关的。

## 踩过的坑

1. **把仓内 `0.0.0-semantic-release` 当成发布号**：对外版本以 npm / tag `2.27.1` 为准。
2. **以为默认会扫 `src/` 所有文件**：只打包 package.json（或 `--input`）点名的出口。
3. **把帮助里的 target 理解成固定 `es2017`**：没传 `--target` 时是当前 Node，再加上 tsconfig。
4. **指望默认会清空 dist**：`--clean-dist` 默认 `false`。
5. **把 `devDependencies` 当外置**：能解析就会打进产物。

## 适用 vs 不适用场景

**适用**：

- 已经按 Node 的 `exports` / `bin` 写好出货路径，想零配置打 ESM + CJS + `.d.ts`
- 接受 Node `>=18`，以及“默认 target = 此刻这台机器的 Node”
- 对照 [[bunchee]]：一边倒推 dist，一边正配 src 文件名

**不适用**：

- 需要本页保证的打包速度或体积——未跑 benchmark
- 入口不在 `src`↔`dist` 对里，又不想用 `--srcdist` / `--input`
- 必须把 `dependencies` 打进包，或把 `devDependencies` 一律外置
- 团队不能接受“换一台 Node 再打，syntax 级别可能变”

## 固定版本边界

- 本文绑定 `privatenumber/pkgroll@959847d0...`，lightweight tag `v2.27.1` 与 npm `gitHead` 同指此提交。
- 仓内 version 字段是 `0.0.0-semantic-release`；许可证 MIT；Node `>=18`。
- 未安装依赖、运行测试或真实打包，状态保持 `UNVERIFIED`。

## 学到什么

1. **零配置经常意味着“复用另一份已经存在的合同”**——这里复用的是 package.json 出口
2. **倒推入口让发布字段和构建字段共用一份真相**，也把写错 dist 路径的成本前移
3. **按格式拆 Rollup 图，是为了正确性，不是为了好看**
4. **默认 target 绑当前 Node，是可复现构建的隐性输入**

## 应用型自测

1. 只运行 `npx pkgroll`、不传 `--target`，默认 target 从哪来？
2. `package.json#module` 的输出格式一定跟扩展名走吗？
3. `--clean-dist` 默认会清空 dist 吗？

检查点：

1. `node${process.versions.node}`，再加上 tsconfig 的 `compilerOptions.target`。
2. 不一定。`module` 字段被写死为 ESM。
3. 不会。flag 默认 `false`。

## 延伸阅读

- 固定源码：[privatenumber/pkgroll](https://github.com/privatenumber/pkgroll) —— 本文绑定 `959847d0328d4683a3f259b7e1b4a494c98be120`
- 审查记录：仓库内 `docs/lib-bundler-source-review-20260827-hb.md`
- [[bunchee]] —— 同主题：从 src 文件名正配 exports
- [[rolldown]] —— 应用 / 库打包的另一条 Rust 链

## 关联

- [[bunchee]] —— 另一份 package.json 驱动的库打包合同
- [[rolldown]] —— Rollup 协议的 Rust 实现对照
- [[oxc]] —— 另一条 TS/JS 变换底座
- [[swc]] —— bunchee 固定实现里的变换器对照
