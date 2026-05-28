# 论文研究 · 状态

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

## 后续 Season（roadmap，未细化）

需要写到 100 篇 = 80 篇待规划，按下面这些方向铺开（每季 5 篇）：

- Season F：分布式系统 2.0（FoundationDB / TigerBeetle / Calvin / Aurora 等）
- Season G：编程语言 / 编译器 II（HM 类型 / effect system / incremental compilation）
- Season H：多模态 / 视觉理解（DINO / SAM / Grounding DINO 类）
- Season I：AI safety / interpretability 深化（mechanistic interpretability 后续）
- Season J：HCI 程序员认知（cognitive load / debugging / pair）
- Season K：检索 / 记忆系统（retrieval / spaced repetition / vector DB）
- Season L-T：根据 study 站使用反馈补缺口

## 历史里程碑

- 2026-05-28 — 启动论文研究线，建立 8 层方法论 + 20 篇队列
- 2026-05-28 — 完成 20 / 20（A/B/C/D 四个 Season 全发布）
- 2026-05-28 — ReAct 重构为"状元篇"模板（含 3 张 sketchnote 图，约 1100 行）
- 2026-05-28 — 安装论文工具集（arxiv-mcp / phd-skills / DeepPaperNote / paper-comic）
