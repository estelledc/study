---
title: CodeceptJS — 用 I. 把多种浏览器后端收成一套场景 DSL
description: 介绍 CodeceptJS 如何用 Mocha Scenario UI、I. actor 和可替换 helper 组织端到端场景。
来源: https://github.com/codeceptjs/CodeceptJS
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/codeceptjs/CodeceptJS
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8b918159193d4f9ff8d4eb6e7f720c168266e299
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.1.0
---

## 是什么

CodeceptJS 是一个面向场景的端到端测试门面：你写 `I.click()` / `I.see()`，真正点浏览器的是 helper。日常类比：它是导演台，不是摄像机——摄像机可以是 Playwright、WebDriver、Puppeteer 或 Appium。

固定 tag `4.1.0` 指向 `8b918159...`。源码是 ESM（`"type": "module"`），运行器把测试文件交给 Mocha，再用自定义 UI 提供 `Feature` / `Scenario`。

```js
Feature("login");

Scenario("user sees dashboard", ({ I }) => {
  I.amOnPage("/login");
  I.fillField("email", "a@b.c");
  I.click("Submit");
  I.see("Dashboard");
});
```

`I` 上的方法不是同步的。Actor 把 helper 方法包进 recorder 队列，返回 `recorder.promise()`。

## 为什么重要

不理解 CodeceptJS，下面这些事都没法解释：

- 为什么同一份 `I.click()` 能换 Playwright / WebDriver，而不改 Scenario 正文
- 为什么“看起来像同步步骤”其实依赖一条全局 Promise 链
- 为什么只装 `codeceptjs` 还不能打开浏览器
- 为什么 git 工作树的 `package.json` 版本和 npm `4.1.0` 对不上

## 核心要点

固定版本的主链可以拆成五步：

1. **`Codecept.init()` 组装容器**：先 globals，再 `container.create()`，再挂 listener。Container 创建 Mocha、helpers、support 对象（默认 Actor `I`）、plugins。

2. **标准 acting helpers 只有四个**：`Playwright`、`WebDriver`、`Puppeteer`、`Appium`。Helper 基类已外置到 `@codeceptjs/helper`。这些浏览器库不在 `codeceptjs` 的 `dependencies` 里。

3. **Mocha 只是执行引擎**：`mocha.ui()` 换成 Scenario UI；root suite `timeout(0)`。`Feature`/`Scenario`/`Before` 被写进 Mocha context，并立刻灌进 globals，方便 ESM 加载。

4. **步骤进入 recorder，而不是直接 await helper**：`recordStep()` 把 `step.run()` 推进单例队列。recorder 内建 retry 默认 `retries: 0`。`retryFailedStep` 插件默认 3 次，并忽略 `amOnPage`、`wait*`、`send*` 等。

5. **并行是 worker + 可选 shard**：`Workers` 用 `worker_threads` 跑 `command/workers/runTests.js`。`loadTests()` 还接受 `index/total` sharding，按文件切片而不是按 Scenario。

## 实践示例

### 案例 1：用 Playwright helper，但 Scenario 不提 Playwright

```js
export const config = {
  tests: "./*_test.js",
  helpers: {
    Playwright: {
      url: "http://localhost:3000",
      browser: "chromium",
      show: false,
      restart: false
    }
  }
};
```

Playwright helper 文档默认 `browser=chromium`、动作 timeout 1000ms、`waitForTimeout` 1000ms、`waitForAction` 100ms。`restart: false` 表示重启 browser context，不是关浏览器。`playwright` 包要自己装。

### 案例 2：自定义步骤仍走同一条队列

```js
// ESM steps file, included as I
export default function () {
  return actor({
    login(email) {
      this.fillField("email", email);
      this.click("Submit");
    }
  });
}
```

自定义方法被包成 `MetaStep`。它内部再调 `I.fillField`，所以还是 recorder 串行，不是两条并行链。

### 案例 3：按文件分片，而不是按步骤分片

```text
npx codeceptjs run --shard 1/4
```

`_applySharding()` 要求 `index/total`，用 `Math.ceil(length / total)` 切文件数组。同一文件里的多个 Scenario 不会被拆到不同 shard。

## 踩过的坑

1. **以为 `I.click()` 立刻执行**：它只是入队；真正顺序看 recorder 是否还在跑。
2. **只装 `codeceptjs` 就跑 Playwright helper**：浏览器库是 helper 运行时依赖，源码 dependencies 里没有 `playwright`。
3. **把 git 工作树的 `4.0.0-rc.1` 写成已发布版本**：npm tarball 是 `4.1.0`，同提交的仓库 `package.json` 仍是 `4.0.0-rc.1`；`Codecept.version()` 读的是这份文件。
4. **打开 `retryFailedStep` 就以为所有步骤都会重试**：默认忽略 `amOnPage` / `wait*` / `send*` / `execute*` / `run*` / `have*`。
5. **把 suite timeout 当 Mocha 默认 2s**：Scenario UI 把 root suite 设成 `timeout(0)`，超时要看 Codecept 自己的 timeout order。

## 适用 vs 不适用场景

**适用**：

- 场景文本要稳定，后端可能从 WebDriver 换到 Playwright
- 已有 Mocha 报告 / CI 习惯，只想换一层 actor DSL
- 需要 Gherkin、workers 或 `index/total` 文件分片

**不适用**：

- 想要单一浏览器实现、单一 timeout 语义：应直接读 [[playwright]] / WebDriver 合同
- 把 CodeceptJS 当成浏览器驱动：它不启动 CDP，只调度 helper
- 需要本仓 `package.json` 与 npm 版本字段一致才能做供应证明：固定提交存在冲突
- 同步风格测试却关闭 recorder：步骤合同会断

## 固定版本边界

- 本文绑定 `codeceptjs/CodeceptJS@8b918159...`，tag `4.1.0`，npm `codeceptjs@4.1.0`，`gitHead` 与 tag 一致。
- 同提交工作树 `package.json#version` 为 `4.0.0-rc.1`；npm tarball 为 `4.1.0`。未猜测发布改写步骤。
- `engines.node` 为 `>=16.0`；包是 ESM。`tsx` 是可选 peer。
- Playwright helper 默认 timeout 1000ms；recorder 默认不重试。
- 未安装 helper 后端、启动浏览器或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **门面和驱动必须分开读**——`I` 的稳定性不表示 Playwright 超时也被统一
2. **“同步步骤”常常是 Promise 队列的错觉**
3. **标准 acting helper 名单是源码常量，不是文档印象**
4. **tag / npm / 工作树 version 字段可以不一致，必须分开披露**

## 应用型自测

1. 只安装 `codeceptjs`，配置 `helpers.Playwright`。能否从本包 `dependencies` 推出浏览器一定能启动？
2. `I.click('Save')` 返回后，点击是否已经发生？
3. 在 git checkout `8b918159...` 上调用 `Codecept.version()`，会得到 `4.1.0` 吗？

检查点：

1. 不能。`playwright` 不在 dependencies 里，helper 会在运行时再加载。
2. 不能。它返回 recorder 队列上的 Promise，执行点在后续链。
3. 不会从工作树得到 `4.1.0`。`version()` 读到的是 `4.0.0-rc.1`。

## 延伸阅读

- 官方文档：[codecept.io](https://codecept.io)
- 固定源码：[codeceptjs/CodeceptJS](https://github.com/codeceptjs/CodeceptJS) —— 本文绑定 `8b918159193d4f9ff8d4eb6e7f720c168266e299`
- 审查记录：仓库内 `docs/e2e-testcafe-codeceptjs-source-review-20260827-dt.md`
- [[testcafe]] —— 同一批对照：自带 compiler 与浏览器中间层
- [[playwright]] —— 默认 helper 后端之一，合同要以 Playwright 源码为准

## 关联

- [[testcafe]] —— 自己驱动浏览器；CodeceptJS 把驱动留给 helper
- [[playwright]] —— Playwright helper 的底层
- [[jest]] —— 另一条 JS 测试运行器，不提供 `I.` actor
- [[vitest]] —— 单元/组件层，不调度 WebDriver
- [[testing-library]] —— 查询语义可对照，但停留在组件测试
