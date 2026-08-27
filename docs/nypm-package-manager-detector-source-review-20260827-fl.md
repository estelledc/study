# nypm / package-manager-detector source review (writer FL)

> 用途：记录 `nypm` 与 `package-manager-detector` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fl` 标记 2026-08-27 平行 writer FL。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FL
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、lint、bundle 或性能 benchmark，未调用真实 npm / pnpm / yarn / bun / deno / aube / nub
- worktrees：本机 `research-worktrees/nypm` 与 `research-worktrees/package-manager-detector`，不进入 Git
- excluded slugs：未改 `pnpm`、`bun`、`volta`、`lerna`、`nx` 正文语义，也未新增 `ni` / `@antfu/ni` 页面

## nypm

- canonical source：`https://github.com/unjs/nypm`
- revision：`98e209c05c53db85b7f990e4da9487fb3e45f200`
- git tag：annotated `v0.6.9` 解引用到本提交（`chore(release): v0.6.9`）
- package：仓内与 npm latest `nypm@0.6.9`（2026-07-28）均为 `0.6.9`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/types.ts`
  - `src/package-manager.ts`
  - `src/api.ts`
  - `src/cmd.ts`
  - `src/cli.ts`
  - `src/_utils.ts`
  - `README.md`
  - `CHANGELOG.md`（v0.6.9 段）
  - `test/detect.test.ts`
  - `test/_shared.ts`
- observed：
  - npm 未暴露 `gitHead`；身份靠 GitHub annotated tag + 仓内 `version` + npm latest 同号；
  - `"type": "module"`，引擎 `node >= 18`，运行时依赖是 `citty` / `pathe` / `tinyexec`，**没有** `package-manager-detector`；
  - `PackageManagerName` 为 `npm | yarn | pnpm | bun | deno | aube | nub`；`packageManagers` 把 aube / nub 排在 pnpm 前面，避免 `pnpm-workspace.yaml` 误匹配；
  - `detectPackageManager` 先读 `package.json` 的 `packageManager`，再读 `devEngines.packageManager`（对象或数组首项，version 是 semver range），再扫 lockfile / 伴随文件，最后才用 `process.argv[1]` 路径猜 dlx；
  - 实现里 `includeParentDirs` 默认 `true`（`?? true`），与 JSDoc `@default false` 相反；
  - `installDependencies({ frozenLockFile: true })` 把 yarn 一律编成 `install --immutable`，不区分 classic / berry；
  - `dlxCommand` 里 deno 是 `deno run -A`，yarn 是 `yarn dlx`；
  - `executeCommand` 默认给 yarn / pnpm 套 `corepack`；npm / bun / deno / aube / nub 不套；非 TTY stdin 被设成 `ignore`；
  - CLI 子命令是 `install`/`i`/`add`、`remove`/`rm`/`uninstall`/`un`、`detect`、`dedupe`、`run`；`corepack` 默认 `true`。
- provenance：GitHub annotated tag `v0.6.9` 与仓内 / npm `0.6.9` 一致；不把 README 的下载量徽章写成结论。

## package-manager-detector

- canonical source：`https://github.com/antfu-collective/package-manager-detector`
- revision：`1042cf8c004c450b642c9ed3df6a098b5838c050`
- git tag：annotated `v1.8.0` 解引用到本提交（`chore: release v1.8.0`）
- package：仓内与 npm latest `package-manager-detector@1.8.0`（2026-07-21）均为 `1.8.0`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/types.ts`
  - `src/constants.ts`
  - `src/detect.ts`
  - `src/commands.ts`
  - `README.md`
  - `test/detect.spec.ts`
  - `test/command.spec.ts`
- observed：
  - npm 未暴露 `gitHead`；零运行时依赖；导出 `./`、`./detect`、`./commands`、`./constants`；
  - `Agent` 含 `yarn@berry` / `pnpm@6` / `pnpm-rush`，`AgentName` 不含这些修饰；
  - `detect()` 默认 `strategies` 为 `lockfile` → `packageManager-field` → `devEngines-field`；`install-metadata` 不在默认列表；
  - lockfile 策略先认 `rush.json` 为 `{ name: 'pnpm', agent: 'pnpm-rush' }`，再按 `LOCKS` 扫文件；命中 lock 后若 `package.json` 能解析出字段则覆盖；
  - `lookup()` 向上走到文件系统 root **之前**停下，不检查 root 本身；
  - yarn 主版本 > 1 时 `agent` 变成 `yarn@berry` 且 `version` 写成 `'berry'`；pnpm 主版本 < 7 时 `agent` 是 `pnpm@6`；
  - `getUserAgent()` 只读 `process.env.npm_config_user_agent` 的第一段；
  - `resolveCommand` / `constructCommand` 把数组里的数字 `0` 换成调用方 args；`null` 命令返回 `null`（yarn classic / bun / deno 的 `dedupe`，npm 的 `upgrade-interactive`）；
  - yarn classic `frozen` 是 `--frozen-lockfile`，berry 是 `--immutable`；berry `global` 回退到 `npm i -g`；
  - deno `execute` 是 `deno x`，不是 `deno run -A`；nub `execute` 是独立二进制 `nubx`。
- provenance：GitHub annotated tag `v1.8.0` 与仓内 / npm `1.8.0` 一致。
