---
title: pretty-ms — 把毫秒拆成可读的多单位时长
description: 绑定 sindresorhus/pretty-ms 9.3.0：把 number 或 bigint 毫秒格式化成多单位人类可读字符串。
来源: https://github.com/sindresorhus/pretty-ms
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/pretty-ms
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ab52d6aec3aea644a4f07ddab2928e2f39dd9941
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.3.0
---

## 是什么

`pretty-ms` 是一个单向格式化器：把 `number` 或 `bigint` 毫秒变成人类可读时长。日常类比：它像把总秒数拆成「时:分:秒」的计时牌——默认同时亮多个格子，而不是只保留最大的那一格。

你写：

```js
import prettyMilliseconds from "pretty-ms";

prettyMilliseconds(1337000000);
// "15d 11h 23m 20s"

prettyMilliseconds(1337);
// "1.3s"
```

固定 9.3.0 是 ESM-only：`type: module`，`engines.node >= 18`，运行时依赖 `parse-ms ^4.0.0`。它不解析 `"2 days"` 这种字符串。

## 为什么重要

不理解选项互相覆盖的顺序，就解释不了下面几件事：

- 为什么默认 `1337` 是 `"1.3s"`，而 `compact: true` 变成 `"1s"`
- 为什么 `colonNotation: true` 时 `1s` 会变成 `"0:01"`，并且 compact / verbose 失效
- 为什么一年按 365 天整除，和 [[ms]] 的 365.25 天对不上
- 为什么调用方传入的 options 对象事后还是原样

## 核心要点

主链可以拆成五步：

1. **先验类型**：不是 bigint 且 `!Number.isFinite(milliseconds)` 就抛 `TypeError`。负数先记 `sign`，再取相反数；不能用 `Math.abs`，因为要兼容 bigint。

2. **选项先拷贝再改写**：`options = { ...options }`。`colonNotation` 会把 compact / formatSubMilliseconds / separateMilliseconds / verbose 全部关掉。`compact` 再把 `unitCount` 钉成 1，小数位钉成 0。

3. **拆单位**：`parse-ms` 给出 days/hours/minutes/seconds/milliseconds/microseconds/nanoseconds。年是 `days / 365n`，剩余天是 `days % 365n`。这是 365 天年，不是儒略年。

4. **按开关折叠**：`hideYear` 把年并回天数；`hideYearAndDays` 再并进小时；`hideSeconds` 直接丢掉秒及以下。零值默认跳过，但冒号记法里的分钟即使是 0 也要占位。

5. **拼字符串**：普通模式用空格连接 `15d 11h`；冒号记法用 `:`，并且至少显示到分钟。`unitCount` 在最后 `slice`。如果什么都没装进结果，返回 `"0ms"` 或 `"0 milliseconds"`。

## 实践示例

### 案例 1：默认多单位

```js
prettyMilliseconds(1000 * 67);            // "1m 7s"
prettyMilliseconds(1000 * 60 * 60 * 40);  // "1d 16h"
prettyMilliseconds(1000 * 60 * 60 * 24 * 465);
// "1y 100d"
```

`465` 天按 `365n` 整除得到 `1y 100d`。同一毫秒如果交给 [[ms]] 的格式化，只会得到一个 round 过的 `d`。

### 案例 2：compact、verbose 和冒号

```js
prettyMilliseconds(1337, { compact: true });
// "1s"

prettyMilliseconds(1335669000, { verbose: true });
// "15 days 11 hours 1 minute 9 seconds"

prettyMilliseconds(95500, { colonNotation: true });
// "1:35.5"

prettyMilliseconds(1000, { colonNotation: true });
// "0:01"
```

冒号记法会强制至少显示分钟，所以 1 秒不是 `"1s"`。测试还证明：即使同时传入 `compact` / `verbose`，只要 `colonNotation: true`，仍走冒号输出。

### 案例 3：子秒和折叠

```js
prettyMilliseconds(100.400080, { formatSubMilliseconds: true });
// "100ms 400µs 80ns"

prettyMilliseconds(900, { subSecondsAsDecimals: true });
// "0.9s"

prettyMilliseconds(1000 * 60 * 67 * 24 * 465, { hideYear: true });
// "519d 6h"
```

`formatSubMilliseconds` 和 `separateMilliseconds` 会打断「秒带小数」这条默认路径。`subSecondsAsDecimals` 只影响不到 1 秒的值；`0` 仍回落到 `"0ms"`。

## 踩过的坑

1. **它不解析字符串**：`prettyMilliseconds("2 days")` 抛 `TypeError`。解析方向看 [[ms]]。

2. **年合同不同**：这里 `1y` 是 365 天。[[ms]] 的 `"1y"` 是 365.25 天。不要拿两边的年互相换算当恒等。

3. **`colonNotation` 会吞掉其他展示开关**：想要 verbose 单词或 µs/ns，不要同时开冒号记法。

4. **`compact` 压过 `unitCount`**：源码先把 `unitCount` 写成 1，后面再 `slice` 也截不到更多单位。

5. **bigint 和 number 的极大值输出不同**：测试里 `Number.MAX_VALUE` 与 `BigInt(Number.MAX_VALUE)` 的年数对不上；本文不把任一侧当成「正确年数」。

## 适用 vs 不适用场景

**适用**：

- CLI / 日志 / 进度条需要 `1h 7m` 这样的多单位文本
- 要用冒号记法或隐藏年/天/秒来稳定列宽
- 已经在 ESM、Node 18+ 环境，能接受 `parse-ms` 依赖

**不适用**：

- 要把 `"30s"` 配值解析成毫秒 → [[ms]]
- 需要日历年、闰年或时区感知的 Duration
- 不能引入 ESM / Node 18 下限

## 固定版本边界

- 本文绑定 `sindresorhus/pretty-ms@ab52d6ae...`，tag `v9.3.0` 与 npm `pretty-ms@9.3.0` 的 `gitHead` 为同一提交。
- `exports` 指向 `index.js` + `index.d.ts`。许可 MIT。`engines.node >= 18`。
- 默认分支在 tag 之后还有 `93666b38...`（补充 rounding FAQ），未绑进本页。
- 未安装 `parse-ms`，未运行 `xo && ava && tsd`，状态保持 `UNVERIFIED`。

## 学到什么

1. **单向格式化和双向换算不是同一个 API**——pretty-ms 不回收字符串。
2. **选项有覆盖层级**——colonNotation 和 compact 会改写后续开关。
3. **年的定义必须写进合同**——365 天整除和 365.25 天不能混用。
4. **拷贝 options 是可观察行为**——测试断言调用方对象不被突变。

## 应用型自测

1. `prettyMilliseconds(1000, { colonNotation: true })` 是 `"1s"` 还是 `"0:01"`？
2. `compact: true` 时再传 `unitCount: 3`，会显示三个单位吗？
3. `465` 个整天在 pretty-ms 里是几年几天？同一数字交给 `ms` 的格式化会怎样？

检查点：

1. `"0:01"`。冒号记法至少显示到分钟。
2. 不会。`compact` 先把 `unitCount` 钉成 1。
3. pretty-ms 是 `1y 100d`。`ms` 格式化只输出一个 round 过的 `d`，且年按 365.25 天，不会走出 `y`。

## 延伸阅读

- 固定源码：[sindresorhus/pretty-ms](https://github.com/sindresorhus/pretty-ms) —— 本文绑定提交 `ab52d6aec3aea644a4f07ddab2928e2f39dd9941`
- 对照入口：`index.js` 的选项改写、`add()`、年/天折叠与冒号补零
- 依赖：[parse-ms](https://github.com/sindresorhus/parse-ms) —— 把毫秒拆成单位对象；本轮未单独审查
- [[ms]] —— 字符串 ↔ 毫秒的双向单单位换算

## 关联

- [[ms]] —— 同主题的另一半：能解析，也能输出单单位

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ms]] —— ms — 把 "2 days" 和毫秒当成同一种值
