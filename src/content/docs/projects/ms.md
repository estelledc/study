---
title: ms — 把 "2 days" 和毫秒当成同一种值
description: 绑定 vercel/ms 2.1.3：字符串解析成毫秒，有限数字格式化成单单位时长。
来源: https://github.com/vercel/ms
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vercel/ms
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1c6264b795492e8fdecbc82cb8802fcfbfc08d26
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.3
---

## 是什么

`ms` 是一个双向毫秒换算函数：字符串解析成数字，有限数字格式化成带单位的字符串。日常类比：它像火车站的单一检票口——进站是 `"2 days"`，出站是 `172800000`；反过来把毫秒递进去，它只给你一张最大单位的票，不会拆成「1 天 2 小时」。

你写：

```js
const ms = require("ms");

ms("2 days");              // 172800000
ms("1.5h");                // 5400000
ms(60000);                 // "1m"
ms(60000, { long: true }); // "1 minute"
```

固定 2.1.3 只有一份 CJS `index.js`。没有 ESM export、没有 TypeScript 类型、`package.json` 也没有 `engines`。

## 为什么重要

不理解这个双向入口，就解释不了下面几件事：

- 为什么 `ms("2 days")` 能算，而 `ms("2 days 3 hours")` 得到 `undefined`
- 为什么格式化 `234234234` 变成 `"3d"`，而不是多单位字符串
- 为什么年按 365.25 天算，格式化却永远不会输出 `y` 或 `w`
- 为什么空字符串会抛错，非法单位却只是默默返回 `undefined`

## 核心要点

主链可以拆成四步：

1. **按类型分流**：`typeof val === 'string' && val.length > 0` 走 `parse()`；`typeof val === 'number' && isFinite(val)` 走格式化。其余一律抛 `Error`。

2. **解析只吃一段**：正则是「可选负号 + 数字 + 可选单位」。单位大小写不敏感，数字和单位之间允许多空格；没写单位就当 `ms`。字符串超过 100 个字符，或正则匹配失败，函数直接 `return`，得到 `undefined`。

3. **换算表**：`s=1000`，`m=s*60`，`h=m*60`，`d=h*24`，`w=d*7`，`y=d*365.25`。年用的是儒略年，不是 365 天整年。

4. **格式化只留一个单位**：短格式按天/时/分/秒/毫秒取第一个够大的档，`Math.round` 后拼 `d/h/m/s/ms`。`{ long: true }` 改成英文单词；`abs >= unit * 1.5` 才加复数 `s`。周和年只存在于解析侧。

## 实践示例

### 案例 1：配置超时和过期时间

```js
const ms = require("ms");

const timeout = ms("30s");     // 30000
const maxAge = ms("7 days");   // 604800000
const year = ms("1y");         // 31557600000  ← 365.25 * 86400000
```

`debug`、HTTP `max-age` 和各类 TTL 配置常把人类可读字符串交给这个函数。固定源码里没有对象输入，也没有 `"1h 30m"` 这种复合短语。

### 案例 2：把毫秒收成单单位

```js
ms(2 * 60000);                 // "2m"
ms(-3 * 60000);                // "-3m"
ms(234234234);                 // "3d"
ms(1200, { long: true });      // "1 second"
ms(10000, { long: true });     // "10 seconds"
```

`1200` 被 round 成 1 秒；`10000` 的绝对值大于 `1.5 * 1000`，long 格式才变成复数。负数保留符号，因为 `Math.round(-3)` 仍是 `-3`。

### 案例 3：非法输入分两条路

```js
ms("");          // throws
ms(undefined);   // throws
ms(Infinity);    // throws
ms("☃");         // undefined
ms("10-.5");     // undefined
ms("2 days 3h"); // undefined
```

空值和非有限数字走抛错；看起来像时长但正则吃不下的字符串走 `undefined`。测试把后者写成 `isNaN(ms(...)) === true`。

## 踩过的坑

1. **复合时长解析不了**：`"1h 30m"` 不是合法输入。要复合展示请看 [[pretty-ms]]。

2. **年不是 365 天**：`ms("1y") === 31557600000`。[[pretty-ms]] 把年当成 `days / 365n`，两套合同不能对拍。

3. **格式化没有周和年**：`ms(ms("3w"))` 会先变成毫秒，再按天 round，不会回到 `"3w"`。

4. **`undefined` 不是 `0`**：解析失败时继续做算术会得到 `NaN`，不会悄悄当 0 毫秒。

5. **2.1.3 不是当前主线**：npm `latest` 仍是 2.1.3，但仓里已有 3.x canary 和自报 4.0.0 的 ESM 线。本文不绑定那些 revision。

## 适用 vs 不适用场景

**适用**：

- 把配置里的 `"30s"` / `"2 days"` 收成毫秒
- 只需要一个大致单位的短展示，能接受 round
- 必须跑在没有 ESM 的旧 CJS 环境

**不适用**：

- 需要 `1h 7m` 或多单位可读输出 → [[pretty-ms]]
- 需要精确日历年、闰秒或时区
- 要把 3.x / 4.x 的 ESM API 当成 2.1.3 的合同

## 固定版本边界

- 本文绑定 `vercel/ms@1c6264b7...`，lightweight tag `2.1.3` 与 npm `ms@2.1.3` 的 `gitHead` 为同一提交。
- 发布物只有 `index.js`。许可 MIT。没有 `engines` 字段。
- 本轮看到但未绑定：`3.0.0-beta.2`、`3.0.0-canary.1`（`1304f150...`）以及 nightly `4.0.0-nightly.202508271359`。default branch 的 `package.json` 已是 ESM / `node >= 20`。
- 未运行 `mocha tests.js`，状态保持 `UNVERIFIED`。

## 学到什么

1. **双向函数要先看分流**——字符串和数字走的不是同一条错误合同。
2. **解析正则决定产品边界**——复合短语被拒绝，不是文档疏忽。
3. **格式化会丢掉单位**——周和年只进不出。
4. **latest 稳定版可以和主线分家**——绑定 2.1.3 必须同时披露 3/4 预发布线。

## 应用型自测

1. `ms("2 days 3 hours")` 会返回多少？
2. `ms(1200, { long: true })` 为什么是 `"1 second"` 而不是 `"1.2 seconds"`？
3. `ms("1y")` 和 365 个整天的毫秒相等吗？格式化会输出 `y` 吗？

检查点：

1. `undefined`。正则只吃一段数字加一个单位。
2. 短/长格式都 `Math.round` 到单一单位；1200 ms 够不上 1.5 秒，不加复数。
3. 不相等：年按 365.25 天。格式化最大单位是天，不会输出 `y`。

## 延伸阅读

- 固定源码：[vercel/ms](https://github.com/vercel/ms) —— 本文绑定提交 `1c6264b795492e8fdecbc82cb8802fcfbfc08d26`
- 对照入口：`index.js` 的 `parse` / `fmtShort` / `fmtLong` / `plural`
- [[pretty-ms]] —— 只做毫秒 → 多单位可读字符串

## 关联

- [[pretty-ms]] —— 同主题的另一半：单向、多单位、带选项

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[pretty-ms]] —— pretty-ms — 把毫秒拆成可读的多单位时长
