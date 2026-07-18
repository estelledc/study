# Study 操作交接入口

> 状态：当前接班入口。旧的批量生产 session 快照已失效，不得用于恢复自动循环；持续运行使用只读 supervisor + 有界 writer epoch。

## 2026-07-17 Research 标杆迁移 epoch 7

- status：Program `active`；本地 writer epoch 7 `complete`；连续三批无 external delta 暂停门已触发。
- 起始 ref：`3f9ddb487`。
- 完成 ref：`7442ccef5`。
- objective：收口 HTTP 客户端 Atlas 的剩余两页，比较 defaults/hook 型 ofetch 与 immutable fluent Wretch 的稳定源码合同。
- scope：ofetch、Wretch 两页、2 个 ignored worktree、共享源码审查记录、receipt/派生索引；未安装上游依赖、发送网络请求、运行上游测试、bundle 或性能 benchmark。
- activated_by：`explicit-user-goal-continue-quality-first-2026-07-17`。
- detector fingerprint：两页结构完整但缺固定 revision/self-test；旧正文把 ofetch retry 写成幂等 allowlist/指数退避，把 Wretch response-chain API 与 retry 默认写错。
- external delta：GitHub/npm metadata 只读核验 + 本地 blob-filtered clone；未 push、未开 PR、未部署，D 轴不变。
- 完成切片：
  1. `ofetch` 绑定内部一致且可达的 `v1.5.0` / `47fe8079...`，修正 payload-method retry、零 delay、`destr`、条件 exports 与 signal/timeout 边界。
  2. 明确披露 `ofetch@1.5.1` provenance 冲突：npm `gitHead` 在 canonical remote 不可达，GitHub 同名 tag 又指向自报 2.0 alpha 的提交；未猜测或伪造 1.5.1 revision。
  3. `wretch` 绑定 `32d5f68b...` / `3.0.9`，修正 object-spread immutability、ResponseChain error API、Node >=22、retry 10 次/500ms/4xx/network/method 边界。
  4. 新增共享 `docs/fetch-wrapper-source-review-20260717.md` 与两份 generation 1 static receipt；HTTP Atlas 的 5 页全部对齐，项目审计从 `16/961` 前进到 `18/961`。
- acceptance checks：
  - 两页 `quality-gate.mjs`：全部 pass、0 advisory。
  - 两份 receipt：正文 digest、固定 revision 与 provenance digest 一致，evidence state 为 `UNVERIFIED`。
  - `STUDY_CHANGED_FROM=3f9ddb487 npm run verify:ci`：规范 Node 22.23.1/npm 11.17.0 下，380 Node tests、Research/内容/receipt/红线/资产/strict build、2284 HTML、2283 sitemap URLs、23 Playwright tests、Pages/Atlas/站点预算和 diff 门禁全绿。
  - `audit:project-standard`：`benchmark-aligned=18`、`needs-evidence=943`。
  - `audit:content-contract`：projects `v2=18`、`legacy-unverified=943`、blocking 0。
- budget：2 个小型本地 worktree + 2 页静态源码迁移；单 writer。
- blocker：epoch 5、6、7 均无 D 轴 external delta，已达到“三批无 external delta”暂停门；不得继续开启本地内容批次填充进度。
- stop conditions：当前已命中暂停门；只有真实 external delta、owner 对 push/PR 的授权或新的显式范围重授权才能开启下一 writer epoch。
- 下一次 wake 条件：将本分支推送并进入 PR/review，或 owner 提供新的有限目标与 external outcome。
- 下一条命令：先 `git status --short --branch` 核对干净状态；未获远端授权前不要 push。
- superseded_by：`none`。

## 2026-07-17 Research 标杆迁移 epoch 6

- status：Program `active`；本地 writer epoch 6 `complete`。
- 起始 ref：`bfa0443bb`。
- 完成 ref：`3924ab07d`。
- objective：用同一证据合同横向校准 Axios、Ky、Got 三种 HTTP 客户端架构，验证浏览器/跨端 adapter、Fetch wrapper 与 Node Duplex 管线均可独立迁移。
- scope：Axios、Ky、Got 三页、3 个 ignored worktree、共享源码审查记录、receipt/派生索引；未安装上游依赖、发送网络请求、运行上游测试、bundle 或性能 benchmark。
- activated_by：`explicit-user-goal-continue-quality-first-2026-07-17`。
- detector fingerprint：三页教学骨架完整，但旧正文包含 Ky lazy execution、Got hook 签名、旧 Node 边界、固定 bundle/下载量/冷启动与未绑定性能结论。
- external delta：GitHub metadata 只读核验 + 本地 blob-filtered clone；未 push、未开 PR、未部署，D 轴不变。
- 完成切片：
  1. `axios` 绑定 `axios/axios@a092bae5...` / `1.18.1`，补 config → interceptor → transform → adapter → settle 主链与 401 replay 边界。
  2. `ky` 绑定 `sindresorhus/ky@3419113b...` / `2.0.2`，纠正 lazy execution，更新 state-object hook、per-attempt/total timeout 与 stream retry 缓冲边界。
  3. `got` 绑定 `sindresorhus/got@e3924aa1...` / `15.1.0`，补 Duplex Request → Promise wrapper、阶段 timeout、retry rules、Stream/Promise hook 和 body replay 边界。
  4. 新增共享 `docs/http-client-source-review-20260717.md` 与三份 generation 1 static receipt；项目审计从 `13/961` 前进到 `16/961`。
- acceptance checks：
  - 三页 `quality-gate.mjs`：全部 pass、0 advisory。
  - 三份 receipt：正文 digest、固定 revision 与 provenance digest 一致，evidence state 为 `UNVERIFIED`。
  - `STUDY_CHANGED_FROM=bfa0443bb npm run verify:ci`：规范 Node 22.23.1/npm 11.17.0 下，380 Node tests、Research/内容/receipt/红线/资产/strict build、2284 HTML、2283 sitemap URLs、23 Playwright tests、Pages/Atlas/站点预算和 diff 门禁全绿。
  - 首次直接运行被 Node 26.4.0 的 toolchain contract 拦截；切换仓库规范 Node 后从头通过，未修改或放宽门禁。
  - `audit:project-standard`：`benchmark-aligned=16`、`needs-evidence=945`。
  - `audit:content-contract`：projects `v2=16`、`legacy-unverified=945`、blocking 0。
- budget：3 个小型本地 worktree + 3 页静态源码迁移；单 writer。
- blocker：剩余 945 页仍需按主题恢复固定源码；上游运行证据不能由静态 review 替代。
- stop conditions：仓库规模不可控、canonical/revision 不唯一、需要猜测性能或兼容性、或一批无法独立验收时停止。
- 下一次 wake 条件：选择下一组边界互补且源码体量可控的项目，继续 1-3 页小批次。
- 下一条命令：从 `data/project-standard-audit.json` 筛选同主题 `needs-evidence` 页面，再核对 canonical GitHub repo 与 clone 体量。
- superseded_by：`none`。

## 2026-07-17 Research 标杆迁移 epoch 5

- status：Program `active`；本地 writer epoch 5 `complete`。
- 起始 ref：`1a4c016b0`。
- objective：在既有 Research/Study 精确交集耗尽后，验证“受控恢复小型上游源码 + 可跟踪 provenance”能继续高质量迁移。
- scope：Zod、Valibot、ArkType 三页、3 个 ignored worktree、共享源码审查记录、receipt/派生索引；未运行上游依赖、测试、bundle 或 TypeScript benchmark。
- activated_by：`explicit-user-goal-continue-quality-first-2026-07-17`。
- detector fingerprint：现有 160 个 Research worktree 的 8 个 canonical Study 交集已全部达标；三篇 schema 页仍含移动版本、固定性能数字和过时 canonical。
- external delta：GitHub 只读查询 + 本地 blob-filtered clone；未 push、未开 PR、未部署，D 轴不变。
- 完成切片：
  1. 用 GitHub canonical identity 筛选并恢复 `colinhacks/zod`、`open-circle/valibot`、`arktypeio/arktype`。
  2. `zod` 绑定 `912f0f51...` / `4.4.3`，补 core runner、异步边界、对象 key 策略与 classic/mini/core 分层。
  3. `valibot` 绑定 `32247b36...` / `1.4.2`，修正 canonical 组织、`typed`/`success`、pipe abort、object 策略与官方 i18n/JSON Schema。
  4. `arktype` 绑定 `03b1f015...` / `2.2.3`，从“字符串 DSL”扩展为 definition parser → scope/node → traversal/morph → output/ArkErrors。
  5. 新增共享 `docs/schema-validation-source-review-20260717.md`，三份 receipt 绑定其 digest；项目审计从 `10/961` 前进到 `13/961`。
- acceptance checks：
  - `STUDY_CHANGED_FROM=1a4c016b0 npm run verify:ci`：380 Node tests、Research/内容/receipt/红线/资产/strict build、2284 HTML、2283 sitemap URLs、23 Playwright tests、Pages/Atlas/站点预算和 diff 门禁全绿。
  - 三页 `quality-gate.mjs`：全部 pass、0 advisory。
  - `audit:project-standard`：`benchmark-aligned=13`、`needs-evidence=948`。
  - `audit:content-contract`：projects `v2=13`、`legacy-unverified=948`、blocking 0。
- budget：3 个约 69MB 本地 worktree + 3 页静态源码迁移；单 writer。
- blocker：剩余项目需要继续分批恢复固定源码；不得一次 clone 大量仓库。
- stop conditions：仓库规模不可控、canonical 重定向不明确、需要猜版本/性能、或一批无法独立验收时停止。
- 下一次 wake 条件：选择 2-3 个小型同主题仓库，先用 GitHub metadata 评估磁盘与活跃度。
- 下一条命令：从 `data/project-standard-audit.json` 选择正文结构强、仓库体量小且可形成横向比较的主题。
- superseded_by：`none`。

## 2026-07-17 Research 标杆迁移 epoch 4

- status：Program `active`；本地 writer epoch 4 `complete`。
- 起始 ref：`74ad09e9e`。
- objective：将 PaddleOCR 从 PP-OCRv4/2.x 旧教程迁移到固定 3.7.0 平台架构，并闭合 Astro 生产 Content Layer 缓存问题。
- scope：`paddleocr` 页面、receipt/派生索引，`build:strict` cache isolation；未安装 Paddle/PaddleX、下载权重、运行 OCR 或改其他 951 页。
- activated_by：`explicit-user-goal-continue-quality-first-2026-07-17`。
- detector fingerprint：旧页仍以 PP-OCRv4、`ocr(..., cls=True)` 和 `PPStructure(...)` 为主；固定源码已转为 PaddleX wrapper、PP-OCRv6、PP-StructureV3 与 PaddleOCR-VL。
- external delta：`0`；未 push、未开 PR、未部署，D 轴不变。
- 完成切片：
  1. 绑定 `PaddlePaddle/PaddleOCR@211989f0...` / `3.7.0`，更新高层 wrapper → PaddleX config → `create_pipeline()` → `predict()` 主链。
  2. 区分 OCR、结构化文档与 VLM 三类验收对象，删除“最强”、固定吞吐/大小和未绑定 benchmark 的结论。
  3. 新增应用型自测与 generation 1 static receipt；项目审计从 `9/961` 前进到 `10/961`。
  4. 纠正 epoch 3 的缓存修复：生产 Content Layer store 位于 `node_modules/.astro/data-store.json`，现与根 `.astro` 一并在 strict build 前清除。
- acceptance checks：
  - `STUDY_CHANGED_FROM=74ad09e9e npm run verify:ci`：380 Node tests、Research/内容/receipt/红线/资产/strict build、2284 HTML、2283 sitemap URLs、23 Playwright tests、Pages/Atlas/站点预算和 diff 门禁全绿。
  - PaddleOCR `quality-gate.mjs`：pass、0 advisory。
  - `audit:project-standard`：`benchmark-aligned=10`、`needs-evidence=951`。
  - `audit:content-contract`：projects `v2=10`、`legacy-unverified=951`、blocking 0。
- budget：1 个 OCR/文档平台项目 + 1 个构建可复现性修正；单 writer。
- blocker：后续 Research worktree 与 Study slug 不总同名，必须改用 canonical URL 映射，不能按目录名猜。
- stop conditions：canonical URL 不能唯一映射、需要猜 revision、缺少 Research 深析或无法通过全量门禁时停止。
- 下一次 wake 条件：生成 canonical GitHub URL 交集，选择 2-4 个同主题固定源码项目。
- 下一条命令：归一化 `research-worktrees/*` upstream URL，与项目页 `来源`/`trust.canonical_source` 做唯一 join。
- superseded_by：`none`。

## 2026-07-17 Research 标杆迁移 epoch 3

- status：Program `active`；本地 writer epoch 3 `complete`。
- 起始 ref：`d1f44f8fc`。
- objective：验证 Research 标准能同时约束角色化编排框架、conversation-first 平台和文档 ETL 库。
- scope：`crewai`、`librechat`、`unstructured` 三页及 receipt/派生索引；strict build 的 `.astro` 缓存隔离；未运行上游模型、Compose、Redis、OCR 或 checkpoint 恢复。
- activated_by：`explicit-user-goal-continue-quality-first-2026-07-17`。
- detector fingerprint：三页都有固定本地源码和 Research 深析，但旧正文把早期印象、经验数字或 self-hosting 营销语写成当前事实。
- external delta：`0`；未 push、未开 PR、未部署，D 轴不变。
- 完成切片：
  1. `crewai` 绑定 `crewAIInc/crewAI@985cf520...`，补齐 Crew/Flow、checkpoint/fork 与外部副作用边界。
  2. `librechat` 绑定 `danny-avila/LibreChat@20cd00c...` / `v0.8.7`，澄清 conversation-first、可恢复 stream、HITL 与自托管数据边界，并披露许可 metadata 冲突。
  3. `unstructured` 绑定 `Unstructured-IO/unstructured@d309caf8...` / `0.25.1`，修正弃用的表格参数、固定吞吐数字与 metadata 保证。
  4. 三页新增 generation 1 static receipt；项目审计从 `6/961` 前进到 `9/961`。
  5. `build:strict` 现在自行清除 `.astro` 派生缓存；真实复现中预置旧缓存后无 duplicate warning 完成构建。
- acceptance checks：
  - `STUDY_CHANGED_FROM=d1f44f8fc npm run verify:ci`：380 Node tests、Research/内容/receipt/红线/资产/strict build、2284 HTML、2283 sitemap URLs、23 Playwright tests、Pages/Atlas/站点预算和 diff 门禁全绿。
  - 三页 `quality-gate.mjs`：全部 pass、0 advisory。
  - `audit:project-standard`：`benchmark-aligned=9`、`needs-evidence=952`、snapshot current。
  - `audit:content-contract`：projects `v2=9`、`legacy-unverified=952`、blocking 0。
- budget：3 个固定源码项目 + 1 个构建可复现性修复；单 writer。
- blocker：精确同名交集中只剩 PaddleOCR；其余页面需要建立 slug/仓库映射或恢复新的固定源码。
- stop conditions：需要猜测 repo mapping、批量伪造 revision、提升静态阅读为运行证据或放宽门禁时停止。
- 下一次 wake 条件：单独迁移 PaddleOCR，并与 MinerU Research 的模型/代码/部署许可边界对齐。
- 下一条命令：核对 `research-worktrees/paddleocr` 对应固定提交与 `mineru-ecosystem-study` 深析。
- superseded_by：`none`。

## 2026-07-17 Research 标杆迁移 epoch 2

- status：Program `active`；本地 writer epoch 2 `complete`。
- 起始 ref：`4fdf9d9d5`。
- objective：从已有 Research 固定快照中迁移一批不同架构类型的项目页，并让反馈驱动的站点缺口在同一 epoch 闭环。
- scope：`opencode`、`dify`、`langchain` 三页及 receipt/派生索引；冷缓存 404 路由、资产清单与 Pagefind E2E readiness；未改其他 955 篇 legacy 项目正文、队列、政策阈值或远端。
- activated_by：`explicit-user-goal-continue-quality-first-2026-07-17`。
- detector fingerprint：三页已有教学骨架和固定 Research 源码，但缺 `study-v2` revision/evidence/self-test；冷缓存 CI 随后暴露 404 与搜索异步挂载合同缺口。
- external delta：`0`；只形成本地 commits，未 push、未开 PR、未部署，D 轴不变。
- 完成切片：
  1. `opencode` 绑定 `anomalyco/opencode@4a760b5...`，区分成熟 session 路径与 V2 迁移，修正旧 canonical 仓库。
  2. `dify` 绑定 `langgenius/dify@48e536b...`，把 self-hosting 与数据驻留分开，补 Workflow-first、插件和副作用边界。
  3. `langchain` 绑定 `langchain-ai/langchain@cf2115a...` / `1.3.14`，将旧 `AgentExecutor` 主线更新为 `create_agent` + middleware + LangGraph。
  4. 三页新增应用型自测与 generation 1 static receipt；项目审计从 `3/961` 前进到 `6/961`。
  5. 关闭 Starlight 会在冷缓存查询缺失 content entry 的默认 404，改由 base-safe 独立页面承载，并补 Person JSON-LD、canonical 与回归测试。
  6. Pagefind E2E 显式等待动态输入完成挂载；定向并发重复 10/10 通过，没有放宽结果断言或增加测试重跑。
- acceptance checks：
  - `STUDY_CHANGED_FROM=4fdf9d9d5 npm run verify:ci`：379 Node tests、Research/内容/receipt/红线/资产/strict build、2284 HTML、2283 sitemap URLs、23 Playwright tests、Pages/Atlas/站点预算和 diff 门禁全绿。
  - 三页 `quality-gate.mjs`：全部 pass、0 advisory。
  - `audit:project-standard`：`benchmark-aligned=6`、`needs-evidence=955`、snapshot current。
  - `audit:content-contract`：projects `v2=6`、`legacy-unverified=955`、blocking 0。
  - MinerU lab 仍有 2 个可选真实 parser 测试显式 skip；未提升为运行证据。
- budget：3 个同主题/相邻架构项目 + 验收反馈修复；单 writer。
- blocker：剩余 955 页仍需逐项目核对 canonical source、不可变 revision、主链、实践和 review receipt。
- stop conditions：需要批量猜测 revision、把静态阅读写成运行成功、放宽门禁、或无法将失败归因到有界变更时停止。
- 下一次 wake 条件：从 Research inventory 与 Study 页面交集中选出下一批固定源码项目，优先同一主题且 2-4 页。
- 下一条命令：匹配 `src/content/docs/research/**/repository-inventory` 与 `src/content/docs/projects/*.md`，再核对本地固定 worktree。
- superseded_by：`none`。

## 2026-07-17 Research 标杆整合与首批项目重构

- status：Program `active`；本地 writer epoch 1 `complete`。
- 起始 ref：`2d3daecdf9eac8e6fa1e0da774d17664a854a4f9`。
- objective：把父仓 Research Refresh Program 作为 Study 的可运行重构标杆，建立全量项目差距清单，并完成第一批证据诚实的项目页迁移。
- scope：`src/content/docs/research/`、Research/项目标准审计与 lab 运行器、导航/CI、3 个既有 `study-v2` 项目页及其 receipt；未改候选队列、政策阈值、958 篇 legacy 正文、远端或旧 worktree 拓扑。
- activated_by：`explicit-user-request-2026-07-17-unify-study-with-research-benchmark`。
- detector fingerprint：Study 有 961 个项目页，但基线仅 3 个 `study-v2`，其余 958 个缺固定 revision 和证据边界；Research 有已验收的 14 类、201 upstream 和实验闭环，但尚未进入 Study。
- external delta：`0`；只形成本地 review-ready branch，未 push、未开 PR、未部署，D 轴不变。
- 完成切片：
  1. 用 subtree 双亲提交 `5a2cb6df7` 导入 177 个正式 Research 文件，并保留筛选后的 44 个祖先提交。
  2. 为 152 份 Markdown 增加 Starlight frontmatter，分离公开内容与 `research-worktrees/` 外部源码；适配脚本第二次运行 `changed=0`。
  3. 新增 Research 结构审计、10 个便携 lab 模块、1 个固定 LangGraph 源码模块和 961 项项目标准快照。
  4. 将 `claude-agent-sdk`、`openai-agents-sdk`、`vercel-ai` 补齐应用型自测，receipt 升至 generation 3；评估结果为 `benchmark-aligned=3`、`needs-evidence=958`。
  5. 收窄 `npm test` 到 Study 自有测试目录，防止 ignored external worktree 污染测试发现。
- acceptance checks：
  - `STUDY_CHANGED_FROM=2d3daecdf... npm run verify:ci`：fresh `.astro` 条件下全绿；378 Node tests、23 Playwright tests、2283 sitemap URLs、内容/红线/SEO/Pages/规模门禁通过。
  - `npm run test:research-labs:full`：10 个便携模块通过；固定 LangGraph `49ae27c2...` 模块 4 tests 通过。
  - MinerU lab：纯函数合同通过；MarkItDown/OpenParse 未安装，2 个真实解析器对比显式 skip。
  - `git rev-list --parents -n 1 5a2cb6df`：第二父节点为 Research 历史 `65604a658`。
  - `git diff --check 2d3daecdf...HEAD`：通过。
- budget：1 个整合/标准化/首批内容 epoch；单 writer；没有扩大为 958 页机械批改。
- blocker：958 个 legacy 项目需要逐项目核对 canonical source、不可变 revision、主链、实践和 review receipt；不能用批量伪造 metadata 消除。
- stop conditions：需要放宽门禁、批量猜测 revision、把静态阅读写成运行成功、或同一批次无法独立验收时停止。
- 下一次 wake 条件：继续执行明确的项目迁移批次，或 owner 决定主题优先级；默认每批按当前内容政策保持有界。
- 下一条命令：`npm run audit:project-standard`，再从 `data/project-standard-audit.json` 选择同一主题的小批次。
- superseded_by：`none`。

## 2026-07-16 explorations 目录迁移路径修正

- status：`complete`
- 起始 ref：`8e4b7b5e060c9d1a3327376e4f8874f5508f2a97`
- objective：修正仓库随父项目迁入 `explorations/own/` 后的操作文档路径。
- scope：`scripts/README.md` 与本交接记录；不修改内容、队列、政策、依赖或远端状态。
- activated_by：`explicit-user-request-2026-07-16-organize-explorations`
- detector fingerprint：`scripts/README.md` 仍把仓库位置写成已不存在的 `explorations/study`。
- external delta：`0`；仅形成本地 review-ready change set，D 轴不变。
- 完成切片：将活动路径更新为 `explorations/own/study`。
- acceptance checks：`git diff --check` 通过；活动 README 中不再出现旧路径。
- budget：1 个文档切片、20 分钟、1 个本地 writer。
- blocker：无。
- stop conditions：定向检查通过即结束；若出现意外工作树重叠则停止。
- 下一次 wake 条件：新的显式维护指令或可核验的外部状态变化。
- 下一条命令：`git diff --check`
- superseded_by：`none`

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
