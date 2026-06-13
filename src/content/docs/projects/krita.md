---
title: Krita — 数字绘画专业编辑器
来源: 'https://github.com/KDE/krita'
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
难度: 初级
---

## 是什么

**Krita** 是 KDE 社区维护的**免费开源数字绘画与 2D 动画软件**，源码托管于 [KDE/krita](https://github.com/KDE/krita)，采用 GPL 许可，跨 Windows / macOS / Linux。它面向插画师、概念艺术家、漫画作者和纹理画师——**笔刷手感、图层与蒙版、色彩管理**是核心，而不是像 [[inkscape]] 那样以矢量曲线为主，也不像 [[gimp]] 那样偏通用图像修图。

日常类比：如果把 Photoshop 比作「带滤镜的照相馆暗房」，Krita 更像**专门为手绘而生的专业画架工作室**——画布永远铺好、颜料管（笔刷引擎）按插画习惯排列、旁边还有动画时间轴可以翻页看分镜。你叠透明硫酸纸（图层）画线稿、上色、加特效，随时掀开某一层改细节，底下的线稿不用重画。再打个比方：位图绘画是在**像素网格上堆颜色**，Krita 帮你管的是「哪一层、用什么笔、什么混合模式、什么色域」——让你专注画，而不是和文件格式搏斗。

Krita 5.x 是当前稳定线，内置 100+ 专业笔刷、9 种笔刷引擎、矢量文字/对话框工具（SVG）、完整 2D 动画工作区，以及基于 **Python 3 + PyQt** 的脚本与插件 API（libkis / PyKrita）。

## 为什么重要

零基础学数字绘画或游戏/动画资产管线，绕不开 Krita 的几个现实理由：

- **零授权成本**：个人、教育、商业插画均可免费使用，无订阅、无分成
- **为绘画优化**：笔刷稳定器（防抖）、画布旋转、Wrap-around 无缝平铺、漫画分格矢量库——这些是通用修图软件后加的功能，Krita 从第一天就为画师设计
- **开放格式**：原生 `.kra` 基于 ZIP + XML，图层结构可脚本读写；可导出 PNG、JPEG、PSD、TIFF、WebP、PDF、动画序列
- **与开源创作三角配合**：[[inkscape]] 做矢量 Logo → Krita 上色与纹理 → [[blender]] 贴图与渲染，全程可脚本批处理
- **Python 一等公民**：批量导出、自定义面板、程序化笔触（Painting API）可在 Scripter 或 kritarunner 里跑

## 核心要点

### 1. 文档、图像与节点（Document / Image / Node）

Krita 内部区分 **Document（文档）** 和 **Image（图像）**：文档知道文件名、色域配置；图像管图层树。脚本 API 里图层和蒙版统一叫 **Node**——可以是 `paintlayer`、`grouplayer`、`vectorlayer`、`filterlayer`、`clonelayer`，或 `filtermask`、`transformmask`、`transparencymask` 等蒙版。

类比：Document 是**文件夹封面上的标签**，Image 是**文件夹里那叠透明纸**，Node 是每一张纸或贴在纸上的便利贴（蒙版）。

### 2. 图层栈（Layer Stack）

图层像一叠**可裁剪的透明纸**：上面的色块挡住下面，也可以设混合模式让颜色「透」下去。Krita 支持：

| 类型 | 作用 |
| --- | --- |
| **Paint Layer** | 主绘画层，笔刷直接画上去 |
| **Group Layer** | 把多层打组，整组移动/变换/加蒙版 |
| **Vector Layer** | SVG 矢量对象，漫画对话框、文字 |
| **File Layer** | 链接外部图片，源文件更新可刷新 |
| **Filter Layer / Filter Mask** | 非破坏性滤镜（模糊、色阶等） |
| **Clone Layer** | 克隆另一层内容，改源层同步 |

**Alpha 继承（Alpha Inheritance）**：子层只在上层已有像素范围内作画，上色时不溢出线稿——线稿一层、上色一层是漫画工作流标配。

### 3. 笔刷引擎（Brush Engines）

Krita 不是「一种笔刷走天下」，而是 **9+ 种笔刷引擎**，每种引擎有独立参数：

- **Pixel** — 基础圆笔、纹理笔
- **Color Smudge** — 混色、涂抹，模拟油画边缘
- **Shape** — 按形状散布（叶、草、星点）
- **Particle** — 粒子飞溅
- **Filter** — 笔划即滤镜效果

笔刷可打标签（tag）管理，**稳定器（Stabilizer）** 三种模式平滑手抖线条；**Dynamic Brush** 可设质量、拖拽感。Favorites 与 **Brush Presets** 面板相当于画师自己的「笔袋」。

### 4. 色彩管理与色域

专业绘画必须理解 **Color Model / Depth / Profile**：

- 常见组合：`RGBA` + `U8`（8 位/通道）用于屏幕稿；`F32` 浮点用于 HDR 或重度调色
- **sRGB** 适合网页与多数显示器；**线性 RGB** 适合与 [[blender]] 等 3D 管线对接
- 文档创建时选错 profile，导出到印刷或游戏引擎可能出现**偏色**——Krita 在新建对话框和 **Image → Convert Image Color Space** 里都可改

### 5. 选区、变换与辅助视图

- **选区（Selection）** 可存为 **Selection Mask**，非破坏性修改
- **Transform Mask** 对图层做非破坏性缩放/旋转
- **Canvas Only Mode（Tab）** 隐藏 UI 全屏画
- **Rotate Canvas（Shift+Space 拖拽）** 旋转的是「画板角度」，不是图层内容——手腕舒服比扭脖子重要

### 6. 动画工作区（Animation Workspace）

切换到动画布局后，时间轴支持：

- 多图层动画、导入音频、洋葱皮（Onion Skin）
- 数千帧时间轴、帧拖拽、位置/透明度补间
- 导出为视频或 PNG 序列，继续进 [[blender]] 合成或视频软件

### 7. 资源与 .kra 文件

`.kra` 本质是 **ZIP 包**：XML 描述图层树，子目录存像素块、缩略图、嵌入资源。Settings → Manage Resources → **Open Resources Folder** 可看到笔刷、预设、Python 插件目录（`pykrita`）。**Workspace** 可保存面板布局与快捷键，换机器恢复习惯。

### 8. Python 脚本与插件

Krita 通过 **libkis** 把 C++ 内核包装成 QObject，暴露给 **Python 3**（菜单 **Tools → Scripts → Scripter**）。入口单例：

```python
from krita import Krita

krita = Krita.instance()           # 也可写 Application / Scripter 内置别名
doc = krita.activeDocument()
node = doc.activeNode()
print(krita.version(), doc.name(), node.name())
```

**Autostart 插件**：在资源目录 `pykrita/插件名/插件名.desktop` + `插件名.py` 注册，启动时加载。**Batchmode** 关闭导出对话框，适合无人值守批处理。

## 界面与工作流速览

| 区域 | 作用 |
| --- | --- |
| 画布 | 中间绘画区，滚轮缩放，Space+左键平移 |
| 工具栏 | 笔刷、橡皮、渐变、填充、形状、文字 |
| 工具选项 | 笔刷大小、不透明度、混合模式、稳定器 |
| 图层 docker | 图层栈、混合模式、不透明度、Alpha 继承 |
| 色环 / 色板 | 前景/背景色，Palette 可存项目配色 |

**零基础 15 分钟流程**：File → New → 选 3000×2000 RGBA → 新建矢量层勾线稿（或导入扫描稿）→ 新建 Paint Layer 勾 **Alpha Inheritance** 上色 → 加 Group 分「线稿/色块/高光」→ Export 为 PNG。

## 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `B` | 笔刷工具 |
| `E` | 橡皮（或笔刷预设里切换 Eraser） |
| `G` | 渐变 / 填充（取决于当前子工具） |
| `M` | 选区工具 |
| `T` | 变换工具 |
| `F5` | 打开笔刷编辑器 |
| `Tab` | 画布独占模式（隐藏 UI） |
| `Space` + 左键拖拽 | 平移画布 |
| `Shift` + `Space` + 拖拽 | 旋转画布（不改图层内容） |
| `Ctrl+T` | 自由变换当前层/选区 |
| `Ctrl+Shift+N` | 新建图层 |
| `Ctrl+G` | 图层打组 |
| `Ctrl+E` | 向下合并图层 |
| `Ctrl+Shift+E` | 合并可见图层 |
| `Ctrl+Alt+U` | 显示/隐藏选区蚂蚁线 |
| `Ctrl+Shift+S` | 导出（Export As） |

Krita 几乎所有菜单项都可在 **Settings → Configure Krita → Keyboard Shortcuts** 里改；画师常把「旋转画布」「切换上一笔刷」绑到侧键。

## 实践案例

### 案例 1：用 Python 创建文档与分层结构

在 **Scripter** 中运行（或保存为 `pykrita` 插件），程序化搭建「线稿组 + 上色组」：

```python
from krita import Krita

krita = Krita.instance()
krita.setBatchmode(True)  # 批处理：不弹保存/导出对话框

# 创建 2480×3508 A4 @300dpi 文档（RGBA 8-bit，sRGB）
doc = krita.createDocument(
    2480, 3508, "comic-page",
    "RGBA", "U8", "sRGB built-in", 300.0
)
krita.setActiveDocument(doc)

root = doc.rootNode()

# 组：Lineart
lineart_group = doc.createNode("Lineart", "grouplayer")
# 组：Color
color_group = doc.createNode("Color", "grouplayer")

# 线稿 paint layer
sketch = doc.createNode("Pencil", "paintlayer")
# 平涂层，开启 alpha 继承（仅在有像素处上色）
flat = doc.createNode("Flat Colors", "paintlayer")
flat.setAlphaLocked(True)  # 与 GUI 中 Alpha inheritance 同类用途

# 先组装子树，再挂到 root（推荐顺序）
lineart_group.addChildNode(sketch, None)
color_group.addChildNode(flat, None)
root.addChildNode(lineart_group, None)
root.addChildNode(color_group, lineart_group)

doc.refreshProjection()
print("Created:", doc.name(), "nodes:", [n.name() for n in root.childNodes()])
```

**要点**：`createNode(name, type)` 的 `type` 字符串必须小写，如 `paintlayer`、`grouplayer`。子节点先 `addChildNode` 到组，再把组挂到 `rootNode()`。改动画布后调用 `refreshProjection()` 刷新视图。

### 案例 2：批量导出 PNG（命令行 + 脚本）

**无 GUI 转换**（适合 CI / 文件夹批处理，Krita 3.3+ 全平台）：

```bash
# 单文件：KRA → PNG
krita painting.kra --export --export-filename painting.png

# PNG → JPEG
krita sketch.png --export --export-filename sketch.jpg

# 动画：KRA 导出 PNG 序列（文件名模板）
krita anim.kra --export-sequence --export-filename frame_{sequence}.png
```

**脚本内静默导出**（跳过 PNG 选项对话框，可设压缩级别）：

```python
from krita import *

doc = Krita.instance().activeDocument()
doc.setBatchmode(True)

opts = InfoObject()
opts.setProperty("compression", 5)       # 0–9
opts.setProperty("alpha", True)
opts.setProperty("forceSRGB", True)
opts.setProperty("interlaced", False)

path = "/tmp/export.png"
ok = doc.exportImage(path, opts)
doc.refreshProjection()
print("exported:", ok, path)
```

游戏资产管线里常见做法：在 Krita 图层名写导出元数据（如 GDQuest **Batch Exporter** 插件的 `e=png s=50,100`），一键导出多分辨率精灵图。

### 案例 3：Painting API 程序化笔触（Krita 5.2+）

对可绘画的 Node 可直接画几何（需确认 `node.paintAbility()`）：

```python
from krita import *
from PyQt5.QtCore import QPoint, QPointF, QRectF
from PyQt5.QtGui import QPainterPath

doc = Krita.instance().activeDocument()
layer = doc.activeNode()

if not layer or not layer.paintable():
    raise RuntimeError("当前层不可绘画")

# 直线
layer.paintLine(QPoint(0, 0), QPoint(900, 700))

# 矩形与椭圆
layer.paintRectangle(QRectF(100, 100, 500, 200))
layer.paintEllipse(QRectF(400, 100, 200, 600))

# 多边形
pts = [QPointF(20, 20), QPointF(120, 820), QPointF(920, 120)]
layer.paintPolygon(pts)

# 沿文字轮廓「写字」
path = QPainterPath()
font = qApp.font()
font.setPointSize(48)
path.addText(QPointF(50, 50), font, "Krita")
layer.paintPath(path)

doc.refreshProjection()
```

适合生成纹理、水印、程序化分格辅助线；真实插画仍以数位笔 + 笔刷引擎为主。

### 案例 4：kritarunner 无人值守批处理

GUI 已打开时 **kritarunner 与 Krita 主进程冲突**；简单格式转换优先用 `krita --export`。复杂流水线可写 `pykrita` 模块，用 kritarunner 调用 `__main__`：

```bash
# 模块放在资源目录 pykrita/my_batch/ 下，含 __init__.py
kritarunner -s my_batch -f __main__ /path/to/input.kra /path/to/out.png
```

模块内典型骨架：

```python
from krita import Krita, InfoObject

def __main__(args):
    krita = Krita.instance()
    krita.setBatchmode(True)
    src, dst = args[0], args[1]
    doc = krita.openDocument(src)
    krita.setActiveDocument(doc)
    doc.setBatchmode(True)
    opts = InfoObject()
    opts.setProperty("compression", 6)
    doc.exportImage(dst, opts)
    doc.close()
    return 0
```

Unix 上 kritarunner 仍可能依赖 X11/Wayland 做字体渲染；Docker/CI 里优先 **`krita file.kra --export --export-filename out.png`**，失败再考虑虚拟 framebuffer。

## 与相近工具对比

| 工具 | 定位 | 与 Krita 的关系 |
| --- | --- | --- |
| **[[inkscape]]** | 矢量 SVG | Logo/对话框用 Inkscape，上色纹理用 Krita |
| **[[gimp]]** | 通用位图修图 | GIMP 插件生态偏摄影；Krita 笔刷与动画更贴绘画 |
| **[[blender]]** | 3D + Grease Pencil | Krita 出 2D 概念稿与贴图，Blender 做 3D 与合成 |
| **Clip Studio Paint** | 商业漫画 | 功能重叠，CSP 动画与素材库强；Krita 开源免费 |
| **Photoshop** | 行业标准 | PSD 可互导；Krita 无 CMYK 印刷完整链，偏数字原画 |

## 适用 vs 不适用场景

**适用**：

- 插画、概念设计、漫画上色、游戏/3D 纹理绘制
- 需要压感笔刷、混色、图层蒙版非破坏性工作流
- 2D 逐帧动画、GIF/序列帧导出
- 开源预算、跨平台、可脚本批处理 `.kra` / PSD
- 与 [[inkscape]] 线稿 + Krita 上色 + [[blender]] 贴图的开源管线

**不适用**：

- 照片 RAW 批量修图、专业排版印刷（CMYK 链弱于 InDesign/Photoshop）
- 纯矢量 UI 图标（用 [[inkscape]] 或 Figma）
- 3D 建模与渲染（用 [[blender]]）
- 需要 Adobe 全家桶协作的已有企业工作流（可互导 PSD，但插件生态不同）

## 踩过的坑

1. **新建文档色域选错**：网页稿用 sRGB；对接 3D 或合成时考虑线性 RGB，否则高光/shadow 在引擎里「发灰」。  
2. **忘记 Alpha 继承**：平涂溢出线稿，要么开继承，要么用选区「锁定透明像素」。  
3. **合并过早**：线稿与上色合并后无法单独改线宽；用组 + 蒙版保留回头路。  
4. **`.kra` 体积爆炸**：隐藏层仍占空间；File Layer 链外部 8K 图会拖慢保存。  
5. **PSD 往返丢效果**：部分 PS 专有调整层/智能对象 Krita 只能栅格化导入。  
6. **动画导出帧率**：时间轴 FPS 与导出视频 FPS 不一致会导致播放速度错；导出前核对 **Render Animation** 对话框。  
7. **脚本改像素不刷新**：改 node 或 `exportImage` 后记得 `doc.refreshProjection()`，否则画布预览滞后。

## 常见问题

**Q：Krita 适合修照片吗？**  
A：基础裁剪、色阶、滤镜可以，但批量 RAW、抠图插件生态不如 GIMP/Lightroom。它是**绘画优先**。

**Q：平板压感不工作？**  
A：检查系统驱动（WinTab / Windows Ink）、Krita **Settings → Configure Krita → Tablet**，尝试切换 API。Linux 上部分数位板需 libwacom 规则。

**Q：文件很大、卡顿？**  
A：合并可见层、降低分辨率工作、用 **Instant Preview**；动画时间轴可开 **drop-frame** 预览。`.kra` 过大时检查是否嵌入了高分辨率 **File Layer** 或未清理隐藏层。

**Q：脚本在 Scripter 里能跑，kritarunner 报错？**  
A：Headless 环境可能缺字体/X11；简单格式转换优先用 `krita --export`。复杂脚本用 **batchmode** + 已打开的 GUI 实例，或查 KDE 文档中的 **kritarunner** 说明。

**Q：和 Photoshop 笔刷兼容吗？**  
A：部分 `.abr` 可导入为图像笔刷；专有 PS 动态笔刷无法 1:1 还原。社区有大量 `.kpp` Krita 预设可下载。

## 学习路径建议

1. **第一天**：熟悉画布导航（缩放、旋转、Wrap）、默认笔刷与橡皮、撤销栈（`Ctrl+Z` / `Ctrl+Shift+Z`）
2. **第一周**：图层组 + Alpha 继承上色；尝试 Color Smudge 与纹理笔刷；保存 Workspace
3. **第二周**：矢量层画对话框；Filter Mask 试调整色；Export 多分辨率 PNG
4. **进阶**：动画工作区做循环 GIF；写 Python 批量导出；配合 [[blender]] / 游戏引擎测贴图

## 学到什么

- **图层思维**：把「线稿 / 平涂 / 光影 / 特效」拆层，比单画布重画便宜一个数量级。  
- **笔刷是参数集合**：引擎 + 纹理 + 压感曲线 = 风格；预设可分享、可脚本化。  
- **色彩是管线问题**：同一幅画在 sRGB 屏、线性贴图、印刷 CMYK 里长相不同，新建文档时就要想清楚终点。  
- **GUI 与脚本双轨**：画师用界面，技术美术用 `krita --export` / PyKrita 接 CI，同一 `.kra` 源文件。  
- **开源绘画三角**：[[inkscape]] 矢量 + Krita 位图 + [[blender]] 3D，全链路可审计、无订阅。

## 延伸阅读

- 官方功能页：[krita.org/en/features](https://krita.org/en/features/)
- 用户手册（图层与蒙版）：[docs.krita.org](https://docs.krita.org/en/user_manual/layers_and_masks.html)
- 命令行导出：[Linux Command Line](https://docs.krita.org/en/reference_manual/linux_command_line.html)
- Python API 概览：[KDE/krita libkis Mainpage](https://github.com/KDE/krita/blob/master/libs/libkis/Mainpage.dox)
- 脚本教程：[Krita Scripting School](https://scripting.krita.org/)
- 相关笔记：[[inkscape]]、[[gimp]]、[[blender]]、[[godot]]（2D 精灵导入）
