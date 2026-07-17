# 横向对比与可复用模式

## 1. 完整教学系统对比

| 维度 | DeepTutor | Open TutorAI | GenMentor | Tutor-GPT |
|---|---|---|---|---|
| 核心定位 | 个人长期学习工作区 | 教育组织/平台底座 | 目标导向 ITS 流程 | Theory-of-Mind 学习伴侣 |
| 主入口 | Web、CLI、SDK、IM partner | Web/API/realtime | FastAPI + Streamlit | Next.js Chat |
| 编排 | capability + unified agent loop | 当前 service/repository；agentic 为目标 | endpoint 串联专用 Agent | 两阶段 Empath + Tutor |
| 学习者模型 | L1/L2/L3、mastery、persona | learner/support 域，智能更新较薄 | Pydantic LearnerProfile | Honcho 心理表示 |
| 知识 | 多引擎 KB | Chroma/RAG/provider | search RAG | PDF collection |
| 练习 | quiz、question bank、mastery | learning support | quiz generator | 主要是对话式 |
| 可审计性 | 强，文件和引用链 | 业务数据可审计 | schema 清晰，来源链较弱 | 外部服务与 prompt 为主 |
| 运行时成熟度 | 高，但复杂 | 平台分层清晰 | 研究原型型 | 产品应用型 |
| 最值得学 | 统一运行时 | 教育业务域分层 | 教学闭环拆解 | 个性化查询分工 |

## 2. RAG 路线对比

| 项目 | 核心索引 | 查询上下文 | 最适合 | 不适合 |
|---|---|---|---|---|
| LlamaIndex | 可组合 Node/Index/Vector | retriever top-k + synthesis | 通用集成、快速搭建 | 直接期待内置教学语义 |
| LightRAG | entity/relation graph + vectors | local/global/hybrid/mix | 概念关系明显的资料 | 小文档、低预算、无需关系 |
| GraphRAG | graph + communities + reports | local/global/DRIFT | 大语料全局主题与关系 | 高频更新、低成本场景 |
| PageIndex | semantic tree + page ranges | Agent 浏览树节点 | 长结构化文档 | 无层级、OCR 很差的材料 |
| RAG-Anything | multimodal KG on LightRAG | text + image/table/equation | 复杂 PDF/Office | 纯文本简单问答 |

## 3. Agent 编排对比

| 项目 | 编排抽象 | 状态表达 | 扩展方式 | 主要风险 |
|---|---|---|---|---|
| DeepTutor | capability + pipeline + tool registry | Turn、UnifiedContext、StreamEvent | capability/tool/skill/MCP | 交叉状态复杂 |
| nanobot | 显式 turn state machine | TurnContext + trace | channel/tool/hook/subagent | 通用能力需业务层约束 |
| AutoAgent | Agent + functions + handoff + event flow | history/context variables/event cache | 动态生成 Agent/tool/workflow | 动态代码安全 |
| AI-Researcher | 多阶段 research workflow | 分阶段 memory/artifact | 新 Agent、tool、环境 | 自动研究可靠性 |
| Tutor-GPT | 应用函数中的两阶段 LLM 链 | DB histories + Honcho | prompt 和外部服务 | 协议脆弱、难测试 |

## 4. 可复用架构模式

### 模式一：稳定的 Turn Contract

日常类比：餐厅后厨不直接接收顾客的碎片化说法，而是接收格式稳定的订单。

技术定义：把一次请求需要的 user input、history、tools、knowledge、memory、permissions 和 metadata 封装为不可随意漂移的对象。

代表：

- DeepTutor `UnifiedContext`；
- nanobot `TurnContext`。

收益：

- 多入口共享主链；
- 测试可直接构造 context；
- capability 不依赖 HTTP/CLI；
- 权限和工具选择有统一位置。

### 模式二：入口、编排和能力分离

```text
入口只负责协议
 -> runtime 负责生命周期
 -> orchestrator 负责路由
 -> capability 负责业务目标
 -> tool 负责外部动作
```

如果入口直接包含 prompt、RAG、模型调用和持久化，功能增加后会迅速形成巨型 endpoint。

### 模式三：检索与生成分离

LightRAG 的 `aquery_data()` 与 `aquery_llm()`、LlamaIndex 的 Retriever 与 Response Synthesizer 都体现：

- 先验证找到了什么；
- 再验证模型怎样使用它；
- retrieval 和 generation 可以独立评估；
- 引用错误更容易定位。

### 模式四：学习者状态必须有 scope 和 provenance

最少需要回答：

- 这条状态属于哪个 user/agent/session/surface？
- 来源是哪次互动？
- 是事实、模型推断还是人工设定？
- 新证据冲突时怎么办？
- 用户能否查看、修正和删除？

Mem0 强调 scope；DeepTutor 强调 provenance。

### 模式五：多阶段 Agent 不等于多 Agent 越多越好

拆分成立的条件：

- 不同阶段需要不同输入或工具；
- 中间结果需要 schema 校验；
- 阶段可以独立测试；
- 失败后能从检查点恢复；
- 额外模型调用带来的收益大于延迟和成本。

GenMentor 的 skill gap/profile/path 拆分是有领域含义的；一些 demo 只是把多个 prompt 命名成 Agent，收益有限。

### 模式六：生成代码必须用真实执行闭环

ManimCat 和通用 coding Agent 的共同模式：

```text
生成 -> 执行 -> 捕获错误/产物 -> 修复 -> 再执行
```

仅让模型“检查自己的代码”不能替代编译、渲染或测试。

### 模式七：重型知识索引应当按知识库选择

DeepTutor 的 per-KB engine 是合理方向：

- 课程讲义可用 LlamaIndex；
- 概念关系密集教材可用 LightRAG；
- 大型政策/研究语料可用 GraphRAG；
- 财报、法规和长手册可用 PageIndex；
- 含图表公式的 PDF 可用 RAG-Anything/LightRAG。

## 5. DeepTutor 的主要差异化

### 不只是 feature aggregation

DeepTutor 的真正差异是多个 surface 共享：

- session/turn；
- context；
- model/tool policy；
- knowledge；
- memory；
- stream/event；
- user workspace。

如果这些功能只是 UI 中的多个按钮，各自拥有独立后端，它不会形成长期学习闭环。

### 可审计个性化

Tutor-GPT 追求高保真心理表示，Mem0 追求高效事实召回；DeepTutor 选择人可读和引用追溯。这种选择特别适合教育，因为错误的 learner profile 会直接改变教学难度和内容。

### 多引擎知识中心

相比某个 RAG 项目，DeepTutor 更像 RAG host：负责 KB 生命周期、版本、parser、UI 和工具接入，把具体索引算法交给引擎。

### Agent 可操作性

CLI 的 JSON/NDJSON、root `SKILL.md`、MCP/skill 和 subagent 让 DeepTutor 既可以给用户使用，也可以成为其他 Agent 的工具。

## 6. 如果自己设计一个最小 AI Tutor

不要从 DeepTutor 的全部功能开始复制。建议最小闭环：

```text
1. 一个课程范围
2. 一个可引用的知识库
3. 一个显式 learner profile schema
4. 一种教学策略，例如苏格拉底式提示
5. 一类练习与确定性评分
6. 一次表现到 profile 的可审计更新
7. 一个多轮学习增益测试
```

架构最小件：

- `TurnRequest`；
- `LearnerState`；
- `KnowledgeRetriever`；
- `TutorPolicy`；
- `Exercise/Assessment`；
- `MemoryEvent`；
- `TurnResult`。

先证明这个闭环，再增加研究、语音、动画、伙伴和多知识引擎。

## 7. 常见误区

### “用了 RAG 就个性化了”

错误。RAG 主要回答“依据什么”，learner model 回答“对谁、怎样讲”。

### “多 Agent 一定比单 Agent 好”

错误。没有 schema、检查点和职责边界时，多 Agent 只会增加调用和故障点。

### “聊天历史就是长期记忆”

错误。历史是原始事件；记忆还需要抽取、scope、冲突、时间、删除和来源治理。

### “答案正确就说明教学有效”

错误。系统可能只是替学生完成了任务。教学评估要看提示、诊断和后续独立表现。

### “GraphRAG 总比向量 RAG 强”

错误。图索引成本更高，只有关系和全局主题确实重要时才可能值得。
