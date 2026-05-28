---
title: date-fns 模块化日期函数库
来源: https://github.com/date-fns/date-fns + date-fns.org 官方文档
---

# date-fns —— 模块化、不可变、TypeScript 友好的日期函数库

## 一句话总结

date-fns 是 Sasha Koss（@kossnocorp）和 Lesha Koss 兄弟俩 2014 年起一手孵化、之后被社区接住共同维护的 JavaScript 日期工具库，到 2024 年迭代到 v3.x / v4.x 双线并行（v4 把时区能力以 `@date-fns/tz` 子包形式拆出去）。它和这门课里同年代竞品（Moment.js / dayjs / luxon / temporal-polyfill）最大的差别就一句话：**date-fns 不是 class、也不是 wrapper object，它就是 200+ 个独立 export 的 pure function**。所以它能做 Moment 做不到的事——只 import 5 个函数让 bundle ~3 KB；不会因为某次 mutation 导致原 Date 被改；每个函数都能单独 unit test、tree-shake、fp-pipe。

设计哲学一句话：**Date 已经是 JS 的 built-in 类型，不要再造一层包装；只补缺失的"操作"，并保证每次操作都是 pure**。这和 Moment（mutable wrapper）/ luxon（immutable wrapper class）/ Temporal（全新 polyfill 类型系统）三条路都正交。三条路没有绝对优劣，看场景：浏览器极致 bundle（小程序 / 落地页）date-fns 5 函数版 ~3 KB 是 sweet spot；强时区业务（航班 / 跨时区会议）luxon 或 temporal 更稳；遗留 Moment 代码不动它最省事；要"和未来标准对齐"等 Temporal 进 Stage 4。

date-fns 的目标用户：

- 浏览器项目，bundle 敏感，只用 5–20 个日期函数（场景占绝大多数）
- TypeScript 项目，希望每个函数都有精准类型推导（不被 `any` Date wrapper 污染）
- fp 风格代码库，需要 pipe / curry 友好的子模块（`date-fns/fp`）
- 不想学一套新 class API，就把 Date 当作"参数和返回值"用

非目标用户：

- 强时区 / 夏令时复杂业务（用 luxon 或 `@date-fns/tz` v4 子包，core 里 Date 受 host TZ 限制）
- 写"按方法链"自然的代码风格（`moment().add(1, 'day').format()`），那应该用 dayjs / luxon
- 已经迁到 Temporal 提案的实验项目（`temporal-polyfill` 提供 PlainDate / ZonedDateTime 等新类型）
- 严格幅度的运行时（Cloudflare Worker / Lambda 已极小，再优 3 KB 收益不大）

> 怀疑：date-fns 200+ 函数让"按需 import"成 sweet spot，但学习曲线高（每个函数都要查文档，没有"chained method 智能补全"那么顺）。dayjs 只有 ~30 个 method 但学习快。在 5 人以下小项目，dayjs 真的更优？后面 Layer 4 / Layer 6 把数据展开看。

![date-fns bundle size comparison](/projects/date-fns/01-bundle-vs-moment.webp)

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `date-fns` |
| 当前主版本 | 4.x（2024）+ 3.x 仍在维护 |
| 首版 | 2014（v0.x） |
| 1.0 | 2015 |
| 2.0 | 2019（首次大重构） |
| 3.0 | 2023-12（弃 default export，强制 ESM 命名导入） |
| 4.0 | 2024（拆出 `@date-fns/tz` 子包） |
| License | MIT |
| 主仓库 | date-fns/date-fns（GitHub） |
| 维护 | @kossnocorp（Sasha Koss）+ 数百 contributor |
| TypeScript | 100% TS 写就，类型从源码生成 |
| Bundle 大小（min+gzip） | 5 fns ~3 KB / 50 fns ~12 KB / 全量 ~80 KB |
| Tree-shake | ESM 完美 tree-shake；CJS 需 babel-plugin |
| Runtime 依赖 | 0（v3 起完全无 dep） |
| 浏览器 | ✓ 全（IE 不支持 v3+，需 v2） |
| Deno / Bun | ✓（ESM 直接 import） |
| Weekly downloads | ~25M+（2024，npm 全量第 1 名日期库） |

> 怀疑：v3 强制 ESM 命名导入造成大量 v2 项目升级痛苦（默认 `import format from 'date-fns/format'` 不再 work，必须 `import { format } from 'date-fns'`），社区一度怨声载道。这种"激进 breaking change"是工程正确还是用户体验失败？看 Layer 6。

## Layer 1 — 核心抽象：function-per-feature + immutable Date

date-fns 的核心抽象只有一句话：**每个功能 = 一个独立 export 的 pure function，签名固定为 `(date, ...args, options?) => Date | string | number | boolean`**。

具体说就是 4 条工程契约：

1. **function-per-feature**——`format`、`addDays`、`startOfMonth`、`isAfter` 各自独立文件，没有"DateWrapper class"集中容纳。
2. **input = 原生 Date**——参数类型是 `Date | number | string`，不是自定义 class；返回 Date 也是原生 Date。
3. **immutable**——任何"修改型"操作（add / sub / set / startOf）都返回**新 Date**，原 Date 不动。
4. **pure**——同输入同输出，无副作用，方便 unit test、SSR、并发。

这 4 条契约共同的结果是：date-fns "看起来像" Lodash for Date——`addDays(d, 5)` 长得像 `_.add(arr, x)`。这种"工具集而非 class"的形态，让它彻底吃下了"按需 import + tree-shake"的红利。

对比 Moment.js 的 mutable wrapper：

```js
// Moment：调用 .add() 会修改原对象 m，返回 m 自己（链式）
const m = moment('2024-01-01');
m.add(1, 'day');     // m 现在是 2024-01-02（被改了！）

// date-fns：返回新 Date，原 Date 完全不动
import { addDays } from 'date-fns';
const d1 = new Date('2024-01-01');
const d2 = addDays(d1, 1);   // d1 仍是 1/1，d2 是 1/2
```

> 怀疑：immutable 是优雅，但 100 次 `addDays` 在循环里就是 100 个新 Date 对象（GC 压力）。Moment 单对象 mutate 内存压力小。在"批量计算 10000 条订单的过期日"这种场景，是不是反而 Moment 性能更好？需要做 micro benchmark 验证。

更关键的是，"input = 原生 Date" 让 date-fns 可以**和 Date 生态自由互转**：拿 `new Date()`、`Date.now()`、`fetch().headers.get('Date')` 任何来源都能直接喂；返回的 Date 也能丢给 `JSON.stringify`、`localStorage`、`indexedDB`、Prisma、TypeORM。Moment / dayjs 都是 wrapper，需要 `.toDate()` / `.valueOf()` 解包，多一层心智负担。

但代价也明显：**Date 自身的 host timezone 缺陷 date-fns 无法回避**。比如 `new Date('2024-01-01')` 在 `UTC+8` 和 `UTC-5` 浏览器解析出来是不同的 timestamp（前者是本地 0 点，后者也是本地 0 点，但 `UTC` 不同）。这个坑在 v4 通过 `@date-fns/tz` 子包补上了，但 core 本身依然把它留在 host Date 行为里。

> 怀疑：date-fns "拥抱原生 Date" 是优雅的设计选择，但也意味着把 Date 的所有历史包袱（`getMonth()` 0-based、`getDay()` 周日是 0、`new Date('2024/01/01')` 在 Safari 解析失败）一并继承下来。luxon 用全新 DateTime class 把这些都填平了。这种"拥抱原生" vs "另起炉灶"的取舍，决定了用户每天会踩到哪种坑。

## Layer 2 — 200+ 函数家族全景

date-fns 把 200+ 函数划成 12 个 category，每个 category 解决一类问题：

| Category | 代表函数 | 何时用 |
|---|---|---|
| Common | `format` / `parse` / `parseISO` / `formatISO` | 字符串 ⇄ Date 互转 |
| Day Helpers | `addDays` / `subDays` / `differenceInDays` / `eachDayOfInterval` | 天为单位的算术 |
| Month Helpers | `addMonths` / `startOfMonth` / `endOfMonth` / `getDaysInMonth` | 月份操作 |
| Year Helpers | `addYears` / `getYear` / `isLeapYear` | 年份操作 |
| Hour/Minute/Second | `addHours` / `setHours` / `differenceInMinutes` | 时分秒 |
| Week Helpers | `addWeeks` / `startOfWeek` / `getISOWeek` | 周操作（注意 ISO week 与 week of year 不同） |
| Quarter | `getQuarter` / `startOfQuarter` | 季度操作 |
| Comparison | `isAfter` / `isBefore` / `isEqual` / `isSameDay` | 比较 |
| Range / Interval | `areIntervalsOverlapping` / `isWithinInterval` | 区间判断 |
| Locale | `format(d, 'PPpp', { locale: zhCN })` + `formatDistance` | 多语言格式化 |
| Distance / Relative | `formatDistance` / `formatDistanceToNow` / `formatRelative` | "3 天前"、"in 5 hours" |
| Timestamp | `getUnixTime` / `fromUnixTime` | Unix 时间戳互转 |

这 12 个 category 不是设计出来的，而是文档层为了好查检索分的。源码里每个函数都在 `pkgs/core/src/<funcName>/index.ts` 一个独立目录。除了 200+ 主函数外，还有几个**子模块包**（核心机制）：

- `date-fns/locale`——80+ 种 locale，按需 import（`import { zhCN } from 'date-fns/locale'`）
- `date-fns/fp`——pipe / curry 友好版（参数顺序倒过来，options-last 变 options-first，方便 `pipe(addDays(5))` 这种写法）
- `date-fns/utc`（v4）——`UTC` Date 包装类，避开 host TZ
- `@date-fns/tz`（v4 独立包）——任意 IANA 时区，基于 `Intl.DateTimeFormat`

> 怀疑：12 个 category × 平均 20 个函数 = 240+ 函数。任何使用者都不可能记全。实际工程中 90% 用的不超过 20 个（format / parseISO / addDays / addMonths / startOf* / isBefore / differenceInDays / formatDistance）。剩下 80% 长尾函数（`addBusinessDays` / `lastDayOfQuarter` / `eachWeekendOfYear` / `setQuarter`）的存在意义是不是只是"为了完整性"？维护成本是不是被低估？

## Layer 3 — 精读三段

### 段 a：immutable + pure 是怎么落地的？

精读 `addDays` 源码（GitHub permalink 见 Layer 末）：

```ts
export function addDays<DateType extends Date, ResultDate extends Date = DateType>(
  date: DateArg<DateType>,
  amount: number,
  options?: AddDaysOptions<ResultDate> | undefined,
): ResultDate {
  const _date = toDate(date, options?.in);     // ① 把 input 拷成新 Date
  if (isNaN(amount)) return constructFrom(options?.in || date, NaN);

  if (!amount) return _date;                   // ② 0 天直接返回（避开 DST 边界）

  _date.setDate(_date.getDate() + amount);     // ③ 在新 Date 上 setDate
  return _date;
}
```

5 条旁注：

1. `toDate(date)` 不是简单 `new Date(date)`——它内部 `new Date(date.valueOf())`，确保即使传入的是子类（如 UTCDate）也保 prototype。
2. `if (!amount) return _date` 是反 DST bug 的防御：在 DST 跳过的那 1 小时内，`setDate(getDate() + 0)` 也会偏移本地时间。
3. **整个函数没碰原 `date` 参数**——这就是 immutable 契约。Moment 同等操作 `m.add(5, 'days')` 会改 m。
4. 类型签名 `ResultDate extends Date = DateType` 是 v3 之后加的，让 `addDays(utcDate, 5)` 自动推导返回 UTCDate（不丢类型）。
5. 文档里"You don't need date-fns" 段落主动列出 Temporal 等价 API（`Temporal.PlainDate.from('2024-09-01').add({ days: 10 })`）——这是 date-fns v4 的"未来对齐"姿态：承认 Temporal 是更好的方向。

> 怀疑：每个 add* 函数都拷一次 Date（一次 `new Date(d.valueOf())`），在 hot loop 里就是 N 次堆分配。dayjs 内部是 `clone()` 但能复用 immutable wrapper 自身的引用计数。这种"为了纯函数复制 Date"的成本，在 100k+ 调用规模下能不能忽略？应该跑 benchmark。

### 段 b：locale 系统是怎么做按需 import 的？

精读 `pkgs/core/src/locale/zh-CN/index.ts`：

```ts
import type { Locale } from "../types.ts";
import { formatDistance } from "./_lib/formatDistance/index.ts";
import { formatLong } from "./_lib/formatLong/index.ts";
import { formatRelative } from "./_lib/formatRelative/index.ts";
import { localize } from "./_lib/localize/index.ts";
import { match } from "./_lib/match/index.ts";

export const zhCN: Locale = {
  code: "zh-CN",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 4,
  },
};
```

5 条旁注：

1. 每个 locale 是一个**独立 export 的对象**，结构是固定的 5 个回调（formatDistance / formatLong / formatRelative / localize / match）+ options。
2. 用户用法 `format(date, 'PP', { locale: zhCN })`——locale 是 options 的一个字段，不是全局状态。**这和 Moment 的 `moment.locale('zh-cn')` 全局副作用形成鲜明对比**。
3. 因为 locale 是独立 export，bundler 看到 "我只 import 了 zhCN" 就不会把 enUS / fr / ja 等 80+ 其他 locale 打进 bundle。Moment 全 locale ~232 KB 的痛点在这里被化解。
4. `options.weekStartsOn: 1` 是 zh-CN 的"周一为一周第一天"语义——和 enUS 默认的"周日为一周第一天"不同。这个语义不是硬编码到 `startOfWeek` 里的，而是从 locale 上读取的。
5. `firstWeekContainsDate: 4` 是 ISO 8601 周编号规则（"包含 1 月 4 日的那一周是第 1 周"），zh-CN 也是 ISO。

> 怀疑：locale 把"周从哪天开始"这种核心语义放到 locale 对象上，看似优雅（"语言+地区"决定行为），但实际很多业务场景下"周从哪天开始"是产品决定（比如某 SaaS 全球都用周一），不是地区决定。把它锁在 locale 里，反而要为每个产品自定义 locale？要看 `format(d, 'PP', { weekStartsOn: 1, locale: enUS })` 这种"override"是否好用。

### 段 c：fp 子模块——pipe / curry 友好版怎么做的？

`date-fns/fp` 是把所有主函数重新 export 成 curry + 参数倒序的版本。比如 core 里：

```ts
addDays(date, 5)   // 顺序：date 在前，amount 在后
```

`fp` 里：

```ts
import { addDays } from 'date-fns/fp';
addDays(5)(date)   // curry：先吃 amount，返回 date => Date
```

为什么要这样？因为 fp 风格里，"被处理的数据"通常放在最后（pipe / compose 的尾参数），"配置"放前面：

```ts
import { pipe } from 'fp-ts/function';
import { addDays, addHours, format } from 'date-fns/fp';

const addOneDayThenFormat = pipe(
  addDays(1),
  addHours(3),
  format('yyyy-MM-dd HH:mm'),
);
addOneDayThenFormat(new Date());
// 等价于 format('yyyy-MM-dd HH:mm', addHours(3, addDays(1, new Date())))
```

5 条旁注：

1. `fp` 子模块**自动生成**，不是手写——构建脚本扫描 core 里每个函数，生成对应的 curry 版本（带 WithOptions 后缀的还会再生成一份）。
2. 函数总数从 200+ 翻倍到 400+（每个函数都有 `WithOptions` 变体），但 tree-shake 友好——不 import 就不打包。
3. 命名规范：`addDays` → `addDays`（仅 currying，参数倒序）；`addDaysWithOptions` → 接收第三个 options 参数的版本（也 curry）。
4. 这种自动生成方式让 core 维护者不用关心 fp——加一个新函数，构建脚本自动产出 fp 版本。
5. 但代价是"两套 API 同时存在"造成的认知负担：新人查文档时容易混淆 "我现在 import 的是 core 还是 fp"。

> 怀疑：fp 子模块是为 ramda / fp-ts 用户做的，但实际 fp 风格在 JS 业界从未成为主流（React 函数式更接近"函数组件 + hooks"，不等于 currying pipeline）。维护一套自动生成的 fp 子模块，是不是给 < 5% 用户做的奢侈品？v3 / v4 都没砍掉它，但社区里几乎没人讨论 fp 子模块。

## Layer 4 — 与 Moment / dayjs / luxon / temporal 横向对比

| 维度 | Moment.js | dayjs | luxon | temporal-polyfill | date-fns |
|---|---|---|---|---|---|
| 形态 | mutable class | immutable class（薄壳） | immutable class | 全新 type system | function set |
| Bundle (min+gzip) | ~67 KB | ~7 KB | ~22 KB | ~30 KB | 3–80 KB（按需） |
| 全 locale | 已含（~232 KB） | plugin | plugin | 内置（依赖 ICU） | 子包按需 |
| Tree-shake | ✗ | 部分（plugin） | ✗ | ✗ | ✓ 完美 |
| immutable | ✗（mutable） | ✓ | ✓ | ✓ | ✓ |
| TypeScript | 后补 | 后补 + 一般 | 良好 | 内置（提案标准） | 100% TS 原生 |
| 时区支持 | moment-timezone（额外 ~30 KB） | dayjs/plugin/timezone | 内置 | 内置 | `@date-fns/tz` 子包 |
| API 风格 | 链式 | 链式 | 链式 | 静态方法 | 函数 |
| 学习曲线 | 极低 | 低 | 中 | 高（新概念） | 中（要查文档） |
| 维护状态 | 2020 年宣布"legacy" | 活跃 | 活跃 | 活跃（追 TC39） | 活跃 |
| weekly downloads | ~17M（仍高，存量） | ~22M | ~6M | ~500k | ~25M（npm 第 1） |

几条对比心得：

1. **Moment 不会立刻死**——存量项目太多，2020 年宣布 legacy 后下载量仅缓降。它的 mutable + chainable API 在"快速写脚本"场景里仍最舒服。
2. **dayjs 是 Moment 用户的廉价升级**——API 几乎一样、bundle 小 10 倍、immutable。但它不是 tree-shake 友好（plugin 注册是副作用），实际工程中不如 date-fns 极致。
3. **luxon 的核心价值是时区**——同公司（Moment 团队）出品，把时区做成 first-class，但 bundle 大、链式 API、不 tree-shake，适合时区强相关业务。
4. **Temporal 是未来**——TC39 Stage 3 提案（2024 年），原生进入 JS 后会取代所有日期库。但短期（2–5 年）依赖 polyfill，体积偏大，API 也在演化，工程项目还不能 100% 押注。
5. **date-fns 的位置**——浏览器项目 + bundle 敏感 + TS first 的综合最优。代价是没有"链式调用"的舒适感，要按需 import 200+ 个函数名（IDE 智能补全是关键）。

> 怀疑：Moment "legacy" 公告 5 年了，下载量从 ~22M 缓降到 ~17M，但仍是第 2 名。说明"已死宣告"和"实际死亡"差很远。新人到 stack overflow 搜"javascript date library"，前 5 条 SO 答案里 Moment 出现最多，新人继续装 Moment——形成"老知识自我延续"的回路。这种生态惯性能不能被 date-fns 真正打破？看 v3 强制 ESM 是不是正确的赌博。

## Layer 5 — 6 维对比表（同年代日期库）

| 维度 | 说明 | Moment | dayjs | luxon | temporal | **date-fns** |
|---|---|---|---|---|---|---|
| Bundle 极致 | 5 函数级别 | 不可能 | ~7 KB | 不可能 | ~30 KB | **~3 KB** |
| 不可变 | 默认行为 | 否 | 是 | 是 | 是 | **是** |
| TS 友好 | 类型从源码生成 | 后补差 | 一般 | 良好 | 标准内置 | **优秀** |
| 时区 | IANA 全支持 | 加 plugin | 加 plugin | 内置 | 内置 | **子包** |
| API 风格 | 函数 vs 链式 | 链式 | 链式 | 链式 | 静态 | **函数（fp 友好）** |
| 未来对齐 | 跟 TC39 Temporal | 否 | 否 | 部分 | **是** | **部分（v4 文档主动指 Temporal）** |

总分（满分 6×3=18，按 1/2/3 给分）：

- date-fns：3+3+3+2+3+2 = **16**
- temporal-polyfill：1+3+3+3+1+3 = **14**
- luxon：1+3+2+3+3+2 = **14**
- dayjs：3+3+2+1+3+1 = **13**
- Moment：1+1+1+1+3+1 = **8**

> 怀疑：6 维加权是我自己拍的。如果换成"团队学习成本""运行时性能"两维加进去，dayjs 可能反超 date-fns（链式调用 IDE 体验更好）。任何打分都受维度选择影响——这个表的价值不在分数，在让人看到 "date-fns 是多个维度都达到中上的均衡选手，没有任何一项最强，也没有任何一项最弱"。

## Layer 6 — 限制与坑

date-fns 不是银弹。下面是 4 类典型限制 + 真实踩坑场景。

### 限制 1：v3 强制 ESM 命名导入造成升级痛苦

v2 写法（仍占社区多数）：

```ts
import format from 'date-fns/format';      // default export，v3 起报错
import { addDays } from 'date-fns';        // 也支持
```

v3 起：

```ts
import { format, addDays } from 'date-fns';   // 唯一推荐
// 或子路径
import { format } from 'date-fns/format';     // 也支持，但要明确路径
```

社区典型反应：v3 发布后 GitHub Issues 区涌入大量 "我升级 v3 后所有 import 都报错" 帖。原因是很多 lint preset / Babel 配置都是基于 v2 default import 的写法。

应对：v3 升级前先用 codemod（仓库提供）批量替换所有 default import，改成 named import。

### 限制 2：Date 的 host TZ 缺陷无法在 core 里回避

核心场景：

```ts
const d = new Date('2024-01-01');
// 浏览器在 UTC+8: d 是 2024-01-01 08:00:00 UTC
// 浏览器在 UTC-5: d 是 2024-01-01 05:00:00 UTC（次日凌晨偏早）
// startOfDay(d) 也跟着 host TZ 走
```

如果业务需要"无论用户在哪个时区，都把 d 解析成 `UTC` 0 点"，core 做不到。

应对：用 v4 的 `@date-fns/tz` 子包：

```ts
import { TZDate } from '@date-fns/tz';
const utcDate = new TZDate(2024, 0, 1, 'UTC');
```

但代价是引入额外 ~10 KB bundle。

### 限制 3：format token 与 Moment 不兼容，新人易踩

date-fns 的 format token 严格遵循 Unicode TR35：

```ts
format(new Date(), 'YYYY-MM-DD');   // ✗ 警告：YYYY 是 week-numbering year，DD 是 day-of-year
format(new Date(), 'yyyy-MM-dd');   // ✓ 正确
```

而 Moment 用的是 `'YYYY-MM-DD'`。从 Moment 迁过来的项目，所有 format string 都要改大小写。date-fns v2 起会在运行时抛 RangeError 提示新人"用 yyyy 不要用 YYYY"，但实际很多 stack overflow 老答案（5 年前）还在用 YYYY，新人复制就报错。

应对：要么在 IDE 里设全局搜索 `format\(.*YYYY` 替换为 `yyyy`；要么用 codemod。

### 限制 4：长尾函数学习成本高，IDE 补全是必需的

date-fns 200+ 函数命名严格规范，一旦记错就完全找不到：

- `endOfMonth(d)` ✓
- `lastDayOfMonth(d)` ✓ 也存在！
- 这两个函数的差别是什么？前者 `endOfMonth` 返回**月末最后一刻**（23:59:59.999），后者 `lastDayOfMonth` 返回**月末最后一天的 0 点**。从函数名很难看出区别，必须查文档。

应对：永远开 IDE 智能补全 + JSDoc hover + TypeScript 严格模式。脱离这些工具，date-fns 的开发体验会显著下降。

> 怀疑：v3 强制 ESM 后，CJS 项目（Node 老仓库）只能锁 v2，但 v2 不再修 bug。这意味着大量"老 Node 服务"被困在没有 v3 修复的安全 issue 上。这种"激进 ESM"是不是用户体验失败？看下载分布：v2 在 npm stats 里仍占 ~30%（粗估），意味着 30% 用户被锁在 2 年前的版本。和 got v12 的 ESM-only 同样剧本。

## 怀疑总集

把全文 ≥ 7 处怀疑收拢一处：

1. 200+ 函数让"按需 import" 极致，但学习曲线高，dayjs 在小项目是不是更优？（开篇）
2. v3 强制 ESM 造成升级痛苦，激进改造是工程正确还是 UX 失败？（Layer 0）
3. immutable + 每次拷 Date 在 hot loop 里 GC 压力大，Moment 的 mutate 反而快？（Layer 1 + 段 a）
4. 拥抱原生 Date 把 host TZ / `getMonth()` 0-based 等历史包袱继承了，luxon 全新 class 是更彻底的方案？（Layer 1）
5. 12 个 category × 20 个函数的长尾，80% 函数的存在意义只是"完整性"？（Layer 2）
6. locale 把 weekStartsOn 锁在地区上，但产品决定权 > 地区决定权，是否设计错位？（段 b）
7. fp 子模块给 < 5% 用户的奢侈品，维护成本被低估？（段 c）
8. Moment "legacy" 5 年仍是第 2 名，生态惯性能不能被 date-fns 真正打破？（Layer 4）
9. 6 维评分受维度选择影响，换两个维度 dayjs 能反超？（Layer 5）
10. v2 锁死的 CJS 用户拿不到安全修复，"激进 ESM" 重演 got v12 剧本？（Layer 6）

## GitHub permalinks（链接示意）

> 注：以下 permalinks 都基于仓库当前 HEAD（commit hash 来自 2024 主分支），实际跳转可能需要切到稳定 release tag。40-char hex 用于"锁定到具体 commit"，避免 main 移动后内容变化。

- `addDays` 实现（Layer 3 段 a 精读）：
  - https://github.com/date-fns/date-fns/blob/7bb2842dac3d579f84b2de62f015335fb3ac734a/pkgs/core/src/addDays/index.ts
- `format` 实现（Layer 2 + Layer 3 提到的 token 规则）：
  - https://github.com/date-fns/date-fns/blob/7bb2842dac3d579f84b2de62f015335fb3ac734a/pkgs/core/src/format/index.ts
- `zh-CN` locale（Layer 3 段 b 精读）：
  - https://github.com/date-fns/date-fns/blob/7bb2842dac3d579f84b2de62f015335fb3ac734a/pkgs/core/src/locale/zh-CN/index.ts
- `fp` 子模块入口（Layer 3 段 c 提到的自动生成）：
  - https://github.com/date-fns/date-fns/tree/7bb2842dac3d579f84b2de62f015335fb3ac734a/pkgs/core/src/fp

读源码时关键的几个目录：

- `pkgs/core/src/`——所有主函数（`format/`、`addDays/`、`startOfMonth/` ...）
- `pkgs/core/src/_lib/`——内部辅助（如 `defaultOptions/`、`format/formatters/`）
- `pkgs/core/src/locale/`——80+ locale，每个一个目录
- `pkgs/core/src/fp/`——自动生成的 fp 版本
- `pkgs/utc/`——v4 `UTC` 包装类
- `pkgs/tz/`——v4 任意时区包装类（@date-fns/tz）

## 实战 —— 什么时候选 date-fns、什么时候不选

```text
┌─────────────────────────────────────────────────────────┐
│ 浏览器项目 + bundle 敏感 + 只用 5–20 函数 → date-fns ✓✓✓ │
│ TS 项目 + 严格类型 + 函数式风格 → date-fns ✓✓           │
│ Node API gateway + 频繁日期算术 → date-fns ✓            │
│ 强时区业务（航班 / 跨时区会议） → luxon 或 @date-fns/tz │
│ 需要链式 API 自然写法 → dayjs                           │
│ 已经用 Moment 多年，没出问题 → 不动它                   │
│ 实验项目 + 押注未来 → temporal-polyfill                 │
└─────────────────────────────────────────────────────────┘
```

5 个实战 tips（来自社区高票回答 + 个人踩坑）：

1. **永远 named import，从来不用 default import**——v3 起强制，养成习惯。
2. **format token 严格用小写 `yyyy-MM-dd`**——大写 `YYYY` 会触发警告。
3. **批量算术先 benchmark**——10k+ 次 `addDays` 在 hot loop 里要看 GC，必要时退回原生 `setDate`。
4. **locale 按需 import**——`import { zhCN } from 'date-fns/locale'`，绝不全量 import。
5. **时区敏感业务用子包**——core 不解决 TZ，引 `@date-fns/tz` 或换 luxon。

## 学到的事

- "function-per-feature" 是一种和 OOP 完全不同的库设计哲学：**把"对象 + 方法"拆成"函数 + 数据"，让 tree-shake 成为天然属性**。
- immutable + pure 不是免费午餐——多一次堆分配的成本在 hot loop 里会显现，需要 micro benchmark 验证才能下结论。
- locale 系统的设计可以"全局副作用"也可以"options 传入"——前者写起来短（Moment），后者更纯（date-fns），适合 SSR / 并发。
- TC39 Temporal 提案进 Stage 3 后，所有日期库的"未来对齐"都成了营销点。date-fns v4 在文档里主动列 Temporal 等价 API（"You don't need date-fns"），这种"承认自己未来会过时"的姿态在工程社区罕见。
- v3 强制 ESM 是一次"激进押未来"的赌博：短期得罪 v2 用户，长期获得"现代 ESM 项目首选"的位置。同样的剧本在 got v12、wretch v2 都演过。

## 关联

- 与 Moment.js（前作 / 同年代竞品）：mutable vs immutable / 链式 vs 函数 / 全打包 vs 按需。
- 与 dayjs（廉价升级）：Moment-like API 但更轻；plugin 模式 vs date-fns/locale 子包模式。
- 与 luxon（时区 first-class）：date-fns 把时区放子包，luxon 内置；前者轻，后者全。
- 与 temporal-polyfill（未来标准）：date-fns v4 文档主动指引 Temporal API；Temporal 进 Stage 4 后 date-fns 可能逐步退场。
- 与 lodash（同形态库）：lodash 是"通用工具集"对应 Object/Array，date-fns 是"日期工具集"对应 Date。两者设计哲学完全一致：function-per-feature + tree-shake first。
- 与 axios / got / wretch（同 Season HTTP 库）：date-fns 是 Season 23 工具库 B 分支首篇，和 HTTP 库的关系是"都属于 npm 工具集，都强 ESM、都 TS first"。
- 与 fp-ts / ramda（fp 风格库）：date-fns/fp 是为这两个库的用户准备的，但实际渗透率低。

## 速记卡

- 200+ 个独立 export 的 pure function，签名固定 `(date, ...args, options?) => out`
- bundle 极致 tree-shake：5 函数 ~3 KB（vs Moment.js 67 KB）
- v3 起强制 ESM 命名导入（`import { format } from 'date-fns'`）
- v4 拆出 `@date-fns/tz` 子包补 IANA 时区
- format token 严格 Unicode TR35：用 `yyyy-MM-dd` 不要用 `YYYY-MM-DD`
- locale 是独立 export 对象，按需 `import { zhCN } from 'date-fns/locale'`
- `fp` 子模块自动生成 curry + 倒序版，给 fp-ts / ramda 用户
- weekly downloads ~25M（npm 全量第 1 名日期库）

## 一图概括（文字版）

```
原生 Date  →  date-fns 200+ 函数 (pure / immutable)  →  新 Date / string / boolean
   ↑                  ↑                                     ↓
   ├── new Date()     ├── format / parse / addDays         ├── 喂给 JSON
   ├── Date.now()     ├── isAfter / differenceInDays       ├── 存 indexedDB
   └── fetch().Date   ├── locale: { zhCN } (按需 import)   └── 喂给 ORM
                      └── fp/utc/tz 子模块（按需）
```

这就是 date-fns 的全部世界观——**Date 是一等公民，函数是工具集，组合靠 import**。

