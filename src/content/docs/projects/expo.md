---
title: Expo — RN 的"开箱即用"工具链 + 云构建 + OTA 更新
来源: 'https://github.com/expo/expo'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

Expo 是 React Native 的"现代入口"：一套把本地开发环境、云端编译、OTA 热更新、应用市场上架打包进同一工具链的开源平台，让你用 JavaScript / TypeScript 写一套代码，同时跑在 Android、iOS 和 Web 上。

日常类比：Expo 就像给汽车预装了自动变速箱、倒车雷达和导航——原本需要你分别搭配采购（Xcode、Android Studio、Metro、CodePush……），Expo 把它们全插好，钥匙一拧就走。

React Native 给你"跑起来"的能力，Expo 给你"发出去"的全套流程：

```bash
# 创建项目
npx create-expo-app@latest my-app

# 在设备上预览（扫码即开）
npx expo start

# 云端构建 iOS 包（无需 Mac 本地环境）
eas build --platform ios

# OTA 热更新，绕过 App Store 审核等待
eas update --branch production --message 'fix: payment crash'
```

核心由三部分构成：**Expo SDK**（统一版本管理的原生模块库）、**EAS**（云端构建/发布服务）、**Expo Router**（文件路由系统，类比 Next.js 的 pages/ 目录）。

## 为什么重要

不理解 Expo，以下问题都没法说清楚：

- 为什么 Windows 开发者也能构建 iOS 包——EAS Build 在云端 Mac 上跑 Xcode，开发者不需要 macOS 本地环境
- 为什么线上 crash 可以不等 App Store 审核（1-3 天）就修好——EAS Update OTA 推 JS bundle，用户重启自动生效
- 为什么 React Native 社区推荐"用 Expo 起步"而不是裸用 React Native CLI——环境搭建、原生依赖升级、config plugin 生态少走大量坑
- 为什么"eject"（弹射）这个词在 RN 社区消失了——Expo 用 CNG（持续原生生成）取代一次性 eject，原生目录随时可重新生成

## 核心要点

Expo 的核心机制可以拆成三块：

1. **Expo SDK + Modules API**：一套经统一版本锁定的 TypeScript 原生模块库（Camera、Location、Notifications 等）。每个 SDK 版本和固定的 React Native 版本绑定，解决了 RN 社区里"库版本互相打架"的痛点。类比：SDK 是预购的零件套装，所有零件保证互相兼容，不用自己找配件。

2. **EAS（Expo Application Services）**：三个主力云服务——`eas build` 在云端编译（Android APK/AAB + iOS IPA，支持自定义原生代码）；`eas update` 推 OTA 热更新 JS bundle；`eas submit` 自动上传到 Google Play 和 App Store。类比：EAS 是你的"外包运维团队"，本地写完代码，剩下的交给云。

3. **CNG（Continuous Native Generation）与 Config Plugin**：`npx expo prebuild` 读取 `app.json` 和已安装的库，**自动生成** `android/` 和 `ios/` 目录，无需手动维护原生工程文件。Config Plugin 是一种在 prebuild 阶段修改原生配置的钩子（如修改 `AndroidManifest.xml`、`Info.plist`），无需直接写原生代码。类比：prebuild 是自动画图纸，config plugin 是"我要在这面墙开一扇窗"的批注。

## 实践案例

### 案例 1：在 Windows 上构建并发布 iOS 应用

传统路线需要 Mac + Xcode，EAS Build 把这一步搬到云端：

```bash
# 初始化 EAS 配置
eas init

# eas.json 指定构建档案
# {
#   "build": {
#     "production": {
#       "ios": { "simulator": false }
#     }
#   }
# }

# 在云端构建 iOS production 包
eas build --platform ios --profile production

# 构建完成后直接提交到 TestFlight
eas submit --platform ios --latest
```

EAS Build 在托管的 Mac 机器上运行 Xcode 和代码签名，开发者只需配置 Apple 开发者账号密钥，整个编译过程约 10-20 分钟。

### 案例 2：OTA 热更新修复线上 Bug

App Store 审核通常需要 1-3 天，EAS Update 可以绕过等待：

```bash
# 修复 bug 后，发布更新到 production 分支
eas update --branch production --message 'fix: checkout crash on iOS 17'

# 检查各渠道更新状态
eas update:list --branch production
```

工作原理：EAS Update 把新的 JavaScript bundle 上传到 CDN，App 启动时检查当前 runtimeVersion 是否匹配，有更新则下载并在下次启动时生效。

**注意**：只能更新 JavaScript 层，不能更改原生模块——如果加了新的原生依赖（如 `expo-camera`），必须重新走 EAS Build 全量编译。

### 案例 3：Expo Router 实现文件路由

Expo Router 是 React Navigation 的上层封装，让路由结构和文件目录一一对应：

```
app/
  _layout.tsx        → 根布局（导航容器）
  index.tsx          → 首页 /
  (tabs)/
    _layout.tsx      → Tab 导航布局
    home.tsx         → /home（Tab 1）
    profile.tsx      → /profile（Tab 2）
  product/
    [id].tsx         → /product/:id（动态路由）
```

```tsx
// app/product/[id].tsx
import { useLocalSearchParams } from 'expo-router';

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>商品 ID：{id}</Text>;
}
```

同样的文件结构同时生成原生 App 路由和 Web 路由（通过 Expo for Web），一套代码覆盖三端。

## 踩过的坑

1. **把 Expo Go 当生产环境用**：Expo Go 是学习沙箱，不能加载自定义原生代码。任何用了第三方原生 SDK（如地图、蓝牙、推送）的真实项目必须用 `Development Build`——它是针对你项目定制的"自己的 Expo Go"。

2. **OTA 更新触发 App Store 违规**：EAS Update 只能推送"修复和内容更新"，不能借此大幅改变 App 主要功能，否则违反苹果 3.3.1(a) 条款。用于 A/B 测试新功能时需谨慎。

3. **prebuild 覆盖手动改动**：一旦手动修改了 `android/` 或 `ios/` 目录，下次 `npx expo prebuild --clean` 会重置这些改动。正确做法是把所有原生配置写进 config plugin，让 prebuild 幂等地生成。

4. **SDK 版本锁定不能乱升**：Expo SDK 版本和 React Native 版本强绑定（如 SDK 51 对应 RN 0.74），不能只升 RN 不升 SDK，需对照官方兼容表一起升，否则原生模块类型不匹配。

## 适用 vs 不适用场景

**适用**：

- 中小型团队想快速把 React 技能迁移到移动端，不想维护双端原生工程
- 需要 OTA 更新频繁推送内容型 App（新闻、电商、活动页）
- Windows 开发者需要构建 iOS 应用（EAS Build 云编译）
- 全栈团队希望一套代码同时覆盖 Web + iOS + Android

**不适用**：

- 对原生性能极度敏感的场景（高频游戏引擎、实时视频处理）——Expo 抽象层带来少量额外开销
- 已有成熟的纯原生 Swift / Kotlin 代码库，迁移成本远大于收益
- 需要深度定制 Build 系统（自定义 Gradle 插件、Xcode Build Phase 脚本复杂度高）
- 团队对 Expo SDK 版本锁定感到束缚，倾向于随时升最新 RN

## 历史小故事（可跳过）

- **2013 年**：Charlie Cheever 和 James Ide 在 React Native 公开发布前就开始构建 Expo，彼时 React Native 生态几乎没有第三方包，他们自己造了 SDK 零件库。
- **2015 年**：React Native 正式公开，Expo 随之进入大众视野，定位为"RN 的开箱即用工具链"。
- **2020 年 12 月**：EAS Build 发布，首次让 Windows 和 Linux 开发者也能在云端构建 iOS 包——"没有 Mac 做不了 iOS App"成了历史。
- **2021 年 4 月（SDK 41）**：`npx expo prebuild` 取代 `expo eject`，"持续原生生成"（CNG）理念正式确立：不再是一次性弹射，而是随时可重新生成。
- **2022 年 8 月（SDK 46）**：`expo eject` 命令彻底废弃，CNG 成为官方唯一推荐的原生自定义路径。
- **2023 年起**：Expo Router 推出并迭代至 v3+，React Native 有了类 Next.js 的文件路由系统，统一了 Web 和 Native 的路由层。

## 学到什么

1. **工具链整合本身就是生产力**——Expo 的价值不在于某一个技术创新，而在于把分散的 RN 生态（Metro、Xcode、Android Studio、CodePush、Fastlane）整合成单一命令行接口
2. **OTA 更新是双刃剑**——绕过审核可以快速修复，但必须理解平台政策边界，功能变更依然需要走全量发布
3. **CNG 取代 eject 是架构思维的胜利**——从"一次性手术"到"随时可再生"，让原生层从"不敢动"的禁区变成可维护的配置
4. **SDK 版本锁定是取舍**——统一版本保证兼容性，代价是比裸 RN 慢半步跟进最新特性

## 延伸阅读

- [Expo 官方文档](https://docs.expo.dev/) — 入门到发布的完整路径，包含 EAS 配置指南
- [EAS Build 文档](https://docs.expo.dev/build/introduction/) — 云端构建详细配置，包含 secrets 管理和 build profile
- [Expo Router 文档](https://docs.expo.dev/router/introduction/) — 文件路由系统完整 API
- [App.js Conf 2025 Keynote](https://www.youtube.com/watch?v=Kqd6VX6s3k4) — Expo 团队年度技术方向分享
- [[react-native]] — Expo 的运行基础，两者关系和选型对比
- [[tanstack-router]] — Web 侧的文件路由对标，理解 Expo Router 设计可类比参考

## 关联

- [[react-native]] —— Expo 构建于 RN 之上，是事实上的现代入口；裸 RN vs Expo 是常见选型决策
- [[react-server-components]] —— Expo Router API Routes 借鉴了 RSC 思路，Web 端组件可在服务器渲染
- [[tanstack-router]] —— 文件路由理念的 Web 侧对标，两者设计哲学（类型安全路由）可对比学习
- [[ansible]] —— CNG（持续原生生成）与 Ansible 幂等运维理念相通：描述目标态，工具保证达到
- [[playwright]] —— EAS 可与 Playwright 结合做 Web 端 E2E 测试，覆盖 Expo Web 分支

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ansible]] —— Ansible — 无 agent 配置管理
- [[electron]] —— Electron — Chromium + Node.js 跨平台桌面应用框架
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[react-native]] —— React Native — 用 React 写、编译成真正的原生 App
- [[react-server-components]] —— React Server Components — 让组件自己决定在哪台机器跑
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由

