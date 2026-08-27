---
title: debug — 用命名空间开关调试输出
description: 按 namespace 电闸开关调试输出；Node 写 stderr，浏览器走 console.debug 回退
来源: https://github.com/debug-js/debug
日期: 2026-08-27
分类: 日志
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/debug-js/debug
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6b2c5fbdb7d414483d9e306ef234acb4cd7ea67c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.4.3
---

## 是什么

`debug` 是一个按**命名空间**开关的调试输出库。日常类比：不是调音量旋钮，而是给每间房间挂一块名牌，走廊电闸上写 `http,worker:*,-worker:noisy`，对得上的灯才亮。

```js
const debug = require('debug')
const log = debug('http')

log('listening on %s', ':3000')
```

固定 `4.4.3` 里，`src/index.js` 先选实现：没有 `process`、Electron renderer、`process.browser === true` 或 NW.js 走 `browser.js`，否则走 `node.js`。两边都把环境函数交给 `common.js` 的 `setup()`，再立刻 `enable(load())`。

## 为什么重要

不读这一版源码，下面几件事很容易被 README 带偏：

- 为什么它没有 info / warn / error，只有「这个 namespace 开还是关」
- 为什么 Node 写的是 `stderr`，浏览器却可能落到 `console.debug`
- 为什么已经创建的 `log` 在你后来 `debug.enable('http')` 之后会突然开始输出
- 为什么名字末尾加 `*` 并不会让实例无视 `DEBUG` 一直亮着

## 核心要点

固定版本可以拆成五步：

1. **选实现**：`index.js` 用进程形态决定 browser / node，不是用打包器猜。
2. **造函数**：`createDebug(namespace)` 返回一个函数。`enabled` 是 getter：没有实例覆盖时，缓存 `createDebug.enabled(namespace)`，直到全局 `namespaces` 字符串变了才重算。
3. **关着就返回**：`if (!debug.enabled) return` 发生在 coerce、formatter、`formatArgs` 和真正 `log` 之前。
4. **解析开关**：`enable()` 先 `save()`，再把空白收成逗号、按逗号切开；`-foo` 进 `skips`，其余进 `names`。匹配走 `matchesTemplate()` 的字符扫描和 `*` 回溯，不是 `RegExp`。skip 先判，命中就关。
5. **环境格式化**：Node 用 `util.formatWithOptions` 写 `process.stderr`，并从 `DEBUG_*` 拼 `inspectOpts`；浏览器把 namespace 和 `+Nms` 插进参数，颜色走 `%c`。

`extend('bar')` 默认用 `:` 拼出 `foo:bar`，并复制父实例的 `log`。`destroy()` 只是弃用空操作。

## 实践示例

### 案例 1：环境变量打开一部分命名空间

```js
const debug = require('debug')
const http = debug('http')
const worker = debug('worker:a')

http('boot')
worker('tick')
```

Node 里 `DEBUG=http,worker:*` 会把这两条都打开；`DEBUG=*,-worker:*` 会打开全部再排除 worker。`enable()` 把空白收成逗号，所以 `DEBUG="http worker:*"` 和逗号写法走同一条拆分。

### 案例 2：实例覆盖 enabled，不改全局名单

```js
const debug = require('debug')
const log = debug('http')
log.enabled = true
log('always on for this instance')
```

getter 看到 `enableOverride !== null` 就不再查 `names` / `skips`。这是测试或临时探针的口，不是给生产当第二套环境变量。

### 案例 3：自定义 log，并看 Error 怎么被 coerce

```js
const debug = require('debug')
const log = debug('http')
log.enabled = true
log.log = (...args) => process.stderr.write(args.join(' ') + '\n')
log(new Error('boom'))
```

`coerce()` 把 `Error` 换成 `stack || message`。第一个参数不是字符串时，common 路径会先 `unshift('%O')`。Node 自己的 formatter 提供 `%o`（单行 inspect）和 `%O`（可多行）；`%s` / `%d` / `%j` 留给 `util.formatWithOptions`。浏览器另外登记 `%j` 为 `JSON.stringify`。

## 踩过的坑

1. **把名字末尾的 `*` 当成“永远开启”**：README 仍写「namespace 以 `*` 结尾就无视 `DEBUG`」。固定 `common.js` 没有这条特例；`*` 只出现在 `enable()` 的模板里。
2. **以为关着的 `log()` 是空函数**：关闭路径仍是一次函数调用加 getter。它不是 [[pino]] 那种把 method 换成 `noop` 的 level 表。
3. **在浏览器里找 `process.env.DEBUG`**：浏览器先读 `localStorage` 的 `debug`，再读 `DEBUG`；只有 Electron 一类环境才会再看 `process.env.DEBUG`。
4. **把颜色开关当成 stdout TTY**：Node 的 `useColors()` 看的是 `inspectOpts.colors` 或 `stderr` 是否 TTY。
5. **把 `%j` 当成 Node 自己的 formatter**：Node 实现只挂了 `%o` / `%O`；浏览器才在 `formatters` 里挂 `%j`。

## 适用 vs 不适用场景

**适用**：

- 库作者要给调用方一个可按模块打开的调试口，而不引入 level 体系
- Node 服务和浏览器都要同一套 namespace 习惯
- 需要 `extend` 出 `lib:feature` 这种树，而不是另建 logger 工厂

**不适用**：

- 需要 info / warn / error 分级、默认只打 warn：看 [[loglevel]]
- 需要 NDJSON、worker transport、热路径吞吐合同：看 [[pino]]
- 必须在本轮未核验的 bundle 或 ops/sec 数字上做选型

## 固定版本边界

- 本文绑定 `debug-js/debug@6b2c5fbdb7d414483d9e306ef234acb4cd7ea67c`。annotated tag `4.4.3` 解引用到此提交，与 npm `debug@4.4.3` 的 `gitHead` 一致。
- package 声明 `engines.node >= 6.0`，运行时依赖 `ms@^2.1.3`；`supports-color` 是可选 peer。
- 未安装依赖，未跑 mocha / karma，未测着色或吞吐。状态保持 `UNVERIFIED`。

## 学到什么

1. **开关和级别不是同一合同**——`debug` 的单位是 namespace 字符串，不是 TRACE/DEBUG/INFO。
2. **enabled 是带缓存的属性，不是构造期常量**——全局 `enable()` 能唤醒已经造好的实例。
3. **skip 先于 include**——`DEBUG=*,-worker:*` 的排除写在 `skips` 里，模板匹配命中就关。
4. **README 不是固定源码**——“名字带 `*` 就永远开”在 4.4.3 里不存在。

## 应用型自测

1. `DEBUG=http,worker:*` 会不会打开 `worker:a`？`DEBUG=*,-worker:*` 呢？
2. 已经 `const log = debug('http')` 之后再 `debug.enable('http')`，这次调用会不会输出？
3. 浏览器实现默认把日志写到哪个 console 方法？Node 写到哪条流？

检查点：

1. 会打开 `worker:a`。后面那条会打开其它 namespace，但 skip 掉 `worker:*`。
2. 会。getter 发现 `namespaces` 变了就重算，没有实例覆盖时跟全局走。
3. 浏览器：`console.debug || console.log || noop`。Node：`process.stderr.write`。

## 延伸阅读

- 固定源码：[debug-js/debug](https://github.com/debug-js/debug) —— 本文绑定提交 `6b2c5fbdb7d414483d9e306ef234acb4cd7ea67c`
- 对照入口：`src/index.js`、`src/common.js`、`src/node.js`、`src/browser.js`
- [[loglevel]] —— 同主题的 level + `noop` 替换模型
- [[pino]] —— 结构化 JSON 与 method 替换，不是 namespace 电闸

## 关联

- [[loglevel]] —— 浏览器/Node 都可用的级别日志，默认 WARN
- [[pino]] —— Node 热路径 JSON logger，和 debug 解决的不是同一类问题
- [[express]] —— 许多 Connect / Express 生态库用 `debug('connect:...')` 这种命名
