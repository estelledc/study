---
title: Observable Framework — 编译期跑数据，浏览器只看结果
来源: Observable Inc., Observable Framework 1.0 (开源 2024-02)
日期: 2026-06-01
分类: 数据可视化
难度: 入门
---

## 是什么

Observable Framework 是一个**让你用 Markdown 写数据报告，在 build 时跑 SQL/Python/R 把数据"封装成静态文件"的静态站点生成器**。

日常类比：传统数据笔记本（Jupyter）像**餐厅现点现做**，得有服务员（Python kernel）一直站在后厨等你点；Observable Framework 像**中央厨房预制菜**，build 时把所有菜做好、装盒、贴标，用户拿到的盒饭打开就能吃，后厨没人。

你写一个 `.md` 文件，里面混着 SQL 查询：

````md
# 用户活跃度

```sql
SELECT date, count(*) FROM events.parquet GROUP BY date
```
````

build 时它跑 SQL 查 Parquet，把结果嵌进静态 HTML，浏览器打开就看见图。**没有任何运行时后端**。

## 为什么重要

不理解 Observable Framework，下面几件事都难解释：

- 为什么 2024 年还在出新的"静态站点 + 数据"工具——市面上 Jupyter / Streamlit / Dash 都要后端，部署费劲
- 为什么 D3 之父 Mike Bostock 不再做 Notebook 而做 Framework——notebook 是"思考工具"，Framework 是"产出工具"
- 为什么 polyglot（多语言）数据加载器是个核心卖点——以前只能选一种语言，现在 SQL 查 + Python 算 + R 统计可以混着写
- 为什么"编译期数据快照"突然流行——它把"数据访问成本"从每次访问都付，变成构建时一次性付清

## 核心要点

Framework 把数据应用拆成 **三步**：

1. **Markdown 是唯一源真相**：prose、代码块、组件、`<script>`混在一个 `.md` 里，**文件即页面**。比如 `docs/sales.md` 自动变成 `/sales` 路由。

2. **数据加载器 build 时跑**：在 `docs/data/` 下放 `users.csv.py` 或 `metrics.json.sql`，扩展名前的部分（`.csv` / `.json`）是产物格式，最后那段是脚本类型。build 时 Framework 调用 Python / DuckDB / R 跑脚本，输出存成静态文件。

3. **浏览器只看静态产物**：构建结果是纯 HTML/CSS/JS，扔到 GitHub Pages / Netlify / 任何 CDN 都能跑。**用户那边没有任何 server**。

三步合起来叫 **build-time data app**——把数据访问从运行时挪到编译期。

## 实践案例

### 案例 1：一个 SQL 查询直接画图

`docs/dau.md`：

````md
# 日活

```sql
SELECT date, count(distinct user_id) AS dau
FROM events.parquet
GROUP BY date
```
````

DuckDB 内置在 Framework 里。build 时它读 `events.parquet`、跑查询、把结果序列化进 HTML。浏览器打开就是一张已经画好的图。**整个过程没起 Python，没起 server，没装数据库**。

### 案例 2：Python 算复杂的、SQL 查简单的

`docs/data/clusters.json.py`：

```python
import json, sys
from sklearn.cluster import KMeans
import pandas as pd

df = pd.read_parquet('events.parquet')
labels = KMeans(n_clusters=5).fit_predict(df[['x', 'y']])
out = df.assign(cluster=labels).to_dict('records')
json.dump(out, sys.stdout)
```

build 时 Framework 跑这个 `.py`，标准输出捕获成 `clusters.json`。然后 `.md` 里直接：

```js
const clusters = await FileAttachment('data/clusters.json').json()
```

**Python 出现在 build 阶段，浏览器只看到 JSON**。

### 案例 3：响应式输入 + 静态数据

````md
```js
const threshold = view(Inputs.range([0, 100], { value: 50 }))
```

```js
Plot.dot(data, { filter: d => d.score > threshold })
```
````

`view()` 把 Inputs 组件变成响应式变量，`threshold` 一变，图自动重画——但**所有数据已经在浏览器里了**，没回服务器。这就是 Notebook 的"reactive"思想 + 静态站点。

## 踩过的坑

1. **数据加载器是 build-time，不是运行时**：你的数据 1G、跑 5 分钟，那 build 就要 5 分钟。要么做 cache（Framework 默认会缓存加载器输出），要么先把数据预处理瘦身。

2. **没有运行时后端 = 没法接收用户输入写库**：用户填表单"提交"——Framework 不管，要么外接独立 API，要么干脆别做需要写库的功能。

3. **DuckDB 是 in-process 的**：数据放在文件里，DuckDB 在 build 进程内查。**不是连远程数据库**。要从生产库取数，自己写 Python 加载器先 dump 出来。

4. **hot reload 只在 dev**：`npm run dev` 时改 `.md` 立刻刷新；但 production 必须重新 `npm run build` 才能更新数据。**数据有时效性的报告要排定期 CI 重 build**。

## 适用 vs 不适用场景

**适用**：

- 数据 dashboard（销售数据 / 监控指标 / KPI 周报）
- 新闻数据可视化（数据是历史快照，不变）
- 内部数据展示页（团队周会用、不用部署后端）
- 学习笔记带交互图表（像本站这种）

**不适用**：

- 实时数据流（每秒推送新数据 → 要 WebSocket，Framework 不管）
- 需要用户认证 / 权限控制 → 要后端
- 需要写库 / 提交表单 / 改数据 → 要后端
- 完全动态的 SaaS 产品 → 用 Next.js / Remix

## 历史小故事（可跳过）

- **2010 年**：Mike Bostock 在 NYT Graphics 部门写 D3，让"数据 + DOM"变成主流可视化范式
- **2017 年**：Bostock 离开 NYT，跟 Melody Meckfessel 等人创办 Observable, Inc.，做 reactive notebook
- **2017–2023**：Observable Notebook 成为数据科学家共享分析的主要平台之一，但**没法做 production app**——你不能让用户去你的 notebook 链接看 dashboard
- **2024-02**：Observable Framework 1.0 开源，定位"local-first、file-based、build-time"的数据应用框架，补 notebook 留下的产出空缺

Notebook 是"思考工具"，Framework 是"产出工具"——同一支队伍做的两个互补产品。

## 学到什么

1. **静态化数据是可行的**——大部分内部 dashboard 数据不需要"实时"，build 时跑一次足够，运维成本骤降
2. **polyglot 数据加载器是甜点**——不强迫你"选一门语言"，SQL 查 / Python 算 / R 画各取所长
3. **Markdown 作为唯一源真相是趋势**——Astro、Next.js MDX、Framework 都在走这条路，prose 和代码不再分离
4. **build-time 是被低估的运行时**——把工作挪到编译期能换来巨大的部署简化

## 延伸阅读

- 官方文档：[Observable Framework](https://observablehq.com/framework/)（包含 data loaders、SQL、Inputs 三大模块的说明）
- 开源仓库：[github.com/observablehq/framework](https://github.com/observablehq/framework)
- 数据加载器机制：[Data loaders 文档](https://observablehq.com/framework/data-loaders)
- DuckDB 在浏览器里的故事：[[duckdb]] —— Framework 的 SQL 引擎依赖
- [[d3]] —— Framework 的可视化底座
- [[astro]] —— 同期的另一种 Markdown-first 静态生成器，思路相通

## 关联

- [[d3]] —— Bostock 早年作品，Framework 的可视化默认组件
- [[duckdb]] —— Framework 内置 SQL 引擎，让 Markdown 写 SQL 直接查 Parquet
- [[astro]] —— 同样 Markdown-first 的静态生成器，但 Astro 偏内容站、Framework 偏数据站
- [[starlight]] —— 本站用的文档主题，与 Framework 同属"static + data"派
- [[jupyter]] —— 思想前辈：reactive notebook，但跑在 server，Framework 把它"静态化"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
