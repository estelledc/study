---
title: SGLang — 把 LLM 程序当成共享前缀的树来跑
来源: 'Zheng et al., "SGLang: Efficient Execution of Structured Language Model Programs", arXiv 2312.07104 / NeurIPS 2024'
日期: 2026-05-31
分类: GPU 推理
难度: 中级
---

## 是什么

SGLang 是 LMSYS（做 Chatbot Arena 那帮人）2023 年底发的一个 LLM 推理系统，2024 进 NeurIPS。它解决两个具体痛点：

1. **多个请求经常共享同一段开头**（同一份 system prompt、同一份 few-shot 示例、同一份历史对话）。常规系统让它们各自重新算一遍，浪费。
2. **结构化输出**（要求模型吐合法 JSON / 满足某个正则）里，很多 token 其实是模板里固定的字符（比如 `"name":` 这种），但常规系统每个 token 都老老实实过一次大模型，慢。

SGLang 给这两件事各发明了一招：**RadixAttention**（前缀自动复用）和**压缩 FSM**（结构化跳步）。

日常类比：以前每个食客来店里都让厨师从头切菜熬汤；SGLang 是把"前面熬好的高汤"装在一棵树里，新人来时先看树上有没有现成的能接着用。

## 为什么重要

不理解它，看不懂为什么 [[vllm]] 不是 LLM 推理的终点：

- vLLM 的 PagedAttention 解决了**KV cache（模型算过的中间记忆）内存碎片**问题（物理层），让 batch 能开得更大
- SGLang 的 RadixAttention 解决了**KV cache 语义复用**问题（逻辑层），让相同前缀只算一次
- 这两个优化是**正交**的——不是替代关系，是不同维度

实际数字（论文）：JSON 等任务上相对 vLLM 等引擎最高约 **6.4×** 吞吐；多轮 / agent 常见 **数倍**加速——不是小数点后的微调。

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

### 案例 1：JSON 抽取（压缩 FSM）

```python
import sglang as sgl

@sgl.function
def extract(s, text):
    s += "Extract from: " + text + "\n"
    s += "Output JSON: " + sgl.gen("json", regex=r'\{"name":"[^"]+","age":\d+\}')

# 需先起 runtime（如 python -m sglang.launch_server ...），再 sgl.set_default_backend(...)
state = extract.run(text="Alice is 30 years old.")
print(state["json"])
```

`regex=` 会编译成 FSM。生成时：`{` / `"name":"` / `","age":` / `}` 是模板字符直接跳；只有 `Alice`、`30` 真采样——多次 LM forward 缩成两次。

### 案例 2：多轮共享前缀（示意对比）

100 条请求共享同一段长 system prompt 时（**示意**，非某次实测秒数）：无前缀复用 ≈ 每条重算整段 KV；粗粒度 prefix cache 能省一截；RadixAttention 默认按 token 级复用，论文报告相对 vLLM 等可达数倍吞吐。判断标准仍看前缀重复度，不是绝对秒数。

### 案例 3：`fork` 告诉 runtime「这几条共享」

```python
@sgl.function
def multi_choice(s, question):
    s += "Q: " + question + "\n"
    forks = s.fork(4)                 # 4 个并行分支，前缀物理共享
    for f in forks:
        f += sgl.gen("answer", max_tokens=32)
```

`fork` 一调，runtime 就知道四条答案共享同一 `Q:` 前缀，自动走 RadixAttention，不必手工管理 cache key。

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

## 历史小故事（可跳过）

- **2023 年 12 月**：LMSYS / 学术合作团队在 vLLM 已成主流后，意识到"内存层优化做完了，语义层还没人碰"，放出 SGLang（arXiv 2312.07104）
- **2024 年中**：被 agent 与结构化任务用户广泛采用；与 outlines 等结构化生成库形成竞争
- **2024 年底**：进 NeurIPS，正式被学术认可
- **影响**：之后 vLLM 也加了 prefix caching，算是被推动的反向证明

## 学到什么

1. **同一个对象（KV cache）可从不同维度优化**：内存碎片 / 语义复用 / 批处理——每一刀都能切出数倍
2. **前端 DSL 不是花架子**：显式表达"共享前缀"，runtime 才能放心做激进优化
3. **结构化生成是杠杆**：输出里大量模板字符，跳过它们就是免费提速
4. **先问替代还是正交**：SGLang 是 vLLM 的正交补充，不是替代
5. **共享前缀离开 LLM 也成立**：多 buffer / 多查询 / CDN——有前缀重复就有这棵树的位置

## 延伸阅读

- 论文 PDF：[arXiv 2312.07104](https://arxiv.org/abs/2312.07104)
- 官方仓库：[sgl-project/sglang](https://github.com/sgl-project/sglang)
- 视频：[Lianmin Zheng — SGLang Tech Talk](https://www.youtube.com/results?search_query=sglang+lianmin+zheng)
- [[vllm]] —— 内存层基线，对照读收益最大

## 关联

- [[vllm]] —— 内存层优化的基线，SGLang 在它之上做语义层
- [[tensorrt-llm-2023]] —— NVIDIA 内核级优化，与 SGLang 调度级路线互补
- [[medusa-2024]] —— 解码层多头并行，又一个正交维度
- [[specinfer-2023]] —— 推测解码的树状版本，同样用树形结构换吞吐
- [[alpa-2022]] —— 自动并行前辈，启发了"DSL 告诉 runtime 怎么跑"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
