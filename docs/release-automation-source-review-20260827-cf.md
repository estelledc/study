# Release automation source review

> 用途：记录 changesets、semantic-release 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL CF
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试/示例阅读
- not executed：未安装两仓依赖，未运行上游 test、未执行 `changeset` / `semantic-release` CLI、未对 registry 发版、未测量 bundle
- worktrees：本机 `research-worktrees/`，不进入 Git

## changesets

- canonical source：`https://github.com/changesets/changesets`
- revision：`bed458124f623463c581521ab56d040eba2a8b20`
- package：`@changesets/cli@3.0.1`
- provenance：GitHub 轻量 tag `@changesets/cli@3.0.1` 指向该 commit；`packages/cli/package.json` 自报 `3.0.1`。npm 该版本不暴露 `gitHead`，因此绑定可达 tag 提交，而不是猜测 packument 源。
- inspected：
  - `packages/cli/package.json`
  - `packages/cli/src/cli.ts`
  - `packages/cli/src/index.ts`
  - `packages/cli/src/commands/add/createChangeset.ts`
  - `packages/write/src/index.ts`
  - `packages/config/src/defaults.ts`
  - `packages/config/src/config.ts`
  - `packages/assemble-release-plan/src/index.ts`
  - `packages/assemble-release-plan/src/flatten-releases.ts`
  - `packages/assemble-release-plan/src/determine-dependents.ts`
  - `packages/assemble-release-plan/src/increment.ts`
  - `packages/apply-release-plan/src/index.ts`
  - `packages/get-dependents-graph/src/index.ts`
- observed：
  - `@changesets/cli` is ESM (`"type": "module"`) with engines `node: ^22.11 || ^24 || >=26` and a `changeset` bin;
  - `cac` registers `add` as the default command (`alias "!"`), plus `init` / `version` / `publish` / `publish-plan` / `pack` / `status` / `git-tag` / `pre`;
  - `writeChangeset` still names files with `human-id` (`separator: "-"`, `capitalize: false`) under `.changeset/<id>.md`;
  - written config defaults include `baseBranch: "main"`, `access: "restricted"`, `format: "auto"`, `updateInternalDependencies: "patch"`, `commit: false`, and changelog `@changesets/cli/changelog`;
  - `assembleReleasePlan` flattens changesets by taking the highest bump (`major > minor > patch > none`), then loops `determineDependents` / `matchFixedConstraint` / `applyLinks` until stable;
  - dependents of `dependencies` / `optionalDependencies` / `peerDependencies` get a patch only when the calculated new version would leave the declared range, unless experimental `updateInternalDependents === "always"`; `devDependencies` stay `none` so ranges can update without a version bump;
  - snapshot versions default to `0.0.0-<tag?>-<datetime>` unless `snapshot.useCalculatedVersion` is set;
  - `applyReleasePlan` writes package.json / CHANGELOG, then deletes consumed changeset files, or moves them under `.changeset/pre/` while still in pre mode;
  - this review did not inspect `@changesets/action` or any GitHub Action workflow.

## semantic-release

- canonical source：`https://github.com/semantic-release/semantic-release`
- revision：`8d905a56e80030c141a71a32c0c4cb870e90470a`
- package：`semantic-release@25.0.9`
- provenance：GitHub 轻量 tag `v25.0.9` 与 npm `gitHead` 指向同一 commit。仓库根 `package.json` 自报 `0.0.0-development`（自身用 semantic-release 发版），对外版本以 tag / npm 为准。
- inspected：
  - `package.json`
  - `index.js`
  - `lib/get-config.js`
  - `lib/get-next-version.js`
  - `lib/get-last-release.js`
  - `lib/definitions/plugins.js`
  - `lib/definitions/constants.js`
  - `lib/definitions/errors.js`
  - `lib/get-git-auth-url.js`
- observed：
  - package is ESM with engines `node: ^22.14.0 || >= 24.10.0` and a `semantic-release` bin;
  - default plugins are `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/npm`, `@semantic-release/github`;
  - default branches include maintenance patterns, `master`, `main`, `next`, `next-major`, plus `{ name: "beta"|"alpha", prerelease: true }`; `tagFormat` is `v${version}`;
  - non-CI runs without `dryRun` / `noCi` are forced into dry-run; CI pull requests return without publishing;
  - `analyzeCommits` is required, drops messages matching `[skip release]` / `[release skip]`, and the host keeps the highest of `["patch","minor","major"]`;
  - first release is `1.0.0` (`FIRST_RELEASE`), not `0.1.0`; later releases call `semver.inc(lastRelease.version, type)`;
  - the host creates and pushes the git tag *before* `publish` plugins run;
  - `EGITNOPERMISSION` interpolates `originalRepositoryURL` so the thrown error details do not embed credentials from `getGitAuthUrl()`;
  - `@semantic-release/commit-analyzer` and the npm/github plugins were not inspected as pinned source trees; conventional-commit mapping is therefore not claimed from this review.
