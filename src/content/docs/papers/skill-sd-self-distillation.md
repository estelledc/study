---
title: Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
来源: 'Skill-SD: Skill-Conditioned Self-Distillation for Multi-turn LLM Agents, arXiv:2604.10674, 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 高级
provenance: pipeline-v3
---

## 是什么

Skill-SD 是一套**让 agent 自己跑出轨迹、抽成 skill，再用这些 skill 当老师反过来蒸馏自己**的训练方法。蒸馏目标用 importance-weighted reverse-KL，让模型不仅模仿 teacher 还过滤掉 teacher 自己也不擅长的 skill。日常类比：实习生先自己干一周活，把干得最好的几次写成 SOP，然后下周拿这本 SOP 当镜子照自己——SOP 哪里漂亮就照着改哪里，不漂亮的部分跳过。

旧蒸馏路线（Distill-then-Use）有个问题：teacher 是一个固定的强模型（如 GPT-4），蒸馏 student 学完就停了。Skill-SD 反过来：**teacher 是 student 自己跑出来的高质量轨迹抽出的 skill**——这意味着 teacher 一直在变，每轮训练都用上一轮 student 跑出来的 best-of-N skill 蒸下一轮。这叫 dynamic teacher。

蒸馏目标用 reverse-KL（KL(student || teacher)）而不是常规 forward-KL。reverse-KL 的特性是 mode-seeking——只学 teacher 高概率的部分，遇到 teacher 自己也不确定的领域不强行模仿。importance weighting 进一步给那些"student 当前差但 teacher 强"的 skill 加大权重——重点补短板。论文报告 AppWorld 上 +14%。

## 为什么重要

不理解 Skill-SD，下面这些事都没法解释：

- 为什么 2026 年 agent 训练论文集体往 self-distillation 走——找不到比 GPT-4 更强的 teacher 了
- 为什么 reverse-KL 在 LLM 蒸馏里逐渐取代 forward-KL —— 后者会强行学 teacher 的所有缺点
- 为什么"用 agent 自己的轨迹当训练数据"是 RLAIF 后又一波循环——闭环训练的关键
- 为什么 multi-turn agent 的训练比单轮 LLM 难——每一步错误都会放大到后续 turn

## 核心要点

Skill-SD 拆成 **三步**：

1. **Skill 抽取**：让 student agent 跑 N 条任务轨迹，按完成度 + 简洁度选 top-K 轨迹，抽成 dynamic skill 集合。类比：实习生干一周活，把干得最漂亮的几件留底，作为下周参照。

2. **Reverse-KL 蒸馏**：把这些 skill 当 teacher policy，用 KL(student || skill-policy) 训练 student。reverse-KL 的特点是 student 只学 skill 高确信度的部分，skill 不擅长的领域 student 保持原能力。

3. **Importance Weighting**：每个样本根据"当前 student 表现 vs skill 表现"的差距给权重。差距大的（student 弱、skill 强）权重高——重点补；差距小的或 student 已比 skill 强的样本权重低或负——避免 regression。

三步咬合：自抽 skill 当变化的 teacher、reverse-KL 防过拟合、importance weighting 防退化。

整套流程不需要外部强模型——前提是 student 一开始能跑通基本任务（保底有"good 轨迹"可挑）。

这种"自给自足"的训练循环让 Skill-SD 在没有 GPT-4 级别 teacher 时仍然能持续进步——这对开源模型团队尤其重要。

## 实践案例

下面三个案例分别展示 dynamic teacher、reverse-KL、importance weighting 的具体作用。

### 案例 1：dynamic teacher 比 fixed teacher 走得更远

固定 teacher（GPT-4）蒸馏 student（Llama-8B）通常 6-8 epoch 就饱和——student 已学到 teacher 在该任务能教的全部。

Skill-SD 第 1 epoch 用 student 自己的轨迹做 teacher。一开始 teacher 弱，但每轮 student 进步后 teacher 也跟着升级。论文 AppWorld 上 12 epoch 还在涨——天花板由"student 能跑出多好的轨迹"决定，不是 teacher 卡住。

teacher 一直在变这件事是 +14% 主要来源。论文同时跑了 fixed-teacher 对照——12 epoch 时 fixed 已停涨，dynamic 还有 3pp 上升空间。

case 1 也解释为什么 dynamic 路线在 instruction-following 类任务上能持续走远——student 的进步直接拉高了 teacher。

### 案例 2：reverse-KL 不学 skill 的犹豫

某条 dynamic skill 在"处理日历邀请冲突"上表现一般——成功率 60%，模型自己也不太确定。

forward-KL 蒸馏会让 student 完整模仿 teacher 在这一段的概率分布——包括那些"我也不太确定"的部分。reverse-KL 是 mode-seeking——student 只学 skill 高概率高确信度的子集，对犹豫部分保持原能力。

整体效果：student 在 skill 强的领域学得快，在 skill 弱的领域不退化。

这是 Skill-SD 区别于"硬学 GPT-4 蒸馏" 的一个重要稳态——它从来不要求 student 的输出分布完全等于 teacher。

### 案例 3：importance weighting 补短板

任务集中 student 在"邮件搜索 + 总结"任务上特别差，准确率 40%。skill 在这类任务上准确率 80%。

importance weighting 计算 weight = (skill_perf - student_perf) = 0.4，权重很高。这类样本在训练 batch 里被重复采样、训练 loss 占比高。

3 epoch 后 student 在邮件类任务追到 75%，weight 降到 0.05——自动减重，转向其他短板。这是个自适应的课程学习。

importance weight 还有一个反向作用：student 在某项任务比 skill 强时，weight 会变成负数（论文裁到 0），这一类样本被排除以避免 student 学回弱版 teacher。

## 踩过的坑

1. **dynamic teacher 噪声大**：student 跑出的轨迹质量参差，top-K 选不严格会引入噪声。论文用三阈值（完成度 + 简洁度 + LLM judge 评分）筛 top-K。如果阈值放太松，前几 epoch 就会让 student 学到自己的失败模式被强化。
2. **reverse-KL 训练不稳**：mode-seeking 的特性让训练初期容易卡在某个 mode 上，需要 warm-up 用 forward-KL 几个 epoch 再切。
3. **importance weight 容易溢出**：差距大时 weight 会很大，要 clipping 防 batch 内单样本主导。
4. **多轮 agent 蒸馏每一步都要带状态**：单 turn 蒸馏数据简单，multi-turn 要把整条 trajectory 当 sequence 处理，否则 step-level 错误传不下去。
5. **skill 抽取本身的成本不可忽视**：每 epoch 都要重新跑 N 条轨迹 + LLM judge 选 top-K，训练 wallclock 比传统蒸馏长 2-3 倍。

论文还做了消融——去掉 importance weighting 整体掉 5pp，去掉 reverse-KL 改回 forward-KL 掉 8pp，去掉 dynamic teacher 改 fixed teacher 掉 11pp。三个改动都是必要的，去任意一个效果就明显折扣。

## 适用 vs 不适用场景

**适用**：

- 已有一个能跑通基本任务的 base agent，目标是优化它（不是冷启动）
- 任务空间能产生足够多样的 trajectory（采样后 top-K 有差异）
- 有显式的成功度量（完成度可自动判定）
- 训练算力可承受 multi-epoch + 每 epoch 重新抽 skill

**不适用**：

- agent 完全不能跑（trajectory 全是 garbage，没法 self-distill）
- 任务奖励稀疏到 top-K 也没几条好轨迹
- 需要快速上线（dynamic teacher 训练周期长）
- 单 turn 任务（multi-turn 设计的优势用不上）

这种设计也带来一个工程负担：训练系统得同时维护"采样—筛选—蒸馏"三段流水线，每段都有自己的容错和监控。

## 历史小故事（可跳过）

- **2015**：Hinton 等提出经典蒸馏 forward-KL，从 logits 学
- **2023**：DPO/RLAIF 把"AI 反馈训练自己"工程化，但仍需要外部 reward model
- **2024**：MiniLLM 等 LLM 蒸馏论文开始用 reverse-KL，发现 mode-seeking 性质适合 LLM
- **2025**：self-rewarding LLM 把 teacher 内化到 student 自己，开启自蒸馏路线
- **2026 年初**：Skill-SD 把这条路线推到 agent 场景——关键是把"轨迹"抽成 skill 中介
- **同期**：[[mind-skill]] / [[effiskill]] / [[skill-as-pseudocode]] 各从不同维度做 skill 工作
- **预期**：未来一年"无外部 teacher 训练"会成为 8B-30B agent 模型的标配训练流水线

skill 在 Skill-SD 里既是产物又是训练信号——把"经验"变成"训练数据"的转换器。

这一点要看清——很多论文给出了漂亮的训练曲线，但没说工程团队需要多少新的工具链来支撑它。

## 学到什么

1. **dynamic teacher 比 fixed teacher 上限高**：teacher 也在长，天花板更远
2. **reverse-KL 适合 LLM 蒸馏**：mode-seeking 帮你只学 teacher 强的部分
3. **importance weighting 自带课程学习**：自动聚焦短板，省掉手工 curriculum
4. **skill 是经验的载体**：把轨迹经过 skill 这层中介比直接拿轨迹蒸更稳定
5. **self-distillation 是不依赖外部强模型的路线**：当你已经是最强 teacher 时这条路就是唯一选项
6. **skill 是经验和训练之间的桥**：agent 攒经验 + agent 训练这两条线，靠 skill 这层中介衔接起来

## 延伸阅读

- 论文原文：[arXiv 2604.10674](https://arxiv.org/abs/2604.10674)
- AppWorld benchmark：[appworld.dev](https://appworld.dev/)
- MiniLLM reverse-KL：[arXiv 2306.08543](https://arxiv.org/abs/2306.08543)
- [[voyager]] —— skill 库奠基
- [[mind-skill]] —— 同期 skill 质量工作
- [[skill-as-pseudocode]] —— 同期 skill 表示工作

[arXiv 2604.10674](https://arxiv.org/abs/2604.10674) 详细给出了三阈值的消融、warm-up 长度选择，以及 weight clipping 的影响曲线。

## 关联

- [[voyager]] —— skill 库奠基；Skill-SD 把 skill 当 teacher
- [[mind-skill]] —— 同期 skill 工作；侧重质量保证
- [[skill-as-pseudocode]] —— 同期 skill 表示工作；垂直补充
- [[effiskill]] —— 同期 skill 层次化工作
- [[skill-pro-nonparametric-ppo]] —— 同期不动权重学 skill 路线；Skill-SD 走的是改权重路线
- [[webxskill]] —— Web agent skill 同期工作
- [[dpo-2023]] —— preference-based 蒸馏，与 Skill-SD 共享 RLAIF 思想

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[effiskill]] —— EffiSkill — 把代码效率优化经验抽成两层 skill 库
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-pro-nonparametric-ppo]] —— Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
- [[voyager]] —— Voyager — LLM 终身学习智能体
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引

