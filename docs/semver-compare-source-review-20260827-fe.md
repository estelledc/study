# SemVer / version-compare source review (writer FE)

> 用途：记录 `semver`、`compare-versions` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fe` 标记 2026-08-27 平行 writer FE。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FE
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 tap / mocha / c8，未测 bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- slugs：`semver`（npm 包名，canonical 仓为 `npm/node-semver`）、`compare-versions`

## semver

- canonical source：`https://github.com/npm/node-semver`
- revision：`6e05b7637396ac66522cff8731f07cfe0ef49a29`
- package：`semver@7.8.5`
- inspected：
  - `package.json`
  - `index.js`
  - `classes/semver.js`
  - `classes/range.js`
  - `classes/comparator.js`
  - `functions/parse.js`
  - `functions/valid.js`
  - `functions/clean.js`
  - `functions/compare.js`
  - `functions/satisfies.js`
  - `functions/coerce.js`
  - `functions/inc.js`
  - `internal/constants.js`
  - `internal/re.js`
  - `internal/identifiers.js`
- observed：
  - CommonJS，`main` 为 `index.js`，无 `exports` map；`engines.node >= 10`；bin 为 `bin/semver.js`；
  - `SEMVER_SPEC_VERSION` 是 `'2.0.0'`，指 semver.org 规范版本，不是包版本；
  - `new SemVer` 用 `FULL` / `LOOSE` 正则；`FULLPLAIN` 允许可选前导 `v`，主版本三段必须是无前导零的数字标识符；超过 `MAX_LENGTH` 256 抛错；
  - `compare()` 只跑 `compareMain` 再 `comparePre`，build 不参与；`compareBuild` 是另一条路径；
  - 无 prerelease 的版本大于同 major/minor/patch 的预发布；数字标识符按数值比，数字小于非数字；
  - `parse` / `valid` 失败返回 `null`；`clean` 先去掉前导 `[=v]+` 再 parse；
  - `Range` 把 `||` 拆成 comparator set，hyphen / `^` / `~` / x-range / `*` 先 desugar 再 `test`；
  - `^0.0.1` 收成 `>=0.0.1 <0.0.2-0`，`^0.1.0` 收成 `>=0.1.0 <0.2.0-0`，`^1.2.3` 收成 `>=1.2.3 <2.0.0-0`；
  - `testSet` 在未设 `includePrerelease` 时，带 prerelease 的候选必须与某个带 prerelease 的 comparator 共享同一组 major/minor/patch，否则直接失败；
  - `coerce` 默认从左取第一组可强迫数字，`rtl: true` 取最右且不与更左匹配共享终点的一组；
  - 函数式 `inc` 失败返回 `null`；实例 `inc` 会改当前 `SemVer`。
- provenance note：
  - npm `semver@7.8.5` 的 `gitHead` 与 GitHub lightweight tag `v7.8.5` 同指 `6e05b7637396ac66522cff8731f07cfe0ef49a29`（"chore: release 7.8.5 (#879)"）；
  - 该提交 `package.json` 报 `7.8.5`。

## compare-versions

- canonical source：`https://github.com/omichelsen/compare-versions`
- revision：`497a7e0c5fc00c6bb16f3aa81ce32fe2acdd43cd`
- package：`compare-versions@6.1.1`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/compare.ts`
  - `src/compareVersions.ts`
  - `src/satisfies.ts`
  - `src/utils.ts`
  - `src/validate.ts`
  - `test/compare.ts`
  - `test/satisfies.ts`
  - `test/validate.ts`
- observed：
  - TypeScript 源码；发布物是 `lib/esm` + `lib/umd`，`sideEffects: false`；无 `engines`、无运行时依赖；
  - 具名导出 `compareVersions`、`compare`、`satisfies`、`validate`、`validateStrict`；
  - `compareVersions` 返回 `-1/0/1`；`compare(v1, v2, operator)` 用算子映射成布尔值，算子只允许 `> >= = <= < !=`；
  - 解析正则允许可选前导 `v^~<>=`、1–4 段、`x/*` 通配、前导零；缺段在 `compareSegments` 里按 `'0'` 补；
  - build metadata 被正则吃掉但不进入比较；预发布用 `pop()` 拆出后再比；
  - `satisfies` 是字符串改写：先去算子后空白，再递归处理 `||`、` - `、空格 AND，最后才处理 `^` / `~`；
  - `~` 的指针固定为 2（锁前两段）；`^` 取第一个非 `'0'` 段下标 `+ 1`，若结果不大于 1 则退回 1；
  - range 自身带预发布时，版本也必须带预发布且主段完全相等；range 不带预发布时，`^`/`~` 不再做 npm `includePrerelease` 那种排除；
  - `validate` 要求字符串以 `v` 或数字开头且通过宽松正则；`validateStrict` 是 SemVer 2.0 三段式，拒绝 `v` 前缀、缺段和前导零。
- provenance note：
  - npm `compare-versions@6.1.1` 的 `gitHead` 与 GitHub lightweight tag `v6.1.1` 同指 `497a7e0c5fc00c6bb16f3aa81ce32fe2acdd43cd`（提交说明 `6.1.1`）；
  - 该提交 `package.json` 报 `6.1.1`。
