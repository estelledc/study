# 搜索与 SEO 输出合同

关联任务：STUDY-T015。

- Pagefind 断言结果集合和类型，不锁死完整排名。
- React 与 ReAct 使用带上下文的中文/英文查询分别验收；裸词大小写不作为消歧依据。
- 每个 HTML 只有一个位于 `https://estelledc.github.io/study/` 下的 canonical。
- sitemap URL 唯一、保留 `/study` base 且能解析到 dist 文件。
- `robots.txt` 明确允许抓取并指向 `/study/sitemap-index.xml`。

运行：

```bash
node scripts/audit-pagefind.mjs --json
node scripts/audit-seo-output.mjs --json
```
