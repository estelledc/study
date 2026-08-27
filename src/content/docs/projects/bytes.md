---
title: bytes — 在 1024 进制里来回翻译体积字符串
description: 对照 bytes 3.1.2 源码，看它如何把 '1KB' 收成 1024，又如何把数字格式化成 KB/MB，以及裸 B / KiB 为什么不走同一条正则。
来源: https://github.com/visionmedia/bytes.js
日期: 2026-08-27
分类: projects / 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/visionmedia/bytes.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9ddc13b6c66e0cb293616fba246e05db4b6cef4d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.2
---

## 是什么

`bytes` 是一个 CommonJS 小函数：字符串进来就解析成整数字节，数字进来就格式化成带单位的字符串。日常类比：快递单上的「1KG」和秤上的 1000 克——它只认 **1024 进位** 的那杆秤，而且进出都走同一扇门。

固定 `3.1.2` 把 default、`format`、`parse` 都挂在同一个 `index.js` 上。没有 ESM exports，也没有类型声明。

```js
var bytes = require("bytes");

bytes(1024);   // "1KB"
bytes("1KB");  // 1024
```

`typeof` 是 `string` 走 `parse`，是 `number` 走 `format`，其它类型返回 `null`。options 只对 format 生效。

## 为什么重要

不读固定源码，很容易把它和 [[filesize]] 或「磁盘厂商的 1000 进制」混成一句话：

- 为什么 `bytes(1000)` 是 `'1000B'` 而不是 `'1KB'`——自动单位阈值是 1024，不是 1000
- 为什么 `'1KiB'` 解析成 `1`——正则不认 IEC 符号，未匹配就 `parseInt`
- 为什么 `'1.5B'` 不是 1.5——裸 `B` 不在捕获组里，小数被 `parseInt` 砍掉
- 为什么失败返回 `null` 而不是抛错——这是 Express / body-parser 那一路的合同

## 核心要点

固定版本可以拆成四条：

1. **单位表只有 1024 幂**：`kb=1<<10`、`mb=1<<20`、`gb=1<<30`；`tb` / `pb` 改用 `Math.pow(1024, 4/5)`，避免 32-bit 移位溢出。没有 SI 1000，也没有 `KiB`。

2. **解析正则很窄**：`/^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i`。匹配到就 `parseFloat` 再乘单位，最后 `Math.floor`。匹配不到就 `parseInt(val, 10)` 并假定单位 `b`。

3. **数字 parse 不取整**：`bytes.parse(10.5)` 原样返回 `10.5`。只有字符串路径会 `floor`。

4. **format 用 `toFixed` 再剥尾零**：默认 `decimalPlaces=2`、`fixedDecimals=false`。`thousandsSeparator` 只处理小数点左侧；未知 `unit` 回落到自动档。非有限数返回 `null`。

## 实践示例

### 案例 1：同一入口，按类型分发

```js
var bytes = require("bytes");

bytes("1.5MB");                 // 1572864
bytes(1572864);                 // "1.5MB"
bytes(1572864, { unitSeparator: " " }); // "1.5 MB"
```

`'1.5MB'` 命中正则，`1.5 * (1<<20)` 再 `floor`。反过来 format 选中 `MB`，`toFixed(2)` 得到 `'1.50'`，剥尾零后是 `'1.5MB'`。

### 案例 2：强制单位和千分位

```js
bytes.format(12 * (1 << 20), { unit: "kb" }); // "12288KB"
bytes.format(1000, { thousandsSeparator: "," }); // "1,000B"
bytes.format(1024, { decimalPlaces: 3, fixedDecimals: true }); // "1.000KB"
```

`unit: "bb"` 不在 map 里，会回到自动检测。`1000` 小于 1024，单位仍是 `B`。

### 案例 3：解析失败与「看起来像单位」的字符串

```js
bytes.parse("foobar"); // null
bytes.parse("0x11");   // 0
bytes.parse("1kib");   // 1
bytes.parse(10.5);     // 10.5
```

`'0x11'` 走 `parseInt(..., 10)`，在 `x` 处停，得到 `0`。`'1kib'` 同样不匹配正则。数字 `10.5` 不经过 `floor`。

## 踩过的坑

1. **把 KB 当成 1000**：文档和源码都写明 1kb = 1024b。`bytes(1000)` 不会变成 `'1KB'`。
2. **以为 `B` / `KiB` 是一等单位**：正则不捕获它们。`'1.1b'` 在测试里等于 `1`；IEC 符号会被当成「无单位数字」。
3. **把 parse 的 floor 套到数字输入**：`bytes.parse(10.5)` 保持 `10.5`。只有字符串才丢掉不足 1 字节的小数。
4. **指望 ESM / 类型 / SI 开关**：发布物只有 `index.js`。要对 1000 进制或 `KiB` 说话，应看 [[filesize]]，不是本包。

## 适用 vs 不适用场景

**适用**：

- Node 服务里解析 `Content-Length`、limit 字符串（`'5mb'`）
- 只要 1024 + `KB/MB/GB` 这一套 JEDEC 风格符号
- 调用方能接受失败时拿到 `null`

**不适用**：

- 需要 SI（1000、`kB`）或 IEC（`KiB`）——固定版本没有开关
- 需要 ESM named export、TypeScript 声明或 `partial` 工厂
- 非法输入必须抛错而不是静默 `null`
- 要把 README 下载量或「更小」写成已测结论

## 固定版本边界

- 本文绑定 `visionmedia/bytes.js@9ddc13b6...`，tag 与 npm `bytes@3.1.2` 的 `gitHead` 一致。
- `engines.node` 为 `>= 0.8`。History 把 `3.1.2` 记在 2022-01-27。
- 未安装依赖、未跑 mocha / nyc，状态保持 `UNVERIFIED`。

## 学到什么

1. **双向入口靠 `typeof`，不是靠单位表**——字符串和数字走两条完全不同的函数。
2. **正则比文档里的「b 也是单位」更窄**——裸 `B` 是 fallback，不是捕获组。
3. **1024 是写死的，不是默认值**——没有 `base: 10`。
4. **失败合同是 `null`**——和 [[filesize]] 的 `TypeError` 对着看，不要混用。

## 应用型自测

1. `bytes(1000)` 的结果是 `'1KB'` 吗？
2. `bytes.parse('1.5B')` 会得到 `1.5` 吗？
3. `bytes.parse(10.5)` 会 `floor` 成 `10` 吗？

检查点：

1. 不是。`1000 < 1024`，format 得到 `'1000B'`。
2. 不会。裸 `B` 不匹配正则，`parseInt('1.5B', 10)` 得到 `1`。
3. 不会。数字路径原样返回 `10.5`。

## 延伸阅读

- 固定源码：[visionmedia/bytes.js](https://github.com/visionmedia/bytes.js) —— 本文绑定 `9ddc13b6c66e0cb293616fba246e05db4b6cef4d`
- 审查记录：仓库内 `docs/size-format-source-review-20260827-ew.md`
- [[filesize]] —— 默认 SI、可切换 IEC/JEDEC，只做格式化
- [[express]] —— 常见的 limit 字符串消费方

## 关联

- [[filesize]] —— 同赛道的单向格式化，默认 1000 进制
- [[express]] —— body limit 一类字符串常经本库解析
- [[date-fns]] —— 另一类纯函数格式化，对象是时间不是字节

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
