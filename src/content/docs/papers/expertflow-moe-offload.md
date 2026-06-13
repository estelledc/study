---
title: ExpertFlow — MoE 预测式专家缓存与 Token 调度（零基础学习笔记）
来源: https://arxiv.org/abs/2410.17954
日期: 2026-06-13
子分类: ML 系统
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：专科会诊 vs 临时借书

想象你要在一间**只有四张手术台**的小诊所（单卡 GPU，显存有限）里，运行一座**拥有 128 个专科科室**的超大型联合医院（MoE 大模型）。

MoE 的聪明之处在于：每个病人（token）每次只去 **Top-K 个科室**会诊——算力上很省。但问题是：**全部科室的设备和档案都要存在某处**。128 个专家 × 32 层，总参数量轻松超过单卡显存（Mixtral-8×7B 约 96 GB，A100 只有 80 GB）。

常见做法是 **Offloading（卸载）**：把暂时不用的专家放在 CPU 内存里，需要时再搬到 GPU——像把大部头书放在仓库，用时临时借到阅览室。

但这样会遇到三个现实麻烦：

1. **不知道下一页要借哪本书**：路由（router）决定每个 token 去哪个专家，只有算到那一层才知道——若等算完再搬，GPU 在等 I/O。
2. **病人排班太散**：两个 batch 各 4 个 token，每人去不同科室，结果**四个科室各只来 1 个病人**——专家 kernel 启动成本固定，利用率极低。
3. **阅览室书架按「最近用过」腾位（LRU）**：MoE 路由是**输入相关、动态变化**的，LRU 经常猜错，专家在 CPU/GPU 之间来回折腾。

**ExpertFlow**（He 等，**DAC 2026**，arXiv:[2410.17954](https://arxiv.org/abs/2410.17954)）的做法像给诊所配了三个协同岗位：

- **Routing Path Predictor (RPP)**：值班秘书提前看完整病历，**一次预测**所有层会激活哪些科室；
- **Token Scheduler (TS)**：把「会去同一组科室」的病人**合并排班**，让每个 batch 少开科室、每个科室多来人；
- **Expert Cache Engine (ECE)**：按预测**预取**专家到 GPU，算错了再**轻量纠错**。

论文在单卡 A40 上报告：GPU 峰值显存最高降 **93.72%**，相对强 offloading 基线吞吐最高 **10×**；缓存命中率 **91.96%**，比 LRU 高最多 **61.15%**。

一句话：**MoE 单卡推理的关键不是「能不能 offload」，而是「能不能提前知道要 load 谁、怎么排 token、怎么管缓存」。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 全称 | ExpertFlow: Efficient Mixture-of-Experts Inference via Predictive Expert Caching and Token Scheduling |
| 会议 | DAC 2026（ACM/IEEE 设计自动化会议） |
| 机构 | A*STAR、港科大、哈工大（深圳）、南洋理工等 |
| 问题域 | **单 GPU / 显存受限**场景下的 MoE **推理** offloading |
| 对比基线 | Cache-MoE（LRU）、SE-MoE（环缓冲）、Pregated-MoE 等 |
| 验证模型 | Switch-32/64/128、Mixtral-8×7B、Qwen1.5-MoE、DeepSeek-MoE |
| 与压缩正交 | 可与量化、剪枝、蒸馏叠加，进一步省显存 |

ExpertFlow 是**系统层**工作，不改 MoE 模型权重或路由算法本身，而是在 CPU–GPU 异构内存之上做**预测 + 调度 + 缓存**的协同设计。

---

## 为什么重要

### 1. MoE 的「参数墙」与「算力墙」分离

Dense 模型：参数量 ≈ 每 token 计算量。MoE：**总参数巨大**，但每 token 只激活一小部分——显存要装下**全部专家**，计算却只跑**少数专家**。单卡部署 Mixtral、Qwen-MoE、DeepSeek-MoE 时，瓶颈往往是**显存装不下**，不是 FLOPs 不够。

### 2. 动态路由让传统缓存失效

LRU / LFU 按「最近/最常使用」驱逐，**不看输入内容**。MoE 的 expert 激活是 **token × layer 相关**的——同一模型在不同任务上路由模式差异很大。固定「每层分 N 个缓存槽」的策略（如 Cache-MoE）在 batch 变大、专家变多时命中率骤降。

### 3. 预测必须「全局、提前、便宜」

已有方案的两难：

| 路线 | 代表 | 问题 |
|------|------|------|
| 回归 router 分数 | Pregated-MoE | 分数误差影响输出质量，需大量微调 |
| 逐层 MLP 预测 | ProMoE | 必须等上一层算完才知道下一层，无法提前 prefetch |
| 启发式统计 | token–expert 频率 | 轻量但捕捉不了输入相关路由 |

ExpertFlow 的 RPP 用 **T5 式 encoder–decoder**，**一次前向**输出形状 `(B, S, L, E)` 的全局路由概率，模型仅 **7.21 MB**，batch 级准确率可达 **95%** 量级。

### 4. 与 PagedAttention / vLLM 的互补关系

- **vLLM / PagedAttention**：解决 **KV cache** 的显存碎片与共享（attention 侧）。
- **ExpertFlow**：解决 **专家权重** 在 CPU/GPU 之间的动态搬运（MoE FFN 侧）。

大 MoE  serving 要同时管 KV 和 expert——二者正交，可叠加。

---

## 核心概念

### 1. MoE 路由回顾

对输入 token 向量 \(x\)，router 计算 \(G(x) = \text{softmax}(x W_g)\)，选 Top-K 专家，输出为选中专家的加权和：

\[
y = \sum_{i \in \text{TopK}(G(x))} G_i(x)\, E_i(x)
\]

每个 token 的路由路径可编码为二元矩阵 \(r \in \{0,1\}^{L \times E}\)：第 \(l\) 层第 \(e\) 个专家若被激活则为 1。

### 2. Routing Path Predictor (RPP)

**架构**：T5 风格 encoder 嵌入整段输入，decoder 挂 **L 个轻量 head**，每层输出 E 维 logits → sigmoid 得概率矩阵 \(p\)。

**训练**：从 MoE 推理日志收集 token 的真实路由 \(r\)，多标签二分类，损失为逐层逐专家的 **BCE**：

\[
\mathcal{L} = \frac{1}{LE}\sum_{l=1}^{L}\sum_{e=1}^{E}\left[r_{l,e}\log p_{l,e} + (1-r_{l,e})\log(1-p_{l,e})\right]
\]

**关键性质**：在**第一个 MoE 层执行之前**就得到全层路由计划 → 支持 ECE 预取与 TS 重排。

**数据**：每个 (任务, 模型) 组合采样 1 万序列 × 3 次解码，得约 3 万条 (输入, 输出, 路由路径) 三元组。

### 3. Token Scheduler (TS)

**动机（最坏情况）**：2 个 batch、每层 4 专家、每 batch 4 token，若每人去不同专家 → **每层 4 个专家各只处理 1 token**，kernel 效率极低且缓存频繁换入换出。

**目标**：合并相邻两个 batch 的 \(2T\) 个 token，分成两个等规模新 batch \(\mathcal{T}_1, \mathcal{T}_2\)，最小化两 batch 激活专家总数：

\[
\min_{\mathcal{T}_1,\mathcal{T}_2}\;\sum_{l=1}^{L}\sum_{e=1}^{E}\big(R_1^{l,e}+R_2^{l,e}\big),\quad R_k = \bigvee_{i\in\mathcal{T}_k} r_i
\]

**近似算法**：对路由路径算 Hamming 相似度矩阵，用 **K-means 风格**聚成 2 簇，CPU 开销 < 10 ms。

**KV 一致性**：重排 token 会破坏原 KV cache 顺序 → TS 提供 **Merge**（按全局顺序重建 KV）和 **Reindex**（更新 token 索引）。

**Dual-Batch Pipeline**：每 2 个 batch 为一调度单元；当前单元做 prefill/decode 的同时，**并行**对下一单元跑 RPP + TS，隐藏预测开销。

### 4. Expert Cache Engine (ECE)

由两部分组成：

#### PLEC（Predictive Locality-aware Expert Caching）

与 LRU「每层固定槽位、按时间驱逐」不同，PLEC **跨层动态分配**缓存槽，并按 RPP 预测 **prefetch** 下一阶段需要的专家。

**例子**（论文 Fig. 5）：2 层 × 每层 4 专家，GPU 只能缓存 4 个专家；预测需 5 个 → 按预测需求给 layer-1 分 3 槽、layer-2 分 1 槽，先加载 \(e_{12}, e_{13}, e_{14}, e_{22}\)；layer-1 算完后释放槽位，异步加载 \(e_{23}\)。

#### Real-time Correction

预测错误时（多加载了不需要的专家、漏了需要的专家），在**当前专家计算进行时**做**优先级交换**，I/O 与计算 overlap，避免流水线 stall。

### 5. 系统流水线总览

```text
输入 batches
  → [RPP]  一次预测 (B,S,L,E) 路由概率
  → [TS]   跨 batch 重排 token，合并相似路由
  → [ECE]  PLEC 预取 + 运行时纠错
  → [MoE]  仅加载所需专家，在 GPU 上执行
         （Dual-Batch：与下一批的 RPP/TS 并行）
```

---

## 代码示例 1：理解 MoE 路由与路由路径矩阵

下面用 PyTorch 风格伪代码说明「一个 token 的路由路径」如何编码——这是 RPP 训练标签和 TS 聚类的共同基础。

```python
import torch
import torch.nn.functional as F

def moe_route_and_encode_path(x, router, num_experts: int, top_k: int):
    """
    x: (hidden,) 单个 token 的隐藏状态
    router: Linear(hidden, num_experts)
    返回: top_k 专家索引, 路由权重, 路径矩阵 r ∈ {0,1}^{L×E} 的单层切片
    """
    logits = router(x)                       # (E,)
    probs = F.softmax(logits, dim=-1)
    weights, indices = torch.topk(probs, top_k)

    r_layer = torch.zeros(num_experts, dtype=torch.bool)
    r_layer[indices] = True                  # 被激活的专家置 1
    return indices, weights, r_layer


def batch_routing_matrix(token_paths: list[torch.Tensor]) -> torch.Tensor:
    """
    token_paths: 长度为 T 的列表，每个元素 shape (L, E)
    批级路由 = 所有 token 路径的逻辑 OR（与论文 R_batch 定义一致）
    """
    stacked = torch.stack(token_paths, dim=0)  # (T, L, E)
    return stacked.any(dim=0)                  # (L, E)


# 示例：4 层 MoE，每层 8 专家，2 个 token
L, E, top_k = 4, 8, 2
paths = []
for _ in range(2):
    layer_paths = []
    for _ in range(L):
        fake_router = torch.randn(E)
        _, _, r = moe_route_and_encode_path(
            torch.randn(512),
            lambda x: fake_router,  # 简化：直接用随机 logits
            E,
            top_k,
        )
        layer_paths.append(r)
    paths.append(torch.stack(layer_paths))     # (L, E)

R_batch = batch_routing_matrix(paths)
print("本 batch 激活专家数:", R_batch.sum().item())
```

TS 的目标就是：把多个 batch 的 token **重新分组**，使分组后的 `R_batch` 之和更小——更少专家被同时激活。

---

## 代码示例 2：RPP 训练损失与 TS 的 Hamming 聚类骨架

```python
import torch
import torch.nn as nn

class RoutingPathPredictorLoss(nn.Module):
    """论文 Eq.(1)：全层全专家 BCE，与 ExpertFlow RPP 训练目标一致"""

    def forward(self, p: torch.Tensor, r: torch.Tensor) -> torch.Tensor:
        # p, r: (B, S, L, E)，概率 vs 0/1 标签
        eps = 1e-8
        bce = -(r * torch.log(p + eps) + (1 - r) * torch.log(1 - p + eps))
        return bce.mean()  # 等价于对 L,E 求平均


def hamming_distance(path_a: torch.Tensor, path_b: torch.Tensor) -> int:
    """两个 token 路由路径的 Hamming 距离（展平 L×E 后比较）"""
    return (path_a != path_b).sum().item()


def schedule_two_batches(token_paths: list[torch.Tensor], max_iter: int = 20):
    """
    简化版 TS：2T 个 token 分成两个等大小 batch，最小化激活专家数。
    token_paths[i]: (L, E) bool
    论文用 K-means 风格迭代；此处用贪心 swap 示意。
    """
    T2 = len(token_paths)
    assert T2 % 2 == 0
    half = T2 // 2
    # 初始：前 half / 后 half
    assign = [0] * half + [1] * half

    def objective(assignment):
        groups = [[], []]
        for idx, g in enumerate(assignment):
            groups[g].append(token_paths[idx])
        total = 0
        for g in groups:
            if not g:
                continue
            R = torch.stack(g).any(dim=0)
            total += R.sum().item()
        return total

    best = assign[:]
    best_obj = objective(best)
    for _ in range(max_iter):
        improved = False
        for i in range(T2):
            for j in range(i + 1, T2):
                if assign[i] == assign[j]:
                    continue
                trial = best[:]
                trial[i], trial[j] = trial[j], trial[i]
                obj = objective(trial)
                if obj < best_obj:
                    best_obj, best = obj, trial
                    improved = True
        if not improved:
            break
    return best, best_obj


# 演示
L, E = 12, 32
paths = [torch.rand(L, E) > 0.9 for _ in range(8)]  # 稀疏随机路径
assign, obj = schedule_two_batches(paths)
print("重排后两 batch 总激活专家数:", obj)
```

真实系统中 TS 用相似度矩阵 + K-means 近似，保证 **< 10 ms**；并与 **Merge/Reindex** 维护 KV cache 语义正确。

---

## 代码示例 3：PLEC 缓存槽分配（概念示意）

```python
from dataclasses import dataclass

@dataclass
class ExpertSlot:
    layer: int
    expert_id: int


def plec_allocate_slots(
    predicted_demand: dict[int, int],  # layer -> 预测激活专家数
    cache_capacity: int,
) -> dict[int, int]:
    """
    按预测需求比例分配跨层缓存槽（PLEC 核心思想）。
    predicted_demand: 如 {0: 3, 1: 2} 表示两层分别需 3、2 个专家槽
    """
    total_demand = sum(predicted_demand.values())
    if total_demand <= cache_capacity:
        return predicted_demand

    # 需求超过容量：按预测比例分配整数槽位
    slots = {}
    remaining = cache_capacity
    layers = sorted(predicted_demand.keys())
    for i, layer in enumerate(layers):
        if i == len(layers) - 1:
            slots[layer] = remaining
        else:
            share = max(1, round(
                cache_capacity * predicted_demand[layer] / total_demand
            ))
            share = min(share, remaining - (len(layers) - i - 1))
            slots[layer] = share
            remaining -= share
    return slots


# 预测需 5 个专家，GPU 只能放 4 个
demand = {0: 3, 1: 2}
print(plec_allocate_slots(demand, cache_capacity=4))
# 可能输出 {0: 3, 1: 1} — 优先保证近层/高需求层
```

算完一层后，释放的槽位用于 **异步 prefetch** 下一层预测专家；若实际路由与预测不符，ECE 在 expert kernel 运行期间做 **swap 纠错**。

---

## 实验结果速览

**硬件**：单卡 NVIDIA A40（48 GB）+ Intel Xeon Gold 6338。

| 场景 | 亮点 |
|------|------|
| Switch-128, WMT16, CS=4 | 相对 SE-MoE **9.99×** 吞吐 |
| Switch 系列 CS=16, BS=32 | 相对 SE-MoE **2.01× / 3.19× / 5.86×**（32/64/128 专家） |
| Mixtral-8×7B | AIG 基线 OOM → ExpertFlow **15.99 GB** 可跑 |
| Qwen1.5 跨域 RPP | 相对 Cache-MoE 最高 **2.21×** |
| 显存 | Switch-128: **15.26 GB → 1.03 GB**（约 93% 降幅） |
| RPP 准确率 | 多数 in-domain **>90%**；Qwen1.5 **>95%** |
| PLEC vs LRU | 命中率 **91.96%** vs LRU 最高约 76%（Switch-32） |
| 仅 TS 消融 | Switch-128 吞吐 **+17%**（1.17×） |

**Cache size (CS)**：GPU 上能同时驻留的专家数。**Batch size (BS)** 越大，TS 合并相似路由的收益越明显。

---

## 与相关工作的关系

| 方法 | 思路 | ExpertFlow 差异 |
|------|------|-----------------|
| **Cache-MoE** | 每层固定 LRU 缓存 | 无预测，输入相关路由下命中率低 |
| **SE-MoE** | 环缓冲预载连续两层全部专家 | 专家多时内存开销大，常加载未激活专家 |
| **Pregated-MoE** | MLP 预测 router 分数 | 分数误差伤质量；非离散专家选择 |
| **ProMoE** | 学习型预测 + 缓存 | **逐层**预测，无法最早 prefetch |
| **FlexGen / Lamina** | Dense LLM offloading | 未针对 MoE 动态路由 |
| **量化 / 剪枝** | 缩小单个专家 | 正交；ExpertFlow 管「搬不搬、何时搬」 |

---

## 局限与未覆盖点

1. **预测器训练成本**：需先跑 MoE 收集路由路径数据集（每配置约 3 万样本）；跨模型需重新训练或验证泛化。
2. **预测错误**：靠 ECE 运行时纠错，极端 mispredict 仍可能增加 I/O stall。
3. **实现复杂度**：Dual-Batch Pipeline、KV Merge/Reindex、异步 prefetch 对推理引擎侵入较大——论文侧重系统设计，**开源实现需自行跟进**（截至笔记写作时以 arXiv / DAC 论文为主）。
4. **场景边界**：实验聚焦 **单 GPU offloading**；多卡 EP、训练阶段、与 speculative decoding 的组合未充分展开。
5. **与 MoE 架构绑定**：Top-1（Switch）与 Top-2/Top-6（Mixtral、DeepSeek）路由机制不同，RPP 需 per-model 适配。

---

## 自测题

1. MoE offloading 的三类瓶颈是什么？ExpertFlow 各用哪个组件应对？
2. 为什么 LRU 在 MoE 推理上不如 PLEC？举一个「4 层 × 4 专家、缓存 8 槽」的例子。
3. RPP 与 ProMoE 式逐层预测的本质区别是什么？对 prefetch 窗口有何影响？
4. TS 优化目标式 (2) 中，batch 级路由矩阵为什么用逻辑 OR 聚合 token？
5. Dual-Batch Pipeline 如何隐藏 RPP/TS 延迟？

<details>
<summary>参考答案（先自测再展开）</summary>

1. **预测不准/太晚** → RPP；**专家利用率低**（每专家 token 太少）→ TS；**缓存命中率低** → ECE（PLEC + 纠错）。
2. LRU 每层均分 2 槽；若某步每层 4 专家全激活，则持续 swap。PLEC 可按预测把 8 槽全给前两层最可能用到的 8 个专家，并随层推进异步换入第三层。
3. RPP **一次**输出全 `(L,E)` 计划；ProMoE 需层序执行才知道后续层 → ExpertFlow 可在 **第一层 MoE 之前**开始 prefetch。
4. batch 内任一 token 用到某专家，该专家就必须在该 batch 的 GPU 上可用；OR 表示「本 batch 所需专家集合」。
5. 当前两 batch 在 GPU 计算时，CPU/GPU 侧并行对**下一**两 batch 跑 RPP+TS，避免预测阻塞主推理路径。

</details>

---

## 进一步阅读

- 论文：[arXiv:2410.17954](https://arxiv.org/abs/2410.17954)（HTML 版含完整方法图）
- MoE 训练系统：[Megatron Core MoE 笔记](./megatron-core-moe-2026.md)
- KV 侧显存管理：[PagedAttention / vLLM 笔记](./paged-attention-vllm.md)
- 基线 Cache-MoE：[Fast inference of mixture-of-experts language models with offloading](https://arxiv.org/abs/2312.17238)
- 逐层预测对比：ProMoE ([2410.22134](https://arxiv.org/abs/2410.22134))

---

## 一句话总结

ExpertFlow 把 MoE 单卡推理从「算到哪层、再慌慌张张搬专家」变成「**先预测全局路由 → 重排 token 提高专家负载 → 预测式缓存 + 算时纠错**」的三段式流水线，在几乎不碰模型权重的前提下，用 **7 MB 级 RPP** 撬动 **10× 级吞吐** 与 **90%+ 级显存节省**——是 **MoE × 异构内存 × 预测调度** 的系统共设计范例。
