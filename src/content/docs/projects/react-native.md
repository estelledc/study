---
title: React Native — 用 React 写、编译成真正的原生 App
来源: 'https://github.com/facebook/react-native'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

React Native 是 Meta 开源的跨平台移动应用框架，让你用 React 和 JavaScript 写一套代码，同时生成真正的 iOS 和 Android 原生应用——不是把网页套一层壳，而是把 `<View>` 和 `<Text>` 等组件直接映射到系统原生控件（UIView / android.view.View）。

日常类比：像一个翻译官坐在你和两位外国客户（iOS、Android）之间——你只说一次"给我一个按钮"，他分别用流利的中文和英文告诉两边，每边都听懂了，每边都是地道本地按钮。

写法和 React web 几乎一模一样：

```jsx
import { View, Text, TouchableOpacity } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24 }}>Hello, Native World!</Text>
      <TouchableOpacity onPress={() => alert('按了！')}>
        <Text>点我</Text>
      </TouchableOpacity>
    </View>
  );
}
```

`<View>` 对应 `<div>`，`StyleSheet` 对应 CSS，`useState` / `useEffect` 照常用——你的 React 知识 80% 都能直接迁移。

## 为什么重要

不理解 React Native，以下问题都没法说清楚：

- 为什么移动端 App 不直接用 WebView 套个网页——原生控件的渲染性能、手势响应、系统集成都是 WebView 数量级的差距
- 为什么 Flutter / React Native 之争总没结论——两者本质取舍不同，Flutter 自绘，RN 桥接原生，选型要看团队和场景
- 为什么 React Native 0.76 之前经常出现"动画卡帧"——旧 Bridge 架构下 JS 与原生通信必须序列化 JSON，高频帧更新吃满了吞吐
- 为什么 Expo 成了事实上的推荐入口——脱离 Expo 自己搭 Android Studio + Xcode 双链路，每次升级都像踩雷阵

## 核心要点

React Native 的技术核心可以拆成三层：

1. **旧架构 vs 新架构（JSI）**：旧版用异步 Bridge 传 JSON，JS 与原生互相"发邮件"等回复，高频调用（手势、动画）极易卡帧。新架构（0.76 起默认）引入 JSI（JavaScript Interface），让 JS 直接持有 C++ 对象引用，像"内部通话"——无需序列化，调用几乎零拷贝。类比：Bridge 是两栋楼之间的气管信，JSI 是直通的内部电话线。

2. **Fabric 渲染器 + TurboModules**：Fabric 是配套 JSI 的新渲染器，让 `useLayoutEffect` 和 React 18 并发特性（Suspense / Transitions / 自动批处理）可以在移动端正常工作。TurboModules 替代旧 NativeModules，按需初始化原生模块，减少 App 启动耗时。类比：Fabric 是新的施工队，TurboModules 是"不用先把所有工具带到工地，要什么取什么"。

3. **Hermes 引擎 + Metro Bundler**：Hermes 是 Meta 专为 React Native 优化的轻量 JavaScript 引擎，提前把 JS 编译成字节码打包进 App，启动速度比 V8 快 2-3 倍，内存占用更低。Metro 是 RN 专用的打包器，支持增量编译和 Fast Refresh（保存即热更新，不丢组件状态）。

## 实践案例

### 案例 1：用 Expo 五分钟启动一个跨平台 App

Expo 是官方推荐的框架层，内置文件路由（Expo Router）、OTA 更新、海量原生模块。

```bash
# 安装 Expo CLI 并创建项目
npx create-expo-app@latest MyApp
cd MyApp
npx expo start
```

在手机上安装 Expo Go App，扫码即可在真机预览，不需要 Xcode 或 Android Studio：

```
# 终端显示二维码 → 手机扫码 → App 立即跑在手机上
```

文件路由（类似 Next.js App Router）：

```
app/
  _layout.tsx      ← 根布局
  index.tsx        ← 首页 /
  profile/
    index.tsx      ← /profile
    [id].tsx       ← /profile/:id
```

每个文件即一个路由，导航零配置。EAS Build（Expo Application Services）能在云端打包 .ipa / .apk，本地不装 Xcode 也能发布 iOS 包。

### 案例 2：用 Reanimated 3 + JSI 做不卡帧的手势动画

旧 Bridge 架构做动画，每帧都要跨线程传数据，60fps 时有 16ms 预算，Bridge 一跑就超。新架构 + Reanimated 3 把动画逻辑直接跑在 UI Thread。

首先安装两个依赖库（它们不在 RN 核心包里）：

```bash
npm install react-native-reanimated react-native-gesture-handler
```

关键概念：`useSharedValue` 是一种"住在 UI Thread 里的变量"，修改它的值不经过 JS 线程，所以每帧都无需等 JS 调度，动画绝不卡。`useAnimatedStyle` 是一个监听 SharedValue 变化并自动更新样式的 hook。

```tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

export function DraggableBox() {
  // offsetX/Y 是住在 UI Thread 的变量，手指移动时直接更新，不走 JS
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      offsetX.value = e.translationX;
      offsetY.value = e.translationY;
    })
    .onEnd(() => {
      // 手指抬起 → 弹回原位，弹簧动画
      offsetX.value = withSpring(0);
      offsetY.value = withSpring(0);
    });

  // useAnimatedStyle 自动监听 SharedValue 变化，生成对应样式
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[{ width: 100, height: 100, backgroundColor: 'coral' }, animatedStyle]} />
    </GestureDetector>
  );
}
```

JS 线程不参与每帧计算，即使 JS 线程在执行其他逻辑（如网络请求），动画依然丝滑。

### 案例 3：react-native-web 实现一套代码跑三端

`react-native-web` 把 RN 组件映射到 DOM，配合 Expo，可以让同一套代码跑 iOS / Android / Web（PWA）：

```tsx
// app/(tabs)/index.tsx
import { View, Text, StyleSheet } from 'react-native';

// 这一个文件在 iOS 渲染 UIView + UILabel
// 在 Android 渲染 android.view.View + TextView
// 在 Web 渲染 <div> + <span>
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>三端同构</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold' },
});
```

这套思路适合企业 B 端工具——手机端和 PC Web 都要，又不想维护两套代码库。

## 踩过的坑

1. **三方库未适配新架构**：0.76 升上去后发现某个关键原生库仍用旧 Bridge，编译报 `RCTBridgeModule deprecated`——查 [reactnative.directory](https://reactnative.directory) 确认库的新架构支持状态，必要时等库更新或用 Interop Layer 兜底。

2. **Metro 缓存玄学**：莫名其妙的"红屏"往往不是代码 bug，是 Metro 缓存脏了——`npx expo start --clear` 或 `npx react-native start --reset-cache` 是解决 80% 奇怪报错的第一步。

3. **样式是 CSS 子集，默认 flexDirection: column**：不支持 `float`、`display: grid`、`z-index`（在 iOS 层叠有限制）。Web 背景开发者最常犯的错：把 `flexDirection: 'row'` 忘了写，或者误以为子元素会自动 `display: inline`。

4. **OTA 更新只能推 JS bundle，原生改动必须走应用商店**：添加一个新的原生模块（如推送通知、蓝牙）必须重新编译原生代码并重新提审，Expo Updates / CodePush 的 OTA 热更新只适用于纯 JS 层面的修改。

5. **真机调试 iOS 需要苹果开发者账号**：在真机（非模拟器）测试 iOS，哪怕只是日常开发，也需要每 7 天重新签名或付费 $99/年的开发者账号，Android 无此限制。

## 适用 vs 不适用场景

**适用**：

- 中小团队同时维护 iOS + Android，希望复用业务逻辑代码
- 已有 React web 经验，想快速上手移动端开发
- 内容展示型、表单密集型的企业 B 端移动 App
- 需要 OTA 热更新快速灰度发布（JS 层变更不过审）
- 配合 react-native-web 同时输出移动端 + PWA

**不适用**：

- 游戏或复杂 3D 图形（用 Unity / Unreal / Flutter 的自绘渲染）
- 高度定制的平台原生 UI 体验（如 iOS 的 Custom View Controller 动画、Android 的 Material You 深度整合）
- 团队无任何 JavaScript 经验，从头学成本可能高于学原生
- 对 App 包体积极度敏感（RN 基础包 ~7MB，加 Hermes 运行时和 Fabric 后更大）

## 历史小故事（可跳过）

- **2013 年**：一批 Facebook 工程师在内部 Hackathon 用一周实现了"用 React 写原生 App"的概念验证，主要推动者包括 Christopher Chedeau（vjeux），彼时代号"React Native"。（注：React web 框架的作者是 Jordan Walke，React Native 是另一批人发起的独立项目。）
- **2015 年 3 月**：React Native 在 React.js Conf 上公开，开发者可以写 iOS App；Android 支持于同年 9 月跟进，React Native 正式开源。
- **2018 年**：Facebook 宣布"架构大重写"——Bridge 的性能上限已触及，开始研发 JSI + Fabric（即"新架构"），旷日持久的迁移拉开序幕。
- **2022 年**：新架构进入实验性 opt-in，0.68 起可手动开启；各主流库陆续启动适配。
- **2024 年 10 月，0.76**：新架构正式成为默认选项，React Native 进入"新纪元"。同年推荐生产使用的 Expo SDK 52 与其完全对齐。

## 学到什么

1. **跨平台不等于一次编写零差异**——React Native 让你写更少代码，但 iOS / Android 的平台差异（手势模型、权限、字体、状态栏）仍需分平台处理，"Write Once, Adjust Everywhere"更准确。
2. **架构债会爆**——旧 Bridge 用了 7 年，积累的性能债最终只能通过彻底重写（JSI + Fabric）来还，技术债若在核心链路上，重构成本是指数级的。
3. **生态比框架本身更重要**——Expo、Reanimated、React Navigation 等社区库决定了 RN 能否真的做出好 App；选框架时要同时评估生态成熟度。
4. **从 Bridge 到 JSI 的迁移路径**是一个经典案例：先做互操作层（Interop）维持向后兼容，再逐步推三方库迁移，最后切默认值——大规模迁移不能一刀切。

## 延伸阅读

- 官方文档：[React Native 新架构介绍](https://reactnative.dev/docs/the-new-architecture/landing-page)
- Expo 入门：[Expo Getting Started](https://docs.expo.dev/get-started/introduction/)
- 视频：[React Native EU 2024 — New Architecture Deep Dive](https://www.youtube.com/watch?v=6C54WBBL-Kc)
- [[flutter]] —— 对标项目，Dart 语言自绘渲染，与 RN 桥接原生路线的核心分叉
- [[react]] —— React Native 的直接父框架，组件模型、Hooks、并发渲染均复用
- [[react-server-components]] —— React 18 服务器组件，与 RN 的并发渲染同属一个演进方向

## 关联

- [[react]] —— React Native 的基石，组件模型、Hooks、并发特性完全继承自 React web
- [[flutter]] —— 同为跨平台移动框架，自绘 UI vs 桥接原生，选型时常作对比
- [[react-server-components]] —— React 18 演进方向，RN 新架构的并发渲染与之同源
- [[zustand]] —— React Native 最常配套的轻量状态管理库，比 Redux 少 70% 样板代码
- [[react-hook-form]] —— 表单密集型 App（注册/设置页）的性能优化首选，RN 版同等适用
- [[vite]] —— Metro 是 RN 的专属 bundler，Vite 是 web 端类比；了解 Vite 有助于理解 Metro 的设计取舍

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 让 Web 应用直接变成 App Store 上架的原生应用
- [[cordova]] —— Cordova — 用 HTML/JS 写手机 App 的 WebView 桥
- [[electron]] —— Electron — Chromium + Node.js 跨平台桌面应用框架
- [[expo]] —— Expo — RN 的"开箱即用"工具链 + 云构建 + OTA 更新
- [[flutter]] —— Flutter — Google 自绘像素的跨平台 UI 框架
- [[ionic-framework]] —— Ionic Framework — 用 Web 技术打包原生移动 App
- [[nativescript]] —— NativeScript — JS/TS 直接调原生 API，无 WebView
- [[quasar]] —— Quasar — 一套 Vue 代码，七种平台产物
- [[react]] —— React UI 组件库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[react-server-components]] —— React Server Components — 让组件自己决定在哪台机器跑
- [[tauri]] —— Tauri — Rust 写的 Electron 替代，用系统 webview 打包桌面/移动端应用
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[zulip]] —— Zulip — 强制 topic 的开源团队聊天（Django + Tornado 长轮询）
- [[zustand]] —— Zustand — 极简 React 状态管理

