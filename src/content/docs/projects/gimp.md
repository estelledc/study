---
title: GIMP — GNU 图像处理程序
来源: 'https://github.com/GNOME/gimp'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 初级
---

## 是什么

**GIMP**（GNU Image Manipulation Program，GNU 图像处理程序）是一款**免费开源**的位图图像编辑器，源码托管于 [GNOME/gimp](https://github.com/GNOME/gimp)，采用 GPL 许可，跨 Windows / macOS / Linux。它对标 Adobe Photoshop 的通用修图能力：图层、蒙版、选区、曲线、滤镜、批处理脚本——但**不绑定订阅**，且 `.xcf` 工程文件保留完整编辑历史。

日常类比：如果把 [[inkscape]] 比作「用钢笔画可无限放大的施工图」，GIMP 更像**在暗房里冲洗、裁剪、调色、叠印照片**——每一张透明胶片（图层）可以单独调亮度，用剪纸模板（蒙版）只让天空变蓝，最后冲印成 JPEG 发朋友圈。再打个比方：像素画布是**固定分辨率的方格纸**，你在格子上涂色；GIMP 帮你管的是「哪一层涂什么、涂完还能不能反悔、怎么一次处理一百张照片」——让你专注修图，而不是和格式、授权搏斗。

2025 年 3 月发布的 **GIMP 3.0** 是七年开发的里程碑：非破坏性 GEGL 滤镜、多选图层、改进的文字描边与色域管理（GeglColor）。项目口号隐含在 GNU 精神里：**自由使用、自由修改、自由分发**。

## 为什么重要

零基础学图像处理或内容生产管线，绕不开 GIMP 的几个现实理由：

- **零授权成本**：个人、教育、小规模商业均可免费使用，不像 Photoshop 订阅制
- **图层 + 蒙版思维**：修图、合成、海报、缩略图、简单 UI 资产都建立在同一套概念上
- **开放工程格式**：`.xcf` 保存图层、通道、路径、非破坏性滤镜；可反复打开继续改
- **脚本自动化**：内置 **Script-Fu**（Scheme）与 **Python-Fu**，配合 `gimp-console` 可无界面批处理
- **插件生态**：GEGL 滤镜、G'MIC、Resynthesizer 等扩展；与 [[inkscape]]（矢量）、[[krita]]（绘画）形成开源创作三角

## 核心要点

### 1. 位图 vs 矢量

| 类型 | 存储方式 | 放大 | 典型用途 |
| --- | --- | --- | --- |
| **位图（Raster）** | 像素矩阵 + 颜色值 | 放大会糊 | 照片、扫描件、笔刷绘画、网页位图 |
| **矢量（Vector）** | 数学曲线与属性 | 无限清晰 | Logo、图标、印刷线条稿 |

GIMP 编辑**像素**；需要矢量 Logo 时用 [[inkscape]] 画完导出 PNG/SVG，再导入 GIMP 合成。

### 2. 图像、图层、通道与路径

GIMP 文档结构可类比 Photoshop：

| 概念 | 类比 | 作用 |
| --- | --- | --- |
| **Image（图像）** | 一整本相册 | 画布尺寸、色彩配置、分辨率 |
| **Layer（图层）** | 透明胶片 | 独立编辑、混合模式、不透明度 |
| **Channel（通道）** | 只记录明暗的底片 | RGB、Alpha、选区保存为通道 |
| **Path（路径）** | 可弯曲的刀模 | 贝塞尔曲线，可转选区或描边 |
| **Selection（选区）** | 临时剪纸框 | 操作只影响框内像素 |

**图层组（Layer Group）** 把多层打包，可整体移动、加滤镜；GIMP 3.0 起支持**多选图层**同时变换。

### 3. 蒙版（Mask）

**图层蒙版**是附着在图层上的灰度图：白色=完全显示该层，黑色=完全隐藏，灰色=半透明。类比：在胶片上贴一张**渐变镂空模板**，只让天空区域接受调色，地面不受影响。

操作路径：**Layer → Mask → Add Layer Mask**，用画笔在蒙版上涂黑/白。GIMP 3.0 的非破坏性滤镜目前主要挂在图层或图层组上；若要对「仅天空」做曲线，常用技巧是：**先做好选区再应用滤镜**（选区会嵌入滤镜），或把调整放在**带蒙版的图层组**上。

### 4. 非破坏性编辑（GIMP 3.0 + GEGL）

**GEGL**（Generic Graphics Library）是 GIMP 的图像处理管线。GIMP 3.0 默认让多数滤镜以**非破坏性**方式留在图层上（图层旁显示 **fx** 标记），可随时双击重调参数、开关、删除，而不必 Undo 一整串历史。

- 喜欢老工作流：应用滤镜时勾选 **Merge Filters** 立即合并到像素
- 工程保存：NDE 滤镜可写入 `.xcf`，下次打开继续编辑（第三方滤镜需本机已安装）

### 5. 色彩与文件格式

| 格式 | 角色 |
| --- | --- |
| **XCF** | GIMP 原生工程，保留图层/蒙版/路径/NDE 滤镜 |
| **PNG** | 无损，支持透明，适合 Web 与 UI |
| **JPEG** | 有损，适合照片分享，**不支持透明** |
| **TIFF / PSD** | 与印刷、Photoshop 交换（部分特性可能扁平化） |
| **WebP** | 现代 Web，体积更小 |

GIMP 3.0 强化 **GeglColor** 与 ICC 配置：导出前在 **Image → Color Management** 确认显示与导出配置一致，避免「屏幕上好看、手机上发灰」。

### 6. 选区、变换与修复工具

零基础修照片常用工具链：

1. **Crop（裁剪）** / **Scale（缩放）** — 构图与输出尺寸
2. **Fuzzy Select（魔棒）** / **Free Select（套索）** — 抠图起点
3. **Heal / Clone** — 去 blemish、仿制纹理
4. **Levels / Curves** — 明暗与对比（可作 NDE 调整）
5. **Gaussian Blur** — 背景虚化或柔化边缘

**Unified Transform** 可一次完成移动、缩放、旋转、透视；多选图层后变换会同时作用。

### 7. 插件与 PDB（过程数据库）

几乎所有菜单命令（含导入导出）在内部都是 **PDB 过程（Procedure）**。Script-Fu / Python-Fu 通过 PDB 调用 `gimp-file-load`、`gimp-image-scale` 等，与 GUI 同源——**你在界面里能点的，脚本里基本都能写**。

插件默认搜索路径包括用户目录下的 `plug-ins`；GIMP 3 的 Script-Fu 插件以独立进程运行，与 C 插件并列安装。

### 8. Script-Fu 与 Python-Fu

| 方式 | 语言 | 特点 |
| --- | --- | --- |
| **Script-Fu** | Scheme | 内置，Filters → Script-Fu → Console |
| **Python-Fu** | Python 3 | Filters → Development → Python-Fu → Console |

批处理、水印、批量缩放、格式转换是脚本最典型的场景。

## 界面与工作流速览

| 区域 | 作用 |
| --- | --- |
| 画布 | 中央编辑区，滚轮缩放，中键/空格拖动画布 |
| 工具箱 | 选择、画笔、橡皮、渐变、文字、修复… |
| 工具选项 | 当前工具参数（笔刷大小、硬度、模式） |
| 图层/通道/路径 dock | 管理图层栈、蒙版、保存的选区 |
| 滤镜菜单 | GEGL 与经典滤镜，多数在 GIMP 3 可非破坏性 |

**零基础 10 分钟流程**：打开照片 → .duplicate 图层备份 → **Colors → Curves** 微调 → **Filters → Enhance → Sharpen** → 加图层蒙版局部恢复 → **File → Export As** 导出 PNG/JPEG。

## 实践案例

### 案例 1：Script-Fu 批量缩放并导出 JPEG

将某文件夹内所有 JPG/PNG 长边缩到 1920px，输出到 `out/`（需已安装 GIMP，且 `gimp` 或 `gimp-console` 在 PATH）：

```scheme
;; batch-resize.scm — 在 GIMP 中：Filters → Script-Fu → Refresh Scripts 后也可注册为菜单项
(define (batch-resize-folder source-dir dest-dir max-side)
  (let* ((pattern (string-append source-dir "/*.{jpg,jpeg,png,JPG,PNG}"))
         (files (cadr (file-glob pattern 0))))
    (map (lambda (path)
           (let* ((image (car (gimp-file-load RUN-NONINTERACTIVE path path)))
                  (drawable (car (gimp-image-get-active-drawable image)))
                  (w (car (gimp-image-width image)))
                  (h (car (gimp-image-height image)))
                  (scale (if (> w h) (/ max-side w) (/ max-side h)))
                  (nw (round (* w scale)))
                  (nh (round (* h scale)))
                  (base (substring path (+ (string-length path)
                                           (- (string-length (file-basename path))))))
                  (out (string-append dest-dir "/" base ".jpg")))
             (gimp-image-scale-full image nw nh INTERPOLATION-CUBIC)
             (file-jpeg-save RUN-NONINTERACTIVE image drawable out out 90 0 0 0 0 0 0)
             (gimp-image-delete image)))
         files)))

;; 调用示例（路径按本机修改）：
;; (batch-resize-folder "/tmp/in" "/tmp/out" 1920)
```

命令行无 GUI 执行（GIMP 3 使用 `gimp-console` 与 Script-Fu 解释器）：

```bash
gimp-console -i --batch-interpreter=plug-in-script-fu-eval \
  --batch='(load "/path/to/batch-resize.scm")' \
  --batch='(batch-resize-folder "/tmp/in" "/tmp/out" 1920)' \
  --batch='(gimp-quit 0)'
```

**要点**：`RUN-NONINTERACTIVE` 避免弹对话框；批处理结束务必 `gimp-quit`，否则进程挂起。

### 案例 2：Python-Fu 批量加水印

在 **Filters → Development → Python-Fu → Console** 可交互试验；保存为 `~/.config/GIMP/3.0/plug-ins/watermark-batch.py` 可变成菜单插件：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from gimpfu import *
import os
import glob

def watermark_folder(src_dir, watermark_path, dest_dir, opacity=80.0):
    for path in glob.glob(os.path.join(src_dir, "*.png")):
        image = pdb.gimp_file_load(path, path)
        wm = pdb.gimp_file_load(watermark_path, watermark_path)
        wm_layer = pdb.gimp_image_get_active_layer(wm)
        pdb.gimp_image_insert_layer(image, wm_layer, None, -1)
        pdb.gimp_layer_set_opacity(wm_layer, opacity)
        pdb.gimp_layer_set_offsets(
            wm_layer,
            pdb.gimp_image_width(image) - pdb.gimp_image_width(wm) - 20,
            pdb.gimp_image_height(image) - pdb.gimp_image_height(wm) - 20,
        )
        drawable = pdb.gimp_image_merge_visible_layers(image, CLIP_TO_IMAGE)
        out = os.path.join(dest_dir, os.path.basename(path))
        pdb.file_png_save_defaults(image, drawable, out, out)
        pdb.gimp_image_delete(image)
        pdb.gimp_image_delete(wm)

register(
    "python_fu_watermark_folder",
    "Batch watermark PNGs in a folder",
    "",
    "Study Notes",
    "Study Notes",
    "2026",
    "",
    "",
    [
        (PF_DIRNAME, "src_dir", "Source folder", ""),
        (PF_FILE, "watermark_path", "Watermark PNG", ""),
        (PF_DIRNAME, "dest_dir", "Output folder", ""),
        (PF_SLIDER, "opacity", "Opacity", 80.0, (0.0, 100.0, 1.0)),
    ],
    [],
    [],
    watermark_folder,
    menu="<Image>/Filters/Study",
    domain=("watermark-batch", gimp.locale_directory),
)

main()
```

**要点**：水印用 **PNG 透明底**；`merge_visible_layers` 会扁平化——若需保留图层请改为直接 `file_png_save` 活动层组合。

### 案例 3：单张图命令行导出 WebP

不写脚本，仅用 PDB 过程链（适合 CI 里一张预览图）：

```bash
gimp-console -i --batch-interpreter=plug-in-script-fu-eval \
  --batch='(let* ((img (car (gimp-file-load RUN-NONINTERACTIVE "logo.png" "logo.png")))
                 (drw (car (gimp-image-get-active-drawable img))))
            (file-webp-save RUN-NONINTERACTIVE img drw "logo.webp" "logo.webp" 0 85 0 0 0 0 0)
            (gimp-image-delete img))' \
  --batch='(gimp-quit 0)'
```

### 案例 4：非破坏性曲线 + 图层组蒙版（GIMP 3 工作流）

1. 复制背景层为 **「调整组」** 内的唯一图层（或整组套住需调整的层）
2. 选中组 → **Colors → Curves**（或 **Filters → GEGL Operation**）→ 确认未勾选 Merge Filters
3. 在组上 **Add Layer Mask**，用黑白渐变让调整只作用于天空
4. 随时点击 **fx** 重新编辑曲线；满意后 **File → Export** 交付扁平 PNG

### 案例 5：与 [[inkscape]] 协作

1. Inkscape 导出 2× 分辨率 PNG（透明底图标）
2. GIMP 打开 → **Layer → Transparency → Alpha to Selection** 得精确选区
3. 在选区内填色、加外发光（GEGL）、导出 Web 用 WebP

## 常用快捷键

| 快捷键 | 功能 |
| --- | --- |
| `R` | 矩形选区 |
| `Shift+R` | 圆角矩形选区（GIMP 3） |
| `F` | 自由选择 / 套索 |
| `U` | 统一变换 |
| `M` | 移动图层/选区 |
| `P` | 画笔 |
| `E` | 橡皮 |
| `Ctrl+Shift+N` | 新建图层 |
| `Ctrl+M` | 添加图层蒙版 |
| `Ctrl+Shift+E` | 导出为 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做 |

## 踩过的坑

1. **直接保存 JPEG 当工程**：JPEG 会合并图层；长期项目务必 **Save as XCF**。  
2. **忘记转换色彩配置**：Web 导出常用 sRGB；印刷需嵌入 ICC 并与对方确认。  
3. **批处理路径含空格**：Scheme 字符串要转义，或改用 Python `os.path`。  
4. **GIMP 2.x 脚本上 3.0**：PDB 类型有变（如 drawable ID → 对象数组），需按 [porting 文档](https://developer.gimp.org/resource/script-fu/porting_scriptfu_scripts/) 调整。  
5. **非破坏性滤镜与「合并」习惯**：交付前若只要扁平图，**Export** 即可；不必先 Merge 所有 fx，除非要兼容无 GIMP 的下游。  
6. **浮动选区困惑**：GIMP 3 默认粘贴为新图层；需要旧式浮动选区用 **Paste as Floating Selection**。

## 适用 vs 不适用场景

**适用**：

- 照片修图、抠图合成、海报、缩略图、简单纹理
- 批量缩放、水印、格式转换（脚本 + `gimp-console`）
- 学习图层/蒙版/色彩调整，迁移到 Photoshop 时概念可复用
- 开源文档站配图、博客头图、轻量 UI 位图

**不适用**：

- 专业插画厚涂（优先 [[krita]]）
- Logo / 图标矢量源文件（优先 [[inkscape]]）
-  RAW 摄影工作流主力（可考虑 darktable + GIMP 修图）
- 多页排版（Scribus / InDesign）
- 依赖 Adobe 专有智能对象、云端协作的设计团队

## 与邻居项目对照

| 项目 | 维度 | 关系 |
| --- | --- | --- |
| [[inkscape]] | 矢量 | 出 SVG/PNG；GIMP 做合成与位图精修 |
| [[krita]] | 绘画 | 笔刷创作在 Krita；GIMP 修照片与批处理 |
| [[imagemagick]] | CLI 位图 | 纯命令行转换；复杂交互与图层仍用 GIMP |
| [[ffmpeg]] | 视频 | 视频帧导出 → GIMP 修帧 → 再合成 |
| [[docusaurus]] | 文档站 | 导出 WebP/PNG 插图进静态站 |

## 学到什么

- **图层 + 蒙版是通用语言**：从 GIMP 到 Photoshop 到 [[krita]]，思维可迁移。  
- **破坏性 vs 非破坏性要自觉选择**：GIMP 3 的 GEGL 管线让「试错成本」下降，但交付物仍常常是扁平位图。  
- **PDB 统一 GUI 与脚本**：学会在 Procedure Browser 里查参数，比死记 API 更快。  
- **工程文件与交付文件分离**：XCF 是仓库，PNG/JPEG/WebP 是产物——别把 JPEG 当源文件。

## 延伸资源

- 官方发布说明：[GIMP 3.0 Release Notes](https://www.gimp.org/release-notes/gimp-3.0.html)
- 源码与贡献：[github.com/GNOME/gimp](https://github.com/GNOME/gimp)
- Script-Fu 文档：[developer.gimp.org — Script-Fu](https://developer.gimp.org/resource/script-fu/)
- 内置帮助：**Help → User Manual**（可在线 [docs.gimp.org](https://docs.gimp.org/)）
- 社区插件：G'MIC、Resynthesizer（内容感知填充）
