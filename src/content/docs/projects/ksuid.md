---
title: ksuid — 把秒级时间戳放进 20 字节、27 位 base62 的可排序 ID
description: 介绍 novemberborn/ksuid 3.0.0 如何用 4 字节纪元秒 + 16 字节 payload 组成可按字典序排序的 KSUID。
来源: https://github.com/novemberborn/ksuid
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/novemberborn/ksuid
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 90ca4c1508f216e03923de610291786a0d6a868c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.0
---

## 是什么

ksuid 是 Segment KSUID 规格的 Node.js 实现：每个 ID 先写时间，再写随机载荷，编码成固定长度的 base62。日常类比：快递单号左边是出库日期，右边是流水；按单号排序，大致就是按时间排序。

你写：

```js
const KSUID = require('ksuid');

const id = KSUID.randomSync();
id.string;   // 27 位
id.date;     // 时间戳对应的 Date
id.payload;  // 16 字节 Buffer
```

固定 3.0.0 把时间记成相对 `14e11` 毫秒纪元的 32 位大端秒数，后面再接 16 字节 payload，一共 20 字节。字符串形态固定 27 位，不足就左补 `0`。

## 为什么重要

不理解这 20 字节怎么切、字符串从哪来，就解释不了下面几件事：

- 为什么后生成的 ID 通常能按字符串直接比较
- 为什么 `toString()` 看起来不像那 27 位串
- 为什么 `fromParts` 拒收 `new Date(...)`，而 `randomSync` 却能吃 Date
- 为什么拿普通对象去 `compare` 会得到 0，而不是报错

## 核心要点

固定 3.0.0 的主链可以拆成五步：

1. **按时间取秒，再拼载荷**：`fromParts` 做 `floor((timeInMs - 14e11) / 1000)`，写入 4 字节 `UInt32BE`，再 `concat` 16 字节 payload。
2. **实例不暴露内部缓冲**：构造函数把 20 字节放进 `WeakMap`。`buffer` / `raw` / `payload` 的 getter 每次 `Buffer.from` 一份拷贝。
3. **两种随机入口**：`randomSync` 调 `crypto.randomBytes`；`random` 是它的 promisify 版。两者都把时间丢给 `Number(time)`，所以 `Date` 能用。
4. **字符串是 base62，不是 hex**：`base62.js` 用 `0123456789A-Za-z`，经 `base-convert-int-array` 在 256 与 62 之间换基；编码后 `padStart(27, '0')`。
5. **比较看字节，不看字符串**：`compare` 对内部缓冲做 `Buffer.compare`。对方不在 WeakMap 里时直接返回 0。

## 实践示例

### 案例 1：同步生成，读出时间和规范串

```js
const id = KSUID.randomSync(new Date('2014-05-25T16:53:20Z'));
id.timestamp; // 相对纪元的秒
id.date;      // 2014-05-25T16:53:20.000Z
id.string.length; // 27
```

`randomSync` 先 `Number(time)` 再 `fromParts`。`date` getter 是 `1000 * timestamp + 14e11`，把秒还原成毫秒 Date。

### 案例 2：自己提供昨天的时间和 16 字节载荷

```js
const crypto = require('crypto');
const yesterday = Date.now() - 86400 * 1000;
const id = KSUID.fromParts(yesterday, crypto.randomBytes(16));
```

这里的时间必须是整数毫秒，且落在 `2014-05-13T16:53:20Z` 到 `2150-06-19T23:21:35Z`。payload 必须恰好 16 字节 Buffer，否则抛同一条 `TypeError`。

### 案例 3：解析最大串，并和零值比较

```js
const zero = KSUID.parse('000000000000000000000000000');
const max = KSUID.parse(KSUID.MAX_STRING_ENCODED); // aWgEPTl1tmebfsQzFP4bxwgy80V
zero.compare(max); // -1
JSON.stringify(max); // 得到那 27 位，不是 "KSUID { ... }"
```

`parse` 要求长度恰好 27。解码不足 20 字节时会在前面补零。`toJSON()` 返回 `.string`，所以 `JSON.stringify` 能直接当主键用。

## 踩过的坑

1. **把 `id.toString()` 当成规范编码**：它走 `Symbol.toStringTag`，格式是 `KSUID { <27 位> }`。存库、比大小请用 `.string` 或 `toJSON()`。
2. **拿非 KSUID 去 `compare`**：找不到 WeakMap 记录就返回 0。普通对象、字符串、Buffer 都不会抛错，看起来像“相等”。
3. **把 Date 丢给 `fromParts`**：`fromParts` 要求 `Number.isInteger(timeInMs)`。Date 对象不是整数。要指定时间，用 `date.valueOf()`，或走 `random` / `randomSync`。
4. **改 `id.buffer` 以为能改实例**：getter 每次新拷贝。内部字节只活在 WeakMap 里。
5. **把 `package.json` 的 `engine` 当成 npm 引擎声明**：字段名是 `engine`，不是 `engines`。写着 `>=12 <13 || >=14 <15 || >=16`，安装器不一定会读到。

## 适用 vs 不适用场景

**适用**：

- 需要按创建时间近似排序的主键，并能接受 27 位 base62、无类型前缀
- 运行在 Node，能用 `crypto` 与 `Buffer`
- 时间落在 2014-05-13 到 2150-06-19 的秒级窗口

**不适用**：

- 要在 ID 里带 `user_` / `order_` 这类前缀，并和 UUIDv7 互转——看 [[typeid-js]]
- 浏览器或无 `Buffer` 的运行时——本实现直接 `require('crypto')` / `Buffer`
- 需要毫秒级时间戳或 UUID 标准形态——KSUID 的时间只精确到秒
- 不能接受 27 位、大小写混合、且解码不校验字母表的 base62

## 固定版本边界

- 本文绑定 `novemberborn/ksuid@90ca4c1508f216e03923de610291786a0d6a868c`，源码 tag `v3.0.0` 与 npm `ksuid@3.0.0` 的 `gitHead` 指向同一提交。
- 纪元常量是 `14e11`。最小串 `MIN_STRING_ENCODED` 为 27 个 `0`，最大串 `MAX_STRING_ENCODED` 为 `aWgEPTl1tmebfsQzFP4bxwgy80V`。
- 运行时依赖 `base-convert-int-array`；`files` 只发布 `index.js`、`index.d.ts`、`base62.js`。
- `base62.decode` 按 charCode 分段映射，不拒绝字母表外的字符。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **可排序来自“时间在前”**——4 字节大端秒数保证后写的 ID 二进制和字符串都更大，前提是时钟大致向前。
2. **规范串和调试串是两套合同**——`.string` / `toJSON()` 才是 27 位；`toString()` 给人看。
3. **比较 API 对非实例是静默的**——`compare` 返回 0 不代表相等，只代表“没法比”。
4. **随机入口和装配入口对时间的类型不一致**——`Number(time)` 能吞 Date；`fromParts` 只收整数毫秒。

## 应用型自测

1. `KSUID.randomSync().toString()` 的长度是 27 吗？
2. `KSUID.randomSync().compare({})` 会抛错还是返回 0？
3. `KSUID.fromParts(new Date(), payload)` 在 payload 合法时能成功吗？

检查点：

1. 不是。`toString()` 包了一层 `KSUID { … }`，规范 27 位在 `.string`。
2. 返回 0。对方不在 WeakMap 里就当作不可比。
3. 不能。`fromParts` 要求整数毫秒，Date 对象会触发时间窗口那条 `TypeError`。

## 延伸阅读

- 规格来源：[segmentio/ksuid](https://github.com/segmentio/ksuid)
- 固定源码：[novemberborn/ksuid](https://github.com/novemberborn/ksuid) —— 本文绑定提交 `90ca4c1508f216e03923de610291786a0d6a868c`
- [[typeid-js]] —— 同样强调可排序，但前缀 + UUIDv7 + Crockford base32

## 关联

- [[typeid-js]] —— 带类型前缀、UUIDv7 suffix 的对照实现
- [[date-fns]] —— 处理绝对时间；KSUID 只把秒级时间嵌进 ID
- [[lodash]] —— 通用工具；ksuid 只做这一件 ID 的事

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[typeid-js]] —— typeid-js — 用前缀 + UUIDv7 suffix 做出可排序、可辨类型的 ID
