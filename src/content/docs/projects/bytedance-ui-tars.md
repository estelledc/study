---
title: bytedance/UI-TARS-desktop — 多模态 AI Agent 栈
来源: https://github.com/bytedance/UI-TARS-desktop
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 是什么

UI-TARS Desktop 是字节跳动开源的一个**桌面 GUI Agent**——你用它，就像请了一个能"看见屏幕、操作鼠标键盘"的虚拟助手。

日常类比：想象你有一个同事坐在你旁边，TA 能看着你的电脑屏幕，知道每个按钮长什么样、在哪，然后替你点点点。以前这种"看屏幕+动手"的能力只有人类有，UI-TARS 用 AI 模型把它做出来了。

它背后有两个东西：

1. **UI-TARS 模型**——一个视觉语言模型（VLM），能看懂屏幕截图，理解界面上有什么元素
2. **Agent TARS**——一个更通用的多模态 Agent 框架，除了桌面 GUI 操作，还能控制浏览器、终端，接入 MCP 工具链

这个项目 GitHub 上有 36k+ star，是目前最强的开源 GUI Agent 之一。

## 为什么重要

传统自动化工具（比如 Selenium、Playwright）靠"找元素 ID"来操作网页，但很多桌面应用没有这些结构化信息。UI-TARS 的思路是**让 AI 直接看屏幕截图**，像人一样理解界面，然后决定怎么操作。这带来了几个关键变化：

- **不依赖 DOM 结构**——任何能看到的界面都能操作，包括 Electron 应用、原生桌面软件
- **自然语言驱动**——你说"帮我打开 VS Code 的自动保存"，它自己去找按钮、去点击
- **端到端闭环**——看截图 → 理解 → 决策 → 执行 → 再看截图验证，形成完整循环

## 核心概念

### 1. Visual Grounding（视觉定位）

这是整个系统的核心。模型拿到一张屏幕截图后，要回答两个问题：**哪个像素区域是目标控件？** 和 **接下来该做什么操作？**

```
┌──────────────────────────────────────────┐
│  屏幕截图                                 │
│  ┌─────────────┐                         │
│  │ [File]      │  ← 模型标注出这个区域    │
│  │ [Edit]      │    是"File"菜单         │
│  │ [View]      │                         │
│  └─────────────┘                         │
│                                          │
│  模型输出:                                │
│  action: click                           │
│  coordinate: (x=45, y=20)                │
│  reasoning: 用户想打开设置，先点 File 菜单 │
└──────────────────────────────────────────┘
```

### 2. Agent Loop（智能体循环）

UI-TARS 不是一次性完成任务，而是走一个"感知-决策-执行-再感知"的循环：

```
┌─────────┐    截图    ┌──────────┐   操作指令   ┌──────────┐
│  观察    │ ────────→ │  推理    │ ──────────→ │  执行    │
│ (截图)   │ ←──────── │ (VLM)    │             │ (鼠标/键)│
└─────────┘   新截图   └──────────┘             └──────────┘
       ↑___________________________________________↓
                        循环直到任务完成
```

### 3. MCP 集成

Agent TARS 的内核基于 MCP（Model Context Protocol），可以挂载外部工具服务器。这意味着 AI Agent 不仅能操作界面，还能调用 shell 命令、查询数据库、生成图表等真实世界的能力。

## 代码示例

### 示例 1：用 Agent TARS CLI 启动一个 Agent

```bash
# 直接用 npx 启动，不需要安装
npx @agent-tars/cli@latest

# 或者全局安装（需要 Node.js >= 22）
npm install @agent-tars/cli@latest -g

# 指定模型提供商运行
agent-tars \
  --provider volcengine \
  --model doubao-1-5-thinking-vision-pro-250428 \
  --apiKey your-api-key
```

启动后，你可以在聊天框里输入自然语言指令，比如"帮我查一下当前目录有哪些文件"，Agent 会自动调用 shell 命令来执行。

### 示例 2：配置 MCP Server 让 Agent 拥有额外能力

```json
// agent-tars.config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/jason"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}
```

配置好后，Agent 就能通过这些 MCP Server 读写文件系统、查询数据库——不只是"看屏幕点点点"，而是真正能操作你的开发环境。

### 示例 3：用 UI-TARS SDK 构建自定义 GUI Agent

```typescript
import { TARSClient } from '@ui-tars/sdk';

const client = new TARSClient({
  model: 'ByteDance/UI-TARS-1.5-7B',
  apiKey: process.env.UI_TARS_API_KEY,
});

// 对一张截图做视觉定位
const result = await client.predict({
  image: 'screenshot.png',
  prompt: '点击左上角的 File 菜单',
  ocrPrompts: true,
});

// 返回结构化的操作指令
console.log(result);
// {
//   action: 'click',
//   coordinate: [45.2, 18.6],   // 归一化坐标 [0-100]
//   reasoning: '用户需要打开文件菜单来新建文件...'
// }
```

SDK 让你可以把 UI-TARS 的能力嵌入到自己的应用中，而不仅仅是在桌面客户端里用。

## 架构概览

```
┌─────────────────────────────────────────────────┐
│                  用户                            │
│  "帮我订一张从北京到上海的机票"                   │
└─────────────────────┬───────────────────────────┘
                      │ 自然语言指令
┌─────────────────────▼───────────────────────────┐
│              Agent TARS (调度层)                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ GUI Agent│  │ Browser  │  │ MCP Tools     │  │
│  │ (桌面)   │  │ Agent    │  │ (shell/DB...) │  │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       │             │               │            │
│       └─────────────┴───────────────┘            │
│                    │ 请求                        │
└────────────────────┼────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│          UI-TARS VLM 模型                        │
│  输入: 屏幕截图 + 任务描述                        │
│  输出: 操作指令 (click/type/scroll/keyboard)     │
└─────────────────────────────────────────────────┘
```

## 两种运行模式

### 本地模式

模型和 Agent 都在你自己的电脑上跑。优点是隐私性好、不需要联网、没有 API 费用。缺点是吃硬件——跑 UI-TARS-1.5-7B 至少需要一块不错的 GPU。

### 远程模式

v0.2.0 引入的功能，可以远程控制另一台电脑或浏览器。不需要在那台机器上做额外配置，点击就能连过去操作。这对远程协助和自动化测试场景很有用。

## 踩过的坑

1. **GPU 需求不低**——本地跑 UI-TARS-1.5-7B 需要至少 8GB 显存的 GPU，mac 上要装 MPS 支持；如果硬件不够，远程 API 是更好的选择
2. **模型选择影响精度**——7B 参数够用但复杂界面会出错，更大的模型（如 1.5/1.6 系列）精度更高但更慢，需要根据场景权衡
3. **OCR 辅助很重要**——纯视觉定位在某些文字密集的界面上可能偏差，开启 `ocrPrompts` 能让模型读文字内容，提升定位准确率
4. **Agent 循环可能死循环**——如果任务描述太模糊，Agent 可能反复截图反复尝试不前进，需要设置最大步数上限
5. **MCP Server 启动慢**——第一次启动 MCP Server 可能需要下载依赖，冷启动延迟几秒到几十秒不等

## 适用 vs 不适用场景

**适用**：

- 需要自动化操作没有 API 的桌面软件
- 跨平台的 GUI 自动化测试
- 帮非技术人员完成"点点点"的重复操作
- 浏览器自动化（结合混合策略：GUI + DOM）

**不适用**：

- 高性能批处理——AI 推理有延迟，不适合每秒上千次的操作
- 对确定性要求极高的场景——AI 可能偶尔犯错，关键操作需要人工确认
- 纯后端服务——没有图形界面就不需要 GUI Agent

## 历史时间线

- **2025-01**：发布 UI-TARS 论文（arXiv:2501.12326），提出"用原生 Agent 做 GUI 交互"的思路
- **2025-02**：推出 UI TARS SDK，跨平台工具包让其他人能基于它构建
- **2025-04**：UI-TARS Desktop v0.1.0，支持 UI-TARS-1.5 模型，Agent UI 重设计
- **2025-06**：发布 Agent TARS Beta，CLI + Web UI，引入 MCP 集成
- **2025-06**：UI-TARS Desktop v0.2.0，增加远程电脑/浏览器操作
- **2025-11**：Agent TARS CLI v0.3.0，流式输出、耗时统计、Event Stream 可视化

## 学到什么

1. **GUI 自动化的范式正在从"找元素"转向"看截图"**——UI-TARS 证明 VLM 可以直接理解界面，不再依赖 DOM 或 Accessibility Tree
2. **Agent 不是单线程脚本**——感知-决策-执行的循环让 Agent 能处理"不知道下一步是什么"的不确定场景
3. **MCP 是 Agent 能力的扩展器**——光会点点点不够，能调工具才是真 Agent
4. **开源 VLM 在垂直领域已经很强**——UI-TARS 在 GUI 理解这个细分任务上，效果已经能和闭源方案竞争

## 延伸阅读

- 项目主页：[bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop)
- 论文：[UI-TARS: Pioneering Automated GUI Interaction with Native Agents](https://arxiv.org/abs/2501.12326)
- 模型下载：[Hugging Face — UI-TARS-1.5-7B](https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B)
- Agent TARS 官网：[agent-tars.com](https://agent-tars.com)
- Midscene：同团队的浏览器端 GUI Agent（[web-infra-dev/midscene](https://github.com/web-infra-dev/midscene)）
- [Quick Start 文档](https://github.com/bytedance/UI-TARS-desktop/blob/main/docs/quick-start.md)

## 关联

- [[midscene]] —— 浏览器端的 GUI Agent，UI-TARS 团队出品
- [[crewai]] —— 多 Agent 编排框架，可以和 UI-TARS 结合做多步骤自动化
- [[dify]] —— AI 应用开发平台，也可以接入 GUI Agent 能力

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[midscene]] —— Midscene — 浏览器中的 GUI Agent，视觉定位 + DOM 混合策略
