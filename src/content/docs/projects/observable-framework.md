---
title: Observable Framework — 编译期跑数据，浏览器只看结果
来源: 'https://github.com/observablehq/framework'
日期: 2026-06-01
分类: projects / 数据可视化
难度: 入门到中级
---

## 是什么

Observable Framework 是 Observable 公司 2024 年 2 月开源的静态数据应用生成器。日常类比：传统 Jupyter notebook 是"现点现做"——前端要画图，就得有一个 Python kernel 一直在后厨候着；Framework 是"中央厨房预制菜"——build 时把 SQL/Python/R 跑一遍，结果封装成静态 CSV/Parquet/JSON，浏览器拿到只负责渲染，没人在后端。

最小骨架：

```
docs/
  index.md            ← 一篇 Markdown 即一页
  data/sales.sql      ← SQL 数据加载器，build 时执行
  data/forecast.py    ← Python 加载器，build 时跑预测
```

`index.md` 里这样写：

````markdown
```sql
SELECT region, sum(amount) FROM sales GROUP BY region
```

```js
const data = FileAttachment("data/forecast.json").json()
Plot.barY(data, {x: "region", y: "amount"}).plot()
```
````

`npm run build` 把 SQL 跑一次落 Parquet，Python 跑一次落 JSON，DuckDB-Wasm 在浏览器读 Parquet，Plot 渲染图——整个站零后端，可丢任何 CDN。

## 为什么重要

不理解 Framework，下面这些事都没法解释：

- 为什么数据团队做内部 dashboard 越来越爱"build 一次出静态站"——SaaS 比如 Hex/Mode 要月费且数据离开公司，Framework 全本地
- 为什么 [[duckdb]] + WebAssembly 让"浏览器里跑 OLAP"成立——以前要 Postgres + 后端 API，现在 Parquet 文件 + DuckDB-Wasm 就够
- 为什么 Observable 把 reactive notebook 做了快 8 年又另起炉灶做 Framework——notebook 的"实时 kernel"模式不适合发布给 100 个同事看
- 为什么 LLM 生成数据应用越来越倾向 "Markdown + 加载器" 这套——文件即页面，结构透明，比框架内 DSL 好补全

## 核心要点

Framework 的心智模型可以拆成 **三段**：

1. **Markdown 是源**：`docs/*.md` 一文件即一页面，prose / 代码块 / 组件混写。`fenced code block` 标 ` ```sql ` / ` ```js ` / ` ```python ` 决定 build 时由谁执行
2. **数据加载器是 build-time 脚本**：`data/foo.sql` / `data/foo.py` / `data/foo.R` / `data/foo.ts` / `data/foo.sh` 任意可执行文件，stdout 是产物。Framework 按 mtime 缓存，没改不重跑
3. **运行时只是 [[vite]] 静态产物**：build 完输出 `dist/`，是普通 HTML/CSS/JS，扔 Netlify / Vercel / GitHub Pages / S3 + CloudFront 都行

关键内置组件：

- **DuckDB-Wasm**：浏览器端跑 OLAP，` ```sql ` 代码块直接查 build 期落下的 Parquet
- **Observable Plot + D3**：[[observable-plot]] 是默认可视化层，D3 在底下兜底
- **Inputs**：`Inputs.range()` / `Inputs.search()` / `Inputs.table()` 等响应式控件
- **Reactive runtime**：从 Observable notebook 移植的 dataflow——某 cell 依赖 `x`，`x` 变它自动重算，无需 useState

写法约定：加载器名决定路由（`data/sales.sql` → `FileAttachment("data/sales.csv")`）；代码块可用 `echo`/`display` 控制是否显示源码。

## 实践案例

### 案例 1：SQL 加载器 + 浏览器查询

`data/orders.sql`：

```sql
INSTALL httpfs; LOAD httpfs;
SELECT * FROM read_parquet('s3://my-bucket/orders/*.parquet')
WHERE order_date >= '2026-01-01'
```

build 时这条 SQL 跑一次，结果落 `dist/_file/data/orders.parquet`。`docs/sales.md` 里：

````markdown
```sql id=top_skus
SELECT sku, sum(qty) AS total
FROM orders
GROUP BY sku ORDER BY total DESC LIMIT 10
```

```js
Plot.barY(top_skus, {x: "sku", y: "total"}).plot()
```
````

第二条 SQL 在**浏览器端**由 DuckDB-Wasm 执行——查的是同一个静态 Parquet。一次 build 落数据，多次过滤聚合都在前端。

### 案例 2：Python 数据加载器

`data/forecast.py`：

```python
import sys, json, pandas as pd
from prophet import Prophet

df = pd.read_csv("data/raw/sales.csv")
m = Prophet().fit(df.rename(columns={"date": "ds", "amount": "y"}))
future = m.make_future_dataframe(periods=90)
fcst = m.predict(future)[["ds", "yhat", "yhat_lower", "yhat_upper"]]
json.dump(fcst.to_dict(orient="records"), sys.stdout, default=str)
```

stdout 即产物。Framework 按文件名 `data/forecast.py` 注册路由 `data/forecast.json`。页面 `FileAttachment("data/forecast.json").json()` 读。Python 训练只在 build 跑一次，访客拿到的就是 JSON，不需要服务器。

### 案例 3：Inputs 联动 reactive cell

````markdown
```js
const region = view(Inputs.select(["北", "东", "南", "西"], {label: "区域"}))
```

```js
const filtered = orders.filter(d => d.region === region)
Plot.lineY(filtered, {x: "date", y: "amount"}).plot()
```
````

`view()` 让 select 的当前值变成响应式变量 `region`。下面 cell 引用 `region`，用户切换下拉框时自动重算 `filtered` 并重画——dataflow 由 runtime 调度，不用写监听。

## 踩过的坑

1. **数据加载器是 build-time 的**：第一感觉是"加载器不就是 API"——不是。`npm run build` 时跑一次落静态文件，访客**不会**触发它跑。要"用户输入参数 → 后端返回数据"那是普通 web 应用，应该上 Next.js / FastAPI

2. **大数据 build 慢**：1G CSV 在 build 期跑 SQL 聚合，每次 `npm run build` 都重跑会要命。Framework 用 mtime 缓存——加载器没改不重跑；CI 上要把缓存目录 (`docs/.observablehq/cache`) 缓存下来

3. **DuckDB-Wasm 内存有限**：浏览器端 wasm 受 tab 内存限制（通常 2-4G），原始数据应该在 build 期 ETL 成小 Parquet，别原样 1G 丢前端

4. **hot reload 仅 dev**：`npm run dev` 改 md / 加载器自动刷；`npm run build` 之后产物是凝固的，要换数据必须重 build。即"看板每天 6 点自动刷"得靠 CI 定时触发 build

5. **没有运行时后端**：用户提交表单写库 / 登录鉴权 / 实时通知都做不到——要做就得另接 API（Cloudflare Workers / 自建服务）。Framework 解决"看"的部分，不解决"写"

## 适用 vs 不适用场景

**适用**：

- 数据团队做内部 dashboard / 报告 / KPI 看板——build 一次发静态站，不要 SaaS 月费
- 新闻可视化 / 对外发布的数据故事——SEO 友好、CDN 极快、可离线截图
- 把 Jupyter 探索结果"产品化"给 50 个同事看——比导出 PDF 灵活，比起 kernel 服务便宜
- LLM 生成数据应用的目标格式——Markdown + 加载器结构透明

**不适用**：

- 实时数据流 / 秒级刷新——build 一次的设计不擅长，应转 streaming dashboard
- 用户级权限 / 写库交互——无后端，要么外接 API 要么换框架
- 大数据原始查询（百 G 起）——DuckDB-Wasm 跑不动，应保持服务端 OLAP（[[clickhouse]] / [[trino]]）
- 完全动态站——Framework 是 SSG，不要把 Next.js 该做的事让它做

## 历史小故事（可跳过）

- **2015–2016 年**：Mike Bostock 等人推出 Observable notebook——浏览器里 reactive 的数据笔记本，和 Jupyter 抢探索场景。
- **2016–2023 年**：notebook 适合个人探索，但给几十上百同事"发布只读看板"仍要挂 kernel 或导出静态截图，运维别扭。
- **2024 年 2 月**：Observable 开源 Framework：Markdown + build-time 加载器，把"探索"和"发布"拆开，静态站可丢 CDN。
- **之后**：DuckDB-Wasm、Plot、Inputs 成为默认栈；数据团队用 CI 定时 build 代替常驻后端。

## 学到什么

1. **build-time vs run-time**：数据加载推到 build，省掉后端——代价是数据凝固，刷新靠 CI（同 SSG / [[astro]]）
2. **stdout 即产物**：SQL/Python/R/JS/Shell 共用"可执行文件 + 标准输出"接口，polyglot 成本低
3. **Wasm 把 OLAP 搬进浏览器**：DuckDB-Wasm + Parquet 让"零后端数据应用"成立
4. **Markdown 是最小公倍数**：prose 给人读、代码块给机器跑，是 [[jupyter-notebook]] 之后的发布形态

## 延伸阅读

- 官方文档：[Observable Framework Docs](https://observablehq.com/framework/)
- 入门：[Getting Started](https://observablehq.com/framework/getting-started)
- 加载器：[Data loaders](https://observablehq.com/framework/loaders)
- [[observable-plot]] —— 默认可视化层
- [[duckdb]] —— 浏览器端 OLAP
- [[vite]] —— 底层构建工具

## 关联

- [[observable-plot]] —— Framework 默认可视化组件
- [[duckdb]] —— SQL 代码块在浏览器端的引擎
- [[d3]] —— Plot 之下的渲染兜底
- [[astro]] —— 同为内容驱动 SSG，Framework 更聚焦数据
- [[jupyter-notebook]] —— Framework 想替代的"实时 kernel"发布模式
- [[vite]] —— build 工具链底座

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
