# CLI progress source review (writer EM)

> 用途：记录 `listr2` 与 `log-update` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-em` 标记 2026-08-27 平行 writer EM。`ora` 已被 Study CX（consola + ora）占用，本轮不改 `ora` 页。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EM
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与类型声明阅读
- not executed：未安装两仓依赖，未运行上游 test / xo / tsd，未在真实 TTY 上观察重绘，未测 bundle 或帧率
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`listr2` 为既有页迁移；`log-update` 为新建页（仓库原先没有独立笔记）

## listr2

- canonical source：`https://github.com/listr2/listr2`
- git tag：`listr2@11.0.1`（lightweight，指向同一 SHA）
- revision：`da0f4383f98214a3bc0e6af2f9f9949e6337ce0a`
- package：npm `listr2@11.0.1` `gitHead` 与 tag 一致
- workspace note：monorepo 根 `package.json` 与 `packages/listr2/package.json` 的 `version` 字段仍是 `1.0.0`；发布身份以 tag / npm 为准，不以 workspace 占位版本为准
- engines：`node >= 22.13.0`
- dependencies（`packages/listr2/package.json`）：`cli-truncate ^6.1.1`、`log-update ^8.0.0`、`wrap-ansi ^10.0.1`
- inspected：
  - `packages/listr2/package.json`
  - `packages/listr2/CHANGELOG.md`
  - `packages/listr2/src/index.ts`
  - `packages/listr2/src/listr.ts`
  - `packages/listr2/src/lib/task.ts`
  - `packages/listr2/src/lib/task-wrapper.ts`
  - `packages/listr2/src/constants/listr-task-state.constants.ts`
  - `packages/listr2/src/interfaces/listr.interface.ts`
  - `packages/listr2/src/utils/concurrency.ts`
  - `packages/listr2/src/utils/ui/renderer.ts`
  - `packages/listr2/src/utils/ui/spinner.ts`
  - `packages/listr2/src/utils/format/color.ts`
  - `packages/listr2/src/utils/process-output/process-output.ts`
  - `packages/listr2/src/renderer/default/renderer.ts`
  - `packages/listr2/src/renderer/default/renderer.constants.ts`
  - `packages/listr2/src/renderer/simple/renderer.ts`
  - `packages/listr2/src/renderer/verbose/renderer.ts`
- observed：
  - constructor 默认 `concurrent: false`、`renderer: 'default'`、`fallbackRenderer: 'simple'`、`exitOnError: true`、`exitAfterRollback: true`、`collectErrors: false`、`registerSignalListeners: true`；
  - `concurrent === true` 变成 `Infinity`，非数字则变成 `1`；
  - `DefaultRenderer.nonTTY = false`，`SimpleRenderer` / `VerboseRenderer` / `TestRenderer` / `SilentRenderer` 为 `true`；`getRenderer` 在 `process.stdout.isTTY !== true` 时切 fallback；
  - `ListrTaskState` 初值是 `WAITING`，另有 `STARTED` / `COMPLETED` / `FAILED` / `SKIPPED` / `ROLLING_BACK` / `ROLLED_BACK` / `RETRY` / `PAUSED` / `PROMPT*` / `CANCELLED`；
  - `handleResult` 只把返回值认成 `Listr`、`Promise`、Readable stream 或 Observable；普通值会立刻结束该任务；
  - 子 `Listr` 会被换成 `silent` renderer，由父 default renderer 画树；
  - `TaskWrapper.newListr` 把当前 `Task` 当作 parent；`output = null` 走 `OUTPUT_RESET`；
  - `Concurrency` 在 rejected promise 上 `queue.clear()`，不再启动排队任务；
  - default renderer `lazy: false` 时 `Spinner.start(cb, 100)` 每 100ms 调 `createLogUpdate`；结束时 `clear()` + `done()`，再按 `clearOutput` 决定是否把最后一帧写回 stdout；
  - 颜色走 `node:util` `styleText`，不是 chalk；
  - 根实例注册持久 `SIGINT`，`abort()` 后等已启动任务 rollback，再 `process.exit(127)`。
- provenance：
  - npm `listr2@11.0.1` `gitHead`、tag `listr2@11.0.1` 与检出 SHA 三者一致；
  - CHANGELOG 11.0.0 写明 default renderer 改用 log-update v8 做 partial update。

## log-update

- canonical source：`https://github.com/sindresorhus/log-update`
- git tag：`v8.0.0`（annotated；tag object `11350d2800947726d404e6df224fa4d9f2846bba`）
- revision：`4f7a1460893a7557aee8f7202956218c3e770a5a`（annotated peel，与 npm `log-update@8.0.0` `gitHead` 一致）
- package：`log-update@8.0.0`，`type: module`，`engines.node >= 22`
- dependencies：`ansi-escapes`、`cli-cursor`、`slice-ansi`、`string-width`、`strip-ansi`、`wrap-ansi`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `example.js`
  - `example-persist-output.js`
  - `test.js`（只读，未执行）
- observed：
  - 默认导出是 `createLogUpdate(process.stdout)`；另有 `logUpdateStderr` 与 `createLogUpdate(stream, options)`；
  - 每帧先 `wrapAnsi(..., {trim:false, hard:true, wordWrap:false})`，再按 `stream.rows ?? defaultHeight ?? 24` 从顶部裁行；
  - 宽用 `stream.columns ?? defaultWidth ?? 80`；宽变化或发生高度裁剪时放弃 diff，整段 `eraseLines` 重写；
  - 宽不变且未裁剪时，对公共前缀/后缀做 `diffFrames`，用 cursorUp/Down + `eraseLine` 打补丁；公共前缀长度为 0 时同样整段擦写；
  - `stream.isTTY === true` 时用 CSI `?2026` synchronized output 包住写入；
  - `persist()` 不裁高度，擦掉上一帧后写下持久文本并 `reset()`；`done()` 只 reset 并按需恢复光标，并不把当前帧再写一遍；
  - 相同 wrapped 文本且宽度不变时直接 return。
- provenance：
  - annotated tag peel 与 npm `gitHead` 一致；未猜测未发布的后续提交。
