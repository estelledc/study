---
title: React Native for Windows — 用 JavaScript 写原生 Windows 桌面应用
来源: https://github.com/microsoft/react-native-windows
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

React Native for Windows（简称 RNW）是微软维护的 **React Native 官方 Windows 平台扩展**。日常类比：React Native 原本是一套「多国语言菜单」——同一份 JavaScript 菜谱，iOS 厨房做 iOS 菜、Android 厨房做 Android 菜；RNW 相当于在 Windows 餐厅里加了一间**本地厨房**，把 `<View>`、`<Text>` 这些 RN 指令翻译成 Windows 原生 UI（WinUI / XAML 控件），而不是塞进 WebView 里跑网页。

和 React Web 的本质区别：

| 维度 | React（Web） | React Native for Windows |
|------|--------------|---------------------------|
| 渲染目标 | 浏览器 DOM | Windows 原生控件 |
| 运行环境 | Chrome / Edge | UWP / Win32 桌面进程 |
| 样式模型 | CSS | Flexbox 风格的 StyleSheet |
| 打包产物 | HTML + JS bundle | `.exe` / MSIX 安装包 |

```jsx
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>你好，Windows</Text>
      <Pressable style={styles.btn} onPress={() => alert('来自 RNW')}>
        <Text style={styles.btnText}>点我</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 16 },
  btn: { backgroundColor: '#0078d4', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 4 },
  btnText: { color: '#fff', fontSize: 16 },
});
```

这段代码在 iOS/Android 上走各自原生视图；在 Windows 上，RNW 的 Fabric 渲染器把它映射成 XAML 元素树——**看起来仍是 RN 写法，底下已是 Windows UI**。

## 为什么重要

不理解 RNW，以下场景容易选型失误或踩坑：

- **「已有 RN 移动端，能否顺手做 Windows 桌面版？」**——可以，业务层 JS/TS 大量复用，但需单独 `init-windows` 生成 `windows/` 原生工程，不是自动就有
- **和 Electron 怎么选？**——Electron 本质是 Chromium + Node；RNW 走原生控件，内存占用通常更低，和系统外观/无障碍集成更好，但生态和 Web 库兼容性不如 Electron
- **架构大换血（2025–2026）**——RNW 0.80 起新应用默认 **New Architecture（Fabric）**；0.82 已**完全移除旧 Paper 渲染器**，升级前必须完成迁移
- **开发机必须是 Windows**——构建、调试、签名都依赖 Visual Studio 2022 + Windows SDK；Mac 上只能写 JS，不能编译 Windows 包
- **微软长期投入**——GitHub 17k+ stars，Office / Xbox 等内部场景有落地；与 [Fluent UI React Native](https://github.com/microsoft/fluentui-react-native) 组件库配套，适合企业风桌面 UI

## 核心概念

RNW 的心智模型可以拆成 **六块**：

1. **平台包 `react-native-windows`**：npm 依赖，版本号与 `react-native` 主版本对齐（如 RN 0.80 配 `react-native-windows@0.80.x`）。它提供 Windows 原生桥接、Metro 配置扩展、CLI 子命令。

2. **`windows/` 原生工程**：由 `react-native init-windows` 生成，内含 C++/WinRT 或（旧模板）C# UWP 项目、`.sln` 解决方案、NuGet 依赖。类比：这是 Windows 端的「厨房设备说明书」，JS 层不直接碰，但升级 RNW 时常需同步改这里。

3. **New Architecture（Fabric + TurboModules）**：
   - **Fabric**：新一代同步渲染器，替代旧 Paper；支持更 predictable 的布局与并发特性
   - **TurboModules**：原生模块的 JSI 直连，减少异步 bridge 开销
   - 0.76 首次预览 → 0.80 新应用默认 → **0.82 仅 Fabric，Paper 已删除**
   - 旧项目**不能**靠一个开关启用，必须在 `init-windows` 时选 `--template cpp-app`（新）或 `old/uwp-cpp-app`（旧）

4. **模板（Templates）**：
   - `cpp-app`：新架构 C++ Win32 应用（推荐，预编译 NuGet，构建更快）
   - `cpp-lib`：新架构 Turbo Module 库
   - `old/uwp-cpp-app`：旧 Paper 架构（0.82 前遗留项目）
   - 首次 `init-windows` 不传 `--template` 时，0.80+ 默认 `cpp-app`

5. **CLI 工作流**：
   - `npx react-native run-windows`：编译并启动 Windows 应用（Debug/Release）
   - `npx react-native autolink-windows`：扫描 npm 依赖里带 Windows 实现的库并链接
   - Metro bundler 仍负责打包 JS，与移动端同一套热重载体验

6. **系统要求（2026 年主流环境）**：
   - Windows 10/11，Node.js ≥ 18
   - **Visual Studio 2022**（17.11+），工作负载「使用 C++ 的桌面开发」+ Windows 10/11 SDK（≥ 10.0.22621）
   - 启用**开发者模式**（Settings → Privacy & security → For developers）
   - CLI 通过 `vswhere` 查找 VS；Insiders 版 VS 2026 可能尚未被识别，需用正式 VS 2022

## 从零创建第一个 RNW 应用

官方推荐流程（以 RNW 0.80+ / Fabric 为例）：

```bash
# 1. 创建 RN 项目（版本与 RNW 对齐）
npx @react-native-community/cli@latest init HelloWindows --version 0.80.0
cd HelloWindows

# 2. 添加 Windows 平台依赖
yarn add react-native-windows@^0.80.0

# 3. 生成 windows/ 原生工程（新架构模板）
yarn react-native init-windows --template cpp-app --overwrite

# 4. 运行
npx react-native run-windows
```

成功后会弹出 Win32 窗口，Metro 终端支持 **Fast Refresh**——改 JS 保存即刷新，和移动端开发节奏一致。

若需旧架构（仅维护遗留项目，0.82 前）：

```bash
yarn react-native init-windows --template old/uwp-cpp-app --overwrite
```

## 实践案例

### 案例 1：带状态的 Windows 桌面计数器

```jsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>Windows 计数器</Text>
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
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f3f3' },
  label: { fontSize: 18, color: '#605e5c', marginBottom: 8 },
  count: { fontSize: 48, fontWeight: '700', marginBottom: 24 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#e1dfdd', justifyContent: 'center', alignItems: 'center' },
  primary: { backgroundColor: '#0078d4' },
  btnText: { fontSize: 24, color: '#fff' },
});
```

**要点**：

- `useState` 与 Web/React 完全一致；RNW 不负责状态管理，只负责把 JSX 变原生 UI
- `flexDirection: 'row'` 在 Windows 上与 iOS 相同——RN 默认纵向 flex，行布局需显式指定
- 键盘快捷键、窗口标题栏等系统行为可在 `windows/` 原生层或 `react-native-windows` 提供的 API 中扩展

### 案例 2：调用 Windows 原生能力（Turbo Module 概念）

许多能力已有社区模块（如 `@react-native-clipboard/clipboard`）；若需自定义原生代码，新架构下写 **Turbo Module**。JS 侧消费长这样：

```tsx
// NativeTimeModule.ts — JS 接口
import { TurboModuleRegistry } from 'react-native';

export interface Spec {
  getLocalTime(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeTime');
```

```tsx
// ClockScreen.tsx — 在组件里用
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NativeTime from './NativeTimeModule';

export function ClockScreen() {
  const [time, setTime] = useState('');

  useEffect(() => {
    setTime(NativeTime.getLocalTime());
    const id = setInterval(() => setTime(NativeTime.getLocalTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.box}>
      <Text style={styles.h1}>系统本地时间</Text>
      <Text style={styles.time}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 20, marginBottom: 12 },
  time: { fontFamily: 'Consolas', fontSize: 32 },
});
```

C++ 实现放在 `windows/` 工程内，通过 codegen 与 JS 绑定。完整步骤见官方 [Native Modules (TurboModules)](https://microsoft.github.io/react-native-windows/docs/native-modules) 文档。类比：Turbo Module 是「直通厨房的内部电话」，比旧 bridge 的「写纸条等回调」延迟更低。

## 与相关技术的关系

| 技术 | 关系 |
|------|------|
| React Native | RNW 是 RN 的 Windows 平台实现；共享 JS 运行时与组件模型 |
| react-native-macos | 姊妹项目，同一 monorepo 生态，macOS 桌面端 |
| Expo | 官方 Windows 支持仍在演进；复杂原生需求常用裸 RN + RNW |
| Electron | 两者都做桌面；Electron = Web 技术栈，RNW = 原生控件 |
| WinUI 3 / .NET MAUI | 微软原生 UI 框架；RNW 适合已有 RN 团队，MAUI 适合纯 C# 团队 |
| Fluent UI React Native | 微软出品的 RN 跨平台 Fluent 组件，Windows 上体验最佳 |

## Paper → Fabric 迁移要点

若项目仍标注 `old/uwp-cpp-app` 或使用 Paper，升级到 RNW 0.82 **必须先迁移**：

1. 备份 `windows/` 目录与 `package.json` 锁文件
2. 升级 `react-native` 与 `react-native-windows` 到目标版本（如 0.80 → 0.82）
3. 重新执行 `yarn react-native init-windows --template cpp-app --overwrite`（会覆盖原生工程）
4. 手动合并自定义原生代码、应用 manifest、证书配置
5. 跑通 `npx react-native run-windows`，对照 [Calculator 迁移示例](https://github.com/microsoft/react-native-windows-samples/tree/main/samples/Calculator) 排查差异

微软提供 [Migration Guide](https://microsoft.github.io/react-native-windows/docs/migration-guide) 与 RNTester 对照应用；**React Native Gallery**（Microsoft Store 可下载）展示各组件在 Fabric 下的实际表现。

## 常见问题

**Q：能在 WSL 里编译吗？**  
A：不推荐。RNW 依赖 MSBuild、VC++ 工具链和 Windows SDK，应在 Windows 本机或 Windows CI 代理上构建。

**Q：和 UWP 商店发布的关系？**  
A：新 `cpp-app` 模板面向 Win32；旧 UWP 模板仍可用于 Microsoft Store，但新功能优先投入 Fabric Win32 路径。发布前查当前版本 [打包文档](https://microsoft.github.io/react-native-windows/docs/publishing)。

**Q：Expo 项目能直接加 RNW 吗？**  
A：Expo 托管工作流以移动端为主；Windows 支持需 eject / prebuild 后手动集成 RNW，工程复杂度明显高于纯 Expo 工作流。

**Q：调试工具？**  
A：Chrome/Edge DevTools 调试 JS；原生层用 Visual Studio 附加到进程；Flipper 支持因版本而异，以官方文档为准。

## 学习路径建议

1. 先掌握 **React Native 基础**（组件、StyleSheet、导航）——RNW 不另起一套 JS API
2. 在 Windows 本机走通 **Getting Started** 四步：init → add → init-windows → run-windows
3. 安装 **React Native Gallery**，对照组件行为
4. 阅读 **New Architecture** 文档，新项目直接用 `cpp-app`
5. 有原生需求时再学 Turbo Module 与 `windows/` 工程结构

## 资源

- 官方文档：https://microsoft.github.io/react-native-windows/
- GitHub：https://github.com/microsoft/react-native-windows
- 示例仓库：https://github.com/microsoft/react-native-windows-samples
- 微软 Learn 入门：https://learn.microsoft.com/en-us/windows/dev-environment/javascript/react-native-for-windows
- 博客（版本发布）：https://devblogs.microsoft.com/react-native/
- 快速链接：aka.ms/reactnative
