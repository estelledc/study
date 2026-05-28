---
title: luxon TZ + i18n 现代 Moment 替代
来源: https://github.com/moment/luxon + moment.github.io/luxon
---

# luxon —— Moment 团队 2017 重启的现代 JS 日期库，把 TZ + i18n 内置成核心

## 一句话总结

luxon 是 Isaac Cambron 2017 年开始、moment 官方组织（github.com/moment）下的"重启项目"，到 2024 年稳定在 v3.x。它的存在意义只有一句话：**Moment.js 早年定下的"mutable + 大 bundle + plugin 化时区"路线已经成为债务，团队不打算改 Moment 自己（兼容性包袱太重），就开了一个新仓库，从零设计一套 immutable + 内置 IANA 时区 + 内置 Intl-based i18n 的现代 API**。

设计哲学一句话：**"如果今天重新写 Moment，应该长什么样"——immutable 默认、TZ 不是 plugin 是核心、i18n 走平台 Intl API（不再绑定 CLDR data）、bundle 控在 22 KB 而不是 67 KB**。这条路和 Season 23 同期的工具库 B 分支竞品都不一样：dayjs 押"Moment API 不变 + plugin 化"，date-fns 押"function-per-feature + tree-shake 极致"，luxon 押的是"完整重写、TZ + i18n 内置、跟住 ECMAScript 标准"。

luxon 的目标用户：

- 业务里 TZ / DST / 多 locale 是日常的（航班 / 跨国排班 / 多地区会议）
- 已有 Moment 代码，想升级又不想再 plugin 配 timezone + locale 各自一遍
- 浏览器 / Node 都跑现代环境（ECMAScript 2018+，Intl 完整支持）
- 偏好 OOP class API + chain（`DateTime.now().plus({days: 1}).toLocaleString()`）

非目标用户：

- bundle 极致敏感（< 5 KB）→ dayjs / date-fns 仍更小
- 旧 IE / 旧 Safari 兼容 → Intl 不全，luxon 在这些环境降级或失效
- fp / pipe / curry 风格代码 → date-fns/fp 友好，luxon 是 OOP class
- 押 Temporal 标准的实验项目 → temporal-polyfill 更对路

> 怀疑：luxon bundle 22 KB 比 dayjs / date-fns 大 5-10 倍，但 TZ + i18n 内置是核心卖点。如果项目不需要跨时区也不需要多 locale，luxon 是过度选择？这个判断要看到具体使用场景才能下，Layer 4 / Layer 6 把 trade-off 展开看。
> 怀疑：luxon 用 ECMAScript Intl API（浏览器 / Node 内置），但 IE / 旧 Safari 不完整支持。这是不是把"现代"当卖点而牺牲兼容？至少在 2024 年前端项目里，IE 已经全网下线，Safari 旧版也不在主流支持范围，所以"牺牲" 的代价比 2017 年小很多。
> 怀疑：Moment 团队 2020 宣布维护模式（feature freeze），推 luxon 替代。但 dayjs / date-fns 抢占 weekly downloads（25M / 25M vs luxon 6M）。luxon 真能继承 Moment 用户吗？还是已经被抢走？这条要在 Layer 4 / Layer 5 用数字说话。

![luxon TZ + i18n architecture](/projects/luxon/01-tz-i18n.webp)

## Layer 0 —— 档案速查

| 维度 | 信息 |
|---|---|
| 主仓库 | https://github.com/moment/luxon |
| 作者 | Isaac Cambron（moment 官方组织 maintainer） |
| 起步 | 2017 年中（GitHub 第一 commit 在 2017-04） |
| 当前版本 | v3.x（2024）；v3 在 2022 发布，是 ESM-first 大重构 |
| 协议 | MIT |
| 主语言 | JavaScript（早期），逐步加 `.d.ts` |
| weekly downloads | ~6M（2024 年；远低于 dayjs / date-fns / Moment 仍存的旧用户） |
| GitHub stars | 15K+（2024） |
| bundle size | core ~22 KB（min+gzip）；不再分 plugin |
| 测试 | Jest + 大量 fixture + 跨 locale / 跨 zone 矩阵 |
| 官网 | https://moment.github.io/luxon |
| 关键依赖 | 0 runtime 依赖；只依赖 ECMAScript Intl API |

luxon 在 npm 工具库生态里的"位置"：

- 和 Moment.js（同组织前作）：API 不兼容、bundle 1/3、immutable、TZ + i18n 内置；这是"重启"不是"升级"。
- 和 dayjs（同年代）：哲学相反——dayjs 押 Moment API + plugin 化，luxon 押新 API + 内置一切。
- 和 date-fns（同年代）：哲学正交——date-fns 是 pure function 集合不绑 OOP，luxon 是 class + chain。
- 和 Temporal（未来标准）：luxon 的 API 设计某种程度参考了 Temporal 的 Duration / Instant 概念，但 Temporal 是新类型系统、不会向 luxon 收敛；两者并行。

## Layer 1 —— 核心抽象：DateTime / Duration / Interval 三大类

luxon 的"原子结构"只有三个 class：DateTime、Duration、Interval。每个负责一类时间概念，全部 immutable，所有"修改"操作返回新实例。

```js
import { DateTime, Duration, Interval } from 'luxon';

// 1. DateTime —— "时间点"，带 zone + locale
const a = DateTime.now();                       // 当前时间，系统 zone
const b = DateTime.fromISO('2026-05-29');       // ISO 字符串解析
const c = DateTime.fromMillis(1716998400000);   // unix ms
const d = DateTime.fromJSDate(new Date());      // 原生 Date
const e = DateTime.fromObject(
  { year: 2026, month: 5, day: 29, hour: 9, minute: 30 },
  { zone: 'Asia/Shanghai', locale: 'zh-CN' }
);

// chain 都是 immutable
const f = DateTime.fromISO('2026-05-29')
  .plus({ months: 1 })          // → 2026-06-29 (新实例)
  .minus({ days: 7 })           // → 2026-06-22 (再新)
  .startOf('week')              // → 周一 00:00 (再新)
  .setZone('Asia/Shanghai')     // 切换 zone（壁挂时钟不变还是切换瞬时？看 keepLocalTime）
  .toFormat('yyyy-MM-dd HH:mm ZZZZ');

// 2. Duration —— "时间段"，没有起点
const dur = Duration.fromObject({ hours: 2, minutes: 30 });
dur.as('minutes');         // 150
dur.shiftTo('seconds').toObject();  // { seconds: 9000 }

// chain
const dur2 = Duration.fromObject({ days: 1 })
  .plus({ hours: 5 })
  .normalize();             // → { days: 1, hours: 5 }（合并进位）

// 3. Interval —— "时间区间"，[start, end)
const start = DateTime.fromISO('2026-05-29');
const end   = DateTime.fromISO('2026-06-15');
const iv = Interval.fromDateTimes(start, end);
iv.length('days');          // 17
iv.contains(DateTime.fromISO('2026-06-01'));  // true
iv.splitBy({ days: 7 });    // 拆成 [周1, 周2, 周3] 三个 sub-interval
```

注意三类是分开的，不像 Moment 用一个类塞所有概念。luxon 的态度是："时间点和时间段是两个不同的东西，让类型系统帮你区分。"

## Layer 2 —— 内部架构：immutable + 内置 IANA TZ + Intl-based i18n

要看 luxon 怎么把 Moment 的"债务"翻新，必须看三件事的内部实现。

### 1. immutable 的实现

DateTime 实例的所有"修改" method（plus / minus / set / setZone / setLocale）内部都是：构造一个新 DateTime，把字段拷过去，原实例不变。

伪代码：

```js
class DateTime {
  plus(duration) {
    const result = this._toMillis() + duration.toMillis();
    return DateTime._fromInternal({
      ts: result,
      zone: this.zone,
      locale: this.locale,
      // 其他字段
    });
  }
}
```

这和 Moment 的 `m.add(1, 'day')` 当场改 `m` 是相反的。Moment 的 mutable 在 React / Redux 这种 immutable 状态库里非常容易出 bug——把 store 里的时间传给一个组件，组件 add 一下就把 store 改了。luxon 默认 immutable 把这条坑直接堵了。

### 2. 内置 IANA 时区

luxon 不维护任何时区数据。它走的是 ECMAScript Intl API：

```js
// 浏览器 / Node 内部本来就带
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  timeZoneName: 'long',
});
fmt.formatToParts(new Date());
// 输出有 timeZoneName 项，luxon 解析它得到 zone offset
```

具体的提取流程在 `src/zones/IANAZone.js`：

- 给定一个 zone name（比如 `Asia/Shanghai`）和一个 ts，构造一个 `Intl.DateTimeFormat` 设 timeZone。
- 调 `formatToParts(date)`，从输出的 year/month/day/hour/minute/second 里反推那个 ts 在该 zone 的"墙钟时间"。
- 用墙钟时间减去原 ts（按 `UTC` 算），就是 offset。
- DST 切换由 Intl 自己处理（操作系统 / V8 内置的 ICU CLDR 数据）。

这个设计的好处：**luxon 自己的 bundle 完全不需要带时区数据**。Moment-timezone 要打 ~280 KB 的 IANA 数据库，luxon 不带。代价：**依赖 Intl 完整实现**——浏览器和现代 Node 都有，但旧环境（IE / 旧 Node）会缺，缺了 luxon 就只能给本地 zone 和 `UTC`。

### 3. Intl-based i18n

同样的策略也用在 i18n。luxon 的 `toLocaleString` / `toFormat` 内部都走 `Intl.DateTimeFormat`：

```js
DateTime.now().setLocale('zh-CN').toLocaleString(DateTime.DATE_FULL);
// '2026年5月29日'，靠 Intl.DateTimeFormat({locale: 'zh-CN', dateStyle: 'full'})
```

Moment 要单独 import locale 文件（`moment/locale/zh-cn.js`，每个 locale 几 KB），bundle 累积起来很大。luxon 一行代码搞定，因为 locale 字符串数据不在 luxon 的 bundle 里——**它们在浏览器 / Node 自带的 ICU CLDR 里**。

把这两件事合起来：**TZ 数据 + i18n 数据都不在 luxon 的 22 KB 里，是平台已经带的东西**。这是 luxon 能做到 22 KB 同时支持完整 TZ + i18n 的根本原因。

## Layer 3 —— 精读 3 段

### 段 a：DateTime immutable + chain

入口：`src/datetime.js`，整个文件 ~2400 行，是 luxon 最核心的 class。permalink 示意：

```
https://github.com/moment/luxon/blob/3a4d1b7c5e8f9a2c4d6e8f0a1b3c5d7e9f1a3b5c/src/datetime.js
```

（链接示意，commit hash 取 v3.x 主线 release tag 附近，40 char hex）

关键字段：

```js
class DateTime {
  constructor(config) {
    this.ts = config.ts;          // unix ms
    this.zone = config.zone;      // Zone instance（IANAZone / FixedOffsetZone / ...）
    this.locale = config.locale;  // Locale instance
    this.invalid = config.invalid; // Invalid 错误信息或 null
    // 缓存字段（懒计算）
    this._c = null;               // calendar cache: { year, month, day, ... }
    this._o = null;               // offset cache
  }
}
```

懒计算缓存是 luxon 的性能关键：

- 调 `dt.year` 第一次时，luxon 才把 ts + zone 转成 calendar 字段（year / month / day...）存到 `_c`。
- 之后再调 `dt.year` / `dt.month` 都从 `_c` 读，不再走 Intl。
- 每个 immutable 新实例都重新建一份 `_c`（懒），原实例的 `_c` 不影响。

immutable chain 的工厂函数 `_fromInternal` 大致：

```js
DateTime._fromInternal = function (o) {
  return new DateTime(o);
};

DateTime.prototype.plus = function (duration) {
  if (!this.isValid) return this;
  const dur = friendlyDuration(duration);
  const ts = this.ts + dur.toMillis();
  return clone(this, { ts });
};

function clone(inst, alts) {
  return DateTime._fromInternal({
    ts: alts.ts ?? inst.ts,
    zone: alts.zone ?? inst.zone,
    locale: alts.locale ?? inst.locale,
    // 其他字段同上
  });
}
```

这里有两个值得记的设计：

1. **invalid 不抛错**：如果 ts 无效（NaN / 越界），luxon 不抛 Error，而是构造一个 `invalid` 字段非 null 的 DateTime，所有后续 chain method 检查 `this.isValid`，无效的话直接返回 self（chain 不断），最终 `.toISO()` 返回 `null`。这避免了"链式中间一个错误就炸整条链"。
2. **clone 不改 Zone / Locale**：默认沿用原实例的 zone / locale，除非 alts 显式给。这让 chain 不会"沿途丢上下文"。

> 怀疑：immutable + 缓存 `_c` 的代价是每次 chain 都生成新对象，GC 压力比 Moment mutable 大。在大循环（比如生成日历数组）里会不会成性能瓶颈？luxon README 里没强调过这点，benchmark 数据要查 issue 区。

### 段 b：TZ 处理（setZone + IANAZone 内部）

入口：`src/zones/IANAZone.js`。permalink 示意：

```
https://github.com/moment/luxon/blob/4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c/src/zones/IANAZone.js
```

（链接示意，40 char hex）

关键 method `offset(ts)`：给定一个 ts（毫秒），返回该 zone 在该时刻的 offset（分钟）。伪代码：

```js
class IANAZone {
  constructor(name) {
    this.zoneName = name;       // 'Asia/Shanghai'
    this.valid = isValidZone(name);
  }

  offset(ts) {
    const date = new Date(ts);
    const fmt = makeDTF(this.zoneName);   // 缓存的 Intl.DateTimeFormat
    const parts = fmt.formatToParts(date);
    // parts 形如 [{type:'year',value:'2026'}, ...]
    const filled = partsToObj(parts);
    // 把 zone 时间组装成 UTC（按 zone 视角）
    const asUTC = Date.UTC(
      filled.year, filled.month - 1, filled.day,
      filled.hour, filled.minute, filled.second
    );
    // offset = zone视角的UTC - 真实UTC
    const offset = (asUTC - ts) / 60000;
    return offset;
  }
}
```

这段代码是 luxon "时区不需要数据库"的关键。每次调 `dt.setZone('Asia/Shanghai')` 触发的都是 Intl API。代价是：

- DST 切换由 Intl 处理，luxon 不需要维护规则。
- 但同样的 ts + zone 计算 offset，每次都要走一次 Intl，没有缓存就慢。
- luxon 用一个 module-level 的 `dtfCache: Map<zoneName, DateTimeFormat>` 缓存 DTF 实例（创建 DTF 是开销大的操作，几百 μs），重复用同一个 zone 的话只创建一次。

`setZone` 的两个模式：

```js
// keepLocalTime: false（默认）—— 切换"看待瞬时的视角"
const t = DateTime.fromISO('2026-05-29T10:00', { zone: 'America/New_York' });
const t2 = t.setZone('Asia/Shanghai');
// t2 显示的墙钟时间不一样（NY 10:00 = 上海 22:00），但代表的是同一个瞬时。

// keepLocalTime: true —— 保持墙钟时间，换 zone
const t3 = t.setZone('Asia/Shanghai', { keepLocalTime: true });
// t3 显示也是 10:00，但代表的瞬时不同了（上海 10:00 != NY 10:00）。
```

这两个语义对应的业务场景：

- 默认（false）：用户从 NY 飞到上海，他在 NY 设了一个 10:00 的会议，落地后要看上海几点开会。
- keepLocal（true）：用户在 NY 写"早 10:00 起床"的本地习惯，搬家到上海后还是要早 10:00 起床（即使瞬时上是另一个时刻）。

> 怀疑：keepLocalTime 这个参数的命名很违反直觉。第一次看 API 我以为它是"保持原 zone 不变"，其实是"保持显示的墙钟数字不变，换 zone 等于换瞬时"。这种命名要不要在团队 code review 时强制写注释解释？

### 段 c：Duration / Interval 设计

入口 `src/duration.js`。permalink 示意：

```
https://github.com/moment/luxon/blob/5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d/src/duration.js
```

（链接示意，40 char hex）

Duration 的关键设计：**它存的不是单一数字，而是一组"单位计数"**。

```js
// Moment 的 duration 内部是单一 ms 数字
moment.duration({ days: 1, hours: 2 })._milliseconds; // 93600000

// luxon 的 Duration 是 object
Duration.fromObject({ days: 1, hours: 2 }).values;
// { days: 1, hours: 2 }
```

为什么这么设计？因为时间单位之间不是简单倍数关系。比如"1 month"在 1 月 31 日不等于 28 天（2 月没那么多），在 4 月 30 日不等于 30 天（5 月有 31 天）。所以 Duration 不能简单存成 ms：

```js
const d = Duration.fromObject({ months: 1 });
const start1 = DateTime.fromISO('2026-01-31');
const start2 = DateTime.fromISO('2026-04-30');
start1.plus(d).toISODate();  // '2026-02-28'（取月末，不是 +30 天）
start2.plus(d).toISODate();  // '2026-05-30'
```

要把 Duration 转成 ms 必须配合 anchor（起点 DateTime）。所以 `dur.as('milliseconds')` 在带"日历单位"（months / years）时是估算值（按 30 / 365.25 天平均），不是精确值。

`normalize()` 是 Duration 的另一个亮点。给定一个 `{ hours: 25, minutes: 75 }`，normalize 后变成 `{ hours: 26, minutes: 15 }`（进位）。但 `{ months: 0, days: 35 }` 不会变成 `{ months: 1, days: 5 }`，因为月份长度不固定。luxon 的 normalize 只对"固定换算"的单位做（ms→s→min→hour→day→week，year→month）。

Interval 是基于两个 DateTime 的 wrapper：

```js
class Interval {
  constructor(config) {
    this.s = config.start;   // start DateTime
    this.e = config.end;     // end DateTime（不含）
  }

  length(unit = 'milliseconds') {
    return this.e.diff(this.s, unit).as(unit);
  }

  contains(dt) {
    return this.s <= dt && dt < this.e;
  }

  splitBy(duration) {
    // 从 start 开始，每次 +duration，直到 >= end，返回数组
    const out = [];
    let cur = this.s;
    while (cur < this.e) {
      const next = cur.plus(duration);
      out.push(Interval.fromDateTimes(cur, next < this.e ? next : this.e));
      cur = next;
    }
    return out;
  }
}
```

splitBy 是排班 / 日历 view 的常用工具。比如把一天拆成 30 分钟一格用来画甘特图。

> 怀疑：Interval 是 [start, end)，半开半闭。这和 SQL 的 BETWEEN（闭区间）不一致。如果业务里同时用 luxon 和数据库 BETWEEN，边界值（end 那一刻）的 contains 判断会有差异。这种边界 trap 在 issue 区有人踩过。

## Layer 4 —— 与 Moment / date-fns / dayjs / Temporal 对比

这是 Season 23 工具库 B 分支最关键的一节。把 5 个候选放在 6 个维度上摊开看。

### 哲学差异

| 库 | 哲学 | 一句话 |
|---|---|---|
| Moment | 大而全 + mutable | 2011 年的"瑞士军刀"，背了很多债务 |
| dayjs | 极简 + plugin 复刻 Moment API | 2 KB core，按需加 plugin，迁移成本最低 |
| date-fns | function-per-feature | 每个操作一个 pure function，tree-shake 友好 |
| **luxon** | **重写 + 内置 TZ/i18n** | **Moment 团队"如果今天重写"的答案** |
| Temporal | ECMAScript 标准提案 | 把日期变成新的 builtin 类型，不是库 |

### API 风格

```js
// Moment（chain，mutable）
moment().add(1, 'day').format('YYYY-MM-DD');

// dayjs（chain，immutable，但 API 跟 Moment 一致）
dayjs().add(1, 'day').format('YYYY-MM-DD');

// date-fns（function nest，immutable）
import { addDays, format } from 'date-fns';
format(addDays(new Date(), 1), 'yyyy-MM-dd');

// luxon（chain，immutable，参数是 object）
DateTime.now().plus({ days: 1 }).toFormat('yyyy-MM-dd');

// Temporal（语言原生，immutable）
Temporal.Now.plainDateISO().add({ days: 1 }).toString();
```

luxon 最特别的地方：**`.plus({ days: 1 })` 用 object，不用 `add(1, 'day')` 二参形式**。原因是这样可以一次传多个：`.plus({ days: 1, hours: 2, minutes: 30 })`，比 Moment / dayjs 三次 chain 干净。

### TZ 处理

| 库 | TZ 方案 | 默认 bundle | 加 TZ 后 |
|---|---|---|---|
| Moment | moment-timezone plugin（带 IANA 数据） | 67 KB | +280 KB |
| dayjs | utc + timezone plugin（走 Intl） | 2 KB | +3 KB |
| date-fns | date-fns-tz（走 Intl + 部分自带） | 12 KB | +12 KB |
| **luxon** | **内置（走 Intl）** | **22 KB** | **0** |
| Temporal | 标准内置 | 0（语言自带） | 0 |

luxon 的 22 KB 已经包含 TZ 完整支持，这是它的核心卖点。

### i18n 处理

| 库 | i18n 方案 | locale 增量 |
|---|---|---|
| Moment | `moment/locale/<lang>.js` 单独 import | 每个 locale 几 KB |
| dayjs | `dayjs/locale/<lang>` 单独 import | 每个 locale ~1 KB |
| date-fns | `date-fns/locale/<lang>` 单独 import | 每个 locale ~5 KB |
| **luxon** | **走 Intl.DateTimeFormat** | **0（用平台 CLDR）** |
| Temporal | 走 Intl | 0 |

luxon 在多 locale 项目里 bundle 优势最大——不管支持几个语言，都是同一个 22 KB。Moment 支持 20 个 locale 累积要带 ~80 KB 的 locale 数据。

### immutable 对比

| 库 | 默认 | 改一下原实例会怎样 |
|---|---|---|
| Moment | mutable | `m.add(1, 'day')` 当场改 m |
| dayjs | immutable | `d.add(1, 'day')` 返回新实例 |
| date-fns | immutable（pure function） | `addDays(d, 1)` 返回新 Date |
| **luxon** | **immutable** | **`dt.plus({days: 1})` 返回新实例** |
| Temporal | immutable | 标准要求 |

Moment 的 mutable 是它最大的债务。dayjs / luxon / date-fns 都把这条修了。

### 类型安全

| 库 | TS 支持 |
|---|---|
| Moment | 有 `.d.ts` 但宽松（很多 any） |
| dayjs | 有 `.d.ts` 内置 |
| date-fns | 整个库改写成 TS 了（v3） |
| **luxon** | **有 `.d.ts`（社区维护，已合并主仓）** |
| Temporal | 类型系统级别（语言原生） |

luxon 的类型不如 date-fns v3 那么严格，但够用。比如 `DateTime.plus(arg)` 接受 `Duration | Object | number`，三者类型在 TS 里是 union，需要使用方判断。

## Layer 5 —— 6 维对比（Season 23 B 分支评分表）

| 维度 | 满分 | Moment | dayjs | date-fns | luxon | Temporal |
|---|---|---|---|---|---|---|
| Bundle 大小 | 10 | 1（67 KB） | 10（2 KB） | 8（12 KB） | 6（22 KB） | 10（0 KB，原生） |
| TZ 完备 | 10 | 8（带 280 KB 数据） | 7（plugin 走 Intl） | 6（plugin） | 10（内置 + Intl） | 10（标准） |
| i18n 完备 | 10 | 7（locale 单独带） | 6（locale plugin） | 6（locale 单独） | 9（走 Intl） | 9 |
| API 一致性 | 10 | 8（chain 老 API） | 9（兼容 Moment） | 7（function nest） | 8（chain + object） | 9（标准命名） |
| immutable | 10 | 0 | 10 | 10 | 10 | 10 |
| TS 严格 | 10 | 4 | 7 | 9 | 7 | 10 |
| 维护活跃 | 10 | 2（feature freeze） | 8 | 9 | 7 | 标准在推进 |
| 学习曲线 | 10 | 9（老熟） | 9（兼容 Moment） | 6（200+ 函数） | 6（重写新 API） | 5（新概念） |
| 社区生态 | 10 | 10（历史） | 9 | 9 | 7 | 3（实验） |
| 总分（不含 Temporal）| 80 | 49 | 75 | 70 | 70 | / |

luxon 在 Bundle / 学习曲线两项失分，但在 TZ + i18n + immutable 三项满分或近满分。如果业务里 TZ + i18n 是核心（航空 / 跨国 / 多 locale 应用），luxon 是最优解。如果不是，dayjs 综合分最高。

> 怀疑：上面打分的"Bundle 大小"维度，luxon 6/10 是按"absolute 22 KB"打的。但如果项目本来就要支持 TZ + i18n，dayjs 加上 plugin + 多个 locale 也会到 15-20 KB，差距没那么大。打分应该看"功能等价下的 bundle"才公平。下次做对比要把这条加进去。

## Layer 6 —— 限制 / 不适合场景

luxon 不是银弹。至少有 4 类场景它不合适。

### 限制 1：依赖 Intl，旧环境会降级

luxon 的 TZ + i18n 都靠 `Intl.DateTimeFormat`。在 Intl 不完整或缺失的环境（IE 11 老版 / Node 12 之前 small-icu 构建 / 某些嵌入式 V8）：

- TZ：只能用 `LocalZone`（系统时区）和 `UTCZone`，不能用 `IANAZone`（`Asia/Shanghai` 这种）。
- i18n：`toLocaleString` 退化成英文 / 系统默认。

2024 年这个限制基本不影响主流前端项目，但要支持老环境的项目（保险公司内网、政府系统、电视盒子）要先评估。

### 限制 2：bundle 22 KB 对小工具偏大

如果项目就是个小工具（H5 lottery / 静态页 / 小程序），只用到 `format` 和 `addDays`，22 KB 是浪费。dayjs 2 KB core 够用。Season 23 学到的"工具选型不看绝对优秀，看功能匹配度"在这里是关键。

### 限制 3：API 不兼容 Moment，迁移成本高

从 Moment 迁到 luxon 不是改 import 那么简单。

```js
// Moment
moment('2026-05-29').add(1, 'day').format('YYYY-MM-DD');

// luxon（语法 + format 标记都不一样）
DateTime.fromISO('2026-05-29').plus({ days: 1 }).toFormat('yyyy-MM-dd');
//                                      ^^^^^^^^^      ^^^^^^^^^^
//                                      object 参数     yyyy 不是 YYYY
```

format token 大小写差异（luxon 用 Unicode TR35 标准的 `yyyy`，Moment 用自家的 `YYYY`）会让 99% 的迁移踩坑。dayjs 在这点上对 Moment 用户友好得多。

### 限制 4：Duration 不是单一数值，混算容易出错

```js
const a = Duration.fromObject({ days: 1, hours: 5 });
const b = Duration.fromObject({ hours: 30 });

a.equals(b);          // false（值不同：days:1 hours:5 vs hours:30）
a.shiftTo('hours').equals(b);  // true（normalize 后才能比）
```

刚学的人很容易期望 `equals` 像 Moment 一样比较毫秒值。luxon 的"按单位 object 存"设计让对比更复杂。要养成 `shiftTo + normalize` 后再比的习惯。

## 怀疑总集（贯穿 Layer 1-6）

按风险等级排：

1. **bundle 22 KB 是不是过度选择**：如果项目不要 TZ / i18n，luxon 就是 22 KB 重负担。要看用例。
2. **依赖 Intl 在老环境降级**：2024 年风险小，但要项目级评估，不能默认假设有。
3. **能不能继承 Moment 用户**：dayjs 已经抢走大半（25M vs 6M weekly downloads）。luxon 增长慢。
4. **Duration object 存储引入的混算坑**：`equals` / `as('ms')` 在带"日历单位"时不精确，要 code review 强制 normalize。
5. **keepLocalTime 命名违反直觉**：API 设计的小坑，团队约定写注释解释。
6. **immutable + 缓存对 GC 压力**：大循环里有没有性能瓶颈，benchmark 待查。
7. **format token 大小写不兼容 Moment**：迁移项目最容易踩，全文搜索改 token。
8. **Interval [start, end) 半开半闭**：和 SQL BETWEEN 闭区间不一致，跨层调用要小心。
9. **类型不如 date-fns v3 严格**：union 类型很多，要使用方判断。
10. **Temporal 标准化后 luxon 何去何从**：v4 路线图有讨论但没承诺迁移。

## GitHub 链接（permalink 示意）

下面三条是 v3.x 主线 release tag 附近的 permalink，commit hash 取 40 char hex 形式。

- `src/datetime.js`（核心 class，~2400 行）：

  ```
  https://github.com/moment/luxon/blob/3a4d1b7c5e8f9a2c4d6e8f0a1b3c5d7e9f1a3b5c/src/datetime.js
  ```

  核心读：constructor、`_fromInternal`、`plus` / `minus` / `set` / `setZone` / `setLocale`、懒计算的 `_c` / `_o` 缓存、`isValid` invalid 兜底。

- `src/duration.js`（时间段，~700 行）：

  ```
  https://github.com/moment/luxon/blob/5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d/src/duration.js
  ```

  核心读：Duration 内部 `values` object 存储、`normalize` / `shiftTo` / `as` 三个换算 method、和 DateTime `plus` 配合的"日历单位语义"。

- `src/zones/IANAZone.js`（IANA 时区实现，~250 行）：

  ```
  https://github.com/moment/luxon/blob/4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c/src/zones/IANAZone.js
  ```

  核心读：`offset(ts)` 走 `Intl.DateTimeFormat.formatToParts`、模块级 DTF 缓存、DST 委托给 Intl。

（链接为示意，实际 hash 以仓库 v3.x 主线 release tag 为准。）

## 实战建议

### 何时选 luxon

按优先级从高到低：

1. **业务里 TZ 是日常**：航班 / 跨国会议 / 多地区排班。luxon 内置 TZ 比 dayjs + plugin 干净。
2. **多 locale 项目**：支持 5+ 个语言时，luxon 走 Intl 不带 locale 数据，bundle 比 Moment / dayjs / date-fns 都小。
3. **新项目，不带历史包袱**：从 0 开始可以接受新 API，没有 Moment 迁移压力。
4. **现代环境**：浏览器 ES2018+ / Node 16+，Intl 完整。
5. **OOP / chain 风格偏好**：和 dayjs / Moment 一致，比 date-fns 的 function nest 顺手。

### 何时不选

- 项目极度 bundle 敏感（< 5 KB）→ dayjs / date-fns。
- 旧环境兼容（IE / 小程序部分宿主）→ dayjs（plugin 化更可控）。
- 已有 Moment 代码库要平滑迁移 → dayjs（API 几乎兼容）。
- fp 风格强需求（pipe / curry）→ date-fns/fp。
- 押 Temporal 标准 → temporal-polyfill。

### 用 luxon 必须知道的 5 个坑

1. **format token 是 Unicode TR35 标准**：`yyyy` 不是 `YYYY`、`dd` 不是 `DD`、`HH` 是 24 小时、`hh` 是 12 小时。从 Moment 迁来 100% 要全文搜索改。
2. **Duration `as('milliseconds')` 在带 months / years 时是估算**：用 30 天 / 365.25 天平均算。要精确必须配合 DateTime anchor。
3. **`setZone(zone, { keepLocalTime: true })` 保的是墙钟数字，换瞬时**：默认（false）保瞬时换墙钟。两个语义对应不同业务，要看清楚。
4. **invalid DateTime 不抛错，链式继续**：最终 `.toISO()` 返回 `null`，要在用户输入边界检查 `dt.isValid`，否则错误只在终点暴露。
5. **Interval 是 [start, end) 半开半闭**：和 SQL BETWEEN 不一致。要么 Interval `.contains(end)` 永远 false，要么 SQL 改 `>=` / `<` 而不是 BETWEEN。

### 性能注意点

- IANAZone 第一次用某个 zone 会创建 `Intl.DateTimeFormat`，开销几百 μs。luxon 模块级缓存这个 DTF，所以同一 zone 第二次起开销小。
- DateTime 的字段（`.year` / `.month` / ...）是懒计算 + 实例级缓存。第一次访问触发计算，后续访问直接读 `_c`。
- 大循环里反复 `.plus({days: 1})` 会生成大量临时实例。如果是性能热点，考虑用 unix ms 算完再一次性 `DateTime.fromMillis`。

## 学到了什么

把这个项目精读一遍，可总结的 5 条：

1. **"如果今天重写 X 应该长什么样"是合法的项目动机**：luxon 不是 Moment 的功能升级，是设计哲学层的重启。同组织、不同仓库、不兼容 API、解决兼容包袱——这是工程界的常用动作（React Native / Vue 3 / Python 3 都有类似动机），但需要团队认知"重写"的代价（用户分流、生态重建）。
2. **依赖平台标准 API 是减小 bundle 的最强招**：luxon 22 KB 同时支持 IANA TZ + 多 locale，靠的是把 280 KB 的 TZ 数据 + 几十 KB 的 locale 数据全部委托给 Intl（即浏览器 / Node 自带的 ICU CLDR）。这是"借用平台"思路的典型案例。代价是依赖标准实现完整度，旧环境降级。
3. **immutable 默认 + invalid 兜底是工程友好的两条线**：immutable 解决了 Moment 在 React / Redux 里改原 instance 的 bug，invalid 不抛错让 chain 中间错不炸链。两条加起来让 luxon 在大型 app 里更不容易踩雷。
4. **Duration 用 object 存而不是单一 ms 是必然的**：因为时间单位之间不是简单倍数（month、year 长度不固定）。这条让 Duration API 比 Moment 复杂（要懂 normalize / shiftTo），但精确度上是对的。
5. **6 维对比下没有"最好"，只有"匹配场景"**：luxon 在 TZ + i18n 重的场景是最优，在 bundle 极致的场景被 dayjs 完爆。Season 23 工具库 B 分支学到的"按场景选"在这里再次验证。

## 关联

- 同 Season 工具库 B 分支：[dayjs](dayjs.md) / [date-fns](date-fns.md) / Moment / Temporal。这四个一起精读才能理解 JS 日期生态全景。
- 上游：Moment.js（已 feature freeze，不再推荐新项目使用）。luxon 是 Moment 团队的"未来版本"。
- 下游 / 标准：ECMAScript Temporal Proposal。luxon API 设计某种程度参考 Temporal 的 Duration / Instant 概念，但 Temporal 落地后 luxon 会怎么演进，团队没承诺迁移。
- 同生态相关：i18n 走 Intl 的库还有 `numbro`（数字格式化）、`Intl.PluralRules`（复数处理）。luxon 算是这条路上日期库的代表。
- 工程模式：immutable + chain + 懒计算缓存的组合也出现在 Immutable.js / Mori（Clojure 的 JS 移植）里，是函数式 + OOP 折中的典型。
