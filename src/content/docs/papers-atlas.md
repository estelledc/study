---
title: 论文全景索引
description: 136 篇论文 · 按主题分类 · 自动从 frontmatter 生成
sidebar:
  order: 5
  label: 论文全景索引
---

> 本页由 `scripts/regen-atlas.mjs` 自动生成（每次 build 前重跑）。
> 调整分类：编辑脚本里的 `THEMES_PAPERS` 字典。

## 总览

- **总数**：136 篇
- **已分类**：136

### 按主题分布

| 主题 | 数量 |
|---|---:|
| [智能体与 LLM 系统](#智能体与-llm-系统) | 15 |
| [NLP 基础与 Scaling](#nlp-基础与-scaling) | 11 |
| [计算机视觉](#计算机视觉) | 7 |
| [生成模型 / 扩散](#生成模型---扩散) | 5 |
| [强化学习](#强化学习) | 6 |
| [AI 安全与可解释性](#ai-安全与可解释性) | 8 |
| [分布式系统](#分布式系统) | 5 |
| [数据库](#数据库) | 12 |
| [分布式训练 / GPU](#分布式训练---gpu) | 4 |
| [网络协议](#网络协议) | 5 |
| [OS / 集群管理 / 系统](#os---集群管理---系统) | 5 |
| [GC / 内存管理](#gc---内存管理) | 5 |
| [编译器 / 编程语言理论](#编译器---编程语言理论) | 23 |
| [计算理论 / 数学基础](#计算理论---数学基础) | 5 |
| [信息论 / 编码理论](#信息论---编码理论) | 5 |
| [密码学 / 安全](#密码学---安全) | 5 |
| [HCI / 软件工程研究](#hci---软件工程研究) | 10 |

---

## 智能体与 LLM 系统

共 15 篇。

| 论文 | 描述 |
|---|---|
| [Agentless — 反 agent 派代表作：3 阶段 pipeline 在 SWE-bench 上反超复杂 agent](/study/papers/agentless/) | Xia 等人 2024 年的反命题论文——把 agent loop 拆掉，用 file-localize / function-localize / patch-validate 三段流水线在 SWE-bench Li… |
| [AutoGen — Enabling Next-Gen LLM Applications via Multi-Agent Conversation](/study/papers/autogen/) | ConversableAgent + GroupChatManager 把多 agent 协作抽象成可编排的对话，奠定 2024 年 multi-agent framework 范式 |
| [Chain-of-Thought Prompting (Wei et al. 2022) — reasoning trace 是涌现能力的钥匙](/study/papers/cot/) | 8 个 few-shot 例子加上一段"想一下"的中间过程，让 540B 模型 GSM8K 从 18% 跳到 57% |
| [GraphRAG (Microsoft 2024) — 用 LLM 把语料抽成 entity/relation 图 + Leiden community detection 分簇 + 每簇 summary，让 RAG 第一次能回答 global / multi-hop 问题](/study/papers/graphrag/) | Edge et al |
| [InstructGPT — ChatGPT 的官方蓝图：把 RLHF 套到 GPT-3 上的三阶段流水线](/study/papers/instructgpt/) | SFT 13k demo + RM 33k 排序 + PPO with KL anchor |
| [MetaGPT — SOP 驱动的多 agent 软件公司框架](/study/papers/metagpt/) | 把人类软件公司的标准作业流程（SOP）写进 multi-agent 系统：每个 agent 是一个角色（PM / Architect / Engineer / QA），用强结构化文档传递信息，把自由对话的随机性收敛为可… |
| [OpenHands — 开源 generalist coding agent 平台：把 SWE-agent 的 ACI 工业化、多 agent 化、可扩展化](/study/papers/openhands/) | Wang 等人 2024 年从 OpenDevin 改名而来的开源平台论文 |
| [RAG (NeurIPS 2020) — 把 differentiable retriever 和 seq2seq generator 联训成一个端到端模型，让生成式 AI 第一次能引用外部知识](/study/papers/rag-lewis-2020/) | Lewis et al |
| [ReAct — agent loop 的祖宗：think × act 的最小可执行三元组](/study/papers/react/) | 把 reasoning 和 acting 显式交织 |
| [Reflexion (Shinn et al. 2023) — verbal RL：用文字代替梯度让 agent 学习](/study/papers/reflexion/) | ReAct 没法 retry 的硬伤怎么补——加一个 self-reflection 模型把失败 trajectory 翻译成自然语言反思塞进下一轮 prompt |
| [RETRO (DeepMind ICML 2022) — 用 2T tokens 外部数据库 + chunked cross-attention 让 7.5B 模型媲美 175B Gopher，把检索抬成与参数并列的第二个 LLM 缩放轴](/study/papers/retro/) | Borgeaud et al |
| [SWE-agent — 不靠模型变聪明、靠"接口"变聪明：ACI 把 SWE-bench 1.96% 推到 12.5%](/study/papers/swe-agent/) | Agent 能不能修真实 GitHub issue，瓶颈不在 LLM 智力，而在它跟"电脑"之间的接口 |
| [SWE-bench (Jimenez et al. 2024) — 把 LLM 评测从 demo 题推到真实 GitHub issue](/study/papers/swe-bench/) | 2294 个真实 GitHub issue + automated harness + Claude 2 baseline 1 |
| [Toolformer (Schick et al. 2023) — LM 自己教自己用工具](/study/papers/toolformer/) | ReAct/Reflexion 走 prompt-only，Toolformer 走 self-supervised fine-tune——同一目标的另一条工程化路线 |
| [Voyager — 让 LLM agent 在 Minecraft 里"越玩越强"：自动课程 + 技能库 + 错误反馈循环](/study/papers/voyager/) | Agent 真正学习的早期范例 |

## NLP 基础与 Scaling

共 11 篇。

| 论文 | 描述 |
|---|---|
| [Transformer Attention Is All You Need](/study/papers/attention/) |  |
| [BERT 双向 Transformer 预训练](/study/papers/bert/) |  |
| [Chinchilla — 70B 训 1.4T tokens 打败 280B Gopher，把 Kaplan 的 compute-optimal 公式推翻一半](/study/papers/chinchilla/) | Hoffmann 2022 用三种独立 estimation method 重做 ~400 个训练 run，得出 N 与 D 应 1:1 同步增长（D ≈ 20×N），改写 LLaMA / Llama 2 / Deep… |
| [DeepSeek-R1 状元篇 — 纯 RL 让 LLM 自己学会推理](/study/papers/deepseek-r1/) | DeepSeek-R1 用 GRPO + rule-based reward 跳过 SFT 阶段，让 base model 在纯强化学习下涌现长 chain-of-thought 与自我反思，开源对齐 OpenAI o… |
| [GPT-3 Language Models are Few-Shot Learners](/study/papers/gpt-3/) |  |
| [LLaMA — Chinchilla 实证落地版：7B 训 1T tokens，开放权重点燃 2023 开源 LLM 生态](/study/papers/llama/) | Touvron 2023 用 RMSNorm + SwiGLU + RoPE + 公开数据 + 故意 over-train，把 Chinchilla M2 的 D=20N 推到 D≈140N，证明"小模型 + 多数据"… |
| [Mamba - Linear-Time Sequence Modeling with Selective State Spaces](/study/papers/mamba/) | 状元篇 - Mamba 用 input-dependent SSM (S6) 替代 attention，训练用硬件感知的 parallel scan、推理时常数空间，长序列上比 Transformer 快 5-100x… |
| [Mixture of Experts 状元篇 — 从 dense scaling 到 sparse routing](/study/papers/mixture-of-experts/) | MoE 是 Switch Transformer + Mixtral 双论文驱动的 sparse 架构范式，把模型总参数 N 与 active 参数解耦，使万亿规模成为可能 |
| [Scaling Laws — 把 LLM 的 loss 写成参数 N、数据 D、计算 C 的三参数 power law](/study/papers/scaling-laws/) | Kaplan 2020 用横跨 7 个数量级的 OpenAI 训练数据拟合出 L = (Nc/N)^α + (Dc/D)^β 的简单 power law |
| [T5 Text-to-Text Transfer Transformer](/study/papers/t5/) |  |
| [Word2Vec 词向量分布式表示](/study/papers/word2vec/) |  |

## 计算机视觉

共 7 篇。

| 论文 | 描述 |
|---|---|
| [3D Gaussian Splatting — explicit primitives 把 NeRF 从 12 小时训练 0.1 FPS 拉到 5 分钟训练 100+ FPS](/study/papers/3d-gaussian-splatting/) | 用 3D 各向异性高斯（mean / 协方差 / SH / opacity）取代 NeRF 的 implicit MLP |
| [CLIP 视觉-语言对比预训练](/study/papers/clip/) |  |
| [DINO 自监督视觉 transformer](/study/papers/dino/) |  |
| [MAE Masked Autoencoder 视觉自监督](/study/papers/mae/) |  |
| [ResNet 深度残差学习](/study/papers/resnet/) |  |
| [SAM — 把分割做成可 prompt 的基础模型，image encoder 一次、prompt 解码 N 次](/study/papers/sam/) | ViT-H 主干 + 三模态 prompt encoder + 极轻量 mask decoder |
| [ViT 视觉变换器](/study/papers/vit/) |  |

## 生成模型 / 扩散

共 5 篇。

| 论文 | 描述 |
|---|---|
| [DALL-E 2 / unCLIP 文本到图像生成](/study/papers/dalle-2/) |  |
| [DDPM Denoising Diffusion Probabilistic Models](/study/papers/ddpm/) |  |
| [DiT Diffusion Transformer](/study/papers/dit/) |  |
| [LLaVA Visual Instruction Tuning](/study/papers/llava/) | 用一个小小的投影矩阵把 CLIP 视觉特征接到 LLaMA 的 token 空间，再用纯文本的 GPT-4 凭 caption + bbox 想象出 158K 条多模态指令数据，两阶段训练，做出第一个开源的视觉指令助手 |
| [Stable Diffusion / LDM — 把扩散从像素搬到 latent 空间，让消费级 GPU 也能跑文生图](/study/papers/stable-diffusion/) | VAE 编码到 64×64 latent，diffusion 在 latent 空间训练与采样，cross-attention 注入文本条件——一篇 CVPR 2022 论文 + 一次 RunwayML 权重放出，把 … |

## 强化学习

共 6 篇。

| 论文 | 描述 |
|---|---|
| [AlphaGo Mastering Go with Deep Neural Networks](/study/papers/alphago/) |  |
| [DPO Direct Preference Optimization](/study/papers/dpo/) |  |
| [DQN Deep Q-Network 深度强化学习](/study/papers/dqn/) |  |
| [MuZero Mastering Games by Planning with Learned Model](/study/papers/muzero/) |  |
| [PPO Proximal Policy Optimization](/study/papers/ppo/) |  |
| [RLHF — 用人比较两条轨迹学奖励：ChatGPT/Claude 的奠基论文](/study/papers/rlhf-christiano/) | 不写 reward function，让人对 trajectory pair 投票 |

## AI 安全与可解释性

共 8 篇。

| 论文 | 描述 |
|---|---|
| [Activation Patching - 把因果手术刀塞进 Transformer](/study/papers/activation-patching/) | Wang et al |
| [A Mathematical Framework for Transformer Circuits (Elhage+ 2021) — 把 attention head 拆成 QK + OV 两条电路](/study/papers/anthropic-circuits/) | residual stream 当公共总线 + 单 head = QK · OV 两个低秩电路 + 2-layer 模型解释 induction head 的两路径机制 |
| [Causal Abstraction × DAS — 神经网络的因果抽象与对齐搜索](/study/papers/causal-abstraction/) | Geiger 2021 把 Pearl 因果模型套到 NN 内部 + DAS 2024 用旋转矩阵学分布式对齐——不必 sparse / mono 的另一条 mech interp 路线 |
| [Constitutional AI — 让 AI 看着一组原则给自己挑刺：Claude 的训练骨架](/study/papers/constitutional-ai/) | 用 16 条自然语言 principle 让 LM critique + revise 自己的回答，再用 AI 的偏好替代人去训 reward model — RLAIF 的奠基论文，Anthropic Claude … |
| [In-Context Learning and Induction Heads (Olsson+ 2022) — 把 ICL 钉在 induction head 因果上的六条证据](/study/papers/induction-heads/) | 2-head circuit prefix-match × copy 是 ICL 的最小机器 |
| [Sleeper Agents — 故意训出来的 LLM 卧底，证明安全训练可能"清不掉"已学会的欺骗](/study/papers/sleeper-agents/) | Anthropic 实验把 backdoor 灌进 LLM，然后用 SFT/RLHF/对抗训练去清除——结果是 backdoor 在 13B+ 模型上 95%+ 存活，CoT 变体甚至学会更隐蔽 |
| [Sparse Autoencoders 把 superposition 解出来的那把扳手](/study/papers/sparse-autoencoders/) | Cunningham 2023 与 Bricken 2023 双论文精读：从 toy models 的玩具实验到工业级特征解码器 |
| [Toy Models of Superposition (Elhage+ 2022) — 把 features-as-directions 钉在 capacity 数学上的 13 节论证](/study/papers/toy-models-superposition/) | features ≠ neurons 的根本原因是网络在用干涉模式压缩 features —— Toy Models 给 SAE 派提供了"superposition 的逆问题"理论根 |

## 分布式系统

共 5 篇。

| 论文 | 描述 |
|---|---|
| [Chubby 分布式锁服务](/study/papers/chubby/) |  |
| [Time, Clocks (Lamport 1978) — 分布式系统中没有"绝对的同时"](/study/papers/lamport-1978/) | 用 happens-before partial order 替代物理时间 |
| [Paxos 异步分布式共识](/study/papers/paxos/) |  |
| [Raft 可理解的共识算法](/study/papers/raft/) |  |
| [Spanner 全球分布式数据库](/study/papers/spanner/) |  |

## 数据库

共 12 篇。

| 论文 | 描述 |
|---|---|
| [Aurora (Verbitski et al. 2017) — 把数据库的下半身换成日志机](/study/papers/aurora/) | 第一个把 redo log 推到存储层、让存储自己重放并版本化页面的云原生关系数据库 |
| [Bigtable 分布式结构化存储](/study/papers/bigtable/) |  |
| [Calvin (Thomson et al. 2012) — 不要时钟，要 sequencer，全球事务的另一条路](/study/papers/calvin/) | 用全局排序日志替代 2PC 与 commit-wait——Spanner 同期对手，把分布式事务 reduce 到「先排序后执行」的两段式 |
| [ClickHouse Lightning Fast Analytics 状元篇](/study/papers/clickhouse/) | VLDB 2024 ClickHouse 论文精读 — 列存 + vectorized + MergeTree 如何把 OLAP 推到极致 |
| [Dynamo (DeCandia et al. 2007) — NoSQL 的源头与 CAP 的 AP 路线](/study/papers/dynamo/) | Amazon 购物车的 always writable 承诺如何驱动了一代 NoSQL 设计——consistent hashing + vector clocks + sloppy quorum + hinted h… |
| [FoundationDB (Zhou et al. 2021) — Unbundled 分布式 KV + Sim2 确定性仿真：用 10 年 CI 把 bug 烧在设计期](/study/papers/foundationdb/) | 不是又一个 NewSQL |
| [Kafka (Kreps et al. 2011) — 把消息系统重写成只追加的日志文件](/study/papers/kafka/) | 第一个把 broker 当 append-only file、把 offset 当消费者状态而不是服务器状态、把 page cache + sendfile 当吞吐杠杆的消息系统 |
| [LSM-tree 与 RocksDB 状元篇](/study/papers/rocksdb-lsm/) | O'Neil 1996 LSM-tree 原始论文 + Facebook RocksDB 2014/2017 工程论文综合精读 — 顺序写 + 后台 merge 如何取代原地更新 |
| [Selinger 1979 — 把可见的执行计划装进每一台 SQL 数据库](/study/papers/selinger-1979/) | System R cost-based optimizer 奠定 SQL 数据库范式 — DP 枚举 join order、统计直方图估 cost、interesting orders 剪枝 |
| [The Snowflake Elastic Data Warehouse 状元篇](/study/papers/snowflake/) | SIGMOD 2016 Snowflake 论文精读 — 存算分离 + 弹性虚拟仓库如何重塑云数仓范式 |
| [TigerBeetle (Joran Greef et al. 2024) — 金融级 OLTP，固定 schema + VSR + deterministic simulation](/study/papers/tigerbeetle/) | 不是通用数据库，是为金融双本记账写死的状态机 |
| [Volcano 1990 — 把 SQL 执行写成 next() 拉式数据流](/study/papers/volcano/) | Graefe 1990 用 Open / GetNext / Close 三函数 + Exchange 算子定义"算子=迭代器"范式，36 年里几乎所有 SQL 数据库（Postgres / Oracle / Spar… |

## 分布式训练 / GPU

共 4 篇。

| 论文 | 描述 |
|---|---|
| [ZeRO - Memory Optimizations Toward Training Trillion Parameter Models](/study/papers/deepspeed-zero/) | 状元篇 - DeepSpeed ZeRO 通过分区 Optimizer State / Gradient / Parameter 把内存占用从 N 倍复制降到 1/N，让单 cluster 训出万亿参数模型 |
| [FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness](/study/papers/flash-attention/) | 状元篇 - FlashAttention 用 tiling + recomputation 把 attention 在 SRAM 里 fuse 成单一 kernel，避免 N×N 矩阵物化，让显存从二次降为线性，2-4… |
| [Megatron-LM 张量并行如何把单卡放不下的大模型切到多卡](/study/papers/megatron-lm/) | 用矩阵分块的小学算术把 Transformer 的 Linear 层横切纵切，让 8B+ 参数在 8 张 V100 上并行训练，是 GPT-3 / LLaMA / DeepSeek 之前所有大模型训练栈的共同地基 |
| [vLLM - Efficient Memory Management for LLM Serving with PagedAttention](/study/papers/vllm/) | 状元篇 - vLLM 把操作系统分页思想搬进 KV cache 管理，固定大小 block + 间接寻址 + 引用计数共享，让显存利用率从 60-80% 跳到 96%，吞吐 2-4x，是 LLM 推理的标准方案 |

## 网络协议

共 5 篇。

| 论文 | 描述 |
|---|---|
| [DNS Domain Name System](/study/papers/dns/) |  |
| [HTTP/2 — Hypertext Transfer Protocol Version 2](/study/papers/http-2/) |  |
| [QUIC UDP-Based Multiplexed Secure Transport](/study/papers/quic/) |  |
| [TCP Transmission Control Protocol](/study/papers/tcp/) |  |
| [TLS 1.3 The Transport Layer Security Protocol Version 1.3](/study/papers/tls-1.3/) |  |

## OS / 集群管理 / 系统

共 5 篇。

| 论文 | 描述 |
|---|---|
| [Borg 大规模集群管理](/study/papers/borg/) |  |
| [eBPF (McCanne-Jacobson 1993 + Starovoitov 2014) — userspace 写程序，kernel 安全跑](/study/papers/ebpf/) | 1993 cBPF 起源 + 2014 Starovoitov 把它扩成内核通用扩展机制 |
| [GFS — workload reverse-defines the file system：single master + 64MB chunk + relaxed consistency 的工程胜利](/study/papers/gfs/) | Google 不为通用工作负载设计存储——他们观察到大文件 / append-mostly / 节点常态故障，倒推 POSIX 该砍什么 |
| [io_uring (Axboe 2019) — Linux 异步 IO 的双 ring 共享内存模型](/study/papers/io-uring/) | Jens Axboe 2019 在 Linux 5 |
| [MapReduce (Dean & Ghemawat 2004) — 限制表达力换可扩展性](/study/papers/mapreduce/) | 用户只写 map + reduce 两个函数，框架自动 parallelize / distribute / fault-tolerate |

## GC / 内存管理

共 5 篇。

| 论文 | 描述 |
|---|---|
| [Boehm-Weiser 保守式垃圾回收](/study/papers/boehm-gc/) |  |
| [A Nonrecursive List Compacting Algorithm（Cheney 1970，Copying GC 始祖）](/study/papers/cheney-gc/) | 状元篇 - Cheney 1970 用两片 semi-space 加 BFS scan 实现 copying GC，把递归 mark-and-sweep 换成迭代式 copy + forwarding pointer，… |
| [Generational Garbage Collection — 分代假设与跨代引用追踪](/study/papers/generational-gc/) | Lieberman & Hewitt 1983 — 利用对象寿命分布的偏斜，把全堆扫描降为新生代局部扫描 |
| [Tofte-Talpin Region-Based Memory Management](/study/papers/tofte-talpin-regions/) |  |
| [ZGC — 染色指针 + 读屏障下的 TB 级低延迟并发 GC](/study/papers/zgc/) | Per Liden et al |

## 编译器 / 编程语言理论

共 23 篇。

| 论文 | 描述 |
|---|---|
| [Adapton (Hammer et al. 2014) — 增量计算的工程化简化](/study/papers/adapton/) | 把 Self-Adjusting Computation 从学术原型推到生产工程——lazy demand-driven 替代 eager push |
| [Algol 60 — BNF / 块结构 / call-by-name 的诞生地](/study/papers/algol-60/) | 形式化语法描述、块结构、call-by-name、递归过程：现代编程语言的共同祖先 |
| [Bidirectional Typing (Dunfield & Krishnaswami CSUR 2021) — TS/Rust/Swift 类型推断的工程基础](/study/papers/bidirectional-typing/) | check ⇐ vs infer ⇒ 双判断 + 局部标注 + 互相递归 |
| [CI Effects (Ståhl & Bosch 2014) — 持续集成的真实成本与收益](/study/papers/ci-effects/) | 22 项研究系统综述 |
| [Do Developers Read Compiler Error Messages? — 眼动追踪给"用户不读你的报错"提供量化证据](/study/papers/compiler-errors/) | Barik 2017 用 Tobii X120 + 56 名学生证明 CEM 区域只占 30% 注视时间，长报错被跳过更多——这是 Rust / Elm / Svelte error UX 革命的实证根 |
| [A Conflict-Free Replicated JSON Datatype (Kleppmann & Beresford 2017) — 把整棵 JSON 树变成可合并的 CRDT](/study/papers/crdt-json/) | 第一篇把 CRDT 从平坦寄存器扩到嵌套 map+list 任意嵌套结构的论文 |
| [Algebraic Effects (Plotkin & Pretnar ESOP 2009) — async/await、try-catch、generator 的统一抽象](/study/papers/effect-handlers/) | operation signature + handler clause + resume/abort 控制流 |
| [Hindley-Milner — 让编译器自己推类型的祖宗算法（POPL 1982）](/study/papers/hindley-milner/) | Damas & Milner POPL 1982 — 把 Robinson unification + prenex 多态 + let-polymorphism 锁进算法 W，用形式系统证明每个可类型化表达式存在唯一最… |
| [Linear Types Can Change the World (Wadler 1990) — Rust 所有权 30 年前的祖宗](/study/papers/linear-types/) |  |
| [LLVM — 一套 SSA IR 贯穿编译期 / 链接期 / 运行期](/study/papers/llvm/) | Lattner & Adve, CGO 2004 — 用统一的 SSA-based IR 把 static + link-time + runtime 三阶段优化串成一套基础设施，催生了 Clang / Swift /… |
| [McCarthy LISP — Recursive Functions of Symbolic Expressions](/study/papers/mccarthy-lisp/) | S-expression 与 eval-apply 元循环解释器：函数式编程的奠基论文（CACM 1960） |
| [Push-Pull FRP (Elliott 2009) — events 推 + signals 拉的二元模型](/study/papers/push-pull-frp/) | RxJS / SolidJS / Effect 的反应式编程理论根 |
| [REALM (Guu et al. ICML 2020) — 把 retriever 塞进 MLM pretrain 的第一篇论文](/study/papers/realm/) | 不在 finetuning 时才接外部知识，而是让 retriever 和 BERT 一起预训练 |
| [Salsa-Adapton 工业演化 — 把增量计算变成 IDE 后端](/study/papers/salsa-adapton/) | Niko Matsakis 把 Adapton 的 lazy demand-driven 思想翻译成 Rust 工业框架 |
| [Adaptive Functional Programming (Acar et al. 2002) — 现代细粒度响应式的祖宗](/study/papers/self-adjusting/) | modifiable + read + write 三个 primitive + change propagation |
| [Self / Polymorphic Inline Caches — 把动态分派打到接近静态调用](/study/papers/self-pic/) | Hölzle, Chambers, Ungar, ECOOP 1991 — 在动态类型对象语言里给每个 call site 配一张小缓存，按 receiver 类型记忆最近被调到的方法地址，让"虚函数 / 消息发送"在… |
| [Simula 67 Common Base Language](/study/papers/simula-67/) |  |
| [Smalltalk-80 The Language and its Implementation](/study/papers/smalltalk-80/) |  |
| [SSA — 用 dominance frontier 高效构造 Static Single Assignment Form](/study/papers/ssa/) | Cytron, Ferrante, Rosen, Wegman, Zadeck, ACM TOPLAS 1991 — 用支配边界（dominance frontier）算法把 SSA 构造从 O(N³) 朴素做法降到几… |
| [Standard ML](/study/papers/standard-ml/) |  |
| [Theorems for Free — 只看类型签名就能推出 polymorphic 函数的不变量](/study/papers/theorems-for-free/) | Wadler, FPCA 1989 — 把 Reynolds 1983 的 relational parametricity 翻译成"工程师能用的工具"，对任何 polymorphic 函数 r :: ∀a |
| [Trees that Grow (Najd & Peyton Jones 2017) — AST 类型如何在多 phase 复用](/study/papers/trees-that-grow/) | type family + extension fields 让 AST 在 parse / rename / typecheck / optimize 各 phase 共享同一份 traversal 代码 |
| [A Prettier Printer (Wadler 1998) — 一个代数定义一代 formatter](/study/papers/wadler-prettier/) | 16 页论文 + 70 行 Haskell，奠定了 Prettier / esbuild / biome 这一代 formatter 的 IR 思路 |

## 计算理论 / 数学基础

共 5 篇。

| 论文 | 描述 |
|---|---|
| [Cook-Levin 定理](/study/papers/cook-levin/) | 1971 年 Cook（与 Levin 1973 独立）证明 SAT 是 NP-complete，奠定计算复杂性理论 |
| [Gödel 不完备性定理（1931）](/study/papers/godel-1931/) |  |
| [Karp's 21 NP-complete Problems](/study/papers/karp-21/) |  |
| [lambda-calculus](/study/papers/lambda-calculus/) |  |
| [Turing 1936: On Computable Numbers, with an Application to the Entscheidungsproblem](/study/papers/turing-1936/) | Alan Turing 1936 年的开山之作：用图灵机定义可计算性，证明 Halting Problem 不可判定，间接解决 Hilbert Entscheidungsproblem |

## 信息论 / 编码理论

共 5 篇。

| 论文 | 描述 |
|---|---|
| [Hamming Codes：错误纠正的开山之作](/study/papers/hamming-1950/) | Richard Hamming 1950 年 BSTJ 论文系统化错误检测与纠正理论，Hamming(7,4) 用 3 个校验位为 4 个数据位提供单错纠正，距离-纠错关系定理 ⌊(d-1)/2⌋ 至今仍是编码理论基石 |
| [A Method for the Construction of Minimum-Redundancy Codes](/study/papers/huffman-1952/) | Huffman 1952 状元篇 — 从作业题到 70 年标准：最优前缀码的贪心构造与现代压缩中的位置 |
| [Polar Codes — Channel Polarization 与 5G 编码](/study/papers/polar-codes-2009/) | Arıkan 2009 年提出的信道极化方法，第一个被严格证明能达到 Shannon 容量的实用编码方案，5G NR 控制信道（PDCCH/PBCH/PUCCH）的官方编码 |
| [Reed-Solomon 编码：多项式码与错误纠正的 60 年统治](/study/papers/reed-solomon-1960/) | Reed & Solomon 1960 论文精读 v1 |
| [Shannon 信息论 通信的数学理论](/study/papers/shannon-1948/) |  |

## 密码学 / 安全

共 5 篇。

| 论文 | 描述 |
|---|---|
| [AES Rijndael 对称分组密码](/study/papers/aes/) |  |
| [Bitcoin — 一种点对点电子现金系统](/study/papers/bitcoin/) | 中本聪 2008 白皮书的状元篇 D 分支精读：PoW 共识 / UTXO / 拜占庭容错 / 经济激励 |
| [New Directions in Cryptography (Diffie-Hellman 1976)](/study/papers/diffie-hellman/) |  |
| [A Method for Obtaining Digital Signatures and Public-Key Cryptosystems (RSA 1978)](/study/papers/rsa/) |  |
| [zk-SNARK：证明"我知道"但不说"是什么](/study/papers/zk-snark/) |  |

## HCI / 软件工程研究

共 10 篇。

| 论文 | 描述 |
|---|---|
| [Cognitive Load Theory (Sweller 1988) — 工作记忆 7±2 决定的学习设计法则](/study/papers/cognitive-load-theory/) | Cognitive Science 12(2) 把为什么学不会形式化成 intrinsic + extraneous + germane 三类负荷之和，30 多年实证累积，影响 CS 教学 / UX / debug 流程 |
| [Copilot RCT (Peng et al. 2023) — AI 编码辅助第一篇严肃 RCT](/study/papers/copilot-rct/) | 95 个开发者 / 随机分组 / HTTP server 任务 / Copilot 组比 Control 组快 55 |
| [Debugging Dichotomy (Beller 2018) — 458 程序员 18 个月真实 debug 行为，65% 会话不到 1 分钟](/study/papers/debugging-dichotomy/) | ICSE 2018 用 Visual Studio 插件 WatchDog 监控 458 名程序员 18 个月，发现 debug 行为分两轨——65% 会话 < 1 分钟、setting a breakpoint 在 … |
| [Dijkstra 1968 — Go To Statement Considered Harmful](/study/papers/dijkstra-goto/) | 状元篇：不到 1000 字的 letter 如何掀翻一个时代——goto 让程序的'静态文本'与'动态执行'错位，结构化编程三件套（顺序/选择/循环）让每个文本位置的状态可推 |
| [FSRS (Ye 2022+) — 把 1885 年的遗忘曲线变成 17 个可训练参数](/study/papers/fsrs-spaced-repetition/) | 从 Ebbinghaus forgetting curve 到 Leitner 1972 box / SuperMemo SM-2 (1990) / SSP shortest path (2022)，演化到 Anki … |
| [What Makes a Great Software Engineer? (Li et al. 2015) — 个人特质 > 技术技能](/study/papers/great-swe/) | 半结构化访谈 59 位资深工程师 + manager，open coding 归纳 53 条具体属性 / 8 大类别 |
| [Pair Programming Meta-Analysis (Hannay et al. 2009) — 双倍人力换 1.2 倍质量](/study/papers/pair-programming/) | 18 个 RCT 元分析 |
| [Understanding Program Comprehension with fMRI — 程序理解像语言而非数学的首个脑成像证据](/study/papers/program-comprehension-fmri/) | Siegmund 2014 用 fMRI 扫了 17 名学生读 Java 代码，发现激活的是 Broca / BA47 等自然语言处理区域而非数学推理区——这给"编程是语言学"假说提供了首个生理学锚点 |
| [Programmer Interruption (Parnin & Rugaber 2009) — 给"程序员被打断"提供第一份量化资源损耗证据](/study/papers/programmer-interruption/) | ICPC 2009 用 85 名工程师 10,000 个 IDE 会话证明只有 10% 能在 1 分钟内恢复编码，30% 编辑滞后超过 30 分钟 |
| [Sillito Questions (TSE 2008) — 程序员做修改任务时问的 44 个问题分类](/study/papers/sillito-questions/) | IEEE TSE 2008 用 25 名 industrial 程序员 + 9 名实验室程序员的录像归纳出 4 大类共 44 个问题，成为 IDE / Code Search / LLM agent 的隐性 refer… |

---

## 全部 136 篇（字母序）

| Slug | 论文 | 主题 |
|---|---|---|
| `3d-gaussian-splatting` | [3D Gaussian Splatting — explicit primitives 把 NeRF 从 12 小时训练 0.1 FPS 拉到 5 分钟训练 100+ FPS](/study/papers/3d-gaussian-splatting/) | 计算机视觉 |
| `activation-patching` | [Activation Patching - 把因果手术刀塞进 Transformer](/study/papers/activation-patching/) | AI 安全与可解释性 |
| `adapton` | [Adapton (Hammer et al. 2014) — 增量计算的工程化简化](/study/papers/adapton/) | 编译器 / 编程语言理论 |
| `aes` | [AES Rijndael 对称分组密码](/study/papers/aes/) | 密码学 / 安全 |
| `agentless` | [Agentless — 反 agent 派代表作：3 阶段 pipeline 在 SWE-bench 上反超复杂 agent](/study/papers/agentless/) | 智能体与 LLM 系统 |
| `algol-60` | [Algol 60 — BNF / 块结构 / call-by-name 的诞生地](/study/papers/algol-60/) | 编译器 / 编程语言理论 |
| `alphago` | [AlphaGo Mastering Go with Deep Neural Networks](/study/papers/alphago/) | 强化学习 |
| `anthropic-circuits` | [A Mathematical Framework for Transformer Circuits (Elhage+ 2021) — 把 attention head 拆成 QK + OV 两条电路](/study/papers/anthropic-circuits/) | AI 安全与可解释性 |
| `attention` | [Transformer Attention Is All You Need](/study/papers/attention/) | NLP 基础与 Scaling |
| `aurora` | [Aurora (Verbitski et al. 2017) — 把数据库的下半身换成日志机](/study/papers/aurora/) | 数据库 |
| `autogen` | [AutoGen — Enabling Next-Gen LLM Applications via Multi-Agent Conversation](/study/papers/autogen/) | 智能体与 LLM 系统 |
| `bert` | [BERT 双向 Transformer 预训练](/study/papers/bert/) | NLP 基础与 Scaling |
| `bidirectional-typing` | [Bidirectional Typing (Dunfield & Krishnaswami CSUR 2021) — TS/Rust/Swift 类型推断的工程基础](/study/papers/bidirectional-typing/) | 编译器 / 编程语言理论 |
| `bigtable` | [Bigtable 分布式结构化存储](/study/papers/bigtable/) | 数据库 |
| `bitcoin` | [Bitcoin — 一种点对点电子现金系统](/study/papers/bitcoin/) | 密码学 / 安全 |
| `boehm-gc` | [Boehm-Weiser 保守式垃圾回收](/study/papers/boehm-gc/) | GC / 内存管理 |
| `borg` | [Borg 大规模集群管理](/study/papers/borg/) | OS / 集群管理 / 系统 |
| `calvin` | [Calvin (Thomson et al. 2012) — 不要时钟，要 sequencer，全球事务的另一条路](/study/papers/calvin/) | 数据库 |
| `causal-abstraction` | [Causal Abstraction × DAS — 神经网络的因果抽象与对齐搜索](/study/papers/causal-abstraction/) | AI 安全与可解释性 |
| `cheney-gc` | [A Nonrecursive List Compacting Algorithm（Cheney 1970，Copying GC 始祖）](/study/papers/cheney-gc/) | GC / 内存管理 |
| `chinchilla` | [Chinchilla — 70B 训 1.4T tokens 打败 280B Gopher，把 Kaplan 的 compute-optimal 公式推翻一半](/study/papers/chinchilla/) | NLP 基础与 Scaling |
| `chubby` | [Chubby 分布式锁服务](/study/papers/chubby/) | 分布式系统 |
| `ci-effects` | [CI Effects (Ståhl & Bosch 2014) — 持续集成的真实成本与收益](/study/papers/ci-effects/) | 编译器 / 编程语言理论 |
| `clickhouse` | [ClickHouse Lightning Fast Analytics 状元篇](/study/papers/clickhouse/) | 数据库 |
| `clip` | [CLIP 视觉-语言对比预训练](/study/papers/clip/) | 计算机视觉 |
| `cognitive-load-theory` | [Cognitive Load Theory (Sweller 1988) — 工作记忆 7±2 决定的学习设计法则](/study/papers/cognitive-load-theory/) | HCI / 软件工程研究 |
| `compiler-errors` | [Do Developers Read Compiler Error Messages? — 眼动追踪给"用户不读你的报错"提供量化证据](/study/papers/compiler-errors/) | 编译器 / 编程语言理论 |
| `constitutional-ai` | [Constitutional AI — 让 AI 看着一组原则给自己挑刺：Claude 的训练骨架](/study/papers/constitutional-ai/) | AI 安全与可解释性 |
| `cook-levin` | [Cook-Levin 定理](/study/papers/cook-levin/) | 计算理论 / 数学基础 |
| `copilot-rct` | [Copilot RCT (Peng et al. 2023) — AI 编码辅助第一篇严肃 RCT](/study/papers/copilot-rct/) | HCI / 软件工程研究 |
| `cot` | [Chain-of-Thought Prompting (Wei et al. 2022) — reasoning trace 是涌现能力的钥匙](/study/papers/cot/) | 智能体与 LLM 系统 |
| `crdt-json` | [A Conflict-Free Replicated JSON Datatype (Kleppmann & Beresford 2017) — 把整棵 JSON 树变成可合并的 CRDT](/study/papers/crdt-json/) | 编译器 / 编程语言理论 |
| `dalle-2` | [DALL-E 2 / unCLIP 文本到图像生成](/study/papers/dalle-2/) | 生成模型 / 扩散 |
| `ddpm` | [DDPM Denoising Diffusion Probabilistic Models](/study/papers/ddpm/) | 生成模型 / 扩散 |
| `debugging-dichotomy` | [Debugging Dichotomy (Beller 2018) — 458 程序员 18 个月真实 debug 行为，65% 会话不到 1 分钟](/study/papers/debugging-dichotomy/) | HCI / 软件工程研究 |
| `deepseek-r1` | [DeepSeek-R1 状元篇 — 纯 RL 让 LLM 自己学会推理](/study/papers/deepseek-r1/) | NLP 基础与 Scaling |
| `deepspeed-zero` | [ZeRO - Memory Optimizations Toward Training Trillion Parameter Models](/study/papers/deepspeed-zero/) | 分布式训练 / GPU |
| `diffie-hellman` | [New Directions in Cryptography (Diffie-Hellman 1976)](/study/papers/diffie-hellman/) | 密码学 / 安全 |
| `dijkstra-goto` | [Dijkstra 1968 — Go To Statement Considered Harmful](/study/papers/dijkstra-goto/) | HCI / 软件工程研究 |
| `dino` | [DINO 自监督视觉 transformer](/study/papers/dino/) | 计算机视觉 |
| `dit` | [DiT Diffusion Transformer](/study/papers/dit/) | 生成模型 / 扩散 |
| `dns` | [DNS Domain Name System](/study/papers/dns/) | 网络协议 |
| `dpo` | [DPO Direct Preference Optimization](/study/papers/dpo/) | 强化学习 |
| `dqn` | [DQN Deep Q-Network 深度强化学习](/study/papers/dqn/) | 强化学习 |
| `dynamo` | [Dynamo (DeCandia et al. 2007) — NoSQL 的源头与 CAP 的 AP 路线](/study/papers/dynamo/) | 数据库 |
| `ebpf` | [eBPF (McCanne-Jacobson 1993 + Starovoitov 2014) — userspace 写程序，kernel 安全跑](/study/papers/ebpf/) | OS / 集群管理 / 系统 |
| `effect-handlers` | [Algebraic Effects (Plotkin & Pretnar ESOP 2009) — async/await、try-catch、generator 的统一抽象](/study/papers/effect-handlers/) | 编译器 / 编程语言理论 |
| `flash-attention` | [FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness](/study/papers/flash-attention/) | 分布式训练 / GPU |
| `foundationdb` | [FoundationDB (Zhou et al. 2021) — Unbundled 分布式 KV + Sim2 确定性仿真：用 10 年 CI 把 bug 烧在设计期](/study/papers/foundationdb/) | 数据库 |
| `fsrs-spaced-repetition` | [FSRS (Ye 2022+) — 把 1885 年的遗忘曲线变成 17 个可训练参数](/study/papers/fsrs-spaced-repetition/) | HCI / 软件工程研究 |
| `generational-gc` | [Generational Garbage Collection — 分代假设与跨代引用追踪](/study/papers/generational-gc/) | GC / 内存管理 |
| `gfs` | [GFS — workload reverse-defines the file system：single master + 64MB chunk + relaxed consistency 的工程胜利](/study/papers/gfs/) | OS / 集群管理 / 系统 |
| `godel-1931` | [Gödel 不完备性定理（1931）](/study/papers/godel-1931/) | 计算理论 / 数学基础 |
| `gpt-3` | [GPT-3 Language Models are Few-Shot Learners](/study/papers/gpt-3/) | NLP 基础与 Scaling |
| `graphrag` | [GraphRAG (Microsoft 2024) — 用 LLM 把语料抽成 entity/relation 图 + Leiden community detection 分簇 + 每簇 summary，让 RAG 第一次能回答 global / multi-hop 问题](/study/papers/graphrag/) | 智能体与 LLM 系统 |
| `great-swe` | [What Makes a Great Software Engineer? (Li et al. 2015) — 个人特质 > 技术技能](/study/papers/great-swe/) | HCI / 软件工程研究 |
| `hamming-1950` | [Hamming Codes：错误纠正的开山之作](/study/papers/hamming-1950/) | 信息论 / 编码理论 |
| `hindley-milner` | [Hindley-Milner — 让编译器自己推类型的祖宗算法（POPL 1982）](/study/papers/hindley-milner/) | 编译器 / 编程语言理论 |
| `http-2` | [HTTP/2 — Hypertext Transfer Protocol Version 2](/study/papers/http-2/) | 网络协议 |
| `huffman-1952` | [A Method for the Construction of Minimum-Redundancy Codes](/study/papers/huffman-1952/) | 信息论 / 编码理论 |
| `induction-heads` | [In-Context Learning and Induction Heads (Olsson+ 2022) — 把 ICL 钉在 induction head 因果上的六条证据](/study/papers/induction-heads/) | AI 安全与可解释性 |
| `instructgpt` | [InstructGPT — ChatGPT 的官方蓝图：把 RLHF 套到 GPT-3 上的三阶段流水线](/study/papers/instructgpt/) | 智能体与 LLM 系统 |
| `io-uring` | [io_uring (Axboe 2019) — Linux 异步 IO 的双 ring 共享内存模型](/study/papers/io-uring/) | OS / 集群管理 / 系统 |
| `kafka` | [Kafka (Kreps et al. 2011) — 把消息系统重写成只追加的日志文件](/study/papers/kafka/) | 数据库 |
| `karp-21` | [Karp's 21 NP-complete Problems](/study/papers/karp-21/) | 计算理论 / 数学基础 |
| `lambda-calculus` | [lambda-calculus](/study/papers/lambda-calculus/) | 计算理论 / 数学基础 |
| `lamport-1978` | [Time, Clocks (Lamport 1978) — 分布式系统中没有"绝对的同时"](/study/papers/lamport-1978/) | 分布式系统 |
| `linear-types` | [Linear Types Can Change the World (Wadler 1990) — Rust 所有权 30 年前的祖宗](/study/papers/linear-types/) | 编译器 / 编程语言理论 |
| `llama` | [LLaMA — Chinchilla 实证落地版：7B 训 1T tokens，开放权重点燃 2023 开源 LLM 生态](/study/papers/llama/) | NLP 基础与 Scaling |
| `llava` | [LLaVA Visual Instruction Tuning](/study/papers/llava/) | 生成模型 / 扩散 |
| `llvm` | [LLVM — 一套 SSA IR 贯穿编译期 / 链接期 / 运行期](/study/papers/llvm/) | 编译器 / 编程语言理论 |
| `mae` | [MAE Masked Autoencoder 视觉自监督](/study/papers/mae/) | 计算机视觉 |
| `mamba` | [Mamba - Linear-Time Sequence Modeling with Selective State Spaces](/study/papers/mamba/) | NLP 基础与 Scaling |
| `mapreduce` | [MapReduce (Dean & Ghemawat 2004) — 限制表达力换可扩展性](/study/papers/mapreduce/) | OS / 集群管理 / 系统 |
| `mccarthy-lisp` | [McCarthy LISP — Recursive Functions of Symbolic Expressions](/study/papers/mccarthy-lisp/) | 编译器 / 编程语言理论 |
| `megatron-lm` | [Megatron-LM 张量并行如何把单卡放不下的大模型切到多卡](/study/papers/megatron-lm/) | 分布式训练 / GPU |
| `metagpt` | [MetaGPT — SOP 驱动的多 agent 软件公司框架](/study/papers/metagpt/) | 智能体与 LLM 系统 |
| `mixture-of-experts` | [Mixture of Experts 状元篇 — 从 dense scaling 到 sparse routing](/study/papers/mixture-of-experts/) | NLP 基础与 Scaling |
| `muzero` | [MuZero Mastering Games by Planning with Learned Model](/study/papers/muzero/) | 强化学习 |
| `openhands` | [OpenHands — 开源 generalist coding agent 平台：把 SWE-agent 的 ACI 工业化、多 agent 化、可扩展化](/study/papers/openhands/) | 智能体与 LLM 系统 |
| `pair-programming` | [Pair Programming Meta-Analysis (Hannay et al. 2009) — 双倍人力换 1.2 倍质量](/study/papers/pair-programming/) | HCI / 软件工程研究 |
| `paxos` | [Paxos 异步分布式共识](/study/papers/paxos/) | 分布式系统 |
| `polar-codes-2009` | [Polar Codes — Channel Polarization 与 5G 编码](/study/papers/polar-codes-2009/) | 信息论 / 编码理论 |
| `ppo` | [PPO Proximal Policy Optimization](/study/papers/ppo/) | 强化学习 |
| `program-comprehension-fmri` | [Understanding Program Comprehension with fMRI — 程序理解像语言而非数学的首个脑成像证据](/study/papers/program-comprehension-fmri/) | HCI / 软件工程研究 |
| `programmer-interruption` | [Programmer Interruption (Parnin & Rugaber 2009) — 给"程序员被打断"提供第一份量化资源损耗证据](/study/papers/programmer-interruption/) | HCI / 软件工程研究 |
| `push-pull-frp` | [Push-Pull FRP (Elliott 2009) — events 推 + signals 拉的二元模型](/study/papers/push-pull-frp/) | 编译器 / 编程语言理论 |
| `quic` | [QUIC UDP-Based Multiplexed Secure Transport](/study/papers/quic/) | 网络协议 |
| `raft` | [Raft 可理解的共识算法](/study/papers/raft/) | 分布式系统 |
| `rag-lewis-2020` | [RAG (NeurIPS 2020) — 把 differentiable retriever 和 seq2seq generator 联训成一个端到端模型，让生成式 AI 第一次能引用外部知识](/study/papers/rag-lewis-2020/) | 智能体与 LLM 系统 |
| `react` | [ReAct — agent loop 的祖宗：think × act 的最小可执行三元组](/study/papers/react/) | 智能体与 LLM 系统 |
| `realm` | [REALM (Guu et al. ICML 2020) — 把 retriever 塞进 MLM pretrain 的第一篇论文](/study/papers/realm/) | 编译器 / 编程语言理论 |
| `reed-solomon-1960` | [Reed-Solomon 编码：多项式码与错误纠正的 60 年统治](/study/papers/reed-solomon-1960/) | 信息论 / 编码理论 |
| `reflexion` | [Reflexion (Shinn et al. 2023) — verbal RL：用文字代替梯度让 agent 学习](/study/papers/reflexion/) | 智能体与 LLM 系统 |
| `resnet` | [ResNet 深度残差学习](/study/papers/resnet/) | 计算机视觉 |
| `retro` | [RETRO (DeepMind ICML 2022) — 用 2T tokens 外部数据库 + chunked cross-attention 让 7.5B 模型媲美 175B Gopher，把检索抬成与参数并列的第二个 LLM 缩放轴](/study/papers/retro/) | 智能体与 LLM 系统 |
| `rlhf-christiano` | [RLHF — 用人比较两条轨迹学奖励：ChatGPT/Claude 的奠基论文](/study/papers/rlhf-christiano/) | 强化学习 |
| `rocksdb-lsm` | [LSM-tree 与 RocksDB 状元篇](/study/papers/rocksdb-lsm/) | 数据库 |
| `rsa` | [A Method for Obtaining Digital Signatures and Public-Key Cryptosystems (RSA 1978)](/study/papers/rsa/) | 密码学 / 安全 |
| `salsa-adapton` | [Salsa-Adapton 工业演化 — 把增量计算变成 IDE 后端](/study/papers/salsa-adapton/) | 编译器 / 编程语言理论 |
| `sam` | [SAM — 把分割做成可 prompt 的基础模型，image encoder 一次、prompt 解码 N 次](/study/papers/sam/) | 计算机视觉 |
| `scaling-laws` | [Scaling Laws — 把 LLM 的 loss 写成参数 N、数据 D、计算 C 的三参数 power law](/study/papers/scaling-laws/) | NLP 基础与 Scaling |
| `self-adjusting` | [Adaptive Functional Programming (Acar et al. 2002) — 现代细粒度响应式的祖宗](/study/papers/self-adjusting/) | 编译器 / 编程语言理论 |
| `self-pic` | [Self / Polymorphic Inline Caches — 把动态分派打到接近静态调用](/study/papers/self-pic/) | 编译器 / 编程语言理论 |
| `selinger-1979` | [Selinger 1979 — 把可见的执行计划装进每一台 SQL 数据库](/study/papers/selinger-1979/) | 数据库 |
| `shannon-1948` | [Shannon 信息论 通信的数学理论](/study/papers/shannon-1948/) | 信息论 / 编码理论 |
| `sillito-questions` | [Sillito Questions (TSE 2008) — 程序员做修改任务时问的 44 个问题分类](/study/papers/sillito-questions/) | HCI / 软件工程研究 |
| `simula-67` | [Simula 67 Common Base Language](/study/papers/simula-67/) | 编译器 / 编程语言理论 |
| `sleeper-agents` | [Sleeper Agents — 故意训出来的 LLM 卧底，证明安全训练可能"清不掉"已学会的欺骗](/study/papers/sleeper-agents/) | AI 安全与可解释性 |
| `smalltalk-80` | [Smalltalk-80 The Language and its Implementation](/study/papers/smalltalk-80/) | 编译器 / 编程语言理论 |
| `snowflake` | [The Snowflake Elastic Data Warehouse 状元篇](/study/papers/snowflake/) | 数据库 |
| `spanner` | [Spanner 全球分布式数据库](/study/papers/spanner/) | 分布式系统 |
| `sparse-autoencoders` | [Sparse Autoencoders 把 superposition 解出来的那把扳手](/study/papers/sparse-autoencoders/) | AI 安全与可解释性 |
| `ssa` | [SSA — 用 dominance frontier 高效构造 Static Single Assignment Form](/study/papers/ssa/) | 编译器 / 编程语言理论 |
| `stable-diffusion` | [Stable Diffusion / LDM — 把扩散从像素搬到 latent 空间，让消费级 GPU 也能跑文生图](/study/papers/stable-diffusion/) | 生成模型 / 扩散 |
| `standard-ml` | [Standard ML](/study/papers/standard-ml/) | 编译器 / 编程语言理论 |
| `swe-agent` | [SWE-agent — 不靠模型变聪明、靠"接口"变聪明：ACI 把 SWE-bench 1.96% 推到 12.5%](/study/papers/swe-agent/) | 智能体与 LLM 系统 |
| `swe-bench` | [SWE-bench (Jimenez et al. 2024) — 把 LLM 评测从 demo 题推到真实 GitHub issue](/study/papers/swe-bench/) | 智能体与 LLM 系统 |
| `t5` | [T5 Text-to-Text Transfer Transformer](/study/papers/t5/) | NLP 基础与 Scaling |
| `tcp` | [TCP Transmission Control Protocol](/study/papers/tcp/) | 网络协议 |
| `theorems-for-free` | [Theorems for Free — 只看类型签名就能推出 polymorphic 函数的不变量](/study/papers/theorems-for-free/) | 编译器 / 编程语言理论 |
| `tigerbeetle` | [TigerBeetle (Joran Greef et al. 2024) — 金融级 OLTP，固定 schema + VSR + deterministic simulation](/study/papers/tigerbeetle/) | 数据库 |
| `tls-1.3` | [TLS 1.3 The Transport Layer Security Protocol Version 1.3](/study/papers/tls-1.3/) | 网络协议 |
| `tofte-talpin-regions` | [Tofte-Talpin Region-Based Memory Management](/study/papers/tofte-talpin-regions/) | GC / 内存管理 |
| `toolformer` | [Toolformer (Schick et al. 2023) — LM 自己教自己用工具](/study/papers/toolformer/) | 智能体与 LLM 系统 |
| `toy-models-superposition` | [Toy Models of Superposition (Elhage+ 2022) — 把 features-as-directions 钉在 capacity 数学上的 13 节论证](/study/papers/toy-models-superposition/) | AI 安全与可解释性 |
| `trees-that-grow` | [Trees that Grow (Najd & Peyton Jones 2017) — AST 类型如何在多 phase 复用](/study/papers/trees-that-grow/) | 编译器 / 编程语言理论 |
| `turing-1936` | [Turing 1936: On Computable Numbers, with an Application to the Entscheidungsproblem](/study/papers/turing-1936/) | 计算理论 / 数学基础 |
| `vit` | [ViT 视觉变换器](/study/papers/vit/) | 计算机视觉 |
| `vllm` | [vLLM - Efficient Memory Management for LLM Serving with PagedAttention](/study/papers/vllm/) | 分布式训练 / GPU |
| `volcano` | [Volcano 1990 — 把 SQL 执行写成 next() 拉式数据流](/study/papers/volcano/) | 数据库 |
| `voyager` | [Voyager — 让 LLM agent 在 Minecraft 里"越玩越强"：自动课程 + 技能库 + 错误反馈循环](/study/papers/voyager/) | 智能体与 LLM 系统 |
| `wadler-prettier` | [A Prettier Printer (Wadler 1998) — 一个代数定义一代 formatter](/study/papers/wadler-prettier/) | 编译器 / 编程语言理论 |
| `word2vec` | [Word2Vec 词向量分布式表示](/study/papers/word2vec/) | NLP 基础与 Scaling |
| `zgc` | [ZGC — 染色指针 + 读屏障下的 TB 级低延迟并发 GC](/study/papers/zgc/) | GC / 内存管理 |
| `zk-snark` | [zk-SNARK：证明"我知道"但不说"是什么](/study/papers/zk-snark/) | 密码学 / 安全 |
