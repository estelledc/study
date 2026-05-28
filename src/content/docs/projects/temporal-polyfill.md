---
title: Temporal API JavaScript 现代日期时间标准
来源: https://tc39.es/proposal-temporal + https://github.com/fullcalendar/temporal-polyfill + https://github.com/tc39/proposal-temporal
---

# Temporal API —— TC39 Stage 3 提案，从底层重新设计 JS 的日期时间

## 一句话总结

Temporal 是 TC39（ECMAScript 标准委员会）正在推进的 Stage 3 提案，目标是**彻底替换 JavaScript 内置的 `Date` 对象**。它由 Maggie Pint（曾是 Moment.js 维护者）、Philipp Dunkel、Richard Gibson 等人主推，从 2017 年开始 incubation，2021 年进入 Stage 3，到 2026 年仍在 Stage 3（迟迟不进 Stage 4）。

设计哲学一句话：**"Date 是 1995 年仿照 java.util.Date 仓促设计的，留下了 mutable / 月份从 0 / TZ 不内置 / 算术不直观四大债。Temporal 用 6 个不可变 class 把日期、时间、时区、时长拆开，每个类只做一件事，严格类型化、零歧义"**。这条思路和 Season 23 工具库 B 分支同期的 dayjs / date-fns / luxon 都不一样：dayjs 押"Moment API + plugin 化"做用户态库，date-fns 押"function-per-feature + tree-shake"做 fp 库，luxon 押"重写 Moment 但仍在用户态"，Temporal 押的是**直接进语言标准，把"日期时间"做成 ECMAScript 内置**。

temporal-polyfill 是 FullCalendar 团队（Adam Shaw 等）写的实现，bundle 比官方 reference polyfill 小 50%，是当前生产推荐。一旦 Temporal 进 Stage 4 并被浏览器/Node 内置，所有这些 polyfill 都会消失——但那一天到 2026 年还没来。

Temporal 的目标用户：

- 业务严肃依赖跨时区/DST/多日历（航空/金融结算/历法转换/科学计算）
- 已经吃过 `new Date('2026-05-29')` 在 `UTC` 还是本地的歧义苦头
- 押注 ECMAScript 标准，宁愿等几年也要写"未来代码"
- 项目寿命 5 年以上，愿意为标准化做迁移成本

非目标用户：

- bundle 极致敏感（< 5 KB）→ dayjs / date-fns 仍小 5-10 倍
- 项目寿命 < 1 年，CTO 一年后就跑路 → 用 dayjs 搞定就行
- 不需要时区/历法，只是 format 一下 → Date + Intl.DateTimeFormat 够用
- 只想"少改两行代码"现代化已有 Moment 项目 → luxon 更顺手

> 怀疑：Temporal 在 Stage 3 已经卡了 6+ 年（2021 → 2026），进 Stage 4 一直延期。这种"标准化漫长"是 ECMAScript 流程问题（TC39 太谨慎），还是 Temporal 本身设计有争议（API 太大、calendar 系统过重、和现有 Date 互操作复杂）？Layer 6 把这个展开看。
> 怀疑：Temporal 6 大类（PlainDate / PlainTime / PlainDateTime / ZonedDateTime / Instant / Duration）让 API 表面积变大，新人学习曲线明显比 dayjs 陡。是不是"严谨过头"？dayjs / date-fns 的"扁平 API"虽然不严谨但学习快，社区接受度高。这条要在 Layer 4 / Layer 5 用使用场景对照看。
> 怀疑：polyfill 即使 tree-shake 后 ~15 KB（fullcalendar/temporal-polyfill），官方 @js-temporal/polyfill 接近 30 KB。在 Stage 4 浏览器原生支持前，bundle 比 dayjs 大 5-10 倍，是早期采用者的代价。这种"为了未来标准付现在的 bundle 税"，到底值不值？

![Temporal class hierarchy](/projects/temporal-polyfill/01-class-hierarchy.webp)

## Layer 0 —— 档案速查

| 维度 | 信息 |
|---|---|
| 提案规范 | https://tc39.es/proposal-temporal |
| 官方仓库 | https://github.com/tc39/proposal-temporal |
| Stage | Stage 3（2021 年进入，到 2026 仍未进 Stage 4） |
| Champion | Maggie Pint / Philipp Dunkel / Richard Gibson / Jase Williamson |
| 起步 | 2017 年（前身是 js-joda 启发） |
| 主推动力 | Moment.js 团队（Maggie Pint）+ TC39 工作组 |
| 协议 | MIT（提案 + reference polyfill） |
| 主要 polyfill 实现 | @js-temporal/polyfill（官方 reference） / @fullcalendar/temporal-polyfill（生产推荐） |
| @js-temporal bundle | core ~30 KB（min+gzip），未 tree-shake 完整功能 |
| @fullcalendar bundle | core ~15 KB（min+gzip），tree-shake 后更小 |
| 核心 class | 6 个：PlainDate / PlainTime / PlainDateTime / ZonedDateTime / Instant / Duration |
| 辅助 class | PlainYearMonth / PlainMonthDay / Calendar / TimeZone |
| 测试 | 官方 test262 一致性套件，所有 polyfill 必须通过 |
| 浏览器原生支持 | 截至 2026-05，仅 Chrome/Firefox 后台开关启用，未默认 |
| Node 原生支持 | 截至 2026-05，无（需 polyfill） |

Temporal 在 npm 工具库生态里的"位置"：

- 和 Moment.js（同 Maggie Pint 主导前作）：API 完全不兼容、不可变、TZ + Calendar 是核心；这是"重启基座"不是"升级"。
- 和 dayjs / date-fns（同年代 user-land 库）：哲学正交——它们绑用户态生态做小巧/fp，Temporal 直接做标准。
- 和 luxon（同年代）：路径不同——luxon 在用户态做完整重写，Temporal 直接做语言内置；两者都是 Maggie Pint 留下的精神后裔。
- 和 java.time（Java 8+）：思想直接来源；PlainDate ↔ LocalDate / ZonedDateTime ↔ ZonedDateTime / Instant ↔ Instant 几乎一一对应。

## Layer 1 —— 核心抽象：6 大不可变类，每类只做一件事

Temporal 的"原子结构"是 6 个 class，每个负责一类时间概念，全部 immutable，所有"修改"操作返回新实例。

```js
import { Temporal } from '@fullcalendar/temporal-polyfill';

// 1. PlainDate —— 只有日期，没有时间，没有 TZ
const birthday = Temporal.PlainDate.from('2026-05-29');
// 用途：生日 / 节日 / 截止日 —— 这些和"具体几点"无关

// 2. PlainTime —— 只有时间，没有日期，没有 TZ
const meeting = Temporal.PlainTime.from('09:30');
// 用途：营业时间 / 闹钟 —— 这些和"哪一天"无关

// 3. PlainDateTime —— 日期 + 时间，但仍无 TZ
const event = Temporal.PlainDateTime.from('2026-05-29T09:30');
// 用途：表单输入 / 本地事件 —— "壁挂时钟" 概念

// 4. ZonedDateTime —— 完整带 IANA TZ 的时间点
const flight = Temporal.ZonedDateTime.from(
  '2026-05-29T09:30+08:00[Asia/Shanghai]'
);
// 用途：航班 / 跨国会议 / DST 算术 —— 和真实物理时间挂钩

// 5. Instant —— 绝对 UTC 时间点（纳秒精度）
const log = Temporal.Instant.from('2026-05-29T01:30:00Z');
// 用途：日志时间戳 / 系统事件 —— 和 wall clock 解耦的物理时间

// 6. Duration —— 精确时长，保留单位语义
const dur = Temporal.Duration.from({ months: 1, days: 3, hours: 5 });
// 用途：'加 1 个月' / '间隔 3 天'  —— 不归一化为毫秒，保留单位
```

四个辅助 class：

```js
// 7. PlainYearMonth —— 只有年月（无日期）
const billingMonth = Temporal.PlainYearMonth.from('2026-05');

// 8. PlainMonthDay —— 只有月日（无年份）—— 适合每年生日
const everyYearBirthday = Temporal.PlainMonthDay.from('--05-29');

// 9. Calendar —— 历法系统（iso8601 / chinese / hebrew / ...）
const chineseDate = birthday.withCalendar('chinese');
// → 中国农历下的同一日期表示

// 10. TimeZone —— IANA 时区
const tz = Temporal.TimeZone.from('Asia/Shanghai');
```

为什么要拆 6 类？因为 JavaScript Date 把这些都揉在一起，导致：

- `new Date('2026-05-29')` 在 UTC 解析（00:00 UTC），但 `new Date('2026-05-29 09:30')` 在本地解析（09:30 本地）—— **同一构造函数解析规则不一致**。
- `date.getMonth()` 从 0 开始，但 `date.getDate()` 从 1 开始 —— **同一 API 索引规则不一致**。
- 没有 IANA TZ 的概念，只有"本地 TZ" 和 `UTC`，跨时区计算只能靠用户态库。
- mutable —— `date.setMonth(0)` 直接修改原对象，传参后被远端修改是常见 bug。

Temporal 用"严格类型化 + 不可变"两条原则解决这些问题。每个 class 只接受自己应该接受的输入，每个方法都返回新实例。

> 怀疑：6 大类的代价是 API 表面积大。新人写 `Temporal.PlainDateTime.from(...).toZonedDateTime('Asia/Shanghai')` 比 dayjs `dayjs('2026-05-29').tz('Asia/Shanghai')` 多打 30 字符。这种"严谨"是不是把简单的事情复杂化了？我目前的判断：**业务严肃依赖 TZ 时是值得的（dayjs 隐式 TZ 切换造成的 bug 比写 30 字符贵），但日常 format 场景过度**。

## Layer 2 —— 设计原则：四条把 Date 的债一次还清

Temporal 在 README 和 proposal 里反复强调的设计原则是这四条：

### 原则 1: Immutable

所有 Temporal 类都是 immutable，所有"修改"操作返回新实例。

```js
const date = Temporal.PlainDate.from('2026-05-29');
const next = date.add({ days: 1 });
// date 仍然是 2026-05-29
// next 是 2026-05-30
```

对照 Date：

```js
const d = new Date('2026-05-29');
d.setDate(d.getDate() + 1);
// d 被修改了 —— 传参时如果调用方继续用 d，状态污染
```

immutable 在 React / Redux 时代特别重要，因为状态共享时 mutable 对象是 bug 源。

### 原则 2: Strict typing（严格类型）

每个 class 只接受自己应该接受的输入，混类型直接抛错。

```js
const date = Temporal.PlainDate.from('2026-05-29');
const time = Temporal.PlainTime.from('09:30');

// 想要拼 PlainDateTime？显式转换
const dt = date.toPlainDateTime(time);
// 不能直接 date + time，必须显式说明你在做什么

// 想 PlainDateTime → ZonedDateTime？必须显式给 TZ
const zdt = dt.toZonedDateTime('Asia/Shanghai');
```

对照 Date / dayjs：

```js
// dayjs 隐式：你以为你的 dayjs 是 UTC，实际是本地 TZ
const d = dayjs('2026-05-29');     // 这是本地 TZ 还是 UTC？要看构造规则和 plugin
```

### 原则 3: No ambiguity（消除歧义）

Date 在 ISO 字符串解析上的"日期 vs 日期+时间"分裂，是 Temporal 直接消除的痛点。

```js
// Date 的歧义
new Date('2026-05-29');        // UTC 00:00
new Date('2026-05-29 00:00');  // 本地 00:00（或者解析失败，浏览器不一致）
new Date('2026-05-29T00:00');  // ECMA 2015 才规定为本地 TZ

// Temporal 的明确性
Temporal.PlainDate.from('2026-05-29');           // 一定是 PlainDate（无 TZ）
Temporal.PlainDateTime.from('2026-05-29T00:00'); // 一定是 PlainDateTime（无 TZ）
Temporal.ZonedDateTime.from('2026-05-29T00:00[Asia/Shanghai]');  // 必须显式带 TZ
```

每种语义对应一个类型，输入串和类型不匹配直接抛错。

### 原则 4: First-class TimeZone + Calendar

IANA 时区和非 ISO 历法（中国农历 / 希伯来历 / 印度历）是一等公民，不是 plugin。

```js
const tokyo = Temporal.ZonedDateTime.from('2026-05-29T09:30[Asia/Tokyo]');
const shanghai = tokyo.withTimeZone('Asia/Shanghai');
// shanghai 是同一物理时刻，TZ 切到上海
// 自动处理 DST、负时区、夏令时切换的 wall clock 跳跃

const chinese = tokyo.withCalendar('chinese');
// chinese 是同一时刻在中国农历下的表示
```

luxon 也内置 TZ，但 Calendar 系统不像 Temporal 这么完整。dayjs / date-fns 都需要 plugin。

## Layer 3 —— 精读 3 段

### 段 a：PlainDate vs ZonedDateTime —— 为什么"严格分两类"是核心设计

链接示意：[fullcalendar/temporal-polyfill src/classApi/plainDate.ts](https://github.com/fullcalendar/temporal-polyfill/blob/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4/src/classApi/plainDate.ts)

PlainDate 和 ZonedDateTime 是 Temporal 设计哲学最尖锐的分界。理解它就理解整个 API 为什么这么拆。

**核心区别**：

| 维度 | PlainDate | ZonedDateTime |
|---|---|---|
| 时区 | 无 | 有（IANA） |
| 表达 | "2026 年 5 月 29 日" | "上海时间 2026-05-29 09:30" |
| 物理时间 | 无定义 | 唯一定义（可转 Instant） |
| 用例 | 生日 / 截止日 / 节日 | 航班 / 会议 / 排班 |

**为什么生日要用 PlainDate？**

如果用 ZonedDateTime 表示生日 "2000-05-29"：

```js
// 错误用法：用 ZonedDateTime 存生日
const birthday = Temporal.ZonedDateTime.from('2000-05-29T00:00[Asia/Shanghai]');
```

那么这个生日在用户飞到纽约时就变成了 `2000-05-28 12:00 EST` —— 字面"日期"变了一天。但生日的语义就是"5 月 29 日"，不应该跟着 TZ 漂移。

**为什么航班要用 ZonedDateTime？**

```js
// 正确用法：航班用 ZonedDateTime
const departure = Temporal.ZonedDateTime.from('2026-05-29T09:30[Asia/Shanghai]');
const arrivalNY = departure.toZonedDateTime('America/New_York');
// arrivalNY 自动反映"在纽约时钟上看，飞机起飞是几点"
// 这是物理时间不变，wall clock 表示变
```

如果航班用 PlainDateTime（无 TZ）：

```js
// 错误用法：用 PlainDateTime 存航班
const flight = Temporal.PlainDateTime.from('2026-05-29T09:30');
// 这"9:30"是哪里时间？地球上每一个时区都有 9:30，没法 join 物理事件
```

**dayjs / date-fns / luxon 的对比**：

- dayjs：默认 dayjs 对象是 PlainDateTime 还是 ZonedDateTime？取决于 plugin 配置和构造方式 —— **隐式**。
- date-fns：所有函数都接受 Date，Date 既是 PlainDateTime 也是 Instant 也是 ZonedDateTime —— **混淆**。
- luxon：DateTime 既是 PlainDateTime 也是 ZonedDateTime（取决于 zone 字段是否设置）—— **半隐式**。
- Temporal：明确分两类，类型系统就把错误使用挡在编译期 —— **显式**。

> 怀疑：Temporal 这种"强类型"是不是过度设计？大部分日期库用户根本分不清 PlainDate / ZonedDateTime，他们就想要一个"日期对象"。这种"教育用户"的成本是不是太高？我目前的判断：**对于"业务关键"项目（航空/金融/排班）值得；对于"展示日期"项目（博客发布日/评论时间）过度**。

### 段 b：Duration —— 精确表达 1 月 / 3 周 / 5 小时

链接示意：[tc39/proposal-temporal polyfill/lib/plaindate.ts](https://github.com/tc39/proposal-temporal/blob/9f8e7d6c5b4a3210fedcba9876543210fedcba98/polyfill/lib/plaindate.ts)

Duration 是 Temporal 最精妙、和 Date 差距最大的部分。

**Date 的痛**：JS 里没有"时长"类型，只有 `number` 表示毫秒。所以"1 个月" 这种语义没法表达，因为不同月份的天数不同。

```js
// Date 时代的"加 1 个月"
const d = new Date('2026-01-31');
d.setMonth(d.getMonth() + 1);
console.log(d);  // 2026-03-03（不是 2026-02-31，因为 2 月没有 31）
// 没法精确表达"1 月 31 日 + 1 个月" 应该是 2 月 28/29 日还是 3 月 3 日
```

**Temporal Duration 的精确表达**：

```js
const d = Temporal.PlainDate.from('2026-01-31');
const oneMonth = Temporal.Duration.from({ months: 1 });

// add 时可以指定 overflow 行为
const d1 = d.add(oneMonth, { overflow: 'constrain' });
// → 2026-02-28（截断到 2 月最后一天）

const d2 = d.add(oneMonth, { overflow: 'reject' });
// → 抛错（因为 2 月没有 31）
```

**Duration 不归一化的设计**：

```js
const d = Temporal.Duration.from({ months: 1, days: 3 });

// d.total({ unit: 'milliseconds' });
// → 抛错！"1 month 3 days" 不能转毫秒，因为不同月份天数不同

// 必须给 reference 才能精确转换
d.total({ unit: 'milliseconds', relativeTo: '2026-01-01' });
// → 2,937,600,000 ms（基于 2026-01 是 31 天计算）
```

对照 dayjs：dayjs duration 直接归一化为毫秒，丢失"月"语义。

```js
const dur = dayjs.duration({ months: 1, days: 3 });
// 内部立即变成 ~32 天的毫秒数，丢失"1 个月"语义
// 后续不管 relativeTo 是 2 月还是 12 月都用同一毫秒数
```

> 怀疑：Duration 不归一化非常严谨，但用户体验是"abs error"频出。每次加 month 都要决定 overflow 策略，每次 total 都要给 relativeTo。这是不是把"日期数学"的复杂性暴露给所有调用者？我目前判断：**业务严肃用 Duration，UI 展示场景仍然用 dayjs.duration 短平快**。

### 段 c：与 Intl 集成 —— locale / format

链接示意：[fullcalendar/temporal-polyfill src/classApi/zonedDateTime.ts](https://github.com/fullcalendar/temporal-polyfill/blob/b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5/src/classApi/zonedDateTime.ts)

Temporal 不内置 i18n，而是直接走平台 `Intl.DateTimeFormat`。这一点和 luxon 一致，和 Moment.js 内置 CLDR 不同。

```js
const now = Temporal.Now.zonedDateTimeISO('Asia/Shanghai');

// 走 Intl.DateTimeFormat
const formatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Shanghai',
});

formatter.format(now.toInstant().epochMilliseconds);
// → "2026年5月29日 09:30"
```

注意 `formatter.format` 接受的是 `epochMilliseconds`（数字）或 Date 对象，不直接接受 ZonedDateTime。所以 Temporal 设计了 `toLocaleString` 方法：

```js
now.toLocaleString('zh-CN', {
  dateStyle: 'long',
  timeStyle: 'short',
});
// → "2026年5月29日 09:30"
```

底层实际上是 polyfill 把 ZonedDateTime 抽成 Intl 能吃的格式再 format。这种"平台 API + 薄封装"和 Moment 时代 "全部自己实现" 的差别是：

- bundle 小（i18n 数据由浏览器/Node 提供）
- locale 覆盖完整（CLDR 由平台维护）
- 和 `Intl.NumberFormat` / `Intl.RelativeTimeFormat` 协同

但代价是：

- 旧浏览器/Node 的 Intl 不全（IE11 / 旧 Safari），Temporal 在这些环境降级
- 自定义 format 要写 token 模板时不直接支持（必须先抽到 Intl 的 options）

## Layer 4 —— 与 Date / dayjs / date-fns / luxon 对比

把"加 1 个月 + 切到上海时区 + 输出 zh-CN 格式"这件事在 5 个工具里写出来：

```js
// (1) 原生 Date
const d = new Date('2026-04-29T09:30:00');
d.setMonth(d.getMonth() + 1);
const formatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Shanghai',
});
formatter.format(d);
// 痛点：mutable / 月份从 0 / TZ 是 format 参数不是数据 / 没有 Duration

// (2) dayjs (with utc + timezone + locale plugin)
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/zh-cn';
dayjs.extend(utc);
dayjs.extend(timezone);

dayjs('2026-04-29 09:30')
  .add(1, 'month')
  .tz('Asia/Shanghai')
  .locale('zh-cn')
  .format('YYYY年MM月DD日 HH:mm');
// 痛点：plugin 依赖隐式 / TZ 是 mutator 不是 type / 模糊语义

// (3) date-fns
import { addMonths } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const d = new Date('2026-04-29T09:30:00');
const next = addMonths(d, 1);
formatInTimeZone(next, 'Asia/Shanghai', 'yyyy年MM月dd日 HH:mm', { locale: zhCN });
// 痛点：必须组合 date-fns + date-fns-tz / fp 风格学习曲线

// (4) luxon
import { DateTime } from 'luxon';

DateTime
  .fromISO('2026-04-29T09:30')
  .plus({ months: 1 })
  .setZone('Asia/Shanghai')
  .setLocale('zh-CN')
  .toFormat('yyyy年MM月dd日 HH:mm');
// 痛点：DateTime 既可以无 TZ 又可以有 TZ，语义半隐式

// (5) Temporal (polyfill)
import { Temporal } from '@fullcalendar/temporal-polyfill';

const dt = Temporal.PlainDateTime.from('2026-04-29T09:30');
const next = dt.add({ months: 1 });
const zoned = next.toZonedDateTime('Asia/Shanghai');
zoned.toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' });
// 优点：每步类型转换显式 / 不可变 / TZ 是类型不是参数
// 代价：API 表面积大、bundle ~15 KB
```

观察：

- **Date**：能跑但每行都是坑
- **dayjs**：plugin 拼装隐式陷阱多
- **date-fns**：fp 风格 + tz 子包，对老用户友好
- **luxon**：OOP chain 顺手，但 DateTime 的双重身份是隐患
- **Temporal**：类型系统把错误挡在编译期，代价是学习曲线和 API 大小

## Layer 5 —— 6 维对比

| 维度 | 原生 Date | dayjs | date-fns | luxon | Temporal |
|---|---|---|---|---|---|
| **bundle** | 0（内置） | ~2 KB | ~12 KB（tree-shake） | ~22 KB | ~15-30 KB（polyfill） |
| **可变性** | mutable（坑） | immutable | function 风格 | immutable | immutable |
| **TZ 内置** | 无 | plugin | tz 子包 | 内置 | 内置（一等公民） |
| **历法** | ISO 8601 | plugin | 无 | 部分 | 多历法（chinese / hebrew / etc） |
| **类型严格** | 单一类（混淆） | 单一类（隐式） | function（无 class） | 单 class（半隐式） | 6 类（显式） |
| **i18n** | Intl | plugin | 子包 | Intl | Intl |
| **进语言标准** | 是（已是） | 否 | 否 | 否 | 是（Stage 3 → 4） |

## Layer 6 —— 限制与争议

**1. Stage 3 卡了 6+ 年，标准化漫长**

Temporal 2021 年进 Stage 3，到 2026 年仍然没进 Stage 4。原因：
- API 表面积大（6+ class、几百个方法），spec 文本极长，editor 校对慢
- Calendar 系统设计需要 ICU / CLDR 数据，和 Intl 的边界要划清
- 浏览器实现工程量大（V8 / SpiderMonkey / JavaScriptCore 各自要做）
- 和 Date 的互操作（如何让 `new Date(zdt.epochMilliseconds)` 正常）讨论反复

代价：早期采用者的 polyfill 会一直存在。

**2. API 表面积大，学习曲线陡**

新人看 dayjs 文档 1 小时能用，看 Temporal 文档 1 周还在区分 PlainDate / ZonedDateTime / Instant 该用哪个。这是"严谨过头"的代价。

**3. polyfill bundle 不小**

@js-temporal/polyfill ~30 KB，@fullcalendar/temporal-polyfill ~15 KB（tree-shake 后）。比 dayjs（~2 KB）大 7-15 倍。在 Stage 4 浏览器原生支持前，bundle 是早期采用者付出的"未来税"。

**4. 与 Date 互操作**

转 Date 必须经过 Instant 或 epochMilliseconds：

```js
const zdt = Temporal.ZonedDateTime.from('2026-05-29T09:30[Asia/Shanghai]');
const date = new Date(zdt.epochMilliseconds);
// 反向：
const zdt2 = Temporal.Instant
  .fromEpochMilliseconds(date.getTime())
  .toZonedDateTimeISO('Asia/Shanghai');
```

老代码大量使用 Date 时，每次互操作都要写转换层，迁移成本高。

**5. Calendar 系统的复杂性**

支持多历法（chinese / hebrew / islamic / hindu / etc）让 spec 文本极重。但实际上 99% 的 web 应用只用 iso8601，calendar 系统是"为了 1% 场景付 100% 复杂度"的争议点。

> 怀疑：Calendar 系统是 Temporal Stage 3 卡这么久的关键原因之一。如果只支持 iso8601，spec 一半就够了。这种"全部一次到位" 的标准化策略，对早期可用性是负作用 —— 但语言标准就是这样，一旦定下就改不了。

## 怀疑总集

1. **Stage 3 卡 6+ 年是流程问题还是设计问题？** —— 两者都有。TC39 流程谨慎是正常的（一旦定下永远不能改），Temporal 自身 Calendar 系统也确实复杂。
2. **6 大类 vs 单一类的学习曲线代价值不值？** —— 业务严肃依赖 TZ / 历法时值得，普通展示场景过度。
3. **bundle 比 dayjs 大 7-15 倍是早期采用者的税？** —— 是。但站在 5 年项目寿命视角，迁移成本一次付清比 dayjs 长期带 plugin 债低。
4. **Duration 不归一化是严谨还是劝退？** —— 严谨派必经之路，UI 展示场景过度。
5. **temporal-polyfill 和 @js-temporal/polyfill 哪个生产推荐？** —— FullCalendar 团队的 fullcalendar/temporal-polyfill 现在 bundle 更小、性能更好；官方 reference polyfill 用于规范一致性测试。
6. **Calendar 系统是不是为 1% 场景付 100% 复杂度？** —— 是。但语言标准必须一次到位，没法事后扩展非 ISO 历法。
7. **如果 Stage 4 永远不来，Temporal 会变成"luxon 第二"吗？** —— 可能。但即使最坏情况，Temporal API 已经被 polyfill 化为可用的库，本身就是产品。

## GitHub permalink 引用（链接示意，hash 为示意）

- [fullcalendar/temporal-polyfill PlainDate 实现](https://github.com/fullcalendar/temporal-polyfill/blob/a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4/src/classApi/plainDate.ts) —— 段 a 引用
- [tc39/proposal-temporal reference polyfill PlainDate](https://github.com/tc39/proposal-temporal/blob/9f8e7d6c5b4a3210fedcba9876543210fedcba98/polyfill/lib/plaindate.ts) —— 段 b 引用
- [fullcalendar/temporal-polyfill ZonedDateTime 实现](https://github.com/fullcalendar/temporal-polyfill/blob/b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5/src/classApi/zonedDateTime.ts) —— 段 c 引用

## 实战感受

这是 Season 23 工具库 B 分支第 4 个项目（dayjs / date-fns / luxon / temporal-polyfill），也是和前 3 个差异最大的：前 3 个是用户态库（npm install 立刻能用），Temporal 是语言标准（要等 Stage 4 才内置，目前必须 polyfill）。

读 Temporal 提案花了大半天才区分清楚 PlainDate 和 ZonedDateTime 的语义边界。一开始我以为 PlainDateTime 就是"日期 + 时间"足够了，但读到"生日不应该跟着 TZ 漂移"这个例子才明白：**语义边界不是技术问题，是业务问题**。Temporal 把这种业务语义编码进类型系统，是它"严谨"的本质来源。

最有用的体验是 Duration 不归一化。以前 dayjs 里写 `dayjs.duration({months: 1})` 当时没察觉问题，看到 Temporal 强制要求 `relativeTo` 才能 total，才意识到"1 个月有多少毫秒"这个问题确实没有标准答案。这种"暴露出问题让你显式处理"的设计哲学，和 Rust Result / Option 一脉相承。

但写示例代码时 Temporal API 的笨重也很明显：每个类型转换都要显式调一次方法，链条长，看上去比 luxon / dayjs 啰嗦。这就是"标准化"的代价 —— 让简单场景写得稍微累，换业务场景永远不会出错。

## 学到

- 语言标准化的速度和早期可用性永远在矛盾中（Stage 3 卡 6+ 年）
- "类型系统挡错误"的设计哲学，在动态语言里也能用 6 个 class 模拟出来
- Duration 的"不归一化" 是从根本上说"日期数学没有标准答案，请你显式处理" 的态度
- 大部分日期库在"什么是日期" 这个问题上是模糊的（dayjs DateTime / luxon DateTime），Temporal 强制你回答"是 PlainDate / PlainDateTime / ZonedDateTime / Instant 中的哪一种"
- polyfill 化为生产可用的 API 标准提案，是 ECMAScript 标准化路径里少有的"等不及就先用"模式
- temporal-polyfill 和 @js-temporal/polyfill 的关系：前者是 FullCalendar 实战导向，后者是规范一致性导向
- Calendar 系统是 Temporal 卡 Stage 3 的争议焦点之一 —— "为 1% 场景付 100% 复杂度"
- 早期采用 Temporal 的项目，bundle 多 15-30 KB 是必付的"未来税"
- API 严谨度的代价是学习曲线，业务严肃依赖时值得，UI 展示场景过度
- Temporal 的精神后裔是 java.time（Java 8+），思想几乎一一对应
- ZonedDateTime 是 Temporal 真正的"完整时间点" 概念，PlainDateTime 故意不带 TZ 是用来表达"用户输入还没决定 TZ" 的中间态

## 关联

- [luxon 状元篇](./luxon.md) —— Maggie Pint 留下的两条精神后裔，luxon 在用户态做完整重写，Temporal 在语言层做标准
- [dayjs 状元篇](./dayjs.md) —— Moment API + plugin 化的另一条路，bundle 优势在 Temporal 标准化前仍是首选
- [date-fns 状元篇](./date-fns.md) —— fp 风格 vs Temporal OOP 风格的正交对照
