---
title: Inkscape — 矢量图形编辑器
来源: 'https://github.com/inkscape/inkscape'
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
难度: 初级
---

## 是什么

**Inkscape** 是一款**免费开源**的 2D 矢量图形编辑器，源码托管于 [inkscape/inkscape](https://github.com/inkscape/inkscape)，采用 GPL 许可，跨 Windows / macOS / Linux。它对标 Adobe Illustrator、CorelDRAW 等商业软件，但**原生格式是开放标准 SVG**（Scalable Vector Graphics），而不是私有二进制。

日常类比：如果把 **[[gimp]]** 比作「在像素画布上涂颜料」的 Photoshop，那 Inkscape 更像**用可无限放大的钢笔画图纸**——Logo、图标、流程图、海报排版都画在「数学曲线」上，放大到广告牌尺寸边缘依然锐利；而位图放大只会糊成一团马赛克。再打个比方：位图是拍下来的照片，矢量图是**带坐标的施工蓝图**——改一个圆角半径、换一套配色，改的是公式而不是重新拍照。

Inkscape 1.4.x 是当前稳定线（2024 年 10 月发布 1.4「Geek 版」），强调可定制手柄、Shape Builder 裁切位图、SVG 字体编辑器等。项目口号是 **Draw Freely.**——免费、自由、可审计源码。

## 为什么重要

零基础学图形设计或前端资产管线，绕不开 Inkscape 的几个现实理由：

- **零授权成本**：个人、教育、商业印刷均可免费使用，不像 Illustrator 订阅制
- **SVG 即原生格式**：导出的 `.svg` 可直接进网页（`<img>` / inline SVG）、[[react]] 组件、[[d3]] 可视化，或再导入 [[figma]] / Penpot
- **开放标准**：SVG 是 W3C XML 标准，文件可用文本编辑器打开，利于版本管理与自动化
- **命令行批处理**：`inkscape --actions` 可在 CI 里批量导出 PNG/PDF，适合文档站图标流水线
- **生态与教学**：Wikipedia 大量插图、openclipart.org 素材库、中文社区教程丰富；与 [[blender]]（3D）、[[krita]]（位图绘画）形成开源创作三角

## 核心要点

### 1. 矢量 vs 位图

| 类型 | 存储方式 | 放大 | 典型用途 |
| --- | --- | --- | --- |
| **矢量** | 点、线、贝塞尔曲线、样式属性 | 无限清晰 | Logo、图标、UI、印刷线条稿 |
| **位图** | 像素矩阵 | 放大会锯齿/模糊 | 照片、复杂笔刷、纹理 |

Inkscape 编辑矢量；需要照片底图时可 **File → Import** 嵌入或链接位图，也可用内置 **Potrace** 描摹成路径。

### 2. SVG 文档结构

SVG 本质是 XML。一个最小文档包含 `<svg>` 根元素，内部是 `<rect>`、`<circle>`、`<path>`、`<text>` 等**对象**，颜色与线宽写在 `style` 或属性里：

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#4facfe"/>
      <stop offset="100%" style="stop-color:#00f2fe"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#sky)"/>
  <circle cx="100" cy="100" r="40" fill="#ff6b6b" stroke="#333" stroke-width="3"/>
  <text x="100" y="170" text-anchor="middle" font-size="14" fill="#333">Inkscape</text>
</svg>
```

在 Inkscape 里用 **File → Save As → Plain SVG** 可去掉编辑器私有命名空间，得到更干净的上述结构。`viewBox` 定义坐标系，是响应式图标的关键。

### 3. 路径（Path）与贝塞尔曲线

矢量图形的核心是 **Path**：由节点（node）和手柄（handle）组成的贝塞尔曲线段。Inkscape 提供多种绘制模式：

- **贝塞尔钢笔（B）**：最常用，点一下直线、拖拽出曲线
- **Spiro / B-Spline**：更顺滑的曲线风格
- **铅笔（P）**：手绘感自由线，可自动平滑

选中路径后按 **N** 进入**节点工具**，可移动节点、拉伸手柄、对齐分布。**Path → Stroke to Path** 把描边也变成可编辑的填充区域——做复杂描边 Logo 时常用。

### 4. 形状、布尔运算与 Shape Builder

矩形（R）、椭圆（E）、星形等是**参数化形状**，可随时改圆角、边数。多个路径可做 **Path → Union / Difference / Intersection / Exclusion**（布尔运算），像 CAD 里的切体合并。

Inkscape 1.4 的 **Shape Builder（Shift+F9）** 更进一步：框选区域即可合并或减去路径；若选中位图，还能把路径当**裁剪蒙版**，快速切出图像局部（生成 clipped clone，文件体积小）。

### 5. 填充、描边与样式

每个对象有 **Fill（填充）** 和 **Stroke（描边）**，支持：

- 纯色、线性/径向渐变、网格渐变（mesh gradient）
- 图案填充（内置 130+ 图案）
- 虚线描边、箭头标记（marker）
- 透明度与混合模式

**Edit → Paste Style** 可复制样式而不复制形状。调色板支持 RGB、HSL、CMYK、Color Wheel 等；吸管工具（D）可从画布取色。

### 6. 图层、对象树与编组

**Layer（Shift+Ctrl+L）** 像 Photoshop 图层一样管理复杂度；**Group（Ctrl+G）** 把多个对象绑成一个整体移动缩放。对象在 XML 树里有父子关系——子对象继承父级变换。

**Object → Align and Distribute** 做图标网格对齐；**Raise / Lower** 控制叠放顺序（Z-order）。

### 7. 文本

文本是**可编辑对象**（除非已 **Path → Object to Path**）。支持：

- 任意已安装字体、可变字体
- 字距、行距、沿路径排版、文字放入形状内
- 导出 PDF 时可选保留文字或 **Convert text to paths**

需要可编辑文字时，导出前不要转路径；需要跨平台字体一致时，再转路径或嵌入子集字体。

### 8. Live Path Effects（LPE）

**非破坏性**路径特效：圆角、简化、偏移、虚线包络、可变宽度描边等，像滤镜一样可开关、可堆叠。适合反复调 Logo 圆角而不毁原始节点。

### 9. 扩展（Extensions）

**Extensions** 菜单里是 Python / 脚本插件：批量导出、生成条码、渲染 LaTeX 公式等。用户扩展放在 `~/.config/inkscape/extensions/`。Inkscape 也自带位图描摹（Potrace）、对象散布等。

## 界面与工作流速览

| 区域 | 作用 |
| --- | --- |
| 画布 | 中间绘图区，滚轮缩放，中键拖动画布 |
| 工具栏 | 选择、形状、钢笔、文本、渐变、吸管… |
| 工具控制栏 | 随当前工具变化的参数（圆角、星角数等） |
| 色条 | 快速填充/描边颜色 |
| 对齐与吸附 | 吸附网格、参考线、对象边缘 |

**零基础 10 分钟流程**：新建 A4 文档 → 矩形工具画底板 → 钢笔勾主体 → 填色+描边 → Align 居中 → **File → Export PNG** 导出位图预览。

## 实践案例

### 案例 1：命令行批量导出 PNG（CI / 脚本友好）

Inkscape 1.x 推荐用 **`--actions`** 链式处理，配合 **`--batch-process`** 无 GUI 退出：

```bash
# 将 logo.svg 导出为 512×512 PNG，背景透明
inkscape logo.svg \
  --batch-process \
  --actions="export-type:png;export-filename:logo-512.png;export-width:512;export-height:512;export-do"

# 只导出 id 为 icon-main 的对象，并裁切到该对象边界
inkscape icons.svg \
  --batch-process \
  --actions="export-id:icon-main;export-id-only;export-type:png;export-filename:icon-main.png;export-area-snap;export-do"

# 同一文件导出 PDF + 纯 SVG（去掉 inkscape: 私有属性）
inkscape doc.svg \
  --batch-process \
  --actions="export-type:pdf;export-filename:doc.pdf;export-do;export-plain-svg;export-filename:doc-plain.svg;export-do"
```

**要点**：`export-do` 触发一次导出；多条 action 用分号分隔。GUI 里导出过的对象会记住 DPI/文件名 hint，配合 `export-use-hints` 可复现。

### 案例 2：Shell 模式串联多文件

适合本地批处理 dozens of SVG：

```bash
inkscape --shell <<'EOF'
file-open:assets/banner.svg
export-type:png
export-filename:dist/banner.png
export-width:1200
export-do
file-open:assets/badge.svg
export-type:png
export-filename:dist/badge.png
export-height:256
export-do
EOF
```

每行一条 action；`file-open` 切换文档后再 `export-do`。

### 案例 3：用 XML 编辑器理解对象 id

**Edit → XML Editor** 可实时查看 DOM 树。给对象设 **id**（如 `logo-mark`）后，命令行可 `--export-id=logo-mark` 单独导出，也方便网页里 `<use href="#logo-mark">` 引用符号。

### 案例 4：布尔运算做镂空图标

1. 画外圆 + 内圆，选中两者  
2. **Path → Difference** 得圆环  
3. **Object → Fill and Stroke** 设纯色或渐变  
4. **File → Save As → Optimized SVG** 给前端用  

### 案例 5：位图描摹成矢量

导入黑白 Logo PNG → 选中 → **Path → Trace Bitmap** → 调阈值 → **OK** 生成路径 → 删除原图。彩色图可用多色描摹，但复杂照片更适合留在 [[gimp]] 处理。

## 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `S` | 选择/变换工具 |
| `R` / `E` / `*` | 矩形 / 椭圆 / 星形 |
| `B` / `P` / `N` | 钢笔 / 铅笔 / 节点编辑 |
| `T` | 文本 |
| `Ctrl+D` | 复制对象 |
| `Ctrl+Shift+G` | 取消编组 |
| `Ctrl+G` | 编组 |
| `Ctrl+Shift+R` | 显示/隐藏画布边界 |
| `Ctrl+Shift+E` | 导出 PNG 对话框 |
| `Alt+拖动` | 微移（高精度） |

Inkscape 强调**键盘可达性**：几乎所有菜单操作都有快捷键，熟练后比纯鼠标快很多。

## 导入与导出格式

| 方向 | 常见格式 |
| --- | --- |
| 导入 | SVG, PDF, EPS, AI（≥9）, PNG/JPG/GIF, CDR, VSD |
| 导出 | SVG, PNG, PDF, EPS, PS, DXF, EMF/WMF, LaTeX+PDF 组合 |

网页用 **Plain SVG** 或 SVGO 压缩；印刷交 **PDF**；与 CAD 交换用 **DXF**。PostScript 不支持透明，透明对象会被栅格化。

## 踩过的坑

1. **忘记设文档尺寸**：默认 A4，做图标应 **File → Document Properties** 改成 24×24 或 512×512，并勾选「Resize page to drawing」再导出。  
2. **文本转路径后无法改字**：交付印刷稿前再转路径；给开发留可编辑 SVG。  
3. **渐变在 PDF 里发灰**：检查 CMYK 导出配置与透明度叠印设置。  
4. **克隆（Clone）与符号**：改原对象会影响所有克隆；unlink 后才独立。  
5. **0.92 前后 DPI 差异**：老文件打开时 Inkscape 会自动缩放；批处理用 `--convert-dpi-method` 控制行为。  
6. **过滤器导出 EPS**：模糊等滤镜默认栅格化，矢量交付用 `--export-ignore-filters` 或简化效果。

## 适用 vs 不适用场景

**适用**：

- Logo、图标、UI 资产、技术插图、流程图
- 需要 SVG 进 Web / 文档 / [[docusaurus]] 站点的矢量源文件
- 开源流水线批量出 PNG/PDF
- 学习贝塞尔曲线与排版基础

**不适用**：

- 照片修图、厚涂绘画（用 [[krita]] / GIMP）
- 多页杂志级排版（考虑 Scribus / InDesign）
- 3D 建模与渲染（用 [[blender]]）
- 需要团队协作设计系统实时评论（考虑 Penpot / Figma，可互导 SVG）

## 与邻居项目对照

| 项目 | 维度 | 关系 |
| --- | --- | --- |
| [[gimp]] | 位图 | 修照片、纹理；Inkscape 描摹后接矢量 |
| [[krita]] | 绘画 | 插画笔触；线稿可导出 SVG 精修 |
| [[blender]] | 3D | Grease Pencil / 曲线可导出 SVG |
| [[d3]] | 代码生成 SVG | Inkscape 手绘补 D3 做不好的有机形状 |
| [[godot]] | 游戏 UI | 图标 SVG 导入引擎 |

## 学到什么

- **矢量思维**：先想对象与关系，再想像素——缩放与改版成本骤降。  
- **SVG 是 lingua franca**：设计、前端、自动化共用同一套 XML，比私有 `.ai` 更适合工程化。  
- **GUI + CLI 双轨**：设计师用界面，工程师用 `--actions` 接 CI，同一 `.svg` 源文件。  
- **非破坏性习惯**：多用 LPE、克隆、图层，少过早 **Object to Path**，保留回头路。

## 延伸资源

- 官方功能列表：[inkscape.org/about/features](https://inkscape.org/about/features/)
- 内置教程：**Help → Tutorials → Basic / Advanced**
- 命令行手册：`inkscape --help`，`inkscape --action-list`
- 社区画廊与文档：[inkscape.org/learn](https://inkscape.org/learn/)
