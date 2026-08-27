---
title: Capacitor — 把 Web 应用装进原生 App 的运行时
来源: https://github.com/ionic-team/capacitor
日期: 2026-08-27
分类: 移动开发
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/ionic-team/capacitor
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3ab4139bd0b8863cadcb175180ea941f4c244f08
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.5.0
---

## 是什么

Capacitor 是 Ionic 团队维护的 **跨平台原生运行时**：Web 应用跑在 iOS / Android WebView 里，JavaScript 通过插件桥调用原生 SDK。日常类比：你先开一家网页店，再给店面装上门牌、收银台和仓库通道；顾客看到的是 App，货架上主要还是那套网页。

它不是 UI 框架。React、Vue、Angular 或裸 JS 都能配它。固定 `8.5.0` 的仓库是 monorepo，四个 workspace 包同号：`@capacitor/core`、`@capacitor/cli`（要求 Node `>=22`）、`@capacitor/ios`、`@capacitor/android`。

```ts
import { Capacitor, CapacitorHttp } from '@capacitor/core'

const platform = Capacitor.getPlatform()
const res = await CapacitorHttp.get({ url: 'https://example.com/health' })
```

`CapacitorHttp` 是 core 自带插件。相机、文件系统这类官方插件在独立的 `capacitor-plugins` 仓，不在本固定提交里。

## 为什么重要

不理解这层桥，下面几件事会对不上：

- 为什么浏览器里改好了、手机里还是旧页面
- 为什么 `npx cap add ios` 在没装 `@capacitor/ios` 时会直接失败
- 为什么 `Camera.getPhoto` 不能当成 `@capacitor/core` 的 API
- 为什么 WebView 套壳和 [[react-native]] 的原生控件渲染不是同一条路

## 核心架构与流程

固定提交可以拆成五步：

1. **原生壳先启动 WebView**：用户看见的界面主要是网页。`WebView` 插件负责改 server base path；热更新路径不在本次静态阅读范围内。

2. **`registerPlugin` 是翻译台**：`createCapacitor` 给每个插件名挂一个 `Proxy`。原生侧先注入 `PluginHeaders`；方法标了 `rtype === 'promise'` 就走 `nativePromise`，否则走 `nativeCallback`。没有 header、也没有当前平台的 JS 实现时，抛 `CapacitorException` / `Unimplemented`。重复注册只会警告并返回旧 proxy。

3. **`nativePromise` 只是一层 Promise**：`native-bridge.ts` 里它 `new Promise`，再 `toNative(pluginName, methodName, options, { resolve, reject })`。真正的平台通道在 iOS `JSExport.swift` / Android `JSExport.java` 生成的注入脚本里。

4. **core 只带四个插件**：`WebView`、`CapacitorCookies`、`CapacitorHttp`、`SystemBars`（`@since 8.0.0`）。Web 上 `CapacitorHttpPluginWeb.request` 用 `fetch` + `buildRequestInit`；原生上同一方法名打到 native HTTP。`SystemBars` 的 web 实现直接 `unavailable`。

5. **CLI 把网页搬进原生工程**：`cap sync` 等于 `copy` 再 `update`。`copy` 把 `webDir` 整目录覆盖进 iOS / Android 的 web 目录，并写出 `capacitor.config.json`；`update` 再跑 `updateIOS` / `updateAndroid` 装插件。只改页面用 `cap copy`；改了原生插件依赖才需要完整 sync。

## 实践示例

### 案例 1：初始化并加上 Android 平台

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npm install @capacitor/android
npx cap add android
npm run build
npx cap sync
```

`cap add` 会先 `checkCapacitorPlatform`：找不到 `@capacitor/android`（或 iOS 的 `@capacitor/ios`）就退出，提示先 `npm install @capacitor/<platform>`。平台目录已存在时会拒绝覆盖。web 目录缺失时仍能 add，但会警告 sync 没跑。

### 案例 2：用 core 自带的 HTTP 插件

```ts
import { CapacitorHttp } from '@capacitor/core'

const response = await CapacitorHttp.post({
  url: 'https://example.com/api',
  headers: { 'content-type': 'application/json' },
  data: { ok: true },
})
```

Web 实现把对象 body `JSON.stringify` 后交给 `fetch`。Android / iOS 上 `data` 只能是 string 或 JSON；`FormData` / `Blob` 只在 web，或打开 config 里的 `CapacitorHttp` 去补丁 `window.fetch`。这是类型注释写明的边界，不是推测。

### 案例 3：改完前端只复制资源

```bash
npm run build
npx cap copy
npx cap open ios
```

`copy` 会 `remove` 目标 web 目录再整份复制，并重写原生侧 `capacitor.config.json`（会删掉 android/ios `buildOptions`）。设了 `server.url` 且本地 `webDir` 不存在时，copy 只警告、不失败。

## 踩过的坑

1. **只跑 `cap add ios` 不装包**：8.5.0 CLI 要求先 `npm install @capacitor/ios`。
2. **把 Camera 写成 core API**：本仓没有 `@capacitor/camera`。要另装官方插件仓。
3. **改完网页忘了 copy/sync**：浏览器新、真机旧，多半是 `webDir` 没覆盖进原生工程。
4. **以为 `sync` 只复制静态文件**：它还会 `update` 原生插件绑定；反过来，只改 HTML/CSS/JS 时 `copy` 就够。
5. **把 CLI 的 Node 下限当成 18**：固定 CLI `engines.node` 是 `>=22.0.0`。

## 适用 vs 不适用场景

**适用**：

- 已有 Web 应用，要进 iOS / Android 商店，并能接受 WebView 渲染
- 团队主力是前端，只需少量原生能力，且能维护 `ios/`、`android/` 源码目录
- 同时做 PWA 和 App，希望业务代码复用

**不适用**：

- 大量原生控件、复杂手势，或把 [[react-native]] 当“换壳”就能替代
- 高帧率游戏、AR、实时音视频——本文未测延迟，不能替你下性能结论
- 没有任何原生调试能力，却要深接推送、支付、蓝牙
- 把未绑定的商店热更新或审核策略写成 Capacitor 合同

## 固定版本边界

- 本文绑定 `ionic-team/capacitor@3ab4139bd0b8863cadcb175180ea941f4c244f08`，发布 tag `8.5.0`；npm `gitHead` 与 annotated tag peel 一致。
- 相机、文件系统、推送等官方插件不在本仓，行为以各自仓库的固定提交为准。
- 未安装依赖、未跑 Xcode / Gradle / 真机、未测热更新，状态保持 `UNVERIFIED`。

## 学到什么

1. **Capacitor 是桥，不是 UI 框架**——舞台是 WebView，台词靠插件 header。
2. **core 插件清单很短**——HTTP / Cookie / SystemBars / WebView 才在 `@capacitor/core`。
3. **sync = copy + update**——复制网页和更新原生依赖是两步。
4. **平台包是独立 npm 依赖**——`cap add` 不会替你下载 `@capacitor/ios`。

## 应用型自测

1. 只执行 `npx cap add ios`、项目里没有 `@capacitor/ios`，8.5.0 CLI 会怎样？
2. `import { Camera } from '@capacitor/core'` 在本固定提交里成立吗？
3. 只改了一个 HTML 文案，必须跑完整 `cap sync` 吗？

检查点：

1. 会失败。`checkCapacitorPlatform` 要求先安装 `@capacitor/ios`。
2. 不成立。本仓 core 没有 Camera；要另装官方插件。
3. 不必。`cap copy` 只覆盖 web 资源；改插件依赖才需要 `update` / `sync`。

## 延伸阅读

- 官方文档：[capacitorjs.com/docs](https://capacitorjs.com/docs)
- 固定源码：[ionic-team/capacitor](https://github.com/ionic-team/capacitor) —— 本文绑定提交 `3ab4139bd0b8863cadcb175180ea941f4c244f08`
- [[ionic-framework]] —— 常搭配的移动 UI 组件
- [[cordova]] —— 更早的 WebView 打包路线
- [[react-native]] —— JS 驱动原生控件的对照路线

## 关联

- [[ionic-framework]] —— Ionic 负责 UI，Capacitor 负责进原生壳
- [[cordova]] —— 历史参照，插件生态概念从这里延续
- [[react-native]] —— 同样跨平台，渲染模型不同
- [[expo]] —— React Native 生态里的工具链对照
- [[tauri]] —— 桌面端 Web + 原生壳
- [[vite]] —— 常见 Web 构建入口，产物可被 `cap copy` 同步

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cordova]] —— Cordova — 用 Web 技术打包移动 App 的老牌桥梁
- [[electron]] —— Electron — 用网页技术做跨平台桌面应用
- [[ionic-framework]] —— Ionic Framework — 用网页技术做跨端 App 的 UI 工具箱
- [[nativescript]] —— NativeScript — 用 JS/TS 直接驱动原生控件
- [[quasar]] —— Quasar Framework — 一套代码跑 Vue 全端的应用框架
- [[tauri]] —— Tauri — 用系统浏览器内核 + Rust 做轻量桌面应用
