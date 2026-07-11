---
title: FreeCAD — 参数化 CAD
来源: 'https://github.com/FreeCAD/FreeCAD'
日期: 2026-05-29
分类: graphics
难度: 初级
---

## 是什么

FreeCAD 是一个**开源的参数化 3D CAD**：你不是只画出一个最终形状，而是保留“这个孔为什么在这里、这个台阶多高、这个零件依赖哪张草图”的设计历史。

日常类比：普通图片像一张拍好的照片，改尺寸只能重新修；FreeCAD 更像一份带公式的装修图，墙厚、门宽、孔距都写在表里，改一个数字，相关结构会重新计算。

最小例子可以从 Python 控制台开始：

```python
import FreeCAD as App
doc = App.newDocument("demo")
box = doc.addObject("Part::Box", "Block")
box.Length = 80
box.Width = 30
box.Height = 10
doc.recompute()
```

这段代码做了一块 80×30×10 的长方体。你以后把 `box.Length` 改成 `120`，FreeCAD 会重新算几何，而不是要求你手动拉伸每个面。

它的定位接近“开源版工程 CAD”：能做 PartDesign 零件建模、Assembly 装配、TechDraw 工程图，也能通过 Python 和命令行自动化。

## 为什么重要

不理解 FreeCAD，下面这些事很难解释：

- 为什么 CAD 文件不只是“一个 3D 网格”，而是一串可回放、可修改的建模步骤
- 为什么机械设计里常说“参数化”比“画得像”更重要，因为后期改孔距和壁厚是常态
- 为什么开源硬件、3D 打印、机器人小项目需要 STEP / STL / DXF / PDF 等格式互相转换
- 为什么 FreeCAD 有约 32k GitHub stars，却仍会被人说“上手慢”：它面对的是工程约束，不是单纯拖形状

## 核心要点

FreeCAD 的核心可以拆成三件事：

1. **参数化历史树**。类比：做菜时不只保存成品照片，还保存菜谱步骤。FreeCAD 的对象依赖上游草图和特征，改上游参数会触发下游重新计算。

2. **工作台分工**。类比：工厂里有钣金工、装配工、制图员，各做一段流程。PartDesign 做实体零件，Assembly 处理零件关系，TechDraw 把 3D 模型变成能交给别人加工的 2D 图纸。

3. **几何内核 + 脚本外壳**。类比：发动机负责真正算形状，方向盘和仪表盘负责让人操作。OpenCASCADE / OCCT 负责 BRep、布尔、倒角等几何计算，Qt 和 Coin3D 负责界面与显示，Python API 负责自动化。

## 实践案例

### 案例 1：用脚本生成一个 3D 打印支架

真实场景：做传感器、开发板或相机支架时，外形经常类似，只是孔距、板宽、壁厚不同。FreeCAD 可以用 Python 生成零件，再导出 STEP 给别人改，或导出 STL 直接切片打印。

```python
import FreeCAD as App
import Part

doc = App.newDocument("bracket")
plate = Part.makeBox(80, 30, 5)

for x in (15, 65):
    hole = Part.makeCylinder(3, 8, App.Vector(x, 15, -1))
    plate = plate.cut(hole)

obj = doc.addObject("Part::Feature", "Bracket")
obj.Shape = plate
doc.recompute()
obj.Shape.exportStep("bracket.step")
doc.saveAs("bracket.FCStd")
```

逐部分解释：

- `Part.makeBox()` 先做一块底板，尺寸就是设计参数
- `Part.makeCylinder()` 做两个“负形状”，再用 `cut()` 从底板里挖孔
- `exportStep()` 导出工程交换格式，`saveAs()` 保留 FreeCAD 的建模文件

命令行运行：

```bash
FreeCADCmd make_bracket.py
```

### 案例 2：把 3D 模型变成工程图

真实场景：一个零件不能只给 STL，因为加工厂、同事或未来的你还需要看尺寸、投影视图、中心线和标注。FreeCAD 的 TechDraw 工作台就是把 3D 模型整理成 PDF / SVG / DXF 图纸。

```python
import FreeCAD as App
import TechDraw

doc = App.openDocument("bracket.FCStd")
part = doc.getObject("Bracket")
page = doc.addObject("TechDraw::DrawPage", "Page")
view = doc.addObject("TechDraw::DrawViewPart", "TopView")
view.Source = [part]
view.Direction = (0, 0, 1)
view.Scale = 1
page.addView(view)
doc.recompute()
TechDraw.writeDXFPage(page, "bracket.dxf")
```

逐部分解释：

- `DrawPage` 是一张图纸页面，类似 A4 工程图纸
- `DrawViewPart` 是从某个方向看到的零件视图
- `writeDXFPage()` 把页面导出给 2D CAD、激光切割或文档流程继续使用

### 案例 3：批量转换供应商模型

真实场景：供应商给你 STEP，3D 打印软件要 STL，网页预览可能要 glTF。FreeCAD 可以当作格式转换器放进脚本里，而不是每个文件都人工打开再另存。

```python
import sys
import FreeCAD as App
import Import
import Mesh

source, target = sys.argv[1], sys.argv[2]
doc = App.newDocument("convert")
Import.insert(source, doc.Name)
doc.recompute()
objects = [o for o in doc.Objects if hasattr(o, "Shape")]
Mesh.export(objects, target)
```

命令行示例：

```bash
FreeCADCmd convert_step_to_stl.py motor_mount.step motor_mount.stl
```

逐部分解释：

- `Import.insert()` 读取 STEP / IGES 等工程模型
- `objects` 只挑有 `Shape` 的几何对象，避免把页面、配置对象也导出去
- `Mesh.export()` 输出 STL，适合切片软件或快速预览

## 踩过的坑

1. **拓扑命名会让下游特征断掉**：如果草图直接贴在某个面上，上游几何变化后 `Face13` 可能变成别的面，孔或倒角就跑偏。FreeCAD **1.0（2024-11）** 已合入 TNP mitigation，稳定性好很多，但复杂特征链仍可能断，建模习惯仍要尽量少绑临时面号。
2. **忘记 `doc.recompute()` 会以为代码没生效**：FreeCAD 为了大模型性能，不是每次属性变化都立即重算。
3. **STL 不是可编辑 CAD 源文件**：STL 只是三角面片，适合打印，不适合保留草图、约束和参数历史。
4. **工程图标注不要太早做**：模型还在大改时，TechDraw 维度引用可能跟着几何变化失效，最好等主体稳定后再补完整标注。

## 适用 vs 不适用场景

**适用**：

- 机械小零件、支架、外壳、治具、机器人结构件
- 开源硬件项目，需要别人能复现、修改和导出模型
- 需要 STEP / STL / DXF / SVG / PDF 互转的个人或小团队流程
- 会一点 Python，想把 CAD 放进批量生成、测试或 CI 里的场景

**不适用**：

- 角色、雕塑、动画资产；这类更适合 Blender / ZBrush 路线
- 大型商业机械团队强依赖成熟 PDM、供应链插件和行业标准模板
- 只想快速拖一个视觉概念，不关心尺寸约束和后续加工
- 初学当天就要稳定产出复杂装配，FreeCAD 的学习曲线会比较陡

## 历史小故事（可跳过）

- **2000 年代初**：FreeCAD 开始围绕 OpenCASCADE、Qt、Python 这些开源技术搭建通用 CAD。
- **社区扩展**：BIM、CAM、FEM、外部工作台和宏生态逐渐长出来，FreeCAD 不再只是零件建模工具。
- **2024-11 FreeCAD 1.0**：合入拓扑命名缓解（TNP mitigation）、集成 Assembly、材料系统与大量 UI 改进——缓解不是根除，但关键工作流明显稳了。

## 学到什么

1. **CAD 的核心不是画图，而是维护设计关系**：尺寸、约束、依赖树才决定后续能不能改。
2. **FreeCAD 把工程建模变成可编程系统**：同一个模型既能由 GUI 修改，也能由 Python 生成和导出。
3. **BRep 和 Mesh 要分清**：STEP / FCStd 保留工程几何，STL 更像打印用外壳。
4. **开源 CAD 的价值在长期可复现**：文件、脚本、宏、导出命令都能放进 Git，未来还能追溯。

## 延伸阅读

- 项目主页：[FreeCAD/FreeCAD](https://github.com/FreeCAD/FreeCAD)
- 官方文档入口：[FreeCAD Wiki](https://wiki.freecad.org)
- 脚本入门：[Python scripting tutorial](https://wiki.freecad.org/Python_scripting_tutorial)
- 命令行与配置：[Start up and Configuration](https://wiki.freecad.org/Start_up_and_Configuration)
- 工程图：[TechDraw Workbench](https://wiki.freecad.org/TechDraw_Workbench)
- 坑点解释：[Topological naming problem](https://wiki.freecad.org/Topological_naming_problem)

## 关联

- [[blender]] —— Blender 更偏艺术建模和动画，FreeCAD 更偏尺寸约束和工程制造
- [[krita]] —— Krita 处理 2D 绘画，和 FreeCAD 的实体几何形成图形工具对照
- [[grbl]] —— GRBL 控制 CNC 机器，FreeCAD 的 CAM / 导出流程可能成为制造前一步
- [[picogl]] —— PicoGL 解释 3D 几何最终如何被 GPU 画出来
- [[raylib]] —— Raylib 面向游戏和交互图形，FreeCAD 面向工程几何
- [[aframe]] —— A-Frame 可展示 3D 场景，FreeCAD 负责生成可交换的工程模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kicad]] —— KiCad — 电子电路 CAD
- [[librecad]] —— LibreCAD — 2D 工程绘图
