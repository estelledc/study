---
title: 'train-llm-from-scratch — 从零手写 Transformer 大模型'
来源: 'https://github.com/FareedKhan-dev/train-llm-from-scratch'
日期: '2026-06-13'
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 是什么

这个仓库用 **纯 PyTorch**（零 `transformers`、零 `peft`、零 `trl`）从 0 开始实现了一个完整的 Transformer LLM，从下载 Pile 数据集、分词、训练、到生成文本，所有代码都是手写的。日常类比：大多数 LLM 教程教你"开车"——直接坐进 Tesla 里踩油门；这个项目教你**"造一辆车"**：自己设计引擎（注意力机制）、自己组装车身（Transformer 层）、自己点火启动。

核心能力分两阶段：

1. **Pre-training（预训练）**：从 Pile 数据集训练一个 base 模型，默认 13M 参数（单 GPU 一天能跑完），最大支持 3B+ 参数（A100 多卡）。
2. **Post-training（后训练）**：在 base 模型上叠加 SFT → Reward Model → PPO/DPO → GRPO 全套对齐流程，也是从零手写。

## 为什么重要

不理解这个项目，下面这些事都没法解释：

- 为什么 `Attention is All You Need` 论文里的"Self-Attention"不只是一段数学公式——它是一个**可以逐行调试的 Python 类**
- 为什么"注意力"真的在做"找关联"这件事——当你看到 `q @ k.transpose(-2, -1)` 这一行代码时，"缩放点积注意力"就不再是一个抽象名词
- 为什么 13M 参数就能输出"语法正确但语义模糊"的文本——模型先学会语言结构，再学会语言内容，这是分层学习的证据

## 核心概念

### 1. 注意力机制（Attention）——"做笔记时的荧光笔"

想象你在读一本长书，读到某句话时需要回看上文的某一段。**Self-Attention** 就是让模型自动决定"当前这个词应该关注上文哪些词"。

一个 Attention Head 的工作流程：

```python
class Head(nn.Module):
    def __init__(self, head_size, n_embed, context_length):
        super().__init__()
        self.key = nn.Linear(n_embed, head_size, bias=False)
        self.query = nn.Linear(n_embed, head_size, bias=False)
        self.value = nn.Linear(n_embed, head_size, bias=False)
        # 因果掩码：保证模型只能"看到"前面的词，不能偷看后面的
        self.register_buffer('tril', torch.tril(torch.ones(context_length, context_length)))

    def forward(self, x):
        B, T, C = x.shape
        # Q, K, V 三根投影：把输入变成"问题"、"答案库"、"答案内容"
        k = self.key(x)
        q = self.query(x)
        scale_factor = 1 / math.sqrt(C)
        # 核心公式：注意力权重 = softmax(Q @ K^T / sqrt(d))
        attn_weights = q @ k.transpose(-2, -1) * scale_factor
        # 应用掩码，把"未来"的位置填满负无穷，softmax 后变 0
        attn_weights = attn_weights.masked_fill(self.tril[:T, :T] == 0, float('-inf'))
        attn_weights = F.softmax(attn_weights, dim=-1)
        v = self.value(x)
        # 用注意力权重加权求和 Value，得到输出
        out = attn_weights @ v
        return out
```

关键就在 `q @ k.transpose(-2, -1) * scale_factor` 这一行：它计算了所有词对之间的"相似度"，相似度高的词会被打上更高的权重——模型就是在做"找关联"这件事。

### 2. Transformer 层——"层层递进的阅读理解"

一个 Transformer Block 由两层组成：先做 Multi-Head Attention（多组荧光笔同时标记不同关联），再过一个 MLP（对信息做深度加工）。每一层都有残差连接（跳过一层直接连）和 LayerNorm（稳定训练）。

```python
class TransformerBlock(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.sa = MultiHeadAttention(config['n_head'], config['n_embed'], config['context_length'])
        self.ln1 = nn.LayerNorm(config['n_embed'])
        self.mlp = MLP(config['n_embed'])
        self.ln2 = nn.LayerNorm(config['n_embed'])

    def forward(self, x):
        # 多头注意力 + 残差连接 + LayerNorm
        x = x + self.sa(self.ln1(x))
        # MLP + 残差连接 + LayerNorm
        x = x + self.mlp(self.ln2(x))
        return x
```

每经过一个 Block，模型就对文本做更深一层的理解。64 个 Block 叠起来 = 64 层阅读理解。

### 3. 数据准备——"把书切碎再拼起来"

训练数据来自 Pile（825GB 多领域语料），处理流程：

```python
def process_files(input_dir, output_file):
    """把 .jsonl.zst 文件解压 → 用 OpenAI 的 tokenizer 分词 → 存成 HDF5"""
    with h5py.File(output_file, 'w') as out_f:
        dataset = out_f.create_dataset('tokens', (0,), maxshape=(None,), dtype='i')
        start_index = 0

        for filename in sorted(os.listdir(input_dir)):
            if filename.endswith(".jsonl.zst"):
                in_file = os.path.join(input_dir, filename)
                with zstd.open(in_file, 'r') as in_f:
                    for line in tqdm(in_f):
                        data = json.loads(line)
                        text = data['text'] + "<|endoftext|>"
                        encoded = enc.encode(text, allowed_special={'<|endoftext|>'})
                        encoded_len = len(encoded)
                        end_index = start_index + encoded_len
                        dataset.resize(dataset.shape[0] + encoded_len, axis=0)
                        dataset[start_index:end_index] = encoded
                        start_index = end_index
```

这里的关键是：文本先被 OpenAI 的 `tiktoken` 分词器切成 token ID，再按顺序塞进一个巨大的 HDF5 数组。`<|endoftext|>` 标记每篇文章的结尾，模型学会用它来"知道一段话结束了"。

### 4. 后训练对齐（SFT → DPO → GRPO）——"从聊天机器人到礼貌助手"

预训练模型就像一个"读过很多书但不太懂礼貌"的人。后训练阶段就是教它：

- **SFT（监督微调）**：给"好问题 + 好答案"对，让它学正确的回答格式
- **Reward Model（奖励模型）**：给模型两份答案，教它判断哪个更好
- **PPO / DPO**：用奖励信号继续优化，让回答更高质量
- **GRPO**：Group Relative Policy Optimization，新版对齐算法

整个流程从零手写，没有调任何第三方对齐库。

## 实践流程

### 快速上手：训练一个 13M 参数的模型

```bash
git clone https://github.com/FareedKhan-dev/train-llm-from-scratch.git
cd train-llm-from-scratch
export PYTHONPATH="$PYTHONPATH":.
pip install -r requirements.txt

# 1. 下载数据（一份约 11GB，可以只下 00.jsonl.zst）
python scripts/data_download.py

# 2. 预处理：解压 + 分词 + 存 HDF5
python scripts/data_preprocess.py

# 3. 训练（config/config.py 里改参）
python scripts/train_transformer.py

# 4. 生成文本
python scripts/generate_text.py --model_path models/your_model.pth --input_text hi
```

13M 模型在一个普通 GPU（如 RTX 3080）上一天就能跑完，输出示例：

```
In 1978, The park was returned to the factory-plate that 
the public share to the lower of the electronic fence that 
follow from the Station's cities.
```

语法正确，语义模糊——这就是模型在**先学结构、后学内容**的必经阶段。

## 踩过的坑

1. **`PYTHONPATH` 必须加**：仓库的 import 路径是相对根目录的，不加 `export PYTHONPATH="$PYTHONPATH":.` 就会 `ModuleNotFoundError`。

2. **数据预处理很慢**：Pile 每份文件 11GB，zstd 解压 + tiktoken 分词 + HDF5 写入，全跑完可能要几个小时。`--max_data` 参数可以限制处理条数来做快速验证。

3. **`config/config.py` 改完要重启**：训练脚本读取配置时是启动时一次性读的，改完配置不改代码就 `python scripts/train_transformer.py`，不要在代码里 `import config` 后在另一段改值。

4. **生成文本时 `<|endoftext|>` 的处理**：`generate_text.py` 的输入 prompt 需要模型见过的 token，如果提示词包含非常见的符号（如 `#` 或 `！`），生成结果会质量很差。

5. **显存不够不要硬跑大模型**：13M 参数在 RTX 5090 上仅占 ~0.67GB，但 3B 参数在 A100 上也需要 40GB 以上。先看 README 里的 GPU 对照表再选配置。

## 适用 vs 不适用场景

**适用**：

- 想从零理解 Transformer 每一行代码怎么写的学习者
- 需要"可读性 > 开箱即用"的研究者——每个模块都是几百行的独立文件
- 手上有少量 GPU、想先跑通小模型再逐步放大
- 想学习 SFT / DPO / PPO 从零怎么实现

**不适用**：

- 只想微调一个模型、不想碰底层代码 → 用 HuggingFace `transformers` + `trl`
- 需要生产级性能 / 分布式训练优化 → 用 DeepSpeed / Megatron-LM
- 没有 GPU → 即使是 13M 模型也推荐有 GPU，Colab T4 可以起步

## 学到什么

1. **注意力不玄学**——`q @ k.transpose(-2, -1)` 就是"用问题匹配答案"的向量乘法，所有花哨的 Multi-Head、LayerNorm、残差连接都是围绕这一核心公式的工程优化。

2. **模型越小越容易上手**——13M 参数的模型一天就能训练完毕，输出语法正确的句子。先跑通小模型，再逐步放大到 130M、1B、3B，这是最踏实的学习路径。

3. **训练 = 数据 + 架构 + 损失函数**——数据决定了"模型能学到什么"，架构决定了"模型怎么组织这些信息"，损失函数（交叉熵）决定了"模型怎么知道自己对不对"。

4. **后训练是对齐的灵魂**——预训练模型只是"读过书"，SFT 教它"怎么答题"，DPO 教它"判断好坏"，GRPO 教它"持续进步"。没有对齐，LLM 只是一个文本生成器。

5. **从零手写的价值**——用 `transformers` 库调参 10 次，不如从 `nn.Linear` 开始写一遍一遍注意力。后者让你在任何新场景下都能"自己造轮子"。

6. **工程选型：HDF5 + zstd**——原始 JSONL 解压太慢，直接全部载入内存会爆。分块解压、流式分词、用 HDF5 做可随机访问的存储，这是处理大规模语料的标准姿势。

## 延伸阅读

- 原始论文：[Attention Is All You Need](https://arxiv.org/abs/1706.03762) —— Transformer 的诞生论文
- 项目官方文档：[docs/README.md](https://github.com/FareedKhan-dev/train-llm-from-scratch/blob/main/docs/README.md) —— 手绘图 + 理论解释
- 后训练指南：[POST_TRAINING.md](https://github.com/FareedKhan-dev/train-llm-from-scratch/blob/main/POST_TRAINING.md) —— SFT → DPO → GRPO 完整管线
- Streamlit 交互面板：`streamlit run ui/app.py` —— 有训练、评测、对话界面的可视化控制
- [[pytorch]] —— 本项目完全建立在 PyTorch 之上
- [[various-llm-smells]] —— 大型模型项目中的常见陷阱

## 关联

- [[pytorch]] —— 本项目唯一的深度学习框架，所有张量 / autograd / nn 模块都来自它
- [[trl]] —— 同样做 SFT/DPO/RLHF，但 trl 是封装好的库，本项目从零手写对照
- [[deepspeed]] —— 本项目 13M 单卡可跑，Deepspeed 解决的是"10B 以上多卡怎么并行"
- [[fastai]] —— fastai 教你"开车"，这个项目教你"造车"
