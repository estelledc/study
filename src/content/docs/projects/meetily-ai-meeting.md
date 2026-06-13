---
title: Meetily - 隐私优先的 AI 会议助手
来源: https://github.com/Zackriya-Solutions/meetily
日期: 2026-06-13
分类_原始: 工具
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

# Meetily - 隐私优先的 AI 会议助手

## 一、从日常类比开始

想象你要参加一个很重要的会议。传统做法是你带个笔记本进去，事后自己整理要点。

现在很多 AI 会议工具就像雇了个"云端秘书"——你把录音发到网上，秘书听完给你整理笔记。问题在于：你的会议内容可能涉及商业机密，谁都能看到这个秘书。

Meetily 的做法是：请了个"家秘书"，就在你电脑里工作。录音 never 离开你的机器，转录、总结全在本地完成。这就是"隐私优先"的意思。

## 二、Meetily 是什么

Meetily 是一个开源的桌面应用，核心功能有三个：

1. **实时录音转文字** — 开会时把声音变成文字，像开了个实时字幕
2. **AI 自动总结** — 会议结束后，用 AI 模型生成摘要
3. **全部本地运行** — 不需要联网，数据不离开你的电脑

GitHub 上有 12.7k Star，2026 年 6 月发布了 v0.4.0 版本。

## 三、技术架构

Meetily 用了两种语言协作开发，这种搭配很有意思。

| 层次 | 技术 | 职责 |
|------|------|------|
| 前端界面 | Next.js (TypeScript) | 你看到的按钮、文本框、录音状态 |
| 后端引擎 | Rust | 录音采集、语音转文字、AI 总结 |
| 打包工具 | Tauri | 把 Rust + Next.js 打包成一个桌面应用 |

Tauri 是关键概念。它让你可以用 Web 技术（HTML/JS）写界面，用系统级语言（Rust）写逻辑，最后打包成 macOS、Windows、Linux 都能用的安装包。

类比：前端是"装修好的展厅"，Rust 后端是"仓库里的机器"，Tauri 是"把两者装进同一个集装箱的卡车"。

## 四、核心概念

### 4.1 本地语音识别

Meetily 内置了两个语音识别模型：

- **Whisper** — OpenAI 开源的语音转文字模型，可靠、稳定
- **Parakeet** — NVIDIA 开发的模型，速度比 Whisper 快 4 倍

你可以选一个用。默认 Whisper 已经很好用了，追求速度就换 Parakeet。

### 4.2 多种 AI 总结来源

转录完文字后，Meetily 需要 AI 来生成会议总结。它支持多种来源：

| 来源 | 特点 |
|------|------|
| Ollama | 完全本地跑，最隐私 |
| Claude |  Anthropic 的模型，效果好但需要联网 |
| Groq | 超快的云端推理 |
| 自定义 OpenAI 兼容端点 | 用自己的 API |

### 4.3 GPU 加速

语音识别很耗算力。Meetily 支持 GPU 加速：

- **macOS** — Apple Silicon 用 Metal，Intel 用 CoreML
- **Windows/Linux** — NVIDIA 用 CUDA，AMD 用 Vulkan/ROCm
- **无 GPU** — 纯 CPU 也能跑，只是慢一些

## 五、代码示例

### 示例 1：安装 Meetily（三种平台）

Meetily 不需要编译也能用——直接下载安装包就行。

**macOS：**

```bash
# 1. 从 GitHub Releases 下载 DMG
curl -LO https://github.com/Zackriya-Solutions/meeting-minutes/releases/latest/download/meetily_0.4.0_aarch64.dmg

# 2. 挂载 DMG 并拖到 Applications
hdiutil attach meetily_0.4.0_aarch64.dmg
cp -R /Volumes/Meetily/Meetily.app /Applications/
hdiutil detach /Volumes/Meetily

# 3. 启动
open /Applications/Meetily.app
```

**Windows：**

从 [Releases 页面](https://github.com/Zackriya-Solutions/meeting-minutes/releases/latest) 下载 `x64-setup.exe`，双击运行即可。

**Linux（从源码构建）：**

```bash
# 克隆仓库
git clone https://github.com/Zackriya-Solutions/meeting-minutes
cd meeting-minutes/frontend

# 安装依赖
pnpm install

# 构建（自动检测 GPU）
./build-gpu.sh
```

### 示例 2：用 Ollama 做本地 AI 总结

这是 Meetily 最推荐的 AI 总结方式——完全在本地运行，数据不出机器。

**第一步：安装 Ollama**

```bash
# macOS 或 Linux
curl -fsSL https://ollama.com/install.sh | sh

# 下载一个模型（比如 llama3.2，约 2GB）
ollama pull llama3.2
```

**第二步：在 Meetily 中配置**

打开 Meetily → Settings → AI Provider，选择 Ollama，默认地址 `http://localhost:11434`，模型填 `llama3.2`。

**第三步：生成会议总结**

会议录音结束后，点击"Generate Summary"，Meetily 会把转录文字发给 Ollama，本地生成摘要。

**第四步：编辑和调整**

Meetily 有个内置编辑器，你可以修改生成的摘要、添加自己的备注。截图里的效果是：

```
Meeting Summary:
- Discussed Q3 product roadmap
- Agreed on feature prioritization
- Action items assigned to team members
- Next meeting scheduled for June 20
```

### 示例 3：从源码构建 Meetily

如果你想研究代码或二次开发：

```bash
# 克隆仓库（需要 Git）
git clone https://github.com/Zackriya-Solutions/meetily
cd meetily

# 项目结构：
# ├── backend/        — Rust 后端代码
# ├── frontend/       — Next.js 前端代码 + Tauri 配置
# ├── llama-helper/   — Ollama 本地推理 helper
# ├── docs/           — 文档
# ├── scripts/        — 构建脚本
# ├── Cargo.toml      — Rust 依赖管理
# └── Cargo.lock      — 锁定依赖版本

# 安装 Node 依赖
cd frontend
pnpm install

# 开发模式（带热重载，改代码自动刷新）
pnpm tauri:dev

# 生产构建
pnpm tauri:build
```

构建完成后，macOS 上的可执行文件在：

```
src-tauri/target/release/bundle/macos/Meetily.app
```

### 示例 4：Tauri 后端的核心 Rust 结构

Meetily 的 Rust 后端用 Cargo 管理依赖。`Cargo.toml` 的关键部分：

```toml
[workspace]
resolver = "2"
members = [
    "frontend/src-tauri",
    "llama-helper"
]

[workspace.package]
edition = "2021"
rust-version = "1.77"

[workspace.dependencies]
anyhow = "1.0"           # 错误处理库
serde = { version = "1.0", features = ["derive"] }   # JSON 序列化
serde_json = "1.0"       # JSON 处理
tokio = { version = "1.32.0", features = ["full"] }  # 异步运行时
```

这些依赖说明 Meetily 用了：
- `serde` — 在 Rust 结构和 JSON 之间转换（比如把会议数据存到 SQLite）
- `tokio` — 处理录音、网络请求等异步任务
- `anyhow` — 处理各种错误（找不到音频设备、模型加载失败等）

## 六、隐私为什么重要

Meetily 解决的核心问题是：你的会议内容不该被任何云服务商访问。

现实中的数据泄露代价：
- 平均每次数据泄露成本：**440 万美元**（IBM 2024）
- 仅 GDPR 罚款就超过 **58.8 亿欧元**
- 加州今年已有 **400+ 起**违规录音案件

Meetily 的方案很简单：不联网 = 不外泄。录音、转录、模型、摘要，全部在你的硬盘上。

## 七、Meetily 的两个版本

| | Community Edition | PRO |
|--|-------------------|-----|
| 转录 | Whisper / Parakeet（本地） | 更高精度模型 |
| 总结 | Ollama / Claude / Groq 等 | 自定义模板 |
| 导出 | 基本格式 | PDF, DOCX, Markdown |
| 部署 | 单机 | 团队自托管 |
| 价格 | 免费开源 | 付费 |

社区版永远免费。PRO 适合需要更高精度和团队功能的用户。

## 八、学到的东西

1. **Tauri 是一个值得关注的框架** — 它让桌面应用开发可以用 Web 技术栈，同时保持系统级性能
2. **本地 AI 正在变成熟** — Whisper + Ollama 的组合可以在没有网络的情况下做高质量的会议处理
3. **隐私不是"功能"而是"架构"** — Meetily 从设计之初就决定不联网，而不只是加个"隐私模式"
4. **Rust + TypeScript 是个好搭配** — Rust 处理重活（音频、AI），TypeScript 处理界面，各司其职

## 九、下一步

- [ ] 下载安装 Meetily 试试录音转文字功能
- [ ] 安装 Ollama 体验完全本地的 AI 总结
- [ ] 看一遍 `frontend/src-tauri` 下的 Rust 代码，理解 Tauri 命令系统
