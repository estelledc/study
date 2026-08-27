---
title: rolldown — 用 Rust 实现 Rollup 兼容协议的打包器
来源: https://github.com/rolldown/rolldown
日期: 2026-05-30
分类: 构建工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/rolldown/rolldown
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5375362b36eeeaf514c67052ba65f3e97523dde5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.6
---

## 是什么

rolldown 是用 Rust 写的 JavaScript / TypeScript 打包器。日常类比：对外仍是 Rollup 那套方向盘（`input` / `output`、plugin 钩子），发动机换成 Rust，parser / transform / minify 交给 [[oxc]]。

固定 `v1.2.6` 的目标是给 [[vite]] 当统一 bundler，也可单独当 Rollup 替代或需要更细 chunk 控制时的 esbuild 替代。维护方是 VoidZero。

```bash
npm i -D rolldown
npx rolldown src/main.js --file bundle.js
```

Node 引擎声明为 `^20.19.0 || >=22.12.0`。预编译二进制按平台分发，缺失时回退 Wasm/WASI。

## 为什么重要

不理解 rolldown，下面这些事都没法解释：

- 为什么 Vite 8 的 npm 包已经依赖 rolldown，但 vite.dev 上仍能看到 Vite 7 的 `rolldown-vite` 别名文档
- 为什么“Rollup plugin 能用”不等于每个钩子、每次跨语言调用都免费
- 为什么 `generate()` 和 `write()` 不是同一个阶段
- 为什么模块解析不在 oxc 主仓，而在 `oxc_resolver`

## 核心要点

1. **流水线是 scan → link → generate（→ emit）**：`Bundler::write` / `generate` 先 `scan_modules`（`ScanStage`），再 `LinkStage::link`，再 `GenerateStage::generate`。`write` 随后建目录、写文件并跑 `writeBundle`；`generate` 停在内存。

2. **Rollup 协议是兼容目标，不是逐钩子保证**：文档写 plugin 接口 almost fully compatible，差异跟踪在上游 issue。热路径上的 JS `transform` / `resolveId` 仍要跨 Rust/JS；官方建议 hook filter。

3. **内置能力比 Rollup 宽、比 esbuild 近**：平台 preset、TS/JSX/syntax lowering、Node 解析、ESM/CJS interop、`define` / `inject`、manual code splitting。`define` 是 AST 级替换，和 `@rollup/plugin-replace` 的字符串替换不同。

4. **oxc 是组件，不是整个仓库**：workspace 钉死 `oxc@0.147.0`，resolver / sourcemap 是另两个 crate。增量构建只在 `experimental.is_incremental_build_enabled()` 打开时走 `incremental_*` API。

## 实践示例

### 案例 1：CLI 打一份 ESM

```bash
npx rolldown src/index.ts --file dist/bundle.js
```

文档里的默认 output format 始终是 `esm`，与 `platform` 无关。`platform` 默认在 `cjs` 输出时为 `node`，否则为 `browser`。浏览器目标不会自动 polyfill Node 内建模块。

### 案例 2：JS API 先 `generate` 再 `write`

```js
import { rolldown } from "rolldown";

const bundle = await rolldown({ input: "src/main.js" });
await bundle.generate({ format: "esm" });
await bundle.write({ file: "bundle.js" });
```

`rolldown()` 对应 Rust `Bundler`；`generate` 不落盘，`write` 才写。也有更短的 `build()`，默认写盘。`watch().close()` 返回 Promise，和 Rollup 同步 `close` 不同。

### 案例 3：最小 plugin，加上 filter 意识

```js
import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  plugins: [{
    name: "replace-foo",
    resolveId(source) {
      if (source === "foo") return "src/foo-replacement.ts";
      return null;
    },
  }],
});
```

`resolveId` 返回字符串表示接管，`null` 交给下一层。文档示例还警告：生产插件应使用 hook filter，减少每个模块都跳进 JS 的开销。

## 踩过的坑

1. **把 `generate()` 当成已经写出 dist**：只有 `write` / `build` 会 `fs.write`。
2. **用小 demo 断言“一定更快”**：固定源码和文档都指向独立 benchmark 仓库；本页没有复跑。
3. **把 `define` 当字符串 replace**：只能替换合法 identifier / member expression。
4. **以为增量构建已经默认打开**：`impl_bundler_build.rs` 把它关在 experimental flag 后面。
5. **把 Vite 7 的 `rolldown-vite` 别名文档当成 Vite 8 合同**：npm `vite@8.2.2` 已依赖 `rolldown ~1.2.4`；本页绑定的是更新的 `1.2.6`，并未审查 Vite 源码。

## 适用 vs 不适用场景

**适用**：

- 需要 Rollup 级 plugin / chunk 控制，又想走 Rust + oxc 这条链
- 库或应用的独立 CLI/API 打包，接受 ESM 默认和 Node 20.19+ / 22.12+
- 对照 [[vite]] 8 如何把 bundler 收成一个依赖

**不适用**：

- 已经稳定的 webpack / [[rspack]] 配置，且没有统一引擎的痛
- 依赖尚未核验的冷门 Rollup plugin，或必须和 Rollup 逐钩子行为一致
- 需要本页提供的性能排名或 Vite 内部默认开关——那些要另绑 Vite revision
- 团队无法在出问题时读 Rust 阶段代码（scan/link/generate）

## 固定版本边界

- 本文绑定 `rolldown/rolldown@5375362b...`，tag 与 package 均为 `1.2.6`。
- 同提交钉住 `oxc@0.147.0`、`oxc_resolver@11.24.3`、`oxc_sourcemap@8.1.0`。
- Node `^20.19.0 || >=22.12.0`；缺失原生绑定可走 Wasm。
- 未安装依赖、运行上游测试、启动 Vite 或测量打包，状态保持 `UNVERIFIED`。

## 学到什么

1. **兼容旧协议比发明新 API 更容易带着生态走**，但“almost compatible”必须对照差异表
2. **统一引擎解决的是双工具语义分裂**，不是自动消灭跨语言 plugin 成本
3. **scan / link / generate / emit 分开后，性能和正确性才能各自验收**
4. **依赖声明和文档站可能不同步**——以可复查的 package / tag / SHA 为准

## 应用型自测

1. 调用 `bundle.generate({ format: "esm" })` 之后，磁盘上一定有产物吗？
2. 未打开 experimental incremental flag 时，`write()` 会走 `incremental_write` 吗？
3. `transform.define` 能像 `@rollup/plugin-replace` 那样替换任意子串吗？

检查点：

1. 不一定。`generate` 只在内存里出 bundle；写盘是 `write`。
2. 不会。固定实现只在 flag 打开时走增量 API。
3. 不能。它按 AST 替换 identifier / member expression。

## 延伸阅读

- 官方文档：[rolldown.rs](https://rolldown.rs)
- 固定源码：[rolldown/rolldown](https://github.com/rolldown/rolldown) —— 本文绑定 `5375362b36eeeaf514c67052ba65f3e97523dde5`
- 审查记录：仓库内 `docs/oxc-rolldown-source-review-20260827-o.md`
- [[oxc]] —— 本页钉住的 parser / transformer / minifier
- [[rollup]] —— plugin 协议基准
- [[vite]] —— 当前最大的集成消费者

## 关联

- [[oxc]] —— parse / transform / minify 底座
- [[vite]] —— npm 8.2.2 已依赖 rolldown
- [[rollup]] —— plugin / JS API 的兼容对象
- [[esbuild]] —— 功能范围对照，不是本页测速对象
- [[swc]] —— 另一条 Rust 编译路线
- [[rspack]] —— webpack 兼容的 Rust bundler 对照
- [[turbopack]] —— 增量计算路线对照
- [[lightningcss]] —— Vite/Rolldown 生态里常见的 CSS 一侧

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[oxc]] —— oxc — 用一份 arena AST 串起 JS/TS 编译器组件
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
