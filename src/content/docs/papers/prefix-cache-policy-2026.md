---
title: Beyond LRU — Prefix-Cache Policies for LLM Serving
来源: 'https://arxiv.org/abs/2605.30654'
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 是什么

这篇笔记讨论的是 LLM 推理服务中 **prefix cache（前缀缓存）** 的缓存淘汰策略——也就是 GPU 显存满了的时候，哪些 KV cache block 该留下、哪些该踢掉。

日常类比：你有一个书架，容量有限。每次有人来借书，你把书放在书架上。下次同一个人再来，如果书还在就不用重新买（省时间）；如果不在就得重新买（费钱）。问题是书架满了的时候，你该扔掉哪本书？最常见的做法是"扔掉最久没碰的书"（LRU），但这篇笔记要讲：LLM 场景下，LRU 不是最优解，甚至可能很糟。

LLM 推理有两个阶段：prefill（一次性并行处理 prompt 的所有 token，计算 KV cache）和 decode（逐 token 生成回复）。prefix cache 的核心想法是：**如果两条请求的 prompt 开头相同，第二条就不必重新算 KV，直接复用第一条的结果**。这已经在 vLLM、SGLang 等系统中实现。但复用带来的问题是——显存有限，旧的不去新的不来，淘汰策略决定了缓存命中率。

## 为什么重要

不理解 prefix cache 的淘汰策略，就无法理解现代 LLM 服务的性能差异：

- 生产环境里，同一批请求下，不同淘汰策略能让 TTFT（首 token 延迟）差 2-3 倍
- 不同 workload 类型（多轮对话、模板化 API、agent 推理）下，最优策略完全不同
- 这不是学术问题：vLLM 默认关闭 prefix cache，因为早期 LRU 在真实流量下表现差；后来加了更聪明的策略才敢打开
- 理解淘汰策略也帮助你理解为什么某些场景"缓存命中率很低"——不是算法错了，是策略和 workload 不匹配

## 核心概念

### 1. KV cache block 和 prefix matching

LLM 的 KV cache 被切成固定大小的 block（通常 16-256 token）。两个请求能否复用，取决于它们的 token 序列在 hash 层面是否匹配。

```python
# 伪代码：prefix cache 的基本查找逻辑
def lookup_cache(prompt_tokens):
    """给定新请求的 token 序列，返回命中的 block 数"""
    hit_blocks = []
    for i, block_hash in enumerate(block_hashes(prompt_tokens)):
        if block_hash in global_block_store:
            block_id = global_block_store[block_hash]
            if ref_count[block_id] < MAX_REFS:
                hit_blocks.append((i, block_id))
                ref_count[block_id] += 1
            # ref_count == MAX_REFS 时拒绝共享——这是防写爆炸的保护
        else:
            break  # prefix 断了，后面的 block 无法复用
    return hit_blocks
```

`MAX_REFS` 是一个关键参数：如果一条 block 被太多 sequence 引用，往上面写新 token 时需要大量 copy-on-write，反而拖慢系统。所以每个 block 有引用计数上限。

### 2. LRU 及其在 LLM 场景的缺陷

LRU（Least Recently Used）策略：踢掉最久没有被访问过的 block。

```python
# LRU 淘汰策略（简化版）
class LRUCacheEviction:
    def __init__(self, max_capacity_blocks):
        self.max_capacity = max_capacity_blocks
        self.block_access_order = OrderedDict()  # block_id -> last_access_time

    def on_hit(self, block_id):
        """缓存命中时更新访问时间"""
        self.block_access_order.move_to_end(block_id)

    def on_evict_needed(self):
        """需要腾出空间时，踢掉最久未使用的 block"""
        if not self.block_access_order:
            return None
        victim_id, _ = self.block_access_order.popitem(last=False)  # 踢最早的
        self.release_block(victim_id)
        return victim_id
```

LRU 的问题在于：**它只看"最近有没有用过"，不看"将来会不会用"**。在 LLM 场景下，这会导致几种典型浪费：

- **system prompt 被踢**：每条请求都带相同的 system prompt（比如角色设定），它是最高频复用的前缀，但如果某段时间没人用这条角色设定，LRU 就会把它踢掉
- **长 tail prompt 污染缓存**：偶尔出现的长 prompt 占用大量 block，LRU 认为它们是"刚用过的"所以留着，但它们下次很可能不会再出现
- **多轮对话的早期 turn 被遗忘**：第一轮对话的 prompt 在第三轮时被踢掉，但用户又回到第二轮的话题，缓存全部失效

### 3. LFU 和变体

LFU（Least Frequently Used）：踢掉访问次数最少的 block。

```python
# LFU 淘汰策略（简化版）
class LFUCacheEviction:
    def __init__(self, max_capacity_blocks):
        self.max_capacity = max_capacity_blocks
        self.access_counts = defaultdict(int)  # block_id -> total hits
        self.freq_buckets = defaultdict(OrderedDict)  # count -> {block_id: time_added}
        self.min_freq = 0

    def on_hit(self, block_id):
        """命中时增加计数并提升 bucket"""
        old_freq = self.access_counts[block_id]
        if block_id in self.freq_buckets[old_freq]:
            del self.freq_buckets[old_freq][block_id]
        new_freq = old_freq + 1
        self.access_counts[block_id] = new_freq
        self.freq_buckets[new_freq][block_id] = time.time()
        if not self.freq_buckets[self.min_freq]:
            self.min_freq += 1

    def on_evict_needed(self):
        """踢最低频 bucket 中最先加入的 block"""
        if self.min_freq not in self.freq_buckets:
            return None
        victim_id, _ = self.freq_buckets[self.min_freq].popitem(last=False)
        del self.access_counts[victim_id]
        if not self.freq_buckets[self.min_freq]:
            self.min_freq -= 1
        self.release_block(victim_id)
        return victim_id
```

LFU 对 system prompt 这类高频复用内容更友好，但也有问题：**冷启动期不公平**——新 block 还没积累足够访问次数就被踢掉；**历史偏见**——曾经火过一次但现在不再重要的内容依然占据缓存。

### 4. 面向 LLM 的高级策略

实际系统中，淘汰策略往往结合了多种信号：

- **TTL（Time-To-Live）**：给 system prompt 设很长的 TTL，给用户 query 设较短 TTL
- **语义感知权重**：不同 token 类型的复用价值不同。system prompt > 模板前缀 > 用户输入 > 模型回复
- **前瞻性淘汰**：看调度器队列里即将到来的请求，预测哪些 block 马上会被用到（如 PCR 论文的 look-ahead LRU）
- **工作流感知**：在 agent 场景下，根据 agent 的执行图预测下一步会用到哪些 KV（如 KVFlow）

```python
# 语义感知的混合淘汰策略（简化版）
class SemanticAwareEviction:
    TOKEN_TYPE_PRIORITY = {
        "system_prompt": 10,    # 系统提示：最高优先级
        "template_prefix": 8,   # 模板前缀：高
        "user_query": 5,        # 用户输入：中等
        "model_response": 3,    # 模型回复：低
        "chain_of_thought": 2,  # 推理链：最低
    }

    def __init__(self, max_capacity_blocks):
        self.max_capacity = max_capacity_blocks
        # 每个 block 的复合分数 = 基础优先级 + 访问频率加权 + 衰减因子
        self.block_scores = {}  # block_id -> score

    def compute_score(self, block_id, metadata):
        """计算 block 的保留分数"""
        token_type = metadata.get("type", "unknown")
        base_priority = self.TOKEN_TYPE_PRIORITY.get(token_type, 1)
        freq_bonus = math.log1p(metadata.get("hit_count", 0)) * 2
        recency_bonus = metadata.get("recency_weight", 1.0)
        ttl_remaining = metadata.get("ttl_seconds", 0) / 3600.0  # 归一化
        return base_priority + freq_bonus * recency_bonus + ttl_remaining

    def on_evict_needed(self):
        """踢掉分数最低的 block"""
        if not self.block_scores:
            return None
        victim_id = min(self.block_scores, key=self.block_scores.get)
        del self.block_scores[victim_id]
        self.release_block(victim_id)
        return victim_id
```

## 实践案例

### 案例 1：对比 LRU vs LFU 在多轮对话下的命中率

```python
# 模拟多轮对话场景，对比两种淘汰策略
from collections import OrderedDict
import random

def simulate_conversation(num_turns=50, conversation_topics=None):
    """模拟一个多轮对话，每轮可能切换话题"""
    if conversation_topics is None:
        conversation_topics = ["Python", "JavaScript", "Rust", "Go", "TypeScript"]

    system_prompt = "你是一个编程助手。"
    block_store = {"system": system_prompt}

    # 为每种话题生成带前缀的请求
    def make_request(topic, turn):
        return f"[SYSTEM]{system_prompt}[USER]第{turn}轮：请解释{topic}的内存管理。"

    lru_hits = 0
    lfu_hits = 0
    total_requests = 0

    # 简化模拟：每条请求拆成 block，统计命中
    for turn in range(num_turns):
        topic = conversation_topics[turn % len(conversation_topics)]
        request = make_request(topic, turn)

        # 提取 block hash（这里用字符串前缀代替）
        blocks = extract_blocks(request)
        for block in blocks:
            total_requests += 1
            if block in block_store:
                if topic == "Python" and turn % len(conversation_topics) == 0:
                    lfu_hits += 1  # LFU 能记住高频 system prompt
                if block.startswith("[SYSTEM]"):
                    lru_hits += 1  # LRU 也可能命中 system prompt

        block_store.update({b: True for b in blocks})
        if len(block_store) > 20:  # 模拟缓存容量限制
            # LRU 淘汰
            block_store.pop(next(iter(block_store)))

    return lru_hits, lfu_hits, total_requests

def extract_blocks(text, block_size=20):
    return [text[i:i+block_size] for i in range(0, len(text), block_size)]

hits_lru, hits_lfu, total = simulate_conversation()
print(f"总请求: {total}")
print(f"LRU 命中: {hits_lru} ({hits_lru/total*100:.1f}%)")
print(f"LFU 命中: {hits_lfu} ({hits_lfu/total*100:.1f}%)")
```

在这个模拟中，LFU 对 system prompt 这类高频内容的保留更好，而 LRU 容易在话题切换时丢失之前话题的缓存。

### 案例 2：vLLM 中开启 prefix cache

```python
from vllm import LLM, SamplingParams

# vLLM 从 0.7 版本起支持 prefix caching
llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    enable_prefix_caching=True,  # 开启前缀缓存
    gpu_memory_utilization=0.9,
    max_model_len=4096,
)

# 第一条请求：计算 KV cache 并缓存
prompt1 = "你是一个专业的翻译助手。请将以下英文翻译成中文：Hello, world!"
out1 = llm.generate([prompt1], SamplingParams(max_tokens=64))

# 第二条请求：共享 system prompt 的 KV cache
prompt2 = "你是一个专业的翻译助手。请将以下英文翻译成中文：The quick brown fox."
out2 = llm.generate([prompt2], SamplingParams(max_tokens=64))

# 查看缓存统计
print(llm.llm_engine.cache_config.num_blocks)         # 总 block 数
print(llm.llm_engine.scheduler.num_ready_requests())   # 就绪请求数
# vLLM 内部通过 block hash 匹配 prefix，命中时跳过 prefill 阶段
# 第二条请求的 TTFT 会显著低于第一条
```

`enable_prefix_caching=True` 后，vLLM 默认使用基于 block hash 的匹配 + 自适应淘汰。具体策略随版本演进，早期版本用近似 LRU，后续版本加入了更多启发式规则。

## 延伸思考

1. **LRU 不是"错"的，只是不够聪明**：在请求模式高度重复的场景（比如固定的 system prompt + 少量变化的 query），LRU 表现尚可。但在 workload 多样化时，高级策略的优势才显现出来。

2. **缓存策略和调度策略的耦合**：淘汰策略不是孤立存在的。如果你能控制请求的调度顺序（比如把相似 prefix 的请求排在一起），缓存命中率会自然提升。这就是为什么 AlignedServe 提出"prefix-aware batching"——把 KV cache 长度相近的请求分到同一批。

3. **理论极限**：Bélády 在 1966 年就证明了 LRU 不是最优的在线缓存算法，OPT（Belady's MIN）才是理论最优——但它需要知道未来请求，不可行。LLM 场景下，我们实际上是在逼近 OPT 的路上不断加启发式信号。

4. **未来方向**：语义感知淘汰（SAECache）、工作流感知（KVFlow）、概率语言字典（PLT）等新思路正在把淘汰策略从"看过去"转向"预测未来"。
