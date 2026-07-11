# 内容复核与时效性策略

`日期` 只能说明笔记何时生成，不能证明事实何时被复核。时效性状态只读取 `trust.reviewed_at`、`trust.review_after`、`trust.accessed_at` 和明确的来源版本。

## 风险分层

| 类型 | 最长复核周期 | 额外要求 |
|---|---:|---|
| 稳定论文 / 稳定概念论文 | 不设固定期限 | 必须显式写 `review_after: null` |
| 演进中的协议论文 | 730 天 | 必须记录适用版本 |
| 安全指导论文 | 365 天 | 必须记录适用版本 |
| 活跃开源项目、库、系统、协议、工具 | 365 天 | 来源与不可变 revision 可复核 |
| 平台/API、安全指导项目 | 90 天 | 官方一手 HTTPS 来源、访问日期和适用版本 |

规则源真相是 `data/freshness-policy.json`。`review_after` 可以早于最长周期，但不能更晚。稳定论文的 `null` 表示“不自动制造刷新任务”，不表示内容永远正确。需要官方一手来源的类型还必须匹配 `data/official-source-registry.json`：规范 GitHub 仓库 URL 或已登记 origin；任意 HTTPS URL 不足以证明“官方”。

## 状态含义

- `legacy-unverified`：历史内容没有 v2 复核记录。系统不会从旧的 `日期` 猜测状态。
- `current`：截至指定日期尚未到复核期限，或策略明确不设固定期限。
- `review-due`：已到建议复核日期。它只表示需要复核，不断言内容错误或不安全。
- `invalid`：日期、来源权威性或策略字段不完整，属于阻断性契约问题。

`due_soon` 是 `current` 的附加信号，默认表示 30 天内到期。

## 可复现审计

```bash
node scripts/audit-freshness.mjs --as-of 2026-07-10 --json
```

`--as-of` 必填且必须是真实的 `YYYY-MM-DD`。脚本不读取系统日期、不修改正文、不生成笔记，也不把生成日期当成复核日期。JSON 输出稳定排序，并给出 legacy 集合哈希、各 area 统计、v2 状态和待处理条目。

页面 badge 与审计复用 `scripts/lib/freshness.mjs`。CI 可通过环境变量设置同一显式日期：

```bash
STUDY_FRESHNESS_AS_OF=2026-07-10 npm run build:strict
```

普通本地构建不读取系统时间；未设置环境变量时，使用 policy 中受版本控制的 `default_build_as_of`。环境值或 policy 默认值无效时构建直接失败，而不是把 v2 页面悄悄标成 invalid。正式审计命令仍要求显式 `--as-of`。

Badge 只表达复核生命周期：`待复核`、`已复核`、`即将复核` 或 `建议复核`，不会使用“正确”“安全”等无法由日期证明的词。

## 定时健康检查

`.github/workflows/content-health.yml` 每周生成只读 JSON artifact。出现到期、即将到期或 invalid 项时，它只创建或更新一条汇总 issue；不会修改 Markdown、提交 Git 变更、运行生产 pipeline 或自动补写日期。
