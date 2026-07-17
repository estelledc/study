# 04. 学习路线与关键思考题

## 1. 推荐学习顺序

不要同时精读 27 个项目。按一条最小链逐步增加复杂度。

### 第一段：建立最小自动研究闭环

1. ResearchStudio：理解 skill、asset 和确定性门。
2. AI-Scientist：理解 `idea → experiment → paper → review`。
3. PaperQA2：理解证据检索与回答不是同一件事。

完成标志：能画出三者的输入、输出、状态和失败点。

### 第二段：理解状态与恢复

1. AutoR：学习 stage contract、manifest、approval、resume。
2. AI-Scientist-v2：学习为什么实验需要分支树。
3. Co-Scientist：学习任务队列、lease、幂等和终止器。

完成标志：能解释“聊天上下文”“工作流状态”“研究证据”为什么是三种不同数据。

### 第三段：理解 idea 质量

1. ResearchStudio Idea。
2. Idea2Paper 的 Paper-KG 和 anchored review。
3. STORM 的多视角提问。
4. ARA 的 claim-evidence binding。

完成标志：能区分新颖、可行、重要、可证伪和有证据五个维度。

### 第四段：理解传播产物

1. ResearchStudio Reel 的共享 asset bundle。
2. posterly 的设计锁定和确定性 gates。
3. PosterGen 的显式 state graph。
4. Paper2Slides 的 checkpoint。
5. Paper2Video 的媒体组合和评价。

完成标志：能说明“视觉好看”“内容正确”“尺寸可打印”“可继续编辑”分别由什么机制保证。

## 2. 基础问题

### 生态定位

1. ResearchStudio 为什么不是完整 AI Scientist？
2. 文献检索、idea 生成、实验执行、论文写作和传播为什么应拆层？
3. skill-first 和传统 Python application 的主要区别是什么？
4. 为什么多模态传播系统需要共享 paper asset，而不是每个产物重新读 PDF？

### 状态

5. 一个研究任务最少需要保存哪些状态才能恢复？
6. 为什么只保存最终论文不能解释研究过程？
7. manifest、SQLite、pickle 和 Markdown 分别适合什么场景？

### 质量

8. LLM reviewer 能检查什么，不能检查什么？
9. 引用存在是否等于引用支持 claim？
10. 海报不溢出是否等于海报质量好？

## 3. 中级问题

### 架构选择

1. 什么情况下线性 pipeline 已经足够，什么情况下需要图或搜索树？
2. Co-Scientist 的数据库任务队列相对普通 asyncio task 多解决了什么？
3. AutoR 为什么把人工 approval 作为协议，而不是临时询问？
4. ResearchStudio 如果增加恢复能力，应该引入数据库还是最小 manifest？

### 科研有效性

5. AI-Scientist 的模板限制是安全护栏还是创新瓶颈？
6. 多智能体互评为何可能产生“集体自信但共同错误”？
7. novelty search 应怎样处理同义词、负结果和未正式发表工作？
8. 自动实验系统如何防止对 benchmark 或 reviewer 过拟合？

### 视觉与传播

9. Paper2Poster 的布局搜索和 posterly 的 HTML 测量门有什么本质差异？
10. 视觉模型评审为什么不能代替几何计算？
11. 论文图表经过重绘后，如何保持数据和方法含义不变？
12. 一份 claim 如何在 paper、poster、slides 和 video 中共享而不复制漂移？

## 4. 高级设计题

### 设计题 A：ResearchStudio run manifest

请设计最小字段：

- 输入论文和 hash。
- skill 与版本。
- 模型与配置。
- stage 状态。
- 产物及其来源。
- gate 结果。
- 预算和停止原因。

思考：哪些字段属于可重建派生物，哪些必须永久保存？

### 设计题 B：Idea provenance graph

将 idea card 拆成：

`problem → evidence → bottleneck → hypothesis → prediction → experiment → risk`

思考：

- 一条证据能否支持多个节点？
- 冲突证据怎样表示？
- 哪个节点修改后必须使下游结论失效？

### 设计题 C：受限实验 adapter

假设 ResearchStudio 不直接拥有任意 shell 权限，只能调用：

`prepare(plan) → run(config, budget) → collect() → verify()`

思考：

- 如何限制路径、时间、GPU 和网络？
- 失败是模型失败、代码失败、环境失败还是假设失败？
- 哪些结果可以自动回写 idea card？

### 设计题 D：统一产物质量门

为 poster、slides、video、blog 设计共享门和专属门：

- 共享：claim evidence、引用、asset provenance。
- poster：尺寸、溢出、打印质量。
- slides：逐页密度、演讲节奏。
- video：音画同步、字幕、时长。
- blog：结构、链接、可访问性。

思考：哪些门必须阻断，哪些只警告？

## 5. 容易混淆的概念

| 错误认知 | 正确理解 |
|---|---|
| agent 数越多，研究越可靠 | agent 只增加搜索和视角，可靠性来自证据、独立验证与停止规则 |
| 能生成论文就是完成研究 | 论文文本只是结果表达，实验与证据链才决定可信度 |
| 有引用就是 grounded | 引用可能无关、范围不符或被错误概括 |
| 状态文件只是缓存 | 对长程研究，状态是恢复、审计和交接协议 |
| 全自动代表更先进 | 自动化程度是产品选择，不是科学质量指标 |
| 视觉模型可以检查所有版式 | 几何、分辨率和 PDF 尺寸应由确定性工具检查 |

## 6. 后续提问索引

提问时可直接使用以下格式：

- “讲解项目 X 的主调用链，从入口到状态落盘。”
- “对比项目 X 和 Y 的恢复机制，给一个最小例子。”
- “只精读某个文件，不扩展到整个仓库。”
- “把思考题 A 拆成一节零基础短课。”
- “检查某项结论在 pinned commit 中的代码证据。”

建议每次只选一条最小链，例如：

`AutoR ResearchManager → stage attempt → approval → manifest update`

这样比一次阅读整个仓库更容易形成可验证理解。
