---
title: js-joda — 把 Java 的 java.time 整套搬进 JS
来源: 'https://github.com/js-joda/js-joda + js-joda.github.io 官方文档'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

js-joda 是一套**让 JavaScript 也能像 Java 那样处理日期时间**的库——把 Java JSR-310（`java.time`）的整套类和方法名 1:1 搬过来。日常类比：你公司有"中国办公室"和"美国办公室"用同一套表格模板，员工在两边切换不用重学。

你写：

```ts
import {LocalDate} from "@js-joda/core";
const today = LocalDate.now();
const future = today.plusDays(30);   // today 不变，返回新对象
```

这段 JS 代码和 Java 后端 `LocalDate.now().plusDays(30)` 长得一模一样、行为也一模一样。

它的目标用户**不是普通 JS 开发者**（那群人用 dayjs / luxon 更舒服），而是**Java 后端 + JS 前端的全栈团队**——后端写 `ZonedDateTime`、前端也写 `ZonedDateTime`，团队心智一致。

## 为什么重要

不理解 js-joda 的设计，下面这些事都没法解释：

- 为什么 JS 已经有 dayjs / date-fns / luxon，还要再造一个**长得像 Java**的库
- 为什么 Spring Boot + React 的全栈团队愿意吃 100 KB 的 bundle 代价
- 为什么 TC39 Temporal API 设计也大量参考了 java.time（Stephen Colebourne 是中间人）
- 为什么"日期时间 API 设计"这么小的题目能让一个人 25 年做三遍（Joda-Time → java.time → 影响 Temporal）

## 核心要点

js-joda 的设计可以拆成 **三件事**：

1. **immutable**：每个对象创建后字段不可改，`plus / minus / with` 都返回新实例。类比：Lego 积木——你"加一块"不会改原积木，只是拿到一个新组合。这跟 JS 内置 `Date` 的 `setDate()` 直接改自己完全相反。

2. **强类型分层**：`LocalDate`（无时区日期）/ `LocalTime`（无时区时间）/ `LocalDateTime`（无时区日期+时间）/ `ZonedDateTime`（带时区）/ `Instant`（绝对时间点）—— 五个类各管一段。把 `LocalDate` 当 `ZonedDateTime` 用？编译器立刻报错。

3. **Period vs Duration 拆开**：`Period` 是"历法时段"（年月日，闰年闰月会影响实际跨度），`Duration` 是"精确时长"（按秒计，恒定）。DST 那天加 1 个 `Period.ofDays(1)` 走 23 小时，加 1 个 `Duration.ofDays(1)` 走 24 小时。

三件事合起来叫**对 JS 内置 `Date` 几乎所有缺陷的修正**——但代价是把 Java 那套思维搬过来。

## 实践案例

### 案例 1：immutable + 类型分层

```ts
import {LocalDate, ChronoUnit} from "@js-joda/core";

const d1 = LocalDate.of(2026, 5, 29);   // 月份用 1-12（不是 Date 的 0-11）
const d2 = d1.plusDays(7);              // d1 没变，d2 是新对象
const d3 = d1.plus(2, ChronoUnit.WEEKS);
const dow = d1.dayOfWeek();             // DayOfWeek 枚举（不是数字）
```

**逐部分解释**：

- `LocalDate.of(year, month, day)` 月份从 1 开始数（修正 `Date` 的 0-11 怪癖）
- `plusDays` 返回新 `LocalDate`，原对象**永远不动**——用过 `Date.setDate` 踩过坑的人会爱上这个
- `dayOfWeek()` 返回 `DayOfWeek` 枚举（如周五对应 `MAY` 类似的常量对象），要拿数字得 `.value()`——这是 Java 风格，纯 JS 用户会愣一下

### 案例 2：跨语言一致——Java 后端 + JS 前端

```ts
// Java 后端 Spring Boot 返回 JSON
// {"createdAt": "2026-05-29T14:30+08:00[Asia/Shanghai]"}

import {ZonedDateTime, ZoneId} from "@js-joda/core";
import "@js-joda/timezone";              // 必须 import 才有 IANA TZ

const json = await fetch("/order/123").then(r => r.json());
const createdAt = ZonedDateTime.parse(json.createdAt);   // 直接吃 Java toString()
const local = createdAt.withZoneSameInstant(ZoneId.systemDefault());
```

**关键**：Java `ZonedDateTime.toString()` 输出格式 = JS `ZonedDateTime.parse()` 期望格式。两端不需要约定 JSON 日期约定，也不需要写 serializer。这是 js-joda 的**唯一存在理由**。

### 案例 3：DST 边界 Period vs Duration

```ts
import {ZonedDateTime, ZoneId, Duration} from "@js-joda/core";
const ny = ZoneId.of("America/New_York");
// 美国 DST：2026-03-08 02:00 → 03:00 spring forward
const t = ZonedDateTime.of(2026, 3, 7, 14, 0, 0, 0, ny);

const tPeriod   = t.plusDays(1);                  // 历法 +1 天 → 14:00（实际跨 23 小时）
const tDuration = t.plus(Duration.ofDays(1));     // 精确 +86400 秒 → 15:00（多了 1 小时）
```

DST 边界两者差 1 小时——这正是为什么 java.time 把这俩拆开。dayjs / Moment 不区分，DST 边界容易踩坑。

## 踩过的坑

1. **bundle 太大**：`@js-joda/core` 30 KB + `@js-joda/timezone` 70 KB ≈ 100 KB（min+gzip），是 dayjs 2 KB 的 50 倍。Cloudflare Worker / 静态生成站点几乎不能用。

2. **`Month` / `DayOfWeek` 是 enum 不是数字**：JS 没有原生 enum，纯 JS 开发者写 `date.month()` 期望拿 `5`，结果拿到 `Month.MAY` 对象，要再 `.value()`。

3. **TZ 数据冻结**：`@js-joda/timezone` 发布时把 IANA 数据打成快照，DST 规则更新（如某国突然改时区）必须升级包；luxon 直接用浏览器 `Intl.DateTimeFormat`，自动跟系统更新。

4. **`fun x -> ...` 形参里 `Period` vs `Duration` 该用哪个**：新手最常问"加 1 天用哪个？"——历法语义用 `Period`，精确秒用 `Duration`。错用在 DST / 闰秒边界差 1 小时。

## 适用 vs 不适用场景

**适用**：

- Java 后端 + JS / TS 前端的全栈团队，想保持跨语言 API 心智一致
- 需要**严格不变性 + 强类型分层**的金融 / 排班 / 调度系统（误用 `LocalDate` 当 `ZonedDateTime` 立刻编译错）
- 必须正确处理 DST gap / overlap 的应用（订机票、会议预约）
- Node 后端单独跑、不在乎 bundle 体积

**不适用**：

- 纯 JS 团队、没人用 Java——直接学 dayjs / date-fns 心智成本低 10 倍
- 浏览器 bundle 敏感（< 50 KB 总预算）的 SPA / 静态站点
- 只需要"格式化一下显示"的展示场景——dayjs 2 KB 够了
- 想等 TC39 Temporal API 浏览器原生支持的项目（2027 + 基本可用）

## 历史小故事（可跳过）

- **2002 年**：Stephen Colebourne 嫌 Java `Date` / `Calendar` 难用，造 Joda-Time 库——immutable + 类型分层第一次成型
- **2014 年**：同一个 Stephen Colebourne 把 Joda-Time 经验做成 JSR-310，进 Java 8 标准库变成 `java.time` 包
- **2017 年**：JS 团队（非 Stephen 主导，他公开认可）把 `java.time` 整套搬到 JS，发布 js-joda 1.0
- **2020+ 年**：TC39 推 Temporal API 提案，设计大量参考 `java.time`——Stephen Colebourne 间接影响了第三个语言的日期 API
- **2026 年**：Temporal 仍在 Stage 3，js-joda 仍是 Java + JS 全栈团队的稳定选择

## 学到什么

1. **库的目标用户群决定一切**——js-joda 不是为 JS 用户优化，是为跨语言团队优化；理解这一点才知道它"不该"和 dayjs 比 bundle 大小
2. **immutable + 强类型分层**是 Joda-Time → java.time → Temporal 25 年沉淀的共识，不是 Java 独有怪癖
3. **API 一致性是企业级护城河**：单语言生态库再优秀，也救不了"两边 API 各学一套"的全栈团队
4. **Period（历法）vs Duration（精确）拆开**这一点设计层面看着啰嗦，DST / 闰秒边界省的事比想象多

## 延伸阅读

- 官方文档：[js-joda Cheat Sheet](https://js-joda.github.io/js-joda/manual/CheatSheet.html)（半小时把 6 大类全过一遍）
- 设计者博客：[Stephen Colebourne — Joda Time、java.time、Temporal 三代演化](https://blog.joda.org/)（理解为什么这么设计）
- TC39 Temporal 提案：[tc39/proposal-temporal](https://github.com/tc39/proposal-temporal)（看 js-joda 的"未来对手"长什么样）
- [[dayjs]] —— 同领域，对比"极简兼容 Moment" vs "Java 移植"
- [[luxon]] —— 同领域，对比 immutable + 浏览器 Intl vs immutable + 自捆绑数据
- [[date-fns]] —— 同领域，对比"function modular" vs "类层次"

## 关联

- [[dayjs]] —— 同 JS 日期生态，bundle 50 倍小但无类型分层
- [[date-fns]] —— 同 JS 日期生态，函数式风格 vs js-joda 的类层次
- [[luxon]] —— 同 JS 日期生态，借浏览器 Intl 拿 TZ；js-joda 自带 IANA 数据
- [[temporal-polyfill]] —— TC39 标准，设计上 js-joda 与它最像（都受 java.time 影响）
- [[temporal]] —— Temporal API 提案本体，js-joda 的"长期替代候选"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[temporal]] —— Temporal — 持久化工作流引擎
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎

