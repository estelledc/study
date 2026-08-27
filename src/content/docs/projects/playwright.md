---
title: Playwright — 每测一个隔离 context 的浏览器自动化
来源: 'https://github.com/microsoft/playwright'
日期: 2026-05-30
分类: 测试
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/microsoft/playwright
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 26a9e470a7b3c7822084b09fb7f13902c5f37b51
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.62.1
---

## 是什么

Playwright 是一套**用同一份 API 驱动 Chromium / Firefox / WebKit，并按测试隔离浏览器 context** 的自动化与测试工具。日常类比：每个测试领一台刚开机的虚拟浏览器，cookie 和存储默认不串。

你写：

```ts
import { test, expect } from "@playwright/test";

test("打开首页", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
});
```

`page` 不是全局单例。固定 1.62.1 的默认 fixture 为每个测试 `browser.newContext()`，再 `context.newPage()`；测完关掉 context。`beforeAll` / `afterAll` 里不能用这对 fixture。

## 为什么重要

不理解 Playwright 的隔离与等待合同，下面这些事都解释不通：

- 为什么默认并发跑测试时，共享变量会互相踩
- 为什么 `locator.click()` 不用手写 `sleep`，却仍可能 30 秒超时
- 为什么 `expect(locator).toBeVisible()` 的超时不是测试 timeout
- 为什么 `page.fill(selector, value)` 还能用，但推荐路径是 locator

## 核心要点

固定源码的主链可以拆成四步：

1. **测试运行器装配 fixture**：`@playwright/test` 默认超时 30s，`workers` 默认 `'50%'`，`fullyParallel` 默认 `false`，`retries` 默认 `0`。`page` / `context` 作用域是单次测试。

2. **locator 是惰性选择器**：`new Locator(frame, selector)` 只拼接选择器字符串，不立刻查 DOM。`getByRole` / `getByLabel` / `getByText` 都是往选择器上加内部谓词。

3. **动作先等 actionability**：click 默认等 `visible + enabled + stable`，再滚进视口并做 hit-target 检查；fill 默认等 `visible + enabled + editable`。`page.click` / `page.fill` 仍在，只是转到 `mainFrame` 的同名方法。

4. **断言另有 timeout**：`expect` 默认 5s，不是 30s 的测试 timeout。`toHaveURL` / `toBeVisible` 这类 matcher 会在自己的 timeout 内重试。

## 实践示例

### 案例 1：用 role locator 写登录

```ts
import { test, expect } from "@playwright/test";

test("登录成功跳到 dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("a@b.c");
  await page.getByLabel("Password").fill("123456");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL("/dashboard");
});
```

`fill` / `click` 会按上面的 actionability 重试，直到默认 30s。`toHaveURL` 走 expect 的 5s。`page.fill('input[name=email]', ...)` 在 1.62.1 仍然存在，但每次动作仍要重新解析 selector；locator 把“怎么找”固定成对象。

### 案例 2：route 拦截不依赖后端

```ts
test("用户列表 500 时显示错误", async ({ page }) => {
  await page.route("**/api/users", route => {
    route.fulfill({ status: 500, body: "Server error" });
  });
  await page.goto("/users");
  await expect(page.getByRole("alert")).toBeVisible();
});
```

`page.route` 挂在当前 page 所属 context 的网络栈上。每个测试默认新 context，这条拦截不会漏到下一个测试。

### 案例 3：webServer 等 URL 可用再开跑

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

`webServer` 可以是单个对象或数组。插件会起进程，并用 `isURLAvailable` 等 URL；不是只看端口被占用。`reuseExistingServer` 为真时可以复用已经在听的服务。

## 踩过的坑

1. **`page` / `context` 不能进 `beforeAll`**：fixture 工厂看到 `beforeAll` / `afterAll` 会抛错，要求改 `beforeEach` 或自己 `browser.newContext()`。

2. **默认并不是 fullyParallel**：文件之间按 `workers: '50%'` 并行；文件内部默认不把每个 test 都拆开并行。共享 `let userId` 仍会在 worker 之间或开启 fullyParallel 后打架。

3. **两种 timeout 不要混**：动作等 actionability 用测试 timeout（默认 30s）；`expect(locator).toBeVisible()` 用 expect timeout（默认 5s）。“断言也该有 30 秒”是错的。

4. **`page.$()` 仍在，但返回 ElementHandle**：1.62.1 没有删掉 `page.$`。它立刻拿到句柄，DOM 一替换就 stale。新代码用 locator，每次动作重新 `waitForSelector`。

5. **CI 要另装浏览器二进制**：npm 包装的是驱动，不含 Chromium / Firefox / WebKit 本体。容器里通常还要 `npx playwright install --with-deps`。

## 适用 vs 不适用场景

**适用**：

- Web 应用端到端流（登录、下单、多 tab / 跨 origin）
- 同一套测试跑 Chromium + Firefox + WebKit
- 需要 trace / 截图 / route mock 的 CI 失败现场
- Node `>=20`

**不适用**：

- 组件级单测、不想启真浏览器——用 [[vitest]] + Testing Library
- 纯 HTTP API 测试——不必付浏览器进程的成本
- 把“已经取代 Cypress / 成为模板默认”写成当前事实——本轮没有市场份额证据

## 固定版本边界

- 本文绑定 `microsoft/playwright@26a9e470...`，即 tag `v1.62.1`。
- npm `playwright@1.62.1`、`playwright-core@1.62.1`、`@playwright/test@1.62.1` 的 `gitHead` 都指向同一提交。
- 默认：测试 timeout 30s，expect timeout 5s，`workers: '50%'`，`fullyParallel: false`，`retries: 0`，`retryStrategy: 'immediate'`。
- 包声明 Node `>=20`。浏览器二进制不随 npm 包自动保证可用。
- 本文未安装浏览器、未运行上游测试、未测跨浏览器差异或截图稳定性，状态保持 `UNVERIFIED`。

## 学到什么

1. **隔离粒度是 BrowserContext，不是“一个 Chrome 进程”**——默认 fixture 每测新建 context
2. **locator 把查找推迟到动作瞬间**，所以 DOM 替换不会留下 stale handle
3. **自动等待是分动作的状态机**：click 等 stable，fill 等 editable，不是一句“等可点击”
4. **运行器 timeout 和断言 timeout 是两条预算**，混用会误判 flaky

## 应用型自测

1. 默认 `page` fixture 能在 `test.beforeAll` 里用吗？
2. `locator.click()` 在非 `force` 时默认等哪些 element state？
3. `expect(locator).toBeVisible()` 默认超时是 30s 还是 5s？

检查点：

1. 不能。`page` / `context` 按测试创建；`beforeAll` / `afterAll` 会抛错。
2. `visible`、`enabled`、`stable`，然后再做 hit-target 检查。
3. 5s。`defaultExpectTimeout` 是 5000；30s 是测试 timeout。

## 延伸阅读

- 官方文档：[playwright.dev](https://playwright.dev/)
- 固定源码：[microsoft/playwright](https://github.com/microsoft/playwright) —— 本文绑定提交 `26a9e470a7b3c7822084b09fb7f13902c5f37b51`
- [[vitest]] —— 单元/组件测试；browser mode 可选用 Playwright 当 provider
- [[jest]] —— 不上真浏览器的对照

## 关联

- [[vitest]] —— 单测与组件测；e2e 仍走 Playwright Test
- [[jest]] —— 不上浏览器的 JS 测试全家桶
- [[testing-library]] —— 组件层“按用户角色查找”；Playwright 的 getByRole 是同一思路的 e2e 版
- [[msw]] —— 网络拦截的另一层；Playwright 用 `page.route` 做浏览器内拦截
- [[midscene]] / [[stagehand]] —— 在 Playwright 之上加自然语言或 LLM 的封装

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[beck-tdd]] —— Beck TDD — 用红绿重构循环让设计自己长出来
- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[papers/shellcheck]] —— ShellCheck — 帮你抓 Bash 脚本里那些"半夜才发作"的坑
- [[aiortc]] —— aiortc — 让 Python 服务端像浏览器一样讲 WebRTC
- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[browser-use]] —— browser-use — 让 LLM 用「DOM 索引清单」操作浏览器的 Python agent 框架
- [[cal-com]] —— cal.com — 自己能托管的开源 Calendly
- [[projects/cytoscape-js]] —— Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[errbot]] —— Errbot — 用 Python 类写一个能进 Slack/Discord 的聊天机器人
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[gh]] —— gh — GitHub 官方命令行
- [[glab]] —— glab — GitLab 官方命令行
- [[imagemagick]] —— ImageMagick — 图像处理瑞士军刀
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[jspdf]] —— jsPDF — 浏览器里直接生成 PDF
- [[k6]] —— k6 — 用 JS 写脚本的现代负载测试器
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[lighthouse]] —— Lighthouse — Google 出品的网页质量审计工具
- [[locust]] —— Locust — 用 Python 写压测脚本的分布式负载工具
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[nivo]] —— nivo — React + d3 组件化图表
- [[ofetch]] —— ofetch — Nuxt 默认的现代 fetch 包装
- [[patchright]] —— patchright — 给 Playwright 打 patch 让浏览器自动化在反 bot 站点继续工作
- [[pdfmake]] —— pdfmake — 用对象树声明 PDF，浏览器和 Node 都能跑
- [[peerjs-server]] —— peerjs-server — 只管握手不管传话的 WebRTC 信令服务器
- [[promptfoo]] —— promptfoo — 给 prompt 写单元测试的 CLI
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
- [[sigma-js]] —— Sigma.js — 上万节点仍流畅的 WebGL 图渲染器
- [[simple-peer]] —— simple-peer — 三行代码把两个浏览器直接连起来
- [[sortablejs]] —— SortableJS — 一行代码让任何列表能用手拖排序
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台
- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
- [[vitest]] —— Vitest — Vite 原生测试框架
