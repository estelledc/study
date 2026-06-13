---
title: Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
来源: 'https://github.com/steel-dev/steel-browser'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Steel Browser 是一个**把 Chromium 浏览器包装成 HTTP API 服务**的开源项目。日常类比：原本浏览器是你电脑里的一个"程序"，Steel 把它装进一台"远程小服务器"里，你按门铃（发 HTTP 请求），它替你打开网页、截图、抓内容、再把结果送出来。

为什么要这么做？因为 LLM agent（自动办事的 AI）越来越想"自己开浏览器查资料"，但传统浏览器工具（puppeteer / playwright）是给**人类程序员写脚本**设计的——你必须把代码和浏览器跑在同一个进程里。agent 不一样，它可能跑在云函数里、可能突然崩溃、可能短暂活动一秒就消失。

Steel 的回答：

```bash
# agent 端只需要这一行
curl -X POST http://steel:3000/v1/scrape -d '{"url":"https://example.com"}'
# 返回页面 markdown，agent 不用关心 Chromium 是谁开的、谁关的
```

Apache-2.0，约 1.5 万行 TypeScript（Fastify + puppeteer-core），单容器 docker 部署。

## 为什么重要

不理解 Steel 类项目，下面这些事都没法解释：

- 为什么 2024 年后**所有做 agent 的公司**都在重复造一个"浏览器即服务"的轮子（Browserbase / Hyperbrowser / Steel / browserless）
- 为什么 puppeteer 官方文档都不教你"怎么部署 puppeteer"——它从来不是 long-running 服务的设计
- 为什么 agent + 浏览器是 2024-2026 最热的工程方向，但**没有标准接口**
- 为什么你一旦把"浏览器自动化"做成 SaaS，就必须重新发明 session、proxy、反指纹、隔离

## 核心要点

Steel 的设计可以拆成 **三个层次**：

1. **服务化壳子**：原本 puppeteer 是一个 npm 库（你 `import` 进自己进程），Steel 把它换成 Fastify HTTP server——agent 调 `POST /v1/sessions` 拿一个 session id，整个调用链变成"网络服务"。

2. **双接口并存**：上层是 OpenAPI 风格的高层 REST（`/v1/scrape` / `/v1/screenshot` / `/v1/pdf`），下层暴露 raw CDP WebSocket（agent 想自己讲 Chrome DevTools 协议也行）。同一个 Chromium 实例两条接口都通——这是 Steel 区别于纯 SaaS 的核心特征。

3. **plugin 钩子扩展**：核心代码 1500 行 `cdp.service.ts` 不用改，通过实现 `BasePlugin` 子类挂 `onSessionStart` / `onBrowserLaunch` / `onSessionEnd` 等 6 个 lifecycle hook，就能注入 cookie、改 header、加监控——这是"框架"而不是"工具"的味道。

三层加起来的效果：**让 agent 像调外部 SaaS 一样用浏览器，但代码和数据都在自己手里**。

## 实践案例

### 案例 1：30 秒抓一个网页

```bash
# 一行 docker 起服务
docker run -p 3000:3000 ghcr.io/steel-dev/steel-browser:latest

# agent 端 curl 一发，拿 markdown 回来
curl -s -X POST http://localhost:3000/v1/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://news.ycombinator.com","format":["markdown"]}' \
  | jq -r '.content.markdown' | head -20
```

不用先创建 session、不用关心进程——Steel 检测到没浏览器就自动 launch。这是把它当**纯抓取服务**用的最低门槛。

### 案例 2：agent 用 puppeteer.connect 接进来

```javascript
// agent 端代码（Node.js）
const session = await fetch("http://steel:3000/v1/sessions", { method: "POST" })
  .then(r => r.json());

const browser = await puppeteer.connect({
  browserWSEndpoint: session.websocketUrl   // ← Steel 暴露的 raw CDP
});
const page = (await browser.pages())[0];
await page.goto("https://example.com");
console.log(await page.title());
browser.disconnect();
```

注意关键点：**agent 用的是标准 `puppeteer.connect()`**，它不知道中间有 Steel——对 puppeteer 来说 Steel 是透明的，等于一台远程 Chrome。

### 案例 3：用 plugin 给每个 session 注入自定义 cookie

```typescript
// 自己写个 plugin
class MyAuthPlugin extends BasePlugin {
  async onSessionStart(config) {
    await this.cdpService.setCookie({
      name: 'auth_token',
      value: process.env.AUTH_TOKEN,
      domain: '.mycompany.com',
    });
  }
}

// 注册（不改 cdp.service.ts 一行）
cdpService.pluginManager.register(new MyAuthPlugin());
```

每次 session 开始 Steel 自动调你的 hook——这就是"框架"的扩展点。

## 踩过的坑

1. **单实例只跑一个 Chromium**：`activeSession` 是单数变量，同一时刻只能服务一个 active 会话。要并发就部多个 Steel 实例 + LB——一个容器一个 Chromium。看到 README 写"高并发"会以为是单进程多 worker，其实不是。

2. **raw CDP WebSocket 默认无鉴权**：fallback 路径直接反代到 Chromium 的 9222 port，任何能访问 3000 端口的客户端都能完全控制浏览器（`Runtime.evaluate` 能偷 cookie）。生产部署**必须**前置 nginx + token / IP 白名单——README 没显著标注这点。

3. **endSession 末尾硬编码立即 relaunch**：上一个 session 结束后立即起一个 idle Chrome 等下一个请求。延迟敏感场景受益（下次 create 不用等 launch），但 serverless 场景（lambda / cloud run）会一直占 ~200MB 内存。要禁用得 fork 改代码。

4. **反 bot 检测是猫鼠游戏**：内置 fingerprint-injector + 90+ Chrome flags + ad block 当前能扛 Cloudflare / Datadome 一些版本，但**不是 silver bullet**。Cloudflare 升级 challenge 后可能失效，需要追着改。

## 适用 vs 不适用场景

**适用**：

- 公司内部 / 隐私敏感场景，需要**自托管**浏览器服务（替代 Browserbase 闭源 SaaS）
- 有"agent 需要看网页"的应用——上 Steel 把浏览器跟主流程解耦，agent 死了不影响浏览器
- 想 fork 改逻辑做内部基建（Apache-2.0 友好），已有 1500 行核心 + 7 个 hook 不用从零写
- 反 bot 检测要求中等强度的抓取场景（裸 puppeteer 抗检测能力差）

**不适用**：

- 只是写测试 / 抓固定数据的脚本 → 直接 Playwright，不要上 Steel
- 想一次跑几十个并发 session 的 SaaS → Steel 单实例单 Chromium，硬撑要部 N 个实例
- 不想运维 docker / 鉴权 / 监控 → 直接付钱用 Browserbase
- Python / Go 后端团队 → Steel 是 TS-only，fork 维护成本高

## 历史小故事（可跳过）

- **2017 年**：Google 发布 puppeteer，把 Chrome DevTools Protocol 包成 Node 库——但定位是"测试工具"，不是服务。
- **2020 年**：Microsoft 出 playwright，跨浏览器 + 更好的 selector，仍是进程内长驻库。
- **2023 年**：ChatGPT 加 browsing 功能，OpenAI 内部包了一个浏览器服务（黑盒，外人看不到）。
- **2024 年**：YC W24 同期同时孵化 Browserbase（闭源 SaaS）+ Steel（开源对照物），都是把"浏览器即服务"商业化。
- **2026 年**：主线 commit fc75fcae，star ~7.1k。Steel 维护者还是 Steel.dev 公司核心团队 + 社区贡献。

## 学到什么

1. **同一个能力在两种执行模型之间需要一层翻译**——puppeteer（进程内）→ Steel（HTTP 服务）就是这个翻译
2. **核心薄但 hook 多** 是"框架"健康的信号——Steel 7 个 extension point 让你不动 1500 行核心就能改行为
3. **双接口并存** 是聪明设计：高层 REST 给"我只想抓页面"的 agent，raw CDP 给"我要自己讲协议"的 agent
4. **不显眼的运维负担**（鉴权 / 多实例 / 持久化）是开源 SaaS 替代品的真正成本——README 不会告诉你

## 延伸阅读

- 官方仓库：[steel-dev/steel-browser](https://github.com/steel-dev/steel-browser)（核心文件 `api/src/services/cdp/cdp.service.ts`）
- Apify proxy-chain：[apify/proxy-chain](https://github.com/apify/proxy-chain)（Steel 内部用的 CONNECT 代理实现）
- fingerprint-injector：[apify/fingerprint-injector](https://github.com/apify/fingerprint-injector)（Steel 反指纹的依赖库）
- Chrome DevTools Protocol：[chromedevtools.github.io](https://chromedevtools.github.io/devtools-protocol/)（raw CDP 的协议规范）
- Browserbase 对照：[browserbase.com](https://www.browserbase.com/)（闭源 SaaS，看商业版能做到什么程度）

## 关联

- [[playwright]] —— 跨浏览器自动化基础库；Steel 的 websocketUrl 也支持 playwright.connectOverCDP
- [[browser-use]] —— agent 决策框架，跑在用户进程里直调 playwright；可以连到 Steel 的 websocketUrl 做工具层
- [[stagehand]] —— Browserbase 出品的 agent SDK，闭源 SaaS 一侧的对照物
- [[patchright]] —— playwright 的反检测 fork；和 Steel 内置 fingerprint 解决相似问题但路径不同
- [[midscene]] —— agent + VLM 视觉决策框架，工具层可以挂 Steel
- [[nanobrowser]] —— 另一个 agent 浏览器项目，更轻量，没 Steel 的服务化层
- [[fastify]] —— Steel HTTP server 的底层框架；plugin 系统借鉴了 fastify-plugin

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 用自然语言让 AI Agent 操控浏览器
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[patchright]] —— patchright — 给 Playwright 打 patch 让浏览器自动化在反 bot 站点继续工作
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架

