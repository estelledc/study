---
title: 推荐队列
description: 围绕"未来工程师"7 条信念精选的 20 个项目——按季度展开
sidebar:
  order: 2
---

> **20 不是 100**。100 是凑数，凑数学不到判断力。每个项目都满足
> [立场宣言](/study/about/) 里的 5 条挑选标准，并且能展开**横向对比**——
> "为什么是它而不是它的同类"才是这个站点的核心产出。

## 进行中

**vitejs/vite** — Season 3 第二篇：dev/build 不对称的现代答案。

---

## 五个季度（约 8-10 个月慢笔记）

### Season 1 · 状态与心智模型（3 / 4 完成）

| # | 项目 | 关键判断 |
|---|------|---------|
| 1 | [shadcn/ui](/study/projects/shadcn-ui/) ✅ | 不是组件库，是代码分发协议 |
| 2 | [TanStack Query](/study/projects/tanstack-query/) ✅ | 服务端状态是独立物种，不是 Redux 的子集 |
| 3 | [zustand](/study/projects/zustand/) ✅ | 101 行核心 + 反 Provider 派的极简心智 |
| 4 | [vercel/swr](/study/projects/swr/) ✅ | 同问题的另一种回答：全局事件广播 vs Query Observer |

**这一季回答的问题**：状态管理这件事，前端社区在 2024-2026 收敛到了什么共识？哪些"看起来必须"的复杂度其实可以删掉？

---

### Season 2 · 类型当设计工具（验证 + 判断力）

| # | 项目 | 关键判断 |
|---|------|---------|
| 5 | [colinhacks/zod](/study/projects/zod/) ✅ | schema-first：编译期类型 + 运行时校验同源 |
| 6 | [statelyai/xstate](/study/projects/xstate/) ✅ | 把"看起来简单的状态"画成图——很多 bug 是状态机没画 |
| 7 | [TanStack/router](/study/projects/tanstack-router/) ✅ | 类型系统当 UX 工具：路由、loader、search params 全都类型推断 |
| 8 | [trpc/trpc](/study/projects/trpc/) ✅ | 协议消失：函数即 API，类型从 server 流到 client |

**这一季回答的问题**：类型不只是防御工具，是**设计工具**——不是写完代码再加类型，而是通过类型先把约束讲清楚。

---

### Season 3 · 下钻：构建与运行时（抽象下钻）

| # | 项目 | 关键判断 |
|---|------|---------|
| 9 | [evanw/esbuild](/study/projects/esbuild/) ✅ | 为什么这么快：一个人写的 Go 工程美学 |
| 10 | vitejs/vite | dev / build 不对称——现代构建工具的胜出范式 |
| 11 | oven-sh/bun | 全栈运行时的另一条路：性能优先 vs 兼容优先 |
| 12 | biomejs/biome | 一个工具替代 ESLint + Prettier 的勇气和判断力 |

**这一季回答的问题**：你天天用的 `npm run dev` 背后到底在做什么？为什么 esbuild 比 webpack 快两个数量级？AI 时代的工程师如何下钻到工具链底层？

---

### Season 4 · AI 协作（元学习）

| # | 项目 | 关键判断 |
|---|------|---------|
| 13 | anthropics/claude-code | 你天天用的工具自己怎么写的——元学习 |
| 14 | modelcontextprotocol/typescript-sdk | MCP 协议设计：让 AI 调用外部世界的最小契约 |
| 15 | vercel/ai | Stream / structured / multimodal 的产品化范式 |
| 16 | continuedev/continue | IDE 内 AI 助手的另一种实现路径 |

**这一季回答的问题**：和 AI 协作不是"按一个按钮"，是一套**新的协议、状态机、产品形态**。当代码生成变便宜，**编辑、审阅、整合**的能力反而稀缺。

---

### Season 5 · 系统编辑 + 验证（真实产品味道）

| # | 项目 | 关键判断 |
|---|------|---------|
| 17 | excalidraw/excalidraw | canvas + 协同的最小心脏，怎么把"画图"做成产品 |
| 18 | honojs/hono | 极简边缘后端：API 设计取舍如何影响开发体验 |
| 19 | microsoft/playwright | 浏览器自动化的工程艺术：跨进程、跨语言的契约设计 |
| 20 | Effect-TS/effect | 函数式错误 + 资源管理——TS 生态的"另一个未来" |

**这一季回答的问题**：当代码生成变便宜，"如何确信这段代码真的对"和"如何把代码组织得能读"会变成区分线。

---

## 已消化

- [shadcn/ui](/study/projects/shadcn-ui/)（2026-05-27）
- [TanStack Query](/study/projects/tanstack-query/)（2026-05-27）
- [zustand](/study/projects/zustand/)（2026-05-27）
- [vercel/swr](/study/projects/swr/)（2026-05-27）— Season 1 完成
- [colinhacks/zod](/study/projects/zod/)（2026-05-27）— Season 2 开篇
- [statelyai/xstate](/study/projects/xstate/)（2026-05-27）
- [TanStack/router](/study/projects/tanstack-router/)（2026-05-27）
- [trpc/trpc](/study/projects/trpc/)（2026-05-27）— Season 2 完成
- [evanw/esbuild](/study/projects/esbuild/)（2026-05-27）— S3 开篇

---

## 关于"为什么是这 20 个，不是别的"

这个清单的偏见：

- **不收"功能强大但读不出取舍"的项目**——比如 Material UI 的源码读到累，但学不到判断力
- **不收同类竞品并列**——比如 Mantine 是 shadcn 的同类，已经收了 shadcn，Mantine 进不来
- **不收维护停滞或商业模式扭曲的项目**——比如 Redux 在原帖（TanStack Query 笔记）里已经做过对照，单独写笔记意义不大
- **优先收"心脏代码能在 1-2 个文件里读完"的项目**——zustand vanilla.ts (101 行) 是范例
- **优先收"展示了清晰判断"的项目**——biome 拿掉 ESLint + Prettier 是判断力，不是工具

如果你觉得某个项目应该进来或出去，可以提"X 应该进，因为 Y"——
反例能改我的判断。
