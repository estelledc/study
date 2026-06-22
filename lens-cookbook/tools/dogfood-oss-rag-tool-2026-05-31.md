# Dogfood v6 第四轮：OSS RAG 调试工具场景（fresh agent 视角）

> 日期：2026-05-31
> 角色：未读任何前 3 轮 dogfood / dossier / 反馈环的 fresh agent
> 可查范围：`/v6/lens-*.md` + `/v6/paradigm/`
> 项目：开源 OSS 工具，单人维护，零预算 — CLI + 后台 web dashboard，给开发者本地调试 RAG（向量库可视化 / 检索质量评估 / cost 估算）；跨平台 Mac/Linux/Win；用户自己跑（不托管），需 SQLite + 本地嵌入模型 + 离线模式；目标 GitHub star + 清晰文档站

## 第一观察

v6 共 7 个 lens：frontend / backend / aieng / data / devops / media-storage / vllm。本场景反向打：

- 不是"我有云预算搭多大基础设施"，而是"用户在自己机器上跑，我连服务器都没有"。
- 不是"团队 ≤3 → PaaS"，而是"团队 = 1 + 用户 = 任意人 + 部署 = npm i / brew install"。
- 决策树 Q0 全是"成本/规模门"，本场景"成本 = 0、规模 = 单机"——直接打到所有 lens Q0 的最左叶子，但叶子下面**没有继续展开**。

这一轮假设很多："本地 / 嵌入式 / 单文件分发 / 跨平台 binary / 离线"，是 cookbook 没专门切过的横切面。

---

## 步骤 1：CLI 框架（commander vs oclif vs 自写）

- task：选 Node CLI 框架。
- cookbook_consulted：grep `cli / commander / oclif / yargs / clap` 全 0；lens-frontend / lens-backend 候选表无 CLI 工具栈。
- decision：commander.js（轻量 + ts-node 即可跑）。完全跳出 cookbook。
- verdict：missing
- gap_description：**CLI 框架是真盲区**。OSS 开发者工具最常见骨架就是 CLI，cookbook 7 个 lens 全无 CLI 候选。**v7 must_fix：lens-frontend 或新建 lens-devtool 加 §"CLI 框架"段（commander / oclif / yargs / clipanion / clap），ADR 给"轻命令树/插件化/REPL/Ink TUI"四档判据**。

## 步骤 2：dashboard SSR vs 静态

- task：CLI 起 `mytool dashboard --port 3000` 拉一个 web UI，本地查看。
- cookbook_consulted：lens-frontend Q0/Q1/ADR-1。
- decision：Vite + React SPA，CLI 用 fastify 跑本地 server 静态 serve dist，访问 `localhost:3000`。理由：Q0 "月预算 <$100 且 QPS<5 → 静态导出+CDN"——把"CDN"换成"localhost"语义最近。Astro/Next 都嫌重（用户机器要起 SSR runtime，跨平台 binary 体积爆）。
- verdict：partial
- gap_description：lens-frontend ADR-1 默认场景"营销+控制台"双站；本场景是"嵌在 CLI 里的本地 dashboard"——没有这个 archetype。SPA + 本地 server 是合理倒推但 cookbook 没显式锚。**v7：lens-frontend ADR-1 加反例"嵌入本地工具的 dashboard → SPA + 本机静态 serve，不上 RSC/SSR"**。

## 步骤 3：本地嵌入模型（Transformers.js / llama.cpp / Ollama）

- task：用户离线跑 embedding，怎么选。
- cookbook_consulted：lens-vllm Q0 "QPS<10 且单卡 4090/3090 → ollama / llama.cpp"；lens-aieng 全文无 embedding 本地化候选。
- decision：默认 Transformers.js（同进程 ONNX，零额外服务，跨平台开箱）；用户已装 Ollama 则走 Ollama embed API；llama.cpp 给重度玩家 advanced。
- verdict：partial
- gap_description：lens-vllm Q0 的 ollama/llama.cpp 是**生成模型**语境，本场景要的是 **embedding 本地化**（bge-small / nomic-embed / e5）。cookbook 完全没 Transformers.js / fastembed / sentence-transformers 的候选。**v7：lens-aieng 加 §"本地 embedding"段（Transformers.js / fastembed / Ollama embed / llama.cpp embedding，触发条件"离线 / 隐私 / 零运行成本"）**。

## 步骤 4：向量库（嵌入式 sqlite-vss / lancedb / chroma local）

- task：用户机器上没有 PG，向量库要单文件嵌入。
- cookbook_consulted：lens-data ADR-1（pgvector）+ 候选表（Qdrant/Milvus/Weaviate/Chroma hold）+ 决策树 Q1 "<1M→Q2 已 PG？Y→pgvector"。
- decision：LanceDB（Rust + 单文件 + Node binding + Arrow 原生）兜底；fallback sqlite-vss（用户已有 SQLite 时复用）。
- verdict：missing
- gap_description：**lens-data 整章假设"已经有 PG 服务器或愿意起 Docker"**。Chroma 还被 hold（"信号弱、社区放缓"），但 Chroma local mode 恰恰是 OSS 工具最常用的零依赖向量库——cookbook 的 hold 判据是 SaaS 视角下的，对嵌入式场景反向。LanceDB / sqlite-vss / sqlite-vec 全无。**v7 must_fix：lens-data ADR-1 加分支"无 PG 且单机嵌入式 → LanceDB / sqlite-vec / Chroma local 选型"，把 Chroma 从 hold 拆成"SaaS hold / 嵌入式 trial"**。

## 步骤 5：跨平台打包（pkg / Bun compile / Electron）

- task：分发给 Win/Mac/Linux 用户，不要让对方先装 Node。
- cookbook_consulted：lens-devops 候选表 + 决策树 Q0/Q1/Q2 + ADR-1 全文 grep `pkg / bun compile / sea / nexe / electron / tauri`：0 命中。
- decision：Bun compile（单 binary 三平台 + 体积可控）；npm 包并行发布给 `npx mytool` 路径。
- verdict：missing
- gap_description：lens-devops 完全聚焦"server 端部署"（PaaS / K8s / Compose / Slurm），**OSS 桌面/CLI 工具的分发链路（npm publish / homebrew tap / scoop bucket / Bun compile / pkg / Tauri / Electron）一字未提**。**v7 must_fix：lens-devops 加 §"OSS 工具分发"段（npm/brew/scoop + Bun compile/pkg/Tauri/Electron 选型 + signing 公证一句话清单）**。

## 步骤 6：文档站（Astro / VitePress / Mintlify）

- task：写 docs.mytool.dev 拿 GitHub star。
- cookbook_consulted：lens-frontend 候选表 Astro adopt "内容站零 JS"；ADR-1 把 Astro 锚在"营销站"语义。
- decision：VitePress（Vue 生态文档站事实标准 + Vite 极简 + 暗黑切换/搜索内置 + 部署 GH Pages）。理由：本项目无 React/Vue 业务约束，VitePress 更适合纯文档；Astro 也能做但要装 starlight。Mintlify 拒（要付费 / 托管锁定 / OSS 不友好）。
- verdict：partial
- gap_description：lens-frontend 把 Astro 当文档/内容唯一答案，未把 **VitePress / Docusaurus / Starlight / Nextra / Mintlify** 切成专门 ADR。"OSS 项目文档站"是高频需求。**v7：lens-frontend 加 ADR "技术文档站选型"（VitePress / Docusaurus / Starlight / Nextra，触发条件"GitHub OSS / API reference / 多语言"）**。

## 步骤 7：离线 LLM cost 估算（aieng router 节点？）

- task：本地 RAG 调试时估算"如果走 OpenAI/Claude/DeepSeek 这条 prompt 多少钱"。
- cookbook_consulted：lens-aieng ADR-2 Router（LiteLLM / Vercel / OpenRouter）+ open_questions"router cache/reasoning tokens 字段口径"。
- decision：自己维护 model→pricing 表 + tiktoken/anthropic-tokenizer 离线算 token；不接真 API。
- verdict：partial
- gap_description：ADR-2 都是"运行时路由"语境，本场景要的是**离线纸面估算**——没有 API 调用、纯本地算 token × 价格。cookbook 隐含假设"要算 cost 必先发请求"。**v7：lens-aieng ADR-2 加分支"离线估算 → tiktoken / model-pricing 表 / litellm.completion_cost dry-run"**。次级缺口。

## 步骤 8：数据持久化（SQLite + Drizzle / Prisma）

- task：CLI 本地存 session / project / eval 历史，用 SQLite。
- cookbook_consulted：lens-backend ADR-1 Postgres（拒 SQLite 隐含）+ ADR-4 Drizzle（"新 TS 用 Drizzle"，但 ORM 语境是 server）；lens-mobile ADR-2 op-sqlite + drizzle（最近的锚但 RN 语境）。
- decision：better-sqlite3（Node 同步 API 最稳）+ Drizzle ORM。理由：Drizzle 支持 sqlite dialect + 同步驱动 + ts schema 一处定义；Prisma 在 CLI 工具里太重（体积 + 启动慢 + binary 跨平台坑）。
- verdict：partial
- gap_description：lens-backend ADR-1 把 SQLite 当反例（"中等量需事务+JSON+向量 → PG"），但 OSS CLI 工具天然是 SQLite。lens-mobile 才有 sqlite 锚但是手机语境。**v7：lens-backend ADR-1 加分支"单机/嵌入式 → SQLite + better-sqlite3 / libsql / turso 选型"，ADR-4 Drizzle 段加"sqlite dialect 同样适用"**。

## 步骤 9：CI / Release（goreleaser / semantic-release / changesets）

- task：每次 push 自动测 + 多平台 binary + npm publish + GH release notes。
- cookbook_consulted：lens-devops "GH Actions adopt"；ADR 全无 release 相关。grep `goreleaser / semantic-release / changesets / release-please`：0。
- decision：changesets（monorepo 式版本管理 + npm publish 自动）+ Bun compile binary 上传 GH Release artifact + release-please 写 changelog。
- verdict：missing
- gap_description：**release 链路完全空白**。OSS 项目几乎都要 changesets / semantic-release / release-please / goreleaser 之一。**v7 must_fix：lens-devops 加 §"OSS Release 流程"段（changesets / semantic-release / release-please / goreleaser 选型 + GH Actions matrix build + npm provenance + GH Release artifact）**。

---

## 汇总

### cookbook_hit_rate

9 步中 6 步至少命中一条 lens（步 2/3/4/6/7/8）；步 1/5/9 是 0 命中。**hit_rate = 6/9 = 0.67**（前 3 轮分别为 0.9 / 1.0 / 1.0；首次明显回落）。

### cookbook_useful_rate

- sufficient：0
- partial：2、3、6、7、8 = 5 步
- missing：1、4、5、9 = 4 步
- misled：0
- **useful_rate = 5/9 ≈ 0.56**（按 partial=0.5 计 ≈ 5×0.5/9 ≈ 0.28；宽口径 partial 算"有用"则 5/9）

### generalization_score

3（满分 5）。理由：v6 的 7 lens 围绕"团队在云上跑业务"建模；本场景"单人/零预算/本地分发/离线"暴露了一整片横切盲区——**OSS 桌面/CLI 工具栈**。

### fresh_agent_blockers

1. **CLI 框架** — 0 命中（步 1）。
2. **跨平台打包/分发** — 0 命中（步 5）。
3. **OSS Release 流程** — 0 命中（步 9）。
4. **嵌入式向量库** — lens-data 把 Chroma hold、无 LanceDB/sqlite-vec（步 4）。
5. **本地 embedding 模型** — lens-aieng/lens-vllm 都只到生成模型本地化（步 3）。
6. **嵌入式 SQLite 持久化** — lens-backend ADR-1 反指 PG（步 8）。
7. （次级）VitePress/Starlight 类技术文档站未独立 ADR（步 6）。
8. （次级）离线纸面 cost 估算未在 ADR-2 分支（步 7）。

### must_fix_for_v7

高优（OSS 工具骨架核心断点）：

1. **新增 lens-devtool 或 lens-frontend 加 §"CLI 框架"** — commander / oclif / yargs / clipanion + Ink TUI 选型。
2. **lens-devops 加 §"OSS 工具分发"** — npm/brew/scoop + Bun compile / pkg / Tauri / Electron + signing 公证。
3. **lens-devops 加 §"OSS Release 流程"** — changesets / semantic-release / release-please / goreleaser + matrix build + npm provenance。
4. **lens-data ADR-1 加嵌入式分支** — LanceDB / sqlite-vec / Chroma local；把 Chroma 拆"SaaS hold / 嵌入式 trial"。
5. **lens-aieng 加 §"本地 embedding"** — Transformers.js / fastembed / Ollama embed / llama.cpp embedding。

中优：

6. **lens-backend ADR-1 加单机分支** — SQLite + better-sqlite3 / libsql / turso；ADR-4 Drizzle 标 sqlite dialect 适用。
7. **lens-frontend 加 ADR "技术文档站"** — VitePress / Docusaurus / Starlight / Nextra / Mintlify。
8. **lens-aieng ADR-2 加离线估算分支** — tiktoken + pricing 表 + litellm.completion_cost dry-run。

低优：

9. lens-frontend ADR-1 加反例"嵌入本地工具的 dashboard → SPA + 本机 serve"。

### verdict

**cookbook_partially_works**

理由：9 步 0 sufficient、5 partial、4 missing、0 misled。即使所有命中段都给对了"哪里查"，但**没有一步是直接照抄 cookbook 就能落地的**——每一步都需要 fresh agent 在 cookbook 边缘自决。决策树 Q0 成本/规模门在本场景全部命中"最便宜"叶子，但叶子下没继续给嵌入式/单机/分发的子树。**hit_rate 0.67 是 4 轮以来最低**——证明 v6 的"7 lens × 云端业务"建模有明确边界，OSS 桌面/CLI 工具是**第二大类未覆盖骨架**（第一是 SaaS 工具站盲区已在第 3 轮暴露）。

### comparison vs 前 3 轮 dogfood

| 维度 | v4 LangGraph | v6 LangGraph | v6 SaaS dashboard | v6 OSS RAG 工具（本轮） |
|---|---|---|---|---|
| 步数 | 10 | 10 | 9 | 9 |
| hit_rate | 0.9 | 1.0 | 1.0 | **0.67** |
| useful_rate | 0.4 | 1.0 | 0.67 | **0.56**（宽口径） |
| sufficient | 4 | 10 | 6 | **0** |
| partial | 3 | 0 | 1 | 5 |
| missing | 2 | 0 | 2 | **4** |
| misled | 1 | 0 | 0 | 0 |
| 主要缺口 | 流式 UI / 视频 / 部署 | 无 | PDF / 邮件 / 大文件上传 | **CLI / 打包 / Release / 嵌入式向量库 / 本地 embed** |
| 场景类型 | 教学站 | 教学站 | SaaS 工具站 | OSS 桌面工具 |
| generalization_score | — | — | — | 3/5 |

**关键观察**：

- **决策树 Q0 在 4 轮全部命中**——v6 paradigm "首层成本/规模门"是真正立得住的设计。但门后的子树仅覆盖"云端业务"语义，碰到"零成本 + 本地分发"就只能落到 Q0 的最左叶子，下面是空地。
- **lens 拓扑随场景类型出现锯齿**：v6 LangGraph 站 1.0、SaaS 0.67、OSS 工具 0.56——cookbook 在它训练的语义空间内（agent / 流式 / 视频 / SaaS 多服务）非常稳，但是**每跨一种骨架就会暴露一片新盲区**。
- **第 0 个 sufficient**——这是 4 轮以来最严重的信号。前 3 轮至少一半步骤能直接照抄；本轮全靠 fresh agent 自决，cookbook 仅起"指向哪个 lens 的边缘"作用。
- **v7 收口策略**：与其继续往 7 lens 内塞段，不如**新增 lens-devtool 横切层**（CLI / 打包 / Release / 离线 / 单机）+ 把 lens-data / lens-backend / lens-aieng 的"嵌入式分支"分别加进去。否则 v7 dogfood 用第 5 类骨架（hardware/embedded？mobile native？）测一遍还会再掉一档。
