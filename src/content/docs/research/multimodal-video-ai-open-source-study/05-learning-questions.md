---
title: "学习路线与关键问题"
sidebar:
  hidden: true
---
# 学习路线与关键问题

## 1. 使用方式

这份材料刻意不把所有答案压成结论。后续学习建议遵循：

1. 先回答问题，形成自己的判断；
2. 再看答题索引中的源码；
3. 区分“代码怎么做”和“为什么适合当前场景”；
4. 涉及全智评改造时，先定义 baseline 和独立验收，不直接改生产代码。

## 2. 三档阅读路线

### 2.1 30 分钟：建立领域地图

阅读：

1. [README](README.md)
2. [生态地图第 2、5、7 节](02-ecosystem-landscape.md)
3. [横向比较第 1、4、8 节](04-comparison-and-quanzhiping.md)

应能回答：

- 视频 AI 应用为什么不等于 VLM？
- 全智评和通用视频问答的差异是什么？
- 当前最值得补的能力是什么？

### 2.2 2 小时：理解三条核心机制

#### 机制 A：主动取证

阅读：

- DVD；
- OmAgent；
- watch-skill。

目标：

- 理解全局摘要、语义定位和原帧回看的关系；
- 能设计一个有预算和停止条件的 EvidencePlan。

#### 机制 B：领域评价

阅读：

- proteomics_lab_agent；
- 全智评 CCAE 对照章节。

目标：

- 区分“描述发生了什么”和“按标准判断是否正确”；
- 能解释步骤状态、反证复看和确定性评分。

#### 机制 C：多模态数据层

阅读：

- watch-skill SQLite；
- multimodal-rag Pixeltable；
- 全智评 PostgreSQL/Redis。

目标：

- 能划分业务事实、派生证据和短期任务状态；
- 不把向量数据库当成架构目标。

### 2.3 半天：准备最小实验

1. 选一个真实错误类别，例如“关键动作发生过快”。
2. 固定 10-30 个视频样本和教师标注。
3. 记录当前均匀抽帧 baseline。
4. 只引入一个变量：场景帧、CLIP 相关帧或主动回看。
5. 比较步骤级 FP/FN、token、帧数和耗时。
6. 只有达到独立验收才讨论生产接入。

## 3. 基础理解问题

### Q1：为什么视频不是“很多张图片”？

答题要点：

- 时间先后；
- 动作持续与状态变化；
- 音画对齐；
- 帧间缺失；
- 证据必须绑定时间范围。

答题索引：

- [生态地图 2.2-2.4](02-ecosystem-landscape.md)
- `projects/DeepVideoDiscovery/dvd/frame_caption.py`

### Q2：ASR、OCR、视觉描述各自能证明什么？

提示：

- “说了”；
- “屏幕写了”；
- “画面发生了”；
- 三者何时互相印证，何时冲突？

答题索引：

- [生态地图 5.3](02-ecosystem-landscape.md)
- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/tools/extract_modal_info.py`
- `explorations/own/quanzhiping-ci-local/backend/app/services/avi/prompts.py`

### Q3：为什么检索到高相似片段仍不能直接给高分？

提示：

- 相似度只说明相关；
- 描述可能错误；
- 评分需要领域条件；
- 还要找反面证据。

答题索引：

- [横向比较 3.1-3.3](04-comparison-and-quanzhiping.md)
- `projects/watch-skill/src/watch_skill/answer/engine.py`

### Q4：固定抽帧、场景抽帧和查询相关抽帧怎样组合？

要求：

- 不允许只回答“选最智能的”；
- 说明 baseline、增量帧和 Phase 2。

答题索引：

- [横向比较 2.2](04-comparison-and-quanzhiping.md)
- `projects/watch-skill/src/watch_skill/perceive/engine.py`
- `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/frame_selection_ecrs/ECRS_frame_selection.py`

### Q5：什么是“证据索引”，它和评价结果有什么不同？

提示：

- 派生物与事实源；
- 可重建；
- 时间戳；
- 模型/模板版本；
- 人工覆写。

答题索引：

- [横向比较 2.3、4.4](04-comparison-and-quanzhiping.md)
- `projects/watch-skill/src/watch_skill/index/db.py`

## 4. 架构比较问题

### Q6：Director 与 LangGraph 的编排差别是什么？

比较：

- 每轮 LLM tool call；
- 显式状态图；
- 终态；
- 错误恢复；
- 适合探索还是生产主线。

答题索引：

- `projects/Director/backend/director/core/reasoning.py`
- `projects/multimodal-rag-agent/multimodal-api/src/multimodal_api/agent/graph.py`

### Q7：VideoAgent 的动态 DAG 为什么不能直接用于评分主链？

提示：

- 图生成者和 judge 都是 LLM；
- 幂等、权限、预算和数据类型；
- 评分公式和模板版本。

答题索引：

- `projects/VideoAgent/environment/agents/multi.py`
- [横向比较 2.4](04-comparison-and-quanzhiping.md)

### Q8：DVD 和 OmAgent 都会回看视频，它们有什么差异？

建议从以下维度比较：

- 预处理表示；
- 工具粒度；
- 任务分解；
- 记忆；
- 停止条件；
- 部署重量。

答题索引：

- [逐项目 4、5](03-project-deep-dives.md)

### Q9：Pixeltable 与 PostgreSQL + Redis 谁更适合全智评？

禁止直接二选一。应先区分：

- 业务事务；
- 多模态派生数据；
- 异步协调；
- 多租户权限；
- 实验与生产。

答题索引：

- [横向比较 2.3](04-comparison-and-quanzhiping.md)
- `projects/multimodal-rag-agent/multimodal-mcp/src/multimodal_mcp/video/ingestion/video_processor.py`

### Q10：为什么 watch-skill 的置信度不能直接照搬到 CCAE？

提示：

- 检索问答和步骤分类的标签不同；
- lexical anchor 与动作完成；
- 模型自报 confidence；
- 教师 benchmark。

答题索引：

- `projects/watch-skill/src/watch_skill/answer/confidence.py`
- [横向比较 3.2](04-comparison-and-quanzhiping.md)

## 5. 领域评价问题

### Q11：proteomics 的协议对照和 CCAE 有哪些共同不变量？

至少找出：

- 标准先于观察；
- 逐步核对；
- 时间戳；
- 反面证据；
- 不可确认；
- 人工反馈。

答题索引：

- `projects/proteomics_lab_agent/proteomics_lab_agent/sub_agents/lab_note_generator_agent/prompt.py`
- `explorations/own/quanzhiping-ci-local/docs/guides/CCAE-评估算法改进说明.md`

### Q12：“漏做”和“没拍到”怎样区分？

要求提出可观测字段和评测指标，而不只是 prompt 文案。

可考虑：

- `status`；
- `camera_issue`；
- evidence quality；
- template blind spot；
- human review；
- benchmark label。

### Q13：为什么最终分数应由后端计算？

提示：

- 一致性；
- 审计；
- 版本；
- 可测试；
- 模型输出只负责状态和证据。

答题索引：

- `explorations/own/quanzhiping-ci-local/docs/guides/CCAE-评估算法改进说明.md:67-82`

### Q14：教师覆写应该怎样进入学习闭环？

设计一个流程，必须包含：

- 分类；
- 去重；
- 人工确认；
- 输入快照；
- 期望输出；
- 版本回放；
- promote gate。

答题索引：

- [横向比较 4.5](04-comparison-and-quanzhiping.md)
- `projects/watch-skill/src/watch_skill/lessons/`
- `projects/proteomics_lab_agent/eval/eval_lab_note_generation/`

### Q15：何时应该使用原生视频模型？

从以下角度权衡：

- 时序能力；
- 可审计性；
- 隐私；
- 重复成本；
- 供应商；
- 评价任务还是生成任务。

## 6. 可靠性与生产问题

### Q16：如果主动回看工具调用失败，评价状态应如何收敛？

要求覆盖：

- 可恢复失败；
- 预算耗尽；
- 无新证据；
- 外部 API 故障；
- 原始 Phase 1 结果；
- 人工复核。

### Q17：如何防止同一作业重复评价和重复扣费？

提示：

- idempotency key；
- 状态机；
- immutable tail；
- 派生证据 cache；
- retry 与 rerun 的区别。

答题索引：

- `explorations/own/quanzhiping-ci-local/backend/app/tasks/evaluation_tasks.py`

### Q18：多 Agent 或多工具并发时，哪些状态必须有唯一事实源？

可讨论：

- 作业状态；
- 帧；
- ASR；
- evaluator 版本；
- Token；
- 人工覆写；
- 临时推理 trace。

### Q19：为什么“测试文件很多”仍不证明视频评价正确？

区分：

- 单元测试；
- schema 测试；
- 工具 wire-format；
- benchmark；
- 真视频端到端；
- 用户/教师效果。

### Q20：许可证未知对研究和复用有什么影响？

提示：

- fork/clone；
- 阅读学习；
- 复制代码；
- 商业分发；
- 依赖引入。

## 7. 设计练习

### 练习 A：EvidencePlan

为“使用天平时读取游码左侧刻度”设计一个 JSON schema。

至少包含：

- step；
- hypothesis；
- required evidence；
- tools；
- time windows；
- budget；
- stop condition；
- possible outcomes。

检查标准：

- 不能让模型任意调用 shell；
- 不能直接决定分数；
- 每个动作可审计；
- 预算有限。

### 练习 B：步骤级 benchmark

为 20 个视频设计最小数据表。

至少包含：

- 视频/作业 ID；
- 模板版本；
- step ID；
- ground truth status；
- evidence window；
- camera issue；
- evaluator status；
- teacher override；
- FP/FN 分类。

### 练习 C：选帧 A/B

设计：

- baseline；
- treatment；
- 固定变量；
- 指标；
- 成功阈值；
- 失败退出；
- 成本上限。

### 练习 D：证据复核 UI

参考 Director 的 compilation，画出教师复核交互：

- 模板步骤；
- AI 状态；
- 证据短片；
- ASR；
- 置信度；
- 覆写；
- 纠错原因；
- 保存为 eval case。

## 8. 推荐精读入口

### 8.1 最容易读懂

1. `projects/DeepVideoDiscovery/dvd/dvd_core.py`
2. `projects/Director/backend/director/core/reasoning.py`
3. `projects/watch-skill/src/watch_skill/watch.py`

### 8.2 最值得迁移

1. `projects/watch-skill/src/watch_skill/answer/engine.py`
2. `projects/proteomics_lab_agent/proteomics_lab_agent/sub_agents/lab_note_generator_agent/prompt.py`
3. `projects/OmAgent/examples/video_understanding/agent/tools/video_rewinder/rewinder.py`
4. `projects/ReAgent-V/ReAgent-V/ReAgentV_utils/tools/extract_modal_info.py`

### 8.3 最适合产品分层学习

1. `projects/multimodal-rag-agent/docker-compose.yml`
2. `projects/multimodal-rag-agent/multimodal-api/src/multimodal_api/agent/graph.py`
3. `projects/multimodal-rag-agent/multimodal-mcp/src/multimodal_mcp/video/ingestion/video_processor.py`

### 8.4 最需要谨慎阅读

- VideoAgent：先读 `environment/agents/`，不要从内嵌模型子树开始。
- OmAgent：先读 video example，再读 DnC，不要一开始展开全部 Conductor SDK。
- ReAgent-V：只读 `ReAgent-V/` 视频主链，`Application/VLA-Alignment` 是另一条大分支。

## 9. 后续提问模板

可直接使用：

```text
请对比 DVD 和 OmAgent 的主动回看机制，重点解释数据流、停止条件和全智评可迁移部分。
```

```text
请精读 watch-skill 的 answer_question，只讲置信度、升级和 honest floor，并判断哪些不能用于 CCAE。
```

```text
请把 proteomics_lab_agent 的协议对照 prompt 映射到全智评 Phase 1/2/3。
```

```text
请为全智评设计一个最小 EvidencePlan schema，先不改代码。
```

```text
请基于这套材料设计场景抽帧 A/B 验证清单，先确定 baseline 和样本。
```

## 10. 自测标准

真正理解后，应能做到：

- 不把“多模态”“视频 RAG”“Agent”“评价”混为一谈；
- 看到一个新项目时能判断它覆盖哪一层；
- 能指出 README 功能与源码主链的差异；
- 能为主动取证定义预算和停止条件；
- 能解释业务事实与派生证据的边界；
- 能用步骤级 FP/FN 设计验证，而不是只说“效果更好”；
- 能明确哪些机制应进入生产，哪些只做离线实验。
