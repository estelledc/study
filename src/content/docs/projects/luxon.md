---
title: Luxon — 用三个不可变类包装 Intl 的日期库
来源: https://github.com/moment/luxon
日期: 2026-08-27
分类: projects / 前端工具库
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/moment/luxon
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4262a38ded7762e22608a9feb9f117b40d338ced
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.7.2
---

## 是什么

Luxon 是 Moment 团队另开仓库写的不可变 JavaScript 日期库。日常类比：不修旧车，另开一条产线——同一组织，但 API 不兼容 Moment。

```js
import { DateTime } from "luxon";
const a = DateTime.fromISO("2026-05-30");
const b = a.plus({ months: 1 }).minus({ days: 7 });
a.toISODate(); // "2026-05-30"
b.toISODate(); // "2026-06-23"
```

公开类型拆成 `DateTime`（时间点）、`Duration`（时段）、`Interval`（区间）。时区和 locale 委托给运行时 `Intl`，包本身没有 runtime 依赖。

## 为什么重要

不理解固定 3.7.2 的合同，下面这些事会对不上：

- 为什么 `dt.plus({ months: 1 })` 单独写一行看起来“没反应”
- 为什么 `Duration.fromObject({ months: 1 }).as("milliseconds")` 不是“看起点月份”
- 为什么 `setZone("Asia/Shanghai")` 默认换墙钟、不换瞬时
- 为什么错误输入常常不抛错，最后 `toISO()` 却是 `null`

## 核心要点

固定版本的主链可以拆成五步：

1. **三个 class 分管三类值**：`DateTime` 是瞬时+zone+locale，`Duration` 存单位计数 object，`Interval` 是一对 DateTime。
2. **公开变更先 clone**：`plus` / `minus` / `set` / `setZone` / `setLocale` 都走 `clone(...)`。原实例的 `ts` 不变。
3. **日历加法先改年月再夹日子**：`adjustTime` 先加整年/整月，再用 `Math.min(day, daysInMonth(year, month))`，然后才加日/周。1 月 31 日加 1 个月会落到 2 月末，而不是抛错。
4. **IANA 偏移来自 `Intl`**：`IANAZone.offset` 缓存 `Intl.DateTimeFormat#formatToParts`，从 year/month/hour 反推分钟偏移。库不带 IANA 数据包。
5. **invalid 默认不抛**：`Settings.throwOnInvalid` 初始未设置。坏输入得到 `invalid !== null` 的对象；后续 `plus`/`set` 直接返回 `this`，`toISO()` 返回 `null`。

`Duration.as` / `toMillis` 默认走 `casualMatrix`：1 月按 30 天、1 年按 365 天。要格里高利平均值得显式 `conversionAccuracy: "longterm"`。

## 实践示例

### 案例 1：链式加减必须接住返回值

```js
const a = DateTime.fromISO("2026-01-31");
const b = a.plus({ months: 1 });
a.toISODate(); // "2026-01-31"
b.toISODate(); // "2026-02-28"
```

`plus` 把 duration-like 交给 `Duration.fromDurationLike`，再 `clone` + `adjustTime`。日子被夹到目标月最后一天。

### 案例 2：`setZone` 默认保瞬时

```js
const ny = DateTime.fromISO("2026-05-30T10:00", { zone: "America/New_York" });
const sh = ny.setZone("Asia/Shanghai");
// 同一 ts，上海墙钟是 22:00
ny.setZone("Asia/Shanghai", { keepLocalTime: true });
// 墙钟仍是 10:00，瞬时变了
```

`keepLocalTime` 与 `keepCalendarTime` 都从当前本地字段重算 timestamp。默认两者都是 `false`。

### 案例 3：Duration 换毫秒用的是矩阵，不是锚点

```js
import { Duration, DateTime } from "luxon";
Duration.fromObject({ months: 1 }).as("milliseconds");
// casual：30 * 24 * 60 * 60 * 1000

const start = DateTime.fromISO("2026-01-31");
start.plus({ months: 1 }).diff(start, "milliseconds").milliseconds;
// 以这个 DateTime 为锚，2 月实际天数
```

没有锚点时，`as` 只是 `shiftTo(unit).get(unit)`。精确跨月要用两个 DateTime 的 `diff`。

## 踩过的坑

1. **丢掉 chain 返回值**：`dt.plus({ days: 1 })` 不改 `dt`。
2. **format token 不是 Moment**：Luxon 走 Unicode TR35，`yyyy` / `dd` 不是 `YYYY` / `DD`。
3. **`Duration.as("milliseconds")` 含月/年时是估算**：默认 30 天/365 天，不是“看哪个月”。
4. **invalid 会默默传下去**：没开 `Settings.throwOnInvalid` 时，链中段不炸，终点 `toISO()` 才是 `null`。要查 `dt.isValid`。
5. **`Interval.contains(end)` 为 false**：区间是 `[start, end)`。

## 适用 vs 不适用场景

**适用**：

- 需要 IANA 时区和 locale，但能接受数据来自运行时 ICU
- 想要 DateTime / Duration / Interval 分开，而不是一个 wrapper 包打天下
- 新项目可以学一套与 Moment 不同的 API

**不适用**：

- 只要 Moment 方法名、尽量少改调用 → 看 [[dayjs]]
- 只要按函数 tree-shake、输入输出都是原生 `Date` → 看 [[date-fns]]
- 需要规范里的 PlainDate / Instant 分层，而不是一个 DateTime 类 → 看 [[temporal-polyfill]]
- 要把静态阅读升级成已测 bundle 或跨引擎时区结论

## 固定版本边界

- 本文绑定 `moment/luxon@4262a38ded7762e22608a9feb9f117b40d338ced`。GitHub tag `3.7.2` 与 npm `luxon@3.7.2` 的 `gitHead` 指向同一提交。
- `engines.node` 为 `>=12`；`package.json` 无 runtime `dependencies`。
- 未安装依赖、未跑 Jest、未测 `build/global/luxon.min.js` 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **另开仓库可以换合同**：immutable + Intl，不再兼容 Moment 的可变 API。
2. **借平台标准会把正确性交给 ICU**：IANA 与 locale 跟着宿主，不跟着这一个 npm 包。
3. **Duration 没有锚点就只能用平均矩阵**：月和年不是固定毫秒。
4. **invalid 对象是一种错误通道**：它让链不断，也让失败更晚才看见。

## 应用型自测

1. `const dt = DateTime.fromISO("2026-01-31"); dt.plus({ months: 1 });` 之后 `dt` 的日期变了吗？
2. `Duration.fromObject({ months: 1 }).as("days")` 在默认 casual 矩阵下是 30 还是“看起点月份”？
3. 未设置 `Settings.throwOnInvalid` 时，`DateTime.invalid("bad").plus({ days: 1 }).toISO()` 返回什么？

检查点：

1. 不会。`plus` 返回新实例；若问加法结果，源码会把日子夹到 2 月末。
2. 是 30。`as` 走 `casualMatrix.months.days`。
3. `null`。invalid 的 `plus` 返回自身，`toISO()` 对 invalid 返回 `null`。

## 延伸阅读

- 文档：[moment.github.io/luxon](https://moment.github.io/luxon/)
- 固定源码：[moment/luxon](https://github.com/moment/luxon) —— 本文绑定 `4262a38ded7762e22608a9feb9f117b40d338ced`
- [[dayjs]] —— Moment 风格 wrapper；plugin 才有自定义解析和时区
- [[date-fns]] —— 纯函数 + 原生 Date
- [[temporal-polyfill]] —— 标准 Temporal 类型，Overflow 可 reject

## 关联

- [[dayjs]] —— 链式 API 更像 Moment，时区同样借 `Intl`
- [[date-fns]] —— 不要 wrapper class，时区在 companion `TZDate`
- [[temporal-polyfill]] —— 把日期/瞬时/时区拆开，而不是一个 DateTime
- [[js-joda]] —— java.time 风格的强类型 civil time

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
