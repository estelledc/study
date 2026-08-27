---
title: toml — Peggy 文法只负责 parse 的 TOML 1.1 库
description: 固定版本用 Peggy 生成 parser，再由 compiler 收成无原型表
来源: https://github.com/BinaryMuse/toml-node
日期: 2026-08-27
分类: 解析
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/BinaryMuse/toml-node
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ccd8b103f08bea6d39541271b1e6c3dba9e73275
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.0
---

## 是什么

npm 包 `toml` 是 `BinaryMuse/toml-node` 发布的 JavaScript TOML 解析器。日常类比：它只做单向翻译——把 TOML 文本译成普通对象，不负责再译回去。

```js
const toml = require("toml")
const data = toml.parse("title = \"TOML Example\"\nid = 3")
```

固定 5.0.0 自称 TOML v1.1.0、零 runtime 依赖、要求 Node >= 20。公开入口只有 `parse(input, options)`。

## 为什么重要

不读固定源码，容易把「名叫 toml 的包」和 `@iarna/toml`、[[smol-toml]] 混成同一份合同：

- 为什么这里没有 `stringify`
- 为什么超大整数默认会抛错，而不是悄悄变成 `1.23e18`
- 为什么表对象用 `Object.create(null)`，`obj.toString` 并不存在
- 为什么嵌套太深会变成带行列号的普通 Error，而不是打崩进程的 `RangeError`

## 核心要点

主链可以拆成四步：

1. **两段式**：`index.js` 先 `parser.parse(str, options)`，再 `compiler.compile(nodes, str, options)`。parser 来自 `src/toml.pegjs`，生成文件头写着 Peggy 5.1.0。

2. **表是无原型对象**：`createTable()` 用 `Object.create(null)`，再用 `WeakSet` 标记「解析器自己造的容器」。CHANGELOG 把这记成 GHSA-v5mp-jgw5-2x6j 的修复。

3. **深度与整数都 fail-closed**：数组 / 内联表默认最多 500 层（`maxDepth`）；Integer 节点先当 BigInt，默认超出 `Number` 安全整数就抛，`bigint: true` 才整表返回 BigInt。超出 int64 无论哪种模式都抛。

4. **日期默认不走 Temporal**：offset date-time 是 `Date`；local date / time 是字符串。`useTemporal: true` 才映射到 `ZonedDateTime` / `PlainDateTime` / `PlainDate` / `PlainTime`，并可经 `temporal` 注入 polyfill。

## 实践示例

### 案例 1：只 parse，没有回写

```js
const toml = require("toml")
const data = toml.parse(`
title = "demo"
[owner]
name = "Ada"
`)
```

得到的是普通嵌套对象。固定包没有 `stringify`；要把对象写成 TOML，得另找库，例如 [[smol-toml]]。

### 案例 2：不安全整数默认拒绝

```js
toml.parse("id = 771752188537605140")
// Error: Integer ... cannot be represented losslessly as a JavaScript number.

const wide = toml.parse("id = 771752188537605140\ncount = 3", { bigint: true })
// wide.id === 771752188537605140n
// wide.count === 3n
```

`bigint: true` 会把**所有**整数收成 BigInt，不是「只放大数」。

### 案例 3：嵌套上限是可配置的 parse error

```js
const nested = "a = " + "[".repeat(4) + "1" + "]".repeat(4)
toml.parse(nested, { maxDepth: 2 })
// Error: Maximum nesting depth of 2 exceeded.  (带 line / column)
```

默认 500。CHANGELOG 写这是为了避免深度递归把调用栈撑成不可捕获的 `RangeError`。

## 踩过的坑

1. **以为 `toml.stringify` 存在**：固定版本只导出 `parse`。
2. **把超大整数当普通 `number`**：5.0.0 默认抛错；要无损必须显式 `bigint`。
3. **把表当成普通 `{}`**：`Object.create(null)` 没有 `Object.prototype` 方法。
4. **把 README 的 702/708 toml-test 写成已测事实**：本轮未跑官方套件。
5. **和 `@iarna/toml` 共用同一套 API 记忆**：那是另一个包，本页不绑定。

## 适用 vs 不适用场景

**适用**：

- 只要把 TOML 读成 JS 对象，接受 CJS `require("toml")`
- 希望不安全整数和过深嵌套在 parse 期失败，而不是静默损坏
- 运行时已是 Node >= 20

**不适用**：

- 需要把对象再写成 TOML → [[smol-toml]]
- 还要在旧 Node 18 上跑
- 想把未跑过的 spec 分数或 benchmark 写成选型结论

## 固定版本边界

- 本文绑定 `BinaryMuse/toml-node@ccd8b103...`，npm `toml@5.0.0`；`gitHead` 与 tag `v5.0.0` 一致。
- 声称 TOML v1.1.0；零 runtime 依赖；`engines.node >= 20`。
- 未安装依赖、未跑 `npm test` / `toml-test`、未测体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **「toml」这个包名只保证 parse**——回写是另一份合同。
2. **整数默认 fail-closed**——5.0.0 不再静默四舍五入。
3. **无原型表是安全修复，不是风格偏好**——`toString` / 原型方法不能当存在。
4. **深度上限把崩溃收成普通异常**——`maxDepth` 是解析器合同的一部分。

## 应用型自测

1. `require("toml").stringify({ a: 1 })` 在固定 5.0.0 里可用吗？
2. 不传 `bigint` 时，`id = 771752188537605140` 会得到什么？
3. `toml.parse("[a]\nb = 1")` 得到的表对象有没有 `Object.prototype`？

检查点：

1. 不可用。固定包只导出 `parse`。
2. 抛 parse error，而不是一个被舍入的 `number`。
3. 没有。`createTable()` 用 `Object.create(null)`。

## 延伸阅读

- 固定源码：[BinaryMuse/toml-node](https://github.com/BinaryMuse/toml-node) —— 本文绑定提交 `ccd8b103f08bea6d39541271b1e6c3dba9e73275`
- TOML 1.1.0：[toml.io/en/v1.1.0](https://toml.io/en/v1.1.0)
- [[smol-toml]] —— 同主题的手写 parse/stringify 对照
- [[yq]] —— 命令行里同时吃 YAML / TOML 的对照工具

## 关联

- [[smol-toml]] —— 手写递归下降，并且有 stringify
- [[yq]] —— 多格式查询，不是 JS 库合同
- [[dasel]] —— 另一把切 JSON/YAML/TOML 的刀

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[smol-toml]] —— smol-toml — 手写指针机上的 TOML parse 与 stringify
