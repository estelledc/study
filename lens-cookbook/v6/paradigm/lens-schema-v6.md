# Lens Schema v6

## 1. Lens 文件

```
---
lens: <slug>
version: 6
status: active|frozen|retired
layer: app|serving|kernel
wikilinks: [slug1, slug2, ...]    # F7 必填，≥5
out_of_corpus: [slug, ...]        # 可选；不在 written.txt 的显式标
---
## 候选表
## ADR 索引
## 决策树
## 外迁 excludes
```

## 2. 候选表（F1+F4+F6）

列序锁定 5 列：`| 候选 | ring | 立场 | 触发条件 | layer |`

- ring ∈ {adopt, trial, assess, hold}
- layer ∈ {app, serving, kernel}
- F1：同表 layer 全等；跨 layer 拆 lens
- F4：列序错或列数 ≠5 → fail
- F6：每行"立场"必须 `<候选名>: <≤20 字短语>`，正则 `^[^:]+:\s*\S+`，反例"主库默认"，正例"Postgres: 主库 事务+JSON+pgvector"

## 3. ADR 段白名单（F5+F8）

每 subtype 必填段；F8（v6 新增）：所有段必须用三级标题 `### name`。

- implementation-tuning：`### context` / `### decision` / `### rationale` / `### consequences`
  - F2：decision 正文必须正则 `[A-Za-z_]+\s*=\s*\S+` 命中（如 `max_num_seqs = 256`）
- vendor-selection：`### context` / `### decision` / `### alternatives` / `### consequences`
  - alternatives ≥2 候选 + 拒绝理由
- architecture：`### context` / `### decision` / `### consequences` / `### rollback`
  - rollback 写明回滚条件 + 操作

## 4. 决策树（F9，v6 新增）

每 lens 必须含"决策树"小节。**第一节点必须是成本/规模门控**，不能直接进技术选型。允许门控：

- 团队规模门（人数 ≤3 → PaaS）
- 预算门（月成本上限 < $X → 跳过）
- 流量门（QPS < N → 单机）
- 合规门（必须本地化 → 排除托管）

第一层直接出现"vLLM/SGLang"等纯技术选型 → fail。

## 5. Wikilinks 字段（F7，v6 新增）

frontmatter 必填 `wikilinks: [...]`：

- ≥5 项
- 每项必须存在 `/Users/jason/study/data/written.txt`，否则需在 `out_of_corpus` 显式列出
- 与正文 `[[slug]]` 应大致一致

目的：取代 meter 二次正则推断。

## 6. Excludes 外迁（F3）

每 lens 配齐 4 stub：`sources/<lens>.md` / `reading_list/<lens>.md` / `getting_started/<lens>.md` / `what_is_not/<lens>.md`，各 ≥50 字。

## 7. 状态机

- active：候选表 + ADR 都更
- frozen：候选表停更，ADR 仍补
- retired：归档

## 8. v5 → v6 不兼容

- F7 wikilinks 字段必填（v5 全缺）
- F8 ADR 段标题升 `###`（v5 多用 `##`）
- F9 决策树首节点改为门控（v5 多直接技术选型）
- 先 dry-run 跑 6 lens，改完再 enforcing
