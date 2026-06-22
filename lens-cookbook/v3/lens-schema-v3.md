# lens schema v3

## frontmatter

| 字段 | 必填 | 约束 |
|---|---|---|
| schema_version | 是 | 3 |
| lens_id | 是 | kebab |
| domain | 是 | lens / radar |
| owner | 是 | IC（如 jason） |
| verified_at | 是 | YYYY-MM-DD |
| review_quarter | 是 | YYYY-Qn |
| total_budget_chars | 是 | 3000 |
| excludes | 是 | list（含 glossary / sources+reading_list / getting_started / what_is_not） |
| ring | 否 | adopt/trial/assess/hold（仅 radar 用，lens 不写） |
| hardware_assumption | 是（lens-vllm 类）| A100/H100/4090/CPU/N/A |
| provider_coverage_checklist | 是 | 域内须立场覆盖的 provider/runtime 名单 |
| open_questions | 是 | list ≥ 4，缺位 provider 必入 |
| sources | 否 | 引文路径，建议有 |

**v3 patch (2026-05-31)**：原 schema 漏列 schema_version/lens_id/owner/verified_at/review_quarter/total_budget_chars/excludes/open_questions 七项必填字段，已补回。这些字段在 v2 verdict 已 require，不要再漏。

示例（lens-vllm）：`[vLLM, SGLang, TGI, TensorRT-LLM, llama.cpp]`，每项须在正文出现立场或显式 out-of-scope。

## body

- body_max_chars: 3000
- sections.required_order: `[选型铁律, 候选表×N, ADR×3+, 决策树, open_questions]`
- 候选表列：候选 / ring / 立场 / 触发条件
- 决策树：3-7 节点（vLLM 类 5-7 允许）

## ADR 子模板

| 子类型 | 用于 | 必填段 |
|---|---|---|
| implementation-tuning | 参数=N | context/decision/rationale/consequences |
| vendor-selection | 选 X 不选 Y | + alternatives 段 |
| architecture | 拆/合/降级 | + rollback 段 |

通用：decision ≤80 / context ≤200 / consequences ≤150；每篇 ≥3 个 ADR。

## radar 入口分流

应用层 router（LiteLLM）与 serving 层 router（vLLM router）分两节，不混入同表。

## open_questions

`provider_coverage_checklist` 未覆盖项 → 落入 open_questions 或正文显式 out-of-scope。
