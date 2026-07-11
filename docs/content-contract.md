# 内容可信度契约

这份契约回答一个问题：读者看到“已验证”时，仓库里是否存在可复核的机器证据。

## 两代内容如何共存

- 没有 `trust` 的历史笔记继续构建，但审计状态固定为 `legacy-unverified`，不能自动升级为“已验证”。
- 新笔记或实质修改正文的笔记使用 `study-v2`。只改 frontmatter、链接目标或自动生成的反向链接，不算实质修改。
- `papers/`、`projects/` 会递归扫描；嵌套 Markdown 会被发现并作为非规范路径阻断，不能靠子目录逃过契约。
- `data/content-contract-baseline.json` 只给历史缺口设置上限。上限可以下降；提高上限必须作为可见的 policy 变更审查。

## `trust` 字段

```yaml
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://example.org/project
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-09'
  immutable_revision: 0123456789abcdef0123456789abcdef01234567
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-10'
  review_after: '2027-01-10'
  applicable_version: 2.x
```

公共字段的含义：

| 字段 | 含义 |
|---|---|
| `version` | 固定为 `study-v2`，用于未来兼容迁移 |
| `canonical_source` | 可公开访问的权威来源 |
| `source_authority` | 官方一手、作者一手或二手来源 |
| `accessed_at` | 实际访问来源的日期，不能从生成日期推断 |
| `note_type` | 概念、库、系统、论文、协议、工具、平台/API 或安全指导 |
| `evidence_type` | 一手来源、静态分析、实际实验、用户观察或不适用 |
| `verification_status` | `UNVERIFIED`、`PARTIALLY_VERIFIED`、`VERIFIED` 或 `NOT_APPLICABLE` |
| `reviewed_at` | 最后一次事实复核日期，不等同于生成日期 |
| `review_after` | 建议再次复核日期；稳定论文显式为 `null`，其他类型按策略填写 |
| `applicable_version` | 结论适用的产品或协议版本 |

项目和论文采用不同的来源身份：

- 项目要求 `source_kind: project` 与 `immutable_revision`。优先使用完整 commit；如果不是 Git 来源，使用同等不可变的发布修订。
- 论文要求 `source_kind: paper` 与 `publication_id`，可选 `source_version`。DOI、arXiv 编号或正式出版标识均可；论文不需要伪造 Git commit。

## 状态规则

- `VERIFIED` 不是写作者的主观标签。当前 note digest、来源修订和 reviewer receipt 必须一致；至少一个 `ACTUAL_RUN` 必须绑定通过重算的 Git 跟踪 evidence artifact，人工模拟或纯静态审查不会自动升级状态。
- `EXECUTED_EXPERIMENT` 必须有工程 reviewer 的真实代码执行证据摘要。
- `日期` 是旧的生产元数据，审计不会把它猜成 `reviewed_at`。
- 自动补全只能转换已有公开 URL 或不可变修订，不能生成 reviewer、执行结果或复核日期。

## 审计命令

```bash
node scripts/audit-content-contract.mjs --json
node scripts/audit-content-contract.mjs --changed-from origin/main --json
```

第一条给出全量、稳定排序的 JSON 报告。第二条额外阻断相对基线新增或实质改动但仍缺少 v2 契约的笔记。内容计数与路由完整性仍由原有 counts/link 门禁负责。
