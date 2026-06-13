---
title: Infinite-LLM — 用「分布式注意力」打破长文本的显存墙
来源: https://arxiv.org/abs/2401.02669
日期: 2026-06-13
分类: 分布式系统
子分类: 长上下文
provenance: pipeline-v3
---

## 从日常类比开始：图书馆里的「抄笔记」

想象一个大型图书馆（GPU 集群），读者（LLM 请求）需要查阅大量书籍（长文本 context）来做研究报告。

**传统做法**：每个读者分配一个**独立的书桌**。书少的读者（短 context）桌子大空着；书多的读者（长 context）桌子不够放，只能把书堆在地上——但堆在地上的书没法高效查阅。更麻烦的是，**所有书桌之间不能共享空间**，A 桌的空位 B 桌用不了。

**Infinite-LLM 的做法**：把"读书"和"抄笔记"分开。
- **读书记（模型权重计算）**：仍在各自书桌上完成——这步计算量固定，跟读多少书无关。
- **抄笔记（Attention + KV Cache）**：可以借到任何其他书桌的桌面上写。你不需要把整本书搬到别的桌子，只需告诉对方"我注意到你在第 37 页记了些东西，能告诉我你写了什么摘要吗？"——对方只需回传一个小小的摘要卡片（几个 KB），而不是整页书（几百 GB 的 KV cache）。

一句话：**Infinite-LLM 让 Attention 计算可以跨实例分布式执行，KV Cache 可以借来借去，集群的整体显存利用率从此不再被单个实例的物理边界锁死。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | *Infinite-LLM: Efficient LLM Service for Long Context with DistAttention and Distributed KVCache* |
| 会议 | ASPLOS 2025（经 peer-review） |
| arXiv | [2401.02669](https://arxiv.org/abs/2401.02669) |
| 作者 | Lin Bin 等（阿里巴巴 + 上海交大 + 北大） |
| 开源 | 未开源（论文系统原型） |
| 实验规模 | 32 × A100 GPU，上下文长度 1 到 2000K tokens |

Infinite-LLM 解决的是 LLM 推理服务中长期被忽视的一个问题：**Attention 层和非 Attention 层的资源需求是截然不同的。**

- **非 Attention 层（FFN、Linear）**：计算量固定，不随 context 长度变化。batch 越大越好，受益于 GEMM 并行。
- **Attention 层**：显存需求随 context 长度线性增长，计算量也随 context 变大。它**不受益于 batch 增大**。

现有系统（vLLM、Orca、Sarathi-Serve 等）用**静态模型并行**（Tensor Parallelism / Pipeline Parallelism）给整层模型分 GPU——短请求分了 8 张卡是浪费，长请求 1 张卡又装不下 KV Cache。

Infinite-LLM 的核心洞察：**把 Attention 层从模型中抽出来，独立调度。** 这引出了两个关键创新：

1. **DistAttention** — 数学等价变换，让 Attention 可以跨实例分布式计算，只需传递 KB 级数据而非 GB/TB 级 KV Cache。
2. **集群级 KV Cache 调度** — 将全集群 GPU 显存视为一个池子，"借"和"贷"的实例之间动态调度 KV Cache 分块。

---

## 核心概念

### 1. DistAttention：把 Attention "切碎"

标准 Attention 的计算公式是：

```
Attention(Q, K, V) = Σᵢ [ exp(Q·Kᵢᵀ - m_g) / Σⱼ exp(Q·Kⱼᵀ - m_g) ] · Vᵢ

其中 m_g = max(Q·K₁, ..., Q·K_seq)  —— 全局最大值
```

问题在于：`m_g` 需要**所有 sequence 上的 Q·K 值**才能算出来。如果你把 KV Cache 分到多台机器上，每台机器只知道自己那部分——每次 attention 计算都得把全部 KV Cache 拉回来，传输量是 GB 甚至 TB 级的。

**DistAttention 的解法**：借鉴 Online Softmax 的思想，把全局最大值拆解为两层：

```
第一步（本地 MicroAttention）：
  m_j = max(Q·K₁, ..., Q·K_seqp)    ← 每台机器只算自己的局部最大值
  e_j = Σᵢ exp(Q·Kᵢᵀ - m_j)         ← 局部归一化累加器

第二步（全局聚合）：
  m_g = max(m₁, ..., m_b)            ← 收集 b 台机器的局部最大值，算全局最大值
  e_g = Σⱼ e_j · exp(m_j - m_g)     ← 收集 b 台机器的 e_j，算全局累加器

第三步（加权合并）：
  Attention = Σⱼ [ MA_j · exp(m_j - m_g) / e_g ]
```

每台机器只需要回传**三个小数值**：`m_j`（局部最大值）、`e_j`（局部累加器）、以及 MA_j 的结果（输出向量片段）。对于一个 batch size=1 的请求，这三个值的总大小只有**几千字节**。

```python
# 伪代码：DistAttention 的本地计算（每个 GPU 实例上运行）

class DistAttention:
    def micro_attention(self, Q, K_local, V_local):
        """
        Q:        query 向量      [hidden_dim]
        K_local:  本机的 KV cache 块  [seq_p, hidden_dim]
        V_local:  本机的 V cache 块  [seq_p, hidden_dim]
        返回: (m_local, e_local, ma_result)
        """
        # 1. 计算 Q 与本地 KV 的 attention scores
        scores = torch.matmul(Q, K_local.T)  # [seq_p]

        # 2. 局部最大值 (Online Softmax 的核心 trick)
        m_local = scores.max()

        # 3. 局部归一化累加 + 加权 V 求和
        exp_scores = torch.exp(scores - m_local)  # 数值稳定
        weights = exp_scores / exp_scores.sum()
        ma_result = torch.matmul(weights, V_local)  # [hidden_dim]

        # 4. 局部 e 值（用于后续全局归一化）
        e_local = exp_scores.sum()

        return m_local, e_local, ma_result

    def global_aggregate(self, results_from_all_instances):
        """
        results_from_all_instances: list of (m_j, e_j, ma_j)
        来自 b 个实例的局部结果，在这里合并
        """
        # 收集所有局部最大值
        m_values = [r[0] for r in results_from_all_instances]
        m_global = max(m_values)

        # 计算全局归一化常数
        e_global = sum(
            r[1] * math.exp(r[0] - m_global)
            for r in results_from_all_instances
        )

        # 加权合并所有局部 MA 结果
        output = torch.zeros_like(results_from_all_instances[0][2])
        for m_j, e_j, ma_j in results_from_all_instances:
            weight = math.exp(m_j - m_global) / e_global
            output += weight * ma_j

        return output
```

### 2. 集群级 KV Cache 调度：债务人与债权人

有了 DistAttention，KV Cache 就不再需要"完整存放在一台机器上"。Infinite-LLM 把集群分成两类角色：

- **债务人（Debtor）**：自己的显存不够放 KV Cache，需要向别人"借"空间。例如一个处理 1000K token 长文档的实例。
- **债权人（Creditor）**：显存有富余，可以"借"空间给别人。例如处理多个短请求（几百 token）的实例。

```python
# 伪代码：调度器决策逻辑

class KVScheduler:
    def __init__(self, cluster_instances):
        self.instances = cluster_instances
        # 每个实例的可用内存块数
        self.free_blocks = {inst.id: inst.free_memory_blocks for inst in cluster_instances}

    def decide_lend_borrow(self):
        """
        贪心调度：每次选择一个最有价值的"借-贷"配对
        """
        # 1. 识别债务人（内存不够放的实例）
        debtors = [
            inst for inst in self.instances
            if inst.needed_blocks > inst.available_blocks
        ]

        # 2. 识别债权人（有内存富余的实例）
        creditors = [
            inst for inst in self.instances
            if inst.free_blocks > MIN_THRESHOLD
        ]

        # 3. 贪心选择：每次选一个能最大化集群吞吐的配对
        while debtors and creditors:
            best_pair = None
            best_throughput_gain = 0

            for debtor in debtors:
                for creditor in creditors:
                    # 预估传输 N 个 block 后的集群总吞吐
                    gain = self.estimate_throughput_gain(
                        debtor=debtor,
                        creditor=creditor,
                        num_blocks=min(creditor.free_blocks, debtor.needed_blocks)
                    )
                    if gain > best_throughput_gain:
                        best_throughput_gain = gain
                        best_pair = (debtor, creditor, gain)

            if best_pair is None:
                break

            debtor, creditor, gain = best_pair
            # 执行调度：将 KV Cache 分块从债务人迁移到债权人
            num_blocks = min(creditor.free_blocks, debtor.needed_blocks)
            self.migrate_kv_blocks(debtor, creditor, num_blocks)

            # 更新状态
            debtor.free_up_blocks(num_blocks)
            creditor.lend_blocks(num_blocks)

            # 重新评估角色
            self._update_roles()

    def estimate_throughput_gain(self, debtor, creditor, num_blocks):
        """
        基于性能模型估算集群吞吐增益
        参考论文 Equation 5：
          T_layer(β, S) = max(
              W(β) / f(β),   # 非注意力层受 batch 影响
              S / g(S)        # 注意力层受 context 长度影响
          )
        """
        current_total = self.compute_cluster_throughput()

        # 模拟迁移后的状态
        simulated_debtor = self.simulate_migration(debtor, creditor, num_blocks)
        simulated_creditor = self.simulate_migration(creditor, debtor, num_blocks)

        # 迁移后：债务人 batch 变大（吞吐涨），债权人 batch 不变（影响小）
        new_total = current_total \
            - simulated_debtor.compute_throughput() \
            - simulated_creditor.compute_throughput() \
            + debtor.compute_throughput() \
            + creditor.compute_throughput()

        return new_total
```

### 3. gManager / rManager：集中式调度 + 分布式执行

```
                    +------------+
                    | gManager   |  ← 全局调度决策（知道所有实例的状态）
                    | (大脑)      |
                    +-----+------+
                          |  RPC
              +-----------+-----------+
              |           |           |
        +-----v----+ +-----v----+ +-----v----+
        | rManager | | rManager | | rManager |  ← 每台机器一个本地管理器
        | (Node A) | | (Node B) | | (Node C) |
        +-----+----+ +-----+----+ +-----+----+
              |           |           |
        +-----v----+ +-----v----+ +-----v----+
        | GPU 0..7 | | GPU 0..7 | | GPU 0..7 |
        +----------+ +----------+ +----------+
```

- **gManager**：全局协调器，维护所有实例的 KV Cache 布局、内存使用情况，运行调度算法。
- **rManager**：每个物理节点上的本地管理器，执行实际的 KV Cache 迁移、DistAttention 计算调度。

通信开销优化：KV Cache 传输与本地计算**重叠**（Pipeline），让数据传输"隐形"。

---

## 为什么重要

- **短请求不再被长请求拖累**：传统系统里，一张卡上一个长请求就会吃掉全部显存，其他短请求排队等。Infinite-LLM 让长请求的 KV Cache 可以"溢出"到空闲的卡上。
- **长请求不再被单卡卡住**：2000K token 的上下文，传统单 A100（80GB）根本放不下。Infinite-LLM 用 32 张卡轻松支持。
- **吞吐提升 1.35-3.4x**：在 32 × A100 的集群上，相比 vLLM / Orca 等 SOTA 方法。

---

## 一句话总结

**Infinite-LLM = 把 Attention 层从模型中独立出来，用 DistAttention 让它能跨机器分布式计算，然后用一个"借内存"的调度器把全集群显存变成一个超级大池子。**

---

## 思考题

1. DistAttention 的 Online Softmax 变换和 vLLM 的 PagedAttention 各自解决什么问题？它们的正交性如何？
2. 论文中的"债务人/债权人"模型和 Cassandra 的"种子节点/副本"机制有什么类比关系？
3. 如果 gManager 挂了怎么办？论文提到集中式调度，这在生产环境中是单点故障吗？

（等你的回答后，我们继续深入下一部分。）
