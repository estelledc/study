---
title: "iii-hq/iii 服务组合扩展实时观测平台学习笔记"
来源: "https://github.com/iii-hq/iii"
日期: "2026-06-13"
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

# iii-hq/iii 服务组合扩展实时观测平台学习笔记

## 一句话概括

iii 用三个最简单的概念（Worker 工人、Trigger 触发器、Function 函数）把后端服务的所有拼接到一起，并且天生就能看到每一次调用的完整链路。

## 从日常类比开始

想象一个餐厅后厨。

传统做法是：每个厨师（服务）都是独立的，切菜的、煮面的、炒菜的之间靠电话或者纸条沟通。想加一道新菜，你得打电话找别的厨师协调，出了问题不知道是哪一步搞砸的。

iii 的做法是：给后厨装了一个智能调度系统。每个厨师都注册到调度系统上，说我能做什么。系统自动告诉大家谁有什么能力。当客人点了一道新菜，调度系统自动找到合适的厨师去执行，整个过程全程记录，你能看到每一道工序花了多少时间、出了什么错。

关键区别：你不需要写一堆"服务 A 怎么调用服务 B"的代码。你只需要说"这个厨师能做这个活"，系统自动帮你组装。

## 三个核心概念

### 1. Worker（工人）

Worker 就是"能干活的进程"。它可以是 TypeScript 写的一个 API 服务，Python 写的数据处理管道，或者 Rust 写的一个微服务。每个 Worker 启动后，会连接到 iii 引擎，告诉大家"我能做什么"。

### 2. Function（函数）

Function 是"最小干活单元"。比如 `content::classify`（给内容打标签）、`orders::validate`（验证订单）。每个 Function 有稳定的名字，接受输入，执行工作，返回结果。

### 3. Trigger（触发器）

Trigger 是"让函数开始干活的开关"。触发方式可以是：
- 直接调用（有人调用了这个函数）
- HTTP 请求（有人访问了某个 URL）
- 定时任务（到了某个时间自动执行）
- 消息队列（收到了一条消息）
- 状态变化（某个数据变了）
- 流事件（某个数据流来了新数据）

你声明"这个函数在什么情况下运行"，iii 自动处理路由、数据格式转换、消息投递。

## 整体架构

```
┌─────────────────────────────────────────────────┐
│                   iii Engine                     │
│              (Rust 核心运行时)                     │
│  ┌─────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Worker   │  │  Trigger  │  │   Observability │  │
│  │ 管理注册  │→│  路由分发  │→│   链路追踪       │  │
│  └─────────┘  └──────────┘  └────────────────┘  │
└─────────────────────────────────────────────────┘
        ↑                  ↑               ↑
   WebSocket           HTTP API       各种 Trigger
   (端口 49134)       (端口 3111)     (cron/queue/...)
```

Engine 是核心，用 Rust 写的。SDK 用多种语言提供（Node.js、Python、Rust、Go），各自通过 WebSocket 连接到 Engine。Console 是一个可视化的控制台，让你浏览所有 Worker、函数、触发器和实时追踪。

## 代码示例

### 示例 1：Node.js 注册一个函数并绑定 HTTP 触发器

```javascript
import { registerWorker } from 'iii-sdk';

// 连接到 iii 引擎（WebSocket 地址）
const iii = registerWorker('ws://localhost:49134');

// 注册一个函数：内容分类
iii.registerFunction('content::classify', async (input) => {
  // 这里放你的业务逻辑
  const categories = ['tech', 'finance', 'health', 'sports'];
  const score = categories.map(cat => ({
    category: cat,
    confidence: Math.random(),
  }));

  return { categories: score };
});

// 注册一个 HTTP 触发器：当有人访问 /classify 时，
// 自动调用 content::classify 函数
iii.registerTrigger({
  type: 'http',
  function_id: 'content::classify',
  config: {
    api_path: '/classify',
    http_method: 'POST',
  },
});

console.log('Worker 已注册，Engine 会通知其他 Worker');
```

这个过程做了什么：
1. `registerWorker` 创建 SDK 实例并自动连接到 Engine
2. `registerFunction` 注册了一个叫 `content::classify` 的函数
3. `registerTrigger` 把一个 HTTP 路径 `/classify` 绑定到这个函数上
4. 其他连接到 Engine 的 Worker 会自动发现这个新函数

### 示例 2：调用远程函数

```javascript
import { registerWorker, TriggerAction } from 'iii-sdk';

const iii = registerWorker('ws://localhost:49134');

// 方式一：等待结果（同步调用）
async function classifyContent(text) {
  const result = await iii.trigger({
    function_id: 'content::classify',
    payload: { text },
  });
  console.log('分类结果:', result);
  return result;
}

// 方式二：不等待结果（fire-and-forget，发完就走）
iii.trigger({
  function_id: 'content::classify',
  payload: { text: '这是一段测试文本' },
  action: TriggerAction.Void(),
});
```

`TriggerAction.Void()` 的意思是"发完消息就不要等回话了"。适合那些你知道会执行但不在乎结果的场景，比如发送通知、更新计数。

## 为什么这个设计有意思

### 从第一性原理思考

传统微服务的痛点是什么？是"连接成本"。每增加一个服务，就要多一套：API 文档、认证逻辑、重试策略、超时配置、链路追踪。iii 的核心洞察是：这些不是"每个服务自己的事"，而是"系统层面的事"。

如果把后端服务想象成乐高积木，传统做法是每块积木都要自己发明连接件。iii 的做法是：所有积木天生就有一套标准接口，随便拼都能对上。

### 三个优势

1. **组合零集成成本**：新增一个 Worker 只需要 `iii worker add xxx`，不需要写集成代码
2. **天生可观测**：每个函数调用都自动记录追踪，打开 Console 就能看
3. **跨语言互通**：TypeScript 的 Worker 可以直接调用 Python 的 Worker 的函数，Engine 处理协议转换

## 关键端口

| 端口 | 服务 |
|------|------|
| 49134 | WebSocket（Worker 连接用） |
| 3111 | HTTP API |
| 3112 | 流 API |
| 9464 | Prometheus 指标 |

## 快速上手命令

```bash
# 安装
curl -fsSL https://install.iii.dev/iii/main/install.sh | sh

# 初始化项目
iii project init myapp
cd myapp

# 启动引擎
iii

# 打开控制台（浏览器可视化管理界面）
iii console
```

## 学习小结

iii 的核心思想是把后端服务拆解为三个原子概念：谁能干（Worker）、干什么（Function）、什么情况下干（Trigger）。在这个极简模型上，组合、扩展、观测三件事都成了系统的原生能力，而不是后期插件。

对初学者来说，理解 iii 的关键不在于记住多少 API，而在于理解"为什么三个概念就够了"——因为任何分布式系统的本质就是：谁对谁做了什么，以及在什么时候做的。
