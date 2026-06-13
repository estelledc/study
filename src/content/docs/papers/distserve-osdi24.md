---
title: DistServe — 把"动笔写文章"和"逐字念出来"分开做
来源: https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin
日期: 2026-06-13
分类: 其他
子分类: 系统
provenance: pipeline-v3
---

# DistServe: Disaggregating Prefill and Decoding for Goodput-optimized Large Language Model Serving

## 一、一个日常类比

想象你在餐厅点了一份需要现做的牛排（比如五分熟），而服务员只需要念出菜单上的菜名。

- **Prefill（预填充）** = 厨师花 10 分钟煎牛排。这是一次性的大工程，要同时处理很多食材（输入 token），计算量很大，但只做一次。
- **Decoding（解码）** = 服务员每隔 2 秒念出一道菜名（输出 token）。每次只做一个动作，但要做很多次，而且每次都要翻一下之前的菜单（KV Cache）。

现在的问题是：如果只有一个厨师兼服务员（传统系统的做法），他会很纠结——煎牛排的时候没法念菜名，念菜名的时候牛排又凉了。结果就是：要么牛排做得慢（TTFT 高），要么念菜名也慢（TPOT 高）。

**DistServe 的做法**：找一个厨师专门煎牛排，找一个服务员专门念菜名，两人分工合作，互不干扰。

## 二、核心概念

### 2.1 LLM 推理的两个阶段

大语言模型生成回复分两步：

```
用户输入: "北京有什么好玩的地方？"

第 1 步 — Prefill（并行处理所有输入 token）:
  "北" + "京" + "有" + "什" + "么" + "好" + "玩" + "的" + "地" + "方" + "？"
  → 一次性全部算完，生成第一个输出 token

第 2 步 — Decoding（逐个生成输出 token）:
  第 1 轮: 生成 "北"        → 需要记住之前所有的 KV Cache
  第 2 轮: 生成 "京"        → 需要记住之前所有的 KV Cache
  第 3 轮: 生成 "有"        → 需要记住之前所有的 KV Cache
  ...一直生成到停止符
```

- **TTFT（Time to First Token）** = 从发出请求到看到第一个输出字的时间。**Prefill 阶段主导**。
- **TPOT（Time Per Output Token）** = 每生成一个字花费的时间。**Decoding 阶段主导**。

### 2.2 传统系统的痛点

传统系统（如 vLLM、DeepSpeed-MII）把两个阶段放在同一批 GPU 上，用"连续批处理"（continuous batching）的方式混合执行：

```
传统系统的时间线（一个问题卡住另一个）:

时间 →
│████████████████ Prefill (1000ms) ████████ Decode (50ms) ████████ Decode (50ms) ...
│         ↑ 解码被预填充阻塞了！TPOT 暴涨
│
│████████████████ Prefill (1000ms) ████████ Decode (50ms) ...
│         ↑ 预填充被解码拖慢了！TTFT 也涨了
```

论文发现两个核心问题：

1. **Prefill-Decoding 干扰**：Prefill 计算量大（compute-bound），Decoding 受内存带宽限制（memory-bandwidth-bound）。混在一起，互相拖后腿。
2. **资源分配耦合**：两个阶段需要不同的并行策略（intra-op vs inter-op），但共用 GPU 导致无法分别优化。

### 2.3 DistServe 的解决方案

```
DistServe 的时间线（各司其职）:

Prefill GPU 集群: │████ Prefill → 产出 KV Cache →──┐
                   │                                  ├─→ 传输 KV Cache ─→ Decoding GPU 集群: │████████████ Decode (快!)████████████ ...
Decoding GPU 集群: │                                  │
                   │──────────────────────────────────┘
```

关键设计：

- **物理分离**：Prefill 和 Decoding 跑在不同的 GPU 上，彻底消除干扰。
- **独立优化**：每个阶段可以用不同的 GPU 数量、不同的并行策略。
- **智能调度**：根据 TTFT 和 TPOT 的 SLO 要求，自动找到最优的资源分配方案。

## 三、代码示例

### 示例 1：理解 SLO 与 Goodput 的关系

```python
"""
DistServe 的核心目标：最大化 per-GPU goodput。

Goodput 定义：在保证 SLO 达成率的前提下，每块 GPU 每秒能服务的请求数。

假设我们有两个应用：
  - 聊天机器人：TTFT SLO = 0.25s，TPOT SLO = 0.1s（要快响应）
  - 文档摘要：   TTFT SLO = 15s，TPOT SLO = 0.15s（可以等，但要生成得快）
"""

def calculate_goodput(model, gpu_count, ttft_slo, tpot_slo, arrival_rate):
    """
    计算 per-GPU goodput。
    只有当 >= 90% 的请求同时满足 TTFT 和 TPOT SLO 时，才算有效 goodput。
    """
    # 模拟每个阶段的延迟
    ttft_actual = simulate_prefill_latency(model, gpu_count, arrival_rate)
    tpot_actual = simulate_decode_latency(model, gpu_count, arrival_rate)

    # 检查 SLO 达成率
    ttft_met = ttft_actual <= ttft_slo
    tpot_met = tpot_actual <= tpot_slo

    if ttft_met and tpot_met:
        goodput_per_gpu = arrival_rate / gpu_count
        return {
            "status": "SLO met",
            "goodput_per_gpu": goodput_per_gpu,
            "ttft_actual_ms": ttft_actual * 1000,
            "tpot_actual_ms": tpot_actual * 1000,
        }
    else:
        return {
            "status": "SLO violated",
            "ttft_actual_ms": ttft_actual * 1000,
            "tpot_actual_ms": tpot_actual * 1000,
        }


# 对比：传统系统 vs DistServe
# 论文数据：OPT-13B 在 ShareGPT 数据集上，90% SLO 达成率
traditional = calculate_goodput(
    model="OPT-13B", gpu_count=1,
    ttft_slo=0.25, tpot_slo=0.1, arrival_rate=1.6
)
# → goodput = 1.6 req/s per GPU，受限于更严格的 SLO

distserve = calculate_goodput(
    model="OPT-13B", gpu_count=3,  # 2 GPU 做 prefill, 1 GPU 做 decoding
    ttft_slo=0.25, tpot_slo=0.1, arrival_rate=10.0
)
# → goodput = 3.3 req/s per GPU，提升 2.1 倍
```

### 示例 2：DistServe 的放置算法（简化版）

```python
"""
DistServe 的核心算法：为 Prefill 和 Decoding 分别选择最优的并行策略。

两种并行策略：
  - Intra-op（算子内并行）：把一个大矩阵乘法拆到多块 GPU 上算 → 加速计算，但有通信开销
  - Inter-op（算子间并行）：把模型的每一层分配到不同 GPU 上流水线执行 → 线性扩展吞吐量

DistServe 的思路：枚举所有可能的配置组合，用模拟器估算每种配置的 goodput，选最好的。
"""

def find_best_placement(model_size_gb, gpu_memory_gb, num_gpus_per_node,
                        ttft_slo, tpot_slo, arrival_rate):
    """
    为给定模型和工作负载找到最优的 Prefill/Decoding 放置方案。

    参数:
      model_size_gb: 模型大小（FP16 下 OPT-13B ≈ 26GB）
      gpu_memory_gb: 单块 GPU 显存（A100 80GB）
      ttft_slo: Prefill 的延迟上限（秒）
      tpot_slo: Decoding 的延迟上限（秒）
    """
    best_config = None
    best_goodput = 0

    # 枚举 Prefill 的并行配置
    for prefill_intra in range(1, num_gpus_per_node + 1):
        for prefill_inter in range(1, prefill_intra + 1):
            prefill_gpus = prefill_intra * prefill_inter
            if prefill_gpus > len(gpus_available):
                continue

            # 模拟 Prefill 的 goodput
            p_goodput = simulate_prefill_goodput(
                model=model_size_gb,
                intra_op=prefill_intra,
                inter_op=prefill_inter,
                arrival_rate=arrival_rate,
                ttft_slo=ttft_slo,
            )

            # 枚举 Decoding 的并行配置
            for decode_intra in range(1, num_gpus_per_node + 1):
                for decode_inter in range(1, decode_intra + 1):
                    decode_gpus = decode_intra * decode_inter
                    if decode_gpus > len(gpus_available):
                        continue

                    d_goodput = simulate_decode_goodput(
                        model=model_size_gb,
                        intra_op=decode_intra,
                        inter_op=decode_inter,
                        arrival_rate=arrival_rate,
                        tpot_slo=tpot_slo,
                    )

                    # 总 goodput = min(prefill goodput, decoding goodput)
                    # 因为两个阶段是串行的，瓶颈决定了整体 throughput
                    total_goodput = min(p_goodput, d_goodput)
                    total_gpus = prefill_gpus + decode_gpus

                    if total_goodput / total_gpus > best_goodput:
                        best_goodput = total_goodput / total_gpus
                        best_config = {
                            "prefill": {"gpus": prefill_gpus, "intra": prefill_intra, "inter": prefill_inter},
                            "decoding": {"gpus": decode_gpus, "intra": decode_intra, "inter": decode_inter},
                            "goodput_per_gpu": total_goodput / total_gpus,
                        }

    return best_config


# 论文中的实际结果举例：
# OPT-13B, ShareGPT, TTFT=0.25s, TPOT=0.1s
# → Prefill: 2 GPU (intra=1, inter=2)
# → Decoding: 1 GPU  (intra=1, inter=1)
# → Per-GPU goodput: 3.3 req/s (vs vLLM 的 1.6 req/s)
```

## 四、DistServe 的运行架构

```
                    请求到达
                       │
              ┌────────▼────────┐
              │   Controller    │  ← 集中控制器，FCFS 调度
              └────────┬────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   ┌─────────────┐          ┌─────────────┐
   │ Prefill GPU │          │ Decoding GPU│
   │  Instance   │──KV──────│  Instance   │
   │  (独立优化)  │ Cache    │  (独立优化)  │
   └─────────────┘  传输     └─────────────┘
```

论文还讨论了两种部署场景：

- **高节点亲和（High Node-Affinity）**：跨节点带宽高（如 InfiniBand），Prefill 和 Decoding 可以放任意节点。
- **低节点亲和（Low Node-Affinity）**：跨节点带宽有限，要求 Prefill 和 Decoding 的同阶段放在同一节点内，通过 NVLink 传输 KV Cache。

## 五、实验结果速览

| 对比项 | vLLM | DistServe | 提升倍数 |
|--------|------|-----------|----------|
| OPT-13B Chatbot 最大请求率 | 1.6 req/s/GPU | 2.0-4.6× 更高 | 2.0-4.6× |
| OPT-66B Code Completion | 1.0 req/s/GPU | 5.7× 更高 | 5.7× |
| OPT-66B Summarization SLO | 基准 | 12.6× 更严格 | 12.6× |
| SLO 达成率 > 90% | 受限于 TPOT | 两个阶段独立优化 | 全面超越 |

KV Cache 传输开销极小：即使对于最大的 OPT-175B 模型，传输时间也只占总延迟的不到 0.1%，超过 95% 的请求传输延迟低于 30ms。

## 六、我的理解

DistServe 的核心洞察非常朴素但有力：**两个特性完全不同的工作负载，不应该挤在同一组资源上竞争**。

Prefill 像厨师——计算密集、一次性大工程；Decoding 像服务员——内存带宽受限、持续不断的细活。把它们分开，各自用最适合的方式优化，就能在不增加硬件成本的情况下显著提升性能。

这就像软件工程中的"单一职责原则"——一个模块只做一件事，而且把它做好。DistServe 把这个原则用在了系统架构层面。

## 七、思考题

1. 如果 Prefill 和 Decoding 完全分开，那模型权重也需要存两份（一份在 Prefill GPU，一份在 Decoding GPU），这会不会浪费显存？论文中是怎么处理的？
2. DistServe 假设 Prefill 和 Decoding 之间要传输 KV Cache。如果模型非常大（比如 175B+），KV Cache 也很大，这种情况下传输开销还能忽略不计吗？
3. 论文提到 DistServe 不适合"资源受限"的场景（只有一两块 GPU）。为什么？在这种场景下，传统的 colocated 方案反而更好吗？

带着这些问题，你可以继续阅读论文的第 4 节（Method）和第 7 节（Discussion），看看作者怎么回答这些问题的。
