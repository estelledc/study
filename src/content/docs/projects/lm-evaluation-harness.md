---
title: 'lm-evaluation-harness — LLM 基准评测底座'
来源: 'https://github.com/EleutherAI/lm-evaluation-harness'
日期: '2026-05-31'
子分类: 数据科学与 AI
分类: 机器学习
难度: '中级'
provenance: pipeline-v3
---

## 是什么

lm-evaluation-harness（下面简称 **harness**）是 EleutherAI 出的一套**统一的 LLM 跑分框架**：你给它一个模型 + 一份任务清单，它把题目按标准格式喂给模型、收答案、算分。日常类比：像**全国统一高考**——不管你是哪个省的考生，卷子统一、阅卷统一，分数才能横向比。

最常见的一行命令：

```bash
lm_eval --model hf \
  --model_args pretrained=meta-llama/Llama-2-7b \
  --tasks mmlu,hellaswag,arc_challenge \
  --num_fewshot 5 \
  --batch_size 8
```

它会自动下载 MMLU / HellaSwag / ARC 三个基准的题目、给模型做 5-shot（5 个示例）评测，然后输出一张分数表。

## 为什么重要

不理解 harness，下面这些事都没法解释：

- **HuggingFace OpenLLM Leaderboard** 的分数从哪来——后端就是 harness，谁也别想偷偷改算法
- 为什么论文里报 MMLU 时常常带一句 `we use lm-evaluation-harness vX.Y.Z`——不带就没法复现
- 为什么同一个模型，A 团队报 65 分、B 团队报 71 分——大概率是 prompt 模板版本不同 / few-shot 数不同
- 为什么"公开基准跑分高"和"实际任务能用"中间隔了一条沟——harness 解决前者，不保证后者

它存在的意义只有一句话：**让一组模型 × 一组任务，得到可复现、可比较、可争论的数字**。

## 核心要点

harness 的整套设计可以拆成 **三层**：

1. **模型适配层（LM 接口）**：把 HuggingFace / vLLM / OpenAI API / Anthropic API 等不同后端，都包成同一个 `LM` 抽象类，对外只暴露三种请求类型——`loglikelihood`（给定上下文，打分一段续写）、`loglikelihood_rolling`（算困惑度）、`generate_until`（自由生成到某个停止词）。

2. **任务定义层（YAML + Jinja2）**：v0.4.0 起每个任务是一个 YAML 文件，写明**从哪个数据集加载题目、prompt 模板长什么样、用哪种请求类型、怎么算分**。模板用 Jinja2，可以塞 few-shot 示例。

3. **执行调度层**：把所有题目展开成请求，分批喂给模型，结果回来后按任务定义的 metric 聚合（accuracy / acc_norm / f1 / bleu / pass@k 等）。

这三层解耦的关键好处：**加一个新基准只改 YAML，不动代码**；**换一个新后端只写一个 LM 子类**。

## 实践案例

### 案例 1：MMLU 怎么评，为什么不让模型直接生成 "A"

MMLU 是选择题，4 选 1。直觉做法：让模型生成下一个 token，看是不是 "A"。harness **不这么做**，因为：

- 模型可能输出 "答案是 A"、" A"（带空格）、"(A)"——格式漂移就掉分
- 不同 tokenizer 对 "A" 的切法不同，比较不公平

harness 用 **loglikelihood 法**：把四个选项的完整答案分别拼到 prompt 后面，算每个续写的 log 概率，取最大那个：

```
prompt:  "Q: 牛顿第二定律是？\nA. F=ma\nB. E=mc²\nC. PV=nRT\nD. Δx≥ℏ/2\n答案:"
候选 1:  " A"  → logp = -2.1
候选 2:  " B"  → logp = -8.7
候选 3:  " C"  → logp = -7.4
候选 4:  " D"  → logp = -9.0
最大 → 选 A ✓
```

这种做法**不依赖模型会不会输出对的格式**，纯看四个候选的相对概率，公平且稳定。

延伸思考：这一招也有边界——它假设"模型对正确答案的内部分布偏好"约等于"模型在生成时会选正确答案"。对小模型这两者高度相关，对很会"装腔作势"的对齐模型则可能脱钩，所以有了 `mmlu_generative` 变体作为对照。

### 案例 2：用 vLLM 后端跑，速度差一个量级

```bash
lm_eval --model vllm \
  --model_args pretrained=meta-llama/Llama-2-7b,tensor_parallel_size=2 \
  --tasks mmlu \
  --batch_size auto
```

把 `--model hf` 换成 `--model vllm`，**同一份评测脚本**直接享受 vLLM 的 PagedAttention + 连续批处理。在 7B 模型上 MMLU 评测从 1 小时降到 5 分钟级别——这就是模型适配层解耦的好处。

### 案例 3：自定义任务，YAML 写一个就够

假设你要加一个中文成语填空基准。新建 `chengyu.yaml`：

```yaml
task: chengyu_blank
dataset_path: my_org/chengyu
output_type: multiple_choice
doc_to_text: "{{question}}\n答案:"
doc_to_choice: "{{choices}}"
doc_to_target: "{{label}}"
metric_list:
  - metric: acc
```

放到 `lm_eval/tasks/` 下，`--tasks chengyu_blank` 就能跑。**不写一行 Python**。

## 踩过的坑

1. **task_version 必须记下来**：v0.3 和 v0.4 对 MMLU 的 prompt 模板有微调，分数能差 2-3 个点。论文里只写"我用 harness"不够，要写**具体 commit hash**。

2. **acc 和 acc_norm 选哪个**：`acc` 是原始正确率，`acc_norm` 按答案长度归一化。HellaSwag 用 acc_norm 是惯例，但有研究指出 norm 对长答案有系统性偏好。**报数时两个都给，别藏一个**。

3. **数据污染**：MMLU / HellaSwag 的题目在 Common Crawl 里到处都是，模型可能在预训练时见过原题。**跑高分不代表真本事**——这是整个开放基准生态的根本问题，harness 解决不了。

4. **generate_until 对 stop token 敏感**：开放生成型基准（GSM8K / BBH 等）需要配 stop token 切断生成。配错（比如忘了加 `\n\n`）模型会一直生成，最后 metric 函数解析失败 → 0 分。新人最容易在这里翻车。

5. **批量大小影响显存而非分数**：`--batch_size auto` 会自动找最大可行 batch，但有些后端对 padding 敏感，长短题混在一起会浪费算力。固定模型先跑一次 profile 再决定。

6. **缓存目录会爆盘**：harness 默认把每个请求的 logprob 落到本地缓存（重跑时秒出结果）。跑了几十个模型后能轻松涨到几百 GB。`--cache_requests delete` 可以清，长期评测要主动管理。

## 适用 vs 不适用场景

**适用**：

- 训完一个开源模型，想用业界公认的数字进通报 / 论文 / leaderboard
- 横向对比两个模型，希望评测过程**别人能 100% 复现**
- 给新基准找一个统一的执行框架，不再为每个数据集写跑分脚本
- 配合 vLLM / DeepSpeed 在多卡上批量评测一长串模型

**不适用**：

- 评测**对话质量 / 创意写作 / 垂直业务**——这些要 LLM-as-judge 或人工打分，harness 不擅长
- 评测**多轮工具调用 / agent 行为**——harness 主要面向单轮问答，多轮要 SWE-bench / AgentBench 等专门工具
- 中文 / 小语种垂直基准覆盖一般，要自己加 YAML 或转用 OpenCompass

## 学到什么

1. **跑分框架最大的价值不是算分，是定义"什么叫公平评测"**——prompt 模板、few-shot 数、metric 选法都是争议点，harness 把它们写进 YAML 后才能"对上账"。

2. **loglikelihood 评选择题** 这一招值得学：很多场景下"看模型输出格式"会引入大量噪音，"看候选概率"反而更干净。

3. **解耦三层（模型 / 任务 / 调度）** 是这类工具的通用架构——后来的 OpenCompass / lighteval 都是这个套路。

4. **公开基准的数字只是一个通信协议**，不是模型质量的全部真相。harness 解决"这个数字怎么算公平"，不解决"这个数字代表什么"。

## 延伸阅读

- 项目仓库：[EleutherAI/lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)
- HuggingFace Open LLM Leaderboard 用它做后端：[HF OpenLLM v2](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)
- 任务清单：仓库里 `lm_eval/tasks/` 目录下几百个 YAML 文件，每个都是一篇可读的"评测说明书"
- 兄弟项目 OpenCompass：[open-compass/opencompass](https://github.com/open-compass/opencompass)（中文场景更全）

## 关联

- [[vllm]] —— 推理后端，harness 通过 `--model vllm` 直接调用，跑分提速 10-20 倍
- [[accelerate]] —— 多卡评测时常和 harness 配合，让 7B+ 模型单机多卡跑 MMLU
- [[ann-benchmarks]] —— 同样思路的"统一基准框架"，但面向向量检索而非 LLM
- [[litellm-proxy]] —— 想评测闭源 API 模型时，可以让 harness 通过 LiteLLM 代理统一接入
