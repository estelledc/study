# JS test runtime source review

> 用途：记录 Vitest、Playwright 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、未启动浏览器、未测 bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- writer：PARALLEL writer M

## Vitest

- canonical source：`https://github.com/vitest-dev/vitest`
- revision：`9bd8d464e6328c567c2dbcd8fdd977d57a9425c2`
- package：`vitest@4.1.11`
- inspected：
  - `packages/vitest/package.json`
  - `packages/vitest/src/defaults.ts`
  - `packages/vitest/src/constants.ts`
  - `packages/vitest/src/node/create.ts`
  - `packages/vitest/src/node/core.ts`
  - `packages/vitest/src/node/config/resolveConfig.ts`
  - `packages/vitest/src/node/types/config.ts`
  - `packages/vitest/src/node/types/browser.ts`
  - `packages/vitest/src/node/project.ts`
  - `packages/vitest/src/node/watcher.ts`
  - `packages/mocker/src/node/hoistMocks.ts`
  - `packages/mocker/src/node/hoistMocksPlugin.ts`
  - `packages/browser/package.json`
- observed：
  - `createVitest()` resolves `vitest.config.*` then `vite.config.*`, merges Vite config, injects `VitestPlugin`, and starts `createViteServer()`;
  - defaults are `pool: 'forks'`, `environment: 'node'`, `isolate: true`, `fileParallelism: true`, `globals: false`; `watch` defaults to on only when not CI, stdin is a TTY, and the process is not an agent;
  - coverage defaults to provider `v8` with `enabled: false`;
  - the default module runner is Vite `ServerModuleRunner` unless `experimental.viteModuleRunner === false`;
  - `VitestWatcher` listens to `vite.watcher` change/unlink/add and records `changedTests` — rerun is file-level, not in-worker HMR;
  - `@vitest/mocker` hoists `vi.mock` / `vi.unmock` / `vi.hoisted` to the top of the file;
  - browser mode requires a provider factory from `@vitest/browser-playwright`, `@vitest/browser-webdriverio`, or `@vitest/browser-preview`; omitting `browser.provider` throws;
  - Vitest 4 removed nested `test.poolOptions` in favor of top-level options;
  - engines are Node `^20 || ^22 || >=24` and peer Vite `^6 || ^7 || ^8`.
- provenance note：
  - GitHub tag `v4.1.11` is a lightweight tag pointing at `9bd8d464e6328c567c2dbcd8fdd977d57a9425c2` ("chore: release v4.1.11");
  - `packages/vitest/package.json` at that commit reports `4.1.11`;
  - npm `vitest@4.1.11` does not expose `gitHead`; this review binds the GitHub tag commit;
  - `v5.0.0-rc.*` tags exist and are out of scope.

## Playwright

- canonical source：`https://github.com/microsoft/playwright`
- revision：`26a9e470a7b3c7822084b09fb7f13902c5f37b51`
- packages：`playwright@1.62.1`、`playwright-core@1.62.1`、`@playwright/test@1.62.1`
- inspected：
  - `packages/playwright/package.json`
  - `packages/playwright-core/package.json`
  - `packages/playwright-test/package.json`
  - `packages/playwright/src/common/config.ts`
  - `packages/playwright/src/common/fixtures.ts`
  - `packages/playwright/src/index.ts`
  - `packages/playwright/src/matchers/expect.ts`
  - `packages/playwright/src/plugins/webServerPlugin.ts`
  - `packages/playwright-core/src/client/locator.ts`
  - `packages/playwright-core/src/client/page.ts`
  - `packages/playwright-core/src/server/dom.ts`
- observed：
  - `@playwright/test` defaults are timeout 30000 ms, expect timeout 5000 ms, `workers: '50%'`, `fullyParallel: false`, `retries: 0`, `retryStrategy: 'immediate'`;
  - the default `context` fixture calls `browser.newContext()` per test via `_contextFactory`; `page` then calls `context.newPage()`; both are rejected inside `beforeAll` / `afterAll`;
  - `Locator` stores a selector string and re-resolves on each action with `waitForSelector({ state: 'attached' })`;
  - click actionability waits for `visible + enabled + stable` then hit-target; fill waits for `visible + enabled + editable`;
  - `page.click` / `page.fill` / `page.$` still exist and delegate to the main frame; `$` returns an `ElementHandle`;
  - `webServer` accepts one object or an array and waits with `isURLAvailable`;
  - engines are Node `>=20`; browser binaries are not guaranteed by the npm package alone.
- provenance note：
  - GitHub tag `v1.62.1` points at `26a9e470a7b3c7822084b09fb7f13902c5f37b51`;
  - npm `playwright@1.62.1`, `playwright-core@1.62.1`, and `@playwright/test@1.62.1` all report the same `gitHead`;
  - a `next` line `1.63.0-alpha-*` exists and is out of scope.
