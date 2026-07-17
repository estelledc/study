---
title: "07. 零基础实验：让研究 Run 可恢复、Artifact 可验收"
sidebar:
  hidden: true
---
# 07. 零基础实验：让研究 Run 可恢复、Artifact 可验收

> 目标：不用模型、API Key、GPU 或网络，理解研究流程为何不能只看“文件生成了”。
>
> 代码：[`labs/research_run.py`](labs/research_run.py)

## 1. 先建立生活类比

把自动研究系统想成一条实验室流水线：

| 实验室 | Research run |
|---|---|
| 研究问题登记表 | run manifest |
| 原始样品封条 | input hash |
| 文献证据包 | evidence artifact |
| 假设卡 | idea artifact |
| 实验记录和结果 | experiment artifact |
| 报告 | report artifact |
| 质检签字 | gate |
| 样品批次关系 | provenance chain |

桌面上摆着四个文件，不代表它们来自同一批样品，也不代表质检通过。

类比边界：真实科学还需要领域判断、实验设计和人工责任；manifest 只能证明流程与证据，
不能证明自然规律。

## 2. 六层生态先分清

| 层 | 主要问题 | 代表项目 |
|---|---|---|
| 文献与证据 | 找到、解析、引用什么 | PaperQA2、STORM、paper-search-mcp |
| 选题与假设 | 为什么值得研究 | Idea2Paper、Co-Scientist、ResearchStudio Idea |
| 实验与发现 | 如何运行和比较实验 | AI-Scientist、AutoR、AI-Researcher |
| 写作与评审 | 结论如何表达和批判 | AI-Scientist、ARA |
| 发布与传播 | 如何做 poster/video/slides/blog | ResearchStudio Reel、ppt-master |
| Harness 与能力 | 状态、Skill、预算、恢复 | AutoR、Scientific Agent Skills、ARA |

ResearchStudio 的强项在 Idea、Reel 和 Skill-first 工程，不是通用实验执行。

## 3. 最小主链

实验定义四阶段：

```text
evidence
  -> idea
  -> experiment
  -> report
```

每个阶段必须：

1. 前置阶段已通过；
2. 写出规定名称的 artifact；
3. artifact 有 producer 和来源；
4. hash 与当前文件一致；
5. named gate 全部通过；
6. 才能进入下一阶段。

## 4. Artifact 最小字段

```json
{
  "path": "artifacts/idea/idea.json",
  "sha256": "...",
  "producer": "idea-model-v1",
  "source_artifacts": ["evidence/evidence.json"],
  "gate": "passed",
  "gate_checks": {
    "schema_valid": true,
    "claims_supported": true
  }
}
```

字段回答：

| 字段 | 问题 |
|---|---|
| `path` | 文件在哪里？ |
| `sha256` | gate 后有没有被改？ |
| `producer` | 哪个脚本/模型/版本生成？ |
| `source_artifacts` | 它依赖哪些已验收输入？ |
| `gate` | 当前是否可进入下游？ |
| `gate_checks` | 为什么通过？ |

## 5. 运行实验

从仓库根目录：

```bash
cd src/content/docs/research/researchstudio-ecosystem-study/labs
PYTHONDONTWRITEBYTECODE=1 python3 research_run.py
```

2026-07-17 实测：

```text
next=retry:idea
evidence_gate=passed
events=7
```

流程：

1. Evidence 阶段产物通过 source/schema gate。
2. Idea 阶段因 provider unavailable 失败。
3. failure 被标记为 environment + retryable。
4. 重开 run 后，下一动作是 `retry:idea`，不会重跑 evidence。

## 6. 运行八个测试

```bash
PYTHONDONTWRITEBYTECODE=1 \
python3 -m unittest -v test_research_run.py
```

结果：

```text
Ran 8 tests
OK
```

| 测试 | 证明什么 |
|---|---|
| prerequisite gate | 不能跳过 evidence 直接写 idea |
| named checks | 空泛的 `passed=true` 不够 |
| hash integrity | gate 后篡改会被发现 |
| source admission | 下游不能引用未过 gate 的 artifact |
| retry recovery | 环境失败从同 stage 重试 |
| scientific stop | 假设被否定不应无限重跑 |
| file-presence trap | 文件齐全不能直接完成 |
| provenance happy path | 完整来源链和 gate 才能完成 |

## 7. Navigator 与 Gate 的区别

Navigator 回答：

```text
根据当前目录，下一步看起来是什么？
```

Gate 回答：

```text
当前 artifact 是否满足进入下一阶段的确定性合同？
```

ResearchStudio 本地真实案例：

```text
navigator: DONE
validator: 1 fail
```

原因是 Phase 2 Select artifact 被当成最终 candidate 传给 validator，schema 不匹配。
因此 DONE 是导航投影，不是完成源真相。

## 8. 文件存在为什么不够

一个 `results.json` 可能：

- 属于旧 run；
- 输入数据已经变了；
- 实验脚本版本不同；
- 只跑了一半；
- 指标被手工覆盖；
- 没有 baseline；
- gate 从未执行。

所以 run manifest 至少要绑定：

```text
run_id
question
input hash
workflow version
stage status
artifact hash
producer
source chain
gate checks
failure category
```

## 9. 四类失败

### Contract failure

例子：传错 JSON schema、缺字段、引用未通过的 artifact。

动作：修 route/adapter/输入，不重新解释科学假设。

### Environment failure

例子：API timeout、GPU 不可用、账号缺失。

动作：有界重试、fallback 或记录 blocker。

### Execution failure

例子：代码编译失败、实验进程崩溃。

动作：修代码，从同 stage 继续。

### Scientific failure

例子：负对照显示机制不成立。

动作：停止或修订假设，保留负结果。不能自动重试到成功为止。

## 10. 真实 Paper bundle 案例

本机 `attention-is-all-you-need` bundle 有：

- text；
- metadata；
- figures/captions；
- sections；
- narration。

但 manifest 的 source PDF/hash 为空，extractor 标为 skipped。即使 PDF 文件真实存在，
manifest 也无法证明这些资产由当前 PDF 产生。

这叫：

```text
artifact present, provenance incomplete
```

而不是：

```text
artifact verified
```

## 11. 共享门与专属门

所有研究/传播 artifact 共享：

- 输入和 source hash；
- claim-evidence binding；
- schema；
-敏感数据；
- producer/version；
- provenance chain。

专属门：

| Artifact | 专属门 |
|---|---|
| Evidence | 来源相关性、时间范围、引用可访问 |
| Experiment | baseline、seed、环境、指标、negative control |
| Report | claim 范围、引用、结论与结果一致 |
| Poster | 尺寸、溢出、打印质量 |
| Slides | 逐页密度、节奏、可编辑性 |
| Video | 音画同步、字幕、时长 |

## 12. 为什么不能只用 LLM Reviewer

LLM Reviewer 擅长：

- 论证是否清楚；
- 是否有明显缺口；
- 给出反例角度；
- 建议修订。

它不能替代：

- JSON schema；
- 文件 hash；
- 引用是否存在；
- 代码测试；
- 实验指标；
- poster 几何；
- PDF/PPTX 编译。

正确组合是：

```text
LLM critique + deterministic gates + human scientific judgment
```

## 13. 初学者常见误区

1. **生成论文就是完成研究。**
   正确理解：文本是表达层，证据和实验决定可信度。

2. **目录越完整，run 越可靠。**
   正确理解：还要看输入、版本、hash、producer 和 gate。

3. **失败都可以自动 retry。**
   正确理解：scientific failure 应停止或修订，不应抹掉负结果。

4. **Agent 越多，研究越可信。**
   正确理解：Agent 增加搜索宽度，独立证据和阻断门决定可信度。

5. **有引用就是 grounded。**
   正确理解：引用还可能无关、过时、范围不符或被错误概括。

## 14. 应用题与检查点

### 题 1

Navigator 显示 DONE，validator 失败，应该把 run 标 completed 吗？

检查点：不能。修 contract/routing 后重跑 gate；navigator 只是投影。

### 题 2

Experiment artifact hash 正确，但没有 source artifact，能进入 report 吗？

检查点：不能。hash 只证明文件未变，不证明输入和证据链。

### 题 3

模型 API timeout 应归类为 scientific failure 吗？

检查点：不是，是 environment failure；在预算内有界重试。

### 题 4

负对照推翻核心机制，应该自动换 seed 再跑直到显著吗？

检查点：不能。保留负结果，停止或修订假设，否则形成选择性报告。

### 题 5

Poster PNG 看起来正常，是否可以跳过 source/PPTX 检查？

检查点：不能。PNG 只证明视觉快照；可编辑源、引用、尺寸和 provenance 仍需验证。

### 题 6

什么时候该引入 Co-Scientist 式多 Agent？

检查点：先有单 Agent 基线；只有假设多样性、反例发现或评审一致性有量化收益时再增加。

## 15. 完成标准

- [ ] 能画出 evidence -> idea -> experiment -> report。
- [ ] 八个实验测试通过。
- [ ] 能区分 navigator、artifact 和 gate。
- [ ] 能解释 hash、producer 与 source chain 各证明什么。
- [ ] 能区分 contract/environment/execution/scientific failure。
- [ ] 能指出 LLM reviewer 不能替代的三个确定性门。
