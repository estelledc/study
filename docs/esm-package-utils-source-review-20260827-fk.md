# mlly + pkg-types source review (writer FK)

> 用途：记录 `mlly` 与 `pkg-types` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fk` 标记 2026-08-27 平行 writer FK，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FK
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 vitest / typecheck / lint，未测 bundle 或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：新建 `mlly` 与 `pkg-types`；二者是互补的 UnJS ESM 工具对，不是同一仓库

## mlly

- canonical source：`https://github.com/unjs/mlly`
- tag：`v1.8.2`（peel `c5ce4e5596761b9d2b063bcf82a5160d76e8c2cf`）
- revision：`c5ce4e5596761b9d2b063bcf82a5160d76e8c2cf`
- package：`mlly@1.8.2`（MIT）
- npm：`mlly@1.8.2` latest；`gitHead` 与 tag peel 一致
- dependencies：`acorn`、`pathe`、`pkg-types@^1.3.1`、`ufo`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/resolve.ts`
  - `src/cjs.ts`
  - `src/syntax.ts`
  - `src/eval.ts`
  - `src/analyze.ts`
  - `src/utils.ts`
  - `src/_utils.ts`
  - `test/interop.test.ts`
- observed：
  - `resolve` / `resolvePath` 是对同步 `_resolve` 的 `Promise.resolve` 包装，不是异步 I/O resolver；
  - 默认 `conditions` 为 `node` + `import`，默认补扩展 `.mjs` / `.cjs` / `.js` / `.json`；
  - `createResolve(defaults)` 展开顺序是 `{ url, ...defaults }`，defaults.url 会盖掉第二参数；
  - `interopDefault` 在 default 为可扩展对象或函数时原地挂 named export getter；
  - `isValidNodeImport` 对普通 `.js` 的最终判断是 `!hasESMSyntax`，不是 README 写的“先看 CJS 再看 ESM”；
  - `evalModule` 只做 JSON→default 与 `import.meta.url` 替换，不调用 `resolveImports`；
  - `findStaticImports` / `findExports` 先正则，再用 acorn tokenizer 过滤；acorn 失败则不过滤。

## pkg-types

- canonical source：`https://github.com/unjs/pkg-types`
- tag：`v2.3.1`（peel `6dc514b530123f2e4147727019dba6d128a0754f`）
- revision：`6dc514b530123f2e4147727019dba6d128a0754f`
- package：`pkg-types@2.3.1`（MIT）
- npm：`pkg-types@2.3.1` latest；tarball 未暴露 `gitHead`，身份按 tag + 包版本 + SHA
- exports：仅 `./dist/index.mjs`，无 CJS 入口
- dependencies：`confbox`、`exsolve`、`pathe`
- also observed：mlly 1.8.2 仍依赖 `pkg-types@^1.3.1`，不是本页绑定的 2.3.1
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/resolve/utils.ts`
  - `src/resolve/internal.ts`
  - `src/packagejson/utils.ts`
  - `src/tsconfig/utils.ts`
  - `src/gitconfig/utils.ts`
  - `test/index.test.ts`
- observed：
  - `findFile` 默认 `rootPattern=/^node_modules$/`，向上搜到 `node_modules` 段即停；
  - `readPackage` 认 `package.json` / `.json5` / `.yaml`；`readPackageJSON` 只找 `package.json`，JSON 失败再走 JSONC；
  - `options.cache` 为真才读缓存；写入仍落到模块级 `FileCache`；
  - `findWorkspaceDir` 默认顺序：最远 workspace 文件 → 最近 `.git/config` → 最远 lockfile → 最远 package 文件；
  - `updatePackage` 用 Proxy 在访问 `scripts` / dependency map 时自动建空对象；
  - `sortPackage` / `normalizePackage` 返回新对象；后者会删掉非普通对象的 dependency 字段。
