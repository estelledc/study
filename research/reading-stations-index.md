---
title: 专题阅读站总索引
description: 模仿 embodied-ai-reading-station 的信息架构，为 study 全库 828 篇论文规划 14 个专题阅读站
日期: 2026-06-05
状态: active
---

# 专题阅读站总索引

> **样板**：[Embodied AI Reading Station](https://estelledc.github.io/embodied-ai-reading-station/) — 按专题分栏、分阶段阅读路径、论文卡片 + 里程碑。  
> **站点 hub**：`src/content/docs/stations/{slug}.md` · 入口 [`/reading-stations/`](/study/reading-stations/)

## 总览

| 专题 slug | 名称 | 一句话 | 已写 | 候选 | Hub | 状态 |
|---|---|---:|---:|---|---|
| [video-understanding](#video-understanding) | 视频理解 | Video-LLM、长视频、时序评测与工程对照 | 65 | 65 | [`/stations/video-understanding/`](/study/stations/video-understanding/) | ✅ hub |
| [mllm](#mllm) | 多模态大模型 | CLIP→LLaVA 开源族谱 + 工业对标 + 评测怎么读 | 12+ | 26 | [`/stations/mllm/`](/study/stations/mllm/) | ✅ hub |
| [distributed-systems](#distributed-systems) | 分布式系统 | 时钟→共识→复制→存储→可观测性的工程主线 | 75 | 60 | [`/stations/distributed-systems/`](/study/stations/distributed-systems/) | ✅ hub |
| [compilers-pl](#compilers-pl) | 编译器与 PL | 类型论、语义、GC、JIT 与证明型编译器 | 107 | 80 | — | 📋 待建 |
| [graphics](#graphics) | 图形学 | 渲染方程、光线追踪、实时 GI 与神经渲染 | 121 | 60 | — | 📋 待建 |
| [machine-learning](#machine-learning) | 机器学习通识 | 训练、优化、生成、推荐与 MLOps 地基 | 169 | 80 | — | 📋 待建 |
| [databases](#databases) | 数据库 | OLTP/OLAP、LSM、NewSQL 与分布式事务 | 64 | 60 | — | 📋 待建 |
| [operating-systems](#operating-systems) | 操作系统 | 内核、虚拟化、调度与存储栈 | 54 | 60 | — | 📋 待建 |
| [network-protocols](#network-protocols) | 网络协议 | 端到端、拥塞控制、CDN 与数据中心网络 | 57 | 60 | — | 📋 待建 |
| [formal-methods](#formal-methods) | 形式化方法 | 模型检测、定理证明与分布式协议验证 | 51 | 50 | — | 📋 待建 |
| [info-retrieval](#info-retrieval) | 信息检索 | 向量检索、排序学习与 RAG 地基 | 52 | 50 | — | 📋 待建 |
| [agent](#agent) | Agent 与 LLM | 工具调用、规划、记忆与多模态 agent | 22 | — | — | 📋 待建 |
| [security-privacy](#security-privacy) | 安全与隐私 | 密码学、差分隐私、ZK 与可信执行 | 4 | 50 | — | 📋 待建 |
| [gpu-architecture](#gpu-architecture) | GPU 架构 | SIMT、Tensor Core 与 AI 加速器 | — | 40 | — | 📋 待建 |

*已写数来自 `src/content/docs/papers/` frontmatter 统计（2026-06-05）；候选数来自 `research/papers-*.md`。*

---

## video-understanding

**Hub**：[`stations/video-understanding`](/study/stations/video-understanding/) · **候选池**：[`papers-video-understanding.md`](./papers-video-understanding.md)

| 属性 | 值 |
|---|---|
| 已写 / 候选 | **65 / 65**（100%） |
| 代表 slug | `vid-llm-survey-2023` · `videochat-2023` · `qwen2-vl-2024` · `tempcompass-2024` |
| 关联项目 | **11 已写**（含 torchcodec；ffmpeg / opencv / librosa / yt-dlp / pillow 见 media 侧链） |

**阅读顺序（5 步）**：

1. 地图 — `vid-llm-survey-2023`
2. 对话范式史 — `videochat-2023` → `video-llama-2023` → `video-llava-2024`
3. 工业对标 — `qwen2-vl-2024` · `internvideo2-2024`
4. 长视频 + 评测 — `long-video-retrieval-2023` → `videomme-2024` → `tempcompass-2024`
5. 编码器基座 — `videoprism-2024`

---

## mllm

**Hub**：[`stations/mllm`](/study/stations/mllm/) · **候选池**：[`papers-mllm.md`](./papers-mllm.md)

| 属性 | 值 |
|---|---|
| 已写 / 候选 | **12 / 26**（枢纽篇已齐，专表待写 0 篇落站） |
| 代表 slug | `clip` · `align-2021` · `blip2-2023` · `llava` · `flamingo-2022` |
| 关联项目 | **3 已写** · **+2 待写**（transformers-video / vllm-multimodal 视频 serving 角） |
| 交叉专题 | 视频上限见 [video-understanding](#video-understanding)；图像生成见 machine-learning |

**阅读顺序（5 步）**：

1. 对比预训练 — `clip` · `align-2021`
2. 连接器范式 — `blip2-2023` · `flamingo-2022` · `coca-2022`
3. 指令微调 — `llava`
4. 视觉编码器 — `vit` · `mae` · `dino` · `sam`
5. 细粒度对齐 — `filip-2021`（待写：`mme-benchmark-2023` · `internvl2-2024`）

---

## distributed-systems

**Hub**：[`stations/distributed-systems`](/study/stations/distributed-systems/) · **候选池**：[`papers-distributed-systems.md`](./papers-distributed-systems.md)

| 属性 | 值 |
|---|---|
| 已写 / 候选 | **75 / 60**（候选大多已落站） |
| 代表 slug | `lamport-1978` · `paxos` · `raft` · `spanner` · `dynamo` |
| 关联项目 | **3 已写** · **+5 待链**（etcd / helm / prometheus / containerd / vault） |

**阅读顺序（5 步）**：

1. 时间与不可能 — `lamport-1978` · `flp-1985` · `byzantine-generals-1982`
2. 共识经典 — `paxos` → `raft` → `vr-revisited-2012`
3. 工业复制 — `chubby` · `spanner` · `dynamo`
4. 存储与计算 — `gfs` · `mapreduce` · `chain-replication-2004`
5. 最终一致与协同 — `crdt-shapiro-2011` · `vogels-eventual-2009` · `dapper-2010`

---

## compilers-pl

**候选池**：[`papers-compilers-pl.md`](./papers-compilers-pl.md) · 已写 **107**（编程语言一级主题）

**阅读顺序（4 步）**：计算理论基础 → 类型系统 → 编译优化/GC → 证明型编译器（`compcert` · `cakeml`）

**代表 slug**：`hindley-milner` · `compcert` · `mlir` · `graalvm-truffle`

---

## graphics

**候选池**：[`papers-graphics.md`](./papers-graphics.md) · 已写 **121**

**阅读顺序（4 步）**：光栅基础 → 光线追踪 → 实时 GI → 神经渲染（`3d-gaussian-splatting`）

**代表 slug**：`kajiya-1986-rendering-equation` · `whitted-1980`（待写） · `path-tracing`

---

## machine-learning

**候选池**：[`papers-machine-learning.md`](./papers-machine-learning.md) · 已写 **169**（含视频/多模态子集）

**阅读顺序（4 步）**：优化与缩放律 → Transformer 地基 → 生成模型 → MLOps

**代表 slug**：`attention` · `scaling-laws` · `ddpm` · `mlflow`

---

## databases

**候选池**：[`papers-databases.md`](./papers-databases.md) · 已写 **64**

**阅读顺序（4 步）**：关系模型 → 事务与恢复 → 分布式 SQL → 分析型列存

**代表 slug**：`codd-1970` · `aries-1992` · `spanner` · `cstore-2005`

---

## operating-systems

**候选池**：[`papers-operating-systems.md`](./papers-operating-systems.md) · 已写 **54**

**阅读顺序（4 步）**：内核结构 → 虚拟化 → 调度 → 文件系统

**代表 slug**：`exokernel-1995` · `kvm-2007` · `borg`（交叉分布式）

---

## network-protocols

**候选池**：[`papers-network-protocols.md`](./papers-network-protocols.md) · 已写 **57**

**阅读顺序（4 步）**：端到端 → 拥塞控制 → 数据中心网络 → CDN/Anycast

**代表 slug**：`saltzer-1984-e2e` · `tcp-congestion` · `datacenter-tcp`

---

## formal-methods

**候选池**：[`papers-formal-methods.md`](./papers-formal-methods.md) · 已写 **51**

**阅读顺序（4 步）**：Hoare 逻辑 → 模型检测 → 分离逻辑 → 分布式验证（`disel-2018`）

**代表 slug**：`hoare-logic` · `cbmc` · `reynolds-separation-logic`

---

## info-retrieval

**候选池**：[`papers-info-retrieval.md`](./papers-info-retrieval.md) · 已写 **52**

**阅读顺序（4 步）**：经典 IR → 向量检索 → 神经排序 → RAG 邻域

**代表 slug**：`bm25` · `faiss-2017` · `dpr-2020`

---

## agent

已写 **22**（`分类: Agent`）· 与 mllm / machine-learning 交叉

**阅读顺序（4 步）**：ReAct 范式 → 记忆与反思 → 多模态 agent → 评测

**代表 slug**：`react` · `reflexion` · `voyager` · `mmskills-multimodal`

---

## security-privacy

**候选池**：[`papers-security-privacy.md`](./papers-security-privacy.md) · 已写 **4** · 候选 **50**

**阅读顺序（4 步）**：经典密码学 → ZK → 差分隐私 → MPC

**代表 slug**：`zk-snark`（在站）· 待写 `dp-sgd-2016` · `mpc-gmw-1987`

---

## gpu-architecture

**候选池**：[`papers-gpu-architecture.md`](./papers-gpu-architecture.md)

**阅读顺序（3 步）**：SIMT 模型 → Tensor Core → 集群互连

---

## 与样板站对照

| 样板特征 | study 落地 |
|---|---|
| 11 个专题罗马数字分栏 | 14 个 `stations/{slug}` hub（先建 3 个） |
| 每专题「祖师爷→经典→前沿」 | 阅读路线图分阶段表格 + 难度标注 |
| 首页统计（篇数/字数/专题数） | `reading-stations.md` 总览表 |
| 30 天路径 / FAQ | 各 hub「里程碑」+ research roadmap 链 |
| 与代码/项目关系 | hub「关联项目」段 + projects-atlas 交叉链 |

---

*维护：新增 hub 时同步更新本表 `状态` 列与 `astro.config.mjs` 侧栏。*
