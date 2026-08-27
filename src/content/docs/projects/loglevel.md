---
title: loglevel — 给 console 补上可替换的日志级别
description: 用 noop 替换给 console 补级别；debug 实际绑定 console.log，根 setLevel 不自动 rebuild 孩子
来源: https://github.com/pimterry/loglevel
日期: 2026-08-27
分类: 日志
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pimterry/loglevel
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 40d10ef1917710afcc70b5f2115bb336ab4b0580
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.9.2
---

## 是什么

loglevel 给 `console` 补了一层**级别**和**方法替换**。日常类比：酒店总机只有五颗键（trace / debug / info / warn / error），值班表把用不到的键焊死成空操作；前台按下去不会炸，只是没人接。

```js
const log = require('loglevel')
log.setLevel('warn')
log.info('hidden')
log.warn('visible')
```

固定 `1.9.2` 是 UMD：AMD、CommonJS，或挂到全局 `log`。根对象还带一个 `default` 字段，给 ES 模块默认导出兜底。零运行时依赖，`engines.node >= 0.6.0`。

## 为什么重要

不读 `lib/loglevel.js`，下面这些合同会对不上 README：

- 为什么默认不是“全开”，而是 WARN
- 为什么 `log.debug` 实际绑的是 `console.log`，不是 `console.debug`
- 为什么根 logger `setLevel('error')` 不会自动改已经 `getLogger()` 出来的孩子
- 为什么生产环境里改过一次级别，刷新页面还停在那个级别

## 核心要点

级别表是一份数字：

`TRACE=0` / `DEBUG=1` / `INFO=2` / `WARN=3` / `ERROR=4` / `SILENT=5`

新 logger 的 `inheritedLevel` 来自根 logger，没有根时是 `WARN`。真正生效的是 `userLevel` → `defaultLevel` → `inheritedLevel`。

`setLevel` 做三件事：写入 `userLevel`、默认持久化、调用 `replaceLoggingMethods()`。后者按 `i < level` 把 `trace`…`error` 换成 `noop` 或 `methodFactory(...)`，然后让 `this.log = this.debug`。

`realMethod('debug')` **先把名字改成 `log`**，再去找 `console`。所以 `log.debug` 绑定的是 `console.log`。能 bind 就 bind，为的是堆栈指到调用点，而不是 loglevel 内部。

持久化键是 `loglevel` 或 `loglevel:<name>`：先 `localStorage`，失败再写 session cookie。Node 没有 `window`，Symbol 名字把 `storageKey` 留空，这两种都不持久化。

`getLogger(name)` 要求非空字符串或 symbol；同名字符串返回 `_loggersByName` 里的同一实例。源码注释写明：根上的 `setLevel` 在 v2 才该 `rebuild()` 孩子——**这一版不会**。已经造好的 named logger 要等你显式 `log.rebuild()`。

## 实践示例

### 案例 1：默认 WARN，用 setDefaultLevel 而不覆盖用户选择

```js
const log = require('loglevel')
log.setDefaultLevel('error')
log.warn('hidden unless a persisted level is lower')
log.error('visible')
```

`setDefaultLevel` 只在读不到持久化级别时才 `setLevel(level, false)`。开发者在控制台 `setLevel('trace')` 之后刷新，生产初始化不会把它抢回去。

### 案例 2：同名 logger 是单例；根级别不会自动灌下去

```js
const log = require('loglevel')
const child = log.getLogger('module-two')
child.getLevel() // 创建时继承根级别，默认 WARN

log.setLevel('error')
child.getLevel() // 仍是 WARN

log.rebuild()
child.getLevel() // 变成 ERROR，因为孩子没有自己的 userLevel / defaultLevel
```

若孩子已经 `setLevel` 或 `setDefaultLevel`，`rebuild()` 也不会用根级别覆盖那一层。空字符串名字会抛 `TypeError`。

### 案例 3：关着的方法是 noop，参数不会被拼起来

```js
const log = require('loglevel')
log.setLevel('error', false)
log.debug('My', 'concatenated', 'log message')
```

`debug` 此时是 `noop`，多参数不会先拼接再丢弃。这和 [[debug]] 那种“先调用函数、再看 enabled getter”不是同一条热路径。插件若改写 `methodFactory`，必须自己再 `rebuild()`，否则旧 bind 还在。

## 踩过的坑

1. **把 README 的 console.debug 当实现**：正文写 “debug 尽可能走 `console.debug`”。固定 `realMethod` 把 `debug` 改成 `log`，再 bind `console.log`。
2. **以为根 `setLevel` 会改所有孩子**：只改根自己的方法表。已存在的 named logger 要 `rebuild()`。
3. **在 Node 里指望级别自动记住**：没有 `window` 就跳过 localStorage / cookie。
4. **给 `getLogger('')` 传空串**：会抛错；symbol 名字不会写入存储，每次 `Symbol()` 都是新实例。
5. **拿未测量的 1.4 KB gzip 数字做选型**：那是 README 宣传，本轮未核验产物大小。

## 适用 vs 不适用场景

**适用**：

- 浏览器或 Node 都要一套不炸的 console 级别 API
- 希望关闭的日志是真正的空函数，而不是每次判断
- 需要按模块 `getLogger('checkout')` 单独把某一块调到 TRACE

**不适用**：

- 只要按 namespace 电闸、不要级别：看 [[debug]]
- 需要 JSON 行、子 logger 预拼字段、worker 写出：看 [[pino]]
- 必须绑定本轮未核验的体积、下载量或浏览器份额

## 固定版本边界

- 本文绑定 `pimterry/loglevel@40d10ef1917710afcc70b5f2115bb336ab4b0580`。annotated tag `v1.9.2` 解引用到此提交，与 npm `loglevel@1.9.2` 的 `gitHead` 一致。
- `lib/loglevel.js` 是实现；`dist/` 是构建产物，本文以 `lib/` 为准。
- 未安装依赖，未跑 Grunt / Jasmine / `tsc`，未在 IE 或无 console 环境复现。状态保持 `UNVERIFIED`。

## 学到什么

1. **级别是换方法，不是 if**——低于阈值的名字直接变成 `noop`。
2. **`log.debug` 的合同是 `console.log`**——以 `realMethod` 为准，不以 README 为准。
3. **继承发生在创建时，传播要 `rebuild()`**——根后来改级别，旧孩子不会自己跟上。
4. **持久化是浏览器副作用**——`setLevel` 默认会写存储；只想改这一次要传 `false`。

## 应用型自测

1. 新建根 logger、不调用 `setLevel`，`getLevel()` 是几？`log.info` 此时是不是 noop？
2. `log.debug` 在这一版绑到 `console` 的哪个方法？
3. 先 `getLogger('a')` 再给根 `setLevel('silent')`，孩子会不会立刻静音？怎样才会？

检查点：

1. `3`（WARN）。`info` 的下标是 2，小于 3，是 `noop`。
2. `console.log`。`debug` 被改名为 `log` 再 bind。
3. 不会。要对还在继承链上的孩子调用根 `rebuild()`。

## 延伸阅读

- 固定源码：[pimterry/loglevel](https://github.com/pimterry/loglevel) —— 本文绑定提交 `40d10ef1917710afcc70b5f2115bb336ab4b0580`
- 对照入口：`lib/loglevel.js`、`index.d.ts`
- [[debug]] —— namespace 电闸，没有 level 表
- [[pino]] —— 同样用 method 替换，但目标是 NDJSON 热路径

## 关联

- [[debug]] —— 互补：开的是名字，不是级别
- [[pino]] —— Node 结构化日志；默认哲学相反（热路径拼接 vs 绑定 console）
- [[sentry]] —— 收集 error 时，本地级别过滤和上报是两条链
