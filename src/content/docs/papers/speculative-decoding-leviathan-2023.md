---
title: Speculative Decoding — 用小模型「猜」、大模型「验」，无损加速 Transformer 推理
来源: https://arxiv.org/abs/2211.17192
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 从日常类比开始：老师改作文 vs 学生先写草稿

想象你是一位**语文老师**（目标大模型 \(M_p\)），要帮全班 40 个学生每人续写一段 500 字的作文。传统做法很折磨：

- 每写**一个字**，你都要亲自读一遍前文、想下一个字——**串行**，500 字就要你「完整思考」500 次。
- 大模型的自回归解码正是如此：生成 \(K\) 个 token，就要对目标模型做 \(K\) 次**串行 forward**。

Speculative Decoding（Leviathan 等，**ICML 2023**，arXiv [2211.17192](https://arxiv.org/abs/2211.17192)）换了一种分工：

1. 先派一位**反应快的学生**（草稿模型 \(M_q\)，小很多）连写 \(\gamma\) 个「猜测字」。
2. 你**一次性**对照前文，并行检查这 \(\gamma\) 个字里，从第一个起连续有多少个和你想的一样。
3. 猜对的字全部收下；第一个猜错的字及之后全部作废；在第一个错字的位置，用**数学上严格等价**于「只由你亲自写」的采样规则补一个字。
4. 把已确认的文字当作新前文，重复上述循环。

关键承诺：**最终文本的随机分布，与只用大模型逐 token 采样完全一致**——不是近似、不是蒸馏后的「差不多」，而是 distribution-preserving（分布保持）。论文在 T5-XXL（11B）上实测 **2–3× 墙钟加速**，输出与 T5X 基线逐 token 相同。

日常类比再补一句：这就像 CPU 的**分支预测 / 投机执行**——先猜「下一条指令会不会走这条路径」，猜对就省时间，猜错就回滚，但**程序语义不变**。

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | *Fast Inference from Transformers via Speculative Decoding* |
| 作者 | Yaniv Leviathan, Matan Kalman, Yossi Matias（Google Research） |
| 会议 | ICML 2023（PMLR 202:19274–19286） |
| 核心方法 | **Speculative sampling** + **Speculative decoding** |
| 模型对 | 目标 \(M_p\)（大、慢、高质量）+ 近似 \(M_q\)（小、快） |
| 超参 \(\gamma\) | 每轮草稿模型连续猜的 token 数 |
| 实测加速 | T5-XXL 翻译/摘要 **2–3×**；LaMDA 137B 对话也有收益 |
| 是否需要重训 | **否**——现成大小模型配对即可（同 tokenizer 更稳） |

论文的两个核心观察：

1. **难任务里常有易子任务**：整段摘要很难，但「下一个常见词」往往可被小模型猜中。
2. **推理常 memory-bound 而非 compute-bound**：大模型 forward 一次，GPU 算力没跑满，**多加并行验证**往往「免费」——多出来的 FLOPs 换更少的串行步数。

---

## 为什么重要

不理解 Speculative Decoding，下面几件事很难讲清：

- 为什么 2023 年后 vLLM、TensorRT-LLM、SGLang 都内置 **draft model / speculative decoding** 开关，且敢宣传「输出与原版一致」
- 为什么 **Medusa、EAGLE、SpecInfer** 等后续工作都在「怎么猜更多、验更快」上迭代，而**接受–拒绝采样**这条数学主线来自 Leviathan 这篇
- 为什么 LLM 服务优化除了 **PagedAttention（省显存）**、**Continuous batching（提吞吐）**，还需要 **speculative decoding（减串行深度）**——三者正交、可叠加
- 为什么「小模型当 draft」和「量化/蒸馏」不同：后者改分布；speculative decoding **不改目标模型分布**

---

## 核心概念

### 1. 自回归瓶颈：\(K\) 个 token = \(K\) 次串行

Transformer 解码时，第 \(t\) 个 token 依赖 \(x_{1:t-1}\)。无论模型多大，**每一步都要等上一步结束**——这是 latency 的根本来源，与 batch 并行无关。

### 2. 草稿–验证两阶段

每轮 **SpeculativeDecodingStep**（论文 Algorithm 1）：

**阶段 A — 草稿采样（串行，但在小模型上）**

- 对 \(i = 1 \ldots \gamma\)：用 \(M_q\) 在前缀 `prefix + x₁…x_{i-1}` 上得到分布 \(q_i(x)\)，采样 \(x_i \sim q_i\)。

**阶段 B — 目标验证（并行）**

- 一次并行算出 \(p_1, \ldots, p_{\gamma+1}\)：即 \(M_p\) 在 `prefix`、`prefix+x₁`、…、`prefix+x₁…x_γ` 上的下一 token 分布。
- 注意：因为 \(x_{1:\gamma}\) 已知，\(\gamma+1\) 个位置的前向可以**打包成一次 batched forward**（现代框架的核心工程点）。

**阶段 C — 接受–拒绝（speculative sampling）**

对每个草稿 token \(x_i\)，设 \(p_i = p_i(x_i)\)，\(q_i = q_i(x_i)\)：

1. 若 \(q_i \le p_i\)：**直接接受** \(x_i\)。
2. 否则：抽 \(r \sim U(0,1)\)，若 \(r < p_i / q_i\) 则接受，否则**拒绝并停止**检查后续草稿。
3. 若在第 \(n\) 个 token 拒绝（或 \(\gamma\) 个全接受），从修正分布采样一个 token \(t\)：
   - 全接受：\(t \sim p_{\gamma+1}\)
   - 中途拒绝：\(t \sim \mathrm{norm}(\max(0,\, p_{n+1} - q_{n+1}))\)

返回新前缀：`prefix + x₁…x_n + t`。可以证明这样得到的序列与「只用 \(M_p\) 逐步采样」**同分布**。

### 3. 接受率 \(\alpha\) 与期望加速

定义 per-token 接受率 \(\alpha = \mathbb{E}_{x \sim q}[\min(1, p(x)/q(x))]\)。一轮期望产出的 token 数：

\[
\tau = \frac{1 - \alpha^{\gamma+1}}{1 - \alpha}
\]

即串行调用大模型的次数约减少到原来的 \(1/\tau\)。再扣除草稿模型成本（系数 \(c\) = 小模型单次耗时 / 大模型单次耗时），墙钟加速因子约为：

\[
\frac{1 - \alpha^{\gamma+1}}{(1 - \alpha)(\gamma c + 1)}
\]

论文 Corollary 3.9：**当 \(\alpha > c\) 时，存在最优 \(\gamma\) 使总时间下降**；\(c\) 很小时（小模型比大模型快两个数量级很常见），\(\gamma=1\) 往往已有收益。

### 4. 与「自适应计算 / 早退 / 蒸馏」的区别

| 方法 | 改输出分布？ | 要重训？ |
|------|-------------|---------|
| 量化 / 蒸馏 | 通常改 | 常要 |
| 早退 / 层跳过 | 改 | 要 |
| **Speculative decoding** | **不改** | **不要** |

---

## 代码示例 1：接受–拒绝逻辑（纯 Python 玩具实现）

下面用离散词表演示 **speculative sampling** 如何保证与目标分布一致（忽略 autoregressive 上下文，只看单步）：

```python
import random

def speculative_sample_one_token(p: dict[str, float], q: dict[str, float]) -> str:
    """从目标分布 p 采样一个 token，但先用草稿分布 q 提议。"""
    # 1) 从草稿 q 提议
    tokens, probs = zip(*q.items())
    x = random.choices(tokens, weights=probs, k=1)[0]

    px, qx = p[x], q[x]
    # 2) 接受–拒绝
    if qx <= px:
        return x  # 直接接受
    if random.random() < px / qx:
        return x  # 按概率接受

    # 3) 拒绝：从 residual 分布重采
    residual = {t: max(0.0, p[t] - q[t]) for t in p}
    total = sum(residual.values())
    assert total > 0
    r = random.random() * total
    acc = 0.0
    for t, w in residual.items():
        acc += w
        if r <= acc:
            return t
    return tokens[-1]

# 玩具分布：目标更「保守」，草稿更「激进」
p = {"the": 0.5, "a": 0.3, "an": 0.2}
q = {"the": 0.2, "a": 0.5, "an": 0.3}

# 蒙特卡洛：输出频率应接近 p
from collections import Counter
cnt = Counter(speculative_sample_one_token(p, q) for _ in range(100_000))
for t in p:
    print(t, cnt[t] / 100_000, "~", p[t])
```

运行后 `"the"` 的频率会接近 0.5——即使草稿模型更偏爱 `"a"`。这就是论文 Section 2 里「stochastic speculative execution」的精髓。

---

## 代码示例 2：一轮 SpeculativeDecodingStep 骨架

```python
def speculative_decoding_step(prefix, M_p, M_q, gamma=4):
    """
    prefix: list[int] 已生成 token id
    M_p, M_q: callable(prefix) -> logits over vocab
    返回: 扩展后的 prefix（长度增加 1~gamma+1）
    """
    # --- A. 草稿串行猜 gamma 个 token ---
    drafts, q_probs = [], []
    cur = prefix
    for _ in range(gamma):
        q_logits = M_q(cur)
        x = sample(q_logits)          # x ~ softmax(q_logits)
        qx = prob(q_logits, x)
        drafts.append(x)
        q_probs.append(qx)
        cur = cur + [x]

    # --- B. 目标并行验证 gamma+1 个位置 ---
    # 工程上: 一次 forward，输入 [prefix, prefix+d1, ..., prefix+d1..dg]
    positions = [prefix] + [prefix + drafts[:i] for i in range(1, gamma + 1)]
    p_logits_list = M_p.forward_parallel(positions)  # len = gamma+1

    # --- C. 接受–拒绝 ---
    n_accept = 0
    for i in range(gamma):
        x = drafts[i]
        px = prob(p_logits_list[i], x)
        qx = q_probs[i]
        if qx <= px or random.random() < px / qx:
            n_accept += 1
        else:
            break

    if n_accept == gamma:
        t = sample(p_logits_list[gamma])
    else:
        p = softmax(p_logits_list[n_accept])
        q = one_hot(drafts[n_accept], q_probs[n_accept])  # 简写
        residual = normalize({k: max(0, p[k] - q.get(k, 0)) for k in p})
        t = sample_from_dict(residual)

    return prefix + drafts[:n_accept] + [t]
```

真实系统（vLLM / HuggingFace `assistant_model`）还会处理：**KV cache 复用**、**temperature / top-p**、**与 CUDA graph 的配合**。但控制流与上面一致。

---

## 代码示例 3：用 HuggingFace 开启 speculative decoding（工程入口）

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-hf")
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-7b-hf",
    device_map="auto",
)
draft = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-1b-hf",   # 更小 draft
    device_map="auto",
)

prompt = "The capital of France is"
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

out = model.generate(
    **inputs,
    max_new_tokens=128,
    assistant_model=draft,          # 启用 speculative decoding
    do_sample=True,
    temperature=0.7,
)
print(tokenizer.decode(out[0], skip_special_tokens=True))
```

`assistant_model` 参数背后就是 draft + target 的接受–拒绝循环；需 Transformers 较新版本且 draft/target **词表兼容**。

---

## 论文实验要点

| 场景 | 目标模型 | 近似模型 | 观察 |
|------|---------|---------|------|
| LM1B 无条件生成 | 97M GPT-like | 6M GPT-like | 38 token 句子仅 **9 次**大模型串行（Figure 1） |
| 英→德翻译 | T5-XXL 11B | 更小 T5 | **2–3×** vs T5X，输出相同 |
| 新闻摘要 | T5-XXL | 同上 | 同上 |
| 对话 | LaMDA 137B | 更小 LaMDA | 大模型仍受益 |

接受率 \(\alpha\) 随任务「确定性」变化：翻译、代码补全 \(\alpha\) 高；开放聊天 \(\alpha\) 低，加速比下降。

---

## 与后续工作的关系

```
Leviathan 2023 (线性 draft, Algorithm 1)
    ├── DeepMind Speculative Sampling (同期, 等价数学)
    ├── SpecInfer 2023 (draft 从「一条线」变「一棵树」)
    ├── Medusa 2024 (无独立 draft，多头同时猜)
    ├── EAGLE / EAGLE-2 (特征级 draft，接受率更高)
    └── 工业栈: vLLM, TensorRT-LLM, SGLang speculative 模块
```

读 Leviathan 是理解这一族的**最小充分起点**：后面的树验证、特征 draft、自投机（self-speculation）都是在「怎么提高 \(\alpha\) / 怎么并行验更多候选」上扩展，**分布无损的接受–拒绝核心不变**。

---

## 踩过的坑

1. **draft 与 target 必须 tokenizer / 词表一致**——否则 token id 无法对齐，接受率归零。
2. **\(\gamma\) 不是越大越好**——草稿错得越多，浪费的 target 并行算力越大；需按 \(\alpha\) 和 \(c\) 调参（论文 Figure 3 给最优 \(\gamma\) 曲线）。
3. **高 temperature 采样 \(\alpha\) 暴跌**——随机性大时小模型难猜中，加速比可能接近 1×。
4. **极短输出不划算**——每轮都有 draft + verify 固定开销，只生成几十个 token 时可能更慢。
5. **batch 推理 vs 单用户 latency**——speculative 主要减**单序列延迟**；离线大批量吞吐还需配合 continuous batching。
6. **别把「接受率高」当成「模型更准」**——只是说明 draft 与 target 在该上下文上**一致**，不是质量评价指标。

---

## 适用 vs 不适用

**适用：**

- 在线对话、翻译、摘要等 **latency 敏感**、输出较长的场景
- 已有**同族小模型**可作 draft（如 7B + 1B、XXL + Large）
- GPU 上 target forward **未算力饱和**（memory-bound  regime）

**不适用 / 收益有限：**

- 只有一个大模型、没有合适 draft
- 极短 completion（几个 token）
- 极高 temperature / 极度随机采样
- draft 与 target 分布差异极大（\(\alpha < c\)）

---

## 自测题

1. 为什么 speculative decoding 声称「输出分布不变」，而蒸馏小模型不能这样声称？
2. 若 \(\gamma=4\)、\(\alpha=0.8\)，粗算期望一轮接受多少 token？（用 \(\tau\) 公式）
3. 第一个草稿 token 被拒绝后，为什么后面 3 个草稿也要丢弃？
4. 接受–拒绝里「\(q \le p\) 则必接受」的直觉是什么？（提示：小模型低估的位置，目标「更想要」这个 token）

---

## 延伸阅读

- [arXiv:2211.17192](https://arxiv.org/abs/2211.17192) — 原文与 Algorithm 1
- [ICML 2023 proceedings](https://proceedings.mlr.press/v202/leviathan23a.html) — 正式出版页
- NVIDIA 技术博客 — [An Introduction to Speculative Decoding](https://developer.nvidia.com/blog/an-introduction-to-speculative-decoding-for-reducing-latency-in-ai-inference/)
- 本库笔记：[SpecInfer](./specinfer-2023.md)、[PagedAttention / vLLM](./paged-attention-vllm.md)

---

## 一句话总结

**Speculative Decoding = 小模型先猜 \(\gamma\) 步 + 大模型一次并行验 + 接受–拒绝保证同分布**——用「多出来的并行算力」换「更少的串行 forward」，在 T5-XXL 等模型上实现 **2–3× 无损加速**，且无需重训目标模型。
