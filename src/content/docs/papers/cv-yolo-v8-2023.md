---
title: YOLOv8: A Neural Network for Object Detection and Segmentation
来源: https://github.com/ultralytics/ultralytics
日期: 2026-06-13
分类: 机器学习
子分类: computer-vision
provenance: pipeline-v3
---

# YOLOv8: A Neural Network for Object Detection and Segmentation

## 1. 日常类比：超市收银员的眼睛

想象你在一家大型超市购物。当你推着购物车走过货架时，你的大脑能瞬间完成以下事情：

- 看到前方有个"人"
- 知道那是一辆"购物车"
- 认出那是一个"苹果"
- 同时还能判断这些东西离你有多近、在什么位置

这就是**目标检测**（Object Detection）要做的事：给电脑一双眼睛，让它能同时回答两个问题——"这里有什么？"和"它在哪里？"

传统的计算机视觉方法像是一个死记硬背的收银员：你需要事先规定好每一个商品的精确尺寸、颜色和形状特征。而 YOLOv8 像是一个看了上百万张超市照片的老员工——它不需要你告诉它苹果长什么样，它自己从数据中"学会"了。

## 2. YOLOv8 是什么

YOLOv8 由 Ultralytics 公司在 **2023 年 1 月 10 日**发布。它是 YOLO 系列（You Only Look Once）的第八个版本，经过多年研究和迭代，是目前工业界使用最广泛的实时目标检测框架之一。

"YOLO"这个名字的含义是：模型只需要**看一次**图像就能完成检测，不需要像旧方法那样反复扫描同一张图片多次。这让它既快又准。

## 3. 核心概念

### 3.1 Backbone（骨干网络）

你可以把 Backbone 理解成眼睛的"视网膜"。它负责从输入图像中提取特征——边缘、纹理、形状，一直到更高级的语义信息（比如"这是一只猫的脸"）。YOLOv8 使用了经过优化的 CSPDarknet 架构作为 Backbone，能够在提取丰富特征的同时保持高效率。

### 3.2 Neck（颈部网络）

Neck 是连接 Backbone 和 Head 的中间层。它的作用是**融合不同层级的特征**。想象一下：视网膜看到的信息太底层（只有线条和色块），而你的大脑需要的是高层理解（"这是一辆车"）。Neck 把浅层的精细信息和深层的语义信息结合起来，就像把一个粗稿逐步细化成精美的设计稿。

### 3.3 Head（头部分割）

Head 是最终的"决策者"。它根据 Neck 融合好的特征，输出两样东西：

- **分类**：这个物体是什么？（猫、狗、汽车……）
- **定位**：这个物体在图片的哪个位置？（用边界框 bounding box 标出）

YOLOv8 的一个重大改进是使用了解耦头（Decoupled Head）：把分类和定位这两个任务分开处理，而不是塞进同一个层里。这就像让专做分类的部门和专做定位的部门各自发挥专长，而不是让一个人同时做两件事还经常出错。

### 3.4 Anchor-free 设计

早期的 YOLO 版本使用 anchor boxes（预设好的各种尺寸和形状的框），模型只需要判断"哪个预设框最合适"。YOLOv8 去掉了 anchor，变成了 **anchor-free**。这就像是取消了标准尺寸的衣服，让模型可以为每个物体"量身定制"边界框，更加灵活和精确。

### 3.5 Loss 函数的三位一体

训练 YOLOv8 时，损失函数由三部分组成：

| 部分 | 作用 | 类比 |
|------|------|------|
| CIoU Loss | 边界框的定位精度 | 画得准不准？框画得越小越好 |
| DFL (Distribution Focal Loss) | 优化边界框的精细定位 | 框的边角有没有对齐？ |
| BCE Loss | 分类准确度 | 认得对不对？ |

## 4. YOLOv8 支持的任务

YOLOv8 不只是一个目标检测器，它是一个多面手：

- **检测**（Detect）：找出图片中有哪些物体，用方框标出来
- **分割**（Segment）：比检测更进一步，精确勾勒出每个物体的轮廓（像素级）
- **姿态估计**（Pose）：识别人体的关键关节点（比如手肘、膝盖的位置）
- **分类**（Classify）：判断整张图片属于哪个类别
- **旋转框检测**（OBB）：检测任意角度旋转的物体（比如航拍图中的飞机）

## 5. 代码示例

### 示例 1：加载预训练模型并做检测

这是最基础的使用方式。安装 `ultralytics` 包后，只需几行代码就能运行 YOLOv8：

```python
from ultralytics import YOLO

# 第一步：加载预训练的 YOLOv8n（nano 版本，最小的模型）
# 模型文件会自动从网络上下载，支持 yolo8n.pt / yolo8s.pt / yolo8m.pt / yolo8l.pt / yolo8x.pt
model = YOLO("yolo8n.pt")

# 第二步：查看模型信息（参数量、层数等）
model.info()

# 第三步：对一张图片做目标检测
results = model("path/to/your/image.jpg")

# 第四步：查看检测结果
# results[0] 是检测结果对象，可以这样访问：
for box in results[0].boxes:
    class_id = int(box.cls)        # 物体类别编号
    confidence = float(box.conf)   # 置信度（0~1之间）
    bbox = box.xyxy[0].tolist()    # 边界框坐标 [x1, y1, x2, y2]
    print(f"类别ID: {class_id}, 置信度: {confidence:.2f}, 位置: {bbox}")

# 第五步：显示检测结果的可视化图片
results[0].show()
```

这个流程可以类比为：买好相机（加载模型）→ 检查相机参数（info）→ 拍一张照片（predict）→ 分析照片内容（遍历结果）→ 把拍好的照片给你看（show）。

### 示例 2：用自定义数据训练 YOLOv8 模型

如果你想让 YOLOv8 学会识别你自己的物体（比如自家猫的品种），需要用自己的数据来训练：

```python
from ultralytics import YOLO

# 第一步：加载预训练的基础模型（它已经见过 COCO 数据集中 80 种常见物体了）
model = YOLO("yolo8n.pt")

# 第二步：开始训练
# data: 数据集配置文件（YAML格式），指定训练集、验证集的路径和类别列表
# epochs: 训练轮数，每轮都会遍历一遍全部训练数据
# imgsz: 输入图片的尺寸，640 是标准尺寸
# batch: 每次训练送入模型的图片数量，显存不够就调小
# device: 使用哪块GPU，"cpu"表示用CPU，"0"表示用第0块GPU
results = model.train(
    data="my_dataset.yaml",  # 数据集配置文件
    epochs=100,              # 训练 100 轮
    imgsz=640,               # 输入图片 640x640
    batch=16,                # 每批 16 张图片
    device="0",              # 使用 GPU 0
    name="my_cat_detector",  # 这个项目起名
)

# 第三步：在验证集上评估训练好的模型
metrics = model.val()
print(f"验证集 mAP (0.5-0.95): {metrics.box.map:.3f}")

# 第四步：导出模型为 ONNX 格式，方便部署到生产环境
path = model.export(format="onnx")
print(f"模型已导出到: {path}")
```

数据集配置文件 `my_dataset.yaml` 的格式大致如下：

```yaml
path: ./datasets/my_cats          # 数据集根目录
train: images/train               # 训练集图片路径
val: images/val                   # 验证集图片路径

# 类别列表
names:
  0: orange_cat
  1: black_cat
  2: white_cat
```

## 6. 性能速览

YOLOv8 提供了从 nano 到 extra-large 五个尺寸版本，供不同场景选择：

| 模型 | 参数量 (M) | mAP (COCO) | GPU 推理速度 (ms) |
|------|-----------|-----------|------------------|
| YOLOv8n | 3.2 | 37.3 | 0.99 |
| YOLOv8s | 11.2 | 44.9 | 1.20 |
| YOLOv8m | 25.9 | 50.2 | 1.83 |
| YOLOv8l | 43.7 | 52.9 | 2.39 |
| YOLOv8x | 68.2 | 53.9 | 3.53 |

mAP（mean Average Precision）是目标检测最常用的评测指标，数值越高说明检测越准。可以看到，即使是极小的 nano 版本，在 A100 GPU 上推理一张图片也只需不到 1 毫秒，这意味着每秒可以处理上千张图片——真正做到了**实时**。

## 7. YOLOv8 的传承与局限

### 传承

YOLO 系列从 v1 到 v8 经历了显著的演进。v1 是一个开创性的想法——"能不能只用一个网络同时做分类和定位"。v5 引入了模块化设计和数据增强技巧，v8 在此基础上做了架构级优化（解耦头、anchor-free、更高效的 Backbone）。

### 局限

根据 Ultralytics 官方说明，YOLOv8 **没有发表正式的学术论文**。这既意味着它快速迭代的灵活性，也意味着学术界对其架构设计的动机和理论分析不够充分。Ultralytics 更专注于让工具好用，而不是写论文。

## 8. 小结

YOLOv8 的核心贡献可以用三个词概括：**快**、**准**、**易**。

- **快**：实时推理，GPU 上一张图不到 1 毫秒
- **准**：在多个任务上达到当前最优水平
- **易**：安装一行命令（`pip install ultralytics`），使用只需几行 Python 代码

对于零基础的学习者来说，YOLOv8 是最好的入门门槛之一。它不需要你理解复杂的数学公式就能开始使用，等你用得熟练了，再回头研究它 Backbone 里的每一个卷积层是怎么设计的，会更有收获。

## 9. 下一步学习方向

如果想进一步理解 YOLOv8 背后的原理，可以按照以下顺序深入学习：

1. **CNN 基础**：理解卷积层、池化层、激活函数的作用（推荐从卷积神经网络的基础知识开始）
2. **ResNet / Darknet**：了解 YOLOv8 的 Backbone 架构
3. **FPN / PANet**：了解颈部网络如何融合多尺度特征
4. **IoU Loss**：学习边界框回归的损失函数设计
5. **NMS（非极大值抑制）**：理解如何去除重复的检测结果
