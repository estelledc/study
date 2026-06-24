---
title: Scaling Laws — 神经语言模型的缩放规律
来源: 'Kaplan et al., "Scaling Laws for Neural Language Models", 2020'
日期: 2026-05-29
分类: NLP
难度: 中级
---

## 是什么

Scaling Laws 是 OpenAI 2020 年发表的一组**实证规律**——告诉你"训一个语言模型，最终的 loss 能用三个变量预测出来"：参数量 N、数据量 D、计算量 C。

日常类比：物理课上的 F = ma，三个变量算清楚就能预测物体加速。Scaling Laws 是 LLM 版的 F = ma。你不用真的训完一个 1750 亿参数的怪物，**光看曲线就能算账**：

> 我有 100 张 GPU 训 30 天，最终 loss 大概是 2.3。

这种"先算账再花钱"的能力，让 LLM 从"碰运气"变成"工程项目"。

## 为什么重要

不知道 Scaling Laws，下面这些事都没法解释：

- 为什么 OpenAI 敢花几千万美金训 [[gpt-3]] 的 175B 参数——他们看了曲线，知道"再大就会更好"
- 为什么"通过 scaling 解决 AI"成了 OpenAI / Anthropic 的核心信念
- 为什么后来 [[chinchilla]] 出来后整个行业瞬间改训练配方——Kaplan 把数据/参数比例算错了
- 为什么 2020 年这一篇 30 页论文是过去十年 LLM 发展最关键的几篇之一

## 核心要点

Scaling Laws 的三条核心结论：

1. **Power Law（幂律关系）**：loss 和 N（参数）/ D（数据）/ C（计算）之间是幂律。意思是 log-log 坐标系画出来是**直线**——参数翻 10 倍，loss 按固定比例下降。日常类比：耳机降噪——音量翻倍，噪音并不会减半，而是按某个固定 dB 衰减。

2. **三大变量独立可加**：loss 可以拆成三项独立贡献：

   ```
   L(N, D, C) ≈ c₁/N^α + c₂/D^β + c₃/C^γ
   ```

   每项管自己的瓶颈——参数不够了？看第一项。数据不够了？看第二项。三者不打架。

3. **大模型在单步内 loss 比小模型低**：同样训 1000 步，10B 的模型比 1B 的 loss 低。但每步成本更高——大模型每步要算更多 FLOPs。这个 trade-off 是后面 Chinchilla 修正的关键。

## 实践案例

### 案例 1：用幂律预测 loss

按 Kaplan 的拟合参数（粗略估计）：

| 参数量 N | 预测 loss |
| --- | --- |
| 100M | 3.2 |
| 1B | 2.5 |
| 10B | 2.0 |
| 100B | 1.6 |

每翻 10 倍，loss 下降约 0.5。这条线**没拐弯**——一直外推到 10^14 还是直线。所以 OpenAI 才敢继续往大堆。

### 案例 2：训练预算怎么花

你只有 1 周 GPU 时间，应该选哪种策略？

- **A**：小模型（1B），多看几遍数据（多 epoch）
- **B**：大模型（10B），数据只过一遍

按 Kaplan 的结论：**B 更好**。参数大、训练步数少，比参数小、训得久更省 loss。这个建议在 2020 年是主流——直到 Chinchilla 推翻它。

### 案例 3：Anthropic 用它定 Claude 大小

Anthropic 公开访谈承认：Claude 1/2/3 每一代的参数量都是按 scaling laws 算出来的——不是拍脑袋。先估"我们有多少 GPU 月"，再反推"这么多算力下，参数应该多大、数据应该多少"。

## 踩过的坑

1. **Kaplan 把数据需求估低了**：原论文说"参数翻 10 倍，数据只要翻 ~3 倍"。2022 年 DeepMind 的 Chinchilla 论文重做实验，发现"参数翻 10 倍，数据也要翻 10 倍"——Kaplan 当年训得太少 epoch，外推方向偏了。

2. **幂律不是物理定律，是经验拟合**：在 Kaplan 测的范围内（10M ~ 1B 参数）成立。外推到 10T 参数会不会拐弯？没人保证。GPT-4 之后业界开始观察到一些"loss 拐点"的迹象。

3. **loss 低不等于模型好用**：scaling laws 预测的是**预训练 loss**（next-token prediction）。但用户体验的是 instruction-following、推理、对话——这些和 pre-train loss 的关系并不是简单线性。loss 下降 0.1 的可观感差距，可能不如一次 RLHF 改进。

4. **推理成本被忽略**：Kaplan 只算训练成本，没考虑"模型训完了还要服务亿级用户"。Llama-3 现在主动训得比 Chinchilla 推荐的 D 还多——为了推理时模型小一点便宜一点，宁愿训练阶段多砸数据。

## 适用 vs 不适用场景

**适用**：

- 大规模预训练前的预算规划——"我有 X 美金，期望 loss 多少"
- 跨模型规模做架构对比——把不同大小的模型画在同一条曲线上看
- Transformer 类自回归语言模型（Kaplan 验证范围）

**不适用**：

- 微调 / RLHF 阶段——这些变量不是 N/D/C 能描述的
- 多模态 / 扩散模型——曲线参数完全不同，不能直接套
- 评估"用户体验"——loss 不等于能力，能力不等于产品价值
- 极小模型（< 1M 参数）或极大模型（> 100T 参数）——拟合范围外，外推风险高

## 历史小故事（可跳过）

- **2020-01**：Jared Kaplan 在 OpenAI 发表论文，30 页满是曲线。当时业内反应分两派——一派震惊（"原来可以预测"），一派质疑（"幂律会一直成立吗"）。
- **2020-05**：OpenAI 训 GPT-3 175B，结果验证了 Kaplan 的曲线——loss 落在预测线上。这是 scaling laws 的"第一次实战检验"。
- **2022-03**：DeepMind 的 Hoffmann 等人发表 Chinchilla，重做实验，结论与 Kaplan 不同——数据应该和参数同比例增长。一夜之间，行业把"compute-optimal"变成新共识。
- **2023**：Llama-2 / Mistral 等开源模型按 Chinchilla 配方训，数据/参数比从 Kaplan 时代的 ~20 token/参数 涨到 ~200 token/参数。
- **2024**：Llama-3 进一步突破——D 远超 Chinchilla 推荐（15T tokens for 70B 模型），不再追求训练 compute-optimal，而是追求"推理便宜性"。

scaling laws 的"Kaplan 版本"已经被超越，但**用三个变量预测 loss** 这个范式仍是行业基础。

近期发展：2025 年的"reasoning scaling laws"（OpenAI o1 / DeepSeek R1）把"测试时算力"也纳入变量，证明在固定模型上花更多推理 token 也能提升能力，从而打开了第四维度。

这是 scaling 范式的第三次大修——前两次分别是 Chinchilla 修 D（2022）、Llama-3 修推理成本（2024）。每次大修都伴随旗舰模型训练配方调整。

每一代主流模型（GPT 系列、Claude 系列、Llama 系列）的发布前，团队内部都会先画一张 scaling 曲线，看看"投入这么多资源，期望落在哪条曲线上"。这是 LLM 行业最低成本、最高 ROI 的决策工具。

## 学到什么

1. **复杂系统也能用简单公式预测**——只要找对变量。N/D/C 三个数搞定整个 LLM 训练。这种"用少数变量解释一大堆现象"的思路，物理学叫"经验定律"，工程学叫"工程公式"。
2. **先建模再投资**——LLM 工业化的关键是把"实验科学"变成"工程项目"，scaling laws 是这一步的支点。一旦你能预测，决策从赌博变成算账。
3. **每一代论文都会被下一代修正**——Kaplan → Chinchilla → 现在的"推理优先"，都是同一套思路在迭代。不要把任何一篇当真理；要看的是"它解决了什么问题、留下了什么坑"。
4. **理论指导实践，但实践会更新理论**——Llama-3 的训练配方已经超出所有 scaling laws 论文的推荐范围，因为现实里"训练成本 vs 推理成本"的权衡 paper 没考虑。工程师永远在论文之前发现新问题。
5. **外推有边界**：所有 scaling laws 都是在某个 N、D 区间拟合得到；外推到 10x 区间只是"有根据的猜测"
6. **scaling laws 是商业谈判工具**：投资人能拿它对账，反过来稳住整个行业的资本流入
7. **幂律外推 ≠ 永远涨**：曲线在 log-log 图上一直直；现实数据有限 / compute 有限 / 物理极限在等，"接下来还会涨" 是预测，不是结论

## 延伸阅读

- 论文 PDF：[Kaplan et al. 2020 — Scaling Laws for Neural Language Models](https://arxiv.org/abs/2001.08361)（30 页，曲线密集，前 10 页可读性好）
- 后续修正：[Hoffmann et al. 2022 — Training Compute-Optimal LLMs](https://arxiv.org/abs/2203.15556)（Chinchilla，把 Kaplan 的数据/参数比例翻盘）
- 视频解读：[Yannic Kilcher — Scaling Laws Explained](https://www.youtube.com/watch?v=h1QF1l1z7lY)（30 分钟把幂律推导讲清楚）
- 反思：[Sasha Rush — Scaling Laws Are All You Need (?)](https://srush.github.io/)（用最新数据验证 Kaplan/Chinchilla）
- 实操：[Alex Lewkowycz — Scaling Laws Cookbook](https://blog.eleuther.ai/scaling-laws/)（怎么自己拟合 scaling 曲线）

## 关联

- [[gpt-3]] —— OpenAI 用 scaling laws 决定训这个 175B 怪物，是 scaling 第一次实战验证
- [[chinchilla]] —— 修正 Kaplan 关于 D 的低估，建立 compute-optimal 新共识
- [[transformer]] —— Kaplan 实验的对象就是 Transformer 自回归语言模型
- [[megatron-lm]] —— 让 N、D 真正能 scale 的工程基础
- [[deepspeed-zero]] —— 同上，工程层面解锁 scaling 上限

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[align-2021]] —— ALIGN — 用 18 亿条脏图文对训练，证明数据规模能压住噪声
- [[atlas-2022]] —— Atlas — 把检索器和生成器一起训练，11B 打 540B
- [[attention]] —— Attention Is All You Need
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[cot]] —— Chain-of-Thought Prompting
- [[deepspeed-zero]] —— DeepSpeed ZeRO — 微软优化大模型训练显存
- [[double-descent-2019]] —— Double Descent — 模型越大越准，过参数化时代的反常识曲线
- [[dqn]] —— DQN — Deep Q-Network
- [[flan-2021]] —— FLAN — 用自然语言指令教模型学会"听话"
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[grokking-2022]] —— Grokking — 训练 loss 早归零，几千步后才突然学会
- [[lion-2023]] —— Lion — 让程序自己搜出来的优化器，比 AdamW 内存少一半
- [[mixture-of-experts]] —— Mixture of Experts (MoE)
- [[vall-e-2023]] —— VALL-E — 3 秒音频样本就能克隆你的声音
- [[whisper-2022]] —— Whisper — 用 68 万小时"野生"音频教会模型听懂全世界

