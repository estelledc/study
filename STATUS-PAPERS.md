# 论文研究 · 状态

> 历史策划页，不是实时队列或执行入口。当前状态以 `npm run status:pipeline`、`data/operations-policy.json` 和 `docs/operations-index.md` 为准；“待写”清单不授权内容生产。

> 这个文件是**论文研究线**的状态独占文件。
> 只在论文研究 worktree（分支 `research/papers-*`）修改，避免与项目研究线冲突。

## 当前状态

- 总进度：**20 / 20 ✅**
- 完成日期：2026-05-28
- 队列：[papers-queue](https://estelledc.github.io/study/papers-queue/)（已完结）
- 方法论：[papers-method](https://estelledc.github.io/study/papers-method/)（8 层，~90 分钟一篇）

## Season 分布

| Season | 主题 | 状态 |
|---|---|---|
| A | AI Agent / LLM 系统 | 5/5 ✅ |
| B | 经典 CS / 系统设计 | 5/5 ✅ |
| C | 增量计算 / 反应式语言 | 5/5 ✅ |
| D | SE empirical / 协作研究 | 5/5 ✅ |

完整 20 篇清单见 [papers-queue](https://estelledc.github.io/study/papers-queue/)。

## Season E（已规划，待写）

主题：**AI Agent 2024 一代 + 跨界基础设施补完**

| # | 论文 | 类型（v1.1） | venue/年 | 关键连接 |
|---|---|---|---|---|
| 21 | SWE-agent: Agent-Computer Interfaces | A method | Yang et al., NeurIPS 2024 | Season A 后作必收，Activity Planner 工具 schema 设计参考 |
| 22 | CLIP: Learning Transferable Visual Models | A method | Radford et al., ICML 2021 | 多模态空缺，H5 海报项目可直接用 embedding 找参考图 |
| 23 | Spanner: Google's Globally-Distributed Database | A method | Corbett et al., OSDI 2012 | Season B 时间线延续到 2010s，DB 短板入门 |
| 24 | Kafka: Distributed Messaging for Log Processing | A method | Kreps et al., NetDB 2011 | Activity Planner 的 LangGraph checkpoint 模式同源 |
| 25 | A Mathematical Framework for Transformer Circuits | D theory | Elhage et al., Anthropic 2021 | Interpretability 入门，理解你天天用的 Claude 内部 |

备选池（如某篇 L4 复现卡住推迟，从这补）：
- Voyager: Open-Ended Embodied Agent (NeurIPS 2024 D&B) — agent 长期记忆 + skill library
- Bidirectional Typing (Dunfield & Krishnaswami, CSUR 2021) — TypeScript / Rust 类型推导根
- Programmer Interruption (Parnin & Rugaber, ICSE 2010) — 23 分钟 flow 恢复

## Season F（已规划，待写）

主题：**分布式系统 2.0 — post-2010 现代系统**（补 Season B/E 的 4 个真空：OLTP 事务 / 存算分离 / deterministic transaction / CRDT 协同）

| # | 论文 | 类型 | venue/年 | 关键连接 |
|---|---|---|---|---|
| 26 | Amazon Aurora | A method/system | Verbitski et al., SIGMOD 2017 | "log is the database" — 补 GFS 2003 → cloud-native 演化必收一跳，工程师每天用 |
| 27 | A Conflict-Free Replicated JSON Datatype | A method | Kleppmann & Beresford, IEEE TPDS 2017 | CRDT JSON 树 — Figma/Linear/Yjs 祖宗，Wiki 多端编辑直接相关 |
| 28 | Calvin: Deterministic Transactions | A method | Thomson et al., SIGMOD 2012 | 与 Spanner（E）双路线对照：sequencer vs TrueTime |
| 29 | TigerBeetle | A method/system | Pritchard et al., 2020+ design + VLDB 2024 | Raft 工程化极致 + 金融级 OLTP，Zig 源码 < 20k 行可读 |
| 30 | FoundationDB Paper | A method | Zhou et al., SIGMOD 2021 | 测试方法论（deterministic simulation），10 年才发论文是因为前 9 年在测基建 |

备选池：Snowflake 2016（OLAP 云原生）/ EPaxos 2013（共识进化）/ DynamoDB 2022（Dynamo 15 年回顾）/ Anna 2018（CRDT lattice KV）/ Pulsar 2019（Kafka 后继）

## 后续 Season（roadmap）

研究队列持续扩充，不卡 100 上限。已规划方向：

### Season G（已规划，待写）

主题：**PL II — 类型/效应系统怎么帮你写对**（Season C 是"编译器怎么把代码处理快"，G 是"类型/效应系统怎么帮你写对"，正交补完）

| # | 论文 | 类型（v1.1） | venue/年 | 关键连接 |
|---|---|---|---|---|
| 31 | Principal Type-Schemes for Functional Programs | D theory | Damas & Milner, POPL 1982 | HM 是所有现代类型推断的根，TS/Rust/Swift 都源自此 |
| 32 | Bidirectional Typing | D theory | Dunfield & Krishnaswami, ACM CSUR 2021 | HM 之后的现代类型系统，TS `as const` / Rust turbofish 来源 |
| 33 | Salsa 设计 + Adapton 工业演化 | A method/system | Niko Matsakis 2018+ + Hammer 后续 | 直接续 Adapton（C15）—— rust-analyzer / TS incremental compilation 工程化 |
| 34 | Linear Types Can Change the World | D theory | Wadler, 1990 | Rust 所有权 / move semantics 的祖宗 |
| 35 | Handlers of Algebraic Effects | A method | Plotkin & Pretnar, ESOP 2009 | async/await / try-catch / generator 的统一抽象，Koka 可跑 L4 |

备选池：Pierce & Turner 2000（Local Type Inference）/ Tofte-Talpin 1997（Region Inference / Rust lifetime 根）/ Kohlbecker 1986（Hygienic Macros）


### Season H（已规划，待写）

主题：**多模态 / 视觉理解 — 以 CLIP 为枢纽的 5 条辐射线**（segmentation / self-supervised / 生成式 / 3D / multimodal agent）

| # | 论文 | 类型 | venue/年 | 关键连接 |
|---|---|---|---|---|
| 36 | SAM: Segment Anything | A method+benchmark | Kirillov et al., ICCV 2023 | promptable segmentation；浏览器 ONNX demo 直接 L4，Canvas 抠图 |
| 37 | DINO: Self-Distillation with No Labels | A method | Caron et al., ICCV 2021 | self-supervised vision 思想原点；attention map 单图可视化 |
| 38 | Latent Diffusion (Stable Diffusion) | A method | Rombach et al., CVPR 2022 | CLIP 最重要工业后作；H5 海报生成 |
| 39 | 3D Gaussian Splatting | A method | Kerbl et al., SIGGRAPH 2023 | NeRF 后作；WebGL viewer 可直接读 .ply |
| 40 | LLaVA: Visual Instruction Tuning | A method | Liu et al., NeurIPS 2023 | CLIP + LLaMA → 多模态 agent，Activity Planner 路线 |

备选：MAE / Grounding DINO / NeRF / DDPM / DINOv2


- Season I：AI safety / interpretability 深化
- Season J：HCI 程序员认知（cognitive load / debugging / flow）
- Season K：检索 / 记忆系统（retrieval / spaced repetition / vector DB）
- Season L-Z：根据 study 站使用反馈持续补缺口

每季约 5 篇，主 CC 在 refactor 间隙陆续 dispatch 研究 subagent 详细化。

## 历史里程碑

- 2026-05-28 — 启动论文研究线，建立 8 层方法论 + 20 篇队列
- 2026-05-28 — 完成 20 / 20（A/B/C/D 四个 Season 全发布）
- 2026-05-28 — ReAct 重构为"状元篇"模板（含 3 张 sketchnote 图，约 1100 行）
- 2026-05-28 — 安装论文工具集（arxiv-mcp / phd-skills / DeepPaperNote / paper-comic）
