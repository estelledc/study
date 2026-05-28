---
title: "Playwright — 浏览器自动化的工程艺术"
description: 跨进程 + 跨语言的协议设计 + 自动等待 + auto-retry locator，把"测试浏览器"做到工业级
sidebar:
  order: 29
  label: "microsoft/playwright"
---

> microsoft/playwright v1.61.0-next（2026-05），Apache 2.0。
>
> Playwright 是 Microsoft 出品的浏览器自动化工具，
> Selenium / Puppeteer 之后的"第三代"答案。
>
> 它的工程艺术不在某一处惊艳——是**多个细小判断累加**：
> 跨进程协议设计、auto-wait 取代 sleep、locator 自动 retry、
> screenshot/video/trace 内置、跨语言 SDK（TS/Python/Java/.NET）。
>
> Season 5 第三篇——"验证基础设施"的范例。本笔记按 v1.1 项目类型分支
> [E·测试/验证工具](/study/method/#分支-e测试验证工具) 重写：心脏文件 = test runner 主循环 +
> auto-wait locator + cross-browser 协议三件套。

## 一句话定位

**Playwright = 一个浏览器驱动 server（每浏览器一个进程）+ 一份跨语言客户端协议 + auto-wait locator API。**
你写 `await page.click('button')` 自动等元素出现 + 可见 + 稳定才点击。
test、screenshot、video、trace 都是内置而不是插件。

## Why（为什么是它而不是 Selenium / Puppeteer / Cypress）

浏览器自动化工具的代际：

```
2004: Selenium WebDriver
   - 用 W3C WebDriver 标准协议
   - 每浏览器一个 driver binary
   - 同步 API（早期），后期补 async
   - 痛点：经常 flaky，要写 sleep/wait

2017: Puppeteer
   - Chrome only
   - 用 Chrome DevTools Protocol（CDP）直连
   - 比 Selenium 快很多
   - 痛点：仍要手动 wait

2020: Cypress
   - 跑在浏览器内（不是远程驱动）
   - DX 极好，可视化 runner
   - 痛点：只能跑 Chromium，不能多 tab、不能跨域

2020: Playwright
   - 多浏览器（Chromium + Firefox + WebKit）
   - 自定义协议（在 CDP 之上抽象）
   - auto-wait 内置
   - 多语言 SDK
```

**Playwright 的判断分水岭**：

1. **多浏览器一致体验**——补丁过的 Firefox 和 WebKit 让"跨浏览器测试"真实可行
2. **协议层是 framework 主权**——不被 CDP 的局限锁死
3. **Auto-wait**——`page.click(selector)` 自动等可点击，**默认行为消除 90% flaky**
4. **Locator API 而非 selector 字符串**——locators 自动 retry
5. **内置 trace viewer**——失败时给一份"时间倒带"调试录像
6. **Codegen**——`playwright codegen url` 录制操作生成代码
7. **Test runner 内置**——不依赖 Jest/Mocha

| 工具 | 浏览器 | 协议 | auto-wait | trace viewer | 跨语言 |
|---|---|---|---|---|---|
| Selenium | 全 | W3C WebDriver | ✗ | ✗ | ✓ |
| Puppeteer | Chrome | CDP | 部分 | ✗ | TS/JS only |
| Cypress | Chromium | DOM 内嵌 | ✓ | ✓（部分） | TS/JS only |
| **Playwright** | **C+F+W** | **自定义** | **✓** | **✓ 完整** | **TS/Py/Java/.NET** |

**为什么不是 Selenium**：Selenium 是 web 自动化的标准化产物，但**API 设计陈旧**，
async 体验差，flaky 问题靠 sleep 缓解。

**为什么不是 Puppeteer**：Puppeteer 是 Google 出品（Chrome only）。
**Microsoft 把 Puppeteer 团队挖了**——同帮人做出来 Playwright。
Puppeteer 是上一代，Playwright 是下一代。

**为什么不是 Cypress**：Cypress 在 DX 上很好（IDE 友好、time-travel debug），
但**架构限制大**——只能 Chromium、不能多 tab、不能跨域、不能多 origin。
Playwright 没这些限制。

**Playwright 的代价**：
- 启动较重（要装多个浏览器二进制）
- 学习曲线略高于 Cypress
- API 比 Cypress 更"程序化"、不那么"领域语言"

## 三层架构总览（Figure 1）

![Playwright 三层架构图](/projects/playwright/01-architecture.webp)

整张图表达三件事：

1. **三层是物理隔离的**——test runner 子进程 / Playwright server 进程 / 浏览器进程，崩一层不带垮全栈
2. **协议层是主权**——CDP、Juggler、WebKit Inspector 是三套不同的 wire protocol，但 Layer 2 的 `Page` 抽象把它们抹平
3. **auto-wait 在 Layer 2 里**——不是写在测试里、不是写在浏览器里，是 server 层主导的强制收敛流程

## 仓库地形（Layer 2）

```
playwright/
├── packages/
│   ├── playwright/                        ← ★ test runner（@playwright/test）
│   │   └── src/
│   │       ├── runner/
│   │       │   ├── dispatcher.ts          ← 659 行：worker pool 调度核心
│   │       │   ├── workerHost.ts          ← 子进程 lifecycle
│   │       │   ├── taskRunner.ts          ← 任务图执行
│   │       │   └── reporters.ts
│   │       ├── worker/
│   │       │   ├── workerMain.ts          ← 681 行：单 worker 跑 test 主循环
│   │       │   ├── fixtureRunner.ts       ← fixture setup/teardown 拓扑
│   │       │   ├── timeoutManager.ts
│   │       │   └── testInfo.ts
│   │       ├── matchers/                  ← expect 扩展（toHaveText / toBeVisible 等）
│   │       └── transform/                 ← TS / babel 转换层
│   │
│   ├── playwright-core/                   ← ★ 核心（client + server）
│   │   └── src/
│   │       ├── client/                    ← 客户端 API（用户写测试用的）
│   │       │   ├── connection.ts          ← 协议连接管理
│   │       │   ├── channelOwner.ts        ← 频道对象基类
│   │       │   ├── page.ts                ← 916 行：Page 类
│   │       │   ├── browser.ts             ← Browser 类
│   │       │   └── network.ts             ← Request/Response
│   │       ├── server/                    ← ★ 服务端（驱动浏览器）
│   │       │   ├── frames.ts              ← 1874 行：frame 管理 + waitForSelector
│   │       │   ├── page.ts                ← Page 服务端实现 + performActionPreChecks
│   │       │   ├── dom.ts                 ← 1039 行：auto-wait + _retryAction 核心
│   │       │   ├── network.ts             ← 网络拦截
│   │       │   ├── chromium/              ← CDP 通道
│   │       │   │   └── crConnection.ts
│   │       │   ├── firefox/               ← Juggler 通道
│   │       │   │   └── ffConnection.ts
│   │       │   └── webkit/                ← WebKit Inspector 通道
│   │       └── protocol/                  ← 跨进程协议
│   │           ├── validator.ts
│   │           └── serializers.ts
│   │
│   ├── playwright-browser-chromium/       ← Chromium 二进制 patches
│   ├── playwright-webkit/                 ← Microsoft 自维护 WebKit fork
│   └── trace-viewer/                      ← trace 查看器（独立 web app）
│
└── browser_patches/                       ← ★ 浏览器引擎 patch 源
    ├── firefox/juggler/                   ← 给 Firefox 加自动化协议（自家造轮子）
    └── webkit/                            ← 给 WebKit 加 Inspector 扩展
```

**心脏文件四件套**（v1.1 分支 E 要求至少 4 个）：

1. `packages/playwright/src/runner/dispatcher.ts:35`（659 行）—— worker 池调度
2. `packages/playwright/src/worker/workerMain.ts:289`（681 行）—— 单 test 执行主循环
3. `packages/playwright-core/src/server/dom.ts:316`（1039 行）—— `_retryAction` auto-wait 核心
4. `packages/playwright-core/src/server/chromium/crConnection.ts:45`—— CDP 协议层

外加 `browser_patches/firefox/juggler/`（FF patch）和 `browser_patches/webkit/`（WebKit patch）—— 三浏览器协议三套实现。

## Layer 3 · 三段精读（v1.1 分支 E 要求 ≥ 3 段）

### 段 1 · Test Runner 主循环 + Fixture 注入

**关键文件**：`packages/playwright/src/runner/dispatcher.ts` + `worker/workerMain.ts` + `worker/fixtureRunner.ts`。

#### 1.1 Dispatcher：worker 池调度

[dispatcher.ts:71-108@414fa0b](https://github.com/microsoft/playwright/blob/414fa0b97e2807ab4136518e41c70f018f5442f9/packages/playwright/src/runner/dispatcher.ts#L71-L108)：

```typescript
private _scheduleJob() {
  // NOTE: keep this method synchronous for easier reasoning.

  // 0. No more running jobs after stop.
  if (this._isStopped)
    return;

  // 1. Find a job to run.
  const jobIndex = this._findFirstJobToRun();
  if (jobIndex === -1)
    return;
  const job = this._queue[jobIndex];

  // 2. Find a worker with the same hash, or just some free worker.
  let workerIndex = this._workerSlots.findIndex(
    w => !w.jobDispatcher && w.worker
      && w.worker.hash() === job.workerHash
      && !w.worker.didSendStop());
  if (workerIndex === -1)
    workerIndex = this._workerSlots.findIndex(w => !w.jobDispatcher);
  if (workerIndex === -1) {
    // No workers available, bail out.
    return;
  }

  // 3. Claim both the job and the worker slot.
  this._queue.splice(jobIndex, 1);
  const jobDispatcher = new JobDispatcher(job, this._testRun, () => this.stop().catch(() => {}));
  this._workerSlots[workerIndex].jobDispatcher = jobDispatcher;

  // 4. Run the job. This is the only async operation.
  void this._runJobInWorker(workerIndex, jobDispatcher).then(() => {
    // 5. Release the worker slot.
    this._workerSlots[workerIndex].jobDispatcher = undefined;
    // 6. Check whether we are done or should schedule another job.
    this._checkFinished();
    this._scheduleJob();
  });
}
```

旁注：

- **同步函数**：作者特意标注 `keep this method synchronous`——状态机式调度，比 promise 链好推理
- **workerHash 优先复用**：相同 project / config 的 job 派给同 worker，省去重启子进程的开销
- **`fire-and-forget` 唯一异步**：步骤 4 是整个调度里唯一的 `void promise`，外层不 await——回调里再 `_scheduleJob()` 形成调度循环
- **重试不是同 worker 重跑**：失败的 job 通过 `result.newJob` 重新进 queue，可能派给新 worker——彻底重置 V8 / DOM 状态
- **slot 模型代替队列**：worker 不进 queue，只在 `_workerSlots` 里"插旗占位"——查找 O(N) 但 N 很小（通常 4-8）

→ **怀疑 1**：这里的 `void this._runJobInWorker(...).then(...)` 没有 catch。
如果 `_runJobInWorker` 内部抛出未捕获异常会怎样？翻 `_runJobInWorker:110-158` 看到内部 `try/catch` 由 `JobDispatcher` 兜底——
但**调度回调本身没有错误边界**。在极端情况（比如 dispatcher 自己 OOM）整个 dispatcher 会静默死掉。
对比 K8s controller 通常会包一层 `wait.Forever()`——Playwright 没这层冗余。可能是因为 dispatcher 死了 = test 进程死了 = 用户能看到，不需要再保护。

#### 1.2 Worker 主循环 ：`WorkerMain._runTest`

[workerMain.ts:289-348@414fa0b](https://github.com/microsoft/playwright/blob/414fa0b97e2807ab4136518e41c70f018f5442f9/packages/playwright/src/worker/workerMain.ts#L289-L348)：

```typescript
private async _runTest(test: testNs.TestCase, retry: number, nextTest: testNs.TestCase | undefined) {
  const testInfo = new TestInfoImpl(this._config, this._project, this._params, test, retry, {
    onStepBegin: payload => this.dispatchEvent('stepBegin', payload),
    onStepEnd: payload => this.dispatchEvent('stepEnd', payload),
    onAttach: payload => this.dispatchEvent('attach', payload),
    onTestPaused: payload => {
      this._resumePromise = new ManualPromise();
      this.dispatchEvent('testPaused', payload);
      return this._resumePromise;
    },
  });
  // ... process annotations (skip / fixme / fail / slow) ...

  if (!this._isStopped)
    this._fixtureRunner.setPool(test._pool!);

  const suites = getSuites(test);
  const reversedSuites = suites.slice().reverse();
  const nextSuites = new Set(getSuites(nextTest));

  testInfo._timeoutManager.setTimeout(test.timeout);
  // ...

  this._currentTest = testInfo;
  globals.setCurrentTestInfo(testInfo);
  setExpectConfig({ testInfo, /* ... */ });
  this.dispatchEvent('testBegin', buildTestBeginPayload(testInfo));

  const isSkipped = testInfo.expectedStatus === 'skipped';
  const hasAfterAllToRunBeforeNextTest = reversedSuites.some(suite => {
    return this._activeSuites.has(suite)
        && !nextSuites.has(suite)
        && suite._hooks.some(hook => hook.type === 'afterAll');
  });
  if (isSkipped && nextTest && !hasAfterAllToRunBeforeNextTest) {
    // Fast path - this test is skipped, and there are more tests that will handle cleanup.
    testInfo.status = 'skipped';
    this.dispatchEvent('testEnd', buildTestEndPayload(testInfo));
    return;
  }
  // ... run test body + fixture setup/teardown ...
}
```

旁注：

- **TestInfo 是单 test 的 god object**：`testInfo.expectedStatus / annotations / _timeoutManager / status` 全在这里
- **onTestPaused 是 debug 钩子**：用户按 Playwright Inspector 的 pause 时——worker 进程**真停在这里等 `ManualPromise`**
- **suites 反转扫**：`reversedSuites` 用来从最内层 hook 开始倒推 cleanup 顺序——`afterEach` 离 test 最近先跑
- **nextTest 的 cleverness**：知道下一个 test 是谁，能判断"当前 suite 的 `afterAll` 现在跑还是延后"
- **fast-path skip**：跳过的 test 如果 cleanup hook 不需要现在跑，**直接 `dispatchEvent('testEnd')` 不进 timeout 管理**——大量 `test.skip` 时性能至关重要

→ 教学类比：这相当于 **餐厅服务员（worker）拿着订单（testInfo），先看顾客是不是要走（skip），不要走的话才推到厨房**。
重要的是这种 fast-path 优化——大型 test suite 里 skip 比例可能超过 50%（条件 skip / fixme），快路径直接拒绝是能上百倍提速的关键。

#### 1.3 Fixture：use() 双向暂停模型

[fixtureRunner.ts:106-134@414fa0b](https://github.com/microsoft/playwright/blob/414fa0b97e2807ab4136518e41c70f018f5442f9/packages/playwright/src/worker/fixtureRunner.ts#L106-L134)：

```typescript
let called = false;
const useFuncStarted = new ManualPromise<void>();
const useFunc = async (value: any) => {
  if (called)
    throw new Error(`Cannot provide fixture value for the second time`);
  called = true;
  this.value = value;
  this._useFuncFinished = new ManualPromise<void>();
  useFuncStarted.resolve();
  await this._useFuncFinished;   // ← fixture 在这里"睡眠"，等 test 跑完
};

const workerInfo: WorkerInfo = { /* ... */ };
const info = this.registration.scope === 'worker' ? workerInfo : testInfo;
this._selfTeardownComplete = (async () => {
  try {
    await this.registration.fn(params, useFunc, info);
    if (!useFuncStarted.isDone())
      throw new Error(`use() was not called in fixture "${this.registration.name}"`);
  } catch (error) {
    this.failed = true;
    if (!useFuncStarted.isDone())
      useFuncStarted.reject(error);
    else
      throw error;
  }
})();
await useFuncStarted;
```

旁注：

- **`useFunc` 是一个会"挂起"的函数**：fixture 写法是 `setup → await use(value) → teardown`，`use()` 内部 await `_useFuncFinished` 把 fixture 卡住
- **双 ManualPromise 协调**：`useFuncStarted`（setup 阶段完成信号）+ `_useFuncFinished`（teardown 触发信号）
- **fixture 函数自身是个长生命周期的 async**：`_selfTeardownComplete` 是这个 async 的全程，跨多个 await 边界
- **scope=worker 拿 workerInfo，否则拿 testInfo**：同一段代码两种生命周期
- **错误传播分两路**：use 没调用过 = `useFuncStarted.reject`；use 调过了再抛 = 直接 throw

→ **怀疑 2**：这个 use() 模型把 setup 和 teardown 写在同一个函数里，**用户的 fixture 函数会在 test 运行期间被挂起几十秒**。
V8 对长时间 suspend 的 async function 有特殊处理吗？翻 V8 内部——挂起的 async 只是个普通的微任务+闭包，
**没有额外开销**，但闭包持有的 DOM 引用 / network handle 都不会释放——这意味着**fixture 写得不好极易内存泄漏**。
官方建议 `worker-scoped fixture` 不要持有大对象正是这个道理。

→ 教学类比：fixture 像一个**借东西给你的朋友**，他递给你（`use(value)`）然后一直站在门口等你用完归还（`await _useFuncFinished`）。
站着等的时候朋友没干别的事，但他一直在那里——这是 use() 模型的本质。

### 段 2 · Auto-Waiting Locator 实现（核心：`_retryAction`）

**关键文件**：`packages/playwright-core/src/server/dom.ts:316-377`。这是 Playwright "consume flaky" 的工程心脏。

[dom.ts:316-377@414fa0b](https://github.com/microsoft/playwright/blob/414fa0b97e2807ab4136518e41c70f018f5442f9/packages/playwright-core/src/server/dom.ts#L316-L377)：

```typescript
async _retryAction(
  progress: Progress,
  actionName: string,
  action: (progress: Progress, retry: number) => Promise<PerformActionResult>,
  options: { trial?: boolean, force?: boolean, skipActionPreChecks?: boolean, noAutoWaiting?: boolean }
): Promise<'error:notconnected' | 'done'> {
  let retry = 0;
  // We progressively wait longer between retries, up to 500ms.
  const waitTime = [0, 20, 100, 100, 500];
  const noAutoWaiting = (options as any).__testHookNoAutoWaiting ?? options.noAutoWaiting;

  while (true) {
    if (retry) {
      progress.log(`retrying ${actionName} action${options.trial ? ' (trial run)' : ''}`);
      const timeout = waitTime[Math.min(retry - 1, waitTime.length - 1)];
      if (timeout) {
        progress.log(`  waiting ${timeout}ms`);
        const result = await progress.race(this.evaluateInUtility(
          ([injected, node, timeout]) => new Promise<void>(f => setTimeout(f, timeout)),
          timeout));
        if (result === 'error:notconnected')
          return result;
      }
    } else {
      progress.log(`attempting ${actionName} action${options.trial ? ' (trial run)' : ''}`);
    }
    if (!options.skipActionPreChecks && !options.force && !noAutoWaiting)
      await this._frame._page.performActionPreChecks(progress);
    const result = await action(progress, retry);
    ++retry;
    if (result === 'error:notvisible') {
      if (options.force || noAutoWaiting)
        throw new NonRecoverableDOMError('Element is not visible');
      progress.log('  element is not visible');
      continue;
    }
    if (result === 'error:notinviewport') {
      if (options.force || noAutoWaiting)
        throw new NonRecoverableDOMError('Element is outside of the viewport');
      progress.log('  element is outside of the viewport');
      continue;
    }
    if (result === 'error:optionsnotfound') {
      if (noAutoWaiting)
        throw new NonRecoverableDOMError('Did not find some options');
      progress.log('  did not find some options');
      continue;
    }
    if (result === 'error:optionnotenabled') {
      if (noAutoWaiting)
        throw new NonRecoverableDOMError('Option being selected is not enabled');
      progress.log('  option being selected is not enabled');
      continue;
    }
    if (typeof result === 'object' && 'hitTargetDescription' in result) {
      if (noAutoWaiting)
        throw new NonRecoverableDOMError(`${result.hitTargetDescription} intercepts pointer events`);
      progress.log(`  ${result.hitTargetDescription} intercepts pointer events`);
      continue;
    }
    if (typeof result === 'object' && 'missingState' in result) {
      if (noAutoWaiting)
        throw new NonRecoverableDOMError(`Element is not ${result.missingState}`);
      progress.log(`  element is not ${result.missingState}`);
      continue;
    }
    return result;
  }
}
```

旁注：

- **退避数列写死**：`[0, 20, 100, 100, 500]` ms——前 2 次几乎立刻重试（解决渲染 1-tick 延迟），后面拉长（解决 fetch 完成）
- **noAutoWaiting 是一个 escape hatch**：`force: true` 用户主动跳过；`__testHookNoAutoWaiting` 是 Playwright **自己测试 Playwright** 的钩子
- **progress.race 是关键**：所有等待都和 progress（含全局 timeout）race——超时立刻退出，不会 retry 到天荒地老
- **6 种可恢复错误 + 1 种致命**：`notvisible` / `notinviewport` / `optionsnotfound` / `optionnotenabled` / `hitTargetDescription` / `missingState` 都重试，`error:notconnected`（DOM detach）直接返回
- **performActionPreChecks 在 retry 内**：每次重试前重新检查"是不是有 pending navigation"——这就是为啥点击触发跳转后下一个动作能自动等

[performActionPreChecks @ page.ts:537@414fa0b](https://github.com/microsoft/playwright/blob/414fa0b97e2807ab4136518e41c70f018f5442f9/packages/playwright-core/src/server/page.ts#L537-L542)：

```typescript
async performActionPreChecks(progress: Progress) {
  await this._performWaitForNavigationCheck(progress);
  await this._performLocatorHandlersCheckpoint(progress);
  // Wait once again, just in case a locator handler caused a navigation.
  await this._performWaitForNavigationCheck(progress);
}
```

→ **怀疑 3**：`waitTime` 数组写死 5 个元素（0, 20, 100, 100, 500），如果 retry 超过 5 次就一直用 500ms。
为什么不是指数退避？翻 git log 看到——指数退避在某些场景反而更慢（`100, 200, 400, 800` 第 4 次就是 800ms 了）。
**Playwright 的判断**：UI 的 stable window 通常 < 500ms（CSS transition 默认 200-300ms），超过 500ms 还没稳定 = 大概率失败，
不如保持 500ms 频率多探几次。这是一个**反直觉但符合 UI 物理**的工程决策——和算法的"最优"分开看。

→ 教学类比：这相当于**朋友约你吃饭**——他没到你不会等 1 / 2 / 4 / 8 / 16 分钟（指数），
你会一直发信息"到了吗""到了吗""到了吗"（固定 500ms）—— UI 的等待更像后者，**到/没到是离散事件不是连续衰减**。

#### auto-wait pipeline 全景

`waitForElementState` ([dom.ts:901@414fa0b](https://github.com/microsoft/playwright/blob/414fa0b97e2807ab4136518e41c70f018f5442f9/packages/playwright-core/src/server/dom.ts#L901-L909))：

```typescript
async waitForElementState(progress: Progress, state: 'visible' | 'hidden' | 'stable' | 'enabled' | 'disabled' | 'editable'): Promise<void> {
  const actionName = `wait for ${state}`;
  const result = await this._retryAction(progress, actionName, async progress => {
    return await progress.race(this.evaluateInUtility(async ([injected, node, state]) => {
      return (await injected.checkElementStates(node, [state])) || 'done';
    }, state));
  }, {});
  assertDone(throwRetargetableDOMError(result));
}
```

→ **`injected.checkElementStates` 跑在浏览器进程里**（`evaluateInUtility` = injectedScript），
不是 Node 这边判断——因为只有浏览器自己能精确知道 layout / style。这是**职责分配的工程美学**：
Node 决定"何时重试 + 给 timeout"，浏览器决定"现在状态对不对"。

### 段 3 · Cross-Browser 协议三件套

#### 3.1 Chromium · CDP（Chrome DevTools Protocol）

[crConnection.ts:45-105@414fa0b](https://github.com/microsoft/playwright/blob/414fa0b97e2807ab4136518e41c70f018f5442f9/packages/playwright-core/src/server/chromium/crConnection.ts#L45-L105)：

```typescript
export class CRConnection extends SdkObject {
  private _lastId = 0;
  private readonly _transport: ConnectionTransport;
  readonly _sessions = new Map<string, CRSession>();
  private readonly _protocolLogger: ProtocolLogger;
  private readonly _browserLogsCollector: RecentLogsCollector;
  _browserDisconnectedLogs: string | undefined;
  readonly rootSession: CRSession;
  _closed = false;

  constructor(parent: SdkObject, transport: ConnectionTransport, protocolLogger: ProtocolLogger, browserLogsCollector: RecentLogsCollector) {
    super(parent, 'cr-connection');
    this.setMaxListeners(0);
    this._transport = transport;
    this._protocolLogger = protocolLogger;
    this._browserLogsCollector = browserLogsCollector;
    this.rootSession = new CRSession(this, null, '');
    this._sessions.set('', this.rootSession);
    this._transport.onmessage = this._onMessage.bind(this);
    // onclose should be set last, since it can be immediately called.
    this._transport.onclose = this._onClose.bind(this);
  }

  _rawSend(sessionId: string, method: string, params: any): number {
    const id = ++this._lastId;
    const message: ProtocolRequest = { id, method, params };
    if (sessionId)
      message.sessionId = sessionId;
    this._protocolLogger('send', message);
    this._transport.send(message);
    return id;
  }

  async _onMessage(message: ProtocolResponse) {
    this._protocolLogger('receive', message);
    if (message.id === kBrowserCloseMessageId)
      return;
    const session = this._sessions.get(message.sessionId || '');
    if (session)
      session._onMessage(message);
  }

  async createBrowserSession(): Promise<CDPSession> {
    const { sessionId } = await this.rootSession.send('Target.attachToBrowserTarget');
    return new CDPSession(this.rootSession, sessionId);
  }
}
```

旁注：

- **递增 id 简单粗暴**：`_lastId++` 没用 UUID——单进程内不冲突就够，省 16 字节 / call
- **session 用空串作为 root key**：`_sessions.set('', this.rootSession)`——避开 undefined 检查
- **onclose 必须最后绑**：注释 `since it can be immediately called`——transport 可能在 ctor 还没返回时就触发 close
- **kBrowserCloseMessageId = -9999 是哨兵**：发 `Browser.close` 时用这个 id，response 来了直接忽略——不让 close 自己 race condition
- **createBrowserSession** 通过 `Target.attachToBrowserTarget`：CDP 标准方式拿 browser-level session

#### 3.2 Firefox · Juggler（自家造的协议）

Firefox 不支持 CDP（Mozilla 的策略）。Playwright 的解：在 `browser_patches/firefox/juggler/` 自己实现一份协议。

```
browser_patches/firefox/juggler/
├── components/Juggler.js              ← 161 行：主入口
├── content/                           ← 注入到内容进程的脚本
├── protocol/                          ← 协议消息定义
├── screencast/                        ← 屏幕录制实现
├── NetworkObserver.js                 ← 网络拦截
├── TargetRegistry.js                  ← Tab / Frame 管理
└── patches/                           ← 给 Firefox 源码打的 diff
```

[ffConnection.ts:38@414fa0b](https://github.com/microsoft/playwright/blob/414fa0b97e2807ab4136518e41c70f018f5442f9/packages/playwright-core/src/server/firefox/ffConnection.ts#L38)：

```typescript
export class FFConnection extends EventEmitter {
  // 类似 CR，但消息格式 / session 模型 / event 都是 Juggler 自家定义
}
```

→ **怀疑 4**：维护一个 Firefox patch + Juggler 协议是巨大的工程成本——
每次 Firefox 升级（约 4 周一次）都要 rebase + 验证。Microsoft 为什么愿意承担？
看了 `browser_patches/firefox/UPSTREAM_CONFIG.sh` 看到他们 pin 在特定 tag，**不是每次都 rebase**——
而是定期手工 roll up（roll_from_upstream.sh 脚本里写明了流程）。
**核心判断**：跨浏览器测试是 Playwright 的差异化卖点之一，没了 Firefox = 不能宣称"全浏览器"——
工程成本是为了产品定位主动接受的。

#### 3.3 WebKit · Microsoft 自维护的 fork

```
browser_patches/webkit/
├── embedder/                          ← 嵌入层（解决 Apple 不维护的 platform 问题）
├── patches/                           ← 给 WebKit 源码的 diff
├── pw_run.sh                          ← 启动脚本
└── UPSTREAM_CONFIG.sh                 ← pin 到特定 WebKit revision
```

WebKit 是 Apple 主导的 Safari 内核。Apple 只在 macOS / iOS 上提供 Safari，**不发布跨平台 binary**。
Playwright 的解：**自己 fork WebKit、自己编译跨平台 binary、自己加 Inspector 扩展用作自动化协议**。

旁注：

- **embedder/ 目录是非 Apple 平台的胶水层**——让 WebKit 能在 Linux 跑无头模式
- **patches/ 是源码级 diff**——对 WebKit upstream 打补丁加自动化能力
- **每次 Safari 重大版本都要重新 patch**——Apple 不会接 PR，全 Microsoft 单方面维护
- **跨进程 IPC 是 WebKit 自家 IPC**——既不像 CDP 也不像 Juggler

→ 这是**真正的"跨浏览器"代价**：不是写三套 binding，是**维护三套浏览器引擎的 patch**。
和 [Bun 自己造 JavaScriptCore wrapper](/study/projects/bun/) 是一类工程豪赌。

### 三段对照总览

| 段落 | 文件 | 行数 | 关键机制 | 教学价值 |
|---|---|---|---|---|
| 1 · Test Runner | dispatcher.ts + workerMain.ts + fixtureRunner.ts | 659 + 681 + N | 同步状态机调度 + use() 双 promise + fast-path skip | 看懂"任务图调度"的最小完整实现 |
| 2 · Auto-wait | dom.ts:316 | 1039 | 6 种可恢复错误 + 渐进退避 + injected script 状态判断 | 看懂"如何让 90% flaky 自动消失" |
| 3 · 跨浏览器协议 | crConnection / Juggler / WebKit | N + N + N | 三套 wire protocol 被 Page 抽象抹平 | 看懂"协议主权"的工程豪赌 |

## 横向对比

### vs Selenium — 协议老 vs 协议新

Selenium 用 W3C WebDriver，Playwright 用自家协议。

WebDriver 标准化的代价：每个新 feature 要标准化讨论几年才能落地。
Playwright 自家协议：想到就做，灵活。

→ 标准 vs 创新的取舍。**新项目选 Playwright**，遗留 Selenium 慢慢迁移。

### vs Puppeteer — 同根异花

Puppeteer 团队被 MS 挖走做 Playwright。**Puppeteer 还在维护，但创新慢**。
Playwright 是更新代答案。

如果你只 Chrome、需要极简 API——Puppeteer 仍可用。
否则 Playwright 是默认。

### vs Cypress — DX vs 完备性

Cypress 的 DX 神话：可视化 runner、time-travel debug、丰富的领域语言。
但**架构限制让某些 use case 做不到**：
- 多 tab 测试
- 跨 origin 流（OAuth 跳转）
- 真实 mobile viewport

Playwright 没这些限制，但 DX 略不如 Cypress 那么"开箱即用"——
trace viewer 是异步查看，不是实时。

### vs WebDriverIO — 同生态位

WebDriverIO 也是新一代浏览器自动化，基于 W3C 标准。
**比 Selenium 现代，但和 Playwright 比仍偏传统**——
没有 auto-wait、没有 locator、没有 trace viewer。

### vs Vitest browser mode — 单测/E2E 边界

Vitest 现在也支持 browser mode（基于 Playwright）。**但语义不同**：
Vitest browser 是 component test 取向，Playwright 是 user journey 取向——
看测的是"组件输出"还是"用户操作流"。

## Hands-on（10 分钟内能跑）

```bash
mkdir pw-demo && cd pw-demo
npm init -y
npm install -D @playwright/test
npx playwright install
```

写 `tests/example.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'

test('homepage has title', async ({ page }) => {
  await page.goto('https://playwright.dev/')

  // auto-wait 等到出现 + 可见
  await expect(page).toHaveTitle(/Playwright/)
})

test('docs link works', async ({ page }) => {
  await page.goto('https://playwright.dev/')

  // locator 自动 retry
  await page.getByRole('link', { name: 'Get started' }).click()

  await expect(page).toHaveURL(/.*intro/)
})
```

```bash
npx playwright test
npx playwright show-report      # HTML 报告
```

### Layer 4 · 改一处的实验（v1.1 分支 E 强制：写一个 custom matcher 或 fixture）

#### 实验 A · 写一个 custom matcher（toHaveBackground）

新建 `tests/matchers.ts`：

```typescript
import { expect as baseExpect, type Locator } from '@playwright/test'

export const expect = baseExpect.extend({
  async toHaveBackground(locator: Locator, expected: string, options?: { timeout?: number }) {
    const assertionName = 'toHaveBackground'
    let pass: boolean
    let actual: string

    try {
      // 关键：用 expect.poll 让这个 matcher 也享受 auto-retry
      await baseExpect.poll(async () => {
        actual = await locator.evaluate(el => getComputedStyle(el).backgroundColor)
        return actual
      }, options).toBe(expected)
      pass = true
    } catch (e: any) {
      pass = false
    }

    const message = pass
      ? () => `expected ${locator} not to have background ${expected}`
      : () => `expected ${locator} to have background ${expected}, got ${actual}`

    return {
      message,
      pass,
      name: assertionName,
      expected,
      actual,
    }
  },
})
```

跑个 toy test `tests/matcher.spec.ts`：

```typescript
import { test } from '@playwright/test'
import { expect } from './matchers'

test('button has correct background', async ({ page }) => {
  await page.setContent('<button id="b" style="background: rgb(0, 128, 255)">click</button>')
  await expect(page.locator('#b')).toHaveBackground('rgb(0, 128, 255)')
})
```

```bash
npx playwright test tests/matcher.spec.ts
```

→ **跑一次你才知道**：custom matcher 不是装饰糖，是**复用 auto-wait 的核心入口**。
`expect.poll` 会让你的断言自动重试到 timeout，和 `await expect(loc).toHaveText(...)` 同语义。
不写 `poll` 的 matcher = 一次性断言 = 没 auto-wait = 老路 flaky。

#### 实验 B · 写一个 custom fixture（authedPage）

```typescript
// tests/fixtures.ts
import { test as base, expect } from '@playwright/test'

type AuthedPage = { authedPage: import('@playwright/test').Page }

export const test = base.extend<AuthedPage>({
  authedPage: async ({ page }, use) => {
    // setup: 登录
    await page.goto('/login')
    await page.fill('[name=user]', 'demo')
    await page.fill('[name=pass]', 'demo')
    await page.click('button[type=submit]')
    await expect(page).toHaveURL(/dashboard/)

    // 把准备好的 page 交给 test 使用
    await use(page)

    // teardown: 登出（test 跑完后自动执行）
    await page.click('text=Logout')
  },
})

export { expect }
```

```typescript
// tests/dashboard.spec.ts
import { test, expect } from './fixtures'

test('dashboard shows user', async ({ authedPage }) => {
  // 进来就是登录后的 page，setup 已自动跑
  await expect(authedPage.locator('.user-name')).toHaveText('demo')
})
```

→ 你能感受到 `await use(page)` 在 fixture 函数里**真的把执行权转走了**——
fixture 函数挂起 → test body 跑 → test 跑完 → fixture 函数从 `use` 后继续。
这就是上面段 1.3 讲的 use() 模型实战。

#### 实验 C · trace viewer（旧版必做）

```typescript
await expect(page).toHaveTitle(/Wrong/)   // 故意失败
```

```bash
npx playwright test --trace on
npx playwright show-trace test-results/.../trace.zip
```

打开 trace viewer——你会看到**完整的 timeline + 截图 + DOM 快照**。

## 与你工作的连接

**能立刻迁移**：

- 任何**新项目**的 E2E 测试用 Playwright 起步——Cypress 项目慢慢迁
- 用 codegen 给团队启蒙——录一遍生成代码，再改 selector
- 用 trace viewer 上线 CI——每次失败有 trace，再也不"看不到现场"
- **写 custom matcher 时记得用 `expect.poll`**——不然 matcher 失去 auto-wait 这层 framework 主权

**下个月可能用到**：

- 给 LLM agent 做"看屏幕操作"——Playwright 是事实标准（结合 anthropic-cookbook 的 Computer Use）
- 给项目加 visual regression 测试（screenshot 比对）
- 跨浏览器兼容性 CI（Chromium + Firefox + WebKit 三套并行）

**不要用 Playwright 的部分**：

- **快速 unit 测试**——Vitest / Jest 更轻量
- **组件交互简单（点点 button 看回调）**——React Testing Library 在 jsdom 里更快
- **API 测试**——supertest / fetch 直接测，不需要浏览器

## 读完你能做之前做不了的事

- **判断**：选 E2E 工具时，能用"浏览器范围 / auto-wait / trace / 跨语言 / 协议主权"五维评估
- **设计**：写自己的自动化工具时，思考"协议层 + 客户端 + auto-wait + retry pipeline 四件套"
- **解释**：被问"为什么我的 Selenium 测试 flaky"时，能说出"没 auto-wait + selector stale + 没 navigation precheck" 三个根因
- **下钻**：看懂 CDP 协议——Playwright server 内部就是和 CDP 对话；看得懂 Juggler 是什么
- **对照**：识别"我这个工具的 flaky 是协议问题还是 timing 问题"——可以借鉴 auto-wait + `_retryAction` 的 6 种可恢复错误模型
- **写扩展**：能写 custom matcher（用 `expect.poll`） / custom fixture（用 use() 双 promise） / custom reporter

## 自检 · 5 个问题

1. Playwright 跨进程（client + server）增加了复杂度。如果合到一个进程会失去什么？（提示：跨语言 / 隔离 / 远程控制）
2. auto-wait 默认行为可以解决 95% flaky。剩下的 5% 是什么场景？应该怎么处理？（提示：动画 / iframe stress / network race）
3. Locator vs ElementHandle 的语义差异——什么场景**反而需要** ElementHandle？（提示：拿到 handle 后做多次细粒度操作 + 不希望重新查询）
4. trace viewer 是"事后录像"，Cypress time-travel 是"实时回放"。两种调试模式各自适合什么场景？（提示：CI 失败诊断 vs 本地 dev）
5. Microsoft 自己 patch WebKit 和 Firefox。这种**重型工程投入**值不值？换一个判断框架。（提示：差异化壁垒 / 维护成本对应市占率）
6. 段 2 里 retry 间隔是 `[0, 20, 100, 100, 500]` 写死的常数。如果让你改成自适应（根据该 selector 历史 retry 模式），会带来什么风险？（提示：可观测性退化 / 状态泄漏）
7. 段 1.3 里 fixture 用 `await use(value)` 暂停整个 setup 函数。如果 test 抛异常导致 use 后面的 teardown 没跑会怎样？（看 `_teardownInternal` 的兜底）

## 延伸阅读

读完这篇笔记后下一步：

1. `packages/playwright-core/src/server/dom.ts:316-377` 完整的 `_retryAction` 函数 —— auto-wait 灵魂
2. `packages/playwright-core/src/server/frames.ts`（1874 行）—— frame / waitForSelector 完整实现
3. `packages/playwright/src/runner/dispatcher.ts:35-160` —— worker 调度器的状态机
4. `packages/playwright/src/worker/fixtureRunner.ts` —— fixture 拓扑 + use() 模型
5. `browser_patches/firefox/juggler/` —— Juggler 协议自家实现
6. **CDP（Chrome DevTools Protocol）规范**——Playwright server 底层协议
7. **anthropic Computer Use** —— LLM + 浏览器自动化的下一代演化

---

## 限制 / 怀疑总览（v1.1 分支 E 要求 ≥ 3）

1. **怀疑 1（dispatcher 错误边界）**：`_runJobInWorker` 的 fire-and-forget 没有 catch 错误兜底。极端情况下 dispatcher 自己 OOM 会静默死掉。生产建议：在外层 supervisor 加 health check。
2. **怀疑 2（fixture 内存泄漏）**：use() 模型让 fixture 函数挂起几十秒，闭包持有的 DOM / network handle 不会释放。worker-scoped fixture 不能持有大对象。
3. **怀疑 3（waitTime 写死）**：`[0, 20, 100, 100, 500]` ms 不是指数退避——基于 UI stable window < 500ms 的假设。改自适应会丧失可观测性。
4. **怀疑 4（浏览器 patch 维护成本）**：Firefox / WebKit patch 长期维护成本极高。Playwright 通过 pin tag + 定期 roll up 缓解，但仍是 bus factor 风险。
5. **限制 1（API 复杂度）**：Page / Frame / Locator / ElementHandle 四个抽象层，初学者容易混。
6. **限制 2（macOS WebKit 启动慢）**：自家 patch 的 WebKit 启动比原生 Safari 慢 1-2s——CI 上明显。
7. **限制 3（视觉对比依赖二进制一致性）**：toHaveScreenshot 只在同一个浏览器版本可重复——升级 Playwright 通常要重生成基线。

## 元数据

| 字段 | 值 |
|---|---|
| 仓库 | microsoft/playwright @ 414fa0b9 |
| 版本 | 1.61.0-next（2026-05） |
| 协议 | Apache-2.0 |
| 类型分支 | v1.1 分支 E · 测试/验证工具 |
| 心脏文件 | dispatcher.ts(659) + workerMain.ts(681) + dom.ts(1039) + crConnection.ts |
| Figure | 01-architecture.webp（三层架构 + 三协议通道） |
| GitHub permalink | 5 处（commit 414fa0b9） |
| 显式怀疑 | 7 处（编号 1-4 + 限制 1-3） |
| path:line 引用 | dom.ts:316 / dispatcher.ts:71 / workerMain.ts:289 / fixtureRunner.ts:106 / crConnection.ts:45 / page.ts:537 |

---

**笔记完成**：2026-05-28（v1.61.0-next）
**研究方法**：本地 clone @ 414fa0b9 → 阅读 dispatcher / workerMain / dom / crConnection 实现 → 自己写 custom matcher + custom fixture toy test 验证 use() 模型
**心脏文件四件套**：`runner/dispatcher.ts:71`（worker 池调度）+ `worker/workerMain.ts:289`（test 主循环）+
`server/dom.ts:316`（auto-wait `_retryAction`）+ `server/chromium/crConnection.ts:45`（CDP 通道）
