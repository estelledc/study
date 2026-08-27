---
title: pino — 日志不该阻塞热路径
来源: 'https://github.com/pinojs/pino'
日期: 2026-05-30
分类: projects / Node.js
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pinojs/pino
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6b344980eae3ebed904fc87caf4bba0ab9dbe946
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.3.1
---

## 是什么

pino 是一个面向 Node.js 的 **NDJSON 日志库**：主线程尽快拼出一行 JSON，真正慢的着色、多目的地转发交给 worker。日常类比：厨师只把菜放到传菜口，传菜员在另一条通道决定送哪一桌。

你写：

```js
import pino from "pino";
const log = pino();
log.info({ user: 1 }, "login");
```

固定 10.3.1 默认 level 是 `info`，`messageKey` 为 `msg`，`errorKey` 为 `err`，`base` 为 `{ pid, hostname }`。未指定 stream 且 `process.stdout` 未被篡改时，走 `sonic-boom` 写 stdout。浏览器打包应走独立入口 `browser.js`，不是 Node transport。

## 为什么重要

不理解 pino，下面这些事都没法解释：

- 为什么把 logger.level 设成 `info` 之后，`debug()` 连 `asJson` 都不会走
- 为什么 child logger 能带上 `reqId` 却不必每次重新 stringify 整份父字段
- 为什么 `pino.transport({ targets })` 能同时写文件和转发，而主线程仍只 `stream.write` 一次
- 为什么配置里的 `prettyPrint` 不再是开关，而是直接抛错

## 核心要点

固定源码把“快”拆成四步：

1. **创建时预计算**：`pino()` 规范化 options 与 stream，用 `safe-stable-stringify` 配 `depthLimit: 5`、`edgeLimit: 100`，再 `genLsCache` 把每个 level 的前缀（默认 `{"level":30`）预先 stringify 好。

2. **setLevel 换 method**：level 值为 trace=10、debug=20、info=30、warn=40、error=50、fatal=60。`setLevel` 按比较函数把低于阈值的方法赋成 `noop`；达标方法才是 `genLog`。热路径上没有 `if (level >= info)`。

3. **asJson 字符串拼接**：`write` 处理 Error / mixin 后调用 `asJson`。行首是 lsCache 前缀 + 时间戳 + 预拼的 `chindings`，再拼本次字段和 `msg`，最后补 `}\n`。整段 `JSON.stringify` 只在需要序列化对象字段时出现。

4. **transport 进 worker**：`opts.transport` 用 `thread-stream` 建 `ThreadStream`。`target` 与 `targets` 互斥；`pino/file` 映射到仓库 `file.js`。主线程只跟这条 worker stream 打交道。`fatal` 在写完后对当前 stream 调 `flushSync`。

## 实践示例

### 案例 1：默认 stdout 结构化日志

```js
import pino from "pino";
const log = pino();
log.info({ user: 1 }, "login");
```

不传参数时，level 为 info，输出到 sonic-boom 包装的 stdout。第一个参数合并进 record，第二个是 `msg`。`debug("x")` 在默认 level 下是 `noop`，不会拼 JSON。

### 案例 2：child 预拼请求字段

```js
const log = pino();
app.use((req, res, next) => {
  req.log = log.child({ reqId: req.headers["x-request-id"] });
  next();
});
```

无 options 的 `child` 做 `Object.create(this)`，再用 `asChindings` 把字段预拼进 `chindings`。它复用父 logger 的 method 与 lsCache，不按请求 new 一套 level 函数。`req.log.info("ok")` 每行都带 `reqId`。

### 案例 3：transport 多目标

```js
const log = pino(pino.transport({
  targets: [
    { target: "pino/file", options: { destination: "/var/log/app.log" } },
    { target: "pino-loki", options: { host: "http://loki:3100" } }
  ]
}));
```

`targets` 会把 worker 入口指到 `lib/worker.js`，并在 worker 里分发。`pino/file` 被解析成本仓库 `file.js`。不能同时传 `target` 和 `targets`；也不能把 `opts.transport` 和另一个 stream 一起用。主线程看不到各个 target 的 IO。

## 踩过的坑

1. **`prettyPrint` 已删除**：固定 10.3.1 看到该选项直接 `throw`。开发着色要单独接 `pino-pretty` 包，不能当核心开关。

2. **browser / Edge 不是同一条 Node 热路径**：`package.json` 的 `browser` 字段指向 `browser.js`，落到 console API，没有 `thread-stream`。不能把 Node transport 性能故事搬到 Workers。

3. **fatal 会 `flushSync`，但 process.exit 仍可能赶在 worker 就绪前**：`fatal` 对当前 stream 调 `flushSync`；transport 的 process `exit` 处理器还会 `flushSync` + 必要时 `sleep(100)`。合规场景仍应单独验证同步落盘，不能只靠“打了 fatal”。

4. **自定义 formatters.level + transport.targets 被拒绝**：`createArgsNormalizer` 在两者同时出现时抛错。多目标 worker 依赖标准 level 前缀。

5. **旧页里的吞吐倍数不能再用**：本轮未跑 benchmark，不引用相对 winston 的固定倍数或绝对 ops/sec。

## 适用 vs 不适用场景

**适用**：

- Node 后端需要 NDJSON，希望主线程只做拼接和一次 `stream.write`
- 用 child logger 在请求上注入 `reqId` / `traceId`，且不想为 child 重建 level 方法
- Fastify / Express / Koa 里替换 `console.log`，把收集留给 stdout 或 transport
- 接受默认 `sonic-boom` / `thread-stream` 依赖边界

**不适用**：

- 只在浏览器或 Edge 里打日志——应评估 `browser.js`，不要假定 worker transport
- 短生命周期函数里为几个日志启动 worker——直接 stdout / sonic-boom 往往更简单
- 需要核心内置 pretty-print 开关——10.3.1 已删除该选项
- 审计日志必须同步落盘且不能依赖 worker 退出钩子——要单独设计同步 destination

## 固定版本边界

- 本文绑定 `pinojs/pino@6b344980...`，tag 与 npm `pino@10.3.1` 的 `gitHead` 均为该提交。
- 默认：`level=info`，`timestamp=epochTime`，`messageKey=msg`，`errorKey=err`，`base={pid,hostname}`，`depthLimit=5`，`edgeLimit=100`。
- 依赖含 `thread-stream@^4`、`sonic-boom@^4`、`@pinojs/redact`、`safe-stable-stringify`、`pino-abstract-transport`。
- `prettyPrint` 不再受支持。许可为 MIT。
- 本文未安装依赖、未运行上游测试、未测吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **把“不该输出”变成空函数**——少一个 level 分支，比在热路径里做比较更干净。
2. **预拼接比通用序列化更接近热路径成本**——lsCache 和 chindings 把不变的前缀提前付清。
3. **child 是原型委托，不是新引擎**——无 options 的 child 只多一段预拼字段。
4. **慢 IO 必须离开主线程，也必须承认退出窗口**——transport 把转发交给 worker，fatal / process exit 只尽力 flush。

## 应用型自测

1. 默认 `pino()` 上调用 `log.debug("x")`，会走到 `asJson` 吗？
2. `pino({ prettyPrint: true })` 在 10.3.1 会启用着色吗？
3. `pino.transport({ target: "pino/file", targets: [...] })` 合法吗？

检查点：

1. 不会。默认 level 是 info，`setLevel` 把 `debug` 赋成 `noop`。
2. 不会。该选项会抛错，必须改用独立的 pino-pretty。
3. 不合法。`target` 与 `targets` 只能选一个。

## 延伸阅读

- 官方网站：[getpino.io](https://getpino.io/)
- 固定源码：[pinojs/pino](https://github.com/pinojs/pino) —— 本文绑定提交 `6b344980eae3ebed904fc87caf4bba0ab9dbe946`
- 必读实现：`lib/proto.js`、`lib/levels.js`、`lib/tools.js`、`lib/transport.js`
- [[fastify]] —— 默认集成 pino
- [[sentry-javascript]] —— 错误上报是另一条管道，不能替代结构化日志

## 关联

- [[fastify]] —— 默认 logger 就是 pino
- [[express]] —— 可用 pino-http 替换 morgan
- [[koa]] —— 同样不绑框架，middleware 里挂 child 即可
- [[sentry-javascript]] —— 异常信封走 Sentry SDK；pino 只管本地 / 收集器日志
- [[prom-client]] —— 指标是另一条可观测信号，不替代日志
- [[grafana]] —— Loki 常作为 pino transport 下游
- [[elasticsearch]] —— 另一类 NDJSON 收集终点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[prom-client]] —— prom-client — Node 服务暴露监控指标的事实标准 SDK
