---
title: Day.js — 用 2 KB 复刻 Moment 的极简日期库
来源: 'iamkun (Wang Wei), Day.js 1.11.x, https://github.com/iamkun/dayjs'
日期: 2026-05-30
子分类: 工具库
分类: CLI
难度: 初级
provenance: pipeline-v3
---

## 是什么

Day.js 是一个**只有 2 KB、写法和老牌的 Moment.js 一模一样**的 JavaScript 日期工具库。日常类比：像把一辆 1.5 吨的 SUV（Moment）换成一辆同样四个轮子、方向盘也在原位的 50 公斤卡丁车——开起来手感不变，但拎得起、塞得进任何后备箱。

具体看一行代码就懂：

```js
import dayjs from 'dayjs';
dayjs('2026-05-30').add(1, 'month').subtract(7, 'day').format('YYYY-MM-DD');
// → '2026-06-23'
```

这种"`.add().subtract().format()` 一路串下去"的写法，叫**链式调用**（chain method）。Moment 用户看到这一行不需要学任何新东西，直接把 `import moment from 'moment'` 换成 `import dayjs from 'dayjs'`，90% 场景就能跑。代价：core 没有的能力（时区、相对时间、复杂解析）需要显式 `dayjs.extend(plugin)` 加进来。

## 为什么重要

不理解 Day.js，下面这些事都没法解释：

- 为什么"已经在用 Moment 的项目"愿意花一下午迁到 Day.js，而不是花一周迁到 date-fns
- 为什么一个独立开发者（iamkun，没有公司背书）的库能做到 weekly downloads 25M、GitHub stars 46K+
- 为什么同样是"日期库"，date-fns / luxon / Day.js / Temporal 四条路并存——它们各自押的是哪个用户群
- 为什么 Day.js 的时区行为在 Node 14 和 Node 20 上可能不一样（提示：它不自带时区数据）

## 核心要点

Day.js 的全部世界观可以拆成 **3 件事**：

1. **wrapper instance + immutable**：`dayjs(...)` 返回一个 wrapper 对象，每次 `.add()` 都返回**新对象**，原对象不变。类比：Moment 是"在原地涂改答题卡"，Day.js 是"复印一张再涂改"——React/Redux 这类需要"看引用判断变没变"的场景吃这一套。

2. **core + plugin opt-in**：core 只保留最常用的几个方法（add/subtract/format/isBefore 等），其他能力（utc、timezone、relativeTime、advancedFormat 等 30+）必须显式 `dayjs.extend(plugin)` 才生效。类比：手机出厂只装系统，App 自己挑着装。

3. **API 和 Moment 几乎 1:1 兼容**：方法名、参数顺序、format token（`YYYY-MM-DD`）全部照搬 Moment。这是 Day.js 押的最大筹码——不是技术先进，是**迁移成本逼近 0**。

## 实践案例

### 案例 1：从 Moment 迁过来的最小 diff

90% 业务场景下，Day.js 替换 Moment 只改一行 import：

```js
// 改前
import moment from 'moment';
const t = moment('2026-05-30').add(1, 'day').format('YYYY-MM-DD');

// 改后（业务代码一字不改）
import dayjs from 'dayjs';
const t = dayjs('2026-05-30').add(1, 'day').format('YYYY-MM-DD');
```

bundle 立刻从 67 KB（Moment）降到 ~2 KB（Day.js core），是这场迁移的全部收益。

### 案例 2：immutable 的链式算术

```js
const d = dayjs('2026-05-30');
const d2 = d.add(1, 'month').subtract(7, 'day').startOf('week');

console.log(d.format());    // '2026-05-30T...'  ← 原对象没变
console.log(d2.format());   // '2026-06-22T00:00:00...'  ← 周一 00:00
```

每一步链式调用都返回**新 instance**。读法：从左到右，像说话顺序。这一点和 date-fns 的 `format(addDays(addMonths(d, 1), -7), 'yyyy-MM-dd')` 嵌套调用形成对照。

### 案例 3：plugin extend 处理跨时区会议时间

```js
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);        // 必须先 utc
dayjs.extend(timezone);   // 再 timezone（依赖 utc）

dayjs.tz('2026-05-30 10:00', 'Asia/Shanghai').format();
// → '2026-05-30T10:00:00+08:00'

dayjs.tz('2026-05-30 10:00', 'America/New_York').format();
// → '2026-05-30T10:00:00-04:00'
```

关键：Day.js **自己不存任何时区数据**，把 IANA 时区解析委派给浏览器/Node 自带的 `Intl.DateTimeFormat`。这是它能做小的核心决策，也是和 luxon（自带 IANA 数据，~70 KB）的关键差别。

## 踩过的坑

1. **immutable 的 chain 必须接住返回值**：`d.add(1, 'day')` 单独写一行什么也没发生（不像 Moment 会改原对象），必须写 `const d2 = d.add(1, 'day')`。Moment 老用户最常踩。

2. **plugin extend 是全局副作用**：一处 `dayjs.extend(utc)` 整个进程都生效。monorepo 多包共享 dayjs 时，到底谁负责 extend 文档没明确，issue 区大量"为什么我的 `.tz` 不生效"多半是漏 extend 或顺序错。

3. **timezone 必须先 extend utc**：顺序写反了 `.tz()` 直接报错且信息不友好。约定：项目根 entry 集中 extend 一次，业务文件不要分散加。

4. **format token 用 Moment 风格 `YYYY-MM-DD`**：和 date-fns 的 `yyyy-MM-dd`（小写 y = calendar year）不通用。Day.js 用户切到 date-fns 时 token 系统需要重学。

## 适用 vs 不适用场景

**适用**：

- 已有 Moment.js 代码 + 想换不想重写——一行 import 替换的迁移
- 浏览器 / 小程序 / H5 项目，bundle 敏感但偏好链式 API
- 中等日期需求（格式化、加减、相对时间），用 2-3 个 plugin 就够
- TypeScript 项目（类型质量比 luxon 弱但够用）

**不适用**：

- 极致 tree-shake（只用 5 个函数 ~3 KB）→ date-fns 仍更小
- 强时区 / 夏令时复杂业务 → luxon 内置 IANA 数据，无需 extend 两层
- 函数式 / pipe / curry 风格代码库 → date-fns/fp 更对路
- Hot loop 批处理（10 万+ 日期算术）→ 每次 chain 都 clone，性能差 3-5 倍，用原生 `Date` 或 date-fns

## 历史小故事（可跳过）

- **2011**：Moment.js 发布，迅速成为 JS 日期事实标准，但 67 KB 体积逐渐被吐槽
- **2014**：date-fns 发布，押"纯函数 + tree-shake"路线，但写法和 Moment 完全不同
- **2018**：Moment 团队博客宣告项目 frozen（不再加 feat）；同年 iamkun（Wang Wei，独立开发者）启动 Day.js，押"像 Moment 但小 30 倍"的空白生态位
- **2020**：Day.js weekly downloads 突破 10M，开始与 date-fns 平起平坐
- **2022**：v2 RFC 启动，承诺 TypeScript 全重写、解决 plugin 全局副作用——截至 2024 仍未发布，社区在等

## 学到什么

1. **API 兼容存量是一种独立的产品策略**：Day.js 押的不是技术先进，是"用户已经在用 Moment、不想重写"的心理成本，做出和 Moment 不同实现但同 API 的产品
2. **core 极简 + plugin opt-in 是经典套路的极致版**：jQuery / lodash 都做过，Day.js 把 core 压到 2 KB
3. **immutable + chain 不矛盾**：可以"看起来像链式"但底层每步是新对象，React/Redux 时代友好
4. **委派给运行时是双刃剑**：把时区给 `Intl.DateTimeFormat` 让 Day.js 极小，但行为依赖 Node/浏览器版本——做小要付的代价

## 延伸阅读

- 官网：[day.js.org](https://day.js.org/)（含 30+ plugin 文档和 80+ locale 列表）
- 仓库：[github.com/iamkun/dayjs](https://github.com/iamkun/dayjs)（core 入口 `src/index.js` 仅 ~600 行，可整段精读）
- 对比文章：[You Don't (May Not) Need Moment.js](https://github.com/you-dont-need/You-Dont-Need-Momentjs)（Moment / Day.js / date-fns / luxon 的迁移对照表）
- 设计博客：iamkun 在 day.js.org/zh-CN/docs/about/contact 写过 Day.js 起源
- [[axios]] —— 同年代 npm 工具库代表，都强 ESM、都偏小 bundle
- [[rolldown]] —— bundler 视角看 plugin 系统的另一种实现

## 关联

- [[axios]] —— 同年代 npm 工具库，都走"小 + 链式 / promise 风格 + 生态插件"路线
- [[rolldown]] —— bundle size 敏感的现代 JS 工具链，Day.js 这类小核心库是它的目标用户
- [[turborepo]] —— monorepo 工具，Day.js plugin 全局副作用的难点在 monorepo 多包共享时最尖锐
- [[pnpm]] —— monorepo 包管理器，和 Day.js 一起出现在"小工具组合 + bundle 敏感"的现代前端栈
- [[vitepress]] —— 文档站点工具，Day.js 官网风格的简洁文档是这一代 JS 项目共同审美
- [[starlight]] —— 同样基于 Astro 的文档主题，和 Day.js 共享"零基础也能上手"的文档心智

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[pnpm]] —— pnpm — 全机器只存一份的 Node 包管理器
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
- [[vitepress]] —— VitePress — Vue 团队用 Vite 写的静态文档站点生成器
- [[vue-i18n]] —— vue-i18n — Vue 官方 i18n，切语言整页自己刷新

