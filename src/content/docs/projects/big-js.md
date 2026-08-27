---
title: big.js — 只在除法族按小数位取整的轻量十进制
description: 介绍 big.js 7.0.1 如何让 plus/times 保持精确，并把 DP/RM 只留给 div、sqrt 与负指数 pow。
来源: https://github.com/MikeMcl/big.js
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/MikeMcl/big.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e19cc83cb965bdef18cb31423d81f60140c9e7be
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.1
---

## 是什么

big.js 是一个体积更小的任意精度十进制库。日常类比：账本上加减乘照实写，只有除法、开方和负指数幂才按“小数点后几位”用橡皮裁一刀。

你写：

```js
const Big = require('big.js');

new Big('0.1').plus('0.2').toString();
new Big(2).div(3).toString();
```

`plus` 得到 `'0.3'`。`2.div(3)` 默认按 `Big.DP = 20`、`Big.RM = 1`（`roundHalfUp`）得到 `'0.66666666666666666667'`。固定 7.0.1 的 `exports` 让 `require` 走 `big.js`、`import` 走 `big.mjs`。包内不带类型声明。

## 为什么重要

不理解“DP 只管除法族、空调用 `Big()` 会克隆构造器”，就解释不了下面几件事：

- 为什么把 `Big.DP` 调到 2 之后，`plus` 仍然带出全部小数
- 为什么 `div` / `sqrt` / 负指数 `pow` 会变短，而 `times` 不会
- 为什么 `const Other = Big()` 得到的是新构造器，不是 `0`
- 为什么 `Big.strict = true` 时 `new Big(1)` 会抛 `TypeError`

## 核心要点

固定 7.0.1 的主链可以拆成五步：

1. **构造**：`new` 可省略。`Big(n)` 在 `n` 省略且 `arguments.length === 0` 时返回 `_Big_()`——也就是一份独立构造器。否则 `return new Big(n)`。

2. **输入**：已是 Big 则拷贝 `s` / `e` / `c.slice()`。否则非 string 先 `String(n)`（`-0` 会变成 `'-0'`）。`Big.strict === true` 时，除 bigint 外的原始 number 直接 `TypeError`。解析只用十进制正则，没有 `0x` / `0b` / `0o`。

3. **配置**：`DP = 20`（小数位，不是有效数字）、`RM = 1`、`NE = -7`、`PE = 21`、`strict = false`。取整常量只有四个：`roundDown=0`、`roundHalfUp=1`、`roundHalfEven=2`、`roundUp=3`。

4. **存储**：`c` 是十进制逐位数组，`e` 是指数，`s` 是符号。和 decimal.js 的 `BASE = 1e7` 分块不同。

5. **谁会裁**：`plus` / `minus` / `times` 按注释返回精确结果。`div`、`sqrt`、负指数 `pow` 才读 `DP`/`RM`。`mod` 会临时把 `DP` 和 `RM` 置 0 做整除，再 `minus(times)`。

## 实践示例

### 案例 1：`DP` 改了，加法仍完整

```js
Big.DP = 2;
new Big('1.234').plus('5.678').toString(); // '6.912'
new Big(1).div(3).toString();              // '0.33'
new Big('1.234').times('5.678').toString();
```

`times` 的注释和实现都不读 `DP`。只有除法族走 `round(..., DP, RM)`。

### 案例 2：空调用克隆构造器，而不是得到 0

```js
const Tight = Big();
Tight.DP = 5;
const x = new Big(2).div(3);
const y = new Tight(2).div(3);
```

`Big()` 走进 `_Big_()`，得到一份自己的 `DP`/`RM`/`strict`。`x` 仍用默认构造器当时的 20 位小数；`y` 用 5 位。

### 案例 3：strict 挡住 Number，也挡住不精确的 `toNumber`

```js
Big.strict = true;
new Big(1);                         // TypeError: [big.js] Invalid value
const q = new Big('1.0000000000000001');
q.toNumber();                       // Error: [big.js] Imprecise conversion
```

`toNumber` 在 strict 下会比较 `this.eq(n.toString())`；对不上就抛错。bigint 在 strict 里仍允许进构造器。

## 踩过的坑

1. **把 `DP` 理解成 decimal.js 的 `precision`**：一边是小数位且只管除法族，一边是有效数字且覆盖加减乘。把 `Big.DP = 5` 当成“全局 5 位有效数字”会读错 `plus`。

2. **`const x = Big()` 当零值**：无参调用返回新构造器。零要用 `new Big(0)` 或 `Big(0)`。

3. **传 Number 字面量却指望 strict 之外仍精确**：非 strict 时 `String(0.1)` 已经带上二进制误差。和 [[decimal-js]] 一样，完整输入是字符串。

4. **以为有三角函数或十六进制字面量**：7.0.1 的 `parse` 只认十进制。`sin` / `ln` / `0xff` 不在这个文件里。

5. **把 README 的 “6 KB minified” 当成本轮测量**：未安装 terser、未跑 `npm test`、未测体积。类型来自 DefinitelyTyped，不在本仓 `files` 里。

## 适用 vs 不适用场景

**适用**：

- 加乘必须保持精确，只在除法、开方、负指数幂上按小数位取整
- 需要 `strict` 把 Number 字面量挡在门外
- 能接受 4 种 rounding，以及系数按十进制逐位存放

**不适用**：

- 整条链都要按有效数字取整，或需要 `sin` / `ln` / 非整数幂——看 [[decimal-js]]
- 需要包内 TypeScript 声明——7.0.1 的 `files` 只有 `big.js` 与 `big.mjs`
- 要把静态阅读写成运行证据——本页保持 `UNVERIFIED`

## 固定版本边界

- 本文绑定 `MikeMcl/big.js@e19cc83cb965bdef18cb31423d81f60140c9e7be`，源码 tag 为 `v7.0.1`，文件头版本同为 `7.0.1`。
- npm `big.js@7.0.1` 的 `gitHead` 与该 tag 剥皮提交一致。
- `7.0.1` 相对 `7.0.0` 删除了 legacy 文档和版本选择器；构造器、`DP`/`RM` 合同未改。
- `MAX_DP` 与 `MAX_POWER` 均为 `1e6`。本文未运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **小数位和有效数字不是同一把尺子**——`DP` 不裁 `plus`。
2. **空调用是工厂**——`Big()` 克隆构造器，`Big(0)` 才是值。
3. **strict 把 Number 当成污染源**——构造和 `toNumber` 两头都查。
4. **同作者三件套里，这一件故意不做超越函数**——体积换合同面。

## 应用型自测

1. `Big.DP = 0` 之后，`new Big('1.5').plus('2.5').toString()` 是 `'4'` 还是 `'4.0'` / `'4'` 以外的完整和？
2. `const C = Big(); C.DP = 2;` 会不会改掉随后 `new Big(1).div(3)` 的小数位？
3. `new Big(2).pow(-1)` 会不会读 `DP`？

检查点：

1. 是完整和 `'4'`。`plus` 不读 `DP`；`1.5+2.5` 恰好是整数 4。
2. 不会。`new Big` 用的是默认导出的构造器，不是 `C`。
3. 会。负指数 `pow` 属于“涉及除法”的方法，按 `DP`/`RM` 取整。

## 延伸阅读

- 文档：[mikemcl.github.io/big.js](https://mikemcl.github.io/big.js/)
- 固定源码：[MikeMcl/big.js](https://github.com/MikeMcl/big.js) —— 本文绑定提交 `e19cc83cb965bdef18cb31423d81f60140c9e7be`
- [[decimal-js]] —— 同作者、按有效数字约束全部运算的对照
- 类型（不在本仓）：[DefinitelyTyped/big.js](https://github.com/DefinitelyTyped/DefinitelyTyped)

## 关联

- [[decimal-js]] —— 有效数字 / 全运算取整 / 超越函数 对照组
- [[date-fns]] —— 另一类“合同很窄、不发明重量级包装”的工具
- [[lodash]] —— 通用工具，不提供十进制类型
- [[zod]] —— 可以校验数字字符串，但不做任意精度运算

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
