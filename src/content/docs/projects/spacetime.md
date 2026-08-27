---
title: Spacetime — 自带 zonefile 的不可变时区计算器
description: 用自带 zonefile 计算远程时区墙钟的不可变日期库。
来源: https://github.com/spencermountain/spacetime
日期: 2026-08-27
分类: 日期时间
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/spencermountain/spacetime
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 33bf9574b88aaf9acde74ea88a308f92e53cdcd6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.13.0
---

## 是什么

Spacetime 是一个把“某个瞬时 + 某个时区”收成实例的日期计算器。日常类比：它随身带一本自己印的世界时钟手册，不算主机墙上的钟，也能回答“巴黎现在午饭了吗”。

实例只存 `epoch` 和 `tz`。读小时、打印、比大小，都先用打包 zonefile 把瞬时折成该时区的 wall clock。

```js
import spacetime from "spacetime"

let s = spacetime("March 1 2012", "America/New_York")
s = s.time("4:20pm")
s = s.goto("America/Los_Angeles")
s.time()
// 同一瞬时，洛杉矶读出来是 1:20pm
```

`goto` 换的是读法，不是墙上的针。

## 为什么重要

不读固定 7.13.0 源码，下面这些合同很容易和 [[luxon]] / [[formkit-tempo]] 混在一起：

- 为什么 README 写 “Zero Dependencies / 不必靠 Intl”，热路径却仍能算 DST
- 为什么 `s.d` 不是 `toNativeDate()`：前者是“骗过本机 Date 的墙钟”，后者才是 epoch
- 为什么 `goto(tz)` 和 `timezone(tz)` 不是同一件事
- 为什么大多数方法不可变，`.weekStart()` 却原地改

## 核心要点

固定版本的主链可以拆成五层：

1. **构造**：`spacetime(input, tz, options)` new 一个 `SpaceTime`。`findTz` 认 IANA、城市名、数字 offset；空 tz 回落一次 `Intl.resolvedOptions().timeZone`，没有就 `utc`。默认 `_weekStart = 1`（周一），`silent = true`。

2. **两份 Date**：`d` getter 用 `quickOffset` 加本机 `getTimezoneOffset`，造一棵让 `getHours()` 读起来像目标时区的 `Date`。`toNativeDate()` 是 `new Date(this.epoch)`。`toLocalDate` 已标 deprecated。

3. **自己的 zonefile**：`zonefile/unpack.js` 展开 offset、南北半球和 `dst: start->back`。`quickOffset` 只判断当前 epoch 落在夏令还是冬令，避免每次做完整 DST 推演。

4. **`goto` 保瞬时，`timezone` 保墙钟**：`goto` clone 后只改 `tz`。`timezone(tz)` 先 `json()` 再 `set()`，用同一组年/月/日/时去热换时区。

5. **加减先粗移再校准**：`add` 先按毫秒估计，再对年/季/月/周/日补偿 DST 差值；月份用 `months()` 建模，日超出当月就夹到最后一天。`subtract` 是 `add(num * -1)`。

## 实践示例

### 案例 1：同一瞬时，换时区读法

```js
import spacetime from "spacetime"

const ny = spacetime("2012-03-01T16:20:00", "America/New_York")
const la = ny.goto("America/Los_Angeles")
ny.epoch === la.epoch
// true
la.time()
```

`goto` 之后原来的 `ny` 不变。要问“把墙上 16:20 整段搬到另一个时区”，用 `timezone(...)`，不要用 `goto`。

### 案例 2：`d` 和 `toNativeDate` 不是同一个合同

```js
const s = spacetime.now("Asia/Shanghai")
s.toNativeDate() // 物理瞬时
s.d.getHours()   // 上海墙钟小时；这棵 Date 的 epoch 已被 offset+bias 挪过
```

把 `s.d` 再丢给别的库当瞬时，会把“显示用偏移”当成真时间。

### 案例 3：月份夹日，以及会变异的 weekStart

```js
const s = spacetime("2026-01-31", "utc")
s.add(1, "month").format("iso-short")
// 日被夹到 2 月最后一天

s.weekStart("sunday")
s._weekStart // 0；没有 clone
```

`hour(3)` / `year(2026)` 这类 setter 会 clone。`weekStart` 不会。

## 踩过的坑

1. **把 `s.d` 当原生瞬时传出去**：要瞬时用 `toNativeDate()` 或 `epoch`。
2. **用 `goto` 去做“保持 9:30 换时区”**：那是 `timezone(tz)`。`goto` 保持 epoch。
3. **假设 weekStart 也不可变**：它改当前实例。默认还是周一，不是周日。
4. **把 README 的 “约 40kb” 或 Temporal 支持写成已测事实**：本页未测体积；ISO 解析只是可选吃 `[IANA]`，并忽略日历注解。
5. **时区字符串随便写**：找不到会抛 `Cannot find timezone named`。空字符串才会走本机猜测。

## 适用 vs 不适用场景

**适用**：

- 要在弱 `Intl` 或需要离线 DST 的环境算远程墙钟
- 喜欢 Moment 风格的 `add` / `goto` / `startOf`，但要默认不可变
- 用 quarter、season、`whereIts` 这类民用单位，而不是只做 format

**不适用**：

- 只要几个纯函数、数据仍是 `Date` → [[formkit-tempo]] / [[date-fns]]
- 要标准 `PlainDate` / `ZonedDateTime` → [[temporal-polyfill]]
- 要 Java `java.time` 同名 API → [[js-joda]]
- 要运行时自动跟上 IANA 更新 → [[luxon]]（吃平台 ICU）

## 固定版本边界

- 本文绑定 `spencermountain/spacetime@33bf9574b88aaf9acde74ea88a308f92e53cdcd6`，tag / npm `7.13.0`，`gitHead` 同指。
- `src/_version.js` 报 `7.13.0`。无 production 依赖。协议 Apache-2.0。
- `max` / `min` 使用 `±8640000000000000`。插件是 `extend` / `plugin` 往 prototype 挂方法，本页未审独立 plugin 包。
- 未安装依赖、未跑 tape，状态保持 `UNVERIFIED`。

## 学到什么

1. **时区表可以离开 Intl**——代价是表要自己更新。
2. **“不可变 API”仍可能留下原地 setter**——`weekStart` 就是裂缝。
3. **同一棵 Date 有两种用法**——墙钟投影和物理瞬时不能混。
4. **换时区要先问保的是针还是瞬间**——`timezone` 对 `goto`。

## 应用型自测

1. `s.goto("Europe/Paris")` 之后，`s.epoch` 和原实例比会变吗？
2. 要把“今天 09:30”整段改到巴黎，该用 `goto` 还是 `timezone`？
3. `spacetime("2026-01-31","utc").add(1,"month")` 的日是 31 还是 2 月最后一天？

检查点：

1. 新实例 epoch 不变；原实例也不变。
2. `timezone("Europe/Paris")`。`goto` 只换读法。
3. 2 月最后一天。`keepDate` 会按目标月长度夹日。

## 延伸阅读

- 固定源码：[spencermountain/spacetime](https://github.com/spencermountain/spacetime) —— 本文绑定 `33bf9574b88aaf9acde74ea88a308f92e53cdcd6`
- 审查记录：仓库内 `docs/date-leftover-source-review-20260827-ee.md`
- [[luxon]] —— 同样做时区，但偏移来自 `Intl`
- [[formkit-tempo]] —— 函数 + 原生 Date 对照
- [[temporal-polyfill]] —— 标准 `ZonedDateTime` 对照

## 关联

- [[luxon]] —— 平台 ICU 时区对照
- [[formkit-tempo]] —— 不造实例、用 `Intl` 算 offset
- [[dayjs]] —— 链式 API，时区是 plugin
- [[js-joda]] —— 强类型民用日期对照
- [[temporal-polyfill]] —— `withTimeZone` 对 `goto`
