---
title: Splitwise — 用阶段拆分让 LLM 推理更省算力、更省钱
来源: https://arxiv.org/abs/2311.18677
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 从日常类比开始：火锅店的「备料台」与「涮肉桌」

想象一家连锁火锅店（GPU 集群）同时接待两类客人：

1. **Prompt 阶段（备料）**：客人一次端来一大盆生肉和蔬菜（prompt 可能有上千 token）。后厨要把**整盆食材同时下锅焯水、切配**（并行处理全部输入 token），做出**第一盘蘸料**（第一个输出 token），并把每片肉的「熟度记录卡」写进档案（**KV cache**）。这一步像**大火爆炒**——灶台火力要猛、厨师手要快。
2. **Token 生成阶段（涮肉）**：之后客人每要**一片肉**（每步只生成 1 个 token），厨师只需翻档案、加一小片新肉下锅。火力不大，但要**不停翻账本、搬盘子**——吃显存带宽和容量。客人关心的是「每片肉之间等多久」（**TBT，Time-Between-Tokens**）。

**传统做法**把备料和涮肉**挤在同一口锅、同一批灶台**里：

- 大盆备料没做完，旁边等一片肉的人全得干等。
- 为了照顾涮肉的人，大盆备料也不能全力炒。
- 更糟的是：备料需要**最新款猛火灶**（H100 的高算力），但涮肉其实**旧灶就够**——却一直占着贵灶，算力闲着、电费照付。

**Splitwise 的做法**像把店拆成两个区域：

- **一楼专门备料**（Prompt 机器池），配猛火灶、按 prompt 长度排班。
- **二楼专门涮肉**（Token 机器池），可以用**更便宜、更省电的旧灶**（例如 A100 甚至降功耗运行）。
- 备料完成后用**传送带**把档案（KV cache）送到二楼——在现代数据中心 **InfiniBand** 背板上，这笔搬运费往往**比互相挡锅便宜得多**。

一句话：**不是让单张 GPU 每秒吐更多 token，而是承认推理天然分两阶段，让「该猛火的猛火、该省钱的省钱」——Splitwise 用阶段拆分把这件事做成可量化的集群设计问题。**

---

## 是什么

**Splitwise: Efficient Generative LLM Inference Using Phase Splitting**（Patel 等，**ISCA 2024**，arXiv:[2311.18677](https://arxiv.org/abs/2311.18677)）是微软研究院与华盛顿大学的工作。论文提出：

1. 系统性地**刻画** LLM 推理中 **Prompt 计算**与 **Token 生成**两阶段在延迟、吞吐、显存、功耗上的差异。
2. 把两阶段拆到**不同机器**上，各自用更合适的硬件与调度策略。
3. 用**分层 KV cache 异步传输**（基于 MSCCL++ / InfiniBand）把跨机开销压到用户几乎感知不到。
4. 探索**同构与异构集群**（如 H100 做 prompt、A100 做 token），在吞吐、成本、功耗之间做权衡。

| 项目 | 内容 |
|------|------|
| 会议 | ISCA 2024 |
| 机构 | University of Washington、Microsoft Research |
| 实现基础 | 在 **vLLM** 上实现 KV 传输；开源实现见论文脚注 [1] |
| 生产 trace | Azure LLM 推理服务（编码 / 对话两类负载） |
| 评测模型 | BLOOM-176B、Llama2-70B |
| 效果 | 同等成本功耗下吞吐最高 **2.35×**；或 **1.4×** 吞吐且成本降 **20%** |

---

## 为什么重要

不理解 Splitwise，下面几件事很难讲清楚：

- 为什么 2024 年起业界大量出现 **Prefill/Decode 分离**（DistServe、Mooncake、SGLang disagg、vLLM PD 等）——Splitwise 是这条线的**早期系统论文之一**（比 DistServe 早几个月公开）。
- 为什么 **H100 算力涨 3.4×，显存带宽只涨 1.6×** 会让「一锅炖」部署越来越亏——prompt 吃算力，decode 吃带宽，**绑在同一 SKU 上会 over-provision**。
- 为什么 decode 阶段可以**降功耗、用旧 GPU** 而 prompt 不行——论文用实测证明 token 阶段对 **50% 功耗封顶几乎无感**，prompt 阶段则非常敏感。
- 为什么 PD 分离的关键不是「能不能传 KV」，而是**传的时候别挡计算**——Splitwise 的 **逐层异步传输**是具体工程答案。

---

## 核心概念

### 1. 两阶段推理

```text
用户 prompt (n tokens)
  → [Prompt 阶段]  并行处理全部 prompt token → 第 1 个 output token + 写入 KV cache
  → [Token 阶段]   循环：每步 1 token，读全量 KV + 权重 → 直到 EOS

端到端延迟 ≈ TTFT + TBT × (输出 token 数 - 1)
```

| 阶段 | 计算特征 | 典型瓶颈 | 论文关注的指标 |
|------|----------|----------|----------------|
| **Prompt** | 一次处理很多 token，大 GEMM | **Compute-bound** | **TTFT**（Time-To-First-Token） |
| **Token** | 每步 1 token，读全量权重+KV | **Memory-bandwidth / capacity-bound** | **TBT**（Time-Between-Tokens） |

论文 **Insight III**：对大多数请求，**端到端时间的大头在 token 阶段**——即便 coding 场景 prompt 很长、输出很短，176B 模型上「1500 token prompt」与「6 个 output token」耗时相当。

### 2. 论文七条 characterization insights（浓缩版）

| # | 洞察 | 对设计的含义 |
|---|------|--------------|
| I | 不同服务（编码 vs 对话）prompt/输出长度分布差很大 | 机器池比例要按 workload 调 |
| II | Mixed batching 下，**60–70% 时间 batch 里只有 ≤20 个活跃 token** | Token 阶段 GPU 长期吃不饱 |
| III | E2E 时间主要在 token 阶段 | 优化 token 池利用率收益大 |
| IV | Prompt batch 超过 ~2048 token 后吞吐反而降；Token batch 可涨到显存上限 | 两阶段 batch 策略应**分开设** |
| V | Prompt 吃算力；Token 吃显存容量 | 硬件选型应不同 |
| VI | Prompt 吃满功耗；Token 加 batch 功耗几乎不变 | Token 机可降功耗封顶 |
| VII | A100 跑 token 的 Perf/$、Perf/W 常优于 H100 | **异构集群**（H prompt + A token）合理 |

### 3. Splitwise 系统架构

```text
                    ┌─────────────────┐
  新请求 ──────────►│ Cluster Scheduler│ (CLS)
                    │  JSQ 选 prompt+token 机对 │
                    └────────┬────────┘
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    [Prompt 池]        [Token 池]        [Mixed 池]
    FCFS, prompt       FCFS, 尽量        高负载时
    batch ≤2048 tok    塞满 batch        回退 mixed batching
           │                 ▲
           │  KV cache       │
           └────逐层异步传输──┘
```

三层机器池：

- **Prompt 池**：只跑 prompt；MLS 限制多 prompt 拼 batch 总量 ≤2048 token（可配置）。
- **Token 池**：只跑 decode；尽量 batch 到显存快满。
- **Mixed 池**：负载尖峰时，把 prompt 机或 token 机临时切到 mixed 模式，行为等同传统 colocated 系统，**消除池间碎片**。

调度：**CLS** 用 Join-the-Shortest-Queue（按 pending token 数）同时为每个请求分配 prompt 机 + token 机；**MLS** 管本机 batch 与显存。

### 4. KV cache 跨机传输（论文核心工程）

朴素做法：prompt 算完 → 串行传完整 KV → 再开始 token → **第二个 token 延迟暴涨**。

Splitwise 优化：

- **逐层异步传输**：prompt 机算完第 L 层就立刻 `put` 该层 KV，同时继续算 L+1 层。
- **小 prompt（<512 on H100）**用串行传输即可（KV 小，不值得复杂化）。
- 实现用 **MSCCL++** one-sided `put` + 信号量同步；按 vLLM **block** 粒度发送，合并连续 block 减少次数。
- 实测：相对 prompt 计算时间，传输开销 **<7%**；优化后 E2E 影响约 **0.8%**（大 prompt 串行可达 3%）。

### 5. 四种 Splitwise 集群变体

命名：**第一个字母 = Prompt 机，第二个 = Token 机**（A=A100 DGX，H=H100，Hcap=H100 降功耗）

| 设计 | Prompt 机 | Token 机 | 典型场景 |
|------|-----------|----------|----------|
| **Splitwise-AA** | A100 | A100 | 同构、旧 GPU 好买 |
| **Splitwise-HH** | H100 | H100 | 同构旗舰 |
| **Splitwise-HA** | H100 | A100 | 低 TTFT + 高性价比 token |
| **Splitwise-HHcap** | H100 | H100（token 机功耗封顶 ~70%） | CSP 省机房功率 |

论文用**事件驱动模拟器**搜索 prompt:token 机器数量（例如 coding 负载下 Splitwise-HH 约 **27P + 3T** 达到 iso-throughput 成本最优）。

### 6. 与 DistServe、Orca、vLLM 的关系

| 工作 | 侧重点 |
|------|--------|
| **Orca / vLLM** | Continuous / mixed batching，**同机**跑两阶段 |
| **Splitwise (ISCA'24)** | 阶段拆分 + **异构硬件** + 成本/功耗集群设计 |
| **DistServe (OSDI'24)** | PD 分离 + **Goodput**（TTFT/TPOT SLO 下 per-GPU 请求率）+ 分阶段并行策略优化 |

三者互补：Splitwise 更像「**数据中心采购与容量规划**」视角；DistServe 更像「**在线 SLO 与并行配置**」视角。工业界后来常把 PD 分离、KV 传输、异构池合成一套 serving 栈。

---

## 代码示例

### 示例 1：用 Python 理解两阶段资源画像

下面用简化数字复现论文 **Table IV / Insight VII** 的直觉：H100 对 TTFT 帮助大，但对 TBT 提升有限；A100 跑 token 更划算。

```python
from dataclasses import dataclass

@dataclass
class GpuProfile:
    name: str
    ttft_ms: float      # 同 workload 下 prompt 延迟
    tbt_ms: float       # 单步 decode 延迟
    cost_per_hr: float
    power_w: float

A100 = GpuProfile("A100", ttft_ms=185, tbt_ms=52, cost_per_hr=0.42, power_w=400)
H100 = GpuProfile("H100", ttft_ms=95,  tbt_ms=31, cost_per_hr=0.52, power_w=700)

def e2e_ms(gpu: GpuProfile, prompt_tokens: int, output_tokens: int) -> float:
    """极简模型：TTFT 随 prompt 线性涨，decode 随输出 token 数线性涨"""
    ttft = gpu.ttft_ms * (prompt_tokens / 1024)
    decode = gpu.tbt_ms * max(output_tokens - 1, 0)
    return ttft + decode

# 对话 trace 量级：prompt≈1020, output≈129（论文 Figure 3）
prompt, out = 1020, 129
for g in (A100, H100):
    lat = e2e_ms(g, prompt, out)
    print(f"{g.name}: E2E≈{lat:.0f}ms, cost≈${g.cost_per_hr * lat / 3_600_000:.4f}/req")

# Splitwise-HA：prompt 用 H100，token 用 A100（各 1 张 GPU 教学示意）
ttft = e2e_ms(H100, prompt, 1)   # 只有 prompt 阶段
tbt_part = A100.tbt_ms * (out - 1)
splitwise_ha = ttft + tbt_part
print(f"Splitwise-HA (示意): E2E≈{splitwise_ha:.0f}ms")
print(f"vs 单机 H100:        E2E≈{e2e_ms(H100, prompt, out):.0f}ms")
```

要点：**不必两张 H100 伺候一整条请求**——prompt 机用 H100 压 TTFT，token 机用 A100 省成本，端到端仍可接受。

### 示例 2：逐层 KV 传输 vs 串行传输（Gantt 直觉）

```python
def transfer_latency_ms(kv_size_gb: float, bandwidth_gbps: float) -> float:
    """KV 传输时间 ≈ 数据量 / 带宽（忽略协议开销）"""
    return kv_size_gb * 8 * 1000 / bandwidth_gbps

def prompt_compute_ms(prompt_tokens: int, layers: int = 80) -> float:
    """教学用：prompt 计算随 token 数近线性"""
    return 0.08 * prompt_tokens  # 例如 1024 token → ~82ms

def simulate_kv_handoff(prompt_tokens: int, layers: int = 80,
                        bandwidth_gbps: float = 400):
    kv_gb = prompt_tokens * layers * 2e-6  # 虚构：每层每 token 2KB 量级
    compute = prompt_compute_ms(prompt_tokens, layers)
    serial_xfer = transfer_latency_ms(kv_gb, bandwidth_gbps)

    # 串行：prompt 全算完再传 → 第二个 token 要等完整 transfer
    serial_second_token_penalty = serial_xfer

    # 逐层：传输与后续层计算重叠，只剩「传不完的尾巴」
  # 论文 H100 上非重叠尾巴约 5ms 量级
    layer_compute = compute / layers
    layer_xfer = serial_xfer / layers
    overlap_tail = max(0.0, layer_xfer - layer_compute) * layers
    optimized_penalty = min(overlap_tail, 8.0)  # 论文 A100 ~8ms, H100 ~5ms

    print(f"prompt_tokens={prompt_tokens}")
    print(f"  串行 KV 惩罚（第二 token）: {serial_second_token_penalty:.1f} ms")
    print(f"  逐层重叠后惩罚:           {optimized_penalty:.1f} ms")
    print(f"  占 E2E 比例（串行）:        {100*serial_second_token_penalty/compute:.1f}%")
    print(f"  占 E2E 比例（Splitwise）:   {100*optimized_penalty/compute:.1f}%")

simulate_kv_handoff(1024)
simulate_kv_handoff(4096)
```

长 prompt 时串行传输可占 E2E **数个百分点**；逐层重叠把可见惩罚压到 **1% 以内**——这是 Splitwise 敢拆机的工程底气。

### 示例 3：概念性 Splitwise 调度骨架

```python
from collections import deque
from enum import Enum, auto

class Pool(Enum):
    PROMPT = auto()
    TOKEN = auto()
    MIXED = auto()

class SplitwiseScheduler:
    """教学骨架：CLS 为每个请求同时绑定 prompt+token 机"""

    def __init__(self, prompt_machines, token_machines):
        self.prompt_machines = prompt_machines
        self.token_machines = token_machines
        self.waiting = deque()

    def _jsq_pair(self):
        """Join Shortest Queue：按 pending token 数选最空的一对"""
        p = min(self.prompt_machines, key=lambda m: m.pending_tokens)
        t = min(self.token_machines, key=lambda m: m.pending_tokens)
        return p, t

    def submit(self, req_id: str, prompt_len: int, max_output: int):
        p_machine, t_machine = self._jsq_pair()
        self.waiting.append((req_id, prompt_len, max_output, p_machine, t_machine))

    def run_prompt_phase(self, req_id, tokens, p_machine, t_machine):
        # prompt 机：FCFS，batch 总 prompt token ≤ 2048
        first_token, kv_handle = p_machine.forward_prompt(tokens)
        # 逐层异步 KV put（与后续层计算重叠）
        p_machine.async_transfer_kv(kv_handle, dst=t_machine)
        t_machine.enqueue_decode(req_id, kv_handle, first_token)

    def on_high_load(self, machine):
        """队列超阈值 → 机器进 mixed 池，允许 prompt+token 混批（等同 baseline）"""
        machine.pool = Pool.MIXED
```

与 DistServe 骨架的差异：Splitwise 更强调**机器池角色**（prompt/token/mixed）、**异构 SKU** 和 **KV 传输重叠**；DistServe 更强调 **Goodput 优化与分阶段并行策略搜索**。

---

## 批处理机制对比（论文 Figure 2）

| 机制 | 行为 | 问题 |
|------|------|------|
| **Request-level batching** | 整批请求跑完才接新单 | TTFT 极差 |
| **Continuous batching** | 每步重调度；**同一 batch 只含 prompt 或只含 token** | Prompt 可抢占 token → **TBT 尾延迟高** |
| **Mixed batching** | 每步重调度；prompt 与 token **可同批** | TBT 仍被长 prompt 拖慢 |

Splitwise 在专属 prompt/token 池里**物理隔离**两阶段 batch；尖峰时 mixed 池兜底——兼顾效率与 SLO。

---

## 评测结论速览

### 同功耗（iso-power）吞吐优化

- **Splitwise-AA**：相对 Baseline-A100，对话负载约 **2.15×** 吞吐（同功耗同成本）。
- **Splitwise-HA**：约 **1.18×** 吞吐，成本再降 **10%**。
- **Splitwise-HHcap**：CSP 视角下，同吞吐可省约 **25%** 功耗。

### 同成本 / 同吞吐

- **1.4×** 吞吐且成本降 **20%**（iso-throughput cost-opt，相对 Baseline-H100）。
- 或 **2.35×** 吞吐且**成本与功耗不变**。

### 鲁棒性

- 用为 coding 设计的集群跑 conversation trace：异构设计最多 **7%** 吞吐回落，仍远好于 baseline。
- 换模型（BLOOM → Llama2-70B）后 Splitwise 设计仍优于 baseline。

---

## 局限与后续方向（论文 Discussion）

- **CLS 可扩展性**：超大集群下单点调度器可能成为瓶颈（与 Splitwise 正交，可借鉴分区调度）。
- **故障恢复**：prompt/token 机宕机目前类似 vLLM **从头重跑**；可 checkpoint KV 到内存库（论文留作 future work）。
- **多轮对话**：若服务端缓存上下文，prompt 阶段内存模式会变，可能需要在轮次间**来回传 KV**。
- **互联假设**：默认 prompt/token 机之间有 **InfiniBand**；跨 SKU（H+A）在部分云厂商尚未商品化。
- **KV 压缩**：带宽再紧时可先压缩再传（与逐层传输正交）。

---

## 初学者 FAQ

**Q：Splitwise 改模型数学吗？**  
A：不改。KV **无损**传输，精度与单机推理一致。

**Q：和 speculative decoding、PagedAttention 冲突吗？**  
A：不冲突。实现在 **vLLM** 之上；PagedAttention 管 KV 怎么存，Splitwise 管**哪台机器算哪一阶段**。

**Q：我家只有同型号 GPU，Splitwise 还有用吗？**  
A：有。**Splitwise-AA** 等同构拆分仍能减少 mixed batching 干扰、提高 token 池 batch 利用率；异构是「额外加成」。

**Q：和 DistServe 该读哪个？**  
A：先读 Splitwise 建立「两阶段画像 + 异构集群 + KV 传输」直觉，再读 DistServe 补「**SLO 驱动的 Goodput 与并行配置**」。

---

## 延伸阅读

| 主题 | 链接 |
|------|------|
| 论文 | [arXiv:2311.18677](https://arxiv.org/abs/2311.18677) |
| Microsoft Research 页面 | [Splitwise publication](https://www.microsoft.com/en-us/research/publication/splitwise-efficient-generative-llm-inference-using-phase-splitting/) |
| Azure 生产 trace 子集 | [AzurePublicDataset](https://github.com/Azure/AzurePublicDataset) |
| 实现基础 vLLM | [vllm-project/vllm](https://github.com/vllm-project/vllm) |
| 同路线 DistServe | 本库 [`distserve-2024.md`](./distserve-2024.md) |
| KV 内存管理 | 本库 [`paged-attention-vllm.md`](./paged-attention-vllm.md) |

---

## 一句话总结

**LLM 推理不是一条匀速流水线，而是「先并行啃 prompt、再串行吐 token」两幕戏；Splitwise 把两幕戏分到不同舞台和不同演员（GPU）上，用逐层 KV 传送衔接剧情，在几乎不牺牲延迟的前提下，让集群吞吐更高、账单更轻、机房更省电。**
