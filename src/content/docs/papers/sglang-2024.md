---
title: SGLang — 把 LLM 程序当成共享前缀的树来跑
来源: 'Zheng et al., "SGLang: Efficient Execution of Structured Language Model Programs", arXiv 2312.07104 / NeurIPS 2024'
日期: 2026-05-31
子分类: ML 系统
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

SGLang 是 LMSYS（做 Chatbot Arena 那帮人）2023 年底发的一个 LLM 推理系统，2024 进 NeurIPS。它解决两个具体痛点：

1. **多个请求经常共享同一段开头**（同一份 system prompt、同一份 few-shot 示例、同一份历史对话）。常规系统让它们各自重新算一遍，浪费。
2. **结构化输出**（要求模型吐合法 JSON / 满足某个正则）里，很多 token 其实是模板里固定的字符（比如 `"name":` 这种），但常规系统每个 token 都老老实实过一次大模型，慢。

SGLang 给这两件事各发明了一招：**RadixAttention**（前缀自动复用）和**压缩 FSM**（结构化跳步）。

日常类比：以前每个食客来店里都让厨师从头切菜熬汤；SGLang 是把"前面熬好的高汤"装在一棵树里，新人来时先看树上有没有现成的能接着用。

## 为什么重要

不理解它，看不懂为什么 [[vllm]] 不是 LLM 推理的终点：

- vLLM 的 PagedAttention 解决了**KV cache 内存碎片**问题（物理层），让 batch 能开得更大
- SGLang 的 RadixAttention 解决了**KV cache 语义复用**问题（逻辑层），让相同前缀只算一次
- 这两个优化是**正交**的——不是替代关系，是不同维度

实际数字：JSON 解码任务上 SGLang 相对 vLLM 最高 6.4x 吞吐；多轮对话和 agent 场景常见 2-5x。这不是小数点后的优化，是数量级。

## 核心要点

**第一招：RadixAttention（前缀复用）**

把所有正在处理的 prompt 拼成一棵 **radix tree（基数树）**，相同前缀自动共享同一份物理 KV cache。

```
请求 A:  "你是助手。问：苹果颜色？"
请求 B:  "你是助手。问：天空颜色？"
       └────共享───┘ └独占┘
```

请求 A 和 B 的 "你是助手。问：" 部分只在 GPU 显存里存一份。哪条不再活跃，按 LRU 淘汰。命中率高时（ShareGPT 多轮 > 70%），算力几乎只为新增后缀付费。

**第二招：压缩 FSM（结构化跳步）**

让用户给一个 schema（正则或 JSON 模板），SGLang 编译成有限状态机。生成时：

- 如果 FSM 当前只能接一个固定字符（比如刚生成完 `{`，下一步必然是 `"`），**直接跳过 LM 推理**，省一整次 forward
- 只有遇到分叉（"value 该填啥"）才真去采样

**第三招：前端 DSL 告诉 runtime 哪几条共享前缀**

```python
@sgl.function
def multi_choice(s, question):
    s += "Q: " + question
    forks = s.fork(4)               # 4 个并行分支
    for f in forks:
        f += sgl.gen("answer")       # 各自生成
```

`fork` 一调，runtime 就知道这 4 条物理上共享前缀，自动走 RadixAttention。

## 实践案例

**案例 1：跑一个简单的 JSON 抽取**

```python
import sglang as sgl

@sgl.function
def extract(s, text):
    s += "Extract from: " + text + "\n"
    s += "Output JSON: " + sgl.gen("json", regex=r'\{"name":"[^"]+","age":\d+\}')
```

`regex=` 那段会被编译成 FSM。生成时：

- `{` → 模板字符，跳
- `"name":"` → 模板字符，跳
- `Alice` → 真采样
- `","age":` → 模板字符，跳
- `30` → 真采样
- `}` → 模板字符，跳

7 次 LM forward 缩成 2 次。

**案例 2：和 vLLM 对比同一个多轮场景**

100 条请求，每条共享 2k token 的 system prompt + few-shot：

| 系统 | 处理时间 | 原因 |
|---|---|---|
| vLLM | ~30s | 每条独立算 KV |
| vLLM + prefix caching | ~12s | 显式开关，粒度粗 |
| SGLang | ~6s | RadixAttention 默认开，token 级粒度 |

## 踩过的坑

1. **不是永远更快**：随机短 prompt、低共享率场景，维护 radix 树本身有开销，吞吐拉不开 vLLM。判断标准：你的请求间前缀重复度 > 30% 才值得切。

2. **压缩 FSM 要求 schema 已知**：动态 schema（schema 是 LLM 自己生成的）退化成普通生成，没加速。

3. **不是 vLLM 的替代**：很多生产团队的搭配是"SGLang 跑结构化任务 + vLLM 跑通用 chat"。两者各打各的强项。

4. **多模态支持比 vLLM 晚**：早期版本对 vision-language 模型支持弱，2024 年才补齐 LLaVA 等。

## 适用 vs 不适用

**适用**：

- 多轮对话 / agent / chain-of-thought（前缀高度共享）
- JSON / SQL / code 等强结构化输出
- few-shot 评测（同一份 examples 喂 N 条样本）
- RAG（同一段检索内容套不同 query）

**不适用**：

- 单轮、随机、短 prompt 的通用 chat → vLLM 够用
- 实时流式且 schema 完全自由 → 压缩 FSM 用不上
- 极端追求最低延迟（首 token < 50ms）→ TensorRT-LLM 的内核级优化更激进

## 历史小故事

- **2023 年 12 月**：LMSYS（Chatbot Arena 团队）在 vLLM 已成主流后，意识到"内存层优化做完了，语义层还没人碰"，发了 SGLang v1
- **2024 年中**：广泛被 agent 和结构化任务用户采用；和 outlines（结构化生成库）形成竞争
- **2024 年底**：进 NeurIPS，正式被学术认可
- **影响**：之后 vLLM 也加了 prefix caching 开关，算是被推动的反向证明

## 学到什么

1. **同一个对象（KV cache）可以从不同维度优化**：内存碎片 / 语义复用 / 跨请求批处理 / 跨层重计算——每一刀都能切出 2-10x
2. **前端 DSL 不是花架子**：让用户显式表达"这两条 prompt 共享前缀"，runtime 就能放心做激进优化
3. **结构化生成是被低估的杠杆**：很多业务场景的输出 80% 是模板，跳过模板部分就是免费的几倍提速
4. **正交优化**：判断一个新系统该不该学，先问"它和我已知的方案是替代还是正交"。SGLang 是 vLLM 的正交补充，不是替代
5. **共享前缀这件事，离开 LLM 也成立**：编辑器多 buffer、数据库多查询、CDN 多请求——只要有"前缀重复"，就有 RadixAttention 思路的位置

## 延伸阅读

- 论文 PDF：[arXiv 2312.07104](https://arxiv.org/abs/2312.07104)
- 官方仓库：[sgl-project/sglang](https://github.com/sgl-project/sglang)（生产可用，更新很活跃）
- 视频讲解：[Lianmin Zheng — SGLang Tech Talk](https://www.youtube.com/results?search_query=sglang+lianmin+zheng)

## 关联

- [[vllm]] —— 内存层优化的基线，SGLang 在它之上做语义层
- [[tensorrt-llm-2023]] —— NVIDIA 的内核级优化路线，与 SGLang 的调度级路线互补
- [[medusa-2024]] —— 解码层多头并行，又一个正交维度
- [[specinfer-2023]] —— 推测解码的树状版本，思路和 RadixAttention 都在"用树形结构换吞吐"
- [[alpa-2022]] —— 自动并行调度的前辈，启发了"DSL 告诉 runtime 怎么跑"的思路
