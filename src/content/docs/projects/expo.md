---
title: Expo — RN 的"开箱即用"工具链 + 云构建 + OTA 更新
来源: 'https://github.com/expo/expo'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

Expo 是一个开源平台，让你用 React 和 JavaScript 写出能在 Android、iOS 和 Web 上**原生运行**的应用。日常类比：它像一个「全套婚宴服务商」——你只需要决定婚礼风格，场地、装饰、餐饮、主持、摄影全包，你不用搞清楚搭台子的铆钉规格。

具体来说，Expo 提供三层东西：**Expo SDK**（一套版本统一管理的 TypeScript 原生模块，比如相机、GPS、推送通知）；**EAS**（Expo Application Services，云端编译 + OTA 热更新 + 应用商店提交）；以及 **CNG**（持续原生生成，`npx expo prebuild` 自动从 `app.json` 生成 `android/` 和 `ios/` 目录，用 Config Plugin 机制扩展原生配置）。

开发者每天用 Expo 的姿势很具体：在本地跑 `npx expo start`，手机上装 Expo Go 扫二维码，热重载直接在设备上看效果；要发布就 `eas build`，不需要本地 Xcode 或 Android Studio，云端的 Mac 机器帮你编译出 `.ipa`。

## 为什么重要

不理解 Expo，下面这些事都没法解释：

- 为什么 Windows 开发者也能发布 iOS 应用——EAS Build 在云端 Mac 上跑 Xcode，本地不需要 Apple 硬件
- 为什么 React Native 应用能"秒级修 bug"——EAS Update 把新 JS bundle 推送给已安装用户，绕过应用商店审核周期
- 为什么 `expo eject` 在 2022 年彻底消失——CNG 的"持续原生生成"思路让你不再需要永久 eject
- 为什么 React Native 生态以 Expo SDK 版本号为协调点——它锁定了 RN 版本 + 原生模块的兼容矩阵

## 核心要点

**1. EAS Build — 云端编译机**

本地运行 `eas build --platform ios` 后，代码 push 到 EAS 服务器，云端的 Mac 机器（Apple Silicon）跑完整 Xcode 编译，10-20 分钟后你拿到 `.ipa` 或 `.apk`。整个过程不需要本地 Xcode，也不需要 Apple 开发者账号配好的 provisioning profile——EAS 帮你自动管理签名证书。

类比：就像 GitHub Actions，但专门为 iOS/Android 构建优化，证书管理是内置服务而不是你自己写 CI yaml 搞的。

**2. EAS Update — OTA 热更新**

JavaScript bundle 是"可更新层"，原生二进制是"稳定层"。EAS Update 只推送新的 JS bundle，用户下次打开 app 自动静默下载并生效（或在后台预加载，下次冷启动生效）。这个机制绕过了 App Store 审核（通常 1-3 天），适合紧急 bug 修复。

```bash
eas update --branch production --message "fix: payment crash"
```

**3. Expo Router — 文件即路由**

类比 Next.js 的 `app/` 目录：在 `app/` 下放 `.tsx` 文件，Expo Router 自动生成对应的 React Navigation 路由，同时生成 Web 版路由（通过 Expo Web 支持）。

```tsx
// app/(tabs)/profile.tsx  → /profile 路由（Tab 里）
// app/post/[id].tsx       → /post/:id 动态路由
// app/_layout.tsx         → 整个 app 的根 Layout
```

这三层加起来构成 Expo 的核心价值主张：**写一次代码，从本地开发到云端构建到 OTA 推送，全流程不需要打开 Xcode 或 Android Studio**。

## 实践案例

### 案例 1：Windows 开发者构建 iOS 包

场景：你的团队用 Windows 工作站，没有 Mac，但需要发布 iOS 应用。

```bash
# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账号
eas login

# 初始化 EAS 配置（生成 eas.json）
eas build:configure

# 云端构建 iOS（不需要本地 Mac）
eas build --platform ios --profile production
```

构建完成后，EAS 在控制台显示下载链接，你直接把 `.ipa` 上传到 TestFlight 或通过 `eas submit` 自动提交到 App Store Connect。整个过程发生在 EAS 的 Mac 构建机上，本地只需要 Node.js 环境。

关键洞察：证书管理也被 EAS 接管——`eas credentials` 命令可以让 EAS 自动生成、更新 Apple Distribution Certificate 和 Provisioning Profile，彻底告别 Apple Developer Portal 的证书噩梦。

### 案例 2：OTA 热更新修复线上崩溃

场景：生产环境用户反馈支付页面崩溃，需要在 30 分钟内修复推出，不能等 App Store 审核。

```bash
# 修复代码后
git add . && git commit -m "fix: null check in payment handler"

# 推送 OTA 更新到 production 分支
eas update --branch production --message "fix: payment crash hotfix"
# → 约 2-3 分钟后，已安装用户在下次打开 app 时自动获得修复
```

`eas.json` 里的 channel 配置让你可以精确控制哪个构建包接收哪个分支的更新：

```json
{
  "build": {
    "production": {
      "channel": "production"
    },
    "preview": {
      "channel": "preview"
    }
  }
}
```

关键洞察：OTA 更新只影响 JS 层——如果修复需要改原生代码（比如添加新的原生模块），仍然需要走完整构建和应用商店审核流程。

### 案例 3：用 Expo Router 构建 Tab + 嵌套路由

场景：构建一个有底部 Tab、个人页有嵌套路由的 App。

```
app/
├── _layout.tsx          ← 根 Layout（Stack 或 Tabs）
├── (tabs)/
│   ├── _layout.tsx      ← Tab 配置（图标、label）
│   ├── index.tsx        ← 首页 Tab
│   ├── explore.tsx      ← 探索 Tab
│   └── profile/
│       ├── index.tsx    ← 个人主页
│       └── [userId].tsx ← 动态路由：/profile/123
└── modal.tsx            ← 全局 Modal（在根 Stack 外）
```

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: '首页', tabBarIcon: ... }} />
      <Tabs.Screen name="explore" options={{ title: '探索' }} />
      <Tabs.Screen name="profile" options={{ title: '我的' }} />
    </Tabs>
  );
}
```

关键洞察：括号目录 `(tabs)/` 是"路由组"——它给路由分组但不影响 URL 路径。文件里的 `href` 属性可以用字符串路径（`/profile/123`）或类型化对象（`{ pathname: '/profile/[userId]', params: { userId: '123' } }`），后者有 TypeScript 类型补全。

## 踩过的坑

1. **Expo Go ≠ 生产环境**：Expo Go 是沙箱应用，只能运行 Expo SDK 内置的原生模块。任何需要自定义原生代码的第三方库（比如 `react-native-vision-camera`、`react-native-maps` 的某些功能）在 Expo Go 里完全无法使用，必须改用 Development Build（`eas build --profile development`）。

2. **OTA 更新违规风险**：App Store 条款 3.3.1(a) 禁止用 OTA 大幅改变应用的主要功能或引入新的 native 能力。用 EAS Update 修 bug、调 UI、换文案完全合规；用它推一个"全新功能的大更新"则有被下架的风险。

3. **`prebuild` 会覆盖手改的原生文件**：如果你曾经手动改过 `android/` 或 `ios/` 目录（比如加了一段 Java 代码），再跑 `npx expo prebuild` 会根据 Config Plugin 重新生成这两个目录，手改会被覆盖。正确做法：把所有原生修改封装成 Config Plugin，而不是直接改原生文件。

4. **SDK 版本锁定链**：Expo SDK 版本和 React Native 版本一一对应（如 SDK 52 对应 RN 0.76），不能跳版本升级，也不能单独升 RN。升级时必须查 Expo 官方升级文档，因为每次升级都有一批 breaking changes 和需要手动迁移的 API。

## 适用 vs 不适用场景

**适用**：
- 中小团队或独立开发者，没有专职 iOS / Android 工程师，需要快速上线 React Native 应用
- 需要 OTA 热更新能力（bug 修复、文案更新、A/B 测试）
- 跨平台应用（iOS + Android + Web 同一套代码）
- 原型和 MVP 阶段，需要快速迭代验证

**不适用**：
- 应用里大量依赖尚未有 Config Plugin 支持的原生 SDK（如特定硬件 SDK、银行级安全模块）
- 需要深度定制 iOS 或 Android 原生层，且不愿意维护 Config Plugin
- 对应用包体积极致优化（Expo SDK 带了一组基础原生模块，哪怕没用到也会占体积）
- 游戏类应用（RN 本身不适合，Expo 也不例外）

## 历史小故事（可跳过）

- **2013 年**：Charlie Cheever 和 James Ide 在 React Native 对外发布之前开始构建 Expo，当时 RN 连第三方包生态都没有，他们自己造 SDK。
- **2015 年**：React Native 正式发布，Expo 随之进入大众视野，定位为「React Native 的开箱即用工具链」。
- **2020 年 12 月**：EAS Build 发布，第一次让 Windows 开发者也能云端构建 iOS 包，「必须有 Mac 才能做 iOS 开发」成为历史。
- **2021 年 4 月（SDK 41）**：`npx expo prebuild` 取代 `expo eject`，「持续原生生成」（CNG）理念确立——你可以随时 prebuild 而不是永久 eject，原生目录变成了可以重新生成的产物。
- **2022 年 8 月（SDK 46）**：`expo eject` 命令彻底废弃，CNG 成为官方唯一推荐的原生自定义路径。「eject 就回不去了」的时代结束。
- **2023 年起**：Expo Router 推出，React Native 有了类 Next.js 的文件路由系统，统一 Web 和 Native 的路由层，同时带来了 Server Components on Native 的实验性支持。

## 学到什么

1. **工具链的价值在于决策数量**：Expo 的核心竞争力不是技术，而是帮你减少了几十个"怎么配置原生环境"的决策，换来了更快的第一天上手速度
2. **OTA 更新是双刃剑**：能绕过审核周期快速推修复，但要清楚哪类改动合规、哪类有风险，以及 native 层的改动始终需要走完整发布流程
3. **CNG 思路值得学习**：把原生目录当成"可重新生成的构建产物"而不是"手工维护的源文件"，这个架构决策让配置可组合、可覆盖、可版本化
4. **生态绑定有代价**：用 Expo SDK 换来的便利，是 SDK 版本升级节奏由 Expo 团队控制，RN 社区的最新特性可能要等 Expo 支持才能用

## 延伸阅读

- 官方文档：[Expo Docs — Get Started](https://docs.expo.dev/)（从零到运行的最权威指南）
- EAS 文档：[Expo Application Services](https://docs.expo.dev/eas/)（云构建 + OTA 更新完整说明）
- Expo Router 文档：[Expo Router Introduction](https://docs.expo.dev/router/introduction/)（文件路由 + Web 支持详解）
- 视频：[Simon Grimm — Expo Router v3 Full Course](https://www.youtube.com/watch?v=rIYzLhkG9TA)（2 小时实战，含 Tab + Stack + Modal）
- Config Plugin 开发：[Creating a Config Plugin](https://docs.expo.dev/config-plugins/development-and-debugging/)

## 关联

- [[react-native]] —— Expo 的运行时基础，Expo SDK 是对 RN 原生模块的统一封装
- [[react-server-components]] —— Expo Router 正在引入 Server Components on Native，同一个 RSC 思路延伸到移动端
- [[tanstack-router]] —— 同为文件路由思路，TanStack Router 在 Web 端做了类似的 URL → 类型系统打通
- [[playwright]] —— Web 端自动化测试，Expo Web 应用可用 Playwright 做 E2E；移动端对应 Detox
- [[fastapi]] —— Expo 应用的常见后端选择，FastAPI 提供快速搭建的 REST API 层
- [[ansible]] —— 基础设施自动化，与 EAS 的"声明式配置驱动构建"有异曲同工之妙

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ansible]] —— Ansible — 无 agent 配置管理
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[react-native]] —— React Native — 用 React 写、编译成真正的原生 App
- [[react-server-components]] —— React Server Components — 让组件自己决定在哪台机器跑
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由

