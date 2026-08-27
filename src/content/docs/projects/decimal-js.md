---
title: decimal.js — 按有效数字精度取整的任意精度十进制
description: 介绍 decimal.js 10.6.0 如何用构造器级 precision/rounding 约束全部运算，并区分 Number 字面量与字符串输入。
来源: https://github.com/MikeMcl/decimal.js
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/MikeMcl/decimal.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1a6e845004b29a3b7dcef78fe92b8d786634f4e2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.6.0
---

## 是什么

decimal.js 是一个任意精度的十进制类型。日常类比：科学计算器上的“有效数字”旋钮——加减乘除、开方、三角函数都先算，再按同一把尺子裁到指定位数。

你写：

```js
const Decimal = require('decimal.js');

new Decimal('0.1').plus('0.2').toString();
Decimal.sqrt('2').toString();
```

`'0.1'.plus('0.2')` 得到 `'0.3'`，而不是 `0.30000000000000004`。固定 10.6.0 的默认构造器把 `precision` 设为 20、`rounding` 设为 `ROUND_HALF_UP`（数值 4）。`package.json` 的 `exports` 让 `require` 走 `decimal.js`、`import` 走 `decimal.mjs`。

## 为什么重要

不理解“精度挂在构造器上、每次运算都 `finalise`”，就解释不了下面几件事：

- 为什么 `new Decimal(0.1 + 0.2)` 救不回已经丢掉的二进制误差
- 为什么 `plus` / `times` 也会按有效数字取整，而不是只在除法时裁
- 为什么 `Decimal.set({ precision: 5 })` 会改掉后面所有 `new Decimal` 的结果
- 为什么要 `Decimal.clone(...)` 才能给另一条计算链单独设精度

## 核心要点

固定 10.6.0 的主链可以拆成五步：

1. **构造**：`Decimal(v)` 不写 `new` 也会 `return new Decimal(v)`。`v` 可以是 number、string、bigint 或另一份 Decimal。小整数（`v === ~~v && v < 1e7`）走快路径；普通 number 先 `v.toString()` 再解析。

2. **配置挂在构造器上**：`DEFAULTS` 给出 `precision: 20`、`rounding: 4`、`modulo: 1`、`toExpNeg: -7`、`toExpPos: 21`、`minE`/`maxE` 为 `±9e15`、`crypto: false`。`Decimal.config` 与 `Decimal.set` 是同一个函数。

3. **独立构造器**：`Decimal.clone({ precision: 9, rounding: 1 })` 复制当前配置后覆盖传入项，得到另一套互不影响的 `Decimal`。

4. **存储格式**：实例只公开 `d` / `e` / `s`。`d` 是以 `BASE = 1e7` 分块的数字数组，`e` 是十进制指数，`s` 是符号。注释写明应视为只读。

5. **对外运算都取整**：`plus` / `add`、`times` / `mul`、`dividedBy` / `div` 在 `external === true` 时都走 `finalise(..., precision, rounding)`。三角函数、`ln`、`exp`、非整数 `pow` 也吃同一套精度。

## 实践示例

### 案例 1：字符串进、字符串出，才能躲开 Number 字面量

```js
new Decimal(0.1).plus(0.2).toString();     // 取决于 Number 已经丢掉的位
new Decimal('0.1').plus('0.2').toString(); // '0.3'
new Decimal(1n).plus('0.5').toString();    // bigint 先 toString 再 parseDecimal
```

`0xff.f`、`0b10101100` 这类带前缀的字符串走 `parseOther`，普通十进制走 `isDecimal` 正则。

### 案例 2：加法也会按有效数字裁

```js
Decimal.set({ precision: 5, rounding: Decimal.ROUND_HALF_UP });
new Decimal('1.23456').plus('0.00004').toString();
```

`plus` 不是“先精确加、永不裁”。注释写明：返回值按构造器的 `precision` 有效数字和 `rounding` 取整。要另一套尺子，用 `clone`，不要指望实例自己记住精度。

### 案例 3：`clone` 把配置从全局默认里拆出去

```js
const Tight = Decimal.clone({ precision: 9, rounding: 1 });
const a = new Decimal(5).div(3);
const b = new Tight(5).div(3);
```

`a` 仍用默认构造器当时的 `precision`；`b` 只用 `Tight` 的 9 位。两套 `d` 数组互不共享。

## 踩过的坑

1. **把 Number 算术的结果丢进构造器**：`new Decimal(0.7 + 0.1)` 读到的是 `'0.7999999999999999'`。库救不回已经发生的 IEEE 754 舍入。

2. **以为只有 `div` 会取整**：`plus` 和 `times` 同样 `finalise`。精度设得很低时，连加法都会少位。

3. **改 `Decimal.precision` 当局部变量**：它是构造器属性。同一进程里后面的 `new Decimal` 都会看见。并行两套规则必须 `clone`。

4. **把 npm `gitHead` 当成源码 tag**：`decimal.js@10.6.0` 的 npm `gitHead` 是 `f1ee2f404d6bf96d59c04db80c1f404742afa3fa`，在 canonical remote 上不可达。本页绑定的是源码 tag `v10.6.0` 剥皮提交。

5. **把 README 的体积或“比 BigDecimal 更快”当成本轮测量**：未安装依赖、未跑 `npm test`、未打包。

## 适用 vs 不适用场景

**适用**：

- 需要按有效数字约束整条计算链，包括乘加和超越函数
- 要十六进制 / 二进制 / 八进制字符串，或直接吃 bigint
- 接受 9 种 rounding 和 5 种常用 modulo（含 `EUCLID = 9`）

**不适用**：

- 只要加乘保持精确、只在除法裁小数位——看 [[big-js]]
- 不能接受源码 tag 与 npm `gitHead` 不是同一提交
- 需要把“未运行的上游测试”写成已验证——本页保持 `UNVERIFIED`

## 固定版本边界

- 本文绑定 `MikeMcl/decimal.js@1a6e845004b29a3b7dcef78fe92b8d786634f4e2`，源码 tag 为 `v10.6.0`，文件头版本同为 `10.6.0`。
- npm `decimal.js@10.6.0` 的 `gitHead` 指向不可达提交 `f1ee2f404d6bf96d59c04db80c1f404742afa3fa`；未猜测该提交内容。
- `10.6.0` 相对 `10.5.0` 的源码变更是 TypeScript 定义补 bigint；运行时构造路径在 `10.5.0` 已接受 bigint。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **精度是构造器合同，不是实例字段**——`set` 改默认，`clone` 开新厂。
2. **对外运算默认都裁到 `precision`**——不要用“加法该精确”去读 `plus`。
3. **Number 字面量在进门前就已经舍入**——字符串和 bigint 才是完整输入。
4. **发布元数据可以指向不可达提交**——绑定前要在 canonical remote 上 `cat-file`。

## 应用型自测

1. `new Decimal(5).plus(3)` 会不会因为默认 `precision: 20` 而改写成别的值？
2. `Decimal.set({ precision: 5 })` 之后，已经存在的 Decimal 实例再 `plus`，用的是哪套精度？
3. 不写 `new` 的 `Decimal('1')` 会不会抛错？

检查点：

1. 不会。5 和 3 远少于 20 位有效数字，`finalise` 后仍是 8。
2. 用构造器当时的 `precision`。实例没有自己的精度字段；方法读 `x.constructor.precision`。
3. 不会。`!(x instanceof Decimal)` 时直接 `return new Decimal(v)`。

## 延伸阅读

- 文档：[mikemcl.github.io/decimal.js](https://mikemcl.github.io/decimal.js/)
- 固定源码：[MikeMcl/decimal.js](https://github.com/MikeMcl/decimal.js) —— 本文绑定提交 `1a6e845004b29a3b7dcef78fe92b8d786634f4e2`
- [[big-js]] —— 同作者的轻量对照：只在除法族按小数位取整
- [[date-fns]] —— 另一类“不发明包装类型、但合同很窄”的工具库

## 关联

- [[big-js]] —— 小数位 / 有效数字、精确加乘 vs 全运算取整
- [[date-fns]] —— 同样强调输入形态决定结果，但不做十进制算术
- [[lodash]] —— 通用工具，不解决 `0.1 + 0.2`
- [[zod]] —— 运行时校验，不提供任意精度类型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
