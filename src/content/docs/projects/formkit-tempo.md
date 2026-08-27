---
title: FormKit Tempo — 不造日期对象，只给原生 Date 配 Intl 工具函数
description: 一组操作原生 Date 的 Intl 工具函数，不另造日期类型。
来源: https://github.com/formkit/tempo
日期: 2026-08-27
分类: 日期时间
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/formkit/tempo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 00dc3dc9837a461e1e7766bc3f560966d6b00007
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.1.0
---

## 是什么

FormKit Tempo（npm `@formkit/tempo`）是一组操作原生 `Date` 的工具函数，不是新的日期类型。日常类比：它不另做一本日历，只把墙上那本日历翻给你看、帮你加减页，时区和文案交给运行时的 `Intl.DateTimeFormat`。

它和仓库里的 [[tempo]]（Grafana 追踪后端）不是同一个项目。本页只谈日期库。

```ts
import { date, format, addDay } from "@formkit/tempo"

const d = date("2026-05-30")
format(d, "YYYY-MM-DD")
addDay(d, 1) // 新 Date；d 不变
```

`date()` 只接受 `Date`、ISO 8601 字符串或空值。空值等于现在；`Date` 会再 `new Date(...)` 克隆一份。

## 为什么重要

不读固定 1.1.0 源码，下面这些合同很容易被“又一个小日期库”带偏：

- 为什么它能跟 [[date-fns]] 一样 tree-shake，却把 locale / 时区偏移交给 `Intl`，而不是自带 CLDR
- 为什么 `"2026-05-30"` 不会先被 JS 收成 UTC 午夜：`date()` 会补 `T00:00:00`
- 为什么 `tzDate` 改的是“这段 wall clock 属于哪个时区”，不是 [[spacetime]] 的 `goto`
- 为什么 `add({ months: 1 })` 默认不会把 1 月 31 日推到 3 月

## 核心要点

固定版本的主链可以拆成五步：

1. **入口全是函数**：`src/index.ts` 只 re-export `date`、`format`、`parse`、`add*`、`tzDate`、`offset` 等。没有 wrapper、没有 `extend`。

2. **ISO 是硬门**：`iso8601Match` 要求年-月，日/时/分/秒和带秒的 offset 可选。非 ISO 直接抛 `Non ISO 8601 compliant date`。

3. **格式化先搬到 UTC 再填 token**：`format` 读 `deviceTZ()`；指定 `tz` 时先算 offset。`fill()` 用 `Intl.DateTimeFormat(..., { timeZone: "UTC" })` 出 part，再按 `YYYY` / `MMM` / `Z` 拼回去。

4. **时区是 offset 算术**：`offset()` 对两个时区各做一次 `formatToParts`，差值写成 `+08:00` 或带秒的形式。`tzDate(input, tz)` = `applyOffset(date(input), offset(d, tz))`。

5. **历法溢出可关**：`addMonth` 默认 `dateOverflow=false`，先把日改成 1，加完月再夹到目标月最后一天。`add()` 在 `months`/`years` 为负时先走历法单位，否则先走日以下的固定时长。

## 实践示例

### 案例 1：短日期补本地午夜，而不是 UTC

```ts
import { date } from "@formkit/tempo"

date("2026-05-30")
// 内部先变成 "2026-05-30T00:00:00"，再交给 Date
// 传入已有 Date 时返回克隆，原对象不会被后续 setHours 改掉
```

需要带时区的瞬时，写完整 ISO（含 `Z` 或 `+08:00`）。`2012-01` 这种年-月也能过正则。

### 案例 2：按 IANA 名字格式化，而不是改 Date 的 epoch 语义

```ts
import { format } from "@formkit/tempo"

format({
  date: "2026-05-30T12:00:00Z",
  format: "YYYY-MM-DD HH:mm Z",
  tz: "Asia/Shanghai",
})
```

指定 `tz` 时，实现先算 UTC→该时区的 offset，再 `removeOffset`，最后按 UTC 填 token。`locale: "device"` 会改成 `deviceLocale()`。

### 案例 3：解析溢出与 `tzDate`

```ts
import { parse, tzDate } from "@formkit/tempo"

parse({ date: "2023-02-29", format: "YYYY-MM-DD", dateOverflow: "throw" })
// 抛 Invalid date 2023-02-29

parse({ date: "2023-02-29", format: "YYYY-MM-DD" })
// 默认 backward：日被夹到 2 月 28 日

tzDate("2017-05-06T12:00", "Europe/Amsterdam")
// 把 12:00 当成阿姆斯特丹 wall clock，再换成对应瞬时
```

`parse` 的 offset 支持秒（`-05:32:11`）。没有 offset 时，ISO 字符串按本地 `Date` 构造。

## 踩过的坑

1. **把任意自然语言丢给 `date()`**：`May 30 2026` 不是 ISO，会抛错。要先 `parse(..., "MMMM D YYYY", locale)`。
2. **把 `tzDate` 想成 `goto`**：它解释 wall clock，不保持 epoch。换“同一瞬间、另一时区的读法”是 [[spacetime]] / Temporal 的活。
3. **以为 `add({ months: 1 })` 会溢出到下下个月**：默认先回到 1 号再夹日。要原生 `setMonth` 那种溢出，得显式 `dateOverflow: true`。
4. **把仓库 size-limit 写成自己测过的体积**：脚本把全部 ESM 标成 `5.1 kb`，本页没有跑过。

## 适用 vs 不适用场景

**适用**：

- 已经在用原生 `Date`，只缺 format / parse / 加减，并且目标环境有 `Intl`
- 想按函数导入、跟 [[date-fns]] 一样 tree-shake，但 token 更接近 Day.js 的 `YYYY-MM-DD`
- 需要带秒的 offset，或不想为 locale 再打一份数据

**不适用**：

- 要不可变民用日期类型、区分生日和瞬时 → [[temporal-polyfill]] / [[js-joda]]
- 要自带 zonefile、离线算 DST、不依赖 `Intl` → [[spacetime]]
- 已经有 Moment 链式 API 存量 → [[dayjs]]
- 需要完整 `DateTime` / `Duration` / `Interval` 三类 → [[luxon]]

## 固定版本边界

- 本文绑定 `formkit/tempo@00dc3dc9837a461e1e7766bc3f560966d6b00007`，tag `v1.1.0`，npm `@formkit/tempo@1.1.0` 的 `gitHead` 同指。
- 无 production 依赖。测试脚本写死 `TZ=America/New_York`。
- 未安装依赖、未跑 vitest / size-limit，状态保持 `UNVERIFIED`。

## 学到什么

1. **“小”可以来自少造类型**——合同写在函数上，数据仍是 `Date`。
2. **短日期的 ISO 缺口必须显式补**——否则 JS 会先帮你选 UTC。
3. **时区名字最后都会变成 offset 秒数**——`Intl` 只负责算出这个差。
4. **历法加减和环钟加减不是同一条管道**——负的月/年会先改日历。

## 应用型自测

1. `date("2026-05-30")` 会不会按 UTC 午夜解析？实现先做了什么？
2. `addMonth("2026-01-31", 1)` 默认落到 3 月还是 2 月？
3. `tzDate("2017-05-06T12:00", "Europe/Amsterdam")` 保的是 epoch 还是 12:00 这组 wall clock？

检查点：

1. 不会先当 UTC。缺时刻时补 `T00:00:00`，再交给本地 `Date`。
2. 默认 2 月最后一天。`dateOverflow=false` 会先回到 1 号再夹日。
3. 保 12:00 这组 wall clock，再换算瞬时。

## 延伸阅读

- 官方文档：[tempo.formkit.com](https://tempo.formkit.com)
- 固定源码：[formkit/tempo](https://github.com/formkit/tempo) —— 本文绑定 `00dc3dc9837a461e1e7766bc3f560966d6b00007`
- 审查记录：仓库内 `docs/date-leftover-source-review-20260827-ee.md`
- [[date-fns]] —— 同样不造类型，但 token 和时区入口不同
- [[spacetime]] —— 自带 zonefile 的对照

## 关联

- [[date-fns]] —— 函数式、原生 `Date` 对照
- [[dayjs]] —— 链式 wrapper 对照
- [[luxon]] —— 同样吃 `Intl`，但是 class
- [[spacetime]] —— 自带 DST 表，不走 `Intl` 热路径
- [[temporal-polyfill]] —— 标准类型对照
- [[tempo]] —— Grafana 追踪后端，名字撞车，不是本库
