---
title: marimo — 反应式 Python 笔记本
来源: 'https://github.com/marimo-team/marimo'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

marimo 是一个反应式 Python 笔记本：你改一个 cell，依赖它的 cell 会自动重新运行，整本笔记始终像一份可运行的 `.py` 程序。

日常类比：Jupyter 像一本可以随便翻页补写的实验本，容易忘记哪页先算；marimo 更像电子表格，改了 A1，所有引用 A1 的格子会跟着更新。

最小例子不是新语法，而是把笔记本当 Python 文件打开：

```bash
pip install marimo
marimo edit analysis.py
```

在 `analysis.py` 里，你仍然写普通 Python；不同的是，marimo 会静态分析每个 cell 读了什么变量、定义了什么变量，并据此维护一张依赖图。

## 为什么重要

不理解 marimo，下面这些痛点会一直被当成 Notebook 的宿命：

- 传统 Notebook 里先跑第 10 个 cell、再改第 3 个 cell，输出可能看起来正确但状态已经不一致
- `.ipynb` 的 JSON diff 很难 review，团队协作时看不清到底改了哪段代码
- 想把分析结果给别人点，却又不想暴露整套编辑界面，普通 Notebook 需要额外部署层
- SQL、滑块、图表、脚本执行、Web app 分享分散在多个工具里，学习成本被切碎

marimo 的核心价值是把"探索性写代码"和"可复现软件工件"拉近：同一份 `.py` 可以编辑、运行、部署、进 Git。

## 核心要点

1. **DAG 自动重算**：marimo 把 cell 当成积木，按变量引用连成有向无环图。类比：改水源阀门时，只需要刷新下游管道，不必把整栋楼都拆开。

2. **纯 Python 文件**：笔记本存成 `.py`，可以被 Git diff、被 `python notebook.py` 执行，也可以从别的代码 import。类比：不再把菜谱锁在特制盒子里，而是写在普通纸上。

3. **交互元素进入数据流**：`mo.ui.slider`、SQL cell、dataframe viewer 都不是孤立控件；它们的值会触发依赖 cell 更新。类比：旋钮不是贴在机器外壳上，而是接进电路里。

这三点让 marimo 和普通 UI 框架不一样：它首先是 Notebook，其次才顺手变成 app。

## 实践案例

### 案例 1：用滑块驱动一个反应式计算

```python
import marimo as mo

x = mo.ui.slider(1, 10, value=3)
mo.md(f"选择一个数：{x}")
```

另一个 cell 写：

```python
square = x.value ** 2
mo.md(f"平方结果：{square}")
```

逐部分解释：

- `mo.ui.slider(1, 10)` 创建一个 1 到 10 的滑块，它有自己的 `.value`
- `x` 是全局变量，所以 marimo 知道哪些 cell 读取了它
- 用户拖动滑块时，读取 `x` 的 cell 会自动重跑，不需要手写 callback

这个案例来自官方交互元素文档的典型用法，适合做教学参数、模型阈值、图表筛选条件。

### 案例 2：用 SQL 查询 Python dataframe

```bash
pip install "marimo[sql]"
marimo tutorial sql
```

SQL cell 背后的 Python 形态大致是：

```python
rows = mo.ui.slider(1, 100, value=10)
output_df = mo.sql(f"SELECT * FROM sales LIMIT {rows.value}")
```

逐部分解释：

- `"marimo[sql]"` 会安装 SQL cell 需要的依赖，官方示例以 DuckDB 为常见执行引擎
- `mo.sql(...)` 返回 dataframe，后续 Python cell 可以继续处理
- SQL 字符串能引用 Python 值，例如 `rows.value`，所以查询也进入反应式数据流

这个案例适合数据分析：先用 Python 读文件，再用 SQL 做过滤聚合，最后回到 Python 画图。

### 案例 3：同一份笔记本编辑、运行、部署

```bash
marimo edit report.py
marimo run report.py
python report.py
marimo convert old.ipynb -o report.py
```

逐部分解释：

- `marimo edit` 打开编辑器，适合探索和讲解
- `marimo run` 把输出排成 Web app，默认隐藏不可编辑的代码
- `python report.py` 把笔记本当脚本跑，适合定时任务或 CI
- `marimo convert` 能把已有 Jupyter Notebook 或脚本迁移成 marimo 文件

这个案例说明 marimo 的"一份文件多种入口"：写作、分享、自动化不必各维护一套代码。

## 踩过的坑

1. **同名全局变量不能跨 cell 重复定义**：原因是两个 cell 都定义 `df` 时，第三个 cell 读 `df` 会让执行顺序变得含糊。

2. **对象原地修改不会自动触发依赖更新**：原因是 marimo 靠静态分析变量定义和引用建图，Python 的 `list.append()`、`df["x"] = ...` 这类 mutation 很难可靠追踪。

3. **循环依赖会被拦住**：原因是 A cell 读 B、B cell 又读 A 时，DAG 不再是无环图，既无法排序也可能无限重跑。

4. **重计算昂贵时要调 runtime 策略**：原因是自动重跑很方便，但大模型推理、数据库写入、慢查询不应该每次小改都立刻执行。

## 适用 vs 不适用场景

**适用**：

- 数据分析、机器学习实验、教学演示，需要边改参数边看结果
- 团队希望 Notebook 能进 Git review，不想审一大段 JSON diff
- 想把探索结果变成只读 Web app、脚本或轻量内部工具
- 需要把 Python、SQL、交互控件、图表输出放在同一条可复现数据流里

**不适用**：

- 完整生产后端、权限系统、复杂多人协作流程，仍然该用专门 Web 框架
- 大量副作用操作，例如频繁写数据库、发请求、改远端资源，自动重跑需要格外谨慎
- 依赖传统 Jupyter 扩展生态的课程或环境，迁移前要确认插件替代品
- 对 Notebook 只做一次性草稿、不打算分享和复现时，Jupyter 可能更顺手

## 历史小故事（可跳过）

- **2022 年左右**：Akshay Agrawal 开始建设 marimo，希望把 Notebook 从"可变草稿"改造成可复现程序。
- **早期动机**：他有机器学习研究和 TensorFlow 工程背景，痛点集中在实验状态、协作 review、分享方式。
- **2024 年**：marimo 通过 Pyodide 支持在浏览器里运行，让"无服务器分享 Python Notebook"更接近现实。
- **2026 年**：GitHub 仓库约 21k stars，项目由 marimo 团队和社区持续维护，文档覆盖 SQL、AI、部署、测试等完整工作流。

## 学到什么

1. **Notebook 最大的坑不是界面，而是状态**：只要状态和代码能分叉，结果就可能看起来对、其实不可复现。
2. **反应式不是魔法，是依赖图**：marimo 通过变量定义和引用建 DAG，再按图决定哪些 cell 需要重跑。
3. **文件格式会改变协作方式**：`.py` 文件让 diff、review、脚本执行、import 这些软件工程习惯自然回来。
4. **交互和复现可以同时存在**：滑块、SQL、图表不必牺牲确定性，只要它们也被纳入数据流。

## 延伸阅读

- 官方仓库：[marimo-team/marimo](https://github.com/marimo-team/marimo)
- 官方文档：[marimo docs](https://docs.marimo.io/)
- 快速开始：[Quickstart](https://docs.marimo.io/getting_started/quickstart/)
- 反应式执行：[Running cells](https://docs.marimo.io/guides/reactivity/)
- SQL 示例：[examples/sql](https://github.com/marimo-team/marimo/tree/main/examples/sql)
- [[jupyter-notebook]] —— marimo 主要解决的传统 Notebook 状态问题从这里来

## 关联

- [[jupyter-notebook]] —— marimo 继承 Notebook 交互体验，但用反应式执行消除隐藏状态
- [[jupyterlab]] —— 两者都是 Notebook 工作台，JupyterLab 偏 IDE，marimo 偏可复现 `.py`
- [[streamlit]] —— 都能把 Python 变成 app，marimo 更强调 Notebook 和依赖图
- [[duckdb]] —— marimo SQL cell 常见执行基础，适合本地分析型查询
- [[pandas]] —— marimo 常被用来探索 dataframe，并能把结果继续接到 SQL 或图表
- [[polars]] —— 大数据表分析时常和 marimo 的 SQL / dataframe viewer 搭配
- [[observable-framework]] —— 同属反应式数据叙事思路，只是生态从 Python 换成 Web

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
