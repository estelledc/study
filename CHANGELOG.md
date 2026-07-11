# Changelog

## Unreleased

- STUDY-T001/STUDY-T002：新增向后兼容的内容信任 schema、增量迁移门和可验证 review receipt；receipt/evidence 以精确 companion allowlist 进入同一个 canonical note commit，缺失、陈旧、重放或额外 dirty path 会在队列标记完成前失败；旧 1,975 篇保持 `legacy-unverified`，未改正文。
- STUDY-T003：建立 tracked-files 隐私红线、历史指纹基线与脱敏输出；基线固定到 `acbf24ba`，逐条从冻结 Git blob 重证并锁定获批 6 项的规范化摘要，普通 PR 不能靠追加历史 fingerprint 降级新泄漏。
- STUDY-T004/STUDY-T006：worker 合并改为单目标 commit scope、assignment 来源绑定；远端发布校验仓库身份、正常 TLS、精确远端 commit 与并发一致性。
- STUDY-T005：队列写入改为 generation 事务、owner-token 锁、claim fencing 与租约恢复；commit/recovery 共用由父进程持有 fd 的 POSIX advisory lock，helper 崩溃不提前失锁、父进程崩溃由内核释放；append-only event 以有界单 syscall 追加并保留完整 JSONL 并发 suffix，manifest 拒绝 staged/target 别名；27 条历史失败保留。
- STUDY-T007/STUDY-T008/STUDY-T009：PR 与 Pages 共用 fail-closed CI，构建后拒绝 tracked/staged 生成漂移并检查 base...HEAD 空白；Actions 固定完整 SHA并由 Dependabot 提交受审更新；诊断移出公开 `dist` 并保留 7 天。
- STUDY-T010：Atlas 改用 62 个规范 taxonomy topic、1,975 条 NoteId sidecar 和 68 个至多 100 条的分块；旧 Atlas URL 不变。
- STUDY-T011/STUDY-T012：统一 `area::slug` 与 wikilink/backlink/queue 身份解析，建立共享消费者静态合同、1,672 条历史 unresolved 非增长预算、alias 合同和显式 broken-link 状态。
- STUDY-T013/STUDY-T014：质量门改为 note_type/学习证据/极端复制检查，并加入显式 freshness 生命周期、页面状态与只读定期报告。
- STUDY-T019：停用旧 `/auto-push` 与 legacy finalizer，关闭 destructive worktree sync；所有 queue/round/promote 写入口读取唯一 operations policy，tracked `APPROVED` 不能充当可重放授权，未实现限时、操作绑定、单次消费收据前全部批量写入 fail closed。
- STUDY-T018：修复两处绕过 `/study` base 的图片链接，增加确定性资产 manifest、尺寸/alt/目标审计和 legacy orphan 非增长基线。
- STUDY-T018：集成 PR #15 时保留其新正文，三张被移除引用的图片不扩入 legacy baseline、也不在本 PR 删除；新增带 source commit 和独立删除 disposition 的显式 orphan allowlist。
- STUDY-T019：PR #15 带回的六个历史批量审校入口全部接入默认拒绝的 operations policy；其 `data/audit-reviews/**` 只作为 legacy qualitative observations，不能冒充可验证 receipt。
- STUDY-T011：以 PR #15 的不可变 main commit 重证 wikilink 基线；unresolved 从 1,672 降至 1,526、group 从 1,361 降至 1,165，保留旧/新 baseline 哈希与 90 个新增或增长、248 个移除或下降 group 的 transition attestation。
- STUDY-T017：记录 dist/Pagefind/Atlas/public/仓库/源码 ZIP 的确定性大小基线与绝对、相对停止预算；耗时/RSS 保持趋势告警，不作噪声硬门。
- STUDY-T010/STUDY-T015：修复首页两条新手路径被 Markdown 渲染成代码块的回归并增加 dist 门禁；增加 Pagefind 上下文查询、canonical/sitemap/robots 与 `/study` base 的发布级输出合同。
- STUDY-T016：增加首页、开始页、六主题、双 Atlas、React/ReAct 的 axe/Chromium、320/375、深浅色、文本间距、搜索焦点与减少动态效果 smoke；Pagefind 使用首屏即存在的 polite live status 并加载中文状态文案，未执行的 VoiceOver 矩阵保持 `UNKNOWN`。

所有变化保持 `/study`、现有公开 URL、npm 既有命令及 JSON/JSONL 数据读取兼容。生产合并和部署不在本变更中执行。
