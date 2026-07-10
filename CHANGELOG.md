# Changelog

## Unreleased

- STUDY-T001/STUDY-T002：新增向后兼容的内容信任 schema、增量迁移门和可验证 review receipt；receipt/evidence 以精确 companion allowlist 进入同一个 canonical note commit，缺失、陈旧、重放或额外 dirty path 会在队列标记完成前失败；旧 1,975 篇保持 `legacy-unverified`，未改正文。
- STUDY-T003：建立 tracked-files 隐私红线、历史指纹基线与脱敏输出，扩展本地凭证/运行态忽略规则。
- STUDY-T004/STUDY-T006：worker 合并改为单目标 commit scope、assignment 来源绑定；远端发布校验仓库身份、正常 TLS、精确远端 commit 与并发一致性。
- STUDY-T005：队列写入改为 generation 事务、owner-token 锁、claim fencing 与租约恢复；27 条历史失败保留，当前轮失败独立统计。
- STUDY-T007/STUDY-T008/STUDY-T009：PR 与 Pages 共用 fail-closed CI；Actions 固定完整 SHA；构建诊断移出公开 `dist` 并改为 7 天脱敏 artifact。
- STUDY-T010：Atlas 改用 62 个规范 taxonomy topic、1,975 条 NoteId sidecar 和 68 个至多 100 条的分块；旧 Atlas URL 不变。
- STUDY-T011/STUDY-T012：统一 `area::slug` 与 wikilink/backlink 解析，建立 1,672 条历史 unresolved 非增长预算、alias 合同和显式 broken-link 状态。
- STUDY-T013/STUDY-T014：质量门改为 note_type/学习证据/极端复制检查，并加入显式 freshness 生命周期、页面状态与只读定期报告。
- STUDY-T019：停用旧 `/auto-push` 批量入口，移除过期数量目标和自动 main 发布语义，建立唯一操作 policy/index；policy 缺失、损坏或未获显式批准时 fail closed，并以 blob/SHA-256 保留脱敏归档证据。
- STUDY-T018：修复两处绕过 `/study` base 的图片链接，增加确定性资产 manifest、尺寸/alt/目标审计和 legacy orphan 非增长基线。
- STUDY-T017：记录 dist/Pagefind/Atlas/public/仓库/源码 ZIP 的确定性大小基线与绝对、相对停止预算；耗时/RSS 保持趋势告警，不作噪声硬门。
- STUDY-T015：增加 Pagefind 上下文查询、canonical/sitemap/robots 与 `/study` base 的发布级输出合同。
- STUDY-T016：增加首页、开始页、六主题、双 Atlas、React/ReAct 的 axe/Chromium、320/375、深浅色、文本间距、搜索焦点与减少动态效果 smoke；未执行的 VoiceOver 矩阵保持 `UNKNOWN`。

所有变化保持 `/study`、现有公开 URL、npm 既有命令及 JSON/JSONL 数据读取兼容。生产合并和部署不在本变更中执行。
