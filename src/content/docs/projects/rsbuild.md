---
title: Rsbuild — 把 Rspack 收成环境可拆的高层构建工具
description: 介绍 Rsbuild 如何用默认插件和环境拆分把 Rspack 收成高层构建工具。
来源: 'https://github.com/web-infra-dev/rsbuild'
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/web-infra-dev/rsbuild
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f274e3eaa08e28f2449d1abd7592c34796072d74
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.2.0
---

## 是什么

Rsbuild 是 **Rspack 上面的配置与插件编排层**，不是另一套打包内核。日常类比：Rspack 是发动机，Rsbuild 是整车线束——`createRsbuild()` 先装好约 30 个内置插件，再按 `environments` 生成一份或多份 Rspack 配置，最后把它们交给 `@rspack/core`。

固定 `v2.2.0` 的可发布包是 `@rsbuild/core@2.2.0`，bin 为 `rsbuild`。框架插件是独立版本：同提交里 `@rsbuild/plugin-react` 是 `2.1.0`，不能把 core 的 `2.2.0` 外推到所有 `@rsbuild/plugin-*`。

## 为什么重要

不理解这层编排，下面这些事会写错：

- 为什么空配置也能起一个叫 `web` 的 environment
- 为什么 `plugins: [new HtmlWebpackPlugin()]` 会直接抛错
- 为什么 `initConfigs()` 不能先 `dev` 再 `build`
- 为什么 `preview` 在空 `dist` 上会拒绝启动

## 核心要点

`createRsbuild()` 的主链是：

1. 可选 `loadEnv`，把公开环境变量写进 `source.define`，并把 env 文件加入 `dev.watchFiles` / `performance.buildCache.buildDependencies`。
2. `createPluginManager` + `applyDefaultPlugins`：basic、entry、sourcemap、cache、html、css、swc、splitChunks、moduleFederation 等内置插件先入队。
3. 再 flatten 用户 `config.plugins`，以及每个 environment 自己的 `plugins`。
4. 真正编译前走 `initRsbuildConfig`：`initPlugins` → `modifyRsbuildConfig` → `normalizeConfig` → 为每个环境 `modifyEnvironmentConfig` → 校验。

没有声明 `environments` 时，默认环境名是 `camelCase(output.target)`。默认 `output.target` 是 `'web'`，所以空配置会得到名为 `web` 的一环境。合法 target 只有 `web` / `node` / `web-worker`。`node` 默认 `output.module = true`（ESM）、`minify = false`、`distPath.js = ''`；非 node 默认开启 minify。

`createCompiler()` 先 `onBeforeCreateCompiler`，再要求 `@rspack/core` 的 `rspackVersion >= 2.0.0`。一份配置用 `rspack(config)`，多环境用 `rspack(configs)` 得到 `MultiCompiler`。随后挂 `run` / `watchRun` / `done`，dev 再注册 `registerDevHook`，最后 `onAfterCreateCompiler`。

插件合同和 webpack 插件是分开的。Rsbuild plugin 必须有 `setup`。带 `apply` 的 webpack/Rspack 插件会被 `validatePlugin` 拒绝，并提示改走 `tools.rspack`。`modifyRsbuildConfig` 里增删 `plugins` 只会警告：插件在该 hook 执行时已经初始化完毕。

`initConfigs()` 一旦绑定了 `context.action`，就不能换另一套 action。`preview()` 要求 `dist` 存在且非空。`server.base` 必须以 `/` 开头。

## 实践示例

### 案例 1：空配置 + React 插件

```ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
});
```

```bash
npx rsbuild dev
npx rsbuild build
```

`defineConfig` 只是类型助手，可以接收对象或 async factory。`pluginReact` 来自独立包，固定提交版本是 `2.1.0`。

### 案例 2：web + node 两个 environment

```ts
export default defineConfig({
  environments: {
    web: { output: { target: 'web' } },
    node: { output: { target: 'node' } },
  },
});
```

这会生成两份 Rspack 配置，`createCompiler` 走 `MultiCompiler`。`done` 日志会带 `(web)` / `(node)` 后缀。某个环境的 `plugins` 只加到该环境。

### 案例 3：webpack 插件不能塞进 `plugins`

```ts
export default defineConfig({
  tools: {
    rspack: {
      plugins: [new SomeWebpackPlugin()],
    },
  },
});
```

直接 `plugins: [new SomeWebpackPlugin()]` 会抛「看起来像 webpack or Rspack plugin，请用 `tools.rspack`」。

## 踩过的坑

1. **把所有 `@rsbuild/plugin-*` 当成 2.2.0**：React 插件在本提交是 `2.1.0`，Solid 甚至仍是 `2.0.0-beta.2`。
2. **在 `modifyRsbuildConfig` 里 `config.plugins.push(...)`**：hook 执行时插件已 `initPlugins`，只会 warn。
3. **`preview` 对着空目录**：`checkDistDir` 默认 true，空目录与缺失目录都会抛错。
4. **Rspack < 2.0.0**：`createCompiler` 会拒绝，最低版本写死为 `2.0.0`。
5. **`server.base` 写成 `app`**：必须是 `/app` 这种斜杠前缀。

## 适用 vs 不适用场景

**适用**：

- 要用 Rspack，但不想手写完整 webpack/Rspack 配置
- 同一仓库要同时打 web 与 node，靠 `environments` 拆 MultiCompiler
- 接受 Node `^20.19.0 || >=22.12.0`

**不适用**：

- 必须原样跑一套历史 webpack plugin 私有字段——先看 [[rspack]] 兼容边界，而不是 Rsbuild 默认值
- 想把 Vite 插件直接丢进 `plugins`——那是 [[farm]] 的 `vitePlugins` 适配，不是 Rsbuild
- 需要本文证明某套脚手架「一定一次成功」——未实际执行
- 要把构建耗时写成预算——未测

## 固定版本边界

- 本文绑定 `web-infra-dev/rsbuild@f274e3ea...`，即 tag `v2.2.0`（轻量 tag，与提交同一 SHA）。
- `@rsbuild/core@2.2.0`；`engines.node` 为 `^20.19.0 || >=22.12.0`。最低 Rspack 为 `2.0.0`。
- npm `@rsbuild/core@2.2.0` 未提供可核验 `gitHead`，以 GitHub tag 为准。
- 未安装依赖、未跑 vitest/e2e、未调用 `rspack()`、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **高层工具的产品是「默认插件 + 环境拆分」**，不是新的模块图算法
2. **插件命名空间要按合同分流**：`setup` 走 Rsbuild，`apply` 走 `tools.rspack`
3. **默认 environment 名来自 target**，不是写死的 `"web"` 字符串常量本身，而是 `camelCase('web')`
4. **action 绑定后不可换轨**，避免同一实例混用 dev/build 配置

## 应用型自测

1. 完全不写 `environments` 时，默认环境叫什么？依据哪两个默认值？
2. 把 `HtmlWebpackPlugin` 实例放进 `plugins` 会怎样？正确入口是什么？
3. `initConfigs({ action: 'build' })` 之后再 `initConfigs({ action: 'dev' })` 会怎样？

检查点：

1. 叫 `web`：默认 `output.target === 'web'`，再 `camelCase('web')`。
2. `validatePlugin` 抛错，提示改用 `tools.rspack.plugins`。
3. 抛 `initConfigs() can only be called with the same action type`。

## 延伸阅读

- 官方文档：[rsbuild.rs](https://rsbuild.rs)
- 固定源码：[web-infra-dev/rsbuild](https://github.com/web-infra-dev/rsbuild) —— 本文绑定提交 `f274e3eaa08e28f2449d1abd7592c34796072d74`
- [[rspack]] —— Rsbuild 真正调用的打包内核
- [[farm]] —— 另一条「高层配置 + Rust 内核」路线，兼容对象是 Vite 插件

## 关联

- [[rspack]] —— `createCompiler` 里 `rspack(config)` / `rspack(configs)` 的对象
- [[farm]] —— 自研 compiler + Vite 适配，不是 Rspack 封装
- [[webpack]] —— `tools.rspack` 要接的历史 plugin 形态
- [[swc]] —— 内置 `pluginSwc` 的默认转译器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
