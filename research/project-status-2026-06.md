---
title: 项目现状总结（2026-06-06）
description: study 站双千推进、专题闭环、流水线状态与部署前快照
日期: 2026-06-06
状态: snapshot
---

# 项目现状总结（2026-06-06）

## 执行摘要

**study 站已写 1704 篇（papers 908 + projects 796），双千目标完成 8.52%；视频论文 65/65、媒体项目 50/50、阅读站 3 hub 已闭环，auto-push v3 因治理期 `STOP_SIGNAL` 暂停，本地 main 领先 origin 118 commit 待部署。**

---

## 双千进度表

| 维度 | 已写 | 目标 | 完成率 | 缺口 |
|---|---:|---:|---:|---:|
| 论文 papers | **908** | 10,000 | 9.08% | 9,092 |
| 项目 projects | **796** | 10,000 | 7.96% | 9,204 |
| **合计** | **1,704** | 20,000 | **8.52%** | 18,296 |

**流水线队列（`checkpoint.mjs --auto-update` 实测）**

| 池子 | 可用量 | 说明 |
|---|---:|---|
| candidates queued | 300 | papers 40 + projects 260（checkpoint 口径） |
| rewrite-pool available | 4 | 远低于 SKILL 要求的 ≥40，续跑前需扩容 |
| priority-queue | 38 条全 `picked` | 无 `status=new` 可消费 |
| build_streak | ok | 最近 build 连续通过 |

---

## 专题闭环

### 视频理解（论文 65/65）✅

- **候选池**：[`papers-video-understanding.md`](./papers-video-understanding.md) — 65 slug 全部落站
- **Hub**：[`/stations/video-understanding/`](/study/stations/video-understanding/)
- **路线图**：[`video-understanding-roadmap.md`](./video-understanding-roadmap.md)
- **本轮新增论文**：`vid-llm-survey-2023`、`videochat-2023`、`qwen2-vl-2024`、`tempcompass-2024`、`videollama3-2025` 等 20+ 篇

### 媒体基础设施（项目 50/50）✅

- **候选池**：[`projects-media.md`](./projects-media.md) — `已写: 50 / 待写: 0`
- **覆盖**：转码（ffmpeg/handbrake）、编解码（x264/x265/dav1d/svt-av1/libvpx）、音频（opus/lame/fdk-aac）、流媒体（gstreamer）、NLE（mlt/shotcut）等 12 子类
- **本轮强化**：dav1d、handbrake、lame、libvpx、mlt、opus、shotcut、svt-av1、x264、x265 等存量笔记 pipeline-v3 对齐

### 阅读站（3 hub）✅

| Hub | 已写 | 候选 | 路径 |
|---|---:|---:|---|
| 视频理解 | 65 | 65 | [`stations/video-understanding`](/study/stations/video-understanding/) |
| 多模态大模型 | 12+ | 26 | [`stations/mllm`](/study/stations/mllm/) |
| 分布式系统 | 75 | 60 | [`stations/distributed-systems`](/study/stations/distributed-systems/) |

- **总索引**：[`reading-stations-index.md`](./reading-stations-index.md) · 站点入口 [`/reading-stations/`](/study/reading-stations/)
- **待建 hub**：11 个（compilers-pl、graphics、ML、databases 等，见索引 §总览）

---

## 本轮会话成果时间线

| 时点 | papers | projects | 事件 |
|---|---:|---:|---|
| 会话起点（master plan 口径） | 804 | 731 | `papers-refactor-master-plan.md` 基线 |
| 2026-06-06 实测 | **908** | **796** | `sync-written.mjs` + 磁盘计数 |
| **净增** | **+104** | **+65** | 合计 +169 篇 |

**代表性 commit（最近 5）**

```
ad8da97e chore: sync-written + regen-atlas after +41 双千轮次
67611bdf feat: 双千轮次 +41 篇 pipeline-v3 笔记（媒体/安全/网络）
bc15ecc8 projects: add lame
b5f79cd8 projects: add opus
4671c480 projects: add svt-av1
```

**本轮新增研究层资产（未提交）**

- `research/papers-refactor-master-plan.md` — 804 篇论文重构总计划
- `research/projects-refactor-master-plan.md` — 731 篇项目重构总计划
- `research/pipeline-stop-investigation.md` — 流水线停止根因调查
- `research/reading-stations-index.md` — 14 专题阅读站规划
- `research/video-understanding-roadmap.md` — 视频专题路线图
- `src/content/docs/reading-stations.md` + `stations/{video-understanding,mllm,distributed-systems}.md`

---

## 架构资产

| 资产 | 路径 | 用途 |
|---|---|---|
| 论文 Master Plan | [`papers-refactor-master-plan.md`](./papers-refactor-master-plan.md) | 804→10k 六 Phase 路线图 |
| 项目 Master Plan | [`projects-refactor-master-plan.md`](./projects-refactor-master-plan.md) | 731→10k 四 Phase 路线图 |
| Pipeline 调查 | [`pipeline-stop-investigation.md`](./pipeline-stop-investigation.md) | STOP_SIGNAL / checkpoint / pick-batch 根因 |
| 阅读站索引 | [`reading-stations-index.md`](./reading-stations-index.md) | 14 专题 hub 规划与里程碑 |
| 视频路线图 | [`video-understanding-roadmap.md`](./video-understanding-roadmap.md) | 65/65 闭环维护清单 |
| 进度仪表盘 | [`data/STATUS.md`](../data/STATUS.md) | auto-push 自动生成，勿手改 |
| Atlas SSOT | `scripts/regen-atlas.mjs` | prebuild 重生成 908/796 索引 |

---

## 已知问题与停机原因

### STOP_SIGNAL（治理期显性开关）

- **状态**：`data/STOP_SIGNAL` **存在**（文件为空，时间戳 2026-06-05）
- **效果**：`exit-conditions.mjs` 返回 `user-stop`，`/auto-push` 启动即退
- **原因**：治理期 intentional — 批量写稿暂停，优先专题闭环 + 文档对齐 + 部署
- **勿删除**：除非完成恢复 checklist（`npm run verify` + L4 backfill 门槛）

### 续跑方式

```bash
# 1. 恢复 checkpoint（避免假 queue-empty）
node scripts/checkpoint.mjs --auto-update

# 2. 扩容 rewrite-pool（当前仅 4 available）
node scripts/build-rewrite-pool.mjs   # 按 master plan Phase 0 规则

# 3. 验证 build + gate 全绿
npm run verify

# 4. 人工移除 STOP_SIGNAL（治理期结束后）
rm data/STOP_SIGNAL

# 5. 重启 auto-push
# 见 .claude/skills/auto-push/SKILL.md
```

### 其他隐性阻塞（详见 pipeline 调查）

| 问题 | 严重度 | 说明 |
|---|---|---|
| checkpoint 曾缺失 | P0 | 导致 `exit-conditions` 误报 queue-empty；现已 `--auto-update` 修复 |
| rewrite-pool 枯竭 | P1 | 4 available << 40 门槛，每 round 有效 slug 远小于请求量 |
| priority-queue 全 picked | P1 | 无 new 条目可消费 |
| l4-backfill-queue 1519 条 | P1 | 超 OPERATIONS 恢复门槛 50 |

---

## 下一步（5 条）

1. **部署**：`git push origin main` 触发 GitHub Pages CI，将 118 个本地 commit + 本轮文档落盘上线
2. **同步首页规模**：更新 `index.md` 中 1522 → 1704 口径（与 atlas 一致）
3. **Phase 0 队列回填**：`candidates new/candidate → queued` + `build-rewrite-pool` 扩容至 ≥40
4. **阅读站 Phase 2**：优先建 compilers-pl / security-privacy hub（候选池已就绪）
5. **治理期结束后续跑**：完成 verify checklist → 移除 STOP_SIGNAL → auto-push round_size ≤ 20

---

## 相关链接

- 站点 live：<https://estelledc.github.io/study/>
- 论文 atlas：<https://estelledc.github.io/study/papers-atlas/>
- 项目 atlas：<https://estelledc.github.io/study/projects-atlas/>
- 阅读站入口：<https://estelledc.github.io/study/reading-stations/>
