---
title: Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
来源: 'Skill-Pro: Learning Reusable Skills from Experience via Non-Parametric PPO, arXiv:2602.01869, 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 高级
provenance: pipeline-v3
---

## 是什么

Skill-Pro 是一套**不更新模型权重就能学到可复用过程性 skill** 的训练算法：定义一个 Skill-MDP，在文本梯度（语义梯度）上用 PPO 风格的目标函数训练一个"门控"，决定下次面对类似任务时是否用旧 skill。日常类比：教徒弟学手艺，传统 RL 是改徒弟脑子里的"反射"——徒弟整个人都被改造；Skill-Pro 不改徒弟，给他一个工具箱 + 一个挑工具的眼力——眼力通过反复练习变好，徒弟还是原来那个徒弟。

旧路线分两路：（a）参数化 RL——直接 PPO/GRPO 更新 LLM 权重学策略，成本高且容易丢通用能力；（b）skill library（[[voyager]] 起步）——存 skill 但靠 prompt 检索决定用不用，没有显式优化。Skill-Pro 走第三条：**把"用哪条 skill"建模成 PPO 的 action**，在 skill 描述这个文本空间上算梯度，不动 LLM 权重就能学到稳定的 skill 选择策略。

核心三件：（1）Skill-MDP——用 skill 集合定义 state/action 空间；（2）语义梯度——用 LLM-judge 给两条候选 skill 打分，差值当 advantage；（3）PPO Gate——把 PPO 的 clipped surrogate objective 套在 skill 选择门上。

## 为什么重要

不理解 Skill-Pro，下面这些事都没法解释：

- 为什么 2026 年 agent 论文出现"非参数训练"分支——很多团队没卡训 LLM
- 为什么"语义梯度"取代"数值梯度"是当前研究热点——文本可解释、不需可微环境
- 为什么 skill 库光有不够、还得有"用 skill 的策略"——选错 skill 比没 skill 还差
- 为什么 PPO 这种参数化算法的精神可以搬到非参数空间——核心是 trust region 不是权重更新

## 核心要点

Skill-Pro 拆成 **三步**：

1. **Skill-MDP**：state 是当前任务描述 + 已用过的 skill 历史，action 是从 skill 库中挑 1 条（或选择"不用 skill"），reward 是任务完成度 + skill 调用代价。MDP 的 transition 由 LLM 模拟 + 真实环境结合。类比：把"挑工具"这个动作拎出来当独立的小游戏。

2. **语义梯度**：传统 RL 的 advantage 是数值差，Skill-Pro 用 LLM judge 比较"用 skill A vs 用 skill B"哪个更适合当前任务，给软分数差。这个差被当成 advantage 信号——它是文本到文本的梯度。

3. **PPO Gate**：PPO 的核心是 clipped surrogate—— "新策略和旧策略差太远就拉回来"。Skill-Pro 在 skill 选择门上套这个机制：用 ratio 控制选择分布漂移，避免一次更新就把某条 skill 用滥。门本身是几个参数（attention-style 权重），LLM 不动。

三件咬合：MDP 给问题、语义梯度给方向、PPO Gate 给稳定的优化算法。

整套系统训练 LLM 周边的"门"，LLM 自身保持 frozen。这降低了在 8B / 70B 模型上做 agent 训练的门槛——不需要 8 张 H100 也能上手。

## 实践案例

### 案例 1：选错 skill 比不用 skill 还差

任务："给老板写周报"。skill 库有 `format_email` `summarize_data` `translate_zh`。

- 一个 naive 检索器看到"写"和"老板"匹配上 `translate_zh`（因为 translate 也用"写"）。
- 走 translate_zh 出来的结果是把任务描述翻译成英文——完全错位。

Skill-Pro 训练后的门会：

- 看历史："这类任务上次用 summarize_data 成功了"
- 语义梯度对 translate_zh 给负 advantage
- 选 summarize_data，跑通

任务完成度由 reward 反馈，门权重更新，下次更准。

### 案例 2：避免训练崩塌的 PPO 拉回机制

训练第 3 epoch 时门突然偏好 `format_email`——所有任务都先调它一下。

- 这是经典 RL 崩塌——某个 skill 偶然给了高 reward，门把它当万能解
- PPO clipping 检查到新策略 vs 旧策略 ratio 超阈值
- 拉回更新幅度，避免完全锁死在 format_email 上
- 多轮迭代后门收敛到合理的多样选择

PPO 的 trust region 这套老机制在文本空间一样有效。

### 案例 3：不用 skill 也是一个 action

任务："1+1 等于几"。skill 库里都是大型流程类 skill，对这种简单任务都过重。

- Skill-Pro 的 action 空间含一个特殊 action："no-skill, direct response"
- 训练后门学到："简单算术任务 → 不用 skill 直接回"
- 节省 skill 调用 + 检索成本

这是 Skill-Pro 比纯 retrieve-then-use 路线灵活的地方——它学到的是"什么时候不用工具"。

论文报告在多个领域 benchmark 上 no-skill action 占比从 5% 学到 18%，对应整体调用成本下降约 1/4。

## 踩过的坑

1. **语义梯度 noisy**：LLM-judge 同一对 skill 给不同次打分会差 0.5+，要 voting 多次才稳，预算翻倍。
2. **MDP 状态爆炸**：完整对话历史 + skill 调用历史塞进 state 维度太高，要做 summarization 压缩，但压缩损失影响策略学习。
3. **PPO Gate 参数初始化要小**：起点偏好任何 skill 都会让训练偏向那条，建议用均匀分布或基于检索分数初始化。
4. **不用 skill 这个 action 容易被遗忘**：如果训练数据里都是"用 skill 成功的"，门会学到"任何任务都用 skill"，要刻意采样简单任务保持 no-skill 出现频率。

no-skill 这个 action 同时也是 skill 库自然的"压力测试"——如果它频繁被选，说明库里当前 skill 都不够好。

## 适用 vs 不适用场景

**适用**：

- 已有规模化 skill 库（50+ 条）但调用决策成 bottleneck
- 没有训 LLM 的算力，但有训小模型的算力
- 任务多样、检索 baseline 已经摸到天花板
- LLM judge 可信（任务领域 LLM 评估能力强）

**不适用**：

- skill 库小（< 20 条）——直接全塞 prompt 让 LLM 选更省
- 任务领域 LLM-judge 不准（金融风控、医学）——语义梯度会把训练带偏
- 任务奖励信号难定义（开放创作）——Skill-MDP 没法 well-defined
- 需要在线低延迟决策——PPO Gate 推理时多了一层

## 历史小故事（可跳过）

- **2017**：PPO 论文发布，trust region + clipped objective 成为 RL 训练默认选择
- **2023**：[[voyager]] 把 skill 当存储；选 skill 用 retrieval，没有显式优化
- **2024**：DPO/IPO 等 preference-based RL 兴起，"不动权重也能优化"的思路逐步成熟
- **2025**：TextGrad 把"对文本算梯度"工程化；non-parametric RL 路线开始有人做
- **2026 年初**：Skill-Pro 把 PPO 思想搬到 non-parametric skill 选择上——是这条路线的代表
- **同期**：[[mind-skill]] / [[skill-as-pseudocode]] 在 skill 表示和质量上做工作

PPO 思想越过参数边界进入文本空间，是当下 RL 研究最反直觉的延伸之一。

可以预见后续会出现更多"non-parametric + 经典 RL 算法"的组合——A3C / SAC 等都有可能被搬过来。

## 学到什么

1. **不动 LLM 权重也能学策略**：核心是把"选 skill"这个小动作拎出来训练
2. **语义梯度需要稳定化**：单次 judge 不可靠，要多次投票或多 judge 集成
3. **PPO 的 trust region 思想可移植**：clipping 机制不依赖参数空间是数值的
4. **不用 skill 也是 action**：让 agent 学会克制比让它学会调用更难也更值
5. **skill-MDP 这个抽象本身也是贡献**：把 skill 选择正式化为 MDP 后续工作可以接着做
6. **训练成本和推理成本都要算**：训练省了 GPU，但每次推理都要跑门 + judge，整体收支看任务量级

## 延伸阅读

- 论文原文：[arXiv 2602.01869](https://arxiv.org/abs/2602.01869)
- PPO 原始论文：[Schulman et al. 2017](https://arxiv.org/abs/1707.06347)
- TextGrad：[arXiv 2406.07496](https://arxiv.org/abs/2406.07496)
- [[voyager]] —— skill 库奠基；Skill-Pro 在它上加显式优化
- [[mind-skill]] —— 同期 skill 质量工作；与 Skill-Pro 互补

## 关联

- [[voyager]] —— skill 库奠基；Skill-Pro 优化它的"选 skill"环节
- [[mind-skill]] —— 同期工作；优化 skill 内容质量
- [[skill-as-pseudocode]] —— 同期工作；优化 skill 表示形式
- [[effiskill]] —— 同期工作；代码效率场景
- [[ppo-2017]] —— Skill-Pro 算法思想直接来源
- [[textgrad]] —— 语义梯度的基础设施
- [[react]] —— agent 标准循环；Skill-Pro 在 think 阶段插入选择门
- [[dpo-2023]] —— preference-based RL；与 Skill-Pro 共享"不动权重"思想
- [[skill-sd-self-distillation]] —— 同期 skill 自蒸馏；走的是改 LLM 权重那条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[effiskill]] —— EffiSkill — 把代码效率优化经验抽成两层 skill 库
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[react]] —— React UI 组件库
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-sd-self-distillation]] —— Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
- [[voyager]] —— Voyager — LLM 终身学习智能体
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引

