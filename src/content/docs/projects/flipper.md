---
title: Flipper — Meta 出品的移动应用桌面调试平台
来源: https://github.com/facebook/flipper
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

**Flipper** 是 Meta 开源的**移动应用调试平台**：在电脑上用图形界面查看、检查、甚至操控正在真机或模拟器上运行的 iOS / Android App。官方仓库 [facebook/flipper](https://github.com/facebook/flipper)（13k+ stars，MIT）。

日常类比：

> 修汽车时，你不会只靠司机口头描述「发动机有点怪」——你会接 OBD 诊断仪，看转速、油耗、故障码。
> 移动端开发也一样：App 里网络失败、布局错位、数据库写不进去，光在 `console.log` 里翻字符串很痛苦。
> **Flipper 就是手机 App 的「OBD 仪」**：电脑上一块面板，实时看日志、抓 HTTP、点选 UI 树、翻 SQLite，还能装插件扩展能力。

架构上它拆成两半，像对讲机：

| 部件 | 跑在哪 | 干什么 |
|------|--------|--------|
| **Desktop / Server** | 你的 Mac / Linux / Windows（或浏览器） | 展示 UI、装插件、发指令 |
| **Mobile SDK** | App 进程里（仅 Debug 构建） | 采集数据、执行 Desktop 下发的命令 |

两端通过本地网络（ADB / IDB / Metro）通信；Flipper 负责序列化、路由和插件生命周期，你不用自己造 socket 协议。

## 为什么重要

如果你做 **原生 iOS/Android** 或维护 **React Native 0.62–0.69 时代** 的项目，Flipper 曾是事实上的标配调试台。不理解它，这些问题很难高效排查：

- **网络层**：请求发出去了吗？Header / Body 对不对？是证书问题还是 401？Network 插件比 Charles 更贴近 App 进程，且和布局、日志同屏。
- **UI 层**：「这个按钮为什么偏了 8px？」Layout Inspector 直接在原生视图树上点选，比截图量像素靠谱。
- **存储层**：UserDefaults、SharedPreferences、Room / SQLite 里到底写了什么？不用 adb shell 手工 `sqlite3`。
- **可扩展**：团队可以写**自定义插件**——把业务埋点、功能开关、Mock 服务器嵌进 Flipper，新人 onboarding 时不用背一堆 adb 命令。

需要知道的**现状（2024 起）**：

1. **Electron 桌面版停更**：最后带 Electron 安装包的是 [v0.239.0](https://github.com/facebook/flipper/releases/tag/v0.239.0)；之后官方推浏览器版 `npx flipper-server` 或从源码 `yarn start`。
2. **React Native 官方支持冻结在同一版本**：RN 的 React DevTools、Hermes Debugger 等插件在 v0.239.0 之后不再维护；Meta 正在做新的 RN 专用工具链。学 Flipper 仍有价值（原生 Android/iOS、插件架构思想、老项目维护），但**新项目不要把它当 RN 默认方案**。

## 核心概念

### 1. 设备（Device）与 App 是两层连接

连上 Flipper 后，侧边栏里常见**两类「设备」**（RN 场景尤其明显）：

- **React Native 设备**：连的是本机 **Metro** bundler，提供 Reload、Open Dev Menu、Metro Logs、React DevTools 等。
- **真机 / 模拟器设备**：通过 **ADB**（Android）或 **IDB**（iOS）连到跑 App 的进程，承载 Layout、Network、Database 等**原生级**插件。

排查「插件不出现」时，先确认工具栏选中的是**哪一台设备**——很多坑是插件装在原生侧，却盯着 Metro 那一行。

### 2. 插件（Plugin）是一等公民

Flipper 不是单个工具，而是**插件宿主**：

- **内置插件**：Logs、Layout Inspector、Network、Databases、Images、Crash Reporter、Shared Preferences 等。
- **桌面插件**：在 Flipper UI 里渲染面板（TypeScript + React）。
- **客户端插件**：嵌在 App 里（Java / Kotlin / Objective-C / Swift / JavaScript），通过 `FlipperClient` 注册，把数据 `send` 到桌面。

数据流可以记成：

```text
App 内 Client Plugin  --send-->  Flipper Desktop Plugin  --render-->  开发者
                ^                              |
                +-------- receive / call -----+
```

### 3. 仅 Debug 构建

Release 包**不应**也**不会**默认带 Flipper SDK——初始化代码通常放在 `src/debug/` 或通过 `FlipperUtils.shouldEnableFlipper()` 守卫。这既减小包体，也避免生产环境被误连调试器。

### 4. 版本对齐

Desktop 与 App 内 **Flipper SDK 版本**应对齐（如 `FLIPPER_VERSION=0.273.0` 与 Podfile 里 `FlipperKit` 版本一致）。版本错位时常见症状：设备列表为空、插件面板一直 Loading。

## 安装与启动

**最快体验（浏览器版，官方当前推荐路径）**：

```bash
# 需要 Node >= 18；本机已配置 Android SDK / adb 或 Xcode 模拟器
npx flipper-server
```

浏览器会打开 Flipper UI。macOS 也可 `brew install --cask flipper` 安装运行时（仍会打开浏览器）。

**Android 侧前置**：模拟器或 USB 调试已开启，`adb devices` 能看到设备。

**iOS 侧前置**：模拟器或真机已信任，`idb` / Xcode 工具链可用。

## 实践案例

### 案例 1：React Native 项目启用 Flipper（0.62+ 模板默认已集成）

RN 0.62 起 `react-native init` 生成的工程**默认带 Flipper**（仅 Debug）。典型工作流：

```bash
# 终端 1：启动 Flipper（或 npx flipper-server）
open -a Flipper   # 若仍使用 v0.239.0 Electron 包

# 终端 2：跑 App
cd MyApp
yarn ios    # 或 yarn android；首次 iOS 需在 ios/ 下 pod install
```

连上后默认可用插件包括：Layout Inspector、Network、Databases、Images、Shared Preferences、Crash Reporter、React DevTools、Metro Logs。

**升级 SDK 版本**（与 Desktop 对齐）——Android 在 `android/gradle.properties`：

```properties
# 与 npm info flipper 查到的最新版保持一致（RN < 0.69 需注意兼容矩阵）
FLIPPER_VERSION=0.273.0
```

然后在 `android/` 目录执行 `./gradlew clean`，重新编译 Debug 包。

iOS（RN ≥ 0.69）在 `ios/Podfile` 片段：

```ruby
use_react_native!(
  :path => config[:reactNativePath],
  :flipper_configuration => FlipperConfiguration.enabled(
    ['Debug'],
    { 'Flipper' => '0.273.0' }
  )
)
```

执行 `pod install --repo-update` 后重装 App。

### 案例 2：Android 原生 App 注册 Flipper 客户端（Debug 专用）

官方推荐把 Flipper 初始化放在 `src/debug/java/...`，避免打进 Release。Kotlin 示例（摘自 RN Android 手动集成文档的简化版）：

```kotlin
// src/debug/java/com/example/ReactNativeFlipper.kt
package com.example

import android.content.Context
import com.facebook.flipper.android.AndroidFlipperClient
import com.facebook.flipper.android.utils.FlipperUtils
import com.facebook.flipper.plugins.inspector.DescriptorMapping
import com.facebook.flipper.plugins.inspector.InspectorFlipperPlugin
import com.facebook.react.ReactInstanceManager

object ReactNativeFlipper {
  fun initializeFlipper(context: Context, reactInstanceManager: ReactInstanceManager) {
    if (FlipperUtils.shouldEnableFlipper(context)) {
      val client = AndroidFlipperClient.getInstance(context)
      client.addPlugin(
        InspectorFlipperPlugin(context, DescriptorMapping.withDefaults())
      )
      // 还可 addPlugin：NetworkFlipperPlugin、DatabasesFlipperPlugin 等
      client.start()
    }
  }
}
```

`MainApplication.onCreate()` 里仅在 Debug 反射调用（这样 release 源码树甚至不需要这个类）：

```java
if (BuildConfig.DEBUG) {
  try {
    Class<?> flipperClass = Class.forName("com.example.ReactNativeFlipper");
  flipperClass
      .getMethod("initializeFlipper", Context.class, ReactInstanceManager.class)
      .invoke(null, this, getReactNativeHost().getReactInstanceManager());
  } catch (Exception e) {
    e.printStackTrace();
  }
}
```

启动模拟器 → 运行 Debug 包 → 打开 Flipper → 左侧选中设备 → 点 **Layout** 即可在 UI 树上点选 View。

### 案例 3：用 JavaScript 写 RN 自定义插件

无需写原生代码即可把业务数据推到 Flipper 面板。App 侧安装 `react-native-flipper` 后：

```javascript
// App.tsx 或 debug-only 入口
import { addPlugin } from 'react-native-flipper';

addPlugin({
  getId() {
    return 'MyTeamFeatureFlags';
  },
  onConnect(connection) {
  // Desktop 插件连上时，把当前功能开关快照推过去
    connection.send('flagsSnapshot', {
      newCheckout: true,
      darkModeExperiment: false,
    });

    connection.receive('setFlag', (payload) => {
      // 接收 Desktop 发来的指令，例如强制打开某开关做 QA
      console.log('Flipper set flag:', payload.name, payload.value);
    });
  },
  onDisconnect() {
    // 桌面关闭插件 tab 时清理
  },
});
```

桌面侧需要配套插件（TypeScript），`getId()` 与 `devicePlugin` 的 id 一致。官方教程仓库里有 **Tic-Tac-Toe** 示例：`react-native/ReactNativeFlipperExample` + `desktop/plugins/public/rn-tic-tac-toe`，演示 `connection.send` / `receive` 双向通信。

## 内置插件速查

| 插件 | 用途 |
|------|------|
| **Logs** | 过滤、搜索 Logcat / OSLog，比终端滚动舒服 |
| **Layout Inspector** | 原生视图树、属性、截图 |
| **Network** | 拦截 App 内 HTTP(S)（需信任 Flipper 证书时按文档配置） |
| **Databases** | 浏览 SQLite 等 |
| **Shared Preferences / User Defaults** | 看键值存储 |
| **Images** | 缓存图片检查 |
| **Crash Reporter** | 崩溃栈聚合 |
| **React DevTools** | RN 组件树、props / state（仅旧版 Flipper + RN） |

## 常见问题

1. **侧边栏没有 App**：确认是 **Debug 构建**；Release 不会连上。Android 检查 `adb devices`；iOS 检查模拟器是否启动。
2. **RN 只看到 Metro、看不到真机插件**：Metro 要跑着；同时要在设备列表里选 **物理机/模拟器** 那一行，不是只选 "React Native"。
3. **插件装了但不显示**：桌面 Plugin Manager 是否安装对应 desktop 包；App 是否 `pod install` / 重启；**设备选择**是否正确。
4. **Hermes Debugger 空白**：关闭其他 React DevTools 实例；保证只有一个 RN App 在跑；不要同时开「Remote JS Debugging」老式调试。
5. **新版本 Flipper 连不上老项目**：锁定 Desktop **v0.239.0** 并与 `FLIPPER_VERSION` / Podfile 对齐。

## 与同类工具对比

| 工具 | 定位 | 和 Flipper 的关系 |
|------|------|-------------------|
| **Android Studio Layout Inspector** | 官方 UI 调试 | 功能重叠；Flipper 跨 iOS/Android 统一入口 |
| **Charles / Proxyman** | 系统级抓包 | Network 插件更贴进程，但 HTTPS 解密配置各有门槛 |
| **Reactotron** | RN 专用 | 社区有 Flipper 插件移植版 |
| **Chrome DevTools** | Web / 远程 JS 调试 | RN 新架构更偏向 Hermes / Fusebox 路线，Flipper RN 支持已冻结 |

## 学习路径建议

1. **零基础**：装 v0.239.0 或 `npx flipper-server` → 跑官方 `iOS/Sample` 或 `sample` Android 工程 → 点一遍 Logs / Layout / Network。
2. **RN 维护者**：对齐 `FLIPPER_VERSION` → 分清 Metro 设备 vs 真机设备 → 读 [fbflipper.com/docs](https://fbflipper.com/docs/getting-started) 故障排除页。
3. **进阶**：读 `Building a Desktop Plugin` + `Building a React Native Plugin` → 给团队做一个「环境切换 / Mock API」插件。
4. **新项目选型**：原生移动仍可用 Flipper；**RN 新项目**应关注 Meta 新调试工具与 Expo 文档，Flipper 作历史参考即可。

## 小结

Flipper 的核心价值不是某一个面板，而是 **「可插拔的移动调试操作系统」**：统一设备连接、插件协议和 UI 壳。零基础记住三句话就够：

1. **电脑开 Flipper，手机跑 Debug App，两边版本对齐。**
2. **日志 / 布局 / 网络 / 数据库，都是插件；缺能力就写插件。**
3. **RN 生态正在迁移，学架构思想比追最新版号更重要。**

官方文档：[Getting Started](https://fbflipper.com/docs/getting-started) · [React Native](https://fbflipper.com/docs/features/react-native) · [Plugin Tutorial](https://fbflipper.com/docs/tutorial/react-native)
