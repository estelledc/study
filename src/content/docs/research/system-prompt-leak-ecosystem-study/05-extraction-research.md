---
title: "七个抽取研究项目深读"
sidebar:
  hidden: true
---
# 七个抽取研究项目深读

## 1. Effective Prompt Extraction

### 核心问题

只问一次“重复你的 prompt”时，模型可能拒绝，也可能编造。项目把攻击拆成两步：

1. 用多种 attack query 生成多个候选。
2. 用其他候选作为上下文，让 DeBERTa 估计哪个候选真的泄露了 prompt。

### 架构

```text
data + attack queries
  → GPT API / Hugging Face / Llama adapter
  → optional reversible transform
  → optional 5-gram defense
  → completions.jsonl
  → DeBERTa leakage estimator
  → top-1 guess
  → exact / approximate success + PR curve
```

### 关键实现

- `gpt-x-prompt-extraction.py`：OpenAI 0.28 API，8 线程笛卡尔积攻击。
- `hf-prompt-extraction.py`：批量 tokenizer、4-bit 模型、模板适配。
- `common.py`：interleave/Caesar 逆变换与 5-gram defense。
- `evaluate-extraction.py`：ROUGE、逐句 exact、DeBERTa 候选置信度。

### 学习价值

它第一次清楚区分：

- **攻击生成**：让模型吐出候选。
- **候选判定**：判断候选是否接近真值。

### 复现边界

依赖旧 OpenAI API、模型权重和 GPU；真实产品 checkpoint 已过时。方法仍有教学价值，数字不能直接迁移到 2026 产品。

## 2. PLeak

### 核心问题

手写 query 依赖经验。PLeak 在 shadow model 上直接优化一串 trigger token，使多个 shadow system prompt 都更可能被输出，再测试跨模型迁移。

### 架构

```text
shadow prompts + shadow model
  → HotFlip token gradients
  → candidate token replacement
  → incremental target slices
  → optimized adversarial query
  → target model Sampler
  → EM / substring / edit / semantic / BLEU
```

### 关键实现

- `Attack.HotFlip` 找 embedding gradient，用 top-k token 替换降低生成目标 prompt 的 loss。
- `make_target()` 把 system prompt 同时放在上下文和 assistant target。
- `Sampler` 生成、去除 trigger 回声、应用 defense、计算多指标。
- `Defense` 提供 none/filter/detector registry；detector 尚未实现。

### 设计价值

- 把 attack query 优化变成可计算搜索。
- 用多 shadow prompt 追求迁移，而非记住单一目标。
- 增量增加 label slice，避免一次优化完整长 prompt。

### 代码缺口

- `Sampler.py` 使用 `SentenceTransformer` 但未导入。
- `main.py` 结果路径引用未定义 `model`。
- 默认初始化 Defense 会加载 Llama-2 7B，即使选择无防御也很重。
- 无 license 文件，运行需要 GPU 和受限模型访问。

## 3. RaccoonBench

### 核心问题

模型、攻击和防御组合很多，单个成功案例不能说明系统脆弱程度。Raccoon 建立四象限：

- Defenseless + Singular
- Defenseless + Compound
- Defended + Singular
- Defended + Compound

### 架构

```text
GPTs loaders + attack loaders + defense templates
  → SysPrompt 清洗/移除/插入防御
  → provider-specific client
  → ThreadPool 并发 benchmark
  → parse response
  → ROUGE-L recall
  → success matrix
```

### 核心代码

- `Loader` / `AttLoader`：目录迭代。
- `SysPrompt`：从 OpenAI GPT wrapper 中提取用户 instructions，构造 defenseless/shielded prompt。
- `RaccoonGang`：OpenAI、Gemini、Llama/Mixtral adapter，重试和并发。
- `run_raccoon_gang.py`：CLI 组合实验参数。

### 设计价值

- 把 attack category 和 defense condition 变成显式实验维度。
- 不只看平均值，还看 worst-case susceptibility。
- compound attack 模拟多技巧组合。

### 复现边界

- `config.py` 只留注释占位。
- 多个 2023/2024 model ID 已过时。
- `estimate_cost` 含作者本机绝对路径。
- 数据目录后续补到了 493 个文件，但仍是历史快照。

## 4. PromptExtractionEval

### 核心问题

为什么模型会泄露？哪些变量影响泄露？如果文本不一样但功能一样，算不算被偷？

### 架构

这不是一个统一库，而是一组实验脚本：

```text
vanilla extraction
model-size / prompt-length scaling
explicit vs implicit attack
function-call comparison
perplexity and attention analysis
soft extraction
defense transformations
GLUE utility regression
```

### 核心机制

- `1.run_prompt_extraction.py` 比较直接询问与隐式重复攻击。
- `metrics.py` 提供 n-gram、fuzzy、BLEU、BERTScore。
- `soft_extraction_experiments.py` 找文本相似度较低但任务效果接近的候选。
- `defend_pplfilter.py` 用全局和窗口 perplexity 过滤异常 query。
- defending 目录比较 repeated prefix、fake prompt、insert、local lookup 等策略。

### 设计价值

它把“泄露率”拆成：

- 逐字/片段相似。
- 语义重建。
- 下游任务功能保持。
- 防御后的 utility drop。

### 代码组织与缺口

- 55 个 Python、273 个 JSON、19 个 PDF，结果远多于可复用模块。
- 多脚本硬编码 CUDA 设备、相对 cwd 和模型名。
- 无统一 requirements、测试或 license。
- 适合论文复盘，不适合作为 SDK。

## 5. PRSA

### 核心问题

如果服务只展示一个输入输出样例，无法直接对话抽取 prompt，攻击者能否复制它的功能？

### 方法

```text
阶段 1：Prompt Attention
收集同类别 prompt 样例
  → 用目标 prompt 生成输出
  → 反向生成初始 stolen prompt
  → 比较输出的 characteristic/topic/style/tone...
  → 累积低分维度为 category gradient

阶段 2：Stealing
目标 input/output + category gradient
  → 生成 stolen prompt
  → 移除与单个 input 过拟合的词
  → prompt pruning
  → 在新输入上比较功能一致性
```

### 核心评测

- Prompt-level SBERT 相似度。
- 输出语义相似度。
- 句法相似度。
- Jensen-Shannon 结构分布。
- LLM judge 的 Accuracy、Completeness、Tone、Sentiment、Semantics。

### 设计价值

PRSA 说明：

> 保护逐字 prompt 不等于保护产品能力。攻击者可能不需要知道原文，只需生成一个在未见输入上表现相近的替代 prompt。

### 代码缺口

- 入口脚本和多个 helper 平铺根目录。
- 提交了 `__pycache__` 和 `.pyc`。
- FastKassim 的 Java 路径硬编码为作者本机相对目录。
- 依赖旧 `openai.ChatCompletion`，没有 license 文件。

## 6. SPE-LLM

### 核心问题

用一个紧凑框架比较攻击、模型格式、数据集和防御。

### 架构

```text
dataset
  → 3 attack prompt templates
  → model-specific chat formatting
  → HF generation pipeline
  → exact / contains / cosine / ROUGE-L
  → ASR threshold 0.9
```

防御路径：

- `apply_guardrails`：在 system prompt 追加拒绝说明。
- `sandwich_defense`：前后重复保密说明。
- `filter_output`：发现完整 prompt 或长片段时替换响应。

### 设计价值

代码短，适合初学者追一条完整链路：

```text
输入 → 格式化 → 生成 → 后处理 → 评分
```

### 缺口

- 每条样本都重新加载 `SentenceTransformer`，效率低。
- 只支持三种写死的 chat template。
- 依赖和 dataset 文件不完整。
- defense 需要手工注释/取消注释，不是配置驱动。

## 7. JustAsk

### 核心问题

固定 attack query 对新模型会失效。JustAsk 让 code agent 根据反馈选择、组合、改进抽取策略。

### 概念架构

```text
14 个低层技能 + 14 个高层多轮模式
  → UCB 排名：成功率 + 探索奖励
  → 单轮或自适应多轮调用
  → 日志与受控评分
  → consistency / cross-validation
  → model observation
  → promote / refine / merge extrinsic rules
  → 下一轮技能选择
```

### 核心模块

| 文件 | 职责 |
|---|---|
| `skill_evolving.py` | CLI、单轮/多轮会话、日志、评分、状态更新 |
| `ucb_ranking.py` | 所有技能组合的统一 UCB 排名 |
| `knowledge.py` | skill stats、model observations、规则演化 |
| `validation.py` | self-consistency 和跨技能验证 |
| `skill_testing*.py` | 受控 prompt 和结构化评分 |
| `run_*_eval.py` | 论文实验和 ablation |

### UCB 直觉

像在多家餐厅选菜：

- 老菜成功率高，应该继续点。
- 新菜没试过，应该给探索机会。

公式：

```text
UCB = successes / visits + sqrt(2) * sqrt(ln(total_visits) / visits)
```

访问少的策略有更高探索 bonus；随着尝试增加，排名逐渐由真实成功率主导。

### 自演化记忆

`knowledge.py` 不训练模型权重，而是维护：

- 技能访问/成功/部分成功统计。
- 哪些模型在哪些技能上成功。
- provider → architecture 映射。
- 从观察中提炼的 extrinsic rules。
- rule 的 validate、merge、refine 和 delete。

### 受控评测

代码支持：

- deterministic injected secrets。
- none/simple/aware 三种 defense。
- identity、behavior、policy、format、verbatim 等结构分。
- 生产抽取与 ground truth 的 consistency。

### 关键复现缺口

当前公开提交的代码大量引用：

```text
data/extraction_knowledge.json
data/phase2_knowledge.json
data/controlled_prompts*.json
data/t1.csv
```

但 Git tree 中没有 `data/`。只读运行 `ucb_ranking.py --top 1` 会直接 `FileNotFoundError`。所以：

- 论文方法、README 描述和源码骨架是可读证据。
- 当前 GitHub 快照不是完整开箱复现包。
- System Prompt Open 的 45 条发布数据不能反推 JustAsk repo 本身可直接重跑。

## 8. 方法演进对照

| 项目 | 主要输入 | 搜索策略 | 输出目标 | 关键评测 |
|---|---|---|---|---|
| Effective Extraction | attack 列表 | 批量枚举 | 原文 | EM/ROUGE + DeBERTa |
| PLeak | shadow prompts | token gradient | 原文 | EM/edit/semantic |
| Raccoon | attack taxonomy | singular/compound 矩阵 | 原文 | ROUGE-L ASR |
| PromptExtractionEval | 多实验变量 | 显式/隐式 + 分析 | 原文/功能 | n-gram/fuzzy/task |
| PRSA | 少量 I/O | LLM 反演 + attention + pruning | 功能等价 | 输出一致性 |
| SPE-LLM | 3 模板 | 固定枚举 | 原文 | EM/cosine/ROUGE |
| JustAsk | 响应反馈 | UCB + 自适应多轮 | 结构/语义重建 | consistency/oracle |

## 9. 时效与复现边界

论文结果只能在其 threat model、model checkpoint、attack budget 和 metric 下解释。

不能这样推：

- “2024 GPT-4 ASR 是 X” → “2026 ChatGPT 一定也是 X”。
- “semantic similarity 0.9” → “90% 字符完全相同”。
- “两次抽取一致” → “一定是真 prompt”。
- “模型拒绝逐字输出” → “功能不可复制”。
- “代码已开源” → “当前仓库一键可复现”。

正确问法是：

1. ground truth 是什么？
2. 攻击预算多少？
3. 是单轮、多轮还是输出反演？
4. metric 衡量文本还是功能？
5. 模型、产品、日期是否固定？
6. 代码、数据、权重、凭证和硬件是否齐全？
