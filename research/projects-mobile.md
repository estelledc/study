---
title: 移动 / 跨平台开发 项目候选池
description: 60 个候选 · 已规避 atlas 现有 159 slug · stars ≥ 1k
status: 候选池
created: 2026-05-29
---

# 移动 / 跨平台开发 项目候选池

> 为 study 站扩"移动 / 跨平台开发"主题。当前 atlas 159 个 projects 中**移动/跨平台几乎为零**——只有 react / vue / svelte / solid 这种纯 Web UI 框架，没有 Flutter / RN / Electron / Tauri / 小程序 / Native iOS / Android 这一整条主线。
>
> 本文件 = 候选池 60 条，已规避 159 个现有 slug。

## 总览

- **总数**：60 个
- **stars 门槛**：≥ 1k（多数 >5k，核心几个 >50k）
- **挑选维度**：跨平台框架 / 移动构建工具 / 桌面跨平台 / 小程序框架 / Hybrid，单一独立工程，能写 130-200 行入门词条
- **去重确认**：与 atlas 159 slug 全部互斥（详见尾节）

### 子类分布

| 子类 | 数量 |
|---|---:|
| [跨端 UI 框架（核心）](#1-跨端-ui-框架核心) | 8 |
| [桌面跨平台](#2-桌面跨平台) | 7 |
| [Flutter 生态](#3-flutter-生态) | 5 |
| [React Native 扩展](#4-react-native-扩展) | 7 |
| [多端 / 小程序框架](#5-多端--小程序框架) | 6 |
| [iOS / Swift 工具](#6-ios--swift-工具) | 4 |
| [Android 工具](#7-android-工具) | 6 |
| [跨端发布 / DevTools](#8-跨端发布--devtools) | 4 |
| [移动测试 / E2E](#9-移动测试--e2e) | 4 |
| [游戏跨平台引擎](#10-游戏跨平台引擎) | 4 |
| [AR/VR / PWA](#11-arvr--pwa) | 5 |

---

## 1. 跨端 UI 框架（核心）

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| flutter | flutter | 165k | Google 的 Dart 跨平台 UI 框架，自带 Skia 渲染层、不走 webview 也不走原生组件桥 | https://github.com/flutter/flutter |
| react-native | react-native | 118k | Meta 的 JS 跨平台框架，用 React 写、桥接原生组件，新架构走 Fabric + JSI | https://github.com/facebook/react-native |
| ionic-framework | ionic-framework | 51k | Web 技术（HTML/CSS/JS）打包成移动 app，主打 PWA + Web Components | https://github.com/ionic-team/ionic-framework |
| capacitor | capacitor | 12k | Ionic 团队的现代 native bridge，替代 cordova 成 web → 原生新标准 | https://github.com/ionic-team/capacitor |
| cordova | cordova | 5k | Apache 老牌 hybrid 框架，PhoneGap 的开源继承者（理解 webview 桥的鼻祖） | https://github.com/apache/cordova |
| nativescript | nativescript | 25k | JS/TS 直接调原生 API，无 webview 也无 React，UI 用 XML 描述 | https://github.com/NativeScript/NativeScript |
| quasar | quasar | 25k | Vue 全平台框架（SPA / SSR / PWA / Electron / 移动 app 一套代码） | https://github.com/quasarframework/quasar |
| expo | expo | 33k | RN 的"开箱即用"工具链 + 云构建 + OTA 更新，事实上的 RN 现代入口 | https://github.com/expo/expo |

---

## 2. 桌面跨平台

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| electron | electron | 115k | Chromium + Node.js 桌面框架，VSCode / Slack / Discord 的底层 | https://github.com/electron/electron |
| tauri | tauri | 84k | Rust 写的 Electron 替代，用系统 webview + 单二进制（10MB vs Electron 100MB） | https://github.com/tauri-apps/tauri |
| wails | wails | 26k | Go + Web 桌面框架，类似 Tauri 但后端是 Go | https://github.com/wailsapp/wails |
| nodegui | nodegui | 9k | Qt 5 + Node.js 桌面框架，CSS 样式 + 原生组件（无 webview） | https://github.com/nodegui/nodegui |
| neutralinojs | neutralinojs | 9k | 极简轻量桌面框架，单二进制 < 2MB（系统 webview + 自家 IPC） | https://github.com/neutralinojs/neutralinojs |
| electron-builder | electron-builder | 14k | Electron 打包发布事实标准（autoupdate / 签名 / 多平台 installer） | https://github.com/electron-userland/electron-builder |
| electron-forge | electron-forge | 7k | Electron 官方脚手架 + 打包工具（替代 builder 的官方答案） | https://github.com/electron/forge |

---

## 3. Flutter 生态

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| flutter-rust-bridge | flutter-rust-bridge | 5k | Dart ↔ Rust FFI 代码生成器，让 Flutter 调 Rust 像调本地函数 | https://github.com/fzyzcjy/flutter_rust_bridge |
| flame | flame | 9k | Flutter 上的 2D 游戏引擎，组件树 + ECS + 物理引擎 | https://github.com/flame-engine/flame |
| flutter-quill | flutter-quill | 3k | Flutter 富文本编辑器，移植自 Web 的 Quill.js（Delta 格式） | https://github.com/singerdmx/flutter-quill |
| fvm | fvm | 5k | Flutter 多版本管理器（类似 nvm，按项目锁 SDK 版本） | https://github.com/leoafarias/fvm |
| flutterfire | flutterfire | 9k | Firebase 官方 Flutter SDK monorepo（Auth / Firestore / Cloud Messaging 全套） | https://github.com/firebase/flutterfire |

---

## 4. React Native 扩展

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| react-native-web | react-native-web | 22k | RN 渲染到 Web（一套代码 iOS / Android / Web 三端，twitter.com 用此） | https://github.com/necolas/react-native-web |
| react-native-windows | react-native-windows | 17k | 微软维护的 RN Windows / UWP 端 | https://github.com/microsoft/react-native-windows |
| react-native-macos | react-native-macos | 17k | 微软维护的 RN macOS 端，与 windows 共享 fabric 实现 | https://github.com/microsoft/react-native-macos |
| react-native-paper | react-native-paper | 13k | Material Design 风格的 RN UI 组件库（Callstack 维护） | https://github.com/callstack/react-native-paper |
| nativewind | nativewind | 6k | Tailwind CSS for RN（通过 babel 转 className → StyleSheet） | https://github.com/nativewind/nativewind |
| tamagui | tamagui | 14k | 跨 React + RN UI 框架，编译时静态优化样式（atomic CSS + StyleSheet） | https://github.com/tamagui/tamagui |
| native-base | native-base | 21k | RN UI 库（pre-tamagui 时代主流），跨平台主题系统 | https://github.com/GeekyAnts/NativeBase |

---

## 5. 多端 / 小程序框架

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| taro | taro | 36k | 京东多端框架（React/Vue → 微信小程序 / H5 / RN / 支付宝小程序 / 抖音小程序） | https://github.com/NervJS/taro |
| uni-app | uni-app | 40k | DCloud 多端框架（Vue → 6 大小程序 + H5 + iOS/Android APP） | https://github.com/dcloudio/uni-app |
| kbone | kbone | 5k | 腾讯出品，让 Web 框架（Vue/React）的代码跑在微信小程序里 | https://github.com/Tencent/kbone |
| chameleon | chameleon | 8k | 滴滴多端统一开发框架，自家 DSL 编译到 Web / 小程序 / Weex | https://github.com/didi/chameleon |
| mpvue | mpvue | 美团出品的 Vue → 微信小程序编译器（仅维护，但作为案例研究价值高） | 21k | https://github.com/Meituan-Dianping/mpvue |
| remax | remax | 6k | 阿里出品 React → 小程序（不写自家 DSL，直接复用 React 运行时） | https://github.com/remaxjs/remax |

---

## 6. iOS / Swift 工具

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| swift-collections | swift-collections | 4k | Apple 官方 Swift 数据结构补充包（Deque / OrderedSet / OrderedDictionary） | https://github.com/apple/swift-collections |
| swift-nio | swift-nio | 8k | Apple 的 Swift 异步事件驱动网络框架（对标 Netty） | https://github.com/apple/swift-nio |
| vapor | vapor | 25k | Swift 的 Web 后端框架（基于 SwiftNIO，Express / Fastify 风格） | https://github.com/vapor/vapor |
| swiftui-introspect | swiftui-introspect | 5k | 让 SwiftUI 视图能访问底层 UIKit / AppKit 对象（绕开 SwiftUI 黑盒） | https://github.com/siteline/SwiftUI-Introspect |

---

## 7. Android 工具

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| retrofit | retrofit | 43k | Square 出品 Android HTTP 客户端，注解 + 接口 → 自动生成 OkHttp 调用 | https://github.com/square/retrofit |
| okhttp | okhttp | 46k | Square 出品 HTTP 客户端，Android 网络层事实标准（连接池 / HTTP/2） | https://github.com/square/okhttp |
| coil | coil | 11k | Compose 优先的 Kotlin 图片加载库（kotlinx coroutines + OkHttp） | https://github.com/coil-kt/coil |
| glide | glide | 35k | Bumptech 的 Android 图片加载库（老牌主流，缓存 + 内存优化） | https://github.com/bumptech/glide |
| accompanist | accompanist | 8k | Google 出品 Compose 工具集（permissions / pager / system-ui 等） | https://github.com/google/accompanist |
| jetpack-compose-samples | jetpack-compose-samples | 21k | Google 官方 Compose 样例集合（Crane / Jetnews / Jetchat 三大教学样本） | https://github.com/android/compose-samples |

---

## 8. 跨端发布 / DevTools

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| fastlane | fastlane | 40k | iOS / Android 自动化发布事实标准（截图 / 签名 / TestFlight / Play 提交） | https://github.com/fastlane/fastlane |
| metro | metro | 5k | RN 官方 JS bundler（替代 webpack 优化 RN 增量构建 / HMR） | https://github.com/facebook/metro |
| react-native-builder-bob | react-native-builder-bob | 2k | RN 库构建工具（Callstack 出品，npm 包含 commonjs/esm/d.ts 多产物） | https://github.com/callstack/react-native-builder-bob |
| flipper | flipper | 13k | Meta 出品移动调试器（Network / Layout / Logs / Plugin 架构） | https://github.com/facebook/flipper |

---

## 9. 移动测试 / E2E

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| detox | detox | 11k | Wix 出品 RN E2E 测试框架（灰盒，能感知 RN 内部状态） | https://github.com/wix/Detox |
| appium | appium | 19k | 跨平台移动 UI 自动化（iOS / Android / Web，WebDriver 协议） | https://github.com/appium/appium |
| maestro | maestro | 17k | Mobile.dev 出品声明式移动 E2E（YAML 写流程，自然语言级简单） | https://github.com/mobile-dev-inc/maestro |
| webdriverio | webdriverio | 9k | Node.js WebDriver 实现，桌面浏览器 + 移动 / 桌面 app 全覆盖 | https://github.com/webdriverio/webdriverio |

---

## 10. 游戏跨平台引擎

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| godot | godot | 开源跨平台游戏引擎（C++ 内核 + GDScript），Unity 替代第一名 | 95k | https://github.com/godotengine/godot |
| cocos2d-x | cocos2d-x | C++ 跨平台游戏引擎，国内手游半壁江山的底层 | 18k | https://github.com/cocos2d/cocos2d-x |
| phaser | phaser | HTML5 2D 游戏框架（Canvas / WebGL，浏览器游戏事实标准） | 38k | https://github.com/phaserjs/phaser |
| playcanvas | playcanvas | WebGL 3D 游戏引擎（在线 IDE + 协作，Snap AR 用此） | 10k | https://github.com/playcanvas/engine |

---

## 11. AR/VR / PWA

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| aframe | aframe | Mozilla 系出身 Web VR/AR 框架（HTML 标签写 3D 场景，three.js 包装） | 17k | https://github.com/aframevr/aframe |
| ar-js | ar-js | 移动浏览器轻量 AR（marker / image / location，无需 app） | 16k | https://github.com/AR-js-org/AR.js |
| mind-ar-js | mind-ar-js | 浏览器内图像追踪 / 人脸追踪 AR，纯 Web 不需 app | 4k | https://github.com/hiukim/mind-ar-js |
| workbox | workbox | 12k | Google 出品 PWA Service Worker 工具集（缓存策略 / 后台同步 / 推送） | https://github.com/GoogleChrome/workbox |
| pwa-builder | pwa-builder | 3k | Microsoft 出品 PWA 一键打包成 iOS / Android / Windows app 的工具 | https://github.com/pwa-builder/PWABuilder |

---

## 与现有 atlas 的去重确认

已扫过 159 个现有 slug，本文件 60 个候选**全部互斥**。

现有 atlas 中**移动 / 跨平台相关的全部存货**（仅 0 个真正跨端框架）：

- Web UI 框架类：react / vue / svelte / solid（**纯 Web，没有 RN / Flutter**）
- 编辑器类：codemirror / monaco-editor / lexical / prosemirror（**桌面端，但不是跨平台框架**）
- 浏览器自动化：playwright / patchright / stagehand / steel-browser（**Web 自动化，不含 appium / detox / maestro**）
- 桌面端：affine / excalidraw / penpot（**应用，不含 electron / tauri 框架本体**）

本文件 60 个候选填补的**全空白主题**：

- 跨端 UI 框架（flutter / react-native / capacitor / quasar 等 8 个）
- 桌面跨平台（electron / tauri / wails 等 7 个）
- 小程序多端（taro / uni-app / kbone 等 6 个）
- 原生 iOS（swift-nio / vapor 等 4 个）
- 原生 Android（retrofit / okhttp / glide 等 6 个）
- 移动 E2E（detox / appium / maestro 等 4 个）
- 跨端游戏（godot / phaser / cocos2d-x 等 4 个）
- AR/VR / PWA（aframe / workbox 等 5 个）

## 备注

- stars 数为 2026/05 前后估算，前后浮动 < 10%
- 闭源 / 商业项目（Xamarin / Realm Sync 服务端等）已跳过；MongoDB 收购的 Realm Core 客户端 SDK 因 archived 不入选
- mpvue 虽 archived 但作为"中国厂商首批多端编译器"案例仍有教学价值
- 如需进一步压缩到 30 / 40，建议优先保留 ★ ≥ 20k 且类别覆盖广的：flutter / react-native / electron / tauri / expo / quasar / nativescript / ionic-framework / wails / taro / uni-app / mpvue / native-base / react-native-web / godot / phaser / fastlane / appium / retrofit / okhttp / glide / jetpack-compose-samples / vapor / swift-nio / cordova / cocos2d-x / aframe / ar-js / workbox（共 29 个核心）
