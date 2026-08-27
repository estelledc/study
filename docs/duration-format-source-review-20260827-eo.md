# Duration format source review (writer EO)

> 用途：记录 `ms` 与 `pretty-ms` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-eo` 标记 2026-08-27 平行 writer EO，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EO
- evidence：GitHub metadata、npm provenance 与固定提交静态源码 / 测试阅读
- not executed：未安装两仓依赖，未运行 mocha / xo / ava / tsd，未测 bundle 或性能
- worktrees：本机 `research-worktrees/ms` 与 `research-worktrees/pretty-ms`（gitignored），不进入 Git
- slugs：`ms` 与 `pretty-ms`；这两页原先不存在，本轮按用户指定目标新建，不是改写既有正文

## ms

- canonical source：`https://github.com/vercel/ms`
- tag：`2.1.3`（lightweight tag）
- revision：`1c6264b795492e8fdecbc82cb8802fcfbfc08d26`
- package：`ms@2.1.3`（MIT）
- npm：`latest` 即 `2.1.3`，`gitHead` 与 tag 一致
- also observed（未绑定）：
  - dist-tag `beta` → `3.0.0-beta.2`
  - dist-tag `canary` → `3.0.0-canary.202508261828`
  - dist-tag `nightly` → `4.0.0-nightly.202508271359`
  - 仓内 `3.0.0-canary.1` → `1304f150b38027e0818cc122106b5c7322d68d0c`
  - 当前 default branch `package.json` 自报 `4.0.0`、`type: module`、`engines.node >= 20`
- inspected：
  - `package.json`
  - `index.js`
  - `readme.md`
  - `tests.js`
- observed：
  - 单一 CJS 入口，发布物只有 `index.js`，无 `engines`、无 ESM / types；
  - 字符串走 `parse()`，有限数字走 `fmtShort` / `fmtLong`，其余抛错；
  - 解析正则只吃「可选符号 + 数字 + 可选单位」，长度超过 100 或匹配失败返回 `undefined`；
  - 年按 `d * 365.25`，周按 `d * 7`；格式化最大单位是天，不会输出 `w` / `y`；
  - long 格式用 `abs >= unit * 1.5` 决定是否加 `s`。

## pretty-ms

- canonical source：`https://github.com/sindresorhus/pretty-ms`
- tag：`v9.3.0`
- revision：`ab52d6aec3aea644a4f07ddab2928e2f39dd9941`
- package：`pretty-ms@9.3.0`（MIT）
- npm：`latest` 即 `9.3.0`，`gitHead` 与 tag 一致
- also observed（未绑定）：default branch 在 tag 之后还有 `93666b389e1ed07912b6c2466468da21d9f834ce`（FAQ 提交）
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `test.js`
- observed：
  - ESM-only，`engines.node >= 18`，依赖 `parse-ms ^4.0.0`；
  - 只接受 finite `number` 或 `bigint`，否则 `TypeError`；选项先 `{...options}` 再改写，调用方对象不被突变；
  - 年按 `days / 365n`，与 `ms` 的 365.25 天年不是同一合同；
  - `colonNotation` 会关掉 compact / formatSubMilliseconds / separateMilliseconds / verbose；
  - `compact` 强制 `unitCount=1` 且小数位为 0；`hideYear` / `hideYearAndDays` / `hideSeconds` 只改展示折叠，不改输入。
