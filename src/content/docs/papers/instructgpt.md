---
title: InstructGPT — RLHF 让 LLM 听话
来源: 'Ouyang et al., "Training Language Models to Follow Instructions with Human Feedback", NeurIPS 2022'
日期: 2026-05-29
分类: NLP
难度: 中级
---

## 是什么

InstructGPT 是 OpenAI 2022 年用 **"人类反馈强化学习"（RLHF）** 训练 [[gpt-3]] 听懂指令、不胡说、不有害的方法。日常类比：

> [[gpt-3]] 是会说话但没礼貌的天才；InstructGPT 是教过"说话礼貌、不撒谎、回答完整"的同一个天才。

[[gpt-3]] 训完是个"超大文本补全机"——你给它前半句，它补后半句。但你问它"帮我写一首关于秋天的诗"，它可能继续给你写下一道题，而不是写诗——因为训练数据里更多是题目集，不是"听话的助手"。

InstructGPT 不再训新模型，而是 **对已有的 [[gpt-3]] 做行为微调**：教它"看到指令→照做"，而不是"看到指令→继续往下补"。从这一步开始，LLM 才像个能用的助手。

## 为什么重要

不理解 InstructGPT，下面这些事都没法解释：

- 为什么 ChatGPT 能在 2022 年 11 月突然出圈——它就是 InstructGPT 加多轮对话格式
- 为什么"对齐 alignment" 从一个理论词变成一份工程 recipe，所有大模型厂商照抄
- 为什么后续 [[constitutional-ai]] / DPO / Llama 2-Chat / Mistral 都基于同一套三阶段思路
- 为什么 LLM 商业化的转折点是 2022 而不是 2020——因为"会说话"和"听人话"是两件事

## 核心要点

InstructGPT 的训练分 **三步**：

1. **SFT（监督微调，Supervised Fine-Tuning）**：人写示范回答 → 微调模型。类比：让模型抄一遍标准答案。

2. **RM（奖励模型，Reward Model）**：人对模型生成的多个回答打分排序 → 训一个评分网络。类比：训出一个"考官 AI"，能自动给回答打分。

3. **PPO（强化学习）**：用 RM 当 reward，跑 PPO 让模型尽量输出"高分"回答。类比：让模型考试，考官打分，根据分数调整答题方式。

三步加起来叫 **RLHF**（Reinforcement Learning from Human Feedback，人类反馈强化学习）。

## 实践案例

### 案例 1：Step 1 SFT 长什么样

OpenAI 雇 40 名合同标注员，给他们真实的用户问题，让他们手写理想回答：

```
User: 帮我写一首关于秋天的诗
Assistant: 秋叶飘零落，金风送暮凉。
          炊烟升渐远，孤雁向南方。
```

收集约 13000 条这样的"示范数据"，在 [[gpt-3]] 上做标准 fine-tune。模型从此知道"看到指令应该照做，不是继续编题目"。

### 案例 2：Step 2 RM 长什么样

让 SFT 模型对同一问题生成 4-9 个不同回答，标注员排序：

```
问题：怎么向 5 岁小孩解释什么是黑洞？

回答 A: 黑洞是一种引力极强的天体...（太学术）
回答 B: 想象你掉进浴缸下水道，什么都吸进去！（生动）
回答 C: 黑洞由垂死的大质量恒星塌缩...（仍偏学术）
回答 D: 黑洞？就是宇宙里的吸尘器！（最简单）

标注员排序：D > B > C > A
```

把这些排序数据训一个 **奖励模型**——输入"问题+回答"，输出一个分数。这个 RM 等于把"人类口味"压缩进了一个网络。

### 案例 3：Step 3 PPO 长什么样

冻结 RM 当评委，让模型不断生成回答，根据 RM 打分调整：

- 模型生成回答 → RM 打分
- 高分回答的概率往上调，低分往下调
- 同时加 KL 约束："不许漂太远，记得你原本是 SFT 模型"

跑几千步后，模型自己摸索出"什么样的回答能拿高分"——这就是"听话"的训练过程。

## 踩过的坑

1. **SFT 一次不够**：单做 SFT 只学到"格式像示范"，但学不到"哪个回答比另一个好"——这是 SFT 与 RLHF 的根本鸿沟。SFT 不会拒绝坏问题，RLHF 会。

2. **RM 容易被骗**：模型会发现"重复关键词、加表情、写得长"能骗高分——叫 reward hacking。所以必须加 KL 约束防止模型只优化分数。

3. **alignment tax（对齐税）**：RLHF 后模型在指令任务变好，但在标准 NLP benchmark（SQuAD / DROP）上反而变差——像"训过礼仪的天才忘了一些考试技巧"。论文用 **PPO-ptx**：在 PPO 更新里混入一部分预训练梯度，缓解公共 NLP 集上的回退（比例是超参，不必死记成固定 10%）。

4. **小模型也能反超大模型**：1.3B 的 InstructGPT 在指令任务上 win-rate 85%，打败 175B 的原版 [[gpt-3]]（50%）。RLHF 让"听话"这件事跨过了 100 倍参数缩放都达不到的门槛——这是这篇论文最有冲击力的发现。

## 适用 vs 不适用场景

**适用**：
- 让通用 LLM 听懂自然语言指令（chatbot / assistant 类任务）
- 减少 LLM 胡说八道、避免有害输出
- 把"离线评分"转成"在线生成优化"

**不适用**：
- 没有 SFT 起点直接 RL → 会跑飞，模型崩溃
- 完全没人工标注预算 → 转 RLAIF（用 AI 当 labeler，见 [[constitutional-ai]]）
- 数据量很少（< 10k）→ 直接用 DPO 跳过 RM 训练

## 历史小故事（可跳过）

- **2017 年**：OpenAI 提出 PPO 算法，原本用在 Atari 游戏 AI 上。同年 Christiano 等人提出"用人类比较反馈学奖励"。
- **2020 年**：[[gpt-3]] 发布，1750 亿参数，会说话但不"听话"。
- **2022.03**：InstructGPT 论文发表，三阶段 recipe 把 RLHF 从 Atari 搬到 LLM。
- **2022.11**：ChatGPT 上线，本质是 InstructGPT + 多轮对话格式，5 天百万用户。
- **2022.12**：Anthropic 发布 [[constitutional-ai]]，把"人工排序"换成"AI 按宪法批评 AI"，省掉大部分人工。
- **2023 年**：DPO（Rafailov et al.，arXiv 2023.05 / NeurIPS 2023）发表，证明 KL-正则化的 RL 解可以闭式求解，跳过显式 RM + PPO 训练这一段。

## 学到什么

1. **"会说话"和"听人话"是两件事**——前者靠 pretraining，后者要 RLHF。这是 LLM 商业化的关键认知。
2. **三阶段 SFT → RM → PPO 是行业标配**——所有大模型厂商今天还在用这套，区别只在数据来源和细节。
3. **小模型 + 好对齐 > 大模型 + 没对齐**——这是 InstructGPT 最有冲击力的发现，直接催生了 ChatGPT 的商业化。
4. **对齐不免费**——RLHF 让模型听话，但通用能力会轻微下滑，需要像 PPO-ptx 那样混入预训练更新来修复。
5. **labeler 选择决定模型 personality**：OpenAI 找的 40 个 labeler 多是英语母语 / 大学教育水平偏高，最终模型的"语气" 就长这样。换一拨人标，模型 personality 会明显不同——RLHF 把 labeler 团队的偏好烙进了模型。
6. **数据量比想象的小**：标注数据只有几万条，比 pretraining 的几千亿 token 少 7 个数量级，却撬动了模型最终行为——好的对齐数据"杠杆率" 远超 pretraining。
7. **PPO 的 KL 惩罚是隐性的稳定器**：没有这个约束 RL 会把模型拉得离 SFT 太远进入"reward hacking" 区域；DPO 把这条 KL 约束直接闭式解出来，省掉显式 RL 训练但仍尊重同一条物理约束。
8. **三阶段范式跨任务可迁移**：SFT → RM → PPO 与 AlphaGo 的"模仿 → 评估 → 强化"几乎同构；说明这不是 LLM 专属配方，而是任何"难定义直接 reward" 的对齐问题的通用 recipe。
9. **从 RM 训 PPO 的"评分网络"复用**：RM 训完之后既能给 PPO 做 reward，也能反向用来 best-of-N 重排——同一个网络多种用途，是工程性价比的隐藏点。

## 延伸阅读

- 视频教程：[Yannic Kilcher — InstructGPT 解读](https://www.youtube.com/watch?v=PBH2nImUM5c)（35 分钟讲完三阶段）
- 自己跑一遍：[huggingface/trl](https://github.com/huggingface/trl) 上有完整的 SFT / RM / PPO 流水线，能在 GPT-2 124M 上跑通
- 论文 PDF：[arXiv 2203.02155](https://arxiv.org/abs/2203.02155)（30 页主体 + 30 页附录，密度高）
- [[gpt-3]] —— InstructGPT 微调的对象
- [[constitutional-ai]] —— InstructGPT 的下一步：用 AI 替代人工 labeler

## 关联

- [[gpt-3]] —— 没有 [[gpt-3]] 就没有需要"被对齐"的对象
- [[constitutional-ai]] —— RLHF 的省人工版本，用 AI 写宪法批评 AI
- [[transformer-attention]] —— InstructGPT 用的 backbone 仍是 [[gpt-3]] 的 Transformer
- [[chatgpt]] —— 在 InstructGPT 上加多轮对话格式即得

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chatbot-arena-2024]] —— Chatbot Arena — 让真人盲投，给 LLM 排出公允座次
- [[codex-2021]] —— Codex — 让 GPT 学会写 Python，并造一把尺子量它
- [[constitutional-ai]] —— Constitutional AI — Anthropic 的对齐方法
- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[deepseek-r1]] —— DeepSeek R1 — 强化学习推理模型
- [[dpo]] —— DPO — Direct Preference Optimization
- [[flan-2021]] —— FLAN — 用自然语言指令教模型学会"听话"
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[rlhf-christiano]] —— RLHF Christiano 2017 — 人类偏好做奖励

