---
title: Jupyter Notebook — 经典数据科学笔记本
来源: 'https://github.com/jupyter/notebook'
日期: 2026-07-08
分类: projects / editors
难度: 初级
---

## 是什么

Jupyter Notebook 是一个**在浏览器里写代码、看输出、补解释文字**的交互式笔记本。日常类比：像一本实验记录本，但每页旁边都接着一台会立刻算结果的计算器。

最小体验：

```bash
pip install notebook
jupyter notebook
```

浏览器打开后，你可以新建一个 notebook，在第一个 code cell 里写：

```python
a = 10
print(a)
```

按 `Shift-Enter`，代码会被送到后台 kernel 执行，输出 `10` 会贴在这一格下面。你再在下一格写 Markdown，总结“这一步为什么要这么算”，一份 `.ipynb` 文件就同时保存了代码、输出和解释。

所以 Notebook 不是普通文本编辑器，也不是单纯 Python 终端。它更像“可运行的学习笔记”：前半句给人看，后半句给机器跑。

## 为什么重要

不理解 Jupyter Notebook，下面这些事都没法解释：

- 为什么数据科学教程常常不是 `.py` 文件，而是一份一格一格展开的 `.ipynb`
- 为什么同一段分析可以先探索、再画图、再写结论，中间不用来回切换编辑器和终端
- 为什么 Notebook v7 升级会影响旧扩展——前端已经转向 JupyterLab 组件
- 为什么很多工具围着它长出来：[[voila]] 负责发布，[[streamlit]] 负责应用化，[[holoviews]] 负责交互式图表

## 核心要点

Notebook 的设计可以拆成 **三层**：

1. **cell 是最小工作台**：每个格子可以是代码、Markdown 或 raw 文本。类比：做实验时把“步骤 1、步骤 2、观察结果”分开放，哪里错了就只改那一段。

2. **kernel 是真正干活的人**：浏览器界面只是前台，代码会发给 kernel 进程执行。类比：你在柜台写订单，厨房才真的做菜；关掉菜单页不等于厨房停火。

3. **`.ipynb` 是完整记录**：文件内部是 JSON，保存 cell 输入、输出、元数据和显示结果。类比：实验报告不只写“我做了什么”，还把当时拍下来的图、表和计算结果一起夹进去。

三层合起来，Notebook 才能做到“边想、边跑、边解释”。这也是它和普通 REPL、普通 Markdown、普通 IDE 最大的差异。

## 实践案例

### 案例 1：像草稿纸一样逐格运行代码

官方示例里最小的一组 code cell 是：

```python
a = 10
```

```python
print(a)
```

**逐部分解释**：

- 第一格把 `a` 放进 kernel 的内存里，第二格能读到它，因为两格连着同一个 kernel
- `print(a)` 的输出不会跑到终端，而是贴在对应 cell 下面，方便回头看
- 如果这一格卡住，可以中断 kernel；如果状态乱了，可以重启 kernel，从头跑一遍

### 案例 2：把解释文字、公式和代码放在同一份文件

官方 Markdown 示例展示了标题、代码块、表格和 LaTeX。你可以写一个 Markdown cell：

````markdown
# 实验记录

先计算平方，再观察增长速度。

```python
def f(x):
    return x**2
```

欧拉恒等式：$e^{i\pi} + 1 = 0$

| 输入 | 输出 |
|------|------|
| 3    | 9    |
````

再接一个真正执行的 code cell：

```python
def f(x):
    return x**2

f(3)
```

**逐部分解释**：

- Markdown cell 里的代码块只是展示，不会执行，适合写“这段代码长这样”
- code cell 才会发给 kernel，适合跑真实计算
- 公式通过 MathJax 渲染，读者看到的是排版后的数学符号
- 表格和标题让 notebook 像一篇短报告，不只是零散命令历史

### 案例 3：同一个 kernel 接多个前端

官方 Qt Console 示例说明：Notebook、终端 console、Qt Console 都可以只是前端，背后连同一个 kernel。

在 notebook 里先看连接信息：

```python
%connect_info
```

命令行里可以接到同一个 kernel：

```bash
jupyter qtconsole --existing 87f7d2c0
```

**逐部分解释**：

- `%connect_info` 会打印当前 kernel 的连接信息，里面有一串 kernel ID
- `--existing` 表示不要新开厨房，而是接到已经在跑的那一个
- Qt Console 里能读到 `a = 10`，因为变量存在 kernel，不存在浏览器页面本身
- 这个模型解释了为什么“前端关掉了，kernel 还在”，也解释了多人/多窗口调试时状态容易混乱

## 踩过的坑

1. **关掉浏览器标签不等于停止计算**：kernel 仍可能在后台跑，占 CPU 和内存，所以长任务要去 dashboard 或 Running 页面关掉。

2. **Notebook v6 扩展不能直接搬到 v7**：v7 基于 JupyterLab 组件和 Jupyter Server，旧的 Classic Notebook 前端扩展经常需要重写。

3. **server 环境和 kernel 环境不是一回事**：Notebook 能打开，但 cell 里 `import pandas` 失败，常见原因是 kernel 指向另一个 Python 环境。

4. **不信任的 notebook 不该直接执行**：`.ipynb` 可能带 HTML / JavaScript 输出；要看清来源，再决定是否 `jupyter trust mynotebook.ipynb`。

## 适用 vs 不适用场景

**适用**：

- 初学 Python / 数据分析，需要一步一步看到每个中间结果
- 数据清洗、画图、模型探索，结论还没稳定，代码也还在试
- 教学材料、实验报告、可复现实验记录，希望读者按格子跟跑
- 小团队分享分析过程，对“为什么这么算”比“最终产物像软件”更重视

**不适用**：

- 大型长期工程，模块边界、测试、CI、代码审查比交互探索更重要
- 高并发 Web 应用，Notebook 的 kernel 状态模型太重
- 需要严格可重复的批处理流水线，最好拆成脚本、任务调度和版本化数据
- 多人同时编辑复杂项目，优先考虑 JupyterLab、VS Code 或专门协作文档

## 历史小故事（可跳过）

- **IPython 时代**：Notebook 最早从 IPython 的交互式体验长出来，核心目标是让计算过程能被记录和展示。
- **2015 年**：Jupyter 从 IPython 做“大拆分”，语言无关的 Notebook 留在 Jupyter，Python kernel 继续由 IPython 维护。
- **Classic Notebook v6**：经典界面长期稳定，很多教学和科研材料都围绕它形成习惯。
- **Notebook v7**：新版本转向 JupyterLab 组件和 Jupyter Server，保留“一个文档一个标签页”的文档中心体验。
- **社区规模**：`jupyter/notebook` 是万级 stars 项目，真正的影响力不只在仓库数字，而在 `.ipynb` 已经成了数据科学的默认交换格式之一。

## 学到什么

1. **Notebook 的本质是“过程记录”**：它保存的不只是最终答案，而是从想法到输出的路径。
2. **kernel 状态是双刃剑**：变量能跨 cell 复用很方便，但乱序执行也会制造“我刚才明明能跑”的错觉。
3. **`.ipynb` 把文档和程序绑在一起**：这让教学、探索、展示很顺；也让代码审查和长期维护更难。
4. **v7 的方向是复用 JupyterLab 生态**：Notebook 继续轻量，但底层越来越和现代 Jupyter 前端共享能力。

## 延伸阅读

- 官方仓库：[jupyter/notebook](https://github.com/jupyter/notebook)
- 用户文档：[The Jupyter Notebook](https://raw.githubusercontent.com/jupyter/notebook/main/docs/source/notebook.md)
- v7 新特性：[Notebook 7 features](https://raw.githubusercontent.com/jupyter/notebook/main/docs/source/notebook_7_features.md)
- 故障排查：[Troubleshooting](https://raw.githubusercontent.com/jupyter/notebook/main/docs/source/troubleshooting.md)
- 官方视频入口：[Project Jupyter YouTube](https://www.youtube.com/@ProjectJupyter)
- [[voila]] —— 把 Notebook 变成只显示输出的网页应用
- [[streamlit]] —— 用 `.py` 脚本把数据探索改造成应用

## 关联

- [[voila]] —— 直接消费 `.ipynb`，隐藏代码后发布成网页
- [[streamlit]] —— 同样服务数据应用，但选择脚本重跑模型
- [[holoviews]] —— 常在 Notebook 里做交互式可视化
- [[pandas]] —— Notebook 里最常见的数据表处理搭档
- [[matplotlib]] —— 官方文档也把 inline 图形作为核心能力之一
- [[codemirror]] —— Notebook v7 受益于 JupyterLab 采用的现代编辑器能力
- [[observable-framework]] —— 代表另一种“文档 + 代码 + 输出”的路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
