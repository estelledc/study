---
title: LLM Serving Needs Mathematical Optimization, Not Just Heuristics — 零基础学习笔记
来源: 'Zijie Zhou, "Position: LLM Serving Needs Mathematical Optimization and Algorithmic Foundations, Not Just Heuristics", arXiv:2605.01280, 2026'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：外卖调度，不能照搬「先来先服务」

想象你经营一家大型外卖厨房，同时接几百单：

- 有些订单是「只做前菜」（**prefill**：一次性处理整段输入 prompt，算力密集）。
- 有些订单要「边做边上菜，每上一道菜还要占一个保温格」（**decode**：逐 token 生成，每步都要读写不断变长的 **KV cache**，更吃内存带宽）。
- 你事先**不知道**每单最终要做几道菜（**输出长度未知**）。
- 保温格有限，满了就得踢掉一单，前面做的前菜全白费（**KV 溢出 → 驱逐 → 浪费已算 prefill**）。

老派调度员会怎么做？**先来先服务（FIFO）**、**轮询派单（round-robin）**、保温格满了就踢**最久没动过的**（**LRU**）。这些规则在普通 Web 服务器、数据库连接池里用了二十年，简单、好实现。

但 LLM 推理有个坑：**每单的「占用空间」会随着上菜进度单调变大**，而且不同阶段的瓶颈完全不同（prefill 像炒菜台，decode 像保温架）。用 Web 时代的经验硬套，在 benchmark 上可能还行，一旦遇到爆款活动、超长对话、MoE 模型里某几个专家被打爆，系统会在**负载边界**突然雪崩——latency 飙升、GPU 空转、成本失控。

这篇 **ICML 2026 Position Paper**（Zijie Zhou）的核心主张是：**LLM serving 已经长大，不能再靠「够用就行」的启发式；需要把问题写成数学模型，设计出带可证明保证的算法。** 就像航空业用线性规划推导出「bid price」卖票策略，最终落地成 O(1) 的 accept/reject 规则，三十年带来数十亿美元增量——LLM serving 也需要同样的「建模 → 洞察 → 可部署策略」流水线。

---

## 是什么

这是一篇 **立场论文（position paper）**，不是新系统实现，而是：

1. **诊断**：vLLM、SGLang 等主流 serving 栈在架构上创新很多（continuous batching、PagedAttention、PD 分离、MoE），但**决策层**仍大量继承经典分布式计算的启发式。
2. **论证**：LLM 推理有独特的结构（两阶段、KV 动态增长、输出长度未知、continuous batching 耦合），通用启发式**无法系统性利用**这些结构。
3. **呼吁**：把路由、调度、缓存驱逐、容量规划、MoE 负载均衡等问题**形式化**，引入运筹学 / 在线算法 / 排队论，追求**最坏情况保证、容量下界、工程蓝图**——而不只是 ShareGPT trace 上的平均表现。

论文信息：

| 项目 | 内容 |
|------|------|
| 标题 | LLM Serving Needs Mathematical Optimization and Algorithmic Foundations, Not Just Heuristics |
| 作者 | Zijie Zhou |
| arXiv | [2605.01280](https://arxiv.org/abs/2605.01280) |
| 类型 | ICML 2026 Position Paper |

---

## 为什么重要

### 1. 规模已经大到「几个百分点就是天文数字」

头部厂商每天服务**数十亿**次推理请求；单次集群成本可达**每天数十万美元**量级。能源消耗以**吉瓦时**计。在这种规模下，调度算法哪怕只提升 5%–10% 吞吐或降低 tail latency，都是巨大的金钱与碳排放节省。

### 2. 启发式在「平均 case」和「边界 case」之间断层

FIFO、JSQ、LRU 在常见 trace 上看起来「够好」，但生产环境会遇到：

- 产品发布时的**流量尖峰**
- 多轮 Agent 导致的**超长 decode**
- MoE 里**热点专家**造成的 straggler
- 多模态场景里**高分辨率视频**重复编码

启发式缺少**最坏情况保证**：在 adversarial 或漂移 workload 下可能**静默失败**——不是 crash，而是 latency 和成本缓慢恶化，直到运维加机器。

### 3. 理论不是「纸上求解器」，而是「揭示好算法的结构」

论文反复强调航空 revenue management 的先例：航空公司并不是对每个订票请求在线解 LP，而是用 LP 的对偶变量得到 **bid price**，部署成 O(1) 规则。数学优化的价值在于**分析车辆**，告诉你哪些约束 binding、哪些目标重要——工程师再据此设计轻量启发式，而不是盲目调参。

---

## 核心概念

### 1. Prefill vs Decode：两阶段不对称

| 阶段 | 做什么 | 典型瓶颈 | 资源画像 |
|------|--------|----------|----------|
| **Prefill** | 并行处理整个 prompt | 算力（FLOPs） | compute-bound |
| **Decode** | 自回归逐 token 生成 | 读 KV cache | memory-bandwidth-bound |

同一请求在不同阶段需要**不同的硬件与批处理策略**，这也是 **prefill-decode disaggregation**（Splitwise、DistServe 等）兴起的根源。用单一 FIFO 队列混合两阶段，等于用同一套规则管「炒菜」和「保温」。

### 2. KV Cache：动态、单调增长、大小未知

每生成一个 token，各层都要追加 K/V 向量。因此：

- 内存占用 ≈ `prompt_len + 已生成 token 数`
- **到达时不知道**最终占用多少（输出长度未知）
- 超出 GPU 容量 → **驱逐** → 可能浪费已完成的 prefill 计算

这把经典「job 大小固定」的调度问题，变成了 **「放进 bin 之后 item 还会长大」的在线 bin packing**——溢出代价极高。

### 3. Continuous Batching：请求命运耦合

Orca / vLLM 的 continuous batching 允许请求在 decode 过程中**动态进出 batch**。一个 slot 空出来时，调度器要决定**接哪条等待队列里的请求**——这是带 memory constraint 的在线 admission control，而不是简单的 FCFS。

### 4. 四层典型决策问题（论文 Section 2 框架）

```text
                    ┌─────────────────────────────────────┐
  请求进入 ────────►│ 2.2 DP 路由：分到哪个 decode worker？ │──► sticky assignment
                    └─────────────────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────┐
                    │ 2.1 MoE EP：token 如何均衡到各 GPU？   │──► all-to-all 同步
                    └─────────────────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────┐
                    │ 2.3 Worker 内调度 + 容量规划           │──► FCFS / 阈值准入
                    └─────────────────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────┐
                    │ 2.4 多模态 embedding 缓存驱逐            │──► LRU
                    └─────────────────────────────────────┘
```

### 5. 启发式 vs 形式化：对照表

| 决策点 | 常见启发式 | 忽略的 LLM 结构 | 形式化方向 |
|--------|------------|-----------------|------------|
| 路由 | round-robin, JSQ, power-of-two | decode 长度未知、KV 线性增长、sticky | 在线整数规划 + 短 horizon 预测 |
| Worker 调度 | FCFS | 输出长度、KV  footprint | 最短作业优先 / 阈值准入（WAIT） |
| MoE 均衡 | auxiliary loss, 噪声路由 | 推理时 batch 内即时重分配 | 线性规划（LPLB） |
| 缓存驱逐 | LRU | 对象大小异质、miss 代价差异 | 最小期望代价（LEC） |
| 扩缩容 | 队列深度 / GPU 利用率 | 内存稳定性 vs 计算稳定性 | 排队论闭式稳定条件 |

### 6. 理论带来的四类收益

1. **最坏情况鲁棒性**：competitive ratio，对抗任意 arrival 序列。
2. **容量规划下界**：部署前算「最少需要多少 GPU 才稳定」。
3. **算法结构指导工程**：LP 对偶 → 阈值策略；fluid model → 准入规则。
4. **最优性基线**：知道离理论极限还有多远，避免过度优化。

---

## 代码示例 1：用 Python 模拟「KV 增长 + FCFS 的隐患」

下面是一个**教学级**离散事件模拟，展示为什么 FCFS 在「短请求 + 长请求混合、KV 有限」时 tail latency 会变差。真实 vLLM 复杂得多，但直觉一致。

```python
from dataclasses import dataclass, field
from collections import deque
import heapq

@dataclass(order=True)
class Request:
    arrival: float
    prompt_tokens: int
    output_tokens: int  # 真实系统里到达时未知；这里上帝视角用于对比
    started: float = field(default=0.0, compare=False)
    finished: float = field(default=0.0, compare=False)

def kv_units(req: Request, step: int) -> int:
    """每 decode 步 KV 占用 ~ prompt + 已生成 token 数"""
    return req.prompt_tokens + step

def simulate(queue_policy: str, requests: list[Request], kv_cap: int, batch_cap: int):
    """
    queue_policy: 'fcfs' 或 'sjf'（按 predicted 输出长度优先，近似 shortest-job-first）
    """
    now = 0.0
    waiting = deque(sorted(requests, key=lambda r: r.arrival))
    active: list[tuple[int, Request, int]] = []  # (remaining_decode, req, current_step)
    done: list[Request] = []

    while waiting or active:
        # 准入：有空 slot 且 KV 够
        while waiting and len(active) < batch_cap:
            r = waiting[0]
            need = r.prompt_tokens  # prefill 后第一步 decode 的 KV
            used = sum(kv_units(a[1], a[2]) for a in active)
            if used + need > kv_cap:
                break
            waiting.popleft()
            r.started = now
            active.append((r.output_tokens, r, 0))

        if not active:
            now = waiting[0].arrival
            continue

        # 所有 active 请求推进一步 decode
        now += 1.0
        next_active = []
        for rem, r, step in active:
            if rem <= 1:
                r.finished = now
                done.append(r)
            else:
                next_active.append((rem - 1, r, step + 1))
        active = next_active

        # 排序 waiting（SJF 近似：已知/预测 output 越短越先）
        if queue_policy == "sjf" and waiting:
            tmp = list(waiting)
            waiting = deque(sorted(tmp, key=lambda r: r.output_tokens))

    return sum(r.finished - r.arrival for r in done) / len(done)

# 混合 workload：大量短问答 + 少量超长 Agent 任务
mixed = []
for i in range(20):
    mixed.append(Request(arrival=i * 0.5, prompt_tokens=512, output_tokens=64))
for i in range(3):
    mixed.append(Request(arrival=5 + i, prompt_tokens=4096, output_tokens=2048))

avg_fcfs = simulate("fcfs", mixed, kv_cap=120_000, batch_cap=8)
avg_sjf = simulate("sjf", mixed, kv_cap=120_000, batch_cap=8)
print(f"FCFS 平均等待+服务时间: {avg_fcfs:.1f}")
print(f"SJF  平均等待+服务时间: {avg_sjf:.1f}")
# 典型现象：SJF 显著降低平均 latency，因为短请求不被长 Agent 阻塞
```

**读代码时注意**：真实系统里 `output_tokens` 不可知，所以论文才讨论 **带预测误差的调度**（如 adaptive robust scheduling、Nested WAIT）。重点不是「SJF 永远赢」，而是 **FCFS 完全不看 footprint 与剩余工作量，在 memory-constrained batching 下是次优的**——这需要用模型严格表述，而不是凭感觉改队列。

---

## 代码示例 2：MoE 负载均衡的 LP 骨架（对应 DeepSeek LPLB 思想）

MoE 推理时，每个 token 被 router 分到 top-k 专家；Expert Parallelism 下专家分布在不同 GPU 上。若 token 分布倾斜，**最慢 GPU 决定整步延迟**（straggler + all-to-all barrier）。

DeepSeek **LPLB** 把「沿冗余专家边迁移 token 负载」写成 LP，目标是最小化 max GPU load。下面是最小可运行的 **CPU 版 scipy 骨架**（论文用 GPU 内点法 ~100μs 求解）：

```python
import numpy as np
from scipy.optimize import linprog

def moe_load_balance_lp(initial_loads: np.ndarray, edges, capacities):
    """
    initial_loads[i]: GPU i 上本 batch 初始 token 数
    edges: list of (i, j) 表示可从 GPU i 向 GPU j 迁移负载（冗余专家边）
    capacities[(i,j)]: 边 (i,j) 上最多可迁移的 token 数
    变量: f_ij 迁移量 + L_max
    目标: min L_max
    """
    G = len(initial_loads)
    n_flow = len(edges)
    # 变量顺序: [f_0, ..., f_{E-1}, L_max]
    n_var = n_flow + 1

    # min L_max  =>  c @ x, 最后一个变量系数为 1
    c = np.zeros(n_var)
    c[-1] = 1.0

    # 不等式 A_ub @ x <= b_ub
    rows, rhs = [], []
    for g in range(G):
        row = np.zeros(n_var)
        # load_g - sum_out + sum_in <= L_max  =>  load - sum_out + sum_in - L_max <= 0
        for e_idx, (i, j) in enumerate(edges):
            if i == g:
                row[e_idx] -= 1.0
            if j == g:
                row[e_idx] += 1.0
        row[-1] = -1.0
        rows.append(row)
        rhs.append(-initial_loads[g])

    A_ub = np.array(rows)
    b_ub = np.array(rhs)

    # 0 <= f_ij <= cap_ij
    bounds = [(0, capacities[e]) for e in edges] + [(None, None)]

    res = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")
    flows = res.x[:-1]
    lmax = res.x[-1]
    balanced = initial_loads.copy()
    for val, (i, j) in zip(flows, edges):
        balanced[i] -= val
        balanced[j] += val
    return lmax, balanced, flows

# 4 GPU，GPU0 热点
loads = np.array([120.0, 40.0, 35.0, 38.0])
edges = [(0, 1), (0, 2), (0, 3)]  # 冗余专家副本边
caps = {(0, 1): 50, (0, 2): 50, (0, 3): 50}

lmax, balanced, flows = moe_load_balance_lp(loads, edges, caps)
print("优化前 loads:", loads, "max=", loads.max())
print("优化后 loads:", np.round(balanced, 1), "L_max=", round(lmax, 1))
print("迁移量 flows:", np.round(flows, 1))
```

**要点**：

- 目标函数和约束**显式可见**，比「调 auxiliary loss 权重」更可解释。
- 论文指出 LPLB 当前按 **token 数** 均衡，尚未完全建模 grouped GEMM 的非线性代价——这是「模型要持续 refine」的正常路径。
- EPLB（静态重排 + 副本选择）是 optimization-**informed** heuristic；LPLB 是 per-batch **直接求解**——两者展示「理论→工程」光谱。

---

## 论文引用的三条成功路线（深入一点）

### A. 在线整数规划：DP 路由与 barrier 同步（Chen et al., 2026）

Data Parallel decode 中，EP all-to-all 前必须等**最慢 worker**。负载 = 各 worker 上活跃请求的 KV 总量，且**每步确定性 +1**（drift）。

关键洞察：**不需要预测完整 decode 长度**，只需短 horizon 内「哪些 job 即将结束」。Balance-Future 原则：每步解一个小整数规划，最小化未来 H 步的累计 imbalance。理论保证：相对默认策略，长期平均 imbalance 降低 Ω(√(B log G))——集群越大、batch 越大，收益越显著。

### B. Fluid 模型 + WAIT 阈值准入（Ao et al., 2025, arXiv:2504.11320）

把 continuous batching 建模为**带内生 memory 增长**的多阶段在线调度；用 fluid approximation 刻画稳定区域内 batch 组成与内存占用，再导出 **WAIT**（Waiting for Accumulated Inference Threshold）准入规则。未知输出长度时用 **Nested WAIT** + 安全 buffer，在 Vidur 仿真中相对 baseline **扩大稳定运行区间**、降低近过载区 latency。

### C. 排队论稳定条件 +  hindsight IP（Anonymous 2025; Jaillet et al., 2025）

- **稳定性**：系统可能 compute-stable 但 **memory-unstable**（KV 爆掉）——经典 offered load 概念要扩展。
- **调度下界**：用 clairvoyant integer program 定义「全知最优延迟」，在线算法与之比较 competitive ratio。
- 预测较准时，**shortest-job-first** 类策略接近最优——但论文强调要 joint design **预测器 + 调度器**，并处理预测 adversarial 错误。

### D. 代价感知缓存 LEC（Zhu et al., 2023）

多模态 serving 里，cache miss 代价差异巨大（重编码 4K 视频 vs 缩略图）。LEC 按 `cost_per_size × access_prob` 驱逐，达到**最优 regret**；实验报告最高 **50×** 成本节省（高低代价操作比大时）。

---

## 常见反驳与论文回应（Alternative Views 摘要）

| 反驳 | 论文立场 |
|------|----------|
| 「启发式已经 scale 了」 | scale 不等于 optimal；边界 workload 的隐性成本在百亿请求量级被放大 |
| 「问题变化太快，理论跟不上」 | 结构洞察（barrier、memory drift、unknown size）可跨硬件/架构代际迁移 |
| 「kernel 优化才是大头」 | 算法与系统互补；坏调度会让 fast kernel 空转 |
| 「最坏情况保证太松，没实用价值」 | 保证的价值是** universality**——不依赖某个 benchmark trace；理论提供 scaffold，工程做近似 |

---

## 与主流系统的映射（读源码 / 文档时的 lens）

| 系统 / 组件 | 启发式痕迹 | 可形式化的钩子 |
|-------------|------------|----------------|
| vLLM scheduler | 默认 FCFS waiting queue | admission 时考虑 predicted len / KV footprint |
| vLLM router | RR, JSQ, power-of-two, prefix-aware | sticky + drift + barrier → online assignment |
| SGLang | 类似路由与 cache 策略 | 结构化 program 的可预测阶段 |
| DeepSeek EPLB/LPLB | 静态 + LP 动态 MoE 均衡 | 已走「建模→求解」路线 |
| 多模态 vLLM prefix cache | LRU 类驱逐 | LEC / cost-aware + 大小异质 |

读这些项目时，可以自问：**这个 if-else 在优化什么目标？约束是什么？有没有更坏但合法的 workload 会击穿它？**

---

## 未来研究方向（Section 5 提炼）

1. **预测与调度联合设计**：预测质量随 request type 漂移时，robustness–consistency tradeoff 怎么定？
2. **多目标优化**：TTFT、TPOT、吞吐、能耗、公平性——Pareto 前沿在哪里？
3. **Disaggregation 理论**：何时 PD 分离优于同机？两池资源比例如何随 workload 变？
4. **Agentic 推理调度**：工具调用、分支、暂停、子请求依赖——现有 M/G/1 队列不够用了。

---

## 零基础自检清单

读完后，你应该能回答：

- [ ] Prefill 和 Decode 为什么不能用同一套「算力导向」调度？
- [ ] 为什么说 KV cache 把调度从「固定大小 job」变成「会长大的 job」？
- [ ] FCFS、RR、LRU 分别对应 serving 里哪三个决策点？
- [ ] 「解 LP」和「用 LP 推导 O(1) 规则」有什么区别？
- [ ] 举一个论文里「形式化方法已在生产/近生产验证」的例子（LPLB / WAIT / LEC 任选一）。

---

## 延伸阅读

| 主题 | 文献 |
|------|------|
| Position 原文 | Zhou, arXiv:2605.01280, 2026 |
| Fluid + WAIT 调度 | Ao et al., arXiv:2504.11320, 2025 |
| KV 约束在线调度 | Jaillet et al., arXiv:2502.07115, 2025 |
| DP 负载均衡 IP | Chen et al., arXiv:2601.17855, 2026 |
| 代价感知缓存 | Zhu et al., NeurIPS 2023 |
| Continuous batching | Yu et al., Orca, OSDI 2022 |
| PagedAttention | Kwon et al., SOSP 2023 |
| MoE LP 负载均衡 | DeepSeek LPLB, 2025 |

---

## 一句话总结

**LLM serving 的瓶颈 increasingly 是「决策」而不是「矩阵乘」——而决策层若仍停留在 Web 时代的 FIFO/RR/LRU，就是在用二十年前的问题假设，硬扛一个「内存会长大、长度不可知、两阶段异质、请求粘住不放」的新问题类。** 这篇 position paper 呼吁社区把 serving 当作**运筹学 + 在线算法**的新前沿：先建模，再证明，最后像航空 bid price 一样，把结构压缩成可部署的轻量策略。
