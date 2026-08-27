---
title: TestCafe — 自带编译与代理的端到端测试运行器
description: 介绍 TestCafe 如何用自带 compiler、hammerhead 代理和默认 native automation 跑端到端测试。
来源: https://github.com/DevExpress/testcafe
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/DevExpress/testcafe
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f210cfcdbb588c89bfb0b00273fa7ee0f1959f22
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.7.6
---

## 是什么

TestCafe 是 DevExpress 的端到端测试工具：测试文件由它自己的 compiler 变成 `fixture`/`test`，再由 runner 打开真浏览器执行。日常类比：它不是“再包一层 Selenium”，而是自己当编译器、代理和命令队列。

固定 `v3.7.6` 里，公开入口是 `createTestCafe()`。它先读配置、申请 `port1`/`port2`，再构造带 `testcafe-hammerhead` 代理的 `TestCafe` 实例。

```js
import createTestCafe from "testcafe";

const testcafe = await createTestCafe({ hostname: "localhost" });
const failed = await testcafe.createRunner()
  .src("tests/")
  .browsers("chrome:headless")
  .run();
await testcafe.close();
```

`createRunner()` 只创建任务编排器；浏览器连接、编译和代理启动发生在 `run()`。

## 为什么重要

不理解 TestCafe，下面这些事都没法解释：

- 为什么测试文件里能直接写 `fixture` / `test`，而不必从 npm 包 import 它们
- 为什么默认已经走 native automation，remote 浏览器却会把它关掉
- 为什么漏写 `await t.click()` 会被跟踪，而不是默默变成竞态
- 为什么 TypeScript 测试不能随便改 `module` / `target` 去贴近项目 tsconfig

## 核心要点

固定版本的主链可以拆成四层：

1. **进程入口先建代理**：`TestCafe` 构造函数始终 `new hammerhead.Proxy()`，并挂上 `BrowserConnectionGateway`。driver / UI 脚本作为代理资源注册，不是浏览器扩展。

2. **native automation 是默认，但可被关掉**：`DEFAULT_DISABLE_NATIVE_AUTOMATION` 为 `false`。CDP 只服务本地浏览器；remote 连接或不受支持的浏览器会 `mergeOptions({ disableNativeAutomation: true })`。`createBrowserConnection()` 也强制关闭它。

3. **compiler 注入测试 DSL**：候选编译器是 legacy、ES-next（Babel）、TypeScript、CoffeeScript、raw、DevTools。`fixture`/`test` 是 compiler 给 exportable lib 加的 getter，不是稳定的 named export。TypeScript 强制 CommonJS + Node resolution + ES2016，这三项不可覆盖。

4. **`t` 是命令队列，不是同步 API**：`TestController` 把 `ClickCommand` 等排进 `executionChain`。它返回扩展 Promise，用 callsite 记录漏掉的 `await`。默认 selector timeout 10s，assertion / pageLoad 各 3s。

## 实践示例

### 案例 1：compiler 注入的 fixture / test

```js
import { Selector } from "testcafe";

fixture("login").page("https://example.test/login");

test("submit name", async (t) => {
  await t
    .typeText("#email", "a@b.c")
    .click("#submit")
    .expect(Selector("h1").innerText).eql("Dashboard");
});
```

`Selector` 来自 exportable lib；`fixture`/`test` 由当前测试文件的 compiler 注入。`t.expect(...)` 走 assertion 命令，不是 chai 的同步断言。

### 案例 2：程序化 runner 与默认 concurrency

```js
const runner = testcafe.createRunner();
await runner.src(["tests/login.js"]).browsers(["chrome"]).concurrency(2).run();
```

默认 concurrency 是 1。`src` 未写时，查找目录默认是 `tests` 和 `test`。`run()` 的失败数来自 reporter 的 testCount − passed；`stopOnFirstFail` 会把它收成 1。

### 案例 3：remote 连接不能假设 native automation

```js
const connection = await testcafe.createBrowserConnection();
// 打开 connection.url 后，才能把它交给 runner.browsers(connection)
```

源码在创建 remote 连接时直接 `disableNativeAutomation: true`。多窗口 API 在 native 模式下会抛 `MultipleWindowsModeIsNotSupportedInNativeAutomationModeError`，除非打开 experimental 开关。

## 踩过的坑

1. **把 hammerhead 代理当成“旧模式遗物”**：即使 native automation 打开，`TestCafe` 仍会创建 Proxy 并注册资源。
2. **把项目 tsconfig 的 `module`/`target` 原样交给 TestCafe**：这三项被钉死，自定义 compiler options 覆盖不了。
3. **漏 `await` 还继续用同一个 `t`**：`executionChain` 会继续排队，但 callsite 跟踪的是“谁没 await”，不是自动串行化所有后续语句。
4. **remote / cloud browser 仍写 CDP-only 假设**：bootstrapper 会关 native automation。
5. **把 `createTestCafe('localhost', 1337, 1338)` 当新 API**：位置参数只为兼容保留，源码注释要求新 API 走配置对象。

## 适用 vs 不适用场景

**适用**：

- 要自带 compiler，不想先接 Playwright Test / Mocha
- 本地 Chrome 族浏览器，能接受默认 native automation
- 需要 `Role`、`RequestMock` / `RequestLogger` 这类 TestCafe 自己的会话与请求钩子

**不适用**：

- 主要跑 remote / 云浏览器，却依赖 CDP native automation
- 需要稳定的多窗口语义：固定源码里这是 experimental，且 native 模式默认不支持
- Node 低于 20：`engines.node` 是 `>=20.0.0`
- 想把测试 DSL 当普通库函数 import：`fixture`/`test` 是 compiler 注入

## 固定版本边界

- 本文绑定 `DevExpress/testcafe@f210cfcd...`，tag `v3.7.6`，npm `testcafe@3.7.6`，`gitHead` 与 tag 一致。
- 默认 timeout：selector 10000ms、assertion 3000ms、pageLoad 3000ms；quarantine 默认 attemptLimit 5 / successThreshold 3。
- 依赖钉住 `testcafe-hammerhead@31.7.8`；Node `>=20.0.0`。
- 未安装依赖、启动浏览器或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **“不用 WebDriver”不等于“没有中间层”**——hammerhead 代理仍在进程里
2. **测试 DSL 可以是编译期注入，而不是包导出**
3. **默认 native automation 是本地 CDP 合同，不是所有 browser provider 的合同**
4. **漏 await 能被跟踪，是因为 Promise 被改写，不是语言自己保证**

## 应用型自测

1. `createTestCafe()` 之后还没 `run()`。hammerhead `Proxy` 是否已经构造？
2. 用 remote browser connection 时，还能默认走 native automation 吗？
3. 把 TypeScript 测试的 `compilerOptions.module` 改成 `ESNext`，TestCafe 会按这个发模块吗？

检查点：

1. 会。`new TestCafe(configuration)` 时就已经 `new hammerhead.Proxy()`。
2. 不能。remote 连接会强制 `disableNativeAutomation: true`。
3. 不会。`module` / `moduleResolution` / `target` 是不可覆盖项。

## 延伸阅读

- 官方文档：[testcafe.io](https://testcafe.io/)
- 固定源码：[DevExpress/testcafe](https://github.com/DevExpress/testcafe) —— 本文绑定 `f210cfcdbb588c89bfb0b00273fa7ee0f1959f22`
- 审查记录：仓库内 `docs/e2e-testcafe-codeceptjs-source-review-20260827-dt.md`
- [[codeceptjs]] —— 同一批对照：Mocha + helper，自己不驱动浏览器
- [[playwright]] —— 另一条“浏览器自动化 + 测试运行器”产品切分

## 关联

- [[codeceptjs]] —— actor/helper 门面，浏览器实现可替换
- [[playwright]] —— CodeceptJS Playwright helper 的底层之一；与 TestCafe 不是同一套命令模型
- [[jest]] —— 单元/集成运行器，不负责真浏览器驱动
- [[vitest]] —— Vite 原生测试，e2e 仍要另接浏览器工具
- [[testing-library]] —— 组件层查询，不是进程级 e2e runner
