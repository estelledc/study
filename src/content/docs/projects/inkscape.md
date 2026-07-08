---
title: Inkscape — 矢量图形编辑器
来源: 'https://github.com/inkscape/inkscape'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

Inkscape 是一个以 SVG 为原生格式的开源矢量图形编辑器，用 C++ 实现，定位接近 Illustrator、CorelDRAW 这类画标志、图标、海报和技术示意图的工具。

日常类比：如果位图软件像在纸上涂颜料，放大后会看见像素颗粒；Inkscape 更像用尺子、曲线板和剪纸模板拼图形，放大 10 倍后边缘仍然由数学曲线重新画出来。

最小命令例子不是先学所有按钮，而是把一个 SVG 批量导出成 PNG：

```bash
inkscape --export-type=png logo.svg
```

这条命令会读取 `logo.svg`，按文件名生成 `logo.png`。它说明 Inkscape 不只是一个 GUI 画图软件，也能在脚本、构建流程和文档流水线里充当 SVG 渲染器。

GitHub README 把它描述为跨 Windows、macOS、Linux 的专业质量矢量图形软件；核心差异是它把 W3C SVG 当作原生文件格式，而不是只把 SVG 当导入导出选项。

## 为什么重要

不理解 Inkscape，会卡在这些地方：

- 你会把“图形文件”都当成图片，分不清 PNG 里是像素，SVG 里是路径、文本、样式和对象结构。
- 你会以为开源绘图工具只能手工点界面，错过 `--export-type`、`--export-id`、`--actions` 这些自动化入口。
- 你会在网页、论文、PPT、App 图标之间反复丢清晰度，因为没有保留一份可编辑的矢量源文件。
- 你会误以为“保存为 PDF/PNG 就万事大吉”，但字体、滤镜、透明度和 Inkscape 私有信息可能在跨工具时改变。

## 核心要点

1. **SVG 是源文件，不只是导出格式**：Inkscape 的 `.svg` 像一张带对象层级的施工图，矩形、曲线、文字、渐变都还能被重新选中和编辑。类比 Word 文档和截图：截图能看，Word 才能继续改段落。

2. **对象、路径、样式分层协作**：一个图标不是“一团颜色”，而是很多对象叠在一起；对象可以有填充、描边、变换、滤镜和层级。类比做手账：底纸、贴纸、文字贴和透明胶片分层放，修改时不用撕掉全部重做。

3. **GUI 和命令行共用同一套文档模型**：界面适合画，命令行适合重复导出、查询尺寸、按对象 ID 导出。类比厨房：厨师手工摆盘，打包机按同一份菜单批量装盒。

## 实践案例

### 案例 1：把 SVG 批量导出成 PNG

官方命令行文档给出最常见的导出姿势：给一个 SVG 文件指定导出类型，让 Inkscape 自动生成同名输出文件。

```bash
inkscape --export-type=png poster.svg
```

逐部分解释：

- `inkscape`：启动 Inkscape，但导出参数会让它不需要打开完整 GUI。
- `--export-type=png`：指定输出格式是 PNG，适合网页、聊天软件、普通图片查看器。
- `poster.svg`：输入源文件，默认会得到 `poster.png`。
- 这个案例适合把一批图标从可编辑 SVG 变成产品里可直接引用的位图资源。

如果要批量处理多个文件，可以让 shell 展开文件名：

```bash
inkscape --export-type=png icons/*.svg
```

这里的关键不是“多神奇”，而是把“一个个点导出”的重复劳动变成命令。

### 案例 2：只导出某个对象 ID

官方 wiki 展示了按对象 ID 导出图形的方式，适合一个 SVG 里放很多图标、按钮状态或插画零件时使用：

```bash
inkscape --export-type=png --export-id=MyTriangle --export-id-only sheet.svg
```

逐部分解释：

- `--export-id=MyTriangle`：只挑选 ID 叫 `MyTriangle` 的对象作为目标。
- `--export-id-only`：隐藏其他对象，避免背景零件或旁边图标混进输出。
- `sheet.svg`：可以是一张“图标总表”，里面同时放几十个对象。
- 输出区域默认会贴近这个对象的边界，所以很适合从一张源图里切小图标。

如果要一次导出多个对象，官方文档也允许用分号分隔 ID：

```bash
inkscape --export-type=png --export-id="IconSave;IconOpen" toolbar.svg
```

这类用法说明 Inkscape 的对象 ID 很重要：它不是只给程序员看的属性，而是批量导出的抓手。

### 案例 3：用 actions 做多次导出

Inkscape 1.x 以后逐步把旧的 verbs 换成 actions。官方示例展示了用一串动作在同一个文件里多次设置导出参数并执行导出：

```bash
inkscape --actions="export-id:Badge; export-id-only; export-background:purple; export-filename:badge-purple.png; export-do; export-background:red; export-filename:badge-red.png; export-do" badge.svg
```

逐部分解释：

- `--actions="..."`：把一组动作串起来，像给 Inkscape 发一张操作清单。
- `export-id:Badge`：选中要导出的对象。
- `export-background:purple` 和 `export-background:red`：先后换两种背景色。
- `export-filename:...`：每次导出前指定不同文件名。
- `export-do`：立刻执行一次导出；没有这一步，前面的设置只是准备。

这个案例适合做同一图形的多版本输出，例如浅色/深色背景、不同状态按钮、不同演示稿主题配色。

## 踩过的坑

1. **把 PNG 当源文件**：PNG 只能保留像素结果，后续再改文字、曲线、描边会很痛；源文件应该保留 Inkscape SVG。
2. **忽略 Inkscape SVG 和 Plain SVG 的区别**：Inkscape SVG 会保留编辑器私有信息，Plain SVG 更适合给别的工具或网页消费。
3. **字体没转路径就交付**：对方电脑没有同一字体时，文字可能被替换；需要稳定外观时要考虑把文字转成路径。
4. **沿用 0.92 时代命令**：旧的 `--export-png`、`--file`、`--verb` 已被新参数或 actions 取代，复制老教程容易失败。

## 适用 vs 不适用场景

**适用**：

- 做 Logo、图标、贴纸、示意图、地图、海报和网页 SVG，需要后续可编辑。
- 需要免费、开源、跨平台的矢量编辑器，不想被专有格式锁死。
- 想把设计文件接入脚本，批量导出 PNG、PDF、Plain SVG 或按对象 ID 切图。
- 学习 SVG 本身：路径、填充、描边、层级、文本、滤镜都能在文件里看见。

**不适用**：

- 主要修照片、调曝光、磨皮、做像素级合成，位图编辑器更合适。
- 团队已经深度绑定 Adobe 商业生态、字体管理、插件和协作流程，迁移成本很高。
- 需要复杂页面排版、长文档目录、自动页码，桌面出版软件更适合。
- 只想快速裁剪一张图或加水印，Inkscape 的对象模型会显得偏重。

## 历史小故事（可跳过）

- **2003 年**：Inkscape 从 Sodipodi 社区分叉出来，目标是围绕 SVG 标准做更开放的矢量编辑器。
- **早期**：项目把“Draw Freely”当作口号，吸引设计师、插画师、工程师和教育用户共同改进。
- **1.0 前后**：命令行和内部架构经历较大调整，GTK 3、actions、现代导出参数逐步替代旧接口。
- **现在**：GitHub 仓库是官方镜像，README 指向 GitLab 主开发仓库和 Inkscape 官网；社区持续维护手册、wiki、扩展和跨平台发行包。

## 学到什么

- Inkscape 的核心不是“免费 Illustrator”，而是“把 SVG 当可编辑源文件”的工作流。
- 矢量图的优势来自对象和路径，而不是魔法；放大清晰，是因为浏览器或导出器会重新计算曲线。
- 命令行让 GUI 工具进入工程流水线：批量导出、按 ID 切图、反复生成多版本都可以自动化。
- 跨工具交付时要主动选择格式：编辑留 Inkscape SVG，分享可用 Plain SVG/PDF/PNG，稳定字体时考虑转路径。

## 延伸阅读

- 官方仓库：[inkscape/inkscape](https://github.com/inkscape/inkscape)
- 官方网站：[Inkscape](https://inkscape.org)
- 官方 wiki：[Using the Command Line](https://wiki.inkscape.org/wiki/Using_the_Command_Line)
- 初学者手册：[Inkscape Beginners' Guide](https://inkscape-manuals.readthedocs.io/en/latest/)
- [[svg]] —— Inkscape 的原生文件格式，也是网页矢量图的基础。
- [[blender]] —— 同样是开源创作工具，但 Blender 面向 3D，Inkscape 面向 2D 矢量图。

## 关联

- [[svg]] —— Inkscape 的对象、路径、样式最终都落回 SVG 这套开放标准。
- [[blender]] —— 都是创作者工具；Blender 管 3D 场景，Inkscape 管 2D 矢量图。
- [[gimp]] —— GIMP 更偏位图修图，Inkscape 更偏路径、图标和可缩放图形。
- [[ffmpeg]] —— 两者都常被放进批处理流水线，只是 FFmpeg 处理音视频，Inkscape 处理矢量导出。
- [[imagemagick]] —— 常和 Inkscape 串联做格式转换，例如 SVG 先导出 PNG，再继续转 JPG。
- [[figma]] —— 都服务界面和矢量设计，但 Figma 强在协作云端，Inkscape 强在本地开源和 SVG 文件可控。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
