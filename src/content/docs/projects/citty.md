---
title: citty — 用对象定义描述 CLI，再异步跑下去
description: Elegant CLI Builder：defineCommand + Resolvable 子命令 + plugin 钩子
来源: https://github.com/unjs/citty
日期: 2026-08-27
分类: CLI / 命令行工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/citty
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9cb0edcc55c133ea04d3cbb350284a9a3548946e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.2.2
---

## 是什么

citty 是一个把 CLI 写成**普通对象**、再交给 `runMain` / `runCommand` 异步执行的 TypeScript 库。日常类比：菜单不是一串链式点单，而是一张可以晚点再填的卡片——`meta`、`args`、`subCommands` 都可以是值、Promise 或函数。

固定 `0.2.2` 里，`defineCommand(def)` 只是类型助手，原样返回对象。真正干活的是 `runCommand` 和包了一层 usage / `process.exit` 的 `runMain`。

```js
import { defineCommand, runMain } from "citty"

const main = defineCommand({
  meta: { name: "hello", version: "1.0.0", description: "My CLI" },
  args: {
    name: { type: "positional", description: "Your name", required: true },
    friendly: { type: "boolean", description: "Use friendly greeting" },
  },
  run({ args }) {
    console.log(`${args.friendly ? "Hi" : "Greetings"} ${args.name}!`)
  },
})

runMain(main)
```

`runMain` 默认读取 `process.argv.slice(2)`。

## 为什么重要

不看固定执行顺序，容易把 citty 理解成“带类型的 cac”：

- 为什么父命令的 `setup` / plugin 会在子命令之前跑，README 却写“只有被执行命令的 hooks”
- 为什么 `default: 'dev'` 和 `run()` 不能写在同一层
- 为什么 `--help` 有时只剩 `--help`、没有 `-h`
- 为什么 `--version` 必须是**唯一**一个 raw arg 才打印

一句话：citty 的合同是 **Resolvable 对象图 + 先钩子后分发 + 内建 flag 可被挤掉**。

## 核心要点

固定版本可以拆成五步：

1. **定义**：`args` 支持 `positional` / `string` / `boolean` / `enum`。`alias` 不能用在 positional。
2. **解析**：`parseArgs` 先把定义编成 `node:util.parseArgs` 的选项，再经 `_parser` 处理 `--no-` 与 alias 互拷。返回值是 Proxy，`args.outputDir` 和 `args['output-dir']` 都能读。
3. **分发**：`findSubCommandIndex` 跳过带值的 flag；碰到 `--` 停止。子命令先按 key 命中，再扫 `meta.alias`。
4. **生命周期**：当前命令 plugin setup → `setup` → 子命令 `runCommand` 或自己的 `run` → `cleanup` → plugin cleanup（逆序）。`cleanup` 在 `run` 抛错后仍执行。
5. **入口**：`runMain` 先看内建 help/version。用户已经占用 `help`/`version` 名或 alias 时，对应内建 flag 会少掉甚至整组关闭。`CLIError` 会先 `showUsage` 再 `exit(1)`。

无显式子命令名时，`default` 把**整份** `rawArgs` 交给默认子命令，所以 `--verbose` 可以落到 `dev`。

## 实践示例

### 案例 1：位置参数 + boolean + enum

```js
const main = defineCommand({
  args: {
    name: { type: "positional", description: "Your name", required: true },
    greeting: { type: "string", default: "Hello" },
    level: {
      type: "enum",
      options: ["debug", "info", "warn", "error"],
      default: "info",
    },
  },
  run({ args }) {
    console.log(`${args.greeting} ${args.name}! (${args.level})`)
  },
})
```

缺位置参数抛 `EARG`。enum 不在 `options` 里同样抛 `EARG`。`required` 对 named arg 检查的是 `undefined`，不是空字符串。

### 案例 2：懒加载子命令，并给一个 default

```js
const main = defineCommand({
  meta: { name: "app", version: "1.0.0" },
  default: "dev",
  subCommands: {
    dev: () => import("./dev.mjs").then((m) => m.default),
    build: () => import("./build.mjs").then((m) => m.default),
  },
})

runMain(main)
```

`Resolvable` 让大 CLI 只加载真正走到的模块。空 argv 会跑 `dev`，并且把剩余 rawArgs 原样传下去。不要在这一层再写 `run`。

### 案例 3：plugin 包一层 setup/cleanup

```js
import { defineCittyPlugin } from "citty"

const logger = defineCittyPlugin({
  name: "logger",
  setup({ args }) {
    console.log("setup", args)
  },
  cleanup() {
    console.log("cleanup")
  },
})

const main = defineCommand({
  plugins: [logger],
  run() {
    console.log("hello")
  },
})
```

plugin setup 在命令 `setup` 之前；cleanup 在命令 `cleanup` 之后、按注册逆序。父命令的 plugin 在子命令前后各跑一次。

## 踩过的坑

1. **同时写 `run` 和 `default`**：无显式子命令时直接 `E_DEFAULT_CONFLICT`。
2. **以为 `--version --help` 也能打印版本**：version 分支要求 `rawArgs.length === 1`。
3. **给 `--host` 起 alias `h` 后还指望 `-h` 是 help**：用户占用短名后，内建 help 只留 `--help`。
4. **把 README 的“只有被执行命令的 hooks”当成源码事实**：父命令的 `setup` / plugin 会先跑，再进入子命令整段生命周期。
5. **把“零依赖”写成你可以 `require('scule')` 的合同**：published 包无 production dependency；源码里 `scule` 与 `node:util.parseArgs` 是实现细节。

## 适用 vs 不适用场景

**适用**：

- 希望命令是可懒加载的对象，而不是一条长链
- 需要 `setup` / `cleanup` / plugin 包一层资源（日志、临时目录）
- 能接受 Node 的 `util.parseArgs` 语义，以及 `runMain` 自己 `process.exit`

**不适用**：

- 要链式 API、dot-nested `--env.FOO`、或 EventTarget 监听未知命令——那是 [[cac]] 的合同
- 不能让 CLI 库调用 `process.exit`（应直接用 `runCommand`，并自己处理 `CLIError`）
- 需要位置参数的 alias，或把 enum 当自由字符串

## 固定版本边界

- 本文绑定 `unjs/citty@9cb0edcc...`，tag `v0.2.2` 与 npm `gitHead` 同一提交。
- 包是 ESM，`exports` 只有 `./dist/index.mjs`；没有 `engines` 字段。
- 本文未安装依赖、未跑 playground / vitest，状态保持 `UNVERIFIED`。

## 学到什么

1. **对象图可以晚点再展开**——`Resolvable` 把懒加载写成类型，而不是特殊插件 API。
2. **父命令不是透明代理**——它的 hook 包住子命令。
3. **default 吃剩余 argv**——没写子命令名时，flag 仍然属于默认命令。
4. **内建 flag 是让位的**——用户声明同名 arg/alias 后，help/version 会收缩。

## 应用型自测

1. 父命令写了 `default: 'dev'` 又写了 `run()`，空 argv 会怎样？
2. `runMain(cmd, { rawArgs: ['--version', '--help'] })` 会打印 `meta.version` 吗？
3. 父 plugin 与子 plugin 都存在时，`cleanup` 谁先跑？

检查点：

1. 抛 `E_DEFAULT_CONFLICT`，不会跑 `dev`。
2. 不会。version 只要 `rawArgs.length === 1`。
3. 子 plugin cleanup 先，父 plugin cleanup 后。

## 延伸阅读

- 固定源码：[unjs/citty](https://github.com/unjs/citty) —— 本文绑定提交 `9cb0edcc55c133ea04d3cbb350284a9a3548946e`
- 对照入口：`src/command.ts`、`src/main.ts`、`src/args.ts`、`src/_parser.ts`
- [[cac]] —— 链式命令树 + mri 的对照路线
- [[commander]] —— 同类赛道里更老的声明式 API，本轮未核对其固定 revision

## 关联

- [[cac]] —— Vite 生态常见的链式对照（本轮未核验 Vite 是否仍依赖它）
- [[commander]] —— 声明式命令树
- [[yargs]] —— 带 completion / 配置文件的重型对照
- [[oclif]] —— class + 目录路由的重型框架

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cac]] —— cac — 用命令树把 argv 收成 action
