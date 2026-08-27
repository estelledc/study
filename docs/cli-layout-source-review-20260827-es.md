# CLI layout source review (writer ES)

> 用途：记录 `boxen`、`wrap-ansi` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-es` 标记 2026-08-27 平行 writer ES，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer ES
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与类型声明阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test / xo / tsd / nyc / `node --test`，未测 bundle、终端渲染或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- pair：`boxen` 是既有页迁移；`wrap-ansi` 是本轮新增 slug，因为仓库原先没有独立页
- excluded slugs：未改 `chalk`、`ora`、`ink`、`cli-boxes`、`string-width`

## boxen

- canonical source：`https://github.com/sindresorhus/boxen`
- revision：`52bbd6a57e92ea0dac762677d21ab5787a8abc39`
- git tag：annotated `v8.0.1` 解引用到该提交（"8.0.1"）
- package：`boxen@8.0.1`
- npm：`boxen@8.0.1` latest，`gitHead` 与 tag 提交一致
- also observed：`origin/main` HEAD `af0098901175156af7829cbf24259df1dcb8e41d`（"Fix slicing of titles (#105)"）在 tag 之后，未绑定
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `example.js`
- observed：
  - ESM-only（`type: module`），`engines.node >= 18`，默认导出 `boxen(text, options?)`，另再导出 `_borderStyles`（来自 `cli-boxes`）；
  - 默认 `padding: 0`、`borderStyle: 'single'`、`textAlignment: 'left'`、`float: 'left'`、`titleAlignment: 'left'`；数字 `padding`/`margin` 经 `getObject` 把左右扩成上下的 3 倍；
  - 主链是 `sanitizeOptions` / `determineDimensions` → `makeContentText` → `boxContent`；内容溢出时对每行调用 `wrapAnsi(line, max, {hard: true})`，测宽时用 `wrapAnsi(text, columns - borderWidth, {hard: true, trim: false})`；
  - 列宽来自 `stdout.columns` → `stderr.columns` → `env.COLUMNS` → `80`；`fullscreen` 读 `process.stdout.columns/rows`，也可传入回调改尺寸；
  - 固定 `width` 会关掉终端溢出收缩；固定 `height` 会裁切多余行；
  - `title` 在 8.0.1 用 `String#slice` 按 JS 字符串长度截断，不是 `string-width`；tag 之后的 #105 未纳入本页；
  - 源码不读取 `NO_COLOR`；边框/背景色走 `chalk` 的具名色或 hex；
  - 依赖声明 `wrap-ansi: ^9.0.0`，不会自动吃进 v10。
- provenance：
  - Git tag `v8.0.1`、npm `boxen@8.0.1` `gitHead` 与仓库 `package.json` 版本一致；
  - 身份是 tag + package version + commit SHA。

## wrap-ansi

- canonical source：`https://github.com/chalk/wrap-ansi`
- revision：`c6b6259a58843e491e8703c5010a2a517b5f5738`
- git tag：annotated `v10.0.1` 解引用到该提交（"10.0.1"）
- package：`wrap-ansi@10.0.1`
- npm：`wrap-ansi@10.0.1` latest，`gitHead` 与 tag 提交一致
- companion not bound：`wrap-ansi@9.0.2` → `cf1d1e65e9bc23c7e621f23a3418730fb46a17ea`（boxen 8.0.1 的 semver 范围，本页审查 v10）
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
- observed：
  - ESM-only，`engines.node >= 20`；依赖 `ansi-styles` 与 `string-width`，不再依赖 `strip-ansi`；
  - 入口先 `String(string).normalize()`，把 `\r\n` 换成 `\n`，按行 `split`，每行先把 tab 扩成 8 列 tab stop，再 `exec`；
  - 默认 soft wrap（`hard: false`）、`wordWrap: true`、`trim: true`；`hard: true` 才保证可见宽度不超过 `columns`；
  - 注释写明支持边界：分号分隔 SGR、冒号分隔 RGB/256 色、OSC 8 超链接；不是完整终端模拟器；
  - 换行前关闭活动 SGR / 超链接，下一行再打开，让每行可独立显示；
  - 可见宽度走 `string-width`（先剥完整序列）；非 ASCII 用 `Intl.Segmenter` 按 grapheme 切，ASCII 可打印走快路径。
- provenance：
  - Git tag `v10.0.1`、npm `wrap-ansi@10.0.1` `gitHead` 与仓库 `package.json` 版本一致；
  - 身份是 tag + package version + commit SHA。
