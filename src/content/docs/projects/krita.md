---
title: Krita — 数字绘画专业编辑器
来源: 'https://github.com/KDE/krita'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

Krita 是一个免费、开源、跨平台的数字绘画和 2D 动画软件，重点服务漫画家、插画师、概念设计师、纹理画师和 VFX 美术。日常类比：它不像普通修图软件那样先问“怎么改照片”，更像一张专业画桌，旁边放满画笔、图层纸、色卡、动画时间尺和印刷校样灯。

最小例子可以从命令行感受它不只是 GUI：

```bash
krita poster.kra --export --export-filename poster.png
```

这条命令把 Krita 原生工程 `poster.kra` 导出成 PNG。`poster.kra` 是保留图层、画笔痕迹和工程信息的工作文件，`--export` 表示进入导出模式，`--export-filename` 后面跟最终文件名。

README 把 Krita 定位成“从零开始创作数字艺术文件”的端到端工具；官网和手册补上了更具体的能力：笔刷引擎、图层与蒙版、色彩管理、Python 脚本、逐帧动画和 FFmpeg 导出。

## 为什么重要

不理解 Krita，会卡在这些地方：

- 你会把“画图软件”误以为只是 Photoshop 替代品，忽略 Krita 更偏向长期绘画、漫画、概念图和纹理创作。
- 你会以为开源 GUI 工具不能自动化，错过命令行导出、Python 插件和批量处理。
- 你会低估色彩管理：屏幕上好看的 RGB 颜色，到了 CMYK 印刷或不同纸张上可能明显变暗、偏色。
- 你会把动画当成视频剪辑问题，但 Krita 的强项其实是手绘逐帧动画，不是完整剪辑台。

## 核心要点

1. **笔刷引擎是“画感发动机”**：真实世界里铅笔、水彩、马克笔不是同一种工具；Krita 也把不同笔触拆成不同 brush engine。类比汽车发动机：外观都是车，油门踩下去的反馈却完全不同，画笔预设只是把这些设置保存成常用工具。

2. **图层、色彩和文件格式服务专业流程**：`.kra` 像一本带夹层的画册，里面保留图层、蒙版、动画帧和软打样配置；导出的 PNG/JPEG/PDF 更像交付给别人看的成品。Krita 支持 RGB、CMYK、Lab 等色彩模型和高位深通道，说明它不只面向“随便涂鸦”。

3. **GUI 和脚本是同一张画桌的两种入口**：艺术家可以点菜单、拖面板、换工作区；技术美术也可以用 Python 调 Krita API 创建文档、列出滤镜、写导出器。类比厨房：一个人手工炒菜，另一个人写好配方机器批处理，食材和锅还是同一套。

## 实践案例

### 案例 1：把工作文件批量导出成成品图

官方命令行手册给出终端导出模式，适合做“把一批 `.kra` 交付成 PNG/JPEG”的小流水线：

```bash
krita cover.kra --export --export-filename cover.png
krita cover.png --export --export-filename cover.jpg
```

逐部分解释：

- `cover.kra` / `cover.png` 是输入文件，Krita 会先打开它。
- `--export` 说明这次不是进入编辑界面，而是执行导出动作。
- `--export-filename cover.png` 指定输出文件；换扩展名就会走对应格式。
- 这类命令适合交付前统一转格式，但复杂命名、遍历目录仍要交给 shell 脚本。

### 案例 2：用 Python 创建文档并查看可用滤镜

官方 Python Scripting 文档展示了 `from krita import *`、`createDocument()` 和 `filters()`。在 Scripter 里可以试：

```python
from krita import *

app = Krita.instance()
doc = app.createDocument(512, 512, "Python test document", "RGBA", "U8", "", 120.0)
app.activeWindow().addView(doc)
print(app.filters()[:5])
```

逐部分解释：

- `Krita.instance()` 拿到当前运行中的 Krita 应用对象。
- `createDocument(512, 512, ...)` 新建一张 512×512 的 RGBA 画布。
- `addView(doc)` 把文档显示到窗口里，否则只是后台对象。
- `filters()` 返回滤镜名称列表，后续可以据此做批量处理或自定义插件。

### 案例 3：把逐帧动画导出成图片序列

Krita 的动画导出可以先生成图片序列，再交给 FFmpeg 编码。命令行也有对应入口：

```bash
krita --export-sequence --export-filename walkcycle.png walkcycle.kra
```

逐部分解释：

- `--export-sequence` 表示导出动画帧序列，而不是只导出静态图。
- `--export-filename walkcycle.png` 用文件名决定输出格式和帧名前缀。
- `walkcycle.kra` 必须真的有动画；没有动画时，官方文档说明它会报“没有动画”并不做事。
- 这种方式适合把手绘帧交给视频编辑器、游戏引擎或后续 FFmpeg 管线。

## 踩过的坑

1. **把 `.kra` 当最终交付格式**：`.kra` 适合继续编辑，但给网页、打印店或同事预览时通常要导出 PNG、JPEG、TIFF 或 PDF。

2. **直接在 CMYK 里画完整作品**：官方软打样文档更推荐在 RGB 里创作，再用目标 CMYK ICC 配置预览，因为不同纸张、油墨和设备的色域差异很大。

3. **长动画一口气做到底**：Krita 是逐帧动画工具，帧和图层会占内存；官方手册建议长片段要拆短、降低草稿分辨率、合并图层并勤做增量备份。

4. **忘记启用脚本入口**：Scripter 不是必需组件，但新人测试 Python 时常找不到它；需要在 Python Plugin Manager 里启用后再从 Tools/Scripts 打开。

## 适用 vs 不适用场景

**适用**：

- 插画、漫画、概念图、纹理、matte painting 和手绘逐帧动画。
- 需要专业笔刷、压感、图层、蒙版、色彩管理和软打样的创作流程。
- 想用开源工具替代订阅制绘画软件，又愿意学习工作区和画笔设置。
- 技术美术需要用 Python 批量创建、检查、导出或扩展绘画工作流。

**不适用**：

- 主要做照片修复、抠图和通用图像处理，GIMP 或专门修图软件更对口。
- 主要做矢量 logo、排版和图标系统，Inkscape 或设计工具更合适。
- 需要完整视频剪辑、字幕、多轨音频和调色，Kdenlive、Shotcut 或 Resolve 更适合。
- 需要 3D 建模、材质节点和渲染管线，Blender 才是主场。

## 历史小故事（可跳过）

- **1998 年**：KDE 社区从一个“给 GIMP 套 Qt GUI”的演示想法出发，决定做自己的图像编辑器。
- **1999 年**：KImageShop 正式启动，早期想法是围绕 ImageMagick 做 GUI 外壳和插件系统。
- **2002 年**：项目几次改名后定名为 Krita，避开已有商标。
- **2004-2005 年**：Krita 随 KOffice 公开发布，并加入 CMYK、Lab、高位深通道和 OpenGL 等能力。
- **2009 年以后**：项目从通用图像编辑转向数字绘画，并通过资助、社区和基金会逐渐提升稳定性与性能。
- **2012 年**：Krita Foundation 成立，帮助项目长期资助开发和服务艺术家社区。

## 学到什么

- Krita 的护城河不是“能打开图片”，而是为长时间绘画优化的笔刷、图层、色彩、动画和工作区。
- 开源桌面应用也可以有专业级工作流：GUI 给艺术家可见反馈，命令行和 Python 给团队自动化入口。
- 色彩管理不是高级附加题，而是“屏幕、打印、交付是否一致”的基本功。
- 逐帧动画和视频剪辑是两类问题：Krita 负责画帧，剪辑软件负责把镜头和声音组织成片。

## 延伸阅读

- 官方仓库：[KDE/krita](https://github.com/KDE/krita)
- 官方手册：[Krita User Manual](https://docs.krita.org/en/user_manual.html)
- 官方功能页：[Krita Features](https://krita.org/en/features/)
- 官方文档：[Linux Command Line](https://docs.krita.org/en/reference_manual/linux_command_line.html)
- 官方文档：[Python Scripting](https://docs.krita.org/en/user_manual/python_scripting/introduction_to_python_scripting.html)
- 同类工具：[[gimp]]、[[inkscape]]、[[blender]]

## 关联

- [[gimp]] —— GIMP 更偏通用修图和图像处理，Krita 更偏绘画、漫画和动画创作。
- [[inkscape]] —— Inkscape 面向矢量图形；Krita 虽有矢量和文字工具，但主轴仍是位图绘画。
- [[blender]] —— Blender 负责 3D 创作和渲染，Krita 常用于概念图、贴图和手绘素材。
- [[shotcut]] —— Shotcut 是视频剪辑器，适合把 Krita 导出的动画帧或视频继续剪成成片。
- [[ffmpeg]] —— Krita 动画导出和后续转码会遇到同一类编码、容器和帧序列问题。
- [[python]] —— Krita 的脚本和插件入口让 Python 参与绘画工作流自动化。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
