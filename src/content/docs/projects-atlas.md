---
title: 项目全景索引
description: 139 个项目 · 按主题分类 · 自动从 frontmatter 生成
sidebar:
  order: 5
  label: 项目全景索引
---

> 本页由 `scripts/regen-atlas.mjs` 自动生成（每次 build 前重跑）。
> 调整分类：编辑脚本里的 `THEMES_PROJECTS` 字典。

## 总览

- **总数**：139 个
- **已分类**：139

### 按主题分布

| 主题 | 数量 |
|---|---:|
| [数据可视化](#数据可视化) | 5 |
| [动画](#动画) | 5 |
| [表单 / Schema 校验](#表单---schema-校验) | 5 |
| [HTTP 客户端](#http-客户端) | 5 |
| [日期时间](#日期时间) | 5 |
| [i18n 国际化](#i18n-国际化) | 5 |
| [构建工具 / Bundler](#构建工具---bundler) | 12 |
| [ORM / DB 客户端](#orm---db-客户端) | 8 |
| [Web 框架](#web-框架) | 6 |
| [Auth 认证](#auth-认证) | 5 |
| [Monorepo / 包管理](#monorepo---包管理) | 5 |
| [状态管理](#状态管理) | 8 |
| [测试 / 验证](#测试---验证) | 6 |
| [编辑器 / 富文本](#编辑器---富文本) | 5 |
| [文档站点](#文档站点) | 4 |
| [数据获取 / 路由](#数据获取---路由) | 4 |
| [AI 应用 / Agent 平台](#ai-应用---agent-平台) | 9 |
| [AI 浏览器自动化](#ai-浏览器自动化) | 6 |
| [可观测 / 性能](#可观测---性能) | 5 |
| [数据应用 / SaaS](#数据应用---saas) | 8 |
| [基础组件 / Headless UI](#基础组件---headless-ui) | 2 |
| [Markdown / 解析](#markdown---解析) | 5 |
| [图像处理 / Canvas](#图像处理---canvas) | 5 |
| [CSS / 样式](#css---样式) | 3 |
| [其他基础设施](#其他基础设施) | 3 |

---

## 数据可视化

共 5 个。

| 项目 | 描述 |
|---|---|
| [d3.js 数据驱动文档](/study/projects/d3/) | 不是图表库，是图表库的乐高底层——data join + scales + shapes + transitions |
| [Apache ECharts 配置式数据可视化](/study/projects/echarts/) | 不是底层乐高，是开箱图表 + 声明式 option JSON——把 17 种 series 类型 + zrender 自家渲染层封装成一个 setOption 调用 |
| [Observable Plot Grammar of Graphics in JS](/study/projects/observable-plot/) |  |
| [Recharts JSX 数据可视化组件库](/study/projects/recharts/) |  |
| [visx Airbnb React 可视化原语](/study/projects/visx/) |  |

## 动画

共 5 个。

| 项目 | 描述 |
|---|---|
| [framer-motion — 给 React 的声明式物理动画系统](/study/projects/framer-motion/) | 不是 CSS transition 的语法糖，是一个把 spring physics 的解析闭式解 + RAF 主循环 + FLIP layout projection 三件事缝在 motion |
| [gsap — 把 timeline 做成第一等公民的 JS 动画运行时](/study/projects/gsap/) | 不是 keyframe 派的便携包装，是一台跑了 18 年、用闭式数学解 + 单 Ticker 主循环 + PropTween 链表挂插件的运行时 |
| [lottie-web — 把设计师的 AE 工程变成跨端可渲染 JSON 的播放器](/study/projects/lottie/) | 不是动画库，是 AE 到浏览器的协议层 |
| [motion-one 状元篇](/study/projects/motion-one/) | 用 WAAPI 而非 RAF 写动画——浏览器自己跑，主线程不卡顿 |
| [react-spring 状元篇](/study/projects/react-spring/) | 基于物理 spring 的 React 动画库，告别 duration-based 缓动 |

## 表单 / Schema 校验

共 5 个。

| 项目 | 描述 |
|---|---|
| [arktype TypeScript 字符串 DSL 模式校验](/study/projects/arktype/) |  |
| [react-hook-form Uncontrolled-first React 表单库](/study/projects/react-hook-form/) |  |
| [TanStack Form Headless 多框架表单库](/study/projects/tanstack-form/) |  |
| [valibot 模块化模式校验](/study/projects/valibot/) |  |
| [zod TypeScript-first 模式校验](/study/projects/zod/) |  |

## HTTP 客户端

共 5 个。

| 项目 | 描述 |
|---|---|
| [axios Promise-based HTTP 客户端](/study/projects/axios/) |  |
| [got Node 端 HTTP 客户端的瑞士军刀](/study/projects/got/) |  |
| [ky 极简 fetch-based HTTP 客户端](/study/projects/ky/) |  |
| [ofetch — UnJS 现代 fetch 包装](/study/projects/ofetch/) |  |
| [wretch — fluent FP fetch wrapper](/study/projects/wretch/) |  |

## 日期时间

共 5 个。

| 项目 | 描述 |
|---|---|
| [date-fns 模块化日期函数库](/study/projects/date-fns/) |  |
| [dayjs 极简 Moment.js 替代](/study/projects/dayjs/) |  |
| [js-joda Java java.time API JS 端口](/study/projects/js-joda/) |  |
| [luxon TZ + i18n 现代 Moment 替代](/study/projects/luxon/) |  |
| [Temporal API JavaScript 现代日期时间标准](/study/projects/temporal-polyfill/) |  |

## i18n 国际化

共 5 个。

| 项目 | 描述 |
|---|---|
| [i18next framework-agnostic i18n 引擎](/study/projects/i18next/) |  |
| [Lingui 编译期提取的 React i18n](/study/projects/lingui/) |  |
| [next-intl Next.js App Router 专用 i18n](/study/projects/next-intl/) |  |
| [react-intl FormatJS ICU MessageFormat 标准 i18n](/study/projects/react-intl/) |  |
| [vue-i18n Vue 官方推荐 i18n](/study/projects/vue-i18n/) |  |

## 构建工具 / Bundler

共 12 个。

| 项目 | 描述 |
|---|---|
| [Biome — 一个工具替代 ESLint + Prettier 的勇气](/study/projects/biome/) | 不是把两个工具合到一起，是从零写一个 Rust 工具链，复用 AST、共享配置、跑得快 25 倍 |
| [Bun — 一个二进制 = 4 个 phase 的 JS 工具链](/study/projects/bun/) | 用 Zig 写的 JS runtime + bundler + test runner + package manager |
| [esbuild Go-based 极速 JS bundler](/study/projects/esbuild/) |  |
| [lightningcss — 把 CSS 当类型系统，用 Rust 一遍跑完 parse / transform / minify / prefix](/study/projects/lightningcss/) | Parcel 团队用 Rust 重写整个 CSS 工具链，200+ CSS property 各自一个 Rust 类型，一遍走完 cssnano + autoprefixer + postcss-preset-env … |
| [oxc — Rust 写一整套 JS 工具链的勇气](/study/projects/oxc/) | 不是把现有 JS 工具搬到 Rust，是从零设计 parser / AST / linter 全栈，速度比 ESLint 快 50-100 倍 |
| [rolldown — Vite 下一代打包引擎，Rust + oxc 重写 Rollup](/study/projects/rolldown/) | 不是 Rollup 的替代品，是 Vite 的统一引擎 |
| [rollup ESM-first 库打包器](/study/projects/rollup/) |  |
| [rspack — Rust 重写的 webpack，兼容 plugin 生态的 bundler](/study/projects/rspack/) | 不是 webpack 的下位替代，是 webpack plugin API 的 Rust 实现 |
| [swc Rust-based JS/TS 编译器](/study/projects/swc/) |  |
| [Turbopack — 把 bundler 重做成增量计算应用](/study/projects/turbopack/) | Webpack 作者 Tobias Koppers 第二代 bundler |
| [Vite 现代前端构建工具](/study/projects/vite/) |  |
| [webpack 现代前端工程化奠基](/study/projects/webpack/) |  |

## ORM / DB 客户端

共 8 个。

| 项目 | 描述 |
|---|---|
| [Drizzle ORM — TS-first SQL builder 与「反 DSL 派」的胜利](/study/projects/drizzle/) | schema 用纯 TS 写、类型从 schema 推、SQL builder 直接生成 query——一条不绕过 SQL 的 ORM 路线 |
| [duckdb-wasm — 把 OLAP 数据库塞进浏览器 tab 的疯狂工程](/study/projects/duckdb-wasm/) | 用 Emscripten 把 C++ 列式分析数据库编译成 WASM，主线程 JS API → Web Worker → WASM bundle → virtual filesystem，让 SQL 直接在浏览器里跑 … |
| [Kysely TypeScript-first SQL Query Builder](/study/projects/kysely/) | 不是 ORM 也不是 raw SQL——用 TypeScript 模板类型把 SQL 写成 method chain，每一步都被类型系统校验，编译期就把 select 列、join 条件、where 类型对齐 |
| [MikroORM DataMapper + Unit of Work + Identity Map](/study/projects/mikro-orm/) |  |
| [postgres.js — 写 SQL 但更安全的 Node 客户端](/study/projects/postgres-js/) | 用 tagged template literal 把 SQL 字符串和 parameter 在编译期就分开，自动绑参防注入 |
| [Prisma TypeScript-first 现代 ORM](/study/projects/prisma/) | schema-first DSL → generate 类型安全 client → migrate 管 schema 演化，靠 Rust query engine 跨多种数据库说同一种话 |
| [Sequelize Node.js Promise-based ORM 元老](/study/projects/sequelize/) |  |
| [TypeORM Decorator-based ORM](/study/projects/typeorm/) |  |

## Web 框架

共 6 个。

| 项目 | 描述 |
|---|---|
| [Elysia Bun-first TypeScript Web 框架](/study/projects/elysia/) |  |
| [Express Node.js 经典 Web 框架](/study/projects/express/) |  |
| [Fastify schema-first Node 高性能 web 框架](/study/projects/fastify/) |  |
| [Hono — 极简边缘后端的 API 取舍](/study/projects/hono/) | 用 Web 标准（Request/Response）+ 多种 router 实现 + koa-compose 中间件做"任何 runtime 都能跑"的 web 框架 |
| [Koa async/await + ctx 对象 + 洋葱模型 极简 web 框架](/study/projects/koa/) |  |
| [NestJS Angular 风格的企业级 Node.js 框架](/study/projects/nestjs/) |  |

## Auth 认证

共 5 个。

| 项目 | 描述 |
|---|---|
| [Auth.js 状元篇 — 多框架认证库的 Provider/Adapter 双抽象](/study/projects/auth-js/) | 从 NextAuth |
| [better-auth 状元篇 — Plugin 化 TS-first 认证框架的可注册扩展思路](/study/projects/better-auth/) | 从 Auth |
| [clerk 状元篇 — SaaS 化 auth 平台的 SDK + Prebuilt UI 一体化打法](/study/projects/clerk/) | 从 Auth |
| [Lucia 状元篇 — auth 是 utility 不是 framework 的反命题](/study/projects/lucia/) | 从 v3 framework 到 v4 utility 拆分 — Lucia 主动 deprecate 自己、把 session 推回 ~150 行手写、把 OAuth/cookie/crypto 拆到 oslo + … |
| [SuperTokens — 自托管认证框架精读](/study/projects/supertokens/) | 从 Java core + Node/Python/Go SDK 多语言架构入手，理解 Recipe 模式如何把认证流程拆成可组合单元 |

## Monorepo / 包管理

共 5 个。

| 项目 | 描述 |
|---|---|
| [changesets — 把 monorepo 版本号从人脑搬到磁盘](/study/projects/changesets/) | 不是 Lerna 替代，是把 versioning 决策从 release 时刻推前到 PR 时刻——每个改动自带它该 bump 哪一档 |
| [lerna — JS monorepo 第一代工具，2022 EOL 后被 Nx 收编的代际故事](/study/projects/lerna/) | 不是另一个 monorepo 工具，是 monorepo 工具的"祖宗"——bootstrap + version + publish 三步流程定义了 2017-2020 整个生态 |
| [Nx — 跨框架 monorepo 的 generator/executor 范式](/study/projects/nx/) | 从 Angular CLI 演化而来的 monorepo 元框架，靠 project graph + executor 抽象 + Nx Cloud DTE 把任务编排做到企业级 monorepo 的极致 |
| [pnpm — 把 npm 的 flat node_modules 换成硬链接 + 内容寻址](/study/projects/pnpm/) | 不是更快的 npm，是把"每个项目都复制一遍 node_modules"这件事重写成"全机器一份 store + 硬链接"——磁盘 50% 节省、phantom dependency 编译期可见、workspace p… |
| [Turborepo — 把 monorepo build 重做成 task graph + 双层 cache](/study/projects/turborepo/) | Vercel 把 Jared Palmer 的 TS 版 turborepo 用 Rust 重写——task graph 拓扑序 + 本地/远程 cache 多路复用 + tokio 并行 runner，让"改一个包重… |

## 状态管理

共 8 个。

| 项目 | 描述 |
|---|---|
| [Effect-TS — 函数式错误 + 资源管理的另一个未来](/study/projects/effect/) | 把 Promise 升级成 Effect 类型，把 throw 换成可追踪 cause，把 try/finally 换成自动资源清理 |
| [Immer — 用 Proxy 让你写 mutable 代码却产出 immutable 状态](/study/projects/immer/) | 拆解 immer 如何用 ES6 Proxy 拦截写操作、构造 draft、最后 finalize 出新对象，并对比 Immutable |
| [jotai — atomic 状态管理 + Daishi Kato 第三套](/study/projects/jotai/) | jotai 是 pmndrs 出品的 atomic 状态管理库，Daishi Kato 在 zustand / valtio 之后给出的第三套答案：把"最小订阅单元"做到 atom 级别，用 read/write 函数… |
| [MobX — Reactive state via TFRP](/study/projects/mobx/) |  |
| [nanostores — 框架无关的 atomic 状态库（< 1 KB）](/study/projects/nanostores/) | nanostores 是 Andrey Sitnik（PostCSS / Browserslist 作者）做的极小状态管理库，押注"state 不该绑定 React"——一个 ~265 字节的 atom 核心，再用独立… |
| [valtio — 让 state.count++ 直接驱动 React 重渲染的 Proxy 状态库](/study/projects/valtio/) | pmndrs 出品，459 行 vanilla |
| [XState — 把状态画成图](/study/projects/xstate/) | 有限状态机 + Actor 模型，把"看似简单的状态"变成可视化的设计文档 |
| [zustand — 101 行核心的"反 Provider 派"状态管理](/study/projects/zustand/) | pmndrs 出品 |

## 测试 / 验证

共 6 个。

| 项目 | 描述 |
|---|---|
| [Jest 状元篇 — JS 测试框架的开箱即用](/study/projects/jest/) |  |
| [MSW — mock 不该改业务代码，应该在网络层透明拦截](/study/projects/msw/) | 拆解 mswjs/msw 如何在浏览器用 Service Worker、在 Node 用 fetch interceptor，统一 mock API |
| [Playwright — 浏览器自动化的工程艺术](/study/projects/playwright/) | 跨进程 + 跨语言的协议设计 + 自动等待 + auto-retry locator，把"测试浏览器"做到工业级 |
| [Storybook — 给 UI 组件一个独立的工作台](/study/projects/storybook/) | 不是文档站、不是测试 runner、不是 playground —— 它是把这三件事缝起来的 dev-time framework，靠 Manager + Preview iframe 双 window 和一根 pos… |
| [Testing Library 状元篇 — 用户视角的 DOM 测试哲学](/study/projects/testing-library/) | 从 Enzyme 时代到 Testing Library 时代，重构噩梦如何被一个简单原则解决 |
| [Vitest — 测试工具如果跟开发用同一个工具栈会怎样](/study/projects/vitest/) | 拆解 vitest 如何复用 Vite dev server 的 transpile 与 ModuleRunner，把 worker pool 拆成 forks/threads/vmForks/vmThreads，并跑… |

## 编辑器 / 富文本

共 5 个。

| 项目 | 描述 |
|---|---|
| [codemirror — 编辑器不是一个类，是一组 Facet 的合奏](/study/projects/codemirror/) | CodeMirror 6 完全重写为分包架构，每个特性都是 plugin |
| [lexical — Meta 把富文本拆成 immutable EditorState + 双缓冲 reconciler 的协议](/study/projects/lexical/) | Lexical 用 native browser selection + immutable EditorState + dirty-set reconciler，把 contentEditable 从"性能黑盒"压回… |
| [monaco-editor — 把 VSCode 的编辑器内核搬进浏览器的 IDE 级控件](/study/projects/monaco-editor/) | Monaco 把 VSCode 的 CodeEditorWidget / TextModel / ViewModel / Web Worker LSP 协议原样拆出来作为浏览器 SDK，让任何站点都能挂上 IDE 级 … |
| [prosemirror — schema 不是配置项，是 contentEditable 的护身符](/study/projects/prosemirror/) | ProseMirror 用强 schema + Step + immutable State 把"在 contentEditable 上做协同富文本"从玄学变成可证明正确 |
| [yjs — collaborative editing 不应该锁住编辑器，CRDT 抽象层让任何编辑器都能接](/study/projects/yjs/) | Kevin Jahns 把 CRDT 从论文工艺做成工业基建 |

## 文档站点

共 4 个。

| 项目 | 描述 |
|---|---|
| [Docusaurus — Meta 出品的 docs 框架，plugin lifecycle 三段式](/study/projects/docusaurus/) | React + MDX + 内置 i18n / versioning / search / blog 的全功能文档框架 |
| [Nextra — Next.js 上盖一层 docs 框架，吃 React 生态全套电池](/study/projects/nextra/) | Vercel 系 docs 框架的另一极——shuding 起手 + dimaMachina 接棒，把 nextra(config)(nextConfig) 这一行 hooking 加在 a54da393 这条 com… |
| [Starlight — Astro 官方文档框架，零 JS 默认 + sidebar autogen](/study/projects/starlight/) | 这个 study 站本身就用 Starlight 构建 |
| [VitePress — Vue + Vite 文档框架，零 framework 重负的 SSG](/study/projects/vitepress/) | Vue 团队对 docs 框架的重构答卷——把 markdown-it + Vue SFC + Vite SSG + 默认主题缝在 ee02826 这条 commit 上，280 行 build |

## 数据获取 / 路由

共 4 个。

| 项目 | 描述 |
|---|---|
| [SWR — 同一问题的另一种回答](/study/projects/swr/) | 把"远程数据该不该重新拉"做成一个全局事件广播，hook 第一、客户端对象消失 |
| [TanStack Query — 服务端状态当成"独立物种"管](/study/projects/tanstack-query/) | 区别于 useState 的客户端状态，服务端状态需要缓存键、过期、回收、订阅 |
| [TanStack Router — 把类型系统当 UX 工具](/study/projects/tanstack-router/) | 路由不只是跳转，是从 URL 到组件的端到端类型契约 |
| [tRPC — 协议消失：函数即 API](/study/projects/trpc/) | 把 client |

## AI 应用 / Agent 平台

共 9 个。

| 项目 | 描述 |
|---|---|
| [chroma — 不是 Pinecone 替代，是把向量检索拉回本地的 5 行 SDK](/study/projects/chroma/) | Python + Rust 双栈、单机即用的开源向量数据库 |
| [Claude Code — 一个 LLM-runtime 暴露成 5 种 surface 的 agentic 产品](/study/projects/claude-code/) | 大型应用范例 (v1 |
| [Continue — 把 AI code review 写成 git 跟踪的 markdown，让 PR 跑 status check](/study/projects/continue/) | 不再是"开源 Cursor"——v1 |
| [Dify — 不是再做一个 LangChain，是把 LLM workflow / RAG / agent / multi-provider 全装进一个 Flask + Next.js 单仓 LLMOps 平台](/study/projects/dify/) | 大型应用范例——143k stars 的开源 LLMOps 平台，Python 后端 + Next |
| [Langfuse — LLM 应用的 Datadog，把 trace/eval/cost 做成基础设施](/study/projects/langfuse/) | 大型应用范例，28k stars 背后的「Next |
| [LibreChat — 不是再做一个 ChatGPT 替代品，是把"chat 应用"和"模型供应商"解耦成可热插拔的 provider 抽象层](/study/projects/librechat/) | 大型应用范例——37k stars 的 self-hosted ChatGPT alternative，Express + React + MongoDB + Meilisearch，packages/api/src/… |
| [MCP TypeScript SDK — 让 AI 调外部世界的最小契约](/study/projects/mcp-ts-sdk/) | 一个跨厂商的协议设计：tools / resources / prompts 三类原语 + JSON-RPC 传输 + 严格 schema |
| [ollama — 让本地 LLM 像 docker 一样易用的 Go 框架](/study/projects/ollama/) | 框架/SDK 范例，173k stars 的本地 LLM 一键运行框架，Go 主程序通过 exec |
| [Vercel AI SDK — 把 LLM 调用产品化](/study/projects/vercel-ai/) | stream / structured output / tool use / multimodal 全统一在一组类型安全 API |

## AI 浏览器自动化

共 6 个。

| 项目 | 描述 |
|---|---|
| [browser-use — 不是 Playwright 升级版，是 LLM 驱动的「DOM-tree → tool-call → CDP 执行」反馈循环](/study/projects/browser-use/) | 大型应用范例 (v1 |
| [midscene — 不是 Playwright 升级版，是「自然语言 → 截图 + DOM → VLM 看图 → bbox → click」的反馈闭环框架](/study/projects/midscene/) | 框架/SDK 范例 (v1 |
| [nanobrowser — 不是 cloud Chrome 的 AI agent，是把浏览器扩展当 sandbox 的 multi-agent runtime](/study/projects/nanobrowser/) | 框架/SDK 范例 (v1 |
| [patchright — 给 Playwright 打 patch 让浏览器自动化在生产环境真正用得上](/study/projects/patchright/) | 不是新 driver、不是 stealth 插件，是直接 fork Playwright 源码 ts-morph AST 改写——拔掉 Runtime |
| [stagehand — Playwright + LLM 的混血框架，act/extract/observe 三 API 共用 a11y 树](/study/projects/stagehand/) | 框架/SDK 范例 (v1 |
| [Steel Browser — 把 Chromium 包成 AI agent 用的 REST API](/study/projects/steel-browser/) | TypeScript + Fastify + puppeteer-core，让 LLM agent 像调外部 SaaS 一样用浏览器 |

## 可观测 / 性能

共 5 个。

| 项目 | 描述 |
|---|---|
| [pino — 日志不该阻塞热路径](/study/projects/pino/) | 把 logging 拆成两段：主线程只做 string 拼接 + 一次 stream |
| [prom-client — Node 监控的事实标准 SDK](/study/projects/prom-client/) | 把指标分四类（Counter / Gauge / Histogram / Summary），主线程零格式化累加，scrape 时一次性序列化为 OpenMetrics 文本 |
| [Sentry — 不是「日志收集器」，是「把崩溃当作可查询的列存事件」的双层数据库错误监控平台](/study/projects/sentry/) | 大型应用范例——38k+ stars 的开源错误监控平台，Python + Django + ClickHouse + TypeScript，事件 ingest / grouping / Snuba 抽象三轨精读 |
| [web-vitals — 不是「测速工具」，是把 Chrome UX Report 的指标定义在浏览器端等值复刻的协议库](/study/projects/web-vitals/) | 工具库范例——8 |
| [why-did-you-render — 把 React 的"假更新"从口头警告变成可定位的诊断对象](/study/projects/why-did-you-render/) | monkey-patch React |

## 数据应用 / SaaS

共 8 个。

| 项目 | 描述 |
|---|---|
| [AFFiNE — 不是再做一个 Notion，是把 doc 和 whiteboard 融合到同一个 block 模型，再用 Yjs CRDT 把 local-first 做到底](/study/projects/affine/) | 大型应用范例——50k stars 的开源 Notion + Miro 替代，TypeScript + React + NestJS + Yjs，BlockSuite hyper-merged block 模型 + 本… |
| [cal.com — 不是再做一个 Calendly，是把"调度 SaaS"做成开源 + 可自托管 + 50 个 provider 都能插的协议](/study/projects/cal-com/) | 大型应用范例——44 |
| [chatwoot — 不是再做一个 Intercom，是把"客服 SaaS"做成开源 + 自托管 + 11 类渠道全归一到 messages 表](/study/projects/chatwoot/) | 大型应用范例——29 |
| [Excalidraw — 把 canvas / 协同 / 撤销 / 持久 都收敛到同一个 Store](/study/projects/excalidraw/) | 大型应用范例——124k stars 背后的"四轨同核"架构判断，以及一处经常被误读的"P2P/E2E"叙事 |
| [Immich — 把家庭照片从别人的云里救出来 · NestJS + FastAPI + pgvector 三栈混编的 self-hosted 照片基建](/study/projects/immich/) | 大型应用范例——102k stars 的 Google Photos 替代品，TS 后端 + Python ML 服务 + Postgres + Redis + Object Storage 五件套同核运行 |
| [Penpot — 用一个 Lisp 方言打穿前后端的自托管 Figma 替代](/study/projects/penpot/) | 大型应用范例，48k stars 背后的"common/ |
| [Plane — 把 Linear 的体感、Jira 的覆盖、GitHub Projects 的开放，全部塞进一个 turborepo + Django](/study/projects/plane/) | 大型应用范例——49 |
| [supabase — 不是另一个 Firebase 替代品，是把 Postgres 包成了完整 BaaS](/study/projects/supabase/) | 大型应用范例 — 75k+ stars 的开源 Backend-as-a-Service，Auth/Realtime/Storage/Edge Functions 全部围绕 Postgres 一份事实 |

## 基础组件 / Headless UI

共 2 个。

| 项目 | 描述 |
|---|---|
| [Radix Primitives — unstyled accessible 组件协议](/study/projects/radix-ui/) | 用 Slot/asChild + 受控/非受控双模 hook + Portal/FocusScope 分层，把 WAI-ARIA Authoring Practices 翻译成可组合的 React primitive |
| [shadcn/ui — 把组件库变成"代码源 + CLI 包管协议"](/study/projects/shadcn-ui/) | 反 npm install 范式：组件源码直接复制进你的项目，让你 own 它 |

## Markdown / 解析

共 5 个。

| 项目 | 描述 |
|---|---|
| [markdown-it CommonMark 兼容的可插拔 Markdown 解析器](/study/projects/markdown-it/) |  |
| [marked regex-based 单文件 markdown 解析器](/study/projects/marked/) |  |
| [micromark 流式 CommonMark 状态机解析器](/study/projects/micromark/) |  |
| [shiki TextMate Grammar 驱动的语法高亮](/study/projects/shiki/) |  |
| [unified AST + plugin pipeline 通用文档处理框架](/study/projects/unified/) |  |

## 图像处理 / Canvas

共 5 个。

| 项目 | 描述 |
|---|---|
| [fabric-js](/study/projects/fabric-js/) |  |
| [jimp](/study/projects/jimp/) |  |
| [Konva.js — Canvas 2D 的"DOM 化"图形框架](/study/projects/konva/) | Stage / Layer / Group / Shape 节点树 + 事件冒泡 + 多 Layer 合成性能策略 |
| [PixiJS — WebGL 2D 渲染引擎的状元收官](/study/projects/pixi/) | S29-5 收官：从 Application/Stage/Container 流水线到 v8 ECS 重写，看一个工具库如何在 13 年里成为 web 端 2D 图像渲染的事实标准 |
| [sharp - libvips 之上的 Node 图像处理（S29-1）](/study/projects/sharp/) | Node |

## CSS / 样式

共 3 个。

| 项目 | 描述 |
|---|---|
| [Emotion — runtime CSS-in-JS 的当代生产版本](/study/projects/emotion/) |  |
| [styled-components — CSS-in-JS 鼻祖与运行时样式注入](/study/projects/styled-components/) |  |
| [Tailwind CSS — utility-first 怎么把 CSS 写法重写一遍](/study/projects/tailwind/) |  |

## 其他基础设施

共 3 个。

| 项目 | 描述 |
|---|---|
| [Inngest — durable workflow 的事件溯源](/study/projects/inngest/) | 用 step |
| [minisearch — 把 Elasticsearch 那一整套，压成一个 27KB 浏览器文件](/study/projects/minisearch/) | 倒排索引 + Radix Tree + BM25 + Levenshtein 矩阵剪枝，全部纯 TS 跑在 V8 里——证明大部分搜索场景根本不需要 server |
| [unstorage — 让运行环境从代码里抹掉的 KV 抽象层](/study/projects/unstorage/) | 一个 storage interface + driver registry 跑通 fs/redis/s3/cloudflare-kv/upstash 等 35+ backend |

---

## 全部 139 个（字母序）

| Slug | 项目 | 主题 |
|---|---|---|
| `affine` | [AFFiNE — 不是再做一个 Notion，是把 doc 和 whiteboard 融合到同一个 block 模型，再用 Yjs CRDT 把 local-first 做到底](/study/projects/affine/) | 数据应用 / SaaS |
| `arktype` | [arktype TypeScript 字符串 DSL 模式校验](/study/projects/arktype/) | 表单 / Schema 校验 |
| `auth-js` | [Auth.js 状元篇 — 多框架认证库的 Provider/Adapter 双抽象](/study/projects/auth-js/) | Auth 认证 |
| `axios` | [axios Promise-based HTTP 客户端](/study/projects/axios/) | HTTP 客户端 |
| `better-auth` | [better-auth 状元篇 — Plugin 化 TS-first 认证框架的可注册扩展思路](/study/projects/better-auth/) | Auth 认证 |
| `biome` | [Biome — 一个工具替代 ESLint + Prettier 的勇气](/study/projects/biome/) | 构建工具 / Bundler |
| `browser-use` | [browser-use — 不是 Playwright 升级版，是 LLM 驱动的「DOM-tree → tool-call → CDP 执行」反馈循环](/study/projects/browser-use/) | AI 浏览器自动化 |
| `bun` | [Bun — 一个二进制 = 4 个 phase 的 JS 工具链](/study/projects/bun/) | 构建工具 / Bundler |
| `cal-com` | [cal.com — 不是再做一个 Calendly，是把"调度 SaaS"做成开源 + 可自托管 + 50 个 provider 都能插的协议](/study/projects/cal-com/) | 数据应用 / SaaS |
| `changesets` | [changesets — 把 monorepo 版本号从人脑搬到磁盘](/study/projects/changesets/) | Monorepo / 包管理 |
| `chatwoot` | [chatwoot — 不是再做一个 Intercom，是把"客服 SaaS"做成开源 + 自托管 + 11 类渠道全归一到 messages 表](/study/projects/chatwoot/) | 数据应用 / SaaS |
| `chroma` | [chroma — 不是 Pinecone 替代，是把向量检索拉回本地的 5 行 SDK](/study/projects/chroma/) | AI 应用 / Agent 平台 |
| `claude-code` | [Claude Code — 一个 LLM-runtime 暴露成 5 种 surface 的 agentic 产品](/study/projects/claude-code/) | AI 应用 / Agent 平台 |
| `clerk` | [clerk 状元篇 — SaaS 化 auth 平台的 SDK + Prebuilt UI 一体化打法](/study/projects/clerk/) | Auth 认证 |
| `codemirror` | [codemirror — 编辑器不是一个类，是一组 Facet 的合奏](/study/projects/codemirror/) | 编辑器 / 富文本 |
| `continue` | [Continue — 把 AI code review 写成 git 跟踪的 markdown，让 PR 跑 status check](/study/projects/continue/) | AI 应用 / Agent 平台 |
| `d3` | [d3.js 数据驱动文档](/study/projects/d3/) | 数据可视化 |
| `date-fns` | [date-fns 模块化日期函数库](/study/projects/date-fns/) | 日期时间 |
| `dayjs` | [dayjs 极简 Moment.js 替代](/study/projects/dayjs/) | 日期时间 |
| `dify` | [Dify — 不是再做一个 LangChain，是把 LLM workflow / RAG / agent / multi-provider 全装进一个 Flask + Next.js 单仓 LLMOps 平台](/study/projects/dify/) | AI 应用 / Agent 平台 |
| `docusaurus` | [Docusaurus — Meta 出品的 docs 框架，plugin lifecycle 三段式](/study/projects/docusaurus/) | 文档站点 |
| `drizzle` | [Drizzle ORM — TS-first SQL builder 与「反 DSL 派」的胜利](/study/projects/drizzle/) | ORM / DB 客户端 |
| `duckdb-wasm` | [duckdb-wasm — 把 OLAP 数据库塞进浏览器 tab 的疯狂工程](/study/projects/duckdb-wasm/) | ORM / DB 客户端 |
| `echarts` | [Apache ECharts 配置式数据可视化](/study/projects/echarts/) | 数据可视化 |
| `effect` | [Effect-TS — 函数式错误 + 资源管理的另一个未来](/study/projects/effect/) | 状态管理 |
| `elysia` | [Elysia Bun-first TypeScript Web 框架](/study/projects/elysia/) | Web 框架 |
| `emotion` | [Emotion — runtime CSS-in-JS 的当代生产版本](/study/projects/emotion/) | CSS / 样式 |
| `esbuild` | [esbuild Go-based 极速 JS bundler](/study/projects/esbuild/) | 构建工具 / Bundler |
| `excalidraw` | [Excalidraw — 把 canvas / 协同 / 撤销 / 持久 都收敛到同一个 Store](/study/projects/excalidraw/) | 数据应用 / SaaS |
| `express` | [Express Node.js 经典 Web 框架](/study/projects/express/) | Web 框架 |
| `fabric-js` | [fabric-js](/study/projects/fabric-js/) | 图像处理 / Canvas |
| `fastify` | [Fastify schema-first Node 高性能 web 框架](/study/projects/fastify/) | Web 框架 |
| `framer-motion` | [framer-motion — 给 React 的声明式物理动画系统](/study/projects/framer-motion/) | 动画 |
| `got` | [got Node 端 HTTP 客户端的瑞士军刀](/study/projects/got/) | HTTP 客户端 |
| `gsap` | [gsap — 把 timeline 做成第一等公民的 JS 动画运行时](/study/projects/gsap/) | 动画 |
| `hono` | [Hono — 极简边缘后端的 API 取舍](/study/projects/hono/) | Web 框架 |
| `i18next` | [i18next framework-agnostic i18n 引擎](/study/projects/i18next/) | i18n 国际化 |
| `immer` | [Immer — 用 Proxy 让你写 mutable 代码却产出 immutable 状态](/study/projects/immer/) | 状态管理 |
| `immich` | [Immich — 把家庭照片从别人的云里救出来 · NestJS + FastAPI + pgvector 三栈混编的 self-hosted 照片基建](/study/projects/immich/) | 数据应用 / SaaS |
| `inngest` | [Inngest — durable workflow 的事件溯源](/study/projects/inngest/) | 其他基础设施 |
| `jest` | [Jest 状元篇 — JS 测试框架的开箱即用](/study/projects/jest/) | 测试 / 验证 |
| `jimp` | [jimp](/study/projects/jimp/) | 图像处理 / Canvas |
| `jotai` | [jotai — atomic 状态管理 + Daishi Kato 第三套](/study/projects/jotai/) | 状态管理 |
| `js-joda` | [js-joda Java java.time API JS 端口](/study/projects/js-joda/) | 日期时间 |
| `koa` | [Koa async/await + ctx 对象 + 洋葱模型 极简 web 框架](/study/projects/koa/) | Web 框架 |
| `konva` | [Konva.js — Canvas 2D 的"DOM 化"图形框架](/study/projects/konva/) | 图像处理 / Canvas |
| `ky` | [ky 极简 fetch-based HTTP 客户端](/study/projects/ky/) | HTTP 客户端 |
| `kysely` | [Kysely TypeScript-first SQL Query Builder](/study/projects/kysely/) | ORM / DB 客户端 |
| `langfuse` | [Langfuse — LLM 应用的 Datadog，把 trace/eval/cost 做成基础设施](/study/projects/langfuse/) | AI 应用 / Agent 平台 |
| `lerna` | [lerna — JS monorepo 第一代工具，2022 EOL 后被 Nx 收编的代际故事](/study/projects/lerna/) | Monorepo / 包管理 |
| `lexical` | [lexical — Meta 把富文本拆成 immutable EditorState + 双缓冲 reconciler 的协议](/study/projects/lexical/) | 编辑器 / 富文本 |
| `librechat` | [LibreChat — 不是再做一个 ChatGPT 替代品，是把"chat 应用"和"模型供应商"解耦成可热插拔的 provider 抽象层](/study/projects/librechat/) | AI 应用 / Agent 平台 |
| `lightningcss` | [lightningcss — 把 CSS 当类型系统，用 Rust 一遍跑完 parse / transform / minify / prefix](/study/projects/lightningcss/) | 构建工具 / Bundler |
| `lingui` | [Lingui 编译期提取的 React i18n](/study/projects/lingui/) | i18n 国际化 |
| `lottie` | [lottie-web — 把设计师的 AE 工程变成跨端可渲染 JSON 的播放器](/study/projects/lottie/) | 动画 |
| `lucia` | [Lucia 状元篇 — auth 是 utility 不是 framework 的反命题](/study/projects/lucia/) | Auth 认证 |
| `luxon` | [luxon TZ + i18n 现代 Moment 替代](/study/projects/luxon/) | 日期时间 |
| `markdown-it` | [markdown-it CommonMark 兼容的可插拔 Markdown 解析器](/study/projects/markdown-it/) | Markdown / 解析 |
| `marked` | [marked regex-based 单文件 markdown 解析器](/study/projects/marked/) | Markdown / 解析 |
| `mcp-ts-sdk` | [MCP TypeScript SDK — 让 AI 调外部世界的最小契约](/study/projects/mcp-ts-sdk/) | AI 应用 / Agent 平台 |
| `micromark` | [micromark 流式 CommonMark 状态机解析器](/study/projects/micromark/) | Markdown / 解析 |
| `midscene` | [midscene — 不是 Playwright 升级版，是「自然语言 → 截图 + DOM → VLM 看图 → bbox → click」的反馈闭环框架](/study/projects/midscene/) | AI 浏览器自动化 |
| `mikro-orm` | [MikroORM DataMapper + Unit of Work + Identity Map](/study/projects/mikro-orm/) | ORM / DB 客户端 |
| `minisearch` | [minisearch — 把 Elasticsearch 那一整套，压成一个 27KB 浏览器文件](/study/projects/minisearch/) | 其他基础设施 |
| `mobx` | [MobX — Reactive state via TFRP](/study/projects/mobx/) | 状态管理 |
| `monaco-editor` | [monaco-editor — 把 VSCode 的编辑器内核搬进浏览器的 IDE 级控件](/study/projects/monaco-editor/) | 编辑器 / 富文本 |
| `motion-one` | [motion-one 状元篇](/study/projects/motion-one/) | 动画 |
| `msw` | [MSW — mock 不该改业务代码，应该在网络层透明拦截](/study/projects/msw/) | 测试 / 验证 |
| `nanobrowser` | [nanobrowser — 不是 cloud Chrome 的 AI agent，是把浏览器扩展当 sandbox 的 multi-agent runtime](/study/projects/nanobrowser/) | AI 浏览器自动化 |
| `nanostores` | [nanostores — 框架无关的 atomic 状态库（< 1 KB）](/study/projects/nanostores/) | 状态管理 |
| `nestjs` | [NestJS Angular 风格的企业级 Node.js 框架](/study/projects/nestjs/) | Web 框架 |
| `next-intl` | [next-intl Next.js App Router 专用 i18n](/study/projects/next-intl/) | i18n 国际化 |
| `nextra` | [Nextra — Next.js 上盖一层 docs 框架，吃 React 生态全套电池](/study/projects/nextra/) | 文档站点 |
| `nx` | [Nx — 跨框架 monorepo 的 generator/executor 范式](/study/projects/nx/) | Monorepo / 包管理 |
| `observable-plot` | [Observable Plot Grammar of Graphics in JS](/study/projects/observable-plot/) | 数据可视化 |
| `ofetch` | [ofetch — UnJS 现代 fetch 包装](/study/projects/ofetch/) | HTTP 客户端 |
| `ollama` | [ollama — 让本地 LLM 像 docker 一样易用的 Go 框架](/study/projects/ollama/) | AI 应用 / Agent 平台 |
| `oxc` | [oxc — Rust 写一整套 JS 工具链的勇气](/study/projects/oxc/) | 构建工具 / Bundler |
| `patchright` | [patchright — 给 Playwright 打 patch 让浏览器自动化在生产环境真正用得上](/study/projects/patchright/) | AI 浏览器自动化 |
| `penpot` | [Penpot — 用一个 Lisp 方言打穿前后端的自托管 Figma 替代](/study/projects/penpot/) | 数据应用 / SaaS |
| `pino` | [pino — 日志不该阻塞热路径](/study/projects/pino/) | 可观测 / 性能 |
| `pixi` | [PixiJS — WebGL 2D 渲染引擎的状元收官](/study/projects/pixi/) | 图像处理 / Canvas |
| `plane` | [Plane — 把 Linear 的体感、Jira 的覆盖、GitHub Projects 的开放，全部塞进一个 turborepo + Django](/study/projects/plane/) | 数据应用 / SaaS |
| `playwright` | [Playwright — 浏览器自动化的工程艺术](/study/projects/playwright/) | 测试 / 验证 |
| `pnpm` | [pnpm — 把 npm 的 flat node_modules 换成硬链接 + 内容寻址](/study/projects/pnpm/) | Monorepo / 包管理 |
| `postgres-js` | [postgres.js — 写 SQL 但更安全的 Node 客户端](/study/projects/postgres-js/) | ORM / DB 客户端 |
| `prisma` | [Prisma TypeScript-first 现代 ORM](/study/projects/prisma/) | ORM / DB 客户端 |
| `prom-client` | [prom-client — Node 监控的事实标准 SDK](/study/projects/prom-client/) | 可观测 / 性能 |
| `prosemirror` | [prosemirror — schema 不是配置项，是 contentEditable 的护身符](/study/projects/prosemirror/) | 编辑器 / 富文本 |
| `radix-ui` | [Radix Primitives — unstyled accessible 组件协议](/study/projects/radix-ui/) | 基础组件 / Headless UI |
| `react-hook-form` | [react-hook-form Uncontrolled-first React 表单库](/study/projects/react-hook-form/) | 表单 / Schema 校验 |
| `react-intl` | [react-intl FormatJS ICU MessageFormat 标准 i18n](/study/projects/react-intl/) | i18n 国际化 |
| `react-spring` | [react-spring 状元篇](/study/projects/react-spring/) | 动画 |
| `recharts` | [Recharts JSX 数据可视化组件库](/study/projects/recharts/) | 数据可视化 |
| `rolldown` | [rolldown — Vite 下一代打包引擎，Rust + oxc 重写 Rollup](/study/projects/rolldown/) | 构建工具 / Bundler |
| `rollup` | [rollup ESM-first 库打包器](/study/projects/rollup/) | 构建工具 / Bundler |
| `rspack` | [rspack — Rust 重写的 webpack，兼容 plugin 生态的 bundler](/study/projects/rspack/) | 构建工具 / Bundler |
| `sentry` | [Sentry — 不是「日志收集器」，是「把崩溃当作可查询的列存事件」的双层数据库错误监控平台](/study/projects/sentry/) | 可观测 / 性能 |
| `sequelize` | [Sequelize Node.js Promise-based ORM 元老](/study/projects/sequelize/) | ORM / DB 客户端 |
| `shadcn-ui` | [shadcn/ui — 把组件库变成"代码源 + CLI 包管协议"](/study/projects/shadcn-ui/) | 基础组件 / Headless UI |
| `sharp` | [sharp - libvips 之上的 Node 图像处理（S29-1）](/study/projects/sharp/) | 图像处理 / Canvas |
| `shiki` | [shiki TextMate Grammar 驱动的语法高亮](/study/projects/shiki/) | Markdown / 解析 |
| `stagehand` | [stagehand — Playwright + LLM 的混血框架，act/extract/observe 三 API 共用 a11y 树](/study/projects/stagehand/) | AI 浏览器自动化 |
| `starlight` | [Starlight — Astro 官方文档框架，零 JS 默认 + sidebar autogen](/study/projects/starlight/) | 文档站点 |
| `steel-browser` | [Steel Browser — 把 Chromium 包成 AI agent 用的 REST API](/study/projects/steel-browser/) | AI 浏览器自动化 |
| `storybook` | [Storybook — 给 UI 组件一个独立的工作台](/study/projects/storybook/) | 测试 / 验证 |
| `styled-components` | [styled-components — CSS-in-JS 鼻祖与运行时样式注入](/study/projects/styled-components/) | CSS / 样式 |
| `supabase` | [supabase — 不是另一个 Firebase 替代品，是把 Postgres 包成了完整 BaaS](/study/projects/supabase/) | 数据应用 / SaaS |
| `supertokens` | [SuperTokens — 自托管认证框架精读](/study/projects/supertokens/) | Auth 认证 |
| `swc` | [swc Rust-based JS/TS 编译器](/study/projects/swc/) | 构建工具 / Bundler |
| `swr` | [SWR — 同一问题的另一种回答](/study/projects/swr/) | 数据获取 / 路由 |
| `tailwind` | [Tailwind CSS — utility-first 怎么把 CSS 写法重写一遍](/study/projects/tailwind/) | CSS / 样式 |
| `tanstack-form` | [TanStack Form Headless 多框架表单库](/study/projects/tanstack-form/) | 表单 / Schema 校验 |
| `tanstack-query` | [TanStack Query — 服务端状态当成"独立物种"管](/study/projects/tanstack-query/) | 数据获取 / 路由 |
| `tanstack-router` | [TanStack Router — 把类型系统当 UX 工具](/study/projects/tanstack-router/) | 数据获取 / 路由 |
| `temporal-polyfill` | [Temporal API JavaScript 现代日期时间标准](/study/projects/temporal-polyfill/) | 日期时间 |
| `testing-library` | [Testing Library 状元篇 — 用户视角的 DOM 测试哲学](/study/projects/testing-library/) | 测试 / 验证 |
| `trpc` | [tRPC — 协议消失：函数即 API](/study/projects/trpc/) | 数据获取 / 路由 |
| `turbopack` | [Turbopack — 把 bundler 重做成增量计算应用](/study/projects/turbopack/) | 构建工具 / Bundler |
| `turborepo` | [Turborepo — 把 monorepo build 重做成 task graph + 双层 cache](/study/projects/turborepo/) | Monorepo / 包管理 |
| `typeorm` | [TypeORM Decorator-based ORM](/study/projects/typeorm/) | ORM / DB 客户端 |
| `unified` | [unified AST + plugin pipeline 通用文档处理框架](/study/projects/unified/) | Markdown / 解析 |
| `unstorage` | [unstorage — 让运行环境从代码里抹掉的 KV 抽象层](/study/projects/unstorage/) | 其他基础设施 |
| `valibot` | [valibot 模块化模式校验](/study/projects/valibot/) | 表单 / Schema 校验 |
| `valtio` | [valtio — 让 state.count++ 直接驱动 React 重渲染的 Proxy 状态库](/study/projects/valtio/) | 状态管理 |
| `vercel-ai` | [Vercel AI SDK — 把 LLM 调用产品化](/study/projects/vercel-ai/) | AI 应用 / Agent 平台 |
| `visx` | [visx Airbnb React 可视化原语](/study/projects/visx/) | 数据可视化 |
| `vite` | [Vite 现代前端构建工具](/study/projects/vite/) | 构建工具 / Bundler |
| `vitepress` | [VitePress — Vue + Vite 文档框架，零 framework 重负的 SSG](/study/projects/vitepress/) | 文档站点 |
| `vitest` | [Vitest — 测试工具如果跟开发用同一个工具栈会怎样](/study/projects/vitest/) | 测试 / 验证 |
| `vue-i18n` | [vue-i18n Vue 官方推荐 i18n](/study/projects/vue-i18n/) | i18n 国际化 |
| `web-vitals` | [web-vitals — 不是「测速工具」，是把 Chrome UX Report 的指标定义在浏览器端等值复刻的协议库](/study/projects/web-vitals/) | 可观测 / 性能 |
| `webpack` | [webpack 现代前端工程化奠基](/study/projects/webpack/) | 构建工具 / Bundler |
| `why-did-you-render` | [why-did-you-render — 把 React 的"假更新"从口头警告变成可定位的诊断对象](/study/projects/why-did-you-render/) | 可观测 / 性能 |
| `wretch` | [wretch — fluent FP fetch wrapper](/study/projects/wretch/) | HTTP 客户端 |
| `xstate` | [XState — 把状态画成图](/study/projects/xstate/) | 状态管理 |
| `yjs` | [yjs — collaborative editing 不应该锁住编辑器，CRDT 抽象层让任何编辑器都能接](/study/projects/yjs/) | 编辑器 / 富文本 |
| `zod` | [zod TypeScript-first 模式校验](/study/projects/zod/) | 表单 / Schema 校验 |
| `zustand` | [zustand — 101 行核心的"反 Provider 派"状态管理](/study/projects/zustand/) | 状态管理 |
