# 图片资产政策

关联任务：STUDY-T018。

- 站内公开图片 URL 必须从 `/study/` 开始，并指向 `public/` 中存在、可解码的图片。
- 信息型 Markdown 图片必须有非空 alt；alt 描述信息用途，不重复写“图片”。装饰图必须使用空 alt，并在图片前一行写 `<!-- decorative -->`，让审计能区分“有意忽略”和漏写；不从文件名自动生成 alt。
- `data/asset-manifest.json` 记录路径、哈希、字节、尺寸、格式与引用来源，生成结果必须确定性。
- 基线中未引用的历史资产只报告，不自动删除，也不伪称已审核；`data/asset-orphan-baseline.json` 只阻止新增 orphan。
- 上游正文删除引用后若本轮不能按“独立删除 PR”规则移除二进制，只能把资产加入 `data/asset-orphan-allowlist.json`：必须记录导致引用消失的完整 commit、具体保留理由和 `retain-pending-dedicated-deletion` disposition。allowlist 不扩张历史 baseline；资产重新被引用或删除后，陈旧条目会使审计失败。
- 重复哈希作为维护信号报告，不自动去重。删除资产需要单独确认引用、来源和回滚方式。

运行：

```bash
node scripts/audit-assets.mjs --json
```
