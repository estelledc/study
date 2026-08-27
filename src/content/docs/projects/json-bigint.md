---
title: json-bigint — 按文本长度分流大数的 Crockford JSON 解析器
description: 介绍 json-bigint 1.0.0 如何用长度启发式和 bignumber.js / BigInt 保住超出 IEEE-754 的 JSON 整数。
来源: https://github.com/sidorares/json-bigint
日期: 2026-08-27
分类: 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sidorares/json-bigint
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 390482a8b6b460f98c61c3b65915dbd91fc8e7b2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.0.0
---

## 是什么

json-bigint 是一个在 Crockford `JSON.js` 上加了大数分支的 CommonJS JSON 库。日常类比：收银机默认按普通金额入账；票面超过 15 个字符就改开大额本票，而不是先兑成会丢分的零钱。

你写：

```js
var JSONbig = require('json-bigint');

var text = '{ "value": 9223372036854775807, "v2": 123 }';
var data = JSONbig.parse(text);
JSONbig.stringify(data);
```

默认解析把短数字收成 JavaScript `number`，把原文长度大于 15 的数字收成 `bignumber.js` 的 `BigNumber`。`stringify` 再把 `BigNumber` 和原生 `bigint` 写成不带引号的 JSON 数字。固定 1.0.0 依赖 `bignumber.js@^9.0.0`。

## 为什么重要

不理解“按原文长度、而不是按数值是否安全”来分流，就解释不了下面几件事：

- 为什么 `123` 仍是 number，而 `9223372036854775807` 变成对象
- 为什么带负号或小数点的 16 字符文本也会走大数分支
- 为什么 `catch (e)` 之后 `e instanceof SyntaxError` 为 false
- 为什么默认会拒绝 `__proto__` / `constructor`，即使对象本身没有原型

## 核心要点

固定 1.0.0 的主链可以拆成五步：

1. **工厂包一层选项**：`require('json-bigint')(options)` 返回 `{ parse, stringify }`。模块顶层的 `parse` / `stringify` 是空选项的兼容入口。`stringify` 始终是同一份实现，不被选项改写。

2. **Crockford 递归下降**：`lib/parse.js` 手写 `value` / `object` / `array` / `number` / `string`。对象用 `Object.create(null)`，没有 `Object.prototype`。

3. **数字按 `string.length > 15` 分流**：超过阈值时按选项变成字符串、`BigInt(string)` 或 `new BigNumber(string)`；否则默认 `+string` 得到 number。`alwaysParseAsBig` 会把短数字也抬成 BigNumber / BigInt。

4. **危险键默认报错**：`protoAction` / `constructorAction` 默认为 `'error'`。键名用 Bourne / secure-json-parse 的 suspect 正则识别，包括 `\u005f_proto__` 这种转义。

5. **stringify 先记 BigNumber，再调用 `toJSON`**：若捕获到 `BigNumber`，`toJSON` 之后按字符串原样输出，不再加引号。`typeof value === 'bigint'` 也走 `String(value)`。

## 实践示例

### 案例 1：默认只抬长大整数

```js
var JSONbig = require('json-bigint');
var data = JSONbig.parse('{ "value": 9223372036854775807, "v2": 123 }');

typeof data.v2;                 // 'number'
typeof data.value;              // 'object'（BigNumber）
data.value.toString();          // '9223372036854775807'
JSONbig.stringify(data);        // '{"value":9223372036854775807,"v2":123}'
```

`123` 只有 3 个字符，不进大数分支。长整数字符串超过 15，才 `require('bignumber.js')` 并 `new BigNumber(string)`。

### 案例 2：原生 BigInt 与强制全抬

```js
var native = require('json-bigint')({ useNativeBigInt: true });
native.parse('{"big":92233720368547758070,"small":123}');
// { big: 92233720368547758070n, small: 123 }

var allBig = require('json-bigint')({
  alwaysParseAsBig: true,
  useNativeBigInt: true
});
allBig.parse('{"small":123}');
// { small: 123n }
```

长路径调用 `BigInt(string)`；短路径在 `alwaysParseAsBig` 下调用 `BigInt(number)`。

### 案例 3：危险键与重复键是两套开关

```js
require('json-bigint').parse('{ "__proto__": 1 }');
// 抛普通对象：Object contains forbidden prototype property

require('json-bigint')({ protoAction: 'ignore' })
  .parse('{ "__proto__": 1, "a": 42 }');
// { a: 42 }，原型仍是 null

require('json-bigint').parse('{ "dup": 1, "dup": 2 }').dup;          // 2
require('json-bigint')({ strict: true }).parse('{ "dup": 1, "dup": 2 }');
// Duplicate key "dup"
```

## 踩过的坑

1. **把 `length > 15` 理解成 `Number.isSafeInteger`**：判断的是原文字符数，含负号、小数点和指数。`-123456789012345` 有 16 个字符，会进大数分支；`1.23456789012345` 也会。

2. **用 `instanceof SyntaxError` 接解析失败**：`error()` 抛的是 `{ name: 'SyntaxError', message, at, text }` 普通对象，不是 `new SyntaxError`。

3. **以为选项会改 `stringify`**：工厂每次都挂同一份 `lib/stringify.js`。`storeAsString: true` 只影响解析，写回时这些字段已是普通字符串，会被加上引号。

4. **`alwaysParseAsBig` 配 `useNativeBigInt` 去吃小数**：短小数会走到 `BigInt(number)`，原生 `BigInt(1.23)` 会抛错。这条组合是为整数准备的。

5. **把默认对象当成普通 `{}`**：解析结果没有 `Object.prototype`。`obj.toString` 是 `undefined`，不是继承来的方法。

## 适用 vs 不适用场景

**适用**：

- JSON 里偶发超过 15 位的整数，短数字仍想当普通 `number` 用
- 需要默认挡住 `__proto__` / `constructor` 键，或显式改成 ignore / preserve
- 调用方是 CommonJS，并能接受运行时依赖 `bignumber.js`

**不适用**：

- 必须保住小数尾零、科学计数写法，或先统一包装再分型——看 [[lossless-json]]
- 需要运行时 schema 校验——[[zod]] 不负责大数解析
- 必须 `e instanceof SyntaxError`，或不能接受 Crockford 解析器对前导零等更松的数字扫描
- 不能引入 `bignumber.js`，又坚持默认路径（不设 `useNativeBigInt` / `storeAsString`）

## 固定版本边界

- 本文绑定 `sidorares/json-bigint@390482a8b6b460f98c61c3b65915dbd91fc8e7b2`，tag `v1.0.0` 与 npm `json-bigint@1.0.0` 的 `gitHead` 指向同一提交。
- `package.json` 声明依赖 `bignumber.js@^9.0.0`；发布文件只有 `index.js`、`lib/parse.js`、`lib/stringify.js`。
- `parse` 里对 `bignumber.js` 是惰性 `require`；`stringify` 则在模块加载时就 `require`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **启发式看的是文本，不是数值安全范围**——15 个字符是这份实现的分水岭，不是 IEEE-754 的定义。
2. **工厂和默认导出是两套入口**——要改 proto / strict / BigInt，必须调用工厂，不能只改 `require('json-bigint').parse`。
3. **安全键和重复键分开处理**——前者默认 fail-closed，后者默认覆盖。
4. **错误形状属于合同**——plain object 的 `name: 'SyntaxError'` 骗不过 `instanceof`。

## 应用型自测

1. 默认 `parse('{"n":123}')` 得到的 `n`，是 `BigNumber` 还是 `number`？
2. `parse('{ "__proto__": 1 }')` 会不会把值写进普通对象的 `__proto__` 并改原型？
3. `try { require('json-bigint').parse('{'); } catch (e) { e instanceof SyntaxError }` 是 `true` 吗？

检查点：

1. 是 `number`。`123` 长度不超过 15，且未开 `alwaysParseAsBig`。
2. 不会。默认 `protoAction` 为 `error`；对象本身还是 `Object.create(null)`。
3. 不是。抛出的是带 `name: 'SyntaxError'` 的普通对象。

## 延伸阅读

- 文档：[sidorares/json-bigint README](https://github.com/sidorares/json-bigint#readme)
- 固定源码：[sidorares/json-bigint](https://github.com/sidorares/json-bigint) —— 本文绑定提交 `390482a8b6b460f98c61c3b65915dbd91fc8e7b2`
- [[lossless-json]] —— 先存数字原文、取值时再分型的对照
- [[zod]] —— 校验字段形状，不负责 JSON 大数分流

## 关联

- [[lossless-json]] —— 同一问题的延迟分型对照
- [[zod]] —— 解析之后若还要验证对象形状，应另接 schema

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
