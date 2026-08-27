---
title: Cuid2 — 把时间、计数器和主机指纹哈希成不可猜的短 ID
description: 固定 3.3.0 把时间、盐、会话计数器和主机指纹送进 SHA3-512，再切成默认 24 位的小写 base36
来源: https://github.com/paralleldrive/cuid2
日期: 2026-08-27
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/paralleldrive/cuid2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2275e80d1d36d36588a3b7a4929fb07b4b745fd0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.3.0
---

## 是什么

Cuid2 是一份 **ESM 的碰撞抵抗 ID 生成器**：每次调用把当前时间、随机盐、会话计数器和主机指纹拼在一起，用 SHA3-512 打散，再编成只含 `0-9a-z` 的短串。日常类比：厨房不按出餐顺序编号，而是把时钟、炉号、流水号和当日口令丢进搅拌机——端出来的号看不出谁先谁后，也不好猜下一份是什么。

固定包名是 `@paralleldrive/cuid2@3.3.0`。常见写法：

```js
import { createId } from "@paralleldrive/cuid2"

createId() // 默认 24 位，例如 tz4a98xxat96iws9zmbrgj3a
```

`createId` 不是每次 `new` 一套状态。源码里它是 `lazy(init)`：第一次调用才用默认 `random` / `counter` / `fingerprint` 构造生成器，之后复用同一份闭包。

## 为什么重要

不读固定源码，容易把 Cuid2 说成「更快的 UUID」或「可按时间排序的短 ID」：

- 为什么默认输出**不能**当创建时间排序键——时间进了哈希，表面上是随机串
- 为什么换机器、换 JS 全局对象，默认指纹会变，但相同容器镜像仍可能撞上同一组 `Object.keys`
- 为什么 `init({ length: 33 })` 立刻抛错，而 `length: 1` 不会
- 为什么 README 里的碰撞数字和「Trusted by Millions」不能直接写成你系统里的保证

一句话：Cuid2 的合同是 **多源熵 + SHA3 混合 + 固定长度**，不是 k-sortable 主键。

## 核心要点

固定 3.3.0 的主链可以拆成五步：

1. **取熵**：`Date.now().toString(36)`、长度为 `length` 的 base36 盐、`counter().toString(36)`、预先算好的 fingerprint。
2. **哈希**：`TextEncoder` 后走 `@noble/hashes` 的 `sha3_512`；字节用 `bignumber.js` 转成一个大正数，再 `.toString(36)`。`hash()` 会丢掉第一个字符，避免直方图左偏。
3. **成型**：再取一个随机小写字母当首字符，后面接 `hash(input).substring(1, length)`。总长等于 `length`。
4. **默认长度**：`getConstants()` 给出 `defaultLength=24`、`bigLength=32`。`init` 只在 `length > 32` 抛 `Length must be between 2 and 32`；源码没有对称的下限检查。
5. **校验**：`isCuid` 看是不是字符串、长度落在 2–32，并且匹配 `/^[a-z][0-9a-z]+$/`。大写、符号、空串都是 false。

默认 RNG 优先 `globalThis.crypto.getRandomValues`，把一个 `Uint32` 除以 `2^32` 得到 `[0, 1)`；没有 Web Crypto 时退回 `Math.random`。fingerprint 读 `typeof global !== "undefined" ? global : window` 的键名，再拼 32 位熵后哈希；空全局对象就只靠随机熵。

## 实践示例

### 案例 1：默认生成器是懒单例

```js
import { createId, isCuid, getConstants } from "@paralleldrive/cuid2"

const id = createId()
isCuid(id) // true
id.length === getConstants().defaultLength // 24
```

两次 `createId()` 共用同一份默认 `counter` 和 fingerprint。要隔离会话，应自己 `init()`。

### 案例 2：缩短或换指纹

```js
import { init } from "@paralleldrive/cuid2"

const slug = init({ length: 5 })
slug() // 5 位；碰撞空间按生日近似会小很多

const host = init({ fingerprint: "checkout-1", length: 24 })
host()
```

CLI `--slug` 就是 `init({ length: 5 })`；`--fingerprint` 把字符串原样传进 `init`。

### 案例 3：超长直接拒绝

```js
import { init } from "@paralleldrive/cuid2"

init({ length: 33 }) // throw：Received: 33
```

测试覆盖了 33 和 100。`error-causes` 写在 `package.json` dependencies 里，但 `src/index.js` 没有 import 它。

## 踩过的坑

1. **把输出当成时间序主键**：时间只在哈希输入里，排序应另建 `createdAt`。
2. **以为 `length < 2` 也会抛**：错误文案写了 2，实现只拦上限。
3. **把 npm `gitHead` 当成 tag 提交**：`3.3.0` 的 `gitHead` 是父提交 `3af6f1b1...`，tag 提交只改了 version 字段。
4. **在 CommonJS 里 `require` 本包**：3.x 是 `"type": "module"`；CHANGELOG 把 CJS 留给 `v2.3.1`。
5. **把 README 的每周下载量、碰撞公式或 gzip 体积写成实测结论**：本轮没有跑 collision-test / histogram / bundle。

## 适用 vs 不适用场景

**适用**：

- 需要 URL / HTML 友好、看起来随机、不泄露创建时间的分布式短 ID
- 能接受 ESM 和 SHA3 / BigNumber 这两份运行时依赖
- 愿意自己决定长度，并理解短 slug 的碰撞空间更小

**不适用**：

- 需要按 ID 本身做范围扫描或时间排序——那是 [[ulid]]
- 必须 CommonJS `require`，又不想停在 2.x
- 要把未跑过的「不可能碰撞」写成选型保证

## 固定版本边界

- 本文绑定 `paralleldrive/cuid2@2275e80d...`，npm 包 `@paralleldrive/cuid2@3.3.0`。
- annotated tag `v3.3.0` 剥开后就是该提交；npm `gitHead` 是它的父提交，树差异只有 version `3.2.0` → `3.3.0`。
- npm `repository` 仍写 `ericelliott/cuid2`，GitHub 解析到同一仓。
- 未安装依赖，未跑 `src/index-test.js` / collision-test，状态保持 `UNVERIFIED`。

## 学到什么

1. **「安全」来自混合，不是单靠 Web Crypto**——时间、盐、计数器、指纹都进 SHA3。
2. **首字母是字母表抽样，后面才是哈希切片**——所以 `isCuid` 要求小写字母开头。
3. **默认 `createId` 有会话状态**——懒初始化的 counter / fingerprint 会跨调用复用。
4. **长度是安全参数，不是外观**——5 位 slug 和 24 位默认值不是同一张合同。

## 应用型自测

1. `createId()` 的结果能按字典序反映生成先后吗？
2. `init({ length: 1 })` 会不会像 `length: 33` 一样抛错？
3. 没有 `crypto.getRandomValues` 时，固定 3.3.0 会怎样？

检查点：

1. 不能。时间进了哈希，表面是打散后的 base36。
2. 不会。实现只判断 `length > 32`。
3. `createRandom()` 退回 `Math.random`，不会像 [[ulid]] 那样直接抛 PRNG 失败。

## 延伸阅读

- 固定源码：[paralleldrive/cuid2](https://github.com/paralleldrive/cuid2) —— 本文绑定提交 `2275e80d1d36d36588a3b7a4929fb07b4b745fd0`
- 规范对照：[ulid/spec](https://github.com/ulid/spec) —— ULID 的可排序合同，不是本库
- [[ulid]] —— 时间在前、可 decode、可选单调递增的对照路线

## 关联

- [[ulid]] —— 同样面向「不要用自增主键」，但故意保留可排序时间头
- [[postgres-js]] —— 常把这类 ID 当文本主键塞进 SQL；本页不审查数据库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ulid]] —— ULID — 时间在前、Crockford Base32 编码的可排序 128-bit ID
