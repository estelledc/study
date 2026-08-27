# WebdriverIO / Nightwatch source review

> 用途：记录 webdriverio、nightwatch 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DG
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、未启动浏览器 / driver / Selenium / Appium、未测 bundle 或性能
- worktrees：本机 `research-worktrees/`，不进入 Git
- forbidden overlap：未修改 playwright、cypress、puppeteer 及其他已占用主题页

## webdriverio

- canonical source：`https://github.com/webdriverio/webdriverio`
- revision：`2b9721d052ac24207e8628c65a63c3a0de122a2a`
- git tag：`v9.31.3`（annotated tag 剥开后指向同一 commit）
- package：`webdriverio@9.31.3`、`@wdio/cli@9.31.3`
- inspected：
  - `README.md`
  - `package.json`
  - `packages/webdriverio/package.json`
  - `packages/wdio-cli/package.json`
  - `packages/wdio-cli/bin/wdio.js`
  - `packages/wdio-cli/src/run.ts`
  - `packages/wdio-cli/src/commands/run.ts`
  - `packages/wdio-cli/src/launcher.ts`
  - `packages/wdio-config/src/constants.ts`
  - `packages/wdio-local-runner/src/index.ts`
  - `packages/wdio-local-runner/src/run.ts`
  - `packages/wdio-runner/src/index.ts`
  - `packages/wdio-utils/src/node/startWebDriver.ts`
  - `packages/webdriver/package.json`
  - `packages/webdriver/src/utils.ts`
  - `packages/webdriverio/src/index.ts`
  - `packages/webdriverio/src/middlewares.ts`
  - `packages/webdriverio/src/utils/implicitWait.ts`
  - `packages/webdriverio/src/commands/browser/$.ts`
  - `packages/webdriverio/src/commands/browser/waitUntil.ts`
- observed：
  - npm `gitHead` 与 annotated tag `v9.31.3` 均指向 `2b9721d0...`；
  - 同提交里 `webdriverio` / `@wdio/cli` 报 `9.31.3`，`webdriver` 包仍报 `9.31.2`，`@wdio/protocols` 报 `9.31.1`；
  - 发布包 `engines.node` 为 `>=18.20.0`；根 monorepo 只约束 pnpm；
  - CLI 主链是 `bin/wdio.js` → `run()` → `Launcher.run()` → `initializePlugin(runner,'runner')`；
  - 默认 `runner: 'local'`、`framework: 'mocha'`、`injectGlobals: true`、`waitforTimeout: 5000`、`waitforInterval: 100`；
  - `capabilities` 为非数组对象时走 multiremote，没有独立 `multiremote: true` 开关；
  - `webdriver` 管 Classic HTTP / BiDi WebSocket / session；`webdriverio` 管 `$` / wait / mobile 高层命令；
  - 非 Safari 且未设 `wdio:enforceWebDriverClassic`、并且 `browserName` 为字符串时，session 创建会写 `webSocketUrl: true`；
  - Appium capability 时 `startWebDriver()` 不自动 spawn 桌面 browser driver；
  - 元素命令的“隐式等待”是 `elementErrorHandler` + `implicitWait()` → `waitForExist()`，不是 WebDriver `implicit` timeout API；
  - 仓库内无 `@wdio/sync`；browser runner 需显式 `runner: 'browser'`，且 launcher 把它的 `maxInstances` 收成 1。
- provenance：
  - Git tag `v9.31.3` 与 npm `webdriverio@9.31.3` / `@wdio/cli@9.31.3` 标识同一可达提交；
  - 协议包 `webdriver@9.31.2` 是同提交内的 workspace 版本漂移，不是另一 SHA。

## nightwatch

- canonical source：`https://github.com/nightwatchjs/nightwatch`
- revision：`765afc35669d24563b5ae98a84c34b6857c3fc01`
- git tag：`v3.16.0`
- package：`nightwatch@3.16.0`
- inspected：
  - `README.md`
  - `package.json`
  - `index.js`
  - `bin/nightwatch`
  - `bin/runner.js`
  - `lib/index.js`
  - `lib/runner/cli/cli.js`
  - `lib/runner/runner.js`
  - `lib/settings/defaults.js`
  - `lib/settings/settings.js`
  - `lib/core/client.js`
  - `lib/core/queue.js`
  - `lib/core/asynctree.js`
  - `lib/transport/factory.js`
  - `lib/transport/selenium-webdriver/index.js`
  - `lib/transport/selenium-webdriver/cdp.js`
  - `lib/api/index.js`
  - `lib/api/_loaders/element-global.js`
  - `lib/api/element-commands/_waitFor.js`
  - `lib/testsuite/index.js`
  - `lib/page-object/index.js`
- observed：
  - npm `gitHead` 与 tag `v3.16.0` 同指 `765afc35...`；`package.json` version 为 `3.16.0`；
  - `engines.node` 为 `>= 18.20.5`；`bin.nightwatch` 指向 `./bin/nightwatch`；无 `exports` map，只有 `main` / `types`；
  - CLI 主链是 `bin/nightwatch` → `Nightwatch.cli` → `CliRunner.setupAsync().runTests()`；
  - `browser` 是 `NightwatchAPI`（`client.api`），底层 `transport.driver` 才是 `selenium-webdriver`；
  - 命令经 `CommandQueue` + `AsyncTree` 串行调度，不是测试文件里裸 `await` driver；
  - `TransportFactory.createWebdriver` 按 BrowserStack / Selenium|Appium / 本地 `webdriver.start_process` 分支；
  - CDP 走 `driver.createCDPConnection('page')`，不是与 WebDriver 平行的第二套主 transport；
  - 默认 `desiredCapabilities.browserName` 为 `firefox`；`waitForConditionTimeout` 5000、`waitForConditionPollInterval` 500、`retryAssertionTimeout` 5000、`element_command_retries` 3；
  - `assert` / `expect` 默认 `abortOnFailure=true`，失败会清空命令队列；`verify` 默认不中止；`end_session_on_fail` 默认 true；
  - CLI 运行时优先 `nightwatch.conf.js|.ts|.cjs`，但 argv / `createClient` 默认字符串仍写 `./nightwatch.json`。
- provenance：
  - Git tag `v3.16.0` 与 npm `nightwatch@3.16.0` 标识同一可达提交；
  - 身份是 tag + package version + commit SHA，无额外 gitHead 冲突。
