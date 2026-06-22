# Dogfood：LangGraph 教学站从 0 到 1（fresh agent 视角）

> 验收日期：2026-05-31
> 角色：从未读 study 笔记 / 反馈环 / dossier 的 fresh agent
> 可查范围：`/tmp/lens-experiment-v4/lens-*.md` + `/tmp/lens-experiment-v4/paradigm/`
> 项目：LangGraph 教学站（零基础读者，多 provider，5-8 工具，流式 UI，≤ 50 美元/月，嵌 50 段视频）

## 第一观察

cookbook 只有 4 个 lens：aieng / backend / data / devops。**没有 frontend lens**。这对一个"教学站"项目是结构性缺口——前端就是产品本体。

---

## 步骤 1：项目骨架

- task：选 monorepo 还是 split repo？前端框架是什么？
- cookbook_consulted：grep 全部 lens 找 Next.js/React/Vue/SSR/SSG。命中只有 lens-aieng "Vercel AI SDK — TS 进程内 — Next.js 触发"，lens-backend 候选表里 "Hono — Edge — Workers/Bun"。
- decision：Next.js（App Router）单仓 + monorepo。理由：lens-aieng 把 Vercel AI SDK 跟 Next.js 钉死，且后端可以塞进同一个 Next.js 的 route handlers。
- verdict：cookbook_partial
- gap_description：完全没有 frontend lens，"教学站"这种内容型站点的 SSG vs SSR vs ISR 选择没有任何参照；"零基础读者要看视频 + 跑代码"的页面架构无 ADR。我只是从 aieng 旁注里反推了 Next.js。

## 步骤 2：多 provider router（Claude + DeepSeek）

- task：怎么把 Claude 和 DeepSeek 封到统一调用面？
- cookbook_consulted：lens-aieng §1 铁律 2、§2 候选表（LiteLLM/OpenRouter/Vercel AI SDK）、§3 ADR-2 Router 双轨。
- decision：用 Vercel AI SDK（TS 进程内），因为骨架已经定 Next.js。理由：ADR-2 明说"TS Vercel AI SDK；Py LiteLLM；不混"。
- verdict：cookbook_sufficient
- gap_description：无。ADR-2 直接命中决策。

## 步骤 3：agent 编排框架

- task：5-8 个工具 + 多步推理 + HITL（教学场景里学生可能要中断 / 改 prompt），用什么编排？
- cookbook_consulted：lens-aieng §1 铁律 1、§3 ADR-1、§4 决策树 Q1。
- decision：LangGraph。理由：ADR-1 "多 step + tool + HITL + 跨 provider" 直接对应；不锁 OpenAI 也不锁 Claude。但站点是 TS，LangGraph 主力是 Py——这是个问题。
- verdict：cookbook_partial
- gap_description：lens-aieng 默认 LangGraph(Py)，但项目骨架是 Next.js(TS)。LangGraph.js 的成熟度、与 Vercel AI SDK 在同一 Next.js route 内组合的姿势、何时该把 agent loop 拆出去做独立 Py 服务——cookbook 里完全没说。决策树 Q1 没区分语言栈。

## 步骤 4：工具（tool）怎么暴露给 agent

- task：5-8 工具含代码执行 / 文档检索 / 跑测试。要走 MCP 还是直接函数 schema？
- cookbook_consulted：lens-aieng §1 铁律 4、§2 候选表（MCP SDK / stdio / Streamable HTTP）、§4 决策树 Q4。
- decision：本地代码执行用 stdio MCP（沙箱化）；文档检索做成 in-process function tool（直接 Vercel AI SDK 的 tool() 注册）；跑测试走远端 Streamable HTTP MCP。理由：Q4 "本地 stdio / 远端 Streamable HTTP" 直接判。
- verdict：cookbook_sufficient
- gap_description：无大缺口。但"代码执行沙箱"具体用 Pyodide/Deno/E2B/微 VM 哪个，cookbook 没说——可能属于 ai-safety 或 sandbox lens 才有的内容。

## 步骤 5：流式 UI（thinking + tool_use 实时展开）

- task：怎么把 LLM 流式输出 + tool_use 实时渲染到 React？
- cookbook_consulted：grep "stream" "SSE" "useChat" 全部 lens。命中 lens-aieng 候选表 "hold：旧 SSE"，没有正向条目；其他 lens 零相关。
- decision：用 Vercel AI SDK 的 useChat + Data Stream Protocol。理由：跟步骤 2 一致；但完全是从 SDK 文档外推，cookbook 没指引。
- verdict：cookbook_missing
- gap_description：流式 UI 是 AI app 头号 UX 决策点。cookbook 完全没覆盖：useChat vs RSC streaming vs 自己 SSE、tool_use partial 渲染策略、thinking 块的折叠交互、断流恢复、partial JSON parse。frontend lens 缺位 + aieng lens 没把 UI 流当成 ADR。

## 步骤 6：教学视频（10min × 50 段）存哪

- task：500 分钟视频要嵌进站点，预算紧。
- cookbook_consulted：grep "video" "媒体" "对象存储" "S3" "CDN" "Cloudflare R2" 全部 lens 与 paradigm/。零命中。
- decision：Cloudflare R2 + Stream（HLS）。理由：50 美元/月预算下 R2 免出流量费是常识，但完全不来自 cookbook。
- verdict：cookbook_missing
- gap_description：data lens 只覆盖向量库 / 仓库 / CDC，不覆盖对象存储 / 视频 / CDN / 媒体编码。devops lens 也没 CDN/edge media。这是教学站最贵的一块成本，没决策树等于裸奔。

## 步骤 7：DB 选什么

- task：站要存：用户进度、对话历史、检索文档 chunk、视频元数据。
- cookbook_consulted：lens-backend §1 铁律 1+4、§3 ADR-1 + ADR-3、§4 决策树 Q1；lens-data §3 ADR-1（pgvector）。
- decision：单 Postgres（Neon serverless）+ pgvector + Drizzle ORM。理由：backend ADR-1 "默认 Postgres" + ADR-3 "新 TS 用 Drizzle" + data ADR-1 "<10M 向量+已 PG → pgvector"。一站式。
- verdict：cookbook_sufficient
- gap_description：无。三个 ADR 完美串起来。Neon 是 backend lens provider_coverage_checklist 里点名的"托管"。

## 步骤 8：部署在哪（≤ 50 美元/月）

- task：Next.js + 一个 LangGraph.js worker + Postgres + 视频 + 50 美元 cap。
- cookbook_consulted：lens-devops §1 铁律 1（多机→K8s/<3 服务→Compose）、§4 决策树 Q1；grep "Vercel" "Cloudflare" "Fly" "Render" "serverless"。命中 paradigm 零、devops 候选表只有 K8s/Compose/Nomad/ECS/Lambda/Cloud Run（其中 Lambda/Cloud Run 在 hardware_assumption 提到但没进候选）。
- decision：Vercel（Next.js 前端 + edge route）+ Neon（PG）+ Cloudflare R2/Stream（视频）。理由：50 美元月预算下 K8s/Compose 都是亏钱方案；但这个组合 cookbook 里没有。
- verdict：cookbook_misled
- gap_description：devops lens 的 hardware_assumption 写"单云起步，混 GPU/CPU；K8s 1.28+"，对零运维 / serverless 教学站完全不适用。决策树 Q1 第一刀就是 K8s vs Compose，把 Vercel/Cloudflare/Fly/Railway 这类 platform-as-a-service 整个跳过。会把 fresh agent 引到杀鸡用牛刀的方案。

## 步骤 9：鉴权（教学站学生登录、保存进度）

- task：用户登录方案。
- cookbook_consulted：lens-backend §1 铁律 2、§3 ADR-2 鉴权 server session、§4 决策树 Q3。
- decision：Auth.js (NextAuth) + server session 存 Postgres。理由：ADR-2 "Web cookie+server session"。
- verdict：cookbook_partial
- gap_description：ADR-2 给方向对的，但没说 TS 生态具体用 Auth.js / Lucia / Clerk / WorkOS 哪个。backend lens hold 列表里有 Lucia，没解释为啥 hold；Clerk 在 provider_coverage_checklist 但没进候选表。

## 步骤 10：观测（trace + 错误）

- task：教学站怎么收 LLM trace + 前端错误？
- cookbook_consulted：lens-aieng §1 铁律 7（PR promptfoo + 线上 trace + 1% 回流）+ 候选表 LangSmith；lens-devops §3 ADR-3 OTel→Prom/Tempo/Sentry。
- decision：LangSmith（LLM trace，免费档够 50 美元预算）+ Sentry free tier（前端错误）。理由：aieng 候选表 "LangSmith — adopt — online trace — LangGraph"。
- verdict：cookbook_sufficient
- gap_description：无大缺口。devops ADR-3 全自建对小项目 overkill，但 aieng 候选表救场。

---

## 汇总

### cookbook_hit_rate
10 步里 9 步至少 grep 到一条相关条目（步骤 6 视频 100% 零命中）。
**hit_rate = 9/10 = 0.9**

### cookbook_useful_rate
sufficient = 步 2、4、7、10 → 4 步
partial = 步 1、3、9 → 3 步
missing = 步 5、6 → 2 步
misled = 步 8 → 1 步
**useful_rate = 4/10 = 0.4**

### fresh_agent_blockers（卡 ≥ 1 分钟的具体点）

1. **步骤 1 骨架**：没 frontend lens，反复在 aieng 找前端线索浪费时间。教学站这种内容型站点 SSR vs SSG vs ISR 没有任何指引。
2. **步骤 3 LangGraph 语言栈错配**：cookbook 默认 LangGraph(Py)，但骨架定 Next.js(TS)。"是不是该把 agent 拆 Py 服务" 没有判据。
3. **步骤 5 流式 UI**：grep stream 几乎零命中，只能从 SDK 文档外推。tool_use partial 渲染、thinking 折叠交互这种 AI app 标配 UX 完全无 ADR。
4. **步骤 6 视频存储**：data lens 不管对象存储，devops 不管 CDN，预算最重的一块完全裸奔。
5. **步骤 8 部署**：devops lens 的 hardware_assumption 把"小项目零运维"整个排除，决策树第一刀就跳到 K8s。差点选错方向。

### must_fix_for_cookbook_v6

1. **新增 lens-frontend**（最紧迫）：覆盖 React/Next.js/Vite/Svelte 的 SSR/SSG/ISR/CSR 决策树、流式 UI（useChat / RSC streaming / 自建 SSE）、tool_use 渲染、thinking 折叠 UX、partial JSON、断流恢复。
2. **lens-aieng 加 ADR-5 LangGraph 语言栈**：TS 项目什么时候用 LangGraph.js 直接嵌、什么时候拆 Py 后端服务，决策点是工具复杂度 / HITL 频率 / Py 工具生态依赖度。
3. **lens-devops 扩 hardware_assumption**：把 "Vercel/Cloudflare/Fly/Railway/Render 这类 PaaS" 加进候选表，决策树 Q1 之前加一刀 "项目 < 50 美元/月 + 单团队 → 跳过 K8s/Compose 走 PaaS"。
4. **新增 lens-media-storage**（或 data lens 扩段）：对象存储（S3/R2/B2）、视频（HLS/DASH、Mux/Stream/Bunny）、CDN（CF/Fastly）、图片（imgix/CF Images）的成本-延迟-控制权三角决策树。
5. **lens-backend 候选表补 Auth 选型**：Auth.js / Lucia / Clerk / WorkOS / Supabase Auth 各自触发条件，hold 给 Lucia 的理由。
6. **lens-aieng 加"代码执行沙箱"小节**：Pyodide / Deno / E2B / Firecracker 选型；agent tool 里的 code-interpreter 不该靠 fresh agent 自己 google。

### verdict

**cookbook_partially_works**

理由：在 aieng × backend × data 三个传统后端 + AI 决策上 cookbook 表现强（步 2/4/7/10 全 sufficient，ADR 串得很顺），但前端 / 流式 UI / 媒体存储 / PaaS 部署四块结构性缺位，对一个"AI 教学站"这种典型现代 webapp 项目，10 步里 3 步 missing/misled。fresh agent 能走完，但有 3 处需要跳出 cookbook（步 5/6/8），且步 8 还差点被 misled 选错部署。**v6 必须补 frontend lens 和 PaaS / 媒体决策树，否则不能说"够支撑真新项目"。**
