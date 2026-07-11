---
title: OpenSCAD — 脚本式 CAD
来源: 'https://github.com/openscad/openscad'
日期: 2026-05-29
分类: graphics
难度: 初级
---

## 是什么

OpenSCAD 是一个**用代码写 3D 零件**的 CAD 工具。日常类比：普通 CAD 像捏橡皮泥，你用鼠标拖、拉、切；OpenSCAD 像写菜谱，你写清楚“先放一个盒子，再挖一个洞，再把四个柱子放到角上”，电脑按菜谱生成模型。

它不把“画图”当成主要入口，而是把 `.scad` 脚本编译成 STL、3MF、DXF、PNG 等结果。因此它很适合程序员、工程小零件、3D 打印参数化模型。

最小例子：

```scad
wall = 2;
difference() {
  cube([40, 30, 12]);
  translate([wall, wall, wall])
    cube([40 - 2*wall, 30 - 2*wall, 12]);
}
```

这段代码先做一个长方体，再从里面挖掉一个稍小的长方体，得到一个开口盒子。你把 `40` 改成 `60`，整个盒子会重新计算，而不是手动拉一堆面。

## 为什么重要

不理解 OpenSCAD，下面这些事很难解释：

- 为什么 3D 打印社区喜欢把模型做成“可输入参数”的生成器，而不是只发一个固定 STL
- 为什么程序员能用 Git 管理机械模型，像管理代码一样 review 结构变化
- 为什么一个外壳可以批量生成 20 种尺寸，只改变量不重画
- 为什么 CAD 不一定要靠鼠标，布尔运算和函数也能成为建模方式

更直接的价值：

1. **代码即模型**：尺寸、孔位、倒角逻辑都在文本里，便于复用和 diff。
2. **参数化很自然**：一个 `width = 80` 可以影响外壳、盖子、螺丝柱、开孔。
3. **命令行可自动化**：CI 或脚本可以批量导出 STL / PNG，不必人工点菜单。

## 核心要点

OpenSCAD 的思路可以拆成三件事：

1. **用积木搭形状**。`cube()`、`cylinder()`、`sphere()` 是基础积木；`translate()`、`rotate()`、`scale()` 负责搬动和缩放。类比：乐高零件先摆到正确位置，再组合。

2. **用布尔运算做加工**。`union()` 是粘在一起，`difference()` 是拿刀挖掉，`intersection()` 是只保留重叠部分。类比：木工先切料，再钻孔，再把能用的部分留下。

3. **用模块和参数复用设计**。`module standoff(h, d)` 可以定义一个螺丝柱，之后四个角反复调用。类比：先做一个印章，再在需要的位置盖很多次。

这三件事加起来，就是“脚本式 CAD”：你不是直接移动一个面，而是在描述生成这个面的规则。

## 实践案例

### 案例 1：给传感器板做可调外壳

真实场景：Room133 这类自制传感器板需要不同外壳，有的有 OLED，有的有雷达窗口，有的只需要 USB 开孔。OpenSCAD 适合把外壳尺寸、孔位、螺丝柱都写成参数。

```scad
inner = [70, 45, 22];
wall = 2.4;
usb = [12, 7];

module shell() {
  difference() {
    cube(inner + [2*wall, 2*wall, wall]);
    translate([wall, wall, wall])
      cube(inner + [0, 0, 1]);
    translate([30, -1, 9])
      cube([usb[0], wall + 2, usb[1]]);
  }
}

shell();
```

逐部分解释：

- `inner` 是电路板和线材需要的内部空间，换板子时先改它
- `difference()` 的第二个 `cube()` 把盒子掏空
- USB 开孔是一个穿过前壁的小长方体，位置和尺寸都能被参数控制

### 案例 2：给机械件生成标准螺丝孔

真实场景：Thingiverse 上有 OpenSCAD Screw Holes 这类库，专门把 DIN / ISO 螺丝头、沉头孔、通孔封装成模块。你不用每次背 M3 螺丝头多宽，只要调用库函数。

```scad
include <screw_holes.scad>

difference() {
  cube([50, 30, 8], center = true);
  translate([-15, 0, -4])
    screw_hole(DIN965, M3, 12, 6);
  translate([15, 0, -4])
    screw_hole(DIN965, M3, 12, 6);
}
```

逐部分解释：

- 外层 `cube()` 是要打印的连接板
- 两个 `screw_hole()` 是被减掉的负形状，打印后就留下螺丝孔
- `translate()` 控制孔距；孔距变成参数后，同一块板能生成多种版本

### 案例 3：命令行批量导出多个 STL

真实场景：一个模型经常要导出“底座、盖子、整体预览”三种结果。OpenSCAD 支持 `-D` 在命令行覆盖变量，再用 `-o` 导出文件。

```scad
PART = "all"; // [all, base, lid]

module base() { cube([60, 40, 8]); }
module lid()  { translate([0, 0, 10]) cube([60, 40, 3]); }

if (PART == "base") base();
if (PART == "lid") lid();
if (PART == "all") { base(); lid(); }
```

```bash
openscad -D 'PART="base"' -o base.stl box.scad
openscad -D 'PART="lid"'  -o lid.stl box.scad
openscad -D 'PART="all"'  -o preview.png --imgsize 1200,900 box.scad
```

逐部分解释：

- `.scad` 文件只维护一份，导出哪个零件由 `PART` 决定
- `-D` 像临时改配置，不需要复制三份模型文件
- `preview.png` 可以放到 README 或模型发布页，让别人先看效果

## 踩过的坑

1. **变量不能像普通程序一样反复修改**：OpenSCAD 更像公式表，`x = x + 1` 不是循环累加；要用 `for`、列表推导或函数表达关系。
2. **F5 预览不等于 F6 渲染**：预览快但可能有 OpenGL 假象；真正导出 STL 前要完整 render。
3. **差集切面刚好重合会闪烁或失败**：挖洞的负形状要多伸出 `0.01`，给布尔运算留出明确交叠。
4. **导入的 STL 不干净会消失**：非 manifold、零面积面、翻转面会让 CGAL 报错；先用 MeshLab、Blender 或切片软件修复。

## 适用 vs 不适用场景

**适用**：

- 3D 打印小零件：支架、盒子、垫片、治具、齿轮、螺丝孔模板
- 尺寸经常变化的模型：同一设计导出不同长度、孔距、壁厚
- 需要 Git / CI / 命令行自动化的 CAD 流程
- 会写一点代码、愿意用参数表达结构的人

**不适用**：

- 角色、雕塑、曲面美术模型；Blender 这类交互建模更合适
- 强约束草图、装配关系、工程图出图；FreeCAD / Fusion 360 更完整
- 需要边拖边感受形状的探索设计；纯脚本反馈会慢
- 超复杂布尔和高面数模型；完整渲染可能很慢

## 历史小故事（可跳过）

- **2009 年前后**：Marius Kintel 和 Clifford Wolf 推动 OpenSCAD 成形，目标是给程序员一个可脚本化的实体 CAD。
- **2010 年代**：RepRap 和桌面 3D 打印社区扩张，参数化 STL 需求变强，OpenSCAD 逐渐成为常用工具。
- **2019.05 / 2021.01**：稳定版本长期被社区使用，许多教程、库和模型站围绕这些版本写示例。
- **近几年**：BOSL2、NopSCADlib、threads.scad 等库把常见机械结构封装起来，OpenSCAD 更像一个可扩展生态。

## 学到什么

1. **CAD 也可以是程序**：模型不是鼠标操作记录，而是一组可读、可复用、可版本管理的生成规则。
2. **参数化的核心是关系**：写死数字只是脚本；让孔位、外壳、盖子跟着尺寸一起变化，才是设计。
3. **布尔运算是建模的基础语法**：加、减、交三个动作足够做出大量实用零件。
4. **自动化改变 CAD 工作流**：能命令行导出后，模型可以进入 Makefile、CI、发布脚本。

## 延伸阅读

- 项目主页：[openscad/openscad](https://github.com/openscad/openscad)
- 官方文档入口：[OpenSCAD Documentation](https://openscad.org/documentation.html)
- 语法速查：[OpenSCAD Cheat Sheet](https://openscad.org/cheatsheet/index.html)
- 命令行手册：[Using OpenSCAD in a command line environment](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Using_OpenSCAD_in_a_command_line_environment)
- 案例文章：[Room133 project boxes with OpenSCAD](https://selectiveappeal.org/posts/room133-box/)
- 库列表：[OpenSCAD Libraries](https://openscad.org/libraries.html)

## 关联

- [[blender]] —— Blender 偏艺术和动画建模，和 OpenSCAD 的工程脚本路线形成对照
- [[open3d]] —— Open3D 处理点云和几何算法，关注“已有 3D 数据怎么计算”
- [[threejs]] —— Three.js 把 3D 模型放进浏览器展示，常接 STL / glTF 这类产物
- [[picogl]] —— PicoGL 贴近 WebGL 渲染层，解释模型最终如何被画到屏幕上
- [[grbl]] —— GRBL 控制 CNC 机器，和 OpenSCAD 一样把制造流程变成文本指令
- [[nix]] —— Nix 的可复现构建思想，和 OpenSCAD 的“文本生成产物”有相似味道

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kicad]] —— KiCad — 电子电路 CAD
- [[librecad]] —— LibreCAD — 2D 工程绘图
