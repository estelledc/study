# Decimal-math source review (writer IX)

> 用途：记录 decimal.js、big.js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IX
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、minify 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## decimal.js

- canonical source：`https://github.com/MikeMcl/decimal.js`
- revision：`1a6e845004b29a3b7dcef78fe92b8d786634f4e2`
- package：`decimal.js@10.6.0`（源码 tag `v10.6.0`）
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `decimal.js`（DEFAULTS、constructor、clone、config/set、plus、times、dividedBy、parseDecimal、bigint 分支）
  - `decimal.d.ts`（`Decimal.Value` 含 bigint）
- observed：
  - source `package.json` version is `10.6.0`; `exports` map import to `decimal.mjs` and require to `decimal.js`;
  - `DEFAULTS` set `precision: 20`, `rounding: 4`, `modulo: 1`, `toExpNeg: -7`, `toExpPos: 21`, `minE`/`maxE` `±9e15`, `crypto: false`;
  - `Decimal(v)` without `new` returns `new Decimal(v)`;
  - number / string / bigint / Decimal are accepted; small integers `< 1e7` use a fast path;
  - `plus` / `times` / `div` finalize to constructor `precision` when `external` is true;
  - digits use `BASE = 1e7`; public fields are `d`, `e`, `s`;
  - `clone` copies constructor config and can override it.
- provenance split：
  - npm `decimal.js@10.6.0` reports `gitHead=f1ee2f404d6bf96d59c04db80c1f404742afa3fa`;
  - that commit is not advertised by the canonical GitHub remote (`upload-pack: not our ref`);
  - this review binds the reachable source tag `v10.6.0` peeled commit, not the npm `gitHead`.

## big.js

- canonical source：`https://github.com/MikeMcl/big.js`
- revision：`e19cc83cb965bdef18cb31423d81f60140c9e7be`
- package：`big.js@7.0.1`
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `big.js`（editable defaults、`_Big_`、`Big` constructor、parse、plus、times、div、mod、pow、toNumber、strict）
- observed：
  - tag `v7.0.1^{}`, package version and npm `gitHead` identify the same commit;
  - `exports` select `big.js` for require and `big.mjs` for import; `files` are only those two scripts;
  - defaults are `DP=20`, `RM=1`, `NE=-7`, `PE=21`, `strict=false`;
  - `Big()` with no arguments returns a new constructor from `_Big_()`;
  - `plus` / `minus` / `times` keep the exact result; `div`, `sqrt`, and negative-exponent `pow` read `DP`/`RM`;
  - `mod` temporarily sets `DP=RM=0`, divides, then `minus(times)`;
  - coefficient `c` is a base-10 digit array;
  - `strict` rejects primitive numbers (except bigint) and imprecise `toNumber`.
