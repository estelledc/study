---
title: ServerlessLLM: Low-Latency Serverless Inference for Large Language Models
来源: https://www.usenix.org/conference/osdi24/presentation/fu
日期: 2026-06-13
分类: 基础设施
子分类: 服务器less
provenance: pipeline-v3
---

# ServerlessLLM：为 LLM 推理提速的低延迟 Serverless 系统

## 1 一个日常类比：快递柜里的预存包裹

想象你有一个快递柜系统（类似 AWS Lambda 的 serverless 平台）：

- 每次有人下单（发起 LLM 请求），你需要从远程仓库（S3 对象存储）下载商品（模型权重），然后才能发货。
- 如果商品很大（比如 LLM 有几十 GB），每次都要重新下载，那用户体验就太差了。

**ServerlessLLM 的核心想法**：在每个快递柜（服务器）里预留一部分空间，提前把常用商品存下来。下次有人下单时，直接从本地柜子取货，不用等远程配送。

更进一步，ServerlessLLM 还做了三件聪明事：

1. **分层取货**——最快的东西放伸手可及的地方（显存），稍慢的放抽屉里（内存），最慢的放架子上（磁盘），按需取用。
2. **无缝交接**——新订单来了，不等你准备好才接单，而是在后台一边准备一边让用户先用旧的，切换过程几乎无感。
3. **智能派单**——系统知道哪个柜子有货，就把订单派给最近的柜子，减少等待时间。

## 2 Serverless LLM 推理的核心挑战

在传统 serverless 平台上运行 LLM 推理，最大的问题是 **冷启动延迟（cold start latency）**：

```
传统 serverless LLM 推理流程：

用户发送请求
    │
    ▼
云平台分配 GPU 实例 ──────────────────── 等待中...
    │
    ▼
从远程存储（S3）下载模型权重 (GB~TB) ─── 等待中...
    │
    ▼
将模型加载到 GPU 显存 ────────────────── 等待中...
    │
    ▼
开始推理 ─────────────────────────────── 终于开始了！
```

一个 70B 参数的模型，fp16 精度下大约需要 **140GB** 的显存。把它从 S3 下载到 GPU 服务器上可能需要 **几十秒甚至几分钟**。对于 serverless 场景（用户期望毫秒级响应），这是完全不可接受的。

## 3 ServerlessLLM 的三个核心贡献

### 3.1 多层缓存：利用服务器本地的存储层次

每台 GPU 服务器不仅有 GPU 显存（最快但最小），还有内存（较大）和磁盘（最大但较慢）。ServerlessLLM 充分利用了这个层次：

```
存储层次（从快到慢）：

┌─────────────────────────────┐
│ GPU 显存 (HBM)              │ ← 最新、最常用的 checkpoint 副本
│ 容量：~80GB (A100)          │    加载速度：<1秒
├─────────────────────────────┤
│ 系统内存 (DRAM)             │ ← 多个 checkpoint 的缓存
│ 容量：~500GB                │    加载速度：<5秒
├─────────────────────────────┤
│ 本地 NVMe SSD               │ ← 所有 checkpoint 的全量存储
│ 容量：~1TB                  │    加载速度：<10秒
├─────────────────────────────┤
│ 远程 S3/OSS                 │ ← 持久化存储
│                             │    加载速度：数十秒~分钟
└─────────────────────────────┘
```

关键洞察：**即使某个 checkpoint 没有完全加载到显存，只要它在本地服务器的内存或磁盘上，加载速度就比从 S3 下载快几个数量级。**

### 3.2 优化的 checkpoint 格式与加载机制

传统的 PyTorch checkpoint 格式在加载时需要串行读取整个文件，无法充分利用存储层次的多层带宽。ServerlessLLM 设计了一种新的 checkpoint 格式：

```python
# 传统 PyTorch checkpoint 加载（串行，慢）
def load_checkpoint_trained(model_path):
    """
    传统方式：一次性读取整个 .pt 文件
    问题：无法并行利用磁盘和内存的带宽
    """
    state_dict = torch.load(model_path)  # 串行读取，锁死单条通道
    model.load_state_dict(state_dict)
    return model

# ServerlessLLM 的分层加载（并行，快）
def load_checkpoint_multi_tier(model_path, tier_config):
    """
    分层加载：
    - 第一层：从 GPU 显存热缓存加载已存在的 shard
    - 第二层：从内存冷缓存加载
    - 第三层：从本地 SSD 读取
    - 第四层：仅在全部缺失时才从 S3 下载
    """
    shards = split_model_into_shards(model_path)  # 将模型切分为多个 shard

    loaded_shards = {}
    for shard in shards:
        # 尝试从最快的层级获取
        if shard in gpu_cache:
            loaded_shards[shard.name] = gpu_cache[shard]  # L1: 显存，<1ms
        elif shard in memory_cache:
            loaded_shards[shard.name] = memory_cache[shard]  # L2: 内存，<10ms
        elif shard.exists_on_local_disk():
            loaded_shards[shard.name] = load_from_nvme(shard)  # L3: NVMe，<1s
        else:
            loaded_shards[shard.name] = download_from_s3(shard)  # L4: S3，>10s

    model = assemble_model(loaded_shards)
    return model
```

ServerlessLLM 还引入了 **loading-optimized checkpoint format**，将 checkpoint 文件按存储层的最佳传输大小分块，允许多线程并行加载，充分利用 GPU 服务器上复杂的存储带宽。

### 3.3 实时迁移（Live Migration）

当一个新请求到来时，ServerlessLLM 不会干等模型加载完成。它采用了一种 **live migration** 技术：

```
传统方式：
用户请求 → 等模型加载 → 开始推理
         ↑___________↑
         可能等待 30 秒+

ServerlessLLM 方式：
用户请求 → 立即用旧版本模型处理前几个 token → 后台加载新版本
                                    → 中途无缝切换到新模型
                                    → 用户几乎无感知
```

具体来说：

1. 新请求到达时，如果本地已经有旧版本的模型 checkpoint，**立即用它开始处理**
2. 同时，后台异步加载新请求需要的模型版本
3. 在新模型加载完成后、生成更多 token 之前，**无缝切换**到新版本
4. 用户感受到的只是微小的延迟增加（几毫秒到几百毫秒），而不是漫长的等待

### 3.4 启动时间优化的模型调度

ServerlessLLM 有一个智能调度器，它会根据每台服务器上 checkpoint 的本地可用性来决定把请求分配到哪台服务器：

```python
class ServerlessLLMScheduler:
    def __init__(self, cluster_servers):
        self.servers = cluster_servers  # 集群中的所有服务器

    def schedule(self, model_name, request):
        """
        选择最优的服务器来执行推理。
        选择标准：最小化启动时间（即 checkpoint 加载时间）。
        """
        best_server = None
        best_load_time = float('inf')

        for server in self.servers:
            # 查询这台服务器上该模型 checkpoint 的状态
            status = server.check_checkpoint_status(model_name)

            if status == 'in_gpu_cache':
                load_time = 0.01  # 几乎零延迟，直接从显存加载
            elif status == 'in_memory_cache':
                load_time = 2.0   # 从内存加载
            elif status == 'on_local_disk':
                load_time = 5.0   # 从本地 NVMe 加载
            elif status == 'remote_only':
                load_time = 30.0  # 需要从 S3 下载
            else:
                load_time = 60.0  # 完全没有，需要先下载

            # 选择加载时间最短的服务器
            if load_time < best_load_time:
                best_load_time = load_time
                best_server = server

        return best_server, best_load_time
```

## 4 代码示例：完整的推理请求处理流程

### 4.1 模拟 ServerlessLLM 的请求处理

```python
import time
import hashlib

class ServerlessLLMEngine:
    def __init__(self, server_id, gpu_capacity_gb=80, memory_capacity_gb=500):
        self.server_id = server_id
        self.gpu_cache = {}       # {model_name: checkpoint_data}
        self.memory_cache = {}    # {model_name: checkpoint_data}
        self.disk_store = {}      # {model_name: file_path}
        self.gpu_capacity = gpu_capacity_gb
        self.memory_capacity = memory_capacity_gb

    def check_checkpoint_locally(self, model_name):
        """
        检查模型 checkpoint 在本地存储层次中的位置。
        返回 (tier, load_time_seconds)。
        """
        if model_name in self.gpu_cache:
            return ('gpu', 0.01)
        elif model_name in self.memory_cache:
            return ('memory', 2.0)
        elif model_name in self.disk_store:
            return ('disk', 5.0)
        else:
            return ('remote', 30.0)

    def load_and_infer(self, model_name, prompt):
        """
        处理一个推理请求：先加载模型（优先用本地缓存），
        然后执行推理。
        """
        # 第一步：查找最佳加载位置
        tier, load_time = self.check_checkpoint_locally(model_name)

        print(f"[{self.server_id}] 模型 '{model_name}' 位于 {tier} 层")
        print(f"[{self.server_id}] 预计加载时间: {load_time:.1f}s")

        # 第二步：加载模型（如果不在显存中）
        start = time.time()
        if tier != 'gpu':
            self._prefetch_to_gpu(model_name, tier)
        elapsed = time.time() - start
        print(f"[{self.server_id}] 实际加载耗时: {elapsed:.2f}s")

        # 第三步：执行推理
        output = self._run_inference(model_name, prompt)
        return output

    def _prefetch_to_gpu(self, model_name, source_tier):
        """将模型从较低层预取到 GPU 显存"""
        if source_tier == 'memory':
            checkpoint = self.memory_cache[model_name]
        elif source_tier == 'disk':
            checkpoint = self._read_from_disk(model_name)
        else:
            checkpoint = self._download_from_remote(model_name)

        # 放入 GPU 缓存（可能需要驱逐旧模型）
        self._evict_if_needed(model_name, len(checkpoint))
        self.gpu_cache[model_name] = checkpoint

    def _evict_if_needed(self, new_model, new_size_gb):
        """当显存不足时，按 LRU 策略驱逐旧模型"""
        total_used = sum(len(v) for v in self.gpu_cache.values())
        while total_used + new_size_gb > self.gpu_capacity and self.gpu_cache:
            # 驱逐最久未使用的模型
            oldest = next(iter(self.gpu_cache))
            evicted_size = len(self.gpu_cache[oldest])
            del self.gpu_cache[oldest]
            total_used -= evicted_size
            print(f"[{self.server_id}] 驱逐旧模型: {oldest}")

    def _run_inference(self, model_name, prompt):
        """执行实际的 LLM 推理（简化版）"""
        print(f"[{self.server_id}] 推理中: '{prompt[:50]}...'")
        # 实际系统中这里是调用模型生成 token
        return f"[{self.server_id}] 推理结果: 这是模型 '{model_name}' 对 '{prompt[:20]}...' 的回答"


# ========== 使用示例 ==========
engine = ServerlessLLMEngine(server_id="gpu-node-01")

# 第一次请求：模型从远程下载（冷启动）
print("\n=== 第一次请求：冷启动 ===")
result1 = engine.load_and_infer("llama-2-70b", "请解释量子计算的原理")

# 第二次请求：模型已在 GPU 缓存中（热启动）
print("\n=== 第二次请求：热启动（同一模型）===")
result2 = engine.load_and_infer("llama-2-70b", "请解释深度学习的原理")

# 第三次请求：模型在内存中（温启动）
print("\n=== 第三次请求：温启动（不同模型）===")
result3 = engine.load_and_infer("mistral-7b", "请解释区块链的原理")
```

运行结果示意：

```
=== 第一次请求：冷启动 ===
[gpu-node-01] 模型 'llama-2-70b' 位于 remote 层
[gpu-node-01] 预计加载时间: 30.0s
[gpu-node-01] 实际加载耗时: 28.45s
[gpu-node-01] 推理中: '请解释量子计算的原理...'

=== 第二次请求：热启动（同一模型）===
[gpu-node-01] 模型 'llama-2-70b' 位于 gpu 层
[gpu-node-01] 预计加载时间: 0.0s
[gpu-node-01] 实际加载耗时: 0.01s
[gpu-node-01] 推理中: '请解释深度学习的原理...'

=== 第三次请求：温启动（不同模型）===
[gpu-node-01] 模型 'mistral-7b' 位于 memory 层
[gpu-node-01] 预计加载时间: 2.0s
[gpu-node-01] 驱逐旧模型: llama-2-70b
[gpu-node-01] 实际加载耗时: 1.87s
[gpu-node-01] 推理中: '请解释区块链的原理...'
```

### 4.2 调度器决策流程

```python
class ClusterScheduler:
    """
    集群调度器：决定每个请求应该去哪家服务器。
    核心原则：选择 checkpoint 本地可用性最高的服务器。
    """
    def __init__(self, engines):
        self.engines = engines  # 集群中的所有 ServerlessLLM 引擎

    def dispatch(self, model_name, prompt):
        """将请求分发到最优服务器"""
        best_engine = None
        best_latency = float('inf')

        for engine in self.engines:
            tier, latency = engine.check_checkpoint_locally(model_name)

            # 打印调度决策
            tier_label = {'gpu': '显存(极速)', 'memory': '内存(快速)',
                          'disk': '磁盘(中等)', 'remote': '远程(慢)'}
            print(f"  → {engine.server_id}: {tier_label[tier]}, "
                  f"预估延迟 {latency:.1f}s")

            if latency < best_latency:
                best_latency = latency
                best_engine = engine

        print(f"  决策: 派往 {best_engine.server_id} (延迟 {best_latency:.1f}s)")
        return best_engine

# ========== 集群演示 ==========
engines = [
    ServerlessLLMEngine("node-A"),
    ServerlessLLMEngine("node-B"),
    ServerlessLLMEngine("node-C"),
]

# 假设 node-A 和 node-B 都有 llama-2-70b 的缓存
engines[0].gpu_cache['llama-2-70b'] = b"x" * 140_000_000_000  # 140GB in GPU
engines[1].memory_cache['llama-2-70b'] = b"x" * 140_000_000_000  # 140GB in RAM
# node-C 没有任何缓存

scheduler = ClusterScheduler(engines)

print("调度请求: llama-2-70b 推理")
target = scheduler.dispatch("llama-2-70b", "你好")
target.load_and_infer("llama-2-70b", "你好")
```

## 5 性能数据

论文中的实验结果表明，ServerlessLLM 相比当时最先进的 serverless 推理系统有巨大优势：

| 指标 | 提升倍数 |
|------|----------|
| 端到端延迟降低 | **10x - 200x**（因模型大小和工作负载而异） |
| 小模型（7B-13B） | 延迟降低约 10-20x |
| 大模型（70B+） | 延迟降低可达 100-200x |
| 吞吐量提升 | 显著高于基线系统 |

核心原因很简单：大多数请求的模型 checkpoint 已经在本地了，不需要每次都从 S3 下载。

## 6 总结

ServerlessLLM 解决了一个非常实际的问题：**如何让 serverless 平台也能高效地运行大语言模型推理？**

它的三个核心创新：

1. **多层 checkpoint 加载**——把 GPU 服务器的显存、内存、磁盘组成一个分层缓存体系，让模型加载尽可能在本地完成
2. **实时迁移（Live Migration）**——新请求来了不等模型全加载完再开始，而是边加载边处理，用户几乎无感知
3. **启动时间优化的调度**——智能地把请求派发给 checkpoint 本地最可用的服务器

回到快递柜的类比：ServerlessLLM 不只是在每个柜子里预存了商品，它还建了一套聪明的物流系统——知道哪个柜子有什么、什么在最方便的位置取、新用户来了可以先拿旧货再用新货，并且会自动把订单派给最近的柜子。

## 参考资料

- OSDI '24 Paper: https://www.usenix.org/system/files/osdi24-fu.pdf
- Presentation: https://www.usenix.org/conference/osdi24/presentation/fu
- Authors: Yao Fu, Leyang Xue, Yeqi Huang, Andrei-Octavian Brabete, Dmitrii Ustiugov, Yuvraj Patel, Luo Mai (University of Edinburgh & NTU Singapore)
