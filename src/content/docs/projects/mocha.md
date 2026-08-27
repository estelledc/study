---
title: Mocha — 只负责跑测试的可组合 runner
description: 只负责跑测试的可组合 JavaScript runner，默认同进程串行，可选子进程并行
来源: https://github.com/mochajs/mocha
日期: 2026-08-27
分类: 测试框架
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mochajs/mocha
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 90c1bb3e183a262ac91d83fa45035d03ea9f6045
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.8.0
---

## 是什么

Mocha 是一个**只负责发现、组织并执行测试**的 JavaScript runner。日常类比：它是考试监考员，不是试卷印刷厂——谁出题（断言）、谁扮假人（mock）、谁统计分数（覆盖率）都由你另选。

```js
const { describe, it } = require('mocha')
const assert = require('node:assert')

describe('sum', () => {
  it('adds', () => {
    assert.equal(1 + 1, 2)
  })
})
```

固定 `11.8.0` 仍是 CommonJS 包（`"type": "commonjs"`），默认 UI 是 BDD：`describe` / `it` / `before` / `after`。它不绑定 Chai 或 sinon；Node 自带 `assert` 就能跑通。

## 为什么重要

不理解 Mocha 和 [[jest]] 的分工，就很难解释：

- 为什么很多老 Node 仓库是 `mocha + chai + sinon + nyc`，而不是一个包
- 为什么默认「一个进程跑完全部文件」——模块缓存和全局变量会串
- 为什么 `--parallel` 不是 worker thread，而是子进程池
- 为什么 `it('x', function(done) { ... })` 会被当成异步：看的是 `fn.length`

## 核心要点

固定源码的主链可以拆成五步：

1. **构造 Mocha 实例**：有限状态机 `init → running → referencesCleaned | init → disposed`。默认从 `mocharc.json` 读 `timeout=2000`、`slow=75`、`reporter=spec`、`ui=bdd`。

2. **登记文件与接口**：BDD 在 `EVENT_FILE_PRE_REQUIRE` 把 `describe` / `it` 挂到 context；每个 `it` 变成 `Test`，再挂进 `Suite` 树。

3. **决定怎么加载文件**：默认 `run()` 先 `loadFiles()`，同一进程 `require`/`import`。watch、并行或 ESM lazy 路径会推迟加载。

4. **串行执行**：默认 `Runner` 自己遍历 Suite，按 `beforeAll → beforeEach → test → afterEach → afterAll` 调 `Runnable`。`Runnable` 默认 `_retries = -1`（不重试）。

5. **可选并行**：`--parallel` 且 `jobs` 未设或 `>1` 时，换成 `ParallelBufferedRunner`。它**不执行** Runnable，只把文件丢给 `workerType: "process"` 的子进程池；默认 `maxWorkers = cpus - 1`。

## 实践示例

### 案例 1：最小 CJS 套件

```bash
mkdir mocha-toy && cd mocha-toy
npm init -y
npm i -D mocha@11.8.0
```

`test/sum.test.js`：

```js
const assert = require('node:assert')

describe('sum', () => {
  it('1 + 1 = 2', () => {
    assert.equal(1 + 1, 2)
  })
})
```

`npx mocha` 默认收 `js/cjs/mjs`。这里没有 `expect`，因为 Mocha 不提供断言库。

### 案例 2：done-callback 与 Promise 是两条异步合同

```js
it('calls done', function (done) {
  setTimeout(() => done(), 10)
})

it('returns a promise', async () => {
  await Promise.resolve()
})
```

`Runnable` 用 `fn.length` 判断第一种：有形参就走 done。箭头函数没有自己的 `arguments`/`this`，也没有形参时会被当成同步；超时默认 2000ms，可用 `this.timeout(0)` 关掉（会被 clamp 到 `0` 或 `2^31-1`）。

### 案例 3：并行是子进程，不是线程

```bash
npx mocha --parallel --jobs 2
```

`parallelMode(true)` 会换 Runner 类并打开 lazy load。`buffered-worker-pool.js` 写明 `workerType: "process"`，把当前 `process.execArgv` 传给子进程。`globalSetup` / `globalTeardown` 不会序列化进 worker。浏览器环境会直接抛「parallel mode is only supported in Node.js」。

## 踩过的坑

1. **默认同进程共享 `require.cache`**：文件 A 改掉单例，文件 B 可能看到脏状态。要隔离得 `--parallel`、自行 unload，或别依赖模块级可变状态。

2. **把 `--parallel` 想成 worker thread**：固定实现是 child process。注释里的「worker」指池里的工作进程。

3. **`fn.length` 误判异步**：`it('x', function(done) {})` 才是 done 风格；`it('x', () => { done() })` 若没声明形参，Mocha 当同步，`done` 还没调用测试就结束了。

4. **重试默认不存在**：`_retries` 初始是 `-1`。要重跑必须显式 `this.retries(n)` 或 CLI `--retries`。

5. **复用同一 Mocha 实例**：`run()` 之后若 `cleanReferencesAfterRun` 已把状态推到 `referencesCleaned`，再 `run()` 会抛 disposed 错误，需要新实例。

## 适用 vs 不适用场景

**适用**：

- 希望自己选断言 / mock / 覆盖率，而不是接受全家桶
- 已有 mocha 生态配置（nyc、chai、sinon、自定义 reporter）
- 满足当前 engines：`^18.18.0 || ^20.9.0 || >=21.1.0`

**不适用**：

- 想要开箱即用的 expect、automock 和 snapshot——那是 [[jest]] 的范围
- 浏览器里开 `--parallel`——源码直接拒绝
- 把「一个进程跑完全部文件」当成隔离保证

## 固定版本边界

- 本文绑定 `mochajs/mocha@90c1bb3e183a262ac91d83fa45035d03ea9f6045`，tag 与 npm `gitHead` 均为 `11.8.0`。
- 默认 timeout 2000ms、slow 75ms、reporter `spec`、UI `bdd`。
- 并行默认 `cpus - 1` 个子进程；`jobs === 1` 不会进入 parallelMode。
- ESM 加载走 `requireOrImport`：有 `process.features.require_module` 时优先 `require`，`.mjs` 仍用 `import()`。
- 本文未安装依赖、运行上游测试或测量并行加速，状态保持 `UNVERIFIED`。

## 学到什么

1. **Runner 可以不做断言**——组合带来灵活，也把隔离和工具链交给调用方。
2. **默认同进程是功能，也是陷阱**——`require.cache` 是隐式共享内存。
3. **并行实现必须看 workerType**——名字叫 worker，源码却 fork 进程。
4. **异步合同写在函数签名上**——`fn.length` 比「看起来像 async」更硬。

## 应用型自测

1. 默认不传 `--parallel` 时，两个测试文件是否一定在不同进程？
2. `it('x', function(done) {})` 为什么会被当成异步？
3. `--parallel --jobs 1` 会启用 `ParallelBufferedRunner` 吗？

检查点：

1. 不一定。默认同一进程 `loadFiles()`。
2. 因为 `Runnable` 看 `fn.length`，有形参就走 done。
3. 不会。源码要求 `jobs` 未定义或 `>1` 才 `parallelMode(true)`。

## 延伸阅读

- 官方文档：[mochajs.org](https://mochajs.org/)
- 固定源码：[mochajs/mocha](https://github.com/mochajs/mocha) —— 本文绑定提交 `90c1bb3e183a262ac91d83fa45035d03ea9f6045`
- 共享审查记录：`docs/test-runner-source-review-20260827-ag.md`
- [[jest]] —— 全家桶对照：默认 circus + expect + mock
- [[testing-library]] —— 只提供查询，仍需要 runner

## 关联

- [[jest]] —— 一体化对照模型
- [[testing-library]] —— DOM 查询层，常挂在 Mocha 或 Jest 上
- [[msw]] —— 网络 mock，不依赖某个 runner
- [[yargs]] —— 许多 CLI（含历史 mocha 栈）用它做参数解析

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
