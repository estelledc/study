---
title: Pillow — Python 图像处理库与 PIL 现代继任者
description: PIL 友好分支；打开/保存/缩放/裁剪/滤镜/EXIF，与 NumPy 互转，是多模态数据管线图像 I/O 默认选择
来源: 'https://github.com/python-pillow/Pillow'
日期: 2026-06-05
分类: 多媒体
子分类: 图像处理
难度: 初级
provenance: manual-read
---

## 是什么

**Pillow** 是 Python **图像处理库**，自称 **「PIL 的友好分支」**（Python Imaging Library）：负责打开、解码、变换、编码常见 raster 格式（JPEG/PNG/WebP/TIFF…），并与 [[numpy]] 零拷贝互转，是多模态项目里「图像 I/O + 轻量几何」的默认工具。

日常类比：如果 [[clip]] / [[llava]] 的视觉塔吃 tensor，Pillow 就是**暗房冲印台**——把磁盘上的 jpg 变成可算的 RGB 数组，裁成 336×336，再交给 [[pytorch]]。

最小流程：

```python
from PIL import Image

im = Image.open("photo.jpg").convert("RGB")
im.thumbnail((512, 512))
crop = im.crop((10, 10, 300, 300))
crop.save("out.webp", quality=85)
```

`Image.open` 懒加载，真正解码发生在访问像素或 `load()` 时；`convert("RGB")` 统一三通道，避免 PNG 调色板模式坑到训练。

## 为什么重要

不理解 Pillow，视觉数据管线会在最浅的 I/O 层翻车：

- **几乎所有 Python CV 教程从 PIL 开始**：后续 [[matplotlib]] 显示、`torchvision.transforms` 包装，底层常仍是 Pillow 读盘
- **与 [[numpy]] 互转一行搞定**：`np.array(im)` / `Image.fromarray(arr)` 是自定义增广脚本的标准桥
- **格式覆盖比 OpenCV 偏「存档友好」**：WebP、HEIF（视插件）、TIFF 多页；适合数据集清洗而非只有 BGR 视频帧
- **多模态标注导出**：[[label-studio]] / [[cvat]] 导出 PNG 掩膜，脚本侧用 Pillow 合并 RGBA 通道极常见

## 核心要点

1. **Image 对象与模式**：`mode` 可能是 `L`、`RGB`、`RGBA`、`P`（调色板）。训练前几乎总要 `convert("RGB")` 或显式处理 alpha。

2. **几何变换 API**：`resize`、`crop`、`rotate`、`transpose` 使用高质量滤波器（`Resampling.LANCZOS`）；与 LLM 视觉塔输入尺寸对齐在这里完成。

3. **ImageOps / ImageFilter / ImageEnhance**：对比度、锐化、模糊等轻量增广，不必为了几张图引入整套 Albumentations。

4. **保存参数与元数据**：JPEG `quality`、PNG `optimize`、WebP `lossless`；`exif` 子模块可读写方向标签，避免手机照片「横着进模型」。

## 实践案例

### 案例 1：LLaVA 式固定短边缩放

```python
from PIL import Image

def resize_short_edge(im: Image.Image, short: int = 336) -> Image.Image:
    w, h = im.size
    if w < h:
        nw, nh = short, int(h * short / w)
    else:
        nw, nh = int(w * short / h), short
    return im.resize((nw, nh), Image.Resampling.BICUBIC)

im = Image.open("scene.jpg").convert("RGB")
im = resize_short_edge(im, 336)
```

[[llava]] / [[clip]] 类模型常在 Pillow 层做短边缩放，再中心裁或 pad 成正方形。数值范围仍在 0–255 uint8，归一化留给 `torchvision`。

### 案例 2：与 [[numpy]] / [[pytorch]] 互转

```python
import numpy as np
import torch
from PIL import Image

im = Image.open("x.png").convert("RGB")
arr = np.asarray(im)                    # HWC uint8
tensor = torch.from_numpy(arr).permute(2, 0, 1).float() / 255.0  # CHW 0-1
```

`from_numpy` 与 uint8 数组共享内存；若后续 in-place 改 tensor，要 `clone()` 避免污染原图。

### 案例 3：数据集清洗批量转 WebP

```python
from pathlib import Path
from PIL import Image

for p in Path("raw_jpeg").glob("*.jpg"):
    im = Image.open(p).convert("RGB")
    im.save(Path("webp") / (p.stem + ".webp"), "WEBP", quality=90, method=6)
```

WebP 体积常比 JPEG 小 25–35%，大规模多模态数据集省磁盘与 CDN 带宽；注意 `method=6` 更慢但更小。

## 与同类对比

| 库 | 强项 | 弱项 | 典型输出 |
|---|---|---|---|
| **Pillow** | 格式全、API 简单 | 无 GPU、慢于专用 CV | PIL Image |
| OpenCV | 视频/BGR、快 | 格式/色彩易混 | numpy BGR |
| torchvision.io | 与 torch 集成 | 格式较少 | tensor |
| imageio | 科学栈 I/O | 变换弱 | numpy |

Pillow 强项：**读盘 + 轻量几何 + 保存**；弱项：不做检测分割、不碰 GPU 增广。

## 踩过的坑

1. **调色板模式 `P` 未转 RGB**：直接 `np.array` 得到索引图，模型当 RGB 会花屏。

2. **EXIF 方向未校正**：手机竖拍图像素未旋转，要用 `ImageOps.exif_transpose(im)`（新版内置）。

3. **`resize` 宽高顺序是 (W,H)**：与 numpy shape (H,W,C) 相反，手写容易颠倒。

4. **大 TIFF 内存爆**：多页 TIFF 用 `seek` 逐页读，别一次性 `open` 全加载。

5. **JPEG 有损反复保存**：清洗流程只 save 一次，中间态用 PNG 或无损格式。

6. **RGBA 贴到黑底**：合成时要先 `paste` 到 RGB 背景或指定 mask，否则透明区训练噪声。

## 适用 vs 不适用场景

**适用**：
- 图像数据集清洗、格式转换、缩略图
- 多模态项目读用户上传 jpg/png
- 与 [[matplotlib]] 联调可视化
- 轻量增广（旋转裁剪）原型

**不适用**：
- 视频解码（用 [[decord]] / [[ffmpeg]]）
- 高性能 GPU 增广训练（torchvision / Kornia）
- 重型 CV（检测分割用 OpenCV + 专用框架）
- 医学 DICOM 全流程（需 pydicom 等）

## 历史小故事（可跳过）

- **1995**：PIL 由 Fredrik Lundh 创建，长期是 Python 图像标准
- **2010**：PIL 停更，Alex Clark 牵头 Pillow 分支并延续至今
- **2015–2020**：随深度学习爆发成为「读图默认」；与 [[numpy]] 互写进每份教程
- **2020s**：WebP/AVIF 支持、安全 CVE 快速修复；PyPI 周下载量亿级

## 学到什么

1. **懒加载 `open` 不等于已解码**，批量处理前要明确 `load()`
2. **RGB 契约要在进模型前完成**，模式比分辨率更常踩坑
3. **Pillow 管 I/O 与轻几何，重增广交给 torchvision**
4. **与 [[clip]] 分辨率对齐在 Pillow 层最便宜**
5. **保存参数是数据集工程的一部分**，不是事后想想

## 延伸阅读

- 官方手册：[pillow.readthedocs.io](https://pillow.readthedocs.io/)
- [[numpy]] —— 数组互转
- [[matplotlib]] —— `plt.imshow(np.array(im))`
- [[pytorch]] / torchvision —— 下游 tensor 管线
- [[clip]] —— 336 短边预处理语境

## 关联

- [[numpy]] —— ndarray 桥梁
- [[matplotlib]] —— 显示与调试
- [[pytorch]] —— 训练张量下游
- [[clip]] —— 视觉输入尺寸语境
- [[llava]] / [[llava-next]] —— 多模态图像支路
- [[label-studio]] —— 标注导出再处理
- [[cvat]] —— 掩膜 PNG 合并
- [[decord]] —— 视频帧；图像侧用 Pillow 分工
- [[ffmpeg]] —— 视频抽帧后仍可能 Pillow 存缩略图
- [[lmms-eval]] —— 图像题加载路径参考

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
