---
title: p-timeout — 给已经开始的 Promise 加一只计时器
description: 固定 7.0.1：装饰 Promise、TimeoutError，以及超时默认不会取消底层工作
来源: https://github.com/sindresorhus/p-timeout
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/p-timeout
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 245066ef7daa5e74024d5b6a188ae599a1b7bfdf
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.1
---

## 是什么

p-timeout 给**已经创建**的 Promise 加一只闹钟。日常类比：你把一张正在烤的饼放上计时器——到点它会告诉你「别再等了」，但烤箱不会因为闹钟响就自动断电，除非这张饼自己实现了 `.cancel()`。

```js
import {setTimeout} from 'node:timers/promises'
import pTimeout from 'p-timeout'

await pTimeout(setTimeout(200), {milliseconds: 50})
// TimeoutError: Promise timed out after 50 milliseconds
```

固定 `7.0.1` 零运行时依赖。它和 [[p-retry]] 在 README Related 里互指，但两边都没有把对方写进 `dependencies`。

## 为什么重要

不区分「装饰 Promise」和「通知生产者停工」，下面这些事会对不上：

- 为什么 `pTimeout(fetch(url), {milliseconds: 50})` 超时后，请求仍可能继续占着连接
- 为什么 README 把 `AbortSignal.timeout()` 写成现代替代
- 为什么 `message: false` 不是抛错，而是变成 `undefined`
- 为什么返回值上还有一个 `.clear()`

一句话：p-timeout 的合同是 **race 一只定时器**，不是通用取消协议。

## 核心要点

固定 7.0.1 可以拆成五步：

1. **检查 `milliseconds`**：必须是 `Math.sign(milliseconds) === 1` 的正数。`Infinity` 合法且不设定时器；负数 / `NaN` / 非数字抛 `TypeError`。
2. **挂上原 Promise**：用 `.then(resolve, reject)` 接入，不把工作再启动一遍。
3. **到点再决定结局**：默认 reject 预先构造的 `TimeoutError`（在 `setTimeout` 外创建，保留调用栈）。
4. **`message` / `fallback` 改写结局**：字符串改 `TimeoutError.message`；`Error` 实例原样 reject；`false` 则 resolve `undefined`；有 `fallback()` 时走 fallback，不再走默认超时错。
5. **尽量收尾**：若原 Promise 有 `.cancel()`，超时会调用它；返回的 Promise 带 `.clear()`，`finally` 里也会清定时器并摘掉 abort listener。

`customTimers` 让测试换掉 `setTimeout` / `clearTimeout`，并以 `.call(undefined, ...)` 调用，避免把 timer 实现当成方法。

## 实践示例

### 案例 1：默认超时错误

```js
import pTimeout, {TimeoutError} from 'p-timeout'

try {
  await pTimeout(slowWork(), {milliseconds: 50})
} catch (error) {
  if (error instanceof TimeoutError) {
    // 默认 message：Promise timed out after 50 milliseconds
  }
}
```

### 案例 2：超时后换一条路，而不是抛错

```js
await pTimeout(slowWork(), {
  milliseconds: 50,
  fallback: () => pTimeout(slowWork(), {milliseconds: 300}),
})
```

README 用这个例子表达「超时后可以再包一次」。它**不会**自动调用 [[p-retry]]。

### 案例 3：只撤掉闹钟，不等待超时

```js
const pending = pTimeout(slowWork(), {milliseconds: 2000})
pending.clear()
await pending
```

`.clear()` 取消定时器。原 Promise 仍按自己的节奏结束。

## 踩过的坑

1. **以为超时等于取消工作**：普通 Promise 没有 `.cancel()`。`fetch` 要停工，得把 `AbortSignal` 传进 `fetch` 自己。
2. **把 `message: false` 当成关闭超时**：它会在到点后 **resolve `undefined`**，不是忽略超时。
3. **对 `milliseconds: 0` 或负数抱期望**：`Math.sign` 不是 +1 就抛 `TypeError`。
4. **用 `pTimeout` 代替 p-retry**：timeout 不会重新调用函数；要重试得自己写 `fallback` 或外面再包 [[p-retry]]。
5. **忽略 README 的 AbortSignal 提示**：`AbortSignal.timeout()` 能通知 `fetch` 这类生产者；本轮未执行该 API，只记录文档合同。

## 适用 vs 不适用场景

**适用**：

- 已经有一个 Promise，只想给等待加上截止时间
- 测试里需要 `customTimers` 躲开 fake timers
- 原 Promise 实现了 `.cancel()`（例如 `p-cancelable`），希望超时联动取消

**不适用**：

- 必须让 `fetch` / 长循环真正停下来——优先 `AbortSignal.timeout()` 或自己把 `signal` 往下传
- 需要按次数重试——那是 [[p-retry]]
- HTTP 客户端已经提供 per-attempt / total timeout，例如 [[ky]]

## 固定版本边界

- 本文绑定 `sindresorhus/p-timeout@245066ef...`，npm `p-timeout@7.0.1`；annotated tag `v7.0.1` 与 npm `gitHead` 同指此提交。
- 引擎声明 `node >=20`；`package.json` 无运行时依赖。
- README 把 `AbortSignal.timeout()` 列为现代替代；本文未运行该 API，也不比较浏览器覆盖。
- 未安装依赖、未跑 ava/tsd、未测 fake timers，状态保持 `UNVERIFIED`。

## 学到什么

1. **timeout 装饰的是 Promise 实例**——它不能让函数再跑一遍。
2. **闹钟响不等于烤箱关**：没有 `.cancel()` 或 `AbortSignal`，底层工作可以继续。
3. **`message` 的三种写法结局完全不同**：改文案、换错误、或静默成功。
4. **和 p-retry 要由调用方组合**，例如 `pRetry(() => pTimeout(work(), {milliseconds}))`。

## 应用型自测

1. `pTimeout(fetch(url), {milliseconds: 50})` 超时后，浏览器 / Node 一定会取消这次 HTTP 请求吗？
2. `{milliseconds: 50, message: false}` 到点后，Promise 是 reject 还是 resolve？值是什么？
3. `pTimeout` 的第一个参数应该是函数还是 Promise？

检查点：

1. 不一定。只有原 Promise 实现了 `.cancel()`，或你把 `AbortSignal` 传进 `fetch`，才会停工。
2. resolve，值是 `undefined`。
3. Promise。函数入口属于 [[p-retry]]。

## 延伸阅读

- 官方 README：[sindresorhus/p-timeout](https://github.com/sindresorhus/p-timeout)
- 固定源码：[sindresorhus/p-timeout](https://github.com/sindresorhus/p-timeout) —— 本文绑定提交 `245066ef7daa5e74024d5b6a188ae599a1b7bfdf`
- [[p-retry]] —— 重试的是函数；组合超时需要调用方包一层
- [[ky]] —— 自带 per-attempt timeout 与可选 totalTimeout

## 关联

- [[p-retry]] —— 函数级重试，固定 8.0.0 不依赖本库
- [[ky]] —— 请求超时写在 HTTP 客户端里

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[p-retry]] —— p-retry — 给会失败的异步函数做指数退避重试
