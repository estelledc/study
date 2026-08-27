---
title: Winston — 把日志写成可插拔对象流
description: transport-first 的 Node logger，Logger 是 objectMode Transform，格式化与落盘分开
来源: https://github.com/winstonjs/winston
日期: 2026-08-27
分类: 日志库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/winstonjs/winston
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ed45345f01b8ceb1d436e4791d95469c5213a0cf
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.19.0
---

## 是什么

Winston 是一个 **transport-first 的 Node.js 日志库**。日常类比：它不是一支笔，而是一条传送带——你把一条对象记录放上去，后面接几个出口（控制台、文件、HTTP）。每个出口自己决定要不要接、怎么写。

```js
const winston = require('winston')

const log = winston.createLogger({
  level: 'info',
  transports: [new winston.transports.Console()],
})

log.info('ready', { port: 3000 })
```

固定 `3.19.0` 的 `Logger` 继承 objectMode `Transform`。`createLogger()` 会为这次配置生成一个 `DerivedLogger`，再按 npm levels 在原型上挂 `info` / `error` / `isInfoEnabled` 等方法。默认 format 是 `logform/json()`。

## 为什么重要

不理解 Winston 的流式合同，下面这些事会让人困惑：

- 为什么 `require('winston').info('hi')` 可能只在 stderr 抱怨「没有 transport」
- 为什么 `defaultMeta` 和 `child()` 对同名字段的胜负相反
- 为什么 `level: 'info'` 能放出 `error`，却挡掉 `debug`
- 为什么 `exitOnError: true` 不一定会让进程退出

它和 [[bunyan]]、[[pino]] 的差别不在「会不会打 JSON」，而在 **记录怎么从调用点走到出口**。

## 核心要点

固定源码的主链可以拆成五步：

1. **造一个 DerivedLogger**：`createLogger(opts)` 默认用 `config.npm.levels`。每个 level 名变成原型方法；单参数热路径直接组 `info` 对象再 `write()`。

2. **可选地挂 defaultMeta / child**：`defaultMeta` 在写入前 `Object.assign` 到记录上，后写覆盖调用方。`child(meta)` 用 `Object.create` 只改 `write`：先铺 child 字段，再铺本次记录。

3. **进 Transform**：`_transform` 看到 `silent` 就丢弃。否则保证 `triple-beam` 的 `LEVEL` 符号，再跑 `this.format.transform`。没有 pipe 目标时会 `console.error` 警告内存。

4. **pipe 到 transport**：`add()` 要求 Writable + objectMode；老式 `log(info, callback)` 会被 `LegacyTransportStream` 包一层。内置出口是 Console / File / Http / Stream。

5. **异常与退出**：`exceptions.handle()` 监听 `uncaughtException`。`exitOnError` 默认 `true`，但没有 exception handler 时不会 `process.exit`；有 handler 时最多等 3000ms。

npm 数值越小越严重：`error=0` … `info=2` … `silly=6`。`isLevelEnabled` 看的是「配置值 >= 目标值」，所以 `info` 包含 `error`，不包含 `debug`。

## 实践示例

### 案例 1：显式 createLogger，而不是用默认导出

```js
const { createLogger, transports, format } = require('winston')

const log = createLogger({
  level: 'info',
  defaultMeta: { service: 'api' },
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'app.log', lazy: true }),
  ],
})

log.info('listen', { port: 3000 })
```

`createLogger()` 不会自动加 Console。顶层 `winston.info()` 走的是另一个**没有 transport** 的 defaultLogger。`File` 必须给 `filename` 或 `stream`；`lazy: true` 把真正 `open()` 推迟到第一条日志。

### 案例 2：child 字段不会盖住本次调用

```js
const reqLog = log.child({ reqId: 'abc' })
reqLog.info({ reqId: 'override', user: 1 }, 'ok')
```

`child()` 的 `write` 先 `Object.assign({}, childMeta, info)`，所以本次 `reqId: 'override'` 赢。如果改用 `defaultMeta: { reqId: 'abc' }`，`_addDefaultMeta` 会再 `Object.assign(msg, defaultMeta)`，固定字段会盖掉调用方。

### 案例 3：uncaughtException 要先有 handler

```js
log.exceptions.handle(new transports.File({ filename: 'exceptions.log' }))
```

`ExceptionHandler.handle()` 才会 `process.on('uncaughtException', ...)`。只开 `exitOnError: true`、不挂 handler 时，源码会警告并且 **不退出**。

## 踩过的坑

1. **把默认导出当成“开箱即用 Console”**：`require('winston')` 的 defaultLogger 没有 transport。
2. **把 `defaultMeta` 当 child**：两者对冲突字段的覆盖方向相反。
3. **按 bunyan 数字理解 npm level**：Winston 是 0 最严重；Bunyan 是 60 最严重。
4. **以为 `exitOnError` 单独就能停进程**：没有 exception handler 时它被强制关掉。
5. **File 同时给 `filename` 和 `stream`**：构造函数会抛，二者互斥。

## 适用 vs 不适用场景

**适用**：

- 需要多个出口、每个出口自己的 level / format
- 已经有 winston-transport 生态，或要把旧 2.x transport 包一层
- 想用 `exceptions` / `rejections` 把崩溃记录接到独立文件

**不适用**：

- 把「主线程零成本」当第一公理 → 先看 [[pino]] 的 worker transport，不要用未绑定数字比较
- 只要一份固定 NDJSON、字段约定比插件更重要 → [[bunyan]] 的 record 形状更硬
- Edge / 无 `fs` 环境 → File transport 和部分 Node API 不成立

## 固定版本边界

- 本文绑定 `winstonjs/winston@ed45345f...`，包版本 `3.19.0`，`engines.node >= 12.0.0`。
- GitHub annotated tag `v3.19.0` 与 npm `gitHead` 指向同一提交。
- 默认 format、levels 颜色表来自依赖 `logform` / `triple-beam`；本文只读 Winston 仓库内如何调用它们。
- `3.0` 已删除 `colors` / `formatters` / `rewriters` / `Logger.cli()`，必须改用 `winston.format`。
- 本文只做静态源码审查，没有安装依赖或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **Logger 可以是一条对象流**：调用点写对象，出口是 pipe 上去的 Writable。
2. **“默认实例”和“工厂实例”不是一回事**：顶层导出为了图省事，却没有默认 transport。
3. **合并字段要写清谁覆盖谁**：`defaultMeta` 后写，`child()` 先写。
4. **退出策略是 handler 合同，不是布尔装饰**：`exitOnError` 没有落盘对象时不会停进程。

## 应用型自测

1. `require('winston').info('hi')` 在未 `add()` 任何 transport 时，记录会进 stdout 吗？
2. logger 设了 `defaultMeta: { reqId: 'a' }`，调用 `log.info({ reqId: 'b' }, 'x')`。落盘的 `reqId` 是哪个？
3. `exitOnError: true` 但从未 `exceptions.handle()`。进程遇到 `uncaughtException` 会立刻退出吗？

检查点：

1. 不会。defaultLogger 没有 pipe 目标，`_transform` 只会警告。
2. `'a'`。`_addDefaultMeta` 后写覆盖调用方。
3. 不会。没有 exception handler 时源码关掉退出。

## 延伸阅读

- 仓库：[github.com/winstonjs/winston](https://github.com/winstonjs/winston)
- 固定源码：本文绑定提交 `ed45345f01b8ceb1d436e4791d95469c5213a0cf`
- 3.x 升级说明：仓库内 `UPGRADE-3.0.md`
- [[bunyan]] —— 固定 NDJSON 记录与 child 快路径
- [[pino]] —— 热路径字符串化 + worker transport

## 关联

- [[bunyan]] —— 同主题：字段先行、同步写 stdout 的对照
- [[pino]] —— 同主题：把慢出口移出主线程的对照
- [[express]] —— HTTP 服务里常见的请求级 child / defaultMeta
- [[fastify]] —— 默认 logger 是 pino，不是 winston
