---
title: MedCase-Structured — 把病例文字变成 FHIR 病历来考 LLM
来源: 'Valentina Bui Muti, Eugenie Dulout, and Ziquan Fu, "MedCase-Structured: A Text-to-FHIR Dataset for Benchmarking Diagnostic Reasoning in Clinically Realistic EHR Settings", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 初级
---

## 是什么

MedCase-Structured 是一个**把医生写的病例故事，改写成医院系统能交换的 FHIR 结构化病历，再用来考大模型诊断能力**的数据集。日常类比：以前考试给学生一篇病人故事；现在把故事拆成挂号单、化验单、用药单、诊断单，让学生从一叠表格里还原病情。

FHIR 是医疗系统交换数据的标准格式。它不是一篇顺滑的文章，而是一组资源：Patient 写患者，Encounter 写就诊，Condition 写病情，Observation 写指标，MedicationRequest 写用药。

这篇论文的核心不是“又做了一个医学问答榜单”，而是问：如果真实临床系统给 LLM 的不是作文，而是一包 FHIR JSON，它还能像读自然语言那样诊断吗？

答案很刺眼：作者把 MedCaseReasoning 的临床病例转成 FHIR R4 bundle，最终放出 **1,732** 份有效 bundle（对已处理病例约 **97.1%** 成功）；但同一批模型在结构化 FHIR 输入上的诊断准确率，普遍低于纯文本输入。

## 为什么重要

不理解 MedCase-Structured，下面这些事很容易误判：

- 医学 LLM 在问答榜上高分，不等于接进医院 EHR 后也高分，因为输入格式换了，推理负担也换了。
- “结构化数据更干净”不等于“模型更容易读”，FHIR 会把线索分散到许多资源和字段里。
- 合成医疗数据不是随便编 JSON，临床术语码、资源关系、诊断泄漏都会影响评测可信度。
- 如果 benchmark 只用纯文本病例，可能高估 clinical decision support system 在真实部署里的能力。

## 核心要点

1. **任务是 text-to-FHIR + diagnosis benchmark**。类比：先把作文拆成标准表单，再把答案栏遮住，让另一个人根据表单猜诊断。论文既关心能不能生成合法 FHIR，也关心 LLM 读 FHIR 后诊断得准不准。

2. **生成流程是“分阶段 LLM + 术语 grounding + 规则返工”**。类比：实习生先填病历，质控查药品码/检查码，错了退回重填。固定阶段包括：抽取临床信息、术语候选重排（SapBERT/FAISS）、合成 FHIR、语义泄漏扫描；校验失败再进 repair loop。

3. **最重要结果是结构化输入让诊断更难**。类比：同一道题，从“病人故事”换成“医院系统导出的表格包”，人类专家可能更熟，普通读者却更累。论文中 GPT、Gemini、Claude 系列模型在 FHIR 输入上的准确率多数下降，few-shot 也没有稳定救回来。

## 实践案例

### 案例 1：一段病例怎样变成 FHIR 资源

```json
{
  "resourceType": "Bundle",
  "entry": [
    { "resource": { "resourceType": "Patient", "gender": "female" } },
    { "resource": { "resourceType": "Condition", "code": { "text": "fever" } } },
    { "resource": { "resourceType": "Observation", "valueString": "rash on arm" } }
  ]
}
```

**逐部分解释**：

- `Bundle` 像一个病例文件夹，里面装多张标准化单据。
- `Patient` 存基本人口学信息，不负责写完整病情。
- `Condition` 和 `Observation` 把症状、体征、检查结果分散保存；模型必须跨资源拼回完整故事。

### 案例 2：为什么要做术语 grounding

```ts
const code = llmOutput.loincCode
if (!terminologyStore.has(code)) {
  return repairWithNearestTerm(llmOutput.displayText)
}
return accept(code)
```

**逐部分解释**：

- LLM 可能编出看起来像真的 LOINC、RxNorm、SNOMED CT 编码。
- `terminologyStore.has` 像查字典：码不存在，不能让它混进正式病历。
- `repairWithNearestTerm` 用关键词和 SapBERT 相似度找候选，能修就修，不能修就拒绝。

### 案例 3：诊断遮蔽为什么是评测生命线

```json
{
  "mode": "HIDDEN",
  "remove": ["primary diagnosis code", "diagnosis synonyms"],
  "scan": "LLM checks remaining narrative fields"
}
```

**逐部分解释**：

- 如果 FHIR 里还留着最终诊断，模型只是在抄答案。
- `HIDDEN` 模式删除主诊断，`NONE` 模式删除全部诊断结论。
- 作者还让第三阶段 LLM 扫 narrative 字段，避免缩写、同义词、暗示性描述漏出来。

## 踩过的坑

1. **把 FHIR 当成普通 JSON**：普通 JSON 只要语法合法就行，FHIR 还要求资源类型、字段、编码体系和临床含义互相对得上。

2. **以为结构化一定提升准确率**：结构化会减少歧义，但也会打散叙事顺序，LLM 需要自己重组时间线和证据链。

3. **忽略术语码幻觉**：医学编码不是装饰，错码会让后续检索、规则系统和评测全部偏掉。

4. **让答案偷偷留在输入里**：诊断泄漏会把 benchmark 变成开卷抄题，所以论文专门做 code、substring 和 semantic 三层过滤。

## 适用 vs 不适用场景

**适用**：

- 想评测 LLM 在 EHR / FHIR 风格输入上的诊断推理能力。
- 想研究从病例文本生成结构化合成病历的流程设计。
- 想做可控临床 benchmark，而不是只依赖固定真实患者数据。
- 想训练或测试 clinical decision support system 对标准医疗资源的读取能力。

**不适用**：

- 需要真实世界临床验证的安全结论，因为合成数据不能替代真实病人数据。
- 需要完整长期病程建模的任务，论文当前没有充分覆盖纵向患者轨迹。
- 需要所有 FHIR 资源类型的系统，当前只支持 Patient、Encounter、Condition、Observation 等有限集合。
- 需要影像细节推理的病例，作者过滤了大量依赖 imaging 的样本。

## 历史小故事（可跳过）

- **2018 年前后**：Synthea 这类工具让大家能生成合成患者记录，并导出 FHIR，解决隐私和共享问题的一部分。
- **2023 年**：MIMIC-IV on FHIR 把真实 ICU 数据映射成可交换格式，但它更像“事后翻译”，不是专门为可控诊断评测生成。
- **2024-2026 年**：FHIR-GPT、Infherno 等工作开始用 LLM 从自由文本合成 FHIR 资源。
- **2025 年**：MedCaseReasoning 收集医生写的病例推理题，给 MedCase-Structured 提供了原始病例和最终诊断。
- **2026 年**：这篇论文把 text-to-FHIR 生成、术语校验、诊断遮蔽和 LLM 诊断评测串成一条 benchmark 管线。

## 学到什么

1. **benchmark 要贴近部署形态**：如果未来系统读的是 EHR，那么只测纯文本病例就是少测了一层关键难度。

2. **医疗结构化数据的难点在语义一致性**：FHIR 合法、术语码真实、资源之间不矛盾，三件事要同时成立。

3. **LLM 既是生成器也是被考生**：论文用 LLM 帮忙生成和检查 FHIR，再用同类模型做诊断评测，这要求额外小心泄漏和偏差。

4. **97.1% 有效生成说明流程可用但仍有缺口**：约 2.9% 因术语轴不匹配或校验失败被丢掉；失败主因仍是术语覆盖、幻觉码和过细描述。

## 延伸阅读

- 论文 PDF：[MedCase-Structured 2026](https://arxiv.org/pdf/2605.30295v1.pdf)（本文主论文，重点看 Method 和 Table 3）
- 相关数据集：[MedCaseReasoning](https://arxiv.org/abs/2505.11733)（原始病例来源，提供医生式诊断推理题）
- 医疗数据标准：[HL7 FHIR R4](https://hl7.org/fhir/R4/index.html)（理解 Bundle、Patient、Observation 的官方入口）
- 相关转换：[MIMIC-IV on FHIR](https://doi.org/10.1093/jamia/ocad002)（把真实 EHR 数据映射到 FHIR 的代表工作）
- [[rag-lewis-2020]] —— 读结构化病历时，检索和证据拼接会变得更重要
- [[bert]] —— SapBERT 这类医学实体表示模型，思想上来自 BERT 表示学习路线

## 关联

- [[medcase-reasoning]] —— MedCase-Structured 的原始病例与标准诊断来源
- [[fhir-agentbench]] —— 同样关心 LLM 在 FHIR / EHR 环境里的真实任务表现
- [[ehrstruct]] —— 结构化 EHR benchmark，说明输入格式会改变模型能力边界
- [[mimic-iv-fhir]] —— 真实 ICU 数据转 FHIR，和本文的合成可控路线形成对照
- [[synthea]] —— 合成患者记录生成器，是 FHIR 合成数据的重要前史
- [[rag-lewis-2020]] —— FHIR bundle 证据分散，后续系统可能需要检索增强来读完整病例
- [[bert]] —— SapBERT 负责术语相似度 grounding，延续了 BERT 式向量表示思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
