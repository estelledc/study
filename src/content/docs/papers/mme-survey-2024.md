---
title: MME-Survey — 多模态 LLM 怎么评才靠谱
来源: 'Fu et al. "MME-Survey: A Comprehensive Survey on Evaluation of Multimodal LLMs". arXiv 2024'
日期: 2026-06-06
分类: 机器学习
子分类: 多模态 LLM
难度: 中级
---

## 是什么

MME-Survey 是一篇讲 **「怎么评多模态大模型」** 的方法论综述。它不主要列榜单名字，而是把评测拆成四步：**benchmark 分几类 → 数据怎么收集标注 → 用什么 judge 和 metric → 用什么 toolkit 跑**。

日常类比：[[mllm-benchmark-survey-2024]] 像商场导购图（告诉你有哪些店）；MME-Survey 像《开店手册》（告诉你怎么选址、装修、收银、盘点）。两张图都要，但解决的问题不同。

## 为什么重要

不懂这篇，下面这些事容易踩坑：

- 为什么同样跑 MME，不同团队报的分差 50 分——prompt、judge、预处理任一不同都不行
- 为什么 LLM-as-judge 流行但争议大——judge 模型、温度、rubric 没写进论文就不可复现
- 为什么 [[lmms-eval]] 能成事实标准——它把「构造 + metric + 批跑」封装成一条命令
- 为什么手工指令-答案对（如 [[mme-benchmark-2023]]）比公开 VQA 数据集更抗泄漏

## 核心要点

1. **Benchmark 三分法**：基础能力（感知/认知）、模型自分析（幻觉、安全）、扩展应用（Agent、GUI）。类比：体检基础项、心理评估、专项运动测试——不能混在一个总分里。

2. **构造三件套**：数据收集 → 人工标注 → 防泄漏注意事项。好 benchmark 的壁垒在**出题**，不在跑分脚本。

3. **系统化评测 = judge + metric + toolkit**：rule-based 适合客观题；LLM-as-judge 适合开放问答但必须固定 rubric；toolkit 负责把三者粘成可复现 pipeline。

## 实践案例

### 案例 1：自建 benchmark 的四步 checklist

```markdown
## 新 benchmark 设计清单
- [ ] 类型：感知 / 认知 / 领域 / 能力？
- [ ] 数据：来源合法？与训练集去重？
- [ ] 标注：双人复核？答案格式统一？
- [ ] 评测：metric 定义？judge 模型版本？开源脚本？
```

### 案例 2：选择 judge 策略

```python
# 客观题：精确匹配
if task_type == "counting":
    score = int(pred.strip() == gold.strip())

# 开放题：固定 GPT-4 judge + 温度 0
elif task_type == "caption":
    judge_prompt = open("rubric_v1.txt").read()  # 必须版本化
    score = gpt4_judge(image, pred, gold, judge_prompt, temperature=0)
```

**解释**：综述强调 judge 选择要和题型匹配，且所有超参写进论文附录。

### 案例 3：接入统一 toolkit

```bash
# 用 lmms-eval 跑多个 benchmark，保证预处理一致
python -m lmms_eval --model qwen2_vl --tasks mme,mmmu --batch_size 1
```

同一 toolkit 避免「MME 用官方脚本、MMMU 自己写」导致的不可比。

搭建内部评测平台时，把「rubric 版本号」写进每次实验 JSON：`{"judge":"gpt-4-0125","rubric":"v3","toolkit":"lmms-eval@abc123"}`。半年后重跑仍能复现，这是本篇强调的 systematic evaluation 落地方式。

开放题评测若用 LLM-as-judge，温度必须 0，且 few-shot 示例固定。综述指出：微调 judge 一句措辞，排名可整体漂移 5–10 个百分点——这不是模型变了，是尺子变了。

人工标注阶段建议双人独立标 + 第三人仲裁不一致样本。MME-Survey 把标注质量放在与模型能力同等重要的位置；脏标注会让再好的 judge 失真。

## 踩过的坑

1. **judge prompt 没版本号**：换一句 rubric，排名全变——复现灾难。

2. **标注格式不统一**：有的答案是 `Yes`，有的是 `yes.`——精确匹配 metric 被标点杀死。

3. **忽略图像预处理**：resize 方式不同，OCR 类分数差一截。

4. **toolkit 隐式依赖**：没锁 transformers 版本，半年后重跑分数漂移。

## 适用 vs 不适用场景

**适用**：
- 要**设计**新 benchmark 或改版旧榜
- 写论文的 Evaluation 章节，需要对齐社区规范
- 搭建内部 MLLM 评测平台

**不适用**：
- 只想查「有哪些 benchmark」→ 读 [[mllm-benchmark-survey-2024]]
- 只想跑一个固定榜拿分数 → 直接看 [[mme-benchmark-2023]] + [[lmms-eval]]
- 深入某个模型的训练细节


## 进阶话题（可跳过）

这一节把前文和工业落地再绑紧一点，方便你读完就能动手选型或读论文。

1. **Judge 审计**：定期用固定 50 题金标集校准 LLM judge，检测 rubric 漂移。
2. **多语言评测**：翻译 prompt 本身引入偏差；综述建议保留原文+人工复核子集。
3. **成本核算**：GPT-4 judge 大规模跑榜费用可观；rule-based 子集应优先自动化。
4. **人机一致率**：报告 human-judge agreement 比单报模型分更可信。
## 历史小故事（可跳过）

- **2023**：[[mme-benchmark-2023]] 用手工 QA 对树立防泄漏标杆。
- **2024 初**：LLM-as-judge 在开放 VQA 普及，复现问题爆发。
- **2024 11 月**：MME-Survey 发布，系统总结构造与评测流程。
- **同期**：[[lmms-eval]] 等 toolkit 成为工业界默认入口。

## 学到什么

1. **评测质量 = 出题质量 × 判分质量 × 工具可复现性**
2. **清单类综述和方法论综述要配对读**
3. **judge 和 metric 必须写进实验协议，不是实现细节**
4. **toolkit 版本和 rubric 版本一样重要**

## 延伸阅读

- 论文 PDF：[arXiv 2411.15296](https://arxiv.org/abs/2411.15296)
- [[mllm-benchmark-survey-2024]] —— 200+ benchmark 分类地图
- [[mme-benchmark-2023]] —— 手工 QA 对的具体实现范例
- [[lmms-eval]] —— 开源统一评测 toolkit
- 视频：[LMMs-Lab 评测讲座](https://www.youtube.com/results?search_query=multimodal+llm+evaluation)

## 关联

- [[mllm-benchmark-survey-2024]] —— 列「评什么」，本篇讲「怎么评」
- [[mme-benchmark-2023]] —— 防泄漏手工基准的标杆案例
- [[lmms-eval]] —— 综述推荐的 toolkit 实践
- [[gemini-1.5-2024]] —— 长上下文评测需特殊 metric 设计
- [[qwen2-vl-2024]] —— 工业模型评测协议参考
- [[clip]] —— 很多感知类 metric 的底层假设


- 入门路径：先读「是什么」+「核心要点」，跑通一个最小案例后再翻「进阶话题」。
- 复习抓手：把「为什么重要」四条用自己的话复述一遍，能讲给同事即算掌握。
- 与仓库其他笔记：用文内 [[wikilink]] 跳到已写条目，别孤立读单篇。

- 评测平台 README 应链到 rubric 文件与 judge 版本。
- 开放题建议同时报 automatic 与 human 子集分数。
- 构造新榜时先定 metric 再定模型，顺序反了会返工。
- 工具链锁定 commit hash 是复现最低要求。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
