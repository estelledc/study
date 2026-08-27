# Bundler source review (writer DF)

> 用途：记录 Farm、Rsbuild 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer DF
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、e2e、CLI、dev server、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- pages：仓库原先没有 `farm` / `rsbuild` 项目页；本轮按用户指定目标新建 study-v2 页，而不是改写已被其他 writer 占用的 vite/webpack/esbuild/swc/oxc/rolldown/rollup/rspack/bun
- forbidden overlap：未修改 vite、webpack、esbuild、swc、oxc、rolldown、rollup、rspack、turbopack、bun 正文

## Farm

- canonical source：`https://github.com/farm-fe/farm`
- revision：`549e29486b286c7d0488612eacb6bd4ed0884abe`
- release：lightweight tag `v1.7.11` 与该提交同一 SHA（2025-08-27 附近发布记录；npm `@farmfe/core` 1.7.11 时间为 2026-05-28 修改戳，本页以 tag 提交为准）
- package：`@farmfe/core@1.7.11`（`engines.node >=16.15.1`）；同仓库 `@farmfe/cli@1.0.5`（`engines.node >= 16`）
- inspected：
  - `packages/core/package.json`、`packages/cli/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/src/compiler/index.ts`
  - `packages/core/src/plugin/type.ts`
  - `packages/core/src/plugin/js/index.ts`
  - `packages/core/src/plugin/js/vite-plugin-adapter.ts`
  - `packages/core/src/plugin/js/utils.ts`
  - `crates/compiler/src/lib.rs`
  - `crates/compiler/src/build/mod.rs`
  - `crates/compiler/src/generate/mod.rs`
  - `crates/core/src/plugin/mod.rs`
  - `crates/core/src/plugin/plugin_driver.rs`
- observed：
  - Node `Compiler` 把 `config` / `jsPlugins` / `rustPlugins` 交给 NAPI `BindingCompiler`；`compile()` 在 `compiling` 已为真时 `logger.error('Already compiling', { exit: true })`；`update()` 用 `_updateQueue` 串行化并发路径；
  - Rust `Compiler::compile` 为 `plugin_cache_loaded` → `build` → `generate` → `finish` → 写 persistent cache（development 异步，其他同步）；
  - `build` 对每个 `input` 线程化执行 resolve → load → transform → parse → process_module → analyze_deps → finalize_module，再拓扑排序并 `build_end`；
  - `generate` 为 optimize_module_graph → partial_bundling → process_resource_pots → render/generate resources → finalize_resources；
  - 内部插件在 `Compiler::new` 注册后追加外部适配器，再按 `priority` 降序排列；`DEFAULT_PRIORITY = 100`；Vite `enforce` 映射为 pre=101 / 默认 100 / post=98；
  - `resolve`/`load` 为 `hook_first`，`transform` 为串行；JS 侧这三类 hook 带 `filters`；
  - `vitePlugins` 经 `handleVitePlugins` 变成 `VitePluginAdapter`，非空时额外插入 css wrap/unwrap 与 `defaultLoadPlugin`；
  - `start` 设 development 后 `createDevServer.listen`；`build` 设 production 并在编译后 `copyPublicDirectory`；`preview` 要求产物目录存在，默认端口 1911；
  - `writeResourcesToDisk` 去掉 query/hash 后写盘，再执行 JS `writeResources`。
- provenance note：
  - npm `@farmfe/core@1.7.11` 无 `gitHead`；GitHub tag `v1.7.11` 可达且与 `@farmfe/core` 版本字段一致；
  - 同提交存在 `v2.0.0-beta.*` / nightly tag，本页不绑定；
  - `@farmfe/cli@1.0.5` 与 core 版本字段不同，已在正文披露。

## Rsbuild

- canonical source：`https://github.com/web-infra-dev/rsbuild`
- revision：`f274e3eaa08e28f2449d1abd7592c34796072d74`
- release：lightweight tag `v2.2.0` 与该提交同一 SHA（GitHub release 2026-08-26）
- package：`packages/core` 的 `@rsbuild/core@2.2.0`；`engines.node` 为 `^20.19.0 || >=22.12.0`；bin 为 `rsbuild`
- inspected：
  - `packages/core/package.json`
  - `packages/core/src/createRsbuild.ts`
  - `packages/core/src/createCompiler.ts`
  - `packages/core/src/initConfigs.ts`
  - `packages/core/src/pluginManager.ts`
  - `packages/core/src/helpers/version.ts`
  - `packages/core/src/defaultConfig.ts`
  - `packages/core/src/loadConfig.ts`
  - `packages/core/src/types/plugin.ts`
  - `packages/plugin-react/package.json`
- observed：
  - `createRsbuild` 可选 `loadEnv`，注册约 30 个默认插件后再 flatten 用户与 per-environment `plugins`；
  - 实例表面为 `build` / `preview` / `startDevServer` / `createCompiler` / `createDevServer` / `inspectConfig` / `initConfigs` 以及 plugin manager 与生命周期 hook；
  - `initRsbuildConfig` 顺序为 initPlugins → modifyRsbuildConfig → normalizeConfig → 每环境 modifyEnvironmentConfig → validate；`modifyRsbuildConfig` 增删 plugins 只 warn；
  - 未声明 `environments` 时，默认环境名是 `camelCase(output.target)`，默认 target 为 `web`；合法 target 为 `web` / `node` / `web-worker`；node 默认 ESM、关闭 minify、`distPath.js = ''`；
  - `createCompiler` 要求 `rspack.rspackVersion >= 2.0.0`；单配置 `rspack(config)`，多环境 `rspack(configs)` 得到 MultiCompiler；
  - `validatePlugin` 拒绝带 `apply` 的 webpack/Rspack 插件，要求改走 `tools.rspack`；
  - `initConfigs` 不允许切换已绑定的 `context.action`；`preview` 默认检查 dist 存在且非空；`server.base` 必须以 `/` 开头。
- provenance note：
  - npm `@rsbuild/core@2.2.0` 无 `gitHead`；GitHub tag / release 与 `packages/core/package.json` 版本一致；
  - 同提交 `@rsbuild/plugin-react@2.1.0`、`@rsbuild/plugin-solid@2.0.0-beta.2`，不得把 core `2.2.0` 外推到全部插件包。
