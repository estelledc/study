# p-retry / p-timeout source review (writer FN)

> 用途：记录 `p-retry` 与 `p-timeout` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fn` 标记 2026-08-27 平行 writer FN，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FN
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、timer mock、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- excluded slugs：未改 ky / got / ofetch / axios / wretch 正文，只允许生成段反向链接

## p-retry

- canonical source：`https://github.com/sindresorhus/p-retry`
- revision：`35681f6c70f8ca2bdcb9542281147679184269fa`
- git tag：annotated `v8.0.0` 解引用到该提交
- package：`p-retry@8.0.0`
- license：MIT
- engines：`node >=22`
- runtime dependency：`is-network-error@^1.3.0`
- provenance：npm `p-retry@8.0.0` 的 `gitHead` 与 tag peel 一致
- also observed：`v7.1.1` 已只依赖 `is-network-error`；`v6.2.1` 依赖 `retry@^0.13.1`。未绑定这两条线。
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `test.js`
- observed：
  - 默认导出 `pRetry(input, options)`；`input` 接收从 1 起的 `attemptNumber`，返回 Promise 或同步值；
  - 另导出 `AbortError` 与 `makeRetriable(fn, options)`；后者每次调用都包一层 `pRetry`；
  - 默认 `retries=10`、`factor=2`、`minTimeout=1000`、`maxTimeout=Infinity`、`maxRetryTime=Infinity`、`randomize=false`；
  - 传入 `forever` 直接抛错，文档要求改用 `retries: Infinity`；
  - 退避：`round(random * minTimeout * factor^(attempt-1))`，再 `min` 到 `maxTimeout`；`randomize` 时 `random = Math.random()+1`，否则为 1；`factor<=0` 会被改成 1；
  - 失败回调顺序：`shouldConsumeRetry` → `onFailedAttempt` → `shouldRetry`；`AbortError` 直接抛 `originalError`，三套回调都不跑；
  - 非网络 `TypeError` 在预算未耗尽时也会中止，且不调用 `shouldRetry`；网络错误靠 `is-network-error` 放行；
  - `shouldConsumeRetry===false` 不消耗 `retries`、不累加退避，但仍受 `maxRetryTime` 约束；
  - `maxRetryTime` 用 `performance.now()`；delay 还会再被剩余时间截断；
  - `signal` 在尝试前后和等待期间检查；`unref` 只调用 `setTimeout` 返回值上的 `.unref?.()`。

## p-timeout

- canonical source：`https://github.com/sindresorhus/p-timeout`
- revision：`245066ef7daa5e74024d5b6a188ae599a1b7bfdf`
- git tag：annotated `v7.0.1` 解引用到该提交
- package：`p-timeout@7.0.1`
- license：MIT
- engines：`node >=20`
- runtime dependency：无
- provenance：npm `p-timeout@7.0.1` 的 `gitHead` 与 tag peel 一致
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `test.js`
- observed：
  - `pTimeout(promise, options)` 装饰**已经创建**的 Promise，不负责启动工作；
  - `milliseconds` 必须是 `Math.sign===1` 的正数；`Infinity` 不设定时器；负数 / `NaN` / 非数字抛 `TypeError`；
  - 默认在超时后 reject 预先构造的 `TimeoutError`（在 `setTimeout` 外创建以保留栈）；
  - `message` 为字符串时改写 `TimeoutError.message`；为 `Error` 时 reject 该实例；为 `false` 时 resolve `undefined`；
  - 提供 `fallback()` 时超时走 fallback，不再走默认 `TimeoutError`；fallback 抛错则 reject 该错；
  - 若原 Promise 有 `.cancel()`，超时会调用它；普通 `fetch` Promise 没有这个方法，超时不会自动取消底层工作；
  - 返回值带 `.clear()`，用 `customTimers.clearTimeout` 清定时器；`finally` 也会 `clear` 并移除 abort listener；
  - `customTimers` 的 `setTimeout` / `clearTimeout` 以 `.call(undefined, ...)` 调用；
  - README 把 `AbortSignal.timeout()` 写成能通知生产者停工的现代替代，本轮未执行该 API。

## 二者关系

- 固定版本里**没有**互相依赖：`p-retry@8.0.0` 不引用 `p-timeout`，`p-timeout@7.0.1` 也不引用 `p-retry`。
- README Related 互相链接；组合要由调用方完成，例如 `pRetry(() => pTimeout(work(), {milliseconds}))`。
- 入口形状不同：retry 吃函数，timeout 吃 Promise。
