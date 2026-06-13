---
title: FreeCAD — 参数化 CAD
来源: https://github.com/FreeCAD/FreeCAD
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 初级
---

## 是什么

**FreeCAD** 是一款**免费开源**的全功能参数化 3D CAD 软件，源码托管于 [FreeCAD/FreeCAD](https://github.com/FreeCAD/FreeCAD)。它面向机械设计、3D 打印零件、建筑 BIM 草模、有限元分析前处理等场景，用**特征树 + 草图约束**描述零件如何生成——改一个尺寸，整棵历史树自动重算，而不是像网格雕刻那样「改了就回不去」。

日常类比：如果把 [[openscad]] 比作**写菜谱**（纯文本、CSG 布尔运算），把 [[blender]] 比作**电影制片厂**（动画、渲染、有机造型），FreeCAD 更像**正规机械制图室里的活页夹**：

- 每一页草图（**Sketch**）是带尺寸约束的 2D 工程图；
- 每一页特征（**Pad** 拉伸、**Pocket** 挖槽）是在前一页实体上「加盖」或「开孔」；
- 整本活页夹装进一个文件夹（**Body**），最后导出 STL 给切片软件，或出工程图给车间。

再打个比方：传统无参数 CAD 像**用橡皮泥捏零件**——捏坏了只能重来。参数化 CAD 像**乐高说明书**：「底板 40×20，立柱高 30，孔距 15」——改说明书上的数字，成品自动变，但**不能**随便抽掉中间某块而不考虑后面步骤（这就是特征树顺序的意义）。

最小 Python 示例（在 **View → Panels → Python console** 或宏里运行）：

```python
import FreeCAD as App
import Part

doc = App.newDocument("Hello")
box = doc.addObject("Part::Box", "Box")
box.Length = 20
box.Width = 10
box.Height = 5
doc.recompute()
```

三行属性赋值 = 一个 20×10×5 mm 的实体出现在 3D 视图。GUI 里 Part 工作台创建的立方体，底层就是这类 `Part::` 对象。

## 为什么重要

零基础学「能加工、能打印、能画工程图」的 3D，FreeCAD 有几个现实理由：

- **零订阅、GPL/LGPL 混合许可**：个人、教育、小企业均可免费使用，不像 SolidWorks / Fusion 按年付费
- **参数化机械工作流完整**：Part Design（特征建模）、Sketcher（2D 约束）、TechDraw（工程图）、Assembly（装配）、FEM（有限元）、Path（CAM 刀路）——一个 `.FCStd` 项目串起来
- **Python 一等公民**：界面操作几乎都能用脚本复现；宏、工作台扩展、批量改图是日常操作
- **3D 打印与 Maker 生态**：导出 STL/3MF；与 [[openscad]] 互补——复杂草图约束用 FreeCAD 更顺手，纯算法生成几何用 OpenSCAD 更轻
- **跨平台**：Windows / macOS / Linux；0.22+（及 1.0 线）显著缓解长期困扰用户的**拓扑命名**问题，特征树更稳定

代价也要心里有数：学习曲线比 OpenSCAD 陡；界面/workbench 多，新手容易迷路；高端曲面、大型装配、CAM 刀路仍弱于商业 CAD，但教参数化思维足够。

## 核心要点

### 1. 工作台（Workbench）——按需换工具箱

FreeCAD 主程序像**空教室**，真正能力来自可插拔的 **Workbench**：

| 工作台 | 干什么 | 类比 |
| --- | --- | --- |
| **Part Design** | 实体特征建模（Body、Pad、Pocket） | 机械车间：车削、铣槽 |
| **Sketcher** | 2D 草图 + 几何/尺寸约束 | 蓝图桌 |
| **Part** | 布尔、倒角、简单 primitive | 万能钳工台 |
| **Draft** | 2D 标注、尺寸、SVG 导出 | 制图员 |
| **TechDraw** | 正投影工程图 | 打印车间图纸 |
| **Assembly** | 多零件约束装配 | 装配流水线 |
| **FEM** | 网格划分、边界条件、求解 | 结构分析室 |
| **Path** | CAM 刀路（配合 GRBL 等） | CNC 编程 |

零基础建议路径：**Part Design → Sketcher** 打通一条「草图 → 拉伸 → 挖孔 → 导出 STL」闭环，再按需摸 Draft / TechDraw。

### 2. Body、Sketch、Feature——特征树三件套

**Part Design** 的核心对象关系：

```
Document
 └── Body（单一连续实体容器，自带局部坐标系）
      ├── Origin（基准面 XY / XZ / YZ）
      ├── Sketch（2D 轮廓，附在某个面上）
      ├── Pad（把草图正向拉伸加料）
      ├── Pocket（把草图拉伸挖料）
      ├── Hole / Fillet / Chamfer …
      └── …
```

- **Body**：一个 Body 里最终应收敛为**一块**可制造的实体（多体需多个 Body 或布尔）
- **Sketch**：必须尽量**完全约束**（Fully constrained）——欠约束时几何会漂，过约束会报红
- **Feature**：对 Body 的每一步增/减操作；顺序很重要：先 Pad 出底板，再 Pocket 挖孔

### 3. 草图约束（Sketcher Constraints）

Sketcher 用约束代替「肉眼对齐」：

| 约束类型 | 作用 |
| --- | --- |
| 水平 / 垂直 | 边与坐标轴平行 |
| 重合 / 相切 | 点在线上、圆与边相切 |
| 对称 | 相对原点或构造线对称 |
| 距离 / 半径 | 尺寸驱动——**参数化的灵魂** |
| 等长 / 平行 | 多实体之间关系 |

**Master Sketch** 做法（官方教程常见）：在一个草图里用命名约束 `length`、`width` 定义整体包络，后续特征引用同一参数——改一处，全模型联动。

### 4. BREP 与网格

FreeCAD 内部用 **BREP**（边界表示）：面、边、顶点精确描述实体，适合 CNC 与参数编辑。导出 STL 时才**离散**成三角网格。这与 [[blender]] 默认网格建模不同——改 STL 上的三角面不会自动更新特征树。

### 5. 拓扑命名与版本选择

早期 FreeCAD 有个痛点：改草图后，下游特征可能因内部名字变化而「找不到面」。**0.22 / 1.0** 引入更稳定的命名策略。新手若跟教程，优先用**较新版本**，减少「上一步还好好的，改个尺寸就全红」的挫败感。

### 6. 文件与单位

- 项目文件：`.FCStd`（zip 包：几何、脚本、元数据）
- 默认长度单位常设为 **mm**（首选项 → 通用 → 单位）
- 导出：`File → Export` 选 STL、STEP、IGES；STEP 保留实体，方便与其他 CAD 交换

## 上手：第一个 Part Design 零件（逻辑步骤）

以「底板 + 居中圆孔」为例（SD 卡托、支架底板都同构）：

1. 新建文档 → 切换到 **Part Design**
2. **Create body** → 自动出现 `Body`
3. **Create sketch** → 选 **XY 平面** → 画矩形 → 给长宽尺寸 → 用**对称约束**让矩形中心落在原点
4. 关闭草图 → **Pad** 拉伸 3 mm
5. 在顶面 **Create sketch** → 画圆 → 约束半径 → 圆心约束到原点
6. **Pocket** 贯穿挖孔
7. `File → Export` → `holder.stl`

全程没有手写代码，但特征树里每一步都可双击改尺寸——这就是参数化。

## 代码示例

### 示例 1：Part Design 程序化建 Body + 盒体 + 挖槽

适合批量生成支架、测试夹具：

```python
import FreeCAD as App

doc = App.newDocument("Bracket")

body = doc.addObject("PartDesign::Body", "Body")

# additive box: 基座 60×40×5
box = doc.addObject("PartDesign::AdditiveBox", "Base")
box.Length = 60
box.Width = 40
box.Height = 5
body.addObject(box)

# subtractive box: 中间挖 30×20×5 的腔
cut = doc.addObject("PartDesign::SubtractiveBox", "Pocket")
cut.Length = 30
cut.Width = 20
cut.Height = 5
cut.Placement.Base = App.Vector(15, 10, 0)  # 相对 Body 原点平移
body.addObject(cut)

doc.recompute()
```

`AdditiveBox` / `SubtractiveBox` 是 Part Design 的 primitive 特征，等价于 GUI 里的「加料方体 / 减料方体」。改 `Length` 后 `recompute()`，特征树整体刷新。

### 示例 2：草图 + Pad 经典流程（Python）

与 GUI「画草图再拉伸」同构，适合写宏：

```python
import FreeCAD as App
import Part

doc = App.newDocument("PadDemo")
body = doc.addObject("PartDesign::Body", "Body")

sk = doc.addObject("Sketcher::SketchObject", "Sketch")
body.addObject(sk)
# 附到 Body 的 XY 基准面（Origin 子对象索引因版本略异，GUI 建草图更稳）
# 此处用四条线画 50×30 矩形（单位 mm）
geoList = [
    App.Vector(-25, -15, 0), App.Vector(25, -15, 0),
    App.Vector(25, 15, 0), App.Vector(-25, 15, 0),
]
sk.addGeometry(Part.LineSegment(geoList[0], geoList[1]))
sk.addGeometry(Part.LineSegment(geoList[1], geoList[2]))
sk.addGeometry(Part.LineSegment(geoList[2], geoList[3]))
sk.addGeometry(Part.LineSegment(geoList[3], geoList[0]))

pad = doc.addObject("PartDesign::Pad", "Pad")
pad.Profile = sk
pad.Length = 10
body.addObject(pad)

doc.recompute()
```

实际项目里更推荐：**GUI 建第一版** → **Macro → 宏录制** → 再整理 Python。Sketcher 约束索引手写易错，录制能省大量时间。

### 示例 3：读属性、批量改尺寸

```python
import FreeCAD as App

doc = App.ActiveDocument
for obj in doc.Objects:
    if obj.TypeId == "PartDesign::Pad":
        obj.Length = obj.Length * 1.1  # 所有 Pad 加厚 10%
doc.recompute()
```

参数化模型的价值：一组支架「统一加厚 1 mm」不必逐个双击特征。

## 与相近工具对比

| 维度 | FreeCAD | [[openscad]] | [[blender]] | Fusion 360 |
| --- | --- | --- | --- | --- |
| 交互 | GUI + 特征树为主 | 纯脚本 CSG | 网格/雕刻/动画 | GUI 特征树 |
| 参数化 | 草图约束 + 特征 | 变量 + module | 修改器（非机械特征树） | 工业级 |
| 学习曲线 | 中高 | 中（会编程则低） | 高（领域广） | 中 |
| 许可 | 开源免费 | 开源免费 | 开源免费 | 商业订阅 |
| 典型出口 | STEP、STL、工程图 | STL | FBX、渲染图 | 制造全流程 |

## 常见坑

1. **没在 Body 里建特征**：Part Design 特征必须挂在 `Body` 下，否则 Pad/Pocket 灰色不可用
2. **草图欠约束**：拖一下边，整图变形；看约束列表是否「Fully constrained」
3. **特征顺序错**：先倒角再挖孔，与先挖孔再倒角，结果可能不同甚至失败
4. **混用 Part 与 Part Design 布尔**：老手才玩；新手先单一 Body 走通
5. **导出 STL 前未 recompute**：`Ctrl+Shift+R` 或 `doc.recompute()`，避免导出旧几何
6. **宏路径与 import**：宏在 `Macro` 目录，扩展名 `.FCMacro`；`import` 需 `.py` 或配置 `sys.path`

## 学习资源

- 官方文档：[FreeCAD-documentation wiki](https://github.com/FreeCAD/FreeCAD-documentation)（Part Design、Python scripting tutorial）
- 入门教程：*Creating a simple part with PartDesign*、*Basic Part Design Tutorial*
- 社区：FreeCAD 论坛、中文 QQ/论坛群、YouTube / B 站「Sketcher 约束」系列
- 源码结构：`src/Mod/PartDesign`、`src/Mod/Sketcher` 对应工作台实现

## 在本知识库中的位置

- 分类预期：**图形学** → 与 CAD、3D 内容管线相关（运行 `classify-notes` 后写入 frontmatter）
- 上游：数学（约束求解）、工程制图常识
- 下游：3D 打印切片、[[grbl]] CNC、[[open3d]] 点云与 CAD 是不同赛道
- 相关笔记：[[openscad]]、[[blender]]、[[assimp]]（网格导入）、[[buildroot]]（设备外壳常配合打印件）

---

*最后更新：2026-06-13*
