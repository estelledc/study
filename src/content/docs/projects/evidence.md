---
title: Evidence — 把 Markdown + SQL 编译成静态报告站
来源: https://github.com/evidence-dev/evidence
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门到中级
provenance: pipeline-v3
---

## 是什么

Evidence 是一个**让你写 .md 文件、在里面嵌 SQL 代码块，命令行一跑就编译出静态 BI 网站**的开源框架。日常类比：你写一份月度数据汇报，过去要在 Excel 出图、贴 PPT；Evidence 让你把同一份汇报当成博客文章写——正文里嵌一段 SQL，下面紧接着一句"上月营收同比增长 X%"，编译时 Evidence 把 SQL 跑一次、把结果填进文字、把图渲染成 SVG，最后吐出一个纯静态网站。

它由 Sean Hughes 和 Adam Wright 于 2021 年在 Y Combinator W22 batch 起步，主打 **"BI as Code"**：报表是源代码、git 是真相源、PR review 看的是数据可视化变更，跟分析师写 [[dbt-core]] 模型同一个工作流。技术栈是 [[sveltekit]] + DuckDB WASM，目前 GitHub ~5k stars。

## 为什么重要

不理解 Evidence，下面这些事都没法解释：

- 为什么"BI 工具"忽然有一支去学 [[dbt-core]] 的工作流——把 GUI 配置全换成纯文本 + git diff
- 为什么 [[duckdb-wasm]] 让浏览器端 BI 又活了一次——前端不靠后端 API，自己拿 parquet 算
- 为什么和 [[metabase]] / [[superset]] 同样开源 BI 但定位完全不同——Evidence 不接业务方，只服务分析师 + 报告读者
- 为什么投资人月报、客户交付报告这类**需要版本可追、能 review** 的场景，Evidence 比传统 BI 更合脚

## 核心要点

Evidence 的世界只有三件事：**.md 文件**、**SQL 代码块**、**Svelte 组件**。

1. **每个 .md 是一个页面**：放在 `pages/` 目录下，路径就是 URL。比如 `pages/revenue.md` 编译后是 `/revenue`。

2. **SQL 代码块定义查询**：用 ` ```sql query_name ` 围起来，命名后这个 query 就能在正文任何地方引用。Evidence 编译时按声明的数据源跑一次，结果落成 parquet。

3. **正文里用花括号引值、用 Svelte 组件画图**：
   - `{revenue[0].total}` 直接把 SQL 第一行某列的值嵌进句子
   - `<BarChart data={revenue} x=month y=total />` 用内置组件渲染柱状图
   - 组件来自 [[sveltekit]] 项目，全部是 Svelte 写的

4. **Universal SQL = 编译时跑 + 浏览器 DuckDB-WASM 二次过滤**：每条 SQL 在 build 时跑一次拿快照，部署后用户在前端拉过滤器，DuckDB WASM 直接对 parquet 重新聚合，无需后端。

5. **数据源**：Postgres / BigQuery / Snowflake / Redshift / [[duckdb]] / MySQL / SQLite / CSV / Parquet 都内置 driver，填一个连接串就行。

## 实践案例

### 案例 1：5 分钟跑一个最小报告站

```bash
npx degit evidence-dev/template my-report
cd my-report && npm install
npm run sources    # 拉数据源、跑所有 SQL、落 parquet
npm run dev        # 本地起 SvelteKit dev server
```

打开 `http://localhost:3000` 看到 demo 页。`pages/index.md` 改成你自己的就是新报告。这是 Evidence 比 [[metabase]] 易上手的另一种意义——**没有 server、没有数据库、就是一个 npm 项目**。

### 案例 2：一段 .md 长什么样

```md
# 2026 年 5 月营收回顾

\`\`\`sql monthly_revenue
SELECT
  date_trunc('month', order_date) AS month,
  SUM(amount) AS total
FROM orders
WHERE order_date >= '2026-01-01'
GROUP BY 1
ORDER BY 1
\`\`\`

5 月份营收为 **{monthly_revenue[4].total}** 元，环比 4 月
增长 {((monthly_revenue[4].total - monthly_revenue[3].total)
/ monthly_revenue[3].total * 100).toFixed(1)}%。

<BarChart data={monthly_revenue} x=month y=total />
```

编译产物是一个 HTML 页：标题、一段会自动填数字的正文、一张柱状图。SQL 不会出现在产出里，但**仓库里 git diff 一眼看到分析师改了哪段查询**——这是 Evidence 的核心价值。

### 案例 3：Universal SQL 跨源 join

声明两个数据源，一个 Postgres、一个 CSV：

```yaml
# sources/orders/connection.yaml
type: postgres
host: ...
```

```yaml
# sources/products/connection.yaml
type: csv
path: data/products.csv
```

正文里写：

```sql
SELECT o.order_id, p.category, o.amount
FROM orders.orders o
JOIN products.products p ON o.product_id = p.id
```

Evidence 编译时把两边都跑一次落 parquet，前端 [[duckdb-wasm]] 把这两份 parquet 当外部表 join——分析师感觉跟单库写 SQL 没区别，**真正的跨源是浏览器算的**。

### 案例 4：CI 化 + 静态部署

`.github/workflows/build.yml` 里：

```yaml
- run: npm run sources
- run: npm run build
- uses: cloudflare/pages-action@v1
  with:
    directory: build
```

每次 PR 跑一次 build，预览 URL 出现在 PR 里——reviewer 直接点开看新加的图表对不对。这套流程把"BI 报告变更"变成跟代码变更同质的 review 工作流，是 Evidence 区别于所有其他 BI 的杀手锏。

## 踩过的坑

1. **build 时跑全部 SQL，源慢编译就慢**：50 条查询、每条 30 秒，build 一次要半小时。增量 build 缓解但不彻底。生产建议把 SQL 切成 `--source-only=...` 子集分批跑。

2. **数据是编译时快照，不是实时**：用户看到的是上一次 build 的数据，要更新只能重新 build + 重新部署。不适合做"实时大屏"。

3. **Universal SQL 浏览器端有量级上限**：[[duckdb-wasm]] 在 Chrome 里几十万行 join 流畅，几千万行就卡。超量数据应该编译时就 aggregate 好，别留给前端算。

4. **Svelte 组件门槛**：内置组件够用，但自定义新图表要会写 Svelte，React/Vue 组件不能直接复用。组件库还在演进，**LineChart 的 props 在 v0.40 改过名**——升级时别忘读 changelog。

5. **build 产物含原始 parquet**：默认部署目录里有 `_evidence/queries/*.parquet`，包含原始数据。公开部署前要么走签名 URL、要么编译时就脱敏，否则等于把数据库 dump 公开了。

## 适用 vs 不适用场景

**适用**：

- 数据团队对外汇报：投资人月报、董事会材料、客户交付报告——一切版本可追
- 公司内 wiki 嵌活报表，分析师改 .md 而不是去 BI 后台点点点
- 教学场景：教统计、教 SQL，给学员一份可交互的、能跟着 fork 改的报告
- 已经在用 [[dbt-core]] / git-based 数据栈，想把"报表"也纳入同一个 PR 工作流

**不适用**：

- 业务方自助拖拽出图 → 用 [[metabase]]，Evidence 没有 GUI 编辑器
- 实时监控告警 → 用 [[grafana]]
- 几十亿行数据的探索式分析 → [[superset]] 直连数仓更现实
- 需要写权限把数据写回数据库 → Evidence 只读，没有写回机制

## 历史小故事（可跳过）

- **2021**：Sean Hughes 和 Adam Wright 在 YC W22 创业，最初想法是"分析师为什么不能像写代码一样写报告"。
- **2022**：v0.x 早期版本是 Vue 实现，后来全切 SvelteKit。
- **2023**：引入 Universal SQL，把 DuckDB WASM 嵌进前端，自此跨源 join 不再需要后端。
- **2024**：v0.40 Evidence Cloud 上线，做托管 + 私有部署的商业化。
- **2025**：组件 SDK 化，社区开始贡献第三方图表，Evidence 成为 "BI as Code" 流派的代表。

## 学到什么

1. **报表也能纳入代码工作流**：git diff、PR review、CI 部署这些工程实践，过去 BI 完全没有；Evidence 把它们一次性接齐
2. **编译时 + 浏览器算 = 新一代静态 BI**：[[duckdb-wasm]] 让"前端拿 parquet 自己算"成为可能，Evidence 是这个范式的最早工业化项目
3. **抽象选型决定用户画像**：Metabase 选 GUI（业务方）、Superset 选 Web IDE（分析师）、Evidence 选纯文本 + git（数据工程师）——同样画图，三种世界观
4. **静态网站可以承载非静态价值**：图表交互全在浏览器、数据快照来自编译时，部署成本比传统 BI 低一个数量级

## 延伸阅读

- 官方文档：[Evidence Documentation](https://docs.evidence.dev/)
- 模板库：[Evidence Templates](https://github.com/evidence-dev/template)（fork 一份就开始）
- 对比文章：[Why Evidence vs Traditional BI](https://evidence.dev/blog)（团队博客，多次写过定位差异）
- [[duckdb-wasm]] —— Universal SQL 的核心引擎，必读
- [[duckdb]] —— 编译时跑 SQL 的备选执行器
- [[sveltekit]] —— 静态站生成器底座
- [[dbt-core]] —— Evidence 上游常配的数据建模层

## 关联

- [[metabase]] —— 开源 BI，定位非技术业务方，与 Evidence 完全互补
- [[superset]] —— 开源 BI 的另一极，分析师 GUI
- [[duckdb-wasm]] —— Evidence 浏览器端的 SQL 执行器
- [[duckdb]] —— 编译时 query runner 之一
- [[sveltekit]] —— 输出静态站的底层框架
- [[dbt-core]] —— 数据建模层，常和 Evidence 串联使用
