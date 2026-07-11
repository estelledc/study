---
title: Activation Patching — 因果干预可解释性方法
来源: 'Vig et al., "Causal Mediation Analysis for Interpreting Neural NLP", NeurIPS 2020 / Meng et al., "Locating and Editing Factual Associations", NeurIPS 2022'
日期: 2026-05-29
分类: AI 可解释性
难度: 中级
---

## 是什么

Activation Patching 是一种**在大模型推理时把"中间层的状态"换成另一段输入的对应状态**的技术——用来定位某条知识藏在哪一层。日常类比：家里墙上一排开关你不知道哪个控制哪盏灯，最稳的办法是把一只灯泡逐个挪到不同灯座上看哪个亮——activation patching 就是把"巴黎是法国首都"这条信息的某层激活，挪到"伦敦是英国首都"的同一层，看模型输出会不会被"带偏"。

具体做法：

- 准备一句 clean prompt：`The Eiffel Tower is in ___`（模型答 Paris）
- 准备一句 corrupted prompt：把关键 token 换成别的，让模型答错
- 把 clean 推理过程中某一层的激活值复制到 corrupted 推理的同一位置
- 看输出有没有"恢复"——恢复说明这层是关键

这是把因果干预实验范式（do-operator）落到 Transformer 内部的最小工程化形态。

## 为什么重要

不理解 activation patching，下面这些事都没法解释：

- 为什么 Anthropic / DeepMind / OpenAI 的可解释性团队都把它当地基工具
- 为什么 ROME / MEMIT 这些"模型编辑"论文敢说"我把 Eiffel Tower 改到罗马"——它们用 patching 先定位再编辑
- 为什么"知识存在哪一层"从凭直觉猜变成实证可验证（之前只能看 attention 图猜）
- 为什么 LLM unlearning / circuit discovery / model editing 三条线都建在 patching 上

类比：之前神经网络解释像看 CT 片猜病灶，patching 是第一把活检钳——能直接确认这块组织是不是关键。

## 核心要点

整个流程拆成 **三步**：

1. **Clean run（正常输入）**：跑一次正常输入，把所有层的激活值缓存下来。类比："健康样本"全身 CT。

2. **Corrupted run（关键 token 替换）**：把关键 token 换掉（比如 Paris → London），跑一次，让模型输出走偏。类比："病变样本"对照组。

3. **Patch + Logit difference**：选某一层某个位置，把 corrupted 推理的激活替换成 clean 的对应值，重新前向，看输出在目标 token 上的 logit 变化：
   - logit 完全恢复 → 这层是关键
   - logit 没动 → 这层不参与
   - 中间值 → 部分参与

把这三步对所有层、所有位置扫一遍，就得到一张"因果重要性热图"。

## 实践案例

### 案例 1：Paris 实验——定位"事实存在哪一层"

```
clean:     "The Eiffel Tower is in"   → Paris
corrupted: "The Colosseum is in"      → Rome
```

逐层 patching 发现 GPT-J（6B 参数）里：

- 早期层（0-5）几乎不影响——这里只在做 token embedding
- 中间层（15-20）的 MLP 输出 patch 后能让 corrupted 的输出从 Rome 切回 Paris
- 晚期层（25+）影响小——这里只在做"决定输出哪个 token"

**结论**：事实知识主要存在中间 MLP 里。这是 Meng 2022 ROME 论文的核心发现。

### 案例 2：ROME——从"定位"到"编辑"

定位完成后，Meng 团队进一步证明：直接在中间 MLP 的 weight 上做 rank-1 编辑，就能把"Eiffel Tower 在 Paris"改成"Eiffel Tower 在 Rome"。

```python
# 伪代码
target_layer = 17  # patching 找到的关键层
key   = encode("Eiffel Tower")
value = encode("Rome")  # 想要的新答案

# 在中间层 MLP 投影矩阵上加一个 rank-1 修正
W_new = W_old + lambda_ * outer(value - W_old @ key, key)
```

编辑完后模型在所有"Eiffel Tower 相关"的查询上都会说 Rome——这是首次让"改一个事实"变成毫秒级操作，不需要重训。

### 案例 3：与 [[sparse-autoencoders]] 互补

- patching 找的是 **电路**（哪些 head / 哪些层是关键节点）
- SAE 找的是 **特征**（每个激活向量里编码了哪些可解释维度）
- 现代可解释性把两者结合：先 SAE 拆出 feature，再用 patching 验证哪些 feature 在因果路径上

## 踩过的坑

1. **clean 和 corrupted 必须 token 长度一致**——长度不一样没法逐位置 patch（BPE 分词决定了名字必须挑等长的）。

2. **logit diff 比 softmax prob 更稳**——直接看概率会被其他 token 拉扯，logit 差更抗干扰，是社区共识默认指标。

3. **冗余 head 让 patching 低估必要性**——很多 Transformer 训练出冗余电路，单独 patch 一个 head 看不出影响（"backup head"），必须联合 patch 才能看出。

4. **corrupt prompt 的设计有主观偏差**——选什么作为"被替换的关键变量"会决定找到哪条 circuit；动词换名词换介词得到不同 circuit。要多种 corruption 并报。

## 适用 vs 不适用场景

**适用**：

- 中等规模 Transformer 上做因果归因（GPT-2 / GPT-J / 7B 级）
- "知识在哪一层"、"哪些 head 在做某任务"的定位问题
- 模型编辑 / unlearning / 微小行为干预的前置工具
- 与 SAE / probing 等方法对照验证

**不适用**：

- 超大模型（70B+）直接跑不起——要先做 attribution patching 一阶 Taylor 近似
- 没有 residual 结构的架构（纯 RNN / 老式 CNN）——patching 分辨率粗
- 需要严格因果保证的场景——patching 只是 do-operator 的近似，遇到非线性会失真，需要 causal scrubbing 等更严格的替代方法

## 历史小故事（可跳过）

- **2020 年**：Vig 等把 mediation analysis（社会科学因果中介分析）的概念引入 NLP，第一次提出"在神经网络里做 do-operation"的范式。
- **2022 年**：Meng 等的 ROME 论文是 patching 最有影响力的应用——在 GPT-J 找到事实层并直接编辑 weight，掀起 model editing 浪潮。
- **2023 年**：Wang 等用 path patching 在 GPT-2 small 上找出 IOI circuit 的 28 个 head；Conmy 等的 ACDC 把 path patching 做成自动搜索算法。
- **2024 年**：Heimersheim 与 Nanda 把方法学规范化（noising vs denoising / node vs path / 度量选择 / 解释陷阱）。
- **2025 年**：与 SAE 结合做 feature-level circuit，patching 单位从 head 升级到 feature。

5 年之内，patching 从一个概念性想法变成可解释性的事实标准工具。

## 学到什么

1. **因果干预可以塞进 forward pass**——不需要重训、不需要梯度，只要能 hook 中间激活就行
2. **"知识在哪"是实证可验证的**——不再是哲学讨论，是可量化、可比较、可复现的实验
3. **可解释性是 model-specific 的实证科学**——同一任务在 GPT-2 small 和 GPT-J 上的电路不同，结论要跟模型绑定
4. **冗余是 Transformer 的特征不是 bug**——backup head 现象意味着单点解释天然有偏差，方法学要承认这点

## 延伸阅读

- 综述：[Heimersheim & Nanda 2024 — How to use and interpret activation patching](https://arxiv.org/abs/2404.15255)（方法学规范化的最佳起点）
- ROME 原论文：[Meng et al. 2022](https://arxiv.org/abs/2202.05262)（带交互式 demo 站点 rome.baulab.info）
- 实操：Neel Nanda 的 TransformerLens IOI demo notebook，能跑通 GPT-2 small 上的完整 patching 扫描
- [[sparse-autoencoders]] —— 把 patching 单位从 head 升级到 feature

## 关联

- [[sparse-autoencoders]] —— 提供 patching 的下一代分辨率（feature 级 circuit）
- [[anthropic-circuits]] —— 提供 patching 之上的数学骨架（QK / OV 分解）
- [[induction-heads]] —— patching 找到的第一类跨论文复用 head
- [[attention]] —— patching 的载体；residual 可加性是 path patching 成立的工程前提

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[causal-abstraction]] —— Causal Abstraction — 神经网络与算法的因果对齐
- [[entity-tracking-states]] —— Entity Tracking States — 语言模型不是一路记账，而是最后临时汇总
- [[sparse-autoencoders]] —— Sparse Autoencoders — 把 superposition 解出来
