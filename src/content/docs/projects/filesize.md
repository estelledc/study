---
title: filesize — 默认按 SI 把字节收成可读单位
description: 对照 filesize 11.0.22 源码，看默认 1000 进制如何得到 '1.02 kB'，以及 IEC / JEDEC、partial 和 TypeError 边界。
来源: https://github.com/avoidwork/filesize.js
日期: 2026-08-27
分类: projects / 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/avoidwork/filesize.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3fa24e10d1bdf8d864ce6decac578bf617162315
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.0.22
---

## 是什么

filesize 是一个把字节数收成人类可读单位的格式化函数。它不解析 `'1KB'` 这种字符串。日常类比：超市价签打印机——你只喂克数，它按标尺选出「kg」还是「g」，默认那把尺是 **1000**，不是电脑内存那把 1024。

固定 `11.0.22` 是 ESM 包：`import` 走 `dist/filesize.js`，`require` 走 `dist/filesize.cjs`。源码在 `src/filesize.js`，类型在 `types/filesize.d.ts`。

```js
import { filesize, partial } from "filesize";

filesize(1024); // "1.02 kB"
filesize(1024, { standard: "iec" }); // "1 KiB"
```

非法数字抛 `TypeError("Invalid number")`，不是返回 `null`。

## 为什么重要

默认值和 [[bytes]] 正好反着来，只看 README 的「lightweight」会把两套合同叠在一起：

- 为什么 `filesize(1024)` 是 `"1.02 kB"`——fallback 是十进制 1000 + JEDEC 符号表，并在 `e===1` 时改写成 SI 的 `kB`
- 为什么 `standard: "si"` 的 1e6 是 `"1 MB"` 而不是 `"1 mB"`——SI 只特判 kilo，更高档仍用 JEDEC 字母
- 为什么 `partial({ standard: "iec" })` 可以反复调用——它先克隆 options，再闭包回 `filesize`
- 为什么 `filesize("nope")` 会炸——`Number` 之后立刻检查 `isNaN` / `isFinite`

## 核心要点

固定版本的主链是：

1. **先规范化输入**：`bigint` 只做 `Number(arg)`；其它类型转数字后，非有限值抛错。`roundingMethod` 必须是 `Math` 上的函数，否则抛 `Invalid rounding method`。

2. **再解析标尺**：`getBaseConfiguration(standard, base)`。`si` → 1000 + JEDEC 符号；`iec` → 1024 + `KiB`；`jedec` → 1024 + `KB`；空 standard 且 `base!==2` 时与 SI 同路。未知 standard 也回落这条默认路。

3. **算指数再进位**：`calculateExponent` 用 `log(num)/log(1000|1024)`，夹到 `[0, 8]`。`calculateOptimizedValue` 查预计算幂表；`bits: true` 先乘 8，必要时再升一档。`applyRounding` 在值刚好等于 `ceil` 时进位（`1024` IEC → `"1 KiB"`）。

4. **最后才装饰输出**：`resolveSymbol`、locale / separator / pad、`fullform` 单复数，再按 `output` 返回 string / array / object / exponent。`exponent` 模式等 rounding 全部做完才返回，和 object 的 `exponent` 对齐。

## 实践示例

### 案例 1：三种 standard 对 1024 的分歧

```js
import { filesize } from "filesize";

filesize(1024);                      // "1.02 kB"
filesize(1024, { standard: "si" });  // "1.02 kB"
filesize(1024, { standard: "iec" }); // "1 KiB"
filesize(1024, { standard: "jedec" }); // "1 KB"
filesize(1000, { standard: "si" });  // "1 kB"
```

默认和 `si` 都把 1024 当成 1.024×10³，四舍五入到 2 位是 `1.02`。IEC / JEDEC 用 1024 当一档。

### 案例 2：partial 预置标尺

```js
import { partial } from "filesize";

const iec = partial({ standard: "iec", round: 1 });
iec(1024);  // "1 KiB"
iec(1536);  // "1.5 KiB"
```

`partial` 用 `structuredClone`（失败则 `JSON.parse(JSON.stringify)`）复制 `localeOptions` / `symbols` / `fullforms`，避免后续改对象污染已生成的 formatter。

### 案例 3：输出形状和零值

```js
filesize(1536, { output: "array" });
// [1.54, "kB"]

filesize(1536, { output: "object" });
// { value: 1.54, symbol: "kB", exponent: 1, unit: "kB" }

filesize(0);           // "0 B"
filesize(0, { bits: true }); // "0 bit"
filesize(0.5);         // "1 B"
```

`e===0` 时 rounding 的 `p` 是 1，`Math.round(0.5)` 变成 `1`。这不是文档里的「精确到半字节」。

## 踩过的坑

1. **默认不是 1024 / `KB`**：那是 [[bytes]] 和 `standard: "jedec"`。裸调用走 1000 + `kB`。
2. **`standard: "si"` 不是整表 SI 符号**：`e===1` 用 `kB`/`kbit`，更高档仍是 `MB`/`GB` 这套 JEDEC 字母。
3. **非法输入会抛**：`NaN`、`Infinity`、`'invalid'`、`{roundingMethod:'nope'}` 都是 `TypeError`。不要按 bytes 的 `null` 去接。
4. **bigint 溢出不会在这一层拦住**：`bigint` 分支不做 `isFinite`。超大 bigint 变成 `Infinity` 后仍可能继续算。本页未实测这条路径。
5. **README 的 coverage / 性能数字不是本页证据**：未跑 `node --test`，也未跑 `benchmarks/`。

## 适用 vs 不适用场景

**适用**：

- UI / CLI 要把字节数印成带空格的可读串
- 需要在 SI / IEC / JEDEC 之间显式切换
- 需要 `partial` 生成固定标尺的 formatter，或 `output: "object"`

**不适用**：

- 要解析 `'5mb'` 这类输入字符串 → [[bytes]]
- 运行时低于 Node 10.8，或必须纯 CJS 单文件无构建物
- 要把「零依赖 / 更快」写成已验证的选型结论
- 需要精确保留 `0.5` 字节而不是让 `e===0` 的 `round` 进到 `1`

## 固定版本边界

- 本文绑定 `avoidwork/filesize.js@3fa24e10...`。annotated tag `11.0.22` 解引用到该提交，与 npm `filesize@11.0.22` 的 `gitHead` 一致。
- 许可是 BSD-3-Clause。`engines.node` 为 `>= 10.8.0`。
- 未安装依赖、未跑测试或 rollup，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认标尺写在 fallback 里**——空 `standard` 不是「自动猜磁盘还是内存」，而是十进制 + JEDEC 符号。
2. **SI 在这个版本是特判，不是另一张完整表**——只有 kilo 改写成 `kB`。
3. **进位发生在三处**——bits 乘 8 后、rounding 碰到 `ceil`、precision 冒出科学计数法。
4. **失败合同是异常**——和 [[bytes]] 的 `null` 不能互换。

## 应用型自测

1. `filesize(1024)` 是 `"1 KB"` 还是 `"1.02 kB"`？
2. `filesize("nope")` 会返回 `null` 吗？
3. `filesize(0.5)` 是 `"0.5 B"` 吗？

检查点：

1. `"1.02 kB"`。默认 1000 进制，1024/1000 再保留两位。
2. 不会。`Number("nope")` 是 `NaN`，抛 `TypeError`。
3. 不是。`e===0` 时 `Math.round(0.5)` 得到 `"1 B"`。

## 延伸阅读

- 固定源码：[avoidwork/filesize.js](https://github.com/avoidwork/filesize.js) —— 本文绑定 `3fa24e10d1bdf8d864ce6decac578bf617162315`
- 审查记录：仓库内 `docs/size-format-source-review-20260827-ew.md`
- [[bytes]] —— 双向 parse/format，只做 1024 + `KB`
- 站点文档：[filesizejs.com](https://filesizejs.com)（非本页绑定证据）

## 关联

- [[bytes]] —— 同赛道的双向 1024 解析器
- [[lodash]] —— 工具函数风格对照，不管单位制
- [[date-fns]] —— 另一类「纯函数格式化」，对象是时间不是字节

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
