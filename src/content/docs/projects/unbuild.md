---
title: unbuild — 从 package.json 推断入口的统一库构建器
description: 从 exports 字段推断入口，调度 rollup、mkdist 与 jiti stub
来源: https://github.com/unjs/unbuild
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/unjs/unbuild
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a0b4aaf87a6566e7b2c6f7855242fc2acc10dc6a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.6.1
---

## 是什么

unbuild 是 unjs 的统一 JavaScript 构建器。日常类比：它不像 [[tsup]] 那样“你丢几个文件进 esbuild”，更像**仓库管理员**——先读 `package.json` 的 `exports` / `bin` / `main` / `types`，再决定每个入口走 [[rollup]] 打包、mkdist 文件对文件转译、copy 还是 untyped。

固定 `v3.6.1` 自称 “A unified JavaScript build system”。同一份 README 注明正在试验基于 [[rolldown]] 的后继 [obuild](https://github.com/unjs/obuild)。本页不审查 obuild。

```bash
npx unbuild
```

发布物是纯 ESM（`exports` 指向 `dist/index.mjs`）。CLI 由 citty 提供。TypeScript 是可选 peer。

## 为什么重要

不理解 unbuild，下面这些事都没法解释：

- 为什么目录入口（尾斜杠）和文件入口不是同一条 builder
- 为什么默认常常只出 `.mjs`，CJS 要靠推断或 `rollup.emitCJS`
- 为什么 `--stub` 不是 watch，却能让你 link 源码
- 为什么构建“成功”仍可能以退出码 1 结束

## 核心要点

1. **四条 builder，默认串行**：`typesBuild`（untyped）→ `mkdistBuild` → `rollupBuild` → `copyBuild`。`parallel: true` 才同时跑。入口没写 `builder` 时，`input` 以 `/` 结尾走 mkdist，否则走 rollup。

2. **auto preset 从 package.json 反推**：没有手写 `entries` 时，`inferEntries` 扫 `src/`，对照 `exports` / `bin` / `main` / `module` / `types`。看到 CJS 输出会打开 `rollup.emitCJS`；`declaration === undefined` 时，有 `types`/`typings` 就变成 `"compatible"`，否则 `false`。

3. **Rollup 默认 ESM，声明分三档**：`emitCJS` 默认 `false`，所以常只写 `[name].mjs`。声明为 `true` / `"compatible"` 时再写 `.d.mts` + `.d.cts` + `.d.ts`；`"node16"` 只写前两个。CJS 声明还要 `emitCJS` 才落 `.d.cts`。esbuild 默认 `target: "esnext"`。

4. **`--stub` 写 jiti 跳板，不打包**：rollup stub 生成 `.mjs`（可选 `.cjs`），里面 `createJiti(...).import(源文件)`。mkdist stub 则是把输入目录 symlink 到 outDir。stub / watch 跳过体积汇总和 `validate*`。

5. **校验默认 fail-closed**：`failOnWarn` 默认 `true`。`validateDependencies` 报潜在 unused / implicit 依赖；`validatePackage` 检查 `package.json` 声明的文件是否存在。非 stub/watch 时还会 `Object.assign(pkg, pkg.publishConfig)`。

## 实践示例

### 案例 1：零配置，让 auto 读 package.json

```json
{
  "type": "module",
  "scripts": { "build": "unbuild", "prepack": "unbuild" },
  "exports": { ".": { "import": "./dist/index.mjs" } },
  "types": "./dist/index.d.ts"
}
```

`npx unbuild` 用 jiti 读 `./build.config`（可缺省）和 `package.json`。preset 默认 `"auto"`。有 `types` 时声明档变成 `compatible`。

### 案例 2：文件走 rollup，目录走 mkdist

```ts
import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: [
    "./src/index",
    { builder: "mkdist", input: "./src/package/components/" },
  ],
  declaration: "compatible",
});
```

字符串入口会被补成 `{ input }`；尾斜杠让 builder 自动变成 mkdist。配置还可写在 `package.json` 的 `unbuild` / `build` 键。

### 案例 3：开发期 stub，而不是开 watch

```bash
npx unbuild --stub
```

这不是文件监听。它写 jiti 包装，改源码立刻反映到 `dist`。watch 是另一条实验路径，且 rollup DTS / mkdist 都明确还不支持 watch。

## 踩过的坑

1. **把 unbuild 当成“又一个 tsup”**：主链是四 builder + package.json 推断，不是单条 esbuild。
2. **以为默认双格式**：`emitCJS` 默认 `false`；没推断到 CJS 输出就只有 `.mjs`。
3. **把 `--stub` 当 watch**：stub 跳过校验；watch 才重建，而且声明/watch 组合会警告。
4. **忽略 `failOnWarn`**：unused / implicit / 缺失 exports 路径会 `process.exit(1)`。
5. **把 README 的 obuild 试验写成 3.6.1 已换引擎**：本页绑定的仍是 Rollup + esbuild + mkdist。

## 适用 vs 不适用场景

**适用**：

- unjs 风格的 ESM 包，想从 `exports` 反推入口和声明档
- 同一仓库既要打 bundle，又要用 mkdist 保持目录结构
- 开发时用 `--stub` link 源码，发布时再走完整构建 + 校验

**不适用**：

- 只要“丢一个文件进 esbuild”、默认 CJS——那是 [[tsup]] 的合同
- 需要本页提供的速度排名，或把 obuild / rolldown 当成已切换引擎
- 依赖尚未核验的 Rollup 插件语义，却把 `almost drop-in` 写进保证
- 不能接受 `failOnWarn` 把 CI 打红，又不想显式关掉

## 固定版本边界

- 本文绑定 `unjs/unbuild@a0b4aaf8...`，annotated tag `v3.6.1` 与 npm `unbuild@3.6.1` 的 `gitHead` 同指此提交。
- Rollup 默认 `preserveDynamicImports: true`，`esbuild.target` 为 `esnext`，`clean` 默认 `true`。
- 未安装依赖、运行 vitest / 真实打包或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **统一构建器的统一，是调度多条 builder，不是抹平所有产物形态**
2. **从 package.json 推断等于把发布合同当成构建输入**
3. **stub 解决的是“开发时别等 rebuild”，不是生产产物**
4. **默认失败的警告比静默成功更接近发布门禁**

## 应用型自测

1. 入口写成 `./src/components/`（带尾斜杠）且未指定 `builder`，会走哪条 builder？
2. `declaration` 为 `"node16"` 时，会不会写 `dist/index.d.ts`？
3. `failOnWarn` 保持默认、校验报了 unused dependency，进程退出码是什么？

检查点：

1. mkdist。`input.endsWith("/")` 时自动选它。
2. 不会。`node16` 只写 `.d.mts` 与 `.d.cts`；`.d.ts` 要 `true` / `"compatible"`。
3. `1`。警告非空且 `failOnWarn` 为真时 `process.exit(1)`。

## 延伸阅读

- 固定源码：[unjs/unbuild](https://github.com/unjs/unbuild) —— 本文绑定 `a0b4aaf87a6566e7b2c6f7855242fc2acc10dc6a`
- 选项类型：同提交 `src/types.ts`
- 审查记录：仓库内 `docs/lib-bundler-source-review-20260827-fy.md`
- [[tsup]] —— esbuild 默认 CJS 的对照
- [[rollup]] —— 打包 builder 的引擎
- [[esbuild]] —— Rollup 插件里的 transform / minify

## 关联

- [[tsup]] —— 另一条库打包默认合同
- [[rollup]] —— `rollupBuild` 的打包与 dts
- [[esbuild]] —— rollup 插件默认 `target: "esnext"`
- [[rolldown]] —— README 里 obuild 试验的后继引擎
- [[vite]] —— 应用打包对照，不是本页审查对象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
