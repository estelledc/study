# lens-cookbook 项目健康度报告 2026-05-31

> 输入：citation-meter（quality 真实度量）+ dogfood「LangGraph 站骨架」（cookbook 实战检验）
> 输出：5 题答复 + health_path + alignment_score + fb3 verdict 调整建议

---

## 1. 对齐度（开新项目能从知识里学架构）

**alignment_score: 55 / 100**

dogfood verdict 是 `cookbook_partially_works`，hit_rate 0.9 但 useful_rate 仅 0.4。翻译过来：cookbook 能"指到大致方向"，但"真要按它落地"会在 4 个核心环节卡住——前端 SSR/SSG/ISR 完全空白、视频对象存储+CDN 整块裸奔、PaaS 类部署被 devops 决策树直接跳过、流式 UI / tool_use 渲染 / sandbox 选型全靠 SDK 文档外推。

一句话理由：**lens 切片缺了"前端"和"媒体存储"两块大肉，决策树在 PaaS 之前就分叉到 K8s/Compose，新项目跑骨架时还要回去 google 关键决策**——离"开新项目能从知识里学架构"还差一档。

---

## 2. quality 端真实进度（不是估算）

| 指标 | 数值 | 判读 |
|---|---|---|
| study_written_count | 822 | 笔记基数大 |
| lens_unique_cited | 81 | 之前估算 ~120-150，**实际打 7 折** |
| coverage_pct | 9.85% | 90% 笔记没被任何 lens 引用 |
| priority_actually_cited / priority_queue_picked | 22/30 = **73.3%** | ≥ 70% 阈值，**priority queue 真有用** |

关键发现：

- **覆盖率间接估算偏乐观**：之前 fb 估算 ~120-150 是"工具名 plaintext + 候选表 col 1 反推"出来的乐观值；real wikilink 数 = 0，所有 lens 都没用 `[[slug]]`。如果不在模板强制 wikilink 字段，覆盖率永远只能间接估，且会持续高估。
- **priority queue 命中 73% 是真信号**：方向对，下一批继续按 priority 走没问题。
- **8 个未命中集中在 ADR context/decision**：mcp-spec / openai-agents-sdk / claude-agent-sdk / github-actions / sarathi-serve / distserve / orca / skip-locked——meter 当前不解析 ADR 段落引用，**下一版 meter 必加 `## context` / `## decision` 段落 grep**。
- **lens-devops 是最大缺口**：候选表 21 个里 14 个 study 没笔记（Buildkite/Jenkins/Nomad/ECS/Datadog/Loki 等）；lens-aieng 16 个里 10 个没笔记（LangGraph/MCP SDK/OpenRouter 等是 ADR-1/ADR-4 论据）——**ADR 在 study 仓查无实证**。

---

## 3. schema v5 之外的"非 schema 问题"

dogfood 暴露的 5 个 blocker，**没有一个是 schema 问题**，全是"lens 切分粒度 + cookbook 决策覆盖度"问题：

| 问题 | 类型 | 修复方向 |
|---|---|---|
| 前端 SSR/SSG/ISR 空白 | **lens 切分缺类** | 新增 `lens-frontend` |
| 流式 UI / tool_use partial / thinking 折叠 | **lens-aieng 范围太窄** | aieng 扩 streaming UI 段 |
| 50 段视频存哪 | **lens 切分缺类**（data 不管对象存储，devops 不管 CDN 媒体） | 新增 `lens-media-storage` 或 data 扩段 |
| PaaS 类部署被跳过 | **决策树起点错** | devops 加 Q0：< 50 美元/月 + 单团队 → PaaS |
| LangGraph TS vs Py 服务拆分 | **ADR 缺一条** | aieng ADR-5 |
| Auth 选型 / sandbox 选型 | **候选表缺节** | backend 加 Auth 段 / aieng 加 sandbox 段 |

**核心结论**：cookbook 的「lens 数量 + 决策树深度」不够，schema 已经够用了——再迭代 schema v6 是过度优化，**应该停 schema 工作转去补 lens**。

---

## 4. fb3 verdict 调整建议（路径选择）

ws5e8tvqe 即将给出的 4 选项策略，本报告的判读：

- **A 推 quality（继续灌 study 笔记）**：覆盖率 9.85% 看着低，但 priority 命中率 73% 说明方向对，可以继续。但**单做 A 解决不了 dogfood 的 5 个 blocker**——cookbook 缺前端/媒体 lens，灌再多 study 也填不上。
- **B 建站（公开 cookbook）**：dogfood useful_rate 0.4，**现在建站等于把半成品挂出去**，强烈不建议。
- **C ？**（待 fb3 给出）
- **D fix-cookbook-gaps**（补 lens-frontend / lens-media-storage / aieng ADR-5 / devops Q0 / backend Auth 节 / aieng sandbox 节）：直接对齐 dogfood must_fix 6 条，**最高 ROI**。

**verdict_change_recommendation**:

> **优先 D（fix-cookbook-gaps）→ 再 A（推 quality 定向补 devops + aieng 缺笔记）→ 最后才 B（建站）**。
>
> 理由：D 解决 dogfood 阻塞，把 useful_rate 从 0.4 拉到 ≥ 0.7；A 接着补 ADR 论据缺笔记（LangGraph / MCP SDK / Buildkite 等 24 个）让 priority queue 命中率从 73% 推到 85%+；这两步完成后 cookbook 才到"开新项目能学架构"的 dogfood 阈值，B 建站才有意义。**先 B 后 D 是把半成品端出去，反向**。

---

## 5. 下次反馈环必加两条 protocol

- **citation-meter 每反馈环开头自动跑**：避免估算偏差（这次实际值是估算的 7 折），fb 决策必须基于真实覆盖率而不是 plaintext 反推。需求：meter 下一版加 ADR `## context` / `## decision` 段落 grep + lens 模板强制 `wikilink:` 字段。
- **dogfood 每写完 1 个新 lens 跑 1 次**：本次只跑了 LangGraph 站，已经暴露 6 个 must_fix；如果新增 lens-frontend / lens-media-storage 时各跑一次（如"做一个 50 段视频学习站"、"做一个 SaaS dashboard"），能在 lens 落地前就发现决策树缺口，**避免重复 dogfood 才发现的返工**。

---

## 综合

- **health_path: red-yellow**（quality 真实覆盖率低于估算 + cookbook 决策覆盖度不足，但 priority queue 方向对、schema 不需要再改——是"补内容"的状态而非"返工"的状态）
- **alignment_score: 55 / 100**
- **下一步**：停 schema v6 / 停建站，转 fix-cookbook-gaps（D）→ 定向 quality 补漏（A）→ 再 dogfood 复测，达 useful_rate ≥ 0.7 才考虑 B。
