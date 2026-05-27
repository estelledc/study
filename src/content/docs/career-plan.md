---
title: 培养计划
description: 一个"AI 时代产品工程师"的 6 个月成长路线
sidebar:
  order: 1
---

> 项目笔记在左边「项目研究笔记」分组；下一个研究目标见[推荐队列](/study/queue/)。

## 1. 目标画像：AI 时代的产品工程师

不是单纯的"前端工程师"或"AI 工程师"，而是：

| 维度 | 期望状态 |
|------|----------|
| 全栈基础 | 前后端都能独立做一个完整功能；遇到新框架能在一周内上手 |
| AI 工具链 | Claude API / Agent 框架是日常工具，不是新鲜事 |
| 产品判断力 | 看穿一行需求背后的真实痛点；会拒绝伪需求 |
| 工程品味 | 代码可维护、架构有 trade-off 意识、愿意删代码 |
| 自学能力 | 看陌生代码库不发怵；能从大型 OSS 中拎出可迁移模式 |

不追的：

- 不为了用 React 而用 React，不为了上 LangGraph 而上 LangGraph
- 不背面试题（结构化算法基本功是基础但不是工程）
- 不卷工时（输出质量 > 时长）

## 2. 当前阶段评估

强项：

- AI Agent 基础设施：MCP、langgraph、parallel agents、Claude Code 协作模式
- 公开项目沉淀：CCMeter（Rust）、open-design（TS）、ios-simulator-mcp、langchain 教程等
- 工程模式：常见 React 模式、permission system、hook、type guards

短板：

- 前端纵深：做产品时大量经验未沉淀，缺对组件库设计哲学的内化
- 后端 / 数据库：几乎空白，没系统接触过现代 ORM、SQL 设计、API gateway
- 全栈一体化：没系统看过端到端代码组织
- 真实产品工程：知道很多 agent / MCP 概念，但"如何从 0 到 1 做一个能跑住的产品"缺
- 系统设计：缓存、队列、可观测性、限流、降级几乎没碰
- 验证可靠性：测试设计、property-based testing、对抗性思维属于盲区

→ 主线是补全栈 + 产品工程，AI 维持现有水平即可（已经够强）。

## 3. 6 个月路线（Phase 1-4）

每个 phase 选若干代表性 GitHub 项目，逐个研究消化。
**关键原则**：每个项目都要能立刻迁移到当前工作，不学纯理论。

### Phase 1：前端工程化补齐

让"写一个真实产品级 React 项目"变成肌肉记忆。

| 项目 | 学什么 |
|------|--------|
| shadcn-ui/ui | "代码分发"哲学 + Radix + Tailwind + variant 模式 |
| TanStack/query | 数据获取的心智模型（缓存、失效、乐观更新） |
| pmndrs/zustand | 极简状态管理（对比 Redux 的复杂度） |
| vercel/ai-chatbot | AI 应用的前端范式（流式、token 渲染） |
| radix-ui/primitives | 无样式组件原语 + a11y |
| TanStack/table | headless 表格 |
| framer/motion | 声明式动画 |

### Phase 2：全栈一体化

打通"接口在哪 / 数据从哪来 / 谁来部署"。

| 项目 | 学什么 |
|------|--------|
| t3-oss/create-t3-app | 端到端类型安全（tRPC + Prisma + Next.js） |
| prisma/prisma | 现代 ORM 心智 + 数据建模 |
| honojs/hono | 极简后端框架（对比 Express 的负担） |
| trpc/trpc | RPC over types |
| calcom/cal.com | 真实复杂产品的代码组织 |

### Phase 3：AI Agent 工程化

在已有基础上深入 production patterns。

| 项目 | 学什么 |
|------|--------|
| anthropics/anthropic-cookbook | Claude API 权威范式（缓存、tool use、citations） |
| anthropics/claude-code | 元学习：你天天用的工具是怎么写的 |
| mastra-ai/mastra | TS 原生 Agent 框架的设计 trade-off |
| langchain-ai/langgraph（深入） | production memory + 多 agent 编排 |
| e2b-dev/e2b | 沙箱执行模式 |

### Phase 4：产品工程 taste

看大型项目怎么活下来。

| 项目 | 学什么 |
|------|--------|
| makeplane/plane | 复杂应用的模块划分 |
| supabase/supabase | 大型开源后端架构 |
| excalidraw/excalidraw | canvas + 协同编辑工程 |
| immich-app/immich | Google Photos 替代，全栈范例 |

## 4. 进度表

| 日期 | 项目 | 状态 | 笔记 |
|------|------|------|------|
| 2026-05-27 | shadcn-ui/ui | 已消化 | [shadcn-ui](/study/projects/shadcn-ui/) |
| 2026-05-27 | TanStack/query | 已消化 | [tanstack-query](/study/projects/tanstack-query/) |
