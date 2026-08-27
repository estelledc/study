# Config loader source review (writer FC)

> 用途：记录 `cosmiconfig` 与 `c12` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fc` 标记 2026-08-27 平行 writer FC，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FC
- evidence：GitHub release/tag metadata、npm 版本与 `gitHead`、固定提交静态源码与 changelog 阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、dotenv 写入、giget 克隆或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- fallback unused：目标页原先不存在，本轮按用户指定新增 `cosmiconfig` / `c12`，未改用其他配置加载器对

## cosmiconfig

- canonical source：`https://github.com/cosmiconfig/cosmiconfig`
- package：`cosmiconfig@10.0.0`
- tag：`v10.0.0`（annotated object `88918efd...` 剥到下列 commit）
- revision：`014687e689b04c34d72fa89997f8c6c3bdcf5756`
- npm：`10.0.0` latest，`gitHead` 与 tag 剥出提交一致
- license：MIT
- engines：`^22.18 || >= 24`
- also observed：GitHub latest *release* 仍是 `v9.0.1`；存在 tag `v10.0.0` 但没有同名 Release 对象。本审查绑定 npm latest 与可达 tag，不回退到 9.0.1
- inspected：
  - `package.json`
  - `CHANGELOG.md`
  - `src/index.ts`
  - `src/defaults.ts`
  - `src/types.ts`
  - `src/ExplorerBase.ts`
  - `src/Explorer.ts`
  - `src/ExplorerSync.ts`
  - `src/loaders.ts`
  - `src/merge.ts`
  - `src/util.ts`
- observed：
  - 默认 `searchStrategy` 在未传 `stopDir` 时是 `'none'`，只查起点目录；传了 `stopDir` 才默认 `'global'`；
  - `'project'` 往上走到 `package.json` / `package.yaml`；`'global'` 走到 `stopDir` 或 `os.homedir()`，再查 `env-paths(moduleName).config`；
  - 异步默认 searchPlaces 含 `.mjs`；同步 loaders / searchPlaces 不含 `.mjs`；
  - `package.json` 只取 `packageProp ?? moduleName`；缺属性返回 `null` 并继续搜；
  - `loadJs` 先 `import(realpath file URL).default`，失败再清 `require.cache` 后 `require`；
  - TypeScript 走 Node 自身 type stripping，不再依赖 `typescript` 包；`enum` / `namespace` 等不可擦语法不支持；
  - `$import` 把被引入文件当基底，`mergeAll` 跳过 `__proto__` / `constructor`；
  - 元配置只在 cwd 用 `searchStrategy: 'none'` 读 `package.json` / `package.yaml` / `.config/config.*`，禁止写 `loaders` 或 `searchStrategy`；
  - JSON 直接 `JSON.parse`；YAML 懒加载 `js-yaml`；UTF-16 LE/BE BOM 会改解码。

## c12

- canonical source：`https://github.com/unjs/c12`
- package：`c12@3.3.4`（仓内 `package.json` 同号）
- tag：`v3.3.4`（annotated object `9fd455f3...` 剥到下列 commit）
- revision：`49ef83ce30492e512b88326c8cacc8d06a8ba8ec`
- npm：`3.3.4` 的 `gitHead` 与 tag 剥出提交一致
- license：MIT
- also observed：npm latest 是 `4.0.0-beta.5`（`gitHead=91791cba...`）；本审查绑定最新稳定 3.3.4，不猜测 beta 合同
- inspected：
  - `package.json`
  - `CHANGELOG.md`
  - `README.md`
  - `src/index.ts`
  - `src/types.ts`
  - `src/loader.ts`
  - `src/dotenv.ts`
  - `src/watch.ts`
- observed：
  - `loadConfig` 默认 `name: "config"`，主文件是 `config` 或 `${name}.config`，rc 是 `.${name}rc`；
  - 主文件解析顺序：cwd 文件 → `.config/` 去后缀 → `.config/` 原名；扩展名经 jiti / confbox；
  - `dotenv` 与 `packageJson` 默认关闭；`globalRc` 才把 workspace / home rc 并进同一份 rc 源；
  - 合并默认 `defu`，顺序 overrides → main → rc → packageJson → defaultConfig，再叠 `defaults`；
  - 主配置若导出数组，直接采用，不 merge / 不 extend；
  - `extends` 默认真，字符串 / 数组 / `{source,options}`；`gh:` / `github:` / `gitlab:` / `bitbucket:` / `http(s):` 走 giget；
  - `envName` 默认 `process.env.NODE_ENV`，把 `$<env>` 与 `$env[env]` 叠到该层之上；
  - dotenv 默认插值、跳过 `_` 前缀键，已存在的进程环境不被覆盖（除非该键先前由 c12 dotenv 写入）；
  - `watchConfig` 基于 `loadConfig` + chokidar，默认 debounce；home/workspace rc 尚未列入 watchingFiles。
