---
title: ULID — 时间在前、Crockford Base32 编码的可排序 128-bit ID
description: 固定 3.0.2 把 48-bit 时间戳和 80-bit 随机段编成 26 个 Crockford 字符，并提供单调工厂
来源: https://github.com/ulid/javascript
日期: 2026-08-27
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ulid/javascript
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 11c2067821ee19e4dc787ca4e0125a025485edc6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.2
---

## 是什么

ULID（Universally Unique Lexicographically Sortable Identifier）是一份 **26 字符、128-bit、按字典序可排** 的 ID。前 10 位是毫秒时间，后 16 位是随机段，字符集是 Crockford Base32：`0123456789ABCDEFGHJKMNPQRSTVWXYZ`（没有 I、L、O、U）。日常类比：快递单号左边印日期，右边印随机校验——按单号排序约等于按揽件时间排序，但别人仍能读出「哪一天出的单」。

固定包名是 `ulid@3.0.2`。v3 起是命名导出，不再是默认函数：

```ts
import { ulid } from "ulid"

ulid() // 01ARZ3NDEKTSV4RRFFQ69G5FAV
```

同一提交还导出 `monotonicFactory`、`decodeTime` / `encodeTime`、`isValid`、`ulidToUUID` / `uuidToULID` 和 `fixULIDBase32`。

## 为什么重要

不读固定源码，容易把 ULID 当成「UUID 的短别名」或「永远单调的雪花 ID」：

- 为什么普通 `ulid()` **不保证**同一毫秒内后写的更大——随机段各自抽样
- 为什么 `ulid(0)` 不会编码时间 0——`!seedTime` 会改走 `Date.now()`
- 为什么单调工厂在时间回拨时仍递增随机段，而不是跟着种子往回走
- 为什么浏览器包能跑：rollup 把 `node:crypto` 换成 `stub.js`，真正随机来自 `globalThis.crypto`

一句话：ULID 的合同是 **时间头可见 + 可选单调**，和 [[cuid2]] 把时间藏进哈希正好相反。

## 核心要点

固定 3.0.2 可以看成四条链：

1. **编码**：`encodeTime(now)` 把整数毫秒按 32 进制写成 10 位；`now` 必须是 `0..2^48-1` 的整数，否则抛 `ULIDError`。随机段 `encodeRandom(16, prng)` 每次抽一个 Crockford 字符。
2. **生成**：`ulid(seedTime?, prng?)` 在 `!seedTime || isNaN(seedTime)` 时用 `Date.now()`，再拼 10+16。默认 PRNG 要 `getRandomValues` 或 `randomBytes`；找不到就抛 `PRNG_DETECT`，**没有** `Math.random` 回退。
3. **单调**：`monotonicFactory(prng?)` 记住 `lastTime` 和 `lastRandom`。`seed <= lastTime` 时对随机段做 `incrementBase32`，时间头仍用 `lastTime`。随机段全是 `Z` 再递增会抛 `B32_ENC_INVALID`。
4. **互转**：`ulidToUUID` / `uuidToULID` 用同一套 crockford 编解码；`isValid` 只检查长度 26 和字符集；`decodeTime` 另外拒绝时间大于 `TIME_MAX` 的串。

常量写死在 `source/constants.ts`：`TIME_LEN=10`、`RANDOM_LEN=16`、`MAX_ULID="7ZZZ…"`、`MIN_ULID="0000…"`。首字符只能是 `0-7`，因为 48-bit 时间装进 10 个 5-bit 符号时高位走不满。

## 实践示例

### 案例 1：种子时间只影响时间头

```ts
import { ulid, decodeTime, encodeTime } from "ulid"

const id = ulid(1469918176385)
decodeTime(id) // 1469918176385
encodeTime(1469918176385) // "01ARYZ6S41"
```

同一种子再调一次 `ulid`，时间头相同，随机段通常不同。测试把 `01ARYZ6S41TSV4RRFFQ69G5FAV` 解成上述毫秒。

### 案例 2：同一毫秒要靠单调工厂

```ts
import { monotonicFactory } from "ulid"

const next = monotonicFactory()
next(150000) // 随机段 +0
next(150000) // 最低位 +1
next(100000) // 时间回拨仍递增，不退回 100000 的时间头
```

工厂内部比较的是 `seed <= lastTime`。传入更早的种子，输出仍挂在旧时间头后面。

### 案例 3：UUID 互转与纠错

```ts
import { ulidToUUID, uuidToULID, fixULIDBase32, isValid } from "ulid"

ulidToUUID("01ARYZ6S41TSV4RRFFQ69G5FAV")
// "01563DF3-6481-D676-4C61-EFB99302BD5B"
fixULIDBase32("01ARYZ6S4ITS-V4RRFFQ69G5FAV") // i→1，去掉连字符
isValid("01ARYZ6S41TSV4RRFFQ69G5FA") // false，长度 25
```

CLI 不走普通 `ulid()`，而是 `monotonicFactory()`，只解析 `--count`。

## 踩过的坑

1. **把默认 `ulid()` 写成同一毫秒单调**：没有工厂就没有递增。同一毫秒两次调用可以乱序。
2. **传 `0` 当「Unix 纪元」**：`!seedTime` 为真，实际用的是现在。
3. **假设找不到 Web Crypto 会退回 `Math.random`**：固定版本直接抛 `PRNG_DETECT`。要不安全 RNG，必须自己把 PRNG 传进 `ulid` 或 `monotonicFactory`。
4. **把 `isValid` 当成「时间也合法」**：它不管 `TIME_MAX`；过大时间要靠 `decodeTime` 才爆。
5. **把 README 的 ops/sec 写成你机器上的数字**：`npm run bench` 本轮未跑。

## 适用 vs 不适用场景

**适用**：

- 希望 ID 本身按时间粗排、又能和 128-bit UUID 互转
- Node 18+ / 浏览器 / React Native，能接受 ESM+CJS 双入口
- 同一进程同一毫秒需要稳定先后时，愿意持有 `monotonicFactory()` 实例

**不适用**：

- 不能让客户端从 ID 读出创建时间——那是信息泄露，应看 [[cuid2]]
- 需要跨进程、跨主机的全局单调，却没有共享的 last-random 状态
- 把未验证的吞吐或「永远不碰撞」写成结论

## 固定版本边界

- 本文绑定 `ulid/javascript@11c20678...`，npm 包 `ulid@3.0.2`。
- annotated tag `v3.0.2` 与 npm `gitHead` 指向同一提交。
- 零 production 依赖；浏览器构建把 `node:crypto` alias 到 `source/stub.ts`。
- README 写 Node v18+；本文未跑上游 vitest / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **可排序来自时间头，不是随机段**——后 16 位默认各自独立。
2. **单调是工厂状态，不是 `ulid()` 的默认行为**。
3. **`0` 不是合法种子捷径**——布尔判断会把它丢掉。
4. **校验分两层**：`isValid` 看字形，`decodeTime` 看时间范围。

## 应用型自测

1. 连续两次 `ulid()` 且落在同一毫秒，第二次一定更大吗？
2. `ulid(0)` 的时间头是不是全 0？
3. 单调工厂在随机段已经是 `ZZZ…` 时再调用会怎样？

检查点：

1. 不一定。默认路径每次重抽 16 个字符。
2. 不是。`!seedTime` 为真，改用 `Date.now()`。
3. `incrementBase32` 找不到可进位的字符，抛 `ULIDError` / `B32_ENC_INVALID`。

## 延伸阅读

- 规范：[ulid/spec](https://github.com/ulid/spec)
- 固定源码：[ulid/javascript](https://github.com/ulid/javascript) —— 本文绑定提交 `11c2067821ee19e4dc787ca4e0125a025485edc6`
- [[cuid2]] —— 把时间哈希掉、强调不可猜测的对照路线

## 关联

- [[cuid2]] —— 同样避免数据库自增，但默认不泄露时间、也不提供单调工厂
- [[postgres-js]] —— 文本主键的常见落点；本页不审查索引热点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cuid2]] —— Cuid2 — 把时间、计数器和主机指纹哈希成不可猜的短 ID
