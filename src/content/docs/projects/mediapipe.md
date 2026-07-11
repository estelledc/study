---
title: MediaPipe — Google ML 多模态流水线
来源: 'https://github.com/google-ai-edge/mediapipe'
日期: 2026-07-09
分类: media
难度: 初级
---

## 是什么

MediaPipe 是 Google AI Edge 维护的端侧机器学习流水线项目：它把摄像头、麦克风、模型推理、后处理和结果渲染串成一条可复用的管道。

日常类比：像一家快餐店的后厨流水线。有人洗菜，有人切菜，有人下锅，有人装盘；MediaPipe 让每个步骤都变成一个小工位，并保证食材按顺序流过。

最小使用感可以先从 Tasks API 开始，不必一上来写底层 graph：

```bash
python -m pip install mediapipe
```

```python
import mediapipe as mp

BaseOptions = mp.tasks.BaseOptions
GestureRecognizer = mp.tasks.vision.GestureRecognizer
GestureRecognizerOptions = mp.tasks.vision.GestureRecognizerOptions

options = GestureRecognizerOptions(
    base_options=BaseOptions(model_asset_path="gesture_recognizer.task"))
with GestureRecognizer.create_from_options(options) as recognizer:
    result = recognizer.recognize(mp.Image.create_from_file("hand.jpg"))
    print(result.gestures)
```

底层仍然是更通用的 MediaPipe graph，只是高层 API 把复杂管线包起来了。

## 为什么重要

不理解 MediaPipe，下面这些事会很难解释：

- 为什么手势、姿态、人脸、物体检测这些功能可以跨 Python、Android、Web、桌面复用同一类模型包。
- 为什么实时视频不能只写 `for frame in camera`；还要考虑节流、时间戳、队列、丢帧和同步。
- 为什么端侧 AI 不等于把模型扔进 App；预处理、推理、后处理、渲染常常比模型本身更难接稳。
- 为什么 Edge TPU / GPU / CPU 切换不是“换个参数”这么简单；模型格式、delegate、编译选项和硬件限制都要对齐。

## 核心要点

1. **Tasks API 像成品套餐**：手势识别、姿态关键点、人脸关键点、音频分类等任务已经封装好。新人先用它，能快速看到输入、模型、输出之间的关系。

2. **Graph 像后厨动线图**：底层 `CalculatorGraphConfig` 把每个 `node` 连起来，每个 node 是一个 calculator。你可以把图理解成“图片从哪里来、经过哪些步骤、最后从哪里出去”的路线图。

3. **Calculator 像流水线工位**：一个 calculator 只做一类小事，例如缩放图片、把图片转 tensor、跑 TFLite、做 NMS、画框。拆小以后，同一块逻辑可以在不同 pipeline 里复用。

4. **Delegate 像选择厨具**：CPU 通用但慢，GPU 适合实时图像，Edge TPU 适合低功耗离线推理。MediaPipe 的价值不是只会跑模型，而是让模型、硬件和应用输入输出接成一体。

## 实践案例

### 案例 1：用 Gesture Recognizer 做手势按钮

真实场景：网页或桌面应用想让用户伸出手势来触发“下一页”“暂停”“确认”。官方 Gesture Recognizer 支持静态图、视频和直播流。

```python
import mediapipe as mp

BaseOptions = mp.tasks.BaseOptions
GestureRecognizer = mp.tasks.vision.GestureRecognizer
GestureRecognizerOptions = mp.tasks.vision.GestureRecognizerOptions
RunningMode = mp.tasks.vision.RunningMode

options = GestureRecognizerOptions(
    base_options=BaseOptions(model_asset_path="gesture_recognizer.task"),
    running_mode=RunningMode.IMAGE,
    num_hands=2)

with GestureRecognizer.create_from_options(options) as recognizer:
    image = mp.Image.create_from_file("thumb_up.jpg")
    result = recognizer.recognize(image)
    for hand in result.gestures:
        print(hand[0].category_name, hand[0].score)
```

逐部分解释：`model_asset_path` 指向 `.task` 模型包，`running_mode=IMAGE` 表示单张图；输出同时包含手势类别、左右手和 landmarks，后续可以接 UI 逻辑。

### 案例 2：用 Pose Landmarker 做运动姿态分析

真实场景：健身 App 想判断深蹲、俯卧撑、瑜伽姿势是否到位。Pose Landmarker 输出人体关键点和 3D world landmarks，适合做角度、节奏和动作计数。

```python
import cv2
import mediapipe as mp

BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
RunningMode = mp.tasks.vision.RunningMode

options = PoseLandmarkerOptions(
    base_options=BaseOptions(model_asset_path="pose_landmarker.task"),
    running_mode=RunningMode.VIDEO)

cap = cv2.VideoCapture("squat.mp4")
with PoseLandmarker.create_from_options(options) as landmarker:
    frame_id = 0
    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect_for_video(image, frame_id * 33)
        frame_id += 1
```

逐部分解释：`detect_for_video(image, timestamp_ms)` 需要单调递增时间戳；拿到肩、髋、膝、踝关键点后，再由业务代码计算角度和次数。

### 案例 3：用 Face Landmarker 做浏览器面部效果

真实场景：视频会议、虚拟头像、贴纸滤镜需要知道脸部轮廓、表情 blendshape 和脸部姿态矩阵。MediaPipe Web Tasks 可以直接在浏览器里跑。

```bash
npm install @mediapipe/tasks-vision
```

```ts
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);
const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: "/models/face_landmarker.task" },
  runningMode: "VIDEO",
  outputFaceBlendshapes: true,
});

const result = faceLandmarker.detectForVideo(video, performance.now());
console.log(result.faceLandmarks, result.faceBlendshapes);
```

逐部分解释：`FilesetResolver` 加载 WASM 运行时；`outputFaceBlendshapes` 输出表情系数，实时摄像头场景还要考虑 Web Worker 或降低帧率。

## 踩过的坑

1. **把 Tasks 和 Framework 混成一件事**：Tasks 是高层成品 API，Framework 是底层 graph 工具；能用 Tasks 就先别急着写 pbtxt。
2. **忘记时间戳必须递增**：视频模式依赖 timestamp 做同步和时序平滑，乱传会造成抖动、延迟或结果错位。
3. **忽略队列和节流**：实时视频里如果每帧都排队等待模型，延迟会越积越大；官方 graph 常用 `FlowLimiterCalculator` 控制在途帧。
4. **以为 Edge TPU 自动适配所有模型**：Coral 需要对应的 TFLite / Edge TPU 模型和 Bazel 编译参数，不是任意 `.task` 文件都能直接上 TPU。

## 适用 vs 不适用场景

**适用**：

- 手势、姿态、人脸、物体检测、图像分割、音频分类等端侧实时感知功能。
- 需要跨 Android、Web、Python、桌面共享相似模型和处理流程的项目。
- 对隐私、离线、低延迟敏感，希望输入数据主要留在设备本地的产品。
- 需要从 CPU 原型逐步走到 GPU、NNAPI、Core ML 或 Edge TPU 加速的团队。

**不适用**：

- 主要做模型训练、分布式训练或大规模实验管理；MediaPipe 更偏部署和推理流水线。
- 只需要一次性离线批处理，且不关心实时性、端侧和跨平台封装。
- 模型结构频繁变化、算子很冷门，还没有对应 TFLite / delegate 支持的场景。
- 想完全绕开 Google 生态、Bazel、TFLite、WASM 等工程栈的项目。

## 历史小故事（可跳过）

- **2019 年**：MediaPipe 论文把“感知流水线”正式讲成一个通用框架，同年手部实时追踪开始出圈。
- **2020 年**：Face Mesh、Iris、BlazePose、Holistic 和 Google Meet 背景能力相继出现，说明它不只服务单一 demo。
- **2021 年**：SignAll、Mirru 假肢控制等案例展示了手部追踪在辅助交流和辅助设备上的真实价值。
- **2023 年**：官方文档迁到 developers.google.com，旧 Solutions 开始转向新的 MediaPipe Solutions / Tasks 体系。

## 学到什么

- 端侧 AI 的难点常在“流水线”，不是单独一个模型文件；输入、推理、后处理和输出必须一起设计。
- 高层 Tasks 适合快速落地，底层 Framework 适合定制复杂 pipeline，两者不是替代关系。
- 实时系统宁愿丢帧也不要无限排队；用户感受到的是延迟，不是你处理了多少历史帧。
- Edge TPU / GPU / CPU 的选择要从目标设备倒推，先确认模型格式、delegate 和构建链路。

## 延伸阅读

- 官方仓库：[google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe)
- 官方入口：[MediaPipe Solutions](https://developers.google.com/mediapipe/solutions)
- Framework 概念：[Graphs](https://developers.google.com/mediapipe/framework/framework_concepts/graphs)
- Edge TPU 示例：[Coral Support](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/examples/coral)
- [[opencv]] —— MediaPipe 桌面示例常用 OpenCV 读写摄像头和视频。

## 关联

- [[tensorflow]] —— MediaPipe 早期图像模型和 TFLite 生态与 TensorFlow 联系很深。
- [[opencv]] —— 很多桌面 pipeline 用它做视频读写、颜色转换和调试窗口。
- [[esp-dl]] —— 同样关注端侧推理，但 ESP-DL 更贴近 ESP32 微控制器。
- [[pytorch]] —— 训练端常见框架，部署到 MediaPipe 前通常要先转换模型格式。
- [[keras]] —— 训练和导出轻量模型时常见，最终部署仍要考虑 TFLite 兼容性。
- [[jax]] —— Google 机器学习生态的另一块拼图，偏研究和数值计算，MediaPipe 偏应用部署。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dlib]] —— dlib — C++ 机器学习 / CV 工具箱
- [[insightface]] —— InsightFace — 人脸识别 / 检测 SOTA 工具箱
