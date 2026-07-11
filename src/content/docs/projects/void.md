---
title: Void — 开源 Cursor 替代
来源: 'https://github.com/voideditor/void'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Void 是一个基于 VS Code 改出来的 AI 编程编辑器：它把聊天、行内改代码、Agent、模型选择都放进编辑器里，并且把实现完整开源。日常类比：像把你熟悉的书桌改成带助手的书桌，抽屉、台灯、纸张位置都没大变，但旁边多了一个能看文件、提建议、帮你改草稿的人。

最小使用画面可以想成这样：

```bash
ollama pull qwen2.5-coder:7b
ollama serve
# 在 Void 设置里选 Ollama，再把 Chat / Apply / Autocomplete 模型指过去
```

它不是一个普通 VS Code 插件，而是一个 VS Code fork。这个选择让它能改更深的地方：例如定制 AI provider、改文件编辑服务、把 React 和 Tailwind 挂进 workbench、做流式 diff。

但要先知道一个现实：Void 仓库在 2026-06-02 已归档，不再接收贡献。今天学习它，更多是学习“AI 编辑器如何改造 VS Code”的工程参考，而不是选择一个长期维护的日用 IDE。

## 为什么重要

不理解 Void，下面这些事很难解释：

- 为什么很多 AI 编辑器宁可 fork VS Code，也不只做一个插件
- 为什么“模型能聊天”和“模型能稳定改文件”是两件不同的事
- 为什么本地模型、云模型、MCP、终端权限放到一起后，问题会突然变复杂
- 为什么开源 Cursor 替代品的价值，不只在免费，而在能看到编辑器内部怎么接 AI

## 核心要点

1. **它把 AI 当成编辑器的一等功能**。类比：不是在桌边临时放一台翻译机，而是把翻译机接进了抽屉、纸夹和台灯。Void 的聊天、Apply、Cmd+K、Agent 都围绕同一套编辑体验展开。

2. **它用服务层改 VS Code 内部状态**。类比：不让助手直接乱改纸，而是让助手通过“文档管理员”登记修改。官方 codebase guide 提到，Void 通过 `EditCodeService` 展示 diff，通过 `VoidModelService` 同步系统文件和编辑器里的 text buffer。

3. **它强调模型自带和数据直连 provider**。类比：你可以请外面的顾问，也可以让本地电脑上的助手工作。README 说 Void 支持把消息直接发给 provider，并允许使用本地 host；这也是它和封闭 AI IDE 的重要差异。

## 实践案例

### 案例 1：用本地模型做 Chat

真实来源：README 强调可以 bring any model or host locally，issue 区也有用户用 Ollama、本地模型调 Agent 的例子。最小动作通常长这样：

```bash
ollama pull qwen2.5-coder:7b
ollama serve
```

逐部分解释：

- `ollama pull`：先把模型下载到本机，像把参考书搬到桌上
- `ollama serve`：启动本地模型服务，让编辑器能通过 HTTP 找到它
- Void 设置里的 provider / model：把 Chat、Autocomplete、Apply 分别指向可用模型

这个案例的重点不是“命令多炫”，而是架构选择：Void 让编辑器可以连本地模型，避免所有代码上下文都必须交给某个固定云服务。

### 案例 2：用 Cmd+K / Apply 改一小段代码

真实来源：Void codebase guide 解释了 Fast Apply 的 Search/Replace 块；同一套逻辑也服务 Apply、模型 Edit 工具和 Cmd+K。

```text
<<<<<<< ORIGINAL
const title = "hello"
=======
const title = "Hello, Void"
>>>>>>> UPDATED
```

逐部分解释：

- `ORIGINAL`：必须和文件里的原文精确对应，像“先圈出要改的句子”
- `UPDATED`：模型想替换成的新内容
- 中间的分隔线：告诉编辑器哪里是旧内容、哪里是新内容

这就是 Fast Apply 的核心直觉：不是让模型重写整个文件，而是让它给出一个可定位的补丁。文件越大，这种方式越省 token，也越容易展示红绿 diff。

### 案例 3：用 MCP 让 Agent 访问指定目录

真实来源：issue #752 里有用户尝试用 Docker 版 filesystem MCP，让本地模型在 Agent Mode 里读写项目目录。配置大意如下：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v",
        "D:/story-buddy:/local-directory",
        "mcp/filesystem",
        "/local-directory"
      ]
    }
  }
}
```

逐部分解释：

- `command: "docker"`：用容器启动一个文件系统工具
- `-v D:/story-buddy:/local-directory`：只把一个项目目录挂进去，避免整个硬盘暴露
- `mcpServers.filesystem`：告诉 Void，Agent 可以通过这个工具请求文件操作

这个案例也暴露了坑：配置写对，不代表模型一定会用工具。issue 里的用户遇到本地模型仍声称“不能访问文件系统”的情况，所以 Agent 能力要靠真实读写验证。

## 踩过的坑

1. **把 Void 当普通 VS Code 插件**：它是 fork，不是 VSIX 插件，所以能改深层逻辑，也会承担跟上游同步的成本。

2. **以为 Fast Apply 总能成功**：Search/Replace 的 `ORIGINAL` 必须精确匹配，空格、注释、上下文不一致都可能导致“找不到原文”。

3. **以为本地模型天然会用工具**：Ollama 或 LM Studio 只是提供模型，模型是否正确调用文件工具、终端工具，还取决于提示词、工具协议和实现细节。

4. **忽略仓库已归档**：Void 仍是很好的 VS Code fork 参考，但不适合作为“未来一定有人维护”的生产依赖。

## 适用 vs 不适用场景

**适用**：

- 想学习 AI 编辑器如何接入 VS Code 内部服务
- 想研究开源 Cursor / Windsurf 类产品的基础架构
- 想看本地模型、provider、Apply、Agent 如何被揉进一个桌面编辑器
- 想 fork VS Code，并参考打包、签名、自动更新、React 挂载等经验

**不适用**：

- 只想要一个稳定日用、持续更新的 IDE
- 只需要一个轻量 AI 插件，不想维护完整编辑器 fork
- 团队无法承担 Electron、VS Code 上游、构建链和平台打包成本
- 需要强保证的 Agent 文件操作，且没有精力做回归测试和权限隔离

## 历史小故事（可跳过）

- **2024 年前后**：开源社区开始集中探索“AI 原生编辑器”，Void 选择从 VS Code fork 入手。
- **快速增长期**：Void 因“开源 Cursor 替代”定位获得大量关注，GitHub stars 达到约 28.8k。
- **工程沉淀期**：项目把 React / Tailwind、AI provider、Apply、模型服务、打包流水线等经验写进 README 和 codebase guide。
- **2026-06-02**：仓库被归档，官方说明不再接收贡献，但仍推荐后来者参考它的 VS Code fork 逻辑。

## 学到什么

- AI 编辑器的难点不是“能不能调用模型”，而是“模型输出如何可靠落到编辑器状态里”。
- Fork VS Code 能拿到更深控制权，也会把构建、上游同步、平台发布一起背到自己身上。
- 本地模型带来自主性，但不会自动带来可靠 Agent；工具调用需要单独设计和验证。
- Void 的最大学习价值，是把一个 AI IDE 拆开给你看：provider、diff、model、IPC、CSP、打包都能追到源码。

## 延伸阅读

- [Void GitHub README](https://github.com/voideditor/void)（项目定位、归档状态、核心链接）
- [Void Codebase Guide](https://github.com/voideditor/void/blob/main/VOID_CODEBASE_GUIDE.md)（理解服务、Apply、模型管线）
- [Void How to Contribute](https://github.com/voideditor/void/blob/main/HOW_TO_CONTRIBUTE.md)（构建和开发模式）
- [[vscode]] —— Void 的底座，理解 fork 前先理解 VS Code
- [[continue]] —— 另一个开源 AI 编程助手，对比“插件路线”和“fork 路线”
- [[ollama]] —— 本地模型 provider，经常和 Void 的本地模型场景一起出现

## 关联

- [[vscode]] —— Void 直接 fork VS Code，很多概念来自 workbench、model、service
- [[continue]] —— 同样做 AI 编程助手，但更偏插件/扩展路线
- [[cline]] —— Agent 型编码工具，对比“对话代理如何安全改文件”
- [[ollama]] —— Void 的本地模型使用姿势常围绕 Ollama 展开
- [[textmate]] —— 编辑器语法高亮传统，帮助理解现代编辑器底层积木
- [[claude-code]] —— 另一个把 Agent 放进开发流程的工具，可对比终端路线和 IDE 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
