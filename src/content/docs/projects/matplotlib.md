---
title: matplotlib — Python 绘图基石
来源: 'https://github.com/matplotlib/matplotlib'
日期: 2026-05-31
分类: projects / 数据可视化
难度: 入门到中级
---

## 是什么

matplotlib 是 John D. Hunter 2003 年发起、现由 NumFOCUS 托管的 Python 绘图库。日常类比：像一台传统照相机——你转光圈、调焦距、按快门，每一步都要手动；得到的是一张静态图片，可以印、可以贴、可以归档，但拍完之后照片本身不能再交互。matplotlib 把这种"命令式 + 静态产物"做到了极致，并因此成为 Python 数据科学几乎所有论文图、报告图、训练曲线的最终承载层。

最小例子：

```python
import matplotlib.pyplot as plt

fig, ax = plt.subplots()
ax.plot([1, 2, 3], [4, 1, 7])
ax.set_xlabel("x")
ax.set_ylabel("y")
fig.savefig("out.png", dpi=150)
```

四行做了四件事：

- `plt.subplots()`：新建一张 Figure（画布）和一个 Axes（坐标系）
- `ax.plot(...)`：在这个 Axes 上画折线，返回 `Line2D` 对象
- `ax.set_xlabel / set_ylabel`：往 Axes 上挂 Text Artist
- `fig.savefig`：调当前 backend 的 Renderer 把 figure 渲染成 PNG

整段没用 `plt.plot()`——这是脚本/库代码的推荐写法（OO API），下面会展开为什么。

## 为什么重要

不理解 matplotlib，下面这些事都没法解释：

- 为什么 [[pandas]] / [[scikit-learn]] / Seaborn / [[plotnine]] 都把"画图"环节最后绕回 matplotlib——它是 PyData 的事实图层
- 为什么 Jupyter 里写 `%matplotlib inline` 后图能内嵌——这条 magic 切的是 IPython 的 inline backend，本质替换了 FigureCanvas
- 为什么 headless 服务器（CI、训练机）也能出图——默认 Agg backend 是纯软件光栅化，不需要 GUI
- 为什么期刊投稿首选 matplotlib + `savefig("fig.pdf")`——它能输出真正的矢量 PDF / EPS，且配合 LaTeX 字体管线
- 为什么交互界（[[altair]] / Plotly / Bokeh）一直没把 matplotlib 替掉——静态出图、像素级精排版、headless 三件事，交互系做不到

## 核心要点

matplotlib 是**三层架构**，理解这一点几乎能解释所有困惑：

1. **Backend 层**：FigureCanvas + Renderer 一对，把抽象图元渲染成具体输出。Agg / Cairo / PDF / PS 走文件，Qt5Agg / TkAgg / WebAgg 走窗口，inline / widget 走 notebook
2. **Artist 层（OO API）**：Figure（画布）/ Axes（坐标系）/ Line2D / Text / Patch / PathCollection 等几十种"图元对象"。所有 `.plot / .scatter / .bar` 都返回 Artist
3. **pyplot 状态机层**：模拟 MATLAB 的 "current figure" 全局状态。`plt.plot(...)` 内部从 `_pylab_helpers.Gcf` 拿当前 Figure，没有就新建——多线程不安全

关键术语对应关系：

- **Figure** = 整张画布（一个窗口 / 一个 PNG 文件）
- **Axes** = 坐标系（一个子图，注意是 *Axes* 不是 *axis* 单数）；一个 Figure 可以含多个 Axes（subplot 网格）
- **axis**（小写单数）= x 轴或 y 轴本身，是 Axes 的子部件

样式系统：

- `rcParams` 是全局样式字典，`matplotlibrc` 文件是它的硬盘版
- `plt.style.use("ggplot")` / `"seaborn-v0_8"` / `"fivethirtyeight"` 实际是批量改 rcParams
- 临时局部样式用 `with plt.style.context("dark_background"): ...`

布局系统两代并存：

- `tight_layout()` 后处理收紧 bbox，碰到共享 colorbar / suptitle 容易算错
- `constrained_layout=True` 是较新的 layoutgrid 求解器（约 2.2 起可用、3.x 推荐），新代码优先用它

## 实践案例

### 案例 1：多子图 + 双 y 轴

```python
import numpy as np
import matplotlib.pyplot as plt

x = np.arange(10)
y1 = np.exp(-x / 5)          # 假装是 loss
y2 = 1 - np.exp(-x / 3)      # 假装是 acc

fig, axes = plt.subplots(1, 2, figsize=(10, 4), constrained_layout=True)

axes[0].plot(x, y1, label="loss")
ax2 = axes[0].twinx()
ax2.plot(x, y2, color="red", label="acc")

axes[1].scatter(x, y1, c=y2, cmap="viridis")
fig.colorbar(axes[1].collections[0], ax=axes[1])
fig.savefig("panels.png")
```

`subplots(1,2)` 返回 ndarray of Axes；`axes.flat` 是迭代器、`axes[0,1]` 是网格索引。`twinx()` 创建共享 x 的第二 y 轴，常用 loss/acc 双指标对比。注意 colorbar 必须显式拿 `collections[0]`（散点 = `PathCollection`）。

### 案例 2：动画（FuncAnimation）

```python
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

fig, ax = plt.subplots()
line, = ax.plot([], [])
ax.set_xlim(0, 2 * np.pi); ax.set_ylim(-1, 1)

def update(frame):
    xs = np.linspace(0, 2 * np.pi, 200)
    line.set_data(xs, np.sin(xs + frame / 10))
    return [line]

ani = FuncAnimation(fig, update, frames=120, interval=50, blit=True)
ani.save("wave.gif", writer="pillow")
```

每帧调 `update` 返回更新后的 Artist 列表，`blit=True` 只重绘改变的像素——这是动画顺滑的关键。GIF 输出可以走 imagemagick 或 pillow（pillow 装 matplotlib 时已经在）。

### 案例 3：脱离 pyplot 的脚本式用法

```python
from matplotlib.figure import Figure
from matplotlib.backends.backend_agg import FigureCanvasAgg

fig = Figure(figsize=(6, 4))
canvas = FigureCanvasAgg(fig)
ax = fig.add_subplot(111)
ax.plot([1, 2, 3])
canvas.print_png("plot.png")
```

完全不 import `pyplot`、零全局状态、可放进多线程。Web 框架（Flask / FastAPI）后端绘图必须这么写——pyplot 的 GCF 全局表在多请求下会串。

## 踩过的坑

1. **plt.show() 之后再 savefig 拿到空白**：show 关闭了 figure。脚本里要先 `savefig` 再 `show`；或开 `plt.ioff()` 关交互。

2. **bbox_inches="tight" 改了 figure 实际尺寸**：投期刊用 `figsize=(3.5, 2.5)` 精确卡双栏，bbox_inches="tight" 会自动裁白边导致最终 PDF 尺寸≠ figsize。要么不用 tight、要么先 `tight_layout()` 再 savefig 不带 bbox 参数。

3. **中文字体方块**：matplotlib 默认字体不含 CJK。`rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "PingFang SC"]`，再加 `rcParams["axes.unicode_minus"] = False` 修负号。

4. **Figure 不 close 会内存泄漏**：循环里画 100 张图不显式 `plt.close(fig)` 或 `plt.close("all")`，进程内存只升不降。

5. **cmap "jet" 是感知不均匀的**：从 1990s 沿用至今但红绿黄过渡误导视觉差异。改用 `viridis` / `plasma` / `cividis`（Nathaniel Smith 2015 设计，感知均匀，色盲友好）。

6. **imshow 的 origin 默认是 "upper"**：图像左上是原点，和 numpy 数组下标一致，但和数学 (x, y) 坐标系上下翻转。画热力图记得 `origin="lower"`。

## 适用 vs 不适用场景

**适用**：

- 期刊 Figure 1 级精排版（PDF / EPS 矢量、LaTeX 字体、复合 panel）
- Headless 服务器批量出图（CI、训练曲线、定时报告）
- 需要像素级控制的科研图（自定义 marker / 自定义坐标变换 / 嵌入数学公式）
- pandas / scikit-learn / Seaborn 等周边输出图的最终承载层

**不适用**：

- 需要交互（zoom / hover / brush）→ [[altair]] / Plotly / Bokeh
- 百万点级实时渲染 → datashader（先光栅化预聚合再 imshow）
- grammar of graphics 偏好 → [[plotnine]] / [[altair]]
- Web 前端嵌入 → [[vega-lite]] / Plotly，不要 savefig PNG 拼到页面里

## 学到什么

1. **状态机 vs OO 是 API 风格的根本分叉**：pyplot 的全局 GCF 表让交互/notebook 写得短，但脚本/库/Web 后端必须走 OO API——这个二分在很多老库里都能看到（OpenGL 同款）
2. **后端可插拔的力量**：同一份 Figure 可以渲到 PNG / PDF / Qt 窗口 / Jupyter inline，靠的是 Canvas+Renderer 抽象——这种"前端 IR + 多个 backend"思路后来在 LLVM、PyTorch、Vega 都看得到
3. **20 多年向后兼容的代价**：matplotlib API 偶尔出现 `set_xlabel` 和 `xlabel()` 双写法、`subplot` 与 `subplots` 命名冲突——历史包袱换来的是几乎所有老脚本都还能跑

## 延伸阅读

- 官方 cheatsheets：[matplotlib/cheatsheets](https://github.com/matplotlib/cheatsheets)（4 张 PDF，Beginner / Intermediate / Tips / Mid-level，墙贴必备）
- 教程：[Scientific Visualization: Python & Matplotlib](https://github.com/rougier/scientific-visualization-book)（Nicolas Rougier，开源整本书）
- 设计文档：[matplotlib Architecture](https://www.aosabook.org/en/matplotlib.html)（AOSA 卷 II，作者 John Hunter 亲述三层架构）
- 色图：[Smith & van der Walt 2015 — viridis](https://bids.github.io/colormap/)（为什么 jet 不能用，viridis 怎么算出来的）
- [[altair]] —— 声明式 / 交互向的对照
- [[pandas]] —— DataFrame.plot() 直接调 matplotlib
- [[plotnine]] —— grammar of graphics 在 Python 上的对照实现

## 关联

- [[altair]] —— 同位生态另一条路线，声明式 + Vega-Lite，交互向
- [[plotnine]] —— ggplot2 移植版，分层语法，底层仍是 matplotlib
- [[pandas]] —— `DataFrame.plot()` 返回 Axes，是 matplotlib 的最大下游用户
- [[observable-plot]] —— JS 端的 grammar of graphics，可对照声明式 vs 命令式
- [[vega-lite]] —— Web 端"声明式 + JSON IR"的代表，对位 matplotlib 的"命令式 + Artist 树"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[holoviews]] —— HoloViews — 一份声明 ⇄ 多后端自动绘图
- [[jupyter-notebook]] —— Jupyter Notebook — 经典数据科学笔记本
- [[librosa]] —— librosa — 把声音变成机器学习能吃的数字特征
- [[plotnine]] —— plotnine — Python 复刻 R 的 ggplot2
- [[seaborn]] —— seaborn — matplotlib 之上的一行统计图
- [[zeppelin]] —— Apache Zeppelin — JVM 多语言笔记本
