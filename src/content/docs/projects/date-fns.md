---
title: date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
来源: 'https://github.com/date-fns/date-fns'
日期: 2026-05-30
分类: projects / 工具库
难度: 初级
---

## 是什么

date-fns 是一个 **JavaScript 日期工具库**，长得像 Lodash for Date：你不会拿到一个新的 `DateThing` 对象，只会拿到 200 多个**独立 export 的纯函数**——`addDays`、`format`、`differenceInDays`、`isAfter` 等等。

日常类比：像厨房抽屉里的一组**单独包装的工具**——开瓶器、削皮刀、量勺，各自独立。你只用削皮刀就只拿削皮刀，不用为了用一个工具搬来一整套料理机。Moment.js 是后者，date-fns 是前者。

```js
import { addDays, format } from 'date-fns'
const tomorrow = addDays(new Date(), 1)
console.log(format(tomorrow, 'yyyy-MM-dd'))   // 2026-05-31
```

输入是原生 `Date`，输出是新 `Date` 或字符串，**没有任何 wrapper class**。所以每个函数能单独 import、单独 tree-shake、单独 unit test。

## 为什么重要

不理解 date-fns 的设计哲学，下面这些事都没法解释：

- 为什么 Moment.js 一个 import 就 67 KB，date-fns 用 5 个函数只有 ~3 KB
- 为什么 date-fns 不让你写 `d.addDays(1).format()` 链式调用——它没有 wrapper，没法挂方法
- 为什么 v3 起 `import format from 'date-fns/format'` 突然报错，必须改成 `import { format } from 'date-fns'`
- 为什么同样是 immutable，dayjs 用 wrapper class 但 date-fns 用 pure function——形态分歧从这里开始

## 核心要点

date-fns 的设计可以拆成 **三条契约**：

1. **function-per-feature**：每个功能一个独立 export 的函数，没有集中的 `DateWrapper` 类。类比：每个工具单独装在抽屉里，不打成一个 Swiss Army knife。

2. **input = 原生 Date**：参数是 `Date | number | string`，返回也是原生 `Date`。所以任何 `new Date()`、`Date.now()`、ORM 查出来的 Date 都能直接喂，不需要 `.toDate()` 解包。

3. **immutable + pure**：所有"修改型"操作（`addDays`、`setHours`、`startOfMonth`）都返回**新 Date**，原 Date 不动；同输入同输出，没副作用。这让 SSR / 并发 / unit test 都简单。

三条契约合起来 = bundler 一看就知道你只用了哪几个函数，没用的函数全部摇掉。

## 实践案例

### 案例 1：算 7 天后的日期

```js
import { addDays } from 'date-fns'
const today = new Date('2026-05-30')
const next = addDays(today, 7)
console.log(today)   // 2026-05-30（没动）
console.log(next)    // 2026-06-06（新 Date）
```

**逐部分解释**：

- `addDays(date, amount)` 是顶层函数，不是方法
- `today` 在调用前后**完全相同**——这就是 immutable 契约
- `next` 是一个全新的 `Date` 对象，可以直接喂给 `JSON.stringify`、`localStorage`、Prisma

### 案例 2：格式化成中文，locale 按需 import

```js
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

const d = new Date('2026-05-30')
console.log(format(d, 'yyyy 年 M 月 d 日', { locale: zhCN }))
// 2026 年 5 月 30 日
```

**关键**：`zhCN` 是从 `date-fns/locale` 单独 import 的对象。bundler 看到你只 import 了 zhCN，就**不会**把 enUS / fr / ja 等 80+ 其他 locale 打进 bundle。Moment.js 是全 locale 内嵌（约 232 KB），这里被化解。

### 案例 3：算两个日期相差几天

```js
import { differenceInDays, isAfter } from 'date-fns'

const start = new Date('2026-01-01')
const end = new Date('2026-05-30')
console.log(differenceInDays(end, start))  // 149
console.log(isAfter(end, start))            // true
```

`differenceInDays(later, earlier)` 直接返回 number，`isAfter` 直接返回 boolean——没有 wrapper、没有方法链，**像调用普通工具函数**。

## 踩过的坑

1. **format token 大小写陷阱**：`format(d, 'YYYY-MM-DD')` 会触发警告——`YYYY` 是 ISO week-numbering year，`DD` 是 day-of-year。正确写法是小写 `'yyyy-MM-dd'`。从 Moment 迁过来的项目所有 format string 都要改大小写。

2. **v3 起强制 ESM 命名导入**：v2 的 `import format from 'date-fns/format'`（default export）在 v3 报错。必须改成 `import { format } from 'date-fns'` 或 `import { format } from 'date-fns/format'`。升级 v3 前先跑官方提供的 codemod。

3. **原生 Date 的时区坑没法绕**：`new Date('2026-01-01')` 在不同时区浏览器解析出不同 `UTC` 值。core 层不解决，要引 `@date-fns/tz` 子包（v4 起独立包，约 +10 KB）。

4. **hot loop 里 GC 压力大**：每次 `addDays` 都拷一个新 Date，10k+ 次调用在批量算账场景下 GC 开销比 Moment mutable 明显。这种场景要 benchmark，必要时退回原生 `setDate`。

## 适用 vs 不适用场景

**适用**：

- 浏览器项目 + bundle 敏感 + 只用 5–20 个日期函数（典型场景）
- TypeScript 项目要精确类型推导（不被 `any` Date wrapper 污染）
- SSR / 并发场景，需要 pure function 不留全局状态
- fp 风格代码库，`date-fns/fp` 提供 curry + 倒序参数版

**不适用**：

- 强时区 / 夏令时业务（航班、跨时区会议）→ 用 [[luxon]] 或 `@date-fns/tz`
- 想写 `d.add(1, 'day').format()` 这种链式 API → 用 [[dayjs]]
- 已经在用 Moment 多年的存量项目，没出问题别迁
- 实验性押注 TC39 标准 → 用 [[temporal-polyfill]]

## 历史小故事（可跳过）

- **2014 年**：Sasha Koss + Lesha Koss 兄弟孵化 v0.x，对标 Moment.js 的 mutable 痛点
- **2019 年**：v2.0 大重构，TypeScript 化、参数顺序统一
- **2020 年**：Moment.js 官方宣布 "legacy" 不再积极开发，date-fns / dayjs / luxon 接力
- **2023-12**：v3.0 砍 default export，强推 ESM 命名导入，社区一阵阵痛
- **2024 年**：v4 拆 `@date-fns/tz` 出独立包补时区，weekly downloads ~25M 拿下 npm 第一日期库

## 学到什么

- **"工具集 vs 类对象"是库设计的两条根本路线**——OOP wrapper 写起来顺，但拖累 tree-shake；function-per-feature 写起来啰嗦，但 bundle 极致
- **immutable 不是免费午餐**——hot loop 里每次拷 Date 有 GC 成本，benchmark 决定边界
- **强推 ESM 是激进押未来**——v3 短期得罪 v2 用户，长期换来"现代 ESM 项目首选"位置，和 got v12 同剧本
- **生态惯性极强**——Moment 宣布 legacy 5 年仍是第二名，"老答案延续"形成回路，date-fns 靠 npm 数据慢慢翻盘

## 延伸阅读

- 官方文档：https://date-fns.org/ —— 200+ 函数全索引 + 在线 playground
- 仓库 README：https://github.com/date-fns/date-fns —— 含 v3 升级 codemod
- Unicode TR35 format token 规范：https://www.unicode.org/reports/tr35/tr35-dates.html
- TC39 Temporal 提案：https://tc39.es/proposal-temporal/ —— 未来标准，date-fns v4 文档主动指向它
- [[luxon]] —— 时区 first-class 的另一条路线
- [[dayjs]] —— Moment-like 链式 API 的轻量替代

## 关联

- [[dayjs]] —— Moment 风格链式 API 的廉价升级，但 plugin 注册有副作用，tree-shake 不如 date-fns 极致
- [[luxon]] —— 同年代日期库，时区 first-class，wrapper class 路线，bundle 偏大
- [[temporal-polyfill]] —— TC39 未来标准的 polyfill，date-fns v4 文档主动列等价 API
- [[js-joda]] —— Java 8 java.time 移植到 JS，immutable + 强类型，受众更窄
- [[lodash]] —— 设计哲学完全一致：function-per-feature + tree-shake first，date-fns 是日期版的 lodash
- [[tanstack-query]] —— 同样靠 ESM 命名导入吃 tree-shake 红利的代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
- [[projects/timelinejs]] —— TimelineJS — 把 Google Sheet 一键变成新闻时间线
- [[vis-timeline]] —— vis-timeline — 时间轴 / 日程 / 历史事件三合一组件
