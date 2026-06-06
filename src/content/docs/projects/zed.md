---
title: Zed — Atom 团队 Rust 重写的 GPU 协作编辑器
来源: https://github.com/zed-industries/zed
日期: 2026-06-01
子分类: 编辑器与 IDE
分类: CLI
难度: 中级
provenance: pipeline-v3
---

## 是什么

Zed 是**前 Atom 核心团队用 Rust 重写的代码编辑器**，把"GPU 渲染、多线程并行、实时协作"三件事**塞进同一个二进制**。日常类比：以前的编辑器像家用轿车（Electron 套壳，够用但起步慢），Zed 像电动跑车（自研底盘 + 三电分工 + 远程对讲），起步零延迟，副驾还能远程上人。

你只要装一个 90MB 左右的 dmg/AppImage，打开就能：

- **8ms 首字延迟**（VS Code 普遍 50-100ms）——按下键到看到字符的时间
- 邀请同事敲一段 URL 就**像 Google Docs 一样多人同时编辑代码**，光标各自带颜色
- 跑着 LSP、Git、文件索引，**输入永远不卡**——因为这些都被丢到背景线程

截至 2026-05，约 52k stars，core 仓在 AGPL v3 下开源，GPUI 等可复用模块走 Apache 2.0。

## 为什么重要

不理解 Zed 的设计选择，下面这些事都没法解释：

- 为什么 Atom 在 2022 年被 GitHub **官方关停**——Electron 单线程 + DOM 重绘是死结
- 为什么 VS Code 流畅但 Zed 还能"再快一档"——同样是软件，差距来自**有没有走 GPU**
- 为什么实时协作 10 年都做不进编辑器——直到 CRDT 算法成熟（2019 后）
- 为什么这群人不去给 VS Code 提 PR 而要**重写**——Electron 这层地基拆不掉

## 核心要点

Zed 的设计选择可以拆成 **三条**：

1. **自研 GPU UI 框架（GPUI）**：放弃浏览器渲染管线，直接对 macOS Metal / Linux Vulkan 写 immediate-mode UI。类比：放弃在别人家厨房做饭（DOM），自己买灶台直连水电。代价是要重写按钮、滚动、文字排版；收益是每帧画面都跑在 GPU 着色器上，60fps 不掉帧。

2. **三线程分工**：main thread 只管 UI 状态、background thread 跑 LSP / Git / 文件 IO、render thread 专心交给 GPU。类比：餐厅前厅、后厨、外送各管一摊，不会因为后厨切菜慢就让前厅停止接单。**关键发明：输入事件永远第一时间被 main 处理，不会被任何插件阻塞**。

3. **CRDT 实时协作**：每个字符带一个全局唯一 ID，多人同时编辑同一行也能合并不冲突。类比：每个人写便签都贴自己的座位号，最后按座位号排序就是合并好的版本。无需中心服务器仲裁，本地 first。

这三条加起来叫 **"重写底座 + 多线程隔离 + 协作内建"**——是一种从硬件往上重新设计编辑器的判断，不是给 VS Code 加插件能换出来的。

## 实践案例

### 案例 1：5 分钟跑通

```bash
# macOS
brew install --cask zed
zed .                   # 当前目录就是工作区

# Linux (1.0 在 2024-08 上线)
curl -f https://zed.dev/install.sh | sh
```

打开后试这三件事感受差异：

```bash
1. 长按方向键划过 5000 行的文件 -> 不卡，VS Code 在长文件上会顿
2. Cmd+Shift+P 打开命令面板 -> 弹出 < 50ms
3. 邀请协作：右上头像 -> Share Project -> 拷链接给同事
```

### 案例 2：开 SSH 远程开发（替代 VS Code Remote）

```bash
# Zed 1.0+ 内置 remote 协议
zed ssh://user@server.example.com/path/to/project
```

- 服务器侧只跑一个 zed-remote-server 二进制（约 30MB）
- 本地 GPUI 渲染，远端跑 LSP/Git/索引
- 适合在 MacBook 上写跑在 Linux 服务器上的 Rust/Go 项目

### 案例 3：感受 GPU 渲染优势

```rust
// 在 Zed 里打开一个 50MB 的 JSON Lines 日志文件
// 长按 Page Down -> 滚动平滑得像视频
// 同样的文件在 VS Code -> 滚到一半 UI 卡顿
```

底层差异：VS Code 滚动需要让浏览器引擎重新 layout DOM，几千个 div 一帧画不完；Zed 直接告诉 GPU"渲染这一段文本范围"，GPU 一帧就完事。

## 踩过的坑

1. **macOS 优先**：Linux 1.0 拖到 2024-08，Windows 至今没有官方版本（社区维护 fork）。如果你日常 Windows 主力开发，目前不是好选择。

2. **AGPL 不是 MIT**：核心仓 AGPL v3，公司想 fork 二次分发要把整套衍生代码开源。Apache 2.0 部分（GPUI、tree-sitter 绑定等）才能任意商用。

3. **GPUI 不是 React 心智模型**：immediate mode（每帧重画）+ retained state（保留状态）混合，写自定义 UI 时容易"以为是 React 但写出来不对"。学习曲线比 Electron 陡。

4. **扩展生态薄**：Zed 扩展只能用 WebAssembly 写，比 VS Code 的 Node.js 生态小得多。重度依赖某个 VS Code 插件的，先确认 Zed 有没有对应方案。

5. **AI 内嵌但偏简洁**：Zed 自带 AI 助手（接 Anthropic Claude / OpenAI），但是定位轻量编辑增强，不像 Cursor 那样 agent 化。喜欢 agent 流的目前还是 Cursor 更合适。

## 适用 vs 不适用场景

**适用**：
- macOS / Linux 上写 Rust / Go / TypeScript 等 LSP 成熟语言
- 结对编程、直播教学、远程 1:1 时需要"两个人同时在一份代码上"
- 对输入延迟敏感（盲打速度快、写作流派）
- 追求轻量、不想被 IDE 拖慢的开发者

**不适用**：
- Windows 主力（无官方版）
- 重度依赖 VS Code 特定插件（远程开发以外的小众生态）
- 需要 fork 编辑器二次分发为商业产品（AGPL 阻挡）
- 需要重 IDE 调试体验（Zed DAP 还在补，比 IntelliJ / VS Code 弱）

## 历史小故事（可跳过）

- **2014 年**：GitHub 发布 Atom，开创"Web 技术写编辑器"流派，Electron 由此而生
- **2018 年**：VS Code（同样基于 Electron 但 Microsoft 工程优化更狠）反超 Atom 市场份额
- **2022-06**：GitHub 官方宣布关停 Atom，正式 EOL
- **2022-09**：Atom 三位核心 Nathan Sobo / Max Brunsfeld / Antonio Scandurra 成立 Zed Industries，私下开发 Zed，**全程 Rust + 自研 GPUI**
- **2023-03**：公开预览（macOS only，闭源）
- **2024-01-24**：Zed 0.122 全量开源，AGPL v3
- **2024-08**：Linux 1.0 发布
- **2025-2026**：内嵌 AI 助手、SSH 远程、DAP 调试逐步补齐

之后 2 年，Zed 成了"想从 VS Code 换走的人"最常被推荐的目标。

## 学到什么

1. **底座决定上限**：在 Electron 上做 8ms 延迟的编辑器是不可能的，地基拆不掉
2. **三线程分工**是输入永不卡的关键，不是"GPU 快"，是"UI 线程不被任何插件阻塞"
3. **CRDT 让协作内建**——10 年前实时协作要中心服务器，2019 后 CRDT 成熟才让本地 first 协作可行
4. **重写 vs 渐进改造**：当抽象边界错了，重写比改造便宜；Zed 选择重写，赌对了

## 延伸阅读

- 官方博客：[How Zed Works](https://zed.dev/blog/videogame)（把编辑器当游戏引擎做）
- GPUI 介绍：[Building Zed GPU UI Framework](https://zed.dev/blog/gpui-2)
- Channels 协作架构：[Channels: A new place to talk about code](https://zed.dev/blog/channels)
- 协作底层：[Real-time collaboration in Zed](https://zed.dev/blog/crdts)（讲他们怎么把 CRDT 落到代码编辑器）
- 视频：[Nathan Sobo - Why we rewrote Atom](https://www.youtube.com/results?search_query=zed+nathan+sobo)（创始人讲为什么不修 Atom 而要重做）
- [[atom-editor]] —— Zed 的精神前传，被 Electron 困住的那一代
- [[crdt-yjs]] —— 实时协作的底层算法

## 给零基础读者的"先做这件事"

如果你是初学者、第一次听说 Zed，建议这样上手：

1. **不必立刻换主力编辑器**：先装一个用 1 小时——感受"输入零延迟"是什么样
2. **打开你最大的项目**对比滚动平滑度——这是最直观的差异
3. **找一个朋友试一次实时协作**：Share Project 链接发给他，两人同时编辑同一个文件，体验"代码版 Google Docs"
4. **不用纠结扩展**：Zed 默认带的 LSP / Vim mode / Git diff 已经够用，扩展薄不是缺点是判断
5. **如果你写 Rust / Go**：Zed 是目前最舒服的选择之一，编译错误 / 跳定义 / 重命名都跟得上手速

## 关联

- [[rust-lang]] —— Zed 全栈 Rust，编译期内存安全是 GPUI 不崩的前提
- [[tree-sitter]] —— Zed 的语法高亮 / 折叠 / 大纲全部走 tree-sitter 增量解析
- [[lsp-protocol]] —— Zed 的"智能感知"走标准 LSP，与 VS Code 共享生态
- [[wasmtime]] —— Zed 扩展运行时，所有插件都跑在 WASM 沙箱里
- [[metal-graphics]] —— macOS 端 GPU 渲染走 Metal，是 GPUI 的底层管线
