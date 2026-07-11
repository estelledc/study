---
title: Expo — 面向 React Native 的“开箱即用”应用生产线
来源: 'https://github.com/expo/expo'
日期: 2026-07-08
分类: 移动开发
难度: 中级
---

## 是什么

Expo 是围绕 React Native 的工具集合与开发平台，核心目标是让移动应用开发在「依赖管理、启动、构建、发布」链路上更低门槛。

日常类比：你做餐厅前一天先把配菜、油盐、锅、配方都准备好。开店后只管做菜，少掉很多杂项流程。Expo 的定位就是给 RN 团队“把工程锅具提前准备好”。

它提供一整套体验：`create-expo-app` 搭建、`expo-router` 路由、OTA 增量更新、预构建与应用商店发布。不是为了替代 RN，而是让 RN 的工程摩擦变小。

## 为什么重要

不理解 Expo 时，很容易把它当“玩具”：

- 有人把它当“只做 demo 的玩具”，其实它的主打是完整交付。
- 有人只看它的 UI 快速开发价值，忽视了其对原生依赖和发布链路的统一治理。
- 有人用 Expo Go 快速验证，却没理解 app config 对生产构建的影响。
- 有人分不清 JS 热修与原生能力变更，结果把必须发商店的改动误推成 OTA。

你真正需要的是它带来的标准化：同一个思路支撑开发、预览、更新和发布。

## 核心要点

1. **管理层统一**：`app.config.json` / `app.config.ts` 统一 app id、版本、权限、深度链接等。类比：一张总菜单，厨房不用各记各的。
2. **路由与文件系统结合**：`expo-router` 用文件路径表达页面，少写一份路由表。类比：文件夹就是楼层指示牌。
3. **构建与发布分离**：EAS Build 负责打包环境，EAS Update 负责 OTA 更新。类比：盖楼和换家具是两件事。
4. **SDK 模块标准化**：相机、定位、通知、文件系统由统一 API 管理，跨平台行为更可预期。
5. **dev 到生产有边界**：能快速试错，但生产仍需签名、权限、证书和商店审核。

## 实践案例

### 案例 1：用 npx 起步（不要全局装脚手架）

```bash
npx create-expo-app@latest my-app
cd my-app
npx expo start
```

**逐部分解释**：

- `npx ...@latest` 临时拉脚手架，避免全局旧版本污染。
- `expo start` 起开发服务器；手机装 Expo Go 扫码，先验证“能跑”。
- 先确认可运行，再决定要不要加自定义原生依赖。

### 案例 2：文件路由做两个 Tab 页

`app/(tabs)/index.tsx`：

```tsx
import { View, Text } from 'react-native';
import { Link } from 'expo-router';

export default function Home() {
  return (
    <View>
      <Text>欢迎</Text>
      <Link href="/profile">我的主页</Link>
    </View>
  );
}
```

`app/(tabs)/profile.tsx`：

```tsx
import { Text } from 'react-native';

export default function Profile() {
  return <Text>个人页</Text>;
}
```

**逐部分解释**：

- `(tabs)` 目录告诉 expo-router：这组页面用底部标签布局。
- 文件名对应路径：`index` → `/`，`profile` → `/profile`。
- `Link` 做应用内跳转；少维护一份手写路由配置。

### 案例 3：OTA 与商店包怎么选

```bash
# 1) 只改 JS/资源：推 OTA（不经商店审核）
eas update --auto

# 2) 改了原生模块 / 权限 / SDK：必须打新二进制
npx eas build --platform ios
npx eas build --platform android
```

**逐部分解释**：

- 步骤 1：热修文案、样式、业务逻辑，可回滚，适合高频小改。
- 步骤 2：原生代码、权限、Expo SDK 大版本变更，必须新包 + 审核。
- 发布前把“何种改动走哪条路”写进团队手册，避免误用 OTA。

## 踩过的坑

1. **把 Expo 当黑盒**：SDK 与原生模块版本不一致会导致行为差异；升级先读 changelog。
2. **过度依赖 Expo Go**：Expo Go 内置模块集合 ≠ 你的生产包；自定义原生代码要用 development build / prebuild。
3. **更新策略混淆**：JS 变更可走 OTA，原生能力变更必须发新二进制。
4. **权限与合规延后**：相机、通知等要在 `app.config` 与商店文案里提前对齐。

## 适用 vs 不适用场景

**适用**：

- 中小型 RN 团队，要在数周内出可提交商店的第一版。
- 多端（iOS/Android）配置重复多，希望用一份 app config 收敛。
- 业务迭代快，且原生定制主要落在 Expo SDK / config plugin 能覆盖的范围。

**不适用**：

- 需要大量自研原生模块，或要深度改动导航/渲染管线。
- 包体、冷启动、桥通信被压到极端指标，必须手控整条编译链。
- 组织政策禁止托管构建（EAS）且又不愿意自建等价 CI 签名流水线。

## 历史小故事（可跳过）

- **早期**：Expo 先把 RN 的环境与模块装配成“能马上跑”的托管体验。
- **经典工作流年代**：ExpoKit 等方案尝试“可弹出原生工程”，但升级摩擦大。
- **CNG / prebuild**：用配置生成原生工程，替代长期手改 ios/android 目录。
- **EAS**：Build 与 Update 拆开后，很多团队把发版从“本机打包”变成云端流水线。
- **到 2020s 中后期**：`expo-router` 成为官方推荐路由，文件路由进入默认模板。

## 学到什么

1. 工程效率来自统一假设：约定清晰，团队就少踩重复坑。
2. OTA 能加快修复，但只能覆盖 JS/资源边界内的改动。
3. 托管平台不是万能：原生能力边界要在立项时写清。
4. Expo 的价值是标准化交付，不是取代对移动端原理的理解。

## 延伸阅读

- 官方文档：[Expo Docs](https://docs.expo.dev)
- EAS Build / EAS Update 手册（看“何时必须打新包”）
- Expo SDK API：相机、定位、通知、文件系统
- [[react-native]] —— Expo 底下的 RN 运行时与原生桥
- [[eas-update]] —— OTA 渠道、运行时版本与回滚策略

## 关联

- [[react-native]] —— Expo 的底层基石
- [[expo-router]] —— 文件路由范式的关键组件
- [[eas-build]] —— 云端签名与多平台打包入口
- [[eas-update]] —— 与 Build 配对的 OTA 通道
- [[appcenter]] —— 另一路 CI 发布对照
- [[firebase]] —— 推送、分析、崩溃治理的常见配套

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 把 Web 应用装进原生 App 的运行时
- [[hermes]] —— Hermes — Facebook 的 React Native JS 引擎
- [[ionic-framework]] —— Ionic Framework — 用网页技术做跨端 App 的 UI 工具箱
- [[nativescript]] —— NativeScript — 用 JS/TS 直接驱动原生控件
- [[react-native]] —— React Native — 一套代码跑多端的跨端运行时
