---
title: p-retry — 给会失败的异步函数做指数退避重试
description: 固定 8.0.0：函数入口、默认 10 次退避，以及非网络 TypeError 永不重试
来源: https://github.com/sindresorhus/p-retry
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/p-retry
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 35681f6c70f8ca2bdcb9542281147679184269fa
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.0
---

## 是什么

p-retry 把「再试一次」收成一个函数：你交给它的是**会返回 Promise 的函数**，不是已经在飞的 Promise。日常类比：它像自动售货机的退币再投币——同一枚硬币不会自己跳回去，你得再按一次按钮。

```js
import pRetry, {AbortError} from 'p-retry'

const blob = await pRetry(async () => {
  const response = await fetch('https://example.com/unicorn')
  if (response.status === 404) throw new AbortError(response.statusText)
  return response.blob()
}, {retries: 5})
```

固定 `8.0.0` 只依赖 `is-network-error`，用来判断哪些 `TypeError` 算网络失败。它和 [[p-timeout]] 在 README 里互列为 Related，但**不是**运行时依赖。

## 为什么重要

不看入口形状，很容易把重试、超时、HTTP 客户端混成一句话：

- 为什么 `pRetry(fetch(url))` 这种写法对不上 API
- 为什么默认会再试 10 次，第一次失败后先等约 1 秒
- 为什么普通 `TypeError` 即使 `shouldRetry` 返回 true 也不会再跑
- 为什么旧文档里的 `forever: true` 在 8.0.0 会直接抛错

一句话：p-retry 的合同是 **函数 + 次数预算 + 指数等待 + 少数硬中止**。

## 核心要点

固定 8.0.0 的主链可以拆成五步：

1. **规范化选项**：默认 `retries=10`、`factor=2`、`minTimeout=1000`、`maxTimeout` / `maxRetryTime` 为 `Infinity`、`randomize=false`。`forever` 已被删除。
2. **调用 `input(attemptNumber)`**：`attemptNumber` 从 1 起。成功就返回。
3. **失败先走 `onAttemptFailure`**：`AbortError` 立刻抛出 `originalError`，三套回调都不跑。
4. **其余错误按顺序问三件事**：`shouldConsumeRetry` → `onFailedAttempt` → `shouldRetry`。非网络 `TypeError` 在预算未耗尽时也会中止，且不调用 `shouldRetry`。
5. **决定要重试才等待**：delay 是 `round(random * minTimeout * factor^(attempt-1))`，再被 `maxTimeout` 和剩余 `maxRetryTime` 截断。`maxRetryTime` 用 `performance.now()`。

`makeRetriable(fn, options)` 只是每次调用再包一层 `pRetry`。

## 实践示例

### 案例 1：404 用 AbortError 停掉后续重试

```js
import pRetry, {AbortError} from 'p-retry'

await pRetry(async () => {
  const response = await fetch('/item/1')
  if (response.status === 404) throw new AbortError(response.statusText)
  if (!response.ok) throw new Error(response.statusText)
  return response.json()
}, {retries: 5})
```

`AbortError` 不是最终抛给调用方的对象；外面接到的是它的 `originalError`。

### 案例 2：限流错误不消耗次数

```js
await pRetry(run, {
  retries: 2,
  shouldConsumeRetry: ({error}) => !(error instanceof RateLimitError),
})
```

返回 `false` 时这次失败不减 `retries`、不抬退避，但仍受 `maxRetryTime` 约束。

### 案例 3：把现有函数变成可重试入口

```js
import {makeRetriable} from 'p-retry'

const fetchWithRetry = makeRetriable(fetch, {retries: 5})
await fetchWithRetry('https://example.com')
```

每次调用都是一次独立的 `pRetry` 循环，不会共享次数。

## 踩过的坑

1. **把已经创建的 Promise 丢进去**：`input` 必须是函数。`pRetry(fetch(url))` 不会在失败后重新发起请求。
2. **以为 `shouldRetry: () => true` 能救所有 TypeError**：非网络 `TypeError` 在源码里硬中止，测试也断言 `shouldRetry` 不会被叫到。
3. **把 `retries: 5` 理解成总共跑 5 次**：这是**额外重试次数**。默认 10 表示最多 11 次尝试。
4. **继续写 `forever: true`**：固定版本直接抛 `The forever option is no longer supported`。
5. **把 p-retry 写成 p-timeout 的包装**：8.0.0 不依赖 [[p-timeout]]；v6 依赖的是 `retry` 包，也不是 timeout。

## 适用 vs 不适用场景

**适用**：

- 需要给任意 async 函数加次数预算和指数等待
- 想用 `AbortError` / `shouldRetry` 区分「别再试」和「再试」
- 能接受 Node `>=22`，以及网络 `TypeError` 靠 `is-network-error` 启发式判断

**不适用**：

- 只要给**已经开始**的 Promise 加截止时间——那是 [[p-timeout]]
- HTTP 客户端已经自带 retry，例如 [[ky]] / [[ofetch]]，还想再叠一层默认 10 次
- 必须在固定 8.0.0 上使用旧的 `forever` 选项

## 固定版本边界

- 本文绑定 `sindresorhus/p-retry@35681f6c...`，npm `p-retry@8.0.0`；annotated tag `v8.0.0` 与 npm `gitHead` 同指此提交。
- 引擎声明 `node >=22`；运行时依赖只有 `is-network-error@^1.3.0`。
- 同仓 `v7.1.1` 已去掉 `retry` 依赖；`v6.2.1` 仍依赖 `retry@^0.13.1`。本文不绑定这两条线。
- 未安装依赖、未跑 ava/tsd、未测真实网络，状态保持 `UNVERIFIED`。

## 学到什么

1. **重试的对象是函数，不是 Promise 实例**——只有函数才能在失败后再执行一遍。
2. **次数、墙钟和错误类型是三条独立刹车**——`retries`、`maxRetryTime` 和 TypeError 规则不能互相替代。
3. **回调顺序是合同**：先问是否消耗预算，再通知失败，最后决定是否继续。
4. **和 timeout 是组合关系，不是包含关系**。

## 应用型自测

1. `pRetry(fetch(url), {retries: 2})` 在第一次网络失败后，会重新发起请求吗？
2. 默认配置下，第一次失败后大约会先等多久？总共最多会调用 `input` 几次？
3. `shouldRetry` 永远返回 `true` 时，普通 `TypeError('bad')` 会不会重试？

检查点：

1. 不会。传进去的是已经开始的 Promise，不是可再调用的函数。
2. 默认 `minTimeout` 是 1000ms；`retries` 默认 10，最多 11 次尝试。
3. 不会。非网络 `TypeError` 会硬中止，且不调用 `shouldRetry`。

## 延伸阅读

- 官方 README：[sindresorhus/p-retry](https://github.com/sindresorhus/p-retry)
- 固定源码：[sindresorhus/p-retry](https://github.com/sindresorhus/p-retry) —— 本文绑定提交 `35681f6c70f8ca2bdcb9542281147679184269fa`
- [[p-timeout]] —— 给已经开始的 Promise 加计时器，需要组合时由调用方包一层
- [[ky]] —— HTTP 客户端自己实现 retry / timeout，不是本库的包装

## 关联

- [[p-timeout]] —— 入口是 Promise，不是函数
- [[ky]] —— 请求级 retry，默认 limit 与方法 allowlist不同
- [[ofetch]] —— 另一条 fetch wrapper 的 retry 合同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[p-timeout]] —— p-timeout — 给已经开始的 Promise 加一只计时器
