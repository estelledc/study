---
title: Luxon — 如果今天重写 Moment 应该长什么样
来源: 'https://github.com/moment/luxon'
日期: 2026-05-30
子分类: projects / 前端工具库
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Luxon 是 Moment 团队 2017 年开的"重启项目"——同一拨人、同一个 GitHub 组织（moment/luxon），但**新仓库、新 API、不兼容 Moment**。日常类比：像汽车厂商发现 10 年前的老车型积重难返，干脆另起一条产线，从车架开始重新设计。

具体差别四件事：

- **immutable 默认**：`dt.plus({ days: 1 })` 返回新实例，原对象不变（Moment 的 `m.add(1, 'day')` 当场改 m）
- **IANA 时区内置**：不再靠 `moment-timezone` plugin 多带 280 KB 数据
- **i18n 走平台 Intl API**：locale 数据是浏览器/Node 自带的 ICU CLDR，不进 luxon bundle
- **三类 immutable class**：DateTime（时间点）、Duration（时间段）、Interval（时间区间）分得很清

bundle ~22 KB（min+gzip），0 runtime 依赖。MIT 协议。

## 为什么重要

不理解 Luxon 的设计取舍，下面这些事都没法解释：

- 为什么 Moment 团队 2020 年宣布维护模式，却没在 Moment 自己仓库改，而是另开 Luxon
- 为什么 Luxon 22 KB 同时支持完整 IANA TZ + 任意 locale，比 Moment+plugin 小一个数量级
- 为什么从 Moment 迁到 Luxon 不是改 import 那么简单——format token 大小写都不一样
- 为什么 Temporal 标准提案出现后 Luxon 仍在维护——它是过渡期最实用的"准 Temporal"

## 核心要点

Luxon 的核心思路可以拆成 **三步**：

1. **三个 immutable class 各管一类概念**：DateTime 是"时间点"、Duration 是"时间段（没起点）"、Interval 是"时间区间 [start, end)"。Moment 用一个类塞所有概念，Luxon 让类型系统帮你区分这三件事。

2. **chain method 都返回新实例**：所有 `plus / minus / set / setZone / setLocale` 内部都构造一个新 DateTime，原实例不变。类比："存档式编辑"——每改一步都另存为一个新档，原档保留。

3. **TZ 数据 + i18n 数据全委托给平台 Intl API**：浏览器和现代 Node 自带 ICU CLDR（IANA 时区数据库 + 所有 locale 字符串），Luxon 自己不带任何这些数据，只调 `Intl.DateTimeFormat.formatToParts` 反推 offset。

三步加起来叫 **"借平台之力"**——Luxon 的 22 KB 其实只是一层薄壳，重活儿都被推给浏览器/Node 内置的几 MB CLDR 数据。

## 实践案例

下面三个案例对应核心要点的三步：immutable chain、TZ 走 Intl、Duration 单位计数。

### 案例 1：immutable chain 的样子

```js
import { DateTime } from 'luxon';

const a = DateTime.fromISO('2026-05-30');
const b = a.plus({ months: 1 }).minus({ days: 7 });

console.log(a.toISODate()); // '2026-05-30'（原实例没变）
console.log(b.toISODate()); // '2026-06-23'
```

`.plus({ months: 1, days: -7 })` 也行，object 参数可以一次传多个单位，比 Moment 的 `add(1, 'month').add(-7, 'day')` 干净。

### 案例 2：时区转换怎么走 Intl

```js
const t = DateTime.fromISO('2026-05-30T10:00', { zone: 'America/New_York' });
const t2 = t.setZone('Asia/Shanghai');
// t2 显示的墙钟是 22:00（NY 10:00 = 上海 22:00），同一个瞬时
```

`setZone` 内部调 `new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai' }).formatToParts(date)`，从输出的 year/month/.../hour 反推 offset。**Luxon bundle 里没有 IANA 数据库**——它就是给浏览器自带的 CLDR 套了一层 API。

### 案例 3：Duration 为什么不是单一数字

```js
import { Duration, DateTime } from 'luxon';

const d = Duration.fromObject({ months: 1 });
const start1 = DateTime.fromISO('2026-01-31');
const start2 = DateTime.fromISO('2026-04-30');

start1.plus(d).toISODate(); // '2026-02-28'（取月末）
start2.plus(d).toISODate(); // '2026-05-30'
```

"1 个月"在不同起点等于不同天数。所以 Duration 内部存的不是 ms，而是 `{ months: 1 }` 这种"单位计数 object"。换成 ms 必须指定 anchor DateTime。

## 踩过的坑

1. **format token 大小写不兼容 Moment**：Luxon 用 Unicode TR35 标准——`yyyy` 不是 `YYYY`、`dd` 不是 `DD`、`HH` 是 24 小时、`hh` 是 12 小时。从 Moment 迁过来 99% 要全文搜索改 token，光改 import 不够。

2. **`Duration.as('milliseconds')` 带 months/years 时是估算**：按 30 天/365.25 天平均算，不是精确值。要精确必须 `start.plus(dur).diff(start, 'milliseconds')` 配合 anchor。

3. **`setZone(zone, { keepLocalTime: true })` 命名违反直觉**：默认 `false` 是"换 zone 看同一个瞬时"，`true` 是"保留墙钟数字、换瞬时"。第一次看 API 几乎所有人都猜反，team code review 时建议强制写注释。

4. **invalid DateTime 不抛错链式继续**：错误输入返回一个 `invalid` 字段非 null 的 DateTime，所有后续 chain method 直接返回 self，最终 `.toISO()` 返回 `null`。这避免链中段炸，但要在用户输入边界查 `dt.isValid`，否则 bug 只在终点暴露。

5. **Interval 是 [start, end) 半开半闭**：和 SQL BETWEEN（闭区间）不一致。`iv.contains(end)` 永远 false。同时用 Luxon 和 SQL BETWEEN 的项目要小心边界值。

## 适用 vs 不适用场景

**适用**：

- 业务里 TZ 是日常（航班/跨国会议/多地区排班）——Luxon 内置 TZ 比 dayjs+plugin 干净
- 多 locale 项目（5+ 语言）——Luxon 不带 locale 数据，bundle 不随 locale 数量增长
- 新项目无 Moment 历史包袱——可以接受新 API
- 现代环境（ES2018+ / Node 16+）——Intl 完整支持

**不适用**：

- bundle 极致敏感（< 5 KB）→ dayjs core 2 KB 更合适
- 旧环境兼容（IE / 部分小程序宿主 / Node small-icu 构建）→ Intl 缺失，Luxon 降级
- 已有 Moment 代码要平滑迁移 → dayjs API 几乎兼容 Moment
- fp 风格强需求（pipe / curry）→ date-fns/fp 友好，Luxon 是 OOP class

## 历史小故事（可跳过）

- **2011 年**：Tim Wood 写 Moment.js，迅速成 JS 日期事实标准，下载量到亿级
- **2017 年**：Moment maintainer Isaac Cambron 开 Luxon 仓库，"如果今天重写 Moment 应该长什么样"，开第一 commit 时就定下 immutable + Intl 路线
- **2020 年 9 月**：Moment 团队官方博客发"项目状态"声明，宣布 Moment 进 maintenance mode，推 Luxon 作为继任者
- **2022 年**：Luxon v3 发布，ESM-first 大重构，把 CommonJS 路径改成可选
- **同时期竞品**：dayjs（2018，押 Moment API 兼容 + plugin）和 date-fns（2014，押 function-per-feature + tree-shake）抢走大半市场

到 2024 年 weekly downloads：dayjs 25M、date-fns 25M、Luxon 6M。Moment 团队用一句"feature freeze"承认了输给生态的事实。

## 学到什么

1. **"如果今天重写 X 应该长什么样"是合法项目动机**：同组织、新仓库、不兼容 API。React Native、Vue 3、Python 3 都走过这条路，代价是用户分流和生态重建。Luxon 没赢回 Moment 留下的市场（被 dayjs / date-fns 抢走大半），但它给"重写而非升级"提供了一个工程档案
2. **借平台标准是减小 bundle 的最强招**：把 280 KB 的 TZ 数据 + 几十 KB 的 locale 委托给平台 ICU，自己只留 22 KB 薄壳。代价是依赖标准实现完整度，旧环境降级——这是"借"的天然约束
3. **immutable + invalid 兜底是工程友好的两条线**：immutable 解决了 Moment 在 React/Redux 里改原 instance 的 bug，invalid 不抛错让 chain 中段错不炸链。两条加起来让 Luxon 在大型 app 里更不容易踩雷
4. **Duration 用 object 存而非单一 ms 是必然的**：因为月、年长度不固定，单位计数才能保留语义。这条让 Duration API 比 Moment 复杂（要懂 normalize / shiftTo），但精确度上是对的

## 延伸阅读

- 官方文档：[moment.github.io/luxon](https://moment.github.io/luxon/) —— Tour / Zones / Formatting / Calendars 四节是入门主路径
- Moment 维护模式公告：[Moment.js Project Status (2020)](https://momentjs.com/docs/#/-project-status/) —— 团队自己解释为什么不在 Moment 改
- API 类型对比：[You Don't (May Not) Need Moment.js](https://github.com/you-dont-need/You-Dont-Need-Momentjs) —— 同一操作 Moment vs Luxon vs date-fns vs Native 的并排对比
- ECMAScript Temporal 提案：[tc39/proposal-temporal](https://github.com/tc39/proposal-temporal) —— Luxon 的下一站参考
- [[dayjs]] —— 同年代押"Moment API 兼容 + plugin"路线的对照组
- [[date-fns]] —— 同年代押"function-per-feature + tree-shake"路线的对照组

## 关联

- [[dayjs]] —— 押 Moment API 兼容路线，2 KB core + plugin 化，迁移成本低
- [[date-fns]] —— pure function 集合，tree-shake 友好，fp 风格首选
- [[temporal]] —— ECMAScript 标准提案，Luxon API 设计某种程度参考它
- [[temporal-polyfill]] —— Temporal 落地前的实验型 polyfill，路线和 Luxon 不同
- [[immer]] —— 同样押 immutable 默认的 JS 库，思路和 Luxon 一脉
- [[i18next]] —— 多 locale 文本翻译；和 Luxon 的 locale-aware 日期格式化是互补关系
- [[effect]] —— TS 副作用引擎，invalid 不抛错的链式哲学和 Luxon 的 isValid 兜底有共鸣

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[i18next]] —— i18next — 让一份 JS 代码同时讲几十种语言
- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[temporal]] —— Temporal — 持久化工作流引擎
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎

