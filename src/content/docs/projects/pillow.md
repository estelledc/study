---
title: Pillow — Python 图像处理
来源: 'https://github.com/python-pillow/Pillow'
日期: 2026-07-09
分类: media
难度: 初级
---

## 是什么

Pillow 是 **Python 里最常用的图像打开、转换、裁剪、缩放和绘制库**。日常类比：它像 Python 后厨里的一块案板，图片进来先被摆成像素，再切、缩、转格式、加字，最后装盘成新文件。

它是 PIL（Python Imaging Library）的活跃 fork。PIL 很早就让 Python 能处理图片，但后来维护变慢；Pillow 接过接口和生态，继续支持新 Python、新格式和安全修复。

最小例子：

```python
from PIL import Image

with Image.open("photo.jpg") as im:
    print(im.format, im.size, im.mode)
    im.resize((320, 240)).save("small.jpg")
```

这段代码做了三件事：打开文件、读出格式和尺寸、输出一张缩小版。你不用自己解析 JPEG 字节，也不用手写像素循环。

Pillow 在 GitHub 上约 12.3k stars，但它的真实影响力更大：很多 Web 后端、爬虫、数据集脚本、测试截图工具都在某个角落用它处理图片。

## 为什么重要

不理解 Pillow，下面这些事都很难解释：

- 为什么 Python 网站上传头像后，后端能自动生成缩略图、WebP 和预览图
- 为什么手机竖拍照片有时在网页里横着显示：EXIF 方向只是元数据，不一定已经改过像素
- 为什么 PNG 透明图直接存成 JPEG 会出问题：JPEG 没有 alpha 透明通道
- 为什么一张 5 MB 图片可能吃掉几百 MB 内存：真正处理的是解码后的像素面积

## 核心要点

Pillow 的心智模型可以拆成 **三层**：

1. **Image 对象是图片本体**：`Image.open()` 返回的不是文件名，而是一张可操作的图片对象。类比：把快递盒拆开后，东西本身放到桌上，后续操作都对这个东西做。

2. **mode 决定每个像素长什么样**：`RGB` 是红绿蓝三通道，`RGBA` 多一个透明通道，`L` 是灰度，`P` 是调色板。类比：同样一张表格，列数不同，能表达的信息也不同。

3. **格式读写靠插件和后缀**：打开时 Pillow 会看文件内容识别格式；保存时如果不显式给 `format`，通常根据输出后缀决定。类比：进口先验货，出口要看包装标签。

抓住这三点，很多报错会清楚很多：不是“图片坏了”，而是对象、像素模式、输出格式三者没对齐。

## 实践案例

### 案例 1：把用户上传图变成网页缩略图

真实场景：用户上传手机照片，网站需要旋正方向、限制尺寸、输出体积较小的 WebP。

```bash
python -m pip install --upgrade Pillow
python make_thumb.py
```

```python
from PIL import Image, ImageOps

with Image.open("upload.jpg") as im:
    im = ImageOps.exif_transpose(im)
    im.thumbnail((800, 800), Image.Resampling.LANCZOS)
    im.save("thumb.webp", quality=85, method=6)
```

逐部分解释：

- `Image.open` 打开上传图，但像素通常到真正处理时才完整解码
- `ImageOps.exif_transpose` 按 EXIF 方向旋正，并移除方向标记
- `thumbnail` 保持比例，把图片塞进 800x800 的盒子，而且会原地修改对象
- `save(..., quality=85)` 输出 WebP，适合网页预览和缩略图

### 案例 2：给运营图自动加标题卡片

真实场景：每天生成小红书、博客或分享页封面，标题来自程序，不想打开设计软件手动排版。

```python
from PIL import Image, ImageDraw, ImageFont

card = Image.new("RGB", (1200, 630), "#f8fafc")
draw = ImageDraw.Draw(card)

try:
    title_font = ImageFont.truetype("Arial.ttf", 56)
except OSError:
    title_font = ImageFont.load_default()

draw.rounded_rectangle((60, 60, 1140, 570), radius=32, fill="#ffffff")
draw.text((110, 130), "Pillow 图像处理入门", fill="#0f172a", font=title_font)
draw.text((110, 230), "自动生成封面，而不是手动截图", fill="#475569")
card.save("cover.png")
```

逐部分解释：

- `Image.new` 从零创建一张空白 RGB 图，尺寸就是社交卡片常用比例
- `ImageDraw.Draw` 给图片接上画笔，可以画矩形、线条、文字
- `truetype` 尝试加载系统字体，失败时回退到默认字体，避免脚本直接崩
- `rounded_rectangle` 和 `text` 都是直接把像素画到当前图片上

### 案例 3：批量整理数据集图片

真实场景：机器学习或测试数据来自不同来源，格式、透明度、方向都不统一，先清洗成统一 PNG 再交给后续脚本。

```bash
mkdir -p normalized
python normalize_images.py
```

```python
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError

src = Path("raw")
dst = Path("normalized")

for path in src.iterdir():
    try:
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("RGBA")
            im.save(dst / f"{path.stem}.png")
    except (OSError, UnidentifiedImageError):
        print("skip:", path.name)
```

逐部分解释：

- `Path.iterdir()` 遍历原始素材目录，不假设文件后缀一定可信
- `UnidentifiedImageError` 专门处理“这不是 Pillow 认识的图片”
- `convert("RGBA")` 把不同输入统一成带透明通道的像素模式
- 输出文件名统一成 `.png`，后续脚本不用再猜 JPEG、BMP、GIF 的差异

## 踩过的坑

1. **`Image.open()` 是懒加载**：它先读文件头，像素到 `load()`、`resize()`、`save()` 时才真正解码，所以文件句柄和 `with` 作用域要处理好。
2. **`thumbnail()` 会原地修改图片**：想保留原图对象就先 `copy()`，否则后面继续用时尺寸已经变了。
3. **`mode` 和输出格式不匹配会报错**：`RGBA` 直接保存 JPEG 常见失败，因为 JPEG 不支持透明通道，通常要先铺背景再 `convert("RGB")`。
4. **大图风险按像素算，不按文件大小算**：不可信上传要注意 `DecompressionBombWarning`，否则超大尺寸图片会拖垮内存。

## 适用 vs 不适用场景

**适用**：

- Web 后端生成头像、封面、缩略图、验证码、预览图
- Python 脚本批量转换图片格式、尺寸、方向和透明度
- 数据集清洗、截图对比、测试素材生成这类轻量图像流水线
- 需要和 `numpy`、Web 框架、文件系统脚本一起工作的普通工程任务

**不适用**：

- 复杂计算机视觉算法和相机几何，优先看 [[opencv]]
- 高吞吐图片服务和流式解码压缩，Node 场景常看 [[sharp]]
- 批量命令行转图、PDF/SVG 管道和运维脚本，[[imagemagick]] 更直接
- 视频解码、转码、抽帧和封装，应该交给 [[ffmpeg]]

## 历史小故事（可跳过）

- **1995 年前后**：Fredrik Lundh 开始维护 PIL，让 Python 能用统一接口读写多种图片。
- **2009 年**：PIL 1.1.7 成为最后一个正式版本，之后长期没有新发布。
- **2010 年前后**：Jeffrey Alex Clark 和社区启动 Pillow，目标是让 PIL 接口继续在现代 Python 里可安装、可测试、可发布。
- **Pillow 2.0**：项目加入 Python 3 支持，并吸收许多社区修复，fork 才真正从“打包补丁”变成活跃项目。
- **2020 年**：PyPI 上的 `PIL` 项目转交给 Pillow 团队，但团队明确不打算继续发布旧 `PIL` 包。

## 学到什么

1. **Pillow 的核心不是滤镜，而是图片 IO 的事实入口**：打开、识别、转换、保存是它最常用也最稳定的价值。
2. **图片处理先看 mode、size、format**：这三个属性像体检表，先看它们再决定怎么改。
3. **透明度、方向、元数据不是小细节**：真实用户上传图里，问题往往就藏在 EXIF、alpha 和颜色模式里。
4. **Python 图像流水线要先求稳，再求炫**：限制尺寸、处理异常、统一格式，比上复杂算法更早重要。

## 延伸阅读

- 官方仓库：[python-pillow/Pillow](https://github.com/python-pillow/Pillow)
- 官方教程：[Pillow Tutorial](https://pillow.readthedocs.io/en/stable/handbook/tutorial.html)
- 概念说明：[Concepts: modes, size, coordinates](https://pillow.readthedocs.io/en/stable/handbook/concepts.html)
- 图像格式表：[Image file formats](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html)
- 绘图 API：[ImageDraw module](https://pillow.readthedocs.io/en/stable/reference/ImageDraw.html)
- [[imagemagick]] —— 对照命令行图像处理的另一条路线

## 关联

- [[imagemagick]] —— 偏命令行批处理，Pillow 偏 Python 程序内调用
- [[opencv]] —— 偏计算机视觉和相机几何，Pillow 偏普通图片 IO 与编辑
- [[sharp]] —— Node.js 高性能图片处理库，常和 Pillow 解决相似 Web 后端问题
- [[jimp]] —— 纯 JS 图片处理库，和 Pillow 一样适合轻量脚本场景
- [[ffmpeg]] —— 处理视频和音频，Pillow 主要处理静态图和少量多帧图
- [[numpy]] —— Pillow 图片可以转成数组，进入数值计算或机器学习流水线
- [[fastapi]] —— Web 上传接口常把用户文件交给 Pillow 做校验和缩略图

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
