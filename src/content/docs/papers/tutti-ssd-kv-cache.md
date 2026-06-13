---
title: Tutti — 让 SSD 上的 KV Cache 真正可用于长上下文 LLM 推理
来源: 'Qiu et al., "Tutti: Making SSD-Backed KV Cache Practical for Long-Context LLM Serving", arXiv:2605.03375, 2026'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：图书馆借书，谁去跑柜台？

想象你在写一份超长报告，需要反复引用**同一套背景资料**（prefix caching 里的 KV cache）。资料太厚，放不进书桌（GPU HBM），也塞不进旁边的文件柜（CPU DRAM），只能存进**地下仓库的 NVMe 书架**（SSD）。

每次新开一个对话、发现「这段背景以前算过」，理想流程是：**把仓库里的笔记直接搬到 GPU 上**，跳过重复 prefill，省钱又省时间。

现实却像老式图书馆：

- vLLM 的 **PagedAttention** 把 KV 切成很多小「卡片」（每块 16–32 token），在 GPU 显存里**物理上不连续**。
- 从 SSD 恢复 128K token 的 prefix，可能要发起 **数万次** 小块随机读——像让管理员（CPU）一张一张办借书手续。
- 即使用 **GPU Direct Storage (GDS)**，每条 I/O 仍要 CPU 发起；CPU 并行度低，成为瓶颈。
- 结果是：GPU 空转等待数据（**GPU bubble** 占推理延迟 70%–80%），**从 SSD 读 KV 甚至比重新算一遍还慢**。

**Tutti**（论文来自厦大、上海交大、港科大等，已集成 vLLM）换了一个思路：**让 GPU 自己跑仓库**，CPU 只在每层异步加载一次 I/O kernel，把关键路径上的 CPU 干预从 \(O(\text{layer} \times \text{blocks})\) 降到 \(O(\text{layer})\)。论文报告：相对 GDS 版 LMCache，TTFT 降 **78.3%**，请求吞吐约 **2×**，服务成本降 **27%**，性能接近 DRAM 版 LMCache，但容量接近「无限」。

---

## 是什么

**Tutti** 是一个 **GPU 为中心（GPU-centric）** 的 **SSD 分层 KV cache 系统**，目标是在长上下文、高并发 LLM serving 场景下，让 **HBM–SSD 两层**（可配合 Mooncake 做集群元数据）既有大容量，又有可接受的 TTFT / ITL。

它解决的不是「KV 怎么算」，而是「**算好的 KV 怎么在 HBM ↔ SSD 之间高效搬运**」：

| 层级 | 典型容量 | Tutti 视角下的角色 |
|------|----------|-------------------|
| GPU HBM | 80 GB 级 | 热 KV，推理主战场 |
| CPU DRAM | TB 级以下 | 可选中间层；Tutti 主攻 HBM–SSD 直连 |
| NVMe SSD | 100 TB+ 级 | 冷 KV 持久化；prefix 命中率可 >80% |

与 **LMCache + GDS** 的对比（论文 Figure 1）：

- **CPU-centric**：CPU 管索引、发 I/O、同步；GDS 去掉 bounce buffer，但**控制面仍在 CPU**。
- **Tutti（GPU-centric）**：CPU 做 hash 映射、预分配 GPU file；**数据面 + I/O 控制面在 GPU**，通过 **GPU io_uring (gio_uring)** 异步提交海量 NVMe 请求。

---

## 为什么重要

### 1. Prefix caching 已是 MaaS 标配

相同 system prompt、多轮对话、Agent 工具链都会复用 prefix。命中时可跳过大量 prefill，**单 token 成本可降一个数量级**。但 KV 随上下文长度 × 并发会话线性增长，HBM 很快不够。

### 2. DRAM 不够，SSD 又「理论上够、实际上慢」

商业服务器可配 **100 TB+ NVMe**；论文引用行业数据：约 2 TB DRAM 也只能保留约 **5 分钟** 的 KV。SSD 是唯一现实的大容量层，但 prior work 显示 SSD tier 常因 I/O 碎片化 + CPU 瓶颈而**不如重算**。

### 3. 推理引擎越来越快，I/O 短板更刺眼

vLLM 0.12 → 0.17 计算优化后，GDS 路径的相对劣势更明显：算得更快，等 KV 的时间占比更高。Tutti 的存储–计算协同设计在**新一代 serving 栈**上仍保持最优 TTFT。

---

## 核心概念

### 1. Prefill、Decode 与 KV Cache（复习）

- **Prefill**：并行处理输入 prompt，生成各层 K/V；指标 **TTFT**（Time to First Token）。
- **Decode**：自回归逐 token 生成；指标 **ITL**（Inter-Token Latency）。
- **Prefix caching**：不同请求共享相同 prompt 前缀时，复用已有 K/V，跳过 prefill 计算。

### 2. PagedAttention 带来的 I/O 碎片化

vLLM / SGLang 等把 KV 切成 block，形状约 `[Block, num_heads, head_dim]`，每 block 16–32 token。逻辑上连续的 prefix，在显存和 SSD 上都是**大量离散小块**。

论文量化（Qwen3-32B，block=64）：重载 **128K token** KV 约需 **256K 个** 分散的 ~80KB 对象——对 SSD 是灾难级随机小 I/O。

### 3. GPU 原生对象抽象（Object Store）

Tutti 在 **GeminiFS** 之上扩展 **GPU-centric object store**：

- 每个 **KV memory block** 对应 **一个对象**；一个 GPU file 含 **2×L 个对象**（每层 K 一个、V 一个）。
- **Tensor-Stripe** 布局：按张量粒度条带化到多块 NVMe，而非细粒度 storage striping，使 **I/O 粒度与 KV transfer 对齐**。
- 启动时 **预分配 NVMe file pool**；运行时 CPU 只做 `hash(KV) → GPU file ID`，**不在关键路径创建/删除文件**。
- **P2P 内存映射表**：KV pool 地址固定，启动时预计算 **SGL（Scatter-Gather List）** 描述符，避免运行时逐页 PRP 构造（60GB KV 用 PRP 可能浪费 ~3.75GB HBM，SGL 约 **15MB**）。

### 4. GPU io_uring (gio_uring)

模仿 Linux **io_uring**：

- CPU 在 GPU HBM 里准备 **SQ/CQ 环形队列** 和 **IOCB**（每个 IOCB 含最多 2048 个 IOCTX）。
- GPU I/O kernel 在专用 SM 上 **直接写 NVMe SQ、轮询 CQ**，无需 CPU 逐条 `read()`。
- 用 **NVIDIA Green Context** 划分 **Compute Domain** 与 **I/O Control Domain**，避免 I/O kernel 饿死 attention kernel。

### 5. Slack-Aware I/O 调度

两个问题：

1. **读写同时打 SSD** 时，带宽可能掉 **60%**（NVMe 内部 cache 争用）。
2. I/O kernel 与 GEMM/Attention **争 SM**。

Tutti **离线 profiling** 每层、每种 `(input_len, prefix_len)` 下的 **slack 窗口**（有空闲 SM、且适合发 I/O 的时间段），查表决定：

- **Read** 优先（在 reuse 关键路径上）。
- **Write** 延后到 slack 或 decode 阶段 **best-effort** 刷盘。
- **读写解耦调度**，不做 naive layer-wise 读写 overlap。

### 6. vLLM 集成

~8000 行 C++ + ~1500 行 Python，挂 **KVConnector**，暴露 `retrieve_layer` / `store_layer`，与 vLLM block manager 粒度一致。多 GPU 时每卡独立 Tutti 实例 + 独立 NVMe 队列对；集群层可配合 **Mooncake** 做副本元数据与 local-first 路由。

---

## 问题从哪来：一个数字例子

下面用简化 Python 说明 **Paged KV → 海量 I/O**（教学用，非论文源码）：

```python
def count_kv_io_ops(
    num_layers: int,
    seq_len: int,
    block_size: int,
    kv_bytes_per_token_per_layer: int = 2 * 2 * 4096,  # K+V, fp16, hidden≈4096
) -> dict:
    """估算从 SSD 恢复 prefix KV 时的逻辑 I/O 对象数量。"""
    blocks_per_layer = (seq_len + block_size - 1) // block_size
    # vLLM: 每层 K block + V block 各一份，物理上常分开存
    objects_per_layer = 2 * blocks_per_layer
    total_objects = num_layers * objects_per_layer
    avg_object_bytes = block_size * kv_bytes_per_token_per_layer // 2  # 单层 K 或 V
    return {
        "total_objects": total_objects,
        "avg_object_kb": avg_object_bytes // 1024,
        "example": "Qwen3-32B, 128K, block=64 → ~256K objects @ ~80KB",
    }

# 论文量级
print(count_kv_io_ops(num_layers=64, seq_len=128 * 1024, block_size=64))
# total_objects ≈ 262144，且多为随机读 → CPU 发 I/O 成为瓶颈
```

LMCache 默认 **256 token chunk** 时，128K prefix 仍要 **1000+ chunk 访问**；若 layer-wise pipeline，访问次数可到 **数万**。这就是 Tutti 要用 **bulk object + GPU 并行发 I/O** 的原因。

---

## Tutti 怎么用：接口与调度（概念代码）

论文实现的 **layer-wise** API 与 gio_uring 用法可概括为：

```python
# 概念性 Python：Tutti 在 vLLM KVConnector 中的调用形态
class TuttiKVConnector:
    def __init__(self, gpu_file_pool, gio_ring, slack_table):
        self.pool = gpu_file_pool
        self.ring = gio_ring
        self.slack = slack_table  # offline profile: (layer, L_in, L_prefix) -> slack

    def on_prefix_hit(self, request):
        """Reuse 关键路径：按层 retrieve。"""
        for layer in range(self.num_layers):
            slack = self.slack.lookup(
                layer, request.input_len, request.prefix_len
            )
            iocbs = self.pool.resolve_iocbs(request.kv_blocks, layer)
            if slack.can_overlap:
                # 在 slack 窗口内批量提交，与下一层 compute overlap
                self.ring.issue_io_async(iocbs, sm_budget=slack.sm_budget)
            else:
                # 无 slack → 立即 read，避免 stall attention
                self.ring.issue_io_sync(iocbs)
            self.ring.wait_layer_ready(layer)  # GPU 侧 wait_cqe，无 CPU 逐 I/O

    def on_kv_evict(self, request):
        """非关键路径：store 可延后。"""
        for layer in range(self.num_layers):
            if self.slack.has_write_window(layer):
                self.ring.enqueue_store(iocbs=self.pool.store_iocbs(...))
            else:
                self.ring.defer_store(...)  # decode 阶段 best-effort flush
```

底层 **gio_uring** 四步（论文 §3.2）：

```cpp
// 概念性 C++：GPU io_uring 生命周期
void tutti_prefill_layer(int layer, TuttiRuntime* rt) {
  // 1. CPU 已 init_queue；每层一次 get_iocb
  IoCbBatch batch = rt->gio->get_iocb(/*nums=*/max_parallel, /*event=*/compute_done);

  // 2. CPU 填 SGL 地址、GPU file offset（O(layer)，非 O(layer×blocks)）
  rt->object_store->fill_iocbs_from_p2p_table(batch, layer, kv_blocks);

  // 3. GPU I/O domain 专用 SM 上 issue_io
  rt->gio->issue_io(batch.ids, /*SMs=*/io_domain_sms);
  // NVMe SQ/CQ 操作在 GPU kernel 内完成

  // 4. compute stream 通过 CUDA event 依赖 I/O 完成
  rt->gio->wait_cqe(batch);  // 细粒度等待，无需 CPU 参与每条 I/O
  run_attention_layer(layer);
}
```

---

## 与相关工作的关系

| 系统 / 技术 | 做什么 | Tutti 的差异 |
|-------------|--------|--------------|
| **LMCache** | 分层 KV；chunk 聚合；可选 GDS | Tutti 消除 CPU 关键路径，bulk object + gio_uring |
| **GDS** | GPU↔SSD P2P DMA | 仍 CPU 发起 I/O；Tutti 把控制面也放到 GPU |
| **GeminiFS / BaM** | GPU 直接管 NVMe | 通用块/文件抽象；Tutti 针对 KV object + SGL + slack 调度 |
| **Mooncake** | 分布式 KV 调度 | Tutti 做节点内 fast path；Mooncake 管集群元数据 |
| **HCache / FlashGen** | DRAM 层 compute-I/O overlap | SSD 上 naive pipeline 会加剧读写争用；Tutti 读写解耦 |

压缩类工作（NestedKV、KV-Fold 等）解决 **显存里放多少 KV**；Tutti 解决 **放不下的 KV 怎么从 SSD 快速搬回来**——正交，可叠加。

---

## 实验结果（论文摘要）

**环境**：双 H100 80GB、512GB DRAM、4× Solidigm D7-PS1010 7.68TB、RAID-0；对比 vLLM 0.12 / 0.17 + LMCache（HBM / DRAM-LW / SSD / GDS）。

**工作负载**：LEval（3K–200K token）、LooGLE（常 >100K）；Poisson 到达的多会话并发。

**命中率（Table 1）**：HBM 8%/4%；DRAM 53%/24%；**SSD 84%/86%**——大容量 tier 显著提高 reuse。

**TTFT**（严格 SLO 下）：

- LEval + v0.17：Tutti 比 GDS 低 **78.3%**；有效 RPS **+100%** vs GDS，**+50%** vs DRAM。
- LooGLE 0.6 RPS：Tutti TTFT 约为 GDS 的 **1/2.63**。

**带宽微基准**：

- Retrieve：Tutti 最高 **25.9 GB/s** vs GDS ~11.9 GB/s（**2.08×**）。
- **SGL vs PRP**：单线程 500MB 读写，带宽 **31× / 91×** 提升。

**GPU bubble**：Tutti 将 stall 压到接近 **0**；GDS/SSD baseline 仍 **>70%**。

**成本**：SSD-backed Tutti 服务成本降 **27%**；性能 **接近 DRAM-backed LMCache**。

**极限上下文**：GLM-4-9B-1M、640K input，2 GPU + 4 盘；LMCache-GDS OOM，Tutti TTFT **1.2s**。

---

## 设计取舍与局限

**优势**

- 真正释放 NVMe 带宽，prefix caching 在 SSD tier **从「不可用」变为「接近 DRAM」**。
- 与 vLLM PagedAttention **block 粒度对齐**，引擎改动可控。
- Slack 调度 + SM 分区，针对 LLM **layer 依赖** 定制，而非通用存储 benchmark。

**代价 / 未覆盖**

- 依赖 **GeminiFS、Green Context、NVMe SGL** 等较新栈；部署复杂度高于纯 LMCache。
- **远程 KV** 仍走 CPU staging + RDMA，未 GPU-direct RDMA（论文 future work）。
- 离线 slack profile 需按模型/硬件 **warm-up**；配置变化要重新 profiling。
- 与 KV **压缩** 结合时的 object 布局、是否仍 bulk-friendly，论文未深入。

---

## 零基础自检清单

读完后，你应该能回答：

1. **为什么 GDS 不够？** — 控制路径仍在 CPU；paged KV 导致海量小 I/O，CPU 发不过来。
2. **Tutti 的三板斧？** — GPU object store、gio_uring、slack-aware 读写解耦调度。
3. **SGL 解决什么？** — 中等粒度 KV transfer 的 NVMe 描述符开销；省 HBM、提带宽。
4. **TTFT vs ITL** — Tutti 主要改善 prefill 阶段 KV **retrieve**；decode 也受益于更高 hit + 更少 bubble。
5. **和 prefix caching 的关系？** — Tutti 不替代 caching 策略，而是让 **SSD tier 的 cache hit 真正省钱省时间**。

---

## 进一步阅读

- 论文：[arXiv:2605.03375](https://arxiv.org/abs/2605.03375)
- 背景：**PagedAttention**（vLLM）、**LMCache**、**GPU Direct Storage**、**GeminiFS**
- 同仓库笔记：`kv-fold.md`（KV 递推）、`nestedkv.md`（KV 压缩）— 与 Tutti 的「分层存储 I/O」互补

---

## 一句话总结

**Tutti 把「从 SSD 搬 KV」从 CPU 柜台排队，改成 GPU 仓库管理员批量异步发货：对象化 KV、GPU io_uring 饱和 NVMe、slack 调度避免与算力打架——让 TB 级 prefix cache 的长上下文 serving 第一次变得和 DRAM 一样实用。**
