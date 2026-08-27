---
title: Day.js — 用 Moment 风格 API 包装原生 Date 的不可变日期库
来源: https://github.com/iamkun/dayjs
日期: 2026-08-27
分类: 工具库
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/iamkun/dayjs
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4549b8d03307891143e8a50d39fcdab1f16f77cf
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.11.23
---

## 是什么

Day.js 是一个包装原生 `Date` 的 JavaScript 日期库。日常类比：像给原生 Date 套一层会说话的外壳——方法名尽量跟 Moment 一样，但每次改时间都复印一张新卡，而不是在原卡上涂改。

```js
import dayjs from "dayjs";
dayjs("2026-05-30").add(1, "month").subtract(7, "day").format("YYYY-MM-DD");
```

`dayjs(...)` 返回 `Dayjs` 实例。核心只提供 parse、加减、比较、`format` 和 locale；时区、自定义解析、相对时间等要 `dayjs.extend(plugin)` 才挂到原型上。

## 为什么重要

不理解固定 1.11.23 的包装合同，下面这些事会对不上：

- 为什么 `d.add(1, "day")` 单独写一行看起来“没反应”
- 为什么 `dayjs("12-25-1995", "MM-DD-YYYY")` 在没装 `customParseFormat` 时并不按第二个参数解析
- 为什么 `.tz()` 文档总是先 `extend(utc)` 再 `extend(timezone)`
- 为什么同样叫 immutable，它和 date-fns 的形态完全不同：一边是 wrapper + 链式方法，一边是纯函数 + 原生 Date

## 核心要点

固定版本的执行链可以拆成五步：

1. **构造 wrapper**：`dayjs(date)` 若已是 Day.js 对象就 `clone()`；否则把 `date` 放进 config，`new Dayjs(cfg)`。识别靠 `instanceof` 或 `$isDayjsObject`。
2. **解析成内部 `Date`**：`null` → `Invalid Date`；`undefined` → 现在；已有 `Date` → 再拷一份。不以 `Z` 结尾的字符串先走 `REGEX_PARSE`，按本地字段组 `new Date(y, m, d, ...)`；其余交给 `new Date(date)`。
3. **缓存日历字段**：`init()` 把 `$y/$M/$D/$H/...` 从内部 `$d` 读出。装了 utc plugin 且 `$u === true` 时改读 UTC getter。
4. **公开变更先 clone**：`set` / `add` / `subtract` / `locale` 都先复制再改。内部 `$set` 会改当前实例，但默认路径不把它暴露给调用方。
5. **plugin 是进程级副作用**：`dayjs.extend(plugin)` 用 `plugin.$i` 保证同一函数只安装一次，随后改 `Dayjs.prototype` 或 `dayjs` 本身，对已有和未来实例都生效。

仓库 `package.json` 的 size-limit 把构建产物 `dayjs.min.js` 限制在 2.99 KB；这是仓库门槛，不是本页测过的 gzip 体积。

## 实践示例

### 案例 1：链式加减必须接住返回值

```js
const d = dayjs("2026-05-30");
const later = d.add(1, "month").subtract(7, "day");
d.format("YYYY-MM-DD");      // 2026-05-30
later.format("YYYY-MM-DD");  // 2026-06-23
```

`add` 对月/年走 `set`，对日/周按日历日推进，对时分秒按毫秒步进，最后都 `Utils.w(...)` 包成新实例。原对象的 `$d` 不变。

### 案例 2：自定义格式解析是 plugin，不是 core

```js
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
dayjs("12-25-1995", "MM-DD-YYYY").format("YYYY-MM-DD");
```

core 里第二个参数只有是 object 才会当 config；字符串 format 被丢掉，输入改走默认 `REGEX_PARSE` / `new Date`。装上 plugin 后，`args[1]` 才是 token 串，还可传 locale 与 strict。

### 案例 3：时区依赖 utc，并委派 `Intl`

```js
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
dayjs.extend(utc);
dayjs.extend(timezone);

dayjs.tz("2026-05-30 10:00", "Asia/Shanghai");
dayjs.tz.guess(); // Intl.DateTimeFormat().resolvedOptions().timeZone
```

`timezone` 用 `Intl.DateTimeFormat#formatToParts` 算偏移，内部调用 `dayjs.utc`。先 extend utc，否则 `d.utc` 不存在。库本身不带 IANA 数据包，行为随运行时 ICU 变化。

## 踩过的坑

1. **丢掉 chain 返回值**：`d.add(1, "day")` 不改 `d`。这是相对 Moment mutable API 最常见的迁移错误。
2. **以为第二参数永远是 format**：没装 `customParseFormat` 时它只是被忽略的非 object。
3. **timezone 不先装 utc**：plugin 源码用 `d.utc(...)` 算墙钟偏移，顺序反了会在运行时炸掉。
4. **plugin / locale / `tz.setDefault` 都是全局的**：一处 `extend` 影响整个进程；`parseLocale` 默认还会改模块级当前 locale。
5. **format token 是 Moment 风格 `YYYY-MM-DD`**：和 date-fns 的 Unicode `yyyy-MM-dd` 不是同一套。

## 适用 vs 不适用场景

**适用**：

- 已有 Moment 链式写法，想尽量少改方法名
- 只要加减、格式化、比较，少量 plugin 就够
- 能接受时区数据来自运行时 `Intl`，而不是库内打包

**不适用**：

- 只要按函数 tree-shake，不想要 wrapper 或全局 `extend`
- 需要把时区实例当 `Date` 子类传给其他库 → 看 [[date-fns]] 的 `TZDate` / `in` 上下文
- 还没装 utc 就想用 IANA 时区
- 要把静态阅读升级成已测 bundle 或跨引擎时区结论

## 固定版本边界

- 本文绑定 `iamkun/dayjs@4549b8d03307891143e8a50d39fcdab1f16f77cf`。GitHub tag `v1.11.23` 与 npm `dayjs@1.11.23` 的 `gitHead` 指向同一提交。
- 固定源码含 37 个 `src/plugin` 目录与 143 个 `src/locale` 文件；core 默认 locale 是 `en`。
- 未安装依赖、未跑上游 Jest / Sauce、未测 `dayjs.min.js` 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **API 兼容可以只换实现**：公开方法跟 Moment 像，底层却是 clone-then-mutate。
2. **极小 core 把能力推到 plugin**：解析格式和时区都不是默认合同。
3. **全局 extend 有安装顺序**：utc 是 timezone 的前置函数，不是文档口味。
4. **委派 `Intl` 换体积**：时区正确性跟着 Node/浏览器 ICU，不跟着这一个 npm 包。

## 应用型自测

1. `const d = dayjs("2026-05-30"); d.add(1, "day");` 之后 `d` 的日期变了吗？
2. 未 `extend(customParseFormat)` 时，`dayjs("12-25-1995", "MM-DD-YYYY")` 会按 `MM-DD-YYYY` 解析吗？
3. 只 `extend(timezone)`、不 `extend(utc)`，`dayjs.tz(...)` 在固定源码里能否完成偏移计算？

检查点：

1. 不会。`add` 返回新实例。
2. 不会。core 把非 object 的第二参数丢掉。
3. 不能指望。`timezone` 调用 `d.utc`。

## 延伸阅读

- 文档：[day.js.org](https://day.js.org/)
- 固定源码：[iamkun/dayjs](https://github.com/iamkun/dayjs) —— 本文绑定 `4549b8d03307891143e8a50d39fcdab1f16f77cf`
- [[date-fns]] —— 同主题的纯函数路线，format token 与时区扩展都不同
- [[luxon]] —— Moment 团队的另一条 immutable class 路线
- [[temporal-polyfill]] —— 未来标准，不经过 Day.js wrapper

## 关联

- [[date-fns]] —— 函数 + 原生 Date，对照 wrapper + chain
- [[luxon]] —— 时区/locale 同样借 `Intl`，但默认就是 class API
- [[temporal-polyfill]] —— 标准日期模型，不再模拟 Moment
- [[js-joda]] —— 强类型 civil time，不包装可变 `Date`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[js-joda]] —— js-joda — 把 Java 的 java.time 整套搬进 JS
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
