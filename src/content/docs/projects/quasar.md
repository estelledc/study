---
title: Quasar — 一套 Vue 代码，七种平台产物
来源: 'https://github.com/quasarframework/quasar'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

Quasar 是基于 Vue.js 的**跨平台全能框架**：写一份代码，一键编出七种产物——

- **SPA**（单页网站，前端全跑在浏览器里）
- **SSR**（服务端渲染，页面由服务器生成，有利于搜索引擎收录）
- **PWA**（可像 App 一样安装到桌面/手机的网页，支持离线使用）
- **手机 App**（iOS / Android，经由 Capacitor 或 Cordova 打包成真正可上架的 App）
- **桌面 App**（经由 Electron 打包成 .exe / .dmg）
- **浏览器扩展**（Chrome / Firefox 插件，即 BEX）

这七种产物共用同一个代码库、同一套 UI 组件，切换产物类型只需改一行命令参数。

日常类比：像一家工厂，接收同一种原材料（Vue 组件），却可以按订单出产水杯、饭碗、花瓶……区别只在模具（build mode）不同。

Quasar CLI 扮演"模具总管"的角色。运行 `quasar dev -m capacitor` 就是换上手机模具，`quasar dev -m electron` 就是换桌面模具，底层的 Vue 组件丝毫不改。框架内置 100+ Material Design UI 组件、40+ 语言包，以及 Tree-shaking——不需要的组件不会打包进产物。

```bash
# 初始化项目
npm create quasar@latest my-app
cd my-app

# Web 开发
quasar dev

# 打包 iOS/Android（需安装 Capacitor 环境）
quasar dev -m capacitor -T android

# 打包桌面
quasar dev -m electron
```

## 为什么重要

不理解 Quasar，以下问题很难解释清楚：

- 为什么中小团队能"一个前端搞定五个平台"——单代码库省去的不只是复制粘贴，而是整套测试、发布、状态管理流水线
- 为什么 Capacitor 把 Web 代码跑在手机上能有接近原生的性能——Quasar 在组件层做了大量响应式适配，不是简单的 WebView 套壳
- 为什么 SSR + PWA 组合能同时解决 SEO 和离线缓存——两种 mode 可以叠加，Quasar CLI 自动处理 Hydration 和 Service Worker 注册
- 为什么团队越大、Quasar 的架构收益越明显——共享 `quasar.config.js` 让构建规则版本化，消除"我机器能跑，你机器不行"的经典问题

## 核心要点

**1. Mode（构建模式）是核心抽象**

Quasar 把每种部署目标抽象成 mode，通过 `quasar.config.js` 统一配置。同一份 Vue 组件，CLI 根据 mode 注入对应的 shim：SPA 不做特殊处理；SSR 注入服务端渲染入口；Capacitor mode 添加原生 bridge；Electron mode 生成 main process 和 preload 脚本。切换成本极低，通常只需改一行 CLI 参数。

**2. quasar.config.js 是单一配置源**

Webpack / Vite 的配置、环境变量、插件列表、各平台打包参数，全在一个文件里声明。类比：像一本施工图纸，七个施工队（七种 mode）拿同一份图各自施工，图纸改动自动同步给所有队。这避免了 `webpack.web.config.js` / `webpack.electron.config.js` 多份配置漂移的经典问题。

**3. UI 组件与平台无关**

Quasar 的组件库（QBtn、QInput、QTable 等）在所有 mode 下行为一致，底层会根据运行环境自动适配交互（触摸事件 vs 鼠标事件）。Tree-shaking 确保只有实际用到的组件打进产物，Web 产物和 Electron 产物的体积互不影响。

## 实践案例

### 案例 1：SPA → SSR + PWA 平滑升级

**场景**：创业公司先 SPA 上线，后来需要 SEO 和离线能力。

普通方案：拆成两个项目（Next.js + Workbox），路由层各写一遍。

Quasar 方案：`quasar.config.js` 中把 `build.mode` 从 `spa` 改成 `ssr`，同时开启 `pwa.workboxMode`。只需改这几行配置，Quasar 会自动处理 Service Worker 注册、HTML meta 注入等繁琐细节：

```js
// quasar.config.js
module.exports = configure(function (ctx) {
  return {
    build: {
      target: { browser: ['es2019', 'edge88'] },
    },
    ssr: {
      pwa: true,                        // SSR + PWA 叠加：一行开启
      prodPort: 3000,
    },
    pwa: {
      workboxMode: 'GenerateSW',        // 让 Quasar 自动生成 Service Worker 策略
      injectPwaMetaTags: true,          // 自动在 <head> 插入 PWA 相关 meta
    },
  }
})
```

结果：同一份 Vue 组件文件丝毫不改，首屏变成服务端渲染（利于 SEO），离线访问由 Service Worker 接管。升级耗时不超过半天。

### 案例 2：企业内部工具，Web + Electron 双端

**场景**：ERP 系统需要 Web 版（员工日常）和桌面版（财务重度用户，需本地文件读写）。

```bash
# Web 版开发
quasar dev -m spa

# 桌面版开发（自动开 Electron 窗口）
quasar dev -m electron

# 桌面版打包（输出 .exe / .dmg）
quasar build -m electron
```

在 Electron mode 下，Quasar 自动生成 `src-electron/electron-main.js`（主进程）和 `electron-preload.js`（contextBridge）。业务逻辑（表单、列表、权限）全在共享的 Vue 组件里，只有文件系统 API 调用需要写一小段 IPC 代码。两端共享 ~95% 代码。

### 案例 3：Capacitor 发布 iOS + Android

**场景**：H5 活动页想打包成真正可上架的 App，但不想维护 React Native / Flutter 项目。

```bash
# 添加 Capacitor mode
quasar mode add capacitor

# 添加 iOS / Android 平台
npx cap add ios
npx cap add android

# 开发调试（热更新）
quasar dev -m capacitor -T ios

# 生产构建 + 同步到 Xcode/Android Studio
quasar build -m capacitor -T ios
npx cap open ios
```

Quasar 会把 Web 产物复制到 Capacitor 项目中，原生 Shell 由 Capacitor 维护。调用摄像头、GPS、推送通知等，使用 `@capacitor/camera`、`@capacitor/geolocation` 等官方插件，Vue 代码直接 `import` 即可，无需修改组件结构。

## 踩过的坑

1. **Capacitor 插件版本冲突**：`@capacitor/core` 大版本和 Quasar 的 `@quasar/app-vite` 版本之间有隐式 peer 依赖。升级 Capacitor 5 → 6 时，如果不同步升级 Quasar CLI，iOS 构建会无声失败，日志里只有 Xcode 层的符号找不到，根因在 JS bridge 初始化时机不对。解决：严格锁定 `package.json` 里两者的版本，参考 Quasar release notes 中的 Capacitor 兼容矩阵。

2. **SSR 模式里使用 Quasar Plugin 报 `window is not defined`**：Dialog、Notify 等 Plugin 在服务端运行时没有 DOM，必须在调用前加守卫：`if (process.env.CLIENT) { Dialog.create(...) }`。这里的 `process.env.CLIENT` **不是 Node 原生变量，而是 Quasar 在构建时自动注入**的平台标志（服务端 = false，浏览器端 = true）。新手常踩这个坑，因为开发时 SPA 跑得好好的，切 SSR 才爆炸。

3. **`build.env` 与 Vite 的 `import.meta.env` 不完全等价**：Quasar 在 `quasar.config.js` 里有 `build.env` 注入机制，把变量打进 `process.env`（Webpack 风格）。Vite mode 下同时存在 `import.meta.env`（Vite 原生）。自定义变量如果用 Vite 原生方式访问，需以 `VITE_` 前缀命名（如 `VITE_API_URL`）并用 `import.meta.env.VITE_API_URL` 读取；若用 Quasar 的 `build.env` 注入，则用 `process.env.API_URL` 读取。两套命名体系**不要混用**，否则某些 tree-shaking 边界变量会被静默优化掉。

4. **Electron 主版本升级后 contextBridge 不兼容**：Quasar 的 `electron-preload.js` 模板生成后需手动维护。Electron 从 v20 开始默认关闭 `nodeIntegration`，旧模板里直接 `require('fs')` 的代码会静默失效，需迁移到 `contextBridge.exposeInMainWorld` 模式，且 IPC handler 也要对应重写。

## 适用 vs 不适用场景

**适用**：

- 中小团队需要同时覆盖 Web + 移动端 + 桌面，人力有限
- 业务逻辑较重、UI 交互复杂，想复用同一套组件库和状态管理
- 已有 Vue 3 技术栈，希望以最小迁移成本扩展到 App 端
- 需要快速 MVP：先 SPA 上线，后续按需加 SSR / PWA / Capacitor
- 企业内部工具，对 App Store 审核周期不敏感

**不适用**：

- 需要深度原生性能（3D 游戏、高帧率相机处理）——此时 Flutter 或 React Native 的原生渲染更有优势
- 多端差异极大（Web 版和 App 版几乎是两个不同产品）——共享代码比例低，Quasar 的收益消失
- 团队已深度绑定 React 生态——Quasar 锁定 Vue，不可混用
- 需要发布 tvOS / watchOS / 小程序等非主流平台——Quasar 覆盖不到

## 历史小故事（可跳过）

- **2015 年**：Razvan Stoenescu（罗马尼亚开发者）在写一个内部工具时，厌倦了同时维护 Web 版和 Cordova 版，于是抽出框架层，发布了最早的 Quasar——当时叫 Quasar App，只支持 Vue 1 + Cordova。

- **2019 年**：发布 v1，正式支持 Vue 2 + Webpack，SPA / PWA / Electron / Cordova 全部就位；SSR 模式此时仍为**实验阶段**，API 未完全稳定。社区迅速增长，Star 突破 1 万。

- **2021 年**：随 Vue 3 发布，Quasar 推出 v2——组合式 API（Composition API）支持，Capacitor 替代 Cordova 成为推荐的移动方案，TypeScript 支持大幅改善。

- **2022 年**：Quasar CLI 引入 Vite 内核（`@quasar/app-vite`），冷启动从分钟级降到秒级。Webpack 版（`@quasar/app-webpack`）继续维护，两套 CLI 并存，用户可自由选择。

- **名字来源**：quasar（类星体）是宇宙中观测到的最亮天体之一，亮度可超过整个星系。Stoenescu 选这个名字，寓意"打造最耀眼的开发体验"。GitHub 目前超过 27k Star。

## 学到什么

1. **"多端一码"的收益来自抽象层设计**：Quasar 的成功不在于某个黑魔法，而在于把构建管道、UI 组件、配置文件这三层都做到平台无关——每一层独立，切 mode 才不会牵一发动全身

2. **配置即代码**：`quasar.config.js` 把所有平台参数收进一个有版本控制的文件，比散落在多个 CI 脚本里的环境变量更易审计和回滚

3. **渐进式是关键**：Quasar 允许从 SPA 起步，后续按需叠加 SSR / PWA / 移动端，不强迫你一开始就全部打通——这让实际项目中"先跑起来再扩展"的策略可行

4. **平台差异是隐形债务**：Capacitor/Electron 版本升级带来的破坏性变化往往不在 Quasar 层而在原生层——使用跨平台框架并不能消除平台差异，只是把它延后到运维阶段

## 延伸阅读

- 官方文档：[quasar.dev — Introduction to Quasar](https://quasar.dev/introduction-to-quasar)（为什么选 Quasar，feature 全览）
- 官方文档：[quasar.dev — Quasar CLI with Vite](https://quasar.dev/quasar-cli-vite/quasar-config-file)（quasar.config.js 完整字段参考）
- GitHub：[quasarframework/quasar](https://github.com/quasarframework/quasar)（27k Star，源码和 CHANGELOG）
- [[vue]] —— Quasar 的运行时基础，组件系统和响应式全来自 Vue 3
- [[capacitor]] —— Quasar 推荐的移动端原生 bridge，替代 Cordova
- [[vite]] —— Quasar CLI Vite 版的底层构建引擎

## 关联

- [[vue]] —— Quasar 完全基于 Vue 3，Composition API 是写业务逻辑的主战场
- [[capacitor]] —— Quasar 的移动端 mode 背后是 Capacitor，负责 JS ↔ 原生 bridge
- [[react-native]] —— 同样解决跨端问题，但锁定 React、原生渲染，适合性能敏感 App
- [[flutter]] —— Dart + Skia 自绘 UI，跨端一致性最高，但学习曲线陡，与 Web 生态割裂
- [[vite]] —— Quasar CLI Vite 版的构建引擎，冷启动速度决定了开发体验
- [[webpack]] —— Quasar CLI Webpack 版的底层，生态最成熟但速度慢于 Vite

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

