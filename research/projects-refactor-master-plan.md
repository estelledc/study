---
title: 项目库重构总计划（Master Plan）
description: 731 篇站点项目 × 15 专题候选池 × v3 流水线；现状盘点、不足诊断、Phase 0–4 路线图 + 队列扩充策略
日期: 2026-06-05
状态: draft
---

# 项目库重构总计划

> **范围**：`src/content/docs/projects/*.md`（731 篇）+ `research/projects-*.md` 候选层 + `data/candidates.jsonl`（projects 段）。  
> **分工**：本计划 + research 层 + **存量 patch/rewrite** 由 research agent 执行；**new 稿落盘** 由 pipeline agent（a440007f）claim 后写全文。  
> **样板**：视频专题 5 篇 `manual-read`（[[decord]]、[[lmms-eval]] 等）已证明 v3 项目笔记风格可落地。
> **流水线停止调查**：[`pipeline-stop-investigation.md`](./pipeline-stop-investigation.md)

---

## 1. 执行摘要

### 1.1 现状（2026-06-05 实测）

| 维度 | 数量 | 证据 |
|---|---:|---|
| 站点项目 | **731** | `src/content/docs/projects/*.md`；`data/written.txt` # projects |
| pipeline-v3 产出 | **694** | frontmatter `provenance: pipeline-v3` |
| legacy-migrated 存量 | **29** | `provenance: legacy-migrated` + `schema_version: legacy-long` |
| manual-read 精写 | **5** | decord / lmms-eval / internvideo / videollama2 / llava-next |
| curated-season | **3** | 早期策展批次 |
| candidates.jsonl（projects） | **931** 行 | written 537 + queued 393 + blacklisted 1；**claimed=0** |
| 在站但不在 candidates | **194** | 历史手工/Season 写入，流水线不可见 |
| queued 未落站 | **393** | pick-batch 可见但无磁盘文件 |
| rewrite-pool（projects） | **3** | lexical / lottie / plane；规则偏行数，legacy 标记覆盖不足 |
| research 专题文件 | **15** | `research/projects-*.md` |
| media 池待写 | **47** | 50 候选中 0 落站（ffmpeg 等全 queued） |
| video 工具链已写/候选 | **5 / 9** | `projects-video-understanding.md` |

**质量快扫（10 篇抽样）**：

| slug | 行数 | description | 关联链 | 对比表 | 实操 | provenance |
|---|---:|---|---:|---|---:|---|
| decord | 214 | ✅ | 20 | ✅ | ✅ | manual-read |
| lmms-eval | 203 | ✅ | 19 | ✅ | ✅ | manual-read |
| internvideo | 198 | ✅ | 17 | ✅ | ✅ | manual-read |
| videollama2 | 198 | ✅ | 17 | ✅ | ✅ | manual-read |
| llava-next | 203 | ✅ | 19 | ✅ | ✅ | manual-read |
| docker | 171 | ❌ | 3 | ❌ | ✅ | pipeline-v3 |
| kubernetes | 208 | ❌ | 1† | ❌ | ✅ | legacy-migrated |
| redis | 204 | ❌ | 2† | ❌ | ✅ | legacy-migrated |
| nginx | 206 | ❌ | 4 | ❌ | ✅ | legacy-migrated |
| ffmpeg | — | — | — | — | — | queued 未落站 |

† 正文「## 关联」段链数；反向链接段另计 50+ 条 auto-generated。

**全库统计**：

- 行数均值 **173**；v3 gate **≥150 无上限**（commit `50c40286`）；旧口径下 >200 行 **35** 篇（已不再拒 merge）
- frontmatter 缺 `description`：**721/731**（99%）
- 「关联」段 wiki-link 均值 **5.4**；**26** 篇 <3；**6** 篇缺「关联」段
- 全篇 `[[slug]]` 死链：**543** 处指向 **293** 个不存在 slug（含 `video-understanding` 枢纽 5 处）

### 1.2 核心不足（4 条）

1. **legacy 高枢纽未提质**：29 篇 `legacy-migrated` 缺 description、缺对比表；Top 入链篇（postgresql 184、kubernetes 150、redis 142）human「关联」段仅 1–2 条，读者导航断裂。
2. **候选池与站点双轨**：194 篇在站不在 `candidates.jsonl`；393 篇 queued 未落站；video 5 篇 jsonl 仍 queued（应 written）。
3. **专题深度极不均**：video 有 5 篇 manual-read + research 专表；media **0/50** 落站；editors **8/60**；graphics/runtimes 各 **1/60**。
4. **rewrite 池失灵**：`build-rewrite-pool.mjs` 仅捞 3 篇 projects（lexical/lottie/plane），忽略 legacy 标记与高入链热度。

### 1.3 重构目标（可量化）

| 目标 | 指标 | 截止建议 |
|---|---|---|
| G1 枢纽提质 | Top-20 入链 slug 补 description + 对比表 + 关联≥8 | Phase 1 末 |
| G2 legacy 清零 | legacy-migrated **29→0**（rewrite 或 patch 标 v3） | Phase 2 末 |
| G3 专题覆盖 | video **5→9** 项目；media **0→8** P0 落站 | Phase 3 末 |
| G4 池子同步 | 194 在站 slug 回填 candidates；queued 高 ROI 进 priority | Phase 0 末 |
| G5 并行流水线 | new:rewrite = 50:50；分 worktree 零 slug 冲突 | 持续 |

---

## 2. 现状盘点（research 专题 × 站点）

| 专题文件 | 候选 slug | 已落站 | 待写 | 备注 |
|---|---:|---:|---:|---|
| projects-video-understanding | 9 | 5 | 4 | manual-read 质量标杆 |
| projects-media | 50 | 0 | 50 | ffmpeg/opencv 全 queued |
| projects-data-science-ai | 70 | 68 | 2 | vllm/ray 已在站 |
| projects-databases | 80 | 77 | 3 | 高覆盖 |
| projects-devops | 60 | ~56 | ~4 | k8s/docker 在站但 legacy |
| projects-dataviz | 119 | 64 | 55 | 半覆盖 |
| projects-editors | 60 | 8 | 52 | 低覆盖 |
| projects-graphics | 60 | 1 | 59 | 几乎空白 |
| projects-runtimes | 60 | 1 | 59 | 几乎空白 |
| projects-communication | 50 | 26 | 24 | 中覆盖 |
| projects-blockchain | 60 | 59 | 1 | 高覆盖 |
| projects-embedded | 22 | 8 | 14 | 低覆盖 |
| projects-backend-api | 1+ | 1 | 0 | 小表 |
| projects-cli | 0 | — | — | 空表 |
| projects-mobile | 0 | — | — | 空表 |

**provenance 分布**：pipeline-v3 694（95%）· legacy-migrated 29（4%）· manual-read 5 · curated-season 3

---

## 3. 不足诊断（分维度）

### D1 legacy 伪装 v3 — **P0**

| | |
|---|---|
| **现象** | 29 篇 `legacy-migrated` 保留 `schema_version: legacy-long`；Top 枢纽缺 description、human「关联」段稀疏 |
| **证据** | kubernetes.md L134–136 仅 1 条关联；redis 2 条；721/731 无 description |
| **影响** | 高入链页成为导航断点；atlas 无法按质量分层 |
| **严重度** | **P0** |

### D2 候选池与站点不同步 — **P0**

| | |
|---|---|
| **现象** | 194 在站不在 jsonl；video 5 篇 written 但 jsonl=queued；393 queued 无文件 |
| **证据** | `projects-video-understanding.md` §已发布映射；脚本 diff |
| **影响** | pick-batch 重复写稿；进度仪表盘失真 |
| **严重度** | **P0** |

### D3 知识网死链 — **P1**

| | |
|---|---|
| **现象** | 293 不存在 slug 被引用 543 次；`video-understanding` 枢纽链 5 处无效 |
| **证据** | 全库 `[[slug]]` vs written.txt + papers 扫描 |
| **影响** | wiki 承诺断裂；应用 `/study/stations/` 路径或等 hub 页 slug 统一 |
| **严重度** | **P1** |

### D4 专题深度不均 — **P1**

| | |
|---|---|
| **现象** | media 0 落站；video 有 roadmap 级项目链；devops 缺与 ML 训练栈交叉链 |
| **证据** | `projects-media.md`；reading-stations hub 关联项目段 |
| **严重度** | **P1** |

---

## 4. Phase 0–4 重构计划

### Phase 0 · 池子对齐（1–2 天）

| 动作 | 类型 | 产出 |
|---|---|---|
| video 5 篇 jsonl queued→written | patch | 与 papers 视频 8 篇同步问题一并修 |
| 194 在站 slug 回填 candidates | patch | `scripts/sync-on-disk-candidates.mjs`（待建） |
| 新增高 ROI queued（torchcodec、hls-js、kubeflow 等） | new queue | 仅 jsonl append，不 claim |
| rewrite-pool 规则：+legacy-migrated +入链 Top-50 | patch | pool ≥30 projects |

### Phase 1 · 枢纽 patch（本周，8–12 篇/轮）

| 动作 | 类型 | slug 示例 |
|---|---|---|
| 补 description + 对比表 + 关联≥8 | **patch** | docker, kubernetes, redis, nginx, postgresql, kafka |
| 视频 5 篇 v2 抛光 | **patch** | decord, lmms-eval, internvideo, videollama2, llava-next |
| 不重写全文，保留 legacy 正文 | patch | 最小 diff |

### Phase 2 · legacy rewrite（2–4 周）

| 动作 | 类型 | slug 示例 |
|---|---|---|
| 超长 legacy 对齐 v3（**≥150 行、无上限**）+ 12 H2 | **rewrite** | fastapi(236), react(240), express(218), pytorch(226) |
| rewrite-pool Top：lexical(682), plane(851), lottie(461) | rewrite | 3 篇已在 pool |
| 标 `provenance: pipeline-v3` + 删 legacy schema | patch | rewrite 完成后 |

### Phase 3 · 专题 new 稿（pipeline 负责）

| 动作 | 类型 | slug 示例 |
|---|---|---|
| video 工具链 4 待写 | **new** | videochat2, videollama3, vllm-multimodal, transformers-video |
| media P0 首批 | **new** | ffmpeg, opencv, hls-js, yt-dlp |
| ml-infra 推理栈 | **new** | onnxruntime, tensorrt, kubeflow, kserve |

### Phase 4 · 分类与 hub 闭环

| 动作 | 类型 | 产出 |
|---|---|---|
| reading-stations「关联项目」段与 research 表对齐 | patch | 3 hub + index |
| 死链 slug 统一：`video-understanding` → stations 路径 | patch | 全库 |
| projects-atlas 质量徽章（legacy / manual / v3） | patch | atlas 脚本 |

---

## 5. Top 20 优先重构 slug

按 **入链热度 × legacy 标记 × 专题枢纽** 排序：

| 序 | slug | 入链 | provenance | 动作 | 负责 |
|:---:|---|---:|---|---|---|
| 1 | postgresql | 184 | legacy | rewrite | Phase 2 |
| 2 | fastapi | 158 | legacy | rewrite | Phase 2 |
| 3 | kubernetes | 150 | legacy | **patch** ✅ | Phase 1 |
| 4 | redis | 142 | legacy | **patch** ✅ | Phase 1 |
| 5 | react | 134 | legacy | rewrite | Phase 2 |
| 6 | express | 119 | legacy | rewrite | Phase 2 |
| 7 | pytorch | 112 | legacy | patch+链 video | Phase 1 |
| 8 | docker | 67 | v3 | **patch** ✅ | Phase 1 |
| 9 | nginx | 64 | legacy | **patch** ✅ | Phase 1 |
| 10 | kafka | 72 | v3 | patch | Phase 1 |
| 11 | decord | 高 | manual | v2 抛光 ✅ | Phase 1 |
| 12 | lmms-eval | 高 | manual | v2 抛光 ✅ | Phase 1 |
| 13 | internvideo | 中 | manual | v2 抛光 ✅ | Phase 1 |
| 14 | videollama2 | 中 | manual | v2 抛光 ✅ | Phase 1 |
| 15 | llava-next | 中 | manual | v2 抛光 ✅ | Phase 1 |
| 16 | lexical | 中 | legacy | rewrite | pool 已有 |
| 17 | plane | 低 | legacy | rewrite | pool 已有 |
| 18 | ffmpeg | — | queued | **new** | pipeline |
| 19 | videochat2 | — | queued | **new** | pipeline |
| 20 | opencv | — | queued | **new** | pipeline |

---

## 6. reading-stations 关联项目对齐

| hub | 当前已写 | 待扩充（research） | 建议 |
|---|---:|---:|---|
| video-understanding | 5 | +4 video +2 media | decord 链 ffmpeg/opencv；待写 videochat2 |
| mllm | 3 | +2 评测 | llava-next / lmms-eval 已有；补 transformers |
| distributed-systems | 3 | +5 devops | etcd / helm / prometheus / containerd / kafka |
| databases | — | hub 待建 | 链 postgresql / redis / clickhouse |
| machine-learning | — | hub 待建 | 链 pytorch / ray / vllm / mlflow |

---

## 7. 扩充 + 重构并行策略

```text
┌─────────────────────┐     ┌─────────────────────┐
│  worktree: rewrite  │     │  worktree: new      │
│  (research agent)   │     │  (pipeline a440007f)│
├─────────────────────┤     ├─────────────────────┤
│ patch/rewrite 存量  │     │ claim queued → 全文 │
│ slug 来自 rewrite-  │     │ slug 来自 video/    │
│ pool + master Top20 │     │ media 待写表        │
│ 禁止 claim queued   │     │ 禁止改 written 存量 │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           └───────────┬───────────────┘
                       ▼
              cherry-pick → main
              （slug 互斥清单 daily sync）
```

**冲突规避**：

1. **slug 清单**：pipeline 首批 new = `videochat2, ffmpeg, videollama3, vllm-multimodal, transformers-video, opencv, …`；rewrite 批次避开以上。
2. **jsonl 分工**：research 只 **append** queued；pipeline **claim**；finalize 统一 written。
3. **比例**：auto-push 目标 new:rewrite = **50:50**（项目库比论文库更缺 media/devops new 稿）。

---

## 8. 本次执行记录（2026-06-05）

| 任务 | 状态 |
|---|---|
| 本文 master plan | ✅ |
| 队列新增 8 slug（torchcodec 等） | ✅ |
| 存量 patch 9 篇（video×5 + legacy×4） | ✅ |
| video-understanding hub 关联项目段 | ✅ |
| reading-stations-index 待扩充数 | ✅ |

**handoff → pipeline agent**：请 claim 并落盘 `ffmpeg`, `videochat2`, `videollama3`, `vllm-multimodal`, `transformers-video`, `opencv`（均为 queued、无磁盘文件）。勿改 decord/lmms-eval/internvideo/videollama2/llava-next/docker/kubernetes/redis/nginx（本轮已 patch）。

---

*维护：每轮 rewrite/new 完成后更新 §8 与 Top-20 状态列。*
