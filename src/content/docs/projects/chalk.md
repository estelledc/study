---
title: chalk — 让 console.log 输出彩色字符串的 Node 库
来源: https://github.com/chalk/chalk
日期: 2026-05-30
分类: 终端
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/chalk/chalk
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 661317e6f91fe7c90306c2c48ea9354562ee9146
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.0.0
---

## 是什么

chalk 是一个 **ESM 终端字符串样式库**。日常类比：它不调色板、也不碰像素，只给字符串套一层终端能读的 **ANSI SGR 封皮**。

你写：

```js
import chalk from 'chalk'
chalk.red('hello')
// → '\u{1B}[31mhello\u{1B}[39m'
```

固定 6.0.0 里，默认导出是 `createChalk()` 造出来的函数：无样式时用空格 `join` 参数；点到 `red` / `bold` 时，才沿原型 getter 拼出带开闭码的 builder。画颜色的是终端，不是 chalk。

## 为什么重要

不看 6.0.0 源码，旧印象会对不上：

- 为什么 `require('chalk')` 仍然不是这条线——`package.json` 写死 `"type": "module"`，且 `engines.node >= 22`
- 为什么现在看不到独立的 `ansi-styles` / `supports-color` 运行时依赖——它们被 vendor 进 `#ansi-styles` 与 `#supports-color`
- 为什么 `chalk.red(chalk.green('inner') + 'outer')` 不会把后半段洗成默认色——close 会被替换成外层 open
- 为什么 GitHub Actions 日志常常仍带真彩色码——vendor 对 `GITHUB_ACTIONS` 直接给 level 3

## 核心要点

主链可以拆成五步：

1. **工厂而不是 class 实例**：`new Chalk(options)` 的构造器直接 `return chalkFactory(options)`。工厂先做一个 `(...strings) => strings.join(' ')`，再 `setPrototypeOf` 到装好 getter 的原型，并把 level 写进 `Symbol(LEVEL)`。

2. **样式是缓存过的 builder**：每个颜色/修饰 getter 第一次访问时 `createBuilder`，再用 `defineProperty` 钉在当前对象上。builder 的 `GENERATOR` 指向根 chalk，避免沿链读 level；`STYLER` 是 `{open, close, openAll, closeAll, parent}` 链表。

3. **嵌套靠替换 close**：`applyStyle` 发现字符串里有 ESC 后，沿 parent 把每种 close 换成对应 open。测试里 `red('a' + yellow('b' + green('c') + 'b') + 'c')` 会在内层 `\u{1B}[39m` 之后重新打开外层红/黄。

4. **level 决定用哪张码**：`rgb` / `hex` / `ansi256` 在模块加载时按 level 0–3 预生成 converter。level 3 走 `38;2;r;g;b`，level 2 先 `rgbToAnsi256`，level 1 再 `ansi256ToAnsi` 降到 16 色。level 0 或空串直接返回原文；`visible` 在 level 0 返回 `''`。

5. **能力检测在 vendor**：`FORCE_COLOR` 的数字是精确 level，`true` 或空字符串只表示“允许再检测”。`--color=16m` / `--color=256` 优先于非零数字。`TF_BUILD`+`AGENT_NAME` 为 1；`GITHUB_ACTIONS` / `GITEA_ACTIONS` / `CIRCLECI` 为 3。另有 `chalkStderr`，level 跟 stderr 走。

## 实践示例

### 案例 1：链式样式与多参数

```js
import chalk from 'chalk'

console.log(chalk.red.bgGreen.underline('foo'))
console.log(chalk.red('hello', 'there'))
```

第一句的开码按 `red → bgGreen → underline` 叠，闭码按相反顺序。第二句 builder 多参数时用空格拼接，不是逗号。

### 案例 2：同类型嵌套必须经 chalk 拼

```js
import chalk from 'chalk'

chalk.red(`outer ${chalk.green('inner')} outer`)
```

朴素手写 `\u{1B}[31m...\u{1B}[32m...\u{1B}[39m...` 会在 inner 的 39 处把前景重置掉。固定实现是看到 ESC 后把 39 换成 31，所以第二个 outer 仍是红。自己拼接而不走 `applyStyle`，这条合同不成立。

### 案例 3：truecolor 按 level 降级

```js
import {Chalk} from 'chalk'

const truecolor = new Chalk({level: 3})
const basic = new Chalk({level: 1})
truecolor.hex('#FF8800')('orange')
basic.hex('#FF8800')('orange')
```

`createModelConverters('hex')` 给 level 3 准备 `ansi16m(...hexToRgb)`，给 level 1 准备 `hexToAnsi`。本轮未在真实终端上核对映射结果，只读到 converter 表。

## 踩过的坑

1. **把 6.0.0 当成还能 `require` 的双包**：源码与 exports 都是 ESM。README 仍写 “Chalk 5 is ESM”，那是过期句子，不能当 CJS 恢复的证据。

2. **把 Node 16/18 写成当前引擎**：`engines.node` 是 `>=22`。更老的运行时不在本 revision 合同里。

3. **改子 builder 的 `level` 以为只影响自己**：`red.level = 0` 写的是根 `GENERATOR.level`，默认导出上的所有 builder 一起变。可复用模块应 `new Chalk({level})`。

4. **手写 ANSI 再塞进 chalk 字符串**：只有经 `applyStyle` 的嵌套才会重开外层。自己拼的 close 不会被修复。

5. **把 CI 一律理解成“无色或乱码”**：vendor 对 GitHub / Gitea / Circle 给 level 3。FORCE_COLOR=0 才是硬关。

## 适用 vs 不适用场景

**适用**：

- 应用层 CLI，需要链式 API、256 / truecolor、underline color 或 `visible`
- 已经运行 Node 22+，并能接受纯 ESM
- 希望 stdout / stderr 用不同检测结果（`chalk` vs `chalkStderr`）

**不适用**：

- 必须 `require()` 或跑在 Node 21 以下——本 revision 不提供这条路
- 工具链启动路径只想要一个函数、不要 0–3 level——应对 [[picocolors]]
- 浏览器 `console`——ANSI 不是 `%c`；vendor 的 browser 构建只用于检测，不是 DOM 上色
- 需要本轮未测的冷启动毫秒或包体 KB 来做选型

## 固定版本边界

- 本文绑定 `chalk/chalk@661317e6...`，annotated tag `v6.0.0` 与 npm `gitHead` 同一提交。
- 运行时无第三方依赖；样式表与 TTY 检测都在 `source/vendor/`。
- 未安装依赖、未跑 ava / matcha，也未在真实 TTY 上核对降级色号。状态保持 `UNVERIFIED`。

## 学到什么

1. **颜色是协议，不是库魔法**——库只决定开闭码、嵌套替换和何时不输出码。
2. **链式 API 的代价写在原型上**——getter + `setPrototypeOf` + 链表 styler，换来的是 `chalk.red.bold` 这种读法。
3. **level 是共享旋钮**——默认实例上改 `level`，等于给整个进程的默认 chalk 改检测结果。
4. **v6 的硬边界是 Node 22 + ESM**——不能再用 v4/v5 的安装故事解释当前包。

## 应用型自测

1. `new Chalk()` 真正返回的是 class 实例，还是一个函数？level 存在哪个 Symbol 后面？
2. `chalk.red('a' + chalk.green('b') + 'c')` 里，green 的 `\u{1B}[39m` 之后会怎样？
3. `FORCE_COLOR=3` 和 `FORCE_COLOR=true` 对 vendor 检测的差别是什么？`visible` 在 level 0 返回什么？

检查点：

1. 构造器 `return chalkFactory(...)`，得到的是可调用函数；level 在 `Symbol(LEVEL)`。
2. 39 被替换成红的 open，`c` 仍是红色。
3. 数字 3 是精确 level；`true` 只开检测。`visible` 在 level 0 返回空串。

## 延伸阅读

- 固定源码：[chalk/chalk](https://github.com/chalk/chalk) —— 提交 `661317e6f91fe7c90306c2c48ea9354562ee9146`
- 对照入口：`source/index.js`、`source/vendor/ansi-styles/index.js`、`source/vendor/supports-color/index.js`
- 协议背景：[ECMA-48](https://ecma-international.org/publications-and-standards/standards/ecma-48/) / [ANSI escape code](https://en.wikipedia.org/wiki/ANSI_escape_code)
- 更小的函数式对照：[[picocolors]]

## 关联

- [[picocolors]] —— 函数调用 + 布尔开关，没有 0–3 level
- [[ora]] —— spinner；颜色层常交给 chalk
- [[commander]] —— CLI 解析，help 文本上色是另一层
- [[yargs]] —— 同类 CLI 解析
- [[ink]] —— React 终端 UI，样式模型不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[listr2]] —— listr2 — 把 CLI 任务跑成一棵会自己画进度的树
- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[picocolors]] —— picocolors — 用函数调用给终端字符串上 ANSI 色
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准
