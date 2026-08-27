---
title: lossless-json — 把数字原文存进 LosslessNumber 的 JSON 解析器
description: 介绍 lossless-json 4.3.1 如何用字符串载荷保住 JSON 数字精度，并在 stringify 时原样写回。
来源: https://github.com/josdejong/lossless-json
日期: 2026-08-27
分类: 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/josdejong/lossless-json
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a19ae09763876582d120d2f3de4cbd7741faa427
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.3.1
---

## 是什么

lossless-json 是一个与 `JSON.parse` / `JSON.stringify` 对齐的 JavaScript JSON 库。日常类比：把发票上的数字先按原文字抄进信封，需要算账时再拆；拆不开就报错，而不是悄悄四舍五入。

你写：

```js
import { parse, stringify } from 'lossless-json';

const text = '{"long":9123372036854000123,"decimal":2.370}';
const data = parse(text);
stringify(data);
```

默认解析会把每个 JSON 数字收成 `LosslessNumber`：内部只存原文 `value` 字符串，并挂 `isLosslessNumber = true`。固定 4.3.1 没有运行时依赖，`exports` 把 `import` 指到 ESM、`require` 指到 UMD。

## 为什么重要

不理解“先存原文、后决定类型”，就解释不了下面几件事：

- 为什么 `JSON.parse` 会把 `9123372036854000123` 收成另一个 number，而这里能 round-trip
- 为什么 `valueOf()` 有时给 number、有时给 bigint、有时直接抛错
- 为什么 README 里的 `numberParser` 对象写了却不生效
- 为什么重复 key 默认报错，但两个值深相等时又能过

## 核心要点

固定 4.3.1 的主链可以拆成五步：

1. **手写递归下降**：`parse` 从左往右吃 token。数字片段切出来后交给 `parseNumber`，默认是 `parseLosslessNumber`，也就是 `new LosslessNumber(text)`。

2. **第三参数是函数或选项对象**：函数会被包成 `{ parseNumber }`。选项对象认 `parseNumber` 与 `onDuplicateKey`。内置 `parseNumberAndBigInt` 把整数原文变成 `bigint`，其余走 `Number.parseFloat`。

3. **取值时才分型**：`valueOf()` 先看 `getUnsafeNumberReason`。安全或只丢小数位时返回 `parseFloat`；不安全的整数返回 `BigInt`；溢出 / 下溢抛错。`LosslessNumber` 没有 `toJSON`。

4. **写回走原文**：`stringify` 见到 `isLosslessNumber` 或 `bigint` 就调用 `toString()`，不加引号。第四参数 `numberStringifiers` 必须吐出能通过 `isNumber` 的 JSON 数字字符串。

5. **重复 key 默认失败**：`hasOwnProperty` 命中且新旧值不深相等时，默认 `throwDuplicateKey`。`onDuplicateKey` 若返回 `undefined`，保留先写入的值。

## 实践示例

### 案例 1：默认路径保住数字原文

```js
const data = parse('{"long":9123372036854000123}');
data.long.isLosslessNumber;          // true
data.long.toString();                // '9123372036854000123'
stringify(data);                     // '{"long":9123372036854000123}'
```

`JSON.parse` 会先把这段收成 IEEE-754 number。这里只抄原文，`stringify` 再原样写回。

### 案例 2：第三参数直接换数字策略

```js
import { parse, parseNumberAndBigInt } from 'lossless-json';

parse('[123456789123456789123456789, 2.3, 123]', null, parseNumberAndBigInt);
// [123456789123456789123456789n, 2.3, 123n]
```

测试就是这样传函数的。整数（含安全范围内的 `123`）都会变成 `bigint`，小数仍是 number。

### 案例 3：重复 key 可配置，默认抛 SyntaxError

```js
parse('{"name":"Joe","name":"Sarah"}');
// SyntaxError: Duplicate key 'name' encountered at position 17

parse('{"name":"Joe","name":"Sarah"}', null, {
  onDuplicateKey: ({ newValue }) => newValue
});
// { name: 'Sarah' }
```

两个值深相等时，例如 `"name":"Joe"` 写两次，默认不抛。

## 踩过的坑

1. **把 README 的 `numberParser` 当成选项名**：实现只读 `parseNumber`。写成 `{ numberParser: fn }` 会被忽略，数字仍进 `LosslessNumber`。函数当第三参数，或对象里用 `parseNumber`。

2. **对超大整数做 `+ 1` 之类的隐式转换**：`valueOf()` 会先分型。`2.3e+500` 会 overflow 并抛错，不会静默变成 `Infinity`。

3. **给 `LosslessNumber` 补 `toJSON`**：源码注释写明不要这样做。`stringify` 靠 `isLosslessNumber` 走原文；先变成 number 再 `JSON.stringify` 会丢精度。

4. **把 `config()` 当成还能开循环引用**：`config` 已弃用，调用即抛，并说明应避免循环引用，而不是再开开关。

5. **把 README 的 gzip 体积当成本轮测量**：文档写过 full bundle 小于 4 kB。本轮未安装依赖、未打包、未测体积。

## 适用 vs 不适用场景

**适用**：

- JSON 里既有超大整数，也有必须保住小数尾零或科学计数写法的数字
- 想先读成统一包装，再按字段决定转 number / bigint / 自建 BigNumber
- 打包器能消费 `sideEffects: false` 的 ESM / UMD 条件导出

**不适用**：

- 只想在解析当下用长度启发式分流 BigNumber / BigInt——看 [[json-bigint]]
- 需要运行时 schema 校验——[[zod]] 管形状，不管 JSON 数字原文
- 数据里有循环引用，还指望库帮忙折叠
- 不能接受默认把安全范围内的 `123` 也收成 `LosslessNumber`

## 固定版本边界

- 本文绑定 `josdejong/lossless-json@a19ae09763876582d120d2f3de4cbd7741faa427`，tag `v4.3.1` 与 npm `lossless-json@4.3.1` 的 `gitHead` 指向同一提交。
- `package.json` 无运行时依赖；`exports` 区分 `import` → `./lib/esm/index.js` 与 `require` → `./lib/umd/lossless-json.js`。
- 重复 key 默认抛错；深相等或 `onDuplicateKey` 返回替换值时例外。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **保住精度的关键是延迟分型**——先存原文，取值时再决定 number / bigint / 报错。
2. **选项名以类型定义为准**——实现认 `parseNumber`，README 有一处仍写 `numberParser`。
3. **stringify 必须绕开 `toJSON`**——包装类型一旦被先收成 number，原文就没了。
4. **重复 key 不是 JSON 语法错误，但是这个库的默认合同**——和“最后一次写入获胜”的对照在 [[json-bigint]]。

## 应用型自测

1. `parse('{"n":123}')` 得到的 `n`，默认是 JavaScript `number` 吗？
2. 第三参数写成 `{ numberParser: parseNumberAndBigInt }`，整数会变成 `bigint` 吗？
3. `new LosslessNumber('2.3e+500').valueOf()` 会得到 `Infinity` 吗？

检查点：

1. 不是。默认是 `LosslessNumber`，`typeof` 为 `'object'`。
2. 不会。实现只读 `parseNumber`；应直接传函数，或使用 `{ parseNumber }`。
3. 不会。overflow 会抛错，而不是返回 `Infinity`。

## 延伸阅读

- 文档：[josdejong/lossless-json README](https://github.com/josdejong/lossless-json#readme)
- 固定源码：[josdejong/lossless-json](https://github.com/josdejong/lossless-json) —— 本文绑定提交 `a19ae09763876582d120d2f3de4cbd7741faa427`
- [[json-bigint]] —— 解析当下就按文本长度分流 BigNumber / BigInt 的对照
- [[zod]] —— 校验对象形状，不负责保住 JSON 数字原文

## 关联

- [[json-bigint]] —— 同一“JSON 数字超出 IEEE-754”问题的另一条合同
- [[zod]] —— 解析之后若还要验证字段类型，应另接 schema

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
