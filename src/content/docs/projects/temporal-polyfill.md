---
title: temporal-polyfill — 在缺原生 Temporal 时提供标准日期类型
来源: https://github.com/fullcalendar/temporal-polyfill
日期: 2026-08-27
分类: projects / 工具库
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/fullcalendar/temporal-polyfill
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d724c890761dfaf328af86d89f12fc3f644cdd81
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.0.4
---

## 是什么

temporal-polyfill 是 FullCalendar 团队的 Temporal 实现，给还没有（或不想用）原生 `Temporal` 的环境一套标准日期类型。日常类比：图纸已经进语言标准，这个包是按图纸先装好的一套家具——宿主自己有原装时，默认入口会改用原装。

```js
import { Temporal } from "temporal-polyfill";

const birthday = Temporal.PlainDate.from("2026-05-29");
const flight = Temporal.ZonedDateTime.from("2026-05-29T09:30[Asia/Shanghai]");
const log = Temporal.Instant.from("2026-05-29T01:30:00Z");
```

默认导出是 class API。同一提交还带 `./fns` 函数式入口、`./full` 扩展历法，以及只在缺少原生对象时写入 `globalThis` 的 `./shim`。

## 为什么重要

不理解固定 1.0.4 的入口合同，下面这些事会对不上：

- 为什么 `import { Temporal } from "temporal-polyfill"` 在已有原生 Temporal 的引擎里不一定走到 polyfill 实现
- 为什么生日用 `ZonedDateTime` 飞时区会错日，用 `PlainDate` 不会
- 为什么 `Duration.from({ months: 1 }).total("milliseconds")` 会抛 `Missing relativeTo`
- 为什么 1 月 31 日 `add({ months: 1 })` 默认变成 2 月 28 日，只有 `overflow: "reject"` 才拒绝

## 核心要点

固定工作区的执行链可以拆成五步：

1. **原生优先**：`classApi/basic/index.ts` 导出 `NativeTemporal || Impl.Temporal`。`globalThis.Temporal` 存在就用它。
2. **类型强迫你说清语义**：`PlainDate` 没有时区，`ZonedDateTime` 绑 IANA zone，`Instant` 是绝对时刻。默认不会隐式互转。
3. **基础包只认 ISO / Gregory**：`resolveBasicCalendarId` 只接受 `iso8601` 与 `gregory`。其他 calendar id 抛 `exoticCalendarRequired`，要改 `temporal-polyfill/full`。
4. **日历时长必须有锚点**：`Duration.total` 对 day/time 单位可以无 `relativeTo`；碰到月/年等非均匀单位且没锚点时抛 `Missing relativeTo`。
5. **overflow 默认 constrain**：`refineOverflowOptions(undefined)` 得到 `constrain`。1 月 31 日加 1 个月默认夹到 2 月末；要失败得显式 `{ overflow: "reject" }`。

`ZonedDateTime.withTimeZone` 复制现有 epoch slots，只换 time zone，物理时刻不变。

## 实践示例

### 案例 1：生日用 PlainDate

```js
const zoned = Temporal.ZonedDateTime.from("2000-05-29T00:00[Asia/Shanghai]");
zoned.withTimeZone("America/New_York").toPlainDate().toString();
// 纽约墙钟跨日，日期变成 05-28

const birthday = Temporal.PlainDate.from("2000-05-29");
birthday.toString(); // 永远是 2000-05-29
```

`withTimeZone` 不改 `epochNanoseconds`。把“日历日”存成带时区的午夜，换区就会漂。

### 案例 2：Duration.total 对月必须给 relativeTo

```js
const dur = Temporal.Duration.from({ months: 1, days: 3 });
dur.total("milliseconds");
// RangeError: Missing relativeTo

dur.total({ unit: "milliseconds", relativeTo: "2026-01-01" });
// 以 2026-01 为锚，把月换成长度
```

源码先看最大单位是不是均匀 day/time；否则必须 `refineRelativeTo` 出锚点再 `spanRelativeDuration`。

### 案例 3：overflow 默认夹紧，不是抛错

```js
Temporal.PlainDate.from("2026-01-31").add({ months: 1 }).toString();
// "2026-02-28"

Temporal.PlainDate.from("2026-01-31")
  .add({ months: 1 }, { overflow: "reject" });
// 抛错：2 月没有 31 日
```

这和 Luxon `plus({ months: 1 })` 的夹日子方向类似，但 Temporal 把 reject 做成显式选项。

## 踩过的坑

1. **以为 import 一定加载 polyfill 实现**：默认入口在存在 `globalThis.Temporal` 时走原生。
2. **`./shim` 不会覆盖已有原生**：`install()` 只在 `!NativeTemporal` 时改全局。
3. **基础入口没有农历/伊斯兰历**：那些 calendar 在 `./full`。
4. **`total({ unit: "milliseconds" })` 含 months 时必需要锚**：没有 `relativeTo` 就抛错，不会像 Luxon 那样用 30 天估算。
5. **默认 overflow 是 constrain**：要“非法日期失败”必须自己写 `reject`。

## 适用 vs 不适用场景

**适用**：

- 业务要把“日历日 / 墙钟 / 瞬时”分开存
- 目标环境可能还没有原生 Temporal，但 API 想对齐标准
- 能接受基础包只覆盖 ISO 与 Gregory

**不适用**：

- 只要 Moment 链式方法名 → 看 [[dayjs]]
- 只要几个纯函数和原生 `Date` → 看 [[date-fns]]
- 只要一个 DateTime 类 + 默认估算 Duration → 看 [[luxon]]
- 已经确认宿主原生 Temporal 足够，且不需要 polyfill 的 `./fns` / `./full`
- 要把静态阅读升级成 test262 通过或已测包体积

## 固定版本边界

- 本文绑定 `fullcalendar/temporal-polyfill@d724c890761dfaf328af86d89f12fc3f644cdd81`。annotated tag `temporal-polyfill@1.0.4` peel 到该提交；npm `1.0.4` 无 `gitHead`。
- 同一提交的工作区包是 `temporal-polyfill@1.0.4`、`temporal-spec@1.0.1`、`temporal-utils@1.0.2`。该提交也被标成 `temporal-utils@1.0.2`。
- 未安装 pnpm 工作区、未跑 Vitest / test262、未测 `dist` 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **polyfill 可以让位给原生**：默认导出先看 `globalThis.Temporal`。
2. **类型就是合同**：PlainDate 和 ZonedDateTime 不能互相假装。
3. **没有锚点的“一个月有多少毫秒”没有答案**：标准选择抛错，而不是填 30。
4. **默认 constrain 仍会改写非法日期**：reject 是选项，不是默认。

## 应用型自测

1. 环境里已经有 `globalThis.Temporal` 时，默认 `import { Temporal } from "temporal-polyfill"` 还保证用 polyfill 实现吗？
2. `Temporal.Duration.from({ months: 1 }).total("milliseconds")` 会算出一个数字还是抛错？
3. `PlainDate.from("2026-01-31").add({ months: 1 })` 默认得到 2 月 28 日还是抛错？

检查点：

1. 不保证。源码是 `NativeTemporal || Impl.Temporal`。
2. 抛 `Missing relativeTo`。月不是均匀单位。
3. 得到 2 月 28 日。默认 overflow 是 constrain。

## 延伸阅读

- 文档：[tc39.es/proposal-temporal](https://tc39.es/proposal-temporal)
- 固定源码：[fullcalendar/temporal-polyfill](https://github.com/fullcalendar/temporal-polyfill) —— 本文绑定 `d724c890761dfaf328af86d89f12fc3f644cdd81`
- [[luxon]] —— 一个 DateTime 类 + casual Duration 矩阵
- [[js-joda]] —— 同样拆 LocalDate / ZonedDateTime / Instant
- [[dayjs]] —— wrapper + plugin，不提供 Temporal 类型

## 关联

- [[luxon]] —— 时区同样借 `Intl`，但 Duration 无锚点时会估算
- [[js-joda]] —— java.time 命名，和 Temporal 的分层最像
- [[dayjs]] —— Moment API，不拆 PlainDate
- [[date-fns]] —— 函数 + `Date` / `TZDate`，不是 Temporal class

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[luxon]] —— Luxon — 用三个不可变类包装 Intl 的日期库
- [[projects/timelinejs]] —— TimelineJS — 把 Google Sheet 一键变成新闻时间线
- [[vis-timeline]] —— vis-timeline — 时间轴 / 日程 / 历史事件三合一组件
