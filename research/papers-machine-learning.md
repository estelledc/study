---
title: 论文候选 — 机器学习 / 深度学习 / 强化学习
description: 80 篇候选，由 research subagent 整理，待主 CC 排期写入正式 papers/
日期: 2026-05-29
---

# 机器学习 / 深度学习 / 强化学习主题候选

候选 80 篇，按 20 个子主题分组。覆盖 1997-2024，避开 study 站现有约 58 篇 ML 论文（word2vec/attention/bert/gpt-3/t5/chinchilla/scaling-laws/llama/mixture-of-experts/deepseek-r1/mamba/resnet/vit/clip/sam/dino/mae/3d-gaussian-splatting/dalle-2/ddpm/dit/stable-diffusion/llava/dqn/ppo/alphago/muzero/dpo/rlhf-christiano/constitutional-ai/sleeper-agents/induction-heads/toy-models-superposition/sparse-autoencoders/causal-abstraction/activation-patching/anthropic-circuits/cot/react/reflexion/toolformer/voyager/autogen/metagpt/agentless/openhands/swe-agent/swe-bench/instructgpt/rag-lewis-2020/retro/graphrag/megatron-lm/deepspeed-zero/vllm/flash-attention 等）。

## 序列模型经典架构（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `lstm-1997` | Long Short-Term Memory | 1997 | RNN 时代的记忆门控范式祖宗，理解 Transformer 之前 20 年的序列建模主线，且 gating 思想至今活在 GLU/SwiGLU 里 | https://www.bioinf.jku.at/publications/older/2604.pdf |
| `gru-2014` | Learning Phrase Representations using RNN Encoder-Decoder for Statistical Machine Translation | 2014 | GRU 原始论文，比 LSTM 更简洁且性能近似；编码器-解码器范式同步登场，为 seq2seq 铺路 | https://arxiv.org/abs/1406.1078 |
| `seq2seq-2014` | Sequence to Sequence Learning with Neural Networks | 2014 | "把翻译变成端到端神经网络"的奠基；理解 encoder-decoder 范式与 attention 出现的动机必经此处 | https://arxiv.org/abs/1409.3215 |
| `transformer-xl-2019` | Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context | 2019 | 引入 segment-level recurrence + 相对位置编码，解决原始 Transformer 无法跨段建模的硬伤；XLNet/Reformer 都基于它 | https://arxiv.org/abs/1901.02860 |
| `rwkv-2023` | RWKV: Reinventing RNNs for the Transformer Era | 2023 | 把 RNN 的并行训练做到 Transformer 量级的工程突破；推理 O(1) 显存，理解"线性 attention 派"必读 | https://arxiv.org/abs/2305.13048 |

## 高效 Transformer（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `reformer-2020` | Reformer: The Efficient Transformer | 2020 | LSH attention + 可逆网络把 attention 复杂度从 O(N²) 降到 O(N log N)；现代长上下文 LLM 的早期解法 | https://arxiv.org/abs/2001.04451 |
| `performer-2020` | Rethinking Attention with Performers | 2020 | 用随机特征近似 softmax kernel，把 attention 变成线性复杂度；理论严谨，是线性 attention 流派的代表 | https://arxiv.org/abs/2009.14794 |
| `longformer-2020` | Longformer: The Long-Document Transformer | 2020 | 滑窗 + 全局 token 的稀疏 attention；长文档场景的事实标准，Longformer-Encoder-Decoder 后续被广泛复用 | https://arxiv.org/abs/2004.05150 |

## 预训练演进（7 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `elmo-2018` | Deep Contextualized Word Representations | 2018 | 上下文相关词向量的奠基，BERT 之前的 SOTA；理解"为什么静态 word2vec 不够"的关键节点 | https://arxiv.org/abs/1802.05365 |
| `xlnet-2019` | XLNet: Generalized Autoregressive Pretraining for Language Understanding | 2019 | 引入排列语言模型把 AR 与 BERT 的双向性结合；理解"为何 BERT 的 masking 有缺陷"的代表反例 | https://arxiv.org/abs/1906.08237 |
| `roberta-2019` | RoBERTa: A Robustly Optimized BERT Pretraining Approach | 2019 | 用更长训练 + 更大数据 + 去 NSP 把 BERT 调到 SOTA；告诉你"trick 比架构更值钱"的工程美学 | https://arxiv.org/abs/1907.11692 |
| `electra-2020` | ELECTRA: Pre-training Text Encoders as Discriminators Rather Than Generators | 2020 | 把 MLM 换成 replaced token detection，训练效率提升 4×；小模型同等性能的范例 | https://arxiv.org/abs/2003.10555 |
| `deberta-2021` | DeBERTa: Decoding-enhanced BERT with Disentangled Attention | 2021 | 解耦内容/位置 attention + 增强 mask decoder；SuperGLUE 首个超越人类的模型，编码器派的天花板 | https://arxiv.org/abs/2006.03654 |
| `flan-2021` | Finetuned Language Models Are Zero-Shot Learners | 2021 | "instruction tuning"概念的奠基，证明多任务监督微调能解锁零样本泛化；ChatGPT 训练的前置思想 | https://arxiv.org/abs/2109.01652 |
| `t0-2021` | Multitask Prompted Training Enables Zero-Shot Task Generalization | 2021 | BigScience 的开源版 FLAN，公开数据集 + 训练流程；与 FLAN 对比能看清 prompt 多样性的影响 | https://arxiv.org/abs/2110.08207 |

## 多模态视觉-语言（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `align-2021` | Scaling Up Visual and Vision-Language Representation Learning With Noisy Text Supervision | 2021 | Google 版 CLIP，用 1.8B 噪声图文对训练；证明"数据规模 > 数据质量"的多模态范式 | https://arxiv.org/abs/2102.05918 |
| `flamingo-2022` | Flamingo: a Visual Language Model for Few-Shot Learning | 2022 | 把 frozen LLM + 视觉感知器拼接做少样本多模态推理；GPT-4V 之前的工业代表 | https://arxiv.org/abs/2204.14198 |
| `blip2-2023` | BLIP-2: Bootstrapping Language-Image Pre-training with Frozen Image Encoders and Large Language Models | 2023 | Q-Former 桥接视觉-语言，参数效率极高；当下开源 VLM 的事实底座架构 | https://arxiv.org/abs/2301.12597 |
| `coca-2022` | CoCa: Contrastive Captioners are Image-Text Foundation Models | 2022 | 对比学习 + captioning 双 loss 联合训练；理解"判别式 + 生成式统一"的多模态范式 | https://arxiv.org/abs/2205.01917 |

## 图像生成 GAN/AR（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `biggan-2018` | Large Scale GAN Training for High Fidelity Natural Image Synthesis | 2018 | DeepMind 把 GAN 推到 ImageNet 512×512；规模化 + truncation trick 的经典 | https://arxiv.org/abs/1809.11096 |
| `stylegan2-2020` | Analyzing and Improving the Image Quality of StyleGAN | 2020 | NVIDIA StyleGAN 系列代表作，AdaIN 替换 + path-length regularization；人脸生成至今最重要的 GAN | https://arxiv.org/abs/1912.04958 |
| `imagen-2022` | Photorealistic Text-to-Image Diffusion Models with Deep Language Understanding | 2022 | Google 版文生图，强调"文本编码器比扩散网络更重要"；与 DALL-E 2 同期但路线不同 | https://arxiv.org/abs/2205.11487 |
| `parti-2022` | Scaling Autoregressive Models for Content-Rich Text-to-Image Generation | 2022 | 用 AR + VQ tokens 做文生图，对照 diffusion 派；理解"两条技术路线"的分叉点 | https://arxiv.org/abs/2206.10789 |

## 3D 视觉 / 神经渲染（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `nerf-2020` | NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis | 2020 | 神经隐式场表示的开山，把 3D 场景压进 MLP；引爆 3D-GS 之前 4 年的研究主线 | https://arxiv.org/abs/2003.08934 |
| `instant-ngp-2022` | Instant Neural Graphics Primitives with a Multiresolution Hash Encoding | 2022 | NVIDIA 把 NeRF 训练从小时级压到秒级，多分辨率哈希编码；3D 视觉工程化关键 | https://arxiv.org/abs/2201.05989 |
| `dreamfusion-2022` | DreamFusion: Text-to-3D using 2D Diffusion | 2022 | Score Distillation Sampling 把 2D diffusion 蒸馏成 3D；text-to-3D 范式的奠基 | https://arxiv.org/abs/2209.14988 |
| `magic3d-2023` | Magic3D: High-Resolution Text-to-3D Content Creation | 2023 | NVIDIA 在 DreamFusion 基础上做 coarse-to-fine 两阶段；分辨率与质量的工业级跃迁 | https://arxiv.org/abs/2211.10440 |

## 检索增强 / Memory 深化（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `atlas-2022` | Atlas: Few-shot Learning with Retrieval Augmented Language Models | 2022 | Meta 的 RAG 升级版，联合训练检索器 + 生成器；few-shot 场景下击败大 10× 的非 RAG 模型 | https://arxiv.org/abs/2208.03299 |
| `replug-2023` | REPLUG: Retrieval-Augmented Black-Box Language Models | 2023 | 不微调 LLM，只插拔检索器；现代 enterprise RAG 的事实范式 | https://arxiv.org/abs/2301.12652 |
| `self-rag-2023` | Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection | 2023 | 让 LLM 自己决定何时检索 + 何时引用；现代 agentic RAG 的奠基 | https://arxiv.org/abs/2310.11511 |

## 代码 LLM（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `codex-2021` | Evaluating Large Language Models Trained on Code | 2021 | GitHub Copilot 背后的论文，HumanEval benchmark 同步发布；代码 LLM 的奠基 | https://arxiv.org/abs/2107.03374 |
| `codellama-2023` | Code Llama: Open Foundation Models for Code | 2023 | Meta 开源代码模型，Long Context Fine-Tuning + infilling；理解开源代码 LLM 训练 pipeline | https://arxiv.org/abs/2308.12950 |
| `deepseek-coder-2024` | DeepSeek-Coder: When the Large Language Model Meets Programming | 2024 | DeepSeek 团队代码模型，repo-level 预训练 + fill-in-the-middle；2024 年开源代码 LLM 的 SOTA | https://arxiv.org/abs/2401.14196 |
| `starcoder-2023` | StarCoder: may the source be with you! | 2023 | BigCode 开源 15B 代码模型，Stack 数据 + GQA + 8K context；开源训练数据透明度的标杆 | https://arxiv.org/abs/2305.06161 |

## 优化器（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `adam-2014` | Adam: A Method for Stochastic Optimization | 2014 | 深度学习十年最常用优化器的原始论文；至今 90% 训练默认起点 | https://arxiv.org/abs/1412.6980 |
| `adamw-2017` | Decoupled Weight Decay Regularization | 2017 | 修正 Adam 的 weight decay 实现错误，AdamW 成为 LLM 训练默认；理解"L2 正则 ≠ weight decay"的关键 | https://arxiv.org/abs/1711.05101 |
| `adafactor-2018` | Adafactor: Adaptive Learning Rates with Sublinear Memory Cost | 2018 | 把 Adam 的二阶矩存储从 O(d) 降到 O(√d)；T5/PaLM 训练的实际优化器 | https://arxiv.org/abs/1804.04235 |
| `lion-2023` | Symbolic Discovery of Optimization Algorithms | 2023 | Google 用程序合成搜出来的优化器，比 AdamW 内存少一半且更稳；2023 年最受关注的新优化器 | https://arxiv.org/abs/2302.06675 |
| `sophia-2023` | Sophia: A Scalable Stochastic Second-order Optimizer for Language Model Pre-training | 2023 | 二阶优化器在 LLM 预训练上首次实用化，预训练 token 减半；理解 Hessian 估计的工程权衡 | https://arxiv.org/abs/2305.14342 |

## 正则化与训练技巧（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `dropout-2014` | Dropout: A Simple Way to Prevent Neural Networks from Overfitting | 2014 | Hinton 团队的经典正则化方法；理解"集成的近似"视角是后续 stochastic depth/dropath 的源头 | https://jmlr.org/papers/v15/srivastava14a.html |
| `batchnorm-2015` | Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift | 2015 | BN 把深网训练时间砍成 1/14；后续 LN/GN/WN 全是它的变体，所有现代深网都绕不开 | https://arxiv.org/abs/1502.03167 |
| `layernorm-2016` | Layer Normalization | 2016 | RNN/Transformer 的事实标配，解决 BN 在序列数据上的失效；Pre-LN vs Post-LN 之争源头 | https://arxiv.org/abs/1607.06450 |
| `mixup-2018` | mixup: Beyond Empirical Risk Minimization | 2018 | 凸组合两个样本做训练，简单到一行代码；CV 标配增强，且数学清晰可分析 | https://arxiv.org/abs/1710.09412 |
| `label-smoothing-2016` | Rethinking the Inception Architecture for Computer Vision | 2016 | 提出 label smoothing（含 Inception v3）；后被证明是隐式正则 + 校准提升，Transformer/LLM 默认开 | https://arxiv.org/abs/1512.00567 |

## 元学习 / Few-shot（2 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `maml-2017` | Model-Agnostic Meta-Learning for Fast Adaptation of Deep Networks | 2017 | 二阶梯度元学习的奠基，"学会学习"思想的代表；理解 in-context learning 的前身 | https://arxiv.org/abs/1703.03400 |
| `prototypical-networks-2017` | Prototypical Networks for Few-shot Learning | 2017 | 用类原型 + 距离做 few-shot 分类，比 MAML 简单且强；至今 NLP/CV few-shot baseline | https://arxiv.org/abs/1703.05175 |

## 图神经网络（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `gcn-2017` | Semi-Supervised Classification with Graph Convolutional Networks | 2017 | Kipf & Welling 的 GCN 原始论文；把卷积推广到图结构的代表性范式 | https://arxiv.org/abs/1609.02907 |
| `gat-2018` | Graph Attention Networks | 2018 | 把 attention 引入图神经网络，邻居权重可学习；GNN 与 Transformer 收敛的早期信号 | https://arxiv.org/abs/1710.10903 |
| `graphsage-2017` | Inductive Representation Learning on Large Graphs | 2017 | 引入归纳式图表示学习 + neighborhood sampling；工业界大图（>10M 节点）的事实选型 | https://arxiv.org/abs/1706.02216 |
| `gin-2019` | How Powerful are Graph Neural Networks? | 2019 | 用 Weisfeiler-Lehman 测试证明 GNN 表达上界 + 提出 GIN 达到该上界；理解 GNN 理论必读 | https://arxiv.org/abs/1810.00826 |
| `graphormer-2021` | Do Transformers Really Perform Bad for Graph Representation? | 2021 | Transformer 直接刷爆 GNN benchmark，提出图特定位置编码；图领域 Transformer 化的转折点 | https://arxiv.org/abs/2106.05234 |

## 时序 / 表格（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `nbeats-2020` | N-BEATS: Neural Basis Expansion Analysis for Interpretable Time Series Forecasting | 2020 | 纯前馈 + 残差堆叠，M4 竞赛打败统计派；时序预测领域"深度学习也行"的转折 | https://arxiv.org/abs/1905.10437 |
| `tabpfn-2023` | TabPFN: A Transformer That Solves Small Tabular Classification Problems in a Second | 2023 | 用 Transformer 做先验拟合分类，1 秒推理且 SOTA；表格数据领域的"foundation model 时刻" | https://arxiv.org/abs/2207.01848 |
| `chronos-2024` | Chronos: Learning the Language of Time Series | 2024 | Amazon 把时序当 token 训 LLM，零样本预测达 SOTA；时序基础模型的代表 | https://arxiv.org/abs/2403.07815 |

## 理论与现象（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `lottery-ticket-2019` | The Lottery Ticket Hypothesis: Finding Sparse, Trainable Neural Networks | 2019 | "彩票假设"提出大网内存在子网可独立训练到同精度；剪枝/稀疏化研究的引爆点 | https://arxiv.org/abs/1803.03635 |
| `grokking-2022` | Grokking: Generalization Beyond Overfitting on Small Algorithmic Datasets | 2022 | 训练 loss 早收敛、val loss 数千 epoch 后突然泛化的诡异现象；机制可解释性研究的核心案例 | https://arxiv.org/abs/2201.02177 |
| `double-descent-2019` | Reconciling modern machine-learning practice and the classical bias–variance trade-off | 2019 | 双下降曲线打脸经典统计学习理论；理解"过参数化模型为何还能泛化"的关键 | https://arxiv.org/abs/1812.11118 |
| `ntk-2018` | Neural Tangent Kernel: Convergence and Generalization in Neural Networks | 2018 | 无限宽神经网络等价于核方法，给深度学习理论打开一扇门；近年理论工作的频繁起点 | https://arxiv.org/abs/1806.07572 |
| `mode-connectivity-2018` | Loss Surfaces, Mode Connectivity, and Fast Ensembling of DNNs | 2018 | 不同最优解之间存在低 loss 路径连通；颠覆"loss surface 是孤立坑洼"的直觉 | https://arxiv.org/abs/1802.10026 |

## 评测与 Benchmark（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `bigbench-2022` | Beyond the Imitation Game: Quantifying and Extrapolating the Capabilities of Language Models | 2022 | 200+ 任务 LLM 评测合集，Google + 444 作者协作；理解评测设计的多样性 | https://arxiv.org/abs/2206.04615 |
| `mmlu-2021` | Measuring Massive Multitask Language Understanding | 2021 | 57 学科多选题事实标准，LLM 报告 paper 的"必跑"benchmark；至今 GPT/Claude/Gemini 都比 | https://arxiv.org/abs/2009.03300 |
| `glue-2018` | GLUE: A Multi-Task Benchmark and Analysis Platform for Natural Language Understanding | 2018 | NLU 评测奠基，BERT 时代标尺；理解"为什么 evaluation 重要"的入门 | https://arxiv.org/abs/1804.07461 |
| `chatbot-arena-2024` | Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference | 2024 | LMSYS 开放盲测平台，Elo 评分至今是 LLM 公允排名首选；理解"人类偏好"评测的方法论 | https://arxiv.org/abs/2403.04132 |

## AI Safety / Alignment 深化（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `sycophancy-2023` | Towards Understanding Sycophancy in Language Models | 2023 | Anthropic 研究 RLHF 模型为何顺着用户说，包括承认错误的非错误；alignment 失败模式的代表案例 | https://arxiv.org/abs/2310.13548 |
| `mesa-optimization-2019` | Risks from Learned Optimization in Advanced Machine Learning Systems | 2019 | 提出 mesa-optimizer 概念：学到的模型自身可能成为优化器；alignment 理论框架的关键论文 | https://arxiv.org/abs/1906.01820 |
| `goal-misgeneralization-2022` | Goal Misgeneralization: Why Correct Specifications Aren't Enough For Correct Goals | 2022 | DeepMind 实证 even 完美 reward 也会被错误泛化；safety 研究中"规约不够"的硬证据 | https://arxiv.org/abs/2210.01790 |

## Diffusion 深化（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `ddim-2020` | Denoising Diffusion Implicit Models | 2020 | 把 DDPM 1000 步采样压到 50 步且支持插值；现代 diffusion 推理的事实加速器 | https://arxiv.org/abs/2010.02502 |
| `classifier-free-guidance-2022` | Classifier-Free Diffusion Guidance | 2022 | 不依赖 classifier 做条件控制，统一 conditional + unconditional 训练；Stable Diffusion 默认开 | https://arxiv.org/abs/2207.12598 |
| `edm-2022` | Elucidating the Design Space of Diffusion-Based Generative Models | 2022 | NVIDIA Karras 系统化 diffusion 训练超参，提出 EDM 范式；理解"diffusion 配方"的标尺 | https://arxiv.org/abs/2206.00364 |
| `consistency-models-2023` | Consistency Models | 2023 | 把 diffusion 蒸馏到 1-2 步采样且不丢质量；实时图像生成的关键技术 | https://arxiv.org/abs/2303.01469 |

## 强化学习深化（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `a3c-2016` | Asynchronous Methods for Deep Reinforcement Learning | 2016 | DeepMind 异步 actor-learner 架构；CPU 训练 RL 的工业范式，比 DQN 快 10× | https://arxiv.org/abs/1602.01783 |
| `sac-2018` | Soft Actor-Critic: Off-Policy Maximum Entropy Deep RL | 2018 | 最大熵 RL 的代表，连续控制至今最稳的 baseline；机器人/游戏工业实战首选 | https://arxiv.org/abs/1801.01290 |
| `td3-2018` | Addressing Function Approximation Error in Actor-Critic Methods | 2018 | TD3 双 critic + 延迟更新，修正 DDPG 高估偏差；与 SAC 并列连续控制双雄 | https://arxiv.org/abs/1802.09477 |
| `decision-transformer-2021` | Decision Transformer: Reinforcement Learning via Sequence Modeling | 2021 | 把 RL 重新表述为序列建模问题，offline RL 范式革新；Gato 等 generalist agent 的前置思想 | https://arxiv.org/abs/2106.01345 |

## LLM 推理深化（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `tree-of-thoughts-2023` | Tree of Thoughts: Deliberate Problem Solving with Large Language Models | 2023 | 把 CoT 扩成搜索树 + self-evaluation；理解 o1 风格 deliberate reasoning 的早期范式 | https://arxiv.org/abs/2305.10601 |
| `self-consistency-2022` | Self-Consistency Improves Chain of Thought Reasoning in Language Models | 2022 | 多采样 CoT 后投票，简单到一行代码却显著提升数学/推理；inference-time compute 的代表 | https://arxiv.org/abs/2203.11171 |
| `self-refine-2023` | Self-Refine: Iterative Refinement with Self-Feedback | 2023 | 让 LLM 自评 + 自改输出，迭代提升质量；agent loop 的最小可行版本 | https://arxiv.org/abs/2303.17651 |
| `debate-2018` | AI safety via debate | 2018 | OpenAI 提出 debate 协议放大对齐能力，两 agent 对抗 + human judge；scalable oversight 思想源头 | https://arxiv.org/abs/1805.00899 |

## 语音（2 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `whisper-2022` | Robust Speech Recognition via Large-Scale Weak Supervision | 2022 | OpenAI 用 680k 小时网络数据训语音识别 + 翻译，零样本多语言 SOTA；ASR 领域的 GPT-3 时刻 | https://arxiv.org/abs/2212.04356 |
| `vall-e-2023` | Neural Codec Language Models are Zero-Shot Text to Speech Synthesizers | 2023 | 把 TTS 转成 neural codec token 的 LM 任务，3 秒样本即可零样本克隆音色；TTS 范式革新 | https://arxiv.org/abs/2301.02111 |

---

## 备注

- 全部 80 篇均有公开 arXiv URL 或 JMLR DOI
- 时间跨度 1997-2024，涵盖 20 个子主题
- 已验证未与 study 站现有 ML 相关 ~58 篇重复（避开 word2vec/attention/bert/gpt-3/t5/chinchilla/scaling-laws/llama/mixture-of-experts/deepseek-r1/mamba/resnet/vit/clip/sam/dino/mae/3d-gaussian-splatting/dalle-2/ddpm/dit/stable-diffusion/llava/dqn/ppo/alphago/muzero/dpo/rlhf-christiano/constitutional-ai/sleeper-agents/induction-heads/toy-models-superposition/sparse-autoencoders/causal-abstraction/activation-patching/anthropic-circuits/cot/react/reflexion/toolformer/voyager/autogen/metagpt/agentless/openhands/swe-agent/swe-bench/instructgpt/rag-lewis-2020/retro/graphrag/megatron-lm/deepspeed-zero/vllm/flash-attention 等）
- 选择策略：经典奠基（lstm/seq2seq/dropout/adam/maml/gcn/nerf/a3c）+ 当前热点（rwkv/lion/sophia/tabpfn/chronos/consistency-models/decision-transformer/tot）+ 安全方向（sycophancy/mesa-optimization/goal-misgeneralization）三线并进
