---
title: OpenSCAD — 脚本式 CAD
来源: https://github.com/openscad/openscad
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 初级
---

## 是什么

**OpenSCAD** 是一款**免费开源**的脚本式 3D CAD 建模器，源码托管于 [openscad/openscad](https://github.com/openscad/openscad)。名字里的 **S** 代表 **Scriptable**——你用一段 `.scad` 脚本描述几何体如何生成，程序再把它**编译**成可导出的 3D 网格（STL / 3MF / AMF / OFF 等），交给切片软件或 CNC 后处理。

日常类比：传统 CAD（如 Fusion 360、SolidWorks）像**在 Clay 工作室里徒手捏泥**——鼠标拖面、拉边、加约束，每一步都落在可视化的特征树上。OpenSCAD 则像**写菜谱**：先声明「一块 20×10×2 的豆腐（`cube`）」，再写「中间挖一个半径 3 的圆洞（`difference` + `cylinder`）」，最后「整盘端上桌（`render`）」。改尺寸不用回去找某条草图约束，改一行变量 `plate_w = 30` 全文联动——这就是**参数化设计**。

再打个比方：如果把 [[blender]] 看作「拍电影」的综合制片厂，OpenSCAD 更像**精密机械车间里的数控机床程序**——不追求有机曲面雕刻和动画，专攻**可重复、可版本管理、可 diff 的实体零件**：支架、齿轮盒、连接器外壳、3D 打印治具。Maker 社区里大量 Thingiverse / Printables 模型附带 `.scad` 源文件，改几个参数就能适配你的打印机或螺丝规格。

最小可运行脚本：

```scad
// 一个 10mm 立方体，默认落在原点附近
cube(10);
```

保存为 `hello.scad`，按 **F5** 预览（CGAL 快速预览）或 **F6** 完整渲染（CGAL / Manifold 内核），右侧即出现实体。没有「画一条线」的交互——**代码即模型**。

## 为什么重要

零基础学「能打印出来的 3D」，OpenSCAD 有几个独特价值：

- **程序员友好**：语法接近 C；模型是文本，可 `git diff`、Code Review、CI 里批量导出 STL
- **参数化一等公民**：外壳厚度、孔距、螺纹规格写成变量或 `module` 参数，改一处全局生效
- **CSG 思维清晰**：`union` / `difference` / `intersection` 组合 primitive，逻辑比「特征树回溯」直观
- **3D 打印生态默认选项之一**：与 [[freecad]]、Fusion 并列；BOSL2、Round-Anything 等库把常见机械特征封装成模块
- **零订阅、跨平台**：GPLv2，Windows / macOS / Linux；也可无头调用 `openscad -o part.stl part.scad`

代价也要心里有数：**不适合**角色雕刻、复杂 NURBS 曲面、装配体运动仿真；曲面质量由 `$fn` 多边形逼近控制，需要你自己管网格精度。

## 核心要点

### 1. 构造实体几何（CSG）

OpenSCAD 用 **Constructive Solid Geometry** 从简单实体「布尔运算」出复杂形状：

| 运算 | 含义 | 日常类比 |
| --- | --- | --- |
| `union()` | 合并为一体 | 把两块乐高扣在一起 |
| `difference()` | 第一个减去后面的 | 饼干模具压出形状 |
| `intersection()` | 只保留重叠部分 | 两个模具叠在一起，只留交集 |

**第一个子物体**在 `difference()` 里是「被挖的母体」；后面全是「钻头」。`union()` 可省略——相邻写多个 primitive 默认就是 union。

### 2. 三维原语（Primitives）

| 模块 | 典型参数 | 说明 |
| --- | --- | --- |
| `cube([x,y,z], center=)` | 边长或三轴尺寸 | `cube(10)` = 各边 10 的正方体 |
| `sphere(r=)` / `sphere(d=)` | 半径或直径 | 球体，实际是多面体逼近 |
| `cylinder(h=, r=, center=)` | 高、半径 | 圆柱；`h` 沿 Z |
| `polyhedron(points, faces)` | 点表、面索引 | 低层自定义网格 |

二维原语 `circle`、`square`、`polygon` 常配合 `linear_extrude()` / `rotate_extrude()` 拉成 3D。

### 3. 变换（Transformations）

变换是**修饰符**：作用于紧跟其后的一个模块或 `{ ... }` 块，本身不以分号结尾。

```scad
translate([10, 0, 0])   // 沿 X 平移 10
rotate([0, 90, 0])      // 绕 Y 轴转 90°
scale([1, 1, 2])        // Z 方向拉伸 2 倍
```

坐标系：**右手系**，X 右、Y 前（指向你）、Z 上。单位默认**毫米**（可在 Preferences 改）。

### 4. 变量与不可变语义

```scad
width = 20;
width = 30;   // 同一作用域内「后者覆盖前者」，不是命令式赋值
echo(width);  // 输出 30
```

OpenSCAD 变量更像**数学里的常量绑定**：在单次求值（一次 F6 渲染）中，名字对应一个值。想「循环里递增」要用 `for` 或递归函数，不能 `i = i + 1`。

特殊变量：`$fn`（圆周分段数）、`$fa`（最小面角）、`$fs`（最小边长）控制曲面网格密度。预览可 `$fn = 24`，导出前 `$fn = 64` 或更高。

### 5. 模块（module）与函数（function）

- **`function`**：算值、返回向量/数字，**不产生几何**
- **`module`**：打包几何，可重复实例化，类似「自定义积木」

```scad
function inch(mm) = mm / 25.4;

module rounded_plate(w, d, h, r) {
    minkowski() {
        cube([w - 2*r, d - 2*r, h - r], center = true);
        cylinder(r = r, h = r, center = true);
    }
}
```

`children()` 让模块当「运算符」处理子几何——高级库常用。

### 6. 控制流

- `for (i = [0:5])` / `for (x = [0, 10, 20])` 阵列复制
- `if (condition) { ... } else { ... }` 条件几何
- 列表推导：`[for (i = [0:3]) i * 10]` → `[0, 10, 20, 30]`

### 7. 2D → 3D 挤出

```scad
linear_extrude(height = 10, center = true)
    circle(d = 20);

rotate_extrude(angle = 360)
    translate([30, 0, 0])
        circle(r = 5);   // 甜甜圈（torus）
```

`import("profile.dxf")` 可导入外部 2D 轮廓再挤出——与 [[inkscape]] 导出的 DXF 可协作。

### 8. 渲染与导出

| 按键 / 命令 | 作用 |
| --- | --- |
| **F5** | 预览（快，可能不精确） |
| **F6** | 完整 CGAL/Manifold 渲染 |
| `render()` | 强制求值 CSG 树，减少预览差异 |
| CLI | `openscad -o out.stl model.scad` |

2024 年起 **Manifold** 内核显著加快布尔运算，复杂 `difference` 不再等到天荒地老。

## 实践案例

### 案例 1：带圆角的安装板（CSG 入门）

在一块板上打四个角孔，中心沉头座——典型 3D 打印支架逻辑：

```scad
$fn = 48;

plate_w = 60;
plate_d = 40;
plate_h = 3;
hole_d = 3.2;       // M3 通孔略大于 3.0
corner_r = 5;
inset = 8;

difference() {
    // 母体：圆角矩形板（minkowski 近似圆角）
    minkowski() {
        cube([plate_w - 2*corner_r, plate_d - 2*corner_r, plate_h], center = true);
        cylinder(r = corner_r, h = 0.01, center = true);
    }

    // 四角通孔
    for (dx = [-1, 1], dy = [-1, 1]) {
        translate([
            dx * (plate_w/2 - inset),
            dy * (plate_d/2 - inset),
            0
        ])
            cylinder(d = hole_d, h = plate_h + 2, center = true);
    }

    // 顶面浅沉台（示意）
    translate([0, 0, plate_h/2 - 0.5])
        cylinder(d = 12, h = 1.1, center = true);
}
```

**读懂这段代码**：

- `difference()` 第一子节点是「板」；后面所有 `cylinder` 都从板里**减掉**
- `for (dx = [-1, 1], dy = [-1, 1])` 双重循环 = 四个象限各打一个孔，不用复制粘贴四段
- `h = plate_h + 2` 让钻头比板厚一点，避免「挖不透」的渲染瑕疵
- 改 `plate_w` / `hole_d` 即可适配不同打印机或螺丝——参数化价值在这里

### 案例 2：参数化齿轮盒模块（`module` + 条件）

把「盒子 + 可选盒盖」封装成可复用模块：

```scad
$fn = 64;

module box_with_lid(outer, inner, height, wall, lip = 2, add_lid = true) {
    // 外盒：外形减去内腔
    difference() {
        cube(outer, center = true);
        translate([0, 0, wall])
            cube([inner[0], inner[1], height], center = true);
    }

    // 顶部凸唇（与盒盖干涉配合）
    translate([0, 0, height/2])
        difference() {
            cube([outer[0], outer[1], lip], center = true);
            translate([0, 0, lip/2])
                cube([inner[0], inner[1], lip + 0.1], center = true);
        }

    if (add_lid) {
        translate([0, 0, height/2 + lip + 2])
            difference() {
                cube([outer[0], outer[1], wall], center = true);
                translate([0, 0, -0.05])
                    cube([inner[0] + 0.4, inner[1] + 0.4, wall + 0.1], center = true);
            }
    }
}

box_with_lid(
    outer = [50, 40, 30],
    inner = [46, 36, 25],
    height = 25,
    wall = 2,
    add_lid = true
);
```

**要点**：

- `module` 参数带默认值 `lip = 2`、`add_lid = true`，调用时可只改关心的量
- `if (add_lid)` 根据布尔参数决定是否生成盒盖——同一脚本预览「有盖 / 无盖」
- `inner[0] + 0.4` 留 0.2mm 单边间隙，FDM 打印常见的配合公差（需按材料微调）

### 案例 3：命令行批量导出

文档站或 CI 里从同一 `.scad` 出多个规格：

```bash
openscad -D 'plate_w=80' -D 'plate_d=50' -o bracket_80x50.stl bracket.scad
openscad -D 'plate_w=100' -o bracket_100x40.stl bracket.scad
```

`-D` 在命令行覆盖变量，适合矩阵测试孔距或批量生成 SKU。

## 与相近工具怎么选

| 场景 | 更合适的工具 |
| --- | --- |
| 参数化支架、治具、盒体 | **OpenSCAD** |
| 有机造型、雕刻、动画 | [[blender]] |
| 全功能机械 CAD + 草图约束 | [[freecad]]、Fusion 360 |
| 2D 激光切割路径 | [[inkscape]] → DXF → OpenSCAD `import` |

OpenSCAD 常与 **BOSL2**（螺栓库、圆角、壳体）、**dotSCAD** 等库搭配；学习路径：官方 Cheat Sheet → Advent Calendar 2024 教程仓库 → 读 Thingiverse 上带 `.scad` 的模型反推。

## 常见坑

1. **预览与渲染不一致**：复杂 `difference` 用 F6 / `render()` 再导出
2. **`$fn` 太低**：圆柱看起来像八边形；导出前提高 `$fn` 或设 `$fa` / `$fs`
3. **非流形（non-manifold）**：两的面共面、零厚度边会导致 STL 切片失败——保证实体有体积，孔要穿透
4. **变量当循环计数器**：OpenSCAD 不是 Python；用 `for` 枚举
5. **单位混乱**：团队项目开头注释 `// units: mm`

## 延伸

- 官方文档与 Cheat Sheet：[openscad.org/documentation](https://openscad.org/documentation.html)
- 用户手册（CSG、变换、模块）：[OpenSCAD User Manual](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual)
- 下游：PrusaSlicer、Cura、Bambu Studio 切片；OctoPrint 远程打印
- 相关笔记：[[blender]]、[[freecad]]、[[inkscape]]、[[buildroot]]（嵌入式外壳常与 3D 打印件配合）

---

*学习路径建议：先手写「立方体 + 差集挖孔」→ 加 `for` 阵列 → 抽 `module` → 读一个开源 `.scad` 分模块改参数 → 再考虑 BOSL2。每天 30 分钟，一周可独立改打印件尺寸。*
