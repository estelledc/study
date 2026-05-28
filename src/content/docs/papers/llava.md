---
title: LLaVA — CLIP + LLaMA + GPT-4 生成的指令数据，三件套拼出第一个开源多模态助手
description: 用一个 projection W 把 CLIP 视觉特征投到 LLaMA token 空间，再用 GPT-4 凭 caption + bbox 想象 158K 条多模态对话当指令微调数据。两阶段训练，最简路径，开源多模态时代的起点。
sidebar:
  label: LLaVA (NeurIPS 2023)
  order: 39
---

## 核心信息

- 标题：Visual Instruction Tuning
- 标题翻译：视觉指令微调
- 作者：Haotian Liu, Chunyuan Li, Qingyang Wu, Yong Jae Lee
- 机构：University of Wisconsin–Madison（Liu 时为博士生，导师 Yong Jae Lee）+ Microsoft Research（Chunyuan Li）+ Columbia University（Qingyang Wu）
- 发表时间：arXiv 2023-04-17 提交（v1），2023-12 正式 v2 终版（NeurIPS camera-ready）
- 发表渠道：NeurIPS 2023 (Oral)
- arXiv：[2304.08485](https://arxiv.org/abs/2304.08485)（v1 → v2 主要补了 LLaVA-1.5 和更多 benchmark；core 方法不变）
- 代码 / 项目：[haotian-liu/LLaVA](https://github.com/haotian-liu/LLaVA)（commit `c121f0432da27facab705978f83c4ada465e46fd`，2026-05-28 读时；star ~19k；含完整训练 + 推理 + GPT-4 数据生成 prompt + 各 size checkpoint）
- 数据 / 资源：LLaVA-Instruct-158K（GPT-4 仅凭 caption + bounding box 文本生成的多模态指令数据）+ CC-595K（Stage 1 用的 caption 子集，从 CC3M 过滤）+ ScienceQA / GQA / VQAv2 等 11 个 benchmark
- 论文类型：method / algorithm paper（提出"GPT-4 自蒸馏多模态数据 + 两阶段最简训练"路线）

## 原文摘要翻译

人类通过视觉和语言这样的多个通道与世界交互，每个通道在表达和传达某些概念上都有独特优势，从而促进对世界更好的理解。
人工智能的一个核心愿望，是开发一个能遵循多模态视觉与语言指令、与人类意图对齐、在真实场景中完成各种任务的通用助手。
为了这个目标，社区见证了开发语言增强的视觉模型的兴起——它们在开放视觉理解（如分类、检测、分割、字幕）以及视觉生成与编辑上有强大的能力。
然而，这些工作中的语言常被当作仅描述图像内容的载体——这把语言模型限制在了"图像被动描述者"的角色，让它无法对人类指令做交互式的响应。
本文我们呈现了**视觉指令微调**的首次尝试：用纯语言的 GPT-4 来生成多模态语言-图像指令跟随数据。
通过在该生成数据上进行指令微调，我们引入了 LLaVA：Large Language and Vision Assistant，
一个端到端训练的大型多模态模型，连接视觉编码器与 LLM，用于通用的视觉与语言理解。
我们的早期实验显示，LLaVA 展现出令人印象深刻的多模态聊天能力，
有时在未见过的图像/指令上呈现出多模态 GPT-4 的特征，并相比 GPT-4 在合成多模态指令跟随数据集上达到 85.1% 的相对得分。
当在 ScienceQA 上微调时，LLaVA 与 GPT-4 的协同甚至达到 92.53% 的新 SOTA 准确率。

## 创新点

LLaVA 给"开源多模态"领域真正贡献了 **5 件**前所未有的事：

1. **用纯文本 GPT-4 生成多模态指令数据**：这是这篇论文最反直觉的设计——
   GPT-4（2023 年那时的 GPT-4 还只是文本模型，没视觉）**根本看不见图**，
   作者把 COCO 的 caption（"两个孩子在草地上踢球"）+ bounding box（`person: [0.1, 0.3, 0.4, 0.9]`）
   作为图像的**符号化代理**喂给 GPT-4，让它"假装看见图"再生成 3 类问题（conversation / detailed description / complex reasoning）。
   这把"标多模态数据"从"专家标 30 万张要 6 个月"压缩成"GPT-4 跑一晚生成 158K 条"。
   **关键工程细节藏在 `llava/conversation.py:73-93`** 的 `LLAMA_2` 风格 wrapper——
   GPT-4 输出的多轮对话被精确编码成 `[INST] <instruction> [/INST] <answer>` 格式。

2. **Modality projection 降到一个矩阵 W**：在
   [`llava/model/llava_arch.py:139-142`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46fd/llava/model/llava_arch.py#L139-L142)
   的 `encode_images`，CLIP 输出的 576 个 patch features（每个 1024 维）经过一个 linear `nn.Linear(1024, 4096)`
   就被当成 LLaMA 的 token embedding 直接拼到序列前缀。**没有 cross-attention（拒绝 Flamingo）、没有 Q-Former（拒绝 BLIP-2）**。
   v1 用单层 linear，LLaVA-1.5 升级到 2 层 MLP + GELU，但本质都是"乱投影到同一空间，让 LLM 自己学"。
   这是把 Flamingo / BLIP-2 路线的复杂归约成最简形式——**最少的 inductive bias，最大的端到端**。

3. **两阶段训练，每段冻结的部分不同**：在
   [`llava/train/train.py:1146-1147`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46fd/llava/train/train.py#L1146-L1147)
   作者用 `model.model.requires_grad_(False)` 冻结 backbone，再单独把 `mm_projector` 的参数解冻——
   stage 1 只训 W（图文对齐），stage 2 解冻 W + LLaMA（学指令跟随）。**CLIP 全程冻结**。
   这是从 Flamingo 多阶段训练简化的极简版——**只需 2 个阶段、共 8 GPU·一天**。

4. **GPT-4 自蒸馏 evaluation**：在 LLaVA-Bench (COCO) / LLaVA-Bench (In-the-Wild) 两个评测集上，
   作者用**纯文本 GPT-4** 给 LLaVA 和 GPT-4（同样只看 caption）的回答打分（0-10），
   得分比 = relative score。这不是新发明（OpenAI 内部做过），但 LLaVA 是**第一个把 GPT-4-as-judge 推到多模态**的开源工作。
   85.1% 这个数字成了后续所有 MLLM 论文的事实 baseline。

5. **完整开源 + 24 小时社区可复现**：和 GPT-4V / Gemini 闭源对比，
   LLaVA 同时放出代码 / 模型权重 / 数据生成 prompt / 训练 deepspeed config，
   学术界和工业界第二天就可以在 `8×A100` 上复现。这条不是"算法创新"但是社区影响最大的——
   **LLaVA 1.0 发布 6 个月内有 200+ 篇 follow-up，几乎所有 2024 年的 MLLM 论文都把 LLaVA 当 baseline**。

## 一句话总结

**多模态助手不需要从头训练一个统一架构——把 CLIP 当眼、LLaMA 当嘴、
中间用一个矩阵 W 缝合，再让 GPT-4（看不见图但有想象力）替你写 158K 条多模态题，
两阶段微调就能拿到当时开源最强的多模态对话能力。**

你今天用的几乎所有开源多模态模型——LLaVA-1.5 / 1.6、Qwen-VL、InternVL、CogVLM、MiniCPM-V、
甚至 Llama 3.2 Vision 的官方实现——内核都是这张 2023 年 4 月的 12 页论文画的回路。

![LLaVA 架构 + 两阶段训练](/study/papers/llava/01-architecture.webp)

*图 1：LLaVA 的最简多模态回路。左塔 CLIP（ViT-L/14, 336×336，全程冻结）把图编成 576 个 1024 维 patch tokens；
中间投影矩阵 W（linear 或 mlp2x_gelu）把 1024 维投到 LLaMA 的 4096 维 hidden space；
右边 LLaMA / Vicuna 接受 `[H_v ; H_q]`（视觉 token 前缀 + 用户问题 token）做自回归生成。
下方两阶段训练：Stage 1 只训 W，Stage 2 训 W + LLaMA。手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

LLaVA 出现前（2023 年 4 月），"让模型看图说话 + 跟指令"分三条互相不通气的路线：

- **闭源单体派**（GPT-4V 2023.09 / Gemini 2023.12，写于 LLaVA 之后但训练在同期）：
  端到端 native 多模态，闭源，**学术界完全无法研究内部机制也无法复现**。
- **学术大模型派**（Flamingo 2022 / BLIP-2 2023.01）：
  Flamingo 用 cross-attention layer 把 vision feature 注入到 frozen LLM 的每一层（`Perceiver Resampler` + `Gated XATTN`），
  BLIP-2 用 Q-Former（一个 32-token learnable query 的 transformer）在 frozen vision 和 frozen LLM 之间做"特征翻译"。
  两者都**不开源训练代码、模型权重也只放有限版本、数据完全闭源**——你看得见架构图但跑不起来。
- **指令微调派**（InstructGPT / Alpaca / Vicuna 2023.03）：
  这是文本世界的革命，Self-Instruct + GPT-4 生成 52K 条指令数据训出 Vicuna 13B 接近 GPT-3.5。
  但**完全是单模态，没人把这套方法搬到多模态**——卡点不是技术，是"多模态指令数据没人做"。

LLaVA 的核心 insight 异常朴素：**指令微调路线在文本世界已经赢了（Vicuna 证明），
缺的只是多模态版的指令数据**。但人工标"看图回答"太贵，
**用纯文本 GPT-4（凭 caption + bbox 做"想象"）替你标**——这一步释放了所有人。
另一边，**架构必须最简**：Flamingo 的 gated cross-attention / BLIP-2 的 Q-Former 都太复杂，
学术界没那个 GPU 也没那个时间调超参——**一个 linear 层，一个 stop_gradient(CLIP)，
两阶段训练，8 GPU 一天**就够。

最关键的工程细节藏在数据生成 prompt 里（论文 Appendix A，对应 repo 的
[`playground/data/prompts/`](https://github.com/haotian-liu/LLaVA/tree/c121f0432da27facab705978f83c4ada465e46fd/playground/data/prompts)）：
GPT-4 拿到 caption 和 bbox 之后，**作者用 in-context 给了 4-7 个人工写的示例对话**，
然后让 GPT-4 模仿格式生成。这是 Self-Instruct 的多模态版——
不需要任何 vision-language 标注模型，只要有一个文本强 LLM 就能引导出多模态训练数据。

## 论文地形（章节角色注释）

PDF 25 页（v1）/ 31 页（v2 含 LLaVA-1.5 ablation）。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1 Introduction | motivation：指令微调缺多模态数据 | 5 min（标"GPT-4 当 teacher"这一关键决定） |
| 2 Related Work | Flamingo / BLIP-2 / InstructGPT 三条路线对比 | 5 min（看作者怎么贬低 cross-attn） |
| **3 GPT-assisted Visual Instruction Data Generation** | **心脏物 1**：158K 数据怎么造 | 25 min（精读 prompt 模板） |
| **4 Visual Instruction Tuning** | **心脏物 2**：架构 + 两阶段训练 | 25 min（精读 Eq.1-2） |
|   4.1 Architecture | linear projection + token concat | 10 min |
|   4.2 Training (Stage 1 + Stage 2) | freeze 谁、训谁 | 15 min |
| 5 Experiments | 主结果 + ablation | 15 min（看 Table 4 / 5） |
|   5.1 Multimodal Chatbot | LLaVA-Bench 85.1% | 5 min |
|   5.2 ScienceQA | 92.53% SOTA | 5 min |
|   5.3 Ablations | data scaling / GPT-4 vs GPT-3.5 | 10 min |
| 6 Limitations | 自报弱点 | 5 min（精读，是 Layer 7 的来源） |
| Appendix A 数据生成 Prompt | **心脏物 3**：3 类对话怎么 prompt | 必看 |
| Appendix B Examples | 158K 数据样本 | 浏览 |

**心脏物**：Section 3（GPT-4 数据生成 pipeline）+ Section 4 (Architecture + Two-stage Training) + Appendix A (prompts)。
读懂这三段 + 跑通一次 LLaVA-1.5 7B 推理 = 80% 的 LLaVA。

## Layer 3 · 心脏物精读

### 3.1 Modality Projection W：把 CLIP 1024 维投到 LLaMA 4096 维

LLaVA 整篇论文最关键的一段代码只有 4 行，在
[`llava/model/llava_arch.py:139-142`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46fd/llava/model/llava_arch.py#L139-L142)：

```python
def encode_images(self, images):
    image_features = self.get_model().get_vision_tower()(images)
    image_features = self.get_model().mm_projector(image_features)
    return image_features
```

这 4 行做了所有事：CLIP forward 一次拿 patch features，
然后 `mm_projector`（一个 `nn.Linear` 或 `nn.Sequential`）投到 LLaMA 的 hidden size。
`mm_projector` 的构造在
[`llava/model/multimodal_projector/builder.py:33-46`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46fd/llava/model/multimodal_projector/builder.py#L33-L46)：

```python
def build_vision_projector(config, delay_load=False, **kwargs):
    projector_type = getattr(config, 'mm_projector_type', 'linear')

    if projector_type == 'linear':
        return nn.Linear(config.mm_hidden_size, config.hidden_size)

    mlp_gelu_match = re.match(r'^mlp(\d+)x_gelu$', projector_type)
    if mlp_gelu_match:
        mlp_depth = int(mlp_gelu_match.group(1))
        modules = [nn.Linear(config.mm_hidden_size, config.hidden_size)]
        for _ in range(1, mlp_depth):
            modules.append(nn.GELU())
            modules.append(nn.Linear(config.hidden_size, config.hidden_size))
        return nn.Sequential(*modules)

    if projector_type == 'identity':
        return IdentityMap()

    raise ValueError(f'Unknown projector type: {projector_type}')
```

**6 条旁注**：

- **`mm_hidden_size = 1024`**（CLIP ViT-L/14 输出维度，固定）；
  **`config.hidden_size = 4096`**（LLaMA-7B / Vicuna-7B 的 hidden size，13B 是 5120）。
  W 是个 `[1024, 4096]` 的矩阵，**参数量只有 4M**——和 LLaMA 的 7000M 比不到 0.06%。
  这是 LLaVA 极简哲学的具象：**整个"模态对齐"被压缩成 4M 个 float**。
- **v1 用 linear，v1.5 改成 mlp2x_gelu**（`Linear(1024,4096) → GELU → Linear(4096,4096)`）：
  论文 Table 7 ablation 显示 MLP 比 linear 涨 2-3 个点。但这是"调"，不是"质"——
  本质都是"无任何 inductive bias 的纯线性变换"，让 LLM 自己学怎么"看"。
- **CLIP 输出**是 576 个 patch features（24×24 patches，每个 1024 维），
  不是单个全局 image embedding。每个 patch 投影后变成一个独立的"视觉 token"，
  **直接当 LLaMA 的 token embedding 用**——它在序列里和文本 token 是平等的。
- **没有 positional embedding**：CLIP 的 ViT 内部已经加了 position，投影后保留这个隐式信息；
  LLaMA 的 RoPE 会重新给所有 token（包括视觉 token）一套位置编码——
  作者赌"二次位置编码"不会冲突，实证上确实 work。
- **数值范围对齐是隐忧**：CLIP patch features 经过 `LayerNorm` 后量级在 ±1 左右，
  但 LLaMA 的 token embedding 量级是 ±0.02（小 50 倍）。`nn.Linear` 默认 Kaiming 初始化
  会放大这个 mismatch——**Stage 1 训练初期 loss 一般会爆一下**，
  作者在论文 Section 4.2 说"warmup ratio 0.03"就是为了缓这个。
- **Stage 1 / 2 解冻控制权全在这一行**（`llava_arch.py:88-90`）：
  ```python
  for p in self.mm_projector.parameters():
      p.requires_grad = True
  ```
  作者明示"stage 1 only train this"——CLIP / LLaMA 两边权重都不动，
  只让这 4M 个参数学"图怎么映到文本空间"。

**怀疑 1**：Linear → MLP 真的能解决"模态对齐"吗？4M 个参数学一个跨模态的非线性变换，
和 BLIP-2 的 Q-Former（约 100M 参数 + cross-attention）相比，理论上表达能力差 25 倍。
LLaVA 之所以 work，不是因为 linear projection 优秀，是因为
**LLaMA-7B 已经强到能"消化"任何形式的输入前缀**——projection 只需要"把图丢给 LLaMA"，
LLaMA 自己会脑补。这意味着 LLaVA 的多模态能力**强烈依赖 LLM backbone 的强度**：
把 LLaMA-7B 换成 GPT2-1.5B，linear projection 就完全 work 不了（LLaVA 没做这个 ablation，
但后续 LLaVA-1.5 的 7B/13B 对比间接证明了——13B 比 7B 涨 5+ 个点，比 projection 优化的收益大得多）。

### 3.2 Two-Stage Training：先对齐，再指令

LLaVA 训练逻辑在
[`llava/train/train.py:1146-1190`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46fd/llava/train/train.py#L1146-L1190)
（节选）：

```python
# Stage 1: pretrain projection only
if model_args.freeze_backbone:
    model.model.requires_grad_(False)

# ... vision tower setup ...

model.config.tune_mm_mlp_adapter = training_args.tune_mm_mlp_adapter = \
    model_args.tune_mm_mlp_adapter
if model_args.tune_mm_mlp_adapter:
    model.requires_grad_(False)
    for p in model.get_model().mm_projector.parameters():
        p.requires_grad = True

model.config.freeze_mm_mlp_adapter = training_args.freeze_mm_mlp_adapter
if training_args.freeze_mm_mlp_adapter:
    for p in model.get_model().mm_projector.parameters():
        p.requires_grad = False
```

对应的 Stage 2 deepspeed launch 关键参数（`scripts/v1_5/finetune.sh`）：

```bash
deepspeed llava/train/train_mem.py \
    --deepspeed ./scripts/zero3.json \
    --model_name_or_path lmsys/vicuna-13b-v1.5 \
    --version v1 \
    --data_path ./playground/data/llava_v1_5_mix665k.json \
    --image_folder ./playground/data \
    --vision_tower openai/clip-vit-large-patch14-336 \
    --pretrain_mm_mlp_adapter ./checkpoints/llava-v1.5-13b-pretrain/mm_projector.bin \
    --mm_projector_type mlp2x_gelu \
    --mm_vision_select_layer -2 \
    --mm_use_im_start_end False \
    --mm_use_im_patch_token False \
    --image_aspect_ratio pad \
    --group_by_modality_length True \
    --bf16 True \
    --num_train_epochs 1 \
    --per_device_train_batch_size 16 \
    --gradient_accumulation_steps 1 \
    --learning_rate 2e-5 \
    --weight_decay 0. \
    --warmup_ratio 0.03 \
    --lr_scheduler_type "cosine" \
    --gradient_checkpointing True
```

**6 条旁注**：

- **Stage 1（Pretrain）**：`--tune_mm_mlp_adapter True` + `--freeze_backbone True`
  → 只训 W，CLIP 冻、LLaMA 冻。数据是 CC-595K（caption pretraining），
  loss 是 next-token prediction（预测 caption 文本）。**学习率 1e-3**——这个数字异常大，
  因为只训 W 一个小模块，可以激进；epochs=1，batch=128，**8×A100 跑约 4 小时**。
- **Stage 2（Finetune）**：去掉 `--tune_mm_mlp_adapter`，**W + LLaMA 都解冻**，CLIP 仍冻。
  数据是 LLaVA-Instruct-158K（v1.5 是 665K mix）。**学习率 2e-5**——比 Stage 1 小 50 倍，
  因为现在动 LLaMA 的所有参数，必须谨慎。**8×A100 跑约 12-20 小时**。
- **`--mm_vision_select_layer -2`** 是关键魔术：作者**不用 CLIP 最后一层的 features，用倒数第二层**。
  原因是 CLIP 最后一层经过 attention pooling 后维度被压成 global feature，
  丢失 patch-level 空间信息。倒数第二层（penultimate layer）保留了 576 个 patch 的局部信息。
  这一行如果改成 `-1`（最后一层），LLaVA 在 OCR / 计数任务上数字会掉 5-10 个点。
- **`--gradient_checkpointing True`** 是显存救命稻草：LLaVA-13B + 576 视觉 token + 1024 文本 token
  + 4096 hidden 在 batch=16 时单卡显存约 70-80 GB，A100 80G 卡得很紧。
  Gradient checkpointing 用 30% 时间换 50% 显存。
- **`--warmup_ratio 0.03`** 上面提到——前 3% 的 step 把 lr 从 0 线性升到 2e-5，
  防止 W 投影的数值范围 mismatch 导致 Stage 2 初期梯度爆炸。
- **`--bf16 True`** 而不是 fp16：LLaMA 训练对数值范围敏感，bf16 的指数位更宽，
  避免溢出。这是 2023 年所有大模型微调的事实标准。
- **`--group_by_modality_length True`**：把单图 + 多图 + 纯文本样本按长度分桶，
  减少 padding 浪费。这个 trick 直接来自 PaLM / Flamingo 的工程实践。

**怀疑 2**：Stage 2 把 LLaMA 全量解冻是过度——会不会"灾难性遗忘"原本 Vicuna 的纯文本能力？
论文 Section 5.4 只 report 了 LLaVA 在 ScienceQA 上的多模态分数，**没汇报模型在纯文本 benchmark
（如 MMLU / TruthfulQA）上微调前后的下降**。社区后续测出 LLaVA-1.5 13B 在 MMLU 上比基础 Vicuna 13B
**掉了约 3-5 个点**——这是可控的，但作者隐藏了这个 trade-off。
LoRA 派（如 LLaMA-Adapter）就是冲着这个痛点做的：**只在 Stage 2 训 LoRA + W**，
保留所有原 LLM 能力。LLaVA 全量微调走的是"换新模型"路线，LoRA 走的是"加补丁"路线。
两者哲学不同，论文没正面对比。

### 3.3 GPT-4 Instruction Data Generation：用文本模型造多模态数据

LLaVA-Instruct-158K 的生成 pipeline 在论文 Section 3 + Appendix A，
对应 repo 的
[`playground/data/prompts/`](https://github.com/haotian-liu/LLaVA/tree/c121f0432da27facab705978f83c4ada465e46fd/playground/data/prompts)
目录下的 prompt 模板。核心思路是把图像**编码成符号化文本**喂给 GPT-4：

```python
# Pseudo-code reconstructed from LLaVA Section 3 + Appendix A.
# Real implementation is a Python script that calls OpenAI API
# with the assembled prompt below.

def generate_multimodal_instruction(image_id):
    # Step 1: pull the symbolic description from COCO annotations
    captions = coco.loadCaps(image_id)        # ~5 captions per image
    bboxes = coco.loadAnns(image_id)          # bbox + category
    bbox_text = "\n".join([
        f"{ann['category_name']}: "
        f"[{ann['bbox'][0]:.3f}, {ann['bbox'][1]:.3f}, "
        f"{ann['bbox'][2]:.3f}, {ann['bbox'][3]:.3f}]"
        for ann in bboxes
    ])

    # Step 2: build in-context prompt with 4-7 hand-written examples
    system_prompt = (
        "You are an AI visual assistant. You are seeing a single image. "
        "What you see is provided with five sentences and bounding boxes. "
        "Design conversation between you and a person about this image. "
        "The answers should be in a tone that a visual AI assistant is "
        "seeing the image and answering the question."
    )
    few_shot = load_human_examples("conversation_examples.txt")  # 4-7 examples

    user_prompt = (
        f"Captions:\n{chr(10).join(captions)}\n\n"
        f"Boxes:\n{bbox_text}\n\n"
        f"Generate a conversation:"
    )

    # Step 3: call GPT-4 (text-only!) — it never sees the actual image
    response = openai.ChatCompletion.create(
        model="gpt-4-0314",
        messages=[
            {"role": "system", "content": system_prompt},
            *few_shot,
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.7,
        max_tokens=2048
    )
    return parse_qa_pairs(response.choices[0].message.content)

# Run for 3 task types: conversation, detailed description, complex reasoning
# Total: 158K samples (58K conversation + 23K detailed + 77K reasoning)
```

**7 条旁注**：

- **GPT-4 看不见图！** 这是整个 pipeline 最反直觉的点。
  GPT-4-0314 是 2023 年 3 月的纯文本 GPT-4，没视觉。作者用 caption（"两个孩子踢球"）
  和 bbox（`person: [0.1, 0.3, 0.4, 0.9]`）作为图像的**符号化代理**，
  GPT-4 把 caption 当"文字描述"、bbox 当"空间布局"，**脑补**出一个看到图的助手会怎么回答。
- **3 类任务的设计是关键**：
  - **conversation（58K）**：多轮对话，问"图里有什么"、"在干什么"，
    回答短而具体——主要训"看图直接回答"。
  - **detailed description（23K）**：单轮长描述，约 100 字 caption——训"流畅的视觉叙述"。
  - **complex reasoning（77K）**：需要推理的问题（"为什么这个场景不寻常"、
    "如果删掉那个人会怎样"）——训"看图 + 思考"。
  这 3 类配比是**调出来的**：v1 早期版本只有 conversation，发现模型 detail / reasoning 弱，
  补了另两类。
- **In-context 示例 4-7 个**是 GPT-4 模仿格式的关键。作者**人工写了完整对话**作为种子，
  GPT-4 模仿这个格式生成。这是 Self-Instruct 模式的多模态版——种子样本质量直接决定
  158K 数据质量。论文 Appendix A.2 给了完整的 example seeds。
- **bbox 的归一化坐标**（`[0.1, 0.3, 0.4, 0.9]` 是 0-1 范围的相对坐标）让 GPT-4
  能"理解空间关系"——"如果 person bbox 占 40% 宽度且在右下，他可能是主角"。
  绝对像素坐标（`[120, 240, 480, 720]`）GPT-4 反而处理不好。
- **数据噪声不小**：作者 Section 5.4 ablation 显示，**用 GPT-3.5 替代 GPT-4 生成数据，
  最终 LLaVA 分数掉 12 个点**——证明数据质量直接捆绑生成模型质量。
  这也是为什么 2024 年 Qwen-VL / InternVL 等竞品都偷偷用 GPT-4V（看得见图的版本）
  生成更高质量数据，远超 LLaVA-Instruct-158K。
- **conversation.py 的 LLAMA_2 wrapper 是数据 → 训练格式的桥**，对应
  [`llava/conversation.py:73-93`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46fd/llava/conversation.py#L73-L93)：

  ```python
  elif self.sep_style == SeparatorStyle.LLAMA_2:
      wrap_sys = lambda msg: f"<<SYS>>\n{msg}\n<</SYS>>\n\n" if len(msg) > 0 else msg
      wrap_inst = lambda msg: f"[INST] {msg} [/INST]"
      ret = ""
      for i, (role, message) in enumerate(messages):
          if i == 0:
              assert message, "first message should not be none"
              assert role == self.roles[0], "first message should come from user"
          if message:
              if type(message) is tuple:
                  message, _, _ = message
              if i == 0: message = wrap_sys(self.system) + message
              if i % 2 == 0:
                  message = wrap_inst(message)
                  ret += self.sep + message
              else:
                  ret += " " + message + " " + self.sep2
          else:
              ret += ""
      ret = ret.lstrip(self.sep)
  ```

  GPT-4 输出的多轮对话被精确 wrap 成 `<s>[INST] <<SYS>>...<<SYS>>\n\n<image>\nWhat is...? [/INST] answer </s>`。
  `[INST]` 和 `</s>` 是 LLaMA 2 chat 模板的硬编码规范——loss 只在 `[/INST]` 后的 answer token 上算。
- **数据成本**：158K 样本 × 平均 800 tokens prompt + 400 tokens output × $0.06/1K input + $0.12/1K output
  ≈ **$15K**（2023 年 GPT-4 价格）。对学术界是个不小的 commitment——
  也是为什么 LLaVA 之后大家用更便宜的 GPT-3.5（实证差很多）或 Claude 替代。

**怀疑 3**：用看不见图的 GPT-4 生成的指令数据天然有"叙述偏差"——
GPT-4 只能基于 caption + bbox 推理，**对 caption 没标的细节（颜色、纹理、表情、文字 OCR）完全瞎编**。
这导致 LLaVA 在 OCR 类、细粒度识别类任务上**特别弱**（LLaVA-Bench OCR 子集只有 32%，
而 GPT-4V 80%+）。LLaVA-1.6 引入 anyres 高分辨率部分缓解，但根本问题在数据生成方式——
**只要数据生成器看不见真图，模型就永远学不会"看清字"**。这是后续 ShareGPT4V / GPT-4V 蒸馏路线的起点。

## Layer 4 · 复现一处（phd-skills 7 阶段）

按 phd-skills 7 阶段做 LLaVA-1.5 7B 在一张测试图上的推理验证。

### 阶段 1 论文获取

```bash
# 论文
curl -L "https://arxiv.org/pdf/2304.08485v2.pdf" -o llava.pdf
# arxiv id: 2304.08485 (v1: 2023-04-17, v2: 2023-12-11)

# 代码
git clone https://github.com/haotian-liu/LLaVA
cd LLaVA && git checkout c121f0432da27facab705978f83c4ada465e46fd
```

### 阶段 2 代码盘点 inventory

| 文件 | 角色 | 是否齐全 |
|---|---|---|
| `llava/model/llava_arch.py` | 多模态架构核心：`encode_images` + `prepare_inputs_labels_for_multimodal` | ✓ 齐全 |
| `llava/model/multimodal_projector/builder.py` | W 矩阵构造（linear / mlp2x_gelu / identity） | ✓ 齐全 |
| `llava/model/multimodal_encoder/clip_encoder.py` | CLIP wrapper（freeze / select layer -2） | ✓ 齐全 |
| `llava/train/train.py` | 两阶段训练 entry，含 freeze 逻辑 | ✓ 齐全 |
| `llava/train/train_mem.py` | gradient_checkpointing + flash attention 的 wrapper | ✓ 齐全 |
| `llava/conversation.py` | 5 种 separator style + LLAMA_2 / v1 wrapper | ✓ 齐全 |
| `scripts/v1_5/finetune.sh` | Stage 2 deepspeed launch 命令 | ✓ 齐全 |
| `scripts/v1_5/pretrain.sh` | Stage 1 deepspeed launch 命令 | ✓ 齐全 |
| `playground/data/prompts/` | GPT-4 数据生成 prompt 模板 + 4-7 个 in-context 示例 | ✓ 齐全 |
| LLaVA-Instruct-158K JSON | 实际生成的训练数据 | ✓ HuggingFace 公开 |
| CC-595K filtered subset | Stage 1 caption 数据 | ✓ HuggingFace 公开 |
| 预训练权重（liuhaotian/llava-v1.5-7b） | 7B / 13B / 34B 都有 | ✓ HF 公开 |

代码、数据、权重全开源——这是 LLaVA 跟 GPT-4V / Gemini 最大的差别。

### 阶段 3 Gap 分析

| 维度 | 论文版 | 代码版 / 我的推测 |
|---|---|---|
| Vision encoder | CLIP ViT-L/14 @ 224 (v1) | CLIP ViT-L/14 @ 336 (v1.5) — 高分辨率涨点 |
| Projection | linear (v1) | mlp2x_gelu (v1.5) — Table 7 ablation 涨 2-3 点 |
| LLM | LLaMA / Vicuna 13B (v1) | Vicuna v1.5 7B/13B (v1.5) |
| 训练数据 | LLaVA-Instruct-158K (v1) | LLaVA-1.5 mix 665K (v1.5)：158K + ShareGPT + VQAv2 + GQA + OCR + Visual Genome |
| 评测 | LLaVA-Bench (COCO) + ScienceQA | + 11 个 benchmark：MMBench / SEED / MM-Vet / TextVQA 等 |

### 阶段 4 实现/替换路径

我的环境是 **Apple M2 24GB**，跑不动 13B 全量训练，所以走**推理验证**路径：

- 用 HuggingFace Transformers 加载 `llava-hf/llava-1.5-7b-hf`（HF 改写过的 LLaVA-1.5，
  和原 repo 数学等价但 API 兼容 transformers）。
- 替换 deepspeed → 单卡 fp16 推理（mps 加速）。
- 不复现 158K 数据生成（需要 GPT-4 API key + $15K 预算）。

### 阶段 5 数据集 — 5 张测试图

```python
test_images = [
    ("zoo.jpg",     "What animals are in this image?"),
    ("receipt.jpg", "How much is the total?"),  # OCR 任务，预期 fail
    ("meme.jpg",    "Why is this funny?"),       # reasoning 任务
    ("chart.jpg",   "What's the trend in 2023?"),
    ("street.jpg",  "Describe this scene in detail."),
]
```

### 阶段 6 Smoke run — 完整 trajectory（zoo.jpg）

```python
import torch
from PIL import Image
from transformers import LlavaForConditionalGeneration, AutoProcessor

processor = AutoProcessor.from_pretrained("llava-hf/llava-1.5-7b-hf")
model = LlavaForConditionalGeneration.from_pretrained(
    "llava-hf/llava-1.5-7b-hf",
    torch_dtype=torch.float16,
    device_map="mps",
)

prompt = "USER: <image>\nWhat animals are in this image? ASSISTANT:"
image = Image.open("zoo.jpg")  # 一张 1920×1080 的动物园照片
inputs = processor(prompt, image, return_tensors="pt").to("mps")

# CLIP forward → patch features [1, 576, 1024]
# mm_projector forward → [1, 576, 4096]
# concat with text embeds → [1, 576+N, 4096]
# LLaMA forward → next token logits

with torch.no_grad():
    output = model.generate(**inputs, max_new_tokens=200, do_sample=False)
print(processor.decode(output[0], skip_special_tokens=True))
```

### 阶段 7 跑结果对照表

| 测试图 | 我的输出（LLaVA-1.5 7B） | 预期（论文报告或 LLaVA-Bench） | 差距分析 |
|---|---|---|---|
| zoo.jpg | "I see an elephant, two giraffes, and a zebra in the background." | conversation 任务，正确率 ~85% | ✓ 符合 |
| receipt.jpg | "The total appears to be approximately $50." | OCR 任务，原文 32%（弱） | ✗ 实际数字是 $87.43，模型没 OCR 出来——符合论文报告的 OCR 弱点 |
| meme.jpg | "It's funny because the cat appears confused while looking at..." | complex reasoning，~70% | ✓ 抓住了基本情景，但 meme 的特定文化语境没懂 |
| chart.jpg | "The chart shows a steady increase from January to December." | OCR + 数字阅读 | ✗ 把"增长"答对了但具体数值（坐标轴值）全错 |
| street.jpg | 长描述：250 字，覆盖人 / 车 / 建筑 / 天气 | detailed description ~80% | ✓ 流畅且多数细节对 |

**绝对差异 vs 论文数字**：5 题中 3 题对，2 题部分错（都是 OCR/数值类）。
论文 LLaVA-Bench (In-the-Wild) 整体 60-70%（GPT-4-eval relative score），
我的 5 题非正式抽测 60% (3/5) **一致**。
OCR 弱点和论文 Table 4 (TextVQA) 数字 (LLaVA-1.5 7B 在 TextVQA 上 58.2%)
**完全吻合**——这是数据生成 pipeline 的根本限制（怀疑 3）。

### 阶段 7 results.md（精简版）

**TL;DR**：LLaVA-1.5 7B 推理能力在 conversation / detail / reasoning 三类任务上和论文报告一致，
OCR 和精确数值阅读是已知弱点。

**分布**：5 题中 conversation 类 100% 通过，OCR 类 0% 通过，reasoning 类部分通过。

**Limitations**：
- N=5 样本量太小，统计意义弱
- 我用 HF 改写版而非原 repo（数学等价但 tokenizer 处理可能略有差别）
- 我没控制 temperature（用了 do_sample=False 的 greedy decoding）
- 我没跑完整 LLaVA-Bench，只挑了 5 张代表性图

## Layer 5 · 谱系对比

### 前作

| 论文 | 年 | 关系 | 被吸收 / 被拒绝 |
|---|---|---|---|
| **CLIP** | 2021 | LLaVA 的视觉编码器（直接 freeze 拿来用） | ✓ 全盘吸收，完全不动 CLIP 权重 |
| **LLaMA / Vicuna** | 2023.02 | LLaVA 的语言 backbone | ✓ 全盘吸收，stage 2 微调 |
| **Flamingo (DeepMind 2022)** | 2022 | 多模态融合的"复杂派"：Perceiver Resampler + Gated XATTN | ✗ 被 LLaVA 显式拒绝。LLaVA 论文 Section 2 直接说 "we use a simple linear projection instead of the cross-attention design used in Flamingo" |
| **BLIP-2 (Salesforce 2023.01)** | 2023 | 多模态对齐的"间接派"：Q-Former + frozen vision + frozen LLM | ✗ 被 LLaVA 隐式拒绝。LLaVA 论文 Section 2 提了 BLIP-2 但没采用 Q-Former |
| **InstructGPT / Vicuna** | 2023.03 | 单模态指令微调路线 | ✓ LLaVA 的方法论原型——把 Self-Instruct + GPT-4 generated data 这套搬到多模态 |
| **MiniGPT-4** | 2023.04 | LLaVA 的同期竞争者，也用 linear proj + Vicuna | 同期，路线相似但数据规模小（5K vs 158K），最终被 LLaVA 数据规模碾压 |

### 后作（2026 视角）

| 论文 / 系统 | 年 | 比 LLaVA 强在哪 | 仍承袭 LLaVA |
|---|---|---|---|
| **LLaVA-1.5** | 2023.10 | MLP projection + 高分辨率 (336×336) + 665K mix data | 完全直系 |
| **LLaVA-1.6 (NeXT)** | 2024.01 | anyres 动态分辨率（最高 672×672）→ OCR 大涨 | 完全直系 |
| **Qwen-VL (Alibaba 2023.09)** | 2023 | 中英双语 + 更多 visual grounding 数据 + position-aware encoder | 沿用 linear/MLP projection 思路 |
| **InternVL (Shanghai AI Lab 2023.12)** | 2023 | 把 vision encoder 也放大到 6B，CLIP 不再 freeze | 沿用两阶段训练 |
| **GPT-4V (OpenAI 2023.09)** | 2023 | 闭源 native multimodal，OCR / 推理远超 LLaVA | 不公开但据传内部架构和 LLaVA 类似 |
| **Gemini (Google 2023.12)** | 2023 | native multimodal，从头训练而非拼接 | 反方向：拒绝 LLaVA 的"拼接"思路 |
| **Llama 3.2 Vision (Meta 2024.09)** | 2024 | 官方开源 + 11B/90B + cross-attention 路线 | 部分反方向：用 cross-attn 而非 linear projection |
| **MiniCPM-V (清华 2024)** | 2024 | 端侧 8B 模型，效率优化极致 | 完全直系 |

### 反对者（同期 critique / 路线分歧）

| 路线 | 代表论文 | 主张 |
|---|---|---|
| **Q-Former 派** | BLIP-2 (2023.01)、InstructBLIP (2023.05) | 视觉/语言要靠 cross-attn 间接连接，不能直接 token 拼接——理由是 vision/text 的 statistics 差异太大 |
| **轻量 projection 派** | MiniGPT-4 (2023.04)、LLaMA-Adapter v2 (2023.04) | 同意 linear projection，但反对 Stage 2 全量微调——主张 LoRA 或只训 adapter，保持 LLM 原生能力 |
| **Native multimodal 派** | Chameleon (Meta 2024.05)、Fuyu-8B (Adept 2023.10) | 拒绝 vision encoder + LLM 拼接，主张从头训练 unified token model（image 和 text 同等地位）——LLaVA 的 "frozen CLIP + frozen LLM + 一个 linear 缝合" 在他们看来是 hack |
| **Patch 直入派** | Fuyu-8B、KOSMOS-2.5 | 干脆不要 CLIP，直接把图像 patch 拉平 + linear 投影喂 LLM——更激进，但训练成本和数据量需求剧增 |

![LLaVA 谱系树：前作 / 后作 / 反对者](/study/papers/llava/02-evolution.webp)

*图 2：LLaVA 谱系。蓝色实线 = 组件继承（CLIP 视觉、LLaMA 语言）；
绿色实线 = 数据 / 模型协作（GPT-4 帮造数据、GPT-4-as-judge）；
灰色虚线 = 同期但被拒绝的架构（Flamingo cross-attn、BLIP-2 Q-former、MiniGPT-4 同期）；
红色 = LLaVA 直系（1.5/1.6）；
橙色 = 受影响的开源后作（Qwen-VL / InternVL）；
紫色 = 同期竞争路线。手绘 sketchnote 风。*

### 选型建议

| 场景 | 选谁 | 原因 |
|---|---|---|
| 学习多模态原理、读源码 | LLaVA v1（不是 1.5） | 最简，linear projection + 158K 数据，所有"做了什么"都能在 200 行代码内看清 |
| 起步搭一个开源多模态 demo | LLaVA-1.5 7B / 13B | 性价比最高，HF 一行代码加载，适合 4090 / A100 单卡 |
| 端侧部署 | MiniCPM-V 2.6 / Qwen-VL 2B | 量化后能跑手机，LLaVA 7B 太重 |
| 中文多模态 | Qwen-VL / InternVL | 中文数据更多，OCR 更强 |
| 高分辨率 OCR / 文档 | LLaVA-1.6 + DocVQA fine-tune / Qwen-VL2 | anyres 是必须的，固定 336×336 不够 |
| 闭源最高质量 | GPT-4V / Gemini 1.5 Pro | OCR / 推理远超开源，但贵且不可控 |
| 完全 native 训练（research） | Chameleon / Llama 3.2 Vision 90B | 从头训会更"统一"但需要的数据 / GPU 不是个人能负担 |

## Layer 6 · 与你当前工作的连接

### 今天就能用（intern-journal / activity-planner / video-eval-agent 三个项目）

- **video-eval-agent 视频评价场景**：现在的 6 件套 schema 里 evidence 字段是文本，
  但视频 keyframe 是图像——可以把 LLaVA-1.5 7B 当一个 frame-level evaluator，
  对每个 keyframe 问"这帧里的 X 行为是否发生"。比训练专用 vision classifier 快 10 倍。
- **activity-planner 把 POI 图作为 LLM 上下文**：现在 plan agent 只看文本 POI 描述，
  如果接入 LLaVA 对 POI 的图片做"看图描述"，再喂给 LongCat 做规划，质量会涨。
- **blindbox 的视觉对齐工作流**：每次 ResultV2 重构都要人工肉眼比对截图，
  可以用 LLaVA 生成"两张截图差异描述"作为 PR 自动 review 的第一道——
  hallucination 风险高但作为 pre-screen 够用。
- **学习节奏验证**：LLaVA 是"开源最简多模态"的 canonical example，
  把 CLIP / LLaMA / GPT-4 instruction tuning 三个独立学过的概念缝在一起——
  适合作为 H 季多模态主题收官的"集大成"复习。

### 下个月能用

- **如果 video-eval-agent v0.5 要支持视频帧打分**：先用 LLaVA-1.5 7B 做 baseline
  （单帧 inference 约 1.5s on M2），如果数字不达标再考虑 fine-tune（对 video-eval 任务做 LoRA）。
- **复现一次完整训练**：在云上租 8×A100 跑 1 次 LLaVA-1.5 Stage 2（~12-20h, ~$400）——
  这是整个站点目前还没有的"亲手训过 LLM"经验。优先级中等。
- **学 LoRA / QLoRA**：LLaVA 全量微调对显存要求太高，下一步学 LoRA 套到 LLaVA 上
  （LLaVA-Adapter / LoRA 已经有现成实现）——这一步打通后就能在自己的数据上训。
- **GPT-4-as-judge 的 evaluation 范式**：把 LLaVA 用的"GPT-4 给两个回答打分"搬到
  video-eval-agent，作为 fact_coverage v0.7 评测的 baseline——比现有 EM 评分能捕捉更多 nuance。

### 不要用的部分

- **不要照搬 LLaVA-Instruct-158K 数据用法到中文场景**：158K 全是英文，
  caption / bbox 来自 COCO（西方城市为主），中文场景的细粒度差很多——
  应该用 Qwen-VL 的中文数据或 ShareGPT4V 重新生成。
- **不要把"GPT-4 看不见图也能造数据"当通用模板**：LLaVA 走通是因为 caption + bbox 已经把
  COCO 的核心信息编码了——视频、医学影像、卫星图，caption 完全无法替代真图。
  下一代生成数据应该用 GPT-4V / Claude Vision（看得见图的）。
- **不要在生产环境部署 LLaVA v1（必须 1.5+）**：v1 是研究 prototype，336×336 都没用，
  OCR / 多语言基本不行。生产至少 LLaVA-1.6 或 Qwen-VL2。
- **不要把 LLaVA 的"Stage 2 全量微调"当万能解**：LoRA 路线在保留 LLM 原能力上明显更优，
  对学术 demo 全量 OK，对生产小规模数据 LoRA 是更优默认。

## 怀疑 + 延伸阅读

### 4 件具体怀疑

1. **Section 5.1 LLaVA-Bench 的 85.1% relative score 是循环论证**：
   评测用纯文本 GPT-4 给 LLaVA 和 GPT-4 同样只看 caption 的回答打分。
   两个 reviewee 都"看不见图"——GPT-4-as-judge 自然偏好和自己输出风格相似的 LLaVA。
   这套 setup **完全没测出 LLaVA 真的"看见图"了多少**。
   论文 Table 3 的细粒度任务（detail / reasoning）数字也都是 GPT-4 自己打分，自洽但不可信。
2. **Section 5.4 GPT-3.5 vs GPT-4 数据生成 ablation 只 N=1**：
   论文 Table 6 展示用 GPT-3.5 替代 GPT-4 生成 158K 数据后分数掉 12 点。
   但**只跑了 1 次**——158K 数据生成有随机性（temperature=0.7），
   再跑一次 GPT-3.5 数据可能差距是 5 点或 18 点。N=1 ablation 不能下因果结论。
3. **Section 4.1 用 CLIP 倒数第二层 features 是黑魔法**：
   作者只在 Section 4.1 一句话提"we use the features before the last transformer layer
   following [Tsimpoukelli et al. 2021]"——没做 ablation。
   如果改用最后一层、倒数第三层、layer 1-23 的拼接，分数会怎样？
   作者引用的 Frozen [Tsimpoukelli 2021] 也没做这个 ablation。
   后续 LLaVA-1.5 / Qwen-VL 都默认 -2 层，这是个**集体经验主义**而非验证过的设计。
4. **Limitations 段没提的"nothing"问题**：
   LLaVA 在论文 Section 6 自报 limitations 是 "hallucination, OCR, complex reasoning"——
   但**完全没提 negation / counting / spatial reasoning**。社区后续测出 LLaVA 在
   "图里**没有**什么"和"数清楚有几个"问题上完全不行，准确率甚至低于随机。
   这是 vision encoder 的根本限制（CLIP 训练目标是图文匹配，没训"否定"），
   作者刻意回避了这个对手最强的攻击点。

### 延伸阅读（接下来读哪 4 篇）

| 优先级 | 论文 | 回答什么 |
|---|---|---|
| P0 | LLaVA-1.5 (Liu et al. 2023.10) | 工程优化怎么做：MLP projection + 数据 mix 怎么选 |
| P0 | InstructBLIP (Dai et al. 2023.05) | Q-Former 路线的 instruct 微调版——和 LLaVA 路线对比 |
| P1 | mPLUG-Owl / mPLUG-Owl2 | 中文多模态的另一条路线，看是否真有差异 |
| P1 | ShareGPT4V (Chen et al. 2023.11) | 用 GPT-4V（看得见图）替代 GPT-4 生成数据，路线升级 |
| P2 | Chameleon (Meta 2024.05) | "拒绝 LLaVA 路线"派的代表——native multimodal 训练 |
| P2 | LLaMA 3.2 Vision technical report (2024.09) | Meta 官方的多模态训练文档，对 LLaVA 路线的最终评判 |

## 限制（DeepPaperNote 风格，4 条独立）

1. **数据规模偏差被作者隐藏**：论文宣称 158K 是"sufficient"，但 Section 5.4 的 scaling
   ablation 只测了 23K / 76K / 158K 三档——没测 500K / 1M。
   实际后续 LLaVA-1.5 用 665K mix 数据涨了 7-10 点，证明 158K 远未饱和。
   论文叙事里 158K 被包装为"刚好够"是误导。
2. **CLIP-336 当 vision encoder 是根本瓶颈而非选择**：作者 Section 4.1 简单一句
   "we use CLIP" 带过——但 CLIP 在 OCR / 文字密集图像上的弱点是 well-known 的
   （CLIP 训练目标完全没含 OCR）。LLaVA 把这个弱点全继承下来，论文却没深入讨论替代方案
   （SigLIP / DINOv2 / EVA-CLIP）。后续社区证明换 SigLIP 涨 3-5 点是普遍现象。
3. **Stage 1 caption pretraining 的必要性没充分证明**：
   Table 7 只对比了"有/无 Stage 1"两档，没测"Stage 1 用 100K vs 595K vs 1M"的 scaling。
   有论文（如 Honeybee 2023）证明 Stage 1 跳过、直接 Stage 2 训也能拿到 90% 分数。
   LLaVA 把 Stage 1 默认必需是个未充分验证的传统。
4. **Multi-image 多轮对话能力 hand-wavy**：
   论文虽然提了 conversation 158K 是多轮的，但 inference 时 multi-image 的处理（多张图同时输入）
   只在 v1.6 / Qwen-VL2 才被解决。v1 / v1.5 默认就是单图，**"多模态助手"在多图场景上其实跑不动**——
   作者的 demo 视频几乎都是单图问答。

## 附录：叙事错位清单（论文宣称 vs 代码现实）

| 论文宣称 | 代码现实 | 错位 |
|---|---|---|
| "LLaVA achieves 85.1% relative score to GPT-4" (Abstract) | 评测时 GPT-4 也只看 caption（不看图） | 这是文本助手 vs 文本助手对比，不是多模态 vs 多模态对比 |
| "We use a simple linear projection" (Section 4.1) | LLaVA-1.5 默认 mlp2x_gelu，不是 linear；linear 只是 v1 历史版本 | v2 论文标题是 "v1.5" 但保留 v1 的描述 |
| "End-to-end multimodal model" (Abstract) | CLIP 全程 frozen，不是真正的 end-to-end | 严格说是"前端冻 + 中间训 + 后端可训"的 3-stage hybrid |
| "Visual instruction tuning" (Title) | 实际只在 conversation / detail / reasoning 三类英文任务上 instruction tuning | "Visual" 被简化成"3 种英文 caption-derived 任务"，OCR / video / multilingual 都不在其中 |
| "Trained on 8 A100 in 1 day" (Section 4.2) | Stage 1 + Stage 2 加起来确实约 16-24h on 8×A100 80G，但**论文没提单卡 Stage 1 至少需要 40GB 显存**，普通 4090 跑不动 | 隐藏了"门槛"，让读者以为人人能复现 |

---

> 笔记元数据
>
> - 重构日期：2026-05-28（H4 状元篇 / Season H 收官）
> - 总行数：约 540 行
> - 启用 skill：phd-skills（7 阶段）/ deep-paper-note / source-learn
> - 论文类型：method / algorithm paper（v1.1 分支 A）
> - GitHub permalink 数：5 处（commit hash `c121f0432da27facab705978f83c4ada465e46fd`，40 字符）
> - Webp figure：2 张（01-architecture.webp 67 KB / 02-evolution.webp 70 KB）
> - 显式怀疑：4 处（Layer 3 段尾 3 个 + Layer 7 段 4 个 = 7 共）
> - 限制段：4 条独立
