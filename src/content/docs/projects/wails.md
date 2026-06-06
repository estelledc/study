---
title: Wails — 用 Go 写后端、Web 写 UI 的跨平台桌面框架
来源: 'https://github.com/wailsapp/wails'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

Wails 是让 Go 开发者用 **Go 写后端逻辑、Web 技术写界面** 的桌面应用框架。日常类比：把 Go 程序当"服务员"，把浏览器当"前台"——但两者都住在同一个可执行文件里，不需要任何服务器。

你写：

```go
type App struct{}

func (a *App) Greet(name string) string {
    return "Hello, " + name + "!"
}
```

Wails 自动生成 TypeScript 绑定，前端直接调用：

```ts
import { Greet } from "../wailsjs/go/main/App";
Greet("World").then(console.log); // Hello, World!
```

与 [[electron]] 最大的区别在于：Wails **不打包 Chromium**，而是复用操作系统自带的 WebView（Windows 用 WebView2，macOS 用 WebKit，Linux 用 WebKitGTK）。这让最终产物比 Electron 应用小 10-20 倍——一个完整应用通常只有 10MB 出头，而 Electron 动辄 100MB+。

与 [[tauri]] 的思路相似，区别在于后端语言：Tauri 用 Rust，Wails 用 Go。如果团队已经有 Go 代码库（服务端 SDK、本地数据处理、文件操作），迁到 Wails 几乎零额外学习成本。

## 为什么重要

不了解 Wails，下面这些场景你会反复纠结：

- 想做本地 CLI 工具的桌面版本，却不知道除了 Electron 还有更轻的选项
- Go 后端代码已经稳定，为了做桌面 UI 不得不重学 Qt / C++ / Swift
- 需要发布 Mac App Store 或 Microsoft Store 合规的应用，不清楚哪个方案支持
- 想要本地处理敏感数据（不走网络），但又想要现代 Web UI 的交互体验

## 核心要点

### 1. 方法绑定（Binding）：Go 方法变成 JS 函数

把 Go 结构体实例传入 `wails.Run()` 的 `Bind` 字段，Wails 会扫描所有公开方法（大写开头），为每个方法生成 JavaScript wrapper 和 TypeScript 声明文件。

```go
err := wails.Run(&options.App{
    Title:  "My App",
    Width:  1024,
    Height: 768,
    AssetServer: &assetserver.Options{Assets: assets},
    Bind: []interface{}{&App{}},
})
```

生成的 TypeScript 声明自动匹配 Go 返回值类型，Go struct → TypeScript class，`error` 返回值 → Promise reject。类比：就像 gRPC protobuf 自动生成 SDK，只不过这里是同进程 IPC 而不是网络调用。

### 2. 嵌入式前端资产（embed.FS）

生产构建把前端 dist 目录用 Go 的 `//go:embed` 指令打包进二进制：

```go
//go:embed all:frontend/dist
var assets embed.FS
```

开发模式（`wails dev`）则从磁盘读文件并热重载（底层用 [[vite]]），改一行 Go 代码自动重编译，改前端文件浏览器即刷新。

### 3. 事件系统：打破"调用 → 响应"模型

对于高频数据推送（系统监控、进度更新、文件变化通知），不该每次都让前端主动 call Go 方法，而应用事件推送：

```go
// Go 端推送
runtime.EventsEmit(ctx, "file-progress", map[string]int{"done": 50, "total": 100})
```

```ts
// 前端订阅
import { EventsOn } from "../wailsjs/runtime";
EventsOn("file-progress", (data) => setProgress(data.done / data.total));
```

这套双向事件总线解耦了 Go 和前端的节奏，是构建实时界面的正确姿势。

## 实践案例

### 案例 1：本地 PDF 处理工具

**场景**：公司内部需要批量从 PDF 中提取文字并分类，数据不能上云。

Go 后端用 `pdfcpu` 或 `unipdf` 处理文件，前端用 [[react]] 渲染结果列表：

```go
// app.go
func (a *App) ExtractText(path string) ([]string, error) {
    pages, err := pdf.ExtractPages(path)
    if err != nil {
        return nil, err
    }
    var texts []string
    for _, p := range pages {
        texts = append(texts, p.Text())
    }
    return texts, nil
}
```

前端拿到 `string[]`（自动生成 TypeScript 类型），直接渲染。最终 `wails build` 产出单个 `.app` / `.exe`，员工双击即用，无需安装 Node/Python 运行时。

**注意**：Go 方法的 `error` 返回值会变成 Promise reject，前端必须 `.catch()` 处理，否则用户看不到任何错误提示。

### 案例 2：数据库客户端桌面应用

**场景**：团队内部 SQLite / PostgreSQL 管理工具，需要支持多连接和简单查询。

```go
type DBApp struct {
    db *sql.DB
}

func (d *DBApp) Query(sql string) ([]map[string]interface{}, error) {
    rows, err := d.db.Query(sql)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    cols, _ := rows.Columns()
    var result []map[string]interface{}
    for rows.Next() {
        vals := make([]interface{}, len(cols))
        ptrs := make([]interface{}, len(cols))
        for i := range vals { ptrs[i] = &vals[i] }
        rows.Scan(ptrs...)
        row := map[string]interface{}{}
        for i, c := range cols { row[c] = vals[i] }
        result = append(result, row)
    }
    return result, nil
}
```

前端（[[svelte]]）渲染表格。数据库连接字符串只在 Go 层持有，前端 JS 代码永远无法直接访问，天然隔离安全边界。

### 案例 3：系统监控托盘应用

**场景**：最小化到系统托盘，后台轮询 CPU/内存，实时图表展示。

```go
func (a *App) StartMonitor(ctx context.Context) {
    go func() {
        for {
            cpu, _ := getCPUPercent()
            mem, _ := getMemUsage()
            runtime.EventsEmit(ctx, "metrics", map[string]float64{
                "cpu": cpu, "mem": mem,
            })
            time.Sleep(time.Second)
        }
    }()
}
```

前端用 `EventsOn("metrics", ...)` 订阅，驱动 ECharts 图表更新。Go 的 goroutine 并发模型在这里完美契合：开一个后台 goroutine 持续采集，不阻塞 UI 线程。

## 踩过的坑

1. **Go struct 字段忘加 json tag 导致前端收到空对象**：`type User struct { Name string }` 生成的 TypeScript 会有 `name` 字段但运行时拿不到值，原因是 Go JSON 序列化默认用大写字段名，必须写 `json:"name"`。症状是 Promise 正常 resolve 但数据是空壳，极难定位。

2. **三平台 WebView 行为不一致**：某些 CSS 特性（如 `backdrop-filter`）在 Linux WebKitGTK 4.0 不支持，动画在 Windows WebView2 下的帧率和 macOS WebKit 有微妙差异。开发时必须三平台都测，不能只测 macOS。

3. **高频调用 Go 方法性能问题**：每次 JS 调用 Go 方法都走 IPC 序列化/反序列化，60fps 帧率下每帧调用会产生明显延迟。正确做法是 Go 主动用 `EventsEmit` 推送，前端只订阅不主动拉取。

4. **v2 与 v3 API 不兼容**：Stack Overflow 和 YouTube 上大量教程基于 v2，但 v3 正在 alpha 测试阶段，Options 结构体、Context 传递方式都有变化。`go.mod` 锁定版本后务必对照对应版本的官方文档，不要混用。

## 适用 vs 不适用场景

**适用**：

- 团队已有 Go 后端代码，需要为其加桌面 UI（数据处理、文件工具、本地 CLI 升级为图形界面）
- 对安装包大小敏感，不能接受 Electron 的 100MB+ 体积
- 需要 App Store 合规发布（Wails 构建的应用满足 Apple 和 Microsoft 商店要求）
- 本地敏感数据处理（数据库密码、文件内容不出本机）
- 原型阶段：用已有 Web 技能快速迭代桌面 UI，比学习 Qt/SwiftUI 成本低几个数量级

**不适用**：

- 需要复杂原生 UI 控件（macOS 原生侧边栏、Windows 原生 Ribbon）→ 考虑 SwiftUI 或 WinUI 3
- 高性能图形渲染（游戏、3D 可视化）→ 考虑 SDL2/OpenGL/WebGPU 方案，WebView 渲染管线有额外开销
- 已有 Rust 技术栈 → [[tauri]] 更合适，生态和 Rust 工具链深度集成
- 需要访问 iOS/Android → Wails 只支持桌面端，移动端考虑 [[flutter]]
- 团队主力是 Node.js → 直接用 Electron 开发体验更顺滑，Go 绑定层是额外负担

## 历史小故事（可跳过）

- **2018 年**：澳大利亚开发者 Lea Anthony 发布 Wails v1，仅支持 Windows，后端用 Go，前端用 HTML，通过 Ole Automation 调用 IE 内核渲染。
- **2020-2021 年**：加入 macOS 和 Linux 支持，但架构较重，依赖 CGO 和系统 DLL，构建体验饱受诟病。
- **2022 年**：v2 发布，引入 Vite 热重载、WebView2（Windows 原生 Chromium 内核）、零 CGO 依赖（Windows）、统一 embed.FS 资产方案，跨平台体验大幅改善，GitHub stars 快速增长到 26k。
- **2023-2024 年**：stars 超 34k，成为 Go 桌面开发的默认选项；v3 开始开发，目标是多窗口支持和更彻底地移除平台差异。

## 学到什么

1. **Go 的 embed 指令是桌面应用的关键杠杆**：一行 `//go:embed` 把整个前端打包进二进制，彻底消除"用户需要安装哪些运行时"的问题。
2. **IPC 调用 vs 事件推送是架构决策，不是实现细节**：频繁的请求-响应模式在进程内 IPC 里照样有延迟，主动推送（EventsEmit）在数据流场景下是更正确的模型。
3. **复用操作系统 WebView 是双刃剑**：包体积小，但三平台行为不一致是真实的工程成本，不能省略跨平台测试。
4. **与 Tauri 的选型核心是团队语言，不是性能**：两者思路几乎相同，Tauri 是 Rust 生态，Wails 是 Go 生态，性能差距在桌面 UI 场景下几乎感知不到。

## 延伸阅读

- 官方文档：[wails.io/docs](https://wails.io/docs/introduction)（How does it work 章节讲清楚 IPC 机制）
- 官方模板库：`wails init -n myapp -t react-ts`（内置 Svelte/React/Vue/Lit 模板，TypeScript 版本均有）
- [[tauri]] —— 同类方案，Rust 后端版本，适合 Rust 团队
- [[electron]] —— Node.js 后端版本，包体积大但生态成熟度最高
- [[vite]] —— Wails 开发模式的热重载引擎

## 关联

- [[tauri]] —— Wails 的最近邻：同样是 Go/Rust 后端 + WebView 前端的跨平台桌面框架
- [[electron]] —— 最主流的 Web 技术桌面方案，Wails 的包体积优势正是对比 Electron 而来
- [[flutter]] —— 另一种跨平台方案，覆盖桌面 + 移动端，但需要学习 Dart 和 Flutter 渲染引擎
- [[svelte]] —— Wails 官方内置前端模板之一，轻量、编译时框架，与 Wails 小包体积理念契合
- [[react]] —— Wails 最常见的前端搭配，生态最丰富，适合有 Web 开发背景的团队
- [[vite]] —— Wails 开发模式底层热重载引擎，`wails dev` 的前端刷新由 Vite 驱动
- [[go-zero]] —— 同属 Go 生态，关注后端微服务；与 Wails 互补，可共用业务逻辑层代码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[electron]] —— Electron — Chromium + Node.js 跨平台桌面应用框架
- [[flutter]] —— Flutter — Google 自绘像素的跨平台 UI 框架
- [[go-zero]] —— go-zero — 一份契约文件生成整套 Go 微服务
- [[neutralinojs]] —— Neutralinojs — 用系统 webview 写桌面应用，2MB 搞定
- [[react]] —— React UI 组件库
- [[svelte]] —— Svelte — 编译时 UI 框架
- [[tauri]] —— Tauri — Rust 写的 Electron 替代，用系统 webview 打包桌面/移动端应用
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具

