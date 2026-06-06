---
title: 专题阅读站
description: 14 个专题 · 分阶段阅读路径 · 模仿 Embodied AI Reading Station 的信息架构
sidebar:
  order: 3
  label: 专题阅读站
---

> 把 828 篇论文按**专题**组织成可跟读的路线图，而不是只在字母序 atlas 里翻页。  
> 研究层总索引（含候选池、Phase 对齐）：仓库 [`research/reading-stations-index.md`](https://github.com/estelledc/study/blob/main/research/reading-stations-index.md)

## 样板与原则

本站的阅读站模仿 [Embodied AI Reading Station](https://estelledc.github.io/embodied-ai-reading-station/)：

- **专题分栏**：每个专题一个 hub 页，内含导读、分阶段表格、里程碑
- **阅读路径**：入门 → 进阶 → 工业对标，每步只链**已发布**的 `[[slug]]`
- **候选隔离**：`research/papers-*.md` 里的待写 slug 标「待写」，不进 wiki-link

## 已上线 hub（3）

| 专题 | 已写 | 候选 | Hub |
|---|---:|---:|---|
| [视频理解](/study/stations/video-understanding/) | 65 | 65 | Video-LLM · 长视频 · 评测 |
| [多模态大模型](/study/stations/mllm/) | 12 | 26 | CLIP → LLaVA 族谱 |
| [分布式系统](/study/stations/distributed-systems/) | 75 | 60 | 共识 · 复制 · 可观测 |

## 规划中 hub（11）

| 专题 | 已写 | 候选池 |
|---|---:|---|
| 编译器与 PL | 107 | `papers-compilers-pl` |
| 图形学 | 121 | `papers-graphics` |
| 机器学习通识 | 169 | `papers-machine-learning` |
| 数据库 | 64 | `papers-databases` |
| 操作系统 | 54 | `papers-operating-systems` |
| 网络协议 | 57 | `papers-network-protocols` |
| 形式化方法 | 51 | `papers-formal-methods` |
| 信息检索 | 52 | `papers-info-retrieval` |
| Agent | 22 | （交叉 ML / mllm） |
| 安全与隐私 | 4 | `papers-security-privacy` |
| GPU 架构 | — | `papers-gpu-architecture` |

## 与其他索引的关系

```text
专题阅读站（本页）  →  分专题 hub（stations/*）
        ↓
papers-atlas        →  全库按 taxonomy 扁平索引（build 自动生成）
        ↓
research/papers-*   →  候选池 + 待写队列（站外维护）
```

- **想系统读一个专题**：从上方 hub 进入，跟路线图走
- **想查某篇是否已写**：用 [论文全景索引](/study/papers-atlas/) 或 Cmd-K 搜索
- **想排期新稿**：看仓库 `research/papers-*.md` 与 `papers-refactor-master-plan.md`
