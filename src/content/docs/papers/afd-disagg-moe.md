---
title: "AFD 设计空间探索 — MoE LLM 推理中的 Attention–FFN 解耦"
来源: https://arxiv.org/abs/2605.28302
日期: 2026-06-13
子分类: 共识与复制
分类: 分布式系统
provenance: pipeline-v3
---

## 从日常类比开始：快餐店的「前台」与「后厨」

想象一家连锁快餐店要同时服务三类顾客：

- **聊天顾客**：点单短、吃得快（短输入、短输出）。
- **写代码顾客**：点单长、要慢慢吃（长输入、中等输出）。
- **Agent 程序员**：带着一整本项目手册来点单（超长 prefix / KV，再续写很长）。

店里有两类工种，**天然不适合绑在同一张工位上**：

| 工种 | 像什么 | 瓶颈 |
|------|--------|------|
| **Attention（注意力）** | 前台收银 + 翻历史订单 | 要反复读「已点过的所有菜」（KV cache），**吃内存带宽** |
| **MoE FFN（专家前馈）** | 后厨多个 specialist 档口 | 大矩阵乘、专家路由，**吃算力**；还要在档口间**传菜**（dispatch/combine） |

最早大家把整家店当成一个单元排班（**聚合部署**）。后来有人把「高峰点单」和「慢慢出餐」分开（**Prefill–Decode 解耦，P/D**）。这篇论文问的是：**还能不能再拆一层？** 把前台和后厨放到**不同的 GPU 集群**上——这就是 **Attention–FFN Disaggregation（AFD）**。

论文 **《How Far Can Disaggregation Go? A Design-Space Exploration of Attention–FFN Disaggregation for Efficient MoE LLM Serving》**（arXiv:[2605.28302](https://arxiv.org/abs/2605.28302)，Georgia Tech / Intel / Google / NVIDIA，2026）用 **AIC++** 框架系统回答：**解耦能走多远？什么时候值得拆？Attention 和 FFN 各用多少张卡？**

一句话：**不是越拆越好——AFD 用更多 GPU 换更低延迟；在严格 SLO 下，它能让原本「根本跑不起来」的长上下文 MoE 服务变得可行。**

## 是什么

| 项目 | 内容 |
|------|------|
| 类型 | 系统设计 + 设计空间探索（DSE）论文 |
| 核心问题 | Chunked prefill、P/D、AFD 三层解耦，何时划算？ |
| 框架 | **AIC++** = AIConfigurator（算子级 GPU 建模）+ AstraSim（网络仿真） |
| 原型 | 基于 vLLM 的 AFD 实现（MxN 二分图 P2P 通信） |
| 评测硬件 | 128 x NVIDIA B200，TensorRT-LLM 后端 |
| 评测模型 | DeepSeek-V3.2、GPT-OSS-120B、Qwen3-235B、Nemotron3-120B |
| 关键数字 | 严格 TTFT/TPOT SLO 下，AFD 在 DeepSeek-V3.2 上可达约 **4k tokens/s** 系统吞吐；非 AFD 布局**不可行** |

论文不是发明 MoE 或 Attention，而是给集群架构师一张**「什么时候拆、拆多少」的地图**。三组对比：

| 配置 | DeepSeek-V3.2 Agentic | Qwen3-235B 长 Prefill | Nemotron3 长 Prefix |
|------|----------------------|----------------------|---------------------|
| Attention 瓶颈 | MLA+DSA 极便宜 → **2A+126F** | 稠密 GQA+长 KV → **28A+4F** | Mamba2 状态传播 → **96A+32F** |
| 显存节省 | 非 AFD infeasible | ~298 GiB → ~165 GiB | ~180 GiB 内可行 |

## 为什么重要

### 1. MoE 推理的异质性被「一整块 GPU」掩盖了

在一个 Transformer 块里：

- **Attention**：随上下文变长，KV cache 膨胀 → **memory-bound**（MHA / GQA / MLA / 稀疏注意力表现不同）。
- **MoE FFN**：Top-K 路由 + 大 GEMM → **compute-bound**，还要 **dispatch（A2F）** 和 **combine（F2A）** 通信。

把两者绑在同一组 GPU 上，必然有一方在等另一方——MegaScale-Infer 等先前工作已指出问题；本文进一步问：**和 TP/DP/EP、P/D 叠在一起时，AFD 的边界在哪？**

### 2. Agent 工作负载把「长 prefix + 严格延迟」推到极致

论文用三类代表负载（Table 1）：

| 场景 | Prefix | 输入 ISL | 输出 OSL |
|------|--------|----------|----------|
| Chat | 4k | 512 | 256 |
| Coding | 2k | 4k | 1k |
| Agentic Coding | **524k** | 256 | 8k |

Agent 场景下 prefix 极大，KV 常驻显存；同时用户仍要求 **TTFT**（首 token 时间）和 **TPOT**（每 token 延迟）达标。聚合部署常因**单卡显存上限**直接 infeasible。

### 3. 异构机房趋势让 AFD 从「学术玩具」变「基础设施原语」

NVIDIA Groq LPX、Rubin CPX、Intel/SambaNova 等方向都在做**节点内异构加速器**。AFD 天然匹配：**内存大的卡跑 Attention，算力强的卡跑 FFN**，把 Resource Heterogeneity 直接映射到拓扑上。

## 历史小故事

**MoE 与解耦的两条线索：**

- **1991 年**：Jacobs 等人提出 Mixture-of-Experts 思想 -- 用多个「专家网络」各管一块输入空间。
- **2017 年**：Shazeer 等人（Google Brain）把稀疏 MoE 引入 Transformer，用 Top-K 路由让每 token 只激活少数专家。
- **2021 年**：Switch Transformer 把 MoE 推到万亿参数；但推理时「单 GPU 装不下所有专家」成为新问题。
- **2023 年**：vLLM 提出 PagedAttention，让 KV cache 分页管理，显存利用率大幅提升；同年 Sarathi 引入 Chunked Prefill。
- **2024 年**：DistServe / Splitwise 提出 Prefill-Decode 解耦，把两种负载放到不同 GPU 池。
- **2025 年**：MegaScale-Infer（字节跳动）提出 Disaggregated Expert Parallelism + ping-pong pipeline，迈出 Attention-FFN 分离第一步。
- **2026 年**：本文以 **128x B200 规模 DSE** 系统回答「什么场景该拆、拆多少」，并给出 AIC++ 框架作为量化工具。

AFD 不是凭空冒出来的概念，而是 **MoE 越来越大、上下文越来越长、异构硬件越来越多** 这三股力量汇合后的必然产物。

## 核心要点

### 三层解耦：从粗到细

```
Level 0  聚合（Aggregated）
         同一组 GPU 顺序跑 prefill + decode + attention + FFN

Level 1  Chunked Prefill（如 Sarathi）
         把长 prefill 切块，与 decode 交错，减气泡

Level 2  P/D Disaggregation（如 Splitwise、DistServe）
         Prefill 池 与 Decode 池 分开扩缩

Level 3  AFD（Attention–FFN Disaggregation）
         Attention GPU 池 与 MoE-FFN GPU 池 分开扩缩
         每层两次跨池通信：A2F（dispatch）、F2A（combine）
```

**本文结论的高频模式：**

- **系统总吞吐（tokens/s）**：多数面板上 **聚合 + chunked prefill** 仍最强——全副本数据并行，并发高。
- **用户交互性（tokens/s/user，延迟）**：**AFD 在所有评测面板上都赢**——Attention/FFN 比例可按负载调。
- **长上下文 / 超大 prefix**：非 AFD 可能**不可行**；AFD 通过**权重分片 + KV 留在 Attention 侧**，把单卡峰值显存从约 **298 GiB 降到 ~165 GiB**（Qwen3-235B，1M prefix 案例）。

### AFD 一层四个流水线阶段

每层 MoE block 在 AFD 下被拆成四段（可 micro-batch 重叠）：

```
[1] Attention 计算     @ Attention GPU 池
[2] A2F / MoE-Dispatch @ 网络：fan-out，FFN 侧 ingress 易成瓶颈
[3] MoE-FFN 专家计算   @ FFN GPU 池
[4] F2A / MoE-Combine  @ 网络：fan-in，Attention 侧 ingress 易成瓶颈
```

非 AFD 时，dispatch/combine 只在参与 EP 的 GPU 之间对称交换；AFD 下变成 **M 个 Attention rank x N 个 FFN rank** 的**二分图全连接**（all-pairs），通信模式完全不同。

### Attention : FFN GPU 比例 = Rate Matching（速率匹配）

论文核心设计原则：**Attention 侧 GPU 只分配到「刚好跟得上 FFN 产出速率」为止**，其余 GPU 给 FFN。

影响因素：

- **注意力机制成本**：MLA + 稀疏注意力（DeepSeek-V3.2）→ Attention 便宜 → 极端 FFN-heavy（如 **2A+126F** on 128 GPU agentic）。
- **稠密 GQA + 长 KV**（Qwen3）→ Attention 变重 → 比例向 Attention 倾斜（如 **8A+120F**）。
- **Mamba2 混合**（Nemotron3）→ 长 prefix 要传播状态 → Attention-heavy（**96A+32F**）。

这不是拍脑袋的 50:50，而是 **per-token attention 算力 + KV/state 显存** 与 **FFN matmul 吞吐** 的联立平衡。

### Batch Overlap（BO）微批流水线

在全双工 NVLink / IB 上，AFD 可把 token budget 切成 **M 个 micro-batch**（M=4 对应四段流水线），让计算与通信重叠。稳态延迟近似：

\[
t_{\text{pipe}} = M \cdot s_{\max} + \sum_{i: s_i \neq s_{\max}} \frac{s_i}{L}
\]

其中 \(s_{\max}\) 是瓶颈阶段（Attention、A2F、FFN、F2A 之一）的单 micro-batch 成本，\(L\) 是层数。AIC++ 用 AIConfigurator 实测小 batch 的 kernel 成本，避免「线性外推」失真。

### 位置感知放置（Location-aware Placement）

高频的 **层内 A2F/F2A**（每层每请求都发生）应压在 **节点内 NVLink（scale-up）**；较低频的 **跨节点 KV 搬运**（P/D 场景）走 **InfiniBand（scale-out）**。乱摆 GPU 会导致 scale-out 链路上 A2F/F2A 拥塞，抵消 AFD 收益。

### AIC++ 框架：kernel 实测 + 网络仿真

在 128 GPU 规模上暴力试几百种配置不现实。AIC++ 三步：

1. 用 **AIConfigurator** 查表得到 Attention/FFN kernel 时间与显存；
2. 用 **AstraSim** 把 A2F/F2A 展开为**二分流量矩阵**，包级仿真拥塞；
3. 联合搜索 **TP / DP / EP / SP / PP + P/D + AFD 比例 + micro-batch 深度**。

## 实践案例

### 案例 1：用配置结构表达 AFD 副本布局

下面用 Python 风格伪代码描述论文中的 **replica 配置搜索空间**（非论文原文，但对应 AIC++ DSE 的枚举逻辑）：

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class AfdReplica:
    """一个推理副本：M 张 Attention GPU + N 张 FFN GPU"""
    attn_gpus: int          # M
    ffn_gpus: int           # N
    tp_attn: int
    tp_ffn: int
    ep_ffn: int             # 专家并行度，通常 <= ffn_gpus
    micro_batches: int = 4  # 四段 BO 流水线
    mode: Literal["agg", "pd_disagg", "afd", "pd_afd"] = "afd"

def is_memory_feasible(cfg: AfdReplica, model, workload) -> bool:
    """聚合 vs AFD 的 per-GPU 显存估算（论文 §4.1.3 思路）"""
    W, A, K, N, O = model.weight_gb, model.act_gb, workload.kv_gb, 8, 12
    if cfg.mode in ("agg", "pd_disagg"):
        m_shared = W + A + K + N + O
        return m_shared <= model.gpu_hbm_gb
    # AFD：权重/激活分到两侧，取较大者
    m_attn = model.attn_weight_gb + A + K + N + O
    m_ffn = model.ffn_weight_gb + A + N + O
    m_afd = max(m_attn, m_ffn)
    return m_afd <= model.gpu_hbm_gb

def rate_match_ratio(attn_cost_per_tok: float, ffn_cost_per_tok: float,
                     total_gpus: int) -> tuple[int, int]:
    """粗粒度 Attention:FFN 比例（教学用，非闭式最优解）"""
    # FFN 池大小 proportional to ffn_cost；Attention 只需跟上 FFN 发射速率
    ffn_share = ffn_cost_per_tok / (attn_cost_per_tok + ffn_cost_per_tok)
    n_ffn = max(1, round(total_gpus * ffn_share))
    n_attn = total_gpus - n_ffn
    return n_attn, n_ffn

# 例：DeepSeek-V3.2 agentic — MLA+DSA 使 attention 极便宜
cfg = AfdReplica(attn_gpus=2, ffn_gpus=126, tp_attn=1, tp_ffn=8, ep_ffn=126)
assert is_memory_feasible(cfg, model=DeepSeekV32(), workload=AgenticCoding())
print(rate_match_ratio(attn_cost_per_tok=0.2, ffn_cost_per_tok=9.8, total_gpus=128))
# -> 约 (2, 126)，与论文 DSE 最优同量级
```

要点：**`is_memory_feasible`** 解释为何 1M prefix 下聚合模式 infeasible；**`rate_match_ratio`** 解释为何会出现反直觉的 2A+126F。

### 案例 2：单层 AFD 前向与 A2F/F2A 通信骨架

对应论文 §6.1 vLLM 原型：**router 在 Attention 侧**，MxN NCCL pair-group，FFN 只算本地专家分片：

```python
import torch
import torch.distributed as dist

class AfdMoELayer:
  def __init__(self, attn_rank: int, ffn_rank: int, num_attn: int, num_ffn: int):
    self.attn_rank = attn_rank
    self.ffn_rank = ffn_rank
    self.is_attn = ffn_rank is None
    # 每个 (attn_i, ffn_j) 一对一个 NCCL group -- 共 M*N 组
    self.pair_group = self._bootstrap_pair_group(attn_rank, ffn_rank)

  def forward_attn(self, hidden, router, shared_experts):
    """Attention 侧：算 attention + 路由 + shared experts"""
    x = self.attention(hidden)
    topk_idx, topk_w = router(x)          # [tokens, k]
    shared_out = shared_experts(x)
    partials = []
    for j in range(self.num_ffn):
      payload = pack_dispatch(x, topk_idx, topk_w)   # hidden + ids + metadata
      if j == self.ffn_rank:
        recv = payload
      else:
        recv = p2p_send_recv(payload, peer_ffn=j, group=self.pair_group[j])
      partials.append(recv)
    # FFN 返回 partial 后 attention 侧 reduce
    y = sum_partial_ffn_outputs(partials) + shared_out
    return y

  def forward_ffn(self, recv_payload, local_expert_fn):
    """FFN 侧：只跑本 rank 上的专家 shard"""
    tokens = filter_tokens_for_local_experts(recv_payload, self.local_expert_ids)
    out = local_expert_fn(tokens)
    return p2p_send_recv(out, peer_attn=self.attn_rank, group=self.pair_group)

def p2p_send_recv(tensor, peer, group):
  """NCCL send/recv on bipartite link -- A2F fan-out / F2A fan-in 的基础原语"""
  if dist.get_rank() < peer:
    dist.send(tensor, dst=peer, group=group)
    return None
  buf = torch.empty_like(tensor)
  dist.recv(buf, src=peer, group=group)
  return buf
```

论文强调：**MoE 路径上不应再有 FFN<->FFN collective**；所有跨 worker 流量都在 **Attention<->FFN 二分图** 上。生产向库如 **StepMesh** 也采用类似 P2P 拓扑。

### 评测结论速查

**SLO 严格时：只有 AFD 能「活下来」**

Figure 2：DeepSeek-V3.2 @ 128 B200，Chat/Coding/Agentic 分别要求 TTFT < 50/100/150 ms、TPOT <= 15 ms。非 AFD 搜索结果为 **infeasible（红叉）**；**Agg+AFD** 或 **P/D+AFD** 可达约 **4k tokens/s**。

**吞吐 vs 交互性的 Pareto 前沿（Figure 5）**

| 优化目标 | 常胜策略 | 原因 |
|----------|----------|------|
| **系统总吞吐** | 聚合 + chunked prefill，多副本 8 GPU EP | 全模型副本并行吞请求 |
| **单用户延迟 / 交互性** | AFD + micro-batch overlap | 独立定标 M:N，削瓶颈等待 |
| **超长上下文** | Agg+AFD 或 P/D+AFD | 显存分片 + BO |

**长上下文案例（Figure 6，Qwen3-235B @ B200）**

- **ISL=500k, OSL=10k**：最优 **Agg+AFD M4**，128 GPU 约 **2693 tok/s**，布局 **28A+4F**（7:1 Attention-heavy，长 prefill 吃 Attention）。
- **Prefix=1M, ISL=4k, OSL=500**：非 AFD **不可行**（~298 GiB > 180 GiB）；AFD ~165 GiB 可放下，128 GPU 上 **Disagg+AFD** 略胜。

## 踩过的坑

论文揭示的 AFD 陷阱和经验教训：

1. **不要盲目全集群 AFD**：AFD 不是默认最优——每个 AFD 副本占用 M+N 张 GPU，总并发度低于聚合模式。吞吐场景下保留聚合副本才是理性选择。
2. **通信放错层代价极高**：A2F/F2A 是每层每请求都发生的高频流量。如果错放在 InfiniBand（scale-out）而非 NVLink（scale-up）上，网络拥塞会抵消 AFD 所有收益。
3. **Baidu 相关工作的警告**（arXiv:2602.09721）：AFD 存在「死区」-- 当互联带宽成为瓶颈时，增加 FFN 实例反而无法提升利用率。AFD 在 Superpod 级硬件上才真正发光。
4. **AIC++ 是建模结果而非生产 trace**：集群结果来自 AIConfigurator + AstraSim 仿真，非全线上的端到端生产测量。生产部署需额外验证 NUMA、PCIe 拓扑、NUMA 亲和性等因素。
5. **评测集中在 B200 + FP8 MoE**：其他加速器（NPU、Groq、SambaNova 等异构节点）需要扩展 AIC++ 算子建模。
6. **Router 放在哪一侧影响通信量**：论文原型把 router 放在 Attention 侧；若放 FFN 侧，A2F 只需传 hidden + topk_ids（更小），但 FFN 侧需要完整模型权重访问。这是未完全探索的 tradeoff。

## 适用

AFD 最适合以下场景：

| 场景 | 信号 | 不适用信号 |
|------|------|-----------|
| **严格 TTFT/TPOT SLO** | 用户要求 < 50ms 首 token，< 15ms 每 token | 离线批处理，无延迟要求 |
| **长上下文 Agent 负载** | Prefix > 100k tokens，KV cache 塞爆显存 | 短对话，prefix < 4k |
| **MLA/稀疏 Attention 模型** | DeepSeek-V3 系列，Attention 成本极低 | 稠密 Attention + 短 KV（Attention 已是瓶颈） |
| **Superpod / NVLink 全互联** | 节点内带宽 >= 900 GB/s | 以太网互联，带宽 < 100 GB/s |
| **MoE 模型 + 多专家** | 专家数 >> 卡数，EP 天然需要通信 | 稠密模型（无需专家路由） |

一句话决策口诀：「长 prefix + 严延迟 + MoE + NVLink → AFD；短请求 + 高吞吐 → 聚合。」

## 学到什么

1. **解耦不是目的，是手段**：AFD 用更多 GPU 换更低延迟和长上下文可行性；如果吞吐是唯一目标，聚合仍是首选。
2. **Rate Matching 是核心直觉**：「让 Attention 刚好跟得上 FFN」而不是均分 GPU，这是不同于传统 TP/DP 的全新维度。
3. **通信拓扑决定架构边界**：AFD 把 EP 内对称 All-to-All 变成 MxN 二分图 P2P，这决定了通信瓶颈的位置（A2F fan-out ingress / F2A fan-in ingress）。
4. **显存预算要从「共享」思维切换到「各自算」**：`max(M_attn, M_ffn)` 而非 `M_shared`——这是长上下文可行性的关键。
5. **硬件异构化是 AFD 的最大推手**：如果所有 GPU 都同质，AFD 只是增加通信开销；GPU 内存/算力越分化的集群，AFD 收益越大。
6. **建模先行、部署在后**：128 GPU 暴力搜索不现实，AIC++ 的 kernel 实测 + 网络仿真方法论本身也是可复用的工程实践。

## 延伸阅读

- 论文 HTML：[arXiv:2605.28302](https://arxiv.org/html/2605.28302v1)
- vLLM AFD PR：[vllm-project/vllm#29772](https://github.com/vllm-project/vllm/pull/29772)
- StepMesh（AFD 通信库）：[stepfun-ai/StepMesh](https://github.com/stepfun-ai/StepMesh)
- AIConfigurator 论文：[arXiv:2601.06288](https://arxiv.org/abs/2601.06288)
- NVIDIA Blog -- Removing Guesswork from Disaggregated Serving：[developer.nvidia.com](https://developer.nvidia.com/blog/removing-the-guesswork-from-disaggregated-serving/)

## 关联

| 工作 | 关系 |
|------|------|
| [MegaScale-Infer (2504.02263)](https://arxiv.org/abs/2504.02263) | 字节跳动；提出 disaggregated expert parallelism + ping-pong pipeline；本文在其上系统量化 **何时 AFD + P/D + 并行策略叠加** |
| [PagedAttention / vLLM (2309.06180)](https://arxiv.org/abs/2309.06180) | KV 分页；本文 AFD 原型基于 vLLM，PR #29772 |
| [DistServe / Splitwise](https://arxiv.org/abs/2401.09670) | P/D 解耦基线 |
| [Theoretically Optimal Attention/FFN Ratios (2601.21351)](https://arxiv.org/abs/2601.21351) | 互补理论工作：闭式 A/F 比例；本文用大规模 DSE + 网络仿真验证多模型多负载 |
| [AIConfigurator (2601.06288)](https://arxiv.org/abs/2601.06288) | AIC++ 的算力建模底座 |
| [AFD Challenges (2602.09721)](https://arxiv.org/abs/2602.09721) | Baidu 相关工作：指出 AFD 在标准集群互联带宽不足时的「死区」 |

## 反向链接

- 本库相关笔记：[megatron-core-moe-2026](/docs/papers/megatron-core-moe-2026) -- Megatron-Core MoE 并行策略
- [paged-attention-vllm](/docs/papers/paged-attention-vllm) -- vLLM KV cache 分页管理
- [expertflow-moe-offload](/docs/papers/expertflow-moe-offload) -- MoE 专家卸载策略
