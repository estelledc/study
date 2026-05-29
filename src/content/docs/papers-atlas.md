---
title: 论文全景索引
description: 110 篇论文 · 按主题分类 · 自动从 frontmatter 生成
sidebar:
  order: 5
  label: 论文全景索引
---

> 本页由 `scripts/regen-atlas.mjs` 自动生成。
> 修改方法：编辑论文的 frontmatter（`season:` / `分支:` / `状态:`），重跑脚本。

## 总览

- **总数**：110 篇
- **已分类（Season）**：32
- **未分类**：78（落入字母序总表）

---

## 按主题

### Season D · 编程语言 / 编译器

| 标题 | 描述 |
|---|---|
| [ZGC — 染色指针 + 读屏障下的 TB 级低延迟并发 GC](/study/papers/zgc/) | Per Liden et al |

### Season L · 智能体（5）

| 标题 | 描述 |
|---|---|
| [AutoGen — Enabling Next-Gen LLM Applications via Multi-Agent Conversation](/study/papers/autogen/) | ConversableAgent + GroupChatManager 把多 agent 协作抽象成可编排的对话，奠定 2024 年 multi-agent framework 范式 |
| [Agentless — 反 agent 派代表作：3 阶段 pipeline 在 SWE-bench 上反超复杂 agent](/study/papers/agentless/) | Xia 等人 2024 年的反命题论文——把 agent loop 拆掉，用 file-localize / function-localize / patch-validate 三段流水线在 SWE-bench Lite 跑出 27 |
| [MetaGPT — SOP 驱动的多 agent 软件公司框架](/study/papers/metagpt/) | 把人类软件公司的标准作业流程（SOP）写进 multi-agent 系统：每个 agent 是一个角色（PM / Architect / Engineer / QA），用强结构化文档传递信息，把自由对话的随机性收敛为可复现的工程协作 |
| [OpenHands — 开源 generalist coding agent 平台：把 SWE-agent 的 ACI 工业化、多 agent 化、可扩展化](/study/papers/openhands/) | Wang 等人 2024 年从 OpenDevin 改名而来的开源平台论文 |

### Season M · Scaling Laws（5）

| 标题 | 描述 |
|---|---|
| [DeepSeek-R1 状元篇 — 纯 RL 让 LLM 自己学会推理](/study/papers/deepseek-r1/) | DeepSeek-R1 用 GRPO + rule-based reward 跳过 SFT 阶段，让 base model 在纯强化学习下涌现长 chain-of-thought 与自我反思，开源对齐 OpenAI o1 并引爆 reas… |
| [Mixture of Experts 状元篇 — 从 dense scaling 到 sparse routing](/study/papers/mixture-of-experts/) | MoE 是 Switch Transformer + Mixtral 双论文驱动的 sparse 架构范式，把模型总参数 N 与 active 参数解耦，使万亿规模成为可能 |

### Season N · Mech Interp（5）

| 标题 | 描述 |
|---|---|
| [Activation Patching - 把因果手术刀塞进 Transformer](/study/papers/activation-patching/) | Wang et al |
| [Causal Abstraction × DAS — 神经网络的因果抽象与对齐搜索](/study/papers/causal-abstraction/) | Geiger 2021 把 Pearl 因果模型套到 NN 内部 + DAS 2024 用旋转矩阵学分布式对齐——不必 sparse / mono 的另一条 mech interp 路线 |
| [Sparse Autoencoders 把 superposition 解出来的那把扳手](/study/papers/sparse-autoencoders/) | Cunningham 2023 与 Bricken 2023 双论文精读：从 toy models 的玩具实验到工业级特征解码器 |

### Season O · 数据库（5）

| 标题 | 描述 |
|---|---|
| [ClickHouse Lightning Fast Analytics 状元篇](/study/papers/clickhouse/) | VLDB 2024 ClickHouse 论文精读 — 列存 + vectorized + MergeTree 如何把 OLAP 推到极致 |
| [LSM-tree 与 RocksDB 状元篇](/study/papers/rocksdb-lsm/) | O'Neil 1996 LSM-tree 原始论文 + Facebook RocksDB 2014/2017 工程论文综合精读 — 顺序写 + 后台 merge 如何取代原地更新 |
| [The Snowflake Elastic Data Warehouse 状元篇](/study/papers/snowflake/) | SIGMOD 2016 Snowflake 论文精读 — 存算分离 + 弹性虚拟仓库如何重塑云数仓范式 |

### Season P · 分布式训练（5）

| 标题 | 描述 |
|---|---|
| [ZeRO - Memory Optimizations Toward Training Trillion Parameter Models](/study/papers/deepspeed-zero/) | 状元篇 - DeepSpeed ZeRO 通过分区 Optimizer State / Gradient / Parameter 把内存占用从 N 倍复制降到 1/N，让单 cluster 训出万亿参数模型 |
| [FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness](/study/papers/flash-attention/) | 状元篇 - FlashAttention 用 tiling + recomputation 把 attention 在 SRAM 里 fuse 成单一 kernel，避免 N×N 矩阵物化，让显存从二次降为线性，2-4x 加速，是现代 L… |
| [Mamba - Linear-Time Sequence Modeling with Selective State Spaces](/study/papers/mamba/) | 状元篇 - Mamba 用 input-dependent SSM (S6) 替代 attention，训练用硬件感知的 parallel scan、推理时常数空间，长序列上比 Transformer 快 5-100x，是 Transfo… |
| [Megatron-LM 张量并行如何把单卡放不下的大模型切到多卡](/study/papers/megatron-lm/) | 用矩阵分块的小学算术把 Transformer 的 Linear 层横切纵切，让 8B+ 参数在 8 张 V100 上并行训练，是 GPT-3 / LLaMA / DeepSeek 之前所有大模型训练栈的共同地基 |
| [vLLM - Efficient Memory Management for LLM Serving with PagedAttention](/study/papers/vllm/) | 状元篇 - vLLM 把操作系统分页思想搬进 KV cache 管理，固定大小 block + 间接寻址 + 引用计数共享，让显存利用率从 60-80% 跳到 96%，吞吐 2-4x，是 LLM 推理的标准方案 |

### Season Q · GC / 内存（5）

| 标题 | 描述 |
|---|---|
| [Generational Garbage Collection — 分代假设与跨代引用追踪](/study/papers/generational-gc/) | Lieberman & Hewitt 1983 — 利用对象寿命分布的偏斜，把全堆扫描降为新生代局部扫描 |
| [A Nonrecursive List Compacting Algorithm（Cheney 1970，Copying GC 始祖）](/study/papers/cheney-gc/) | 状元篇 - Cheney 1970 用两片 semi-space 加 BFS scan 实现 copying GC，把递归 mark-and-sweep 换成迭代式 copy + forwarding pointer，所有现代 nurse… |

### 按 v1.1 分支（旧字段）

#### method-A 视觉神经网络

| 标题 | 状态 |
|---|---|
| [ResNet 深度残差学习](/study/papers/resnet/) | 状元篇 |
| [ViT 视觉变换器](/study/papers/vit/) | 状元篇 |

#### theory-D

| 标题 | 状态 |
|---|---|
| [Bigtable 分布式结构化存储](/study/papers/bigtable/) | 状元篇 |
| [Boehm-Weiser 保守式垃圾回收](/study/papers/boehm-gc/) | 状元篇 |
| [eBPF (McCanne-Jacobson 1993 + Starovoitov 2014) — userspace 写程序，kernel 安全跑](/study/papers/ebpf/) | 状元篇 |
| [GFS — workload reverse-defines the file system：single master + 64MB chunk + relaxed consistency 的工程胜利](/study/papers/gfs/) | 状元篇 |
| [io_uring (Axboe 2019) — Linux 异步 IO 的双 ring 共享内存模型](/study/papers/io-uring/) | 状元篇 |
| [MapReduce (Dean & Ghemawat 2004) — 限制表达力换可扩展性](/study/papers/mapreduce/) | 状元篇 |
| [Paxos 异步分布式共识](/study/papers/paxos/) | 状元篇 |
| [Raft 可理解的共识算法](/study/papers/raft/) | 状元篇 |
| [Spanner 全球分布式数据库](/study/papers/spanner/) | 状元篇 |

#### theory-D 混 B 经验论文

| 标题 | 状态 |
|---|---|
| [Chubby 分布式锁服务](/study/papers/chubby/) | 状元篇 |

---

## 全部 110 篇（字母序）

| Slug | 标题 |
|---|---|
| `3d-gaussian-splatting` | [3D Gaussian Splatting — explicit primitives 把 NeRF 从 12 小时训练 0.1 FPS 拉到 5 分钟训练 100+ FPS](/study/papers/3d-gaussian-splatting/) |
| `activation-patching` | [Activation Patching - 把因果手术刀塞进 Transformer](/study/papers/activation-patching/) |
| `adapton` | [Adapton (Hammer et al. 2014) — 增量计算的工程化简化](/study/papers/adapton/) |
| `agentless` | [Agentless — 反 agent 派代表作：3 阶段 pipeline 在 SWE-bench 上反超复杂 agent](/study/papers/agentless/) |
| `alphago` | [AlphaGo Mastering Go with Deep Neural Networks](/study/papers/alphago/) |
| `anthropic-circuits` | [A Mathematical Framework for Transformer Circuits (Elhage+ 2021) — 把 attention head 拆成 QK + OV 两条电路](/study/papers/anthropic-circuits/) |
| `attention` | [Transformer Attention Is All You Need](/study/papers/attention/) |
| `aurora` | [Aurora (Verbitski et al. 2017) — 把数据库的下半身换成日志机](/study/papers/aurora/) |
| `autogen` | [AutoGen — Enabling Next-Gen LLM Applications via Multi-Agent Conversation](/study/papers/autogen/) |
| `bert` | [BERT 双向 Transformer 预训练](/study/papers/bert/) |
| `bidirectional-typing` | [Bidirectional Typing (Dunfield & Krishnaswami CSUR 2021) — TS/Rust/Swift 类型推断的工程基础](/study/papers/bidirectional-typing/) |
| `bigtable` | [Bigtable 分布式结构化存储](/study/papers/bigtable/) |
| `boehm-gc` | [Boehm-Weiser 保守式垃圾回收](/study/papers/boehm-gc/) |
| `calvin` | [Calvin (Thomson et al. 2012) — 不要时钟，要 sequencer，全球事务的另一条路](/study/papers/calvin/) |
| `causal-abstraction` | [Causal Abstraction × DAS — 神经网络的因果抽象与对齐搜索](/study/papers/causal-abstraction/) |
| `cheney-gc` | [A Nonrecursive List Compacting Algorithm（Cheney 1970，Copying GC 始祖）](/study/papers/cheney-gc/) |
| `chinchilla` | [Chinchilla — 70B 训 1.4T tokens 打败 280B Gopher，把 Kaplan 的 compute-optimal 公式推翻一半](/study/papers/chinchilla/) |
| `chubby` | [Chubby 分布式锁服务](/study/papers/chubby/) |
| `ci-effects` | [CI Effects (Ståhl & Bosch 2014) — 持续集成的真实成本与收益](/study/papers/ci-effects/) |
| `clickhouse` | [ClickHouse Lightning Fast Analytics 状元篇](/study/papers/clickhouse/) |
| `clip` | [CLIP 视觉-语言对比预训练](/study/papers/clip/) |
| `cognitive-load-theory` | [Cognitive Load Theory (Sweller 1988) — 工作记忆 7±2 决定的学习设计法则](/study/papers/cognitive-load-theory/) |
| `compiler-errors` | [Do Developers Read Compiler Error Messages? — 眼动追踪给"用户不读你的报错"提供量化证据](/study/papers/compiler-errors/) |
| `constitutional-ai` | [Constitutional AI — 让 AI 看着一组原则给自己挑刺：Claude 的训练骨架](/study/papers/constitutional-ai/) |
| `copilot-rct` | [Copilot RCT (Peng et al. 2023) — AI 编码辅助第一篇严肃 RCT](/study/papers/copilot-rct/) |
| `cot` | [Chain-of-Thought Prompting (Wei et al. 2022) — reasoning trace 是涌现能力的钥匙](/study/papers/cot/) |
| `crdt-json` | [A Conflict-Free Replicated JSON Datatype (Kleppmann & Beresford 2017) — 把整棵 JSON 树变成可合并的 CRDT](/study/papers/crdt-json/) |
| `dalle-2` | [DALL-E 2 / unCLIP 文本到图像生成](/study/papers/dalle-2/) |
| `ddpm` | [DDPM Denoising Diffusion Probabilistic Models](/study/papers/ddpm/) |
| `debugging-dichotomy` | [Debugging Dichotomy (Beller 2018) — 458 程序员 18 个月真实 debug 行为，65% 会话不到 1 分钟](/study/papers/debugging-dichotomy/) |
| `deepseek-r1` | [DeepSeek-R1 状元篇 — 纯 RL 让 LLM 自己学会推理](/study/papers/deepseek-r1/) |
| `deepspeed-zero` | [ZeRO - Memory Optimizations Toward Training Trillion Parameter Models](/study/papers/deepspeed-zero/) |
| `dino` | [DINO 自监督视觉 transformer](/study/papers/dino/) |
| `dit` | [DiT Diffusion Transformer](/study/papers/dit/) |
| `dns` | [DNS Domain Name System](/study/papers/dns/) |
| `dpo` | [DPO Direct Preference Optimization](/study/papers/dpo/) |
| `dqn` | [DQN Deep Q-Network 深度强化学习](/study/papers/dqn/) |
| `dynamo` | [Dynamo (DeCandia et al. 2007) — NoSQL 的源头与 CAP 的 AP 路线](/study/papers/dynamo/) |
| `ebpf` | [eBPF (McCanne-Jacobson 1993 + Starovoitov 2014) — userspace 写程序，kernel 安全跑](/study/papers/ebpf/) |
| `effect-handlers` | [Algebraic Effects (Plotkin & Pretnar ESOP 2009) — async/await、try-catch、generator 的统一抽象](/study/papers/effect-handlers/) |
| `flash-attention` | [FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness](/study/papers/flash-attention/) |
| `foundationdb` | [FoundationDB (Zhou et al. 2021) — Unbundled 分布式 KV + Sim2 确定性仿真：用 10 年 CI 把 bug 烧在设计期](/study/papers/foundationdb/) |
| `fsrs-spaced-repetition` | [FSRS (Ye 2022+) — 把 1885 年的遗忘曲线变成 17 个可训练参数](/study/papers/fsrs-spaced-repetition/) |
| `generational-gc` | [Generational Garbage Collection — 分代假设与跨代引用追踪](/study/papers/generational-gc/) |
| `gfs` | [GFS — workload reverse-defines the file system：single master + 64MB chunk + relaxed consistency 的工程胜利](/study/papers/gfs/) |
| `gpt-3` | [GPT-3 Language Models are Few-Shot Learners](/study/papers/gpt-3/) |
| `graphrag` | [GraphRAG (Microsoft 2024) — 用 LLM 把语料抽成 entity/relation 图 + Leiden community detection 分簇 + 每簇 summary，让 RAG 第一次能回答 global / multi-hop 问题](/study/papers/graphrag/) |
| `great-swe` | [What Makes a Great Software Engineer? (Li et al. 2015) — 个人特质 > 技术技能](/study/papers/great-swe/) |
| `hindley-milner` | [Hindley-Milner (Damas & Milner POPL 1982) — 编译器自己推类型的祖宗算法](/study/papers/hindley-milner/) |
| `http-2` | [HTTP/2 — Hypertext Transfer Protocol Version 2](/study/papers/http-2/) |
| `induction-heads` | [In-Context Learning and Induction Heads (Olsson+ 2022) — 把 ICL 钉在 induction head 因果上的六条证据](/study/papers/induction-heads/) |
| `instructgpt` | [InstructGPT — ChatGPT 的官方蓝图：把 RLHF 套到 GPT-3 上的三阶段流水线](/study/papers/instructgpt/) |
| `io-uring` | [io_uring (Axboe 2019) — Linux 异步 IO 的双 ring 共享内存模型](/study/papers/io-uring/) |
| `kafka` | [Kafka (Kreps et al. 2011) — 把消息系统重写成只追加的日志文件](/study/papers/kafka/) |
| `lamport-1978` | [Time, Clocks (Lamport 1978) — 分布式系统中没有"绝对的同时"](/study/papers/lamport-1978/) |
| `linear-types` | [Linear Types Can Change the World (Wadler 1990) — Rust 所有权 30 年前的祖宗](/study/papers/linear-types/) |
| `llama` | [LLaMA — Chinchilla 实证落地版：7B 训 1T tokens，开放权重点燃 2023 开源 LLM 生态](/study/papers/llama/) |
| `llava` | [LLaVA Visual Instruction Tuning](/study/papers/llava/) |
| `mae` | [MAE Masked Autoencoder 视觉自监督](/study/papers/mae/) |
| `mamba` | [Mamba - Linear-Time Sequence Modeling with Selective State Spaces](/study/papers/mamba/) |
| `mapreduce` | [MapReduce (Dean & Ghemawat 2004) — 限制表达力换可扩展性](/study/papers/mapreduce/) |
| `megatron-lm` | [Megatron-LM 张量并行如何把单卡放不下的大模型切到多卡](/study/papers/megatron-lm/) |
| `metagpt` | [MetaGPT — SOP 驱动的多 agent 软件公司框架](/study/papers/metagpt/) |
| `mixture-of-experts` | [Mixture of Experts 状元篇 — 从 dense scaling 到 sparse routing](/study/papers/mixture-of-experts/) |
| `muzero` | [MuZero Mastering Games by Planning with Learned Model](/study/papers/muzero/) |
| `openhands` | [OpenHands — 开源 generalist coding agent 平台：把 SWE-agent 的 ACI 工业化、多 agent 化、可扩展化](/study/papers/openhands/) |
| `pair-programming` | [Pair Programming Meta-Analysis (Hannay et al. 2009) — 双倍人力换 1.2 倍质量](/study/papers/pair-programming/) |
| `paxos` | [Paxos 异步分布式共识](/study/papers/paxos/) |
| `ppo` | [PPO Proximal Policy Optimization](/study/papers/ppo/) |
| `program-comprehension-fmri` | [Understanding Program Comprehension with fMRI — 程序理解像语言而非数学的首个脑成像证据](/study/papers/program-comprehension-fmri/) |
| `programmer-interruption` | [Programmer Interruption (Parnin & Rugaber 2009) — 给"程序员被打断"提供第一份量化资源损耗证据](/study/papers/programmer-interruption/) |
| `push-pull-frp` | [Push-Pull FRP (Elliott 2009) — events 推 + signals 拉的二元模型](/study/papers/push-pull-frp/) |
| `quic` | [QUIC UDP-Based Multiplexed Secure Transport](/study/papers/quic/) |
| `raft` | [Raft 可理解的共识算法](/study/papers/raft/) |
| `rag-lewis-2020` | [RAG (NeurIPS 2020) — 把 differentiable retriever 和 seq2seq generator 联训成一个端到端模型，让生成式 AI 第一次能引用外部知识](/study/papers/rag-lewis-2020/) |
| `react` | [ReAct — agent loop 的祖宗：think × act 的最小可执行三元组](/study/papers/react/) |
| `realm` | [REALM (Guu et al. ICML 2020) — 把 retriever 塞进 MLM pretrain 的第一篇论文](/study/papers/realm/) |
| `reflexion` | [Reflexion (Shinn et al. 2023) — verbal RL：用文字代替梯度让 agent 学习](/study/papers/reflexion/) |
| `resnet` | [ResNet 深度残差学习](/study/papers/resnet/) |
| `retro` | [RETRO (DeepMind ICML 2022) — 用 2T tokens 外部数据库 + chunked cross-attention 让 7.5B 模型媲美 175B Gopher，把检索抬成与参数并列的第二个 LLM 缩放轴](/study/papers/retro/) |
| `rlhf-christiano` | [RLHF — 用人比较两条轨迹学奖励：ChatGPT/Claude 的奠基论文](/study/papers/rlhf-christiano/) |
| `rocksdb-lsm` | [LSM-tree 与 RocksDB 状元篇](/study/papers/rocksdb-lsm/) |
| `salsa-adapton` | [Salsa-Adapton 工业演化 — 把增量计算变成 IDE 后端](/study/papers/salsa-adapton/) |
| `sam` | [SAM — 把分割做成可 prompt 的基础模型，image encoder 一次、prompt 解码 N 次](/study/papers/sam/) |
| `scaling-laws` | [Scaling Laws — 把 LLM 的 loss 写成参数 N、数据 D、计算 C 的三参数 power law](/study/papers/scaling-laws/) |
| `self-adjusting` | [Adaptive Functional Programming (Acar et al. 2002) — 现代细粒度响应式的祖宗](/study/papers/self-adjusting/) |
| `selinger-1979` | [Selinger 1979 — 把可见的执行计划装进每一台 SQL 数据库](/study/papers/selinger-1979/) |
| `sillito-questions` | [Sillito Questions (TSE 2008) — 程序员做修改任务时问的 44 个问题分类](/study/papers/sillito-questions/) |
| `sleeper-agents` | [Sleeper Agents — 故意训出来的 LLM 卧底，证明安全训练可能"清不掉"已学会的欺骗](/study/papers/sleeper-agents/) |
| `snowflake` | [The Snowflake Elastic Data Warehouse 状元篇](/study/papers/snowflake/) |
| `spanner` | [Spanner 全球分布式数据库](/study/papers/spanner/) |
| `sparse-autoencoders` | [Sparse Autoencoders 把 superposition 解出来的那把扳手](/study/papers/sparse-autoencoders/) |
| `stable-diffusion` | [Stable Diffusion / LDM — 把扩散从像素搬到 latent 空间，让消费级 GPU 也能跑文生图](/study/papers/stable-diffusion/) |
| `swe-agent` | [SWE-agent — 不靠模型变聪明、靠"接口"变聪明：ACI 把 SWE-bench 1.96% 推到 12.5%](/study/papers/swe-agent/) |
| `swe-bench` | [SWE-bench (Jimenez et al. 2024) — 把 LLM 评测从 demo 题推到真实 GitHub issue](/study/papers/swe-bench/) |
| `t5` | [T5 Text-to-Text Transfer Transformer](/study/papers/t5/) |
| `tcp` | [TCP Transmission Control Protocol](/study/papers/tcp/) |
| `tigerbeetle` | [TigerBeetle (Joran Greef et al. 2024) — 金融级 OLTP，固定 schema + VSR + deterministic simulation](/study/papers/tigerbeetle/) |
| `tls-1.3` | [TLS 1.3 The Transport Layer Security Protocol Version 1.3](/study/papers/tls-1.3/) |
| `tofte-talpin-regions` | [Tofte-Talpin Region-Based Memory Management](/study/papers/tofte-talpin-regions/) |
| `toolformer` | [Toolformer (Schick et al. 2023) — LM 自己教自己用工具](/study/papers/toolformer/) |
| `toy-models-superposition` | [Toy Models of Superposition (Elhage+ 2022) — 把 features-as-directions 钉在 capacity 数学上的 13 节论证](/study/papers/toy-models-superposition/) |
| `trees-that-grow` | [Trees that Grow (Najd & Peyton Jones 2017) — AST 类型如何在多 phase 复用](/study/papers/trees-that-grow/) |
| `vit` | [ViT 视觉变换器](/study/papers/vit/) |
| `vllm` | [vLLM - Efficient Memory Management for LLM Serving with PagedAttention](/study/papers/vllm/) |
| `volcano` | [Volcano 1990 — 把 SQL 执行写成 next() 拉式数据流](/study/papers/volcano/) |
| `voyager` | [Voyager — 让 LLM agent 在 Minecraft 里"越玩越强"：自动课程 + 技能库 + 错误反馈循环](/study/papers/voyager/) |
| `wadler-prettier` | [A Prettier Printer (Wadler 1998) — 一个代数定义一代 formatter](/study/papers/wadler-prettier/) |
| `word2vec` | [Word2Vec 词向量分布式表示](/study/papers/word2vec/) |
| `zgc` | [ZGC — 染色指针 + 读屏障下的 TB 级低延迟并发 GC](/study/papers/zgc/) |
