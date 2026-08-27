# Terminal UI source review (writer BP)

> 用途：记录 ink、blessed 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BP
- evidence：GitHub release/tag metadata、npm latest 版本号、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、TUI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：开放 PR 已占用的页面，以及 `react-hook-form`、`tanstack-form`、`mcp-ts-sdk`、`ollama`、`aichat`、`shell-gpt`

## ink

- canonical source：`https://github.com/vadimdemedes/ink`
- revision：`70af033dbd2b126a16f144164685612b2c1fd554`
- package：`ink@7.1.1`
- tag：`v7.1.1`（指向上述 commit）
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/render.ts`
  - `src/ink.tsx`
  - `src/reconciler.ts`
  - `src/renderer.ts`
  - `src/styles.ts`
  - `src/measure-text.ts`
  - `src/log-update.ts`
  - `src/components/Box.tsx`
  - `src/hooks/use-input.ts`
  - `test/hooks-use-input.tsx`
  - `readme.md`
- observed：
  - ESM package，`engines.node` 为 `>=22`；peer 要求 `react >=19.2.0`；生产依赖含 `react-reconciler`、`yoga-layout`、`widest-line`、`chalk`；
  - `render()` 默认 `maxFps=30`、`incrementalRendering=false`、`concurrent=false`、`alternateScreen=false`、`patchConsole=true`、`exitOnCtrlC=true`；
  - 同一 `stdout` 只保留一个 live instance；未 `unmount()` 再次 `render()` 会写 stderr 警告并复用旧实例；
  - `concurrent` 为假时 `createContainer(..., LegacyRoot)`，为真时用 `ConcurrentRoot`；
  - 布局把 root yoga 宽度设为 terminal columns，再 `calculateLayout(..., DIRECTION_LTR)`；
  - `<Box>` 默认 `flexDirection: 'row'`、`flexShrink: 1`、`flexWrap: 'nowrap'`；`minWidth`/`maxWidth` 百分比尚未支持；
  - `measure-text` 用 `widest-line` 量最宽行，高度按换行数；
  - `useInput` 打开 raw mode，经 `parseKeypress` 分发；Ctrl+C 在 `exitOnCtrlC` 时不进业务 handler；输入更新走 `reconciler.discreteUpdates`；
  - CI 或非 TTY 默认非交互：不擦屏、不操作光标，只在 unmount 写最后一帧。
- provenance：
  - GitHub latest release 与 npm latest 均为 `7.1.1`；
  - npm tarball `gitHead` 与 tag commit `70af033d...` 一致。

## blessed

- canonical source：`https://github.com/chjj/blessed`
- revision：`a45575fee63fac158fd467087ec172f657bfec6b`
- package：`blessed@0.1.81`
- tag：`v0.1.81`（指向上述 commit）
- inspected：
  - `package.json`
  - `lib/blessed.js`
  - `lib/widget.js`
  - `lib/program.js`
  - `lib/widgets/node.js`
  - `lib/widgets/screen.js`
  - `lib/widgets/element.js`
  - `lib/widgets/list.js`
  - `lib/unicode.js`
  - `README.md`
- observed：
  - CommonJS，无生产 `dependencies`，`engines.node` 为 `>= 0.8.0`，入口 `lib/blessed.js`；
  - 顶层同时挂 `program`/`tput` 与 widget 类；`widget.classes` 列出 Screen、Box、List、Form 等 36 个组件；
  - `Node` 继承自内部 EventEmitter，维护 `parent`/`children`，无 Screen 时构造会抛错；
  - `Screen` 默认创建带 `tput`、`buffer`、`zero` 的 `Program`；`render()` 先让每个 child `el.render()`，再 `draw(0, lines.length-1)`；
  - `Element` 用 `left/right/top/bottom/width/height` 定位，`center` 会改写成 `50%`；
  - `List` 是可滚动 Box，维护 `selected`；`options.keys` 下 up/down（vi 时 j/k）改选中项并 `screen.render()`；
  - `unicode.js` 处理东亚宽度与 surrogate pair；README 自称用 CSR/BCE 与 damage buffer 只重画变化。
- provenance：
  - GitHub 无 Releases 页；唯一近期稳定 tag 与 npm latest 均为 `0.1.81`；
  - npm tarball `gitHead` 与 tag commit `a45575fe...` 一致；
  - 该 tag 提交日期为 2015-09-02；本审查绑定这份仍在发布的包，不猜测后续未打 tag 的 master 提交。
