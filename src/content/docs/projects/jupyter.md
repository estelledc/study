---
title: Jupyter 零基础学习笔记
来源: https://github.com/jupyter/notebook
日期: 2026-06-13
分类: 其他
子分类: education-tech
provenance: pipeline-v3
---

# Jupyter 零基础学习笔记

## 什么是 Jupyter？

想象一下你在做数学作业。你有一张纸，左边写计算过程，右边写每一步的答案。你还能画图、贴照片、写文字说明。这张纸可以给别人看，别人一看就明白你是怎么算出来的。

Jupyter Notebook 就是数字版的"这种纸"。它是一个网页应用，让你把代码、运行结果、文字说明全部放在同一个文档里，像做实验记录一样，一步一步地探索数据、写程序、看结果。

它的名字来自它支持的三种语言：Ju（Julia）、Py（Python）、R。但今天它几乎能跑任何编程语言。

## 核心概念

### Notebook（笔记本）

一个 `.ipynb` 文件就是一个笔记本。它不是普通的代码文件，而是一系列"格子"的集合。每个格子叫一个 cell（单元格），你可以往格子里写代码或写文字，然后单独运行它。

### Cell（单元格）

有两种主要类型：

- **代码单元格**：写代码，按 Shift+Enter 运行，下面直接显示结果
- **文本单元格**：写 Markdown 格式的说明文字，用来解释代码在做什么

### Kernel（内核）

Kernel 是幕后真正执行你代码的程序。你写 Python 代码，Python 内核负责运行它；写 R 代码，R 内核负责运行。笔记本本身只是界面，内核才是干活的人。

### 交互式计算

这是 Jupyter 最强大的地方。你可以一行一行地运行代码，随时查看变量的值，改一改再运行，立刻看到变化。不需要编译、不需要整个程序跑完。就像跟计算机对话：你说一句，它回一句。

## 安装与启动

最简单的安装方式：

```bash
pip install jupyter notebook
```

安装完成后，在终端运行：

```bash
jupyter notebook
```

这会在你的浏览器中打开一个页面，显示你的文件夹文件列表。点击 `.ipynb` 文件就打开了笔记本。

## 代码示例

### 示例一：基础计算与变量

这是最入门的例子。在代码单元格中依次输入以下内容，每写完一个单元格按 Shift+Enter 运行：

```python
# 定义变量
name = "Jupyter"
version = "2026"

# 简单的计算
ages = [5, 10, 15, 20, 25]
average_age = sum(ages) / len(ages)

print(f"你好，欢迎来到 {name}！")
print(f"版本：{version}")
print(f"平均年龄：{average_age}")
```

运行后，输出会直接显示在单元格下方：

```
你好，欢迎来到 Jupyter！
版本：2026
平均年龄：15.0
```

这就是交互式的魅力——你不需要写完整的 `main()` 函数，也不需要重新运行整个程序。改一行、跑一下、看结果，循环往复。

### 示例二：数据可视化

Jupyter 最著名的用法是数据分析。配合 matplotlib 库，可以直接在笔记本里画图：

```python
import matplotlib.pyplot as plt
import numpy as np

# 生成数据
x = np.linspace(0, 10, 100)
y_sin = np.sin(x)
y_cos = np.cos(x)

# 在同一张图上画两条曲线
plt.figure(figsize=(10, 5))
plt.plot(x, y_sin, label='sin(x)', linewidth=2)
plt.plot(x, y_cos, label='cos(x)', linewidth=2)
plt.title('三角函数曲线')
plt.xlabel('x')
plt.ylabel('y')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()
```

图表会直接嵌入到笔记本中，不需要打开新窗口。你可以接着对这张图做进一步分析，比如找出峰值、计算面积，全部在一个文档里完成。

## 常用快捷键

记住这几个就够了：

| 快捷键 | 功能 |
|--------|------|
| Enter | 进入当前单元格的编辑模式 |
| Esc | 退出编辑模式，回到命令模式 |
| Shift+Enter | 运行当前单元格，跳到下一个 |
| A | 命令模式下，在当前单元格上方插入新单元格 |
| B | 命令模式下，在当前单元格下方插入新单元格 |
| D, D | 命令模式下，删除当前单元格 |
| M | 命令模式下，将单元格转为文本（Markdown） |
| Y | 命令模式下，将单元格转为代码 |

## 笔记本能做什么

- **数据探索**：加载 CSV 文件，用 pandas 查看前几行，画柱状图、散点图，一步一步找到规律
- **机器学习实验**：训练模型、调整参数、看准确率变化，所有实验记录在一个笔记本里
- **教学与分享**：老师可以写代码+讲解，学生直接运行复现结果
- **报告生成**：把分析过程和最终图表整合在一起，导出为 PDF 或 HTML

## 导出与分享

笔记本不只是给自己看的。Jupyter 支持把 `.ipynb` 文件导出为多种格式：

```bash
# 导出为 HTML
jupyter nbconvert --to html my_notebook.ipynb

# 导出为 PDF
jupyter nbconvert --to pdf my_notebook.ipynb

# 导出为 Markdown
jupyter nbconvert --to markdown my_notebook.ipynb
```

这样你就可以把分析过程分享给同事，或者发布到网上。

## 总结

Jupyter Notebook 的核心价值在于"所见即所得"。代码、结果、文字混排在一个文档中，每一步都能立即看到反馈。它不是用来写大型软件的，而是用来做探索、实验和分享的。

对于初学者来说，最大的好处是不需要理解复杂的开发流程。装好、打开、写代码、看结果——这就是全部。

---

来源：https://github.com/jupyter/notebook
