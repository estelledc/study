---
title: Sarathi-Serve — 驯服 LLM 推理中的吞吐与延迟权衡
来源: https://arxiv.org/abs/2403.02310
日期: 2026-06-13
子分类: ML 系统
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：火锅店里的「备菜」与「涮肉」

想象一家热门火锅店（GPU 推理服务）同时服务两类动作：

1. **Prefill（备菜）**：新客人点了一整桌食材（长 prompt，几百到几千 token）。后厨要把所有菜洗好、切好、摆盘（并行处理全部输入 token，写出 **KV cache**，产出**第一个输出 token**）。这一步像**大火爆炒**——灶台火力打满，但**一桌备菜可能要 5 分钟**，期间别的桌如果只能干等，体验就崩了。
2. **Decode（涮肉）**：客人已经开吃，每 30 秒要**续一勺汤、加一片肉**（每步只生成 1 个 token）。动作很快，但**要不停翻账本**（读全量 KV cache + 模型权重）——瓶颈在**显存带宽**，不在算力。多桌一起涮（大 batch）能摊薄成本，吞吐涨得很快。

**传统 vLLM / Orca 的调度**像「只要来了新客人备菜，就暂停所有桌的续汤」：

- 一桌 16K token 的长文档总结进来 → 所有正在流式聊天的用户**字流停几秒**（论文称为 **generation stall**）。
- 为了照顾续汤体验，你又不敢开大 batch → **吞吐上不去**。

**Sarathi-Serve**（OSDI 2024，微软研究院等）的做法是：

- 把长备菜**切成等大小的小份**（**chunked prefill**），每份只占一个「前向迭代」的时间预算。
- 每个迭代 = **所有正在 decode 的请求** + **至多一块 prefill chunk**（**stall-free batching / hybrid batch**）。
- 因为 decode 阶段 GPU **算力有空闲**（memory-bound），prefill chunk 的矩阵乘可以「搭便车」塞进去，**不让 decode 停下来等**。

一句话：**不是让 GPU 更快，而是让长 prompt 不再 hijack 整个 batch——在单卡混批场景下同时拉高吞吐、压平 TBT（Time-Between-Tokens）尾延迟。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | *Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve* |
| 会议 | **OSDI 2024** |
| arXiv | [2403.02310](https://arxiv.org/abs/2403.02310) |
| 作者 | Amey Agrawal, Nitin Kedia, Ashish Panwar 等（Georgia Tech + Microsoft Research India） |
| 前身 | [Sarathi (2023)](https://arxiv.org/abs/2308.16369) — 面向**离线吞吐**的 chunked prefill + decode-maximal batching |
| 开源 | [github.com/microsoft/sarathi-serve](https://github.com/microsoft/sarathi-serve)（fork 自早期 vLLM，研究原型） |
| 工业落地 | vLLM v0.4+ 默认 **enable_chunked_prefill**；与 PagedAttention 正交叠加 |

Sarathi-Serve 解决的是 **colocated（同卡混批）** 在线服务里的经典矛盾：**batch 越大吞吐越高，但 prefill 与 decode 交错会让 TBT 尾延迟爆炸。**

---

## 为什么重要

不理解 Sarathi-Serve，下面几件事很难讲清楚：

- 为什么 ChatGPT 类产品在**高负载**下仍能保持**逐字稳定流出**（而不是每隔几秒卡一下）。
- 为什么 2024 年后 LLM serving 论文几乎都把 **chunked prefill** 当 baseline，和 **PD 分离**（DistServe、Splitwise）构成两条主流路线。
- 为什么 vLLM 文档里 `max_num_batched_tokens` 同时影响**吞吐**和 **P99 TBT**——它本质上是 Sarathi 的 **token budget / chunk size** 旋钮。
- 为什么 **pipeline parallelism** 上大模型（Falcon-180B）特别怕「prefill 迭代 vs decode 迭代」耗时差异——Sarathi 的 **uniform batch** 能减少 pipeline bubble。

---

## 核心概念

### 1. 两阶段推理与三个指标

```text
用户 prompt (N tokens)
  → [Prefill]  并行处理全部（或一块 chunk）prompt → 第 1 个 output token + 写 KV cache
  → [Decode]   循环：每步 1 token，读全量 KV + 权重 → 直到 EOS

用户感知延迟 ≈ TTFT + TBT × (输出长度 - 1)
```

| 指标 | 含义 | Sarathi-Serve 侧重 |
|------|------|-------------------|
| **TTFT** | 从请求到达到**第一个 token** | chunk 会略增 TTFT（多轮才能吃完 prompt） |
| **TBT** | 相邻输出 token 之间间隔 | **核心优化目标** — 消除 generation stall |
| **Capacity** | 在 SLO 约束下系统能承受的 **QPS** | 论文主评估指标（比裸 tokens/s 更贴近 SLA） |

### 2. 现有调度器的两难（Figure 2）

| 策略 | 代表系统 | 优点 | 缺点 |
|------|----------|------|------|
| **Decode-prioritizing** | FasterTransformer, Triton（request-level batching） | TBT 低，无 generation stall | 吞吐差：batch 里短请求等长请求；decode-only 迭代 batch 小 |
| **Prefill-prioritizing** | Orca, vLLM（iteration-level batching） | 吞吐高：先塞满 prefill，后续 decode 大 batch | **Generation stall**：长 prefill 迭代阻塞所有 decode |

**Generation stall**：两个 decode 迭代之间插入了完整 prefill（或过长 hybrid batch），导致正在生成的用户 TBT **突刺到秒级**。

### 3. Chunked Prefill

把长度为 \(L\) 的 prompt 切成若干块，每块最多 \(C\) 个 token（**chunk size**）：

```text
prompt tokens:  [----chunk0----][----chunk1----][----chunk2----]...
iterations:      iter0: chunk0 + decodes
                 iter1: chunk1 + decodes
                 iter2: chunk2 + decodes
                 ...
```

关键性质：

- **Prefill 对 batch 不敏感**：Mistral-7B 上 batch=1 的 prefill 已能打满算力（论文 Figure 3），攒多个 prefill **几乎不涨吞吐**。
- **Decode 对 batch 极敏感**：batch 翻倍，decode 吞吐近似线性涨。
- 因此最优策略不是「多 prefill 一起算」，而是「**每轮只塞一小块 prefill + 尽量多的 decode**」。

### 4. Stall-Free Batching（Algorithm 3 直觉）

每个调度迭代的打包顺序（论文 §4.2）：

1. **先装**所有进行中的 **decode** 请求（每请求 1 token）。
2. **再装**尚未完成的 **prefill chunk**（续写上次切到一半的 prompt）。
3. **最后**在剩余 **token budget** 内 admit 新请求，只取能塞下的 prefill 前缀。

**Token budget** \(B\)：用户根据 TBT SLO 设定每迭代最多处理多少 token（decode 数 + prefill chunk 大小之和）。限制每迭代计算量 → **迭代延迟与 prompt 总长度解耦**。

### 5. 为什么 Hybrid Batch「几乎免费」

Decode 迭代是 **memory-bound**：线性层耗时近似 \(\max(T_{\text{math}}, T_{\text{mem}})\)，\(T_{\text{math}}\) 很小，GPU 算力闲着。

Prefill chunk 是 **compute-bound**：能把闲置算力用起来。

论文 Figure 5/6 的直觉（Mistral-7B, A100）：

- 纯 decode batch=32 ≈ **25 ms**
- prefill chunk=512 token 单独跑 ≈ **22 ms**
- 合并后实测 ≈ **28 ms**（不是 47 ms 简单相加）

这就是 **stall-free** 的物理来源：**用 decode 的访存等待时间「偷跑」prefill 算力**，而不是让 decode 停下来等。

### 6. Uniform Batch 与 Pipeline Parallelism

Pipeline parallel（PP）把模型按层切到多卡，micro-batch 在 stage 间流水。若相邻迭代耗时差异大（一会纯 prefill、一会纯 decode），会出现 **pipeline bubble**（某些 stage 空转）。

Sarathi-Serve 每迭代结构相近（**N 个 decode + ≤1 个 chunk**），迭代耗时更均匀 → PP 场景 Falcon-180B 上 **端到端 capacity 最高 6.9×**（相对 Orca/vLLM）。

### 7. 与 DistServe / PD 分离的关系

| 路线 | 思路 | 适用 |
|------|------|------|
| **Sarathi-Serve** | 同卡混批，chunk + stall-free | 单卡/少卡、NVLink 紧、不想搬 KV |
| **DistServe** | Prefill 与 Decode **分到不同 GPU** | 集群充裕、TTFT/TPOT SLO 差异大 |
| **Splitwise** | 异构硬件：快卡 prefill、慢卡 decode | 云厂商机型混搭 |

两条路线**不互斥**：生产里常见「单卡内 Sarathi 调度 + 集群级 PD 分离」分层优化。

---

## 代码示例

### 示例 1：vLLM 中的 chunked prefill 开关（工业界默认配置）

Sarathi-Serve 的核心思想已并入 vLLM。零基础可以先从**能跑的参数**理解 chunk 与 token budget：

```python
from vllm import LLM, SamplingParams

# Sarathi-Serve 思想在 vLLM 中的对应项：
# - enable_chunked_prefill: 开启切块 prefill
# - max_num_batched_tokens: 每迭代 token 上限 ≈ 论文中的 batch token budget
llm = LLM(
    model="mistralai/Mistral-7B-Instruct-v0.2",
    enable_chunked_prefill=True,
    max_num_batched_tokens=512,   # 越小 → TBT 越稳，TTFT 可能略升
    max_num_seqs=64,              # 并发 decode 序列数上限
)

prompts = [
    "用三句话总结量子计算：",
    "写一份 2000 字的 Rust 异步编程教程：" + "背景知识 " * 400,
]
outputs = llm.generate(prompts, SamplingParams(max_tokens=128, temperature=0))
for o in outputs:
    print(o.outputs[0].text[:200])
```

调参直觉：

- `max_num_batched_tokens` **太大** → 单迭代可能塞进过长 prefill chunk → TBT 尾延迟回升（回到 generation stall）。
- **太小** → attention 重复读 KV 的开销上升，吞吐下降；论文报告 Yi-34B 上 chunk=128 比 512 慢约 **30%**。

### 示例 2：用伪代码理解 Stall-Free 调度器（对应论文 Algorithm 3）

下面是把论文调度逻辑**简化成可读 Python** 的教学版本（非 sarathi-serve 仓库原文，便于理解打包顺序）：

```python
from dataclasses import dataclass, field
from typing import List, Optional

CHUNK_SIZE = 512          # 每块 prefill 最多多少 token
TOKEN_BUDGET = 1024       # 每迭代总 token 上限（含所有 decode + prefill chunk）

@dataclass
class Request:
    prompt_tokens: List[int]
    prefill_cursor: int = 0
    phase: str = "prefill"  # "prefill" | "decode"
    output_tokens: List[int] = field(default_factory=list)

def schedule_iteration(running: List[Request], waiting: List[Request]) -> dict:
    """返回本迭代要执行的 hybrid batch：decode 列表 + 可选 prefill chunk。"""
    batch_decodes: List[Request] = []
    prefill_req: Optional[Request] = None
    prefill_chunk: List[int] = []
    used = 0

    # 1) 先打包所有 decode（每请求 1 token）
    for r in running:
        if r.phase == "decode":
            batch_decodes.append(r)
            used += 1
    if used > TOKEN_BUDGET:
        raise ValueError("decode batch 已超过 token budget，需限流或减 max_num_seqs")

    # 2) 续写未完成的 prefill chunk
    for r in running:
        if r.phase == "prefill" and r.prefill_cursor < len(r.prompt_tokens):
            prefill_req = r
            break

    # 3) 若无进行中 prefill，从 waiting 队列 admit 新请求
    if prefill_req is None and waiting:
        prefill_req = waiting.pop(0)
        running.append(prefill_req)

    # 4) 在剩余 budget 内切 prefill chunk（stall-free 的关键）
    if prefill_req is not None:
        remain = TOKEN_BUDGET - used
        end = min(
            prefill_req.prefill_cursor + min(CHUNK_SIZE, remain),
            len(prefill_req.prompt_tokens),
        )
        prefill_chunk = prefill_req.prompt_tokens[prefill_req.prefill_cursor:end]

    return {
        "decodes": batch_decodes,
        "prefill_request": prefill_req,
        "prefill_chunk": prefill_chunk,
    }

# 一次迭代后更新状态（省略 GPU kernel 调用）
def after_forward(req: Request, chunk_len: int, new_token: Optional[int]):
    if req.phase == "prefill":
        req.prefill_cursor += chunk_len
        if req.prefill_cursor >= len(req.prompt_tokens):
            req.phase = "decode"
            if new_token is not None:
                req.output_tokens.append(new_token)
    elif new_token is not None:
        req.output_tokens.append(new_token)
```

阅读要点：

- **Decode 永远先进 batch** —— 保证正在流式输出的用户每轮都有进度。
- **Prefill 被 chunk 和 budget 双重限制** —— 单迭代延迟有上界，与「prompt 总共 8K 还是 80K」弱相关。
- 这与 Orca/vLLM 的「有内存就 eager 跑完整 prefill」形成鲜明对比。

### 示例 3：用配置估算 chunk 是否 stall-free（Profiling 思路）

论文 §4.3 建议用 profiling 表而非闭式公式。零基础可以记这个**实验流程**：

```python
# 伪代码：在目标 GPU 上测两张表，离线写入配置
# T_decode[B] = 纯 decode batch 大小 B 的单迭代耗时
# T_hybrid[C, B] = C-token prefill chunk + B 个 decode 的耗时

def pick_chunk_size(slo_tbt_ms: float, decode_batch: int, profile: dict) -> int:
    """选最大的 C，使得 hybrid 迭代耗时不超过 SLO（且不超过纯 decode 太多）。"""
    baseline = profile["T_decode"][decode_batch]
    for C in [128, 256, 512, 1024]:
        t = profile["T_hybrid"].get((C, decode_batch), float("inf"))
        if t <= slo_tbt_ms and t <= baseline * 1.1:  # 允许 ~10% 余量
            best = C
        else:
            break
    return best
```

工程上 vLLM 把这件事藏在 `max_num_batched_tokens` 和自动调度里，但**调参时脑子里要有这张表**。

---

## 论文实验数字（建立直觉）

| 场景 | 相对 vLLM / Orca 的 serving capacity 提升 |
|------|------------------------------------------|
| Mistral-7B，单张 A100 | 最高约 **2.6×** |
| Yi-34B，2×A100（TP=2） | 最高约 **2.8×**（不同 SLO 下） |
| Falcon-180B，8×A100（PP+TP） | 最高约 **6.9×** |

论文用真实 trace（如 arxiv-summarisation）展示：vLLM 在负载升高时 **P99 TBT** 急剧恶化，且出现持续数秒的 **generation stall**；Sarathi-Serve 在更高 QPS 下仍保持平滑 TBT。

---

## 适用 vs 不适用

**适用：**

- 在线对话 / 代码补全 — prompt 长度方差大，要求流式体验。
- 多租户混批、**TBT SLO** 严格（如 P99 < 100ms）。
- 希望在**不增加 GPU 数量**的前提下抬 capacity。
- Pipeline parallel 大模型服务 — 需要 uniform iteration。

**不适用 / 收益有限：**

- 纯离线 embedding / 批处理 prefill — 无 decode，不存在 stall 问题。
- 极短 prompt（< chunk size）— 切与不切无差别。
- 已做 **PD 分离** 且 prefill 池与 decode 池完全隔离 — 同卡 stall 问题被架构绕开（但 chunk 仍可能用于 prefill 池内部调度）。

---

## 常见误区

1. **「prefill 攒大 batch 能提速」** — 错。Prefill 已 compute-bound，batch 再大也快不了多少，只会阻塞 decode。
2. **「chunk 越小越好」** — 错。过小导致 KV 重复加载、attention 开销涨，吞吐可能掉 **30%+**。
3. **「Sarathi-Serve = vLLM」** — 不完全。vLLM 采纳了 chunked prefill 思想；微软开源的 `sarathi-serve` 是研究 fork，功能与主线 vLLM 不完全等价。
4. **「优化 TBT 必然牺牲 TTFT」** — 部分对。chunk 增加 prefill 轮数，TTFT 可能略升；但更高吞吐降低**排队延迟**，净 TTFT 有时反而更好。

---

## 与相关工作的位置

```text
Orca (2022)          iteration-level batching
    ↓
vLLM (2023)          + PagedAttention，prefill-prioritizing → generation stall
    ↓
Sarathi (2023)       chunked prefill + decode-maximal（离线吞吐）
    ↓
Sarathi-Serve (2024) stall-free online scheduling + uniform batch for PP
    ‖（路线之争）
DistServe (2024)     PD disaggregation，跨 GPU 消干扰
Splitwise (2024)     异构 PD + 网络感知放置
```

读 Sarathi-Serve 的最佳搭配：[[paged-attention-vllm]]（内存）、[[orca-continuous-batching]]（迭代级 batching）、[[distserve-2024]]（对照路线）、[[flash-attention]]（混合 batch kernel）。

---

## 学到什么

1. **Prefill 与 decode 是两种瓶颈形态** — 算力 bound vs 带宽 bound，调度必须「不对称」对待。
2. **Generation stall 是在线服务的隐形杀手** — 平均吞吐好看，P99 TBT 爆掉，用户仍觉得「卡」。
3. **Chunk + token budget = 给迭代延迟加护栏** — 让系统行为可预测，SLO 才可做。
4. **利用算术强度差异做 co-scheduling** — 比盲目加卡更「系统」。
5. **OSDI 论文一年内进 vLLM 默认** — 好的 serving 调度研究离生产很近，值得精读。

---

## 延伸阅读

- 论文 PDF：[arXiv:2403.02310](https://arxiv.org/abs/2403.02310) / [USENIX OSDI 2024](https://www.usenix.org/conference/osdi24/presentation/agrawal)
- 代码：[microsoft/sarathi-serve](https://github.com/microsoft/sarathi-serve)
- vLLM 性能文档：[Chunked Prefill](https://docs.vllm.ai/en/latest/models/performance.html)
- 前作 Sarathi：[Efficient LLM Inference by Piggybacking Decodes with Chunked Prefills](https://arxiv.org/abs/2308.16369)

## 关联

- [[vllm]] — PagedAttention 宿主；chunked prefill 默认开启
- [[paged-attention-vllm]] — KV cache 分页，与调度正交
- [[orca-continuous-batching]] — iteration-level batching 鼻祖
- [[distserve-2024]] — PD 分离的另一条主线
- [[flash-attention]] — 支持 prefill+decode 混合前向的 kernel
- [[attention]] — 两阶段 attention 访问模式不同，是调度差异的根源
