---
title: Apache Cordova — 用网页技术写手机 App 的 WebView 桥
来源: 'https://github.com/apache/cordova'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 初级
---

## 是什么

Apache Cordova 是一个**让 Web 开发者用 HTML/CSS/JavaScript 写出能上架 App Store 的手机 App** 的开源框架。日常类比：像一个"翻译官"——你只会说普通话（JavaScript），它帮你翻译成当地语言（iOS 或 Android 的原生 API），双方就能顺畅沟通。

核心机制叫 **WebView 桥（JavaScript Bridge）**：你写的 Web 代码运行在手机壳子里内嵌的一个迷你浏览器（WebView）里，当你调用 `navigator.camera.getPicture()` 时，Cordova 把这个调用序列化成消息，穿过桥传给原生层，原生层打开摄像头、拍完照片，再把结果序列化成 JSON 传回来。整个过程是异步的，对你来说就像调了一个普通的回调函数。

Cordova 由 PhoneGap 演变而来，是混合 App（Hybrid App）这种开发模式的鼻祖。如今的 Ionic Framework、Capacitor 等框架，本质上都是站在 Cordova 的肩膀上演进的。

## 为什么重要

不理解 Cordova，这些事你没法解释：

- 为什么早期 Ionic App 在安卓低端机上"看起来像 H5 不像原生"——它们本质上就是运行在 WebView 里的 H5，性能瓶颈来自 WebView 而非业务代码
- 为什么 Capacitor（Ionic 团队出品）要和 Cordova 兼容插件生态，又为什么要彻底重写桥接层——WebView Bridge 的设计缺陷是推动力
- 为什么 React Native 选择"不用 WebView"而是独立 JS 线程 + 原生组件——这是对 Cordova 架构的明确反驳
- 为什么"一套代码跑多平台"是一个持续 15 年的核心诉求，至今还在 Flutter / Capacitor / Expo 上轮回

## 核心要点

Cordova 的架构可以拆成 **三层**：

1. **Web 层（你的代码住在这里）**：你的 HTML/CSS/JS 运行在 WebView 里，就像一个普通网页。类比：这是"驾驶员座位"，你坐在里面握方向盘，不需要了解发动机工作原理。

2. **JavaScript Bridge（消息通道）**：当 JS 需要访问设备能力时，Cordova 会把调用信息**序列化**（即把 JavaScript 对象转成字符串，方便跨层传输）后送给原生层。早期用 URL Scheme，后来用 `promptNative()`，WKWebView 时代（iOS 14 后稳定）改用 message handlers，结果再异步回传给 JS 层。类比：像工厂里传递生产指令的传送带——一次传一个盒子，两端各自拆包/打包。

3. **插件层（原生能力按需挂载）**：每种设备能力（摄像头、GPS、文件系统）对应一个 Cordova 插件，插件包含 JS 接口定义 + iOS/Android 的原生实现。类比：乐高积木——主框架提供底板，每块能力是独立积木，需要什么就插什么。

## 实践案例

### 案例 1：企业内部工具快速 App 化

某公司已有一套 Web 后台，销售人员需要在手机上扫条码入库。用 Cordova 两天内就能交付：

```bash
# 安装 Cordova CLI
npm install -g cordova

# 创建项目
cordova create warehouse-app com.example.warehouse WarehouseApp
cd warehouse-app

# 加平台
cordova platform add android
cordova platform add ios

# 加摄像头/扫码插件
cordova plugin add cordova-plugin-camera
cordova plugin add phonegap-plugin-barcodescanner
```

`www/js/index.js` 里调用摄像头：

```javascript
document.getElementById('scan-btn').addEventListener('click', () => {
  cordova.plugins.barcodeScanner.scan(
    (result) => {
      if (!result.cancelled) {
        console.log('条码：', result.text);
        // 调接口入库
        fetch('/api/warehouse/in', {
          method: 'POST',
          body: JSON.stringify({ barcode: result.text })
        });
      }
    },
    (err) => console.error('扫码失败', err)
  );
});
```

**要点**：你只写 JS，扫码的原生实现（Android 用 ZXing，iOS 用 AVFoundation）全封装在插件里。

### 案例 2：验证 MVP——用 Cordova + Ionic 快速跑通 App 交互

产品 MVP 阶段不确定是否值得投入原生开发，用 Cordova 作为底座：

```bash
# Ionic 早期版本就是 Cordova + Angular/UI 组件
npm install -g @ionic/cli

ionic start my-app tabs --type=angular
cd my-app
ionic cordova platform add ios

# 开发时本地预览
ionic serve

# 真机构建
ionic cordova build ios --prod
```

这套组合让团队在 1 周内拿到可以给投资人演示的 App 包，比原生开发快 3-5 倍。**验证 PMF 之后，再评估是否迁移到 React Native 或全原生**，这是合理的技术路径。

### 案例 3：H5 页面打包进壳获取原生权限

有时候你有一个很好的移动端 H5，但需要 GPS 后台追踪这种 H5 无法直接做到的能力：

```javascript
// www/js/location.js
document.addEventListener('deviceready', () => {
  // deviceready 是 Cordova 初始化完成的事件，必须等它才能调插件
  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      // 把坐标上报给服务器
      syncLocationToServer(latitude, longitude);
    },
    (err) => console.error(err),
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    }
  );
}, false);
```

**关键点**：`deviceready` 事件是 Cordova 特有的——所有插件 API 必须等这个事件触发后才可调用，忘了这一点是最常见的新手错误。

## 踩过的坑

1. **忘了等 `deviceready`**：在 `document.ready` 里直接调 `cordova.plugins.xxx`，得到 `undefined`，以为插件没装好，其实是 Cordova 原生层还没初始化完。必须把所有插件调用包在 `document.addEventListener('deviceready', fn)` 里。

2. **JS Bridge 传大 payload 卡顿**：Bridge 是消息序列化传输，把整张图片的 base64（几 MB）通过 Bridge 回传时，会阻塞 UI 线程，出现 App 短暂无响应。正确做法：调 `getPicture` 时设 `destinationType: Camera.DestinationType.FILE_URI`（返回本地文件路径），而不是默认的 `DATA_URL`（返回 base64 字符串），让原生层存本地文件，JS 只拿路径，传输量从几 MB 降到几十字节。

3. **插件版本锁死升不了**：`cordova-plugin-camera@2.x` 和 `cordova-plugin-camera@4.x` 的接口有破坏性变更，而项目同时依赖另一个插件只支持 2.x。这种"插件版本地狱"是 Cordova 项目维护期的噩梦，建议 `package.json` 锁死插件版本并单独维护升级文档。

4. **UIWebView 被 Apple 强制下架**：2020 年起 App Store 拒绝使用 UIWebView 的 App。Cordova 老项目必须迁移到 WKWebView（需更新 `cordova-ios` 平台版本 + 替换插件），但 WKWebView 的 cookie、localStorage 行为与 UIWebView 有差异，迁移后有隐性 Bug。

## 适用 vs 不适用场景

**适用**：
- 已有 Web 前端团队，需要快速交付 App 但不想学原生开发
- 企业内部工具 App（对性能要求不极致，功能覆盖优先）
- MVP 阶段快速验证产品方向，之后可按需迁移
- 主要交互是表单、列表、简单的设备 API（摄像头、GPS）

**不适用**：
- 需要流畅 60fps 动画和复杂手势（游戏、直播、视频编辑）——WebView 渲染跟不上原生
- 大量原生 UI 组件（UICollectionView、RecyclerView 深度定制）
- 低端安卓设备性能敏感场景——WebView 比原生 View 更耗内存
- 团队已有原生开发能力，不需要跨平台代码共享的项目

## 历史小故事（可跳过）

- **2009 年**：Nitobi 公司工程师参加黑客马拉松，发现可以用 UIWebView 包裹 Web 代码并调用原生 API，诞生了 PhoneGap。当时的口号是"Write Once, Run Everywhere"。
- **2011 年**：Adobe 收购 Nitobi。随后 Adobe 把框架核心捐献给 Apache 软件基金会，更名为 Apache Cordova。PhoneGap 作为 Adobe 基于 Cordova 的商业版本继续发布。
- **2013-2015 年**：Cordova 生态爆发，npm 上 Cordova 插件数量破千，Ionic Framework v1 以 Cordova 为底座横空出世，混合 App 开发在创业公司中风行。
- **2016 年**：React Native 发布并快速流行，以"原生组件 + JS 逻辑"替代"WebView + JS 全包"，被业界视为对 Cordova 架构的颠覆。
- **2020 年**：Adobe 停止维护 PhoneGap；Ionic 团队发布 Capacitor 作为 Cordova 的现代替代品，重写了桥接层，解决了 WKWebView 兼容性和 Bridge 性能问题。Cordova 本体进入"维护模式"。

## 学到什么

1. **WebView 桥的代价是有形的**：序列化/反序列化、异步延迟、内存复制——每次 Bridge 调用都有成本。设计插件时要批量传数据而不是频繁小量传，大文件传路径而不是传内容。

2. **"一套代码"的代价是最低公分母**：为了跨平台，Cordova 不能使用任何平台特有的 API 和渲染特性，最终 UI 体验被 WebView 的性能上限锁死。

3. **插件生态是护城河也是绑架**：Cordova 能跑 15 年，很大程度上是因为插件生态庞大；但生态分裂（维护者失联、版本不兼容）也是项目被迫锁定老版本的主要原因。

4. **理解前辈框架的设计决策，是理解后继者为何这样设计的最短路径**：看懂 Cordova 的桥为什么慢，就自然理解了 Capacitor 为何改用 WKWebView message handlers，React Native 为何完全绕开 WebView。

## 延伸阅读

- 官方文档：[Apache Cordova Docs](https://cordova.apache.org/docs/en/latest/)（插件开发指南和平台 API 参考）
- PhoneGap 创始人回顾：[Brian LeRoux — The History of PhoneGap](https://brian.io/phonegap-history/)（一手历史）
- [[capacitor]] —— Ionic 团队重写 Cordova 桥接层的现代替代品
- [[react-native]] —— 用原生组件替代 WebView 的另一条跨平台路径
- [[ionic-framework]] —— 最早以 Cordova 为底座的 UI 组件框架

## 关联

- [[capacitor]] —— Cordova 的现代继承者，解决了 WKWebView 兼容和 Bridge 性能问题
- [[react-native]] —— 绕开 WebView、用原生组件的跨平台框架，是对 Cordova 架构的反驳
- [[ionic-framework]] —— 早期以 Cordova 为底座的 UI 框架，后迁移到 Capacitor
- [[flutter]] —— Google 用自绘引擎替代 WebView/原生组件的第三条跨平台路径
- [[node-js]] —— Cordova CLI 和插件生态都运行在 Node.js 上
- [[webpack]] —— Cordova 项目的 Web 资源打包工具，`www/` 目录的内容通常由 webpack 构建产出

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

