# Lerna / pnpm source review

> 用途：记录 lerna、pnpm 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DY
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、CLI、install、publish、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- pair selection：目标本是 leftover `lerna` + `nx`；`nx` / `turborepo` 已被其他 PR 占用，`moonrepo` 无既有项目页。按 fallback 绑定同主题 leftover `lerna` + `pnpm`，未新建页面。

## lerna

- canonical source：`https://github.com/lerna/lerna`
- revision：`35d15a1567932be97759f512d8b8033dad72b411`
- git tag：`v10.0.1`（annotated tag object `19e7ddf297ae81477c2da099f303a7d476af39c8`）
- package：`lerna@10.0.1`
- inspected：
  - `README.md`
  - `package.json`
  - `lerna.json`
  - `packages/lerna/package.json`
  - `packages/lerna/src/cli.ts`
  - `packages/lerna/src/index.ts`
  - `packages/lerna/src/utils/detect-projects.ts`
  - `libs/core/src/lib/cli.ts`
  - `libs/core/src/lib/project/index.ts`
  - `libs/core/src/lib/toposort-projects.ts`
  - `libs/core/src/lib/cycles/report-cycles.ts`
  - `libs/commands/init/src/index.ts`
  - `libs/commands/run/src/index.ts`
  - `libs/commands/publish/src/index.ts`
  - `website/docs/legacy-package-management.md`
- observed：
  - published package is ESM; `bin.lerna` is `dist/cli.js`; engines are `^22.13.0 || ^24.0.0 || ^26.0.0`;
  - runtime depends on `nx` / `@nx/devkit` `>=23.1.0 < 24.0.0`; CLI sets `NX_ISOLATE_PLUGINS=false` and `NX_TUI=false`;
  - commands include version, publish, run, exec, changed, list, init, create, import, clean, diff, info, watch, repair, add-caching;
  - `add` / `bootstrap` / `link` are stub handlers that log removal-in-v9 and `process.exit(1)`;
  - package discovery prefers `lerna.json` `packages`, else pnpm `pnpm-workspace.yaml` when `npmClient=pnpm`, else root `package.json` `workspaces`; `useWorkspaces` is a hard error;
  - `version === "independent"` is independent mode; any other string is fixed mode;
  - `lerna init` writes `$schema` + `version` (`0.0.0` or `independent`); empty repo also writes `workspaces: ["packages/*"]` or a pnpm workspace file; existing repo without workspaces/`--packages` fails;
  - `lerna run` uses Nx `runMany` / `runOne` unless `useNx === false`;
  - publish defaults `toposort` unless `--no-sort`; `runProjectsTopologically` receives `rejectCycles`;
  - `--reject-cycles` has no truthy default; cycles warn `ECYCLE` and are batched together unless the flag is set, in which case they throw.
- provenance：
  - Git tag `v10.0.1` and npm `lerna@10.0.1` share `gitHead` `35d15a1567932be97759f512d8b8033dad72b411`;
  - identity is tag + package version + commit SHA.

## pnpm

- canonical source：`https://github.com/pnpm/pnpm`
- revision：`cef4816dfbc9aa7ffbe67fa727c1eb9be5d5e1e7`
- git tag：`v11.24.0`（annotated tag object `fbc63e680b4fedba9daa219e90319e00eeaf4fa6`）
- package：`pnpm@11.24.0` from workspace directory `pnpm11/pnpm`
- inspected：
  - `README.md`
  - `package.json`
  - `Cargo.toml`
  - `pnpm-workspace.yaml`
  - `pnpm11/pnpm/package.json`
  - `pnpm11/pnpm/bin/pnpm.mjs`
  - `pnpm11/core/constants/src/index.ts`
  - `pnpm11/store/path/src/index.ts`
  - `pnpm11/store/pkg-finder/README.md`
  - `pnpm11/store/create-cafs-store/src/index.ts`
  - `pnpm11/resolving/npm-resolver/src/index.ts`
  - `pnpm11/workspace/projects-graph/src/index.ts`
  - `pnpm11/store/commands/src/store/storeStatus/extendStoreStatusOptions.ts`
- observed：
  - published npm package is the TypeScript-bundled CLI at `pnpm11/pnpm`; `bin` exposes `pnpm` / `pn` → `bin/pnpm.mjs` and `pnpx` / `pnx`; engines are `node >=22.13`;
  - `bin/pnpm.mjs` warns on Node 20 and exits on Node `<22.13`, then dynamically imports `dist/pnpm.mjs`;
  - workspace also contains experimental Rust CLI crates under `pnpm/` / `pnpr/` (README calls this pacquet); this note does not treat that port as the published `pnpm@11.24.0` entry;
  - `STORE_VERSION` and `GLOBAL_LAYOUT_VERSION` are `v11`; lockfile constants are `pnpm-lock.yaml` / major `9` / `9.0`; `LAYOUT_VERSION` is `5`;
  - default store is `path.join(pnpmHomeDir, "store", "v11")` when the project can hardlink to the home volume; otherwise it falls back to `<mount>/.pnpm-store/v11`;
  - CAFS files live under `files/<digest[:2]>/...`; import methods include `auto | hardlink | copy | clone | clone-or-copy`;
  - `nodeLinker` values are `isolated | hoisted | pnp`; store-status default is `isolated`;
  - `workspace:` specs are resolved against workspace packages and throw `WORKSPACE_PKG_NOT_FOUND` when the name is absent; `workspace:./` and `workspace:../` path forms are treated as local directory specs;
  - npm metadata for `pnpm@11.24.0` has no `gitHead`.
- provenance：
  - Git tag `v11.24.0` and npm `pnpm@11.24.0` identify the same reachable revision;
  - npm does not publish `gitHead`; identity is tag + package version + commit SHA.
