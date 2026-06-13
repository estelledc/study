---
title: MedCase-Structured — Text-to-FHIR 临床诊断推理数据集（零基础学习笔记）
来源: https://arxiv.org/abs/2605.30295
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：病历口述 vs 医院信息系统

想象你是一名住院医，向主任汇报病例时有两种方式：

- **口述版（纯文本）**：「45 岁女性，左臂和腋下起水疱样皮疹三天，伴主观发热，既往无特殊……」——信息都在一段话里，主任靠临床经验串起来想诊断。
- **系统版（结构化 EHR）**：同一位病人已经录进医院信息系统：人口学在 **Patient**，就诊在 **Encounter**，主诉拆成多条 **Condition**，化验在 **Observation**，每条还带 **SNOMED CT / LOINC / RxNorm** 标准编码。主任要在表格、编码和引用关系里「拼图」。

很多 AI 论文只在**口述版**上测诊断准确率——像在作文比赛里拿高分。真正部署到临床决策支持系统（CDSS）时，模型面对的是**系统版**：FHIR Bundle、术语表、资源引用、日期字段、诊断是否被刻意隐藏。2026 年 5 月发表的 **MedCase-Structured**（arXiv:[2605.30295](https://arxiv.org/abs/2605.30295)，ICML 2026 SD4H 投稿）正是为了填这个评测鸿沟：把医生写的病例叙事，转成**可互操作的 HL7 FHIR R4 患者 Bundle**，再测大模型在「像真 EHR」输入上的诊断推理能力。

论文的核心发现很反直觉：**同一批病例，换成 FHIR 结构化输入后，主流 LLM 的诊断准确率普遍下降**——说明「会读病历故事」≠「会在 EHR 里推理」。

一句话：**MedCase-Structured 不是又一个医学 QA 题库，而是把评测场景从「作文」搬到「医院信息系统界面」。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 全称 | MedCase-Structured: A Text-to-FHIR Dataset for Benchmarking Diagnostic Reasoning in Clinically Realistic EHR Settings |
| 作者 | Valentina Bui Muti, Eugénie Dulout, Ziquan Fu |
| 上游数据 | [MedCaseReasoning](https://github.com/kevinwu23/Stanford-MedCaseReasoning)（NeurIPS 2025，约 14,489 例临床病例报告） |
| 输出格式 | HL7 **FHIR R4** `Bundle`（`type: collection`），术语经 SNOMED CT / LOINC / RxNorm / CVX 校验 |
| 数据集仓库 | [SystemInternal/MedCase-Structured](https://github.com/SystemInternal/MedCase-Structured) |
| 规模 | 过滤后成功转换 **1,408** 例（占进入流水线的 **82.5%**）；测试集可用 **95** 例（原 test 897 例） |
| 生成模型 | Claude Sonnet 4（`claude-sonnet-4-20250514`，temperature=0） |

MedCase-Structured 解决的是**评测对齐（deployment-aligned benchmarking）**：用合成、公开、FHIR 原生的患者数据，在保护隐私的前提下模拟真实 CDSS 输入。

---

## 为什么重要

### 1. 真实 EHR 与论文基准之间的裂缝

- **MIMIC-IV** 等真实 EHR 受隐私与许可限制，且原始形态并非部署中的 FHIR 输出；MIMIC-IV-FHIR 是事后映射，不是临床系统实时产物。
- **MedQA / MMLU 医学子集** 等多为短 vignette 或选择题，缺少资源引用、编码体系和纵向字段。
- **Synthea** 能批量造 FHIR，但靠预定义模块与启发式规则，难以覆盖罕见、非典型、高难度的诊断推理病例。

### 2. 输入表示会显著改变模型表现

论文引用 EHRStruct、FHIR-AgentBench 等工作的结论：**同一临床任务，换输入格式或评测协议，LLM 分数可大幅波动**。MedCase-Structured 用同一病例的「文本版 vs FHIR 版」做对照，直接量化这一差距。

### 3. 术语幻觉是 text-to-FHIR 的主战场

流水线失败统计里，**LOINC / RxNorm 幻觉编码**、非特异性药名（如「口服抗生素」）、语义映射过细/类别错误占绝大多数。没有 **terminology grounding + repair**，合成 FHIR 无法用于严肃评测。

---

## 核心概念

### 1. FHIR R4 与 Bundle

**FHIR**（Fast Healthcare Interoperability Resources）是 HL7 的医疗数据交换标准。**R4** 是当前广泛部署的版本。一个病例在 MedCase-Structured 里通常是一个 **`Bundle`**，内含多条 `entry`，每条指向一种资源：

| 资源类型 | 临床含义（简化） |
|----------|------------------|
| `Patient` | 人口学：姓名、性别、出生日期 |
| `Encounter` | 就诊：门诊/住院、时段、就诊原因 |
| `Condition` | 诊断或症状条目 |
| `Observation` | 体征、实验室结果 |
| `MedicationRequest` | 用药医嘱 |
| `Procedure` | 操作/手术 |
| `DiagnosticReport` | 检查报告 |
| `AllergyIntolerance` | 过敏史 |
| `FamilyMemberHistory` | 家族史 |
| `Immunization` | 免疫接种 |

资源之间用 `subject.reference: Patient/{id}` 等字段**链接**，形成图结构——这正是 LLM 阅读纯文本时不常遇到的认知负担。

### 2. 三阶段固定 LLM 流水线（非 Agent 随意调工具）

与 Infherno 等 **agent 自主决定何时调工具** 不同，本文流水线在**三个固定阶段**调用 LLM，其余为确定性校验：

```text
自由文本病例
  → [Stage 1 抽取]  中间表示（人口学、症状、化验、用药… + 每项原文 quote）
  → [术语接地]      SapBERT + FAISS 对 SNOMED/LOINC/RxNorm/CVX 校验/替换/拒绝
  → [Stage 2 合成]  按 HL7 R4 模板生成 FHIR 资源
  → [结构校验 + 修复循环]  最多 3 轮把 validation errors 喂回 LLM
  → [规则后处理]    补全缺失资源、归一化单位/日期/状态
  → [Stage 3 泄漏检测]（可选）语义扫描 narrative 字段，清除残留诊断线索
  → 输出 Bundle
```

**术语接地**使用 [SapBERT](https://arxiv.org/abs/2010.11784) 嵌入 + [FAISS](https://arxiv.org/abs/1702.08734) 近邻搜索，按余弦相似度阈值决定：接受原码、替换为库内标准码、或拒绝。

### 3. 诊断隐藏（Diagnosis Hiding）——评测 CDSS 的关键开关

真实 CDSS 不应「偷看」已写入 EHR 的最终诊断。论文提供四种模式：

| 模式 | 行为 |
|------|------|
| `NONE` | 移除所有诊断结论 |
| `HIDDEN` | 仅隐藏主诊断（评测常用） |
| `EXPLICIT` | 只保留患者自述病情 |
| `FULL` | 保留全部抽取诊断（用于分析泄漏） |

`NONE` / `HIDDEN` 下先做编码与子串过滤，再用第三阶段 LLM 扫 narrative，去掉缩写、隐含结论等同义词。

### 4. 与 MedCaseReasoning 的关系

[MedCaseReasoning](https://arxiv.org/abs/2505.11733) 每条样本含：

- `case_prompt`：尚未给出鉴别诊断前的病例呈现
- `diagnostic_reasoning`：带文献引用的编号推理链
- `final_diagnosis`：金标准诊断

MedCase-Structured **保留诊断难度与专科分布**，把 `case_prompt` 转成 FHIR；评测时对比 **MCR（文本）** 与 **MCS（FHIR）** 同一问题的准确率。

### 5. 过滤与失败模式（读数字时必看）

进入流水线的病例会先排除：非人类（兽医报告）、多患者、强依赖影像学描述（生成器暂不支持）等。

| 划分 | 原始 | 最终可用 |
|------|------|----------|
| Test | 897 | 95 |
| Val | 500 | 50 |
| Train | 13,092 | 1,263 |

测试集从 897 掉到 95，主因是 **imaging excluded**（777 例），不是流水线全面崩溃。读论文表格时要区分「全库」与「可评测子集」。

---

## 实验结果：结构化输入更难

在诊断隐藏设定下，用 GPT-5.4 作 LLM-as-judge 比较预测诊断与金标准是否临床等价：

| 模型 | MedCaseReasoning（文本） | MedCase-Structured（FHIR） | Δ |
|------|--------------------------|----------------------------|---|
| GPT-5.4 zero-shot | 65.26% | 61.05% | −4.21 |
| GPT-5.4 1-shot | 74.74% | 51.58% | **−23.16** |
| Gemini-3.1-Pro zero-shot | 58.95% | 52.63% | −6.32 |
| Claude-Opus-4.6 zero-shot | 68.42% | 53.63% | −14.79 |

**Few-shot 在文本上提升明显，在 FHIR 上反而可能更差**——模型或许把 shot 里的叙事模式错误迁移到 JSON 结构上。这强化了：**部署前必须在目标数据形态上评测**。

---

## 代码示例 1：读懂 Bundle 骨架（Python）

下面用最小脚本加载一条 FHIR Bundle，列出资源类型与 SNOMED 编码——这是 MCS 评测前「人类/模型在看什么」的第一步：

```python
import json
from pathlib import Path
from collections import Counter

def summarize_bundle(bundle_path: str) -> None:
    bundle = json.loads(Path(bundle_path).read_text())
    assert bundle["resourceType"] == "Bundle"
    types = Counter()
    snomed_codes = []
    for entry in bundle.get("entry", []):
        res = entry.get("resource", {})
        rtype = res.get("resourceType", "?")
        types[rtype] += 1
        # 递归收集 SNOMED coding（教学用简化版）
        def walk(obj):
            if isinstance(obj, dict):
                if obj.get("system") == "http://snomed.info/sct":
                    snomed_codes.append(obj.get("display") or obj.get("code"))
                for v in obj.values():
                    walk(v)
            elif isinstance(obj, list):
                for item in obj:
                    walk(item)
        walk(res)
    print("Resource counts:", dict(types))
    print("SNOMED concepts (sample):", snomed_codes[:8])

# 假设从 MedCase-Structured 仓库解压的单例
summarize_bundle("cases/test/case_00042.bundle.json")
```

实战中你会看到：`Encounter.reasonCode`、`Condition.code`、`Observation.code` 分散在不同资源里——模型必须把**跨资源证据**合成诊断，而不是读一段连贯叙述。

---

## 代码示例 2：复现评测提示结构（诊断任务）

论文附录 B 规定模型输出 JSON：`diagnosis` + `reasoning`。下面用伪代码展示 **FHIR 输入** 与 **文本输入** 如何共用同一套评测壳（便于自己跑 ablation）：

```python
import json

SYSTEM = (
    "You are a careful physician solving clinical diagnostic reasoning cases. "
    "Use only the provided case information. Return valid JSON only."
)

def build_user_prompt(case_input: str, *, mode: str) -> str:
    if mode == "fhir":
        header = "You will receive a FHIR Bundle JSON for a clinical case."
        body = case_input  # 完整 Bundle JSON 字符串
    elif mode == "text":
        header = "You will receive a plain text clinical case description."
        body = case_input  # MedCaseReasoning case_prompt
    else:
        raise ValueError(mode)
    schema = (
        'Return exactly this JSON schema: '
        '{"diagnosis": "single most likely diagnosis", '
        '"reasoning": "brief explanation using the case evidence"}'
    )
    return f"{header} Determine the most likely final diagnosis. {schema}\n\n{body}"

def parse_model_json(raw: str) -> dict:
    # 生产环境应加 jsonschema 校验与重试
    return json.loads(raw)

# FHIR 路径
fhir_bundle = open("case_00042.bundle.json").read()
prompt_mcs = build_user_prompt(fhir_bundle, mode="fhir")

# 文本对照路径（同一病例的 case_prompt）
text_case = open("case_00042.prompt.txt").read()
prompt_mcr = build_user_prompt(text_case, mode="text")

# 下游：调用 API → parse_model_json → GPT-5.4 judge 比较 final_diagnosis
```

若你微调 CDSS，应分别在 `prompt_mcr` 与 `prompt_mcs` 上报告指标，而不是只报文本侧「好看」的数字。

---

## 代码示例 3（加分）：术语接地思路（概念片段）

论文用 SapBERT 向量 + FAISS 做「码表对齐」。下面不是论文源码，但说明 **replace / reject** 决策逻辑：

```python
import numpy as np

def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))

def ground_code(
    mention: str,
    llm_code: str,
    llm_display: str,
    faiss_index,          # 预建：标准术语 SapBERT 向量
    term_table: list[dict],
    thresholds: tuple[float, float] = (0.85, 0.70),
) -> str | None:
    """高相似度接受；中间带替换；过低拒绝（返回 None 触发修复循环）"""
    emb = encode_sapbert(mention)  # 与论文一致的生物医学句向量
    sims, idxs = faiss_index.search(emb.reshape(1, -1), k=5)
    best_sim, best_idx = float(sims[0][0]), int(idxs[0][0])
    canonical = term_table[best_idx]
    if llm_code == canonical["code"] and best_sim >= thresholds[0]:
        return llm_code
    if best_sim >= thresholds[0]:
        return canonical["code"]   # 替换幻觉码
    if best_sim >= thresholds[1]:
        return canonical["code"]   # 弱匹配仍替换
    return None                    # 拒绝 → 进入 LLM repair
```

非特异性表述（「口服抗生素」）常在 `thresholds` 下被拒——这也是 Table 2 里 RxNorm 失败高发的原因。

---

## 与相关工作的对比（选型表）

| 方案 | 优势 | 局限 |
|------|------|------|
| **MIMIC-IV / FHIR 衍生** | 真实分布 | 隐私、许可、非原生 FHIR 工作流 |
| **Synthea** | 大规模合成 FHIR | 规则驱动，难控复杂罕见病例 |
| **FHIR-GPT / Infherno** | 笔记→FHIR 重建 | 偏「忠实还原」，非可控评测集生成 |
| **EHRStruct / FHIR-AgentBench** | 结构化 EHR 任务基准 | 固定数据，难按需生成新场景 |
| **MedCase-Structured** | 医生病例 + 术语校验 + 诊断隐藏 + 文本/FHIR 对照 | 资源类型子集、纵向轨迹简化、成像信息过滤 |

---

## 局限与未来方向（论文自述）

1. **FHIR 资源覆盖不全**：长线病程用重复、带日期的资源近似，而非完整 temporal graph。
2. **术语库缝隙**：LOINC 化验名口语化、疫苗商品名（CVX）、非特异性药物类仍易失败。
3. **成像依赖病例被排除**：放射/病理描述重的病例无法进入当前生成器。
4. **合成 ≠ 真实**：术语接地错误会传导到下游评测，需与真实世界验证互补。

未来工作：扩展资源类型、加强纵向建模、扩大术语表、上下文感知校验。

---

## 谁应该读这篇论文

| 角色 | 收获 |
|------|------|
| **医疗 NLP / CDSS 研究者** | 部署对齐评测范式、text-to-FHIR 流水线设计 |
| **FHIR 工程师** | Bundle 组装、编码接地、诊断泄漏模式 |
| **LLM 评测从业者** | 同一任务多表示（text vs JSON）的对照实验模板 |
| **医院信息科** | 理解为何「接口标准化」不等于「模型自动变强」 |

---

## 速查清单

1. **FHIR R4 Bundle** = 多资源 JSON 图，不是单段病历。
2. **三阶段 LLM + 确定性接地/校验**，不是端到端一次性生成。
3. **诊断隐藏**是评测 CDSS 的必要条件，否则标签泄漏。
4. **82.5%** 是流水线成功率；**test 95 例**才是常用评测子集。
5. **FHIR 输入准确率低于文本**是主结论，不是边角料。
6. 数据集：[github.com/SystemInternal/MedCase-Structured](https://github.com/SystemInternal/MedCase-Structured)
7. 上游病例：[github.com/kevinwu23/Stanford-MedCaseReasoning](https://github.com/kevinwu23/Stanford-MedCaseReasoning)

---

## 参考文献

```bibtex
@article{buimuti2026medcase,
  title={MedCase-Structured: A Text-to-FHIR Dataset for Benchmarking
         Diagnostic Reasoning in Clinically Realistic EHR Settings},
  author={Bui Muti, Valentina and Dulout, Eug{\'e}nie and Fu, Ziquan},
  journal={arXiv preprint arXiv:2605.30295},
  year={2026},
  url={https://arxiv.org/abs/2605.30295}
}

@inproceedings{wu2025medcase,
  title={MedCaseReasoning: Evaluating and Learning Diagnostic Reasoning
         from Clinical Case Reports},
  author={Wu, Kevin and Wu, Eric and Thapa, Rahul and others},
  booktitle={NeurIPS},
  year={2025},
  url={https://arxiv.org/abs/2505.11733}
}
```

---

## 一句话带走

**MedCase-Structured 把「医生写的病例故事」翻译成「医院信息系统里会长什么样」的 FHIR，并证明：大模型在后者上的诊断推理明显更难——做临床 AI 必须在 FHIR 形态上评测，而不能只刷文本病历榜。**
