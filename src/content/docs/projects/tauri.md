---
title: Tauri — 系统 WebView + Rust 后端的轻量桌面运行时
来源: 'https://github.com/tauri-apps/tauri'
日期: 2026-07-08
分类: 跨平台桌面
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/tauri-apps/tauri
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7cd71369c00978a3783b6ae3e9972358abbe4ae6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.11.5
---

## 是什么

Tauri 是一套 **用网页技术画界面、用 Rust 二进制提供系统能力** 的跨平台工具包。日常类比：还是给网站套外壳，但外壳不自带浏览器——窗口库是 **TAO**，WebView 抽象是 **WRY**，运行时去借操作系统已经装好的内核（Windows WebView2、macOS WKWebView、Linux WebKitGTK）。

你仍用 HTML / CSS / JS（或 React、Vue、Svelte、[[vite]]）做 UI。碰文件、通知、托盘的是旁边那份 Rust 进程。前端通过 `@tauri-apps/api` 的 `invoke` 发命令，而不是把 Node 塞进每个窗口。

相对 [[electron]]：Electron 打包 Chromium + Node；固定 `tauri@2.11.5` 的架构文档把“体积小”归因于 **不发布运行时、最终二进制由 Rust 编译**。这是机制描述，不是本轮测过的 MB 数字。

## 为什么重要

不理解这套分工，下面这些事很难解释：

- 为什么前端团队能做桌面 App，却要再学一层 Rust 命令与 capability
- 为什么同类工具有的安装包带完整浏览器，有的只剩系统 WebView 差异
- 为什么「前端随便读磁盘」会被权限清单拦住——XSS 默认不该变成读盘
- 为什么 Linux 上“能编译但打不开窗”常常是 WebKitGTK，而不是 React 写错了

## 核心机制与架构流程

固定 `7cd71369...` 把一次调用拆成四段：

1. **系统 WebView + Rust 宿主**。`ARCHITECTURE.md`：`tauri` crate 读 `tauri.conf.json`、注入脚本、托管系统 API；`tauri-runtime` / `tauri-runtime-wry` 接到 WRY；`tauri-utils` 负责配置、CSP 注入和 ACL。默认 feature 含 `wry`、`compression`、`dynamic-acl`、`x11`、`dbus`。workspace `rust-version = "1.77.2"`。

2. **命令是具名、可反序列化的 IPC**。`#[tauri::command]` + `generate_handler!` 登记白名单。`CommandItem` 从 JSON payload **按参数名** 取值：缺 key 报 `missing required key`；若 IPC 用了 `InvokeBody::Raw` 却要解具名参数，会失败。Android 上 Raw body 不受支持。

3. **前端 `invoke` 只是薄封装**。`packages/api/src/core.ts` 的 `invoke(cmd, args, options)` 转调 `window.__TAURI_INTERNALS__.invoke`。`Channel` 用带 `index` 的回调保序，Rust 侧 drop 时发 `{ end: true, index }`。序列化钩子是 `__TAURI_TO_IPC_KEY__`。

4. **Capability 默认否定**。`Capability` 文档写明：webview 或其 window 不匹配任何 capability，就 **完全没有 IPC**。窗口可用精确名或 glob（`*`、`admin-*`）。`RuntimeAuthority::resolve_access(command, window, webview, origin)` 先查 `denied_commands`（命中即拒绝），再按 origin + window/webview glob 过滤 `allowed_commands`。测试 `denied_command_takes_precendence` 固定 deny 优先；`remote_context_denied` 固定默认命令上下文不匹配远程 origin。`isolation` 是可选 feature，不是默认路径。

## 实践案例

### 案例 1：脚手架起最小项目

```bash
npm create tauri-app@latest
cd my-tauri-app
npm install
npm run tauri dev
```

**逐部分**：

- `create-tauri-app` 是独立仓库；本页只绑定 `tauri-apps/tauri` 本体
- 生成目录通常有 `src/`（前端）和 `src-tauri/`（Rust + `tauri.conf.json`）
- `tauri dev` 起 WebView 并跟前端 devserver；改 Rust / `Cargo.toml` 会关窗重编
- 先确认本机 Rust（workspace 要求 1.77.2+）和平台 WebView 依赖

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
import { invoke } from '@tauri-apps/api/core';
const msg = await invoke('greet', { name: 'Ada' });
```

**逐部分**：

- 参数名 `name` 必须出现在 JSON payload 里，和函数参数对齐
- `generate_handler![greet]` 没登记的名字前端调不到
- `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 说明同一 crate 也编移动入口，但桌面与移动工具链不同
- 同提交 JS API 版本是 `@tauri-apps/api@2.11.1`，crate 是 `2.11.5`

### 案例 3：按窗口收紧文件系统

```json
{
  "identifier": "main-user-files-write",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "fs:allow-write-text-file",
      "allow": [{ "path": "$HOME/test.txt" }]
    }
  ],
  "platforms": ["macOS", "windows"]
}
```

这是 `capability.rs` 里的示例形态：权限可以是标识符，也可以是带 scope 的对象。`main` 窗口在 macOS / Windows 上才能写那一个路径；其他窗口默认没有这条 IPC。

## 踩过的坑

1. **Linux 缺匹配的 WebKitGTK**：`webkit2gtk` feature 标了 `v2_40`。能编过但窗口起不来，先对系统包版本，不要先改前端。
2. **忘记登记或忘记授权**：`invoke` 失败可能是 `generate_handler!` 没写，也可能是 capability 没匹配 window / origin。
3. **按 Electron 心智找 `require('fs')`**：渲染进程没有 Node；系统能力走 command 或官方 plugin。
4. **远程页面当成本地 origin**：默认命令上下文是 Local；`remote_context_denied` 说明远程 URL 不会只因命令名被放行。
5. **把 crate 版本和 JS API 版本当成同一个数**：本提交是 `tauri 2.11.5` + `@tauri-apps/api 2.11.1`。

## 适用 vs 不适用场景

**适用**：

- 会前端，愿意写少量 Rust 胶水，目标是 Windows / macOS / Linux 桌面工具
- 在意安装包不携带完整 Chromium，能接受系统 WebView 差异
- 需要托盘、通知、菜单等桌面能力，且可用官方 plugin 覆盖
- 满足 Rust 1.77.2+ 与各平台 WebView 前提

**不适用**：

- 必须像素级绑定某一版 Chrome API——对照 [[electron]]
- 团队完全不能碰 Rust，又要大量自定义系统集成
- 目标环境 WebView 过旧或不可控（锁定的企业 Linux）
- 主要做纯网页 SaaS，并不需要安装包与系统 API

## 固定版本边界

- 本文绑定 `tauri-apps/tauri@7cd71369...`，即 tag `tauri-v2.11.5`，crates.io `tauri@2.11.5`。
- 同一棵源码树发布 `@tauri-apps/api@2.11.1`；两个版本号不同是分开发布，不是 provenance 冲突。
- workspace `rust-version = "1.77.2"`；默认 feature 含 `wry`、`compression`、`dynamic-acl`、`x11`、`dbus`。
- Linux 桌面依赖 `webkit2gtk` `v2_40`；Windows 走可选 `webview2-com`；macOS 走 WKWebView。
- ACL：无匹配 capability 则无 IPC；deny 优先于 allow；默认命令上下文不匹配远程 origin。
- `isolation` / 移动端 `cfg` 存在于本 crate，但本文未展开为“写一次处处一样”。
- 本文未安装 Rust 依赖、未开 WebView、未跑上游测试或打包，状态保持 `UNVERIFIED`。

## 学到什么

1. **轻量来自“不重复造浏览器”**，代价是平台 WebView 差异要自己消化。
2. **安全默认是否定**：命令要登记，窗口要进 capability，远程 origin 不会自动继承本地权限。
3. **前端 + Rust 是分工**：UI 归 Web，系统能力归 command / plugin。
4. **和 Electron 选边看约束**：要自带 Chrome 一致性选 Electron；要小二进制和显式 ACL 选 Tauri。

## 应用型自测

1. 一个 webview 没有出现在任何 capability 的 `windows` / `webviews` 里，它能 `invoke` 已登记的命令吗？
2. 同一命令既在 `allowed_commands` 又在 `denied_commands`，`resolve_access` 会放行吗？
3. `invoke('greet', { name: 'Ada' })` 里的字段名 `name` 可以随便改成 `user` 吗？

检查点：

1. 不能。capability 文档写明不匹配则完全没有 IPC。
2. 不会。deny 表先被检查，测试 `denied_command_takes_precendence` 固定返回 `None`。
3. 不能。`CommandItem` 按参数名从 JSON 取 key，对不上会 `missing required key`。

## 延伸阅读

- 官方文档：[Tauri 2](https://v2.tauri.app/)
- 固定源码：[tauri-apps/tauri](https://github.com/tauri-apps/tauri) —— 本文绑定提交 `7cd71369c00978a3783b6ae3e9972358abbe4ae6`
- 架构说明：[ARCHITECTURE.md](https://github.com/tauri-apps/tauri/blob/dev/ARCHITECTURE.md)
- [[electron]] —— 自带 Chromium 的对照路线

## 关联

- [[electron]] —— 同类桌面壳，体积与进程模型不同
- [[electron-builder]] —— Electron 侧常见打包器，可对照 Tauri bundler
- [[vite]] —— Tauri 模板里高频前端构建工具
- [[capacitor]] —— 移动端「Web + 原生桥」另一条路
- [[flutter]] —— 非 WebView、自绘 UI 的跨平台对照
- [[svelte]] —— 轻量前端，常与 Tauri 搭配
- [[wails]] —— Go + 系统 WebView 的近邻路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capacitor]] —— Capacitor — 把 Web 应用装进原生 App 的运行时
- [[cordova]] —— Cordova — 用 Web 技术打包移动 App 的老牌桥梁
- [[electron]] —— Electron — 用网页技术做跨平台桌面应用
- [[quasar]] —— Quasar Framework — 一套代码跑 Vue 全端的应用框架
- [[wails]] —— Wails — 用 Go + 网页技术打成单个桌面应用
