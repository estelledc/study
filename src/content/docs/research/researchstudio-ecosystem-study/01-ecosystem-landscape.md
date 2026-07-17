# 01. 生态广度：AI 科研自动化的六层地图

## 1. 一句话定位

AI 科研自动化正在从“让模型写一篇像论文的文本”，转向“让可恢复、可审计的 agent 系统管理证据、假设、代码、实验、评审和多模态产物”。ResearchStudio 位于“选题 + 研究成果传播 + skill harness”交叉处，而不是完整科学发现执行层。

## 2. 六层能力地图

| 层级 | 核心输入 | 核心输出 | 代表项目 | 关键难题 |
|---|---|---|---|---|
| 文献与证据 | 查询、PDF、元数据源 | 论文集合、证据片段、带引用回答 | PaperQA2、STORM、paper-search-mcp | 召回、去重、全文获取、引用正确性 |
| 选题与假设 | 研究方向、文献、知识图谱 | idea card、假设、研究计划 | ResearchStudio Idea、Idea2Paper、Co-Scientist | 新颖性、可行性、碰撞检查、反例 |
| 实验与发现 | 假设、代码模板、算力 | 实验日志、指标、图表、结论 | AI-Scientist、AI-Scientist-v2、AI-Researcher、Agent Laboratory、AutoResearchClaw、FAROS、AutoR、InternAgent、nano-scientist | 代码正确性、预算、长程恢复、结果解释 |
| 写作与评审 | 证据、实验结果、论文结构 | PDF、审稿意见、修订稿 | AI-Scientist 系列、Co-Scientist、ARA | 证据绑定、过度声称、审稿一致性 |
| 发布与传播 | PDF、图表、论文资产 | poster、slides、video、blog、HTML | ResearchStudio Reel、Paper2Poster、PosterGen、Paper2Video、Paper2Slides、ppt-master、PaperBanana、posterly、paper2anything | 视觉层级、尺寸、溢出、事实保真 |
| Harness 与能力层 | agent 指令、工具、状态、预算 | 可复用技能、恢复点、审计记录 | ResearchStudio、AI-Research-SKILLs、scientific-agent-skills、ARA、AutoR | 能力组合、边界、持续性、可观测性 |

这六层不是六条互斥产品线。成熟系统往往纵向穿透多层，但每个项目都有自己的“主战场”。

## 3. 发展阶段

### 阶段 A：检索增强的研究写作

早期重点是“找到资料并写出带引用的长文”：

- STORM 用多视角提问先构造信息表，再生成提纲和文章。
- PaperQA2 把搜索、证据聚合、回答生成封装成 agent tools。
- 核心改进对象是引用质量、检索覆盖和长文结构，不直接运行科研实验。

### 阶段 B：端到端 AI Scientist

AI-Scientist、Agent Laboratory 等把流水线扩展到：

`idea → code modification → experiment → plot → paper → review`

这一步证明了模型可以操作实验代码，但也暴露出：

- 模板依赖较强。
- 失败恢复和状态管理较弱。
- “成功运行”不等于研究结论可靠。
- 线性流水线容易把早期错误传播到论文。

### 阶段 C：搜索、角色和多智能体

AI-Scientist-v2、Co-Scientist、InternAgent 等不再只依赖单条链：

- 用树搜索保留多个实验分支。
- 用不同角色负责生成、反思、排序、演化和综合。
- 用任务队列、租约、幂等和终止条件管理并发。
- 将“研究”建模为竞争、批评和选择，而不是一次 prompt。

### 阶段 D：Artifact-first 与 agent-native harness

2025—2026 年的明显趋势是把研究运行时外化：

- AutoR 用 manifest、stage report、decision、evidence 和 workspace 支持恢复与人工审批。
- ARA 把 claim、concept、heuristic、code、evidence 和探索分支绑定为可审计 artifact。
- ResearchStudio 用 `SKILL.md + references + scripts + runs` 让 coding agent 执行确定性流程。
- skills 仓库把科研软件、数据库和方法能力变成可安装模块。

这类系统的关注点从“模型一次能生成多好的答案”转向“几天后能否恢复、复查、修正和交接”。

### 阶段 E：研究成果多模态分发

论文不再是唯一终点：

- 海报：Paper2Poster、PosterGen、posterly。
- 幻灯片：Paper2Slides、ppt-master。
- 视频：Paper2Video。
- 图表：PaperBanana。
- 多渠道：paper2anything。
- 一次解析、多种产物：ResearchStudio Reel。

这一层的技术重点是内容保真和确定性几何检查，而不是简单“生成漂亮图片”。

## 4. 生态中的四种产品哲学

### 全自动科学家

代表：AI-Scientist、AI-Scientist-v2、AI-Researcher、AutoResearchClaw。

目标是减少人工介入，优点是吞吐高；风险是错误可能自动放大，必须配套预算、沙箱、评审和停止条件。

### 人机协作研究工作台

代表：Agent Laboratory、AutoR、Co-Scientist、STORM / Co-STORM。

把人保留在计划、审批、讨论或结论接受环节。它更符合真实科研中“方向判断不可完全外包”的现实。

### 专项研究编译器

代表：ResearchStudio、Idea2Paper、Paper2Poster、Paper2Video、Paper2Slides。

输入和输出边界明确，能在某一环节建立更强的工程质量门，通常比大而全系统更容易验证。

### 能力与治理基础设施

代表：scientific-agent-skills、AI-Research-SKILLs、ARA。

不直接规定唯一工作流，而是为上层 agent 提供能力、证据结构或运行协议。

## 5. 当前技术共识

### 专门化胜过单个万能 agent

项目普遍把不同任务拆给不同角色或 stage：检索、规划、执行、评审、视觉设计各有不同上下文、工具和评价标准。

### 文件和数据库是长程记忆，聊天记录不是

高质量项目把状态写入：

- SQLite：Co-Scientist。
- manifest 和目录：AutoR。
- journal / tree node：AI-Scientist-v2。
- pickle：Agent Laboratory。
- YAML / Markdown / artifact bundle：ResearchStudio、ARA、AI-Research-SKILLs。

这使恢复、审计和人工接管成为可能。

### LLM 判断必须和确定性检查配对

常见组合：

- LLM 提出假设，代码执行验证。
- LLM 生成布局，脚本测量溢出和尺寸。
- LLM 写引用，程序验证引用存在与格式。
- LLM 评审研究，预算和终止器限制无限循环。

### 研究质量不等于文本流畅

真正难点包括：

- 证据是否支持 claim。
- 新颖性检索是否覆盖近邻工作。
- 实验是否可复现。
- 代码改动是否只优化了错误指标。
- 失败分支和负结果是否被保留。
- 自动评审是否和真实专家判断一致。

## 6. 仍未解决的主要问题

### 科学有效性

多数项目能验证“流程执行完成”，不能证明“科学结论正确”。LLM reviewer 也可能共享同一偏差。

### 成本与预算

多 agent、树搜索、视觉反思和文献检索都快速放大 token、GPU 和时间成本。只有少数项目把预算作为一等状态。

### 许可证与复用

部分高影响项目没有清晰 SPDX 许可证或使用自定义研究许可证。可 fork 阅读，不应默认可复制代码到其他产品。

### 安全与外部副作用

能执行 shell、Docker、浏览器和下载论文的 agent 同时拥有更大攻击面。提示注入、恶意论文内容、危险命令和密钥泄漏需要独立治理。

### 评价标准碎片化

不同项目分别评价论文得分、实验指标、检索质量、海报美观或视频质量，尚缺统一的端到端“研究可信度”基准。

## 7. ResearchStudio 的生态位置

ResearchStudio 当前的优势：

- 输入输出边界清楚。
- skill 可直接嵌入 coding agent。
- 共享 paper asset 避免多种产物重复解析。
- 将视觉生成与测量、渲染、验证脚本结合。
- Idea 流程显式要求文献 grounding、collision check、critique 和 revision。

当前空白：

- 没有内置通用全文证据库。
- 不直接运行研究实验。
- 没有长期任务队列、预算调度或数据库状态。
- Idea 与 Reel 之间还不是完整的 `idea → experiment → paper → dissemination` 闭环。

因此最合理的理解不是“它要取代所有 AI Scientist”，而是“它提供可组合、可测量的研究前端和传播后端”。
