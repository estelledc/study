---
title: "Segment Anything (SAM) — 零基础学习笔记"
来源: https://arxiv.org/abs/2304.02643
日期: 2026-06-13
分类: 机器学习
子分类: cv
provenance: pipeline-v3
---

# Segment Anything (SAM) — 零基础学习笔记

## 一、一句话介绍

SAM（Segment Anything Model）是 Meta AI 在 2023 年发布的一个"图像分割基础模型"。

它的核心能力：**给图片中的任意东西画个框、点一下，它就能自动把那个东西的精确轮廓抠出来**。

## 二、日常类比

想象你有一叠透明的玻璃纸和一支笔。

以前的人工智能模型，就像每一叠玻璃纸上只画了一种东西的轮廓——画猫的只能抠猫，画车的只能抠车。如果你想抠一只狗，得从头训练一张新玻璃纸。

SAM 不一样。它学的是"抠东西"这个通用技能本身。你告诉它"抠这个"——不管是猫、车、树还是你家的沙发——它都能把精确轮廓画出来。这是因为它的训练目标不是"识别这是什么"，而是"找到这个东西的边界在哪"。

## 三、核心概念

### 3.1 图像分割（Image Segmentation）

在计算机视觉里，"分割"指的是把图片中的**每个像素**分类。

- **分类（Classification）**：这张图里有什么？——"这是一只猫"
- **检测（Detection）**：猫在哪？——用一个矩形框框住
- **分割（Segmentation）**：猫的每一个像素在哪？——沿着猫的轮廓逐像素标记

SAM 做的是**实例分割（Instance Segmentation）**：不仅标出轮廓，还能区分同一张图里的多只猫。

### 3.2 可提示（Promptable）

SAM 最核心的设计理念是"可提示"。你不需要告诉它"找猫"，而是可以通过三种方式"提示"它：

| 提示类型 | 说明 | 类比 |
|---------|------|------|
| **点提示（Point Prompt）** | 点在物体上，表示"抠这个" | 用鼠标点在目标上 |
| **框提示（Box Prompt）** | 画个矩形框，表示"抠框里的" | 画个选择框 |
| **文本提示（Text Prompt）** | 输入文字如"猫"，表示"抠出猫" | 搜索框里打关键词 |

同一个模型，三种提示随意组合：你可以在一张图里点一个点让模型抠出前景，同时画个框让它抠出背景。

### 3.3 基础模型（Foundation Model）

"基础模型"的概念和 LLM（大语言模型）类似：先在海量数据上做**大规模预训练**，然后**不需要重新训练**就能直接用在新的、没见过的新图片上。这就是所谓的"零样本（Zero-shot）泛化"。

### 3.4 模型架构

SAM 由三部分组成：

1. **图像编码器（Image Encoder）**：用 Vision Transformer (ViT-H) 把图片变成一串特征向量。ViT-H 有 6 亿个参数，是最大的一个变体。
2. **提示编码器（Prompt Encoder）**：把点的坐标、框的坐标或文字描述也编码成向量。
3. **掩码解码器（Mask Decoder）**：也是一个 Transformer，把图片特征和提示特征合在一起，输出分割掩码（mask）。

简单说：图片 → 变成数字特征；提示 → 也变成数字特征；两者一起输入 → 输出"哪些像素属于这个物体"的精确地图。

### 3.5 SA-1B 数据集

SAM 的强大来自它训练数据的规模：

- **1100 万张图片**
- **超过 10 亿个分割掩码**

这个规模远超之前所有分割数据集的总和。数据涵盖室内、室外、航拍、艺术画作等各种分布，这也是模型零样本泛化能力强的原因。

## 四、代码示例

### 4.1 用点提示和框提示做分割（Python）

```python
from segment_anything import sam_model_registry, SamPredictor
import cv2

# 加载预训练模型（SAM 有三个尺寸：tiny/small/base/huge）
sam = sam_model_registry["vit_h"](checkpoint="sam_vit_h_4b8939.pth")
predictor = SamPredictor(sam)

# 读取图片
image = cv2.imread("photo.jpg")
predictor.set_image(image)

# 用"点"提示：点在物体内部
# 坐标格式是 [x, y]
point_coords = [[500, 300]]
point_labels = [1]  # 1 表示点在物体内部，0 表示在背景

# 用"框"提示：标注物体的边界框 [x1, y1, x2, y2]
boxes = [[200, 100, 600, 500]]

# 一次性输入多种提示
masks, scores, logits = predictor.predict(
    point_coords=point_coords,
    point_labels=point_labels,
    box=boxes,
)

# masks 的形状是 (1, H, W)，值为 0 或 1，表示每个像素属于前景还是背景
# scores 是每个预测的置信度分数
print(f"生成 {len(masks)} 个掩码，置信度: {scores}")
```

### 4.2 批量自动生成分割掩码

```python
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator
import json

# 使用自动掩码生成器：不需要任何提示，自动把图中所有物体都抠出来
sam = sam_model_registry["vit_h"](checkpoint="sam_vit_h_4b8939.pth")
mask_generator = SamAutomaticMaskGenerator(sam)

# 对整张图做自动分割
annotations = mask_generator.generate(image)

# 每个 annotation 包含：
# - segmentation: 二值掩码 (H, W)
# - bbox: 边界框 [x, y, width, height]
# - area: 掩码像素数
# - predicted_iou: 模型对质量的自评
# - stability_score: 稳定性分数
# - segment_id: 唯一编号

print(f"检测到 {len(annotations)} 个物体实例")
for i, ann in enumerate(annotations):
    print(f"  物体 {i}: 面积={ann['area']}, 稳定性={ann['stability_score']:.3f}")

# 保存结果
with open("segmentation_results.json", "w") as f:
    # 掩码太大不保存，只存元数据
    meta = [{"bbox": a["bbox"], "area": a["area"]} for a in annotations]
    json.dump(meta, f)
```

### 4.3 用 Gradio 搭一个交互式演示

```python
import gradio as gr
import numpy as np
from segment_anything import sam_model_registry, SamPredictor
import cv2

sam = sam_model_registry["vit_h"](checkpoint="sam_vit_h_4b8939.pth")
predictor = SamPredictor(sam)

def segment_image(image, point_coords, point_labels, box):
    """点击图片 → 显示分割结果"""
    predictor.set_image(image)

    if point_coords:
        coords = np.array(point_coords)
        labels = np.array(point_labels) if point_labels else [1]
    else:
        coords = None
        labels = None

    masks, scores, _ = predictor.predict(
        point_coords=coords,
        point_labels=labels,
        box=np.array(box) if box else None,
    )

    # 把掩码叠加在原图上
    output = image.copy()
    for mask in masks:
        overlay = np.zeros((*image.shape[:2], 4), dtype=np.uint8)
        overlay[mask] = [255, 0, 0, 128]  # 红色半透明
        output = cv2.addWeighted(output, 1, overlay, 1, 0)

    return output

demo = gr.Interface(
    fn=segment_image,
    inputs=[
        gr.Image(type="numpy", label="上传图片"),
        gr.Number(label="点坐标 X"),
        gr.Number(label="点坐标 Y"),
        gr.Number(label="框左上X"),
        gr.Number(label="框左上Y"),
        gr.Number(label="框右下X"),
        gr.Number(label="框右下Y"),
    ],
    outputs=gr.Image(type="numpy", label="分割结果"),
)
demo.launch()
```

## 五、SAM 能做什么

- **医学图像分析**：自动分割器官、肿瘤等结构
- **遥感图像处理**：从卫星图中分割建筑、道路、植被
- **自动驾驶**：精确识别道路上的每个物体轮廓
- **内容编辑**：像 Photoshop 一样快速抠图
- **机器人视觉**：让机器人识别并抓取不同物体

## 六、局限

- **大**：ViT-H 有 6 亿参数，推理较慢，不适合手机端部署
- **无语义信息**：SAM 不知道"这是猫还是狗"，它只告诉你"这些像素是一体的"
- **文本提示效果有限**：相比点/框提示，文本提示的精度较低
- **不能处理视频帧间一致性**：每帧单独处理，可能导致视频中物体轮廓闪烁

## 七、与 CLIP 的对比

| | SAM | CLIP |
|---|---|---|
| 任务 | 图像分割（像素级） | 图像分类（图片级） |
| 输出 | 精确的物体轮廓 | 图片属于哪一类 |
| 提示方式 | 点、框、文本 | 文本描述 |
| 类比 | 给你一个"精确的抠图工具" | 给你一个"看图说话工具" |

两者都是 Meta 发布的多模态基础模型，可以组合使用：CLIP 先告诉你"这是一只猫"，SAM 再帮你把猫精确抠出来。

## 八、总结

SAM 的意义不在于某个具体任务的性能有多高，而在于它开创了"可提示的分割基础模型"这个新范式。它证明：当训练数据够大、模型设计够通用时，一个模型可以"学会分割"，然后对任何新图片、任何新物体都工作——这正是基础模型的核心愿景。
