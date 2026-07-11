---
title: Anthropic Circuits — 把 Transformer 当电路逆向
来源: 'Elhage et al., "A Mathematical Framework for Transformer Circuits", Anthropic 2021'
日期: 2026-05-29
分类: AI 可解释性
难度: 中级
---

## 是什么

Anthropic Circuits 是 2021 年底 Anthropic 开站 transformer-circuits.pub 的奠基论文，给 Transformer 做了一次"数学化拆解"——把 attention + MLP 这一锅黑箱矩阵乘法，重新写成可以一眼看清楚的代数式。

日常类比：以前的 Transformer 像一台没有电路图的家电——你只看得到 "插电进、声音出"。这篇论文把它当成电子电路重画了一遍——每根线、每个节点、每个开关都标清楚，于是你能拿万用表去量哪根线在传什么信号。

研究员从此可以问："这个 head 到底在做什么？" 而不是只能猜"模型大概在 attend 什么"。

## 为什么重要

不读这篇，你没法理解后来 mech interp（机械可解释性）整个学派为什么能成立：

- **奠基地位**：[[induction-heads]] / [[toy-models-superposition]] / [[sparse-autoencoders]] 三篇 mech interp 的代表作都站在这套数学上写
- **从口号变可执行**：之前"逆向工程 Transformer"是个口号，没人知道从哪儿下刀；这篇给出了具体的拆法——head 拆成两半看，stream 当总线看
- **vocab 沿用至今**："residual stream" / "QK circuit" / "OV circuit" / "writing weights" 这些词都是这篇定义的，2026 年的 mech interp 论文还在用
- **作者血脉**：一作 Chris Olah 早年在 Google Brain 做可视化，去 OpenAI 写 Distill Circuits（视觉模型电路），再到 Anthropic 把同一思路搬到 Transformer——一条思想线串了 6 年

## 核心要点

论文重画的核心是 **三个原语**：

1. **Residual stream（残差流）**：每一层不是替换前一层的输出，而是"在主线上加一笔"。可以把它想成一根从输入到输出的公共数据总线，每个 head / MLP 都从总线读一段、再把自己的贡献加回去。

2. **QK circuit（查询-键路径）**：决定 attention "看哪里"。把 head 的 query 矩阵和 key 矩阵合起来看，就是一个"位置匹配规则"。

3. **OV circuit（值-输出路径）**：决定 attention "搬什么内容"。把 value 矩阵和 output 矩阵合起来看，就是一个"内容写入规则"。

**关键洞见**：QK 和 OV 在数学上完全独立——一个 head 可以"看对了地方但搬错了内容"，也可以"搬对了内容但看错了地方"。这两件事可以分开调试。

## 实践案例

### 案例 1：0-layer Transformer = bigram 模型

最退化的情况——一个 attention head 都没有，只剩 embedding 和 unembedding。

这种"模型"本质上就是统计 "看到词 A 之后，下一个最可能是什么词"——即 bigram（二元词组）统计。

类比：像一个不会推理只会背书的小学生——"鹅"后面 90% 跟着 "鹅鹅"。论文从这里起步，因为它给出了"模型能力的最低基线"——比 bigram 强的部分都来自后面的 head。

### 案例 2：1-layer attention-only = skip-trigram

加一层 attention（去掉 MLP），模型能力跳一个台阶——能学 **skip-trigram**：A ... B → C 这种"看到 A 又看到 B，预测 C"的三元模式。

举例：句子 "she walked into the room and ___"。1-layer 模型可以让 attention head 同时关注 "she" 和 "walked"，把这两个信号合起来推测下一个词。

但只能 skip-trigram，做不了更长的依赖——所以 1-layer 模型不会"in-context learning"。

### 案例 3：2-layer 涌现 in-context learning

第二层 head 出现的瞬间，质变发生——**induction head（归纳头）** 涌现：

- 第 1 层有个 **previous-token head**，它干的事很简单：把"上一个 token"复制到当前位置的 stream 里
- 第 2 层有个 **induction head**，它读到当前 token，然后去序列里找"上次出现这个 token 的下一个位置"，把那个位置的内容搬过来

效果：序列 `... A B ... A` 末尾，2-layer 模型会预测 `B`——这就是 in-context learning 的最小机器。Few-shot prompt 的"看几个例子学一招"能力，根源在这。

## 踩过的坑

读这篇容易踩的几个坑：

1. **以为 QK / OV "矩阵"真的存在**：论文反复用 W_QK 和 W_OV 这两个 d_model × d_model 的"虚拟权重"讲故事。但实际推理时这俩矩阵从来没有显式构造出来过——会爆显存。它们是分析工具不是计算工具，知道这点你就不会想直接 print 它们的奇异值。

2. **以为残差流是"干净的子空间分解"**：论文画图时把 stream 切成一段段子空间，看起来每个 head 占一格。真相是后续 [[toy-models-superposition]] 揭示的——子空间是 superposed（叠加）的，多个特征会挤在同一组维度上。

3. **以为框架能直接套到 GPT-4 上**：论文只在 0-1-2 layer attention-only toy 上推干净。3 层起 path 数量是 head 数的立方，分析无法枚举；加 MLP 后非线性破坏分解。大模型的 mech interp 是 [[sparse-autoencoders]] 救场。

4. **把 attention pattern 当成 explanation**：旧错误。光看 head 在 attend 什么不够——必须做 ablation（消融）才能确认它真的在因果地影响输出。

5. **以为 induction head 在大模型里也是干净的 K-composition**：论文 2-layer toy 上 induction head 来自 layer-2 用 layer-1 输出当 key（K-composition）。真实 GPT-2 / Pythia 的 induction head 经常 K-comp + V-comp 混合——理论极简模型 vs 真实大模型的常见错位。

## 适用 vs 不适用场景

**适用**：

- 学习 Transformer 内部机制，不想停在"它能 work 就行"
- 在小模型（GPT-2 small 级别）上做 circuit-level 分析
- 调试 prompt：理解 few-shot 例子位置为什么影响效果（induction head 心智模型）
- 给 RAG / agent 做归因：区分 "model 没看对地方"（QK 问题）vs "看对了写错了"（OV 问题）

**不适用**：

- 大模型行为分析 → 用 SAE / dictionary learning（[[sparse-autoencoders]]）
- 需要跨 ≥ 3 层的 circuit → path 数爆炸，原始框架顶不住
- 把 head 当 "monosemantic 单元"——同一个 head 经常同时在做几件事
- 解释含 LayerNorm / gating 的非线性结构——加性分解会失效

## 历史小故事

- **2020-2021**：Chris Olah 在 Google Brain → OpenAI 期间做 Distill 期刊，开了 Circuits 系列——在 InceptionV1 视觉模型上把"曲线检测器""车轮检测器"这些概念找出来。这是把"神经网络当电路看"的第一次大规模实践。
- **2021-08**：Olah 离开 OpenAI，与 Dario / Daniela Amodei 等创立 Anthropic，组 interpretability 团队，开 transformer-circuits.pub 这个自办 blog 系列。
- **2021-12**：Mathematical Framework 论文发布。注意它不上 arXiv、不走 NeurIPS——直接挂 blog。这种"blog-post-as-paper"形式之后成了 mech interp 子领域的标准发表方式。
- **2022**：[[induction-heads]] 实证 induction head 的 emergence 与 in-context learning 能力的相变对齐；[[toy-models-superposition]] 把 superposition 现象正式化。这两篇都在补 Mathematical Framework 留下的空白。
- **2024**：[[sparse-autoencoders]] scale 到 Claude 3 Sonnet 级别——证明 mech interp 的工具栈能跨越到生产级大模型。一条从 2021 数学框架开始的研究线，6 年后落到大模型上。

## 学到什么

1. **加性结构是分析的钥匙**：Transformer 的残差连接 `x + f(x)` 表面是工程优化（梯度好流），数学上让"贡献分解"成立——每个 head 可以独立审查。少了这个加号，整个 mech interp 都做不了。

2. **理论简化的代价要诚实**：论文为了干净，去掉了 MLP、LayerNorm、≥ 3 层。这不是 bug 是 feature——把可分析模型与真实大模型的差距摆在台面上，后续工作才知道往哪儿补。

3. **概念工具 vs 计算工具**：W_QK / W_OV 永远不显式构造，但作为思考工具非常好用。理论里允许用"理想化的物体"，写代码时再换工程实现。

4. **vocab 比公式更持久**："residual stream" / "QK circuit" 这些词比论文具体公式传播得远——好的命名让后人 5 句话能讲清楚思路，差的命名再正确也传不开。

5. **mech interp 是 alignment 的工具栈**：Anthropic 把可解释性当作 alignment 的根基——只有看到模型怎么算，才能保证它怎么对齐。这条路线和"对齐靠 RLHF + 红队评测" 的 OpenAI 路线分道扬镳，是 2 大顶级实验室战略差别的核心。

6. **从 toy 到 production 是 5 年**：2021 框架 → 2022 induction head → 2023 superposition → 2024 SAE 上 Claude Sonnet。每一步都解决前一步的限制；这种"小步慢跑 + 工具迭代" 的研究节奏比"一篇大论文" 走得远。

7. **W_QK / W_OV 是不显式构造的"思想物体"**：研究允许用"理想化但不实例化" 的对象当推理工具，写代码时再换工程实现——数学家 / 物理学家常用的招数被借进了 ML interp。
8. **可解释性的三层路径**：从 attention 头 → 跨层 circuit → SAE 特征字典，每一层抽象都对应"什么算单位"的不同选择；研究方法的进步本质是"找到比上一代更可分解的单位"。

## 延伸阅读

- 论文主页：[Mathematical Framework for Transformer Circuits](https://transformer-circuits.pub/2021/framework/index.html)（blog 形式，无 PDF）
- 后续实证：[In-Context Learning and Induction Heads](https://transformer-circuits.pub/2022/in-context-learning-and-induction-heads/index.html)
- 工具库：[TransformerLens](https://github.com/neelnanda-io/TransformerLens)（Neel Nanda 把框架做成 Python 库）
- 入门教程：[ARENA Mech Interp](https://www.arena.education/)（按这篇论文的思路设计的实操课）

## 关联

- [[attention]] —— attention 机制本身；本篇拆的就是它
- [[induction-heads]] —— 本篇预测的"两层涌现 ICL 机器"被这篇实证
- [[toy-models-superposition]] —— 解释为什么 residual stream 不是干净正交分解
- [[sparse-autoencoders]] —— mech interp 在大模型上的下一代工具
- [[flash-attention]] —— 同一个 attention 机制，从工程加速角度切

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[activation-patching]] —— Activation Patching — 因果干预可解释性方法
- [[anthropic-prompt-caching]] —— Anthropic Prompt Caching — 让长 prompt 只算一次，后续只付 10%
- [[causal-abstraction]] —— Causal Abstraction — 神经网络与算法的因果对齐
- [[grokking-2022]] —— Grokking — 训练 loss 早归零，几千步后才突然学会
- [[lstm-1997]] —— LSTM — 用门控让神经网络记得住上一段话
- [[mcp-spec]] —— MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议
- [[mesa-optimization-2019]] —— Mesa-Optimization 2019 — 训出来的模型自己也是个优化器
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[sleeper-agents]] —— Sleeper Agents — 故意藏后门的 LLM
- [[sparse-autoencoders]] —— Sparse Autoencoders — 把 superposition 解出来
- [[toy-models-superposition]] —— Toy Models of Superposition
