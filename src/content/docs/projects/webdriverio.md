---
title: WebdriverIO — 用一份协议客户端同时跑浏览器和 App
来源: https://github.com/webdriverio/webdriverio
日期: 2026-08-27
分类: 测试
难度: 中级
description: "介绍 WebdriverIO 如何把 CLI launcher、local worker 和 webdriver 协议客户端叠成一条可配置的端到端主链。"
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/webdriverio/webdriverio
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2b9721d052ac24207e8628c65a63c3a0de122a2a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.31.3
---

## 是什么

WebdriverIO 是一套 Node.js 端到端自动化框架。日常类比：方向盘是 `browser` / `$` / `$$`，发动机是 W3C WebDriver（可顺带 BiDi），换挡杆是 `@wdio/cli` 的 launcher。它可以测桌面浏览器，也可以经 Appium 测移动端。

固定 `v9.31.3` 里，用户入口是 `wdio` CLI 或 `import { remote } from 'webdriverio'`。testrunner 默认把 `browser`、`$`、`$$` 注入全局。

```js
await browser.url('https://example.com')
const heading = await $('h1')
await expect(heading).toHaveText('Example Domain')
```

Node 引擎声明为 `>=18.20.0`。仓库里没有 `@wdio/sync`。

## 为什么重要

不理解 WebdriverIO，下面这些事都没法解释：

- 为什么“装了 webdriverio 包”不等于已经有测试 runner——CLI、local-runner、framework adapter 是另几层
- 为什么元素命令看起来像自动等待，却不是 Selenium 的 implicit timeout
- 为什么同一提交里 `webdriverio` 是 `9.31.3`，`webdriver` 包却报 `9.31.2`
- 为什么默认不是 Playwright 那种自带浏览器协议，也不默认走 browser runner

## 核心要点

1. **主链是 launcher → local runner → worker → framework**：`bin/wdio.js` 调 `run()`，再 `Launcher.run()`，用 `initializePlugin(runner,'runner')` 加载默认 `@wdio/local-runner`。worker 里的 `@wdio/runner` 先建 protocol stub、跑 `beforeSession`、初始化 Mocha，再 `remote()` / `multiremote()` 开真 session。

2. **两层包，不是一个包**：`webdriver` 负责 Classic HTTP、BiDi WebSocket 和 session；`webdriverio` 负责 `$`、wait、mobile 命令和 session manager。默认 `automationProtocol: 'webdriver'`。Appium capability 时 `startWebDriver()` 不自动拉起桌面 chromedriver。

3. **等待是中间件，不是 WebDriver implicit**：`waitforTimeout` 默认 5000 ms，`waitforInterval` 100 ms。元素命令没有 `elementId` 时，`implicitWait()` 会先 `waitForExist()`。`waitUntil` / `waitFor*` 是显式 `Timer` 轮询。源码里没有去调 `/timeouts/implicit_wait`。

4. **配置形状就是模式**：默认 `runner: 'local'`、`framework: 'mocha'`、`injectGlobals: true`。`capabilities` 若是非数组对象，就是 multiremote。`runner: 'browser'` 才走 Vite 浏览器侧测试，且 launcher 把 `maxInstances` 收成 1。

## 实践示例

### 案例 1：CLI 跑一份 Mocha spec

```js
// wdio.conf.js
export const config = {
  runner: 'local',
  framework: 'mocha',
  specs: ['./test/specs/**/*.js'],
  capabilities: [{ browserName: 'chrome' }],
}
```

`npx wdio run wdio.conf.js` 与直接 `npx wdio wdio.conf.js` 走同一 `run` handler。未写 `runner` 时默认 local。

### 案例 2：standalone `remote()`，不要全局 `browser`

```js
import { remote } from 'webdriverio'

const browser = await remote({
  capabilities: { browserName: 'chrome' },
})
await browser.url('https://example.com')
await browser.$('h1').getText()
await browser.deleteSession()
```

这条路径不经过 `@wdio/runner`，也就没有自动注入的 `$` / `expect`。

### 案例 3：显式等待，而不是靠“点一下会自己等”

```js
await $('#toast').waitForDisplayed({ timeout: 8000 })
await browser.waitUntil(async () => (await browser.getUrl()).includes('/done'))
```

`waitForExist` 本身不再套一层“先等元素存在”。其它元素命令才走 middleware。

## 踩过的坑

1. **把空 diagnostics 式的“命令返回了”当成元素已可点**：`isClickable` 被排除在 implicit wait 之外，需要自己 `waitForClickable`。
2. **以为必须先起 Selenium Server**：本地桌面浏览器由 `startWebDriver()` 拉 driver；Appium / Grid 才是另一条 capability。
3. **把 browser runner 当默认**：默认是 Node worker 里的 local runner。
4. **把 BiDi 写成“全浏览器自动开”**：只有 `browserName` 为字符串且不是 Safari、又没设 `wdio:enforceWebDriverClassic` 时，才会写 `webSocketUrl: true`。
5. **用 `webdriver@9.31.3` 去对源码树**：本提交里该子包 version 仍是 `9.31.2`。

## 适用 vs 不适用场景

**适用**：

- 需要同一套 API 覆盖桌面 WebDriver 和 Appium
- 已有 Mocha / Jasmine / Cucumber，想把 runner 和协议客户端分开配置
- 对照 [[nightwatch]] 看“协议客户端 + 自建 runner”另一条实现

**不适用**：

- 只要浏览器内组件测试：那是 [[vitest]] browser mode 或 Testing Library 的赛道
- 必须和 Playwright 的 locator / trace 合同逐项一致
- 需要本页提供的速度排名或“已经取代 Cypress”——那些没有绑定运行证据
- 团队不能接受读 launcher / runner / webdriver 三层源码

## 固定版本边界

- 本文绑定 `webdriverio/webdriverio@2b9721d0...`，tag `v9.31.3`，npm `webdriverio` / `@wdio/cli` 为 `9.31.3`。
- 同提交 `webdriver=9.31.2`、`@wdio/protocols=9.31.1`。
- Node `>=18.20.0`。未安装依赖、未启动浏览器或 Appium，状态保持 `UNVERIFIED`。

## 学到什么

1. **高层 `$` API 和协议客户端不是同一个包**——搞混就会把 session 创建写成“WDIO 自己发明的协议”
2. **默认等待策略必须写清是谁在等**——middleware 与 WebDriver implicit 不是一回事
3. **monorepo 里 patch 版本可以漂移**——要以 commit 为准，不要假设每个 workspace 包都 bump 到同一 patch
4. **capabilities 的形状本身就是模式开关**

## 应用型自测

1. 没写 `runner` 时，`Launcher` 会加载 `@wdio/browser-runner` 吗？
2. `browser.$('#x').click()` 在还没有 `elementId` 时，会去调 WebDriver implicit timeout API 吗？
3. 同提交的 `packages/webdriver/package.json` 一定写着 `9.31.3` 吗？

检查点：

1. 不会。默认 `runner: 'local'`。
2. 不会。它走 `implicitWait()` → `waitForExist()`。
3. 不一定。固定树里它是 `9.31.2`。

## 延伸阅读

- 官方文档：[webdriver.io](https://webdriver.io)
- 固定源码：[webdriverio/webdriverio](https://github.com/webdriverio/webdriverio) —— 本文绑定 `2b9721d052ac24207e8628c65a63c3a0de122a2a`
- 审查记录：仓库内 `docs/e2e-webdriver-source-review-20260827-dg.md`
- [[nightwatch]] —— 另一条 WebDriver + 自建命令队列
- [[playwright]] —— 自有协议的对照，不在本页审查范围

## 关联

- [[nightwatch]] —— 同样走 W3C WebDriver，但命令队列和 runner 模型不同
- [[playwright]] —— 跨浏览器自动化对照
- [[vitest]] —— 单元 / 组件测试，不是这条 e2e 主链
- [[testing-library]] —— 按用户语义测 UI，不驱动真浏览器协议

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[nightwatch]] —— Nightwatch — 用命令队列把 WebDriver 测写成一套浏览器 API
