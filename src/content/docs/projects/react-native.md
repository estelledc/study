---
title: React Native — 一套代码跑多端的跨端运行时
来源: https://github.com/facebook/react-native
日期: 2026-07-08
分类: 移动开发
难度: 中级
---

## 是什么

React Native（**RN**）是 Meta（原 Facebook）用 React 思维搭起的跨平台 App 方案：你写一套 JS/TS 组件，两端各自长出**原生控件**，不是套一个浏览器壳。

日常类比：同一份剧本，两个剧场各自搭景——iOS 用 UIKit 布景，Android 用系统 View 布景。中间有个**传话员**（旧架构叫 Bridge）把「台词、走位、道具」在 JS 世界和原生世界之间来回传。

它不是「纯 Web」，也不是「手写两套 Native」：更像「UI 语义用 React 描述 + 原生适配器落地」。

## 为什么重要

不理解 React Native，下面这些事都没法解释：

- 为什么同一套组件树能同时覆盖 iOS 与 Android，团队人力可复用
- 为什么产品试验期改 UI 往往比双端各发一版商店包更快（JS 热重载；**OTA/热更新**通常靠 CodePush 等第三方，且受商店政策约束，不是官方标配万能药）
- 为什么摄像头、推送等仍可下沉到 Native Module，不被 WebView 完全束缚
- 为什么列表卡顿、手势掉帧常常出在「JS 线程 ↔ 原生线程」边界，而不是「React 写错了」一句话能概括

早期移动开发常见「复制两套代码」。RN 的价值是减少重复，同时保留原生渲染。

## 核心要点

1. **Bridge / JS Engine（传话员 + 剧本引擎）**
   - JS 线程跑业务与状态；原生侧管界面与系统 API。
   - 旧 Bridge：消息要排队、序列化，像传话员一次只能递一张纸条——高频调用会堵。
   - 新架构用 **JSI**（JavaScript Interface，让 JS 直接握到原生对象）+ **Fabric**（新渲染管线）减少「传话抖动」。

2. **声明式 UI → 原生视图树**
   - 你改的是状态，不是手搓 DOM；React **reconciliation**（对账：算出这帧和上帧差在哪）决定补丁。
   - 补丁交给原生层落成 UIView / `android.view`，不是默认 Jetpack Compose。
   - 类比：业务层画草图，原生层负责落笔。

3. **渐进原生化**
   - 大部分页面可留在 JS；性能敏感处再抽 Native Module / Turbo Module。
   - 平衡点是交付速度 vs 平台打磨——不是「幂等」口号，而是「同一操作重复触发结果可预期」（比如支付按钮防双击）。
   - 一页卡顿不等于整 App 重写：先分清卡在 JS、布局，还是原生模块。

## 实践案例

### 案例 1：最小页面 + state

```js
import React, { useState } from 'react'
import { View, Text, Button } from 'react-native'

export default function Home() {
  const [count, setCount] = useState(0)
  return (
    <View>
      <Text>已学习：{count}</Text>
      <Button title="再来 1 题" onPress={() => setCount(c => c + 1)} />
    </View>
  )
}
```

1. `useState` 留在 JS 线程；点按钮只改状态。
2. RN 把 `<View>/<Text>` 映射成两端原生控件。
3. 先确认这条链路顺，再碰列表虚拟化与手势。

### 案例 2：调用原生模块（示意）

```js
import { NativeModules } from 'react-native'
const { HapticModule } = NativeModules
export const triggerHaptic = () => {
  if (!HapticModule?.fire) throw new Error('HapticModule missing')
  return HapticModule.fire()
}
```

1. JS 侧只拿得到已注册的模块名与方法。
2. iOS/Android 各自实现同名模块；参数与错误码要双端对齐。
3. 用 TypeScript 包一层，避免运行期才发现 `undefined is not a function`。

### 案例 3：离线草稿同步（示意三步）

```js
// storage / api 为项目里的封装，此处示意
async function syncDrafts({ storage, api }) {
  const local = await storage.get('drafts')       // 1. 读本地队列
  const remote = await api.upload(local)         // 2. 上传（需幂等键）
  if (remote.ok) await storage.clear('drafts')   // 3. 成功再清
}
```

离线队列、重试、幂等键是业务正确性问题；RN 只提供跑代码的舞台。

## 踩过的坑

1. **平台差异当同质**：Android 返回键 / iOS 键盘避让会导致「同一套 JSX」表现分叉——两端各测主路径。
2. **桥接当免费**：滚动中每帧打原生 → JS 线程争用；先批量、降频，再考虑 JSI/新架构。
3. **忽视像素级细节**：字体、阴影、Safe Area 小差会堆成「廉价感」，设计稿要对平台分量。
4. **热更新当万能药**：JS 逻辑可 OTA；原生崩溃、权限模型、商店审核失败必须发二进制包。

## 适用 vs 不适用场景

**适用**：

- 主路径 UI 一致的中小到中大型业务 App（电商、内容、工具）
- 要同时覆盖两端，团队已有 React 经验
- 能接受第三方原生模块，并预留新架构（Fabric/TurboModules）迁移成本

**不适用**：

- 120fps 级游戏 / 重 3D / 严格实时渲染
- 短周期内必须每像素平台定制（强依赖独特原生控件）
- 团队原生很强且业务几乎完全端差异化——双端原生可能更省事

## 历史小故事（可跳过）

- **2015**：Facebook 开源 React Native（先 iOS，后 Android），旧 Bridge 异步 JSON 传话成为默认模型。
- **2018 起**：内部推进新架构——JSI、Fabric、TurboModules，要解决桥接瓶颈。
- **2021 前后**：Meta 自家 App 大规模落地新架构；开源侧随后 opt-in。
- **近年**：新架构逐步成为新项目默认；旧 Bridge 进入迁移与兼容长尾。

## 学到什么

1. 统一代码 ≠ 统一体验；平台差异要独立验证。
2. 最值钱的不是 API 数量，而是能追踪「跨线程状态」。
3. 先保证业务正确，再优化渲染；顺序反了会误判。
4. JS↔原生边界是接口治理的核心，也是性能事故高发区。

## 延伸阅读

- [React Native 官方入门](https://reactnative.dev/docs/getting-started)
- [新架构说明](https://reactnative.dev/docs/the-new-architecture/landing-page)
- 同类对比：[[flutter]] —— 自绘引擎、更一致的渲染抽象
- 相关：[[expo]] —— 受控工具链与发布流程
- 底层：[[react]] —— 声明式 UI 与状态模型

## 关联

- [[react]] —— RN 视图模型背后的声明式 UI
- [[javascript]] —— 业务逻辑跑在 JS 引擎
- [[android]] —— 权限、生命周期与 View 体系
- [[ios]] —— UIKit 生命周期与手势
- [[fabric]] —— 新架构渲染路径
- [[jsi]] —— 跨语言直接调用
- [[turbo-modules]] —— 原生模块懒加载与类型化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 把 Web 应用装进原生 App 的运行时
- [[cordova]] —— Cordova — 用 Web 技术打包移动 App 的老牌桥梁
- [[expo]] —— Expo — 面向 React Native 的“开箱即用”应用生产线
- [[hermes]] —— Hermes — Facebook 的 React Native JS 引擎
- [[ionic-framework]] —— Ionic Framework — 用网页技术做跨端 App 的 UI 工具箱
- [[nativescript]] —— NativeScript — 用 JS/TS 直接驱动原生控件
- [[neutralinojs]] —— neutralinojs — 系统 WebView 上的极简桌面壳
- [[nodegui]] —— nodegui — 用 Node.js 写原生桌面窗口
- [[scrcpy]] —— scrcpy — Android 屏幕镜像 / 录制
- [[zulip]] —— Zulip — 强制 topic 的开源团队聊天（Django + Tornado 长轮询）
