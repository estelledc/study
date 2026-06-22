---
schema_version: 6
lens_id: vllm
title: lens-vllm
domain: lens
layer: serving
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 默认 H100 80G 8 卡（次选 A100 80G / H200 141G）；4090 24G 走量化；MI300X / Ascend 910B 走专用 provider
provider_coverage_checklist: [vllm, sglang, TGI, TensorRT-LLM, lmdeploy, MindIE]
ring_summary: { adopt: 8, trial: 5, assess: 1, hold: 0 }
wikilinks: [vllm, sglang, attention, flash-attention, triton-llm, mixture-of-experts, hopper-architecture-2022, ampere-architecture-2020, blackwell-architecture-2024, awq, eagle, ollama, llama-cpp]
out_of_corpus: [paged-attention, continuous-batching, prefix-caching, tensorrt-llm, tgi, lmdeploy, mindie, fp8-quant, chunked-prefill, prefill-decode-disaggregation]
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
sources:
  - vLLM 官方文档 https://docs.vllm.ai/
  - PagedAttention SOSP'23 https://arxiv.org/abs/2309.06180
  - SGLang / TRT-LLM / TGI / lmdeploy / MindIE 文档
  - DistServe / Splitwise / SARATHI-Serve OSDI'24
  - EAGLE-2 / AWQ / GPTQ 论文
  - Inside vLLM https://www.aleksagordic.com/blog/vllm
open_questions:
  - block_size 16/32/64 在 >32k 上下文最优值，跨框架无统一 benchmark
  - speculative 在 batch>32 收益归零临界点
  - FP8 KV 在 >64k 精度漂移上限
  - P/D KV transfer 协议（NIXL/Mooncake/LMCache）尚未收敛
  - MoE EP+TP 组合策略仅经验值
  - vLLM V1 + Rust frontend 边界 2026 仍在迁移
  - TGI 活跃度下降，是否纳入主决策树
---

## 候选表

verified 2026-05-31。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| vLLM | adopt | vLLM: 主选 OpenAI server | 通用 H100/A100 | serving |
| SGLang | adopt | SGLang: 局部 结构化输出 | JSON schema 强约束 | serving |
| TensorRT-LLM | trial | TRT-LLM: 极限吞吐税重 | QPS>200 峰值兜底 | serving |
| TGI | trial | TGI: 活跃度下降 | 存量集群兼容 | serving |
| lmdeploy | trial | lmdeploy: 国产 INT4 KV | 显存极紧 | serving |
| MindIE | adopt | MindIE: 昇腾 910B | Ascend 平台 | serving |
| PagedAttention | adopt | Paged: block=16 默认 | 所有 vLLM 部署 | serving |
| 自动 prefix cache | adopt | prefix: sys>1k 必开 | 多轮 chat | serving |
| FP8 W8A8 | adopt | FP8: H100 原生 | H100/H200 | serving |
| AWQ W4A16 | adopt | AWQ: A100 兼容 | H100+A100 共存 | serving |
| FP8 KV | trial | FP8KV: 省 50% 显存 | <64k 上下文 | serving |
| EAGLE/EAGLE-2 投机 | adopt | EAGLE2: batch<16 | latency 敏感 | serving |
| chunked prefill | trial | chunked: 压 TTFT | 长 prompt 抖动 | serving |
| P/D 解耦 | assess | P/D: KV 跨节点 | QPS>100 SLO 频破 | serving |

hold：Medusa（被 EAGLE-2 取代）/ Lookahead（assess→冷）/ n-gram 投机（trial→冷，被 EAGLE 主线吸收）/ INT4 KV（lmdeploy 专属，泛化弱）/ GGUF（服务侧不收敛）。

## ADR 索引

**ADR-1 vLLM vs TRT-LLM** (vendor-selection)

### context

H100 8 卡 Qwen2.5-72B 在线，QPS 50，p99 TTFT<800ms，新模型 2 周上线。TRT-LLM 吞吐高 20-40%，但每模型/硬件/TP 都要 engine build，LoRA 滞后。

### decision

线上默认 vLLM；TRT-LLM 仅作 A/B 与峰值兜底。

### alternatives

SGLang（吞吐略弱，结构化输出强）；TGI（活跃度下降，弃）；lmdeploy（国产卡场景再考虑）。

### consequences

vLLM 上线即用、跟新模型快；代价 FP8 吞吐低 20-40%；OpenAI API 兼容回滚成本极低；QPS>200 再迁 TRT-LLM。

**ADR-2 量化 FP8 vs AWQ** (implementation-tuning)

### context

Llama-3-70B 在 H100 80G×4 FP16 显存爆。FP8 H100 原生但 A100 不支持；AWQ 全平台兼容激活仍 FP16。

### decision

H100/H200 设 quantization = fp8、kv_cache_dtype = fp8_e5m2；A100 设 quantization = awq_w4a16。

### rationale

H100 Hopper Tensor Core 原生 FP8；AWQ 跨代兼容代价是激活仍 FP16。

### consequences

FP8 吞吐 1.6-1.8× 损失 <0.5% 锁 H100+；AWQ 1.3-1.5× 损失 <1% A100 兼容；KV FP8 省 50% 显存但长上下文需 task-eval；回滚去 flag。

**ADR-3 是否启用 prefix caching** (implementation-tuning)

### context

chat system prompt 1.5k 固定 + 5-10 轮历史，重算 prefill 浪费。vLLM 0.5+ 提供 --enable-prefix-caching。

### decision

开 prefix caching，block_size = 16，监控 cache_hit_rate 与 num_preempted。

### rationale

block_size=16 是 PagedAttention 默认，跨上下文长度稳定；过大会切碎命中率，过小元数据开销升。

### consequences

稳态 TTFT 降 60-80%，吞吐升 20-40%；KV 池挤占可能导致 preempt；命中率 <30% 关闭；回滚去 flag。

**ADR-4 prefill/decode disaggregation** (architecture)

### context

H100 紧张，在线 chat 与离线批量打分共用集群，长 prompt 把 decode batch 抖崩。

### decision

短期单集群 + chunked prefill + 优先级队列；长期 QPS>100 或 SLO 频破时拆 P/D，KV 走 NIXL/Mooncake。

### consequences

短期靠 chunk_size 压 TTFT；长期 P/D 让 TTFT 与 ITL 各自最优，代价 KV 跨节点（RDMA 必需）+ 双集群 + 故障域翻倍。

### rollback

单集群启动脚本 + DNS 切回；KV 协议未收敛阶段禁不可逆改造；P/D 跨节点延迟 >5ms 或 KV 丢包 >0.1% 立即退回单集群。

## 决策树

```
Q0 成本/规模门控（必跑）：
  QPS<10 且单卡 4090/3090 → ollama / llama.cpp，跳过 vLLM
  团队≤3 且月预算 <$1k → SaaS（Together/Fireworks/DeepInfra）
  合规本地化 或 QPS≥10 或 多卡集群 → 进 Q1
Q1 H100+A100 共存?
  Y → AWQ + vLLM → ADR-2 → Q3
  N → Q2
Q2 极限吞吐 vs 上线速度?
  极限（QPS>200）→ TRT-LLM+FP8 → ADR-1/2 → Q4
  上线（2 周内）→ vLLM+FP8 → ADR-1/2 → Q3
Q3 system prompt>1k 或多轮?
  Y → prefix caching → ADR-3 → Q4
  N → Q4
Q4 latency 敏感 & batch<16?
  Y → speculative（EAGLE-2 主线）→ Q5
  N → 关投机靠 batch → Q5
Q5 在线+离线混跑或 SLO 频破?
  Y → P/D 评估 → ADR-4
  N → 单集群+chunked prefill → done
```

## 外迁 excludes

stub: sources / reading_list / getting_started / what_is_not（`<slug>/vllm.md`，各 ≥50 字）。
