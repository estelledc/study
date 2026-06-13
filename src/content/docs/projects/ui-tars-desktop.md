---
title: UI-TARS Desktop — 让 AI 像人一样操作电脑
来源: https://github.com/bytedance/UI-TARS-desktop
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# UI-TARS Desktop — 让 AI 像人一样操作电脑

## 一、从"教机器人做家务"说起

想象一下，你有一个住在电脑里的机器人助手。你跟它说："帮我把 VS Code 的自动保存打开，延迟设为 500 毫秒。"

传统的自动化脚本（比如录制回放）就像是一个只会死记硬背的人——你录一遍动作，它就严格按顺序执行一遍。如果你换了台分辨率不同的电脑，或者界面稍微变了，它就不会了。

UI-TARS Desktop 的机器人助手不一样。它能**看到**你的屏幕——就像你坐在旁边看着一样。它先截一张屏幕截图，用眼睛"看懂"界面上有哪些按钮、文字在哪里，然后决定下一步点哪里、敲什么键盘。这背后的"眼睛和大脑"就是一个叫 **UI-TARS** 的视觉语言模型（Vision-Language Model）。

简单说：

- **眼睛**：截取当前屏幕截图
- **大脑**：视觉语言模型分析截图，理解界面上的元素
- **手**：模拟鼠标点击、键盘输入，执行操作

## 二、核心概念

### 2.1 GUI Agent（图形用户界面智能体）

GUI Agent 是一种能"看屏幕、做操作"的 AI 程序。它的工作流程是一个不断循环的过程：

```
截图 → 模型分析 → 决定动作 → 执行动作 → 再截图 → ……
```

每一步都在问自己："我现在看到的界面告诉我下一步该做什么？"直到任务完成或达到最大循环次数为止。

### 2.2 Operator（操作器）

Operator 就是机器人的"手"。它负责两件事：

1. **截图**（screenshot）：把当前屏幕变成一张图片
2. **执行**（execute）：根据模型的指令去点鼠标、敲键盘、滚动页面

项目内置了几种 Operator：

| Operator | 作用 |
|---|---|
| NutJSOperator | 控制本地电脑的鼠标和键盘 |
| WebOperator | 控制浏览器（通过 DOM 或视觉） |
| RemoteComputerOperator | 远程控制另一台电脑 |
| RemoteBrowserOperator | 远程操控浏览器 |

你可以把它理解为：Operator 是"手脚"，模型是"大脑"，两者通过一个标准接口配合。

### 2.3 视觉语言模型（VLM）

UI-TARS 模型接收三样东西：

1. **用户的指令**（比如"帮我订酒店"）
2. **当前屏幕截图**（最多最近 5 张）
3. **可用的动作列表**（Action Spaces，告诉模型它能做什么操作）

然后模型输出一句话，比如：

```
click(start_box='(27,496)')
```

意思是"在坐标 (27, 496) 的位置点击"。

### 2.4 Agent TARS vs UI-TARS Desktop

这个项目其实包含两个产品：

- **Agent TARS**：更通用的 AI Agent 框架，支持命令行（CLI）、Web UI，可以结合 MCP 工具链做复杂任务（订票、画图等）
- **UI-TARS Desktop**：专注于桌面 GUI 操作的独立应用程序，开箱即用

## 三、代码示例

### 示例 1：用 SDK 创建一个桌面 GUI Agent

这是最基础的用法。安装 `@ui-tars/sdk` 后，只需十几行代码就能让 AI 操作你的电脑：

```typescript
import { GUIAgent } from '@ui-tars/sdk';
import { NutJSOperator } from '@ui-tars/operator-nut-js';

const guiAgent = new GUIAgent({
  model: {
    baseURL: 'https://your-api-endpoint/v1/',
    apiKey: 'your-api-key',
    model: 'UI-TARS-1.5-7B',
  },
  operator: new NutJSOperator(),
  onData: ({ data }) => {
    console.log(data);
  },
  onError: ({ data, error }) => {
    console.error(error, data);
  },
});

await guiAgent.run('send "hello world" to x.com');
```

逐行看：

1. `new GUIAgent(...)` 创建智能体实例，传入模型配置和操作器
2. `model` 对象指定模型服务的地址、密钥和模型名（兼容 OpenAI API 格式）
3. `NutJSOperator()` 是默认操作器，负责截图和控制鼠标键盘
4. `onData` 回调在 Agent 运行过程中不断收到数据流（每条消息可能是人类指令、模型回复或截图）
5. `onError` 回调处理错误
6. `guiAgent.run()` 传入自然语言指令，Agent 进入循环执行

### 示例 2：自定义操作器

如果你想让 Agent 控制别的东西（比如手机模拟器），可以实现自己的 Operator：

```typescript
import {
  Operator,
  type ScreenshotOutput,
  type ExecuteParams,
  type ExecuteOutput,
  StatusEnum,
} from '@ui-tars/sdk/core';

export class MyCustomOperator extends Operator {
  static MANUAL = {
    ACTION_SPACES: [
      'click(start_box="") # 点击指定坐标的元素',
      'type(content="") # 在当前输入框中输入内容',
      'scroll(direction="") # 向指定方向滚动',
      'finished() # 完成任务',
    ],
  };

  public async screenshot(): Promise<ScreenshotOutput> {
    // 这里实现你自己的截图逻辑
    const base64 = 'base64-encoded-image-data';
    return {
      base64,
      scaleFactor: 1,
    };
  }

  public async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { parsedPrediction, screenWidth, screenHeight } = params;

    if (parsedPrediction?.action_type === 'finished') {
      return { status: StatusEnum.END };
    }

    // 根据 parsedPrediction.action_type 执行对应操作
    // 例如 click 就解析 action_inputs.start_coords 拿到坐标
    return { success: true };
  }
}
```

然后把自定义操作器传给 Agent：

```typescript
const guiAgent = new GUIAgent({
  model: { baseURL, apiKey, model },
  operator: new MyCustomOperator(),
  systemPrompt: `
    你是一个桌面助手。
    ${MyCustomOperator.MANUAL.ACTION_SPACES.join('\n')}
  `,
});
```

关键点：

- `screenshot()` 返回 Base64 编码的图片 + 缩放比例
- `execute()` 接收模型解析后的结构化预测结果，包含 `action_type`（动作类型）、`action_inputs`（参数）、`thought`（模型的推理过程）
- `MANUAL.ACTION_SPACES` 定义了模型能执行的"动作词汇表"，模型只能从这个列表中选择操作

### 示例 3：配合规划模型处理复杂任务

对于复杂任务（比如"帮我订一张从北京到上海的票"），可以先用推理模型做任务分解，再把每个步骤交给 Agent：

```typescript
const guiAgent = new GUIAgent({
  model: { baseURL, apiKey, model },
  operator: new NutJSOperator(),
});

// 先用推理模型规划步骤
const planningList = await reasoningModel.invoke({
  conversations: [
    { role: 'user', content: 'buy a ticket from beijing to shanghai' },
  ],
});

// 得到的是拆解后的步骤列表：
// ['open chrome', 'open trip.com', 'click "search" button', ...]

for (const step of planningList) {
  await guiAgent.run(step);
}
```

这就是"先想清楚再动手"的思路——规划模型负责制定计划，GUI Agent 负责一步步执行。

## 四、Agent 的状态流转

整个 Agent 的运行过程可以用一个状态机来描述：

```
[初始] → INIT → RUNNING → RUNNING → ... → END
                      ↓          ↓
                 (执行动作)   (任务完成)
                      ↓
                RUNNING → MAX_LOOP → [结束]
                   (达到最大循环次数)
```

- **INIT**：等待用户下达指令
- **RUNNING**：正在执行操作，不断截图-分析-执行
- **END**：任务完成（模型返回 `finished()` 或 Operator 主动结束）
- **MAX_LOOP**：达到最大循环次数（默认 25 次），防止无限循环

你也可以随时通过 AbortController 中断运行：

```typescript
const abortController = new AbortController();

const guiAgent = new GUIAgent({
  model: { baseURL, apiKey, model },
  operator: new NutJSOperator(),
  signal: abortController.signal,
});

process.on('SIGINT', () => {
  abortController.abort();
});
```

按 Ctrl+C 即可停止。

## 五、快速上手

### 方法一：下载桌面应用（最简单）

Mac 上通过 Homebrew 一键安装：

```bash
brew install --cask ui-tars
```

安装后需要在系统设置中授予两个权限：

1. **辅助功能**（Accessibility）— 允许控制鼠标键盘
2. **屏幕录制**（Screen Recording）— 允许截取屏幕

然后在应用设置里配置模型服务地址和 API Key 就可以开始用了。

### 方法二：通过 CLI 试用

```bash
npx @ui-tars/cli start
```

输入模型配置后，直接在终端输入指令，Agent 就会开始操作你的电脑：

```
◆  Input your instruction
│  _ Open Chrome
└
```

### 支持的模型提供商

| 提供商 | 模型 | 说明 |
|---|---|---|
| Hugging Face | UI-TARS-1.5-7B | 开源模型，自行部署 |
| 火山引擎 | Doubao-1.5-UI-TARS | 在线 API，开箱即用 |
| OpenAI 兼容接口 | 任意兼容模型 | 需要适配 |

## 六、总结

UI-TARS Desktop 的核心思想很直观：**让 AI 通过"看屏幕"来理解界面，通过"模拟操作"来完成任务**。它不需要你写自动化脚本，也不需要你了解程序的内部结构——只要会用自然语言描述任务就行。

这个项目的架构可以概括为三层：

- **模型层**：视觉语言模型，负责"看懂"屏幕并做出决策
- **Agent 层**：GUIAgent，负责组织截图-分析-执行的循环
- **操作层**：Operator，负责截图和执行具体动作

这种分层设计的好处是每一层都可以替换——你可以换更好的模型、做更复杂的规划、或者让 Operator 控制完全不同的设备。

## 参考资源

- 项目主页：https://github.com/bytedance/UI-TARS-desktop
- 论文：https://arxiv.org/abs/2501.12326
- SDK 文档：项目 docs/sdk.md
- 快速开始：项目 docs/quick-start.md
- HuggingFace 模型：https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B
