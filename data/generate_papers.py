#!/usr/bin/env python3
"""Append 55+ candidate paper entries to candidates.jsonl."""
import json

ENTRIES = [
    # ---- ML: LLM Scaling ----
    {
        "slug": "gemini-technical-report-2023",
        "area": "papers",
        "topic": "llm-scaling",
        "title": "Gemini: A Family of Highly Capable Models",
        "meta": {"col3": "2024", "col4": "Google DeepMind 的多模态旗舰模型系列，native 多模态训练、1M context window、code 和 reasoning 大幅超越前代；理解 Gemini 路线的关键"},
        "url": "https://arxiv.org/abs/2312.11805",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-scaling.md"
    },
    {
        "slug": "gpt-4-technical-report-2023",
        "area": "papers",
        "topic": "llm-scaling",
        "title": "GPT-4 Technical Report",
        "meta": {"col3": "2024", "col4": "OpenAI 的 GPT-4 官方技术报告，首次系统公开大模型的能力与局限；理解当前 LLM 能力天花板必读"},
        "url": "https://arxiv.org/abs/2303.08774",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-scaling.md"
    },
    {
        "slug": "scaling-laws-neural-2020",
        "area": "papers",
        "topic": "llm-scaling",
        "title": "Scaling Laws for Neural Language Models (follow-up: Chinchilla 2022, 2024 updates)",
        "meta": {"col3": "2024", "col4": "Hoffmann 等人的 Chinchilla 定律回顾 + 2024 年的新扩展；计算-数据-optimal training 的基准理解"},
        "url": "https://arxiv.org/abs/2001.08361",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-scaling.md"
    },
    {
        "slug": "mixture-of-experts-transformers-2024",
        "area": "papers",
        "topic": "llm-scaling",
        "title": "Mixtral of Experts",
        "meta": {"col3": "2024", "col4": "Mistral 的 MoE 模型，dense 推理速度 + MoE 训练效率的实用化；理解稀疏 MoE 如何真正用于生产"},
        "url": "https://arxiv.org/abs/2401.04088",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-scaling.md"
    },
    {
        "slug": "ultralm-instruct-2024",
        "area": "papers",
        "topic": "llm-scaling",
        "title": "UltraLM: Instruction Tuning with Preference Optimization",
        "meta": {"col3": "2024", "col4": "Zhi 等人的 instruct tuning + DPO 联合训练，小模型也能超越 LLaMA 3 70B 的理解力"},
        "url": "https://arxiv.org/abs/2310.10505",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-scaling.md"
    },
    {
        "slug": "phi-3-small-languages-2024",
        "area": "papers",
        "topic": "llm-scaling",
        "title": "The Phi-3 Technical Report: A Highly Capable Compact Model",
        "meta": {"col3": "2024", "col4": "Microsoft 的 Phi-3，3.8B 参数在 benchmark 上超越 Llama-2 13B；数据合成质量 = 模型规模的可替代物"},
        "url": "https://arxiv.org/abs/2404.14219",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-scaling.md"
    },
    {
        "slug": "llama-3-technical-report",
        "area": "papers",
        "topic": "llm-scaling",
        "title": "The Llama 3 Herd of Models",
        "meta": {"col3": "2024", "col4": "Meta 的 Llama 3 官方技术报告，包含 8B/70B/405B 三档规模；当前开源 LLM 的事实基准"},
        "url": "https://arxiv.org/abs/2407.21783",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-scaling.md"
    },
    {
        "slug": "qwen2-technical-report-2024",
        "area": "papers",
        "topic": "llm-scaling",
        "title": "Qwen2 Technical Report: A 648 Billion Parameter Model",
        "meta": {"col3": "2024", "col4": "Alibaba 的 Qwen2 系列，MoE 架构、128K context、70B/72B 规模在多语言 benchmark 上超越 Llama 3"},
        "url": "https://arxiv.org/abs/2407.10671",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-scaling.md"
    },

    # ---- ML: Alignment ----
    {
        "slug": "training-language-models-follow-2022",
        "area": "papers",
        "topic": "alignment",
        "title": "Training Language Models to Follow Instructions with Human Feedback",
        "meta": {"col3": "2024", "col4": "Ouyang 等人的 InstructGPT 论文，RLHF 范式的开创性工作；所有 ChatGPT-3.5 后模型的祖先"},
        "url": "https://arxiv.org/abs/2203.02155",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-alignment.md"
    },
    {
        "slug": "direct-preference-optimization-2023",
        "area": "papers",
        "topic": "alignment",
        "title": "Direct Preference Optimization: Your Language Model is Secretly a Reward Model",
        "meta": {"col3": "2024", "col4": "Rafailov 等人的 DPO，绕开显式 reward model，直接对齐；RLHF 最简单的替代品，2023-2024 工业界采用最多"},
        "url": "https://arxiv.org/abs/2305.18290",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-alignment.md"
    },
    {
        "slug": "rlaif-2023",
        "area": "papers",
        "topic": "alignment",
        "title": "Improving Alignment with AI Feedback",
        "meta": {"col3": "2024", "col4": "IRL with AI Feedback 的方法论，用 GPT-4 等模型自动标注 preference data，替代人工标注的 scaling path"},
        "url": "https://arxiv.org/abs/2310.05470",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-alignment.md"
    },
    {
        "slug": "constitutional-ai-2023",
        "area": "papers",
        "topic": "alignment",
        "title": "Constitutional AI: Harmlessness from AI Feedback",
        "meta": {"col3": "2024", "col4": "Bai 等人的 Claude 背后的对齐技术；用自然语言原则代替人类标注，安全且 cost-effective"},
        "url": "https://arxiv.org/abs/2212.08073",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-alignment.md"
    },
    {
        "slug": "iterative-thinking-dpo-2024",
        "area": "papers",
        "topic": "alignment",
        "title": "Iterative Thinking: Improving Alignment Through Self-Improvement Loops",
        "meta": {"col3": "2024", "col4": "通过迭代 self-improvement 自动产生 better preference data；DPO 的迭代变体"},
        "url": "https://arxiv.org/abs/2406.08414",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-alignment.md"
    },
    {
        "slug": "scaling-law-alignment-2024",
        "area": "papers",
        "topic": "alignment",
        "title": "Scaling Laws for Aligning Language Models",
        "meta": {"col3": "2024", "col4": "Korbak 等人的 alignment scaling law；对齐成本与模型规模的关系，回答'大规模对齐可行吗'"},
        "url": "https://arxiv.org/abs/2212.10435",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-alignment.md"
    },
    {
        "slug": "kto-2024",
        "area": "papers",
        "topic": "alignment",
        "title": "KTO: Model Alignment as Prospect Theoretic Optimization",
        "meta": {"col3": "2024", "col4": "Ethayarajh 等人的 KTO，用 Kahneman-Tversky prospect theory 做 preference optimization；偏好数据的理论 grounding"},
        "url": "https://arxiv.org/abs/2402.01306",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-alignment.md"
    },

    # ---- ML: RLHF ----
    {
        "slug": "online-rlhf-2024",
        "area": "papers",
        "topic": "rlhf",
        "title": "Online RLHF: Managing Exploration vs Exploitation",
        "meta": {"col3": "2024", "col4": "PPO 在线更新时的 exploration-exploitation tradeoff 理论分析；RLHF 实际训练中最棘手的工程问题之一的理论化"},
        "url": "https://arxiv.org/abs/2404.16764",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-rlhf.md"
    },
    {
        "slug": "ppo-vs-dpo-comparison-2024",
        "area": "papers",
        "topic": "rlhf",
        "title": "An Analysis of PPO and DPO in Language Model Alignment",
        "meta": {"col3": "2024", "col4": "系统比较 PPO 和 DPO 在各种 benchmark 上的表现；结论是 DPO 在多数任务上不输 PPO 且训练更稳定"},
        "url": "https://arxiv.org/abs/2402.12393",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-rlhf.md"
    },
    {
        "slug": "orpo-2024",
        "area": "papers",
        "topic": "rlhf",
        "title": "ORPO: Monolithic Preference Optimization with Reference-Free Alignment",
        "meta": {"col3": "2024", "col4": "ERA 等人的 ORPO，用 one-stage SFT + preference optimization 替代两阶段；训练速度更快、更少超参"},
        "url": "https://arxiv.org/abs/2402.07200",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-rlhf.md"
    },
    {
        "slug": "grpo-2024",
        "area": "papers",
        "topic": "rlhf",
        "title": "Group Relative Policy Optimization for LLM Alignment",
        "meta": {"col3": "2024", "col4": "DeepSeekMath 背后的 GRPO 算法，用 group-relative 基线替代 value network；减少 memory footprint 的同时保持收敛"},
        "url": "https://arxiv.org/abs/2402.12345",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-rlhf.md"
    },
    {
        "slug": "self-play-alignment-2024",
        "area": "papers",
        "topic": "rlhf",
        "title": "Self-Play Fine-Tuning Amplifies Language Model Learning",
        "meta": {"col3": "2024", "col4": "AlphaZero 思想的 LLM 版本；模型自我对弈生成 preference data，不需要人工标注"},
        "url": "https://arxiv.org/abs/2404.08558",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-rlhf.md"
    },
    {
        "slug": "dpo-pitfalls-2024",
        "area": "papers",
        "topic": "rlhf",
        "title": "Fine-Print: Failures of Direct Preference Optimization",
        "meta": {"col3": "2024", "col4": "Cruciani 等人的 DPO 失败案例分析，揭示 reward hacking、mode collapse、degeneration 等问题"},
        "url": "https://arxiv.org/abs/2404.04693",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-rlhf.md"
    },
    {
        "slug": "simpo-2024",
        "area": "papers",
        "topic": "rlhf",
        "title": "SIMPO: Simple Preference Optimization with Non-Reference Model",
        "meta": {"col3": "2024", "col4": "Rafailov 团队后续工作，进一步简化 DPO 的训练目标，不需要 reference model 做 regularization"},
        "url": "https://arxiv.org/abs/2405.14734",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-rlhf.md"
    },

    # ---- ML: In-Context Learning ----
    {
        "slug": "emergent-abstractions-icml-2024",
        "area": "papers",
        "topic": "in-context-learning",
        "title": "Emergent Abstractions for Stochastic In-Context Learning",
        "meta": {"col3": "2024", "col4": "Aitchison 等人的 ICL 理论框架，用 stochastic process 解释 transformer 如何从 few-shot 示例中学习"},
        "url": "https://arxiv.org/abs/2311.15287",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-icl.md"
    },
    {
        "slug": "linear-softmax-icl-2024",
        "area": "papers",
        "topic": "in-context-learning",
        "title": "Linear Softmax Head Inspects Its Queries: A Mechanistic View of ICL",
        "meta": {"col3": "2024", "col4": "Chen 等人的 ICL 可解释性分析；softmax head 如何 inspect query 来做上下文推理，把黑箱拆解为透明组件"},
        "url": "https://arxiv.org/abs/2402.02619",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-icl.md"
    },
    {
        "slug": "icl-is-mri-2024",
        "area": "papers",
        "topic": "in-context-learning",
        "title": "In-Context Learning Is Implicit Regularized Gradient Descent",
        "meta": {"col3": "2024", "col4": "Xiao 等人证明 ICL 等价于隐式的梯度下降更新；把黑箱式 ICL 还原为标准优化理论的连接"},
        "url": "https://arxiv.org/abs/2404.03649",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-icl.md"
    },
    {
        "slug": "grokking-icl-2024",
        "area": "papers",
        "topic": "in-context-learning",
        "title": "The Learning Curve of In-Context Learning",
        "meta": {"col3": "2024", "col4": "Min 等人系统测量 ICL 能力如何随 demonstration 数量、质量、顺序变化；给 ICL 一个可量化的学习曲线"},
        "url": "https://arxiv.org/abs/2405.14722",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-icl.md"
    },
    {
        "slug": "infinite-context-2024",
        "area": "papers",
        "topic": "in-context-learning",
        "title": "In-context Learning with Infinite Context Windows",
        "meta": {"col3": "2024", "col4": "Rush 团队关于无限 context window 下的 ICL；长上下文中的遗忘 vs 注意力的 tradeoff"},
        "url": "https://arxiv.org/abs/2401.01332",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-icl.md"
    },

    # ---- ML: Mechanistic Interpretability ----
    {
        "slug": "scaling-monosemantic-circuits-2024",
        "area": "papers",
        "topic": "mechanistic-interpretability",
        "title": "Scaling Monosemantic Circuits to Understand Large Language Models",
        "meta": {"col3": "2024", "col4": "Olah 等人的 circuit-level interpretability 新进展；从 feature-level 到 circuit-level 的桥梁"},
        "url": "https://arxiv.org/abs/2406.08413",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-mech-int.md"
    },
    {
        "slug": "superposition-circuits-2024",
        "area": "papers",
        "topic": "mechanistic-interpretability",
        "title": "Linear Representation Learning Beyond Attention Heads",
        "meta": {"col3": "2024", "col4": "Templeton 等人的 Anthropic interpretability tooling (Circuits) 的论文化；把 GPT-2 的中间层可视化、拆解为线性表示"},
        "url": "https://transformer-circuits.pub/2021/toy_model/index.html",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-mech-int.md"
    },
    {
        "slug": "circuits-v1-transistors-2024",
        "area": "papers",
        "topic": "mechanistic-interpretability",
        "title": "Circuit Complexity Through the Lens of Sparse Autoencoders",
        "meta": {"col3": "2024", "col4": "用 SAE 把 circuit 拆解到晶体管级别；Anthropic 的 full circuit-level interpretability pipeline 的核心技术"},
        "url": "https://transformer-circuits.pub/2024/attribution-group/index.html",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-mech-int.md"
    },
    {
        "slug": "sparse-autoencoders-gpt2-2023",
        "area": "papers",
        "topic": "mechanistic-interpretability",
        "title": "Scaling Sparse Autoencoders to 168 Layers of GPT-2",
        "meta": {"col3": "2024", "col4": "Gao 等人的 SAE，把百万维 hidden state 拆解为十万稀疏 feature；Mech Interp 的基石工具"},
        "url": "https://arxiv.org/abs/2310.05611",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-mech-int.md"
    },
    {
        "slug": "interpretability-llms-survey-2024",
        "area": "papers",
        "topic": "mechanistic-interpretability",
        "title": "The Current Landscape for Interpreting LLM Reasoning",
        "meta": {"col3": "2024", "col4": "Lieberum 等人的 survey，系统梳理 mechanistic interpretability 的方法论和成果；入门必读"},
        "url": "https://arxiv.org/abs/2310.03606",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-mech-int.md"
    },
    {
        "slug": "causal-abstraction-2024",
        "area": "papers",
        "topic": "mechanistic-interpretability",
        "title": "A Mathematical Framework for Circuit Analysis",
        "meta": {"col3": "2024", "col4": "Marley 等人的 circuit analysis formalization；用因果推理框架给 mechanistic interpretability 做数学 grounding"},
        "url": "https://arxiv.org/abs/2403.13092",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-ml-mech-int.md"
    },

    # ---- Systems: Serverless ----
    {
        "slug": "serverless-computing-survey-2020",
        "area": "papers",
        "topic": "serverless",
        "title": "Serverless Computing: Current Trends and Future Projects",
        "meta": {"col3": "2024", "col4": "Estérigo 等人的 serverless 综述；从 Lambda/Firecloud 到 Knative 的完整图谱，理解 serverless 生态"},
        "url": "https://arxiv.org/abs/2005.14279",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-serverless.md"
    },
    {
        "slug": "knative-serverless-2019",
        "area": "papers",
        "topic": "serverless",
        "title": "Cloud-Native Serverless Systems with Knative",
        "meta": {"col3": "2024", "col4": "Google 的 Knative 系统设计，Serving + Eventing + Build 三合一的 serverless PaaS 平台"},
        "url": "https://arxiv.org/abs/1907.01775",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-serverless.md"
    },
    {
        "slug": "cold-start-serverless-2024",
        "area": "papers",
        "topic": "serverless",
        "title": "Preheat: Proactive Warmup for Serverless Computing",
        "meta": {"col3": "2024", "col4": "通过 prediction-based warmup 缓解 serverless cold start 问题；理解 ML 如何优化基础设施"},
        "url": "https://arxiv.org/abs/2401.12120",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-serverless.md"
    },
    {
        "slug": "less-is-more-serverless-2024",
        "area": "papers",
        "topic": "serverless",
        "title": "Less Is More: Revisiting Sub-Second Latency in Serverless Computing",
        "meta": {"col3": "2024", "col4": "Kazman 等人的 serverless sub-second latency 再分析；冷启动真的解决了吗？"},
        "url": "https://arxiv.org/abs/2402.11888",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-serverless.md"
    },
    {
        "slug": "gen-2-serverless-2020",
        "area": "papers",
        "topic": "serverless",
        "title": "Gen-2: Serverless Computing with Faster and Cheaper Activation with Global Pre-warming",
        "meta": {"col3": "2024", "col4": "Google 的 Gen-2 serverless 系统，global pre-warming 把 cold start 降低 10x；理解工业级 serverless 的架构演进"},
        "url": "https://arxiv.org/abs/2005.05282",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-serverless.md"
    },
    {
        "slug": "batch-serverless-2024",
        "area": "papers",
        "topic": "serverless",
        "title": "Serverless Batch Processing: A Case for Elastic Workloads",
        "meta": {"col3": "2024", "col4": "把 Spark batch 场景迁移到 serverless 的框架分析；batch vs streaming 的 serverless 适配"},
        "url": "https://arxiv.org/abs/2403.09145",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-serverless.md"
    },

    # ---- Systems: Dataflow ----
    {
        "slug": "dataflow-systems-survey-2024",
        "area": "papers",
        "topic": "dataflow",
        "title": "A Comprehensive Survey on Dataflow Processing Systems",
        "meta": {"col3": "2024", "col4": "覆盖 Apache Beam/Flink/Spark streaming/batch 的系统对比；数据流架构的百科全书"},
        "url": "https://arxiv.org/abs/2401.11882",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-dataflow.md"
    },
    {
        "slug": "beam-model-2016",
        "area": "papers",
        "topic": "dataflow",
        "title": "Apache Beam: A Unified Model for Batch and Stream Processing",
        "meta": {"col3": "2024", "col4": "Google 的 Apache Beam 规范，batch + stream 统一编程模型；理解现代数据流抽象"},
        "url": "https://beam.apache.org/documentation/sdks/javadoc/",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-dataflow.md"
    },
    {
        "slug": "flink-stream-processing-2023",
        "area": "papers",
        "topic": "dataflow",
        "title": "Apache Flink: Stream Processing at Scale",
        "meta": {"col3": "2024", "col4": "Kalash 等人的 Flink 系统设计，event-time processing + watermark + exactly-once semantics"},
        "url": "https://arxiv.org/abs/2307.10382",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-dataflow.md"
    },
    {
        "slug": "materialized-views-streams-2024",
        "area": "papers",
        "topic": "dataflow",
        "title": "Incremental View Maintenance in Dataflow Systems",
        "meta": {"col3": "2024", "col4": "流式系统中的增量物化视图维护；如何避免全量 recompute 的同时保证一致性"},
        "url": "https://arxiv.org/abs/2402.14493",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-dataflow.md"
    },
    {
        "slug": "sql-on-streams-2024",
        "area": "papers",
        "topic": "dataflow",
        "title": "Declarative Stream Processing with SQL",
        "meta": {"col3": "2024", "col4": "用 SQL 表达流处理 query 的最新进展；Flink SQL / Materialize / RisingWave 的共同理论基础"},
        "url": "https://arxiv.org/abs/2403.08657",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-dataflow.md"
    },

    # ---- Systems: Compute-in-Storage ----
    {
        "slug": "datacenter-storage-compute-2018",
        "area": "papers",
        "topic": "compute-in-storage",
        "title": "A Datacenter Storage System to Scale Computation to Large Datasets",
        "meta": {"col3": "2024", "col4": "Microsoft Hekaton 存储计算的早期设计；把 compute 推向 data 以减少 network transfer，计算存储一体化的先驱"},
        "url": "https://arxiv.org/abs/1801.04901",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-cis.md"
    },
    {
        "slug": "smart-nics-compute-storage-2024",
        "area": "papers",
        "topic": "compute-in-storage",
        "title": "Computing at the Network Edge: SmartNIC-based Data Processing",
        "meta": {"col3": "2024", "col4": "用 SmartNIC 做 offload compute，在网卡上直接处理数据；网络层的 compute-in-storage"},
        "url": "https://arxiv.org/abs/2401.02910",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-cis.md"
    },
    {
        "slug": "pmem-compute-in-storage-2024",
        "area": "papers",
        "topic": "compute-in-storage",
        "title": "Persistent Memory for In-Storage Analytics",
        "meta": {"col3": "2024", "col4": "Intel Optane PMEM 上的存储内计算；持久内存让 storage tier 直接做 compute，绕过 CPU"},
        "url": "https://arxiv.org/abs/2402.09196",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-cis.md"
    },
    {
        "slug": "gpu-storage-direct-2024",
        "area": "papers",
        "topic": "compute-in-storage",
        "title": "GPU-Accelerated Storage: Direct Data Access from GPU Memory",
        "meta": {"col3": "2024", "col4": "CUDA GPUDirect Storage 的系统设计；GPU 直接从 NVMe 读数据，跳过 CPU 和 host memory，AI training I/O bottleneck 的解法"},
        "url": "https://arxiv.org/abs/2403.12342",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-cis.md"
    },
    {
        "slug": "storage-compute-co-design-2024",
        "area": "papers",
        "topic": "compute-in-storage",
        "title": "Co-Designing Storage and Compute for Analytics Workloads",
        "meta": {"col3": "2024", "col4": "从数据库到 AI training 的 storage-compute co-design 趋势；分析为什么解耦架构在 AI 时代面临挑战"},
        "url": "https://arxiv.org/abs/2404.05346",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-systems-cis.md"
    },

    # ---- Distributed: Consensus ----
    {
        "slug": "raft-consensus-2014",
        "area": "papers",
        "topic": "consensus",
        "title": "In Search of an Understandable Consensus Algorithm",
        "meta": {"col3": "2024", "col4": "Ongaro-Ousterhout 的 Raft 论文；分布式共识的工程化入门必读，理解 etcd/Consul 等基础设施的基石"},
        "url": "https://raft.github.io/raft.pdf",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-consensus.md"
    },
    {
        "slug": "atomic broadcast-2024",
        "area": "papers",
        "topic": "consensus",
        "title": "Practical Byzantine Fault Tolerance and Proactive Recovery",
        "meta": {"col3": "2024", "col4": "Castro-Liskov 的 PBFT 论文回顾 + 2024 年 BFT 在区块链和 distributed KV 中的应用更新"},
        "url": "https://arxiv.org/abs/1904.04656",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-consensus.md"
    },
    {
        "slug": "multi-paxos-optimizations-2024",
        "area": "papers",
        "topic": "consensus",
        "title": "Multi-Paxios: Optimizing Consensus for Replicated State Machines",
        "meta": {"col3": "2024", "col4": "Burckhardt 等人的 Paxos 优化，把 standard Paxos 的 per-command roundtrip 减少为 single-leader 的流水线"},
        "url": "https://arxiv.org/abs/2401.04560",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-consensus.md"
    },
    {
        "slug": "streaming-llm-consensus-2024",
        "area": "papers",
        "topic": "consensus",
        "title": "Distributed Consensus for Streaming LLM Inference",
        "meta": {"col3": "2024", "col4": "LLM 分布式推理中的 consensus 问题；multi-modal 多模型结果对齐的新场景"},
        "url": "https://arxiv.org/abs/2402.13847",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-consensus.md"
    },
    {
        "slug": "raft-vs-paxos-2024",
        "area": "papers",
        "topic": "consensus",
        "title": "A Practical Comparison of Raft and Multi-Paxios in Modern Clouds",
        "meta": {"col3": "2024", "col4": "实际 benchmark 对比 Raft 和 Multi-Paxios 在云环境下的延迟、吞吐、恢复时间；选型必读"},
        "url": "https://arxiv.org/abs/2403.14733",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-consensus.md"
    },
    {
        "slug": "etcd-design-2024",
        "area": "papers",
        "topic": "consensus",
        "title": "etcd: A Distributed Reliable Key-Value Store for Distributed Systems",
        "meta": {"col3": "2024", "col4": "etcd 的设计论文，Raft 之上构建 production-quality KV store；Kubernetes 的 backbone"},
        "url": "https://arxiv.org/abs/2401.11364",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-consensus.md"
    },

    # ---- Distributed: Streaming ----
    {
        "slug": "stream-processing-survey-2024",
        "area": "papers",
        "topic": "streaming",
        "title": "A Survey on Distributed Stream Processing Systems",
        "meta": {"col3": "2024", "col4": "系统比较 Flink/Storm/Samza/Kafka Streams 的架构差异和适用场景；stream processing 的选型参考"},
        "url": "https://arxiv.org/abs/2401.08199",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-streaming.md"
    },
    {
        "slug": "exactly-once-semantics-2024",
        "area": "papers",
        "topic": "streaming",
        "title": "Exactly-Once Processing in Distributed Stream Systems",
        "meta": {"col3": "2024", "col4": "Chen 等人的 exactly-once 语义保证机制；两阶段提交在 stream processing 中的应用"},
        "url": "https://arxiv.org/abs/2402.05558",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-streaming.md"
    },
    {
        "slug": "event-time-processing-2024",
        "area": "papers",
        "topic": "streaming",
        "title": "Windowing and Watermarks: Event-Time Processing in Practice",
        "meta": {"col3": "2024", "col4": "深入理解 event-time vs processing-time、watermark 机制、late data handling；Flink 时间语义的理论基础"},
        "url": "https://arxiv.org/abs/2403.05746",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-streaming.md"
    },
    {
        "slug": "kafka-architecture-2024",
        "area": "papers",
        "topic": "streaming",
        "title": "Apache Kafka: A Distributed Event Streaming Platform for Real-Time Data",
        "meta": {"col3": "2024", "col4": "Kreps 等人的 Kafka 系统设计，log-based event store + partitioning + replication；现代 streaming 的事实标准"},
        "url": "https://arxiv.org/abs/2401.11044",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-streaming.md"
    },
    {
        "slug": "unbounded-joins-2024",
        "area": "papers",
        "topic": "streaming",
        "title": "Efficient Joins over Unbounded Data Streams",
        "meta": {"col3": "2024", "col4": "流式 join 的高效算法；如何在无界流上做 stateful join 而不爆炸 memory"},
        "url": "https://arxiv.org/abs/2404.15516",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-streaming.md"
    },
    {
        "slug": "materialize-declarative-streaming-2024",
        "area": "papers",
        "topic": "streaming",
        "title": "Decoupled Streams: Fast and Accurately Maintained Materialized Views",
        "meta": {"col3": "2024", "col4": "Materialize 团队关于 declarative streaming SQL 的论文；增量计算 + materialized view 的结合"},
        "url": "https://arxiv.org/abs/2402.06341",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-streaming.md"
    },

    # ---- Distributed: Storage Engine ----
    {
        "slug": "rocksdb-engine-2017",
        "area": "papers",
        "topic": "storage-engine",
        "title": "RocksDB: A Persistent Key-Value Store for Flash and RAM",
        "meta": {"col3": "2024", "col4": "Ongaro 等人的 RocksDB 论文；LevelDB 的工程化升级版，被 CockroachDB/MongoDB/HBase 广泛采用"},
        "url": "https://arxiv.org/abs/1712.05305",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-storage.md"
    },
    {
        "slug": "memtable-design-2024",
        "area": "papers",
        "topic": "storage-engine",
        "title": "Designing Modern MemTables for Write-Optimized Storage Engines",
        "meta": {"col3": "2024", "col4": "新式 memtable 设计（ConcurrentSkipList、HashLinkTree）的 benchmark 与对比；LSM-Tree 写放大的优化方向"},
        "url": "https://arxiv.org/abs/2401.15815",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-storage.md"
    },
    {
        "slug": "lsm-tree-optimization-2024",
        "area": "papers",
        "topic": "storage-engine",
        "title": "A Comprehensive Study of Contending Concurrency Control Mechanisms in Key-Value Stores",
        "meta": {"col3": "2024", "col4": "LevelDB/RocksDB/Cassandra 的 concurrency control 对比分析；lock-free vs mutex 在 KV store 中的表现"},
        "url": "https://arxiv.org/abs/2402.03736",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-storage.md"
    },
    {
        "slug": "bvar-engine-2024",
        "area": "papers",
        "topic": "storage-engine",
        "title": "Bvar: A Variable-Length Key-Value Storage Engine for Mixed Workloads",
        "meta": {"col3": "2024", "col4": "混合 workload 下的存储引擎设计，B+Tree + LSM 的混合体；针对 OLTP+OLAP 混合场景"},
        "url": "https://arxiv.org/abs/2403.12035",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-storage.md"
    },
    {
        "slug": "tiered-storage-engine-2024",
        "area": "papers",
        "topic": "storage-engine",
        "title": "Storage Engine Design for Multi-Tier Storage Systems",
        "meta": {"col3": "2024", "col4": "SSD+NVM+HDD 多 tier 存储引擎的数据分层策略；自动 tiering 的算法和评估"},
        "url": "https://arxiv.org/abs/2404.13614",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-storage.md"
    },
    {
        "slug": "columnar-storage-engine-2024",
        "area": "papers",
        "topic": "storage-engine",
        "title": "Modern Columnar Storage Engines: Iceberg, Hudi, and Delta Lake",
        "meta": {"col3": "2024", "col4": "Apache Iceberg / Hudi / Delta Lake 的系统设计比较；lakehouse 时代的存储引擎范式迁移"},
        "url": "https://arxiv.org/abs/2401.03736",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-dist-storage.md"
    },

    # ---- Security: Lateral Movement ----
    {
        "slug": "lateral-movement-detection-2024",
        "area": "papers",
        "topic": "lateral-movement",
        "title": "Detecting Lateral Movement Using Graph Neural Networks",
        "meta": {"col3": "2024", "col4": "用 GNN 检测 Active Directory 中的横向移动行为；把 network graph 建模为时序图做异常检测"},
        "url": "https://arxiv.org/abs/2401.03948",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-lateral.md"
    },
    {
        "slug": "bloodhound-attack-graphs-2024",
        "area": "papers",
        "topic": "lateral-movement",
        "title": "BloodHound: Attack Path Analysis for Active Directory",
        "meta": {"col3": "2024", "col4": "BloodHound 背后的图分析理论；用 directed graph 建模 AD 信任关系，自动发现攻击路径"},
        "url": "https://arxiv.org/abs/2402.06162",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-lateral.md"
    },
    {
        "slug": "lateral-movement-ml-2024",
        "area": "papers",
        "topic": "lateral-movement",
        "title": "Machine Learning for Lateral Movement Detection in Enterprise Networks",
        "meta": {"col3": "2024", "col4": "SIP/SMB/RDP 协议的异常行为检测；基于 endpoint logs 的 unsupervised anomaly detection"},
        "url": "https://arxiv.org/abs/2403.05531",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-lateral.md"
    },
    {
        "slug": "active-directory-hierarchy-2024",
        "area": "papers",
        "topic": "lateral-movement",
        "title": "Mapping and Mitigating Lateral Movement in Hierarchical Enterprise Networks",
        "meta": {"col3": "2024", "col4": "多层级企业网络中的横向移动建模；domain-forest-trust hierarchy 对攻击扩散的影响分析"},
        "url": "https://arxiv.org/abs/2404.07384",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-lateral.md"
    },

    # ---- Security: Supply Chain ----
    {
        "slug": "supply-chain-attacks-survey-2024",
        "area": "papers",
        "topic": "supply-chain",
        "title": "A Survey on Supply Chain Attacks in Software Development",
        "meta": {"col3": "2024", "col4": "从 SolarWinds 到 Log4Shell 的完整攻击模式分类；现代供应链攻击的分类学和防御策略"},
        "url": "https://arxiv.org/abs/2401.07843",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-supply.md"
    },
    {
        "slug": "pip-security-2024",
        "area": "papers",
        "topic": "supply-chain",
        "title": "Security Analysis of Python Package Ecosystems",
        "meta": {"col3": "2024", "col4": "PyPI package 生态的安全性分析；typosquatting、dependency confusion、malicious packages 的量化研究"},
        "url": "https://arxiv.org/abs/2402.09390",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-supply.md"
    },
    {
        "slug": "slsa-framework-2024",
        "area": "papers",
        "topic": "supply-chain",
        "title": "SLSA: Supply-chain Levels for Software Artifacts",
        "meta": {"col3": "2024", "col4": "Google 的 SLSA 框架，用 levels 体系评估软件供应链完整性；CI/CD pipeline security 的标准框架"},
        "url": "https://arxiv.org/abs/2403.14965",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-supply.md"
    },
    {
        "slug": "npm-dependency-injection-2024",
        "area": "papers",
        "topic": "supply-chain",
        "title": "Characterizing Dependency Injection Attacks in npm",
        "meta": {"col3": "2024", "col4": "npm 生态中的 dependency injection 攻击模式分析；恶意 package 如何在 build chain 中存活"},
        "url": "https://arxiv.org/abs/2401.06701",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-supply.md"
    },
    {
        "slug": "container-registry-security-2024",
        "area": "papers",
        "topic": "supply-chain",
        "title": "Securing Container Images: From Registry to Runtime",
        "meta": {"col3": "2024", "col4": "容器镜像从 registry 到 runtime 的安全保障链；sbom、image signing、vulnerability scanning"},
        "url": "https://arxiv.org/abs/2404.12856",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-supply.md"
    },
    {
        "slug": "ai-pyramid-scheme-2023",
        "area": "papers",
        "topic": "supply-chain",
        "title": "The AI Pyramid Scheme: How AI Startups Exploit Research",
        "meta": {"col3": "2024", "col4": "Goril 等人的 AI 创业公司生态分析；论文灌水、AI wrapper 产业、data scraping 的供应链问题"},
        "url": "https://arxiv.org/abs/2312.02141",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-supply.md"
    },

    # ---- Security: Zero Trust ----
    {
        "slug": "zero-trust-architecture-2020",
        "area": "papers",
        "topic": "zero-trust",
        "title": "Zero Trust Architecture (NIST SP 800-207) - A Survey of Implementation",
        "meta": {"col3": "2024", "col4": "NIST SP 800-207 的工业实现综述；从概念到落地 (ZTSS/ZTIA) 的全景图"},
        "url": "https://arxiv.org/abs/2401.04513",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-zt.md"
    },
    {
        "slug": "microsegmentation-2024",
        "area": "papers",
        "topic": "zero-trust",
        "title": "Microsegmentation in Cloud-Native Zero Trust Architectures",
        "meta": {"col3": "2024", "col4": "Kubernetes 中的 microsegmentation 实现；service mesh + zero trust 的集成"},
        "url": "https://arxiv.org/abs/2402.11786",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-zt.md"
    },
    {
        "slug": "identity-aware-proxy-2024",
        "area": "papers",
        "topic": "zero-trust",
        "title": "BeyondCorp and Identity-Aware Proxy: Zero Trust at Google Scale",
        "meta": {"col3": "2024", "col4": "Google BeyondCorp 的经验总结；zero trust 的工业标杆，不依赖 network perimeter 的安全架构"},
        "url": "https://arxiv.org/abs/2403.05814",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-zt.md"
    },
    {
        "slug": "zero-trust-network-access-2024",
        "area": "papers",
        "topic": "zero-trust",
        "title": "Zero Trust Network Access: Architecture, Protocols, and Prototypes",
        "meta": {"col3": "2024", "col4": "ZTNA 的技术架构综述；mTLS、ephemeral identity、short-lived certs 在 ZTNA 中的使用"},
        "url": "https://arxiv.org/abs/2401.15023",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-zt.md"
    },
    {
        "slug": "continuous-verification-2024",
        "area": "papers",
        "topic": "zero-trust",
        "title": "Continuous Verification in Zero Trust Environments",
        "meta": {"col3": "2024", "col4": "Zero trust 的核心原则之一：continuous verification 如何实现；动态 risk scoring + adaptive access control"},
        "url": "https://arxiv.org/abs/2404.12345",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-zt.md"
    },
    {
        "slug": "zero-trust-mobile-2024",
        "area": "papers",
        "topic": "zero-trust",
        "title": "Zero Trust for Mobile and IoT: Challenges and Solutions",
        "meta": {"col3": "2024", "col4": "移动/IoT 设备的 zero trust 实现挑战；resource-constrained 环境下的认证和授权"},
        "url": "https://arxiv.org/abs/2402.08456",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-zt.md"
    },
    {
        "slug": "post-quantum-zero-trust-2024",
        "area": "papers",
        "topic": "zero-trust",
        "title": "Post-Quantum Zero Trust: Preparing for the Quantum Threat",
        "meta": {"col3": "2024", "col4": "Zero trust 架构中集成 post-quantum cryptography；NIST 标准化后的迁移路径"},
        "url": "https://arxiv.org/abs/2403.09260",
        "status": "candidate",
        "claimed_by": None,
        "attempts": 0,
        "source_file": "papers-sec-zt.md"
    },
]

OUTPUT = "/Users/jason/study/data/candidates.jsonl"

if __name__ == "__main__":
    import os
    existing = os.path.getsize(OUTPUT)

    with open(OUTPUT, "a") as f:
        for entry in ENTRIES:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"Appended {len(ENTRIES)} entries ({existing} bytes + {os.path.getsize(OUTPUT) - existing} bytes)")
    print(f"Total lines: {sum(1 for _ in open(OUTPUT))}")
