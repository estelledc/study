---
title: Hermes — Facebook 的 React Native JS 引擎
来源: 'https://github.com/facebook/hermes'
日期: 2026-07-08
分类: 运行时引擎
难度: 中级
---

## 是什么

Hermes 是 Meta（原 Facebook）为 [[react-native]] 打造的 **JavaScript 引擎**：把 JS 在**打包时**编译成紧凑字节码，手机打开 App 时直接加载字节码，而不是现场把源码解析成语法树。

日常类比：普通引擎像每次点菜都现炒——把菜单（JS 源码）当场读一遍再下锅。Hermes 像中央厨房提前备好半成品（字节码）：顾客一到，加热就能上桌。启动更快，包也更小。

它不是浏览器里的 [[v8]]，也不是旧版 RN 默认的 JavaScriptCore。目标很窄：**移动端 RN 的冷启动、内存峰值、包体积**。官方 README 的关键词就是 ahead-of-time 静态优化 + compact bytecode。

一句话：Hermes =「为 React Native 启动速度优化的 JS 虚拟机」，不是通用桌面/服务端引擎。

落到工程里，你通常不会「手写一个 Hermes」：要么在 RN 工程里打开开关，要么用官方 CLI 验证引擎本身。调试时还要分清——Chrome DevTools 里跑的引擎，和用户手机里的 Hermes，经常不是同一个东西。

## 为什么重要

不理解 Hermes，下面这些事很难解释：

- 为什么 RN 文档专门有一页「Enable Hermes」，而不是「随便换个 JS 引擎」
- 为什么同一套 JS，在调试器里用 Chrome 跑、在真机上用 Hermes 跑，行为偶尔不一致
- 为什么发版要盯 Hermes 与 RN 版本对齐——错配最坏会直接闪退
- 为什么移动端要谈「字节码预编译」，而 Web 更常谈 JIT 热路径
- 为什么「包体积变小」和「首屏 JS 执行变快」常常一起出现：解析被前移了

## 核心要点

抓住三件事就够了：

1. **AOT 字节码**：打包时 `hermesc` 把 JS 编成 `.hbc`（Hermes Bytecode）。类比：把菜谱印成速食包，现场只加热。收益是冷启动少做解析/编译。

2. **为启动与内存优化**：设计偏向「第一次打开要快、常驻内存要省」，不是服务端峰值吞吐。类比：电梯要的是开门快、占井道小，不是货运电梯的载重冠军。

3. **与 RN 版本绑定**：每个 Hermes release 对准特定 RN。类比：手机系统和基带固件要成套升级；混用可能「能编译、一运行就崩」。

补充一句边界：Hermes 实现的是 RN 需要的 JS 语言子集与宿主 API 约定；把「浏览器里能跑的任意 npm 包」原样搬进 RN，仍可能踩原生模块或动态特性的坑。

## 实践案例

### 案例 1：在 React Native 里打开 Hermes

```js
// android/gradle.properties（示意）
hermesEnabled=true

// ios：Podfile / 新模板里通常已默认开启
// 以当前 RN 文档「Enable Hermes」为准
```

**逐部分解释**：

- `hermesEnabled=true` 让 Android 构建链走 Hermes，而不是旧 JSC 路径
- iOS 侧在较新 RN 模板里常默认 Hermes；改完要重新 `pod install` / 清构建
- 这是「用上 Hermes」的最短路径：不改业务 JS，先换引擎

### 案例 2：用 CLI 跑一段 JS（官方 README）

```bash
git clone https://github.com/facebook/hermes.git
cmake -S hermes -B build -G Ninja
cmake --build ./build
echo "'use strict'; function hello() { print('Hello'); } hello();" | ./build/bin/hermes
```

**逐部分解释**：

- 前三步编出本地 `hermes` 可执行文件（需要 cmake / Ninja）
- 管道把一行 JS 喂给引擎；`print` 是 Hermes CLI 的输出，不是浏览器 `console.log`
- 适合确认「引擎本身能跑」，和 RN 集成是下一步

### 案例 3：看字节码而不是只看源码体积

```bash
# 概念示意：打包产物里会出现 Hermes bytecode
# Metro / RN 构建在开启 Hermes 后生成 .hbc，再打进 App
ls android/app/build/generated/assets/react/release/ | head
```

**逐部分解释**：

- 开启 Hermes 后，发版包里关键的是字节码资源，而不是整份明文 bundle 现场解析
- 对比前后包体积与冷启动时间（同一机型、杀进程再开）才有意义
- 只看 JS 源码行数，看不到 Hermes 真正省下的「启动期解析」

## 踩过的坑

1. **RN 与 Hermes 版本错配**：官方警告 worst case 直接闪退；升级 RN 时按发布说明成套升级 Hermes。
2. **以为「开了 Hermes = 永远比 V8 快」**：收益主要在启动与内存；跑满的计算热点未必赢过桌面 V8。
3. **调试路径混用**：Dev 里连 Chrome 调试时，执行引擎可能不是设备上的 Hermes，线上问题要在真机/模拟器复现。
4. **依赖 `eval` / 动态代码生成**：AOT 字节码模型下，运行时拼代码的库更容易踩坑，要查兼容列表。
5. **只改一端**：Android 开了 iOS 没开（或反过来），两端性能与 bug 表现会分叉，排障很痛。

## 适用 vs 不适用

**适用**：

- React Native App，关心冷启动（目标常是数百毫秒级体感）与包体积
- 团队愿意跟 RN 版本锁定 Hermes，接受移动端引擎约束
- 需要在 CI 里对 release 包做启动时间回归

**不适用**：

- Node 服务端或浏览器扩展——请用 [[v8]] / 宿主自带引擎
- 强依赖运行时 `eval`、动态 `Function` 的老库且无法替换
- 只想「换引擎试试」却不愿做真机启动对比与版本对齐

## 历史小故事（可跳过）

- **2019 年**：Meta 在 RN 生态公开 Hermes，主打启动时间与内存。
- **2020–2022 年**：逐步成为新 RN 模板默认选项；社区从「可选优化」变成「默认路径」。
- **持续至今**：Hermes 与 RN 发版节奏绑定；README 仍强调「follow Hermes releases strictly」。
- **定位不变**：不是要取代所有 JS 引擎，而是把移动端 RN 的启动问题单独做透。

## 学到什么

1. **引擎要匹配场景**：移动冷启动与服务器吞吐是两道题，Hermes 选了前者。
2. **AOT 用时间换启动**：把解析/编译前移到打包，运行时更轻。
3. **版本是契约**：RN↔Hermes 错配不是小警告，是稳定性问题。
4. **对比要在真机上做**：DevTools 里的引擎 ≠ 用户手机里的引擎。
5. **先开开关，再谈微优化**：多数团队的第一收益来自正确启用与版本对齐，而不是手改字节码。

## 延伸阅读

- 仓库：[facebook/hermes](https://github.com/facebook/hermes)
- RN 文档：[Enable Hermes](https://reactnative.dev/docs/hermes)
- 构建说明：[Building and Running Hermes](https://github.com/facebook/hermes/blob/main/doc/BuildingAndRunning.md)
- 集成说明：[React Native Integration](https://github.com/facebook/hermes/blob/main/doc/ReactNativeIntegration.md)
- [[react-native]] —— Hermes 的主宿主
- [[v8]] —— 对照：JIT 取向的通用 JS 引擎
- [[expo]] —— 常见 RN 工具链，默认路径也围绕 Hermes

## 关联

- [[react-native]] —— Hermes 优化的目标运行时
- [[react]] —— RN 上层 UI 模型仍来自 React 思想
- [[v8]] —— Chrome/Node 引擎，对照 JIT vs AOT
- [[expo]] —— 托管 RN 工作流，常默认 Hermes
- [[preact]] —— 另一条「更轻的 JS UI」路线（Web），问题域不同
- [[react-spring]] —— RN/Web 动画栈常与启动性能一起被问到，但优化层不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

