# Config-discover source review (writer GI)

> 用途：记录 `unconfig` 与 `lilconfig` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gi` 标记 2026-08-27 平行 writer GI，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GI
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test / vitest / jest，未执行 jiti 转译、dynamic `import()`、配置文件或性能 benchmark
- worktrees：本机 `research-worktrees/unconfig` 与 `research-worktrees/lilconfig`（gitignored），不进入 Git
- pair：config-discover；未改 cosmiconfig 或其他候选页

## unconfig

- canonical source：`https://github.com/antfu-collective/unconfig`
- git tag：`v7.5.0`（lightweight）
- revision：`04fb7ab57d616db7a89e8a9c3b14d84b91cb74ea`
- packages：`unconfig@7.5.0`、同提交 `unconfig-core@7.5.0`
- npm：`unconfig@7.5.0` latest，无 `gitHead`；repository 指向本仓 `packages/unconfig`
- license：MIT
- inspected：
  - `package.json`
  - `packages/unconfig/package.json`
  - `packages/unconfig/src/index.ts`
  - `packages/unconfig/src/types.ts`
  - `packages/unconfig/src/presets.ts`
  - `packages/unconfig/src/interop.ts`
  - `packages/core/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/src/types.ts`
  - `packages/core/src/fs.ts`
  - `packages/unconfig/test/run.test.ts`
  - `README.md`
- observed：
  - 公开入口是 `loadConfig` / `loadConfigSync`（`quansync` 双形态）与 `createConfigLoader`；后者返回 `{ load, findConfigs }`；
  - 搜索在 `unconfig-core`：`findUp` 从 `cwd`（默认 `process.cwd()`）向上走，`stopAt` 默认 `path.parse(cwd).root`，**不进入** `stopAt` 目录；`allowSymlinks` 默认 true；
  - 默认扩展是 `mts` / `cts` / `ts` / `mjs` / `cjs` / `js` / `json` / `''`；README 示例顺序与源码默认不一致，以源码为准；
  - `merge: false`（默认）只收第一条能 parse 出结果的 source 的第一个文件；`merge: true` 把 core `multiple` 打开，再用 `defu` 包一层 `{ config }` 做顶层数组合并；先出现的 key 获胜，后到的 source / `defaults` 只补缺；
  - `parser: 'auto'` 先 `JSON.parse`，失败再走 `import`；`import` 用 `jiti`（`fsCache` / `moduleCache` 均为 false，`interopDefault: true`），再经本地 `interopDefault`；
  - `transform` 成功时在同目录写临时文件 `__unconfig_${basename}`，`finally` 里 `unlink`；
  - `rewrite` 返回空值会跳过该文件；core `skipOnError` 默认 false，加载异常会抛出；
  - presets：`sourcePluginFactory` 把目标模块 import 替换成 stub；找不到目标模块时改写为 `export default undefined;`。`sourceVitePluginConfig` 读 `vite.config` 里 `plugin.api.config`。`sourcePackageJsonFields` 固定 `package.json` + JSON parser；
  - `interopDefault`：`default` 为 nullish 时退回整个 module 对象，因此 stub 的 `export default undefined` 可能变成 `{ default: undefined }` 而不是“没找到配置”。
- provenance：
  - GitHub tag `v7.5.0` 解引用到上述 SHA，提交说明为 `chore: release v7.5.0`，仓内 `packages/unconfig/package.json` 与 `packages/core/package.json` 均为 `7.5.0`；
  - npm 未暴露 `gitHead`，身份以 tag + 包版本 + 提交 SHA 对齐。

## lilconfig

- canonical source：`https://github.com/antonk52/lilconfig`
- git tag：`v3.1.3`
- revision：`77d7186c37a3838c85d03e126172f82a8a474ece`
- package：`lilconfig@3.1.3`
- npm `gitHead`：与 revision / tag 一致
- engines：`node >= 14`；零运行时依赖；入口 `src/index.js`（CJS）
- license：MIT
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/index.d.ts`
  - `readme.md`
  - `src/spec/index.spec.js`（loaders / ESM / search 合同）
- observed：
  - 工厂是 `lilconfig(name, options)` 与 `lilconfigSync(name, options)`，返回 `{ search, load, clearLoadCache, clearSearchCache, clearCaches }`；
  - 默认 `searchPlaces`（async）：`package.json`、`.${name}rc.json|.js|.cjs|.mjs`、`.config/${name}rc` 及其 `.json|.js|.cjs|.mjs`、`${name}.config.js|.cjs|.mjs`；sync 构造**去掉所有 `.mjs` 位置**；
  - 默认 `stopDir` 是 `os.homedir()`，不是文件系统根；`search` 会检查 `stopDir` 这一层，然后再停；
  - `package.json` 只有 `packageProp`（默认 `[name]`）取到非 null 才算命中，否则继续下一个 place；
  - `ignoreEmptySearchPlaces` 默认 true：空文件跳过；关掉时 `isEmpty: true` 且 `config: undefined`；
  - 未找到时对 `transform` 传入 `null`，不是空对象；
  - 默认 loaders：async 的 `.js/.mjs/.cjs` 走 `import(fileURL)`，失败再 `require`，并识别 `ERR_REQUIRE_ESM`；sync 的 `.js/.json/.cjs` 走 `require`，`noExt` 与 `.json` 用 `JSON.parse`；**没有**默认 YAML / TypeScript loader；
  - 某个 `searchPlaces` 扩展名缺少 loader 时，在工厂构造期抛错，而不是搜到再失败；
  - `cache` 默认 true：按目录记 search 结果，按绝对路径记 load 结果。
- provenance：
  - npm `lilconfig@3.1.3` 的 `gitHead`、GitHub tag `v3.1.3` 与本地 clone HEAD 三者一致；
  - README 写明对 cosmiconfig 的相关版本是 v3 → cosmiconfig v8，且无开箱 YAML。
