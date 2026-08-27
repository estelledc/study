# Unused-dependency scanners source review (writer FX)

> 用途：记录 `knip` 与 `depcheck` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fx` 标记 2026-08-27 平行 writer FX，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FX
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、`--fix`、plugin 探测、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target pair：`knip` + `depcheck`；未改 biome / oxlint / oxc 或其他已对齐页

## Knip

- canonical source：`https://github.com/webpro-nl/knip`
- package path：`packages/knip`
- revision：`fc2733dc18c2e3d300183b9e2fe67d3fa54334fa`
- tag：annotated `knip@6.32.3` 解引用到该提交（"Release 6.32.3"，2026-08-26）
- package：`knip@6.32.3`；license ISC；`engineStrict: true`，`node ^20.19.0 || >=22.12.0`
- npm：latest `6.32.3` 无 `gitHead`；身份以 Git tag + 仓库 `packages/knip/package.json` 为准
- inspected：
  - `packages/knip/package.json`
  - `packages/knip/bin/knip.js`
  - `packages/knip/src/cli.ts`
  - `packages/knip/src/run.ts`
  - `packages/knip/src/index.ts`
  - `packages/knip/src/util/create-options.ts`
  - `packages/knip/src/util/cli-arguments.ts`
  - `packages/knip/src/util/get-included-issue-types.ts`
  - `packages/knip/src/constants.ts`
  - `packages/knip/src/DependencyDeputy.ts`
  - `packages/knip/src/graph/build.ts`
  - `packages/knip/src/graph/analyze.ts`
  - `packages/knip/src/IssueFixer.ts`
  - `packages/knip/src/WorkspaceWorker.ts`
  - `packages/knip/src/plugins/index.ts`
- observed：
  - CLI 主链是 `parseArgs` → `createOptions` → `run` → reporters；`--fix` 在 reporter 之前调用 `IssueFixer.fix`；
  - `run` 组装 `ConfigurationChief` / `DependencyDeputy` / `IssueCollector` / `CatalogCounselor` / `ProjectPrincipal`，再 `build` 图、`analyze` 结算；
  - 配置文件按 `KNIP_CONFIG_LOCATIONS` 搜索；`Object.assign({}, manifest.knip, fileConfig)`，独立配置文件覆盖 `package.json#knip`；
  - `--strict` 会把 `isProduction` 设为 true；production 默认排除 `devDependencies` / `catalog` / `catalogReferences`；
  - 默认不报 `nsExports` / `nsTypes` / `cycles`；`cycles` 的默认 rule 是 `warn`；
  - `DependencyDeputy.isStrict` 只看当前 workspace 的 `dependencies` + required peers，不向祖先 hoist；
  - `IGNORED_DEPENDENCIES` 固定忽略名为 `knip` 和 `typescript` 的 unused 报告（devDependency 与 production 同名时例外）；
  - `--fix` 可删 unused export / dependency / catalog；删 unused files 还要 `--allow-remove-files`；
  - 生成的 `plugins/index.ts` 有 182 个 plugin 模块；`WorkspaceWorker.determineEnabledPlugins` 按配置、祖先和 `plugin.isEnabled` 启用，不是全开；
  - 依赖 `oxc-parser ^0.143.0` 与 `oxc-resolver 11.24.2`，与本站 `oxc` 页绑定的 `0.147.0` 不是同一 revision。
- provenance：
  - GitHub annotated tag `knip@6.32.3` → commit `fc2733dc...`；npm 未提供 `gitHead`。

## depcheck

- canonical source：`https://github.com/depcheck/depcheck`
- revision：`b180e2ec82a7c1413bc29df260561076030b1734`
- tag：lightweight `v1.4.7` 指向该提交
- package：npm `depcheck@1.4.7` 的 `gitHead` 与 tag 一致；仓库内 `package.json` 仍写 `0.0.1`（发布时再改版本）
- license：MIT；`engines.node >= 10`
- GitHub：仓库在审查日为 archived；最新 release 仍是 2023-10-17 的 `v1.4.7`
- inspected：
  - `package.json`
  - `bin/depcheck.js`
  - `src/cli.js`
  - `src/index.js`
  - `src/check.js`
  - `src/constants.js`
  - `src/component.json`
  - `src/utils/configuration-reader.js`
  - `src/special/*.js`（目录清单）
  - `README.md`
- observed：
  - CLI 用 cosmiconfig 读配置，`.js` loader 被设成恒返回 null；需要 `package.json` 存在；
  - 结果只有 unused `dependencies` / `devDependencies`、missing、using、invalidFiles / invalidDirs，没有 unused files / exports；
  - `readdirp` 的 `directoryFilter` 遇到含 `package.json` 的子目录就停，嵌套 package 不会当 monorepo workspace 继续扫；
  - 默认 ignore 含 `node_modules` 与一批媒体/压缩扩展名；未指定 `ignorePath` 时回退 `.depcheckignore` 或 `.gitignore`；
  - parser / detector / special 可插拔；`src/special` 有 19 个模块，`defaultOptions.specials` 取全部 special；
  - TypeScript 文件走 typescript parser，并只在 `@types/foo` 已被声明时把它算作 used；
  - CLI 有问题时 `exit(-1)`；无问题时 `exit(0)`；
  - 源码 `please-upgrade-node` 读的是仓库 `package.json` 的 `engines`，不是 npm 发布元数据本身。
- provenance：
  - npm `gitHead`、Git tag `v1.4.7` 与检出 SHA 一致；仓库 `version` 字段与 npm 版本号不一致，已披露。
