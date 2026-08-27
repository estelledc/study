---
title: bunchee — 按 src 文件名对齐 exports 的零配置库打包器
description: 用 src 约定匹配 package.json exports，默认浏览器运行时与 ES2022
来源: https://github.com/huozhi/bunchee
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/huozhi/bunchee
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 18f93d40e96ed1fbaa1570f2d295678ff61c3036
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.1
---

## 是什么

bunchee 是 huozhi 做的 JS/TS 库打包器。日常类比：它像按**货架编号对货**的理货员——`src/lite.ts` 对应 `exports["./lite"]`，`src/react/index.ts` 对应 `"./react"`。你先把文件名和 export 名对齐，它再决定打 ESM、CJS 还是 `.d.ts`。

固定 `v7.0.1` 自称 “Zero-config bundler for JS/TS packages”，底层是 Rollup + SWC。7.0 起自己也是 ESM 包，Node 引擎 `>=22.12.0`。

```bash
npm i -D bunchee typescript
npx bunchee
```

TypeScript 7 不再带旧编译器 API；固定 README 要求再装 `@typescript/typescript6` 才能出声明。本页没有打开那个包。

## 为什么重要

不理解 bunchee 的“源文件名 = export 名”，就解释不了下面几件事：

- 为什么 `src/index.ts` 对的是 `"."`，而不是随便一个 `main` 字符串
- 为什么 CLI 帮助写 `format` 默认 esm，多入口构建却仍可能打出 CJS
- 为什么 7.0 的 `prepare` 不再默认双格式
- 为什么入口一多就换 worker，但合并构建要到 256 个入口才拆

## 核心要点

1. **多入口先解析 exports，再回 `src/` 找同名文件**：`parseExports` 吃 `exports` / `bin` / `main` / `module` / `types`。`"."` 被归一成 `./index`。`src/index.ts`、`src/lite.ts`、`src/react/index.ts` 分别对 `"."`、`"./lite"`、`"./react"`。`_*` 和测试文件不进入口。缺源文件只警告，不伪造。

2. **CLI 缺省和多入口格式不是同一套**：`assignDefault` 把 API 的 `format` 写成 `esm`、`target` 写成 `es2022`；CLI `runtime` 默认 `browser`。真正写盘时，`getOutputFormat` 看扩展名和 `package.json#type`：`.cjs` 是 CJS，`.mjs` 通常是 ESM，`.js` 跟 `type`，条件只在配置打架时破平局。

3. **类型和清理都有开关，不是口号**：`clean` 默认开，worker 路径会先清一次再扇出，避免互相删文件。`generateTypes` 要求存在 tsconfig；源码是 TS 且没有配置时，会写默认 `ES2022` / `ESNext` / `moduleResolution: bundler`。7.0 **不再读 `typings`**。`--minify` 在没显式关 sourcemap 时会打开 sourcemap。

4. **共享图是默认，worker 是内存阀门**：能合并就走 `createMergedRollupJobs`，让共用模块变成 chunk，而不是每个入口复制一份。非 watch 且入口 `>= 8` 才上 Piscina；已经合并的构建再拆 worker，门槛是 `>= 256`。`dependencies` / `peerDependencies` 外置；`--no-external` 把 `external` 收成 `null`。

## 实践示例

### 案例 1：文件名对上 export 名

```json
{
  "type": "module",
  "exports": {
    ".": { "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./lite": "./dist/lite.js"
  },
  "scripts": { "build": "bunchee" }
}
```

需要 `src/index.ts` 和 `src/lite.ts`。`require` 条件对应 CJS 产物；`./lite` 的 `.js` 在 `type: module` 下是 ESM。通配 `./features/*` 会先展开成具体 key，再去 `src/features/` 找文件。

### 案例 2：`prepare` 默认只写 ESM

```bash
npx bunchee prepare
npx bunchee prepare --cjs
```

7.0 删掉了旧的 `--prepare` **flag**，改成子命令。默认生成 ESM-only `exports`；要双格式显式传 `--cjs`。新准备的包不再写遗留 `module` 字段。

### 案例 3：特殊条件文件名

```text
src/index.ts
src/index.react-server.ts
src/index.development.ts
```

`react-server`、`edge-light`、`workerd`、`development`、`production` 等是约定后缀。同一 export 可以对应多份源文件；输出路径不能盖住默认条件的产物。

## 踩过的坑

1. **把 CLI `--format esm` 当成 package.json 多入口的唯一格式**：多入口看扩展名和 `type`。
2. **以为 `typings` 还能当声明入口**：7.0 只认 `types`。
3. **把 `prepare` 理解成默认 CJS+ESM**：现在默认 ESM-only。
4. **源码是 TS 却没有 tsconfig**：它会在项目根写一份默认配置。
5. **把 8 个入口必然上 worker、合并构建也立刻拆进程当成保证**：合并路径要到 256 才拆；watch / 测试环境可以关掉 worker。

## 适用 vs 不适用场景

**适用**：

- 愿意用 `src/<export>.ts` 约定对齐 `exports`，接受 Node `>=22.12`
- 需要 `react-server` / `edge-light` 这类条件源文件，或 `use client` 指令分层
- 对照 [[pkgroll]]：一边正配文件名，一边倒推 dist 路径

**不适用**：

- 还在 Node 18/20 上打库，或必须复用 6.x 的 `--prepare` flag
- 需要本页提供的速度排名——未跑 `scripts/benchmark.js`
- 只写了 `typings`、没有 `types`，又不愿改字段
- 想把默认 runtime 理解成 Node；CLI 缺省是 `browser`

## 固定版本边界

- 本文绑定 `huozhi/bunchee@18f93d40...`，annotated tag `v7.0.1` 剥开后与 npm `gitHead` 一致。
- `package.json` 声明 MIT；该提交没有许可证文件。Node `>=22.12.0`。
- 未安装依赖、运行 vitest / 真实打包 / prepare / worker，状态保持 `UNVERIFIED`。

## 学到什么

1. **“零配置”可以是文件命名协议，而不只是缺省 flag**
2. **CLI 默认值只覆盖没走 package.json 的那条路**
3. **大版本会删掉旧入口（`--prepare`、`typings`），迁移文档比 README 口号准**
4. **共享图优化的是重复模块，worker 优化的是堆内存，阈值不是同一条**

## 应用型自测

1. `src/react/index.ts` 默认对上哪一个 export 名？
2. `bunchee prepare` 不带 `--cjs` 时，默认写单格式还是双格式？
3. 非 watch 的合并构建，要多少个入口才会再拆进 worker？

检查点：

1. `"./react"`。目录入口按 `src/<name>/index.ts` 对齐。
2. 单格式 ESM。`--cjs` 才生成 `import` + `require`。
3. `256`。普通（未合并）路径的 worker 门槛是 `8`。

## 延伸阅读

- 固定源码：[huozhi/bunchee](https://github.com/huozhi/bunchee) —— 本文绑定 `18f93d40e96ed1fbaa1570f2d295678ff61c3036`
- 7.0 迁移：[docs/MIGRATION.md](https://github.com/huozhi/bunchee/blob/18f93d40e96ed1fbaa1570f2d295678ff61c3036/docs/MIGRATION.md)
- 审查记录：仓库内 `docs/lib-bundler-source-review-20260827-hb.md`
- [[pkgroll]] —— 同主题：从 dist 路径倒推 src
- [[swc]] —— 固定实现里的变换器

## 关联

- [[pkgroll]] —— 另一份 package.json 驱动的库打包合同
- [[swc]] —— `rollup-plugin-swc3` 的变换底座
- [[rolldown]] —— 下一代打包引擎对照，不是本页绑定对象
- [[oxc]] —— 另一条 TS/JS 工具链对照
