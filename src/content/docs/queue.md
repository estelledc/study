---
title: 推荐队列
description: 围绕"AI 时代产品工程师"成长路径的 GitHub 项目推荐清单
sidebar:
  order: 2
---

> **入选标准**：和你当前做的事或目标画像有具体连接（不是"出名所以学"）。
> **顺序**：簇内大致按"上手成本低 → 高 / 与当前工作连接强 → 弱"。
> 排序持续会更新——做着做着发现新连接、当前工作方向变了，都会调整。

## 进行中

无（等待 cron 下次触发）

---

## 待消化（按主题簇排序）

### 簇 1 · 前端基础原子层（14 / 让真实 React 产品成为肌肉记忆）

1. **pmndrs/zustand** — 极简状态管理 · `zustand`
3. **radix-ui/primitives** — 无样式组件原语 + a11y · `radix-primitives`
4. **tailwindlabs/tailwindcss** — utility-first CSS 范式本身 · `tailwindcss`
5. **colinhacks/zod** — schema-first 类型 + 运行时校验 · `zod`
6. **react-hook-form/react-hook-form** — 表单状态最小化 · `react-hook-form`
7. **framer/motion** — 声明式动画 · `framer-motion`
8. **floating-ui/floating-ui** — popover/tooltip 几何引擎 · `floating-ui`
9. **TanStack/table** — headless 表格 · `tanstack-table`
10. **tldraw/tldraw** — canvas + 状态机（设计灵感） · `tldraw`
11. **mantinedev/mantine** — 完整组件库范式（对比 shadcn） · `mantine`
12. **mui/material-ui** — 大厂组件库设计哲学（对比研究） · `mui`
13. **ant-design/ant-design** — 国内生态对照 · `antd`
14. **TanStack/router** — 类型安全路由 · `tanstack-router`
15. **vercel/swr** — TanStack Query 之外的另一种数据获取流派 · `swr`

### 簇 2 · 前端构建 + 工程化（10）

16. **vitejs/vite** — 现代构建工具的胜出范式 · `vite`
17. **evanw/esbuild** — 为什么这么快 · `esbuild`
18. **swc-project/swc** — Rust-based 编译器替代品 · `swc`
19. **vercel/turborepo** — monorepo 构建编排 · `turborepo`
20. **biomejs/biome** — 一个工具替代 ESLint+Prettier · `biome`
21. **eslint/eslint** — 静态检查器架构 · `eslint`
22. **prettier/prettier** — opinionated formatter 设计 · `prettier`
23. **rollup/rollup** — 库打包标杆 · `rollup`
24. **nrwl/nx** — 企业级 monorepo · `nx`
25. **changesets/changesets** — 版本管理 + changelog · `changesets`

### 簇 3 · 全栈 + 后端框架（15 / 补 Java 之外的现代后端）

26. **honojs/hono** — 极简边缘函数后端 · `hono`
27. **t3-oss/create-t3-app** — TS 端到端类型安全栈 · `t3-stack`
28. **trpc/trpc** — RPC over types · `trpc`
29. **prisma/prisma** — 现代 ORM 心智 · `prisma`
30. **drizzle-team/drizzle-orm** — SQL-first ORM 反流派 · `drizzle`
31. **vercel/next.js** — App Router 范式 · `nextjs`
32. **remix-run/react-router** — web 平台对齐流派 · `react-router`
33. **withastro/astro** — content-driven 站点（这站就用这个） · `astro`
34. **nestjs/nest** — Java 程序员最熟悉的 Node 框架 · `nestjs`
35. **expressjs/express** — Node 生态基石（最小依赖看 API 设计） · `express`
36. **fastify/fastify** — 性能向后端框架 · `fastify`
37. **payloadcms/payload** — headless CMS 范式 · `payload`
38. **supabase/supabase** — Firebase 开源替代 · `supabase-core`
39. **pocketbase/pocketbase** — 单二进制 BaaS · `pocketbase`
40. **directus/directus** — 数据库即 API · `directus`

### 簇 4 · 大型真实产品（12 / 看代码组织 taste）

41. **calcom/cal.com** — 复杂日程 SaaS 的代码分层 · `cal-com`
42. **makeplane/plane** — Linear 开源替代，模块划分 · `plane`
43. **shadcn-ui/taxonomy** — Next.js App Router 教科书 · `taxonomy`
44. **excalidraw/excalidraw** — canvas + 协同 · `excalidraw`
45. **immich-app/immich** — Google Photos 替代，全栈范例 · `immich`
46. **AppFlowy-IO/AppFlowy** — Notion 替代 · `appflowy`
47. **logseq/logseq** — 知识管理 + CRDT · `logseq`
48. **mattermost/mattermost** — Slack 替代，Go+TS 双栈 · `mattermost`
49. **nocodb/nocodb** — Airtable 替代 · `nocodb`
50. **ToolJet/ToolJet** — 内部工具平台架构 · `tooljet`
51. **n8n-io/n8n** — workflow 引擎设计 · `n8n`
52. **activepieces/activepieces** — Zapier 替代 · `activepieces`

### 簇 5 · AI Agent + LLM 框架（15 / 你的强项延伸）

53. **anthropics/anthropic-cookbook** — Claude API 权威范式 · `anthropic-cookbook`
54. **anthropics/courses** — Anthropic 官方教程 · `anthropic-courses`
55. **anthropics/claude-code** — 元学习：你天天用的工具怎么写的 · `claude-code-internals`
56. **modelcontextprotocol/servers** — MCP 服务器示例库 · `mcp-servers`
57. **modelcontextprotocol/typescript-sdk** — MCP SDK 设计 · `mcp-ts-sdk`
58. **langchain-ai/langgraph** — production patterns（深入） · `langgraph-prod`
59. **langchain-ai/langchainjs** — JS 生态 LangChain · `langchainjs`
60. **mastra-ai/mastra** — TS 原生 Agent 框架 · `mastra`
61. **vercel/ai** — Vercel AI SDK 设计 · `vercel-ai-sdk`
62. **instructor-ai/instructor** — structured output 范式 · `instructor`
63. **e2b-dev/e2b** — 沙箱执行 · `e2b`
64. **microsoft/autogen** — 多 agent 编排 · `autogen`
65. **crewAIInc/crewAI** — agent 角色协作 · `crewai`
66. **langgenius/dify** — LLM 应用平台 · `dify`
67. **langflow-ai/langflow** — 可视化 agent 编排 · `langflow`

### 簇 6 · AI 应用范式（8 / 学怎么做产品）

68. **vercel/ai-chatbot** — 流式 chat UI 范式 · `vercel-ai-chatbot`
69. **lobehub/lobe-chat** — 完整 chat 应用架构 · `lobe-chat`
70. **assistant-ui/assistant-ui** — chat UI 组件库 · `assistant-ui`
71. **continuedev/continue** — IDE 内 AI 助手 · `continue`
72. **cline/cline** — VSCode AI agent 实现 · `cline`
73. **block/goose** — 本地 agent 框架 · `goose`
74. **browserbase/stagehand** — 浏览器 agent · `stagehand`
75. **browser-use/browser-use** — 浏览器自动化 · `browser-use`

### 簇 7 · DevOps + Infra（10 / 部署能力）

76. **docker/compose** — 多容器编排基础 · `docker-compose`
77. **caddyserver/caddy** — 现代 web server · `caddy`
78. **traefik/traefik** — 反向代理 + 服务发现 · `traefik`
79. **coollabsio/coolify** — 自托管 Vercel · `coolify`
80. **dokku/dokku** — 自托管 PaaS · `dokku`
81. **denoland/deno** — Node 替代品的设计 · `deno`
82. **oven-sh/bun** — JS 运行时性能流派 · `bun`
83. **vercel/vercel** — 部署平台 CLI · `vercel-cli`
84. **railway/cli** — 部署体验对照 · `railway-cli`
85. **kubernetes/kubernetes** — 节选 controller 模式 · `k8s-controllers`

### 簇 8 · 质量 + 测试 + 可观测（10）

86. **vitest-dev/vitest** — 现代 JS 测试框架 · `vitest`
87. **microsoft/playwright** — E2E 测试标杆 · `playwright`
88. **testing-library/react-testing-library** — 测试理念 · `testing-library`
89. **cypress-io/cypress** — E2E 体验对照 · `cypress`
90. **getsentry/sentry-javascript** — 错误监控集成 · `sentry-js`
91. **open-telemetry/opentelemetry-js** — 可观测标准 · `otel-js`
92. **PostHog/posthog** — 产品分析架构 · `posthog`
93. **statelyai/xstate** — 状态机 in TS · `xstate`
94. **Effect-TS/effect** — 函数式 TS 设计 · `effect`
95. **streamich/react-use** — hooks 集合（学习套路） · `react-use`

### 簇 9 · 开发者工具 + 协同（10）

96. **trigger.dev/trigger.dev** — 后台任务平台 · `trigger-dev`
97. **novuhq/novu** — 通知基础设施 · `novu`
98. **mintlify/writer** — 文档站对照 · `mintlify`
99. **vuejs/vitepress** — Vue 文档站 · `vitepress`
100. **withastro/starlight** — 你这站用的就是它，元学习 · `starlight-meta`
101. **yjs/yjs** — CRDT 协同实现 · `yjs`
102. **excalidraw/mermaid-to-excalidraw** — 小工具的工程性 · `mermaid-to-excalidraw`
103. **sst/sst** — 全栈 IaC 框架 · `sst`
104. **sst/opencode** — Claude Code 的开源对照 · `opencode`
105. **anthropics/skills** — superpowers skills 元学习 · `anthropic-skills`

---

## 已消化

- **shadcn-ui/ui**（2026-05-27）→ [笔记](/study/projects/shadcn-ui/)
- **TanStack/query**（2026-05-27）→ [笔记](/study/projects/tanstack-query/)

---

## 评估标准（cron 自动选项目时参考）

候选项目要满足至少 3 条：

- [ ] star > 5k 或社区活跃（不学小众玩具）
- [ ] 代码主语言是 TS/JS/Python/Go（Jason 当前栈或近邻）
- [ ] README/docs 质量高（自学友好）
- [ ] 能在本机 30 分钟内跑起来 demo（或至少能跑 examples/）
- [ ] 有清晰的"why this exists"（不为造而造）
- [ ] 与 Jason 当前工作或 6 个月路线有连接

不取的：

- 纯学术 / paper 实现，没产品落地
- 维护停滞 > 1 年
- 单人玩具项目（除非工程艺术性极高，e.g. tinygrad）

---

