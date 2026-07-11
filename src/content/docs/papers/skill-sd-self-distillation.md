---
title: Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
来源: 'Skill-SD: Skill-Conditioned Self-Distillation for Multi-turn LLM Agents, arXiv:2604.10674, 2026'
日期: 2026-04-12
分类: agents
难度: 高级
---

## 是什么

Skill-SD 是一套**把 agent 自己跑过的轨迹总结成自然语言 skill，只塞给 teacher 当特权提示，再蒸馏回 student** 的训练方法。日常类比：实习生先自己干一周活，把成败写成 SOP；教练拿着 SOP 示范，实习生仍只看任务单——SOP 从不进考场。

旧路线里，固定特权信息（如唯一标准答案）适合数学/代码，但 agent 任务常有多条合法路径。Skill-SD 反过来：从自己的 rollout 抽出 skill，**只条件化 teacher**；student 始终用普通任务 prompt，靠蒸馏把指导内化。训练时 teacher 与 student **同参不同 prompt**，并周期性把 teacher 同步到最新 student。

蒸馏用 **importance-weighted reverse-KL**（重要性加权的反向 KL）：白话是「只学老师有把握、且梯度算对的那部分」，再和 GRPO 强化学习一起优化。论文用 Qwen3-4B-Instruct-2507，AppWorld 相对 vanilla GRPO **+14.0%**（64.9%），Sokoban **+10.9%**（62.5%）；相对 vanilla OPD 提升更大。

和「找一个更强外部模型硬蒸」不同：这里 teacher 与 student 是同一套权重，差别只在 prompt 里有没有 skill。进步来自自己轨迹里提炼出的策略摘要，而不是外挂 GPT-4。

## 为什么重要

不理解 Skill-SD，下面这些事都没法解释：

- 为什么 agent 自蒸馏不能照搬「塞标准答案给 teacher」——合法策略太多，固定参考会锁死探索
- 为什么 skill 只给 teacher、不给 student——避免推理时依赖检索/特权上下文
- 为什么 reverse-KL 还要加 importance weight——同参跨 prompt 时，朴素 k3 估计会给错梯度
- 为什么 teacher 必须跟着 student 同步——不同步或冻结会 collapse / 卡在低平台

## 核心要点

Skill-SD 拆成 **三步**：

1. **抽 skill**：把完成的轨迹总结成短自然语言——成功做法、踩坑、工作流。类比：把一周流水账压成一页 SOP。
2. **Skill 条件化 teacher**：teacher 看「任务 + skill」，student 只看任务；同参自蒸馏，推理时 student 不带 skill。类比：教练看讲义，考生只看考卷。
3. **IW reverse-KL + 同步**：用重要性权重修正跨 prompt 的 reverse-KL 梯度，并周期性 `teacher ← student`，再与 GRPO 联合训练。类比：镜子跟着人长高，照出来才不歪。

三步咬合：自抽 skill 当动态特权信号、只条件化 teacher 保推理干净、加权 reverse-KL + 同步保训练稳。

奖励用 completion-rate（子目标完成比例），比纯 0/1 成功更能保留部分进度。skill bank 训练时用轻量 UCB 检索，而不是再挂一个向量模型。

前提是 base agent 能跑出可验证进度，否则 skill 库没有可用信号。

## 实践案例

下面三个案例分别对应抽 skill、双 prompt 蒸馏、同步 teacher。

### 案例 1：一条轨迹如何变成 skill

AppWorld 任务：备份 Spotify 曲库到 CSV 再注销账号。agent 跑完一条成功轨迹后，总结成 skill（成功步骤 + 易错点），写入 skill bank，训练时用 UCB 检索给 teacher。

```text
rollout τ → summarize(成功/失败/工作流) → skill s
bank[task] ← bank[task] ∪ {s}
train: S ← UCB-retrieve(bank)；teacher 见 x ⊕ S；student 只见 x
```

**逐部分解释**：

- skill 是自然语言策略摘要，不是另一套独立模型权重
- 写入 bank 后按任务检索，避免把无关 SOP 塞进当前题
- student 推理不读 skill，避免「考场带小抄」

### 案例 2：同参、不同 prompt 的蒸馏一步

```text
1. sync: θ_tea ← θ_stu
2. student 采样 τ ~ π(· | x)                 # 普通任务 prompt
3. 对每个 token：log π_stu(y|x)，log π_tea(y|x⊕S)
4. L_SDL = ρ · k3(log π_stu - log π_tea)     # IW reverse-KL
5. 总损失 ≈ L_GRPO + λ L_SDL；更新 θ
```

**逐部分解释**：

- ρ 纠正「实际采样分布 ≠ 要优化分布」时的梯度偏差
- reverse-KL 偏向 mode-seeking：跟 teacher 高置信区域，不强行抄犹豫区
- λ 控制蒸馏相对 GRPO 的力度，过大容易压死探索

### 案例 3：不同步 teacher 会怎样

消融主线：周期性同步 teacher 才能稳住；**off-policy、teacher 自己 rollout** 会在中期 collapse；**冻结 teacher** 会停在更低平台。AppWorld 上 Skill-SD 相对 GRPO +14.0pp，相对 vanilla OPD 约 +42.1%；Sokoban 相对 GRPO +10.9pp。

**逐部分解释**：dynamic 不只是「换 skill 文本」，还包括 teacher 权重跟着 student 长——特权信号与学生能力同频，否则 importance weight 校正的是过时分布。

## 踩过的坑

1. **teacher 不同步**：中期分布漂移，importance-weighted 目标失稳，训练 collapse。
2. **冻结 teacher**：能跑但平台更低，动态特权信号跟不上 student。
3. **把 skill 塞进 student prompt**：训练像开挂，推理一拿掉 skill 就掉点——论文刻意只条件化 teacher。
4. **冷启动全失败轨迹**：completion-rate 接近 0 时 skill 全是噪声，自蒸馏没有正信号可抽。

联合目标里 SDL 系数 λ、UCB 检索 skill bank、采样 token 蒸馏（非整词表）都是工程旋钮；论文也指出检索仍是轻量 UCB，不是语义向量库。

## 适用 vs 不适用场景

**适用**：

- 已有能跑通基本任务的 base agent（如 Qwen3-4B 级），目标是相对 GRPO 再涨
- 多轮 API / 规划任务，成功可用状态检测自动打分（AppWorld 单测、Sokoban 箱子到位）
- 能承受每轮：student rollout + skill 总结/检索 + teacher 再打分（相对纯 GRPO 多一段双条件前向）

**不适用**：

- 冷启动几乎全失败，没有可总结的成功/部分成功轨迹
- 必须极短训练周期上线（wallclock 明显高于单路 GRPO）
- 推理必须外挂 skill 检索才能工作的产品形态（Skill-SD 目标是内化后裸跑）
- 单轮、唯一标准答案任务（固定特权 OPSD 往往更直接）

## 历史小故事（可跳过）

- **2015**：Hinton 等经典蒸馏，多用 forward-KL 学 logits
- **2024**：MiniLLM 等转向 reverse-KL，强调 mode-seeking 更适合 LLM
- **2025–2026**：OPSD / SDPO 等把自蒸馏接到 RL，但特权信息多为固定标准答案
- **2026-04**：Skill-SD（arXiv:2604.10674）把轨迹摘要成 skill，专攻多轮 agent 的动态特权信号
- **同期**：[[mind-skill]] / [[effiskill]] / [[skill-as-pseudocode]] 从质量、层次、表示侧做 skill

skill 在这里既是经验压缩，又是训练期特权上下文——把「做过什么」变成「teacher 多知道的那一页」。

## 学到什么

1. **skill 是训练期特权信号，不是推理期外挂**：只条件化 teacher，student 内化后裸跑
2. **agent 任务忌固定唯一答案当 teacher**：多样合法路径需要可演化的策略摘要
3. **跨 prompt 自蒸馏要修梯度**：importance-weighted reverse-KL 纠正朴素 k3 偏差
4. **teacher 同步是稳定性一等公民**：不同步会 collapse，冻结会低平台

## 延伸阅读

- 论文原文：[arXiv 2604.10674](https://arxiv.org/abs/2604.10674)
- 项目页：[skill-sd.github.io](https://k1xe.github.io/skill-sd/)
- AppWorld：[appworld.dev](https://appworld.dev/)
- MiniLLM reverse-KL：[arXiv 2306.08543](https://arxiv.org/abs/2306.08543)
- [[voyager]] —— skill 库奠基
- [[mind-skill]] —— 同期 skill 质量工作

## 关联

- [[voyager]] —— skill 库奠基；Skill-SD 把轨迹摘要当 teacher 特权信号
- [[mind-skill]] —— 同期 skill 质量；Skill-SD 侧重蒸馏训练回路
- [[skill-as-pseudocode]] —— 同期 skill 表示；垂直补充
- [[effiskill]] —— 同期 skill 层次化
- [[skill-pro-nonparametric-ppo]] —— 不动权重学 skill；Skill-SD 改权重 + 自蒸馏
- [[webxskill]] —— Web agent skill 同期工作
- [[dpo-2023]] —— preference 训练；与自蒸馏同属「用自身信号改进」谱系

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[effiskill]] —— EffiSkill — 把代码效率优化经验抽成两层 skill 库
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-pro-nonparametric-ppo]] —— Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
- [[voyager]] —— Voyager — LLM 终身学习智能体
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引
