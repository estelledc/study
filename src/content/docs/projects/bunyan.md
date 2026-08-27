---
title: Bunyan — 先定记录形状再写 NDJSON
description: 字段先行的 Node JSON logger，默认写 stdout，child 可走共享 stream 的快路径
来源: https://github.com/trentm/node-bunyan
日期: 2026-08-27
分类: 日志库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/trentm/node-bunyan
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0ff1ae29cc9e028c6c11cd6b60e3b90217b66a10
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.5
---

## 是什么

Bunyan 是一个 **先定记录字段、再写成一行 JSON** 的 Node.js 日志库。日常类比：它发的是标准填报表——每行都有姓名、工号、时间、级别和一句话，而不是随便在纸上涂一句。

```js
const bunyan = require('bunyan')

const log = bunyan.createLogger({ name: 'api' })
log.info({ port: 3000 }, 'listen')
```

固定 `2.0.5` 的根 logger **必须**有 `options.name`。Node 环境若未给 `stream` / `streams`，默认加一条写向 `process.stdout` 的 stream，level 为 INFO=30。每条记录至少带 `v`、`name`、`hostname`、`pid`、`time`、`level`、`msg`。

## 为什么重要

不理解 Bunyan 的记录合同，下面这些事会对不上：

- 为什么 `createLogger()` 少写 `name` 直接抛 TypeError
- 为什么 `log.info()` 不传参数时返回布尔值，不写日志
- 为什么 `child({reqId}, true)` 能少拷一份 stream
- 为什么循环引用对象不会必然把进程打崩

它和 [[winston]] 相反：Winston 先搭管道再决定格式；Bunyan 先保证记录形状，再同步 `write` 到每个 stream。

## 核心要点

固定源码的主链可以拆成五步：

1. **构造 Logger**：根实例要求 `name`。不能同时传 `stream` 和 `streams`。其余未知 key 会进 `this.fields`，并补 `hostname` / `pid`。

2. **解析 stream**：`addStream()` 在缺 `type` 时由 `stream` 推 `stream`、由 `path` 推 `file`。默认 level 是 INFO。`raw` stream 写对象，其余先字符串化。

3. **组记录**：`log.info(err, msg)` / `log.info(msg, ...)` / `log.info(fields, msg, ...)` 都进 `mkRecord`。`msg` 走 `util.format`。`src: true` 才会抓调用栈。`v` 固定为 `0`。

4. **过滤再写**：`this._level <= minLevel` 才 `_emit`。level 数字越大越严重：TRACE=10 … FATAL=60。无参数调用只做这道比较。

5. **序列化与 child**：注册过的 serializer 按字段名改值；抛错时写 stderr，并把该字段换成错误字符串。`child(opts, true)` 共享 parent 的 streams/serializers；普通 child 拷贝 streams 且不拥有它们（`closeOnExit=false`），还可追加 stream。

字符串化顺序是：先普通 `JSON.stringify`，失败再用 `safeCycles` 把循环标成 `[Circular]`，再可选回退 `safe-json-stringify`。

## 实践示例

### 案例 1：最小服务 logger

```js
const bunyan = require('bunyan')

const log = bunyan.createLogger({
  name: 'api',
  serializers: bunyan.stdSerializers,
})

log.info({ port: 3000 }, 'listen')
// {"name":"api","hostname":"...","pid":123,"level":30,"port":3000,"msg":"listen","time":"...","v":0}
```

没给 `stream` 时，这条记录同步写到 stdout。`stdSerializers` 提供 `req` / `res` / `err`；`err` 会展开带 `cause()` 的长栈。

### 案例 2：请求级 child，走 simple 快路径

```js
app.use((req, res, next) => {
  req.log = log.child({ reqId: req.id }, true)
  next()
})
```

第二个参数 `true` 断言：options 只加字段、不必为这些字段跑 serializer。此时 child 复用父 streams，只拷 `fields`。普通 `child({reqId})` 会复制 stream 列表；child **不能**改 `name`。

### 案例 3：先问“这级开了没”，再组大对象

```js
if (log.debug()) {
  log.debug({ body: expensiveSummary(req) }, 'payload')
}
```

`log.debug()` 无参数返回 `this._level <= 20`。这是显式开关，不是 noop 方法替换。

## 踩过的坑

1. **忘掉 `name`**：根构造函数直接 TypeError。
2. **把无参 `log.info()` 当“打一条空日志”**：它只返回是否启用。
3. **child 想改服务名**：`options.name` 在 child 路径是非法的。
4. **依赖 `rotating-file` 却没装 `mv`**：该 type 在缺失可选依赖时不可用。
5. **把 2.0.5 当成稳定 LTS**：绑定 tag 的说明是 `version 2.0.5 (beta)`，提交于 2021-01-08。

## 适用 vs 不适用场景

**适用**：

- 服务日志要给 `bunyan` CLI 或下游按字段切
- 每个请求一个 child，字段比插件更重要
- 需要 `req` / `res` / `err` 这类标准 serializer

**不适用**：

- 要多个 format 管道、每个出口不同形状 → [[winston]]
- 主线程只能做字符串拼接、出口必须进 worker → [[pino]]
- 需要仍在发版的 1.8.x 线，又不接受 2.0 beta 标签 → 应另绑 `1.8.15`，不要假装本文覆盖

## 固定版本边界

- 本文绑定 `trentm/node-bunyan@0ff1ae29...`，包版本 `2.0.5`，`engines` 写 `node >=0.10.0`。
- GitHub annotated tag `2.0.5` 与 npm `gitHead` 指向同一提交；tag message 标明 beta。
- `dtrace-provider` / `mv` / `safe-json-stringify` / `moment` 是 optionalDependencies，缺失时对应能力关闭或降级。
- 记录格式版本 `LOG_VERSION = 0`；本文未声明兼容未来 `v` 变更。
- 本文只做静态源码审查，没有安装依赖或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **记录形状可以当协议**：`name` / `level` / `msg` / `v` 先于出口存在。
2. **无参 level 方法是开关**：先问再造大对象，避免白做序列化。
3. **child 有快慢两条路**：simple child 共享 stream；完整 child 才能加出口或改自己的 level。
4. **JSON.stringify 失败要有退路**：循环和 getter 异常被当成日志问题，而不是进程问题。

## 应用型自测

1. `bunyan.createLogger({})` 会得到默认名叫 `app` 的 logger 吗？
2. `log.info()` 什么都不传，返回值是什么？会不会写一行空 `msg`？
3. `log.child({ reqId: '1' }, true)` 再 `addStream` 一个文件，文件里会出现后续记录吗？

检查点：

1. 不会。根 logger 缺少 `name` 会 TypeError。
2. 返回布尔值 `this._level <= 30`，不写记录。
3. 不会可靠出现。simple child 共享父 streams，也不该在这条快路径上改配置。

## 延伸阅读

- 仓库：[github.com/trentm/node-bunyan](https://github.com/trentm/node-bunyan)
- 固定源码：本文绑定提交 `0ff1ae29cc9e028c6c11cd6b60e3b90217b66a10`
- CLI：包内 `bin/bunyan`，用于把 NDJSON 着色/切片
- [[winston]] —— transport 管道与 format 链的对照
- [[pino]] —— 同样输出 NDJSON，但热路径不走通用 `JSON.stringify`

## 关联

- [[winston]] —— 同主题：对象流 + transport 的对照
- [[pino]] —— 同主题：预拼字符串与 worker 出口的对照
- [[express]] —— `req` serializer 认 `originalUrl`
- [[fastify]] —— 默认不是 bunyan
