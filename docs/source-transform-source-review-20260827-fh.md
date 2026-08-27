# Source-transform pair source review (writer FH)

> 用途：记录 `magic-string` 与 `magicast` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fh` 标记 2026-08-27 平行 writer FH。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FH
- evidence：GitHub release/tag metadata、npm latest 包元数据、固定提交静态源码与测试阅读
- evidence type：`STATIC_REVIEW` / 正文 `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 vitest / tsdown / vendor clone，未测 bundle、sourcemap 正确性或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- target originally assigned：`magic-string` + `magicast`
- fallback used：none。Study 清单原先没有这两页；本轮按调用方指定目标新建，而不是改写已占用的 bundler / markdown / linter 页。

## 选题

- 两者都是“改源码再吐出文本”的库，但落点不同：`magic-string` 按原文下标改字符串并生成 sourcemap；`magicast` 把 JS/TS 解析成 AST，再用 Proxy 当 JSON 改，再 print 回去。
- 清单里没有 `recast` / `astring` / `jscodeshift` 可作现成对照页；`swc` / `esbuild` / `rollup` 体量更大且已被其他平行 PR 或既有页占用。
- 两仓都小（blob-filtered clone 约 1.7MB / 3.2MB），tag 可达，适合 STATIC_REVIEW。

## magic-string

- canonical source：`https://github.com/Rich-Harris/magic-string`
- revision：`5473bfb5138e7b7c2fc91d964c0425f57f1470ce`
- package：`magic-string@1.2.3`
- license：MIT
- provenance：
  - annotated tag `v1.2.3` → tag object `80a617452505a3636917f41a53ece523c2833056` → peeled commit `5473bfb5...`
  - 该提交 `package.json` 版本为 `1.2.3`；commit message 为 `chore: release v1.2.3`
  - GitHub release `v1.2.3` 发布于 2026-08-26，与 npm latest `1.2.3` 对齐
  - npm `magic-string@1.2.3` 未暴露 `gitHead`；绑定可达的 peeled tag
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/MagicString.ts`
  - `src/Chunk.ts`
  - `src/Bundle.ts`
  - `src/SourceMap.ts`
  - `src/MagicStringError.ts`
  - `src/utils/Mappings.ts`（只核到 generateDecodedMap 调用面）
- observed：
  - ESM-only：`type: module`，发布入口 `./dist/index.mjs`；运行时依赖只有 `@jridgewell/sourcemap-codec`
  - 无 `engines` 字段
  - 构造时整段原文落成一个 `Chunk(0, length, string)`；`byStart` / `byEnd` 用 Map 索引
  - `update` / `overwrite` / `remove` / `move` / `appendLeft` / `prependRight` 的下标先加 `this.offset`，再相对 `original`
  - `prepend` / `append` 写入实例级 `intro` / `outro`，不进入 `length()`；`length()` 只累加各 chunk 的 intro+content+outro
  - `update()` 默认 `overwrite: false`（保留该 range 上已有 append/prepend）；`overwrite()` 转调 `update(..., { overwrite: !contentOnly })`
  - 零长度 range 的 `update`/`overwrite` 抛 `cannot overwrite a zero-length range`
  - 负下标在 `original.length !== 0` 时用 `Math.max(0, index + length)` 夹一次，不再反复回绕
  - `replace` / `replaceAll` 始终匹配 `original`；零长度匹配走 `appendRight`，避免 `overwrite` 零长度
  - `replaceAll` 的 RegExp 必须带 `g`，否则抛 `MagicStringError`
  - `move()` 在 `hasMovedChunks` 为真时会走一遍 `[start, end]` 连续性检查，避免先前 move 把区间拆开后形成环
  - `insert` / `insertLeft` / `insertRight` 已废弃；`insert()` 直接 throw
  - `generateMap` 产出 v3 SourceMap，`mappings` 由 `@jridgewell/sourcemap-codec` encode；`toUrl()` 需要 `btoa` 或 `Buffer`
  - `Bundle` 默认 `separator` 为 `'\n'`；`toString` / `generateDecodedMap` / `isEmpty` / `length` 都按“第 0 个源后面才加 separator”对齐
  - 错误类型是 `MagicStringError`，消息统一加 `[MagicString]` 前缀

## magicast

- canonical source：`https://github.com/unjs/magicast`
- revision：`ea6470cbfcd86156760aeca53b81c2ee1629dcee`
- package：`magicast@0.5.4`
- license：MIT
- provenance：
  - annotated tag `v0.5.4` → tag object `69badc124c53c98c4c1bff44431b8992c8113eed` → peeled commit `ea6470cb...`
  - 该提交 `package.json` 版本为 `0.5.4`；commit message 为 `chore: release v0.5.4`
  - GitHub release `v0.5.4` 发布于 2026-07-31，与 npm latest `0.5.4` 对齐
  - npm `magicast@0.5.4` 未暴露 `gitHead`；绑定可达的 peeled tag
- inspected：
  - `package.json`
  - `README.md`
  - `tsdown.config.ts`
  - `scripts/vendor.ts`
  - `src/index.ts`
  - `src/core.ts`
  - `src/code.ts`
  - `src/file.ts`
  - `src/babel.ts`
  - `src/builders.ts`
  - `src/format.ts`
  - `src/error.ts`
  - `src/proxy/module.ts`
  - `src/proxy/proxify.ts`
  - `src/proxy/object.ts`
  - `src/proxy/exports.ts`
  - `src/proxy/function-call.ts`
  - `src/proxy/imports.ts`
  - `src/proxy/types.ts`
  - `src/helpers/config.ts`
  - `src/helpers/vite.ts`
- observed：
  - 运行时依赖：`@babel/parser`、`@babel/types`、`source-map-js`；`recast` / `ast-types` 不在 `dependencies`，由 `prepare` 的 `scripts/vendor.ts` 拉 `recast@0.23.18` 与 `ast-types@0.16.1`，再经 `tsdown` alias 打进 dist
  - vendor 补丁会把 recast 的 `tiny-invariant` 换成空操作，并去掉默认 esprima parser
  - 主入口 `src/index.ts` 再导出 `file`（`loadFile` / `writeFile`）；浏览器/worker 应走 `magicast/core`
  - `parseModule`：`recast.parse` + `getBabelParser()`（`sourceType: "module"`，插件含 typescript / jsx / decorators-legacy 等）→ `proxifyModule`
  - 模块代理只暴露 `imports` / `exports` / `generate`；`generate(options)` 才是实例方法，不是 README 示例里的 `generateCode()`
  - `proxify` 只覆盖对象、数组、调用、箭头/函数表达式、`new`、标识符、逻辑/成员/二元/await、块，以及剥掉 `TSAsExpression` / `TSSatisfiesExpression`；其余类型抛 `MagicastError: Casting "…" is not supported`
  - `export default defineConfig({...})` 的 default 代理 `$type === "function-call"`，配置对象在 `$args[0]`
  - `writeFile(node, filename)` 的 `filename` 在源码里是必参；实现先取出 `$ast` 再 `generateCode(ast)`，因此走不到 `detectCodeFormat(node.$code)` 那条分支，格式更多依赖 recast 挂在 AST 上的原始 token
  - 空对象 `{ /* comment */ }` 新增属性时，会把 `innerComments` 挪到第一个新 property 的 leading comments（0.5.4 修复）
  - `builders.raw` 对“整段都是注释”的输入会改成 `code + "\nnull"` 再 parse，避免 Babel 把 `/` 当成正则（0.5.4 修复）
  - helpers（`addVitePlugin` / `addNuxtModule` / `deepMergeObject`）从 `magicast/helpers` 导出，源码与 README 都标成实验面
  - README 写明不能覆盖全部动态 JS，建议 `try/catch`

## 未执行

- 未 `pnpm install` / `pnpm test` / `pnpm build` 任一上游
- 未运行 `scripts/vendor.ts` 或重新打包 recast
- 未在 Node / 浏览器里调用 `generateMap` / `writeFile`
- 未测量 sourcemap 体积、print 保真或吞吐
