---
title: CopilotKit — 前端 Agent UI 组件库
来源: https://github.com/CopilotKit/CopilotKit
日期: 2026-06-13
分类_原始: AI / Agent
分类: 机器学习
子分类: ai-agent-frameworks
provenance: pipeline-v3
---

# CopilotKit — 前端 Agent UI 组件库

## 从一杯奶茶说起

想象你在一家奶茶店点单。传统的方式是你自己看着菜单，一项一项选：要什么茶底、多少糖、加什么料。整个过程是你在"控制"每一步。

现在想象另一种方式：你告诉店员"我想喝杯甜的、冰的奶茶"，店员（就像一个 AI Agent）会帮你做所有决定，甚至在你还没说完的时候就开始操作——把配料准备好、在屏幕上显示推荐、等你确认就下单。

CopilotKit 做的事情就是把"店员"这个能力，直接嵌到你的网页应用里。你不需要自己写聊天界面、不需要处理 AI 调用的复杂流程、不需要管理 AI 和页面数据之间的通信。它提供了一套 React 组件和钩子，让 AI Agent 变成你应用里的一个"常驻店员"。

## 核心概念

CopilotKit 的架构可以分为三层，我们从上到下理解：

**第一层：UI 组件（店员的面容）**

CopilotKit 提供了三种现成的聊天界面组件，你直接拿来用：

- `CopilotSidebar` — 聊天面板像侧边栏一样展开收起
- `CopilotPopup` — 一个悬浮的小窗口，随时可以弹出
- `CopilotChat` — 嵌在页面中的任意位置的聊天组件

**第二层：状态桥接（店员怎么知道你的库存）**

这是 CopilotKit 最有价值的部分。你的应用有各种状态——用户数据、购物车、任务列表——AI 默认是看不到的。CopilotKit 通过 `useCopilotReadable` 这个钩子，把你的应用状态"告诉" AI，让 AI 的回复变得有上下文。

**第三层：运行时（店员的后台系统）**

`CopilotRuntime` 是运行在服务器端的中枢。它负责接收前端的聊天消息、调用 AI 模型、执行工具函数，然后把结果返回给前端。你可以接入 OpenAI、Anthropic，也可以接入自己训练的 Agent。

## 整体架构图景

```
用户 → 你的网页
           │
    ┌──────┴──────┐
    │  UI 层       │  CopilotSidebar / Popup / Chat
    │  (React)     │  用户看到和交互的聊天界面
    └──────┬──────┘
           │ useCopilotReadable 钩子
    ┌──────┴──────┐
    │  前端桥接    │  把组件状态暴露给 AI
    │  (React)     │
    └──────┬──────┘
           │ HTTP POST
    ┌──────┴──────┐
    │  运行时      │  CopilotRuntime — 路由请求、调用模型
    │  (Server)    │  执行工具、管理对话历史
    └──────┬──────┘
           │ API 调用
    ┌──────┴──────┐
    │  AI 模型     │  GPT / Claude / 自定义 Agent
    └─────────────┘
```

## 代码示例一：三分钟搭建聊天侧边栏

这是最基础的用法。在你的 Next.js 应用里，只需要三个步骤：

**第一步：配置后端 API 路由**

在 `app/api/copilotkit/route.ts` 创建一个 API 端点：

```tsx
import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { NextRequest } from "next/server";

const builtInAgent = new BuiltInAgent({
  model: "openai:gpt-5.4-mini",
});

const runtime = new CopilotRuntime({
  agents: { default: builtInAgent },
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
```

这段代码做了三件事：创建了一个使用 GPT 模型的内置 Agent、把它们注册到运行时、然后导出一个处理 HTTP 请求的端点。

**第二步：在前端包裹应用并渲染侧边栏**

```tsx
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";

export default function Page() {
  return (
    <CopilotKit>
      <div style={{ display: "flex" }}>
        <CopilotSidebar />
        <main style={{ flex: 1 }}>
          {/* 你的应用内容 */}
        </main>
      </div>
    </CopilotKit>
  );
}
```

`CopilotKit` 是这个库的根组件，它创建一个 React Context，让整个应用都能访问 CopilotKit 的状态。`CopilotSidebar` 就是一个完整的聊天侧边栏，自带消息列表、输入框、发送按钮。

## 代码示例二：让 AI 看到你的应用状态

光有聊天窗口还不够。如果你做了一个任务管理应用，AI 怎么才能知道当前有哪些任务？答案是 `useCopilotReadable` 钩子。

这个钩子的工作原理很简单：你在某个 React 组件里调用它，传入一段描述和一组数据，CopilotKit 就会把这些数据注入到 AI 的"上下文窗口"里。AI 在回复时就能看到这些数据，从而给出更有针对性的回答。

```tsx
import { useCopilotReadable } from "@copilotkit/react-core/v2";
import { useState } from "react";

export const TasksProvider = ({ children }: { children: React.ReactNode }) => {
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, title: "学习 React", completed: false },
    { id: 2, title: "写笔记", completed: true },
  ]);

  // 把任务列表的状态暴露给 AI
  useCopilotReadable({
    description: "当前的任务列表，包含任务标题和完成状态",
    value: tasks,
  });

  return (
    <div>
      {children}
    </div>
  );
};
```

这样当用户在侧边栏里问"我还有多少任务没完成？"时，AI 就能看到 `tasks` 数组，数一下 `completed: false` 的数量，然后回答"你还有 1 个任务没完成"。

`useCopilotReadable` 还可以支持层级关系。比如你有一个员工列表，每个员工有姓名、部门、绩效等字段，你可以这样组织：

```tsx
function EmployeeCard({ employee }) {
  const employeeContextId = useCopilotReadable({
    description: "员工姓名",
    value: employee.name,
  });

  useCopilotReadable({
    description: "员工的部门和职位",
    value: employee.department,
    parentId: employeeContextId,
  });

  useCopilotReadable({
    description: "员工的绩效评分",
    value: employee.performanceScore,
    parentId: employeeContextId,
  });

  return <div>{employee.name}</div>;
}
```

通过 `parentId`，AI 理解的上下文结构会和你的组件树一致，就像在 AI 面前摆了一个缩略图。

## 进阶：生成式 UI（Agent 自己画界面）

CopilotKit 还有一个很酷的功能叫"Generative UI"。传统方式下，AI 只能回复文字。但在生成式 UI 模式下，AI 可以在对话中"画"出组件——比如一个天气卡片、一个折线图、一个交互式的数据表格。

实现方式是 `useFrontendTool` 钩子：

```tsx
import { useFrontendTool, ToolCallStatus } from "@copilotkit/react-core/v2";

function WeatherWidget() {
  useFrontendTool({
    name: "getWeather",
    description: "获取指定城市的天气信息",
    parameters: {
      city: { type: "string", description: "城市名称" },
      units: { type: "string", enum: ["celsius", "fahrenheit"], default: "celsius" },
    },
    handler: async ({ city, units }) => {
      const response = await fetch(`/api/weather?city=${city}&units=${units}`);
      const data = await response.json();
      return JSON.stringify(data);
    },
    render: ({ args, status, result }) => {
      if (status === ToolCallStatus.InProgress) {
        return <div>正在查询 {args.city} 的天气...</div>;
      }
      if (status === ToolCallStatus.Complete && result) {
        const data = JSON.parse(result);
        return (
          <div className="p-4 border rounded">
            <h3>{data.city}</h3>
            <p>{data.temperature}° {data.units}</p>
            <p>{data.conditions}</p>
          </div>
        );
      }
      return null;
    },
  });

  return null;
}
```

当用户在聊天中说"北京的天气怎么样"时，AI 会调用 `getWeather` 这个工具，前端收到结果后自动渲染出一个天气卡片。AI 不只是"说"，它还能"展示"。

## 关键要点总结

- CopilotKit = 前端 React 组件库 + 运行时 SDK，让 AI Agent 嵌入 Web 应用变得极简
- 三件套：`CopilotKit`（根组件）→ 聊天 UI 组件（侧边栏/弹窗/内嵌）→ 运行时（后端 API）
- `useCopilotReadable` 是状态桥接的核心钩子，把组件数据注入 AI 上下文
- `useFrontendTool` 让 AI 能直接渲染 React 组件，实现"生成式 UI"
- 它支持 OpenAI、Anthropic 等主流模型，也能接入 LangChain、LlamaIndex 等 Agent 框架

一句话：如果你想在应用里加一个"懂你业务"的 AI 助手，CopilotKit 是目前前端生态里集成成本最低的路径之一。
