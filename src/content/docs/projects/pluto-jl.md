---
title: Pluto.jl — Julia 反应式笔记本
来源: 'https://github.com/fonsp/Pluto.jl'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

Pluto.jl 是 Julia 生态里的反应式笔记本：你改一个变量、函数或滑块，依赖它的 cell 会自动重新计算。

日常类比：Jupyter 像一本实验草稿本，你可以先翻到后面写，再回来补前面；Pluto 更像电子表格，改了一个格子，所有引用它的格子都会跟着更新。

最小启动方式很短：

```julia
import Pluto
Pluto.run()
```

运行后它会在本机开一个小 Web 服务，浏览器就是编辑器；你写的是普通 Julia 代码，Pluto 负责分析 cell 之间的依赖关系。

## 为什么重要

不理解 Pluto.jl，下面这些 Notebook 痛点会一直显得理所当然：

- 传统 Notebook 可能显示旧输出，因为代码顺序和运行顺序已经分叉
- 教学演示里改一个参数后，学生要手动重跑一串 cell 才能看到正确结果
- 数据分析报告发给别人时，包版本和隐藏状态很容易让结果复现失败
- 想做可交互的数学、绘图、课程作业时，普通脚本又缺少即时反馈

Pluto 的核心价值不是“又一个编辑器”，而是把探索、复现、展示放进同一份 `.jl` 文件。

## 核心要点

1. **依赖图自动重算**：Pluto 会看每个 cell 定义了什么、读取了什么，再连成一张图。类比：厨房里换了原料，只有用到这份原料的菜需要重做，不必整桌重烧。

2. **没有隐藏工作区状态**：删掉变量定义后，变量也会从运行状态里消失。类比：白板擦掉公式后，计算器不会偷偷记着旧公式。

3. **纯 Julia 文件和内置包环境**：Notebook 保存成 `.jl`，并把项目依赖信息嵌入文件。类比：菜谱和采购清单订在一起，别人照着做时不容易少买材料。

这三点让 Pluto 更接近“会自动整理执行顺序的程序”，而不是“可以乱跑 cell 的草稿本”。

## 实践案例

### 案例 1：cell 顺序可以和执行顺序不同

Pluto 官方 sample 里有一个 Basel problem 例子，文件里的 cell 可以这样摆：

```julia
sqrt(sum(seq) * 6.0)

n = 1:100000

seq = n .^ -2
```

逐部分解释：

- 第一行看起来先用了 `seq`，但 Pluto 会发现它依赖 `seq`
- `seq` 又依赖 `n`，所以真正计算时会先算 `n`，再算 `seq`
- 你改 `n = 1:1000`，只会重新跑受影响的 cell
- 这适合教学推导，因为展示顺序可以按故事走，计算顺序交给依赖图

### 案例 2：用 `@bind` 把滑块变成 Julia 变量

官方 `@bind` 文档给的入门形态是：

```julia
using PlutoUI

@bind apples Slider(5:50)

apples

repeat("x", apples)
```

逐部分解释：

- `Slider(5:50)` 创建一个从 5 到 50 的滑块
- `@bind apples ...` 把滑块当前值绑定到全局变量 `apples`
- 后面的 `apples` 和 `repeat("x", apples)` 都依赖这个变量
- 拖动滑块时，依赖 `apples` 的 cell 自动更新，不需要手写 callback

这就是 Pluto 做交互教学的关键：控件不是孤立按钮，而是数据流的一部分。

### 案例 3：直接用 Julia 包画图

官方 plotting sample 用 `Plots.jl` 展示数据可视化：

```julia
using Plots

plotly()
years = 2001:2010
apples = [15, 25, 80, 75, 50, 30, 35, 15, 25, 35]

plot(years, apples, legend=false, title="Number of apples per year")
```

逐部分解释：

- `using Plots` 会触发 Pluto 的内置包管理，缺包时自动安装
- `plotly()` 选择一个适合浏览器展示的绘图库后端
- `years` 和 `apples` 是普通 Julia 变量，后续图表 cell 会追踪它们
- 改数组里的数据后，图表会跟着更新，适合边探索边讲解

这个案例说明 Pluto 没有把 Julia 包包进另一套 API；大多数能在 REPL 跑的 Julia 代码，也能在 Pluto 里跑。

## 踩过的坑

1. **两个 cell 不能定义同一个全局变量**：原因是 `x` 如果有两个来源，依赖图就不知道谁才是上游。

2. **原地修改不一定触发重算**：原因是 `a = 1` 这种赋值能被分析，`a[5] = 3` 或 `a.field = 2` 这种内部变化不总能被静态追踪。

3. **`print` 和 `display` 常常不是你想要的输出方式**：原因是 Pluto 更推荐把想展示的值放在 cell 最后一行，`print` 可能写到启动 Pluto 的终端里。

4. **`plot!()` 跨 cell 追加图层容易留下旧状态**：原因是它会修改已有图对象，重新打开 notebook 时可能和当前代码不一致。

5. **导出的静态 HTML 不能直接保持 `@bind` 后端计算**：原因是滑块更新需要 Julia 进程；要线上交互通常要 PlutoSliderServer 或 Binder 这类运行环境。

## 适用 vs 不适用场景

**适用**：

- Julia 数据分析、数值计算、可视化，需要边改参数边看结果
- 教学课件和作业，希望学生看到“改一处，相关结果全变”的反馈
- 可复现实验报告，希望 notebook 文件同时保存代码和包环境
- 小型交互演示，例如滑块控制模型参数、图表范围、数学函数

**不适用**：

- 完整生产 Web 应用，仍然需要权限、部署、后端框架和安全边界
- 强依赖 Jupyter 扩展生态的课程或团队流程，迁移前要确认替代能力
- 需要大量隐式全局状态和手动运行顺序的旧 notebook
- 对外开放可编辑 Pluto 服务，除非你能接受访问者可能执行服务器代码的风险

## 历史小故事（可跳过）

- **2020 年**：Pluto 在 JuliaCon 做介绍，主打反应式 notebook 和可复现实验。
- **2021 年**：项目继续围绕教学和互动演示演进，官方 README 提到它和 MIT 计算思维课程一起成长。
- **2023 年**：Pluto 在 JupyterCon 继续强调 reactive and reproducible，定位从小工具扩展到教学与科研工作流。
- **2026 年**：Pluto 1.0 发布，GitHub 仓库约 5.4k stars，仍由 JuliaPluto 社区维护。
- **设计灵感**：README 提到 Pluto 受 Observable 启发，希望重新思考编程环境该如何帮助探索。

## 学到什么

1. **Notebook 的核心风险是隐藏状态**：只要屏幕上的代码不能完整解释运行状态，结果就可能不可信。
2. **反应式不是魔法，是依赖图**：Pluto 靠语法分析找到变量定义和引用，再决定哪些 cell 该重跑。
3. **交互控件也可以是普通变量**：`@bind` 把滑块、按钮、输入框接进 Julia 数据流，而不是另写一套事件系统。
4. **可复现需要文件格式配合**：`.jl` 文件、嵌入式包环境、HTML 导出，让分享和复跑更接近同一件事。

## 延伸阅读

- 官方仓库：[JuliaPluto/Pluto.jl](https://github.com/JuliaPluto/Pluto.jl)
- 官方文档：[Pluto.jl docs](https://plutojl.org/)
- 反应式机制：[Reactivity in Pluto.jl](https://plutojl.org/en/docs/reactivity/)
- 交互控件：[PlutoUI and @bind](https://plutojl.org/en/docs/bind/)
- 包管理：[Built-in package management](https://plutojl.org/en/docs/packages/)
- 在线交互发布：[PlutoSliderServer.jl](https://plutojl.org/en/docs/plutosliderserver/)

## 关联

- [[jupyter-notebook]] —— Pluto 主要对比对象，差异集中在隐藏状态和执行顺序
- [[marimo]] —— Python 生态里相似的反应式 notebook，也强调依赖图和可复现
- [[observable-framework]] —— Pluto 的灵感来源之一 Observable 属于反应式数据叙事路线
- [[codemirror]] —— Pluto 浏览器编辑器依赖的代码编辑基础设施
- [[self-adjusting]] —— “输入变化后只重算受影响部分”的思想亲缘更深
- [[salsa-adapton]] —— 同样围绕增量计算和依赖追踪，只是应用在编译器与程序分析
- [[push-pull-frp]] —— 反应式系统里事件和状态如何传播的理论背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
