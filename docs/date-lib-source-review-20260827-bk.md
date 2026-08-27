# Date library source review (writer BK)

> 用途：记录 Luxon、temporal-polyfill 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL BK
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 Jest / Vitest / test262、bundle size 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- pair choice：`temporal.md` 是 Temporal 工作流引擎，不是 JS Temporal；日期对使用已有页 `luxon` + `temporal-polyfill`。未改 `dayjs` / `date-fns`（开放 PR #66）。

## Luxon

- canonical source：`https://github.com/moment/luxon`
- revision：`4262a38ded7762e22608a9feb9f117b40d338ced`
- package：`luxon@3.7.2`
- provenance：GitHub lightweight tag `3.7.2` 与 npm `luxon@3.7.2` 的 `gitHead` 同指该提交；`src/luxon.js` 的 `VERSION` 与根 `package.json` 均为 `3.7.2`
- inspected：
  - `package.json`
  - `src/luxon.js`
  - `src/datetime.js`
  - `src/duration.js`
  - `src/interval.js`
  - `src/settings.js`
  - `src/zones/IANAZone.js`
  - `src/impl/zoneUtil.js`
  - `test/datetime/math.test.js`
  - `test/datetime/invalid.test.js`
  - `test/datetime/zone.test.js`
  - `test/duration/units.test.js`
  - `test/interval/info.test.js`
- observed：
  - public surface is `DateTime` / `Duration` / `Interval` / `Info` plus Zone implementations and `Settings`;
  - `plus` / `minus` / `set` / `setZone` / `setLocale` clone via `clone(...)`; invalid instances return `this` and `toISO()` returns `null`;
  - `adjustTime` adds whole years/months first, then clamps the calendar day with `Math.min(day, daysInMonth(year, month))` before adding days/weeks;
  - `setZone` keeps the same epoch by default; `keepLocalTime` or `keepCalendarTime` both rebuild a timestamp from the current local fields;
  - `IANAZone.offset` uses cached `Intl.DateTimeFormat#formatToParts` (or a `format()` regex fallback) and does not ship IANA data;
  - `Duration.as` / `toMillis` convert through `casualMatrix` (30-day months, 365-day years) unless `conversionAccuracy: "longterm"`;
  - `Interval.contains` is half-open: `start <= dt && end > dt`;
  - `Settings.throwOnInvalid` is unset by default, so invalid construction returns an invalid object instead of throwing;
  - `engines.node` is `>=12`; `dependencies` is empty; `sideEffects` is `false`.

## temporal-polyfill

- canonical source：`https://github.com/fullcalendar/temporal-polyfill`
- revision：`d724c890761dfaf328af86d89f12fc3f644cdd81`
- package：`temporal-polyfill@1.0.4` (`polyfill/package.json`)
- companions at the same revision：`temporal-spec@1.0.1`，`temporal-utils@1.0.2`
- provenance：annotated GitHub tag `temporal-polyfill@1.0.4` peels to this commit; npm `temporal-polyfill@1.0.4` has no `gitHead`. The same commit is also tagged `temporal-utils@1.0.2`; the commit message is a README packaging tweak on top of the 1.0.4 workspace.
- inspected：
  - `package.json`
  - `pnpm-workspace.yaml`
  - `polyfill/package.json`
  - `spec/package.json`
  - `utils/package.json`
  - `polyfill/src/nativeSwitch.ts`
  - `polyfill/src/classApi/basic/index.ts`
  - `polyfill/src/classApi/basic/temporal.ts`
  - `polyfill/src/classApi/basic/shim.ts`
  - `polyfill/src/classApi/basic/duration.ts`
  - `polyfill/src/classApi/basic/plainDate.ts`
  - `polyfill/src/classApi/basic/zonedDateTime.ts`
  - `polyfill/src/classApi/basic/calendarResolve.ts`
  - `polyfill/src/internal/total.ts`
  - `polyfill/src/internal/move.ts`
  - `polyfill/src/internal/optionsFieldRefine.ts`
  - `polyfill/src/internal/errorMessages.ts`
  - `polyfill/src/funcApi/index.ts`
- observed：
  - default `temporal-polyfill` export is the class API: `NativeTemporal || Impl.Temporal`, so a present `globalThis.Temporal` wins;
  - `./shim` only calls `installImplementation()` when `NativeTemporal` is missing;
  - the Temporal object exposes `PlainDate` / `PlainTime` / `PlainDateTime` / `PlainYearMonth` / `PlainMonthDay` / `ZonedDateTime` / `Instant` / `Duration` / `Now`;
  - basic calendar resolver accepts only `iso8601` and `gregory`; other calendar ids throw `exoticCalendarRequired` and need `temporal-polyfill/full`;
  - `Duration.total` can total day/time units without an anchor; calendar units throw `Missing relativeTo` unless `relativeTo` is supplied;
  - `refineOverflowOptions` defaults to `constrain` when options are omitted;
  - `ZonedDateTime.withTimeZone` copies existing epoch slots and only replaces the time zone;
  - `./fns` is a separate functional export map, not the default class namespace;
  - this review did not run test262 or measure the published `dist` size.
