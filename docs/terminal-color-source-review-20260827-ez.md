# Terminal color source review (writer EZ)

> 用途：记录 `kleur` 与 `yoctocolors` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ez` 标记 2026-08-27 平行 writer EZ，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EZ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：`STATIC_REVIEW` / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、benchmark、TTY 探测或性能对比
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- excluded slugs：未改 `chalk`，也未新增 `picocolors` / `colorette` / `ansi-colors` / `yoctocolors-cjs`

## kleur

- canonical source：`https://github.com/lukeed/kleur`
- tag：`v4.1.5`
- revision：`fa3454483899ddab550d08c18c028e6db1aab0e5`
- package：`kleur@4.1.5`（MIT，`engines.node >=6`）
- provenance：npm latest `gitHead` 与 GitHub tag `v4.1.5` 同指该提交；工作区 `package.json` 版本为 `4.1.5`
- inspected：
  - `package.json`
  - `index.mjs`
  - `colors.mjs`
  - `index.d.ts`
  - `colors.d.ts`
  - `build/index.js`
  - `test/index.js`
  - `test/colors.js`
  - `test/utils.js`
  - `test/env.sh`
  - `readme.md`
- observed：
  - 默认导出是带 `enabled` 的对象 `$`；每个样式是 `init(open, close)` 返回的函数。无参调用走 `chain()` 累积 `has`/`keys`，有参则 `run()` 包字符串；
  - `run()` 按 styles 数组顺序拼接 open，再按同一顺序拼接 close，不是内层先关；
  - 嵌套时若原文已含某层 `close`，用 `close + open` 替换，把外层样式重新打开；
  - `kleur/colors` 导出同名独立函数，不可链式；`txt == null` 原样返回；开关在 `$.enabled`；
  - 初始 `enabled` 为 `!NODE_DISABLE_COLORS && NO_COLOR == null && TERM !== 'dumb' && (FORCE_COLOR != null && FORCE_COLOR !== '0' || isTTY)`。`NO_COLOR` 空字符串也会关掉；`NODE_DISABLE_COLORS` / `NO_COLOR` / `TERM=dumb` 压过 `FORCE_COLOR`；TTY 上 `FORCE_COLOR=0` 仍可能着色；
  - 样式表只有 16 色前景、8 个背景、7 个 modifier；`gray`/`grey` 都是 SGR 90；没有 bright、truecolor、256 或 `bgGray`；
  - CJS `index.js` / `colors.js` 由 `build/index.js` 把 ESM `export` 替换成 `module.exports` / `exports.`；该 tag 的 Git 树里没有这两份生成文件；
  - README History 写明 `kleur@3.0` 起不再用 chalk 式 getter，链式必须 `red().bold()`。
- provenance note：
  - 本页绑定 tag / npm `gitHead` 同一 revision；未把 README 的 Node v10 加载时间或 ops/sec 写成当前测量。

## yoctocolors

- canonical source：`https://github.com/sindresorhus/yoctocolors`
- tag：`v2.2.0`
- revision：`a02a16ec36fbd58a0848e95598fb4913c54c7591`
- package：`yoctocolors@2.2.0`（MIT，`type: module`，`engines.node >=18`）
- provenance：npm latest `gitHead` 与 GitHub tag / release `v2.2.0` 同指该提交；工作区 `package.json` 版本为 `2.2.0`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `base.js`
  - `base.d.ts`
  - `test.js`
  - `fixture.js`
  - `readme.md`
- observed：
  - `index.js` 只做 `export *` 与 `export * as default`；实现全在 `base.js`；
  - 颜色开关在模块加载时调用一次 `tty?.WriteStream?.prototype?.hasColors?.() ?? false`，之后没有 `enabled` 开关；
  - `hasColors === false` 时 `format()` 返回恒等函数，输入原样返回；为 true 时用 `input + ''` 强制成字符串，再用 `indexOf` 循环处理嵌套 close；
  - close 码为 22（`bold`/`dim`）时，替换片段是 `close + open`；其余样式只插入外层 `open`。测试写明 `red(\`Error: ${yellow('Warning')} continues in red\`)` 的中间重置是 `\x1b[31m` 而不是 `\x1b[39m\x1b[31m`；
  - 除基础 16 色和背景外，还有 bright、`bgGray`、`overline`、SGR `4:2`–`4:5` 下划线变体，以及 `58;5;n` / `59` 的 underline color；没有 `grey` 别名，也没有链式 API；
  - README 把 CommonJS 指向独立包 `yoctocolors-cjs`；本仓是 ESM-only，本轮未打开该兄弟包；
  - `FORCE_COLOR` / `NO_COLOR` / `NODE_DISABLE_COLORS` 走 Node `hasColors` 合同；测试用 `FORCE_COLOR=0` 子进程验证恒等输出。
- provenance note：
  - 本页绑定 2.2.0 稳定标签；未运行 `benchmark.js`，也未把 README 表格里的 ops/sec 写成选型结论。
