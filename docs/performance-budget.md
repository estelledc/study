# 站点性能与规模预算

关联任务：STUDY-T017。

硬门只使用在相同源码上可重复的字节数、文件数和最大 HTML 页面大小。构建耗时、Atlas 生成耗时与 RSS 会受机器/runner 噪声影响，只作趋势信号；源码 ZIP 大小被记录为交付边界，但不作为内容价值指标。

当前预算为约两千篇内容留出明确余量：dist 220 MiB / 6,000 文件、最大 HTML 600 KiB、Pagefind 30 MiB / 3,500 文件、public 50 MiB / 800 文件、Atlas 单块 100 条、源码 ZIP 100 MiB。绝对上限之外，还会与已提交基线比较离散指标。超过预算先冻结新增内容，分析 Atlas、搜索碎片、资产或页面重复；不能靠直接放宽阈值继续扩量。

Legacy audit review 已从逐文件 JSON 迁移为 `data/audit-reviews/legacy-audit-reviews.jsonl` 加 `manifest.json`。`repository.tracked_files` 继续衡量 Git 源码文件数量；`repository.legacy_audit_review_items`、`repository.legacy_audit_review_raw_bytes` 和 `repository.legacy_audit_review_archive_bytes` 单独暴露历史审计证据规模，避免把 1975 条 legacy observation 误读成普通源码扩张。

```bash
node scripts/benchmark-site.mjs --json
node scripts/benchmark-site.mjs --build --json
node scripts/benchmark-site.mjs --compare data/performance-baseline.json
npm run audit:legacy-reviews
```

`data/performance-baseline.json` 是目标构建的可复核快照；`data/performance-budget.json` 是门禁，不把两者混为一谈。JSON 只保存相对页面路径、版本与汇总数字，不保存用户名、本机绝对路径或环境变量。

预算依据于 2026-07-10 访问的官方一手来源：[GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) 与 [Pagefind 官方说明](https://pagefind.app/)。对外调整预算时必须重新核对这些来源，不能把当前阈值当永久标准。
