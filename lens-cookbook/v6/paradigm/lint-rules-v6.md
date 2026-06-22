# Lint Rules v6

沿用 R1-R6，加 R7-R9。

## R1 layer 单一性（F1）
`{r.layer}` 长度=1 且=fm.layer。

## R2 列序锁定（F4）
header == `["候选","ring","立场","触发条件","layer"]`，每行 5 列。

## R3 tuning param=value（F2）
subtype=tuning 时 `re.search(r"[A-Za-z_]+\s*=\s*\S+", section("decision"))` 必命中。

## R4 段白名单（F5+F8）
```
WL = {
 tuning:      [context,decision,rationale,consequences],
 vendor:      [context,decision,alternatives,consequences],
 architecture:[context,decision,consequences,rollback]
}
```
缺任一 fail。vendor `len(alternatives)>=2`。F8：段标题必须 `### name`。

## R5 excludes（F3）
sources/reading_list/getting_started/what_is_not 下 `<slug>.md` 各 ≥50 字。

## R6 立场列（F6）
`re.match(r"^[^:]+:\s*\S+", cell)` 命中且短语 ≤30 ASCII。

## R7 wikilinks（F7，新）
fm.wikilinks 非空 list len≥5。每项在 written.txt，否则须列 fm.out_of_corpus。

## R8 ADR 三级标题（F8，新）
每 ADR `re.search(rf"^### {h}\b", body, re.M)` 对 [context,decision,consequences] 全命中。

## R9 决策树首节点门控（F9，新）
首节点 text 必含 {团队,人数,预算,成本,QPS,规模,流量,合规,本地化} 之一。直接出 vLLM/Postgres 无门控前缀 fail。

## 序
R1→R2→R6→R7→R5→R8→R9→R3→R4，任一 fail abort。

## enable
dry-run 6 lens → 改完 → R7-R9 enforcing。
