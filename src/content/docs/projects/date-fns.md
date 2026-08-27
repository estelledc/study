---
title: date-fns — 不造新类型，给原生 Date 配独立纯函数
来源: https://github.com/date-fns/date-fns
日期: 2026-08-27
分类: projects / 工具库
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/date-fns/date-fns
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cd53d2538cfa318404eff7ade6449b49bf34562e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.4.0
---

## 是什么

date-fns 是一个 JavaScript 日期工具库：不发明 `DateThing` 类，只导出一批独立纯函数。日常类比：厨房抽屉里的单独工具——你只用削皮刀就只拿削皮刀，不必搬来整套料理机。

```js
import { addDays, format } from "date-fns";
const tomorrow = addDays(new Date(2026, 4, 30), 1);
format(tomorrow, "yyyy-MM-dd");
```

输入是 `Date | number | string`（`DateArg`），输出仍是 Date 或原始值。固定 4.4.0 的 `pkgs/core` 把每个函数做成 named export，并声明 `"type": "module"` 与 `"sideEffects": false`。

## 为什么重要

不理解这条函数合同，下面这些选择会对不上：

- 为什么没有 `d.add(1, "day").format()`——没有 wrapper，方法无处可挂
- 为什么 `format(d, "YYYY-MM-DD")` 会警告甚至抛错，而 Day.js 同一串 token 是默认写法
- 为什么时区不在 core 里“顺便解决”，而要 `@date-fns/tz` 的 `TZDate` 或 `in: tz(...)`
- 为什么 v3 之后必须写 `import { format } from "date-fns"`，不能再依赖 default export

## 核心要点

固定 4.4.0 的主链是：

1. **`toDate` / `constructFrom` 统一入口**：所有日期参数先规范化。已有 Date 用其 constructor 再造一个；带 `[Symbol.for("constructDateFrom")]` 的扩展（如 `TZDate`）走自己的工厂；否则 `new Date(value)`。
2. **函数改副本，不改入参**：`addDays` 先 `toDate` 得到新对象，再 `setDate`。`amount === 0` 时直接返回副本，避免在 DST 结束前一小时无意义改时间。
3. **Unicode format token**：`format` 按 UTS #35。`YYYY`/`DD`/`YY`/`D` 属于受保护 token，默认 `console.warn` 且对这四个字面量抛 `RangeError`；应写 `yyyy-MM-dd`。
4. **时区是扩展类型，不是 core 默认**：同提交里的 `@date-fns/tz@1.5.0` 提供 `TZDate`（`Date` 子类：外部存 instant，内部存目标时区墙钟）和 `tz(timeZone)` 上下文函数，经 options.`in` 注入。
5. **少数全局默认**：`setDefaultOptions` 会改模块级 locale / `weekStartsOn` / `firstWeekContainsDate`，源码标了 `@pure false`。函数式入口在 `date-fns/fp`。

同远程还有 `v5.0.0-alpha.0`；本文只绑定稳定 tag `v4.4.0`。

## 实践示例

### 案例 1：加天数，原 Date 不动

```js
import { addDays } from "date-fns";
const today = new Date(2026, 4, 30);
const next = addDays(today, 7);
```

测试固定断言：调用后 `today` 仍是 5 月 30 日。`next` 是新 Date，可再交给 `format` 或其他函数。

### 案例 2：Unicode token + 按需 locale

```js
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

format(new Date(2026, 4, 30), "yyyy 年 M 月 d 日", { locale: zhCN });
```

`yyyy` 是日历年，`dd` 是月中日。写成 `YYYY-MM-DD` 会走 `warnOrThrowProtectedError`。locale 从 `date-fns/locale` 单独 import；固定源码有 96 个 locale 目录。

### 案例 3：用 `in` 把计算放到指定时区

```js
import { addDays, format } from "date-fns";
import { tz } from "@date-fns/tz";

const later = addDays("2026-05-30T10:00:00Z", 1, { in: tz("Asia/Shanghai") });
format(later, "yyyy-MM-dd HH:mm", { in: tz("Asia/Shanghai") });
```

`tz("Asia/Shanghai")` 返回一个 context 函数，`constructFrom` 发现它是 function 就调用它，得到带 `timeZone` 的 `TZDate`。core 自己不内嵌 IANA 数据。

## 踩过的坑

1. **Moment token 直接粘贴**：`YYYY`/`DD` 默认会抛 `RangeError`。要真用 week-year / day-of-year，得显式打开 `useAdditionalWeekYearTokens` / `useAdditionalDayOfYearTokens`。
2. **字符串日期仍走 `Date` 构造**：`DateArg` 含 string，但 `constructFrom` 对非 Date 参考值执行 `new Date(value)`。`parseISO` 才是专门的 ISO 解析器。
3. **`differenceInDays` 数的是完整本地日**：不足一日截向零。只要日历日差，应看 `differenceInCalendarDays`。
4. **`setDefaultOptions` 有全局副作用**：后调用的 `format` / `startOfWeek` 会吃到新默认，除非单次 options 覆盖。
5. **时区不在 core 默认路径里**：只 import `date-fns` 不会得到 `TZDate`；要另引 `@date-fns/tz` 或 `@date-fns/utc`。

## 适用 vs 不适用场景

**适用**：

- 只要若干日期函数，希望 bundler 按 named export 删除未用代码
- 输入输出保持原生 Date，或主动传入 `TZDate` / `UTCDate`
- 需要 `date-fns/fp` 的柯里化、参数倒序写法

**不适用**：

- 想写 `d.add(1, "day").format()` → [[dayjs]]
- 把 Moment token 当通用格式串，又不改大小写
- 需要库内打包完整 IANA 数据，而不是运行时 + `TZDate`
- 要把本页静态阅读当成已测 bundle 或跨时区运行证据

## 固定版本边界

- 本文绑定 `date-fns/date-fns@cd53d2538cfa318404eff7ade6449b49bf34562e`。GitHub tag `v4.4.0` 指向该提交；`pkgs/core/package.json` 报 `date-fns@4.4.0`。npm 未暴露 `gitHead`，以 tag 与 package 版本互证。
- 同提交 `pkgs/tz` 为 `@date-fns/tz@1.5.0`，`pkgs/utc` 为 `@date-fns/utc@2.1.1`。
- 未安装 monorepo 依赖、未跑 vitest、未测 tree-shake 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **工具集和 wrapper 是两条库设计**：函数好摇树，链式好念；不能互相冒充。
2. **immutable 靠 clone 协议**：`constructFrom` 让 `TZDate` 在复制时保住时区。
3. **token 标准比“看起来像日期”重要**：同一串 `YYYY-MM-DD` 在两库里语义相反。
4. **core 不管时区数据**：`in` 上下文把扩展 Date 送进原有函数，而不是给每个函数重写一份。

## 应用型自测

1. `format(new Date(2026, 4, 30), "YYYY-MM-DD")` 在默认 options 下会怎样？
2. `addDays(date, 11)` 之后，传入的 `date` 会被改掉吗？
3. 只 `import { addDays } from "date-fns"`，不引 `@date-fns/tz`，`addDays` 会自动按 `Asia/Shanghai` 算墙钟吗？

检查点：

1. `YYYY` 与 `DD` 受保护：警告，且这两个 token 会抛 `RangeError`。
2. 不会。它改的是 `toDate` 得到的副本。
3. 不会。没有 `in` / `TZDate` 时走普通 `Date` 本地字段。

## 延伸阅读

- 文档：[date-fns.org](https://date-fns.org/)
- 固定源码：[date-fns/date-fns](https://github.com/date-fns/date-fns) —— 本文绑定 `cd53d2538cfa318404eff7ade6449b49bf34562e`
- Unicode 日期 token：https://www.unicode.org/reports/tr35/tr35-dates.html
- [[dayjs]] —— Moment 风格 wrapper，对照本页的函数路线
- [[luxon]] —— 时区 first-class 的 class API
- [[temporal-polyfill]] —— 函数注释里指向的未来标准

## 关联

- [[dayjs]] —— 链式 immutable wrapper；plugin 全局，token 不同
- [[luxon]] —— DateTime/Duration/Interval 三类，不走函数抽屉
- [[temporal-polyfill]] —— `addDays` 文档主动对照 Temporal
- [[js-joda]] —— 不包装可变 Date 的另一条强类型路
- [[lodash]] —— 同样 function-per-feature 的设计亲戚

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
- [[projects/timelinejs]] —— TimelineJS — 把 Google Sheet 一键变成新闻时间线
- [[vis-timeline]] —— vis-timeline — 时间轴 / 日程 / 历史事件三合一组件
