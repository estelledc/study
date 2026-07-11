---
title: Induction Heads — Transformer 的 in-context learning 引擎
来源: 'Olsson et al., "In-context Learning and Induction Heads", Anthropic 2022'
日期: 2026-05-29
分类: AI 可解释性
难度: 中级
---

## 是什么

Induction Head 是 Anthropic 2022 年在 GPT 类模型的 [[attention]] 层里发现的一种**特殊电路**——专门做"看到 [A][B]…再看到 [A] 时输出 [B]"的模式补全。

日常类比：侦探翻字典看到 `apple - 苹果`，过一会儿你问他 "apple = ?"，他**条件反射**答"苹果"。这种**查表式联想**在 transformer 里有专门的脑回路，就叫 induction head。

为什么这事儿重要？因为 GPT-3 之后大家都看到模型能 "few-shot"——给两三个例子就会做新任务。但**没人知道为什么**。Anthropic 这篇论文第一次把这个魔法还原成 attention 里的两层电路。

## 为什么重要

不理解 induction heads，下面这些事都没法解释：

- 为什么 [[gpt-3]] 给两三个例子就能做新任务（in-context learning）——不只是"模型聪明"，是有**具体电路**在干这件事
- 为什么"prompt 里把例子格式对齐"对 few-shot 准确率影响巨大——电路靠 token-level 模式匹配
- 为什么训练曲线上某一刻 loss 会**阶梯式**下降——induction head 在那一刻"涌现"出来
- 为什么后续 [[sparse-autoencoders]] / 可解释性研究都从这篇出发——它给了"机制思维"的方法学

这是 Anthropic 可解释性研究的**旗舰论文之一**，让"模型为什么 few-shot 起来"从神秘变成可观察。

## 核心要点

Induction head 是个**双层 attention 协作**的机制，不是单层能搞定的：

1. **第一层：Previous Token Head**——看到 `[A][B]` 这一对时，把 B 位置的信息**送回到 A 后面的那个位置**。类比：图书馆员把"上一本书是 A"这条便签贴到当前位置。

2. **第二层：Induction Head**——再看到 `[A]` 时，用当前位置当 query 去匹配上文，找到"贴着 prev=A 便签"的位置（也就是第一次 A 的下一位 B），把 B **复制到输出**。类比：图书馆员看到 A，去翻便签找"上次 A 后面跟了啥"，找到 B，照抄。

3. **两层缺一不可**：第一层负责**把上文标记好**，第二层负责**匹配 + 复制**。这就是为什么需要至少 2 层 attention（1 层 transformer 装不出 induction）。

## 实践案例

### 案例 1：最小例子

输入：

```
苹果 = apple. 香蕉 = banana. 苹果 =
```

期望输出：`apple`。

induction head 的工作流：

1. 第一层把每个 token 的 prev-token 信息缓存到当前位置
2. 看到第二个 `苹果` 时，attention 跳到第一个 `苹果` 的下一位 `=`，再下一位 `apple`
3. 把 `apple` 复制到输出 logits

整个过程**不更新参数**，纯靠上下文。这就是 in-context learning 的最小机器。

### 案例 2：用 attention pattern 可视化能直接看到

GPT-2 small 在 layer 5 head 5 上有一个明确的 induction head。给它喂 `苹果=apple. 苹果=` 这种序列，画出 attention 权重热力图，能**直接看到**：第二个 `苹果` 处的 attention 大幅指向上文的 `apple`，颜色亮成一条线。

这是 [TransformerLens](https://github.com/neelnanda-io/TransformerLens) 工具栈让任何人都能跑的实验——`pip install` 然后 30 行代码出图。

### 案例 3：训练曲线上的 phase change

这是论文最戏剧化的发现。在不同大小（10M 到 13B 参数）的模型训练过程中，画两条曲线：

- 蓝线：模型在长上下文上的 loss 下降（衡量 ICL 强度）
- 红线：模型里 induction head 的"成熟度"

两条曲线**几乎在同一训练步**短窗口内**同时跳变**——loss 阶梯式下降的那一刻，induction head 刚好"涌现"出来。这就是论文用**多条证据交叉**把"induction head 因果驱动 ICL"钉死的核心数据。

## 踩过的坑

1. **"induction head" 不是 1 个，是一族**——GPT-2 small 上至少有 5-6 个 head 都有 induction 行为，强度不同。新人以为是单个 head，去找会找不到。

2. **ICL Score 定义比较粗**——论文用"长上下文 loss 下降"代理 ICL，但**任何 token-frequency 类机制也能拿高分**。论文自己 footnote 提到这个混淆但没深入。结论："induction 解释 ICL"是**主要原因**，不是**全部**。

3. **大模型上 head 不再是干净的 atom**——超过 13B + RLHF 后，head polysemanticity（一个 head 同时干好几件事）严重，"head 5.5 是 induction head"在 Claude 级别可能完全不适用。后续要靠 [[sparse-autoencoders]] 接班。

4. **复刻数字对不上很正常**——论文报告 ablate induction head 后 ICL 降 50%+，外部在 GPT-2 small 上复刻通常 30%-40%。原因：论文用更大模型 + mean-ablation，外部用 GPT-2 small + zero-ablation。**绝对数字别死磕，看趋势对不对**。

## 适用 vs 不适用场景

**适用**：

- 教学/理解 ICL 的最简机制——这论文 + ARENA 教程是公认最佳路径
- 在 ≤ 13B 公开模型（GPT-2 / Pythia）上找 task-specific circuit
- 解释为什么 prompt 里"例子格式对齐"对 few-shot 影响大——induction head 靠 token-level 模式匹配
- 调 prompt 时的**思维框架**——不是"模型在想什么"，而是"哪个机制在做这件事"

**不适用**：

- 直接套到 ≥ 100B 大模型（Claude / GPT-4）——polysemanticity 让 head atom 假设失效
- 当作"打开模型黑箱"的银弹——从看到机制到对齐人类语义还有巨大鸿沟
- 用 zero-ablation 当精确干预——会高估 head 因果贡献，要精确测量请用 mean ablation 或更精细的方法
- 期待 6 条证据每条都能在公开模型上独立复刻——只有 ablation 一条工程量小，phase change 那条要训多个 size 模型，外部社区做不起

## 历史小故事（可跳过）

- **2020 年**：[[gpt-3]] 论文引爆 in-context learning——给几个例子就会做新任务，**人不知道为什么**。
- **2021 年**：Anthropic 在 2-layer toy transformer 上发现 induction head 这个结构，但**没说它在真实大模型里也是 ICL 机制**。
- **2022-03**：Anthropic 内部开始用 toy + 真模型双轨实验，验"induction head 真的驱动 ICL"。
- **2022-09**：本论文发布——6 条独立证据钉因果，让"涌现"从神秘变机制。
- **2023-2024**：后续可解释性研究（IOI Circuit / SAE / Scaling Monosemanticity）默认本篇结论作为出发点。

之后所有"机制可解释性"工作都站在这篇肩膀上。

## 学到什么

1. **涌现行为可以变成机制**——"few-shot 起来"不是魔法，是 attention 里的 prefix-match × copy 电路。这是过去 10 年 LLM 可解释性最重要的洞见。

2. **多条独立证据交叉论证**——单条证据弱、6 条交叉强。这种"如果攻击者要打破结论得同时打破 6 条"的论证形式，是从 toy 走向 real 的方法学。日常工程判断也能用。

3. **机制思维取代行为思维**——调 LLM 时别只问"prompt 怎么改"，多问一步"模型在哪个机制层面失败"。这把 try-and-error 变成假设驱动。

4. **工具基础设施很关键**——Anthropic 内部模型不开源，但开源的 TransformerLens 让 6 条证据中的至少 1 条（ablation）能在 GPT-2 small 上独立复刻。**没有工具的论文等于没法社区验证**。

5. **toy → real 的双轨实验法**——先在 2-layer toy transformer 找清晰电路，再在 13B 大模型上验证同一机制存在。toy 给出强假设、real 给出现实意义；缺一会得到"看似优雅但与真模型无关" 或"看似真但说不清是什么" 两种典型失败。

6. **超位置（superposition）问题接班**——induction head 在小模型可见、大模型 attention head 越来越多 polysemantic。这逼着 Anthropic 后续转向 [[sparse-autoencoders]]，从"head 是 atom" 升级到"feature 是 atom"。

7. **训练动态学的窗口**——loss curve 上的 phase change 出现在 induction head 形成的瞬间；这种"内部机制变化映射到外部 metric" 的现象，给训练监控提供了可观测的代理指标。

## 延伸阅读

- 论文 blog 版（含交互式 figure）：[Anthropic transformer-circuits.pub](https://transformer-circuits.pub/2022/in-context-learning-and-induction-heads/index.html)
- arXiv 静态版：[arXiv:2209.11895](https://arxiv.org/abs/2209.11895)
- 教学复刻：[ARENA_3.0 chapter 1](https://github.com/callummcdougall/ARENA_3.0)（5 天工作量，亲手在 GPT-2 small 上跑出 induction）
- 应用案例：[Wang+ 2022 IOI Circuit](https://arxiv.org/abs/2211.00593)（把本论文方法用到 Indirect Object Identification 这种具体语言任务）
- 接班工具：[Bricken+ 2023 Sparse Autoencoders](https://transformer-circuits.pub/2023/monosemantic-features/index.html)（大模型上 head atom 假设失效后的替代）

## 关联

- [[attention]] —— induction head 是 attention 层里的特殊电路，理解它前要先理解 attention 本身
- [[gpt-3]] —— GPT-3 引爆 in-context learning 现象，本论文回答"为什么"
- [[sparse-autoencoders]] —— 大模型上 head atom 假设失效后的接班工具，把"head 是 atom"换成"feature 是 atom"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[activation-patching]] —— Activation Patching — 因果干预可解释性方法
- [[anthropic-circuits]] —— Anthropic Circuits — 把 Transformer 当电路逆向
- [[cot]] —— Chain-of-Thought Prompting
- [[sparse-autoencoders]] —— Sparse Autoencoders — 把 superposition 解出来
- [[toy-models-superposition]] —— Toy Models of Superposition
