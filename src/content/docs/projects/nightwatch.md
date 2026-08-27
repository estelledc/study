---
title: Nightwatch — 用命令队列把 WebDriver 测写成一套浏览器 API
来源: https://github.com/nightwatchjs/nightwatch
日期: 2026-08-27
分类: 测试
难度: 中级
description: "介绍 Nightwatch 如何用 CliRunner、CommandQueue 和 selenium-webdriver Transport 工厂跑端到端测试。"
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/nightwatchjs/nightwatch
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 765afc35669d24563b5ae98a84c34b6857c3fc01
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.16.0
---

## 是什么

Nightwatch 是一套 Node.js 端到端测试框架。日常类比：你以为自己在对浏览器说话，其实先把话丢进一条命令队列；真正出门的是 `selenium-webdriver` 这辆车。

固定 `v3.16.0` 的用户入口是 `nightwatch` CLI，或 `Nightwatch.createClient()` / `Nightwatch.runTests()`。测试里看到的 `browser` 是 `NightwatchAPI`（`client.api`），不是 selenium 原生 driver。

```js
describe('home', function () {
  it('opens the title', async function () {
    await browser.url('https://example.com')
    await browser.assert.textContains('h1', 'Example')
  })
})
```

Node 引擎声明为 `>= 18.20.5`。包没有 `exports` map，只有 `main` / `types`。

## 为什么重要

不理解 Nightwatch，下面这些事都没法解释：

- 为什么“写了 `await browser.click()`”仍可能被队列串行化，而不是直接打到 driver
- 为什么默认浏览器不是 Chrome
- 为什么 CDP、Appium、BrowserStack 看起来像并列后端，源码里却都是 Transport 分支
- 为什么 `assert` 失败后同一 suite 的后面用例常常根本没跑

## 核心要点

1. **主链是 config → CliRunner → TestSuite → CommandQueue → Transport**：`bin/nightwatch` 检查 Node 版本后交给 `CliRunner.setupAsync().runTests()`。`Runner.create` 选出 default / Mocha / Cucumber；并发走 Piscina worker 或 child process。

2. **Transport 工厂，不是三套平行协议**：`TransportFactory.createWebdriver` 按 BrowserStack、`selenium.start_process` / Appium、本地 `webdriver.start_process` 分支。CDP 通过 `driver.createCDPConnection('page')` 做 network mock 等辅助，不是第二套主协议。

3. **等待和断言是分开的旋钮**：`waitForConditionTimeout` 默认 5000 ms，轮询 500 ms；`retryAssertionTimeout` 5000 ms；交互命令 `element_command_retries` 为 3。`assert` / `expect` 默认 abort；`verify` 默认继续。`end_session_on_fail` 默认 true。

4. **Page Object 是一等公民**：`page_objects_path` 里的模块变成 `browser.page.<name>()`，命令和 `@selector` 走独立 cache。`element()` 是 v3 全局 API，定位默认 CSS，`use_xpath` 才切 XPath。

## 实践示例

### 案例 1：本地直连 ChromeDriver，而不是先起 Selenium JAR

```js
// nightwatch.conf.js
module.exports = {
  src_folders: ['tests'],
  test_settings: {
    default: {
      desiredCapabilities: { browserName: 'chrome' },
      webdriver: { start_process: true },
    },
  },
}
```

未写 `browserName` 时，defaults 里是 `firefox`。`webdriver.start_process: true` 让 Nightwatch spawn 浏览器 driver；`selenium.start_process` 才是 JAR / Grid / Appium 那条路。

### 案例 2：编程式客户端

```js
const Nightwatch = require('nightwatch')

const client = Nightwatch.createClient({
  browserName: 'chrome',
  headless: true,
})
const browser = await client.launchBrowser()
await browser.url('https://example.com')
await client.cleanup()
```

`createClient` 默认 `useAsync: true`，配置字符串默认 `./nightwatch.json`；CLI 实际加载却优先 `nightwatch.conf.js|.ts|.cjs`。

### 案例 3：assert 与 verify 的失败合同

```js
await browser.assert.visible('#ok')   // 失败则清空队列
await browser.verify.visible('#maybe') // 失败仍继续后面的命令
```

`AsyncTree` 看到 `abortOnFailure` 会 `empty()` 并记下 `returnError`。`skip_testcases_on_fail` 在非 unit 模式下默认 true。

## 踩过的坑

1. **以为必须先装 Selenium standalone**：默认模板走的是 `webdriver.start_process`。
2. **把 `browser` 当成 `selenium-webdriver` 的 `WebDriver`**：那是 `transport.driver`。
3. **把 CDP 写成“可以不靠 WebDriver 跑完整 e2e”**：CDP 是辅助连接。
4. **配置文件只找 `nightwatch.json`**：运行时优先 `.conf.js/.ts/.cjs`，默认字符串却仍写 json。
5. **assert 失败后还指望同 suite 后续 it 继续跑**：默认会 skip，并且 session 会被结束。

## 适用 vs 不适用场景

**适用**：

- 需要内置 runner + page object + assert/verify 分层，且接受 WebDriver
- 已经有 Selenium Grid / Appium / BrowserStack，想把本地 driver 和远程 endpoint 收进同一份 `test_settings`
- 对照 [[webdriverio]] 看另一套“自建 runner + 协议客户端”切分

**不适用**：

- 只要组件级查询语义：用 [[testing-library]] 或 [[vitest]]
- 必须避免命令队列、希望测试文件直接 `await` 协议客户端
- 需要本页给出的跨框架性能名次——没有复跑
- 不能接受默认 Firefox、以及 conf 文件名和 argv 默认值不一致

## 固定版本边界

- 本文绑定 `nightwatchjs/nightwatch@765afc35...`，tag 与 npm 均为 `3.16.0`。
- Node `>= 18.20.5`；底层依赖 `selenium-webdriver@4.27.0`。
- 未安装依赖、未启动 driver / Selenium / Appium，状态保持 `UNVERIFIED`。

## 学到什么

1. **用户看见的 `browser` 往往是一层 API 外壳**——session 和协议在 Transport 里
2. **队列模型会改变失败语义**——assert 不是“记一笔再跑完”
3. **可选后端不等于平行主协议**——CDP / Appium 都是工厂分支
4. **默认值和 CLI 文案可以不一致**——以 `loadConfig` 的真实优先级为准

## 应用型自测

1. 不写 `desiredCapabilities.browserName` 时，默认浏览器是 Chrome 吗？
2. `browser.assert.visible` 失败后，同一 testcase 后面的命令默认还会执行吗？
3. `lib/transport/selenium-webdriver/cdp.js` 是和 WebDriver 并列的第三套 session 工厂吗？

检查点：

1. 不是。defaults 写的是 `firefox`。
2. 不会。`abortOnFailure` 会清空 `AsyncTree`。
3. 不是。它只是在已有 driver 上开 CDP 连接。

## 延伸阅读

- 官方文档：[nightwatchjs.org](https://nightwatchjs.org)
- 固定源码：[nightwatchjs/nightwatch](https://github.com/nightwatchjs/nightwatch) —— 本文绑定 `765afc35669d24563b5ae98a84c34b6857c3fc01`
- 审查记录：仓库内 `docs/e2e-webdriver-source-review-20260827-dg.md`
- [[webdriverio]] —— 同主题的协议客户端 + plugin runner
- [[playwright]] —— 自有协议对照，不在本页审查范围

## 关联

- [[webdriverio]] —— 同样基于 WebDriver，但 launcher / worker 切分不同
- [[playwright]] —— 跨浏览器自动化对照
- [[vitest]] —— 单元 / 组件测试
- [[testing-library]] —— 不驱动 WebDriver 的 UI 查询语义

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[webdriverio]] —— WebdriverIO — 用一份协议客户端同时跑浏览器和 App
