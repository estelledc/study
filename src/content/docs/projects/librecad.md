---
title: LibreCAD — 2D 工程绘图
来源: 'https://github.com/LibreCAD/LibreCAD'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

LibreCAD 是一个**专门画 2D 工程图的开源 CAD 工具**。日常类比：它不像 Blender 那样给你一间 3D 电影棚，而像一张带刻度、能自动吸附端点的工程绘图桌。

最小使用例不是写代码，而是把已有 DXF 图纸批量导出：

```bash
librecad dxf2pdf floor-plan.dxf
librecad dxf2png bracket.dxf
librecad dxf2svg laser-cut.dxf
```

这里的 DXF 可以理解成 CAD 世界的"通用作业本"。LibreCAD 读它、画它、再导出成 PDF / PNG / SVG，适合机械草图、建筑平面、课堂制图练习和 CNC 前的 2D 图形准备。

它来自 QCAD 社区版，界面用 Qt 写，跨 Windows / macOS / Linux；许可证是 GPLv2。核心定位很窄：**把 2D 线、圆、尺寸、图层和块画准**，不是做 3D 建模。

## 为什么重要

不理解 LibreCAD，下面这些事都不好解释：

- 为什么工程绘图最先强调坐标、单位和图层，而不是"画得好看"
- 为什么 DXF 在开源 2D CAD 里这么关键，因为很多设备和软件都认它
- 为什么新手学 CAD 常从 2D 开始，先学线、圆、尺寸、比例，再碰 3D
- 为什么它和 [[freecad]] / [[openscad]] 不抢同一件事：一个画 2D 图纸，另两个偏 3D 参数模型

## 核心要点

LibreCAD 的价值可以拆成 **三点**：

1. **坐标驱动的精确绘图**：鼠标能画，但真正稳定的是输入 `0,0`、`@100,0`、`@100<45` 这种坐标。类比：手画地图靠感觉，工程图靠经纬度。

2. **DXF 是主通道**：LibreCAD 围绕 DXF 做读写和转换，背后关联 `libdxfrw`。类比：大家说不同语言时，DXF 像一张都能看懂的表格。

3. **图层、线型、块让图纸可维护**：墙线、尺寸线、中心线不要混在一层；螺丝、家具、标题栏可以做成块重复插入。类比：写长文要分章节，画工程图也要分图层和组件。

## 实践案例

### 案例 1：把 DXF 批量转成发布格式

```bash
librecad dxf2pdf foo.dxf
librecad dxf2png foo.dxf
librecad dxf2svg foo.dxf
```

**逐部分解释**：

- `dxf2pdf` 适合发给只需要审阅的人，打开门槛低
- `dxf2png` 适合贴到文档、聊天或网页里快速预览
- `dxf2svg` 适合后续放进矢量工作流，比如网页、激光切割或图形编辑
- 这个案例来自官方 README，说明 LibreCAD 不只是 GUI，也能当命令行转换器用

### 案例 2：用命令行画一个 10×10 正方形

```text
li
0,0
@10,0
@0,10
@-10,0
close
```

**逐部分解释**：

- `li` 是 line 工具的短命令，等价于选择"两点画线"
- `0,0` 是绝对坐标，从原点开始
- `@10,0` 是相对坐标，表示从上一个点向右走 10
- `@0,10` 表示再向上走 10
- `close` 让最后一点自动连回起点，形成闭合图形

这个例子来自官方命令行手册。它的重点不是"会敲命令"，而是理解 CAD 里最重要的习惯：**每个点都要能被精确复现**。

### 案例 3：用多命令变量重复画两个圆

```text
a=ci;0,0;10
b=ci;10,0;10
c=\a;\b;kill
\c
```

**逐部分解释**：

- `ci` 是 circle 命令，后面跟圆心和半径
- `a` 保存"在 0,0 画半径 10 的圆"
- `b` 保存"在 10,0 画半径 10 的圆"
- `c` 把两个变量串起来，最后 `kill` 结束当前命令
- `\c` 展开变量，相当于一次执行两个画圆步骤

这来自官方命令行手册的变量示例。它说明 LibreCAD 的 command line 不只是输入坐标，还能把重复绘图动作变成小脚本。

## 踩过的坑

1. **把 CAD 当普通画图软件用**：只靠鼠标拖线，尺寸会漂；工程图要优先用坐标、吸附和约束式输入。

2. **忘记相对坐标的 `@`**：`100,0` 是从原点看，`@100,0` 是从上一个点看；少一个符号，图形位置完全不同。

3. **乱用 layer 0**：官方手册提醒 layer 0 对块有特殊含义；普通图纸应新建业务图层，别把所有线都丢进去。

4. **macOS arm64 构建可能被系统拦住**：README 提到未签名 app 可能显示 damaged，需要清 quarantine 并重新 codesign。

5. **版本和 Qt 要求会变**：master 是预发布代码，不同分支要求 Qt 5 或 Qt 6；学用软件走稳定版，编源码再看分支要求。

## 适用 vs 不适用场景

**适用**：

- 学 2D CAD 入门：坐标、线型、图层、尺寸标注、打印比例
- 需要免费开源工具打开、编辑或转换 DXF 文件
- 做简单机械零件、建筑平面、教学制图、CNC 前的 2D 轮廓准备
- 想用命令行把一批 DXF 转成 PDF / PNG / SVG
- Linux 桌面或教育环境里需要可安装、可分发的 CAD 工具

**不适用**：

- 复杂 3D 参数化建模，用 [[freecad]] 或 [[openscad]] 更合适
- 视觉设计、插画和排版，用 [[inkscape]] / [[krita]] 更顺手
- 大型商业 CAD 协作、行业插件和 DWG 生态强依赖，通常还是专业商业软件
- 需要浏览器协作白板，用 [[excalidraw]] 或 [[drawio]] 更轻
- 追求真实渲染、动画、材质和灯光，用 [[blender]] 这类 3D 工具

## 历史小故事（可跳过）

- **QCAD 社区版背景**：LibreCAD 从 QCAD community edition 演化出来，目标是保留免费开源的 2D CAD 路线。
- **Qt 跨平台路线**：项目用 Qt 做界面，所以同一套应用能覆盖 Windows / macOS / Linux。
- **DXF / DWG 能力逐步增强**：README 提到关联项目 `libdxfrw`，负责 DXF 和 DWG 文件读写能力。
- **社区维护节奏**：仓库长期维护，GitHub stars 量级约 6.1k，issue 和 release 仍在更新。
- **分支承接历史包袱**：2.1、2.2、2.2.1、2.2.2 分别对应不同 Qt 时代，说明桌面 CAD 软件维护周期很长。

## 学到什么

1. **2D CAD 的核心不是画线，而是可复现的几何关系**：坐标、单位、比例和图层比颜色更重要。
2. **DXF 是开源 CAD 生态的公共接口**：能读写 DXF，工具就能接进更大的工程工作流。
3. **GUI 工具也可以有脚本化入口**：`dxf2pdf` 和 command line 让 LibreCAD 不只适合手工操作。
4. **窄工具有窄工具的价值**：LibreCAD 不追 3D 全家桶，反而适合把 2D 制图基本功讲清楚。

## 延伸阅读

- 官方仓库：[LibreCAD/LibreCAD](https://github.com/LibreCAD/LibreCAD)
- 用户手册：[LibreCAD User Manual](https://librecad.readthedocs.io/en/latest/)
- 命令行手册：[The Command Line](https://docs.librecad.org/en/latest/guides/cmdline.html)
- 图层和模板：[Setting up a Drawing](https://librecad.readthedocs.io/en/latest/guides/dwg-setup.html)
- 块的使用：[Blocks](https://docs.librecad.org/en/latest/guides/blocks.html)
- [[freecad]] —— 参数化 3D CAD，和 LibreCAD 的 2D 路线形成对照

## 关联

- [[freecad]] —— 偏 3D 参数化建模，适合对比"二维图纸"和"三维实体"
- [[openscad]] —— 用代码生成 3D 模型，和 LibreCAD 的交互式 2D 绘图互补
- [[inkscape]] —— 同样处理矢量图形，但目标是设计和插画，不是工程尺寸
- [[krita]] —— 位图绘画工具，和 LibreCAD 的几何精确性形成对照
- [[blender]] —— 3D 建模、动画、渲染全家桶；LibreCAD 是更窄的 2D 工程绘图桌
- [[excalidraw]] —— 协作白板重表达和沟通，LibreCAD 重精确尺寸和图纸输出
- [[drawio]] —— 流程图和架构图工具，和 CAD 图纸同属"图形表达"，但语义完全不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
