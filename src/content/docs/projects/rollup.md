---
title: Rollup — ESM 优先的打包器
来源: https://github.com/rollup/rollup
日期: 2026-05-29
分类: 构建工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/rollup/rollup
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 34b8b924c815ec9413d7821f6fd54cc615584a51
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.63.0
---

## 是什么

Rollup 是一个 ESM 优先的 JavaScript 打包器。日常类比：像把一本书的分章稿合成一份可出版的 PDF，并且只留下真正被引用的章节。

固定 `v4.63.0` 里，`rollup(inputOptions)` 先建一张模块图，再返回 `{ generate, write, close }`。`generate` 只在内存里出产物，`write` 才落盘。同一张图可以再出 ESM、CJS 或其他 format。

```js
import { rollup } from "rollup";

const bundle = await rollup({ input: "src/index.js" });
await bundle.write({ file: "dist/index.mjs", format: "es" });
await bundle.close();
```

它擅长把库打成扁平、可 tree-shake 的发布形态；应用级 dev server / HMR 不是这套核心 API 的一部分。

## 为什么重要

不理解 Rollup，下面这些事都没法解释：

- 为什么 Vite 生产构建长期押在 Rollup 的 graph / plugin 合同上
- 为什么“只打包用到的 export”和 webpack 的 `sideEffects` 约定不是同一套实现
- 为什么裸模块名 `lodash` 必须靠 plugin，而 `./math.js` 核心自己就能解析
- 为什么 4.x 还要带平台 native 包：parser 已经不在纯 JS 里

## 核心要点

固定版本的主链可以拆成四步：

1. **先 build，后 generate**。`rollup()` 触发 `Graph.build()`：生成模块图 → 排序绑定 → 标记要留下的语句。`generate` / `write` 另建 `Bundle`，做 chunk 划分和 format 包装。内部 phase 是 `LOAD_AND_PARSE`、`ANALYSE`、`GENERATE`。

2. **默认解析很窄**。`resolveId` 先问 plugin；都没接手时，只有相对路径或绝对路径会去探 `.mjs` / `.js`。以字母开头的包名在这一层直接返回 `null`，要 `@rollup/plugin-node-resolve` 这类 plugin 才能进 `node_modules`。

3. **tree-shake 是多轮 include**。从 entry 标出已执行模块后，对每个模块跑 `include()`；第一轮之后，`preserveSignature !== false` 的入口会 `includeAllExports()` 再进下一轮。`treeshake: false` 则整模块全收。默认 `moduleSideEffects` 是“当作有副作用”。

4. **parser 走 native**。`parseAst` 调 NAPI `parse` / `parseAsync`，再把 buffer 转成 JS AST。浏览器构建换成 WASM，而且没有 Node 那种 resolve/load 回退。

## 实践示例

### 案例 1：同一张图出两份 format

```js
import { rollup } from "rollup";

const bundle = await rollup({
  input: "src/index.js",
  plugins: [/* nodeResolve / typescript 等 */]
});

await bundle.write({ file: "dist/index.mjs", format: "es" });
await bundle.write({ file: "dist/index.cjs", format: "cjs" });
await bundle.close();
```

`es` / `cjs` / `amd` / `iife` / `umd` / `system` 都是 generate 阶段的 finaliser，不是第二遍重新建图。`write` 需要 `file` 或 `dir`。

### 案例 2：最小 transform plugin

```js
export default function jsonPlugin() {
  return {
    name: "json",
    transform(code, id) {
      if (!id.endsWith(".json")) return null;
      return `export default ${JSON.stringify(JSON.parse(code))};`;
    }
  };
}
```

`return null` 表示本 plugin 不处理，交给下一个。build hook 里还有 `resolveId`、`load`、`moduleParsed`；输出阶段另有 `renderStart`、`generateBundle`。

### 案例 3：关掉或收紧 tree-shake

```js
await rollup({
  input: "src/index.js",
  treeshake: false
});

await rollup({
  input: "src/index.js",
  treeshake: { preset: "smallest" }
});
```

`false` 跳过 include 循环，每个模块 `includeAllInBundle()`。`smallest` 把 `moduleSideEffects` 设成恒 false，并关掉若干保守的副作用假设。这是配置，不是对 npm `sideEffects` 字段的自动读取。

## 踩过的坑

1. **核心不读 `package.json` 的 `sideEffects`**。默认 `treeshake.moduleSideEffects` 返回 `true`。webpack 那套 `"sideEffects": false` 不会在本仓自动生效；要靠 plugin 在 `resolveId` / module info 里改，或自己写 `treeshake.moduleSideEffects`。

2. **裸 specifier 不会被默认解析**。没有 `nodeResolve` 时，`import "lodash"` 会变成 unresolved / external，而不是去找 `node_modules`。

3. **CJS 不是一等模块**。内部按 ESM 绑定与 include。CommonJS 包必须先被 plugin 转成 ESM；动态 `require`、条件导出仍然可能转失败。

4. **`write` 之后要 `close()`**。bundle 实现了 `Symbol.asyncDispose`；不关会让 `closeBundle` hook 和 watcher 资源悬着。

## 适用 vs 不适用场景

**适用**：

- 发 npm 库，要扁平 ESM/CJS 双产物
- 需要精确 unused-export 删除，并能接受 plugin 补齐解析
- 已经用 Vite / 其他工具，只把生产图交给 Rollup 合同

**不适用**：

- 大型应用要 dev server、HMR、webpack loader 生态
- 以 CommonJS 为主、又不愿维护 `@rollup/plugin-commonjs` 边界
- 需要核心自动尊重 npm `sideEffects` 字段

## 固定版本边界

- 本文绑定 `rollup/rollup@34b8b924...` / `v4.63.0`，npm `gitHead` 与该提交一致。
- Node engines 为 `>=18.0.0`。`maxParallelFileOps` 默认 1000。
- 输出 finaliser 固定为 amd / cjs / es / iife / system / umd。
- 本文未安装依赖、运行测试、bundle 或性能 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **build 与 generate 是两段合同**——图可以复用，format 和是否写盘是后一步。
2. **默认解析不是 Node 解析**——相对文件是核心，包名是 plugin。
3. **tree-shake 默认偏保守**——“有副作用”是默认，不是 npm 字段自动生效。
4. **4.x parser 已经 native**——JS 层编排 graph 与 hook，句法分析走 NAPI/WASM。

## 应用型自测

1. 不配任何 plugin，`import "lodash"` 会被默认 `resolveId` 解析到 `node_modules` 吗？
2. 未改 `treeshake` 时，核心会不会因为某个包的 `"sideEffects": false` 而删掉它的副作用模块？
3. 对同一 `bundle` 先 `write({ format: "es" })` 再 `write({ format: "cjs" })`，会不会重新跑一遍 `Graph.build()`？

检查点：

1. 不会。裸 specifier 在默认回退里直接返回 `null`。
2. 不会。默认 `moduleSideEffects` 恒为 true，除非配置或 plugin 改写。
3. 不会。`generate` / `write` 复用已建成的 graph。

## 延伸阅读

- 固定源码：[rollup/rollup](https://github.com/rollup/rollup) —— 本文绑定提交 `34b8b924c815ec9413d7821f6fd54cc615584a51`
- 架构说明：[ARCHITECTURE.md](https://github.com/rollup/rollup/blob/34b8b924c815ec9413d7821f6fd54cc615584a51/ARCHITECTURE.md)
- 主链源码：[src/Graph.ts](https://github.com/rollup/rollup/blob/34b8b924c815ec9413d7821f6fd54cc615584a51/src/Graph.ts)
- [[webpack]] —— application 打包的另一极
- [[vite]] —— 生产构建长期调用 Rollup
- [[rspack]] —— webpack 兼容路线的 Rust 打包器

## 关联

- [[webpack]] —— 与 Rollup 形成 application vs library 的两极
- [[vite]] —— 把 Rollup 装在底下做 production build
- [[esbuild]] —— 速度优先的对照
- [[rspack]] —— 本批对照：留 webpack API，换 Rust 内核
- [[rolldown]] —— 宣称兼容 Rollup plugin 协议的 Rust 重写

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[oclif]] —— oclif — 给 50+ 命令的 CLI 一套"目录即路由"的框架
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[webpack]] —— webpack 模块打包
