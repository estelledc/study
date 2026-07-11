---
title: Flutter — Google 的 Dart 跨平台 UI 框架
来源: 'https://github.com/flutter/flutter'
日期: 2026-07-08
分类: mobile
难度: 初级
---

## 是什么

Flutter 是 Google 开源的跨平台 UI SDK：用一份 Dart 代码，画出手机、Web、桌面上的界面。

日常类比：传统跨平台像给每个城市分别找装修队，Flutter 更像自己带一支施工队和一套画笔，到哪座城市都按同一张图纸施工。

你最小能写成这样：

```dart
import 'package:flutter/material.dart';

void main() => runApp(
  const MaterialApp(
    home: Center(child: Text('Hello Flutter')),
  ),
);
```

这段代码没有写 Android XML，也没有写 iOS Storyboard。Flutter 把 `Widget` 树变成可绘制对象，再交给自己的引擎去画到屏幕上。

## 为什么重要

不理解 Flutter，下面这些事会很难解释：

- 为什么一套业务页面可以同时跑在 iOS、Android、Web 和桌面，而不是每端重写一遍。
- 为什么 Flutter UI 看起来很统一：它不是简单调用系统按钮，而是用自己的 widget 和渲染管线画出来。
- 为什么热重载能保留当前页面状态：开发期代码进 Dart 运行时后，框架重新 build widget 树。
- 为什么性能问题常常和布局、重建、图片、shader、平台通道有关，而不只是"手机慢"。

## 核心要点

1. **Widget 树就是界面图纸**。类比菜单：你不是告诉厨师"摆得好看点"，而是把盘子、菜、边距、颜色按层级写清楚。Flutter 的 `build()` 把状态映射成 UI，状态变了就重新生成图纸。

2. **渲染层自己负责画**。类比自带画室：Flutter 不依赖每个平台现成的按钮长相，而是把场景交给引擎栅格化。早期常说 Skia，近年 Impeller 在 iOS 和较新 Android 上成为默认方向，用预编译 shader 降低运行时卡顿。

3. **平台能力通过边界接入**。类比前台和后厨传纸条：Dart 层做 UI，需要电量、相机、蓝牙等原生能力时，可以用插件、FFI 或 platform channel 把请求发给 Kotlin、Swift、C++ 等平台代码。

## 实践案例

### 案例 1：从零建一个能跑的页面

官方文档里的第一类动作是用 CLI 创建项目，然后在 `lib/main.dart` 写 widget 树：

```bash
flutter create my_app
cd my_app
flutter run
```

```dart
import 'package:flutter/material.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: Scaffold(
        body: Center(child: Text('第一屏')),
      ),
    );
  }
}
```

逐部分解释：

- `flutter create` 负责生成目录、平台壳和默认配置；`MaterialApp` 像一整套应用外壳。
- `Scaffold` 像页面骨架，常放标题栏、正文、底部按钮。
- `Center` 和 `Text` 是最小 UI 组件，说明 Flutter 先组合 widget，再由框架决定怎么画。

### 案例 2：用 ListView 做一个手机列表

移动应用很常见的页面是"消息、订单、设置项"列表，Flutter 用 `ListView` 和 `ListTile` 表达：

```dart
ListView(
  children: const [
    ListTile(leading: Icon(Icons.map), title: Text('地图')),
    ListTile(leading: Icon(Icons.photo), title: Text('相册')),
    ListTile(leading: Icon(Icons.phone), title: Text('电话')),
  ],
)
```

逐部分解释：

- `ListView` 是可滚动容器，适合竖向展示多项内容。
- `ListTile` 是一行标准结构，左边图标、中间标题、右边还可以放操作。
- `const` 告诉 Dart 这些 widget 不依赖运行时变化，能减少没必要的创建。
- 列表特别长时通常换 `ListView.builder`，让 Flutter 只按需构建可见行。

### 案例 3：从接口拿数据再显示

真实 App 不只画静态页面，还要请求后端。官方 cookbook 的思路是：请求函数返回 `Future`，页面用 `FutureBuilder` 展示加载、成功、失败三种状态。

```bash
flutter pub add http
```

```dart
Future<String> fetchTitle() async {
  final response = await http.get(Uri.parse('https://example.com/item/1'));
  if (response.statusCode != 200) throw Exception('load failed');
  return jsonDecode(response.body)['title'] as String;
}

FutureBuilder<String>(
  future: futureTitle,
  builder: (context, snapshot) {
    if (snapshot.hasData) return Text(snapshot.data!);
    if (snapshot.hasError) return Text('加载失败');
    return const CircularProgressIndicator();
  },
)
```

逐部分解释：

- `flutter pub add http` 把网络请求包加入项目依赖。
- `Future<String>` 表示"现在还没有，未来会拿到一个字符串"。
- `FutureBuilder` 像三档指示灯：等待时转圈，成功时显示文字，失败时显示错误。
- 请求不要直接写在 `build()` 里，因为 `build()` 会频繁执行，容易把同一个接口打很多遍。

## 踩过的坑

1. **把 `build()` 当初始化函数**：`build()` 可能一秒内被调用多次，网络请求、写文件、启动动画都不该随手塞进去。

2. **误以为热重载什么都能刷新**：改枚举结构、泛型参数、原生 Kotlin/Swift 代码时，常常需要 hot restart 或完整重启。

3. **无约束布局乱套**：`Row`、`Column`、`ListView` 里尺寸约束不清楚，会出现溢出、无限高度、黄色黑条等错误。

4. **插件等于免费跨平台**：相机、定位、支付等插件背后仍有各平台实现，权限、版本和系统策略都要分别确认。

## 适用 vs 不适用场景

**适用**：

- 一支团队要同时交付 iOS 和 Android，并希望大部分 UI 与业务逻辑复用。
- 产品重视视觉一致性、动画、定制组件，不想被平台默认控件限制。
- 业务以表单、列表、内容流、轻量互动为主，后端接口和本地状态清晰。
- 需要把一段新功能嵌进已有原生 App，逐步迁移而不是一次推倒重来。

**不适用**：

- 只做极轻网页，SEO 和首屏 HTML 内容比 App 手感更重要。
- 团队已经有成熟原生双端体系，且页面大量依赖平台独有控件。
- 功能强绑定底层硬件或系统扩展，插件生态无法覆盖，原生代码占比很高。
- 项目无法接受额外运行时、包体积和 Flutter SDK 升级带来的维护成本。

## 历史小故事（可跳过）

- **2015 年前后**：Flutter 的早期形态从"高性能移动 UI 实验"演进出来，目标是让 UI 更新更快、定制更自由。
- **2018 年**：Flutter 1.0 发布，Dart、widget、hot reload 和移动端工具链开始形成稳定心智。
- **之后几年**：Web、Windows、macOS、Linux 支持陆续成熟，Flutter 从移动框架扩展为多平台 UI SDK。
- **近年**：Impeller 渲染运行时成为重点，官方希望减少 shader 运行时编译导致的卡顿。
- **社区侧**：GitHub 上已经是十几万 stars 量级，pub.dev 插件生态让地图、相机、支付、状态管理都有现成选择。

## 学到什么

- Flutter 的本质不是"把网页塞进 App"，而是"用 Dart 描述 UI，再由自己的引擎画出来"。
- Widget 树是学习入口：先看懂 `MaterialApp`、`Scaffold`、`StatefulWidget`，再谈状态管理和架构。
- 热重载提高的是反馈速度，不是运行时魔法；改到类型结构或原生层时仍要重启。
- 跨平台省的是大量重复 UI 和业务代码，但权限、打包、性能、插件兼容仍要按平台验收。

## 延伸阅读

- 官方入口：[Flutter GitHub README](https://github.com/flutter/flutter)
- 架构文档：[Flutter architectural overview](https://docs.flutter.dev/resources/architectural-overview)
- 渲染文档：[Impeller rendering engine](https://docs.flutter.dev/perf/impeller)
- 开发体验：[Hot reload](https://docs.flutter.dev/tools/hot-reload)
- [[livekit-flutter]] —— 真实 Flutter 插件项目，可看跨平台 SDK 怎么封装音视频能力
- [[react]] —— 同样是声明式 UI，但 Flutter 把声明式带到自绘 App 框架

## 关联

- [[livekit-flutter]] —— Flutter 插件如何把 Dart UI 和原生音视频能力接起来。
- [[react]] —— Flutter 的声明式 UI 心智和 React 相近，都是状态驱动界面。
- [[preact]] —— 轻量 Web UI 框架，适合和 Flutter 的重量级跨平台路线对比。
- [[element-android]] —— 原生 Android 大项目，能对照 Flutter 省掉和新增了哪些复杂度。
- [[signal-ios]] —— 原生 iOS 项目，适合理解 Flutter 不直接复用 UIKit 控件意味着什么。
- [[axios]] —— Flutter 调接口时也要面对请求、错误、重试和 JSON 解析这些通用问题。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[appflowy]] —— AppFlowy — Rust 写的开源 Notion
- [[cordova]] —— Cordova — 用 Web 技术打包移动 App 的老牌桥梁
- [[ionic-framework]] —— Ionic Framework — 用网页技术做跨端 App 的 UI 工具箱
- [[livekit-flutter]] —— LiveKit Flutter SDK — 一份 Dart 代码连通六个平台的实时音视频
- [[nativescript]] —— NativeScript — 用 JS/TS 直接驱动原生控件
- [[neutralinojs]] —— neutralinojs — 系统 WebView 上的极简桌面壳
- [[nodegui]] —— nodegui — 用 Node.js 写原生桌面窗口
- [[react-native]] —— React Native — 一套代码跑多端的跨端运行时
- [[rive]] —— Rive — 把矢量动画做成可交互组件的运行时
- [[tauri]] —— Tauri — 用系统浏览器内核 + Rust 做轻量桌面应用
