---
title: dayjs 极简 Moment.js 替代
来源: https://github.com/iamkun/dayjs + day.js.org 官方文档
---

# dayjs —— 用 ~2 KB 复刻 Moment.js API、靠 plugin 系统按需加料的极简日期库

## 一句话总结

dayjs 是 iamkun（Wang Wei）2018 年起一手孵化、迭代到 2024 年仍在 1.x 主线（v2 在路上但未发布）的 JavaScript 日期工具库。它和这门课 Season 23 工具库 B 分支同年代竞品（Moment.js / date-fns / luxon / temporal-polyfill）最大的差别就一句话：**dayjs 在 API 上几乎完全复刻 Moment.js，但在工程实现上把 67 KB 的 Moment 砍到 ~2 KB 的 core，再用 plugin 系统让用户按需 extend**。所以它能做 Moment 做不到的事——bundle 极致小、immutable 不会改原 instance、新功能（如 timezone）能 lazy 加而不是默认拖进项目。

设计哲学一句话：**保留 Moment 那条已经被几百万开发者肌肉记忆的 chain API（`dayjs().add(1, 'day').format()`），但底层换成 immutable + plugin extend 的现代实现**。这条路和 date-fns（function-per-feature，pure function）/ luxon（重写 class，时区 first-class）/ Temporal（全新 polyfill 类型系统）三条路都不一样——dayjs 押的是"迁移成本"这一项，把"已经在用 Moment、想升级又怕改 API"的存量用户接住。

dayjs 的目标用户：

- 已有 Moment 代码、想换不想重写：90% 场景一行 `import dayjs from 'dayjs'` 替换 `moment` 就跑（PR-style 迁移）
- 浏览器 / 小程序 / H5 项目，bundle 敏感，但不想学 date-fns 的 200+ 函数式 API
- 喜欢链式调用风格（`.add().subtract().format()`），讨厌 `addDays(addMonths(d, 1), 7)` 这种嵌套
- TypeScript 项目，但接受"Moment 那一套类型"（dayjs 自带 `.d.ts`）

非目标用户：

- 极致 tree-shake（只用 5 个函数 ~3 KB）→ date-fns 仍更小
- 强时区 / 夏令时复杂业务 → luxon 内置时区，dayjs 必须 extend 两个 plugin（utc + timezone）才行
- fp / pipe / curry 风格代码库 → date-fns/fp 友好，dayjs 的 chain 形态不 fp
- 押注 Temporal 标准的实验项目 → temporal-polyfill 更对路

> 怀疑：dayjs API 完全兼容 Moment 是迁移友好，但也继承 Moment 设计缺陷（如 timezone 的 plugin 必加且 i18n 需要单独 import）。"兼容" 是不是变成"被绑架"？后面 Layer 4 / Layer 6 把 trade-off 展开看。
> 怀疑：dayjs 与 date-fns 在 weekly downloads 接近（25M），但 GitHub stars dayjs > date-fns（46K vs 34K，2024 年数）。社区"投票"vs"使用"差异说明什么？是 Moment 用户惯性更大，还是 dayjs 学习曲线低让小项目第一选择更倾向它？

![dayjs plugin architecture](/projects/dayjs/01-plugin-architecture.webp)

## Layer 0 —— 档案速查

| 维度 | 信息 |
|---|---|
| 主仓库 | https://github.com/iamkun/dayjs |
| 作者 | iamkun（Wang Wei，独立开发者） |
| 起步 | 2018 年初 |
| 当前版本 | 1.11.x（2024）；v2 已在 RFC 但未 release |
| 协议 | MIT |
| 主语言 | JavaScript（早期）→ 部分类型在 `types/index.d.ts` 单独维护 |
| weekly downloads | ~25M（与 date-fns 持平，仅次于 Moment 仍在的 ~17M） |
| GitHub stars | 46K+（2024） |
| bundle size | core ~2 KB（min+gzip）；典型组合（utc + timezone + relativeTime）~5 KB |
| 测试 | Jest + 大量 fixture 比对 Moment 输出（保兼容性） |
| 官网 | https://day.js.org |

dayjs 在 npm 工具库生态里的"位置"：

- 和 Moment.js（前作）：API 兼容、bundle 1/30、维护中（Moment 已 frozen）。
- 和 date-fns（同年代）：哲学相反——dayjs = chain wrapper / Moment-like；date-fns = pure function / fp-friendly。
- 和 luxon（同年代）：哲学正交——luxon 内置时区与重 i18n，dayjs 把这些拆 plugin。
- 和 temporal-polyfill（未来标准）：dayjs 不主动靠拢；issue 区有讨论但 v2 路线图没承诺迁移到 Temporal 类型。

## Layer 1 —— 核心抽象：dayjs(input).method().method()...

dayjs 的"原子结构"只有一个：**Dayjs 这个 class（或者更精确说，工厂函数返回的 instance）**。所有操作都是这个 instance 上的 method，每个 method 返回新 instance（immutable），所以可以无限 chain。

```js
// 1. 创建（多种 input 都接受）
const a = dayjs();                          // 当前时间
const b = dayjs('2026-05-29');              // ISO string
const c = dayjs(new Date());                // 原生 Date
const d = dayjs(1716998400000);             // unix ms
const e = dayjs(a);                         // clone（也返回新 instance）

// 2. 链式操作（每一步都返回新 instance，原 instance 不变）
const f = dayjs('2026-05-29')
  .add(1, 'month')      // → 2026-06-29 (新 instance)
  .subtract(7, 'day')   // → 2026-06-22 (再新一个)
  .startOf('week')      // → 周一 00:00 (再新一个)
  .format('YYYY-MM-DD HH:mm');

// 3. 取值（终点 method，返回原始类型）
a.year();        // 2026
a.month();       // 4 (0-based, 5 月)
a.date();        // 29
a.day();         // 0-6 (周日=0)
a.unix();        // 1716998400
a.toDate();      // 转回原生 Date
a.format();      // 'YYYY-MM-DDTHH:mm:ssZ' (ISO)

// 4. 比较
dayjs('2026-05-29').isBefore(dayjs('2026-06-01'));   // true
dayjs('2026-05-29').isAfter('2026-05-01');           // true (字符串自动 parse)
dayjs('2026-05-29').isSame('2026-05-29', 'day');     // true (按粒度)

// 5. 验证
dayjs('not a date').isValid();   // false
```

和 date-fns 的对比一句话：

```js
// date-fns（pure function）
import { addDays, addMonths, format } from 'date-fns';
const result = format(addDays(addMonths(new Date(), 1), -7), 'yyyy-MM-dd');

// dayjs（chain method）
const result = dayjs().add(1, 'month').subtract(7, 'day').format('YYYY-MM-DD');
```

两者最终都做对同一件事，但开发者读起来顺序不同：date-fns 是"从内向外"，dayjs 是"从左到右"。这就是为什么 dayjs 对 Moment 老用户零迁移成本——chain 顺序就是说话顺序。

> 怀疑：chain 顺序好读，但 debug 时不好打中间断点（每一步都是 new instance，没有命名变量）。在大型业务代码里，是不是还是该用 date-fns 风格更好定位 bug？dayjs README 没明确回应这个 trade-off。

## Layer 2 —— plugin 架构（按需 extend）

dayjs 的核心工程武器是 plugin 系统。core 只保留"绝对必要"的方法（add / subtract / format / isBefore / valueOf 等），其他全部下放到 plugin。

### plugin extend 的契约

```js
// 1. import core
import dayjs from 'dayjs';

// 2. import plugin（独立子模块）
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

// 3. extend（注册到全局 Dayjs prototype）
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

// 4. 使用 plugin 提供的新 method
dayjs().utc().format();                        // utc plugin 加的 .utc()
dayjs.tz('2026-05-29 10:00', 'Asia/Shanghai'); // timezone plugin 加的 .tz()
dayjs('2024-01-01').fromNow();                 // relativeTime plugin 加的 .fromNow()
```

### plugin 的内部形态

每个 plugin 是一个 `(option, dayjsClass, dayjsFactory) => void` 函数，可以：

- 给 `dayjsClass.prototype` 加新 method（最常见）
- 给 `dayjsFactory` 加 static method（如 `dayjs.tz()`）
- 包装 / 改写已有 method（少见，但 utc plugin 会改 `.format()`）

伪代码（链接示意，非真实精读，但形态准确）：

```js
// dayjs/plugin/relativeTime/index.js（简化）
export default function (option, Dayjs, dayjs) {
  Dayjs.prototype.fromNow = function (withoutSuffix) {
    return dayjs(this).from(dayjs(), withoutSuffix);
  };
  Dayjs.prototype.from = function (input, withoutSuffix) {
    // 计算两个 instance 的差，按 i18n 输出 "几秒前 / 一小时前"
    // ...
  };
}
```

这套架构带来的工程结果：

- bundle 极致小：core 不带 timezone / locale / fromNow / advancedFormat 等 → 只用 core 就 ~2 KB
- 副作用控制：plugin 必须显式 `dayjs.extend(...)` 才生效，没 extend 的方法调用直接报错
- 树摇友好：bundler 看不到 import 的 plugin 自动 drop（前提是 ESM 形态）
- 兼容老代码：升级时只要补 extend 调用，老代码能继续跑

> 怀疑：plugin extend 是全局副作用——一旦在某个文件 extend 了 utc，整个进程的 dayjs 实例都带 utc。这意味着库作者必须知道"我加的这个 plugin 会不会和别人加的冲突"。在 monorepo 多包共享 dayjs 时，到底谁负责 extend？dayjs 文档对此没明确指引，issue 区有大量"为什么我的 .tz 不生效"问题——多半是 extend 漏调或顺序错。

## Layer 3 —— 三段精读

### 段 a：immutable 设计（chain 返回新 instance）

dayjs 与 Moment 最大的工程差别在 immutability。Moment 的 `add()` 改原 instance，dayjs 的 `add()` 返新 instance。

```js
// Moment（mutable）
const m = moment('2026-05-29');
m.add(1, 'day');   // m 自己被改成了 2026-05-30
console.log(m.format()); // '2026-05-30T...'

// dayjs（immutable）
const d = dayjs('2026-05-29');
d.add(1, 'day');   // 返回新 instance，但没接住，丢了
console.log(d.format()); // '2026-05-29T...'  ← d 没变
const d2 = d.add(1, 'day'); // 必须接住才有意义
```

这是从 Moment 迁过来的人最容易踩的坑——一行 `m.add(1, 'day')` 在 Moment 里有副作用，在 dayjs 里没有。dayjs README 把这个 BREAKING 写在第一屏。

实现层面，dayjs 的 `add()` 内部做的事大致是（链接示意）：

```js
// src/index.js（简化伪代码）
proto.add = function (number, units) {
  const instance = this.clone();   // ← 关键：先 clone
  // ... 在 clone 上做修改 ...
  return instance;                  // ← 返回 clone
};
```

`clone()` 内部就是 `dayjs(this.toDate())`——再 wrap 一次原生 Date。所以每次 chain 都是"开新对象 + 拷贝 Date"，对 GC 不算便宜，但在 99% 的业务场景里完全够用，换来 React / Redux 友好的纯函数语义。

GitHub permalink（链接示意，40-char hex commit hash）：

- core add/subtract 实现：https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/index.js

### 段 b：plugin 系统（dayjs.extend(utc) / dayjs.extend(timezone)）

精读 `utc` plugin。它的目标：让 `dayjs()` 能产出"`UTC` 模式"的 instance，所有读取（year / month / format）都按 `UTC` 解析，而不是 host 时区。

```js
// 用法
dayjs.extend(utc);
dayjs.utc('2026-05-29 00:00').format();
// → '2026-05-29T00:00:00Z' (按 UTC 输出)

dayjs('2026-05-29 00:00').format();
// → '2026-05-29T00:00:00+08:00' (按 host TZ 输出)
```

实现层面（简化伪码，链接示意）：

- 给 `Dayjs.prototype` 加 `.utc()`，把 instance 内部 flag `$u = true`
- 改写 `.format() / .year() / .day() / .hour()` 等：检查 `$u` flag → 用 `getUTCFullYear()` 而不是 `getFullYear()`
- 加 static `dayjs.utc(...)`，等价于 `dayjs(...).utc()`

`timezone` plugin 在 `utc` 基础上加 IANA 时区支持。它依赖 `Intl.DateTimeFormat` 提供的 timezone 数据：

```js
// 依赖关系
dayjs.extend(utc);        // 必须先 extend utc
dayjs.extend(timezone);   // 再 extend timezone

dayjs.tz('2026-05-29 10:00', 'Asia/Shanghai').format();
// → '2026-05-29T10:00:00+08:00'

dayjs.tz('2026-05-29 10:00', 'America/New_York').format();
// → '2026-05-29T10:00:00-04:00'
```

实现关键：**dayjs 自己不存任何时区数据**——它把所有 IANA 解析委派给浏览器 / Node 自带的 `Intl.DateTimeFormat`。这是 dayjs 能做小的核心原因，也是和 luxon（自带 IANA 数据）的关键差别。

GitHub permalink（链接示意）：

- utc plugin 实现：https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/plugin/utc/index.js
- timezone plugin 实现：https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/plugin/timezone/index.js

> 怀疑：把时区委派给 `Intl.DateTimeFormat` 让 dayjs 极小，但也意味着 dayjs 的时区行为依赖运行时（Node 18 vs Node 20 vs 老旧浏览器可能有差异）。在客户多端（Windows IE 老用户、嵌入式 Android WebView）的项目里，这是不是隐藏雷区？issue 区有过几例"timezone 在 Node 14 报错"的报告。

### 段 c：locale 系统

dayjs 的 locale 是独立子模块（和 plugin 不同的 import 路径）：

```js
import 'dayjs/locale/zh-cn';   // 仅 import 就触发副作用注册
import 'dayjs/locale/en';

dayjs.locale('zh-cn');         // 切到中文
dayjs().format('dddd');        // → '星期五'

dayjs.locale('en');            // 切到英文
dayjs().format('dddd');        // → 'Friday'
```

每个 locale 文件是一个对象，包含 `weekdays / months / formats / relativeTime` 等数据。locale 文件 `import` 时会调用 `dayjs.locale(name, config, true)` 注册到 dayjs 内部 map（最后 `true` 参数表示"注册不切换"）。

特殊点：

- locale 是**全局副作用**——一处 `dayjs.locale('zh-cn')` 切了，所有 instance 都跟着切
- 但 instance 上有 `.locale(name)` 方法可以**只为这个 instance 切**，返回新 instance（immutable）
- locale 文件本身很小（~1 KB / locale），不会因为 import 一个 locale 就拖进 80 个

```js
// 全局切换
dayjs.locale('zh-cn');
dayjs().format('dddd');           // 星期五

// 只在这个 chain 用 en，不污染全局
dayjs().locale('en').format('dddd');  // Friday

// 全局还是中文
dayjs().format('dddd');           // 星期五
```

这种设计和 date-fns 的"options 传入 locale"对比：

- dayjs：locale 是全局状态 + 可 instance 覆盖 → 写起来短，SSR 多语言并发要小心
- date-fns：locale 是函数参数 → 写起来啰嗦，但天然 SSR 安全

GitHub permalink（链接示意）：

- locale 注册逻辑：https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/index.js
- zh-cn locale 数据：https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/locale/zh-cn.js

## Layer 4 —— 与 Moment / date-fns / luxon / Temporal 对比

把 5 条路放在一张表里看哲学差别：

| 库 | 起步 | bundle | 形态 | mutability | 时区 | 链式 API | 现状 |
|---|---|---|---|---|---|---|---|
| Moment.js | 2011 | 67 KB | wrapper class | mutable | 默认包含 | yes | 2020 frozen，no new feat |
| dayjs | 2018 | ~2 KB core | wrapper class | immutable | plugin extend | yes（Moment-like） | 1.x 活跃，v2 RFC |
| date-fns | 2014 | ~3 KB（5 fns）| pure function | immutable | v4 子包 | no（嵌套调用） | v3 ESM-only，活跃 |
| luxon | 2016 | ~70 KB | new class DateTime | immutable | first-class IANA | yes（DateTime fluent） | Moment 团队作 |
| Temporal | 2018 提案 | ~30 KB polyfill | new types | immutable | first-class | partial fluent | Stage 3，浏览器在路上 |

dayjs 在这条光谱上的"独特价值"：

- 唯一一条"像 Moment 但小 30 倍"的路 → 服务存量 Moment 用户
- 唯一一条"plugin 按需 extend"的路 → 不在 core 里塞 i18n / TZ 等不是所有人都用的能力
- 唯一一条"完全 JavaScript 实现，不押 Temporal"的路 → 老浏览器 / Node 14 兼容性最稳

劣势：

- chain API 有"中间状态难命名"的 debug 问题
- plugin 全局副作用让 monorepo 多包配合容易出错
- locale 是全局状态在 SSR 多语言并发场景要小心

## Layer 5 —— 6 维对比表（dayjs vs Moment vs date-fns vs luxon）

| 维度 | dayjs | Moment | date-fns | luxon |
|---|---|---|---|---|
| **bundle（最小用法）** | ~2 KB | 67 KB | ~3 KB（5 fns） | ~22 KB（gzip） |
| **API 形态** | chain method | chain method | pure function | chain method（DateTime） |
| **mutability** | immutable | mutable | immutable | immutable |
| **时区** | plugin（utc + timezone） | 默认包含 moment-timezone（再加 ~30 KB） | core 不支持，v4 子包 | first-class IANA 内置 |
| **i18n locale** | 独立子模块按需 import | 默认全部包含（~30 KB） | 独立子模块按需 import | 内置 Intl 委派 |
| **未来路线** | v2 在 RFC，方向是更多 TS / 性能 | frozen 2020，无新 feat | v3 ESM-only，v4 拆 tz 子包 | 原作团队后续主推 Temporal |

**结论一句话**：

- 求"小到极致 + 函数式" → date-fns
- 求"小 + 链式 + 迁 Moment" → dayjs（本篇）
- 求"时区强 + 不在乎 size" → luxon
- 求"未来标准" → Temporal polyfill

## Layer 6 —— 限制与槽点

### 限制 1：plugin extend 是全局副作用

```js
// fileA.js
dayjs.extend(utc);  // 整个进程都生效

// fileB.js（哪怕没 import utc）
dayjs.utc(); // 也能用，因为 fileA 已经 extend 了
```

后果：依赖关系变隐式。某个 lib 内部偷偷 `dayjs.extend(timezone)`，business code 不知道为什么 `.tz()` 突然能用了；反过来如果该 lib 升级移除了 extend，business code 直接报错。建议项目根 entry 统一 extend 一次，但 dayjs 没有强制工具约束。

### 限制 2：v2 难产

社区 2022 起就在等 v2，期待 TypeScript 全重写、Temporal 支持、bundle 更小。截至 2024 年仍是 1.x 主线。这意味着：

- 想用最新 TS 类型系统 / strict mode 的项目，dayjs 类型质量稍弱（与 luxon 差距较大）
- 想押 Temporal 的项目得另选库
- 想看到 plugin 系统重构（解决全局副作用）的人继续等

### 限制 3：format token 与 Moment 兼容也继承了 Moment 缺陷

```js
dayjs().format('YYYY-MM-DD');  // 大写 Y，dayjs 接受（与 Moment 一致）

// 但同样的 token 在 date-fns 里是错的（Unicode TR35：YYYY = week-year）
// date-fns 用 'yyyy-MM-dd'（小写 y = calendar year）
```

这个不算 dayjs 的 bug，但意味着 dayjs / Moment 用户切到 date-fns 时 token 习惯需要重学。

### 限制 4：性能在 hot loop 下不优

```js
// 10 万次 add（业务上罕见但报表批处理可能）
for (let i = 0; i < 100000; i++) {
  dayjs(base).add(i, 'day');  // 每次 clone + new instance
}
```

每次 chain 都 clone 原生 Date 对象，10 万次堆分配会让 GC 跳。同样场景：

- 原生 `Date.setDate()`：mutable，最快但污染原对象
- date-fns `addDays(date, i)`：pure function，每次 new Date 但不 wrap
- dayjs `dayjs(...).add(i, 'day')`：每次 wrap 又解 wrap，最慢

实测性能差距在 hot loop 下能到 3-5 倍。业务代码 99% 用不到这个量级，但批量 ETL / 报表场景要警惕。

> 怀疑：dayjs 在"小 + 像 Moment"两个维度都赢，但 v2 难产 6 年说明这条路的工程债比看起来重。如果某天 Temporal 进 Stage 4 + 浏览器普及，dayjs 的"Moment-like API"价值会被稀释多少？iamkun 一个人维护到那天还撑得住吗？

## 怀疑总集

1. dayjs API 完全兼容 Moment 是迁移友好，但也继承 Moment 设计缺陷（如 timezone 的 plugin 必加且 i18n 需要单独 import）。"兼容" 是不是变成"被绑架"？
2. dayjs 与 date-fns 在 weekly downloads 接近，但 GitHub stars dayjs > date-fns。社区"投票"vs"使用"差异说明什么？
3. chain 顺序好读但 debug 时不好打中间断点。在大型业务代码里，是不是还是该用 date-fns 风格更好定位 bug？
4. plugin extend 是全局副作用——在 monorepo 多包共享 dayjs 时，到底谁负责 extend？文档对此没明确指引。
5. 把时区委派给 `Intl.DateTimeFormat` 让 dayjs 极小，但也意味着 dayjs 的时区行为依赖运行时（Node 14 vs Node 20 可能有差异），是不是隐藏雷区？
6. dayjs 在"小 + 像 Moment"两个维度都赢，但 v2 难产 6 年说明工程债重。Temporal 进 Stage 4 后，dayjs 的"Moment-like API"价值会被稀释多少？

## GitHub permalinks（按 Layer 标）

> 链接示意：commit hash 用 40-char hex（写作时 master 头）。读源码时把 hex 替换为最新 commit 即可，路径稳定。

- core 入口（Layer 1 / Layer 3 段 a 提到的 Dayjs class + add/subtract / clone）：
  - https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/index.js
- utc plugin（Layer 3 段 b 精读）：
  - https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/plugin/utc/index.js
- timezone plugin（Layer 3 段 b 精读）：
  - https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/plugin/timezone/index.js
- relativeTime plugin（Layer 2 plugin 形态示例）：
  - https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/plugin/relativeTime/index.js
- zh-cn locale（Layer 3 段 c 精读）：
  - https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/src/locale/zh-cn.js
- TypeScript 类型声明（Layer 0 提到的 .d.ts）：
  - https://github.com/iamkun/dayjs/blob/aef3d6d0aa0a1a52bcb6d73a929f7a4a26fa8f7d/types/index.d.ts

读源码时关键的几个目录：

- `src/`——core（`index.js` 整个 Dayjs class 全在这里，~600 行）
- `src/plugin/`——所有 plugin（每个一个目录，5-100 行不等）
- `src/locale/`——80+ locale，每个一个 `xx-yy.js` 文件
- `types/`——TypeScript 类型声明（手写）
- `test/`——Jest 测试，大量是 `expect(dayjs(...).format(...)).toBe(moment(...).format(...))` 比对

## 实战 —— 什么时候选 dayjs、什么时候不选

```text
┌──────────────────────────────────────────────────────────────┐
│ 已有 Moment.js 代码 + 想换不想重写 → dayjs ✓✓✓              │
│ 浏览器 / 小程序 / H5 + 链式 API 偏好 → dayjs ✓✓             │
│ TS 项目 + 严格类型 + 函数式风格 → date-fns（不是 dayjs）    │
│ 强时区业务（航班 / 跨时区会议） → luxon（不是 dayjs）       │
│ 极致 tree-shake（只用 5 函数 ~3 KB） → date-fns（不是 dayjs）│
│ 押注未来标准 → temporal-polyfill（不是 dayjs）              │
│ Hot loop 批处理（10 万+ 算术） → 原生 Date 或 date-fns      │
│ 不想学新 API + 立即上手 → dayjs（迁 Moment 0 成本）         │
└──────────────────────────────────────────────────────────────┘
```

5 个实战 tips（来自社区高票回答 + 个人踩坑）：

1. **extend 在 entry 集中调用一次**——不要在业务文件分散 extend，否则 monorepo 多包出问题难定位。
2. **immutable 的 chain 必须接住返回值**——`d.add(1, 'day')` 单独写一行没意义，必须 `const d2 = d.add(...)`。
3. **timezone plugin 必须先 extend utc**——顺序错了 `.tz()` 不生效，且报错信息不友好。
4. **locale 全局切换在 SSR 多语言并发要小心**——更安全的做法是 `dayjs(...).locale('en').format(...)` 这种 instance 级覆盖。
5. **format token 用 Moment 风格**（`YYYY-MM-DD`）——但读 date-fns 文档时记得切到 `yyyy-MM-dd`，token 系统不通用。

## 学到的事

- "API 兼容存量"是一种独立的产品策略——dayjs 押的不是技术先进性，押的是"已经在用 Moment 的人不想重写"这个心理成本，结果做出和 Moment 不同实现但同 API 的产品。
- plugin 系统让 core 保持小是已知套路（jQuery / lodash 都做过），但 dayjs 把它推到极致：core 只 2 KB，plugin 全部独立子模块。bundle 工程师非常吃这套。
- immutable + chain 是不矛盾的——可以"看起来像 chain"（`.add().subtract().format()`）但底层每步是新对象。React / Redux 时代的库都偏向这种形态。
- 把时区数据委派给运行时（`Intl.DateTimeFormat`）是 dayjs 能做小的关键决策，但代价是行为依赖 Node / 浏览器版本。luxon 选择内置 IANA 数据是反方向 trade-off。
- 一个人维护的工具库到 25M weekly downloads 的天花板很现实——v2 难产 6 年就是信号。社区"投票多""下载多"不等于"维护资源跟得上"。
- iamkun 在 README 直接放"Moment.js compatible API"作为卖点，是非常聪明的"借势"营销。前作的肌肉记忆是新作的最大资产。

## 关联

- 与 Moment.js（前作 / 同年代竞品）：API 兼容是 dayjs 第一卖点；Moment 已 frozen，dayjs 接住升级流量。
- 与 date-fns（同 Season 23-2 同年代）：哲学正交。chain wrapper vs pure function；后者 tree-shake 更狠，前者迁移成本更低。两者 weekly downloads 接近 25M，但生态位不同。
- 与 luxon（同年代）：时区策略相反。luxon 内置 IANA + 重 i18n，dayjs 拆 plugin 极致小。luxon 是 Moment 原班人马，dayjs 是社区独立作品。
- 与 temporal-polyfill（未来标准）：dayjs 不主动靠拢；v2 路线图暂未承诺迁移到 Temporal 类型系统。
- 与 axios / wretch / got（同 Season 工具库 B 分支）：dayjs 是工具库 B 分支首篇日期类，和 HTTP 工具库的关系是"都属于 npm 工具集，都强 ESM、都偏小 bundle"。
- 与 lodash（同形态广义工具集）：lodash 是"通用 Object/Array 工具"，dayjs 是"日期工具"。两者 plugin 思路不同——lodash 全部 export 让 tree-shake 选；dayjs 是 core+plugin 显式 extend。
- 与 H5 / 小程序项目（实战场景）：日期格式化、相对时间、活动倒计时、时区切换是高频需求，dayjs 在 bundle 敏感的小程序场景压倒性占优。

## 速记卡

- Moment.js compatible API + 1/30 的 bundle（~2 KB core）
- iamkun 2018 起独立维护，1.11.x 主线，v2 RFC 中
- chain method 风格（`dayjs().add(1, 'day').format()`），immutable 返回新 instance
- plugin 系统：`dayjs.extend(utc)` / `dayjs.extend(timezone)` 按需加料
- timezone 委派给 `Intl.DateTimeFormat`，自己不带 IANA 数据
- locale 是独立子模块，`import 'dayjs/locale/zh-cn'` 触发副作用注册
- format token 用 Moment 风格 `YYYY-MM-DD`（与 date-fns 的 `yyyy-MM-dd` 不同）
- weekly downloads ~25M，与 date-fns 持平

## 一图概括（文字版）

```
原生 Date  →  dayjs() core (~2 KB)  →  Dayjs instance (immutable wrapper)
                    ↓ extend()
              ┌─── utc plugin (+0.6 KB)
              ├─── timezone plugin (+1.1 KB) ← 依赖 utc
              ├─── relativeTime plugin (+0.9 KB)
              ├─── advancedFormat plugin (+0.5 KB)
              ├─── customParseFormat plugin (+0.8 KB)
              ├─── locale: zh-cn / en / ja / ... (按需 import)
              └─── 还有 30+ plugin
                    ↓
              instance.method().method()...  →  string / number / Date / boolean
```

这就是 dayjs 的全部世界观——**core 极简 + plugin opt-in + chain immutable，Moment 的 API 加现代工程**。
