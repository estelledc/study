---
title: Farm — Rust 编译内核配 Vite 插件适配的打包器
description: 介绍 Farm 如何用 Rust 编译内核、先返回者 resolve 和 Vite 插件适配完成打包。
来源: 'https://github.com/farm-fe/farm'
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/farm-fe/farm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 549e29486b286c7d0488612eacb6bd4ed0884abe
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.7.11
---

## 是什么

Farm 是一套**Rust 编译内核 + Node NAPI 外壳**的前端打包器。日常类比：厨房里真正炒菜的是 Rust 炉灶，菜单和传菜口还是 Node——`@farmfe/core` 的 `Compiler` 只把配置和 JS/Rust 插件交给 `BindingCompiler`，真正的 `compile()` 在 `farmfe_compiler` 里走完。

固定 `v1.7.11` 对应 `@farmfe/core@1.7.11`。CLI 是另一个包：`@farmfe/cli@1.0.5`，版本号不能和 core 对齐。仓库里还有未发布的 `v2.0.0-beta.*`，本文不外推。

## 为什么重要

不理解这层分工，下面这些事会对不上：

- 为什么配置能写 `vitePlugins`，但 resolve/load 仍然是「先返回者获胜」
- 为什么 `compile()` 正在跑时再调一次会直接 `exit`
- 为什么 HMR 更新要进队列，而不是并行覆盖
- 为什么 CLI 1.0.5 和 core 1.7.11 不是同一个版本字段

## 核心要点

一次完整 `compile()` 是两段：

1. **Build**：`build_start` → 每个 `input` 在 rayon 线程池里 `resolve → load → transform → parse → process_module → analyze_deps → finalize_module` → 拓扑排序 → `build_end`。
2. **Generate**：`generate_start` → `optimize_module_graph` → `partial_bundling`（资源锅 / resource pot）→ `process_resource_pots` → 渲染并生成资源 → `finalize_resources` → `generate_end` → `finish`。

内部插件在 `Compiler::new` 里按名单注册：runtime、bundle、script、partial bundling、html、css、static assets、json、define；再按配置决定是否挂 progress、lazy compilation、tree shake、minify、polyfill。默认 resolve 插件最后入队。外部 JS/Rust 适配器追加后，全体按 `priority` 降序排列。`DEFAULT_PRIORITY` 是 `100`。

`resolve` 和 `load` 是 `hook_first`：第一个返回 `Some` 的插件赢。`transform` 是串行链。JS 插件的这三类 hook 必须带 `filters`，否则适配层不会替你全量扫描。

Vite 兼容走 `vitePlugins` → `VitePluginAdapter`。`enforce: 'pre' | 'post'` 被译成 priority `101` / `98`。只要数组非空，还会额外插入 `cssPluginWrap`、兜底 `defaultLoadPlugin` 和 `cssPluginUnwrap`。

Node 侧 `Compiler.update()` 用队列串行化并发更新；`writeResourcesToDisk()` 去掉 query/hash 后写盘，再调 JS `writeResources`。`start()` 设 `development` 后 `createDevServer.listen()`；`build()` 设 `production`，编译完再 `copyPublicDirectory`。`preview()` 要求产物目录已存在，默认端口 `1911`（可被 `FARM_DEFAULT_SERVER_PORT` 覆盖）。

## 实践示例

### 案例 1：最小配置

```ts
// farm.config.ts
export default {
  compilation: {
    input: { index: './index.html' },
  },
};
```

```bash
npx @farmfe/cli@1.0.5 start
npx @farmfe/cli@1.0.5 build
```

`start` 走 `resolveConfig(..., 'development')` → `createCompiler` → 对每个 JS 插件调 `configureCompiler` → Koa dev server。`build` 会在 `compilation.output.clean` 为真时先删输出目录。

### 案例 2：Vite 插件只是适配，不是换内核

```ts
export default {
  vitePlugins: [someVitePlugin({ /* ... */ })],
};
```

适配器会把 Vite hook 译成 Farm 的 `JsPlugin`。`optimizeDeps` 一类 Vite 选项会被忽略并打日志，不会变成 Farm 的预打包阶段。

### 案例 3：正在编译时再 compile

```ts
const compiler = new Compiler(config);
await compiler.compile();
await compiler.compile(); // 第二次：logger.error('Already compiling', { exit: true })
```

`compiling` 标志在 `compile()` / `compileSync()` 里同步翻转。HMR 应走 `update(paths)`，它会把并发路径推进 `_updateQueue`。

## 踩过的坑

1. **把 CLI 版本当成 core 版本**：固定提交里 `@farmfe/cli` 仍是 `1.0.5`。
2. **JS `resolve`/`load`/`transform` 不写 filters**：接口要求 `filters`，空过滤器不会自动变成「匹配一切」。
3. **以为 `vitePlugins` 等于 Vite 运行时**：没有 Vite dev server，只有适配后的 Farm hook。
4. **`preview` 未先 `build`**：目录不存在会抛 `The directory "..." does not exist`。
5. **并行 `compile()` 当队列**：只有 `update()` 排队；`compile()` 直接退出。

## 适用 vs 不适用场景

**适用**：

- 想用 Rust 内核做完整打包，又希望部分 Vite 插件能先适配
- 需要看清 resolve 抢先、transform 串联、resource pot 分锅这些阶段
- 接受 Node `>=16.15.1`，并自己核对 native binding 平台

**不适用**：

- 需要 webpack plugin hook 原样兼容——那是 [[rspack]] / [[rsbuild]] 的赌注
- 要把「比 Vite 快 N 倍」写成预算——本文未测
- 想跟 `v2.0.0-beta` 线混用结论
- 只做库打包、不要应用 dev server——先看更窄的打包器

## 固定版本边界

- 本文绑定 `farm-fe/farm@549e29486...`，即 tag `v1.7.11`（轻量 tag，解引用与 tag 对象同一提交）。
- `@farmfe/core` 版本为 `1.7.11`，`engines.node >=16.15.1`；`@farmfe/cli` 同仓库但是 `1.0.5`。
- npm `@farmfe/core@1.7.11` 未提供可核验 `gitHead`，以 GitHub tag 为准。
- 未安装依赖、未跑 Rust/JS 测试、未启动 dev server、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **外壳版本和内核版本可以脱节**——CLI 与 core 必须分开读
2. **先返回者获胜只适用于 resolve/load**；transform 是管道
3. **Vite 兼容是翻译层**，不是把 Vite 嵌进进程
4. **HMR 更新和全量 compile 是两条合同**，队列只保护前者

## 应用型自测

1. `resolve` 和 `transform` 哪个是 first-wins，哪个是串行链？
2. `vitePlugins` 里 `enforce: 'pre'` 会变成多大的 `priority`？默认 JS 插件是多少？
3. 第一次 `compile()` 还没结束时再调一次 `compile()`，Farm 会排队还是退出？

检查点：

1. `resolve`/`load` 是 `hook_first`；`transform` 串行。
2. `pre` → `101`，默认 `100`，`post` → `98`。
3. 退出：`Already compiling` 且 `{ exit: true }`。只有 `update()` 排队。

## 延伸阅读

- 官方文档：[farmfe.org](https://www.farmfe.org)
- 固定源码：[farm-fe/farm](https://github.com/farm-fe/farm) —— 本文绑定提交 `549e29486b286c7d0488612eacb6bd4ed0884abe`
- [[rsbuild]] —— 另一条「高层工具包住 Rust 内核」路线，内核是 Rspack 而不是自研 compiler
- [[rspack]] —— webpack 兼容的 Rust 内核，和 Farm 的 Vite 适配赌注不同

## 关联

- [[rsbuild]] —— 配置层包住 Rspack，不走 Vite plugin 翻译
- [[rspack]] —— 同类 Rust 打包内核，对外暴露 webpack hook
- [[swc]] —— Farm 的 script 插件栈使用 SWC 变换
- [[vite]] —— `vitePlugins` 的来源合同，不是 Farm 的运行时

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
