---
title: SGLang — 结构化推理运行时
来源: https://github.com/sgl-project/sglang
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

**SGLang**（Structured Generation Language）是 UC Berkeley LMSys 团队 2024 年开源的 LLM 推理运行时，核心创新叫 **RadixAttention**——把 KV cache 按 token 前缀组织成一棵基数树（radix tree），**跨请求**共享相同前缀的那段 KV，相同前缀只算一遍。

日常类比：

- **传统推理引擎（包括 vLLM）**：每个用户对话各自一份 KV cache。100 个 agent 都用同一个 2000 token 的系统 prompt？KV cache 算 100 次。
- **SGLang RadixAttention**：把所有请求的前缀拼成一棵树，相同前缀的那段 KV **只算一次、所有人共用**。100 个 agent 共享系统 prompt？算一次就够。

结果：在 agent / tool call / 多分支搜索这类**前缀高度重复**的场景，吞吐量比 vLLM 高 3-5 倍。

## 为什么重要

不理解 SGLang，下面这些事都没法解释：

- **agent 时代为什么需要新引擎**：传统推理把每个请求当独立流量；agent 一轮一轮调工具，每一轮 80% 的输入是上一轮的复读，浪费触目惊心
- **vLLM 已经那么快了，为什么还要 SGLang**：PagedAttention 解决的是单请求内显存碎片；RadixAttention 解决的是跨请求前缀重复——是两个不同维度的问题
- **结构化输出为什么这么快**：SGLang 的"压缩 FSM 解码"能在 JSON / 正则约束下一次跳过多个确定 token，比 Outlines / Guidance 快 3-5 倍
- **学术分量**：论文 NeurIPS 2024，已是 LMSys / DeepSeek / xAI 等团队 agent 工作流的默认引擎之一

## 核心要点

SGLang 的"快"来自三个发明叠加：

### RadixAttention（基数树 KV 缓存）

LLM 推理每一步都要查"前面所有 token 的 KV"。vLLM 把 KV 切成块按需分配，但**不同请求**的相同前缀仍各算一份。

SGLang 维护一棵 radix tree：树的每个节点存一段 token 序列对应的 KV cache 块。新请求来了，先沿着树走最长公共前缀——能复用就复用，走到分叉处再分配新块。GPU 显存满了用 LRU 淘汰叶子节点。

效果：100 个共享 2k 系统 prompt 的请求，KV 计算量从 200k token 降到 2k token。

### Compressed FSM（压缩有限状态机解码）

约束输出（JSON schema / 正则）的传统做法：每生成一个 token 都查一次 FSM 状态、屏蔽非法 token。

SGLang 提前把 FSM 编译成"压缩版"——能直接判定下一段是确定字符串（比如 `{"name":` 这 8 个 token 必出）的，**一次性跳过、不调用模型**。复杂 JSON 输出比无约束慢 < 5%。

### Frontend DSL（前端控制语言）

```python
@sgl.function
def multi_turn(s, q):
    s += sgl.system("You are a helpful assistant.")
    s += sgl.user(q)
    s += sgl.assistant(sgl.gen("answer", max_tokens=256))
```

`@sgl.function` 装饰一个普通 Python 函数，里面用 `+=` 拼对话。Runtime 看到这个 DAG 就能自动安排：哪些分支可以 fork 共享 KV、哪些 gen 可以并行批处理。

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

100 个并发请求各自不同的 user_msg。RadixAttention 自动识别公共前缀，KV 只算一次。同样硬件上 vLLM 跑 100 token/s，SGLang 能跑 400-500 token/s。

### 案例 2：tree-of-thoughts 分支推理

```python
@sgl.function
def tot(s, problem):
    s += sgl.user(problem)
    forks = s.fork(8)  # 同一前缀分 8 条思路
    for f in forks:
        f += sgl.assistant(sgl.gen("thought", max_tokens=128))
```

`fork(8)` 让 8 条分支共享父节点 KV，省 7 份重复算力。

### 案例 3：约束 JSON 输出

```python
s += sgl.gen("data", regex=r'\{"name": "[A-Z][a-z]+", "age": [0-9]+\}')
```

正则约束确保输出合法 JSON。压缩 FSM 把 `{"name": "` 这段固定文本一次性跳过，模型只对真正不确定的字段（名字 / 数字）调用一次。

## 踩过的坑

1. **缓存命中率掉就退化**：如果并发请求前缀都不一样（比如每人不同长系统 prompt），LRU 很快淘汰，性能回到 vLLM 水平
2. **前端 DSL 学习成本**：`sgl.function` / `sgl.gen` / `sgl.select` 比 OpenAI `chat.completions.create` 概念重，团队接入要适应
3. **tensor parallel 多卡支持度**：不如 vLLM 完整，部分新模型（特别是非 Llama 架构）需要等几个版本
4. **压缩 FSM 编译开销**：复杂正则第一次跑会有几百 ms 编译延迟，后续才稳定
5. **OpenAI 兼容 server 行为差异**：`/v1/chat/completions` 接口大体一致，但流式 chunk 的边界、function calling 字段在边角处与 OpenAI / vLLM 不完全一致，迁移测试要全跑

## 适用 vs 不适用场景

**适用**：

- agent 工作流（系统 prompt + 工具定义共享）
- 多分支推理（tree-of-thoughts / self-consistency / best-of-N）
- 结构化输出（JSON schema / 正则约束 / 函数调用）
- few-shot prompt 大量复用同一组 examples 的场景

**不适用**：

- 每个请求前缀都不同的开放式聊天 → RadixAttention 帮不上忙，直接用 vLLM
- 极致单卡吞吐、无前缀复用机会的批量任务 → vLLM / TensorRT-LLM 更稳
- 嵌入式 / 端侧推理 → 用 llama.cpp / MLC

## 与 vLLM 对比

| 维度 | vLLM | SGLang |
| --- | --- | --- |
| 核心创新 | PagedAttention（单请求显存分页） | RadixAttention（跨请求前缀复用） |
| 解决的瓶颈 | 显存碎片 | 前缀重复计算 |
| 适合场景 | 通用高吞吐 server | agent / 分支 / 结构化输出 |
| 前端 | OpenAI API | OpenAI API + Python DSL |
| 多卡支持 | 成熟 | 持续追赶 |

实际部署常见组合：通用聊天用 vLLM，agent / 工具调用用 SGLang，看流量画像。

## 学到什么

1. **优化的下一波在跨请求层**：单请求优化（PagedAttention / FlashAttention）已被吃透，下一个 5x 来自识别"很多请求其实在算同一段 KV"
2. **前端控制语言是 runtime 的杠杆**：让用户用 DSL 表达 fork / join，runtime 才知道哪里能共享
3. **结构化输出 = 把"确定的部分"从模型挪走**：FSM 知道下一段必是 `{"name":`，就别让 100B 模型一个 token 一个 token 生
4. **基础设施跟着负载演化**：2023 是单请求大模型时代，2024 起 agent 多步循环成为主流，引擎设计的"前提"在变

## 延伸阅读

- 论文：[Efficient Execution of Structured Language Model Programs (NeurIPS 2024)](https://arxiv.org/abs/2312.07104)
- 官方文档：[docs.sglang.ai](https://docs.sglang.ai/)
- LMSys blog：[Fast and Expressive LLM Inference with SGLang](https://lmsys.org/blog/2024-01-17-sglang/)
- [[vllm]] —— PagedAttention 是 RadixAttention 的近亲

## 关联

- [[vllm]] —— 同样高吞吐推理引擎，关注点不同：vLLM 单请求显存，SGLang 跨请求前缀
- [[pytorch]] —— SGLang runtime 基于 PyTorch
- [[accelerate]] —— HuggingFace 设备/分布式抽象，与 SGLang 解决的层次不同

## 一句话总结

**RadixAttention 把"很多人在算同一段前缀"这件浪费看穿了**——agent 时代每一轮系统 prompt + 工具定义几乎不变，前缀复用就是下一波数量级的吞吐红利。前端 DSL 是让 runtime 看懂"哪里能共享"的钥匙；压缩 FSM 是让结构化输出几乎免费的边角红利。组合起来才有 3-5 倍的真实收益。
