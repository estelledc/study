---
title: HexAGenT — 面向 Agentic LLM 的工作流与异构感知调度
来源: 'You Peng et al., "HexAGenT: Efficient Agentic LLM Serving via Workflow- and Heterogeneity-Aware Scheduling", arXiv:2605.16637, 2026; https://arxiv.org/abs/2605.16637'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：外卖平台该按「单」排，还是按「整单送达」排？

想象你经营一家连锁厨房，专门服务「会自己加菜的 AI 助手」——每个用户请求不是一次对话，而是一道**多步骤套餐**：

1. **规划**：先让 LLM 想下一步做什么（plan）。
2. **调工具**：查数据库、跑代码、调 API（tool use）。
3. **分支**：并行查三个候选方案（tree search / LATS）。
4. **汇总**：把中间结果合成最终回答（synthesis）。

顾客体验的是**整单送达时间**——从下单到最后一道菜上桌——而不是「某一道菜单独有多快」。更麻烦的是：**菜单是边做边揭晓的**。你只知道第一步要炒什么；等第一步出锅、工具返回结果后，才知道后面还要不要加菜、加几道。

传统 LLM 推理集群（vLLM、SGLang）像按**单道菜**排队的食堂：先来先服务（FCFS），哪台 GPU 空闲就扔过去。这在「一问一答」的聊天场景够用，但在 Agent 场景会出三类典型问题：

| 类比 | Agent  serving 现实 |
|------|---------------------|
| 把 A 顾客的第三道菜插到 B 顾客第一道菜前面 | 不同 workflow 的 LLM call 被 per-call FCFS 乱序穿插，拖慢关键路径 |
| 所有菜都在同一口大锅炒 | Prefill（算 prompt）和 Decode（逐 token 生成）混在同一 GPU，资源利用差 |
| 新厨师和老厨师混用，却按「谁空谁上」分配 | A100/H100/H200 混部集群里，没考虑各卡 prefill/decode 速度差异和 KV 搬运带宽 |

**HexAGenT**（**Hex**erogeneous **A**gentic LLM Servin**G** with workflow-aware scheduli**T**）要回答的核心问题是：**在 Prefill–Decode（P-D）分离、GPU 异构的集群上，怎样调度「在线逐步展开的 Agent 工作流 DAG」，让整个 workflow 在 SLO 内完成，而不是只优化单次 LLM 调用的延迟？**

论文作者来自 HKUST、Webank、武汉大学、清华等；实现基于 **SGLang v0.5.9** 的 P-D 分离 serving，并在 A100/H100/H200 混部集群上验证。

---

## 是什么

**HexAGenT** 是一个面向 **Agentic LLM 在线 serving** 的全局调度器，部署在 P-D 分离架构的 gateway/router 层，核心能力包括：

1. **在线 DAG 抽象**：每个用户请求是一个**运行时逐步揭示**的有向无环图（DAG），节点是 LLM call，边是依赖（父 call 完成或 tool 返回后才 reveal 子 call）。
2. **Workflow horizon**：为每个 workflow 维护「若当前已揭示子图独占集群跑完需要多久」的估计 \(H_w(t)\)，作为**端到端 SLO 锚点**。
3. **Projected-risk 优先级**：就绪 call 按「预计违反 horizon 的风险」排序，而非单纯 FCFS 或最短 job 优先。
4. **联合 Prefill–Decode 放置**：同时为每个 call 选 prefill 实例、decode 实例、本地队列优先级，并考虑 KV 容量与跨阶段传输延迟。
5. **异构感知**：不同 GPU 类型的 prefill 速度、decode 速度、跨卡 KV 传输带宽都进入估计模型。

一句话：**HexAGenT 把 Agent serving 从「调度独立 LLM 请求」升级为「调度在线展开的工作流，并在异构 P-D 集群上做联合放置与排队」。**

---

## 为什么重要

### 1. 用户感知单位变了：workflow，不是 call

ReAct、LATS、BFCL 等 Agent 范式下，一次用户请求常展开为**多步、有依赖、可分支**的 LLM 调用链。用户等的是「任务完成」，调度器若只优化单次 call 延迟，可能在关键路径上饿死整个 workflow。

### 2. P-D 分离 + 异构集群是经济现实

- **Prefill** 吃算力（一次性处理长 prompt）。
- **Decode** 吃显存与 KV cache（逐 token 生成）。
- 生产集群常混用 A100/H100/H200 以复用存量并控制成本。

DistServe、Splitwise 解决了「阶段分离」，但没解决「在线 Agent DAG + 异构放置 + workflow SLO」的组合问题。

### 3. 现有系统的缺口

| 系统类型 | 代表 | 缺什么 |
|---------|------|--------|
| 请求级 serving | vLLM, SGLang, ORCA | 无 workflow 级 SLO 目标 |
| P-D 分离 | DistServe, Splitwise | 无在线 DAG、异构 workflow 调度 |
| Program-aware | Parrot, Hermes, Autellix, Continuum | 未同时处理在线 reveal + 异构 P-D + decode 容量约束 |

论文 characterization 实验表明：仅把 per-call FCFS 换成 workflow-level FCFS，Req95 平均降 **31.4%**；再加上 HexAGenT 的异构放置，Req95 再降 **26.9%**（相对 Workflow-FCFS）。

---

## 核心概念

### 1. 在线揭示的工作流 DAG

工作流 \(G_w = (V, E)\)：

- **节点** \(v \in V\)：一次 LLM call（带 input length、预估 output length、workflow id）。
- **边** \((u, v) \in E\)：\(v\) 必须等 \(u\)（及可能的外部 tool）完成后才可调度。

**关键性质**：到达时只有**源节点**可见；父节点完成 → 子节点进入 **runnable frontier**（就绪前沿）。调度器永远在对「当前已揭示子图」做决策，而非静态 DAG。

```python
from dataclasses import dataclass, field
from typing import Dict, List, Set
import time

@dataclass
class LLMCall:
    call_id: str
    workflow_id: str
    prompt_tokens: int
    parents: List[str] = field(default_factory=list)
    children: List[str] = field(default_factory=list)
    status: str = "pending"  # pending | prefill | decode | done

class OnlineWorkflowDAG:
    """Agent 工作流：子节点随父节点完成而在线 reveal。"""

    def __init__(self, workflow_id: str, source_calls: List[LLMCall]):
        self.workflow_id = workflow_id
        self.arrival_time = time.time()
        self.calls: Dict[str, LLMCall] = {c.call_id: c for c in source_calls}
        self.done: Set[str] = set()

    def runnable_calls(self) -> List[LLMCall]:
        """就绪前沿：所有 parent 已完成、自身未开始的 call。"""
        ready = []
        for c in self.calls.values():
            if c.status != "pending":
                continue
            if all(p in self.done for p in c.parents):
                ready.append(c)
        return ready

    def on_call_complete(self, call_id: str, revealed_children: List[LLMCall]):
        self.done.add(call_id)
        self.calls[call_id].status = "done"
        for child in revealed_children:
            self.calls[child.call_id] = child  # 在线 reveal 新节点
```

### 2. Standalone horizon \(H_w(t)\)

\(H_w(t)\) = 在**同一 P-D 集群**上，若 workflow \(w\) 在时刻 \(t\) 已揭示的子图 \(G_w(t)\) **独占运行**所需的完成时间（makespan）。

- 工作流刚到达时，只知道第一步 → \(H_w(t)\) 较小。
- 新 call reveal 或 tool 返回 → 子图变大 → \(H_w(t)\) **动态上调**。
- 真实服务时间观测到后，可用实测值修正估计。

这是 HexAGenT 的「deadline 代理」：优化目标不是绝对秒数，而是 **scaled-SLO**——完成时间 \(C_w\) 是否 ≤ \(\alpha \cdot H_w\)。

### 3. Scaled-SLO 与 Req95 / Req99

对每个 workflow \(w\)，若 \(C_w \leq \alpha H_w\) 则视为满足 SLO。

- **Req95**：使 ≥95% workflow 达标的**最小** \(\alpha\)。
- **Req99**：使 ≥99% workflow 达标的**最小** \(\alpha\)。

\(\alpha\) 越小说明调度越「紧」——同样硬件下更容易按时完成整条 Agent 链。HexAGenT 在异构集群上相对最强基线，Req95 平均降 **20.1%**，Req99 平均降 **33.0%**（最大分别 **45.0%** / **80.5%**）。

### 4. Projected ratio（投影风险比）

对就绪 call \(c\)（属于 workflow \(w\)），在阶段 \(s \in \{\mathrm{Prefill}, \mathrm{Decode}\}\)：

\[
R_s(c, t) = \frac{(t - a_w) + \Delta_s(c, t)}{H_w(t)}
\]

- \(a_w\)：workflow 到达时间。
- \((t - a_w)\)：已流逝时间。
- \(\Delta_s(c, t)\)：从**现在**起，若把 \(c\) 放到当前最优候选实例，预计在该阶段完成所需时间（含排队、prefill/decode 执行、KV 传输）。

**\(R_s\) 越大 → 越 urgent**（workflow 越接近或已超过 horizon）。HexAGenT 在 prefill/decode 两个阶段都用该信号排序。

### 5. Prefill–Decode 联合规划

P-D 分离下，一次 LLM call 的生命周期：

```
等待 prefill → Prefill 执行 → KV 传输 → 等待 decode 容量 → Decode 执行 → 完成 → reveal 子 call
```

HexAGenT 在 **prefill 调度阶段**就选定 decode instance（bootstrap），以便 prefill 完成后 KV 知道往哪搬。异构集群里，跨 GPU 代际的 KV 传输带宽更低，联合规划会惩罚「快 prefill + 慢传输 + 慢 decode」的组合。

### 6. Decode KV 容量约束

Decode 实例 \(d\) 有 KV cache 上限 \(\mathrm{Cap}(d)\)。call \(c\) 的内存需求近似：

\[
m(c) = L_{\mathrm{in}}(c) + \widehat{L}_{\mathrm{out}}(c)
\]

仅当 \(m(c) \leq \mathrm{Cap}(d)\) 时可准入。Output length 用 proxy 模型预测（类似 SSJF 思路）。

---

## 系统架构（四组件）

```
用户 Agent 请求
      ↓
┌─────────────────┐
│ Workflow Front-end │  维护在线 DAG、runnable frontier、horizon 更新
└────────┬────────┘
         ↓ 就绪 call
┌─────────────────┐
│ Global Scheduler │  State Collector → Estimator → Joint Planner → Plan Dispatcher
└────────┬────────┘
         ↓ 放置 + 优先级
┌──────────────────────────────────────┐
│ P-D Serving Cluster                   │
│  Prefill Pool (A100/H100/H200...)     │
│  Decode Pool  (A100/H100/H200...)     │
└────────┬─────────────────────────────┘
         ↓
   External Tools / LLM APIs
```

**Scheduler 内部四模块**：

| 模块 | 职责 |
|------|------|
| **State Collector** | 收集 prefill/decode 队列、运行中 call、KV 使用率、传输状态、workflow 进度 |
| **Estimator** | Roofline 风格估计 prefill/decode/传输延迟与 decode 内存需求 |
| **Joint Planner** | 算 projected ratio，贪心选 prefill–decode 对与队列优先级 |
| **Plan Dispatcher** | 异步下发计划；已开始服务的 call 不再迁移 |

**事件驱动重调度触发点**：workflow 到达、decode 完成 reveal 新 prefill 工作、KV 传输完成进入 decode 等待。

---

## 调度算法直觉与代码示例

### 示例 1：计算 projected ratio 并选最 urgent call

下面是对论文公式 (2) 的简化 Python 示意（教学用，非论文源码）：

```python
from dataclasses import dataclass
from typing import List, Tuple

@dataclass
class PlacementCandidate:
    prefill_id: str
    decode_id: str
    projected_finish: float  # 从 now 到 decode 完成的预计时间

def projected_ratio(
    now: float,
    arrival: float,
    horizon: float,
    delta: float,
) -> float:
    """R_s(c,t) = ((t - a_w) + Δ_s(c,t)) / H_w(t)"""
    if horizon <= 0:
        return float("inf")
    elapsed = now - arrival
    return (elapsed + delta) / horizon

def pick_most_urgent_prefill_call(
    ready_calls: List[dict],
    horizons: dict,
    arrivals: dict,
    enumerate_placements,
    now: float,
) -> Tuple[dict, PlacementCandidate]:
    """在 prefill 阶段：枚举 (prefill, decode) 对，取 R_P 最大的 call。"""
    best_call, best_place, best_score = None, None, -1.0

    for call in ready_calls:
        wid = call["workflow_id"]
        H = horizons[wid]
        candidates = enumerate_placements(call)  # 返回 List[PlacementCandidate]
        best_for_call = min(candidates, key=lambda p: p.projected_finish)
        score = projected_ratio(
            now, arrivals[wid], H, best_for_call.projected_finish
        )
        if score > best_score:
            best_score = score
            best_call = call
            best_place = best_for_call

    return best_call, best_place
```

**解读**：不是「谁先到谁先 prefill」，而是「谁会让 workflow 最接近超标」谁先上；且 \(\Delta\) 里已经嵌入了**在异构实例上的预计完成时间**。

### 示例 2：事件驱动调度主循环（Algorithm 1 简化）

```python
def hexagent_event_loop(event, t, state, planner_in_flight):
    """
    event ∈ {workflow_arrival, prefill_done, transfer_done, decode_done}
    论文：prefill/decode 调度在 arrival、新 reveal、transfer 完成时触发。
    """
    update_queues_and_kv(state, event)
    update_horizons(state, event)  # H_w(t) 随 reveal 重算

    triggered_stages = stages_to_schedule(event)  # subset of {PREFILL, DECODE}

    for stage in triggered_stages:
        if planner_in_flight[stage]:
            apply_fallback_if_needed(state, stage)
            continue

        waiting = state.waiting_calls(stage)
        sim_state = state.snapshot()
        plan = []

        while waiting:
            scores = []
            for call in waiting:
                placement, delta = project_best_feasible(sim_state, call, stage)
                R = projected_ratio(
                    t,
                    state.arrival[call.workflow_id],
                    state.horizon[call.workflow_id],
                    delta,
                )
                scores.append((R, call, placement))

            call_star = max(scores, key=lambda x: x[0])
            plan.append(call_star)
            sim_state.apply(call_star[1])  # 更新模拟队列与 KV 占用
            waiting.remove(call_star[1])

        dispatch_async(plan, stage)  # 只更新仍在等待的 call
```

**贪心 + 模拟状态**：每选一个 call 就更新模拟集群状态，再重算剩余 call 的 urgency——避免「局部最优 prefill 实例」导致 decode 端拥塞。

### Prefill vs Decode 调度差异

| 阶段 | 优化目标 | 额外约束 |
|------|----------|----------|
| **Prefill** | 最小化 projected decode finish | 联合选 decode；考虑 KV 传输带宽 |
| **Decode** | 同样用 \(R_D\) | KV 容量 feasibility；locked vs free placement |

- **Locked call**：prefill 阶段已绑定 decode instance，只能在该实例内重排。
- **Free call**：可在任意可行 decode 实例间选择。

队列较小时用**重算贪心**；队列大时用**一次排序**控制调度开销。

---

## 实验设置与主要结果

###  workload

| Trace | 特点 | 规模示例 |
|-------|------|----------|
| **ShareGPT** | 顺序对话链 | 100 workflows @ 10/s |
| **BFCL-v3** | 工具调用、频繁 reveal | 400 @ 40/s |
| **LATS** | 树搜索、burst fan-out | 100 @ 40/s |
| **Mixed** | 三者混合 | 100 @ 10/s |

模型：**Llama3.1-70B**、**Qwen3-235B-A22B**。

集群：**Hetero-1** = 8P+8D（每池 2×A100 + 3×H100 + 3×H200）；**Hetero-2** = 10P+10D（3/4/3 配比）。

### 基线

- **SGLang-FCFS**：workflow 级 FCFS + 负载均衡 dispatch。
- **SGLang-LLF**：workflow 级 least-laxity-first。
- **Autellix-ATLAS**：program-aware attained-service 策略适配。

### Characterization 表（Req95 / Req99，越小越好）

| Model | Trace | Per-call FCFS | Workflow-FCFS | HexAGenT |
|-------|-------|---------------|---------------|----------|
| Llama | ShareGPT | 5.85 / 7.43 | 4.50 / 6.22 | **2.50 / 2.60** |
| Llama | BFCL-v3 | 13.81 / 17.23 | 7.23 / 9.80 | **6.21 / 6.34** |
| Qwen | BFCL-v3 | 21.11 / 26.89 | 9.64 / 11.67 | **8.39 / 8.57** |
| Qwen | Mixed | 11.15 / 15.84 | 10.30 / 15.01 | **3.48 / 3.94** |

**Mixed + Qwen** 上 HexAGenT 相对 Workflow-FCFS 的 Req95 从 10.30 降到 3.48——说明**仅靠 workflow 排序不够，异构放置是第二杠杆**。

###  headline 汇总

相对最强基线，HexAGenT 使达标所需 SLO 缩放因子 \(\alpha\)：

- **95% 达标**：平均降 **20.1%**（最大 **45.0%**）
- **99% 达标**：平均降 **33.0%**（最大 **80.5%**）

尾延迟（Req99）收益更大：workflow 级调度对「慢 Agent 链」更敏感。

---

## 实现要点

- **底座**：SGLang v0.5.9 P-D disaggregated serving。
- **调度器位置**：Python gateway/router，**不在 GPU hot path**。
- **模拟器**：~4.6K 行 Python，建模完整 call 生命周期与异步调度，用于估计 \(H_w\) 与 \(\Delta_s\)。
- **异步规划**：求解进行中 serving 不阻塞；未分配 call 可采纳新计划，已开跑则状态以 runtime 为准。

---

## 与相关工作的关系

```text
           单请求 serving          P-D 分离              Program-aware
                │                      │                        │
           vLLM/SGLang            DistServe/Splitwise      Parrot/Hermes/Autellix
                │                      │                        │
                └──────────────────────┴────────────────────────┘
                                       │
                              HexAGenT 填补的交集：
                    在线 DAG + 异构 P-D + workflow SLO + decode 容量
```

- **Call-level SJF / slack / LTR**：改善单请求，**看不见 DAG 关键路径**。
- **HexGen / SkyServe**：异构 LLM serving，但**非 Agent workflow 调度**。
- **Hermes / Continuum**：向 program 级调度迈进，论文认为尚未同时处理在线 reveal + 异构 joint placement + decode KV 约束。

---

## 局限与开放问题

1. **Horizon 估计误差**：\(H_w(t)\) 依赖 reveal 后子图与 latency 模型；极端 tool 延迟或 output 长度预测偏差会削弱 projected ratio 的有效性（论文 Q3 讨论鲁棒性）。
2. **调度开销 vs 质量**：异步规划若过慢，更多 call 在 fallback 策略下运行。
3. **Scope**：聚焦 P-D 分离集群上的**调度策略**；不包含 Agent 逻辑本身（planning 算法、tool 选择）的优化。
4. **迁移成本**：call 一旦开始 prefill/decode 即固定实例——动态抢占不在设计目标内。

---

## 给零基础读者的 takeaway

1. **Agent serving 的基本单位是 workflow**，调度目标应是端到端 SLO，不是单次 LLM 延迟。
2. **DAG 是在线长出来的**，调度器必须在「部分信息」下持续更新 horizon 与优先级。
3. **P-D 分离把一个问题拆成两个队列 + 一次 KV 搬运**，必须 prefill/decode **联合**考虑。
4. **异构 GPU 不是噪声，是调度信号**——同一 call 在不同实例上的完成时间不同，选错会拖垮整条 Agent 链。
5. **Projected ratio** 是直观抓手：「这条 workflow 再不快就要超标了」→ 优先服务能最快把它拉回 horizon 内的 call + 放置组合。

---

## 延伸阅读

- **P-D 分离**：DistServe (Zhong et al.), Splitwise (Patel et al.)
- **Agent 工作负载**：ReAct, LATS, BFCL-v3
- **Program-aware serving**：Parrot, Hermes, Autellix, Continuum
- **异构 LLM serving**：HexGen, ThunderServe, SkyServe
- **论文全文**：https://arxiv.org/abs/2605.16637
