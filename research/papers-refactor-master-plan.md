---
title: 论文库重构总计划（Master Plan）
description: 804 篇站点论文 × 13+ 专题候选池 × v3 流水线；现状盘点、不足诊断、6 Phase 可执行路线图
日期: 2026-06-05
状态: draft
---

# 论文库重构总计划

> **范围**：`src/content/docs/papers/*.md`（804 篇）+ `research/papers-*.md` 候选层 + `data/*` 流水线。  
> **不做**：本次不批量改写论文正文、不改 `candidates.jsonl` 状态、不 git commit。  
> **样板**：[`video-understanding-roadmap.md`](./video-understanding-roadmap.md) 已证明「专题路线图 + priority-queue + auto-push」可落地。
> **流水线停止调查**：[`pipeline-stop-investigation.md`](./pipeline-stop-investigation.md)

### 2026-06 部署前状态

> **快照日期**：2026-06-06 · **papers 908 / projects 796**（较本计划基线 804/731 净增 +104/+65）  
> **专题**：视频 65/65 闭环 · 媒体 50/50 闭环 · 阅读站 3 hub  
> **流水线**：`STOP_SIGNAL` 存在，auto-push 治理期暂停  
> **完整现状**：[`project-status-2026-06.md`](./project-status-2026-06.md)

---

## 1. 执行摘要

### 1.1 现状（2026-06-05 实测）

| 维度 | 数量 | 证据 |
|---|---:|---|
| 站点论文 | **804** | `src/content/docs/papers/*.md`；atlas 声明 804 |
| 站点项目 | **731** | `data/written.txt` # projects 段 |
| research 候选 slug（去重） | **700** | 13 个 `papers-*.md` 表格解析 |
| 候选已落站 | **540** | research slug ∩ 站点 slug |
| 候选待写（新稿） | **160** | research slug − 站点 slug |
| pipeline-v3 产出 | **771** | frontmatter `provenance: pipeline-v3` |
| legacy-migrated 存量 | **25** | `provenance: legacy-migrated` + `schema_version: legacy-*` |
| manual-read 精写 | **8** | 含视频专题 8 篇 |
| candidates.jsonl（papers） | **788** 行 | written 599 + claimed 188 + blacklisted 1；**queued=0** |
| 在站但不在 candidates | **205** | 历史手工/Season 写入，流水线不可见 |
| priority-queue（视频 tier-1/2） | **39** | `data/priority-queue.jsonl`，status=`picked` |
| rewrite-pool（当前规则） | **5** | 仅 1 篇 papers；规则未覆盖 legacy 标记 |

**质量快扫**：

- 12 段 H2 结构：**804/804** 命中 ≥7/11（表面合规）
- 行数 150–200：**778/804**（96.8%）；超标 **18** 篇（>200 行，含 `hindley-milner` 279 行）
- 「关联」段 wiki-link 数：均值 **5.5**；**17** 篇 <3；**2** 篇缺「关联」段（`clip`、`helland-2007`）
- 全篇 `[[slug]]` 死链：**435** 处指向 **311** 个不存在 slug
- 正文无评测/实证关键词：**419/804**（52%）

### 1.2 核心不足（7 条一句话）

1. **legacy 存量伪装 v3**：25 篇 `legacy-migrated` 在 atlas 标 🗄 存量，但 rewrite-pool 几乎捞不到，高枢纽篇（`hindley-milner` 307 入链）仍超长未重写。
2. **候选池与站点双轨**：205 篇在站论文不在 `candidates.jsonl`，188 篇 claimed 待落站，research 与 jsonl 计数长期漂移。
3. **知识网有量无质**：全库 wiki-link 均值 17，但 **311** 个目标 slug 不存在，枢纽篇 `clip` 甚至缺「关联」段。
4. **专题深度极不均**：仅视频理解有完整 roadmap + priority-queue（8/65 已写）；security-privacy/mllm/graphics 候选表几乎零落站。
5. **子分类 taxonomy 漂移**：机器学习 alone 有 **33** 种 `子分类` 字符串，atlas 小节碎片化，跨专题检索困难。
6. **rewrite 优先级失灵**：`build-rewrite-pool.mjs` 只看行数/H2，忽略 `provenance`/`schema_version`/入链热度，池子仅 5 条。
7. **评测段系统性缺失**：半数论文无 benchmark/实证段，ML/视频类笔记难以支撑「读 leaderboard」目标。

### 1.3 重构目标（可量化）

| 目标 | 指标 | 截止建议 |
|---|---|---|
| G1 存量提质 | legacy-migrated **25→0**；行数超标 **18→0** | Phase 1 末 |
| G2 枢纽可导航 | Top-50 入链 slug「关联」段 ≥5 条、死链=0 | Phase 2 末 |
| G3 专题覆盖 | 8 个专题具备 roadmap；视频 **8→24**（M3） | Phase 3–4 |
| G4 池子同步 | research 待写 160 全部进 candidates + priority-queue | Phase 0 末 |
| G5 流水线可续跑 | rewrite-pool ≥40 papers；auto-push 可 50/50 配比 | Phase 0 末 |
| G6 分类收敛 | ML 子分类 **33→≤12** canonical 标签 | Phase 5 |

---

## 2. 现状盘点表（按 atlas 一级主题）

> 质量列：atlas `provenanceBadge`——`legacy-migrated`→🗄 存量，其余→✅ v3。  
> v3 占比 = (总数−legacy) / 总数。候选池 = 该主题在 `research/papers-*.md` 有对应 topic 行。  
> 关联均值 = 仅统计「## 关联」段内 `[[slug]]` 数（非全篇）。

| 一级主题 | 已写 | legacy | v3 占比 | research 候选 | 待写 | 关联均值 | 候选池 |
|---|---:|---:|---:|---:|---:|---:|---|
| 机器学习 | 145 | 8 | 94% | 80+65+28* | 94 | 5.2 | ✅ 三表 |
| 图形学 | 121 | 0 | 100% | 60 | 60† | 5.1 | ✅ graphics† |
| 编程语言 | 107 | 5 | 95% | 80 | 2 | 6.8 | ✅ compilers-pl |
| 分布式系统 | 75 | 3 | 96% | 60 | 0 | 6.2 | ✅ |
| 数据库 | 64 | 2 | 97% | 60 | 3 | 7.1 | ✅ |
| 网络协议 | 57 | 0 | 100% | 60 | 9 | 4.9 | ✅ |
| 操作系统 | 54 | 0 | 100% | 60 | 9 | 4.6 | ✅ |
| 信息检索 | 52 | 0 | 100% | 50 | 1 | 5.0 | ✅ |
| 形式化方法 | 51 | 1 | 98% | 50 | 0 | 6.0 | ✅ |
| Agent | 22 | 2 | 91% | (ml 表内) | — | 5.5 | 部分 |
| 其他小类 | 58 | 4 | 93% | — | — | 4.8 | 部分 |

\* ML 候选 = `papers-machine-learning`(80) + `papers-video-understanding`(65) + `papers-mllm`(28)，slug 去重后待写 94。  
† `papers-graphics.md` 用 `| slug |` 无反引号格式，60 篇均未落站；与现有 121 篇图形论文无 slug 对齐，需 Phase 0 建映射。

**atlas 计数说明**：每篇论文在 atlas 出现 **2 次**（子分类表 + 字母序总表），故 grep `✅ v3` 得 1558≈779×2，**非**重复写稿。总数 804 以唯一 slug 为准。建议在 Phase 0 为 atlas 增加「质量统计」脚本的唯一 slug 口径，避免误判。

---

## 3. 不足诊断（分维度）

### D1 结构代际混存 — **P1**

| | |
|---|---|
| **现象** | 25 篇 `legacy-migrated` 保留超长正文（`hindley-milner` 279 行）、`schema_version: legacy-long`；与 v3 模板（150–200 行）并存 |
| **证据** | `provenance` 分布：pipeline-v3 771 / legacy-migrated 25 / manual-read 8；`hindley-milner.md` L8–9 |
| **影响** | 读者体验不一致；quality-gate 对 legacy 放行（行数超标）；rewrite-pool 仅捞到 1 篇 paper |
| **严重度** | **P1** — 不阻断 build，但伤害枢纽页可读性 |

### D2 子分类 / atlas 漂移 — **P2**

| | |
|---|---|
| **现象** | ML 33 种子分类；atlas 机器学习拆成 10+ 小节，部分仅 1–2 篇 |
| **证据** | 全库 `子分类` 去重统计；`papers-atlas.md` 机器学习章节 |
| **影响** | 专题聚合失败；research topic 与 frontmatter 子分类无 SSOT 映射 |
| **严重度** | **P2** |

### D3 知识网稀疏与死链 — **P0**

| | |
|---|---|
| **现象** | 311 个不存在 slug 被引用 435 次；`clip` 缺「关联」段；`raft` 关联仅 1 条但入链 181 |
| **证据** | 脚本扫描 `[[slug]]` vs `written.txt`；`clip.md` 无 `## 关联`；`raft.md` L139–142 |
| **影响** | 导航断裂；auto-push 新稿按 `written.txt` 链邻居时链到幽灵节点 |
| **严重度** | **P0** — 直接破坏 wiki 承诺 |

### D4 候选池与站点不同步 — **P0**

| | |
|---|---|
| **现象** | 205 篇在站不在 candidates；188 篇 claimed 未落站；video 8 篇 jsonl 仍 written 不同步（roadmap 已记录） |
| **证据** | `candidates.jsonl` papers written 599 vs 站点 804；`video-understanding-roadmap.md` §1 |
| **影响** | pick-batch 看不到在站 legacy；重复写稿风险；进度仪表盘失真 |
| **严重度** | **P0** |

### D5 专题深度不均 — **P1**

| | |
|---|---|
| **现象** | 仅 video-understanding 有 roadmap + priority-queue；security-privacy 50 候选 0 落站；mllm 28 候选 0 落站 |
| **证据** | `research/papers-security-privacy.md`；`papers-mllm.md`；`video-understanding-roadmap.md` |
| **影响** | 自驱流水线无专题导航，pick-batch 退化为随机 claimed |
| **严重度** | **P1** |

### D6 评测 / 实证段缺失 — **P2**

| | |
|---|---|
| **现象** | 52% 论文正文无「评测|benchmark|实证|跑分」等词；视频已写 8 篇中仅部分含 lmms-eval 实证指引 |
| **证据** | 全库关键词扫描 419/804；`videochat-2023.md` 有 3 处评测提及 vs 形式化类普遍缺失 |
| **影响** | ML/视频笔记无法支撑「复现榜单」阅读路径 |
| **严重度** | **P2** — 在 Phase 2 对 ML/视频类强制加「评测怎么读」子段 |

### D7 术语与语言不统一 — **P3**

| | |
|---|---|
| **现象** | 标题英中混排（`Attention Is All You Need` vs `Hindley-Milner — 编译器自己猜`）；部分子分类含 `/`（`深度学习 / NLP`） |
| **证据** | `attention.md` title；`attention.md` L5 子分类 |
| **影响** | atlas 排序与搜索噪声 |
| **严重度** | **P3** — Phase 5 批量 classify 时一并收敛 |

### D8 rewrite 优先级不明 — **P1**

| | |
|---|---|
| **现象** | rewrite-pool 5 条（4 projects）；legacy 25 篇未入池；pick-batch 默认 50% rewrite 常空转 |
| **证据** | `node scripts/build-rewrite-pool.mjs` → pool 5；`pick-batch.mjs` L35–38 |
| **影响** | auto-push 算力浪费在低 ROI rewrite |
| **严重度** | **P1** |

---

## 4. 重构原则

1. **不推翻好笔记**：`provenance: manual-read` 8 篇（含视频 8 篇）先审计再改；默认保留类比与代码块（rewrite-paper Step 0）。
2. **SSOT 分层**：分类/子分类 → `data/taxonomy.json`；候选 → `research/papers-*.md`；执行队列 → `candidates.jsonl` + `priority-queue.jsonl`；成品 → `src/content/docs/papers/{slug}.md`。
3. **枢纽优先**：按入链次数（inbound）排序，先修 Top-50 再扫长尾。
4. **专题驱动新稿**：新写必须挂 roadmap 路线，禁止无专题的 bulk new。
5. **小步可验证**：每 Phase 末 `regen-atlas` + `quality-gate` 抽样 + 死链计数下降。
6. **rewrite ≠ 重命名**：slug 不变，只覆盖正文与 frontmatter（禁止 slug 分叉，视频专题已立法）。
7. **与 projects 解耦**：本计划聚焦 papers；projects rewrite 另计（当前 pool 80% 是 projects）。

---

## 5. 分阶段计划

### Phase 0：基建（2–3 人日 + 机器过夜）

| 项 | 范围 | 验收标准 | 工具命令 |
|---|---|---|---|
| P0.1 rewrite-pool 规则扩展 | 全部 804 papers | pool 含 **legacy-migrated 25** + 行数>200 的 18 + 关联<3 的 17；**≥40** papers entries | 改 `build-rewrite-pool.mjs` 增 r5: legacy provenance +2, r6: inbound>50 +1, r7: 缺关联段 +2 |
| P0.2 candidates 回填 | 205 在站缺失行 | 每 slug 一行 `status:written` + 正确 topic | `node scripts/sync-written.mjs` + 新脚本 `backfill-candidates.mjs`（计划实现） |
| P0.3 死链报告 | 全库 | `data/dead-links.jsonl` 311 目标 slug 清单 | 新脚本 `lint-wikilinks.mjs` |
| P0.4 子分类 canonical 表 | ML 为主 | `data/subcategory-canonical.json` ≤12 标签 | 手工 + `classify-notes.mjs` dry-run |
| P0.5 priority-queue 扩容 | 160 待写 | mllm tier-1 ×10, security tier-2 ×20, video 剩余 tier-1/2 | 编辑 `data/priority-queue.jsonl` |
| P0.6 atlas 统计修正 | 文档 | 质量统计用唯一 slug，注明双行展示 | 改 `regen-atlas.mjs` 可选 `--stats` |

**篇数估计**：0 篇改写；~400 行 jsonl/配置变更。  
**auto-push**：暂停 1 round，待 P0.2/P0.5 完成后再启。

---

### Phase 1：存量 legacy 提质（Rewrite 批次）

| 项 | 范围 | 篇数 | 验收标准 |
|---|---|---:|---|
| P1.1 legacy-migrated 全量 rewrite | 25 slug | **25** | `provenance: pipeline-v3`；行数 150–200；quality-gate 0 失败 |
| P1.2 行数超标非 legacy | 18 篇中未覆盖部分 | **~5** | 同上 |

**优先级矩阵**（影响力×劣质度）：入链 Top-15 legacy 先 dispatch。

| 批次 | slug 示例 | 入链 | 行数 |
|---|---|---:|---:|
| R1 | hindley-milner, attention, raft | 307/231/181 | 279/220/211 |
| R2 | lambda-calculus, paxos-1998, hoare-logic, lamport-1978 | 147/140/137/136 | 214–238 |
| R3 | llvm, ssa, bigtable-2006, algol-60 | 109/102/100/34 | 204–243 |
| R4 | 其余 legacy + ddpm, swe-agent 等 | <35 | 144–204 |

**工具**：`prompts/rewrite-paper.md` 五阶段 pipeline；`pick-batch --rewrite 8 --new 0`。  
**机器**：8 slug/round × **4 rounds** ≈ 32 篇；余下 3 篇手动。  
**人力**：Review panel 可全自动；legacy 类比需 Step 0 保留（每篇 +5min 人工 spot-check 可选）。

---

### Phase 2：枢纽加固 + 死链修复（Patch 批次）

| 项 | 范围 | 篇数 | 验收标准 |
|---|---|---:|---|
| P2.1 Top-50 入链「关联」段补强 | 50 | **50** | 关联 ≥5；优先链已存在 slug |
| P2.2 缺「关联」段补齐 | clip, helland-2007 | **2** | 新增 ## 关联 5–7 条 |
| P2.3 死链批量修复 | 311 目标 slug | **~200 篇触达** | 死链总数 435→<50；建 `data/slug-aliases.json`（如 `spanner`→`spanner-2012`） |

**工具**：半自动脚本 `fix-dead-links.mjs`（建议别名替换）+ 人工确认歧义 slug。  
**机器**：不必 full rewrite；可 `refine:` commit。  
**验收抽样**：`hindley-milner`、`clip`、`raft` 死链=0。

---

### Phase 3：专题新稿 — 视频 + MLLM（New 批次）

**衔接** [`video-understanding-roadmap.md`](./video-understanding-roadmap.md)：

- 执行路线 1+2（P0）：`video-chatgpt-2023` → `mvbench-2023` → `llava-onevision-2024` → `videomme-2024` → `mlvu-2024` → `egoschema-2023`
- 再接路线 2 长视频：`timechat-2024`、`llama-vid-2023`、`moviechat-2024`、`longva-2024`
- priority-queue 已 pick 的 39 篇按 tier 消费

| 子 Phase | 专题 | 篇数 | 累计已写（视频） |
|---|---|---:|---:|
| P3a | 视频理解路线 1+2 | **16** | 8→24（对齐 roadmap M5 前） |
| P3b | MLLM 工业对标 | **12** | mllm 0→12 |
| P3c | 视频路线 3 VTG 头部 | **8** | 24→32 |

**篇数小计**：**36 新稿**（与 claimed 池重叠部分去重后净增）。  
**auto-push**：`--count 20 --new 16 --rewrite 4`；约 **2–3 rounds** 完成 P3a。  
**验收**：每篇链 ≥1 视频已写 + ≥1 MLLM 枢纽；benchmark 段必含 lmms-eval 或 leaderboard 名。

---

### Phase 4：专题新稿 — 安全 / 网络 / OS 缺口

| 专题 | 待写 | 篇数建议 | 优先级 |
|---|---|---:|---|
| security-privacy | 50 | **15**（P0 子集：SMPC/ZK/DP 各 5） | tier-2 |
| network-protocols | 9 | **9** | tier-3 |
| operating-systems | 9 | **9** | tier-3 |
| machine-learning 残余 | 3 | **3** | tier-3 |

**篇数小计**：**36 新稿**。  
**前置**：完成 §6 中 `security-privacy-roadmap.md` 模板复制。  
**机器**：20/round → **2 rounds**。

---

### Phase 5：分类收敛 + 图形学对齐

| 项 | 范围 | 篇数 |
|---|---|---:|
| P5.1 ML 子分类归并 | 145 篇 | **145** frontmatter 触达（脚本批量） |
| P5.2 graphics 候选 slug 与在站 121 篇映射 | 60 候选 | 建 `data/graphics-slug-map.json`；重复跳过、缺口入队 |
| P5.3 全库评测段补全（仅 ML/Agent） | ~170 篇 | 实践案例末加「### 评测怎么读」≤5 行 |

**篇数估计**：145 次 classify touch + 60 映射 + 50 评测段增补。  
**不做**：121 篇图形存量全文 rewrite（ROI 低，除非 rewrite-pool 新规则命中）。

---

### Phase 6：长尾新稿 + 维护

| 项 | 范围 | 篇数 |
|---|---|---:|
| compilers-pl / databases / gpu 残余 | 6 | **6** |
| security-privacy 第二批 | 20 | **20** |
| video 路线 4 + 2026 队列 19 篇 | 30 | **30** |
| 持续死链 lint | 全库 | 每月 `lint-wikilinks.mjs` |

**篇数小计**：**56 新稿** + 维护。

---

### Phase 总览与篇数估计

| Phase | 类型 | 估计 slug 操作数 | auto-push rounds（20/round） |
|---|---|---:|---:|
| 0 | 基建 | 0 改写 | 0 |
| 1 | Rewrite | **30** | 4 |
| 2 | Patch/关联 | **~200 触达**（50 深修） | 2（可并行人工） |
| 3 | New（视频+mllm） | **36** | 2–3 |
| 4 | New（安全+网络+OS） | **36** | 2 |
| 5 | 分类+graphics | **145+50 触达** | 1 |
| 6 | 长尾 | **56** | 3 |
| **合计** | | **~190 全量改写/新写** + **~250 轻量 patch** | **~14 rounds** |

满载 120/round 时，Phase 3–6 新稿 **~128 篇** 可在 **2 rounds** 内 dispatch 完毕（与当前并行 auto-push 兼容）。

---

## 6. 专题路线图模板（从视频理解抽象）

> 复制 [`video-understanding-roadmap.md`](./video-understanding-roadmap.md) 骨架，替换下列占位符即可。

```markdown
# {专题名}专题路线图

## 1. 现状盘点
- 候选池总量 / 已写 / 待写（与 papers-{topic}.md frontmatter 同步）
- 已写 slug 表（枢纽价值列）
- 数据层不一致表（candidates vs atlas vs research）

## 2. N 条可执行写作路线
每条：目标读者 | 预计篇数 | 依赖 [[slug]] | 顺序 slug 列表 | 产出价值

## 3. 与 study v3 流水线对接
- Slug 命名 / Frontmatter / 反向链接规则
- auto-push pick 顺序
- 建议 round 配比（论文:项目:rewrite）

## 4. 下一批高 ROI 候选（10 篇）
优先级 | slug | 理由 | 与已写关系

## 5. 邻域项目侧（可选）

## 6. 维护任务清单（checkbox）

## 7. 里程碑 M1–M5
```

### 建议优先做 roadmap 的 8 个 topic

| 优先级 | topic 文件 | 理由 | 待写 | 建议启动 Phase |
|:---:|---|---|---:|---|
| P0 | `papers-video-understanding` | **已有**，继续执行路线 2+3 | 57 | 3（进行中） |
| P0 | `papers-mllm` | 多模态枢纽；与视频双表互链已设计 | 28 | 3 |
| P1 | `papers-security-privacy` | 50 候选零落站，面试/合规高需求 | 50 | 4 |
| P1 | `papers-machine-learning` | 80 候选仅 3 待写；补评测/RL 子路线 | 3+ | 3 末 |
| P2 | `papers-gpu-architecture` | 1 待写 + 与 graphics 121 篇交叉 | 1+ | 5 |
| P2 | `papers-network-protocols` | 9 待写；与在站 57 篇补全 QUIC/HTTP3 链 | 9 | 4 |
| P2 | `papers-operating-systems` | 9 待写；eBPF/调度新论文 | 9 | 4 |
| P3 | `papers-graphics` | 60 候选与 121 存量需映射，非从零 | 60 | 5 |

---

## 7. 单篇重构 SOP

对照 `prompts/rewrite-paper.md` + `prompts/base-rules.md`：

### A. Rewrite 路径（legacy / 超标）

1. **Step 0 读旧稿**：保留好类比、代码、「踩过的坑」；丢弃 Layer 标题、怀疑段、学术分层。
2. **Step 1–3 调研**：`lr search` + arxiv + `lr graph`（即使旧稿已有来源也重拉）。
3. **Step 4 覆盖写**：对照 `hindley-milner.md` 12 段；150–200 行；frontmatter 仅 `title/来源/日期/分类/子分类/难度/provenance`。
4. **关联 5–7 条**：只链 `written.txt` 中存在的 slug；枢纽篇优先。
5. **Step 5 门禁**：`node scripts/quality-gate.mjs {path}` → 非 0 则重写一次。
6. **后处理**：`sync-written.mjs`；更新 research 表 `✓ 已写`；`regen-atlas`（build 自动）。

### B. New 路径

1. 从 roadmap §4 取 slug → `candidates.jsonl` status=queued → pick-batch。
2. `prompts/new-paper.md` 五阶段 pipeline（同 rewrite 但无 Step 0）。
3. 视频/MLL 类强制「实践案例」含 benchmark 名或 [[lmms-eval]]。

### C. Patch 路径（Phase 2）

1. 仅改「关联」段 + 死链替换；行数仍须 150–200。
2. commit 消息：`refine: {slug} 关联段与死链修复`。
3. 不触发 full Review panel（节省算力）。

### 质量门禁清单（必须全过）

- [ ] 行数 150–200
- [ ] 12 段 H2 ≥9/11 命中
- [ ] 无 Definition/Theorem/## 2.1 学术编号
- [ ] GitHub permalink ≤3
- [ ] 关联段 5–7 条且目标 slug ∈ written.txt
- [ ] `分类` ∈ taxonomy.json themes
- [ ] ML/视频类：含 ≥1 评测关键词或 benchmark 名

---

## 8. 与 auto-push 集成

### Dispatch 优先级（高→低）

1. `priority-queue.jsonl` tier-1（status=new/picked）
2. `rewrite-pool.jsonl` score≥3 的 papers
3. `candidates.jsonl` status=queued + topic 匹配活跃 roadmap
4. `candidates.jsonl` status=claimed（清积压）
5. rewrite score=2 长尾

### Rewrite vs New 路由

| 条件 | kind |
|---|---|
| 站点已有文件 + rewrite-pool 命中 | `rewrite` |
| candidates queued + 无站点文件 | `new` |
| manual-read + 用户未标 deprecated | **skip**（人工审计队列） |
| 死链-only patch | 不走 auto-push；`refine` 脚本 |

默认配比：`pick-batch --count 20 --rewrite 4 --new 16`（视频专题期 `--new 18 --rewrite 2`）。

### 停止条件（沿用 SKILL）

- `written ≥ 20000`（远期）
- build 连续失败
- queue 见底（queued=0 且 claimed 清空）
- `data/STOP_SIGNAL` 存在

### Phase 与 auto-push 协调

| Phase | auto-push 策略 |
|---|---|
| 0 | **暂停** 1 round |
| 1 | 高 rewrite 比（8R+0N 连续 4 round） |
| 2 | 人工/脚本为主；auto-push 不批量跑 patch |
| 3–4 | 高 new 比（4R+16N）；消费 priority-queue |
| 5–6 | 默认 4R+16N；classify 批量后 regen-atlas |

---

## 9. 风险与不做清单

### 风险

| 风险 | 缓解 |
|---|---|
| 并行 agent 与 Phase 1 rewrite 冲突 | Phase 0 后统一 `round-lock`；legacy slug 在 rewrite-pool `claimed` |
| 205 backfill 触发重复写稿 | backfill 用 `status:written` 非 queued |
| graphics slug 与在站 121 篇同名不同义 | Phase 5 先出映射表人工审 10 条 |
| 死链别名误替换 | `slug-aliases.json` 需 PR 人工 approve |
| atlas 双行导致进度误判 | 用唯一 slug 统计（§2 说明） |

### 不做清单（本次及 Phase 0–1 禁止）

- ❌ Mass 改 `papers-atlas.md`（仅 regen 触发）
- ❌ 批量改 `candidates.jsonl` status（除 P0.2 专用 backfill 脚本外）
- ❌ 无 roadmap 的 security 50 篇一次性 new
- ❌ 图形学 121 篇存量全文 rewrite
- ❌ 修改 slug / URL（破坏外链）
- ❌ 删 manual-read 8 篇视频笔记重跑 pipeline（除非 review 失败）

---

## 10. 附录：优先重构 Top 50 slug

评分公式：`score = inbound×2 + (legacy?10:0) + (lines>200?5:0) + (assoc<3?3:0) + (missing关联段?5:0) + (priority-tier-1?8:0)`

| Rank | slug | 理由摘要 | 操作 |
|:---:|---|---|---|
| 1 | hindley-milner | 入链 307；legacy 279 行 | Rewrite R1 |
| 2 | attention | 入链 231；legacy 220 行；ML 元枢纽 | Rewrite R1 |
| 3 | raft | 入链 181；legacy；关联仅 1 条 | Rewrite R1 |
| 4 | clip | 入链 88；**缺关联段**；多模态枢纽 | Patch P2 + 可选 Rewrite |
| 5 | lambda-calculus | 入链 147；legacy 214 行 | Rewrite R2 |
| 6 | paxos-1998 | 入链 140；legacy 235 行 | Rewrite R2 |
| 7 | hoare-logic | 入链 137；legacy 238 行 | Rewrite R2 |
| 8 | lamport-1978 | 入链 136；legacy 218 行 | Rewrite R2 |
| 9 | videomme-2024 | tier-1；视频评测事实标准 | New P3 |
| 10 | mvbench-2023 | tier-1；20 任务评测 + VideoChat2 | New P3 |
| 11 | video-chatgpt-2023 | tier-1；Video-LLM 指令微调开山 | New P3 |
| 12 | llvm | 入链 109；legacy 243 行 | Rewrite R3 |
| 13 | ssa | 入链 102；legacy 233 行 | Rewrite R3 |
| 14 | bigtable-2006 | 入链 100；legacy 204 行 | Rewrite R3 |
| 15 | timechat-2024 | tier-1；长视频 Q-Former | New P3 |
| 16 | llava-onevision-2024 | tier-1；统一 image/video | New P3 |
| 17 | internvideo2-2024 | tier-2；补 [[internvideo]] 断层 | New P3 |
| 18 | mllm-benchmark-survey-2024 | mllm 入口；claimed | New P3 |
| 19 | gemini-1.5-2024 | 长视频工业上限；mllm | New P3 |
| 20 | egoschema-2023 | tier-1；egocentric 长视频 | New P3 |
| 21 | algol-60 | legacy；PL 史枢纽 | Rewrite R3 |
| 22 | paxos | 在站新版；与 paxos-1998 并存需互链审计 | Patch 关联 |
| 23 | spanner-2012 | 入链 121；死链别名 spaner | Patch 死链 |
| 24 | bert | 入链 114 | Patch 关联+评测段 |
| 25 | gpt-3 | 入链 118 | Patch 评测段 |
| 26 | qwen2-vl-2024 | 视频已写；补 cross-link 待写 benchmark | Patch |
| 27 | llava | 多模态枢纽；链 mllm 待写 | Patch |
| 28 | blip2-2023 | 连接器范式枢纽 | Patch |
| 29 | flamingo-2022 | 少样本视频/图像 | Patch |
| 30 | constitutional-ai | 关联 2；入链 33 | Patch P2 |
| 31 | toolformer | legacy；关联 1 | Rewrite R4 |
| 32 | graphrag | legacy；Agent 邻域 | Rewrite R4 |
| 33 | sparse-autoencoders | legacy | Rewrite R4 |
| 34 | ddpm | legacy | Rewrite R4 |
| 35 | swe-agent | legacy | Rewrite R4 |
| 36 | helland-2007 | 缺关联段 | Patch P2 |
| 37 | dalle-2 | 关联 0；生成邻域 | Patch P2 |
| 38 | dijkstra-goto | 关联 0 | Patch P2 |
| 39 | b-tree-1972 | 关联 1；数据库枢纽 | Patch P2 |
| 40 | mllm-benchmark-survey-2024 | 见 #18 | New |
| 41 | mmmu-2023 | mllm tier-1 | New P3 |
| 42 | internvl2-2024 | mllm 工业对标 | New P3 |
| 43 | gemini-2-5-2025 | mllm+video 交叉 | New P3 |
| 44 | worldsense-2025 | 视频 2026 队列 | New P6 |
| 45 | videollm-online-2024 | 流式 Video-LLM | New P6 |
| 46 | zk-snark | security 候选代表 | New P4 |
| 47 | dp-sgd-2016 | security 候选代表 | New P4 |
| 48 | mpc-gmw-1987 | security 候选代表 | New P4 |
| 49 | phong-1975 | graphics 候选首篇（需 slug 映射） | New P5 |
| 50 | whitted-1980 | graphics 光线追踪祖宗 | New P5 |

---

## 11. 与视频理解专题计划的衔接

| 维度 | 视频 roadmap 现状 | 本 Master Plan 承接 |
|---|---|---|
| 已写进度 | 8/65（12%） | Phase 3 目标 8→24（M3）→32（M4） |
| 路线 | 4 条（入门/长视频/VTG/工业） | Phase 3a–c 按路线 1→2→3 顺序 dispatch |
| 队列 | `priority-queue.jsonl` 39 篇 picked | Phase 0.5 扩容；pick-batch 70% 优先 tier-1 |
| 数据修复 | jsonl 8 行 status 漂移 | Phase 0.2 `sync-written`（**不在此次执行**） |
| 项目侧 | 5/9 项目已写 | 本计划不拆 projects；video 论文优先 |
| MLLM 交叉 | `papers-mllm.md` 重叠表 | Phase 3b 专批；slug 互链不迁移 |
| 里程碑 | M1✓ M2–M5 | 对齐 Phase 3 末 = M3（16 篇）、Phase 6 = M5（24+） |

**执行建议**：下一轮 auto-push 直接消费 video roadmap §「建议下一 dispatch 批次」前 8 slug，与本计划 Phase 3a 相同；Phase 1 legacy rewrite 与之 **并行不同 worktree**，避免 slug 冲突。

---

## 12. regen-atlas 时机建议

- **现在**：不必 mass 改 atlas；build 已 `prebuild` 自动 regen。
- **Phase 0 末**：backfill + subcategory 变更后手动 `node scripts/regen-atlas.mjs` 验证 ML→视频理解小节条数。
- **Phase 5**：子分类归并后 **必须** regen + 目视 diff ≤5% 条目移动。
- **禁止**：为改描述列 mass 编辑 atlas（描述来自 frontmatter `description`，v3 新稿已无此字段——描述列为空是已知现象，可选 Phase 5 从「学到什么」首句生成）。

---

---

## 13. 阅读站专题化（2026-06-05 落地）

> **样板**：[Embodied AI Reading Station](https://estelledc.github.io/embodied-ai-reading-station/) — 11 专题分栏 + 分阶段卡片 + 里程碑。  
> **study 落地**：`research/reading-stations-index.md` + `src/content/docs/stations/{slug}.md` + 侧栏轻量入口。

### 13.1 与 Phase 对齐

| Phase | 阅读站动作 | 验收 |
|---|---|---|
| **Phase 0** | 建总索引 + 3 hub（video / mllm / distributed） | 侧栏可点；hub 只链已写 slug |
| **Phase 3** | 视频 hub 随 batch 更新篇数；mllm 首批 4 篇评测落站后扩表 | video 36→65；mllm 12→20 |
| **Phase 4** | security-privacy hub（50 候选，4 已写） | 枢纽 zk-snark 关联段 ≥5 |
| **Phase 5** | compilers-pl / graphics hub；子分类与 station slug SSOT 映射 | taxonomy.json 增 `station` 可选字段 |
| **Phase 6** | agent / gpu-architecture hub；reading-stations 统计自动化 | 脚本从 frontmatter 聚合 |

### 13.2 文件约定

| 层 | 路径 | 职责 |
|---|---|---|
| 研究索引 | `research/reading-stations-index.md` | 14 专题元数据、阅读顺序、代表 slug |
| 站点入口 | `src/content/docs/reading-stations.md` | 用户可见总览 |
| 专题 hub | `src/content/docs/stations/{slug}.md` | 导读 + 分阶段表 + 里程碑 |
| 候选池 | `research/papers-*.md` | frontmatter `station: {slug}` |
| 导航 | `astro.config.mjs` | 「专题阅读站」+ 折叠子项 |

### 13.3 已建 hub 快照

| slug | 已写 | 候选 | hub 路径 |
|---|---:|---:|---|
| video-understanding | 36 | 65 | `/stations/video-understanding/` |
| mllm | 12 | 26 | `/stations/mllm/` |
| distributed-systems | 75 | 60 | `/stations/distributed-systems/` |

### 13.4 下一批 hub 建议（按已写篇数）

1. **compilers-pl**（107 已写）— 类型论→语义→JIT 主线最长
2. **graphics**（121 已写）— 渲染方程→光线追踪→神经渲染
3. **machine-learning**（169 已写）— 通识枢纽，与 mllm/video 交叉链
4. **databases**（64）+ **operating-systems**（54）— 系统栈连续读
5. **security-privacy**（4 已写 / 50 候选）— Phase 4 专批后才有足够链接

**禁止**：为凑表把候选 slug 写成 `[[wiki-link]]`（build 死链）；候选只标「待写」。

---

## 14. 双库 Phase 对齐（papers ↔ projects）

论文库与本计划的 Phase 0–4 **节奏对齐**，但执行分工不同：papers 侧重 legacy 缩编 + station hub；projects 侧重 media/video 新稿 + 高入链 DevOps patch。完整诊断、Top-20 重构 slug、new:rewrite 并行策略见 **[`projects-refactor-master-plan.md`](./projects-refactor-master-plan.md)**。

| Phase | papers 重心 | projects 重心（对照） |
|:---:|---|---|
| 0 | candidates 回填、video 8 篇 queued→written | 194 在站 slug 回填；video 5 篇 jsonl 同步 |
| 1 | Top 枢纽 patch、video batch1 抛光 | docker/k8s/redis/nginx patch；decord 链补全 |
| 2 | legacy-long rewrite（fastapi 等） | 同左 + lexical/plane 超长 legacy |
| 3 | station new 稿（pipeline） | **ffmpeg / videochat2 / opencv 等待写**（pipeline a440007f） |
| 4 | reading-stations 闭环、死链统一 | hub「关联项目」段与 research 表对齐 |

**slug 互斥**：research agent patch 过的 9 篇（decord×5 + legacy×4）与 pipeline new 队列不重叠；pick-batch 项目侧目标 new:rewrite ≈ **50:50**。

---

*文档版本：2026-06-05 · 基于仓库实测数据，不含 mass 改写操作。*
