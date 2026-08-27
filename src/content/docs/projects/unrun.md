---
title: unrun — 用 Rolldown 在运行时加载任意 JS/TS
description: 异步 / 同步 / CLI 三条入口，以及 none / jiti / bundle-require 三套返回合同
来源: https://github.com/Gugustinette/unrun
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Gugustinette/unrun
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b1e8952e03f9f690ee0fc9f81fdc06d654617b6a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.3.1
---

## 是什么

unrun 是给 Node 22.13+ 用的**运行时模块加载器**。日常类比：[[bundle-require]] 用 [[esbuild]] 把配置复印成厨房小票；unrun 换成 [[rolldown]]，并且多了同步入口和真正“跑这份文件”的 CLI。

```js
import { unrun } from "unrun"

const { module, dependencies } = await unrun({
  path: "./config.ts",
})
```

固定 `0.3.1` 的运行时依赖是 `rolldown ^1.0.0`。`unrunSync` 还要可选 peer `synckit`。包只导出 ESM（`dist/index.mjs`）。npm 没有发布 `gitHead`，身份以 annotated tag `v0.3.1` 与可达 SHA 为准。

## 为什么重要

不理解三条入口和 preset，下面这些事会对不上：

- 为什么默认返回的是 `default` 导出，而 `preset: "bundle-require"` 返回整个 namespace
- 为什么 CLI 跑完进程就退出，调用方拿不到 `module`
- 为什么 `unrunSync` 不能带回函数
- 为什么找不到的 npm 包会被打进产物，找得到的反而保持 external

## 核心要点

固定版本的主链是：

1. **解析选项**：`path` 经 `normalizePath` 后相对 `process.cwd()` 做 `path.resolve`，文件必须已存在。默认 `path` 是 `index.ts`，默认 `preset` 是 `"none"`。非法 preset 直接抛错。
2. **Rolldown 只 `generate`**：`platform: "node"`、输出 `format: "esm"`、`codeSplitting: false`、`keepNames: true`。`tsconfig` 只在当前工作目录存在 `tsconfig.json` 时挂上，不是从入口目录往上找。
3. **external 看入口能不能解析**：builtin 永远外部；从入口目录向上走到 `node_modules/<pkg>` 的 bare import 保持外部，否则内联。相对路径、`#` 子路径和绝对路径都会被打进去。
4. **源文件身份靠 shim**：`define` 先钉死入口的 `__dirname` / `__filename` / `import.meta.*`；`source-context-shims` 再按模块重写 `import.meta.url` / `resolve` 和未声明的 `__filename`。
5. **加载与后处理分开**：`unrun()` 把代码写到 `node_modules/.unrun/<hint>.<random>.mjs`（失败回落 OS tmp，再失败才 `data:` URL），`import()` 后默认删除，再跑 `preset()`。`unrunCli` 改走子进程 `spawn(process.execPath)`，并转发 SIGINT / SIGTERM / SIGQUIT。`unrunSync` 用 synckit worker 调同一条 `unrun`，克隆结果时遇到函数会抛 `[unrun] unrunSync cannot return functions`。

## 实践示例

### 案例 1：默认异步加载

```js
import { unrun } from "unrun"

const { module } = await unrun({
  path: "./path/to/file.ts",
})
```

`preset` 省略时，若 namespace 上有 `default`，返回的是 `module.default`。文档里的“加载任意模块”包含这一层解包。

### 案例 2：兼容 bundle-require 的返回形态

```js
const { module } = await unrun({
  path: "./vite.config.ts",
  preset: "bundle-require",
})
```

`bundle-require` preset 不再解包 `default`。`jiti` preset 会额外挂 console / JSON / `typeof require` 插件，并在空 Module namespace 上模仿 jiti 的返回。

### 案例 3：CLI 把参数交给目标文件

```bash
npx unrun --preset=none ./scripts/migrate.ts -- --dry-run
```

`--` 之后的参数进入目标 `process.argv`。CLI 先把自身 argv 改写成 `[node, filePath, ...afterArgs]`，再 `unrunCli`；退出码来自子进程 `close`。`--debug` 会留下临时文件。

## 踩过的坑

1. **Node 版本不够**：`engines` 是 `^22.13.0 || >=24.0.0`。低于这条的 Node 不在本页合同里。
2. **只装 unrun 就调 `unrunSync`**：文档写明 synckit 是可选 peer，同步路径 `require("synckit")`。
3. **把默认返回当成 namespace**：`preset: "none"` 会解包 `default`。要从 [[bundle-require]] 迁过来，显式写 `preset: "bundle-require"`。
4. **以为 tsconfig 跟着入口走**：bundle 只检查 `process.cwd()/tsconfig.json`。
5. **引用仓库 `benchmark/results.json` 的数字**：那是上游自测产物，本页没有复跑，也不得写成已验证性能。

## 适用 vs 不适用场景

**适用**：

- 工具已经站在 Rolldown / oxc 这条链上，要在 Node 里读 TS / ESM / JSX 配置
- 需要同一套打包结果走异步加载、同步 worker 或 CLI 子进程
- 想用 preset 对齐 jiti / bundle-require 的返回习惯，而不是自己分叉后处理

**不适用**：

- 必须支持 Node 16/18/20：固定引擎声明盖不住
- 同步 API 要带回函数或不可结构化克隆的对象
- 需要完整类型检查或浏览器模块图
- 用未绑定的吞吐、包大小或下载量做选型

## 固定版本边界

- 本文绑定 `Gugustinette/unrun@b1e8952e...`，annotated tag `v0.3.1`，与 npm `unrun@0.3.1` 版本字符串一致。
- npm 未发布 `gitHead`；未猜测其他提交。
- 条件导出：`.` → `dist/index.mjs`，`./package.json`。CLI `dist/cli.mjs`。
- `synckit` 在 `peerDependenciesMeta` 里是 optional。
- 未安装依赖、未跑 vitest / CLI / WebContainer 测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **“能跑 TS”下面至少有三条入口**——`unrun` / `unrunSync` / `unrunCli` 的副作用边界不同。
2. **preset 改的是返回合同和插件集**，不是换引擎。
3. **external 决策跟着入口解析能力走**，所以嵌套 `node_modules` 会被内联。
4. **同步只是把异步结果搬过 worker**，可传输性变成新的 API 边界。

## 应用型自测

1. `await unrun({ path: "./app.ts" })` 在模块只有 `export default` 时，`module` 是 namespace 还是 default 值？
2. `unrunSync({ path: "./app.ts" })` 若 default 导出是函数，会怎样？
3. `unrunCli` 执行成功后，临时 `.mjs` 默认还在磁盘上吗？

检查点：

1. default 值。`preset()` 在 `"none"` 下返回 `module.default`。
2. 抛错。worker 的 `cloneForTransfer` 拒绝函数。
3. 不在。`cleanModule` 在 `debug` 为 false 时删除 `file://` 临时文件。

## 延伸阅读

- 官方文档：[gugustinette.github.io/unrun](https://gugustinette.github.io/unrun/)
- 固定源码：[Gugustinette/unrun](https://github.com/Gugustinette/unrun) —— 本文绑定 `b1e8952e03f9f690ee0fc9f81fdc06d654617b6a`
- 审查记录：仓库内 `docs/ts-bundle-load-source-review-20260827-gf.md`
- [[bundle-require]] —— esbuild 路线的对照实现，也是本页的一个 preset
- [[rolldown]] —— 本页钉住的打包引擎

## 关联

- [[bundle-require]] —— esbuild 打包再加载；本页可用 preset 对齐其返回
- [[rolldown]] —— 内存 `generate` 所用的 bundler
- [[oxc]] —— Rolldown 下游解析 / 变换组件
- [[esbuild]] —— bundle-require 的引擎对照
- [[vite]] —— 典型“读用户 TS 配置”场景，本页未审查其源码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bundle-require]] —— bundle-require — 先用 esbuild 打包再加载用户配置
