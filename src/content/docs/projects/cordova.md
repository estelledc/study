---
title: Cordova — 用 HTML/JS 写手机 App 的 WebView 桥
来源: 'https://github.com/apache/cordova'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

Apache Cordova 是一个**让 Web 开发者用 HTML、CSS、JavaScript 写手机 App 的跨平台框架**。日常类比：像给 Web 页面套了一件"原生外衣"——穿上这件外衣，你的网页就能出现在 App Store / Google Play，还能读摄像头、取 GPS。

核心思路只有三层：

```
Web 代码 (HTML/JS/CSS)
    ↓ 跑在
WebView（系统内置浏览器引擎）
    ↓ 通过 JS Bridge 调
原生层（摄像头 / GPS / 文件系统 / 蓝牙……）
```

最小 Cordova 应用只需要两个文件：一个 `index.html` 和一个 `config.xml`。CLI 用 `cordova platform add android` 把这两个文件"塞进"Android 项目，再 `cordova run android` 就能在手机上跑起来。

```bash
npm install -g cordova
cordova create MyApp
cd MyApp
cordova platform add android
cordova plugin add cordova-plugin-camera
cordova run android
```

Cordova 不提供 UI 组件，它只是**运行时桥**——你的 HTML 负责界面，Cordova 负责打通设备能力。

## 为什么重要

不理解 Cordova，下面这些事很难说清楚：

- 为什么 Ionic 早期几乎 100% 依赖 Cordova，而 Capacitor 出现后才得以脱钩
- 为什么"JS Bridge 性能瓶颈"是所有 WebView 系方案共同的原罪，React Native 不得不走 JSI/新架构
- 为什么手机 App 可以"仅用 Web 技术"发布到应用商店，背后是什么机制在支撑
- 为什么 Adobe PhoneGap 和 Apache Cordova 是同一个东西，却又不完全是

## 核心要点

Cordova 架构可以拆成 **三个关键机制**：

1. **WebView 容器**：每个平台（iOS/Android）都有系统级 WebView——iOS 用 WKWebView，Android 用 Chromium WebView。Cordova 的"原生壳"就是一个空 Activity/ViewController，主内容全是 WebView 渲染的 HTML。类比：像一个只有透明玻璃、没有墙壁的建筑，玻璃里面展示的是你自己的 Web 页面。

2. **JS Bridge（消息协议）**：WebView 里的 JS 不能直接调原生 API，两侧需要"翻译官"。旧版 Bridge 用 URL Scheme 劫持（iOS `iframe.src = "gap://camera/take"`）或 `prompt()` 拦截传消息，新版用 `WKScriptMessageHandler`。原生侧收到消息后调实际 API，把结果序列化成 JSON 回传给 JS callback。

3. **插件系统**：每个设备能力（摄像头、GPS、振动……）封装成一个独立插件，包含 JS 接口 + 各平台原生实现。通过 `cordova plugin add <plugin-name>` 安装，本质是把原生代码注入到平台项目里并注册到 Bridge。核心插件由 Apache 维护（cordova-plugin-camera、cordova-plugin-geolocation 等），第三方插件通过 npm 分发。

## 实践案例

### 案例 1：访问摄像头扫二维码

企业内部工具场景：已有 Web 管理后台，需要让仓库人员扫码录入库存。

```bash
cordova plugin add cordova-plugin-camera
cordova plugin add phonegap-plugin-barcodescanner
```

```javascript
// 调用摄像头扫码
function scanBarcode() {
  cordova.plugins.barcodeScanner.scan(
    function(result) {
      if (!result.cancelled) {
        document.getElementById('sku').value = result.text;
        submitInventory(result.text);
      }
    },
    function(error) {
      alert('扫码失败: ' + error);
    },
    { preferFrontCamera: false, showFlipCameraButton: true }
  );
}

// 等 Cordova 初始化完成再绑定
document.addEventListener('deviceready', function() {
  document.getElementById('scan-btn').addEventListener('click', scanBarcode);
}, false);
```

关键点：`deviceready` 事件是 Cordova 特有的——在 DOM ready 之后、Bridge 初始化完成之后才触发，必须等它才能调插件。常见新手坑是把插件调用写在 `DOMContentLoaded` 里，导致 Bridge 还没就绪就报错。

### 案例 2：把 H5 页面 AppStore 化并获取 GPS

产品想把已有移动端 H5 加上后台定位功能（H5 在浏览器里无法后台访问 GPS）：

```xml
<!-- config.xml 关键配置 -->
<widget id="com.company.tracker" version="1.0.0">
  <name>货运追踪</name>
  <content src="index.html" />
  <access origin="https://api.company.com" />
  <plugin name="cordova-plugin-geolocation" />
  <preference name="BackgroundMode" value="true" />
</widget>
```

```javascript
// 持续监听位置变化
const watchId = navigator.geolocation.watchPosition(
  function(position) {
    const { latitude, longitude, accuracy } = position.coords;
    // 通过 Cordova WebView，这里的 geolocation 走的是原生 GPS API
    // 精度和功耗都比浏览器 H5 的实现好得多
    reportLocation(latitude, longitude);
  },
  function(err) { console.error(err); },
  { enableHighAccuracy: true, maximumAge: 5000 }
);
```

Cordova 的 `cordova-plugin-geolocation` 把 W3C Geolocation API 代理到原生，代码和在浏览器里写的完全一样，但实际走的是原生 GPS 栈。

### 案例 3：混合 App——原生 + WebView 并存

某些场景需要在原生导航栏下嵌入 Cordova WebView，而不是让 WebView 占满全屏：

```java
// Android 原生代码里嵌入 Cordova WebView
public class MainActivity extends CordovaActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // 加载本地 HTML 资源
    loadUrl(launchUrl);
  }
}
```

这种"Platform-centered 工作流"让你能在同一个 App 里混用原生组件（如地图 SDK 的 Native View）和 Web 组件（如复杂表单页面），是 Cordova 官方文档明确支持的场景，也是它区别于纯 H5 套壳工具的核心能力。

## 踩过的坑

1. **忘记等 `deviceready`**：把 `cordova.plugins.*` 调用放在 `$(document).ready()` 或 `DOMContentLoaded` 里——此时 Bridge 还没初始化，全部报 `undefined`。必须用 `document.addEventListener('deviceready', callback, false)`。

2. **iOS WKWebView 迁移后 cookie/localStorage 失效**：旧版 Cordova 用 UIWebView，Apple 强制迁移到 WKWebView 后，`localStorage` 数据在进程重启后有时会丢失（WKWebView 的存储进程与主进程隔离）。解决：用 `cordova-plugin-wkwebview-engine` 配套的 `cordova-sqlite-storage` 替代 localStorage。

3. **JS Bridge 传大文件卡死**：通过 Bridge 传图片 Base64 或音频 Buffer 时，旧版序列化会阻塞 UI 线程。图片应改用文件路径传递，原生侧存文件、JS 侧拿路径，避免把二进制数据直接跨 Bridge 传输。

4. **插件版本地狱**：Cordova CLI 12 和 CLI 9 之间有多个破坏性变更，某些插件（特别是老的蓝牙/NFC 插件）只兼容旧 CLI。升级 CLI 后需逐个检查每个插件的 `engines.cordova` 字段，并在 `package.json` 锁版本，避免 `npm install` 时静默升级导致构建崩溃。

## 适用 vs 不适用场景

**适用**：
- 已有 Web 技术团队，需要快速交付移动 App，不想维护 iOS/Android 双份原生代码
- 企业内部工具、ToB App，对 UI 动效要求不高但需要访问摄像头/GPS/推送等设备能力
- 需要发布到应用商店但预算有限，MVP 阶段快速验证产品方向
- 遗留 H5 应用需要原生能力增强（如后台定位、本地文件访问）

**不适用**：
- 消费级 App，需要丝滑的原生动效（过渡动画、复杂手势、长列表回收）——WebView 渲染存在天花板
- 高性能实时场景（游戏、AR/VR、音视频处理）——WebView 无法满足延迟要求
- 已有 React/Vue 团队且目标是长期维护的产品——直接选 Capacitor（Cordova 精神继承者 + 现代架构）或 React Native

## 历史小故事（可跳过）

- **2009 年**：Nitobi 公司在旧金山黑客马拉松创建 PhoneGap，首次提出"Web 开发者也能写手机 App"。当时 iPhone 刚发布两年，原生开发壁垒极高，PhoneGap 一夜爆红。
- **2011 年**：Adobe 收购 Nitobi，同年把框架核心捐给 Apache 软件基金会，更名 Cordova（源自 Nitobi 公司所在地 Vancouver 的一条街道名）。PhoneGap 保留为 Adobe 的商业发行版，本质上是 Cordova 的下游。
- **2013-2015 年**：Ionic Framework 基于 Cordova 崛起，带来了完整的 UI 组件库，让 Web 工程师无需学习原生就能交付"看起来不太差"的 App。Cordova 生态达到鼎盛。
- **2019 年**：Capacitor 作为 Ionic 团队重写的 Cordova 替代者发布，插件 API 现代化，支持渐进式迁移。Adobe 宣布 PhoneGap 服务关闭（2020 年停止维护）。
- **至今**：Cordova 本身进入维护模式，活跃开发减少，但存量企业 App 数量巨大；Capacitor 已成为新项目首选。Cordova 的遗产是证明了 JS Bridge 模式的可行性，并为 React Native（独立线程模型）、Flutter（自绘引擎）等后来者提供了反面教材和正面经验。

## 学到什么

1. **WebView 桥是性能天花板而非无限扩展**——JS 和原生之间的序列化开销是结构性问题，不是调参能解决的，理解这一点才能判断何时该放弃 WebView 方案
2. **插件=平台能力的抽象边界**——Cordova 用插件把"平台差异"封装起来，这个设计思路在 Capacitor、Expo Modules 里延续，是跨平台框架的通用模式
3. **`deviceready` 告诉你"异步初始化"无处不在**——移动端开发中，资源就绪时间不等于代码执行时间，防御性编程（等待明确信号再操作）是基本功
4. **框架的生命周期决定维护成本**——Cordova 进入维护模式后，存量项目的真实成本大幅上升；选型时评估框架活跃度和退出路径和评估技术能力同等重要

## 延伸阅读

- 官方文档：[Apache Cordova 架构概览](https://cordova.apache.org/docs/en/12.x/guide/overview/)（读完就理解 WebView/Bridge/Plugin 三层）
- 迁移指南：[Cordova → Capacitor 官方迁移文档](https://capacitorjs.com/docs/cordova/migrating-from-cordova-to-capacitor)（新项目应优先选 Capacitor）
- [[capacitor]] —— Ionic 团队重写的 Cordova 继任者，现代架构 + 原生层更轻量
- [[ionic-framework]] —— 建在 Cordova/Capacitor 之上的 UI 组件库，把"够用的原生感"带给 Web 开发者
- [[react-native]] —— 走了另一条路：抛弃 WebView，用 JS 线程驱动原生组件渲染

## 关联

- [[capacitor]] —— Cordova 的精神继承者，解决了 Bridge 架构的核心限制，新项目首选
- [[ionic-framework]] —— 长期与 Cordova 绑定的 UI 框架，Cordova 兴衰直接影响 Ionic 路线图
- [[react-native]] —— 同为"一套代码多平台"，但选择了 JS 线程 + 原生渲染而非 WebView，是 Cordova 的最大替代方向
- [[flutter]] —— 更激进：完全抛弃平台 UI 组件，自己用 Skia/Impeller 绘制，彻底消除 WebView 和 Bridge
- [[node-js]] —— Cordova CLI 运行在 Node.js 上，`cordova` 命令本质是 Node 脚本协调各平台 SDK 的构建流程
- [[webpack]] —— Cordova App 的前端资源打包通常由 Webpack 完成，输出的 dist/ 目录就是 WebView 加载的 index.html

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 让 Web 应用直接变成 App Store 上架的原生应用
- [[flutter]] —— Flutter — Google 自绘像素的跨平台 UI 框架
- [[ionic-framework]] —— Ionic Framework — 用 Web 技术打包原生移动 App
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[react-native]] —— React Native — 用 React 写、编译成真正的原生 App
- [[webpack]] —— webpack 模块打包

