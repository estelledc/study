---
title: Zed — 高性能多人协作代码编辑器
来源: https://github.com/zed-industries/zed
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

# Zed — 高性能多人协作代码编辑器

## 一、Zed 是什么？用一句话理解

Zed 是一个**用 Rust 语言编写的高性能代码编辑器**，由 Atom 编辑器的创始人 Nathan Sobo 带领团队开发。它可以从零启动、极速响应，并内置了多人实时协作和 AI 助手功能。

## 二、日常类比：把编辑器想象成厨房

想象你在厨房里做饭：

- **传统编辑器（如早期 VS Code）** 像一台旧厨房——能用，但打开冰箱、找调料时会犹豫几秒。
- **Zed** 像一台顶级专业厨房——所有工具都在你手边，灯光一开就亮，刀锋永远锋利。因为它用 Rust 写的，Rust 是一种对内存管理极其严格的编程语言，这让 Zed 几乎不会出现"卡住"或"崩溃"的情况。

Atom 编辑器在 2022 年停更后，Nathan Sobo 和 Tree-sitter 的作者决定从零开始做 Zed。2024 年开源，2026 年 4 月发布 1.0 正式版。

## 三、核心概念

### 3.1 为什么 Rust 让 Zed 快？

Rust 语言的核心优势是**内存安全 + 零成本抽象**。通俗讲：

> 就像一辆车——普通编辑器用 Java/JavaScript 写的，运行时会有"垃圾回收"（类似司机中途要停车整理行李）；而 Rust 编写的 Zed 在编译时就解决了内存问题，运行时不需要停下来整理，所以始终流畅。

### 3.2 多人实时协作

Zed 的多人协作是**原生内置**的，不需要像其他编辑器那样安装额外插件。多人协作的原理类似 Google Docs：

> 你和同事同时编辑一个文件，每个人的光标和修改都会实时出现在对方的屏幕上。Zed 用一种叫"操作转换"（Operational Transformation）的技术来确保两个人同时修改不同行时不会冲突。

### 3.3 命令面板（Command Palette）

Zed 的所有功能都可以通过命令面板访问。如果你忘了某个快捷键，打开命令面板搜索即可：

- macOS: `Cmd + Shift + P`
- Linux/Windows: `Ctrl + Shift + P`

这就像给编辑器装了一个"万能遥控器"——任何功能都能通过它找到。

## 四、配置示例

### 4.1 设置主题和字体

Zed 使用 JSON 格式的配置。在 Zed 中按 `Cmd + ,`（macOS）或 `Ctrl + ,`（Linux/Windows）打开设置编辑器。

**示例 1：自定义主题和字体**

```json
{
  "theme": {
    "light": "One Light",
    "dark": "One Dark"
  },
  "buffer_font_family": "JetBrains Mono",
  "buffer_font_size": 16,
  "format_on_save": "on",
  "tab_size": 2
}
```

这里做了四件事：
1. 为亮色和暗色模式分别指定主题
2. 设置编辑器使用的字体为 JetBrains Mono（程序员常用等宽字体）
3. 设置字体大小为 16 像素
4. 开启保存时自动格式化，并设置缩进为 2 个空格

### 4.2 配置 Vim 模式

Zed 内置了对 Vim 键盘布局的支持，只需在设置中打开即可：

**示例 2：启用 Vim 模式**

```json
{
  "vim_mode": true
}
```

开启后，Zed 的行为就和 Vim 编辑器一样了——使用 `h j k l` 移动光标，`i` 进入插入模式，`Esc` 退出插入模式等。

如果你不喜欢 Vim，也可以用 Helix 模式（另一种流行的 Vim 风格编辑器）：

```json
{
  "helix_mode": true
}
```

## 五、常用操作速查

| 操作 | macOS | Linux/Windows |
|------|-------|---------------|
| 打开命令面板 | `Cmd + Shift + P` | `Ctrl + Shift + P` |
| 快速打开文件 | `Cmd + P` | `Ctrl + P` |
| 跳转到符号 | `Cmd + Shift + O` | `Ctrl + Shift + O` |
| 项目中查找 | `Cmd + Shift + F` | `Ctrl + Shift + F` |
| 打开终端 | `` Ctrl + ` `` | `` Ctrl + ` `` |
| 打开设置 | `Cmd + ,` | `Ctrl + ,` |
| 切换主题 | `Cmd + K Cmd + T` | `Ctrl + K Ctrl + T` |

## 六、AI 功能

Zed 内置了 AI 助手（叫 "Zed Agent"），可以用 `Cmd + Shift + A` 打开聊天面板，用 `Cmd + Enter` 进行行内辅助。AI 功能支持多种提供商，包括 Zed 自带的模型和自定义 API 接入。不过需要注意：AI 功能是付费的（ Freemium 模式），基础编辑器免费，但 AI 功能需要订阅。

## 七、技术栈速览

| 项目 | 内容 |
|------|------|
| 编程语言 | Rust |
| 支持平台 | macOS、Linux、Windows |
| 开源许可证 | GPL-3.0 / AGPL / Apache-2.0 |
| GitHub | github.com/zed-industries/zed |
| 最新版本 | 1.6.3（2026年6月10日发布） |
| 资金 | Sequoia Capital 投资 3200 万美元 |

## 八、总结

Zed 的核心卖点可以用三个词概括：**快、协作、AI**。它不是另一个 VS Code 的克隆，而是从底层重新思考了"编辑器应该有多快"这个问题。对于追求极致响应速度的开发者来说，Zed 是一个值得尝试的选择。
