---
title: magicast — 把 JS/TS 源码当 JSON 一样改，再写回去
description: 把 JS/TS 源码当 JSON 一样改，再写回去
来源: https://github.com/unjs/magicast
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/magicast
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ea6470cbfcd86156760aeca53b81c2ee1629dcee
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.5.4
---

## 是什么

magicast 让你用读 JSON 的手感改一份 JavaScript / TypeScript 文件：先 parse 成 AST，再给节点套 Proxy，最后 print 回源码。日常类比：不是拿刀按页码划掉几个字（那是 [[magic-string]]），而是把配置文件变成可以 `.foo.push("b")` 的对象，改完再打印回文件。

```js
import { parseModule, generateCode } from "magicast"

const mod = parseModule(`export default { foo: ["a"] }`)
mod.exports.default.foo.push("b")
const { code } = generateCode(mod)
```

固定 `0.5.4` 的运行时依赖是 `@babel/parser`、`@babel/types` 和 `source-map-js`。`recast` 与 `ast-types` 不在 `dependencies` 里：`prepare` 脚本把它们 vendor 进来，再由 `tsdown` alias 打进发布物。

## 为什么重要

不按固定源码读 magicast，下面这些印象会对不上：

- 为什么 `export default defineConfig({ foo: 1 })` 不能直接读 `mod.exports.default.foo`，而要先看 `$type`
- 为什么浏览器里不能从主入口 `import { parseModule } from "magicast"`
- 为什么 README 里的 `mod.generateCode()` 在类型和实现里其实叫 `mod.generate()`
- 为什么“像改 JSON”并不能覆盖任意语法

## 核心要点

固定 0.5.4 的主链可以拆成四步：

1. **parse 用 Babel，print 用 vendored recast**：`parseModule` 默认 `getBabelParser()`，`sourceType: "module"`，插件包含 TypeScript、JSX、`decorators-legacy` 等。parser 的目标是尽量吞下语法，而不是替你做 lint。

2. **模块代理只有三扇门**：`proxifyModule` 把 `ownKeys` 收成 `imports` / `exports` / `generate`。实例方法是 `generate(options)`，顶层函数才是 `generateCode(node, options)`。

3. **Proxy 只认识一部分节点**：对象、数组、调用、`new`、箭头/函数表达式、标识符、逻辑/成员/二元/await、块，以及剥掉的 `TSAs` / `TSSatisfies`。其它类型抛 `MagicastError: Casting "…" is not supported`。

4. **写回文件是另一条入口**：`loadFile` / `writeFile` 在主包，不在 `magicast/core`。`writeFile(node, filename)` 的文件名是必参；实现会先取出 `$ast` 再 print，因此走不到按 `$code` 侦测引号/分号的那条分支，格式更多依赖 recast 留在 AST 上的原始 token。

## 实践示例

### 案例 1：改 default export 对象

```js
import { parseModule, generateCode } from "magicast"

const mod = parseModule(`export default {\n  foo: ["a"],\n}\n`)
mod.exports.default.foo ||= []
mod.exports.default.foo.push("b")
const { code } = generateCode(mod)
```

`exports.default` 对裸对象会给出 `$type: "object"` 的 Proxy，属性读写会改 AST 上的 `properties`。空对象里原来的 `innerComments` 在第一次加属性时会被挪到新 property 的 leading comments，避免注释在 reprint 时丢掉。

### 案例 2：`defineConfig` 包一层时先认 `$type`

```js
const mod = parseModule(`export default defineConfig({ foo: "bar" })`)
const options = mod.exports.default.$type === "function-call"
  ? mod.exports.default.$args[0]
  : mod.exports.default
options.foo // "bar"
```

`CallExpression` 被 proxify 成 `$type: "function-call"`，参数在 `$args`。helpers 里的 `getDefaultExportOptions` 也是这一层：调用就取 `$args[0]`，否则整段当配置。

### 案例 3：读文件、改 import、再写回去

```js
import { loadFile, writeFile } from "magicast"

const mod = await loadFile("vite.config.ts")
mod.imports.$prepend({ from: "vite-plugin-foo", imported: "default", local: "foo" })
await writeFile(mod, "vite.config.ts")
```

主入口才带文件系统。浏览器或 worker 应 `import { parseModule } from "magicast/core"`。helpers 里的 `addVitePlugin` 会改 default export 的 `plugins` 数组，并 `$prepend` 一条 import；那是实验面，不在本页当稳定合同。

## 踩过的坑

1. **把 README 的 `mod.generateCode()` 抄进代码**：模块上的方法是 `generate`；`generateCode` 是具名导出。
2. **`writeFile(mod)` 只传一个参数**：源码第二参 `filename` 必填。
3. **对任意语句做 `mod.exports.default.xxx`**：不支持的 AST 类型会抛 `MagicastError`，并在有 `loc` 时附一段 code frame。
4. **以为 recast 是普通 npm 运行时依赖**：发布物靠 vendor + bundler alias；`prepare` 还会把 recast 的 invariant 换成空操作。
5. **把 helpers 当成稳定 API**：`magicast/helpers` 自己写明可能再拆包。

## 适用 vs 不适用场景

**适用**：

- 改“差不多是静态配置”的 JS/TS，例如 `defineConfig({...})`、导出对象、增删 import
- 需要尽量保住原文件的引号、缩进和注释，而不是 prettier 重排整份文件
- 和 [[magic-string]] 对照：一个按字符下标，一个按语法节点

**不适用**：

- 任意动态代码、计算属性、复杂语句——Proxy 合同盖不住
- 需要在浏览器里读盘：主入口依赖 `node:fs`
- 要把“像改 JSON”升级成类型检查或完整 codemod 框架
- 未运行证据：本文没有执行 `writeFile` 或上游测试

## 固定版本边界

- 本文绑定 `unjs/magicast@ea6470cbfcd86156760aeca53b81c2ee1629dcee`。annotated tag `v0.5.4` 解引用到该提交；`package.json` 为 `0.5.4`。npm 未暴露 `gitHead`。
- 0.5.4 相对 0.5.3 的可见修复：空对象新增属性时保留 inner comment；`builders.raw` 能消化整段注释。
- vendor 钉在 `recast@0.23.18` / `ast-types@0.16.1`；未重新执行 clone 或打包。
- 未安装依赖、未跑 vitest，状态保持 `UNVERIFIED`。

## 学到什么

1. **“像 JSON”是 Proxy 表面，底下仍是 Babel AST + recast print**。
2. **default export 可能是对象，也可能是函数调用**——先看 `$type` 再取字段。
3. **主包和 `./core` 的差别是有没有文件系统**，不是 parse 算法不同。
4. **vendor 补丁属于发布合同**：invariant 被关掉，是为了打包后 class identity 不再能做 `instanceof` 断言。

## 应用型自测

1. `export default defineConfig({ plugins: [] })` 时，`mod.exports.default.plugins` 直接存在吗？
2. 在 Worker 里该从哪个入口 `import { parseModule }`？
3. 模块实例上用来出码的方法名是 `generate` 还是 `generateCode`？

检查点：

1. 不直接存在。`$type` 是 `function-call`，配置在 `$args[0]`。
2. `magicast/core`。主入口会带上 `node:fs`。
3. `generate`。`generateCode` 是顶层函数。

## 延伸阅读

- 固定源码：[unjs/magicast](https://github.com/unjs/magicast) —— 本文绑定 `ea6470cbfcd86156760aeca53b81c2ee1629dcee`
- 审查记录：仓库内 `docs/source-transform-source-review-20260827-fh.md`
- [[magic-string]] —— 同主题的下标改写对照
- [[vite]] —— helpers 试图改的配置文件形态

## 关联

- [[magic-string]] —— 不 parse，按下标补丁
- [[vite]] —— `addVitePlugin` 的目标配置
- [[oxc]] —— 完整 compiler AST，不是 Proxy 糖
- [[swc]] —— 另一条 transform 管线
- [[rollup]] —— 更常直接消费 MagicString

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
