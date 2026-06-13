---
title: marimo — 反应式 Python 笔记本
来源: https://github.com/marimo-team/marimo
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

## 是什么

**marimo** 是开源的**反应式（reactive）Python 笔记本**：你改一行代码、拖一下滑块，所有依赖它的 cell 会自动重跑（或标记为 stale），代码与输出始终同步。笔记本存成纯 `.py` 文件——Git 友好、可当脚本执行、可一键部署成 Web 应用；内置 SQL cell、交互控件、包管理与 AI 辅助，被社区形容为「下一代 Jupyter + Streamlit 的合体」。

日常类比：

> 传统 [[jupyter-notebook]] 像**手工记账本**：你在第 3 页写了 `x = 10`，第 7 页用了 `x`，后来把第 3 页改成 `x = 99` 却忘了重跑第 7 页——报表里仍显示旧结果，这就是著名的「隐藏状态（hidden state）」。
> marimo 像**带公式的 Excel 表**：改 A1，所有引用 A1 的格子自动重算；删掉定义某变量的 cell，那个变量从内存里消失，引用它的 cell 也会跟着更新或变 stale。你专注写逻辑，**依赖关系由引擎维护**。

最小上手：

```bash
pip install "marimo[recommended]"   # 或 uv add "marimo[recommended]"
marimo tutorial intro               # 浏览器打开入门教程
marimo edit my_analysis.py          # 创建/编辑笔记本（纯 Python 文件）
```

## 为什么重要

不理解 marimo，很难解释这几年 Notebook 工具链的几条主线：

- 为什么有人抱怨 Jupyter「跑过哪格、顺序如何」决定变量状态，而 marimo 用**静态分析 + DAG** 定执行顺序
- 为什么 [[streamlit]] 要写 `st.slider` + callback，而 marimo 的 `mo.ui.slider` **绑全局变量即 reactive**，无需回调
- 为什么 `.ipynb` 的 JSON diff 噪声大，而 marimo 的 `.py` 可以直接 `pytest`、CI 里 `python notebook.py`
- 为什么同一文件既能 `marimo edit` 探索，又能 `marimo run` 给业务方当只读 App
- 为什么 [[duckdb]]、Polars、Pandas 在 marimo 里常和 **SQL cell** 混排——查完 SQL 结果仍是 Python DataFrame，继续下游分析

## 核心概念

marimo 把交互计算拆成几层，记牢就不迷路：

### 1. Cell（单元格）与纯 Python 文件

每个 marimo 笔记本是一个 `.py` 文件，由多个 **cell** 组成。cell 就是普通 Python 代码块，**没有** `%` 魔法、没有特殊 reactive 语法——marimo 在后台**静态分析**每个 cell 定义/读取哪些**全局变量名**，据此建 **有向无环图（DAG）**。

| 特性 | Jupyter Notebook | marimo |
|------|------------------|--------|
| 存储格式 | `.ipynb`（JSON） | `.py`（纯 Python） |
| 执行顺序 | 通常按你「跑过」的顺序 | 由变量依赖决定，与页面排版无关 |
| 隐藏状态 | 常见（改上格不重跑下格） | 设计上消除 |
| 全局变量 | 任意 cell 可覆盖 | **每个全局名只能由一个 cell 定义** |
| 删 cell | 变量可能仍留在 kernel | 变量从内存删除，依赖 cell 更新 |

### 2. Reactive execution（反应式执行）

**运行一个 cell → marimo 自动运行所有读取该 cell 所定义变量的下游 cell**（或在 expensive 模式下标记为 stale）。页面上的先后顺序不重要：你可以把 helper 函数写在文件底部，只要依赖图正确就会在对的时刻执行。

重要约束（官方 reactivity 指南强调）：

- marimo 跟踪的是**变量名**的定义与引用，**不**跟踪运行时对象突变（in-place mutation）
- 若要对 DataFrame 做 `df["col"] = ...` 这类原地修改，**应在定义 `df` 的同一个 cell 里完成**，或拆成「定义 → 变换 → 新变量名」

可视化依赖：编辑器里可打开 dataflow 视图；CLI 有 `marimo tutorial dataflow`。

### 3. Output（输出）

每个 cell 的**最后一个表达式**会渲染为输出（类似 Jupyter 的 rich display）。可用 `import marimo as mo` 生成 Markdown、图表、布局：

- `mo.md("...")` / `mo.md(f"Hello {name}")` — 动态 Markdown
- `mo.hstack` / `mo.vstack` / `mo.ui.tabs` — 布局
- 任意 Python 对象（Pandas DataFrame、Altair 图等）

### 4. Interactive UI（`marimo.ui`）

在 `mo.ui` 里创建 slider、dropdown、table、file upload 等，**必须赋给全局变量**。用户在浏览器里交互 → 新值回传 Python → **所有引用该元素的 cell 自动重跑**，通过 `.value` 读取。

无 callback 模式：这是 marimo 与 Streamlit 心智模型最大的不同之一。

### 5. SQL cells

内置 SQL：对 DataFrame、DuckDB、Postgres、CSV 等写查询，引擎（默认 DuckDB）执行后结果回到 Python。SQL 与 Python cell 同样参与依赖图——适合 EDA 里「SQL 筛一批 → Python 画图」流水线。

### 6. 三种运行形态

| 命令 | 作用 |
|------|------|
| `marimo edit foo.py` | 编辑模式：完整代码 + reactive |
| `marimo run foo.py` | App 模式：隐藏源码，只展示输出与控件 |
| `python foo.py` | 脚本模式：命令行批处理，可传 CLI 参数 |

还可 `marimo convert old.ipynb -o foo.py` 从 Jupyter 迁移；`marimo export` 导出 HTML / IPYNB / Markdown。

### 7. 包管理与 reproducibility

支持 import 时自动装包、PEP 723 风格在文件里声明依赖、隔离 venv sandbox。配合 deterministic 执行顺序，笔记本更接近「可复现实验记录」而非一次性草稿。

## 实践案例

### 案例 1：最小 reactive 笔记本（变量依赖）

下面三个 cell 在 `.py` 文件里由 marimo 的 cell 分隔符组织（编辑器会自动生成；此处用注释表示逻辑）：

```python
# Cell 1 — 定义数据源
import marimo as mo
import pandas as pd

raw = pd.DataFrame({
    "product": ["A", "B", "C", "A", "B"],
    "sales": [120, 85, 40, 150, 90],
})
raw
```

```python
# Cell 2 — 读取 raw，做聚合（依赖 Cell 1）
summary = raw.groupby("product", as_index=False)["sales"].sum()
summary
```

```python
# Cell 3 — 展示 Markdown 摘要（依赖 summary）
total = summary["sales"].sum()
mo.md(f"""
## 销售汇总
共 **{len(summary)}** 个品类，总销售额 **{total:,}** 元。
""")
```

当你把 Cell 1 的某行 `sales` 改掉并重跑，Cell 2、3 **无需手动点**——marimo 沿 DAG 自动刷新。在 Jupyter 里你必须记得「从上往下 Run All」或逐格重跑，否则 Cell 3 可能仍显示旧总额。

### 案例 2：交互控件 + reactive（无 callback）

用 slider 过滤 DataFrame，拖滑块即重算图表数据：

```python
import marimo as mo
import altair as alt
import pandas as pd

df = pd.DataFrame({
    "x": range(100),
    "y": [i * 0.5 + (i % 7) for i in range(100)],
})

threshold = mo.ui.slider(0, 99, value=50, label="最小 x")
threshold
```

```python
# 读取 threshold.value — 用户拖 slider 时本 cell 自动重跑
filtered = df[df["x"] >= threshold.value]
chart = (
    alt.Chart(filtered)
    .mark_circle()
    .encode(x="x:Q", y="y:Q")
    .properties(width=400, height=250, title=f"x ≥ {threshold.value}")
)
chart
```

`threshold` 必须是**全局变量**；若控件只在函数局部变量里，marimo 无法同步 UI 状态。运行时等价于：`marimo edit dashboard.py` 探索，`marimo run dashboard.py` 给同事只看图表和滑块。

### 案例 3：SQL cell 与 Python 混排

安装 `marimo[recommended]` 后，在编辑器插入 SQL cell（或通过 `@mo.sql` 装饰器风格，视版本而定）。概念上：

```python
import marimo as mo
import pandas as pd

orders = pd.read_csv("orders.csv")
```

SQL cell（伪代码示意 — 实际在 UI 选 SQL 类型）：

```sql
SELECT product, SUM(amount) AS revenue
FROM orders
WHERE amount > 100
GROUP BY product
ORDER BY revenue DESC
```

```python
# revenue 为 SQL cell 暴露的 DataFrame 变量名
mo.ui.table(revenue)
```

SQL 结果作为命名变量进入 Python 依赖图，下游绘图 cell 在 SQL 或 `orders` 变化时同样 reactive 更新。

### 案例 4：从 Jupyter 迁移与当脚本跑

```bash
# Jupyter → marimo
marimo convert analysis.ipynb -o analysis.py
marimo edit analysis.py

# 关闭「打开即 autorun」（部分迁移 notebook 不适合启动全跑）
marimo config show    # 找到 marimo.toml
# [runtime] auto_instantiate = false

# CI：当脚本执行
python analysis.py

# 对外分享
marimo run analysis.py --host 0.0.0.0 --port 8080
```

## 安装与工具链

**推荐安装（解锁 SQL、AI、格式化等）：**

```bash
pip install "marimo[recommended]"
# 含 duckdb, altair, polars, sqlglot, ruff, openai 等
```

**常用 CLI：**

```bash
marimo edit              # 笔记本服务器
marimo tutorial --help   # intro / ui / sql / dataflow / layout ...
marimo convert           # ipynb / py:percent → marimo
marimo export            # → html, ipynb, md
```

VS Code / Cursor 可装 **marimo 扩展**，在 IDE 内获得 reactive 执行与 `.py` 笔记本编辑体验。

## 常见坑与最佳实践

1. **全局变量唯一**：两个 cell 不能都 `def config` 或都 `x = 1`——合并到一个 cell 或改名。
2. **避免跨 cell 原地突变**：`df["new_col"] = ...` 放在定义 `df` 的 cell，或产出 `df2 = df.assign(...)` 让依赖图可见。
3. **UI 元素必须全局**：`slider = mo.ui.slider(...)` 写 top-level；动态数量用 `mo.ui.array` / `mo.ui.dictionary`。
4. **迁移 Jupyter 时**：并非所有 notebook 都适合 `auto_instantiate`；大数据集可在 runtime 配置里改为 lazy / stale 模式，见官方 expensive notebooks 指南。
5. **与 Jupyter 共存**：marimo 不是 `.ipynb` 编辑器；需要经典 ipynb 生态（某些课堂插件）仍用 [[jupyterlab]]，探索型 reactive 工作流再切 marimo。
6. **生产部署**：`marimo run` 适合内部小工具；高并发服务仍应抽成 FastAPI 等，笔记本负责原型。

## 与相近工具怎么选

| 场景 | 更合适的选择 |
|------|----------------|
| 课堂、论文复现、存量 `.ipynb` | **Jupyter Notebook / Lab** |
| 快速 dashboard、回调式 UI | [[streamlit]]、[[gradio]] |
| Git-friendly、无隐藏状态、探索+App 一体 | **marimo** |
| 纯脚本、无 UI | 普通 `.py` + IDE |
| 出版级静态站点 | Quarto、[[observable-framework]] |

marimo 的定位：**把 Notebook 从「容易状态错乱的手稿」推进到「有依赖图、可版本管理、可部署的 Python 程序」**。掌握 cell、DAG、全局变量规则三件事，你就拿到了 2020 年代数据探索工具里最重要的一条分支。

## 延伸阅读

- 官方文档：[Key concepts](https://docs.marimo.io/getting_started/key_concepts/)
- 反应式模型：[Reactivity guide](https://docs.marimo.io/guides/reactivity/)
- 交互控件：[Interactivity guide](https://docs.marimo.io/guides/interactivity/)
- GitHub：[marimo-team/marimo](https://github.com/marimo-team/marimo)
- 本库相关：[[jupyter-notebook]]、[[jupyterlab]]、[[duckdb]]、[[pandas]]、[[streamlit]]
