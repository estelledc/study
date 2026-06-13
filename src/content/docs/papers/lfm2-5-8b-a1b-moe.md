---
title: LFM2.5-8B-A1B — 38T 预训练的边缘 MoE 个人助手
来源: 'Liquid AI, "LFM2.5-8B-A1B: An Even Better On-Device Mixture of Experts", Liquid AI Blog, 2026; LFM2 Technical Report, arXiv:2511.23404'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：带专家会诊台的随身翻译

想象你随身带了一个「小型咨询中心」，墙上挂着 **32 位专科顾问** 的名牌，但规则是：**每回答一个问题，只允许 4 位顾问同时开口**。

- 中心名义上拥有 **8B 量级的知识储备**（32 位顾问各自训练过不同领域）。
- 你每次提问真正消耗的算力，却接近 **1.5B 活跃参数** 的小团队——因为路由器只会点亮 Top-4 专家。
- 新版 LFM2.5 还换了一本 **128K 页的大记事本**（上下文从 32K 扩到 128K），并且顾问在正式答复前会先写一段 **「思考过程」**（reasoning-only / Chain-of-Thought），再给出最终答案。

Liquid AI 在 2026 年 5 月发布的 **LFM2.5-8B-A1B**，名字里的 **8B** 指总参数量级，**A1B** 指每次 forward 大约 **1.5B active parameters**。它把预训练数据从上一代 LFM2-8B-A1B 的 **12T tokens** 扩到 **38T tokens**，目标不是云端巨模型，而是 **笔记本、手机、单卡 GPU 上可本地运行的 Agent 助手**——能链式调用工具、读长文档、且数据不出设备。

---

## 是什么

**LFM2.5-8B-A1B** 是 Liquid AI **LFM2.5** 家族中的 **Mixture-of-Experts（MoE）** 文本模型，面向：

- **端侧部署**：llama.cpp（GGUF）、MLX（Apple Silicon）、ONNX、vLLM、SGLang 首日支持。
- **Agent / 工具调用**：BFCL、Tau² 等 agentic 基准上可与更大 MoE 竞争。
- **长上下文**：**128K** token 窗口，适合整份 PDF、长对话、长工具轨迹。
- **推理优先输出**：post-trained 版本为 **reasoning-only**，先显式 CoT，再给最终答案。

Hugging Face 权重：

- `LiquidAI/LFM2.5-8B-A1B` — 通用对话 + 推理 + 工具
- `LiquidAI/LFM2.5-8B-A1B-Base` — 预训练基座，供微调

官方推荐采样：`temperature=0.2`，`top_k=80`，`repetition_penalty=1.05`。

---

## 为什么重要

### 1. 稀疏激活把「质量」和「延迟」拆开

Dense 8B 模型每 token 都要跑满 8B 参数。MoE 把 **存储（总参数）** 与 **计算（活跃参数）** 解耦：路由器为每个 token 选少量专家，使 **8B 级知识密度** 配上 **~1.5B 级 decode 成本**。LFM2 Technical Report 指出：LFM2-8B-A1B 在约 **1.5B 级延迟** 下可达 **3–4B dense 级质量**——LFM2.5 在此基础上叠加 38T 预训练与 RL。

### 2. 38T 预训练 + 针对性 RL，专治小模型的两大顽疾

边缘模型参数少，天然 **知识边界窄、爱胡说**。Liquid 的两条 RL 线值得记：

| 问题 | 手段 | 效果（相对 LFM2-8B-A1B） |
|------|------|---------------------------|
| **幻觉** | avg@k 奖励，鼓励「不知道就说不知道」 | AA-Omniscience **Non-Hallucination Rate** 7.46% → **63.47%** |
| **推理死循环（doom loop）** | 偏好优化 + 惩罚 "Wait…" 等重启词 | 长 CoT 轨迹更稳定 |

### 3. 128K 与 128K 词表：长文档 + 多语言端侧

- **上下文**：先 2T token midtraining 到 32K（推理/数学/工具/长文），再提高 RoPE base θ + 400B token 到 **128K**。
- **词表**：65K → **128K BPE**（原地扩展，新 embedding 用子词均值初始化），泰语 chars/token **+238%**，印地语 **+120%**，阿拉伯语 **+39%**——同样文本更短、推理更快。

### 4. 生态位：本地 Private Agent

官方 **Localcowork** 演示：单笔记本 + 67 工具 / 13 个 MCP server，无云、无 API Key。LFM2.5 在 M5 Max 上约 **253 tok/s**（<6GB），手机上约 **30 tok/s**——工具 dispatch 亚秒级，适合「问 → 提议 → 确认 → 执行」循环。

---

## 核心概念

### 1. LFM2 混合骨干（Hybrid Backbone）

LFM2 不是纯 Transformer。经 **hardware-in-the-loop 架构搜索** 得到的最小混合结构：

| 组件 | 作用 |
|------|------|
| **Gated short convolution（LIV 块）** | 局部、输入感知的短程依赖；18/24 层为 double-gated LIV |
| **GQA（Grouped-Query Attention）** | 6/24 层；KV head 共享，省 KV cache 显存 |
| **MoE SwiGLU FFN** | 32 experts，**Top-4** / token；前 2 层保持 dense 稳定训练 |

LFM2-8B-A1B 规格（LFM2.5 沿用同一骨架）：24 层，`d_model=2048`，32 query heads / 8 KV heads，MoE `FF=1792` × 32 experts。

### 2. MoE 路由与 A1B 命名

每个 token 经过 **sigmoid router + adaptive routing bias**（DeepSeek 式负载均衡），选 **4/32** 专家。总参 **8.3B**，活跃约 **1.5B**——社区简写 **8B-A1B**（Active ~1B 量级四舍五入）。

直觉：**专家 = 不同「子网络技能包」**；路由 = **按 token 动态组队**。

### 3. Reasoning-only：先想后答

LFM2.5 post-trained 版 **强制** 输出 CoT 再答。MoE 在 compute-bound 场景下，**多写几个思考 token 的边际成本很低**（仍只激活 1.5B），因此用「多想几步」换 IFEval、MATH、Agent 任务上的质量——IFEval **79.44 → 91.84**（对比 LFM2-8B-A1B）。

### 4. 训练流水线（38T 从哪来）

```text
[LFM2-8B-A1B 基座]
    → 词表扩展 65K→128K（embedding 适配 + continued pretrain）
    → 大规模 continued pretrain（累计至 ~38T tokens 规模）
    → 2T midtraining：32K 上下文（推理/数学/工具/长文档）
    → 400B midtraining：RoPE θ 调整 → 128K
    → RL：幻觉 avg@k、doom loop 偏好优化、指令/Agent 对齐
    → LFM2.5-8B-A1B
```

**38T** 是相对上一代 **12T** 的预训练规模跃迁；exact 数据 mix 未完全公开，但官方强调 **tool-use、长轨迹、多语言** 比重上升。

### 5. 与相近模型对比（官方博客摘录）

| 模型 | 总/活跃参数 | IFEval | MATH500 | BFCLv3 | Tau² Telecom |
|------|-------------|--------|---------|--------|--------------|
| **LFM2.5-8B-A1B** | 8B / 1.5B | **91.84** | **88.76** | **64.79** | **88.07** |
| Granite-4.0-H-Tiny | 7B / 1B | 82.23 | 59.20 | 56.89 | 16.67 |
| Qwen3-30B-A3B-Thinking | 30.5B / 3.3B | 90.82 | 86.48 | 73.39 | 21.93 |
| Gemma-4-26B-A4B-IT | 26B / 4B | 91.40 | 94.20 | 68.87 | 42.11 |

小激活参数量下，**指令遵循 + 电信 Agent 场景** 表现突出；数学上 Qwen3-30B-A3B 仍更强，但 LFM2.5 的 **吞吐与端侧 footprint** 是差异化卖点。

### 6. 部署格式选型

| 格式 | 场景 |
|------|------|
| 原生 HF / vLLM / SGLang | GPU 服务、微调 |
| GGUF + llama.cpp | CPU / 跨平台边缘 |
| MLX | Mac Apple Silicon |
| ONNX | 跨加速器推理 |

---

## 代码示例 1：Transformers 本地对话（官方 Quick Start）

需要 `transformers>=5.0.0`，GPU 上可开 `flash_attention_2`。

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, TextStreamer

model_id = "LiquidAI/LFM2.5-8B-A1B"

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    device_map="auto",
    dtype="bfloat16",
    # attn_implementation="flash_attention_2",  # 兼容 GPU 可取消注释
)
tokenizer = AutoTokenizer.from_pretrained(model_id)
streamer = TextStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)

messages = [
    {"role": "user", "content": "用三句话解释 Mixture-of-Experts 为什么适合端侧 Agent。"}
]

input_ids = tokenizer.apply_chat_template(
    messages,
    add_generation_prompt=True,
    return_tensors="pt",
    tokenize=True,
).to(model.device)

output = model.generate(
    input_ids,
    do_sample=True,
    temperature=0.2,
    top_k=80,
    repetition_penalty=1.05,
    max_new_tokens=2048,
    streamer=streamer,
)
```

**观察要点**：输出里通常会先出现 **思考/推理段落**，再给出精简结论——这是 reasoning-only 训练的结果，解析下游答案时可能需要按模板切分 CoT 与 final answer。

---

## 代码示例 2：结构化工具调用（Agent 最小闭环）

LFM2.5 强调 **native tool calling**。下面用 OpenAI 兼容的 `tools` 字段演示「查天气 → 模型决定是否调用函数」——实际 schema 以 tokenizer chat template 为准；生产环境建议直接用 Liquid 文档中的 tool 模板或 vLLM tool parser。

```python
import json
from transformers import AutoModelForCausalLM, AutoTokenizer

model_id = "LiquidAI/LFM2.5-8B-A1B"
model = AutoModelForCausalLM.from_pretrained(model_id, device_map="auto", dtype="bfloat16")
tokenizer = AutoTokenizer.from_pretrained(model_id)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查询指定城市的当前天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名，如 Shanghai"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["city"],
            },
        },
    }
]

def fake_get_weather(city: str, unit: str = "celsius") -> dict:
    return {"city": city, "temp": 26, "unit": unit, "condition": "cloudy"}

messages = [
    {"role": "user", "content": "上海现在天气怎么样？如果需要工具就调用。"},
]

# 多数 Liquid chat template 支持 tools= 参数（以当前 tokenizer 文档为准）
prompt_ids = tokenizer.apply_chat_template(
    messages,
    tools=tools,
    add_generation_prompt=True,
    return_tensors="pt",
    tokenize=True,
).to(model.device)

generated = model.generate(
    prompt_ids,
    max_new_tokens=512,
    temperature=0.2,
    top_k=80,
    repetition_penalty=1.05,
)
text = tokenizer.decode(generated[0], skip_special_tokens=True)
print(text)

# 若模型输出 function call，解析后执行并回灌（第二轮）
# observation = fake_get_weather("Shanghai")
# messages += [{"role": "assistant", "content": text},
#              {"role": "tool", "name": "get_weather", "content": json.dumps(observation)}]
# ... 再次 apply_chat_template + generate
```

**Agent 设计提示**：

1. **128K 上下文** 可塞入较长 tool 文档 + 多轮轨迹，但仍应做 observation 摘要，避免噪音淹没路由。
2. 小模型 **知识边界** 有限——对 factual QA 应配合检索或允许模型 **拒答**（RL 已强化 abstention）。
3. 链式工具调用时监控 **doom loop**；若出现反复 "Wait…"，降低 `max_new_tokens` 或加 stop sequences。

---

## 代码示例 3：llama.cpp 量化推理（边缘 CPU）

适合无独显笔记本；需先下载 `LFM2.5-8B-A1B-GGUF`。

```bash
# 示例：Q4_K_M 量化，交互式 chat
./llama-cli \
  -m LFM2.5-8B-A1B-Q4_K_M.gguf \
  -c 8192 \
  --temp 0.2 \
  --top-k 80 \
  --repeat-penalty 1.05 \
  -p "你好，请用一句话介绍 LFM2.5 MoE。"
```

`-c` 为上下文槽位；要跑满 128K 需更大 RAM 并提高 `-c`（实际受机器内存限制）。官方称 entry-level laptop 仍可舒适运行。

---

## 零基础心智模型：读名字、读基准、读部署

1. **LFM2.5-8B-A1B** = Liquid 第 2.5 代、8B 总参数、约 1.5B 激活的 MoE。
2. **38T tokens** = 相对 12T 的预训练扩容，是能力跃迁的主因之一（外加 RL 与 128K midtraining）。
3. **128K + tool calling + reasoning** = 面向 **本地 Agent**，不是单纯聊天 Bot。
4. **选模型**：要微调用 Base；要开箱 Agent 用 post-trained；要 Mac 本地优先试 MLX/GGUF。

---

## 局限与使用注意

| 风险 | 说明 |
|------|------|
| **知识上限** | 8B 级 MoE 仍会在冷门事实上幻觉；应依赖 RAG 或接受拒答 |
| **CoT 开销** | reasoning-only 增加输出 token 数；虽单 token 便宜，但总延迟仍随 CoT 长度上升 |
| **MoE 实现** | 需框架支持稀疏路由；错误实现可能退化为慢速 dense |
| **多语言** | 词表改进不等于文化/事实对齐；低资源语言仍需谨慎评测 |
| **训练成本** | 38T 预训练碳足迹大；端侧收益是推理阶段私有化，不是训练环保 |

---

## 与相关工作的关系

- **LFM2 Technical Report（arXiv:2511.23404）**：给出 hybrid backbone、MoE 32×Top-4、硬件协同搜索的完整规格——读 LFM2.5 前先读 LFM2 一节即可建立架构直觉。
- **DeepSeek-V2/V3 式 MoE 路由**：负载均衡 bias、sigmoid gate 属同一族稀疏 FFN 设计。
- **Qwen3 / Gemma 4 小 MoE**：同赛道对比对象；LFM2.5 差异化在 **Liquid 卷积混合层 + 端侧吞吐优化 + LEAP 移动端栈**。

---

## 进一步阅读

- [Liquid AI 发布博客](https://www.liquid.ai/blog/lfm2-5-8b-a1b)
- [官方模型文档](https://docs.liquid.ai/lfm/models/lfm25-8b-a1b)
- [Hugging Face: LiquidAI/LFM2.5-8B-A1B](https://huggingface.co/LiquidAI/LFM2.5-8B-A1B)
- [LFM2 Technical Report (arXiv:2511.23404)](https://arxiv.org/html/2511.23404)

---

## 小结

**LFM2.5-8B-A1B** 把 **MoE 稀疏计算**、**38T 规模预训练**、**128K 长上下文** 和 **面向 Agent 的 RL** 打包成可本地部署的 open-weight 模型：名义 8B 知识、约 1.5B 激活算力、强调工具链式调用与低幻觉拒答。对零基础学习者，记住一句话即可：**它是为「躺在你笔记本里的私人 Agent」设计的 MoE，而不是为数据中心峰值榜设计的巨模型。**
