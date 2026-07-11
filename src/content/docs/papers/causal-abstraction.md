---
title: Causal Abstraction — 神经网络与算法的因果对齐
来源: 'Geiger et al., "Causal Abstractions of Neural Networks", NeurIPS 2021'
日期: 2026-05-29
分类: AI 可解释性
难度: 中级
---

## 是什么

Causal Abstraction 是 Stanford NLP（Christopher Potts 组）2021 年提出的一套**判断神经网络内部是否真的在执行某个算法**的因果框架。日常类比：

> 黑盒检测——你说工厂里有 A → B → C 三道流水线？我去**拔 B 站的电源**，看 C 是不是真的停。如果 C 真的停了，说明 B 真的在管 C；如果 C 照常运行，说明你说的 B → C 是脑补的。

放到 LLM 上：你猜模型内部"先比大小、再做加法"。Causal Abstraction 不靠看激活图猜，而是去**干预**那块"比大小"的子空间，然后看输出有没有按"比大小被改"的方向变。变了 → 模型真的在做这步；没变 → 你的假设错了。

这把"模型实现了 X 算法"从"看着像"变成了"因果证实"。

## 为什么重要

不理解 Causal Abstraction，下面这些事都没法解释：

- 为什么 mech interp（机制可解释性）领域有两大阵营——SAE 派（找单义特征）和 Causal Abstraction 派（验因果结构），2026 年还在对峙
- 为什么 Anthropic / DeepMind 现在做"算法回路找哪一层"的论文，几乎都用 [[activation-patching]] 起手——它和 Causal Abstraction 是同一思想的两个层级
- 为什么 2024 年 DAS（Boundless DAS）能"自动学出对齐"——它把 2021 年这篇手工指定的对齐变成了可微分搜索
- 为什么"模型懂 X"这种话从 2021 年开始有了**可证伪**的写法——不再是"探针准确率 90%"这种相关性证据

简言之：它给"神经网络在做什么"提供了第一个**经得起反例**的判定方法。

## 核心要点

整个框架可以拆成 **四件东西**：

1. **High-level 算法**：你**假设** LLM 在执行的简单算法。比如"先比大小（Tom < Jane？），再决定输出（小的那个跑得慢）"。这是用人能写的伪代码画出来的因果图。

2. **Low-level 网络**：真实的 LLM 激活——一堆没人能直接读懂的浮点数。

3. **Alignment（对齐）**：把 high-level 里的每个变量（如"Tom < Jane 的真假"）映射到 low-level 的某个**子空间**——比如某层第 100-200 维。这一步说："如果模型真的在算这个变量，它应该藏在这块"。

4. **Interchange Intervention（交换干预）**：拿两个不同输入跑模型，把那块子空间从输入 A 抠出来、贴到输入 B 上，再看输出。如果输出变成了"按 high-level 算法用 A 的中间结果应该得到的答案"，对齐被验证；否则假设错了。

四步加起来叫 **causal abstraction 检验**——一个布尔答案：你的假设对不对。

## 实践案例

### 案例 1：Tom 和 Jane 谁跑得慢

假设：LLM 处理"Tom is shorter than Jane. Who runs slower?"时，内部先算了 "Tom < Jane = True"，再用这个布尔值决定输出。

检验流程：

1. 找出 LLM 中某层某段维度（比如第 14 层第 200-300 维），假设它表示"Tom < Jane"
2. 跑一个对照输入"Tom is taller than Jane."——这时同位置应该表示"Tom < Jane = False"
3. **抠出对照的那段维度**，**贴回原输入的那一层**——其他全保持原样
4. 看输出——如果模型从"Tom 跑得慢"切到"Tom 跑得快"，假设成立；如果输出没动，那块维度就不是在表示这件事

整个过程**不需要看激活图**，输出变化就是判决。

一个最小伪代码长这样：

```python
base = model("Tom is shorter than Jane. Who runs slower?")
source = model("Tom is taller than Jane. Who runs slower?")
patched = run_with_patch(base_input, layer=14, dims=slice(200, 300), value=source.hidden)
```

**逐部分解释**：`base` 是原问题，`source` 提供"相反中间变量"，`run_with_patch` 把指定层的指定子空间换掉。最后只看 `patched` 的答案是否跟着 high-level 算法预期翻转。

### 案例 2：和 [[activation-patching]] 的关系

两者经常一起出现，但任务不同：

- **activation patching**：找位置——"是哪一层、哪几个神经元在管这个能力？"
- **causal abstraction**：验语义——"那个位置真的在表示我说的那个变量吗？"

类比：patching 是 "B 站在哪里"，causal abstraction 是 "B 站真的在管 C 吗"。前者定位，后者结构验证。

案例延伸：在 IOI（Indirect Object Identification）任务上，作者验证 GPT-2 small 内部确实存在"找名字 → 抑制重复 → 输出剩余者"三步算法。任何后续改进 mech interp 的论文都拿这个 benchmark 比对。

### 案例 3：Boundless DAS 让对齐自动学

2021 年原版要**手工指定**"high-level 变量 → low-level 第几维"的映射——这一步靠人猜，猜错就白干。2024 年 Boundless DAS（Geiger 等人续作）把这一步变成：

- 在 low-level 上学一个**可旋转的子空间**（旋转矩阵作为参数）
- 用梯度下降，让"干预这个子空间后输出变化"匹配 high-level 算法的预测
- 旋转矩阵学好了 = 对齐找到了

这让 causal abstraction 从"手工科学"变成了"可微分自动搜索"。

实操经验：Boundless DAS 上手成本不低——你需要选好 high-level 算法、训练循环、目标函数，比 2021 原版多写 200 行代码。但收益是不再依赖人工猜，通过率更高。这也是为什么 2024 年之后 mech interp 论文几乎都默认用 DAS 而非手工对齐。

## 踩过的坑

1. **High-level 算法画得太复杂会找不到对齐**：如果你的假设算法本身有 8 个变量、20 条边，几乎不可能在中等模型里全部对齐通过。实践里都从 2-3 个变量的小算法开始。

2. **对齐通过 ≠ 模型只这么算**：通过 causal abstraction 检验只能说"这个算法是模型行为的一个因果解释"，不排除模型同时还在做别的事。多个不同 high-level 算法可能都通过——这叫"多重对齐"，2023 年才被仔细讨论。

3. **干预粒度选错全盘失败**：子空间选太大（整层）→ 干预把太多东西一起换了，输出乱变；选太小（10 维）→ 该有的因果效应埋没在噪声里。Boundless DAS 的旋转矩阵就是为了缓解这个。

4. **跨任务不可迁移**：在 IOI 任务上验证过的对齐，换到 subject-verb agreement 任务就要重做。每个任务都要从头跑——这是 2026 年 mech interp 共同的痛。

5. **统计显著性常被忽略**：一次干预的输出变化可能恰好"看上去对"。严格做法是跑多组 input pair、做置信区间，但论文里 80% 案例只展示一两个例子，复现起来发现并不稳定。

6. **干预接口要和模型架构耦合**：transformer 加 hook 容易，混合架构（卷积+注意力，或带门控）的 hook 点不显然。新架构出来 mech interp 就要补一轮基础设施工作。

7. **alignment 找不到 ≠ 模型没在做**：缺乏对齐可能只是你的 high-level 算法画错了，不能下"模型不会"的结论。这点容易让初学者高估论文的负面证据。

## 适用 vs 不适用场景

**适用**：

- 验证"模型在做某个简单算法"这类**结构性**假设——比如比较、计数、复制
- 配合 [[activation-patching]] 做完整的 mech interp 分析——前者定位，后者验语义
- 学术论文里需要"经得起反例"的证据——比"探针准确率"强一个量级

**不适用**：

- 没有清晰 high-level 算法的复杂任务（如开放问答、写作）——你画不出因果图，框架就用不上
- 极大模型上的全网络分析——干预 + 跑前向的成本随模型大小爆炸
- 想找"单义特征"——这是 [[sparse-autoencoders]] 的活，causal abstraction 不关心特征语义

## 历史小故事



- **2019 年**：Beckers & Halpern 在哲学/AI 期刊发表 constructive causal abstraction，把 Pearl 的 structural causal models 推广到"两个不同粒度的因果图怎么对齐"。纯哲学，没人想过用在 NN 上
- **2021 年**：Atticus Geiger（Stanford NLP 博士生，Christopher Potts / Manning 圈）把 Beckers & Halpern 的形式化移植到神经网络——用 partition + 数值映射 τ 定义对齐，用交换干预做检验。NeurIPS 2021 中稿
- **2023 年**：IIA（Interchange Intervention Accuracy）把"对齐通过没"从布尔变成 0-1 分数，方便横向比较
- **2024 年**：Boundless DAS 让对齐变成可学的旋转矩阵，把这一派从"手工科学"推到"可微分搜索"
- **2025-2026 年**：Anthropic 的 SAE 派和 Stanford 的 Causal Abstraction 派各自扩张地盘，开始有人尝试结合（用 SAE 找候选特征，用 causal abstraction 验语义）

## 学到什么

1. **干预比看激活强一个量级**——看激活只能得相关性，干预能得因果。这是 Pearl 1990s "causal revolution" 在 mech interp 里的回响
2. **可证伪**比"看着像"重要——一个能被反例打死的假设，才值得发论文
3. **形式化**让大家说同一种话——"模型懂 X" 这种模糊表述，被 causal abstraction 翻译成了"M_h 是 M_l 的 τ-causal abstraction"，可以争论、可以反驳、可以累积
4. **理论 → 算法 → 自动化**：2019 哲学 → 2021 形式化 → 2024 可学化，每步隔 2-3 年。学派从冷门到主流就这个节奏
5. **抽象层级匹配是科学语言的核心**——同一个系统可以有多份正确的因果解释，关键看你在哪个粒度上看。神经元级、层级、模块级各有其因果图
6. **实验设计比 metric 更重要**——causal abstraction 用"对比输入 + 干预 + 输出对比"三件套，比单纯堆数据集准确率告诉你的多得多
7. **数学定义经常滞后直觉两年**：先有 activation patching 这种朴素做法，再有 causal abstraction 把它形式化，再有 DAS 把它自动化——研究领域成熟的标志就是直觉被翻译成形式系统

## 延伸阅读

- 论文 PDF：[Geiger et al. 2021 — Causal Abstractions of Neural Networks](https://arxiv.org/abs/2106.02997)（NeurIPS 2021，密度高，先看 Section 3）
- 工具库：[stanfordnlp/pyvene](https://github.com/stanfordnlp/pyvene)（这一派的官方实现，跑 IOI 案例 5 行代码）
- 续作：[Boundless DAS](https://arxiv.org/abs/2305.08809)（让对齐自动学）
- 综述：[Mueller et al. 2024 — A Primer on the Inner Workings of Transformer-Based Models](https://arxiv.org/abs/2405.00208)（mech interp 全景，把这一派和 SAE 派放一起讲）
- [[activation-patching]] —— 同一思想的位置定位版
- [[sparse-autoencoders]] —— mech interp 的另一条主线，与本文对峙
- 实战教程：pyvene 仓库下 `tutorials/` 目录有 IOI / RAVEL 等多个端到端案例，是入门最快路径
- 哲学根源：[Beckers & Halpern 2019](https://arxiv.org/abs/1906.11583) 把 Pearl 因果图扩展到不同粒度，是 Causal Abstraction 的形式化先祖
- 反对声音：[Bills et al. 2023 SAE 论文](https://transformer-circuits.pub/) 的开篇直接讨论"为什么不止做 causal abstraction"，可以看到两派的方法论分歧

## 关联

- [[activation-patching]] —— 找位置，causal abstraction 验结构；两者经常配合
- [[sparse-autoencoders]] —— SAE 找单义特征，causal abstraction 验因果对齐；2026 年的两条主线
- [[anthropic-circuits]] —— Anthropic 的 mech interp 主轴，与本文是同一目标的不同方法学
- [[bert]] —— 早期"探针法"研究的主战场，causal abstraction 出现后这类相关性证据被降权
- [[attention]] —— 框架被广泛用来验证"attention head 在执行某个算法"这类假设

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[entity-tracking-states]] —— Entity Tracking States — 语言模型不是一路记账，而是最后临时汇总
- [[sparse-autoencoders]] —— Sparse Autoencoders — 把 superposition 解出来
