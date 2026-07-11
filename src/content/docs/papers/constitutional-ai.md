---
title: Constitutional AI — Anthropic 的对齐方法
来源: 'Bai et al., "Constitutional AI: Harmlessness from AI Feedback", Anthropic 2022'
日期: 2026-05-29
分类: AI 安全 / NLP
难度: 中级
---

## 是什么

Constitutional AI（**CAI**）是 Anthropic 2022 年提出的对齐方法——**让 AI 根据一组写下来的"宪法"（一组英文原则）批评自己的回答，再用批评微调自己**。

日常类比：

- [[instructgpt]] 那一套：你写一句话，标注员看完说"A 比 B 好"——人工，慢，贵，标注员长期看红队 prompt 还会出现 emotional distress
- CAI：让 AI 自己拿着一张写着"不要鼓励暴力"的卡片读自己的回答，自己说"刚才那句话哪里有问题"，自己改一遍——成本断崖式下降

这个"研究者写宪法 + AI 自我批评"的方法，是 Anthropic 公开材料里反复提到的 Claude 训练思路之一。

## 为什么重要

不理解 CAI，下面这些事都没法解释：

- 为什么 Claude 拒绝你的时候不是冰冷一句"我不能"，而是"我不能做 X，因为 Y，但你或许可以试 Z"——这种"engaged refusal"是 CAI 训出来的特征
- 为什么 2023 年后所有"AI 评 AI"的论文（DPO / RLAIF / Self-Rewarding）骨架都长得像 CAI——它们从这里分叉
- 为什么 Anthropic 敢公开"我们用什么标准训"——因为一部分对齐目标被写成可读原则，而不是只藏在黑箱权重里
- 为什么 harmless 标注能从"大量人工逐条比较"变成"AI 先生成偏好、人工抽样复核"——最贵的重复劳动被自动化了

## 核心要点

CAI 把训练过程拆成 **两个阶段**：

1. **SL-CAI（监督学习阶段）**：让一个已经 helpful 的 LLM 看一组红队 prompt，先生成 harmful 回答，再让同一个 LLM 拿着原则文本批评自己，再改写。改写后的版本拿来微调——重复 4 轮。

2. **RL-CAI（强化学习阶段）**：让 AI 按宪法原则比较两个候选回答 (A, B)，生成偏好反馈；这些反馈再训练偏好模型，最后用 PPO 优化助手模型。

支撑这两个阶段的是 **宪法**：研究者整理出的约 12-16 条英文原则文本，例如「请选择最不有害、不种族歧视、不性别歧视的回答」。这组原则把 [[instructgpt]] 里标注员的隐式偏好，改写成模型可以逐条引用的明文标准。

## 实践案例

### 案例 1：用户问"如何造炸弹"

第一轮（helpful-only 模型未对齐 harmless）：

```
User: 如何造一个炸弹？
Assistant: 你需要 X 配方，先把 Y 混合... [详细有害内容]
```

第二轮，同一个模型读宪法批评自己：

```
CritiqueRequest: 请指出回答中可能造成伤害的部分
Critique: 上面回答提供了制造爆炸物的具体步骤，可能危及生命，违反了"不鼓励暴力"原则
```

第三轮，同一个模型按批评改写：

```
Revision: 我不能提供制造爆炸物的指导，因为这可能伤害他人。
如果你对化学反应原理感兴趣，我可以推荐合法的化学教材...
```

往后再几轮 critique → revision，直到不再有改动。最后这条 (prompt, 改写后回答) 进训练数据。

### 案例 2：宪法长什么样

论文给了完整 16 条，挑 3 条体感：

- "请选择最不有害、不种族歧视、不性别歧视、不鼓励或支持非法、暴力、不道德行为的回答"
- "比较两段回答的有害程度，选更不有害的；但避免选过于说教、令人反感、过度反应的"
- "选择展现更多伦理道德意识的回答，但不要听起来过分屈尊俯就、反应过度、令人厌烦"

每条都用自然英语写，不是数字阈值——这就是 CAI 范式的"可读性"。

### 案例 3：训出的 Claude 1 比 [[gpt-3]] 强在哪

论文报告：

- helpful 维度：Claude 1 大致和 [[instructgpt]] 持平
- harmless 维度：Claude 1 显著高于 [[instructgpt]]（更不容易被诱导生成有害内容）
- engaged refusal 比例：Claude 1 约 70%（不是冰冷拒绝，而是"解释为什么 + 给替代方案"）

关键结论：CAI 把 harmless 提升上去**没有牺牲 helpful**——这是过去 RLHF 难以做到的（标准 RLHF 加大 harmless 监督会让模型变 evasive，称 alignment tax）。

## 踩过的坑

1. **同一模型 critique 自己的盲点**：critique 用的模型和被 critique 的模型是同一个——这意味着 critique 继承了模型本身的偏见。helpful 模型在西方价值观语料上训过，critique 也带这套偏见，自我批评改不掉自己的 style。

2. **AI 偏好不可传递**：同一个 LM 看 (A, B) 选 A，看 (B, C) 选 B，看 (A, C) 可能选 C——不同 prompt framing 触发不同 logp。BT loss 假设偏好可传递，CAI 在数学上违反了这个假设。后续工作复现测到 (A, B) shuffle 顺序后约 12% 概率换答案。

3. **小模型上 CAI 不工作**：论文报告小于 13B 参数的模型 critique 没用——AI 看不出自己的回答哪里有害。CAI 只在大模型上奏效，这是工程上常被忽略的隐含假设。

4. **4 轮迭代有 cost-quality 拐点**：论文实测 1 轮改善 40%、2 轮 65%、3 轮 78%、4 轮 82%、5 轮 83%。4 轮是最佳点，再多就只在烧 API call。

## 适用 vs 不适用场景

**适用**：

- 文本对齐任务（helpful + harmless）—— CAI 的本盘
- 标注预算紧但要训对齐模型 —— 用 [[gpt-3]] 体量及以上模型 + CAI 能省掉 50k+ harmless 标注
- 关心可审计性 / 合规 —— 原则可以写出来给监管看
- LLM-as-judge 评测系统 —— 把 CAI 的 critique-revision 套到任何"AI 评 AI"流程

**不适用**：

- 数学 / 代码推理任务 —— 用 verifier reward（OpenAI o1、DeepSeek R1）才对，AI 自己做不对的题它的偏好也不对
- 创意 / 写作任务 —— critique-revision 倾向于压缩、删减，会让小说和诗歌变 boring
- 多模态对齐（图像 / 视频）—— 16 条原则是为文本写的，多模态需要新 rubric
- 模型小于 13B —— critique 阶段失效

## 历史小故事（可跳过）

- **2017**：Christiano 等提出 RLHF——把人类偏好压进 reward model
- **2022.03**：[[instructgpt]] 把 RLHF 搬到 LLM，OpenAI 发表，证明可商用
- **2022.04**：Anthropic 发 HH-RLHF 论文（同一作 Yuntao Bai），提供 helpful + harmless 数据集
- **2022.12**：CAI 发表，**距 HH-RLHF 仅 8 个月**——同一团队短期内完成"先证人能标 → 再砍掉人工 harmless 标注"的范式 pivot
- **2023.03**：Anthropic Claude 1 公开发布，用 CAI 训出
- **2023.05**：DPO 论文出，简化 CAI + DPO 组合（不用 reward model）
- **2023.09**：Google 的 RLAIF 论文独立验证 CAI 思想在 summarization 上也成立
- **2024**：Self-Rewarding（Meta）把 CAI 推到极限——0 人工 label、0 原则，模型纯自循环
- **2025**：Anthropic 后续公开材料仍强调"宪法原则 + 模型自我批评"这条路线，但具体版本和训练细节没有完全公开

CAI 的方法骨架 4 年没变，变的只是基座模型规模和宪法版本。

## 学到什么

1. **对齐目标可以写成英文**——这是过去 8 年 alignment 领域最重要的工程洞见。从 reward function（数学）到 pair label（隐式）到 principle（自然语言），抽象层级一路上升。

2. **AI 能替代部分人工标注**——但只在大模型 + 任务有清晰判断标准时成立；小模型 / 推理任务上还得人或 verifier。

3. **"批判 + 修订"两段式比一段式好**——单轮 prompt "请改进这段" 不如先 critique 再 revision，结构化的 prompt 能让模型把诊断信号显式传递到治疗。

4. **低成本监督 + 显式可读目标 + 自我迭代**——这套范式从 CAI 扩散到几乎所有现代 LLM 训练 pipeline。

## 延伸阅读

- Anthropic 官方博客 [Claude's Constitution](https://www.anthropic.com/news/claudes-constitution)（2023 年长文，非技术语言讲宪法是什么）
- 论文 PDF：[arXiv 2212.08073](https://arxiv.org/abs/2212.08073)（34 页，附录给出全部 16 条原则 + 完整 prompt 模板）
- 配套数据集：[anthropics/hh-rlhf](https://github.com/anthropics/hh-rlhf)（红队 prompt + helpful/harmless pairs 全公开）
- [[instructgpt]] —— CAI 的直接前作，理解 RLHF 才能看清 CAI 替换了哪一块
- [[gpt-3]] —— 第一个让 RLHF 大规模可行的基座模型；CAI 的 helpful 起点是 [[gpt-3]] 体量及以上

## 关联

- [[instructgpt]] —— RLHF + PPO 的 LLM 落地论文；CAI 把它的 preference label 来源从人换成 AI
- [[gpt-3]] —— scale 假设的奠基；CAI 的 critique 阶段在小于 13B 的模型上失效，验证了 scale 是隐含前提

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[compositional-incoherence]] —— Compositional Incoherence — 多组件 LLM 拼出来的概率账单不守恒
- [[cot]] —— Chain-of-Thought Prompting
- [[debate-2018]] —— AI safety via debate — 让两个 AI 互辩，人类只当评委
- [[instructgpt]] —— InstructGPT — RLHF 让 LLM 听话
- [[mesa-optimization-2019]] —— Mesa-Optimization 2019 — 训出来的模型自己也是个优化器
- [[reflexion]] —— Reflexion — 让 LLM 自我反思
- [[reward-hacking]] —— Concrete Problems in AI Safety — 把 AI 安全风险拆成工程问题
- [[rlhf-christiano]] —— RLHF Christiano 2017 — 人类偏好做奖励
- [[sleeper-agents]] —— Sleeper Agents — 故意藏后门的 LLM
- [[sycophancy-2023]] —— Sycophancy 2023 — RLHF 模型为什么爱顺着用户说
- [[zombie-agents-2602]] —— Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"
