---
title: Tauri — 用系统浏览器内核 + Rust 做轻量桌面应用
来源: 'https://github.com/tauri-apps/tauri'
日期: 2026-07-08
分类: 跨平台桌面
难度: 中级
---

## 是什么

Tauri 是一个**用网页技术写界面、用 Rust 写系统能力、打成很小安装包**的跨平台应用框架。日常类比：像给网站套外壳，但外壳不自带一整台浏览器——它借用操作系统已经装好的 WebView（Windows 的 WebView2、macOS 的 WKWebView、Linux 的 WebKitGTK）。

你仍用 HTML / CSS / JS（或 React、Vue、Svelte、[[vite]] 等）做 UI；真正碰文件、通知、托盘的是旁边那份 Rust 二进制。两边通过 `invoke` 通话，而不是把 Node 塞进每个窗口。

相对 [[electron]]：Electron 打包时带上 Chromium + Node，体积和内存通常更大；Tauri 依赖系统 WebView，安装包常可压到十几 MB 量级（视前端资源而定）。

## 为什么重要

不理解 Tauri，下面这些事很难解释：

- 为什么前端团队能做桌面 App，却不必每人学一套 WinUI / AppKit / GTK
- 为什么同类工具里有的安装包 100MB+，有的只有十几 MB——差在是否自带浏览器内核
- 为什么「前端随便读磁盘」在现代桌面框架里会被权限清单拦住
- 为什么 Linux 上「能编译但打不开窗」常常是 WebKitGTK 版本问题，而不是你的 React 写错了

## 核心要点

1. **系统 WebView + Rust 后端**。类比：前厅用店里现成的展示柜（系统 WebView），后厨是 Rust。窗口库是 tao，渲染抽象是 WRY；你写的前端被装进 WebView，系统 API 走 Rust。

2. **命令（command）+ 权限（capability）**。类比：前厅不能进保险柜，只能点菜单上的菜。前端用 `invoke('greet', { name })` 调 Rust 函数；哪些命令、哪些路径可访问，要在配置里显式放开，默认收紧。

3. **自带打包与多端**。开发时 `tauri dev`；交付时打 `.dmg` / `.msi` / `.deb` / AppImage 等。Tauri 2 还把 Android / iOS 纳入同一套模型，但移动端工具链与桌面前提不同，别默认「写一次处处一样」。

## 实践案例

### 案例 1：脚手架起一个最小项目

```bash
npm create tauri-app@latest
cd my-tauri-app
npm install
npm run tauri dev
```

**逐部分解释**：

- `create-tauri-app` 会问包管理器、前端模板（Vanilla / React / Vue / Svelte 等）
- 生成目录里通常有 `src/`（前端）和 `src-tauri/`（Rust + `tauri.conf.json`）
- `tauri dev` 起 WebView 窗口并热更新；先确认本机已装 Rust、平台 WebView 依赖（见官方 prerequisites）

### 案例 2：Rust 命令 + 前端 invoke

```rust
// src-tauri/src/lib.rs（示意）
#[tauri::command]
fn greet(name: String) -> String {
    format!("你好，{}！", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```js
// 前端
import { invoke } from '@tauri-apps/api/core';
const msg = await invoke('greet', { name: 'Ada' });
console.log(msg); // 你好，Ada！
```

**逐部分解释**：

- `#[tauri::command]` 把 Rust 函数暴露给前端，参数/返回值经 JSON 序列化
- `generate_handler![greet]` 注册白名单；没注册的名字前端调不到
- `@tauri-apps/api` 的 `invoke` 是请求-响应桥，不是把整个文件系统交给页面

### 案例 3：收紧文件系统权限

```json
// src-tauri/capabilities/default.json（示意，字段随版本微调）
{
  "permissions": [
    "core:default",
    "fs:allow-read-text-file",
    { "identifier": "fs:scope", "allow": [{ "path": "$APPDATA/**" }] }
  ]
}
```

**逐部分解释**：

- Tauri 2 用 capability 描述「这个窗口能干什么」
- 只读 `$APPDATA` 下文本，比「任意路径读写」安全得多
- 前端即使用了 `@tauri-apps/plugin-fs`，没在 capability 放开也会失败——这是特性不是 bug

## 踩过的坑

1. **Linux 缺 WebKitGTK**：能编过但窗口起不来，多半是 `webkit2gtk` 版本与 Tauri 主版本不匹配（v1 / v2 要求不同）。
2. **忘记注册 command**：前端 `invoke` 报 command not found，先查 `generate_handler!` 和 capability 是否包含该命令。
3. **把 Electron 心智直接搬过来**：没有 Node 在渲染进程里；需要系统能力就写 Rust command 或官方 plugin，不要假设 `require('fs')`。
4. **调试只看前端控制台**：IPC、权限、打包签名问题出在 `src-tauri` 与系统依赖，要同时看 Rust 日志和 `tauri.conf`。

## 适用 vs 不适用

**适用**：

- 团队会前端，想做 Windows / macOS / Linux 桌面工具，并接受学一点 Rust 胶水
- 在意安装包体积与内存，不想每个 App 再带一份 Chromium
- 需要托盘、通知、自动更新、原生菜单等桌面能力，且可用官方 plugin 覆盖

**不适用**：

- 必须像素级一致地自带完整 Chromium 行为（强依赖特定 Chrome 版本 API）
- 团队完全不能碰 Rust，又需要大量自定义系统集成
- 目标环境 WebView 过旧或不可控（某些锁定的企业 Linux 镜像）
- 主要做纯网页 SaaS、并不需要安装包与系统 API

## 历史小故事（可跳过）

- **2019–2020 年**：Tauri 在社区成形，目标是「更小的 Electron 替代」，核心放在 Rust 与系统 WebView。
- **2022 年**：Tauri 1.0 稳定，桌面打包与安全模型进入可生产讨论区。
- **2024 年**：Tauri 2 推进移动端与统一权限/插件模型，文档迁到 v2.tauri.app。
- **组织**：项目在 Commons Conservancy 下以 Programme 运作，代码以 MIT / Apache-2.0 双许可为主。
- **今日**：`tauri-apps/tauri` 星标已逾十万，仍高频发布（例如 2.11.x 线）。

## 学到什么

1. **轻量往往来自「不重复造浏览器」**：借用系统 WebView，代价是平台差异要自己消化。
2. **安全默认是否定**：命令与文件系统都要显式授权，XSS 才不容易变成读盘漏洞。
3. **前端 + Rust 是分工不是混搭**：UI 归 Web，系统能力归 command/plugin。
4. **和 Electron 选边看约束**：要极致体积与系统集成选 Tauri；要「自带 Chrome 一致性」常仍看 Electron。

## 延伸阅读

- 官方文档：[Tauri 2](https://v2.tauri.app/)
- 仓库：[tauri-apps/tauri](https://github.com/tauri-apps/tauri)
- 架构说明：[ARCHITECTURE.md](https://github.com/tauri-apps/tauri/blob/dev/ARCHITECTURE.md)
- [[electron]] —— 自带 Chromium 的对照路线
- [[vite]] —— 常见前端打包搭档
- [[svelte]] / [[react]] —— 常用 UI 层

## 关联

- [[electron]] —— 同类桌面壳，体积与进程模型不同
- [[electron-builder]] —— Electron 侧常见打包器，可对照 Tauri 内置 bundler
- [[vite]] —— Tauri 模板里高频前端构建工具
- [[capacitor]] —— 移动端「Web + 原生桥」另一条路
- [[flutter]] —— 非 WebView、自绘 UI 的跨平台对照
- [[svelte]] —— 轻量前端，常与 Tauri 搭配
- [[deno]] —— 同属「用更干净的运行时边界」思路的近邻（但不是桌面壳）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
