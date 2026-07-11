---
title: Argilla — 给 LLM 训练数据做人工反馈的开源标注平台
来源: https://github.com/argilla-io/argilla
日期: 2026-05-31
分类: 数据标注 / LLM 工具链
难度: 中级
---

## 是什么

Argilla 是一套**给 AI 训练数据做"人工反馈"的开源协作平台**。日常类比：训练一个新厨子，你不能只把菜谱（数据）扔给他，还得有人**真的尝一口**告诉他"这道偏咸""这道更好"。Argilla 就是把这个"尝菜 + 打分 + 留言"的流程，搬到一个网页里给一群标注员协同做。

它的定位很专一：

- 不是通用图片/语音标注（那是 Label Studio 的地盘）
- 不是商业付费工具（那是 Prodigy）
- 它**专门服务 LLM/NLP 训练场景**——文本分类、NER、RLHF 偏好对、DPO chosen/rejected、评测打分

2024 年 6 月被 Hugging Face 收购，等于成了 HF 数据集生态的官方"前端"。

## 为什么重要

不理解 Argilla 的位置，就接不上现代 LLM 训练流水线：

- **RLHF/DPO 必须要人类偏好数据**：模型说出 A 和 B 两个回答，谁更好？这件事只有人能判，Argilla 是 OSS 里第一个把这个流程产品化的工具
- **Hugging Face 官方加持**：被收购后，和 `datasets` / `transformers` / `trl` 的集成是一等公民——标注完一行 `dataset.to_hub()` 就推上去了
- **替代闭源标注的开源选项**：Scale AI / Surge 这种付费数据公司很贵，自建团队 + Argilla 是预算敏感场景的标准答案
- **数据中心的 AI（data-centric AI）入口**：模型代码大家都差不多，差距越来越靠数据质量；Argilla 就是这把"数据质量手术刀"

## 核心要点

Argilla 2.0 的概念模型可以拆成 **四件套**：

1. **Dataset**：一份待标注的数据集，比如"5000 条用户问题 + 模型两个候选回答"

2. **Settings**：定义这个数据集长什么样，包含两个子概念：
   - **Fields**：展示给标注员看的**只读内容**（如 prompt、response_a、response_b）
   - **Questions**：让标注员回答的**互动问题**（label / rating / ranking / 自由文本）

3. **Workspace**：多人协作的命名空间，控制谁能看、谁能标

4. **Suggestion**：模型预标注作为"建议值"，标注员只需调整。这是 active learning（主动学习——让模型先猜、人只改错）的入口

```python
import argilla as rg

settings = rg.Settings(
    fields=[rg.TextField(name="prompt"), rg.TextField(name="response")],
    questions=[
        rg.RatingQuestion(name="quality", values=[1, 2, 3, 4, 5]),
        rg.LabelQuestion(name="safe", labels=["safe", "unsafe"]),
    ],
)
dataset = rg.Dataset(name="my-eval", settings=settings)
dataset.create()
```

四件套之外，还有一条**铁律**：底层必须有 Elasticsearch / OpenSearch，因为 Argilla 把"按字段过滤 + 全文搜"当一等能力，不挂搜索引擎跑不起来。

## 实践案例

### 案例 1：做一份 DPO 偏好对数据

DPO 训练要"被选中（chosen）vs 被拒绝（rejected）"两个回答的偏好对。Argilla 配置：

```python
settings = rg.Settings(
    fields=[
        rg.TextField(name="prompt"),
        rg.TextField(name="response_a"),
        rg.TextField(name="response_b"),
    ],
    questions=[
        rg.RankingQuestion(name="preference", values=["response_a", "response_b"]),
    ],
)
```

标注员看到 prompt + 两个候选回答，拖拽排序。导出时一行代码就变成 `trl` 能直接吃的格式。

### 案例 2：评测数据集打分

要给 1000 个问答对每个打 1-5 分，作为 reward model 的训练材料：

```python
questions=[
    rg.RatingQuestion(name="helpfulness", values=[1, 2, 3, 4, 5]),
    rg.TextQuestion(name="comment", required=False),
]
```

5 个标注员独立打分，Argilla 自动算 inter-annotator agreement，分歧大的样本会被高亮——这是质量管控的核心。

### 案例 3：和 distilabel 配合做合成数据

Argilla 同公司还出了 distilabel（合成数据生成库）。组合用法：

```
distilabel 用大模型批量生成候选 → Argilla 让人工筛选/修正 → 推回 HF Hub
```

这是当前 OSS 圈做"高质量小数据"的主流配方。

## 踩过的坑

1. **1.x 和 2.0 不兼容**：旧教程里 `FeedbackDataset` 那套写法在 2.0 全废弃，统一成 `Dataset + Settings`。看教程先确认版本号

2. **必须挂 ES/OpenSearch**：Docker compose 起 Argilla 会带一个 ES 容器，本地玩玩没问题；生产部署得自己规划 ES 集群（内存 8GB+ 起）

3. **RLHF 选 RankingQuestion 不是 LabelQuestion**：LabelQuestion 只能"二选一打勾"，RankingQuestion 能拖拽排序，导出时才有"chosen/rejected"语义

4. **中文字段偶尔被截断**：前端 CSS 在长 prompt + CJK 字符时偶发换行问题，给 `TextField` 显式 `use_markdown=True` 通常能修

5. **Suggestion 不会自动变成答案**：模型预标注只是"建议值"，标注员**必须点确认**才算数。第一次用很容易以为"模型标完就是标完了"

6. **Workspace 权限是粗粒度**：要么全读要么全写，没有"只看自己标的"细粒度。多人对同一份数据互相看得见，需要做"盲标"得自己复制多份数据集

## 适用 vs 不适用场景

**适用**：

- LLM 微调数据准备（SFT / DPO / RLHF / instruction tuning）
- 评测数据集人工打分（rating / ranking）
- NER / 文本分类的标注（已经有 spaCy 流程也能用）
- 合成数据 + 人工 review 的混合流程
- HF 生态内的端到端：标注 → push_to_hub → 训练

**不适用**：

- 多模态（图像 / 音频 / 视频）→ 用 Label Studio
- 单人快速脚本式标注 → 用 Prodigy（如果买得起 spaCy 商业版）
- 简单分类 / NER 不需要协作 → 用 doccano，部署轻
- 不带搜索后端的极简部署 → Argilla 强依赖 ES

## 历史小故事（可跳过）

- **2017 年**：Argilla 前身 Rubrix 开始围绕 NLP 标注和主动学习做开源工具。
- **2021 年**：项目更名为 Argilla，重点转向团队协作的数据标注与模型反馈闭环。
- **2023 年**：LLM 微调和 RLHF 爆发后，Argilla 把 Feedback Dataset、ranking、rating 等工作流推到台前。
- **2024 年**：Hugging Face 收购 Argilla，标志着 HF 生态开始补齐"数据生产"这一环。

## 学到什么

1. **专一比通用更值钱**：Label Studio 啥都能标，但 LLM 团队选 Argilla——因为 RLHF 流程默认配齐
2. **数据中心 AI 在崛起**：模型代码同质化越严重，标注/筛选/反馈工具越关键。Argilla 押对了这个方向
3. **被 HF 收购的信号**：HF 在补"数据生产-训练-评测"全链路，Argilla 占了第一格——这种生态位收购通常会带来快速整合
4. **抽象演进的代价**：1.x → 2.0 概念合并是好事，但所有旧教程作废，迁移成本可观——开源工具用前要看版本节奏

## 延伸阅读

- 官网：[argilla.io](https://argilla.io/)（含 demo 视频）
- 源码：[github.com/argilla-io/argilla](https://github.com/argilla-io/argilla)
- 文档：[docs.argilla.io](https://docs.argilla.io/)（2.0 版本入口）
- HF 收购公告：[huggingface.co/blog/argilla-acquisition](https://huggingface.co/blog/argilla-acquisition)
- PyPI：[pypi.org/project/argilla](https://pypi.org/project/argilla/)
- distilabel 合成数据库：[github.com/argilla-io/distilabel](https://github.com/argilla-io/distilabel)
- [[trl]] —— HF 的 RLHF/DPO 训练库，Argilla 标注出的偏好对最常用的下游
- [[accelerate]] —— HF 训练加速，下游训练栈

## 关联

- [[trl]] —— Argilla 输出的 chosen/rejected 数据直接给 trl 做 DPO/RLHF
- [[accelerate]] —— 标注完进入 trl/accelerate 的训练流水线
- [[lm-evaluation-harness]] —— 评测端，Argilla 做评测数据准备
- [[autotrain]] —— HF 的零代码训练，和 Argilla 标注端搭配最顺
- [[langfuse]] —— 偏向 LLM 应用观测和评估，Argilla 偏向训练数据生产，互补不重叠

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
