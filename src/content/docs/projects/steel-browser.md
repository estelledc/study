---
title: Steel Browser — 把 Chromium 包成 AI agent 用的 REST API
description: TypeScript + Fastify + puppeteer-core，让 LLM agent 像调外部 SaaS 一样用浏览器
sidebar:
  order: 46
  label: steel-dev/steel-browser
---

> steel-dev/steel-browser，commit `fc75fcae871dc256553564abafbdbd54da1147d8`（2026-05-22 读，feat: log browser interactions #281），Apache-2.0。
>
> Steel 解决的是这两年最尴尬的工程错位：**LLM agent 越来越擅长「想用浏览器」，但浏览器自动化栈（puppeteer / playwright）是给「人类 dev 写脚本」设计的**。
>
> agent 不是脚本——它是一个**远程的、会犯错的、需要被观察的、可能跑在 lambda 里的进程**。
> 它要的不是 `await page.click('#btn')`，而是 `POST /v1/sessions` 拿一个 session id，
> 然后在 30 秒内调 `/v1/scrape` 把页面文本拿走、调 `/v1/screenshot` 拿截图，
> 用完发 `DELETE` 不管别的。
>
> Steel 把整套 Chromium 子进程 + CDP 协议 + HTTP 代理 + 反指纹打包成 **REST + WebSocket 双接口**。
> 上层是 OpenAPI / fetch 友好的高层 API（screenshot / scrape / pdf），
> 下层是 raw CDP WebSocket（agent 想自己讲协议也行）。
>
> Season 11 第一篇 · v1.1 项目类型分支 D（框架/SDK）。
> 服务端 framework，提供"把 Chromium 包成 long-running 服务"的核心 abstraction + middleware-style 的 plugin 扩展点。

## 一句话定位

**Steel = puppeteer 的"服务化壳子"**。
把 puppeteer-core 派生的 Chromium 子进程包装成一个 Fastify HTTP server：
agent 调 `POST /v1/sessions` 创建会话，
拿到 `websocketUrl` 后既能用 `/v1/scrape` 这种**高层 REST**，
也能直接讲 **raw CDP**——同一个 Chromium 实例两条接口都通。

## 核心信息表

| 字段 | 值 |
|---|---|
| 仓库 | [steel-dev/steel-browser](https://github.com/steel-dev/steel-browser) |
| star / fork | ~7.1k / ~933（2026-05 读） |
| 最近活跃 | 2026-05-22 主线（commit `fc75fcae`），v0.5.3-beta（2026-04-24） |
| 读时 commit | `fc75fcae871dc256553564abafbdbd54da1147d8` |
| 主语言 | TypeScript（86.2%）+ EJS（9.4%，session viewer 模板） |
| 维护方 | Steel.dev 公司（YC W24 同期）+ 社区贡献者 |
| 主要贡献者 | Junior Bobys / Hussam Khatib / Steel core team |
| License | Apache-2.0（比 browser-use / browserbase SDK 的 MIT 更适合公司内部 fork） |
| 类似项目 | Browserbase（闭源 SaaS） / browser-use（agent 框架，下层用 playwright） / ScrapingBee（HTTP-only 抓取 SaaS） / hyperbrowser / browserless |
| 部署形态 | `docker run -p 3000:3000 ghcr.io/steel-dev/steel-browser:latest` 单容器全栈 |

## 项目类型自标 · v1.1 分支 D 框架/SDK

- **类型**：框架/SDK——服务端 abstraction，提供"REST API 化 Chromium"的核心模型 + 显式 extension points。
- **心脏物**：
  - `CDPService`（cdp.service.ts，1523 行）—— Chromium subprocess lifecycle + WS 反代
  - `SessionService`（session.service.ts，327 行）—— session lifecycle 编排
  - `PluginManager`（cdp/plugins/core/plugin-manager.ts）—— 插件 lifecycle hook 调度
- **extension point**：
  - REST handler（`api/src/modules/<actions|sessions|cdp>/`）
  - `BasePlugin` 子类挂 `onSessionStart` / `onBrowserLaunch` / `onSessionEnd` 等 hook
  - `cdpService.registerLaunchHook(fn)` / `registerShutdownHook(fn)` 挂 launch 前后的 mutator
  - `sessionService.setProxyFactory(...)` 替换默认 `proxy-chain` 实现
  - `cdpService.setProxyWebSocketHandler(...)` 自定义 WS 反代逻辑（默认走 http-proxy）
- **混合特征**：包含一些"测试工具"特征（fingerprint 注入 / ad block 像 playwright fixture），但核心是 server framework 而不是 test runner。

## Why（为什么是它而不是 puppeteer 直接 / Browserbase / browser-use）

agent 时代浏览器栈的演化：

```
2017: puppeteer            人类 dev 写脚本，进程内 long-running
2020: playwright           更好的 selector + 多浏览器，仍然是脚本
2022: ChatGPT browsing     OpenAI 自己包的内部服务，黑盒
2023: Browserbase          闭源 SaaS，按分钟计费
2024: browser-use          agent + playwright，但跑在用户进程里
2024: Steel Browser        ★ 开源 + 自托管 + REST + raw CDP 双接口
```

**核心错位**：

```typescript
// 人类 dev：进程内 long-running，错误自己抓
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('https://example.com');
const html = await page.content();   // ← 同一个进程内 await 拿结果

// agent：另一个进程，可能在 lambda / vercel function / 云函数
//        要么短连接拉数据，要么 raw CDP 自己讲协议
fetch('http://steel:3000/v1/scrape', {
  method: 'POST',
  body: JSON.stringify({ url: 'https://example.com', format: ['html', 'markdown'] }),
});
```

**两套不兼容的运行模型**——agent 要的是"开服务、调接口、不管 process"。
puppeteer 没回答这个问题（puppeteer 的官方部署模式是"你自己写一个 server 包它"）。

**Steel 的回答**：

- agent 端：拿到一个 URL，调 REST 或 raw CDP，session 用完自己消失。
- 服务端：自己管 Chromium subprocess、自己 keepAlive、自己 instrumentation、自己反代 CDP。
- 中间：Apache-2.0 自托管，公司可以 fork 改成内部基建。

**为什么不是 puppeteer 直接**：你需要自己写 process manager / WS proxy / fingerprint / 反 bot / instrumentation——
Steel 已经把这些工程肉做完了。

**为什么不是 Browserbase**：Browserbase 闭源 + 按分钟计费 + 数据出境。
公司内部 / 隐私敏感场景 Steel 是唯一开源对照物。

**为什么不是 browser-use**：browser-use 是 **agent 决策层**（"我看到截图，下一步点哪"），
跑在 agent 进程里直接调 playwright。Steel 是 **agent 用的工具层**——
你完全可以 browser-use 决策、底层连到 Steel 的 `websocketUrl` 用 `playwright.connect()`。
两个项目其实互补不冲突。

**为什么不是 ScrapingBee**：ScrapingBee 是 HTTP-only 抓取 SaaS——只能拉静态 HTML + 跑简单 JS。
Steel 给你完整 Chromium，agent 能点击、滚动、上传文件、跨页面跳转。

**Steel 的代价**：

- 你要自己跑容器（即使最简单也是 `docker run`）；不像 Browserbase 调一个 URL 就完事
- 单实例只跑一个 Chromium（`activeSession` 是单数）—— 想要 N 个并行 session 要部 N 个 Steel 实例 + 前面挂 LB
- TypeScript-only，要 fork 改逻辑得懂 Fastify + puppeteer-core
- 反 bot 是猫鼠游戏——它当前能扛 Cloudflare / Datadome 一些版本，但**不是 silver bullet**

## 仓库地形 · Layer 2（框架/SDK 分支：标 abstraction + extension point）

```
steel-browser/
├── api/                          ← ★ Fastify HTTP server（笔记主体）
│   └── src/
│       ├── index.ts              ← 启动入口
│       ├── routes.ts             ← 顶层路由聚合
│       ├── env.ts / config.ts    ← 配置
│       ├── steel-browser-plugin.ts  ← 把所有 service 挂到 fastify instance
│       ├── modules/              ← REST endpoint 按业务分组
│       │   ├── sessions/         ← /v1/sessions（lifecycle + 流）
│       │   ├── actions/          ← /v1/scrape /v1/screenshot /v1/pdf /v1/search
│       │   ├── cdp/              ← /v1/devtools/inspector.html 重定向
│       │   ├── files/            ← 上传/下载文件
│       │   ├── selenium/         ← Selenium 兼容模式（少见）
│       │   └── logs/             ← session 事件流
│       ├── services/             ← ★★ 业务逻辑层
│       │   ├── cdp/
│       │   │   ├── cdp.service.ts  ← ★★★ 心脏文件 1，1523 行
│       │   │   ├── plugins/      ← BasePlugin + PluginManager（extension point）
│       │   │   ├── instrumentation/  ← target manager + browser-logger
│       │   │   ├── errors/       ← BaseLaunchError + 子类（错误分类）
│       │   │   └── utils/        ← validation / error-handlers
│       │   ├── session.service.ts  ← ★★★ 心脏文件 2，327 行
│       │   ├── selenium.service.ts  ← Selenium 模式（备选）
│       │   ├── file.service.ts   ← 文件上传/下载存储
│       │   ├── timezone-fetcher.service.ts  ← 根据 IP 反查时区
│       │   ├── websocket-registry.service.ts  ← WS handler 注册表
│       │   ├── leveldb/          ← 持久化（session viewer 用）
│       │   └── context/          ← 浏览器 storage / cookie 抽取
│       ├── plugins/              ← Fastify plugin（fastify-plugin 包的）
│       │   ├── browser.ts        ← 把 cdpService 挂到 fastify
│       │   ├── browser-session.ts  ← 把 sessionService 挂到 fastify
│       │   ├── browser-socket/   ← ★ WebSocket upgrade handler
│       │   ├── file-storage.ts   ← multipart 上传
│       │   ├── request-logger.ts ← 请求日志
│       │   └── schemas.ts        ← Zod schema 注册
│       ├── utils/
│       │   ├── proxy.ts          ← ★ ProxyServer（proxy-chain 包装）
│       │   ├── passthough-proxy.ts  ← internal bypass（注意拼写）
│       │   ├── browser.ts        ← Chrome 路径解析 / mouse helper
│       │   ├── retry.ts          ← RetryManager（指数退避）
│       │   ├── scrape/           ← HTML 清洗、Markdown 转换、PDF→HTML
│       │   ├── requests.ts       ← ad / heavy media / blocked host 判定
│       │   └── extensions.ts     ← Chrome 扩展路径解析
│       ├── scripts/              ← 注入到页面的 script（fingerprint 等）
│       ├── templates/            ← EJS 模板（live-session-streamer.ejs 等）
│       ├── telemetry/            ← OpenTelemetry tracer
│       └── types/                ← TS 类型 / enum
├── ui/                           ← Vite + React session viewer（独立子项目）
├── repl/                         ← TypeScript REPL（开发调试用）
├── docs/                         ← 文档
├── images/                       ← README 用的图
├── docker-compose.yml            ← 一键 ui + api + nginx
├── docker-compose.dev.yml        ← 开发模式
├── Dockerfile                    ← 单容器全栈
├── nginx.conf                    ← 反代 ui 到 api
└── package.json                  ← workspace 配置
```

**心脏文件**（commit `fc75fcae` 锚定）：

1. [`api/src/services/cdp/cdp.service.ts`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts)（1523 行）—— Chromium subprocess lifecycle，整个项目最厚的文件
2. [`api/src/services/session.service.ts`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/session.service.ts)（327 行）—— session 编排层，用户面 API 翻译
3. [`api/src/plugins/browser-socket/browser-socket.ts`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/plugins/browser-socket/browser-socket.ts)（73 行）—— WebSocket upgrade 入口，最薄但最关键
4. [`api/src/utils/proxy.ts`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/utils/proxy.ts)（69 行）—— per-session HTTP 代理
5. [`api/src/modules/actions/actions.controller.ts`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/modules/actions/actions.controller.ts)（571 行）—— scrape / screenshot / pdf / search 高层 API

**extension point 清单**（v1.1 框架/SDK 分支必填）：

| extension point | 接口 | 在哪里挂 |
|---|---|---|
| **plugin** | `BasePlugin` 子类，实现 `onSessionStart` / `onBrowserLaunch` / `onSessionEnd` 等 hook | `cdpService.pluginManager.register(new MyPlugin(...))` |
| **launch hook** | `(config: BrowserLauncherOptions) => Promise<void>` | `cdpService.registerLaunchHook(fn)` → 在 `launchInternal` mutator 阶段调 |
| **shutdown hook** | `(config: BrowserLauncherOptions \| null) => Promise<void>` | `cdpService.registerShutdownHook(fn)` |
| **WS handler** | `WebSocketHandler`（match URL → 自定义 upgrade 处理） | `webSocketRegistry.registerHandler(handler)` |
| **proxy factory** | `(proxyUrl, options?) => IProxyServer` | `sessionService.setProxyFactory(fn)` |
| **WS proxy override** | `(req, sock, head) => Promise<void>` | `cdpService.setProxyWebSocketHandler(fn)` |
| **REST route** | Fastify plugin 风格 | `server.register(myPlugin, { prefix: '/v1/my' })` |

→ "**核心薄但 hook 多**"是框架/SDK 的健康信号——上面 7 个 hook 让你不动 1523 行的 cdp.service.ts 就能改行为。

## 架构图

![Steel Browser 架构：agent → REST API → SessionService → CDPService → Chromium subprocess + ProxyServer + raw CDP WebSocket 隧道，commit fc75fcae 锚定的代码引用与 6 条 trade-off 标注](/projects/steel-browser/01-architecture.webp)

> 上半部：agent 端到 Chromium 子进程的完整调用链——
> agent 用 `fetch()` 发 HTTP 进 Fastify，Fastify 控制器调 `SessionService.startSession`，
> 后者调 `CDPService.startNewSession`，最终用 puppeteer.launch 派生 Chromium 子进程。
> 同时 `ProxyServer`（proxy-chain）独立起一个 OS 分配端口的 HTTP 代理，作为 `--proxy-server` 参数传给 Chromium。
> 下半部：WebSocket 隧道 + 插件 lifecycle + 返回给 agent 的 SessionDetails 结构。
> 蓝=HTTP/WS 通路，绿=代理 / 客户端，橙=Steel 内部 service 与 lifecycle，红=外部进程 / 系统资源。
> 6 条关键 trade-off 标在底部，每条都带 cdp.service.ts 行号引用。
> caption 关键句：**「agent 不是要 puppeteer.launch()，agent 要的是 fetch('/v1/sessions')」——这就是 Steel 存在的全部理由**。

## 核心机制 · Layer 3 精读

> 框架/SDK 分支要求 ≥ 3 段：(1) 核心 abstraction、(2) middleware/handler 模型、(3) lifecycle / 扩展机制。
> 下面 3 段对应：(a) Session lifecycle、(b) CDP WebSocket 反代、(c) REST endpoint 抽象。

---

### 机制 1 · Session lifecycle：单 Chromium 多 session 的 keepAlive 模型

[`api/src/services/cdp/cdp.service.ts#L1278-L1336`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L1278-L1336)：

```typescript
@traceable
public async startNewSession(sessionConfig: BrowserLauncherOptions): Promise<Browser> {
  this.currentSessionConfig = sessionConfig;
  this.trackedOrigins.clear(); // Clear tracked origins when starting a new session

  // Recreate target instrumentation manager with session-specific options
  this.targetInstrumentationManager = new TargetInstrumentationManager(
    this.instrumentationLogger,
    this.logger,
    {
      dangerouslyLogRequestDetails: sessionConfig.dangerouslyLogRequestDetails,
    },
  );

  // Notify plugins that a session is starting, before any launch/reuse work begins.
  // This is the earliest point where session context (e.g. sessionId) is available.
  await this.pluginManager.onSessionStart(sessionConfig);

  try {
    return await this.launch(sessionConfig);
  } catch (error) {
    // If launch fails, ensure we still notify plugins about session end to allow for proper cleanup
    await this.pluginManager.onBeforeSessionEnd(sessionConfig);
    await this.pluginManager.onSessionEnd(sessionConfig);
    await this.pluginManager.onAfterSessionEnd(sessionConfig);
    throw error;
  }
}

@traceable
public async endSession(reason: ShutdownReason = ShutdownReason.SESSION_END): Promise<void> {
  this.logger.info("Ending current session and resetting to default configuration.");
  const sessionConfig = this.currentSessionConfig!;

  this.sessionContext = await this.getBrowserState().catch(() => null);

  try {
    await this.pluginManager.onBeforeSessionEnd(sessionConfig);
    await this.shutdown(reason);
    await this.pluginManager.onSessionEnd(sessionConfig);
    this.currentSessionConfig = null;
    this.sessionContext = null;
    this.trackedOrigins.clear();

    this.instrumentationLogger.resetContext();

    // Reset target instrumentation manager to clear session-specific options
    // (e.g. dangerous logging flags) so they don't leak into the idle browser
    this.targetInstrumentationManager = new TargetInstrumentationManager(
      this.instrumentationLogger,
      this.logger,
    );
  } finally {
    await this.pluginManager.onAfterSessionEnd(sessionConfig);
  }

  // Relaunch the idle browser
  await this.launch(this.defaultLaunchConfig);
}
```

**旁注**：

- **`startNewSession` 不 spawn 新 Chrome 进程**——它做的是「为这个 session 重新配置已有 Chromium」。
  真正的 `puppeteer.launch()` 在 `launch()` → `launchInternal()` 里，且只有在 `browserInstance == null` 或配置发生显著变化时才发生（[cdp.service.ts:614-622](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L614-L622) 的 `isSimilarConfig` 判定）。
- **`trackedOrigins.clear()` + `targetInstrumentationManager` 重建**：这是 session 隔离的命门。
  上一个 session 注入过的 cookies / dangerouslyLogRequestDetails 不能泄到下一个 session——
  否则你抓 A 站的 cookie 会带到 B 站，是数据安全事故。
- **plugin lifecycle 的 6 个 hook 是非对称的**：start 只有一个 `onSessionStart`，
  end 有 `onBeforeSessionEnd` / `onSessionEnd` / `onAfterSessionEnd` 三段。
  非对称是因为「end」要保证插件能在 browser 销毁前抓数据（before）、销毁中通知（during）、销毁后清理（after）。
  start 不需要对称——session 还没启动，插件没什么可清理的。
- **`endSession` 末尾 `await this.launch(this.defaultLaunchConfig)`**：这是 keepAlive 模型的精髓。
  上一个 session 结束后 **立即** relaunch 一个 idle 浏览器，不等下一个请求来才启动。
  是用启动延迟换闲置内存——对延迟敏感的 agent 场景很关键，
  但容器 idle 时也长期持有 ~200MB 内存，不适合 serverless 部署。
- **错误路径里 plugin lifecycle 也走完整三段**：`startNewSession` 的 catch 里
  调 `onBeforeSessionEnd` → `onSessionEnd` → `onAfterSessionEnd`——
  即使 launch 失败，plugin 也能拿到「session 没起来」的信号做清理。
  写过 framework 的人会认得这个套路：**lifecycle 必须 closed under failure**。
- **`getBrowserState().catch(() => null)`**：拿浏览器状态（cookie / localStorage）失败时静默 swallow。
  因为 endSession 路径上失败拿状态不能阻止关闭——但这意味着用户**不知道自己的 sessionContext 没存下来**，
  下次复用 session 会发现 cookie 没了。这是怀疑点。

**怀疑 1**：[cdp.service.ts:1335](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L1335)
的 `await this.launch(this.defaultLaunchConfig)` 在 endSession 末尾 **立即** 重启 idle Chromium，
没有任何 cooldown / debounce。
如果 agent 在快速循环里频繁 create-then-end-then-create（比如每个 URL 一个 session），
会不会触发"endSession 启动 idle browser → startNewSession 关掉 idle 再开新的"反复 spawn-kill？
读 `isSimilarConfig` 的判定能否短路掉这个抖动？还是说会把 disk I/O 打满？

---

### 机制 2 · CDP WebSocket 反代：让 agent 直接讲协议

[`api/src/plugins/browser-socket/browser-socket.ts#L39-L70`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/plugins/browser-socket/browser-socket.ts#L39-L70)：

```typescript
fastify.server.on("upgrade", async (request, socket, head) => {
  fastify.log.info("Upgrading browser socket...");
  const url = request.url ?? "";
  const params = Object.fromEntries(
    new URL(url || "", `http://${request.headers.host}`).searchParams.entries(),
  );

  const context: WebSocketHandlerContext = {
    fastify,
    wss,
    params,
  };

  const handler = registry.matchHandler(url);

  if (handler) {
    try {
      await handler.handler(request, socket, head, context);
    } catch (err) {
      fastify.log.error({ err }, `WebSocket handler error for ${url}`);
      socket.destroy();
    }
  } else {
    fastify.log.info("Connecting to CDP...");
    try {
      await fastify.cdpService.proxyWebSocket(request, socket, head);
    } catch (err) {
      fastify.log.error({ err }, "CDP WebSocket error");
      socket.destroy();
    }
  }
});
```

配套的反代实现（[cdp.service.ts:1076-1135](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L1076-L1135)）：

```typescript
@traceable
public async proxyWebSocket(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  if (this.proxyWebSocketHandler) {
    this.logger.info("[CDPService] Using custom WebSocket proxy handler");
    await this.proxyWebSocketHandler(req, socket, head);
    return;
  }

  if (!this.wsEndpoint) {
    throw new Error(`WebSocket endpoint not available. Ensure the browser is launched first.`);
  }

  const cleanupListeners = () => {
    this.browserInstance?.off("close", cleanupListeners);
    if (this.browserInstance?.process()) {
      this.browserInstance.process()?.off("close", cleanupListeners);
    }
    this.browserInstance?.off("disconnected", cleanupListeners);
    socket.off("close", cleanupListeners);
    socket.off("error", cleanupListeners);
  };

  this.browserInstance?.once("close", cleanupListeners);
  if (this.browserInstance?.process()) {
    this.browserInstance.process()?.once("close", cleanupListeners);
  }
  this.browserInstance?.once("disconnected", cleanupListeners);
  socket.once("close", cleanupListeners);
  socket.once("error", cleanupListeners);

  // Increase max listeners
  if (this.browserInstance?.process()) {
    this.browserInstance.process()!.setMaxListeners(60);
  }

  this.wsProxyServer.ws(
    req,
    socket,
    head,
    {
      target: this.wsEndpoint,
    },
    (error) => {
      if (error) {
        this.logger.error(`WebSocket proxy error: ${error}`);
        cleanupListeners(); // Clean up on error too
      }
    },
  );
  // ... socket error handling
}
```

**旁注**：

- **`fastify.server.on("upgrade")` 是 Node http server 原生事件**——不是 fastify 路由。
  Steel 没用 `@fastify/websocket`，因为他们要做的事更底层：拿到 raw socket 直接转发到另一个 WS 端点（Chromium 的 9222 port），中间不解析任何帧。
- **registry 优先 + cdp fallback** 是关键 dispatch 模式：
  对于 `/cast` / `/devtools` 这种 Steel 自己的 WS endpoint（live session viewer / browser inspector），走 `registry.matchHandler`；
  其它 URL（agent 想直连 CDP 的）一律 fallback 到 `proxyWebSocket`。
  这等于「agent 用 puppeteer.connect(websocketUrl)，**它根本不知道中间有 Steel**」——
  对 puppeteer / playwright 来说 Steel 是透明的。
- **`cleanupListeners` 用 `once` 而不是 `on`**：5 个 cleanup 触发源（browser close / process close / disconnected / socket close / socket error）任一发生都触发清理，且每个只触发一次。
  这是 Node EventEmitter 内存泄露的常见坑——同一个 listener 注册到 5 个事件，必须 5 个解绑都做掉。
- **`setMaxListeners(60)` 是 hack**：Node 默认 10 个 listener 警告。
  Chromium process 生命周期里被加了大量监听（disconnected / close / error / instrumentation 各种），
  60 是经验拍出来的。这暴露了**架构层面的事件耦合过密**——理想做法是中间加一层 EventBus，但 Steel 没做。
- **`this.wsProxyServer = httpProxy.createProxyServer()` 在 constructor 里就建了**（[cdp.service.ts:136](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L136)）。
  注意是**全局复用一个 httpProxy 实例**——所有 WS 连接共享。
  这点 OK 因为 http-proxy 内部用的是 Node 的 http upgrade 机制，本身是 streaming 的。
- **`setProxyWebSocketHandler` extension point**（[cdp.service.ts:195-199](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L195-L199)）让你完全替换默认行为——比如想做 CDP 协议级 audit / rate limit / 改写帧，整个 default proxy 逻辑都不跑。

**怀疑 2**：fallback 到 CDP 反代的判定**只看 registry 是否有 handler**，没有 origin / auth / token 校验。
[browser-socket.ts:62-64](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/plugins/browser-socket/browser-socket.ts#L62-L64)
任何能连到 Steel 端口的客户端都能 raw CDP——
而 raw CDP 等于完全控制浏览器（`Runtime.evaluate('navigator.cookie')` 能偷到当前页面 cookie）。
生产部署如果不在前面挂 nginx / cloudflare 做认证，**这是一个公开的 RCE 入口**。
读 `env.ts` 里有没有 token 配置我没找到——是 Steel 默认相信"反正你部署在内网"还是漏写校验？

---

### 机制 3 · REST endpoint 抽象：把 Chromium 用法标准化成 HTTP

[`api/src/modules/actions/actions.controller.ts#L414-L492`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/modules/actions/actions.controller.ts#L414-L492)：

```typescript
export const handleScreenshot = async (
  sessionService: SessionService,
  browserService: CDPService,
  request: ScreenshotRequest,
  reply: FastifyReply,
) => {
  const startTime = Date.now();
  let times: Record<string, number> = {};
  const { url, logUrl, proxyUrl, delay, fullPage } = request.body;

  let proxy: IProxyServer | null = null;
  let context: BrowserContext | null = null;

  if (!browserService.isRunning()) {
    await browserService.launch();
  }

  try {
    if (proxyUrl) {
      proxy = await sessionService.proxyFactory(proxyUrl);
      await proxy.listen();
    }

    times.proxyTime = Date.now() - startTime;

    let page: Page;

    if (proxy) {
      context = await browserService.createBrowserContext(proxy.url);
      page = await context.newPage();
      times.proxyPageTime = Date.now() - startTime - times.proxyTime;
    } else {
      page = await browserService.getPrimaryPage();
      times.pageTime = Date.now() - startTime;
    }

    if (url) {
      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) {
        throw new Error(`Invalid URL: ${url}`);
      }
      await page.goto(normalizedUrl, { timeout: 30000, waitUntil: "domcontentloaded" });
      times.pageLoadTime = Date.now() - times.pageTime - times.proxyTime - startTime;
    }

    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const screenshot = await page.screenshot({ fullPage, type: "jpeg", quality: 100 });
    times.screenshotTime =
      Date.now() - times.pageLoadTime - times.pageTime - times.proxyTime - startTime;

    if (logUrl) {
      await updateLog(logUrl, { times });
    }

    return reply.send(screenshot);
  } catch (e: unknown) {
    const error = getErrors(e);

    if (logUrl) {
      await updateLog(logUrl, { times, response: { browserError: error } });
    }

    if (url) {
      await browserService.refreshPrimaryPage();
    }

    return reply.code(500).send({ message: error });
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (proxy) {
      await proxy.close(true).catch(() => {});
    }
  }
};
```

**旁注**：

- **`/v1/screenshot` 不要求先 `/v1/sessions`**：检查 `if (!browserService.isRunning()) await browserService.launch()`——
  agent 可以一次性 fire-and-forget 调 `/v1/screenshot` 拿截图，不用管 session。
  这是把 Steel 当**纯抓取 SaaS** 用的最低门槛。代价：用了**共享的 primary page**（`browserService.getPrimaryPage()`），多个 agent 同时调会互相覆盖页面状态。
- **proxy 走两条路径**：传 `proxyUrl` 时 → 起一个独立 `BrowserContext`（[`browser.createBrowserContext`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L513-L518) 用 puppeteer 的 incognito context），
  context 独立 cookie / cache，request 通过 `--proxy-server` 发到独立 ProxyServer；
  没传 proxyUrl 时 → 用 primary page，没有 isolation。
  这个二态设计是性能/隔离的 trade-off：单页面快，独立 context 慢但安全。
- **`times` 对象是 phase timing**：proxyTime / proxyPageTime / pageTime / pageLoadTime / screenshotTime——
  agent 端可以根据这些数字诊断是代理慢、还是页面慢、还是 Chromium 渲染慢。
  这是 framework-as-a-service 的关键 affordance：**让 agent 知道哪一段是瓶颈**。
  对应的 `logUrl` 让 agent 可以异步把 timing 推到自己的 telemetry 后端。
- **`type: "jpeg", quality: 100`**：硬编码 jpeg。
  PNG 截图体积大 5-10×，对 agent 场景（截图给 VLM 看）jpeg 100 已经够清晰。这是 sane default 的设计味道——
  让 agent 的 fetch response 能 < 500KB 不爆 lambda response size limit。
- **catch 里 `refreshPrimaryPage`**：失败后**强制刷新共享 primary page**。
  防止 agent A 的失败页面状态污染 agent B 的下一次请求——
  但这意味着如果失败时 agent A 要 retry，旧的 page state 已经没了，必须从 url 开始重来。
- **`finally` 关 context + proxy**：proxy 是 per-request 起的（端口 0 OS 分配），用完必须关，否则 OS 会跑出端口。
  `.catch(() => {})` swallow——Steel 选择**关失败也继续**，宁可端口泄露也要保证响应返回 agent。

**怀疑 3**：[actions.controller.ts:463](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/modules/actions/actions.controller.ts#L463)
的 `page.screenshot({ fullPage })` 没设视口大小——它用的是 puppeteer `defaultViewport: null`（[cdp.service.ts:882](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L882)），
即跟随 `--window-size` 命令行参数（默认 1920×1080）。
但如果 launch 时传了 `dimensions` 参数（fingerprint 派生 mobile 800×600），primary page 会跟 fingerprint dim 走还是固定 1920？
读 `injectFingerprintSafely` 的 `Page.setDeviceMetricsOverride` 调用顺序——
是在 launch 后改的还是 launch 时就用了？我猜是 launch 后异步改，那截图给 fingerprint mobile 但 viewport 1920 的 mismatch 怎么处理？

---

### 机制 4 · ProxyServer：per-session HTTP 代理（短）

[`api/src/utils/proxy.ts`](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/utils/proxy.ts)（69 行全文）：

```typescript
export class ProxyServer extends Server implements IProxyServer {
  public url: string;
  public upstreamProxyUrl: string;
  public txBytes = 0;
  public rxBytes = 0;
  private hostConnections = new Set<number>();

  constructor(proxyUrl: string) {
    super({
      port: 0,
      prepareRequestFunction: (options) => {
        const { connectionId, hostname } = options;
        const internalBypassTests = new Set(["0.0.0.0", process.env.HOST]);

        if (env.PROXY_INTERNAL_BYPASS) {
          for (const host of env.PROXY_INTERNAL_BYPASS.split(",")) {
            internalBypassTests.add(host.trim());
          }
        }

        const isInternalBypass = internalBypassTests.has(hostname);

        if (isInternalBypass) {
          this.hostConnections.add(connectionId);
          return {
            customConnectServer: PassthroughServer,
            customResponseFunction: makePassthrough(options),
          };
        }
        return {
          requestAuthentication: false,
          upstreamProxyUrl: proxyUrl,
        };
      },
    });

    this.on("connectionClosed", ({ connectionId, stats }) => {
      if (stats && !this.hostConnections.has(connectionId)) {
        this.txBytes += stats.trgTxBytes;
        this.rxBytes += stats.trgRxBytes;
      }
      this.hostConnections.delete(connectionId);
    });

    this.url = `http://127.0.0.1:${this.port}`;
    this.upstreamProxyUrl = proxyUrl;
  }
}
```

**旁注**：

- **`port: 0` 让 OS 分配空闲端口**——多 session 并发时不会撞端口。
- **`internalBypassTests` 防止代理走自己**：如果 agent 配了一个外部 proxy，但请求又指回 Steel 自己的 host，会无限套娃。
  bypass 规则把这种本地请求直连 PassthroughServer。
- **`txBytes / rxBytes` 在 `connectionClosed` 累加**：方便 sessionService 上报到 SessionDetails 的 `proxyTxBytes / proxyRxBytes`——
  Steel.dev 商用版按流量计费的钩子点。OSS 自托管不用关心，但能算自己 agent 用了多少代理流量。
- **`Server` 是 `proxy-chain` 的类**：Apify 维护的库，是 Chromium / Selenium 测试圈最常用的 HTTP CONNECT 代理实现。
  Steel 没自己造代理轮子，是务实选择。

## Hands-on（含改一处实验） · Layer 4

### 30 分钟跑通

```bash
# 0. 一键 docker（最快路径）
docker run -p 3000:3000 ghcr.io/steel-dev/steel-browser:latest

# 1. 测健康检查
curl -s http://localhost:3000/v1/health | jq
# {"status":"ok"}

# 2. 创建 session
curl -s -X POST http://localhost:3000/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"dimensions":{"width":1280,"height":720}}' | jq
# 返回 SessionDetails，含 websocketUrl / debuggerUrl / sessionViewerUrl

# 3. 截图测试（不依赖 session，自动 launch）
time curl -s -X POST http://localhost:3000/v1/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","fullPage":false}' \
  -o /tmp/example.jpg
# 看 latency + 文件大小（jpeg quality 100，~30-80KB）

# 4. scrape 一个页面拿 markdown
curl -s -X POST http://localhost:3000/v1/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://news.ycombinator.com","format":["markdown","links"]}' \
  | jq -r '.content.markdown' | head -30

# 5. 直连 raw CDP（用 puppeteer-core 测）
node -e '
const puppeteer = require("puppeteer-core");
(async () => {
  const session = await fetch("http://localhost:3000/v1/sessions", {method:"POST"})
    .then(r => r.json());
  const browser = await puppeteer.connect({ browserWSEndpoint: session.websocketUrl });
  const page = (await browser.pages())[0];
  await page.goto("https://example.com");
  console.log(await page.title());
  browser.disconnect();
})()'

# 6. 关 session
curl -s -X POST http://localhost:3000/v1/sessions/release | jq
```

### 改一处实验：把"keepAlive 立即 relaunch"改成"懒启动"

**目标**：验证机制 1 怀疑 1——快速 session 循环时频繁 spawn-kill 是否成本可见。

修改 [cdp.service.ts:1335](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L1335)：

```typescript
// 原代码（endSession 末尾）
await this.launch(this.defaultLaunchConfig);

// 改成（注释掉立即 relaunch）
// await this.launch(this.defaultLaunchConfig);  // ← 改这里
this.logger.info('[experiment] skipped idle relaunch');
```

然后跑 100 次 create-end 循环：

```bash
for i in {1..100}; do
  time (
    curl -s -X POST http://localhost:3000/v1/sessions -d '{}' -H 'Content-Type: application/json' > /dev/null
    curl -s -X POST http://localhost:3000/v1/sessions/release > /dev/null
  )
done 2>&1 | grep real | awk '{ s += $2 } END { print s/NR }'
```

预期观测：

- **改前（立即 relaunch）**：每次 endSession 后立即起 idle Chrome（~2-3s），下次 create 直接复用。
  100 次循环总耗时受限于 puppeteer.launch 单次成本（~2.5s × 100 = 250s）。
- **改后（懒启动）**：endSession 不 spawn idle，下次 create 时才 spawn。
  100 次循环总耗时类似（lazy 把成本挪到下次 create），**但内存峰值更低**——
  agent 长时间不来时容器只占空闲内存。

实验观测的真实价值：让你**亲眼看见 keepAlive 的 trade-off**——
"启动延迟低 vs 闲置内存高"两个目标二选一，Steel 默认选了前者，serverless 部署要选后者。

## 横向对比 · Layer 5

| 维度 | Steel Browser | Browserbase | browser-use | Playwright 直接 | midscene |
|---|---|---|---|---|---|
| **架构哲学** | 开源 REST + raw CDP 双接口 | 闭源 SaaS 按分钟计费 | agent 决策框架，进程内调 playwright | 进程内 long-running 脚本 | agent + VLM 决策，进程内调 playwright |
| **部署形态** | docker run / 自托管 | 无（只能调他们 API） | pip install / 用户进程 | npm install | npm install |
| **接口** | REST（`/v1/scrape` 等）+ raw CDP WebSocket | REST | playwright API（间接） | playwright API | playwright API + 自然语言指令 |
| **License** | Apache-2.0 | 闭源 | MIT | Apache-2.0 | MIT |
| **多 session** | 单实例单 Chromium，多实例水平扩展 | SaaS 内部分配 | 进程内多 context | 进程内多 context | 进程内多 context |
| **反 bot 检测** | 内置 fingerprint-generator + 90+ Chrome flags + ad block | SaaS 自带（强） | 看你怎么 launch playwright | 默认无 | 默认无 |
| **session viewer** | 内置（live-session-streamer.ejs + WS 推帧） | 内置 | 无 | 无 | 截图回放 |
| **agent 调用心智** | "我开个服务调它" | "我调云 SaaS" | "我导入库写循环" | "我导入库写循环" | "我导入库写循环" |
| **典型用户** | 中型公司 + 隐私敏感 + 想自托管 | 不想运维的初创 + 快速 PoC | 写 agent 的开发者 | 测试工程师 / 抓数据脚本 | 写 agent 但要 VLM 决策 |
| **代码量** | 1.5 万行 TS | 黑盒 | ~3 万行 Python | 数十万行 | ~2 万行 TS |

**选型建议**：

- **想 PoC 快、不想运维、预算够、数据可出境** → Browserbase
- **公司内部 / 隐私敏感 / 想 fork 改逻辑 / 长期成本可控** → Steel Browser
- **要写 agent 决策逻辑（"看截图决定下一步点哪"）** → browser-use（决策层）+ Steel（工具层），两个都用
- **只是要写测试 / 抓数据，没有 agent 概念** → 直接 Playwright，不要上 Steel
- **agent 决策要 VLM（视觉语言模型）做** → midscene；如果要 agent + 自托管 + REST → midscene 在 Steel 上跑

**哲学差异**：

- Browserbase 的哲学是「浏览器自动化是 SaaS」——你不应该关心 docker / Chromium / proxy，付钱给我就行。
- Steel 的哲学是「浏览器自动化是 framework」——你应该自托管，但不应该自己写 1500 行 cdp.service.ts。
- browser-use / midscene 的哲学是「浏览器自动化是 agent 的 tool」——
  agent 进程内直接 import，不该绕一层 HTTP。
- Steel 跟 browser-use / midscene 不冲突——上层 agent 框架可以连到 Steel 的 `websocketUrl`，
  Steel 只管下层"把 Chromium 服务化"这件事。

## 与你当前工作的连接 · Layer 6

### 今天就能用

- **批量抓取场景**：当前如果直接跑 puppeteer 在主进程里，抓 100 个页面要等 puppeteer launch ~3s × 100。
  上 Steel 后改成"主进程发 fetch 到 Steel:3000，Steel 单 Chromium 复用"——节省 95% 的 launch 时间。
- **本机调试**：`docker run -p 3000:3000 ghcr.io/steel-dev/steel-browser` 起来后，调试任何"我想 LLM 看一个网页"的流程都不用本地装 Chrome。
- **OSS PR 借鉴模式**：Steel 的 `executeCritical` / `executeOptional` / `executeBestEffort`（[utils/error-handlers.ts](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/utils/error-handlers.ts)）三档错误处理是非常好的 framework 错误分级模板——可以套用到自己的服务里。
- **`dangerouslyLogRequestDetails` 的命名美学**：危险旗标加 `dangerously` 前缀，强迫调用者读到名字就停一秒——可以学这个命名哲学。

### 下个月能用

- **如果做"agent 开浏览器查资料"类应用** —— 上 Steel 把浏览器跟主流程解耦，agent 死了不影响浏览器。
- **如果要做反 bot 检测较强的站点抓取** —— Steel 内置 fingerprint + ad block + 90+ Chrome flag，比裸 puppeteer 抗检测好得多。
- **如果要自己写一个内部 SaaS（"给非技术同事调"）** —— 直接 fork Steel 改 routes，比从 0 写 Fastify + puppeteer 快 3 周。
- **fingerprint 注入双层降级**（CDP Emulation 优先 + fingerprint-injector 兜底）的写法可以套到自己的 anti-bot 工具里。

### 不要用的部分

- **不要把 Steel 当"通用 HTTP 服务模板"** —— 它整个设计假设是「单实例 + 单 Chromium」，水平扩展靠多实例 + LB，不是单进程多 worker。强行多 worker 会撞 9222 port。
- **不要直接信 `cdp.service.ts:198` 的 `setProxyWebSocketHandler` 是 silver bullet** —— 这是 single hook 单点替换，不能链式；多个想 hook WS 的插件会互相覆盖。
- **生产部署不要直接暴露 0.0.0.0:3000** —— raw CDP WS 没鉴权（怀疑 2），等于公开 RCE。前面挂 nginx + token / IP 白名单是必须的。
- **不要在 Steel 里跑超过 1 个 Chromium** —— `activeSession` 是单数，硬要并发要部多个实例。
- **不要把 `pastSessions` 当审计日志** —— 进程重启就丢，是内存数组而不是持久化（[session.service.ts:66](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/session.service.ts#L66)）。要审计得自己接 leveldb 或外部 DB。

## 自检问题 + 延伸阅读 · Layer 7

### 7.1 三件具体怀疑（追到行号）

- **怀疑 1**（前文机制 1）：[cdp.service.ts:1335](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L1335) 的"endSession 末尾立即 relaunch idle"在快速 session 循环下会不会抖动？`isSimilarConfig` 短路能否覆盖？disk I/O 上限多少？
- **怀疑 2**（前文机制 2）：[browser-socket.ts:62](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/plugins/browser-socket/browser-socket.ts#L62) fallback 到 raw CDP 反代**没有任何 auth 校验**——是默认假设"反正部内网"还是漏写？这是不是公开 RCE 入口？
- **怀疑 3**（前文机制 3）：[actions.controller.ts:463](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/modules/actions/actions.controller.ts#L463) 截图时 viewport / fingerprint dim mismatch 怎么处理？fingerprint mobile 但 window-size 1920 的 case 实际行为是什么？
- **怀疑 4**：[cdp.service.ts:1107](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L1107) 的 `setMaxListeners(60)` 是 hardcoded magic number。如果一个 session 注册了大量插件 hook，会不会突破 60？为什么不是动态？
- **怀疑 5**：[session.service.ts:285](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/session.service.ts#L285) selenium 模式下 endSession 会调 `cdpService.launch()` —— 但 cdpService 的 `keepAlive` 状态没显式重置。selenium 跑完切回 CDP 模式，旧 selenium config 残留怎么处理？

### 7.2 接下来读哪 N 个文件

| 文件 | 为什么读 |
|---|---|
| `api/src/services/cdp/plugins/core/plugin-manager.ts` | 看 plugin lifecycle 的并行/串行调度；6 hook 是不是按顺序 await 还是 Promise.all？验证机制 1 旁注 |
| `api/src/services/cdp/instrumentation/target-manager.ts` | 看 targetcreated / targetchanged / targetdestroyed 怎么注册 instrumentation；和 page-level event 的关系 |
| `api/src/services/cdp/utils/error-handlers.ts` | 看 `executeCritical` / `executeOptional` / `executeBestEffort` 的三档错误传播策略——可以直接套用 |
| `api/src/utils/scrape/index.ts` + `cleanHtml.ts` + `htmlToMarkdown.ts` | 看 scrape 的 HTML→clean→Markdown pipeline，工程上很 reusable |
| `api/src/plugins/browser-socket/handlers/index.ts` + `casting.handler.ts`（486 行） | 看 live session viewer 的 WS 帧推送实现，截屏给前端看的方式 |
| `repl/` 整个子项目 | 看 Steel 自己怎么调试——是 framework 作者最佳实践 |
| `ui/` Vite + React | 不重要，可以跳过；只看 viewer 怎么连 WS 即可 |

## 限制段（≥ 4 条独立限制）

1. **单实例单 Chromium 不能水平扩展**：`activeSession` 是单数（[session.service.ts:67](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/session.service.ts#L67)），同一时刻只能服务一个 active 会话。要并发就部多个 Steel 实例 + 前面挂 LB——一个 docker container 一个 Chromium，多实例之间 cookie / cache 不共享。

2. **WebSocket 没鉴权（默认）**：raw CDP 反代是 fallback 路径，不在 registry 命中即直连——任何能访问 3000 port 的客户端都能 raw CDP（怀疑 2）。生产必须前置 nginx + token / IP 白名单。这是部署时的隐性运维成本，README 没显著标注。

3. **endSession 立即 relaunch 是 hardcoded 行为**：[cdp.service.ts:1335](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/cdp/cdp.service.ts#L1335) 的 `await this.launch(this.defaultLaunchConfig)` 没有 disable 开关——serverless 部署（lambda / cloud run）希望"不用就 idle 不持有 Chrome"，但 Steel 的设计强制保持 Chrome warm。要禁用得 fork。

4. **TypeScript only**：项目用了 ES modules + 严格 TS。要改逻辑得懂 puppeteer-core API + Fastify schema 系统 + Zod。Python / Go 后端的团队 fork 后维护成本高。

5. **`pastSessions` 仅存内存**：进程重启即丢（[session.service.ts:66](https://github.com/steel-dev/steel-browser/blob/fc75fcae871dc256553564abafbdbd54da1147d8/api/src/services/session.service.ts#L66) 是 `pastSessions: Session[] = []`）。需要审计场景必须自己接 leveldb（已有但用得少）或外部 DB。

6. **反 bot 检测是猫鼠游戏**：内置的 fingerprint + 90+ Chrome flags + ad block 当前能扛 Cloudflare / Datadome 一些版本，但不是永久解。Cloudflare 升级 challenge 后可能失效——Steel 维护者要追着改 flag 列表。这是不可控的外部依赖。

## 附录：宣传 vs 现实

| 宣传（README / docs） | 代码现实 |
|---|---|
| "🔥 Open Source Browser API for AI Agents & Apps" | 准确：Apache-2.0 + REST API；agent-friendly 设计（fire-and-forget 模式 / timing 字段 / logUrl webhook） |
| "Batteries-included browser sandbox" | 部分准确：fingerprint / proxy / ad block / extension 都内置；但**没有 auth / rate limit / multi-tenancy**——production-ready 还差关键几块 |
| "Without worrying about infrastructure" | 半准确：docker run 一行起来；但生产要前置 nginx 鉴权 + LB + 监控 + 多实例水平扩展——这些 infra 没消失，只是从"写代码"挪到"写部署" |
| "Compatible with Puppeteer / Playwright" | 准确：暴露 `websocketUrl` 让 puppeteer.connect / playwright.connectOverCDP 直接用；agent 端代码不变 |
| "Anti-bot detection" | 弱准确：内置一套常见反 detection，但不是 silver bullet。Cloudflare Turnstile / Datadome 高级版仍可能识别——需要看具体目标站 |
| "Production-ready" | 不准确（如怀疑 2）：默认配置不能直接生产暴露。`pastSessions` 不持久化，无内置审计——production 还需要工程加固 |

升级日期：2026-05-28
启用工具：本地 git clone --depth 1 / Read / WebFetch / cwebp / Pillow（图）
方法论版本：v1.1 项目类型分支 D 框架/SDK
读源码字数：心脏文件 cdp.service.ts 全文 1523 行通读 + session.service.ts 327 行全文 + 关键 plugin / proxy / actions 抽样
