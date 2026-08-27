---
title: open-cli — 把 open 库收成一条可管道的命令
description: 全局命令 open-cli：位置参数或 stdin 临时文件，再交给 open 打开。
来源: https://github.com/sindresorhus/open-cli
日期: 2026-08-27
分类: 命令行工具
难度: 入门
difficulty: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/sindresorhus/open-cli
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 199a2033ae41c65928b8b8bfd7936082a135aa8c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.0.0
---

## 是什么

`open-cli` 是 `open` 的命令行包装：全局装好后，你在 shell 里丢一个 URL、文件路径，或把内容管道进去，它负责打开系统默认应用。日常类比：[[open]] 是门铃按钮的 SDK，`open-cli` 是把门铃焊到水管上的接头——stdin 先落成临时文件，再按同一套跨平台启动器出门。

```bash
npm install --global open-cli
open-cli https://sindresorhus.com
open-cli unicorn.png
open-cli https://example.com -- firefox
echo '<h1>Hi</h1>' | open-cli --extension=html
```

固定 `9.0.0` 只发布 `cli.js`，`type: module`，`engines.node >= 22`（比 `open@11` 的 `>=20` 更严）。依赖声明是 `open@^11.0.0`，外加 `meow`、`tempy`、`file-type`。

## 为什么重要

不看这 60 行入口，容易把 CLI 想成「库的完整镜像」：

- 为什么命令行能 `--wait` / `--background`，却没有 `--new-instance` 或隐私模式开关
- 为什么 `cat file | open-cli` 不是把字节直接交给浏览器，而是先写临时文件
- 为什么空命令在交互终端立刻退出，管道里却会等 stdin
- 为什么 Node 20 能 `import open`，却装不上这条 CLI

## 核心要点

固定 `cli.js` 可以按执行顺序读：

1. **`meow` 先收旗帜**：`--wait`、`--background` 默认 `false`；`--extension` 是可选字符串。帮助文本里的 `-- <app> [args]` 对应 `cli.input` 的第二段，不是独立 flag。

2. **位置参数 0 是目标**：`cli.input[0]` 当作文件或 URL。没有它、且 `stdin` 是 TTY 时，打印 `Specify a file path or URL` 并 `process.exit(1)`。

3. **位置参数 1 起是 app**：`const [, appName, ...appArguments] = cli.input`。有 app 名就把 `options.app = {name, arguments}` 交给 `open`。

4. **有目标就直接打开**：`await open(input, options)`。`meow` 的 `flags` 对象会被整份传入，因此除 `wait` / `background` / `app` 外，还可能带上 `extension`；`open@11` 会忽略它不认识的键。

5. **stdin 模式是「探测类型 → 临时文件 → 再 open」**：`streamConsumers.buffer(process.stdin)` 读完整块，`fileTypeFromBuffer` 猜扩展名，缺省 `cli.flags.extension ?? type?.ext ?? 'txt'`，然后 `temporaryWrite(stdin, {extension})`，最后 `open(filePath, options)`。

## 实践示例

### 案例 1：打开 URL，并指定浏览器参数

```bash
open-cli https://sindresorhus.com -- 'google chrome' --incognito
```

`meow` 把 `--` 后面收进 `input`。对 `open` 来说这只是 `{app:{name:'google chrome', arguments:['--incognito']}}`，不会自动改走 `apps.chrome` 的平台探测表。跨平台脚本里写死 `google chrome` 会在 Linux / Windows 上对不上二进制名。

### 案例 2：管道 HTML，必须自己补扩展名

```bash
echo '<h1>Unicorns!</h1>' | open-cli --extension=html
```

`file-type` 认的是魔数，不是文本标签。纯 HTML 字符串常常探测失败，缺省会写成 `.txt`，默认应用就变成编辑器而不是浏览器。

### 案例 3：等待应用退出

```bash
open-cli unicorn.png --wait
```

旗帜原样传给 `open` 的 `wait: true`。和库页一样：等的是应用进程，不是窗口；已在运行的浏览器通常立刻返回。本 CLI **没有**把 `newInstance` 暴露成 flag。

## 踩过的坑

1. **以为 CLI 覆盖了库的全部选项**：没有 `newInstance`、`allowNonzeroExitCode`、`apps.browser` / `apps.browserPrivate`。隐私窗口只能自己传浏览器二进制和 `--incognito`。

2. **在 TTY 里不给参数却指望它读剪贴板**：空输入且 stdin 是终端时直接退出码 1，不会打开任何东西。

3. **把 stdin 成功理解成「类型一定探测对」**：探测失败就当 `txt`。二进制图片通常能认出 `png` / `jpg`；日志和 HTML 往往认不出。

4. **用 Node 20 全局安装**：包装器要求 `>=22`，即便本机已经能跑 `open@11`。

5. **把 `test.js` 当成打开成功的证据**：固定测试只跑 `--version` 非空，以及把 `cli.js` 自身灌进 stdin 时进程不抛错；注释式保证「真的打开了窗口」并不存在。

## 适用 vs 不适用场景

**适用**：

- 在 shell / CI 注释步骤里打开一份本地报告或预览 URL
- 需要把生成物从管道送进默认应用，并能接受临时文件这一跳
- 已经决定用 [[open]]，只差一条可安装命令

**不适用**：

- 要在 Node 20 上提供全局命令
- 需要库级的默认浏览器隐私模式或 macOS `newInstance`
- 把不可信 stdin 直接当文件打开（临时文件路径仍会交给系统启动器）
- 需要本轮未运行的「已打开成功」证据

## 固定版本边界

- 本文绑定 `sindresorhus/open-cli@199a2033ae41c65928b8b8bfd7936082a135aa8c`，tag `v9.0.0` 与 npm `open-cli@9.0.0` `gitHead` 一致。
- 依赖 `open@^11.0.0`；对照页绑定的是 `open@11.0.1`，本页不把 semver 范围收成另一个精确 SHA。
- 只发布 `cli.js`。未安装依赖，未跑 `xo` / `ava`，未调用真实系统打开程序，状态保持 `UNVERIFIED`。

## 学到什么

1. **薄 CLI 的价值在输入形状，不在重复实现启动器。** 真正的平台分支仍在 [[open]]。
2. **管道打开 = 缓冲 + 猜类型 + 临时文件。** 猜错扩展名，打开的就不是你以为的应用。
3. **帮助文本里的 `-- app` 只是 `meow` 的剩余参数，不是 `open.apps` 探测表。**
4. **引擎上界会比被包装的库更严。** 这里是 22 vs 20。

## 应用型自测

1. 没有位置参数、stdin 又是 TTY 时，进程怎么结束？
2. `echo '<h1>Hi</h1>' | open-cli` 不写 `--extension` 时，临时文件默认用什么扩展名？为什么？
3. `open-cli` 能不能把 `apps.browserPrivate` 或 `newInstance` 传给 `open`？

检查点：

1. 打印 `Specify a file path or URL`，`process.exit(1)`。
2. `txt`。`file-type` 看魔数，HTML 文本通常没有可识别签名。
3. 不能。旗帜只有 `wait` / `background` / `extension`；app 只能靠位置参数里的原始名字。

## 延伸阅读

- 固定源码：[sindresorhus/open-cli](https://github.com/sindresorhus/open-cli) —— 本文绑定 `199a2033ae41c65928b8b8bfd7936082a135aa8c`
- 对照入口：`cli.js`
- 审查记录：仓库内 `docs/open-url-source-review-20260827-eq.md`
- [[open]] —— 实际执行 spawn 与平台分支的库

## 关联

- [[open]] —— 被包装的跨平台打开库
- [[ora]] —— 同作者终端体验的另一面：动画，而不是打开外部程序
- [[commander]] —— 自己做 CLI 解析时的对照；这里用的是 `meow`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
