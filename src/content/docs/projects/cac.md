---
title: cac — 用命令树把 argv 收成 action
description: Command And Conquer：EventTarget + mri，声明子命令后再 parse
来源: https://github.com/cacjs/cac
日期: 2026-08-27
分类: CLI / 命令行工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/cacjs/cac
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 77f602fcb2d1e75d24f5ecd94d5bf667acaa857a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.0
---

## 是什么

cac（Command And Conquer）是一个用**命令树 + 选项声明**把 `process.argv` 收成 action 参数的 JavaScript CLI 库。日常类比：你先画一张柜台菜单（命令、括号参数、短长选项），再让柜员按菜单点单，而不是自己切字符串。

固定 `7.0.0` 里，`cac(name)` 返回 `new CAC(name)`。`CAC` 继承浏览器风格的 `EventTarget`，解析依赖内部的 `mri`。

```js
import { cac } from "cac"

const cli = cac("mytool")
cli
  .command("rm <dir>", "Remove a dir")
  .option("-r, --recursive", "Remove recursively")
  .action((dir, options) => {
    console.log(dir, options.recursive)
  })
cli.help()
cli.parse()
```

`parse()` 不传 argv 时读取 runtime 的 `process.argv`，并从 index 2 切开。

## 为什么重要

不看固定 7.0.0 的入口，很容易把 cac 写成“又一个 commander”或继续用 v6 的 EventEmitter 印象：

- 为什么监听未知命令要用 `addEventListener('command:*')`，而不是 `.on()`
- 为什么 `--env.API_SECRET xxx` 会变成嵌套对象，而不是一个叫 `env.API_SECRET` 的扁平键
- 为什么只声明命令、不挂 `.action()` 时，未知选项不会报错
- 为什么 `--version` 在已经匹配到具名子命令时不一定打印

一句话：cac 的合同是 **声明命令树 → mri 解析 → 匹配后才校验并跑 action**。

## 核心要点

固定版本可以拆成五步：

1. **建树**：`cli.command(rawName, desc)` 把括号解析成位置参数（`<req>` 必需、`[opt]` 可选、`...` 变长），返回的是**子命令**，不是 `this`。
2. **挂选项**：`cli.option` 写到全局；`command.option` 写到该命令。`--no-foo` 在 default 为空时把默认值设成 `true`。
3. **parse**：先按命令名/别名匹配；没有命中再找默认命令（空名字或 alias `'!'`）；再都不中就只解析全局。
4. **整形**：选项名 camelCase；`.` 分段用 `setDotProp` 嵌套；`--` 之后进入 `options['--']`。
5. **跑 action**：`runMatchedCommand` 才检查未知选项、缺值选项、缺位置参数和多余参数，最后按声明顺序把位置参数 + options 交给回调。

匹配成功会派发 `CustomEvent`：具名命令是 `command:${name}`，默认命令是 `command:!`，完全没匹配且还有剩余 token 时是 `command:*`。

## 实践示例

### 案例 1：子命令把位置参数和选项分开交给 action

```js
import { cac } from "cac"

const cli = cac("mytool")
cli
  .command("rm <dir>", "Remove a dir")
  .option("-r, --recursive", "Remove recursively")
  .action((dir, options) => {
    console.log(`remove ${dir}${options.recursive ? " recursively" : ""}`)
  })
cli.parse()
```

**逐部分解释**：`<dir>` 是必需位置参数，出现在 action 第一个实参。`-r` 与 `--recursive` 被收成同一个 camelCase 键。没有 `.action()` 时，这套校验不会跑。

### 案例 2：默认命令吃掉剩余文件列表

```js
const cli = cac()
cli
  .command("[...files]", "Build files")
  .option("--minimize", "Minimize output")
  .action((files, options) => {
    console.log(files, options.minimize)
  })
cli.parse()
```

空命令名就是默认命令。`[...files]` 把剩余位置参数收成数组。也可以 `.alias('!')` 显式标记。

### 案例 3：先 parse 再自己跑，才能接住 CACError

```js
try {
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
```

默认 `parse()` 会立刻 `runMatchedCommand()`。缺参数、未知选项都抛 `CACError`。要自己处理错误或 `await` 异步 action，需要 `{ run: false }`。

## 踩过的坑

1. **还在用 `.on('command:*')`**：7.0.0 的 `CAC` 是 `EventTarget`，固定 README 写的是 `addEventListener`。
2. **把 `cli.command().option()` 当成给父命令加选项**：`.command()` 返回子命令；全局选项要回到 `cli.option()`。
3. **以为声明了命令就一定会校验未知选项**：校验发生在 `runMatchedCommand`，没有 `commandAction` 直接返回。
4. **子命令下敲 `-v` 期望打印版本**：`parse` 里 `--version` 只在 `matchedCommandName == null` 时输出。
5. **把“零依赖 / 单文件”写成运行时保证**：published 包没有 production dependency，但源码 `import mri`，体积以你的 bundler 为准。

## 适用 vs 不适用场景

**适用**：

- 需要 git 风格子命令、默认命令、变长参数和 `--env.FOO` 嵌套选项的 Node / Deno / Bun CLI
- 希望 help / version 由同一份声明生成，并能用 `help(callback)` 改 sections
- 能接受 ESM，并且运行时满足 `node >= 20.19.0`

**不适用**：

- 要把命令写成 typed 对象图、懒加载子模块或 plugin setup/cleanup——那是 [[citty]] 的合同
- 需要内建 i18n、配置文件、completion 脚手架——固定源码没有这些层
- 还在 CJS `require('cac')` 或按 Node 16 推理 7.0.0

## 固定版本边界

- 本文绑定 `cacjs/cac@77f602fc...`，annotated 身份是 lightweight tag `v7.0.0`；npm latest 同号，未暴露 `gitHead`。
- `package.json` 声明 `type: module`、`engines.node >= 20.19.0`，导出只有 `./dist/index.js`。
- 仓库另有 `v6.7.14`；本文不绑定 v6 的 EventEmitter API。
- 本文未安装依赖、未跑 vitest / 示例 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **命令树和解析器是两段**——声明只注册；`mri` 负责 token，匹配之后才校验。
2. **默认命令是空名字，不是特殊关键字**——`''` 或 alias `'!'`。
3. **嵌套选项是 parse 后的 `setDotProp`**，不是 mri 原生语义。
4. **v7 的事件面是 DOM EventTarget**——不要用 Node EventEmitter 的记忆去写监听。

## 应用型自测

1. `cli.command('build').option('--foo')` 之后，再在同一条链上 `.version()`，version 选项加在哪？
2. 匹配到具名子命令 `lint` 时，`--version` 会不会走 `outputVersion()`？
3. 只 `cli.command('rm <dir>')`、不 `.action()`，传入未知 `--xyz` 会抛 `CACError` 吗？

检查点：

1. 加在 `build` 这条 `Command` 上，不是全局。
2. 不会。`matchedCommandName` 非空时 version 分支不跑。
3. 不会。没有 `commandAction` 时 `runMatchedCommand` 直接返回。

## 延伸阅读

- 固定源码：[cacjs/cac](https://github.com/cacjs/cac) —— 本文绑定提交 `77f602fcb2d1e75d24f5ecd94d5bf667acaa857a`
- 对照入口：`src/cac.ts`、`src/command.ts`、`src/option.ts`
- [[citty]] —— 对象定义 + Resolvable 子命令 + plugin 钩子的对照路线
- [[commander]] —— 同类声明式命令树，固定源码未在本轮核对

## 关联

- [[citty]] —— typed 对象 CLI，而不是链式 CAC
- [[commander]] —— 更老的声明式命令树
- [[yargs]] —— 解析层可拆、带 completion / 配置文件的重型对照
- [[oclif]] —— 目录即命令的 class 框架

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[citty]] —— citty — 用对象定义描述 CLI，再异步跑下去
