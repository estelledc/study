# unrun + bundle-require source review (writer GF)

> 用途：记录 `unrun` 与 `bundle-require` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gf` 标记 2026-08-27 平行 writer GF。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GF
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test / CLI / register hook / bundle / 性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：本轮新增 `unrun` 与 `bundle-require`；仓库里原先没有这两页

## bundle-require

- canonical source：`https://github.com/egoist/bundle-require`
- tag：`v5.1.0`（lightweight tag，对象类型是 commit）
- revision：`8ca47fef6353369bc3b49d7ef73fdad239355f0c`
- package：npm `bundle-require@5.1.0` latest，`gitHead` 与 tag 同指此提交
- repo `package.json` version：`0.0.0-semantic-release`（发布版本以 npm / tag 为准）
- peer：`esbuild >= 0.18`；runtime dep：`load-tsconfig ^0.2.3`
- engines：`^12.20.0 || ^14.13.1 || >=16.0.0`
- inspected：
  - `README.md`
  - `package.json`
  - `src/index.ts`
  - `src/utils.ts`
  - `test/index.test.ts`
  - `test/fixture/**`
- observed：
  - `bundleRequire` 用 esbuild `bundle: true` + `write: false` 打进内存，再写到源文件旁的 `.bundled_{randomId}.{mjs|cjs}`，加载后默认删除；
  - 扩展名必须匹配 `/\.([mc]?[tj]s|[tj]sx)$/`；
  - `guessFormat`：`.ts` / `.mts` / `.mjs` 走 ESM，`.js` 看邻近 `package.json` 的 `type`，其余 CJS；Jest 环境强制 CJS 并改走 `require`；
  - `externalPlugin` 默认把 `node_modules` 与 bare specifier 标 external；入口已在 `node_modules` 时 `externalNodeModules` 默认 false；`tsconfig` paths 进入 `notExternal` 才会被打进产物；
  - `injectFileScopePlugin` 用 `define` 把 `__dirname` / `__filename` / `import.meta.url` 换成注入变量，再在 `onLoad` 写入源文件路径；
  - 返回 `{ mod, dependencies }`，依赖来自 `metafile.inputs`。
- provenance：
  - Git tag `v5.1.0` 与 npm `gitHead` 一致且可达；
  - 源码仓 version 字段不是 `5.1.0`，已披露。

## unrun

- canonical source：`https://github.com/Gugustinette/unrun`
- tag：`v0.3.1`（annotated tag）
- revision：`b1e8952e03f9f690ee0fc9f81fdc06d654617b6a`
- package：npm `unrun@0.3.1` latest；**npm 未发布 `gitHead`**，身份以 annotated tag + package version + 可达 SHA 为准
- dependency：`rolldown ^1.0.0`；optional peer：`synckit ^0.11.11`（`unrunSync` 需要）
- engines：`^22.13.0 || >=24.0.0`
- exports：只暴露 `./dist/index.mjs` 与 `./package.json`；CLI `dist/cli.mjs`
- inspected：
  - `README.md`
  - `package.json`
  - `src/index.ts`
  - `src/options.ts`
  - `src/types.ts`
  - `src/cli.ts`
  - `src/features/preset.ts`
  - `src/features/external.ts`
  - `src/utils/bundle.ts`
  - `src/utils/module/{load,write,exec,clean}-module.ts`
  - `src/sync/worker.ts`
  - `src/plugins/source-context-shims.ts`
  - `docs/guide/getting-started.md`
  - `docs/advanced/presets.md`
- observed：
  - `unrun()` = `resolveOptions` → rolldown `generate` → 写临时 `.mjs` → `import()` → `preset` 后处理；
  - 默认 `preset: "none"` 会解包 `default`；`bundle-require` preset 返回整个 namespace；`jiti` preset 另加 console / JSON / `typeof require` 插件，并处理空 Module namespace；
  - 临时文件优先 `node_modules/.unrun/`，失败回落 OS tmp，再失败才 `data:` URL；`debug` 不删除；
  - `unrunCli` 用子进程 `spawn(process.execPath)` 执行，并转发 SIGINT / SIGTERM / SIGQUIT；
  - `unrunSync` 经 synckit worker 调 `unrun`，`cloneForTransfer` 遇到函数会抛错；
  - tsconfig 只在 `process.cwd()/tsconfig.json` 存在时挂上，不是按入口目录找；
  - external 规则：builtin 永远外部；能从入口向上走到的 `node_modules/<pkg>` 保持外部，否则内联。
- provenance：
  - annotated tag `v0.3.1` 指向上述可达提交；
  - npm 无 `gitHead`，未猜测或伪造。

## 共享边界

- 两页都是 `STATIC_REVIEW` / `STATIC_ANALYSIS` / `UNVERIFIED`。
- 仓库内 `benchmark/results.json` 与 npm 下载量徽章都不是本轮测量结果，笔记不得写成已验证性能。
- jiti / tsx 只作为对照名字出现，本轮不绑定它们的 revision。
