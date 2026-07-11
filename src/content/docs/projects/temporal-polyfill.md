---
title: temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
来源: 'https://github.com/fullcalendar/temporal-polyfill'
日期: 2026-05-30
分类: projects / 工具库
难度: 中级
---

## 是什么

temporal-polyfill 是 **FullCalendar 团队写的一个 JavaScript 库，实现 TC39 Temporal API**，让你在原生尚未齐套的环境里也能用上现代日期时间。日常类比：装修标准（Temporal）已在 2026-03 进 Stage 4 / ES2026，temporal-polyfill 是按图纸先装好的装修队——Safari 等还没齐时照样能住。

JavaScript 内置的 `Date` 是 1995 年照着 Java 早期 Date 仓促做的，欠了四笔债：mutable、月份从 0、没有 IANA 时区、日期算术不直观。Temporal 用 6 个不可变类把这些事拆开，每个类只管自己的领域。

```js
import { Temporal } from 'temporal-polyfill';

const birthday = Temporal.PlainDate.from('2026-05-29');   // 生日，没时区
const flight   = Temporal.ZonedDateTime.from('2026-05-29T09:30[Asia/Shanghai]');
const log      = Temporal.Instant.from('2026-05-29T01:30:00Z'); // 物理时间点
```

同一行 `Date` 干的活，Temporal 强迫你显式说：这是壁挂日历上的日期，还是上海时区的 9:30，还是绝对的物理时刻。

## 为什么重要

- 不理解它，就解释不了为什么 `new Date('2026-05-29')` 是 UTC 0 点而 `new Date('2026-05-29 09:30')` 是本地 9:30
- 不理解它，就看不懂为什么把生日存成"上海时区的 5 月 29 日"，飞纽约后会变成"5 月 28 日"
- 不理解它，就会以为"加 1 个月"在所有日期库里都一样，结果 dayjs 和 Temporal 给你两个不同答案
- 不理解它，就分不清为何 Stage 3（2021）到 Stage 4（2026-03）能拖约 5 年，也看不懂为何规范进了仍要 polyfill

## 核心要点

Temporal 把"日期时间"拆成 **6 个互不串台的类**，再加 4 个辅助类。

1. **PlainDate / PlainTime / PlainDateTime —— 没时区的"壁挂时钟"**：表达"5 月 29 日"或"9:30"这种和地球转哪儿无关的概念。类比：日历上画的红圈，你飞哪里红圈不会动。

2. **ZonedDateTime —— 带 IANA 时区的完整时间点**：表达"上海时间 5 月 29 日 9:30"。类比：航班起飞时间，物理时间点固定，wall clock 跟时区走。

3. **Instant —— 绝对 UTC 物理时间**：纳秒精度的时间戳。类比：日志事件，地球上所有人对它达成一致。

4. **Duration —— 不归一化的时长**：`{months: 1, days: 3}` 不会立刻折算成毫秒，因为"1 个月有多少毫秒"取决于哪个月。类比：菜谱写"加 1 勺糖"，多少克要看勺有多大。

5. **不可变 + 显式转换**：所有"修改"返回新实例；类型间转换必须显式调方法（`date.toPlainDateTime(time)`），不会隐式发生。

## 实践案例

### 案例 1：生日要用 PlainDate，不能用 ZonedDateTime

```js
// 错误：把生日做成带时区的时间点
const birthday = Temporal.ZonedDateTime.from('2000-05-29T00:00[Asia/Shanghai]');
birthday.withTimeZone('America/New_York').toPlainDate();
// → 2000-05-28（变成 28 号了！）

// 正确：生日就是日历上一个日子，没有时区
const birthday2 = Temporal.PlainDate.from('2000-05-29');
// 不管你飞哪儿，永远是 5 月 29 日
```

为什么？生日的语义是"日历上的某一天"，不是"地球某个物理时刻"。用 ZonedDateTime 等于把语义钉死在某个时区，飞别处就漂了。

### 案例 2：航班用 ZonedDateTime，物理时间不变 wall clock 切换

```js
const departure = Temporal.ZonedDateTime.from(
  '2026-05-29T09:30[Asia/Shanghai]'
);
const arrivalView = departure.withTimeZone('America/New_York');
// arrivalView 的 wall clock 是纽约时间 21:30 前一天
// 但 departure.epochNanoseconds === arrivalView.epochNanoseconds
```

`withTimeZone` 不改物理时刻，只换"看时间"的角度。DST、负时区、夏令时跳跃自动处理。

### 案例 3：Duration 不归一化 + relativeTo

```js
const dur = Temporal.Duration.from({ months: 1, days: 3 });

dur.total({ unit: 'milliseconds' });
// → TypeError！1 个月有多少毫秒？没标准答案

dur.total({ unit: 'milliseconds', relativeTo: '2026-01-01' });
// → 基于"2026-01 是 31 天"算出具体毫秒数

const next = Temporal.PlainDate
  .from('2026-01-31')
  .add({ months: 1 }, { overflow: 'reject' });
// → 抛错：2 月没有 31 日（dayjs 默认 constrain 到 2-28，可能不是你要的）
```

逼调用者自己决定边界行为，是 Temporal 把"日期数学没有标准答案"这件事直接 surface 出来。

## 踩过的坑

1. **把生日存成 ZonedDateTime** —— 跨时区漂移变 28 号，应该用 PlainDate 表达"日历上的日子"
2. **把航班存成 PlainDateTime** —— 没时区的 9:30 在地球哪个 9:30？无法 join 真实物理事件
3. **Duration 直接 total 毫秒抛错** —— 1 个月长度依赖月份，必须传 `relativeTo` 给参考点
4. **add({months:1}) 不指定 overflow** —— 1 月 31 日加 1 月默认 constrain 到 2 月 28 日，需要 reject 时要显式写

## 适用 vs 不适用场景

适用：
- 业务严肃依赖时区 / DST / 多历法（航空、金融结算、跨国排班、农历应用）
- 要跑在 Safari / 旧 Chromium 等尚未齐套 Temporal 原生的环境，用 polyfill 对齐 API
- 已经被 Date 的隐式坑反复咬过，宁可写 30 字符换显式类型

不适用：
- bundle 极致敏感（< 5 KB），dayjs 的 ~2 KB 差距约 7 倍
- 只是 format 一下日期或显示评论时间，Date + Intl.DateTimeFormat 就够
- 目标运行时已原生 Temporal（如 Chrome 144+ / Node 26+）且无旧浏览器包袱——可直接用全局 `Temporal`
- 短命项目（< 1 年），学习 6 类 + 显式转换的成本回不来

## 历史小故事（可跳过）

- **2017 年**：Maggie Pint（曾是 Moment.js 维护者）联合 Philipp Dunkel、Richard Gibson 在 TC39 启动 Temporal，思想直接来自 Stephen Colebourne 主导的 java.time（Java 8+）和 js-joda
- **2021 年**：Temporal 进 Stage 3，官方 reference polyfill 发布，bundle 约 30 KB
- **2023 年**：FullCalendar 团队 Adam Shaw 等人发布 temporal-polyfill，bundle 约 15 KB，性能更好，成为生产推荐
- **2026-03**：TC39 将 Temporal 推进 **Stage 4**，纳入 ECMAScript 2026；Firefox 139+ / Chrome 144+ / Node 26+ 已原生，Safari 仍部分/未齐
- Stage 3→4 约 5 年：Calendar spec 重 + 引擎实现量大；早期采用者靠官方或 fullcalendar polyfill 过渡

## 学到什么

- 不可变 + 强类型不是函数式的专利，动态语言里靠 6 个 class 也能模拟出来
- "1 个月有多少天"这种问题没有标准答案，好的 API 是逼调用者面对它而不是悄悄决定
- 语言标准化是漫长博弈，Stage 3 → Stage 4 卡约 5 年并不罕见；进规范后仍要等引擎齐套
- 日期库的真正分歧在"什么是日期"——dayjs / luxon 模糊处理，Temporal 拆 6 类强制你回答
- polyfill 让标准在原生缺口期可用：Stage 4 之后，temporal-polyfill 的价值从"抢先"变成"补齐"

## 延伸阅读

- TC39 提案主页：https://tc39.es/proposal-temporal
- 官方 reference polyfill：https://github.com/tc39/proposal-temporal
- 生产推荐实现：https://github.com/fullcalendar/temporal-polyfill
- MDN Temporal 文档：https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal
- 设计哲学博客：Maggie Pint, "Maintaining Moment.js"（2020）—— 解释为什么 Moment 维护者主动推 Temporal

## 关联

- [[dayjs]] —— Moment API + plugin 化的对照路径，bundle 优势在 Temporal 标准化前仍是首选
- [[date-fns]] —— fp 风格 + 函数粒度 tree-shake，与 Temporal OOP 风格的正交对照
- [[luxon]] —— Maggie Pint 留下的另一条精神后裔，luxon 在用户态做完整重写，Temporal 进语言层
- [[hindley-milner]] —— 类型系统挡错误的设计哲学源头，Temporal 用 6 个 class 在动态语言里复刻
- [[immer]] —— 不可变更新的另一种实现路径，对照 Temporal 的"返回新实例"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[projects/timelinejs]] —— TimelineJS — 把 Google Sheet 一键变成新闻时间线
- [[vis-timeline]] —— vis-timeline — 时间轴 / 日程 / 历史事件三合一组件
