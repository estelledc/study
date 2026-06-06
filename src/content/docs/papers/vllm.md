---
title: vLLM — 把操作系统的分页搬进 GPU KV cache
来源: 'Kwon et al., "Efficient Memory Management for LLM Serving with PagedAttention", SOSP 2023'
日期: 2026-05-30
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

vLLM 是一套**让大模型推理服务把显存当虚拟内存来管**的系统。

日常类比：以前 LLM 服务给每条请求分配显存，像旅馆把整栋楼的一整层提前划给一位客人，哪怕他只住一晚一个人——空着的房间也不能给别的客人。vLLM 的做法是：把楼层切成大小一样的小房间（block），客人按需开房，一份"房间号清单"（page table）告诉系统这位客人占了哪几间。客人退房，房间立刻回池子给下一位用。

它的核心算法叫 **PagedAttention**：把 GPU 上的 KV cache 切成等长 block，每个 sequence 持有一张 page table 做间接寻址，多条 sequence 可以引用同一个物理 block，必要时 copy-on-write。

这一招让单卡显存利用率从 20-38% 跳到 96%，端到端吞吐对比当时的开源方案提升 2-4x，是 2023-2024 年开源 LLM 服务的事实基线。背后只用了一个朴素观察：**OS 早在 1960s 就解决过类似问题**——把"应用看到的连续地址" 和"物理内存的非连续帧" 解耦——KV cache 也可以这样做。

## 为什么重要

不理解 vLLM，下面这些事都没法解释：

- 为什么同样一张 A100，社区方案吞吐能差 5-20 倍——KV cache 浪费率才是真瓶颈，而不是 attention 算得多快
- 为什么"continuous batching" 在 Orca 论文里就有，但要等 vLLM 才真正可用——KV 必须可分页才让调度想法落地
- 为什么 SGLang / Mooncake / TGI / TensorRT-LLM 这些 2024 年新框架都长得像 vLLM——它们继承了同一套 KV 抽象
- 为什么"读 50 年前的 OS 教科书" 在 ML infra 工程里仍然有回报——分页 / 引用计数 / copy-on-write 都是 1960s-1980s 的设计，但放到 GPU 上仍是新东西

## 核心要点

PagedAttention 用三个机制把 KV cache 从"一段连续显存" 改造成"分页的虚拟内存"：

1. **固定大小 block**：把 KV cache 切成等长 block（默认 16 token），就像 OS 把内存切成 4KB page。所有 block 大小一样，不会出现"洞拼不上新 block" 的外部碎片，每条 sequence 末尾最多浪费 block_size 个 token——内部碎片有上限。

2. **间接寻址（page table）**：每条 sequence 有自己的 block_table，把"逻辑第 N 块" 映射到"GPU 上第 M 个物理 block"。CUDA kernel 多走一次查表，但物理 block 在显存里的位置可以乱序。类比：你的电脑用 4GB 进程地址空间，不需要它真的连续摆在物理内存。

3. **引用计数 + copy-on-write**：物理 block 带 ref_count，parallel sampling 的多条候选共享同一段 prompt 的 block，ref_count = N。要往共享 block 上写新 token 时先复制再写。一份 prompt 的 KV，多条候选只算一份显存。

三个机制合起来叫 **PagedAttention**，配上一个改写过的 attention CUDA kernel 才跑得起来。kernel 的改动很小：原来直接按下标读 K/V 张量，现在先查 block_table 拿到物理 block 编号，再算偏移——多一次 int load + 一次乘法。

## 实践案例

### 案例 1：起一个 vLLM 服务跑 7B 模型

最小可运行 demo，单卡 A10 / 4090 都能跑：

```python
from vllm import LLM, SamplingParams

llm = LLM(model="meta-llama/Llama-2-7b-chat-hf",
          gpu_memory_utilization=0.9,
          block_size=16)
prompts = ["介绍一下量子计算。", "写一首关于伯克利的俳句。"]
out = llm.generate(prompts, SamplingParams(temperature=0, max_tokens=128))
for o in out:
    print(o.outputs[0].text)
```

启动时 vLLM 会**一次性把 90% 显存切成 block 池**（每个 block 大小 = block_size × num_kv_heads × head_dim × 2 bytes），后续所有请求只在这个池里申请。`nvidia-smi` 看到显存稳定在 90%，是预期行为不是泄漏。同时这就是为什么 vLLM 比 HF transformers 一开始更"占显存"——它把池子开足了，但内部周转极快。

这就是为什么 vLLM 用同样的硬件能比 HF transformers 多扛几倍的并发：池化 + 间接寻址 + 周转效率。

### 案例 2：parallel sampling 看共享显存

```python
out = llm.generate(["翻译这句话："] * 1,
                   SamplingParams(n=4, temperature=0.8, max_tokens=64))
```

`n=4` 让一条 prompt 生成 4 条候选。vLLM 内部只为 prompt 分配一份 block，ref_count 设成 4；4 条候选 sequence 共享这些 block，谁先写新 token 谁触发 copy-on-write 拷一个新 block 出去。**显存只多花一个 block，不是 4 倍**。

如果用 HF transformers 跑同样的 `n=4`，4 条候选各自完整复制一份 prompt 的 KV，显存接近 4 倍。论文测试这种场景下 vLLM 节省 55% KV 显存，是 prefix sharing 优化最直接的体现。

观察 `llm.llm_engine.scheduler.block_manager.gpu_allocator.get_num_free_blocks()` 这个内部 API，可以在生成中途看到 free block 池的水位变化——是检验"KV 池子真的在动" 最直观的方式。

### 案例 3：故意 OOM 看 preemption

```python
llm = LLM(model="...", gpu_memory_utilization=0.99, max_num_seqs=512)
```

激进配置 + 大并发会让 free block 用完。vLLM 触发 **RECOMPUTE preemption**：选优先级最低的 sequence 整段丢掉，下次重新跑 prefill。这是 OS 层 "OOM killer + page fault" 的类比——分页系统设计上必须有"塞不下时怎么办" 的预案。

另一种模式叫 **SWAP**：把 block 拷到 CPU 内存，需要时再拷回 GPU。但 PCIe 4.0 单向 32 GB/s，长 prompt 拷一次比直接 RECOMPUTE 还慢，社区里不少 issue 反映 SWAP 路径不稳，后续版本默认改回 RECOMPUTE。

## 踩过的坑

1. **gpu_memory_utilization 别拉到 0.99**：activation 峰值和零碎对象会顶上来，留 5-10% 缓冲，否则 OOM 触发 preempt 反而拖慢吞吐——硬挤显存的"贪心" 是分页系统最经典的反模式。
2. **block_size 不要瞎调**：默认 16 是 ShareGPT trace 上 sweep 出来的，调小（如 8）CoW 单次便宜但 kernel launch overhead 高，调大（如 64）单步省事但内部碎片翻倍——除非有自己的 trace + 完整 sweep。
3. **PagedAttention kernel 单步比连续 KV 慢 20-26%**：间接寻址要多一次 int load + 乘法，单条请求 / 极致低延迟场景会感受到这个开销，只在多并发下才回本。
4. **parallel sampling 第一步会触发 N-1 次 copy-on-write**：N=4 时第一步要拷 3 个 block，约 7.5MB GPU memcpy，HBM 上几微秒但 kernel launch 有可见 latency 尖峰，写 latency-敏感的应用要心里有数。
5. **block_table 自身的显存开销也不是零**：每条 sequence 一张表，长 prompt + 大并发下集合也能吃掉几十 MB，容量规划时要把这部分 metadata 算进去。

## 适用 vs 不适用场景

**适用**：

- 请求并发 > 8 且请求长度方差大——KV 利用率提升和 continuous batching 红利在这里最大
- 多租户开源 LLM serving，需要榨干 GPU 显存把成本压到接近商业 API
- 有 prefix sharing 需求（system prompt / parallel sampling / beam search 三类典型 workload）
- 把 vLLM 当 baseline 之后再叠加 LoRA 共享、prefix cache、speculative decoding 等功能

**不适用**：

- 单条请求 / 离线 batch eval——HF transformers 已够，引入 vLLM 反而增加部署复杂度（Ray 进程 + CUDA 版本兼容 + Python 限制）
- 极致低延迟（< 50ms 首 token）——调度本身有 5-10ms overhead，TensorRT-LLM 或定制 FasterTransformer 更合适
- BERT-style encoder-only 模型——没有 KV cache，PagedAttention 价值归零
- Mamba / RWKV 等 state-space 模型——state 大小固定，没有可省的浪费

## 历史小故事（可跳过）

- **1960s**：操作系统分页和虚拟内存被发明，把"应用看到的连续地址" 和"物理内存的非连续帧" 解耦，是这套思想的源头。
- **2022 OSDI Orca**：提出 iteration-level scheduling，让 batch 在每一步重组——但受限于"KV cache 必须预留 max_len 连续显存"，加入新请求很贵，调度想法只能实现 60% 的价值。
- **2023 春**：UC Berkeley Sky Computing Lab 的 Kwon、Li、Zhuang 等人在内部跑通 PagedAttention 原型，把 OS 分页思想搬进 GPU KV cache 管理；最早的实验显示 KV 利用率从不到 40% 跳到 96%。
- **2023 年 6 月**：vLLM 开源，几个月内成为开源 LLM serving 的事实标准，仓库迅速积累上万 stars。
- **2023 年 9 月**：论文进 SOSP（操作系统会议而非 ML 会议——侧面印证它的核心贡献是系统抽象而非算法），正式确立"KV cache 不必连续" 的范式。
- **2024 年起**：TGI / TensorRT-LLM / SGLang / Mooncake 全部沿用其 KV 抽象，继续往上叠 prefix tree、KV 解耦、跨节点共享等能力。

注意：preemption 是兜底机制，正常 workload 不会触发。如果生产里频繁触发 preemption，说明 max_num_seqs 或 gpu_memory_utilization 配得太激进，是配置问题而非系统问题。

## 学到什么

1. **资源池化的三件套：固定 unit + 间接寻址 + 引用计数共享**——这套模式适用于任何"对象大小可变 + 生命周期不一 + 有共享" 的资源管理问题（数据库 buffer pool、JVM 堆、文件系统 inode）
2. **decode 阶段是 memory-bound 不是 compute-bound**：KV cache 读带宽决定吞吐上限，"塞更多 batch" 比"算更快" 更重要，所以"省显存" 直接等价于"提吞吐"
3. **kernel 慢一点但系统快很多** 是合理的工程权衡——单步 -25%，端到端吞吐 +200%；不要陷入"局部最优害全局" 的陷阱
4. **OS 50 年前的概念在 ML infra 里反复出现**：分页、虚拟内存、引用计数、copy-on-write、preemption——多读 OSTEP 长期回报远大于追最新 paper

## 延伸阅读

- 论文 PDF：[Efficient Memory Management for LLM Serving with PagedAttention (arXiv 2309.06180)](https://arxiv.org/abs/2309.06180)
- 代码：[vllm-project/vllm](https://github.com/vllm-project/vllm) v0.2.0 即论文版本，后续 v0.4+ 已切到 v1 engine
- 视频讲解：[Kwon — vLLM SOSP'23 talk](https://www.youtube.com/watch?v=5ZlavKF_98U)（30 分钟系统讲一遍 PagedAttention）
- 教科书背景：[OSTEP](https://pages.cs.wisc.edu/~remzi/OSTEP/) 第 18-19 章（分页 / TLB），是 vLLM 思路的源头
- [[flash-attention]] —— prefill 阶段的 attention kernel 革命，与 vLLM 互补
- [[megatron-lm]] —— 训练侧的张量并行，启发 vLLM 在 serving 侧做 TP

## 关联

- [[flash-attention]] —— tiling + IO-aware attention，prefill 阶段配套使用，与 PagedAttention 是 prefill / decode 的双子星
- [[megatron-lm]] —— 训练侧切分思想被搬到 serving 侧，是 vLLM 的"上一代师承"
- [[deepspeed-zero]] —— 训练侧的内存切分，和 vLLM 是同一类"显存即资源" 思路
- [[volcano-1994]] —— 用 iterator 抽象数据流的经典数据库设计，和 vLLM 用 page 抽象 KV 是同一种"加一层间接" 招数
- [[cascades-1995]] —— 同样在受限资源里做调度优化，思想血缘相近
- [[rocksdb-lsm]] —— LSM 树用 SST 文件分块管理写入，和 vLLM 分块管理 KV 是同一种"切固定 unit" 模板
- [[mapreduce]] —— 也是用一层调度抽象把工程问题从算法问题里剥离出来，看上去与 LLM 无关其实思路相同

- [[lampson-hints]] —— "OS 经典经验直接用到新场景" 是 Lampson 那篇 hints 的精神，PagedAttention 是教科书示范

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
