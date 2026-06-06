# Changelog

## 2026-06-06 — 双千推进与专题站

### 规模

- **papers**：804 → **908**（+104）
- **projects**：731 → **796**（+65）
- **合计**：1,535 → **1,704**（双千目标 8.52%）

### 专题闭环

- **视频理解**：论文候选 65/65 全部落站；hub [`/stations/video-understanding/`](/study/stations/video-understanding/)
- **媒体基础设施**：项目候选 50/50 全部落站（[`projects-media.md`](./research/projects-media.md)）
- **阅读站**：3 个 hub 上线（video-understanding · mllm · distributed-systems）；入口 [`/reading-stations/`](/study/reading-stations/)

### 研究层资产

- [`research/project-status-2026-06.md`](./research/project-status-2026-06.md) — 项目现状快照
- [`research/papers-refactor-master-plan.md`](./research/papers-refactor-master-plan.md) — 论文库重构总计划
- [`research/projects-refactor-master-plan.md`](./research/projects-refactor-master-plan.md) — 项目库重构总计划
- [`research/pipeline-stop-investigation.md`](./research/pipeline-stop-investigation.md) — 流水线停止根因调查
- [`research/reading-stations-index.md`](./research/reading-stations-index.md) — 14 专题阅读站规划
- [`research/video-understanding-roadmap.md`](./research/video-understanding-roadmap.md) — 视频专题路线图

### 流水线

- `data/STOP_SIGNAL` 保持存在（治理期 intentional）
- `checkpoint.mjs --auto-update` 修复队列口径；`build_streak: ok`
- rewrite-pool available 仅 4，续跑前需 Phase 0 扩容

### 部署

- GitHub Pages CI：`.github/workflows/deploy.yml`（push main → build + deploy）
- Live URL：<https://estelledc.github.io/study/>
