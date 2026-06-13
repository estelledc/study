---
title: React Native for macOS — 用 JavaScript 写原生 macOS 桌面应用
来源: https://github.com/microsoft/react-native-macos
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

React Native for macOS（简称 RNmacOS）是微软维护的 **React Native 官方 macOS 平台扩展**。日常类比：React Native 像一家连锁餐厅的**统一菜谱**——`<View>`、`<Text>`、`<Pressable>` 是写在纸上的指令；iOS 分店用 UIKit 厨房、Android 分店用 Android 视图厨房。RNmacOS 则是在 Mac 上再开一间**本地厨房**：同一份 JavaScript/TypeScript 菜谱，底下由 **AppKit / Cocoa** 把组件渲染成真正的 macOS 原生窗口、按钮和菜单栏，而不是在 WebView 里套一层网页。

和 React（Web）的本质区别：

| 维度 | React（Web） | React Native for macOS |
|------|--------------|------------------------|
| 渲染目标 | 浏览器 DOM | macOS 原生 AppKit 视图 |
| 运行环境 | Safari / Chrome | 独立 `.app` 桌面进程 |
| 样式模型 | CSS | Flexbox 风格的 StyleSheet |
| 开发机 | 任意系统 | **构建与运行必须在 macOS** |
| 打包产物 | HTML + JS bundle | `.app` / 公证后 `.dmg` |

```jsx
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>你好，macOS</Text>
      <Pressable style={styles.btn} onPress={() => console.log('来自 RNmacOS')}>
        <Text style={styles.btnText}>点我</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 16 },
  btn: { backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 16 },
});
```

这段代码在 iPhone 上走 UIKit，在 Mac 上走 AppKit——**写法相同，底层已是 macOS 原生 UI**。

## 为什么重要

不理解 RNmacOS，以下场景容易选型失误或踩坑：

- **「已有 RN 移动端，能否顺手做 Mac 桌面版？」**——可以，业务层 JS/TS 大量复用，但需 `react-native-macos-init` 生成 `macos/` 原生工程，不是 `npx create-expo-app` 自动就有
- **和 Electron / Tauri 怎么选？**——Electron 是 Chromium + Node，包体与内存通常更大；Tauri 用 Rust + WebView；RNmacOS 走原生控件，与系统外观、菜单栏、VoiceOver 无障碍集成更自然，但 npm 生态里「只支持 Web」的库不能直接搬
- **与 react-native-windows 的关系**——姊妹项目，同属微软 React Native 桌面生态；很多 Fabric 渲染思路从 iOS 移植到 macOS，Windows 侧独立演进
- **Out-of-tree 平台**——`react-native-macos` 是 facebook/react-native 的 **working fork**，版本号需与 `react-native` **次版本对齐**（如 RN 0.81 配 `react-native-macos@0.81.x`）
- **开发机限制**——编译 macOS 应用只能在 Mac 上进行；可在 Linux/Windows 写 JS，但无法本地跑 `run-macos`

## 核心概念

RNmacOS 的心智模型可以拆成 **六块**：

1. **平台包 `react-native-macos`**：npm 依赖，替换/扩展标准 RN 的 macOS 实现。提供 Metro 配置、`run-macos` / `build-macos` CLI、CocoaPods 集成。

2. **`macos/` 原生工程**：由 `npx react-native-macos-init` 生成，内含 Xcode workspace（`macos/{ProjectName}.xcworkspace`）、AppDelegate、Podfile。类比：Mac 端的「厨房设备与布线」，JS 层一般不直接改，但加原生模块时必须动这里。

3. **与 iOS 的高度同构**：官方文档明确——写原生模块/组件的方式与 iOS 几乎相同，只是把 **UIKit 换成 AppKit**。社区库扩展 macOS 时，常在 `.podspec` 里加 `osx`，用 `#if TARGET_OS_OSX` 分支共享代码。

4. **Metro Bundler**：与移动端相同，负责打包 JS、支持 Fast Refresh。开发时通常开两个终端：`npm run start`（Metro）+ `npx react-native run-macos`（编译启动 .app）。

5. **New Architecture（Fabric + TurboModules）**：从 RN 0.71 起 macOS 侧引入 **实验性 Fabric** 预览；与 iOS 一样可通过 `RCT_NEW_ARCH_ENABLED=1` 在 `pod install` 时启用。新应用应关注官方 release 说明，旧 bridge 路径仍在维护期项目中存在。启用后 JS 侧可见 `fabric: true`、`concurrentRoot` 等特征（与 iOS 行为对齐）。

6. **系统要求（2026 年主流环境）**：
   - 运行目标：macOS **Big Sur (11)** 或更新
   - 开发机：macOS + **Xcode**（含 macOS SDK）+ CocoaPods
   - Node.js ≥ 18（与 RN 官方要求一致）
   - `react-native` 与 `react-native-macos` **minor 版本一致**

## 从零创建第一个 macOS 应用

官方推荐流程（以 RN 0.81 为例，具体版本以 [GitHub Releases](https://github.com/microsoft/react-native-macos/releases) 为准）：

```bash
# 1. 创建 RN 项目（版本与 RNmacOS 对齐）
npx @react-native-community/cli init HelloMacOS --version 0.81.2
cd HelloMacOS

# 2. 安装 macOS 平台扩展（写入 react-native-macos 依赖并生成 macos/）
npx react-native-macos-init

# 3. 终端 A：启动 Metro
npm run start

# 4. 终端 B：编译并启动 macOS 应用
npx react-native run-macos
```

**替代方式**：

- 用 Xcode 打开 `macos/HelloMacOS.xcworkspace`，或执行 `xed -b macos`，点击 Run
- 仅构建不启动：`npx react-native build-macos`

首次编译会拉 CocoaPods、编译 C++/Objective-C++ 依赖，**耗时明显**；后续增量构建快很多。

若已有 RN 项目、只想**追加 macOS 目标**，在同一目录执行 `npx react-native-macos-init` 即可，不必重新 `init`。

## 实践案例

### 案例 1：带状态的 macOS 桌面计数器

```jsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>macOS 计数器</Text>
      <Text style={styles.count}>{count}</Text>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => setCount((c) => c - 1)}>
          <Text style={styles.btnText}>−</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.primary]} onPress={() => setCount((c) => c + 1)}>
          <Text style={styles.btnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f7' },
  label: { fontSize: 18, color: '#6e6e73', marginBottom: 8 },
  count: { fontSize: 48, fontWeight: '700', marginBottom: 24 },
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e8e8ed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primary: { backgroundColor: '#007AFF' },
  btnText: { fontSize: 24, color: '#fff' },
});
```

**要点**：

- React Hooks 与 Web 完全一致；RNmacOS 只负责渲染，不绑定状态库
- macOS 窗口默认可缩放；用 `flex: 1` 让内容随窗口变化——桌面应用要考虑**最小窗口尺寸**（可在 `macos/` 原生层配置）
- 键盘快捷键（如 ⌘+、⌘−）需在原生层或 `react-native-keyevent` 等模块扩展，RN 核心不内置全局快捷键 API

### 案例 2：macOS 风格的设置面板（Switch + 平台分支）

桌面应用常见「设置页」。下面演示用 RN 核心组件 + 简单平台判断（与 iOS 共享逻辑，macOS 上 Switch 映射为 AppKit 开关）：

```tsx
import { useState } from 'react';
import { View, Text, Switch, StyleSheet, Platform } from 'react-native';

export function SettingsPanel() {
  const [darkMode, setDarkMode] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);

  const platformLabel =
    Platform.OS === 'macos' ? 'macOS 原生设置' : Platform.OS;

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>{platformLabel}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>深色模式（演示）</Text>
        <Switch value={darkMode} onValueChange={setDarkMode} />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>登录时打开</Text>
        <Switch
          value={launchAtLogin}
          onValueChange={setLaunchAtLogin}
          disabled={Platform.OS !== 'macos'}
        />
      </View>

      {Platform.OS === 'macos' && (
        <Text style={styles.hint}>
          「登录时打开」需调用 SMAppService / LSSharedFileList 等原生 API，此处仅 UI 占位。
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, padding: 24, maxWidth: 480, alignSelf: 'center', width: '100%' },
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d2d2d7',
  },
  label: { fontSize: 16 },
  hint: { marginTop: 16, fontSize: 13, color: '#86868b', lineHeight: 18 },
});
```

**要点**：

- `Platform.OS === 'macos'` 是 RNmacOS 注入的平台标识，用于与 iOS/Android 分支
- 真正「登录项」「菜单栏图标」「沙盒书签」等 **macOS 专属能力** 要写 Native Module（Objective-C++/Swift），或选用已支持 macOS 的社区库
- 扩展原生库时，在 `.podspec` 增加 `s.platforms = { :ios => "15.0", :osx => "12.0" }`，并在实现里 `#import <AppKit/AppKit.h>` 替代 UIKit

## 与相关技术的关系

| 技术 | 关系 |
|------|------|
| React Native | RNmacOS 是 RN 的 macOS 平台实现；共享 JS 运行时与组件模型 |
| react-native-windows | 姊妹项目；微软桌面双端，API 风格相近但原生工程结构不同 |
| Expo | macOS 支持仍属**实验性**；需改 Podfile、`AppDelegate`、Metro 以接入 `expo` 与 autolinking |
| Electron | Electron = Chromium 壳；RNmacOS = AppKit 原生控件，内存与包体通常更优 |
| SwiftUI / AppKit 纯原生 | 苹果第一方 UI；RNmacOS 适合已有 RN 团队复用移动端代码 |
| Tauri | Rust + 系统 WebView；RNmacOS 不依赖 HTML 渲染树 |

已有 macOS 支持的社区模块示例：**react-native-webview**、**react-native-svg**、**react-native-reanimated**、**react-native-gesture-handler** 等——移植自研库时可对照其 Podspec 与 `#if TARGET_OS_OSX` 写法。

## 原生开发速览

若你要写 **Turbo Module / 原生视图**（与 iOS 文档结构相同）：

1. 在 `macos/` 工程或 shared `apple/` 目录添加 Objective-C++ / Swift 实现
2. 用 AppKit 类型（`NSView`、`NSButton`）而非 `UIView`
3. 在 Podspec 声明 `osx` 平台最低版本
4. 运行 `pod install` 后通过 codegen 或手动导出模块给 JS

```objective-c
#if !TARGET_OS_OSX
#import <UIKit/UIKit.h>
#else
#import <AppKit/AppKit.h>
#endif
```

这是 iOS/macOS **双端库** 最常见的条件编译模式。

## 常见问题

**Q：能在 Windows 上编译 macOS 包吗？**  
A：不能。必须有 Mac + Xcode。CI 常用 macOS runner（GitHub Actions `macos-latest` 等）。

**Q：版本号对不齐会怎样？**  
A：`react-native` 与 `react-native-macos` minor 不一致时，Metro、Codegen、原生桥接常出现编译错误或运行时红屏。升级时两者一起升。

**Q：和 iOS 工程能共用 `ios/` 吗？**  
A：业务 JS/TS 共用；原生工程分离——`ios/` 给 iPhone/iPad，`macos/` 给 Mac。部分库把共享原生代码放到 `apple/` 目录。

**Q：如何调试？**  
A：JS 层用 Metro + React DevTools；原生层用 Xcode 断点附加到 `.app` 进程。Fast Refresh 改 JS 即可热更新。

**Q：Expo 托管项目能直接加 macOS 吗？**  
A：需按官方 [Install Expo modules](https://microsoft.github.io/react-native-macos/docs/guides/installing-expo-modules) 改 Podfile、Bundle 脚本与 `AppDelegate`，并改用 `npx expo start`；复杂度高于纯裸 RN。

**Q：发布到 Mac App Store？**  
A：需配置签名、沙盒、公证（notarization）。RNmacOS 产出标准 Xcode 工程，流程与原生 Mac 应用一致，具体以 Apple 当期政策为准。

## 学习路径建议

1. 先掌握 **React Native 基础**（组件、StyleSheet、导航）——RNmacOS 不另起一套 JS API
2. 在 Mac 上走通 **Getting Started**：`cli init` → `react-native-macos-init` → `run-macos`
3. 浏览仓库内 **RNTester** 示例，对照 macOS 上各组件表现
4. 若有 iOS 经验，直接阅读 [Native Development](https://microsoft.github.io/react-native-macos/docs/guides/native-development) 理解 AppKit 差异
5. 需要系统级能力（菜单栏、Touch Bar、Shortcuts）再深入 Turbo Module 与 `macos/` 工程

## 资源

- 官方文档：https://microsoft.github.io/react-native-macos/
- GitHub：https://github.com/microsoft/react-native-macos
- Getting Started：https://microsoft.github.io/react-native-macos/docs/getting-started
- CLI 命令：https://microsoft.github.io/react-native-macos/docs/cli-commands
- 原生开发指南：https://microsoft.github.io/react-native-macos/docs/guides/native-development
- 微软 React Native 博客：https://devblogs.microsoft.com/react-native/
- 姊妹项目 Windows 文档：https://microsoft.github.io/react-native-windows/
