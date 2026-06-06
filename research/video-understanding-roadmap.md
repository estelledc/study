---
title: 视频理解专题 — 写作路线图与维护清单
description: 已写 65 / 候选 65，待写 0；四条可执行路线、高 ROI 下一批、study v3 流水线对接
日期: 2026-06-06
已写: 65
待写: 0
---

# 视频理解专题路线图

> **2026-06 部署前状态**：论文 65/65 已闭环；全站 papers 908 / projects 796；流水线因 `STOP_SIGNAL` 暂停。详见 [`project-status-2026-06.md`](./project-status-2026-06.md)。

## 1. 现状盘点

### 论文侧

| 维度 | 数量 | 说明 |
|---|---:|---|
| 候选池总量 | **65** | [`papers-video-understanding.md`](./papers-video-understanding.md) |
| 已写（atlas ✅ v3） | **65** | 占候选 100%（2026-06-06 专题收齐） |
| 待写 | **0** | 候选池已全部落站 |
| 子类覆盖 | 10 类 | §2 对话式已全覆盖；§9 Agent / §10 反事实为新开 |

**已写 8 篇**（站点 slug = 候选 slug）：

| slug | 子类 | 枢纽价值 |
|---|---|---|
| `vid-llm-survey-2023` | §1 综述 | 术语表 |
| `videochat-2023` | §2 对话 | 范式开山 |
| `video-llama-2023` | §2 对话 | 音视频 |
| `video-llava-2024` | §2 对话 | LLaVA→视频 |
| `qwen2-vl-2024` | §2 对话 | 工业对标 |
| `long-video-retrieval-2023` | §3 压缩 | 长视频检索 |
| `tempcompass-2024` | §3 评测 | 时间概念 |
| `videoprism-2024` | §6 编码器 | 冻结基座 |

### 项目侧

| 维度 | 数量 | 说明 |
|---|---:|---|
| 正式候选 | **9** | [`projects-video-understanding.md`](./projects-video-understanding.md) |
| 已写 | **5** | decord / lmms-eval / internvideo / videollama2 / llava-next |
| 待写 | **4** | videochat2 / videollama3 / vllm-multimodal / transformers-video |
| media 池 P0/P1 | **5** | ffmpeg P0 · opencv/librosa P1 · pillow/yt-dlp P2 |

### 数据层不一致（待修）

| 问题 | 现状 | 应改为 |
|---|---|---|
| research frontmatter「已写 3」 | 过时 | **8**（已修） |
| `candidates.jsonl` 8 行 status | `queued` | `written` |
| 候选表原计数 45 | 实际 44 + 漏 moviechat / internvideo2 | **46** |

---

## 2. 四条可执行写作路线

### 路线 1：入门 + 范式史（优先级 P0）

| 属性 | 值 |
|---|---|
| **目标读者** | 第一次系统读 Video-LLM |
| **预计篇数** | 3 篇待写（已有 5 篇可读） |
| **依赖** | 站内 [[llava]]、[[clip]]、[[blip2-2023]] |
| **顺序** | `video-chatgpt-2023` → `mvbench-2023` → `llava-onevision-2024` |
| **产出价值** | 补全 2023 开山 → 2024 评测 → 2024 统一多模态闭环 |

**与已写衔接**：`video-chatgpt` 前置 [[videochat-2023]]；`mvbench` 含 VideoChat2 对照 [[videochat-2023]]；`llava-onevision` 后继 [[video-llava-2024]]。

### 路线 2：长视频 + 评测（优先级 P0）

| 属性 | 值 |
|---|---|
| **目标读者** | 要做长视频 benchmark 或训练配方 |
| **预计篇数** | 6–8 篇 |
| **依赖** | 路线 1 的 `mvbench`；已写 [[long-video-retrieval-2023]]、[[tempcompass-2024]] |
| **顺序** | `videomme-2024` → `mlvu-2024` → `egoschema-2023` → `timechat-2024` → `llama-vid-2023` → `moviechat-2024` → `longva-2024` → `videochat-flash-2025` |
| **工具** | [[lmms-eval]] 跑分验证 |

**里程碑**：写完前 3 篇评测后，可用 lmms-eval 对 [[qwen2-vl-2024]] 复现榜单，笔记带实证。

### 路线 3：VTG / 时空定位（优先级 P1）

| 属性 | 值 |
|---|---|
| **目标读者** | 视频搜索、精彩集锦、监控 query 定位 |
| **预计篇数** | 7–10 篇（不必全写 §8.1 经典） |
| **依赖** | 已写 [[video-llava-2024]]、[[tempcompass-2024]]；建议先写 `timechat-2024` |
| **顺序** | `qvhighlights-2021` → `vtimellm-2023` → `vtg-llm-2024` → `grounded-videollm-2024` → `vidstg-2020` → `spacevllm-2025` |
| **跳过可接受** | `2d-tan` / `vslnet` / `ta-stvg`（ROI 低，research 表保留即可） |

### 路线 4：工业对标 + 编码器栈（优先级 P1）

| 属性 | 值 |
|---|---|
| **目标读者** | 对齐开源榜首与闭源上限 |
| **预计篇数** | 4–5 篇 |
| **依赖** | papers-mllm `gemini-1.5` / `nvila`；已写 [[qwen2-vl-2024]]、[[videoprism-2024]] |
| **顺序** | `internvideo2-2024` → `llava-video-2024` → `longvila-2024` → papers-mllm `nvila-2024`（交叉链，不单开视频笔记） |
| **项目对照** | [[internvideo]]、[[llava-next]] |

---

## 3. 与 study v3 流水线对接

### Slug 命名

- 格式：`{topic}-{year}`，与 `src/content/docs/papers/{slug}.md` 一致
- 新追加：`moviechat-2024`、`internvideo2-2024` 已入候选表，写笔记时直接用
- **禁止**：正式笔记 slug 与候选表分叉（long-video-retrieval 站内展示名 R-VLM 但 slug 不变）

### Frontmatter 约定（论文）

```yaml
分类: 机器学习
子分类: 视频理解
难度: 初级|中级|高级
provenance: manual-read|auto-push
```

分类 SSOT：`data/taxonomy.json`；build 前 `node scripts/regen-atlas.mjs` 刷新 atlas。

### 反向链接

- 笔记正文用 `[[slug]]` 链枢纽与邻域论文
- 每篇 Video 笔记建议至少链：1 个 MLLM 枢纽 + 1 篇本专题已写 + 1 个配套项目（若有）
- research 层用相对路径 `./papers-video-understanding.md`；站点层用 wiki-link

### auto-push / candidates 流程

1. 从 `data/candidates.jsonl` 按 `topic: video-understanding` + `status: queued` pick batch
2. 五阶段 pipeline 产出 `src/content/docs/papers/{slug}.md`
3. 写完后更新：`candidates.jsonl` → `written`；`papers-video-understanding.md` 对应行 → `✓ 已写`
4. `node scripts/regen-atlas.mjs` → commit（用户触发时）

### 本专题建议 round 配比

- 下一批 8 slug round：**6 论文 + 0 项目**（项目池已清空）+ 2 重写（可选）
- 优先 topic 顺序：路线 2 评测三件套 → 路线 1 缺口 → 路线 3 VTG 头部

---

## 4. 下一批高 ROI 候选（10 篇）

| 优先级 | slug | 理由 | 与已写关系 |
|:---:|---|---|---|
| 1 | `videomme-2024` | 2024+ 事实标准高考卷；[[lmms-eval]] 必跑 | 并列 [[tempcompass-2024]] |
| 2 | `mvbench-2023` | 20 纯时序任务 + VideoChat2 三阶段训练样板 | 后继 [[videochat-2023]] |
| 3 | `video-chatgpt-2023` | Video-LLM 指令微调开山，补范式史缺口 | 前置 [[videochat-2023]] |
| 4 | `timechat-2024` | 长视频 Q-Former 路线；衔接 R-VLM 与 VTG | 后继 [[long-video-retrieval-2023]] |
| 5 | `llava-onevision-2024` | 统一 image/video 涌现能力；[[llava-next]] 代码归宿 | 后继 [[video-llava-2024]] |
| 6 | `internvideo2-2024` | 补 [[internvideo]] 项目论文断层 | 并列 [[videoprism-2024]] |
| 7 | `egoschema-2023` | 3min egocentric 长视频诊断 benchmark | 配 lmms-eval |
| 8 | `qvhighlights-2021` | VTG 全线祖宗；Moment-DETR | §8 入口 |
| 9 | `vtimellm-2023` | LLM 做 VTG 的第一批系统工作 | 链 [[video-llava-2024]] |
| 10 | `llava-video-2024` | 2024 开源 Video-LLM 数据配方标杆 | 后继 [[video-llava-2024]] |

**若只做 5 篇**：取优先级 1–5。

---

## 5. 项目侧：media 候选池升格建议

[`projects-media.md`](./projects-media.md) 与视频理解专题的边界：**media = 编解码/流媒体管线；video-understanding = 语义理解模型与评测**。

| media slug | 建议 | 理由 |
|---|---|---|
| `opencv` | **升格为正式项目笔记（P2）** | Video-LLM 数据预处理 fallback；与 [[decord]] 对照读 |
| `ffmpeg` | **保持 media，写交叉引用即可** | 转码基建；理解模型不依赖深读 ffmpeg 源码 |
| `sam2` | **可选升格（P3）** | 视频通用分割；偏 CV 非 Video-LLM，但与 STVG 邻域 |
| `ultralytics` | **不升格** | 检测跟踪；与 Video-LLM QA 主线偏离 |
| Ask-Anything / OpenGVLab 官方仓 | **考虑新增候选 `videochat2` 项目** | MVBench/VideoChat2 代码归宿，目前只有论文无项目笔记 |

**已完备（无需再写）**：decord、lmms-eval、internvideo、videollama2、llava-next。

---

## 6. 维护任务清单

### 每次新写一篇视频论文后

- [ ] `papers-video-understanding.md`：对应行 `状态` → `✓ 已写`
- [ ] `data/candidates.jsonl`：`status` → `written`
- [ ] 笔记 frontmatter：`分类`/`子分类` = 机器学习 / 视频理解
- [ ] 反向链接：枢纽 + 至少 1 篇同专题已写
- [ ] `node scripts/regen-atlas.mjs`（或等 build 自动）
- [ ] 检查本 roadmap §1 计数

### 每次批量 research 更新后

- [ ] frontmatter `已写`/`待写` 与 atlas 一致
- [ ] 新增候选注明追加理由与 arXiv
- [ ] papers-mllm 重叠表无需重复条目

### atlas 更新时机

- **自动**：每次 `npm run build` 前 regen-atlas
- **手动**：research 层大改后本地 build 验证「机器学习 → 视频理解」小节条数

### 跨专题交叉引用

- [ ] [`world-model-robot-learning-2026-lr-notes.md`](./world-model-robot-learning-2026-lr-notes.md) ↔ 本专题（视频预训练 vs 理解 QA）
- [ ] [`papers-mllm.md`](./papers-mllm.md) §重叠表保持同步

---

## 7. 里程碑建议

| 阶段 | 目标 | 预计累计已写 |
|---|---|---:|
| M1 | 范式+对话基础 | 8 ✓ |
| M2 | +评测三件套 + video-chatgpt | 12 ✓（**32**，batch1 已超） |
| M3 | +长视频方法 4 篇 | 16 ✓ |
| M4 | +VTG 头部 4 篇 | 20 ✓（**46**，batch2 §8 全线 16/16） |
| M5 | §4 统一多模态补齐 | 24 ✓（当前 **54**） |

完成 M3 后，本专题可支撑「长视频 Video-LLM」面试/综述级问答；M4 后覆盖 VTG 工业落地叙事。

**全库上下文**：本路线图对应 [`papers-refactor-master-plan.md`](./papers-refactor-master-plan.md) **Phase 3**（视频+MLLM 新稿）；legacy 枢纽 rewrite 走 **Phase 1** 独立 worktree，不与本专题 new 抢 slug。

---

## 8. 2026-06 队列扩充

### 新增统计

| 类型 | 新增数 | 来源文件 |
|---|---:|---|
| 论文候选 | **19** | `papers-video-understanding.md`（46→65） |
| MLLM 交叉论文 | **4** | `papers-mllm.md`（22→26：`gemini-2-5` / `internvl2-5` / `qwen2-5-vl` / `mm-navigator`） |
| 项目候选 | **4** | `projects-video-understanding.md`（5→9） |
| `candidates.jsonl` 新行 | **23** | 19 论文 + 4 项目（`status: queued`，未 claim） |

### 新增论文 slug（19，均已核实 arXiv）

`videollama2-2024` · `videollama3-2025` · `qwen2-5-vl-2025` · `internvideo2-5-2025` · `chapter-llama-2025` · `llmvs-2025` · `videollm-online-2024` · `flash-vstream-2024` · `livevlm-2025` · `worldsense-2025` · `videoagent-longform-2024` · `videoagent-memory-2024` · `traveler-2024` · `omagent-2024` · `vinoground-2024` · `cover-2025` · `countervqa-2025` · `dense360-2025` · `omnidirectional-mllm-2025`

### 新增项目 slug（4）

`videochat2` · `videollama3` · `vllm-multimodal` · `transformers-video`

### 与既有 46 篇去重说明

- **零 slug 冲突**：19 个新 slug 均不在原 46 篇候选表与 8 篇已写笔记中
- **同名论文区分**：两篇 ECCV 2024 `VideoAgent` 拆为 `videoagent-longform-2024`（Wang, 2403.10517）与 `videoagent-memory-2024`（Fan, 2403.11481）
- **MLLM 双表互链**：`qwen2-5-vl-2025` 同时入 mllm 表（工业对标）与视频表（VideoMME/VTG 实证），slug 相同、笔记分工不同
- **未重复收录**：`MM-Navigator` 归 mllm（GUI agent）；`VideoLLM-online` / `Flash-VStream` 原表缺失，本次补入 §7

### 建议下一 dispatch 批次（15 slug）

优先延续路线 2（评测）+ 路线 1（范式史）+ 新开流式线：

1. `videomme-2024`
2. `mvbench-2023`
3. `video-chatgpt-2023`
4. `worldsense-2025`
5. `internvideo2-2024`
6. `timechat-2024`
7. `llava-onevision-2024`
8. `videollm-online-2024`
9. `livevlm-2025`
10. `qwen2-5-vl-2025`
11. `vinoground-2024`
12. `videoagent-longform-2024`
13. `egoschema-2023`
14. `videollama2-2024`
15. `videochat2`（项目）

**若只做 8 slug round**：取 1–8。
