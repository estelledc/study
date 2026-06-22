# Lint Rules v4

pre-commit 执行，fail 给建议。

## R1 layer 单一性（F1）
`{r.layer for r in lens.rows}` 长度=1 且=lens.fm.layer。否则 fail。

## R2 列序锁定（F4）
`lens.header == ["候选","ring","立场","触发条件","layer"]`，每行 5 列。否则 fail。

## R3 tuning param=value（F2）
若 `adr.subtype=="implementation-tuning"`：`re.search(r"[A-Za-z_]+\s*=\s*\S+", adr.section("decision"))` 必命中。否则 fail。

## R4 段白名单（F5）
```
WL = {
 implementation-tuning: [context, decision, rationale, consequences],
 vendor-selection:      [context, decision, alternatives, consequences],
 architecture:          [context, decision, consequences, rollback]
}
```
缺任一 fail。vendor-selection 额外 `len(alternatives) >= 2`。

## R5 excludes（F3）
每 slug 在 sources/ reading_list/ getting_started/ what_is_not/ 下 `<slug>.md` 必存 ≥50 字。

## 序
R1→R2→R5→R3→R4。任一 fail abort。
