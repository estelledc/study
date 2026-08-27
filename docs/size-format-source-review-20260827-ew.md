# Size-format source review (writer EW)

> 用途：记录 `bytes`、`filesize` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ew` 标记 2026-08-27 平行 writer EW，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EW
- evidence：GitHub metadata、npm package metadata、固定提交静态源码、类型声明与测试阅读
- not executed：未安装两仓依赖，未运行 mocha / node:test、rollup、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- slugs：`bytes`、`filesize`；二者都不在原清单中，本轮是新建而不是改写既有正文

## bytes

- canonical source：`https://github.com/visionmedia/bytes.js`
- revision：`9ddc13b6c66e0cb293616fba246e05db4b6cef4d`
- git tag：lightweight `3.1.2`（"Release 3.1.2"）
- package：`bytes@3.1.2`
- license：MIT
- engines：`node >= 0.8`
- inspected：
  - `package.json`
  - `index.js`
  - `Readme.md`
  - `History.md`
  - `test/bytes.js`
  - `test/byte-parse.js`
  - `test/byte-format.js`
- observed：
  - CommonJS 单文件：default `bytes(value, options)` 按 `typeof` 分发给 `parse` / `format`，其它类型返回 `null`；
  - 单位表是 1024 幂：`kb/mb/gb` 用 `1 << n`，`tb/pb` 用 `Math.pow(1024, 4/5)`（避免 32-bit 移位溢出）；没有 SI 1000 或 IEC `KiB` 入口；
  - `parseRegExp` 只捕获 `kb|mb|gb|tb|pb`，**不**捕获裸 `b` / `KiB`；未匹配时走 `parseInt(val, 10)` 并假定单位 `b`，所以 `'1.1b'` / `'1.5B'` 会丢掉小数，`'0x11'` 得到 `0`，`'1kib'` 得到 `1`；
  - 数字输入的 `parse` 原样返回（`10.5` 仍是 `10.5`），字符串路径最后 `Math.floor`；
  - `format` 对非有限数返回 `null`；默认 `decimalPlaces=2`、`fixedDecimals=false`，用正则剥掉尾零；自动单位阈值是 1024，故 `1000` 仍是 `'1000B'`；
  - 发布物只有 `index.js`，没有 types / ESM exports。
- provenance：
  - npm `bytes@3.1.2` `gitHead`、GitHub tag `3.1.2` 与该提交一致；
  - History 将 `3.1.2` 记在 2022-01-27。

## filesize

- canonical source：`https://github.com/avoidwork/filesize.js`
- revision：`3fa24e10d1bdf8d864ce6decac578bf617162315`
- git tag：annotated `11.0.22` 解引用到该提交（"chore: build v11.0.22 artifacts (#314)"）
- package：`filesize@11.0.22`
- license：BSD-3-Clause
- engines：`node >= 10.8.0`
- inspected：
  - `package.json`
  - `src/filesize.js`
  - `src/helpers.js`
  - `src/constants.js`
  - `types/filesize.d.ts`
  - `README.md`
  - `tests/unit/filesize.test.js`
  - `tests/unit/filesize-helpers.test.js`
  - `tests/unit/filesize-structuredclone-fallback.test.js`
- observed：
  - ESM 包，条件 exports：`import` → `dist/filesize.js`，`require` → `dist/filesize.cjs`，types 指向 `types/filesize.d.ts`；源码入口是 `src/filesize.js`；
  - 默认 `standard=""`、`base=-1` 走 `getBaseConfiguration` 的 fallback：`isDecimal=true`、`ceil=1000`、`actualStandard=jedec`；因此 `filesize(1024)` 是 `"1.02 kB"`，不是 `"1KB"`；
  - `standard: "si"` 仍用 JEDEC 符号表，仅在 `e===1` 时改写成 `kB` / `kbit`；`iec` 用 1024 + `KiB`；`jedec` 用 1024 + `KB`；未知 `standard` 回落到默认 SI 路径；
  - 非法数字 / 非有限值 / 非法 `roundingMethod` 抛 `TypeError`，不返回 `null`；`bigint` 分支只做 `Number(arg)`，不再跑 `isFinite`；
  - `output` 为 `string` / `array` / `object` / `exponent`；`exponent` 在 rounding / bits 进位 / precision 之后才返回，与 object 的 `exponent` 对齐；
  - `partial` 用 `structuredClone`（失败则 JSON）克隆 `localeOptions` / `symbols` / `fullforms`，返回一元 formatter；
  - 零值走 `handleZeroValue`；`filesize(0.5)` 在 `e===0` 时 `p=1`，`Math.round(0.5)` 得到 `"1 B"`。
- provenance：
  - npm `filesize@11.0.22` `gitHead` 与 annotated tag 解引用提交一致。
