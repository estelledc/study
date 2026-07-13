# 审查证据与回执契约

Prompt 像检查清单，receipt 才像签过字的验收单。仓库只记录结构化命令参数、结果摘要和哈希，不保存凭证、私有 prompt、环境变量、完整 stdout/stderr 或 ignored runtime。

## 路径与身份

每篇 v2 笔记最多对应一个回执：

```text
data/review-receipts/<area>/<slug>.json
```

`area` 只能是 `papers` 或 `projects`。目录层级替代 `area::slug` 文件名，因此在 macOS、Linux 和 Windows 上都可用。

回执使用 `study-review-receipt-v1`，并记录：

- `note.area`、`note.slug`、`note.digest_sha256`
- `source_revision` 与 `research_input_sha256`
- 三类 reviewer 的角色、版本、决定、分数、告警摘要
- `review_mode` 与 `code_mode`
- 单调递增的 `generation` 与上一代 receipt digest
- 创建时间

三类角色是 `ZERO_BASE`、`ENGINEER`、`ACADEMIC`。缺少某类 reviewer 时必须提供结构化 waiver；新内容不能用 `LEGACY_CONTENT` 理由绕过审查。

## 两种执行模式不能混为一谈

每个 reviewer 都分别记录：

- `review_mode`：这次审查本身如何完成。
- `code_mode`：代码或命令是否真正执行。

两者的枚举相同：`ACTUAL_RUN`、`STATIC_REVIEW`、`MANUAL_SIMULATION`、`NOT_APPLICABLE`。人工模拟可以作为审查线索，但不会被计算为真实运行或 `VERIFIED`。

声明 `ACTUAL_RUN` 时必须引用 Git 跟踪的 `data/review-evidence/<area>/<slug>/*.json`。Artifact 记录参数数组、仓库相对工作目录、退出码、PASS/FAIL 和短结果摘要；不记录 shell 字符串、环境变量或原始输出。审计会重新读取文件、重算原始字节 SHA-256、确认 Git 跟踪状态并验证结构。缺失、未跟踪、哈希不符或退出失败都不能得到 `VERIFIED`。

## Legacy audit reviews

`data/audit-reviews/legacy-audit-reviews.jsonl` 与 `data/audit-reviews/manifest.json` 只保存历史批量 audit 的 qualitative observations。它们保留原始 review JSON 文本、原路径、字节数和 SHA-256，验证入口是：

```bash
npm run audit:legacy-reviews
```

这些记录不是 `study-review-receipt-v1`，不包含 `ACTUAL_RUN` evidence，也不能把 legacy 笔记升级为 `VERIFIED`。未来如果要把某篇笔记升级到 v2，仍必须生成当前契约下的 receipt 和 tracked evidence artifact。

## Note digest

`note.digest_sha256` 基于规范化 Markdown：

1. 换行统一为 LF，移除行尾空白。
2. 只排除带 `scripts/regen-backlinks.mjs` marker 的自动生成“反向链接”H2 段；手写同名段仍计入 digest。
3. 保留其余 frontmatter 与正文。

因此重新生成 backlinks 不会让回执过期；正文、可信字段或其他 frontmatter 变化会让旧回执变成 stale。

## 写入与验证

`writeReceiptAtomic` 会先做 schema/角色完整性检查，再持有同路径排他锁，比较调用者提供的 predecessor digest，验证 `generation = previous + 1`，最后通过同目录临时文件、文件同步和原子 rename 替换目标。旧 writer 的 replay、并发覆盖、无效 JSON 或不完整角色都不能覆盖当前回执。

内容契约审计会检查路径身份、note digest、来源修订和证据模式。公开红线扫描器随后证明回执没有敏感文件形态、用户绝对路径或可识别 token。

## Canonical merge 生命周期

Worker commit 仍然只能修改一篇目标笔记。Reviewer 结束后，当前 receipt 保持为该 worktree 的待提交变化；`ACTUAL_RUN` 引用的 evidence 必须已经加入 Git index。`round:merge-one` 在 cherry-pick 前执行以下证明：

1. source worktree 除当前 receipt 与它实际引用的 evidence 外没有其他变化；
2. evidence 已 staged，原始字节哈希、结构、执行结果和 note identity 全部匹配；
3. receipt 与 worker HEAD 中的 note digest、source revision 匹配，并且严格延续 canonical receipt 的 generation/predecessor；
4. 当前 claim、worktree、branch、worker commit、round lock 与 generation 仍然有效。

只有以上检查通过，canonical merge 才先 cherry-pick 单笔 note，再把已验证的 receipt/evidence 作为受控伴随路径 amend 到同一个 canonical commit。随后重新证明 note blob 未变化、commit 只包含 note 与精确伴随 allowlist，并在 canonical tree 再验一次 receipt。任一步失败都会阻断成功事件和后续 `written` 状态；worktree 同步不能再把未持久化的证据静默清掉。
