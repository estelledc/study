---
title: KVBudget: Per-Request KV Cache Budgeting in vLLM-style Serving
来源: https://arxiv.org/abs/2605.30821
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# KVBudget: Per-Request KV Cache Budgeting in vLLM-style Serving

## 一、先从生活场景说起

想象你在一家咖啡馆（这就是 GPU）里工作。厨房只有有限的位置（这就是显存）。
每位顾客点一杯不同的咖啡（这代表一个请求），每杯咖啡需要占用不同的台面空间（这就是 KV Cache 的大小）。

在没有预算管理的咖啡馆，第一位顾客点了超大杯，占满了整个台面。后面的顾客只能等着，
或者咖啡师临时把前面顾客的咖啡倒掉——但这样第一位顾客的咖啡就毁了（上下文丢失，需要重算）。

KVBudget 的思路是：每位顾客在点单时就被分配了一个"预算"。
这个预算决定了他能占用多少台面空间。如果预算用完了，系统会聪明地选择哪些咖啡该保留、哪些该"倒掉"（丢弃部分 KV 条目）。

这就是这篇论文的核心：**每个请求在运行前就被分配一个 KV Cache 的预算额度，系统据此决定保留哪些 key-value 对。**

## 二、背景：为什么需要 KV Cache Budgeting？

### 2.1 KV Cache 是什么？

在大语言模型推理中，每个请求都会产生大量中间计算结果。具体来说：

当模型读到第 1 个 token 时，会计算出对应的 key 和 value 向量。
当读到第 2 个 token 时，又产生新的 key-value 对。
这些 key-value 对被缓存起来（称为 KV Cache），因为后续生成 token 时还需要回头"查阅"它们。

**问题在于**：KV Cache 的大小随着上下文长度线性增长。如果同时服务 100 个请求，每个请求有 32K 的上下文，
那么 KV Cache 的总大小可能远超 GPU 显存。

### 2.2 vLLM 的 PagedAttention

vLLM 用了一个聪明的方案：PagedAttention。
就像操作系统的虚拟内存分页机制一样，它把 KV Cache 分成"页"来管理，
允许非连续分配，大幅减少了内存碎片和浪费。

**但 vLLM 有一个局限**：它假设每个请求需要完整的 KV Cache。
如果显存不够，它会拒绝新请求，或者在极端情况下导致服务中断。

### 2.3 KVBudget 的思路

KVBudget 做了一个根本性的改变：**每个请求不再需要完整的 KV Cache。**
相反，系统给每个请求分配一个"预算"——最多可以占用多少 KV 条目。

如果请求的上下文超过了预算，系统就选择性地丢弃一部分 KV 条目。
关键是：**丢弃哪些？用什么标准决定优先级？**

这就是这篇文章要解决的核心问题。

## 三、核心概念

### 3.1 预算分配函数

系统需要一个函数，根据请求的特性来决定预算大小。
常见的分配策略包括：

- **静态分配**：每个请求分配固定数量的 KV 条目（比如 1024 个）
- **动态分配**：根据请求的当前上下文长度动态计算预算
- **优先级分配**：高优先级请求获得更多预算

### 3.2 KV 条目的重要性评分

当需要丢弃 KV 条目时，系统需要评估每个条目的"重要性"。
重要性通常与 token 对后续生成的贡献程度相关：

- **注意力权重高的 token**：如果某个 token 在后续生成中被频繁"关注"，它很重要
- **位置信息**：开头和最近的 token 通常更重要（近因效应）
- **语义关键 token**：实体名称、数字等关键信息

### 3.3 预算超限时的 evict 策略

当请求的上下文超过预算时，系统执行 evict（驱逐）：

1. 计算所有 KV 条目的重要性分数
2. 按照分数从低到高排序
3. 丢弃低于预算限额的那些条目
4. 更新元数据，确保后续访问不会出错

## 四、代码示例

### 示例 1：预算分配的伪代码

```python
class KVBudgetManager:
    """管理每个请求的 KV Cache 预算"""

    def __init__(self, max_total_pages: int, page_size: int = 16):
        # 总页数限制
        self.max_total_pages = max_total_pages
        self.page_size = page_size

        # 每个请求的预算分配表
        self.budgets: dict[int, int] = {}
        # 每个请求实际占用的页数
        self.allocated: dict[int, int] = {}
        # 当前总占用
        self.current_usage = 0

    def assign_budget(self, request_id: int, context_length: int, num_layers: int) -> int:
        """
        为请求分配 KV Cache 预算。

        参数:
            request_id: 请求的唯一标识
            context_length: 请求的上下文长度（token 数）
            num_layers: 模型的层数

        返回:
            分配的 KV 条目数量（budget）
        """
        # 每个 token 产生的 KV 条目数 = 2 * num_layers（key 和 value）
        total_kv_entries = 2 * num_layers * context_length

        # 策略：分配 64 页的预算（page_size=16 意味着 1024 个条目）
        budget_pages = min(64, total_kv_entries // self.page_size + 1)
        budget_entries = budget_pages * self.page_size

        self.budgets[request_id] = budget_entries
        self.allocated[request_id] = 0
        return budget_entries

    def try_allocate(self, request_id: int, pages_needed: int) -> bool:
        """尝试为请求分配页数。如果总占用超过限制，则触发 evict 策略。"""
        if self.current_usage + pages_needed <= self.max_total_pages:
            self.allocated[request_id] = pages_needed
            self.current_usage += pages_needed
            return True

        # 预算不足，需要 evict 其他请求
        return self.evict_others(pages_needed)

    def evict_others(self, pages_needed: int) -> bool:
        """
        驱逐其他请求的 KV Cache 以腾出空间。

        策略：优先驱逐预算已用满且上下文最早过期的请求。
        """
        pages_freed = 0

        # 按"最近使用时间"排序，驱逐最久未使用的
        candidates = sorted(
            [(rid, self.allocated[rid]) for rid in self.allocated],
            key=lambda x: x[1],  # 按已分配页数排序（可以换成 LRU 时间戳）
        )

        for request_id, allocated in candidates:
            if pages_freed >= pages_needed:
                break
            pages_freed += allocated
            self.current_usage -= allocated
            del self.allocated[request_id]

        return pages_freed >= pages_needed
```

**解读**：

这段代码展示了一个最基础的预算管理器。关键要点：

- `assign_budget` 方法决定每个请求能分到多少 KV Cache
- `try_allocate` 检查总预算是否够用
- 如果不够，`evict_others` 会"腾出空间"

在真实实现中，evict 策略会更精细——不是简单丢弃整个请求的 KV Cache，
而是只丢弃超出预算的那些 KV 条目，保留重要的部分。

### 示例 2：KV 条目重要性评分与选择性丢弃

```python
import torch
import torch.nn.functional as F

class SelectiveKVCache:
    """
    支持选择性保留 KV Cache 的缓存实现。
    当超出预算时，根据重要性分数丢弃条目。
    """

    def __init__(self, budget: int, page_size: int = 16):
        self.budget = budget          # 预算：最多保留的 KV 条目数
        self.page_size = page_size
        self.pages: list[torch.Tensor] = []  # 存储 KV 页面的列表
        self.token_count = 0           # 已添加的 token 总数
        self.importance_scores = []    # 每个 token 的重要性分数

    def append(self, key: torch.Tensor, value: torch.Tensor, attention_weights: torch.Tensor):
        """
        添加新的 KV 页面。

        参数:
            key: [num_heads, num_tokens, head_dim] 的 key 矩阵
            value: [num_heads, num_tokens, head_dim] 的 value 矩阵
            attention_weights: [num_heads, num_tokens] 当前 token 对所有历史 token 的注意力权重
        """
        self.pages.append(key)
        self.pages.append(value)
        self.token_count += key.shape[1]

        # 根据注意力权重计算重要性分数
        # 注意力权重越高，说明这个 token 越重要，越不该被丢弃
        scores = attention_weights.mean(dim=0)  # 对 heads 取平均
        self.importance_scores.append(scores)

        # 检查是否超出预算
        if self.token_count > self.budget:
            self.evict_low_importance()

    def evict_low_importance(self):
        """
        丢弃重要性最低的 KV 条目，直到回到预算范围内。
        """
        if len(self.importance_scores) == 0:
            return

        # 将所有重要性分数合并成一个一维列表
        all_scores = torch.cat(self.importance_scores)

        # 计算需要丢弃的条目数
        num_to_keep = self.budget
        num_to_evict = len(all_scores) - num_to_keep

        if num_to_evict <= 0:
            return

        # 找到重要性最低的 num_to_evict 个条目的索引
        _, indices = torch.topk(all_scores, k=num_to_keep, largest=False, sorted=False)
        keep_mask = torch.ones_like(all_scores, dtype=torch.bool)
        keep_mask[indices] = False  # True = 保留，False = 丢弃

        # 按页重新构建 KV Cache，只保留重要性高的条目
        # 注意：这里简化了实现，实际中需要更精细的页管理
        new_pages = []
        for page in self.pages:
            # page 的维度是 [num_heads, num_tokens, head_dim]
            # 只对 token 维度应用 mask
            new_pages.append(page[:, keep_mask])

        self.pages = new_pages
        # 更新 token 计数
        self.token_count = sum(p.shape[1] for p in self.pages[:1])  # 简化
        self.importance_scores = []
```

**解读**：

这段代码的核心逻辑是：

1. `append` 时，用注意力权重计算每个历史 token 的重要性
2. 注意力权重大 = 后面的 token 经常"回头参考"它 = 它很重要 = 不应该被丢弃
3. `evict_low_importance` 按分数排序，丢弃最不重要的一部分

**一个需要注意的细节**：在实际的 Transformer 中，KV Cache 是按层（layer）存储的。
上面的代码做了简化，真实实现中需要对每一层都独立进行预算管理和 evict。

## 五、为什么这很重要？

### 5.1 显存效率的提升

没有预算机制时，系统要么拒绝请求（降低吞吐量），要么耗尽显存（导致崩溃）。
KVBudget 让系统能在有限显存下服务更多请求——即使每个请求只用了部分上下文。

### 5.2 对长上下文的支持

当上下文超长时（比如 128K token），KV Cache 可能占数十 GB。
有了预算机制，系统可以把最重要的部分保留在 GPU 上，把次要部分放到 CPU 甚至磁盘上。
这就像是手机的"后台管理"：重要的 App 保留在内存中，不常用的被挂起。

### 5.3 多租户场景下的公平性

在多人同时使用大模型的场景下，预算机制可以确保：
- 付费用户获得更多 KV Cache 预算
- 普通用户的请求不会挤占高优先级用户的资源
- 系统整体不会因为个别超长请求而崩溃

## 六、总结

| 概念 | 说明 | 类比 |
|------|------|------|
| KV Cache | 存储历史 token 的 key-value 对 | 咖啡师记着每位顾客的订单 |
| 预算分配 | 给每个请求分配最大 KV 容量 | 给每位顾客分配台面大小 |
| 重要性评分 | 决定哪些 KV 条目该保留 | 哪些咖啡配方值得反复记住 |
| Evict | 超出预算时丢弃不重要的 KV | 台面满了，先倒掉没人要的咖啡 |

**一句话总结**：KVBudget 用"预算"代替"全部保留"的思路，
让大模型服务在有限显存下跑得更快、更稳、更公平。
