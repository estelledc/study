---
title: Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
来源: 'Mi et al., "Skill-Pro: Learning Reusable Skills from Experience via Non-Parametric PPO for LLM Agents", ICML 2026 (arXiv:2602.01869)'
日期: 2026-06-01
分类: agents
难度: 高级
---

## 是什么

Skill-Pro 是一套**不更新 LLM 权重、只改 skill 文本库**的训练框架：把交互经验写成可执行的过程性 skill，再用非参数 PPO 演化这个库。日常类比：教徒弟学手艺，传统 RL 是改徒弟脑子；Skill-Pro 不改徒弟，只改工具箱里的**菜谱卡片**——练完一轮根据翻车原因改菜谱，改完还要过一道"别改太猛"的验收，徒弟本人纹丝不动。

旧路线两路：（a）参数化 RL（PPO / GRPO）直接改 LLM 权重，贵且易丢通用能力；（b）外部记忆（轨迹 / 反思 / 图）靠检索再推理，存得多、复用差。Skill-Pro 走第三条：**学的是 skill 池 Ω，不是选 skill 的策略 μ**——μ 和 LLM 都冻结，学习只发生在"增删改 skill 文本"。

核心三件：（1）Skill-MDP——skill 是「激活 / 执行 / 终止」三元组；（2）语义梯度——从轨迹事后归因写出自然语言修改建议；（3）PPO Gate——用 clipped surrogate 验收候选 skill，再加分数维护剪枝。

## 为什么重要

不理解 Skill-Pro，下面这些事都没法解释：

- 为什么 2026 年 agent 论文出现"非参数训练"分支——很多团队没卡训 LLM，但仍想从经验里长能力
- 为什么"存轨迹"不等于"会复用"——叙事记忆还要再推理，过程记忆是可执行程序
- 为什么光靠 LLM 改写 skill 会翻车——语义梯度会幻觉，必须有 trust region 验收
- 为什么 PPO 的精神能搬进文本空间——核心是小步更新 + 信任域，不是权重本身

## 核心要点

Skill-Pro 拆成 **三步**：

1. **Skill-MDP + 三元组**：每条 skill = 激活条件 \(\mathcal{I}\)（何时用）+ 执行流程 \(\pi\)（怎么做）+ 终止条件 \(\beta\)（何时交还控制）。类比：一张菜谱写清"什么场合开做 / 步骤 / 何时收工"。决策时 μ 选 skill，冻结 LLM 按 \(\pi\) 吐原子动作，直到 \(\beta\) 成立。

2. **语义梯度**：对调用过某 skill 的轨迹做事后归因，产出自然语言修改建议 \(g=(\Delta\mathcal{I},\Delta\pi,\Delta\beta)\)，再跨 batch 聚合，得到候选 skill \(\omega'=\omega\oplus\bar{g}\)。类比：教练看回放，用中文写"激活条件太宽、第 2 步该先探信息"——这是文本空间的"梯度方向"。

3. **PPO Gate + 分数维护**：把冻结 LLM 当随机策略，在历史轨迹上算重要性比率与 advantage，用 clipped surrogate 给候选打分；只有 best-of-\(N_c\) 且分数 \(>0\) 才替换旧 skill。池容量有限时按在线 advantage 分数剪枝。类比：改菜谱可以，但试吃不过关就退回，分数长期为负的卡片扔掉。

三件咬合：MDP 给可执行单元、语义梯度给改写方向、PPO Gate 给稳定验收。

## 实践案例

### 案例 1：一条 skill 长什么样

Mastermind 开局可用的 skill 文本（论文示例风格）：

```text
Name: StrategicPlanning
I: 任务刚开始，还没有任何反馈
π: 1) 按约束建假设空间  2) 选最能降不确定性的探索动作
β: 第一次探索动作执行完且收到反馈后终止
```

**逐部分解释**：

- `I` 告诉选择器"什么状态该掏这张卡"
- `π` 是可执行步骤，LLM 不用每次从零 CoT
- `β` 防止 skill 霸占整局——做完就交还控制

### 案例 2：语义梯度怎么改 skill

旧 skill 在多局里"激活太早、探索一步就停"。聚合后的语义梯度可能是：

```text
ΔI: 收紧为「尚无颜色反馈」
Δπ: 探索前先列出仍可能的密码集合
Δβ: 至少收到一轮黑白钉反馈再终止
```

**逐部分解释**：

1. 每条轨迹归因 → 局部 \(g_i\)
2. LLM 聚合去冲突 → \(\bar{g}\)
3. \(\omega'=\omega\oplus\bar{g}\) 生成候选（还没入库）

### 案例 3：PPO Gate 拦下幻觉改写

候选把执行流程改成"一次猜完整密码"。Gate 在历史轨迹上算：

```text
ρ_t = π_LLM(a_t | s_t, ω') / π_LLM(a_t | s_t, ω)
L_CLIP = mean( min(ρÂ, clip(ρ, 1-ε, 1+ε)Â) )
# 仅当 L_CLIP > 0 且为 best-of-N 才替换
```

**逐部分解释**：

- \(\rho\) 衡量"换 skill 后 LLM 还认不认原动作"
- clipping 限制一次改动别太猛（trust region）
- 论文消融：去掉 Gate 后池质量崩、训练不稳；Mastermind-v0 复用率可到约 0.93，整库约 800 token

## 踩过的坑

1. **语义梯度会幻觉**：LLM 事后归因可能写出轨迹里没见过的步骤，必须过 PPO Gate，不能生成完就入库。
2. **去掉分数维护改 FIFO**：高分 skill 会被新来者挤掉，在线分数变负，长期收益塌掉。
3. **把 μ 也拿去训**：论文明确冻结选择策略；你若同时训检索器，就不再是原文设定，对比会失真。
4. **池太大当叙事库用**：skill 要短、可执行；写成小作文会重新变成高 token、低复用的 episodic 记忆。

## 适用 vs 不适用场景

**适用**：

- 有可交互环境与回报（ALFWorld / 猜码 / 工具循环），能攒轨迹 batch
- 想把经验压成可执行程序，而不是越存越长的轨迹库
- 没预算微调 LLM，但能付 LLM-as-judge / 概率估计的推理成本
- 需要跨模型复用同一套自然语言 skill（论文有 cross-agent 迁移）

**不适用**：

- 开放创作、奖励难定义——Skill-MDP 的 \(R\) 不好定
- 任务几乎不重复——过程记忆摊销不回来
- 基座 LLM 弱到归因/概率估计不可靠——语义梯度与 Gate 都封顶
- 只要一次性 prompt 工程、没有在线交互闭环——用不上演化算子 \(\mathcal{E}\)

## 历史小故事（可跳过）

- **2017**：[[ppo]] 提出 clipped surrogate，trust region 成为深度 RL 默认件
- **2023**：[[voyager]] 把 skill 当可成长程序库；选择仍偏检索，缺稳定演化验收
- **2023**：[[dpo]] 用偏好直接更新权重——仍是参数化路线，和"冻住 LLM"不同
- **2024**：TextGrad 把"对文本算梯度"工程化；Skill-Pro 把它接到序列决策的事后归因
- **2026**：Skill-Pro（ICML Spotlight）把 PPO 精神搬到 skill 文本演化——语义梯度提案 + PPO Gate 验收

## 学到什么

1. **不动权重也能学**：学的是 Ω 里的程序文本，不是 θ
2. **可执行 > 可检索**：Activation/Execution/Termination 把叙事变成程序
3. **提案与验收要拆开**：语义梯度负责想，PPO Gate 负责拦
4. **维护压力不可少**：分数剪枝让池保持小而尖（约百 token 级密度）

## 延伸阅读

- 论文：[arXiv:2602.01869](https://arxiv.org/abs/2602.01869)（ICML 2026 Spotlight）
- 代码：[Miracle1207/Skill-Pro](https://github.com/Miracle1207/Skill-Pro)
- PPO 原文：[Schulman et al. 2017](https://arxiv.org/abs/1707.06347)
- TextGrad：[arXiv:2406.07496](https://arxiv.org/abs/2406.07496)
- [[voyager]] —— skill 库奠基；Skill-Pro 补"如何可靠演化"
- [[ppo]] —— clipped surrogate / trust region 的参数化原版

## 关联

- [[voyager]] —— 开放世界 skill 库；Skill-Pro 强调非参数 PPO 验收
- [[mind-skill]] —— 同期抽 skill 并控质量；互补于演化验收
- [[skill-as-pseudocode]] —— 把笔记本写成可校验伪代码
- [[effiskill]] —— 代码效率场景的两层 skill 库
- [[ppo]] —— 非参数 PPO 的算法思想来源
- [[react-agent]] —— 推理-行动循环；Skill-Pro 在其上插入可复用程序单元
- [[skill-sd-self-distillation]] —— 用抽出的 skill 当 teacher；走改权重蒸馏

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[effiskill]] —— EffiSkill — 把代码效率优化经验抽成两层 skill 库
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-sd-self-distillation]] —— Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引
