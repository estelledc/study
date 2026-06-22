# v4 → v6（含 v5）

## 触发

- v5 F6：fb2 立场列风格不一致，跨 lens 对比要人脑归一化。
- v6 F7：dogfood lens-langgraph 站发现 lens→slug 全靠正则二次推断 → 字段直接列。
- v6 F8：citation-meter v1 无法定位 ADR `## decision`（与 `## 候选表` 同级）→ 升 `###`。
- v6 F9：fb3 决策树"先技术再成本"，初学者实际反过来。

## 改动

| 项 | v4 | v5 | v6 |
|---|---|---|---|
| F6 立场列 | 无 | `候选: 短语` | 同 |
| F7 wikilinks | — | — | ≥5 |
| F8 段级 | `##` | `##` | `###` |
| F9 决策树首层 | 无 | 无 | 成本/规模门 |
| 规则数 | 5 | 6 | 9 |

## 不兼容

v5 缺 wikilinks；段多 `##`；决策树首层直接技术。dry-run 改完再 enforcing。

## 落地序

schema+lint+CHANGELOG → meter v2 → 6 lens 升 v6 → R7-R9 dry-run → enforcing + SC 回归。
