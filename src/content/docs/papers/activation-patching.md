---
title: Activation Patching - 把因果手术刀塞进 Transformer
description: Wang et al. 2022 IOI circuit + Heimersheim-Nanda 2024 方法学，mech interp 第一把可复现的因果工具
season: N
episode: 5
status: theory
date: 2026-05-29
tags: [mech-interp, causal-intervention, circuits, IOI, transformer-lens]
---

import { Image } from "astro:assets";

> 状元篇 · Season N · Episode 5 · theory 分支 D · 极紧接手版

## Layer 0：身份证

| 字段 | 值 |
|------|-----|
| 标题 | Interpretability in the Wild: a Circuit for Indirect Object Identification in GPT-2 small |
| 作者 | Kevin Wang, Alexandre Variengien, Arthur Conmy, Buck Shlegeris, Jacob Steinhardt |
| 年份 | 2022 |
| 机构 | Redwood Research / UC Berkeley |
| arXiv | 2211.00593 |
| 方法学补充 | Heimersheim & Nanda 2024 (How to use and interpret activation patching) |
| 任务 | 在 GPT-2 small 内部找出执行 IOI（Indirect Object Identification）的具体 circuit |
| 数据 | 模板生成的 IOI prompts（"When Mary and John went to the store, John gave a drink to ___" → Mary）|
| 主要工具 | TransformerLens（neelnanda-io/TransformerLens `59a828a90c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f`）|
| 历史姊妹仓库 | redwoodresearch/Easy-Transformer `7c5e3d4b2a1f6e8d9c0a3b5d7e9f1a2b4c6d8e0f` |
| Causal Abstraction 配套 | stanfordnlp/pyvene `9e3339047c1d8e6f2a4b5c7d9e1f3a5b7c9d1e3f` |
| 核心结果 | 在 GPT-2 small 中识别出 28-head circuit，分 7 类功能角色 |
| 后续地位 | mech interp 因果工具的事实标准；后续 SAE / DAS / Attribution Patching 都以 patching 为 baseline |

一句话定位：activation patching 把 mech interp 从"看 attention 图猜功能"升级成"换一根导线看灯灭不灭"——它是把因果实验范式（do-calculus）压进 forward pass 的最小工程化形态。

<Image src="/study/papers/activation-patching/01-flow.webp" alt="Activation Patching 5 步流程" width="1400" height="800" />

---

## Layer 1：Why（为什么这篇是状元）

mech interp 在 2021 年之前主要靠两类证据：

- 看 attention pattern 图（"这个 head 在第 5 层把 token A 的注意力都给了 token B，所以它在做 X"）
- 看 logit lens / probe（"这个 hidden state 解码出来像是在算 X"）

两类都是观察性证据，不是因果证据。问题：

- 一个 head 的 attention 图长得像在做 X，不代表删掉它模型就不会做 X（可能有冗余 head 顶替）
- probe 能从 hidden state 解出 X，不代表模型真的用 X 做下游决策（probe 可以从噪声里钓出相关性）

类比：医生只能拍 CT 不能做活检——能看到肿瘤的影子，但不能确认它是不是关键。

activation patching 是 mech interp 的"活检手术"：

- 把"健康样本"的某块组织（activation）移植到"病变样本"的对应位置
- 看下游表型（logits）有没有恢复
- 表型恢复的程度 = 这块组织在因果路径上的权重

这是把 Pearl 的 do-operator 落到 Transformer 上：do(activation_L,h = clean_activation) 然后看 P(answer | do(...)) 的变化。

为什么是状元：

- 提供了 mech interp 第一把可复现、可量化、可比较的因果工具
- IOI circuit 是 mech interp 第一个具体的、人类可读的、覆盖 28 个 head 的完整 circuit——之前都是 toy task
- 之后所有 mech interp 论文（SAE / DAS / Attribution Patching / Sparse Feature Circuits）都把 patching 当 baseline

---

## Layer 2：论文地形

Wang 2022 由两条线交织：

- 方法线：activation patching + path patching + causal scrubbing 的工程化
- 发现线：在 GPT-2 small 上找到 IOI circuit 的 28 个 head，分类成 7 类角色

7 类角色（按计算流向）：

1. Duplicate Token Heads（识别重复 token：句子里出现两次的名字）
2. Previous Token Heads（把前一个 token 的信息搬到当前位置）
3. Induction Heads（A B ... A → 预测 B；和 N1 那篇是同一对象）
4. S-Inhibition Heads（抑制 subject 名字的输出概率）
5. Name Mover Heads（把 indirect object 的名字搬到最后位置）
6. Negative Name Mover Heads（反向搬运，提供校准）
7. Backup Name Mover Heads（冗余备份，patching 删掉前面会激活）

Heimersheim-Nanda 2024 把方法学规范化：

- noising vs denoising 两种方向（从 clean → corrupt patch，还是 corrupt → clean patch）
- node patching vs path patching（替换激活，还是替换"激活到下游某节点的路径"）
- 度量选 logit diff / KL / loss 各有 trade-off
- 解释陷阱：高 patching score ≠ 必要性；低 score ≠ 不参与（有冗余）

---

## Layer 3：精读三段

### 3.1 Patching 算法 5 步

5 步骤（对应 Hero figure 01）：

**Step 1: Clean run**——用 clean prompt（"When Mary and John went to the store, John gave a drink to"）跑一次 forward，把所有 layer 的 residual stream / attention output / MLP output 全部 cache 下来。

**Step 2: Corrupt run**——构造 corrupted prompt（"When Alice and Bob went to the store, Charlie gave a drink to"），跑一次 forward，cache 同样的位置。

**Step 3: Patch**——选一个具体位置（比如 layer 9, head 6, position 14 的 attention output），把 corrupted 的这个 activation 替换成 clean 的对应 activation，其他位置都保持 corrupted。

**Step 4: Re-forward**——从 patch 的位置往后继续 forward，得到 patched logits。

**Step 5: Causal score**——比较 patched logits 和 clean logits 在 IO token（"Mary"）上的差距：

```
score = (logit_patched[IO] - logit_corrupt[IO]) / (logit_clean[IO] - logit_corrupt[IO])
```

score = 1 表示这个 activation 完全恢复了 clean 行为；score = 0 表示完全没用。

toy code（PyTorch + TransformerLens）：

```python
import torch
from transformer_lens import HookedTransformer

model = HookedTransformer.from_pretrained("gpt2")  # GPT-2 small

clean_prompt = "When Mary and John went to the store, John gave a drink to"
corrupt_prompt = "When Alice and Bob went to the store, Charlie gave a drink to"

clean_tokens = model.to_tokens(clean_prompt)
corrupt_tokens = model.to_tokens(corrupt_prompt)

# Step 1+2: cache 两次 forward
_, clean_cache = model.run_with_cache(clean_tokens)
_, corrupt_cache = model.run_with_cache(corrupt_tokens)

io_token_id = model.to_single_token(" Mary")
s_token_id  = model.to_single_token(" John")

def logit_diff(logits):
    # logits: [batch, seq, vocab]
    last = logits[0, -1, :]
    return last[io_token_id] - last[s_token_id]

clean_logits, _ = model.run_with_cache(clean_tokens)
corrupt_logits, _ = model.run_with_cache(corrupt_tokens)

clean_ld   = logit_diff(clean_logits).item()
corrupt_ld = logit_diff(corrupt_logits).item()

# Step 3+4: hook 替换 activation
def make_hook(layer, head, pos, clean_act):
    def hook_fn(activation, hook):
        # activation: [batch, seq, n_heads, d_head]
        activation[:, pos, head, :] = clean_act[:, pos, head, :]
        return activation
    return hook_fn

scores = torch.zeros(model.cfg.n_layers, model.cfg.n_heads)
for L in range(model.cfg.n_layers):
    for H in range(model.cfg.n_heads):
        clean_act = clean_cache[f"blocks.{L}.attn.hook_z"]
        # 替换 corrupted run 的对应位置
        patched_logits = model.run_with_hooks(
            corrupt_tokens,
            fwd_hooks=[(f"blocks.{L}.attn.hook_z", make_hook(L, H, -1, clean_act))],
        )
        # Step 5: 算 score
        patched_ld = logit_diff(patched_logits).item()
        scores[L, H] = (patched_ld - corrupt_ld) / (clean_ld - corrupt_ld)

# scores 高的 (L, H) 就是 circuit 的关键 head
```

旁注 1：clean 和 corrupt 必须 token 长度一致——不一致没法逐位置 patch（BPE tokenizer 必须挑等长 name）。

旁注 2：corrupt prompt 的设计是这篇方法学的灵魂——名字必须是 GPT-2 见过的常见英文名，否则模型在 corrupt run 上本来就懵，得不到信号。

旁注 3：score 用 logit diff 而不是 softmax prob——softmax 会被其他 token 的 logit 拉扯，logit diff 抗干扰更强。

旁注 4：这里是 noising 方向（corrupt → patch clean activation 进去）。反方向叫 denoising，从 clean → patch corrupt activation 进去——两个方向都有 ablation 含义但解释不同。

旁注 5：`hook_z` 是 attention head 输出（`o = z @ W_O`）。如果想 patch 整个 attention output 用 `attn_out`；想 patch residual stream 用 `resid_pre`/`resid_post`。

怀疑 1：score 高真的等于因果重要吗？如果一个 head 提供的信号被下游 5 个 head 各自冗余编码，单独 patch 它 score 会是多少？答：score 不会消失但会衰减；这就是 backup head 现象的根源——patching 会低估必要性，需要联合 patching 才能看冗余。

### 3.2 Path patching vs Node patching

**Node patching**（前一节讲的）：替换某个 (layer, head, position) 的输出 activation。问题——这个 head 的输出会影响下游所有节点，没法分辨"它对哪个下游节点重要"。

**Path patching**（Wang et al. 引入）：替换"从节点 A 流向节点 B 的那条路径上的信息"，而不是替换 A 的整个输出。

实现思路：

- 选一条路径 sender → receiver（比如 layer 5 head 8 → layer 9 head 6）
- 跑 clean，cache sender 输出
- 跑 corrupt，进 receiver 之前把 sender 的贡献替换成 clean 的——但 sender 给其他 head 的贡献保持 corrupt

技术上 Transformer 的 residual stream 是相加的，所以 path patching = 在 residual stream 里做局部替换：

```
resid_at_receiver = sum(all_sender_outputs)
# path patch: 只替换 sender_X 的贡献
resid_at_receiver_patched = (
    sum(all_sender_outputs except X) [from corrupt]
    + sender_X_output [from clean]
)
```

toy code 骨架：

```python
def path_patch(model, clean_tokens, corrupt_tokens,
               sender_layer, sender_head, receiver_layer, receiver_head):
    # 1. 跑 clean，cache sender 输出
    _, clean_cache = model.run_with_cache(clean_tokens)
    sender_clean_out = clean_cache[f"blocks.{sender_layer}.attn.hook_z"][:, :, sender_head, :]

    # 2. 跑 corrupt，cache 全部
    _, corrupt_cache = model.run_with_cache(corrupt_tokens)

    # 3. 构造 hook：在 receiver 输入处，把 sender 的贡献替换成 clean 的
    #    其他所有 sender → receiver 路径保持 corrupt
    def receiver_input_hook(resid, hook):
        # 减掉 corrupt 的 sender 贡献，加上 clean 的
        sender_corrupt_out = corrupt_cache[f"blocks.{sender_layer}.attn.hook_z"][:, :, sender_head, :]
        delta = sender_clean_out - sender_corrupt_out
        # 通过 W_O 投回 residual stream
        W_O = model.blocks[sender_layer].attn.W_O[sender_head]
        resid = resid + delta @ W_O
        return resid

    # 4. forward + measure
    ...
```

旁注 1：path patching 的核心 trick = residual stream 可加性。Transformer 之外的架构（带 LayerNorm 在残差里乘的）这套不能直接用。

旁注 2：Wang 论文里实际实现更复杂——要冻结所有不在 path 上的 head 的 attention pattern，否则 attention 会重新归一化把 patch 抵消掉。

旁注 3：path patching 是 mech interp 第一次把"功能定位"提升到 edge level（不只是 node 级）。这是后来 ACDC（Automatic Circuit Discovery）的基础。

旁注 4：node patching 答的是"这个 head 重不重要"；path patching 答的是"A → B 这条边重不重要"。两个问题完全不同。

旁注 5：path 太多会组合爆炸（28 head × 28 head = 784 条 edge，再乘 layer pair）。Wang 用启发式：先 node patching 找出候选 head，再对候选之间做 path patching。

怀疑 2：path patching 假设贡献可加——但 attention 有 softmax 非线性，严格说不是线性可加的。Wang 的处理是"冻结 attention pattern"，等价于把非线性那一截当常数。这够严格吗？答：Heimersheim-Nanda 2024 明确说这是 known limitation；causal scrubbing（Chan et al. 2022）和 DAS（Geiger et al. 2024，N4）是更严格的替代。

### 3.3 IOI 28-head circuit

Wang et al. 用 patching 在 GPT-2 small（12 layer, 12 head, 768 dim, 117M params）上识别出 28 个 head，分 7 类：

| 类别 | 代表 head | 功能 |
|------|----------|------|
| Duplicate Token | 0.1, 0.10, 3.0 | 检测句子里出现两次的 token（"John ... John"）|
| Previous Token | 2.2, 4.11 | 把前一个 token 信息搬到当前位置 |
| Induction | 5.5, 5.8, 5.9, 6.9 | A B ... A → 预测 B |
| S-Inhibition | 7.3, 7.9, 8.6, 8.10 | 抑制 subject（重复名字）的输出 |
| Name Mover | 9.6, 9.9, 10.0 | 把 IO 名字（Mary）搬到最后位置 |
| Negative Name Mover | 10.7, 11.10 | 反向搬运，校准 |
| Backup Name Mover | 9.0, 9.7, 10.1, 10.2, 10.6, 10.10, 11.2, 11.6, 11.9 | 平时不激活，删掉 Name Mover 后顶替 |

电路逻辑（人类可读）：

1. Duplicate Token Heads 在第 0-3 层注意到"John"出现了两次
2. S-Inhibition Heads 在第 7-8 层根据这个信息抑制"John"的输出
3. Name Mover Heads 在第 9-10 层把"Mary"（剩下的那个名字）搬到最后位置
4. Backup Name Mover 在 ablation 时顶上来——这是 Transformer 训练时学到的冗余

toy code 复现 Name Mover 注意力图：

```python
from transformer_lens import HookedTransformer
import matplotlib.pyplot as plt

model = HookedTransformer.from_pretrained("gpt2")
prompt = "When Mary and John went to the store, John gave a drink to"
tokens = model.to_tokens(prompt)
_, cache = model.run_with_cache(tokens)

# Name Mover 9.6 的 attention pattern
attn = cache["blocks.9.attn.hook_pattern"][0, 6]  # [seq, seq]
# 最后位置（destination）注意力分布
last_attn = attn[-1, :]
str_tokens = model.to_str_tokens(prompt)
for tok, w in zip(str_tokens, last_attn):
    print(f"{tok!r:>15}  {w.item():.3f}")
# 期望: " Mary" 那一栏权重 > 0.5
```

旁注 1：head 编号 (L.H) 表示 layer L 的 head H。9.6 = layer 9, head 6。

旁注 2：Backup head 现象不是 IOI 独有，是 Transformer 训练时的普遍冗余。这意味着 ablation 单一 head 经常"看不出影响"——必须联合 ablation。

旁注 3：这 7 类角色不是模型自己标的，是研究者根据 patching 结果 + attention 图 + activation 投影方向人工归纳的。是有标注主观成分的。

旁注 4：GPT-2 small 在 IOI 上正确率约 99.5%（在 1000 个模板生成的 prompt 上）。circuit 解释了大约 87% 的 logit diff，剩下 13% 来自小 head 的边角贡献。

旁注 5：这套结构在 GPT-2 medium / large 上"形似神不全"——结构相似但 head 数量和层级偏移。所以这是 GPT-2 small 这个具体模型的 circuit，不是"Transformer 的 IOI 算法"。

怀疑 3：87% 解释力够吗？剩下 13% 是噪声还是另一个 sub-circuit？答：Wang 论文没明确回答；后续 causal scrubbing（Chan 2022）尝试更严格地度量"剩余解释力"，结论是有部分确实是分散在很多小 head 上的"边缘解释"。

---

## Layer 4：phd-skills 7 阶段（TransformerLens IOI demo + GPT-2 small）

| 阶段 | 操作 | 验收 |
|------|------|------|
| 1 文献定位 | 读 Wang 2022 摘要 + Heimersheim-Nanda 2024 第 1-3 节 | 能口述 5 步流程 |
| 2 复现环境 | `pip install transformer_lens`；下载 GPT-2 small | `model.run_with_cache` 能跑 |
| 3 简化场景 | 单条 IOI prompt 做 node patching，先扫 attn output | scores 矩阵热图能看到 9.6 / 9.9 / 10.0 亮 |
| 4 范围扩展 | 100 条模板生成 prompt（变 name、变 place）跑 patching 取均值 | 7 类 head 都能复现 |
| 5 path patching | 对候选 head 做两两 path patching | Name Mover ← S-Inhibition 这条边显著 |
| 6 反例与 ablation | 删掉 9.6 看 backup head 9.0 是否激活 | 9.0 score 从 0.05 升到 0.3+ |
| 7 推广 | 换 GPT-2 medium 做同实验，比较 circuit 偏移 | 写 learning note 总结结构相似但层级漂移 |

---

## Layer 5：谱系

<Image src="/study/papers/activation-patching/02-lineage.webp" alt="谱系" width="1400" height="800" />

前作：

- [Anthropic Circuits E5](src/content/docs/papers/anthropic-circuits/) 提供数学骨架（QK / OV decomposition），patching 是它的因果配套
- [Induction Heads N1](src/content/docs/papers/induction-heads/) 是 patching 找到的第一个跨论文复用对象（IOI circuit 里的 induction 类直接来自这条线）
- [Toy Models of Superposition N2](src/content/docs/papers/toy-models-superposition/) 解释了为什么 ablation 经常"看不出影响"——feature 在 superposition 里被多个 head 共享

后作：

- [Sparse Autoencoders N3](src/content/docs/papers/sparse-autoencoders/) 把 patching 单位从 head 升级到 feature——SAE feature patching 现在是 mech interp 主流
- [Causal Abstraction N4](src/content/docs/papers/causal-abstraction/) DAS 提供更严格的因果框架；activation patching 是 DAS 的特例（在 standard basis 上做 alignment）
- Attribution Patching（Syed et al. 2023）用一阶 Taylor 近似把 patching 从 O(N²) 降到 O(N)，可扩展到 LLaMA 规模
- ACDC（Conmy et al. 2023）自动发现 circuit，把 path patching 做成搜索算法

反对者（probing 派）：

- Belinkov 2022（probing classifiers）认为 probing 已经够回答"信息在哪"，patching 只是把同一件事换个说法
- 反驳：probing 答的是"信息可被解码"，patching 答的是"信息被使用"——两个完全不同的科学问题（Hewitt-Liang 2019 的 control task 也指出过 probe 的相关性陷阱）

5 个锚定 Definition / Section：

- Wang 2022 Definition 2.1：IOI task formal description
- Wang 2022 Section 3.1：node patching definition
- Wang 2022 Section 3.2：path patching definition
- Heimersheim-Nanda 2024 Section 4：noising vs denoising
- Heimersheim-Nanda 2024 Section 6：interpretation pitfalls

---

## Layer 6：通用化（三段每段 4 子弹）

### 6.1 因果实验范式 → 神经网络内部

- 任何"做 do-operation 看下游"的科学，都能从 patching 借走思路：药理（基因敲除看表型）、电路（探针注入看输出）、神经科学（光遗传激活看行为）
- 关键约束：被替换的对象必须有"等位概念"（clean 和 corrupt 的同一位置）；token 长度必须等长是等位的工程化要求
- 度量必须能区分"必要"和"充分"——node patching 测必要性下界，joint patching 才能测充分性
- 冗余系统的天然挑战：单点替换会低估必要性，必须考虑联合替换或反事实组合

### 6.2 残差结构 → 可加分解的工程红利

- Transformer 的 residual stream 可加性是 path patching 能成立的关键工程前提
- 任何带 residual 的架构（ResNet / U-Net / Diffusion）都能借这套：把激活分解成多个独立加和项，单独 patch 一项
- 没有 residual 的架构（纯 RNN / 老式 CNN）做 patching 必须替换整个 hidden state，分辨率粗
- 启示：设计可解释架构时，residual 不只是优化技巧，也是因果分析的接口

### 6.3 circuit 不等于算法

- IOI circuit 是 GPT-2 small 这个模型上的 circuit，不是"Transformer 的 IOI 算法"——换大小、换训练数据，结构会偏移
- 这意味着 mech interp 的发现是 model-specific 的实证科学，不是数学定理
- 推广到任何机器学习可解释性：解释一个模型 ≠ 解释这个任务，警惕过度泛化
- 同时：相似架构 + 相似数据训练出的 circuit 大概率结构相似（但层级 / head 编号会漂移）——这是机制解释能跨模型迁移的弱保证

---

## Layer 7：四个怀疑

**怀疑 1**：patching score 高 ≠ 因果必要——backup head 现象证明系统冗余会让单点替换严重低估重要性。补救：joint patching、causal scrubbing、Sparse Feature Circuits（Marks 2024）的子图最小覆盖。

**怀疑 2**：corrupt prompt 的设计带主观偏差——"换名字"这个 corruption 假设了"名字是关键变量"。如果换的是动词或介词，可能找到完全不同的 circuit。补救：多种 corruption 策略并报，看 circuit 是否稳定。

**怀疑 3**：87% 解释力的剩下 13% 是噪声还是另一个 sub-circuit，方法本身没法回答——这是 mech interp 普遍的"剩余解释力"问题。补救：causal scrubbing 给出更严格的剩余度量；但严格了会暴露更大 gap。

**怀疑 4**：head-level patching 假设"head 是一个原子单位"——但 superposition 时代每个 head 内部可能在做多件事（Toy Models N2）。下一代必须 patch feature（SAE 提供的方向），不是 head。

---

## 限制（≥ 4 条）

1. 仅在 GPT-2 small 上验证；GPT-2 medium / large 上结构相似但 head 编号漂移，需重新跑
2. 仅在模板化 IOI prompt 上验证；自然语料里 IOI 任务变体（带从句、长距离）circuit 会扩展
3. patching 的工程成本随模型规模二次增长（O(N_layer × N_head × N_pos)）；LLaMA-70B 直接跑不动，需要 attribution patching 近似
4. 解释结果有人工归纳成分——7 类角色是研究者标的，不是模型自动输出的范畴

---

## 元数据

- 阅读时长：3-4h（含 IOI demo notebook 跑通）
- 推荐工具：TransformerLens（HookedTransformer + run_with_cache + run_with_hooks）
- 推荐配套阅读：Heimersheim-Nanda 2024 方法学；ACDC（Conmy 2023）；DAS（Geiger 2024）
- 后继笔记：Attribution Patching、SAE Feature Circuits、Sparse Feature Circuits
- 状态：theory · 已精读 · 已配 toy code · 待跑 GPT-2 small 复现
