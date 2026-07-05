---
title: "Waymo Open Dataset: A Large-Scale Dataset for Autonomous Driving"
来源: https://waymo.com/intl/en-us/research/
日期: 2026-06-13
分类: 计算机视觉
难度: 中级
---

# Waymo Open Dataset: 自动驾驶的"ImageNet"

## 0. 先打个比方

你学画画，第一件什么事？临摹大师的作品。而且不止一幅——你得看上千幅不同风格、不同光线、不同题材的画，才能真的"学会画画"。

在人工智能领域，**图像识别**的启蒙教材就是 **ImageNet**——一个包含 1400 万张标注图片的数据集。2012 年，AlexNet 靠着 ImageNet 一战成名，开启了深度学习革命。

Waymo Open Dataset (WOD) 做的事情一模一样——只不过它不是教 AI "认猫认狗"，而是教 AI "安全地开车"。

**一句话总结：** WOD 是自动驾驶感知领域的 ImageNet，一个超大规模、高质量标注的多模态数据集，让全世界研究自动驾驶的学者都有"教材"可用。

---

## 1. 论文信息

- **标题：** Scalability in Perception for Autonomous Driving: Waymo Open Dataset
- **发表：** CVPR 2020 (arXiv: 1912.04838)
- **团队：** Waymo (Google 旗下自动驾驶公司)
- **核心作者：** Pei Sun, Henrik Kretzschmar, Xerxes Dotiwalla 等 24 人

---

## 2. 为什么需要 WOD？

### 2.1 之前的数据集太小、太单调

想象一下：如果你的自动驾驶 AI 只在加州的阳光下面练车，它到了纽约的雪天、旧金山的雾天就全傻眼了。这就是 **domain gap（领域差距）** 问题。

在 WOD 之前，主流数据集（如 KITTI、nuScenes）存在以下问题：

| 问题 | 具体表现 |
|------|---------|
| 规模太小 | KITTI 只有约 150 个场景、38K 帧；WOD 有 1150 个场景、超过 10 万帧 |
| 地理单一 | 很多数据集只在 1-2 个城市采集，缺乏多样性 |
| 标注粗糙 | 2D 框为主，3D 标注质量不稳定 |
| 传感器不同步 | 相机和 LiDAR 时间戳未精确对齐，无法做可靠的传感器融合 |

### 2.2 核心问题：可伸缩性（Scalability）

论文的标题里有一个关键词：**Scalability**。

什么叫"感知任务的可伸缩性"？简单说就是：**当数据集规模扩大 10 倍、100 倍时，AI 的感知能力能跟上吗？** 以前的数据集太小，根本没法回答这个问题。WOD 的设计初衷就是让这个问题**变得可实验、可测量**。

---

## 3. 数据集核心规格

### 3.1 基本数据

| 指标 | WOD 数值 |
|------|---------|
| 场景数 | **1,150 个**场景 |
| 每场景时长 | **20 秒** |
| 总时长 | 约 **20 小时**原始数据 |
| 采集城市 | **San Francisco, Phoenix, Mountain View** |
| LiDAR 点云帧 | 约 **1.2 亿帧** |
| 相机图像帧 | 约 **1.2 亿帧** |
| 3D 标注框 | 约 **1200 万个** |
| 2D 标注框 | 约 **1200 万个** |
| LiDAR 跟踪序列 | 约 **11.3 万个** |
| 相机图像跟踪序列 | 约 **25 万个** |

### 3.2 传感器配置

Waymo 的车顶搭载了一套工业级传感器套件，包括：

1. **LiDAR（激光雷达）x 5 个** —— 提供高精度的 3D 点云数据
2. **相机 x 6 个** —— 提供高分辨率的 2D 图像（前向 3 个、侧向 2 个、后向 1 个）
3. **毫米波雷达** —— 用于速度测量
4. **GPS/IMU** —— 定位和姿态信息

关键设计：**所有传感器的数据都经过了精确的时间同步和空间标定**。这意味着 LiDAR 的 3D 框可以直接"投影"到相机的 2D 图像上——这是做**多传感器融合（sensor fusion）** 的前提。

### 3.3 标注体系

WOD 的标注有 5 个类别，对应现实中的 5 种道路参与者：

| 类别 ID | 名称 | 说明 |
|---------|------|------|
| 1 | **Vehicle** | 车辆（轿车、卡车、公交车等） |
| 2 | **Pedestrian** | 行人 |
| 3 | **Cyclist** | 骑行者 |
| 4 | **Sign** | 交通标志（限速牌、停车标志等） |
| 5 | **Other** | 其他（动物、路障等） |

每个标注框包含：
- **3D 边界框**（LiDAR 坐标系下：x, y, z, length, width, height, heading）
- **2D 边界框**（投影到各相机图像）
- **track_id**（跨帧一致的跟踪 ID，用于目标跟踪任务）
- **2D amodal box**（即使被遮挡也能推断完整轮廓）

---

## 4. 核心概念详解

### 4.1 3D 检测（3D Object Detection）

**类比：** 想象你在雾中开车，需要用雷达"扫描"出周围每辆车的精确位置和大小，而不仅仅是知道"那边有个东西"。

3D 检测就是让 AI 从 LiDAR 点云中"画出"每个物体的 3D 长方体框，并识别它是什么。这是自动驾驶系统感知模块最核心的任务之一。

**评估指标：NDS（NuScenes Detection Score）** —— 综合考虑了检测精度、定位精度、分类精度和跟踪质量的综合得分。

### 4.2 目标跟踪（Object Tracking）

**类比：** 你在商场里跟着朋友走，即使他走到柱子后面不见了，你心里也记得"他在哪个方向"，等他出来时还能继续跟上。

目标跟踪就是让 AI 不仅"看到"物体，还**跨帧记住**每个物体。WOD 为每个标注都分配了唯一的 `track_id`，跨 20 秒的视频序列保持一致，这意味着同一辆车出现在第 1 帧和第 500 帧时，用的是同一个 ID。

### 4.3 地理多样性与 Domain Gap

WOD 的数据采集了三个城市：**旧金山**（多坡道、多雾、复杂地形）、**凤凰城**（平坦、干旱、阳光充足）、**Mountain View**（硅谷郊区、混合场景）。

这三个城市的驾驶场景差异极大，构成了天然的**域偏移实验**：

- 在旧金山训练的检测器，直接拿到凤凰城测试，性能会大幅下降（因为地形、建筑风格、植被完全不同）
- 这促使研究者开发**域适应（domain adaptation）** 算法

论文中提出了一种**地理覆盖率度量（geographical coverage metric）**，用这个指标量化数据集的多样性，WOD 比之前的数据集多出 **15 倍**的地理多样性。

### 4.4 传感器融合（Sensor Fusion）

LiDAR 提供精确的 3D 距离信息，但缺乏颜色和纹理；相机提供丰富的视觉信息，但深度信息不准确。

**传感器融合**就是把两种数据"合在一起用"，取长补短。WOD 因为提供了精确的时间同步和空间标定，使得研究者可以把 LiDAR 的 3D 框直接"投影"到相机的图像上，生成 **2D amodal box**（即使物体被遮挡也能推断完整轮廓）。

---

## 5. 代码示例

### 5.1 示例一：使用 Waymo Open Dataset Python API 读取场景

Waymo 官方提供了 Python API，可以像操作普通 Python 对象一样访问数据集。下面是一个最基础的读取示例：

```python
import numpy as np
from pyquaternion import Quaternion
from waymo_open_dataset import dataset_pb2
from waymo_open_dataset.protos import scene_pb2

# 打开一个 .tfrecord 格式的场景文件
# WOD 的原始数据存储在 TFRecord 格式中
dataset_path = "training/segment-xxxxxxxxxxx.tfrecord"

# 解析场景数据
scenes = []
for record in tf.data.TFRecordDataset(dataset_path, compression_type=""):
    scene = scene_pb2.Scene()
    scene.ParseFromString(record.numpy())
    scenes.append(scene)

# 提取第一个场景的信息
scene = scenes[0]
print(f"场景名称: {scene.scene_name}")
print(f"场景类型: {scene.scene_type}")  # 如: CITY_DRIVING
print(f"场景时长: {scene.context.stats.total_frames} 帧")

# 获取时间戳列表（每帧对应一个 LiDAR + 相机快照）
timestamps = [frame.timestamp_micros for frame in scene.frames]
print(f"第 0 帧时间戳: {timestamps[0]} 微秒")

# 遍历第一帧，提取 LiDAR 点云和标注
frame = scene.frames[0]

# 获取 LiDAR 点云（第 0 号 LiDAR 传感器）
point_cloud = frame.lasers[0].point_cloud
num_points = point_cloud.x.size
print(f"点云点数: {num_points}")

# 将点云提取为 numpy 数组
points = np.column_stack([
    point_cloud.x[:num_points],
    point_cloud.y[:num_points],
    point_cloud.z[:num_points]
])
print(f"点云形状: {points.shape}")  # (N, 3)
print(f"前 5 个点: {points[:5]}")

# 获取这一帧的 3D 边界框标注
for label in frame.projected_lidar_labels:
    for obj in label.object:
        print(f"\n  类别: {dataset_pb2.Label.Name(obj.type)}")
        print(f"  中心位置: x={obj.box.center_x}, y={obj.box.center_y}, z={obj.box.center_z}")
        print(f"  尺寸: l={obj.box.length}, w={obj.box.width}, h={obj.box.height}")
        print(f"  航向角: {obj.box.heading} rad")
        print(f"  跟踪 ID: {obj.id}")
        print(f"  遮挡状态: {obj.tracker_state}")
```

**代码说明：**
- 第 1 行导入 WOD 官方的 Python 包，里面包含了所有 proto 定义（Protobuf 数据结构）
- 第 8-11 行：WOD 数据存储在 `.tfrecord` 格式中（Google 的 protobuf 序列化格式），用 TensorFlow 的 `TFRecordDataset` 读取
- 第 21 行：`scene.frames` 按时间顺序排列，每一帧包含一次 LiDAR 扫描和 6 个相机的图像
- 第 32-36 行：将点云的 x/y/z 坐标提取为标准的 `(N, 3)` numpy 数组，这是大多数深度学习框架的输入格式
- 第 41-47 行：遍历 3D 标注框，打印每个物体的类别、位置、尺寸、方向和跨帧 ID

### 5.2 示例二：3D 边界框到相机图像的投影

WOD 提供了一个专门的库（`rolling_shutter`），可以精确地把 3D LiDAR 框投影到 2D 相机图像上。这是因为 Waymo 的相机使用的是**卷帘快门（rolling shutter）**，每一行像素的曝光时间略有不同，不能用普通针孔相机模型简单处理。

```python
from waymo_open_dataset.utils import frame_utils
from waymo_open_dataset.utils import box_utils
import matplotlib.pyplot as plt
import cv2

# 假设已经读取了一帧数据，存入变量 `frame`
# frame = scene.frames[frame_index]

# 使用 Waymo 官方投影工具
# box_utils.project_box_to_camera() 把 3D box 投影到 2D 相机平面
image = None  # 从 frame.lasers[0].image 获取相机图像
boxes_3d = []
scores = []
labels = []

for label in frame.projected_lidar_labels:
    for obj in label.object:
        # 提取 3D 框参数
        box_3d = box_utils.Box3D(
            center_x=obj.box.center_x,
            center_y=obj.box.center_y,
            center_z=obj.box.center_z,
            length=obj.box.length,
            width=obj.box.width,
            height=obj.box.height,
            heading=obj.box.heading
        )
        boxes_3d.append(box_3d)
        labels.append(dataset_pb2.Label.Name(obj.type))
        scores.append(obj.score)

# 把所有 3D 框投影到第 0 号激光雷达对应的相机（前向相机）
# project_box_to_camera 返回 2D 矩形框
boxes_2d = frame_utils.project_box_to_camera(
    boxes_3d=boxes_3d,
    box_type="3D",
    camera_name=dataset_pb2.CameraName.Name(frame.lasers[0].camera_name),
    camera_info=frame.lasers[0].image.camera_calibrations[0]
)

# 可视化：在相机图像上画出 2D 边界框
image = cv2.cvtColor(np.frombuffer(
    frame.lasers[0].image.image, dtype=np.uint8
).reshape(frame.lasers[0].image.height, frame.lasers[0].image.width, 3),
    cv2.COLOR_RGB2BGR)

colors = {
    "VEHICLE": (255, 0, 0),      # 蓝色 - 车辆
    "PEDESTRIAN": (0, 255, 0),   # 绿色 - 行人
    "CYCLIST": (0, 0, 255),      # 红色 - 骑行者
}

for i, box in enumerate(boxes_2d):
    label = labels[i]
    color = colors.get(label, (255, 255, 255))
    # 在图像上画矩形框
    top_left = (int(box.min_x), int(box.min_y))
    bottom_right = (int(box.max_x), int(box.max_y))
    cv2.rectangle(image, top_left, bottom_right, color, 2)
    # 在框上方标注类别
    cv2.putText(image, label, (top_left[0], top_left[1] - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

plt.figure(figsize=(16, 9))
plt.imshow(image)
plt.axis("off")
plt.title("Waymo Open Dataset: 3D Box Projection to Camera")
plt.tight_layout()
plt.savefig("wod_projection.png", dpi=150)
plt.show()
```

**代码说明：**
- 第 1-2 行：导入 `frame_utils` 和 `box_utils`——这是 Waymo 官方的投影和几何工具库
- 第 10-18 行：从 3D 标注中提取每个物体的框参数，构建 `Box3D` 对象
- 第 25-27 行：调用 `project_box_to_camera()` 把 3D 框投影到 2D 相机平面。注意这里传入的是第 0 号激光雷达对应的相机校准信息（`camera_calibrations`），它包含了相机的内参和 LiDAR-相机外参
- 第 31-35 行：从 `frame.lasers[0].image.image` 中提取图像像素数据，这是一个字节数组，需要 reshape 成图像形状
- 第 37-50 行：用 OpenCV 把 2D 投影框画在图像上，不同类别用不同颜色标注

---

## 6. 基线结果与学术影响

### 6.1 论文提供的基线

WOD 不只是"扔出一个数据集"，还同时提供了**强基线（strong baselines）**：

- **3D 检测基线：** 基于 PointPillars 架构，在 WOD 上达到约 **59.5 NDS**（单模态，仅 LiDAR）和约 **68.0 NDS**（多模态，LiDAR + 相机融合）
- **3D 跟踪基线：** 基于 DeepSORT 风格的跟踪框架

这些基线为后续研究者设立了清晰的起点。截至论文发表时，WOD 上最好的 3D 检测结果已经超过了 70 NDS。

### 6.2 数据集规模效应的发现

论文做了一组非常有意思的实验：**逐步减少训练数据量，观察性能变化**。

结果发现：
- 在 WOD 上，**训练数据越多，性能提升越明显**——这证明了自动驾驶感知任务的 scalability
- 在小型数据集上，增加数据量的收益很快饱和；而在 WOD 上，即使用了最大规模的数据，性能仍在持续提升

### 6.3 学术影响

WOD 发布以来，已经成为自动驾驶感知研究最重要的基准之一：

- 引用量超过 **3000+**（CVPR 2020 接收）
- 被广泛应用于 3D 检测、跟踪、语义分割、占位预测（occupancy prediction）等任务
- 推动了 BEV（鸟瞰图）视角的 3D 检测范式（如 BEVFormer、PV-RCNN 等）
- 其地理多样性指标（geographical coverage metric）启发了后续多个数据集的设计

---

## 7. WOD vs 其他主流数据集对比

| 维度 | Waymo Open Dataset | nuScenes | KITTI |
|------|-------------------|----------|-------|
| 发布年份 | 2020 | 2020 | 2012 |
| 场景数 | 1,150 | 1,000 | ~150 |
| 每场景时长 | 20 秒 | 20 秒 | ~40 秒 |
| 3D 标注框数 | ~1200 万 | ~650 万 | ~15 万 |
| 城市数量 | 3 | 2 (Boston, Singapore) | 1 (Heidelberg) |
| LiDAR 数量 | 5 | 1 | 1 |
| 相机数量 | 6 | 6 | 1 |
| 跟踪 ID | 支持 | 支持 | 不支持 |
| 地理多样性 | 极高 (15x) | 高 | 低 |

---

## 8. 学习小结

### 核心要点回顾

1. **WOD 是什么？** —— 自动驾驶感知领域的 ImageNet，1150 个场景、1200 万个 3D 标注框
2. **核心创新？** —— 大规模 + 地理多样性 + 多传感器精确同步 + 完整的跟踪标注
3. **为什么重要？** —— 让"数据集大小与性能的关系"第一次变成了可研究的科学问题
4. **核心技术栈？** —— LiDAR 点云 + 相机图像 + Protobuf/TensorFlow 数据存储
5. **学术影响？** —— 推动了 BEV 感知范式和多模态融合研究

### 延伸学习建议

- 官方 API 文档和代码：https://github.com/waymo-research/waymo-open-dataset
- 如果想动手跑起来，建议从 Google Colab 的官方 notebook 示例开始
- 进阶：了解 PointPillars（3D 检测基线）和 BEVFormer（BEV 范式代表）

---

## 参考链接

- 论文首页：https://waymo.com/intl/en-us/research/dataset/
- arXiv 论文：https://arxiv.org/abs/1912.04838
- 官方 GitHub：https://github.com/waymo-research/waymo-open-dataset
- 在线探索工具：https://waymo.com/intl/en-us/research/explorer/
