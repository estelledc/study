---
title: picocolors — 用函数调用给终端字符串上 ANSI 色
来源: https://github.com/alexeyraspopov/picocolors
日期: 2026-08-27
分类: 终端
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/alexeyraspopov/picocolors
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7249f8c5d4825550f70bc1ea98652639933d3bbd
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.1.1
---

## 是什么

picocolors 是一个 **无依赖的终端着色函数表**。日常类比：它不给你一串可点的链式积木，只给一盒已经装好的印章——`red(text)` 盖下去，字符串两头多一对 SGR 码。

你写：

```js
const pc = require('picocolors')
pc.red('hello')
// → '\x1b[31mhello\x1b[39m'
```

固定 1.1.1 的 `picocolors.js` 在加载时跑 `createColors()`，把 `bold` / `red` / `bgRed` 等做成闭包。没有 `pc.red.bold`，要叠样式就嵌套调用。

## 为什么重要

不理解这张函数表，就解释不了工具链为什么爱用它，而不是 [[chalk]]：

- 为什么 API 是 `pc.green(pc.italic(x))`，不能 `pc.green.italic`
- 为什么颜色开关只有真假，没有 0 / 16 / 256 / truecolor
- 为什么浏览器字段指向另一份文件，而且那份文件的每个键都是 `String`
- 为什么 `NO_COLOR` 和 `FORCE_COLOR` 在这里只看真值，不解析数字 level

## 核心要点

主链只有四步：

1. **一次检测，一张对象**：模块顶层读 `process.env` / `argv`。`NO_COLOR` 或 `--no-color` 关掉；`FORCE_COLOR`、`--color`、`win32`、`(stdout.isTTY && TERM !== 'dumb')`、`CI` 任一为真则开。`!!env.NO_COLOR` 对空字符串是 falsy。

2. **`formatter(open, close, replace = open)`**：返回 `input => open + … + close`。`"" + input` 接受非字符串。若 `input` 里已经有 `close`，就走进 `replaceClose`。

3. **嵌套靠替换 close**：`replaceClose` 循环（不是递归）把每一处 close 换成 `replace`。普通颜色的 `replace` 就是自己的 open，所以 `red('foo ' + yellow('bar') + ' baz')` 会在 yellow 的 39 后面重新打开红。`bold` / `dim` 共用 close `22`，它们的 replace 是 `\x1b[22m` 再加上自己的 open，避免把另一种强调一起关死。

4. **两份关闭路径**：`createColors(false)` 把 formatter 换成 `String`。`picocolors.browser.js` 是另一份硬编码的全 `String` 对象，`isColorSupported: false`。没有 rgb / hex / `ansi256`。

## 实践示例

### 案例 1：嵌套函数，不是链式点号

```js
const pc = require('picocolors')

pc.green(`How are ${pc.italic('you')} doing?`)
pc.red(pc.bold('==TEST=='))
```

第二句的测试期望是红开 + 粗开 + 文本 + 粗闭 + 红闭。没有 `pc.red.bold`。

### 案例 2：同色 close 会被换成外层 open

```js
const pc = require('picocolors')

pc.red(`foo ${pc.yellow('bar')} baz`)
// → 31 + "foo " + 33 + "bar" + 31 + " baz" + 39
```

yellow 的 `\x1b[39m` 不会把后面的 `baz` 留在默认色；`formatter` 默认 `replace = open`，所以那里变成红的 31。这是函数嵌套合同，不是链式 styler 链表。

### 案例 3：关掉颜色与浏览器构建

```js
const {createColors} = require('picocolors')

const off = createColors(false)
off.red('hello') // → 'hello'

// 打包器走 package.json 的 browser 字段时，
// 导入的是 picocolors.browser.js：每个样式都是 String
```

`createColors()` 无参时沿用模块级 `isColorSupported`。浏览器那份文件不读 TTY，也不读 `FORCE_COLOR`。

## 踩过的坑

1. **当成 chalk 来链式调用**：`pc.red.bold` 是 `undefined`。叠样式只能嵌套函数。

2. **指望 256 / truecolor 自动降级**：本文件只有 16 色 + bright 变体。没有 `hex`，没有 level 3。

3. **把 `FORCE_COLOR=2` 理解成 256 色**：`!!env.FORCE_COLOR` 只问开或关。数字 2 是 truthy，不会选调色板。

4. **以为 `win32` 还会看 Windows 版本**：检测里 `platform === 'win32'` 直接为真，除非先被 `NO_COLOR` / `--no-color` 挡住。

5. **把 README 的 “14 times smaller / 2 times faster” 写进选型结论**：那是仓库自带 benchmark 文案；本轮未跑 `benchmarks/*`，不能当测量结果。

## 适用 vs 不适用场景

**适用**：

- 工具链或库想要 CJS 默认导出、零依赖、函数调用 API
- 16 色 + bright 足够，并且接受布尔开关
- 需要 `createColors(false)` 在测试里关掉全部码

**不适用**：

- 需要 `hex` / `rgb` / 256 / truecolor，或 stdout 与 stderr 不同 level——用 [[chalk]]
- 想写 `color.red.bold` 链式 DSL
- 浏览器里要给 DevTools 上色——browser 构建是无色 `String`，不是 `%c`
- 需要本轮未核验的包体或 ops/sec 数字

## 固定版本边界

- 本文绑定 `alexeyraspopov/picocolors@7249f8c5...`，annotated tag `v1.1.1`。
- npm `picocolors@1.1.1` 的 `gitHead` 是祖先 `6f0a4638...`（`package.json` 仍写 1.1.0）；两提交之间只有 version 与 changelog，着色源码无 diff。
- 未安装依赖，未跑 `tests/test.js` 或 `benchmarks/*`。状态保持 `UNVERIFIED`。

## 学到什么

1. **最小着色库把“链”从 API 里拿掉**——嵌套函数 + close 替换，就能恢复外层色。
2. **布尔检测和 0–3 level 不是同一合同**——`FORCE_COLOR=3` 在这里不会变成 truecolor。
3. **browser 字段可以是另一套语义**——同一包名，浏览器侧可以全体变成 `String`。
4. **发布 tag 和 npm gitHead 可能差一个 bump 提交**——要对照源码树，而不是只抄其中一个 SHA。

## 应用型自测

1. `pc.red.bold('x')` 在 1.1.1 会怎样？正确写法是什么？
2. `pc.red('foo ' + pc.yellow('bar') + ' baz')` 里，yellow 的 39 会被换成什么？
3. `createColors(false).green('ok')` 和 `picocolors.browser.js` 的 `green` 各返回什么？`FORCE_COLOR=2` 会开启 256 色吗？

检查点：

1. `pc.red.bold` 不是函数；应写 `pc.red(pc.bold('x'))`。
2. 换成红的 open `\x1b[31m`，`baz` 仍是红。
3. 都是无色 `'ok'` / `String`。`FORCE_COLOR=2` 只是 truthy，没有 256 色路径。

## 延伸阅读

- 固定源码：[alexeyraspopov/picocolors](https://github.com/alexeyraspopov/picocolors) —— 提交 `7249f8c5d4825550f70bc1ea98652639933d3bbd`
- 对照入口：`picocolors.js`、`picocolors.browser.js`、`tests/test.js`
- 链式 / 多 level 对照：[[chalk]]
- `NO_COLOR` 约定：[no-color.org](https://no-color.org/)

## 关联

- [[chalk]] —— 链式 builder + 0–3 level + vendor 检测
- [[ora]] —— spinner；颜色层可以换函数库
- [[vite]] —— 构建工具日志常用轻量着色
- [[commander]] —— CLI 解析，help 上色是另一层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
