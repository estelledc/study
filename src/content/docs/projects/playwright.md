---
title: Playwright — 跨浏览器自动化测试
来源: https://github.com/microsoft/playwright
日期: 2026-05-29
分类: 测试
难度: 中级
---

## 是什么

Playwright 是 Microsoft 出品的工具，**用一段代码控制 Chromium / Firefox / WebKit 三个真浏览器跑端到端测试**。日常类比：

> 以前你测一个网站，要人手点 100 次按钮看每个流程对不对——登录、加购、结账、退出。
> Playwright 让你写一个**机器人脚本**，按你想要的顺序去点、去填、去截图，跑完告诉你哪步坏了。

写出来长这样：

```typescript
await page.goto('/login')
await page.fill('input[name=email]', 'a@b.c')
await page.click('text=Submit')
await expect(page).toHaveURL('/dashboard')
```

四行代码 = 一个完整登录测试。Playwright 自己驱动一个真 Chrome 跑一遍，对了就过。

## 为什么重要

如果你做 React / Next / Vue 项目，下面这些事不理解 Playwright 都解决不了：

- **跨浏览器一套 API**：Safari 用户报"点不动按钮"，你能用同一份脚本在 WebKit 上复现——不用为 Safari 单独写一套
- **自动等待 (auto-wait)**：以前 Selenium 时代代码里到处是 `sleep(2000)`——元素还没渲染完就点会失败。Playwright 帮你自动等到元素**可见 + 可点击**才下手
- **Trace Viewer**：测试失败时，给你一份"时间倒带录像"——每一步的截图、网络请求、DOM 状态全在里面。比单看一句报错强 10 倍
- **取代 Cypress 成为新项目默认**：2024 年起 React / Next 模板默认推 Playwright；Cypress 因为架构限制（不能多 tab、不能跨 origin）份额下滑

## 核心要点

Playwright 三个心脏概念：

1. **browser context**：每个测试一个**独立浏览器环境**——cookie / localStorage / 缓存全隔离。类比：每个测试拿一台"刚开机的虚拟浏览器"，不会被前面的测试污染。

2. **locator**：找元素的现代方式——基于"功能"而不是"位置"。
   ```typescript
   page.getByRole('button', { name: 'Submit' })   // 推荐
   page.locator('xpath=//div[3]/button[1]')        // 不推荐，DOM 一改就坏
   ```
   `getByRole` 用的是无障碍树（accessibility tree）的语义信息，DOM 重构也不容易失效。

3. **auto-waiting**：调用 `page.click(selector)`，Playwright 自动**等元素可见 + 可点击 + 稳定**才点。再也不用手写 `waitForSelector + sleep` 黑魔法。

## 实践案例

### 案例 1：最简单的登录测试

```typescript
import { test, expect } from '@playwright/test'

test('登录成功跳到 dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name=email]', 'a@b.c')
  await page.fill('input[name=password]', '123456')
  await page.click('text=Submit')
  await expect(page).toHaveURL('/dashboard')
})
```

**逐行解释**：

- `page` 是 Playwright 注入给你的"浏览器 tab"对象——每个测试一个新的
- `page.fill(selector, value)` 自动等输入框可见后才填——不用手动 sleep
- `expect(page).toHaveURL(...)` 自动等到 URL 变化——这条断言本身就有 retry，不会一闪而过

### 案例 2：mock API 不依赖后端

测试时后端可能没起，或者你想测"网络出错"分支：

```typescript
test('用户列表加载失败时显示错误提示', async ({ page }) => {
  await page.route('**/api/users', route => {
    route.fulfill({ status: 500, body: 'Server error' })
  })
  await page.goto('/users')
  await expect(page.locator('.error-banner')).toBeVisible()
})
```

`page.route` 拦截匹配 URL 的请求，让你自己决定返回什么。这一招让前端测试**不用启后端**。

### 案例 3：失败时回看现场

```bash
npx playwright test --trace on
```

跑测试时加 `--trace on`，失败后：

```bash
npx playwright show-trace test-results/.../trace.zip
```

打开一个本地网页——左边是时间轴、中间是每步截图、右边是 DOM + 网络。你能**像看视频一样回放整个测试**，找到具体哪个 selector 没匹配上、哪个请求 500 了。

## 踩过的坑

1. **CI 上要先装浏览器二进制**：`npm install` 不会自动下载 Chromium / Firefox / WebKit。CI 脚本要加一行：
   ```bash
   npx playwright install
   ```
   容器里如果系统库不全，加 `--with-deps` 让 Playwright 顺便装系统依赖。

2. **`page.$()` 已废弃，用 `page.locator()`**：早期 API `page.$('button')` 立刻执行查找，结果是个 ElementHandle，DOM 一变就 stale。现在用 `page.locator('button')`——返回一个**惰性的 locator**，每次操作前重新查找，自动 retry。

3. **`test.beforeEach` 里改全局状态会污染下个测试**：
   ```typescript
   // 反例
   let userId   // 测试间共享变量，并发跑会错乱
   test.beforeEach(async ({ page }) => {
     userId = await createUser()
   })
   ```
   Playwright 默认并发跑测试。要么用 `test.describe.configure({ mode: 'serial' })` 串行，要么把状态封装成 fixture。

4. **本地 dev server 没起就跑测试 → 全部 timeout**：在 `playwright.config.ts` 用 `webServer` 配置自动启动：
   ```typescript
   export default defineConfig({
     webServer: {
       command: 'npm run dev',
       url: 'http://localhost:3000',
       reuseExistingServer: !process.env.CI,
     },
   })
   ```
   Playwright 会等 `url` 返回 200 才开始跑测试。

## 适用 vs 不适用场景

**适用**：

- 任何 web app 的端到端测试（登录流、下单流、跳转流）
- 跨浏览器兼容性验证（同一份脚本跑 Chromium + Firefox + WebKit）
- 视觉回归测试（截图比对，`toHaveScreenshot`）
- 给 LLM 做"看屏幕操作"——Playwright 是事实标准（搭配 Anthropic Computer Use）

**不适用**：

- **组件级单测** → 用 Vitest / Jest + Testing Library 更快（在 jsdom 里跑，不用真浏览器）
- **纯 API 测试** → 用 supertest / fetch 直接打接口，不需要浏览器
- **性能基准测试** → 用 Lighthouse / WebPageTest 更专业

## 历史小故事（可跳过）

- **2017**：Google 出 Puppeteer，用 Chrome DevTools Protocol（CDP）控制 Chrome——比 Selenium 快很多，但只能 Chrome
- **2020**：Microsoft 把 Puppeteer 团队**整队挖走**，做出 Playwright——多浏览器 + auto-wait + 多语言 SDK
- **2022 年起**：Playwright 在 React / Next / Vue 模板里逐步替代 Cypress
- **2024**：Playwright 1.40+ 已成 GitHub Actions 默认推荐，VS Code 出官方扩展

Puppeteer 还在维护，但创新慢；Playwright 是同一帮人做的"下一代答案"。

## 学到什么

1. **自动等待是 framework 主权**：把"等元素可见"放进框架默认行为，比让用户写 sleep 强百倍——这是 Playwright 取代 Selenium 的核心判断
2. **locator 比 selector 字符串好**：基于"功能"找元素（getByRole / getByLabel / getByText）比 XPath 抗 DOM 重构能力强 10 倍
3. **trace viewer 是 CI 神器**：本地 dev 看不到 CI 失败现场——有 trace 就有完整录像，再也不用"我本地没复现"
4. **跨浏览器代价是 Microsoft 自己扛**：自维护 WebKit / Firefox patch 是巨大投入，但是 Playwright 差异化壁垒

## 延伸阅读

- 官方文档：[Playwright Docs](https://playwright.dev/)（教学质量极高，从零到 CI 接入有完整 path）
- VS Code 扩展：[Playwright Test](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright)（点一下就能 codegen / debug / 看 trace）
- Codegen 录制：`npx playwright codegen https://example.com`——浏览器里手动操作，自动生成代码
- 视频教程：[Playwright YouTube 频道](https://www.youtube.com/@Playwrightdev)（官方出品，跟 release 节奏）
- [[hindley-milner]] —— TypeScript 类型推导背后的算法，写 Playwright 测试时享受到的"自动推参数类型"就是它的简化版

## 关联

- [[hindley-milner]] —— TypeScript 推导让你写 Playwright fixture 时不用标类型
- [[lambda-calculus]] —— async / await 的本质是 CPS 变换，Playwright 大量用 async
- [[git-internals]] —— Playwright 在 CI 用 git diff 决定要重跑哪些测试

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

