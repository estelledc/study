# Dogfood v6 OSS RAG 调试工具 v2（lens-devtool + 嵌入式分支补完后）

> 日期：2026-05-31
> 角色：未读任何前轮 dogfood / dossier 的 fresh agent
> 可查范围：`/v6/lens-*.md`（含新 `lens-devtool.md`，含 backend/data/aieng 扩段）+ `/v6/paradigm/`
> 项目骨架：与 v1 完全一致 — 开源工具，CLI + 后台 web dashboard，给开发者本地调试 RAG，单人维护，跨平台 Mac/Linux/Win，本地嵌入，离线模式，文档站，预算 0
> v1 基线：useful_rate 0.56，hit_rate 0.67，0 sufficient

## 第一观察 vs v1

v6 现在 8 个 lens：frontend / backend / aieng / data / devops / media-storage / vllm + **新 devtool**。lens-devtool 的 hardware_assumption 直说"个人/1-2 人开源；横切层（CLI/单二进制/含 LLM 本地工具）；零托管；用户=hacker；预算 $0-20/月"——和本场景一一对齐。决策树 Q0 直接给"成本-gate：个人/1-2 人+0 预算+不托管 → 单机栈（Ollama+sqlite-vss+commander+Bun compile+GH Release+VitePress on Pages）"——这条主路径几乎把 9 步 OSS 工具骨架的脊柱一句话画完。

v1 暴露的"决策树最左叶子下没东西"问题，lens-devtool 直接补上了那块空地。

---

## 步骤 1：CLI 框架（commander vs oclif vs 自写）

- task：选 Node CLI 框架。
- cookbook_consulted：lens-devtool §候选表 + ADR-1。
- decision：commander.js（本工具命令数估计 ≤15，冷启重要 → ADR-1 默认分支）；规模膨胀到 ≥30 子命令再迁 oclif。
- verdict：**sufficient**
- 命中：lens-devtool ADR-1 "≤20 命令+冷启 30ms=commander；≥30+插件+auto-update=oclif。Go=cobra，Py=Click"。candidates 表和决策树 Q2 都点到。回滚条件（每命令 ~1h）也写了。
- v1→v2：v1 0 命中 missing，v2 直接 sufficient。

## 步骤 2：dashboard SSR vs 静态

- task：CLI 起 `mytool dashboard --port 3000` 拉本地 web UI。
- cookbook_consulted：lens-frontend Q0/Q1/ADR-1（未在本轮扩段）。
- decision：Vite + React SPA + CLI 内置静态 server，用本机 fastify 起本地端口 serve dist。
- verdict：**partial**
- gap：lens-frontend 默认场景是"营销+控制台双站"，没把"嵌在 CLI 里的本地 dashboard"当显式 archetype。Q0 的"月预算<$100+QPS<5 → 静态导出+CDN"还是要 fresh agent 把 CDN 心智换成 localhost。
- v1→v2：v1 partial → v2 仍 partial（lens-frontend 这一段未扩，预期内）。

## 步骤 3：本地嵌入模型

- task：用户离线跑 embedding（bge-small / nomic-embed / e5）。
- cookbook_consulted：lens-aieng §"离线 LLM 调用（不走 cloud router）"+ ADR-7 + lens-devtool §候选表（Ollama/llama.cpp/Transformers.js/mlx/candle 共表）。
- decision：默认 Ollama（一行 `ollama pull nomic-embed-text` + REST API + OpenAI 兼容客户端 reuse）；前端纯客户端场景换 Transformers.js；M 系列重度玩家 mlx；嵌二进制 → llama.cpp。
- verdict：**sufficient**
- 命中：lens-aieng ADR-7 "默认 Ollama；前端纯客户端 → Transformers.js；M 系列极致性能 → mlx；Rust 二进制嵌入 → llama.cpp/candle"——5 候选 ring/触发条件齐全。trigger "无 API key、本地推理、隐私优先（笔记应用 / 本地 CLI / 边缘）" 几乎是本场景原话。
- v1→v2：v1 partial（aieng 全文无本地 embedding）→ v2 sufficient。
- 小注：ADR-7 措辞偏向"生成 LLM"，但触发条件覆盖 embedding 同语义；候选表 Ollama/llama.cpp 都对外暴露 embedding endpoint，可用。如果未来想再压一档可以单切"本地 embedding 子表"，但当前不必。

## 步骤 4：向量库（嵌入式）

- task：用户机器无 PG，向量库要单文件嵌入式。
- cookbook_consulted：lens-data §"嵌入式向量库（embedded vector store）"+ ADR-5 + 决策树 Q0.5。
- decision：< 100k 向量起步用 sqlite-vss（与 better-sqlite3 同库 + 单文件备份）；规模上去后迁 LanceDB；已有 DuckDB 用户走 DuckDB-VSS。
- verdict：**sufficient**
- 命中：lens-data ADR-5 触发 "应用是单机 / CLI / 桌面工具，无 server，向量 < 100k，离线运行" 完全对齐；候选表 5 行（sqlite-vss / LanceDB / Chroma local / DuckDB-VSS / pgvector embedded）+ ring/立场/触发齐全；决策树 Q0.5 "是否单机部署（无 server）→ Y → sqlite-vss(ADR-5)" 给出主路径；rollback "破 100k 或 P99 > 100ms 持续 1h → 导出 parquet 迁 LanceDB" 给量化阈值。
- v1→v2：v1 missing（v1 主结论是 LanceDB + Chroma 被错误 hold）→ v2 sufficient。

## 步骤 5：跨平台打包

- task：分发给 Win/Mac/Linux 用户，不让对方先装 Node。
- cookbook_consulted：lens-devtool §候选表（Bun compile / Deno compile / pkg）+ ADR-4 + ADR-5。
- decision：Bun compile 五平台 matrix（darwin-arm64 / darwin-x64 / linux-x64-musl / linux-arm64 / windows-x64）+ minify=true + bytecode=true。fallback 给 npx 包并行。
- verdict：**sufficient**
- 命中：lens-devtool ADR-4 直接给 production 参数 `compile_targets / minify=true / bytecode=true / sourcemap=external`；rationale 含"五平台 99%；minify 减 30%；bytecode 启动 80→55ms；用 bun:sqlite 替 bs3 保单二进制"；GH Release 体积估 ~250MB / CI 5 job × 2min。ADR-5 给 GUI 升级路径（CLI → Tauri → Electron Win 兜底）。
- v1→v2：v1 missing（lens-devops 全无 OSS 分发）→ v2 sufficient（lens-devtool 接管）。

## 步骤 6：文档站

- task：写 docs.mytool.dev 拿 GitHub star。
- cookbook_consulted：lens-devtool §候选表（VitePress adopt / Starlight adopt / mdBook adopt）+ 决策树 Q6。
- decision：VitePress（无 React/Vue 业务约束 + Vite 极简 + 部署 GH Pages 内置）。多语言再换 Starlight；Rust 工具线换 mdBook。
- verdict：**sufficient**
- 命中：lens-devtool 决策树 Q6 "Vue→VitePress；多语言→Starlight；Rust→mdBook" 直接给出三档判据；candidates 表 trial/adopt 全标。Mintlify 显式 hold（"OSS 不友好 / 锁定"对齐 v1 的拒绝理由）。
- v1→v2：v1 partial（lens-frontend 把 Astro 当文档唯一答案）→ v2 sufficient（lens-devtool 显式 ADR 化）。

## 步骤 7：离线 LLM cost 估算

- task：本地调试时估"如果走 OpenAI/Claude/DeepSeek 这条 prompt 多少钱"。
- cookbook_consulted：lens-aieng ADR-2 Router（未扩 dry-run 分支）+ open_questions "router cache/reasoning tokens 字段口径"。
- decision：自维 model→pricing JSON + tiktoken/anthropic-tokenizer 离线算 token；不发请求。
- verdict：**partial**
- gap：ADR-2 仍是"运行时路由"语境；lens-aieng 没有 §"离线纸面估算"段；open_questions 提到字段口径但未落 ADR。
- v1→v2：v1 partial → v2 仍 partial（aieng 此分支未扩，预期内）。

## 步骤 8：数据持久化（SQLite + ORM）

- task：CLI 本地存 session / project / eval 历史。
- cookbook_consulted：lens-devtool §候选表 better-sqlite3 adopt + Drizzle adopt + ADR-4 Bun compile rationale "用 bun:sqlite 替 bs3 保单二进制"。
- decision：Bun runtime 用 bun:sqlite（保单二进制零外部依赖）+ Drizzle ORM（sqlite dialect + 同步 API + ts schema 一处定义）；非 Bun 环境 fallback better-sqlite3。
- verdict：**sufficient**
- 命中：lens-devtool 候选表 "better-sqlite3 | adopt | bs3: 同步+5× | load_ext"（专门标 load_ext 是 sqlite-vss 锚点）+ "Drizzle | adopt | Drizzle: 编译期 SQL | type-safe"；ADR-4 rationale 直说在 Bun compile 单二进制场景"用 bun:sqlite 替 bs3 保单二进制"——把"分发约束 ↔ ORM 选择"咬合上。
- v1→v2：v1 partial（lens-backend ADR-1 反指 PG / lens-mobile 才有 sqlite 但 RN 语境）→ v2 sufficient（lens-devtool 接管 OSS CLI 子语境）。

## 步骤 9：CI / Release

- task：每次 push → 多平台 binary + npm publish + GH Release notes 自动化。
- cookbook_consulted：lens-devtool §候选表 changesets adopt + goreleaser adopt + 决策树 Q5 + open_questions。
- decision：changesets（monorepo 式版本 + npm publish + GH Release artifact）+ Bun compile matrix 5 平台 binary 上传 GH Release + npm provenance。Go 项目走 goreleaser。
- verdict：**sufficient**
- 命中：lens-devtool 决策树 Q5 "Release？monorepo→changesets；Go→goreleaser；个人→np" 三档分流；候选表 changesets/goreleaser ring + 触发条件齐；open_question "changesets vs semantic-release monorepo 10+ 包实战盘点缺" 提示在 10+ 包实战上还要补——但本场景单包 OSS 不到这个量级，不影响落地。
- v1→v2：v1 missing → v2 sufficient。

---

## 汇总

### cookbook_hit_rate

9 步全部至少命中一条 lens（步 1/3/4/5/6/8/9 命中 lens-devtool 或 aieng/data 扩段；步 2/7 命中 lens-frontend / lens-aieng 原段）。**hit_rate = 9/9 = 1.0**（v1 是 0.67）。

### cookbook_useful_rate

- sufficient：1, 3, 4, 5, 6, 8, 9 = **7 步**
- partial：2, 7 = 2 步
- missing：0
- misled：0
- **useful_rate（严格 partial=0.5）= (7 + 0.5×2) / 9 = 8/9 ≈ 0.89**
- 宽口径（partial 也算有用）= 9/9 = 1.0

**严格口径 0.89 ≥ 0.85 目标达成**。

### generalization_score

5（满分 5）。理由：v1 的"OSS 桌面/CLI 工具"骨架未覆盖问题在 v2 被 lens-devtool 横切层一次性吃掉 6 个 missing/partial 步骤；剩下 2 个 partial 是已知未扩段（frontend dashboard archetype、aieng 离线估算分支）——属于次级缺口，骨架不再断。

### v1 → v2 对照

| step | task | v1 verdict | v2 verdict | 关键变化 |
|---|---|---|---|---|
| 1 | CLI 框架 | missing | **sufficient** | lens-devtool ADR-1 |
| 2 | dashboard SSR vs 静态 | partial | partial（不变） | frontend 未扩 |
| 3 | 本地 embedding | partial | **sufficient** | lens-aieng §离线 LLM + ADR-7 |
| 4 | 嵌入式向量库 | missing | **sufficient** | lens-data §嵌入式 + ADR-5 |
| 5 | 跨平台打包 | missing | **sufficient** | lens-devtool ADR-4 + ADR-5 |
| 6 | 文档站 | partial | **sufficient** | lens-devtool Q6 三档 |
| 7 | 离线 cost 估算 | partial | partial（不变） | aieng 此分支未扩 |
| 8 | SQLite + ORM | partial | **sufficient** | lens-devtool bs3+Drizzle+bun:sqlite |
| 9 | CI / Release | missing | **sufficient** | lens-devtool Q5 三档 |

合计：4 missing → 0 missing；3 partial → 2 partial；0 sufficient → 7 sufficient。

### 与四轮 dogfood 对照

| 维度 | v4 教学站 | v6 教学站 | v6 SaaS dashboard | **v6 OSS v1** | **v6 OSS v2** |
|---|---|---|---|---|---|
| 步数 | 10 | 10 | 9 | 9 | 9 |
| hit_rate | 0.9 | 1.0 | 1.0 | 0.67 | **1.0** |
| useful_rate（严格） | 0.4 | 1.0 | 0.67 | 0.56 | **0.89** |
| sufficient | 4 | 10 | 6 | 0 | **7** |
| partial | 3 | 0 | 1 | 5 | 2 |
| missing | 2 | 0 | 2 | 4 | **0** |
| misled | 1 | 0 | 0 | 0 | 0 |
| generalization | — | — | — | 3/5 | **5/5** |

### 还剩什么 blocker（fresh agent 视角）

只剩两个**次级 partial**，不影响骨架可落地：

1. **lens-frontend 嵌入本地工具的 dashboard archetype** — Q0 决策树最左叶子（静态导出+CDN）需要 fresh agent 把 CDN 语义换成 localhost；建议 lens-frontend ADR-1 加反例脚注"嵌入本地工具的 dashboard → SPA + 本机 serve"。优先级低（fresh agent 推断成本 ~5min）。

2. **lens-aieng ADR-2 离线纸面 cost 估算分支** — ADR-2 都是运行时 router 语境；建议 ADR-2 加 §"离线估算 → tiktoken / anthropic-tokenizer / model-pricing 表 / litellm.completion_cost dry-run"。优先级低。

骨架级 blocker（CLI / 嵌入式向量库 / 本地 embedding / 跨平台打包 / OSS Release / 单机 SQLite ORM / 文档站）**v2 全部消除**。

### verdict

**cookbook_works_for_real_project**

理由：
- 骨架级 missing 从 4 → 0；sufficient 从 0 → 7；useful_rate 0.56 → 0.89（严格口径）。
- lens-devtool 横切层一次解决 v1 暴露的"零成本+本地分发+OSS 桌面工具"整片盲区。
- 决策树 Q0 单机栈主路径 "Ollama+sqlite-vss+commander+Bun compile+GH Release+VitePress on Pages" 把骨架脊柱一句话固化——fresh agent 顺主路径走，9 步 7 步 sufficient。
- 剩余 2 个 partial 都是已知次级缺口，骨架仍可端到端落地。

### v3 微调（如果还要继续打磨）

低优；v2 已达成"works_for_real_project"门槛，下面是非阻塞优化：

1. lens-frontend ADR-1 加"嵌入本地工具 dashboard"反例脚注（步 2 升 sufficient）。
2. lens-aieng ADR-2 加"离线纸面估算"分支（步 7 升 sufficient）。
3. lens-aieng §离线 LLM 加"embedding 子表"显式标注（让 fresh agent 不必从 generation 候选反推）。

完成上述 3 项可推到 useful_rate ~ 1.0 / generalization 5/5 稳定。但当前 0.89 已超过本轮 0.85 目标，且 v1 暴露的骨架级断点全部闭环——这些是锦上添花。
