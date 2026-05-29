---
title: 项目全景索引
description: 122 个项目 · 按 Season 主题分类 · 自动从 frontmatter 生成
sidebar:
  order: 5
  label: 项目全景索引
---

> 本页由 `scripts/regen-atlas.mjs` 自动生成。
> 修改方法：编辑项目笔记 frontmatter（`season:` / `category:` / `tier:`），重跑脚本。

## 总览

- **总数**：122 个
- **已分类（Season）**：11
- **未分类**：111

---

## 按 Season

### S13 · 原子状态库（5）

| 项目 | 描述 |
|---|---|
| [MobX — Reactive state via TFRP](/study/projects/mobx/) |  |

### S14 · 测试基础设施（5）

| 项目 | 描述 |
|---|---|
| [Testing Library 状元篇 — 用户视角的 DOM 测试哲学](/study/projects/testing-library/) | 从 Enzyme 时代到 Testing Library 时代，重构噩梦如何被一个简单原则解决 |

### S17 · Auth（5）

| 项目 | 描述 |
|---|---|
| [Auth.js 状元篇 — 多框架认证库的 Provider/Adapter 双抽象](/study/projects/auth-js/) | 从 NextAuth |
| [better-auth 状元篇 — Plugin 化 TS-first 认证框架的可注册扩展思路](/study/projects/better-auth/) | 从 Auth |
| [clerk 状元篇 — SaaS 化 auth 平台的 SDK + Prebuilt UI 一体化打法](/study/projects/clerk/) | 从 Auth |
| [Lucia 状元篇 — auth 是 utility 不是 framework 的反命题](/study/projects/lucia/) | 从 v3 framework 到 v4 utility 拆分 — Lucia 主动 deprecate 自己、把 session 推回 ~150 行手写、把 OAuth/cookie/crypto 拆到 oslo + arctic 的反向… |
| [SuperTokens — 自托管认证框架精读](/study/projects/supertokens/) | 从 Java core + Node/Python/Go SDK 多语言架构入手，理解 Recipe 模式如何把认证流程拆成可组合单元 |

### S19 · 动画库（5）

| 项目 | 描述 |
|---|---|
| [motion-one 状元篇](/study/projects/motion-one/) | 用 WAAPI 而非 RAF 写动画——浏览器自己跑，主线程不卡顿 |
| [react-spring 状元篇](/study/projects/react-spring/) | 基于物理 spring 的 React 动画库，告别 duration-based 缓动 |

### S20 · 数据可视化（5）

| 项目 | 描述 |
|---|---|
| [d3.js 数据驱动文档](/study/projects/d3/) | 不是图表库，是图表库的乐高底层——data join + scales + shapes + transitions |
| [Apache ECharts 配置式数据可视化](/study/projects/echarts/) | 不是底层乐高，是开箱图表 + 声明式 option JSON——把 17 种 series 类型 + zrender 自家渲染层封装成一个 setOption 调用 |

---

## 全部 122 个（字母序）

| Slug | 标题 |
|---|---|
| `affine` | [AFFiNE — 不是再做一个 Notion，是把 doc 和 whiteboard 融合到同一个 block 模型，再用 Yjs CRDT 把 local-first 做到底](/study/projects/affine/) |
| `arktype` | [arktype TypeScript 字符串 DSL 模式校验](/study/projects/arktype/) |
| `auth-js` | [Auth.js 状元篇 — 多框架认证库的 Provider/Adapter 双抽象](/study/projects/auth-js/) |
| `axios` | [axios Promise-based HTTP 客户端](/study/projects/axios/) |
| `better-auth` | [better-auth 状元篇 — Plugin 化 TS-first 认证框架的可注册扩展思路](/study/projects/better-auth/) |
| `biome` | [Biome — 一个工具替代 ESLint + Prettier 的勇气](/study/projects/biome/) |
| `browser-use` | [browser-use — 不是 Playwright 升级版，是 LLM 驱动的「DOM-tree → tool-call → CDP 执行」反馈循环](/study/projects/browser-use/) |
| `bun` | [Bun — 一个二进制 = 4 个 phase 的 JS 工具链](/study/projects/bun/) |
| `cal-com` | [cal.com — 不是再做一个 Calendly，是把"调度 SaaS"做成开源 + 可自托管 + 50 个 provider 都能插的协议](/study/projects/cal-com/) |
| `changesets` | [changesets — 把 monorepo 版本号从人脑搬到磁盘](/study/projects/changesets/) |
| `chatwoot` | [chatwoot — 不是再做一个 Intercom，是把"客服 SaaS"做成开源 + 自托管 + 11 类渠道全归一到 messages 表](/study/projects/chatwoot/) |
| `chroma` | [chroma — 不是 Pinecone 替代，是把向量检索拉回本地的 5 行 SDK](/study/projects/chroma/) |
| `claude-code` | [Claude Code — 一个 LLM-runtime 暴露成 5 种 surface 的 agentic 产品](/study/projects/claude-code/) |
| `clerk` | [clerk 状元篇 — SaaS 化 auth 平台的 SDK + Prebuilt UI 一体化打法](/study/projects/clerk/) |
| `codemirror` | [codemirror — 编辑器不是一个类，是一组 Facet 的合奏](/study/projects/codemirror/) |
| `continue` | [Continue — 把 AI code review 写成 git 跟踪的 markdown，让 PR 跑 status check](/study/projects/continue/) |
| `d3` | [d3.js 数据驱动文档](/study/projects/d3/) |
| `date-fns` | [date-fns 模块化日期函数库](/study/projects/date-fns/) |
| `dayjs` | [dayjs 极简 Moment.js 替代](/study/projects/dayjs/) |
| `dify` | [Dify — 不是再做一个 LangChain，是把 LLM workflow / RAG / agent / multi-provider 全装进一个 Flask + Next.js 单仓 LLMOps 平台](/study/projects/dify/) |
| `docusaurus` | [Docusaurus — Meta 出品的 docs 框架，plugin lifecycle 三段式](/study/projects/docusaurus/) |
| `drizzle` | [Drizzle ORM — TS-first SQL builder 与「反 DSL 派」的胜利](/study/projects/drizzle/) |
| `duckdb-wasm` | [duckdb-wasm — 把 OLAP 数据库塞进浏览器 tab 的疯狂工程](/study/projects/duckdb-wasm/) |
| `echarts` | [Apache ECharts 配置式数据可视化](/study/projects/echarts/) |
| `effect` | [Effect-TS — 函数式错误 + 资源管理的另一个未来](/study/projects/effect/) |
| `esbuild` | [esbuild Go-based 极速 JS bundler](/study/projects/esbuild/) |
| `excalidraw` | [Excalidraw — 把 canvas / 协同 / 撤销 / 持久 都收敛到同一个 Store](/study/projects/excalidraw/) |
| `fastify` | [Fastify schema-first Node 高性能 web 框架](/study/projects/fastify/) |
| `framer-motion` | [framer-motion — 给 React 的声明式物理动画系统](/study/projects/framer-motion/) |
| `got` | [got Node 端 HTTP 客户端的瑞士军刀](/study/projects/got/) |
| `gsap` | [gsap — 把 timeline 做成第一等公民的 JS 动画运行时](/study/projects/gsap/) |
| `hono` | [Hono — 极简边缘后端的 API 取舍](/study/projects/hono/) |
| `i18next` | [i18next framework-agnostic i18n 引擎](/study/projects/i18next/) |
| `immer` | [Immer — 用 Proxy 让你写 mutable 代码却产出 immutable 状态](/study/projects/immer/) |
| `immich` | [Immich — 把家庭照片从别人的云里救出来 · NestJS + FastAPI + pgvector 三栈混编的 self-hosted 照片基建](/study/projects/immich/) |
| `inngest` | [Inngest — durable workflow 的事件溯源](/study/projects/inngest/) |
| `jest` | [Jest 状元篇 — JS 测试框架的开箱即用](/study/projects/jest/) |
| `jotai` | [jotai — atomic 状态管理 + Daishi Kato 第三套](/study/projects/jotai/) |
| `js-joda` | [js-joda Java java.time API JS 端口](/study/projects/js-joda/) |
| `ky` | [ky 极简 fetch-based HTTP 客户端](/study/projects/ky/) |
| `kysely` | [Kysely TypeScript-first SQL Query Builder](/study/projects/kysely/) |
| `langfuse` | [Langfuse — LLM 应用的 Datadog，把 trace/eval/cost 做成基础设施](/study/projects/langfuse/) |
| `lerna` | [lerna — JS monorepo 第一代工具，2022 EOL 后被 Nx 收编的代际故事](/study/projects/lerna/) |
| `lexical` | [lexical — Meta 把富文本拆成 immutable EditorState + 双缓冲 reconciler 的协议](/study/projects/lexical/) |
| `librechat` | [LibreChat — 不是再做一个 ChatGPT 替代品，是把"chat 应用"和"模型供应商"解耦成可热插拔的 provider 抽象层](/study/projects/librechat/) |
| `lightningcss` | [lightningcss — 把 CSS 当类型系统，用 Rust 一遍跑完 parse / transform / minify / prefix](/study/projects/lightningcss/) |
| `lingui` | [Lingui 编译期提取的 React i18n](/study/projects/lingui/) |
| `lottie` | [lottie-web — 把设计师的 AE 工程变成跨端可渲染 JSON 的播放器](/study/projects/lottie/) |
| `lucia` | [Lucia 状元篇 — auth 是 utility 不是 framework 的反命题](/study/projects/lucia/) |
| `luxon` | [luxon TZ + i18n 现代 Moment 替代](/study/projects/luxon/) |
| `mcp-ts-sdk` | [MCP TypeScript SDK — 让 AI 调外部世界的最小契约](/study/projects/mcp-ts-sdk/) |
| `midscene` | [midscene — 不是 Playwright 升级版，是「自然语言 → 截图 + DOM → VLM 看图 → bbox → click」的反馈闭环框架](/study/projects/midscene/) |
| `mikro-orm` | [MikroORM DataMapper + Unit of Work + Identity Map](/study/projects/mikro-orm/) |
| `minisearch` | [minisearch — 把 Elasticsearch 那一整套，压成一个 27KB 浏览器文件](/study/projects/minisearch/) |
| `mobx` | [MobX — Reactive state via TFRP](/study/projects/mobx/) |
| `monaco-editor` | [monaco-editor — 把 VSCode 的编辑器内核搬进浏览器的 IDE 级控件](/study/projects/monaco-editor/) |
| `motion-one` | [motion-one 状元篇](/study/projects/motion-one/) |
| `msw` | [MSW — mock 不该改业务代码，应该在网络层透明拦截](/study/projects/msw/) |
| `nanobrowser` | [nanobrowser — 不是 cloud Chrome 的 AI agent，是把浏览器扩展当 sandbox 的 multi-agent runtime](/study/projects/nanobrowser/) |
| `nanostores` | [nanostores — 框架无关的 atomic 状态库（< 1 KB）](/study/projects/nanostores/) |
| `next-intl` | [next-intl Next.js App Router 专用 i18n](/study/projects/next-intl/) |
| `nextra` | [Nextra — Next.js 上盖一层 docs 框架，吃 React 生态全套电池](/study/projects/nextra/) |
| `nx` | [Nx — 跨框架 monorepo 的 generator/executor 范式](/study/projects/nx/) |
| `observable-plot` | [Observable Plot Grammar of Graphics in JS](/study/projects/observable-plot/) |
| `ofetch` | [ofetch — UnJS 现代 fetch 包装](/study/projects/ofetch/) |
| `ollama` | [ollama — 让本地 LLM 像 docker 一样易用的 Go 框架](/study/projects/ollama/) |
| `oxc` | [oxc — Rust 写一整套 JS 工具链的勇气](/study/projects/oxc/) |
| `patchright` | [patchright — 给 Playwright 打 patch 让浏览器自动化在生产环境真正用得上](/study/projects/patchright/) |
| `penpot` | [Penpot — 用一个 Lisp 方言打穿前后端的自托管 Figma 替代](/study/projects/penpot/) |
| `pino` | [pino — 日志不该阻塞热路径](/study/projects/pino/) |
| `plane` | [Plane — 把 Linear 的体感、Jira 的覆盖、GitHub Projects 的开放，全部塞进一个 turborepo + Django](/study/projects/plane/) |
| `playwright` | [Playwright — 浏览器自动化的工程艺术](/study/projects/playwright/) |
| `pnpm` | [pnpm — 把 npm 的 flat node_modules 换成硬链接 + 内容寻址](/study/projects/pnpm/) |
| `postgres-js` | [postgres.js — 写 SQL 但更安全的 Node 客户端](/study/projects/postgres-js/) |
| `prisma` | [Prisma TypeScript-first 现代 ORM](/study/projects/prisma/) |
| `prom-client` | [prom-client — Node 监控的事实标准 SDK](/study/projects/prom-client/) |
| `prosemirror` | [prosemirror — schema 不是配置项，是 contentEditable 的护身符](/study/projects/prosemirror/) |
| `radix-ui` | [Radix Primitives — unstyled accessible 组件协议](/study/projects/radix-ui/) |
| `react-hook-form` | [react-hook-form Uncontrolled-first React 表单库](/study/projects/react-hook-form/) |
| `react-intl` | [react-intl FormatJS ICU MessageFormat 标准 i18n](/study/projects/react-intl/) |
| `react-spring` | [react-spring 状元篇](/study/projects/react-spring/) |
| `recharts` | [Recharts JSX 数据可视化组件库](/study/projects/recharts/) |
| `rolldown` | [rolldown — Vite 下一代打包引擎，Rust + oxc 重写 Rollup](/study/projects/rolldown/) |
| `rollup` | [rollup ESM-first 库打包器](/study/projects/rollup/) |
| `rspack` | [rspack — Rust 重写的 webpack，兼容 plugin 生态的 bundler](/study/projects/rspack/) |
| `sentry` | [Sentry — 不是「日志收集器」，是「把崩溃当作可查询的列存事件」的双层数据库错误监控平台](/study/projects/sentry/) |
| `sequelize` | [Sequelize Node.js Promise-based ORM 元老](/study/projects/sequelize/) |
| `shadcn-ui` | [shadcn/ui — 把组件库变成"代码源 + CLI 包管协议"](/study/projects/shadcn-ui/) |
| `stagehand` | [stagehand — Playwright + LLM 的混血框架，act/extract/observe 三 API 共用 a11y 树](/study/projects/stagehand/) |
| `starlight` | [Starlight — Astro 官方文档框架，零 JS 默认 + sidebar autogen](/study/projects/starlight/) |
| `steel-browser` | [Steel Browser — 把 Chromium 包成 AI agent 用的 REST API](/study/projects/steel-browser/) |
| `storybook` | [Storybook — 给 UI 组件一个独立的工作台](/study/projects/storybook/) |
| `supabase` | [supabase — 不是另一个 Firebase 替代品，是把 Postgres 包成了完整 BaaS](/study/projects/supabase/) |
| `supertokens` | [SuperTokens — 自托管认证框架精读](/study/projects/supertokens/) |
| `swc` | [swc Rust-based JS/TS 编译器](/study/projects/swc/) |
| `swr` | [SWR — 同一问题的另一种回答](/study/projects/swr/) |
| `tanstack-form` | [TanStack Form Headless 多框架表单库](/study/projects/tanstack-form/) |
| `tanstack-query` | [TanStack Query — 服务端状态当成"独立物种"管](/study/projects/tanstack-query/) |
| `tanstack-router` | [TanStack Router — 把类型系统当 UX 工具](/study/projects/tanstack-router/) |
| `temporal-polyfill` | [Temporal API JavaScript 现代日期时间标准](/study/projects/temporal-polyfill/) |
| `testing-library` | [Testing Library 状元篇 — 用户视角的 DOM 测试哲学](/study/projects/testing-library/) |
| `trpc` | [tRPC — 协议消失：函数即 API](/study/projects/trpc/) |
| `turbopack` | [Turbopack — 把 bundler 重做成增量计算应用](/study/projects/turbopack/) |
| `turborepo` | [Turborepo — 把 monorepo build 重做成 task graph + 双层 cache](/study/projects/turborepo/) |
| `typeorm` | [TypeORM Decorator-based ORM](/study/projects/typeorm/) |
| `unstorage` | [unstorage — 让运行环境从代码里抹掉的 KV 抽象层](/study/projects/unstorage/) |
| `valibot` | [valibot 模块化模式校验](/study/projects/valibot/) |
| `valtio` | [valtio — 让 state.count++ 直接驱动 React 重渲染的 Proxy 状态库](/study/projects/valtio/) |
| `vercel-ai` | [Vercel AI SDK — 把 LLM 调用产品化](/study/projects/vercel-ai/) |
| `visx` | [visx Airbnb React 可视化原语](/study/projects/visx/) |
| `vite` | [Vite 现代前端构建工具](/study/projects/vite/) |
| `vitepress` | [VitePress — Vue + Vite 文档框架，零 framework 重负的 SSG](/study/projects/vitepress/) |
| `vitest` | [Vitest — 测试工具如果跟开发用同一个工具栈会怎样](/study/projects/vitest/) |
| `vue-i18n` | [vue-i18n Vue 官方推荐 i18n](/study/projects/vue-i18n/) |
| `web-vitals` | [web-vitals — 不是「测速工具」，是把 Chrome UX Report 的指标定义在浏览器端等值复刻的协议库](/study/projects/web-vitals/) |
| `webpack` | [webpack 现代前端工程化奠基](/study/projects/webpack/) |
| `why-did-you-render` | [why-did-you-render — 把 React 的"假更新"从口头警告变成可定位的诊断对象](/study/projects/why-did-you-render/) |
| `wretch` | [wretch — fluent FP fetch wrapper](/study/projects/wretch/) |
| `xstate` | [XState — 把状态画成图](/study/projects/xstate/) |
| `yjs` | [yjs — collaborative editing 不应该锁住编辑器，CRDT 抽象层让任何编辑器都能接](/study/projects/yjs/) |
| `zod` | [zod TypeScript-first 模式校验](/study/projects/zod/) |
| `zustand` | [zustand — 101 行核心的"反 Provider 派"状态管理](/study/projects/zustand/) |
