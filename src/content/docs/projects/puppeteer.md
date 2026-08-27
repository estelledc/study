---
title: Puppeteer — 用 CDP 直接驱动 Chrome / Firefox 的浏览器客户端
description: Chrome DevTools Protocol 客户端，负责启动浏览器并发协议动作，本身不是测试运行器
来源: 'https://github.com/puppeteer/puppeteer'
日期: 2026-08-27
分类: 测试 / 浏览器自动化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/puppeteer/puppeteer
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 21efe834b7094d53a1c0d633dc69deced17702d8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 25.9.0
---

## 是什么

Puppeteer 是一个 **Chrome DevTools Protocol (CDP) 客户端**，不是测试运行器。日常类比：它像一台只负责握方向盘的遥控车——你自己决定什么时候出发、怎么验收，它只把“开浏览器、打开页、点一下、截一张图”翻译成协议消息。

你写：

```js
import puppeteer from "puppeteer";

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto("https://example.com");
await page.click("a");
await browser.close();
```

`puppeteer` 包会下载并启动绑定版本的 Chrome for Testing；`puppeteer-core` 只提供同一套 API，必须自己给 `executablePath` 或 `channel`。固定 25.9.0 要求 Node `>=22.12.0`。

## 为什么重要

不理解 Puppeteer，下面这些事都没法解释：

- 为什么同一段脚本既能自动化、也能做截图 / PDF / 性能 tracing，却没有 `test()` / `expect()`
- 为什么 `page.click(selector)` 在元素尚未插入 DOM 时立刻失败，而 [[cypress]] 会重试到超时
- 为什么 `puppeteer` 和 `puppeteer-core` 不能互换安装方式
- 为什么“无头”默认已经是 Chrome 的 `--headless=new`，再写 `--headless` 会走到另一条二进制

## 核心要点

主链可以拆成五步：

1. **选产品并启动进程**：`PuppeteerNode.launch()` 默认 `browser: 'chrome'`，只接受 `chrome` / `firefox`。Chrome 默认 `headless = !devtools`；`true` 传 `--headless=new`，`'shell'` 才传旧 `--headless`。

2. **建立 CDP 会话**：启动器解析可执行文件、默认参数和 `--enable-automation`，再通过 WebSocket 或 pipe 连上浏览器。

3. **拿到 Browser / Page / Frame**：`browser.newPage()` 是一张新 tab。多个 page 是一等公民，不需要跨源桥。

4. **对 Frame 发动作**：`page.goto` 把等待交给 `LifecycleWatcher`，CDP 默认 `waitUntil: ['load']`。`Frame.click(selector)` 只做一次 `$()`，找不到立刻抛错。

5. **TimeoutSettings 兜底**：默认 timeout 与 navigation timeout 都是 30000ms。`WaitTask` 可用 `raf` / `mutation` / 数字间隔轮询，但普通 `click(selector)` 不会自动进入这段等待。

## 实践示例

### 案例 1：启动绑定 Chrome 并导航

```js
import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  headless: true,          // 默认就是 true；显式写出以免和 shell 模式混淆
});
const page = await browser.newPage();
const response = await page.goto("https://example.com", {
  waitUntil: "load",       // CDP Frame.goto 的默认值
});
console.log(response?.status());
await browser.close();
```

`puppeteer` 会按 `revisions.ts` 取 Chrome `152.0.7977.54`。换系统已装的稳定版 Chrome 要用 `channel: 'chrome'`，不再享受“和协议绑定”的保证。

### 案例 2：先等到元素，再点

```js
const button = await page.waitForSelector("button.submit", {
  visible: true,
  timeout: 30000,
});
await button.click();
```

`waitForSelector({ visible: true })` 才是“出现且可见”的等待；随后 `ElementHandle.click()` 只做 `scrollIntoViewIfNeeded` + 中心点 `mouse.click`。它**不会**像 [[playwright]] 那样循环检查 enabled / stable。

### 案例 3：只要协议客户端、不要下载器

```js
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  // 或 channel: "chrome"
});
```

漏掉这两项之一，`puppeteer-core` 无法解析浏览器。这是包边界，不是配置风格差异。

## 踩过的坑

1. **把 `page.click(selector)` 当成自动等待**：固定实现找不到节点就抛 `No element found for selector`，不会重试到 30 秒。

2. **把 headless 布尔值与 `'shell'` 当成同一种无头**：`true` 走新 headless + 完整 Chrome；`'shell'` 走 `chrome-headless-shell` 和旧 `--headless` 开关。

3. **`waitUntil: 'networkidle0'` 当默认**：默认是 `load`。SPA 若在 `load` 之后才画按钮，必须显式换生命周期或再 `waitForSelector`。

4. **把 TypeScript 泛型和运行成功写成证据**：本文未启动浏览器，也未跑上游测试。

5. **拿 Puppeteer 当测试框架**：没有 runner、重试、隔离 fixture 或 HTML 报告；那些是 [[cypress]] / [[playwright]] 的合同。

## 适用 vs 不适用场景

**适用**：

- 需要多 tab、多 origin、CDP 级 tracing / coverage / PDF 的脚本
- 已有 Mocha / [[jest]] / [[vitest]]，只缺一个浏览器驱动
- 爬虫、截图服务、或把浏览器当渲染引擎

**不适用**：

- 想要开箱的 `cy.get` 重试、时间旅行调试或 GUI runner → [[cypress]]
- 要跨 Chromium / Firefox / WebKit 且带测试 fixture → [[playwright]]
- 不能接受 Node `>=22.12.0` 或不能下载绑定 Chrome

## 固定版本边界

- 本文绑定 `puppeteer/puppeteer@21efe834...`，npm `puppeteer` / `puppeteer-core` 均为 `25.9.0`，tag `puppeteer-v25.9.0` 与 npm `gitHead` 一致。
- 绑定浏览器：Chrome / chrome-headless-shell `152.0.7977.54`，Firefox `stable_154.0`。
- 默认 timeout 30000ms；`goto` 默认等 `load`；默认浏览器 `chrome`；默认 headless 为新模式。
- 本文未安装依赖、启动浏览器、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **协议客户端 ≠ 测试运行器**——Puppeteer 把浏览器变成可编程对象，断言和重试要另选。
2. **选择器点击默认是一次查询**——等待必须显式写成 `waitForSelector` / Locator。
3. **headless 有两条实现**——新 headless 与 shell 对应不同开关和二进制。
4. **下载器是独立产品边界**——`puppeteer` 管版本对齐，`puppeteer-core` 把对齐责任交还给你。

## 应用型自测

1. 页面还在请求中、按钮尚未插入 DOM。`await page.click('button')` 会等到 30 秒吗？
2. `puppeteer.launch()` 不传选项时，Chrome 进程带的是 `--headless=new` 还是旧 `--headless`？
3. 只安装 `puppeteer-core` 且不设 `executablePath` / `channel`，`launch()` 能否解析浏览器？

检查点：

1. 不会。`Frame.click` 一次 `$()` 失败即抛错。
2. `--headless=new`。`'shell'` 才走旧开关。
3. 不能。core 的启动合同要求其中之一。

## 延伸阅读

- 固定源码：[puppeteer/puppeteer](https://github.com/puppeteer/puppeteer) —— 本文绑定提交 `21efe834b7094d53a1c0d633dc69deced17702d8`
- 文档：[pptr.dev](https://pptr.dev/)
- [[cypress]] —— 同主题的测试运行器，命令队列与 actionability 重试
- [[playwright]] —— 带 runner 的多浏览器协议栈
- [[patchright]] —— 在 Playwright/CDP 层打反检测补丁的另一条路线

## 关联

- [[cypress]] —— 浏览器内 runner；和 Puppeteer 解决的层不同
- [[playwright]] —— 同属协议驱动，但默认带测试 fixture 与 auto-wait
- [[patchright]] —— 说明 `--enable-automation` 这类启动参数为何会被检测
- [[midscene]] —— 可把自然语言动作落到 Puppeteer / Playwright 后端
- [[vitest]] —— 常见的“自带 runner + Puppeteer 驱动”组合

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cypress]] —— Cypress — 把测试跑进被测页的命令队列运行器
- [[pdfkit]] —— PDFKit — 用画笔在 PDF 上一笔一笔画
