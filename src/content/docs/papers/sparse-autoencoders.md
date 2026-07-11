---
title: Sparse Autoencoders — 把 superposition 解出来
来源: 'Bricken et al., "Towards Monosemanticity: Decomposing Language Models with Dictionary Learning", Anthropic 2023; Cunningham et al., arXiv 2309.08600'
日期: 2026-05-29
分类: AI 可解释性
难度: 中级
---

## 是什么

Sparse Autoencoder（**SAE**，稀疏自编码器）是一把**把语言模型内部"被压缩在一起的概念"再解出来**的工具。

日常类比：[[toy-models-superposition]] 那篇论文说神经网络里的神经元像**合租公寓**——一个屋里塞了好几个室友（特征），白天上班时间错开，看起来勉强够住。SAE 干的事就是**给每个室友单独搬出来一间独立房间**：你看到这个房间亮灯，就知道是哪个室友回来了。

具体一点：你抓 GPT-2 第 8 层的**残差流**（residual stream，层与层之间那条"主干公路"上的激活，一个 768 维向量），把它喂给 SAE。SAE 把它**摊开**到一个 16384 维但**大部分是 0**的向量上。这个超大向量里非零的几十个位置，每一个就对应一个**单一语义**——比如"Python 代码"、"礼貌用语"、"金门大桥"。

## 为什么重要

不理解 SAE，下面这些事都没法解释：

- 为什么 Anthropic 会在 Claude 3 Sonnet 上**抽出 3400 万个特征**——单看模型权重你以为里面只有几百万个神经元，怎么能挖出三千多万个独立语义
- 为什么 2024 年 5 月有个"Golden Gate Claude"——把模型放出来 24 小时，问它什么它都答金门大桥，那是工程师把一个 SAE 特征调大了
- 为什么 OpenAI、DeepMind 全都跟进做 SAE，2023-2024 这条线突然变成显学
- 为什么"操控大模型行为"开始从 prompt 调教，往**直接拨内部旋钮**这个方向走

一句话：SAE 让"读懂大模型在想什么"从哲学问题变成工程问题。

## 核心要点

SAE 的全部秘密就**三件事**：

1. **超完备 + 稀疏字典**：输入是 768 维，输出字典开到 16384 维（远大于输入，所以叫"超完备"）。但每次只允许 100 个左右的格子非零（这就是"稀疏"）。类比：你有 1 万种调料，但每道菜只放 5-10 种。

2. **重建 loss + L1 惩罚**：训练目标分两半。一半是**重建**——拆完再合回去要像原激活（mse = 均方误差，像"两张照片差了多少像素"）。一半是**惩罚激活**——所有格子加起来要小（L1 = 绝对值求和，像"用料越少越好"）。两个一起拉，就被迫"用最少的格子重建出最像的输入"。

3. **ReLU encoder + 线性 decoder**：encoder 用 ReLU 把负数砍成 0（只保证非负）；**真正逼出极端稀疏的是 L1 / Top-K**。decoder 是矩阵乘加偏置，保证每个特征是一个独立方向。结构极简，稀疏压力主要在 loss / 选 top-k 上。

## 实践案例

### 案例 1：用 SAELens 看一个特征在说什么

拿 GPT-2 small 第 8 层残差流（768 维）训 8× 超完备 SAE（16384 维），一张 A100 一夜可跑完。跟做流程：

```python
# 伪代码：加载预训练 SAE，对一段文本编码
acts = model.get_residual(layer=8, text="import numpy as np")
z = sae.encode(acts)          # 16384 维，大多为 0
top = z.topk(k=5)             # 看最亮的几个特征 id
```

**逐部分解释**：

1. `get_residual`：抓主干公路上的激活，不是某个单独神经元
2. `encode`：摊开成超完备稀疏码；非零格子才是"亮着的室友"
3. `topk`：按激活强度排序；再取每个特征的 top 激活句，人眼起名

示意：某次跑出来可能看到"Python `import` 行"、"礼貌用语"、"金句/谚语"这类单义特征——直接看 768 维残差只会看到一锅粥。

### 案例 2：把"金门大桥"特征拨到 10 倍

2024 年 5 月 Anthropic 在 Claude 3 Sonnet 上训约 3400 万维 SAE，挖出特征 **ID 31164353（金门大桥）**。推理时把它的激活**乘到约 10×**：

```python
# 伪代码：feature steering
z = sae.encode(residual)
z[31164353] = z[31164353] * 10   # 强行拨大
residual_hat = sae.decode(z)     # 写回残差流再继续生成
```

结果：问"你是谁"答"我是金门大桥"；写代码注释、写诗都会绕回金门大桥。claude.ai 公开 24 小时——**SAE 特征不只看得见，还能拨**。

### 案例 3：Feature steering 让模型更安全

同一招用在"拒绝危险请求"相关特征上，**轻微上调**几个特征：

```python
for fid in refusal_feature_ids:
    z[fid] = z[fid] * 1.2   # 轻推，不是 10×
```

越狱拒绝率上升，日常对话能力几乎不掉。这就是 **feature steering**——比 fine-tuning / RLHF 便宜、可逆、可解释。2024 年一线安全团队开始进库存。

## 踩过的坑

1. **L1 惩罚会让大量特征"死掉"**：训完看一下，可能 80% 的格子从来没激活过。OpenAI 2024 提出 **Top-K SAE**——每次只保留最大的 k 个，硬约束稀疏度。死特征比例直接降到 5% 以下。

2. **decoder 列向量必须单位化**：不然 L1 惩罚可以靠"把激活压小、把字典向量放大"作弊（数学上等价但破坏稀疏性的本意）。每步训练完都要重新归一化。

3. **encoder 前要先减 b_dec**：一个看起来不重要但论文里反复强调的细节。decoder 的 bias 学到了"常量偏移"，encoder 在判断稀疏前要把这个偏移先扣掉，否则稀疏判断会被污染。

4. **Top-K 的 k 怎么选没有理论**：k=32 是经验值。k 太小重建崩，k 太大特征不再单义。生产环境调参噩梦。

## 适用 vs 不适用场景

**适用**：
- transformer 残差流的特征解码（GPT-2 / Claude / Llama 已被验证）
- 想给模型行为找"旋钮"——feature steering
- 大规模可解释性研究——把 polysemantic 神经元拆成 monosemantic 特征字典

**不适用**：
- CNN / RNN / Mamba 等非 transformer 架构（开放问题，没人证明过有效）
- 多语言模型——英文 SAE 训出来的字典在中文上是否复用，目前不清楚
- 不想花 GPU 钱的小团队——GPT-4 级别 SAE 训练成本约 100 万美元（OpenAI 自己披露）
- 需要"特征之间的组合关系"——SAE 默认特征独立，但语言里特征显然是组合的

## 历史小故事（可跳过）

- **1996 年**：神经科学家 Olshausen 和 Field 在 Nature 发表 sparse coding，用稀疏字典学习重建图像 patch，发现学出来的字典长得像 V1 视觉皮层的滤波器。**第一次**有人证明"稀疏 + 超完备字典"是大脑的工作方式。
- **2021 年**：Anthropic 启动 mechanistic interpretability 研究方向，目标"逆向工程一个 transformer"。
- **2022 年 9 月**：[[toy-models-superposition]] 出来，用玩具模型证明"特征数 > 神经元数"时一定会发生 superposition——这是 SAE 的理论前置。
- **2023 年 10 月**：Bricken 等人在 Anthropic 发布 "Towards Monosemanticity"——首次工业级 SAE，在单层 transformer 上把 4096 个特征逐个验证。Cunningham 几乎同时在 arXiv 发 2309.08600，证明在 Pythia 上同样可行。两篇互补成完整证据链。
- **2024 年 5 月**：Anthropic 把 SAE 推到 Claude 3 Sonnet，3400 万特征，金门大桥 demo 出圈。
- **2024 年 6 月**：OpenAI 跟进发布 Top-K SAE，scale 到 GPT-4。
- **2024 年 7 月**：DeepMind 发布 Gated SAE / JumpReLU SAE，从工程角度优化训练效率。

从 1996 年的猫咪视觉皮层，到 2024 年金门大桥 Claude——这条线走了 28 年。

## 学到什么

1. **超完备字典 + 稀疏惩罚是分解高维表示的通用范式**——不只是 LLM，CV、强化学习、蛋白质表示都能套
2. **可解释性 ≠ 可控性**——SAE 让你看见特征，但拨动一个特征会不会破坏其他能力是另一个问题
3. **同题多文互补**值得学：Cunningham 与 Bricken 几乎同期，都做方法+验证，一个偏短文可复现、一个偏逐特征深挖
4. **理论 → 工具 → 产品体验**：Olshausen 1996 是理论，Bricken 2023 是工具，Golden Gate Claude 是产品——每一步隔十几年

## 延伸阅读

- 论文一：[Cunningham et al., arXiv 2309.08600](https://arxiv.org/abs/2309.08600)（8 页短文，30 分钟扫完）
- 论文二：[Bricken et al., Towards Monosemanticity](https://transformer-circuits.pub/2023/monosemantic-features/)（80+ 页交互长文，必须配 dashboard 读）
- 工程库：[SAELens](https://github.com/jbloomAus/SAELens)（社区主力开源实现）
- 产品 demo：[Anthropic Scaling Monosemanticity](https://transformer-circuits.pub/2024/scaling-monosemanticity/)（Goldengate Bridge 完整描述）
- [[toy-models-superposition]]——SAE 的直接前作，先读它再读这篇
- [[induction-heads]]——可解释性研究的另一条线，关注 attention 电路而非残差特征

## 关联

- [[toy-models-superposition]] —— 为什么 superposition 必然发生；SAE 是"怎么解出来"
- [[induction-heads]] —— 第一个被完整逆向的 attention 电路；SAE 可重看其输入特征
- [[anthropic-circuits]] —— Anthropic 电路视角框架；SAE 是输入端解码工具
- [[activation-patching]] —— 因果干预另一条线；常与 SAE 特征定位配合使用
- [[causal-abstraction]] —— 问"内部变量是否对齐算法"；SAE 提供候选变量
- [[sleeper-agents]] —— 藏后门的模型；SAE/steering 是排查异常特征的候选手段

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[activation-patching]] —— Activation Patching — 因果干预可解释性方法
- [[anthropic-circuits]] —— Anthropic Circuits — 把 Transformer 当电路逆向
- [[causal-abstraction]] —— Causal Abstraction — 神经网络与算法的因果对齐
- [[induction-heads]] —— Induction Heads — Transformer 的 in-context learning 引擎
- [[sleeper-agents]] —— Sleeper Agents — 故意藏后门的 LLM
- [[toy-models-superposition]] —— Toy Models of Superposition
