---
title: Cypress — 把测试跑进被测页的命令队列运行器
description: 把 driver 注入被测页的命令队列测试运行器，查询会重试，测试级 retries 默认关闭
来源: 'https://github.com/cypress-io/cypress'
日期: 2026-08-27
分类: 测试 / 浏览器自动化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/cypress-io/cypress
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 979b6a213e49e5ca65c9f7f53e023331f68ad459
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 15.21.1
---

## 是什么

Cypress 是一个 **把 driver 注入被测应用（AUT）的端到端测试运行器**。日常类比：它不是站在窗外遥控浏览器的人，而是钻进车厢、坐在副驾上的考官——和页面共享运行时，所以能看见 DOM、网络和 clock，但也受同源与序列化约束。

你写：

```js
it("登录后看到仪表盘", () => {
  cy.visit("/login");
  cy.get("input[name=email]").type("a@b.c");
  cy.get("button[type=submit]").click();
  cy.location("pathname").should("eq", "/dashboard");
});
```

每条 `cy.*` 先进入 `CommandQueue`，再在失败时按间隔重试，直到对应超时。固定 15.21.1 的仓库要求 Node `>=22.19.0`。它自带 e2e / component runner，不需要再套一层 [[jest]]。

## 为什么重要

不理解 Cypress，下面这些事都没法解释：

- 为什么 `cy.get('.btn')` 在按钮 200ms 后才出现时仍然能过，而 [[puppeteer]] 的 `page.click` 会立刻失败
- 为什么跨域跳转要包进 `cy.origin()`，且 WebKit 上这条命令直接不可用
- 为什么默认 4 秒命令超时和 60 秒页面加载超时是两套预算
- 为什么关掉 `chromeWebSecurity` 或 `testIsolation` 会改变一整类 flake 的形状

## 核心要点

主链可以拆成五步：

1. **读配置**：`packages/config` 给出默认值。命令超时 4000ms，页面加载 60000ms，`cy.request` 等请求 5000ms / 响应 30000ms，`cy.exec` / `cy.task` 各 60000ms。`retries.runMode` 与 `openMode` 默认都是 0。

2. **注入 driver**：`packages/driver` 在 AUT 里创建 `Cypress` / `cy`，并把命令推进 `CommandQueue`。

3. **查询并重试**：`cy.get` 在超时窗口内反复查 DOM。`retries.retry` 默认间隔 16ms，并清掉 Mocha runnable 自己的计时，改由命令超时负责。

4. **actionability**：点击等动作在 `force !== true` 时检查 attached、notDisabled、strictlyVisible、notReadonly、notAnimating、notCovered；默认 `scrollBehavior: 'top'`。

5. **跨源走 spec bridge**：`cy.origin(url, fn)` 把回调派到第二个 origin。WebKit 上直接抛 `webkit.origin`；不可序列化的 subject 不能原样写进 command log。

## 实践示例

### 案例 1：默认约定下的一条 e2e

```js
// cypress/e2e/login.cy.js   ← 默认 specPattern
describe("login", () => {
  it("提交后进入 dashboard", () => {
    cy.visit("/login");                    // 受 pageLoadTimeout=60000
    cy.get("[data-cy=email]").type("a@b.c");
    cy.get("[data-cy=submit]").click();    // 受 defaultCommandTimeout=4000
    cy.contains("h1", "Dashboard").should("be.visible");
  });
});
```

e2e 默认只收 `cypress/e2e/**/*.cy.{js,jsx,ts,tsx}`。文件名少了 `.cy` 会被静默忽略，看起来像“没发现测试”。

### 案例 2：跨源必须显式切 origin

```js
cy.visit("https://app.example.com/login");
cy.origin("https://id.example.com", () => {
  cy.get("input[name=username]").type("ada");
  cy.get("form").submit();
});
cy.location("host").should("eq", "app.example.com");
```

`chromeWebSecurity` 默认 `true`。跨源 DOM 不能在主 origin 里直接 `cy.get`。WebKit 即便打开 `experimentalWebKitSupport`，`cy.origin` 仍然拒绝执行。

### 案例 3：强制点击会跳过大部分可行动性

```js
cy.get(".overlay-target").click({ force: true });
```

`force: true` 跳过 disabled / visibility / covered / animation 检查，但仍要求节点存在。它解决的是“被挡住也能点”，不是“节点还没渲染”。

## 踩过的坑

1. **把命令重试当成测试重试**：元素查询会在 4 秒内重试；整个 `it()` 默认 `retries.runMode=0`，失败不会自动再跑一遍。

2. **把 4 秒当成页面加载预算**：`cy.visit` 走 `pageLoadTimeout=60000`。反过来，慢断言不能指望 visit 的 60 秒。

3. **在主 origin 操作第二域 DOM**：必须 `cy.origin`。WebKit 上这条路不存在。

4. **component 测试关掉 testIsolation**：配置校验不允许 component 把 `testIsolation` 设为 `false`。

5. **用 npm `gitHead` 对提交**：`cypress@15.21.1` 没有 `gitHead`。本文用 GitHub tag `v15.21.1` 剥出的提交；仓库内 package version 仍是 `0.0.0-development`。

## 适用 vs 不适用场景

**适用**：

- 单页 / 同站为主的 UI 回归，需要 GUI、时间旅行和时间轴日志
- 团队希望 runner、重试查询、截图、network stub 在一个包里
- component 测试与 e2e 共用 `*.cy.*` 约定

**不适用**：

- 多 tab、任意多窗口、或把浏览器当通用 CDP 客户端 → [[puppeteer]]
- 必须覆盖 WebKit 且依赖 `cy.origin` → 固定 15.21.1 做不到
- 不能接受 Node `>=22.19.0`，或不能在 CI 安装 Cypress 二进制

## 固定版本边界

- 本文绑定 `cypress-io/cypress@979b6a213...`，发布标签 `v15.21.1`。npm 同名版本没有 `gitHead`，未伪造 provenance。
- 默认超时与隔离见上文；`experimentalWebKitSupport` 默认 `false`；`modifyObstructiveCode` 默认 `true`。
- 仓库 engines 为 Node `>=22.19.0`。未安装依赖、启动 Cypress、打开浏览器或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **共享运行时换来可观察性，也换来源约束**——能看见 AUT，就不能假装自己是外部 CDP 用户。
2. **重试分两层**——命令/查询重试默认开，测试级 retries 默认关。
3. **超时是多本账**——命令、页面、请求、task 各有数字，不能互相挪用。
4. **跨源是显式协议**——`cy.origin` 是序列化边界，不是普通 `cy.visit`。

## 应用型自测

1. 按钮 1.5 秒后才插入 DOM。`cy.get('button').click()` 在默认配置下会失败吗？
2. 同一 `it()` 第一次失败，默认 `retries` 会再跑一遍测试吗？
3. 在 WebKit 里调用 `cy.origin('https://other.test', fn)`，固定 15.21.1 会怎么做？

检查点：

1. 不会只因为 1.5 秒就失败；查询与 actionability 会重试到 4000ms。
2. 不会。`runMode` / `openMode` 默认都是 0。
3. 抛 `webkit.origin`，不会进入 spec bridge。

## 延伸阅读

- 固定源码：[cypress-io/cypress](https://github.com/cypress-io/cypress) —— 本文绑定提交 `979b6a213e49e5ca65c9f7f53e023331f68ad459`
- 文档：[docs.cypress.io](https://docs.cypress.io/)
- [[puppeteer]] —— 协议客户端，没有命令队列
- [[playwright]] —— 带 fixture 的多浏览器 runner
- [[testing-library]] —— 组件查询哲学，常被 Cypress Testing Library 包一层

## 关联

- [[puppeteer]] —— 站在浏览器外的 CDP 客户端
- [[playwright]] —— 同赛道 runner，隔离模型不同
- [[vitest]] —— 单测 / 组件测运行时，不是浏览器 e2e
- [[testing-library]] —— 以角色/文本查询 UI 的共用思路
- [[msw]] —— 若不用 `cy.intercept`，可以在应用层 stub 网络

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[puppeteer]] —— Puppeteer — 用 CDP 直接驱动 Chrome / Firefox 的浏览器客户端
