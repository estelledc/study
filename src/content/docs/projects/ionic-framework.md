---
title: Ionic Framework — 用网页技术做跨端 App 的 UI 工具箱
description: 介绍 Ionic Framework 9.0.1 如何用 Stencil Web Components、mode 主题和 v9 拆开的 URL 路由 / ion-nav 堆栈做跨端 UI。
来源: https://github.com/ionic-team/ionic-framework
日期: 2026-08-27
分类: 移动端跨平台
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/ionic-team/ionic-framework
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d696a6aecfee59f99eca3c712887a5195a811dbb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.0.1
---

## 是什么

**Ionic Framework** 是一套用 **HTML / CSS / JS Web Components** 做移动端手感 UI 的工具箱。日常类比：同一套店面装修图纸——按钮、列表、导航栈按 iOS 或 Material 两套 `mode` 施工；水电（相机、推送、文件系统）不在这份图纸里，常见是另接 [[capacitor]]。

固定 `v9.0.1` 的本体是 `@ionic/core`（Stencil 4 编译）。`@ionic/react` / `@ionic/vue` / `@ionic/angular` 都是 **同一套自定义元素的薄包装**：调用 `defineCustomElement()`，再桥接 props / 事件。仓库里没有 Capacitor 运行时，只有读取 `window.Capacitor` 的探测代码。

它不发明新的 JS 引擎，也不画系统原生控件。和 [[expo]] 的差别可以记一句：Ionic 画网页控件，Expo / RN 画原生视图。

## 为什么重要

不理解“组件在 core、壳在 Capacitor、路由在框架适配器”，下面这些事会搅成一团：

- 为什么 Angular / React / Vue 能共用同一套 `<ion-button>`，却仍要各自的 router 包
- 为什么改 CSS 变量就能换肤，而不用给每个按钮写 class
- 为什么 v9 里把页面推进 `ion-nav`，地址栏却不再跟着变
- 为什么“hybrid 慢”常常是首屏塞了太多组件，而不是 Ionic 自己又做了一套运行时

## 核心机制与架构流程

固定 9.0.1 可以拆成五段：

1. **Stencil 出两份组件交付**。`core/stencil.config.ts` 同时打 lazy bundle（`@ionic/core/loader`）和 per-component 自定义元素（`@ionic/core/components/ion-*.js`）。路由、overlay、`ion-app` 不走自动生成的框架 proxy，由各框架包手写。

2. **`mode` 决定皮肤，不是决定原生内核**。`initialize()` 的优先级是：用户传入的 `IonicConfig.mode` → `<html mode>` → `isPlatform(..., 'ios') ? 'ios' : 'md'`。然后给 `documentElement` 写 `mode` 属性并加上 `ios` / `md` class。组件还可沿祖先覆盖。主题色来自 SCSS 映射生成的 `--ion-color-primary` 等变量。

3. **框架入口只做两件事**：加 `ion-ce` class（自定义元素构建没有 Stencil hydration），再调用 core 的 `initialize(config)`。React 是 `setupIonicReact`；Vue 是 `IonicVue.install`；Angular v9 默认走 standalone 的 `provideIonicAngular()`，`IonicModule` 已弃用。

4. **v9 把 URL 路由和命令式堆栈拆开**。`ion-router` 只认 `ion-tabs` / `ion-router-outlet`（选择器写明 `:not([no-router])`，**不包括 `ion-nav`**）。`ion-nav` 变成不写 URL 的命令式栈；`setRouteId` / `getRouteId` / `updateURL` 已删。React 侧 `routerLink` 不是 React Router 的 `<Link>`：`createRoutingComponent` 拦截点击后走 `NavContext.navigate()`。`@ionic/react-router` / `@ionic/vue-router` 源码不在本轮 sparse 树里；BREAKING.md 要求 React Router **v6.4+**、Vue Router **v5**。

5. **Overlay 是挂到 app 根上的自定义元素**。`createOverlay` 等 `customElements.whenDefined(tagName)`，`document.createElement`，`Object.assign` 选项（并打上 `hasController: true`），再 `appendChild` 到 app root。之后走元素自己的 `present()` / `dismiss()`。React 用 `createControllerComponent`（Alert / Toast 等）或 `createOverlayComponent`（Modal / Popover）；也可以声明式 `isOpen` / `trigger`。

配置合并顺序：sessionStorage（`persistConfig`）→ 已有 `window.Ionic.config` → URL 查询 `ionic:` 前缀 → `setupIonicReact(config)` 等用户配置。`hardwareBackButton` 默认在 hybrid / CloseWatcher 可用时打开。

## 实践案例

### 案例 1：React 入口只初始化 core，不自己重写按钮

```tsx
import { setupIonicReact, IonApp, IonPage, IonContent, IonButton } from '@ionic/react';

setupIonicReact();

export default function Home() {
  return (
    <IonApp>
      <IonPage>
        <IonContent className="ion-padding">
          <IonButton>报名</IonButton>
        </IonContent>
      </IonPage>
    </IonApp>
  );
}
```

**逐部分**：

- `setupIonicReact` 给 `<html>` 加 `ion-ce`，再 `initialize()`
- `IonButton` 仍是 `<ion-button>` 自定义元素，不是再画一遍 React DOM 按钮
- 若要页面栈动画，还要把框架 router 和 `IonRouterOutlet` 接上；本页未打开 `@ionic/react-router` 源码

### 案例 2：用 token 换肤，而不是覆盖每个组件

```css
:root {
  --ion-color-primary: #0b6e4f;
  --ion-color-primary-contrast: #ffffff;
}
```

`core.scss` 按调色板生成 `--ion-color-*`、`*-rgb`、`*-contrast`。`html.ios` / `html.md` 还会改默认字体变量。这是设计 token，不是“每个按钮手写 class”。

### 案例 3：控制器创建的是 DOM 节点

```ts
import { toastController } from '@ionic/core';

const toast = await toastController.create({
  message: '已保存',
  duration: 2000,
});
await toast.present();
```

`create` 并不“调用原生 Toast API”。它等到 `ion-toast` 定义好，建元素、赋 props、挂到 app root，再 `present()`。要声明式控制时，用组件的 `isOpen`，而不是再包一层幽灵 React 树。

## 踩过的坑

1. **把 Ionic 当成 Native SDK**：GPU / AR / 低延迟音视频仍要原生模块；本仓库只提供 UI 与多数业务页。
2. **继续把 `ion-nav` 当路由器出口**：v9 源码和 BREAKING.md 都写明它不再更新 URL，也不再被 `ion-router` 选中。
3. **React 仍按 v5 写 `component` / `exact` / `IonRedirect`**：v9 要求 React Router v6 的 `element`，重定向改 `<Navigate replace />`。
4. **Capacitor 2 的 `isNative` 探测**：`platform.ts` 只认 `Capacitor.isNativePlatform()`；BREAKING.md 的底线是 Capacitor 7+、iOS 16+、Safari 16+、Chrome 89+。
5. **把 `@ionic/core` 的内部路径当公共 API**：v9 加了 `exports` allowlist，未列出的路径在 Node ESM 下会断。

## 适用 vs 不适用场景

**适用**：

- 团队以 Web 技能为主，要同时覆盖 iOS / Android / Web，UI 一致性优先
- 表单、列表、中轻度交互；主题能用 CSS 变量映射到设计系统
- 接受 Angular 18+ / React 18–19 / Vue 3.5+ 这些 v9 peer 底线
- 原生能力另选 [[capacitor]]（或遗留 [[cordova]]），不和 UI 层绑死

**不适用**：

- 必须像素级系统控件或极致手势——对照 [[react-native]] / [[expo]] / 纯原生
- 对启动帧率有游戏级硬指标，又不愿做原生桥
- 已经有成熟双端 native 库，只差几个 Web 页
- 还停在 Capacitor 2 / React Router v5 / Angular NgModule 默认导入，又不能做 v9 迁移

## 固定版本边界

- 本文绑定 `ionic-team/ionic-framework@d696a6aecfee59f99eca3c712887a5195a811dbb`，即 annotated tag `v9.0.1` peel 后的 commit。tag 提交说明就是 `v9.0.1`。
- 同树 `@ionic/core` / `@ionic/react` / `@ionic/vue` / `@ionic/angular` 均为 `9.0.1`。`lerna.json` 的 `version` 同为 `9.0.1`。
- npm `@ionic/core@9.0.1` 与 `@ionic/react@9.0.1` 的 `gitHead` 是父提交 `ea91babf5fd26fe4993ac1a2d27fbb8f9989503c`（Renovate 更新 CodeQL action），比 tag 少那一次版本提交。本页绑定 tag peel，不绑定 npm `gitHead`。
- v9.0.0 是 2026-08-19 的破坏性主版本；v9.0.1 只修 overlay 移位、picker-column、react-router 动画跳过等。
- `@ionic/react-router`、`@ionic/vue-router` 以及编译产物 `dist/` / `loader/` 未纳入本轮 sparse 阅读。
- 本文未在浏览器或真机运行、未执行 `cap sync`、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **Ionic 的真相是“一套 CE + 三套说明书”**，不是三个独立 UI 库。
2. **`mode` 管观感，Capacitor 管原生能力**，两层问题不要混着骂。
3. **v9 以后 URL 路由和 `ion-nav` 堆栈是两条合同**。
4. **Overlay 的控制器只是在造 DOM**，不调用系统 Toast / Dialog。

## 应用型自测

1. `initialize()` 没传 `mode`、`<html>` 也没写 `mode` 时，Android Chrome 上默认会落到 `ios` 还是 `md`？
2. v9 的 `ion-router` 会不会把 `ion-nav` 当成 outlet？
3. `toastController.create()` 成功后，页面上多出来的是系统原生 toast，还是一个 `ion-toast` 自定义元素？

检查点：

1. `md`。回退是 `isPlatform(win, 'ios') ? 'ios' : 'md'`。
2. 不会。`OUTLET_SELECTOR` 只有 `ion-tabs` 与 `ion-router-outlet`。
3. 后者。`createOverlay` 做的是 `document.createElement(tagName)` 再挂到 app root。

## 延伸阅读

- 官方仓库：[ionic-team/ionic-framework](https://github.com/ionic-team/ionic-framework) —— 本文绑定提交 `d696a6aecfee59f99eca3c712887a5195a811dbb`
- 官方文档：[Ionic Docs](https://ionicframework.com/docs/)
- Capacitor 文档：[Capacitor Docs](https://capacitorjs.com/docs)
- [[capacitor]] —— 官方推荐的原生桥，不在本仓库发布
- [[expo]] —— RN 托管工具链，对标“快速开箱”但视图模型不同
- [[react-native]] —— JS 驱动原生视图的对照路线

## 关联

- [[capacitor]] —— 把 Web 产物装进 iOS / Android 并调原生 API
- [[cordova]] —— Capacitor 之前的 hybrid 桥，探测代码仍在
- [[react-native]] —— 用原生视图而不是 Web 组件做跨端 UI
- [[flutter]] —— 自绘引擎对照
- [[expo]] —— React Native 的配置驱动工具链
- [[electron]] —— 桌面端自带 Chromium 的亲戚思路
- [[nativescript]] —— 用 JS 调原生 UI，而不是 WebView

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 把 Web 应用装进原生 App 的运行时
- [[cordova]] —— Cordova — 用 Web 技术打包移动 App 的老牌桥梁
- [[nativescript]] —— NativeScript — 用 JS/TS 直接驱动原生控件
