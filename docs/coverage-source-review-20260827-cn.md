# Coverage CLI source review (writer CN)

> 用途：记录 c8、nyc 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer CN
- evidence：GitHub release/tag metadata、npm `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `/tmp/research-worktrees/`，不进入 Git
- target pair：`c8`、`nyc`
- fallback unused：开放 PR 未占用这对 coverage slug，因此未改用其他 coverage pair
- excluded slugs：开放 PR 已分配的 jest/mocha/vitest/playwright 等测试双子，以及 A–BZ 已占用 slug

## c8

- canonical source：`https://github.com/bcoe/c8`
- revision：`ae5a0cf4349b92cac910cf7275e724ab7a725b9d`
- package：`c8@12.0.0`
- tag：`v12.0.0`（lightweight tag 即该 commit；npm `gitHead` 一致）
- engines：`^20.19.0 || ^22.12.0 || >=23`
- inspected：
  - `package.json`
  - `bin/c8.js`
  - `index.js`
  - `lib/parse-args.js`
  - `lib/report.js`
  - `lib/commands/report.js`
  - `lib/commands/check-coverage.js`
  - `lib/source-map-from-file.js`
  - `test/parse-args.js`
  - `README.md`
- observed：
  - 入口在可选 `clean` 之后设置 `NODE_V8_COVERAGE`，再用 `foreground-child` 拉起用户命令；子进程退出后 `outputReport`；
  - 不 hook `require`、不改 AST；覆盖率来自 V8 JSON，经 `v8-to-istanbul` 转成 Istanbul map，再用 `istanbul-reports` 出报告；
  - 默认 reporter `text`、`reports-dir` `./coverage`；未设 `NODE_V8_COVERAGE` 时 temp 落到 `reportsDir/tmp`；`clean` 默认 true；
  - `--check-coverage` 默认 false；阈值默认 lines 90、functions/branches/statements 0；`--100` 只在 report / check-coverage handler 展开，yargs middleware 仍是 TODO；
  - `--all` 通过 `_includeUncoveredFiles()` 合成 `functionName: '(empty-report)'`、`count: 0` 的空 V8 记录，不 `require` 未测文件；
  - `omitRelative` 默认 true；`excludeAfterRemap` 默认 false；`merge-async` 默认 false；
  - `--experimental-monocart` 依赖可选 peer `monocart-coverage-reports@^2`，缺包会退出 1；
  - 配置查找：`--config`/`-c`，否则 `find-up` `.c8rc` / `.c8rc.json` / `.nycrc` / `.nycrc.json`，并读取 `package.json` 的 `c8` 键。
- provenance：
  - GitHub latest release、tag `v12.0.0` 与 npm `c8@12.0.0` 的 `gitHead` 均为 `ae5a0cf4349b92cac910cf7275e724ab7a725b9d`。

## nyc

- canonical source：`https://github.com/istanbuljs/nyc`
- revision：`3ce6d979a1c6753263165d31cb985523b5a81855`
- package：`nyc@18.0.0`
- tag：`nyc-v18.0.0`（lightweight tag 即该 commit；npm `gitHead` 一致）。仓库没有名为 `v18.0.0` 的 ref。
- engines：`20 || >=22`
- inspected：
  - `package.json`
  - `index.js`
  - `bin/nyc.js`
  - `bin/wrap.js`
  - `lib/wrap.js`
  - `lib/config-util.js`
  - `lib/register-env.js`
  - `lib/process-args.js`
  - `lib/instrumenters/istanbul.js`
  - `lib/instrumenters/noop.js`
  - `lib/commands/helpers.js`
  - `lib/commands/report.js`
  - `lib/commands/instrument.js`
  - `test/wrap.js`
  - `README.md`
  - `@istanbuljs/schema@0.1.3` 的 nyc 默认值（cli 选项来源）
- observed：
  - 默认 `useSpawnWrap: false`：主进程把 `register-env` 与 `wrap.js` 推进 `node-preload`，并用 `process-on-spawn` 复制 `NYC_CONFIG`；`true` 时才 `spawn-wrap`；
  - `NYC.wrap()` 默认 `hookRequire: true`，经 `istanbul-lib-hook` 改写 `require`；vm hook 默认关；
  - 插桩器是 `istanbul-lib-instrument`，`coverageVariable: '__coverage__'`，`autoWrap` 与 `embedSource` 为 true；`instrument: false` 换成 noop，只读已有 coverage；
  - `signal-exit` 在退出时把 coverage 写成 `.nyc_output/<uuid>.json`；默认 reporter `text`、temp `./.nyc_output`、`report-dir` `coverage`、`clean=true`、`cache=true`；
  - `babelCache` 默认 false，主进程设 `BABEL_DISABLE_CACHE=1`；
  - `--all` 对 CJS 设 `fakeRequire` 并返回 `'function x () {}'`，对 `.mjs` / `type: module` 的 `.js` 读原文 `instrumentSync`；
  - schema 默认 `excludeAfterRemap: true`，与 c8 的 false 相反；阈值同样是 lines 90、其余 0；
  - `cwd` 向上寻找最近 `package.json`；extension 数组会再 concat `.js`；
  - 子命令：`check-coverage`、`report`、`instrument`、`merge`。
- provenance：
  - GitHub release `nyc-v18.0.0`、tag object 与 npm `nyc@18.0.0` 的 `gitHead` 均为 `3ce6d979a1c6753263165d31cb985523b5a81855`；
  - 旧式 tag 名 `v18.0.0` 不存在，因此正文绑定 `nyc-v18.0.0` 而不是猜测 `v18.0.0`。
