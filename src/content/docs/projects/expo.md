---
title: Expo — 面向 React Native 的“开箱即用”应用生产线
description: 介绍 Expo SDK 57 如何用 config → prebuild/CNG、JSI 模块注册和 runtimeVersion 把开发、原生工程与 OTA 更新拆开。
来源: https://github.com/expo/expo
日期: 2026-08-27
分类: 移动开发
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/expo/expo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c300d2cc60c9e684e64f48d9bc90ea18a571d01d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 57.0.17
---

## 是什么

Expo 是围绕 [[react-native]] 的 **SDK + CLI + 配置驱动原生工程** 工具链。日常类比：不是另做一套渲染引擎，而是把“菜单、后厨设备和出餐口”先约定好——JS 业务走 Metro，原生壳由配置生成，模块按名字从运行时取。

固定 `expo@57.0.17` 的 JS 入口很薄：`packages/expo/src/Expo.ts` 再导出 `registerRootComponent`、`isRunningInExpoGo`，以及 `expo-modules-core` 的 `requireNativeModule` / `NativeModule`。真正启动开发服务器、prebuild 和 export 的是 `@expo/cli`（`bin/cli` 只做 `require('@expo/cli')`）。

它不是 [[ionic-framework]] 那种 Web 组件 UI 箱，也不替代 RN 的视图层。Expo Go、development build 和生产包是三种不同的原生容器。

## 为什么重要

不理解这层拆分，下面这些现象会对不上号：

- 为什么 `expo start` 能扫码跑起来，换一个相机插件却在 Expo Go 里报找不到原生模块
- 为什么改了 `app.json` 的权限 / scheme 之后，必须重新生成 `ios/` `android/`，而不是只热更新 JS
- 为什么 EAS Update 能换 JS 包，却换不了新的原生模块
- 为什么同一份业务代码，Go / dev client / 商店包看到的 `channel` 不一样

相对 Ionic：Expo 画的是 RN 原生视图，用配置生成原生工程；Ionic 画的是 Web Components，原生能力另走 [[capacitor]]。

## 核心机制与架构流程

固定源码把交付拆成五段：

1. **配置先于原生工程**。`@expo/config` 的 `getConfig` 读动态文件 `app.config.{ts,mts,cts,mjs,cjs,js}`，静态文件是 `app.config.json` 或 `app.json`。动态配置存在时覆盖静态文件，再合并 `package.json` 默认值，并把 `plugins` 数组解析成 config plugin。

2. **`expo prebuild` 是模板拷贝 + 插件编译**。CLI 帮助写明：默认重建原生目录；`--no-clean` 才“在已有 native 文件夹上改”。模板来自 `expo` 包装的 `template.tgz`，随后 `configureProjectAsync` 用 `@expo/prebuild-config` 的默认插件（图标、scheme、bundle id、updates 等）加上项目自己的 `plugins`，经 `compileModsAsync` 改 Info.plist / AndroidManifest / Gradle。手改原生文件、又不写回 config，下次生成会被盖掉。这就是 Continuous Native Generation（CNG）。

3. **应用入口永远登记 `'main'`**。`registerRootComponent` 调用 `AppRegistry.registerComponent('main', ...)`；Web 再 `runApplication`，根节点必须是 `#root`。Expo Router 的 `entry-classic.js` 先加载 `@expo/metro-runtime`，再走同一条 `registerRootComponent`。`app/` 目录由 `require.context` 扫出路由；`(tabs)` 这类括号目录是 **route group**，不出现在 URL 里。

4. **原生模块按名字解析，JSI 优先**。`requireNativeModule` 依次看 `globalThis.expo.modules[name]`、bridge 上的 `NativeModulesProxy`、再尝试 `TurboModuleRegistry`。`isRunningInExpoGo()` 只判断能不能 `requireNativeModule('ExpoGo')`——Go 是一份固定预编译的原生集合，不是“你的生产包”。

5. **OTA 只换 JS / 资源，不换原生**。`expo-updates` 的 `channel` 在 **Expo Go 和 development build 里恒为 `null`**；生产包才在构建期写入渠道。`runtimeVersion` 可以是字符串，或 `{ policy: 'fingerprint' | 'nativeVersion' | 'appVersion' | ... }`。渠道不匹配或 runtime 对不上的更新会被拒。`Updates.reloadAsync()` 切到最近下载的 update；`reloadAppAsync()` 只重载当前包。

## 实践案例

### 案例 1：登记根组件，而不是自己 invent 一个 RN 入口名

```js
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
```

**逐部分**：

- 固定源码把组件注册成 `'main'`；模板的 `AppEntry.js` 也走这里
- 非 production 会再包一层 devtools，并检查 `expo-updates` / Web 上的 `react-native-web` 别名
- Expo Router 项目把 `main` 指到 `expo-router/entry`，不要同时再写一份互相覆盖的入口

### 案例 2：用 config plugin 表达“要进原生工程的东西”

```json
{
  "expo": {
    "name": "Demo",
    "slug": "demo",
    "scheme": "demo",
    "plugins": ["expo-camera"]
  }
}
```

```bash
npx expo prebuild --platform android
```

**逐部分**：

- `plugins` 在 `getConfig` 阶段就被解析；prebuild 才把它们编译进原生文件
- 默认会重建 native 目录；只想补丁已有工程时才加 `--no-clean`
- 相机权限、scheme 这类字段属于原生合同，不能指望只推 OTA

### 案例 3：分清三种启动目标

```bash
npx expo start --go
npx expo start --dev-client
```

`expo start` 默认 Metro 端口 **8081**、host **lan**。`--go` 进 Expo Go；`--dev-client` 进带 `EXDevLauncher` 的自定义原生应用。生产包再另走 EAS / 本地 `expo prebuild` + 原生构建。三种容器的模块集合和 `channel` 合同不同。

## 踩过的坑

1. **把 Expo Go 当成生产包**：Go 里没有的原生模块会直接 `Cannot find native module`；固定错误文案会提示改用 development build。
2. **手改 `ios/` / `android/` 却继续 `prebuild`**：CNG 按 config 重写。要保留的改动必须做成 config plugin，或显式 `--no-clean` 并接受漏网风险。
3. **把 JS 热修和原生变更走同一条发布**：`expo-updates` 只配送 JS bundle / 图片字体等资源；新原生模块、权限、SDK 大版本必须打新二进制。
4. **在 `__DEV__` / Go 里测 `channel` 或 `checkForUpdateAsync`**：源码写明这些环境 `channel` 为 `null`，更新 API 会拒绝。
5. **把 monorepo 补丁号当成“同一发布树”**：本提交里 `expo` / `expo-router` 是 `57.0.17`，`expo-updates` 是 `57.0.18`，`@expo/cli` 是 `57.0.19`，`expo-modules-core` 是 `57.0.14`。都在 SDK 57 线，但不是同一个 package 版本号。

## 适用 vs 不适用场景

**适用**：

- 以 React Native 视图为主，希望用一份 Expo config 收敛 iOS / Android / Web 工程
- 原生定制主要落在 Expo 模块和 config plugin 能表达的范围
- 能接受 Go 只做预览，生产走 development build / prebuild
- 需要把 OTA 限制在“与当前 `runtimeVersion` 兼容的 JS/资源”

**不适用**：

- 必须深度改 RN 渲染管线或长期手维护整个 `ios/` `android/`，又拒绝 CNG
- 团队主技能是 Web Components / CSS，目标是 PWA + WebView 壳——对照 [[ionic-framework]] + [[capacitor]]
- 不能接受 Metro / Hermes / EAS 这条发布链
- 要把未验证的包体、启动时间或“商店审核一定过”写成结论——本页没有这些测量

## 固定版本边界

- 本文绑定 `expo/expo@c300d2cc60c9e684e64f48d9bc90ea18a571d01d`，即 npm `expo@57.0.17` 的可达 `gitHead`（提交说明为 “Publish packages”）。GitHub 上未见与该补丁一一对应的 release tag。
- 同提交：`expo-router@57.0.17`、`expo-updates@57.0.18`、`@expo/cli@57.0.19`、`@expo/prebuild-config@57.0.15`、`expo-modules-core@57.0.14`、`@expo/config@57.0.9`。
- `expo` 包的 `bin.expo` 转到 `@expo/cli`；`expo-updates` 只是 `expo` 的 devDependency，不会随核心 SDK 自动进生产依赖。
- 动态 config 扩展名以 `@expo/config` 源码为准；不要把旧教程里的单一 `app.json` 当成唯一入口。
- 本文未安装依赖、未跑 Metro / prebuild / EAS / 真机，状态保持 `UNVERIFIED`。

## 学到什么

1. **Expo 的产品是“约定好的原生容器 + JS SDK”**，不是另一个 UI 框架。
2. **Config 是原生工程的源**；prebuild 只是把它编译进磁盘上的 Xcode / Gradle 工程。
3. **模块能不能用，取决于当前这个二进制里有没有注册上**——Go、dev client、商店包三份清单。
4. **OTA 的门闩是 `runtimeVersion`，渠道只存在于生产构建**。

## 应用型自测

1. `isRunningInExpoGo()` 看的是环境变量，还是能不能加载名为 `ExpoGo` 的原生模块？
2. `npx expo prebuild` 默认会保留你昨天手改的 `Info.plist` 吗？
3. 在 Expo Go 里读 `Updates.channel`，按固定源码会得到渠道名还是 `null`？

检查点：

1. 后者。它 `try requireNativeModule('ExpoGo')`，失败就当不在 Go。
2. 不会。默认重建 native 目录；要在已有目录上打补丁才用 `--no-clean`。
3. `null`。Go 和 development build 不写入生产 `channel`。

## 延伸阅读

- 官方文档：[Expo Docs](https://docs.expo.dev)
- 固定源码：[expo/expo](https://github.com/expo/expo) —— 本文绑定提交 `c300d2cc60c9e684e64f48d9bc90ea18a571d01d`
- [[react-native]] —— Expo 底下的视图与桥
- [[ionic-framework]] —— Web 组件 + 可选原生壳的对照路线
- [[eas-update]] —— 生产 OTA 渠道与回滚（本页只读了 `expo-updates` 客户端合同）

## 关联

- [[react-native]] —— 视图层与 `AppRegistry` 登记名 `'main'`
- [[expo-router]] —— 同提交的文件路由，入口仍回到 `registerRootComponent`
- [[eas-build]] —— 云端签包；本页未执行
- [[eas-update]] —— 与 `runtimeVersion` / `channel` 配对的发布面
- [[ionic-framework]] —— 另一条跨端路线：Web UI 而不是 RN 视图
- [[hermes]] —— 许多 Expo 生产包使用的 JS 引擎，本页未测字节码
- [[capacitor]] —— Ionic 侧的原生桥，问题同构但栈不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 把 Web 应用装进原生 App 的运行时
- [[hermes]] —— Hermes — Facebook 的 React Native JS 引擎
- [[ionic-framework]] —— Ionic Framework — 用网页技术做跨端 App 的 UI 工具箱
- [[nativescript]] —— NativeScript — 用 JS/TS 直接驱动原生控件
- [[react-native]] —— React Native — 一套代码跑多端的跨端运行时
