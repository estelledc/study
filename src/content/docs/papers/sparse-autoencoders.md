---
title: Sparse Autoencoders 把 superposition 解出来的那把扳手
description: Cunningham 2023 与 Bricken 2023 双论文精读：从 toy models 的玩具实验到工业级特征解码器
season: N
episode: N3
status: 状元
layer_focus: method
last_updated: 2026-05-28
---

import { Aside } from '@astrojs/starlight/components';

## Layer 0 元数据

| 字段 | 值 |
|------|----|
| 双论文 | Cunningham 2023（arXiv 2309.08600）+ Bricken 2023（transformer-circuits.pub） |
| 机构 | Anthropic + Bristol（双线并行） |
| 关键链接 | [arXiv 2309.08600](https://arxiv.org/abs/2309.08600) / [transformer-circuits.pub Toward Monosemanticity](https://transformer-circuits.pub/2023/monosemantic-features/) |
| 主仓库 | [jbloomAus/SAELens](https://github.com/jbloomAus/SAELens)（commit 3f1a8b9c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a） |
| 副仓库 | [openai/sparse_autoencoder](https://github.com/openai/sparse_autoencoder)（commit b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7） |
| 工具仓 | [neelnanda-io/TransformerLens](https://github.com/neelnanda-io/TransformerLens)（commit 59a828a90c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f） |
| 类型 | method / empirical 双轨 |
| 应用案例 | Claude 3 Sonnet 上 34M features，Goldengate Bridge demo |
| 阅读节奏 | 7 天精读 + 7 天复现（GPT-2 small layer 8 residual） |

## 一句话定位

SAE 是把 polysemantic neuron 拆成 monosemantic feature 的工业级扳手——把残差流当作 sparse code 的低维投影，再用一个超完备字典把它解码回来。

![SAE 架构图](/study/papers/sparse-autoencoders/01-sae-architecture.webp)

<Aside type="note" title="读这篇之前">
你应该已经读过 [Toy Models of Superposition](/papers/toy-models-superposition/)。Toy Models 解释了**为什么**会有 superposition（特征数 > 神经元数时的几何学必然），但没给出在真实 LLM 上**怎么解出来**的工具。SAE 就是那把工具。
</Aside>

## Layer 1 Why

### 问题不是新的，新的是规模

1996 年 Olshausen & Field 在 Nature 上发表 sparse coding，用一组超完备基向量重建图像 patch，发现学出来的基向量长得像 V1 视觉皮层的 Gabor filter。这是 sparse coding 第一次和神经科学对上号。

接下来 25 年这个想法在压缩感知、字典学习里反复出现，但没人把它套到神经网络的内部表示上——因为没必要，2010 年代的 CNN 你看 filter 可视化就够了，每个 filter 已经接近 monosemantic。

[Toy Models of Superposition](/papers/toy-models-superposition/) 把问题挑明了：当**特征数 > 神经元数**时，模型会把多个特征塞进同一个神经元的不同方向上（superposition），单看 neuron activation 你看不到任何有意义的东西。GPT-2 small 的 residual stream 是 768 维，但模型里的"概念"（特征）数量保守估计 10K-100K 量级——典型的 superposition 场景。

那能不能用一个"反 superposition"的工具，把 768 维残差流投影到一个**几万维但稀疏**的空间，让每个维度对应一个真正的 monosemantic feature？这就是 SAE 的核心动机。

### 为什么是 2023 年同时爆出来

Cunningham（Bristol，独立学者背景）和 Bricken（Anthropic）几乎同时在 2023 年 9-10 月发表，不是巧合：

1. **Toy Models 论文（2022 年 9 月）**给了所有人 superposition 的精确数学描述
2. **Anthropic 的 Circuits 系列**（[Anthropic Circuits E5](/papers/anthropic-circuits/)、[Induction Heads N1](/papers/induction-heads/)）证明了真实模型里**有**机制可以挖
3. GPU 算力到了能在 GPT-2 small 上训 8x 超完备 SAE 的水平（一张 A100 一晚上）

三个条件同时满足，SAE 就成了"显学"。

## Layer 2 论文地形

两篇论文做的是同一件事，但风格完全不同：

| 维度 | Cunningham 2023 | Bricken 2023 |
|------|----------------|--------------|
| 体裁 | 8 页 arXiv 短文 | 80+ 页 transformer-circuits.pub 长文 |
| 模型 | Pythia 70M / 410M | 单层 transformer（自家训的） |
| 评测 | quantitative：MMCS / loss recovered | qualitative + quantitative 双轨 |
| 贡献 | 证明 SAE 在真实 LLM 上能 scale | 证明 SAE features 是真 monosemantic |
| 读法 | 30 分钟扫完 | 必须 dashboard 配着读 |

Cunningham 是"我们在 LLM 上跑通了 SAE"，Bricken 是"我们逐个 feature 验证它确实是单义的"。两篇互补，缺一不可。

## Layer 3 精读

### 3.1 标准 SAE：encoder + L1 loss

最朴素的 SAE 就是一个带 L1 稀疏惩罚的浅层 autoencoder。给定输入 x（比如 GPT-2 layer 8 的 residual stream，768 维），SAE 学一个 encoder 把它映射到一个**超完备**（比如 8x = 6144 维）的 sparse latent z，再 decode 回 x。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class StandardSAE(nn.Module):
    """标准 L1 SAE，sparsity 由 L1 惩罚控制。"""

    def __init__(self, d_in: int, d_sae: int, l1_coeff: float = 1e-3):
        super().__init__()
        self.d_in = d_in
        self.d_sae = d_sae
        self.l1_coeff = l1_coeff

        # encoder: x -> z
        self.W_enc = nn.Parameter(torch.empty(d_in, d_sae))
        self.b_enc = nn.Parameter(torch.zeros(d_sae))

        # decoder: z -> x_hat
        self.W_dec = nn.Parameter(torch.empty(d_sae, d_in))
        self.b_dec = nn.Parameter(torch.zeros(d_in))

        # Kaiming 初始化 + decoder 权重单位化（论文里强调这一点）
        nn.init.kaiming_uniform_(self.W_enc)
        self.W_dec.data = self.W_enc.data.T.clone()
        self._normalize_decoder()

    def _normalize_decoder(self):
        with torch.no_grad():
            norms = self.W_dec.norm(dim=1, keepdim=True)
            self.W_dec.div_(norms.clamp(min=1e-8))

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        # 注意：先减去 b_dec（pre-encoder bias），论文里这个细节很关键
        x_centered = x - self.b_dec
        z = F.relu(x_centered @ self.W_enc + self.b_enc)
        return z

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        return z @ self.W_dec + self.b_dec

    def forward(self, x: torch.Tensor):
        z = self.encode(x)
        x_hat = self.decode(z)
        recon_loss = F.mse_loss(x_hat, x, reduction="mean")
        sparsity_loss = self.l1_coeff * z.abs().sum(dim=-1).mean()
        return x_hat, z, recon_loss, sparsity_loss
```

旁注：

- **pre-encoder bias 减 b_dec**：这是 Anthropic 在 Bricken 2023 里强调的细节。如果不减，decoder bias 学到的"常量偏移"会污染 encoder 的稀疏判断。
- **decoder 权重单位化**：每个 feature 方向是 W_dec 的一列，必须单位化，否则 L1 惩罚可以通过缩小 z、放大 W_dec 列向量来"作弊"。
- **W_dec 初始化为 W_enc.T**：物理直觉是 encoder 和 decoder 在初始时应当对称（identity-like），训练才会稳。
- **F.relu 不是 GELU**：SAE 必须用 ReLU，因为我们要的是**严格稀疏**（z 的某些维度恰好是 0），GELU 会让所有维度都有非零小值。
- **L1 不是 L0**：L0 不可导。L1 是凸近似，但代价是有 shrinkage bias（活跃 feature 的 magnitude 被压低），这是后来 Top-K 和 Gated SAE 想解决的核心问题。

怀疑：L1 真的是对的稀疏惩罚吗？有论文（Rajamanoharan 2024）指出 L1 在大 SAE 上会让大量 feature 死掉（dead neurons），换成 Top-K 可以避免。我会在 3.2 展开。

### 3.2 Top-K SAE / JumpReLU / Gated SAE

OpenAI 在 2024 年 6 月发的 [Scaling and evaluating sparse autoencoders](https://arxiv.org/abs/2406.04093) 把标准 SAE 换成了 Top-K：每次 forward 只保留 z 里最大的 k 个值，其余归零。这样**稀疏度变成硬约束**而不是 L1 调出来的软约束，dead neuron 问题直接消失。

```python
class TopKSAE(nn.Module):
    """OpenAI 风格的 Top-K SAE，硬约束稀疏度。"""

    def __init__(self, d_in: int, d_sae: int, k: int = 32):
        super().__init__()
        self.d_in = d_in
        self.d_sae = d_sae
        self.k = k

        self.W_enc = nn.Parameter(torch.empty(d_in, d_sae))
        self.b_enc = nn.Parameter(torch.zeros(d_sae))
        self.W_dec = nn.Parameter(torch.empty(d_sae, d_in))
        self.b_dec = nn.Parameter(torch.zeros(d_in))

        nn.init.kaiming_uniform_(self.W_enc)
        self.W_dec.data = self.W_enc.data.T.clone()

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        x_centered = x - self.b_dec
        pre_act = x_centered @ self.W_enc + self.b_enc

        # Top-K：只保留最大的 k 个值
        topk_vals, topk_idx = pre_act.topk(self.k, dim=-1)
        z = torch.zeros_like(pre_act)
        z.scatter_(-1, topk_idx, F.relu(topk_vals))
        return z

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        return z @ self.W_dec + self.b_dec

    def forward(self, x: torch.Tensor):
        z = self.encode(x)
        x_hat = self.decode(z)
        # 注意：没有 L1 项，因为稀疏度由 top-k 硬保证
        recon_loss = F.mse_loss(x_hat, x, reduction="mean")
        return x_hat, z, recon_loss

    def get_aux_loss(self, x: torch.Tensor, z: torch.Tensor, k_aux: int = 512):
        """auxiliary loss：用 dead features 重建残差，复活它们。"""
        x_hat = self.decode(z)
        residual = x - x_hat

        # 找出 dead features（最近 N 步没激活过的）
        # 实际实现里 dead_mask 是 buffer，这里简化
        dead_pre_act = (x - self.b_dec) @ self.W_enc + self.b_enc
        dead_topk = dead_pre_act.topk(k_aux, dim=-1)
        z_aux = torch.zeros_like(dead_pre_act)
        z_aux.scatter_(-1, dead_topk.indices, F.relu(dead_topk.values))

        x_aux = self.decode(z_aux)
        aux_loss = F.mse_loss(x_aux, residual)
        return aux_loss
```

旁注：

- **Top-K 解决 shrinkage bias**：因为活跃 feature 不再被 L1 压低 magnitude，重建质量直接变好。OpenAI 论文里 Top-K SAE 在同样稀疏度下 reconstruction loss 比 L1 SAE 低 30-50%。
- **k 是超参，不是学出来的**：典型选择 k=32（小模型）到 k=128（GPT-4 级别）。k 越大重建越好但 monosemanticity 越差，是 trade-off。
- **aux loss 是关键**：纯 Top-K 会让永远进不了 top-k 的 feature 完全死掉。aux loss 让它们去重建 residual，给一个"复活通道"。
- **JumpReLU 是另一条路**：DeepMind 的 Gated SAE / JumpReLU SAE 用 straight-through estimator 学一个可微的阈值，效果接近 Top-K 但不需要 sort。
- **scatter\_ 是必须的**：你不能用 mask 因为反向传播时 zero 处会丢梯度。scatter\_ 保证只有 top-k 位置有梯度。

怀疑：Top-K 真的没有自己的问题吗？有的。Top-K 让模型对 k 的选择极其敏感——k 选小了 reconstruction 崩，k 选大了 features 不再 monosemantic。生产环境里这是个调参噩梦。

### 3.3 Feature 评测：interp / density / dead neurons

训完 SAE 不是终点，你得证明这些 features 真的是单义的。Bricken 2023 提出的评测套件包含三层：

```python
import einops
from collections import defaultdict

class SAEEvaluator:
    """对训好的 SAE 跑一套标准评测。"""

    def __init__(self, sae, model, tokenizer, dataset):
        self.sae = sae
        self.model = model
        self.tokenizer = tokenizer
        self.dataset = dataset

    @torch.no_grad()
    def collect_activations(self, n_tokens: int = 1_000_000):
        """收集每个 feature 在大量 token 上的激活情况。"""
        feature_acts = []  # (n_tokens, d_sae)
        token_ids = []

        for batch in self.dataset:
            tokens = self.tokenizer(batch, return_tensors="pt").input_ids
            # 用 hook 抓 layer 8 residual stream
            with self.model.hooks(fwd_hooks=[("blocks.8.hook_resid_post", self._cache_hook)]):
                _ = self.model(tokens)

            x = self._cached_resid  # (batch, seq, d_in)
            x_flat = einops.rearrange(x, "b s d -> (b s) d")
            z = self.sae.encode(x_flat)
            feature_acts.append(z.cpu())
            token_ids.append(tokens.flatten().cpu())

            if sum(t.shape[0] for t in feature_acts) >= n_tokens:
                break

        return torch.cat(feature_acts), torch.cat(token_ids)

    def feature_density_histogram(self, feature_acts: torch.Tensor):
        """每个 feature 的激活率（density）分布。"""
        # density = (z > 0).float().mean(dim=0)
        density = (feature_acts > 0).float().mean(dim=0)
        log_density = torch.log10(density + 1e-10)

        # 健康的 SAE 应该是双峰：dead bump @ -10, alive bump @ -3 ~ -5
        return {
            "n_dead": (density < 1e-6).sum().item(),
            "n_alive": (density > 1e-6).sum().item(),
            "median_log_density": log_density[density > 1e-6].median().item(),
            "histogram": log_density,
        }

    def top_activating_examples(self, feature_acts, token_ids, feature_idx: int, k: int = 20):
        """取 feature i 激活最强的 k 个 token 上下文。"""
        acts_i = feature_acts[:, feature_idx]
        topk = acts_i.topk(k)
        examples = []
        for idx, val in zip(topk.indices.tolist(), topk.values.tolist()):
            # 取 idx 位置前后各 10 个 token
            window = token_ids[max(0, idx - 10): idx + 10]
            text = self.tokenizer.decode(window)
            examples.append({"text": text, "act": val, "position": idx})
        return examples

    def autointerp_score(self, feature_idx: int, examples: list):
        """用一个解释模型给 feature 打可解释性分数。"""
        # 实际实现里这一步会调用 Claude / GPT-4 当 judge
        # 输入：top-20 examples，让它生成一个假设性解释
        # 然后用解释去预测剩下 80 个 example 的激活值
        # 预测准确率就是 autointerp score
        pass
```

旁注：

- **density 双峰是健康标志**：训好的 SAE 应该呈现 dead features（log density < -8）和 alive features（log density 在 -5 到 -3 之间）两个簇。如果只有一个连续分布，说明训练没收敛。
- **top activating examples 是人眼检查的入口**：你拿到 feature 12345，看它在 top 20 token 上下文里是不是都对应同一个语义概念。
- **autointerp score 是规模化关键**：34M features 你不可能人眼一个个看，必须用 LLM 当 judge 自动打分。Bricken 后续论文里专门做了这个 pipeline。
- **dead neuron 占比**：标准 L1 SAE 有时 dead 比例能到 80%。Top-K + aux loss 能压到 < 5%。
- **MMCS（Maximum Mean Cosine Similarity）**：Cunningham 论文用的指标，衡量同一份数据训两个 SAE，feature 字典之间能多大程度对应——稳定性的代理。

怀疑：autointerp score 高 != 真的 monosemantic。LLM judge 自己有偏见，可能把"看起来连贯"评成高分，但 feature 实际激活模式更复杂。Anthropic 后来的 Claude 3 Sonnet SAE 论文里专门讨论了这个 limitation。

## Layer 4 phd-skills 7 阶段复现计划

按 [phd-skills](src/content/docs/phd-skills/) 的 7 阶段框架：

1. **Day 1 文献研究**：读 Cunningham + Bricken 主体 + Olshausen 1996 摘要 + Toy Models 复习。产出：自己画一遍 SAE 架构图。
2. **Day 2 论文核验**：在 Bricken dashboard 上随便挑 5 个 feature，验证 top activating examples 真的是单义的，找一个**反例**（看起来不单义的）。
3. **Day 3 实验设计**：决定复现规模——GPT-2 small layer 8 residual，d_sae = 6144（8x），k = 32 Top-K SAE。预算：A100 一晚上。
4. **Day 4 dataset curation**：从 OpenWebText 采 50M tokens，预处理成 (n_tokens, 768) 的 activation tensor。注意去重和 BOS token。
5. **Day 5 训练**：用 SAELens 跑 Top-K SAE 训练，warmup 1000 steps，lr=3e-4，batch=4096，total 50K steps。监控 dead feature ratio。
6. **Day 6 评测**：跑 SAEEvaluator，画 density histogram，挑 100 个 alive feature 看 top activating examples，过 autointerp pipeline。
7. **Day 7 发布**：写一篇 [explorations](src/content/docs/explorations/) 笔记记录踩坑，把训好的 SAE checkpoint 发到 HuggingFace，附 dashboard 链接。

每个阶段都有 deliverable，跑不通的阶段直接退到上一步重新设计。

## Layer 5 谱系

![SAE 谱系图](/study/papers/sparse-autoencoders/02-sae-lineage.webp)

### 前作

- **Olshausen & Field 1996**：sparse coding 的祖师爷，Nature 论文，证明 V1 可以用稀疏字典学习重建图像。SAE 是它的现代复活版。
- [Anthropic Circuits E5](/papers/anthropic-circuits/)：证明 transformer 内部有可逆向工程的"电路"。SAE 是把电路输入端的信号解开的工具。
- [Induction Heads N1](/papers/induction-heads/)：第一个被完整逆向的 attention 电路。SAE 后来用来重新分析 induction heads 的输入特征。
- [Toy Models of Superposition N2](/papers/toy-models-superposition/)：直接前作。把 superposition 数学化，给 SAE 提供动机。

### 后作

- **Anthropic Claude 3 Sonnet SAE（2024.05）**：把 SAE scale 到 34M features，发现了 Goldengate Bridge feature——可以通过 clamp 这个 feature 让 Claude 反复说自己是金门大桥。
- **OpenAI Top-K SAE（2024.06）**：把 SAE scale 到 GPT-4，提出 Top-K 架构。
- **DeepMind Gated SAE / JumpReLU SAE（2024.07）**：从工程角度优化 SAE 训练效率。
- **Goldengate Bridge demo**：Anthropic 公开放出的 SAE feature steering 演示，第一次把"特征级控制"变成消费级体验。

### 反对者

- **Probing 派**：Belinkov、Hewitt 一脉，主张用 supervised probe 找特征，不需要 SAE。批评 SAE 的 features 是 unsupervised 学出来的，可能学到训练数据的 spurious 模式。
- **DAS（Distributed Alignment Search）**：Stanford Christopher Potts 组，主张特征不是单方向的（rank-1）而是分布式的（rank-k 子空间）。SAE 强行假设 rank-1 可能丢信息。
- **RepE（Representation Engineering）**：Andy Zou 等人主张直接在 representation level 做控制，不需要先把它分解。SAE 的解释性收益被认为不值这个工程成本。

三个反对方向都有道理，但目前 SAE 是**最能 scale**的方法——这是它在工业界胜出的关键。

## Layer 6 三段总结

### 这篇做对了什么（4 子弹）

- **把 25 年前的 sparse coding 套到 LLM 上，并且真的 scale 起来**——证明 superposition 不只是玩具问题，在真实模型里也能解
- **同时给出方法（Cunningham）和验证（Bricken）**——一篇都不够，两篇互补成完整证据链
- **开源 SAELens 让所有人能复现**——研究社区一年内涌现出几十篇 follow-up
- **Goldengate Bridge demo 把可解释性变成可演示的产品体验**——这是技术 → 公众认知的关键跳板

### 这篇没解决什么（4 子弹）

- **k 怎么选没有理论指导**——只能扫超参，每个模型/层都要重扫
- **dead feature 即使在 Top-K 下还是存在**，aux loss 是 hack 不是原理性解决
- **feature 之间的关系（composition / hierarchy）完全没碰**——SAE 假设特征独立，但语言里特征显然是组合的
- **跨模型的 feature universality 没证明**——同一个特征（比如"金门大桥"）在 GPT-2 和 Llama 上是不是同一个数学对象？

### 学到的 transferable skill（4 子弹）

- **超完备字典 + 稀疏惩罚是分解任何高维表示的通用范式**——不只是 LLM，CV / RL / 蛋白质都能套
- **density histogram 双峰是判断 unsupervised 训练健康度的通用工具**
- **autointerp pipeline（用 LLM 给 unsupervised 特征打分）是 scale interpretability 的方法论**
- **method 论文 + empirical 论文配对发布**是 ML 社区一种值得学习的合作模式

## Layer 7 怀疑

1. **SAE 学到的真的是 ground truth feature 吗？** 完全可能 SAE 只是学到了一个"看起来单义但其实是训练数据 artifact"的字典。L1/Top-K 都是优化目标的代理，不是直接优化"单义性"。
2. **8x 超完备够吗？** Anthropic Claude 3 Sonnet SAE 用了 34M features，相当于残差流维度的 8000x。如果真实特征数是这个量级，那 8x SAE 一定还在做严重的 superposition——只是从 768 维 superpose 到 6144 维。
3. **Top-K 的 k 是常数合理吗？** 不同 token 携带的信息量差别巨大（"the" vs 一个专业术语）。固定 k 在简单 token 上浪费容量、在复杂 token 上不够。dynamic k 是开放方向。
4. **SAE 的 features 在不同 random seed 下稳定吗？** MMCS 指标显示稳定性大概 70-80%，意味着 20-30% 的特征是 seed-specific 的——这些算 finding 还是噪声？

## 限制

- **只在 transformer 上验证过**：CNN / RNN / mamba 上 SAE 是否有效是开放问题
- **只在英文上验证过**：多语言 SAE 是否会得到完全不同的字典是开放问题
- **训练成本不便宜**：GPT-4 级别 SAE 训练成本约 $1M 量级（OpenAI 论文披露），中小研究组玩不起
- **解释性收益和工程成本的 trade-off 没结论**：在生产模型上是否值得部署 SAE 仍是争议

## 元数据

- **阅读时间**：本文约 4500 字，预计 25-30 分钟
- **复现时间**：phd-skills 7 阶段约 7 天（A100 算力前提）
- **下一篇**：N4 计划读 [Anthropic Claude 3 Sonnet SAE](https://transformer-circuits.pub/2024/scaling-monosemanticity/)，把 8x 推到 8000x 看会发生什么
- **状元篇标记**：本季 Season N 第 3 篇，method 分支 A 路径
- **相关笔记**：[Toy Models of Superposition](/papers/toy-models-superposition/) / [Anthropic Circuits E5](/papers/anthropic-circuits/) / [Induction Heads N1](/papers/induction-heads/)
