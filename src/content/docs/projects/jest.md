---
title: Jest — 一个包就能跑 JS 测试的全家桶
description: 把 runner、断言、mock 和快照收进同一 CLI 的 JavaScript 测试框架
来源: https://github.com/jestjs/jest
日期: 2026-05-30
分类: 测试框架
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jestjs/jest
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 746f2a0f57c56e3bba555280f0587d40f3db95c0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 30.4.2
---

## 是什么

Jest 是一个把 runner、断言、mock、快照和转译收进同一 CLI 的 JavaScript 测试框架。日常类比：像超市的「火锅一站式购物车」——肉、菜、汤底和锅具一次装齐，不用再分别去配 [[mocha]]、Chai、sinon 和覆盖率工具。

```js
test('1 + 1 = 2', () => {
  expect(1 + 1).toBe(2)
})
```

固定 `30.4.2` 的入口包只依赖 `@jest/core` 与 `jest-cli`。默认 `injectGlobals: true`，所以 `test` / `expect` / `jest` 不必手写 import；也可以关掉 globals，改从 `@jest/globals` 取。

## 为什么重要

不理解 Jest 在 30.x 里的真实默认，下面这些印象会过时：

- 为什么 `*.test.js` 不用额外 runner 配置就能被收集——默认 `testMatch` 认 `__tests__` 与 `*.test` / `*.spec`
- 为什么 `jest.mock('axios')` 能替换模块，但 **不会** 自动 mock 全部 import——默认 `automock: false`
- 为什么「按 CPU 数起 worker」并不总发生——调度器会把小而快的套件收回主进程
- 为什么纯 ESM 项目仍可能看到 `ERR_REQUIRE_ESM`——`require(ESM)` 依赖 Node v24.9+ 的同步 vm module API

## 核心要点

固定源码的主链可以拆成五步：

1. **规范化配置**：`jest-config` 默认 `testRunner` 为 `jest-circus/runner`，`testEnvironment` 为 `jest-environment-node`，`maxWorkers` 为 `'50%'`，`workerThreads` 为 `false`。

2. **收集测试文件**：`SearchSource` 按 `testMatch` / 变更文件过滤路径，再交给 `TestScheduler`。

3. **决定 in-band 还是 worker**：`shouldRunInBand()` 在 `runInBand`、`detectOpenHandles`、只有 1 个测试/1 个 worker，或「≤20 个且历史都快于 1s」时走主进程；否则用子进程（默认不是 worker thread）。

4. **Runtime 装模块**：CJS 走 Jest 自己的 module registry；被判定为 ESM 的文件若用 `require()` 加载，当前 Node 没有同步 vm API 就会抛 `ERR_REQUIRE_ESM`。`jest.isolateModules` 只是 registry overlay，不是每个测试新建 `vm.Context`。

5. **Circus 执行树**：`eventHandler` 同步登记 `describe` / hook / `test`；`run.ts` 先 `beforeAll`，再跑测试，最后 `afterAll`。`test.concurrent` 用 `p-limit`，默认 `maxConcurrency=5`。

## 实践示例

### 案例 1：零配置跑第一个测试

```bash
mkdir jest-toy && cd jest-toy
npm init -y
npm i -D jest@30.4.2
```

`sum.js`：

```js
function sum(a, b) { return a + b }
module.exports = sum
```

`sum.test.js`：

```js
const sum = require('./sum')

test('1 + 1 = 2', () => {
  expect(sum(1, 1)).toBe(2)
})
```

`npx jest` 会按默认 `testMatch` 找到这个文件。`test` 与 `expect` 来自 injectGlobals，不是语言内置。单文件套件还可能被 `shouldRunInBand` 收回主进程，不代表「永远多进程」。

### 案例 2：手动 mock，而不是自动 mock

```js
jest.mock('axios')
const axios = require('axios')

test('fetchUser 调 axios.get', async () => {
  axios.get.mockResolvedValue({ data: { name: 'Jason' } })
  const user = await fetchUser(1)
  expect(user.name).toBe('Jason')
})
```

`jest.mock('axios')` 把该模块换成 mock。默认 **不会** 对未声明的 import 做 automock。ESM 侧对应 API 是 `jest.unstable_mockModule`，固定源码要求传入 factory。

### 案例 3：并发测试有上限

```js
test.concurrent('A', async () => { /* ... */ })
test.concurrent('B', async () => { /* ... */ })
```

同一 describe 里的 concurrent 测试会被收成一组，再用 `p-limit(maxConcurrency)` 跑。circus 默认 `maxConcurrency` 是 5，不是「全部同时开火」。

## 踩过的坑

1. **把 automock 当默认**：`Defaults.ts` 写明 `automock: false`。没写 `jest.mock` 的模块就是真模块。

2. **以为每个测试都有独立 `vm.Context`**：文件级隔离来自 worker / runtime registry；`isolateModules` 只切换 registry overlay，不能嵌套混用 sync/async 两个 API。

3. **把 `maxWorkers: '50%'` 理解成永远半满并行**：小套件、`detectOpenHandles` 或 `runInBand` 会改走主进程。

4. **在 test 函数里再写 `describe` / hook**：circus 会把错误记到当前测试上；测试必须在开始跑之前同步登记。

5. **把 TypeScript generic 或快照当运行证据**：`expect(x).toMatchSnapshot()` 只比较序列化文本；本页未跑上游测试。

## 适用 vs 不适用场景

**适用**：

- 需要同一套 CLI 同时提供断言、mock、快照和 Node 环境
- 已有 Jest 配置的 React / Node 仓库，迁移成本高于换 runner
- 满足当前 package 的 Node 边界：`^18.14.0 || ^20.0.0 || ^22.0.0 || >=24.0.0`

**不适用**：

- 想把 runner、断言、mock 拆开组合——那是 [[mocha]] 的模型
- 主要目标是浏览器 E2E——Jest 默认 `jest-environment-node`
- 需要在低于 Node 24.9 的环境里用 `require()` 加载 ESM

## 固定版本边界

- 本文绑定 `jestjs/jest@746f2a0f57c56e3bba555280f0587d40f3db95c0`，tag 与 npm `gitHead` 均为 `30.4.2`。
- 默认 circus timeout 5000ms；`bail` 默认 0；覆盖率 provider 默认 `babel`。
- ESM / CJS 互操作取决于 Node 的同步 vm module 能力，不能把「Jest 已支持 ESM」写成无条件事实。
- 本文未安装依赖、运行上游测试或测量启动时间，状态保持 `UNVERIFIED`。

## 学到什么

1. **全家桶降低配置漂移，也把默认值变成合同**——automock、worker、timeout 都以源码默认为准。
2. **并行是调度结果，不是口号**——`50%` workers 仍可能 in-band。
3. **模块隔离有两层**——进程/worker 与 registry overlay 不是同一件事。
4. **测试树必须先登记再执行**——circus 把「定义期」和「执行期」分开。

## 应用型自测

1. 不写 `jest.mock` 时，默认会不会把所有 import 换成 mock？
2. 只有 1 个测试文件时，Jest 是否一定起多个 worker？
3. `require()` 一个 ESM 文件，在 Node 22 上是否一定成功？

检查点：

1. 不会。默认 `automock: false`。
2. 不一定。`shouldRunInBand` 会把单测收回主进程。
3. 不一定。固定源码要求 Node v24.9+ 才提供 `require(ESM)` 的同步 vm API。

## 延伸阅读

- 官方文档：[jestjs.io](https://jestjs.io/)
- 固定源码：[jestjs/jest](https://github.com/jestjs/jest) —— 本文绑定提交 `746f2a0f57c56e3bba555280f0587d40f3db95c0`
- 共享审查记录：`docs/test-runner-source-review-20260827-ag.md`
- [[mocha]] —— 只做 runner、默认同进程串行的对照模型
- [[testing-library]] —— 常和 Jest 一起测 DOM 行为

## 关联

- [[mocha]] —— Jest 对照的「可组合 runner」
- [[testing-library]] —— 用户视角查询，不负责跑测试
- [[msw]] —— 网络层 mock，用来替代 `jest.mock('./api')`
- [[swc]] —— `@swc/jest` 可作为 transform，不是 Jest 默认
- [[storybook]] —— 组件开发，常和快照测试一起出现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
- [[vitest]] —— Vitest — Vite 原生测试框架
