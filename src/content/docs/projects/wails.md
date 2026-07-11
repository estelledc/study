---
title: Wails — 用 Go + 网页技术打成单个桌面应用
来源: 'https://github.com/wailsapp/wails'
日期: 2026-07-08
分类: 跨平台桌面
难度: 中级
---

## 是什么

Wails 是一个**用 Go 写后端、用 HTML/CSS/JS（或 React / Vue / Svelte）写界面，最后打成一个本地桌面程序**的框架。日常类比：像给 Go 程序装上一扇「系统自带的网页窗户」——窗户用操作系统的 WebView 画界面，后厨仍是你熟悉的 Go，两边能互相打电话。

传统做法是：Go 起一个 HTTP 服务，再让用户打开浏览器访问。Wails 换了一条路：把前端资源嵌进二进制，启动时直接弹出原生窗口，不必再开 Chrome 标签页。相对 [[electron]]，它**不内嵌一整份 Chromium**；相对 [[tauri]]，后端语言是 Go 而不是 Rust。

## 为什么重要

不理解 Wails，下面这些事很难解释：

- 为什么 Go 团队能做带漂亮 UI 的桌面工具，却不必每人学 WinUI / AppKit / GTK
- 为什么有的桌面壳安装包 100MB+，有的只有几十 MB——差在是否自带浏览器内核
- 为什么前端能直接调 Go 函数，却不像「把整个进程暴露给页面」那么危险
- 为什么同是「Web + 原生」，选 Electron / Tauri / Wails 会落到不同的语言栈与体积权衡

## 核心要点

1. **Go 后端 + 任意前端 + 系统 WebView**。类比：前厅用店里现成的展示柜（WebView2 / WKWebView / WebKitGTK），后厨是 Go。你用熟悉的前端栈做 UI，系统能力与业务逻辑写在 Go 里。

2. **绑定（Bind）：把 Go 方法暴露给 JavaScript**。类比：前厅只能点菜单上的菜。你在 `Bind` 里登记结构体方法，前端用生成的 JS/TS 调用；参数与返回值走 JSON 序列化，并可自动生成 TypeScript 类型。

3. **CLI 管脚手架与打包**。`wails init` 起项目，`wails dev` 热重载开发，`wails build` 打成单文件（或平台安装包）。v2 是稳定线；v3 仍在 Alpha，文档与命令名不同，新人默认跟 v2。

## 实践案例

### 案例 1：脚手架起一个最小项目

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails init -n myproject -t svelte
cd myproject
wails dev
```

**逐部分解释**：

- `go install .../wails@latest` 装 v2 CLI（需本机已有 Go 与平台 WebView 依赖）
- `-t svelte` 选前端模板；也可换成 `react` / `vue` / `vanilla` 等
- `wails dev` 打开原生窗口并监视前后端变更；交付前再用 `wails build`

### 案例 2：Go 方法绑定到前端

```go
// app.go（示意）
type App struct{}

func (a *App) Greet(name string) string {
    return "你好，" + name + "！"
}

// main.go 里（示意）
err := wails.Run(&options.App{
    Title:  "MyProject",
    Width:  1024,
    Height: 768,
    Bind:   []interface{}{app},
})
```

```js
// 前端（示意：调用生成的绑定）
import { Greet } from '../wailsjs/go/main/App';
const msg = await Greet('Ada');
console.log(msg); // 你好，Ada！
```

**逐部分解释**：

- 导出方法名首字母大写，才会进入绑定表面
- `Bind` 白名单决定前端能调哪些对象；没登记的调不到
- `wailsjs/` 下的 JS/TS 由工具生成，改 Go 签名后需重新生成/热重载

### 案例 3：开发与打包的最小闭环

```bash
wails dev          # 开发：窗口 + 热更新
wails build        # 生产：打成平台二进制
```

**逐部分解释**：

- 开发态前端常走本地 Vite 等开发服务器；生产态资源被嵌入二进制
- `wails.json` 管窗口标题、资源目录、构建选项；改完再 build
- 目标是「用户双击一个文件就能跑」，而不是再起浏览器访问 `localhost`

## 踩过的坑

1. **Linux 缺 WebKitGTK**：能编译但弹不出窗，多半是系统 WebView 依赖未装齐或版本不对。
2. **方法没导出 / 没 Bind**：前端调用失败，先查 Go 方法是否大写导出，以及是否放进 `Bind` 列表。
3. **把浏览器心智整包搬过来**：没有 Node 在渲染进程里；读文件、开对话框应走 Go 或官方 runtime API。
4. **混用 v2 / v3 文档**：v3 CLI 与包路径不同；跟教程时先确认自己装的是哪一条线。

## 适用 vs 不适用

**适用**：

- 团队主力是 Go，想给工具/内部系统加桌面 UI，并接受用 Web 技术画界面
- 在意体积与内存，不想每个应用再带一份 Chromium
- 需要菜单、对话框、事件桥等桌面能力，且业务逻辑适合留在 Go

**不适用**：

- 必须像素级依赖完整 Chromium / 特定 Chrome 扩展生态（更常看 [[electron]]）
- 团队不会 Go，却已深度投入 Rust 桌面栈（更常看 [[tauri]]）
- 目标环境 WebView 过旧或不可控（锁定的企业 Linux 镜像等）
- 只做纯网页 SaaS，并不需要安装包与系统窗口

## 历史小故事（可跳过）

- **命名**：作者看到 WebView 后想要「像 Rails 之于 Ruby」的工具链，于是有了 Webview-on-Rails；又恰好与故乡 Wales 同音，名字就留住了。
- **定位**：面向「想给 Go 程序加前端、又不想自建 HTTP + 浏览器」的开发者；也可视为轻量 Electron 替代之一。
- **版本**：v2 为稳定生产线（文档在 wails.io）；v3 为 Alpha（另有独立文档站）。
- **今日**：`wailsapp/wails` 星标已逾三万，仍活跃维护多语言 README 与模板生态。

## 学到什么

1. **轻量桌面壳的关键往往是「借用系统 WebView」**：省体积，代价是平台差异要自己消化。
2. **语言栈决定选型**：Go 团队看 Wails；Rust 团队常看 Tauri；要自带 Chrome 一致性常仍看 Electron。
3. **绑定是契约不是魔法**：导出、登记、序列化三者缺一，前后端就对不上话。
4. **先跟稳定线**：新人默认 v2；把 v3 当前瞻，而不是默认生产路径。

## 延伸阅读

- 官方文档：[wails.io](https://wails.io/)
- 仓库：[wailsapp/wails](https://github.com/wailsapp/wails)
- 入门：[`wails init` 与项目结构](https://wails.io/docs/gettingstarted/firstproject)
- [[tauri]] —— Rust + 系统 WebView 的对照路线
- [[electron]] —— 自带 Chromium 的对照路线
- [[vite]] / [[svelte]] / [[react]] —— 常见前端搭档

## 关联

- [[tauri]] —— 同类「系统 WebView」桌面壳，后端是 Rust
- [[electron]] —— 自带浏览器内核的桌面壳，体积与进程模型不同
- [[electron-builder]] —— Electron 侧常见打包器，可对照 Wails 内置 build
- [[vite]] —— 许多 Wails 模板的前端构建工具
- [[svelte]] / [[vue]] / [[react]] —— 官方模板常见 UI 层
- [[gin]] —— 同属 Go 生态，但是 HTTP 服务路线而非桌面壳
- [[bubbletea]] —— Go 做 TUI 的另一条交互路线，可对照「要不要上 WebView」

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
