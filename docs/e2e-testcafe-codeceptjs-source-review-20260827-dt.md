# TestCafe / CodeceptJS source review

> 用途：记录 testcafe、codeceptjs 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DT
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器、CLI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## TestCafe

- canonical source：`https://github.com/DevExpress/testcafe`
- revision：`f210cfcdbb588c89bfb0b00273fa7ee0f1959f22`
- git tag：`v3.7.6`
- package：`testcafe@3.7.6`
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/testcafe.js`
  - `src/runner/index.js`
  - `src/runner/bootstrapper.ts`
  - `src/compiler/index.js`
  - `src/compiler/compilers.js`
  - `src/compiler/test-file/add-export-api.ts`
  - `src/api/exportable-lib/index.js`
  - `src/api/test-controller/index.js`
  - `src/test-run/index.ts`
  - `src/native-automation/index.ts`
  - `src/configuration/default-values.ts`
  - `src/utils/get-testcafe-version.ts`
- observed：
  - `createTestCafe()` 解析配置、申请 `port1`/`port2`，再构造 `TestCafe`；
  - `TestCafe` 始终创建 `testcafe-hammerhead` `Proxy` 与 `BrowserConnectionGateway`，并按需注册 driver/UI 资源；
  - `DEFAULT_DISABLE_NATIVE_AUTOMATION` 为 `false`；remote 连接或不受支持的浏览器会强制 `disableNativeAutomation: true`；
  - remote `createBrowserConnection()` 也会关闭 native automation；
  - compiler 候选是 legacy / ES-next / TypeScript / CoffeeScript / raw / DevTools；`fixture`/`test` 由 compiler 注入 exportable lib；
  - TypeScript 强制 `module=CommonJS`、`moduleResolution=Node`、`target=ES2016`，这三项不可覆盖；
  - `TestController` 把命令排进 `executionChain`，并用扩展 Promise 跟踪漏写的 `await`；
  - 默认 timeout：selector 10000ms、assertion 3000ms、pageLoad 3000ms；concurrency 默认 1；
  - `engines.node` 为 `>=20.0.0`；依赖钉住 `testcafe-hammerhead@31.7.8`。
- provenance：
  - Git tag `v3.7.6`、npm `testcafe@3.7.6` 的 `gitHead` 与本提交一致；
  - 源码 `package.json` 与 npm 均报告 `3.7.6`。

## CodeceptJS

- canonical source：`https://github.com/codeceptjs/CodeceptJS`
- revision：`8b918159193d4f9ff8d4eb6e7f720c168266e299`
- git tag：`4.1.0`
- package：`codeceptjs@4.1.0`
- inspected：
  - `package.json`
  - `lib/index.js`
  - `lib/codecept.js`
  - `lib/container.js`
  - `lib/actor.js`
  - `lib/recorder.js`
  - `lib/step/record.js`
  - `lib/helper.js`
  - `lib/helper/Playwright.js`
  - `lib/mocha/factory.js`
  - `lib/mocha/ui.js`
  - `lib/timeout.js`
  - `lib/workers.js`
  - `lib/plugin/retryFailedStep.js`
- observed：
  - 源码 `package.json` 声明 `"type": "module"`，入口是 ESM `lib/index.js`；
  - `Codecept.init()` 先建 globals，再 `container.create()`，再挂 listener/hook；
  - `Codecept.run()` 等 `container.started()`，把文件交给 Mocha，再 `loadTests()` 后 `mocha.run()`；
  - Mocha UI 把 `Feature`/`Scenario`/`Before` 注入 context；root suite `timeout(0)`；
  - Container 的标准 acting helpers 是 `Playwright`、`WebDriver`、`Puppeteer`、`Appium`；
  - Actor 把 helper 的非 `_` 方法包成 `recordStep()`，返回 `recorder.promise()`；
  - recorder 是单例 Promise 队列；内建 retry 默认 `retries: 0`；`retryFailedStep` 插件默认 3 次且忽略 `amOnPage`/`wait*` 等；
  - Playwright helper 文档默认：`browser=chromium`、`timeout=1000`、`waitForTimeout=1000`、`waitForAction=100`、`restart=false`（重启 context）；
  - Helper 基类已外置到 `@codeceptjs/helper`；Playwright/WebDriver/Puppeteer 是 helper 运行时依赖，不是本包 dependencies；
  - `Workers` 用 `worker_threads` 拉 `command/workers/runTests.js`；`Codecept.loadTests()` 支持 `index/total` sharding；
  - `Codecept.version()` 读本仓 `package.json` 的 `version` 字段。
- provenance：
  - Git tag `4.1.0` 与 npm `codeceptjs@4.1.0` 的 `gitHead` 都指向本提交；
  - 本提交工作树 `package.json` 的 `version` 仍是 `4.0.0-rc.1`；npm tarball 的 `package.json` 报告 `4.1.0`；
  - 未猜测发布脚本如何改写版本；正文以 tag + npm 身份绑定，并披露工作树字段冲突。
