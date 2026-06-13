---
title: Pluto.jl — Julia 反应式笔记本
来源: https://github.com/fonsp/Pluto.jl
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 是什么

**Pluto.jl** 是 Julia 生态里的**反应式（reactive）笔记本**：把代码拆成多个 cell，改一个参数或函数，所有依赖它的 cell 会自动重跑——像电子表格里改 A1 后引用它的公式立刻重算。笔记本保存为**纯 Julia 源文件**（`.jl`），不是 JSON；每个 notebook 自带独立 Julia 进程与自动管理的包环境，浏览器里即开即写。项目由 Fons van der Plas 等人发起，现维护于 [JuliaPluto/Pluto.jl](https://github.com/JuliaPluto/Pluto.jl)（上游 README 仍指向 `fonsp/Pluto.jl`）；截至 2026 年 3 月稳定版已到 **v0.20.x**，支持 Julia **1.10–1.12**。

日常类比：

> 传统 [[jupyter-notebook]] 像**按页码手写的实验日志**：你在第 2 格定义 `n = 10`，第 5 格画图用了 `n`，后来把第 2 格改成 `n = 100` 却忘了重跑第 5 格——图里仍是旧数据，kernel 里还留着「跑过但没显示」的中间状态。
> Pluto 像**带公式的 Excel**：改定义 `n` 的那一格，所有引用 `n` 的 cell 自动更新；删掉定义 `apple` 的 cell，`apple` 就从内存消失，不会幽灵般留在后台。你看到的代码，就是当前程序状态的全部真相——官方称之为 **「At any instant, the program state is completely described by the code you see.」**

最小上手：

```julia
# 在 Julia REPL 里（需先安装 Julia 1.10+）
using Pkg
Pkg.add("Pluto")
import Pluto
Pluto.run()   # 自动打开浏览器，默认 http://localhost:1234
```

也可指定 notebook 路径启动：`Pluto.run(notebook="/path/to/notebook.jl")`。

## 为什么重要

Pluto 把 Julia 的「科学计算脚本 + 交互探索」两条路合成一条，和 Python 侧的 [[marimo]]、Observable 同属**新一代 reactive notebook** 思路：

- **消除隐藏状态**：Jupyter 的「执行顺序 ≠ 阅读顺序」是 reproducibility 的经典坑；Pluto 用静态分析建依赖图，改上游必更新下游
- **Git 友好**：`.jl` 纯文本 diff 清晰，可 `include` 进普通 Julia 项目，不像 `.ipynb` JSON 噪声大
- **自带 Pkg 环境**：`using Plots` 时 Pluto 为 notebook 自动建独立环境，Manifest 信息写入文件，别人打开能复现同一套包版本
- **交互控件一等公民**：`PlutoUI.jl` + `@bind` 把浏览器滑块/按钮绑到 Julia 变量，配合 reactivity 做参数探索和小型 dashboard，不必另写 [[streamlit]]
- **Julia 原生**：无 Python 式 `%` 魔法、无 wrapper 改你的代码——分析一次后按原样执行

## 核心概念

### 1. Cell（单元格）与 `.jl` 文件

Pluto notebook 在磁盘上是一个 **Julia 脚本**，由多个 `### Cell` 块组成（Pluto 保存时自动组织）。每个 cell 可写任意 Julia 代码；**排版顺序不必等于执行顺序**——引擎根据变量依赖决定谁先跑。

| 特性 | Jupyter（Julia kernel） | Pluto.jl |
|------|-------------------------|----------|
| 文件格式 | `.ipynb`（JSON） | `.jl`（纯 Julia） |
| 执行触发 | 手动 Shift+Enter | 依赖变化自动级联 |
| 全局变量 | 任意 cell 可重复定义 | **每个全局名只能在一个 cell 里定义** |
| 删/改变量定义 | 旧值可能仍在 workspace | 变量从进程删除，依赖 cell 更新 |
| 包环境 | 通常共用当前 Project | 每 notebook 独立环境 + Manifest 嵌入 |

### 2. Reactivity（反应式执行）

Pluto 在**运行前**对每个 cell 做**语法树分析**：找出全局变量的 **定义（assignment）** 与 **引用（reference）**，在 cell 之间连边形成 **DAG（有向无环图）**。

- 你修改 cell A 的代码并运行 → Pluto 找出所有**直接或间接引用 A 所定义变量**的下游 cell → 按拓扑序重跑
- 若 A 不再定义某变量（例如把 `apple = 1` 改成 `banana = 2`），`apple` **被删除**，引用它的 cell 会报错或更新，不会静默用旧值
- **不能**在两个 cell 里分别 `x = 1` 和 `x = 2`——重复定义全局变量会被拒绝，这正是 reactivity 能推理的前提

与 [[marimo]] 类似：Pluto 跟踪的是**变量名的绑定**，不是对象原地突变。`a[5] = 3` 或 `a.field = 2` **不会**触发 reactivity；若需要「可变但不级联」的状态，可用 `Ref`（见官方 Wiki）。

**没有全局「Jupyter 模式」开关**——若某 cell 不想参与级联，可 **Disable cell**（禁用后其定义不参与图）。

### 3. 架构一瞥（浏览器 + Julia 双进程）

| 层 | 技术 | 职责 |
|----|------|------|
| **Frontend** | JavaScript（浏览器） | 编辑 cell、展示输出、PlutoUI 控件 |
| **Backend** | Julia HTTP 服务 | 静态分析、调度 reactive run、同步状态 |
| **Worker** | 每 notebook 一个 Julia 子进程 | 实际执行用户代码 |

前后端通过类似 **Firebase 的共享状态对象** 同步（Pluto 自研 `Firebasey.jl` 做 diff）：cell 代码、输出、日志、运行状态都进 JSON-like 结构，变更只推送 diff。用户代码**从不**在 server 进程里跑——隔离 crash 与包污染。

### 4. `@bind` 与 PlutoUI.jl

`@bind` 把 HTML 控件与 Julia 变量**双向绑定**：用户拖 slider → 变量更新 → reactive 级联重跑依赖 cell。`PlutoUI.jl` 提供 slider、textfield、button、filepicker 等；也可自定义 Web Component（HTML/CSS/JS + Julia API）。

典型模式：

```julia
# cell 1 — 控件
@bind α Slider(0:0.01:1, default=0.5, show_value=true)

# cell 2 — 依赖 α 的计算与作图（α 一变自动重跑）
using Plots
plot(0:0.01:2π, x -> sin(α * x), label="sin($(α) x)")
```

### 5. 包管理与可复现性

首次 `using DataFrames` / `Plots` 等，Pluto 为该 notebook **创建独立环境**并 `Pkg.add` 所需包；环境快照（含版本）写入 `.jl` 文件。他人用 Pluto 打开同一文件时，自动还原环境——无需口头说「请先 `] add Plots`」。

注意：个人 `startup.jl` **不会**自动加载（为 reproducibility）；官方建议把需要的初始化写进 notebook 的 `begin ... end` 块，或显式 `include`（后者仅在你机器上有效）。

### 6. 导出与协作

- **HTML / PDF**：隐藏代码、保留输出，适合讲故事
- **纯 `.jl`**：可当普通脚本维护，或 `include` 进 Julia 包
- **Featured notebooks**： [plutojl.org](https://plutojl.org/) 上可一键在浏览器跑示例

### 7. 与 Jupyter / marimo 怎么选

| 场景 | 更合适的工具 |
|------|----------------|
| 课堂/论文复现、强依赖顺序的手动演示 | Jupyter |
| Python 生态、SQL cell、一键 `marimo run` 变 App | [[marimo]] |
| **Julia 数值/可视化**、参数扫掠、消除 hidden state | **Pluto.jl** |
| 大型 DAG 里频繁 in-place 改数组 | 普通 `.jl` + Revise，或把突变写在定义 cell 内 |

## 实践案例

### 案例 1：最小 reactive 链（变量级联）

三个 cell 可任意上下排列，Pluto 仍按依赖执行：

```julia
# cell 1
n = 10

# cell 2
squares = [k^2 for k in 1:n]

# cell 3
sum(squares)   # 显示 385；把 cell 1 改成 n = 20 并运行 → 自动变 2870
```

把 cell 1 改成 `n = 5` 后，cell 2、3 无需手动 Shift+Enter——这就是与 Jupyter 心智差异最大的地方。

### 案例 2：滑块驱动的函数探索

模拟官方首页「改参数 A → 图立刻更新」：

```julia
# cell 1 — 参数控件
using PlutoUI
@bind A Slider(0.1:0.1:3.0, default=1.0, show_value=true)

# cell 2 — 模型（依赖 A）
f(x) = sin(A * x)

# cell 3 — 可视化
using Plots
xs = range(0, 4π; length=200)
plot(xs, f.(xs), title="A = $(A)", legend=false)
```

拖动 slider 时，cell 2、3 自动重算；`A` 始终是「当前代码里绑定的那个值」，不存在「控件显示 2.0 但内存里还是 1.0」的裂缝。

### 案例 3：多表达式与函数定义约束

**同一全局函数的多方法**必须写在**同一个 cell**（或用 `begin ... end` 包起来）：

```julia
# 一个 cell 内
begin
    g(x::Int) = x + 1
    g(x::Float64) = x + 0.5
end
```

**变量修改**也只能在定义它的 cell 里完成——不能 cell 1 写 `total = 0`、cell 2 写 `total += 1`（第二格既非定义也非 Pluto 支持的 reactive 模式）。应合并：

```julia
begin
    total = 0
    for k in 1:10
        total += k
    end
    total   # 最后一行作为输出 → 55
end
```

### 案例 4：从 Pluto 到普通 Julia 项目

保存的 `analysis.jl` 可在无 Pluto 时作为脚本片段参考；生产管线里更常见做法是：在 Pluto 里**探索**，验证后将核心函数抽到 `src/MyPackage.jl`，用 `Pkg` 测试与 CI。Pluto 的定位是 **exploration & explanation**，不是替代完整的 Julia 包工程。

## 常用操作速查

| 操作 | 方式 |
|------|------|
| 运行 cell | Ctrl+Enter / 点击运行按钮 |
| 添加 cell | 点击 + 或快捷键 |
| 禁用 cell | 右键 Disable（不参与 reactive 图） |
| 查看依赖 | 官方示例与 Featured Notebooks 中的 Explain 类教程 |
| 安装包 | 直接 `using X`，Pluto 自动处理 |
| 多线程 | 启动前设 `JULIA_NUM_THREADS=4`，worker 会继承 |
| 打开指定文件 | `Pluto.run(notebook="path.jl")` |
| 自定义 sysimage | `Pluto.run(sysimage=...)` 加速大型栈 |

## 局限与踩坑

1. **不能 `@async` 轮询改全局变量触发 UI**——Pluto 不做 runtime 变量监视；周期更新用 `@bind`、PlutoHooks、或外部进程推送 bond 值（`set_bond_values_reactive` API）
2. **重复定义全局**——两个 cell 都 `x = ...` 会报错；设计如此
3. **in-place 突变**——`push!`、`df[!,:col]=...` 不触发下游；重构为「新变量名」或写在同一 cell
4. **宏与 `using`**——Pluto 会在必要时 **先跑一部分 cell** 再 macroexpand 分析后续 cell（实现复杂但对用户透明）；极少数动态代码仍可能让静态分析失效
5. **无「只跑这一格不管下游」的 Jupyter 语义**——改代码即可能级联；临时可 Disable 下游 cell
6. **大 notebook 全量重跑**——依赖链长时，改一行可能触发昂贵重算；拆 notebook 或用 Disabled cell 隔离调试段

## 与周边工具的关系

```text
Julia 安装
    └── Pkg.add("Pluto") → Pluto.run()
            ├── 浏览器 UI（编辑 .jl notebook）
            ├── PlutoUI.jl（@bind 控件）
            ├── 每 notebook 独立 Julia worker + Pkg 环境
            └── 导出 HTML/PDF 或 include 进 Julia 项目

对比：
  Jupyter + IJulia     → 手动执行、隐藏状态、.ipynb
  Pluto.jl             → reactive、纯 .jl、Julia 原生 Pkg
  marimo               → Python 侧 reactive + marimo run App
```

- 已在用 **IJulia / Jupyter**：复杂课件仍可用 Jupyter；Julia 探索与参数交互推荐 Pluto
- 需要 **Python**：看 [[marimo]]、[[jupyterlab]]
- 需要 **静态站点里嵌 notebook**：Pluto 导出 HTML；或 Julia 社区的 Franklin/HDocumenter 与 Pluto 配合（视项目而定）

## 学习路径建议

1. 安装 Julia → `Pkg.add("Pluto")` → `Pluto.run()` 打开 **Sample notebooks**（含 Reactivity、Interactivity）
2. 故意制造 Jupyter 式 bug：两格变量依赖，只改上游不重跑下游——在 Jupyter 复现「 stale 输出」，再在 Pluto 看自动修复
3. 用 `@bind` + `Plots`/`PlutoUI` 做一个小型参数扫掠 dashboard
4. 读 [Reactivity 文档](https://plutojl.org/en/docs/reactivity/) 与 [Architecture](https://plutojl.org/en/docs/architecture/) 理解 DAG 与 Firebasey
5. 将探索代码抽到 `MyProject.jl`，用 `Pkg.test` 固化

## 小结

Pluto.jl 把 Julia 写成了**可复现、可交互、无隐藏状态**的笔记本：cell 之间靠变量依赖自动级联，文件是纯 `.jl`，包环境随文件走。它不适合替代完整 Julia 包开发流程，但在**教数值方法、调参、向同事演示模型**时，比传统 Jupyter 少一整类「我明明改了为什么图没变」的困惑。记住一句话：**你屏幕上看到的代码，就是此刻内存里的程序。**

---

## 参考资料

- 官方站点与文档：[plutojl.org](https://plutojl.org/)
- 源码仓库：[github.com/fonsp/Pluto.jl](https://github.com/fonsp/Pluto.jl) / [JuliaPluto/Pluto.jl](https://github.com/JuliaPluto/Pluto.jl)
- Reactivity：[plutojl.org/en/docs/reactivity](https://plutojl.org/en/docs/reactivity/)
- Architecture：[plutojl.org/en/docs/architecture](https://plutojl.org/en/docs/architecture/)
- FAQ：[plutojl.org/en/docs/faq](https://plutojl.org/en/docs/faq/)
- PlutoUI：[github.com/JuliaPluto/PlutoUI.jl](https://github.com/JuliaPluto/PlutoUI.jl)
- 对比笔记：[[jupyter-notebook]]、[[jupyterlab]]、[[marimo]]
