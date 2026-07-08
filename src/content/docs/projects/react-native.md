---
title: React Native — 一套代码跑多端的跨端运行时
来源: https://github.com/facebook/react-native
日期: 2026-07-08
分类: 移动开发
难度: 中级
---

## 是什么

React Native 是 Meta 用 React 思维搭起的跨平台 App 开发方案。

日常类比：你在同一个厨房做菜，但能同时服务 iOS、Android 两个不同餐厅。
你写一套 React 组件和业务逻辑，底层由桥接层把这套 UI/交互翻译给对应原生系统。

它不是“纯 Web”，也不是“纯 Native”，更像“UI 语义 + 原生适配器”。

从开发者视角，你在 JavaScript 里描述状态、事件和视图。
从手机系统视角，React Native 最后把它映射成 UIKit、Jetpack Compose 或底层视图层 API。

## 为什么重要

- 一套组件树能覆盖 iOS 与 Android，团队人力可复用率明显提高。
- 产品快速试验期，需求更新频繁，热更新和 OTA 能显著缩短发版周期。
- 原生能力（摄像头、权限、推送）仍可逐步下沉，不会被 Web 套壳完全束缚。

早期移动开发常见问题是“复制两套代码”。React Native 的价值就在于减少这种重复。

## 核心要点

1. **Bridge / JS Engine**

- JS 线程维护应用逻辑和状态，原生侧维护界面与系统 API。
- 桥负责跨端通信：事件、属性、回调在两边来回传递。
- 新架构里，Fabric + JSI 让通信模型更直接，减少桥接层抖动。

2. **声明式 UI 与原生渲染树对齐**

- 组件树变化不是直接操作 DOM，而是通过 React 提供的声明式状态描述。
- React reconciliation 决定下一帧 UI 差异，再交给原生层渲染。
- 你可以把它理解为：业务层画草图，原生层负责落笔。

3. **可降级与渐进原生化**

- 你可以先保留大部分 JS 代码，再把性能敏感部分抽到 Native Module。
- 平衡点是开发效率和幂等性：不是所有页面都适合同样策略。
- 一个页面的卡顿并不意味整个应用都该改重写，而是先剖析瓶颈层级。

## 实践案例

### 案例 1：基础页面 + state 更新

```js
import React, { useState } from 'react'
import { View, Text, Button } from 'react-native'

export default function Home() {
  const [count, setCount] = useState(0)
  return (
    <View>
      <Text>已学习：{count}</Text>
      <Button title="再来 1 题" onPress={() => setCount(count + 1)} />
    </View>
  )
}
```

- 先从最小交互起步，确认状态更新链路是否顺。
- 真正复杂的 App 性能问题常在列表滚动和手势层，先别急于上手复杂优化。

### 案例 2：调用原生模块

```js
import { NativeModules } from 'react-native'
const { HapticModule } = NativeModules

export const triggerHaptic = () => HapticModule?.fire()
```

- 原生能力可从 JS 触发，但命名、参数与错误码必须同步管理。
- 用 TypeScript 做参数约束能减少运行期坑。

### 案例 3：离线优先的数据同步

```js
const syncData = async () => {
  const local = await storage.get('drafts')
  const remote = await api.upload(local)
  if (remote.ok) await storage.clear('drafts')
}
```

- React Native 场景里，离线队列、重试、幂等是“业务正确性”问题。
- 你可以把“离线草稿”当成最关键的状态优先级。

## 踩过的坑

1. **把平台差异当同质化问题**：Android 的手势、iOS 的键盘行为差异会导致同一套代码奇怪表现。
2. **把桥接调用当免费**：高频调用过多会带来线程争用，先做批量化。
3. **忽视字体/阴影/布局细节**：小视觉差最终会拉低体验且难补。
4. **把热更新当生产级补丁万能药**：有些崩溃需要原生修复，不是 JS 打补丁能解决。

## 适用 vs 不适用场景

**适用**：
- 中小到中大型应用，需要同时覆盖两端，但功能主路径一致。
- 产品变化快，需求验证周期短，优先求交付速度。
- 团队已有 React 生态经验，能够形成统一工程约定。

**不适用**：
- 高强度 3D 游戏或 120 帧严格实时渲染。
- 底层原生体验要求极高且短周期内必须手工打磨每像素。
- 团队原生能力很强且业务几乎完全端差异化。

## 历史小故事（可跳过）

- 2010 年代，跨端热潮兴起时，企业都在寻找“同一套代码，多套发行物”模式。
- React Native 在这一波中走上前台，强调组件模型的复用。
- 随着大规模应用落地，桥接性能和并发一致性压力被明确暴露。
- 新架构对 Fabric、JSI 的引入，其实是为了从根上收敛这些争议。

## 学到什么

1. 统一代码不等于统一体验，平台差异永远要独立验证。
2. 学习曲线里最值钱的不是 API 数量，而是“跨线程状态可追踪”。
3. 你先做业务正确，再优化渲染；顺序反过来会误判问题。
4. JS 到原生的边界是你最关键的接口治理点。

## 延伸阅读

- 官方文档：[React Native 文档](https://reactnative.dev/docs/getting-started)
- 生态实践：[新架构官方说明](https://reactnative.dev/docs/next/the-new-architecture/landing-page)
- 社区资料：fabric + js runtime 的迁移经验
- 同类对比：[[flutter]] —— 更一致的渲染抽象路线
- 相关：[[expo]] —— 受控开发体验与发布流程

## 关联

- [[react]] —— RN 视图模型背后的声明式 UI 与状态管理
- [[javascript]] —— 运行时逻辑始于 JS 生态
- [[android]] —— Native 侧资源与权限约束
- [[ios]] —— 视图生命周期与原生生命周期同步
- [[fabric]] —— RN 新架构关键执行路径
- [[jsi]] —— 跨语言边界调用的重要升级点
- [[turbo-modules]] —— 原生模块加载与调用优化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[weex]] —— 早期跨端框架路线的一次历史对照
- [[ionic]] —— 纯 Web 思路的跨端替代路径
- [[flutter]] —— 声明式渲染在另一路线的实践
- [[expo]] —— 约束开发环境换取更快上手
- [[expo-router]] —— 文件路由与 RN 导航的一种实践
