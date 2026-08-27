# Date leftover source review (writer EE)

> 用途：记录 FormKit Tempo、spacetime 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EE
- evidence：GitHub tag metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、size-limit 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：`dayjs`、`date-fns`、`luxon`、`moment`、`temporal-polyfill`（开放 PR 已占用）
- disambiguation：仓库已有 `tempo` 页指向 Grafana Tempo 追踪后端；本批日期库使用新 slug `formkit-tempo`

## FormKit Tempo

- canonical source：`https://github.com/formkit/tempo`
- revision：`00dc3dc9837a461e1e7766bc3f560966d6b00007`
- git tag：`v1.1.0`（annotated object 剥到上述 commit）
- package：`@formkit/tempo@1.1.0`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/date.ts`
  - `src/iso8601.ts`
  - `src/format.ts`
  - `src/parse.ts`
  - `src/add.ts`
  - `src/addMonth.ts`
  - `src/handleDateOverflow.ts`
  - `src/tzDate.ts`
  - `src/offset.ts`
  - `src/applyOffset.ts`
  - `src/common.ts`
  - `src/types.ts`
  - `scripts/size-limit/index.js`
- observed：
  - package 无 production `dependencies`；`exports` 分 import / require / browser；测试脚本固定 `TZ=America/New_York`；
  - 不造 wrapper 类型：`date()` 接受 `Date` / ISO 8601 / 空值，`Date` 输入会 `new Date(date)` 克隆，非 ISO 字符串抛错；
  - 仅日期的 ISO 会补 `T00:00:00`，避免被 JS 当成 UTC 午夜；
  - `format` / `parse` 用 `Intl.DateTimeFormat` 拆 part；`format` 指定 `tz` 时先算 offset，再 `removeOffset` 后按 UTC 填 token；
  - `tzDate(input, tz)` 把输入 wall clock 解释成该时区，再 `applyOffset`；
  - `offset()` 用 `Intl` `formatToParts` 做相对换算，BC 年写成 `1 - year`，并用 `setUTCFullYear` 避开 `Date.UTC` 的 0–99 映射；
  - `applyOffset` / `parse` 的 offset 允许秒；
  - `add()` 在 `months` 或 `years` 为负时先走历法单位，否则先走固定时长；`addMonth` 默认 `dateOverflow=false`，先把日改成 1 再夹到目标月最后一天；
  - `parse` 默认 `dateOverflow="backward"`；`"throw"` 在日超出当月时抛错；其它值把日原样交给 `Date` 构造；
  - 仓库 size-limit 把全部 ESM 标成 `5.1 kb`、CJS 标成 `5.4 kb`；本审查未跑该检查。
- provenance：
  - GitHub tag `v1.1.0` peel 与 npm `@formkit/tempo@1.1.0` 的 `gitHead` 都是 `00dc3dc9837a461e1e7766bc3f560966d6b00007`；
  - 该提交 `package.json` 报 `1.1.0`。

## spacetime

- canonical source：`https://github.com/spencermountain/spacetime`
- revision：`33bf9574b88aaf9acde74ea88a308f92e53cdcd6`
- git tag：`7.13.0`（轻量 tag，直接指向该 commit）
- package：`spacetime@7.13.0`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.js`
  - `src/spacetime.js`
  - `src/methods.js`
  - `src/methods/add.js`
  - `src/methods/query/01-time.js`
  - `src/methods/set/_model.js`
  - `src/timezone/index.js`
  - `src/timezone/find.js`
  - `src/timezone/quick.js`
  - `src/timezone/guessTz.js`
  - `src/input/index.js`
  - `src/input/formats/01-ymd.js`
  - `src/_version.js`
  - `zonefile/unpack.js`
- observed：
  - package 无 production `dependencies`；`src/_version.js` 与 npm 都报 `7.13.0`；协议为 Apache-2.0；
  - 实例只存 `epoch` 与 `tz`；`d` getter 用打包 zonefile 的 `quickOffset` 加上本机 `getTimezoneOffset` 造一棵“看起来像该时区 wall clock”的 `Date`；`toNativeDate()` 才是 `new Date(this.epoch)`；
  - `goto(tz)` 先 clone 再换 `tz`，物理时刻不变；`timezone(tz)` 走 `json()` + `set()`，用来热换时区并保住 wall clock；
  - `add` / 大多数 setter 先 clone；`weekStart()` 直接改 `this._weekStart`，默认周一；
  - 时区查找：精确 IANA、规范化别名、城市名、数字 offset；找不到就抛错；空输入回落到一次 `Intl.resolvedOptions().timeZone`，没有则 `utc`；
  - DST 用自带 `dst: start->back` 字符串和南北半球规则，不在热路径读 `Intl`；
  - `add` 先按毫秒粗移，再对年/季/月/周/日做 offset 补偿，月份用 `months()` 建模，跨月日超出则夹到当月最后一天；
  - ISO 解析可选 Temporal 风格 `[IANA]`，日历注解目前忽略；
  - `max` / `min` 把 epoch 设成 `±8640000000000000`；`extend` / `plugin` 往 prototype 挂方法。
- provenance：
  - GitHub tag `7.13.0` 与 npm `spacetime@7.13.0` 的 `gitHead` 都是 `33bf9574b88aaf9acde74ea88a308f92e53cdcd6`；
  - 该提交 `package.json` / `src/_version.js` 报 `7.13.0`。
