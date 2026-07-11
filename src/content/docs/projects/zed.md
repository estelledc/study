---
title: Zed — Atom 团队 Rust 重写的 GPU 协作编辑器
来源: https://github.com/zed-industries/zed
日期: 2026-06-01
分类: 编辑器
难度: 中级
---

## 是什么

Zed 是**前 Atom 核心团队用 Rust 重写的代码编辑器**，把"GPU 渲染、多线程并行、实时协作"三件事**塞进同一个二进制**。日常类比：以前的编辑器像家用轿车（Electron 套壳，够用但起步慢），Zed 像电动跑车（自研底盘 + 三电分工 + 远程对讲），起步零延迟，副驾还能远程上人。

你只要装一个约 90MB 的安装包，打开就能：

- **约 8ms 首字延迟**（VS Code 常见 50-100ms）——按下键到看到字符的时间
- 邀请同事敲一段 URL 就**像 Google Docs 一样多人同时编辑代码**，光标各自带颜色
- 跑着语言服务（LSP）、Git、文件索引，**输入永远不卡**——这些都被丢到背景线程

截至 2026-05，约 52k stars；core 仓 AGPL v3，GPUI 等可复用模块 Apache 2.0。macOS / Linux / Windows 均有官方版。

## 为什么重要

不理解 Zed 的设计选择，下面这些事都没法解释：

- 为什么 Atom 在 2022 年被 GitHub **官方关停**——Electron 单线程 + DOM 重绘是死结
- 为什么 VS Code 流畅但 Zed 还能"再快一档"——差距来自**有没有走 GPU 自绘**
- 为什么实时协作 10 年都难做进编辑器——直到 CRDT（冲突可自动合并的数据结构）在 2019 后成熟
- 为什么这群人不去给 VS Code 提 PR 而要**重写**——Electron 这层地基拆不掉

## 核心要点

Zed 的设计选择可以拆成 **三条**：

1. **自研 GPU UI 框架（GPUI）**：放弃浏览器渲染管线，直接对 macOS Metal / Linux Vulkan / Windows DirectX 写 immediate-mode UI。类比：放弃在别人家厨房做饭（DOM），自己买灶台直连水电。代价是重写按钮、滚动、文字排版；收益是每帧跑在 GPU 上，60fps 不易掉帧。

2. **三线程分工**：main 管 UI 状态、background 跑 LSP / Git / 文件 IO、render 专心交给 GPU。类比：餐厅前厅、后厨、外送各管一摊。**关键：输入事件永远第一时间被 main 处理，不会被任何插件阻塞**。

3. **CRDT 实时协作**：每个字符带全局唯一 ID，多人同改一行也能合并。类比：便签都贴座位号，按号排序即合并结果。冲突在本地算完；同步仍可走协作服务，不是"完全无服务器"。

这三条合称 **"重写底座 + 多线程隔离 + 协作内建"**——从硬件往上重做编辑器，不是给 VS Code 加插件能换出来的。

## 实践案例

### 案例 1：5 分钟跑通

```bash
# macOS
brew install --cask zed
zed .

# Linux
curl -f https://zed.dev/install.sh | sh

# Windows：从 https://zed.dev/download 装官方安装包
```

**逐部分解释**：

1. 装好后打开你最大的项目目录
2. 长按方向键划过几千行文件——感受滚动是否顿
3. 打开命令面板（macOS `Cmd+Shift+P`，Windows/Linux `Ctrl+Shift+P`）——弹出应远快于 Electron 编辑器
4. 右上头像 → Share Project → 拷链接给同事，试一次多人光标

### 案例 2：开 SSH 远程开发

```bash
zed ssh://user@server.example.com/path/to/project
```

**逐部分解释**：

- 本地只跑 GPUI 界面；远端起一个约 30MB 的 `zed-remote-server`
- LSP / Git / 索引在服务器跑，适合 Mac/Windows 写 Linux 上的 Rust/Go
- 断线后重开同一 URI 即可续上；Windows 还可走 WSL：`File → Open Remote → Add WSL Distro`

### 案例 3：感受 GPU 渲染优势

打开一个几十 MB 的 JSON Lines 日志，长按 Page Down 连续翻页。

**逐部分解释**：

- VS Code 要让浏览器引擎重 layout 大量 DOM，长文件易卡
- Zed 告诉 GPU"画这一段文本范围"，一帧内完成
- 对比同一文件在两边滚动，差异最直观

## 踩过的坑

1. **扩展生态仍薄**：扩展只能用 WebAssembly（WASM）写，比 VS Code 的 Node 插件池小得多；换编辑器前先确认关键插件有没有对应方案。
2. **AGPL 不是 MIT**：core 仓 AGPL v3，公司 fork 二次分发要把衍生代码开源；只有 Apache 2.0 模块（如 GPUI）可任意商用。
3. **GPUI 不是 React 心智**：immediate mode（每帧重画）+ retained state（保留状态）混合，写自定义 UI 容易"以为是 React 但写不对"。
4. **AI / 调试仍偏轻**：内嵌 AI 偏编辑增强，不如 Cursor 的 agent 流；DAP（调试适配协议）在补，重 IDE 调试仍弱于 IntelliJ / VS Code。

## 适用 vs 不适用场景

**适用**：

- macOS / Linux / Windows 上写 Rust / Go / TypeScript 等 LSP 成熟语言
- 结对、直播教学、远程 1:1 需要两人同时改同一份代码
- 对输入延迟敏感（盲打快、长文件滚动多）
- 想要轻量编辑器、不想被 IDE 拖慢

**不适用**：

- 重度依赖某个 VS Code 独有插件且 Zed 无替代
- 需要 fork 编辑器二次分发为商业闭源产品（AGPL 阻挡）
- 需要重 IDE 级调试 / 重构（DAP 与重构工具链仍弱）
- 需要 Cursor 式深度 agent 工作流（Zed AI 定位更轻）

## 历史小故事（可跳过）

- **2014**：GitHub 发布 Atom，Electron 编辑器流派由此兴起
- **2018**：VS Code 反超 Atom 市场份额
- **2022-06**：GitHub 宣布 Atom EOL；同年 9 月 Nathan Sobo / Max Brunsfeld / Antonio Scandurra 成立 Zed Industries，全程 Rust + GPUI
- **2024-01-24**：Zed 全量开源（AGPL v3）；**2024-08** Linux 1.0
- **2025**：Windows 官方稳定；之后 AI、SSH/WSL 远程、DAP 逐步补齐

## 学到什么

1. **底座决定上限**：在 Electron 上做个位数毫秒输入延迟几乎不可能，地基拆不掉
2. **三线程分工**才是输入不卡的关键——UI 线程不被插件阻塞，不只是"GPU 快"
3. **CRDT 让协作可内建**：冲突本地可合并；同步层仍可有服务，二者要分开看
4. **重写 vs 渐进改造**：抽象边界错了，重写有时比改造便宜；Zed 赌对了

## 延伸阅读

- 官方博客：[How Zed Works](https://zed.dev/blog/videogame)（把编辑器当游戏引擎做）
- GPUI：[Building Zed GPU UI Framework](https://zed.dev/blog/gpui-2)
- Windows 发布：[Windows When? Windows Now](https://zed.dev/blog/zed-for-windows-is-here)
- 协作底层：[Real-time collaboration in Zed](https://zed.dev/blog/crdts)
- 视频：[Nathan Sobo - Why we rewrote Atom](https://www.youtube.com/results?search_query=zed+nathan+sobo)
- [[atom-editor]] —— Zed 的精神前传
- [[crdt-yjs]] —— 实时协作底层算法

## 给零基础读者的"先做这件事"

1. **不必立刻换主力**：先装一个用 1 小时，感受输入延迟
2. **打开最大项目**对比滚动平滑度——最直观差异
3. **找朋友试一次 Share Project**：两人同时改同一文件
4. **不用纠结扩展**：默认 LSP / Vim / Git diff 往往够用
5. **写 Rust / Go**：跳定义与重命名通常跟得上手速

## 关联

- [[rust-lang]] —— 全栈 Rust，编译期内存安全是 GPUI 稳的前提
- [[tree-sitter]] —— 语法高亮 / 折叠 / 大纲走增量解析
- [[lsp-protocol]] —— 智能感知走标准 LSP，与 VS Code 共享生态
- [[wasmtime]] —— 扩展跑在 WASM 沙箱
- [[metal-graphics]] —— macOS 端 GPU 管线；Windows 对应 DirectX

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
