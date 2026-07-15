# Study 操作交接入口

> 状态：当前接班入口。旧的批量生产 session 快照已失效，不得用于恢复自动循环；持续运行使用只读 supervisor + 有界 writer epoch。

## 2026-07-15 继续推进 4 篇 agent 记忆 / 规划论文全流程完成记录

- status：`complete`
- 起始 ref：`3310b4029be581cc817a9cbada0bbc6a1cbe00a8`（PR #39 merge 后的 `origin/main`）。
- 完成 ref：`5a9918eb9407eff8ccb6bf8e54f36634e2f67128`（PR #40 merge commit）。
- external delta：PR #40 `Add four agent memory and planning papers` 已合并；GitHub Pages workflow `29386679627` 已成功完成，公开站点为 `https://estelledc.github.io/study/`。
- 内容 delta：新增 4 篇 `study-v2` paper note（`generative-agents`、`memgpt`、`memorybank`、`lats`）、4 份 `study-review-receipt-v1`，并刷新 atlas / note-index / 公开规模文案；当前公开计数为 projects=961、papers=1083、total=2044。
- 本轮不足总结：上一轮 agent 安全 / 鲁棒性补了 prompt injection、隐私与环境伪装攻击，但仍偏“防御外部风险”；agent 内循环能力还缺长期记忆、用户画像、反思抽象和搜索式规划四条基础主线。
- objective：新增 4 篇 `study-v2` paper note，补强 agent memory / reflection / planning：`Generative Agents`、`MemGPT`、`MemoryBank`、`LATS`。
- scope：允许新增 `src/content/docs/papers/*.md`、`data/review-receipts/papers/*.json`，刷新 `data/note-index.json`、papers atlas 派生页和公开计数文案；不修改候选队列、policy/threshold、既有论文正文语义。
- activated_by：`explicit-user-request-2026-07-15-continue-study`
- review_after：`2026-07-15`
- dispatch note：`npm run round:dispatch -- --rewrite 0 --new 4 --dry-run` 被 `papers-new short: got 0, need 2` / `batch-size mismatch: got 2, expected 4` 阻止；本轮未 apply 队列，不 claim project assignment，改走显式授权的手工 4-paper Publication 路径。
- acceptance_checks：
  - `lr search arxiv` + arXiv API 元数据核验 4/4；
  - `node scripts/quality-gate.mjs` 逐篇通过，行数分别为 146 / 150 / 146 / 144，无 advisory；
  - `npm run audit:content-contract`：0 blocking，72 v2；
  - `npm run atlas`：2044 notes，69 chunks；
  - `npm run audit:counts`：projects=961、papers=1083、total=2044；
  - `npm run audit:links` / `npm run audit:wikilinks`：无 blocking；
  - `git ls-files -co --exclude-standard -z | node scripts/audit-public-redlines.mjs --stdin0`：0 blocking，1 legacy-baseline；
  - `npm run build:strict -- --log /tmp/study-20260715-agent-memory-round-build-clean.log`：通过；首次失败由 stale `.astro` cache 触发 duplicate-id warning，删除 ignored cache 后恢复；
  - `STUDY_CHANGED_FROM=origin/main npm run verify:ci`：本地通过；PR #40 远端 CI `29386521157` 通过；
  - GitHub Pages workflow `29386679627`：build 3m49s，deploy 13s，成功完成；
  - 线上冒烟：主页和 `generative-agents`、`memgpt`、`memorybank`、`lats` 均返回 200，并可见对应标题与 `UNVERIFIED` 边界。
- budget：1 个内容小批次、4 篇新增 paper、1 个可写切片、1 个本地 writer。
- external_outcome：4 篇新增论文笔记进入公开 study 站点；验证状态保持 `UNVERIFIED`。
- stop_conditions：规范工具链不可用；arXiv / LightRead 来源不可核验；content contract / redline / strict build / verify:ci 失败且无法在 scope 内修复；需要改 policy/threshold、候选队列或敏感内容；用户停止。
- 最终状态：`main...origin/main` 对齐；下一次写入只能由新的显式 backlog、外部状态变化或用户重新授权触发。
- superseded_by：`none`

## 2026-07-15 总结不足后推进 4 篇 agent 安全 / 鲁棒性论文全流程完成记录

- status：`complete`
- 起始 ref：`7f5523dcb4eb4d7314cf63c1c0fdef3d4301462e`（PR #37 merge 后的 `origin/main`）。
- 完成 ref：`64135ae485387e68c60fa84b1665be9a5ddd31fb`（PR #38 merge commit）。
- external delta：PR #38 `Add four agent security and robustness papers` 已合并；GitHub Pages workflow `29385090535` 已成功完成，公开站点为 `https://estelledc.github.io/study/`。
- 内容 delta：新增 4 篇 `study-v2` paper note（`agentdojo`、`injecagent`、`browser-agent-privacy`、`active-environmental-injection`）、4 份 `study-review-receipt-v1`，并刷新 atlas / note-index / 公开规模文案；当前公开计数为 projects=961、papers=1079、total=2040。
- 本轮不足总结：上一轮补齐了通用助手、浏览器与移动端评测环境，但仍偏“能力覆盖”；agent 安全与鲁棒性证据不足，尤其缺少间接 prompt injection、工具输出信任边界、浏览器 agent 隐私实践、多模态 / GUI 环境伪装攻击四条主线。
- objective：新增 4 篇 `study-v2` paper note，补强 agent safety / prompt injection / browser privacy / multimodal robustness：`AgentDojo`、`InjecAgent`、`Privacy Practices of Browser Agents`、`Active Environmental Injection`。
- scope：允许新增 `src/content/docs/papers/*.md`、`data/review-receipts/papers/*.json`，刷新 `data/note-index.json`、papers atlas 派生页和公开计数文案；不修改候选队列、policy/threshold、既有论文正文语义。
- activated_by：`explicit-user-request-2026-07-15-summarize-gaps-and-advance-one-more-round`
- review_after：`2026-07-15`
- acceptance_checks：
  - `lr search arxiv` 元数据核验 4/4；直接 arXiv API 曾 timeout / HTTP 429，因此本轮未声明 arXiv API 4/4；
  - `node scripts/quality-gate.mjs` 逐篇通过，行数分别为 139 / 144 / 138 / 142，无 advisory；
  - `npm run audit:content-contract`：0 blocking，68 v2；
  - `npm run atlas`：2040 notes，69 chunks；
  - `npm run audit:counts`：projects=961、papers=1079、total=2040；
  - `npm run audit:links` / `npm run audit:wikilinks`：无 blocking；
  - `git ls-files -co --exclude-standard -z | node scripts/audit-public-redlines.mjs --stdin0`：0 blocking，1 legacy-baseline；
  - `npm run build:strict -- --log /tmp/study-20260715-agent-security-round-build-clean.log`：通过；首次失败由 stale `.astro` cache 触发 duplicate-id warning，删除 ignored cache 后恢复；
  - `STUDY_CHANGED_FROM=origin/main npm run verify:ci`：本地通过；PR #38 远端 CI `29384917498` 通过；
  - GitHub Pages workflow `29385090535`：build 3m44s，deploy 14s，成功完成；
  - 线上冒烟：主页和 `agentdojo`、`injecagent`、`browser-agent-privacy`、`active-environmental-injection` 均返回 200，并可见对应标题与 `UNVERIFIED` 边界。
- budget：1 个内容小批次、4 篇新增 paper、1 个可写切片、1 个本地 writer。
- external_outcome：4 篇新增论文笔记进入公开 study 站点；验证状态保持 `UNVERIFIED`。
- stop_conditions：规范工具链不可用；arXiv / LightRead 来源不可核验；content contract / redline / strict build / verify:ci 失败且无法在 scope 内修复；需要改 policy/threshold、候选队列或敏感内容；用户停止。
- 最终状态：`main...origin/main` 对齐；下一次写入只能由新的显式 backlog、外部状态变化或用户重新授权触发。
- superseded_by：`none`

## 2026-07-15 总结不足后推进 4 篇通用助手 / 浏览器 / 移动端论文全流程完成记录

- status：`complete`
- 起始 ref：`38a0f7a8f31acca8ad728189d4e8530a72cba60c`（PR #35 merge 后的 `origin/main`）。
- 完成 ref：`41e0c66fd1f6302d9728c1624f49e66ccaa2a121`（PR #36 merge commit）。
- external delta：PR #36 `Add four general assistant benchmark papers` 已合并；GitHub Pages workflow `29383277293` 已成功完成，公开站点为 `https://estelledc.github.io/study/`。
- 内容 delta：新增 4 篇 `study-v2` paper note（`gaia`、`assistantbench`、`browsergym`、`androidworld`）、4 份 `study-review-receipt-v1`，并刷新 atlas / note-index / 公开规模文案；当前公开计数为 projects=961、papers=1075、total=2036。
- 本轮不足总结：上一轮 web / app / tool-use 环境卡完成了环境层补齐，但仍偏单类环境组件；缺少通用助手综合任务、真实耗时 open-web 任务、统一浏览器评测生态、移动 GUI 动态环境四条主线；所有新卡仍是 `STATIC_ANALYSIS` / `UNVERIFIED`，没有真实 benchmark 运行证据。
- objective：新增 4 篇 `study-v2` paper note，补强 general assistant / browser ecosystem / mobile GUI agent 评测：`GAIA`、`AssistantBench`、`BrowserGym`、`AndroidWorld`。
- scope：允许新增 `src/content/docs/papers/*.md`、`data/review-receipts/papers/*.json`，刷新 `data/note-index.json`、papers atlas 派生页和公开计数文案；不修改候选队列、policy/threshold、既有论文正文语义。
- activated_by：`explicit-user-request-2026-07-15-summarize-gaps-and-advance-one-more-round`
- review_after：`2026-07-15`
- acceptance_checks：
  - `lr search arxiv` + arXiv API 元数据核验 4/4；
  - `node scripts/quality-gate.mjs` 逐篇通过，行数分别为 136 / 136 / 143 / 140，无 advisory；
  - `npm run audit:content-contract`：0 blocking，64 v2；
  - `npm run atlas`：2036 notes，69 chunks；
  - `npm run audit:counts`：projects=961、papers=1075、total=2036；
  - `npm run audit:links` / `npm run audit:wikilinks`：无 blocking；
  - `git ls-files -co --exclude-standard -z | node scripts/audit-public-redlines.mjs --stdin0`：0 blocking；
  - `npm run build:strict -- --log /tmp/study-20260715-general-assistant-round-build-clean.log`：通过；首次失败由 stale `.astro` cache 触发 duplicate-id warning，删除 ignored cache 后恢复；
  - `STUDY_CHANGED_FROM=origin/main npm run verify:ci`：本地通过；PR #36 远端 CI `29383097432` 通过；
  - 线上冒烟：主页和 `gaia`、`assistantbench`、`browsergym`、`androidworld` 均返回 200，并可见对应标题与 `UNVERIFIED` 边界。
- budget：1 个内容小批次、4 篇新增 paper、1 个可写切片、1 个本地 writer。
- external_outcome：4 篇新增论文笔记进入公开 study 站点；验证状态保持 `UNVERIFIED`。
- stop_conditions：规范工具链不可用；arXiv 来源不可核验；content contract / redline / strict build / verify:ci 失败且无法在 scope 内修复；需要改 policy/threshold、候选队列或敏感内容；用户停止。
- 最终状态：`main...origin/main` 对齐；下一次写入只能由新的显式 backlog、外部状态变化或用户重新授权触发。
- superseded_by：`none`

## 2026-07-15 继续推进 4 篇 web / app / tool-use 环境论文全流程完成记录

- status：`complete`
- 起始 ref：`aac96ba8b574509edf089c20732a17b19e98b487`（PR #34 merge 后的 `origin/main`）。
- 完成 ref：`38a0f7a8f31acca8ad728189d4e8530a72cba60c`（PR #35 merge commit）。
- external delta：PR #35 `Add four web and tool-use agent papers` 已合并；GitHub Pages workflow `29382534990` 已成功完成，公开站点为 `https://estelledc.github.io/study/`。
- 内容 delta：新增 4 篇 `study-v2` paper note（`webarena`、`mind2web`、`appworld`、`toolsandbox`）、4 份 `study-review-receipt-v1`，并刷新 atlas / note-index / 公开规模文案；当前公开计数为 projects=961、papers=1071、total=2032。
- objective：在用户明确要求“继续推进”下，新增 4 篇 `study-v2` paper note，补强 web / app / tool-use agent 环境评测主线：`WebArena`、`Mind2Web`、`AppWorld`、`ToolSandbox`。
- scope：允许新增 `src/content/docs/papers/*.md`、`data/review-receipts/papers/*.json`，刷新 `data/note-index.json`、papers atlas 派生页和公开计数文案；不修改候选队列、policy/threshold、既有论文正文语义。
- activated_by：`explicit-user-request-2026-07-15-continue-study-round`
- review_after：`2026-07-15`
- acceptance_checks：
  - `lr search arxiv` + arXiv API 元数据核验 4/4；
  - `node scripts/quality-gate.mjs` 逐篇通过，行数分别为 139 / 142 / 141 / 141，无 advisory；
  - `npm run audit:content-contract`：0 blocking，60 v2；
  - `npm run atlas`：2032 notes，69 chunks；
  - `npm run audit:counts`：projects=961、papers=1071、total=2032；
  - `npm run audit:links` / `npm run audit:wikilinks`：无 blocking；
  - `git ls-files -co --exclude-standard -z | node scripts/audit-public-redlines.mjs --stdin0`：0 blocking；
  - `npm run build:strict -- --log /tmp/study-20260715-web-tool-round-build-clean.log`：通过；首次失败由 stale `.astro` cache 触发 duplicate-id warning，删除 ignored cache 后恢复；
  - `STUDY_CHANGED_FROM=origin/main npm run verify:ci`：本地通过；PR #35 远端 CI `29382391831` 通过；
  - 线上冒烟：主页和 `webarena`、`mind2web`、`appworld`、`toolsandbox` 均返回 200。
- budget：1 个内容小批次、4 篇新增 paper、1 个可写切片、1 个本地 writer。
- external_outcome：4 篇新增论文笔记进入公开 study 站点；验证状态保持 `UNVERIFIED`。
- stop_conditions：规范工具链不可用；arXiv 来源不可核验；content contract / redline / strict build / verify:ci 失败且无法在 scope 内修复；需要改 policy/threshold、候选队列或敏感内容；用户停止。
- 最终状态：`main...origin/main` 对齐；下一次写入只能由新的显式 backlog、外部状态变化或用户重新授权触发。
- superseded_by：`none`

## 2026-07-14 总结不足后再推进 4 篇补强论文全流程完成记录

- status：`complete`
- 起始 ref：`6dd71d8868a0142b88f2afefbdce353dba147678`（PR #32 merge 后的 `origin/main`）。
- 完成 ref：`28fd221feba93217c887d4856f6963ec00405a2a`（PR #33 merge commit）。
- external delta：PR #33 `Add four focused agent evaluation paper notes` 已合并；GitHub Pages workflow `29337616982` 已成功完成，公开站点为 `https://estelledc.github.io/study/`。
- 内容 delta：新增 4 篇 `study-v2` paper note（`mle-bench`、`terminal-bench`、`ruler-long-context`、`visualwebarena`）、4 份 `study-review-receipt-v1`，并刷新 atlas / note-index / 公开规模文案；当前公开计数为 projects=961、papers=1067、total=2028。
- 本轮不足总结：上一轮 40 篇完成了规模和部署闭环，但多数卡片仍是 `STATIC_ANALYSIS` / `UNVERIFIED`；部分卡片 91 行、低于建议 100 行；L4 主要是 toy / manual simulation；主题上对 ML 工程 agent、终端 agent、长上下文有效窗口、视觉 Web GUI agent 的覆盖仍不够。
- 本轮 objective：新增 4 篇更厚的 `study-v2` paper note，分别补强 `MLE-bench`、`Terminal-Bench`、`RULER`、`VisualWebArena`，保持 `UNVERIFIED` 边界，不声明运行真实 benchmark。
- scope：允许新增 `src/content/docs/papers/*.md`、`data/review-receipts/papers/*.json`，刷新 `data/note-index.json`、papers atlas 派生页和公开计数文案；不修改候选队列、policy/threshold、既有论文正文语义。
- activated_by：`explicit-user-request-2026-07-14-summarize-gaps-and-advance-one-more-round`
- review_after：`2026-07-14`
- acceptance_checks：
  - `lr search arxiv` + arXiv API 元数据核验 4/4；
  - `node scripts/quality-gate.mjs` 逐篇通过，行数分别为 135 / 137 / 147 / 138，无 advisory；
  - `npm run audit:content-contract`：0 blocking，56 v2；
  - `npm run atlas`：2028 notes，69 chunks；
  - `npm run audit:counts`：projects=961、papers=1067、total=2028；
  - `npm run audit:links` / `npm run audit:wikilinks`：无 blocking；
  - `git ls-files -co --exclude-standard -z | node scripts/audit-public-redlines.mjs --stdin0`：0 blocking；
  - `npm run build:strict -- --log /tmp/study-one-more-round-build-clean.log`：通过；首次失败由 stale `.astro` cache 触发 duplicate-id warning，删除 ignored cache 后恢复；
  - `STUDY_CHANGED_FROM=origin/main npm run verify:ci`：本地通过；PR #33 远端 CI `29337305373` 通过；
  - `git diff --check`：通过；
  - 线上冒烟：主页和 `mle-bench`、`terminal-bench`、`ruler-long-context`、`visualwebarena` 均返回 200，并可见对应标题与 `UNVERIFIED` 边界。
- budget：1 个内容小批次、4 篇新增 paper、1 个可写切片、1 个本地 writer。
- external_outcome：4 篇新增论文笔记进入公开 study 站点；验证状态保持 `UNVERIFIED`。
- stop_conditions：规范工具链不可用；arXiv 来源不可核验；content contract / redline / strict build 失败且无法在 scope 内修复；需要改 policy/threshold、候选队列或敏感内容；用户停止。
- 最终状态：`main...origin/main` 对齐；下一次写入只能由新的显式 backlog、外部状态变化或用户重新授权触发。
- superseded_by：`none`

## 2026-07-14 新增 40 篇论文全流程完成记录

- status：`complete`
- 起始 ref：`384787e09827c336baf5ac2b33e67e8c91b9df49`（PR #30 merge commit）。
- 完成 ref：`9eadc605426eed61b7c4ffcc9377d0230b143381`（PR #31 merge commit）。
- external delta：PR #31 `Add 40 arXiv paper study cards` 已合并；GitHub Pages workflow `29333213667` 已成功完成，公开站点为 `https://estelledc.github.io/study/`。
- 内容 delta：新增 40 篇 `study-v2` paper note、40 份 `study-review-receipt-v1`，并刷新 atlas / note-index / 公开规模文案；当前公开计数为 projects=961、papers=1063、total=2024。
- 本地验收：`STUDY_CHANGED_FROM=384787e09827c336baf5ac2b33e67e8c91b9df49 npm run verify:ci` 全部通过；`node scripts/quality-gate.mjs --changed-from 384787e09827c336baf5ac2b33e67e8c91b9df49 --json` 通过；`npm run audit:counts && npm run audit:content-contract && npm run audit:links && npm run audit:wikilinks` 通过；`git diff --check` 通过。
- 线上冒烟：主页返回 200；抽样 `palm-2022`、`self-instruct-2022`、`gorilla-2023`、`longnet-2023`、`dreambooth-2022`、`toxigen-2022` 均返回 200，并可见“本轮 40 篇 / Batch N”内容。
- 最终状态：`main...origin/main` 对齐；supervisor 为 `WAIT_HEALTHY`、`blockers=[]`。下一次写入只能由新的显式 backlog、外部状态变化或用户重新授权触发。

## 2026-07-14 新增 40 篇论文与部署 Epoch Contract

- status：`complete`
- objective：在用户明确授权“分十批新研究 40 篇论文，全流程部署”下，新增 10 批 × 4 篇公开 arXiv 论文研究卡，覆盖 foundation/scaling、开放模型、instruction tuning、reasoning prompt、agent/tool use、PEFT、长上下文/推理、多模态生成与评测安全。
- scope：允许新增 `src/content/docs/papers/*.md`、`data/review-receipts/papers/*.json`，刷新 `data/note-index.json` 与 papers atlas 派生页，同步公开规模文案和本 handoff；不修改候选队列、policy/threshold、既有论文正文语义或远端配置。
- activated_by：`explicit-user-request-2026-07-14-new-40-papers-full-deploy`
- review_after：`2026-07-14`
- acceptance_checks：
  - arXiv API 元数据校验：40/40 条目可解析；
  - `node scripts/quality-gate.mjs --changed-from main --json`：checked=40, pass=true；
  - 40 份 `study-review-receipt-v1` 的 canonical note digest 与正文一致；
  - `npm run atlas`：2024 notes, 69 chunks；
  - `npm run audit:counts`；
  - `npm run audit:content-contract`；
  - `npm run audit:links`；
  - `npm run audit:wikilinks`；
  - `git ls-files -co --exclude-standard -z | node scripts/audit-public-redlines.mjs --stdin0`；
  - `npm run build:strict -- --log /tmp/study-forty-build-clean.log`；
  - `git diff --check`；
  - 提交后使用 `STUDY_CHANGED_FROM=384787e09827c336baf5ac2b33e67e8c91b9df49 npm run verify:ci` 做 PR/Pages portable gate。
- budget：10 个内容小批次、40 篇新增 paper、1 个可写切片、1 个本地 writer、1 次 branch/PR/merge/deploy 窗口。
- external_outcome：40 篇新增论文笔记进入公开 study 站点；验证状态保持 `UNVERIFIED`，不声明实际运行论文 benchmark。
- stop_conditions：规范 Node/npm 不可用；arXiv 来源不可核验；内容契约、红线审计、strict build 或 verify:ci 失败且无法在本 scope 内修复；需要修改 policy/threshold、候选队列或隐私敏感内容；远端 CI/Pages 失败且需要新权限；用户停止。
- superseded_by：`none`

## 2026-07-14 新增 4 篇论文与部署 Epoch Contract

- status：`complete`
- objective：在当前用户明确授权下，新研究并发布 4 篇公开 arXiv 论文笔记：`OSWorld`、`ToolBench-X`、`MemGym`、`SWE-Bench-CL`，补齐 agent 环境、工具可靠性、长程记忆与 SWE 持续学习四条主线。
- scope：允许新增 `src/content/docs/papers/*.md`、`data/review-receipts/papers/*.json`，以及由 atlas / note-index / 公开计数文案 / handoff / 部署门禁确定性更新的文件；不改候选队列，不改 policy/threshold，不改旧论文正文语义。
- activated_by：`explicit-user-request-2026-07-14-new-4-papers-full-deploy`
- review_after：`2026-07-14`
- acceptance_checks：
  - `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && npm run status:supervisor`
  - `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && node scripts/quality-gate.mjs src/content/docs/papers/{osworld,toolbench-x,memgym,swe-bench-cl}.md`
  - `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && npm run audit:content-contract`
  - `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && STUDY_CHANGED_FROM=f487efbcd135faf1e1de9fcd2ccf043437a244fe npm run verify:ci`
  - `git diff --check`
  - GitHub PR / merge / Pages deploy checks for the final pushed branch.
- budget：1 个内容小批次、4 篇新增 paper、1 个可写切片、1 个本地 writer、1 次部署窗口。
- external_outcome：4 篇新增论文笔记进入公开 study 站点，并通过 GitHub Pages 线上部署验收；验证状态保持 `UNVERIFIED`，不声明实际运行论文 benchmark。
- stop_conditions：规范 Node/npm 不可用；内容契约或红线审计失败且无法在本 scope 内修复；需要修改 policy/threshold、候选队列或隐私敏感内容；远端 CI/Pages 连续失败且需要新权限；用户停止。
- superseded_by：`none`

## 上一轮接班背景（保留历史）

- supervisor 状态：`WAIT_HEALTHY`；`scale-budget-exceeded` 已通过批准的 legacy audit review 聚合迁移解除，当前无 hard blocker。
- scope：launch scope 内的本地 workflow 文档、测试、审计、工具链和站点非内容代码质量维护。
- 起始 ref：`c309d5d270e30ec7764c4a7d456a1dde4b489b49`（PR #24 merge commit）；本轮从最新 `origin/main` 新建分支 `codex/study-audit-evidence-migration`，已 push 到远端并打开 PR #25。
- detector fingerprint：原失败为 `node scripts/benchmark-site.mjs --compare data/performance-baseline.json` 报告 `repository.tracked_files=4745 exceeds baseline=2733, threshold=3007`。根因是 1975 条 legacy audit review 以逐文件 JSON 存放。已迁移为 `data/audit-reviews/legacy-audit-reviews.jsonl` + `manifest.json`，并保留每条原始 review 的路径、字节数与 SHA-256。
- external delta 计数：PR #24 与 PR #25 均已 merged；main build/deploy 已通过。PR #26 已打开为 Draft，用于修正 `openai-agents-sdk` 的 v0.18.2 API / 版本漂移；本地 `npm run verify:ci` 已通过，远端状态以 PR #26 最新 head checks 为准。
- 已完成切片：
  1. 建立 recurring supervisor + bounded epoch 状态机（supervisor-policy、supervisor-status）；
  2. 加入自动巡检/自动检修 allowlist 与 denylist，包含六项 repair requirements；
  3. 把旧数量仪表盘（loop-status）收口为只读状态入口；
  4. 把旧 `exit-conditions.mjs` 退役为永远 fail-closed；
  5. 扩展 audit-operation-entrypoints 增加政策安全校验；
  6. 本机安装规范 Node 22.23.1 / npm 11.17.0（用户目录 nvm，不修改 shell profile）；
  7. 收口全部 21 个 progression-contract 文件为三个本地原子提交（e8da6035, e966686b, 4c738432）；
  8. 独立验证 epoch：重跑全量验收，verify:ci 23 步全部通过（含 strict build 2062 页、23 个 Playwright a11y 浏览器测试、350 个单元测试、所有审计），父仓 harness-check 0 error 0 warning。
  9. 修复 `status:supervisor` 对 gitignored `data/supervisor-state.json` 中 `no_delta_batches` 的读取：达到阈值时进入 `PARKED_NO_DELTA`，runtime 损坏时 fail-closed 为 `PARKED_HUMAN`；本地提交 `96860c75`。
  10. 修复 `PARKED_NO_DELTA` 的 `next_action`：明确等待真实 external delta 或 operator reauthorization，避免被误解为普通 scheduled wake；本地提交 `796efb9b`。
  11. 修复 `data/supervisor-state.json` 可解析但 schema 非法时静默清零 `no_delta_batches` 的风险：缺失字段、字符串、负数或数组均 fail-closed；本地提交 `ef31c30b`。
- 12. 修复 `status:supervisor` 漏掉规模 detector 的问题：automatic inspection 加入 `benchmark-site --compare`；`status:supervisor` 暴露 `scale-budget-exceeded`、冻结新增内容，并保持 audit evidence、performance budget 与 baseline 不变。
  13. 完成批准的 audit evidence migration：本地提交 `2acd44cef` 聚合 1975 条 legacy review，新增 `npm run audit:legacy-reviews`，删除旧 `data/audit-reviews/papers/*.json` 与 `projects/*.json` 逐文件布局。
  14. 更新 performance baseline 与操作文档：本地提交 `e68eaf52b` 记录 `repository.tracked_files=2775` 与 `legacy_audit_review_items=1975`，未提高 threshold。
  15. 发起 `openai-agents-sdk` 小型 Publication：将单篇笔记升级为 `study-v2`，锁定 OpenAI Agents SDK v0.18.2 tag commit，修正 `run_input_guardrails_first` 为 `@input_guardrail(run_in_parallel=False)`，并补静态 review receipt。
- 验证结果：`npm run audit:legacy-reviews` 通过，验证 1975 records；`node scripts/benchmark-site.mjs --compare data/performance-baseline.json` 通过；`npm run status:supervisor` 返回 `WAIT_HEALTHY`、`blockers=[]`；`npm run verify:ci` 全部通过（含 tests、strict build 2062 页、23 个 Playwright a11y 测试、Pages artifact、Atlas/site benchmark）。
- 剩余 blocker：无。Publication 仍按政策需要单次授权；本轮迁移不授权内容 round。
- 下一次 wake 条件：PR #26 出现新的 CI/review/head 状态变化，content-health issue，或新的研究/维护指令。无外部变化时进入普通健康检查。
- 下一条命令：`source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && npm run status:supervisor`；PR 状态用 GitHub API 或浏览器查看 `https://github.com/estelledc/study/pull/26`。
- 下一位独立 agent 必须先读 `AGENTS.md`，建立 supervisor / epoch contract；不得自动恢复旧数量循环。

## 历史接班点：2026-07-14 4 篇论文本地执行状态

- 起始 ref：`f487efbcd135faf1e1de9fcd2ccf043437a244fe`（origin/main，PR #29 merge commit）。
- 完成 ref：`384787e09827c336baf5ac2b33e67e8c91b9df49`（PR #30 merge commit）。
- dry-run 结果：`npm run round:dispatch -- --rewrite 0 --new 4 --dry-run` 因 `papers-new short: got 0, need 2` 被阻止；本轮未修改候选队列，改走显式授权的手工 Publication 路径。
- 已完成切片：
  1. 规范工具链下 `status:supervisor` 从 Node 版本 blocker 恢复到 `WAIT_HEALTHY`；
  2. 新增 4 篇 `study-v2` paper note，均为 `STATIC_ANALYSIS` / `UNVERIFIED`；
  3. 新增 4 个 `study-review-receipt-v1` 静态 review receipt，receipt digest 已通过 `verifyReceiptAgainstNote` 校验；
  4. `npm run atlas` 刷新 `data/note-index.json`、`papers-atlas.md` 与 agent 主题 atlas chunk；
  5. 同步公开规模文案：论文 1023、项目 961、总数 1984。
- 本地已通过：
  - `node scripts/quality-gate.mjs` 针对 `osworld`、`toolbench-x`、`memgym`、`swe-bench-cl` 四篇；
  - `npm run audit:counts`；
  - `npm run audit:content-contract`；
  - `git ls-files -co --exclude-standard -z | node scripts/audit-public-redlines.mjs --stdin0`；
  - `npm run build:strict -- --log /tmp/study-build-check.log`；
  - `git diff --check`。
- 剩余动作：无；PR #30 已合并并完成 Pages deploy。本段仅保留为历史执行记录。

## 当前政策

- 不以内容总数作为本轮目标。
- `/auto-push` 已停用；不自动派发、提交或推送 `main`。
- launch scope 内的本地维护可以按 `AGENTS.md` 由 supervisor 持续观察并进入有界 epoch；内容 round 仍只允许显式授权、有限数量、先 dry-run 后确认。
- 既有笔记正文不可批量重写；历史 failure events 不得删除。
- 发布、队列和 worktree 的实时状态必须由命令重新读取，不在 handoff 中复制易过期数字或 ETA。

## 重新获取事实

```bash
npm run status:supervisor
npm run status:pipeline
node scripts/audit-runtime-state.mjs --json
node scripts/loop-status.mjs --json
```

操作顺序、停止条件和外部权限边界见：

- `AGENTS.md`
- `docs/operations-index.md`
- `docs/operations-policy.md`
- `data/operations-policy.json`
