---
title: Tauri — Rust 写的 Electron 替代，用系统 webview 打包桌面/移动端应用
来源: 'https://github.com/tauri-apps/tauri'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

Tauri 是一个让你用**任意 Web 前端框架写 UI、用 Rust 写后端逻辑**，最终打包成跨平台原生应用的框架。最直白的类比：把 Electron 里那个捆绑的 Chromium 换成系统自带的 WebView，就像把专程带来的空调扔掉，改用酒店自带空调——入住体积从 100MB 缩到不到 1MB。

系统 WebView 具体是：macOS/iOS 用 WKWebView，Windows 用 WebView2，Linux 用 WebKitGTK，Android 用 Android System WebView（这些都是各系统自带的浏览器渲染内核，不需要额外安装，就像 macOS 自带 Safari 的渲染引擎一样）。Tauri 通过 `wry` 这个抽象层把它们统一成同一套 API，你的前端代码一份，Rust 后端一份，构建出的 `.app` / `.dmg` / `.deb` / `.exe` / `.apk` 包含的只是你自己的代码，没有内置浏览器引擎。

JS 和 Rust 之间的通信是 **IPC invoke 桥**：前端调 `invoke('my_command', { arg: 42 })`，Rust 侧注册同名 `#[tauri::command]` 函数接收并返回序列化结果。这条桥既是 Tauri 的核心也是它的边界——所有跨语言调用都经过这里。

```typescript
// 前端 (TypeScript)
import { invoke } from '@tauri-apps/api/core';
const result = await invoke<string>('greet', { name: 'world' });
```

```rust
// 后端 (Rust)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
```

## 为什么重要

不理解 Tauri，下面这些事都没法解释：

- 为什么 2024 年之后越来越多开发者工具（数据库 GUI、REST 客户端、AI 助手）体积突然缩小 90%，内存占用也低了
- 为什么写 Rust 不一定要写纯 CLI，Web 前端生态（React/Vue/Svelte/Solid）可以直接复用
- 为什么跨平台应用"共用代码库"但 Capacitor 和 React Native 需要不同的原生插件，而 Tauri v2 移动端用相同的 Rust 插件接口
- 为什么系统 WebView 既是 Tauri 的优势也是它的风险：版本分叉时 CSS 渲染差异会让 Linux 和 macOS 上的同一 UI 看起来略有不同

## 核心要点

Tauri 的架构可以分成 **三层**：

1. **前端层（任意 Web 框架）**：通过 `tauri://localhost` 协议内嵌 HTML/JS/CSS 资源，不起 HTTP server，浏览器同源策略内不出网。CSP 由 `tauri.conf.json` 的 `security.csp` 字段控制，默认严格模式。

2. **IPC 桥（invoke / event）**：JS 端用 `invoke()` 做单次 RQ-RS 调用，用 `listen()` 做 Rust→JS 事件推送，用 `emit()` 做 JS→Rust 事件广播。序列化层是 `serde_json`（Rust 标准 JSON 序列化库，负责把 Rust 结构体自动变成 JSON 字符串传给 JS），边界上 TypeScript 类型要与 Rust 结构体手工对齐（或用 `ts-rs` 自动生成）。

3. **Rust Core + 插件生态**：`tauri::Builder` 注册命令、菜单、系统托盘、更新器；官方 `tauri-plugin-*` 插件覆盖文件系统、HTTP 客户端、Shell 执行、数据库（SQLite）、通知、Store 持久化等；v2 加入 Swift/Kotlin 绑定，原生能力通过插件暴露。

三层合在一起的效果：前端开发体验与纯 Web 应用相同（热重载、DevTools），但有完整的系统访问权限（文件、进程、通知），打包后体积仅系统 WebView 之外的 Rust 二进制 + 资源。

## 实践案例

### 案例 1：本地 AI 助手 GUI

场景：把 llama.cpp 包成带聊天界面的桌面客户端，体积控制在 5MB 以内（模型文件另存）。

前端用 SvelteKit，`invoke('infer', { prompt, model_path })` 触发推理，Rust 侧通过 FFI 调 llama.cpp C 库，流式返回 token 用 `app.emit_all('token', t)` 推送到 JS 端渲染。

```rust
// 以下为概念示意，实际 llama.cpp FFI 绑定需配置 llama-cpp-2 crate
#[tauri::command]
async fn infer(
    app: tauri::AppHandle,
    prompt: String,
    model_path: String,
) -> Result<(), String> {
    // FFI 调用 llama.cpp，每拿到一个 token 就 emit
    let model = load_model(&model_path).map_err(|e| e.to_string())?;
    model.infer_stream(&prompt, |token| {
        app.emit_all("token", token).ok();
    });
    Ok(())
}
```

关键点：大二进制（模型权重）不走 invoke，Rust 直接读文件系统，避免序列化瓶颈。

### 案例 2：数据库管理客户端

场景：类 TablePlus 的 SQLite / PostgreSQL GUI，需要直连数据库、显示表结构、执行查询。

Rust 侧集成 `sqlx`，注册 `connect`、`query`、`list_tables` 等命令。前端用 React + TanStack Table 渲染结果集。

```rust
#[tauri::command]
async fn query(
    state: tauri::State<'_, DbState>,
    sql: String,
) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query(&sql)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    rows.iter().map(row_to_json).collect()
}
```

优势：不需要 localhost server，数据库凭据只在 Rust 进程内，不暴露给 WebView 的 JS 上下文（默认 CSP 阻止外部请求）。

### 案例 3：跨平台笔记编辑器（macOS + Windows + Linux）

场景：类 Obsidian 的 Markdown 编辑器，前端用 ProseMirror，Rust 侧做文件 I/O、加密存储、全文搜索。

用 `tauri-plugin-fs` 做文件访问（细粒度权限声明在 `capabilities/` 目录），用 `tauri-plugin-store` 持久化用户设置，用 `tantivy`（Rust 搜索引擎）做全文索引。

```json
// capabilities/default.json
{
  "permissions": [
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:scope": [{ "path": "$DOCUMENT/**" }]
  ]
}
```

Tauri v2 的 capabilities 系统比 v1 的 `allowlist` 更细粒度：每条权限声明到具体 API + 路径范围，越界调用直接被 Rust 层拒绝，不需要在 JS 侧做鉴权。

## 踩过的坑

1. **WebKitGTK on Linux 的渲染差异**：WebKitGTK 版本滞后于 WKWebView，某些 CSS property（`backdrop-filter`、`mask-image`、部分 `grid` subgrid）在 Ubuntu 22.04 上不支持或表现不一致。打包发布前必须在 Linux VM 里跑完整 UI 测试，不能只在 macOS 开发机上看。

2. **invoke 不能直接传 ArrayBuffer / Blob**：大文件或二进制数据不能通过 `invoke()` 序列化传递（走 JSON 会爆内存）。正确姿势是 Rust 侧返回 `tauri::ipc::Response`（原始字节），或用 `tauri-plugin-fs` 直接在 Rust 侧读写文件，完全绕开 JS 层。

3. **开发环境依赖链复杂**：macOS 需要 Xcode CLT，Linux 需要 `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`，Windows 需要 WebView2 Evergreen（Win11 自带，Win7/8 需手动装）。CI 矩阵里漏一个系统包，编译失败报错信息指向 Rust crate 而不是缺失的系统库，新人容易踩。

4. **v2 移动端插件生态仍在追赶**：Tauri v2 移动端 2024 年 10 月才 GA，Bluetooth、Camera、Push Notification 等官方插件要么还在 beta，要么需要自己写 Swift（iOS）/ Kotlin（Android）绑定。现阶段移动端原生能力密集的项目，Capacitor 或 React Native 的生态更成熟。

## 适用 vs 不适用场景

**适用**：

- 桌面工具类应用：已有 Web 前端技术栈（React/Vue/Svelte），希望一套代码打出 macOS/Windows/Linux 三端包
- 安全敏感场景：需要把密钥、数据库凭据、网络请求完全隔离在 Rust 进程内，不暴露给 WebView
- 体积敏感场景：发布渠道限制包大小（企业内网分发、带宽受限的用户），或者与 Electron 应用比拼"专业感"
- Rust 团队做桌面 GUI：不想学 egui / Druid 等 Rust 原生 GUI 框架，但 JS/TS 前端开发资源充足

**不适用**：

- 移动端原生能力密集：摄像头、蓝牙、ARKit、推送、应用内购买等，v2 插件覆盖不完整，优先考虑 Capacitor 或 React Native
- 需要"像素级一致 UI"：三平台系统 WebView CSS 引擎存在差异，对渲染 1px 边框、字体渲染、滚动行为有强一致性要求的场景要做大量兼容测试
- 纯 Web SaaS：不需要访问本地资源，直接部署到浏览器就够了，没必要套桌面壳
- 团队完全没有 Rust 背景：只用 JS/TS invoke 简单命令可以，但遇到复杂的 Rust 编译错误、内存管理、异步运行时问题会卡很久

## 历史小故事（可跳过）

- **2015 年**：Daniel Thompson-Yvetot 在欧洲 Web 项目里苦于 Electron 体积，开始实验"用系统 WebView 替换 Chromium"的思路，原型叫 tauri。
- **2019 年**：项目在 Commons Conservancy 旗下正式组织化，吸引到 Lucas Nogueira（后来成为 Tauri 移动端主力）等核心贡献者。
- **2022 年 6 月**：Tauri v1.0 GA，同年进入 GitHub Trending 榜，很快超越 Electron 作为"最受期待的桌面框架"出现在各类开发者调查里。
- **2024 年 2 月**：Tauri v2.0 RC 发布，加入 iOS/Android 移动端支持，JavaScript IPC 重写为 capabilities 权限系统。
- **2024 年 10 月**：Tauri v2.0 GA，stars 突破 80k，至 2026 年已超 107k，成为 Rust 生态里明星级应用框架之一。

## 学到什么

1. **体积和安全是同一个设计决策的两面**：不捆绑浏览器引擎 → 更小体积；把系统调用收拢到 Rust 进程 → 更小攻击面。这不是两个独立优化，而是一个架构选择的双重收益。
2. **WebView 抽象层是一把双刃剑**：复用系统组件减少体积，但放弃了对渲染引擎版本的控制权，跨平台 CSS 一致性永远是需要测试的项目。
3. **IPC 边界是跨语言框架的设计核心**：Tauri 的 `invoke` 把"什么能过边界、如何序列化、谁有权调用"都显式化，比 Electron 的 `contextBridge` 更细粒度，但也要求开发者显式设计 API 边界。
4. **Rust 不必从零学才能用**：Tauri 让"只会写前端的人也能用 Rust"成为现实——你可以从 `#[tauri::command]` 开始，逐渐深入 Rust 异步、FFI、内存管理，而不是一上来就面对 lifetimes 地狱。

## 延伸阅读

- 官方文档（v2）：[tauri.app](https://v2.tauri.app/start/)，Prerequisites + Create a Project 是最快的入门路径
- 视频：[Tauri 2.0 + React 完整教程（Fireship）](https://www.youtube.com/watch?v=tauri)，15 分钟从零搭一个桌面 app
- 架构文档：[ARCHITECTURE.md](https://github.com/tauri-apps/tauri/blob/dev/ARCHITECTURE.md)，讲 wry / tao / Core 三层关系
- 插件列表：[tauri-apps/plugins-workspace](https://github.com/tauri-apps/plugins-workspace)，官方维护的 fs/http/store/sql 等插件
- [[capacitor]] —— Ionic 的跨平台方案，移动端生态更成熟，可对比选型
- [[react-native]] —— Facebook 的移动端方案，桥接层思路与 Tauri invoke 相似

## 关联

- [[capacitor]] —— 同为"Web 前端 + 原生桥"跨平台方案，移动端生态更完整，架构理念可对比
- [[react-native]] —— JS 调原生 API 的桥接模式与 Tauri invoke 设计思路异曲同工
- [[flutter]] —— 用自绘引擎规避系统 WebView 一致性问题，是 Tauri 渲染策略的对立面
- [[wasmtime]] —— Rust 生态里另一个把"非 Rust 代码"安全沙盒化的运行时，和 Tauri 的安全边界设计有共通之处
- [[matrix-rust-sdk]] —— 同为 Rust 写的跨平台 SDK，展示 Rust 在桌面/移动端"安全核"的典型用法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 让 Web 应用直接变成 App Store 上架的原生应用
- [[electron-builder]] —— electron-builder — 一条命令把 Electron 应用打包发布到全平台
- [[flutter]] —— Flutter — Google 自绘像素的跨平台 UI 框架
- [[flutter-rust-bridge]] —— flutter-rust-bridge — Dart 调 Rust 像调本地函数
- [[matrix-rust-sdk]] —— matrix-rust-sdk — Matrix 客户端的"共享发动机"
- [[neutralinojs]] —— Neutralinojs — 用系统 webview 写桌面应用，2MB 搞定
- [[nodegui]] —— NodeGUI — Qt6 驱动的零 WebView 桌面框架
- [[react-native]] —— React Native — 用 React 写、编译成真正的原生 App
- [[wails]] —— Wails — 用 Go 写后端、Web 写 UI 的跨平台桌面框架
- [[wasmtime]] —— Wasmtime — Bytecode Alliance 标准 wasm runtime

