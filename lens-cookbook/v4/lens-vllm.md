---
schema_version: 3
lens_id: vllm
title: lens-vllm
domain: lens
ring: adopt
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
body_chars: 2948
hardware_assumption: 默认 H100 80G 8 卡（次选 A100 80G / H200 141G）；4090 24G 走量化；MI300X / Ascend 910B 走专用 provider
provider_coverage_checklist: [vllm, sglang, TGI, TensorRT-LLM, lmdeploy, MindIE]
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
ring_summary: { adopt: 5, trial: 4, assess: 2, hold: 1 }
abstract: 底座推理 serving lens：调度 / KV / 量化 / 并行 / 投机 / provider / 部署
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

## 1. 选型铁律

1. ≤8 卡 H100 + ≤70B → vLLM TP，禁 TRT-LLM
2. 新模型 <2 周上线 → vLLM/SGLang，禁 engine build
3. H100+A100 共存 → 量化 AWQ
4. system prompt >1k 或多轮 chat → 必开 prefix caching
5. latency 敏感且 batch<16 → 评估 speculative；batch≥32 一律关
6. 在线+离线混跑 SLO 频破 → 先 chunked prefill 再 P/D
7. JSON schema 强约束 → SGLang 局部替换
8. 昇腾 → MindIE adopt；其他平台 hold

## 2. 候选

### 2.1 调度 / KV / 量化

调度：continuous batching V1 adopt / chunked prefill trial / P/D disaggregation assess。
KV：PagedAttention block=16 adopt / 自动 prefix cache adopt / FP8 KV trial / INT4 KV (lmdeploy) assess。
量化：FP8 W8A8 adopt / AWQ W4A16 adopt / GPTQ trial / SmoothQuant trial / GGUF hold。

### 2.2 并行 / 投机 / 部署

并行：TP adopt / EP adopt（MoE）/ DP+router adopt / PP trial / P/D assess。
投机：n-gram trial / EAGLE-2 adopt / Medusa hold / Lookahead assess。
部署：OpenAI server adopt / 多 LoRA adopt / LiteLLM 前置 adopt / K8s+KServe trial。

### 2.3 Provider

vLLM adopt（主选）/ SGLang adopt（局部，结构化输出）/ TensorRT-LLM trial（极限吞吐税重）/ TGI trial（活跃度下降）/ lmdeploy trial（国产+INT4 KV）/ MindIE adopt（昇腾）或 hold（其他）。

## 3. 迷你 ADR

**ADR-1 vLLM vs TRT-LLM**（vendor-selection）
Context：H100 8 卡 Qwen2.5-72B 在线，QPS 50，p99 TTFT<800ms，新模型 2 周上线。TRT-LLM 吞吐高 20-40%，但每模型/硬件/TP engine build，LoRA 滞后。
Decision：线上默认 vLLM；TRT-LLM 仅 A/B 与峰值兜底。
Alternatives：SGLang（吞吐略弱）/ TGI（活跃度下降）。
Consequences：vLLM 上线即用跟新模型；代价 FP8 吞吐低 20-40%；OpenAI API 回滚极低；QPS>200 再迁。

**ADR-2 量化 FP8 vs AWQ**（implementation-tuning）
Context：Llama-3-70B H100 80G×4 FP16 爆。FP8 H100 原生 A100 不支持；AWQ 全平台激活 FP16。
Decision：H100/H200 quantization=fp8、kv_cache_dtype=fp8_e5m2；A100 quantization=awq_w4a16。
Consequences：FP8 吞吐 1.6-1.8× 损失<0.5% 锁 H100+；AWQ 1.3-1.5× 损失<1% A100 兼容；KV FP8 省 50% 显存但长上下文需 task-eval；回滚去 flag。

**ADR-3 是否启用 prefix caching**（implementation-tuning）
Context：chat system prompt 1.5k 固定 + 5-10 轮历史，重算 prefill 浪费。vLLM 0.5+ --enable-prefix-caching。
Decision：开 prefix caching，block_size=16，监控 cache_hit_rate / num_preempted。
Consequences：稳态 TTFT 降 60-80%，吞吐升 20-40%；KV 池挤占可能 preempt；命中率<30% 关闭；回滚去 flag。

**ADR-4 prefill/decode disaggregation**（architecture）
Context：H100 紧张，在线 chat 与离线批量打分共用集群，长 prompt 把 decode batch 抖崩。
Decision：短期单集群 + chunked prefill + 优先级队列；长期 QPS>100 或 SLO 频破拆 P/D，KV 走 NIXL/Mooncake。
Rollback：单集群启动脚本 + DNS 切回；协议未收敛阶段禁不可逆改造。
Consequences：短期靠 chunk_size 压 TTFT；长期 P/D 让 TTFT 与 ITL 各自最优，代价 KV 跨节点（RDMA 必需）+ 双集群 + 故障域翻倍。

## 4. 决策树

```
Q1 H100+A100 共存?
  Y → AWQ + vLLM → ADR-2 → Q3
  N → Q2
Q2 极限吞吐 vs 上线速度?
  极限（QPS>100）→ TRT-LLM+FP8 → ADR-1/2 → Q4
  上线（2 周）→ vLLM+FP8 → ADR-1/2 → Q3
Q3 system prompt>1k 或多轮?
  Y → prefix caching → ADR-3 → Q4
  N → Q4
Q4 latency 敏感 & batch<16?
  Y → speculative（n-gram→EAGLE-2）→ Q5
  N → 关投机靠 batch → Q5
Q5 在线+离线混跑或 SLO 频破?
  Y → P/D 评估 → ADR-4
  N → 单集群+chunked prefill → done
```

## 5. 缺口与待补

1. block_size 16/32/64 在 >32k 最优值
2. speculative batch>32 临界点
3. FP8 KV >64k 精度漂移——缺 task-eval
4. P/D KV 协议（NIXL/Mooncake/LMCache）演进
5. MoE EP+TP 策略——DeepSeek 经验值
6. V1 + Rust frontend 边界
7. TGI 是否保留——2026Q3 复盘
