---
title: LLaMA — Meta 开源大语言模型
来源: 'Touvron et al., "LLaMA: Open and Efficient Foundation Language Models", 2023 / LLaMA 2 / LLaMA 3'
日期: 2026-05-29
分类: NLP / LLM
难度: 中级
---

## 是什么

LLaMA（Large Language Model Meta AI）是 Meta 在 2023 年 2 月开源的一个**基础大语言模型系列**——论文里是 7B / 13B / 33B / 65B 四档（社区常把 33B 叫成 30B）。

日常类比：以前 [[gpt-3]] 像米其林大餐厅——封闭、贵、只允许 API 点餐；LLaMA 像家常菜谱——Meta 把"怎么做大模型"完整公开，自己买菜（数据）、自己开火（GPU）就能做。

LLaMA 最反直觉的一点：**用更多 token 训练更小的模型**。13B 的 LLaMA 在多数测试上能打平甚至超过 175B 的 [[gpt-3]]，参数大约只有 1/13。

## 为什么重要

不理解 LLaMA，下面这些事都没法解释：

- 为什么 2024-2026 年所有"开源大模型"几乎都长得一样：[[mistral]] / Qwen / Yi / [[deepseek-r1]] 全都是 LLaMA 架构的变体
- 为什么 `ollama run llama3` 一行命令就能在自己的 Mac 上跑 8B 模型——本地部署 LLM 这件事是从 LLaMA 才真正可行的
- 为什么 ChatGPT 出来不到一年，开源圈就追了上来——Meta 用一份 27 页的 PDF + 一套权重把"怎么做"公开了
- 为什么 [[chinchilla]] 给的"D=20×N"经验法则被刻意打破——LLaMA 故意训练得"过头"，是为了让推理更便宜

## 核心要点

LLaMA 的核心可以拆成 **三件事**：

1. **故意"训练过头"**：[[chinchilla]] 说 7B 模型最优大约训 140B token，LLaMA 7B/13B 训了约 1T（多 ~7 倍），65B 训到约 1.4T。代价是训练贵，回报是推理便宜——部署后推理账几个月就回本。

2. **三个架构小改动**：
   - **RMSNorm**——比 LayerNorm 简化，少做一步"减均值"，每层省 ~10% 算力
   - **SwiGLU**——比 ReLU 多一条门控通路，质量更高；隐藏层宽度收缩到 2/3 来抵消多出的参数
   - **RoPE 旋转位置编码**——把"第几个词"用复平面旋转编码，让模型天然懂"相对位置"

3. **三代演进**：
   - **LLaMA 1**（2023-02）：7B–65B，英文为主，2K 上下文，研究许可
   - **LLaMA 2**（2023-07）：商用许可 + Chat 版本（RLHF 微调）+ GQA 节省推理显存
   - **LLaMA 3**（2024-04）：8B/70B，约 15T token，**8K 上下文**，128K 词表；**3.1**（2024-07）才把上下文拉到 128K，并补上 405B 顶配

## 实践案例

### 案例 1：本地跑通一个可聊天的 LLaMA

```bash
# 1) 安装 Ollama（macOS / Linux 官方安装脚本；Windows 用官网安装包）
curl -fsSL https://ollama.com/install.sh | sh

# 2) 拉一个量化后的 LLaMA 3 8B 对话权重（约 4–5GB）
ollama pull llama3

# 3) 开聊天；默认优先用本机 GPU，没有就走 CPU（会慢很多）
ollama run llama3
```

逐部分解释：

- `pull` 下载的是社区量化权重，不是 Meta 原始 BF16 全精度包，所以一台 16GB 内存的笔记本也能试。
- `run` 会加载权重并进入对话循环；第一次回答前要等模型进内存。
- 若只要 API：另开终端跑 `ollama serve`，再对 `localhost:11434` 发请求。

放在 2022 年这几乎不可想象——那时 GPT-3 只能 API 调用。LLaMA 权重可下载之后，本地跑 LLM 才变成程序员日常。

### 案例 2：LLaMA 2-Chat 怎么从"基础模型"变成"会聊天"

LLaMA 1 / 2 Base 模型只会"接龙"——给它"今天天气"，它输出"不错，适合"。它不知道你在跟它对话。

LLaMA 2-Chat 加了两步：

1. **SFT（监督微调）**：人工写几万条"问题-回答"示例，让模型学"看到问题该怎么答"
2. **RLHF / DPO**：人工对比"答案 A 好还是答案 B 好"，让模型学"什么样的回答更受欢迎"

这套流程后来被 Mistral、Qwen、DeepSeek 全部沿用——LLaMA 2 论文是开源 chat 模型的训练操作手册。

### 案例 3：和 [[gpt-3]] 的代际对比

| 维度 | GPT-3 (2020) | LLaMA 1 (2023) | LLaMA 3 / 3.1 (2024) |
|---|---|---|---|
| 最大参数 | 175B | 65B | 70B → 3.1 补 405B |
| 训练 token | ~300B | 1T（7B/13B）/ 1.4T（65B） | ~15T |
| 公开权重 | 否 | 研究许可 | 商用许可 |
| 上下文长度 | 2K | 2K | 3：8K；3.1：128K |
| 中文能力 | 弱 | 弱 | 中等 |

GPT-3 当年是"闭源 SOTA"；到 LLaMA 3.1 405B，开源侧已经能在不少公开榜上接近当时的 GPT-4 档。三年时间，开源追上闭源。

## 踩过的坑

1. **LLaMA 1 的 2K 上下文不够用**：现代场景动辄要塞几十页文档，LLaMA 1 的 2K 立刻爆炸。LLaMA 3 原版仍是 8K；到 **3.1** 才把 RoPE base 从 10000 调到 500000+，把上下文外推到 128K——这是后来"长上下文"工程的标配技巧。

2. **权重许可的灰色地带**：LLaMA 1 是"研究许可"——只允许学术用，但 2023-03 权重泄露到 4chan，整个 Stanford Alpaca / Vicuna 生态都建在"灰色权重"上。LLaMA 2 转商用许可才把这个尴尬解决。

3. **"开源"程度有限**：Meta 公开了**权重 + 推理代码**，但训练代码、数据 pipeline、训练日志全部没公开。真正完全开源的是 2024 年 AI2 出的 OLMo（连 checkpoint 都公开）。LLaMA 的"open"更接近"权重可下载"。

4. **小模型也跟着 over-train 不是免费午餐**：TinyLlama 1.1B 训 3T token（D=2700×N）质量提升非常有限——over-train 收益在某个点就饱和。LLaMA 3 的 15T 训练已经接近这个边界。

## 适用 vs 不适用场景

**适用**：

- 想本地 / 私有部署 LLM——LLaMA 系是 Hugging Face、vLLM、llama.cpp 第一支持的架构
- 想做 fine-tune（领域适配 / RLHF / LoRA）——开源生态 80% 工具默认按 LLaMA 风格写
- 学开源 LLM 架构原理——LLaMA 1 的 model.py 只有 ~500 行，是教学最佳样本
- 商业产品想用开源底座——LLaMA 2 起的商用许可允许（注意 7 亿月活以上要单独申请）

**不适用**：

- 极致长上下文（100K+ 真实使用）——LLaMA 的 attention 计算是平方级，应该看 Mamba / RWKV 这类线性序列模型
- 极致部署便宜的边缘场景——LLaMA 70B 单卡塞不下，应该看 [[mixture-of-experts]] 路线（Mixtral 8×7B 总参 47B 但每 token 只激活 13B）
- 中文为主的产品——LLaMA 3 中文够用但 Qwen / DeepSeek 在中文 benchmark 上更强
- 想完全可复现的科学研究——LLaMA 训练代码不公开，应该用 OLMo / Pythia

## 历史小故事（可跳过）

- **2022 年中**：Meta 出 OPT-175B，对标 GPT-3 但质量不如，团队反思——是不是不该硬抄 GPT-3 而要换零件。
- **2022-12**：DeepMind 发表 [[chinchilla]]，给出"D=20×N"。LLaMA 团队读完想"如果故意 D=140×N 会怎样"。
- **2023-02-27**：Touvron 等 14 人在 arXiv 放出 LLaMA 1 论文，没投会议，没经过同行评审，纯 tech report。
- **2023-03 第三周**：有人在 4chan 把 LLaMA 1 的全部权重以种子形式放出。第二天 Stanford Alpaca 出来——用 LLaMA 7B + 5.2 万条 GPT-3.5 生成的指令训练。
- **2023-07**：LLaMA 2 全面开源（含 Chat 版本 + 商用许可）。Hugging Face Hub 半年后 50%+ 的 base model 都是 LLaMA 衍生。
- **2024-04**：LLaMA 3 发布，8B / 70B，默认 8K 上下文。
- **2024-07**：LLaMA 3.1 把上下文拉到 128K，并放出 405B，宣称"开源接近 GPT-4"。
- **2024-12**：LLaMA 3.3 70B 发布，质量再次接近 GPT-4 档，但只要 70B 参数。

LLaMA 论文 14 个作者里有 4-5 人后来离职创办了 Mistral——所以 Mistral 7B 的架构和 LLaMA 1 7B 几乎一模一样，是同一批人在不同公司做的第二次。

## 学到什么

1. **训练贵 vs 推理贵的取舍**——亿级用户产品里推理成本永远超过训练成本，选模型时"小而 over-train"几乎总是对的
2. **架构小改动的复利效应**——RMSNorm / SwiGLU / RoPE 单看每个都只改 5-10%，组合起来变成事实标准
3. **开源不是非黑即白**——"权重开放"、"训练代码开放"、"数据开放"是三件事，[[chinchilla]]/PaLM 全闭源，LLaMA 开放权重，OLMo 全开放
4. **生态先于技术**——LLaMA 2 的商用许可比它的架构创新更有影响力；许可政策决定生态能否爆发

## 延伸阅读

- LLaMA 1 论文：[arXiv 2302.13971](https://arxiv.org/abs/2302.13971)（27 页，工业 tech report 风格）
- LLaMA 2 论文：[arXiv 2307.09288](https://arxiv.org/abs/2307.09288)（含 Chat / RLHF 流程）
- LLaMA 3 论文：[The Llama 3 Herd of Models](https://arxiv.org/abs/2407.21783)（92 页，把工程细节摊开）
- 实操教程：[Ollama 官网](https://ollama.com/)（一行命令跑各代 LLaMA）

## 关联

- [[gpt-3]] —— LLaMA 想超越的对手；架构血缘是 GPT-3 的 decoder-only transformer
- [[chinchilla]] —— 给了"D=20N"经验法则，LLaMA 故意打破它来换推理便宜
- [[mistral]] —— LLaMA 1 核心作者离职后创办 Mistral，架构几乎逐字复刻
- [[mixture-of-experts]] —— LLaMA 全稠密路线的反对派；Mixtral 用稀疏激活做 70B 质量 + 13B 推理成本
- [[deepseek-r1]] —— 中国系最强 LLaMA 衍生，加了 MLA / MoE 等进一步优化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bert]] —— BERT — 双向 Transformer 预训练
- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[chatbot-arena-2024]] —— Chatbot Arena — 让真人盲投，给 LLM 排出公允座次
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[codellama-2023]] —— Code Llama — 开源代码模型的完整训练配方
- [[deepseek-r1]] —— DeepSeek R1 — 强化学习推理模型
- [[dpo]] —— DPO — Direct Preference Optimization
- [[flan-2021]] —— FLAN — 用自然语言指令教模型学会"听话"
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[mixture-of-experts]] —— Mixture of Experts (MoE)
- [[roberta-2019]] —— RoBERTa — 把 BERT 重训一遍就能拿 SOTA

