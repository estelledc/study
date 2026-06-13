---
title: Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve
来源: https://www.usenix.org/conference/osdi24/presentation/agrawal
日期: 2026-06-13
分类: 基础设施
子分类: 系统
provenance: pipeline-v3
---

# Sarathi-Serve：驯服 LLM 推理中的吞吐量-延迟权衡

## 1 一个日常类比：披萨店的两个工序

想象一家披萨店，有两个工序：

- **备料（Prefill）**：一次性处理整张订单——把面团、酱料、芝士、配料全部准备好。这个过程很费时间，但因为可以同时处理一张订单的所有材料，效率很高。
- **烘烤（Decode）**：把准备好的披萨放进烤箱，一片一片地烤。每次只能烤一片，但每片烤好很快。

现在来了一群顾客，每人点了不同口味的披萨。传统做法是把所有订单堆在一起，先全部备料再全部烘烤。问题来了：

- 如果等新订单全部到齐才开始备料，等待时间长（延迟高）。
- 如果来一个做一个，GPU 算力利用率低（吞吐低）。

Sarathi-Serve 的核心思路就是：**把"备料"切成小块，穿插在"烘烤"之间执行**，既不中断正在烘烤的披萨，又能不断加入新订单。

## 2 LLM 推理的两个阶段

每个大语言模型请求经过两个阶段：

| 阶段 | 做什么 | 特点 |
|------|--------|------|
| **Prefill（预填充）** | 并行处理整个输入 prompt，产出第一个 token | 延迟高，但 GPU 计算利用率高（并行） |
| **Decode（解码）** | 逐 token 生成剩余输出 | 延迟低，但计算利用率低（串行），每个迭代只处理一个 token |

关键矛盾：**Batching（批处理）对 Decode 非常有效，能大幅提升吞吐。但把多个请求打包进一个 Batch 时，Prefill 和 Decode 的迭代就会交错在一起，导致调度变得复杂。**

传统的批处理方式（比如 vLLM 的 continuous batching）会在 Batch 中加入新请求的 Prefill 时，**暂停**正在进行的 Decode 迭代。这就产生了所谓的 **stall（停顿）**——GPU 在等 Prefill 完成期间闲置了。

## 3 Sarathi-Serve 的核心创新

### 3.1 Chunked Prefill（分块预填充）

Sarathi-Serve 把每个 Prefill 请求拆成若干个大小相近的 **chunk（块）**。

```python
# 传统方式：整个 prompt 一次性处理
def traditional_prefill(prompt_tokens):
    # 假设 prompt 有 2048 个 token
    output = model.forward(prompt_tokens)  # 一次搞定，耗时很长
    return output

# Sarathi-Serve 方式：拆成小块
def chunked_prefill(prompt_tokens, chunk_size=256):
    chunks = split_into_chunks(prompt_tokens, chunk_size)  # 分成 8 块
    results = []
    for chunk in chunks:
        output = model.forward(chunk)  # 每块单独处理
        results.append(output)
    return results
```

每个 chunk 的大小可以调整（论文中默认 256 tokens）。这样做的效果是：

- Prefill 不再是一个"大块头"任务，而是变成了多个小任务
- 这些小任务可以穿插在 Decode 迭代之间执行
- GPU 不会因为一个长的 Prefill 而阻塞 Decode

### 3.2 Stall-Free Scheduling（无停顿调度）

这是 Sarathi-Serve 最核心的调度策略。

**传统调度（有停顿）：**

```
时间轴示意：

Batch 包含 [Req_A, Req_B, Req_C]

Req_A decode:  [====][====][====][====][====]
Req_B decode:  [====][====][====][====][====]
Req_C decode:  [====][====][====][====][====]

新请求 Req_D 进来时：
Prefill Req_D: [--------------------------]  <-- 这段时间所有 Decode 都要停下来等！
Req_A decode:  [====][====][||||][||||][||||]  (|||| = 被暂停)
Req_B decode:  [====][====][||||][||||][||||]
Req_C decode:  [====][====][||||][||||][||||]
```

**Sarathi-Serve 调度（无停顿）：**

```
时间轴示意：

Batch 包含 [Req_A, Req_B, Req_C]

Req_A decode:  [====][====][====][====][====]
Req_B decode:  [====][====][====][====][====]
Req_C decode:  [====][====][====][====][====]

新请求 Req_D 进来时，Prefill 被切成小块穿插执行：
Prefill D-chunk1:       [==]
Req_A decode:  [====][====][==][====][==]  (Decode 不停！)
Req_B decode:  [====][====][==][====][==]
Req_C decode:  [====][====][==][====][==]
Prefill D-chunk2:                [==]
Req_A decode:  [==][====][==][==][====]
Req_B decode:  [==][====][==][==][====]
Req_C decode:  [==][====][==][==][====]
```

**关键区别：** Decode 迭代一直在运行，没有被暂停。这就是 "stall-free" 的含义。

### 3.3 Uniform Batches（均匀批次）

Sarathi-Serve 尽量保持 Batch 中所有请求处于相似的进度（即都在 Decode 阶段），减少 Prefill 和 Decode 之间的 **pipeline bubble（流水线气泡）**。

Pipeline bubble 是指：因为 Batch 中某些请求在做 Prefill（计算密集），某些在做 Decode（内存密集），两种迭代的工作量不平衡，导致 GPU 的某些计算单元空闲等待。

Uniform Batches 的策略是：只有当 GPU 有足够的余量时才接纳新请求，确保 Batch 中大部分请求都在 Decode 阶段。

## 4 代码示例：理解 Scheduler 的逻辑

### 4.1 请求调度决策

```python
class SarathiScheduler:
    def __init__(self, chunk_size=256):
        self.chunk_size = chunk_size
        self.running = []  # 当前正在执行的请求列表

    def schedule(self, waiting_requests):
        """决定下一轮要执行什么"""
        scheduled = []

        for req in waiting_requests:
            if req.is_prefilling:
                # 检查当前 Batch 是否还有空间容纳一个 chunk
                # 而不是整个 Prefill
                if self._has_room_for_chunk(req):
                    # 只调度一个 chunk 的 Prefill
                    chunk = req.get_next_chunk(self.chunk_size)
                    scheduled.append(chunk)
                    req.mark_chunk_done()
                    if req.prefill_complete:
                        req.is_prefilling = False
                        req.is_decoding = True
                else:
                    # Batch 已满，不再接纳新请求
                    break
            else:
                # Decode 请求始终被调度
                scheduled.append(req)

        return scheduled

    def _has_room_for_chunk(self, new_req):
        """
        判断是否有足够的"计算余量"来容纳一个新请求的一个 chunk。
        这是 Sarathi-Serve 的核心决策逻辑：
        - 不是看能不能放下整个 prompt
        - 而是看能不能放得下一个 chunk 而不阻塞 Decode
        """
        current_compute_load = sum(r.compute_cost for r in self.running)
        chunk_compute_cost = new_req.estimate_chunk_cost(self.chunk_size)
        return (current_compute_load + chunk_compute_cost) <= self.gpu_capacity
```

### 4.2 Chunk 级别的迭代执行

```python
def sarathi_iteration(scheduler, gpu):
    """每一轮迭代做的事情"""
    # 1. 调度决策
    to_run = scheduler.schedule(waiting_queue)

    # 2. 执行——注意这里调度的是 chunk，不是整个请求
    for item in to_run:
        if isinstance(item, Chunk):
            # 执行一个 Prefill chunk
            output = gpu.execute_prefill_chunk(item.tokens, item.offset)
        else:
            # 执行一个 Decode step
            output = gpu.execute_decode(item)

        # 3. 收集结果
        for item in to_run:
            if isinstance(item, Chunk):
                item.collect_output(output)
                if item.is_last:
                    # 最后一个 chunk 完成了，整个 Prefill 结束
                    item.request.start_decoding()
            else:
                item.collect_token(output.token)
                if item.request.is_finished():
                    scheduler.free_request(item.request)
```

## 5 性能对比

论文在多个模型和硬件配置上做了实验：

| 配置 | 对比基线 | 提升 |
|------|----------|------|
| Mistral-7B on single A100 | vLLM | 2.6x 吞吐 |
| Yi-34B on two A100s | vLLM | 3.7x 吞吐 |
| Falcon-180B with pipeline parallelism | vLLM | 5.6x 吞吐 |

这些数字说明：在保持尾延迟（tail latency）约束的前提下，Sarathi-Serve 能显著释放 GPU 的服务能力。

## 6 总结

Sarathi-Serve 解决了一个看似简单但实际棘手的问题：**如何在 LLM 推理中既保持高吞吐又保持低延迟？**

它的三个核心贡献：

1. **Chunked Prefill**——把大的 Prefill 任务切碎，变成可以灵活调度的小任务
2. **Stall-Free Scheduling**——让 Decode 不被 Prefill 打断，GPU 持续运转
3. **Uniform Batches**——保持 Batch 内部的一致性，减少流水线气泡

回到披萨店的类比：Sarathi-Serve 的做法相当于——新来一单，不把整张订单塞进流水线，而是先把面饼揉好（第一个 chunk），放进烤箱；接着揉第二个部分，再放进去……这样烤箱（GPU Decode）一直在工作，不会因为你正在准备新订单的材料就停下来。

## 参考资料

- OSDI '24 Paper: https://www.usenix.org/system/files/osdi24-agrawal.pdf
- Slides: https://www.usenix.org/system/files/osdi24_slides-agrawal.pdf
- Source Code: https://github.com/microsoft/sarathi-serve
