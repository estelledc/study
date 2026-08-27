# Date library source review (writer Z)

> 用途：记录 Day.js、date-fns 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL Z
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle size-limit 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Day.js

- canonical source：`https://github.com/iamkun/dayjs`
- revision：`4549b8d03307891143e8a50d39fcdab1f16f77cf`
- package：`dayjs@1.11.23`
- provenance：GitHub tag `v1.11.23` 与 npm `gitHead` 同指该提交；`package.json` 源码 version 字段仍为 `0.0.0-development`，以 tag / npm 版本为准
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/utils.js`
  - `src/constant.js`
  - `src/plugin/utc/index.js`
  - `src/plugin/timezone/index.js`
  - `src/plugin/customParseFormat/index.js`
  - `test/constructor.test.js`
  - `test/plugin.test.js`
- observed：
  - `dayjs(date)` wraps a cloned native `Date`; existing Day.js values are cloned via `$isDayjsObject` / `instanceof`;
  - public `set` / `add` / `subtract` clone first, while internal `$set` mutates the current instance;
  - `extend` installs a plugin once (`plugin.$i`) by mutating `Dayjs.prototype` or the `dayjs` factory;
  - core parse ignores a string second argument; `customParseFormat` is required to treat it as a token string;
  - `timezone` computes offsets with `Intl.DateTimeFormat` and calls `dayjs.utc`, so the utc plugin must be installed first;
  - `package.json` size-limit is 2.99 KB for `dayjs.min.js`; this review did not measure the artifact.

## date-fns

- canonical source：`https://github.com/date-fns/date-fns`
- revision：`cd53d2538cfa318404eff7ade6449b49bf34562e`
- package：`date-fns@4.4.0` (`pkgs/core/package.json`)
- companions at the same revision：`@date-fns/tz@1.5.0`，`@date-fns/utc@2.1.1`
- provenance：GitHub tag `v4.4.0` is a lightweight tag on this commit; npm `date-fns@4.4.0` is latest but exposes no `gitHead`
- inspected：
  - `pkgs/core/package.json`
  - `pkgs/core/src/types.ts`
  - `pkgs/core/src/toDate/index.ts`
  - `pkgs/core/src/constructFrom/index.ts`
  - `pkgs/core/src/addDays/index.ts`
  - `pkgs/core/src/addDays/test.ts`
  - `pkgs/core/src/format/index.ts`
  - `pkgs/core/src/_lib/protectedTokens/index.ts`
  - `pkgs/core/src/differenceInDays/index.ts`
  - `pkgs/core/src/parseISO/index.ts`
  - `pkgs/core/src/setDefaultOptions/index.ts`
  - `pkgs/core/src/_lib/defaultOptions/index.ts`
  - `pkgs/tz/package.json`
  - `pkgs/tz/src/index.ts`
  - `pkgs/tz/src/tz/index.ts`
  - `pkgs/tz/src/date/index.js`
  - `pkgs/tz/src/date/mini.js`
- observed：
  - each capability is a named export; the package is ESM with `sideEffects: false`;
  - `toDate` / `constructFrom` clone Date instances, honor `constructDateFrom`, or fall back to `new Date(value)`;
  - `addDays` mutates only the clone and no-ops when `amount` is 0;
  - `format` uses Unicode tokens and throws on protected `YYYY` / `DD` / `YY` / `D` unless additional-token options are set;
  - timezone support is the companion `TZDate` plus `options.in` / `tz()` context, not a core default;
  - `setDefaultOptions` writes module-level defaults and is marked `@pure false`;
  - remote also has `v5.0.0-alpha.0`; this review stays on reachable stable `v4.4.0`.
