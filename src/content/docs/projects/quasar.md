---
title: Quasar Framework — 一套代码跑 Vue 全端的应用框架
来源: 'https://github.com/quasarframework/quasar'
日期: 2026-07-08
分类: 开源工具
难度: 中级
---

## 是什么

Quasar 是 Vue 生态里的**全端脚手架 + 组件库**：你写一套页面、路由和状态，用 CLI 的 `-m` 模式打出 SPA、SSR、PWA、Electron 桌面端或 Capacitor/Cordova 移动端。

日常类比：像**同一套乐高积木，换不同底座**——客厅地板（网页）、带轮子的底座（PWA 可离线）、带外壳的底座（Electron 窗口）。积木（Vue 组件）不用重买，换的是底座和打包方式。

它的卖点不是「又一个 UI 库」，而是**同一仓库、多目标发布**：业务逻辑写一遍，分发策略用配置切换。对小团队来说，少维护一套 CI 和一套路由约定，往往比多几个组件更值钱。

## 为什么重要

如果你把 Quasar 只当前端组件库，会忽略它真正价值：

- 你会把相同业务逻辑在 Web / 桌面 / 移动多个仓库里重写
- 你会在补 PWA 或 Electron 时推翻原有路由与构建链路
- 团队会把性能优化分叉到每个端单独做，文档也跟着分叉
- 「全端统一」听起来很虚，其实是工程约定成熟度问题

## 核心要点

1. **CLI + 模式驱动**：`quasar create` / `quasar dev` / `quasar build`，用 `-m` 选目标。类比：同一份菜谱，烤箱模式 vs 空气炸锅模式。

```bash
npm init quasar
cd my-app
quasar dev -m spa       # 默认网页
quasar dev -m pwa       # 同一项目切 PWA
quasar build -m electron
```

2. **组件与路由一套复用**：Quasar UI + Vue Router / Pinia 在各模式下共用。类比：店面装修图纸不变，只换开在商场还是路边摊。

3. **平台差异进配置/插件，不进业务核心**：Node API、Service Worker、原生插件按模式注入。类比：底座配件另装，积木本体保持干净。

## 实践案例

### 案例 1：同一项目从 SPA 切到 PWA

```bash
# 1) 若尚未加 PWA 模式，先装模式
quasar mode add pwa

# 2) 开发态用 PWA 底座跑
quasar dev -m pwa

# 3) 生产构建
quasar build -m pwa
```

**逐部分解释**：

- `mode add pwa`：往工程里加 service worker / manifest 模板，**不改**业务页面
- `dev -m pwa`：同一套 router/store，只换可离线底座
- 你主要调的是缓存策略与图标，而不是再开第二个仓库

### 案例 2：同一业务打出 Electron 桌面包

```bash
quasar mode add electron
quasar dev -m electron          # 弹出桌面窗口预览
quasar build -m electron        # 产出安装包/可执行文件
```

**逐部分解释**：

- 窗口壳（主进程）由 Electron 模式提供；渲染层仍是你的 Vue 页面
- 需要读本地文件时，用 Quasar/Electron 桥，**不要**在组件顶层直接 `require('fs')`
- 结果：Web 与桌面共享 90%+ 业务代码，差异集中在壳与权限

### 案例 3：SSR 做公开页 SEO

```bash
quasar mode add ssr
quasar dev -m ssr
quasar build -m ssr
```

**逐部分解释**：

- SSR 让首屏 HTML 在服务端生成，搜索引擎能直接看到内容
- store 初始化要分清「只在服务端跑一次」vs「客户端水合」，避免把请求级状态写进全局单例
- 同一内容层可同时服务 SPA 与 SSR，不必重写文案组件

## 踩过的坑

1. **过度依赖默认配置**：大版本升级后 `quasar.config` 默认值会变，关键行为（代理、PWA 策略）应显式写死。
2. **一锅端导致包体积膨胀**：多模式依赖树变大；上线前用构建分析看首屏 JS，目标常压到可接受的数百 KB 级。
3. **Web-only 组件直接上移动端**：Capacitor 下部分 DOM API 行为不同，要用平台条件渲染。
4. **SSR 与客户端共享 store 竞态**：把「每请求状态」做成工厂函数，别用模块级可变单例。
5. **Electron 变慢就怪框架**：多半是 renderer 塞进了过重依赖；先做体积分析，再查主进程阻塞。

## 适用 vs 不适用场景

**适用**：

- 新项目要同时覆盖 ≥2 端（网页 + 桌面或移动），团队 ≤15 人想单仓协作
- 已选定 Vue，需要统一组件视觉与 CLI 约定
- MVP 阶段要快速验证多端，而不是先搭三套脚手架

**不适用**：

- 只做单一 Web 端且要极致定制打包（直接 Vite + 自选 UI 更轻）
- 非 Vue 技术栈，或已在 Ionic / React Native 深度绑定
- 需要重度原生 UI / 特殊原生模块，跨端抽象会变成负担

## 历史小故事（可跳过）

- **2015–2016**：Razvan Stoenescu 起步，把 Vue 组件与多端构建想法收成框架
- **2019 前后**：Quasar v1 稳定，CLI + 多 mode 成为卖点
- **2020s**：Vite 成为默认开发体验，PWA / Electron / Capacitor 文档补齐
- **今天**：定位仍是「一套 Vue 工程，多端编译」，适合产品主干持续交付

## 学到什么

1. **多端首先是工程治理，不只是库能力**
2. **把变更点推到配置层（`-m` / 插件），端间重复会显著下降**
3. **路由、状态、组件只做一遍，是高复用的最短路径**
4. **平台差异必须显式声明**，否则「统一」会变成隐性 bug

## 延伸阅读

- 官方文档：[quasar.dev](https://quasar.dev/)（安装、build mode、部署）
- Quasar CLI 模式说明：spa / ssr / pwa / electron / capacitor
- Vue 官方文档：组合式 API 与状态管理
- [[vue]] —— Quasar 的技术底座
- [[pwa]] —— 离线与更新策略
- [[electron]] —— 桌面壳对照
- 官方论坛：典型「mode 切不过去 / SSR 水合失败」排障帖

## 关联

- [[vue]] —— 组件逻辑与生态基础
- [[vite]] —— 打包与开发体验核心
- [[capacitor]] —— 移动端跨平台实践
- [[electron]] —— 桌面分发链路
- [[ssr]] —— 搜索引擎友好的部署范式
- [[ionic]] —— 另一套移动优先跨端方案
- [[tauri]] —— 更轻量的桌面壳替代路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
