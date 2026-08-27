---
title: mlly — 给 Node ESM 补齐 resolve、interop 和语法探测
description: 介绍 mlly 如何用同步 ESM resolve、interopDefault 和语法探测补齐 Node 模块工具。
来源: https://github.com/unjs/mlly
日期: 2026-08-27
分类: 前端工程化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/mlly
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c5ce4e5596761b9d2b063bcf82a5160d76e8c2cf
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.8.2
---

## 是什么

mlly 是一套给 Node.js ESM 补缺的工具函数。日常类比：Node 已经有运输车（`import` / `import.meta.resolve`），但装卸清单、转接头和“这箱货能不能直接上 ESM 月台”的检查，还得另备一把。

```ts
import { resolve, interopDefault, isValidNodeImport } from "mlly"

const url = await resolve("./mod.mjs", { url: import.meta.url })
const mod = interopDefault(await import(url))
```

固定 `1.8.2` 同时提供 ESM 与 CJS 入口。它依赖 `ufo`、`pathe`、`acorn`，以及 **`pkg-types@^1.3.1`**——不是本站 [[pkg-types]] 页绑定的 2.3.1。

## 为什么重要

不读固定源码，下面这些合同很容易被 README 带偏：

- 为什么 `resolve()` 看起来像异步，实际只是给同步 `_resolve` 套 `Promise.resolve`
- 为什么 `createResolve({ url })` 之后再传第二参数，父 URL 仍可能被 defaults 盖掉
- 为什么 `isValidNodeImport` 对普通 `.js` 看的是“有没有 ESM 语法”，不是“先确认 CJS”
- 为什么 `evalModule` 不会自动改写相对 import

## 核心要点

固定版本可以拆成五条主链：

1. **`_resolve`**：已有 `node:` / `data:` / `http(s):` 协议直接返回；内建模块补 `node:`；绝对路径若 `statSync` 是文件则转 `file:` URL。否则用 `import-meta-resolve` 的 `moduleResolve`，默认条件集是 `node` + `import`，找不到再试 `""` / `/index` 加 `.mjs` `.cjs` `.js` `.json`。

2. **`createResolve(defaults)`**：返回 `(id, url) => resolve(id, { url, ...defaults })`。`defaults` 后展开，所以 `defaults.url` 会覆盖调用时传入的 `url`。

3. **`interopDefault`**：没有 `default`、或 default 为 `null`/`undefined`，原样返回。default 是可扩展对象，或（未设 `preferNamespace` 时）是函数，就把 named export 用 getter 挂到 default 上并返回它；字符串等不可扩展值在 `preferNamespace: true` 时退回整个 namespace。

4. **`isValidNodeImport`**：内建与 `data:` 直接 true；协议不在 `node`/`file`/`data` 则 false。解析后 `.mjs` / `.cjs` / `.node` / `.wasm` 为 true；非 `.js` 为 false；`package.json` 的 `type: "module"` 为 true；路径像 `.esm.js` 为 false。最后读源码，返回 **`!hasESMSyntax(code)`**。

5. **分析与 eval**：`findStaticImports` / `findExports` 先正则，再用 acorn tokenizer 丢掉假阳性；acorn 抛错就不过滤。`evalModule` 只把 `.json` 包成 `export default`，并把 `import.meta.url` 换成字面量，然后 `import(dataURL)`。相对路径改写在独立的 `resolveImports`。

## 实践示例

### 案例 1：resolve 返回 URL，resolvePath 返回路径

```ts
import { resolve, resolvePath } from "mlly"

const url = await resolve("./utils.mjs", { url: import.meta.url })
const path = await resolvePath("./utils.mjs", { url: import.meta.url })
```

`resolve` 走 `pathToFileURL`；`resolvePath` 再 `fileURLToPath`。不传 `url` 时，搜索起点是 `process.cwd()`。没有 `fs` 异步——失败立刻 `Promise.reject`。

### 案例 2：interopDefault 会改 default 对象

```ts
const ns = { default: { x: 2 }, named: 1 }
const value = interopDefault(ns)
// value === ns.default，且 value.named === 1
```

它用 `Object.defineProperty` 往 **同一个** default 对象上挂 getter。`preferNamespace: true` 且 default 是字符串时，返回整个 namespace，而不是那个字符串。

### 案例 3：evalModule 不会替你改写相对 import

```ts
import { evalModule, resolveImports } from "mlly"

const code = `import { reverse } from './utils.mjs'`
await evalModule(await resolveImports(code, { url: import.meta.url }), {
  url: import.meta.url,
})
```

只调用 `evalModule(code, { url })` 时，`./utils.mjs` 仍相对于 data URL，解析会失败。README 把“自动改写 import”写在 Evaluating Modules 总述下，固定实现里这步是显式 API。

## 踩过的坑

1. **把 `resolve` 当成会碰磁盘的异步解析器**：同步 `_resolve` 已经做完；Promise 只是包装。
2. **用 `createResolve({ url })` 去 ponyfill `import.meta.resolve(id, parent)`**：第二参数会被 defaults 盖掉。
3. **按 README 算法读 `isValidNodeImport`**：最终不是“检出 CJS 就 true”，而是“只要还有 ESM 语法就 false”。
4. **以为 `evalModule` 自带 import 重写**：必须先 `resolveImports`。
5. **把 mlly 的 `pkg-types` 依赖当成 2.x**：固定 1.8.2 钉的是 `^1.3.1`。

## 适用 vs 不适用场景

**适用**：

- 构建器 / 加载器需要在 Node 里补扩展名、`/index` 和 interop
- 静态抽出 import/export 名字，能接受正则 + acorn 过滤
- 与 [[pkg-types]] 分工：mlly 管模块身份，pkg-types 管 package.json / tsconfig

**不适用**：

- 需要完整 Node ESM 条件集或 TypeScript 扩展解析
- 把未实测的下载量、体积或“Node 14+ 推荐”写成当前保证
- 要在浏览器里跑 `createRequire` / `statSync` 这条链

## 固定版本边界

- 本文绑定 `unjs/mlly@c5ce4e5596761b9d2b063bcf82a5160d76e8c2cf`，tag / npm latest 均为 `1.8.2`，`gitHead` 与 tag 一致。
- 条件 exports：`types` / `import` / `require`；`sideEffects: false`。
- 本文未安装依赖、运行 vitest 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **异步 API 不一定有异步工作**——看函数体，不看返回类型。
2. **options 展开顺序就是合同**——`{ url, ...defaults }` 让默认值赢。
3. **README 算法和源码最后一行可以不一致**——`isValidNodeImport` 以 `!hasESMSyntax` 为准。
4. **eval 与 rewrite 是两条入口**——data URL 不会继承文件相对路径。

## 应用型自测

1. 调用 `resolve("./x.mjs")` 且不传 `url`，搜索起点是什么？
2. `createResolve({ url: A })` 后再调用 `fn("./x", B)`，实际用的 url 是 A 还是 B？
3. 一个没有 `type: "module"` 的 `.js` 文件里写了 `export default 1`。`isValidNodeImport` 会返回 true 吗？

检查点：

1. `process.cwd()` 转成的 `file:` URL。
2. A。`defaults` 后展开，盖掉第二参数。
3. 不会。最终判断是 `!hasESMSyntax`。

## 延伸阅读

- 文档：[github.com/unjs/mlly](https://github.com/unjs/mlly)
- 固定源码：[unjs/mlly](https://github.com/unjs/mlly) —— 本文绑定提交 `c5ce4e5596761b9d2b063bcf82a5160d76e8c2cf`
- [[pkg-types]] —— 读 package.json / tsconfig 的互补工具；mlly 1.8.2 依赖的是 1.x
- [[ofetch]] —— 同属 UnJS，但合同在 HTTP 而不是模块解析
- [[node-js]] —— `import.meta.resolve` 与 `createRequire` 的运行时对照

## 关联

- [[pkg-types]] —— 包元数据与 tsconfig，对照模块 URL
- [[ofetch]] —— UnJS HTTP 包装，不负责 resolve
- [[vite]] —— 开发期 ESM 加载，不是这套 Node 工具函数
- [[node-js]] —— 内建 resolve / require 的对照
- [[unstorage]] —— 同生态的运行时抽象，目标是 KV 而不是模块

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
