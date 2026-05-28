---
title: 项目全景索引
description: 20 个项目按 type / Season / 主题 / 状态 多维索引——防止队列扩到 100 时检索困难
sidebar:
  order: 5
  label: 项目全景索引
---

> 这是 [项目推荐队列](/study/queue/) 的**正交补充**。
> 队列按 Season 主题展开（叙事性），这里按 v1.1 type / domain / status 多维分类（检索性）。
> 100 个时仍能快速定位。

## 总览

| 维度 | 分布 |
|---|---|
| 总数（已写） | 20（Season 1-5 各 4） |
| 总数（计划） | + Season 6 5 个 = 25 / 长期目标 100 |
| v1.1 Type 分布 | 工具库 9 / 编译器运行时 4 / 大型应用 3 / 框架SDK 3 / 测试验证 1 |
| 状态分布 | ✅ 状元 2 / ⏳ 重构中 1 / ⬜ 待重构 17 |

## 主表（按 v1.1 type + 同 type 内按字母排序）

状态：✅ 状元篇（v1.1 合格）/ ⏳ 重构中 / ⬜ 待重构（v1 默认）/ 🆕 待写

### A · 大型应用（user-facing product）

| 项目 | 域 | Season | 状态 |
|---|---|---|---|
| [claude-code](/study/projects/claude-code/) | AI agent CLI | 4 | ⬜ |
| [continue](/study/projects/continue/) | AI code review + IDE | 4 | ✅ |
| [excalidraw](/study/projects/excalidraw/) | canvas + 协同 SaaS | 5 | ✅ |
| 🆕 plane | 项目管理 SaaS（Season 6） | 6 | 🆕 计划 |

### B · 工具库（small-surface API library）

| 项目 | 域 | Season | 状态 |
|---|---|---|---|
| [shadcn-ui](/study/projects/shadcn-ui/) | 组件代码分发 | 1 | ⬜ |
| [swr](/study/projects/swr/) | 服务端状态 hook | 1 | ⬜ |
| [tanstack-query](/study/projects/tanstack-query/) | 服务端状态 | 1 | ⬜ |
| [zustand](/study/projects/zustand/) | 状态管理 | 1 | ⬜ |
| [tanstack-router](/study/projects/tanstack-router/) | 类型路由 | 2 | ⬜ |
| [xstate](/study/projects/xstate/) | 状态机 | 2 | ⬜ |
| [zod](/study/projects/zod/) | schema 验证 | 2 | ⬜ |
| [vercel-ai](/study/projects/vercel-ai/) | LLM 客户端 | 4 | ⬜ |
| [effect](/study/projects/effect/) | 函数式错误 + 资源 | 5 | ⬜ |
| 🆕 radix-ui/primitives | 无样式组件原语（Season 6） | 6 | 🆕 计划 |

### C · 编译器/运行时（pipeline-based）

| 项目 | 域 | Season | 状态 |
|---|---|---|---|
| [biome](/study/projects/biome/) | Rust lint + format | 3 | ⏳ |
| [bun](/study/projects/bun/) | JS runtime + bundler | 3 | ⬜ |
| [esbuild](/study/projects/esbuild/) | bundler | 3 | ⬜ |
| [vite](/study/projects/vite/) | dev + build | 3 | ⬜ |
| 🆕 rolldown / oxc | Rust 重写工具链（Season 7+） | 7+ | 🆕 计划 |

### D · 框架/SDK（abstraction + extension）

| 项目 | 域 | Season | 状态 |
|---|---|---|---|
| [hono](/study/projects/hono/) | edge backend | 5 | ⬜ |
| [mcp-ts-sdk](/study/projects/mcp-ts-sdk/) | AI 协议 SDK | 4 | ⬜ |
| [trpc](/study/projects/trpc/) | typed RPC | 2 | ⬜ |
| 🆕 drizzle-orm | SQL-first ORM（Season 6） | 6 | 🆕 计划 |
| 🆕 inngest | durable workflow（Season 6） | 6 | 🆕 计划 |

### E · 测试/验证工具

| 项目 | 域 | Season | 状态 |
|---|---|---|---|
| [playwright](/study/projects/playwright/) | 浏览器自动化 | 5 | ⬜ |
| 🆕 browser-use | AI agent 浏览器（Season 6） | 6 | 🆕 计划 |

## 视图 1：按 Season（已有 20）

- **Season 1 · 状态与心智模型**：shadcn-ui, tanstack-query, zustand, swr
- **Season 2 · 类型当设计工具**：zod, xstate, tanstack-router, trpc
- **Season 3 · 构建与运行时下钻**：vite, esbuild, bun, biome
- **Season 4 · AI 协作（元学习）**：claude-code, continue, vercel-ai, mcp-ts-sdk
- **Season 5 · 系统编辑 + 验证**：excalidraw, hono, playwright, effect

## 视图 2：按主题域

### 状态管理（4）
zustand / swr / tanstack-query / xstate

### 类型系统 + 验证（3）
zod / tanstack-router / trpc

### 组件 + UI（2）
shadcn-ui / excalidraw

### 构建工具链（4）
vite / esbuild / bun / biome

### AI 工程（4）
claude-code / continue / vercel-ai / mcp-ts-sdk

### 后端 / 边缘（2）
hono / effect

### 自动化 / 测试（1）
playwright

## 视图 3：按状态

### ✅ 状元篇（2 / 20，10%）
- [continue](/study/projects/continue/) — 大型应用 状元（596 行）
- [excalidraw](/study/projects/excalidraw/) — 大型应用 状元（737 行 + 双流图）

### ⏳ 重构中（1 / 20，5%）
- biome（编译器/运行时 v1.1 分支 C，进行中）

### ⬜ 待重构（17 / 20，85%）
按薄弱度排序：bun → claude-code → vite → vercel-ai → shadcn-ui → esbuild → playwright → hono → tanstack-query → mcp-ts-sdk → swr → effect → zustand → trpc → tanstack-router → zod → xstate

### 🆕 待写（80 个规划中）
完整 roadmap 见 [STATUS-PROJECTS.md](https://github.com/estelledc/study/blob/main/STATUS-PROJECTS.md) 的「后续 Season」段。Season 6-25 共 20 季。

## 路径建议

### 想理解前端状态管理（2024 收敛）
按学派对照：zustand（极简）↔ tanstack-query（服务端独立物种）↔ swr（同问题另一答案）→ xstate（升维到状态机）

### 想理解 TS 类型系统作为 UX 工具
zod（schema=类型）→ trpc（函数即 API）→ tanstack-router（URL→组件类型链路）

### 想入门构建工具链
esbuild（一个人写的工程美学）→ vite（dev/build 不对称）→ bun（all-in-one 路线）→ biome（统一 linter+formatter+sorter）

### 想理解 AI 编码工具家族
claude-code（产品形态）→ continue（CI checks 路线）→ vercel-ai（API 层）→ mcp-ts-sdk（协议层）

### 想看大型协作 SaaS 怎么活
excalidraw（canvas + 协同 + 撤销 + 持久 四轨同核） → plane (Season 6 待写) → cal.com (Season 7 备选)
