# real-use recursive dogfood — 用 cookbook 自己造 cookbook 站

date: 2026-05-31
mode: real-use（不是 simulated dogfood / dossier）
artifact: `v6/site-v1/`
约束：全程只查 `v6/lens-*.md` + `v6/paradigm/`，不查 study 笔记 / 行业 best practice / Google
评测维度：cookbook 决策能否端到端走通；每步 friction_log

## 任务

把 `v6/site-v0/`（功能跑通的 minimal 站）升级成像样的展示站 site-v1：
- index.html 改成有 hero + lens-grid 卡片的 landing
- 左侧 nav 加搜索框（即使 placeholder）
- 决策表 ring 列上色（视觉差异化）
- 部署/CI/Release 决策走 cookbook

## 决策步与 friction_log

### Step 1 — 站点框架

查 `lens-devtool.md` Q6 文档？：
- Vue → VitePress（adopt）
- 多语言 → Starlight（adopt）
- Rust → mdBook（adopt）

本站：纯 HTML + 中文单语 + 没用 Vue。三个 adopt 都不命中。

决策：**自建 SSG（python markdown，沿用 site-v0 的 build.py）**。

friction:
- type: cookbook_silent
- severity: mid
- gap: lens-devtool 候选表覆盖了"有栈倾向"的文档站方案，但<strong>"个人 / 1-2 屏 / 无栈倾向 / 仅展示已有 md"</strong>这种最朴素的场景没列。决策树 Q6 直接跳 Vue/i18n/Rust 三选一。
- cookbook_consulted: lens-devtool §候选表+决策树 Q6
- 是否阻塞: 不阻塞（自建是 fallback 路径），但需要靠 hardware_assumption 段反推"可以不挑工具"。

### Step 2 — 路由

查 `lens-frontend.md` 决策树 Q0：月预算 < $100 且 QPS < 5 → 静态导出 + CDN（SSG）。命中。

决策：**file-based 路由（每个 md → 同名 html）**。

friction:
- type: cookbook_too_abstract
- severity: low
- gap: lens-frontend Q0 给了"SSG"方向，但路由模式（file-based vs config-based vs hybrid）整 lens 没说。
- cookbook_consulted: lens-frontend §决策树 Q0
- 走的反推：lens 默认推荐栈是 Astro/Next，两者都是 file-based → 隐式默认。但隐式默认不算说过。

### Step 3 — 内容存储

决策：md 直读，构建期渲染成 html，git 跟踪源 md（不跟踪生成的 html，由 CI 产出）。

friction:
- type: no_friction
- severity: low
- gap: 无。lens-frontend Q0 + lens-devops Q0 PaaS 门给的方向（静态 + CDN）天然蕴含 "build-time render"。
- cookbook_consulted: lens-frontend Q0, lens-devops Q0

### Step 4 — 样式

查 `lens-frontend.md` 候选表：
- Tailwind+shadcn ring=adopt，trigger="业务 UI"
- Vanilla Extract trial，trigger="跨框架 token"
- styled-components hold

本站：1 个 landing + 12 个 lens 详情页，没业务交互。trigger 不命中。

决策：**手写 CSS（在 site-v0 style.css 上扩展，加 CSS 变量 + ring tag 颜色 + lens-card 网格）**。

friction:
- type: cookbook_too_specific
- severity: high
- gap: lens-frontend 候选表的 trigger 列把"业务 UI"作为唯一 Tailwind 触发条件，但<strong>1-2 屏的展示型小站</strong>这种场景，候选表完全没覆盖。"原生 CSS / 手写"路径甚至没在表里出现。
- cookbook_consulted: lens-frontend §候选表
- 走的反推：v5 的 F6 立场列锁定让我能精准看到 trigger 不命中，但同时也暴露了候选集的盲区——所有 adopt 项都<strong>预设你在做"应用"</strong>。
- 影响：本站做出来了；但如果新人按 cookbook 选样式，会被 Tailwind 的 trigger 误导（"我也做 UI"），结果引入不需要的依赖。
- 修复建议：lens-frontend 候选表加一行"原生 CSS"，trigger="< 3 屏静态展示 / 文档站"。

### Step 5 — 决策表渲染

本站核心是展示决策表。HTML table 已经够用，加 CSS 标 ring 颜色（adopt 绿 / trial 橙 / assess 紫 / hold 红）。

friction:
- type: cookbook_silent
- severity: low
- gap: 整个 cookbook 的核心信息载体是决策表，但<strong>没有任何 lens 或 paradigm 文档讨论"决策表如何在 UI 中呈现"</strong>。
- cookbook_consulted: paradigm/lens-schema-v6, paradigm/lint-rules-v6
- 注：这不是 cookbook 的失职——schema 关心结构，不关心 UI。但当我做"展示 cookbook"这种元任务时，没法从 cookbook 里找决策。
- 走的路径：自己定 ring 配色（adopt 绿等于 traffic-light 心智模型）。

### Step 6 — 站内搜索

查 `lens-data.md` 决策树：
- Q0 向量 < 100k → 嵌入式向量库 → sqlite-vss（ADR-5）
- Q5 召回 < 0.95 → BM25 hybrid

本站全文搜索是文本 BM25，不是向量。lens-data 谈的是<strong>后端 RAG 的 BM25</strong>，不是<strong>前端 SPA/SSG 静态 BM25 索引（lunr / flexsearch / pagefind）</strong>。

决策：**v1 仅 placeholder 输入框，禁用 disabled，搜索引擎留 v1.1**。

friction:
- type: cookbook_silent
- severity: high
- gap: 文档站站内搜索是高频需求（VitePress / Starlight 都内置），但 cookbook 没有任何 lens 提"前端静态搜索索引"。lens-data 的 BM25 是后端，lens-frontend 候选表无搜索条目，lens-devtool VitePress adopt 也只是顺带提了一下"Vue+Vite"trigger。
- cookbook_consulted: lens-data §决策树 Q5, lens-frontend §候选表, lens-devtool §候选表 VitePress
- 影响：阻塞了"完成搜索功能"这个 feature；只能交付 placeholder。
- 修复建议：lens-frontend 加一段"前端检索"或在 lens-data 加一段"client-side 索引"，覆盖 lunr / pagefind / flexsearch / Algolia DocSearch 四选一。

### Step 7 — 部署

查 `lens-devops.md` 决策树 Q0：单团队 + 预算 < $50/月 + < 100k 请求/天 → PaaS（Vercel / Fly / Workers）。命中。

决策：**GitHub Pages**（候选表 Vercel/Workers/Fly 都 adopt，Pages 不在表里但 Q0 通过；Pages 是最朴素的零成本零迁移路径）。

friction:
- type: cookbook_too_specific
- severity: mid
- gap: lens-devops 候选表把 PaaS 收敛到 Vercel/Workers/Fly 三家（都 adopt）。GitHub Pages 这种"GH 仓直接 publish"的零运维路径，被 out_of_corpus 隐含排除（虽然 out_of_corpus 字段没列 GH Pages，但候选表里没有）。
- cookbook_consulted: lens-devops §候选表 + 决策树 Q0
- 走的反推：本站本质是"v6/site-v1/ 目录直接 push 到 gh-pages 分支"，跟 Vercel/Fly 比一个数量级简单。Q0 的"PaaS"语义在该量级下应该 inclusive 包含 GH Pages。

### Step 8 — 部署 cost / Q0 cost-gate 验证

题目要求：跳过 K8s（个人项目），验证 Q0 cost-gate 真有用。

走 lens-devops 决策树：Q0 是首节点，命中即"PaaS"，<strong>跳过 Q1-Q6 全部</strong>（Compose / K8s / GPU / Karpenter / Spot 全部不读）。

friction:
- type: no_friction
- severity: low
- gap: 无。Q0 cost-gate 设计完全达成意图——"个人项目根本不该读 K8s 段"，cookbook 强制在第一步过滤掉。
- cookbook_consulted: lens-devops §决策树 Q0
- 验证结论：F9（v6 决策树首层门控）这个 fix 价值真切。site-v0 重构时也是命中 Q0 一秒退出。

### Step 9 — CI

查 `lens-devops.md`：GH Actions ring=adopt，trigger="GH 仓"。直接命中。

决策：**GitHub Actions on push → build.py → publish to gh-pages**。

friction:
- type: no_friction
- severity: low
- gap: 无。这是 cookbook 表现最干净的一步——一行候选 + 一个 trigger + 命中。
- cookbook_consulted: lens-devops §候选表 GH Actions

### Step 10 — Release

查 `lens-devtool.md` Q5：monorepo → changesets / Go → goreleaser / 个人 → np。

本站不是 npm 包，不是 Go 二进制，不发布 release——它是一个静态站。

决策：**跳过 Release 段**。

friction:
- type: cookbook_too_specific
- severity: low
- gap: lens-devtool Q5 假设产物一定是<strong>需要发布的 artifact</strong>（npm 包 / Go binary / CLI 工具）。"静态展示站不 release"这个 case 没明文，但走决策树到 Q5 没出口。
- cookbook_consulted: lens-devtool §决策树 Q5
- 走的反推：Q1 "产物？"分支已经把 CLI / GUI / npm 库列穷尽，但<strong>静态站</strong>不在三选一里——这是 Q1 的盲区，不只是 Q5。
- 修复建议：lens-devtool Q1 加分支"静态站 / 文档站 → 跳到 lens-devops Q0"，把出口接到对的 lens 上。

## 汇总

| 维度 | 数 |
|---|---|
| 决策步 | 10 |
| no_friction | 3（Step 3, 8, 9） |
| cookbook_silent | 3（Step 1, 5, 6） |
| cookbook_too_abstract | 1（Step 2） |
| cookbook_too_specific | 3（Step 4, 7, 10） |
| cookbook_misled | 0 |
| severity high | 2（Step 4 样式 trigger 误导 / Step 6 站内搜索阻塞） |
| severity mid | 2（Step 1 文档站缺 fallback / Step 7 GH Pages 不在 PaaS 候选） |
| severity low | 6 |
| 阻塞了交付 | 1（Step 6 搜索功能仅 placeholder） |

## "write vs use" gap 三条总结

1. **候选表 trigger 列默认"做应用"**：lens-frontend 的 Tailwind/shadcn trigger 写死"业务 UI"，把"展示型小站"挤出候选集；当任务是<strong>非应用</strong>时（文档站 / landing），cookbook 的候选集会误导新人引入过重的栈。
   - 修复：每张候选表加一行"轻量 / 静态 / 非应用" fallback。

2. **元任务（用 cookbook 展示 cookbook）暴露盲区**：决策表如何渲染（颜色 / 排序 / 高亮 ring）、站内搜索（lunr/pagefind/flexsearch）、静态站发布（GH Pages）—— 这三个都是"展示文档"类高频需求，但 cookbook 当前 8 个 lens 没有一个覆盖。
   - 修复：要么加 "lens-docs"（专门给文档站 / 知识库 UI），要么把这些条目加到 lens-frontend 的"内容站"段。

3. **Q0 cost-gate 真的有效（但 Q1 出口不全）**：lens-devops Q0 一步过滤掉 K8s 段，验证 F9 fix 价值。但 lens-devtool Q1 "产物？" 三选一（CLI/GUI/npm 库）漏了"静态站"出口，导致走到 Q5 时无路可退。
   - 修复：每个 lens 决策树的 Q1 应该有 catch-all 分支"其他 → 跨 lens 引用"。

## 实际交付

- `v6/site-v1/index.html` — 手写 landing（hero + lens-grid 卡片 + 决策导览）
- `v6/site-v1/style.css` — CSS 变量 + ring 颜色 + responsive
- `v6/site-v1/build.py` — 由 site-v0 改造，含 ring 列上色 + 完整 nav (含 lens-devtool) + 搜索框 placeholder
- `v6/site-v1/lens-*.html`, `paradigm/*.html`, `glossary.html` — 12 页生成
- 总计：13 个 html + 1 css + 1 py + 本日志

部署路径（待 CI 接入）：v6/site-v1 → push gh-pages branch → https://&lt;user&gt;.github.io/lens-cookbook/

## 下次 v2 候选改进（不 ship）

- 启用 pagefind 索引，搜索框 disabled 去掉
- 决策表加"trigger 命中标记"（hover 显示 trigger 命中条件）
- ADR 段加 anchor 链接 + 复制按钮
- 加 dark mode（CSS 变量已就绪，加 `prefers-color-scheme`）
