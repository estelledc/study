---
title: Capacitor — 把 Web 应用装进原生 App 的运行时
来源: https://github.com/ionic-team/capacitor
日期: 2026-07-08
分类: 移动开发
难度: 中级
---

## 是什么

Capacitor 是 Ionic 团队维护的 **跨平台原生运行时**：你先用 HTML、CSS、JavaScript 做一个 Web 应用，再把它装进 iOS、Android 等原生壳里运行。

日常类比：你已经做了一家网页商店，Capacitor 像给这家店装上移动商场的门面、收银台和仓库通道。顾客看到的是 App，里面主要还是你熟悉的 Web 页面。

它不是一个新的前端框架。React、Vue、Angular、Svelte、原生 JavaScript 都可以配它用；真正的职责是：

1. 启动一个原生 App 壳
2. 在壳里放一个 WebView
3. 通过插件把相机、定位、文件、推送等原生能力交给 Web 代码调用

所以一句话记：Capacitor 解决的是“Web 应用怎么安全、稳定地住进手机 App 里”。

## 为什么重要

不理解 Capacitor，很多移动开发选择会混在一起：

- 你会分不清 “WebView 套壳” 和 “React Native 这种原生组件渲染” 到底差在哪。
- 你会误以为做 App 必须从 Swift、Kotlin 两套代码开始写。
- 你会忽略相机、文件、推送、深链这些能力其实需要原生权限和生命周期配合。
- 你会把 [[cordova]]、[[ionic-framework]]、[[react-native]]、[[tauri]] 放在同一格里比较，结论很容易跑偏。

Capacitor 的价值在于给 Web 团队一条中间路线：UI 和业务逻辑尽量复用 Web 技术，必要时再用原生插件补能力。

这条路线特别适合已有 Web 产品想快速进入应用商店，但又不想把每个页面都用原生技术重写的团队。

## 核心要点

1. **WebView 是舞台**：App 打开后，用户看到的大部分界面都由 WebView 渲染。类比：舞台布景还是网页那套，只是剧场换成了 iOS 或 Android。

2. **插件是翻译官**：Web 代码不能直接碰相机和系统相册，插件负责把 JavaScript 调用翻译成 Swift、Java 或 Kotlin。类比：你说中文，插件帮你和本地工作人员沟通。

3. **原生工程要进仓库**：Capacitor 鼓励把 `ios/`、`android/` 目录提交到版本库，而不是每次临时生成。类比：店面装修图纸要保存，不能只保存网页商品图。

4. **同步不是自动魔法**：每次 Web 构建产物变化后，需要 `cap sync` 把新文件和插件配置同步到原生工程。类比：网页仓库进了新货，也要搬到手机 App 这个门店。

5. **它偏 Web-first，不是性能银弹**：复杂动画、重 3D、极端低延迟交互仍可能需要原生或专门引擎。类比：把自行车装进货车能跑更远，但不会变成赛车。

## 实践案例

### 案例 1：把一个 Vite 应用加进 Capacitor

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add ios
npx cap add android
npm run build
npx cap sync
```

逐部分解释：

- `@capacitor/core` 是运行时代码，`@capacitor/cli` 是本地命令行工具。
- `cap init` 创建 Capacitor 配置，记录 App 名称、包名和 Web 构建目录。
- `cap add ios/android` 生成原生工程，之后可以用 Xcode 或 Android Studio 打开。
- `npm run build` 产出静态网页文件，`cap sync` 把这些文件复制进原生工程。

### 案例 2：在 Web 代码里调用相机

```ts
import { Camera, CameraResultType } from '@capacitor/camera'

const photo = await Camera.getPhoto({
  quality: 80,
  resultType: CameraResultType.Uri,
})

console.log(photo.webPath)
```

逐部分解释：

- `Camera.getPhoto` 看起来像普通 JavaScript 函数，但底层会请求系统相机或相册。
- `quality` 控制压缩质量，避免用户拍一张图就占用太多空间。
- `webPath` 可以交给 `<img>` 显示；真正的文件权限由插件和系统处理。

### 案例 3：改完前端后同步到手机工程

```bash
npm run build
npx cap copy
npx cap open ios
```

逐部分解释：

- `build` 重新生成 Web 静态资源。
- `cap copy` 只复制 Web 资源，不重新安装插件，适合普通页面改动。
- `cap open ios` 打开 Xcode，方便你在模拟器或真机上运行。

## 踩过的坑

1. **忘记同步 Web 构建产物**：浏览器里已经修好，手机里还是旧页面，多半是少跑了 `npx cap sync` 或 `npx cap copy`。

2. **把插件安装当成结束**：相机、定位、推送通常还要改 iOS 权限说明或 Android Manifest，不配置会在真机上失败。

3. **以为所有浏览器 API 都一样**：WebView 版本、系统权限、后台限制会影响行为，移动端测试不能只看桌面浏览器。

4. **把它当 React Native 替代品**：Capacitor 主要渲染 Web UI；如果目标是大量原生控件和复杂手势，[[react-native]] 或纯原生可能更合适。

5. **忽略应用商店规则**：热更新、支付、隐私权限都要符合平台政策，不能因为 UI 是 Web 写的就绕过审核。

## 适用 vs 不适用场景

**适用**：

- 已有 Web 应用，需要较快打包成 iOS / Android App。
- 团队主力是前端工程师，只在少数能力上需要原生插件。
- 表单、内容、电商、内部工具、管理后台这类 Web-first 产品。
- 需要同时支持 PWA 和移动 App，希望业务代码尽量复用。

**不适用**：

- 重度依赖原生控件、复杂手势和平台专属交互的 App。
- 高帧率游戏、AR、音视频实时处理等对渲染延迟极敏感的场景。
- 团队没有任何原生调试能力，却要深度接入推送、支付、蓝牙等系统能力。
- 期望“一次打包永远不用管 iOS / Android 差异”的项目。

## 历史小故事（可跳过）

- **2009 年前后**：PhoneGap / Cordova 让 WebView 打包 App 变成常见路线，但插件和工程管理逐渐显得老旧。
- **2013 年后**：Ionic Framework 流行起来，很多团队用 Web 技术写移动界面，再借 Cordova 进 App Store。
- **2018 年**：Ionic 团队推出 Capacitor，希望用更现代的插件模型和原生工程管理方式替代 Cordova 的老包袱。
- **2020 年后**：Capacitor 逐渐成为 Ionic 生态默认运行时，也被许多非 Ionic 项目单独采用。
- **当前文档**：官方文档显示 v8，定位仍是 “Cross-platform Native Runtime for Web Apps”。

## 学到什么

1. Capacitor 的本质不是 UI 框架，而是 Web 应用和原生系统之间的运行时桥梁。
2. WebView 负责显示页面，插件负责访问系统能力，原生工程负责被应用商店接受。
3. 它把 Web 团队带进移动端，但不会消除权限、生命周期、审核和真机差异。
4. 选型时要先问“我们能接受 WebView 的交互和性能边界吗”，再比较开发效率。
5. 与 [[cordova]] 的关系像一次现代化重写：保留 Web-first 思路，改进插件和工程体验。

## 延伸阅读

- 仓库：[ionic-team/capacitor](https://github.com/ionic-team/capacitor)
- 官方文档：[Capacitor Documentation](https://capacitorjs.com/docs)
- 插件文档：[Capacitor Plugins](https://capacitorjs.com/docs/apis)
- [[ionic-framework]] —— 常和 Capacitor 搭配使用的移动 UI 组件体系
- [[cordova]] —— 更早的 WebView 打包路线，对比能看出 Capacitor 的改进动机
- [[react-native]] —— 另一条跨平台路线，用 JavaScript 驱动原生组件

## 关联

- [[ionic-framework]] —— Ionic 负责 UI 组件，Capacitor 负责进入原生 App 壳。
- [[cordova]] —— Capacitor 的历史参照，很多插件生态概念从这里延续而来。
- [[react-native]] —— 同样跨平台，但渲染模型和性能边界不同。
- [[expo]] —— React Native 生态里的“工具链 + 原生能力”封装，对比 Capacitor 很有用。
- [[tauri]] —— 桌面端的 Web + 原生壳路线，思路和移动端 Capacitor 相近。
- [[vite]] —— 常见的 Web 构建入口，产物可被 Capacitor 同步进原生工程。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
