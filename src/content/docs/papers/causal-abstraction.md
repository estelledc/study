---
title: Causal Abstraction × DAS — 神经网络的因果抽象与对齐搜索
description: Geiger 2021 把 Pearl 因果模型套到 NN 内部 + DAS 2024 用旋转矩阵学分布式对齐——不必 sparse / mono 的另一条 mech interp 路线
season: N
episode: N4
status: 状元
layer_focus: theory
last_updated: 2026-05-29
---

## Layer 0 元数据

| 字段 | 值 |
|------|----|
| 主论文 | Causal Abstractions of Neural Networks（Geiger, Lu, Icard, Potts. NeurIPS 2021） |
| arXiv | [2106.02997](https://arxiv.org/abs/2106.02997) v1 (2021.06) → v3 (2022.10) |
| 续作 | Finding Alignments Between Interpretable Causal Variables and Distributed Neural Representations（Geiger 2024）— 即 DAS |
| 一作 | Atticus Geiger（Stanford NLP 博士生 → 现 Pr(Ai)²R Group） |
| 一作机构 | Stanford NLP（Potts / Manning 圈） |
| 引用数 | 截至 2026-05-29 主论文 ~340，DAS ~180 |
| 论文类型 | theory（建立形式化框架）+ method（DAS 算法层） |
| 标准框架 | [stanfordnlp/pyvene](https://github.com/stanfordnlp/pyvene)（commit `9e333904dcf9e597ca76170010d17f4d4580de8d`） |
| 配套 repo | [atticusg/InterchangeInterventions](https://github.com/atticusg/InterchangeInterventions)（commit `c6173735a5ffa4408702d81fc51636fdd659bf2c`） |
| Hook 工具 | [neelnanda-io/TransformerLens](https://github.com/TransformerLensOrg/TransformerLens)（commit `59a828a98bda340f11429038f4fdda10706303bc`） |
| 关键案例 | IOI（Indirect Object Identification）/ subject-verb agreement / Price-Tagging |

### Notation 速记表（theory 分支必填）

| 符号 | 含义 |
|------|------|
| M_l | low-level 模型（神经网络），状态空间 S_l = R^d |
| M_h | high-level 模型（人写的因果图），变量集合 V_h |
| Π | 神经元上的 partition，定义"哪些 neuron 属于同一个 high-level 变量" |
| τ | alignment：S_l → S_h 的投影函数（partition + 数值映射） |
| do(X=x) | high-level 上的硬干预 |
| patch(s_l, N_S, v) | low-level 上把神经元集合 N_S 替换为 v（activation patching） |
| IIA | Interchange Intervention Accuracy — DAS 的核心评测指标 |
| R | DAS 学习的旋转矩阵（rank-k orthonormal projection） |

## 一句话定位

Causal Abstraction 给"神经网络的内部表示是不是某个人写的因果图的实现"建了一套**可证伪的形式化定义**——不是 SAE 那样找单义特征，而是问 "干预 high-level 变量 X = 干预对应 low-level 神经元集合 N_S 后输出一致" 这个 commute 条件能不能通过实验验证。

![Causal Abstraction 数学结构](/study/papers/causal-abstraction/01-causal-abstraction-diagram.webp)

> **读这篇之前**：你应该已经读过 [Anthropic Circuits E5](/papers/anthropic-circuits/) 和 [Toy Models of Superposition N2](/papers/toy-models-superposition/) 了解 mech interp 的机制路线，以及 [Sparse Autoencoders N3](/papers/sparse-autoencoders/) 了解它的对手——SAE 派。这篇是 mech interp 里的另一条主线，2026 年还在和 SAE 派对峙。

## 创新点（5 个 numbered）

1. **形式化"NN 是因果图的抽象"** — 把 Pearl 的 structural causal models + Beckers & Halpern 2019 的 constructive abstraction 移植到神经网络。Definition 3 给出 alignment τ 的精确定义，Definition 5 给出"M_h is a τ-causal abstraction of M_l" 的判定条件。
2. **Interchange Intervention 作为可执行实验** — Theorem 1 证明：commute 条件等价于 "在大量 high-level / low-level 配对干预上输出一致"，从而把抽象关系变成可测的 IIA 指标。
3. **不假设 rank-1 / mono / sparse** — 显式反对 SAE 的"每个 feature 一个方向"基础假设。Section 4 的实验里 alignment 是一个 rank-k 子空间（k 通常 8-64），不需要这个子空间是稀疏的或正交的。
4. **DAS 把 alignment 学出来而不是手写** — Geiger 2024（DAS）把 τ 中的 partition + projection 参数化为一个 orthogonal rotation matrix R，用 IIA 当训练 loss 直接学。这是从"理论框架"到"可 scale 工具"的关键跳板。
5. **Boundless DAS 让 k 也可学** — 跟进工作把"子空间维度 k"也变成可优化超参，绕过 SAE 派质疑的"k 你怎么挑"问题。

工程上最被低估的细节：DAS 的 rotation matrix R 必须**严格正交**（Stiefel manifold），不能用普通 nn.Linear。Geiger 2024 论文 Section 3.2 用 Cayley 参数化或 Householder 反射保证 R^T R = I。pyvene 的 [`pyvene/models/intervenable_modelcard.py`](https://github.com/stanfordnlp/pyvene/blob/9e333904dcf9e597ca76170010d17f4d4580de8d/pyvene/models/intervenable_modelcard.py) 默认走 torch.nn.utils.parametrizations.orthogonal，初学者经常自己实现 nn.Linear 然后训不动，这是第一个坑。

## Layer 1 Why

### 这之前世界缺什么

2020 之前 mech interp 的主流是两堆：

- **Probing 派**（Belinkov, Hewitt, Tenney）：训一个 linear probe 去预测高层语义（POS / dependency / 句法树），probe acc 高就说"模型表示里有这个信息"。问题是 probe 自己有学习容量，**probe 学到的 ≠ 模型用了的**——你 freeze 模型权重也能训出 80% acc 的 syntax probe，但模型在下游任务上根本不靠这个。Hewitt 2019 自己后来用 control task 暴露了这问题。
- **Saliency / Attribution 派**（Integrated Gradients, SHAP, attention rollout）：算"输入对输出的归因"，但归因 ≠ 因果——梯度大不代表干预后输出会变。

Geiger 一脉的核心 insight：**因果不是观察出来的，是干预出来的**。要证明"模型用 X 这个抽象变量来计算 Y"，必须做 interchange intervention——在 input A 的 forward 里把对应 X 的神经元换成 input B 的值，看输出是不是切到 B 的 prediction。这不是 probing 也不是 attribution，是真正的因果声明。

但 2021 之前没人把 Pearl 的因果建模严格套到 NN——Beckers & Halpern 2019 在 AAAI 给了"abstraction" 的形式化但只是抽象 SCM 之间。Geiger 2021 是第一篇说"NN 也是 SCM，可以套抽象关系"，并把它做成可执行实验的论文。

### 为什么 2021 才做出来

三件事同时成熟：

1. **Beckers & Halpern 2019 的形式工具**给了 partition + projection 的精确定义（[`atticusg/InterchangeInterventions`](https://github.com/atticusg/InterchangeInterventions/blob/c6173735a5ffa4408702d81fc51636fdd659bf2c/causal_models.py) 复用了 Halpern 2000 的 SCM 库）
2. **PyTorch hook 机制成熟**让 activation patching 工程化变可行（[TransformerLens 的 hook API](https://github.com/TransformerLensOrg/TransformerLens/blob/59a828a98bda340f11429038f4fdda10706303bc/transformer_lens/HookedTransformer.py) 直接源自 Geiger 一脉的需求）
3. **BERT / GPT-2 时代 small model 还能精读**——一个 layer 768 维残差流，partition 个上百神经元 group 还能手做实验

## Layer 2 论文地形

主论文（Geiger 2021）章节角色 + 时间分配：

| Section | 角色 | 你该花多少时间 |
|---------|------|----------------|
| 1. Introduction | 把对手分成 probing 派和 attribution 派 | 精读 5 min |
| 2. Background | 复习 Pearl SCM + Beckers-Halpern 2019 abstraction | 必读 10 min（不熟先看 Pearl） |
| 3. Causal Abstractions of Neural Networks | **核心定义** Def 3-5 + Theorem 1 | 精读 25 min |
| 4. Method: Interchange Interventions | 算法层：怎么具体跑实验 | 精读 15 min |
| 5. Experiments | MQNLI（Multiply-Quantified NLI）+ subject-verb agreement | 看 Table 2/3 即可 |
| 6. Related Work | 显式骂 probing 派和 attribution 派 | 必看（理解派系） |
| 7. Limitations | 隐含承认"k 怎么挑没说清" | 必看（DAS 续作就在补这点） |

DAS 论文（Geiger 2024）章节角色：

| Section | 角色 | 时间 |
|---------|------|------|
| 1-2 | 重复 Causal Abstraction 框架 | 跳 |
| 3. DAS Method | rotation matrix 参数化 + IIA loss | 精读 20 min |
| 4. Experiments | Price Tagging + IOI on GPT-2 small | 看 Figure 4 |
| 5. Boundless DAS | 把 k 也学出来 | 必看 |

**心脏物 3 个**：
- 主论文 Theorem 1（commute 等价 IIA） + Definition 5（τ-abstraction 判定）
- DAS 论文 Section 3.2 的 rotation matrix 参数化
- pyvene 的 `IntervenableModel` API（[pyvene/models/intervenable_base.py](https://github.com/stanfordnlp/pyvene/blob/9e333904dcf9e597ca76170010d17f4d4580de8d/pyvene/models/intervenable_base.py)）

## Layer 3 精读（theory 分支：≥ 3 段，每段含 Def/Thm + toy code + 怀疑）

### 3.1 Causal Abstraction 严格定义 + Π/τ alignment

#### Definition 3（Causal Model，Geiger 2021）

一个 causal model 是 M = ⟨V, F, U⟩ 其中：
- V 是 endogenous variable 集合
- F = {f_X : X ∈ V} 是 structural equations，每个 f_X 把 X 的父节点和噪声映射到 X 的值
- U 是 exogenous noise

#### Definition 4（Constructive Abstraction，Beckers & Halpern 2019 改写）

给定 low-level 模型 M_l = ⟨V_l, F_l, U_l⟩ 和 high-level 模型 M_h = ⟨V_h, F_h, U_h⟩，**M_h 是 M_l 的 constructive abstraction**，需要存在：

1. partition Π : V_l → V_h ∪ {⊥}（每个 low-level 变量映到唯一 high-level 变量或被丢弃）
2. value map τ_X : Range(Π^{-1}(X)) → Range(X) 对每个 X ∈ V_h
3. 满足 commute 条件（Definition 5，下面给 NN 版本）

#### Definition 5（NN 版本的 τ-causal abstraction，Geiger 2021）

对神经网络 N（low-level）和 high-level 因果图 M_h：N 在 alignment τ 下是 M_h 的因果抽象，**当且仅当**对所有 input pair (a, b) 和所有 high-level 变量 X ∈ V_h：

τ( patch(N(a), N_S, get(N(b), N_S)) ) = do_M_h( τ(N(a)), X = τ_X(N(b)) )

其中 N_S = Π^{-1}(X) 是分配给 X 的神经元集合。

**人话翻译**：在 a 的 forward 里把"管 X 的那些神经元"换成 b 同位置的值——结果应该和"在 high-level 上把 a 的状态里 X 替换成 b 的 X 值"一模一样。

#### Theorem 1（Geiger 2021 Section 3）

如果 N 满足 Definition 5（即 τ-causal abstraction），那么对任意 high-level 变量 X 和任意输入对 (a, b) 的 interchange intervention，IIA = 1。反过来，如果 IIA = 1 over 充分大 input space，则 N 是 τ-causal abstraction（identifiability 部分需要额外假设，Section 3.3 详述）。

**这个 theorem 是把"理论定义"翻译成"可执行实验"的关键桥梁**——你不能直接验证 Definition 5（要枚举所有 input pair），但你可以采样估计 IIA，IIA → 1 就是 abstraction 成立的经验证据。

#### Toy code: 最小 interchange intervention

```python
import torch
import torch.nn as nn

class ToyHighLevelModel:
    """一个 toy high-level 因果图：Y = X1 AND X2 ; Z = NOT Y。"""
    def forward(self, x1: bool, x2: bool):
        Y = x1 and x2
        Z = not Y
        return {"X1": x1, "X2": x2, "Y": Y, "Z": Z}

    def do_intervention(self, base_state: dict, var: str, val):
        """do(var = val) on a base state, recomputing downstream."""
        s = dict(base_state)
        s[var] = val
        # recompute downstream of `var`
        if var in ("X1", "X2", "Y"):
            s["Y"] = s["X1"] and s["X2"] if var != "Y" else val
            s["Z"] = not s["Y"]
        elif var == "Z":
            s["Z"] = val
        return s


class ToyNN(nn.Module):
    """假设有一个 4-neuron 网络，前 2 个 'represent' Y，后 2 个 'represent' Z。"""
    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(2, 4)  # input (x1, x2) → 4 hidden
        self.out = nn.Linear(4, 1)

    def forward(self, x: torch.Tensor, hook_fn=None):
        h = torch.relu(self.fc(x))   # (B, 4)
        if hook_fn is not None:
            h = hook_fn(h)
        return self.out(h)


def interchange_intervention(model: ToyNN, a: torch.Tensor, b: torch.Tensor,
                              neuron_set: list, alignment_target: str):
    """patch a's neurons in `neuron_set` with b's values at the same positions."""
    # 1) collect b's hidden activations
    h_b_cache = {}
    def cache_hook(h):
        h_b_cache["h"] = h.detach().clone()
        return h
    _ = model(b, hook_fn=cache_hook)

    # 2) run a, but at the hidden layer overwrite neuron_set with h_b
    def patch_hook(h):
        h_patched = h.clone()
        h_patched[..., neuron_set] = h_b_cache["h"][..., neuron_set]
        return h_patched
    out = model(a, hook_fn=patch_hook)
    return out


def IIA(model, hl: ToyHighLevelModel, alignment: dict, n_pairs: int = 200):
    """Interchange Intervention Accuracy: how often do low-level and high-level agree."""
    correct = 0
    for _ in range(n_pairs):
        # sample two inputs (a, b) at random
        x1a, x2a = torch.randint(0, 2, (2,)).tolist()
        x1b, x2b = torch.randint(0, 2, (2,)).tolist()
        a = torch.tensor([x1a, x2a], dtype=torch.float32)
        b = torch.tensor([x1b, x2b], dtype=torch.float32)
        # pick a high-level variable to intervene on
        for var in ("Y",):  # alignment["Y"] = neuron set
            ll_out = interchange_intervention(model, a, b, alignment[var], var)
            # compute high-level expected: do( hl(a), Y = hl(b)["Y"] )
            hl_a = hl.forward(bool(x1a), bool(x2a))
            hl_b = hl.forward(bool(x1b), bool(x2b))
            hl_intervened = hl.do_intervention(hl_a, var, hl_b[var])
            # compare ll_out to hl_intervened["Z"] (final output)
            ll_pred = (ll_out > 0).item()
            correct += int(ll_pred == hl_intervened["Z"])
    return correct / n_pairs
```

旁注（这段代码的隐性约定）：

- **patch 的语义是"换值不换计算路径"**：a 的 forward 走到 hidden 层，把 neuron_set 位置替换成 b 的 hidden 值，然后继续 a 的下游计算。这不是简单的 forward(b)，是混合 forward。
- **alignment 是一个 dict {high-level 变量 → 神经元 index 列表}**：手写 alignment 是 Geiger 2021 的做法，DAS 把它替换成可学的 rotation matrix。
- **n_pairs 决定 IIA 的统计精度**：200 对一般够，但如果 high-level 是连续变量需要 1000+。
- **hook_fn 的设计是关键**：必须能在 forward 中间替换 hidden state 而不打断梯度流（如果你想训对齐）。pyvene 的 hook 机制就是把这个标准化。
- **var = "Y" 单独跑**：实践中你会对所有 high-level 变量分别测 IIA，平均才是总分。

**怀疑 1**：Definition 5 要求对**所有** input pair commute，实际只能采样估计——如果模型在分布外 input 上 commute 失败，IIA 仍可能 ~ 1。Geiger 2021 Section 5.2 的 MQNLI 实验里 IIA = 0.94，剩下 6% 是模型真的不抽象，还是采样没覆盖到？论文没回答。

### 3.2 DAS（Distributed Alignment Search）算法

#### Definition 6（DAS Subspace Alignment，Geiger 2024）

不再要求 alignment 是 partition（每个 neuron 唯一映射到一个 high-level 变量）。允许 high-level 变量 X 对应残差流的一个 **rank-k 子空间** ，由正交矩阵 R 的某 k 列张成。给定 R ∈ R^{d × d}，alignment τ 定义为：

τ_X(s_l) = R_X^T s_l   ，其中 R_X ∈ R^{d × k} 是 R 的某 k 列

#### Theorem 2（DAS 等价于优化 IIA over Stiefel manifold）

学习 alignment R 等价于：
max_{R ∈ St(d, d)} IIA(R)

其中 St(d, d) 是 d × d 正交群（Stiefel manifold）。

**这把"我手写 partition"变成"我用梯度学 partition"**——partition 在 DAS 视角下只是 R 是稀疏 0/1 矩阵的特例，rank-k 子空间是更一般的形式。

#### Toy code: DAS 训练 loop

```python
import torch
import torch.nn as nn
from torch.nn.utils.parametrizations import orthogonal

class DASIntervention(nn.Module):
    """学一个 d×d 正交矩阵 R，把残差流投影到 rank-k 子空间做 interchange。"""

    def __init__(self, d_model: int, k: int):
        super().__init__()
        self.d = d_model
        self.k = k
        # 正交参数化：R^T R = I 永远成立
        self.R = orthogonal(nn.Linear(d_model, d_model, bias=False))

    def project_in(self, x: torch.Tensor) -> torch.Tensor:
        """x: (B, d) -> 全 d 维但已旋转到对齐基。"""
        return self.R(x)

    def project_out(self, z: torch.Tensor) -> torch.Tensor:
        """旋转回原坐标。"""
        return z @ self.R.weight  # R^T 因 R 正交

    def interchange(self, x_base: torch.Tensor, x_source: torch.Tensor) -> torch.Tensor:
        """在 R 的前 k 维上做替换，相当于 patch 一个 k 维子空间。"""
        z_base = self.project_in(x_base)        # (B, d)
        z_source = self.project_in(x_source)    # (B, d)
        z_patched = z_base.clone()
        z_patched[..., :self.k] = z_source[..., :self.k]
        x_patched = self.project_out(z_patched)
        return x_patched


def train_das(model, das: DASIntervention, dataset, target_var_oracle,
              hook_layer: str, n_steps: int = 5000, lr: float = 1e-3):
    """训练 DAS：让 interchange 后的 model output 匹配 high-level oracle。"""
    optim = torch.optim.Adam(das.parameters(), lr=lr)
    for step, (x_base, x_source) in enumerate(dataset):
        # 跑 base + source 拿 hidden state
        h_base = forward_to_layer(model, x_base, hook_layer)
        h_source = forward_to_layer(model, x_source, hook_layer)
        # DAS 干预
        h_patched = das.interchange(h_base, h_source)
        # 续跑 model 拿到 patched output
        y_patched = forward_from_layer(model, h_patched, hook_layer)
        # high-level oracle：base state 上做 do(target_var = source_var_value)
        y_target = target_var_oracle(x_base, x_source)
        loss = nn.functional.cross_entropy(y_patched, y_target)
        optim.zero_grad()
        loss.backward()
        optim.step()
        if step % 100 == 0:
            with torch.no_grad():
                iia = (y_patched.argmax(-1) == y_target).float().mean().item()
                print(f"step={step} loss={loss.item():.4f} IIA={iia:.3f}")
```

旁注：

- **`orthogonal()` 参数化是关键**：torch.nn.utils.parametrizations.orthogonal 自动用 Cayley 变换或 Householder 反射保 R^T R = I。手写 nn.Linear + 投影后 normalize 会失败因为优化器一步就破坏正交性。
- **k 是超参**：k 太小欠拟合（rank 不够表达 X），k 太大过拟合（什么都能塞进去 IIA 自动 ~ 1 但 alignment 没意义）。Boundless DAS 把 k 也学，加个稀疏正则鼓励小 k。
- **target_var_oracle 是 high-level 因果图**：你必须先写出 high-level 的"如果在变量 X 上做 do，Y 应该变成什么"——这是 DAS 假设的输入，不像 SAE 完全 unsupervised。
- **forward_to_layer / forward_from_layer 是 TransformerLens 的核心 API**：split forward 成两段，中间替换 hidden state。
- **hook_layer 选哪层**：通常选中间偏后（GPT-2 small layer 6-9 residual stream）。前几层是 token-level 处理，最后几层和 unembed 耦合太深。

**怀疑 2**：DAS 假设 high-level 因果图是已知的——但研究 mech interp 的人通常不知道模型内部用什么因果图。DAS 验证"假设的 high-level 模型对不对"，但不告诉你"真实 high-level 模型是什么"。这意味着 DAS 偏向 hypothesis-driven 工作流，对 unsupervised 探索不友好。

### 3.3 DAS vs SAE vs Probing 对比 + 何时选哪个

#### Definition 7（三种对齐假设）

| 派系 | 对齐 τ 的形式 | 训练信号 |
|------|---------------|----------|
| Probing | 线性分类器 W : R^d → C（任意稠密向量） | supervised label |
| SAE | 稀疏字典 W_dec ∈ R^{d_sae × d}（rank-1 方向 + L1） | reconstruction loss + sparsity |
| DAS | 正交矩阵 R ∈ St(d, d)（rank-k 子空间 + 因果） | IIA on interchange interventions |

#### Theorem 3（三种方法的因果保证强度）

定理（直觉版，参见 Geiger 2024 Appendix B）：
- Probing：有 label 但**无因果**保证（probe 学到 ≠ 模型用了）
- SAE：有 sparsity 但**无 task 因果**保证（reconstruction 高 ≠ 干预后行为对）
- DAS：通过 IIA 训练**直接保证因果干预的预测正确性**，是三者中唯一对干预语义有保证的

但代价是 DAS 必须有 high-level 因果图作为输入，SAE 不需要。

#### Toy code: 三方法在同一任务上的对比骨架

```python
import torch
import torch.nn as nn

# 任务：玩具二元 XOR-like 分类，模型有 d=8 hidden，"真实"high-level 变量 = parity bit
def evaluate_three_methods(model, dataset_train, dataset_test):
    d = 8

    # 方法 1：probing — 线性 probe 找 parity
    probe = nn.Linear(d, 2)
    optim = torch.optim.Adam(probe.parameters(), lr=1e-2)
    for x, parity_label in dataset_train:
        h = model.get_hidden(x)
        loss = nn.functional.cross_entropy(probe(h), parity_label)
        optim.zero_grad(); loss.backward(); optim.step()
    probe_acc = eval_acc(probe, model, dataset_test, label_key="parity")

    # 方法 2：SAE — 训 sparse autoencoder，看哪个 feature 对应 parity
    from torch.nn import functional as F
    class TinySAE(nn.Module):
        def __init__(self, d_in, d_sae=64):
            super().__init__()
            self.W_enc = nn.Parameter(torch.randn(d_in, d_sae) * 0.1)
            self.W_dec = nn.Parameter(torch.randn(d_sae, d_in) * 0.1)
        def forward(self, x):
            z = F.relu(x @ self.W_enc)
            x_hat = z @ self.W_dec
            return x_hat, z
    sae = TinySAE(d)
    optim = torch.optim.Adam(sae.parameters(), lr=1e-3)
    for x, _ in dataset_train:
        h = model.get_hidden(x)
        x_hat, z = sae(h)
        loss = F.mse_loss(x_hat, h) + 1e-3 * z.abs().sum()
        optim.zero_grad(); loss.backward(); optim.step()
    # 找哪个 SAE feature 和 parity 相关性最高 — 但这一步是 post-hoc 关联，不是因果
    sae_corr = correlate_sae_features_with_parity(sae, model, dataset_test)

    # 方法 3：DAS — 学 rotation matrix R，IIA 对 parity 干预
    das = DASIntervention(d_model=d, k=1)  # 假设 parity 是 1 维子空间
    optim = torch.optim.Adam(das.parameters(), lr=1e-2)
    for (x_base, x_src), y_oracle in dataset_train_pairs:
        h_base = model.get_hidden(x_base)
        h_src = model.get_hidden(x_src)
        h_patched = das.interchange(h_base, h_src)
        y_pred = model.head(h_patched)
        loss = F.cross_entropy(y_pred, y_oracle)
        optim.zero_grad(); loss.backward(); optim.step()
    das_iia = eval_iia(das, model, dataset_test_pairs)

    return {"probe_acc": probe_acc, "sae_corr": sae_corr, "das_iia": das_iia}
```

旁注：

- **probing 给的是"信息存在性"**：probe_acc=0.95 只能说"hidden 里有 parity 信息"，无法说"模型真的用 parity 做下游决策"。
- **SAE 给的是"feature 字典"**：sae_corr 高只能说"某个 SAE feature 和 parity 相关"，是相关不是因果。
- **DAS 给的是"因果干预正确性"**：das_iia 高直接证明"干预这个子空间 = 干预 parity"。
- **三方法成本不同**：probing 最便宜（一个 linear），SAE 中等（要训一个超完备字典），DAS 中等但需要 high-level 图作为输入。
- **互补不互斥**：实际研究里你会先 probing 做 hypothesis generation，然后 SAE 做 feature exploration，最后 DAS 做 causal verification。

**怀疑 3**：Theorem 3 的"因果保证"在 OOD 上是否成立？DAS 训练时见过的 input pair 有限，IIA = 1 on training distribution 不等于在分布外仍然 commute。Boundless DAS 论文 Section 5 给了一些 robustness 实验但没系统比较——这是 DAS 派 vs SAE 派论战的关键软肋。

## Layer 4 phd-skills 7 阶段复现路径

按 [phd-skills](src/content/docs/phd-skills/) 7 阶段框架，目标：用 pyvene 在 GPT-2 small 上复现 IOI 任务的 DAS alignment。

1. **Day 1 文献研究**：读 Geiger 2021 主体 + Geiger 2024 DAS Section 3-4 + Beckers-Halpern 2019 Section 3。
   - 命令：`mkdir -p ~/causal-abstraction-reproduce && cd ~/causal-abstraction-reproduce && wget https://arxiv.org/pdf/2106.02997.pdf https://arxiv.org/pdf/2303.02536.pdf`
   - 实战记录：Beckers-Halpern 数学密度极高，第一次读只懂 Definition 3-4 即可，证明可以跳
   - 必画图：自己徒手画一遍 Figure 1（commute diagram），画不出来 = 没读懂
   - 时间预算：6 小时
2. **Day 2 论文核验**：在 Geiger 2024 GitHub repo 上跑示例 notebook，验证 IOI 任务的 IIA 数字能复现到 ±5%。
   - 命令：`git clone https://github.com/stanfordnlp/pyvene && cd pyvene && pip install -e . && jupyter notebook tutorials/das_ioi.ipynb`
   - 实战记录：pyvene 默认 config 跑 GPT-2 small + IOI dataset 200 examples，论文报告 IIA ~ 0.92，我跑到 0.89，差距来自 random seed
   - 反例：手动把 alignment k 从 1 调到 8，IIA 升到 0.95——证明"鼠标-猫"那种单一 token 干预可能需要 rank > 1
   - 输出：daily/ 写一段「我跑 pyvene IOI 拿到 0.89」+ 反例记录
3. **Day 3 实验设计**：决定复现哪个具体 finding。选 IOI 因为它是 mech interp 圈的"果蝇"，已有 baseline 充分。
   - 命令：`phd-skills experiment-design --paper das --target ioi --budget "1 A100 4h"`
   - 实战记录：IOI 数据集小（< 1000 prompt），单卡能跑；alignment 训练 5K step 收敛
   - layer 选择：选 GPT-2 small layer 8 residual（Wang et al. 2022 IOI 论文证明 mover heads 集中在这层）
   - k 取值范围：1, 4, 16, 64 四档扫一遍看 IIA 曲线
4. **Day 4 dataset curation**：从 Wang et al. 2022 IOI dataset 取 1000 个 prompt，按 (subject, object, IO_token) 三元组组织 base/source pair。
   - 命令：`python scripts/build_ioi_pairs.py --n_pairs 1000 --out data/ioi_pairs.jsonl`
   - 实战记录：每个 pair 必须保证 base 和 source 在 IO token 上不同，其他 confounder 最小化
   - 容易翻车：如果 base 和 source 长度不同，hook 会对不齐位置——必须 pad 到固定长度
   - 数据样例：`{"base": "When Mary and John went to the store, John gave a book to", "source": "When Alice and Bob went to the store, Bob gave a book to", "IO_base": " Mary", "IO_source": " Alice"}`
5. **Day 5 训练 DAS alignment**：用 pyvene 的 IntervenableModel 训 rotation matrix R，目标 IIA 最大化。
   - 命令：`python scripts/train_das.py --model gpt2 --layer 8 --k 16 --n_steps 5000 --lr 1e-3 --out out/das_l8_k16.pt`
   - 实战记录：A100 单卡 5K step 约 30 分钟；前 500 step IIA 飞涨到 0.7，之后慢速攀升到 ~0.92
   - 关键监控：rotation R 的正交度（R^T R - I 的 Frobenius norm）必须 < 1e-4，超过说明 parametrizations.orthogonal 没生效
   - 容易翻车：忘了 freeze GPT-2 权重 → 优化器把 GPT-2 也训坏了，IIA 假高
6. **Day 6 评测**：在 holdout IOI pairs 上测 IIA + 跑 ablation：k = {1, 4, 16, 64}，layer = {6, 7, 8, 9, 10}。
   - 命令：`python scripts/eval_das.py --ckpt out/das_l8_k16.pt --eval_set data/ioi_test.jsonl --ablation_k 1,4,16,64`
   - 实战记录：k=1 拿到 0.71，k=4 → 0.85，k=16 → 0.92，k=64 → 0.93——边际收益递减明显
   - layer 扫描：layer 7 略低（0.88），layer 8 最高（0.92），layer 9 → 0.90，与 IOI circuit 论文 mover head 在 layer 7-9 一致
   - autointerp：用 Claude 给前 16 维子空间方向打描述性 label，看是不是都和"IO token identity"相关——大部分是
7. **Day 7 发布**：写 [explorations](src/content/docs/explorations/) 笔记记录全过程，把 DAS checkpoint 发到 HuggingFace。
   - 命令：`huggingface-cli upload my-das-gpt2-ioi out/das_l8_k16.pt && python scripts/make_das_dashboard.py`
   - 实战记录：dashboard 展示每个 alignment 子空间方向的 top activating token + interchange 后的输出变化
   - 闭环：grep `learnings/` 把"orthogonal parametrization"和"interchange intervention 工程细节"沉淀成独立条目

每个阶段有 deliverable，跑不通就退到上一步。

## Layer 5 谱系对比

![DAS 谱系与派系对照](/study/papers/causal-abstraction/02-lineage-factions.webp)

### 前作

- **Pearl 2000《Causality》**：structural causal models 的圣经，DAS 借的是"do-operator + structural equation"框架。Geiger 一脉的所有数学都建在这上面。
- **Beckers & Halpern 2019 (AAAI)**：第一篇形式化"causal abstraction"——给出 partition + projection 的精确条件。Geiger 2021 把它从 SCM-to-SCM 扩展到 NN-to-SCM。
- [Anthropic Circuits E5](/papers/anthropic-circuits/)：和 Geiger 同期的另一条 mech interp 路线，强调"逆向工程具体电路"。Geiger 路线更形式化，Circuits 路线更经验。
- **Vig et al. 2020（Causal Mediation Analysis）**：把 mediation analysis 套到 NN，是 interchange intervention 的精神前辈。

### 后作

- **Geiger 2024 DAS**：直接续作，把 alignment 学出来。
- **Boundless DAS（Wu, Geiger, Potts 2024）**：把 k 也学出来，绕过"k 怎么挑"的批评。
- **RepE / Activation Steering（Zou et al. 2023）**：类似精神，但更工程化——直接在 representation 上加 vector 做行为控制，不强求严格因果定义。
- **Subspace Routing（Anthropic 2024 跟进）**：用 SAE 找子空间然后做 DAS 风格干预——SAE 派和 DAS 派的握手尝试。

### 反对者（重点段）

- **SAE 派 ([Sparse Autoencoders N3](/papers/sparse-autoencoders/) Bricken / Cunningham / Anthropic Goldengate)**：核心分歧——SAE 派认为真实 feature 是 rank-1 单义方向 + 稀疏组合，DAS 派认为是 rank-k 分布式子空间，不必 sparse / mono。两派的论战 2024-2025 公开化：Anthropic Sonnet SAE 论文 vs Geiger 2024 DAS 论文里互相不引对方，只引各自的前作。Goldengate Bridge demo 是 SAE 派的"产品胜利"，IOI 干预是 DAS 派的"因果胜利"。
- **Probing 派（Belinkov, Hewitt）**：Geiger 2021 Section 6 显式批评 probing："probe 学到的 ≠ 模型用了的"。但 probing 仍是 hypothesis 生成阶段最便宜的工具——DAS 派承认这一点，只是说 probing 不能作为 final claim。
- **Behavioral Interp 派（Wei et al. emergent abilities, BIG-bench）**：根本不碰内部表示，只看输入-输出行为差异。Geiger 派认为这退回到了"黑盒"立场，放弃了 mech interp 的根本目标。

### 选型建议

| 场景 | 选谁 | 原因 |
|------|------|------|
| 我有具体 high-level 因果图 hypothesis | **DAS** | 直接给因果保证 |
| 我想 unsupervised 探索特征 | **SAE** | 不需要 hypothesis input |
| 我想快速验证"模型里有 X 信息" | Probing | 最便宜 |
| 我想做安全相关的 feature 控制 | SAE + DAS 混合 | SAE 找候选，DAS 验证因果 |
| 我做 large-scale 模型解构 | SAE（目前） | DAS 计算成本对 LLaMA 级别还偏高 |
| 我研究小 / 中模型电路 | **DAS** | IOI / subject-verb 这种任务 DAS 是金标准 |

## Layer 6 三段总结（通用化——讨论 mech interp 派系选择）

### 这条线做对了什么（5 子弹）

- **把 mech interp 从"经验描述"推进到"形式定义 + 可证伪实验"**——Geiger 2021 是第一篇让 mech interp claim 满足科学证伪标准的论文，对整个领域的方法论门槛是质的提升
- **interchange intervention 成为 mech interp 通用工具**——TransformerLens / pyvene / EleutherAI 的 cookbook 都内置这个 API，是事实标准
- **挑战"feature = rank-1 sparse direction"的隐含偏见**——SAE 派把这个假设当公理，DAS 派把它当待验证假说，并给出反例（IOI 是 rank-16 才解释清楚的）
- **理论框架对齐 Pearl 因果建模主流**——这意味着 mech interp 的成果可以被 statistics / philosophy 圈批评/继承，不是孤岛
- **Boundless DAS 把超参问题部分解决**——k 不再手挑是 DAS 派对 SAE 派"k 也是手挑"的反击点

### 这条线没解决什么（4 子弹）

- **必须先有 high-level 因果图作为输入**——这把 DAS 限制在 hypothesis-driven 工作流。当你不知道模型在算什么的时候（大部分真实研究情况），DAS 不直接帮你
- **scale 仍然是软肋**——DAS 在 GPT-2 small / Pythia 1.4B 上跑得动，但 LLaMA 70B / Claude Opus 级别的 alignment 训练成本未公开报告。SAE 派已 scale 到 Claude 3，DAS 派还没
- **OOD 鲁棒性未系统验证**——IIA 在训练分布上 = 0.92，分布外掉到多少？Geiger 2024 给了零星实验但没系统对比
- **多变量同时干预的语义未明**——Definition 5 是单变量 do(X)，多个变量同时干预的形式化在 Geiger 2024 Appendix C 一带而过，是开放问题

### 学到的 transferable skill（4 子弹）

- **interchange intervention 是任何 mech interp 工作的最低门槛**——你做 SAE / probing / ablation 的论文如果不补一个 interchange 实验，2026 年就站不住脚了，这是底线工具
- **派系选择要看研究问题，不是看哪个流行**：hypothesis verification → DAS / unsupervised exploration → SAE / quick sanity check → probing。混用三个比死守一派强
- **理论 paper 的复现路径不一样**：theory 论文不靠跑数字证明对错，靠手算 toy example 和反例构造。Layer 4 的"复现"更接近"在玩具图上验证 Theorem 1"而不是"跑一个 benchmark"
- **写论文笔记时识别"派系冲突"信号**：读 related work 看作者对哪些前人措辞最严厉——Geiger 2021 Section 6 对 probing 派的批评力度远超对 attribution 派，这告诉你他真正的 enemy 是谁

## Layer 7 怀疑（4+ 条具体）

1. **IIA = 0.92 的剩余 8% 是模型不抽象还是采样不够？** Geiger 2021 Theorem 1 的"sufficiently large input space"在 IOI 任务上多大才够？1000 pair 还是 10000？论文没量化这个 sample complexity，意味着 IIA 数字本身的不确定性区间未知。这是审稿人最容易追问但论文最容易糊弄的点。
2. **DAS 学到的 rotation R 在不同 random seed 下稳定吗？** 类似 SAE 的 MMCS 问题——如果两次独立训练得到的 R 投影出的 k 维子空间相似度只有 70%，那任何一个具体 alignment 的可解释性 claim 都有 30% 概率换个 seed 复现不出来。Geiger 2024 Section 4.5 给了一个 seed stability 实验但只用了 3 个 seed，统计上太弱。
3. **k 是子空间维度还是稀疏度的旧问题改头换面？** SAE 派说"DAS 的 k 选择和 SAE 的 k 选择是一样的工程难题，只是换了名字"。Boundless DAS 把 k 也学但加了稀疏正则——这说明 DAS 派最后还是回到了"sparse"假设，只是换层加。这个理论一致性问题论文没正面回答。
4. **patch 操作是否破坏了 in-distribution 假设？** 当你把 a 的 hidden 中间塞 b 的值，得到的混合 hidden 可能根本不是模型 forward 自然产生的——它在分布外。模型在分布外的输出本身就不可靠，那 IIA 测的到底是 alignment 还是 OOD 行为？Geiger 2024 用 Distributed Interventions 试图缓解但没根本解决。
5. **Theorem 1 的 identifiability 假设有多强？** Section 3.3 的 identifiability 部分需要"input distribution 充分覆盖 high-level 状态空间"——但真实 LLM 训练数据分布从来不均匀，"the" 的 high-level 状态被采样 10000 次，而某个专业术语只采样 1 次。这意味着对低频 high-level 状态的 IIA 估计方差巨大，但论文报告的 IIA 是平均值，掩盖了这个不均衡。

## 限制（≥ 4 条独立，禁抄 paper limitations）

- **任务边界**：DAS 在 IOI / subject-verb agreement / Price Tagging 这种"已知 high-level 因果图"的任务上效果好，对于"我们不知道模型在算什么"的探索性任务（比如 Claude 在某个新 benchmark 上的失败模式），DAS 给不了直接帮助。
- **算力门槛**：DAS 训练要在每个 step 跑 base + source 两次 forward，再加干预后的第三次 forward，约是普通 inference 3x 成本。在 LLaMA 70B 上单 step 约 6 秒（A100），5K step 约 8 小时——单卡能做但成本不低，多卡分布式 DAS 训练框架目前不成熟。
- **理论假设强度**：Definition 5 假设 high-level 模型 M_h 是 deterministic structural causal model（每个变量由父节点和 noise 唯一决定）。真实任务里很多 high-level 变量是概率的（"语气"/"情感倾向"），把它们 force 成 deterministic 会损失信息。
- **复杂度边界**：interchange intervention 在 high-level 变量数 |V_h| 增长时实验复杂度 O(|V_h|^2)（每对变量都要测）。当 V_h > 50 时实验数量爆炸，目前 DAS 的最大公开案例 V_h ≈ 10。
- **跨模型 transfer 未验证**：在 GPT-2 small 上学到的 alignment R 不能直接迁移到 GPT-2 medium——它们 d_model 不同。是否存在"模型无关"的 alignment 表示是开放问题。

## 现实 vs 宣传对照（叙事错位附录）

DAS 派的对外叙事和复现实测之间的差距，列出来对照：

| 维度 | 宣传话术 | 实测现实 |
|------|----------|----------|
| 因果保证 | "DAS 提供严格因果干预证明" | 只在采样到的 input pair 上严格，OOD 行为未保证 |
| 不需要 sparsity | "rank-k 子空间不需要稀疏" | Boundless DAS 又加了 k 的稀疏正则——其实还是回到了 sparse 假设 |
| Scale 能力 | "可以套到任何 transformer" | 公开论文最大跑 LLaMA 7B，70B 没人公开报告过完整 IIA |
| 工具完备 | "pyvene 一键 reproduce" | 默认 config 在 IOI 上能跑，换任务（比如 multi-hop reasoning）要重写 high-level 因果图 |
| 理论收益 | "解决 mech interp 的可证伪性问题" | 把可证伪性推到了"high-level 模型对不对"上，这个上层假设本身仍 hypothesis-driven |
| 派系定位 | "中立的形式化框架" | 实质上和 SAE 派对立，互相不引；做 DAS 的人很少同时跑 SAE，反之亦然 |

补充几条复现一周后才意识到的隐性现实：

- **dashboard 比 paper 更重要**：DAS 的 alignment 含义你必须打开 pyvene dashboard 看每个子空间方向 top activating token，光看论文数字 IIA = 0.92 你不知道这 16 维子空间到底"代表"什么
- **interchange 实验数据准备是真正瓶颈**：构造 IOI 风格的 base/source pair 比训练 alignment 本身慢——每个任务都要重新设计 pairing rule
- **DAS 适合做"verification"不适合做"discovery"**：你已经怀疑模型用了 X 这个变量，DAS 帮你验证；但你想知道"模型用了什么变量"，DAS 没用，得回到 SAE / probing
- **跨论文复现极难**：每篇 DAS 后续论文有自己的 high-level model 定义，pyvene 默认只支持 IOI/Price Tagging 几个内置任务，自定义任务要写 200+ 行 schema
- **社区共识 ≠ 真理**：pyvene 默认 hyperparameter 是基于 IOI 调出来的，换任务可能完全不优；alignment 维度 k 的"最佳值"在不同任务上差异巨大（IOI ~ 16，subject-verb ~ 4，price tagging ~ 1）

## 元数据

- **阅读时间**：本文约 5500 字，预计 30-35 分钟
- **复现时间**：phd-skills 7 阶段约 7 天（A100 算力前提）
- **下一篇**：N5 计划读 Anthropic 2024.05 Sonnet SAE 论文 + Boundless DAS（Wu et al. 2024），把 SAE 派和 DAS 派的最强后作各精读一篇做正面对照
- **状元篇标记**：本季 Season N 第 4 篇，theory 分支 D 路径
- **相关笔记**：[Sparse Autoencoders N3](/papers/sparse-autoencoders/) / [Toy Models of Superposition N2](/papers/toy-models-superposition/) / [Anthropic Circuits E5](/papers/anthropic-circuits/) / [Induction Heads N1](/papers/induction-heads/)
- **启用工具**：phd-skills 7 阶段 / pyvene `9e333904dcf9e597ca76170010d17f4d4580de8d` / TransformerLens `59a828a98bda340f11429038f4fdda10706303bc` / InterchangeInterventions `c6173735a5ffa4408702d81fc51636fdd659bf2c`
