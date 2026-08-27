---
title: kleur — 可链式也可拆开的终端着色函数集
description: 默认导出可链式累积样式，kleur/colors 则是不可链式的具名函数
来源: https://github.com/lukeed/kleur
日期: 2026-08-27
分类: 终端着色
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lukeed/kleur
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fa3454483899ddab550d08c18c028e6db1aab0e5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.1.5
---

## 是什么

kleur 是一个给终端字符串包 ANSI 样式的 Node 库。日常类比：它不像给整段话套一层会自动叠加的“魔法属性”，更像一套可以先拿笔、再决定写什么的印章——你先调用 `red()` 选红色，再把字塞进去。

固定 `4.1.5` 有两条入口：

```js
import kleur from 'kleur'
kleur.red().bold('stop')

import { red, bold } from 'kleur/colors'
bold(red('stop'))
```

默认导出是带 `enabled` 的对象；`kleur/colors` 是同名独立函数。两者都只返回字符串，自己不往终端画像素。

## 为什么重要

不看固定源码，容易把它说成“小一号的 chalk”：

- 为什么 `kleur.red.bold('x')` 在 3.0 之后不再是合法链式
- 为什么从 `kleur/colors` 取出的 `red` 不能再 `.bold()`
- 为什么管道重定向时颜色会消失，而 TTY 上写 `FORCE_COLOR=0` 仍可能着色
- 为什么嵌套 `yellow` 之后，外层红会重新打开，而关闭码顺序并不内层先关

一句话：kleur 的合同是 **函数调用累积样式 + 一份共享探测开关**。

## 核心要点

固定版本可以把主链拆成四步：

1. **选入口**：`import kleur from 'kleur'` 拿到可链式对象；`kleur/colors` 只导出单函数，方便 tree-shake。
2. **无参或有参**：默认导出里，无参调用把当前样式推进 `has`/`keys` 并返回新上下文；有参则立刻 `run()` 包字符串。
3. **包码**：每个样式记住一对 SGR open/close。`run()` 按数组顺序拼 open，再按同一顺序拼 close。
4. **看开关**：`enabled` 在加载时按环境变量和 `process.stdout.isTTY` 算一次，之后可以手动改。

探测公式是：没有 `NODE_DISABLE_COLORS`、`NO_COLOR` 为 `null`/`undefined`、`TERM` 不是 `dumb`，并且（`FORCE_COLOR` 存在且不是 `'0'`，或当前是 TTY）。

## 实践示例

### 案例 1：先选样式，再给字

```js
import kleur from 'kleur'

kleur.red('error')
kleur.green().bold().underline('ok')
```

**逐部分解释**：`red('error')` 直接包一层 `\x1b[31m...\x1b[39m`。`green().bold().underline('ok')` 先累积三份样式块，最后一次带字符串才 `run()`。测试里 `red().bold(val)` 的关闭码顺序是红 close 再 bold close，不是内层先关。

### 案例 2：嵌套时把外层重新打开

```js
import kleur from 'kleur'

kleur.red(`foo ${kleur.yellow('bar')} baz`)
```

朴素拼接会在 `bar` 结束时发出 `\x1b[39m`，把外层前景一起清掉。固定实现若发现字符串里已有该层 close，就把它替换成 `close + open`，所以 `bar` 之后会再发出红的 open。

### 案例 3：只要几个颜色时走 `kleur/colors`

```js
import { red, bold, $ } from 'kleur/colors'

bold(red('stop'))
$.enabled = false
red('still plain if disabled')
```

这里的 `red` 不是链式对象：`red()` 对 `null`/`undefined` 原样返回，对其它值才包码。开关不在默认导出的 `enabled`，而在 `$.enabled`。

## 踩过的坑

1. **继续写 chalk 式 getter**：`kleur@3.0` 起必须 `red().bold()`；`red.bold` 不再是样式链。
2. **把 `kleur/colors` 当成同一套链式 API**：具名函数只吃输入，组合靠嵌套调用。
3. **以为 `FORCE_COLOR=0` 在所有环境都关色**：无 TTY 时它会关；TTY 上公式后半段仍看 `isTTY`，测试脚本在 faketty 下 `FORCE_COLOR=0` 仍然着色。`NODE_DISABLE_COLORS`、`NO_COLOR`（含空字符串）和 `TERM=dumb` 才会压过 `FORCE_COLOR`。
4. **把 README 的 Node v10 加载时间写成你机器上的数字**：本文没有跑 bench。

## 适用 vs 不适用场景

**适用**：

- 需要同时保留 CJS `require` 和 ESM `import`
- 希望默认导出可链式，少数颜色再改走 `kleur/colors`
- 目标运行时可以低到 Node 6，且只要基础 16 色

**不适用**：

- 还想写 `chalk.red.bold` 这种 getter 链
- 需要 bright / 256 / truecolor，或运行时按 level 降级
- 要把未实测的“最快”结论写成选型依据

## 固定版本边界

- 本文绑定 `lukeed/kleur@fa345448...`，npm 包 `kleur@4.1.5`。
- 引擎声明为 `node >=6`；许可证 MIT。
- Git 树里的实现是 `index.mjs` / `colors.mjs`；发布用的 CJS 由 `build/index.js` 做 export 替换，该 tag 工作区没有现成 `index.js`。
- 本文只做静态阅读，没有安装依赖或跑 uvu / `test/env.sh`，状态保持 `UNVERIFIED`。

## 学到什么

1. **链式和 treeshake 是两条入口**，不是同一对象的两种写法
2. **关色优先级比 `FORCE_COLOR` 更硬**，空的 `NO_COLOR=` 也会关
3. **嵌套靠替换 close，不靠样式栈对象**
4. **关闭码顺序跟 open 相同**，不要按“内层先关”去读输出

## 应用型自测

1. `kleur.red.bold('x')` 在固定 4.1.5 还是官方链式写法吗？
2. 从 `kleur/colors` 取出的 `red` 能再 `.bold()` 吗？
3. TTY 上只设置 `FORCE_COLOR=0`，固定探测公式一定关色吗？

检查点：

1. 不是。3.0 之后要 `red().bold('x')`。
2. 不能。`kleur/colors` 是单函数，组合靠嵌套。
3. 不一定。TTY 分支仍可能保持 `enabled`。

## 延伸阅读

- 固定源码：[lukeed/kleur](https://github.com/lukeed/kleur) —— 本文绑定提交 `fa3454483899ddab550d08c18c028e6db1aab0e5`
- [[chalk]] —— 仍提供 getter 链式和 truecolor 降级的对照
- [[ora]] —— 终端 spinner，常见的着色调用方
- [[yoctocolors]] —— 另一条“小包 + 具名函数”路线，探测合同不同

## 关联

- [[chalk]] —— getter 链、truecolor 与独立探测包
- [[yoctocolors]] —— ESM 具名函数，加载时快照 `hasColors`
- [[ora]] —— 把颜色用在同一行刷新
- [[commander]] —— CLI 帮助文本常需要着色
- [[yargs]] —— 另一条 CLI 解析线，输出层常接颜色库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[yoctocolors]] —— yoctocolors — 加载时拍板的具名终端着色函数

- [[yoctocolors]] —— yoctocolors — 加载时拍板的具名终端着色函数
