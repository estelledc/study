---
title: SGLang — 结构化推理运行时
来源: https://github.com/sgl-project/sglang
日期: 2026-05-31
分类: AI / 推理
难度: 中级
---

## 是什么

**SGLang**（Structured Generation Language）是 LMSYS 团队（UC Berkeley / Stanford 背景）2024 年开源的 LLM 推理运行时，核心创新叫 **RadixAttention**——把 KV cache 按 token 前缀组织成一棵基数树（radix tree），**跨请求**共享相同前缀的那段 KV，相同前缀只算一遍。

日常类比：

- **传统推理引擎（早期 vLLM 等）**：每个用户对话各自一份 KV cache。100 个 agent 都用同一个 2000 token 的系统 prompt？前缀 KV 往往各算各的。
- **SGLang RadixAttention**：把所有请求的前缀拼成一棵树，相同前缀的那段 KV **只算一次、所有人共用**。100 个 agent 共享系统 prompt？算一次就够。

结果：在 agent / tool call / 多分支搜索这类**前缀高度重复**的场景，论文报告相对当时基线（含 vLLM）吞吐最高约 **6.4×**；博客常见「最高约 5×」口径。

## 为什么重要

不理解 SGLang，下面这些事都没法解释：

- **agent 时代为什么需要新引擎**：传统推理把每个请求当独立流量；agent 一轮一轮调工具，每一轮大部分输入是上一轮的复读
- **vLLM 已经那么快了，为什么还要 SGLang**：PagedAttention 解决单请求内显存碎片；RadixAttention 解决跨请求前缀复用——维度不同（现代 vLLM 也可开 prefix cache，但树调度 + 前端 fork 仍是 SGLang 强项）
- **结构化输出为什么不那么贵**：压缩 FSM 能在 JSON / 正则约束下一次跳过多个确定 token；相对 Outlines+vLLM / Guidance，博客测到延迟约 2×、吞吐约 2.5× 量级提升
- **产业位置**：论文 NeurIPS 2024；DeepSeek 官方推荐用它跑 V3/R1，xAI 等也大规模采用

## 核心要点

SGLang 的"快"来自三个发明叠加：

### RadixAttention（基数树 KV 缓存）

LLM 推理每一步都要查"前面所有 token 的 KV"。PagedAttention 把 KV 切成块按需分配；**未开前缀缓存**时，不同请求的相同前缀仍可能各算一份。

SGLang 维护一棵 radix tree：节点存一段 token 对应的 KV 块。新请求先走最长公共前缀——能复用就复用，分叉处再分配。显存满了用 LRU 淘汰叶子。

效果：100 个共享 2k 系统 prompt 的请求，前缀 KV 计算量从约 200k token 量级降到约 2k。

### Compressed FSM（压缩有限状态机解码）

约束输出（JSON schema / 正则）的传统做法：每生成一个 token 都查 FSM、屏蔽非法 token。

SGLang 把相邻「只有一条出路」的边压成一条——能判定下一段是确定字符串（如 `{"name":`）的，**一次性跳过**。论文消融：压缩 FSM 给 JSON 基准约 **1.6×** 吞吐；博客甚至观察到约束解码可快过普通解码。

### Frontend DSL（前端控制语言）

```python
@sgl.function
def multi_turn(s, q):
    s += sgl.system("You are a helpful assistant.")
    s += sgl.user(q)
    s += sgl.assistant(sgl.gen("answer", max_tokens=256))
```

`@sgl.function` 装饰普通 Python 函数，用 `+=` 拼对话。Runtime 看到这个 DAG 就能安排：哪些分支 fork 共享 KV、哪些 gen 可并行批处理。

## 实践案例

### 案例 1：100 个 agent 共享系统 prompt

```python
import sglang as sgl
@sgl.function
def agent(s, user_msg):
    s += sgl.system(BIG_SYSTEM_PROMPT)  # 2000 token，所有 agent 共享
    s += sgl.user(user_msg)
    s += sgl.assistant(sgl.gen("reply"))
```

逐步读：

1. 100 个并发请求各自不同的 `user_msg`，但系统 prompt 相同
2. RadixAttention 把公共前缀挂到同一树节点，KV 只算一次
3. 分叉后只为各自 user/assistant 分配新块——前缀命中越高，相对「各算各的」越赚

### 案例 2：tree-of-thoughts 分支推理

```python
@sgl.function
def tot(s, problem):
    s += sgl.user(problem)
    forks = s.fork(8)  # 同一前缀分 8 条思路
    for f in forks:
        f += sgl.assistant(sgl.gen("thought", max_tokens=128))
```

逐步读：`fork(8)` 先共享父节点 KV → 8 条分支只在分叉后各自生成 → 省下约 7 份重复前缀算力。这是前端 DSL 把「哪里能共享」显式告诉 runtime 的典型用法。

### 案例 3：约束 JSON 输出

```python
s += sgl.gen("data", regex=r'\{"name": "[A-Z][a-z]+", "age": [0-9]+\}')
```

逐步读：正则保证结构合法 → 压缩 FSM 把 `{"name": "` 等固定片段一次性跳过 → 模型主要只在名字/数字等不确定处采样。复杂 schema 首次会有编译开销，同 schema 复用后才稳。

## 踩过的坑

1. **缓存命中率掉就退化**：并发请求前缀都不一样时，LRU 很快淘汰，优势回到「普通高吞吐引擎」水平
2. **前端 DSL 学习成本**：`sgl.function` / `sgl.gen` / `sgl.select` 比 OpenAI `chat.completions.create` 概念重
3. **多卡/新架构节奏**：tensor parallel 等能力持续追赶；部分非主流架构要等几个版本才稳
4. **压缩 FSM 编译开销**：复杂正则第一次跑可能有数百 ms 预处理，务必跨请求复用编译结果
5. **OpenAI 兼容差异**：`/v1/chat/completions` 大体一致，流式 chunk 边界、function calling 字段边角与 OpenAI / vLLM 不完全一致

## 适用 vs 不适用场景

**适用**：

- agent 工作流（系统 prompt + 工具定义共享）
- 多分支推理（ToT / self-consistency / best-of-N）
- 结构化输出（JSON schema / 正则 / 函数调用）
- few-shot 大量复用同一组 examples

**不适用**：

- 每个请求前缀都不同的开放式聊天 → 前缀树帮不上忙
- 极致单卡吞吐、无前缀复用的批量任务 → vLLM / TensorRT-LLM 更稳
- 嵌入式 / 端侧推理 → llama.cpp / MLC

## 与 vLLM 怎么选

| 维度 | vLLM | SGLang |
| --- | --- | --- |
| 核心创新 | PagedAttention（显存分页） | RadixAttention（跨请求前缀树） |
| 适合场景 | 通用高吞吐 server | agent / 分支 / 结构化输出 |
| 前缀缓存 | 现代版本可开 | 默认树结构 + 调度 |
| 前端 | OpenAI API | OpenAI API + Python DSL |

常见组合：通用聊天用 vLLM，agent / 工具调用用 SGLang，按流量画像选。

## 历史小故事（可跳过）

- **2023**：vLLM PagedAttention 把单请求显存碎片打穿，高吞吐 serving 成标配
- **2024-01**：LMSYS 发布 SGLang + RadixAttention 博客，强调 agent / 多轮前缀复用
- **2024-02**：压缩 FSM / jump-forward 博客，结构化解码加速
- **2024-12**：NeurIPS 2024 论文正式发表；随后 DeepSeek V3 等推荐 SGLang 作为推理引擎之一

## 学到什么

1. **优化的下一波在跨请求层**：单请求优化被吃透后，下一个数量级来自「很多请求其实在算同一段 KV」
2. **前端控制语言是 runtime 的杠杆**：用 DSL 表达 fork / join，runtime 才知道哪里能共享
3. **结构化输出 = 把确定部分从模型挪走**：FSM 知道下一段必是 `{"name":`，就别让大模型逐 token 猜
4. **基础设施跟着负载演化**：2023 单请求大模型 → 2024+ agent 多步循环，引擎前提在变

## 延伸阅读

- 论文：[Efficient Execution of Structured Language Model Programs (NeurIPS 2024)](https://arxiv.org/abs/2312.07104)
- 官方文档：[docs.sglang.ai](https://docs.sglang.ai/)
- LMSys blog：[Fast and Expressive LLM Inference with SGLang](https://lmsys.org/blog/2024-01-17-sglang/)
- 压缩 FSM 博客：[Fast JSON Decoding…](https://lmsys.org/blog/2024-02-05-compressed-fsm/)
- [[vllm]] —— PagedAttention 是近亲；现代 vLLM 也有 prefix cache

## 关联

- [[vllm]] —— 同为高吞吐推理引擎：vLLM 侧重显存分页，SGLang 侧重跨请求前缀树
- [[pytorch]] —— SGLang runtime 基于 PyTorch
- [[accelerate]] —— HuggingFace 设备/分布式抽象，层次不同

## 一句话总结

**RadixAttention 把「很多人在算同一段前缀」看穿了**——agent 时代系统 prompt + 工具定义几乎不变，前缀复用就是吞吐红利。前端 DSL 让 runtime 看懂共享点；压缩 FSM 让结构化输出便宜。收益高度依赖缓存命中率，不是无条件 5×。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[oscar-int2-kv]] —— OSCAR — 离线转个方向，把 KV Cache 压到 2-bit
- [[prefix-cache-policy-2026]] —— Beyond LRU — 混杂负载下的 LLM 前缀缓存淘汰（UniCache）
- [[triton-inference-server]] —— Triton Inference Server — NVIDIA 多框架推理服务化标杆
- [[projects/vllm]] —— vLLM — 高吞吐 LLM 推理引擎
