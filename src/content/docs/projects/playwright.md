---
title: "Playwright — 浏览器自动化的工程艺术"
description: 跨进程 + 跨语言的协议设计 + 自动等待 + auto-retry locator，把"测试浏览器"做到工业级
sidebar:
  order: 29
  label: "microsoft/playwright"
---

> microsoft/playwright v1.61.0-next（2026-05），Apache 2.0。
>
> Playwright 是 Microsoft 出品的浏览器自动化工具，
> Selenium / Puppeteer 之后的"第三代"答案。
>
> 它的工程艺术不在某一处惊艳——是**多个细小判断累加**：
> 跨进程协议设计、auto-wait 取代 sleep、locator 自动 retry、
> screenshot/video/trace 内置、跨语言 SDK（TS/Python/Java/.NET）。
>
> Season 5 第三篇——"验证基础设施"的范例。

## 一句话定位

**Playwright = 一个浏览器驱动 server（每浏览器一个进程）+ 一份跨语言客户端协议 + auto-wait locator API。**
你写 `await page.click('button')` 自动等元素出现 + 可见 + 稳定才点击。
test、screenshot、video、trace 都是内置而不是插件。

## Why（为什么是它而不是 Selenium / Puppeteer / Cypress）

浏览器自动化工具的代际：

```
2004: Selenium WebDriver
   - 用 W3C WebDriver 标准协议
   - 每浏览器一个 driver binary
   - 同步 API（早期），后期补 async
   - 痛点：经常 flaky，要写 sleep/wait

2017: Puppeteer
   - Chrome only
   - 用 Chrome DevTools Protocol（CDP）直连
   - 比 Selenium 快很多
   - 痛点：仍要手动 wait

2020: Cypress
   - 跑在浏览器内（不是远程驱动）
   - DX 极好，可视化 runner
   - 痛点：只能跑 Chromium，不能多 tab、不能跨域

2020: Playwright
   - 多浏览器（Chromium + Firefox + WebKit）
   - 自定义协议（在 CDP 之上抽象）
   - auto-wait 内置
   - 多语言 SDK
```

**Playwright 的判断分水岭**：

1. **多浏览器一致体验**——补丁过的 Firefox 和 WebKit 让"跨浏览器测试"真实可行
2. **协议层是 framework 主权**——不被 CDP 的局限锁死
3. **Auto-wait**——`page.click(selector)` 自动等可点击，**默认行为消除 90% flaky**
4. **Locator API 而非 selector 字符串**——locators 自动 retry
5. **内置 trace viewer**——失败时给一份"时间倒带"调试录像
6. **Codegen**——`playwright codegen url` 录制操作生成代码
7. **Test runner 内置**——不依赖 Jest/Mocha

| 工具 | 浏览器 | 协议 | auto-wait | trace viewer | 跨语言 |
|---|---|---|---|---|---|
| Selenium | 全 | W3C WebDriver | ✗ | ✗ | ✓ |
| Puppeteer | Chrome | CDP | 部分 | ✗ | TS/JS only |
| Cypress | Chromium | DOM 内嵌 | ✓ | ✓（部分） | TS/JS only |
| **Playwright** | **C+F+W** | **自定义** | **✓** | **✓ 完整** | **TS/Py/Java/.NET** |

**为什么不是 Selenium**：Selenium 是 web 自动化的标准化产物，但**API 设计陈旧**，
async 体验差，flaky 问题靠 sleep 缓解。

**为什么不是 Puppeteer**：Puppeteer 是 Google 出品（Chrome only）。
**Microsoft 把 Puppeteer 团队挖了**——同帮人做出来 Playwright。
Puppeteer 是上一代，Playwright 是下一代。

**为什么不是 Cypress**：Cypress 在 DX 上很好（IDE 友好、time-travel debug），
但**架构限制大**——只能 Chromium、不能多 tab、不能跨域、不能多 origin。
Playwright 没这些限制。

**Playwright 的代价**：
- 启动较重（要装多个浏览器二进制）
- 学习曲线略高于 Cypress
- API 比 Cypress 更"程序化"、不那么"领域语言"

## 仓库地形

```
playwright/
└── packages/
    ├── playwright-core/                ← ★ 核心
    │   └── src/
    │       ├── client/                 ← ★ 客户端 API（用户写测试用的）
    │       │   ├── connection.ts       ← 306 行：协议连接管理
    │       │   ├── channelOwner.ts     ← 243 行：频道对象基类
    │       │   ├── page.ts             ← 916 行：Page 类
    │       │   ├── browser.ts          ← Browser 类
    │       │   ├── network.ts          ← Request/Response
    │       │   └── ...
    │       ├── server/                 ← ★ 服务端（驱动浏览器）
    │       │   ├── frames.ts           ← 1874 行：frame 管理
    │       │   ├── page.ts             ← 1206 行：Page 服务端实现
    │       │   ├── dom.ts              ← 1039 行：DOM 操作
    │       │   ├── network.ts          ← 869 行：网络拦截
    │       │   └── ...
    │       ├── protocol/               ← 跨进程协议
    │       │   ├── validator.ts
    │       │   ├── serializers.ts
    │       │   └── ...
    │       └── tools/                  ← codegen / trace viewer
    ├── playwright-test/                ← @playwright/test 测试运行器
    ├── playwright-browser-chromium/    ← Chromium 二进制 patches
    ├── playwright-browser-firefox/     ← Firefox patches
    ├── playwright-webkit/              ← WebKit patches（Microsoft 自己改的 WebKit）
    ├── trace-viewer/                   ← trace 查看器（独立 web app）
    ├── html-reporter/                  ← HTML 测试报告
    ├── playwright-ct-react / vue / ...  ← 组件测试
    └── extension/                      ← 浏览器扩展（开发者工具集成）
```

**心脏文件**：

1. `packages/playwright-core/src/client/connection.ts:69`——协议层 `Connection` 类
2. `packages/playwright-core/src/client/channelOwner.ts`——所有客户端对象的基类
3. `packages/playwright-core/src/server/frames.ts`（1874 行）——frame 管理 + auto-wait

## 核心机制 · Layer 3 精读

### 机制 1 · 跨进程协议 — 客户端在 Node、服务端在浏览器/驱动进程

Playwright 的执行架构：

```
[your test (Node)]              [Playwright Server (Node)]
        │                                   │
   client/page.ts ──── JSON-RPC ─────  server/page.ts
        │                                   │
        │                            CDP / Firefox protocol / WebKit
        │                                   │
        └─────── 控制 ─────────  [browser process (Chromium / Firefox / WebKit)]
```

**两个 Node 进程**：你的测试代码 + Playwright 服务端。它们之间走 JSON-RPC over WebSocket。

`client/connection.ts:69`：

```typescript
export class Connection extends EventEmitter {
  // 管理客户端 → 服务端的 RPC 调用
}
```

`client/channelOwner.ts`：所有客户端对象（Page / Frame / ElementHandle / ...）继承 `ChannelOwner`，
内部都通过 connection 发消息。

```typescript
// 用户写
await page.click('button')

// 内部展开（伪代码）
await connection.sendMessage({
  guid: page.guid,
  method: 'click',
  params: { selector: 'button' }
})
```

→ **为什么要跨进程**：

1. **隔离**：测试代码崩溃不会带崩浏览器
2. **跨语言**：Python/Java/.NET 客户端连同一个 server——只要语言能发 JSON-RPC
3. **远程**：server 可以跑在 docker / 远程机器，client 跨网络

→ 这是**协议设计的工程美**：跨进程换来灵活性。
和 [LSP](/study/projects/biome/) / [MCP](/study/projects/mcp-ts-sdk/) 同源思路。

### 机制 2 · auto-wait — 默认行为消除 flaky

Selenium / Puppeteer 时代经典代码：

```typescript
// Selenium
driver.findElement(By.css('button')).click()  // ← 元素不存在就崩
// 缓解：driver.wait(...).then(...)

// Puppeteer
await page.click('button')  // ← 一样会崩
```

**典型 flaky 来源**：用户操作触发 fetch → 渲染异步 → 测试代码先执行 click 失败。

Playwright 的回答：**auto-wait 默认行为**。

```typescript
await page.click('button')
```

**内部干了**：

1. 等元素 attach 到 DOM
2. 等元素可见（visibility: visible + display: !none）
3. 等元素稳定（5ms 内位置不变）
4. 等元素 enabled
5. 等元素 receive event（不被其他元素遮挡）
6. 滚动到视图内
7. 真实 click

每一步都有 timeout（默认 30s）。**95% flaky 直接被消除**。

→ 这是把"用户操作的真实复杂性"内化到 framework，让用户**不需要思考异步**。

### 机制 3 · Locator API — 永远不 stale

```typescript
// 不推荐（Puppeteer 风格）
const handle = await page.$('button')   // 返回 ElementHandle
await handle.click()                    // ← DOM 变了 handle 就 stale

// 推荐（Playwright 风格）
const button = page.locator('button')   // ← Locator 是"查找规则"，不是 handle
await button.click()                    // ← 每次操作时重新查找 + auto-wait
```

**Locator 不持有 DOM 引用**——它是个"延迟查询的描述符"。每次调用方法时
重新执行查找——所以**不会 stale**。

```typescript
const items = page.locator('.item')
await items.first().click()
await items.nth(2).hover()
await expect(items).toHaveCount(5)
```

→ 这是把"selectors 是规则"和"elements 是对象"分开。
React 的 ref vs Vue 的 ref vs Playwright 的 Locator——**不同范式的延迟引用**。

### 机制 4 · Trace Viewer — 失败可重放

测试失败后：

```bash
npx playwright show-trace trace.zip
```

打开一个 web app（trace-viewer 包），看到：

- 时间轴上所有动作
- 每个时间点的浏览器截图
- DOM 快照（可点击 inspect）
- Network 请求
- Console log
- Source code（有问题的 test 代码行）

→ **这就是把"测试调试"做成产品级体验**。
对比 Selenium：失败了你只看到 stack trace，根本不知道页面当时长什么样。

### 机制 5 · Codegen — 录制生成代码

```bash
npx playwright codegen https://example.com
```

打开浏览器 + Playwright Inspector。你点击 / 输入 / 滚动——
**所有动作自动转换成代码** ：

```typescript
await page.click('text=Login')
await page.fill('input[name="username"]', 'jason')
await page.click('button[type="submit"]')
await expect(page.locator('text=Welcome')).toBeVisible()
```

→ 这降低了"开始写测试"的门槛——新手不知道写什么 selector 就先录制，
再修改 selector 让它更稳定。

### 机制 6 · 多浏览器一致 API + 自家 patch 的 WebKit

Playwright 不直接用 Apple 的 Safari。它**自己 patch 一份 WebKit** 加自动化能力，
打包成 `playwright-webkit/` package。Firefox 也类似。

→ **这是 Microsoft 工程实力的体现**：维护 3 个浏览器引擎的 patch + 持续跟上游同步。
回报是用户拿到"真正的多浏览器支持"——不只 Chromium。

### 机制 7 · 测试运行器 + 组件测试

```typescript
import { test, expect } from '@playwright/test'

test('should login', async ({ page }) => {
  await page.goto('https://example.com')
  await page.click('text=Login')
  await expect(page).toHaveURL(/.*dashboard/)
})
```

`@playwright/test` 内置 test 运行器：
- 平行运行（默认按 worker count）
- 重试失败的（`retries: 2`）
- HTML 报告
- Fixture 系统（共享 page / context / browser）
- 条件 skip / fixme / annotations

→ **测试运行器 + 浏览器驱动同源**——不需要 Jest + Playwright 分离。

组件测试（`playwright-ct-react` 等）：直接挂 React/Vue/Svelte 组件到 Playwright 控制的浏览器，
不需要走 jsdom / vitest。**真浏览器跑组件**——更高保真。

## 横向对比

### vs Selenium — 协议老 vs 协议新

Selenium 用 W3C WebDriver，Playwright 用自家协议。

WebDriver 标准化的代价：每个新 feature 要标准化讨论几年才能落地。
Playwright 自家协议：想到就做，灵活。

→ 标准 vs 创新的取舍。**新项目选 Playwright**，遗留 Selenium 慢慢迁移。

### vs Puppeteer — 同根异花

Puppeteer 团队被 MS 挖走做 Playwright。**Puppeteer 还在维护，但创新慢**。
Playwright 是更新代答案。

如果你只 Chrome、需要极简 API——Puppeteer 仍可用。
否则 Playwright 是默认。

### vs Cypress — DX vs 完备性

Cypress 的 DX 神话：可视化 runner、time-travel debug、丰富的领域语言。
但**架构限制让某些 use case 做不到**：
- 多 tab 测试
- 跨 origin 流（OAuth 跳转）
- 真实 mobile viewport

Playwright 没这些限制，但 DX 略不如 Cypress 那么"开箱即用"——
trace viewer 是异步查看，不是实时。

### vs WebDriverIO — 同生态位

WebDriverIO 也是新一代浏览器自动化，基于 W3C 标准。
**比 Selenium 现代，但和 Playwright 比仍偏传统**——
没有 auto-wait、没有 locator、没有 trace viewer。

## Hands-on（10 分钟内能跑）

```bash
mkdir pw-demo && cd pw-demo
npm init -y
npm install -D @playwright/test
npx playwright install
```

写 `tests/example.spec.ts`：

```typescript
import { test, expect } from '@playwright/test'

test('homepage has title', async ({ page }) => {
  await page.goto('https://playwright.dev/')

  // auto-wait 等到出现 + 可见
  await expect(page).toHaveTitle(/Playwright/)
})

test('docs link works', async ({ page }) => {
  await page.goto('https://playwright.dev/')

  // locator 自动 retry
  await page.getByRole('link', { name: 'Get started' }).click()

  await expect(page).toHaveURL(/.*intro/)
})
```

```bash
npx playwright test
npx playwright show-report      # HTML 报告
```

### 改一处的实验（必做）

故意让一个 test 失败：

```typescript
await expect(page).toHaveTitle(/Wrong/)
```

跑测试，加 `--trace on`：

```bash
npx playwright test --trace on
npx playwright show-trace test-results/.../trace.zip
```

打开 trace viewer——你会看到**完整的 timeline + 截图 + DOM 快照**。
这就是工业级失败诊断的体感。

第二个实验：codegen：

```bash
npx playwright codegen https://google.com
```

打开浏览器 + inspector。点击搜索框、输入、按 Enter——
**实时看到代码生成**。理解 Playwright 怎么把 user action 翻译成代码。

第三个实验：组件测试（如果你有 React 项目）：

```bash
npm install -D @playwright/experimental-ct-react
npx playwright-ct-react init
```

直接对你的 `<Button />` 组件跑测试，**真浏览器**——
体验组件测试和 jsdom（vitest）的差异。

## 与你工作的连接

**能立刻迁移**：

- 任何**新项目**的 E2E 测试用 Playwright 起步——Cypress 项目慢慢迁
- 用 codegen 给团队启蒙——录一遍生成代码，再改 selector
- 用 trace viewer 上线 CI——每次失败有 trace，再也不"看不到现场"

**下个月可能用到**：

- 给 LLM agent 做"看屏幕操作"——Playwright 是事实标准（结合 anthropic-cookbook 的 Computer Use）
- 给项目加 visual regression 测试（screenshot 比对）
- 跨浏览器兼容性 CI（Chromium + Firefox + WebKit 三套并行）

**不要用 Playwright 的部分**：

- **快速 unit 测试**——Vitest / Jest 更轻量
- **组件交互简单（点点 button 看回调）**——React Testing Library 在 jsdom 里更快
- **API 测试**——supertest / fetch 直接测，不需要浏览器

## 读完你能做之前做不了的事

- **判断**：选 E2E 工具时，能用"浏览器范围 / auto-wait / trace / 跨语言"四维评估
- **设计**：写自己的自动化工具时，思考"协议层 + 客户端 + auto-wait 三件套"
- **解释**：被问"为什么我的 Selenium 测试 flaky"时，能说出"没 auto-wait + selector stale" 两个根因
- **下钻**：看懂 CDP 协议——Playwright server 内部就是和 CDP 对话
- **对照**：识别"我这个工具的 flaky 是协议问题还是 timing 问题"——可以借鉴 auto-wait

## 自检 · 5 个问题

1. Playwright 跨进程（client + server）增加了复杂度。如果合到一个进程会失去什么？
2. auto-wait 默认行为可以解决 95% flaky。剩下的 5% 是什么场景？应该怎么处理？
3. Locator vs ElementHandle 的语义差异——什么场景**反而需要** ElementHandle？
4. trace viewer 是"事后录像"，Cypress time-travel 是"实时回放"。两种调试模式各自适合什么场景？
5. Microsoft 自己 patch WebKit。这种**重型工程投入**值不值？换一个判断框架。

## 延伸阅读

读完这篇笔记后下一步：

1. `packages/playwright-core/src/client/connection.ts:69-306`——协议连接完整实现
2. `packages/playwright-core/src/server/frames.ts`（1874 行）——auto-wait 算法核心
3. **Playwright 官方文档**（playwright.dev）——auto-wait 详细规则、locator 最佳实践
4. **CDP（Chrome DevTools Protocol）规范**——Playwright server 底层协议
5. **anthropic Computer Use** —— LLM + 浏览器自动化的下一代演化

---

**笔记完成**：2026-05-28（v1.61.0-next）
**研究方法**：本地克隆 + 阅读 connection.ts/channelOwner.ts/server frames.ts 结构 + 协议判断分析
**心脏文件**：`packages/playwright-core/src/client/connection.ts:69-306`（协议层）+
`server/frames.ts`（1874 行 auto-wait 实现）
