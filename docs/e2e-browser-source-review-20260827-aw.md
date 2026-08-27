# E2E browser source review (writer AW)

> 用途：记录 Puppeteer、Cypress 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL AW
- evidence：GitHub metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、未启动浏览器、未测 bundle 或性能
- worktrees：本机 `research-worktrees/`，不进入 Git

## Puppeteer

- canonical source：`https://github.com/puppeteer/puppeteer`
- revision：`21efe834b7094d53a1c0d633dc69deced17702d8`
- package：`puppeteer@25.9.0` / `puppeteer-core@25.9.0`
- provenance：npm `gitHead` 与 annotated-free tag `puppeteer-v25.9.0` 同指该提交
- engines：`node >=22.12.0`
- inspected：
  - `packages/puppeteer/package.json`
  - `packages/puppeteer-core/package.json`
  - `packages/puppeteer/src/puppeteer.ts`
  - `packages/puppeteer-core/src/node/PuppeteerNode.ts`
  - `packages/puppeteer-core/src/node/LaunchOptions.ts`
  - `packages/puppeteer-core/src/node/ChromeLauncher.ts`
  - `packages/puppeteer-core/src/revisions.ts`
  - `packages/puppeteer-core/src/common/TimeoutSettings.ts`
  - `packages/puppeteer-core/src/api/ElementHandle.ts`
  - `packages/puppeteer-core/src/api/Frame.ts`
  - `packages/puppeteer-core/src/cdp/Frame.ts`
  - `packages/puppeteer-core/src/common/WaitTask.ts`
- observed：
  - `puppeteer` 包实例化 `PuppeteerNode({ isPuppeteerCore: false })` 并负责下载浏览器；`puppeteer-core` 必须自备 `executablePath` 或 `channel`；
  - `launch()` 默认 `browser` 为 `chrome`（可被 configuration.defaultBrowser 覆盖），只接受 `chrome` / `firefox`；
  - Chrome 默认 `headless = !devtools`，`true` 时传 `--headless=new`，`'shell'` 时传旧 `--headless`；
  - 绑定的 Chrome for Testing / chrome-headless-shell 为 `152.0.7977.54`，Firefox 为 `stable_154.0`；
  - 默认 timeout / navigation timeout 为 30000ms；`page.goto` 的 CDP `waitUntil` 默认为 `['load']`；
  - `Frame.click(selector)` 只做一次 `$()`，找不到立刻抛错；`ElementHandle.click` 是 `scrollIntoViewIfNeeded` + `clickablePoint` + `mouse.click`，没有 Playwright 那种 visible/enabled/stable 重试循环。

## Cypress

- canonical source：`https://github.com/cypress-io/cypress`
- revision：`979b6a213e49e5ca65c9f7f53e023331f68ad459`
- package：`cypress@15.21.1`
- provenance：GitHub annotated tag `v15.21.1` 剥到上述提交；`git describe --tags --exact-match` 为 `v15.21.1`。npm `cypress@15.21.1` **没有** `gitHead`，仓库根与 `cli`/`packages/*` 的 `package.json` version 均为 `0.0.0-development`
- engines：仓库根 `node >=22.19.0`
- inspected：
  - `package.json`
  - `packages/config/src/options.ts`
  - `packages/config/test/project/utils.spec.ts`
  - `packages/driver/src/cypress.ts`
  - `packages/driver/src/cypress/cy.ts`
  - `packages/driver/src/cypress/command_queue.ts`
  - `packages/driver/src/cy/retries.ts`
  - `packages/driver/src/cy/actionability.ts`
  - `packages/driver/src/cy/commands/origin/index.ts`
  - `packages/driver/src/cy/commands/querying/querying.ts`
- observed：
  - driver 注入被测页，命令进入 `CommandQueue`，失败后由 `retries.retry` 默认 16ms 间隔重试，直到 `defaultCommandTimeout`；
  - 默认超时：`defaultCommandTimeout=4000`、`pageLoadTimeout=60000`、`requestTimeout=5000`、`responseTimeout=30000`、`execTimeout=60000`、`taskTimeout=60000`；
  - 默认 `retries.runMode/openMode=0`、`testIsolation=true`、`chromeWebSecurity=true`、`scrollBehavior='top'`、`includeShadowDom=false`、`experimentalWebKitSupport=false`、`modifyObstructiveCode=true`；
  - e2e `specPattern` 默认 `cypress/e2e/**/*.cy.{js,jsx,ts,tsx}`；
  - actionability 在 `force !== true` 时检查 attached / notDisabled / strictlyVisible / notReadonly / notAnimating / notCovered；
  - `cy.origin()` 在 WebKit 上直接抛 `webkit.origin`；跨源回调跑在 spec bridge，不能把不可序列化 subject 暴露给 command log。
