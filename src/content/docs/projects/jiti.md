---
title: jiti — 运行时把 TypeScript / ESM 接进 Node
description: 惰性 Babel 转译、CJS/ESM 双通道，以及 register / native / static 入口
来源: https://github.com/unjs/jiti
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/jiti
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fd3bb289b75ed207edfb686d671ed50144f7e90f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.7.0
---

## 是什么

jiti 是给 Node 用的**运行时 TypeScript / ESM 加载器**。日常类比：它不像 `tsc` 先把整栋楼盖完再开门，而像门口的翻译——你 `import` 一份 `.ts`，它当场擦类型、必要时把 ESM 收成可执行模块，再交给当前进程。

```js
import { createJiti } from "jiti"
const jiti = createJiti(import.meta.url)
const mod = await jiti.import("./config.ts")
```

固定 `2.7.0` 的发布包声明零运行时依赖；Babel 插件打进 `dist/babel.cjs`，默认入口惰性加载。同步 `jiti("./file.ts")` 还在，类型声明已经标成 deprecated，推荐 `await jiti.import()`。

## 为什么重要

不理解 jiti 的入口和求值通道，下面这些事会对不上：

- 为什么 Nuxt / ESLint / Tailwind 一类工具能直接读 TS 配置，却不能假设“就是原生 `import()`”
- 为什么 `jiti/register`、`jiti/native` 和默认包不是同一条实现
- 为什么默认打开 `interopDefault` 之后，named export 和 `default` 看起来像一份对象
- 为什么 Bun 上它会先试原生加载，失败才回落到转译

## 核心要点

固定版本可以拆成五步：

1. **工厂返回双通道实例**：`createJiti(filename, options)` 解析环境变量默认值，再挂 `import` / `esmResolve` / `transform` / `evalModule`。同步调用走 `jitiRequire(..., { async: false })`。

2. **先分流再决定转译**：`node:`、内建模块、`.json`、`nativeModules`（默认含 `typescript` 和 `jiti`）走原生；`data:` 只允许 async。其余读源码进 `evalModule`。

3. **转译条件是显式的**：`.cjs` 跳过；async 模式下原生 ESM 也可跳过；`.ts` / 包 `type:module` 的 `.js` / `transformModules` / `hasESMSyntax` 才过 Babel。插件包含 TS 擦除、`import.meta`、显式资源管理，JSX 要 `jsx: true`。

4. **求值默认是包装后的 CJS**：`vm.runInThisContext` 包一层 `(exports, require, module, __filename, __dirname, jitiImport, jitiESMResolve)`。async 且撞上 `import.meta` 一类语法时，改走 `data:` URL；`ENAMETOOLONG` 再写临时 `.mjs`。

5. **兼容层是 Proxy**：`interopDefault` 默认 true，用带 Map 缓存的 Proxy 把 `default` 与 named export 合成一份。`tryNative` 默认只在检测到 Bun 时打开。

## 实践示例

### 案例 1：推荐的异步入口

```js
import { createJiti } from "jiti"

const jiti = createJiti(import.meta.url)
const config = await jiti.import("./vite.config.ts", { default: true })
```

`{ default: true }` 是 `mod?.default ?? mod` 的快捷方式。父路径必须能定位文件，目录会被补成 `_index.js` 再 `createRequire`。

### 案例 2：全局 register 与 CLI

```bash
node --import jiti/register index.ts
npx jiti ./scripts/migrate.ts
```

`jiti/register` 调用 `module.register("./jiti-hooks.mjs")`。hook 对非 `file://` / `.mjs` / `.cjs` / builtin 做 `esmResolve` + `transform`。CLI 会尽量打开 Node compile cache，再 `jiti.import(resolved)`。

### 案例 3：三个入口不是同一个实现

```js
import { createJiti as createDefault } from "jiti"
import { createJiti as createNative } from "jiti/native"
import { createJiti as createStatic } from "jiti/static"
```

默认入口惰性加载 Babel；`jiti/static` 静态 import `dist/babel.cjs`，给 Bun 编译二进制用；`jiti/native` **不转译**，只穷举扩展名后 `import()`。在 native 上调用同步 `jiti()` / `resolve` / `transform` 会抛错。

## 踩过的坑

1. **把 `jiti()` 当当前合同**：同步 require 仍在，但文档和类型都指向 `import()`。`data:` URL 在同步路径直接抛错。

2. **把 `jiti/native` 当成“更快的同一套转译”**：它依赖运行时自己能吃 TypeScript。Node 没有 `--experimental-strip-types` 或等价能力时，这条入口不够。

3. **register hook 认不准 `.tsx`**：`lib/jiti-hooks.mjs` 用 `url.endsWith("ts")` 判断 TS。`.ts` / `.mts` / `.cts` 命中，`.tsx` 不会。JSX 还要另外开 `jsx`。

4. **`interopDefault` 包住所有模块**：属性访问会走 Proxy。热路径可设 `interopDefault: false`。README 里的纳秒开销不是本页测过的数。

5. **磁盘缓存不是永远可写**：`fsCache: true` 先找邻近 `node_modules/.cache/jiti`，否则 `{tmpdir}/jiti`。目录建失败就关掉缓存继续转译。缓存版本常量是 `9`。

## 适用 vs 不适用场景

**适用**：

- 工具要在 Node 里读一份 TS / ESM 配置，又不想先跑完整 `tsc`
- 需要同一套 API 兼顾 CJS require 与 ESM `import()`
- 想用 `jiti/register` 给现有脚本加 TS 入口，且运行时是 Node 20+

**不适用**：

- 把 jiti 当成 `tsc --noEmit`：它擦类型，不做完整类型检查
- 需要浏览器或非 Node 的模块图：求值建立在 `Module` / `createRequire` 上
- 必须用 `.tsx` 走全局 register：固定 hook 的扩展名判断盖不住
- 用未绑定的下载量或 benchmark 倍数做选型

## 固定版本边界

- 本文绑定 `unjs/jiti@fd3bb289...`，annotated tag `v2.7.0`，与 npm `jiti@2.7.0` 的 `gitHead` 一致。
- 条件导出：`.`、`./register`、`./native`、`./static`。CLI 入口 `lib/jiti-cli.mjs`。
- 默认扩展名含 `.js/.mjs/.cjs/.ts/.tsx/.mts/.cts/.mtsx/.ctsx`；`tsconfigPaths` 默认 false；`virtualModules` 给编译进二进制的虚拟模块。
- 未安装依赖、未跑 test / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **加载器的合同是入口，不是“能跑 TS”一句话**——默认包、register、native、static 四条路。
2. **转译和求值是两段**——Babel 只负责源码形状，真正执行在 `vm` 或原生 `import()`。
3. **兼容层有成本**——`interopDefault` 的 Proxy 是默认行为，不是可忽略的实现细节。
4. **失败回落写进源码**——`tryNative`、原生 import 失败、`ENAMETOOLONG` 都有下一条路。

## 应用型自测

1. `createJiti(import.meta.url)("./app.ts")` 和 `await jiti.import("./app.ts")` 走的 `async` 旗标一样吗？
2. 默认 `tryNative` 在普通 Node 进程里是开还是关？
3. `import "jiti/native"` 之后调用同步 `jiti("./x.ts")` 会怎样？

检查点：

1. 不一样。同步调用 `async: false`，`import()` 为 `true`。
2. 关。源码默认是 `"Bun" in globalThis`。
3. 抛 unsupported：native 模式没有同步 require。

## 延伸阅读

- 仓库 README：[unjs/jiti](https://github.com/unjs/jiti)
- 固定源码：[unjs/jiti](https://github.com/unjs/jiti) —— 本文绑定 `fd3bb289b75ed207edfb686d671ed50144f7e90f`
- 审查记录：仓库内 `docs/ts-loader-source-review-20260827-fv.md`
- [[importx]] —— 把 jiti 当成可选 loader 的统一 import 门面
- [[esbuild]] —— tsx / bundle-require 背后常见的另一条转译器

## 关联

- [[importx]] —— 运行时 TS import 的 loader 选择器，默认可回落到 jiti
- [[esbuild]] —— 另一条“当场转译再执行”的实现
- [[swc]] —— Rust 转译器对照，不是这套 Babel 打包合同
- [[vite]] —— 开发服务器里的 TS 转换，不替代 Node 配置加载
- [[bun]] —— `tryNative` 默认打开的运行时
- [[node-js]] —— `module.register` 与 compile cache 的宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[importx]] —— importx — 运行时 TS import 的统一门面
