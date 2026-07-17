---
title: "关键思考点与后续提问入口"
sidebar:
  hidden: true
---
# 关键思考点与后续提问入口

这些问题不是材料缺失项，而是后续学习时最值得深入的分叉点。

## A. 先确认是否理解整体

1. 为什么 AI Tutor 不能只依赖一次 prompt？
2. RAG、learner profile、memory 和 mastery 分别解决什么问题？
3. “帮学生解题”和“帮助学生学会”在系统行为上有什么不同？
4. 为什么统一运行时比多个独立 LLM endpoint 更适合长期学习产品？
5. 什么证据可以证明系统真的实现个性化，而不是在 prompt 中写了“请个性化”？

## B. DeepTutor 架构

1. `TurnRuntimeManager` 与 `ChatOrchestrator` 为什么要分开？
2. `UnifiedContext` 哪些字段属于稳定契约，哪些应该只放 metadata？
3. capability 与 tool 的边界是什么？
4. Chat、Solve、Research、Question 为什么既有独立 pipeline，又共享 runtime？
5. `StreamBus` 与全局 `EventBus` 各负责什么？
6. pause/resume、branch edit、regenerate 如何影响 session tree？
7. tool whitelist、MCP grant、sandbox isolation 为什么会交叉？
8. 如果增加“错题复习” capability，应该放在哪些目录、复用哪些对象？

## C. 学习者模型与记忆

1. GenMentor 的 `LearnerProfile` 哪些字段应由用户填写，哪些可由模型推断？
2. DeepTutor L1/L2/L3 如何处理相互矛盾的证据？
3. L3 profile 为什么要求跨 surface 证据？
4. Mem0 ADD-only 能减少什么风险，又会造成什么新问题？
5. 心理偏好、知识掌握度和短期情绪是否应该放在同一个 memory 中？
6. 如何设计“这条记忆可能已过期”？
7. 用户修改 profile 后，历史自动推断是否应覆盖人工修改？
8. 教育场景中哪些记忆属于敏感数据？

## D. RAG 与教材

1. 教材章节结构什么时候比 embedding similarity 更重要？
2. PageIndex 的树节点 summary 错了会怎样传播？
3. LightRAG 的 entity/relation 抽取错误如何修复？
4. GraphRAG community report 是证据还是二级摘要？
5. RAG-Anything 如何避免表格和公式在 caption 中失真？
6. 同一知识库应该允许切换引擎，还是重建成新版本？
7. 如何独立测试 parsing、retrieval、rerank 和 generation？
8. 引用应该绑定 chunk、page、node 还是原始文件坐标？

## E. Agent loop 与工具

1. nanobot 为什么将 RESTORE、COMPACT、BUILD、RUN、SAVE 分成状态？
2. 工具错误应该返回 observation，还是终止 turn？
3. 最大轮数耗尽时，Tutor 应如何解释未完成状态？
4. 教学工具和通用工具是否应该使用不同权限？
5. 执行代码对学习有帮助时，如何避免直接替用户完成作业？
6. subagent 的上下文应该与主 Tutor 共享多少？
7. tool result 过长时，应该裁剪、总结还是再次检索？

## F. 教学策略

1. 什么情况下应该追问，什么情况下应该直接解释？
2. 苏格拉底式教学是否适合所有用户和所有任务？
3. 如何根据“熟悉、练习中、不确定”调整答案？
4. 系统如何识别幸运猜对与真正掌握？
5. 题目难度如何校准，而不是只让 LLM 自报 easy/medium/hard？
6. feedback 应该更新知识掌握度、学习策略，还是两者都更新？
7. 如何避免 personalization 变成迎合用户已有偏见？

## G. 评估

1. 如何设计一个不泄露答案的学生模拟器？
2. LLM judge 与人类教师评分不一致时信谁？
3. 评估一次回答、一次 session 和一个月学习效果分别需要什么指标？
4. 如何测“学生之后能独立做题”？
5. 如何做 memory ablation、RAG ablation 和 agent-stage ablation？
6. 什么时候应该使用 deterministic grading，什么时候需要 rubric/LLM judge？
7. benchmark 成绩能否代表真实产品中的教学体验？

## H. 工程与产品

1. 14 个项目中哪些适合直接依赖，哪些只适合借鉴模式？
2. DeepTutor 多引擎带来的安装复杂度如何控制？
3. 本地模型和云模型在隐私、质量、延迟上的边界是什么？
4. 多用户环境中 KB、memory、tool 和 partner 如何隔离？
5. 哪些功能需要显式用户确认，例如保存画像、执行代码、发送消息？
6. 如何把每次模型调用、工具调用、检索和 memory update 串成一条 trace？
7. 如何处理上游 RAG 项目快速变化造成的兼容问题？

## 建议的后续源码学习路线

### 路线 1：继续 DeepTutor 一次 turn

1. `deeptutor/services/session/turn_runtime.py` 的 `_run_turn`；
2. `deeptutor/core/context.py`；
3. `deeptutor/runtime/orchestrator.py`；
4. `deeptutor/agents/chat/capability.py`；
5. `deeptutor/agents/chat/agentic_pipeline.py`；
6. AgentLoop 的 tool call、pause 和 finish；
7. assistant message 与 memory trace 持久化。

### 路线 2：对比三种记忆

1. DeepTutor `services/memory/trace.py`；
2. DeepTutor consolidator `modes/update.py`；
3. GenMentor `adaptive_learning_profiler.py`；
4. Mem0 `memory/main.py:add()` 与 `search()`；
5. Tutor-GPT `utils/ai/index.ts` 与 Honcho query。

### 路线 3：对比三种 RAG

1. LlamaIndex `IngestionPipeline` 和 `VectorStoreIndex`；
2. LightRAG `ainsert()`、pipeline、`aquery_data()`；
3. PageIndex `page_index_main()` 和 retrieval demo；
4. 再看 GraphRAG workflow，理解重型离线索引。

### 路线 4：做一个最小教学闭环

实现或纸面设计：

```text
诊断 3 个概念
 -> 生成 1 条学习路径
 -> 给 1 个逐步提示题
 -> 确定性评分
 -> 更新 1 条有证据的 mastery
 -> 再出 1 道迁移题验证
```

## 可直接复制的提问

```text
请按“类比 -> 技术定义 -> 数据流 -> 代码位置 -> 常见误区 -> 3 个自测题”
解释 DeepTutor 的 UnifiedContext，假设我不懂 Agent runtime。
```

```text
请对比 DeepTutor L1/L2/L3、GenMentor LearnerProfile 和 Mem0。
重点回答：写入条件、存储形式、检索方式、可追溯性、冲突处理、隐私风险。
```

```text
请从 projects/DeepTutor/deeptutor/services/session/turn_runtime.py 当前进度继续，
追踪 _run_turn 构建 UnifiedContext 后如何进入 ChatOrchestrator 和 AgentLoop。
每约 50 行停一次，让我确认理解。
```
