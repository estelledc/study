---
title: Jupyter Notebook — 经典数据科学笔记本
来源: https://github.com/jupyter/notebook
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 是什么

Jupyter Notebook 是 Project Jupyter 旗下的**交互式计算笔记本**——在浏览器里把代码、文字、公式、图表、表格揉进同一份 `.ipynb` 文档，边写边跑、边解释边出图。2001 年从 IPython 的终端交互壳起步，2014 年独立成 Jupyter（Ju + Py + R + Julia…），2015 年 Notebook 成为数据科学课堂和 Kaggle 的默认工作台；2022 年 JupyterLab 成为官方主推界面后，经典 Notebook 进入维护模式，但全球数百万份教程、论文复现包、课程作业仍以此格式流通。

日常类比：

> 传统写 Python 像**写 Word 文档只能打字、不能插图**——你另开一个终端跑脚本，再把输出截图贴回报告里，代码和结论永远对不上版本。
> Jupyter Notebook 像一本**带可执行按钮的实验日志本**：每一页（cell）既能写说明文字，也能嵌一段代码；点一下「运行」，内核当场算完，结果（数字、表格、图）直接印在格子下面。改一行参数再跑，图立刻更新——不用离开这一页。

最小工作流长这样：

```bash
pip install notebook
jupyter notebook          # 浏览器打开 http://localhost:8888
# 新建 → Python 3 (ipykernel) → 在 cell 里写代码 → Shift+Enter 运行
```

## 为什么重要

不理解 Jupyter Notebook，下面这些事都没法解释：

- 为什么 Kaggle 竞赛、Coursera 机器学习课、大学统计课**默认发 `.ipynb`** 而不是 `.py`——它把「叙述 + 可复现计算」锁在同一份 JSON 文件里
- 为什么 [[pandas]] / [[matplotlib]] / [[scikit-learn]] 生态的教程几乎全是 Notebook 形态——`Shift+Enter` 逐格执行，读者可以跟着改参数、看中间变量
- 为什么 [[streamlit]] / [[gradio]] 常被说成「把 Notebook 变成可分享 Web 应用」——Notebook 负责探索，产品化再换框架
- 为什么 GitHub 能直接渲染 `.ipynb` 预览——nbformat 是开放 JSON 规范，diff 虽丑但可版本管理
- 为什么 2024 年后很多人转向 JupyterLab / VS Code Notebook / [[marimo]]——经典 Notebook UI 老旧，但**格式与内核协议**仍是事实标准

## 核心概念

Jupyter 把交互计算拆成三层，记牢就不迷路：

### 1. Notebook 文档（`.ipynb`）

一份自包含的 JSON 文件，记录**所有 cell 的源码 + 已产生的输出**（文本、图片 base64、HTML 等）。线性排列的 cell 是基本单位，三种类型：

| 类型 | 作用 | 快捷键（命令模式） |
|------|------|-------------------|
| **Code** | 可执行代码，输出显示在下方 | `Y` |
| **Markdown** | 标题、说明、LaTeX 公式（`$E=mc^2$`） | `M` |
| **Raw** | 导出其他格式时原样保留，Notebook 内不渲染 | — |

Cell 有**两种 UI 模式**（官方文档强调）：

- **命令模式**（灰框）：整格被选中，键盘管导航/删格/改类型；按 `Enter` 进入编辑
- **编辑模式**（绿框）：光标在格内打字；按 `Esc` 回到命令模式

常用快捷键：`Shift+Enter` 运行当前格并跳到下一格；`A` / `B` 在上方/下方插入格；`D,D` 删除格；`Z` 撤销删除。

### 2. Kernel（内核）

在**独立进程**里真正执行代码的引擎。每个打开的 Notebook 绑定一个 kernel；默认是 **IPython / Python 3 (ipykernel)**，也可换 R（IRkernel）、Julia（IJulia）等——前端只发 JSON 消息，kernel 算完把 stdout、异常、富媒体对象推回来。

关键行为：

- **变量跨 cell 共享**：先跑 `x = 1`，后面任意格都能用 `x`——执行顺序由你「跑过哪些格」决定，不是文件从上到下的静态顺序
- **可中断 / 重启**：工具栏 ⟳ 重启内核 = 清空内存状态；改 import 或全局配置后常需重启
- **输出异步流式**：长循环的 `print` 会逐条蹦出来，不必等整格结束

### 3. Notebook Server（Jupyter Server）

浏览器和 kernel **不直接对话**，由 Server 中转：保存文件、鉴权、启动 kernel、转发 ZeroMQ/WebSocket 消息。你本地 `jupyter notebook` 起的就是这套；JupyterHub 则在多用户集群上复用同一架构。

与 **JupyterLab** 的关系：Lab 是「IDE 壳」（多标签、文件树、终端、扩展市场），经典 Notebook 是「单文档专注模式」。二者共享同一 `.ipynb` 格式和 kernel 协议；2022 年起新功能优先进 Lab，但 `jupyter notebook` 包仍维护以兼容旧工作流。

### 4. 富媒体输出（Rich Display）

IPython 的 **display 协议**让最后一行表达式自动渲染：Pandas `DataFrame` 出 HTML 表、[[matplotlib]] 出内嵌图、[[plotly-js]] 出可交互图。这是 Notebook 比纯终端 REPL 更适合**探索性分析**的核心原因。

## 实践案例

### 案例 1：从零完成一次小数据分析

下面是一段典型的「说明 → 代码 → 结果」节奏，模拟你在 Notebook 里会写的三格（Markdown 与 Code 混排）：

**Markdown cell：**

```markdown
## 销售数据速览
加载 CSV，看每月总额趋势。
```

**Code cell 1 — 加载与预览：**

```python
import pandas as pd
import matplotlib.pyplot as plt

# 假设同目录有 sales.csv：date, amount 两列
df = pd.read_csv("sales.csv", parse_dates=["date"])
df.head()
```

**Code cell 2 — 聚合与作图：**

```python
monthly = df.set_index("date").resample("ME")["amount"].sum()

fig, ax = plt.subplots(figsize=(8, 4))
monthly.plot(kind="bar", ax=ax, color="steelblue")
ax.set_title("Monthly Sales")
ax.set_ylabel("Amount")
plt.tight_layout()
plt.show()   # Notebook 内直接显示图，无需 savefig
```

逐格 `Shift+Enter` 的好处：中间 `df.head()` 若发现日期解析错了，立刻改 `parse_dates` 重跑第一格，第二格跟着修正——**调试粒度是一格，不是整份脚本**。

### 案例 2：用 `%` 魔法命令做 Notebook 特有的事

IPython 在 Notebook 里提供**行魔法**（`%`）和**单元魔法**（`%%`），这是 `.py` 文件里没有的交互利器：

```python
# 行魔法：计时这一格跑了多久
%timeit sum(range(10_000))
```

```python
%%time
# 单元魔法：统计整个 cell
total = 0
for i in range(1_000_000):
    total += i
print(total)
```

```python
# 查看当前内核里有哪些变量、占多少内存
%whos
```

```python
# 把 matplotlib 图嵌在 notebook 输出区（现代环境常默认开启）
%matplotlib inline
```

常用还有：`%pwd` / `%cd` 改工作目录、`%pip install pkg` 在当前 kernel 环境装包、`%%bash` 跑一小段 shell。魔法命令是 **kernel 侧能力**，换 Python kernel 才有；R kernel 对应的是 `%%R` 等不同前缀。

### 案例 3：导出与分享

Notebook 不仅是开发工具，也是**交付物**：

```bash
# 命令行导出为 HTML（适合邮件 / 内网分享）
jupyter nbconvert --to html analysis.ipynb

# 导出为 PDF（需本机 LaTeX）
jupyter nbconvert --to pdf report.ipynb

# 只执行不打开 UI（CI 里检查 notebook 能否跑通）
jupyter execute analysis.ipynb --output executed.ipynb
```

配合 `nbformat` 库，还可以用 Python 批量读写 cell，做自动化报告生成——许多公司的周报流水线就是「模板 `.ipynb` + 填参 + nbconvert」。

## 安装与上手

**推荐路径（2026）：**

```bash
# 最小安装：经典 Notebook 界面
pip install notebook ipykernel

# 或装 JupyterLab（功能更全，同样能打开 .ipynb）
pip install jupyterlab

# 注册当前虚拟环境为可选 kernel（多项目必备）
python -m ipykernel install --user --name=myproject --display-name="Python (myproject)"
```

启动后浏览器访问本地 URL（带 token）；**勿把未设密码的 Server 暴露到公网**——任意访问者都能在 kernel 里执行系统级代码。

VS Code / Cursor 用户可直接打开 `.ipynb`，右下角选 kernel，体验与浏览器类似，且 Git diff 插件更成熟。

## 常见坑与最佳实践

1. **执行顺序陷阱**：你改了上面某格却没重跑，下面格仍用着旧变量——出诡异 bug 时先 `Kernel → Restart & Run All` 从头跑一遍。
2. **大输出**：无意 `print` 百万行或巨大 DataFrame 会让浏览器卡死；用 `df.head()`、`df.info()`，或对输出区双击折叠。
3. **不要把 `.ipynb` 当生产部署单元**：探索在 Notebook，上线抽成模块（`.py`）+ 测试；Notebook 适合**叙述性复现**，不适合长期 cron 任务（除非 `papermill` / `nbconvert` 编排）。
4. **版本管理**：JSON diff 噪声大；团队可用 [nbstripout](https://github.com/kynan/nbstripout) 提交前清空输出，或约定只审 Markdown + 抽离的 `.py`。
5. **依赖文档化**：在第一个 Code cell 写清 `%pip install ...` 或附 `requirements.txt`，否则别人打开全是 `ModuleNotFoundError`。
6. **秘密信息**：切勿把 API Key 写进已提交的 `.ipynb`；用环境变量 `os.environ["KEY"]`。

## 与相近工具怎么选

| 场景 | 更合适的选择 |
|------|----------------|
| 课堂演示、论文复现、EDA 叙事 | **Jupyter Notebook / Lab** |
| 多文件项目、Git、重构 | `.py` + IDE，或 JupyterLab |
| 给非程序员点参数看结果 | [[streamlit]]、[[gradio]] |
| 纯 reactive、少「状态错乱」 | [[marimo]]（重跑依赖图） |
| 出版级静态图表网站 | [[observable-framework]]、Quarto |

经典 Notebook 的定位从未变过：**让人类可读的叙述与可执行的计算住在同一页**。掌握 cell、kernel、执行顺序三件事，你就拿到了数据科学领域十年的通用入场券。

## 延伸阅读

- 官方文档：[What is the Jupyter Notebook?](https://jupyter-notebook.readthedocs.io/en/stable/examples/Notebook/What%20is%20the%20Jupyter%20Notebook.html)
- 架构总览：[Jupyter architecture](https://docs.jupyter.org/en/stable/projects/architecture/content-architecture.html)
- 格式规范：[nbformat](https://nbformat.readthedocs.io/)
- 本库相关：[[pandas]]、[[matplotlib]]、[[duckdb]]、[[streamlit]]、[[wandb]]
