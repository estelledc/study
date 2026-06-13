---
title: Workbox — 给 Service Worker 装上「离线后勤系统」
来源: https://github.com/GoogleChrome/workbox
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

Workbox 是 Google Chrome 团队维护的一套 **JavaScript 库 + 构建插件**，专门帮你写 [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)——让网站在断网、弱网时仍能打开，并加速重复访问。日常类比：

> 你开了一家便利店。顾客进门要拿货架上的货（HTML、JS、CSS、图片），还要等供应商送货（API 请求）。
> **没有 Workbox**：你自己雇一个「仓库管理员」（手写 Service Worker），记住每件货放哪、过期没、断货时怎么办——几百行 `fetch` + `cache.put` 容易写错。
> **有了 Workbox**：管理员换成一套标准 SOP——「开业先把常备货摆进冷库」（precache）、「顾客要什么按品类走不同流程」（routing + strategies）、「冷库满了自动清旧货」（expiration）。你只写规则，脏活它干。

一句话：**Workbox 把 PWA 离线缓存从「手写代理服务器」变成「配置几条路由策略」**。

## 为什么重要

现代前端几乎都在谈「快」和「稳」，Workbox 解决的是浏览器层那道常被忽略的墙：

- **离线 / 弱网可用**：地铁、电梯、展会 Wi-Fi 不稳时，已访问过的页面仍能打开——不是魔法，是 Service Worker 拦截请求并从 Cache Storage 读缓存。
- **首屏与重复访问加速**：构建时 precache 的 JS/CSS/字体走「缓存优先」，第二次打开不必再等完整网络往返。
- **与构建工具深度集成**：[[webpack]]、[[vite]]（通过 `vite-plugin-pwa`）、Create React App 等都能用 `workbox-webpack-plugin` 在打包阶段生成 precache 清单，避免手写一长串 URL。
- **策略可组合、可测试**：`CacheFirst`、`NetworkFirst`、`StaleWhileRevalidate` 等是工业级默认值；Chrome Aurora 团队持续维护，v7.4（2025）仍在活跃更新。

不理解 Workbox，就很难解释：为什么同一个 SPA，加了 PWA 后 Lighthouse 的 PWA 分数和「可安装」能力会质变；以及为什么手写 Service Worker 容易在「更新后用户仍看到旧版」上踩坑。

## 核心概念

Workbox 可以拆成 **四层**，从底向上理解最清晰：

### 1. Service Worker 生命周期（背景）

Service Worker 是运行在浏览器后台的脚本，**不能访问 DOM**，但能监听 `install`、`activate`、`fetch` 事件。Workbox 帮你把这些事件里的缓存逻辑封装好。

典型生命周期：

1. **install**：下载并 precache 关键资源（应用壳）。
2. **activate**：清理旧版本缓存，可选 `clients.claim()` 立刻接管页面。
3. **fetch**：拦截同源（及配置过的跨域）请求，按策略返回缓存或网络响应。

### 2. Precaching（安装时预缓存）

`workbox-precaching` 在 Service Worker **安装阶段**把构建产物（带 content hash 的 `app.abc123.js` 等）写入缓存。URL 带 hash 的用作 cache key；不带 hash 的会附加内容哈希查询参数，避免误用旧文件。

核心 API：

- `precacheAndRoute(manifest)`：precache + 自动注册「缓存优先」路由。
- 构建插件注入 `self.__WB_MANIFEST`：Webpack/Vite 生成的 URL 列表。

**注意**：`precacheAndRoute()` 宜在自定义 `registerRoute()` **之前**调用，否则可能被你自己的路由抢先匹配。

### 3. Routing（运行时路由）

`workbox-routing` 的 `registerRoute(match, handler)` 像 Express 中间件：根据 URL、请求方法、`request.destination` 等决定用哪套缓存策略。

匹配方式示例：

- 字符串 / RegExp：`registerRoute(/\.png$/, ...)`
- 回调：`registerRoute(({ url, request }) => url.pathname.startsWith('/api/'), ...)`

### 4. Strategies（缓存策略）

`workbox-strategies` 提供常见模式，名字即语义：

| 策略 | 行为 | 典型场景 |
|------|------|----------|
| **CacheFirst** | 先缓存，未命中再网络 | 带 hash 的静态资源、字体、图片 |
| **NetworkFirst** | 先网络，失败或超时再用缓存 | HTML 导航、需新鲜的 API |
| **StaleWhileRevalidate** | 立即返回缓存，后台更新缓存 | CSS、非关键 JSON |
| **NetworkOnly** | 只走网络 | 支付、实时聊天 |
| **CacheOnly** | 只读缓存 | 离线 fallback 页 |

配套模块：

- `workbox-expiration`：限制条数、过期时间。
- `workbox-cacheable-response`：只缓存 `status === 200` 等。
- `workbox-background-sync`：离线时排队，恢复后重试。
- `workbox-window`：在**页面侧**注册 SW、监听更新、提示用户刷新。

### 5. 构建插件二选一

| 插件 | 适用 | 特点 |
|------|------|------|
| **GenerateSW** | 快速上线 PWA | 零 SW 源码，全配置生成 |
| **InjectManifest** | 要 Web Push、自定义逻辑 | 你写 `sw.js`，插件只注入 manifest |

## 实践案例

### 案例 1：手写 Service Worker（InjectManifest 典型内容）

适合已有 `src/sw.ts`，需要精细控制路由顺序的场景：

```javascript
/* eslint-disable no-restricted-globals */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// 构建时 injectManifest 会把 __WB_MANIFEST 替换成 precache 列表
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// 安装后立刻接管已打开的标签页（可选，配合 skipWaiting 使用）
clientsClaim();

// SPA：导航请求回退到 index.html（多页应用可删掉这段）
registerRoute(
  new NavigationRoute(
    async ({ request }) => {
      const cache = await caches.open('pages');
      return (await cache.match('/index.html')) || fetch(request);
    },
    { denylist: [/^\/api\//] }
  )
);

// 图片：缓存优先，最多 60 张、30 天
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// API：网络优先，3 秒超时后走缓存
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);

// 样式：Stale While Revalidate — 秒开 + 后台更新
registerRoute(
  ({ request }) => request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: 'styles' })
);
```

**逐段解释**：

- `precacheAndRoute`：安装时缓存 webpack/vite 打出来的带 hash 资源；之后对这些 URL 默认 **CacheFirst**。
- `NavigationRoute` + `denylist`：除 `/api/` 外，所有「页面跳转」类请求尝试返回 `index.html`，是 SPA 离线可用的关键。
- `ExpirationPlugin`：防止图片缓存无限膨胀占满 `navigator.storage` 配额。
- `networkTimeoutSeconds`：弱网下别让用户干等——超时就用旧数据。

### 案例 2：Webpack 用 GenerateSW「配置即 Service Worker」

不想维护 SW 源文件时，在 `webpack.config.js` 里加插件即可：

```javascript
const { GenerateSW } = require('workbox-webpack-plugin');

module.exports = {
  // ... 其他 webpack 配置
  plugins: [
    new GenerateSW({
      clientsClaim: true,
      skipWaiting: true,
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//, /^\/admin\//],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'google-fonts-stylesheets',
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'google-fonts-webfonts',
            expiration: {
              maxEntries: 30,
              maxAgeSeconds: 60 * 60 * 24 * 365,
            },
          },
        },
        {
          urlPattern: /\/api\/.*$/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 50, maxAgeSeconds: 300 },
          },
        },
      ],
    }),
  ],
};
```

构建结束后会多出 `service-worker.js`（或 `swDest` 指定的文件名），并在 HTML 里由你或插件注册。`skipWaiting: true` 表示新版本 SW **安装完立刻激活**——适合内部工具；面向公众的产品更常用 `workbox-window` 提示用户「有新版本，点刷新」。

### 案例 3：页面侧用 workbox-window 处理更新

Service Worker 在后台更新时，用户可能一直开着旧标签页。`workbox-window` 把「等待 / 跳过等待」封装成 Promise 风格 API：

```javascript
import { Workbox } from 'workbox-window';

if ('serviceWorker' in navigator) {
  const wb = new Workbox('/service-worker.js');

  wb.addEventListener('waiting', () => {
    // 有新 SW 在 waiting 状态：问用户是否刷新
    if (confirm('发现新版本，是否立即更新？')) {
      wb.messageSkipWaiting();
    }
  });

  wb.addEventListener('controlling', () => {
    window.location.reload();
  });

  wb.register();
}
```

`messageSkipWaiting()` 对应 SW 里的 `skipWaiting()`，激活后 `controlling` 触发，整页 reload 加载新 precache 资源。

## Precache 该做与不该做

**适合做 precache**：

- 应用壳：`index.html`、入口 JS/CSS、关键字体、离线 fallback 图。
- 体积可控、带 content hash 的构建产物。

**不适合盲目 precache**：

- 超大视频、用户上传文件、每次部署都变的无 hash 资源。
- 所有 API 响应（应用 `runtimeCaching` + `NetworkFirst` 更合理）。
- 超过 `maximumFileSizeToCacheInBytes`（默认 2MB）的文件——GenerateSW 会直接排除。

## 与 Vite / CRA 的关系

- **Create React App**：内置 `workbox-webpack-plugin`（InjectManifest），eject 后可见 `src/service-worker.js`。
- **Vite**：常用 [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)，底层仍是 Workbox，选项映射到 `generateSW` / `injectManifest`。
- **Next.js**：官方 PWA 支持较弱，社区多用 `next-pwa` 或自托管 SW；理解 Workbox 模块后迁移成本更低。

## 调试与排错

1. **Chrome DevTools → Application → Service Workers**：看当前 SW 状态（activated / waiting）、手动 skipWaiting、Unregister。
2. **Cache Storage**：核对 precache 与 runtime 缓存名是否如预期。
3. **Workbox 开发日志**：`self.__WB_DISABLE_DEV_LOGS = true` 可关；开发时保留日志能快速看出哪条 `registerRoute` 命中。
4. **「改了代码用户还是旧版」**：检查是否 `skipWaiting` + `clientsClaim`，或是否忘了用 `workbox-window` 引导刷新。
5. **配额超限**：配合 `workbox-expiration` 与 [Storage quota](https://developer.chrome.com/docs/workbox/how-to/storage-quota) 文档，避免 Cache Storage 被撑满。

## 常见误区

| 误区 | 事实 |
|------|------|
| Workbox = PWA 全部 | PWA 还包括 manifest、HTTPS、可安装性等；Workbox 主要管 **缓存与 SW** |
| precache 越多越好 | 安装阶段下载过多会拖慢**首次**访问 SW 安装时间 |
| 本地开发也要上 SW | 建议仅 production 注册，或用 `cacheId` 区分环境，否则 HMR 与缓存打架 |
| NetworkFirst 保证最新 | 有缓存时失败才用缓存；要强制新鲜请 NetworkOnly 或加 `cache: 'no-store'` |
| 只缓存 GET | Service Worker 默认只拦截 GET；POST 需 Background Sync 等额外方案 |

## 学习路径建议

1. 先读 MDN [Service Worker 生命周期](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)，建立「代理」心智模型。
2. 用 **GenerateSW** 在小型 Vite/React 项目里打开 PWA，观察 Application 面板里的 precache 列表。
3. 改为 **InjectManifest**，亲手写 `registerRoute`，故意调换与 `precacheAndRoute` 的顺序，看匹配差异。
4. 读官方 [Caching strategies](https://developer.chrome.com/docs/workbox/caching-strategies-overview) 与 [Precaching dos and don'ts](https://developer.chrome.com/docs/workbox/precaching-dos-and-donts)。
5. 需要离线表单提交时，再深入 `workbox-background-sync`。

## 与其他技术的关系

- **原生 Cache API**：Workbox 底层仍用 `caches.open()`；Workbox 提供路由、策略、清理、manifest 注入。
- **[[webpack]] / [[vite]]**：构建阶段生成 `__WB_MANIFEST`，与 Workbox 运行时库配合。
- **HTTP 缓存**：Service Worker 缓存是**另一层**，优先级高于浏览器 HTTP 缓存；部署策略需同时考虑 `Cache-Control` 与 SW。
- **[[nginx]] / CDN**：静态资源 hash 文件名 + CDN 长缓存 + SW precache 是常见「三层加速」组合。

## 小结

Workbox 把 Service Worker 里最易出错的三件事——**安装时预缓存、请求路由、策略选择**——收成可组合的模块和构建插件。零基础上手路径：**GenerateSW 跑通 → DevTools 看懂缓存 → InjectManifest 写自定义路由 → workbox-window 处理更新**。掌握之后，你就能在弱网场景下仍交付「像原生 App 一样能打开」的 Web 体验，而不必从零维护几百行 `fetch` 代理逻辑。
