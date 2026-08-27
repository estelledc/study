---
title: yoctocolors — 加载时拍板的具名终端着色函数
description: ESM 具名函数在 import 时调用 hasColors，之后不再提供 enabled 开关
来源: https://github.com/sindresorhus/yoctocolors
日期: 2026-08-27
分类: 终端着色
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/yoctocolors
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a02a16ec36fbd58a0848e95598fb4913c54c7591
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.2.0
---

## 是什么

yoctocolors 是一个只导出着色函数的 ESM 包。日常类比：它不像可以先拿笔再决定写什么的印章盒，更像一套已经盖好章的橡皮——每个名字（`red`、`bold`、`underlineCurly`）都是“吃进一段字、吐出一段字”的函数。

固定 `2.2.0` 的入口只有这一层：

```js
import { red, green } from 'yoctocolors'
import colors from 'yoctocolors'

red('Yo!')
colors.blue(`hi ${green('there')}`)
```

`index.js` 只是把 `base.js` 再导出一遍，并提供 default namespace。它不画颜色，只包 ANSI 指令。

## 为什么重要

不看固定源码，容易把它说成“更小的 chalk”或“会链式的 kleur”：

- 为什么没有 `colors.red.bold`，也没有 `red().bold()`
- 为什么改 `FORCE_COLOR` 之后必须重新 import，不能运行时拨开关
- 为什么 `bold` 里再套 `dim` 会先发 `\x1b[22m` 再重开，而 `red` 里套 `yellow` 只重开 `\x1b[31m`
- 为什么下划线颜色和文本颜色不是同一组 SGR

一句话：yoctocolors 的合同是 **具名函数 + 加载时颜色快照**。

## 核心要点

固定版本可以把主链拆成四步：

1. **加载时问一次终端**：`base.js` 调用 `tty.WriteStream.prototype.hasColors()`；没有这个方法就当成 false。
2. **生成函数**：`hasColors === false` 时每个样式都是恒等函数；为 true 时才记住一对 open/close。
3. **包字符串**：有颜色时用 `input + ''` 强制成字符串，再在原文里找 close 码。
4. **嵌套重开**：close 码是 22（`bold`/`dim`）时，替换片段是 `close + open`；其它样式只插入外层 open。

样式表比基础 16 色大一圈：bright、`bgGray`、`overline`、SGR `4:2`–`4:5` 的下划线变体，以及 `58;5;n` 的 underline color。没有 `grey` 别名。

## 实践示例

### 案例 1：具名导入或 default 对象

```js
import { red } from 'yoctocolors'
import colors from 'yoctocolors'

red('Yo!')
colors.red('Error')
```

两条路指向同一组函数。测试断言 default export 的 `red('Error')` 也是 `\x1b[31mError\x1b[39m`。空字符串仍会包一对 open/close，不会被收成 `''`。

### 案例 2：嵌套颜色只重开外层前景

```js
import { red, yellow } from 'yoctocolors'

red(`Error: ${yellow('Warning')} continues in red`)
```

固定测试期望的中间片段是 `\x1b[31m`，不是 `\x1b[39m\x1b[31m`。也就是说，内层 yellow 的 close（39）被换成外层红的 open，前景不会先重置再上色。

### 案例 3：bold/dim 共用 22，必须先关再开

```js
import { bold, dim } from 'yoctocolors'

bold(`are ${dim('you')} ok`)
```

`bold` 和 `dim` 都用 SGR 22 复位。固定实现遇到内层 22 时会先发出 close，再发出外层 open，所以 `you` 之后是 `\x1b[22m\x1b[1m`。同一套规则也解释 `underline` 套 `underlineCurly`：它们共用 close 24，外层必须重开。

## 踩过的坑

1. **按 chalk / kleur 默认导出去链式调用**：这里没有 getter，也没有无参 `red()` 上下文。
2. **import 之后再改环境变量指望变色**：`hasColors` 只在模块加载时问一次；测试关色是另起 `FORCE_COLOR=0` 子进程。
3. **把 underline color 当成文本颜色**：`underlineRed` 发的是 `58;5;1` / `59`，要和下划线样式一起才看得见。
4. **把本仓当成 CJS 包**：README 把 CommonJS 指向独立的 `yoctocolors-cjs`；固定仓库是 `type: module`，本轮未打开兄弟包。
5. **把 README 的 ops/sec 表当成你仓库的测量**：本文没有跑 `benchmark.js`。

## 适用 vs 不适用场景

**适用**：

- ESM 项目只要具名函数，并且能接受 Node >= 18
- 需要 bright、特殊下划线或 underline color，但不需要链式 API
- 愿意让颜色开关跟随 Node `hasColors` 的环境变量合同

**不适用**：

- 必须 `require()` 同一仓库里的 CJS 入口
- 需要运行时拨 `enabled`，或按 color level 降到 256 / 16 色
- 要把未跑过的“最小最快”写成选型结论

## 固定版本边界

- 本文绑定 `sindresorhus/yoctocolors@a02a16ec...`，npm 包 `yoctocolors@2.2.0`。
- 引擎声明为 `node >=18`；`sideEffects: false`；许可证 MIT。
- CommonJS 用户被 README 指向 `yoctocolors-cjs`，不在本 revision 审查范围。
- 本文只做静态阅读，没有安装依赖或跑 ava / tsd，状态保持 `UNVERIFIED`。

## 学到什么

1. **开关发生在 import，不发生在每次调用**
2. **嵌套策略按 close 码分叉**：22 先关再开，其它颜色只重开
3. **下划线颜色是另一组 SGR**，不是把文本改成红色再加下划线
4. **ESM 与 CJS 被拆成两个包**，不能从本仓直接 `require`

## 应用型自测

1. `import colors from 'yoctocolors'` 之后，`colors.red.bold('x')` 能用吗？
2. 已经 import 过再设置 `FORCE_COLOR=0`，当前模块里的 `red` 会变成恒等函数吗？
3. `red(\`a ${yellow('b')} c\`)` 在 `b` 结束后会先发 `\x1b[39m` 吗？

检查点：

1. 不能。没有链式上下文，只能嵌套函数。
2. 不会。要另起进程或重新加载模块。
3. 不会。固定实现把内层 39 换成外层 `\x1b[31m`。

## 延伸阅读

- 固定源码：[sindresorhus/yoctocolors](https://github.com/sindresorhus/yoctocolors) —— 本文绑定提交 `a02a16ec36fbd58a0848e95598fb4913c54c7591`
- Node `hasColors`：[WriteStream.hasColors](https://nodejs.org/api/tty.html#writestreamhascolorscount-env)
- [[kleur]] —— 可链式默认导出，探测公式自己算
- [[chalk]] —— 带 level 降级的对照，本页不绑定它的 revision

## 关联

- [[kleur]] —— 双入口、可运行时改 `enabled`
- [[chalk]] —— 更完整的样式与降级
- [[ora]] —— spinner 场景里的着色调用方
- [[commander]] —— CLI 帮助输出
- [[yargs]] —— 另一条 CLI 解析线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kleur]] —— kleur — 可链式也可拆开的终端着色函数集

- [[kleur]] —— kleur — 可链式也可拆开的终端着色函数集
