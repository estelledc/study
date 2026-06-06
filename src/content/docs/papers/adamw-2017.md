---
title: AdamW — 把 weight decay 从梯度里拆出来
来源: 'Loshchilov & Hutter, "Decoupled Weight Decay Regularization", ICLR 2019 (arXiv 1711.05101, 2017.11)'
日期: 2026-06-01
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

AdamW 是 [[adam-2014]] 的"补丁版"——只改一行代码，把 **weight decay**（权重衰减）从梯度计算里拆出来，直接作用在参数上。日常类比：原版 Adam 像把"修剪树枝"和"浇水施肥"两件事混在一起做，结果剪刀越用越钝；AdamW 把两件事分开做，工具各归其位。

写一行 PyTorch：

```python
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
```

把 `Adam` 换成 `AdamW`、`weight_decay` 给个非零值，就这一行。从 BERT、GPT-2 之后，**几乎所有 LLM 训练**默认走 AdamW。

## 为什么重要

不理解 AdamW，下面这些事都没法解释：

- 为什么 PyTorch 里同时存在 `Adam` 和 `AdamW`，而 LLM 训练脚本几乎只用后者
- 为什么 Adam 的 `weight_decay` 参数在原版里"调了也不太管用"，HuggingFace 教程清一色推 AdamW
- 为什么 "L2 正则 = weight decay" 在 SGD 时代是常识，到了 Adam 就**不再等价**
- 为什么这个仅改一行的改动，是过去十年深度学习训练里**影响最大的工程修复之一**

## 核心要点

L2 正则和 weight decay 在 **SGD 下等价**，在 **Adam 下不等价**。这是整篇论文的命门：

1. **L2 正则**：在损失函数里加一项 `λ/2 · ‖θ‖²`，求导后梯度变成 `g + λθ`。然后丢给优化器。

2. **weight decay**（原始定义，Hanson & Pratt 1988）：每步直接做 `θ ← θ - η·g - η·λ·θ`。**不进梯度**。

3. **SGD 里两者等价**：把 `g + λθ` 当梯度走一步，等于先按 `g` 走再扣 `η·λ·θ`。代数上是同一回事。

4. **Adam 里不再等价**：Adam 用 `√v̂_t`（梯度平方的滑动平均）去缩放梯度。如果把 `λθ` 混进梯度，`λθ` 也会被 `√v̂_t` 缩放——结果是**梯度大的参数被惩罚弱、梯度小的参数被惩罚强**，与"weight decay 应该一视同仁"的直觉相反。

AdamW 的修复——把更新拆成两步：

```
m_t, v_t = ...                                     # 和 Adam 一样
θ ← θ - α · m̂_t / (√v̂_t + ε)                       # 第一步：Adam 的自适应更新
θ ← θ - α · λ · θ                                  # 第二步：解耦的 weight decay
```

代码差异只有"weight decay 不进梯度，直接扣 θ"这一处。但效果差距在 LLM 上能差几个点。

## 实践案例

### 案例 1：训练 BERT/GPT 的标准配方

HuggingFace 默认配置长这样：

```python
from transformers import AdamW   # 已 deprecated, 推荐 torch.optim.AdamW

optimizer = torch.optim.AdamW(
    model.parameters(),
    lr=5e-5,
    betas=(0.9, 0.999),
    weight_decay=0.01,
)
```

注意三件事：

- `weight_decay=0.01` 是 LLM 微调的常见值；从头训用 0.1 也常见
- LayerNorm 和 bias **不加** weight decay，业界共识——这两类参数本来就该自由调整
- `betas` 沿用 Adam 默认；β2 在长训练里有时调到 0.95（GPT-3 用 0.95）

### 案例 2：用一段反例看出 L2 ≠ WD

设想两个参数：

- **w1**：梯度持续约 ±1.0，`v_t ≈ 1.0` → `√v̂_t ≈ 1.0`
- **w2**：梯度持续约 ±0.01，`v_t ≈ 0.0001` → `√v̂_t ≈ 0.01`

如果用"L2 进梯度"的写法（原版 Adam + weight_decay）：

- w1 的实际衰减步：`α · λ · w1 / 1.0` → 正常衰减
- w2 的实际衰减步：`α · λ · w2 / 0.01` → **衰减 100 倍**

结果：**梯度小的参数被衰减得过狠**，可能把 embedding、LayerNorm scale 这些小梯度参数压扁。AdamW 的解耦写法直接绕开这个 bug。

### 案例 3：从 PyTorch 源码看那"一行差异"

PyTorch `torch/optim/adamw.py` 关键三行（简化）：

```python
# Adam（错误）：weight decay 进梯度
grad = grad.add(param, alpha=weight_decay)

# AdamW（正确）：weight decay 直接乘到 param 上，先扣
param.mul_(1 - lr * weight_decay)
# 然后再走 Adam 的自适应更新
```

整个 `AdamW` 类和 `Adam` 类**95% 代码相同**。但这 5% 是命脉。

## 踩过的坑

1. **HuggingFace 早期的 `transformers.AdamW` 不是这个 AdamW**：2018-2020 间 HuggingFace 自己实现的 AdamW 行为和 PyTorch 后来收录的版本略有差异（lr scaling 细节）。新代码统一用 `torch.optim.AdamW`，旧脚本要小心。

2. **`weight_decay` 数值不能照搬 Adam**：从 Adam 切到 AdamW，**同样的 `weight_decay` 值会变得明显更强**——因为不再被 `√v̂_t` 稀释。常见做法是切完之后把 wd 从 0.01 调到 0.1（或反过来）。

3. **不是所有参数都该 weight decay**：LayerNorm γ/β、bias、embedding 这些通常**排除**在 weight decay 之外。GPT-2/BERT 训练脚本里都有 `no_decay = ["bias", "LayerNorm.weight"]` 的过滤逻辑。直接 `model.parameters()` 一把梭会损害性能。

4. **学习率 schedule 仍然必要**：AdamW 不能省掉 warmup 和 cosine decay。LLM 训练 lr 曲线长这样——前 1% 步线性升到峰值，剩余 99% cosine 下降到 10% 峰值。AdamW 修的是 weight decay，不修学习率。

5. **AdamW ≠ Adam + L2 normalize**：有人以为"我自己在 loss 里加 L2 项就够了"。在 Adam 上不行——这恰恰就是论文要解决的 bug。必须显式用 `AdamW` 或自己写解耦逻辑。

## 适用 vs 不适用场景

**适用**：

- 大语言模型训练——从 BERT、GPT-2 到 LLaMA、Qwen 全用 AdamW
- 任何需要 weight decay 防过拟合的深度学习任务（多数监督学习场景）
- Vision Transformer、Diffusion——都已切到 AdamW
- 微调、LoRA、QLoRA 等参数高效微调——优化器仍是 AdamW

**不适用**：

- 计算机视觉 SOTA 网络（ResNet/EfficientNet）——SGD+momentum+cosine 至今领先
- 不需要 weight decay 的小模型（玩具数据集）——用 Adam 即可
- 极端内存受限场景——AdamW 仍要存 m 和 v，参数量 2 倍。用 8-bit AdamW（bitsandbytes）或 Adafactor

## 历史小故事（可跳过）

- **1988 年**：Hanson & Pratt 在 NIPS 提出 weight decay，定义就是"每步直接扣 η·λ·θ"。
- **1990s-2014**：SGD 时代，L2 正则和 weight decay 等价，大家混着用，没人在意。
- **2014 年**：Adam 出现，把 L2 当梯度处理。**bug 一直藏着**，因为深度学习刚起步，大家关注点是模型架构。
- **2017 年 11 月**：Ilya Loshchilov 和 Frank Hutter（弗莱堡大学）发现这个不对称，把修复版投 ICLR 2018，**被拒**——审稿人觉得"改动太小"。
- **2019 年**：他们补强实验后投 ICLR 2019，**被接收**。同年 PyTorch 加入 `torch.optim.AdamW`。
- **2018-2019 BERT/GPT-2 时代**：Google 和 OpenAI 内部已经在用解耦 weight decay。BERT 论文里写的是 "Adam with weight decay"，本质就是 AdamW。
- **2020 起**：所有大模型训练默认 AdamW。Adam 退居"小模型默认"。

教训之一：**审稿人对"小改动"的偏见**。改一行代码、影响整个领域，这种工作初投常被拒。Loshchilov 事后多次提到这件事。

## 学到什么

1. **正则化的实现细节决定一切**——L2 正则和 weight decay 在数学上"几乎等价"，但在自适应优化器下完全不同。理论近似 ≠ 工程实现。
2. **bug 可以藏 5 年**——Adam 2014 年就在用，到 2019 年才有正式修复。深度学习社区的"经验主义"既是优势也是盲区。
3. **一行代码的改动也能拿顶会**——前提是它修的是被忽视的真问题，且有清晰的对比实验。
4. **默认值绑定生态**——PyTorch 把 AdamW 收进去那一刻，就决定了这十年大模型训练的优化器选型。框架默认值的影响力 >> 论文影响力。
5. **从 SGD 到 Adam，再到 AdamW**——优化器演化反映了"模型变复杂、训练变长、参数变大"三件事。每一代修复的都是上一代在新规模下暴露的洞。

## 延伸阅读

- 论文 PDF：[Loshchilov & Hutter 2019, arXiv:1711.05101](https://arxiv.org/abs/1711.05101)（10 页，附录里大量对比图）
- PyTorch 源码：`torch/optim/adamw.py`（100 行不到，对比 `adam.py` 看那一行差异最直观）
- HuggingFace 训练脚本：[transformers/examples/pytorch/language-modeling/run_clm.py](https://github.com/huggingface/transformers/blob/main/examples/pytorch/language-modeling/run_clm.py)（看 `no_decay` 过滤逻辑）
- 博客解析：[Why AdamW matters](https://www.fast.ai/posts/2018-07-02-adam-weight-decay.html)（fast.ai，配图最直观）
- [[adam-2014]] —— AdamW 的母体，先理解 Adam 再看 W
- [[pytorch]] —— `torch.optim.AdamW` 的宿主

## 关联

- [[adam-2014]] —— AdamW 是 Adam 的一行修复版；理解先后顺序
- [[pytorch]] —— PyTorch 默认 LLM 优化器
- [[bert]] —— BERT 论文里的 "Adam with weight decay" 实质就是 AdamW
- [[gpt-3]] —— GPT-3 训练用 AdamW，β2=0.95
- [[lora]] —— LoRA 微调依旧用 AdamW

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adafactor-2018]] —— Adafactor — 把 Adam 的优化器内存从 O(d) 压到 O(√d)
- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[dropout-2014]] —— Dropout — 训练时随机关掉一半神经元，反而学得更好
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[grokking-2022]] —— Grokking — 训练 loss 早归零，几千步后才突然学会
- [[lion-2023]] —— Lion — 让程序自己搜出来的优化器，比 AdamW 内存少一半
- [[lottery-ticket-2019]] —— 彩票假设 — 大网里藏着一张能独立训出来的小网
- [[mixup-2018]] —— mixup — 把两张图按比例叠成一张，标签也一起叠
- [[mode-connectivity-2018]] —— Mode Connectivity — 神经网络的两个最优解之间有低洼走廊
- [[ntk-2018]] —— NTK — 把无限宽的神经网络变成一个可解的核方法
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[sophia-2023]] —— Sophia — 让二阶优化器第一次在 LLM 预训练里跑得动

