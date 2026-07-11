---
title: Cordova — 用 Web 技术打包移动 App 的老牌桥梁
来源: https://github.com/apache/cordova
日期: 2026-07-08
分类: 移动开发
难度: 中级
---

## 是什么

Cordova 是一套把 **HTML、CSS、JavaScript 应用装进手机 App 壳里**的老牌工具链。日常类比：你已经会做网页，Cordova 像一个移动端集装箱，把网页放进 WebView，再给它接上相机、定位、文件系统这些手机能力。

用户在手机上看到的是 App 图标、启动页和全屏界面；开发者主要写的仍然是 Web 页面。中间的关键部件有三个：

1. **WebView**：负责显示网页界面。
2. **插件**：负责把 JavaScript 调用翻译成原生 API。
3. **平台工程**：负责生成 Android / iOS 可构建的项目。

一句话记住：Cordova 不是新的 UI 框架，而是“让 Web 应用住进原生 App 壳里”的桥梁。

## 为什么重要

不理解 Cordova，很多跨平台移动开发选择会混在一起：

- 你会分不清 WebView 套壳、[[react-native]] 原生组件渲染、[[flutter]] 自绘 UI 的差别。
- 你会误以为“能调用相机”只是浏览器权限问题，其实常常需要原生插件参与。
- 你会看不懂为什么 [[capacitor]] 经常被说成 Cordova 的现代化替代，而不是完全无关的新工具。
- 你会低估移动端生命周期、权限、应用商店审核对 Web 团队的影响。

Cordova 的历史价值很大：它让早期 Web 团队不用同时写 Objective-C 和 Java，也能把业务快速送进 App Store 和 Android 生态。今天新项目未必优先选它，但理解它能帮你看清“Web 技术进移动端”这条路线的来龙去脉。

## 核心要点

1. **WebView 是舞台**：你的页面仍由浏览器内核渲染。类比：演员还是网页那批演员，只是剧场换成了手机里的小剧场。

2. **插件是翻译官**：JavaScript 不能直接拿到所有原生能力，插件负责把 `navigator.camera.getPicture()` 这类调用转成 Android / iOS 代码。类比：你对前台说中文，插件去和后台工作人员沟通。

3. **命令行负责搭架子**：`cordova create`、`platform add`、`plugin add` 会生成项目目录、平台工程和配置文件。类比：装修队先把门面、水电和货架搭好，你再把网页商品摆进去。

4. **配置文件是合同**：`config.xml` 记录 App 名称、包名、权限、插件参数等。类比：商场合同写清楚店名、经营范围和能用哪些公共设施。

5. **它换来速度，也带来边界**：WebView 适合表单、内容、内部工具和轻交互业务；重动画、游戏、复杂原生手势仍可能吃力。

## 实践案例

### 案例 1：创建一个最小 Cordova App

```bash
npm install -g cordova
cordova create hello com.example.hello HelloCordova
cd hello
cordova platform add android
cordova run android
```

逐部分解释：

- `cordova create` 生成项目骨架，`www/` 目录里放 Web 页面。
- `com.example.hello` 是包名，像 App 在系统里的身份证。
- `platform add android` 生成 Android 工程；如果要 iOS，还要在 macOS 上加 `ios` 平台。
- `cordova run android` 会构建并安装到模拟器或真机。

### 案例 2：用插件调用相机

```bash
cordova plugin add cordova-plugin-camera
```

```js
document.addEventListener('deviceready', () => {
  navigator.camera.getPicture(
    (uri) => console.log('photo:', uri),
    (err) => console.error('camera error:', err),
    {
      quality: 80,
      destinationType: Camera.DestinationType.FILE_URI,
    },
  )
})
```

逐部分解释：

- `deviceready` 代表 Cordova 的原生桥已经准备好，太早调用插件会失败。
- `getPicture` 看起来像普通 JavaScript，底层会进入相机或相册。
- `quality` 控制压缩质量，避免一张照片占用过多空间。
- `FILE_URI` 返回文件地址，后续可以交给页面显示或上传。

### 案例 3：理解 JavaScript 到原生的桥

```js
cordova.exec(
  (value) => console.log('ok', value),
  (error) => console.error('fail', error),
  'BatteryPlugin',
  'readLevel',
  [],
)
```

逐部分解释：

- 第一个函数是成功回调，第二个函数是失败回调。
- `'BatteryPlugin'` 是插件服务名，`'readLevel'` 是要调用的原生动作。
- `[]` 是传给原生侧的参数列表。
- 真正生产中通常不直接写 `cordova.exec`，而是用插件封装好的 JavaScript API。

## 踩过的坑

1. **忘了等 `deviceready`**：页面 `DOMContentLoaded` 不等于 Cordova 桥可用，插件调用要等 `deviceready`。

2. **把浏览器调通当成真机调通**：桌面 Chrome 里能跑，不代表 Android WebView、iOS WKWebView 和权限弹窗都没问题。

3. **插件版本和平台版本不匹配**：老插件可能依赖旧 Android Gradle Plugin 或旧权限模型，升级平台后先查插件维护状态。

4. **忽略应用商店规则**：热更新、隐私权限、支付入口都要遵守平台政策，不能因为业务是 Web 写的就绕过审核。

5. **误以为一次编写就没有平台差异**：状态栏、安全区、返回键、文件路径、推送权限都会在 iOS / Android 上表现不同。

## 适用 vs 不适用场景

**适用**：

- 已有 Web 应用，需要较快打包成移动端 App。
- 表单、内容、后台管理、活动页、企业内部工具这类 Web-first 产品。
- 团队主要是前端工程师，只需要少量相机、定位、文件等原生能力。
- 维护历史 Cordova / Ionic 老项目，需要理解其架构和升级边界。

**不适用**：

- 高帧率游戏、AR、实时音视频、复杂手势等对渲染延迟敏感的场景。
- 需要大量平台原生控件和深度系统集成的 App。
- 团队完全没有原生调试能力，却要接入推送、支付、蓝牙、后台任务。
- 新项目追求现代插件生态和原生工程体验时，通常应先评估 [[capacitor]]。

## 历史小故事（可跳过）

- **2009 年前后**：PhoneGap 出现，把 WebView 打包 App 的路线推到主流开发者面前。
- **2011 年**：Adobe 收购 PhoneGap，并把核心代码捐给 Apache，Apache Cordova 成为开源项目名。
- **2013 年后**：Ionic Framework 流行，很多团队用 Ionic 写界面，再用 Cordova 打包进手机。
- **2018 年**：Ionic 团队推出 Capacitor，试图用更现代的插件和原生工程管理方式解决 Cordova 的老包袱。
- **今天**：Cordova 仍能维护老项目，但新项目通常会把 Cordova、Capacitor、React Native、Flutter 放在一起重新比较。

## 学到什么

1. Cordova 的本质是 WebView + 插件桥 + 平台工程，不是一个新的前端框架。
2. 它把 Web 团队带进移动端，但不会消除权限、生命周期、真机调试和商店审核。
3. 插件生态是 Cordova 项目的生命线；选插件比写页面更容易决定长期维护成本。
4. WebView 路线适合复用 Web 资产，但性能和交互边界要提前说清楚。
5. 读懂 Cordova，再看 [[capacitor]] 的改进点会清楚很多。

## 延伸阅读

- 仓库：[apache/cordova](https://github.com/apache/cordova)
- 官方文档：[Apache Cordova Documentation](https://cordova.apache.org/docs/en/latest/)
- 插件搜索：[Cordova Plugins](https://cordova.apache.org/plugins/)
- [[capacitor]] —— Cordova 思路的现代化延续，插件和原生工程体验更贴近今天。
- [[ionic-framework]] —— 常和 Cordova / Capacitor 搭配使用的移动 UI 组件体系。
- [[react-native]] —— 另一条跨平台路线，用 JavaScript 驱动原生组件。

## 关联

- [[capacitor]] —— 保留 Web-first 路线，同时改进 Cordova 的插件和平台工程管理。
- [[ionic-framework]] —— 早期 Ionic 项目大量依赖 Cordova 打包进入移动端。
- [[react-native]] —— 同样跨平台，但它渲染原生组件，不是把页面放进 WebView。
- [[flutter]] —— 自绘 UI 路线，和 Cordova 的 WebView 路线形成鲜明对比。
- [[tauri]] —— 桌面端也常见“Web UI + 原生壳”，可用来类比 Cordova 的移动端思路。
- [[vite]] —— 现代 Web 构建工具，产物可以作为 WebView 壳里的静态资源。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 把 Web 应用装进原生 App 的运行时
- [[ionic-framework]] —— Ionic Framework — 用网页技术做跨端 App 的 UI 工具箱
- [[nativescript]] —— NativeScript — 用 JS/TS 直接驱动原生控件
