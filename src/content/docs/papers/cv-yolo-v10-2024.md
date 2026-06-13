---
title: YOLOv10: Real-Time End-to-End Object Detection
来源: https://arxiv.org/abs/2405.14458
日期: 2026-06-13
分类: 机器学习
子分类: computer-vision
provenance: pipeline-v3
---

# YOLOv10: Real-Time End-to-End Object Detection

## 一、背景：为什么需要 YOLOv10？

想象你在超市收银台。过去 YOLO 的做法是这样的：摄像头拍到商品 → 机器识别出"这里有苹果、这里有香蕉" → 但是！机器可能会在同一个苹果上标出 5 个重叠的框（因为它的训练方式是一对多：一个真实物体对应多个预测框）。于是还需要一个"去重员"（NMS，非极大值抑制）把这些重叠的框挑出最好的一个。这个"去重员"就是非极大值抑制（Non-Maximum Suppression），它是一个后处理步骤。

YOLOv10 要解决的就是这个"去重员"的问题。它想让整个流程变成：**照片进去，结果直接出来**，中间不需要任何后处理步骤。这就是"end-to-end"（端到端）的含义。

## 二、核心问题：NMS 是什么，为什么它是个麻烦？

在深入之前，先理解 NMS。

YOLO 这类目标检测模型在训练时，通常采用**一对多**（one-to-many）策略：一个真实物体（比如一只猫）会对应多个预测框。训练效果确实好，但推理时就会有很多重叠框。NMS 的工作就是：把重叠度（IoU）超过阈值的框中，只保留置信度最高的那个。

问题出在哪？

1. **速度慢**：NMS 是一个串行循环过程，没法很好地利用 GPU 并行计算。
2. **不够端到端**：它是独立于模型的外部步骤，打破了模型的完整性。
3. **超参数敏感**：NMS 的置信度阈值和 IoU 阈值都需要手动调，不同场景可能需要不同设置。
4. **无法微分**：NMS 不可导，无法与模型端到端联合优化。

YOLOv10 的核心目标：让模型在推理时**完全不需要 NMS**，同时保持甚至超越有 NMS 时的性能。

## 三、核心创新：一致性双分配（Consistent Dual Assignments）

这是 YOLOv10 论文最重要的贡献，解决了"去 NMS"的问题。

### 3.1 双分配的思想

YOLOv10 给模型装了两条"流水线"：

- **一对多分支（one-to-many）**：训练时负责学习。一个真实物体对应多个正样本，提供丰富的监督信号，类似"多人一起帮学生做题"。
- **一对一支配（one-to-one）**：推理时负责输出。一个真实物体只对应一个预测框，没有冗余，类似"每个学生独立交一份答案"。

关键问题来了：如果两个分支各自学各的，推理时一对一支配输出的质量可能不够好。所以需要让两个分支**协调学习**。

### 3.2 一致匹配度量（Consistent Matching Metric）

为了让两个分支协调，作者设计了一种**一致匹配度量**。简单说，就是给两个分支用的"评分标准"保持一致。这样一对多分支学到的好模式，可以自然地迁移到一对一支配上，缩小所谓的"监督差距"（supervision gap）。

### 3.3 训练与推理的分工

整个流程可以概括为：

```
训练阶段：
  一对多分支 ←→ 一对一支配 （一起学，互相协调）
  
推理阶段：
  只有 → 一对一支配 （干净输出，无需 NMS）
```

这个设计的妙处在于：训练时用"众人拾柴"的丰富监督，推理时用"精准打击"的干净输出。两全其美。

## 四、核心创新：整体效率-精度驱动模型设计

除了去 NMS，YOLOv10 还对模型架构做了全面优化，从效率（快）和精度（准）两个角度。

### 4.1 轻量化分类头

传统 YOLO 的检测头同时做两件事：框的位置回归 + 物体分类。YOLOv10 把分类头做了轻量化，减少了计算冗余。

### 4.2 空间-通道解耦下采样

下采样（降低特征图分辨率）是卷积神经网络的关键操作。YOLOv10 将空间维度和通道维度的下采样解耦，减少了参数量和计算量。

### 4.3 大核卷积（Large-kernel Convolution）

在深层网络中使用更大的卷积核（比如 7x7），可以增大感受野，增强模型对大目标和全局信息的理解能力。但只在浅层用 3x3，避免对小物体 detection 造成伤害。

### 4.4 部分自注意力（PSA, Partial Self-Attention）

自注意力（self-attention）有强大的全局建模能力，但计算复杂度太高。PSA 的做法是：把特征通道对半切开，只有一半拿去经过注意力模块，另一半直接流过，最后再融合。这样既保留了全局感受能力，又大幅降低了计算量。

## 五、性能数据一览

YOLOv10 提供了 N/S/M/B/L 五种尺度。以 S 规模为例，在 COCO val 集上的表现：

| 模型 | 参数量(M) | FLOPs(G) | AP(%) | 延迟(ms) |
|------|-----------|----------|-------|----------|
| YOLOv8-S | 11.2 | 28.6 | 44.9 | 7.07 |
| YOLOv10-S | 7.2 | 21.6 | 46.3 | 2.49 |

YOLOv10-S 比 YOLOv8-S 快了将近 3 倍，精度还高了 1.4 个点。

## 六、代码示例

### 示例一：使用 ultralytics 加载 YOLOv10 进行推理

```python
# 安装: pip install ultralytics
from ultralytics import YOLO

# 加载预训练模型（YOLOv10 已有官方 ultralytics 支持）
# 可用模型: yolo10n, yolo10s, yolo10m, yolo10b, yolo10l, yolo10x
model = YOLO("yolo10s.pt")

# 对单张图像进行推理
# 注意：由于去除了 NMS，不需要设置 nms 相关参数
results = model.predict("path/to/image.jpg", conf=0.25, iou=0.7)

# 获取检测结果
for result in results:
    boxes = result.boxes  # 检测框
    for box in boxes:
        class_id = int(box.cls)
        confidence = float(box.conf)
        bbox = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
        print(f"类别: {class_id}, 置信度: {confidence:.3f}, 框: {bbox}")

# 保存带框结果的图像
results[0].show()
```

### 示例二：批量推理 + 自定义类别过滤

```python
from ultralytics import YLO
import cv2

# 加载模型
model = YOLO("yolo10m.pt")

# 定义要检测的 COCO 类别
# COCO 80 类: person=0, bicycle=1, car=2, ... , dog=44
TARGET_CLASSES = {0: "person", 2: "car", 16: "bird"}

# 批量处理
image_paths = ["img1.jpg", "img2.jpg", "img3.jpg"]

for img_path in image_paths:
    results = model.predict(
        img_path,
        conf=0.25,
        imgsz=640,
        device="cuda",       # GPU 推理
        half=True,           # FP16 加速
        augment=False
    )
    
    result = results[0]
    boxes = result.boxes
    
    for box in boxes:
        cls_id = int(box.cls)
        if cls_id not in TARGET_CLASSES:
            continue
        
        # 手动获取框坐标（不需要 NMS，数据已去重）
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        conf = float(box.conf)
        label = TARGET_CLASSES[cls_id]
        
        # 用 OpenCV 绘制
        img = cv2.imread(img_path)
        cv2.rectangle(img, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
        cv2.putText(img, f"{label}: {conf:.2f}", (int(x1), int(y1)-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    
    cv2.imwrite(f"result_{img_path}", img)
    print(f"已处理: {img_path}")
```

### 示例三：导出为 ONNX 格式用于生产部署

```python
from ultralytics import YOLO

model = YOLO("yolo10s.pt")

# 导出为 ONNX（适用于 C++ / 嵌入式 / Web 部署）
# do_norm=True 是 YOLOv10 的关键：框坐标已做归一化处理
# 无需 NMS，直接输出
model.export(format="onnx", simplify=True, dynamic=False, imgsz=640)

# 导出为 TensorRT（NVIDIA GPU 最高加速）
model.export(format="engine", device=0, half=True, imgsz=640)
```

## 七、关键概念对照表

| 术语 | 日常类比 | 技术含义 |
|------|---------|---------|
| 一对多训练 | 多人一起解题 | 一个真实物体对应多个正样本预测 |
| 一对一推理 | 独立交卷 | 一个真实物体只输出一个最佳预测框 |
| NMS | 去重员 | 非极大值抑制，剔除重叠预测框 |
| 端到端 | 直达 | 不需要后处理，模型直接输出最终结果 |
| 监督差距 | 两位老师教出不同水平的学生 | 两个分支因评分标准不同导致的能力差距 |
| 一致匹配度量 | 统一评分标准 | 让两个分支使用相同的匹配规则，协调学习 |
| 感受野 | 视野范围 | 卷积核能"看到"的输入区域大小 |
| 部分自注意力 | 只做一半的精细阅读 | 自注意力的轻量版，只处理一半特征通道 |

## 八、总结

YOLOv10 的核心贡献可以浓缩为一句话：**用一致双分配取代 NMS，实现真正的端到端实时目标检测**。它从两个维度推进了 YOLO 系列：

1. **后处理层面**：一致性双分配消除了对 NMS 的依赖，推理速度大幅提升，且实现了真正的端到端。
2. **架构层面**：轻量化分类头、解耦下采样、大核卷积和 PSA 模块，让模型在更小的计算开销下获得更高的精度。

对于学习 YOLO 系列的初学者来说，YOLOv10 标志着 YOLO 从"one-to-many + NMS"范式向"pure one-to-one"范式的重要转折点。理解了 YOLOv10，也就理解了当前目标检测领域一个重要的设计哲学：**去掉所有不必要的中间步骤，让模型自己学会端到端的映射。**
