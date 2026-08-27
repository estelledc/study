---
title: ora — 终端 spinner 用同一行擦写加上流拦截
来源: 'https://github.com/sindresorhus/ora'
日期: 2026-08-27
分类: 命令行工具
难度: 初级
description: "介绍 ora 9.4.1 如何用 stderr 动画、stdio hook 和 TTY 检测在同一行上画 spinner。"
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/ora
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 79cd8c15ac34572cffb3ab53e3d4b6bab6d59ea8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.4.1
---

## 是什么

ora 是一个 **Node.js 终端 spinner**：在同一行反复擦掉再写下一帧，让“正在做事”变成动画。日常类比：像翻页动画书，但翻页发生在**当前这一行**，而且默认画在 stderr，免得污染 stdout 里的可解析输出。

```js
import ora from "ora";

const spinner = ora("Loading").start();
spinner.succeed("Done");
```

`start()` 在可交互 TTY 上隐藏光标、按 interval 重绘；`succeed()` 停动画，留下 `log-symbols` 的成功符号和一行持久文本。

## 为什么重要

不理解 ora 的启用条件和流拦截，下面这些事都解释不通：

- 为什么 CI 日志里有时只出现一行 `- Loading`，有时却刷满 ANSI
- 为什么默认不往 stdout 写，业务 `console.log` 却仍能和动画错开
- 为什么两个 spinner 同时 `start()` 会警告视觉损坏
- 为什么 Ctrl+C 时还要处理 stdin discarder，而不只是停 setInterval

## 核心要点

固定 9.4.1 的主链在单文件 `index.js`：

1. **默认选项**：`color: 'cyan'`、`stream: process.stderr`、`discardStdin: true`、`hideCursor: true`、`isSilent: false`。未传 `isEnabled` 时用 `isInteractive({stream})`。

2. **帧与间隔**：Unicode 终端默认 `cli-spinners.dots`，否则 `line`。`interval` 取构造选项，否则 spinner 自带 interval，再否则 100ms。`frame()` 按间隔推进帧索引，并用 chalk 给帧上色。

3. **`start()` 分三条路**：`isSilent` 直接返回；未启用时写一行静态 `- text` 加换行；启用时隐藏光标、在 TTY stdin 上启动 `stdin-discarder`、钩住当前 stream 以及 `process.stdout`/`stderr`，再 `setInterval(render, interval)`。

4. **渲染与让路**：TTY 下用 CSI `?2026` 同步输出；内容高于 `stream.rows` 会截断；`write` 返回 false 就等 `drain`。外部 write 先 `clear()` 再放行；不以 `\n`/`\r` 结尾的 chunk 会把重绘推迟 200ms。

## 实践示例

### 案例 1：最小用法，默认画在 stderr

```js
import ora from "ora";

const spinner = ora("Loading unicorns").start();
await doWork();
spinner.succeed("Found unicorn");
```

**逐部分**：

- `ora(text)` 把字符串收成 `{ text }`；默认 stream 是 `process.stderr`
- `.start()` 在交互终端开动画；`.succeed()` 走 `stopAndPersist({ symbol: logSymbols.success })`
- 链式返回 `this`，所以可以 `ora("x").start()`

### 案例 2：oraPromise 包住成功/失败

```js
import { oraPromise } from "ora";

await oraPromise(fetch("/api/data"), {
  text: "Fetching data",
  successText: "Got data",
  failText: "Network error",
});
```

**逐部分**：`action` 必须是 Promise 或 `function(spinner)`。resolve 调 `succeed`（或自定义 `successSymbol`），reject 调 `fail` 后**原样再抛**。spinner 只是副作用，错误处理仍归调用方。

### 案例 3：非 TTY 时显式关掉动画

```js
const spinner = ora({
  text: "Building",
  isEnabled: Boolean(process.stderr.isTTY),
  stream: process.stderr,
}).start();
```

**逐部分**：不传 `isEnabled` 时 ora 已用 `is-interactive` 判断。强制 `true` 会在重定向日志里写下 ANSI。`isSilent: true` 则连静态那一行都不写。

## 踩过的坑

1. **以为默认写 stdout**：9.4.1 默认 stream 是 stderr。把 spinner 和机器可读结果都打到 stdout，会把动画帧和 JSON 缠在一起。

2. **`isEnabled: true` 灌进 CI**：检测被关掉后，每一帧的 CSI/擦行码都会进日志。要动画受环境约束，别覆盖 `isEnabled`，或显式跟 TTY 走。

3. **同时 start 两个 spinner**：同一 stream 上已有 hook 时，第二个实例会 `console.warn` 并发损坏。多任务进度应换成 [[listr2]]，或保证同一时间只有一个 ora。

4. **自己写 spinner 却不恢复光标 / 不丢弃 stdin**：ora 默认 `hideCursor` + `discardStdin`。`stop()` 会 `cliCursor.show` 并 `stdinDiscarder.stop()`。手写 interval 忘挂钩子，终端会留下隐形光标或把按键当 stdin 数据。

## 适用 vs 不适用场景

**适用**：

- Node CLI 里一个长时间任务需要“还在跑”的视觉反馈
- 希望成功/失败/警告/信息留下一行持久符号
- 输出主体走 stdout、动画走 stderr 的 Unix 习惯
- 满足 package 边界：Node >=20，纯 ESM

**不适用**：

- CI / 文件重定向还要强制动画——应保持 `is-interactive` 或 `isSilent`
- 需要百分比进度条而不是不定长 spinner——换进度条库，不要硬改 ora
- 多任务并行树——用 [[listr2]]
- 要给下游库当轻依赖——ora 依赖 chalk、cli-spinners、log-symbols 等一串包；作者另有更瘦的 yoctospinner

## 固定版本边界

- 本文绑定 `sindresorhus/ora@79cd8c15...`，即 tag `v9.4.1`，package 版本 `9.4.1`；npm `gitHead` 与 tag 剥开后的提交一致。
- `color` 只接受 `black/red/green/yellow/blue/magenta/cyan/white/gray` 或 `false`；非法值抛错。
- 并发 hook 只警告，不阻止第二个 spinner 启动。
- `oraPromise` 的 `successText` / `failText` 可以是字符串或函数；失败路径重新抛出原错误。
- 本文未安装依赖、未跑上游测试、未在真实 TTY/CI 对比渲染，状态保持 `UNVERIFIED`。

## 学到什么

1. **终端动画是擦行 + 定时重写，不是图形 API**——ora 把这件事收成可停、可持久化的对象
2. **副作用默认走 stderr**，才能保住 stdout 的可解析性
3. **启用条件必须和环境绑定**：TTY、silent、interactive 是三种不同的“别画动画”
4. **拦截 stdio 是为了和 `console.log` 共处**，不是为了偷偷丢掉用户输出

## 应用型自测

1. `ora("Loading").start()` 默认往 stdout 还是 stderr 写帧？
2. `isSilent: true` 时调用 `succeed("done")`，屏幕上会留下成功符号吗？
3. `oraPromise` 里 promise reject 之后，错误还会抛到外层吗？

检查点：

1. stderr。构造默认 `stream: process.stderr`。
2. 不会。`stopAndPersist` 在 silent 模式下直接返回，不写持久行。
3. 会。fail/自定义 failSymbol 之后 `throw error`，spinner 不吞异常。

## 延伸阅读

- 官方 README：[github.com/sindresorhus/ora](https://github.com/sindresorhus/ora)
- 固定源码：[sindresorhus/ora](https://github.com/sindresorhus/ora) —— 本文绑定提交 `79cd8c15ac34572cffb3ab53e3d4b6bab6d59ea8`
- [cli-spinners](https://github.com/sindresorhus/cli-spinners) —— 帧数据来源
- [yoctospinner](https://github.com/sindresorhus/yoctospinner) —— 同作者的更瘦替代，对照依赖面
- [[consola]] —— CLI 日志对象层，和 ora 的单行动画互补
- [[chalk]] —— ora 给帧上色用的库

## 关联

- [[consola]] —— 同一层 CLI-UX 的 logger；ora 管动画，consola 管日志对象
- [[chalk]] —— 给 spinner 帧上色
- [[listr2]] —— 多任务树状进度，内部可以接 spinner
- [[boxen]] —— 给终端文本加框，常和 CLI 启动横幅一起用
- [[commander]] —— 参数解析；长任务 handler 里常配 ora
- [[clack]] —— 现代 prompt；进度/多步向导比单行 spinner 更合适

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[consola]] —— consola — 把 console 收成可切换 reporter 的 CLI 日志层
- [[listr2]] —— listr2 — 把 CLI 任务跑成一棵会自己画进度的树
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准
