# estelledc/study 后续执行计划

> 创建日期：2026-06-24
> 基于 SESSION-HANDOFF R35-R46（480 篇 / 20,000 目标 = 2.4%）的全量项目分析制定

## 项目现状快照（2026-06-24 实测）

| 指标 | 数值 |
|------|------|
| 当前总笔记数 | 1,520（papers 786 + projects 734） |
| 目标 | 20,000 |
| 完成度 | 7.6% |
| 已跑 round 数 | 257 |
| 候选池 queued | 389（candidates.jsonl 中 status=queued） |
| 候选池 written | 1,124 |
| Rewrite pool | 4（lexical / lottie / plane / hindley-milner） |
| Buffer 预估续航 | ~49 round（每 round 8 篇） |
| Build streak | ok |
| Graveyard 累计 | 20 |
| 上轮 R257 | 6/6 pass，wall time 9 min |

---

## 维度 1：内容规模推进（1,520 → 20,000）

### 阶段 A — 清库存（续航 ~49 round）

继续跑 `/auto-push` 消化剩余 389 queued candidates + 4 rewrite。

- 每 round 6-8 篇，~9 min/round（R257 实测）
- 每 session 10-15 round → 60-120 篇
- 389 queued / 8 per round ≈ 49 round 可用
- Rewrite pool 仅剩 4 个（lexical/lottie/plane 是 graveyard 常客，hindley-milner 是 SoT 超长），优先消化新 candidates

### 阶段 B — 扩池 Season 6-15 + E-H（queue < 100 时启动）

STATUS-PROJECTS.md 已规划 Season 6-15（约 75 个项目），STATUS-PAPERS.md 已规划 Season E-H（约 40 篇论文）。

行动：
1. 跑 `scripts/extract-candidates.mjs` 注入 Season 6-15 项目到 candidates.jsonl
2. 跑 `scripts/extract-candidates.mjs` 注入 Season E-H 论文到 candidates.jsonl
3. 新增约 115 个 candidate，续航延长 ~14 round

### 阶段 C — 候选池自动扩充机制

完善 `scripts/expand-pool.mjs`：
- exit-conditions.mjs 检测到 queue < 8 时自动触发
- 从 papers-queue.md / queue.md 中抓取未入池条目
- 从 career-plan.md 枢纽节点反向链接图谱发现新主题
- 目标：queue 永不见底

### 阶段 D — 长尾填充策略

已规划 Season 覆盖约 200 个独立主题，每主题衍生 5-10 个周边笔记（前置概念 / 对比分析 / 工具实践）→ 理论上 1,000-2,000。

到 20,000 的两个额外策略：
1. **反向链接驱动补全**：扫 `[[wikilink]]` 中指向不存在文件的链接 → 自动生成 candidate
2. **主题树深化**：career-plan.md §3 的 10 个一级主题，每个从枢纽向下展开 3-5 层

---

## 维度 2：内容质量提升

### 旗舰笔记标杆化

当前唯一模板 SoT 是 `hindley-milner.md`（176 行 12 段）。增加 2-3 个类型特定旗舰模板：
- projects 类：zustand 或 excalidraw
- 分布式系统类：raft
- AI 类：attention

手工打磨到最高标准，作为 writer subagent 的类型特定参考。

### 代码可执行验证

quality-gate.mjs 增加第 8 项检查：
- 提取代码块（js / python / bash）
- 用 `node -e` / `python3 -c` 跑 syntax check
- 至少语法不能错

### 反向链接噪声治理

枢纽节点（hindley-milner 126 反向引）反向链接列表过长。方案：
- 阈值 top 20，其余折叠
- 或按主题分组显示

### Reviewer panel 可信度提升

3 起 graveyard 事件来自 subagent 谎报。对策：
- reviewer prompt 增加"必须引用笔记原文至少 2 处才能给 pass"硬约束

---

## 维度 3：流水线与基础设施优化

### 增量构建

Astro `--incremental`（实验性）→ finalize-round.sh 中切换，只编译被 cherry-pick 修改的文件。测试 Starlight 兼容性，不兼容退回全量 + 缓存。

### Worktree 扩容

当前 8 worktree 限制 round size。改为动态模式：
- round 开始时 `git worktree add`
- round 结束后 `git worktree remove`
- dispatch-batch.mjs WORKTREES 配置改为动态

### Candidate pool URL 验证

dispatch-batch 前加一步 HEAD 请求验证 URL 可达性，失效标为 `status: unavailable`。

### 监控仪表盘

扩展 loop-status.mjs → `data/dashboard.json`（总进度 / 当日写入数 / graveyard 率 / reviewer 均分 / 主题分布），Astro 站加 `/dashboard/` 页面。

---

## 维度 4：站点体验与 SEO

### 学习路径生成

新增 `scripts/regen-paths.mjs`：
- 扫反向链接图，按拓扑排序为每个一级主题生成有序路径
- 写入 `src/content/docs/paths/`

### Atlas 索引增强

regen-atlas.mjs 扩展：按 `分类:` frontmatter 字段分组的多维索引。

### RSS 订阅

`@astrojs/rss` 插件，每次 push main 更新，只含最近 20 篇。

### opendesign 主题观察期

3 天日更不挂再 merge。每天跑：build + 段落行宽 >= 60ch + Pagefind 索引检查。

---

## 执行优先级

| 优先级 | 内容 | 时间窗 |
|--------|------|--------|
| P0 | 阶段 A 清库存（继续跑 `/auto-push`） | 立即 |
| P1 | 阶段 B 扩池（Season 6-15 + E-H 注入 candidates） | 1-2 天内 |
| P2 | 旗舰笔记标杆化 + reviewer 可信度提升 | 本周 |
| P3 | Worktree 扩容 + 增量构建 | 下周 |
| P4 | 学习路径 / Atlas 增强 / RSS | 持续迭代 |

---

## 关键风险

1. **API 限额**：满载 round（120 篇）约 600+ API 调用，需监控 rate limit
2. **内容同质化**：所有笔记同一模板 + 同一 SoT，大量生产后"长一个样"→ 旗舰多样化 + 类比池扩充
3. **Git 仓库膨胀**：20,000 篇 .md + 论文 figure（webp）→ 定期 `git gc` + 考虑 LFS
4. **Build 时间**：1,500 篇 ~1-2 分钟，20,000 篇可能 10+ 分钟 → 增量构建
